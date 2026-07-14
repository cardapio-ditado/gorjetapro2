/*
  # Corrigir View de Extrato - Usar Window Functions Corretamente
  
  1. Problema Anterior
    - O LEFT JOIN estava multiplicando registros
    - Saldo anterior inconsistente
  
  2. Solução
    - Usar apenas window functions sem JOIN
    - Calcular saldo acumulado diretamente
    - Garantir ordem consistente (data + id)
*/

-- Drop view anterior
DROP VIEW IF EXISTS view_extrato_fluxo_caixa CASCADE;

-- Criar view corrigida com window functions
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
  -- Saldo acumulado até esta transação (incluindo ela)
  SUM(CASE WHEN fc.tipo = 'entrada' THEN fc.valor ELSE -fc.valor END) 
    OVER (ORDER BY fc.data, fc.id) as saldo_acumulado,
  -- Saldo anterior (antes desta transação)
  COALESCE(
    SUM(CASE WHEN fc.tipo = 'entrada' THEN fc.valor ELSE -fc.valor END) 
      OVER (ORDER BY fc.data, fc.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),
    0
  ) as saldo_anterior
FROM fluxo_caixa fc
ORDER BY fc.data DESC, fc.id DESC;

-- Permitir acesso autenticado
GRANT SELECT ON view_extrato_fluxo_caixa TO authenticated;

-- Adicionar comentário
COMMENT ON VIEW view_extrato_fluxo_caixa IS 'Extrato bancário com saldo acumulado linha a linha usando window functions para garantir precisão nos cálculos financeiros';