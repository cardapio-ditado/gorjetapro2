-- Agente WhatsApp: registro de perdas (cerveja choca, garrafa quebrada,
-- produto vencido ou estragado).
--
-- A perda é uma saída do estoque com origem_tipo = 'perda' e o motivo no
-- campo motivo ("Perda: choca/vencida"), separada de venda e de ajuste de
-- contagem. Pode ser de até 3 dias atrás. Todos que registram fazem direto,
-- sem aprovação; chefe de bar e de cozinha só no próprio setor.

insert into public.agente_permissoes (papel, acao, modo, estoques) values
  ('dono', 'perda', 'direto', null),
  ('gerente_geral', 'perda', 'direto', null),
  ('estoquista', 'perda', 'direto', null),
  ('gerente_noite', 'perda', 'direto', null),
  ('chefe_bar', 'perda', 'direto', array['10b3aacf-61b1-4add-91ac-0949d3e7f3a3']::uuid[]),
  ('chefe_cozinha', 'perda', 'direto', array['1da77d06-f428-49b4-afa7-9ffaa90b8557']::uuid[])
on conflict (papel, acao) do nothing;

create or replace function public.fn_agente_escopo_ok(p_estoques uuid[], p_acao text, p_args jsonb)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_est uuid;
begin
  if p_estoques is null then return true; end if;
  if p_acao = 'transferir' then
    return (p_args->>'de')::uuid = any (p_estoques) and (p_args->>'para')::uuid = any (p_estoques);
  end if;
  if p_acao = 'emprestimo' then
    v_est := nullif(p_args->>'estoque_id', '')::uuid;
    if v_est is null and p_args->>'operacao' = 'devolver' then
      select estoque_id into v_est from emprestimos_vizinhos where id = nullif(p_args->>'emprestimo_id', '')::uuid;
    end if;
    v_est := coalesce(v_est, (select id from estoques where tipo = 'central' and status limit 1));
    return v_est = any (p_estoques);
  end if;
  if p_acao = 'perda' then
    return nullif(p_args->>'estoque_id', '')::uuid = any (p_estoques);
  end if;
  return true;
end $$;

-- Perdas registradas no período, por motivo e por item, nos estoques que a
-- pessoa vê.
create or replace function public.fn_agente_perdas(p_equipe uuid, p_dias int default 7)
returns jsonb language sql stable security definer set search_path = public as $$
  with l as (
    select m.motivo, trim(coalesce(i.nome, m.item_descricao)) as item, e.nome as estoque,
           m.quantidade, coalesce(m.custo_total, m.quantidade * coalesce(m.custo_unitario, 0)) as valor,
           m.data_movimentacao, m.observacoes
      from movimentacoes_estoque m
      left join itens_estoque i on i.id = m.item_id
      left join estoques e on e.id = m.estoque_origem_id
     where m.origem_tipo = 'perda'
       and m.data_movimentacao >= fn_hoje_cuiaba() - greatest(1, least(coalesce(p_dias, 7), 60))
       and m.estoque_origem_id = any (fn_agente_estoques_permitidos(p_equipe, 'consultar'))
  )
  select jsonb_build_object(
    'dias', greatest(1, least(coalesce(p_dias, 7), 60)),
    'total', coalesce((select round(sum(valor), 2) from l), 0),
    'por_motivo', coalesce((select jsonb_agg(jsonb_build_object('motivo', motivo, 'valor', v) order by v desc)
                              from (select motivo, round(sum(valor), 2) v from l group by motivo) x), '[]'::jsonb),
    'lancamentos', coalesce((select jsonb_agg(jsonb_build_object(
                     'dia', to_char(data_movimentacao, 'DD/MM'), 'item', item, 'estoque', estoque,
                     'qtd', round(quantidade, 3), 'valor', round(valor, 2), 'motivo', motivo,
                     'obs', left(observacoes, 90)) order by data_movimentacao desc)
                     from (select * from l order by data_movimentacao desc limit 60) y), '[]'::jsonb))
$$;

-- Corpo completo, com o ramo "perda".
create or replace function public.fn_agente_acao(p_pessoa uuid, p_acao text, p_args jsonb, p_nota text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_e agente_equipe;
  v_usuario uuid;
  v_auth uuid;
  v_assin text;
  v_res jsonb;
  v_dup uuid;
  v_total numeric;
  v_motivo text;
  v_data date;
  v_est uuid;
  r record;
  v_nome text;
  v_custo numeric;
  v_saldo numeric;
begin
  select * into v_e from agente_equipe where id = p_pessoa;
  v_usuario := coalesce(v_e.usuario_id, (fn_agente_cfg('usuario_padrao') #>> '{}')::uuid);
  select coalesce(auth_user_id, id) into v_auth from usuarios_sistema where id = v_usuario;
  perform set_config('request.jwt.claims',
    jsonb_build_object('role', 'authenticated', 'sub', v_auth)::text, true);
  v_assin := 'via WhatsApp por ' || v_e.nome || coalesce(', ' || p_nota, '');

  if p_acao = 'lancar_nota' then
    if coalesce(p_args->>'fornecedor_id', '') = '' then raise exception 'Nota sem fornecedor'; end if;
    if jsonb_array_length(coalesce(p_args->'itens', '[]'::jsonb)) = 0 then raise exception 'Nota sem itens'; end if;
    select sum((x->>'quantidade')::numeric * (x->>'custo_unitario')::numeric) into v_total
      from jsonb_array_elements(p_args->'itens') x;

    if coalesce(p_args->>'numero_documento', '') <> '' then
      select id into v_dup from entradas_compras
       where fornecedor_id = (p_args->>'fornecedor_id')::uuid
         and numero_documento = p_args->>'numero_documento' limit 1;
    end if;
    if v_dup is null and not coalesce((p_args->>'forcar')::boolean, false) then
      select id into v_dup from entradas_compras
       where fornecedor_id = (p_args->>'fornecedor_id')::uuid
         and data_compra = (p_args->>'data_compra')::date
         and abs(valor_total - v_total) < 0.05 limit 1;
    end if;
    if v_dup is not null then
      return jsonb_build_object('duplicada', true, 'entrada_id', v_dup);
    end if;

    v_res := fn_recebimento_confirmar(jsonb_build_object(
      'entrada_id', null,
      'fornecedor_id', p_args->>'fornecedor_id',
      'numero_documento', coalesce(p_args->>'numero_documento', ''),
      'data_compra', coalesce(p_args->>'data_compra', fn_hoje_cuiaba()::text),
      'condicao_pagamento', 'a_vista',
      'arquivo', null,
      'observacoes', concat_ws(' · ', nullif(p_args->>'observacoes', ''), v_assin),
      'itens', (select jsonb_agg(jsonb_build_object(
                   'linha_id', null, 'item_id', x->>'item_id',
                   'quantidade_recebida', (x->>'quantidade')::numeric,
                   'custo_unitario', (x->>'custo_unitario')::numeric,
                   'data_validade', null))
                  from jsonb_array_elements(p_args->'itens') x)));
    return v_res;

  elsif p_acao = 'transferir' then
    v_data := coalesce((p_args->>'data')::date, fn_hoje_cuiaba());
    if v_data > fn_hoje_cuiaba() or v_data < fn_hoje_cuiaba() - 3 then
      raise exception 'Data da transferência fora do permitido (até 3 dias atrás)';
    end if;
    v_motivo := concat_ws(' · ', coalesce(nullif(p_args->>'motivo', ''), 'Transferência'), v_assin);
    v_res := fn_mover_estoques(jsonb_build_object(
      'de', p_args->>'de', 'para', p_args->>'para',
      'responsavel', v_e.nome, 'motivo', v_motivo,
      'itens', (select jsonb_agg(jsonb_build_object('item_id', x->>'item_id', 'quantidade', (x->>'quantidade')::numeric))
                  from jsonb_array_elements(p_args->'itens') x)));
    if v_data < fn_hoje_cuiaba() then
      update movimentacoes_estoque set data_movimentacao = v_data
       where tipo_movimentacao = 'transferencia' and motivo = v_motivo and criado_em >= now() - interval '1 minute';
    end if;
    return v_res || jsonb_build_object('data', v_data);

  elsif p_acao = 'emprestimo' then
    if p_args->>'operacao' = 'registrar' then
      return fn_emprestimo_registrar(jsonb_build_object(
        'vizinho_id', p_args->>'vizinho_id',
        'sentido', p_args->>'sentido', 'estoque_id', p_args->>'estoque_id',
        'responsavel', v_e.nome,
        'observacoes', concat_ws(' · ', nullif(p_args->>'observacoes', ''), v_assin),
        'itens', p_args->'itens'));
    elsif p_args->>'operacao' = 'devolver' then
      return fn_emprestimo_devolver((p_args->>'emprestimo_id')::uuid,
        nullif(p_args->>'quantidade', '')::numeric, v_e.nome || ' via WhatsApp' || coalesce(', ' || p_nota, ''), nullif(p_args->>'estoque_id', '')::uuid);
    end if;
    raise exception 'Operação de empréstimo inválida';

  elsif p_acao = 'perda' then
    v_data := coalesce((p_args->>'data')::date, fn_hoje_cuiaba());
    if v_data > fn_hoje_cuiaba() or v_data < fn_hoje_cuiaba() - 3 then
      raise exception 'Data da perda fora do permitido (até 3 dias atrás)';
    end if;
    v_est := nullif(p_args->>'estoque_id', '')::uuid;
    if not exists (select 1 from estoques where id = v_est) then raise exception 'Estoque inválido'; end if;
    v_motivo := 'Perda: ' || coalesce(nullif(p_args->>'motivo', ''), 'outro');
    v_res := '[]'::jsonb;
    for r in select (x->>'item_id')::uuid item_id, (x->>'quantidade')::numeric qtd
               from jsonb_array_elements(coalesce(p_args->'itens', '[]'::jsonb)) x loop
      if r.item_id is null or coalesce(r.qtd, 0) <= 0 then continue; end if;
      v_nome := null;
      select trim(i.nome), coalesce(s.custo_medio, i.custo_medio, 0), coalesce(s.quantidade_atual, 0)
        into v_nome, v_custo, v_saldo
        from itens_estoque i left join saldos_estoque s on s.item_id = i.id and s.estoque_id = v_est
       where i.id = r.item_id;
      if v_nome is null then raise exception 'Item não encontrado'; end if;
      insert into movimentacoes_estoque (item_id, tipo_movimentacao, quantidade, estoque_origem_id, custo_unitario, custo_total,
                                         data_movimentacao, motivo, observacoes, origem_tipo, criado_por, item_descricao, idempotency_key)
      values (r.item_id, 'saida', r.qtd, v_est, v_custo, r.qtd * v_custo, v_data, v_motivo,
              concat_ws(' · ', nullif(p_args->>'detalhe', ''), v_assin), 'perda', fn_usuario_sistema_id(), v_nome,
              'perda_' || r.item_id || '_' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'));
      v_res := v_res || jsonb_build_object('item', v_nome, 'quantidade', r.qtd, 'valor', round(r.qtd * v_custo, 2),
                                           'saldo_antes', round(v_saldo, 3), 'saldo_depois', round(v_saldo - r.qtd, 3));
    end loop;
    if jsonb_array_length(v_res) = 0 then raise exception 'Nenhum item com quantidade'; end if;
    return jsonb_build_object('estoque', (select nome from estoques where id = v_est), 'motivo', v_motivo,
                              'data', v_data, 'itens', v_res);
  end if;

  raise exception 'Ação desconhecida: %', p_acao;
end $$;

do $$
declare f text;
begin
  foreach f in array array['fn_agente_perdas(uuid,int)', 'fn_agente_escopo_ok(uuid[],text,jsonb)',
                           'fn_agente_acao(uuid,text,jsonb,text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
