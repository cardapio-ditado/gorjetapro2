/*
  # Corrigir trigger para usar nomes corretos de colunas em saldos_estoque
  
  ## Descrição
  O trigger processar_entrada_compra estava usando nomes incorretos de colunas:
  - quantidade -> quantidade_atual
  - item_estoque_id -> item_id
  
  ## Mudanças
  - Atualizar todas as referências para usar os nomes corretos das colunas
*/

CREATE OR REPLACE FUNCTION processar_entrada_compra()
RETURNS TRIGGER AS $$
DECLARE
    item_entrada RECORD;
    quantidade_anterior numeric;
    valor_anterior numeric;
    novo_custo_medio numeric;
    quantidade_efetiva numeric;
BEGIN
    -- Only process when status changes to 'recebido'
    IF NEW.status = 'recebido' AND (OLD.status IS NULL OR OLD.status != 'recebido') THEN
        
        -- Loop through all items in the purchase
        FOR item_entrada IN 
            SELECT 
                item_id,
                -- Usar quantidade_recebida se disponível, senão quantidade
                COALESCE(quantidade_recebida, quantidade) as quantidade,
                quantidade_pedida,
                quantidade_recebida,
                custo_unitario,
                custo_total
            FROM itens_entrada_compra
            WHERE entrada_compra_id = NEW.id
        LOOP
            -- Quantidade efetiva para entrada no estoque
            quantidade_efetiva := item_entrada.quantidade;
            
            -- VALIDAÇÃO: Somente processar se quantidade > 0
            IF quantidade_efetiva > 0 THEN
                
                -- Check if stock balance record exists
                SELECT quantidade_atual, valor_total
                INTO quantidade_anterior, valor_anterior
                FROM saldos_estoque
                WHERE estoque_id = NEW.estoque_destino_id 
                AND item_id = item_entrada.item_id;
                
                IF FOUND THEN
                    -- Calculate new average cost
                    novo_custo_medio := (valor_anterior + (quantidade_efetiva * item_entrada.custo_unitario)) / 
                                       (quantidade_anterior + quantidade_efetiva);
                    
                    -- Update existing stock balance
                    UPDATE saldos_estoque 
                    SET 
                        quantidade_atual = quantidade_anterior + quantidade_efetiva,
                        valor_total = valor_anterior + (quantidade_efetiva * item_entrada.custo_unitario),
                        data_ultima_movimentacao = NOW(),
                        atualizado_em = NOW()
                    WHERE estoque_id = NEW.estoque_destino_id 
                    AND item_id = item_entrada.item_id;
                    
                ELSE
                    -- Create new stock balance record
                    novo_custo_medio := item_entrada.custo_unitario;
                    
                    INSERT INTO saldos_estoque (
                        estoque_id,
                        item_id,
                        quantidade_atual,
                        valor_total,
                        data_ultima_movimentacao,
                        atualizado_em
                    ) VALUES (
                        NEW.estoque_destino_id,
                        item_entrada.item_id,
                        quantidade_efetiva,
                        quantidade_efetiva * item_entrada.custo_unitario,
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
                
                -- Create stock movement record with actual received quantity
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
                    NULL,
                    NEW.estoque_destino_id,
                    item_entrada.item_id,
                    'entrada',
                    quantidade_efetiva,
                    item_entrada.custo_unitario,
                    quantidade_efetiva * item_entrada.custo_unitario,
                    NEW.data_compra,
                    'Entrada por compra',
                    CASE 
                        WHEN item_entrada.quantidade_recebida IS NOT NULL AND 
                             item_entrada.quantidade_recebida != item_entrada.quantidade_pedida
                        THEN CONCAT(
                            'Compra: ', COALESCE(NEW.numero_documento, ''), 
                            ' - Pedido: ', item_entrada.quantidade_pedida,
                            ' | Recebido: ', item_entrada.quantidade_recebida
                        )
                        ELSE CONCAT('Compra: ', COALESCE(NEW.numero_documento, ''), ' - ', COALESCE(NEW.observacoes, ''))
                    END,
                    NEW.criado_por,
                    NOW()
                );
                
            END IF; -- Fim da validação quantidade > 0
            
        END LOOP;
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;