-- Fila de pagamentos (Kadu, 22/11/2026). Substitui a planilha diária "valores a pagar".
--
-- Uma fila só, sempre atual, com o que a casa deve:
--   * contas a pagar em aberto (fora as de diária e de show, que entram pelo módulo);
--   * diárias de extras com saldo no módulo (controle do Cristiano);
--   * shows com saldo no módulo de Músicos (desde 01/10/2026);
--   * avulsos: o que alguém colocou na fila e não está no sistema.
-- Em cima dela: os sinais de cada credor (está cobrando, prioridade, prometido para, anotação),
-- a pauta do dia (quem pediu, valor cheio ou parcial), a autorização (só o diretor = nível master)
-- e o "Paguei" (quem pagou, quando, de qual conta saiu).
--
-- A FILA NÃO DÁ BAIXA. Nada aqui escreve em contas_pagar, pagamentos_contas, fluxo_caixa,
-- extras_* ou musicos_*. O "Paguei" fica como referência para a conciliação: enquanto a baixa
-- não acontece no financeiro (ou no módulo), o valor aparece como "aguardando baixa".
--
-- Acesso: quem é master ou tem o módulo Financeiro. Tudo passa pelas funções fn_fila_*;
-- as tabelas ficam com RLS ligado e sem acesso direto de anon/authenticated.

create table public.fila_sinais (
  credor text primary key,
  cobrando boolean not null default false,
  prioridade boolean not null default false,
  prometido_para date,
  anotacao text,
  por_id uuid,
  por_nome text,
  em timestamptz not null default now()
);

create table public.fila_avulsos (
  id uuid primary key default gen_random_uuid(),
  favorecido text not null,
  fornecedor_id uuid references public.fornecedores(id),
  motivo text not null,
  valor numeric(12,2) not null check (valor > 0),
  valor_pago numeric(12,2) not null default 0,
  status text not null default 'aberto' check (status in ('aberto', 'pago', 'cancelado')),
  criado_por uuid,
  criado_por_nome text,
  criado_em timestamptz not null default now(),
  cancelado_por_nome text,
  cancelado_em timestamptz,
  motivo_cancelamento text
);

-- Ordem de pagamento: um credor, um valor, e em quais itens esse valor cai.
-- itens = [{o: origem, id, v: valor, d: descrição, data, s: saldo do item na hora do "Paguei"}]
create table public.fila_ordens (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  credor text not null,
  credor_nome text not null,
  tipo text not null,
  valor numeric(12,2) not null check (valor > 0),
  itens jsonb not null default '[]'::jsonb,
  observacao text,
  status text not null default 'pedido' check (status in ('pedido', 'autorizado', 'recusado', 'pago', 'cancelado')),
  pedido_por uuid,
  pedido_por_nome text,
  pedido_em timestamptz not null default now(),
  decidido_por uuid,
  decidido_por_nome text,
  decidido_em timestamptz,
  motivo_recusa text,
  pago_por uuid,
  pago_por_nome text,
  pago_em timestamptz,
  pago_data date,
  pago_conta_id uuid references public.bancos_contas(id),
  pago_conta_nome text,
  cancelado_por_nome text,
  cancelado_em timestamptz
);
create index fila_ordens_data_idx on public.fila_ordens (data);
create index fila_ordens_status_idx on public.fila_ordens (status);

create table public.fila_dia (
  data date primary key,
  disponivel numeric(12,2),
  por_nome text,
  em timestamptz not null default now()
);

create table public.fila_log (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  por_id uuid,
  por_nome text,
  acao text not null,
  credor text,
  ordem_id uuid,
  detalhe jsonb
);

alter table public.fila_sinais enable row level security;
alter table public.fila_avulsos enable row level security;
alter table public.fila_ordens enable row level security;
alter table public.fila_dia enable row level security;
alter table public.fila_log enable row level security;
revoke all on public.fila_sinais, public.fila_avulsos, public.fila_ordens, public.fila_dia, public.fila_log from anon, authenticated;

-- Quem está chamando: precisa ser master ou ter o módulo Financeiro. Só master autoriza.
create function public.fn_fila_quem(out uid uuid, out nome text, out autoriza boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  select u.id, u.nome_completo, u.nivel = 'master' into uid, nome, autoriza
    from usuarios_sistema u
   where u.id = fn_usuario_sistema_id() and u.ativo
     and (u.nivel = 'master' or exists (
       select 1 from permissoes_usuario pu join modulos_sistema m on m.id = pu.modulo_id
        where pu.usuario_id = u.id and m.slug = 'financeiro' and pu.aba_id is null and pu.pode_visualizar));
  if uid is null then raise exception 'sem acesso'; end if;
end $$;

-- Os itens da fila, um por conta, diária, show ou avulso. Só leitura.
create function public.fn_fila_itens()
returns table (credor text, credor_nome text, tipo text, origem text, ref_id uuid, descricao text, detalhe text, data_ref date, saldo numeric, pix text)
language sql stable set search_path = public as $$
  with hoje as (select (now() at time zone 'America/Cuiaba')::date d)
  -- contas a pagar em aberto; as de diária e as de show entram pelo módulo (controle do Cristiano)
  select 'f:' || c.fornecedor_id, btrim(fo.nome),
         case when fo.tipo = 'rh' or pai.nome = 'Equipe e Pessoal' then 'rh' else 'conta' end,
         'conta', c.id, btrim(coalesce(c.descricao, '')), btrim(cat.nome), c.data_vencimento, c.saldo_restante, fo.chave_pix
    from contas_pagar c
    join fornecedores fo on fo.id = c.fornecedor_id
    left join categorias_financeiras cat on cat.id = c.categoria_id
    left join categorias_financeiras pai on pai.id = cat.categoria_pai_id
   where c.status <> 'pago' and c.saldo_restante > 0
     and coalesce(c.origem_modulo, '') <> 'musicos'
     and not exists (select 1 from extras_freelancers e where e.conta_pagar_id = c.id)
  union all
  select 'p:' || coalesce(pp.id::text, lower(btrim(e.nome))), coalesce(pp.nome, btrim(e.nome)),
         'extra', 'extra', e.id,
         concat_ws(' · ', 'Diária ' || to_char(e.data_trabalho, 'DD/MM'), nullif(btrim(e.funcao_temporaria), '')),
         nullif(btrim(coalesce(e.pedido_por, '')), ''), e.data_trabalho, e.saldo_restante, pp.pix
    from extras_freelancers e
    left join extras_pessoas p0 on p0.id = e.pessoa_id
    left join extras_pessoas pp on pp.id = coalesce(p0.juntado_com, p0.id)
   where e.status_pagamento = 'pendente' and coalesce(e.presenca, '') <> 'faltou'
     and e.saldo_restante > 0 and e.data_trabalho <= (select d from hoje)
  union all
  select 'm:' || coalesce(m.fornecedor_id::text, lower(btrim(m.nome))), coalesce(btrim(fo.nome), btrim(m.nome)),
         'musico', 'musico', m.id,
         'Show ' || to_char(m.data_evento, 'DD/MM') || ' · ' || btrim(m.nome), null, m.data_evento::date,
         greatest(coalesce(m.saldo_restante, m.valor_total_final - coalesce(m.valor_pago, 0)), 0), fo.chave_pix
    from musicos m
    left join fornecedores fo on fo.id = m.fornecedor_id
   where m.status_pagamento <> 'pago'
     and greatest(coalesce(m.saldo_restante, m.valor_total_final - coalesce(m.valor_pago, 0)), 0) > 0
     and m.data_evento::date between date '2026-10-01' and (select d from hoje)
  union all
  select case when a.fornecedor_id is not null then 'f:' || a.fornecedor_id else 'a:' || a.id end,
         coalesce(btrim(fo.nome), a.favorecido),
         case when fo.id is null then 'avulso' when fo.tipo = 'rh' then 'rh' else 'conta' end,
         'avulso', a.id, a.motivo, 'Colocado por ' || coalesce(a.criado_por_nome, '?'),
         (a.criado_em at time zone 'America/Cuiaba')::date, a.valor - a.valor_pago, fo.chave_pix
    from fila_avulsos a
    left join fornecedores fo on fo.id = a.fornecedor_id
   where a.status = 'aberto' and a.valor - a.valor_pago > 0
$$;

-- Os itens com o que já está comprometido na fila:
--   aguardando = pago pela fila e a baixa ainda não aconteceu (o saldo do item não caiu);
--   reservado  = está numa ordem pedida ou autorizada, ainda não paga.
create function public.fn_fila_saldos()
returns table (credor text, credor_nome text, tipo text, origem text, ref_id uuid, descricao text, detalhe text, data_ref date, saldo numeric, pix text, aguardando numeric, reservado numeric)
language sql stable set search_path = public as $$
  with al as (
    select x->>'o' o, (x->>'id')::uuid id,
           coalesce(sum((x->>'v')::numeric) filter (where f.status = 'pago'), 0) pago,
           max((x->>'s')::numeric) filter (where f.status = 'pago') s0,
           coalesce(sum((x->>'v')::numeric) filter (where f.status in ('pedido', 'autorizado')), 0) res
      from fila_ordens f cross join lateral jsonb_array_elements(f.itens) x
     where f.status in ('pedido', 'autorizado', 'pago')
     group by 1, 2)
  select it.credor, it.credor_nome, it.tipo, it.origem, it.ref_id, it.descricao, it.detalhe, it.data_ref, it.saldo, it.pix,
         case when it.origem = 'avulso' then 0::numeric
              else greatest(0, least(it.saldo, coalesce(al.pago, 0) - greatest(0, coalesce(al.s0, 0) - it.saldo))) end,
         coalesce(al.res, 0)
    from fn_fila_itens() it
    left join al on al.o = it.origem and al.id = it.ref_id
$$;

-- A tela inteira numa chamada: credores com itens e sinais, a pauta do dia e o disponível.
create function public.fn_fila_ler(p_data date default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  q record;
  v_hoje date := (now() at time zone 'America/Cuiaba')::date;
  v_data date;
  r jsonb;
begin
  select * into q from fn_fila_quem();
  v_data := coalesce(p_data, v_hoje);
  select jsonb_build_object(
    'hoje', v_hoje, 'data', v_data, 'autoriza', q.autoriza, 'eu', q.nome,
    'credores', coalesce((
      select jsonb_agg(jsonb_build_object(
               'credor', g.credor, 'nome', g.nome, 'tipo', g.tipo, 'pix', g.pix,
               'saldo', g.saldo, 'aguardando', g.aguardando, 'reservado', g.reservado, 'desde', g.desde,
               'casa', case when g.tipo = 'extra' then exists (
                         select 1 from colaboradores co where co.status = 'ativo'
                            and greatest(similarity(lower(unaccent(co.nome_completo)), lower(unaccent(g.nome))),
                                         word_similarity(lower(unaccent(g.nome)), lower(unaccent(co.nome_completo)))) >= 0.75) end,
               'itens', g.itens,
               'sinal', (select jsonb_build_object('cobrando', fs.cobrando, 'prioridade', fs.prioridade,
                                'prometido_para', fs.prometido_para, 'anotacao', fs.anotacao, 'por', fs.por_nome, 'em', fs.em)
                           from fila_sinais fs where fs.credor = g.credor)) order by g.nome)
        from (
          select s.credor, max(s.credor_nome) nome,
                 case when bool_or(s.tipo = 'rh') then 'rh' when bool_or(s.tipo = 'conta') then 'conta' else max(s.tipo) end tipo,
                 max(s.pix) pix, sum(s.saldo) saldo, sum(s.aguardando) aguardando, sum(s.reservado) reservado, min(s.data_ref) desde,
                 jsonb_agg(jsonb_build_object('o', s.origem, 'id', s.ref_id, 'd', s.descricao, 'det', s.detalhe, 'data', s.data_ref,
                           'saldo', s.saldo, 'ag', s.aguardando, 'res', s.reservado) order by s.data_ref, s.descricao, s.ref_id) itens
            from fn_fila_saldos() s group by s.credor) g), '[]'::jsonb),
    'ordens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', f.id, 'data', f.data, 'credor', f.credor, 'nome', f.credor_nome, 'tipo', f.tipo, 'valor', f.valor,
               'itens', f.itens, 'obs', f.observacao, 'status', f.status, 'meu', f.pedido_por = q.uid,
               'pedido_por', f.pedido_por_nome, 'pedido_em', f.pedido_em,
               'decidido_por', f.decidido_por_nome, 'decidido_em', f.decidido_em, 'motivo_recusa', f.motivo_recusa,
               'pago_por', f.pago_por_nome, 'pago_em', f.pago_em, 'pago_data', f.pago_data, 'pago_conta', f.pago_conta_nome,
               'paguei_eu', f.pago_por = q.uid,
               'cancelado_por', f.cancelado_por_nome, 'cancelado_em', f.cancelado_em) order by f.pedido_em)
        from fila_ordens f
       where f.data = v_data
          or (v_data = v_hoje and f.data < v_hoje and f.status in ('pedido', 'autorizado'))), '[]'::jsonb),
    'dia', (select jsonb_build_object('disponivel', d.disponivel, 'por', d.por_nome, 'em', d.em) from fila_dia d where d.data = v_data),
    'contas', coalesce((select jsonb_agg(jsonb_build_object('id', b.id, 'nome', initcap(btrim(b.banco)), 'tipo', b.tipo_conta) order by btrim(lower(b.banco)))
                          from bancos_contas b where b.status = 'ativo'), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- Liga e desliga os sinais de um credor.
create function public.fn_fila_sinal(p_credor text, p_cobrando boolean, p_prioridade boolean, p_prometido_para date, p_anotacao text)
returns void
language plpgsql security definer set search_path = public as $$
declare q record;
begin
  select * into q from fn_fila_quem();
  if coalesce(btrim(p_credor), '') = '' then raise exception 'credor inválido'; end if;
  insert into fila_sinais (credor, cobrando, prioridade, prometido_para, anotacao, por_id, por_nome, em)
  values (p_credor, coalesce(p_cobrando, false), coalesce(p_prioridade, false), p_prometido_para, nullif(btrim(coalesce(p_anotacao, '')), ''), q.uid, q.nome, now())
  on conflict (credor) do update set cobrando = excluded.cobrando, prioridade = excluded.prioridade,
    prometido_para = excluded.prometido_para, anotacao = excluded.anotacao, por_id = excluded.por_id, por_nome = excluded.por_nome, em = now();
  insert into fila_log (por_id, por_nome, acao, credor, detalhe)
  values (q.uid, q.nome, 'sinal', p_credor, jsonb_build_object('cobrando', coalesce(p_cobrando, false), 'prioridade', coalesce(p_prioridade, false),
          'prometido_para', p_prometido_para, 'anotacao', nullif(btrim(coalesce(p_anotacao, '')), '')));
end $$;

-- Coloca na fila algo que não está no sistema. Extra e músico não entram por aqui: nascem no módulo.
create function public.fn_fila_avulso_criar(p_favorecido text, p_valor numeric, p_motivo text, p_fornecedor_id uuid default null)
returns text
language plpgsql security definer set search_path = public as $$
declare q record; v_id uuid; v_tipo text; v_nome text;
begin
  select * into q from fn_fila_quem();
  if p_valor is null or p_valor <= 0 then raise exception 'valor inválido'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'diga o motivo'; end if;
  if p_fornecedor_id is not null then
    select f.tipo, btrim(f.nome) into v_tipo, v_nome from fornecedores f where f.id = p_fornecedor_id;
    if v_nome is null then raise exception 'fornecedor não encontrado'; end if;
    if v_tipo in ('musico', 'extra') then
      raise exception 'extra e músico entram pelo módulo: lance a diária ou o show e aparece aqui sozinho';
    end if;
  else
    v_nome := btrim(coalesce(p_favorecido, ''));
    if v_nome = '' then raise exception 'diga para quem é o pagamento'; end if;
  end if;
  insert into fila_avulsos (favorecido, fornecedor_id, motivo, valor, criado_por, criado_por_nome)
  values (v_nome, p_fornecedor_id, btrim(p_motivo), round(p_valor, 2), q.uid, q.nome) returning id into v_id;
  insert into fila_log (por_id, por_nome, acao, credor, detalhe)
  values (q.uid, q.nome, 'avulso_criar', case when p_fornecedor_id is not null then 'f:' || p_fornecedor_id else 'a:' || v_id end,
          jsonb_build_object('id', v_id, 'favorecido', v_nome, 'valor', round(p_valor, 2), 'motivo', btrim(p_motivo)));
  return case when p_fornecedor_id is not null then 'f:' || p_fornecedor_id else 'a:' || v_id end;
end $$;

-- Tira um avulso da fila (quem colocou ou o diretor). Não sai se já teve pagamento ou está na pauta.
create function public.fn_fila_avulso_cancelar(p_id uuid, p_motivo text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare q record; a fila_avulsos%rowtype;
begin
  select * into q from fn_fila_quem();
  select * into a from fila_avulsos where id = p_id for update;
  if a.id is null or a.status <> 'aberto' then raise exception 'avulso não está em aberto'; end if;
  if not q.autoriza and a.criado_por is distinct from q.uid then raise exception 'só quem colocou ou o diretor tira da fila'; end if;
  if a.valor_pago > 0 then raise exception 'já teve pagamento: não dá para tirar'; end if;
  if exists (select 1 from fila_ordens f cross join lateral jsonb_array_elements(f.itens) x
              where f.status in ('pedido', 'autorizado') and x->>'o' = 'avulso' and (x->>'id')::uuid = p_id) then
    raise exception 'está na pauta: tire da pauta primeiro';
  end if;
  update fila_avulsos set status = 'cancelado', cancelado_por_nome = q.nome, cancelado_em = now(),
         motivo_cancelamento = nullif(btrim(coalesce(p_motivo, '')), '') where id = p_id;
  insert into fila_log (por_id, por_nome, acao, credor, detalhe)
  values (q.uid, q.nome, 'avulso_cancelar', case when a.fornecedor_id is not null then 'f:' || a.fornecedor_id else 'a:' || a.id end,
          jsonb_build_object('id', p_id, 'motivo', p_motivo));
end $$;

-- "Pagar hoje": põe um credor na pauta, com valor cheio ou parcial. O valor cai nos itens mais
-- antigos primeiro (ou só nos itens escolhidos). Pedido do diretor já entra autorizado.
create function public.fn_fila_ordem_pedir(p_credor text, p_valor numeric, p_itens uuid[] default null, p_obs text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  q record; i record;
  v_hoje date := (now() at time zone 'America/Cuiaba')::date;
  v_resta numeric := round(coalesce(p_valor, 0), 2);
  v_itens jsonb := '[]'::jsonb;
  v_nome text; v_rh boolean := false; v_conta boolean := false; v_tipo text;
  v_parte numeric; v_id uuid;
begin
  select * into q from fn_fila_quem();
  if v_resta <= 0 then raise exception 'valor inválido'; end if;
  for i in
    select * from fn_fila_saldos() s
     where s.credor = p_credor and (p_itens is null or s.ref_id = any (p_itens))
       and s.saldo - s.aguardando - s.reservado > 0.004
     order by s.data_ref, s.descricao, s.ref_id
  loop
    exit when v_resta <= 0.004;
    v_nome := i.credor_nome; v_tipo := i.tipo;
    v_rh := v_rh or i.tipo = 'rh'; v_conta := v_conta or i.tipo = 'conta';
    v_parte := least(v_resta, i.saldo - i.aguardando - i.reservado);
    v_itens := v_itens || jsonb_build_object('o', i.origem, 'id', i.ref_id, 'v', v_parte, 'd', i.descricao, 'data', i.data_ref);
    v_resta := v_resta - v_parte;
  end loop;
  if v_nome is null then raise exception 'nada em aberto para colocar na pauta'; end if;
  if v_resta > 0.004 then raise exception 'valor maior que o que falta pagar'; end if;
  insert into fila_ordens (data, credor, credor_nome, tipo, valor, itens, observacao, status,
                           pedido_por, pedido_por_nome, decidido_por, decidido_por_nome, decidido_em)
  values (v_hoje, p_credor, v_nome, case when v_rh then 'rh' when v_conta then 'conta' else v_tipo end,
          round(p_valor, 2), v_itens, nullif(btrim(coalesce(p_obs, '')), ''),
          case when q.autoriza then 'autorizado' else 'pedido' end,
          q.uid, q.nome, case when q.autoriza then q.uid end, case when q.autoriza then q.nome end, case when q.autoriza then now() end)
  returning id into v_id;
  insert into fila_log (por_id, por_nome, acao, credor, ordem_id, detalhe)
  values (q.uid, q.nome, 'pedir', p_credor, v_id, jsonb_build_object('valor', round(p_valor, 2), 'autorizado', q.autoriza));
  return v_id;
end $$;

-- Autorizar ou recusar. Só o diretor.
create function public.fn_fila_ordem_decidir(p_ids uuid[], p_acao text, p_motivo text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare q record; n integer;
begin
  select * into q from fn_fila_quem();
  if not q.autoriza then raise exception 'só o diretor autoriza'; end if;
  if p_acao = 'autorizar' then
    update fila_ordens set status = 'autorizado', decidido_por = q.uid, decidido_por_nome = q.nome, decidido_em = now(), motivo_recusa = null
     where id = any (p_ids) and status = 'pedido';
  elsif p_acao = 'recusar' then
    update fila_ordens set status = 'recusado', decidido_por = q.uid, decidido_por_nome = q.nome, decidido_em = now(),
           motivo_recusa = nullif(btrim(coalesce(p_motivo, '')), '')
     where id = any (p_ids) and status in ('pedido', 'autorizado');
  else
    raise exception 'ação inválida';
  end if;
  get diagnostics n = row_count;
  insert into fila_log (por_id, por_nome, acao, detalhe)
  values (q.uid, q.nome, p_acao, jsonb_build_object('ordens', p_ids, 'feitas', n, 'motivo', p_motivo));
  return n;
end $$;

-- "Paguei": registra quem pagou, quando e de qual conta saiu. NÃO dá baixa em lugar nenhum:
-- guarda o saldo de cada item neste momento, para a fila saber quando a baixa acontecer.
create function public.fn_fila_ordem_paguei(p_id uuid, p_conta_id uuid, p_data date default null)
returns void
language plpgsql security definer set search_path = public as $$
declare
  q record; o fila_ordens%rowtype;
  v_hoje date := (now() at time zone 'America/Cuiaba')::date;
  v_data date; v_conta text; v_itens jsonb;
begin
  select * into q from fn_fila_quem();
  select * into o from fila_ordens where id = p_id for update;
  if o.id is null then raise exception 'ordem não encontrada'; end if;
  if o.status <> 'autorizado' then raise exception 'só dá para marcar como pago o que está autorizado'; end if;
  v_data := coalesce(p_data, v_hoje);
  if v_data > v_hoje or v_data < v_hoje - 10 then raise exception 'data do pagamento fora do intervalo'; end if;
  select initcap(btrim(b.banco)) into v_conta from bancos_contas b where b.id = p_conta_id and b.status = 'ativo';
  if v_conta is null then raise exception 'escolha de onde saiu o dinheiro'; end if;
  select coalesce(jsonb_agg(x || jsonb_build_object('s',
           (select it.saldo from fn_fila_itens() it where it.origem = x->>'o' and it.ref_id = (x->>'id')::uuid)) order by ord), '[]'::jsonb)
    into v_itens from jsonb_array_elements(o.itens) with ordinality t(x, ord);
  update fila_ordens set status = 'pago', pago_por = q.uid, pago_por_nome = q.nome, pago_em = now(), pago_data = v_data,
         pago_conta_id = p_conta_id, pago_conta_nome = v_conta, itens = v_itens where id = p_id;
  update fila_avulsos a set valor_pago = a.valor_pago + x.v,
         status = case when a.valor_pago + x.v >= a.valor - 0.004 then 'pago' else a.status end
    from (select (e->>'id')::uuid id, sum((e->>'v')::numeric) v from jsonb_array_elements(o.itens) e where e->>'o' = 'avulso' group by 1) x
   where a.id = x.id;
  insert into fila_log (por_id, por_nome, acao, credor, ordem_id, detalhe)
  values (q.uid, q.nome, 'paguei', o.credor, p_id, jsonb_build_object('valor', o.valor, 'conta', v_conta, 'data', v_data));
end $$;

-- Volta um passo: "pago" volta para autorizado (quem marcou ou o diretor);
-- pedido ou autorizado sai da pauta (quem pediu ou o diretor).
create function public.fn_fila_ordem_voltar(p_id uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare q record; o fila_ordens%rowtype;
begin
  select * into q from fn_fila_quem();
  select * into o from fila_ordens where id = p_id for update;
  if o.id is null then raise exception 'ordem não encontrada'; end if;
  if o.status = 'pago' then
    if not q.autoriza and o.pago_por is distinct from q.uid then raise exception 'só quem marcou como pago ou o diretor desfaz'; end if;
    update fila_avulsos a set valor_pago = greatest(0, a.valor_pago - x.v), status = 'aberto'
      from (select (e->>'id')::uuid id, sum((e->>'v')::numeric) v from jsonb_array_elements(o.itens) e where e->>'o' = 'avulso' group by 1) x
     where a.id = x.id and a.status <> 'cancelado';
    update fila_ordens set status = 'autorizado', pago_por = null, pago_por_nome = null, pago_em = null, pago_data = null,
           pago_conta_id = null, pago_conta_nome = null where id = p_id;
    insert into fila_log (por_id, por_nome, acao, credor, ordem_id, detalhe)
    values (q.uid, q.nome, 'desfazer_pago', o.credor, p_id, jsonb_build_object('valor', o.valor, 'pago_por', o.pago_por_nome, 'conta', o.pago_conta_nome));
    return 'autorizado';
  elsif o.status in ('pedido', 'autorizado') then
    if not q.autoriza and o.pedido_por is distinct from q.uid then raise exception 'só quem pediu ou o diretor tira da pauta'; end if;
    update fila_ordens set status = 'cancelado', cancelado_por_nome = q.nome, cancelado_em = now() where id = p_id;
    insert into fila_log (por_id, por_nome, acao, credor, ordem_id, detalhe)
    values (q.uid, q.nome, 'tirar_da_pauta', o.credor, p_id, jsonb_build_object('valor', o.valor));
    return 'cancelado';
  end if;
  raise exception 'esta ordem não pode ser desfeita';
end $$;

-- Quanto tem para pagar hoje (quem souber informa).
create function public.fn_fila_disponivel(p_valor numeric)
returns void
language plpgsql security definer set search_path = public as $$
declare q record; v_hoje date := (now() at time zone 'America/Cuiaba')::date;
begin
  select * into q from fn_fila_quem();
  if p_valor is not null and p_valor < 0 then raise exception 'valor inválido'; end if;
  insert into fila_dia (data, disponivel, por_nome, em) values (v_hoje, round(p_valor, 2), q.nome, now())
  on conflict (data) do update set disponivel = excluded.disponivel, por_nome = excluded.por_nome, em = now();
  insert into fila_log (por_id, por_nome, acao, detalhe) values (q.uid, q.nome, 'disponivel', jsonb_build_object('valor', p_valor));
end $$;

-- Permissões: as funções de apoio não são chamadas de fora; as da tela, só por quem está logado.
revoke all on function public.fn_fila_quem() from public, anon, authenticated;
revoke all on function public.fn_fila_itens() from public, anon, authenticated;
revoke all on function public.fn_fila_saldos() from public, anon, authenticated;
revoke all on function public.fn_fila_ler(date) from public, anon;
revoke all on function public.fn_fila_sinal(text, boolean, boolean, date, text) from public, anon;
revoke all on function public.fn_fila_avulso_criar(text, numeric, text, uuid) from public, anon;
revoke all on function public.fn_fila_avulso_cancelar(uuid, text) from public, anon;
revoke all on function public.fn_fila_ordem_pedir(text, numeric, uuid[], text) from public, anon;
revoke all on function public.fn_fila_ordem_decidir(uuid[], text, text) from public, anon;
revoke all on function public.fn_fila_ordem_paguei(uuid, uuid, date) from public, anon;
revoke all on function public.fn_fila_ordem_voltar(uuid) from public, anon;
revoke all on function public.fn_fila_disponivel(numeric) from public, anon;
grant execute on function public.fn_fila_ler(date), public.fn_fila_sinal(text, boolean, boolean, date, text),
  public.fn_fila_avulso_criar(text, numeric, text, uuid), public.fn_fila_avulso_cancelar(uuid, text),
  public.fn_fila_ordem_pedir(text, numeric, uuid[], text), public.fn_fila_ordem_decidir(uuid[], text, text),
  public.fn_fila_ordem_paguei(uuid, uuid, date), public.fn_fila_ordem_voltar(uuid), public.fn_fila_disponivel(numeric) to authenticated;
