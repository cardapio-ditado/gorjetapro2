/*
  # Trigger para Entrada Automática no Estoque ao Receber Compra

  1. Função
    - `processar_entrada_compra()` - Processa entrada automática no estoque
  
  2. Trigger
    - Executa quando status da compra muda para 'recebido'
    - Cria movimentações de entrada no estoque
    - Atualiza saldos dos itens nos estoques
*/

-- Função para processar entrada automática no estoque
CREATE OR REPLACE FUNCTION processar_entrada_compra()
RETURNS TRIGGER AS $$
DECLARE
    item_compra RECORD;
    saldo_atual RECORD;
BEGIN
    -- Verificar se o status mudou para 'recebido'
    IF NEW.status = 'recebido' AND (OLD.status IS NULL OR OLD.status != 'recebido') THEN
        
        -- Processar cada item da compra
        FOR item_compra IN 
            SELECT 
                iec.item_id,
                iec.quantidade,
                iec.custo_unitario,
                iec.custo_total,
                iec.data_validade
            FROM itens_entrada_compra iec
            WHERE iec.entrada_compra_id = NEW.id
        LOOP
            -- Criar movimentação de entrada no estoque
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
            
            -- Verificar se já existe saldo para este item neste estoque
            SELECT * INTO saldo_atual
            FROM saldos_estoque 
            WHERE estoque_id = NEW.estoque_destino_id 
            AND item_id = item_compra.item_id;
            
            IF FOUND THEN
                -- Atualizar saldo existente
                UPDATE saldos_estoque 
                SET 
                    quantidade_atual = quantidade_atual + item_compra.quantidade,
                    valor_total = valor_total + item_compra.custo_total,
                    data_ultima_movimentacao = NEW.data_compra,
                    atualizado_em = now()
                WHERE estoque_id = NEW.estoque_destino_id 
                AND item_id = item_compra.item_id;
            ELSE
                -- Criar novo saldo
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
            
            -- Atualizar custo médio do item
            UPDATE itens_estoque 
            SET 
                custo_medio = (
                    SELECT 
                        CASE 
                            WHEN SUM(se.quantidade_atual) > 0 
                            THEN SUM(se.valor_total) / SUM(se.quantidade_atual)
                            ELSE custo_medio
                        END
                    FROM saldos_estoque se 
                    WHERE se.item_id = item_compra.item_id
                ),
                atualizado_em = now()
            WHERE id = item_compra.item_id;
            
        END LOOP;
        
        RAISE NOTICE 'Entrada automática processada para compra %', NEW.id;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para processar entrada automática
DROP TRIGGER IF EXISTS trg_processar_entrada_compra ON entradas_compras;

CREATE TRIGGER trg_processar_entrada_compra
    AFTER UPDATE ON entradas_compras
    FOR EACH ROW
    EXECUTE FUNCTION processar_entrada_compra();