/*
  # Fix ambiguous data column in cash flow projection view
  
  1. Problem
    - The view `vw_projecao_fluxo_caixa` has ambiguous column reference "data"
    - The view `vw_indicadores_financeiros` depends on `vw_projecao_fluxo_caixa`
    
  2. Solution
    - Drop dependent views first
    - Recreate `vw_projecao_fluxo_caixa` with properly qualified column references
    - Recreate dependent views
*/

-- Drop dependent views first
DROP VIEW IF EXISTS vw_indicadores_financeiros;

-- Drop the view with ambiguous column references
DROP VIEW IF EXISTS vw_projecao_fluxo_caixa;

-- Recreate the view with properly qualified column references
CREATE VIEW vw_projecao_fluxo_caixa AS
-- Lançamentos realizados do fluxo de caixa
SELECT 
  fc.id,
  fc.data,
  fc.descricao,
  cat.nome as categoria,
  cat.caminho_completo as categoria_completa,
  cc.nome as centro_custo,
  fp.nome as forma_pagamento,
  bc.banco as conta_bancaria,
  CASE 
    WHEN fc.tipo = 'entrada' THEN fc.valor
    ELSE -fc.valor
  END as valor,
  'realizado'::text as status,
  fc.origem,
  fc.observacoes,
  fc.criado_em
FROM fluxo_caixa fc
LEFT JOIN vw_categoria_tree cat ON fc.categoria_id = cat.id
LEFT JOIN centros_custo cc ON fc.centro_custo_id = cc.id
LEFT JOIN formas_pagamento fp ON fc.forma_pagamento_id = fp.id
LEFT JOIN bancos_contas bc ON fc.conta_bancaria_id = bc.id

UNION ALL

-- Contas a pagar em aberto (projeção de saídas)
SELECT 
  cp.id,
  cp.data_vencimento as data,
  cp.descricao,
  cat.nome as categoria,
  cat.caminho_completo as categoria_completa,
  cc.nome as centro_custo,
  fp.nome as forma_pagamento,
  NULL as conta_bancaria,
  -cp.saldo_restante as valor,
  CASE 
    WHEN cp.data_vencimento < CURRENT_DATE THEN 'vencido'::text
    ELSE 'previsto'::text
  END as status,
  'conta_pagar'::text as origem,
  cp.observacoes,
  cp.criado_em
FROM contas_pagar cp
LEFT JOIN vw_categoria_tree cat ON cp.categoria_id = cat.id
LEFT JOIN centros_custo cc ON cp.centro_custo_id = cc.id
LEFT JOIN formas_pagamento fp ON cp.forma_pagamento_id = fp.id
WHERE cp.status IN ('em_aberto', 'parcialmente_pago')
  AND cp.saldo_restante > 0

UNION ALL

-- Contas a receber em aberto (projeção de entradas)
SELECT 
  cr.id,
  cr.data_vencimento as data,
  cr.descricao,
  cat.nome as categoria,
  cat.caminho_completo as categoria_completa,
  cc.nome as centro_custo,
  fp.nome as forma_pagamento,
  NULL as conta_bancaria,
  cr.saldo_restante as valor,
  CASE 
    WHEN cr.data_vencimento < CURRENT_DATE THEN 'vencido'::text
    ELSE 'previsto'::text
  END as status,
  'conta_receber'::text as origem,
  cr.observacoes,
  cr.criado_em
FROM contas_receber cr
LEFT JOIN vw_categoria_tree cat ON cr.categoria_id = cat.id
LEFT JOIN centros_custo cc ON cr.centro_custo_id = cc.id
LEFT JOIN formas_pagamento fp ON cr.forma_recebimento_id = fp.id
WHERE cr.status IN ('em_aberto', 'parcialmente_recebido')
  AND cr.saldo_restante > 0

ORDER BY data;

-- Recreate the dependent view vw_indicadores_financeiros
CREATE VIEW vw_indicadores_financeiros AS
WITH 
contas_abertas AS (
  SELECT 
    COUNT(*) as total_contas_abertas,
    COALESCE(SUM(saldo_restante), 0) as valor_contas_abertas
  FROM contas_pagar 
  WHERE status IN ('em_aberto', 'parcialmente_pago')
),
contas_vencidas AS (
  SELECT 
    COUNT(*) as total_contas_vencidas,
    COALESCE(SUM(saldo_restante), 0) as valor_contas_vencidas
  FROM contas_pagar 
  WHERE status = 'vencido' OR (
    status IN ('em_aberto', 'parcialmente_pago') 
    AND data_vencimento < CURRENT_DATE
  )
),
proximo_mes AS (
  SELECT 
    COALESCE(SUM(saldo_restante), 0) as valor_proximo_mes
  FROM contas_pagar 
  WHERE status IN ('em_aberto', 'parcialmente_pago', 'vencido')
  AND data_vencimento BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days')
),
saldo_real AS (
  SELECT 
    COALESCE(SUM(
      CASE 
        WHEN tipo = 'entrada' THEN valor
        ELSE -valor
      END
    ), 0) as saldo_fluxo_caixa
  FROM fluxo_caixa
),
saldo_projetado AS (
  SELECT 
    COALESCE(SUM(valor), 0) as saldo_com_projecao
  FROM vw_projecao_fluxo_caixa
)
SELECT 
  ca.total_contas_abertas,
  ca.valor_contas_abertas,
  cv.total_contas_vencidas,
  cv.valor_contas_vencidas,
  pm.valor_proximo_mes,
  sr.saldo_fluxo_caixa,
  (sr.saldo_fluxo_caixa - ca.valor_contas_abertas) as saldo_projetado
FROM contas_abertas ca
CROSS JOIN contas_vencidas cv
CROSS JOIN proximo_mes pm
CROSS JOIN saldo_real sr
CROSS JOIN saldo_projetado sp;

-- Add comments to the views
COMMENT ON VIEW vw_projecao_fluxo_caixa IS 'Cash flow projection combining real and projected transactions';
COMMENT ON VIEW vw_indicadores_financeiros IS 'Financial indicators dashboard';