-- Relatórios que somam lançamentos (Reposição dos setores, Perdas e
-- divergências) passam a levar em cada linha a chave "det", e a nova
-- fn_relatorio_detalhe devolve os lançamentos que formam aquele número.
-- A tela mostra a seta na linha que tem "det" e busca o detalhe ao abrir.

CREATE OR REPLACE FUNCTION public.fn_rel_reposicao(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_de date; v_ate date; v_est uuid := nullif(p->>'estoque_id','')::uuid; v_grupos jsonb; v_kpis jsonb;
BEGIN
  SELECT * INTO v_de, v_ate FROM fn_rel_periodo(p);
  WITH l AS (
    SELECT ed.nome setor, ed.id destino_id, i.id item_id, i.nome item, i.unidade_medida um,
           CASE m.origem_tipo WHEN 'kit' THEN 'kit' WHEN 'setores' THEN 'entre setores' WHEN 'requisicao' THEN coalesce(r.tipo, 'pedido') ELSE coalesce(m.origem_tipo, 'manual') END via,
           sum(m.quantidade) qtd, sum(coalesce(m.custo_total, 0)) valor, count(DISTINCT m.data_movimentacao) entregas, max(m.data_movimentacao) ultima
    FROM movimentacoes_estoque m
    JOIN estoques eo ON eo.id = m.estoque_origem_id AND eo.tipo = 'central'
    JOIN estoques ed ON ed.id = m.estoque_destino_id
    JOIN itens_estoque i ON i.id = m.item_id
    LEFT JOIN requisicoes_internas r ON m.origem_tipo = 'requisicao' AND r.id = m.origem_id
    WHERE m.tipo_movimentacao = 'transferencia' AND m.data_movimentacao BETWEEN v_de AND v_ate AND (v_est IS NULL OR m.estoque_destino_id = v_est)
    GROUP BY 1, 2, 3, 4, 5, 6
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
           jsonb_agg(jsonb_build_object('item', item, 'um', um, 'via', via, 'qtd', qtd, 'valor', round(valor, 2), 'entregas', entregas, 'ultima', ultima,
             'det', jsonb_build_object('item_id', item_id, 'destino_id', destino_id, 'via', via)) ORDER BY valor DESC) linhas
    FROM l GROUP BY setor
  ) g;
  RETURN jsonb_build_object(
    'titulo', 'Reposição dos setores', 'subtitulo', 'Tudo que saiu do Central para os setores e kits de ' || to_char(v_de, 'DD/MM') || ' a ' || to_char(v_ate, 'DD/MM/YYYY') || '. Toque numa linha para ver cada lançamento.',
    'kpis', coalesce(v_kpis, '[]'), 'grupos', coalesce(v_grupos, '[]'), 'avisos', '[]'::jsonb,
    'colunas', jsonb_build_array(fn_rel_col('item','Item'), fn_rel_col('um','Un'), fn_rel_col('via','Via'), fn_rel_col('qtd','Qtd','num'), fn_rel_col('valor','Valor','brl'), fn_rel_col('entregas','Dias','int'), fn_rel_col('ultima','Última','data')));
END $function$;

CREATE OR REPLACE FUNCTION public.fn_rel_perdas(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare v_de date; v_ate date; v_est uuid := nullif(p->>'estoque_id','')::uuid;
        v_grupos jsonb; v_kpis jsonb; v_reg_grupos jsonb; v_reg_valor numeric; v_reg_n int; v_reg_pior text; v_reg_pior_valor numeric;
begin
  select * into v_de, v_ate from fn_rel_periodo(p);

  with r as (
    select coalesce(nullif(trim(replace(m.motivo, 'Perda:', '')), ''), 'outro') motivo,
           trim(coalesce(i.nome, m.item_descricao)) item, i.unidade_medida um, i.id item_id,
           count(*) vezes, -sum(m.quantidade) diferenca,
           -sum(coalesce(m.custo_total, m.quantidade * coalesce(m.custo_unitario, 0))) valor,
           max(m.data_movimentacao) ultima, string_agg(distinct e.nome, ', ') onde
      from movimentacoes_estoque m
      left join itens_estoque i on i.id = m.item_id
      left join estoques e on e.id = m.estoque_origem_id
     where m.origem_tipo = 'perda' and m.tipo_movimentacao = 'saida'
       and m.data_movimentacao between v_de and v_ate
       and (v_est is null or m.estoque_origem_id = v_est)
     group by 1, 2, 3, 4
  )
  select jsonb_agg(jsonb_build_object('titulo', 'Perda registrada · ' || motivo, 'n', n, 'valor', valor, 'linhas', linhas) order by valor, motivo),
         round(sum(valor), 2), sum(n)::int,
         (array_agg(pior order by pior_valor))[1], round((array_agg(pior_valor order by pior_valor))[1], 2)
    into v_reg_grupos, v_reg_valor, v_reg_n, v_reg_pior, v_reg_pior_valor
    from (
      select motivo, count(*) n, round(sum(valor), 2) valor,
             (array_agg(item order by valor))[1] pior, (array_agg(valor order by valor))[1] pior_valor,
             jsonb_agg(jsonb_build_object('item', item, 'um', um, 'vezes', vezes, 'diferenca', diferenca, 'valor', round(valor, 2), 'ultima', ultima, 'onde', onde,
               'det', jsonb_build_object('fonte', 'perda', 'item_id', item_id, 'item', item, 'motivo', motivo)) order by valor, item) linhas
        from r group by motivo
    ) g;

  with l as (
    select coalesce(nullif(trim(i.categoria),''),'Sem categoria') categoria, i.nome item, i.unidade_medida um, i.id item_id,
           count(*) vezes, sum(ci.diferenca) diferenca, sum(ci.valor_diferenca) valor, max(c.data_contagem::date) ultima,
           string_agg(distinct e.nome, ', ') onde
    from contagens_estoque_itens ci
    join contagens_estoque c on c.id = ci.contagem_id and c.status = 'processada'
    join estoques e on e.id = c.estoque_id
    join itens_estoque i on i.id = ci.item_estoque_id
    where coalesce(ci.diferenca, 0) <> 0 and c.data_contagem::date between v_de and v_ate and (v_est is null or c.estoque_id = v_est)
    group by 1, 2, 3, 4
  )
  select jsonb_agg(jsonb_build_object('titulo', categoria, 'n', n, 'valor', valor, 'linhas', linhas) order by valor, categoria),
         jsonb_build_array(
           fn_rel_kpi('perdas registradas', coalesce(v_reg_valor, 0), 'brl', coalesce(v_reg_n, 0) || ' itens baixados como perda', case when coalesce(v_reg_valor, 0) < 0 then 'alerta' else 'certo' end),
           fn_rel_kpi('perdas na contagem', round(coalesce(sum(perdas), 0), 2), 'brl', coalesce(sum(itens_perda), 0) || ' itens contaram abaixo', case when sum(perdas) < 0 then 'alerta' else 'certo' end),
           fn_rel_kpi('sobras', round(coalesce(sum(sobras), 0), 2), 'brl', coalesce(sum(itens_sobra), 0) || ' itens contaram acima', case when sum(sobras) > 0 then 'atencao' else 'normal' end),
           fn_rel_kpi('saldo líquido', round(coalesce(sum(valor), 0) + coalesce(v_reg_valor, 0), 2), 'brl', 'registradas + contagens', case when coalesce(sum(valor), 0) + coalesce(v_reg_valor, 0) < 0 then 'alerta' else 'certo' end),
           fn_rel_kpi('maior perda',
             case when v_reg_pior_valor is not null and (v_reg_pior_valor < coalesce((array_agg(pior_valor order by pior_valor))[1], 0)) then v_reg_pior
                  else (array_agg(pior order by pior_valor))[1] end, 'texto',
             '{brl:' || least(coalesce(v_reg_pior_valor, 0), coalesce((array_agg(pior_valor order by pior_valor))[1], 0)) || '}'))
  into v_grupos, v_kpis
  from (
    select categoria, count(*) n, round(sum(valor), 2) valor,
           sum(valor) filter (where valor < 0) perdas, sum(valor) filter (where valor > 0) sobras,
           count(*) filter (where valor < 0) itens_perda, count(*) filter (where valor > 0) itens_sobra,
           (array_agg(item order by valor))[1] pior, round((array_agg(valor order by valor))[1], 2) pior_valor,
           jsonb_agg(jsonb_build_object('item', item, 'um', um, 'vezes', vezes, 'diferenca', diferenca, 'valor', round(valor, 2), 'ultima', ultima, 'onde', onde,
             'det', jsonb_build_object('fonte', 'contagem', 'item_id', item_id)) order by valor, item) linhas
    from l group by categoria
  ) g;

  return jsonb_build_object(
    'titulo', 'Perdas e divergências',
    'subtitulo', 'Perdas registradas e diferenças das contagens aprovadas de ' || to_char(v_de, 'DD/MM') || ' a ' || to_char(v_ate, 'DD/MM/YYYY') || ', somadas por item. Toque numa linha para ver cada lançamento.',
    'kpis', coalesce(v_kpis, '[]'), 'grupos', coalesce(v_reg_grupos, '[]'::jsonb) || coalesce(v_grupos, '[]'::jsonb), 'avisos', '[]'::jsonb,
    'colunas', jsonb_build_array(fn_rel_col('item','Item'), fn_rel_col('um','Un'), fn_rel_col('vezes','Vezes','int'), fn_rel_col('diferenca','Diferença','num'), fn_rel_col('valor','Valor','brl'), fn_rel_col('ultima','Última','data'), fn_rel_col('onde','Onde')));
end $function$;

-- Os lançamentos que formam uma linha de relatório. p traz os filtros do
-- relatório (período, estoque) e a chave "det" da linha.
CREATE OR REPLACE FUNCTION public.fn_relatorio_detalhe(p_tipo text, p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_de date; v_ate date; v_est uuid := nullif(p->>'estoque_id','')::uuid; d jsonb := coalesce(p->'det', '{}'::jsonb);
        v_item uuid := nullif(d->>'item_id','')::uuid; v_linhas jsonb; v_colunas jsonb;
BEGIN
  SELECT * INTO v_de, v_ate FROM fn_rel_periodo(p);

  IF p_tipo = 'reposicao' THEN
    SELECT jsonb_agg(jsonb_build_object('quando', m.criado_em, 'data', m.data_movimentacao, 'qtd', m.quantidade, 'valor', round(coalesce(m.custo_total, 0), 2),
             'motivo', nullif(trim(coalesce(m.motivo, '')), ''), 'obs', nullif(trim(coalesce(m.observacoes, '')), ''), 'quem', u.nome_completo) ORDER BY m.data_movimentacao, m.criado_em)
      INTO v_linhas
      FROM movimentacoes_estoque m
      JOIN estoques eo ON eo.id = m.estoque_origem_id AND eo.tipo = 'central'
      LEFT JOIN requisicoes_internas r ON m.origem_tipo = 'requisicao' AND r.id = m.origem_id
      LEFT JOIN usuarios_sistema u ON u.id = m.criado_por
     WHERE m.tipo_movimentacao = 'transferencia' AND m.data_movimentacao BETWEEN v_de AND v_ate
       AND m.item_id = v_item AND m.estoque_destino_id = nullif(d->>'destino_id','')::uuid
       AND CASE m.origem_tipo WHEN 'kit' THEN 'kit' WHEN 'setores' THEN 'entre setores' WHEN 'requisicao' THEN coalesce(r.tipo, 'pedido') ELSE coalesce(m.origem_tipo, 'manual') END = d->>'via';
    v_colunas := jsonb_build_array(fn_rel_col('data','Data','data'), fn_rel_col('quando','Lançado em','datahora'), fn_rel_col('qtd','Qtd','num'), fn_rel_col('valor','Valor','brl'),
                                   fn_rel_col('motivo','Motivo'), fn_rel_col('obs','Observação'), fn_rel_col('quem','Quem lançou'));

  ELSIF p_tipo = 'perdas' AND d->>'fonte' = 'perda' THEN
    SELECT jsonb_agg(jsonb_build_object('quando', m.criado_em, 'data', m.data_movimentacao, 'onde', e.nome, 'qtd', -m.quantidade,
             'valor', -round(coalesce(m.custo_total, m.quantidade * coalesce(m.custo_unitario, 0)), 2),
             'obs', nullif(trim(coalesce(m.observacoes, '')), ''), 'quem', u.nome_completo) ORDER BY m.data_movimentacao, m.criado_em)
      INTO v_linhas
      FROM movimentacoes_estoque m
      LEFT JOIN itens_estoque i ON i.id = m.item_id
      LEFT JOIN estoques e ON e.id = m.estoque_origem_id
      LEFT JOIN usuarios_sistema u ON u.id = m.criado_por
     WHERE m.origem_tipo = 'perda' AND m.tipo_movimentacao = 'saida' AND m.data_movimentacao BETWEEN v_de AND v_ate
       AND (v_est IS NULL OR m.estoque_origem_id = v_est)
       AND (CASE WHEN v_item IS NOT NULL THEN m.item_id = v_item ELSE trim(m.item_descricao) = d->>'item' END)
       AND coalesce(nullif(trim(replace(m.motivo, 'Perda:', '')), ''), 'outro') = d->>'motivo';
    v_colunas := jsonb_build_array(fn_rel_col('data','Data','data'), fn_rel_col('quando','Lançado em','datahora'), fn_rel_col('onde','Onde'), fn_rel_col('qtd','Qtd','num'),
                                   fn_rel_col('valor','Valor','brl'), fn_rel_col('obs','Observação'), fn_rel_col('quem','Quem lançou'));

  ELSIF p_tipo = 'perdas' AND d->>'fonte' = 'contagem' THEN
    SELECT jsonb_agg(jsonb_build_object('data', c.data_contagem::date, 'onde', e.nome, 'sistema', ci.quantidade_sistema, 'contado', ci.quantidade_contada,
             'qtd', ci.diferenca, 'valor', round(ci.valor_diferenca, 2), 'quem', coalesce(nullif(c.responsavel::text, ''), u.nome_completo)) ORDER BY c.data_contagem)
      INTO v_linhas
      FROM contagens_estoque_itens ci
      JOIN contagens_estoque c ON c.id = ci.contagem_id AND c.status = 'processada'
      JOIN estoques e ON e.id = c.estoque_id
      LEFT JOIN usuarios_sistema u ON u.id = c.criado_por
     WHERE ci.item_estoque_id = v_item AND coalesce(ci.diferenca, 0) <> 0
       AND c.data_contagem::date BETWEEN v_de AND v_ate AND (v_est IS NULL OR c.estoque_id = v_est);
    v_colunas := jsonb_build_array(fn_rel_col('data','Contagem','data'), fn_rel_col('onde','Onde'), fn_rel_col('sistema','Sistema','num'), fn_rel_col('contado','Contado','num'),
                                   fn_rel_col('qtd','Diferença','num'), fn_rel_col('valor','Valor','brl'), fn_rel_col('quem','Responsável'));
  ELSE
    RETURN NULL;
  END IF;

  RETURN jsonb_build_object('colunas', v_colunas, 'linhas', coalesce(v_linhas, '[]'::jsonb));
END $function$;

REVOKE EXECUTE ON FUNCTION public.fn_relatorio_detalhe(text, jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.fn_relatorio_detalhe(text, jsonb) TO authenticated;
