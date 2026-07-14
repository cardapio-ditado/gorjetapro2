/*
  # Corrigir Saldo Acumulado por Conta Bancária
  
  1. Problema Identificado
    - A view estava calculando saldo acumulado de TODAS as contas juntas
    - Não havia PARTITION BY na window function
    - Resultado: saldos incorretos quando filtrado por banco específico
  
  2. Solução Implementada
    - Adicionar PARTITION BY conta_bancaria_id nas window functions
    - Saldo acumulado agora é calculado separadamente para cada conta
    - Cada banco terá seu próprio saldo acumulado independente
  
  3. Impacto
    - Corrige saldos no extrato por banco
    - Mantém ordem cronológica correta
    - Indicadores financeiros agora refletem realidade de cada conta
*/

-- Drop view anterior
DROP VIEW IF EXISTS view_extrato_fluxo_caixa CASCADE;

-- Criar view corrigida com particionamento por conta bancária
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
  -- Saldo acumulado PARTICIONADO POR CONTA BANCÁRIA
  SUM(CASE WHEN fc.tipo = 'entrada' THEN fc.valor ELSE -fc.valor END) 
    OVER (PARTITION BY fc.conta_bancaria_id ORDER BY fc.data ASC, fc.id ASC) as saldo_acumulado,
  -- Saldo anterior (antes desta transação) PARTICIONADO POR CONTA BANCÁRIA
  COALESCE(
    SUM(CASE WHEN fc.tipo = 'entrada' THEN fc.valor ELSE -fc.valor END) 
      OVER (PARTITION BY fc.conta_bancaria_id ORDER BY fc.data ASC, fc.id ASC ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),
    0
  ) as saldo_anterior
FROM fluxo_caixa fc;

-- Permitir acesso autenticado
GRANT SELECT ON view_extrato_fluxo_caixa TO authenticated;

-- Adicionar comentário
COMMENT ON VIEW view_extrato_fluxo_caixa IS 'Extrato bancário com saldo acumulado PARTICIONADO por conta bancária - cada banco tem seu saldo independente';
