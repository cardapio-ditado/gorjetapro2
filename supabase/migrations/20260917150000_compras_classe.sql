-- ═════════════════════════════════════════════════════════════════════════════
-- Compras: classe do item (Rua / Pedido / Sob demanda) em vez de fornecedor fixo
--
-- Vincular item a um fornecedor não serve: a mesma cerveja hoje vem da Ambev,
-- amanhã da De Ville. O que decide a aba é a CLASSE do item, revisada uma vez
-- numa aba própria:
--   rua         → lista do comprador
--   pedido      → aba Pedidos, em blocos por categoria; o fornecedor é
--                 escolhido no dia, por categoria (ou por linha)
--   sob_demanda → nunca entra sozinho, só por "Incluir item"
-- Tudo continua entrando pelo ponto de pedido do cadastro (manual).
-- ═════════════════════════════════════════════════════════════════════════════

alter table public.itens_estoque
  add column if not exists classe_compra text check (classe_compra in ('rua', 'pedido', 'sob_demanda')),
  add column if not exists classe_revisada_em timestamptz;
create index if not exists idx_itens_estoque_classe on public.itens_estoque(classe_compra);

-- ─── 1. Definir classe ───────────────────────────────────────────────────────
create or replace function public.fn_compras_classe_definir(p_item_id uuid, p_classe text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  if p_classe not in ('rua', 'pedido', 'sob_demanda') then raise exception 'Classe inválida'; end if;
  update itens_estoque set classe_compra = p_classe, classe_revisada_em = now(), atualizado_em = now()
   where id = p_item_id returning nome into v_nome;
  if v_nome is null then raise exception 'Item não encontrado'; end if;
  return jsonb_build_object('success', true, 'item_id', p_item_id, 'nome', v_nome, 'classe', p_classe);
end;
$$;

-- Lote: [{item_id, classe}]
create or replace function public.fn_compras_classe_lote(p_itens jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare l jsonb; v_n int := 0;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then raise exception 'Nada para classificar'; end if;
  for l in select * from jsonb_array_elements(p_itens) loop
    perform fn_compras_classe_definir((l->>'item_id')::uuid, l->>'classe');
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('success', true, 'classificados', v_n);
end;
$$;

-- ─── 2. Aba Revisão: todos os itens compráveis com classe e sugestão ─────────
create or replace function public.fn_compras_revisao()
returns jsonb
language sql stable security definer set search_path = public as $$
with r as (select * from fn_reposicao_central()),
historico as (
  select ic.item_id, e.fornecedor_id, e.data_compra as data
    from itens_entrada_compra ic
    join entradas_compras e on e.id = ic.entrada_compra_id
   where e.status = 'recebido' and e.data_compra >= current_date - 180 and e.fornecedor_id is not null
  union all
  select li.item_id, li.loja_id, l.data_lista
    from listas_compra_itens li
    join listas_compra l on l.id = li.lista_id
   where li.comprado and li.loja_id is not null and l.status <> 'cancelada' and l.data_lista >= current_date - 180
),
recentes as (
  select h.item_id, h.fornecedor_id, f.nome, f.modalidade, max(h.data) as ultima, count(*) as compras
    from historico h join fornecedores f on f.id = h.fornecedor_id and f.status = 'ativo'
   group by 1, 2, 3, 4
),
mais as (
  select distinct on (item_id) item_id, fornecedor_id, nome, modalidade, compras
    from recentes order by item_id, compras desc, ultima desc
),
freq as (
  select item_id, count(distinct data) as dias, max(data) as ultima from historico group by 1
),
itens as (
  select jsonb_agg(jsonb_build_object(
      'item_id', i.id, 'nome', i.nome, 'categoria', i.categoria, 'um', i.unidade_medida,
      'ponto', r.ponto_pedido, 'saldo', r.saldo_central, 'consumo_dia', r.consumo_dia,
      'classe', i.classe_compra,
      'compras_180d', coalesce(f.dias, 0), 'ultima_compra', f.ultima,
      'ultimo_fornecedor', case when m.fornecedor_id is not null then jsonb_build_object('nome', m.nome, 'modalidade', m.modalidade, 'compras', m.compras) else null end,
      'sugestao', case when m.modalidade = 'rua' then 'rua'
                       when m.modalidade = 'entrega' then 'pedido'
                       when coalesce(f.dias, 0) = 0 and r.consumo_dia = 0 then 'sob_demanda'
                       else null end)
      order by i.categoria nulls last, i.nome) as lista
    from r
    join itens_estoque i on i.id = r.item_id
    left join mais m on m.item_id = i.id
    left join freq f on f.item_id = i.id
),
sem_giro as (
  select jsonb_agg(jsonb_build_object(
      'item_id', i.id, 'nome', i.nome, 'categoria', i.categoria, 'um', i.unidade_medida,
      'ponto', r.ponto_pedido, 'saldo', r.saldo_central, 'consumo_dia', r.consumo_dia,
      'compras_180d', coalesce(f.dias, 0), 'ultima_compra', f.ultima,
      'motivo', case when i.categoria in ('Utensílios', 'Equipamentos', 'Material de Escritório', 'Uniformes', 'MANUTENÇÃO  DE CARRO') then 'categoria'
                     when coalesce(f.dias, 0) = 0 then 'nunca_comprado' else 'sem_consumo' end)
      order by i.categoria nulls last, i.nome) as lista
    from r
    join itens_estoque i on i.id = r.item_id
    left join freq f on f.item_id = i.id
   where r.ponto_pedido > 0 and i.ponto_revisado_em is null and coalesce(i.classe_compra, '') <> 'sob_demanda'
     and (i.categoria in ('Utensílios', 'Equipamentos', 'Material de Escritório', 'Uniformes', 'MANUTENÇÃO  DE CARRO')
          or (r.consumo_dia = 0 and coalesce(f.dias, 0) < 3))
)
select jsonb_build_object(
  'itens', coalesce((select lista from itens), '[]'::jsonb),
  'pontos_sem_giro', coalesce((select lista from sem_giro), '[]'::jsonb),
  'totais', (select jsonb_build_object(
      'total', count(*),
      'pendentes', count(*) filter (where i.classe_compra is null),
      'rua', count(*) filter (where i.classe_compra = 'rua'),
      'pedido', count(*) filter (where i.classe_compra = 'pedido'),
      'sob_demanda', count(*) filter (where i.classe_compra = 'sob_demanda'),
      'pendentes_com_ponto', count(*) filter (where i.classe_compra is null and r.ponto_pedido > 0))
    from r join itens_estoque i on i.id = r.item_id)
);
$$;

-- ─── 3. Tela Compras: classe por item e fornecedores por categoria ───────────
create or replace function public.fn_compras_tela()
returns jsonb
language sql stable security definer set search_path = public as $$
with r as (select * from fn_reposicao_central()),
hoje as (select (now() at time zone 'America/Cuiaba')::date as d),
adiados as (
  select item_id, oculto_ate from compras_adiadas where oculto_ate >= (select d from hoje)
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
-- Fornecedores mais usados por categoria (para o "fornecedor de hoje" do bloco).
cat_forn as (
  select coalesce(nullif(btrim(i.categoria), ''), 'Sem categoria') as categoria,
         h.fornecedor_id, f.nome, f.modalidade, count(*) as compras, max(h.data) as ultima
    from historico h
    join itens_estoque i on i.id = h.item_id
    join fornecedores f on f.id = h.fornecedor_id and f.status = 'ativo' and f.modalidade = 'entrega'
   group by 1, 2, 3, 4
),
cat_forn_json as (
  select categoria, jsonb_agg(jsonb_build_object('fornecedor_id', fornecedor_id, 'nome', nome, 'compras', compras) order by compras desc, ultima desc) as lista
    from (select *, row_number() over (partition by categoria order by compras desc, ultima desc) as rn from cat_forn) x
   where rn <= 6
   group by categoria
),
em_lista_onde as (
  select li.item_id, string_agg(coalesce(l.fornecedor_nome, 'Rua') || ' ' || to_char(l.data_lista, 'DD/MM'), ', ' order by l.data_lista desc) as onde
    from listas_compra_itens li
    join listas_compra l on l.id = li.lista_id
   where l.status in ('aberta', 'em_andamento') and li.comprado = false and li.nao_encontrado = false
     and l.data_lista >= current_date - case when l.tipo_compra = 'fornecedor' then 30 else 7 end
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
    'classe', i.classe_compra,
    'mais_comprado', case when mc.fornecedor_id is not null then jsonb_build_object('fornecedor_id', mc.fornecedor_id, 'modalidade', mc.modalidade, 'compras', mc.compras) else null end,
    'recentes', coalesce(rj.lista, '[]'::jsonb)
  ) order by case r.situacao when 'zerado' then 0 when 'comprar' then 1 else 2 end, r.categoria nulls last, r.nome) as lista
  from r
  join itens_estoque i on i.id = r.item_id
  left join mais_comprado mc on mc.item_id = r.item_id
  left join recentes_json rj on rj.item_id = r.item_id
  left join em_lista_onde elo on elo.item_id = r.item_id
  left join adiados ad on ad.item_id = r.item_id
  where r.situacao in ('zerado', 'comprar', 'atencao')
    and coalesce(i.classe_compra, '') <> 'sob_demanda'
),
catalogo as (
  select jsonb_agg(jsonb_build_object(
    'item_id', r.item_id, 'nome', r.nome, 'categoria', r.categoria, 'um', r.unidade_medida,
    'fracionado', lower(btrim(coalesce(r.unidade_medida, ''))) = any (array['kg','g','grama','gramas','l','litro','litros','ml','mililitro','mililitros']),
    'saldo', r.saldo_central, 'ponto', r.ponto_pedido, 'preco', r.preco_medio, 'classe', i.classe_compra,
    'recentes', coalesce(rj.lista, '[]'::jsonb))
    order by r.nome) as lista
  from r
  join itens_estoque i on i.id = r.item_id
  left join recentes_json rj on rj.item_id = r.item_id
  where r.situacao = 'ok' or i.classe_compra = 'sob_demanda'
),
listas as (
  select jsonb_agg(jsonb_build_object(
    'lista_id', l.id, 'numero', l.numero, 'titulo', l.titulo, 'tipo', l.tipo_compra, 'status', l.status,
    'fornecedor_id', l.fornecedor_id, 'fornecedor_nome', l.fornecedor_nome, 'fornecedor_tel', l.fornecedor_tel,
    'data', l.data_lista, 'itens', l.total_itens, 'comprados', l.itens_comprados, 'nao_encontrados', l.itens_nao_encontrados,
    'valor', l.valor_estimado, 'valor_pago', l.valor_pago, 'concluido_em', l.concluido_em)
    order by l.data_lista desc, l.tipo_compra, l.fornecedor_nome nulls first) as lista
  from listas_compra l
  where (l.status in ('aberta', 'em_andamento') and l.data_lista >= current_date - case when l.tipo_compra = 'fornecedor' then 30 else 7 end)
     or (l.status = 'concluida' and l.data_lista >= current_date - 7)
),
fornecedores_json as (
  select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome, 'modalidade', f.modalidade, 'telefone', f.telefone) order by f.nome) as lista
    from fornecedores f where f.status = 'ativo'
),
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
  'categoria_fornecedores', coalesce((select jsonb_object_agg(categoria, lista) from cat_forn_json), '{}'::jsonb),
  'conferencia', (select j from conferencia),
  'config', jsonb_build_object(
     'pendentes_classe', (select count(*) from r join itens_estoque i on i.id = r.item_id where i.classe_compra is null),
     'pendentes_classe_com_ponto', (select count(*) from r join itens_estoque i on i.id = r.item_id where i.classe_compra is null and r.ponto_pedido > 0),
     'pontos_sem_giro', (select count(*) from r join itens_estoque i on i.id = r.item_id
                          where r.ponto_pedido > 0 and i.ponto_revisado_em is null and coalesce(i.classe_compra, '') <> 'sob_demanda'
                            and (i.categoria in ('Utensílios', 'Equipamentos', 'Material de Escritório', 'Uniformes', 'MANUTENÇÃO  DE CARRO')
                                 or (r.consumo_dia = 0 and not exists (select 1 from historico h where h.item_id = r.item_id group by h.item_id having count(distinct h.data) >= 3)))))
);
$$;

-- ─── 4. Permissões ───────────────────────────────────────────────────────────
revoke all on function public.fn_compras_classe_definir(uuid, text) from public, anon;
revoke all on function public.fn_compras_classe_lote(jsonb) from public, anon;
revoke all on function public.fn_compras_revisao() from public, anon;
grant execute on function public.fn_compras_classe_definir(uuid, text) to authenticated;
grant execute on function public.fn_compras_classe_lote(jsonb) to authenticated;
grant execute on function public.fn_compras_revisao() to authenticated;
