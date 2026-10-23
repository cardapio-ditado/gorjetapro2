-- Pagamentos da aba Musicos: controle proprio, separado do Financeiro.
--
-- Lancar o show continua criando e atualizando a conta a pagar (musicos ->
-- financeiro). A volta deixa de existir: baixa no Financeiro nao mexe mais
-- no musico, e pagamento lancado no musico nao da baixa no Financeiro.
--
-- Cada show tem o seu historico (musicos_pagamentos). valor_pago e
-- saldo_restante do show passam a ser a soma desse historico. Estorno nao
-- apaga: marca a linha e ela sai da soma.
--
-- Ponto de partida: o que a tela mostrava. Show "pago" ganha uma linha de
-- saldo inicial com o valor total; show "pendente" fica sem pagamento. O
-- valor_pago antigo era copia do Financeiro e nao aparecia na tela.

alter table public.contas_pagar disable trigger trg_sincronizar_pagamento_conta_musico;

create table if not exists public.musicos_pagamentos (
  id uuid primary key default gen_random_uuid(),
  musico_id uuid not null references public.musicos(id) on delete cascade,
  tipo text not null default 'pagamento' check (tipo in ('pagamento', 'saldo_inicial')),
  valor numeric(12,2) not null check (valor > 0),
  data_pagamento date not null default current_date,
  forma text,
  observacao text,
  criado_por uuid,
  criado_por_nome text,
  criado_em timestamptz not null default now(),
  estornado_em timestamptz,
  estornado_por_nome text,
  motivo_estorno text
);
create index if not exists musicos_pagamentos_musico_idx on public.musicos_pagamentos (musico_id);

alter table public.musicos_pagamentos enable row level security;
create policy musicos_pagamentos_autenticado on public.musicos_pagamentos
  for all to authenticated using (true) with check (true);

-- Valor final, saldo e status do show. Cancelado fica cancelado.
create or replace function public.calcular_valor_total_musico()
returns trigger
language plpgsql
as $function$
begin
  new.valor_total_final := greatest(0, coalesce(new.valor, 0) - coalesce(new.valor_consumo, 0) + coalesce(new.valor_adicional, 0));
  new.saldo_restante := new.valor_total_final - coalesce(new.valor_pago, 0);
  if new.status_pagamento = 'cancelado' then
    return new;
  end if;
  new.status_pagamento := case
    when new.valor_total_final > 0 and new.saldo_restante <= 0 then 'pago'
    when new.valor_total_final > 0 then 'pendente'
    else coalesce(new.status_pagamento, 'pendente')
  end;
  return new;
end $function$;

create or replace trigger trg_calcular_valor_total_musico
  before insert or update of valor, valor_consumo, valor_adicional, valor_pago, status_pagamento on public.musicos
  for each row execute function public.calcular_valor_total_musico();

-- Soma o historico no show (o trigger acima refaz saldo e status).
create or replace function public.fn_musico_somar_pagamentos()
returns trigger
language plpgsql
as $function$
declare
  v_id uuid := coalesce(new.musico_id, old.musico_id);
begin
  update public.musicos
     set valor_pago = coalesce((select sum(valor) from public.musicos_pagamentos
                                 where musico_id = v_id and estornado_em is null), 0)
   where id = v_id;
  return null;
end $function$;

-- Saldo inicial: o que a tela mostrava como pago. Os dois shows de Wender e
-- Falcao (19/09 e 03/10) ficam pendentes, como o dono vinha tentando marcar.
insert into public.musicos_pagamentos (musico_id, tipo, valor, data_pagamento, observacao, criado_por_nome)
select m.id, 'saldo_inicial', m.valor_total_final, coalesce(m.data_evento::date, current_date),
       'Marcado como pago antes do controle de pagamentos', 'Sistema'
  from public.musicos m
 where m.status_pagamento = 'pago' and m.valor_total_final > 0
   and not (lower(m.nome) like '%wender%' and m.data_evento::date in ('2026-09-19', '2026-10-03'));

update public.musicos m
   set valor_pago = coalesce((select sum(p.valor) from public.musicos_pagamentos p
                               where p.musico_id = m.id and p.estornado_em is null), 0)
 where m.status_pagamento <> 'cancelado';

create or replace trigger trg_musico_somar_pagamentos
  after insert or update or delete on public.musicos_pagamentos
  for each row execute function public.fn_musico_somar_pagamentos();

create or replace function public.fn_usuario_nome()
returns text
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((select nome_completo from usuarios_sistema
                    where auth_user_id = auth.uid() or id = auth.uid() limit 1), 'Sistema')
$function$;

create or replace function public.fn_musico_pagar(
  p_musico uuid, p_valor numeric, p_data date default current_date, p_forma text default null, p_obs text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_m musicos;
begin
  if auth.uid() is null then raise exception 'Faca login para lancar pagamento.'; end if;
  select * into v_m from musicos where id = p_musico;
  if not found then raise exception 'Show nao encontrado.'; end if;
  if v_m.status_pagamento = 'cancelado' then raise exception 'Show cancelado nao recebe pagamento.'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'Informe um valor maior que zero.'; end if;
  insert into musicos_pagamentos (musico_id, valor, data_pagamento, forma, observacao, criado_por, criado_por_nome)
  values (p_musico, round(p_valor, 2), coalesce(p_data, current_date), nullif(btrim(p_forma), ''), nullif(btrim(p_obs), ''),
          auth.uid(), fn_usuario_nome());
  select * into v_m from musicos where id = p_musico;
  return jsonb_build_object('valor_pago', v_m.valor_pago, 'saldo', v_m.saldo_restante, 'status', v_m.status_pagamento);
end $function$;

create or replace function public.fn_musico_estornar(p_pagamento uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_p musicos_pagamentos;
  v_m musicos;
begin
  if auth.uid() is null then raise exception 'Faca login para estornar.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo do estorno.'; end if;
  update musicos_pagamentos
     set estornado_em = now(), estornado_por_nome = fn_usuario_nome(), motivo_estorno = btrim(p_motivo)
   where id = p_pagamento and estornado_em is null
  returning * into v_p;
  if v_p.id is null then raise exception 'Pagamento nao encontrado ou ja estornado.'; end if;
  select * into v_m from musicos where id = v_p.musico_id;
  return jsonb_build_object('valor_pago', v_m.valor_pago, 'saldo', v_m.saldo_restante, 'status', v_m.status_pagamento);
end $function$;

revoke execute on function public.fn_musico_pagar(uuid, numeric, date, text, text) from public, anon;
revoke execute on function public.fn_musico_estornar(uuid, text) from public, anon;
grant execute on function public.fn_musico_pagar(uuid, numeric, date, text, text) to authenticated;
grant execute on function public.fn_musico_estornar(uuid, text) to authenticated;
