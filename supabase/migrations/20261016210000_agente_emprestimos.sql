-- Agente WhatsApp: empréstimos com vizinhos.
--
-- Usa as mesmas funções da tela de empréstimos (fn_emprestimo_registrar e
-- fn_emprestimo_devolver), que mexem no estoque Central. Nova ação
-- "emprestimo": registra o que pegamos ou emprestamos, dá baixa na devolução
-- e mostra o que está em aberto.

insert into public.agente_permissoes (papel, acao, modo, estoques) values
  ('dono', 'emprestimo', 'direto', null),
  ('gerente_geral', 'emprestimo', 'direto', null),
  ('estoquista', 'emprestimo', 'direto', null),
  ('gerente_noite', 'emprestimo', 'direto', null),
  ('chefe_bar', 'emprestimo', 'pendente', null),
  ('chefe_cozinha', 'emprestimo', 'pendente', null)
on conflict (papel, acao) do nothing;

create or replace function public.fn_agente_buscar_vizinho(p_texto text)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object('id', v.id, 'nome', v.nome) order by v.nome), '[]'::jsonb)
    from vizinhos v
   where v.ativo
     and (coalesce(trim(p_texto), '') = ''
          or fn_agente_norm(v.nome) like '%' || fn_agente_norm(p_texto) || '%'
          or fn_agente_norm(p_texto) like '%' || fn_agente_norm(v.nome) || '%')
$$;

create or replace function public.fn_agente_emprestimos_abertos()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'emprestimo_id', e.id,
           'vizinho', v.nome,
           'sentido', case e.sentido when 'pegamos' then 'pegamos (devemos)' else 'emprestamos (nos devem)' end,
           'item', trim(i.nome), 'unidade', i.unidade_medida,
           'quantidade', e.quantidade, 'devolvido', e.devolvido, 'falta', e.quantidade - e.devolvido,
           'valor_falta', round((e.quantidade - e.devolvido) * coalesce(e.custo_unitario, 0), 2),
           'data', to_char(e.data, 'DD/MM'), 'responsavel', e.responsavel)
           order by v.nome, e.data), '[]'::jsonb)
    from emprestimos_vizinhos e
    join vizinhos v on v.id = e.vizinho_id
    join itens_estoque i on i.id = e.item_id
   where e.status = 'aberto'
$$;

-- Mesmo corpo de antes, com o ramo "emprestimo" no fim.
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
        'sentido', p_args->>'sentido',
        'responsavel', v_e.nome,
        'observacoes', concat_ws(' · ', nullif(p_args->>'observacoes', ''), v_assin),
        'itens', p_args->'itens'));
    elsif p_args->>'operacao' = 'devolver' then
      return fn_emprestimo_devolver((p_args->>'emprestimo_id')::uuid,
        nullif(p_args->>'quantidade', '')::numeric, v_e.nome || ' via WhatsApp' || coalesce(', ' || p_nota, ''));
    end if;
    raise exception 'Operação de empréstimo inválida';
  end if;

  raise exception 'Ação desconhecida: %', p_acao;
end $$;

do $$
declare f text;
begin
  foreach f in array array['fn_agente_buscar_vizinho(text)', 'fn_agente_emprestimos_abertos()',
                           'fn_agente_acao(uuid,text,jsonb,text)'] loop
    execute format('revoke execute on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end $$;
