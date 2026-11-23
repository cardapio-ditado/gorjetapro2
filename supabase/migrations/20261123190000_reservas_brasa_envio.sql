-- Avisos de reserva do Ditado para a Brasa (Kadu, 23/11/2026).
-- Pré-reserva pelo link (ditado.org/reserva) → "criada"; a equipe confirma em Eventos → "confirmada";
-- a equipe recusa → "cancelada". Contrato: POST https://brasafood.app/v1/integracoes/reservas/ditado-popular
-- com o cabeçalho x-brasa-segredo. A chave fica no Vault do Supabase com o nome 'brasa_reservas_segredo'
-- (o Kadu cadastra; ninguém copia). Sem a chave, os avisos ficam na fila esperando.
--
-- Fila + robô de 1 minuto: o gatilho só enfileira; o robô envia por pg_net, confere a resposta
-- e tenta de novo (até 5 vezes) em falha de rede, 5xx ou 429. 400 e 403 param e ficam marcados.
-- Só a reserva que mandou "criada" manda "confirmada"/"cancelada" (nada do que já existia antes vai).
-- A confirmação que vem da própria Brasa (etiqueta brasa:<id> na observação) não volta para a Brasa.

create table public.reservas_brasa_envios (
  id bigint generated always as identity primary key,
  reserva_id uuid not null,
  evento text not null check (evento in ('criada', 'confirmada', 'cancelada')),
  corpo jsonb not null,
  status text not null default 'pendente' check (status in ('pendente', 'enviando', 'ok', 'erro', 'desistiu')),
  tentativas integer not null default 0,
  request_id bigint,
  http_status integer,
  resposta text,
  proxima_em timestamptz not null default now(),
  enviado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index reservas_brasa_envios_status_idx on public.reservas_brasa_envios (status, proxima_em);
create index reservas_brasa_envios_reserva_idx on public.reservas_brasa_envios (reserva_id);
alter table public.reservas_brasa_envios enable row level security;
revoke all on public.reservas_brasa_envios from anon, authenticated;

-- Enfileira o aviso certo quando uma reserva do link nasce ou muda de situação.
create or replace function public.trg_reserva_brasa_enfileirar()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.origem is distinct from 'link' then return new; end if;

  if tg_op = 'INSERT' then
    if new.situacao = 'pre_reserva' then
      insert into reservas_brasa_envios (reserva_id, evento, corpo)
      values (new.id, 'criada', jsonb_strip_nulls(jsonb_build_object(
        'evento', 'criada', 'id', new.id, 'nome', new.nome_cliente, 'telefone', new.telefone_cliente,
        'dia', to_char(new.data_reserva, 'YYYY-MM-DD'), 'horario', to_char(new.horario, 'HH24:MI'),
        'pessoas', new.numero_pessoas,
        'ambiente', nullif(nullif(btrim(coalesce(new.local_bar, '')), ''), 'outros'),
        'observacao', nullif(btrim(coalesce(new.observacoes, '')), ''))));
    end if;
    return new;
  end if;

  if new.situacao is not distinct from old.situacao then return new; end if;
  -- só a reserva que a Brasa conhece (mandou "criada") recebe os avisos seguintes
  if not exists (select 1 from reservas_brasa_envios e where e.reserva_id = new.id and e.evento = 'criada') then return new; end if;

  if new.situacao = 'confirmada' then
    -- confirmada pela própria Brasa (o aviso de aprovação pôs a etiqueta): não devolve o aviso
    if coalesce(new.observacoes, '') like '%brasa:%' and coalesce(old.observacoes, '') not like '%brasa:%' then return new; end if;
    insert into reservas_brasa_envios (reserva_id, evento, corpo)
    values (new.id, 'confirmada', jsonb_build_object('evento', 'confirmada', 'id', new.id));
  elsif new.situacao in ('recusada', 'cancelada') then
    insert into reservas_brasa_envios (reserva_id, evento, corpo)
    values (new.id, 'cancelada', jsonb_build_object('evento', 'cancelada', 'id', new.id));
  end if;
  return new;
end $$;

create trigger trg_reserva_brasa_enfileirar
  after insert or update of situacao on public.reservas_normais
  for each row execute function public.trg_reserva_brasa_enfileirar();

-- O robô: confere as respostas do que já foi e envia o que está pendente.
create or replace function public.fn_brasa_reservas_enviar()
returns jsonb
language plpgsql security definer set search_path = public, extensions as $$
declare
  v_url constant text := 'https://brasafood.app/v1/integracoes/reservas/ditado-popular';
  v_chave text;
  e record; r record;
  v_req bigint; v_enviados integer := 0; v_conferidos integer := 0;
begin
  -- 1. respostas do que foi enviado
  for e in select * from reservas_brasa_envios where status = 'enviando' for update skip locked loop
    select h.status_code, h.content::text conteudo, h.error_msg, h.timed_out into r from net._http_response h where h.id = e.request_id;
    if not found then
      if e.enviado_em < now() - interval '3 minutes' then  -- sem resposta: conta como falha e tenta de novo
        update reservas_brasa_envios set status = case when tentativas >= 5 then 'desistiu' else 'pendente' end,
               resposta = 'sem resposta', proxima_em = now() + make_interval(mins => power(2, tentativas)::int), atualizado_em = now()
         where id = e.id;
        v_conferidos := v_conferidos + 1;
      end if;
      continue;
    end if;
    v_conferidos := v_conferidos + 1;
    update reservas_brasa_envios
       set http_status = r.status_code,
           resposta = left(coalesce(r.conteudo, r.error_msg, case when r.timed_out then 'tempo esgotado' end, ''), 500),
           status = case when r.status_code between 200 and 299 then 'ok'
                         when r.status_code in (400, 401, 403, 404, 422) then 'erro'
                         when tentativas >= 5 then 'desistiu'
                         else 'pendente' end,
           proxima_em = now() + make_interval(mins => power(2, tentativas)::int),
           atualizado_em = now()
     where id = e.id;
  end loop;

  -- 2. sem a chave no Vault, os avisos esperam na fila
  select decrypted_secret into v_chave from vault.decrypted_secrets where name = 'brasa_reservas_segredo' limit 1;
  if coalesce(v_chave, '') = '' then
    return jsonb_build_object('conferidos', v_conferidos, 'enviados', 0, 'motivo', 'sem chave no Vault');
  end if;

  -- 3. envia o pendente, na ordem de cada reserva (nada sai antes do aviso anterior da mesma reserva dar certo)
  for e in
    select x.* from reservas_brasa_envios x
     where x.status = 'pendente' and x.proxima_em <= now()
       and not exists (select 1 from reservas_brasa_envios y where y.reserva_id = x.reserva_id and y.id < x.id and y.status <> 'ok')
     order by x.id limit 20
     for update skip locked
  loop
    select net.http_post(
      url := v_url,
      body := e.corpo,
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-brasa-segredo', v_chave),
      timeout_milliseconds := 10000) into v_req;
    update reservas_brasa_envios set status = 'enviando', request_id = v_req, tentativas = tentativas + 1,
           enviado_em = now(), atualizado_em = now() where id = e.id;
    v_enviados := v_enviados + 1;
  end loop;
  return jsonb_build_object('conferidos', v_conferidos, 'enviados', v_enviados);
end $$;

revoke all on function public.trg_reserva_brasa_enfileirar() from public, anon, authenticated;
revoke all on function public.fn_brasa_reservas_enviar() from public, anon, authenticated;

select cron.schedule('brasa-reservas-enviar', '* * * * *', $$select public.fn_brasa_reservas_enviar()$$);
