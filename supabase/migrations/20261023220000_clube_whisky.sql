-- Clube do Whisky: garrafa comprada pelo cliente e guardada no bar.
-- A venda da garrafa passa pela Zig (que ja baixa o estoque); aqui so se
-- controla de quem e, quanto resta (no olho) e ate quando vale (6 meses).
-- Vencida, a garrafa fica para a casa. O cliente recebe aviso no WhatsApp
-- com 30 e com 7 dias (funcao clube-whisky-avisos, todo dia).

create table if not exists public.clube_whisky_garrafas (
  id uuid primary key default gen_random_uuid(),
  cpf text,
  nome text not null,
  telefone text,
  item_id uuid references public.itens_estoque(id),
  garrafa_nome text not null,
  etiqueta text,
  data_compra date not null default current_date,
  validade date not null,
  nivel text not null default 'cheia' check (nivel in ('cheia', '3/4', '1/2', '1/4', 'acabou')),
  status text not null default 'ativa' check (status in ('ativa', 'finalizada', 'cancelada')),
  aceita_whatsapp boolean not null default false,
  observacoes text,
  criado_por uuid,
  criado_por_nome text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists clube_whisky_garrafas_cpf on public.clube_whisky_garrafas (cpf);
create index if not exists clube_whisky_garrafas_validade on public.clube_whisky_garrafas (validade) where status = 'ativa';

create table if not exists public.clube_whisky_historico (
  id bigserial primary key,
  garrafa_id uuid not null references public.clube_whisky_garrafas(id) on delete cascade,
  tipo text not null,
  nivel_antes text,
  nivel_depois text,
  texto text,
  por_nome text,
  criado_em timestamptz not null default now()
);
create index if not exists clube_whisky_historico_garrafa on public.clube_whisky_historico (garrafa_id, criado_em);

create table if not exists public.clube_whisky_avisos (
  id bigserial primary key,
  garrafa_id uuid not null references public.clube_whisky_garrafas(id) on delete cascade,
  tipo text not null check (tipo in ('30d', '7d')),
  telefone text,
  status text not null default 'enviando' check (status in ('enviando', 'enviado', 'falha')),
  tentativas int not null default 1,
  wa_id text,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (garrafa_id, tipo)
);

alter table public.clube_whisky_garrafas enable row level security;
alter table public.clube_whisky_historico enable row level security;
alter table public.clube_whisky_avisos enable row level security;
create policy clube_whisky_garrafas_auth on public.clube_whisky_garrafas for all to authenticated using (true) with check (true);
create policy clube_whisky_historico_auth on public.clube_whisky_historico for all to authenticated using (true) with check (true);
create policy clube_whisky_avisos_ler on public.clube_whisky_avisos for select to authenticated using (true);

-- Validade, quem cadastrou, acabou = finalizada, e o historico de cada mudanca.
create or replace function public.fn_clube_whisky_antes()
returns trigger
language plpgsql
as $function$
begin
  if tg_op = 'INSERT' then
    new.validade := coalesce(new.validade, (new.data_compra + interval '6 months')::date);
    new.criado_por := coalesce(new.criado_por, auth.uid());
    new.criado_por_nome := coalesce(new.criado_por_nome, fn_usuario_nome());
  end if;
  new.cpf := nullif(regexp_replace(coalesce(new.cpf, ''), '\D', '', 'g'), '');
  new.nome := btrim(regexp_replace(new.nome, '\s+', ' ', 'g'));
  if new.nivel = 'acabou' and new.status = 'ativa' then new.status := 'finalizada'; end if;
  if tg_op = 'UPDATE' and old.nivel = 'acabou' and new.nivel <> 'acabou' and new.status = 'finalizada' then new.status := 'ativa'; end if;
  new.atualizado_em := now();
  return new;
end $function$;

create or replace trigger trg_clube_whisky_antes
  before insert or update on public.clube_whisky_garrafas
  for each row execute function public.fn_clube_whisky_antes();

create or replace function public.fn_clube_whisky_depois()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_quem text := fn_usuario_nome();
begin
  if tg_op = 'INSERT' then
    insert into clube_whisky_historico (garrafa_id, tipo, nivel_depois, texto, por_nome)
    values (new.id, 'cadastro', new.nivel, 'Garrafa cadastrada, vale ate ' || to_char(new.validade, 'DD/MM/YYYY'), v_quem);
    return new;
  end if;
  if new.nivel is distinct from old.nivel then
    insert into clube_whisky_historico (garrafa_id, tipo, nivel_antes, nivel_depois, por_nome)
    values (new.id, 'nivel', old.nivel, new.nivel, v_quem);
  end if;
  if new.status is distinct from old.status then
    insert into clube_whisky_historico (garrafa_id, tipo, texto, por_nome)
    values (new.id, 'status', old.status || ' -> ' || new.status, v_quem);
  end if;
  if new.validade is distinct from old.validade then
    insert into clube_whisky_historico (garrafa_id, tipo, texto, por_nome)
    values (new.id, 'validade', to_char(old.validade, 'DD/MM/YYYY') || ' -> ' || to_char(new.validade, 'DD/MM/YYYY'), v_quem);
  end if;
  return new;
end $function$;

create or replace trigger trg_clube_whisky_depois
  after insert or update on public.clube_whisky_garrafas
  for each row execute function public.fn_clube_whisky_depois();

-- Busca o cliente na Fidelidade pelo CPF (nome e telefone para preencher).
create or replace function public.fn_clube_whisky_cliente(p_cpf text)
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((
    select jsonb_build_object('nome', f.nome, 'telefone', f.telefone, 'visitas', f.total_visitas, 'ultima_visita', f.ultima_visita)
      from fidelidade_clientes f where f.cpf = regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g') limit 1), 'null'::jsonb)
  where auth.uid() is not null;
$function$;
revoke execute on function public.fn_clube_whisky_cliente(text) from public, anon;
grant execute on function public.fn_clube_whisky_cliente(text) to authenticated;

-- O que avisar hoje: 30 dias (entre 8 e 30 dias para vencer) e 7 dias (0 a 7).
-- Um aviso de cada tipo por garrafa; falha tenta de novo ate 3 vezes.
create or replace function public.fn_clube_whisky_avisos_devidos()
returns table (garrafa_id uuid, tipo text, nome text, telefone text, garrafa text, validade date, dias int)
language sql
stable
security definer
set search_path to 'public'
as $function$
  with base as (
    select g.*, (g.validade - (now() at time zone 'America/Cuiaba')::date) as faltam,
           regexp_replace(coalesce(g.telefone, ''), '\D', '', 'g') as tel
      from clube_whisky_garrafas g
     where g.status = 'ativa' and g.aceita_whatsapp)
  select b.id, t.tipo, split_part(b.nome, ' ', 1), case when length(b.tel) in (10, 11) then '55' || b.tel else b.tel end,
         b.garrafa_nome, b.validade, b.faltam
    from base b
    cross join lateral (select case when b.faltam between 0 and 7 then '7d' when b.faltam between 8 and 30 then '30d' end as tipo) t
   where t.tipo is not null and length(b.tel) between 10 and 13
     and not exists (select 1 from clube_whisky_avisos a where a.garrafa_id = b.id and a.tipo = t.tipo
                       and (a.status in ('enviado', 'enviando') or a.tentativas >= 3));
$function$;
revoke execute on function public.fn_clube_whisky_avisos_devidos() from public, anon, authenticated;

-- Modulo e permissoes (os mesmos usuarios do Extras).
insert into public.modulos_sistema (nome, slug, icone, cor, ordem, ativo)
select 'Clube do Whisky', 'clube_whisky', 'Wine', 'from-amber-600 to-yellow-700', 10, true
where not exists (select 1 from public.modulos_sistema where slug = 'clube_whisky');

insert into public.permissoes_usuario (usuario_id, modulo_id, aba_id, pode_visualizar, pode_criar, pode_editar, pode_excluir, pode_aprovar)
select p.usuario_id, (select id from public.modulos_sistema where slug = 'clube_whisky'), null,
       p.pode_visualizar, p.pode_criar, p.pode_editar, p.pode_excluir, p.pode_aprovar
  from public.permissoes_usuario p
 where p.modulo_id = (select id from public.modulos_sistema where slug = 'extras') and p.aba_id is null
   and not exists (select 1 from public.permissoes_usuario x where x.usuario_id = p.usuario_id
                     and x.modulo_id = (select id from public.modulos_sistema where slug = 'clube_whisky') and x.aba_id is null);

-- Aviso diario as 11h05 de Cuiaba (15h05 UTC).
select cron.schedule('clube-whisky-avisos', '5 15 * * *', $c$
  select net.http_post(
    url := 'https://nzdiojmrukdxavrdazot.supabase.co/functions/v1/clube-whisky-avisos?acao=enviar',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-agente-token', (select valor #>> '{}' from public.agente_config where chave = 'token_teste')),
    body := '{}'::jsonb, timeout_milliseconds := 60000)
$c$);
