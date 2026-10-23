-- Pagar varios shows de uma vez (Musicos).
--
-- Um valor so, distribuido do show mais antigo para o mais novo, cobrindo o
-- saldo de cada um. Cada show ganha a sua linha no historico, todas com o
-- mesmo lote, para se ver que sairam de um pagamento so. Nao passa do total
-- que falta (pagamento a mais se lanca show a show).

alter table public.musicos_pagamentos add column if not exists lote uuid;
create index if not exists musicos_pagamentos_lote_idx on public.musicos_pagamentos (lote) where lote is not null;

create or replace function public.fn_musico_pagar_lote(
  p_musicos uuid[], p_valor numeric, p_data date default current_date, p_forma text default null, p_obs text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lote uuid := gen_random_uuid();
  v_resta numeric := round(coalesce(p_valor, 0), 2);
  v_falta numeric;
  v_parte numeric;
  v_nome text := fn_usuario_nome();
  v_obs text;
  r record;
  v_itens jsonb := '[]'::jsonb;
begin
  if auth.uid() is null then raise exception 'Faca login para lancar pagamento.'; end if;
  if v_resta <= 0 then raise exception 'Informe um valor maior que zero.'; end if;
  if coalesce(array_length(p_musicos, 1), 0) = 0 then raise exception 'Escolha pelo menos um show.'; end if;

  select coalesce(sum(greatest(valor_total_final - coalesce(valor_pago, 0), 0)), 0) into v_falta
    from musicos where id = any (p_musicos) and status_pagamento <> 'cancelado';
  if v_falta <= 0 then raise exception 'Esses shows ja estao pagos.'; end if;
  if v_resta > v_falta + 0.004 then
    raise exception 'O valor passa do que falta nesses shows (R$ %).', translate(to_char(v_falta, 'FM999G999G990D00'), ',.', '.,');
  end if;

  v_obs := concat_ws(' . ', nullif(btrim(p_obs), ''),
    format('Pagamento conjunto de R$ %s em %s shows', translate(to_char(v_resta, 'FM999G999G990D00'), ',.', '.,'), array_length(p_musicos, 1)));

  for r in
    select id, nome, data_evento, greatest(valor_total_final - coalesce(valor_pago, 0), 0) falta
      from musicos
     where id = any (p_musicos) and status_pagamento <> 'cancelado'
       and valor_total_final - coalesce(valor_pago, 0) > 0
     order by data_evento, horario_inicio nulls last
  loop
    exit when v_resta <= 0;
    v_parte := least(v_resta, r.falta);
    insert into musicos_pagamentos (musico_id, valor, data_pagamento, forma, observacao, criado_por, criado_por_nome, lote)
    values (r.id, v_parte, coalesce(p_data, current_date), nullif(btrim(p_forma), ''), v_obs, auth.uid(), v_nome, v_lote);
    v_resta := v_resta - v_parte;
    v_itens := v_itens || jsonb_build_object('id', r.id, 'data', r.data_evento::date, 'valor', v_parte, 'quitado', v_parte >= r.falta);
  end loop;

  return jsonb_build_object('lote', v_lote, 'itens', v_itens, 'falta_depois', v_falta - round(p_valor, 2));
end $function$;

revoke execute on function public.fn_musico_pagar_lote(uuid[], numeric, date, text, text) from public, anon;
grant execute on function public.fn_musico_pagar_lote(uuid[], numeric, date, text, text) to authenticated;
