-- ═════════════════════════════════════════════════════════════════════════════
-- Compras: só insumo entra
--
-- "Produto para Venda" (tipo_item = produto_final) é o que a casa produz e
-- vende: porções, combos, drinks. Nunca se compra pronto (nenhum foi
-- comprado em 180 dias). Alguns têm ficha técnica vinculada pelo
-- item_produzido_id e já saíam; os outros (Contra filé 400g, Combo churrasco,
-- Gin Granberry, Carpaccio...) continuavam aparecendo em Compras e na
-- Revisão. Regra fechada: só tipo_item = 'insumo' é comprável.
-- Só muda o CTE "base" de fn_reposicao_central.
-- ═════════════════════════════════════════════════════════════════════════════

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
em_lista as (
  select li.item_id, sum(greatest(li.quantidade_comprar, 0)) as qtd
    from listas_compra_itens li
    join listas_compra l on l.id = li.lista_id
   where l.status in ('aberta', 'em_andamento') and li.comprado = false and li.nao_encontrado = false
     and l.data_lista >= current_date - case when l.tipo_compra = 'fornecedor' then 30 else 7 end
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
     -- Só insumo se compra. Produto para venda (porção, combo, drink) é produção.
     and i.tipo_item = 'insumo'
     and not exists (select 1 from fichas_tecnicas ft where ft.item_produzido_id = i.id)
),
calc as (
  select b.*,
         round(b.ponto, 3) as alvo_calc,
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
