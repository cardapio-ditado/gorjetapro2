-- Extras: desfazer "faltou" volta a diaria para a conta, e juntar dois
-- cadastros da mesma pessoa (nomes escritos diferente).

create or replace function public.fn_extra_calcular()
returns trigger
language plpgsql
as $function$
begin
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(new.criado_por, auth.uid());
    new.lancado_por_nome := coalesce(new.lancado_por_nome, fn_usuario_nome());
  end if;
  if new.presenca = 'faltou' then
    new.status_pagamento := 'cancelado';
  elsif tg_op = 'UPDATE' and old.presenca = 'faltou' and new.status_pagamento = 'cancelado' then
    new.status_pagamento := 'pendente';
  end if;
  new.saldo_restante := coalesce(new.valor_diaria, 0) - coalesce(new.valor_pago, 0);
  if new.status_pagamento = 'cancelado' then
    return new;
  end if;
  new.status_pagamento := case when new.saldo_restante <= 0 and coalesce(new.valor_diaria, 0) > 0 then 'pago' else 'pendente' end;
  new.data_pagamento := case when new.status_pagamento = 'pago'
    then coalesce((select max(data_pagamento) from extras_pagamentos where extra_id = new.id and estornado_em is null), new.data_pagamento)
    else null end;
  return new;
end $function$;

-- As diarias de p_de passam para p_para; telefone e PIX que faltarem no
-- cadastro que fica vem do outro. O cadastro p_de fica inativo, marcado com
-- quem ficou (juntado_com), para o registro nao sumir.
alter table public.extras_pessoas add column if not exists juntado_com uuid references public.extras_pessoas(id);

create or replace function public.fn_extras_juntar_pessoas(p_de uuid, p_para uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_de extras_pessoas;
  v_n int;
begin
  if auth.uid() is null then raise exception 'Faca login para juntar cadastros.'; end if;
  if p_de = p_para then raise exception 'Escolha dois cadastros diferentes.'; end if;
  select * into v_de from extras_pessoas where id = p_de;
  if not found or not exists (select 1 from extras_pessoas where id = p_para) then raise exception 'Cadastro nao encontrado.'; end if;
  update extras_pessoas
     set telefone = coalesce(nullif(telefone, ''), v_de.telefone), pix = coalesce(nullif(pix, ''), v_de.pix),
         tipo_id = coalesce(tipo_id, v_de.tipo_id), valor_diaria = coalesce(valor_diaria, v_de.valor_diaria),
         fornecedor_id = coalesce(fornecedor_id, v_de.fornecedor_id),
         observacoes = concat_ws(' . ', nullif(observacoes, ''), nullif(v_de.observacoes, ''))
   where id = p_para;
  update extras_freelancers set pessoa_id = p_para where pessoa_id = p_de;
  get diagnostics v_n = row_count;
  update extras_pessoas set ativo = false, juntado_com = p_para where id = p_de;
  return jsonb_build_object('diarias', v_n);
end $function$;

revoke execute on function public.fn_extras_juntar_pessoas(uuid, uuid) from public, anon;
grant execute on function public.fn_extras_juntar_pessoas(uuid, uuid) to authenticated;
