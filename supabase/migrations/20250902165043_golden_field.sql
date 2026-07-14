/*
  # Fix Purchase Processing Trigger - Schema Correction

  1. Updates
    - Fix column name from 'quantidade' to 'quantidade_atual' in saldos_estoque
    - Remove .single() usage that was causing PGRST116 errors
    - Improve error handling for missing records
    - Ensure proper stock balance updates

  2. Security
    - Maintain existing RLS policies
    - Preserve data integrity
*/

-- Drop existing trigger and function if they exist
DROP TRIGGER IF EXISTS trg_processar_entrada_compra ON entradas_compras;
DROP FUNCTION IF EXISTS processar_entrada_compra();

-- Create improved function to process purchase entries
CREATE OR REPLACE FUNCTION processar_entrada_compra()
RETURNS TRIGGER AS $$
DECLARE
    item_compra RECORD;
    saldo_existente RECORD;
    nova_quantidade NUMERIC;
    novo_valor NUMERIC;
BEGIN
    -- Only process when status changes to 'recebido'
    IF NEW.status = 'recebido' AND (OLD.status IS NULL OR OLD.status != 'recebido') THEN
        
        -- Process each item in the purchase
        FOR item_compra IN 
            SELECT * FROM itens_entrada_compra 
            WHERE entrada_compra_id = NEW.id
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
                observacoes
            ) VALUES (
                NEW.estoque_destino_id,
                item_compra.item_id,
                'entrada',
                item_compra.quantidade,
                item_compra.custo_unitario,
                item_compra.custo_total,
                NEW.data_compra,
                'Entrada por compra recebida',
                'Compra ID: ' || NEW.id || COALESCE(' - Doc: ' || NEW.numero_documento, '')
            );

            -- Check if stock balance exists (without .single())
            SELECT * INTO saldo_existente
            FROM saldos_estoque 
            WHERE estoque_id = NEW.estoque_destino_id 
              AND item_id = item_compra.item_id
            LIMIT 1;

            -- Calculate new values
            nova_quantidade := COALESCE(saldo_existente.quantidade_atual, 0) + item_compra.quantidade;
            novo_valor := COALESCE(saldo_existente.valor_total, 0) + item_compra.custo_total;

            -- Update or insert stock balance
            IF FOUND THEN
                UPDATE saldos_estoque 
                SET 
                    quantidade_atual = nova_quantidade,
                    valor_total = novo_valor,
                    data_ultima_movimentacao = NEW.data_compra,
                    atualizado_em = NOW()
                WHERE id = saldo_existente.id;
            ELSE
                INSERT INTO saldos_estoque (
                    estoque_id,
                    item_id,
                    quantidade_atual,
                    valor_total,
                    data_ultima_movimentacao,
                    atualizado_em
                ) VALUES (
                    NEW.estoque_destino_id,
                    item_compra.item_id,
                    item_compra.quantidade,
                    item_compra.custo_total,
                    NEW.data_compra,
                    NOW()
                );
            END IF;

            -- Update item average cost
            UPDATE itens_estoque 
            SET 
                custo_medio = (
                    SELECT COALESCE(AVG(valor_total / NULLIF(quantidade_atual, 0)), 0)
                    FROM saldos_estoque 
                    WHERE item_id = item_compra.item_id 
                      AND quantidade_atual > 0
                ),
                atualizado_em = NOW()
            WHERE id = item_compra.item_id;

        END LOOP;
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
CREATE TRIGGER trg_processar_entrada_compra
    AFTER UPDATE ON entradas_compras
    FOR EACH ROW
    EXECUTE FUNCTION processar_entrada_compra();