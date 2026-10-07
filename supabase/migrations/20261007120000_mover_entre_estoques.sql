-- Mover entre estoques (Beta 2, Movimentações).
-- Transferência livre: qualquer estoque ativo para qualquer outro, sem nível,
-- pedido ou aprovação. Serve para o que volta ao Central, o que passa de um
-- setor para outro e o que vai do Central sem pedido. Limita ao saldo da
-- origem (o que faltar é avisado, não fica negativo).

CREATE OR REPLACE FUNCTION fn_mover_tela()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'estoques', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'tipo', e.tipo) ORDER BY (e.tipo <> 'central'), e.nome), '[]'::jsonb) FROM estoques e WHERE e.status),
    'ultimas', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'quando', m.criado_em, 'item', trim(i.nome), 'um', i.unidade_medida, 'quantidade', m.quantidade,
                         'de', eo.nome, 'para', ed.nome, 'quem', m.observacoes, 'motivo', m.motivo) ORDER BY m.criado_em DESC), '[]'::jsonb)
                FROM (SELECT * FROM movimentacoes_estoque WHERE tipo_movimentacao = 'transferencia' AND origem_tipo = 'manual' AND criado_em >= now() - interval '30 days' ORDER BY criado_em DESC LIMIT 40) m
                JOIN itens_estoque i ON i.id = m.item_id LEFT JOIN estoques eo ON eo.id = m.estoque_origem_id LEFT JOIN estoques ed ON ed.id = m.estoque_destino_id));
$$;

-- Saldo de todos os itens de um estoque, para a tela mostrar "tem X aqui".
CREATE OR REPLACE FUNCTION fn_mover_saldos(p_estoque uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_object_agg(item_id, quantidade_atual), '{}'::jsonb) FROM saldos_estoque WHERE estoque_id = p_estoque AND quantidade_atual <> 0;
$$;

-- p: { de, para, itens: [{item_id, quantidade}], responsavel, motivo }
CREATE OR REPLACE FUNCTION fn_mover_estoques(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_de uuid := nullif(p->>'de', '')::uuid; v_para uuid := nullif(p->>'para', '')::uuid; v_resp text := nullif(trim(coalesce(p->>'responsavel', '')), ''); v_motivo text := nullif(trim(coalesce(p->>'motivo', '')), '');
        v_de_nome text; v_para_nome text; r record; v_saldo numeric; v_qtd numeric; v_nome text; v_custo numeric; v_n int := 0; v_faltou text[] := '{}';
BEGIN
  IF v_de IS NULL OR v_para IS NULL THEN RAISE EXCEPTION 'Escolha de onde sai e para onde vai'; END IF;
  IF v_de = v_para THEN RAISE EXCEPTION 'Origem e destino são o mesmo estoque'; END IF;
  SELECT nome INTO v_de_nome FROM estoques WHERE id = v_de AND status;
  SELECT nome INTO v_para_nome FROM estoques WHERE id = v_para AND status;
  IF v_de_nome IS NULL OR v_para_nome IS NULL THEN RAISE EXCEPTION 'Estoque não encontrado ou inativo'; END IF;
  IF v_resp IS NULL THEN SELECT nome_completo INTO v_resp FROM usuarios_sistema WHERE id = fn_usuario_sistema_id(); END IF;

  FOR r IN SELECT (x->>'item_id')::uuid item_id, (x->>'quantidade')::numeric quantidade FROM jsonb_array_elements(coalesce(p->'itens', '[]'::jsonb)) x LOOP
    IF r.item_id IS NULL OR r.quantidade IS NULL OR r.quantidade <= 0 THEN CONTINUE; END IF;
    SELECT trim(nome), coalesce(custo_medio, 0) INTO v_nome, v_custo FROM itens_estoque WHERE id = r.item_id AND status = 'ativo';
    IF v_nome IS NULL THEN CONTINUE; END IF;
    SELECT coalesce(quantidade_atual, 0) INTO v_saldo FROM saldos_estoque WHERE estoque_id = v_de AND item_id = r.item_id;
    v_saldo := coalesce(v_saldo, 0);
    v_qtd := least(r.quantidade, greatest(v_saldo, 0));
    IF v_qtd < r.quantidade THEN v_faltou := v_faltou || (v_nome || ': ' || v_de_nome || ' tinha ' || round(greatest(v_saldo, 0), 2) || ', pedia ' || round(r.quantidade, 2)); END IF;
    IF v_qtd <= 0 THEN CONTINUE; END IF;
    INSERT INTO movimentacoes_estoque (item_id, tipo_movimentacao, quantidade, estoque_origem_id, estoque_destino_id, custo_unitario, custo_total, data_movimentacao, motivo, observacoes, origem_tipo, criado_por, item_descricao, idempotency_key)
    VALUES (r.item_id, 'transferencia', v_qtd, v_de, v_para, v_custo, v_qtd * v_custo, current_date, coalesce(v_motivo, 'Movido entre estoques'), 'Por ' || coalesce(v_resp, '?'), 'manual', fn_usuario_sistema_id(), v_nome,
            'mover_' || r.item_id || '_' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'));
    v_n := v_n + 1;
  END LOOP;
  IF v_n = 0 AND array_length(v_faltou, 1) IS NULL THEN RAISE EXCEPTION 'Nenhum item com quantidade para mover'; END IF;
  RETURN jsonb_build_object('itens', v_n, 'de', v_de_nome, 'para', v_para_nome, 'faltou', to_jsonb(v_faltou));
END $$;
