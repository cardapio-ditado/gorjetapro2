/*
  # Corrigir Importação - Usar Semana Correta pela Data de Vencimento  ## Descrição
  Quando uma conta futura é importada, ela estava sendo associada à semana informada
  manualmente, mas deveria ser associada automaticamente à semana que contém a data
  de vencimento da conta.
  
  ## Problema
  - Despesa importada com vencimento 10/03 (semana 9-15 março)
  - Estava sendo associada à semana atual (2-8 março)
  - Por isso não aparecia consumindo saldo na visualização de semanas futuras
  
  ## Solução
  Modificar a função para:
  1. Calcular início da semana baseado na data de vencimento
  2. Buscar semana correspondente a essa data
  3. Se não existir, criar automaticamente
  4. Associar despesa à semana correta
*/

-- Função auxiliar para calcular início da semana (segunda-feira)
CREATE OR REPLACE FUNCTION calcular_inicio_semana(data date)
RETURNS date AS $$
DECLARE
  dia_semana int;
  data_inicio date;
BEGIN
  -- Extrair dia da semana (0=domingo, 1=segunda, ..., 6=sábado)
  dia_semana := EXTRACT(DOW FROM data);
  
  -- Calcular quantos dias voltar para chegar à segunda-feira
  -- Se domingo (0), voltar 6 dias; se segunda (1), não voltar; se terça (2), voltar 1 dia, etc.
  IF dia_semana = 0 THEN
    data_inicio := data - INTERVAL '6 days';
  ELSE
    data_inicio := data - INTERVAL '1 day' * (dia_semana - 1);
  END IF;
  
  RETURN data_inicio::date;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Recriar função de importação com lógica correta
CREATE OR REPLACE FUNCTION importar_conta_futura_como_previsao(
  p_conta_pagar_id uuid,
  p_semana_id uuid DEFAULT NULL, -- Agora é opcional
  p_data_pagamento_prevista date DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_conta record;
  v_semana record;
  v_despesa_id uuid;
  v_categoria_id uuid;
  v_fornecedor_nome text;
  v_data_inicio_semana date;
  v_semana_calculada_id uuid;
BEGIN
  -- Buscar conta a pagar
  SELECT cp.*, f.nome as fornecedor_nome INTO v_conta
  FROM contas_pagar cp
  LEFT JOIN fornecedores f ON f.id = cp.fornecedor_id
  WHERE cp.id = p_conta_pagar_id
    AND cp.status IN ('em_aberto', 'parcialmente_pago')
    AND cp.data_vencimento > CURRENT_DATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta não encontrada ou não é futura (vencimento deve ser > hoje)';
  END IF;

  -- Verificar se já foi importada
  IF EXISTS (
    SELECT 1 FROM visao_estrategica_despesas 
    WHERE conta_pagar_id = p_conta_pagar_id 
    AND status = 'ativa'
  ) THEN
    RAISE EXCEPTION 'Esta conta já foi importada como previsão';
  END IF;

  -- Calcular semana correta baseada na data de vencimento
  v_data_inicio_semana := calcular_inicio_semana(v_conta.data_vencimento);
  
  -- Buscar semana correspondente
  SELECT id INTO v_semana_calculada_id
  FROM visao_estrategica_semanas
  WHERE data_inicio = v_data_inicio_semana;
  
  -- Se semana não existe, criar automaticamente
  IF v_semana_calculada_id IS NULL THEN
    -- Buscar faturamento da última semana criada para usar como base
    DECLARE
      v_ultimo_faturamento numeric;
    BEGIN
      SELECT faturamento INTO v_ultimo_faturamento
      FROM visao_estrategica_semanas
      ORDER BY data_inicio DESC
      LIMIT 1;
      
      -- Se não há semanas, usar valor padrão
      v_ultimo_faturamento := COALESCE(v_ultimo_faturamento, 100000);
      
      -- Criar nova semana
      INSERT INTO visao_estrategica_semanas (data_inicio, faturamento)
      VALUES (v_data_inicio_semana, v_ultimo_faturamento)
      RETURNING id INTO v_semana_calculada_id;
    END;
  END IF;

  -- Usar categoria da conta ou categoria pai se for subcategoria
  SELECT COALESCE(cf.categoria_pai_id, v_conta.categoria_id)
  INTO v_categoria_id
  FROM categorias_financeiras cf
  WHERE cf.id = v_conta.categoria_id;

  -- Se não encontrou categoria pai, usar a própria categoria
  v_categoria_id := COALESCE(v_categoria_id, v_conta.categoria_id);

  -- Criar despesa prevista na semana CORRETA (calculada pela data de vencimento)
  INSERT INTO visao_estrategica_despesas (
    semana_id,
    fornecedor,
    valor,
    categoria_financeira_id,
    descricao,
    data_vencimento,
    data_pagamento_prevista,
    tipo_lancamento,
    conta_pagar_id,
    status
  ) VALUES (
    v_semana_calculada_id, -- Usar semana calculada, não a informada manualmente
    v_conta.fornecedor_nome,
    v_conta.valor_total - COALESCE(v_conta.valor_pago, 0), -- Usar saldo restante
    v_categoria_id,
    v_conta.descricao,
    v_conta.data_vencimento,
    COALESCE(p_data_pagamento_prevista, v_conta.data_vencimento),
    'previsao',
    p_conta_pagar_id,
    'ativa'
  ) RETURNING id INTO v_despesa_id;

  -- Buscar dados da semana para retornar
  SELECT * INTO v_semana
  FROM visao_estrategica_semanas
  WHERE id = v_semana_calculada_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', format('Conta futura importada para semana de %s', to_char(v_semana.data_inicio, 'DD/MM/YYYY')),
    'despesa_id', v_despesa_id,
    'conta_pagar_id', p_conta_pagar_id,
    'semana_id', v_semana_calculada_id,
    'semana_data_inicio', v_semana.data_inicio,
    'semana_criada_automaticamente', (p_semana_id IS NULL OR p_semana_id != v_semana_calculada_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permissões
GRANT EXECUTE ON FUNCTION calcular_inicio_semana TO authenticated, anon;
GRANT EXECUTE ON FUNCTION importar_conta_futura_como_previsao TO authenticated, anon;

-- Comentários
COMMENT ON FUNCTION calcular_inicio_semana IS 'Calcula o início da semana (segunda-feira) para uma data';
COMMENT ON FUNCTION importar_conta_futura_como_previsao IS 'Importa conta futura associando automaticamente à semana correta baseada na data de vencimento. Cria a semana automaticamente se não existir.';
