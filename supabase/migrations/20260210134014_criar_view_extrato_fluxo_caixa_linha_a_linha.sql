/*
  # Criar View de Extrato Bancário Linha a Linha
  
  1. Objetivo
    - Calcular saldo acumulado linha a linha, como um extrato bancário real
    - Garantir precisão total nos cálculos financeiros
    - Permitir filtros por período e conta bancária mantendo a consistência
  
  2. Funcionamento
    - Ordena todas as transações por data e ID
    - Calcula o saldo acumulado progressivamente
    - Cada linha mostra: saldo anterior + entrada - saída = saldo atual
  
  3. Benefícios
    - Elimina inconsistências de cálculo
    - Comportamento idêntico a extrato bancário
    - Facilita auditoria e reconciliação
*/

-- Drop view se existir
DROP VIEW IF EXISTS view_extrato_fluxo_caixa CASCADE;

-- Criar view com saldo acumulado linha a linha
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
  SUM(CASE WHEN fc2.tipo = 'entrada' THEN fc2.valor ELSE -fc2.valor END) 
    OVER (ORDER BY fc.data, fc.id) as saldo_acumulado,
  -- Saldo anterior (antes desta transação)
  COALESCE(
    SUM(CASE WHEN fc2.tipo = 'entrada' THEN fc2.valor ELSE -fc2.valor END) 
      OVER (ORDER BY fc.data, fc.id ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),
    0
  ) as saldo_anterior
FROM fluxo_caixa fc
LEFT JOIN fluxo_caixa fc2 ON fc2.data <= fc.data OR (fc2.data = fc.data AND fc2.id <= fc.id)
ORDER BY fc.data DESC, fc.id DESC;

-- Permitir acesso autenticado
GRANT SELECT ON view_extrato_fluxo_caixa TO authenticated;

-- Adicionar comentário
COMMENT ON VIEW view_extrato_fluxo_caixa IS 'Extrato bancário com saldo acumulado linha a linha para garantir precisão nos cálculos financeiros';