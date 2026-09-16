-- ═════════════════════════════════════════════════════════════════════════════
-- Compras: tirar item da lista de hoje e jogar para amanhã (corte de custo)
--
-- Na planilha de Compras, cada linha ganha "Amanhã": o item sai da lista de
-- hoje e volta sozinho no dia seguinte. Serve para cortar o valor da compra
-- do dia sem mexer no ponto de pedido do cadastro. Pode desfazer a hora que
-- quiser ("Trazer de volta").
--
-- Regra: o item fica escondido enquanto hoje (Cuiabá) <= oculto_ate.
-- Adiar 1 dia = oculto_ate = hoje  → aparece de novo amanhã.
-- ═════════════════════════════════════════════════════════════════════════════

-- ─── 1. Tabela ───────────────────────────────────────────────────────────────
create table if not exists public.compras_adiadas (
  item_id     uuid primary key references public.itens_estoque(id) on delete cascade,
  oculto_ate  date not null,
  adiado_em   timestamptz not null default now(),
  adiado_por  uuid,
  motivo      text
);
create index if not exists idx_compras_adiadas_oculto on public.compras_adiadas(oculto_ate);

alter table public.compras_adiadas enable row level security;
-- Sem policies: só as funções security definer abaixo mexem nela.
revoke all on public.compras_adiadas from public, anon, authenticated;

-- ─── 2. Adiar / trazer de volta ──────────────────────────────────────────────
create or replace function public.fn_compras_adiar(p_item_id uuid, p_dias integer default 1, p_motivo text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_hoje date := (now() at time zone 'America/Cuiaba')::date;
  v_ate  date;
  v_nome text;
begin
  if p_dias is null or p_dias < 1 then p_dias := 1; end if;
  if p_dias > 30 then p_dias := 30; end if;
  v_ate := v_hoje + (p_dias - 1);

  select nome into v_nome from itens_estoque where id = p_item_id;
  if v_nome is null then
    return jsonb_build_object('success', false, 'error', 'Item não encontrado');
  end if;

  insert into compras_adiadas (item_id, oculto_ate, adiado_em, adiado_por, motivo)
  values (p_item_id, v_ate, now(), auth.uid(), nullif(btrim(p_motivo), ''))
  on conflict (item_id) do update
    set oculto_ate = excluded.oculto_ate, adiado_em = now(), adiado_por = excluded.adiado_por, motivo = excluded.motivo;

  -- Faxina: registros vencidos há mais de 30 dias não servem mais.
  delete from compras_adiadas where oculto_ate < v_hoje - 30;

  return jsonb_build_object('success', true, 'item_id', p_item_id, 'nome', v_nome,
                            'adiado_ate', v_ate, 'volta_em', v_ate + 1);
end;
$$;

create or replace function public.fn_compras_adiar_desfazer(p_item_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  delete from compras_adiadas where item_id = p_item_id;
  get diagnostics v_n = row_count;
  return jsonb_build_object('success', true, 'item_id', p_item_id, 'removido', v_n > 0);
end;
$$;

revoke all on function public.fn_compras_adiar(uuid, integer, text) from public, anon;
revoke all on function public.fn_compras_adiar_desfazer(uuid) from public, anon;
grant execute on function public.fn_compras_adiar(uuid, integer, text) to authenticated;
grant execute on function public.fn_compras_adiar_desfazer(uuid) to authenticated;

-- ─── 3. Tela Compras: marca o item adiado ────────────────────────────────────
-- Igual à versão anterior, com o campo 'adiado_ate' em cada item. O item
-- continua vindo (a tela mostra num bloco "Adiados", com o valor cortado);
-- a planilha só esconde.
create or replace function public.fn_compras_tela()
returns jsonb
language sql stable security definer set search_path = public as $$
with r as (select * from fn_reposicao_central()),
hoje as (select (now() at time zone 'America/Cuiaba')::date as d),
adiados as (
  select item_id, oculto_ate from compras_adiadas where oculto_ate >= (select d from hoje)
),
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
    'adiado_ate', ad.oculto_ate,
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
  'hoje', (select d from hoje),
  'itens', coalesce((select lista from itens), '[]'::jsonb),
  'catalogo', coalesce((select lista from catalogo), '[]'::jsonb),
  'listas', coalesce((select lista from listas), '[]'::jsonb),
  'fornecedores', coalesce((select lista from fornecedores_json), '[]'::jsonb)
);
$$;
