/*
  # Corrigir Importação de Contas Futuras
  
  ## Descrição
  A view de contas futuras estava filtrando apenas contas com vencimento >= 30 dias.
  Usuário quer importar TODAS as contas a partir do dia seguinte.
  
  ## Mudanças
  1. Alterar view para trazer contas com vencimento >= amanhã (não mais 30+ dias)
  2. Atualizar função de importação para permitir contas a partir do dia seguinte
  
  ## Impacto
  - Usuário pode importar contas futuras com qualquer prazo (amanhã, semana, mês, etc)
  - Mais flexibilidade no planejamento
*/

-- Recriar view de contas futuras disponíveis
DROP VIEW IF EXISTS view_ve_contas_futuras_disponiveis CASCADE;

CREATE OR REPLACE VIEW view_ve_contas_futuras_disponiveis AS
SELECT 
  cp.id,
  cp.fornecedor_id,
  f.nome as fornecedor_nome,
  cp.descricao,
  cp.valor_total,
  cp.data_vencimento,
  cp.categoria_id as categoria_financeira_id,
  cf.nome as categoria_nome,
  cf.categoria_pai_id,
  cp.status,
  (cp.data_vencimento - CURRENT_DATE) as dias_ate_vencimento,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM visao_estrategica_despesas ved
      WHERE ved.conta_pagar_id = cp.id AND ved.status = 'ativa'
    ) THEN true
    ELSE false
  END as ja_importada
FROM contas_pagar cp
LEFT JOIN fornecedores f ON f.id = cp.fornecedor_id
LEFT JOIN categorias_financeiras cf ON cf.id = cp.categoria_id
WHERE 
  cp.status IN ('em_aberto', 'parcialmente_pago')
  -- ALTERADO: Trazer contas a partir do dia seguinte (não mais 30+ dias)
  AND cp.data_vencimento > CURRENT_DATE
ORDER BY cp.data_vencimento ASC;

-- Função para importar conta futura como despesa prevista
CREATE OR REPLACE FUNCTION importar_conta_futura_como_previsao(
  p_conta_pagar_id uuid,
  p_semana_id uuid,
  p_data_pagamento_prevista date DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_conta record;
  v_semana record;
  v_despesa_id uuid;
  v_categoria_id uuid;
  v_fornecedor_nome text;
BEGIN
  -- Buscar conta a pagar
  SELECT cp.*, f.nome as fornecedor_nome INTO v_conta
  FROM contas_pagar cp
  LEFT JOIN fornecedores f ON f.id = cp.fornecedor_id
  WHERE cp.id = p_conta_pagar_id
    AND cp.status IN ('em_aberto', 'parcialmente_pago')
    -- ALTERADO: Aceitar contas a partir do dia seguinte
    AND cp.data_vencimento > CURRENT_DATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta não encontrada ou não é futura (vencimento deve ser > hoje)';
  END IF;

  -- Buscar semana
  SELECT * INTO v_semana
  FROM visao_estrategica_semanas
  WHERE id = p_semana_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Semana não encontrada';
  END IF;

  -- Verificar se já foi importada
  IF EXISTS (
    SELECT 1 FROM visao_estrategica_despesas 
    WHERE conta_pagar_id = p_conta_pagar_id 
    AND status = 'ativa'
  ) THEN
    RAISE EXCEPTION 'Esta conta já foi importada como previsão';
  END IF;

  -- Usar categoria da conta ou categoria pai se for subcategoria
  SELECT COALESCE(cf.categoria_pai_id, v_conta.categoria_id)
  INTO v_categoria_id
  FROM categorias_financeiras cf
  WHERE cf.id = v_conta.categoria_id;

  -- Se não encontrou categoria pai, usar a própria categoria
  v_categoria_id := COALESCE(v_categoria_id, v_conta.categoria_id);

  -- Criar despesa prevista
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
    p_semana_id,
    v_conta.fornecedor_nome,
    v_conta.valor_total,
    v_categoria_id,
    v_conta.descricao,
    v_conta.data_vencimento,
    COALESCE(p_data_pagamento_prevista, v_conta.data_vencimento),
    'previsao',
    p_conta_pagar_id,
    'ativa'
  ) RETURNING id INTO v_despesa_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Conta futura importada como previsão',
    'despesa_id', v_despesa_id,
    'conta_pagar_id', p_conta_pagar_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Permissões
GRANT SELECT ON view_ve_contas_futuras_disponiveis TO authenticated, anon;
GRANT EXECUTE ON FUNCTION importar_conta_futura_como_previsao TO authenticated, anon;

-- Comentários
COMMENT ON VIEW view_ve_contas_futuras_disponiveis IS 'Lista contas a pagar com vencimento futuro (> hoje) para importação como previsão';
COMMENT ON FUNCTION importar_conta_futura_como_previsao IS 'Importa uma conta a pagar futura (vencimento > hoje) como despesa prevista na Visão Estratégica';
