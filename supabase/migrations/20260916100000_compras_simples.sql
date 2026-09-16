-- ═══════════════════════════════════════════════════════════════════════════
-- COMPRAS SIMPLES
--
-- Uma regra só: abaixou do ponto de pedido do cadastro, entra na lista.
-- Ponto 5, tem 4 → aparece. Nada de ponto calculado por consumo, nada de
-- "mínimo travado", nada de decidir rua × fornecedor no cadastro do item.
--
-- A origem é escolhida linha a linha, na hora. Ao confirmar, cada destino
-- vira uma lista própria — uma da Rua (para o comprador) e uma por
-- fornecedor (o pedido) — cada uma com seu link. Dentro da lista os itens
-- ficam por categoria. O valor estimado usa a média dos últimos preços pagos.
--
-- 1. listas_compra ganha fornecedor_id / data_lista.
-- 2. Ponto de pedido único no cadastro (ponto_reposicao; o mínimo antigo
--    vira o mesmo número).
-- 3. fn_reposicao_central passa a usar o ponto do cadastro (mesmas colunas +
--    preco_medio, para não quebrar Posição do estoque, Itens e Dashboard).
-- 4. fn_compras_tela / fn_compras_gerar: a tela nova.
-- 5. fn_lista_publica*: o link do comprador (sem depender de RLS).
-- 6. Gatilhos: lista conclui sozinha quando tudo é marcado; nota recebida
--    marca o item na lista certa.
-- 7. Listas abertas dos fluxos antigos são canceladas (nenhuma teve um
--    item marcado). Funções dos fluxos antigos saem.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Estrutura ────────────────────────────────────────────────────────────
alter table public.listas_compra add column if not exists fornecedor_id uuid references public.fornecedores(id);
alter table public.listas_compra add column if not exists fornecedor_nome text;
alter table public.listas_compra add column if not exists fornecedor_tel text;
alter table public.listas_compra add column if not exists data_lista date not null default current_date;
create index if not exists listas_compra_abertas_idx on public.listas_compra (data_lista, status);
create index if not exists listas_compra_itens_item_idx on public.listas_compra_itens (item_id, comprado);
-- Histórico de compras por item/nota não tinha índice: o preço médio varria a tabela inteira.
create index if not exists itens_entrada_compra_item_idx on public.itens_entrada_compra (item_id);
create index if not exists itens_entrada_compra_entrada_idx on public.itens_entrada_compra (entrada_compra_id);

update public.listas_compra set data_lista = criado_em::date where data_lista <> criado_em::date;

-- ─── 2. Um ponto só ──────────────────────────────────────────────────────────
update public.itens_estoque
   set ponto_reposicao = estoque_minimo
 where coalesce(ponto_reposicao, 0) = 0 and coalesce(estoque_minimo, 0) > 0;

-- ─── 3. Preço médio das últimas compras ──────────────────────────────────────
-- Média das últimas 5 compras recebidas (180 dias). Sem histórico → nulo, e
-- quem chama cai no custo médio do cadastro.
create or replace function public.fn_preco_medio_compra(p_item_id uuid)
returns numeric
language sql stable security definer set search_path = public as $$
  select round(avg(preco), 4)
    from (select coalesce(ic.custo_unitario_final, ic.custo_unitario) as preco
            from itens_entrada_compra ic
            join entradas_compras e on e.id = ic.entrada_compra_id
           where ic.item_id = p_item_id and e.status = 'recebido'
             and e.data_compra >= current_date - 180
             and coalesce(ic.custo_unitario_final, ic.custo_unitario) > 0
           order by e.data_compra desc, e.criado_em desc
           limit 5) u;
$$;

-- ─── 4. Motor: ponto do cadastro ─────────────────────────────────────────────
drop function if exists public.fn_reposicao_central(integer, integer);
create function public.fn_reposicao_central(p_dias_historico integer default 90, p_dias_seguranca integer default 2)
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
   where l.status in ('aberta', 'em_andamento') and li.comprado = false
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
),
calc as (
  select b.*,
         round(b.ponto * 2, 3) as alvo_calc,
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

-- ─── 5. Tela Compras ─────────────────────────────────────────────────────────
create or replace function public.fn_compras_tela()
returns jsonb
language sql stable security definer set search_path = public as $$
with r as (select * from fn_reposicao_central()),
-- Última origem usada para o item (90 dias): lista de rua ou fornecedor da lista.
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
-- Fornecedores que já venderam o item (180 dias), com o último preço.
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
   where l.status in ('aberta', 'em_andamento') and li.comprado = false and l.data_lista >= current_date - 7
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
    -- Sugestão de origem: última lista do item → fornecedor padrão do cadastro → tipo do cadastro.
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
    'data', l.data_lista, 'itens', l.total_itens, 'comprados', l.itens_comprados, 'valor', l.valor_estimado)
    order by l.data_lista desc, l.tipo_compra, l.fornecedor_nome nulls first) as lista
  from listas_compra l
  where l.status in ('aberta', 'em_andamento') and l.data_lista >= current_date - 7
),
fornecedores_json as (
  select jsonb_agg(jsonb_build_object('id', f.id, 'nome', f.nome, 'modalidade', f.modalidade, 'telefone', f.telefone) order by f.nome) as lista
    from fornecedores f where f.status = 'ativo'
)
select jsonb_build_object(
  'gerado_em', now(),
  'hoje', (now() at time zone 'America/Cuiaba')::date,
  'itens', coalesce((select lista from itens), '[]'::jsonb),
  'catalogo', coalesce((select lista from catalogo), '[]'::jsonb),
  'listas', coalesce((select lista from listas), '[]'::jsonb),
  'fornecedores', coalesce((select lista from fornecedores_json), '[]'::jsonb)
);
$$;

-- Confirmação. p_linhas: [{"item_id": uuid, "quantidade": n, "destino": "rua"|"fornecedor",
--                          "fornecedor_id": uuid|null, "loja_id": uuid|null, "observacao": text|null}]
-- Cada destino vira (ou reaproveita, se já existe aberta hoje) uma lista própria.
create or replace function public.fn_compras_gerar(p_linhas jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Cuiaba')::date;
  v_central uuid;
  l jsonb; v_item record; v_qtd numeric; v_destino text; v_forn uuid; v_loja uuid;
  v_lista uuid; v_forn_nome text; v_forn_tel text; v_loja_nome text;
  v_preco numeric; v_saldo numeric; v_existente uuid;
  v_resultado jsonb := '[]'::jsonb; v_ids uuid[] := '{}';
  v_n int := 0;
begin
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'Nenhuma linha para gerar';
  end if;
  select id into v_central from estoques where tipo = 'central' and status = true order by criado_em limit 1;

  -- Validação antes de gravar qualquer coisa.
  for l in select * from jsonb_array_elements(p_linhas) loop
    if coalesce((l->>'quantidade')::numeric, 0) <= 0 then continue; end if;
    v_destino := coalesce(l->>'destino', '');
    if v_destino not in ('rua', 'fornecedor') then
      raise exception 'Escolha Rua ou um fornecedor para %', (select nome from itens_estoque where id = (l->>'item_id')::uuid);
    end if;
    if v_destino = 'fornecedor' then
      v_forn := nullif(l->>'fornecedor_id', '')::uuid;
      if v_forn is null or not exists (select 1 from fornecedores where id = v_forn and status = 'ativo') then
        raise exception 'Fornecedor inválido para %', (select nome from itens_estoque where id = (l->>'item_id')::uuid);
      end if;
    end if;
    if not exists (select 1 from itens_estoque where id = (l->>'item_id')::uuid and status = 'ativo') then
      raise exception 'Item inválido: %', l->>'item_id';
    end if;
  end loop;

  for l in select * from jsonb_array_elements(p_linhas) loop
    v_qtd := coalesce((l->>'quantidade')::numeric, 0);
    if v_qtd <= 0 then continue; end if;
    v_destino := l->>'destino';
    v_forn := case when v_destino = 'fornecedor' then (l->>'fornecedor_id')::uuid else null end;
    v_loja := case when v_destino = 'rua' then nullif(l->>'loja_id', '')::uuid else null end;

    select i.*, coalesce(fn_preco_medio_compra(i.id), i.custo_medio, 0) as preco into v_item
      from itens_estoque i where i.id = (l->>'item_id')::uuid;
    v_preco := v_item.preco;
    select coalesce(quantidade_atual, 0) into v_saldo from saldos_estoque where item_id = v_item.id and estoque_id = v_central;

    -- Lista do destino (hoje, aberta) — cria se não existe.
    select id, fornecedor_nome, fornecedor_tel into v_lista, v_forn_nome, v_forn_tel
      from listas_compra
     where data_lista = v_hoje and status in ('aberta', 'em_andamento')
       and tipo_compra = v_destino and fornecedor_id is not distinct from v_forn
     order by criado_em desc limit 1;

    if v_lista is null then
      if v_forn is not null then
        select nome, telefone into v_forn_nome, v_forn_tel from fornecedores where id = v_forn;
      else
        v_forn_nome := null; v_forn_tel := null;
      end if;
      insert into listas_compra (titulo, tipo_compra, status, gerado_por, data_lista, fornecedor_id, fornecedor_nome, fornecedor_tel, observacoes)
      values (case when v_destino = 'rua' then 'Rua · ' || to_char(v_hoje, 'DD/MM/YYYY')
                   else 'Pedido · ' || v_forn_nome || ' · ' || to_char(v_hoje, 'DD/MM/YYYY') end,
              v_destino, 'aberta', 'Compras', v_hoje, v_forn, v_forn_nome, v_forn_tel,
              case when v_destino = 'rua' then 'Lista do comprador: o que buscar na rua hoje.'
                   else 'Pedido para o fornecedor. Quando a nota chegar, lançar em Receber mercadoria.' end)
      returning id into v_lista;
    end if;

    v_loja_nome := null;
    if v_loja is not null then select nome into v_loja_nome from fornecedores where id = v_loja; end if;

    select id into v_existente from listas_compra_itens
     where lista_id = v_lista and item_id = v_item.id and comprado = false limit 1;

    if v_existente is not null then
      update listas_compra_itens
         set quantidade_comprar = v_qtd, quantidade_sugerida = v_qtd,
             custo_unitario = v_preco, custo_estimado = round(v_preco * v_qtd, 2),
             estoque_atual = coalesce(v_saldo, 0),
             observacao = coalesce(nullif(l->>'observacao', ''), observacao),
             fornecedor_nome = coalesce(v_loja_nome, fornecedor_nome)
       where id = v_existente;
    else
      insert into listas_compra_itens (lista_id, item_id, nome_item, categoria, unidade_medida, tipo_compra,
                                       fornecedor_nome, fornecedor_tel, estoque_atual, estoque_minimo, ponto_reposicao,
                                       quantidade_sugerida, quantidade_comprar, custo_unitario, custo_estimado, observacao, ordem)
      values (v_lista, v_item.id, v_item.nome, v_item.categoria, v_item.unidade_medida, v_destino,
              coalesce(v_loja_nome, v_forn_nome), v_forn_tel, coalesce(v_saldo, 0),
              coalesce(v_item.estoque_minimo, 0), coalesce(nullif(v_item.ponto_reposicao, 0), v_item.estoque_minimo, 0),
              v_qtd, v_qtd, v_preco, round(v_preco * v_qtd, 2), nullif(l->>'observacao', ''),
              (select coalesce(max(ordem), 0) + 1 from listas_compra_itens where lista_id = v_lista));
    end if;

    v_n := v_n + 1;
    if not (v_lista = any (v_ids)) then v_ids := v_ids || v_lista; end if;
  end loop;

  if v_n = 0 then raise exception 'Nenhum item com quantidade válida'; end if;

  select jsonb_agg(jsonb_build_object(
           'lista_id', l2.id, 'numero', l2.numero, 'titulo', l2.titulo, 'tipo', l2.tipo_compra,
           'fornecedor_id', l2.fornecedor_id, 'fornecedor_nome', l2.fornecedor_nome, 'fornecedor_tel', l2.fornecedor_tel,
           'data', l2.data_lista, 'itens', l2.total_itens, 'comprados', l2.itens_comprados, 'valor', l2.valor_estimado)
           order by l2.tipo_compra, l2.fornecedor_nome nulls first)
    into v_resultado
    from listas_compra l2 where l2.id = any (v_ids);

  return jsonb_build_object('linhas', v_n, 'listas', coalesce(v_resultado, '[]'::jsonb));
end;
$$;

-- Gestor: cancelar ou concluir uma lista.
create or replace function public.fn_lista_status(p_lista_id uuid, p_status text)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_status not in ('concluida', 'cancelada', 'aberta') then raise exception 'Status inválido'; end if;
  update listas_compra
     set status = p_status,
         concluido_em = case when p_status = 'concluida' then now() else null end,
         atualizado_em = now()
   where id = p_lista_id;
  if not found then raise exception 'Lista não encontrada'; end if;
  return jsonb_build_object('lista_id', p_lista_id, 'status', p_status);
end;
$$;

-- ─── 6. Link público (comprador / fornecedor) ────────────────────────────────
create or replace function public.fn_lista_publica(p_lista_id uuid)
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when l.id is null then null else jsonb_build_object(
    'lista', jsonb_build_object(
      'lista_id', l.id, 'numero', l.numero, 'titulo', l.titulo, 'tipo', l.tipo_compra, 'status', l.status,
      'fornecedor_id', l.fornecedor_id, 'fornecedor_nome', l.fornecedor_nome, 'fornecedor_tel', l.fornecedor_tel,
      'data', l.data_lista, 'itens', l.total_itens, 'comprados', l.itens_comprados, 'valor', l.valor_estimado,
      'observacoes', l.observacoes, 'criado_em', l.criado_em, 'concluido_em', l.concluido_em),
    'itens', coalesce((select jsonb_agg(jsonb_build_object(
       'id', i.id, 'item_id', i.item_id, 'nome', i.nome_item, 'categoria', i.categoria, 'um', i.unidade_medida,
       'quantidade', i.quantidade_comprar, 'preco', i.custo_unitario, 'estimado', i.custo_estimado,
       'comprado', i.comprado, 'comprado_em', i.comprado_em, 'observacao', i.observacao,
       'loja', case when l.tipo_compra = 'rua' then i.fornecedor_nome else null end)
       order by i.categoria nulls last, i.nome_item)
       from listas_compra_itens i where i.lista_id = l.id), '[]'::jsonb)
  ) end
  from (select * from listas_compra where id = p_lista_id) l
  union all select null where not exists (select 1 from listas_compra where id = p_lista_id)
  limit 1;
$$;

create or replace function public.fn_lista_publica_marcar(p_item_id uuid, p_comprado boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_lista uuid;
begin
  update listas_compra_itens
     set comprado = p_comprado, comprado_em = case when p_comprado then now() else null end
   where id = p_item_id
     and lista_id in (select id from listas_compra where status in ('aberta', 'em_andamento'))
  returning lista_id into v_lista;
  if v_lista is null then raise exception 'Item não encontrado ou lista já fechada'; end if;
  return (select jsonb_build_object('lista_id', id, 'status', status, 'itens', total_itens, 'comprados', itens_comprados)
            from listas_compra where id = v_lista);
end;
$$;

create or replace function public.fn_lista_publica_concluir(p_lista_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  update listas_compra set status = 'concluida', concluido_em = now(), atualizado_em = now()
   where id = p_lista_id and status in ('aberta', 'em_andamento');
  if not found then raise exception 'Lista não encontrada ou já fechada'; end if;
  return jsonb_build_object('lista_id', p_lista_id, 'status', 'concluida');
end;
$$;

-- ─── 7. Gatilhos ─────────────────────────────────────────────────────────────
-- Contadores + conclusão automática quando tudo foi marcado.
create or replace function public.atualizar_contadores_lista()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lista uuid := coalesce(new.lista_id, old.lista_id); v_total int; v_comprados int;
begin
  select count(*), count(*) filter (where comprado) into v_total, v_comprados
    from listas_compra_itens where lista_id = v_lista;
  update listas_compra
     set total_itens = v_total, itens_comprados = v_comprados,
         valor_estimado = (select coalesce(sum(custo_estimado), 0) from listas_compra_itens where lista_id = v_lista),
         status = case when v_total > 0 and v_comprados = v_total and status in ('aberta', 'em_andamento') then 'concluida'
                       when v_comprados > 0 and v_comprados < v_total and status = 'aberta' then 'em_andamento'
                       else status end,
         concluido_em = case when v_total > 0 and v_comprados = v_total and status in ('aberta', 'em_andamento') then now() else concluido_em end,
         atualizado_em = now()
   where id = v_lista;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Nota recebida marca o item na lista certa: pedido do mesmo fornecedor, ou
-- lista da Rua quando a nota é de loja de rua / sem fornecedor.
create or replace function public.fn_lista_marcar_recebido()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rua boolean;
begin
  if new.status = 'recebido' and coalesce(old.status, '') <> 'recebido' then
    v_rua := new.fornecedor_id is null
             or exists (select 1 from fornecedores f where f.id = new.fornecedor_id and f.modalidade = 'rua');

    update listas_compra_itens li
       set comprado = true, comprado_em = now()
      from listas_compra l
     where l.id = li.lista_id and li.comprado = false
       and l.status in ('aberta', 'em_andamento') and l.data_lista >= current_date - 7
       and li.item_id in (select item_id from itens_entrada_compra where entrada_compra_id = new.id)
       and ((l.tipo_compra = 'fornecedor' and l.fornecedor_id = new.fornecedor_id)
            or (l.tipo_compra = 'rua' and v_rua)
            or li.entrada_compra_id = new.id);
  end if;
  return new;
end;
$$;

-- ─── 8. Limpeza dos fluxos antigos ───────────────────────────────────────────
-- Listas abertas de antes de hoje: nenhuma teve um item marcado; ficariam
-- travando sugestão como "já em lista".
update public.listas_compra
   set status = 'cancelada', atualizado_em = now(),
       observacoes = coalesce(observacoes || E'\n', '') || 'Cancelada em 16/09/2026 na reforma de Compras (fluxo antigo, nenhum item marcado).'
 where status in ('aberta', 'em_andamento') and data_lista < (now() at time zone 'America/Cuiaba')::date;

drop function if exists public.fn_compras_do_dia();
drop function if exists public.fn_compras_decidir(jsonb);
drop function if exists public.fn_gerar_lista_rua(jsonb, text);
drop function if exists public.fn_gerar_pedido_compra(uuid, jsonb, text);
drop function if exists public.fn_lista_do_dia();
drop function if exists public.fn_lista_do_dia_item(uuid, uuid, numeric, numeric, uuid, text);
drop function if exists public.fn_lista_do_dia_item(uuid, uuid, numeric, numeric, uuid, text, uuid);
drop function if exists public.fn_lista_do_dia_resumo();
drop function if exists public.fn_fornecedores_conhecidos();

-- ─── 9. Permissões ───────────────────────────────────────────────────────────
-- No Supabase a anon recebe execute por privilégio padrão; revogar de public
-- não basta, tem que tirar da anon também. Só o link do comprador é público.
revoke execute on function public.fn_preco_medio_compra(uuid) from public, anon;
revoke execute on function public.fn_reposicao_central(integer, integer) from public, anon;
revoke execute on function public.fn_compras_tela() from public, anon;
revoke execute on function public.fn_compras_gerar(jsonb) from public, anon;
revoke execute on function public.fn_lista_status(uuid, text) from public, anon;
grant execute on function public.fn_preco_medio_compra(uuid) to authenticated, service_role;
grant execute on function public.fn_reposicao_central(integer, integer) to authenticated, service_role;
grant execute on function public.fn_compras_tela() to authenticated, service_role;
grant execute on function public.fn_compras_gerar(jsonb) to authenticated, service_role;
grant execute on function public.fn_lista_status(uuid, text) to authenticated, service_role;
-- O link do comprador é público (anon), como o da contagem e o do pedido de setor.
grant execute on function public.fn_lista_publica(uuid) to anon, authenticated, service_role;
grant execute on function public.fn_lista_publica_marcar(uuid, boolean) to anon, authenticated, service_role;
grant execute on function public.fn_lista_publica_concluir(uuid) to anon, authenticated, service_role;
