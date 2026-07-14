/*
  # Corrigir View Despesas - Filtrar Pagamentos Informativos
  
  ## Descrição
  Quando uma conta é marcada como "paga" através de pagamento informativo,
  ela deve parar de aparecer nos cards de despesas da Visão Estratégica.
  
  ## Mudanças
  1. Atualizar view para EXCLUIR contas que possuem pagamentos informativos
  2. Pagamentos informativos indicam que a conta foi "paga" no planejamento
  
  ## Impacto
  - Cards de categorias só mostrarão contas realmente pendentes
  - Contas marcadas como pagas no planejamento não aparecerão mais
*/

-- Recriar view excluindo contas com pagamentos informativos
DROP VIEW IF EXISTS view_despesas_visao_estrategica CASCADE;

CREATE VIEW view_despesas_visao_estrategica AS
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
  cat.categoria_pai_id,
  CASE 
    WHEN cat.categoria_pai_id IS NOT NULL THEN cat_pai.nome
    ELSE NULL
  END as categoria_pai_nome,
  cp.centro_custo_id,
  cc.nome as centro_custo_nome,
  cp.criado_em,
  cp.atualizado_em,
  
  -- Classificação por situação
  CASE
    WHEN cp.data_vencimento < CURRENT_DATE THEN 'vencida'
    WHEN cp.data_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '7 days' THEN 'vencendo'
    ELSE 'futura'
  END AS situacao,
  
  -- Valor restante
  (cp.valor_total - COALESCE(cp.valor_pago, 0)) as valor_restante_planejamento

FROM contas_pagar cp
LEFT JOIN fornecedores f ON f.id = cp.fornecedor_id
LEFT JOIN categorias_financeiras cat ON cat.id = cp.categoria_id
LEFT JOIN categorias_financeiras cat_pai ON cat_pai.id = cat.categoria_pai_id
LEFT JOIN centros_custo cc ON cc.id = cp.centro_custo_id
WHERE 
  -- Apenas contas pendentes
  cp.status IN ('em_aberto', 'parcialmente_pago')
  
  -- EXCLUIR contas que já têm pagamento informativo (marcadas como pagas no planejamento)
  AND NOT EXISTS (
    SELECT 1 
    FROM visao_estrategica_pagamentos_informativos pi 
    WHERE pi.conta_pagar_id = cp.id
  )
ORDER BY cp.data_vencimento ASC;

-- Permitir acesso à view
GRANT SELECT ON view_despesas_visao_estrategica TO authenticated, anon;

-- Comentários
COMMENT ON VIEW view_despesas_visao_estrategica IS 'Despesas PENDENTES (em_aberto ou parcialmente_pago) SEM pagamentos informativos para visão estratégica. Contas marcadas como pagas no planejamento não aparecem.';
