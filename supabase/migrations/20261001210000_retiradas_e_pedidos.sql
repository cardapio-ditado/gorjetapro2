/*
  # Estoque Beta 2: Retiradas e pedidos

  Dois movimentos entre o Central e os setores, além da reposição diária:
    pedido   → o setor pede, o estoquista entrega quando puder (requisição
               interna, como sempre foi; a entrega limita ao saldo do Central).
    retirada → fora de hora alguém pega do Central e registra: sai do saldo
               na hora (mesmo que fique negativo, para aparecer em Hoje) e
               outra pessoa confere de manhã.

  requisicoes_internas ganha tipo (pedido | retirada | reposicao) e os campos
  da conferência. As reposições automáticas antigas recebem tipo 'reposicao'.
*/

ALTER TABLE requisicoes_internas
  ADD COLUMN IF NOT EXISTS tipo text NOT NULL DEFAULT 'pedido' CHECK (tipo IN ('pedido', 'retirada', 'reposicao')),
  ADD COLUMN IF NOT EXISTS confirmado_por uuid,
  ADD COLUMN IF NOT EXISTS confirmado_nome text,
  ADD COLUMN IF NOT EXISTS confirmado_em timestamptz;
UPDATE requisicoes_internas SET tipo = 'reposicao' WHERE funcionario_nome = 'Reposição automática' AND tipo = 'pedido';

-- (funções fn_movimentos_tela, fn_pedido_interno_criar, fn_pedido_interno_entregar, fn_retirada_registrar, fn_retirada_confirmar e fn_beta2_hoje: ver abaixo)

CREATE OR REPLACE FUNCTION fn_movimentos_tela()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH central AS (SELECT id FROM estoques WHERE tipo = 'central' AND status ORDER BY criado_em LIMIT 1),
  itens_de AS (
    SELECT ri.requisicao_id, jsonb_agg(jsonb_build_object(
      'item_id', ri.item_id, 'nome', trim(i.nome), 'um', i.unidade_medida, 'solicitada', ri.quantidade_solicitada, 'entregue', ri.quantidade_entregue,
      'central', round(coalesce(sc.quantidade_atual, 0), 3), 'observacao', ri.observacao) ORDER BY trim(i.nome)) AS itens
    FROM requisicoes_internas_itens ri JOIN itens_estoque i ON i.id = ri.item_id
    LEFT JOIN saldos_estoque sc ON sc.item_id = ri.item_id AND sc.estoque_id = (SELECT id FROM central)
    GROUP BY ri.requisicao_id
  ),
  base AS (
    SELECT r.id, r.numero_requisicao AS numero, r.tipo, r.status, r.funcionario_nome AS quem, r.setor, r.estoque_destino_id, e.nome AS destino, r.data_requisicao AS quando,
           r.data_conclusao, r.observacoes, r.confirmado_nome, r.confirmado_em, coalesce(it.itens, '[]'::jsonb) AS itens,
           (SELECT nome_completo FROM usuarios_sistema u WHERE u.id = r.concluido_por) AS entregue_por
      FROM requisicoes_internas r LEFT JOIN estoques e ON e.id = r.estoque_destino_id LEFT JOIN itens_de it ON it.requisicao_id = r.id
     WHERE r.tipo IN ('pedido', 'retirada')
  )
  SELECT jsonb_build_object(
    'setores', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome) ORDER BY nome), '[]'::jsonb) FROM estoques WHERE status AND tipo IN ('geral', 'secundario', 'kit', 'producao')),
    'pedidos_abertos', (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.quando), '[]'::jsonb) FROM base b WHERE b.tipo = 'pedido' AND b.status IN ('pendente', 'aprovado')),
    'retiradas_sem_confirmacao', (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.quando DESC), '[]'::jsonb) FROM base b WHERE b.tipo = 'retirada' AND b.status = 'concluido' AND b.confirmado_em IS NULL),
    'recentes', (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY coalesce(b.data_conclusao, b.quando) DESC), '[]'::jsonb) FROM (SELECT * FROM base WHERE status IN ('concluido', 'rejeitado') AND coalesce(data_conclusao, quando) >= now() - interval '7 days' ORDER BY coalesce(data_conclusao, quando) DESC LIMIT 40) b)
  );
$$;

CREATE OR REPLACE FUNCTION fn_pedido_interno_criar(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_central uuid; v_dest record; v_req uuid; r jsonb; n int := 0;
BEGIN
  SELECT id INTO v_central FROM estoques WHERE tipo = 'central' AND status ORDER BY criado_em LIMIT 1;
  SELECT id, nome INTO v_dest FROM estoques WHERE id = nullif(p->>'estoque_id', '')::uuid AND status;
  IF v_dest.id IS NULL THEN RAISE EXCEPTION 'Escolha o setor.'; END IF;
  IF jsonb_array_length(coalesce(p->'itens', '[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'O pedido precisa de pelo menos um item.'; END IF;
  INSERT INTO requisicoes_internas (numero_requisicao, data_requisicao, funcionario_nome, setor, estoque_origem_id, estoque_destino_id, status, observacoes, criado_anonimamente, data_aprovacao, aprovado_por, tipo)
  VALUES ('', now(), coalesce(nullif(p->>'quem', ''), 'Setor'), v_dest.nome, v_central, v_dest.id, 'aprovado', nullif(p->>'observacoes', ''), false, now(), fn_usuario_sistema_id(), 'pedido')
  RETURNING id INTO v_req;
  FOR r IN SELECT x FROM jsonb_array_elements(p->'itens') x LOOP
    IF coalesce((r->>'quantidade')::numeric, 0) <= 0 THEN CONTINUE; END IF;
    INSERT INTO requisicoes_internas_itens (requisicao_id, item_id, quantidade_solicitada) VALUES (v_req, (r->>'item_id')::uuid, (r->>'quantidade')::numeric);
    n := n + 1;
  END LOOP;
  IF n = 0 THEN RAISE EXCEPTION 'Toda linha precisa de quantidade.'; END IF;
  RETURN jsonb_build_object('requisicao_id', v_req, 'setor', v_dest.nome, 'itens', n);
END; $$;

CREATE OR REPLACE FUNCTION fn_pedido_interno_entregar(p_id uuid, p_itens jsonb, p_responsavel text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req record; v_central uuid; r record; v_saldo numeric; v_qtd numeric; v_nome text; n int := 0; v_faltou text[] := '{}';
BEGIN
  SELECT * INTO v_req FROM requisicoes_internas WHERE id = p_id;
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;
  IF v_req.status NOT IN ('pendente', 'aprovado') THEN RAISE EXCEPTION 'Este pedido já foi entregue ou encerrado.'; END IF;
  v_central := coalesce(v_req.estoque_origem_id, (SELECT id FROM estoques WHERE tipo = 'central' AND status ORDER BY criado_em LIMIT 1));
  UPDATE requisicoes_internas_itens SET quantidade_entregue = 0, quantidade_aprovada = 0 WHERE requisicao_id = p_id;
  FOR r IN SELECT (x->>'item_id')::uuid AS item_id, (x->>'quantidade')::numeric AS quantidade FROM jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x LOOP
    IF r.quantidade IS NULL OR r.quantidade <= 0 THEN CONTINUE; END IF;
    SELECT trim(nome) INTO v_nome FROM itens_estoque WHERE id = r.item_id;
    SELECT coalesce(quantidade_atual, 0) INTO v_saldo FROM saldos_estoque WHERE estoque_id = v_central AND item_id = r.item_id;
    v_saldo := coalesce(v_saldo, 0);
    v_qtd := least(r.quantidade, greatest(v_saldo, 0));
    IF v_qtd < r.quantidade THEN v_faltou := v_faltou || (v_nome || ': Central tem ' || trim(to_char(greatest(v_saldo, 0), 'FM9999990.###')) || ', pedia ' || trim(to_char(r.quantidade, 'FM9999990.###'))); END IF;
    UPDATE requisicoes_internas_itens SET quantidade_aprovada = v_qtd, quantidade_entregue = v_qtd WHERE requisicao_id = p_id AND item_id = r.item_id;
    IF NOT FOUND THEN
      INSERT INTO requisicoes_internas_itens (requisicao_id, item_id, quantidade_solicitada, quantidade_aprovada, quantidade_entregue) VALUES (p_id, r.item_id, r.quantidade, v_qtd, v_qtd);
    END IF;
    IF v_qtd > 0 THEN n := n + 1; END IF;
  END LOOP;
  IF n = 0 THEN RAISE EXCEPTION 'Nada para entregar: o Central não tem saldo dos itens pedidos.'; END IF;
  UPDATE requisicoes_internas SET status = 'concluido', data_conclusao = now(), concluido_por = fn_usuario_sistema_id(),
         observacoes = concat_ws(' | ', observacoes, coalesce('Entregue por ' || nullif(p_responsavel, ''), NULL)) WHERE id = p_id;
  RETURN jsonb_build_object('requisicao_id', p_id, 'itens', n, 'faltou', to_jsonb(v_faltou), 'movimentacoes', (SELECT count(*) FROM movimentacoes_estoque WHERE origem_tipo = 'requisicao' AND origem_id = p_id));
END; $$;

CREATE OR REPLACE FUNCTION fn_retirada_registrar(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_central uuid; v_dest record; v_req uuid; r jsonb; n int := 0; v_saldo numeric; v_nome text; v_negativos text[] := '{}';
BEGIN
  SELECT id INTO v_central FROM estoques WHERE tipo = 'central' AND status ORDER BY criado_em LIMIT 1;
  SELECT id, nome INTO v_dest FROM estoques WHERE id = nullif(p->>'estoque_id', '')::uuid AND status;
  IF v_dest.id IS NULL THEN RAISE EXCEPTION 'Escolha o setor que levou.'; END IF;
  IF nullif(p->>'quem', '') IS NULL THEN RAISE EXCEPTION 'Diga quem retirou.'; END IF;
  IF jsonb_array_length(coalesce(p->'itens', '[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'A retirada precisa de pelo menos um item.'; END IF;
  INSERT INTO requisicoes_internas (numero_requisicao, data_requisicao, funcionario_nome, setor, estoque_origem_id, estoque_destino_id, status, observacoes, criado_anonimamente, data_aprovacao, aprovado_por, tipo)
  VALUES ('', now(), p->>'quem', v_dest.nome, v_central, v_dest.id, 'aprovado', concat_ws(' | ', 'Retirada direta do Central', nullif(p->>'observacoes', '')), false, now(), fn_usuario_sistema_id(), 'retirada')
  RETURNING id INTO v_req;
  FOR r IN SELECT x FROM jsonb_array_elements(p->'itens') x LOOP
    IF coalesce((r->>'quantidade')::numeric, 0) <= 0 THEN CONTINUE; END IF;
    SELECT coalesce(quantidade_atual, 0), trim(i.nome) INTO v_saldo, v_nome FROM itens_estoque i LEFT JOIN saldos_estoque s ON s.item_id = i.id AND s.estoque_id = v_central WHERE i.id = (r->>'item_id')::uuid;
    IF coalesce(v_saldo, 0) < (r->>'quantidade')::numeric THEN v_negativos := v_negativos || (v_nome || ' (Central tinha ' || trim(to_char(coalesce(v_saldo, 0), 'FM9999990.###')) || ')'); END IF;
    INSERT INTO requisicoes_internas_itens (requisicao_id, item_id, quantidade_solicitada, quantidade_aprovada, quantidade_entregue)
    VALUES (v_req, (r->>'item_id')::uuid, (r->>'quantidade')::numeric, (r->>'quantidade')::numeric, (r->>'quantidade')::numeric);
    n := n + 1;
  END LOOP;
  IF n = 0 THEN RAISE EXCEPTION 'Toda linha precisa de quantidade.'; END IF;
  -- A retirada já aconteceu: sai do Central agora, mesmo que fique negativo (aparece em Hoje para acertar).
  UPDATE requisicoes_internas SET status = 'concluido', data_conclusao = now(), concluido_por = fn_usuario_sistema_id() WHERE id = v_req;
  RETURN jsonb_build_object('requisicao_id', v_req, 'setor', v_dest.nome, 'itens', n, 'ficou_negativo', to_jsonb(v_negativos));
END; $$;

CREATE OR REPLACE FUNCTION fn_retirada_confirmar(p_id uuid, p_quem text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_req record;
BEGIN
  SELECT * INTO v_req FROM requisicoes_internas WHERE id = p_id AND tipo = 'retirada';
  IF v_req.id IS NULL THEN RAISE EXCEPTION 'Retirada não encontrada'; END IF;
  IF v_req.confirmado_em IS NOT NULL THEN RAISE EXCEPTION 'Esta retirada já foi conferida.'; END IF;
  IF nullif(trim(p_quem), '') IS NULL THEN RAISE EXCEPTION 'Diga quem conferiu.'; END IF;
  IF lower(trim(p_quem)) = lower(trim(v_req.funcionario_nome)) THEN RAISE EXCEPTION 'Quem retirou não pode conferir a própria retirada.'; END IF;
  UPDATE requisicoes_internas SET confirmado_por = fn_usuario_sistema_id(), confirmado_nome = trim(p_quem), confirmado_em = now() WHERE id = p_id;
  RETURN jsonb_build_object('requisicao_id', p_id, 'confirmado_por', trim(p_quem));
END; $$;

GRANT EXECUTE ON FUNCTION fn_movimentos_tela(), fn_pedido_interno_criar(jsonb), fn_pedido_interno_entregar(uuid, jsonb, text), fn_retirada_registrar(jsonb), fn_retirada_confirmar(uuid, text) TO authenticated;

-- fn_beta2_hoje: 'pedidos_a_entregar' passa a contar só tipo 'pedido' e entra 'retiradas_sem_confirmacao'
-- (corpo completo igual ao de 20261001190000_repor_setores.sql, com as duas linhas acima).
