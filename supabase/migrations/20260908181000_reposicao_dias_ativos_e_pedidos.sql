-- ═══════════════════════════════════════════════════════════════════════════
-- REPOSIÇÃO PELO CENTRAL: consumo por dia ativo + RPCs de pedido
--
-- 1. O consumo diário passa a ser medido só nos dias em que a baixa de venda
--    da ZIG estava rodando. Entre 04/08 e 08/09 nada foi baixado, e contar
--    esses dias como "consumo zero" derrubava o ponto de pedido de tudo.
--    Com menos de 14 dias ativos na janela, volta a usar a janela inteira.
-- 2. fn_gerar_pedido_compra: cria uma entrada pendente no Central para um
--    fornecedor com a lista de itens escolhida (tela Compras da semana).
-- 3. fn_gerar_lista_rua: cria uma lista de compras "de rua" com os itens
--    escolhidos, para quem vai ao mercado.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.fn_reposicao_central(
  p_dias_historico integer default 90,
  p_dias_seguranca integer default 2)
returns table (
  item_id uuid, nome text, codigo text, categoria text, unidade_medida text, tipo_compra text,
  fornecedor_id uuid, fornecedor_nome text, fornecedor_telefone text,
  ciclo_dias integer, dias_compra integer[],
  saldo_central numeric, saldo_pontas numeric,
  consumo_dia numeric, cobertura_dias numeric,
  ponto_pedido numeric, alvo numeric, estoque_minimo numeric, minimo_manual boolean,
  em_lista_aberta numeric, em_pedido_pendente numeric,
  quantidade_sugerida numeric, custo_medio numeric, custo_estimado numeric,
  criterio text, situacao text)
language sql
stable
security definer
set search_path = public
as $$
with central as (
  select id from estoques where tipo = 'central' and status = true order by criado_em limit 1
),
dias_ativos as (
  -- Dias da janela em que houve baixa de venda ZIG em algum estoque.
  select distinct m.data_movimentacao as dia
    from movimentacoes_estoque m
   where m.origem_tipo = 'zig'
     and m.data_movimentacao >= current_date - p_dias_historico
),
base_dias as (
  select case when (select count(*) from dias_ativos) >= 14 then (select count(*) from dias_ativos)
              else greatest(p_dias_historico, 1) end as n,
         (select count(*) from dias_ativos) >= 14 as usa_ativos
),
consumo as (
  -- Tudo que saiu do Central por uso real: transferências para as pontas e
  -- baixas de venda. Contagem, zeragem e normalização não são consumo.
  select m.item_id, sum(m.quantidade) as qtd
    from movimentacoes_estoque m
   where m.estoque_origem_id = (select id from central)
     and m.tipo_movimentacao in ('saida', 'transferencia')
     and coalesce(m.origem_tipo, '') not in ('contagem', 'zeragem', 'normalizacao', 'legado')
     and m.data_movimentacao >= current_date - p_dias_historico
     and ((select usa_ativos from base_dias) = false
          or m.data_movimentacao in (select dia from dias_ativos))
   group by 1
),
saldo as (
  select s.item_id,
         sum(case when s.estoque_id = (select id from central) then s.quantidade_atual else 0 end) as central,
         sum(case when s.estoque_id <> (select id from central) then s.quantidade_atual else 0 end) as pontas
    from saldos_estoque s
   group by 1
),
em_lista as (
  select li.item_id, sum(greatest(li.quantidade_comprar, 0)) as qtd
    from listas_compra_itens li
    join listas_compra l on l.id = li.lista_id
   where l.status in ('aberta', 'em_andamento') and li.comprado = false and li.entrada_compra_id is null
   group by 1
),
em_pedido as (
  select ic.item_id, sum(coalesce(ic.quantidade_pedida, ic.quantidade)) as qtd
    from itens_entrada_compra ic
    join entradas_compras c on c.id = ic.entrada_compra_id
   where c.status = 'pendente'
   group by 1
),
base as (
  select i.id as item_id, i.nome, i.codigo, i.categoria, i.unidade_medida,
         coalesce(i.tipo_compra, 'ambos') as tipo_compra,
         f.id as fornecedor_id, f.nome as fornecedor_nome, f.telefone as fornecedor_telefone,
         coalesce(f.ciclo_compra_dias,
                  case when coalesce(i.tipo_compra, 'ambos') = 'fornecedor' then 7 else 3 end) as ciclo_dias,
         f.dias_compra,
         coalesce(s.central, 0) as saldo_central,
         coalesce(s.pontas, 0) as saldo_pontas,
         round(coalesce(c.qtd, 0) / (select n from base_dias), 3) as consumo_dia,
         coalesce(i.estoque_minimo, 0) as estoque_minimo,
         coalesce(i.minimo_manual, false) as minimo_manual,
         coalesce(el.qtd, 0) as em_lista_aberta,
         coalesce(ep.qtd, 0) as em_pedido_pendente,
         coalesce(i.custo_medio, 0) as custo_medio,
         (lower(btrim(coalesce(i.unidade_medida, ''))) = any (array['kg','g','grama','gramas','l','litro','litros','ml','mililitro','mililitros'])) as fracionado
    from itens_estoque i
    left join fornecedores f on f.id = i.fornecedor_padrao_id
    left join saldo s on s.item_id = i.id
    left join consumo c on c.item_id = i.id
    left join em_lista el on el.item_id = i.id
    left join em_pedido ep on ep.item_id = i.id
   where i.status = 'ativo'
),
calc as (
  select b.*,
         case when b.minimo_manual then b.estoque_minimo
              when b.consumo_dia > 0 then round(b.consumo_dia * (b.ciclo_dias + p_dias_seguranca), 2)
              else b.estoque_minimo end as ponto_pedido,
         case when b.minimo_manual then round(b.estoque_minimo * 1.25, 2)
              when b.consumo_dia > 0 then round(b.consumo_dia * (2 * b.ciclo_dias + p_dias_seguranca), 2)
              else round(b.estoque_minimo * 1.25, 2) end as alvo,
         case when b.minimo_manual then 'manual'
              when b.consumo_dia > 0 then 'consumo'
              else 'sem_consumo' end as criterio,
         case when b.consumo_dia > 0 then round(b.saldo_central / b.consumo_dia, 1) else null end as cobertura_dias
    from base b
),
final as (
  select c.*,
         case when c.saldo_central <= c.ponto_pedido and c.ponto_pedido > 0
              then greatest(0, c.alvo - c.saldo_central - c.em_lista_aberta - c.em_pedido_pendente)
              else 0 end as bruto
    from calc c
),
arred as (
  select f.*,
         case when f.fracionado then round(f.bruto, 2) else ceil(f.bruto) end as qtd_sugerida
    from final f
)
select item_id, nome, codigo, categoria, unidade_medida, tipo_compra,
       fornecedor_id, fornecedor_nome, fornecedor_telefone,
       ciclo_dias, dias_compra,
       saldo_central, saldo_pontas,
       consumo_dia, cobertura_dias,
       ponto_pedido, alvo, estoque_minimo, minimo_manual,
       em_lista_aberta, em_pedido_pendente,
       qtd_sugerida as quantidade_sugerida,
       custo_medio, round(qtd_sugerida * custo_medio, 2) as custo_estimado,
       criterio,
       case when saldo_central <= 0 and ponto_pedido > 0 then 'zerado'
            when saldo_central <= ponto_pedido and ponto_pedido > 0 then 'comprar'
            when consumo_dia > 0 and cobertura_dias <= (ciclo_dias + p_dias_seguranca) * 1.5 then 'atencao'
            else 'ok' end as situacao
  from arred
 order by case when saldo_central <= 0 and ponto_pedido > 0 then 0
               when saldo_central <= ponto_pedido and ponto_pedido > 0 then 1
               else 2 end,
          fornecedor_nome nulls last, nome;
$$;

-- Pedido a um fornecedor a partir de itens escolhidos na tela.
-- p_itens: [{"item_id": uuid, "quantidade": n, "custo_unitario": n}]
create or replace function public.fn_gerar_pedido_compra(
  p_fornecedor_id uuid,
  p_itens jsonb,
  p_observacoes text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_central uuid;
  v_entrada uuid;
  v_item jsonb;
  v_qtd numeric;
  v_custo numeric;
  v_total numeric := 0;
  v_n integer := 0;
begin
  select id into v_central from estoques where tipo = 'central' and status = true order by criado_em limit 1;
  if v_central is null then raise exception 'Nenhum estoque do tipo central ativo'; end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then raise exception 'Nenhum item no pedido'; end if;

  insert into entradas_compras (fornecedor_id, estoque_destino_id, data_compra, data_pedido, status,
                                valor_total, valor_produtos, observacoes, condicao_pagamento, criado_por)
  values (p_fornecedor_id, v_central, current_date, current_date, 'pendente',
          0, 0, coalesce(p_observacoes, 'Pedido gerado em Compras da semana'), 'a_vista', auth.uid())
  returning id into v_entrada;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_item->>'quantidade')::numeric;
    if v_qtd is null or v_qtd <= 0 then continue; end if;
    v_custo := coalesce((v_item->>'custo_unitario')::numeric,
                        (select custo_medio from itens_estoque where id = (v_item->>'item_id')::uuid), 0);
    insert into itens_entrada_compra (entrada_compra_id, item_id, quantidade, quantidade_pedida, custo_unitario, custo_total)
    values (v_entrada, (v_item->>'item_id')::uuid, v_qtd, v_qtd, v_custo, round(v_custo * v_qtd, 2));
    v_total := v_total + round(v_custo * v_qtd, 2);
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    delete from entradas_compras where id = v_entrada;
    raise exception 'Nenhum item com quantidade válida';
  end if;

  update entradas_compras set valor_produtos = v_total, valor_total = v_total where id = v_entrada;
  return jsonb_build_object('entrada_id', v_entrada, 'itens', v_n, 'valor', v_total);
end;
$$;

grant execute on function public.fn_gerar_pedido_compra(uuid, jsonb, text) to authenticated, service_role;

-- Lista de compras "de rua" a partir de itens escolhidos.
-- p_itens: [{"item_id": uuid, "quantidade": n}]
create or replace function public.fn_gerar_lista_rua(
  p_itens jsonb,
  p_titulo text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lista uuid;
  v_item jsonb;
  v_qtd numeric;
  v_n integer := 0;
  v_valor numeric := 0;
  r record;
begin
  if p_itens is null or jsonb_array_length(p_itens) = 0 then raise exception 'Nenhum item na lista'; end if;

  insert into listas_compra (titulo, tipo_compra, status, gerado_por, observacoes)
  values (coalesce(p_titulo, 'Compra de rua ' || to_char(current_date, 'DD/MM')), 'rua', 'aberta', 'Compras da semana', null)
  returning id into v_lista;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_item->>'quantidade')::numeric;
    if v_qtd is null or v_qtd <= 0 then continue; end if;
    select i.id, i.nome, i.categoria, i.unidade_medida, coalesce(i.tipo_compra,'ambos') as tipo_compra,
           f.nome as forn_nome, f.telefone as forn_tel, coalesce(i.estoque_minimo, 0) as minimo,
           coalesce(i.ponto_reposicao, 0) as ponto, coalesce(i.custo_medio, 0) as custo,
           coalesce((select quantidade_atual from saldos_estoque s
                      where s.item_id = i.id and s.estoque_id = (select id from estoques where tipo='central' and status = true order by criado_em limit 1)), 0) as saldo
      into r
      from itens_estoque i left join fornecedores f on f.id = i.fornecedor_padrao_id
     where i.id = (v_item->>'item_id')::uuid;
    if r.id is null then continue; end if;

    insert into listas_compra_itens (lista_id, item_id, nome_item, categoria, unidade_medida, tipo_compra,
                                     fornecedor_nome, fornecedor_tel, estoque_atual, estoque_minimo, ponto_reposicao,
                                     quantidade_sugerida, quantidade_comprar, custo_unitario, custo_estimado, ordem)
    values (v_lista, r.id, r.nome, r.categoria, r.unidade_medida, r.tipo_compra,
            r.forn_nome, r.forn_tel, r.saldo, r.minimo, r.ponto,
            v_qtd, v_qtd, r.custo, round(r.custo * v_qtd, 2), v_n);
    v_n := v_n + 1;
    v_valor := v_valor + round(r.custo * v_qtd, 2);
  end loop;

  if v_n = 0 then
    delete from listas_compra where id = v_lista;
    raise exception 'Nenhum item com quantidade válida';
  end if;

  update listas_compra set total_itens = v_n, valor_estimado = v_valor where id = v_lista;
  return jsonb_build_object('lista_id', v_lista, 'itens', v_n, 'valor', v_valor,
                            'numero', (select numero from listas_compra where id = v_lista));
end;
$$;

grant execute on function public.fn_gerar_lista_rua(jsonb, text) to authenticated, service_role;
