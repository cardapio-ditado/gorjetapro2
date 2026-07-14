/*
  # Remover ajustes de contagem e reprocessar apenas compras de dezembro/2025
  
  ## Problema Identificado
  As movimentações de ajuste de contagem estão subtraindo mais de R$ 9.000 do estoque,
  deixando apenas R$ 1.673 quando deveria ter R$ 11.000 das compras recebidas.
  
  ## Solução
  1. Deletar TODAS as movimentações de ajuste/contagem de dezembro/2025
  2. Zerar completamente os saldos
  3. Reprocessar APENAS as compras recebidas (entrada por compra)
  4. Ignorar completamente os ajustes de contagem
  
  ## Resultado Esperado
  Estoque deve refletir apenas o que foi comprado e recebido em dezembro/2025
*/

-- Passo 1: Backup das movimentações que serão deletadas
CREATE TEMP TABLE backup_movimentacoes_deletadas AS
SELECT *
FROM movimentacoes_estoque
WHERE EXTRACT(YEAR FROM data_movimentacao) = 2025
  AND EXTRACT(MONTH FROM data_movimentacao) = 12
  AND tipo_movimentacao IN ('saida', 'ajuste', 'entrada')
  AND motivo NOT LIKE 'Entrada por compra';

-- Passo 2: Deletar TODAS as movimentações que não sejam entrada por compra de dezembro/2025
DELETE FROM movimentacoes_estoque
WHERE EXTRACT(YEAR FROM data_movimentacao) = 2025
  AND EXTRACT(MONTH FROM data_movimentacao) = 12
  AND tipo_movimentacao IN ('saida', 'ajuste', 'entrada')
  AND motivo NOT LIKE 'Entrada por compra';

-- Passo 3: Mostrar quantas movimentações foram deletadas
DO $$
DECLARE
  v_count INTEGER;
  v_valor_deletado NUMERIC;
BEGIN
  SELECT COUNT(*), SUM(custo_total) 
  INTO v_count, v_valor_deletado 
  FROM backup_movimentacoes_deletadas;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Movimentações deletadas: %', v_count;
  RAISE NOTICE 'Valor total removido: R$ %', v_valor_deletado;
  RAISE NOTICE '========================================';
END $$;

-- Passo 4: Zerar TODOS os saldos
UPDATE saldos_estoque
SET 
  quantidade_atual = 0,
  valor_total = 0,
  data_ultima_movimentacao = NULL,
  atualizado_em = NOW();

-- Passo 5: Recalcular saldos baseado APENAS nas compras recebidas de dezembro/2025
INSERT INTO saldos_estoque (estoque_id, item_id, quantidade_atual, valor_total, data_ultima_movimentacao, atualizado_em)
SELECT 
  m.estoque_destino_id as estoque_id,
  m.item_id,
  SUM(m.quantidade) as quantidade_atual,
  SUM(m.custo_total) as valor_total,
  MAX(m.data_movimentacao) as data_ultima_movimentacao,
  NOW() as atualizado_em
FROM movimentacoes_estoque m
WHERE m.tipo_movimentacao = 'entrada'
  AND m.motivo = 'Entrada por compra'
  AND EXTRACT(YEAR FROM m.data_movimentacao) = 2025
  AND EXTRACT(MONTH FROM m.data_movimentacao) = 12
GROUP BY m.estoque_destino_id, m.item_id
ON CONFLICT (estoque_id, item_id) 
DO UPDATE SET
  quantidade_atual = EXCLUDED.quantidade_atual,
  valor_total = EXCLUDED.valor_total,
  data_ultima_movimentacao = EXCLUDED.data_ultima_movimentacao,
  atualizado_em = EXCLUDED.atualizado_em;

-- Passo 6: Verificar resultados finais
DO $$
DECLARE
  v_total_itens INTEGER;
  v_valor_total NUMERIC;
  v_valor_compras NUMERIC;
BEGIN
  -- Total de itens com saldo
  SELECT COUNT(*), SUM(valor_total)
  INTO v_total_itens, v_valor_total
  FROM saldos_estoque
  WHERE quantidade_atual > 0;
  
  -- Valor total das compras recebidas
  SELECT SUM(valor_total)
  INTO v_valor_compras
  FROM entradas_compras
  WHERE status = 'recebido'
    AND EXTRACT(YEAR FROM data_compra) = 2025
    AND EXTRACT(MONTH FROM data_compra) = 12;
  
  RAISE NOTICE '========================================';
  RAISE NOTICE 'RESULTADO FINAL';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'Itens com saldo: %', v_total_itens;
  RAISE NOTICE 'Valor total em estoque: R$ %', v_valor_total;
  RAISE NOTICE 'Valor compras recebidas: R$ %', v_valor_compras;
  RAISE NOTICE 'Diferença: R$ %', (v_valor_compras - v_valor_total);
  RAISE NOTICE '========================================';
END $$;