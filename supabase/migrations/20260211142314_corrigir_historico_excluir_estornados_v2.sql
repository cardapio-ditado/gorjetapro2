/*
  # Corrigir histórico de pagamentos para excluir estornados
  
  1. Alterações
    - Atualiza view vw_contas_pagar para excluir pagamentos estornados do histórico
    - Adiciona verificação na subquery de pagamentos_historico
    
  2. Comportamento
    - Pagamentos que aparecem em historico_estornos_pagamento não aparecem no histórico
    - Interface mostra apenas pagamentos ativos (não estornados)
*/

-- Recriar view com filtro de estornos
DROP VIEW IF EXISTS vw_contas_pagar_pendentes;
DROP VIEW IF EXISTS vw_contas_pagar CASCADE;

CREATE VIEW vw_contas_pagar AS
SELECT 
  cp.id,
  cp.fornecedor_id,
  cp.descricao,
  cp.categoria_id,
  cp.centro_custo_id,
  cp.forma_pagamento_id,
  cp.valor_total,
  cp.valor_pago,
  cp.saldo_restante,
  cp.data_vencimento,
  cp.data_emissao,
  cp.numero_documento,
  CASE
    WHEN cp.saldo_restante <= 0 AND cp.status NOT IN ('cancelado') THEN 'pago'
    ELSE cp.status
  END AS status,
  cp.aprovado_para_pagamento,
  cp.aprovado_por,
  cp.data_aprovacao,
  cp.data_primeira_baixa,
  cp.data_baixa_integral,
  cp.observacoes,
  cp.criado_por,
  cp.criado_em,
  cp.atualizado_em,
  cp.tipo_pagamento,
  cp.prioridade_sugerida,
  cp.observacao_tesouraria,
  cp.observacao_aprovacao,
  cp.sugerido_por,
  cp.data_sugestao,
  cp.eh_recorrente,
  cp.frequencia_recorrencia,
  cp.dia_vencimento_recorrente,
  cp.recorrencia_ativa,
  cp.data_inicio_recorrencia,
  cp.data_fim_recorrencia,
  cp.eh_parcelado,
  cp.numero_parcela,
  cp.total_parcelas,
  cp.parcelamento_grupo_id,
  cp.valor_original,
  cp.valor_final,
  cp.desconto,
  cp.juros,
  f.nome AS fornecedor_nome,
  f.categoria_padrao_id AS fornecedor_categoria_padrao,
  cat.nome AS categoria_nome,
  cat.caminho_completo AS categoria_completa,
  cc.nome AS centro_custo_nome,
  fp.nome AS forma_pagamento_nome,
  u_criado.nome AS criado_por_nome,
  u_aprovado.nome AS aprovado_por_nome,
  u_sugerido.nome AS sugerido_por_nome,
  CASE
    WHEN cp.saldo_restante <= 0 AND cp.status NOT IN ('cancelado') THEN false
    WHEN cp.data_vencimento < CURRENT_DATE AND cp.status IN ('em_aberto', 'parcialmente_pago', 'autorizado_pagamento') THEN true
    ELSE false
  END AS esta_vencida,
  (CURRENT_DATE - cp.data_vencimento) AS dias_vencimento,
  CASE
    WHEN cp.saldo_restante <= 0 AND cp.status NOT IN ('cancelado') THEN 'paga'
    WHEN cp.status = 'cancelado' THEN 'cancelada'
    WHEN cp.data_vencimento < CURRENT_DATE AND cp.saldo_restante > 0 THEN 'atrasada'
    WHEN cp.data_vencimento = CURRENT_DATE AND cp.saldo_restante > 0 THEN 'vence_hoje'
    WHEN cp.data_vencimento <= (CURRENT_DATE + INTERVAL '7 days') AND cp.saldo_restante > 0 THEN 'vence_em_breve'
    WHEN cp.saldo_restante > 0 THEN 'no_prazo'
    ELSE 'paga'
  END AS situacao_vencimento,
  (cp.data_vencimento - CURRENT_DATE) AS dias_para_vencer,
  (SELECT count(*) 
   FROM fluxo_caixa fc 
   WHERE fc.conta_pagar_id = cp.id 
   AND fc.tipo = 'saida'
   AND NOT EXISTS (
     SELECT 1 FROM historico_estornos_pagamento hep 
     WHERE hep.fluxo_caixa_id = fc.id
   )
  ) AS total_pagamentos_parciais,
  (SELECT json_agg(
    json_build_object(
      'id', fc.id,
      'valor', fc.valor,
      'data', fc.data,
      'forma_pagamento', fp2.nome,
      'conta_bancaria', COALESCE(bc.banco || ' - ' || bc.tipo_conta, 'N/A'),
      'observacoes', fc.observacoes,
      'criado_em', fc.criado_em
    ) ORDER BY fc.data DESC
  )
  FROM fluxo_caixa fc
  LEFT JOIN contas_pagar cp2 ON fc.conta_pagar_id = cp2.id
  LEFT JOIN formas_pagamento fp2 ON cp2.forma_pagamento_id = fp2.id
  LEFT JOIN bancos_contas bc ON fc.conta_bancaria_id = bc.id
  WHERE fc.conta_pagar_id = cp.id 
  AND fc.tipo = 'saida'
  AND NOT EXISTS (
    SELECT 1 FROM historico_estornos_pagamento hep 
    WHERE hep.fluxo_caixa_id = fc.id
  )
  ) AS pagamentos_historico
FROM contas_pagar cp
LEFT JOIN fornecedores f ON cp.fornecedor_id = f.id
LEFT JOIN vw_categoria_tree cat ON cp.categoria_id = cat.id
LEFT JOIN centros_custo cc ON cp.centro_custo_id = cc.id
LEFT JOIN formas_pagamento fp ON cp.forma_pagamento_id = fp.id
LEFT JOIN usuarios u_criado ON cp.criado_por = u_criado.id
LEFT JOIN usuarios u_aprovado ON cp.aprovado_por = u_aprovado.id
LEFT JOIN usuarios u_sugerido ON cp.sugerido_por = u_sugerido.id;

-- Recriar view de contas pendentes
CREATE OR REPLACE VIEW vw_contas_pagar_pendentes AS
SELECT *
FROM vw_contas_pagar
WHERE status IN ('em_aberto', 'parcialmente_pago', 'vencido')
AND (aprovado_para_pagamento IS NULL OR aprovado_para_pagamento = false);

-- Garantir RLS
ALTER VIEW vw_contas_pagar OWNER TO postgres;
ALTER VIEW vw_contas_pagar_pendentes OWNER TO postgres;

GRANT SELECT ON vw_contas_pagar TO authenticated;
GRANT SELECT ON vw_contas_pagar_pendentes TO authenticated;
