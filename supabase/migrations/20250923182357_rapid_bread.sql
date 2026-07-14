-- Fix column name in purchase processing trigger function
-- The error occurs because the function was referencing 'item_estoque_id' 
-- but the correct column name in 'itens_entrada_compra' table is 'item_id'

CREATE OR REPLACE FUNCTION processar_entrada_compra()
RETURNS TRIGGER AS $$
DECLARE
    item_record RECORD;
    saldo_atual RECORD;
    novo_custo_medio NUMERIC;
    quantidade_anterior NUMERIC;
    valor_anterior NUMERIC;
BEGIN
    -- Só processar se o status mudou para 'recebido'
    IF NEW.status = 'recebido' AND (OLD.status IS NULL OR OLD.status != 'recebido') THEN
        
        -- Buscar todos os itens desta compra
        FOR item_record IN 
            SELECT * FROM itens_entrada_compra 
            WHERE entrada_compra_id = NEW.id
        LOOP
            -- Buscar saldo atual do item no estoque
            SELECT * INTO saldo_atual
            FROM estoque_saldos 
            WHERE estoque_id = NEW.estoque_destino_id 
            AND item_estoque_id = item_record.item_id;
            
            IF FOUND THEN
                -- Item já existe no estoque - atualizar saldo
                quantidade_anterior := COALESCE(saldo_atual.quantidade, 0);
                valor_anterior := COALESCE(saldo_atual.valor_total, 0);
                
                -- Calcular novo custo médio ponderado
                IF (quantidade_anterior + item_record.quantidade) > 0 THEN
                    novo_custo_medio := (valor_anterior + item_record.custo_total) / 
                                      (quantidade_anterior + item_record.quantidade);
                ELSE
                    novo_custo_medio := item_record.custo_unitario;
                END IF;
                
                -- Atualizar saldo
                UPDATE estoque_saldos 
                SET quantidade = quantidade_anterior + item_record.quantidade,
                    valor_total = valor_anterior + item_record.custo_total,
                    atualizado_em = NOW()
                WHERE id = saldo_atual.id;
                
                -- Atualizar custo médio do item
                UPDATE itens_estoque 
                SET custo_medio = novo_custo_medio,
                    atualizado_em = NOW()
                WHERE id = item_record.item_id;
                
            ELSE
                -- Item não existe no estoque - criar novo saldo
                INSERT INTO estoque_saldos (
                    estoque_id, 
                    item_estoque_id, 
                    quantidade, 
                    valor_total,
                    atualizado_em
                ) VALUES (
                    NEW.estoque_destino_id,
                    item_record.item_id,
                    item_record.quantidade,
                    item_record.custo_total,
                    NOW()
                );
                
                -- Atualizar custo médio do item
                UPDATE itens_estoque 
                SET custo_medio = item_record.custo_unitario,
                    atualizado_em = NOW()
                WHERE id = item_record.item_id;
            END IF;
            
            -- Criar movimentação de estoque
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
                criado_em
            ) VALUES (
                NEW.estoque_destino_id,
                item_record.item_id,
                'entrada',
                item_record.quantidade,
                item_record.custo_unitario,
                item_record.custo_total,
                NEW.data_compra,
                'Entrada por compra',
                CASE 
                    WHEN NEW.numero_documento IS NOT NULL 
                    THEN 'Documento: ' || NEW.numero_documento 
                    ELSE 'Compra ID: ' || NEW.id::text 
                END,
                NOW()
            );
            
        END LOOP;
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recriar o trigger se não existir
DROP TRIGGER IF EXISTS trg_processar_entrada_compra ON entradas_compras;
CREATE TRIGGER trg_processar_entrada_compra
    AFTER UPDATE ON entradas_compras
    FOR EACH ROW
    EXECUTE FUNCTION processar_entrada_compra();