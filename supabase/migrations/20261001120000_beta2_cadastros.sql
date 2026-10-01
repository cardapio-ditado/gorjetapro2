/*
  # Estoque Beta 2: cadastros com arquivar e excluir seguros

  Um botão "Excluir" em item, estoque, ficha técnica e fornecedor. Antes de
  agir, `fn_cadastro_vinculos` conta o que depende do registro, em palavras.
  `fn_cadastro_excluir` arquiva (some das listas, histórico fica) ou exclui
  de vez, só quando nada de histórico depende dele. Para ficha, o excluir de
  vez solta as vendas Zig e tira a ficha dos ingredientes das outras, em um
  passo. `fn_ficha_salvar` grava ficha e ingredientes numa transação só.
  Fornecedor ganha `grupo` para a lista por grupos.
*/

ALTER TABLE fornecedores ADD COLUMN IF NOT EXISTS grupo text;
UPDATE fornecedores SET grupo = CASE tipo WHEN 'musico' THEN 'Músicos' WHEN 'rh' THEN 'RH' END WHERE grupo IS NULL AND tipo IN ('musico', 'rh');

-- ── O que depende do registro ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_cadastro_vinculos(p_tipo text, p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb := '[]'::jsonb; n bigint; nomes text;
  -- cada linha: rotulo, quantidade, bloqueia (impede excluir de vez), desfaz (o excluir de vez resolve sozinho)
BEGIN
  IF p_tipo = 'item' THEN
    SELECT count(*) INTO n FROM movimentacoes_estoque WHERE item_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'movimentações no kardex', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*) INTO n FROM contagens_estoque_itens WHERE item_estoque_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'contagens', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*) INTO n FROM requisicoes_internas_itens WHERE item_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'pedidos internos', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*) INTO n FROM itens_entrada_compra WHERE item_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'notas de compra', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*) INTO n FROM saldos_estoque WHERE item_id = p_id AND quantidade_atual <> 0;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'estoques com saldo', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*), string_agg(DISTINCT f.nome, ', ') INTO n, nomes FROM ficha_ingredientes fi JOIN fichas_tecnicas f ON f.id = fi.ficha_id WHERE fi.item_estoque_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'fichas técnicas usam este item', 'qtd', n, 'bloqueia', true, 'detalhe', left(nomes, 200)); END IF;
    SELECT count(*) INTO n FROM mapeamento_itens_vendas WHERE item_estoque_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'vendas Zig ligadas', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*) INTO n FROM listas_compra_itens WHERE item_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'listas de compra', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*) INTO n FROM fichas_tecnicas WHERE item_produzido_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'fichas que produzem este item', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*) INTO n FROM itens_estoque_niveis WHERE item_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'setores onde está configurado', 'qtd', n, 'bloqueia', false, 'desfaz', true); END IF;

  ELSIF p_tipo = 'estoque' THEN
    SELECT count(*) INTO n FROM movimentacoes_estoque WHERE estoque_origem_id = p_id OR estoque_destino_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'movimentações', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*) INTO n FROM contagens_estoque WHERE estoque_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'contagens', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*) INTO n FROM requisicoes_internas WHERE estoque_origem_id = p_id OR estoque_destino_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'pedidos internos', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*) INTO n FROM entradas_compras WHERE estoque_destino_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'notas de compra', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*) INTO n FROM saldos_estoque WHERE estoque_id = p_id AND quantidade_atual <> 0;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'itens com saldo', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*) INTO n FROM mapeamento_itens_vendas WHERE estoque_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'vendas Zig que baixam aqui', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*) INTO n FROM itens_estoque_niveis WHERE estoque_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'itens configurados', 'qtd', n, 'bloqueia', false, 'desfaz', true); END IF;
    IF EXISTS (SELECT 1 FROM estoques WHERE id = p_id AND tipo = 'central') THEN v := v || jsonb_build_object('rotulo', 'é o Estoque Central', 'qtd', 1, 'bloqueia', true); END IF;

  ELSIF p_tipo = 'ficha' THEN
    SELECT count(*) INTO n FROM producoes WHERE ficha_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'produções registradas', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*), string_agg(DISTINCT nome_externo, ', ') INTO n, nomes FROM mapeamento_itens_vendas WHERE ficha_tecnica_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'vendas Zig baixam por esta ficha', 'qtd', n, 'bloqueia', false, 'desfaz', true, 'detalhe', left(nomes, 200)); END IF;
    SELECT count(*), string_agg(DISTINCT f.nome, ', ') INTO n, nomes FROM ficha_ingredientes fi JOIN fichas_tecnicas f ON f.id = fi.ficha_id WHERE fi.ficha_tecnica_ingrediente_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'outras fichas usam esta como ingrediente', 'qtd', n, 'bloqueia', false, 'desfaz', true, 'detalhe', left(nomes, 200)); END IF;
    SELECT count(*) INTO n FROM itens_estoque WHERE ficha_tecnica_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'itens apontam para esta ficha', 'qtd', n, 'bloqueia', false, 'desfaz', true); END IF;
    SELECT count(*) INTO n FROM mapeamentos_itens_excel WHERE ficha_tecnica_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'mapeamentos de planilha', 'qtd', n, 'bloqueia', false, 'desfaz', true); END IF;

  ELSIF p_tipo = 'fornecedor' THEN
    SELECT count(*) INTO n FROM entradas_compras WHERE fornecedor_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'notas de compra', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*) INTO n FROM contas_pagar WHERE fornecedor_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'contas a pagar', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*) INTO n FROM fornecedor_notas WHERE fornecedor_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'notas do fornecedor', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*) INTO n FROM fornecedor_pagamentos WHERE fornecedor_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'pagamentos', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*) INTO n FROM pagamentos_gorjeta WHERE fornecedor_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'pagamentos de gorjeta', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*) INTO n FROM musicos WHERE fornecedor_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'cadastro de músico', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*) INTO n FROM listas_compra WHERE fornecedor_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'listas de compra', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*) INTO n FROM credito_fornecedores WHERE fornecedor_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'créditos', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*) INTO n FROM itens_consignados WHERE fornecedor_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'itens consignados', 'qtd', n, 'bloqueia', true); END IF;
    SELECT count(*) INTO n FROM fornecedor_catalogo WHERE fornecedor_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'itens no catálogo', 'qtd', n, 'bloqueia', false, 'desfaz', true); END IF;
    SELECT count(*) INTO n FROM itens_estoque WHERE fornecedor_padrao_id = p_id;
    IF n > 0 THEN v := v || jsonb_build_object('rotulo', 'itens têm este fornecedor como padrão', 'qtd', n, 'bloqueia', false, 'desfaz', true); END IF;
  ELSE
    RAISE EXCEPTION 'Tipo de cadastro desconhecido: %', p_tipo;
  END IF;

  RETURN jsonb_build_object(
    'vinculos', v,
    'pode_excluir', NOT EXISTS (SELECT 1 FROM jsonb_array_elements(v) x WHERE (x->>'bloqueia')::boolean)
  );
END; $$;

-- ── Arquivar, restaurar ou excluir de vez ───────────────────────────────────
CREATE OR REPLACE FUNCTION fn_cadastro_excluir(p_tipo text, p_id uuid, p_modo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v jsonb; feito jsonb := '[]'::jsonb; n int;
BEGIN
  PERFORM setores_exigir_gestor();
  IF p_modo NOT IN ('arquivar', 'restaurar', 'excluir') THEN RAISE EXCEPTION 'Modo inválido: %', p_modo; END IF;

  IF p_modo IN ('arquivar', 'restaurar') THEN
    IF p_tipo = 'item' THEN UPDATE itens_estoque SET status = CASE p_modo WHEN 'arquivar' THEN 'inativo' ELSE 'ativo' END, atualizado_em = now() WHERE id = p_id;
    ELSIF p_tipo = 'estoque' THEN UPDATE estoques SET status = (p_modo = 'restaurar'), atualizado_em = now() WHERE id = p_id;
    ELSIF p_tipo = 'ficha' THEN UPDATE fichas_tecnicas SET ativo = (p_modo = 'restaurar') WHERE id = p_id;
    ELSIF p_tipo = 'fornecedor' THEN UPDATE fornecedores SET status = CASE p_modo WHEN 'arquivar' THEN 'inativo' ELSE 'ativo' END WHERE id = p_id;
    ELSE RAISE EXCEPTION 'Tipo de cadastro desconhecido: %', p_tipo; END IF;
    RETURN jsonb_build_object('modo', p_modo, 'feito', feito);
  END IF;

  v := fn_cadastro_vinculos(p_tipo, p_id);
  IF NOT (v->>'pode_excluir')::boolean THEN
    RAISE EXCEPTION 'Este registro tem histórico e não pode ser excluído de vez. Arquive.';
  END IF;

  IF p_tipo = 'item' THEN
    DELETE FROM itens_estoque_niveis WHERE item_id = p_id; GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN feito := feito || jsonb_build_object('rotulo', 'tirado dos setores', 'qtd', n); END IF;
    DELETE FROM saldos_estoque WHERE item_id = p_id;
    DELETE FROM beta_item_config WHERE item_id = p_id;
    DELETE FROM alertas_estoque WHERE item_id = p_id;
    DELETE FROM alertas_estoque_negativo WHERE item_id = p_id;
    DELETE FROM compras_adiadas WHERE item_id = p_id;
    DELETE FROM itens_estoque WHERE id = p_id;
  ELSIF p_tipo = 'estoque' THEN
    DELETE FROM itens_estoque_niveis WHERE estoque_id = p_id; GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN feito := feito || jsonb_build_object('rotulo', 'itens desconfigurados', 'qtd', n); END IF;
    DELETE FROM saldos_estoque WHERE estoque_id = p_id;
    UPDATE itens_estoque SET estoque_nativo_id = NULL WHERE estoque_nativo_id = p_id;
    DELETE FROM estoques WHERE id = p_id;
  ELSIF p_tipo = 'ficha' THEN
    UPDATE mapeamento_itens_vendas SET ficha_tecnica_id = NULL WHERE ficha_tecnica_id = p_id; GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN feito := feito || jsonb_build_object('rotulo', 'vendas Zig soltas (religue em Configurar setores)', 'qtd', n); END IF;
    DELETE FROM ficha_ingredientes WHERE ficha_tecnica_ingrediente_id = p_id; GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN feito := feito || jsonb_build_object('rotulo', 'tirada de outras fichas (custo delas recalculado)', 'qtd', n); END IF;
    UPDATE itens_estoque SET ficha_tecnica_id = NULL WHERE ficha_tecnica_id = p_id;
    DELETE FROM mapeamentos_itens_excel WHERE ficha_tecnica_id = p_id;
    DELETE FROM ficha_ingredientes WHERE ficha_id = p_id;
    DELETE FROM fichas_tecnicas WHERE id = p_id;
  ELSIF p_tipo = 'fornecedor' THEN
    UPDATE itens_estoque SET fornecedor_padrao_id = NULL WHERE fornecedor_padrao_id = p_id; GET DIAGNOSTICS n = ROW_COUNT;
    IF n > 0 THEN feito := feito || jsonb_build_object('rotulo', 'itens ficaram sem fornecedor padrão', 'qtd', n); END IF;
    DELETE FROM fornecedor_catalogo WHERE fornecedor_id = p_id;
    DELETE FROM fornecedores WHERE id = p_id;
  END IF;
  RETURN jsonb_build_object('modo', 'excluir', 'feito', feito);
END; $$;

-- ── Fichas: lista com vínculos e gravação atômica ───────────────────────────
CREATE OR REPLACE FUNCTION fn_fichas_lista()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id, 'nome', f.nome, 'tipo_consumo', coalesce(f.tipo_consumo, 'producao'), 'porcoes', coalesce(f.porcoes, 1),
    'rendimento', f.rendimento, 'unidade_rendimento', f.unidade_rendimento, 'custo_total', coalesce(f.custo_total, 0),
    'ativo', f.ativo IS DISTINCT FROM false,
    'ingredientes', (SELECT count(*) FROM ficha_ingredientes fi WHERE fi.ficha_id = f.id),
    'vendas', (SELECT count(*) FROM mapeamento_itens_vendas m WHERE m.ficha_tecnica_id = f.id),
    'usada_em', (SELECT count(*) FROM ficha_ingredientes fi WHERE fi.ficha_tecnica_ingrediente_id = f.id),
    'producoes', (SELECT count(*) FROM producoes p WHERE p.ficha_id = f.id)
  ) ORDER BY f.nome), '[]'::jsonb)
  FROM fichas_tecnicas f;
$$;

CREATE OR REPLACE FUNCTION fn_ficha_salvar(p jsonb)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid := nullif(p->>'id', '')::uuid; v_nome text := trim(p->>'nome'); r jsonb; i int := 0;
BEGIN
  IF v_nome IS NULL OR v_nome = '' THEN RAISE EXCEPTION 'Informe o nome da ficha.'; END IF;
  IF EXISTS (SELECT 1 FROM fichas_tecnicas WHERE lower(trim(nome)) = lower(v_nome) AND id IS DISTINCT FROM v_id) THEN RAISE EXCEPTION 'Já existe uma ficha com esse nome.'; END IF;
  IF jsonb_array_length(coalesce(p->'ingredientes', '[]'::jsonb)) = 0 THEN RAISE EXCEPTION 'Adicione pelo menos um ingrediente.'; END IF;

  IF v_id IS NULL THEN
    INSERT INTO fichas_tecnicas (nome, porcoes, ativo, status, tipo_consumo, modo_preparo, observacoes_preparo, rendimento, unidade_rendimento, categoria, custo_total)
    VALUES (v_nome, greatest(1, coalesce((p->>'porcoes')::int, 1)), coalesce((p->>'ativo')::boolean, true), true, coalesce(p->>'tipo_consumo', 'producao'),
            nullif(p->>'modo_preparo', ''), nullif(p->>'observacoes_preparo', ''), coalesce((p->>'rendimento')::numeric, 1), coalesce(nullif(p->>'unidade_rendimento', ''), 'porções'), coalesce(nullif(p->>'categoria', ''), 'Geral'), 0)
    RETURNING id INTO v_id;
  ELSE
    UPDATE fichas_tecnicas SET nome = v_nome, porcoes = greatest(1, coalesce((p->>'porcoes')::int, 1)), ativo = coalesce((p->>'ativo')::boolean, ativo),
      tipo_consumo = coalesce(p->>'tipo_consumo', tipo_consumo), modo_preparo = nullif(p->>'modo_preparo', ''), observacoes_preparo = nullif(p->>'observacoes_preparo', ''),
      rendimento = coalesce((p->>'rendimento')::numeric, rendimento), unidade_rendimento = coalesce(nullif(p->>'unidade_rendimento', ''), unidade_rendimento),
      categoria = coalesce(nullif(p->>'categoria', ''), categoria)
    WHERE id = v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Ficha não encontrada.'; END IF;
    DELETE FROM ficha_ingredientes WHERE ficha_id = v_id;
  END IF;

  FOR r IN SELECT x FROM jsonb_array_elements(p->'ingredientes') x LOOP
    i := i + 1;
    IF nullif(r->>'ficha_tecnica_ingrediente_id', '')::uuid = v_id THEN RAISE EXCEPTION 'Uma ficha não pode usar a si mesma.'; END IF;
    IF coalesce((r->>'quantidade')::numeric, 0) <= 0 THEN RAISE EXCEPTION 'Quantidade inválida na linha %.', i; END IF;
    INSERT INTO ficha_ingredientes (ficha_id, item_estoque_id, ficha_tecnica_ingrediente_id, quantidade, ordem, observacoes, baixa_estoque)
    VALUES (v_id, nullif(r->>'item_estoque_id', '')::uuid, nullif(r->>'ficha_tecnica_ingrediente_id', '')::uuid, (r->>'quantidade')::numeric, i, nullif(r->>'observacoes', ''), coalesce((r->>'baixa_estoque')::boolean, true));
  END LOOP;
  RETURN v_id;
END; $$;

GRANT EXECUTE ON FUNCTION fn_cadastro_vinculos(text, uuid), fn_cadastro_excluir(text, uuid, text), fn_fichas_lista(), fn_ficha_salvar(jsonb) TO authenticated;
