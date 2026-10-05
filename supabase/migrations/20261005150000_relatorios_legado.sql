-- Histórico até 04/10/2026 (legado) dentro dos Relatórios do Beta 2.
--
-- Depois do marco zero, as telas antigas leem as tabelas vivas, que
-- recomeçaram vazias. O histórico está no esquema legado e ninguém lia de
-- lá. Estes quatro relatórios leem a cópia, no mesmo desenho dos demais
-- (fn_relatorio): saldos em 04/10, movimentações, kardex de um item e
-- contagens. Só leitura; o esquema legado não tem acesso pela API.

CREATE OR REPLACE FUNCTION fn_rel_legado_periodo(p jsonb, OUT de date, OUT ate date)
LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
  de := coalesce(nullif(p->>'de','')::date, date '2026-09-04');
  ate := least(coalesce(nullif(p->>'ate','')::date, date '2026-10-04'), date '2026-10-04');
  IF ate < de THEN ate := de; END IF;
END $$;

-- ── Saldos em 04/10 ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_rel_legado_saldos(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_est uuid := nullif(p->>'estoque_id','')::uuid; v_grupos jsonb; v_kpis jsonb;
BEGIN
  WITH l AS (
    SELECT e.nome estoque, coalesce(nullif(trim(i.categoria),''),'Sem categoria') categoria, trim(i.nome) item, i.unidade_medida um,
           s.quantidade_atual qtd, coalesce(s.custo_medio, i.custo_medio, 0) custo, s.quantidade_atual * coalesce(s.custo_medio, i.custo_medio, 0) valor, s.data_ultima_movimentacao ultima
    FROM legado.saldos_estoque s JOIN estoques e ON e.id = s.estoque_id JOIN itens_estoque i ON i.id = s.item_id
    WHERE s.quantidade_atual <> 0 AND (v_est IS NULL OR s.estoque_id = v_est)
  )
  SELECT jsonb_agg(jsonb_build_object('titulo', titulo, 'n', n, 'valor', valor, 'linhas', linhas) ORDER BY valor DESC, titulo),
         jsonb_build_array(
           fn_rel_kpi('valor em 04/10', round(sum(CASE WHEN valor > 0 THEN valor ELSE 0 END), 2), 'brl', sum(n) || ' itens com saldo', 'destaque'),
           fn_rel_kpi('estoques', count(*), 'int', 'com algum saldo'),
           fn_rel_kpi('saldos negativos', sum(neg), 'int', 'como estavam antes do marco zero', CASE WHEN sum(neg) > 0 THEN 'alerta' ELSE 'certo' END),
           fn_rel_kpi('valor negativo', round(sum(valor_neg), 2), 'brl', 'fora do valor em estoque', CASE WHEN sum(valor_neg) < 0 THEN 'alerta' ELSE 'normal' END))
  INTO v_grupos, v_kpis
  FROM (
    SELECT CASE WHEN v_est IS NULL THEN estoque ELSE categoria END titulo, count(*) n, round(sum(CASE WHEN valor > 0 THEN valor ELSE 0 END), 2) valor,
           count(*) FILTER (WHERE qtd < 0) neg, sum(CASE WHEN valor < 0 THEN valor ELSE 0 END) valor_neg,
           jsonb_agg(jsonb_build_object('categoria', categoria, 'item', item, 'um', um, 'qtd', qtd, 'custo', round(custo, 4), 'valor', round(valor, 2), 'ultima', ultima) ORDER BY categoria, item) linhas
    FROM l GROUP BY 1
  ) g;
  RETURN jsonb_build_object('titulo', 'Saldos em 04/10 (legado)', 'subtitulo', 'Como o estoque estava antes do marco zero de 05/10/2026', 'kpis', coalesce(v_kpis, '[]'), 'grupos', coalesce(v_grupos, '[]'), 'avisos', '[]'::jsonb,
    'colunas', jsonb_build_array(fn_rel_col('item','Item'), fn_rel_col('categoria','Categoria'), fn_rel_col('um','Un'), fn_rel_col('qtd','Saldo','num'), fn_rel_col('custo','Custo médio','brl'), fn_rel_col('valor','Valor','brl'), fn_rel_col('ultima','Última mov.','datahora')));
END $$;

-- ── Movimentações ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_rel_legado_movimentacoes(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_de date; v_ate date; v_est uuid := nullif(p->>'estoque_id','')::uuid; v_item uuid := nullif(p->>'item_id','')::uuid; v_grupos jsonb; v_kpis jsonb; v_total int;
BEGIN
  SELECT * INTO v_de, v_ate FROM fn_rel_legado_periodo(p);
  WITH l AS (
    SELECT m.data_movimentacao data, m.criado_em, m.tipo_movimentacao tipo, coalesce(m.origem_tipo, 'manual') origem, trim(i.nome) item, i.unidade_medida um,
           eo.nome de_nome, ed.nome para_nome, m.quantidade qtd, m.custo_unitario custo, m.custo_total total, coalesce(m.motivo, m.observacoes) motivo, u.nome_completo quem
    FROM legado.movimentacoes_estoque m
    JOIN itens_estoque i ON i.id = m.item_id
    LEFT JOIN estoques eo ON eo.id = m.estoque_origem_id
    LEFT JOIN estoques ed ON ed.id = m.estoque_destino_id
    LEFT JOIN usuarios_sistema u ON u.id = m.criado_por
    WHERE m.data_movimentacao BETWEEN v_de AND v_ate
      AND (v_est IS NULL OR m.estoque_origem_id = v_est OR m.estoque_destino_id = v_est)
      AND (v_item IS NULL OR m.item_id = v_item)
  ), tot AS (
    SELECT count(*) n, count(*) FILTER (WHERE tipo = 'entrada') entradas, round(coalesce(sum(total) FILTER (WHERE tipo = 'entrada'), 0), 2) v_entradas,
           count(*) FILTER (WHERE tipo = 'saida') saidas, round(coalesce(sum(total) FILTER (WHERE tipo = 'saida'), 0), 2) v_saidas,
           count(*) FILTER (WHERE tipo = 'transferencia') transf, count(*) FILTER (WHERE tipo = 'ajuste') ajustes
    FROM l
  )
  SELECT (SELECT n FROM tot),
         (SELECT jsonb_agg(jsonb_build_object('titulo', to_char(data, 'DD/MM/YYYY'), 'n', n, 'linhas', linhas) ORDER BY data DESC)
          FROM (SELECT data, count(*) n, jsonb_agg(jsonb_build_object('tipo', tipo, 'origem', origem, 'item', item, 'um', um, 'de', de_nome, 'para', para_nome, 'qtd', qtd, 'custo', round(custo, 4), 'total', round(total, 2), 'quem', quem, 'motivo', motivo) ORDER BY criado_em DESC) linhas
                FROM (SELECT * FROM l ORDER BY data DESC, criado_em DESC LIMIT 3000) x GROUP BY data) g),
         (SELECT jsonb_build_array(
            fn_rel_kpi('entradas', entradas, 'int', '{brl:' || v_entradas || '}', 'certo'),
            fn_rel_kpi('saídas', saidas, 'int', '{brl:' || v_saidas || '}', CASE WHEN saidas > 0 THEN 'atencao' ELSE 'normal' END),
            fn_rel_kpi('transferências', transf, 'int', 'entre estoques'),
            fn_rel_kpi('ajustes', ajustes, 'int', 'zeragem e normalização')) FROM tot)
  INTO v_total, v_grupos, v_kpis;
  RETURN jsonb_build_object('titulo', 'Movimentações (legado)', 'subtitulo', 'De ' || to_char(v_de, 'DD/MM') || ' a ' || to_char(v_ate, 'DD/MM/YYYY') || ', antes do marco zero. Só leitura.',
    'kpis', coalesce(v_kpis, '[]'), 'grupos', coalesce(v_grupos, '[]'),
    'avisos', CASE WHEN v_total > 3000 THEN jsonb_build_array('Mostrando as 3.000 mais recentes de ' || v_total || '. Aperte o período, o estoque ou o item.') ELSE '[]'::jsonb END,
    'colunas', jsonb_build_array(fn_rel_col('tipo','Tipo'), fn_rel_col('origem','Origem'), fn_rel_col('item','Item'), fn_rel_col('um','Un'), fn_rel_col('de','De'), fn_rel_col('para','Para'), fn_rel_col('qtd','Qtd','num'), fn_rel_col('custo','Unitário','brl'), fn_rel_col('total','Total','brl'), fn_rel_col('quem','Quem'), fn_rel_col('motivo','Motivo')));
END $$;

-- ── Kardex de um item ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_rel_legado_kardex(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_de date; v_ate date; v_item uuid := nullif(p->>'item_id','')::uuid; v_est uuid := nullif(p->>'estoque_id','')::uuid;
        v_nome text; v_um text; v_est_nome text; v_anterior numeric; v_grupos jsonb; v_saldos jsonb; v_entradas numeric; v_saidas numeric;
BEGIN
  IF v_item IS NULL THEN
    RETURN jsonb_build_object('titulo', 'Kardex (legado)', 'subtitulo', 'Escolha um item', 'kpis', '[]'::jsonb, 'grupos', '[]'::jsonb, 'colunas', '[]'::jsonb, 'avisos', '[]'::jsonb);
  END IF;
  SELECT * INTO v_de, v_ate FROM fn_rel_legado_periodo(p);
  SELECT trim(nome), unidade_medida INTO v_nome, v_um FROM itens_estoque WHERE id = v_item;
  SELECT nome INTO v_est_nome FROM estoques WHERE id = v_est;
  WITH kx AS (
    SELECT m.data_movimentacao data, m.criado_em, m.id, m.tipo_movimentacao tipo, coalesce(m.origem_tipo, 'manual') origem, eo.nome de_nome, ed.nome para_nome,
           (CASE WHEN m.tipo_movimentacao IN ('entrada','transferencia','ajuste') AND m.estoque_destino_id IS NOT NULL AND (v_est IS NULL OR m.estoque_destino_id = v_est) THEN m.quantidade ELSE 0 END)
         - (CASE WHEN m.tipo_movimentacao IN ('saida','transferencia','ajuste') AND m.estoque_origem_id IS NOT NULL AND (v_est IS NULL OR m.estoque_origem_id = v_est) THEN m.quantidade ELSE 0 END) delta,
           m.custo_unitario, m.custo_total, coalesce(m.motivo, m.observacoes) motivo, u.nome_completo quem
    FROM legado.movimentacoes_estoque m
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
    SELECT kx.*, (SELECT anterior FROM tot) + sum(delta) OVER (ORDER BY data, criado_em, id ROWS UNBOUNDED PRECEDING) saldo FROM kx WHERE data >= v_de
  )
  SELECT (SELECT anterior FROM tot), (SELECT entradas FROM tot), (SELECT saidas FROM tot),
         (SELECT jsonb_agg(jsonb_build_object('titulo', mes, 'n', n, 'linhas', linhas) ORDER BY ini)
          FROM (SELECT to_char(data, 'MM/YYYY') mes, min(data) ini, count(*) n,
                       jsonb_agg(jsonb_build_object('data', data, 'tipo', tipo, 'origem', origem, 'de', de_nome, 'para', para_nome, 'qtd', delta, 'custo', round(custo_unitario, 4), 'total', round(custo_total, 2), 'saldo', saldo, 'motivo', motivo, 'quem', quem) ORDER BY data, criado_em, id) linhas
                FROM corrido WHERE data <= v_ate GROUP BY 1) g)
  INTO v_anterior, v_entradas, v_saidas, v_grupos;

  SELECT jsonb_agg(jsonb_build_object('estoque', e.nome, 'qtd', s.quantidade_atual, 'custo', round(coalesce(s.custo_medio, 0), 4), 'valor', round(s.quantidade_atual * coalesce(s.custo_medio, 0), 2), 'ultima', s.data_ultima_movimentacao) ORDER BY e.nome)
  INTO v_saldos FROM legado.saldos_estoque s JOIN estoques e ON e.id = s.estoque_id WHERE s.item_id = v_item AND s.quantidade_atual <> 0;

  RETURN jsonb_build_object(
    'titulo', 'Kardex (legado) · ' || v_nome, 'subtitulo', coalesce('Em ' || v_est_nome, 'Toda a casa') || ' · ' || to_char(v_de, 'DD/MM') || ' a ' || to_char(v_ate, 'DD/MM/YYYY') || ', antes do marco zero',
    'kpis', jsonb_build_array(
      fn_rel_kpi('saldo antes de ' || to_char(v_de, 'DD/MM'), v_anterior, 'num', v_um),
      fn_rel_kpi('entrou no período', v_entradas, 'num', v_um, 'certo'),
      fn_rel_kpi('saiu no período', v_saidas, 'num', v_um, CASE WHEN v_saidas > 0 THEN 'atencao' ELSE 'normal' END),
      fn_rel_kpi('saldo em ' || to_char(v_ate, 'DD/MM'), v_anterior + v_entradas - v_saidas, 'num', v_um, CASE WHEN v_anterior + v_entradas - v_saidas < 0 THEN 'alerta' ELSE 'destaque' END)),
    'avisos', '[]'::jsonb,
    'colunas', jsonb_build_array(fn_rel_col('data','Data','data'), fn_rel_col('tipo','Tipo'), fn_rel_col('origem','Origem'), fn_rel_col('de','De'), fn_rel_col('para','Para'), fn_rel_col('qtd','Qtd','num'), fn_rel_col('custo','Unitário','brl'), fn_rel_col('total','Total','brl'), fn_rel_col('saldo','Saldo','num'), fn_rel_col('quem','Quem'), fn_rel_col('motivo','Motivo')),
    'grupos', coalesce(v_grupos, '[]') || CASE WHEN v_saldos IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(jsonb_build_object('titulo', 'Saldo em 04/10 por estoque', 'n', jsonb_array_length(v_saldos), 'linhas', v_saldos,
      'colunas', jsonb_build_array(fn_rel_col('estoque','Estoque'), fn_rel_col('qtd','Saldo','num'), fn_rel_col('custo','Custo médio','brl'), fn_rel_col('valor','Valor','brl'), fn_rel_col('ultima','Última mov.','datahora')))) END);
END $$;

-- ── Contagens ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_rel_legado_contagens(p jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_de date; v_ate date; v_est uuid := nullif(p->>'estoque_id','')::uuid; v_grupos jsonb; v_kpis jsonb;
BEGIN
  SELECT * INTO v_de, v_ate FROM fn_rel_legado_periodo(p);
  WITH c AS (
    SELECT c.id, e.nome estoque, c.data_contagem, fn_rel_bloco(c.bloco) modo, c.responsavel, c.status,
           count(ci.id) FILTER (WHERE ci.quantidade_contada IS NOT NULL) contados,
           count(ci.id) FILTER (WHERE coalesce(ci.diferenca, 0) <> 0) com_diferenca,
           coalesce(sum(ci.valor_diferenca), 0) valor,
           coalesce(sum(ci.valor_diferenca) FILTER (WHERE ci.valor_diferenca < 0), 0) perdas,
           coalesce(sum(ci.valor_diferenca) FILTER (WHERE ci.valor_diferenca > 0), 0) sobras,
           jsonb_agg(jsonb_build_object('item', trim(i.nome), 'um', i.unidade_medida, 'sistema', ci.quantidade_sistema, 'contada', ci.quantidade_contada, 'diferenca', ci.diferenca, 'valor', round(ci.valor_diferenca, 2)) ORDER BY ci.valor_diferenca, i.nome)
             FILTER (WHERE coalesce(ci.diferenca, 0) <> 0) linhas
    FROM legado.contagens_estoque c
    JOIN estoques e ON e.id = c.estoque_id
    LEFT JOIN legado.contagens_estoque_itens ci ON ci.contagem_id = c.id
    LEFT JOIN itens_estoque i ON i.id = ci.item_estoque_id
    WHERE c.status IN ('finalizada', 'processada') AND c.data_contagem::date BETWEEN v_de AND v_ate AND (v_est IS NULL OR c.estoque_id = v_est)
    GROUP BY c.id, e.nome, c.data_contagem, c.bloco, c.responsavel, c.status
  )
  SELECT jsonb_agg(jsonb_build_object('titulo', estoque || ' · ' || to_char(data_contagem, 'DD/MM') || ' · ' || modo || coalesce(' · ' || responsavel, ''), 'n', contados, 'valor', round(valor, 2), 'linhas', coalesce(linhas, '[]'::jsonb)) ORDER BY data_contagem DESC),
         jsonb_build_array(
           fn_rel_kpi('contagens', count(*), 'int', sum(contados) || ' itens contados', 'destaque'),
           fn_rel_kpi('itens com diferença', sum(com_diferenca), 'int', 'entre contado e sistema', CASE WHEN sum(com_diferenca) > 0 THEN 'atencao' ELSE 'certo' END),
           fn_rel_kpi('perdas', round(sum(perdas), 2), 'brl', 'contado abaixo do sistema', CASE WHEN sum(perdas) < 0 THEN 'alerta' ELSE 'certo' END),
           fn_rel_kpi('sobras', round(sum(sobras), 2), 'brl', 'contado acima do sistema', CASE WHEN sum(sobras) > 0 THEN 'atencao' ELSE 'normal' END))
  INTO v_grupos, v_kpis FROM c;
  RETURN jsonb_build_object('titulo', 'Contagens (legado)', 'subtitulo', 'De ' || to_char(v_de, 'DD/MM') || ' a ' || to_char(v_ate, 'DD/MM/YYYY') || ', antes do marco zero. Só as linhas com diferença aparecem.',
    'kpis', coalesce(v_kpis, '[]'), 'grupos', coalesce(v_grupos, '[]'), 'avisos', '[]'::jsonb,
    'colunas', jsonb_build_array(fn_rel_col('item','Item'), fn_rel_col('um','Un'), fn_rel_col('sistema','Sistema','num'), fn_rel_col('contada','Contado','num'), fn_rel_col('diferenca','Diferença','num'), fn_rel_col('valor','Valor','brl')));
END $$;

-- ── porta única: quatro tipos a mais ───────────────────────────────────────
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
    WHEN 'legado_saldos' THEN fn_rel_legado_saldos(p)
    WHEN 'legado_movimentacoes' THEN fn_rel_legado_movimentacoes(p)
    WHEN 'legado_kardex' THEN fn_rel_legado_kardex(p)
    WHEN 'legado_contagens' THEN fn_rel_legado_contagens(p)
    ELSE NULL END;
END $$;
