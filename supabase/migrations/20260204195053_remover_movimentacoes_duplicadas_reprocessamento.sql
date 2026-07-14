/*
  # Remover movimentações duplicadas criadas pelo reprocessamento
  
  1. Changes
    - Remove movimentações duplicadas de compras que foram reprocessadas
    - As duplicatas foram criadas em 2026-02-04 entre 19:46 e 19:47
    - Mantém apenas as movimentações originais
  
  2. Security
    - Remove apenas movimentações duplicadas identificadas pelo timestamp específico
*/

-- Remover movimentações duplicadas de compras reprocessadas
DELETE FROM movimentacoes_estoque
WHERE id IN (
    SELECT m1.id
    FROM movimentacoes_estoque m1
    WHERE m1.criado_em BETWEEN '2026-02-04 19:46:00' AND '2026-02-04 19:47:00'
    AND m1.origem_tipo = 'compra'
    AND EXISTS (
        -- Verificar se existe uma movimentação anterior idêntica
        SELECT 1
        FROM movimentacoes_estoque m2
        WHERE m2.item_id = m1.item_id
        AND m2.estoque_destino_id = m1.estoque_destino_id
        AND m2.quantidade = m1.quantidade
        AND m2.data_movimentacao = m1.data_movimentacao
        AND m2.tipo_movimentacao = m1.tipo_movimentacao
        AND m2.id != m1.id
        AND m2.criado_em < m1.criado_em
    )
);

-- Remover movimentações duplicadas de requisições reprocessadas (se houver)
DELETE FROM movimentacoes_estoque
WHERE id IN (
    SELECT m1.id
    FROM movimentacoes_estoque m1
    WHERE m1.criado_em BETWEEN '2026-02-04 19:46:00' AND '2026-02-04 19:47:00'
    AND m1.origem_tipo = 'requisicao'
    AND EXISTS (
        -- Verificar se existe uma movimentação anterior idêntica
        SELECT 1
        FROM movimentacoes_estoque m2
        WHERE m2.item_id = m1.item_id
        AND m2.estoque_origem_id = m1.estoque_origem_id
        AND m2.estoque_destino_id = m1.estoque_destino_id
        AND m2.quantidade = m1.quantidade
        AND m2.data_movimentacao = m1.data_movimentacao
        AND m2.tipo_movimentacao = m1.tipo_movimentacao
        AND m2.id != m1.id
        AND m2.criado_em < m1.criado_em
    )
);
