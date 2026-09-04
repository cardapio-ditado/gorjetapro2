-- ═══════════════════════════════════════════════════════════════════════════
-- FECHAMENTO DE SÓCIOS — por período livre, com extrato opcional
--
-- O fechamento deixa de ser só mensal: recebe data inicial e final ("de 01 a
-- 04/09"). A comparação passa a ser com o período anterior de mesmo tamanho.
-- Com p_com_extrato, devolve também todos os lançamentos do período (para o
-- relatório completo). A função mensal vira um atalho para esta.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_fechamento_socios_periodo(
  p_inicio date, p_fim date, p_com_anterior boolean default true, p_com_extrato boolean default false)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with contas as (
  select b.id, b.banco, b.tipo_conta, coalesce(b.saldo_inicial, 0) as saldo_inicial
    from bancos_contas b
   where b.status = 'ativo'
),
saldo_ini as (
  select c.id, c.banco, c.tipo_conta,
         c.saldo_inicial + coalesce(sum(case when f.tipo = 'entrada' then f.valor else -f.valor end), 0) as saldo
    from contas c
    left join fluxo_caixa f on f.conta_bancaria_id = c.id and f.data < p_inicio
   group by c.id, c.banco, c.tipo_conta, c.saldo_inicial
),
saldo_fim as (
  select c.id, c.banco, c.tipo_conta,
         c.saldo_inicial + coalesce(sum(case when f.tipo = 'entrada' then f.valor else -f.valor end), 0) as saldo
    from contas c
    left join fluxo_caixa f on f.conta_bancaria_id = c.id and f.data <= p_fim
   group by c.id, c.banco, c.tipo_conta, c.saldo_inicial
),
mov as (
  select f.id, f.data, f.tipo, f.valor, f.categoria_id, f.descricao, f.origem,
         coalesce(p.id, c.id)               as grupo_id,
         coalesce(p.nome, c.nome)           as grupo_nome,
         coalesce(p.grupo_dre, c.grupo_dre) as grupo_dre,
         c.nome                             as categoria_nome,
         b.banco                            as conta_nome,
         fp.nome                            as forma_nome
    from fluxo_caixa f
    left join categorias_financeiras c on c.id = f.categoria_id
    left join categorias_financeiras p on p.id = c.categoria_pai_id
    left join bancos_contas b on b.id = f.conta_bancaria_id
    left join formas_pagamento fp on fp.id = f.forma_pagamento_id
   where f.data between p_inicio and p_fim
),
mov_op as (
  select * from mov where coalesce(origem, '') <> 'transferencia'
),
cat as (
  select tipo, grupo_id, grupo_nome, grupo_dre, categoria_nome,
         sum(valor) as total, count(*) as qtd
    from mov_op
   where categoria_id is not null
   group by 1, 2, 3, 4, 5
),
grp as (
  select tipo, grupo_id, grupo_nome, grupo_dre,
         sum(total) as total, sum(qtd) as qtd,
         jsonb_agg(jsonb_build_object('nome', categoria_nome, 'total', total, 'qtd', qtd) order by total desc) as categorias
    from cat
   group by 1, 2, 3, 4
),
bloco as (
  select tipo,
         sum(total) as total_categorizado,
         jsonb_agg(jsonb_build_object(
           'id', grupo_id, 'nome', grupo_nome, 'grupo_dre', grupo_dre,
           'total', total, 'qtd', qtd, 'categorias', categorias
         ) order by total desc) as grupos
    from grp
   group by tipo
),
semcat as (
  select tipo, sum(valor) as total, count(*) as qtd
    from mov_op
   where categoria_id is null
   group by tipo
),
transf as (
  select coalesce(sum(case when tipo = 'entrada' then valor else 0 end), 0) as entradas,
         coalesce(sum(case when tipo = 'saida'   then valor else 0 end), 0) as saidas
    from mov
   where origem = 'transferencia'
),
sem_conta as (
  select coalesce(sum(case when f.tipo = 'entrada' then f.valor else -f.valor end), 0) as liquido, count(*) as qtd
    from fluxo_caixa f
   where f.data between p_inicio and p_fim
     and f.conta_bancaria_id is null
),
extrato as (
  select jsonb_agg(jsonb_build_object(
           'data', data, 'tipo', tipo, 'valor', valor, 'descricao', descricao,
           'grupo', grupo_nome, 'categoria', categoria_nome, 'conta', conta_nome,
           'forma', forma_nome, 'origem', origem
         ) order by data, id) as linhas
    from mov
)
select jsonb_build_object(
  'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim, 'dias', (p_fim - p_inicio + 1)),
  'saldo_inicial', jsonb_build_object(
     'total', (select coalesce(sum(saldo), 0) from saldo_ini),
     'contas', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'banco', banco, 'tipo', tipo_conta, 'saldo', saldo) order by banco), '[]'::jsonb) from saldo_ini)),
  'saldo_final', jsonb_build_object(
     'total', (select coalesce(sum(saldo), 0) from saldo_fim),
     'contas', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'banco', banco, 'tipo', tipo_conta, 'saldo', saldo) order by banco), '[]'::jsonb) from saldo_fim)),
  'entradas', jsonb_build_object(
     'total', coalesce((select total_categorizado from bloco where tipo = 'entrada'), 0) + coalesce((select total from semcat where tipo = 'entrada'), 0),
     'grupos', coalesce((select grupos from bloco where tipo = 'entrada'), '[]'::jsonb),
     'sem_categoria', jsonb_build_object('total', coalesce((select total from semcat where tipo = 'entrada'), 0), 'qtd', coalesce((select qtd from semcat where tipo = 'entrada'), 0))),
  'saidas', jsonb_build_object(
     'total', coalesce((select total_categorizado from bloco where tipo = 'saida'), 0) + coalesce((select total from semcat where tipo = 'saida'), 0),
     'grupos', coalesce((select grupos from bloco where tipo = 'saida'), '[]'::jsonb),
     'sem_categoria', jsonb_build_object('total', coalesce((select total from semcat where tipo = 'saida'), 0), 'qtd', coalesce((select qtd from semcat where tipo = 'saida'), 0))),
  'transferencias', (select jsonb_build_object('entradas', entradas, 'saidas', saidas, 'liquido', entradas - saidas) from transf),
  'sem_conta', (select jsonb_build_object('liquido', liquido, 'qtd', qtd) from sem_conta),
  'extrato', case when p_com_extrato then coalesce((select linhas from extrato), '[]'::jsonb) else null end,
  'anterior', case when p_com_anterior then (
     select jsonb_build_object(
       'inicio', a->'periodo'->>'inicio', 'fim', a->'periodo'->>'fim',
       'saldo_inicial', a->'saldo_inicial'->'total',
       'entradas', a->'entradas'->'total',
       'saidas', a->'saidas'->'total',
       'saldo_final', a->'saldo_final'->'total')
       from fn_fechamento_socios_periodo(
         p_inicio - (p_fim - p_inicio + 1), p_inicio - 1, false, false) a
  ) else null end
);
$$;

grant execute on function public.fn_fechamento_socios_periodo(date, date, boolean, boolean) to authenticated;

-- A versão mensal vira atalho da versão por período.
create or replace function public.fn_fechamento_socios(p_ano integer, p_mes integer, p_com_anterior boolean default true)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select fn_fechamento_socios_periodo(
    make_date(p_ano, p_mes, 1),
    (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date,
    p_com_anterior, false);
$$;
