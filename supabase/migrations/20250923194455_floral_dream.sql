/*
  # Trigger para Processamento Automático de Produção

  1. Nova Função
    - `processar_conclusao_producao()` - Processa automaticamente quando produção é concluída
    - Consome ingredientes do estoque
    - Gera produto final no estoque

  2. Novo Trigger
    - Executa após UPDATE na tabela `producoes`
    - Ativa quando status muda para 'concluido'

  3. Funcionalidades
    - Busca ingredientes da ficha técnica
    - Cria movimentações de saída para ingredientes (multiplicado pela quantidade produzida)
    - Cria movimentação de entrada para produto final (se aplicável)
    - Atualiza saldos automaticamente via triggers existentes
*/

-- Função para processar conclusão de produção
CREATE OR REPLACE FUNCTION processar_conclusao_producao()
RETURNS TRIGGER AS $$
DECLARE
    ingrediente_record RECORD;
    ficha_record RECORD;
    quantidade_consumo NUMERIC;
    custo_unitario NUMERIC;
    custo_total NUMERIC;
    estoque_producao_id UUID;
BEGIN
    -- Só processa se status mudou para 'concluido'
    IF NEW.status = 'concluido' AND (OLD.status IS NULL OR OLD.status != 'concluido') THEN
        
        -- Buscar dados da ficha técnica
        SELECT * INTO ficha_record
        FROM fichas_tecnicas 
        WHERE id = NEW.ficha_id;
        
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Ficha técnica não encontrada: %', NEW.ficha_id;
        END IF;
        
        -- Buscar estoque de produção (padrão ou primeiro disponível)
        SELECT id INTO estoque_producao_id
        FROM estoques 
        WHERE tipo = 'producao' AND status = true
        ORDER BY nome
        LIMIT 1;
        
        -- Se não encontrar estoque de produção, usar o primeiro estoque ativo
        IF estoque_producao_id IS NULL THEN
            SELECT id INTO estoque_producao_id
            FROM estoques 
            WHERE status = true
            ORDER BY nome
            LIMIT 1;
        END IF;
        
        IF estoque_producao_id IS NULL THEN
            RAISE EXCEPTION 'Nenhum estoque ativo encontrado para processar produção';
        END IF;
        
        -- Processar cada ingrediente da ficha técnica
        FOR ingrediente_record IN 
            SELECT 
                fi.item_estoque_id,
                fi.quantidade as quantidade_receita,
                ie.nome as item_nome,
                ie.custo_medio
            FROM ficha_ingredientes fi
            JOIN itens_estoque ie ON ie.id = fi.item_estoque_id
            WHERE fi.ficha_id = NEW.ficha_id
        LOOP
            -- Calcular quantidade total a ser consumida (quantidade da receita * quantidade de produções)
            quantidade_consumo := ingrediente_record.quantidade_receita * NEW.quantidade;
            custo_unitario := ingrediente_record.custo_medio;
            custo_total := quantidade_consumo * custo_unitario;
            
            -- Verificar se há quantidade suficiente no estoque
            IF NOT EXISTS (
                SELECT 1 FROM estoque_saldos 
                WHERE estoque_id = estoque_producao_id 
                AND item_estoque_id = ingrediente_record.item_estoque_id 
                AND quantidade >= quantidade_consumo
            ) THEN
                RAISE EXCEPTION 'Quantidade insuficiente do ingrediente % no estoque. Necessário: %, mas há apenas: %', 
                    ingrediente_record.item_nome, 
                    quantidade_consumo,
                    COALESCE((
                        SELECT quantidade FROM estoque_saldos 
                        WHERE estoque_id = estoque_producao_id 
                        AND item_estoque_id = ingrediente_record.item_estoque_id
                    ), 0);
            END IF;
            
            -- Criar movimentação de saída do ingrediente
            INSERT INTO movimentacoes_estoque (
                estoque_origem_id,
                item_id,
                tipo_movimentacao,
                quantidade,
                custo_unitario,
                custo_total,
                motivo,
                observacoes
            ) VALUES (
                estoque_producao_id,
                ingrediente_record.item_estoque_id,
                'saida',
                quantidade_consumo,
                custo_unitario,
                custo_total,
                'Consumo para produção: ' || ficha_record.nome,
                'Produção ID: ' || NEW.id || ' - Quantidade: ' || NEW.quantidade || ' receitas'
            );
        END LOOP;
        
        -- Verificar se a ficha técnica é de produto final para gerar entrada
        -- Assumimos que se tem ingredientes, produz um produto final
        IF EXISTS (
            SELECT 1 FROM ficha_ingredientes 
            WHERE ficha_id = NEW.ficha_id
        ) THEN
            -- Buscar ou criar item de estoque para o produto final
            DECLARE
                produto_final_id UUID;
                porcoes_totais INTEGER;
                custo_unitario_produto NUMERIC;
                custo_total_produto NUMERIC;
            BEGIN
                -- Tentar encontrar item existente com o nome da ficha
                SELECT id INTO produto_final_id
                FROM itens_estoque 
                WHERE nome = ficha_record.nome 
                AND tipo_item = 'produto_final'
                AND status = 'ativo';
                
                -- Se não encontrar, criar novo item
                IF produto_final_id IS NULL THEN
                    INSERT INTO itens_estoque (
                        nome,
                        descricao,
                        tipo_item,
                        categoria,
                        unidade_medida,
                        custo_medio,
                        tem_validade,
                        status
                    ) VALUES (
                        ficha_record.nome,
                        'Produto gerado automaticamente pela produção',
                        'produto_final',
                        ficha_record.categoria,
                        'unidade',
                        COALESCE(ficha_record.custo_total, 0),
                        false,
                        'ativo'
                    ) RETURNING id INTO produto_final_id;
                END IF;
                
                -- Calcular quantidade total de porções produzidas
                porcoes_totais := COALESCE(ficha_record.porcoes, 1) * NEW.quantidade;
                custo_unitario_produto := COALESCE(ficha_record.custo_total, 0);
                custo_total_produto := custo_unitario_produto * NEW.quantidade;
                
                -- Criar movimentação de entrada do produto final
                INSERT INTO movimentacoes_estoque (
                    estoque_destino_id,
                    item_id,
                    tipo_movimentacao,
                    quantidade,
                    custo_unitario,
                    custo_total,
                    motivo,
                    observacoes
                ) VALUES (
                    estoque_producao_id,
                    produto_final_id,
                    'entrada',
                    porcoes_totais,
                    custo_unitario_produto / NULLIF(COALESCE(ficha_record.porcoes, 1), 0),
                    custo_total_produto,
                    'Produção concluída: ' || ficha_record.nome,
                    'Produção ID: ' || NEW.id || ' - ' || NEW.quantidade || ' receitas produzidas = ' || porcoes_totais || ' porções'
                );
            END;
        END IF;
        
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para processar produção automaticamente
DROP TRIGGER IF EXISTS trg_processar_conclusao_producao ON producoes;
CREATE TRIGGER trg_processar_conclusao_producao
    AFTER UPDATE ON producoes
    FOR EACH ROW
    EXECUTE FUNCTION processar_conclusao_producao();