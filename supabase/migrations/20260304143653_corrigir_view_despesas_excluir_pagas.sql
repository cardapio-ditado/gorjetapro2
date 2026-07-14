/*
  # Corrigir View Despesas - Excluir Contas Pagas no Financeiro

  ## Descrição
  A view estava incluindo contas que já foram PAGAS no sistema financeiro real.
  Essas contas não devem aparecer na Visão Estratégica pois já foram efetivamente liquidadas.

  ## Mudanças
  1. Modificar WHERE para incluir apenas contas em_aberto e parcialmente_pago
  2. Excluir contas com status='pago' que já foram efetivamente pagas no financeiro

  ## Lógica
  - Contas com status='pago' no financeiro real = já foram pagas, NÃO aparecem
  - Contas com pagamento_informativo_id = marcadas como pagas só no planejamento, aparecem mas filtradas no frontend
*/

-- Recriar view de despesas APENAS com contas pendentes
DROP VIEW IF EXISTS view_despesas_visao_estrategica;

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
  cat.categoria_pai_id as subcategoria_id,
  COALESCE(cat_pai.nome, cat.nome) as subcategoria_nome,
  cp.centro_custo_id,
  cc.nome as centro_custo_nome,
  cp.criado_em,
  
  -- Informações do pagamento informativo
  pi.id as pagamento_informativo_id,
  pi.valor_pago as valor_pago_informativo,
  pi.data_pagamento_informativo,
  pi.semana_id as semana_pagamento_informativo,
  pi.observacao as observacao_pagamento,
  
  -- Status combinado (considera pagamento informativo)
  CASE 
    WHEN pi.id IS NOT NULL THEN 'pago_planejamento'
    WHEN cp.status = 'parcialmente_pago' THEN 'parcialmente_pago'
    ELSE 'em_aberto'
  END as status_planejamento,
  
  -- Valor restante considerando pagamento informativo
  CASE 
    WHEN pi.id IS NOT NULL THEN 0
    ELSE (cp.valor_total - COALESCE(cp.valor_pago, 0))
  END as valor_restante_planejamento

FROM contas_pagar cp
LEFT JOIN fornecedores f ON f.id = cp.fornecedor_id
LEFT JOIN categorias_financeiras cat ON cat.id = cp.categoria_id
LEFT JOIN categorias_financeiras cat_pai ON cat_pai.id = cat.categoria_pai_id
LEFT JOIN centros_custo cc ON cc.id = cp.centro_custo_id
LEFT JOIN visao_estrategica_pagamentos_informativos pi ON pi.conta_pagar_id = cp.id
WHERE cp.status IN ('em_aberto', 'parcialmente_pago');
-- REMOVIDO: 'pago' - contas já pagas no financeiro não devem aparecer aqui

-- Permitir acesso à view
GRANT SELECT ON view_despesas_visao_estrategica TO authenticated, anon;

-- Comentários
COMMENT ON VIEW view_despesas_visao_estrategica IS 'Despesas PENDENTES (em_aberto ou parcialmente_pago) com status de pagamento informativo para visão estratégica. Contas já pagas no financeiro não aparecem aqui.';
