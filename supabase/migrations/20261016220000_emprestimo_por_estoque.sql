-- Empréstimo com vizinho pode sair (ou entrar) direto no Bar ou na Cozinha,
-- não só no Central.
--
-- O empréstimo guarda o estoque. Devolução e cancelamento mexem nesse mesmo
-- estoque (a devolução aceita outro, se a mercadoria voltar por outro lugar).
-- Sem estoque informado continua tudo no Central, então a tela de empréstimos
-- funciona como antes.

alter table public.emprestimos_vizinhos add column if not exists estoque_id uuid references public.estoques(id);
update public.emprestimos_vizinhos
   set estoque_id = (select id from public.estoques where tipo = 'central' and status limit 1)
 where estoque_id is null;

comment on column public.emprestimos_vizinhos.estoque_id is
  'Estoque de onde a mercadoria saiu (emprestamos) ou onde entrou (pegamos).';

-- As funções antigas não são apagadas (a tela chama pelo nome): ganham uma
-- irmã com o estoque e passam a repassar para ela.
create or replace function public.fn_emprestimo_mov_estoque(p_item uuid, p_tipo text, p_qtd numeric, p_custo numeric, p_motivo text, p_obs text, p_chave text, p_estoque uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_est uuid; v_nome text; v_id uuid;
begin
  v_est := coalesce(p_estoque, (select id from estoques where tipo = 'central' and status limit 1));
  select trim(nome) into v_nome from itens_estoque where id = p_item;
  insert into movimentacoes_estoque (item_id, tipo_movimentacao, quantidade, estoque_origem_id, estoque_destino_id, custo_unitario, custo_total, data_movimentacao, motivo, observacoes, origem_tipo, criado_por, item_descricao, idempotency_key)
  values (p_item, p_tipo, p_qtd, case when p_tipo = 'saida' then v_est end, case when p_tipo = 'entrada' then v_est end, p_custo, p_qtd * p_custo, public.fn_hoje_cuiaba(),
          p_motivo, p_obs, 'vizinho', fn_usuario_sistema_id(), v_nome, 'vizinho_' || p_chave || '_' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS'))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.fn_emprestimo_mov(p_item uuid, p_tipo text, p_qtd numeric, p_custo numeric, p_motivo text, p_obs text, p_chave text)
returns uuid language sql security definer set search_path = public as $$
  select fn_emprestimo_mov_estoque(p_item, p_tipo, p_qtd, p_custo, p_motivo, p_obs, p_chave, null)
$$;

create or replace function public.fn_emprestimo_registrar(p jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_viz uuid := nullif(p->>'vizinho_id', '')::uuid; v_sentido text := p->>'sentido'; v_resp text := nullif(trim(coalesce(p->>'responsavel', '')), '');
        v_obs text := nullif(trim(coalesce(p->>'observacoes', '')), ''); v_viz_nome text; v_est uuid; v_est_nome text; r record; v_custo numeric; v_saldo numeric; v_nome text;
        v_mov uuid; v_id uuid; v_ids uuid[] := '{}'; v_neg text[] := '{}'; v_n int := 0;
begin
  select nome into v_viz_nome from vizinhos where id = v_viz and ativo;
  if v_viz_nome is null then raise exception 'Vizinho não encontrado'; end if;
  if v_sentido not in ('pegamos', 'emprestamos') then raise exception 'Sentido inválido'; end if;
  v_est := coalesce(nullif(p->>'estoque_id', '')::uuid, (select id from estoques where tipo = 'central' and status limit 1));
  select nome into v_est_nome from estoques where id = v_est;
  if v_est_nome is null then raise exception 'Estoque não encontrado'; end if;
  if v_resp is null then select nome_completo into v_resp from usuarios_sistema where id = fn_usuario_sistema_id(); end if;
  for r in select (x->>'item_id')::uuid item_id, (x->>'quantidade')::numeric quantidade from jsonb_array_elements(coalesce(p->'itens', '[]'::jsonb)) x loop
    if r.item_id is null or r.quantidade is null or r.quantidade <= 0 then continue; end if;
    select trim(i.nome), coalesce(s.custo_medio, i.custo_medio, 0), coalesce(s.quantidade_atual, 0) into v_nome, v_custo, v_saldo
      from itens_estoque i left join saldos_estoque s on s.item_id = i.id and s.estoque_id = v_est where i.id = r.item_id;
    if v_nome is null then raise exception 'Item não encontrado'; end if;
    if v_sentido = 'emprestamos' and v_saldo < r.quantidade then v_neg := v_neg || (v_nome || ': ' || v_est_nome || ' tinha ' || round(v_saldo, 2)); end if;
    v_mov := fn_emprestimo_mov_estoque(r.item_id, case when v_sentido = 'pegamos' then 'entrada' else 'saida' end, r.quantidade, v_custo,
      case when v_sentido = 'pegamos' then 'Empréstimo: pegamos com ' || v_viz_nome else 'Empréstimo: emprestamos para ' || v_viz_nome end,
      concat_ws(' · ', 'Registrado por ' || coalesce(v_resp, '?'), v_obs), 'reg_' || v_viz || '_' || r.item_id, v_est);
    insert into emprestimos_vizinhos (vizinho_id, item_id, sentido, quantidade, custo_unitario, responsavel, observacoes, movimentacao_id, criado_por, estoque_id)
    values (v_viz, r.item_id, v_sentido, r.quantidade, v_custo, v_resp, v_obs, v_mov, fn_usuario_sistema_id(), v_est) returning id into v_id;
    v_ids := v_ids || v_id; v_n := v_n + 1;
  end loop;
  if v_n = 0 then raise exception 'Nenhum item com quantidade'; end if;
  return jsonb_build_object('n', v_n, 'ids', to_jsonb(v_ids), 'estoque', v_est_nome, 'ficou_negativo', to_jsonb(v_neg));
end $$;

create or replace function public.fn_emprestimo_devolver(p_id uuid, p_quantidade numeric, p_responsavel text, p_estoque uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e record; v_viz text; v_falta numeric; v_resp text := nullif(trim(coalesce(p_responsavel, '')), ''); v_qtd numeric; v_est uuid; v_est_nome text;
begin
  select * into e from emprestimos_vizinhos where id = p_id for update;
  if e.id is null then raise exception 'Empréstimo não encontrado'; end if;
  if e.status <> 'aberto' then raise exception 'Este empréstimo já está %', e.status; end if;
  v_falta := e.quantidade - e.devolvido;
  v_qtd := coalesce(p_quantidade, v_falta);
  if v_qtd <= 0 or v_qtd > v_falta + 0.0001 then raise exception 'Quantidade deve ficar entre 0 e % (o que falta)', round(v_falta, 2); end if;
  v_qtd := least(v_qtd, v_falta);
  v_est := coalesce(p_estoque, e.estoque_id);
  select nome into v_est_nome from estoques where id = v_est;
  select nome into v_viz from vizinhos where id = e.vizinho_id;
  if v_resp is null then select nome_completo into v_resp from usuarios_sistema where id = fn_usuario_sistema_id(); end if;
  perform fn_emprestimo_mov_estoque(e.item_id, case when e.sentido = 'pegamos' then 'saida' else 'entrada' end, v_qtd, e.custo_unitario,
    case when e.sentido = 'pegamos' then 'Empréstimo: devolvemos para ' || v_viz else 'Empréstimo: ' || v_viz || ' devolveu' end,
    'Devolução registrada por ' || coalesce(v_resp, '?'), 'dev_' || p_id, v_est);
  update emprestimos_vizinhos set devolvido = devolvido + v_qtd,
    status = case when devolvido + v_qtd >= quantidade - 0.0001 then 'quitado' else 'aberto' end,
    quitado_em = case when devolvido + v_qtd >= quantidade - 0.0001 then now() end
  where id = p_id;
  return jsonb_build_object('id', p_id, 'devolvido', v_qtd, 'estoque', v_est_nome, 'falta', greatest(v_falta - v_qtd, 0),
    'status', case when v_falta - v_qtd <= 0.0001 then 'quitado' else 'aberto' end);
end $$;

create or replace function public.fn_emprestimo_devolver(p_id uuid, p_quantidade numeric, p_responsavel text default null)
returns jsonb language sql security definer set search_path = public as $$
  select fn_emprestimo_devolver(p_id, p_quantidade, p_responsavel, null::uuid)
$$;

create or replace function public.fn_emprestimo_cancelar(p_id uuid, p_motivo text default null)
returns jsonb language plpgsql security definer set search_path = public as $$
declare e record; v_viz text;
begin
  select * into e from emprestimos_vizinhos where id = p_id for update;
  if e.id is null then raise exception 'Empréstimo não encontrado'; end if;
  if e.status <> 'aberto' then raise exception 'Este empréstimo já está %', e.status; end if;
  if e.devolvido > 0 then raise exception 'Já houve devolução: registre o restante como devolvido'; end if;
  select nome into v_viz from vizinhos where id = e.vizinho_id;
  perform fn_emprestimo_mov_estoque(e.item_id, case when e.sentido = 'pegamos' then 'saida' else 'entrada' end, e.quantidade, e.custo_unitario,
    'Empréstimo cancelado (' || v_viz || ')', coalesce(nullif(trim(p_motivo), ''), 'lançado errado'), 'canc_' || p_id, e.estoque_id);
  update emprestimos_vizinhos set status = 'cancelado', cancelado_motivo = nullif(trim(p_motivo), ''), quitado_em = now() where id = p_id;
  return jsonb_build_object('id', p_id, 'status', 'cancelado');
end $$;

-- ─── Agente ────────────────────────────────────────────────────────────────

-- Chefes só emprestam pelo próprio setor ou pelo Central.
update public.agente_permissoes p set estoques = c.estoques
  from public.agente_permissoes c
 where c.acao = 'transferir' and p.acao = 'emprestimo' and p.papel = c.papel
   and p.papel in ('chefe_bar', 'chefe_cozinha');

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
  return true;
end $$;

create or replace function public.fn_agente_emprestimos_abertos()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'emprestimo_id', e.id,
           'vizinho', v.nome,
           'sentido', case e.sentido when 'pegamos' then 'pegamos (devemos)' else 'emprestamos (nos devem)' end,
           'estoque', s.nome,
           'item', trim(i.nome), 'unidade', i.unidade_medida,
           'quantidade', e.quantidade, 'devolvido', e.devolvido, 'falta', e.quantidade - e.devolvido,
           'valor_falta', round((e.quantidade - e.devolvido) * coalesce(e.custo_unitario, 0), 2),
           'data', to_char(e.data, 'DD/MM'), 'responsavel', e.responsavel)
           order by v.nome, e.data), '[]'::jsonb)
    from emprestimos_vizinhos e
    join vizinhos v on v.id = e.vizinho_id
    join itens_estoque i on i.id = e.item_id
    left join estoques s on s.id = e.estoque_id
   where e.status = 'aberto'
$$;

-- No fn_agente_acao, o empréstimo passa a levar o estoque.
do $$
declare v_def text;
begin
  v_def := pg_get_functiondef('public.fn_agente_acao(uuid,text,jsonb,text)'::regprocedure);
  v_def := replace(v_def,
    $a$'sentido', p_args->>'sentido',$a$,
    $a$'sentido', p_args->>'sentido', 'estoque_id', p_args->>'estoque_id',$a$);
  v_def := replace(v_def,
    $a$v_e.nome || ' via WhatsApp' || coalesce(', ' || p_nota, ''))$a$,
    $a$v_e.nome || ' via WhatsApp' || coalesce(', ' || p_nota, ''), nullif(p_args->>'estoque_id', '')::uuid)$a$);
  if v_def not like '%''estoque_id'', p_args->>''estoque_id''%' or v_def not like '%nullif(p_args->>''estoque_id'', '''')::uuid)%' then
    raise exception 'fn_agente_acao não tem o trecho esperado';
  end if;
  execute v_def;
end $$;

do $$
declare f text;
begin
  foreach f in array array['fn_emprestimo_mov_estoque(uuid,text,numeric,numeric,text,text,text,uuid)',
                           'fn_agente_escopo_ok(uuid[],text,jsonb)', 'fn_agente_emprestimos_abertos()'] loop
    execute format('revoke execute on function public.%s from public, anon', f);
  end loop;
  execute 'revoke execute on function public.fn_agente_escopo_ok(uuid[],text,jsonb) from authenticated';
  execute 'revoke execute on function public.fn_agente_emprestimos_abertos() from authenticated';
  execute 'grant execute on function public.fn_emprestimo_devolver(uuid,numeric,text,uuid) to authenticated';
end $$;
