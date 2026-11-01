-- Painel do dono: uma função só para os números do financeiro, com a mesma
-- régua do Fechamento de Sócios:
-- - "operação" = fluxo de caixa sem transferências entre contas e sem as
--   categorias abaixo da linha (retiradas de sócios, empréstimos e aportes,
--   ajustes de saldo, saldo de abertura) e sem a categoria "Transferências
--   entre Contas";
-- - sócios e empréstimos aparecem à parte;
-- - saldo das contas = saldo inicial do cadastro + tudo que entrou e saiu.

/** Caixa de um período, separado em operação e sócios/empréstimos. */
create or replace function public.fn_caixa_periodo(p_inicio date, p_fim date)
returns table (entrou_op numeric, saiu_op numeric, socios_entrou numeric, socios_saiu numeric, sem_cat_qtd bigint, sem_cat_valor numeric)
language sql stable security definer set search_path = public as $$
  with m as (
    select f.tipo, f.valor, f.categoria_id,
           coalesce(p.grupo_dre, c.grupo_dre) grupo_dre,
           coalesce(p.nome, c.nome) grupo_nome,
           coalesce(f.origem, '') origem
      from fluxo_caixa f
      left join categorias_financeiras c on c.id = f.categoria_id
      left join categorias_financeiras p on p.id = c.categoria_pai_id
     where f.data between p_inicio and p_fim
  ), m2 as (
    select *, (origem = 'transferencia' or coalesce(grupo_nome, '') ilike 'transfer%entre contas%') transf,
              coalesce(grupo_dre, '') = 'abaixo_da_linha' socios
      from m
  )
  select coalesce(sum(valor) filter (where tipo = 'entrada' and not transf and not socios), 0),
         coalesce(sum(valor) filter (where tipo = 'saida'   and not transf and not socios), 0),
         coalesce(sum(valor) filter (where tipo = 'entrada' and not transf and socios), 0),
         coalesce(sum(valor) filter (where tipo = 'saida'   and not transf and socios), 0),
         count(*) filter (where categoria_id is null and not transf),
         coalesce(sum(valor) filter (where categoria_id is null and not transf), 0)
    from m2
$$;

create or replace function public.fn_painel_dono(p_ref date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  hoje date := (now() at time zone 'America/Cuiaba')::date;
  ref date := coalesce(p_ref, hoje);
  ini date := date_trunc('month', ref)::date;
  fim date := least((date_trunc('month', ref) + interval '1 month - 1 day')::date, hoje);
  -- mesmo pedaço do mês anterior (1 a N), para comparar igual com igual
  ini_ant date := (ini - interval '1 month')::date;
  fim_ant date := least((ini - interval '1 month')::date + (fim - ini), (ini - 1));
  r jsonb;
begin
  if not fn_financeiro_pode() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Sem acesso ao financeiro';
  end if;

  with contas as (
    select b.id, b.banco, b.tipo_conta, coalesce(b.saldo_inicial, 0) saldo_inicial
      from bancos_contas b where b.status = 'ativo'
  ), saldos as (
    select c.id, c.banco, c.tipo_conta,
           c.saldo_inicial + coalesce(sum(case when f.tipo = 'entrada' then f.valor else -f.valor end) filter (where f.data < ini), 0) saldo_ini,
           c.saldo_inicial + coalesce(sum(case when f.tipo = 'entrada' then f.valor else -f.valor end) filter (where f.data <= fim), 0) saldo_fim,
           c.saldo_inicial + coalesce(sum(case when f.tipo = 'entrada' then f.valor else -f.valor end) filter (where f.data <= hoje), 0) saldo_hoje
      from contas c left join fluxo_caixa f on f.conta_bancaria_id = c.id
     group by c.id, c.banco, c.tipo_conta, c.saldo_inicial
  ), atual as (select * from fn_caixa_periodo(ini, fim)),
  anterior as (select * from fn_caixa_periodo(ini_ant, fim_ant)),
  meses as (
    select g::date mes_ini, least((g + interval '1 month - 1 day')::date, hoje) mes_fim
      from generate_series(date_trunc('month', ref) - interval '11 months', date_trunc('month', ref), interval '1 month') g
  ), serie as (
    select to_char(m.mes_ini, 'YYYY-MM') mes, cp.entrou_op, cp.saiu_op, cp.entrou_op - cp.saiu_op resultado,
           (select coalesce(sum(z.total - coalesce(z.taxa_servico, 0)), 0) from faturamento_zig_diario z where z.data between m.mes_ini and m.mes_fim) venda
      from meses m cross join lateral fn_caixa_periodo(m.mes_ini, m.mes_fim) cp
  ), venda as (
    select coalesce(sum(total - coalesce(taxa_servico, 0)) filter (where data between ini and fim), 0) venda,
           coalesce(sum(num_comandas) filter (where data between ini and fim), 0) comandas,
           coalesce(sum(total - coalesce(taxa_servico, 0)) filter (where data between ini_ant and fim_ant), 0) venda_ant,
           coalesce(sum(taxa_servico) filter (where data between ini and fim), 0) taxa_servico
      from faturamento_zig_diario where data between ini_ant and fim
  ), op_saidas as (
    select f.valor, f.conta_pagar_id, coalesce(p.nome, c.nome, 'Sem categoria') grupo, f.data
      from fluxo_caixa f
      left join categorias_financeiras c on c.id = f.categoria_id
      left join categorias_financeiras p on p.id = c.categoria_pai_id
     where f.tipo = 'saida' and coalesce(f.origem, '') <> 'transferencia'
       and coalesce(p.grupo_dre, c.grupo_dre, '') <> 'abaixo_da_linha'
       and coalesce(p.nome, c.nome, '') not ilike 'transfer%entre contas%'
       and f.data between ini_ant and fim
  ), top_grupos as (
    select grupo, sum(valor) filter (where data between ini and fim) total, sum(valor) filter (where data between ini_ant and fim_ant) anterior
      from op_saidas group by grupo
     order by 2 desc nulls last limit 6
  ), top_forn as (
    select fo.nome, sum(o.valor) filter (where o.data between ini and fim) total, sum(o.valor) filter (where o.data between ini_ant and fim_ant) anterior
      from op_saidas o join contas_pagar cp on cp.id = o.conta_pagar_id join fornecedores fo on fo.id = cp.fornecedor_id
     group by fo.nome order by 2 desc nulls last limit 6
  ), pagar as (
    select coalesce(saldo_restante, valor_total) saldo, data_vencimento
      from contas_pagar
     where status in ('em_aberto', 'parcialmente_pago', 'vencido', 'autorizado_pagamento')
       and coalesce(saldo_restante, valor_total) > 0 and data_vencimento >= '2020-01-01'
  ), receber as (
    select coalesce(saldo_restante, valor_total) saldo, data_vencimento
      from contas_receber
     where status in ('em_aberto', 'parcialmente_recebido', 'vencido') and coalesce(saldo_restante, valor_total) > 0
  )
  select jsonb_build_object(
    'periodo', jsonb_build_object('inicio', ini, 'fim', fim, 'inicio_anterior', ini_ant, 'fim_anterior', fim_ant, 'hoje', hoje),
    'contas', (select coalesce(jsonb_agg(jsonb_build_object('banco', banco, 'tipo', tipo_conta, 'saldo', round(saldo_hoje, 2)) order by saldo_hoje desc), '[]') from saldos),
    'saldo_hoje', (select round(coalesce(sum(saldo_hoje), 0), 2) from saldos),
    'mes', (select jsonb_build_object(
        'saldo_inicial', (select round(coalesce(sum(saldo_ini), 0), 2) from saldos),
        'entrou_op', round(a.entrou_op, 2), 'saiu_op', round(a.saiu_op, 2), 'resultado_op', round(a.entrou_op - a.saiu_op, 2),
        'socios_entrou', round(a.socios_entrou, 2), 'socios_saiu', round(a.socios_saiu, 2),
        'saldo_final', (select round(coalesce(sum(saldo_fim), 0), 2) from saldos),
        'sem_categoria_qtd', a.sem_cat_qtd, 'sem_categoria_valor', round(a.sem_cat_valor, 2)) from atual a),
    'anterior', (select jsonb_build_object('entrou_op', round(b.entrou_op, 2), 'saiu_op', round(b.saiu_op, 2), 'resultado_op', round(b.entrou_op - b.saiu_op, 2)) from anterior b),
    'media_3m_resultado', (select round(avg(resultado), 2) from (select resultado from serie where mes < to_char(ini, 'YYYY-MM') order by mes desc limit 3) x),
    'venda', (select jsonb_build_object('venda', round(venda, 2), 'comandas', comandas,
        'ticket', case when comandas > 0 then round(venda / comandas, 2) end, 'venda_anterior', round(venda_ant, 2), 'taxa_servico', round(taxa_servico, 2)) from venda),
    'serie', (select jsonb_agg(jsonb_build_object('mes', mes, 'entrou_op', round(entrou_op, 2), 'saiu_op', round(saiu_op, 2),
        'resultado', round(resultado, 2), 'venda', round(venda, 2),
        'margem', case when entrou_op > 0 then round(resultado / entrou_op * 100, 1) end) order by mes) from serie),
    'top_grupos', (select coalesce(jsonb_agg(jsonb_build_object('nome', grupo, 'total', round(coalesce(total, 0), 2), 'anterior', round(coalesce(anterior, 0), 2))), '[]') from top_grupos where total > 0),
    'top_fornecedores', (select coalesce(jsonb_agg(jsonb_build_object('nome', nome, 'total', round(coalesce(total, 0), 2), 'anterior', round(coalesce(anterior, 0), 2))), '[]') from top_forn where total > 0),
    'pagar', (select jsonb_build_object(
        'vencidas_qtd', count(*) filter (where data_vencimento < hoje), 'vencidas', round(coalesce(sum(saldo) filter (where data_vencimento < hoje), 0), 2),
        'hoje', round(coalesce(sum(saldo) filter (where data_vencimento = hoje), 0), 2),
        'prox7', round(coalesce(sum(saldo) filter (where data_vencimento between hoje and hoje + 7), 0), 2),
        'prox30', round(coalesce(sum(saldo) filter (where data_vencimento between hoje and hoje + 30), 0), 2)) from pagar),
    'receber', (select jsonb_build_object(
        'vencidas_qtd', count(*) filter (where data_vencimento < hoje), 'vencidas', round(coalesce(sum(saldo) filter (where data_vencimento < hoje), 0), 2),
        'prox7', round(coalesce(sum(saldo) filter (where data_vencimento between hoje and hoje + 7), 0), 2),
        'prox30', round(coalesce(sum(saldo) filter (where data_vencimento between hoje and hoje + 30), 0), 2)) from receber),
    'alertas', jsonb_build_object(
        'duplicadas_possiveis', (select count(*) from (select 1 from contas_pagar where status <> 'cancelado' and criado_em > now() - interval '180 days'
                                  group by fornecedor_id, valor_total, data_vencimento having count(*) > 1) d),
        'datas_estranhas', (select count(*) from contas_pagar where data_vencimento < '2020-01-01' or data_vencimento > hoje + 3650),
        'categorias_sem_dre', (select count(*) from categorias_financeiras where status = 'ativo' and grupo_dre is null),
        'conciliacao_pendente', (select count(*) from banco_extrato where status = 'pendente'))
  ) into r;
  return r;
end $$;

revoke execute on function public.fn_caixa_periodo(date, date) from public, anon;
grant execute on function public.fn_caixa_periodo(date, date) to authenticated, service_role;
revoke execute on function public.fn_painel_dono(date) from public, anon;
grant execute on function public.fn_painel_dono(date) to authenticated, service_role;

/** Saldo de cada conta ativa no fim do dia anterior a p_data (saldo inicial do cadastro + lançamentos). */
create or replace function public.fn_saldos_contas_antes(p_data date)
returns table (conta_id uuid, saldo numeric)
language sql stable security definer set search_path = public as $$
  select b.id, coalesce(b.saldo_inicial, 0) + coalesce(sum(case when f.tipo = 'entrada' then f.valor else -f.valor end), 0)
    from bancos_contas b
    left join fluxo_caixa f on f.conta_bancaria_id = b.id and f.data < p_data
   where b.status = 'ativo'
   group by b.id, b.saldo_inicial
$$;
revoke execute on function public.fn_saldos_contas_antes(date) from public, anon;
grant execute on function public.fn_saldos_contas_antes(date) to authenticated, service_role;
