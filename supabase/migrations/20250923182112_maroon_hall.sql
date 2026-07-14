/*
  # Fix Purchase Processing - Automatic Stock Update

  1. Functions
    - Recreate `processar_entrada_compra()` function to properly update stock balances
    - Handle stock balance updates (saldos_estoque table)
    - Create stock movements (movimentacoes_estoque table)
    - Update item average costs

  2. Triggers
    - Ensure trigger fires correctly when purchase status changes to 'recebido'
    - Only process purchases that change from non-'recebido' to 'recebido'

  3. Security
    - Maintain existing RLS policies
*/

-- Drop existing function if it exists to recreate with correct logic
DROP FUNCTION IF EXISTS processar_entrada_compra() CASCADE;

-- Create the purchase processing function
CREATE OR REPLACE FUNCTION processar_entrada_compra()
RETURNS TRIGGER AS $$
DECLARE
    item_entrada RECORD;
    saldo_atual RECORD;
    novo_custo_medio NUMERIC(10,2);
    quantidade_anterior NUMERIC(12,3);
    valor_anterior NUMERIC(14,2);
BEGIN
    -- Only process if status changed TO 'recebido' (not if it was already 'recebido')
    IF NEW.status = 'recebido' AND (OLD.status IS NULL OR OLD.status != 'recebido') THEN
        
        -- Process each item in the purchase
        FOR item_entrada IN 
            SELECT * FROM itens_entrada_compra 
            WHERE entrada_compra_id = NEW.id
        LOOP
            -- Check if item already has stock balance in the destination warehouse
            SELECT * INTO saldo_atual 
            FROM saldos_estoque 
            WHERE estoque_id = NEW.estoque_destino_id 
            AND item_estoque_id = item_entrada.item_id;
            
            IF FOUND THEN
                -- Update existing stock balance
                quantidade_anterior := COALESCE(saldo_atual.quantidade, 0);
                valor_anterior := COALESCE(saldo_atual.valor_total, 0);
                
                -- Calculate new weighted average cost
                IF (quantidade_anterior + item_entrada.quantidade) > 0 THEN
                    novo_custo_medio := (valor_anterior + item_entrada.custo_total) / (quantidade_anterior + item_entrada.quantidade);
                ELSE
                    novo_custo_medio := item_entrada.custo_unitario;
                END IF;
                
                -- Update stock balance
                UPDATE saldos_estoque 
                SET 
                    quantidade = quantidade_anterior + item_entrada.quantidade,
                    valor_total = valor_anterior + item_entrada.custo_total,
                    data_ultima_movimentacao = NOW(),
                    atualizado_em = NOW()
                WHERE estoque_id = NEW.estoque_destino_id 
                AND item_estoque_id = item_entrada.item_id;
                
            ELSE
                -- Create new stock balance record
                novo_custo_medio := item_entrada.custo_unitario;
                
                INSERT INTO saldos_estoque (
                    estoque_id,
                    item_estoque_id,
                    quantidade,
                    valor_total,
                    data_ultima_movimentacao,
                    atualizado_em
                ) VALUES (
                    NEW.estoque_destino_id,
                    item_entrada.item_id,
                    item_entrada.quantidade,
                    item_entrada.custo_total,
                    NOW(),
                    NOW()
                );
            END IF;
            
            -- Update item average cost
            UPDATE itens_estoque 
            SET 
                custo_medio = novo_custo_medio,
                atualizado_em = NOW()
            WHERE id = item_entrada.item_id;
            
            -- Create stock movement record
            INSERT INTO movimentacoes_estoque (
                estoque_origem_id,
                estoque_destino_id,
                item_id,
                tipo_movimentacao,
                quantidade,
                custo_unitario,
                custo_total,
                data_movimentacao,
                motivo,
                observacoes,
                criado_por,
                criado_em
            ) VALUES (
                NULL, -- No origin stock for purchases
                NEW.estoque_destino_id,
                item_entrada.item_id,
                'entrada',
                item_entrada.quantidade,
                item_entrada.custo_unitario,
                item_entrada.custo_total,
                NEW.data_compra,
                'Entrada por compra',
                CONCAT('Compra: ', COALESCE(NEW.numero_documento, ''), ' - ', COALESCE(NEW.observacoes, '')),
                NEW.criado_por,
                NOW()
            );
            
        END LOOP;
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate the trigger
DROP TRIGGER IF EXISTS trg_processar_entrada_compra ON entradas_compras;

CREATE TRIGGER trg_processar_entrada_compra
    AFTER UPDATE ON entradas_compras
    FOR EACH ROW
    EXECUTE FUNCTION processar_entrada_compra();

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION processar_entrada_compra() TO anon, authenticated;