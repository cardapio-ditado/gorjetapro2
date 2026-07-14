/*
  # Recalcular todos os saldos de estoque
  
  ## Problema Identificado
  As tabelas de saldos (estoque_saldos e saldos_estoque) estão vazias ou incompletas,
  mas as movimentações existem. Isso causa inconsistência entre o que foi movimentado
  e o que está registrado como saldo.
  
  ## Solução
  Recalcular TODOS os saldos baseado no histórico completo de movimentações.
  
  ## Processo
  1. Limpar saldos existentes
  2. Recalcular baseado em todas as movimentações
  3. Inserir nas duas tabelas (estoque_saldos e saldos_estoque)
  
  ## Segurança
  - Usa transação implícita da migration
  - Recalcula matematicamente correto
  - Mantém integridade referencial
*/

-- Limpar saldos existentes
DELETE FROM estoque_saldos;
DELETE FROM saldos_estoque;

-- Recalcular saldos baseado em todas as movimentações
DO $$
DECLARE
    estoque_rec RECORD;
    item_rec RECORD;
    saldo_atual NUMERIC;
    valor_atual NUMERIC;
BEGIN
    -- Para cada combinação de estoque + item que tem movimentações
    FOR estoque_rec IN 
        SELECT DISTINCT estoque_id 
        FROM (
            SELECT estoque_origem_id as estoque_id FROM movimentacoes_estoque WHERE estoque_origem_id IS NOT NULL
            UNION
            SELECT estoque_destino_id as estoque_id FROM movimentacoes_estoque WHERE estoque_destino_id IS NOT NULL
        ) t 
        WHERE estoque_id IS NOT NULL
    LOOP
        FOR item_rec IN 
            SELECT DISTINCT item_id 
            FROM movimentacoes_estoque 
            WHERE item_id IS NOT NULL 
              AND (estoque_origem_id = estoque_rec.estoque_id OR estoque_destino_id = estoque_rec.estoque_id)
        LOOP
            -- Calcular saldo para esta combinação estoque+item
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
            
            -- Inserir apenas se saldo positivo (ou zero, para manter histórico)
            IF saldo_atual >= 0 THEN
                -- Inserir em estoque_saldos
                INSERT INTO estoque_saldos (estoque_id, item_estoque_id, quantidade, valor_total, atualizado_em)
                VALUES (estoque_rec.estoque_id, item_rec.item_id, saldo_atual, GREATEST(0, valor_atual), NOW())
                ON CONFLICT (estoque_id, item_estoque_id) 
                DO UPDATE SET 
                    quantidade = saldo_atual,
                    valor_total = GREATEST(0, valor_atual),
                    atualizado_em = NOW();
                
                -- Inserir em saldos_estoque (para compatibilidade)
                INSERT INTO saldos_estoque (estoque_id, item_id, quantidade_atual, valor_total, data_ultima_movimentacao, atualizado_em)
                VALUES (estoque_rec.estoque_id, item_rec.item_id, saldo_atual, GREATEST(0, valor_atual), NOW(), NOW())
                ON CONFLICT (estoque_id, item_id) 
                DO UPDATE SET 
                    quantidade_atual = saldo_atual,
                    valor_total = GREATEST(0, valor_atual),
                    data_ultima_movimentacao = NOW(),
                    atualizado_em = NOW();
            END IF;
        END LOOP;
    END LOOP;
    
    RAISE NOTICE 'Saldos recalculados com sucesso!';
END $$;
