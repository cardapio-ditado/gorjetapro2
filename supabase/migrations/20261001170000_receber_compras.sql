/*
  # Estoque Beta 2: Receber compras

  Uma nota por vez: ou um pedido que estava esperando (gerado da lista de
  compras, status pendente), ou uma nota sem pedido. Confere item a item o
  que chegou e por quanto, tira foto da nota, e "Dar entrada no Central"
  grava tudo numa transação. A entrada no saldo, o custo médio e a baixa da
  lista de compras continuam a cargo dos gatilhos que já existem.

  Foto da nota: bucket privado notas-fiscais, caminho em
  entradas_compras.origem_arquivo_url, lida por URL assinada.
*/

CREATE OR REPLACE FUNCTION fn_recebimento_tela()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'pendentes', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'fornecedor_id', e.fornecedor_id, 'fornecedor', coalesce(f.nome, 'Sem fornecedor'), 'data_pedido', coalesce(e.data_pedido, e.data_compra),
        'valor', e.valor_total, 'observacoes', e.observacoes,
        'itens', (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'linha_id', ic.id, 'item_id', ic.item_id, 'nome', trim(i.nome), 'um', i.unidade_medida,
            'quantidade_pedida', coalesce(ic.quantidade_pedida, ic.quantidade), 'custo_unitario', ic.custo_unitario
          ) ORDER BY trim(i.nome)), '[]'::jsonb) FROM itens_entrada_compra ic JOIN itens_estoque i ON i.id = ic.item_id WHERE ic.entrada_compra_id = e.id)
      ) ORDER BY coalesce(e.data_pedido, e.data_compra), f.nome), '[]'::jsonb)
      FROM entradas_compras e LEFT JOIN fornecedores f ON f.id = e.fornecedor_id
     WHERE e.status = 'pendente'),
    'recentes', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'fornecedor', coalesce(f.nome, 'Sem fornecedor'), 'data_compra', e.data_compra, 'valor', e.valor_total,
        'numero_documento', e.numero_documento, 'arquivo', e.origem_arquivo_url, 'criado_em', e.criado_em,
        'itens', (SELECT count(*) FROM itens_entrada_compra ic WHERE ic.entrada_compra_id = e.id)
      ) ORDER BY e.criado_em DESC), '[]'::jsonb)
      FROM (SELECT * FROM entradas_compras WHERE status = 'recebido' ORDER BY criado_em DESC LIMIT 30) e
      LEFT JOIN fornecedores f ON f.id = e.fornecedor_id)
  );
$$;

CREATE OR REPLACE FUNCTION fn_recebimento_confirmar(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_central uuid; v_entrada uuid := nullif(p->>'entrada_id', '')::uuid; v_forn uuid := nullif(p->>'fornecedor_id', '')::uuid;
  v_data date := coalesce((p->>'data_compra')::date, current_date); v_cond text := coalesce(nullif(p->>'condicao_pagamento', ''), 'a_vista');
  v_usuario uuid := fn_usuario_sistema_id(); r jsonb; v_linha uuid; v_qtd numeric; v_custo numeric; v_total numeric := 0; v_itens int := 0; v_vieram int := 0;
BEGIN
  SELECT id INTO v_central FROM estoques WHERE tipo = 'central' AND status LIMIT 1;
  IF v_central IS NULL THEN RAISE EXCEPTION 'Sem Estoque Central ativo'; END IF;
  IF jsonb_array_length(coalesce(p->'itens', '[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'A nota precisa de pelo menos um item.'; END IF;
  IF v_cond NOT IN ('a_vista', 'd1', 'd2', 'd3', 'semana', 'consignado', 'outro') THEN RAISE EXCEPTION 'Condição de pagamento inválida'; END IF;

  IF v_entrada IS NULL THEN
    INSERT INTO entradas_compras (fornecedor_id, estoque_destino_id, data_compra, data_entrega_real, status, valor_total, valor_produtos, numero_documento, observacoes, condicao_pagamento, origem_arquivo_url, criado_por)
    VALUES (v_forn, v_central, v_data, v_data, 'pendente', 0, 0, coalesce(p->>'numero_documento', ''), nullif(p->>'observacoes', ''), v_cond, nullif(p->>'arquivo', ''), v_usuario)
    RETURNING id INTO v_entrada;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM entradas_compras WHERE id = v_entrada AND status = 'pendente') THEN RAISE EXCEPTION 'Este pedido já foi recebido ou cancelado.'; END IF;
    UPDATE entradas_compras SET fornecedor_id = coalesce(v_forn, fornecedor_id), data_compra = v_data, data_entrega_real = v_data,
           numero_documento = coalesce(p->>'numero_documento', numero_documento, ''), observacoes = coalesce(nullif(p->>'observacoes', ''), observacoes),
           condicao_pagamento = v_cond, origem_arquivo_url = coalesce(nullif(p->>'arquivo', ''), origem_arquivo_url), criado_por = coalesce(criado_por, v_usuario)
     WHERE id = v_entrada;
    -- O que estava no pedido e não veio na nota: recebido zero (fica registrado, não entra no saldo).
    UPDATE itens_entrada_compra SET quantidade_recebida = 0, custo_total = 0, data_recebimento = now(), recebido_por = auth.uid()
     WHERE entrada_compra_id = v_entrada
       AND id::text NOT IN (SELECT coalesce(x->>'linha_id', '') FROM jsonb_array_elements(p->'itens') x);
  END IF;

  FOR r IN SELECT x FROM jsonb_array_elements(p->'itens') x LOOP
    v_itens := v_itens + 1;
    v_qtd := coalesce((r->>'quantidade_recebida')::numeric, 0);
    v_custo := coalesce((r->>'custo_unitario')::numeric, 0);
    v_linha := nullif(r->>'linha_id', '')::uuid;
    IF v_qtd < 0 OR v_custo < 0 THEN RAISE EXCEPTION 'Quantidade e custo não podem ser negativos (linha %).', v_itens; END IF;
    IF v_linha IS NOT NULL THEN
      UPDATE itens_entrada_compra SET quantidade_recebida = v_qtd, custo_unitario = v_custo, custo_unitario_final = v_custo, custo_total = round(v_qtd * v_custo, 2),
             data_validade = nullif(r->>'data_validade', '')::date, data_recebimento = now(), recebido_por = auth.uid()
       WHERE id = v_linha AND entrada_compra_id = v_entrada;
      IF NOT FOUND THEN RAISE EXCEPTION 'Linha do pedido não encontrada (linha %).', v_itens; END IF;
    ELSE
      IF v_qtd <= 0 THEN CONTINUE; END IF;
      IF nullif(r->>'item_id', '') IS NULL THEN RAISE EXCEPTION 'Escolha o item da linha %.', v_itens; END IF;
      INSERT INTO itens_entrada_compra (entrada_compra_id, item_id, quantidade, quantidade_pedida, quantidade_recebida, custo_unitario, custo_unitario_final, custo_total, data_validade, data_recebimento, recebido_por)
      VALUES (v_entrada, (r->>'item_id')::uuid, v_qtd, v_qtd, v_qtd, v_custo, v_custo, round(v_qtd * v_custo, 2), nullif(r->>'data_validade', '')::date, now(), auth.uid());
    END IF;
    IF v_qtd > 0 THEN v_vieram := v_vieram + 1; v_total := v_total + round(v_qtd * v_custo, 2); END IF;
  END LOOP;

  IF v_vieram = 0 THEN RAISE EXCEPTION 'Nenhum item com quantidade recebida. Se nada chegou, cancele o pedido.'; END IF;

  UPDATE entradas_compras SET valor_produtos = v_total, valor_total = v_total WHERE id = v_entrada;
  -- A transição para recebido dispara a entrada no saldo, o custo médio e a baixa na lista de compras.
  UPDATE entradas_compras SET status = 'recebido' WHERE id = v_entrada;

  RETURN jsonb_build_object('entrada_id', v_entrada, 'valor_total', v_total, 'itens', v_vieram,
    'movimentacoes', (SELECT count(*) FROM movimentacoes_estoque WHERE origem_tipo = 'compra' AND origem_id = v_entrada));
END; $$;

CREATE OR REPLACE FUNCTION fn_recebimento_cancelar(p_entrada uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM setores_exigir_gestor();
  UPDATE entradas_compras SET status = 'cancelado', observacoes = concat_ws(' | ', observacoes, 'Cancelado: ' || coalesce(p_motivo, 'sem motivo')) WHERE id = p_entrada AND status = 'pendente';
  IF NOT FOUND THEN RAISE EXCEPTION 'Só pedidos pendentes podem ser cancelados.'; END IF;
  UPDATE listas_compra_itens SET entrada_compra_id = NULL WHERE entrada_compra_id = p_entrada AND comprado = false;
  RETURN jsonb_build_object('entrada_id', p_entrada, 'status', 'cancelado');
END; $$;

GRANT EXECUTE ON FUNCTION fn_recebimento_tela(), fn_recebimento_confirmar(jsonb), fn_recebimento_cancelar(uuid, text) TO authenticated;

-- Foto da nota: quem está logado sobe e lê; o bucket é privado, a tela usa URL assinada.
CREATE POLICY notas_fiscais_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'notas-fiscais');
CREATE POLICY notas_fiscais_ler ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'notas-fiscais');
