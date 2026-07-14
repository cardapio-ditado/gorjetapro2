/*
  # Sincronizar saldos e corrigir duplicações
  
  ## Problema
  Movimentações duplicadas de entrada de compras em dezembro/2025
  
  ## Solução Simplificada
  1. Identificar e deletar movimentações duplicadas exatas
  2. Recalcular saldos permitindo valores temporários negativos
  3. Ajustar valores finais
*/

-- Passo 1: Deletar movimentações EXATAMENTE duplicadas
-- (mesmo item, mesmo estoque, mesma data, mesma quantidade, mesmo documento)
DELETE FROM movimentacoes_estoque m1
WHERE EXISTS (
  SELECT 1 FROM movimentacoes_estoque m2
  WHERE m2.item_id = m1.item_id
    AND m2.estoque_destino_id = m1.estoque_destino_id
    AND m2.data_movimentacao::date = m1.data_movimentacao::date
    AND m2.quantidade = m1.quantidade
    AND m2.tipo_movimentacao = 'entrada'
    AND m1.tipo_movimentacao = 'entrada'
    AND m2.motivo = 'Entrada por compra'
    AND m1.motivo = 'Entrada por compra'
    AND m2.id < m1.id
    AND EXTRACT(YEAR FROM m1.data_movimentacao) = 2025
    AND EXTRACT(MONTH FROM m1.data_movimentacao) = 12
);

-- Passo 2: Temporariamente remover constraints de saldo
ALTER TABLE saldos_estoque DROP CONSTRAINT IF EXISTS saldos_estoque_quantidade_check;
ALTER TABLE saldos_estoque DROP CONSTRAINT IF EXISTS saldos_estoque_valor_check;

-- Passo 3: Zerar e recalcular saldos
UPDATE saldos_estoque SET quantidade_atual = 0, valor_total = 0;

-- Recalcular entradas
UPDATE saldos_estoque s
SET 
  quantidade_atual = s.quantidade_atual + COALESCE(m.total_quantidade, 0),
  valor_total = s.valor_total + COALESCE(m.total_valor, 0),
  atualizado_em = NOW()
FROM (
  SELECT 
    estoque_destino_id,
    item_id,
    SUM(quantidade) as total_quantidade,
    SUM(custo_total) as total_valor
  FROM movimentacoes_estoque
  WHERE tipo_movimentacao = 'entrada'
  GROUP BY estoque_destino_id, item_id
) m
WHERE s.estoque_id = m.estoque_destino_id
  AND s.item_id = m.item_id;

-- Recalcular saídas
UPDATE saldos_estoque s
SET 
  quantidade_atual = s.quantidade_atual - COALESCE(m.total_quantidade, 0),
  valor_total = s.valor_total - COALESCE(m.total_valor, 0),
  atualizado_em = NOW()
FROM (
  SELECT 
    estoque_origem_id,
    item_id,
    SUM(quantidade) as total_quantidade,
    SUM(custo_total) as total_valor
  FROM movimentacoes_estoque
  WHERE tipo_movimentacao = 'saida'
  GROUP BY estoque_origem_id, item_id
) m
WHERE s.estoque_id = m.estoque_origem_id
  AND s.item_id = m.item_id;

-- Passo 4: Ajustar valores negativos para zero (itens zerados por contagem)
UPDATE saldos_estoque 
SET quantidade_atual = 0, valor_total = 0
WHERE quantidade_atual < 0;

-- Passo 5: Recriar constraints
ALTER TABLE saldos_estoque ADD CONSTRAINT saldos_estoque_quantidade_check CHECK (quantidade_atual >= 0);
ALTER TABLE saldos_estoque ADD CONSTRAINT saldos_estoque_valor_check CHECK (valor_total >= 0);

-- Verificar resultados
SELECT 
  'Movimentações duplicadas removidas' as info,
  COUNT(*) as quantidade
FROM movimentacoes_estoque m1
WHERE NOT EXISTS (
  SELECT 1 FROM movimentacoes_estoque m2
  WHERE m2.item_id = m1.item_id
    AND m2.estoque_destino_id = m1.estoque_destino_id
    AND m2.data_movimentacao::date = m1.data_movimentacao::date
    AND m2.quantidade = m1.quantidade
    AND m2.id != m1.id
    AND m2.tipo_movimentacao = 'entrada'
    AND m1.tipo_movimentacao = 'entrada'
)
  AND m1.tipo_movimentacao = 'entrada'
  AND m1.motivo = 'Entrada por compra'
  AND EXTRACT(YEAR FROM m1.data_movimentacao) = 2025
  AND EXTRACT(MONTH FROM m1.data_movimentacao) = 12

UNION ALL

SELECT 
  'Itens com saldo' as info,
  COUNT(*) as quantidade
FROM saldos_estoque
WHERE quantidade_atual > 0;