-- Clube do Whisky: boas-vindas no WhatsApp assim que a garrafa e cadastrada.
-- O modelo (Utilidade) e a imagem do cabecalho sao configurados na tela do
-- Clube (botao Mensagens): agente_config.clube_modelo_boas_vindas,
-- clube_modelo (vencimento) e clube_imagem_url.

create table if not exists public.clube_whisky_boas_vindas (
  garrafa_id uuid primary key references public.clube_whisky_garrafas(id) on delete cascade,
  status text not null default 'enviando' check (status in ('enviando', 'enviado', 'falha')),
  tentativas int not null default 1,
  wa_id text,
  erro text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
alter table public.clube_whisky_boas_vindas enable row level security;
create policy clube_whisky_boas_vindas_ler on public.clube_whisky_boas_vindas for select to authenticated using (true);

-- Quem recebe boas-vindas: cadastrada nos ultimos 3 dias, aceita WhatsApp,
-- ainda nao recebeu (falha tenta ate 3 vezes).
create or replace function public.fn_clube_whisky_boas_vindas_devidas(p_garrafa uuid default null)
returns table (garrafa_id uuid, nome text, telefone text, garrafa text, validade date)
language sql
stable
security definer
set search_path to 'public'
as $function$
  select g.id, split_part(g.nome, ' ', 1),
         case when length(t.tel) in (10, 11) then '55' || t.tel else t.tel end,
         g.garrafa_nome, g.validade
    from clube_whisky_garrafas g
    cross join lateral (select regexp_replace(coalesce(g.telefone, ''), '\D', '', 'g') as tel) t
   where g.status = 'ativa' and g.aceita_whatsapp and length(t.tel) between 10 and 13
     and g.criado_em > now() - interval '3 days'
     and (p_garrafa is null or g.id = p_garrafa)
     and not exists (select 1 from clube_whisky_boas_vindas b where b.garrafa_id = g.id
                       and (b.status in ('enviado', 'enviando') or b.tentativas >= 3));
$function$;
revoke execute on function public.fn_clube_whisky_boas_vindas_devidas(uuid) from public, anon, authenticated;

-- Dispara a funcao assim que a garrafa entra (a chamada sai depois do commit).
create or replace function public.fn_clube_whisky_boas_vindas_disparar()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.aceita_whatsapp and new.status = 'ativa' then
    perform net.http_post(
      url := 'https://nzdiojmrukdxavrdazot.supabase.co/functions/v1/clube-whisky-avisos?acao=boas_vindas',
      headers := jsonb_build_object('Content-Type', 'application/json',
        'x-agente-token', (select valor #>> '{}' from agente_config where chave = 'token_teste')),
      body := jsonb_build_object('garrafa_id', new.id),
      timeout_milliseconds := 30000);
  end if;
  return new;
end $function$;

create or replace trigger trg_clube_whisky_boas_vindas
  after insert on public.clube_whisky_garrafas
  for each row execute function public.fn_clube_whisky_boas_vindas_disparar();

-- Configuracao das mensagens: todos leem, so o gestor grava.
create or replace function public.fn_clube_whisky_config()
returns jsonb
language sql
stable
security definer
set search_path to 'public'
as $function$
  select jsonb_build_object(
    'modelo_boas_vindas', (select valor #>> '{}' from agente_config where chave = 'clube_modelo_boas_vindas'),
    'modelo_vencimento', (select valor #>> '{}' from agente_config where chave = 'clube_modelo'),
    'imagem_url', (select valor #>> '{}' from agente_config where chave = 'clube_imagem_url'),
    'pode_editar', fn_usuario_sistema_id()::text in (
      select jsonb_array_elements_text(coalesce((select valor from configuracoes_sistema where chave = 'portal_gestores'), '[]')::jsonb)))
  where auth.uid() is not null;
$function$;
revoke execute on function public.fn_clube_whisky_config() from public, anon;
grant execute on function public.fn_clube_whisky_config() to authenticated;

create or replace function public.fn_clube_whisky_config_salvar(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record;
begin
  if coalesce(fn_usuario_sistema_id()::text, '') not in (
       select jsonb_array_elements_text(coalesce((select valor from configuracoes_sistema where chave = 'portal_gestores'), '[]')::jsonb)) then
    raise exception 'So o gestor muda as mensagens do Clube.';
  end if;
  for r in select * from (values ('modelo_boas_vindas', 'clube_modelo_boas_vindas'), ('modelo_vencimento', 'clube_modelo'),
                                 ('imagem_url', 'clube_imagem_url')) v(campo, chave) loop
    if p ? r.campo then
      insert into agente_config (chave, valor, atualizado_em)
      values (r.chave, coalesce(to_jsonb(nullif(btrim(p ->> r.campo), '')), 'null'::jsonb), now())
      on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
    end if;
  end loop;
  return fn_clube_whisky_config();
end $function$;
revoke execute on function public.fn_clube_whisky_config_salvar(jsonb) from public, anon;
grant execute on function public.fn_clube_whisky_config_salvar(jsonb) to authenticated;

-- Imagem das mensagens: pasta publica (a Meta busca a imagem pelo link).
insert into storage.buckets (id, name, public) values ('clube', 'clube', true) on conflict (id) do nothing;
create policy clube_imagens_ler on storage.objects for select to authenticated using (bucket_id = 'clube');
create policy clube_imagens_subir on storage.objects for insert to authenticated with check (bucket_id = 'clube');
create policy clube_imagens_trocar on storage.objects for update to authenticated using (bucket_id = 'clube');
