/*
  # Remover trigger incremental conflitante

  ## Problema
  Duas triggers estavam rodando simultâneamente em movimentacoes_estoque:
  - tr_recalcular_saldo_cache (nova) — recalcula saldo do zero via calcular_saldo_item_estoque()
  - trg_atualizar_saldos_movimentacao (antiga) — soma/subtrai incrementalmente

  Como triggers AFTER disparam em ordem alfabética, "tr_recalcular..." roda primeiro
  com o saldo correto, depois "trg_atualizar..." duplica a quantidade por cima.

  ## Solução
  Remove apenas a trigger antiga. A função subjacente é mantida pois pode
  ser referenciada por outras triggers ou código legado.

  ## Impacto
  Toda nova movimentação terá saldo calculado apenas pela lógica idempotente
  (calcular_saldo_item_estoque), eliminando a duplicação.
*/

DROP TRIGGER IF EXISTS trg_atualizar_saldos_movimentacao ON movimentacoes_estoque;
