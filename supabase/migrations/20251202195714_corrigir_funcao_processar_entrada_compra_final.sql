/*
  # Corrigir função processar_entrada_compra
  
  ## Problema
  A função está usando nomes de colunas errados:
  - Usa `quantidade` mas deve ser `quantidade_atual`
  - Usa `item_estoque_id` mas deve ser `item_id`
  
  ## Solução
  Corrigir todos os nomes de colunas para corresponder à estrutura atual da tabela saldos_estoque
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
                
                -- Buscar saldo anterior apenas para calcular custo médio
                SELECT quantidade_atual, valor_total
                INTO quantidade_anterior, valor_anterior
                FROM saldos_estoque
                WHERE estoque_id = NEW.estoque_destino_id 
                AND item_id = item_entrada.item_id;
                
                -- Calcular novo custo médio
                IF FOUND THEN
                    novo_custo_medio := (valor_anterior + (quantidade_efetiva * item_entrada.custo_unitario)) / 
                                       (quantidade_anterior + quantidade_efetiva);
                ELSE
                    novo_custo_medio := item_entrada.custo_unitario;
                END IF;
                
                -- Atualizar apenas o custo médio do item
                UPDATE itens_estoque 
                SET 
                    custo_medio = novo_custo_medio,
                    atualizado_em = NOW()
                WHERE id = item_entrada.item_id;
                
                -- Criar apenas a movimentação
                -- O trigger atualizar_saldos_movimentacao fará o resto automaticamente
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

-- Grant permissions
GRANT EXECUTE ON FUNCTION processar_entrada_compra() TO anon, authenticated;
