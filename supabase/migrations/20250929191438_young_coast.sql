/*
  # Corrigir Sincronização de Pagamentos com Fluxo de Caixa

  1. Funções de Sincronização
    - Recriar função `criar_lancamento_fluxo_caixa()` 
    - Recriar função `atualizar_lancamento_fluxo_caixa()`
    - Recriar função `remover_lancamento_fluxo_caixa()`
    - Adicionar função para sincronizar pagamentos existentes

  2. Triggers
    - Recriar triggers da tabela `pagamentos_contas`
    - Garantir que todos os pagamentos sejam sincronizados

  3. Correção
    - Sincronizar pagamentos existentes que não foram para o fluxo
*/

-- Recriar função para criar lançamento no fluxo de caixa
CREATE OR REPLACE FUNCTION criar_lancamento_fluxo_caixa()
RETURNS TRIGGER AS $$
DECLARE
    v_conta_descricao TEXT;
    v_categoria_id UUID;
    v_centro_custo_id UUID;
    v_fornecedor_nome TEXT;
BEGIN
    -- Buscar dados da conta a pagar
    SELECT 
        cp.descricao,
        cp.categoria_id,
        cp.centro_custo_id,
        f.nome
    INTO 
        v_conta_descricao,
        v_categoria_id,
        v_centro_custo_id,
        v_fornecedor_nome
    FROM contas_pagar cp
    LEFT JOIN fornecedores f ON f.id = cp.fornecedor_id
    WHERE cp.id = NEW.conta_pagar_id;

    -- Inserir lançamento no fluxo de caixa
    INSERT INTO fluxo_caixa (
        tipo,
        valor,
        data,
        descricao,
        centro_custo,
        categoria_id,
        conta_bancaria_id,
        forma_pagamento_id,
        conta_pagar_id,
        pagamento_id,
        origem,
        observacoes,
        criado_por
    ) VALUES (
        'saida',
        NEW.valor_pagamento,
        NEW.data_pagamento,
        COALESCE('Pagamento - ' || v_conta_descricao, 'Pagamento a fornecedor'),
        COALESCE(v_fornecedor_nome, 'Fornecedor não identificado'),
        v_categoria_id,
        NEW.conta_bancaria_id,
        NEW.forma_pagamento_id,
        NEW.conta_pagar_id,
        NEW.id,
        'conta_pagar',
        NEW.observacoes,
        NEW.criado_por
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recriar função para atualizar lançamento no fluxo de caixa
CREATE OR REPLACE FUNCTION atualizar_lancamento_fluxo_caixa()
RETURNS TRIGGER AS $$
DECLARE
    v_conta_descricao TEXT;
    v_categoria_id UUID;
    v_centro_custo_id UUID;
    v_fornecedor_nome TEXT;
BEGIN
    -- Buscar dados da conta a pagar
    SELECT 
        cp.descricao,
        cp.categoria_id,
        cp.centro_custo_id,
        f.nome
    INTO 
        v_conta_descricao,
        v_categoria_id,
        v_centro_custo_id,
        v_fornecedor_nome
    FROM contas_pagar cp
    LEFT JOIN fornecedores f ON f.id = cp.fornecedor_id
    WHERE cp.id = NEW.conta_pagar_id;

    -- Atualizar lançamento no fluxo de caixa
    UPDATE fluxo_caixa SET
        valor = NEW.valor_pagamento,
        data = NEW.data_pagamento,
        descricao = COALESCE('Pagamento - ' || v_conta_descricao, 'Pagamento a fornecedor'),
        centro_custo = COALESCE(v_fornecedor_nome, 'Fornecedor não identificado'),
        categoria_id = v_categoria_id,
        conta_bancaria_id = NEW.conta_bancaria_id,
        forma_pagamento_id = NEW.forma_pagamento_id,
        observacoes = NEW.observacoes
    WHERE pagamento_id = NEW.id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recriar função para remover lançamento do fluxo de caixa
CREATE OR REPLACE FUNCTION remover_lancamento_fluxo_caixa()
RETURNS TRIGGER AS $$
BEGIN
    -- Remover lançamento do fluxo de caixa
    DELETE FROM fluxo_caixa 
    WHERE pagamento_id = OLD.id;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Recriar triggers da tabela pagamentos_contas
DROP TRIGGER IF EXISTS trg_pagamento_criar_fluxo ON pagamentos_contas;
CREATE TRIGGER trg_pagamento_criar_fluxo
    AFTER INSERT ON pagamentos_contas
    FOR EACH ROW
    EXECUTE FUNCTION criar_lancamento_fluxo_caixa();

DROP TRIGGER IF EXISTS trg_pagamento_atualizar_fluxo ON pagamentos_contas;
CREATE TRIGGER trg_pagamento_atualizar_fluxo
    AFTER UPDATE ON pagamentos_contas
    FOR EACH ROW
    EXECUTE FUNCTION atualizar_lancamento_fluxo_caixa();

DROP TRIGGER IF EXISTS trg_pagamento_remover_fluxo ON pagamentos_contas;
CREATE TRIGGER trg_pagamento_remover_fluxo
    BEFORE DELETE ON pagamentos_contas
    FOR EACH ROW
    EXECUTE FUNCTION remover_lancamento_fluxo_caixa();

-- Função para sincronizar pagamentos existentes que não estão no fluxo
CREATE OR REPLACE FUNCTION sincronizar_pagamentos_existentes()
RETURNS INTEGER AS $$
DECLARE
    v_pagamento RECORD;
    v_conta_descricao TEXT;
    v_categoria_id UUID;
    v_centro_custo_id UUID;
    v_fornecedor_nome TEXT;
    v_count INTEGER := 0;
BEGIN
    -- Buscar pagamentos que não estão no fluxo de caixa
    FOR v_pagamento IN
        SELECT p.*
        FROM pagamentos_contas p
        LEFT JOIN fluxo_caixa f ON f.pagamento_id = p.id
        WHERE f.id IS NULL
    LOOP
        -- Buscar dados da conta a pagar
        SELECT 
            cp.descricao,
            cp.categoria_id,
            cp.centro_custo_id,
            fo.nome
        INTO 
            v_conta_descricao,
            v_categoria_id,
            v_centro_custo_id,
            v_fornecedor_nome
        FROM contas_pagar cp
        LEFT JOIN fornecedores fo ON fo.id = cp.fornecedor_id
        WHERE cp.id = v_pagamento.conta_pagar_id;

        -- Inserir no fluxo de caixa
        INSERT INTO fluxo_caixa (
            tipo,
            valor,
            data,
            descricao,
            centro_custo,
            categoria_id,
            conta_bancaria_id,
            forma_pagamento_id,
            conta_pagar_id,
            pagamento_id,
            origem,
            observacoes,
            criado_por
        ) VALUES (
            'saida',
            v_pagamento.valor_pagamento,
            v_pagamento.data_pagamento,
            COALESCE('Pagamento - ' || v_conta_descricao, 'Pagamento a fornecedor'),
            COALESCE(v_fornecedor_nome, 'Fornecedor não identificado'),
            v_categoria_id,
            v_pagamento.conta_bancaria_id,
            v_pagamento.forma_pagamento_id,
            v_pagamento.conta_pagar_id,
            v_pagamento.id,
            'conta_pagar',
            v_pagamento.observacoes,
            v_pagamento.criado_por
        );

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Executar sincronização de pagamentos existentes
SELECT sincronizar_pagamentos_existentes() as pagamentos_sincronizados;

-- Comentário sobre o resultado
COMMENT ON FUNCTION sincronizar_pagamentos_existentes() IS 'Sincroniza pagamentos existentes que não foram registrados no fluxo de caixa';