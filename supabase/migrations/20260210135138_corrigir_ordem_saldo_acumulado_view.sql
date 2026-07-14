/*
  # Corrigir Ordem do Saldo Acumulado na View
  
  1. Problema
    - A window function calculava saldo em ordem DESC
    - Mas extrato bancário deve ser em ordem ASC (cronológica)
    - Resultado: saldo acumulado ficava invertido
  
  2. Solução
    - Window function deve usar ORDER BY data ASC, id ASC
    - Ordem padrão da view pode continuar DESC
    - Mas o cálculo interno deve ser cronológico
*/

-- Drop view anterior
DROP VIEW IF EXISTS view_extrato_fluxo_caixa CASCADE;

-- Criar view corrigida com ordem cronológica no cálculo
CREATE VIEW view_extrato_fluxo_caixa AS
SELECT 
  fc.id,
  fc.data,
  fc.tipo,
  fc.descricao,
  fc.valor,
  fc.categoria_id,
  fc.conta_bancaria_id,
  fc.centro_custo_id,
  fc.forma_pagamento_id,
  fc.origem,
  fc.conta_pagar_id,
  fc.conta_receber_id,
  fc.pagamento_id,
  fc.observacoes,
  fc.criado_por,
  fc.criado_em,
  -- Valores separados por tipo
  CASE WHEN fc.tipo = 'entrada' THEN fc.valor ELSE 0 END as valor_entrada,
  CASE WHEN fc.tipo = 'saida' THEN fc.valor ELSE 0 END as valor_saida,
  -- Saldo acumulado CRONOLOGICAMENTE (ASC) - ordem correta para extrato
  SUM(CASE WHEN fc.tipo = 'entrada' THEN fc.valor ELSE -fc.valor END) 
    OVER (ORDER BY fc.data ASC, fc.id ASC) as saldo_acumulado,
  -- Saldo anterior (antes desta transação)
  COALESCE(
    SUM(CASE WHEN fc.tipo = 'entrada' THEN fc.valor ELSE -fc.valor END) 
      OVER (ORDER BY fc.data ASC, fc.id ASC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),
    0
  ) as saldo_anterior
FROM fluxo_caixa fc;

-- Permitir acesso autenticado
GRANT SELECT ON view_extrato_fluxo_caixa TO authenticated;

-- Adicionar comentário
COMMENT ON VIEW view_extrato_fluxo_caixa IS 'Extrato bancário com saldo acumulado CRONOLOGICAMENTE (ordem ASC) linha a linha para garantir precisão nos cálculos financeiros';
