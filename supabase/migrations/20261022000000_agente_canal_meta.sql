-- Agente de estoque no WhatsApp oficial (Cloud API da Meta) e a tela
-- "Conversas do agente".
--
-- Fila de saída: enviando (reservada por um envio em curso) e
-- aguardando_janela (fora das 24 h da Meta; sai quando a pessoa responde ao
-- aviso). entrega guarda o que a Meta devolve: enviada, entregue, lida,
-- falhou.
--
-- canal em agente_config escolhe por onde sai: 'ponte' (Baileys na VPS) ou
-- 'meta'. Os IDs da Meta não são segredo e ficam ali; o token fica nos
-- secrets da função.

alter table public.agente_mensagens drop constraint if exists agente_mensagens_status_check;
alter table public.agente_mensagens add constraint agente_mensagens_status_check check (status in (
  'nova', 'processando', 'respondida', 'ignorada', 'erro', 'pendente_envio', 'enviando',
  'aguardando_janela', 'enviada', 'falha_envio', 'simulada'));

alter table public.agente_mensagens
  add column if not exists entrega text,
  add column if not exists entrega_em timestamptz;

create index if not exists agente_mensagens_equipe_idx on public.agente_mensagens (equipe_id, id desc);

insert into public.agente_config (chave, valor, atualizado_em) values
  ('canal', '"ponte"', now()),
  ('meta_phone_number_id', 'null', now()),
  ('meta_waba_id', 'null', now())
on conflict (chave) do nothing;

-- A cada minuto, se o canal é a Meta e há fila: manda (e tenta de novo o
-- que falhou). O token_teste de agente_config autentica a chamada.
select cron.schedule('agente-whatsapp-enviar', '* * * * *', $cron$
  select net.http_post(
    url := 'https://nzdiojmrukdxavrdazot.supabase.co/functions/v1/agente-whatsapp?acao=enviar',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'x-agente-token', (select valor #>> '{}' from public.agente_config where chave = 'token_teste')),
    body := '{}'::jsonb)
  where (select valor #>> '{}' from public.agente_config where chave = 'canal') = 'meta'
    and exists (select 1 from public.agente_mensagens
                 where direcao = 'saida' and status in ('pendente_envio', 'enviando'));
$cron$);

-- Fotos das conversas: só admin e master abrem.
create policy agente_whatsapp_gestor_ler on storage.objects for select to authenticated
  using (bucket_id = 'agente-whatsapp' and public.fn_agente_ponte_eh_gestor());

-- Lista de conversas: uma por pessoa da equipe, a mais recente primeiro.
create or replace function public.fn_agente_conversas()
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not fn_agente_ponte_eh_gestor() then
    raise exception 'Só admin ou master vê as conversas do agente.';
  end if;
  return coalesce((
    select jsonb_agg(c order by c.ultima_em desc nulls last, c.nome)
    from (
      select e.id, e.nome, p.nome as papel, e.telefone, e.ativo,
             u.criado_em as ultima_em,
             left(regexp_replace(coalesce(u.texto, case u.tipo when 'imagem' then '📷 foto' when 'audio' then '🎤 áudio' when 'documento' then '📄 arquivo' end, ''), '\s+', ' ', 'g'), 90) as ultima,
             u.direcao as ultima_direcao,
             (select max(m.criado_em) from agente_mensagens m
               where m.equipe_id = e.id and m.direcao = 'entrada' and coalesce(m.wa_id, '') not like 'sim-%') as ultima_entrada,
             (select count(*) from agente_mensagens m
               where m.equipe_id = e.id and m.direcao = 'saida' and m.status in ('pendente_envio', 'enviando', 'aguardando_janela')) as na_fila,
             (select count(*) from agente_mensagens m
               where m.equipe_id = e.id and m.direcao = 'saida' and m.status = 'falha_envio' and m.criado_em > now() - interval '3 days') as falhas
        from agente_equipe e
        join agente_papeis p on p.papel = e.papel
        left join lateral (
          select m.texto, m.tipo, m.direcao, m.criado_em from agente_mensagens m
           where m.equipe_id = e.id and m.status not in ('ignorada', 'simulada')
           order by m.id desc limit 1) u on true
       where e.ativo or u.criado_em is not null
    ) c), '[]'::jsonb);
end
$function$;

-- Uma conversa, das mais antigas para as mais novas (p_antes pagina para trás).
create or replace function public.fn_agente_conversa(p_equipe uuid, p_antes bigint default null, p_limite integer default 60)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not fn_agente_ponte_eh_gestor() then
    raise exception 'Só admin ou master vê as conversas do agente.';
  end if;
  return coalesce((
    select jsonb_agg(x order by x.id)
    from (
      select m.id, m.direcao, m.tipo, m.texto, m.midia_path, m.status, m.entrega, m.erro, m.criado_em,
             (m.uso ->> 'manual') is not null as manual, m.uso ->> 'por' as por, m.uso ->> 'modelo' as modelo,
             case when (m.leitura ->> 'ok')::boolean then jsonb_build_object(
               'fornecedor', m.leitura #>> '{nota,fornecedor}', 'numero', m.leitura #>> '{nota,numero}',
               'total', m.leitura #>> '{nota,total}') end as nota
        from agente_mensagens m
       where m.equipe_id = p_equipe
         and m.status not in ('ignorada', 'simulada')
         and (p_antes is null or m.id < p_antes)
       order by m.id desc
       limit greatest(1, least(coalesce(p_limite, 60), 200))
    ) x), '[]'::jsonb);
end
$function$;

-- Configuração da Meta pela tela (os IDs; o token é secret).
create or replace function public.fn_agente_meta_config(p_canal text default null, p_phone_number_id text default null, p_waba_id text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if not fn_agente_ponte_eh_gestor() then
    raise exception 'Só admin ou master mexe na conexão do WhatsApp.';
  end if;
  if p_canal is not null and p_canal not in ('ponte', 'meta') then
    raise exception 'Canal inválido: %', p_canal;
  end if;
  if p_canal is not null then
    update agente_config set valor = to_jsonb(p_canal), atualizado_em = now() where chave = 'canal';
  end if;
  if p_phone_number_id is not null then
    update agente_config set valor = coalesce(to_jsonb(nullif(regexp_replace(p_phone_number_id, '\D', '', 'g'), '')), 'null'::jsonb), atualizado_em = now()
     where chave = 'meta_phone_number_id';
  end if;
  if p_waba_id is not null then
    update agente_config set valor = coalesce(to_jsonb(nullif(regexp_replace(p_waba_id, '\D', '', 'g'), '')), 'null'::jsonb), atualizado_em = now()
     where chave = 'meta_waba_id';
  end if;
  return (select jsonb_object_agg(chave, valor) from agente_config
           where chave in ('canal', 'meta_phone_number_id', 'meta_waba_id', 'meta_ultimo_webhook'));
end
$function$;

revoke all on function public.fn_agente_conversas() from public, anon;
revoke all on function public.fn_agente_conversa(uuid, bigint, integer) from public, anon;
revoke all on function public.fn_agente_meta_config(text, text, text) from public, anon;
grant execute on function public.fn_agente_conversas() to authenticated;
grant execute on function public.fn_agente_conversa(uuid, bigint, integer) to authenticated;
grant execute on function public.fn_agente_meta_config(text, text, text) to authenticated;
