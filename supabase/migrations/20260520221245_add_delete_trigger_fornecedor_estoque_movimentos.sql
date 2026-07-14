/*
  # Trigger DELETE em fornecedor_estoque_movimentos

  ## Problema
  O trigger existente (trg_atualizar_saldo_fornecedor) só disparava em INSERT.
  Quando notas são excluídas (e seus movimentos deletados em cascata) ou quando
  requisições REQBAR são desfeitas, o saldo em fornecedor_estoque_saldo não era
  revertido — ficava com entradas/saídas fantasmas.

  ## Solução
  Nova função fn_reverter_saldo_fornecedor + trigger AFTER DELETE que:
  - Reverte total_entradas para tipo 'entrada'
  - Reverte total_saidas para tipo 'saida' e 'consignado_retirada'
  - Reverte total_devolvidos para tipo 'devolucao'
  - Reverte ajustes conforme sinal da quantidade

  ## Segurança
  Usa GREATEST(0, ...) para nunca deixar colunas negativas por arredondamento.
*/

CREATE OR REPLACE FUNCTION public.fn_reverter_saldo_fornecedor()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Se não existe saldo registrado, nada a reverter
  IF NOT EXISTS (
    SELECT 1 FROM fornecedor_estoque_saldo
    WHERE fornecedor_id = OLD.fornecedor_id AND item_id = OLD.item_id
  ) THEN
    RETURN OLD;
  END IF;

  IF OLD.tipo = 'entrada' THEN
    UPDATE fornecedor_estoque_saldo
    SET
      total_entradas = GREATEST(0, total_entradas - OLD.quantidade),
      atualizado_em  = NOW()
    WHERE fornecedor_id = OLD.fornecedor_id AND item_id = OLD.item_id;

  ELSIF OLD.tipo IN ('saida', 'consignado_uso', 'consignado_retirada') THEN
    UPDATE fornecedor_estoque_saldo
    SET
      total_saidas  = GREATEST(0, total_saidas - OLD.quantidade),
      atualizado_em = NOW()
    WHERE fornecedor_id = OLD.fornecedor_id AND item_id = OLD.item_id;

  ELSIF OLD.tipo = 'devolucao' THEN
    UPDATE fornecedor_estoque_saldo
    SET
      total_devolvidos = GREATEST(0, total_devolvidos - OLD.quantidade),
      atualizado_em    = NOW()
    WHERE fornecedor_id = OLD.fornecedor_id AND item_id = OLD.item_id;

  ELSIF OLD.tipo = 'ajuste' THEN
    IF OLD.quantidade > 0 THEN
      UPDATE fornecedor_estoque_saldo
      SET total_entradas = GREATEST(0, total_entradas - OLD.quantidade), atualizado_em = NOW()
      WHERE fornecedor_id = OLD.fornecedor_id AND item_id = OLD.item_id;
    ELSE
      UPDATE fornecedor_estoque_saldo
      SET total_saidas = GREATEST(0, total_saidas - ABS(OLD.quantidade)), atualizado_em = NOW()
      WHERE fornecedor_id = OLD.fornecedor_id AND item_id = OLD.item_id;
    END IF;
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_reverter_saldo_fornecedor ON fornecedor_estoque_movimentos;

CREATE TRIGGER trg_reverter_saldo_fornecedor
  AFTER DELETE ON fornecedor_estoque_movimentos
  FOR EACH ROW
  EXECUTE FUNCTION fn_reverter_saldo_fornecedor();
