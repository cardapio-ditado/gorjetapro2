-- ═══════════════════════════════════════════════════════════════════════════
-- DASHBOARD DO ESTOQUE COM NÚMEROS DE VERDADE + VALOR EM ESTOQUE NA RAIZ
--
-- O dashboard somava saldos_estoque.valor_total, que o gatilho mantinha como
-- um somatório de custo de entradas e saídas e NUNCA corrigia na contagem:
-- a contagem redefinia a quantidade e deixava o valor intocado. Resultado
-- em 15/09/2026: R$ 357 mil na tela para R$ 62 mil reais (5,8×). Exemplos:
-- OLD PARR 1 garrafa = R$ 9.923; Contra filé 2 g = R$ 7.458.
--
-- 1. Backup da tabela de saldos.
-- 2. O gatilho passa a gravar valor_total = quantidade × custo médio do item
--    em toda movimentação (mesma régua da Posição do estoque e do Extrato).
-- 3. Quando o custo médio do item muda, os saldos dele são reavaliados.
-- 4. Recalcula as 954 linhas existentes.
-- 5. fn_dashboard_estoque(): tudo que o dashboard mostra sai de uma função
--    só, calculada do histórico, sem limit(10) escondido.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Backup ───────────────────────────────────────────────────────────────
create table if not exists public.saldos_estoque_bkp_20260915 as
  select * from public.saldos_estoque;

-- ─── 2. Valor de uma posição = quantidade × custo médio do item ──────────────
create or replace function public.fn_saldo_reavaliar(p_item_id uuid, p_estoque_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_item_id is null or p_estoque_id is null then return; end if;
  update saldos_estoque s
     set valor_total = round(s.quantidade_atual * coalesce(i.custo_medio, 0), 4),
         custo_medio = i.custo_medio
    from itens_estoque i
   where i.id = s.item_id and s.item_id = p_item_id and s.estoque_id = p_estoque_id;
end;
$$;

create or replace function public.atualizar_saldos_movimentacao()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  mov record;
  fator integer;
  eh_contagem boolean;
  saldo_recalculado numeric;
begin
  if TG_OP = 'DELETE' then
    mov := OLD; fator := -1;
  else
    mov := NEW; fator := 1;
  end if;

  if mov.item_id is null then
    if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
  end if;

  eh_contagem := (mov.origem_tipo = 'contagem');

  -- ── ENTRADA ──
  if mov.tipo_movimentacao = 'entrada' and mov.estoque_destino_id is not null then
    if eh_contagem then
      saldo_recalculado := public.fn_saldo_por_movimentacoes(mov.item_id, mov.estoque_destino_id);
      insert into saldos_estoque (estoque_id, item_id, quantidade_atual, valor_total, data_ultima_movimentacao, atualizado_em)
      values (mov.estoque_destino_id, mov.item_id, saldo_recalculado, 0, now(), now())
      on conflict (estoque_id, item_id) do update
        set quantidade_atual = excluded.quantidade_atual,
            data_ultima_movimentacao = now(), atualizado_em = now();
    else
      insert into saldos_estoque (estoque_id, item_id, quantidade_atual, valor_total, data_ultima_movimentacao, atualizado_em)
      values (mov.estoque_destino_id, mov.item_id, mov.quantidade * fator, 0, now(), now())
      on conflict (estoque_id, item_id) do update
        set quantidade_atual = saldos_estoque.quantidade_atual + (mov.quantidade * fator),
            data_ultima_movimentacao = now(), atualizado_em = now();
    end if;

  -- ── SAÍDA ──
  elsif mov.tipo_movimentacao = 'saida' and mov.estoque_origem_id is not null then
    if eh_contagem then
      saldo_recalculado := public.fn_saldo_por_movimentacoes(mov.item_id, mov.estoque_origem_id);
      insert into saldos_estoque (estoque_id, item_id, quantidade_atual, valor_total, data_ultima_movimentacao, atualizado_em)
      values (mov.estoque_origem_id, mov.item_id, saldo_recalculado, 0, now(), now())
      on conflict (estoque_id, item_id) do update
        set quantidade_atual = excluded.quantidade_atual,
            data_ultima_movimentacao = now(), atualizado_em = now();
    else
      insert into saldos_estoque (estoque_id, item_id, quantidade_atual, valor_total, data_ultima_movimentacao, atualizado_em)
      values (mov.estoque_origem_id, mov.item_id, -(mov.quantidade * fator), 0, now(), now())
      on conflict (estoque_id, item_id) do update
        set quantidade_atual = saldos_estoque.quantidade_atual - (mov.quantidade * fator),
            data_ultima_movimentacao = now(), atualizado_em = now();
    end if;

  -- ── TRANSFERÊNCIA ──
  elsif mov.tipo_movimentacao = 'transferencia' then
    if mov.estoque_origem_id is not null then
      insert into saldos_estoque (estoque_id, item_id, quantidade_atual, valor_total, data_ultima_movimentacao, atualizado_em)
      values (mov.estoque_origem_id, mov.item_id, -(mov.quantidade * fator), 0, now(), now())
      on conflict (estoque_id, item_id) do update
        set quantidade_atual = saldos_estoque.quantidade_atual - (mov.quantidade * fator),
            data_ultima_movimentacao = now(), atualizado_em = now();
    end if;
    if mov.estoque_destino_id is not null then
      insert into saldos_estoque (estoque_id, item_id, quantidade_atual, valor_total, data_ultima_movimentacao, atualizado_em)
      values (mov.estoque_destino_id, mov.item_id, mov.quantidade * fator, 0, now(), now())
      on conflict (estoque_id, item_id) do update
        set quantidade_atual = saldos_estoque.quantidade_atual + (mov.quantidade * fator),
            data_ultima_movimentacao = now(), atualizado_em = now();
    end if;

  -- ── AJUSTE (destino soma, origem subtrai — igual à régua) ──
  elsif mov.tipo_movimentacao = 'ajuste' then
    if mov.estoque_destino_id is not null then
      insert into saldos_estoque (estoque_id, item_id, quantidade_atual, valor_total, data_ultima_movimentacao, atualizado_em)
      values (mov.estoque_destino_id, mov.item_id, mov.quantidade * fator, 0, now(), now())
      on conflict (estoque_id, item_id) do update
        set quantidade_atual = saldos_estoque.quantidade_atual + (mov.quantidade * fator),
            data_ultima_movimentacao = now(), atualizado_em = now();
    elsif mov.estoque_origem_id is not null then
      insert into saldos_estoque (estoque_id, item_id, quantidade_atual, valor_total, data_ultima_movimentacao, atualizado_em)
      values (mov.estoque_origem_id, mov.item_id, -(mov.quantidade * fator), 0, now(), now())
      on conflict (estoque_id, item_id) do update
        set quantidade_atual = saldos_estoque.quantidade_atual - (mov.quantidade * fator),
            data_ultima_movimentacao = now(), atualizado_em = now();
    end if;
  end if;

  -- O valor nunca mais anda sozinho: sempre quantidade × custo médio.
  perform public.fn_saldo_reavaliar(mov.item_id, mov.estoque_origem_id);
  perform public.fn_saldo_reavaliar(mov.item_id, mov.estoque_destino_id);

  if TG_OP = 'DELETE' then return OLD; else return NEW; end if;
end;
$$;

-- ─── 3. Custo médio do item mudou → reavalia os saldos dele ──────────────────
create or replace function public.fn_item_custo_medio_alterado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.custo_medio is distinct from old.custo_medio then
    update saldos_estoque
       set valor_total = round(quantidade_atual * coalesce(new.custo_medio, 0), 4),
           custo_medio = new.custo_medio
     where item_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_item_reavaliar_saldos on public.itens_estoque;
create trigger trg_item_reavaliar_saldos
  after update of custo_medio on public.itens_estoque
  for each row execute function public.fn_item_custo_medio_alterado();

-- ─── 4. Corrige o que já estava gravado ──────────────────────────────────────
update public.saldos_estoque s
   set valor_total = round(s.quantidade_atual * coalesce(i.custo_medio, 0), 4),
       custo_medio = i.custo_medio
  from public.itens_estoque i
 where i.id = s.item_id;

-- ─── 5. Dashboard ────────────────────────────────────────────────────────────
create or replace function public.fn_dashboard_estoque()
returns jsonb
language sql stable security definer set search_path = public as $$
with
hoje as (select (now() at time zone 'America/Cuiaba')::date as d),
pos as (
  select s.item_id, s.estoque_id, s.quantidade_atual as qtd,
         s.quantidade_atual * coalesce(i.custo_medio, 0) as valor,
         i.nome, i.categoria, i.unidade_medida as um, i.custo_medio,
         e.nome as estoque
    from saldos_estoque s
    join itens_estoque i on i.id = s.item_id and i.status = 'ativo'
    join estoques e on e.id = s.estoque_id and e.status = true
),
zig_dias as (
  select data_movimentacao as dia, count(*) as movs, count(distinct item_id) as itens
    from movimentacoes_estoque where origem_tipo = 'zig' group by 1
),
ultima_zig as (select * from zig_dias order by dia desc limit 1),
parados as (
  select p.*,
         (select max(m.data_movimentacao) from movimentacoes_estoque m
           where m.item_id = p.item_id and m.estoque_origem_id = p.estoque_id
             and m.tipo_movimentacao in ('saida', 'transferencia')) as ultima_saida
    from pos p where p.qtd > 0
),
parados_60 as (select * from parados where ultima_saida is null or ultima_saida < (select d from hoje) - 60),
repo as (select situacao, count(*) as n from fn_reposicao_central() group by 1),
movs_hoje as (
  select m.id, m.tipo_movimentacao as tipo, m.quantidade as qtd, m.criado_em, m.origem_tipo,
         i.nome as item, i.unidade_medida as um, eo.nome as origem, ed.nome as destino
    from movimentacoes_estoque m
    join itens_estoque i on i.id = m.item_id
    left join estoques eo on eo.id = m.estoque_origem_id
    left join estoques ed on ed.id = m.estoque_destino_id
   where m.data_movimentacao = (select d from hoje)
)
select jsonb_build_object(
  'gerado_em', now(),
  'hoje', (select d from hoje),

  'saude', jsonb_build_object(
    'zig', jsonb_build_object(
      'ultima', (select dia from ultima_zig),
      'itens',  (select itens from ultima_zig),
      'movs',   (select movs from ultima_zig),
      -- a baixa das 6h processa o dia anterior: o esperado é "ontem"
      'dias_atraso', (select d from hoje) - 1 - coalesce((select dia from ultima_zig), (select d from hoje) - 1),
      'dias_sem_baixa_30d', (select count(*) from generate_series((select d from hoje) - 30, (select d from hoje) - 1, interval '1 day') g
                              where not exists (select 1 from zig_dias z where z.dia = g::date)),
      'sem_mapeamento_7d', (select count(*) from mapeamento_itens_vendas
                             where item_estoque_id is null and coalesce(ignorar_estoque, false) = false
                               and coalesce(ultima_utilizacao, atualizado_em, criado_em) >= now() - interval '7 days')
    ),
    'contagens', (select coalesce(jsonb_agg(jsonb_build_object(
                     'estoque', e.nome,
                     'ultima', (select max(c.data_contagem) from contagens_estoque c where c.estoque_id = e.id and c.status = 'processada'))
                     order by e.nome), '[]'::jsonb)
                    from estoques e where e.status = true),
    'divergencias', (select count(*) from vw_conciliacao_saldos),
    'transferencias_pendentes', (select count(*) from requisicoes_internas where status in ('pendente', 'aprovado'))
  ),

  'dinheiro', jsonb_build_object(
    'valor_total',  (select round(coalesce(sum(valor), 0), 2) from pos where qtd > 0),
    'posicoes',     (select count(*) from pos where qtd > 0),
    'itens',        (select count(distinct item_id) from pos where qtd > 0),
    'itens_ativos', (select count(*) from itens_estoque where status = 'ativo'),
    'por_estoque',  (select coalesce(jsonb_agg(to_jsonb(x) order by x.valor desc), '[]'::jsonb)
                       from (select estoque, round(sum(valor), 2) as valor, count(*) as itens from pos where qtd > 0 group by estoque) x),
    'por_categoria',(select coalesce(jsonb_agg(to_jsonb(x) order by x.valor desc), '[]'::jsonb)
                       from (select coalesce(categoria, 'Sem categoria') as categoria, round(sum(valor), 2) as valor, count(*) as itens
                               from pos where qtd > 0 group by 1 order by 2 desc limit 8) x),
    'compras_7d',   (select round(coalesce(sum(custo_total), 0), 2) from movimentacoes_estoque
                      where origem_tipo = 'compra' and tipo_movimentacao = 'entrada' and data_movimentacao >= (select d from hoje) - 7),
    'compras_30d',  (select round(coalesce(sum(custo_total), 0), 2) from movimentacoes_estoque
                      where origem_tipo = 'compra' and tipo_movimentacao = 'entrada' and data_movimentacao >= (select d from hoje) - 30),
    'vendido_7d',   (select round(coalesce(sum(m.quantidade * coalesce(i.custo_medio, 0)), 0), 2)
                       from movimentacoes_estoque m join itens_estoque i on i.id = m.item_id
                      where m.origem_tipo = 'zig' and m.data_movimentacao >= (select d from hoje) - 7),
    'vendido_30d',  (select round(coalesce(sum(m.quantidade * coalesce(i.custo_medio, 0)), 0), 2)
                       from movimentacoes_estoque m join itens_estoque i on i.id = m.item_id
                      where m.origem_tipo = 'zig' and m.data_movimentacao >= (select d from hoje) - 30),
    'parados', jsonb_build_object(
      'posicoes', (select count(*) from parados_60),
      'valor',    (select round(coalesce(sum(valor), 0), 2) from parados_60),
      'lista',    (select coalesce(jsonb_agg(jsonb_build_object(
                     'item_id', item_id, 'estoque_id', estoque_id, 'nome', nome, 'estoque', estoque,
                     'qtd', round(qtd, 3), 'um', um, 'valor', round(valor, 2), 'ultima_saida', ultima_saida)
                     order by valor desc), '[]'::jsonb)
                     from (select * from parados_60 order by valor desc limit 6) t)
    )
  ),

  'acao', jsonb_build_object(
    'central', jsonb_build_object(
      'zerados', coalesce((select n from repo where situacao = 'zerado'), 0),
      'comprar', coalesce((select n from repo where situacao = 'comprar'), 0),
      'atencao', coalesce((select n from repo where situacao = 'atencao'), 0)
    ),
    'negativos', (select coalesce(jsonb_agg(jsonb_build_object(
                    'item_id', item_id, 'estoque_id', estoque_id, 'nome', nome, 'estoque', estoque,
                    'qtd', round(qtd, 3), 'um', um, 'valor', round(valor, 2))
                    order by valor), '[]'::jsonb)
                    from pos where qtd < 0),
    'sem_custo', (select coalesce(jsonb_agg(jsonb_build_object(
                    'item_id', item_id, 'estoque_id', estoque_id, 'nome', nome, 'estoque', estoque, 'qtd', round(qtd, 3), 'um', um)
                    order by nome), '[]'::jsonb)
                    from pos where qtd > 0 and coalesce(custo_medio, 0) = 0),
    'hoje', jsonb_build_object(
      'total',          (select count(*) from movs_hoje),
      'entradas',       (select count(*) from movs_hoje where tipo = 'entrada'),
      'saidas',         (select count(*) from movs_hoje where tipo = 'saida'),
      'transferencias', (select count(*) from movs_hoje where tipo = 'transferencia'),
      'ajustes',        (select count(*) from movs_hoje where tipo = 'ajuste'),
      'ultimas', (select coalesce(jsonb_agg(jsonb_build_object(
                    'id', id, 'tipo', tipo, 'item', item, 'qtd', round(qtd, 3), 'um', um,
                    'origem', origem, 'destino', destino, 'origem_tipo', origem_tipo, 'hora', criado_em)
                    order by criado_em desc), '[]'::jsonb)
                    from (select * from movs_hoje order by criado_em desc limit 12) t)
    )
  )
);
$$;

grant execute on function public.fn_dashboard_estoque() to authenticated, service_role;
grant execute on function public.fn_saldo_reavaliar(uuid, uuid) to authenticated, service_role;
