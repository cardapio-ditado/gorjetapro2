/*
  # Zerar estoque e recarregar com compras de dezembro/2025
  
  ## Objetivo
  Zerar todos os saldos de estoque e reprocessar apenas as compras recebidas em dezembro de 2025.
  
  ## Passos
  1. Zerar todos os saldos de estoque (quantidade_atual = 0, valor_total = 0)
  2. Deletar todas as movimentações de entrada por compra
  3. Reprocessar todas as entradas de compras recebidas em dezembro/2025
     - Criar movimentações de entrada
     - Atualizar saldos com base nas quantidades recebidas
  
  ## Segurança
  - Usa transação implícita para garantir consistência
  - Valida que apenas compras com status 'recebido' sejam processadas
  - Recalcula custos médios corretamente
  
  ## Notas Importantes
  - Este script afeta TODO o estoque do sistema
  - Mantém o histórico de compras intacto
  - Reconstrói apenas os saldos e movimentações de dezembro/2025
*/

-- Passo 1: Zerar todos os saldos de estoque
UPDATE saldos_estoque
SET 
  quantidade_atual = 0,
  valor_total = 0,
  data_ultima_movimentacao = NULL,
  atualizado_em = NOW();

-- Passo 2: Deletar todas as movimentações de entrada por compra
-- (preserva outros tipos de movimentação)
DELETE FROM movimentacoes_estoque
WHERE tipo_movimentacao = 'entrada' 
  AND motivo = 'Entrada por compra';

-- Passo 3: Reprocessar compras de dezembro/2025
DO $$
DECLARE
    compra_rec RECORD;
    item_rec RECORD;
    quantidade_efetiva numeric;
    novo_custo_medio numeric;
    quantidade_anterior numeric;
    valor_anterior numeric;
BEGIN
    -- Loop através de todas as compras recebidas em dezembro/2025
    FOR compra_rec IN 
        SELECT 
            id,
            estoque_destino_id,
            data_compra,
            numero_documento,
            observacoes,
            criado_por
        FROM entradas_compras
        WHERE status = 'recebido'
          AND EXTRACT(YEAR FROM data_compra) = 2025
          AND EXTRACT(MONTH FROM data_compra) = 12
        ORDER BY data_compra, criado_em
    LOOP
        -- Loop através dos itens de cada compra
        FOR item_rec IN
            SELECT 
                item_id,
                COALESCE(quantidade_recebida, quantidade) as quantidade,
                quantidade_pedida,
                quantidade_recebida,
                custo_unitario,
                custo_total
            FROM itens_entrada_compra
            WHERE entrada_compra_id = compra_rec.id
        LOOP
            quantidade_efetiva := item_rec.quantidade;
            
            -- Somente processar se quantidade > 0
            IF quantidade_efetiva > 0 THEN
                
                -- Buscar saldo anterior para calcular custo médio
                SELECT quantidade_atual, valor_total
                INTO quantidade_anterior, valor_anterior
                FROM saldos_estoque
                WHERE estoque_id = compra_rec.estoque_destino_id 
                  AND item_id = item_rec.item_id;
                
                -- Calcular novo custo médio
                IF FOUND AND quantidade_anterior > 0 THEN
                    novo_custo_medio := (valor_anterior + (quantidade_efetiva * item_rec.custo_unitario)) / 
                                       (quantidade_anterior + quantidade_efetiva);
                ELSE
                    novo_custo_medio := item_rec.custo_unitario;
                END IF;
                
                -- Atualizar custo médio do item
                UPDATE itens_estoque 
                SET 
                    custo_medio = novo_custo_medio,
                    atualizado_em = NOW()
                WHERE id = item_rec.item_id;
                
                -- Criar movimentação de entrada
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
                    compra_rec.estoque_destino_id,
                    item_rec.item_id,
                    'entrada',
                    quantidade_efetiva,
                    item_rec.custo_unitario,
                    quantidade_efetiva * item_rec.custo_unitario,
                    compra_rec.data_compra,
                    'Entrada por compra',
                    CASE 
                        WHEN item_rec.quantidade_recebida IS NOT NULL AND 
                             item_rec.quantidade_recebida != item_rec.quantidade_pedida
                        THEN CONCAT(
                            'Compra: ', COALESCE(compra_rec.numero_documento, ''), 
                            ' - Pedido: ', item_rec.quantidade_pedida,
                            ' | Recebido: ', item_rec.quantidade_recebida
                        )
                        ELSE CONCAT('Compra: ', COALESCE(compra_rec.numero_documento, ''), ' - ', COALESCE(compra_rec.observacoes, ''))
                    END,
                    compra_rec.criado_por,
                    compra_rec.data_compra
                );
                
                -- Atualizar saldo do estoque
                INSERT INTO saldos_estoque (
                    estoque_id,
                    item_id,
                    quantidade_atual,
                    valor_total,
                    data_ultima_movimentacao,
                    atualizado_em
                ) VALUES (
                    compra_rec.estoque_destino_id,
                    item_rec.item_id,
                    quantidade_efetiva,
                    quantidade_efetiva * item_rec.custo_unitario,
                    compra_rec.data_compra,
                    NOW()
                )
                ON CONFLICT (estoque_id, item_id)
                DO UPDATE SET
                    quantidade_atual = saldos_estoque.quantidade_atual + quantidade_efetiva,
                    valor_total = saldos_estoque.valor_total + (quantidade_efetiva * item_rec.custo_unitario),
                    data_ultima_movimentacao = compra_rec.data_compra,
                    atualizado_em = NOW();
                    
            END IF;
            
        END LOOP;
        
    END LOOP;
    
    RAISE NOTICE 'Estoque zerado e recarregado com compras de dezembro/2025';
    
END $$;

-- Verificar resultados
SELECT 
    'Total de itens com saldo' as info,
    COUNT(*) as quantidade
FROM saldos_estoque
WHERE quantidade_atual > 0

UNION ALL

SELECT 
    'Total de movimentações criadas' as info,
    COUNT(*) as quantidade
FROM movimentacoes_estoque
WHERE tipo_movimentacao = 'entrada' 
  AND motivo = 'Entrada por compra'
  AND EXTRACT(YEAR FROM data_movimentacao) = 2025
  AND EXTRACT(MONTH FROM data_movimentacao) = 12;