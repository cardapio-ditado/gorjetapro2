/*
  # Estoque Beta: Produzir baixa os insumos de verdade

  `producao_reserva_insumos.quantidade_utilizada` nasce com padrão 0, e
  `processar_producao` usa `COALESCE(quantidade_utilizada, quantidade_reservada)`.
  Com 0 a reserva era pulada e a produção entrava sem baixar nenhum insumo.
  A reserva passa a nascer com a quantidade utilizada igual à reservada.
*/

CREATE OR REPLACE FUNCTION fn_beta_produzir(p_ficha_id uuid, p_quantidade numeric, p_destino uuid, p_origem_insumos uuid, p_responsavel text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_prod uuid; v_ing record; v_res jsonb; v_n int := 0;
BEGIN
  IF coalesce(p_quantidade, 0) <= 0 THEN RAISE EXCEPTION 'Quantidade precisa ser maior que zero'; END IF;
  IF p_destino IS NULL OR p_origem_insumos IS NULL THEN RAISE EXCEPTION 'Informe de onde saem os insumos e para onde vai o produto'; END IF;

  INSERT INTO producoes (ficha_id, quantidade, data_producao, responsavel, observacoes, estoque_destino_id, status, hora_inicio, usuario_inicio)
  VALUES (p_ficha_id, p_quantidade, (now() AT TIME ZONE 'America/Cuiaba')::date, p_responsavel, 'Produzido pelo Estoque Beta', p_destino, 'em_andamento', now(), auth.uid())
  RETURNING id INTO v_prod;

  FOR v_ing IN
    SELECT coalesce(fi.item_estoque_id, sf.item_produzido_id) AS item_id, fi.quantidade
    FROM ficha_ingredientes fi LEFT JOIN fichas_tecnicas sf ON sf.id = fi.ficha_tecnica_ingrediente_id
    WHERE fi.ficha_id = p_ficha_id AND coalesce(fi.baixa_estoque, true)
  LOOP
    IF v_ing.item_id IS NULL OR coalesce(v_ing.quantidade, 0) <= 0 THEN CONTINUE; END IF;
    INSERT INTO producao_reserva_insumos (producao_id, item_id, quantidade_reservada, quantidade_utilizada, estoque_origem_id, status_reserva, data_reserva)
    VALUES (v_prod, v_ing.item_id, v_ing.quantidade * p_quantidade, v_ing.quantidade * p_quantidade, p_origem_insumos, 'reservado', now());
    v_n := v_n + 1;
  END LOOP;

  v_res := processar_producao(v_prod, p_quantidade, p_quantidade, auth.uid(), 'Produzido pelo Estoque Beta');
  IF coalesce((v_res->>'success')::boolean, false) = false THEN
    RAISE EXCEPTION '%', coalesce(v_res->>'error', 'Falha ao processar a produção');
  END IF;
  RETURN v_res || jsonb_build_object('insumos', v_n);
END;
$$;
