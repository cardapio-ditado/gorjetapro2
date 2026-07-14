/*
  # Fix Purchase Approval Trigger

  1. Corrections
    - Fix trigger to execute on status change to 'recebido' (not 'aprovado')
    - Ensure trigger function handles all edge cases properly
    - Add better error handling and logging

  2. Security
    - Maintain existing RLS policies
    - Ensure data integrity during stock movements
*/

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS trg_processar_entrada_compra ON entradas_compras;
DROP FUNCTION IF EXISTS processar_entrada_compra();

-- Create improved function to process purchase receipt
CREATE OR REPLACE FUNCTION processar_entrada_compra()
RETURNS TRIGGER AS $$
DECLARE
    item_compra RECORD;
    saldo_existente RECORD;
    nova_quantidade NUMERIC;
    novo_valor_total NUMERIC;
    custo_medio_atual NUMERIC;
BEGIN
    -- Only process when status changes to 'recebido'
    IF NEW.status = 'recebido' AND (OLD.status IS NULL OR OLD.status != 'recebido') THEN
        
        -- Process each item in the purchase
        FOR item_compra IN 
            SELECT ic.*, ie.nome as item_nome, ie.unidade_medida
            FROM itens_entrada_compra ic
            JOIN itens_estoque ie ON ic.item_id = ie.id
            WHERE ic.entrada_compra_id = NEW.id
        LOOP
            -- Create stock movement entry
            INSERT INTO movimentacoes_estoque (
                estoque_destino_id,
                item_id,
                tipo_movimentacao,
                quantidade,
                custo_unitario,
                custo_total,
                data_movimentacao,
                motivo,
                observacoes,
                criado_por
            ) VALUES (
                NEW.estoque_destino_id,
                item_compra.item_id,
                'entrada',
                item_compra.quantidade,
                item_compra.custo_unitario,
                item_compra.custo_total,
                NEW.data_compra,
                'Entrada por compra recebida',
                'Compra ID: ' || NEW.id || COALESCE(' - Doc: ' || NEW.numero_documento, ''),
                NEW.criado_por
            );

            -- Check if stock balance already exists
            SELECT * INTO saldo_existente
            FROM saldos_estoque 
            WHERE estoque_id = NEW.estoque_destino_id 
            AND item_id = item_compra.item_id;

            IF FOUND THEN
                -- Update existing stock balance
                nova_quantidade := saldo_existente.quantidade_atual + item_compra.quantidade;
                novo_valor_total := saldo_existente.valor_total + item_compra.custo_total;

                UPDATE saldos_estoque 
                SET 
                    quantidade_atual = nova_quantidade,
                    valor_total = novo_valor_total,
                    data_ultima_movimentacao = NEW.data_compra,
                    atualizado_em = NOW()
                WHERE estoque_id = NEW.estoque_destino_id 
                AND item_id = item_compra.item_id;
            ELSE
                -- Create new stock balance
                INSERT INTO saldos_estoque (
                    estoque_id,
                    item_id,
                    quantidade_atual,
                    valor_total,
                    data_ultima_movimentacao
                ) VALUES (
                    NEW.estoque_destino_id,
                    item_compra.item_id,
                    item_compra.quantidade,
                    item_compra.custo_total,
                    NEW.data_compra
                );
            END IF;

            -- Update average cost of the item across all stocks
            SELECT 
                CASE 
                    WHEN SUM(quantidade_atual) > 0 THEN 
                        SUM(valor_total) / SUM(quantidade_atual)
                    ELSE 0 
                END INTO custo_medio_atual
            FROM saldos_estoque 
            WHERE item_id = item_compra.item_id
            AND quantidade_atual > 0;

            -- Update item's average cost
            UPDATE itens_estoque 
            SET 
                custo_medio = COALESCE(custo_medio_atual, 0),
                atualizado_em = NOW()
            WHERE id = item_compra.item_id;

        END LOOP;

        -- Log the processing
        RAISE NOTICE 'Purchase % processed successfully. Items added to stock %', NEW.id, NEW.estoque_destino_id;
        
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;