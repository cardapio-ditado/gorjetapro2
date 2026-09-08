-- ═══════════════════════════════════════════════════════════════════════════
-- ESTOQUE: O CENTRAL MANDA NAS COMPRAS
--
-- Até aqui o mínimo era um número por produto comparado ora com o saldo de
-- cada local (Posição do Estoque), ora com a soma de todos os locais (Lista
-- de Compras). Nenhuma tela olhava só o Estoque Central, que é quem compra.
--
-- Esta migração:
--   1. Preenche fornecedor padrão, ciclo e dias de compra a partir do
--      histórico real de notas (com backup).
--   2. Cria o ponto de pedido calculado pelo consumo que sai do Central
--      (fn_reposicao_central), com trava manual por item (minimo_manual).
--   3. Reescreve fn_sugestao_compra e as views de lista para usar só o
--      saldo do Central.
--   4. Cria o nível de balcão por local (itens_estoque_niveis) para a
--      reposição do Bar e da Cozinha, com sugestão (fn_sugerir_reposicao_local).
--   5. Liga a lista de compras ao pedido: fn_lista_compra_gerar_pedidos cria
--      entradas pendentes por fornecedor, e o recebimento marca a lista.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────── 0. Colunas novas ─────────────────────────────

alter table public.fornecedores
  add column if not exists dias_compra integer[];
comment on column public.fornecedores.dias_compra is
  'Dias da semana em que se compra deste fornecedor (1=segunda … 7=domingo). Vazio = qualquer dia.';

alter table public.itens_estoque
  add column if not exists minimo_manual boolean not null default false;
comment on column public.itens_estoque.minimo_manual is
  'Quando true, o ponto de pedido é o estoque_minimo digitado; quando false, é calculado pelo consumo do Central.';

alter table public.listas_compra_itens
  add column if not exists entrada_compra_id uuid references public.entradas_compras(id) on delete set null;

create table if not exists public.itens_estoque_niveis (
  item_id          uuid not null references public.itens_estoque(id) on delete cascade,
  estoque_id       uuid not null references public.estoques(id) on delete cascade,
  nivel_reposicao  numeric not null check (nivel_reposicao >= 0),
  atualizado_em    timestamptz not null default now(),
  primary key (item_id, estoque_id)
);
comment on table public.itens_estoque_niveis is
  'Nível de balcão: quanto cada ponta (Bar, Cozinha) deve ter do item. Serve para a requisição ao Central, não para compra.';
grant select, insert, update, delete on public.itens_estoque_niveis to authenticated, service_role;

-- ─────────────── 1. Cadastro de compras a partir do histórico ───────────────

create table if not exists public._backup_itens_fornecedor_20260908 as
  select id, fornecedor_padrao_id, tipo_compra, estoque_minimo, now() as backup_em from public.itens_estoque;
create table if not exists public._backup_fornecedores_ciclo_20260908 as
  select id, ciclo_compra_dias, now() as backup_em from public.fornecedores;

-- Fornecedor padrão: o fornecedor que respondeu por 60% ou mais das notas do
-- item nos últimos 180 dias.
with compras as (
  select ic.item_id, c.fornecedor_id
    from public.itens_entrada_compra ic
    join public.entradas_compras c on c.id = ic.entrada_compra_id
   where c.status = 'recebido' and c.fornecedor_id is not null
     and c.data_compra >= current_date - 180
), contagem as (
  select item_id, fornecedor_id, count(*) as n, sum(count(*)) over (partition by item_id) as total
    from compras group by 1, 2
), dominante as (
  select distinct on (item_id) item_id, fornecedor_id, n, total
    from contagem order by item_id, n desc
)
update public.itens_estoque i
   set fornecedor_padrao_id = d.fornecedor_id, atualizado_em = now()
  from dominante d
 where i.id = d.item_id and i.status = 'ativo'
   and i.fornecedor_padrao_id is null
   and d.n * 100.0 / d.total >= 60;

-- Ciclo de compra: intervalo médio entre dias de compra (últimos 180 dias),
-- só para fornecedores com pelo menos 4 compras.
with cad as (
  select fornecedor_id, count(distinct data_compra) as dias,
         (max(data_compra) - min(data_compra)) as amplitude
    from public.entradas_compras
   where status = 'recebido' and fornecedor_id is not null and data_compra >= current_date - 180
   group by 1
)
update public.fornecedores f
   set ciclo_compra_dias = least(14, greatest(1, round(cad.amplitude::numeric / greatest(cad.dias - 1, 1))))::integer,
       atualizado_em = now()
  from cad
 where f.id = cad.fornecedor_id and f.ciclo_compra_dias is null and cad.dias >= 4;

-- Dias da semana: os dias que concentram pelo menos 20% das compras do
-- fornecedor, para quem tem 8 ou mais dias de compra no período.
with por_dia as (
  select fornecedor_id, extract(isodow from data_compra)::integer as dow, count(distinct data_compra) as n
    from public.entradas_compras
   where status = 'recebido' and fornecedor_id is not null and data_compra >= current_date - 180
   group by 1, 2
), total as (
  select fornecedor_id, sum(n) as t from por_dia group by 1
), escolhidos as (
  select p.fornecedor_id, array_agg(p.dow order by p.dow) as dias
    from por_dia p join total t on t.fornecedor_id = p.fornecedor_id
   where t.t >= 8 and p.n >= 0.2 * t.t
   group by 1
)
update public.fornecedores f
   set dias_compra = e.dias, atualizado_em = now()
  from escolhidos e
 where f.id = e.fornecedor_id and f.dias_compra is null;

-- ─────────────── 2. Ponto de pedido pelo consumo do Central ─────────────────

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
consumo as (
  -- Tudo que saiu do Central por uso real: transferências para as pontas e
  -- baixas de venda. Contagem, zeragem e normalização não são consumo.
  select m.item_id, sum(m.quantidade) as qtd
    from movimentacoes_estoque m
   where m.estoque_origem_id = (select id from central)
     and m.tipo_movimentacao in ('saida', 'transferencia')
     and coalesce(m.origem_tipo, '') not in ('contagem', 'zeragem', 'normalizacao', 'legado')
     and m.data_movimentacao >= current_date - p_dias_historico
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
         round(coalesce(c.qtd, 0) / greatest(p_dias_historico, 1), 3) as consumo_dia,
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

grant execute on function public.fn_reposicao_central(integer, integer) to authenticated, service_role;

-- ─────────────── 3. Sugestão de compra e views só pelo Central ──────────────

create or replace function public.fn_sugestao_compra(
  p_nivel_alvo text default 'minimo',
  p_ignorar_listas boolean default false)
returns table (
  item_id uuid, nome text, categoria text, unidade_medida text, tipo_compra text,
  fornecedor_nome text, fornecedor_telefone text,
  saldo_atual numeric, estoque_minimo numeric, nivel_ideal numeric, quantidade_alvo numeric,
  em_lista_aberta numeric, quantidade_sugerida numeric, custo_medio numeric, custo_estimado numeric,
  criterio text)
language sql
stable
security definer
set search_path = public
as $$
  select r.item_id, r.nome, r.categoria, r.unidade_medida, r.tipo_compra,
         r.fornecedor_nome, r.fornecedor_telefone,
         r.saldo_central as saldo_atual,
         r.ponto_pedido as estoque_minimo,
         r.alvo as nivel_ideal,
         case when p_nivel_alvo = 'ideal' then r.alvo else r.ponto_pedido end as quantidade_alvo,
         r.em_lista_aberta,
         q.qtd as quantidade_sugerida,
         r.custo_medio,
         round(q.qtd * r.custo_medio, 2) as custo_estimado,
         r.criterio
    from fn_reposicao_central() r
    cross join lateral (
      select case when lower(btrim(coalesce(r.unidade_medida, ''))) = any (array['kg','g','grama','gramas','l','litro','litros','ml','mililitro','mililitros'])
                  then round(x.bruto, 2) else ceil(x.bruto) end as qtd
        from (select greatest(0,
                (case when p_nivel_alvo = 'ideal' then r.alvo else r.ponto_pedido end)
                - r.saldo_central - r.em_pedido_pendente
                - case when p_ignorar_listas then 0 else r.em_lista_aberta end) as bruto) x
    ) q
   where r.ponto_pedido > 0 and r.saldo_central <= r.ponto_pedido and q.qtd > 0
   order by q.qtd desc;
$$;

create or replace view public.vw_lista_compras_rua as
 select ie.id, ie.codigo, ie.nome, ie.unidade_medida, ie.estoque_minimo,
        s.quantidade_atual,
        ie.estoque_minimo - coalesce(s.quantidade_atual, 0) as quantidade_sugerida,
        ie.categoria, ie.tipo_compra, ie.observacoes, ie.custo_medio,
        round((ie.estoque_minimo - coalesce(s.quantidade_atual, 0)) * coalesce(ie.custo_medio, 0), 2) as valor_estimado
   from itens_estoque ie
   left join saldos_estoque s on s.item_id = ie.id
        and s.estoque_id = (select id from estoques where tipo = 'central' and status = true order by criado_em limit 1)
  where ie.status = 'ativo' and ie.tipo_compra = any (array['rua', 'ambos'])
    and coalesce(s.quantidade_atual, 0) < ie.estoque_minimo
  order by ie.categoria, ie.nome;

create or replace view public.vw_lista_compras_fornecedor as
 select ie.id, ie.codigo, ie.nome, ie.unidade_medida, ie.estoque_minimo,
        s.quantidade_atual,
        ie.estoque_minimo - coalesce(s.quantidade_atual, 0) as quantidade_sugerida,
        ie.categoria, ie.tipo_compra, ie.observacoes, ie.custo_medio,
        round((ie.estoque_minimo - coalesce(s.quantidade_atual, 0)) * coalesce(ie.custo_medio, 0), 2) as valor_estimado,
        ie.fornecedor_padrao_id, f.nome as fornecedor_nome, f.telefone as fornecedor_telefone, f.email as fornecedor_email
   from itens_estoque ie
   left join saldos_estoque s on s.item_id = ie.id
        and s.estoque_id = (select id from estoques where tipo = 'central' and status = true order by criado_em limit 1)
   left join fornecedores f on f.id = ie.fornecedor_padrao_id
  where ie.status = 'ativo' and ie.tipo_compra = any (array['fornecedor', 'ambos'])
    and coalesce(s.quantidade_atual, 0) < ie.estoque_minimo
  order by coalesce(f.nome, 'Sem fornecedor'), ie.categoria, ie.nome;

-- ─────────────── 4. Nível de balcão das pontas (Bar, Cozinha) ───────────────

-- Semente: o que cada ponta vendeu pela ZIG entre 06/05 e 03/08 (13 semanas
-- com baixa em dia), média semanal com folga de 50%.
insert into public.itens_estoque_niveis (item_id, estoque_id, nivel_reposicao)
select m.item_id, m.estoque_origem_id,
       case when lower(btrim(coalesce(i.unidade_medida, ''))) = any (array['kg','g','grama','gramas','l','litro','litros','ml','mililitro','mililitros'])
            then round(sum(m.quantidade) / 13 * 1.5, 2)
            else ceil(sum(m.quantidade) / 13 * 1.5) end
  from public.movimentacoes_estoque m
  join public.itens_estoque i on i.id = m.item_id
  join public.estoques e on e.id = m.estoque_origem_id
 where m.origem_tipo = 'zig' and m.tipo_movimentacao = 'saida'
   and m.data_movimentacao between '2026-05-06' and '2026-08-03'
   and e.tipo <> 'central' and i.status = 'ativo'
 group by m.item_id, m.estoque_origem_id, i.unidade_medida
having sum(m.quantidade) > 0
on conflict (item_id, estoque_id) do nothing;

create or replace function public.fn_sugerir_reposicao_local(p_estoque_id uuid)
returns table (
  item_id uuid, nome text, categoria text, unidade_medida text,
  nivel_reposicao numeric, saldo_local numeric, saldo_central numeric,
  quantidade_falta numeric, quantidade_sugerida numeric)
language sql
stable
security definer
set search_path = public
as $$
  with central as (
    select id from estoques where tipo = 'central' and status = true order by criado_em limit 1
  ), base as (
    select i.id as item_id, i.nome, i.categoria, i.unidade_medida,
           n.nivel_reposicao,
           coalesce(sl.quantidade_atual, 0) as saldo_local,
           coalesce(sc.quantidade_atual, 0) as saldo_central,
           (lower(btrim(coalesce(i.unidade_medida, ''))) = any (array['kg','g','grama','gramas','l','litro','litros','ml','mililitro','mililitros'])) as fracionado
      from itens_estoque_niveis n
      join itens_estoque i on i.id = n.item_id and i.status = 'ativo'
      left join saldos_estoque sl on sl.item_id = n.item_id and sl.estoque_id = n.estoque_id
      left join saldos_estoque sc on sc.item_id = n.item_id and sc.estoque_id = (select id from central)
     where n.estoque_id = p_estoque_id
  ), calc as (
    select b.*, greatest(b.nivel_reposicao - b.saldo_local, 0) as falta from base b
  )
  select item_id, nome, categoria, unidade_medida, nivel_reposicao, saldo_local, saldo_central,
         case when fracionado then round(falta, 2) else ceil(falta) end as quantidade_falta,
         case when fracionado then round(least(falta, greatest(saldo_central, 0)), 2)
              else floor(least(ceil(falta), greatest(saldo_central, 0))) end as quantidade_sugerida
    from calc
   where falta > 0
   order by falta / greatest(nivel_reposicao, 0.001) desc, nome;
$$;

grant execute on function public.fn_sugerir_reposicao_local(uuid) to authenticated, service_role;

-- ─────────────── 5. Lista de compras vira pedido ────────────────────────────

create or replace function public.fn_lista_compra_gerar_pedidos(p_lista_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_central uuid;
  v_lista record;
  v_forn record;
  v_item record;
  v_entrada uuid;
  v_total numeric;
  v_qtd_itens integer;
  v_pedidos jsonb := '[]'::jsonb;
  v_sem_fornecedor text[] := '{}';
begin
  select id into v_central from estoques where tipo = 'central' and status = true order by criado_em limit 1;
  if v_central is null then raise exception 'Nenhum estoque do tipo central ativo'; end if;

  select * into v_lista from listas_compra where id = p_lista_id;
  if v_lista.id is null then raise exception 'Lista % não encontrada', p_lista_id; end if;

  -- Itens que ainda não viraram pedido, agrupados pelo fornecedor padrão do item.
  for v_forn in
    select i.fornecedor_padrao_id as fornecedor_id, f.nome as fornecedor_nome
      from listas_compra_itens li
      join itens_estoque i on i.id = li.item_id
      join fornecedores f on f.id = i.fornecedor_padrao_id
     where li.lista_id = p_lista_id
       and li.entrada_compra_id is null and li.comprado = false
       and li.quantidade_comprar > 0
       and coalesce(li.tipo_compra, i.tipo_compra, 'ambos') <> 'rua'
     group by 1, 2
     order by 2
  loop
    insert into entradas_compras (fornecedor_id, estoque_destino_id, data_compra, data_pedido, status,
                                  valor_total, valor_produtos, observacoes, condicao_pagamento)
    values (v_forn.fornecedor_id, v_central, current_date, current_date, 'pendente',
            0, 0, 'Pedido gerado da lista ' || v_lista.numero, 'a_vista')
    returning id into v_entrada;

    v_total := 0; v_qtd_itens := 0;

    for v_item in
      select li.id, li.item_id, li.quantidade_comprar, coalesce(li.custo_unitario, i.custo_medio, 0) as custo
        from listas_compra_itens li
        join itens_estoque i on i.id = li.item_id
       where li.lista_id = p_lista_id
         and li.entrada_compra_id is null and li.comprado = false
         and li.quantidade_comprar > 0
         and i.fornecedor_padrao_id = v_forn.fornecedor_id
         and coalesce(li.tipo_compra, i.tipo_compra, 'ambos') <> 'rua'
    loop
      insert into itens_entrada_compra (entrada_compra_id, item_id, quantidade, quantidade_pedida, custo_unitario, custo_total)
      values (v_entrada, v_item.item_id, v_item.quantidade_comprar, v_item.quantidade_comprar,
              v_item.custo, round(v_item.custo * v_item.quantidade_comprar, 2));
      update listas_compra_itens set entrada_compra_id = v_entrada where id = v_item.id;
      v_total := v_total + round(v_item.custo * v_item.quantidade_comprar, 2);
      v_qtd_itens := v_qtd_itens + 1;
    end loop;

    update entradas_compras set valor_produtos = v_total, valor_total = v_total where id = v_entrada;

    v_pedidos := v_pedidos || jsonb_build_object(
      'entrada_id', v_entrada, 'fornecedor', v_forn.fornecedor_nome,
      'itens', v_qtd_itens, 'valor', v_total);
  end loop;

  select coalesce(array_agg(li.nome_item order by li.nome_item), '{}')
    into v_sem_fornecedor
    from listas_compra_itens li
    join itens_estoque i on i.id = li.item_id
   where li.lista_id = p_lista_id
     and li.entrada_compra_id is null and li.comprado = false and li.quantidade_comprar > 0
     and coalesce(li.tipo_compra, i.tipo_compra, 'ambos') <> 'rua'
     and i.fornecedor_padrao_id is null;

  if jsonb_array_length(v_pedidos) > 0 and v_lista.status = 'aberta' then
    update listas_compra set status = 'em_andamento', atualizado_em = now() where id = p_lista_id;
  end if;

  return jsonb_build_object('pedidos', v_pedidos, 'sem_fornecedor', to_jsonb(v_sem_fornecedor));
end;
$$;

grant execute on function public.fn_lista_compra_gerar_pedidos(uuid) to authenticated, service_role;

-- Quando o pedido é recebido, os itens da lista que o originaram ficam
-- marcados como comprados; se não sobrar nada, a lista é concluída.
create or replace function public.fn_lista_marcar_recebido()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lista uuid;
begin
  if new.status = 'recebido' and coalesce(old.status, '') <> 'recebido' then
    update listas_compra_itens
       set comprado = true, comprado_em = now()
     where entrada_compra_id = new.id and comprado = false;

    for v_lista in select distinct lista_id from listas_compra_itens where entrada_compra_id = new.id loop
      if not exists (select 1 from listas_compra_itens where lista_id = v_lista and comprado = false and quantidade_comprar > 0) then
        update listas_compra set status = 'concluida', concluido_em = now(), atualizado_em = now()
         where id = v_lista and status <> 'concluida';
      end if;
    end loop;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_lista_marcar_recebido on public.entradas_compras;
create trigger trg_lista_marcar_recebido
  after update on public.entradas_compras
  for each row execute function public.fn_lista_marcar_recebido();
