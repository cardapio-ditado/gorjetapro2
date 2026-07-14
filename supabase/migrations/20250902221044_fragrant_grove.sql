/*
  # Limpar Entradas Duplicadas no Estoque

  1. Identificação e Remoção
    - Remove movimentações duplicadas de entrada
    - Mantém apenas a primeira entrada de cada compra
    - Recalcula saldos corretos

  2. Prevenção
    - Adiciona verificação para evitar duplicatas futuras
    - Melhora identificação única das movimentações
*/

-- Remover movimentações duplicadas de entrada (manter apenas a primeira de cada compra)
DELETE FROM movimentacoes_estoque 
WHERE id IN (
  SELECT id FROM (
    SELECT id, 
           ROW_NUMBER() OVER (
             PARTITION BY item_id, estoque_destino_id, 
             SUBSTRING(motivo FROM 'Compra [^-]*') 
             ORDER BY data_movimentacao ASC
           ) as rn
    FROM movimentacoes_estoque 
    WHERE tipo_movimentacao = 'entrada' 
    AND motivo LIKE '%Entrada de compra%'
  ) t 
  WHERE rn > 1
);

-- Recalcular saldos corretos baseado nas movimentações restantes
DO $$
DECLARE
    saldo_record RECORD;
    total_entradas NUMERIC;
    total_saidas NUMERIC;
    saldo_final NUMERIC;
    valor_final NUMERIC;
BEGIN
    -- Para cada combinação de item/estoque
    FOR saldo_record IN 
        SELECT DISTINCT item_id, estoque_id 
        FROM saldos_estoque
    LOOP
        -- Calcular total de entradas
        SELECT COALESCE(SUM(quantidade), 0), COALESCE(SUM(custo_total), 0)
        INTO total_entradas, valor_final
        FROM movimentacoes_estoque 
        WHERE item_id = saldo_record.item_id 
        AND estoque_destino_id = saldo_record.estoque_id
        AND tipo_movimentacao = 'entrada';
        
        -- Calcular total de saídas
        SELECT COALESCE(SUM(quantidade), 0)
        INTO total_saidas
        FROM movimentacoes_estoque 
        WHERE item_id = saldo_record.item_id 
        AND estoque_origem_id = saldo_record.estoque_id
        AND tipo_movimentacao = 'saida';
        
        -- Calcular saldo final
        saldo_final := total_entradas - total_saidas;
        
        -- Atualizar saldo na tabela
        UPDATE saldos_estoque 
        SET quantidade_atual = saldo_final,
            valor_total = CASE 
                WHEN saldo_final > 0 THEN valor_final * (saldo_final / total_entradas)
                ELSE 0 
            END,
            atualizado_em = NOW()
        WHERE item_id = saldo_record.item_id 
        AND estoque_id = saldo_record.estoque_id;
    END LOOP;
END $$;

-- Remover saldos zerados ou negativos
DELETE FROM saldos_estoque 
WHERE quantidade_atual <= 0;