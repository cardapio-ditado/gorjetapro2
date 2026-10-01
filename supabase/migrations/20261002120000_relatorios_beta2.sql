-- Relatórios do Estoque Beta 2.
--
-- Treze relatórios só de leitura, todos devolvendo o mesmo desenho:
--   { titulo, subtitulo, kpis:[{rotulo, valor, formato, detalhe, tom}],   (detalhe aceita {brl:1234.5})
--     colunas:[{k, r, t}], grupos:[{titulo, n, valor, colunas?, linhas:[...]}], avisos:[] }
-- A tela monta qualquer um deles do mesmo jeito (cartões, grupos, exportar).
-- t das colunas: texto | int | num | brl | pct | data | datahora.
-- Entrada p (jsonb): de, ate (datas), estoque_id, item_id, fornecedor_id, dias.
-- Porta única: fn_relatorio(p_tipo, p).

-- ── apoio ───────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_rel_periodo(p jsonb, OUT de date, OUT ate date)
LANGUAGE plpgsql STABLE AS $$
BEGIN
  de := coalesce(nullif(p->>'de','')::date, current_date - 30);
  ate := coalesce(nullif(p->>'ate','')::date, current_date);
  IF ate < de THEN ate := de; END IF;
END $$;

CREATE OR REPLACE FUNCTION fn_rel_kpi(p_rotulo text, p_valor anyelement, p_formato text, p_detalhe text DEFAULT NULL, p_tom text DEFAULT 'normal')
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT jsonb_build_object('rotulo', p_rotulo, 'valor', to_jsonb(p_valor), 'formato', p_formato, 'detalhe', p_detalhe, 'tom', p_tom);
$$;

CREATE OR REPLACE FUNCTION fn_rel_col(k text, r text, t text DEFAULT 'texto')
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object('k', k, 'r', r, 't', t); $$;

CREATE OR REPLACE FUNCTION fn_rel_bloco(p_bloco text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_bloco WHEN '__diaria' THEN 'diária' WHEN '__auditoria' THEN 'auditoria' WHEN '__zerados' THEN 'zerados' ELSE coalesce(p_bloco, 'geral') END;
$$;

-- ── 1 · Inventário (posição atual) ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_rel_inventario(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_est uuid := nullif(p->>'estoque_id','')::uuid; v_grupos jsonb; v_kpis jsonb; v_nome text;
BEGIN
  SELECT nome INTO v_nome FROM estoques WHERE id = v_est;
  WITH l AS (
    SELECT e.nome estoque, coalesce(nullif(trim(i.categoria),''),'Sem categoria') categoria, i.nome item, i.unidade_medida um,
           s.quantidade_atual qtd, coalesce(s.custo_medio, i.custo_medio, 0) custo,
           s.quantidade_atual * coalesce(s.custo_medio, i.custo_medio, 0) valor, s.data_ultima_movimentacao ultima
    FROM saldos_estoque s
    JOIN estoques e ON e.id = s.estoque_id AND e.status
    JOIN itens_estoque i ON i.id = s.item_id AND i.status = 'ativo'
    WHERE s.quantidade_atual <> 0 AND (v_est IS NULL OR s.estoque_id = v_est)
  )
  SELECT jsonb_agg(jsonb_build_object('titulo', titulo, 'n', n, 'valor', valor, 'linhas', linhas) ORDER BY valor DESC, titulo),
         jsonb_build_array(
           fn_rel_kpi('valor em estoque', round(sum(CASE WHEN valor > 0 THEN valor ELSE 0 END), 2), 'brl', sum(n) || ' itens com saldo', 'destaque'),
           fn_rel_kpi('estoques', count(*), 'int', 'com algum saldo'),
           fn_rel_kpi('saldos negativos', sum(neg), 'int', CASE WHEN sum(neg) > 0 THEN 'precisam de contagem' ELSE 'nenhum' END, CASE WHEN sum(neg) > 0 THEN 'alerta' ELSE 'certo' END),
           fn_rel_kpi('valor negativo', round(sum(valor_neg), 2), 'brl', 'fora do valor em estoque', CASE WHEN sum(valor_neg) < 0 THEN 'alerta' ELSE 'normal' END))
  INTO v_grupos, v_kpis
  FROM (
    SELECT CASE WHEN v_est IS NULL THEN estoque ELSE categoria END titulo, count(*) n,
           round(sum(CASE WHEN valor > 0 THEN valor ELSE 0 END), 2) valor,
           count(*) FILTER (WHERE qtd < 0) neg, sum(CASE WHEN valor < 0 THEN valor ELSE 0 END) valor_neg,
           jsonb_agg(jsonb_build_object('categoria', categoria, 'item', item, 'um', um, 'qtd', qtd, 'custo', round(custo, 4), 'valor', round(valor, 2), 'ultima', ultima) ORDER BY categoria, item) linhas
    FROM l GROUP BY 1
  ) g;
  RETURN jsonb_build_object(
    'titulo', 'Inventário', 'subtitulo', coalesce('Posição de hoje em ' || v_nome, 'Posição de hoje, por estoque'),
    'kpis', coalesce(v_kpis, '[]'), 'grupos', coalesce(v_grupos, '[]'), 'avisos', '[]'::jsonb,
    'colunas', jsonb_build_array(fn_rel_col('item','Item'), fn_rel_col('categoria','Categoria'), fn_rel_col('um','Un'), fn_rel_col('qtd','Saldo','num'), fn_rel_col('custo','Custo médio','brl'), fn_rel_col('valor','Valor','brl'), fn_rel_col('ultima','Última mov.','data')));
END $$;

-- ── 2 · Compras por período ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_rel_compras(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_de date; v_ate date; v_forn uuid := nullif(p->>'fornecedor_id','')::uuid; v_grupos jsonb; v_kpis jsonb;
BEGIN
  SELECT * INTO v_de, v_ate FROM fn_rel_periodo(p);
  WITH l AS (
    SELECT ec.id nota_id, coalesce(f.nome, 'Sem fornecedor') fornecedor, ec.data_compra, ec.numero_documento documento, i.nome item, i.unidade_medida um,
           coalesce(ie.quantidade_recebida, ie.quantidade) qtd, coalesce(ie.custo_unitario_final, ie.custo_unitario) custo, coalesce(ie.custo_total, 0) total
    FROM entradas_compras ec
    JOIN itens_entrada_compra ie ON ie.entrada_compra_id = ec.id
    JOIN itens_estoque i ON i.id = ie.item_id
    LEFT JOIN fornecedores f ON f.id = ec.fornecedor_id
    WHERE ec.status = 'recebido' AND ec.data_compra BETWEEN v_de AND v_ate AND (v_forn IS NULL OR ec.fornecedor_id = v_forn)
  )
  SELECT jsonb_agg(jsonb_build_object('titulo', fornecedor, 'n', n, 'valor', valor, 'linhas', linhas) ORDER BY valor DESC),
         jsonb_build_array(
           fn_rel_kpi('comprado no período', round(sum(valor), 2), 'brl', sum(notas) || ' notas', 'destaque'),
           fn_rel_kpi('fornecedores', count(*), 'int', 'com nota no período'),
           fn_rel_kpi('linhas de compra', sum(n), 'int', 'itens recebidos'),
           fn_rel_kpi('maior fornecedor', (array_agg(fornecedor ORDER BY valor DESC))[1], 'texto', (array_agg(pct ORDER BY valor DESC))[1] || '% do total · {brl:' || (array_agg(valor ORDER BY valor DESC))[1] || '}'))
  INTO v_grupos, v_kpis
  FROM (
    SELECT g0.*, round(valor * 100 / nullif(sum(valor) OVER (), 0)) pct FROM (
      SELECT fornecedor, count(*) n, count(DISTINCT nota_id) notas, round(sum(total), 2) valor,
             jsonb_agg(jsonb_build_object('data', data_compra, 'documento', documento, 'item', item, 'um', um, 'qtd', qtd, 'custo', round(custo, 4), 'total', round(total, 2)) ORDER BY data_compra DESC, item) linhas
      FROM l GROUP BY fornecedor
    ) g0
  ) g;
  RETURN jsonb_build_object(
    'titulo', 'Compras', 'subtitulo', 'Notas recebidas de ' || to_char(v_de, 'DD/MM') || ' a ' || to_char(v_ate, 'DD/MM/YYYY') || ', por fornecedor',
    'kpis', coalesce(v_kpis, '[]'), 'grupos', coalesce(v_grupos, '[]'), 'avisos', '[]'::jsonb,
    'colunas', jsonb_build_array(fn_rel_col('data','Data','data'), fn_rel_col('documento','Nota'), fn_rel_col('item','Item'), fn_rel_col('um','Un'), fn_rel_col('qtd','Qtd','num'), fn_rel_col('custo','Unitário','brl'), fn_rel_col('total','Total','brl')));
END $$;

-- ── 3 · Kardex por fornecedor (preços) ─────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_rel_kardex_fornecedor(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_de date; v_ate date; v_forn uuid := nullif(p->>'fornecedor_id','')::uuid; v_grupos jsonb; v_kpis jsonb;
BEGIN
  SELECT * INTO v_de, v_ate FROM fn_rel_periodo(p);
  WITH l AS (
    SELECT coalesce(f.nome, 'Sem fornecedor') fornecedor, i.nome item, i.unidade_medida um, ec.data_compra,
           coalesce(ie.quantidade_recebida, ie.quantidade) qtd, coalesce(ie.custo_unitario_final, ie.custo_unitario, 0) custo, coalesce(ie.custo_total, 0) total, ec.id nota_id
    FROM entradas_compras ec
    JOIN itens_entrada_compra ie ON ie.entrada_compra_id = ec.id
    JOIN itens_estoque i ON i.id = ie.item_id
    LEFT JOIN fornecedores f ON f.id = ec.fornecedor_id
    WHERE ec.status = 'recebido' AND ec.data_compra BETWEEN v_de AND v_ate AND (v_forn IS NULL OR ec.fornecedor_id = v_forn)
  ), por_item AS (
    SELECT fornecedor, item, um, count(DISTINCT nota_id) compras, sum(qtd) qtd, sum(total) valor,
           CASE WHEN sum(qtd) > 0 THEN sum(total) / sum(qtd) ELSE NULL END preco_medio,
           (array_agg(custo ORDER BY data_compra DESC))[1] ultimo_preco,
           (array_agg(custo ORDER BY data_compra ASC))[1] primeiro_preco,
           max(data_compra) ultima
    FROM l GROUP BY fornecedor, item, um
  )
  SELECT jsonb_agg(jsonb_build_object('titulo', fornecedor, 'n', n, 'valor', valor, 'linhas', linhas) ORDER BY valor DESC),
         jsonb_build_array(
           fn_rel_kpi('comprado no período', round(sum(valor), 2), 'brl', count(*) || ' fornecedores', 'destaque'),
           fn_rel_kpi('itens comprados', sum(n), 'int', 'por fornecedor'),
           fn_rel_kpi('itens que subiram', sum(subiu), 'int', 'mais de 10% entre a primeira e a última compra', CASE WHEN sum(subiu) > 0 THEN 'atencao' ELSE 'certo' END),
           fn_rel_kpi('itens que baixaram', sum(baixou), 'int', 'mais de 10%', CASE WHEN sum(baixou) > 0 THEN 'certo' ELSE 'normal' END))
  INTO v_grupos, v_kpis
  FROM (
    SELECT fornecedor, count(*) n, round(sum(valor), 2) valor,
           count(*) FILTER (WHERE primeiro_preco > 0 AND ultimo_preco / primeiro_preco > 1.10) subiu,
           count(*) FILTER (WHERE primeiro_preco > 0 AND ultimo_preco / primeiro_preco < 0.90) baixou,
           jsonb_agg(jsonb_build_object('item', item, 'um', um, 'compras', compras, 'qtd', qtd, 'valor', round(valor, 2), 'preco_medio', round(preco_medio, 4), 'ultimo_preco', round(ultimo_preco, 4),
             'variacao', CASE WHEN primeiro_preco > 0 THEN round((ultimo_preco - primeiro_preco) * 100 / primeiro_preco, 1) END, 'ultima', ultima) ORDER BY valor DESC) linhas
    FROM por_item GROUP BY fornecedor
  ) g;
  RETURN jsonb_build_object(
    'titulo', 'Kardex por fornecedor', 'subtitulo', 'O que cada fornecedor vendeu de ' || to_char(v_de, 'DD/MM') || ' a ' || to_char(v_ate, 'DD/MM/YYYY') || ' e como o preço andou',
    'kpis', coalesce(v_kpis, '[]'), 'grupos', coalesce(v_grupos, '[]'), 'avisos', '[]'::jsonb,
    'colunas', jsonb_build_array(fn_rel_col('item','Item'), fn_rel_col('um','Un'), fn_rel_col('compras','Notas','int'), fn_rel_col('qtd','Qtd','num'), fn_rel_col('valor','Total','brl'), fn_rel_col('preco_medio','Preço médio','brl'), fn_rel_col('ultimo_preco','Último preço','brl'), fn_rel_col('variacao','Variação','pct'), fn_rel_col('ultima','Última compra','data')));
END $$;

-- ── 4 · Kardex por produto (extrato com saldo) ─────────────────────────────
CREATE OR REPLACE FUNCTION fn_rel_kardex_produto(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_de date; v_ate date; v_item uuid := nullif(p->>'item_id','')::uuid; v_est uuid := nullif(p->>'estoque_id','')::uuid;
        v_nome text; v_um text; v_est_nome text; v_anterior numeric; v_grupos jsonb; v_kpis jsonb; v_saldos jsonb; v_entradas numeric; v_saidas numeric;
BEGIN
  IF v_item IS NULL THEN
    RETURN jsonb_build_object('titulo', 'Kardex por produto', 'subtitulo', 'Escolha um item', 'kpis', '[]'::jsonb, 'grupos', '[]'::jsonb, 'colunas', '[]'::jsonb, 'avisos', '[]'::jsonb);
  END IF;
  SELECT * INTO v_de, v_ate FROM fn_rel_periodo(p);
  SELECT nome, unidade_medida INTO v_nome, v_um FROM itens_estoque WHERE id = v_item;
  SELECT nome INTO v_est_nome FROM estoques WHERE id = v_est;
  -- Mesma regra de fn_saldo_por_movimentacoes: entra pelo destino, sai pela origem.
  -- Sem estoque escolhido, os dois lados contam e a transferência fica neutra.
  -- O saldo acumula desde a primeira movimentação; o período só recorta o que aparece.
  WITH kx AS (
    SELECT m.data_movimentacao data, m.criado_em, m.id, m.tipo_movimentacao tipo, coalesce(m.origem_tipo, 'manual') origem, eo.nome de_nome, ed.nome para_nome,
           (CASE WHEN m.tipo_movimentacao IN ('entrada','transferencia','ajuste') AND m.estoque_destino_id IS NOT NULL AND (v_est IS NULL OR m.estoque_destino_id = v_est) THEN m.quantidade ELSE 0 END)
         - (CASE WHEN m.tipo_movimentacao IN ('saida','transferencia','ajuste') AND m.estoque_origem_id IS NOT NULL AND (v_est IS NULL OR m.estoque_origem_id = v_est) THEN m.quantidade ELSE 0 END) delta,
           m.custo_unitario, m.custo_total, coalesce(m.motivo, m.observacoes) motivo, u.nome_completo quem
    FROM movimentacoes_estoque m
    LEFT JOIN estoques eo ON eo.id = m.estoque_origem_id
    LEFT JOIN estoques ed ON ed.id = m.estoque_destino_id
    LEFT JOIN usuarios_sistema u ON u.id = m.criado_por
    WHERE m.item_id = v_item AND (v_est IS NULL OR m.estoque_origem_id = v_est OR m.estoque_destino_id = v_est)
  ), tot AS (
    SELECT coalesce(sum(delta) FILTER (WHERE data < v_de), 0) anterior,
           coalesce(sum(delta) FILTER (WHERE data BETWEEN v_de AND v_ate AND delta > 0), 0) entradas,
           coalesce(-sum(delta) FILTER (WHERE data BETWEEN v_de AND v_ate AND delta < 0), 0) saidas
    FROM kx
  ), corrido AS (
    SELECT kx.*, (SELECT anterior FROM tot) + sum(delta) OVER (ORDER BY data, criado_em, id ROWS UNBOUNDED PRECEDING) saldo
    FROM kx WHERE data >= v_de
  )
  SELECT (SELECT anterior FROM tot), (SELECT entradas FROM tot), (SELECT saidas FROM tot),
         (SELECT jsonb_agg(jsonb_build_object('titulo', mes, 'n', n, 'linhas', linhas) ORDER BY ini)
          FROM (
            SELECT to_char(data, 'MM/YYYY') mes, min(data) ini, count(*) n,
                   jsonb_agg(jsonb_build_object('data', data, 'tipo', tipo, 'origem', origem, 'de', de_nome, 'para', para_nome, 'qtd', delta, 'custo', round(custo_unitario, 4), 'total', round(custo_total, 2), 'saldo', saldo, 'motivo', motivo, 'quem', quem) ORDER BY data, criado_em, id) linhas
            FROM corrido WHERE data <= v_ate GROUP BY 1
          ) g)
  INTO v_anterior, v_entradas, v_saidas, v_grupos;

  SELECT jsonb_agg(jsonb_build_object('estoque', e.nome, 'qtd', s.quantidade_atual, 'custo', round(coalesce(s.custo_medio, 0), 4), 'valor', round(s.quantidade_atual * coalesce(s.custo_medio, 0), 2), 'ultima', s.data_ultima_movimentacao) ORDER BY e.nome)
  INTO v_saldos
  FROM saldos_estoque s JOIN estoques e ON e.id = s.estoque_id AND e.status
  WHERE s.item_id = v_item AND (s.quantidade_atual <> 0 OR s.data_ultima_movimentacao >= now() - interval '90 days');

  v_kpis := jsonb_build_array(
    fn_rel_kpi('saldo antes de ' || to_char(v_de, 'DD/MM'), v_anterior, 'num', v_um),
    fn_rel_kpi('entrou no período', v_entradas, 'num', v_um, 'certo'),
    fn_rel_kpi('saiu no período', v_saidas, 'num', v_um, CASE WHEN v_saidas > 0 THEN 'atencao' ELSE 'normal' END),
    fn_rel_kpi('saldo em ' || to_char(v_ate, 'DD/MM'), v_anterior + v_entradas - v_saidas, 'num', v_um, CASE WHEN v_anterior + v_entradas - v_saidas < 0 THEN 'alerta' ELSE 'destaque' END));

  RETURN jsonb_build_object(
    'titulo', 'Kardex · ' || v_nome, 'subtitulo', coalesce('Em ' || v_est_nome, 'Toda a casa (transferência entre estoques fica neutra)') || ' · ' || to_char(v_de, 'DD/MM') || ' a ' || to_char(v_ate, 'DD/MM/YYYY'),
    'kpis', v_kpis, 'avisos', '[]'::jsonb,
    'colunas', jsonb_build_array(fn_rel_col('data','Data','data'), fn_rel_col('tipo','Tipo'), fn_rel_col('origem','Origem'), fn_rel_col('de','De'), fn_rel_col('para','Para'), fn_rel_col('qtd','Qtd','num'), fn_rel_col('custo','Unitário','brl'), fn_rel_col('total','Total','brl'), fn_rel_col('saldo','Saldo','num'), fn_rel_col('quem','Quem'), fn_rel_col('motivo','Motivo')),
    'grupos', coalesce(v_grupos, '[]') || CASE WHEN v_saldos IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('titulo', 'Saldo hoje por estoque', 'n', jsonb_array_length(v_saldos), 'linhas', v_saldos,
      'colunas', jsonb_build_array(fn_rel_col('estoque','Estoque'), fn_rel_col('qtd','Saldo','num'), fn_rel_col('custo','Custo médio','brl'), fn_rel_col('valor','Valor','brl'), fn_rel_col('ultima','Última mov.','datahora')))) END);
END $$;

-- ── 5 · Contagens do período ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_rel_contagens(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_de date; v_ate date; v_est uuid := nullif(p->>'estoque_id','')::uuid; v_grupos jsonb; v_kpis jsonb;
BEGIN
  SELECT * INTO v_de, v_ate FROM fn_rel_periodo(p);
  WITH c AS (
    SELECT c.id, e.nome estoque, c.data_contagem, fn_rel_bloco(c.bloco) modo, c.responsavel, c.status,
           count(ci.id) FILTER (WHERE ci.quantidade_contada IS NOT NULL) contados,
           count(ci.id) FILTER (WHERE coalesce(ci.diferenca, 0) <> 0) com_diferenca,
           coalesce(sum(ci.valor_diferenca), 0) valor,
           coalesce(sum(ci.valor_diferenca) FILTER (WHERE ci.valor_diferenca < 0), 0) perdas,
           coalesce(sum(ci.valor_diferenca) FILTER (WHERE ci.valor_diferenca > 0), 0) sobras,
           jsonb_agg(jsonb_build_object('item', i.nome, 'um', i.unidade_medida, 'sistema', ci.quantidade_sistema, 'contada', ci.quantidade_contada, 'diferenca', ci.diferenca, 'valor', round(ci.valor_diferenca, 2)) ORDER BY ci.valor_diferenca, i.nome)
             FILTER (WHERE coalesce(ci.diferenca, 0) <> 0) linhas
    FROM contagens_estoque c
    JOIN estoques e ON e.id = c.estoque_id
    LEFT JOIN contagens_estoque_itens ci ON ci.contagem_id = c.id
    LEFT JOIN itens_estoque i ON i.id = ci.item_estoque_id
    WHERE c.status IN ('finalizada', 'processada') AND c.data_contagem::date BETWEEN v_de AND v_ate AND (v_est IS NULL OR c.estoque_id = v_est)
    GROUP BY c.id, e.nome, c.data_contagem, c.bloco, c.responsavel, c.status
  )
  SELECT jsonb_agg(jsonb_build_object('titulo', estoque || ' · ' || to_char(data_contagem, 'DD/MM') || ' · ' || modo || coalesce(' · ' || responsavel, '') || CASE WHEN status = 'finalizada' THEN ' · aguardando aprovação' ELSE '' END,
                                      'n', contados, 'valor', round(valor, 2), 'linhas', coalesce(linhas, '[]'::jsonb)) ORDER BY data_contagem DESC),
         jsonb_build_array(
           fn_rel_kpi('contagens', count(*), 'int', sum(contados) || ' itens contados', 'destaque'),
           fn_rel_kpi('itens com diferença', sum(com_diferenca), 'int', 'entre contado e sistema', CASE WHEN sum(com_diferenca) > 0 THEN 'atencao' ELSE 'certo' END),
           fn_rel_kpi('perdas', round(sum(perdas), 2), 'brl', 'contado abaixo do sistema', CASE WHEN sum(perdas) < 0 THEN 'alerta' ELSE 'certo' END),
           fn_rel_kpi('sobras', round(sum(sobras), 2), 'brl', 'contado acima do sistema', CASE WHEN sum(sobras) > 0 THEN 'atencao' ELSE 'normal' END))
  INTO v_grupos, v_kpis FROM c;
  RETURN jsonb_build_object(
    'titulo', 'Contagens', 'subtitulo', 'De ' || to_char(v_de, 'DD/MM') || ' a ' || to_char(v_ate, 'DD/MM/YYYY') || '. Só as linhas com diferença aparecem.',
    'kpis', coalesce(v_kpis, '[]'), 'grupos', coalesce(v_grupos, '[]'), 'avisos', '[]'::jsonb,
    'colunas', jsonb_build_array(fn_rel_col('item','Item'), fn_rel_col('um','Un'), fn_rel_col('sistema','Sistema','num'), fn_rel_col('contada','Contado','num'), fn_rel_col('diferenca','Diferença','num'), fn_rel_col('valor','Valor','brl')));
END $$;

-- ── 6 · Perdas e divergências por item ─────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_rel_perdas(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_de date; v_ate date; v_est uuid := nullif(p->>'estoque_id','')::uuid; v_grupos jsonb; v_kpis jsonb;
BEGIN
  SELECT * INTO v_de, v_ate FROM fn_rel_periodo(p);
  WITH l AS (
    SELECT coalesce(nullif(trim(i.categoria),''),'Sem categoria') categoria, i.nome item, i.unidade_medida um,
           count(*) vezes, sum(ci.diferenca) diferenca, sum(ci.valor_diferenca) valor, max(c.data_contagem::date) ultima,
           string_agg(DISTINCT e.nome, ', ') onde
    FROM contagens_estoque_itens ci
    JOIN contagens_estoque c ON c.id = ci.contagem_id AND c.status = 'processada'
    JOIN estoques e ON e.id = c.estoque_id
    JOIN itens_estoque i ON i.id = ci.item_estoque_id
    WHERE coalesce(ci.diferenca, 0) <> 0 AND c.data_contagem::date BETWEEN v_de AND v_ate AND (v_est IS NULL OR c.estoque_id = v_est)
    GROUP BY 1, 2, 3
  )
  SELECT jsonb_agg(jsonb_build_object('titulo', categoria, 'n', n, 'valor', valor, 'linhas', linhas) ORDER BY valor, categoria),
         jsonb_build_array(
           fn_rel_kpi('perdas', round(sum(perdas), 2), 'brl', sum(itens_perda) || ' itens contaram abaixo', CASE WHEN sum(perdas) < 0 THEN 'alerta' ELSE 'certo' END),
           fn_rel_kpi('sobras', round(sum(sobras), 2), 'brl', sum(itens_sobra) || ' itens contaram acima', CASE WHEN sum(sobras) > 0 THEN 'atencao' ELSE 'normal' END),
           fn_rel_kpi('saldo líquido', round(sum(valor), 2), 'brl', 'perdas + sobras', CASE WHEN sum(valor) < 0 THEN 'alerta' ELSE 'certo' END),
           fn_rel_kpi('maior perda', (array_agg(pior ORDER BY pior_valor))[1], 'texto', '{brl:' || (array_agg(pior_valor ORDER BY pior_valor))[1] || '}'))
  INTO v_grupos, v_kpis
  FROM (
    SELECT categoria, count(*) n, round(sum(valor), 2) valor,
           sum(valor) FILTER (WHERE valor < 0) perdas, sum(valor) FILTER (WHERE valor > 0) sobras,
           count(*) FILTER (WHERE valor < 0) itens_perda, count(*) FILTER (WHERE valor > 0) itens_sobra,
           (array_agg(item ORDER BY valor))[1] pior, round((array_agg(valor ORDER BY valor))[1], 2) pior_valor,
           jsonb_agg(jsonb_build_object('item', item, 'um', um, 'vezes', vezes, 'diferenca', diferenca, 'valor', round(valor, 2), 'ultima', ultima, 'onde', onde) ORDER BY valor, item) linhas
    FROM l GROUP BY categoria
  ) g;
  RETURN jsonb_build_object(
    'titulo', 'Perdas e divergências', 'subtitulo', 'Diferenças das contagens aprovadas de ' || to_char(v_de, 'DD/MM') || ' a ' || to_char(v_ate, 'DD/MM/YYYY') || ', somadas por item',
    'kpis', coalesce(v_kpis, '[]'), 'grupos', coalesce(v_grupos, '[]'), 'avisos', '[]'::jsonb,
    'colunas', jsonb_build_array(fn_rel_col('item','Item'), fn_rel_col('um','Un'), fn_rel_col('vezes','Contagens','int'), fn_rel_col('diferenca','Diferença','num'), fn_rel_col('valor','Valor','brl'), fn_rel_col('ultima','Última','data'), fn_rel_col('onde','Onde')));
END $$;

-- ── 7 · CMV e consumo pelas vendas ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_rel_cmv(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_de date; v_ate date; c jsonb; v_grupos jsonb; v_consumo numeric; v_fat numeric; v_kpis jsonb;
BEGIN
  SELECT * INTO v_de, v_ate FROM fn_rel_periodo(p);
  c := calcular_cmv(v_de, v_ate, NULL);
  v_fat := coalesce((c->'faturamento'->>'valor')::numeric, 0);
  WITH l AS (
    SELECT coalesce(e.nome, 'Sem setor') setor, coalesce(nullif(trim(i.categoria),''),'Sem categoria') categoria, i.nome item, i.unidade_medida um,
           sum(m.quantidade) qtd, sum(coalesce(m.custo_total, 0)) valor
    FROM movimentacoes_estoque m
    JOIN itens_estoque i ON i.id = m.item_id
    LEFT JOIN estoques e ON e.id = m.estoque_origem_id
    WHERE m.tipo_movimentacao = 'saida' AND m.origem_tipo = 'zig' AND m.data_movimentacao BETWEEN v_de AND v_ate
    GROUP BY 1, 2, 3, 4
  ), l2 AS (
    SELECT l.*, round(valor * 100 / nullif(sum(valor) OVER (), 0), 1) pct FROM l
  )
  SELECT jsonb_agg(jsonb_build_object('titulo', setor, 'n', n, 'valor', valor, 'linhas', linhas) ORDER BY valor DESC), sum(valor)
  INTO v_grupos, v_consumo
  FROM (
    SELECT setor, count(*) n, round(sum(valor), 2) valor,
           jsonb_agg(jsonb_build_object('item', item, 'categoria', categoria, 'um', um, 'qtd', qtd, 'valor', round(valor, 2), 'pct', pct) ORDER BY valor DESC) linhas
    FROM l2 GROUP BY setor
  ) g;
  v_kpis := jsonb_build_array(
    fn_rel_kpi('CMV do período', (c->>'cmv')::numeric, 'brl', 'estoque inicial + compras − estoque final', 'destaque'),
    fn_rel_kpi('CMV sobre o faturamento', (c->>'cmv_percentual')::numeric, 'pct', 'faturamento Zig {brl:' || v_fat || '}', CASE WHEN (c->>'cmv_percentual')::numeric > 35 THEN 'alerta' WHEN (c->>'cmv_percentual')::numeric > 30 THEN 'atencao' ELSE 'certo' END),
    fn_rel_kpi('estoque inicial', (c->'estoque_inicial'->>'valor')::numeric, 'brl', coalesce('foto de ' || to_char((c->'estoque_inicial'->>'snapshot')::date, 'DD/MM'), 'sem foto')),
    fn_rel_kpi('compras', (c->>'compras')::numeric, 'brl', 'só itens que entram no CMV'),
    fn_rel_kpi('estoque final', (c->'estoque_final'->>'valor')::numeric, 'brl', c->'estoque_final'->>'fonte'),
    fn_rel_kpi('consumo pelas vendas', round(coalesce(v_consumo, 0), 2), 'brl', CASE WHEN v_fat > 0 THEN round(coalesce(v_consumo, 0) * 100 / v_fat, 1) || '% do faturamento (CMV teórico, pela Zig)' ELSE 'baixas da Zig a custo médio' END));
  RETURN jsonb_build_object(
    'titulo', 'CMV', 'subtitulo', 'De ' || to_char(v_de, 'DD/MM') || ' a ' || to_char(v_ate, 'DD/MM/YYYY') || '. CMV real pela fórmula; consumo teórico pelas baixas da Zig, por setor.',
    'kpis', v_kpis, 'grupos', coalesce(v_grupos, '[]'), 'avisos', coalesce(c->'avisos', '[]'::jsonb),
    'colunas', jsonb_build_array(fn_rel_col('item','Item'), fn_rel_col('categoria','Categoria'), fn_rel_col('um','Un'), fn_rel_col('qtd','Qtd','num'), fn_rel_col('valor','Custo','brl'), fn_rel_col('pct','% do consumo','pct')));
END $$;

-- ── 8 · Reposição dos setores (o que saiu do Central) ──────────────────────
CREATE OR REPLACE FUNCTION fn_rel_reposicao(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_de date; v_ate date; v_est uuid := nullif(p->>'estoque_id','')::uuid; v_grupos jsonb; v_kpis jsonb;
BEGIN
  SELECT * INTO v_de, v_ate FROM fn_rel_periodo(p);
  WITH l AS (
    SELECT ed.nome setor, i.nome item, i.unidade_medida um,
           CASE m.origem_tipo WHEN 'kit' THEN 'kit' WHEN 'setores' THEN 'entre setores' WHEN 'requisicao' THEN coalesce(r.tipo, 'pedido') ELSE coalesce(m.origem_tipo, 'manual') END via,
           sum(m.quantidade) qtd, sum(coalesce(m.custo_total, 0)) valor, count(DISTINCT m.data_movimentacao) entregas, max(m.data_movimentacao) ultima
    FROM movimentacoes_estoque m
    JOIN estoques eo ON eo.id = m.estoque_origem_id AND eo.tipo = 'central'
    JOIN estoques ed ON ed.id = m.estoque_destino_id
    JOIN itens_estoque i ON i.id = m.item_id
    LEFT JOIN requisicoes_internas r ON m.origem_tipo = 'requisicao' AND r.id = m.origem_id
    WHERE m.tipo_movimentacao = 'transferencia' AND m.data_movimentacao BETWEEN v_de AND v_ate AND (v_est IS NULL OR m.estoque_destino_id = v_est)
    GROUP BY 1, 2, 3, 4
  )
  SELECT jsonb_agg(jsonb_build_object('titulo', setor, 'n', n, 'valor', valor, 'linhas', linhas) ORDER BY valor DESC),
         jsonb_build_array(
           fn_rel_kpi('saiu do Central', round(sum(valor), 2), 'brl', 'a custo médio, para ' || count(*) || ' setores', 'destaque'),
           fn_rel_kpi('itens repostos', sum(n), 'int', 'linhas item × setor'),
           fn_rel_kpi('dias com entrega', max(entregas), 'int', 'no setor mais atendido'),
           fn_rel_kpi('setor que mais recebeu', (array_agg(setor ORDER BY valor DESC))[1], 'texto', '{brl:' || (array_agg(valor ORDER BY valor DESC))[1] || '}'))
  INTO v_grupos, v_kpis
  FROM (
    SELECT setor, count(*) n, round(sum(valor), 2) valor, max(entregas) entregas,
           jsonb_agg(jsonb_build_object('item', item, 'um', um, 'via', via, 'qtd', qtd, 'valor', round(valor, 2), 'entregas', entregas, 'ultima', ultima) ORDER BY valor DESC) linhas
    FROM l GROUP BY setor
  ) g;
  RETURN jsonb_build_object(
    'titulo', 'Reposição dos setores', 'subtitulo', 'Tudo que saiu do Central para os setores e kits de ' || to_char(v_de, 'DD/MM') || ' a ' || to_char(v_ate, 'DD/MM/YYYY'),
    'kpis', coalesce(v_kpis, '[]'), 'grupos', coalesce(v_grupos, '[]'), 'avisos', '[]'::jsonb,
    'colunas', jsonb_build_array(fn_rel_col('item','Item'), fn_rel_col('um','Un'), fn_rel_col('via','Via'), fn_rel_col('qtd','Qtd','num'), fn_rel_col('valor','Valor','brl'), fn_rel_col('entregas','Dias','int'), fn_rel_col('ultima','Última','data')));
END $$;

-- ── 9 · Pedidos e retiradas ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_rel_pedidos(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_de date; v_ate date; v_est uuid := nullif(p->>'estoque_id','')::uuid; v_grupos jsonb; v_kpis jsonb;
BEGIN
  SELECT * INTO v_de, v_ate FROM fn_rel_periodo(p);
  WITH l AS (
    SELECT coalesce(ed.nome, r.setor, 'Sem setor') setor, r.id, r.data_requisicao, r.tipo, r.numero_requisicao numero, r.funcionario_nome quem, r.status,
           r.confirmado_nome, i.nome item, i.unidade_medida um, ri.quantidade_solicitada solicitada, ri.quantidade_entregue entregue, ri.observacao
    FROM requisicoes_internas r
    JOIN requisicoes_internas_itens ri ON ri.requisicao_id = r.id
    JOIN itens_estoque i ON i.id = ri.item_id
    LEFT JOIN estoques ed ON ed.id = r.estoque_destino_id
    WHERE r.tipo IN ('pedido', 'retirada') AND r.data_requisicao::date BETWEEN v_de AND v_ate AND (v_est IS NULL OR r.estoque_destino_id = v_est)
  )
  SELECT jsonb_agg(jsonb_build_object('titulo', setor, 'n', n, 'linhas', linhas) ORDER BY n DESC),
         jsonb_build_array(
           fn_rel_kpi('pedidos', sum(pedidos), 'int', 'feitos pelos setores', 'destaque'),
           fn_rel_kpi('retiradas', sum(retiradas), 'int', 'fora de hora, direto do Central', CASE WHEN sum(retiradas) > 0 THEN 'atencao' ELSE 'normal' END),
           fn_rel_kpi('retiradas sem conferência', sum(sem_conf), 'int', 'ninguém confirmou', CASE WHEN sum(sem_conf) > 0 THEN 'alerta' ELSE 'certo' END),
           fn_rel_kpi('pedidos em aberto', sum(abertos), 'int', 'ainda não entregues', CASE WHEN sum(abertos) > 0 THEN 'atencao' ELSE 'certo' END))
  INTO v_grupos, v_kpis
  FROM (
    SELECT setor, count(*) n,
           count(DISTINCT id) FILTER (WHERE tipo = 'pedido') pedidos, count(DISTINCT id) FILTER (WHERE tipo = 'retirada') retiradas,
           count(DISTINCT id) FILTER (WHERE tipo = 'retirada' AND confirmado_nome IS NULL AND status <> 'rejeitado') sem_conf,
           count(DISTINCT id) FILTER (WHERE tipo = 'pedido' AND status IN ('pendente', 'aprovado')) abertos,
           jsonb_agg(jsonb_build_object('data', data_requisicao, 'tipo', tipo, 'numero', numero, 'quem', quem, 'item', item, 'um', um, 'solicitada', solicitada, 'entregue', entregue, 'status', status, 'conferiu', confirmado_nome, 'obs', observacao) ORDER BY data_requisicao DESC, item) linhas
    FROM l GROUP BY setor
  ) g;
  RETURN jsonb_build_object(
    'titulo', 'Pedidos e retiradas', 'subtitulo', 'Pedidos dos setores e retiradas fora de hora de ' || to_char(v_de, 'DD/MM') || ' a ' || to_char(v_ate, 'DD/MM/YYYY'),
    'kpis', coalesce(v_kpis, '[]'), 'grupos', coalesce(v_grupos, '[]'), 'avisos', '[]'::jsonb,
    'colunas', jsonb_build_array(fn_rel_col('data','Quando','datahora'), fn_rel_col('tipo','Tipo'), fn_rel_col('numero','Nº'), fn_rel_col('quem','Quem'), fn_rel_col('item','Item'), fn_rel_col('um','Un'), fn_rel_col('solicitada','Pedido','num'), fn_rel_col('entregue','Entregue','num'), fn_rel_col('status','Status'), fn_rel_col('conferiu','Conferiu'), fn_rel_col('obs','Obs')));
END $$;

-- ── 10 · Curva ABC do consumo ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_rel_abc(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_de date; v_ate date; v_grupos jsonb; v_kpis jsonb;
BEGIN
  SELECT * INTO v_de, v_ate FROM fn_rel_periodo(p);
  WITH l AS (
    SELECT i.nome item, coalesce(nullif(trim(i.categoria),''),'Sem categoria') categoria, i.unidade_medida um, sum(m.quantidade) qtd, sum(coalesce(m.custo_total, 0)) valor
    FROM movimentacoes_estoque m JOIN itens_estoque i ON i.id = m.item_id
    WHERE m.tipo_movimentacao = 'saida' AND m.origem_tipo = 'zig' AND m.data_movimentacao BETWEEN v_de AND v_ate
    GROUP BY 1, 2, 3 HAVING sum(coalesce(m.custo_total, 0)) > 0
  ), acum AS (
    SELECT *, round(valor * 100 / sum(valor) OVER (), 2) pct, round(sum(valor) OVER (ORDER BY valor DESC, item ROWS UNBOUNDED PRECEDING) * 100 / sum(valor) OVER (), 2) pct_acum,
           row_number() OVER (ORDER BY valor DESC, item) pos
    FROM l
  ), cls AS (
    SELECT *, CASE WHEN pct_acum - pct < 80 THEN 'A' WHEN pct_acum - pct < 95 THEN 'B' ELSE 'C' END classe FROM acum
  )
  SELECT jsonb_agg(jsonb_build_object('titulo', CASE classe WHEN 'A' THEN 'A · até 80% do consumo' WHEN 'B' THEN 'B · dos 80% aos 95%' ELSE 'C · os 5% finais' END, 'n', n, 'valor', valor, 'linhas', linhas) ORDER BY classe),
         jsonb_build_array(
           fn_rel_kpi('consumo no período', round(sum(valor), 2), 'brl', sum(n) || ' itens vendidos', 'destaque'),
           fn_rel_kpi('classe A', coalesce(sum(n) FILTER (WHERE classe = 'A'), 0), 'int', 'itens que fazem 80% do custo: conte toda semana', 'atencao'),
           fn_rel_kpi('classe B', coalesce(sum(n) FILTER (WHERE classe = 'B'), 0), 'int', 'dos 80% aos 95%'),
           fn_rel_kpi('classe C', coalesce(sum(n) FILTER (WHERE classe = 'C'), 0), 'int', 'muitos itens, pouco custo'))
  INTO v_grupos, v_kpis
  FROM (
    SELECT classe, count(*) n, round(sum(valor), 2) valor,
           jsonb_agg(jsonb_build_object('pos', pos, 'item', item, 'categoria', categoria, 'um', um, 'qtd', qtd, 'valor', round(valor, 2), 'pct', pct, 'pct_acum', pct_acum) ORDER BY pos) linhas
    FROM cls GROUP BY classe
  ) g;
  RETURN jsonb_build_object(
    'titulo', 'Curva ABC', 'subtitulo', 'Itens ordenados pelo custo das vendas (baixas da Zig) de ' || to_char(v_de, 'DD/MM') || ' a ' || to_char(v_ate, 'DD/MM/YYYY'),
    'kpis', coalesce(v_kpis, '[]'), 'grupos', coalesce(v_grupos, '[]'), 'avisos', '[]'::jsonb,
    'colunas', jsonb_build_array(fn_rel_col('pos','#','int'), fn_rel_col('item','Item'), fn_rel_col('categoria','Categoria'), fn_rel_col('um','Un'), fn_rel_col('qtd','Qtd','num'), fn_rel_col('valor','Custo','brl'), fn_rel_col('pct','%','pct'), fn_rel_col('pct_acum','% acumulado','pct')));
END $$;

-- ── 11 · Itens parados ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_rel_parados(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_dias int := greatest(7, coalesce((p->>'dias')::int, 60)); v_est uuid := nullif(p->>'estoque_id','')::uuid; v_grupos jsonb; v_kpis jsonb;
BEGIN
  WITH l AS (
    SELECT e.nome estoque, coalesce(nullif(trim(i.categoria),''),'Sem categoria') categoria, i.nome item, i.unidade_medida um,
           s.quantidade_atual qtd, s.quantidade_atual * coalesce(s.custo_medio, i.custo_medio, 0) valor,
           (SELECT max(m.data_movimentacao) FROM movimentacoes_estoque m WHERE m.item_id = s.item_id AND m.estoque_origem_id = s.estoque_id AND m.tipo_movimentacao IN ('saida', 'transferencia')) ultima_saida
    FROM saldos_estoque s
    JOIN estoques e ON e.id = s.estoque_id AND e.status
    JOIN itens_estoque i ON i.id = s.item_id AND i.status = 'ativo'
    WHERE s.quantidade_atual > 0 AND (v_est IS NULL OR s.estoque_id = v_est)
  ), f AS (
    SELECT *, coalesce(current_date - ultima_saida, 999) dias FROM l WHERE ultima_saida IS NULL OR ultima_saida < current_date - v_dias
  )
  SELECT jsonb_agg(jsonb_build_object('titulo', estoque, 'n', n, 'valor', valor, 'linhas', linhas) ORDER BY valor DESC),
         jsonb_build_array(
           fn_rel_kpi('valor parado', round(sum(valor), 2), 'brl', 'sem saída há mais de ' || v_dias || ' dias', 'alerta'),
           fn_rel_kpi('itens parados', sum(n), 'int', 'em ' || count(*) || ' estoques'),
           fn_rel_kpi('nunca saíram', sum(nunca), 'int', 'entraram e não têm nenhuma saída', CASE WHEN sum(nunca) > 0 THEN 'atencao' ELSE 'certo' END),
           fn_rel_kpi('mais caro parado', (array_agg(pior ORDER BY pior_valor DESC))[1], 'texto', '{brl:' || (array_agg(pior_valor ORDER BY pior_valor DESC))[1] || '}'))
  INTO v_grupos, v_kpis
  FROM (
    SELECT estoque, count(*) n, round(sum(valor), 2) valor, count(*) FILTER (WHERE ultima_saida IS NULL) nunca,
           (array_agg(item ORDER BY valor DESC))[1] pior, round((array_agg(valor ORDER BY valor DESC))[1], 2) pior_valor,
           jsonb_agg(jsonb_build_object('item', item, 'categoria', categoria, 'um', um, 'qtd', qtd, 'valor', round(valor, 2), 'ultima_saida', ultima_saida, 'dias', dias) ORDER BY valor DESC) linhas
    FROM f GROUP BY estoque
  ) g;
  RETURN jsonb_build_object(
    'titulo', 'Itens parados', 'subtitulo', 'Com saldo e sem nenhuma saída há mais de ' || v_dias || ' dias',
    'kpis', coalesce(v_kpis, '[]'), 'grupos', coalesce(v_grupos, '[]'), 'avisos', '[]'::jsonb,
    'colunas', jsonb_build_array(fn_rel_col('item','Item'), fn_rel_col('categoria','Categoria'), fn_rel_col('um','Un'), fn_rel_col('qtd','Saldo','num'), fn_rel_col('valor','Valor','brl'), fn_rel_col('ultima_saida','Última saída','data'), fn_rel_col('dias','Dias parado','int')));
END $$;

-- ── 12 · Lista de itens ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_rel_itens(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_grupos jsonb; v_kpis jsonb;
BEGIN
  WITH l AS (
    SELECT coalesce(nullif(trim(i.categoria),''),'Sem categoria') categoria, i.nome item, i.unidade_medida um, i.tipo_item tipo,
           CASE i.classe_compra WHEN 'rua' THEN 'Rua' WHEN 'pedido' THEN 'Pedido' WHEN 'sob_demanda' THEN 'Sob demanda' ELSE NULL END classe,
           i.ponto_reposicao ponto, CASE i.ponto_modo WHEN 'auto' THEN 'calculado' ELSE 'manual' END ponto_modo, i.custo_medio custo, i.entra_no_cmv cmv,
           coalesce((SELECT s.quantidade_atual FROM saldos_estoque s JOIN estoques e ON e.id = s.estoque_id AND e.tipo = 'central' WHERE s.item_id = i.id LIMIT 1), 0) central,
           (SELECT count(*) FROM itens_estoque_niveis n WHERE n.item_id = i.id) setores
    FROM itens_estoque i WHERE i.status = 'ativo'
  )
  SELECT jsonb_agg(jsonb_build_object('titulo', categoria, 'n', n, 'linhas', linhas) ORDER BY categoria),
         jsonb_build_array(
           fn_rel_kpi('itens ativos', sum(n), 'int', 'em ' || count(*) || ' categorias', 'destaque'),
           fn_rel_kpi('com ponto de pedido', sum(com_ponto), 'int', 'entram em Compras sozinhos'),
           fn_rel_kpi('sem classe de compra', sum(sem_classe), 'int', 'definir em Compras › Revisão', CASE WHEN sum(sem_classe) > 0 THEN 'atencao' ELSE 'certo' END),
           fn_rel_kpi('sem custo', sum(sem_custo), 'int', 'custo médio zero: entram sem valor nos relatórios', CASE WHEN sum(sem_custo) > 0 THEN 'atencao' ELSE 'certo' END))
  INTO v_grupos, v_kpis
  FROM (
    SELECT categoria, count(*) n, count(*) FILTER (WHERE ponto > 0) com_ponto, count(*) FILTER (WHERE classe IS NULL) sem_classe, count(*) FILTER (WHERE coalesce(custo, 0) = 0) sem_custo,
           jsonb_agg(jsonb_build_object('item', item, 'um', um, 'tipo', tipo, 'classe', classe, 'ponto', ponto, 'ponto_modo', ponto_modo, 'custo', round(custo, 4), 'central', central, 'setores', setores, 'cmv', CASE WHEN cmv THEN 'sim' ELSE 'não' END) ORDER BY item) linhas
    FROM l GROUP BY categoria
  ) g;
  RETURN jsonb_build_object(
    'titulo', 'Lista de itens', 'subtitulo', 'Cadastro ativo, por categoria', 'kpis', coalesce(v_kpis, '[]'), 'grupos', coalesce(v_grupos, '[]'), 'avisos', '[]'::jsonb,
    'colunas', jsonb_build_array(fn_rel_col('item','Item'), fn_rel_col('um','Un'), fn_rel_col('tipo','Tipo'), fn_rel_col('classe','Compra'), fn_rel_col('ponto','Ponto','num'), fn_rel_col('ponto_modo','Ponto por'), fn_rel_col('custo','Custo médio','brl'), fn_rel_col('central','Central','num'), fn_rel_col('setores','Setores','int'), fn_rel_col('cmv','No CMV')));
END $$;

-- ── 13 · Fichas técnicas ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_rel_fichas(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_grupos jsonb; v_kpis jsonb;
BEGIN
  WITH l AS (
    SELECT coalesce(nullif(f.tipo_consumo, ''), 'Sem tipo') tipo, f.nome ficha, f.categoria, coalesce(f.rendimento, f.porcoes, 1) rendimento, coalesce(f.unidade_rendimento, 'porção') um_rend,
           coalesce(f.custo_total, 0) custo, coalesce(f.custo_total, 0) / nullif(coalesce(f.rendimento, f.porcoes, 1), 0) custo_porcao,
           (SELECT count(*) FROM ficha_ingredientes fi WHERE fi.ficha_id = f.id) ingredientes, ip.nome produz
    FROM fichas_tecnicas f LEFT JOIN itens_estoque ip ON ip.id = f.item_produzido_id
    WHERE coalesce(f.ativo, true)
  )
  SELECT jsonb_agg(jsonb_build_object('titulo', tipo, 'n', n, 'valor', valor, 'linhas', linhas) ORDER BY tipo),
         jsonb_build_array(
           fn_rel_kpi('fichas ativas', sum(n), 'int', 'em ' || count(*) || ' tipos', 'destaque'),
           fn_rel_kpi('custo médio por ficha', round(sum(valor) / nullif(sum(n), 0), 2), 'brl', 'custo total dividido pelas fichas'),
           fn_rel_kpi('sem ingredientes', sum(vazias), 'int', 'não baixam nada do estoque', CASE WHEN sum(vazias) > 0 THEN 'atencao' ELSE 'certo' END),
           fn_rel_kpi('mais cara', (array_agg(cara ORDER BY cara_valor DESC))[1], 'texto', '{brl:' || (array_agg(cara_valor ORDER BY cara_valor DESC))[1] || '}'))
  INTO v_grupos, v_kpis
  FROM (
    SELECT tipo, count(*) n, round(sum(custo), 2) valor, count(*) FILTER (WHERE ingredientes = 0) vazias,
           (array_agg(ficha ORDER BY custo DESC))[1] cara, round((array_agg(custo ORDER BY custo DESC))[1], 2) cara_valor,
           jsonb_agg(jsonb_build_object('ficha', ficha, 'categoria', categoria, 'rendimento', rendimento, 'um_rend', um_rend, 'custo', round(custo, 2), 'custo_porcao', round(custo_porcao, 4), 'ingredientes', ingredientes, 'produz', produz) ORDER BY ficha) linhas
    FROM l GROUP BY tipo
  ) g;
  RETURN jsonb_build_object(
    'titulo', 'Fichas técnicas', 'subtitulo', 'Custo de cada ficha, por tipo de consumo', 'kpis', coalesce(v_kpis, '[]'), 'grupos', coalesce(v_grupos, '[]'), 'avisos', '[]'::jsonb,
    'colunas', jsonb_build_array(fn_rel_col('ficha','Ficha'), fn_rel_col('categoria','Categoria'), fn_rel_col('rendimento','Rende','num'), fn_rel_col('um_rend','Un'), fn_rel_col('custo','Custo','brl'), fn_rel_col('custo_porcao','Por unidade','brl'), fn_rel_col('ingredientes','Ingredientes','int'), fn_rel_col('produz','Produz')));
END $$;

-- ── porta única ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_relatorio(p_tipo text, p jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN CASE p_tipo
    WHEN 'inventario' THEN fn_rel_inventario(p)
    WHEN 'compras' THEN fn_rel_compras(p)
    WHEN 'kardex_fornecedor' THEN fn_rel_kardex_fornecedor(p)
    WHEN 'kardex_produto' THEN fn_rel_kardex_produto(p)
    WHEN 'contagens' THEN fn_rel_contagens(p)
    WHEN 'perdas' THEN fn_rel_perdas(p)
    WHEN 'cmv' THEN fn_rel_cmv(p)
    WHEN 'reposicao' THEN fn_rel_reposicao(p)
    WHEN 'pedidos' THEN fn_rel_pedidos(p)
    WHEN 'abc' THEN fn_rel_abc(p)
    WHEN 'parados' THEN fn_rel_parados(p)
    WHEN 'itens' THEN fn_rel_itens(p)
    WHEN 'fichas' THEN fn_rel_fichas(p)
    ELSE NULL END;
END $$;
