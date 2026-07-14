/*
  # View de Despesas para Visão Estratégica

  ## Descrição
  Cria view que busca contas a pagar vencidas e vencendo nos próximos 7 dias
  para exibição na Visão Estratégica como "bússola" do gestor.

  ## Dados retornados
  - Fornecedor (nome)
  - Data de vencimento
  - Valor (saldo restante)
  - Categoria
  - Subcategoria
  - Status da conta

  ## Filtros aplicados
  - Status: pendente ou parcialmente_pago
  - Vencimento: até hoje (vencidas) OU entre hoje e +7 dias (vencendo)

  ## Segurança
  - RLS habilitado (security_invoker)
  - Acesso para usuários autenticados
*/

CREATE OR REPLACE VIEW v_despesas_visao_estrategica AS
SELECT
  cp.id,
  f.nome AS fornecedor,
  cp.data_vencimento,
  cp.valor_total,
  cp.valor_pago,
  (cp.valor_total - COALESCE(cp.valor_pago, 0)) AS valor_restante,
  cp.status,
  cf.id AS categoria_id,
  cf.nome AS categoria_nome,
  cp.descricao,
  CASE
    WHEN cp.data_vencimento < CURRENT_DATE THEN 'vencida'
    WHEN cp.data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' THEN 'vencendo'
    ELSE 'futura'
  END AS situacao
FROM contas_pagar cp
LEFT JOIN fornecedores f ON f.id = cp.fornecedor_id
LEFT JOIN categorias_financeiras cf ON cf.id = cp.categoria_id
WHERE
  cp.status IN ('pendente', 'parcialmente_pago')
  AND (
    cp.data_vencimento < CURRENT_DATE  -- Vencidas
    OR cp.data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days'  -- Vencendo nos próximos 7 dias
  )
ORDER BY
  cp.data_vencimento ASC,
  (cp.valor_total - COALESCE(cp.valor_pago, 0)) DESC;

-- RLS
ALTER VIEW v_despesas_visao_estrategica SET (security_invoker = on);

COMMENT ON VIEW v_despesas_visao_estrategica IS 'Despesas (contas a pagar) vencidas e vencendo nos próximos 7 dias para Visão Estratégica';
