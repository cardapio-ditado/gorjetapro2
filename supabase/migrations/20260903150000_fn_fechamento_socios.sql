-- ═══════════════════════════════════════════════════════════════════════════
-- FECHAMENTO DE SÓCIOS — o mês pelo que passou na conta
--
-- O DRE segue competência; o sócio quer saber quanto tinha, quanto entrou,
-- quanto foi pago e quanto sobrou. Esta função responde exatamente isso,
-- pelo regime de caixa, a partir do fluxo_caixa:
--
--   saldo em conta no início do mês (todas as contas ativas)
--   + tudo que entrou no mês, por grupo e categoria
--   − tudo que foi pago no mês, por grupo e categoria
--   = saldo em conta no fim do mês
--
-- Transferências entre contas não entram nas listas (não é dinheiro novo nem
-- gasto); a diferença líquida delas, se houver, aparece à parte para a conta
-- fechar. Lançamentos sem categoria ficam num bloco próprio, visível.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_fechamento_socios(p_ano integer, p_mes integer, p_com_anterior boolean default true)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with per as (
  select make_date(p_ano, p_mes, 1) as ini,
         (make_date(p_ano, p_mes, 1) + interval '1 month - 1 day')::date as fim
),
contas as (
  select b.id, b.banco, b.tipo_conta, coalesce(b.saldo_inicial, 0) as saldo_inicial
    from bancos_contas b
   where b.status = 'ativo'
),
saldo_ini as (
  select c.id, c.banco, c.tipo_conta,
         c.saldo_inicial + coalesce(sum(case when f.tipo = 'entrada' then f.valor else -f.valor end), 0) as saldo
    from contas c
    left join fluxo_caixa f on f.conta_bancaria_id = c.id and f.data < (select ini from per)
   group by c.id, c.banco, c.tipo_conta, c.saldo_inicial
),
saldo_fim as (
  select c.id, c.banco, c.tipo_conta,
         c.saldo_inicial + coalesce(sum(case when f.tipo = 'entrada' then f.valor else -f.valor end), 0) as saldo
    from contas c
    left join fluxo_caixa f on f.conta_bancaria_id = c.id and f.data <= (select fim from per)
   group by c.id, c.banco, c.tipo_conta, c.saldo_inicial
),
mov as (
  select f.tipo, f.valor, f.categoria_id,
         coalesce(p.id, c.id)               as grupo_id,
         coalesce(p.nome, c.nome)           as grupo_nome,
         coalesce(p.grupo_dre, c.grupo_dre) as grupo_dre,
         c.nome                             as categoria_nome
    from fluxo_caixa f
    left join categorias_financeiras c on c.id = f.categoria_id
    left join categorias_financeiras p on p.id = c.categoria_pai_id
   where f.data between (select ini from per) and (select fim from per)
     and coalesce(f.origem, '') <> 'transferencia'
),
cat as (
  select tipo, grupo_id, grupo_nome, grupo_dre, categoria_nome,
         sum(valor) as total, count(*) as qtd
    from mov
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
    from mov
   where categoria_id is null
   group by tipo
),
transf as (
  select coalesce(sum(case when f.tipo = 'entrada' then f.valor else 0 end), 0) as entradas,
         coalesce(sum(case when f.tipo = 'saida'   then f.valor else 0 end), 0) as saidas
    from fluxo_caixa f
   where f.data between (select ini from per) and (select fim from per)
     and f.origem = 'transferencia'
),
sem_conta as (
  -- lançamento sem conta bancária entra nas listas mas não move saldo nenhum
  select coalesce(sum(case when f.tipo = 'entrada' then f.valor else -f.valor end), 0) as liquido, count(*) as qtd
    from fluxo_caixa f
   where f.data between (select ini from per) and (select fim from per)
     and f.conta_bancaria_id is null
)
select jsonb_build_object(
  'periodo', jsonb_build_object('inicio', (select ini from per), 'fim', (select fim from per)),
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
  'mes_anterior', case when p_com_anterior then (
     select jsonb_build_object(
       'saldo_inicial', a->'saldo_inicial'->'total',
       'entradas', a->'entradas'->'total',
       'saidas', a->'saidas'->'total',
       'saldo_final', a->'saldo_final'->'total')
       from fn_fechamento_socios(
         extract(year from (make_date(p_ano, p_mes, 1) - interval '1 month'))::int,
         extract(month from (make_date(p_ano, p_mes, 1) - interval '1 month'))::int,
         false) a
  ) else null end
);
$$;

grant execute on function public.fn_fechamento_socios(integer, integer, boolean) to authenticated;
