/*
  # Integração Contas a Pagar com Visão Estratégica
  
  ## Descrição
  Cria views e funções para integrar dados de contas a pagar
  com o módulo de Visão Estratégica
  
  ## Views Criadas
  1. v_contas_vencidas_por_categoria - Contas vencidas agrupadas por categoria
  2. v_contas_futuras_por_categoria - Contas futuras agrupadas por categoria
  3. v_resumo_contas_categoria - Resumo completo por categoria
  
  ## Funcionalidades
  - Separação de contas vencidas e futuras por categoria
  - Cálculos de totais por categoria
  - Integração com categorias financeiras
*/

-- View: Contas Vencidas agrupadas por categoria
CREATE OR REPLACE VIEW v_contas_vencidas_por_categoria AS
SELECT 
  cf.id as categoria_id,
  cf.nome as categoria_nome,
  cf.tipo as categoria_tipo,
  COUNT(cp.id) as quantidade_contas,
  COALESCE(SUM(cp.saldo_restante), 0) as total_vencido,
  COALESCE(SUM(cp.valor_total), 0) as valor_total_original,
  COALESCE(SUM(cp.valor_pago), 0) as valor_ja_pago,
  MIN(cp.data_vencimento) as vencimento_mais_antigo,
  MAX(cp.data_vencimento) as vencimento_mais_recente
FROM categorias_financeiras cf
LEFT JOIN contas_pagar cp ON cp.categoria_id = cf.id
  AND cp.status IN ('vencido', 'em_aberto', 'parcialmente_pago')
  AND cp.data_vencimento < CURRENT_DATE
  AND cp.saldo_restante > 0
WHERE cf.status = 'ativo'
GROUP BY cf.id, cf.nome, cf.tipo
ORDER BY total_vencido DESC;

-- View: Contas Futuras agrupadas por categoria
CREATE OR REPLACE VIEW v_contas_futuras_por_categoria AS
SELECT 
  cf.id as categoria_id,
  cf.nome as categoria_nome,
  cf.tipo as categoria_tipo,
  COUNT(cp.id) as quantidade_contas,
  COALESCE(SUM(cp.saldo_restante), 0) as total_futuro,
  COALESCE(SUM(cp.valor_total), 0) as valor_total_original,
  COALESCE(SUM(cp.valor_pago), 0) as valor_ja_pago,
  MIN(cp.data_vencimento) as proximo_vencimento,
  MAX(cp.data_vencimento) as ultimo_vencimento
FROM categorias_financeiras cf
LEFT JOIN contas_pagar cp ON cp.categoria_id = cf.id
  AND cp.status IN ('em_aberto', 'parcialmente_pago')
  AND cp.data_vencimento >= CURRENT_DATE
  AND cp.saldo_restante > 0
WHERE cf.status = 'ativo'
GROUP BY cf.id, cf.nome, cf.tipo
ORDER BY total_futuro DESC;

-- View: Resumo Completo por Categoria (Vencidas + Futuras)
CREATE OR REPLACE VIEW v_resumo_contas_categoria AS
SELECT 
  cf.id as categoria_id,
  cf.nome as categoria_nome,
  cf.tipo as categoria_tipo,
  COALESCE(venc.quantidade_contas, 0) as qtd_vencidas,
  COALESCE(venc.total_vencido, 0) as total_vencido,
  COALESCE(fut.quantidade_contas, 0) as qtd_futuras,
  COALESCE(fut.total_futuro, 0) as total_futuro,
  COALESCE(venc.total_vencido, 0) + COALESCE(fut.total_futuro, 0) as total_geral,
  COALESCE(venc.vencimento_mais_antigo, fut.proximo_vencimento) as primeira_data,
  COALESCE(fut.ultimo_vencimento, venc.vencimento_mais_recente) as ultima_data
FROM categorias_financeiras cf
LEFT JOIN v_contas_vencidas_por_categoria venc ON venc.categoria_id = cf.id
LEFT JOIN v_contas_futuras_por_categoria fut ON fut.categoria_id = cf.id
WHERE cf.status = 'ativo'
  AND (COALESCE(venc.total_vencido, 0) > 0 OR COALESCE(fut.total_futuro, 0) > 0)
ORDER BY total_geral DESC;

-- Função: Obter contas a pagar por período e categoria
CREATE OR REPLACE FUNCTION obter_contas_por_periodo_categoria(
  p_data_inicio date DEFAULT CURRENT_DATE,
  p_data_fim date DEFAULT CURRENT_DATE + INTERVAL '30 days'
)
RETURNS TABLE (
  categoria_id uuid,
  categoria_nome text,
  categoria_tipo text,
  quantidade_contas bigint,
  valor_total numeric,
  valor_pago numeric,
  saldo_restante numeric,
  contas jsonb
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    cf.id,
    cf.nome,
    cf.tipo,
    COUNT(cp.id),
    COALESCE(SUM(cp.valor_total), 0),
    COALESCE(SUM(cp.valor_pago), 0),
    COALESCE(SUM(cp.saldo_restante), 0),
    jsonb_agg(
      jsonb_build_object(
        'id', cp.id,
        'descricao', cp.descricao,
        'valor_total', cp.valor_total,
        'valor_pago', cp.valor_pago,
        'saldo_restante', cp.saldo_restante,
        'data_vencimento', cp.data_vencimento,
        'status', cp.status,
        'fornecedor_id', cp.fornecedor_id
      ) ORDER BY cp.data_vencimento
    ) FILTER (WHERE cp.id IS NOT NULL)
  FROM categorias_financeiras cf
  LEFT JOIN contas_pagar cp ON cp.categoria_id = cf.id
    AND cp.data_vencimento BETWEEN p_data_inicio AND p_data_fim
    AND cp.status IN ('em_aberto', 'parcialmente_pago', 'vencido')
    AND cp.saldo_restante > 0
  WHERE cf.status = 'ativo'
  GROUP BY cf.id, cf.nome, cf.tipo
  HAVING COUNT(cp.id) > 0
  ORDER BY COALESCE(SUM(cp.saldo_restante), 0) DESC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Permitir acesso às views
GRANT SELECT ON v_contas_vencidas_por_categoria TO authenticated;
GRANT SELECT ON v_contas_futuras_por_categoria TO authenticated;
GRANT SELECT ON v_resumo_contas_categoria TO authenticated;