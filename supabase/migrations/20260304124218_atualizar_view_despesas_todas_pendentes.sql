/*
  # Atualizar View de Despesas - Todas as Pendentes

  ## Alterações
  - Remove filtro de 7 dias
  - Traz TODAS as contas pendentes e parcialmente pagas
  - Agrupa por categoria e subcategoria
  
  ## Campos
  - Fornecedor, descrição, valor restante, vencimento
  - Categoria e subcategoria para agrupamento
  - Situação: vencida ou vencendo
*/

DROP VIEW IF EXISTS v_despesas_visao_estrategica;

CREATE OR REPLACE VIEW v_despesas_visao_estrategica AS
SELECT
  cp.id,
  f.nome AS fornecedor,
  cp.descricao,
  cp.data_vencimento,
  cp.valor_total,
  cp.valor_pago,
  (cp.valor_total - COALESCE(cp.valor_pago, 0)) AS valor_restante,
  cp.status,
  cf.id AS categoria_id,
  cf.nome AS categoria_nome,
  cfs.id AS subcategoria_id,
  cfs.nome AS subcategoria_nome,
  CASE
    WHEN cp.data_vencimento < CURRENT_DATE THEN 'vencida'
    ELSE 'vencendo'
  END AS situacao,
  cp.criado_em
FROM contas_pagar cp
LEFT JOIN fornecedores f ON f.id = cp.fornecedor_id
LEFT JOIN categorias_financeiras cf ON cf.id = cp.categoria_id
LEFT JOIN categorias_financeiras cfs ON cfs.id = (
  SELECT categoria_pai_id 
  FROM categorias_financeiras 
  WHERE id = cp.categoria_id
)
WHERE
  cp.status IN ('pendente', 'parcialmente_pago')
ORDER BY
  cf.nome ASC,
  cfs.nome ASC NULLS LAST,
  cp.data_vencimento ASC;

-- RLS
ALTER VIEW v_despesas_visao_estrategica SET (security_invoker = on);

COMMENT ON VIEW v_despesas_visao_estrategica IS 'Todas as despesas pendentes do Contas a Pagar para Visão Estratégica';
