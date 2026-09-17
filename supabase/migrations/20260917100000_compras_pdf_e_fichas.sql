-- ═════════════════════════════════════════════════════════════════════════════
-- Compras: fichas técnicas fora da lista + lista concluída visível (PDF)
--
-- 1. Item produzido por ficha técnica (fichas_tecnicas.item_produzido_id) não
--    se compra, se produz. Sai do motor fn_reposicao_central e, por tabela, da
--    tela de Compras, do catálogo "Incluir item" e do dashboard. Ficam só
--    insumos e produtos de revenda (produto_final sem ficha).
-- 2. fn_lista_publica devolve 'estoque' (saldo do Central na hora de gerar),
--    para o PDF sair igual à planilha da tela.
-- 3. fn_compras_tela passa a trazer também as listas concluídas dos últimos
--    7 dias, para imprimir em PDF depois de concluída.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1. Motor: sem fichas técnicas ───────────────────────────────────────────
create or replace function public.fn_reposicao_central(p_dias_historico integer default 90, p_dias_seguranca integer default 2)
returns table (
  item_id uuid, nome text, codigo text, categoria text, unidade_medida text, tipo_compra text,
  fornecedor_id uuid, fornecedor_nome text, fornecedor_telefone text,
  ciclo_dias integer, dias_compra integer[],
  saldo_central numeric, saldo_pontas numeric,
  consumo_dia numeric, cobertura_dias numeric,
  ponto_pedido numeric, alvo numeric, estoque_minimo numeric, minimo_manual boolean,
  em_lista_aberta numeric, em_pedido_pendente numeric,
  quantidade_sugerida numeric, custo_medio numeric, custo_estimado numeric,
  criterio text, situacao text, preco_medio numeric, preco_origem text)
language sql stable security definer set search_path = public as $$
with central as (
  select id from estoques where tipo = 'central' and status = true order by criado_em limit 1
),
dias_ativos as (
  select distinct m.data_movimentacao as dia
    from movimentacoes_estoque m
   where m.origem_tipo = 'zig' and m.data_movimentacao >= current_date - p_dias_historico
),
base_dias as (
  select case when (select count(*) from dias_ativos) >= 14 then (select count(*) from dias_ativos)
              else greatest(p_dias_historico, 1) end as n,
         (select count(*) from dias_ativos) >= 14 as usa_ativos
),
consumo as (
  select m.item_id, sum(m.quantidade) as qtd
    from movimentacoes_estoque m
   where m.estoque_origem_id = (select id from central)
     and m.tipo_movimentacao in ('saida', 'transferencia')
     and coalesce(m.origem_tipo, '') not in ('contagem', 'zeragem', 'normalizacao', 'legado')
     and m.data_movimentacao >= current_date - p_dias_historico
     and ((select usa_ativos from base_dias) = false or m.data_movimentacao in (select dia from dias_ativos))
   group by 1
),
saldo as (
  select s.item_id,
         sum(case when s.estoque_id = (select id from central) then s.quantidade_atual else 0 end) as central,
         sum(case when s.estoque_id <> (select id from central) then s.quantidade_atual else 0 end) as pontas
    from saldos_estoque s group by 1
),
-- Média das últimas 5 compras recebidas de cada item (180 dias), de uma vez só.
preco as (
  select item_id, round(avg(preco), 4) as preco
    from (select ic.item_id, coalesce(ic.custo_unitario_final, ic.custo_unitario) as preco,
                 row_number() over (partition by ic.item_id order by e.data_compra desc, e.criado_em desc) as rn
            from itens_entrada_compra ic
            join entradas_compras e on e.id = ic.entrada_compra_id
           where e.status = 'recebido' and e.data_compra >= current_date - 180
             and coalesce(ic.custo_unitario_final, ic.custo_unitario) > 0) x
   where rn <= 5
   group by item_id
),
-- Só listas dos últimos 7 dias contam como "já na lista": lista velha não trava compra nova.
em_lista as (
  select li.item_id, sum(greatest(li.quantidade_comprar, 0)) as qtd
    from listas_compra_itens li
    join listas_compra l on l.id = li.lista_id
   where l.status in ('aberta', 'em_andamento') and li.comprado = false and li.nao_encontrado = false
     and l.data_lista >= current_date - 7
   group by 1
),
em_pedido as (
  select ic.item_id, sum(coalesce(ic.quantidade_pedida, ic.quantidade)) as qtd
    from itens_entrada_compra ic
    join entradas_compras c on c.id = ic.entrada_compra_id
   where c.status = 'pendente' and c.data_compra >= current_date - 14
   group by 1
),
base as (
  select i.id as item_id, i.nome, i.codigo, i.categoria, i.unidade_medida,
         coalesce(i.tipo_compra, 'ambos') as tipo_compra,
         f.id as fornecedor_id, f.nome as fornecedor_nome, f.telefone as fornecedor_telefone,
         coalesce(f.ciclo_compra_dias, 7) as ciclo_dias, f.dias_compra,
         coalesce(s.central, 0) as saldo_central,
         coalesce(s.pontas, 0) as pontas,
         round(coalesce(c.qtd, 0) / (select n from base_dias), 3) as consumo_dia,
         coalesce(nullif(i.ponto_reposicao, 0), i.estoque_minimo, 0) as ponto,
         coalesce(el.qtd, 0) as em_lista_aberta,
         coalesce(ep.qtd, 0) as em_pedido_pendente,
         coalesce(i.custo_medio, 0) as custo_medio,
         pr.preco as preco_compra,
         (lower(btrim(coalesce(i.unidade_medida, ''))) = any (array['kg','g','grama','gramas','l','litro','litros','ml','mililitro','mililitros'])) as fracionado
    from itens_estoque i
    left join fornecedores f on f.id = i.fornecedor_padrao_id
    left join saldo s on s.item_id = i.id
    left join consumo c on c.item_id = i.id
    left join em_lista el on el.item_id = i.id
    left join em_pedido ep on ep.item_id = i.id
    left join preco pr on pr.item_id = i.id
   where i.status = 'ativo'
     -- Produzido por ficha técnica: não se compra, se produz.
     and not exists (select 1 from fichas_tecnicas ft where ft.item_produzido_id = i.id)
),
calc as (
  select b.*,
         round(b.ponto, 3) as alvo_calc,   -- compra todo dia: a meta é o próprio ponto
         case when b.consumo_dia > 0 then round(b.saldo_central / b.consumo_dia, 1) else null end as cobertura,
         case when b.ponto <= 0 then 'ok'
              when b.saldo_central <= 0 then 'zerado'
              when b.saldo_central < b.ponto then 'comprar'
              when b.saldo_central <= b.ponto * 1.1 then 'atencao'
              else 'ok' end as sit
    from base b
),
sug as (
  select c.*,
         case when c.sit in ('zerado', 'comprar', 'atencao')
              then greatest(0, c.alvo_calc - c.saldo_central - c.em_lista_aberta - c.em_pedido_pendente)
              else 0 end as bruto
    from calc c
)
select item_id, nome, codigo, categoria, unidade_medida, tipo_compra,
       fornecedor_id, fornecedor_nome, fornecedor_telefone,
       ciclo_dias, dias_compra,
       saldo_central, pontas as saldo_pontas,
       consumo_dia, cobertura as cobertura_dias,
       ponto as ponto_pedido, alvo_calc as alvo, ponto as estoque_minimo, true as minimo_manual,
       em_lista_aberta, em_pedido_pendente,
       (case when fracionado then round(bruto, 2) else ceil(bruto) end) as quantidade_sugerida,
       custo_medio,
       round((case when fracionado then round(bruto, 2) else ceil(bruto) end) * coalesce(preco_compra, custo_medio), 2) as custo_estimado,
       case when ponto > 0 then 'ponto' else 'sem_ponto' end as criterio,
       sit as situacao,
       coalesce(preco_compra, custo_medio) as preco_medio,
       case when preco_compra is not null then 'compras' when custo_medio > 0 then 'custo_medio' else null end as preco_origem
  from sug
 order by case sit when 'zerado' then 0 when 'comprar' then 1 when 'atencao' then 2 else 3 end, categoria nulls last, nome;
$$;

-- ─── 2. Lista pública: saldo do Central na hora de gerar ─────────────────────
create or replace function public.fn_lista_publica(p_lista_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  with usos as (
    select e.fornecedor_id, count(*) as n
      from entradas_compras e
     where e.status = 'recebido' and e.data_compra >= current_date - 180 and e.fornecedor_id is not null
     group by e.fornecedor_id
  )
  select case when l.id is null then null else jsonb_build_object(
    'lista', jsonb_build_object(
      'lista_id', l.id, 'numero', l.numero, 'titulo', l.titulo, 'tipo', l.tipo_compra, 'status', l.status,
      'fornecedor_id', l.fornecedor_id, 'fornecedor_nome', l.fornecedor_nome, 'fornecedor_tel', l.fornecedor_tel,
      'data', l.data_lista, 'itens', l.total_itens, 'comprados', l.itens_comprados, 'nao_encontrados', l.itens_nao_encontrados,
      'valor', l.valor_estimado, 'valor_pago', l.valor_pago,
      'observacoes', l.observacoes, 'criado_em', l.criado_em, 'concluido_em', l.concluido_em),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
       'id', i.id, 'item_id', i.item_id, 'nome', i.nome_item, 'categoria', i.categoria, 'um', i.unidade_medida,
       'estoque', i.estoque_atual, 'ponto', i.ponto_reposicao,
       'quantidade', i.quantidade_comprar, 'preco', i.custo_unitario, 'estimado', i.custo_estimado,
       'comprado', i.comprado, 'comprado_em', i.comprado_em, 'observacao', i.observacao,
       'loja', case when l.tipo_compra = 'rua' then i.fornecedor_nome else null end,
       'loja_id', i.loja_id, 'loja_nome', i.loja_nome,
       'quantidade_comprada', i.quantidade_comprada, 'preco_pago', i.preco_pago, 'valor_pago', i.valor_pago,
       'nao_encontrado', i.nao_encontrado)
       order by i.categoria nulls last, i.nome_item)
       from listas_compra_itens i where i.lista_id = l.id), '[]'::jsonb),
    -- Lojas de rua para os botões, as mais usadas primeiro.
    'lojas', case when l.tipo_compra = 'rua' then coalesce((select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome, 'usos', coalesce(u.n, 0))
                 order by coalesce(u.n, 0) desc, f.nome)
                 from fornecedores f left join usos u on u.fornecedor_id = f.id
                where f.status = 'ativo' and f.modalidade = 'rua'), '[]'::jsonb) else '[]'::jsonb end
  ) end
  from (select * from listas_compra where id = p_lista_id) l
  union all select null where not exists (select 1 from listas_compra where id = p_lista_id)
  limit 1;
$$;

-- ─── 3. Tela Compras: listas concluídas dos últimos 7 dias ───────────────────
-- Muda o CTE "listas" (status concluida entra, com concluido_em). Também
-- devolve dois detalhes que a versão de 20260916140000 tinha perdido ao
-- copiar a primeira versão: "não achou"/"pago" nos cards das listas e o
-- "já na lista" ignorando item marcado como não encontrado.
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
recentes as (
  select ic.item_id, e.fornecedor_id, f.nome, f.modalidade, f.telefone,
         max(e.data_compra) as ultima,
         (array_agg(coalesce(ic.custo_unitario_final, ic.custo_unitario) order by e.data_compra desc, e.criado_em desc))[1] as ultimo_preco,
         count(*) as compras
    from itens_entrada_compra ic
    join entradas_compras e on e.id = ic.entrada_compra_id
    join fornecedores f on f.id = e.fornecedor_id and f.status = 'ativo'
   where e.status = 'recebido' and e.data_compra >= current_date - 180
   group by ic.item_id, e.fornecedor_id, f.nome, f.modalidade, f.telefone
),
recentes_json as (
  select item_id, jsonb_agg(jsonb_build_object(
           'fornecedor_id', fornecedor_id, 'nome', nome, 'modalidade', modalidade, 'telefone', telefone,
           'ultima', ultima, 'ultimo_preco', ultimo_preco, 'compras', compras)
           order by ultima desc) as lista
    from (select *, row_number() over (partition by item_id order by ultima desc) as rn from recentes) x
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
      when uo.tipo = 'rua' then jsonb_build_object('tipo', 'rua')
      when uo.fornecedor_id is not null and uf.modalidade = 'entrega' then jsonb_build_object('tipo', 'fornecedor', 'fornecedor_id', uo.fornecedor_id)
      when uo.fornecedor_id is not null and uf.modalidade = 'rua' then jsonb_build_object('tipo', 'rua')
      when pf.modalidade = 'entrega' then jsonb_build_object('tipo', 'fornecedor', 'fornecedor_id', pf.id)
      when pf.modalidade = 'rua' or r.tipo_compra = 'rua' then jsonb_build_object('tipo', 'rua')
      else null end,
    'recentes', coalesce(rj.lista, '[]'::jsonb)
  ) order by case r.situacao when 'zerado' then 0 when 'comprar' then 1 else 2 end, r.categoria nulls last, r.nome) as lista
  from r
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
