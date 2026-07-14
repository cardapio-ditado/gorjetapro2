/*
  # Create triggers to automatically update stock balances

  1. Functions
    - Function to update stock balances when movements are inserted/updated/deleted
    - Handles both estoque_saldos and saldos_estoque tables

  2. Triggers
    - Trigger on movimentacoes_estoque to automatically update balances
    - Works for INSERT, UPDATE, and DELETE operations
*/

-- Function to update stock balances based on movements
CREATE OR REPLACE FUNCTION atualizar_saldos_movimentacao()
RETURNS TRIGGER AS $$
DECLARE
    movimento_rec RECORD;
    saldo_origem RECORD;
    saldo_destino RECORD;
    novo_saldo_origem NUMERIC;
    novo_saldo_destino NUMERIC;
    novo_valor_origem NUMERIC;
    novo_valor_destino NUMERIC;
BEGIN
    -- Determine which record to use (NEW for INSERT/UPDATE, OLD for DELETE)
    IF TG_OP = 'DELETE' THEN
        movimento_rec := OLD;
    ELSE
        movimento_rec := NEW;
    END IF;

    -- Skip if no item_id (invalid movement)
    IF movimento_rec.item_id IS NULL THEN
        IF TG_OP = 'DELETE' THEN
            RETURN OLD;
        ELSE
            RETURN NEW;
        END IF;
    END IF;

    -- Handle movements based on type
    IF movimento_rec.tipo_movimentacao = 'entrada' AND movimento_rec.estoque_destino_id IS NOT NULL THEN
        -- ENTRADA: Add to destination stock
        
        -- Check if balance exists in estoque_saldos
        SELECT * INTO saldo_destino
        FROM estoque_saldos 
        WHERE estoque_id = movimento_rec.estoque_destino_id 
        AND item_estoque_id = movimento_rec.item_id;

        IF TG_OP = 'DELETE' THEN
            -- Remove quantity from destination
            IF FOUND THEN
                novo_saldo_destino := GREATEST(0, saldo_destino.quantidade - movimento_rec.quantidade);
                novo_valor_destino := GREATEST(0, saldo_destino.valor_total - ABS(movimento_rec.custo_total));
                
                IF novo_saldo_destino <= 0 THEN
                    DELETE FROM estoque_saldos WHERE id = saldo_destino.id;
                ELSE
                    UPDATE estoque_saldos 
                    SET quantidade = novo_saldo_destino,
                        valor_total = novo_valor_destino,
                        atualizado_em = NOW()
                    WHERE id = saldo_destino.id;
                END IF;
            END IF;
        ELSE
            -- Add quantity to destination
            IF FOUND THEN
                UPDATE estoque_saldos 
                SET quantidade = saldo_destino.quantidade + movimento_rec.quantidade,
                    valor_total = saldo_destino.valor_total + ABS(movimento_rec.custo_total),
                    atualizado_em = NOW()
                WHERE id = saldo_destino.id;
            ELSE
                INSERT INTO estoque_saldos (estoque_id, item_estoque_id, quantidade, valor_total)
                VALUES (
                    movimento_rec.estoque_destino_id,
                    movimento_rec.item_id,
                    movimento_rec.quantidade,
                    ABS(movimento_rec.custo_total)
                );
            END IF;
        END IF;

        -- Also update saldos_estoque table for compatibility
        SELECT * INTO saldo_destino
        FROM saldos_estoque 
        WHERE estoque_id = movimento_rec.estoque_destino_id 
        AND item_id = movimento_rec.item_id;

        IF TG_OP = 'DELETE' THEN
            IF FOUND THEN
                novo_saldo_destino := GREATEST(0, saldo_destino.quantidade_atual - movimento_rec.quantidade);
                novo_valor_destino := GREATEST(0, saldo_destino.valor_total - ABS(movimento_rec.custo_total));
                
                IF novo_saldo_destino <= 0 THEN
                    DELETE FROM saldos_estoque WHERE id = saldo_destino.id;
                ELSE
                    UPDATE saldos_estoque 
                    SET quantidade_atual = novo_saldo_destino,
                        valor_total = novo_valor_destino,
                        data_ultima_movimentacao = NOW(),
                        atualizado_em = NOW()
                    WHERE id = saldo_destino.id;
                END IF;
            END IF;
        ELSE
            IF FOUND THEN
                UPDATE saldos_estoque 
                SET quantidade_atual = saldo_destino.quantidade_atual + movimento_rec.quantidade,
                    valor_total = saldo_destino.valor_total + ABS(movimento_rec.custo_total),
                    data_ultima_movimentacao = NOW(),
                    atualizado_em = NOW()
                WHERE id = saldo_destino.id;
            ELSE
                INSERT INTO saldos_estoque (estoque_id, item_id, quantidade_atual, valor_total, data_ultima_movimentacao)
                VALUES (
                    movimento_rec.estoque_destino_id,
                    movimento_rec.item_id,
                    movimento_rec.quantidade,
                    ABS(movimento_rec.custo_total),
                    NOW()
                );
            END IF;
        END IF;

    ELSIF movimento_rec.tipo_movimentacao = 'saida' AND movimento_rec.estoque_origem_id IS NOT NULL THEN
        -- SAÍDA: Remove from origin stock
        
        -- Check if balance exists in estoque_saldos
        SELECT * INTO saldo_origem
        FROM estoque_saldos 
        WHERE estoque_id = movimento_rec.estoque_origem_id 
        AND item_estoque_id = movimento_rec.item_id;

        IF TG_OP = 'DELETE' THEN
            -- Add quantity back to origin
            IF FOUND THEN
                UPDATE estoque_saldos 
                SET quantidade = saldo_origem.quantidade + movimento_rec.quantidade,
                    valor_total = saldo_origem.valor_total + ABS(movimento_rec.custo_total),
                    atualizado_em = NOW()
                WHERE id = saldo_origem.id;
            ELSE
                INSERT INTO estoque_saldos (estoque_id, item_estoque_id, quantidade, valor_total)
                VALUES (
                    movimento_rec.estoque_origem_id,
                    movimento_rec.item_id,
                    movimento_rec.quantidade,
                    ABS(movimento_rec.custo_total)
                );
            END IF;
        ELSE
            -- Remove quantity from origin
            IF FOUND THEN
                novo_saldo_origem := GREATEST(0, saldo_origem.quantidade - movimento_rec.quantidade);
                novo_valor_origem := GREATEST(0, saldo_origem.valor_total - ABS(movimento_rec.custo_total));
                
                IF novo_saldo_origem <= 0 THEN
                    DELETE FROM estoque_saldos WHERE id = saldo_origem.id;
                ELSE
                    UPDATE estoque_saldos 
                    SET quantidade = novo_saldo_origem,
                        valor_total = novo_valor_origem,
                        atualizado_em = NOW()
                    WHERE id = saldo_origem.id;
                END IF;
            END IF;
        END IF;

        -- Also update saldos_estoque table for compatibility
        SELECT * INTO saldo_origem
        FROM saldos_estoque 
        WHERE estoque_id = movimento_rec.estoque_origem_id 
        AND item_id = movimento_rec.item_id;

        IF TG_OP = 'DELETE' THEN
            IF FOUND THEN
                UPDATE saldos_estoque 
                SET quantidade_atual = saldo_origem.quantidade_atual + movimento_rec.quantidade,
                    valor_total = saldo_origem.valor_total + ABS(movimento_rec.custo_total),
                    data_ultima_movimentacao = NOW(),
                    atualizado_em = NOW()
                WHERE id = saldo_origem.id;
            ELSE
                INSERT INTO saldos_estoque (estoque_id, item_id, quantidade_atual, valor_total, data_ultima_movimentacao)
                VALUES (
                    movimento_rec.estoque_origem_id,
                    movimento_rec.item_id,
                    movimento_rec.quantidade,
                    ABS(movimento_rec.custo_total),
                    NOW()
                );
            END IF;
        ELSE
            IF FOUND THEN
                novo_saldo_origem := GREATEST(0, saldo_origem.quantidade_atual - movimento_rec.quantidade);
                novo_valor_origem := GREATEST(0, saldo_origem.valor_total - ABS(movimento_rec.custo_total));
                
                IF novo_saldo_origem <= 0 THEN
                    DELETE FROM saldos_estoque WHERE id = saldo_origem.id;
                ELSE
                    UPDATE saldos_estoque 
                    SET quantidade_atual = novo_saldo_origem,
                        valor_total = novo_valor_origem,
                        data_ultima_movimentacao = NOW(),
                        atualizado_em = NOW()
                    WHERE id = saldo_origem.id;
                END IF;
            END IF;
        END IF;

    ELSIF movimento_rec.tipo_movimentacao = 'transferencia' THEN
        -- TRANSFERÊNCIA: Remove from origin and add to destination
        
        -- Handle origin (remove)
        IF movimento_rec.estoque_origem_id IS NOT NULL THEN
            SELECT * INTO saldo_origem
            FROM estoque_saldos 
            WHERE estoque_id = movimento_rec.estoque_origem_id 
            AND item_estoque_id = movimento_rec.item_id;

            IF TG_OP = 'DELETE' THEN
                -- Add quantity back to origin
                IF FOUND THEN
                    UPDATE estoque_saldos 
                    SET quantidade = saldo_origem.quantidade + movimento_rec.quantidade,
                        valor_total = saldo_origem.valor_total + ABS(movimento_rec.custo_total),
                        atualizado_em = NOW()
                    WHERE id = saldo_origem.id;
                ELSE
                    INSERT INTO estoque_saldos (estoque_id, item_estoque_id, quantidade, valor_total)
                    VALUES (
                        movimento_rec.estoque_origem_id,
                        movimento_rec.item_id,
                        movimento_rec.quantidade,
                        ABS(movimento_rec.custo_total)
                    );
                END IF;
            ELSE
                -- Remove quantity from origin
                IF FOUND THEN
                    novo_saldo_origem := GREATEST(0, saldo_origem.quantidade - movimento_rec.quantidade);
                    novo_valor_origem := GREATEST(0, saldo_origem.valor_total - ABS(movimento_rec.custo_total));
                    
                    IF novo_saldo_origem <= 0 THEN
                        DELETE FROM estoque_saldos WHERE id = saldo_origem.id;
                    ELSE
                        UPDATE estoque_saldos 
                        SET quantidade = novo_saldo_origem,
                            valor_total = novo_valor_origem,
                            atualizado_em = NOW()
                        WHERE id = saldo_origem.id;
                    END IF;
                END IF;
            END IF;

            -- Also update saldos_estoque for origin
            SELECT * INTO saldo_origem
            FROM saldos_estoque 
            WHERE estoque_id = movimento_rec.estoque_origem_id 
            AND item_id = movimento_rec.item_id;

            IF TG_OP = 'DELETE' THEN
                IF FOUND THEN
                    UPDATE saldos_estoque 
                    SET quantidade_atual = saldo_origem.quantidade_atual + movimento_rec.quantidade,
                        valor_total = saldo_origem.valor_total + ABS(movimento_rec.custo_total),
                        data_ultima_movimentacao = NOW(),
                        atualizado_em = NOW()
                    WHERE id = saldo_origem.id;
                ELSE
                    INSERT INTO saldos_estoque (estoque_id, item_id, quantidade_atual, valor_total, data_ultima_movimentacao)
                    VALUES (
                        movimento_rec.estoque_origem_id,
                        movimento_rec.item_id,
                        movimento_rec.quantidade,
                        ABS(movimento_rec.custo_total),
                        NOW()
                    );
                END IF;
            ELSE
                IF FOUND THEN
                    novo_saldo_origem := GREATEST(0, saldo_origem.quantidade_atual - movimento_rec.quantidade);
                    novo_valor_origem := GREATEST(0, saldo_origem.valor_total - ABS(movimento_rec.custo_total));
                    
                    IF novo_saldo_origem <= 0 THEN
                        DELETE FROM saldos_estoque WHERE id = saldo_origem.id;
                    ELSE
                        UPDATE saldos_estoque 
                        SET quantidade_atual = novo_saldo_origem,
                            valor_total = novo_valor_origem,
                            data_ultima_movimentacao = NOW(),
                            atualizado_em = NOW()
                        WHERE id = saldo_origem.id;
                    END IF;
                END IF;
            END IF;
        END IF;

        -- Handle destination (add)
        IF movimento_rec.estoque_destino_id IS NOT NULL THEN
            SELECT * INTO saldo_destino
            FROM estoque_saldos 
            WHERE estoque_id = movimento_rec.estoque_destino_id 
            AND item_estoque_id = movimento_rec.item_id;

            IF TG_OP = 'DELETE' THEN
                -- Remove quantity from destination
                IF FOUND THEN
                    novo_saldo_destino := GREATEST(0, saldo_destino.quantidade - movimento_rec.quantidade);
                    novo_valor_destino := GREATEST(0, saldo_destino.valor_total - ABS(movimento_rec.custo_total));
                    
                    IF novo_saldo_destino <= 0 THEN
                        DELETE FROM estoque_saldos WHERE id = saldo_destino.id;
                    ELSE
                        UPDATE estoque_saldos 
                        SET quantidade = novo_saldo_destino,
                            valor_total = novo_valor_destino,
                            atualizado_em = NOW()
                        WHERE id = saldo_destino.id;
                    END IF;
                END IF;
            ELSE
                -- Add quantity to destination
                IF FOUND THEN
                    UPDATE estoque_saldos 
                    SET quantidade = saldo_destino.quantidade + movimento_rec.quantidade,
                        valor_total = saldo_destino.valor_total + ABS(movimento_rec.custo_total),
                        atualizado_em = NOW()
                    WHERE id = saldo_destino.id;
                ELSE
                    INSERT INTO estoque_saldos (estoque_id, item_estoque_id, quantidade, valor_total)
                    VALUES (
                        movimento_rec.estoque_destino_id,
                        movimento_rec.item_id,
                        movimento_rec.quantidade,
                        ABS(movimento_rec.custo_total)
                    );
                END IF;
            END IF;

            -- Also update saldos_estoque for destination
            SELECT * INTO saldo_destino
            FROM saldos_estoque 
            WHERE estoque_id = movimento_rec.estoque_destino_id 
            AND item_id = movimento_rec.item_id;

            IF TG_OP = 'DELETE' THEN
                IF FOUND THEN
                    novo_saldo_destino := GREATEST(0, saldo_destino.quantidade_atual - movimento_rec.quantidade);
                    novo_valor_destino := GREATEST(0, saldo_destino.valor_total - ABS(movimento_rec.custo_total));
                    
                    IF novo_saldo_destino <= 0 THEN
                        DELETE FROM saldos_estoque WHERE id = saldo_destino.id;
                    ELSE
                        UPDATE saldos_estoque 
                        SET quantidade_atual = novo_saldo_destino,
                            valor_total = novo_valor_destino,
                            data_ultima_movimentacao = NOW(),
                            atualizado_em = NOW()
                        WHERE id = saldo_destino.id;
                    END IF;
                END IF;
            ELSE
                IF FOUND THEN
                    UPDATE saldos_estoque 
                    SET quantidade_atual = saldo_destino.quantidade_atual + movimento_rec.quantidade,
                        valor_total = saldo_destino.valor_total + ABS(movimento_rec.custo_total),
                        data_ultima_movimentacao = NOW(),
                        atualizado_em = NOW()
                    WHERE id = saldo_destino.id;
                ELSE
                    INSERT INTO saldos_estoque (estoque_id, item_id, quantidade_atual, valor_total, data_ultima_movimentacao)
                    VALUES (
                        movimento_rec.estoque_destino_id,
                        movimento_rec.item_id,
                        movimento_rec.quantidade,
                        ABS(movimento_rec.custo_total),
                        NOW()
                    );
                END IF;
            END IF;
        END IF;

    ELSIF movimento_rec.tipo_movimentacao = 'ajuste' THEN
        -- AJUSTE: Can be positive or negative, affects one stock
        
        DECLARE
            estoque_afetado UUID;
        BEGIN
            -- Determine which stock is affected
            estoque_afetado := COALESCE(movimento_rec.estoque_destino_id, movimento_rec.estoque_origem_id);
            
            IF estoque_afetado IS NOT NULL THEN
                -- Update estoque_saldos
                SELECT * INTO saldo_destino
                FROM estoque_saldos 
                WHERE estoque_id = estoque_afetado 
                AND item_estoque_id = movimento_rec.item_id;

                IF TG_OP = 'DELETE' THEN
                    -- Reverse the adjustment
                    IF FOUND THEN
                        novo_saldo_destino := GREATEST(0, saldo_destino.quantidade - movimento_rec.quantidade);
                        novo_valor_destino := GREATEST(0, saldo_destino.valor_total - ABS(movimento_rec.custo_total));
                        
                        IF novo_saldo_destino <= 0 THEN
                            DELETE FROM estoque_saldos WHERE id = saldo_destino.id;
                        ELSE
                            UPDATE estoque_saldos 
                            SET quantidade = novo_saldo_destino,
                                valor_total = novo_valor_destino,
                                atualizado_em = NOW()
                            WHERE id = saldo_destino.id;
                        END IF;
                    END IF;
                ELSE
                    -- Apply the adjustment
                    IF FOUND THEN
                        novo_saldo_destino := GREATEST(0, saldo_destino.quantidade + movimento_rec.quantidade);
                        novo_valor_destino := GREATEST(0, saldo_destino.valor_total + ABS(movimento_rec.custo_total));
                        
                        IF novo_saldo_destino <= 0 THEN
                            DELETE FROM estoque_saldos WHERE id = saldo_destino.id;
                        ELSE
                            UPDATE estoque_saldos 
                            SET quantidade = novo_saldo_destino,
                                valor_total = novo_valor_destino,
                                atualizado_em = NOW()
                            WHERE id = saldo_destino.id;
                        END IF;
                    ELSE
                        IF movimento_rec.quantidade > 0 THEN
                            INSERT INTO estoque_saldos (estoque_id, item_estoque_id, quantidade, valor_total)
                            VALUES (
                                estoque_afetado,
                                movimento_rec.item_id,
                                movimento_rec.quantidade,
                                ABS(movimento_rec.custo_total)
                            );
                        END IF;
                    END IF;
                END IF;

                -- Also update saldos_estoque
                SELECT * INTO saldo_destino
                FROM saldos_estoque 
                WHERE estoque_id = estoque_afetado 
                AND item_id = movimento_rec.item_id;

                IF TG_OP = 'DELETE' THEN
                    IF FOUND THEN
                        novo_saldo_destino := GREATEST(0, saldo_destino.quantidade_atual - movimento_rec.quantidade);
                        novo_valor_destino := GREATEST(0, saldo_destino.valor_total - ABS(movimento_rec.custo_total));
                        
                        IF novo_saldo_destino <= 0 THEN
                            DELETE FROM saldos_estoque WHERE id = saldo_destino.id;
                        ELSE
                            UPDATE saldos_estoque 
                            SET quantidade_atual = novo_saldo_destino,
                                valor_total = novo_valor_destino,
                                data_ultima_movimentacao = NOW(),
                                atualizado_em = NOW()
                            WHERE id = saldo_destino.id;
                        END IF;
                    END IF;
                ELSE
                    IF FOUND THEN
                        novo_saldo_destino := GREATEST(0, saldo_destino.quantidade_atual + movimento_rec.quantidade);
                        novo_valor_destino := GREATEST(0, saldo_destino.valor_total + ABS(movimento_rec.custo_total));
                        
                        IF novo_saldo_destino <= 0 THEN
                            DELETE FROM saldos_estoque WHERE id = saldo_destino.id;
                        ELSE
                            UPDATE saldos_estoque 
                            SET quantidade_atual = novo_saldo_destino,
                                valor_total = novo_valor_destino,
                                data_ultima_movimentacao = NOW(),
                                atualizado_em = NOW()
                            WHERE id = saldo_destino.id;
                        END IF;
                    ELSE
                        IF movimento_rec.quantidade > 0 THEN
                            INSERT INTO saldos_estoque (estoque_id, item_id, quantidade_atual, valor_total, data_ultima_movimentacao)
                            VALUES (
                                estoque_afetado,
                                movimento_rec.item_id,
                                movimento_rec.quantidade,
                                ABS(movimento_rec.custo_total),
                                NOW()
                            );
                        END IF;
                    END IF;
                END IF;
            END IF;
        END;
    END IF;

    -- Return appropriate record
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trg_atualizar_saldos_movimentacao ON movimentacoes_estoque;

-- Create trigger to automatically update balances when movements change
CREATE TRIGGER trg_atualizar_saldos_movimentacao
    AFTER INSERT OR UPDATE OR DELETE ON movimentacoes_estoque
    FOR EACH ROW
    EXECUTE FUNCTION atualizar_saldos_movimentacao();

-- Recalculate all existing balances to ensure consistency
DO $$
DECLARE
    estoque_rec RECORD;
    item_rec RECORD;
    saldo_atual NUMERIC;
    valor_atual NUMERIC;
BEGIN
    -- Clear existing balances
    DELETE FROM estoque_saldos;
    DELETE FROM saldos_estoque;
    
    -- Recalculate balances from movements
    FOR estoque_rec IN SELECT DISTINCT estoque_id FROM (
        SELECT estoque_origem_id as estoque_id FROM movimentacoes_estoque WHERE estoque_origem_id IS NOT NULL
        UNION
        SELECT estoque_destino_id as estoque_id FROM movimentacoes_estoque WHERE estoque_destino_id IS NOT NULL
    ) t WHERE estoque_id IS NOT NULL
    LOOP
        FOR item_rec IN SELECT DISTINCT item_id FROM movimentacoes_estoque 
            WHERE item_id IS NOT NULL 
            AND (estoque_origem_id = estoque_rec.estoque_id OR estoque_destino_id = estoque_rec.estoque_id)
        LOOP
            -- Calculate balance for this stock+item combination
            SELECT 
                COALESCE(SUM(
                    CASE 
                        WHEN estoque_destino_id = estoque_rec.estoque_id THEN quantidade
                        WHEN estoque_origem_id = estoque_rec.estoque_id THEN -quantidade
                        ELSE 0
                    END
                ), 0),
                COALESCE(SUM(
                    CASE 
                        WHEN estoque_destino_id = estoque_rec.estoque_id THEN ABS(custo_total)
                        WHEN estoque_origem_id = estoque_rec.estoque_id THEN -ABS(custo_total)
                        ELSE 0
                    END
                ), 0)
            INTO saldo_atual, valor_atual
            FROM movimentacoes_estoque
            WHERE item_id = item_rec.item_id
            AND (estoque_origem_id = estoque_rec.estoque_id OR estoque_destino_id = estoque_rec.estoque_id);
            
            -- Only insert if positive balance
            IF saldo_atual > 0 THEN
                -- Insert into estoque_saldos
                INSERT INTO estoque_saldos (estoque_id, item_estoque_id, quantidade, valor_total)
                VALUES (estoque_rec.estoque_id, item_rec.item_id, saldo_atual, GREATEST(0, valor_atual))
                ON CONFLICT (estoque_id, item_estoque_id) 
                DO UPDATE SET 
                    quantidade = saldo_atual,
                    valor_total = GREATEST(0, valor_atual),
                    atualizado_em = NOW();
                
                -- Insert into saldos_estoque for compatibility
                INSERT INTO saldos_estoque (estoque_id, item_id, quantidade_atual, valor_total, data_ultima_movimentacao)
                VALUES (estoque_rec.estoque_id, item_rec.item_id, saldo_atual, GREATEST(0, valor_atual), NOW())
                ON CONFLICT (estoque_id, item_id) 
                DO UPDATE SET 
                    quantidade_atual = saldo_atual,
                    valor_total = GREATEST(0, valor_atual),
                    data_ultima_movimentacao = NOW(),
                    atualizado_em = NOW();
            END IF;
        END LOOP;
    END LOOP;
END $$;