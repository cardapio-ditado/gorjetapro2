/*
  # Estoque Beta, parte 3: o beta vira o módulo inteiro

  Consultas e cadastros que faltavam para o beta não depender do módulo
  antigo: posição do estoque, extrato do item, ficha do item, lista e
  cadastro de itens, transferência entre quaisquer estoques, produção por
  ficha técnica e painel do dia. Tudo lê e grava as mesmas tabelas do
  módulo atual, então os dois sempre batem.
*/

-- ---------------------------------------------------------------------------
-- Rótulo em português da origem de um movimento
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION beta_origem_rotulo(p_origem text, p_tipo text, p_motivo text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_origem = 'compra' THEN 'Compra'
    WHEN p_origem = 'zig' THEN 'Venda ZIG'
    WHEN p_origem = 'contagem' THEN 'Contagem'
    WHEN p_origem = 'producao' AND p_tipo = 'entrada' THEN 'Produção (entrou)'
    WHEN p_origem = 'producao' THEN 'Produção (consumiu)'
    WHEN p_origem = 'requisicao' THEN 'Requisição'
    WHEN p_origem = 'zeragem' THEN 'Zeragem'
    WHEN p_origem = 'normalizacao' THEN 'Normalização'
    WHEN p_origem = 'manual' THEN 'Manual'
    WHEN p_origem = 'beta' AND p_motivo ILIKE 'Montagem%' THEN 'Montagem do balcão'
    WHEN p_origem = 'beta' AND p_motivo ILIKE 'Pedido extra%' THEN 'Pedido extra'
    WHEN p_origem = 'beta' AND p_motivo ILIKE 'Contagem%' THEN 'Contagem'
    WHEN p_origem = 'beta' AND p_motivo ILIKE 'Transfer%' THEN 'Transferência'
    WHEN p_origem = 'beta' THEN 'Beta'
    WHEN p_tipo = 'transferencia' THEN 'Transferência'
    WHEN p_tipo = 'ajuste' THEN 'Ajuste'
    ELSE coalesce(initcap(p_origem), initcap(p_tipo), 'Outro')
  END;
$$;

-- ---------------------------------------------------------------------------
-- Posição do estoque
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_beta_posicao(p_estoque_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_itens jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(x ORDER BY x->>'categoria', x->>'nome'), '[]'::jsonb) INTO v_itens
  FROM (
    SELECT jsonb_build_object(
      'item_id', i.id,
      'nome', trim(i.nome),
      'categoria', i.categoria,
      'unidade', i.unidade_medida,
      'rotulo_solto', coalesce(c.rotulo_solto, beta_rotulo_padrao(i.unidade_medida)),
      'foto_url', c.foto_url,
      'grupo_controle', i.grupo_controle,
      'status', i.status,
      'saldo', round(coalesce(s.saldo, 0)::numeric, 3),
      'custo_medio', round(coalesce(i.custo_medio, 0)::numeric, 4),
      'valor', round((coalesce(s.saldo, 0) * coalesce(i.custo_medio, 0))::numeric, 2),
      'nivel', n.nivel_reposicao,
      'ponto', coalesce(nullif(i.ponto_reposicao, 0), i.estoque_minimo),
      'negativo', coalesce(s.saldo, 0) < 0,
      'zerado', coalesce(s.saldo, 0) = 0,
      'abaixo_nivel', CASE WHEN n.nivel_reposicao IS NOT NULL THEN coalesce(s.saldo, 0) < n.nivel_reposicao
                           ELSE coalesce(s.saldo, 0) < coalesce(nullif(i.ponto_reposicao, 0), i.estoque_minimo, 0) END,
      'ultima_mov', s.ultima
    ) AS x
    FROM itens_estoque i
    LEFT JOIN LATERAL (
      SELECT sum(se.quantidade_atual) AS saldo, max(se.data_ultima_movimentacao) AS ultima
      FROM saldos_estoque se
      WHERE se.item_id = i.id AND (p_estoque_id IS NULL OR se.estoque_id = p_estoque_id)
    ) s ON true
    LEFT JOIN itens_estoque_niveis n ON n.item_id = i.id AND n.estoque_id = p_estoque_id
    LEFT JOIN beta_item_config c ON c.item_id = i.id
    WHERE i.status = 'ativo'
      AND (p_estoque_id IS NULL OR EXISTS (SELECT 1 FROM saldos_estoque se WHERE se.item_id = i.id AND se.estoque_id = p_estoque_id)
                                OR n.item_id IS NOT NULL)
  ) y;

  RETURN jsonb_build_object(
    'estoques', (SELECT jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'tipo', e.tipo) ORDER BY (e.tipo <> 'central'), e.nome)
                 FROM estoques e WHERE coalesce(e.status, true)),
    'itens', v_itens,
    'totais', (
      SELECT jsonb_build_object(
        'itens', count(*),
        'valor', round(coalesce(sum((x->>'valor')::numeric), 0), 2),
        'negativos', count(*) FILTER (WHERE (x->>'negativo')::boolean),
        'valor_negativo', round(coalesce(sum((x->>'valor')::numeric) FILTER (WHERE (x->>'negativo')::boolean), 0), 2),
        'zerados', count(*) FILTER (WHERE (x->>'zerado')::boolean),
        'abaixo_nivel', count(*) FILTER (WHERE (x->>'abaixo_nivel')::boolean)
      ) FROM jsonb_array_elements(v_itens) x
    )
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Extrato do item
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_beta_extrato(p_item_id uuid, p_estoque_id uuid DEFAULT NULL, p_inicio date DEFAULT NULL, p_fim date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inicio date := coalesce(p_inicio, (now() AT TIME ZONE 'America/Cuiaba')::date - 30);
  v_fim date := coalesce(p_fim, (now() AT TIME ZONE 'America/Cuiaba')::date);
  v_saldo_inicial numeric;
  v_movs jsonb;
  v_resumo jsonb;
BEGIN
  -- sinal do movimento do ponto de vista do estoque consultado (ou da casa toda)
  CREATE TEMP TABLE IF NOT EXISTS tmp_extrato (
    id uuid, data date, criado_em timestamptz, tipo text, origem text, motivo text, observacoes text,
    estoque_origem text, estoque_destino text, quantidade numeric, sinal int, custo_unitario numeric, custo_total numeric
  ) ON COMMIT DROP;
  DELETE FROM tmp_extrato;

  INSERT INTO tmp_extrato
  SELECT m.id, m.data_movimentacao, m.criado_em, m.tipo_movimentacao, m.origem_tipo, m.motivo, m.observacoes,
         eo.nome, ed.nome, m.quantidade,
         CASE
           WHEN p_estoque_id IS NULL THEN
             CASE WHEN m.tipo_movimentacao = 'transferencia' THEN 0
                  WHEN m.estoque_destino_id IS NOT NULL THEN 1
                  WHEN m.estoque_origem_id IS NOT NULL THEN -1 ELSE 0 END
           ELSE
             CASE WHEN m.estoque_destino_id = p_estoque_id THEN 1
                  WHEN m.estoque_origem_id = p_estoque_id THEN -1 ELSE 0 END
         END,
         m.custo_unitario, m.custo_total
  FROM movimentacoes_estoque m
  LEFT JOIN estoques eo ON eo.id = m.estoque_origem_id
  LEFT JOIN estoques ed ON ed.id = m.estoque_destino_id
  WHERE m.item_id = p_item_id
    AND (p_estoque_id IS NULL OR m.estoque_origem_id = p_estoque_id OR m.estoque_destino_id = p_estoque_id);

  SELECT coalesce(sum(quantidade * sinal), 0) INTO v_saldo_inicial FROM tmp_extrato WHERE data < v_inicio;

  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', t.id, 'data', t.data, 'criado_em', t.criado_em, 'tipo', t.tipo, 'origem', t.origem,
    'origem_rotulo', beta_origem_rotulo(t.origem, t.tipo, t.motivo),
    'motivo', t.motivo, 'observacoes', t.observacoes,
    'estoque_origem', t.estoque_origem, 'estoque_destino', t.estoque_destino,
    'quantidade', round(t.quantidade::numeric, 3), 'sinal', t.sinal,
    'saldo_apos', round((v_saldo_inicial + sum(t.quantidade * t.sinal) OVER (ORDER BY t.data, t.criado_em, t.id))::numeric, 3),
    'custo_unitario', round(coalesce(t.custo_unitario, 0)::numeric, 4),
    'custo_total', round(coalesce(t.custo_total, 0)::numeric, 2)
  ) ORDER BY t.data DESC, t.criado_em DESC), '[]'::jsonb) INTO v_movs
  FROM tmp_extrato t WHERE t.data BETWEEN v_inicio AND v_fim;

  SELECT jsonb_build_object(
    'compras', round(coalesce(sum(quantidade) FILTER (WHERE origem = 'compra' AND sinal = 1), 0)::numeric, 3),
    'vendas', round(coalesce(sum(quantidade) FILTER (WHERE origem = 'zig' AND sinal = -1), 0)::numeric, 3),
    'ajustes_mais', round(coalesce(sum(quantidade) FILTER (WHERE origem IN ('contagem', 'zeragem', 'normalizacao', 'manual') AND sinal = 1), 0)::numeric, 3)
                  + round(coalesce(sum(quantidade) FILTER (WHERE origem = 'beta' AND motivo ILIKE 'Contagem%' AND sinal = 1), 0)::numeric, 3),
    'ajustes_menos', round(coalesce(sum(quantidade) FILTER (WHERE origem IN ('contagem', 'zeragem', 'normalizacao', 'manual') AND sinal = -1), 0)::numeric, 3)
                   + round(coalesce(sum(quantidade) FILTER (WHERE origem = 'beta' AND motivo ILIKE 'Contagem%' AND sinal = -1), 0)::numeric, 3),
    'transferencias_entrada', round(coalesce(sum(quantidade) FILTER (WHERE tipo = 'transferencia' AND sinal = 1), 0)::numeric, 3),
    'transferencias_saida', round(coalesce(sum(quantidade) FILTER (WHERE tipo = 'transferencia' AND sinal = -1), 0)::numeric, 3),
    'producao_consumo', round(coalesce(sum(quantidade) FILTER (WHERE origem = 'producao' AND sinal = -1), 0)::numeric, 3),
    'producao_entrada', round(coalesce(sum(quantidade) FILTER (WHERE origem = 'producao' AND sinal = 1), 0)::numeric, 3),
    'movimentos', count(*)
  ) INTO v_resumo
  FROM tmp_extrato WHERE data BETWEEN v_inicio AND v_fim;

  RETURN jsonb_build_object(
    'item', (SELECT jsonb_build_object('id', i.id, 'nome', trim(i.nome), 'categoria', i.categoria, 'unidade', i.unidade_medida,
                                       'rotulo_solto', coalesce(c.rotulo_solto, beta_rotulo_padrao(i.unidade_medida)), 'foto_url', c.foto_url,
                                       'custo_medio', round(coalesce(i.custo_medio, 0)::numeric, 4))
             FROM itens_estoque i LEFT JOIN beta_item_config c ON c.item_id = i.id WHERE i.id = p_item_id),
    'estoque', (SELECT jsonb_build_object('id', e.id, 'nome', e.nome) FROM estoques e WHERE e.id = p_estoque_id),
    'inicio', v_inicio, 'fim', v_fim,
    'saldo_inicial', round(v_saldo_inicial::numeric, 3),
    'saldo_final', round((v_saldo_inicial + coalesce((SELECT sum(quantidade * sinal) FROM tmp_extrato WHERE data BETWEEN v_inicio AND v_fim), 0))::numeric, 3),
    'movimentos', v_movs,
    'resumo', v_resumo
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Ficha do item
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_beta_ficha_item(p_item_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'item', jsonb_build_object(
        'id', i.id, 'nome', trim(i.nome), 'codigo', i.codigo, 'categoria', i.categoria, 'unidade', i.unidade_medida,
        'tipo_item', i.tipo_item, 'status', i.status, 'custo_medio', round(coalesce(i.custo_medio, 0)::numeric, 4),
        'ponto_reposicao', i.ponto_reposicao, 'estoque_minimo', i.estoque_minimo,
        'classe_compra', i.classe_compra, 'grupo_controle', i.grupo_controle, 'entra_no_cmv', i.entra_no_cmv,
        'tem_ficha', EXISTS (SELECT 1 FROM ficha_ingredientes fi WHERE fi.item_estoque_id = i.id),
        'produzido_por_ficha', EXISTS (SELECT 1 FROM fichas_tecnicas f WHERE f.item_produzido_id = i.id)
      ),
      'config', jsonb_build_object(
        'rotulo_solto', coalesce(c.rotulo_solto, beta_rotulo_padrao(i.unidade_medida)),
        'rotulo_fechado', c.rotulo_fechado, 'fator_fechado', c.fator_fechado,
        'permite_fracao', coalesce(c.permite_fracao, false), 'foto_url', c.foto_url, 'dica', c.dica
      ),
      'saldos', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('estoque_id', e.id, 'nome', e.nome, 'tipo', e.tipo,
                 'saldo', round(coalesce(s.quantidade_atual, 0)::numeric, 3),
                 'valor', round((coalesce(s.quantidade_atual, 0) * coalesce(i.custo_medio, 0))::numeric, 2))
               ORDER BY (e.tipo <> 'central'), e.nome), '[]'::jsonb)
        FROM estoques e LEFT JOIN saldos_estoque s ON s.estoque_id = e.id AND s.item_id = i.id
        WHERE coalesce(e.status, true)
      ),
      'niveis', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('estoque_id', e.id, 'nome', e.nome, 'nivel', n.nivel_reposicao, 'controle', n.controle) ORDER BY e.nome), '[]'::jsonb)
        FROM itens_estoque_niveis n JOIN estoques e ON e.id = n.estoque_id WHERE n.item_id = i.id
      ),
      'compras', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('data', ec.data_compra, 'fornecedor', f.nome, 'documento', ec.numero_documento,
                 'quantidade', round(coalesce(iec.quantidade_recebida, iec.quantidade)::numeric, 3),
                 'custo_unitario', round(coalesce(iec.custo_unitario, 0)::numeric, 4)) ORDER BY ec.data_compra DESC, ec.criado_em DESC), '[]'::jsonb)
        FROM (SELECT iec.* FROM itens_entrada_compra iec JOIN entradas_compras ec ON ec.id = iec.entrada_compra_id
              WHERE iec.item_id = i.id AND ec.status = 'recebido' ORDER BY ec.data_compra DESC, ec.criado_em DESC LIMIT 10) iec
        JOIN entradas_compras ec ON ec.id = iec.entrada_compra_id
        LEFT JOIN fornecedores f ON f.id = ec.fornecedor_id
      ),
      'consumo_dia', round(coalesce((SELECT sum(m.quantidade) / 30.0 FROM movimentacoes_estoque m
                                     WHERE m.item_id = i.id AND m.origem_tipo = 'zig' AND m.tipo_movimentacao = 'saida'
                                       AND m.data_movimentacao >= current_date - 30), 0)::numeric, 2),
      'fichas_que_usam', (
        SELECT coalesce(jsonb_agg(jsonb_build_object('ficha_id', f.id, 'nome', f.nome, 'quantidade', fi.quantidade, 'unidade', fi.unidade_medida) ORDER BY f.nome), '[]'::jsonb)
        FROM ficha_ingredientes fi JOIN fichas_tecnicas f ON f.id = fi.ficha_id WHERE fi.item_estoque_id = i.id AND coalesce(f.ativo, true)
      ),
      'ultima_contagem', (
        SELECT max(m.data_movimentacao) FROM movimentacoes_estoque m
        WHERE m.item_id = i.id AND (m.origem_tipo = 'contagem' OR (m.origem_tipo = 'beta' AND m.motivo ILIKE 'Contagem%'))
      ),
      'ultimo_movimento', (SELECT max(m.data_movimentacao) FROM movimentacoes_estoque m WHERE m.item_id = i.id)
    )
    FROM itens_estoque i LEFT JOIN beta_item_config c ON c.item_id = i.id
    WHERE i.id = p_item_id
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Itens: lista, cadastro, status, categorias
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_beta_itens_listar(p_status text DEFAULT 'ativo', p_termo text DEFAULT NULL, p_categoria text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE v_termo text := unaccent(lower(trim(coalesce(p_termo, ''))));
BEGIN
  RETURN coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'item_id', i.id, 'nome', trim(i.nome), 'codigo', i.codigo, 'categoria', i.categoria, 'unidade', i.unidade_medida,
      'tipo_item', i.tipo_item, 'status', i.status, 'grupo_controle', i.grupo_controle, 'classe_compra', i.classe_compra,
      'custo_medio', round(coalesce(i.custo_medio, 0)::numeric, 4),
      'saldo_total', round(coalesce((SELECT sum(s.quantidade_atual) FROM saldos_estoque s WHERE s.item_id = i.id), 0)::numeric, 3),
      'rotulo_solto', coalesce(c.rotulo_solto, beta_rotulo_padrao(i.unidade_medida)),
      'foto_url', c.foto_url
    ) ORDER BY i.categoria, trim(i.nome))
    FROM itens_estoque i LEFT JOIN beta_item_config c ON c.item_id = i.id
    WHERE (p_status IS NULL OR p_status = 'todos' OR i.status = p_status)
      AND (p_categoria IS NULL OR p_categoria = '' OR i.categoria = p_categoria)
      AND (v_termo = '' OR unaccent(lower(i.nome)) LIKE '%' || v_termo || '%' OR lower(coalesce(i.codigo, '')) LIKE '%' || v_termo || '%')
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION fn_beta_categorias()
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object('categoria', categoria, 'itens', n) ORDER BY categoria), '[]'::jsonb)
  FROM (SELECT categoria, count(*) AS n FROM itens_estoque WHERE status = 'ativo' GROUP BY categoria) x;
$$;

CREATE OR REPLACE FUNCTION fn_beta_item_salvar(p_item jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid := nullif(p_item->>'id', '')::uuid;
  v_nome text := trim(coalesce(p_item->>'nome', ''));
  v_categoria text := coalesce(nullif(trim(p_item->>'categoria'), ''), 'Geral');
  v_unidade text := coalesce(nullif(trim(p_item->>'unidade_medida'), ''), 'unidade');
  v_tipo text := coalesce(nullif(p_item->>'tipo_item', ''), 'insumo');
  v_ponto numeric := greatest(0, coalesce(nullif(p_item->>'ponto_reposicao', '')::numeric, 0));
  v_minimo numeric := greatest(0, coalesce(nullif(p_item->>'estoque_minimo', '')::numeric, 0));
  v_classe text := nullif(p_item->>'classe_compra', '');
  v_grupo text := nullif(p_item->>'grupo_controle', '');
  v_codigo text := nullif(trim(coalesce(p_item->>'codigo', '')), '');
  v_cmv boolean := coalesce((p_item->>'entra_no_cmv')::boolean, true);
BEGIN
  IF v_nome = '' THEN RAISE EXCEPTION 'O item precisa de um nome'; END IF;
  IF v_tipo NOT IN ('insumo', 'produto_final') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
  IF v_classe IS NOT NULL AND v_classe NOT IN ('rua', 'pedido', 'sob_demanda') THEN RAISE EXCEPTION 'Classe de compra inválida'; END IF;
  IF v_grupo IS NOT NULL AND v_grupo NOT IN ('vende', 'conta', 'gasta') THEN RAISE EXCEPTION 'Grupo de controle inválido'; END IF;

  IF EXISTS (SELECT 1 FROM itens_estoque i WHERE lower(trim(i.nome)) = lower(v_nome) AND i.status = 'ativo' AND (v_id IS NULL OR i.id <> v_id)) THEN
    RAISE EXCEPTION 'Já existe um item ativo com o nome "%"', v_nome;
  END IF;

  IF v_id IS NULL THEN
    INSERT INTO itens_estoque (nome, categoria, unidade_medida, tipo_item, ponto_reposicao, estoque_minimo, classe_compra, grupo_controle, codigo, entra_no_cmv, status)
    VALUES (v_nome, v_categoria, v_unidade, v_tipo, v_ponto, v_minimo, v_classe, v_grupo, v_codigo, v_cmv, 'ativo')
    RETURNING id INTO v_id;
  ELSE
    UPDATE itens_estoque SET
      nome = v_nome, categoria = v_categoria, unidade_medida = v_unidade, tipo_item = v_tipo,
      ponto_reposicao = v_ponto, estoque_minimo = v_minimo, classe_compra = v_classe, grupo_controle = v_grupo,
      codigo = v_codigo, entra_no_cmv = v_cmv, atualizado_em = now()
    WHERE id = v_id;
  END IF;

  RETURN jsonb_build_object('item_id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION fn_beta_item_status(p_item_id uuid, p_status text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_status NOT IN ('ativo', 'inativo') THEN RAISE EXCEPTION 'Status inválido'; END IF;
  UPDATE itens_estoque SET status = p_status, atualizado_em = now() WHERE id = p_item_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Transferência entre quaisquer estoques
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_beta_transferir(p_origem uuid, p_destino uuid, p_itens jsonb, p_responsavel text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_it jsonb; v_custo numeric; v_n int := 0; v_lote uuid := gen_random_uuid();
BEGIN
  IF p_origem IS NULL OR p_destino IS NULL OR p_origem = p_destino THEN RAISE EXCEPTION 'Origem e destino precisam ser estoques diferentes'; END IF;
  FOR v_it IN SELECT * FROM jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) LOOP
    IF nullif(v_it->>'item_id', '') IS NULL OR coalesce((v_it->>'quantidade')::numeric, 0) <= 0 THEN CONTINUE; END IF;
    SELECT coalesce(custo_medio, 0) INTO v_custo FROM itens_estoque WHERE id = (v_it->>'item_id')::uuid;
    INSERT INTO movimentacoes_estoque
      (estoque_origem_id, estoque_destino_id, item_id, tipo_movimentacao, quantidade, custo_unitario, custo_total,
       data_movimentacao, motivo, observacoes, origem_tipo, origem_id, idempotency_key)
    VALUES
      (p_origem, p_destino, (v_it->>'item_id')::uuid, 'transferencia', (v_it->>'quantidade')::numeric, v_custo,
       (v_it->>'quantidade')::numeric * v_custo, (now() AT TIME ZONE 'America/Cuiaba')::date,
       'Transferência (beta)', coalesce('Por ' || p_responsavel, NULL), 'beta', v_lote,
       'beta_transf_' || v_lote || '_' || (v_it->>'item_id'));
    v_n := v_n + 1;
  END LOOP;
  IF v_n = 0 THEN RAISE EXCEPTION 'Nenhum item com quantidade para transferir'; END IF;
  RETURN jsonb_build_object('success', true, 'itens', v_n, 'lote', v_lote);
END;
$$;

-- ---------------------------------------------------------------------------
-- Produção por ficha técnica
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_beta_fichas_producao()
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'ficha_id', f.id, 'nome', f.nome, 'categoria', f.categoria,
    'rendimento', f.rendimento, 'unidade_rendimento', f.unidade_rendimento,
    'item_produzido_id', f.item_produzido_id, 'item_nome', trim(ip.nome),
    'custo_total', round(coalesce(f.custo_total, 0)::numeric, 2),
    'ingredientes', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'item_id', coalesce(fi.item_estoque_id, sf.item_produzido_id),
        'nome', trim(coalesce(ii.nome, si.nome)),
        'quantidade', fi.quantidade, 'unidade', fi.unidade_medida,
        'baixa', coalesce(fi.baixa_estoque, true),
        'saldos', (SELECT coalesce(jsonb_object_agg(s.estoque_id, round(s.quantidade_atual::numeric, 3)), '{}'::jsonb)
                   FROM saldos_estoque s WHERE s.item_id = coalesce(fi.item_estoque_id, sf.item_produzido_id))
      ) ORDER BY fi.ordem, fi.id), '[]'::jsonb)
      FROM ficha_ingredientes fi
      LEFT JOIN fichas_tecnicas sf ON sf.id = fi.ficha_tecnica_ingrediente_id
      LEFT JOIN itens_estoque ii ON ii.id = fi.item_estoque_id
      LEFT JOIN itens_estoque si ON si.id = sf.item_produzido_id
      WHERE fi.ficha_id = f.id
    )
  ) ORDER BY f.nome), '[]'::jsonb)
  FROM fichas_tecnicas f JOIN itens_estoque ip ON ip.id = f.item_produzido_id
  WHERE coalesce(f.ativo, true) AND f.item_produzido_id IS NOT NULL;
$$;

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
    INSERT INTO producao_reserva_insumos (producao_id, item_id, quantidade_reservada, estoque_origem_id, status_reserva, data_reserva)
    VALUES (v_prod, v_ing.item_id, v_ing.quantidade * p_quantidade, p_origem_insumos, 'reservado', now());
    v_n := v_n + 1;
  END LOOP;

  v_res := processar_producao(v_prod, p_quantidade, p_quantidade, auth.uid(), 'Produzido pelo Estoque Beta');
  IF coalesce((v_res->>'success')::boolean, false) = false THEN
    RAISE EXCEPTION '%', coalesce(v_res->>'error', 'Falha ao processar a produção');
  END IF;
  RETURN v_res || jsonb_build_object('insumos', v_n);
END;
$$;

-- ---------------------------------------------------------------------------
-- Painel do dia
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_beta_painel_dia()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date; v_central uuid; v_zonas jsonb;
BEGIN
  SELECT id INTO v_central FROM estoques WHERE tipo = 'central' LIMIT 1;
  v_zonas := fn_beta_central_zonas()->'zonas';
  RETURN jsonb_build_object(
    'hoje', v_hoje,
    'valor_parado', (SELECT round(coalesce(sum(s.quantidade_atual * coalesce(i.custo_medio, 0)) FILTER (WHERE s.quantidade_atual > 0), 0)::numeric, 2)
                     FROM saldos_estoque s JOIN itens_estoque i ON i.id = s.item_id WHERE i.status = 'ativo'),
    'itens_negativos', (SELECT count(*) FROM saldos_estoque s JOIN itens_estoque i ON i.id = s.item_id WHERE i.status = 'ativo' AND s.quantidade_atual < 0),
    'valor_negativo', (SELECT round(coalesce(sum(s.quantidade_atual * coalesce(i.custo_medio, 0)), 0)::numeric, 2)
                       FROM saldos_estoque s JOIN itens_estoque i ON i.id = s.item_id WHERE i.status = 'ativo' AND s.quantidade_atual < 0),
    'zonas_vencidas', (SELECT count(*) FROM jsonb_array_elements(v_zonas) z WHERE z->>'situacao' IN ('atrasada', 'vence_hoje')),
    'zonas_total', jsonb_array_length(v_zonas),
    'balcoes', (SELECT coalesce(jsonb_agg(jsonb_build_object('nome', e.nome, 'status', m.status) ORDER BY e.nome), '[]'::jsonb)
                FROM estoques e LEFT JOIN beta_montagens m ON m.estoque_id = e.id AND m.data = v_hoje
                WHERE e.tipo <> 'central' AND EXISTS (SELECT 1 FROM itens_estoque_niveis n WHERE n.estoque_id = e.id)),
    'compras_semana', (SELECT round(coalesce(sum(valor_total), 0)::numeric, 2) FROM entradas_compras WHERE status = 'recebido' AND data_compra >= v_hoje - 6),
    'compras_hoje', (SELECT count(*) FROM entradas_compras WHERE status = 'recebido' AND data_compra = v_hoje),
    'vendas_hoje_itens', (SELECT count(DISTINCT item_id) FROM movimentacoes_estoque WHERE origem_tipo = 'zig' AND data_movimentacao = v_hoje),
    'movimentos_hoje', (SELECT count(*) FROM movimentacoes_estoque WHERE data_movimentacao = v_hoje),
    'itens_parados_60d', (SELECT count(*) FROM itens_estoque i WHERE i.status = 'ativo' AND i.tipo_item = 'insumo'
                          AND NOT EXISTS (SELECT 1 FROM movimentacoes_estoque m WHERE m.item_id = i.id AND m.data_movimentacao >= v_hoje - 60)),
    'listas_abertas', (SELECT count(*) FROM listas_compra WHERE status = 'aberta')
  );
END;
$$;

-- Permissões
REVOKE ALL ON FUNCTION fn_beta_posicao(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_extrato(uuid, uuid, date, date) FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_ficha_item(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_itens_listar(text, text, text) FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_categorias() FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_item_salvar(jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_item_status(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_transferir(uuid, uuid, jsonb, text) FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_fichas_producao() FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_produzir(uuid, numeric, uuid, uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_painel_dia() FROM public, anon;
GRANT EXECUTE ON FUNCTION fn_beta_posicao(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_extrato(uuid, uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_ficha_item(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_itens_listar(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_categorias() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_item_salvar(jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_item_status(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_transferir(uuid, uuid, jsonb, text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_fichas_producao() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_produzir(uuid, numeric, uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_painel_dia() TO authenticated;
