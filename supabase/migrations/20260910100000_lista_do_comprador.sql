-- ═══════════════════════════════════════════════════════════════════════════
-- LISTA DO COMPRADOR
--
-- Gerar pedido em "Compras da semana" criava só a entrada pendente em Receber
-- mercadoria. Quem sai para comprar ficava sem lista na mão. Agora todo pedido
-- e toda lista de rua gerados no dia caem numa única lista de compras do dia
-- (listas_compra), que o comprador abre no celular pelo link público,
-- agrupada por fornecedor, e vai marcando. Quando a nota é recebida, os itens
-- ligados ao pedido se marcam sozinhos (trigger já existente).
-- ═══════════════════════════════════════════════════════════════════════════

-- A lista de compras do dia (cria se não existir).
create or replace function public.fn_lista_do_dia()
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from listas_compra
   where gerado_por = 'Compras da semana' and status in ('aberta', 'em_andamento')
     and criado_em::date = current_date
   order by criado_em desc limit 1;
  if v_id is null then
    insert into listas_compra (titulo, tipo_compra, status, gerado_por, observacoes)
    values ('Compras de ' || to_char(current_date, 'DD/MM/YYYY'), 'todos', 'aberta', 'Compras da semana',
            'Lista do comprador: pedidos aos fornecedores e compra de rua do dia.')
    returning id into v_id;
  end if;
  return v_id;
end;
$$;

-- Acrescenta (ou atualiza) um item na lista do dia.
create or replace function public.fn_lista_do_dia_item(
  p_lista_id uuid, p_item_id uuid, p_quantidade numeric, p_custo numeric, p_entrada_id uuid, p_tipo_compra text)
returns void
language plpgsql security definer set search_path = public as $$
declare r record; v_existente uuid;
begin
  select i.nome, i.categoria, i.unidade_medida, f.nome as forn_nome, f.telefone as forn_tel,
         coalesce(i.estoque_minimo, 0) as minimo, coalesce(i.ponto_reposicao, 0) as ponto,
         coalesce((select quantidade_atual from saldos_estoque s where s.item_id = i.id
                    and s.estoque_id = (select id from estoques where tipo = 'central' and status = true order by criado_em limit 1)), 0) as saldo
    into r
    from itens_estoque i left join fornecedores f on f.id = i.fornecedor_padrao_id
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
           entrada_compra_id = coalesce(p_entrada_id, entrada_compra_id), tipo_compra = p_tipo_compra
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

-- Pedido ao fornecedor: cria a entrada pendente E põe os itens na lista do dia.
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
    perform fn_lista_do_dia_item(v_lista, (v_item->>'item_id')::uuid, v_qtd, v_custo, v_entrada, 'fornecedor');
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

-- Compra de rua: entra na mesma lista do dia.
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
    perform fn_lista_do_dia_item(v_lista, (v_item->>'item_id')::uuid, v_qtd, v_custo, null, 'rua');
    v_n := v_n + 1; v_valor := v_valor + round(v_custo * v_qtd, 2);
  end loop;
  if v_n = 0 then raise exception 'Nenhum item com quantidade válida'; end if;
  return jsonb_build_object('lista_id', v_lista, 'itens', v_n, 'valor', v_valor,
                            'numero', (select numero from listas_compra where id = v_lista));
end;
$$;

-- Consulta da lista do dia para a tela (sem criar).
create or replace function public.fn_lista_do_dia_resumo()
returns jsonb
language sql stable security definer set search_path = public as $$
  select case when l.id is null then null else jsonb_build_object(
           'lista_id', l.id, 'numero', l.numero, 'titulo', l.titulo, 'status', l.status,
           'itens', (select count(*) from listas_compra_itens i where i.lista_id = l.id),
           'comprados', (select count(*) from listas_compra_itens i where i.lista_id = l.id and i.comprado),
           'valor', l.valor_estimado,
           'fornecedores', (select count(distinct coalesce(fornecedor_nome, 'rua')) from listas_compra_itens i where i.lista_id = l.id)) end
    from (select * from listas_compra
           where gerado_por = 'Compras da semana' and status in ('aberta', 'em_andamento') and criado_em::date = current_date
           order by criado_em desc limit 1) l
  union all select null where not exists (
    select 1 from listas_compra where gerado_por = 'Compras da semana' and status in ('aberta', 'em_andamento') and criado_em::date = current_date)
  limit 1;
$$;

revoke execute on function public.fn_lista_do_dia() from public;
revoke execute on function public.fn_lista_do_dia_item(uuid, uuid, numeric, numeric, uuid, text) from public;
revoke execute on function public.fn_lista_do_dia_resumo() from public;
grant execute on function public.fn_lista_do_dia() to authenticated, service_role;
grant execute on function public.fn_lista_do_dia_item(uuid, uuid, numeric, numeric, uuid, text) to authenticated, service_role;
grant execute on function public.fn_lista_do_dia_resumo() to authenticated, service_role;
