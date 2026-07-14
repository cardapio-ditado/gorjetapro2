/*
  # Corrigir trigger para usar quantidade recebida

  ## Descrição
  Atualiza o trigger de processamento de entrada de compras para usar a quantidade
  efetivamente recebida (quantidade_recebida) ao invés da quantidade pedida.

  ## Mudanças
  
  1. Modificar função `processar_entrada_compra`:
     - Usar COALESCE(quantidade_recebida, quantidade) para entrada no estoque
     - Priorizar quantidade_recebida quando disponível
     - Fallback para quantidade (compatibilidade com compras antigas)

  ## Comportamento
  - Se quantidade_recebida está preenchida: usa ela
  - Se não está preenchida: usa quantidade (compras antigas)
  - Garante que o estoque reflita exatamente o que foi recebido
*/

-- Recriar função para processar entrada de compra usando quantidade recebida
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
            
            -- Check if stock balance record exists
            SELECT quantidade, valor_total
            INTO quantidade_anterior, valor_anterior
            FROM saldos_estoque
            WHERE estoque_id = NEW.estoque_destino_id 
            AND item_estoque_id = item_entrada.item_id;
            
            IF FOUND THEN
                -- Calculate new average cost
                novo_custo_medio := (valor_anterior + (quantidade_efetiva * item_entrada.custo_unitario)) / 
                                   (quantidade_anterior + quantidade_efetiva);
                
                -- Update existing stock balance
                UPDATE saldos_estoque 
                SET 
                    quantidade = quantidade_anterior + quantidade_efetiva,
                    valor_total = valor_anterior + (quantidade_efetiva * item_entrada.custo_unitario),
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
            
        END LOOP;
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recriar o trigger
DROP TRIGGER IF EXISTS trg_processar_entrada_compra ON entradas_compras;

CREATE TRIGGER trg_processar_entrada_compra
    AFTER UPDATE ON entradas_compras
    FOR EACH ROW
    EXECUTE FUNCTION processar_entrada_compra();

-- Grant permissions
GRANT EXECUTE ON FUNCTION processar_entrada_compra() TO anon, authenticated;