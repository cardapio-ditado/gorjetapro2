-- ═════════════════════════════════════════════════════════════════════════════
-- Compras: conferência no celular (link próprio)
--
-- Enquanto o ponto de pedido não está redondo, alguém confere o estoque
-- in loco para montar a lista. Essa pessoa não vê a planilha: abre um link
-- no celular, busca o item pelo nome, anota quanto tem e quanto comprar.
-- A planilha de Compras puxa as anotações do dia: preenche a quantidade e
-- inclui na lista o que ela anotou mesmo que o item não esteja abaixo do
-- ponto.
--
-- Uma conferência por dia (reaproveitada); o id da conferência é o link.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1. Tabelas ──────────────────────────────────────────────────────────────
create table if not exists public.compras_conferencias (
  id          uuid primary key default gen_random_uuid(),
  data        date not null,
  titulo      text,
  status      text not null default 'aberta' check (status in ('aberta', 'fechada')),
  criado_em   timestamptz not null default now(),
  criado_por  uuid,
  fechado_em  timestamptz
);
create index if not exists idx_compras_conferencias_data on public.compras_conferencias(data desc);

create table if not exists public.compras_conferencia_itens (
  id                     uuid primary key default gen_random_uuid(),
  conferencia_id         uuid not null references public.compras_conferencias(id) on delete cascade,
  item_id                uuid not null references public.itens_estoque(id) on delete cascade,
  quantidade_encontrada  numeric,
  quantidade_comprar     numeric,
  observacao             text,
  anotado_em             timestamptz not null default now(),
  unique (conferencia_id, item_id)
);

alter table public.compras_conferencias enable row level security;
alter table public.compras_conferencia_itens enable row level security;
revoke all on public.compras_conferencias from public, anon, authenticated;
revoke all on public.compras_conferencia_itens from public, anon, authenticated;

-- ─── 2. Gestor: criar/reaproveitar a conferência de hoje ─────────────────────
create or replace function public.fn_conferencia_criar()
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Cuiaba')::date;
  v_id uuid;
begin
  select id into v_id from compras_conferencias
   where data = v_hoje and status = 'aberta'
   order by criado_em desc limit 1;
  if v_id is null then
    insert into compras_conferencias (data, titulo, criado_por)
    values (v_hoje, 'Conferência ' || to_char(v_hoje, 'DD/MM'), auth.uid())
    returning id into v_id;
  end if;
  return jsonb_build_object('id', v_id, 'data', v_hoje);
end;
$$;

create or replace function public.fn_conferencia_status(p_id uuid, p_status text)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('aberta', 'fechada') then raise exception 'Status inválido'; end if;
  update compras_conferencias
     set status = p_status, fechado_em = case when p_status = 'fechada' then now() else null end
   where id = p_id;
  if not found then raise exception 'Conferência não encontrada'; end if;
  return jsonb_build_object('id', p_id, 'status', p_status);
end;
$$;

-- ─── 3. Link público: dados ──────────────────────────────────────────────────
-- Todos os itens compráveis (ativos, sem ficha técnica) com saldo do Central,
-- ponto e sugestão, mais o que já foi anotado nesta conferência.
create or replace function public.fn_conferencia_publica(p_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with c as (select * from compras_conferencias where id = p_id),
  r as (select * from fn_reposicao_central() where exists (select 1 from c)),
  a as (select * from compras_conferencia_itens where conferencia_id = p_id)
  select case when not exists (select 1 from c) then null else jsonb_build_object(
    'conferencia', (select jsonb_build_object('id', c.id, 'data', c.data, 'titulo', c.titulo, 'status', c.status,
                                              'criado_em', c.criado_em, 'fechado_em', c.fechado_em) from c),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'item_id', r.item_id, 'nome', r.nome, 'categoria', r.categoria, 'um', r.unidade_medida,
        'fracionado', lower(btrim(coalesce(r.unidade_medida, ''))) = any (array['kg','g','grama','gramas','l','litro','litros','ml','mililitro','mililitros']),
        'saldo', r.saldo_central, 'ponto', r.ponto_pedido, 'sugerida', r.quantidade_sugerida, 'situacao', r.situacao,
        'encontrado', a.quantidade_encontrada, 'comprar', a.quantidade_comprar, 'obs', a.observacao, 'anotado_em', a.anotado_em)
        order by r.nome)
      from r left join a on a.item_id = r.item_id), '[]'::jsonb),
    'anotados', (select count(*) from a)
  ) end;
$$;

-- ─── 4. Link público: anotar / apagar ────────────────────────────────────────
create or replace function public.fn_conferencia_anotar(
  p_id uuid, p_item_id uuid, p_encontrado numeric, p_comprar numeric, p_obs text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_status text;
begin
  select status into v_status from compras_conferencias where id = p_id;
  if v_status is null then raise exception 'Conferência não encontrada'; end if;
  if v_status <> 'aberta' then raise exception 'Conferência já fechada'; end if;
  if p_encontrado is null and p_comprar is null and nullif(btrim(coalesce(p_obs, '')), '') is null then
    raise exception 'Anote quanto tem ou quanto comprar';
  end if;

  insert into compras_conferencia_itens (conferencia_id, item_id, quantidade_encontrada, quantidade_comprar, observacao, anotado_em)
  values (p_id, p_item_id,
          case when p_encontrado is null then null else round(greatest(p_encontrado, 0), 3) end,
          case when p_comprar is null then null else round(greatest(p_comprar, 0), 3) end,
          nullif(btrim(coalesce(p_obs, '')), ''), now())
  on conflict (conferencia_id, item_id) do update
    set quantidade_encontrada = excluded.quantidade_encontrada,
        quantidade_comprar    = excluded.quantidade_comprar,
        observacao            = excluded.observacao,
        anotado_em            = now();

  return jsonb_build_object('success', true, 'item_id', p_item_id,
                            'anotados', (select count(*) from compras_conferencia_itens where conferencia_id = p_id));
end;
$$;

create or replace function public.fn_conferencia_apagar(p_id uuid, p_item_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if (select status from compras_conferencias where id = p_id) <> 'aberta' then
    raise exception 'Conferência já fechada';
  end if;
  delete from compras_conferencia_itens where conferencia_id = p_id and item_id = p_item_id;
  return jsonb_build_object('success', true, 'item_id', p_item_id,
                            'anotados', (select count(*) from compras_conferencia_itens where conferencia_id = p_id));
end;
$$;

-- ─── 5. Permissões ───────────────────────────────────────────────────────────
revoke all on function public.fn_conferencia_criar() from public, anon;
revoke all on function public.fn_conferencia_status(uuid, text) from public, anon;
grant execute on function public.fn_conferencia_criar() to authenticated;
grant execute on function public.fn_conferencia_status(uuid, text) to authenticated;
-- Link público: quem tem o id usa.
grant execute on function public.fn_conferencia_publica(uuid) to anon, authenticated, service_role;
grant execute on function public.fn_conferencia_anotar(uuid, uuid, numeric, numeric, text) to anon, authenticated, service_role;
grant execute on function public.fn_conferencia_apagar(uuid, uuid) to anon, authenticated, service_role;

-- ─── 6. Tela Compras: anotações de hoje ──────────────────────────────────────
-- Acrescenta 'conferencia' ao jsonb de fn_compras_tela (conferência aberta
-- de hoje, com os itens anotados). O resto é igual à versão de
-- 20260917110000_compras_fornecedor_mais_comprado.sql.
create or replace function public.fn_compras_tela()
returns jsonb
language sql stable security definer set search_path = public as $$
with r as (select * from fn_reposicao_central()),
hoje as (select (now() at time zone 'America/Cuiaba')::date as d),
adiados as (
  select item_id, oculto_ate from compras_adiadas where oculto_ate >= (select d from hoje)
),
ultima_origem as (
  select distinct on (li.item_id) li.item_id,
         case when l.tipo_compra = 'rua' then 'rua' else 'fornecedor' end as tipo,
         case when l.tipo_compra = 'rua' then null
              else coalesce(l.fornecedor_id, (select f.id from fornecedores f where f.nome = li.fornecedor_nome and f.status = 'ativo' limit 1)) end as fornecedor_id
    from listas_compra_itens li
    join listas_compra l on l.id = li.lista_id
   where l.status <> 'cancelada' and l.data_lista >= current_date - 90
   order by li.item_id, l.data_lista desc, l.criado_em desc
),
historico as (
  select ic.item_id, e.fornecedor_id, e.data_compra as data, coalesce(ic.custo_unitario_final, ic.custo_unitario) as preco
    from itens_entrada_compra ic
    join entradas_compras e on e.id = ic.entrada_compra_id
   where e.status = 'recebido' and e.data_compra >= current_date - 180 and e.fornecedor_id is not null
  union all
  select li.item_id, li.loja_id, l.data_lista, li.preco_pago
    from listas_compra_itens li
    join listas_compra l on l.id = li.lista_id
   where li.comprado and li.loja_id is not null and l.status <> 'cancelada' and l.data_lista >= current_date - 180
),
recentes as (
  select h.item_id, h.fornecedor_id, f.nome, f.modalidade, f.telefone,
         max(h.data) as ultima,
         (array_agg(h.preco order by h.data desc) filter (where h.preco > 0))[1] as ultimo_preco,
         count(*) as compras
    from historico h
    join fornecedores f on f.id = h.fornecedor_id and f.status = 'ativo'
   group by h.item_id, h.fornecedor_id, f.nome, f.modalidade, f.telefone
),
mais_comprado as (
  select distinct on (item_id) item_id, fornecedor_id, modalidade, compras
    from recentes
   order by item_id, compras desc, ultima desc
),
recentes_json as (
  select item_id, jsonb_agg(jsonb_build_object(
           'fornecedor_id', fornecedor_id, 'nome', nome, 'modalidade', modalidade, 'telefone', telefone,
           'ultima', ultima, 'ultimo_preco', ultimo_preco, 'compras', compras)
           order by compras desc, ultima desc) as lista
    from (select *, row_number() over (partition by item_id order by compras desc, ultima desc) as rn from recentes) x
   where rn <= 4
   group by item_id
),
em_lista_onde as (
  select li.item_id, string_agg(coalesce(l.fornecedor_nome, 'Rua') || ' ' || to_char(l.data_lista, 'DD/MM'), ', ' order by l.data_lista desc) as onde
    from listas_compra_itens li
    join listas_compra l on l.id = li.lista_id
   where l.status in ('aberta', 'em_andamento') and li.comprado = false and li.nao_encontrado = false and l.data_lista >= current_date - 7
   group by li.item_id
),
itens as (
  select jsonb_agg(jsonb_build_object(
    'item_id', r.item_id, 'nome', r.nome, 'categoria', r.categoria, 'um', r.unidade_medida,
    'fracionado', lower(btrim(coalesce(r.unidade_medida, ''))) = any (array['kg','g','grama','gramas','l','litro','litros','ml','mililitro','mililitros']),
    'saldo', r.saldo_central, 'ponto', r.ponto_pedido, 'situacao', r.situacao,
    'sugerida', r.quantidade_sugerida, 'consumo_dia', r.consumo_dia,
    'preco', r.preco_medio, 'preco_origem', r.preco_origem,
    'em_lista', r.em_lista_aberta, 'em_lista_onde', elo.onde,
    'adiado_ate', ad.oculto_ate,
    'origem', case
      when mc.fornecedor_id is not null then jsonb_build_object(
        'tipo', case when mc.modalidade = 'rua' then 'rua' else 'fornecedor' end,
        'fornecedor_id', mc.fornecedor_id, 'motivo', 'historico', 'compras', mc.compras)
      when uo.tipo = 'rua' then jsonb_build_object('tipo', 'rua', 'motivo', 'ultima_lista')
      when uo.fornecedor_id is not null and uf.modalidade = 'entrega' then jsonb_build_object('tipo', 'fornecedor', 'fornecedor_id', uo.fornecedor_id, 'motivo', 'ultima_lista')
      when uo.fornecedor_id is not null and uf.modalidade = 'rua' then jsonb_build_object('tipo', 'rua', 'fornecedor_id', uo.fornecedor_id, 'motivo', 'ultima_lista')
      when pf.modalidade = 'entrega' then jsonb_build_object('tipo', 'fornecedor', 'fornecedor_id', pf.id, 'motivo', 'cadastro')
      when pf.modalidade = 'rua' then jsonb_build_object('tipo', 'rua', 'fornecedor_id', pf.id, 'motivo', 'cadastro')
      when r.tipo_compra = 'rua' then jsonb_build_object('tipo', 'rua', 'motivo', 'cadastro')
      else null end,
    'recentes', coalesce(rj.lista, '[]'::jsonb)
  ) order by case r.situacao when 'zerado' then 0 when 'comprar' then 1 else 2 end, r.categoria nulls last, r.nome) as lista
  from r
  left join mais_comprado mc on mc.item_id = r.item_id
  left join ultima_origem uo on uo.item_id = r.item_id
  left join fornecedores uf on uf.id = uo.fornecedor_id and uf.status = 'ativo'
  left join fornecedores pf on pf.id = r.fornecedor_id and pf.status = 'ativo'
  left join recentes_json rj on rj.item_id = r.item_id
  left join em_lista_onde elo on elo.item_id = r.item_id
  left join adiados ad on ad.item_id = r.item_id
  where r.situacao in ('zerado', 'comprar', 'atencao')
),
catalogo as (
  select jsonb_agg(jsonb_build_object(
    'item_id', r.item_id, 'nome', r.nome, 'categoria', r.categoria, 'um', r.unidade_medida,
    'fracionado', lower(btrim(coalesce(r.unidade_medida, ''))) = any (array['kg','g','grama','gramas','l','litro','litros','ml','mililitro','mililitros']),
    'saldo', r.saldo_central, 'ponto', r.ponto_pedido, 'preco', r.preco_medio)
    order by r.nome) as lista
  from r where r.situacao = 'ok'
),
listas as (
  select jsonb_agg(jsonb_build_object(
    'lista_id', l.id, 'numero', l.numero, 'titulo', l.titulo, 'tipo', l.tipo_compra, 'status', l.status,
    'fornecedor_id', l.fornecedor_id, 'fornecedor_nome', l.fornecedor_nome, 'fornecedor_tel', l.fornecedor_tel,
    'data', l.data_lista, 'itens', l.total_itens, 'comprados', l.itens_comprados, 'nao_encontrados', l.itens_nao_encontrados,
    'valor', l.valor_estimado, 'valor_pago', l.valor_pago, 'concluido_em', l.concluido_em)
    order by l.data_lista desc, l.tipo_compra, l.fornecedor_nome nulls first) as lista
  from listas_compra l
  where l.status in ('aberta', 'em_andamento', 'concluida') and l.data_lista >= current_date - 7
),
fornecedores_json as (
  select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome, 'modalidade', f.modalidade, 'telefone', f.telefone) order by f.nome) as lista
    from fornecedores f where f.status = 'ativo'
),
-- Conferência de hoje (a mais recente), com o que foi anotado no celular.
conferencia as (
  select jsonb_build_object(
    'id', c.id, 'data', c.data, 'status', c.status, 'titulo', c.titulo, 'criado_em', c.criado_em,
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
        'item_id', a.item_id, 'nome', i.nome, 'um', i.unidade_medida,
        'encontrado', a.quantidade_encontrada, 'comprar', a.quantidade_comprar, 'obs', a.observacao, 'anotado_em', a.anotado_em)
        order by a.anotado_em desc)
      from compras_conferencia_itens a join itens_estoque i on i.id = a.item_id
     where a.conferencia_id = c.id), '[]'::jsonb)
  ) as j
  from compras_conferencias c
  where c.data = (select d from hoje)
  order by (c.status = 'aberta') desc, c.criado_em desc
  limit 1
)
select jsonb_build_object(
  'gerado_em', now(),
  'hoje', (select d from hoje),
  'itens', coalesce((select lista from itens), '[]'::jsonb),
  'catalogo', coalesce((select lista from catalogo), '[]'::jsonb),
  'listas', coalesce((select lista from listas), '[]'::jsonb),
  'fornecedores', coalesce((select lista from fornecedores_json), '[]'::jsonb),
  'conferencia', (select j from conferencia)
);
$$;
