-- Produção no Beta 2.
--
-- O fluxo da casa: o insumo in natura sai do Central para o Estoque Produção;
-- lá a ficha técnica de produção é feita e o produto novo (item_produzido_id
-- da ficha) entra no Central. Três funções:
--   fn_producao_tela      : fichas de produção com o que cada uma precisa, o que
--                           está na Produção, últimas produções.
--   fn_producao_mover     : Central → Produção (mandar) ou Produção → Central
--                           (devolver), limitado ao saldo da origem.
--   fn_producao_produzir  : uma ficha × N lotes. Puxa do Central o que faltar na
--                           Produção (opcional), baixa os insumos da Produção,
--                           dá entrada do produto no Central a custo de produção
--                           e grava a linha em producoes.
-- Tudo em movimentacoes_estoque com origem_tipo 'producao'; o saldo é do trigger.

CREATE OR REPLACE FUNCTION fn_producao_tela()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_central uuid; v_prod uuid; v_fichas jsonb; v_insumos jsonb; v_ultimas jsonb; v_tot jsonb;
BEGIN
  SELECT id INTO v_central FROM estoques WHERE tipo = 'central' AND status LIMIT 1;
  SELECT id INTO v_prod FROM estoques WHERE tipo = 'producao' AND status LIMIT 1;
  IF v_prod IS NULL THEN RAISE EXCEPTION 'Não existe um estoque do tipo produção ativo'; END IF;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id', f.id, 'nome', trim(f.nome), 'rendimento', coalesce(f.rendimento, f.porcoes, 1), 'um_rend', coalesce(f.unidade_rendimento, 'porções'), 'custo_ficha', coalesce(f.custo_total, 0),
      'produz', jsonb_build_object('item_id', ip.id, 'nome', trim(ip.nome), 'um', ip.unidade_medida, 'central', coalesce(sc.quantidade_atual, 0), 'custo', coalesce(ip.custo_medio, 0)),
      'ingredientes', (SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'nome', trim(i.nome), 'um', i.unidade_medida, 'quantidade', fi.quantidade, 'custo', coalesce(i.custo_medio, 0),
                                 'em_producao', coalesce(sp.quantidade_atual, 0), 'em_central', coalesce(sce.quantidade_atual, 0)) ORDER BY fi.ordem, i.nome), '[]'::jsonb)
                       FROM ficha_ingredientes fi JOIN itens_estoque i ON i.id = fi.item_estoque_id
                       LEFT JOIN saldos_estoque sp ON sp.item_id = i.id AND sp.estoque_id = v_prod
                       LEFT JOIN saldos_estoque sce ON sce.item_id = i.id AND sce.estoque_id = v_central
                       WHERE fi.ficha_id = f.id AND coalesce(fi.baixa_estoque, true) AND fi.quantidade > 0),
      'lotes_possiveis', (SELECT coalesce(floor(min(coalesce(sp.quantidade_atual, 0) / fi.quantidade)), 0)
                          FROM ficha_ingredientes fi LEFT JOIN saldos_estoque sp ON sp.item_id = fi.item_estoque_id AND sp.estoque_id = v_prod
                          WHERE fi.ficha_id = f.id AND coalesce(fi.baixa_estoque, true) AND fi.quantidade > 0),
      'ultima', (SELECT max(data_producao) FROM producoes p WHERE p.ficha_id = f.id)
    ) ORDER BY trim(f.nome)), '[]'::jsonb)
  INTO v_fichas
  FROM fichas_tecnicas f JOIN itens_estoque ip ON ip.id = f.item_produzido_id
  LEFT JOIN saldos_estoque sc ON sc.item_id = ip.id AND sc.estoque_id = v_central
  WHERE coalesce(f.ativo, true) AND f.tipo_consumo = 'producao' AND ip.status = 'ativo';

  SELECT coalesce(jsonb_agg(jsonb_build_object('item_id', i.id, 'nome', trim(i.nome), 'categoria', coalesce(nullif(trim(i.categoria), ''), 'Sem categoria'), 'um', i.unidade_medida, 'saldo', s.quantidade_atual,
           'custo', coalesce(i.custo_medio, 0), 'valor', round(s.quantidade_atual * coalesce(i.custo_medio, 0), 2), 'ultima', s.data_ultima_movimentacao) ORDER BY trim(i.nome)), '[]'::jsonb)
  INTO v_insumos FROM saldos_estoque s JOIN itens_estoque i ON i.id = s.item_id WHERE s.estoque_id = v_prod AND s.quantidade_atual <> 0;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'lote', p.lote_producao, 'ficha', trim(f.nome), 'lotes', p.quantidade, 'produzido', p.quantidade_produzida, 'um', coalesce(f.unidade_rendimento, 'porções'),
           'custo', p.custo_total_producao, 'responsavel', p.responsavel, 'data', p.data_producao, 'criado_em', p.criado_em, 'observacoes', p.observacoes) ORDER BY p.criado_em DESC), '[]'::jsonb)
  INTO v_ultimas FROM (SELECT * FROM producoes WHERE criado_em >= now() - interval '30 days' ORDER BY criado_em DESC LIMIT 30) p JOIN fichas_tecnicas f ON f.id = p.ficha_id;

  SELECT jsonb_build_object(
    'producoes_7d', (SELECT count(*) FROM producoes WHERE criado_em >= now() - interval '7 days'),
    'valor_insumos', (SELECT round(coalesce(sum(s.quantidade_atual * coalesce(i.custo_medio, 0)), 0), 2) FROM saldos_estoque s JOIN itens_estoque i ON i.id = s.item_id WHERE s.estoque_id = v_prod AND s.quantidade_atual > 0),
    'insumos', (SELECT count(*) FROM saldos_estoque WHERE estoque_id = v_prod AND quantidade_atual > 0),
    'fichas', jsonb_array_length(v_fichas))
  INTO v_tot;

  RETURN jsonb_build_object('central', (SELECT jsonb_build_object('id', id, 'nome', nome) FROM estoques WHERE id = v_central), 'producao', (SELECT jsonb_build_object('id', id, 'nome', nome) FROM estoques WHERE id = v_prod),
                            'fichas', v_fichas, 'insumos', v_insumos, 'ultimas', v_ultimas, 'totais', v_tot);
END $$;

CREATE OR REPLACE FUNCTION fn_producao_mov(p_item uuid, p_de uuid, p_para uuid, p_qtd numeric, p_motivo text, p_obs text, p_origem_id uuid, p_chave text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nome text; v_custo numeric; v_id uuid; v_tipo text := CASE WHEN p_de IS NULL THEN 'entrada' WHEN p_para IS NULL THEN 'saida' ELSE 'transferencia' END;
BEGIN
  SELECT trim(nome), coalesce(custo_medio, 0) INTO v_nome, v_custo FROM itens_estoque WHERE id = p_item;
  INSERT INTO movimentacoes_estoque (item_id, tipo_movimentacao, quantidade, estoque_origem_id, estoque_destino_id, custo_unitario, custo_total, data_movimentacao, motivo, observacoes, origem_tipo, origem_id, criado_por, item_descricao, idempotency_key)
  VALUES (p_item, v_tipo, p_qtd, p_de, p_para, v_custo, p_qtd * v_custo, current_date, p_motivo, p_obs, 'producao', p_origem_id, fn_usuario_sistema_id(), v_nome,
          'producao_' || p_chave || '_' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- p_sentido: mandar (Central → Produção) | devolver (Produção → Central)
CREATE OR REPLACE FUNCTION fn_producao_mover(p_sentido text, p_itens jsonb, p_responsavel text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_central uuid; v_prod uuid; v_de uuid; v_para uuid; r record; v_saldo numeric; v_qtd numeric; v_nome text; v_n int := 0; v_faltou text[] := '{}'; v_resp text := nullif(trim(coalesce(p_responsavel, '')), '');
BEGIN
  IF p_sentido NOT IN ('mandar', 'devolver') THEN RAISE EXCEPTION 'Sentido inválido'; END IF;
  SELECT id INTO v_central FROM estoques WHERE tipo = 'central' AND status LIMIT 1;
  SELECT id INTO v_prod FROM estoques WHERE tipo = 'producao' AND status LIMIT 1;
  IF v_prod IS NULL THEN RAISE EXCEPTION 'Não existe um estoque do tipo produção ativo'; END IF;
  IF v_resp IS NULL THEN SELECT nome_completo INTO v_resp FROM usuarios_sistema WHERE id = fn_usuario_sistema_id(); END IF;
  v_de := CASE WHEN p_sentido = 'mandar' THEN v_central ELSE v_prod END;
  v_para := CASE WHEN p_sentido = 'mandar' THEN v_prod ELSE v_central END;
  FOR r IN SELECT (x->>'item_id')::uuid item_id, (x->>'quantidade')::numeric quantidade FROM jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x LOOP
    IF r.item_id IS NULL OR r.quantidade IS NULL OR r.quantidade <= 0 THEN CONTINUE; END IF;
    SELECT trim(nome) INTO v_nome FROM itens_estoque WHERE id = r.item_id;
    SELECT coalesce(quantidade_atual, 0) INTO v_saldo FROM saldos_estoque WHERE estoque_id = v_de AND item_id = r.item_id;
    v_saldo := coalesce(v_saldo, 0);
    v_qtd := least(r.quantidade, greatest(v_saldo, 0));
    IF v_qtd < r.quantidade THEN v_faltou := v_faltou || (v_nome || ': tinha ' || round(greatest(v_saldo, 0), 2) || ', pedia ' || round(r.quantidade, 2)); END IF;
    IF v_qtd <= 0 THEN CONTINUE; END IF;
    PERFORM fn_producao_mov(r.item_id, v_de, v_para, v_qtd, CASE WHEN p_sentido = 'mandar' THEN 'Insumo para a Produção' ELSE 'Insumo devolvido ao Central' END, 'Por ' || coalesce(v_resp, '?'), NULL, p_sentido || '_' || r.item_id);
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('itens', v_n, 'faltou', to_jsonb(v_faltou));
END $$;

-- p: { ficha_id, lotes, puxar_central (bool, padrão true), responsavel, observacoes }
CREATE OR REPLACE FUNCTION fn_producao_produzir(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_central uuid; v_prod uuid; v_ficha uuid := nullif(p->>'ficha_id', '')::uuid; v_lotes numeric := coalesce((p->>'lotes')::numeric, 0);
        v_puxar boolean := coalesce((p->>'puxar_central')::boolean, true); v_resp text := nullif(trim(coalesce(p->>'responsavel', '')), ''); v_obs text := nullif(trim(coalesce(p->>'observacoes', '')), '');
        vf record; ing record; v_prod_id uuid := gen_random_uuid(); v_nec numeric; v_saldo_p numeric; v_saldo_c numeric; v_puxa numeric; v_custo_total numeric := 0;
        v_qtd_prod numeric; v_custo_unit numeric; v_saldo_item numeric; v_custo_item numeric; v_novo_custo numeric; v_puxados text[] := '{}'; v_negativos text[] := '{}'; v_lote text;
BEGIN
  IF v_ficha IS NULL THEN RAISE EXCEPTION 'Escolha a ficha'; END IF;
  IF v_lotes <= 0 OR v_lotes <> floor(v_lotes) THEN RAISE EXCEPTION 'Lotes deve ser um número inteiro maior que zero'; END IF;
  SELECT id INTO v_central FROM estoques WHERE tipo = 'central' AND status LIMIT 1;
  SELECT id INTO v_prod FROM estoques WHERE tipo = 'producao' AND status LIMIT 1;
  IF v_prod IS NULL THEN RAISE EXCEPTION 'Não existe um estoque do tipo produção ativo'; END IF;
  SELECT ft.id, trim(ft.nome) nome, coalesce(ft.rendimento, ft.porcoes, 1) rendimento, coalesce(ft.unidade_rendimento, 'porções') um_rend, ft.item_produzido_id, trim(i.nome) produto, i.unidade_medida produto_um
    INTO vf FROM fichas_tecnicas ft JOIN itens_estoque i ON i.id = ft.item_produzido_id
   WHERE ft.id = v_ficha AND coalesce(ft.ativo, true) AND ft.tipo_consumo = 'producao' AND i.status = 'ativo';
  IF vf.id IS NULL THEN RAISE EXCEPTION 'Ficha de produção não encontrada, inativa ou sem item produzido'; END IF;
  IF v_resp IS NULL THEN SELECT nome_completo INTO v_resp FROM usuarios_sistema WHERE id = fn_usuario_sistema_id(); END IF;
  IF NOT EXISTS (SELECT 1 FROM ficha_ingredientes WHERE ficha_id = v_ficha AND coalesce(baixa_estoque, true) AND quantidade > 0) THEN RAISE EXCEPTION 'A ficha não tem ingredientes que baixam estoque'; END IF;

  -- 1. Insumos: puxa do Central o que falta na Produção (se pedido) e baixa da Produção.
  FOR ing IN SELECT fi.item_estoque_id item_id, fi.quantidade, trim(i.nome) nome, coalesce(i.custo_medio, 0) custo
             FROM ficha_ingredientes fi JOIN itens_estoque i ON i.id = fi.item_estoque_id
             WHERE fi.ficha_id = v_ficha AND coalesce(fi.baixa_estoque, true) AND fi.quantidade > 0 ORDER BY fi.ordem LOOP
    v_nec := ing.quantidade * v_lotes;
    SELECT coalesce(quantidade_atual, 0) INTO v_saldo_p FROM saldos_estoque WHERE estoque_id = v_prod AND item_id = ing.item_id;
    v_saldo_p := coalesce(v_saldo_p, 0);
    IF v_saldo_p < v_nec AND v_puxar THEN
      SELECT coalesce(quantidade_atual, 0) INTO v_saldo_c FROM saldos_estoque WHERE estoque_id = v_central AND item_id = ing.item_id;
      v_puxa := least(v_nec - v_saldo_p, greatest(coalesce(v_saldo_c, 0), 0));
      IF v_puxa > 0 THEN
        PERFORM fn_producao_mov(ing.item_id, v_central, v_prod, v_puxa, 'Insumo para a Produção · ' || vf.nome, 'Puxado para produzir ' || v_lotes || ' lote(s)', v_prod_id, 'puxa_' || ing.item_id);
        v_puxados := v_puxados || (ing.nome || ': ' || round(v_puxa, 3));
        v_saldo_p := v_saldo_p + v_puxa;
      END IF;
    END IF;
    IF v_saldo_p < v_nec THEN v_negativos := v_negativos || (ing.nome || ': faltou ' || round(v_nec - v_saldo_p, 3)); END IF;
    PERFORM fn_producao_mov(ing.item_id, v_prod, NULL, v_nec, 'Consumo na produção · ' || vf.nome, 'Lotes: ' || v_lotes || ' · por ' || coalesce(v_resp, '?'), v_prod_id, 'consumo_' || ing.item_id);
    v_custo_total := v_custo_total + v_nec * ing.custo;
  END LOOP;

  -- 2. Produto novo entra no Central a custo de produção; o custo médio do item acompanha.
  v_qtd_prod := vf.rendimento * v_lotes;
  v_custo_unit := CASE WHEN v_qtd_prod > 0 THEN v_custo_total / v_qtd_prod ELSE 0 END;
  SELECT coalesce(quantidade_atual, 0), coalesce(custo_medio, 0) INTO v_saldo_item, v_custo_item FROM saldos_estoque WHERE estoque_id = v_central AND item_id = vf.item_produzido_id;
  v_saldo_item := coalesce(v_saldo_item, 0); v_custo_item := coalesce(v_custo_item, 0);
  v_novo_custo := CASE WHEN v_saldo_item > 0 AND v_custo_item > 0 THEN (v_saldo_item * v_custo_item + v_qtd_prod * v_custo_unit) / (v_saldo_item + v_qtd_prod) ELSE v_custo_unit END;
  UPDATE itens_estoque SET custo_medio = round(v_novo_custo, 4), atualizado_em = now() WHERE id = vf.item_produzido_id;
  PERFORM fn_producao_mov(vf.item_produzido_id, NULL, v_central, v_qtd_prod, 'Produção · ' || vf.nome, 'Lotes: ' || v_lotes || ' · por ' || coalesce(v_resp, '?') || coalesce(' · ' || v_obs, ''), v_prod_id, 'produto_' || vf.item_produzido_id);

  -- 3. Registro da produção.
  INSERT INTO producoes (id, ficha_id, quantidade, data_producao, custo_total_producao, custo_real, responsavel, status, observacoes, quantidade_produzida, quantidade_aprovada, estoque_destino_id, usuario_inicio, usuario_conclusao, hora_inicio, hora_fim, rendimento_esperado, rendimento_real)
  VALUES (v_prod_id, v_ficha, v_lotes::int, current_date, round(v_custo_total, 2), round(v_custo_total, 2), v_resp, 'concluido', v_obs, v_qtd_prod, v_qtd_prod, v_central, fn_usuario_sistema_id(), fn_usuario_sistema_id(), now(), now(), v_qtd_prod, v_qtd_prod);
  SELECT lote_producao INTO v_lote FROM producoes WHERE id = v_prod_id;

  RETURN jsonb_build_object('producao_id', v_prod_id, 'lote', v_lote, 'ficha', vf.nome, 'lotes', v_lotes, 'produto', vf.produto, 'produzido', v_qtd_prod, 'um', vf.um_rend,
                            'custo_total', round(v_custo_total, 2), 'custo_unitario', round(v_custo_unit, 4), 'puxados', to_jsonb(v_puxados), 'negativos', to_jsonb(v_negativos));
END $$;
