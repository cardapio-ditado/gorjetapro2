/*
  # Normalizar precisão numérica nas movimentações de estoque

  ## Problema
  O JavaScript usa ponto flutuante IEEE 754, produzindo valores como
  0.30000000000000004 ao invés de 0.3. Como as colunas NUMERIC não tinham
  escala definida, o PostgreSQL armazenava exatamente o valor corrompido,
  causando saldos como 1.99 ao invés de 2.00.

  ## Solução
  1. Trigger BEFORE INSERT OR UPDATE em movimentacoes_estoque — arredonda
     quantidade, custo_unitario e custo_total para 4 casas decimais.
  2. Mesma proteção em itens_entrada_compra (origem das entradas de compra).
  3. Limpeza dos dados existentes corrompidos.
  4. Recalculo dos saldos após limpeza.

  ## Precisão: 4 casas decimais
  Suficiente para frações de kg/litro; evita acúmulo de erro em somas longas.
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Função + trigger em movimentacoes_estoque
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_normalizar_precisao_movimentacao()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.quantidade     := ROUND(NEW.quantidade::numeric, 4);
  IF NEW.custo_unitario IS NOT NULL THEN
    NEW.custo_unitario := ROUND(NEW.custo_unitario::numeric, 4);
  END IF;
  IF NEW.custo_total IS NOT NULL THEN
    NEW.custo_total    := ROUND(NEW.custo_total::numeric,    4);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalizar_precisao_movimentacao ON movimentacoes_estoque;
CREATE TRIGGER trg_normalizar_precisao_movimentacao
  BEFORE INSERT OR UPDATE ON movimentacoes_estoque
  FOR EACH ROW
  EXECUTE FUNCTION fn_normalizar_precisao_movimentacao();

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Função + trigger em itens_entrada_compra
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_normalizar_precisao_item_compra()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.quantidade IS NOT NULL THEN
    NEW.quantidade := ROUND(NEW.quantidade::numeric, 4);
  END IF;
  IF NEW.quantidade_pedida IS NOT NULL THEN
    NEW.quantidade_pedida := ROUND(NEW.quantidade_pedida::numeric, 4);
  END IF;
  IF NEW.quantidade_recebida IS NOT NULL THEN
    NEW.quantidade_recebida := ROUND(NEW.quantidade_recebida::numeric, 4);
  END IF;
  IF NEW.custo_unitario IS NOT NULL THEN
    NEW.custo_unitario := ROUND(NEW.custo_unitario::numeric, 4);
  END IF;
  IF NEW.custo_total IS NOT NULL THEN
    NEW.custo_total := ROUND(NEW.custo_total::numeric, 4);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_normalizar_precisao_item_compra ON itens_entrada_compra;
CREATE TRIGGER trg_normalizar_precisao_item_compra
  BEFORE INSERT OR UPDATE ON itens_entrada_compra
  FOR EACH ROW
  EXECUTE FUNCTION fn_normalizar_precisao_item_compra();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Limpar dados corrompidos em movimentacoes_estoque
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE movimentacoes_estoque
SET
  quantidade     = ROUND(quantidade::numeric, 4),
  custo_unitario = CASE WHEN custo_unitario IS NOT NULL THEN ROUND(custo_unitario::numeric, 4) ELSE NULL END,
  custo_total    = CASE WHEN custo_total    IS NOT NULL THEN ROUND(custo_total::numeric,    4) ELSE NULL END
WHERE
  quantidade IS DISTINCT FROM ROUND(quantidade::numeric, 4)
  OR (custo_unitario IS NOT NULL AND custo_unitario IS DISTINCT FROM ROUND(custo_unitario::numeric, 4))
  OR (custo_total    IS NOT NULL AND custo_total    IS DISTINCT FROM ROUND(custo_total::numeric,    4));

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Limpar dados corrompidos em itens_entrada_compra
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE itens_entrada_compra
SET
  quantidade          = CASE WHEN quantidade          IS NOT NULL THEN ROUND(quantidade::numeric,          4) ELSE NULL END,
  quantidade_pedida   = CASE WHEN quantidade_pedida   IS NOT NULL THEN ROUND(quantidade_pedida::numeric,   4) ELSE NULL END,
  quantidade_recebida = CASE WHEN quantidade_recebida IS NOT NULL THEN ROUND(quantidade_recebida::numeric, 4) ELSE NULL END,
  custo_unitario      = CASE WHEN custo_unitario      IS NOT NULL THEN ROUND(custo_unitario::numeric,      4) ELSE NULL END,
  custo_total         = CASE WHEN custo_total         IS NOT NULL THEN ROUND(custo_total::numeric,         4) ELSE NULL END
WHERE
  (quantidade          IS NOT NULL AND quantidade          IS DISTINCT FROM ROUND(quantidade::numeric,          4))
  OR (quantidade_pedida   IS NOT NULL AND quantidade_pedida   IS DISTINCT FROM ROUND(quantidade_pedida::numeric,   4))
  OR (quantidade_recebida IS NOT NULL AND quantidade_recebida IS DISTINCT FROM ROUND(quantidade_recebida::numeric, 4))
  OR (custo_unitario      IS NOT NULL AND custo_unitario      IS DISTINCT FROM ROUND(custo_unitario::numeric,      4))
  OR (custo_total         IS NOT NULL AND custo_total         IS DISTINCT FROM ROUND(custo_total::numeric,         4));

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Recalcular saldos a partir das movimentações limpas
-- ─────────────────────────────────────────────────────────────────────────────
UPDATE saldos_estoque se
SET
  quantidade_atual = ROUND(sub.nova_qtd::numeric, 4),
  valor_total      = ROUND((sub.nova_qtd * COALESCE(ie.custo_medio, 0))::numeric, 2),
  atualizado_em    = now()
FROM (
  SELECT
    estoque_origem_id AS estoque_id,
    item_id,
    SUM(
      CASE
        WHEN tipo_movimentacao IN ('entrada','ajuste_positivo','producao','devolucao')
          THEN quantidade
        WHEN tipo_movimentacao IN ('saida','ajuste_negativo','consumo','venda','perda','transferencia')
          THEN -quantidade
        ELSE 0
      END
    ) AS nova_qtd
  FROM movimentacoes_estoque
  WHERE estoque_origem_id IS NOT NULL
  GROUP BY estoque_origem_id, item_id
) sub
JOIN itens_estoque ie ON ie.id = sub.item_id
WHERE se.estoque_id = sub.estoque_id
  AND se.item_id    = sub.item_id;
