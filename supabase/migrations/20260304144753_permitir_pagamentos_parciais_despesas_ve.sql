/*
  # Permitir Pagamentos Parciais nas Despesas - Visão Estratégica

  ## Descrição
  Permite registrar múltiplos pagamentos parciais para a mesma conta na Visão Estratégica,
  mantendo o saldo restante visível na lista até que seja totalmente pago

  ## Mudanças
  1. Remover UNIQUE constraint de conta_pagar_id + semana_id
  2. Permitir múltiplos pagamentos informativos para a mesma conta
  3. Atualizar view para somar todos os pagamentos parciais
  4. Criar função para calcular total pago e saldo restante

  ## Lógica
  - Cada pagamento informativo é um registro independente
  - View soma todos os pagamentos informativos de uma conta
  - Conta só é marcada como "paga_planejamento" quando soma >= valor_total
*/

-- Remover constraint UNIQUE que impede múltiplos pagamentos
ALTER TABLE visao_estrategica_pagamentos_informativos 
  DROP CONSTRAINT IF EXISTS visao_estrategica_pagamentos_informativos_conta_pagar_id_sem_key;

-- Recriar view de despesas com suporte a pagamentos parciais
DROP VIEW IF EXISTS view_despesas_visao_estrategica;

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
  
  -- Valor restante considerando pagamentos informativos
  CASE 
    WHEN ppc.total_pago_informativo >= cp.valor_total THEN 0
    ELSE (cp.valor_total - COALESCE(cp.valor_pago, 0) - COALESCE(ppc.total_pago_informativo, 0))
  END as valor_restante_planejamento,
  
  -- Valor já pago no planejamento
  COALESCE(ppc.total_pago_informativo, 0) as valor_pago_planejamento

FROM contas_pagar cp
LEFT JOIN fornecedores f ON f.id = cp.fornecedor_id
LEFT JOIN categorias_financeiras cat ON cat.id = cp.categoria_id
LEFT JOIN categorias_financeiras cat_pai ON cat_pai.id = cat.categoria_pai_id
LEFT JOIN centros_custo cc ON cc.id = cp.centro_custo_id
LEFT JOIN pagamentos_por_conta ppc ON ppc.conta_pagar_id = cp.id
WHERE cp.status IN ('em_aberto', 'parcialmente_pago');

-- Permitir acesso à view
GRANT SELECT ON view_despesas_visao_estrategica TO authenticated, anon;

-- Criar função para registrar pagamento parcial
CREATE OR REPLACE FUNCTION registrar_pagamento_parcial_ve(
  p_conta_pagar_id uuid,
  p_semana_id uuid,
  p_valor_pago numeric,
  p_observacao text DEFAULT NULL
) RETURNS json AS $$
DECLARE
  v_conta contas_pagar;
  v_total_pago_informativo numeric;
  v_saldo_restante numeric;
  v_pagamento_id uuid;
BEGIN
  -- Buscar dados da conta
  SELECT * INTO v_conta
  FROM contas_pagar
  WHERE id = p_conta_pagar_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta a pagar não encontrada';
  END IF;
  
  -- Calcular total já pago no planejamento
  SELECT COALESCE(SUM(valor_pago), 0) INTO v_total_pago_informativo
  FROM visao_estrategica_pagamentos_informativos
  WHERE conta_pagar_id = p_conta_pagar_id;
  
  -- Calcular saldo restante
  v_saldo_restante := v_conta.valor_total - COALESCE(v_conta.valor_pago, 0) - v_total_pago_informativo;
  
  -- Validar se o valor não excede o saldo
  IF p_valor_pago > v_saldo_restante THEN
    RAISE EXCEPTION 'Valor do pagamento (%) excede o saldo restante (%)', p_valor_pago, v_saldo_restante;
  END IF;
  
  -- Registrar pagamento informativo
  INSERT INTO visao_estrategica_pagamentos_informativos (
    conta_pagar_id,
    semana_id,
    valor_pago,
    data_pagamento_informativo,
    observacao,
    criado_por
  ) VALUES (
    p_conta_pagar_id,
    p_semana_id,
    p_valor_pago,
    CURRENT_DATE,
    p_observacao,
    auth.uid()
  ) RETURNING id INTO v_pagamento_id;
  
  -- Retornar resultado
  RETURN json_build_object(
    'pagamento_id', v_pagamento_id,
    'total_pago_informativo', v_total_pago_informativo + p_valor_pago,
    'saldo_restante', v_saldo_restante - p_valor_pago,
    'totalmente_pago', (v_saldo_restante - p_valor_pago) <= 0
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar função para listar pagamentos de uma conta
CREATE OR REPLACE FUNCTION listar_pagamentos_informativos_conta(
  p_conta_pagar_id uuid
) RETURNS TABLE (
  id uuid,
  valor_pago numeric,
  data_pagamento_informativo date,
  semana_id uuid,
  semana_data_inicio date,
  semana_faturamento numeric,
  observacao text,
  criado_em timestamptz
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pi.id,
    pi.valor_pago,
    pi.data_pagamento_informativo,
    pi.semana_id,
    s.data_inicio as semana_data_inicio,
    s.faturamento as semana_faturamento,
    pi.observacao,
    pi.criado_em
  FROM visao_estrategica_pagamentos_informativos pi
  LEFT JOIN visao_estrategica_semanas s ON s.id = pi.semana_id
  WHERE pi.conta_pagar_id = p_conta_pagar_id
  ORDER BY pi.data_pagamento_informativo DESC, pi.criado_em DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar função para excluir um pagamento informativo específico
CREATE OR REPLACE FUNCTION excluir_pagamento_informativo(
  p_pagamento_id uuid
) RETURNS json AS $$
DECLARE
  v_pagamento visao_estrategica_pagamentos_informativos;
  v_total_restante numeric;
BEGIN
  -- Buscar pagamento
  SELECT * INTO v_pagamento
  FROM visao_estrategica_pagamentos_informativos
  WHERE id = p_pagamento_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagamento informativo não encontrado';
  END IF;
  
  -- Excluir pagamento
  DELETE FROM visao_estrategica_pagamentos_informativos
  WHERE id = p_pagamento_id;
  
  -- Calcular total restante após exclusão
  SELECT COALESCE(SUM(valor_pago), 0) INTO v_total_restante
  FROM visao_estrategica_pagamentos_informativos
  WHERE conta_pagar_id = v_pagamento.conta_pagar_id;
  
  RETURN json_build_object(
    'pagamento_excluido', true,
    'valor_estornado', v_pagamento.valor_pago,
    'total_pago_informativo_restante', v_total_restante
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentários
COMMENT ON FUNCTION registrar_pagamento_parcial_ve IS 'Registra um pagamento parcial informativo na Visão Estratégica, permitindo múltiplos pagamentos para a mesma conta';
COMMENT ON FUNCTION listar_pagamentos_informativos_conta IS 'Lista todos os pagamentos informativos registrados para uma conta específica';
COMMENT ON FUNCTION excluir_pagamento_informativo IS 'Exclui um pagamento informativo específico, permitindo correções';
COMMENT ON VIEW view_despesas_visao_estrategica IS 'Despesas PENDENTES com suporte a pagamentos parciais informativos. Soma todos os pagamentos de uma conta e calcula saldo restante.';
