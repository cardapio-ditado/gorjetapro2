/*
  # Corrigir Importação - Preservar Subcategoria Original
  
  ## Descrição
  Quando uma conta futura é importada, se ela tiver uma subcategoria (categoria filha),
  essa informação deve ser preservada na despesa importada. Atualmente estava convertendo
  para categoria pai e perdendo a informação da subcategoria.
  
  ## Problema
  Conta com categoria "Chopp e Cervejas" (subcategoria de "CMV - Bebidas") era importada como:
  - categoria: "CMV - Bebidas"
  - subcategoria: null
  
  ## Solução
  Importar preservando:
  - categoria: "CMV - Bebidas" (categoria pai)
  - subcategoria: "Chopp e Cervejas" (categoria original)
*/

CREATE OR REPLACE FUNCTION importar_conta_futura_como_previsao(
  p_conta_pagar_id uuid,
  p_semana_id uuid DEFAULT NULL,
  p_data_pagamento_prevista date DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_conta record;
  v_semana record;
  v_despesa_id uuid;
  v_categoria_id uuid;
  v_subcategoria_id uuid;
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
    DECLARE
      v_ultimo_faturamento numeric;
    BEGIN
      SELECT faturamento INTO v_ultimo_faturamento
      FROM visao_estrategica_semanas
      ORDER BY data_inicio DESC
      LIMIT 1;
      
      v_ultimo_faturamento := COALESCE(v_ultimo_faturamento, 100000);
      
      INSERT INTO visao_estrategica_semanas (data_inicio, faturamento)
      VALUES (v_data_inicio_semana, v_ultimo_faturamento)
      RETURNING id INTO v_semana_calculada_id;
    END;
  END IF;

  -- Determinar categoria e subcategoria
  -- Se a categoria da conta é uma subcategoria (tem categoria_pai_id), usar categoria pai e manter a subcategoria
  -- Se é uma categoria principal (não tem categoria_pai_id), usar ela como categoria principal
  SELECT 
    CASE 
      WHEN cf.categoria_pai_id IS NOT NULL THEN cf.categoria_pai_id
      ELSE v_conta.categoria_id
    END,
    CASE 
      WHEN cf.categoria_pai_id IS NOT NULL THEN v_conta.categoria_id
      ELSE NULL
    END
  INTO v_categoria_id, v_subcategoria_id
  FROM categorias_financeiras cf
  WHERE cf.id = v_conta.categoria_id;

  -- Se não encontrou a categoria, usar a da conta sem subcategoria
  IF v_categoria_id IS NULL THEN
    v_categoria_id := v_conta.categoria_id;
    v_subcategoria_id := NULL;
  END IF;

  -- Criar despesa prevista na semana CORRETA (calculada pela data de vencimento)
  INSERT INTO visao_estrategica_despesas (
    semana_id,
    fornecedor,
    valor,
    categoria_financeira_id,
    subcategoria_financeira_id,
    descricao,
    data_vencimento,
    data_pagamento_prevista,
    tipo_lancamento,
    conta_pagar_id,
    status
  ) VALUES (
    v_semana_calculada_id,
    v_conta.fornecedor_nome,
    v_conta.valor_total - COALESCE(v_conta.valor_pago, 0),
    v_categoria_id,
    v_subcategoria_id,
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
    'categoria_id', v_categoria_id,
    'subcategoria_id', v_subcategoria_id,
    'semana_criada_automaticamente', (p_semana_id IS NULL OR p_semana_id != v_semana_calculada_id)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atualizar despesa já importada para ter a subcategoria correta
UPDATE visao_estrategica_despesas
SET subcategoria_financeira_id = '7b0c0da5-8da4-48dc-84a7-a8ffcdd1aa5f'
WHERE conta_pagar_id = '344ed4cc-872b-4ecb-af5b-deb7ba5e5122'
  AND status = 'ativa';

COMMENT ON FUNCTION importar_conta_futura_como_previsao IS 'Importa conta futura preservando categoria pai e subcategoria original quando aplicável';
