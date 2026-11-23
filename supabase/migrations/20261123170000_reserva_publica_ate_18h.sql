-- Pré-reserva pelo link (ditado.org/reserva): para o mesmo dia, aceita até as 18h (antes 16h). Kadu, 23/11/2026.
CREATE OR REPLACE FUNCTION public.fn_reserva_publica(p_nome text, p_telefone text, p_data date, p_horario time without time zone, p_pessoas integer, p_local text DEFAULT NULL::text, p_obs text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  if p_data = v_hoje and v_agora::time >= time '18:00' then
    raise exception 'Para hoje, a pré-reserva pelo link vai até as 18h. Fale com a equipe do Ditado.';
  end if;
  if p_pessoas is null or p_pessoas < 1 then raise exception 'Informe quantas pessoas.'; end if;
  if p_pessoas > 20 then raise exception 'Acima de 20 pessoas é evento: fale com a equipe do Ditado.'; end if;
  if v_local not in ('interna', 'varanda', 'deck', 'mezanino', 'outros') then v_local := 'outros'; end if;
  if v_obs is not null and length(v_obs) > 300 then v_obs := left(v_obs, 300); end if;

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
end $function$;
