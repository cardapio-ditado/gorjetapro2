/*
  # Ficha Financeira do Fornecedor - Views e Melhorias

  1. Views Consolidadas
    - View para extrato completo do fornecedor
    - View para indicadores por fornecedor
    - View para histórico de pagamentos

  2. Melhorias nas Views Existentes
    - Adicionar informações de último pagamento
    - Melhorar performance com índices

  3. Funções Auxiliares
    - Função para calcular indicadores do fornecedor
    - Função para gerar extrato consolidado
*/

-- View consolidada para ficha financeira do fornecedor
CREATE OR REPLACE VIEW vw_ficha_financeira_fornecedor AS
WITH 
contas_fornecedor AS (
  SELECT 
    f.id as fornecedor_id,
    f.nome as fornecedor_nome,
    f.cnpj,
    f.telefone,
    f.email,
    f.responsavel,
    cp.id as conta_id,
    cp.data_emissao,
    cp.data_vencimento,
    cp.numero_documento,
    cp.descricao,
    cp.valor_total,
    cp.valor_pago,
    cp.saldo_restante,
    cp.status,
    cat.nome as categoria_nome,
    cc.nome as centro_custo_nome,
    fp.nome as forma_pagamento_nome,
    CASE 
      WHEN cp.data_vencimento < CURRENT_DATE AND cp.status IN ('em_aberto', 'parcialmente_pago') THEN true
      ELSE false
    END as esta_vencida,
    (CURRENT_DATE - cp.data_vencimento) as dias_vencimento
  FROM fornecedores f
  LEFT JOIN contas_pagar cp ON f.id = cp.fornecedor_id
  LEFT JOIN vw_categoria_tree cat ON cp.categoria_id = cat.id
  LEFT JOIN centros_custo cc ON cp.centro_custo_id = cc.id
  LEFT JOIN formas_pagamento fp ON cp.forma_pagamento_id = fp.id
),
ultimo_pagamento AS (
  SELECT 
    cp.id as conta_id,
    MAX(pc.data_pagamento) as ultimo_pagamento_data
  FROM contas_pagar cp
  LEFT JOIN pagamentos_contas pc ON cp.id = pc.conta_pagar_id
  GROUP BY cp.id
)
SELECT 
  cf.*,
  up.ultimo_pagamento_data
FROM contas_fornecedor cf
LEFT JOIN ultimo_pagamento up ON cf.conta_id = up.conta_id;

-- View para indicadores por fornecedor
CREATE OR REPLACE VIEW vw_indicadores_fornecedor AS
SELECT 
  f.id as fornecedor_id,
  f.nome as fornecedor_nome,
  COUNT(cp.id) as total_contas,
  COALESCE(SUM(cp.valor_total), 0) as total_comprado,
  COALESCE(SUM(cp.valor_pago), 0) as total_pago,
  COALESCE(SUM(cp.saldo_restante), 0) as saldo_pendente,
  COUNT(CASE WHEN cp.status IN ('em_aberto', 'parcialmente_pago') AND cp.data_vencimento < CURRENT_DATE THEN 1 END) as contas_vencidas,
  COALESCE(SUM(CASE WHEN cp.status IN ('em_aberto', 'parcialmente_pago') AND cp.data_vencimento < CURRENT_DATE THEN cp.saldo_restante ELSE 0 END), 0) as valor_vencido,
  CASE 
    WHEN COUNT(cp.id) > 0 THEN COALESCE(SUM(cp.valor_total), 0) / COUNT(cp.id)
    ELSE 0
  END as ticket_medio,
  MAX(cp.data_emissao) as ultima_compra,
  MAX(pc.data_pagamento) as ultimo_pagamento
FROM fornecedores f
LEFT JOIN contas_pagar cp ON f.id = cp.fornecedor_id
LEFT JOIN pagamentos_contas pc ON cp.id = pc.conta_pagar_id
WHERE f.status = 'ativo'
GROUP BY f.id, f.nome;

-- View para histórico de pagamentos por fornecedor
CREATE OR REPLACE VIEW vw_pagamentos_fornecedor AS
SELECT 
  f.id as fornecedor_id,
  f.nome as fornecedor_nome,
  cp.id as conta_pagar_id,
  cp.descricao as conta_descricao,
  pc.id as pagamento_id,
  pc.data_pagamento,
  pc.valor_pagamento,
  fp.nome as forma_pagamento_nome,
  bc.banco as conta_bancaria,
  pc.numero_comprovante,
  pc.observacoes,
  fc.id as fluxo_caixa_id
FROM fornecedores f
INNER JOIN contas_pagar cp ON f.id = cp.fornecedor_id
INNER JOIN pagamentos_contas pc ON cp.id = pc.conta_pagar_id
LEFT JOIN formas_pagamento fp ON pc.forma_pagamento_id = fp.id
LEFT JOIN bancos_contas bc ON pc.conta_bancaria_id = bc.id
LEFT JOIN fluxo_caixa fc ON pc.id = fc.pagamento_id
ORDER BY f.nome, pc.data_pagamento DESC;

-- Função para obter extrato consolidado do fornecedor
CREATE OR REPLACE FUNCTION obter_extrato_fornecedor(
  p_fornecedor_id uuid,
  p_data_inicial date DEFAULT NULL,
  p_data_final date DEFAULT NULL
)
RETURNS TABLE (
  tipo text,
  data date,
  descricao text,
  documento text,
  valor_total numeric,
  valor_pago numeric,
  saldo_restante numeric,
  status text,
  categoria text,
  centro_custo text,
  observacoes text
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    'conta_pagar'::text as tipo,
    cp.data_emissao as data,
    cp.descricao,
    cp.numero_documento as documento,
    cp.valor_total,
    cp.valor_pago,
    cp.saldo_restante,
    cp.status,
    cat.nome as categoria,
    cc.nome as centro_custo,
    cp.observacoes
  FROM contas_pagar cp
  LEFT JOIN vw_categoria_tree cat ON cp.categoria_id = cat.id
  LEFT JOIN centros_custo cc ON cp.centro_custo_id = cc.id
  WHERE cp.fornecedor_id = p_fornecedor_id
    AND (p_data_inicial IS NULL OR cp.data_emissao >= p_data_inicial)
    AND (p_data_final IS NULL OR cp.data_emissao <= p_data_final)
  
  UNION ALL
  
  SELECT 
    'pagamento'::text as tipo,
    pc.data_pagamento as data,
    'Pagamento: ' || cp.descricao as descricao,
    pc.numero_comprovante as documento,
    0 as valor_total,
    pc.valor_pagamento as valor_pago,
    0 as saldo_restante,
    'pago'::text as status,
    cat.nome as categoria,
    cc.nome as centro_custo,
    pc.observacoes
  FROM pagamentos_contas pc
  INNER JOIN contas_pagar cp ON pc.conta_pagar_id = cp.id
  LEFT JOIN vw_categoria_tree cat ON cp.categoria_id = cat.id
  LEFT JOIN centros_custo cc ON cp.centro_custo_id = cc.id
  WHERE cp.fornecedor_id = p_fornecedor_id
    AND (p_data_inicial IS NULL OR pc.data_pagamento >= p_data_inicial)
    AND (p_data_final IS NULL OR pc.data_pagamento <= p_data_final)
  
  ORDER BY data DESC, tipo;
END;
$$ LANGUAGE plpgsql;

-- Função para calcular indicadores do fornecedor em período específico
CREATE OR REPLACE FUNCTION calcular_indicadores_fornecedor_periodo(
  p_fornecedor_id uuid,
  p_data_inicial date,
  p_data_final date
)
RETURNS TABLE (
  total_comprado numeric,
  total_pago numeric,
  saldo_pendente numeric,
  total_contas bigint,
  contas_vencidas bigint,
  valor_vencido numeric,
  ticket_medio numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COALESCE(SUM(cp.valor_total), 0) as total_comprado,
    COALESCE(SUM(cp.valor_pago), 0) as total_pago,
    COALESCE(SUM(cp.saldo_restante), 0) as saldo_pendente,
    COUNT(cp.id) as total_contas,
    COUNT(CASE WHEN cp.status IN ('em_aberto', 'parcialmente_pago') AND cp.data_vencimento < CURRENT_DATE THEN 1 END) as contas_vencidas,
    COALESCE(SUM(CASE WHEN cp.status IN ('em_aberto', 'parcialmente_pago') AND cp.data_vencimento < CURRENT_DATE THEN cp.saldo_restante ELSE 0 END), 0) as valor_vencido,
    CASE 
      WHEN COUNT(cp.id) > 0 THEN COALESCE(SUM(cp.valor_total), 0) / COUNT(cp.id)
      ELSE 0
    END as ticket_medio
  FROM contas_pagar cp
  WHERE cp.fornecedor_id = p_fornecedor_id
    AND cp.data_emissao >= p_data_inicial
    AND cp.data_emissao <= p_data_final;
END;
$$ LANGUAGE plpgsql;

-- Criar índices para melhorar performance das consultas
CREATE INDEX IF NOT EXISTS idx_contas_pagar_fornecedor_data ON contas_pagar(fornecedor_id, data_emissao);
CREATE INDEX IF NOT EXISTS idx_pagamentos_contas_data ON pagamentos_contas(data_pagamento);
CREATE INDEX IF NOT EXISTS idx_fluxo_caixa_pagamento_origem ON fluxo_caixa(pagamento_id, origem);

-- View para ranking de fornecedores
CREATE OR REPLACE VIEW vw_ranking_fornecedores AS
SELECT 
  f.id,
  f.nome,
  f.cnpj,
  f.telefone,
  f.email,
  COALESCE(SUM(cp.valor_total), 0) as total_compras,
  COALESCE(SUM(cp.valor_pago), 0) as total_pago,
  COALESCE(SUM(cp.saldo_restante), 0) as saldo_pendente,
  COUNT(cp.id) as total_contas,
  COUNT(CASE WHEN cp.status IN ('em_aberto', 'parcialmente_pago') AND cp.data_vencimento < CURRENT_DATE THEN 1 END) as contas_vencidas,
  CASE 
    WHEN COUNT(cp.id) > 0 THEN COALESCE(SUM(cp.valor_total), 0) / COUNT(cp.id)
    ELSE 0
  END as ticket_medio,
  MAX(cp.data_emissao) as ultima_compra,
  CASE 
    WHEN COALESCE(SUM(cp.valor_total), 0) = 0 THEN 0
    ELSE (COALESCE(SUM(cp.valor_pago), 0) / COALESCE(SUM(cp.valor_total), 1)) * 100
  END as percentual_pago
FROM fornecedores f
LEFT JOIN contas_pagar cp ON f.id = cp.fornecedor_id
WHERE f.status = 'ativo'
GROUP BY f.id, f.nome, f.cnpj, f.telefone, f.email
ORDER BY total_compras DESC;

-- Comentários para documentação
COMMENT ON VIEW vw_ficha_financeira_fornecedor IS 'View consolidada com todas as informações financeiras do fornecedor incluindo último pagamento';
COMMENT ON VIEW vw_indicadores_fornecedor IS 'Indicadores financeiros consolidados por fornecedor';
COMMENT ON VIEW vw_pagamentos_fornecedor IS 'Histórico completo de pagamentos por fornecedor com vinculação ao fluxo de caixa';
COMMENT ON VIEW vw_ranking_fornecedores IS 'Ranking de fornecedores por volume de compras e indicadores de pagamento';
COMMENT ON FUNCTION obter_extrato_fornecedor IS 'Função para obter extrato consolidado de contas e pagamentos do fornecedor em período específico';
COMMENT ON FUNCTION calcular_indicadores_fornecedor_periodo IS 'Função para calcular indicadores financeiros do fornecedor em período específico';