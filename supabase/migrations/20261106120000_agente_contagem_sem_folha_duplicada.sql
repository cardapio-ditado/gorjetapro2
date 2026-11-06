-- Agente do WhatsApp, contagem: o que deu errado em 06/11/2026 (Carol) e o conserto combinado com o Kadu.
-- 1) Duas ferramentas em paralelo abriram a mesma zona do Central duas vezes (folha duplicada, 5 ms de diferença).
--    Trava: advisory lock nas funções que abrem + índice único (uma folha aberta por estoque, bloco e dia).
--    Ao anotar, o item é procurado em todas as folhas abertas do estoque e os lugares vão para uma linha só.
-- 2) A ferramenta de anotar devolve o total do item lido do banco (todas as folhas abertas), para o agente
--    só dizer "corrigido" com base nisso.
-- 3) Fechar o Bar ou o Central com o outro aberto exige o cruzamento conferido (cruzado_em).
-- 4) Zerar ou reduzir item com saída ≥ R$ 300 não grava sem confirmado=true.
-- 5) Totais de diferença por item (somando as folhas do mesmo estoque), não por linha.
-- Nada aqui escreve saldo: só a contagem (folha). O saldo continua mudando só por movimentação.

-- 0) Marca de "cruzamento conferido" na folha.
alter table public.contagens_estoque add column if not exists cruzado_em timestamptz;

-- 1a) Abrir zona: trava contra corrida e dia de Cuiabá (antes comparava a data em UTC: depois das 20h
--     não achava a zona aberta e abria outra).
create or replace function public.fn_contagem_bloco_abrir(p_estoque_id uuid, p_bloco text, p_responsavel text default null::text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_hoje date := (now() at time zone 'America/Cuiaba')::date;
  v_id uuid; v_n int;
  v_nome text := case when p_bloco = '__zerados' then 'Zerados na última contagem' else p_bloco end;
begin
  if not exists (select 1 from estoques where id = p_estoque_id and status = true) then raise exception 'Estoque não encontrado'; end if;
  -- Duas chamadas ao mesmo tempo: a segunda espera a primeira e reaproveita a folha dela.
  perform pg_advisory_xact_lock(hashtext('contagem_abrir:' || p_estoque_id::text || ':' || p_bloco));

  select id into v_id from contagens_estoque
   where estoque_id = p_estoque_id and bloco = p_bloco and status = 'em_andamento'
     and (data_contagem at time zone 'America/Cuiaba')::date = v_hoje
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

-- 1b) Abrir setor (Bar, Cozinha): a mesma trava.
create or replace function public.fn_contagem_setor_abrir(p_estoque uuid, p_modo text, p_responsavel text default null::text)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
DECLARE v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date; v_bloco text; v_id uuid; v_n int;
BEGIN
  IF p_modo NOT IN ('diaria', 'auditoria') THEN RAISE EXCEPTION 'Modo inválido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM estoques WHERE id = p_estoque AND status AND tipo IN ('geral', 'secundario', 'kit')) THEN RAISE EXCEPTION 'Setor não encontrado'; END IF;
  v_bloco := '__' || p_modo;
  PERFORM pg_advisory_xact_lock(hashtext('contagem_abrir:' || p_estoque::text || ':' || v_bloco));
  SELECT id INTO v_id FROM contagens_estoque WHERE estoque_id = p_estoque AND bloco = v_bloco AND status = 'em_andamento' AND (data_contagem AT TIME ZONE 'America/Cuiaba')::date = v_hoje ORDER BY criado_em DESC LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN fn_contagem_setor_itens(v_id); END IF;

  SELECT count(*) INTO v_n FROM itens_estoque i
   WHERE i.status = 'ativo' AND (
     (p_modo = 'diaria' AND EXISTS (SELECT 1 FROM itens_estoque_niveis n WHERE n.item_id = i.id AND n.estoque_id = p_estoque AND n.controle = 'contagem'))
     OR (p_modo = 'auditoria' AND (EXISTS (SELECT 1 FROM itens_estoque_niveis n WHERE n.item_id = i.id AND n.estoque_id = p_estoque)
                                   OR EXISTS (SELECT 1 FROM saldos_estoque s WHERE s.item_id = i.id AND s.estoque_id = p_estoque AND s.quantidade_atual <> 0))));
  IF v_n = 0 THEN RAISE EXCEPTION 'Este setor não tem itens para essa contagem. Configure em Configurar setores.'; END IF;

  INSERT INTO contagens_estoque (estoque_id, responsavel, observacoes, criado_por, bloco, status)
  VALUES (p_estoque, coalesce(nullif(btrim(p_responsavel), ''), 'Setor'), CASE p_modo WHEN 'diaria' THEN 'Contagem diária do setor' ELSE 'Auditoria geral do setor' END, fn_usuario_sistema_id(), v_bloco, 'em_andamento')
  RETURNING id INTO v_id;

  INSERT INTO contagens_estoque_itens (contagem_id, item_estoque_id, quantidade_sistema, valor_unitario)
  SELECT v_id, i.id, calcular_saldo_item_estoque(i.id, p_estoque), coalesce(i.custo_medio, 0)
    FROM itens_estoque i
   WHERE i.status = 'ativo' AND (
     (p_modo = 'diaria' AND EXISTS (SELECT 1 FROM itens_estoque_niveis n WHERE n.item_id = i.id AND n.estoque_id = p_estoque AND n.controle = 'contagem'))
     OR (p_modo = 'auditoria' AND (EXISTS (SELECT 1 FROM itens_estoque_niveis n WHERE n.item_id = i.id AND n.estoque_id = p_estoque)
                                   OR EXISTS (SELECT 1 FROM saldos_estoque s WHERE s.item_id = i.id AND s.estoque_id = p_estoque AND s.quantidade_atual <> 0))));
  RETURN fn_contagem_setor_itens(v_id);
END; $function$;

-- 1c) Rede de segurança no banco: uma folha aberta por estoque, bloco e dia (Cuiabá).
--     A contagem da tela (bloco nulo) não entra.
create unique index if not exists contagens_estoque_uma_aberta_por_bloco
  on public.contagens_estoque (estoque_id, bloco, ((data_contagem at time zone 'America/Cuiaba')::date))
  where status = 'em_andamento' and bloco is not null;

-- 5) Resumo por item das folhas abertas de um estoque: soma as linhas do mesmo item e compara uma vez
--    com o saldo (régua única). Usado na situação e no fechamento.
create or replace function public.fn_agente_contagem_resumo(p_ids uuid[], p_estoque uuid)
returns jsonb language sql stable security definer set search_path to 'public' as $function$
  with t as (
    select ci.item_estoque_id item_id, sum(ci.quantidade_contada) contado, count(*) n, jsonb_agg(ci.partes) partes,
           max(coalesce(ci.valor_unitario, 0)) custo, calcular_saldo_item_estoque(ci.item_estoque_id, p_estoque) sistema
      from contagens_estoque_itens ci
     where ci.contagem_id = any (p_ids) and ci.quantidade_contada is not null
     group by ci.item_estoque_id),
  d as (select t.*, t.contado - t.sistema dif, (t.contado - t.sistema) * t.custo valor from t)
  select jsonb_build_object(
    'itens', coalesce((select jsonb_agg(jsonb_build_object('nome', trim(i.nome), 'um', i.unidade_medida, 'contado', d.contado,
        'partes', case when d.n = 1 then d.partes->0 else d.partes end, 'sistema', round(d.sistema, 3),
        'diferenca', round(d.dif, 3), 'valor_diferenca', round(d.valor, 2)) order by abs(d.valor) desc)
      from d join itens_estoque i on i.id = d.item_id), '[]'::jsonb),
    'itens_contados', (select count(*) from d),
    'itens_com_diferenca', (select count(*) from d where d.dif <> 0),
    'valor_faltas', (select round(coalesce(sum(-d.valor) filter (where d.valor < 0), 0), 2) from d),
    'valor_sobras', (select round(coalesce(sum(d.valor) filter (where d.valor > 0), 0), 2) from d),
    'valor_liquido', (select round(coalesce(sum(d.valor), 0), 2) from d));
$function$;
revoke all on function public.fn_agente_contagem_resumo(uuid[], uuid) from public, anon, authenticated;
grant execute on function public.fn_agente_contagem_resumo(uuid[], uuid) to service_role;

-- 3a) Cruzamento: deixa a marca cruzado_em nas folhas abertas do Bar e do Central (o fechamento confere).
--     Folha do mesmo item somada uma vez só (max), não por linha.
create or replace function public.fn_agente_contagem_cruzar(p_pessoa uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_bar constant uuid := '10b3aacf-61b1-4add-91ac-0949d3e7f3a3';
  v_central constant uuid := 'ea043464-d54e-4f42-8e40-4edddc5b4b51';
begin
  if not exists (select 1 from agente_equipe e join agente_permissoes p on p.papel = e.papel and p.acao = 'contagem'
                  where e.id = p_pessoa and e.ativo) then
    return jsonb_build_object('status', 'negado', 'motivo', 'O seu papel não permite contagem.');
  end if;
  update contagens_estoque c set cruzado_em = now()
   where c.status = 'em_andamento' and c.criado_em > now() - interval '24 hours'
     and ((c.estoque_id = v_bar and c.bloco in ('__auditoria', '__diaria'))
          or (c.estoque_id = v_central and c.bloco is not null and c.bloco not like '\_\_%'));
  return (
    with linhas as (
      select c.estoque_id, ci.item_estoque_id item_id, ci.quantidade_contada contado, ci.quantidade_sistema folha,
             coalesce(ci.valor_unitario, 0) custo
        from contagens_estoque c join contagens_estoque_itens ci on ci.contagem_id = c.id
       where c.status = 'em_andamento' and c.criado_em > now() - interval '24 hours'
         and ci.quantidade_contada is not null
         and ((c.estoque_id = v_bar and c.bloco in ('__auditoria', '__diaria'))
              or (c.estoque_id = v_central and c.bloco is not null and c.bloco not like '\_\_%'))),
    b as (select item_id, sum(contado) contado, max(folha) folha, max(custo) custo from linhas where estoque_id = v_bar group by 1),
    ce as (select item_id, sum(contado) contado, max(folha) folha, max(custo) custo from linhas where estoque_id = v_central group by 1),
    x as (
      select i.id item_id, trim(i.nome) nome, i.unidade_medida um,
             round(b.contado - b.folha, 3) dif_bar, round(ce.contado - ce.folha, 3) dif_central,
             least(abs(b.contado - b.folha), abs(ce.contado - ce.folha)) qtd, coalesce(nullif(ce.custo, 0), b.custo) custo
        from b join ce using (item_id) join itens_estoque i on i.id = b.item_id
       where sign(b.contado - b.folha) * sign(ce.contado - ce.folha) = -1)
    select jsonb_build_object(
      'status', 'ok',
      'bar_aberto', exists (select 1 from linhas where estoque_id = v_bar),
      'central_aberto', exists (select 1 from linhas where estoque_id = v_central),
      'provaveis_transferencias', coalesce((select jsonb_agg(jsonb_build_object(
          'item_id', item_id, 'nome', nome, 'um', um, 'diferenca_bar', dif_bar, 'diferenca_central', dif_central,
          'quantidade', round(qtd, 3), 'valor', round(qtd * custo, 2),
          'de', case when dif_central < 0 then 'central' else 'bar' end,
          'para', case when dif_central < 0 then 'bar' else 'central' end) order by qtd * custo desc) from x), '[]'::jsonb),
      'diferenca_no_bar_sem_contar_no_central', coalesce((select jsonb_agg(trim(i.nome) order by trim(i.nome))
          from b join itens_estoque i on i.id = b.item_id
         where b.contado <> b.folha and not exists (select 1 from ce where ce.item_id = b.item_id)), '[]'::jsonb))
  );
end $function$;

-- 2, 3b, 4, 5) Ferramenta de contagem do agente.
create or replace function public.fn_agente_contagem(p_pessoa uuid, p_op text, p_args jsonb)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_bar constant uuid := '10b3aacf-61b1-4add-91ac-0949d3e7f3a3';
  v_central_id constant uuid := 'ea043464-d54e-4f42-8e40-4edddc5b4b51';
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
  v_confirmado boolean := coalesce((p_args->>'confirmado')::boolean, false);
  v_partes jsonb;
  v_total numeric;
  v_antes numeric;
  v_sai numeric;
  v_outras uuid[];
  v_gravados uuid[] := '{}';
  v_confirmar jsonb := '[]'::jsonb;
  v_abertas uuid[];
  v_cruz jsonb;
  v_resumo jsonb;
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
        -- O item já está numa folha aberta do Central? Usa essa (de preferência a que já tem contagem).
        select ci.contagem_id into v_cid from contagens_estoque_itens ci
         where ci.contagem_id = any (coalesce(v_ids, '{}')) and ci.item_estoque_id = r.item_id
         order by (ci.quantidade_contada is not null) desc, ci.contado_em desc nulls last limit 1;
        if not found then
          -- A zona do item: abre (ou reaproveita) a contagem daquela categoria.
          begin
            v_res := fn_contagem_bloco_abrir(v_estoque, (select coalesce(nullif(btrim(categoria), ''), 'Sem categoria') from itens_estoque where id = r.item_id), v_e.nome);
          exception when others then
            v_fora := v_fora || jsonb_build_object('item_id', r.item_id, 'nome', (select trim(nome) from itens_estoque where id = r.item_id), 'motivo', sqlerrm);
            continue;
          end;
          v_cid := (v_res->>'id')::uuid;
          update contagens_estoque set criado_por = coalesce(criado_por, v_e.usuario_id) where id = v_cid;
          if not (v_cid = any (coalesce(v_ids, '{}'))) then v_ids := coalesce(v_ids, '{}') || v_cid; end if;
        end if;
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
      -- O mesmo item contado em outra folha aberta do estoque: junta os lugares nesta linha.
      select array_agg(o.id) into v_outras from contagens_estoque_itens o
       where o.contagem_id = any (coalesce(v_ids, '{}')) and o.item_estoque_id = r.item_id
         and o.id <> v_linha.id and o.quantidade_contada is not null;
      if v_outras is not null then
        select coalesce(jsonb_object_agg(key, s), '{}'::jsonb) into v_partes from (
          select key, sum(value::numeric) s from (
            select * from jsonb_each_text(v_partes)
            union all
            select e.key, e.value from contagens_estoque_itens o,
                   jsonb_each_text(coalesce(o.partes, jsonb_build_object('tela', o.quantidade_contada))) e
             where o.id = any (v_outras)) u
          group by key) t;
      end if;
      select sum(value::numeric) into v_antes from jsonb_each_text(v_partes);

      v_partes := jsonb_set(v_partes, array[v_local],
        to_jsonb(case when v_somar then coalesce((v_partes->>v_local)::numeric, 0) + r.qtd else r.qtd end));
      if not v_somar and r.qtd = 0 and coalesce((p_args->>'apagar_parte')::boolean, false) then v_partes := v_partes - v_local; end if;
      select sum(value::numeric) into v_total from jsonb_each_text(v_partes);

      -- Zerar ou reduzir item caro (saída ≥ R$ 300) só com confirmado=true, depois de a pessoa confirmar o nome exato.
      v_sai := case
                 when v_antes is not null and coalesce(v_total, 0) < v_antes then v_antes - coalesce(v_total, 0)
                 when v_antes is null and v_total = 0 then greatest(calcular_saldo_item_estoque(r.item_id, v_estoque), 0)
                 else 0 end
               * coalesce(nullif(v_linha.valor_unitario, 0), (select custo_medio from itens_estoque where id = r.item_id), 0);
      if v_sai >= 300 and not v_confirmado then
        v_confirmar := v_confirmar || jsonb_build_object('item_id', r.item_id, 'nome', (select trim(nome) from itens_estoque where id = r.item_id),
          'contado_ate_agora', v_antes, 'ficaria', v_total, 'valor_que_sai', round(v_sai, 2));
        continue;
      end if;

      if v_outras is not null then
        update contagens_estoque_itens set partes = null, quantidade_contada = null, contado_em = null, observacao = null
         where id = any (v_outras);
      end if;
      update contagens_estoque_itens
         set partes = v_partes,
             quantidade_contada = v_total,
             quantidade_sistema = calcular_saldo_item_estoque(item_estoque_id, v_estoque),
             contado_em = case when v_total is null then null else now() end,
             observacao = (select string_agg(key || ': ' || fn_fmt_qtd(value::numeric), ' · ' order by key)
                             from jsonb_each_text(v_partes))
       where id = v_linha.id;
      v_gravados := v_gravados || r.item_id;
    end loop;
    if v_central then
      select array_agg(id) into v_ids from contagens_estoque
       where estoque_id = v_estoque and status = 'em_andamento' and bloco is not null and bloco not like '\_\_%'
         and criado_em > now() - interval '24 hours';
    end if;
    -- O que ficou gravado, lido de novo do banco: soma do item em todas as folhas abertas do estoque.
    select coalesce(jsonb_agg(jsonb_build_object('item_id', t.item_estoque_id, 'nome', trim(i.nome),
             'total_contado', t.total, 'partes', case when t.n <= 1 then t.partes->0 else t.partes end,
             'linhas_com_contagem', t.n) order by trim(i.nome)), '[]'::jsonb)
      into v_feitos
      from (select item_estoque_id, sum(quantidade_contada) total, count(quantidade_contada) n,
                   coalesce(jsonb_agg(partes) filter (where quantidade_contada is not null), '[]'::jsonb) partes
              from contagens_estoque_itens
             where contagem_id = any (coalesce(v_ids, '{}')) and item_estoque_id = any (v_gravados)
             group by 1) t
      join itens_estoque i on i.id = t.item_estoque_id;
    return jsonb_build_object('status', 'anotado', 'local', v_local, 'itens', v_feitos, 'fora_do_setor', v_fora,
      'confirmar_antes', v_confirmar,
      'aviso', case when jsonb_array_length(v_confirmar) > 0 then
        'Os itens em confirmar_antes NÃO foram gravados: zerar ou reduzir sai R$ 300 ou mais. Pergunte o nome exato e a quantidade; com a confirmação, chame de novo só com eles e confirmado=true.' end,
      'ja_contados', (select count(distinct item_estoque_id) from contagens_estoque_itens where contagem_id = any (coalesce(v_ids, '{}')) and quantidade_contada is not null));
  end if;

  if coalesce(cardinality(v_ids), 0) = 0 then
    return jsonb_build_object('status', 'sem_contagem', 'motivo', 'Não há contagem aberta neste estoque.');
  end if;

  if p_op = 'situacao' then
    v_resumo := fn_agente_contagem_resumo(v_ids, v_estoque);
    return jsonb_build_object('status', 'aberta',
      'modo', case when v_central then 'por_zona' when v_c.bloco = '__diaria' then 'diaria' else 'auditoria' end,
      'zonas', case when v_central then (select jsonb_agg(bloco) from contagens_estoque where id = any (v_ids)) end,
      'contados', v_resumo->'itens',
      'itens_com_diferenca', v_resumo->'itens_com_diferenca',
      'valor_faltas', v_resumo->'valor_faltas', 'valor_sobras', v_resumo->'valor_sobras', 'valor_liquido', v_resumo->'valor_liquido',
      'nao_contados', coalesce((select jsonb_agg(jsonb_build_object('nome', trim(i.nome), 'sistema', round(calcular_saldo_item_estoque(ci.item_estoque_id, v_estoque), 3)) order by trim(i.nome))
        from contagens_estoque_itens ci join itens_estoque i on i.id = ci.item_estoque_id
       where ci.contagem_id = any (v_ids) and ci.quantidade_contada is null
         and not exists (select 1 from contagens_estoque_itens o where o.contagem_id = any (v_ids)
                          and o.item_estoque_id = ci.item_estoque_id and o.quantidade_contada is not null)
         and (v_central or exists (select 1 from itens_estoque_niveis n where n.item_id = ci.item_estoque_id and n.estoque_id = v_estoque
                                    and (v_c.bloco = '__auditoria' or n.controle = 'contagem')))), '[]'::jsonb));
  end if;

  if p_op = 'concluir' then
    if v_ensaio then return jsonb_build_object('status', 'ensaio', 'acao', 'concluir contagem'); end if;
    -- Bar e Central abertos ao mesmo tempo: só fecha depois do cruzamento conferido (depois da última anotação).
    if v_estoque in (v_bar, v_central_id) then
      select array_agg(c.id) into v_abertas from contagens_estoque c
       where c.status = 'em_andamento' and c.criado_em > now() - interval '24 hours'
         and ((c.estoque_id = v_bar and c.bloco in ('__auditoria', '__diaria'))
              or (c.estoque_id = v_central_id and c.bloco is not null and c.bloco not like '\_\_%'))
         and exists (select 1 from contagens_estoque_itens ci where ci.contagem_id = c.id and ci.quantidade_contada is not null);
      if exists (select 1 from contagens_estoque where id = any (coalesce(v_abertas, '{}')) and estoque_id <> v_estoque)
         and exists (select 1 from contagens_estoque c where c.id = any (v_abertas)
                      and (c.cruzado_em is null or c.cruzado_em < (select max(ci.contado_em) from contagens_estoque_itens ci where ci.contagem_id = any (v_abertas)))) then
        v_cruz := fn_agente_contagem_cruzar(p_pessoa);
        if jsonb_array_length(coalesce(v_cruz->'provaveis_transferencias', '[]'::jsonb))
           + jsonb_array_length(coalesce(v_cruz->'diferenca_no_bar_sem_contar_no_central', '[]'::jsonb)) > 0 then
          return jsonb_build_object('status', 'cruzar_antes',
            'motivo', 'Nada foi fechado. O Bar e o Central estão abertos e o cruzamento ainda não tinha sido mostrado. Mostre as prováveis transferências e os itens do Bar sem contar no Central, lance as confirmadas com transferencia_da_contagem e só depois feche.',
            'cruzamento', v_cruz);
        end if;
      end if;
    end if;
    -- Totais por item (somando as folhas do mesmo estoque), antes de processar.
    v_resumo := fn_agente_contagem_resumo(v_ids, v_estoque) - 'itens';
    if not v_central then
      v_res := fn_contagem_setor_concluir(v_c.id);
      if coalesce((v_res->>'aprovacao')::boolean, false) and v_pode_aprovar then
        perform fn_contagem_processar_pela_folha(v_c.id, v_e.usuario_id);
        return v_res || v_resumo || jsonb_build_object('status', 'processada', 'aprovacao', false, 'aprovada_por', v_e.nome);
      end if;
      return v_res || v_resumo || jsonb_build_object('status', case when coalesce((v_res->>'aprovacao')::boolean, false) then 'aguardando_aprovacao' else 'processada' end,
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
    return v_resumo || jsonb_build_object('status', case when v_pode_aprovar then 'processada' else 'aguardando_aprovacao' end,
      'estoque', (select nome from estoques where id = v_estoque), 'zonas', v_zonas,
      'contados', v_resumo->'itens_contados',
      'diferencas', v_resumo->'itens_com_diferenca',
      'valor', (v_resumo->>'valor_faltas')::numeric + (v_resumo->>'valor_sobras')::numeric,
      'onde_aprovar', case when not v_pode_aprovar then 'Contagem do Central, na zona finalizada (Resultado → processar)' end);
  end if;

  if p_op = 'cancelar' then
    if v_ensaio then return jsonb_build_object('status', 'ensaio', 'acao', 'cancelar contagem'); end if;
    foreach v_cid in array v_ids loop perform cancelar_contagem_estoque(v_cid); end loop;
    return jsonb_build_object('status', 'cancelada', 'contagens', cardinality(v_ids));
  end if;

  raise exception 'Operação inválida: %', p_op;
end $function$;
