-- ═══════════════════════════════════════════════════════════════════════════
-- PEDIDO DO SETOR PELO LINK, COM CONTAGEM DE BALCÃO
--
-- O bar (e depois a cozinha) abre /pedido/bar no celular, vê a lista de itens
-- com nível de balcão, informa quanto tem em mãos e envia o pedido. Ao enviar:
--   1. nasce a requisição interna (Central → setor) para o estoquista;
--   2. o que foi contado vira contagem do setor (ajuste com origem 'contagem'),
--      para o saldo da ponta ficar igual ao que existe de verdade, inclusive
--      nos itens que não dão baixa pela ZIG (arroz, cebola, descartáveis);
--   3. o estoquista recebe a lista no Telegram.
-- O estoquista entrega pela tela de Requisições informando a quantidade
-- entregue por item; o trigger movimenta o estoque com o que foi entregue.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Resolve o setor pelo slug do link ────────────────────────────────────────
create or replace function public.fn_pedido_setor_estoque(p_setor text)
returns table (estoque_id uuid, estoque_nome text, setor_nome text)
language sql stable security definer set search_path = public as $$
  select e.id, e.nome,
         case lower(trim(p_setor)) when 'bar' then 'Bar' when 'cozinha' then 'Cozinha' else initcap(trim(p_setor)) end
    from estoques e
   where e.status = true and e.tipo <> 'central'
     and lower(e.nome) = case lower(trim(p_setor)) when 'bar' then 'bar' when 'cozinha' then 'cozinha' else lower(trim(p_setor)) end
   limit 1;
$$;

-- ─── Dados da tela do pedido ──────────────────────────────────────────────────
create or replace function public.fn_pedido_setor_dados(p_setor text)
returns jsonb
language sql stable security definer set search_path = public as $$
with s as (select * from fn_pedido_setor_estoque(p_setor)),
central as (select id from estoques where tipo = 'central' and status = true order by criado_em limit 1),
grupo as (
  select n.item_id,
         case when exists (select 1 from mapeamento_itens_vendas m
                            where m.item_estoque_id = n.item_id and m.estoque_id = n.estoque_id and not coalesce(m.ignorar_estoque, false)) then 'vendido'
              when exists (select 1 from ficha_ingredientes fi
                             join mapeamento_itens_vendas m on m.ficha_tecnica_id = fi.ficha_id and m.estoque_id = n.estoque_id
                            where fi.item_estoque_id = n.item_id and coalesce(fi.baixa_estoque, true)) then 'ficha'
              else 'sem_baixa' end as grupo
    from itens_estoque_niveis n where n.estoque_id = (select estoque_id from s)
),
itens as (
  select jsonb_agg(jsonb_build_object(
           'item_id', i.id, 'nome', i.nome, 'categoria', i.categoria, 'um', i.unidade_medida,
           'nivel', n.nivel_reposicao,
           'saldo_local', round(coalesce(sl.quantidade_atual, 0), 3),
           'saldo_central', round(coalesce(sc.quantidade_atual, 0), 3),
           'grupo', g.grupo,
           'fracionado', lower(btrim(coalesce(i.unidade_medida, ''))) = any (array['kg','g','grama','gramas','l','litro','litros','ml','mililitro','mililitros'])
         ) order by i.categoria nulls last, i.nome) as lista
    from itens_estoque_niveis n
    join itens_estoque i on i.id = n.item_id and i.status = 'ativo'
    join grupo g on g.item_id = n.item_id
    left join saldos_estoque sl on sl.item_id = n.item_id and sl.estoque_id = n.estoque_id
    left join saldos_estoque sc on sc.item_id = n.item_id and sc.estoque_id = (select id from central)
   where n.estoque_id = (select estoque_id from s)
),
outros as (
  select jsonb_agg(jsonb_build_object('item_id', i.id, 'nome', i.nome, 'categoria', i.categoria, 'um', i.unidade_medida,
           'saldo_central', round(coalesce(sc.quantidade_atual, 0), 3)) order by i.nome) as lista
    from itens_estoque i
    left join saldos_estoque sc on sc.item_id = i.id and sc.estoque_id = (select id from central)
   where i.status = 'ativo'
     and not exists (select 1 from itens_estoque_niveis n where n.item_id = i.id and n.estoque_id = (select estoque_id from s))
),
pessoas as (
  select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome_completo) order by c.nome_completo) as lista
    from colaboradores c join setores st on st.id = c.setor_id
   where c.status = 'ativo' and lower(st.nome) = lower((select setor_nome from s))
),
ultimos as (
  select jsonb_agg(jsonb_build_object(
           'numero', r.numero_requisicao, 'quando', r.data_requisicao, 'solicitante', r.funcionario_nome,
           'status', r.status, 'itens', (select count(*) from requisicoes_internas_itens ri where ri.requisicao_id = r.id),
           'entregue_em', r.data_conclusao) order by r.data_requisicao desc) as lista
    from (select * from requisicoes_internas
           where estoque_destino_id = (select estoque_id from s)
           order by data_requisicao desc limit 8) r
)
select case when (select estoque_id from s) is null then jsonb_build_object('erro', 'setor desconhecido')
       else jsonb_build_object(
         'setor', (select jsonb_build_object('slug', lower(trim(p_setor)), 'estoque_id', estoque_id, 'nome', setor_nome) from s),
         'central_id', (select id from central),
         'itens', coalesce((select lista from itens), '[]'::jsonb),
         'outros_itens', coalesce((select lista from outros), '[]'::jsonb),
         'pessoas', coalesce((select lista from pessoas), '[]'::jsonb),
         'ultimos_pedidos', coalesce((select lista from ultimos), '[]'::jsonb)
       ) end;
$$;

-- ─── Envio do pedido com contagem ─────────────────────────────────────────────
-- p_itens: [{"item_id": uuid, "contado": n|null, "pedir": n}]
create or replace function public.fn_pedido_setor_enviar(
  p_setor text, p_nome text, p_itens jsonb, p_observacoes text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_est record;
  v_central uuid;
  v_req_id uuid;
  v_numero text;
  v_item jsonb;
  v_item_id uuid;
  v_pedir numeric;
  v_contado numeric;
  v_saldo numeric;
  v_diff numeric;
  v_custo numeric;
  v_n_itens int := 0;
  v_n_contagens int := 0;
  v_linhas text := '';
  v_faltas text := '';
  v_nome_item text;
  v_um text;
  v_saldo_central numeric;
  v_dest record;
  v_msg text;
begin
  select * into v_est from fn_pedido_setor_estoque(p_setor);
  if v_est.estoque_id is null then raise exception 'Setor desconhecido: %', p_setor; end if;
  select id into v_central from estoques where tipo = 'central' and status = true order by criado_em limit 1;
  if v_central is null then raise exception 'Estoque central não encontrado'; end if;
  if p_nome is null or btrim(p_nome) = '' then raise exception 'Informe quem está pedindo'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then raise exception 'Itens inválidos'; end if;

  -- 1. Requisição (criada já com os itens; o número vem do trigger)
  insert into requisicoes_internas (numero_requisicao, data_requisicao, funcionario_nome, setor,
                                    estoque_origem_id, estoque_destino_id, status, observacoes, criado_anonimamente)
  values ('', now(), btrim(p_nome), v_est.setor_nome, v_central, v_est.estoque_id, 'pendente',
          nullif(btrim(coalesce(p_observacoes, '')), ''), true)
  returning id, numero_requisicao into v_req_id, v_numero;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_item_id := (v_item->>'item_id')::uuid;
    v_pedir   := coalesce((v_item->>'pedir')::numeric, 0);
    v_contado := case when v_item ? 'contado' and (v_item->>'contado') is not null and (v_item->>'contado') <> '' then (v_item->>'contado')::numeric else null end;
    select nome, unidade_medida, coalesce(custo_medio, 0) into v_nome_item, v_um, v_custo from itens_estoque where id = v_item_id and status = 'ativo';
    if v_nome_item is null then continue; end if;

    -- 2. Contagem do balcão: o saldo da ponta passa a ser o contado
    if v_contado is not null and v_contado >= 0 then
      v_saldo := fn_saldo_por_movimentacoes(v_item_id, v_est.estoque_id);
      v_diff  := v_contado - v_saldo;
      if abs(v_diff) >= 0.001 then
        insert into movimentacoes_estoque (item_id, tipo_movimentacao, origem_tipo, quantidade,
                                           estoque_origem_id, estoque_destino_id, custo_unitario, custo_total,
                                           data_movimentacao, motivo, observacoes, origem_id, idempotency_key)
        values (v_item_id, case when v_diff > 0 then 'entrada' else 'saida' end, 'contagem', abs(v_diff),
                case when v_diff < 0 then v_est.estoque_id end, case when v_diff > 0 then v_est.estoque_id end,
                v_custo, abs(v_diff) * v_custo, current_date,
                'Contagem do balcão',
                format('Pedido %s · %s contou %s, sistema tinha %s · %s', v_numero, v_est.setor_nome, v_contado, v_saldo, btrim(p_nome)),
                v_req_id, 'balcao_' || v_req_id::text || '_' || v_item_id::text);
        v_n_contagens := v_n_contagens + 1;
      end if;
    end if;

    -- 3. Item do pedido
    if v_pedir > 0 then
      insert into requisicoes_internas_itens (requisicao_id, item_id, quantidade_solicitada, observacao)
      values (v_req_id, v_item_id, v_pedir, nullif(v_item->>'obs', ''));
      v_n_itens := v_n_itens + 1;
      v_linhas := v_linhas || format('• %s %s %s', trim(to_char(v_pedir, 'FM9999990.##')), coalesce(v_um, ''), v_nome_item) || E'\n';
      select coalesce(quantidade_atual, 0) into v_saldo_central from saldos_estoque where item_id = v_item_id and estoque_id = v_central;
      if coalesce(v_saldo_central, 0) < v_pedir then
        v_faltas := v_faltas || format('• %s (Central tem %s)', v_nome_item, trim(to_char(coalesce(v_saldo_central, 0), 'FM9999990.##'))) || E'\n';
      end if;
    end if;
  end loop;

  if v_n_itens = 0 and v_n_contagens = 0 then
    delete from requisicoes_internas where id = v_req_id;
    raise exception 'Nenhum item pedido nem contado';
  end if;
  if v_n_itens = 0 then
    -- Só contagem, sem pedido: não deixa requisição vazia para o estoquista.
    delete from requisicoes_internas where id = v_req_id;
    return jsonb_build_object('numero', null, 'itens', 0, 'contagens', v_n_contagens, 'so_contagem', true);
  end if;

  -- 4. Aviso no Telegram (despachante do banco roda a cada minuto)
  v_msg := format(E'\U0001F9FA <b>Pedido do %s</b> · %s\nPor %s · %s itens\n\n%s', v_est.setor_nome, v_numero, btrim(p_nome), v_n_itens, v_linhas);
  if v_faltas <> '' then v_msg := v_msg || E'\n⚠️ <b>Sem saldo suficiente no Central:</b>\n' || v_faltas; end if;
  if p_observacoes is not null and btrim(p_observacoes) <> '' then v_msg := v_msg || E'\n\U0001F4DD ' || btrim(p_observacoes) || E'\n'; end if;
  v_msg := v_msg || E'\nEntregar em Estoque › Requisições.';
  for v_dest in
    select telegram_chat_id, nome from telegram_usuarios_bot
     where ativo = true and cargo <> 'gestor' and 'estoque' = any(permissoes)
  loop
    insert into telegram_tarefas_programadas (telegram_chat_id, nome_destinatario, mensagem, tipo_recorrencia, ativo, data_inicio, proxima_execucao, observacoes)
    values (v_dest.telegram_chat_id, v_dest.nome, v_msg, 'unica', true, current_date, now(), 'Pedido do setor ' || v_numero);
  end loop;
  if not found then
    for v_dest in select telegram_chat_id, nome from telegram_usuarios_bot where ativo = true and cargo = 'gestor' loop
      insert into telegram_tarefas_programadas (telegram_chat_id, nome_destinatario, mensagem, tipo_recorrencia, ativo, data_inicio, proxima_execucao, observacoes)
      values (v_dest.telegram_chat_id, v_dest.nome, v_msg, 'unica', true, current_date, now(), 'Pedido do setor ' || v_numero);
    end loop;
  end if;

  return jsonb_build_object('id', v_req_id, 'numero', v_numero, 'itens', v_n_itens, 'contagens', v_n_contagens,
                            'faltas', nullif(v_faltas, ''));
end;
$$;

-- ─── Entrega pelo estoquista, com quantidade entregue por item ────────────────
-- p_itens: [{"item_id": uuid, "entregue": n}]  (n pode ser 0 = não entregue)
create or replace function public.fn_requisicao_entregar(p_requisicao_id uuid, p_itens jsonb)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_status text;
  v_item jsonb;
  v_n int := 0;
begin
  select status into v_status from requisicoes_internas where id = p_requisicao_id;
  if v_status is null then raise exception 'Requisição não encontrada'; end if;
  if v_status = 'concluido' then raise exception 'Requisição já entregue'; end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    update requisicoes_internas_itens
       set quantidade_entregue = greatest(coalesce((v_item->>'entregue')::numeric, 0), 0),
           quantidade_aprovada = greatest(coalesce((v_item->>'entregue')::numeric, 0), 0)
     where requisicao_id = p_requisicao_id and item_id = (v_item->>'item_id')::uuid;
    v_n := v_n + 1;
  end loop;

  update requisicoes_internas
     set status = 'concluido', data_conclusao = now(), concluido_por = auth.uid(), updated_at = now()
   where id = p_requisicao_id;

  return jsonb_build_object('id', p_requisicao_id, 'itens_ajustados', v_n);
end;
$$;

-- O trigger de conclusão passa a respeitar quantidade_entregue = 0 (item não
-- entregue). Antes, NULLIF(0) fazia cair na quantidade solicitada.
create or replace function public.processar_requisicao_interna()
returns trigger
language plpgsql security definer as $$
declare
  item_req             record;
  quantidade_processar numeric;
  chave_idempotency    text;
  ja_existe            boolean;
begin
  if new.status != 'concluido' or (old.status is not null and old.status = 'concluido') then
    return new;
  end if;

  for item_req in
    select item_id, quantidade_solicitada, quantidade_aprovada, quantidade_entregue
      from requisicoes_internas_itens where requisicao_id = new.id
  loop
    quantidade_processar := coalesce(item_req.quantidade_entregue,
                                     nullif(item_req.quantidade_aprovada, 0),
                                     item_req.quantidade_solicitada);
    if coalesce(quantidade_processar, 0) <= 0 then continue; end if;

    chave_idempotency := 'req_' || new.id::text || '_' || item_req.item_id::text;
    select exists(select 1 from movimentacoes_estoque where idempotency_key = chave_idempotency) into ja_existe;
    if ja_existe then continue; end if;

    insert into movimentacoes_estoque (
      estoque_origem_id, estoque_destino_id, item_id, tipo_movimentacao, quantidade,
      custo_unitario, custo_total, data_movimentacao, motivo, observacoes,
      criado_por, criado_em, origem_id, origem_tipo, idempotency_key)
    select new.estoque_origem_id, new.estoque_destino_id, item_req.item_id, 'transferencia', quantidade_processar,
           coalesce(ie.custo_medio, 0), quantidade_processar * coalesce(ie.custo_medio, 0),
           new.data_requisicao, 'Transferência por requisição interna',
           concat('Requisição: ', new.numero_requisicao, ' - Solicitante: ', new.funcionario_nome,
                  case when new.setor is not null then concat(' - Setor: ', new.setor) else '' end),
           new.concluido_por, now(), new.id, 'requisicao', chave_idempotency
      from itens_estoque ie where ie.id = item_req.item_id;
  end loop;
  return new;
end;
$$;

-- ─── Permissões ──────────────────────────────────────────────────────────────
revoke execute on function public.fn_pedido_setor_estoque(text) from public;
revoke execute on function public.fn_pedido_setor_dados(text) from public;
revoke execute on function public.fn_pedido_setor_enviar(text, text, jsonb, text) from public;
revoke execute on function public.fn_requisicao_entregar(uuid, jsonb) from public;
grant execute on function public.fn_pedido_setor_estoque(text) to anon, authenticated, service_role;
grant execute on function public.fn_pedido_setor_dados(text) to anon, authenticated, service_role;
grant execute on function public.fn_pedido_setor_enviar(text, text, jsonb, text) to anon, authenticated, service_role;
grant execute on function public.fn_requisicao_entregar(uuid, jsonb) to authenticated, service_role;
