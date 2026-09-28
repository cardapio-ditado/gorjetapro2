/*
  # Funções que gravam "quem fez" usam o id de usuarios_sistema, não o do auth

  `fn_contagem_bloco_abrir` gravava `criado_por = auth.uid()` e
  `fn_requisicao_entregar` gravava `concluido_por = auth.uid()`. Essas colunas
  apontam para `usuarios_sistema.id`, que nem sempre é igual ao id do auth
  (o perfil é ligado pelo `auth_user_id`). Quando os dois ids diferem, abrir
  um bloco de contagem falha com violação de chave estrangeira.

  `fn_usuario_sistema_id()` resolve o perfil do usuário logado por qualquer
  um dos dois ids e devolve NULL quando não há perfil, em vez de derrubar.
*/

CREATE OR REPLACE FUNCTION fn_usuario_sistema_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT id FROM usuarios_sistema
  WHERE auth_user_id = auth.uid() OR id = auth.uid()
  ORDER BY (auth_user_id = auth.uid()) DESC
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.fn_contagem_bloco_abrir(p_estoque_id uuid, p_bloco text, p_responsavel text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
declare
  v_hoje date := (now() at time zone 'America/Cuiaba')::date;
  v_id uuid; v_n int;
  v_nome text := case when p_bloco = '__zerados' then 'Zerados na última contagem' else p_bloco end;
begin
  if not exists (select 1 from estoques where id = p_estoque_id and status = true) then raise exception 'Estoque não encontrado'; end if;

  select id into v_id from contagens_estoque
   where estoque_id = p_estoque_id and bloco = p_bloco and status = 'em_andamento'
     and data_contagem::date = v_hoje
   order by criado_em desc limit 1;
  if v_id is not null then
    return jsonb_build_object('id', v_id, 'criada', false, 'bloco', p_bloco, 'nome', v_nome);
  end if;

  insert into contagens_estoque (estoque_id, responsavel, observacoes, criado_por, bloco, status)
  values (p_estoque_id, coalesce(nullif(btrim(p_responsavel), ''), 'Bloco'), 'Bloco: ' || v_nome, fn_usuario_sistema_id(), p_bloco, 'em_andamento')
  returning id into v_id;

  insert into contagens_estoque_itens (contagem_id, item_estoque_id, quantidade_sistema, valor_unitario)
  select v_id, b.item_id, calcular_saldo_item_estoque(b.item_id, p_estoque_id), coalesce(ie.custo_medio, 0)
    from fn_contagem_itens_do_bloco(p_estoque_id, p_bloco) b
    join itens_estoque ie on ie.id = b.item_id
   order by ie.nome;
  get diagnostics v_n = row_count;

  if v_n = 0 then
    delete from contagens_estoque where id = v_id;
    raise exception 'Bloco sem itens para contar';
  end if;

  return jsonb_build_object('id', v_id, 'criada', true, 'bloco', p_bloco, 'nome', v_nome, 'itens', v_n);
end;
$function$;

CREATE OR REPLACE FUNCTION public.fn_requisicao_entregar(p_requisicao_id uuid, p_itens jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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
     set status = 'concluido', data_conclusao = now(), concluido_por = fn_usuario_sistema_id(), updated_at = now()
   where id = p_requisicao_id;

  return jsonb_build_object('id', p_requisicao_id, 'itens_ajustados', v_n);
end;
$function$;
