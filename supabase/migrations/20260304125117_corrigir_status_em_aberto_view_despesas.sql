/*
  # Corrigir View de Despesas - Status correto

  ## Alterações
  - Usar status 'em_aberto' ao invés de 'pendente'
  - Garantir que valor_restante está correto (valor_total - valor_pago)
  - Trazer todas as contas em aberto e parcialmente pagas
*/

DROP VIEW IF EXISTS v_despesas_visao_estrategica;

CREATE OR REPLACE VIEW v_despesas_visao_estrategica AS
SELECT
  cp.id,
  f.nome AS fornecedor,
  cp.descricao,
  cp.data_vencimento,
  cp.valor_total,
  COALESCE(cp.valor_pago, 0) AS valor_pago,
  (cp.valor_total - COALESCE(cp.valor_pago, 0)) AS valor_restante,
  cp.status,
  COALESCE(cf_pai.id, cf.id) AS categoria_id,
  COALESCE(cf_pai.nome, cf.nome) AS categoria_nome,
  CASE WHEN cf_pai.id IS NOT NULL THEN cf.id ELSE NULL END AS subcategoria_id,
  CASE WHEN cf_pai.id IS NOT NULL THEN cf.nome ELSE NULL END AS subcategoria_nome,
  CASE
    WHEN cp.data_vencimento < CURRENT_DATE THEN 'vencida'
    ELSE 'vencendo'
  END AS situacao,
  cp.criado_em
FROM contas_pagar cp
LEFT JOIN fornecedores f ON f.id = cp.fornecedor_id
LEFT JOIN categorias_financeiras cf ON cf.id = cp.categoria_id
LEFT JOIN categorias_financeiras cf_pai ON cf_pai.id = cf.categoria_pai_id
WHERE
  cp.status IN ('em_aberto', 'parcialmente_pago')
  AND (cp.valor_total - COALESCE(cp.valor_pago, 0)) > 0
ORDER BY
  COALESCE(cf_pai.nome, cf.nome) ASC,
  cf.nome ASC,
  cp.data_vencimento ASC;

-- RLS
ALTER VIEW v_despesas_visao_estrategica SET (security_invoker = on);

COMMENT ON VIEW v_despesas_visao_estrategica IS 'Todas as despesas em aberto do Contas a Pagar (status em_aberto e parcialmente_pago) com saldo restante';
