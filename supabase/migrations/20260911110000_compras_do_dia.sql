-- ═══════════════════════════════════════════════════════════════════════════
-- COMPRAS DO DIA
--
-- Acaba a divisão "rua × fornecedor" como tipo do item. A origem é decidida
-- linha a linha, no dia, entre os fornecedores conhecidos do item (histórico
-- de notas recebidas + fornecedor preferido). O que distingue os fornecedores
-- é a modalidade: 'entrega' (mandamos pedido, ele entrega) ou 'rua' (o
-- comprador vai até a loja). Pedido a fornecedor de entrega vira entrada
-- pendente + linha na lista do dia; compra em loja de rua vira linha na lista
-- do dia agrupada pela loja.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Modalidade do fornecedor ────────────────────────────────────────────────
alter table public.fornecedores add column if not exists modalidade text not null default 'entrega';
alter table public.fornecedores drop constraint if exists fornecedores_modalidade_check;
alter table public.fornecedores add constraint fornecedores_modalidade_check check (modalidade in ('entrega', 'rua'));
comment on column public.fornecedores.modalidade is 'entrega = fornecedor entrega (gera pedido); rua = comprador vai buscar (entra na lista de rua)';

-- Preenchimento inicial pelo nome (lojas onde o comprador vai). Ajustável no cadastro.
update public.fornecedores set modalidade = 'rua'
 where coalesce(tipo, 'geral') = 'geral'
   and lower(nome) ~ '(atacad|supermerc|mercado|loja|diversos|casa de carne|peixaria|banca |posto |papelaria|lava jato|hortifruti|pao e tudo|pão e tudo|acougue|açougue|big embalag|biglar|assai)';

-- ─── Item da lista do dia: aceita o fornecedor escolhido na hora ─────────────
drop function if exists public.fn_lista_do_dia_item(uuid, uuid, numeric, numeric, uuid, text);
create or replace function public.fn_lista_do_dia_item(
  p_lista_id uuid, p_item_id uuid, p_quantidade numeric, p_custo numeric, p_entrada_id uuid, p_tipo_compra text,
  p_fornecedor_id uuid default null)
returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_existente uuid;
begin
  select i.nome, i.categoria, i.unidade_medida, f.nome as forn_nome, f.telefone as forn_tel,
         coalesce(i.estoque_minimo, 0) as minimo, coalesce(i.ponto_reposicao, 0) as ponto,
         coalesce((select quantidade_atual from saldos_estoque s where s.item_id = i.id
                    and s.estoque_id = (select id from estoques where tipo = 'central' and status = true order by criado_em limit 1)), 0) as saldo
    into r
    from itens_estoque i left join fornecedores f on f.id = coalesce(p_fornecedor_id, i.fornecedor_padrao_id)
   where i.id = p_item_id;
  if r.nome is null then return; end if;

  select id into v_existente from listas_compra_itens
   where lista_id = p_lista_id and item_id = p_item_id and comprado = false
     and (entrada_compra_id is null or entrada_compra_id = p_entrada_id)
   limit 1;

  if v_existente is not null then
    update listas_compra_itens
       set quantidade_comprar = p_quantidade, quantidade_sugerida = p_quantidade,
           custo_unitario = p_custo, custo_estimado = round(p_custo * p_quantidade, 2),
           entrada_compra_id = coalesce(p_entrada_id, entrada_compra_id), tipo_compra = p_tipo_compra,
           fornecedor_nome = r.forn_nome, fornecedor_tel = r.forn_tel
     where id = v_existente;
  else
    insert into listas_compra_itens (lista_id, item_id, nome_item, categoria, unidade_medida, tipo_compra,
                                     fornecedor_nome, fornecedor_tel, estoque_atual, estoque_minimo, ponto_reposicao,
                                     quantidade_sugerida, quantidade_comprar, custo_unitario, custo_estimado, entrada_compra_id, ordem)
    values (p_lista_id, p_item_id, r.nome, r.categoria, r.unidade_medida, p_tipo_compra,
            r.forn_nome, r.forn_tel, r.saldo, r.minimo, r.ponto,
            p_quantidade, p_quantidade, p_custo, round(p_custo * p_quantidade, 2), p_entrada_id,
            (select coalesce(max(ordem), 0) + 1 from listas_compra_itens where lista_id = p_lista_id));
  end if;

  update listas_compra
     set valor_estimado = (select coalesce(sum(custo_estimado), 0) from listas_compra_itens where lista_id = p_lista_id),
         atualizado_em = now()
   where id = p_lista_id;
end;
$$;

-- ─── Pedido ao fornecedor: a linha da lista leva o fornecedor do pedido ───────
create or replace function public.fn_gerar_pedido_compra(
  p_fornecedor_id uuid, p_itens jsonb, p_observacoes text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_central uuid; v_entrada uuid; v_lista uuid; v_item jsonb;
  v_qtd numeric; v_custo numeric; v_total numeric := 0; v_n integer := 0;
begin
  select id into v_central from estoques where tipo = 'central' and status = true order by criado_em limit 1;
  if v_central is null then raise exception 'Nenhum estoque do tipo central ativo'; end if;
  if p_itens is null or jsonb_array_length(p_itens) = 0 then raise exception 'Nenhum item no pedido'; end if;

  insert into entradas_compras (fornecedor_id, estoque_destino_id, data_compra, data_pedido, status,
                                valor_total, valor_produtos, observacoes, condicao_pagamento, criado_por)
  values (p_fornecedor_id, v_central, current_date, current_date, 'pendente',
          0, 0, coalesce(p_observacoes, 'Pedido gerado em Compras da semana'), 'a_vista', auth.uid())
  returning id into v_entrada;

  v_lista := fn_lista_do_dia();

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_item->>'quantidade')::numeric;
    if v_qtd is null or v_qtd <= 0 then continue; end if;
    v_custo := coalesce((v_item->>'custo_unitario')::numeric,
                        (select custo_medio from itens_estoque where id = (v_item->>'item_id')::uuid), 0);
    insert into itens_entrada_compra (entrada_compra_id, item_id, quantidade, quantidade_pedida, custo_unitario, custo_total)
    values (v_entrada, (v_item->>'item_id')::uuid, v_qtd, v_qtd, v_custo, round(v_custo * v_qtd, 2));
    perform fn_lista_do_dia_item(v_lista, (v_item->>'item_id')::uuid, v_qtd, v_custo, v_entrada, 'fornecedor', p_fornecedor_id);
    v_total := v_total + round(v_custo * v_qtd, 2);
    v_n := v_n + 1;
  end loop;

  if v_n = 0 then
    delete from entradas_compras where id = v_entrada;
    raise exception 'Nenhum item com quantidade válida';
  end if;

  update entradas_compras set valor_produtos = v_total, valor_total = v_total where id = v_entrada;
  return jsonb_build_object('entrada_id', v_entrada, 'itens', v_n, 'valor', v_total,
                            'lista_id', v_lista, 'lista_numero', (select numero from listas_compra where id = v_lista));
end;
$$;

-- ─── Compra de rua: cada linha pode dizer em que loja ─────────────────────────
-- p_itens: [{"item_id": uuid, "quantidade": n, "fornecedor_id": uuid|null}]
create or replace function public.fn_gerar_lista_rua(p_itens jsonb, p_titulo text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_lista uuid; v_item jsonb; v_qtd numeric; v_custo numeric; v_n integer := 0; v_valor numeric := 0;
begin
  if p_itens is null or jsonb_array_length(p_itens) = 0 then raise exception 'Nenhum item na lista'; end if;
  v_lista := fn_lista_do_dia();
  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_qtd := (v_item->>'quantidade')::numeric;
    if v_qtd is null or v_qtd <= 0 then continue; end if;
    select coalesce(custo_medio, 0) into v_custo from itens_estoque where id = (v_item->>'item_id')::uuid;
    if v_custo is null then continue; end if;
    perform fn_lista_do_dia_item(v_lista, (v_item->>'item_id')::uuid, v_qtd, v_custo, null, 'rua',
                                 nullif(v_item->>'fornecedor_id', '')::uuid);
    v_n := v_n + 1; v_valor := v_valor + round(v_custo * v_qtd, 2);
  end loop;
  if v_n = 0 then raise exception 'Nenhum item com quantidade válida'; end if;
  return jsonb_build_object('lista_id', v_lista, 'itens', v_n, 'valor', v_valor,
                            'numero', (select numero from listas_compra where id = v_lista));
end;
$$;

-- ─── Fornecedores conhecidos de cada item (histórico de 1 ano + preferido) ───
create or replace function public.fn_fornecedores_conhecidos()
returns table (item_id uuid, fornecedores jsonb)
language sql stable security definer set search_path = public as $$
with hist as (
  select i.item_id, e.fornecedor_id,
         count(distinct e.id) as compras,
         max(e.data_compra) as ultima,
         (array_agg(coalesce(i.custo_unitario_final, i.custo_unitario) order by e.data_compra desc, e.criado_em desc))[1] as ultimo_preco,
         min(coalesce(i.custo_unitario_final, i.custo_unitario))
           filter (where e.data_compra > current_date - 90 and coalesce(i.custo_unitario_final, i.custo_unitario) > 0) as menor_90
    from itens_entrada_compra i
    join entradas_compras e on e.id = i.entrada_compra_id
   where e.status = 'recebido' and e.fornecedor_id is not null and e.data_compra > current_date - 365
   group by i.item_id, e.fornecedor_id
),
todos as (
  select item_id, fornecedor_id, compras, ultima, ultimo_preco, menor_90 from hist
  union all
  select x.id, x.fornecedor_padrao_id, 0, null, null, null
    from itens_estoque x
   where x.fornecedor_padrao_id is not null
     and not exists (select 1 from hist h where h.item_id = x.id and h.fornecedor_id = x.fornecedor_padrao_id)
)
select t.item_id,
       jsonb_agg(jsonb_build_object(
         'fornecedor_id', f.id, 'nome', f.nome, 'telefone', f.telefone, 'modalidade', f.modalidade,
         'dias_compra', f.dias_compra, 'ciclo_dias', f.ciclo_compra_dias,
         'compras', t.compras, 'ultima_data', t.ultima, 'ultimo_preco', t.ultimo_preco, 'menor_preco_90d', t.menor_90,
         'preferido', coalesce(x.fornecedor_padrao_id = f.id, false)
       ) order by coalesce(x.fornecedor_padrao_id = f.id, false) desc, t.compras desc, t.ultima desc nulls last)
  from todos t
  join fornecedores f on f.id = t.fornecedor_id and f.status = 'ativo'
  join itens_estoque x on x.id = t.item_id
 group by t.item_id;
$$;

-- ─── Dados da tela Compras do dia ─────────────────────────────────────────────
create or replace function public.fn_compras_do_dia()
returns jsonb
language sql stable security definer set search_path = public as $$
with fc as (select * from fn_fornecedores_conhecidos()),
r as (select * from fn_reposicao_central() where situacao in ('zerado', 'comprar', 'atencao'))
select jsonb_build_object(
  'gerado_em', now(),
  'lista', fn_lista_do_dia_resumo(),
  'totais', jsonb_build_object(
    'zerado',  (select count(*) from r where situacao = 'zerado'),
    'comprar', (select count(*) from r where situacao = 'comprar'),
    'atencao', (select count(*) from r where situacao = 'atencao')),
  'itens', coalesce((select jsonb_agg(jsonb_build_object(
      'item_id', r.item_id, 'nome', r.nome, 'categoria', r.categoria, 'um', r.unidade_medida,
      'saldo_central', r.saldo_central, 'saldo_pontas', r.saldo_pontas,
      'consumo_dia', r.consumo_dia, 'cobertura_dias', r.cobertura_dias,
      'ponto_pedido', r.ponto_pedido, 'alvo', r.alvo, 'quantidade_sugerida', r.quantidade_sugerida,
      'custo_medio', r.custo_medio, 'criterio', r.criterio, 'situacao', r.situacao,
      'em_lista_aberta', r.em_lista_aberta, 'em_pedido_pendente', r.em_pedido_pendente,
      'fracionado', lower(btrim(coalesce(r.unidade_medida, ''))) = any (array['kg','g','grama','gramas','l','litro','litros','ml','mililitro','mililitros']),
      'fornecedores', coalesce(fc.fornecedores, '[]'::jsonb),
      'origem_sugerida', fc.fornecedores->0
    ) order by case r.situacao when 'zerado' then 0 when 'comprar' then 1 else 2 end, r.categoria nulls last, r.nome)
    from r left join fc on fc.item_id = r.item_id), '[]'::jsonb)
);
$$;

-- ─── Decisão do comprador, linha a linha ──────────────────────────────────────
-- p_linhas: [{"item_id": uuid, "quantidade": n, "fornecedor_id": uuid|null, "modalidade": "entrega"|"rua"}]
create or replace function public.fn_compras_decidir(p_linhas jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l jsonb; v_forn uuid; v_grupo jsonb; res jsonb; v_nome text;
  v_pedidos jsonb := '[]'::jsonb; v_rua jsonb; v_rua_res jsonb; v_n_rua int := 0; v_lista uuid;
begin
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'Nenhuma linha para comprar';
  end if;

  for l in select * from jsonb_array_elements(p_linhas) loop
    if coalesce((l->>'quantidade')::numeric, 0) <= 0 then continue; end if;
    if coalesce(l->>'modalidade', 'entrega') = 'entrega' and nullif(l->>'fornecedor_id', '') is null then
      select nome into v_nome from itens_estoque where id = (l->>'item_id')::uuid;
      raise exception 'Escolha o fornecedor de %', coalesce(v_nome, l->>'item_id');
    end if;
  end loop;

  for v_forn in
    select distinct (x->>'fornecedor_id')::uuid from jsonb_array_elements(p_linhas) x
     where coalesce(x->>'modalidade', 'entrega') = 'entrega' and coalesce((x->>'quantidade')::numeric, 0) > 0
  loop
    select jsonb_agg(jsonb_build_object('item_id', x->>'item_id', 'quantidade', (x->>'quantidade')::numeric)) into v_grupo
      from jsonb_array_elements(p_linhas) x
     where coalesce(x->>'modalidade', 'entrega') = 'entrega'
       and (x->>'fornecedor_id')::uuid = v_forn and coalesce((x->>'quantidade')::numeric, 0) > 0;
    res := fn_gerar_pedido_compra(v_forn, v_grupo, 'Pedido gerado em Compras do dia (' || to_char(current_date, 'DD/MM/YYYY') || ')');
    select nome into v_nome from fornecedores where id = v_forn;
    v_pedidos := v_pedidos || (res || jsonb_build_object('fornecedor_id', v_forn, 'fornecedor_nome', v_nome));
  end loop;

  select jsonb_agg(jsonb_build_object('item_id', x->>'item_id', 'quantidade', (x->>'quantidade')::numeric,
                                      'fornecedor_id', nullif(x->>'fornecedor_id', ''))) into v_rua
    from jsonb_array_elements(p_linhas) x
   where x->>'modalidade' = 'rua' and coalesce((x->>'quantidade')::numeric, 0) > 0;
  if v_rua is not null and jsonb_array_length(v_rua) > 0 then
    v_rua_res := fn_gerar_lista_rua(v_rua);
    v_n_rua := (v_rua_res->>'itens')::int;
  end if;

  if jsonb_array_length(v_pedidos) = 0 and v_n_rua = 0 then
    raise exception 'Nenhum item com quantidade válida';
  end if;

  v_lista := fn_lista_do_dia();
  return jsonb_build_object(
    'pedidos', v_pedidos,
    'rua_itens', v_n_rua, 'rua_valor', coalesce((v_rua_res->>'valor')::numeric, 0),
    'lista_id', v_lista, 'lista_numero', (select numero from listas_compra where id = v_lista));
end;
$$;

-- ─── Permissões ───────────────────────────────────────────────────────────────
revoke execute on function public.fn_lista_do_dia_item(uuid, uuid, numeric, numeric, uuid, text, uuid) from public;
revoke execute on function public.fn_fornecedores_conhecidos() from public;
revoke execute on function public.fn_compras_do_dia() from public;
revoke execute on function public.fn_compras_decidir(jsonb) from public;
grant execute on function public.fn_lista_do_dia_item(uuid, uuid, numeric, numeric, uuid, text, uuid) to authenticated, service_role;
grant execute on function public.fn_fornecedores_conhecidos() to authenticated, service_role;
grant execute on function public.fn_compras_do_dia() to authenticated, service_role;
grant execute on function public.fn_compras_decidir(jsonb) to authenticated, service_role;
