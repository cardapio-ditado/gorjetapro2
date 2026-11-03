-- Ingressos dos eventos fechados, impressos no papel moeda (A4 com 12
-- ingressos e canhoto). Cada ingresso tem número sequencial no evento e um
-- código aleatório que vai no QR code; na portaria o QR é lido e o ingresso
-- só entra uma vez.

create table if not exists public.eventos_ingressos (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references eventos_fechados(id) on delete cascade,
  numero integer not null,
  codigo text not null unique,
  valor numeric(12, 2),
  impresso_em timestamptz not null default now(),
  impresso_por uuid,
  usado_em timestamptz,
  usado_por uuid,
  cancelado_em timestamptz,
  unique (evento_id, numero)
);

alter table public.eventos_ingressos enable row level security;
drop policy if exists eventos_ingressos_acesso on public.eventos_ingressos;
create policy eventos_ingressos_acesso on public.eventos_ingressos for all to authenticated
  using (fn_eventos_pode()) with check (fn_eventos_pode());
revoke all on public.eventos_ingressos from anon;

/** Emite os próximos p_quantidade ingressos do evento (números seguidos). */
create or replace function public.fn_ingressos_emitir(p_evento_id uuid, p_quantidade integer, p_valor numeric)
returns setof eventos_ingressos language plpgsql security definer set search_path = public as $$
declare ultimo integer;
begin
  if not fn_eventos_pode() then raise exception 'Sem acesso a eventos'; end if;
  if p_quantidade is null or p_quantidade < 1 or p_quantidade > 600 then raise exception 'Quantidade deve ser de 1 a 600'; end if;
  if not exists (select 1 from eventos_fechados where id = p_evento_id) then raise exception 'Evento não encontrado'; end if;
  perform pg_advisory_xact_lock(hashtext('ingressos:' || p_evento_id::text));
  select coalesce(max(numero), 0) into ultimo from eventos_ingressos where evento_id = p_evento_id;
  return query
    insert into eventos_ingressos (evento_id, numero, codigo, valor, impresso_por)
    select p_evento_id, ultimo + g,
           upper(substr(encode(extensions.gen_random_bytes(8), 'hex'), 1, 12)),
           p_valor, fn_usuario_sistema_id()
      from generate_series(1, p_quantidade) g
    returning *;
end $$;

/**
 * Portaria: confere o código lido no QR. Qualquer usuário ativo do sistema.
 * status: ok (entrada registrada agora), ja_usado, cancelado, outra_data
 * (evento não é hoje; só entra com p_forcar), invalido.
 */
create or replace function public.fn_ingresso_validar(p_codigo text, p_forcar boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare i eventos_ingressos; ev eventos_fechados; quem uuid := fn_usuario_sistema_id(); hoje date := (now() at time zone 'America/Cuiaba')::date;
  status text; entradas integer; emitidos integer; usado_nome text;
begin
  if quem is null or not exists (select 1 from usuarios_sistema where id = quem and ativo) then
    raise exception 'Entre no sistema para conferir ingressos';
  end if;
  select * into i from eventos_ingressos
   where codigo = upper(regexp_replace(coalesce(p_codigo, ''), '^.*/', '')) for update;
  if i.id is null then return jsonb_build_object('status', 'invalido'); end if;
  select * into ev from eventos_fechados where id = i.evento_id;

  if i.cancelado_em is not null then status := 'cancelado';
  elsif i.usado_em is not null then status := 'ja_usado';
  elsif ev.data_evento <> hoje and not p_forcar then status := 'outra_data';
  else
    update eventos_ingressos set usado_em = now(), usado_por = quem where id = i.id returning * into i;
    status := 'ok';
  end if;

  select count(*) filter (where usado_em is not null), count(*) filter (where cancelado_em is null)
    into entradas, emitidos from eventos_ingressos where evento_id = i.evento_id;
  select nome_completo into usado_nome from usuarios_sistema where id = i.usado_por;

  return jsonb_build_object(
    'status', status, 'numero', i.numero, 'evento', ev.nome_evento, 'evento_id', ev.id, 'data_evento', ev.data_evento,
    'usado_em', i.usado_em, 'usado_por', usado_nome, 'entradas', entradas, 'emitidos', emitidos);
end $$;

/** Ajuste do papel (posição em mm), guardado em configuracoes_sistema. */
create or replace function public.fn_ingresso_papel_salvar(p_ajuste jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not fn_eventos_pode() then raise exception 'Sem acesso a eventos'; end if;
  insert into configuracoes_sistema (chave, valor, descricao, tipo, categoria)
  values ('ingresso_papel', p_ajuste::text, 'Posição da impressão no papel moeda dos ingressos (mm)', 'texto', 'eventos')
  on conflict (chave) do update set valor = excluded.valor, atualizado_em = now();
end $$;

revoke execute on function public.fn_ingressos_emitir(uuid, integer, numeric) from public, anon;
revoke execute on function public.fn_ingresso_validar(text, boolean) from public, anon;
revoke execute on function public.fn_ingresso_papel_salvar(jsonb) from public, anon;
grant execute on function public.fn_ingressos_emitir(uuid, integer, numeric) to authenticated;
grant execute on function public.fn_ingresso_validar(text, boolean) to authenticated;
grant execute on function public.fn_ingresso_papel_salvar(jsonb) to authenticated;
