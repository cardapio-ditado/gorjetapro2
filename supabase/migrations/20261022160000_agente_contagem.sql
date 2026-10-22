-- Contagem pelo WhatsApp: o agente abre, anota (somando freezer por
-- freezer), mostra o que falta e conclui a mesma contagem de setor da tela
-- (fn_contagem_setor_*). Começar num lugar e terminar no outro funciona.
--
-- Cada linha guarda as partes por local ({"Freezer 1": 49, "Freezer 2": 21})
-- e a quantidade contada é a soma. Corrigir um freezer troca só a parte dele.
-- Item não contado não mexe no saldo (o processamento só ajusta o que tem
-- quantidade contada).
--
-- Auditoria com diferença: quem também pode aprovar fecha direto; os demais
-- deixam para "Aprovar diferenças" e quem aprova é avisado pelo agente.

alter table public.contagens_estoque_itens add column if not exists partes jsonb;

insert into public.agente_permissoes (papel, acao, modo, estoques) values
  ('dono', 'contagem', 'direto', null),
  ('gerente_geral', 'contagem', 'direto', null),
  ('gerente_noite', 'contagem', 'direto', null),
  ('estoquista', 'contagem', 'direto', null),
  ('chefe_bar', 'contagem', 'direto', array['10b3aacf-61b1-4add-91ac-0949d3e7f3a3']::uuid[]),
  ('chefe_cozinha', 'contagem', 'direto', array['1da77d06-f428-49b4-afa7-9ffaa90b8557']::uuid[])
on conflict (papel, acao) do nothing;

create or replace function public.fn_agente_contagem(p_pessoa uuid, p_op text, p_args jsonb)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_e agente_equipe;
  v_p agente_permissoes;
  v_estoque uuid := nullif(p_args->>'estoque_id', '')::uuid;
  v_ensaio boolean := coalesce((fn_agente_cfg('modo_ensaio') #>> '{}')::boolean, true);
  v_c contagens_estoque;
  v_res jsonb;
  v_linha contagens_estoque_itens;
  v_local text := coalesce(nullif(btrim(p_args->>'local'), ''), 'geral');
  v_somar boolean := coalesce(p_args->>'modo', 'somar') <> 'substituir';
  v_partes jsonb;
  v_total numeric;
  r record;
  v_feitos jsonb := '[]'::jsonb;
  v_fora jsonb := '[]'::jsonb;
  v_pode_aprovar boolean;
begin
  select * into v_e from agente_equipe where id = p_pessoa and ativo;
  if not found then raise exception 'Pessoa não cadastrada ou inativa'; end if;
  select * into v_p from agente_permissoes where papel = v_e.papel and acao = 'contagem';
  if not found then
    return jsonb_build_object('status', 'negado', 'motivo', 'O seu papel não permite contagem.');
  end if;
  if v_estoque is null then raise exception 'Falta o estoque.'; end if;
  if v_p.estoques is not null and not (v_estoque = any (v_p.estoques)) then
    return jsonb_build_object('status', 'negado', 'motivo', 'Esse estoque está fora do seu setor.');
  end if;

  -- A contagem de setor aberta (da tela ou do WhatsApp), a mais recente.
  select * into v_c from contagens_estoque
   where estoque_id = v_estoque and status = 'em_andamento' and bloco in ('__diaria', '__auditoria')
     and criado_em > now() - interval '24 hours'
   order by criado_em desc limit 1;

  if p_op = 'abrir' then
    if v_c.id is null then
      if v_ensaio then return jsonb_build_object('status', 'ensaio', 'acao', 'abrir contagem'); end if;
      v_res := fn_contagem_setor_abrir(v_estoque, coalesce(nullif(p_args->>'modo', ''), 'auditoria'), v_e.nome);
      update contagens_estoque set criado_por = coalesce(criado_por, v_e.usuario_id) where id = (v_res->>'id')::uuid;
      select * into v_c from contagens_estoque where id = (v_res->>'id')::uuid;
    end if;
    return jsonb_build_object('status', 'aberta', 'modo', case v_c.bloco when '__diaria' then 'diaria' else 'auditoria' end,
      'aberta_por', v_c.responsavel, 'aberta_em', v_c.criado_em,
      'itens_do_setor', (select count(*) from contagens_estoque_itens where contagem_id = v_c.id),
      'ja_contados', (select count(*) from contagens_estoque_itens where contagem_id = v_c.id and quantidade_contada is not null));
  end if;

  if v_c.id is null then
    return jsonb_build_object('status', 'sem_contagem', 'motivo', 'Não há contagem aberta neste setor. Abra primeiro.');
  end if;

  if p_op = 'anotar' then
    if v_ensaio then return jsonb_build_object('status', 'ensaio', 'acao', 'anotar contagem', 'args', p_args); end if;
    for r in select (x->>'item_id')::uuid item_id, (x->>'quantidade')::numeric qtd
               from jsonb_array_elements(coalesce(p_args->'itens', '[]'::jsonb)) x loop
      if r.qtd is null or r.qtd < 0 then raise exception 'Quantidade inválida.'; end if;
      select * into v_linha from contagens_estoque_itens where contagem_id = v_c.id and item_estoque_id = r.item_id;
      if v_linha.id is null then
        if not coalesce((p_args->>'incluir_fora_do_setor')::boolean, false) then
          v_fora := v_fora || jsonb_build_object('item_id', r.item_id, 'nome', (select trim(nome) from itens_estoque where id = r.item_id));
          continue;
        end if;
        insert into contagens_estoque_itens (contagem_id, item_estoque_id, quantidade_sistema, valor_unitario)
        select v_c.id, i.id, calcular_saldo_item_estoque(i.id, v_estoque), coalesce(i.custo_medio, 0)
          from itens_estoque i where i.id = r.item_id and i.status = 'ativo'
        returning * into v_linha;
        if v_linha.id is null then raise exception 'Item inativo ou inexistente.'; end if;
      end if;
      -- O que foi digitado na tela, sem partes, vira a parte "tela".
      v_partes := coalesce(v_linha.partes,
        case when v_linha.quantidade_contada is not null then jsonb_build_object('tela', v_linha.quantidade_contada) else '{}'::jsonb end);
      v_partes := jsonb_set(v_partes, array[v_local],
        to_jsonb(case when v_somar then coalesce((v_partes->>v_local)::numeric, 0) + r.qtd else r.qtd end));
      if not v_somar and r.qtd = 0 and coalesce((p_args->>'apagar_parte')::boolean, false) then v_partes := v_partes - v_local; end if;
      select sum(value::numeric) into v_total from jsonb_each_text(v_partes);
      update contagens_estoque_itens
         set partes = v_partes,
             quantidade_contada = v_total,
             quantidade_sistema = calcular_saldo_item_estoque(item_estoque_id, v_estoque),
             contado_em = case when v_total is null then null else now() end,
             observacao = (select string_agg(key || ': ' || fn_fmt_qtd(value::numeric), ' · ' order by key)
                             from jsonb_each_text(v_partes))
       where id = v_linha.id
       returning * into v_linha;
      v_feitos := v_feitos || jsonb_build_object('item_id', r.item_id, 'nome', (select trim(nome) from itens_estoque where id = r.item_id),
        'total_contado', v_linha.quantidade_contada, 'partes', v_linha.partes, 'sistema', round(v_linha.quantidade_sistema, 3));
    end loop;
    return jsonb_build_object('status', 'anotado', 'local', v_local, 'itens', v_feitos, 'fora_do_setor', v_fora,
      'ja_contados', (select count(*) from contagens_estoque_itens where contagem_id = v_c.id and quantidade_contada is not null),
      'itens_do_setor', (select count(*) from contagens_estoque_itens where contagem_id = v_c.id));
  end if;

  if p_op = 'situacao' then
    return jsonb_build_object('status', 'aberta', 'modo', case v_c.bloco when '__diaria' then 'diaria' else 'auditoria' end,
      'contados', coalesce((select jsonb_agg(jsonb_build_object(
          'nome', trim(i.nome), 'um', i.unidade_medida, 'contado', ci.quantidade_contada, 'partes', ci.partes,
          'sistema', round(calcular_saldo_item_estoque(ci.item_estoque_id, v_estoque), 3),
          'diferenca', round(ci.quantidade_contada - calcular_saldo_item_estoque(ci.item_estoque_id, v_estoque), 3),
          'valor_diferenca', round((ci.quantidade_contada - calcular_saldo_item_estoque(ci.item_estoque_id, v_estoque)) * coalesce(ci.valor_unitario, 0), 2))
          order by abs((ci.quantidade_contada - calcular_saldo_item_estoque(ci.item_estoque_id, v_estoque)) * coalesce(ci.valor_unitario, 0)) desc)
        from contagens_estoque_itens ci join itens_estoque i on i.id = ci.item_estoque_id
       where ci.contagem_id = v_c.id and ci.quantidade_contada is not null), '[]'::jsonb),
      'nao_contados', coalesce((select jsonb_agg(jsonb_build_object('nome', trim(i.nome), 'sistema', round(calcular_saldo_item_estoque(ci.item_estoque_id, v_estoque), 3)) order by trim(i.nome))
        from contagens_estoque_itens ci join itens_estoque i on i.id = ci.item_estoque_id
        join itens_estoque_niveis n on n.item_id = ci.item_estoque_id and n.estoque_id = v_estoque and (v_c.bloco = '__auditoria' or n.controle = 'contagem')
       where ci.contagem_id = v_c.id and ci.quantidade_contada is null), '[]'::jsonb));
  end if;

  if p_op = 'concluir' then
    if v_ensaio then return jsonb_build_object('status', 'ensaio', 'acao', 'concluir contagem'); end if;
    v_res := fn_contagem_setor_concluir(v_c.id);
    v_pode_aprovar := exists (select 1 from agente_permissoes where papel = v_e.papel and acao = 'aprovar');
    if coalesce((v_res->>'aprovacao')::boolean, false) and v_pode_aprovar then
      perform fn_contagem_processar_pela_folha(v_c.id, v_e.usuario_id);
      return v_res || jsonb_build_object('status', 'processada', 'aprovacao', false, 'aprovada_por', v_e.nome);
    end if;
    return v_res || jsonb_build_object('status', case when coalesce((v_res->>'aprovacao')::boolean, false) then 'aguardando_aprovacao' else 'processada' end,
      'estoque', (select nome from estoques where id = v_estoque));
  end if;

  if p_op = 'cancelar' then
    if v_ensaio then return jsonb_build_object('status', 'ensaio', 'acao', 'cancelar contagem'); end if;
    return jsonb_build_object('status', 'cancelada', 'resultado', cancelar_contagem_estoque(v_c.id));
  end if;

  raise exception 'Operação inválida: %', p_op;
end $function$;

revoke execute on function public.fn_agente_contagem(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.fn_agente_contagem(uuid, text, jsonb) to service_role;
