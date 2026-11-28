-- Ponto dos extras, liberação (Kadu, 28/11/2026, opção A): diária sem chegada e saída pelo link só vale com
-- liberação do Kadu (nível master), pelo login dele. Gerente e Cristiano não marcam mais "à mão": pedem a
-- liberação com motivo, e a diária fica "aguardando o Kadu" (sem conta no financeiro e sem pagamento).

alter table public.extras_ponto
  add column liberacao_status text check (liberacao_status in ('pendente', 'liberada', 'recusada')),
  add column liberacao_pedida_em timestamptz,
  add column liberacao_pedida_por text,
  add column liberacao_motivo text,
  add column liberacao_valor numeric,
  add column liberacao_decidida_em timestamptz,
  add column liberacao_decidida_por text,
  add column liberacao_obs text;

create or replace function public.fn_eh_master()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select u.ativo and u.nivel = 'master' from usuarios_sistema u where u.id = fn_usuario_sistema_id()), false)
$$;

-- Confirmar: pelo link (gerente/Cristiano) ou à mão (só master)
create or replace function public.fn_extra_confirmar(p_diaria uuid, p_manual boolean default false, p_motivo text default null, p_valor numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_d extras_freelancers; v_p extras_ponto; v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not fn_extras_ponto_pode() then raise exception 'Sem acesso para confirmar extra.'; end if;
  select * into v_d from extras_freelancers where id = p_diaria for update;
  if not found then raise exception 'Diária não encontrada.'; end if;
  if v_d.presenca = 'faltou' or v_d.status_pagamento = 'cancelado' then raise exception 'Diária marcada como falta ou cancelada.'; end if;
  if v_d.presenca = 'confirmada' then raise exception 'Diária já confirmada.'; end if;
  insert into extras_ponto (diaria_id) values (p_diaria) on conflict (diaria_id) do nothing;
  select * into v_p from extras_ponto where diaria_id = p_diaria;
  if not p_manual and (v_p.entrada_em is null or v_p.saida_em is null) then
    raise exception 'Falta % pelo link. Sem isso, só com liberação do Kadu.', case when v_p.entrada_em is null then 'a chegada' else 'a saída' end;
  end if;
  if p_manual and not fn_eh_master() then raise exception 'Sem chegada e saída pelo link, só o Kadu libera. Use "Pedir liberação ao Kadu".'; end if;
  if p_manual and coalesce(length(v_motivo), 0) < 5 then raise exception 'Escreva o motivo de liberar sem o ponto.'; end if;
  if p_valor is not null and round(p_valor, 2) <> round(v_d.valor_diaria, 2) then
    if p_valor <= 0 then raise exception 'Valor inválido.'; end if;
    if coalesce(length(v_motivo), 0) < 5 then raise exception 'Escreva o motivo de mudar o valor.'; end if;
  end if;
  update extras_ponto set confirmado_em = now(), confirmado_por = fn_usuario_nome(),
         confirmado_modo = case when p_manual then 'manual' else 'gps' end, motivo = v_motivo,
         liberacao_status = case when p_manual and liberacao_status = 'pendente' then 'liberada' else liberacao_status end,
         liberacao_decidida_em = case when p_manual and liberacao_status = 'pendente' then now() else liberacao_decidida_em end,
         liberacao_decidida_por = case when p_manual and liberacao_status = 'pendente' then fn_usuario_nome() else liberacao_decidida_por end
   where diaria_id = p_diaria;
  perform set_config('ditado.extra_confirmar', '1', true);
  update extras_freelancers set presenca = 'confirmada', valor_diaria = coalesce(round(p_valor, 2), valor_diaria)
   where id = p_diaria;
  perform set_config('ditado.extra_confirmar', '', true);
  return jsonb_build_object('ok', true);
end $$;

-- Gerente/Cristiano pedem a liberação ao Kadu
create or replace function public.fn_extra_pedir_liberacao(p_diaria uuid, p_motivo text, p_valor numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_d extras_freelancers; v_motivo text := nullif(btrim(coalesce(p_motivo, '')), '');
begin
  if not fn_extras_ponto_pode() then raise exception 'Sem acesso.'; end if;
  if coalesce(length(v_motivo), 0) < 5 then raise exception 'Escreva o motivo do pedido.'; end if;
  select * into v_d from extras_freelancers where id = p_diaria;
  if not found then raise exception 'Diária não encontrada.'; end if;
  if v_d.presenca <> 'prevista' then raise exception 'Só diária prevista pede liberação.'; end if;
  if v_d.data_trabalho < (select inicio from extras_ponto_config) then raise exception 'Diária anterior ao ponto.'; end if;
  insert into extras_ponto (diaria_id) values (p_diaria) on conflict (diaria_id) do nothing;
  update extras_ponto set liberacao_status = 'pendente', liberacao_pedida_em = now(), liberacao_pedida_por = fn_usuario_nome(),
         liberacao_motivo = v_motivo, liberacao_valor = case when p_valor > 0 then round(p_valor, 2) end,
         liberacao_decidida_em = null, liberacao_decidida_por = null, liberacao_obs = null
   where diaria_id = p_diaria;
  return jsonb_build_object('ok', true);
end $$;

-- Kadu decide: liberar (confirma à mão com o motivo do pedido) ou recusar
create or replace function public.fn_extra_liberar(p_diaria uuid, p_liberar boolean, p_obs text default null, p_valor numeric default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_p extras_ponto; v_obs text := nullif(btrim(coalesce(p_obs, '')), '');
begin
  if not fn_eh_master() then raise exception 'Só o Kadu libera.'; end if;
  select * into v_p from extras_ponto where diaria_id = p_diaria;
  if not found or v_p.liberacao_status is distinct from 'pendente' then raise exception 'Não há pedido de liberação para esta diária.'; end if;
  if p_liberar then
    return fn_extra_confirmar(p_diaria, true,
      'Liberado pelo Kadu. Pedido de ' || coalesce(v_p.liberacao_pedida_por, '?') || ': ' || v_p.liberacao_motivo
        || coalesce(' · ' || v_obs, ''),
      coalesce(p_valor, v_p.liberacao_valor));
  end if;
  update extras_ponto set liberacao_status = 'recusada', liberacao_decidida_em = now(), liberacao_decidida_por = fn_usuario_nome(),
         liberacao_obs = v_obs where diaria_id = p_diaria;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.fn_eh_master(), public.fn_extra_pedir_liberacao(uuid, text, numeric),
  public.fn_extra_liberar(uuid, boolean, text, numeric) from public, anon;
grant execute on function public.fn_eh_master(), public.fn_extra_pedir_liberacao(uuid, text, numeric),
  public.fn_extra_liberar(uuid, boolean, text, numeric) to authenticated, service_role;
