/*
  # Estoque Beta, parte 2: receber mercadoria, pedir mais e contar o Central

  1. Receber mercadoria
     A foto da nota é lida pela IA (função extract-nota). Aqui o banco casa
     cada linha da nota com um item do cadastro (por semelhança de nome) e,
     na confirmação, grava a entrada pelo mesmo caminho do módulo atual:
     entradas_compras + itens_entrada_compra e status 'recebido', que dispara
     o gatilho que movimenta o estoque e atualiza o custo médio.

  2. Pedir mais
     Transferência avulsa do Central para um balcão, fora da montagem.

  3. Contar o Central por zona
     Zona = categoria do item, que é o que hoje corresponde à área física.
     A frequência vem de contagem_ciclos. Item não contado fica em branco,
     nunca vira zero.
*/

-- ---------------------------------------------------------------------------
-- Busca de item por semelhança (usada em receber e pedir mais)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_beta_buscar_item(p_termo text, p_estoque_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_central uuid;
  v_termo text := unaccent(lower(trim(coalesce(p_termo, ''))));
BEGIN
  SELECT id INTO v_central FROM estoques WHERE tipo = 'central' LIMIT 1;

  RETURN coalesce((
    SELECT jsonb_agg(l ORDER BY (l->>'score')::numeric DESC, l->>'nome')
    FROM (
      SELECT jsonb_build_object(
        'item_id', i.id,
        'nome', trim(i.nome),
        'categoria', i.categoria,
        'unidade', i.unidade_medida,
        'foto_url', c.foto_url,
        'rotulo_solto', coalesce(c.rotulo_solto, beta_rotulo_padrao(i.unidade_medida)),
        'rotulo_fechado', c.rotulo_fechado,
        'fator_fechado', c.fator_fechado,
        'custo_medio', coalesce(i.custo_medio, 0),
        'saldo_central', coalesce((SELECT s.quantidade_atual FROM saldos_estoque s WHERE s.item_id = i.id AND s.estoque_id = v_central), 0),
        'no_balcao', (p_estoque_id IS NOT NULL AND EXISTS (SELECT 1 FROM itens_estoque_niveis n WHERE n.item_id = i.id AND n.estoque_id = p_estoque_id)),
        'score', round((
          greatest(
            similarity(unaccent(lower(i.nome)), v_termo),
            CASE WHEN unaccent(lower(i.nome)) LIKE '%' || v_termo || '%' THEN 0.6 ELSE 0 END
          )
          + CASE WHEN p_estoque_id IS NOT NULL AND EXISTS (SELECT 1 FROM itens_estoque_niveis n WHERE n.item_id = i.id AND n.estoque_id = p_estoque_id) THEN 0.15 ELSE 0 END
        )::numeric, 3)
      ) AS l
      FROM itens_estoque i
      LEFT JOIN beta_item_config c ON c.item_id = i.id
      WHERE i.status = 'ativo' AND i.tipo_item = 'insumo'
        AND (v_termo = '' OR similarity(unaccent(lower(i.nome)), v_termo) > 0.15 OR unaccent(lower(i.nome)) LIKE '%' || v_termo || '%')
      ORDER BY 1 DESC
      LIMIT 12
    ) x
  ), '[]'::jsonb);
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Receber mercadoria
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_beta_receber_preparar(p_linhas jsonb, p_fornecedor jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_cnpj text := regexp_replace(coalesce(p_fornecedor->>'cnpj', ''), '\D', '', 'g');
  v_nome text := unaccent(lower(trim(coalesce(p_fornecedor->>'nome', ''))));
  v_forn jsonb;
  v_opcoes jsonb;
  v_linhas jsonb;
BEGIN
  -- Fornecedor: CNPJ bate, senão nome parecido
  IF v_cnpj <> '' THEN
    SELECT jsonb_build_object('id', f.id, 'nome', f.nome) INTO v_forn
    FROM fornecedores f WHERE regexp_replace(coalesce(f.cnpj, ''), '\D', '', 'g') = v_cnpj AND f.status = 'ativo' LIMIT 1;
  END IF;

  SELECT coalesce(jsonb_agg(o ORDER BY (o->>'score')::numeric DESC), '[]'::jsonb) INTO v_opcoes
  FROM (
    SELECT jsonb_build_object('id', f.id, 'nome', f.nome,
      'score', round(similarity(unaccent(lower(f.nome)), v_nome)::numeric, 3)) AS o
    FROM fornecedores f
    WHERE f.status = 'ativo' AND v_nome <> '' AND similarity(unaccent(lower(f.nome)), v_nome) > 0.2
    ORDER BY similarity(unaccent(lower(f.nome)), v_nome) DESC
    LIMIT 5
  ) x;

  IF v_forn IS NULL AND jsonb_array_length(v_opcoes) > 0 AND (v_opcoes->0->>'score')::numeric >= 0.45 THEN
    v_forn := jsonb_build_object('id', v_opcoes->0->>'id', 'nome', v_opcoes->0->>'nome');
  END IF;

  -- Linhas: para cada uma, o item mais parecido e mais 3 opções
  SELECT coalesce(jsonb_agg(linha ORDER BY (linha->>'indice')::int), '[]'::jsonb) INTO v_linhas
  FROM (
    SELECT jsonb_build_object(
      'indice', ord - 1,
      'descricao', l->>'descricao',
      'codigo', l->>'codigo',
      'quantidade', nullif(l->>'quantidade', '')::numeric,
      'unidade', l->>'unidade',
      'valor_unitario', nullif(l->>'valor_unitario', '')::numeric,
      'valor_total', nullif(l->>'valor_total', '')::numeric,
      'opcoes', (SELECT fn_beta_buscar_item(l->>'descricao', NULL)),
      'sugestao', (
        SELECT CASE WHEN (op->>'score')::numeric >= 0.3 THEN op ELSE NULL END
        FROM jsonb_array_elements(fn_beta_buscar_item(l->>'descricao', NULL)) op
        LIMIT 1
      )
    ) AS linha
    FROM jsonb_array_elements(coalesce(p_linhas, '[]'::jsonb)) WITH ORDINALITY AS t(l, ord)
  ) y;

  RETURN jsonb_build_object('fornecedor', v_forn, 'fornecedor_opcoes', v_opcoes, 'linhas', v_linhas);
END;
$$;

CREATE OR REPLACE FUNCTION fn_beta_receber_concluir(p_dados jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_central uuid;
  v_forn uuid := nullif(p_dados->>'fornecedor_id', '')::uuid;
  v_forn_nome text := nullif(trim(coalesce(p_dados->>'fornecedor_nome', '')), '');
  v_entrada uuid;
  v_itens int := 0;
  v_total numeric := 0;
  v_it jsonb;
BEGIN
  SELECT id INTO v_central FROM estoques WHERE tipo = 'central' LIMIT 1;

  IF jsonb_array_length(coalesce(p_dados->'itens', '[]'::jsonb)) = 0 THEN
    RAISE EXCEPTION 'Nenhum item para dar entrada';
  END IF;

  -- Fornecedor novo, se veio só o nome
  IF v_forn IS NULL AND v_forn_nome IS NOT NULL THEN
    SELECT id INTO v_forn FROM fornecedores WHERE lower(nome) = lower(v_forn_nome) LIMIT 1;
    IF v_forn IS NULL THEN
      INSERT INTO fornecedores (nome, cnpj, status, tipo, observacoes)
      VALUES (v_forn_nome, nullif(regexp_replace(coalesce(p_dados->>'cnpj', ''), '\D', '', 'g'), ''), 'ativo', 'geral',
              'Cadastrado ao receber nota pelo Estoque Beta')
      RETURNING id INTO v_forn;
    END IF;
  END IF;

  INSERT INTO entradas_compras
    (fornecedor_id, numero_documento, data_compra, estoque_destino_id, status, criado_por,
     origem_arquivo_url, observacoes, valor_total)
  VALUES
    (v_forn, nullif(p_dados->>'numero_documento', ''),
     coalesce(nullif(p_dados->>'data_compra', '')::date, (now() AT TIME ZONE 'America/Cuiaba')::date),
     v_central, 'pendente', auth.uid(),
     nullif(p_dados->>'arquivo_url', ''), 'Recebido pelo Estoque Beta', 0)
  RETURNING id INTO v_entrada;

  FOR v_it IN SELECT * FROM jsonb_array_elements(p_dados->'itens')
  LOOP
    IF nullif(v_it->>'item_id', '') IS NULL OR coalesce((v_it->>'quantidade')::numeric, 0) <= 0 THEN
      CONTINUE;
    END IF;
    INSERT INTO itens_entrada_compra (entrada_compra_id, item_id, quantidade, custo_unitario, custo_total)
    VALUES (v_entrada, (v_it->>'item_id')::uuid, (v_it->>'quantidade')::numeric,
            coalesce((v_it->>'custo_unitario')::numeric, 0),
            (v_it->>'quantidade')::numeric * coalesce((v_it->>'custo_unitario')::numeric, 0));
    v_itens := v_itens + 1;
    v_total := v_total + (v_it->>'quantidade')::numeric * coalesce((v_it->>'custo_unitario')::numeric, 0);
  END LOOP;

  IF v_itens = 0 THEN
    RAISE EXCEPTION 'Nenhum item válido para dar entrada';
  END IF;

  -- Vira "recebido": o gatilho do módulo atual movimenta o estoque e atualiza o custo médio
  UPDATE entradas_compras SET status = 'recebido', valor_total = v_total, data_entrega_real = (now() AT TIME ZONE 'America/Cuiaba')::date
  WHERE id = v_entrada;

  RETURN jsonb_build_object('success', true, 'entrada_id', v_entrada, 'itens', v_itens, 'valor_total', v_total);
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Pedir mais (transferência avulsa Central -> balcão)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_beta_pedir_mais(p_estoque_id uuid, p_item_id uuid, p_quantidade numeric, p_responsavel text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_central uuid;
  v_custo numeric;
  v_chave text := 'beta_extra_' || gen_random_uuid()::text;
BEGIN
  IF coalesce(p_quantidade, 0) <= 0 THEN RAISE EXCEPTION 'Quantidade precisa ser maior que zero'; END IF;
  SELECT id INTO v_central FROM estoques WHERE tipo = 'central' LIMIT 1;
  IF p_estoque_id = v_central THEN RAISE EXCEPTION 'O destino precisa ser um balcão'; END IF;

  SELECT coalesce(custo_medio, 0) INTO v_custo FROM itens_estoque WHERE id = p_item_id;

  INSERT INTO movimentacoes_estoque
    (estoque_origem_id, estoque_destino_id, item_id, tipo_movimentacao, quantidade,
     custo_unitario, custo_total, data_movimentacao, motivo, observacoes, origem_tipo, idempotency_key)
  VALUES
    (v_central, p_estoque_id, p_item_id, 'transferencia', p_quantidade,
     v_custo, p_quantidade * v_custo, (now() AT TIME ZONE 'America/Cuiaba')::date,
     'Pedido extra do balcão (beta)', coalesce('Pedido por ' || p_responsavel, NULL), 'beta', v_chave);

  RETURN jsonb_build_object(
    'success', true,
    'saldo_balcao', coalesce((SELECT quantidade_atual FROM saldos_estoque WHERE item_id = p_item_id AND estoque_id = p_estoque_id), 0),
    'saldo_central', coalesce((SELECT quantidade_atual FROM saldos_estoque WHERE item_id = p_item_id AND estoque_id = v_central), 0)
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- 3. Contar o Central por zona
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beta_contagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estoque_id uuid NOT NULL REFERENCES estoques(id),
  zona text NOT NULL,
  data date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  status text NOT NULL DEFAULT 'contando' CHECK (status IN ('contando', 'concluida', 'cancelada')),
  responsavel text,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  UNIQUE (estoque_id, zona, data)
);

CREATE TABLE IF NOT EXISTS beta_contagem_itens (
  contagem_id uuid NOT NULL REFERENCES beta_contagens(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES itens_estoque(id),
  saldo_antes numeric NOT NULL DEFAULT 0,
  fechados numeric,
  soltos numeric,
  contado numeric,
  contado_em timestamptz,
  PRIMARY KEY (contagem_id, item_id)
);

ALTER TABLE beta_contagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_contagem_itens ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS beta_contagens_ler ON beta_contagens;
CREATE POLICY beta_contagens_ler ON beta_contagens FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS beta_contagem_itens_ler ON beta_contagem_itens;
CREATE POLICY beta_contagem_itens_ler ON beta_contagem_itens FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION fn_beta_central_zonas()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_central uuid;
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
BEGIN
  SELECT id INTO v_central FROM estoques WHERE tipo = 'central' LIMIT 1;

  RETURN jsonb_build_object(
    'hoje', v_hoje,
    'zonas', (
      SELECT coalesce(jsonb_agg(z ORDER BY
        CASE z->>'situacao' WHEN 'em_andamento' THEN 0 WHEN 'atrasada' THEN 1 WHEN 'vence_hoje' THEN 2 WHEN 'feita_hoje' THEN 4 ELSE 3 END,
        z->>'zona'), '[]'::jsonb)
      FROM (
        SELECT jsonb_build_object(
          'zona', cat.categoria,
          'itens', cat.itens,
          'ciclo_dias', cat.ciclo,
          'ultima', cat.ultima,
          'vence_em', CASE WHEN cat.ultima IS NULL THEN v_hoje ELSE cat.ultima + cat.ciclo END,
          'situacao', CASE
            WHEN ab.id IS NOT NULL AND ab.status = 'contando' THEN 'em_andamento'
            WHEN ab.id IS NOT NULL AND ab.status = 'concluida' THEN 'feita_hoje'
            WHEN cat.ultima IS NULL OR cat.ultima + cat.ciclo < v_hoje THEN 'atrasada'
            WHEN cat.ultima + cat.ciclo = v_hoje THEN 'vence_hoje'
            ELSE 'em_dia' END,
          'contagem', CASE WHEN ab.id IS NULL THEN NULL ELSE jsonb_build_object(
            'id', ab.id, 'status', ab.status,
            'contados', (SELECT count(*) FROM beta_contagem_itens ci WHERE ci.contagem_id = ab.id AND ci.contado_em IS NOT NULL),
            'total', (SELECT count(*) FROM beta_contagem_itens ci WHERE ci.contagem_id = ab.id)) END
        ) AS z
        FROM (
          SELECT i.categoria,
                 count(*) AS itens,
                 coalesce((SELECT cc.ciclo_dias FROM contagem_ciclos cc WHERE cc.categoria = i.categoria), 7) AS ciclo,
                 greatest(
                   (SELECT max(bc.data) FROM beta_contagens bc WHERE bc.estoque_id = v_central AND bc.zona = i.categoria AND bc.status = 'concluida'),
                   (SELECT max(ce.data_contagem::date) FROM contagens_estoque ce WHERE ce.estoque_id = v_central AND ce.bloco = i.categoria AND ce.status IN ('finalizada', 'processada'))
                 ) AS ultima
          FROM itens_estoque i
          WHERE i.status = 'ativo' AND i.tipo_item = 'insumo' AND i.categoria IS NOT NULL
          GROUP BY i.categoria
        ) cat
        LEFT JOIN beta_contagens ab ON ab.estoque_id = v_central AND ab.zona = cat.categoria AND ab.data = v_hoje
      ) w
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION fn_beta_central_abrir(p_zona text, p_responsavel text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_central uuid;
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_c beta_contagens%ROWTYPE;
BEGIN
  SELECT id INTO v_central FROM estoques WHERE tipo = 'central' LIMIT 1;
  SELECT * INTO v_c FROM beta_contagens WHERE estoque_id = v_central AND zona = p_zona AND data = v_hoje;

  IF v_c.id IS NULL THEN
    INSERT INTO beta_contagens (estoque_id, zona, data, responsavel)
    VALUES (v_central, p_zona, v_hoje, p_responsavel) RETURNING * INTO v_c;

    INSERT INTO beta_contagem_itens (contagem_id, item_id, saldo_antes)
    SELECT v_c.id, i.id, coalesce(s.quantidade_atual, 0)
    FROM itens_estoque i
    LEFT JOIN saldos_estoque s ON s.item_id = i.id AND s.estoque_id = v_central
    WHERE i.status = 'ativo' AND i.tipo_item = 'insumo' AND i.categoria = p_zona;
  END IF;

  RETURN jsonb_build_object(
    'contagem', (SELECT to_jsonb(c) FROM beta_contagens c WHERE c.id = v_c.id),
    'itens', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'item_id', ci.item_id, 'nome', trim(i.nome), 'categoria', i.categoria, 'unidade', i.unidade_medida,
        'saldo_antes', ci.saldo_antes, 'fechados', ci.fechados, 'soltos', ci.soltos,
        'contado', ci.contado, 'contado_em', ci.contado_em,
        'rotulo_solto', coalesce(c.rotulo_solto, beta_rotulo_padrao(i.unidade_medida)),
        'rotulo_fechado', c.rotulo_fechado, 'fator_fechado', c.fator_fechado,
        'permite_fracao', coalesce(c.permite_fracao, false), 'foto_url', c.foto_url, 'dica', c.dica
      ) ORDER BY trim(i.nome)), '[]'::jsonb)
      FROM beta_contagem_itens ci
      JOIN itens_estoque i ON i.id = ci.item_id
      LEFT JOIN beta_item_config c ON c.item_id = ci.item_id
      WHERE ci.contagem_id = v_c.id
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION fn_beta_central_contar(p_contagem_id uuid, p_item_id uuid, p_fechados numeric, p_soltos numeric)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_fator numeric; v_contado numeric; v_status text; v_ok int;
BEGIN
  SELECT status INTO v_status FROM beta_contagens WHERE id = p_contagem_id;
  IF v_status IS DISTINCT FROM 'contando' THEN RAISE EXCEPTION 'Esta contagem já foi fechada'; END IF;
  SELECT coalesce(c.fator_fechado, 0) INTO v_fator FROM beta_item_config c WHERE c.item_id = p_item_id;
  v_contado := coalesce(p_fechados, 0) * coalesce(v_fator, 0) + coalesce(p_soltos, 0);
  UPDATE beta_contagem_itens SET fechados = p_fechados, soltos = p_soltos, contado = v_contado, contado_em = now()
  WHERE contagem_id = p_contagem_id AND item_id = p_item_id;
  GET DIAGNOSTICS v_ok = ROW_COUNT;
  IF v_ok = 0 THEN RAISE EXCEPTION 'Item não está nesta contagem'; END IF;
  RETURN jsonb_build_object('contado', v_contado);
END;
$$;

CREATE OR REPLACE FUNCTION fn_beta_central_concluir(p_contagem_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_c beta_contagens%ROWTYPE; v_it record; v_saldo numeric; v_dif numeric; v_custo numeric;
  v_ajustes int := 0; v_nao int := 0;
BEGIN
  SELECT * INTO v_c FROM beta_contagens WHERE id = p_contagem_id;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'Contagem não encontrada'; END IF;
  IF v_c.status = 'concluida' THEN RETURN jsonb_build_object('success', true, 'ja_concluida', true); END IF;

  FOR v_it IN
    SELECT ci.*, i.custo_medio FROM beta_contagem_itens ci JOIN itens_estoque i ON i.id = ci.item_id
    WHERE ci.contagem_id = p_contagem_id
  LOOP
    IF v_it.contado_em IS NULL THEN v_nao := v_nao + 1; CONTINUE; END IF;

    SELECT coalesce(quantidade_atual, 0) INTO v_saldo FROM saldos_estoque WHERE item_id = v_it.item_id AND estoque_id = v_c.estoque_id;
    v_saldo := coalesce(v_saldo, 0);
    v_dif := v_it.contado - v_saldo;
    v_custo := coalesce(v_it.custo_medio, 0);

    IF abs(v_dif) >= 0.001 THEN
      INSERT INTO movimentacoes_estoque
        (estoque_origem_id, estoque_destino_id, item_id, tipo_movimentacao, quantidade,
         custo_unitario, custo_total, data_movimentacao, motivo, origem_tipo, origem_id, idempotency_key)
      VALUES
        (CASE WHEN v_dif < 0 THEN v_c.estoque_id END, CASE WHEN v_dif > 0 THEN v_c.estoque_id END,
         v_it.item_id, CASE WHEN v_dif > 0 THEN 'entrada' ELSE 'saida' END,
         abs(v_dif), v_custo, abs(v_dif) * v_custo, v_c.data,
         'Contagem do Central por zona (beta)', 'beta', p_contagem_id,
         'beta_' || p_contagem_id || '_' || v_it.item_id || '_ajuste')
      ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
      v_ajustes := v_ajustes + 1;
    END IF;
  END LOOP;

  UPDATE beta_contagens SET status = 'concluida', concluido_em = now() WHERE id = p_contagem_id;
  RETURN jsonb_build_object('success', true, 'ajustes', v_ajustes, 'nao_contados', v_nao);
END;
$$;

-- Permissões
REVOKE ALL ON FUNCTION fn_beta_buscar_item(text, uuid) FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_receber_preparar(jsonb, jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_receber_concluir(jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_pedir_mais(uuid, uuid, numeric, text) FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_central_zonas() FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_central_abrir(text, text) FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_central_contar(uuid, uuid, numeric, numeric) FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_central_concluir(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION fn_beta_buscar_item(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_receber_preparar(jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_receber_concluir(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_pedir_mais(uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_central_zonas() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_central_abrir(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_central_contar(uuid, uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_central_concluir(uuid) TO authenticated;
