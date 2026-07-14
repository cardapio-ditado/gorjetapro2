/*
  # Unificar Categoria de Músicos para "Cachê de Músicos"

  ## Objetivo
  Consolidar todas as contas de músicos em uma única categoria "Cachê de Músicos",
  eliminando a categoria "Músicos e Artistas" para evitar confusão.

  ## Alterações
  1. Criar categoria "Cachê de Músicos" se não existir
  2. Migrar todos os lançamentos de "Músicos e Artistas" para "Cachê de Músicos"
  3. Atualizar triggers para usar "Cachê de Músicos"
  4. Deletar categoria "Músicos e Artistas"

  ## Notas
  - Mantém integridade referencial
  - Atualiza automaticamente contas_pagar e fluxo_caixa
*/

DO $$
DECLARE
  v_categoria_pai_id uuid;
  v_categoria_cache_id uuid;
  v_categoria_antiga_id uuid;
  v_count integer;
BEGIN
  -- Buscar categoria pai "Despesas Operacionais"
  SELECT id INTO v_categoria_pai_id
  FROM categorias_financeiras
  WHERE nome = 'Despesas Operacionais' AND tipo = 'despesa' AND categoria_pai_id IS NULL
  LIMIT 1;

  -- Se não existir, criar
  IF v_categoria_pai_id IS NULL THEN
    INSERT INTO categorias_financeiras (nome, tipo, categoria_pai_id, status)
    VALUES ('Despesas Operacionais', 'despesa', NULL, 'ativo')
    RETURNING id INTO v_categoria_pai_id;
    RAISE NOTICE '✅ Criada categoria pai "Despesas Operacionais"';
  END IF;

  -- Verificar se existe "Cachê de Músicos"
  SELECT id INTO v_categoria_cache_id
  FROM categorias_financeiras
  WHERE nome = 'Cachê de Músicos' AND tipo = 'despesa';

  -- Criar "Cachê de Músicos" se não existir
  IF v_categoria_cache_id IS NULL THEN
    INSERT INTO categorias_financeiras (nome, tipo, categoria_pai_id, status)
    VALUES ('Cachê de Músicos', 'despesa', v_categoria_pai_id, 'ativo')
    RETURNING id INTO v_categoria_cache_id;
    RAISE NOTICE '✅ Criada categoria "Cachê de Músicos"';
  ELSE
    RAISE NOTICE '✅ Categoria "Cachê de Músicos" já existe';
  END IF;

  -- Buscar categoria antiga "Músicos e Artistas"
  SELECT id INTO v_categoria_antiga_id
  FROM categorias_financeiras
  WHERE nome = 'Músicos e Artistas' AND tipo = 'despesa';

  -- Se a categoria antiga existir, fazer a migração
  IF v_categoria_antiga_id IS NOT NULL THEN
    RAISE NOTICE '📋 Iniciando migração de "Músicos e Artistas" para "Cachê de Músicos"';

    -- Migrar contas_pagar
    UPDATE contas_pagar
    SET categoria_id = v_categoria_cache_id
    WHERE categoria_id = v_categoria_antiga_id;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '  ✅ Migradas % contas a pagar', v_count;

    -- Migrar fluxo_caixa
    UPDATE fluxo_caixa
    SET categoria_id = v_categoria_cache_id
    WHERE categoria_id = v_categoria_antiga_id;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '  ✅ Migrados % lançamentos de fluxo de caixa', v_count;

    -- Migrar contas_receber (se houver)
    UPDATE contas_receber
    SET categoria_id = v_categoria_cache_id
    WHERE categoria_id = v_categoria_antiga_id;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RAISE NOTICE '  ✅ Migradas % contas a receber', v_count;

    -- Deletar categoria antiga
    DELETE FROM categorias_financeiras
    WHERE id = v_categoria_antiga_id;

    RAISE NOTICE '  ✅ Deletada categoria "Músicos e Artistas"';
  ELSE
    RAISE NOTICE '⚠️  Categoria "Músicos e Artistas" não encontrada';
  END IF;

  RAISE NOTICE '✅ Migração concluída!';
END $$;

-- Atualizar função de sincronização para usar "Cachê de Músicos"
CREATE OR REPLACE FUNCTION sincronizar_musico_para_conta_pagar()
RETURNS TRIGGER AS $$
DECLARE
    v_conta_id uuid;
    v_fornecedor_id uuid;
    v_valor_pago_conta numeric;
BEGIN
    -- Buscar a conta a pagar vinculada a este músico
    SELECT id, fornecedor_id, valor_pago
    INTO v_conta_id, v_fornecedor_id, v_valor_pago_conta
    FROM contas_pagar
    WHERE origem_modulo = 'musicos'
      AND origem_id = NEW.id;

    -- Se existe conta vinculada, atualizar
    IF v_conta_id IS NOT NULL THEN
        UPDATE contas_pagar
        SET
            valor_total = NEW.valor_total_final,
            valor_original = NEW.valor_total_final,
            valor_final = NEW.valor_total_final,
            descricao = 'Pagamento Músico: ' || COALESCE(NEW.nome, 'Sem nome') || ' - ' ||
                       COALESCE(NEW.data_evento::text, 'Sem data'),
            data_vencimento = COALESCE(NEW.data_evento::date, CURRENT_DATE),
            status = CASE
                WHEN (NEW.valor_total_final - COALESCE(v_valor_pago_conta, 0)) <= 0 AND NEW.valor_total_final > 0 THEN 'pago'
                WHEN NEW.status_pagamento = 'cancelado' THEN 'cancelado'
                ELSE 'em_aberto'
            END,
            atualizado_em = now()
        WHERE id = v_conta_id;

    -- Se não existe e há fornecedor_id, criar nova conta
    ELSIF NEW.fornecedor_id IS NOT NULL AND NEW.valor_total_final > 0 THEN
        INSERT INTO contas_pagar (
            fornecedor_id,
            descricao,
            categoria_id,
            valor_total,
            valor_original,
            valor_final,
            valor_pago,
            data_vencimento,
            data_emissao,
            status,
            tipo_pagamento,
            origem_modulo,
            origem_id
        ) VALUES (
            NEW.fornecedor_id,
            'Pagamento Músico: ' || COALESCE(NEW.nome, 'Sem nome') || ' - ' ||
            COALESCE(NEW.data_evento::text, 'Sem data'),
            (SELECT id FROM categorias_financeiras WHERE nome = 'Cachê de Músicos' LIMIT 1),
            NEW.valor_total_final,
            NEW.valor_total_final,
            NEW.valor_total_final,
            0,
            COALESCE(NEW.data_evento::date, CURRENT_DATE),
            CURRENT_DATE,
            CASE
                WHEN NEW.status_pagamento = 'cancelado' THEN 'cancelado'
                ELSE 'em_aberto'
            END,
            'unica',
            'musicos',
            NEW.id
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recriar o trigger
DROP TRIGGER IF EXISTS trg_sincronizar_musico_conta ON musicos;
CREATE TRIGGER trg_sincronizar_musico_conta
    AFTER INSERT OR UPDATE OF valor_total_final, fornecedor_id, nome, data_evento, status_pagamento
    ON musicos
    FOR EACH ROW
    EXECUTE FUNCTION sincronizar_musico_para_conta_pagar();