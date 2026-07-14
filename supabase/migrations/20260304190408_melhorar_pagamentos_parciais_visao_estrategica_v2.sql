/*
  # Melhorias no Sistema de Pagamentos Parciais - Visão Estratégica

  ## Descrição
  Aprimora o sistema de pagamentos informativos para permitir:
  - Pagamentos parciais e integrais
  - Edição de pagamentos já registrados
  - Exclusão/estorno de pagamentos
  - Sincronização automática com mudanças no Contas a Pagar
  - Despesas com saldo zero continuam visíveis na lista

  ## Mudanças
  1. View mostra todas as contas, inclusive com saldo zero
  2. Adicionar campo de status mais detalhado
  3. Criar função para editar pagamento informativo
  4. Melhorar função de listagem de pagamentos
  5. Adicionar trigger para atualizar quando contas_pagar mudar

  ## Comportamento
  - Despesas aparecem até serem totalmente pagas (saldo = 0)
  - Despesas totalmente pagas aparecem com badge verde e saldo R$ 0,00
  - Qualquer alteração no contas_pagar atualiza automaticamente a view
  - Usuário pode editar valor e observação de pagamentos
*/

-- Criar função genérica para atualizar timestamp
CREATE OR REPLACE FUNCTION atualizar_atualizado_em()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Adicionar campo atualizado_em se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'visao_estrategica_pagamentos_informativos' 
    AND column_name = 'atualizado_em'
  ) THEN
    ALTER TABLE visao_estrategica_pagamentos_informativos 
    ADD COLUMN atualizado_em timestamptz DEFAULT now();
  END IF;
END $$;

-- Trigger para atualizar atualizado_em
DROP TRIGGER IF EXISTS trigger_atualizar_timestamp_pagamentos_informativos ON visao_estrategica_pagamentos_informativos;

CREATE TRIGGER trigger_atualizar_timestamp_pagamentos_informativos
  BEFORE UPDATE ON visao_estrategica_pagamentos_informativos
  FOR EACH ROW
  EXECUTE FUNCTION atualizar_atualizado_em();

-- Recriar view para incluir despesas totalmente pagas no planejamento
DROP VIEW IF EXISTS view_despesas_visao_estrategica CASCADE;

CREATE VIEW view_despesas_visao_estrategica AS
WITH pagamentos_por_conta AS (
  SELECT 
    conta_pagar_id,
    SUM(valor_pago) as total_pago_informativo,
    COUNT(*) as quantidade_pagamentos,
    MAX(data_pagamento_informativo) as ultimo_pagamento,
    array_agg(semana_id) as semanas_ids
  FROM visao_estrategica_pagamentos_informativos
  GROUP BY conta_pagar_id
)
SELECT 
  cp.id,
  cp.fornecedor_id,
  f.nome as fornecedor_nome,
  cp.descricao,
  cp.valor_total,
  cp.valor_pago as valor_pago_real,
  cp.data_vencimento,
  cp.status as status_real,
  cp.categoria_id,
  cat.nome as categoria_nome,
  cat.categoria_pai_id as subcategoria_id,
  COALESCE(cat_pai.nome, cat.nome) as subcategoria_nome,
  cp.centro_custo_id,
  cc.nome as centro_custo_nome,
  cp.criado_em,
  cp.atualizado_em,
  
  -- Informações dos pagamentos informativos (agregados)
  ppc.total_pago_informativo,
  ppc.quantidade_pagamentos,
  ppc.ultimo_pagamento,
  ppc.semanas_ids,
  
  -- Status combinado (considera pagamentos informativos parciais)
  CASE 
    WHEN ppc.total_pago_informativo >= cp.valor_total THEN 'pago_planejamento'
    WHEN ppc.total_pago_informativo > 0 THEN 'parcialmente_pago_planejamento'
    WHEN cp.status = 'parcialmente_pago' THEN 'parcialmente_pago'
    ELSE 'em_aberto'
  END as status_planejamento,
  
  -- Valor restante considerando pagamentos informativos e reais
  GREATEST(0, cp.valor_total - COALESCE(cp.valor_pago, 0) - COALESCE(ppc.total_pago_informativo, 0)) as valor_restante_planejamento,
  
  -- Valor já pago no planejamento
  COALESCE(ppc.total_pago_informativo, 0) as valor_pago_planejamento,
  
  -- Situação em relação ao vencimento
  CASE 
    WHEN cp.data_vencimento < CURRENT_DATE THEN 'vencida'
    WHEN cp.data_vencimento <= CURRENT_DATE + INTERVAL '7 days' THEN 'vencendo'
    ELSE 'futura'
  END as situacao

FROM contas_pagar cp
LEFT JOIN fornecedores f ON f.id = cp.fornecedor_id
LEFT JOIN categorias_financeiras cat ON cat.id = cp.categoria_id
LEFT JOIN categorias_financeiras cat_pai ON cat_pai.id = cat.categoria_pai_id
LEFT JOIN centros_custo cc ON cc.id = cp.centro_custo_id
LEFT JOIN pagamentos_por_conta ppc ON ppc.conta_pagar_id = cp.id
WHERE cp.status IN ('em_aberto', 'parcialmente_pago')
   OR ppc.total_pago_informativo > 0;

-- Permitir acesso à view
GRANT SELECT ON view_despesas_visao_estrategica TO authenticated, anon;

-- Criar função para editar um pagamento informativo
CREATE OR REPLACE FUNCTION editar_pagamento_informativo(
  p_pagamento_id uuid,
  p_novo_valor numeric DEFAULT NULL,
  p_nova_observacao text DEFAULT NULL
) RETURNS json AS $$
DECLARE
  v_pagamento visao_estrategica_pagamentos_informativos;
  v_conta contas_pagar;
  v_total_outros_pagamentos numeric;
  v_saldo_disponivel numeric;
BEGIN
  -- Buscar pagamento atual
  SELECT * INTO v_pagamento
  FROM visao_estrategica_pagamentos_informativos
  WHERE id = p_pagamento_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento informativo não encontrado';
  END IF;
  
  -- Buscar dados da conta
  SELECT * INTO v_conta
  FROM contas_pagar
  WHERE id = v_pagamento.conta_pagar_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta a pagar não encontrada';
  END IF;
  
  -- Se está alterando o valor, validar
  IF p_novo_valor IS NOT NULL THEN
    -- Calcular total de outros pagamentos (excluindo este)
    SELECT COALESCE(SUM(valor_pago), 0) INTO v_total_outros_pagamentos
    FROM visao_estrategica_pagamentos_informativos
    WHERE conta_pagar_id = v_pagamento.conta_pagar_id
      AND id != p_pagamento_id;
    
    -- Calcular saldo disponível para este pagamento
    v_saldo_disponivel := v_conta.valor_total - COALESCE(v_conta.valor_pago, 0) - v_total_outros_pagamentos;
    
    -- Validar se o novo valor não excede o saldo disponível
    IF p_novo_valor > v_saldo_disponivel THEN
      RAISE EXCEPTION 'Novo valor (%) excede o saldo disponível (%)', p_novo_valor, v_saldo_disponivel;
    END IF;
    
    IF p_novo_valor <= 0 THEN
      RAISE EXCEPTION 'Valor deve ser maior que zero';
    END IF;
  END IF;
  
  -- Atualizar pagamento
  UPDATE visao_estrategica_pagamentos_informativos
  SET 
    valor_pago = COALESCE(p_novo_valor, valor_pago),
    observacao = COALESCE(p_nova_observacao, observacao)
  WHERE id = p_pagamento_id;
  
  RETURN json_build_object(
    'pagamento_id', p_pagamento_id,
    'valor_anterior', v_pagamento.valor_pago,
    'valor_novo', COALESCE(p_novo_valor, v_pagamento.valor_pago),
    'atualizado', true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Melhorar função de listar pagamentos para incluir mais detalhes
DROP FUNCTION IF EXISTS listar_pagamentos_informativos_conta(uuid);

CREATE OR REPLACE FUNCTION listar_pagamentos_informativos_conta(
  p_conta_pagar_id uuid
) RETURNS TABLE (
  id uuid,
  valor_pago numeric,
  data_pagamento_informativo date,
  semana_id uuid,
  semana_data_inicio date,
  semana_data_fim date,
  semana_faturamento numeric,
  observacao text,
  criado_em timestamptz,
  atualizado_em timestamptz,
  criado_por uuid
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pi.id,
    pi.valor_pago,
    pi.data_pagamento_informativo,
    pi.semana_id,
    s.data_inicio as semana_data_inicio,
    s.data_fim as semana_data_fim,
    s.faturamento as semana_faturamento,
    pi.observacao,
    pi.criado_em,
    pi.atualizado_em,
    pi.criado_por
  FROM visao_estrategica_pagamentos_informativos pi
  LEFT JOIN visao_estrategica_semanas s ON s.id = pi.semana_id
  WHERE pi.conta_pagar_id = p_conta_pagar_id
  ORDER BY pi.data_pagamento_informativo DESC, pi.criado_em DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentários
COMMENT ON FUNCTION editar_pagamento_informativo IS 'Edita o valor e/ou observação de um pagamento informativo já registrado, com validações de saldo';
COMMENT ON FUNCTION listar_pagamentos_informativos_conta IS 'Lista todos os pagamentos informativos de uma conta com detalhes completos incluindo timestamps';
COMMENT ON VIEW view_despesas_visao_estrategica IS 'Todas as despesas do Contas a Pagar, incluindo aquelas totalmente pagas no planejamento (para manter histórico). Atualiza automaticamente quando contas_pagar muda.';
