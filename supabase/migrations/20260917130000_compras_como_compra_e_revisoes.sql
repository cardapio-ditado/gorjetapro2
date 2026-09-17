-- ═════════════════════════════════════════════════════════════════════════════
-- Compras por ponto de pedido, em abas: "como compra" no cadastro
--
-- Regra da casa: tudo entra na lista pelo ponto de pedido do cadastro (manual).
-- O que muda é PARA ONDE o item vai: cada item tem "como compra" (Rua ou um
-- fornecedor), preenchido uma vez pelo histórico e revisado pelo gestor.
--
-- 1. itens_estoque.compra_revisada_em / ponto_revisado_em.
-- 2. Prefill de tipo_compra + fornecedor_padrao_id pelo histórico (só onde
--    ainda está "ambos"). Nada de ponto é calculado.
-- 3. fn_compras_definir_via / fn_compras_definir_via_lote: o gestor confirma.
-- 4. fn_ponto_revisar: zerar / manter / definir o ponto de um item.
-- 5. fn_compras_config: pendentes de "como compra" e pontos que não giram.
-- 6. Pedido de fornecedor segura o item fora da lista por 30 dias (não 7) e
--    a nota recebida fecha o pedido mesmo quando os itens entram depois do
--    cabeçalho.
-- 7. fn_reposicao_central / fn_compras_tela atualizadas ('compra' por item).
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1. Colunas ──────────────────────────────────────────────────────────────
alter table public.itens_estoque
  add column if not exists compra_revisada_em timestamptz,
  add column if not exists ponto_revisado_em  timestamptz;

-- ─── 2. Prefill do "como compra" pelo histórico (180 dias) ───────────────────
with historico as (
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
  select h.item_id, h.fornecedor_id, f.modalidade, max(h.data) as ultima, count(*) as compras
    from historico h join fornecedores f on f.id = h.fornecedor_id and f.status = 'ativo'
   group by 1, 2, 3
),
mais as (
  select distinct on (item_id) item_id, fornecedor_id, modalidade
    from recentes order by item_id, compras desc, ultima desc
)
update itens_estoque i
   set tipo_compra = case when m.modalidade = 'rua' then 'rua' else 'fornecedor' end,
       fornecedor_padrao_id = m.fornecedor_id,
       atualizado_em = now()
  from mais m
 where m.item_id = i.id and i.status = 'ativo'
   and coalesce(i.tipo_compra, 'ambos') = 'ambos' and i.compra_revisada_em is null;

-- ─── 3. Gestor define "como compra" ──────────────────────────────────────────
create or replace function public.fn_compras_definir_via(p_item_id uuid, p_via text, p_fornecedor_id uuid default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_nome text;
begin
  if p_via not in ('rua', 'fornecedor') then raise exception 'Via inválida: use rua ou fornecedor'; end if;
  if p_via = 'fornecedor' and (p_fornecedor_id is null or not exists (select 1 from fornecedores where id = p_fornecedor_id and status = 'ativo')) then
    raise exception 'Escolha um fornecedor ativo';
  end if;
  update itens_estoque
     set tipo_compra = p_via,
         fornecedor_padrao_id = case when p_via = 'fornecedor' then p_fornecedor_id else p_fornecedor_id end,
         compra_revisada_em = now(), atualizado_em = now()
   where id = p_item_id
  returning nome into v_nome;
  if v_nome is null then raise exception 'Item não encontrado'; end if;
  return jsonb_build_object('success', true, 'item_id', p_item_id, 'nome', v_nome, 'via', p_via, 'fornecedor_id', p_fornecedor_id);
end;
$$;

-- Lote: [{item_id, via, fornecedor_id}]
create or replace function public.fn_compras_definir_via_lote(p_itens jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare l jsonb; v_n int := 0;
begin
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then raise exception 'Nada para definir'; end if;
  for l in select * from jsonb_array_elements(p_itens) loop
    perform fn_compras_definir_via((l->>'item_id')::uuid, l->>'via', nullif(l->>'fornecedor_id', '')::uuid);
    v_n := v_n + 1;
  end loop;
  return jsonb_build_object('success', true, 'definidos', v_n);
end;
$$;

-- ─── 4. Revisão do ponto de pedido (manual, um a um) ─────────────────────────
create or replace function public.fn_ponto_revisar(p_item_id uuid, p_acao text, p_ponto numeric default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_nome text; v_ponto numeric;
begin
  if p_acao not in ('zerar', 'manter', 'definir') then raise exception 'Ação inválida'; end if;
  if p_acao = 'definir' and (p_ponto is null or p_ponto < 0) then raise exception 'Informe o ponto'; end if;
  update itens_estoque
     set ponto_reposicao = case when p_acao = 'zerar' then 0 when p_acao = 'definir' then p_ponto else ponto_reposicao end,
         estoque_minimo  = case when p_acao = 'zerar' then 0 when p_acao = 'definir' then p_ponto else estoque_minimo end,
         minimo_manual   = case when p_acao in ('zerar', 'definir') then true else minimo_manual end,
         ponto_revisado_em = now(), atualizado_em = now()
   where id = p_item_id
  returning nome, coalesce(nullif(ponto_reposicao, 0), estoque_minimo, 0) into v_nome, v_ponto;
  if v_nome is null then raise exception 'Item não encontrado'; end if;
  return jsonb_build_object('success', true, 'item_id', p_item_id, 'nome', v_nome, 'ponto', v_ponto);
end;
$$;

-- ─── 5. Motor: pedido de fornecedor segura o item por 30 dias ────────────────
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
-- Lista da Rua vale 7 dias; pedido de fornecedor segura o item por 30 dias
-- (até a nota entrar e fechar o pedido).
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

-- ─── 6. Nota recebida fecha o pedido ─────────────────────────────────────────
create or replace function public.fn_lista_marcar_recebido()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_rua boolean;
begin
  if new.status = 'recebido' and (tg_op = 'INSERT' or coalesce(old.status, '') <> 'recebido') then
    v_rua := new.fornecedor_id is null
             or exists (select 1 from fornecedores f where f.id = new.fornecedor_id and f.modalidade = 'rua');
    update listas_compra_itens li
       set comprado = true, comprado_em = now(), entrada_compra_id = coalesce(li.entrada_compra_id, new.id)
      from listas_compra l
     where l.id = li.lista_id and li.comprado = false
       and l.status in ('aberta', 'em_andamento')
       and l.data_lista >= current_date - case when l.tipo_compra = 'fornecedor' then 30 else 7 end
       and li.item_id in (select item_id from itens_entrada_compra where entrada_compra_id = new.id)
       and ((l.tipo_compra = 'fornecedor' and l.fornecedor_id = new.fornecedor_id)
            or (l.tipo_compra = 'rua' and v_rua)
            or li.entrada_compra_id = new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists trg_lista_marcar_recebido on public.entradas_compras;
create trigger trg_lista_marcar_recebido
  after insert or update on public.entradas_compras
  for each row execute function public.fn_lista_marcar_recebido();

-- Itens que entram depois do cabeçalho já recebido.
create or replace function public.fn_lista_marcar_recebido_item()
returns trigger language plpgsql security definer set search_path = public as $$
declare e record; v_rua boolean;
begin
  select * into e from entradas_compras where id = new.entrada_compra_id;
  if e.id is null or e.status <> 'recebido' then return new; end if;
  v_rua := e.fornecedor_id is null
           or exists (select 1 from fornecedores f where f.id = e.fornecedor_id and f.modalidade = 'rua');
  update listas_compra_itens li
     set comprado = true, comprado_em = now(), entrada_compra_id = coalesce(li.entrada_compra_id, e.id)
    from listas_compra l
   where l.id = li.lista_id and li.comprado = false and li.item_id = new.item_id
     and l.status in ('aberta', 'em_andamento')
     and l.data_lista >= current_date - case when l.tipo_compra = 'fornecedor' then 30 else 7 end
     and ((l.tipo_compra = 'fornecedor' and l.fornecedor_id = e.fornecedor_id)
          or (l.tipo_compra = 'rua' and v_rua));
  return new;
end;
$$;
drop trigger if exists trg_lista_marcar_recebido_item on public.itens_entrada_compra;
create trigger trg_lista_marcar_recebido_item
  after insert on public.itens_entrada_compra
  for each row execute function public.fn_lista_marcar_recebido_item();

-- ─── 7. Configuração: pendentes de "como compra" e pontos que não giram ──────
create or replace function public.fn_compras_config()
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
pend as (
  select jsonb_agg(jsonb_build_object(
      'item_id', i.id, 'nome', i.nome, 'categoria', i.categoria, 'um', i.unidade_medida, 'ponto', r.ponto_pedido,
      'via', case when i.tipo_compra in ('rua', 'fornecedor') then i.tipo_compra else null end,
      'fornecedor_id', i.fornecedor_padrao_id, 'fornecedor_nome', fp.nome, 'fornecedor_modalidade', fp.modalidade,
      'sugestao', case when m.fornecedor_id is not null then jsonb_build_object(
          'via', case when m.modalidade = 'rua' then 'rua' else 'fornecedor' end,
          'fornecedor_id', m.fornecedor_id, 'nome', m.nome, 'modalidade', m.modalidade, 'compras', m.compras) else null end)
      order by (r.ponto_pedido > 0) desc, i.categoria nulls last, i.nome) as lista
    from r
    join itens_estoque i on i.id = r.item_id
    left join fornecedores fp on fp.id = i.fornecedor_padrao_id
    left join mais m on m.item_id = i.id
   where i.compra_revisada_em is null
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
   where r.ponto_pedido > 0 and i.ponto_revisado_em is null
     and (i.categoria in ('Utensílios', 'Equipamentos', 'Material de Escritório', 'Uniformes', 'MANUTENÇÃO  DE CARRO')
          or (r.consumo_dia = 0 and coalesce(f.dias, 0) < 3))
)
select jsonb_build_object(
  'pendentes_via', coalesce((select lista from pend), '[]'::jsonb),
  'pontos_sem_giro', coalesce((select lista from sem_giro), '[]'::jsonb),
  'totais', jsonb_build_object(
     'itens', (select count(*) from r),
     'com_ponto', (select count(*) from r where ponto_pedido > 0),
     'via_rua', (select count(*) from r where tipo_compra = 'rua'),
     'via_fornecedor', (select count(*) from r where tipo_compra = 'fornecedor' and fornecedor_id is not null),
     'sem_via', (select count(*) from r where tipo_compra not in ('rua', 'fornecedor') or (tipo_compra = 'fornecedor' and fornecedor_id is null)),
     'revisados', (select count(*) from r join itens_estoque i on i.id = r.item_id where i.compra_revisada_em is not null))
);
$$;

-- ─── 8. Tela Compras: 'compra' por item (para onde vai) ──────────────────────
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
   where l.status in ('aberta', 'em_andamento') and li.comprado = false and li.nao_encontrado = false
     and l.data_lista >= current_date - case when l.tipo_compra = 'fornecedor' then 30 else 7 end
   group by li.item_id
),
-- Para onde o item vai, pelo cadastro. Fornecedor padrão de modalidade rua = vai
-- na lista da Rua com a loja anotada.
compra as (
  select i.id as item_id,
         jsonb_build_object(
           'via', case when i.tipo_compra = 'rua' then 'rua'
                       when i.tipo_compra = 'fornecedor' and fp.id is not null and fp.modalidade = 'rua' then 'rua'
                       when i.tipo_compra = 'fornecedor' and fp.id is not null then 'fornecedor'
                       else null end,
           'fornecedor_id', fp.id, 'fornecedor_nome', fp.nome, 'fornecedor_tel', fp.telefone, 'modalidade', fp.modalidade,
           'revisada', i.compra_revisada_em is not null) as j
    from itens_estoque i
    left join fornecedores fp on fp.id = i.fornecedor_padrao_id and fp.status = 'ativo'
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
    'compra', cp.j,
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
  left join compra cp on cp.item_id = r.item_id
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
    'saldo', r.saldo_central, 'ponto', r.ponto_pedido, 'preco', r.preco_medio, 'compra', cp.j)
    order by r.nome) as lista
  from r left join compra cp on cp.item_id = r.item_id
  where r.situacao = 'ok'
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
  'conferencia', (select j from conferencia),
  'config', jsonb_build_object(
     'pendentes_via', (select count(*) from r join itens_estoque i on i.id = r.item_id where i.compra_revisada_em is null),
     'pontos_sem_giro', (select count(*) from r join itens_estoque i on i.id = r.item_id
                          where r.ponto_pedido > 0 and i.ponto_revisado_em is null
                            and (i.categoria in ('Utensílios', 'Equipamentos', 'Material de Escritório', 'Uniformes', 'MANUTENÇÃO  DE CARRO')
                                 or (r.consumo_dia = 0 and not exists (select 1 from historico h where h.item_id = r.item_id group by h.item_id having count(distinct h.data) >= 3)))))
);
$$;

-- ─── 9. Permissões ───────────────────────────────────────────────────────────
revoke all on function public.fn_compras_definir_via(uuid, text, uuid) from public, anon;
revoke all on function public.fn_compras_definir_via_lote(jsonb) from public, anon;
revoke all on function public.fn_ponto_revisar(uuid, text, numeric) from public, anon;
revoke all on function public.fn_compras_config() from public, anon;
grant execute on function public.fn_compras_definir_via(uuid, text, uuid) to authenticated;
grant execute on function public.fn_compras_definir_via_lote(jsonb) to authenticated;
grant execute on function public.fn_ponto_revisar(uuid, text, numeric) to authenticated;
grant execute on function public.fn_compras_config() to authenticated;
