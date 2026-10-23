-- Extras (diaristas): sai do RH e vira modulo de Gestao.
--
-- extras_tipos     tabela de valores: tipo, setor, diaria e subcategoria do
--                  Financeiro (Extra - Bar, Extra - Cozinha...).
-- extras_pessoas   cadastro de quem faz extra (nome, telefone, PIX, tipo).
-- extras_freelancers  continua sendo a diaria lancada, agora com pessoa,
--                  tipo, presenca, quem lancou e quem pediu.
-- extras_pagamentos controle proprio de pagamento (parcial, lote, estorno),
--                  igual ao de Musicos: nao da baixa no Financeiro.
--
-- Cada diaria nova gera a sua conta a pagar na subcategoria do tipo
-- (origem_modulo 'outros', ligada por conta_pagar_id). Os lancamentos antigos
-- nao geram conta. Diaria marcada "faltou" fica cancelada e a conta sai do
-- Financeiro (se ainda nao foi paga la).
--
-- Texto com acento vai em U&'' para o arquivo ficar so em ASCII.

-- Seguranca: a tabela estava aberta para quem nao fez login.
alter policy "Allow all operations on extras_freelancers" on public.extras_freelancers to authenticated;

create table if not exists public.extras_tipos (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  setor text not null,
  valor_diaria numeric(10,2) not null check (valor_diaria > 0),
  categoria_financeira_id uuid references public.categorias_financeiras(id),
  ativo boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);

create table if not exists public.extras_pessoas (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  pix text,
  tipo_id uuid references public.extras_tipos(id),
  valor_diaria numeric(10,2),
  fornecedor_id uuid references public.fornecedores(id),
  observacoes text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists extras_pessoas_nome_idx on public.extras_pessoas (lower(nome));

alter table public.extras_freelancers
  add column if not exists pessoa_id uuid references public.extras_pessoas(id),
  add column if not exists tipo_id uuid references public.extras_tipos(id),
  add column if not exists valor_pago numeric(10,2) not null default 0,
  add column if not exists saldo_restante numeric(10,2) not null default 0,
  add column if not exists presenca text not null default 'prevista',
  add column if not exists pedido_por text,
  add column if not exists lancado_por_nome text,
  add column if not exists gera_conta boolean not null default false,
  add column if not exists conta_pagar_id uuid;
alter table public.extras_freelancers alter column gera_conta set default true;
alter table public.extras_freelancers add constraint extras_presenca_check check (presenca in ('prevista', 'confirmada', 'faltou'));
create index if not exists extras_freelancers_data_idx on public.extras_freelancers (data_trabalho);
create index if not exists extras_freelancers_pessoa_idx on public.extras_freelancers (pessoa_id);

create table if not exists public.extras_pagamentos (
  id uuid primary key default gen_random_uuid(),
  extra_id uuid not null references public.extras_freelancers(id) on delete cascade,
  tipo text not null default 'pagamento' check (tipo in ('pagamento', 'saldo_inicial')),
  valor numeric(10,2) not null check (valor > 0),
  data_pagamento date not null default current_date,
  forma text,
  observacao text,
  lote uuid,
  criado_por uuid,
  criado_por_nome text,
  criado_em timestamptz not null default now(),
  estornado_em timestamptz,
  estornado_por_nome text,
  motivo_estorno text
);
create index if not exists extras_pagamentos_extra_idx on public.extras_pagamentos (extra_id);

alter table public.extras_tipos enable row level security;
alter table public.extras_pessoas enable row level security;
alter table public.extras_pagamentos enable row level security;
create policy extras_tipos_autenticado on public.extras_tipos for all to authenticated using (true) with check (true);
create policy extras_pessoas_autenticado on public.extras_pessoas for all to authenticated using (true) with check (true);
create policy extras_pagamentos_autenticado on public.extras_pagamentos for all to authenticated using (true) with check (true);

-- Tabela de valores inicial: o valor mais usado de cada funcao desde junho.
insert into public.extras_tipos (nome, setor, valor_diaria, categoria_financeira_id, ordem) values
  ('Barman', 'Bar', 120, 'f867b394-d8c5-4e59-aacf-e02f0078fbca', 1),
  ('Auxiliar de cozinha', 'Cozinha', 120, 'eff211e3-e096-40b8-8854-3b7d1ef888f7', 2),
  ('Passador', 'Cozinha', 120, 'e39e5a83-fe45-4f3e-a8a2-0a5806f73085', 3),
  ('Feijoada', 'Cozinha', 160, 'ae5f2dff-2ea4-4b8f-a9e9-7bbe8e3f2906', 4),
  (U&'Seguran\00E7a', U&'Seguran\00E7a', 150, '2c6658df-ab7a-4398-9b0e-bc6af11556ee', 5),
  (U&'Gar\00E7om', U&'Sal\00E3o', 120, '6f030239-f3df-4ecd-a5c6-2aaa3992669b', 6),
  ('Auxiliar geral', U&'Sal\00E3o', 160, '6f030239-f3df-4ecd-a5c6-2aaa3992669b', 7),
  ('Recepcionista', U&'Recep\00E7\00E3o', 120, '6f030239-f3df-4ecd-a5c6-2aaa3992669b', 8),
  ('Limpeza', 'Limpeza', 120, '6f030239-f3df-4ecd-a5c6-2aaa3992669b', 9),
  ('Outros', U&'Sal\00E3o', 120, '6f030239-f3df-4ecd-a5c6-2aaa3992669b', 10);

-- Tipo de cada diaria antiga, pela funcao digitada.
update public.extras_freelancers e set tipo_id = t.id
  from public.extras_tipos t
 where e.tipo_id is null and t.nome = case
   when e.funcao_temporaria ilike 'barman%' then 'Barman'
   when e.funcao_temporaria ilike 'auxiliar de cozinha%' then 'Auxiliar de cozinha'
   when e.funcao_temporaria ilike 'seguran%' then U&'Seguran\00E7a'
   when e.funcao_temporaria ilike 'gar%om%' then U&'Gar\00E7om'
   when e.funcao_temporaria ilike 'auxiliar geral%' then 'Auxiliar geral'
   when e.funcao_temporaria ilike 'recepcion%' then 'Recepcionista'
   when e.funcao_temporaria ilike 'limpeza%' then 'Limpeza'
   when e.funcao_temporaria ilike 'outros%' then 'Outros'
 end;

-- Pessoas: um cadastro por nome (sem diferenca de maiuscula e espaco). Nomes
-- parecidos mas diferentes ficam separados ate o dono confirmar a juncao.
insert into public.extras_pessoas (nome, telefone, tipo_id)
select initcap(min(n.nome)), (array_agg(n.telefone order by n.data_trabalho desc) filter (where coalesce(n.telefone, '') <> ''))[1],
       mode() within group (order by n.tipo_id)
  from (select regexp_replace(btrim(nome), '\s+', ' ', 'g') nome, telefone, data_trabalho, tipo_id from public.extras_freelancers) n
 group by lower(n.nome);

update public.extras_freelancers e set pessoa_id = p.id
  from public.extras_pessoas p
 where e.pessoa_id is null and lower(regexp_replace(btrim(e.nome), '\s+', ' ', 'g')) = lower(p.nome);

-- Saldo e situacao da diaria. Faltou ou cancelado nao deve nada.
create or replace function public.fn_extra_calcular()
returns trigger
language plpgsql
as $function$
begin
  if tg_op = 'INSERT' then
    new.criado_por := coalesce(new.criado_por, auth.uid());
    new.lancado_por_nome := coalesce(new.lancado_por_nome, fn_usuario_nome());
  end if;
  if new.presenca = 'faltou' then new.status_pagamento := 'cancelado'; end if;
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

create or replace function public.fn_extra_somar_pagamentos()
returns trigger
language plpgsql
as $function$
declare
  v_id uuid := coalesce(new.extra_id, old.extra_id);
begin
  update public.extras_freelancers
     set valor_pago = coalesce((select sum(valor) from public.extras_pagamentos where extra_id = v_id and estornado_em is null), 0)
   where id = v_id;
  return null;
end $function$;

-- Ponto de partida: o que estava pago entra como saldo inicial.
insert into public.extras_pagamentos (extra_id, tipo, valor, data_pagamento, observacao, criado_por_nome)
select id, 'saldo_inicial', valor_diaria, coalesce(least(data_pagamento, current_date), data_trabalho),
       'Marcado como pago antes do controle de pagamentos', 'Sistema'
  from public.extras_freelancers
 where status_pagamento = 'pago' and valor_diaria > 0;

update public.extras_freelancers e
   set valor_pago = coalesce((select sum(p.valor) from public.extras_pagamentos p where p.extra_id = e.id and p.estornado_em is null), 0),
       saldo_restante = valor_diaria - coalesce((select sum(p.valor) from public.extras_pagamentos p where p.extra_id = e.id and p.estornado_em is null), 0);

create or replace trigger trg_extra_calcular
  before insert or update on public.extras_freelancers
  for each row execute function public.fn_extra_calcular();

create or replace trigger trg_extra_somar_pagamentos
  after insert or update or delete on public.extras_pagamentos
  for each row execute function public.fn_extra_somar_pagamentos();

-- Conta a pagar da diaria (so as novas). Fornecedor: um por pessoa, tipo rh.
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

  -- Faltou ou cancelada: o Financeiro nao deixa conta cancelada (o status e
  -- recalculado pelo pago), entao a conta sai, se ainda nao foi paga la.
  if new.status_pagamento = 'cancelado' then
    if new.conta_pagar_id is not null then
      delete from contas_pagar where id = new.conta_pagar_id and coalesce(valor_pago, 0) = 0;
      if not found then return new; end if;
      new.conta_pagar_id := null;
    end if;
    return new;
  end if;

  if new.pessoa_id is not null then
    select fornecedor_id, nome into v_forn, v_nome from extras_pessoas where id = new.pessoa_id;
  end if;
  v_nome := coalesce(v_nome, new.nome);
  if v_forn is null then
    select id into v_forn from fornecedores where lower(btrim(nome)) = lower(btrim(v_nome)) and tipo = 'rh' limit 1;
    if v_forn is null then
      insert into fornecedores (nome, telefone, status, tipo, observacoes)
      values (v_nome, new.telefone, 'ativo', 'rh', 'Extra (diarista), cadastrado pelo modulo Extras')
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

create or replace trigger trg_extra_conta_pagar
  before insert or update of valor_diaria, data_trabalho, tipo_id, pessoa_id, status_pagamento, presenca, nome, funcao_temporaria
  on public.extras_freelancers
  for each row execute function public.fn_extra_conta_pagar();

-- Excluir a diaria: a conta sai junto se o Financeiro ainda nao pagou nada;
-- se pagou, fica cancelada para nao sumir dinheiro do Financeiro.
create or replace function public.fn_extra_excluir_conta()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.conta_pagar_id is not null then
    delete from contas_pagar where id = old.conta_pagar_id and coalesce(valor_pago, 0) = 0;
    update contas_pagar set status = 'cancelado', atualizado_em = now() where id = old.conta_pagar_id;
  end if;
  return old;
end $function$;

create or replace trigger trg_extra_excluir_conta
  before delete on public.extras_freelancers
  for each row execute function public.fn_extra_excluir_conta();

-- Pagamentos (controle proprio).
create or replace function public.fn_extra_pagar(
  p_extra uuid, p_valor numeric, p_data date default current_date, p_forma text default null, p_obs text default null)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_e extras_freelancers;
begin
  if auth.uid() is null then raise exception 'Faca login para lancar pagamento.'; end if;
  select * into v_e from extras_freelancers where id = p_extra;
  if not found then raise exception 'Diaria nao encontrada.'; end if;
  if v_e.status_pagamento = 'cancelado' then raise exception 'Diaria cancelada nao recebe pagamento.'; end if;
  if coalesce(p_valor, 0) <= 0 then raise exception 'Informe um valor maior que zero.'; end if;
  insert into extras_pagamentos (extra_id, valor, data_pagamento, forma, observacao, criado_por, criado_por_nome)
  values (p_extra, round(p_valor, 2), coalesce(p_data, current_date), nullif(btrim(p_forma), ''), nullif(btrim(p_obs), ''),
          auth.uid(), fn_usuario_nome());
  select * into v_e from extras_freelancers where id = p_extra;
  return jsonb_build_object('valor_pago', v_e.valor_pago, 'saldo', v_e.saldo_restante, 'status', v_e.status_pagamento);
end $function$;

create or replace function public.fn_extra_estornar(p_pagamento uuid, p_motivo text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_p extras_pagamentos;
  v_e extras_freelancers;
begin
  if auth.uid() is null then raise exception 'Faca login para estornar.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo do estorno.'; end if;
  update extras_pagamentos
     set estornado_em = now(), estornado_por_nome = fn_usuario_nome(), motivo_estorno = btrim(p_motivo)
   where id = p_pagamento and estornado_em is null
  returning * into v_p;
  if v_p.id is null then raise exception 'Pagamento nao encontrado ou ja estornado.'; end if;
  select * into v_e from extras_freelancers where id = v_p.extra_id;
  return jsonb_build_object('valor_pago', v_e.valor_pago, 'saldo', v_e.saldo_restante, 'status', v_e.status_pagamento);
end $function$;

create or replace function public.fn_extra_pagar_lote(
  p_extras uuid[], p_valor numeric, p_data date default current_date, p_forma text default null, p_obs text default null)
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
  v_n int := 0;
begin
  if auth.uid() is null then raise exception 'Faca login para lancar pagamento.'; end if;
  if v_resta <= 0 then raise exception 'Informe um valor maior que zero.'; end if;
  if coalesce(array_length(p_extras, 1), 0) = 0 then raise exception 'Escolha pelo menos uma diaria.'; end if;
  select coalesce(sum(greatest(saldo_restante, 0)), 0) into v_falta
    from extras_freelancers where id = any (p_extras) and status_pagamento <> 'cancelado';
  if v_falta <= 0 then raise exception 'Essas diarias ja estao pagas.'; end if;
  if v_resta > v_falta + 0.004 then
    raise exception 'O valor passa do que falta nessas diarias (R$ %).', translate(to_char(v_falta, 'FM999G999G990D00'), ',.', '.,');
  end if;
  v_obs := concat_ws(' . ', nullif(btrim(p_obs), ''),
    format('Pagamento conjunto de R$ %s em %s diarias', translate(to_char(v_resta, 'FM999G999G990D00'), ',.', '.,'), array_length(p_extras, 1)));
  for r in
    select id, saldo_restante falta from extras_freelancers
     where id = any (p_extras) and status_pagamento <> 'cancelado' and saldo_restante > 0
     order by data_trabalho, horario_inicio nulls last
  loop
    exit when v_resta <= 0;
    v_parte := least(v_resta, r.falta);
    insert into extras_pagamentos (extra_id, valor, data_pagamento, forma, observacao, lote, criado_por, criado_por_nome)
    values (r.id, v_parte, coalesce(p_data, current_date), nullif(btrim(p_forma), ''), v_obs, v_lote, auth.uid(), v_nome);
    v_resta := v_resta - v_parte;
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('lote', v_lote, 'diarias', v_n, 'falta_depois', v_falta - round(p_valor, 2));
end $function$;

revoke execute on function public.fn_extra_pagar(uuid, numeric, date, text, text) from public, anon;
revoke execute on function public.fn_extra_estornar(uuid, text) from public, anon;
revoke execute on function public.fn_extra_pagar_lote(uuid[], numeric, date, text, text) from public, anon;
grant execute on function public.fn_extra_pagar(uuid, numeric, date, text, text) to authenticated;
grant execute on function public.fn_extra_estornar(uuid, text) to authenticated;
grant execute on function public.fn_extra_pagar_lote(uuid[], numeric, date, text, text) to authenticated;

-- Modulo proprio, no grupo Gestao. Quem ve o RH passa a ver Extras.
insert into public.modulos_sistema (slug, nome, icone, cor, ordem, ativo)
select 'extras', 'Extras', 'UserPlus', 'from-amber-500 to-orange-600', 9, true where not exists (select 1 from public.modulos_sistema where slug = 'extras');

insert into public.permissoes_usuario (usuario_id, modulo_id, aba_id, pode_visualizar, pode_criar, pode_editar, pode_excluir, pode_aprovar)
select p.usuario_id, (select id from public.modulos_sistema where slug = 'extras'), null,
       bool_or(p.pode_visualizar), bool_or(p.pode_criar), bool_or(p.pode_editar), bool_or(p.pode_excluir), bool_or(p.pode_aprovar)
  from public.permissoes_usuario p
 where p.modulo_id = (select id from public.modulos_sistema where slug = 'rh') and p.pode_visualizar
   and not exists (select 1 from public.permissoes_usuario x where x.usuario_id = p.usuario_id
                    and x.modulo_id = (select id from public.modulos_sistema where slug = 'extras'))
 group by p.usuario_id;
