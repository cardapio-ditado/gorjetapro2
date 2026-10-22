-- Contagem do Central pelo agente. O Central não tem contagem de setor: é
-- contado por zona (a categoria do item), uma contagem por zona, como na
-- tela "Contagem do Central". O agente abre sozinho a zona de cada item que
-- a pessoa manda, e situação e conclusão juntam todas as zonas abertas.
-- Quem aprova fecha direto (fn_contagem_bloco_concluir); os demais deixam
-- finalizada, sem processar, para quem aprova processar na tela.

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
  v_central boolean;
  v_ensaio boolean := coalesce((fn_agente_cfg('modo_ensaio') #>> '{}')::boolean, true);
  v_c contagens_estoque;
  v_ids uuid[];
  v_cid uuid;
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
  v_zonas jsonb := '[]'::jsonb;
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
  select tipo = 'central' into v_central from estoques where id = v_estoque;
  v_pode_aprovar := exists (select 1 from agente_permissoes where papel = v_e.papel and acao = 'aprovar');

  -- As contagens abertas: no setor, a de setor mais recente; no Central, as
  -- de zona abertas nas últimas 24 h.
  if v_central then
    select array_agg(id order by criado_em) into v_ids from contagens_estoque
     where estoque_id = v_estoque and status = 'em_andamento' and bloco is not null and bloco not like '\_\_%'
       and criado_em > now() - interval '24 hours';
  else
    select * into v_c from contagens_estoque
     where estoque_id = v_estoque and status = 'em_andamento' and bloco in ('__diaria', '__auditoria')
       and criado_em > now() - interval '24 hours'
     order by criado_em desc limit 1;
    if v_c.id is not null then v_ids := array[v_c.id]; end if;
  end if;

  if p_op = 'abrir' then
    if v_central then
      return jsonb_build_object('status', 'aberta', 'modo', 'por_zona',
        'como_funciona', 'No Central cada categoria é uma zona com contagem própria. A zona de cada item é aberta sozinha quando ele é anotado.',
        'zonas_abertas', coalesce((select jsonb_agg(jsonb_build_object('zona', c.bloco,
            'contados', (select count(*) from contagens_estoque_itens where contagem_id = c.id and quantidade_contada is not null),
            'itens', (select count(*) from contagens_estoque_itens where contagem_id = c.id)))
          from contagens_estoque c where c.id = any (coalesce(v_ids, '{}'))), '[]'::jsonb));
    end if;
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

  if p_op = 'anotar' then
    if not v_central and v_c.id is null then
      return jsonb_build_object('status', 'sem_contagem', 'motivo', 'Não há contagem aberta neste setor. Abra primeiro.');
    end if;
    if v_ensaio then return jsonb_build_object('status', 'ensaio', 'acao', 'anotar contagem', 'args', p_args); end if;
    for r in select (x->>'item_id')::uuid item_id, (x->>'quantidade')::numeric qtd
               from jsonb_array_elements(coalesce(p_args->'itens', '[]'::jsonb)) x loop
      if r.qtd is null or r.qtd < 0 then raise exception 'Quantidade inválida.'; end if;

      if v_central then
        -- A zona do item: abre (ou reaproveita) a contagem daquela categoria.
        begin
          v_res := fn_contagem_bloco_abrir(v_estoque, (select coalesce(nullif(btrim(categoria), ''), 'Sem categoria') from itens_estoque where id = r.item_id), v_e.nome);
        exception when others then
          v_fora := v_fora || jsonb_build_object('item_id', r.item_id, 'nome', (select trim(nome) from itens_estoque where id = r.item_id), 'motivo', sqlerrm);
          continue;
        end;
        v_cid := (v_res->>'id')::uuid;
        update contagens_estoque set criado_por = coalesce(criado_por, v_e.usuario_id) where id = v_cid;
      else
        v_cid := v_c.id;
      end if;

      select * into v_linha from contagens_estoque_itens where contagem_id = v_cid and item_estoque_id = r.item_id;
      if v_linha.id is null then
        if not coalesce((p_args->>'incluir_fora_do_setor')::boolean, false) then
          v_fora := v_fora || jsonb_build_object('item_id', r.item_id, 'nome', (select trim(nome) from itens_estoque where id = r.item_id));
          continue;
        end if;
        insert into contagens_estoque_itens (contagem_id, item_estoque_id, quantidade_sistema, valor_unitario)
        select v_cid, i.id, calcular_saldo_item_estoque(i.id, v_estoque), coalesce(i.custo_medio, 0)
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
    if v_central then
      select array_agg(id) into v_ids from contagens_estoque
       where estoque_id = v_estoque and status = 'em_andamento' and bloco is not null and bloco not like '\_\_%'
         and criado_em > now() - interval '24 hours';
    end if;
    return jsonb_build_object('status', 'anotado', 'local', v_local, 'itens', v_feitos, 'fora_do_setor', v_fora,
      'ja_contados', (select count(*) from contagens_estoque_itens where contagem_id = any (coalesce(v_ids, '{}')) and quantidade_contada is not null));
  end if;

  if coalesce(cardinality(v_ids), 0) = 0 then
    return jsonb_build_object('status', 'sem_contagem', 'motivo', 'Não há contagem aberta neste estoque.');
  end if;

  if p_op = 'situacao' then
    return jsonb_build_object('status', 'aberta',
      'modo', case when v_central then 'por_zona' when v_c.bloco = '__diaria' then 'diaria' else 'auditoria' end,
      'zonas', case when v_central then (select jsonb_agg(bloco) from contagens_estoque where id = any (v_ids)) end,
      'contados', coalesce((select jsonb_agg(jsonb_build_object(
          'nome', trim(i.nome), 'um', i.unidade_medida, 'contado', ci.quantidade_contada, 'partes', ci.partes,
          'sistema', round(calcular_saldo_item_estoque(ci.item_estoque_id, v_estoque), 3),
          'diferenca', round(ci.quantidade_contada - calcular_saldo_item_estoque(ci.item_estoque_id, v_estoque), 3),
          'valor_diferenca', round((ci.quantidade_contada - calcular_saldo_item_estoque(ci.item_estoque_id, v_estoque)) * coalesce(ci.valor_unitario, 0), 2))
          order by abs((ci.quantidade_contada - calcular_saldo_item_estoque(ci.item_estoque_id, v_estoque)) * coalesce(ci.valor_unitario, 0)) desc)
        from contagens_estoque_itens ci join itens_estoque i on i.id = ci.item_estoque_id
       where ci.contagem_id = any (v_ids) and ci.quantidade_contada is not null), '[]'::jsonb),
      'nao_contados', coalesce((select jsonb_agg(jsonb_build_object('nome', trim(i.nome), 'sistema', round(calcular_saldo_item_estoque(ci.item_estoque_id, v_estoque), 3)) order by trim(i.nome))
        from contagens_estoque_itens ci join itens_estoque i on i.id = ci.item_estoque_id
       where ci.contagem_id = any (v_ids) and ci.quantidade_contada is null
         and (v_central or exists (select 1 from itens_estoque_niveis n where n.item_id = ci.item_estoque_id and n.estoque_id = v_estoque
                                    and (v_c.bloco = '__auditoria' or n.controle = 'contagem')))), '[]'::jsonb));
  end if;

  if p_op = 'concluir' then
    if v_ensaio then return jsonb_build_object('status', 'ensaio', 'acao', 'concluir contagem'); end if;
    if not v_central then
      v_res := fn_contagem_setor_concluir(v_c.id);
      if coalesce((v_res->>'aprovacao')::boolean, false) and v_pode_aprovar then
        perform fn_contagem_processar_pela_folha(v_c.id, v_e.usuario_id);
        return v_res || jsonb_build_object('status', 'processada', 'aprovacao', false, 'aprovada_por', v_e.nome);
      end if;
      return v_res || jsonb_build_object('status', case when coalesce((v_res->>'aprovacao')::boolean, false) then 'aguardando_aprovacao' else 'processada' end,
        'estoque', (select nome from estoques where id = v_estoque));
    end if;
    -- Central: zona por zona. Zona aberta sem nenhum item contado é cancelada.
    foreach v_cid in array v_ids loop
      if not exists (select 1 from contagens_estoque_itens where contagem_id = v_cid and quantidade_contada is not null) then
        perform cancelar_contagem_estoque(v_cid);
        continue;
      end if;
      if v_pode_aprovar then
        v_res := fn_contagem_bloco_concluir(v_cid, v_e.usuario_id);
      else
        v_res := finalizar_contagem_estoque(v_cid)::jsonb;
      end if;
      v_zonas := v_zonas || jsonb_build_object('zona', (select bloco from contagens_estoque where id = v_cid), 'resultado', v_res);
    end loop;
    return jsonb_build_object('status', case when v_pode_aprovar then 'processada' else 'aguardando_aprovacao' end,
      'estoque', (select nome from estoques where id = v_estoque), 'zonas', v_zonas,
      'contados', (select count(*) from contagens_estoque_itens where contagem_id = any (v_ids) and quantidade_contada is not null),
      'diferencas', (select count(*) from contagens_estoque_itens where contagem_id = any (v_ids) and quantidade_contada is not null and coalesce(diferenca, 0) <> 0),
      'valor', (select coalesce(sum(abs(valor_diferenca)), 0) from contagens_estoque_itens where contagem_id = any (v_ids) and quantidade_contada is not null and coalesce(diferenca, 0) <> 0),
      'onde_aprovar', case when not v_pode_aprovar then 'Contagem do Central, na zona finalizada (Resultado → processar)' end);
  end if;

  if p_op = 'cancelar' then
    if v_ensaio then return jsonb_build_object('status', 'ensaio', 'acao', 'cancelar contagem'); end if;
    foreach v_cid in array v_ids loop perform cancelar_contagem_estoque(v_cid); end loop;
    return jsonb_build_object('status', 'cancelada', 'contagens', cardinality(v_ids));
  end if;

  raise exception 'Operação inválida: %', p_op;
end $function$;

revoke execute on function public.fn_agente_contagem(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.fn_agente_contagem(uuid, text, jsonb) to service_role;
