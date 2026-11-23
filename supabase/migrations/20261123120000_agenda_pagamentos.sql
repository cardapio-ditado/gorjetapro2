-- Agenda de pagamentos (Kadu, 22-23/11/2026). Substitui a "Fila de pagamentos" de 22/11 (que saiu)
-- e a planilha diária "valores a pagar": uma folha por dia, no jeito da planilha.
--
--   1. Fechamento de caixa: venda bruta da ZIG (sozinha), entradas digitadas (dinheiro, cartão,
--      Pix/Inter, bônus, desconto) e pagamentos do caixa (o que saiu do dinheiro da noite).
--   2. Valores a pagar, nos grupos da planilha: Contas a Pagar em aberto (grupo pela categoria),
--      extras e músicos com saldo no módulo (grupos próprios) e avulsos digitados no grupo.
--   3. Pagamentos do dia: a lista que se forma (pela seta ou digitando), com quem colocou, a forma
--      (Pix, dinheiro, cartão) e a situação. Só o diretor (master) autoriza.
--
-- A AGENDA NÃO DÁ BAIXA. Nada aqui escreve em contas_pagar, pagamentos_contas, fluxo_caixa,
-- extras_* ou musicos_*. O pagamento fica ligado à conta, diária ou show e serve de apoio
-- para a conciliação; enquanto a baixa não acontece, aparece como "aguardando baixa".
-- Acesso: master ou módulo Financeiro. Tudo pelas funções fn_agp_*; tabelas sem acesso direto.

-- A fila de 22/11 sai (estava vazia).
drop function if exists public.fn_fila_ler(date), public.fn_fila_sinal(text, boolean, boolean, date, text),
  public.fn_fila_avulso_criar(text, numeric, text, uuid), public.fn_fila_avulso_cancelar(uuid, text),
  public.fn_fila_ordem_pedir(text, numeric, uuid[], text), public.fn_fila_ordem_decidir(uuid[], text, text),
  public.fn_fila_ordem_paguei(uuid, uuid, date), public.fn_fila_ordem_voltar(uuid), public.fn_fila_disponivel(numeric),
  public.fn_fila_saldos(), public.fn_fila_itens(), public.fn_fila_quem();
drop table if exists public.fila_log, public.fila_dia, public.fila_ordens, public.fila_avulsos, public.fila_sinais;

create table public.agp_grupos (
  id text primary key,
  nome text not null,
  ordem integer not null
);
insert into public.agp_grupos (id, nome, ordem) values
  ('manutencao', 'Manutenção e equipamentos', 1),
  ('bebidas_alcoolicas', 'Bebidas alcoólicas', 2),
  ('bebidas_nao_alcoolicas', 'Bebidas não alcoólicas', 3),
  ('alimentos', 'Alimentos', 4),
  ('rh', 'RH', 5),
  ('extras', 'Extras', 6),
  ('musicos', 'Músicos', 7),
  ('operacional', 'Despesas operacionais', 8),
  ('fixas', 'Despesas fixas', 9),
  ('utilidades', 'Utilidades operacionais', 10),
  ('terceiros', 'Serviços de terceiros', 11),
  ('impostos', 'Impostos e taxas', 12),
  ('outros', 'Outros', 13);

-- Em que grupo cai cada categoria do Contas a Pagar. Sem linha aqui, vale a do pai; sem pai, "Outros".
create table public.agp_grupo_categoria (
  categoria_id uuid primary key references public.categorias_financeiras(id) on delete cascade,
  grupo text not null references public.agp_grupos(id)
);
insert into public.agp_grupo_categoria (categoria_id, grupo)
select c.id, m.grupo
  from categorias_financeiras c
  join (values
    ('Reformas e manutenções', 'manutencao'), ('Manutenção de Equipamentos', 'manutencao'), ('Decoração', 'manutencao'),
    ('Rider Técnico e Equipamentos', 'manutencao'),
    ('CMV - Bebidas', 'bebidas_alcoolicas'), ('Chopp e Cervejas', 'bebidas_alcoolicas'), ('Destilados', 'bebidas_alcoolicas'), ('Vinhos', 'bebidas_alcoolicas'),
    ('Refrigerantes e Sucos', 'bebidas_nao_alcoolicas'), ('Energéticos e Outras Bebidas', 'bebidas_nao_alcoolicas'), ('Água Mineral', 'bebidas_nao_alcoolicas'),
    ('CMV - Alimentos', 'alimentos'),
    ('Equipe e Pessoal', 'rh'), ('Encargos Trabalhistas', 'rh'), ('FGTS', 'rh'),
    ('Extra - Bar', 'extras'), ('Extra - Cozinha', 'extras'), ('Extra - Feijoada', 'extras'), ('Extra - Passador', 'extras'),
    ('Extra - Segurança', 'extras'), ('Extras e Freelancers', 'extras'),
    ('Artistas e Eventos', 'musicos'), ('Cachê de Músicos', 'musicos'),
    ('Despesas Operacionais', 'operacional'), ('Publicidade e Marketing', 'operacional'), ('Uniformes e EPIs', 'operacional'),
    ('VEICULOS/TRANSPORTE/COMBUSTIVEL', 'operacional'),
    ('Despesas Fixas', 'fixas'),
    ('Operacionais e Utilidades', 'utilidades'), ('AQUISIÇÃO DE UTENSÍLIOS', 'utilidades'), ('Descartáveis', 'utilidades'), ('Materiais de Limpeza', 'utilidades'),
    ('Serviços Terceirizados', 'terceiros'), ('Serviços Jurídicos', 'terceiros'), ('CO2/Gas', 'terceiros'), ('Tecnologia/Software', 'terceiros'),
    ('Associações/Sindicatos', 'terceiros'),
    ('IPTU e Licenças', 'impostos'), ('IMPOSTOS', 'impostos'), ('IMPOSTOS FEDERAIS', 'impostos'), ('Tarifas Bancárias', 'impostos'),
    ('Multas e Juros Pagos', 'impostos'), ('Deduções e custos variáveis', 'impostos')
  ) m(nome, grupo) on btrim(c.nome) = m.nome
on conflict (categoria_id) do nothing;

-- Fechamento de caixa: o que entrou no dia, digitado.
create table public.agp_entradas (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  tipo text not null check (tipo in ('dinheiro', 'cartao', 'pix', 'bonus', 'desconto')),
  descricao text,
  valor numeric(12,2) not null check (valor > 0),
  criado_por uuid,
  criado_por_nome text,
  criado_em timestamptz not null default now()
);
create index agp_entradas_data_idx on public.agp_entradas (data);

-- O que não está no Contas a Pagar, digitado no fim de um grupo. Fica na lista até ser pago.
create table public.agp_avulsos (
  id uuid primary key default gen_random_uuid(),
  grupo text not null references public.agp_grupos(id),
  descricao text not null,
  valor numeric(12,2) not null check (valor > 0),
  valor_pago numeric(12,2) not null default 0,
  status text not null default 'aberto' check (status in ('aberto', 'pago', 'cancelado')),
  criado_por uuid,
  criado_por_nome text,
  criado_em timestamptz not null default now(),
  cancelado_por_nome text,
  cancelado_em timestamptz
);

-- Pagamentos do dia (e pagamentos do caixa, com caixa = true).
-- refs = [{o: origem, id, v: valor que cai nesse item, d: descrição, s: saldo do item na hora do pagamento}]
create table public.agp_itens (
  id uuid primary key default gen_random_uuid(),
  data date not null,
  grupo text references public.agp_grupos(id),
  chave text,
  descricao text not null,
  valor numeric(12,2) not null check (valor > 0),
  forma text not null default 'pix' check (forma in ('pix', 'dinheiro', 'cartao')),
  caixa boolean not null default false,
  refs jsonb not null default '[]'::jsonb,
  observacao text,
  status text not null default 'pedido' check (status in ('pedido', 'autorizado', 'recusado', 'pago')),
  pedido_por uuid,
  pedido_por_nome text,
  pedido_em timestamptz not null default now(),
  decidido_por uuid,
  decidido_por_nome text,
  decidido_em timestamptz,
  motivo_recusa text,
  pago_por uuid,
  pago_por_nome text,
  pago_em timestamptz
);
create index agp_itens_data_idx on public.agp_itens (data);
create index agp_itens_status_idx on public.agp_itens (status);

create table public.agp_log (
  id bigint generated always as identity primary key,
  em timestamptz not null default now(),
  por_id uuid,
  por_nome text,
  acao text not null,
  item_id uuid,
  detalhe jsonb
);

alter table public.agp_grupos enable row level security;
alter table public.agp_grupo_categoria enable row level security;
alter table public.agp_entradas enable row level security;
alter table public.agp_avulsos enable row level security;
alter table public.agp_itens enable row level security;
alter table public.agp_log enable row level security;
revoke all on public.agp_grupos, public.agp_grupo_categoria, public.agp_entradas, public.agp_avulsos, public.agp_itens, public.agp_log
  from anon, authenticated;

-- Quem está chamando: master ou módulo Financeiro. Só master autoriza.
create function public.fn_agp_quem(out uid uuid, out nome text, out autoriza boolean)
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

-- Hoje em Cuiabá, e a regra dos dias que ainda aceitam lançamento (hoje e os 7 anteriores).
create function public.fn_agp_hoje() returns date language sql stable as $$ select (now() at time zone 'America/Cuiaba')::date $$;
create function public.fn_agp_dia_aberto(p_data date) returns void
language plpgsql stable set search_path = public as $$
begin
  if p_data is null or p_data > fn_agp_hoje() or p_data < fn_agp_hoje() - 7 then
    raise exception 'dia fechado: só dá para lançar de hoje até 7 dias atrás';
  end if;
end $$;

-- Tudo o que está em aberto, um item por conta, diária, show ou avulso.
-- chave = a linha da lista: cada conta e cada avulso é uma linha; extras por pessoa; músicos por artista.
create function public.fn_agp_refs()
returns table (chave text, grupo text, origem text, nome text, detalhe text, ref_id uuid, ref_desc text, ref_data date, saldo numeric)
language sql stable set search_path = public as $$
  with mapa as (
    select c.id, coalesce(m.grupo, mp.grupo, 'outros') grupo
      from categorias_financeiras c
      left join agp_grupo_categoria m on m.categoria_id = c.id
      left join agp_grupo_categoria mp on mp.categoria_id = c.categoria_pai_id)
  select 'c:' || c.id, coalesce(ma.grupo, 'outros'), 'conta', btrim(fo.nome), nullif(btrim(coalesce(c.descricao, '')), ''),
         c.id, btrim(coalesce(c.descricao, '')), c.data_vencimento, c.saldo_restante
    from contas_pagar c
    join fornecedores fo on fo.id = c.fornecedor_id
    left join mapa ma on ma.id = c.categoria_id
   where c.status <> 'pago' and c.saldo_restante > 0
     and coalesce(c.origem_modulo, '') <> 'musicos'
     and not exists (select 1 from extras_freelancers e where e.conta_pagar_id = c.id)
  union all
  select 'p:' || coalesce(pp.id::text, lower(btrim(e.nome))), 'extras', 'extra', coalesce(pp.nome, btrim(e.nome)), null,
         e.id, concat_ws(' · ', 'Diária ' || to_char(e.data_trabalho, 'DD/MM'), nullif(btrim(e.funcao_temporaria), '')),
         e.data_trabalho, e.saldo_restante
    from extras_freelancers e
    left join extras_pessoas p0 on p0.id = e.pessoa_id
    left join extras_pessoas pp on pp.id = coalesce(p0.juntado_com, p0.id)
   where e.status_pagamento = 'pendente' and coalesce(e.presenca, '') <> 'faltou'
     and e.saldo_restante > 0 and e.data_trabalho <= fn_agp_hoje()
  union all
  select 'm:' || coalesce(m.fornecedor_id::text, lower(btrim(m.nome))), 'musicos', 'musico', coalesce(btrim(fo.nome), btrim(m.nome)), null,
         m.id, 'Show ' || to_char(m.data_evento, 'DD/MM') || ' · ' || btrim(m.nome), m.data_evento::date,
         greatest(coalesce(m.saldo_restante, m.valor_total_final - coalesce(m.valor_pago, 0)), 0)
    from musicos m
    left join fornecedores fo on fo.id = m.fornecedor_id
   where m.status_pagamento <> 'pago'
     and greatest(coalesce(m.saldo_restante, m.valor_total_final - coalesce(m.valor_pago, 0)), 0) > 0
     and m.data_evento::date between date '2026-10-01' and fn_agp_hoje()
  union all
  select 'a:' || a.id, a.grupo, 'avulso', a.descricao, 'Colocado por ' || coalesce(a.criado_por_nome, '?'),
         a.id, a.descricao, (a.criado_em at time zone 'America/Cuiaba')::date, a.valor - a.valor_pago
    from agp_avulsos a
   where a.status = 'aberto' and a.valor - a.valor_pago > 0
$$;

-- Cada item em aberto com o que já está comprometido na agenda:
--   reservado  = numa linha pedida ou autorizada, ainda não paga (de qualquer dia);
--   aguardando = pago pela agenda e a baixa ainda não aconteceu (o saldo do item não caiu).
create function public.fn_agp_saldos()
returns table (chave text, grupo text, origem text, nome text, detalhe text, ref_id uuid, ref_desc text, ref_data date, saldo numeric, reservado numeric, aguardando numeric)
language sql stable set search_path = public as $$
  with al as (
    select (x->>'id')::uuid id,
           coalesce(sum((x->>'v')::numeric) filter (where i.status = 'pago'), 0) pago,
           max((x->>'s')::numeric) filter (where i.status = 'pago') s0,
           coalesce(sum((x->>'v')::numeric) filter (where i.status in ('pedido', 'autorizado')), 0) res
      from agp_itens i cross join lateral jsonb_array_elements(i.refs) x
     where i.status in ('pedido', 'autorizado', 'pago')
     group by 1)
  select r.chave, r.grupo, r.origem, r.nome, r.detalhe, r.ref_id, r.ref_desc, r.ref_data, r.saldo,
         coalesce(al.res, 0),
         case when r.origem = 'avulso' then 0::numeric
              else greatest(0, least(r.saldo, coalesce(al.pago, 0) - greatest(0, coalesce(al.s0, 0) - r.saldo))) end
    from fn_agp_refs() r left join al on al.id = r.ref_id
$$;

-- A folha inteira de um dia numa chamada.
create function public.fn_agp_ler(p_data date default null)
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  q record;
  v_hoje date := fn_agp_hoje();
  v_data date := coalesce(p_data, fn_agp_hoje());
  r jsonb;
begin
  select * into q from fn_agp_quem();
  with s as materialized (select * from fn_agp_saldos())
  select jsonb_build_object(
    'hoje', v_hoje, 'data', v_data, 'autoriza', q.autoriza, 'eu', q.nome,
    'editavel', v_data between v_hoje - 7 and v_hoje,
    'grupos', (select jsonb_agg(jsonb_build_object('id', g.id, 'nome', g.nome) order by g.ordem) from agp_grupos g),
    'venda', jsonb_build_object(
      'noite', (select (n.resumo->>'total')::numeric from zig_noites n where n.data = v_data),
      'final', (select n.final from zig_noites n where n.data = v_data),
      'dia', (select f.total from faturamento_zig_diario f where f.data = v_data)),
    'abertos', coalesce((
      select jsonb_agg(jsonb_build_object(
               'chave', l.chave, 'grupo', l.grupo, 'origem', l.origem, 'nome', l.nome, 'detalhe', l.detalhe,
               'data', l.data, 'n', l.n, 'saldo', l.saldo, 'reservado', l.reservado, 'aguardando', l.aguardando,
               'itens', l.itens) order by l.data, l.nome)
        from (
          select s.chave, min(s.grupo) grupo, min(s.origem) origem, min(s.nome) nome, min(s.detalhe) detalhe,
                 min(s.ref_data) data, count(*) n, sum(s.saldo) saldo, sum(s.reservado) reservado, sum(s.aguardando) aguardando,
                 case when count(*) > 1 then jsonb_agg(jsonb_build_object('d', s.ref_desc, 'data', s.ref_data, 'saldo', s.saldo) order by s.ref_data) end itens
            from s group by s.chave) l), '[]'::jsonb),
    'entradas', coalesce((
      select jsonb_agg(jsonb_build_object('id', e.id, 'tipo', e.tipo, 'descricao', e.descricao, 'valor', e.valor,
               'por', e.criado_por_nome, 'em', e.criado_em, 'meu', e.criado_por = q.uid) order by e.criado_em)
        from agp_entradas e where e.data = v_data), '[]'::jsonb),
    'itens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', i.id, 'data', i.data, 'grupo', i.grupo, 'chave', i.chave, 'descricao', i.descricao, 'valor', i.valor,
               'forma', i.forma, 'caixa', i.caixa, 'obs', i.observacao, 'status', i.status, 'ligado', jsonb_array_length(i.refs) > 0,
               'refs', (select jsonb_agg(x->>'d') from jsonb_array_elements(i.refs) x),
               'meu', i.pedido_por = q.uid, 'pedido_por', i.pedido_por_nome, 'pedido_em', i.pedido_em,
               'decidido_por', i.decidido_por_nome, 'decidido_em', i.decidido_em, 'motivo_recusa', i.motivo_recusa,
               'pago_por', i.pago_por_nome, 'pago_em', i.pago_em, 'paguei_eu', i.pago_por = q.uid,
               'sem_baixa', i.status = 'pago' and exists (
                  select 1 from jsonb_array_elements(i.refs) x join s s2 on s2.ref_id = (x->>'id')::uuid
                   where x->>'o' <> 'avulso' and s2.aguardando > 0.004)) order by i.pedido_em)
        from agp_itens i
       where i.data = v_data
          or (v_data = v_hoje and i.data < v_hoje and i.status in ('pedido', 'autorizado'))), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- Distribui um valor nos itens em aberto de uma linha, do mais antigo para o mais novo.
create function public.fn_agp_distribuir(p_chave text, p_valor numeric)
returns jsonb
language plpgsql stable set search_path = public as $$
declare i record; v_resta numeric := round(p_valor, 2); v_parte numeric; v_out jsonb := '[]'::jsonb;
begin
  for i in
    select * from fn_agp_saldos() s
     where s.chave = p_chave and s.saldo - s.reservado - s.aguardando > 0.004
     order by s.ref_data, s.ref_desc, s.ref_id
  loop
    exit when v_resta <= 0.004;
    v_parte := least(v_resta, i.saldo - i.reservado - i.aguardando);
    v_out := v_out || jsonb_build_object('o', i.origem, 'id', i.ref_id, 'v', v_parte, 'd', i.ref_desc);
    v_resta := v_resta - v_parte;
  end loop;
  if v_resta > 0.004 then raise exception 'valor maior que o que falta pagar'; end if;
  return v_out;
end $$;

-- Grava o saldo de cada item no momento do pagamento (para saber quando a baixa acontecer)
-- e acerta o pago dos avulsos.
create function public.fn_agp_marcar_pago(p_id uuid, p_sinal integer)
returns void
language plpgsql set search_path = public as $$
declare v_refs jsonb;
begin
  if p_sinal > 0 then
    select coalesce(jsonb_agg(x || jsonb_build_object('s',
             (select r.saldo from fn_agp_refs() r where r.ref_id = (x->>'id')::uuid)) order by ord), '[]'::jsonb)
      into v_refs from agp_itens i cross join lateral jsonb_array_elements(i.refs) with ordinality t(x, ord) where i.id = p_id;
    update agp_itens set refs = coalesce(v_refs, '[]'::jsonb) where id = p_id;
  end if;
  update agp_avulsos a
     set valor_pago = greatest(0, a.valor_pago + p_sinal * x.v),
         status = case when a.status = 'cancelado' then a.status
                       when a.valor_pago + p_sinal * x.v >= a.valor - 0.004 then 'pago' else 'aberto' end
    from (select (e->>'id')::uuid id, sum((e->>'v')::numeric) v
            from agp_itens i cross join lateral jsonb_array_elements(i.refs) e
           where i.id = p_id and e->>'o' = 'avulso' group by 1) x
   where a.id = x.id;
end $$;

-- Fechamento de caixa: entrada do dia.
create function public.fn_agp_entrada_add(p_data date, p_tipo text, p_valor numeric, p_descricao text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare q record; v_id uuid;
begin
  select * into q from fn_agp_quem();
  perform fn_agp_dia_aberto(p_data);
  if p_valor is null or p_valor <= 0 then raise exception 'valor inválido'; end if;
  insert into agp_entradas (data, tipo, descricao, valor, criado_por, criado_por_nome)
  values (p_data, p_tipo, nullif(btrim(coalesce(p_descricao, '')), ''), round(p_valor, 2), q.uid, q.nome) returning id into v_id;
  insert into agp_log (por_id, por_nome, acao, item_id, detalhe)
  values (q.uid, q.nome, 'entrada', v_id, jsonb_build_object('data', p_data, 'tipo', p_tipo, 'valor', round(p_valor, 2)));
  return v_id;
end $$;

create function public.fn_agp_entrada_del(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare q record; e agp_entradas%rowtype;
begin
  select * into q from fn_agp_quem();
  select * into e from agp_entradas where id = p_id;
  if e.id is null then raise exception 'entrada não encontrada'; end if;
  perform fn_agp_dia_aberto(e.data);
  if not q.autoriza and e.criado_por is distinct from q.uid then raise exception 'só quem lançou ou o diretor apaga'; end if;
  delete from agp_entradas where id = p_id;
  insert into agp_log (por_id, por_nome, acao, item_id, detalhe) values (q.uid, q.nome, 'entrada_apagar', p_id, to_jsonb(e));
end $$;

-- Avulso: o que não está no sistema, digitado no fim de um grupo.
create function public.fn_agp_avulso_add(p_grupo text, p_descricao text, p_valor numeric)
returns text
language plpgsql security definer set search_path = public as $$
declare q record; v_id uuid;
begin
  select * into q from fn_agp_quem();
  if p_valor is null or p_valor <= 0 then raise exception 'valor inválido'; end if;
  if coalesce(btrim(p_descricao), '') = '' then raise exception 'diga o que é'; end if;
  if p_grupo in ('extras', 'musicos') then
    raise exception 'extra e músico entram pelo módulo: lance a diária ou o show e aparece aqui sozinho';
  end if;
  if not exists (select 1 from agp_grupos where id = p_grupo) then raise exception 'grupo inválido'; end if;
  insert into agp_avulsos (grupo, descricao, valor, criado_por, criado_por_nome)
  values (p_grupo, btrim(p_descricao), round(p_valor, 2), q.uid, q.nome) returning id into v_id;
  insert into agp_log (por_id, por_nome, acao, item_id, detalhe)
  values (q.uid, q.nome, 'avulso', v_id, jsonb_build_object('grupo', p_grupo, 'descricao', btrim(p_descricao), 'valor', round(p_valor, 2)));
  return 'a:' || v_id;
end $$;

create function public.fn_agp_avulso_del(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare q record; a agp_avulsos%rowtype;
begin
  select * into q from fn_agp_quem();
  select * into a from agp_avulsos where id = p_id for update;
  if a.id is null or a.status <> 'aberto' then raise exception 'avulso não está em aberto'; end if;
  if not q.autoriza and a.criado_por is distinct from q.uid then raise exception 'só quem colocou ou o diretor tira da lista'; end if;
  if a.valor_pago > 0 then raise exception 'já teve pagamento: não dá para tirar'; end if;
  if exists (select 1 from agp_itens i cross join lateral jsonb_array_elements(i.refs) x
              where i.status in ('pedido', 'autorizado') and (x->>'id')::uuid = p_id) then
    raise exception 'está nos pagamentos do dia: tire de lá primeiro';
  end if;
  update agp_avulsos set status = 'cancelado', cancelado_por_nome = q.nome, cancelado_em = now() where id = p_id;
  insert into agp_log (por_id, por_nome, acao, item_id, detalhe) values (q.uid, q.nome, 'avulso_tirar', p_id, to_jsonb(a));
end $$;

-- Coloca um pagamento na lista do dia. Com p_chave, liga a uma linha dos valores a pagar
-- (o valor cai nos itens mais antigos dela); sem p_chave, é digitado (descrição e grupo).
-- p_caixa: pagamento que já saiu do dinheiro do caixa (entra como pago, em dinheiro).
create function public.fn_agp_item_add(p_data date, p_chave text, p_valor numeric, p_descricao text default null,
  p_grupo text default null, p_forma text default 'pix', p_caixa boolean default false, p_obs text default null)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  q record; v_id uuid; v_refs jsonb := '[]'::jsonb; v_desc text; v_grupo text; v_status text;
begin
  select * into q from fn_agp_quem();
  perform fn_agp_dia_aberto(p_data);
  if p_valor is null or p_valor <= 0 then raise exception 'valor inválido'; end if;
  if not coalesce(p_caixa, false) and p_data <> fn_agp_hoje() then
    raise exception 'pagamentos do dia só entram na folha de hoje';
  end if;
  if p_chave is not null then
    select min(s.nome), min(s.grupo) into v_desc, v_grupo from fn_agp_saldos() s where s.chave = p_chave;
    if v_desc is null then raise exception 'esse item não está mais em aberto'; end if;
    v_refs := fn_agp_distribuir(p_chave, p_valor);
    if jsonb_array_length(v_refs) = 0 then raise exception 'esse item já está todo nos pagamentos'; end if;
    -- conta avulsa de um item só: a descrição da conta ajuda a reconhecer
    if p_chave like 'c:%' then
      select concat_ws(' · ', v_desc, nullif(min(s.detalhe), '')) into v_desc from fn_agp_saldos() s where s.chave = p_chave;
    end if;
  else
    v_desc := btrim(coalesce(p_descricao, ''));
    if v_desc = '' then raise exception 'diga o que é o pagamento'; end if;
    v_grupo := p_grupo;
    if v_grupo is null and not coalesce(p_caixa, false) then raise exception 'escolha o grupo'; end if;
    if v_grupo in ('extras', 'musicos') then
      raise exception 'pagamento de extra ou músico: escolha a pessoa ou o artista na busca, para ligar à diária ou ao show';
    end if;
  end if;
  v_status := case when coalesce(p_caixa, false) then 'pago' when q.autoriza then 'autorizado' else 'pedido' end;
  insert into agp_itens (data, grupo, chave, descricao, valor, forma, caixa, refs, observacao, status,
                         pedido_por, pedido_por_nome, decidido_por, decidido_por_nome, decidido_em, pago_por, pago_por_nome, pago_em)
  values (p_data, v_grupo, p_chave, coalesce(nullif(btrim(coalesce(p_descricao, '')), ''), v_desc), round(p_valor, 2),
          case when coalesce(p_caixa, false) then 'dinheiro' else coalesce(p_forma, 'pix') end,
          coalesce(p_caixa, false), v_refs, nullif(btrim(coalesce(p_obs, '')), ''), v_status,
          q.uid, q.nome,
          case when v_status = 'autorizado' then q.uid end, case when v_status = 'autorizado' then q.nome end, case when v_status = 'autorizado' then now() end,
          case when v_status = 'pago' then q.uid end, case when v_status = 'pago' then q.nome end, case when v_status = 'pago' then now() end)
  returning id into v_id;
  if v_status = 'pago' then perform fn_agp_marcar_pago(v_id, 1); end if;
  insert into agp_log (por_id, por_nome, acao, item_id, detalhe)
  values (q.uid, q.nome, case when coalesce(p_caixa, false) then 'caixa' else 'pedir' end, v_id,
          jsonb_build_object('data', p_data, 'chave', p_chave, 'valor', round(p_valor, 2), 'status', v_status));
  return v_id;
end $$;

-- Muda valor, forma ou observação de um pagamento ainda não pago. Se não for o diretor
-- mudando o valor de algo já autorizado, volta para "aguardando autorização".
create function public.fn_agp_item_editar(p_id uuid, p_valor numeric default null, p_forma text default null, p_obs text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare q record; i agp_itens%rowtype; v_refs jsonb; v_valor numeric;
begin
  select * into q from fn_agp_quem();
  select * into i from agp_itens where id = p_id for update;
  if i.id is null then raise exception 'pagamento não encontrado'; end if;
  if i.status not in ('pedido', 'autorizado') then raise exception 'só dá para mudar o que ainda não foi pago'; end if;
  if not q.autoriza and i.pedido_por is distinct from q.uid then raise exception 'só quem colocou ou o diretor muda'; end if;
  v_valor := coalesce(round(p_valor, 2), i.valor);
  if v_valor <= 0 then raise exception 'valor inválido'; end if;
  v_refs := i.refs;
  if v_valor <> i.valor and i.chave is not null then
    update agp_itens set refs = '[]'::jsonb where id = p_id;  -- solta o que estava reservado e distribui de novo
    v_refs := fn_agp_distribuir(i.chave, v_valor);
  end if;
  update agp_itens set valor = v_valor, refs = v_refs, forma = coalesce(p_forma, forma),
         observacao = case when p_obs is null then observacao else nullif(btrim(p_obs), '') end,
         status = case when v_valor <> i.valor and not q.autoriza then 'pedido' else status end,
         decidido_por = case when v_valor <> i.valor and not q.autoriza then null else decidido_por end,
         decidido_por_nome = case when v_valor <> i.valor and not q.autoriza then null else decidido_por_nome end,
         decidido_em = case when v_valor <> i.valor and not q.autoriza then null else decidido_em end
   where id = p_id;
  insert into agp_log (por_id, por_nome, acao, item_id, detalhe)
  values (q.uid, q.nome, 'editar', p_id, jsonb_build_object('de', i.valor, 'para', v_valor, 'forma', p_forma));
end $$;

-- Autorizar ou recusar. Só o diretor.
create function public.fn_agp_decidir(p_ids uuid[], p_acao text, p_motivo text default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare q record; n integer;
begin
  select * into q from fn_agp_quem();
  if not q.autoriza then raise exception 'só o diretor autoriza'; end if;
  if p_acao = 'autorizar' then
    update agp_itens set status = 'autorizado', decidido_por = q.uid, decidido_por_nome = q.nome, decidido_em = now(), motivo_recusa = null
     where id = any (p_ids) and status = 'pedido';
  elsif p_acao = 'recusar' then
    update agp_itens set status = 'recusado', decidido_por = q.uid, decidido_por_nome = q.nome, decidido_em = now(),
           motivo_recusa = nullif(btrim(coalesce(p_motivo, '')), ''), refs = '[]'::jsonb
     where id = any (p_ids) and status in ('pedido', 'autorizado');
  else
    raise exception 'ação inválida';
  end if;
  get diagnostics n = row_count;
  insert into agp_log (por_id, por_nome, acao, detalhe) values (q.uid, q.nome, p_acao, jsonb_build_object('itens', p_ids, 'feitos', n, 'motivo', p_motivo));
  return n;
end $$;

-- "Paguei": quem pagou, quando e a forma. Não dá baixa em lugar nenhum.
create function public.fn_agp_paguei(p_id uuid, p_forma text default null)
returns void
language plpgsql security definer set search_path = public as $$
declare q record; i agp_itens%rowtype;
begin
  select * into q from fn_agp_quem();
  select * into i from agp_itens where id = p_id for update;
  if i.id is null then raise exception 'pagamento não encontrado'; end if;
  if i.status <> 'autorizado' then raise exception 'só dá para marcar como pago o que está autorizado'; end if;
  update agp_itens set status = 'pago', forma = coalesce(p_forma, forma), pago_por = q.uid, pago_por_nome = q.nome, pago_em = now() where id = p_id;
  perform fn_agp_marcar_pago(p_id, 1);
  insert into agp_log (por_id, por_nome, acao, item_id, detalhe) values (q.uid, q.nome, 'paguei', p_id, jsonb_build_object('valor', i.valor, 'forma', coalesce(p_forma, i.forma)));
end $$;

-- Desfaz o "Paguei" (volta para autorizado). Quem pagou ou o diretor.
create function public.fn_agp_desfazer_pago(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare q record; i agp_itens%rowtype;
begin
  select * into q from fn_agp_quem();
  select * into i from agp_itens where id = p_id for update;
  if i.id is null or i.status <> 'pago' or i.caixa then raise exception 'não dá para desfazer este pagamento'; end if;
  if not q.autoriza and i.pago_por is distinct from q.uid then raise exception 'só quem pagou ou o diretor desfaz'; end if;
  perform fn_agp_marcar_pago(p_id, -1);
  update agp_itens set status = 'autorizado', pago_por = null, pago_por_nome = null, pago_em = null where id = p_id;
  insert into agp_log (por_id, por_nome, acao, item_id, detalhe) values (q.uid, q.nome, 'desfazer_pago', p_id, jsonb_build_object('valor', i.valor, 'pago_por', i.pago_por_nome));
end $$;

-- Tira um pagamento da lista: o que ainda não foi pago, ou um pagamento do caixa. Quem colocou ou o diretor.
create function public.fn_agp_item_del(p_id uuid)
returns void
language plpgsql security definer set search_path = public as $$
declare q record; i agp_itens%rowtype;
begin
  select * into q from fn_agp_quem();
  select * into i from agp_itens where id = p_id for update;
  if i.id is null then raise exception 'pagamento não encontrado'; end if;
  if not q.autoriza and i.pedido_por is distinct from q.uid then raise exception 'só quem colocou ou o diretor tira'; end if;
  if i.status = 'pago' and not i.caixa then raise exception 'já foi pago: desfaça o pagamento primeiro'; end if;
  if i.caixa then perform fn_agp_dia_aberto(i.data); perform fn_agp_marcar_pago(p_id, -1); end if;
  delete from agp_itens where id = p_id;
  insert into agp_log (por_id, por_nome, acao, item_id, detalhe) values (q.uid, q.nome, 'tirar', p_id, to_jsonb(i));
end $$;

-- Os grupos de cada categoria, para conferir e ajustar (só o diretor ajusta).
create function public.fn_agp_mapa()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare q record;
begin
  select * into q from fn_agp_quem();
  return coalesce((
    select jsonb_agg(jsonb_build_object('id', c.id, 'nome', btrim(c.nome), 'pai', btrim(p.nome),
             'grupo', coalesce(m.grupo, mp.grupo, 'outros'), 'proprio', m.grupo is not null,
             'abertas', (select count(*) from contas_pagar cp where cp.categoria_id = c.id and cp.status <> 'pago' and cp.saldo_restante > 0))
             order by coalesce(btrim(p.nome), btrim(c.nome)), p.nome is not null, btrim(c.nome))
      from categorias_financeiras c
      left join categorias_financeiras p on p.id = c.categoria_pai_id
      left join agp_grupo_categoria m on m.categoria_id = c.id
      left join agp_grupo_categoria mp on mp.categoria_id = c.categoria_pai_id
     where coalesce(c.tipo, '') <> 'receita' and coalesce(c.status, 'ativo') <> 'inativo'), '[]'::jsonb);
end $$;

create function public.fn_agp_mapa_definir(p_categoria uuid, p_grupo text)
returns void
language plpgsql security definer set search_path = public as $$
declare q record;
begin
  select * into q from fn_agp_quem();
  if not q.autoriza then raise exception 'só o diretor muda os grupos'; end if;
  if not exists (select 1 from agp_grupos where id = p_grupo) then raise exception 'grupo inválido'; end if;
  insert into agp_grupo_categoria (categoria_id, grupo) values (p_categoria, p_grupo)
  on conflict (categoria_id) do update set grupo = excluded.grupo;
  insert into agp_log (por_id, por_nome, acao, detalhe) values (q.uid, q.nome, 'grupo', jsonb_build_object('categoria', p_categoria, 'grupo', p_grupo));
end $$;

-- Permissões: funções de apoio fechadas; as da tela, só para quem está logado.
revoke all on function public.fn_agp_quem(), public.fn_agp_hoje(), public.fn_agp_dia_aberto(date), public.fn_agp_refs(), public.fn_agp_saldos(),
  public.fn_agp_distribuir(text, numeric), public.fn_agp_marcar_pago(uuid, integer) from public, anon, authenticated;
revoke all on function public.fn_agp_ler(date), public.fn_agp_entrada_add(date, text, numeric, text), public.fn_agp_entrada_del(uuid),
  public.fn_agp_avulso_add(text, text, numeric), public.fn_agp_avulso_del(uuid),
  public.fn_agp_item_add(date, text, numeric, text, text, text, boolean, text), public.fn_agp_item_editar(uuid, numeric, text, text),
  public.fn_agp_decidir(uuid[], text, text), public.fn_agp_paguei(uuid, text), public.fn_agp_desfazer_pago(uuid), public.fn_agp_item_del(uuid),
  public.fn_agp_mapa(), public.fn_agp_mapa_definir(uuid, text) from public, anon;
grant execute on function public.fn_agp_ler(date), public.fn_agp_entrada_add(date, text, numeric, text), public.fn_agp_entrada_del(uuid),
  public.fn_agp_avulso_add(text, text, numeric), public.fn_agp_avulso_del(uuid),
  public.fn_agp_item_add(date, text, numeric, text, text, text, boolean, text), public.fn_agp_item_editar(uuid, numeric, text, text),
  public.fn_agp_decidir(uuid[], text, text), public.fn_agp_paguei(uuid, text), public.fn_agp_desfazer_pago(uuid), public.fn_agp_item_del(uuid),
  public.fn_agp_mapa(), public.fn_agp_mapa_definir(uuid, text) to authenticated;
