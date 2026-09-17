-- ═════════════════════════════════════════════════════════════════════════════
-- Compras: sugerir a origem pelo histórico (onde o item é mais comprado)
--
-- Antes a sugestão era "a última lista do item". Agora:
--   1. fornecedor/loja com MAIS compras do item nos últimos 180 dias
--      (entradas de compra recebidas + compras da rua marcadas pelo comprador
--      na lista, com a loja); empate → o mais recente;
--   2. senão, a última lista do item (90 dias);
--   3. senão, o fornecedor padrão / tipo do cadastro.
-- A origem vai com 'motivo' e 'compras' para a tela mostrar o porquê, e
-- quem monta a lista troca na própria linha se mudou alguma coisa.
-- "Já comprou de" passa a vir ordenado por quantidade de compras.
-- Só muda fn_compras_tela (CTEs recentes / mais_comprado / origem).
-- ═════════════════════════════════════════════════════════════════════════════

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
-- Histórico de onde o item foi comprado (180 dias): entradas recebidas e
-- compras da rua com a loja anotada pelo comprador.
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
    -- Sugestão de origem: mais comprado (histórico) → última lista → cadastro.
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
)
select jsonb_build_object(
  'gerado_em', now(),
  'hoje', (select d from hoje),
  'itens', coalesce((select lista from itens), '[]'::jsonb),
  'catalogo', coalesce((select lista from catalogo), '[]'::jsonb),
  'listas', coalesce((select lista from listas), '[]'::jsonb),
  'fornecedores', coalesce((select lista from fornecedores_json), '[]'::jsonb)
);
$$;
