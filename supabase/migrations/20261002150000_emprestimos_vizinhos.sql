-- Empréstimo com vizinhos (Estoque Beta 2, bloco 3).
--
-- Vizinho = outro bar ou restaurante. Dois sentidos:
--   pegamos     = pegamos emprestado com o vizinho (entra no Central, devemos devolver)
--   emprestamos = emprestamos para o vizinho (sai do Central, ele deve devolver)
-- Cada empréstimo é uma linha em emprestimos_vizinhos com o que falta devolver.
-- O saldo só mexe no Central (entrada ou saída, origem_tipo 'vizinho'), a
-- custo médio. Devolver gera o movimento contrário; parcial é permitido.
-- Nada de saldo negativo em estoque de vizinho: o vizinho não é estoque.

CREATE TABLE IF NOT EXISTS vizinhos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  telefone text,
  observacoes text,
  ativo boolean NOT NULL DEFAULT true,
  criado_em timestamptz NOT NULL DEFAULT now(),
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE vizinhos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'vizinhos' AND policyname = 'vizinhos_autenticados') THEN
    CREATE POLICY vizinhos_autenticados ON vizinhos FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS emprestimos_vizinhos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vizinho_id uuid NOT NULL REFERENCES vizinhos(id),
  item_id uuid NOT NULL REFERENCES itens_estoque(id),
  sentido text NOT NULL CHECK (sentido IN ('pegamos', 'emprestamos')),
  quantidade numeric NOT NULL CHECK (quantidade > 0),
  devolvido numeric NOT NULL DEFAULT 0,
  custo_unitario numeric NOT NULL DEFAULT 0,
  data date NOT NULL DEFAULT current_date,
  responsavel text,
  observacoes text,
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto', 'quitado', 'cancelado')),
  movimentacao_id uuid,
  criado_por uuid,
  criado_em timestamptz NOT NULL DEFAULT now(),
  quitado_em timestamptz,
  cancelado_motivo text
);
CREATE INDEX IF NOT EXISTS emprestimos_vizinhos_status_idx ON emprestimos_vizinhos (status, vizinho_id);
ALTER TABLE emprestimos_vizinhos ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'emprestimos_vizinhos' AND policyname = 'emprestimos_vizinhos_autenticados') THEN
    CREATE POLICY emprestimos_vizinhos_autenticados ON emprestimos_vizinhos FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── apoio: um movimento no Central por conta de empréstimo ─────────────────
CREATE OR REPLACE FUNCTION fn_emprestimo_mov(p_item uuid, p_tipo text, p_qtd numeric, p_custo numeric, p_motivo text, p_obs text, p_chave text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_central uuid; v_nome text; v_id uuid;
BEGIN
  SELECT id INTO v_central FROM estoques WHERE tipo = 'central' AND status LIMIT 1;
  SELECT trim(nome) INTO v_nome FROM itens_estoque WHERE id = p_item;
  INSERT INTO movimentacoes_estoque (item_id, tipo_movimentacao, quantidade, estoque_origem_id, estoque_destino_id, custo_unitario, custo_total, data_movimentacao, motivo, observacoes, origem_tipo, criado_por, item_descricao, idempotency_key)
  VALUES (p_item, p_tipo, p_qtd, CASE WHEN p_tipo = 'saida' THEN v_central END, CASE WHEN p_tipo = 'entrada' THEN v_central END, p_custo, p_qtd * p_custo, current_date,
          p_motivo, p_obs, 'vizinho', fn_usuario_sistema_id(), v_nome, 'vizinho_' || p_chave || '_' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'))
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ── cadastro do vizinho ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_vizinho_salvar(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid := nullif(p->>'id', '')::uuid; v_nome text := trim(coalesce(p->>'nome', ''));
BEGIN
  IF v_nome = '' THEN RAISE EXCEPTION 'Dê um nome ao vizinho'; END IF;
  IF v_id IS NULL THEN
    INSERT INTO vizinhos (nome, telefone, observacoes, ativo) VALUES (v_nome, nullif(trim(coalesce(p->>'telefone', '')), ''), nullif(trim(coalesce(p->>'observacoes', '')), ''), coalesce((p->>'ativo')::boolean, true)) RETURNING id INTO v_id;
  ELSE
    UPDATE vizinhos SET nome = v_nome, telefone = nullif(trim(coalesce(p->>'telefone', '')), ''), observacoes = nullif(trim(coalesce(p->>'observacoes', '')), ''), ativo = coalesce((p->>'ativo')::boolean, ativo), atualizado_em = now() WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Vizinho não encontrado'; END IF;
  END IF;
  RETURN v_id;
END $$;

-- ── registrar: pegamos com o vizinho ou emprestamos para ele ───────────────
CREATE OR REPLACE FUNCTION fn_emprestimo_registrar(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_viz uuid := nullif(p->>'vizinho_id', '')::uuid; v_sentido text := p->>'sentido'; v_resp text := nullif(trim(coalesce(p->>'responsavel', '')), '');
        v_obs text := nullif(trim(coalesce(p->>'observacoes', '')), ''); v_viz_nome text; v_central uuid; r record; v_custo numeric; v_saldo numeric; v_nome text;
        v_mov uuid; v_id uuid; v_ids uuid[] := '{}'; v_neg text[] := '{}'; v_n int := 0;
BEGIN
  SELECT nome INTO v_viz_nome FROM vizinhos WHERE id = v_viz AND ativo;
  IF v_viz_nome IS NULL THEN RAISE EXCEPTION 'Vizinho não encontrado'; END IF;
  IF v_sentido NOT IN ('pegamos', 'emprestamos') THEN RAISE EXCEPTION 'Sentido inválido'; END IF;
  SELECT id INTO v_central FROM estoques WHERE tipo = 'central' AND status LIMIT 1;
  IF v_resp IS NULL THEN SELECT nome_completo INTO v_resp FROM usuarios_sistema WHERE id = fn_usuario_sistema_id(); END IF;
  FOR r IN SELECT (x->>'item_id')::uuid item_id, (x->>'quantidade')::numeric quantidade FROM jsonb_array_elements(coalesce(p->'itens', '[]'::jsonb)) x LOOP
    IF r.item_id IS NULL OR r.quantidade IS NULL OR r.quantidade <= 0 THEN CONTINUE; END IF;
    SELECT trim(i.nome), coalesce(s.custo_medio, i.custo_medio, 0), coalesce(s.quantidade_atual, 0) INTO v_nome, v_custo, v_saldo
    FROM itens_estoque i LEFT JOIN saldos_estoque s ON s.item_id = i.id AND s.estoque_id = v_central WHERE i.id = r.item_id;
    IF v_nome IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
    IF v_sentido = 'emprestamos' AND v_saldo < r.quantidade THEN v_neg := v_neg || (v_nome || ': Central tinha ' || round(v_saldo, 2)); END IF;
    v_mov := fn_emprestimo_mov(r.item_id, CASE WHEN v_sentido = 'pegamos' THEN 'entrada' ELSE 'saida' END, r.quantidade, v_custo,
      CASE WHEN v_sentido = 'pegamos' THEN 'Empréstimo: pegamos com ' || v_viz_nome ELSE 'Empréstimo: emprestamos para ' || v_viz_nome END,
      concat_ws(' · ', 'Registrado por ' || coalesce(v_resp, '?'), v_obs), 'reg_' || v_viz || '_' || r.item_id);
    INSERT INTO emprestimos_vizinhos (vizinho_id, item_id, sentido, quantidade, custo_unitario, responsavel, observacoes, movimentacao_id, criado_por)
    VALUES (v_viz, r.item_id, v_sentido, r.quantidade, v_custo, v_resp, v_obs, v_mov, fn_usuario_sistema_id()) RETURNING id INTO v_id;
    v_ids := v_ids || v_id; v_n := v_n + 1;
  END LOOP;
  IF v_n = 0 THEN RAISE EXCEPTION 'Nenhum item com quantidade'; END IF;
  RETURN jsonb_build_object('n', v_n, 'ids', to_jsonb(v_ids), 'ficou_negativo', to_jsonb(v_neg));
END $$;

-- ── devolver (parcial ou tudo) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_emprestimo_devolver(p_id uuid, p_quantidade numeric, p_responsavel text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e record; v_viz text; v_falta numeric; v_resp text := nullif(trim(coalesce(p_responsavel, '')), ''); v_qtd numeric;
BEGIN
  SELECT * INTO e FROM emprestimos_vizinhos WHERE id = p_id FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Empréstimo não encontrado'; END IF;
  IF e.status <> 'aberto' THEN RAISE EXCEPTION 'Este empréstimo já está %', e.status; END IF;
  v_falta := e.quantidade - e.devolvido;
  v_qtd := coalesce(p_quantidade, v_falta);
  IF v_qtd <= 0 OR v_qtd > v_falta + 0.0001 THEN RAISE EXCEPTION 'Quantidade deve ficar entre 0 e % (o que falta)', round(v_falta, 2); END IF;
  v_qtd := least(v_qtd, v_falta);
  SELECT nome INTO v_viz FROM vizinhos WHERE id = e.vizinho_id;
  IF v_resp IS NULL THEN SELECT nome_completo INTO v_resp FROM usuarios_sistema WHERE id = fn_usuario_sistema_id(); END IF;
  PERFORM fn_emprestimo_mov(e.item_id, CASE WHEN e.sentido = 'pegamos' THEN 'saida' ELSE 'entrada' END, v_qtd, e.custo_unitario,
    CASE WHEN e.sentido = 'pegamos' THEN 'Empréstimo: devolvemos para ' || v_viz ELSE 'Empréstimo: ' || v_viz || ' devolveu' END,
    'Devolução registrada por ' || coalesce(v_resp, '?'), 'dev_' || p_id);
  UPDATE emprestimos_vizinhos SET devolvido = devolvido + v_qtd,
    status = CASE WHEN devolvido + v_qtd >= quantidade - 0.0001 THEN 'quitado' ELSE 'aberto' END,
    quitado_em = CASE WHEN devolvido + v_qtd >= quantidade - 0.0001 THEN now() END
  WHERE id = p_id;
  RETURN jsonb_build_object('id', p_id, 'devolvido', v_qtd, 'falta', greatest(v_falta - v_qtd, 0), 'status', CASE WHEN v_falta - v_qtd <= 0.0001 THEN 'quitado' ELSE 'aberto' END);
END $$;

-- ── cancelar (só se nada foi devolvido): desfaz o movimento com o contrário ──
CREATE OR REPLACE FUNCTION fn_emprestimo_cancelar(p_id uuid, p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE e record; v_viz text;
BEGIN
  SELECT * INTO e FROM emprestimos_vizinhos WHERE id = p_id FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Empréstimo não encontrado'; END IF;
  IF e.status <> 'aberto' THEN RAISE EXCEPTION 'Este empréstimo já está %', e.status; END IF;
  IF e.devolvido > 0 THEN RAISE EXCEPTION 'Já houve devolução; registre o restante como devolvido'; END IF;
  SELECT nome INTO v_viz FROM vizinhos WHERE id = e.vizinho_id;
  PERFORM fn_emprestimo_mov(e.item_id, CASE WHEN e.sentido = 'pegamos' THEN 'saida' ELSE 'entrada' END, e.quantidade, e.custo_unitario,
    'Empréstimo cancelado (' || v_viz || ')', coalesce(nullif(trim(p_motivo), ''), 'lançado errado'), 'canc_' || p_id);
  UPDATE emprestimos_vizinhos SET status = 'cancelado', cancelado_motivo = nullif(trim(p_motivo), ''), quitado_em = now() WHERE id = p_id;
  RETURN jsonb_build_object('id', p_id, 'status', 'cancelado');
END $$;

-- ── a tela ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_vizinhos_tela()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_abertos jsonb; v_recentes jsonb; v_vizinhos jsonb; v_tot jsonb;
BEGIN
  WITH a AS (
    SELECT e.id, e.vizinho_id, v.nome vizinho, v.telefone, e.item_id, trim(i.nome) item, i.unidade_medida um, e.sentido, e.quantidade, e.devolvido,
           e.quantidade - e.devolvido falta, e.custo_unitario custo, (e.quantidade - e.devolvido) * e.custo_unitario valor, e.data, current_date - e.data dias, e.responsavel, e.observacoes
    FROM emprestimos_vizinhos e JOIN vizinhos v ON v.id = e.vizinho_id JOIN itens_estoque i ON i.id = e.item_id
    WHERE e.status = 'aberto'
  )
  SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY a.vizinho, a.data, a.item), '[]'::jsonb),
         jsonb_build_object(
           'devemos_itens', count(*) FILTER (WHERE sentido = 'pegamos'), 'devemos_valor', round(coalesce(sum(valor) FILTER (WHERE sentido = 'pegamos'), 0), 2),
           'nos_devem_itens', count(*) FILTER (WHERE sentido = 'emprestamos'), 'nos_devem_valor', round(coalesce(sum(valor) FILTER (WHERE sentido = 'emprestamos'), 0), 2),
           'mais_antigo_dias', coalesce(max(dias), 0), 'antigos', count(*) FILTER (WHERE dias > 7))
  INTO v_abertos, v_tot FROM a;

  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'quitado_em') DESC), '[]'::jsonb) INTO v_recentes FROM (
    SELECT jsonb_build_object('id', e.id, 'vizinho', v.nome, 'item', trim(i.nome), 'um', i.unidade_medida, 'sentido', e.sentido, 'quantidade', e.quantidade, 'status', e.status,
                              'data', e.data, 'quitado_em', e.quitado_em, 'responsavel', e.responsavel, 'motivo', e.cancelado_motivo) x
    FROM emprestimos_vizinhos e JOIN vizinhos v ON v.id = e.vizinho_id JOIN itens_estoque i ON i.id = e.item_id
    WHERE e.status <> 'aberto' AND e.quitado_em >= now() - interval '30 days'
  ) q;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'nome', v.nome, 'telefone', v.telefone, 'observacoes', v.observacoes, 'ativo', v.ativo,
           'abertos', (SELECT count(*) FROM emprestimos_vizinhos e WHERE e.vizinho_id = v.id AND e.status = 'aberto'),
           'historico', (SELECT count(*) FROM emprestimos_vizinhos e WHERE e.vizinho_id = v.id)) ORDER BY v.ativo DESC, v.nome), '[]'::jsonb)
  INTO v_vizinhos FROM vizinhos v;

  RETURN jsonb_build_object('vizinhos', v_vizinhos, 'abertos', v_abertos, 'recentes', v_recentes, 'totais', v_tot);
END $$;

-- ── Hoje: cartão de empréstimos ────────────────────────────────────────────
-- fn_beta2_hoje ganha 'emprestimos_abertos' e 'emprestimos_antigos' (> 7 dias).
-- O corpo é o mesmo de 20261001190000_repor_setores.sql com as duas linhas abaixo
-- acrescentadas ao jsonb_build_object:
--   'emprestimos_abertos', (SELECT count(*) FROM emprestimos_vizinhos WHERE status = 'aberto'),
--   'emprestimos_antigos', (SELECT count(*) FROM emprestimos_vizinhos WHERE status = 'aberto' AND data < v_hoje - 7)
