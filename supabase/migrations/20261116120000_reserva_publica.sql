-- Pré-reserva pelo link do cliente (ditado.org/reserva), combinado com o Kadu em 16/11/2026.
-- O cliente só envia o pedido (fn_reserva_publica); a lista de reservas fica só para a equipe logada.

alter table public.reservas_normais
  add column if not exists situacao text not null default 'confirmada',
  add column if not exists origem text not null default 'equipe';

do $$ begin
  alter table public.reservas_normais add constraint reservas_normais_situacao_check check (situacao in ('pre_reserva', 'confirmada', 'recusada'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.reservas_normais add constraint reservas_normais_origem_check check (origem in ('equipe', 'link'));
exception when duplicate_object then null; end $$;

-- Antes qualquer um com a chave pública lia e apagava as reservas (nome e telefone de cliente).
drop policy if exists "Allow all operations on reservas_normais" on public.reservas_normais;
drop policy if exists reservas_normais_equipe on public.reservas_normais;
create policy reservas_normais_equipe on public.reservas_normais for all to authenticated using (true) with check (true);
revoke all on public.reservas_normais from anon;

create or replace function public.fn_reserva_publica(
  p_nome text, p_telefone text, p_data date, p_horario time, p_pessoas int,
  p_local text default null, p_obs text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_agora timestamp := now() at time zone 'America/Cuiaba';
  v_hoje date := (now() at time zone 'America/Cuiaba')::date;
  v_nome text := btrim(regexp_replace(coalesce(p_nome, ''), '\s+', ' ', 'g'));
  v_dig text := regexp_replace(coalesce(p_telefone, ''), '\D', '', 'g');
  v_local text := coalesce(nullif(btrim(p_local), ''), 'interna');
  v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
begin
  if length(v_dig) in (12, 13) and v_dig like '55%' then v_dig := substr(v_dig, 3); end if;
  if length(v_nome) < 3 or length(v_nome) > 80 then raise exception 'Escreva seu nome.'; end if;
  if length(v_dig) not in (10, 11) then raise exception 'Confira o WhatsApp: DDD e número.'; end if;
  if p_data is null or p_horario is null then raise exception 'Escolha o dia e o horário.'; end if;
  if p_data < v_hoje then raise exception 'Essa data já passou.'; end if;
  if p_data > v_hoje + 90 then raise exception 'Dá para pedir a pré-reserva até 90 dias antes.'; end if;
  if p_data = v_hoje and v_agora::time >= time '16:00' then
    raise exception 'Para hoje, a pré-reserva pelo link vai até as 16h. Fale com a equipe do Ditado.';
  end if;
  if p_pessoas is null or p_pessoas < 1 then raise exception 'Informe quantas pessoas.'; end if;
  if p_pessoas > 20 then raise exception 'Acima de 20 pessoas é evento: fale com a equipe do Ditado.'; end if;
  if v_local not in ('interna', 'varanda', 'deck', 'mezanino', 'outros') then v_local := 'outros'; end if;
  if v_obs is not null and length(v_obs) > 300 then v_obs := left(v_obs, 300); end if;

  -- envio repetido e enxurrada de pedidos
  if exists (select 1 from reservas_normais where origem = 'link' and situacao = 'pre_reserva'
             and regexp_replace(telefone_cliente, '\D', '', 'g') like '%' || v_dig and data_reserva = p_data) then
    raise exception 'Já recebemos uma pré-reserva sua para esse dia. A equipe vai falar com você pelo WhatsApp.';
  end if;
  if (select count(*) from reservas_normais where origem = 'link'
      and regexp_replace(telefone_cliente, '\D', '', 'g') like '%' || v_dig and criado_em > now() - interval '1 day') >= 3 then
    raise exception 'Muitos pedidos deste número hoje. Fale com a equipe do Ditado.';
  end if;
  if (select count(*) from reservas_normais where origem = 'link' and criado_em > now() - interval '10 minutes') >= 30 then
    raise exception 'Muitos pedidos agora. Tente de novo em alguns minutos.';
  end if;

  insert into reservas_normais (nome_cliente, telefone_cliente, data_reserva, horario, numero_pessoas, local_bar, observacoes, situacao, origem)
  values (v_nome, '(' || substr(v_dig, 1, 2) || ') ' || substr(v_dig, 3, length(v_dig) - 6) || '-' || right(v_dig, 4),
          p_data, p_horario, p_pessoas, v_local, v_obs, 'pre_reserva', 'link');
  return jsonb_build_object('ok', true, 'data', p_data, 'horario', to_char(p_horario, 'HH24:MI'), 'pessoas', p_pessoas);
end $$;

revoke all on function public.fn_reserva_publica(text, text, date, time, int, text, text) from public;
grant execute on function public.fn_reserva_publica(text, text, date, time, int, text, text) to anon, authenticated;
