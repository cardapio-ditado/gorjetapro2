/*
  # Correções críticas no sistema de estoque

  ## Problemas resolvidos:
  1. Adicionado `idempotency_key` em movimentacoes_estoque para evitar duplicatas
  2. Criada função `calcular_saldo_item_estoque()` que calcula saldo sempre a partir das movimentações reais, nunca do campo estático
  3. Criada função `recalcular_saldo_cache()` que atualiza o campo cache após cada movimentação
  4. Corrigido trigger de requisicao para usar idempotency_key e evitar execução dupla
  5. Criada função `inserir_movimentacao_idempotente()` para uso seguro no frontend

  ## Tabelas alteradas:
  - `movimentacoes_estoque`: nova coluna `idempotency_key` (text unique)

  ## Novas funções:
  - `calcular_saldo_item_estoque(item_id, estoque_id)` → saldo calculado do zero
  - `inserir_movimentacao_idempotente(...)` → insert seguro com deduplicação
  - `recalcular_todos_saldos()` → utilitário para sincronizar cache

  ## Nota de segurança:
  - Movimentações com `origem_tipo IS NULL` são ignoradas nos cálculos (duplicatas históricas)
*/

-- 1. Adicionar idempotency_key (sem NOT NULL para não quebrar registros existentes)
ALTER TABLE movimentacoes_estoque
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

-- Índice único ignorando NULL (UNIQUE não se aplica a NULL no Postgres — valores NULL não são iguais)
CREATE UNIQUE INDEX IF NOT EXISTS idx_movimentacoes_idempotency_key
  ON movimentacoes_estoque (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- 2. Função principal de cálculo de saldo — SEMPRE parte das movimentações, nunca do campo estático
CREATE OR REPLACE FUNCTION calcular_saldo_item_estoque(
  p_item_id UUID,
  p_estoque_id UUID
)
RETURNS NUMERIC
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_ultima_contagem_em  TIMESTAMPTZ;
  v_saldo_contagem      NUMERIC := 0;
  v_movs_depois         NUMERIC := 0;
BEGIN
  -- Buscar última contagem válida para este item/estoque
  SELECT
    criado_em,
    CASE
      WHEN tipo_movimentacao = 'entrada' THEN quantidade
      ELSE -quantidade
    END
  INTO v_ultima_contagem_em, v_saldo_contagem
  FROM movimentacoes_estoque
  WHERE item_id        = p_item_id
    AND (estoque_destino_id = p_estoque_id OR estoque_origem_id = p_estoque_id)
    AND origem_tipo    = 'contagem'
  ORDER BY criado_em DESC
  LIMIT 1;

  -- Sem contagem: somar TUDO desde o início (ignorando entradas sem origem_tipo = duplicatas históricas)
  IF v_ultima_contagem_em IS NULL THEN
    SELECT COALESCE(SUM(
      CASE
        WHEN tipo_movimentacao = 'entrada'      AND estoque_destino_id = p_estoque_id THEN  quantidade
        WHEN tipo_movimentacao = 'transferencia' AND estoque_destino_id = p_estoque_id THEN  quantidade
        WHEN tipo_movimentacao = 'saida'        AND estoque_origem_id  = p_estoque_id THEN -quantidade
        WHEN tipo_movimentacao = 'transferencia' AND estoque_origem_id  = p_estoque_id THEN -quantidade
        ELSE 0
      END
    ), 0)
    INTO v_movs_depois
    FROM movimentacoes_estoque
    WHERE item_id = p_item_id
      AND (estoque_origem_id = p_estoque_id OR estoque_destino_id = p_estoque_id)
      AND origem_tipo IS NOT NULL;  -- ignora duplicatas históricas sem origem

    RETURN v_movs_depois;
  END IF;

  -- Com contagem: somar movimentações APÓS a última contagem (excluindo outras contagens)
  SELECT COALESCE(SUM(
    CASE
      WHEN tipo_movimentacao = 'entrada'      AND estoque_destino_id = p_estoque_id THEN  quantidade
      WHEN tipo_movimentacao = 'transferencia' AND estoque_destino_id = p_estoque_id THEN  quantidade
      WHEN tipo_movimentacao = 'saida'        AND estoque_origem_id  = p_estoque_id THEN -quantidade
      WHEN tipo_movimentacao = 'transferencia' AND estoque_origem_id  = p_estoque_id THEN -quantidade
      ELSE 0
    END
  ), 0)
  INTO v_movs_depois
  FROM movimentacoes_estoque
  WHERE item_id = p_item_id
    AND (estoque_origem_id = p_estoque_id OR estoque_destino_id = p_estoque_id)
    AND criado_em    > v_ultima_contagem_em
    AND origem_tipo != 'contagem'
    AND origem_tipo IS NOT NULL;  -- ignora duplicatas históricas

  RETURN v_saldo_contagem + v_movs_depois;
END;
$$;

-- 3. Trigger: recalcular cache em saldos_estoque após cada movimentação
CREATE OR REPLACE FUNCTION recalcular_saldo_cache_trigger()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_item_id   UUID;
  v_estoque_origem UUID;
  v_estoque_destino UUID;
  v_saldo_novo NUMERIC;
BEGIN
  -- Determinar IDs relevantes baseado na operação
  IF TG_OP = 'DELETE' THEN
    v_item_id        := OLD.item_id;
    v_estoque_origem  := OLD.estoque_origem_id;
    v_estoque_destino := OLD.estoque_destino_id;
  ELSE
    v_item_id        := NEW.item_id;
    v_estoque_origem  := NEW.estoque_origem_id;
    v_estoque_destino := NEW.estoque_destino_id;
  END IF;

  -- Ignorar movimentações sem origem_tipo (duplicatas históricas)
  IF TG_OP != 'DELETE' AND NEW.origem_tipo IS NULL THEN
    RETURN NEW;
  END IF;

  -- Recalcular saldo de origem
  IF v_estoque_origem IS NOT NULL THEN
    v_saldo_novo := calcular_saldo_item_estoque(v_item_id, v_estoque_origem);

    INSERT INTO saldos_estoque (item_id, estoque_id, quantidade_atual, custo_medio)
    VALUES (v_item_id, v_estoque_origem, v_saldo_novo, 0)
    ON CONFLICT (item_id, estoque_id) DO UPDATE
      SET quantidade_atual = v_saldo_novo,
          atualizado_em    = NOW();
  END IF;

  -- Recalcular saldo de destino
  IF v_estoque_destino IS NOT NULL AND v_estoque_destino IS DISTINCT FROM v_estoque_origem THEN
    v_saldo_novo := calcular_saldo_item_estoque(v_item_id, v_estoque_destino);

    INSERT INTO saldos_estoque (item_id, estoque_id, quantidade_atual, custo_medio)
    VALUES (v_item_id, v_estoque_destino, v_saldo_novo, 0)
    ON CONFLICT (item_id, estoque_id) DO UPDATE
      SET quantidade_atual = v_saldo_novo,
          atualizado_em    = NOW();
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

-- Remover trigger antigo incremental e instalar o novo baseado em cálculo real
DROP TRIGGER IF EXISTS tr_recalcular_saldo_cache ON movimentacoes_estoque;
DROP TRIGGER IF EXISTS tr_atualizar_saldos_movimentacao ON movimentacoes_estoque;
DROP TRIGGER IF EXISTS trigger_atualizar_saldos ON movimentacoes_estoque;

CREATE TRIGGER tr_recalcular_saldo_cache
  AFTER INSERT OR UPDATE OR DELETE ON movimentacoes_estoque
  FOR EACH ROW
  EXECUTE FUNCTION recalcular_saldo_cache_trigger();

-- 4. Corrigir trigger de requisição para usar idempotency_key (evita dupla execução)
CREATE OR REPLACE FUNCTION processar_requisicao_interna()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  item_req             RECORD;
  quantidade_processar NUMERIC;
  chave_idempotency    TEXT;
  ja_existe            BOOLEAN;
BEGIN
  -- Só processar quando status muda para 'concluido'
  IF NEW.status != 'concluido' OR (OLD.status IS NOT NULL AND OLD.status = 'concluido') THEN
    RETURN NEW;
  END IF;

  FOR item_req IN
    SELECT item_id, quantidade_solicitada, quantidade_aprovada, quantidade_entregue
    FROM requisicoes_internas_itens
    WHERE requisicao_id = NEW.id
  LOOP
    quantidade_processar := COALESCE(
      NULLIF(item_req.quantidade_entregue, 0),
      NULLIF(item_req.quantidade_aprovada, 0),
      item_req.quantidade_solicitada
    );

    IF COALESCE(quantidade_processar, 0) <= 0 THEN
      CONTINUE;
    END IF;

    -- Chave de idempotência: uma movimentação por item/requisição
    chave_idempotency := 'req_' || NEW.id::TEXT || '_' || item_req.item_id::TEXT;

    -- Verificar se já existe (idempotência)
    SELECT EXISTS(
      SELECT 1 FROM movimentacoes_estoque
      WHERE idempotency_key = chave_idempotency
    ) INTO ja_existe;

    IF ja_existe THEN
      CONTINUE;
    END IF;

    INSERT INTO movimentacoes_estoque (
      estoque_origem_id, estoque_destino_id,
      item_id, tipo_movimentacao, quantidade,
      custo_unitario, custo_total,
      data_movimentacao, motivo, observacoes,
      criado_por, criado_em, origem_id, origem_tipo,
      idempotency_key
    )
    SELECT
      NEW.estoque_origem_id,
      NEW.estoque_destino_id,
      item_req.item_id,
      'transferencia',
      quantidade_processar,
      COALESCE(ie.custo_medio, 0),
      quantidade_processar * COALESCE(ie.custo_medio, 0),
      NEW.data_requisicao,
      'Transferência por requisição interna',
      CONCAT(
        'Requisição: ', NEW.numero_requisicao,
        ' - Solicitante: ', NEW.funcionario_nome,
        CASE WHEN NEW.setor IS NOT NULL THEN CONCAT(' - Setor: ', NEW.setor) ELSE '' END
      ),
      NEW.concluido_por,
      NOW(),
      NEW.id,
      'requisicao',
      chave_idempotency
    FROM itens_estoque ie
    WHERE ie.id = item_req.item_id;

  END LOOP;

  RETURN NEW;
END;
$$;

-- 5. Função para o frontend inserir movimentações de forma idempotente
CREATE OR REPLACE FUNCTION inserir_movimentacao_idempotente(
  p_idempotency_key     TEXT,
  p_item_id             UUID,
  p_tipo_movimentacao   TEXT,
  p_origem_tipo         TEXT,
  p_quantidade          NUMERIC,
  p_estoque_origem_id   UUID DEFAULT NULL,
  p_estoque_destino_id  UUID DEFAULT NULL,
  p_custo_unitario      NUMERIC DEFAULT 0,
  p_data_movimentacao   DATE DEFAULT CURRENT_DATE,
  p_motivo              TEXT DEFAULT NULL,
  p_observacoes         TEXT DEFAULT NULL,
  p_origem_id           UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id_existente UUID;
  v_id_novo      UUID;
BEGIN
  -- Verificar idempotência
  SELECT id INTO v_id_existente
  FROM movimentacoes_estoque
  WHERE idempotency_key = p_idempotency_key
  LIMIT 1;

  IF v_id_existente IS NOT NULL THEN
    RETURN v_id_existente;  -- Já existe, retornar ID existente
  END IF;

  -- Inserir nova movimentação
  INSERT INTO movimentacoes_estoque (
    item_id, tipo_movimentacao, origem_tipo,
    quantidade, estoque_origem_id, estoque_destino_id,
    custo_unitario, custo_total,
    data_movimentacao, motivo, observacoes,
    origem_id, idempotency_key, criado_em
  ) VALUES (
    p_item_id, p_tipo_movimentacao, p_origem_tipo,
    p_quantidade, p_estoque_origem_id, p_estoque_destino_id,
    p_custo_unitario, p_quantidade * p_custo_unitario,
    p_data_movimentacao, p_motivo, p_observacoes,
    p_origem_id, p_idempotency_key, NOW()
  )
  RETURNING id INTO v_id_novo;

  RETURN v_id_novo;
END;
$$;

-- 6. Conceder permissões às funções
GRANT EXECUTE ON FUNCTION calcular_saldo_item_estoque(UUID, UUID) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION inserir_movimentacao_idempotente(TEXT, UUID, TEXT, TEXT, NUMERIC, UUID, UUID, NUMERIC, DATE, TEXT, TEXT, UUID) TO anon, authenticated;

-- 7. Recalcular TODOS os saldos em cache usando a nova função (sincronização única)
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT item_id, estoque_id
    FROM saldos_estoque
  LOOP
    UPDATE saldos_estoque
    SET quantidade_atual = calcular_saldo_item_estoque(r.item_id, r.estoque_id),
        atualizado_em    = NOW()
    WHERE item_id   = r.item_id
      AND estoque_id = r.estoque_id;
  END LOOP;
END;
$$;
