-- Ponto dos extras com GPS e selfie (Kadu, 28/11/2026).
-- Regra: a partir de 28/11/2026, diária de extra só vale com chegada e saída marcadas pelo link (GPS a até 150 m do
-- Ditado + selfie na chegada) e confirmação do gerente ou do Cristiano. Sem confirmação não nasce conta a pagar e não
-- entra pagamento. Exceção: marcar à mão, com motivo, que fica registrado.
-- O link é pessoal da diária, enviado pelo Portal do Gerente; vence às 6h do dia seguinte. A página do link fala só
-- com a função do servidor "extra-ponto" (service_role): nenhuma tabela nova fica aberta para visitante.
-- Diárias de antes de 28/11 não mudam.

-- 1. Configuração (um registro): local do Ditado (OpenStreetMap, "Ditado Popular, Rua Senador Villas Boas"), raio e início
create table public.extras_ponto_config (
  id int primary key default 1 check (id = 1),
  lat double precision not null,
  lng double precision not null,
  raio_m int not null default 150,
  precisao_max_m int not null default 100,
  inicio date not null,
  atualizado_em timestamptz not null default now()
);
insert into public.extras_ponto_config (lat, lng, raio_m, precisao_max_m, inicio)
values (-15.5937613, -56.1053798, 150, 100, date '2026-11-28');

-- 2. Ponto de cada diária (1 para 1)
create table public.extras_ponto (
  diaria_id uuid primary key references public.extras_freelancers(id) on delete cascade,
  token text not null unique default encode(extensions.gen_random_bytes(18), 'hex'),
  dispositivo text,
  dispositivo_alerta boolean not null default false,
  entrada_em timestamptz, entrada_lat double precision, entrada_lng double precision,
  entrada_precisao_m double precision, entrada_dist_m int, entrada_selfie text,
  saida_em timestamptz, saida_lat double precision, saida_lng double precision,
  saida_precisao_m double precision, saida_dist_m int,
  confirmado_em timestamptz, confirmado_por text, confirmado_modo text check (confirmado_modo in ('gps', 'manual')),
  motivo text,
  link_enviado_em timestamptz, link_enviado_por text,
  criado_em timestamptz not null default now()
);

-- 3. Todas as tentativas (aceitas e recusadas), para auditoria
create table public.extras_ponto_tentativas (
  id uuid primary key default gen_random_uuid(),
  diaria_id uuid references public.extras_freelancers(id) on delete cascade,
  acao text not null,
  lat double precision, lng double precision, precisao_m double precision, dist_m int,
  dispositivo text, aceito boolean not null, recusa text, user_agent text,
  criado_em timestamptz not null default now()
);
create index extras_ponto_tentativas_diaria on public.extras_ponto_tentativas (diaria_id, criado_em);

alter table public.extras_ponto_config enable row level security;
alter table public.extras_ponto enable row level security;
alter table public.extras_ponto_tentativas enable row level security;
revoke all on public.extras_ponto_config, public.extras_ponto, public.extras_ponto_tentativas from anon, authenticated;
grant select on public.extras_ponto_config, public.extras_ponto, public.extras_ponto_tentativas to authenticated;
create policy extras_ponto_config_ler on public.extras_ponto_config for select to authenticated using (true);
create policy extras_ponto_ler on public.extras_ponto for select to authenticated using (true);
create policy extras_ponto_tentativas_ler on public.extras_ponto_tentativas for select to authenticated using (true);

-- 4. Selfies: pasta fechada; só logado vê; quem grava é a função do servidor
insert into storage.buckets (id, name, public) values ('extras-selfies', 'extras-selfies', false)
on conflict (id) do nothing;
create policy extras_selfies_ler on storage.objects for select to authenticated using (bucket_id = 'extras-selfies');

-- 5. Quem confirma: gerente/admin/master, ou quem tem o módulo Extras ou o Livro da Noite
create or replace function public.fn_extras_ponto_pode()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select u.ativo and (u.nivel in ('admin', 'master') or exists (
      select 1 from permissoes_usuario p join modulos_sistema m on m.id = p.modulo_id
       where p.usuario_id = u.id and m.slug in ('extras', 'livro') and p.aba_id is null and p.pode_visualizar))
    from usuarios_sistema u where u.id = fn_usuario_sistema_id()), false)
$$;

-- 6. Link da diária (cria o ponto se não existir)
create or replace function public.fn_extra_ponto_link(p_diaria uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_d extras_freelancers; v_p extras_ponto; v_nome text; v_tel text;
begin
  if not fn_extras_ponto_pode() then raise exception 'Sem acesso ao ponto dos extras.'; end if;
  select * into v_d from extras_freelancers where id = p_diaria;
  if not found then raise exception 'Diária não encontrada.'; end if;
  if v_d.presenca = 'faltou' or v_d.status_pagamento = 'cancelado' then raise exception 'Diária marcada como falta ou cancelada.'; end if;
  if v_d.data_trabalho < (select inicio from extras_ponto_config) then raise exception 'O ponto vale para diárias a partir de %.', to_char((select inicio from extras_ponto_config), 'DD/MM/YYYY'); end if;
  insert into extras_ponto (diaria_id) values (p_diaria) on conflict (diaria_id) do nothing;
  update extras_ponto set link_enviado_em = now(), link_enviado_por = fn_usuario_nome() where diaria_id = p_diaria returning * into v_p;
  select coalesce(p.nome, v_d.nome), coalesce(nullif(p.telefone, ''), v_d.telefone) into v_nome, v_tel
    from (select 1) x left join extras_pessoas p on p.id = v_d.pessoa_id;
  return jsonb_build_object('token', v_p.token, 'nome', v_nome, 'telefone', v_tel, 'funcao', v_d.funcao_temporaria,
                            'data', v_d.data_trabalho, 'valor', v_d.valor_diaria);
end $$;

-- 7. Trava: a partir do início, presença "confirmada" só pela função de confirmar
create or replace function public.fn_extra_trava_presenca()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.presenca = 'confirmada'
     and (tg_op = 'INSERT' or old.presenca is distinct from 'confirmada')
     and new.data_trabalho >= (select inicio from extras_ponto_config)
     and coalesce(current_setting('ditado.extra_confirmar', true), '') <> '1' then
    raise exception 'Desde 28/11 a presença do extra só é confirmada pelo ponto (chegada e saída pelo link, ou marcar à mão com motivo).';
  end if;
  return new;
end $$;
create trigger trg_extra_a_trava_presenca before insert or update of presenca on public.extras_freelancers
  for each row execute function public.fn_extra_trava_presenca();

-- 8. Confirmar (pelo GPS ou à mão com motivo); valor diferente da diária exige motivo
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
    raise exception 'Falta % pelo link. Sem isso, só marcando à mão com motivo.', case when v_p.entrada_em is null then 'a chegada' else 'a saída' end;
  end if;
  if p_manual and coalesce(length(v_motivo), 0) < 5 then raise exception 'Escreva o motivo de marcar à mão.'; end if;
  if p_valor is not null and round(p_valor, 2) <> round(v_d.valor_diaria, 2) then
    if p_valor <= 0 then raise exception 'Valor inválido.'; end if;
    if coalesce(length(v_motivo), 0) < 5 then raise exception 'Escreva o motivo de mudar o valor.'; end if;
  end if;
  update extras_ponto set confirmado_em = now(), confirmado_por = fn_usuario_nome(),
         confirmado_modo = case when p_manual then 'manual' else 'gps' end, motivo = v_motivo
   where diaria_id = p_diaria;
  perform set_config('ditado.extra_confirmar', '1', true);
  update extras_freelancers set presenca = 'confirmada', valor_diaria = coalesce(round(p_valor, 2), valor_diaria)
   where id = p_diaria;
  perform set_config('ditado.extra_confirmar', '', true);
  return jsonb_build_object('ok', true);
end $$;

-- 9. Desfazer confirmação (só sem pagamento): volta a prevista e a conta sai do financeiro
create or replace function public.fn_extra_desconfirmar(p_diaria uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_d extras_freelancers;
begin
  if not fn_extras_ponto_pode() then raise exception 'Sem acesso.'; end if;
  select * into v_d from extras_freelancers where id = p_diaria for update;
  if not found or v_d.presenca <> 'confirmada' then raise exception 'Diária não está confirmada.'; end if;
  if coalesce(v_d.valor_pago, 0) > 0 then raise exception 'Diária já tem pagamento: estorne antes.'; end if;
  update extras_ponto set confirmado_em = null, confirmado_por = null, confirmado_modo = null where diaria_id = p_diaria;
  update extras_freelancers set presenca = 'prevista' where id = p_diaria;
  return jsonb_build_object('ok', true);
end $$;

revoke execute on function public.fn_extras_ponto_pode(), public.fn_extra_ponto_link(uuid),
  public.fn_extra_confirmar(uuid, boolean, text, numeric), public.fn_extra_desconfirmar(uuid) from public, anon;
grant execute on function public.fn_extras_ponto_pode(), public.fn_extra_ponto_link(uuid),
  public.fn_extra_confirmar(uuid, boolean, text, numeric), public.fn_extra_desconfirmar(uuid) to authenticated, service_role;

-- 10. Conta a pagar: a partir do início, nasce só com a diária confirmada (antes: ao lançar)
create or replace function public.fn_extra_conta_pagar()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_forn uuid;
  v_cat uuid;
  v_nome text;
  v_desc text;
begin
  if not new.gera_conta or coalesce(new.valor_diaria, 0) <= 0 then return new; end if;

  if new.status_pagamento = 'cancelado' then
    if new.conta_pagar_id is not null then
      delete from contas_pagar where id = new.conta_pagar_id and coalesce(valor_pago, 0) = 0;
      if not found then return new; end if;
      new.conta_pagar_id := null;
    end if;
    return new;
  end if;

  -- Ponto (28/11/2026): diária não confirmada não tem conta; se tiver e não houver pagamento, sai
  if new.data_trabalho >= (select inicio from extras_ponto_config) and new.presenca is distinct from 'confirmada' then
    if new.conta_pagar_id is not null then
      delete from contas_pagar where id = new.conta_pagar_id and coalesce(valor_pago, 0) = 0;
      if found then new.conta_pagar_id := null; end if;
    end if;
    return new;
  end if;

  if new.pessoa_id is not null then
    select fornecedor_id, nome into v_forn, v_nome from extras_pessoas where id = new.pessoa_id;
  end if;
  v_nome := coalesce(v_nome, new.nome);
  if v_forn is null then
    select id into v_forn from fornecedores
     where lower(unaccent(btrim(nome))) = lower(unaccent(btrim(v_nome))) and tipo in ('extra', 'rh') and status = 'ativo' limit 1;
    if v_forn is null then
      insert into fornecedores (nome, telefone, status, tipo, observacoes)
      values (v_nome, new.telefone, 'ativo', 'extra', 'Extra (diarista), cadastrado pelo modulo Extras')
      returning id into v_forn;
    end if;
    if new.pessoa_id is not null then update extras_pessoas set fornecedor_id = v_forn where id = new.pessoa_id; end if;
  end if;

  select categoria_financeira_id into v_cat from extras_tipos where id = new.tipo_id;
  v_cat := coalesce(v_cat, '6f030239-f3df-4ecd-a5c6-2aaa3992669b');
  v_desc := 'Extra: ' || v_nome || ' - ' || coalesce(new.funcao_temporaria, '') || ' - ' || to_char(new.data_trabalho, 'DD/MM/YYYY');

  if new.conta_pagar_id is null then
    insert into contas_pagar (fornecedor_id, descricao, categoria_id, valor_total, valor_original, valor_final, valor_pago,
                              data_vencimento, data_emissao, status, tipo_pagamento, origem_modulo, origem_id)
    values (v_forn, v_desc, v_cat, new.valor_diaria, new.valor_diaria, new.valor_diaria, 0,
            new.data_trabalho, current_date, 'em_aberto', 'unica', 'outros', new.id)
    returning id into new.conta_pagar_id;
  else
    update contas_pagar
       set fornecedor_id = v_forn, descricao = v_desc, categoria_id = v_cat,
           valor_total = new.valor_diaria, valor_original = new.valor_diaria, valor_final = new.valor_diaria,
           data_vencimento = new.data_trabalho, atualizado_em = now()
     where id = new.conta_pagar_id;
  end if;
  return new;
end $function$;

-- 11. Pagamento no módulo: a partir do início, só de diária confirmada
create or replace function public.fn_extra_pagamento_so_confirmada()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_d extras_freelancers;
begin
  if new.tipo is distinct from 'pagamento' then return new; end if;
  select * into v_d from extras_freelancers where id = new.extra_id;
  if v_d.data_trabalho >= (select inicio from extras_ponto_config) and v_d.presenca is distinct from 'confirmada' then
    raise exception 'Diária de % ainda não confirmada pelo ponto: não dá para pagar.', to_char(v_d.data_trabalho, 'DD/MM');
  end if;
  return new;
end $$;
create trigger trg_extra_pagamento_so_confirmada before insert on public.extras_pagamentos
  for each row execute function public.fn_extra_pagamento_so_confirmada();
