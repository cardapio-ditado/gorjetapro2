-- KDS da cozinha: a fila de pratos da noite, lida da ZIG, com cronômetro desde
-- a hora do pedido e o toque de "pronto" no tablet. Quem vê: o master ou quem
-- tem o módulo "kds" (ex.: o usuário do tablet da cozinha).
insert into public.modulos_sistema (nome, slug, icone, cor, ordem, ativo)
values ('KDS da Cozinha', 'kds', 'ChefHat', 'from-orange-600 to-red-800', 13, true)
on conflict (slug) do nothing;

create or replace function public.fn_kds_pode()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((
    select u.ativo and (
      u.nivel = 'master'
      or exists (
        select 1 from permissoes_usuario p
          join modulos_sistema m on m.id = p.modulo_id
         where p.usuario_id = u.id and m.slug = 'kds' and p.aba_id is null and p.pode_visualizar)
    )
    from usuarios_sistema u where u.id = fn_usuario_sistema_id()), false)
$function$;

revoke execute on function public.fn_kds_pode() from public, anon;
grant execute on function public.fn_kds_pode() to authenticated;

-- Um prato por linha: o que a ZIG lançou num pedido, somado por produto.
--   transacao  o pedido: transactionId da ZIG (a comanda do cliente, que dura a
--              noite toda) + a hora do lançamento
--   obs        a observação do lançamento na ZIG (traz a mesa: "Mesa: 45")
--   pedido_em  hora do lançamento na ZIG
--   visto_em   quando a nossa leitura viu o prato pela primeira vez
--   leitura_anterior  a leitura de antes (o prato ainda não estava na ZIG):
--              o atraso da ZIG fica entre leitura_anterior − pedido_em e visto_em − pedido_em
--   pronto_em  o toque de "pronto" no tablet
create table if not exists public.kds_pratos (
  id bigserial primary key,
  chave text not null unique,
  noite date not null,
  transacao text not null,
  produto text not null,
  qtd numeric not null default 1,
  adicionais text[] not null default '{}',
  garcom text,
  categoria text,
  obs text,
  pedido_em timestamptz not null,
  visto_em timestamptz not null default now(),
  leitura_anterior timestamptz,
  pronto_em timestamptz,
  pronto_por text,
  cancelado boolean not null default false
);
create index if not exists kds_pratos_noite on public.kds_pratos (noite, pronto_em);

alter table public.kds_pratos enable row level security;
create policy kds_pratos_ler on public.kds_pratos for select to authenticated using (fn_kds_pode());

-- A última leitura da ZIG (uma linha só): evita que vários tablets abertos
-- leiam a ZIG ao mesmo tempo, e guarda os campos que a ZIG manda por linha.
create table if not exists public.kds_estado (
  id smallint primary key default 1 check (id = 1),
  lido_em timestamptz,
  erro text,
  campos text[],
  atualizado_em timestamptz not null default now()
);
insert into public.kds_estado (id) values (1) on conflict do nothing;
alter table public.kds_estado enable row level security;

-- Durante a noite (17h às 3h em Cuiabá = 21h às 7h UTC), a leitura roda a cada
-- minuto mesmo sem o tablet aberto, para medir o atraso da ZIG e não perder pratos.
select cron.schedule('kds-cozinha-ler', '* 21-23,0-6 * * *', $cron$
  select net.http_post(
    url := 'https://nzdiojmrukdxavrdazot.supabase.co/functions/v1/kds-cozinha',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-agente-token', (select valor #>> '{}' from public.agente_config where chave = 'token_teste')),
    body := '{"acao":"ler"}'::jsonb, timeout_milliseconds := 30000)
$cron$);
