-- Resumo das vendas de cada noite (ZIG), para rever noites passadas no Portal
-- do Gerente. Gravado pela função zig-noite-ao-vivo: a cada leitura ao vivo
-- (final = false) e de manhã, pelo agendamento, com a noite fechada (final = true).
-- Só totais e contagens; nada de dado pessoal de cliente.
create table if not exists public.zig_noites (
  data date primary key,
  resumo jsonb not null,
  final boolean not null default false,
  atualizado_em timestamptz not null default now()
);

alter table public.zig_noites enable row level security;

create policy zig_noites_ler on public.zig_noites
  for select to authenticated using (fn_livro_pode());

-- Gravação só pela função (service role, que ignora RLS).

-- Agendamento: 06:30 em Cuiabá (10:30 UTC) grava a noite que acabou de fechar.
select cron.schedule('zig-noite-fechar', '30 10 * * *', $cron$
  select net.http_post(
    url := 'https://nzdiojmrukdxavrdazot.supabase.co/functions/v1/zig-noite-ao-vivo',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-agente-token', (select valor #>> '{}' from public.agente_config where chave = 'token_teste')),
    body := '{"acao":"fechar"}'::jsonb, timeout_milliseconds := 60000)
$cron$);
