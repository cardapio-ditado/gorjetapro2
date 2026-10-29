-- Reserva a leitura da ZIG: só passa quem achar a última leitura com mais de
-- p_intervalo_ms. Devolve se reservou e a leitura anterior (para medir o atraso).
-- Substitui o update com filtro .or() na função kds-cozinha, que nunca casava
-- a linha e deixava a leitura parada.
create or replace function public.fn_kds_reservar_leitura(p_intervalo_ms integer)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_antes timestamptz;
  v_erro text;
  v_ok boolean;
begin
  select lido_em, erro into v_antes, v_erro from kds_estado where id = 1 for update;
  v_ok := v_antes is null or v_antes < now() - make_interval(secs => p_intervalo_ms / 1000.0);
  if v_ok then
    update kds_estado set lido_em = now(), atualizado_em = now() where id = 1;
  end if;
  return jsonb_build_object('reservou', v_ok, 'anterior', v_antes, 'erro', v_erro, 'agora', now());
end
$function$;
revoke execute on function public.fn_kds_reservar_leitura(integer) from public, anon, authenticated;
grant execute on function public.fn_kds_reservar_leitura(integer) to service_role;
