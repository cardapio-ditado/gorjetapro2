-- Relatório "Perdas e divergências" passa a mostrar também as perdas
-- registradas (pelo WhatsApp ou qualquer saída com origem "perda"), um grupo
-- por motivo, antes das diferenças das contagens.

create or replace function public.fn_rel_perdas(p jsonb)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_de date; v_ate date; v_est uuid := nullif(p->>'estoque_id','')::uuid;
        v_grupos jsonb; v_kpis jsonb; v_reg_grupos jsonb; v_reg_valor numeric; v_reg_n int; v_reg_pior text; v_reg_pior_valor numeric;
begin
  select * into v_de, v_ate from fn_rel_periodo(p);

  -- Perdas registradas, um grupo por motivo.
  with r as (
    select coalesce(nullif(trim(replace(m.motivo, 'Perda:', '')), ''), 'outro') motivo,
           trim(coalesce(i.nome, m.item_descricao)) item, i.unidade_medida um,
           count(*) vezes, -sum(m.quantidade) diferenca,
           -sum(coalesce(m.custo_total, m.quantidade * coalesce(m.custo_unitario, 0))) valor,
           max(m.data_movimentacao) ultima, string_agg(distinct e.nome, ', ') onde
      from movimentacoes_estoque m
      left join itens_estoque i on i.id = m.item_id
      left join estoques e on e.id = m.estoque_origem_id
     where m.origem_tipo = 'perda' and m.tipo_movimentacao = 'saida'
       and m.data_movimentacao between v_de and v_ate
       and (v_est is null or m.estoque_origem_id = v_est)
     group by 1, 2, 3
  )
  select jsonb_agg(jsonb_build_object('titulo', 'Perda registrada · ' || motivo, 'n', n, 'valor', valor, 'linhas', linhas) order by valor, motivo),
         round(sum(valor), 2), sum(n)::int,
         (array_agg(pior order by pior_valor))[1], round((array_agg(pior_valor order by pior_valor))[1], 2)
    into v_reg_grupos, v_reg_valor, v_reg_n, v_reg_pior, v_reg_pior_valor
    from (
      select motivo, count(*) n, round(sum(valor), 2) valor,
             (array_agg(item order by valor))[1] pior, (array_agg(valor order by valor))[1] pior_valor,
             jsonb_agg(jsonb_build_object('item', item, 'um', um, 'vezes', vezes, 'diferenca', diferenca, 'valor', round(valor, 2), 'ultima', ultima, 'onde', onde) order by valor, item) linhas
        from r group by motivo
    ) g;

  -- Diferenças das contagens (como antes).
  with l as (
    select coalesce(nullif(trim(i.categoria),''),'Sem categoria') categoria, i.nome item, i.unidade_medida um,
           count(*) vezes, sum(ci.diferenca) diferenca, sum(ci.valor_diferenca) valor, max(c.data_contagem::date) ultima,
           string_agg(distinct e.nome, ', ') onde
    from contagens_estoque_itens ci
    join contagens_estoque c on c.id = ci.contagem_id and c.status = 'processada'
    join estoques e on e.id = c.estoque_id
    join itens_estoque i on i.id = ci.item_estoque_id
    where coalesce(ci.diferenca, 0) <> 0 and c.data_contagem::date between v_de and v_ate and (v_est is null or c.estoque_id = v_est)
    group by 1, 2, 3
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
           jsonb_agg(jsonb_build_object('item', item, 'um', um, 'vezes', vezes, 'diferenca', diferenca, 'valor', round(valor, 2), 'ultima', ultima, 'onde', onde) order by valor, item) linhas
    from l group by categoria
  ) g;

  return jsonb_build_object(
    'titulo', 'Perdas e divergências',
    'subtitulo', 'Perdas registradas e diferenças das contagens aprovadas de ' || to_char(v_de, 'DD/MM') || ' a ' || to_char(v_ate, 'DD/MM/YYYY') || ', somadas por item',
    'kpis', coalesce(v_kpis, '[]'), 'grupos', coalesce(v_reg_grupos, '[]'::jsonb) || coalesce(v_grupos, '[]'::jsonb), 'avisos', '[]'::jsonb,
    'colunas', jsonb_build_array(fn_rel_col('item','Item'), fn_rel_col('um','Un'), fn_rel_col('vezes','Vezes','int'), fn_rel_col('diferenca','Diferença','num'), fn_rel_col('valor','Valor','brl'), fn_rel_col('ultima','Última','data'), fn_rel_col('onde','Onde')));
end $$;
