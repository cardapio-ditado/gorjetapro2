-- ═══════════════════════════════════════════════════════════════════════════
-- REPOSIÇÃO DE BALCÃO SEM APROVAÇÃO
--
-- A requisição interna deixa de passar por "pendente → aprovado". Todo dia às
-- 6h30 (Cuiabá) o sistema gera sozinho a reposição de cada balcão (Bar e
-- Cozinha: estoques que têm nível de balcão cadastrado):
--   sugestão = nível de balcão − saldo do balcão (a venda ZIG já abateu)
-- Itens que não baixam com a venda (arroz, cebola, gelo) só entram se o balcão
-- contou nos últimos 2 dias; senão aparecem em "precisa contagem".
-- O estoquista abre Estoque › Reposição de balcão, ajusta e entrega.
-- O pedido pelo link do setor também já nasce "aprovado".
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Contagens do balcão (mesmo quando bate com o sistema) ────────────────────
create table if not exists public.balcao_contagens (
  estoque_id  uuid not null references estoques(id) on delete cascade,
  item_id     uuid not null references itens_estoque(id) on delete cascade,
  contado     numeric not null,
  sistema     numeric,
  contado_por text,
  contado_em  timestamptz not null default now(),
  primary key (estoque_id, item_id)
);
alter table public.balcao_contagens enable row level security;
drop policy if exists "balcao_contagens_leitura" on public.balcao_contagens;
create policy "balcao_contagens_leitura" on public.balcao_contagens for select to authenticated using (true);
grant select on public.balcao_contagens to authenticated;

-- ─── Quais estoques são balcão: não-central com nível cadastrado ─────────────
create or replace function public.fn_reposicao_balcao_estoques()
returns table (estoque_id uuid, nome text, slug text)
language sql stable security definer set search_path = public as $$
  select e.id, e.nome, lower(e.nome)
    from estoques e
   where e.status = true and e.tipo <> 'central'
     and exists (select 1 from itens_estoque_niveis n where n.estoque_id = e.id)
   order by e.nome;
$$;

-- ─── Cálculo da sugestão de um balcão (não grava nada) ────────────────────────
create or replace function public.fn_reposicao_balcao_calcular(p_estoque_id uuid)
returns table (
  item_id uuid, nome text, categoria text, um text, nivel numeric,
  saldo_local numeric, saldo_central numeric, grupo text, fracionado boolean,
  sugestao numeric, contado_em timestamptz)
language sql stable security definer set search_path = public as $$
with central as (select id from estoques where tipo = 'central' and status = true order by criado_em limit 1),
base as (
  select n.item_id, i.nome, i.categoria, i.unidade_medida as um, n.nivel_reposicao as nivel,
         round(coalesce(sl.quantidade_atual, 0), 3) as saldo_local,
         round(coalesce(sc.quantidade_atual, 0), 3) as saldo_central,
         case when exists (select 1 from mapeamento_itens_vendas m
                            where m.item_estoque_id = n.item_id and m.estoque_id = n.estoque_id and not coalesce(m.ignorar_estoque, false)) then 'vendido'
              when exists (select 1 from ficha_ingredientes fi
                             join mapeamento_itens_vendas m on m.ficha_tecnica_id = fi.ficha_id and m.estoque_id = n.estoque_id
                            where fi.item_estoque_id = n.item_id and coalesce(fi.baixa_estoque, true)) then 'ficha'
              else 'sem_baixa' end as grupo,
         lower(btrim(coalesce(i.unidade_medida, ''))) = any (array['kg','g','grama','gramas','l','litro','litros','ml','mililitro','mililitros']) as fracionado,
         bc.contado_em
    from itens_estoque_niveis n
    join itens_estoque i on i.id = n.item_id and i.status = 'ativo'
    left join saldos_estoque sl on sl.item_id = n.item_id and sl.estoque_id = n.estoque_id
    left join saldos_estoque sc on sc.item_id = n.item_id and sc.estoque_id = (select id from central)
    left join balcao_contagens bc on bc.item_id = n.item_id and bc.estoque_id = n.estoque_id
   where n.estoque_id = p_estoque_id and coalesce(n.nivel_reposicao, 0) > 0
)
-- Saldo negativo no balcão (deriva da ficha técnica) conta como zero: a
-- sugestão nunca passa do nível. O sinal de que precisa contar fica na tela.
select item_id, nome, categoria, um, nivel, saldo_local, saldo_central, grupo, fracionado,
       case when nivel - greatest(saldo_local, 0) <= 0 then 0
            when fracionado then round(nivel - greatest(saldo_local, 0), 3)
            else ceil(nivel - greatest(saldo_local, 0)) end as sugestao,
       contado_em
  from base
 order by categoria nulls last, nome;
$$;

-- ─── Gera (ou refaz) a reposição automática de hoje para um balcão ────────────
create or replace function public.fn_reposicao_balcao_gerar(p_estoque_id uuid, p_dry_run boolean default false)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_est record; v_central uuid; v_req uuid; v_numero text; r record;
  v_n int := 0; v_ids uuid[] := '{}';
  v_sem_contagem jsonb := '[]'::jsonb; v_faltas jsonb := '[]'::jsonb; v_itens jsonb := '[]'::jsonb;
begin
  select id, nome into v_est from estoques where id = p_estoque_id and status = true and tipo <> 'central';
  if v_est.id is null then raise exception 'Balcão não encontrado'; end if;
  select id into v_central from estoques where tipo = 'central' and status = true order by criado_em limit 1;

  -- reposição automática de hoje ainda não entregue (refeita a cada geração)
  select id, numero_requisicao into v_req, v_numero
    from requisicoes_internas
   where estoque_destino_id = p_estoque_id and funcionario_nome = 'Reposição automática'
     and status in ('pendente', 'aprovado') and data_requisicao::date = current_date
   order by data_requisicao desc limit 1;

  for r in select * from fn_reposicao_balcao_calcular(p_estoque_id) loop
    if r.grupo = 'sem_baixa' and (r.contado_em is null or r.contado_em < now() - interval '2 days') then
      v_sem_contagem := v_sem_contagem || jsonb_build_object('item_id', r.item_id, 'nome', r.nome, 'um', r.um, 'contado_em', r.contado_em);
      continue;
    end if;
    if r.sugestao <= 0 then continue; end if;

    v_n := v_n + 1;
    v_ids := v_ids || r.item_id;
    v_itens := v_itens || jsonb_build_object('item_id', r.item_id, 'nome', r.nome, 'um', r.um, 'nivel', r.nivel,
                                             'saldo_local', r.saldo_local, 'saldo_central', r.saldo_central, 'sugestao', r.sugestao, 'grupo', r.grupo);
    if r.saldo_central < r.sugestao then
      v_faltas := v_faltas || jsonb_build_object('item_id', r.item_id, 'nome', r.nome, 'sugestao', r.sugestao, 'saldo_central', r.saldo_central);
    end if;

    if not p_dry_run then
      if v_req is null then
        insert into requisicoes_internas (numero_requisicao, data_requisicao, funcionario_nome, setor,
                                          estoque_origem_id, estoque_destino_id, status, observacoes, criado_anonimamente, data_aprovacao)
        values ('', now(), 'Reposição automática', v_est.nome, v_central, p_estoque_id, 'aprovado',
                'Gerada pelo nível de balcão (nível − saldo do balcão).', false, now())
        returning id, numero_requisicao into v_req, v_numero;
      end if;
      update requisicoes_internas_itens
         set quantidade_solicitada = r.sugestao,
             observacao = format('nível %s · balcão tinha %s', trim(to_char(r.nivel, 'FM9999990.###')), trim(to_char(r.saldo_local, 'FM9999990.###')))
       where requisicao_id = v_req and item_id = r.item_id;
      if not found then
        insert into requisicoes_internas_itens (requisicao_id, item_id, quantidade_solicitada, observacao)
        values (v_req, r.item_id, r.sugestao, format('nível %s · balcão tinha %s', trim(to_char(r.nivel, 'FM9999990.###')), trim(to_char(r.saldo_local, 'FM9999990.###'))));
      end if;
    end if;
  end loop;

  if not p_dry_run and v_req is not null then
    delete from requisicoes_internas_itens where requisicao_id = v_req and not (item_id = any (v_ids));
    if v_n = 0 then
      delete from requisicoes_internas where id = v_req;
      v_req := null; v_numero := null;
    else
      update requisicoes_internas set updated_at = now() where id = v_req;
    end if;
  end if;

  return jsonb_build_object('estoque_id', p_estoque_id, 'setor', v_est.nome, 'requisicao_id', v_req, 'numero', v_numero,
                            'itens', v_n, 'lista', v_itens, 'faltas', v_faltas, 'sem_contagem', v_sem_contagem, 'dry_run', p_dry_run);
end;
$$;

-- ─── Todos os balcões + aviso no Telegram para o estoquista ──────────────────
create or replace function public.fn_reposicao_balcao_gerar_todos(p_dry_run boolean default false, p_avisar boolean default true)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  b record; res jsonb; v_out jsonb := '[]'::jsonb; v_total int := 0;
  v_msg text := ''; v_sc text; v_dest record; f jsonb;
begin
  for b in select * from fn_reposicao_balcao_estoques() loop
    res := fn_reposicao_balcao_gerar(b.estoque_id, p_dry_run);
    v_out := v_out || res;
    v_total := v_total + (res->>'itens')::int;
    v_msg := v_msg || format(E'• <b>%s</b>: %s itens', b.nome, res->>'itens');
    if jsonb_array_length(res->'faltas') > 0 then
      v_msg := v_msg || format(' (%s sem saldo no Central)', jsonb_array_length(res->'faltas'));
    end if;
    v_msg := v_msg || E'\n';
    if jsonb_array_length(res->'sem_contagem') > 0 then
      select string_agg(x->>'nome', ', ') into v_sc from jsonb_array_elements(res->'sem_contagem') x;
      v_msg := v_msg || format(E'   ⚠️ sem contagem: %s\n', v_sc);
    end if;
  end loop;

  if not p_dry_run and p_avisar and v_total > 0 then
    v_msg := E'\U0001F4E6 <b>Reposição de balcão de hoje</b>\n' || v_msg || E'\nEntregar em Estoque › Reposição de balcão.';
    for v_dest in
      select telegram_chat_id, nome from telegram_usuarios_bot
       where ativo = true and cargo <> 'gestor' and 'estoque' = any(permissoes)
    loop
      insert into telegram_tarefas_programadas (telegram_chat_id, nome_destinatario, mensagem, tipo_recorrencia, ativo, data_inicio, proxima_execucao, observacoes)
      values (v_dest.telegram_chat_id, v_dest.nome, v_msg, 'unica', true, current_date, now(), 'Reposição de balcão ' || to_char(current_date, 'DD/MM'));
    end loop;
    if not found then
      for v_dest in select telegram_chat_id, nome from telegram_usuarios_bot where ativo = true and cargo = 'gestor' loop
        insert into telegram_tarefas_programadas (telegram_chat_id, nome_destinatario, mensagem, tipo_recorrencia, ativo, data_inicio, proxima_execucao, observacoes)
        values (v_dest.telegram_chat_id, v_dest.nome, v_msg, 'unica', true, current_date, now(), 'Reposição de balcão ' || to_char(current_date, 'DD/MM'));
      end loop;
    end if;
  end if;

  return jsonb_build_object('balcoes', v_out, 'total_itens', v_total, 'dry_run', p_dry_run);
end;
$$;

-- ─── Dados da tela "Reposição de balcão" ──────────────────────────────────────
create or replace function public.fn_reposicao_balcao_hoje()
returns jsonb
language sql stable security definer set search_path = public as $$
with central as (select id from estoques where tipo = 'central' and status = true order by criado_em limit 1),
balcoes as (select * from fn_reposicao_balcao_estoques()),
reqs as (
  select r.id, r.numero_requisicao, r.data_requisicao, r.funcionario_nome, r.status, r.observacoes,
         r.estoque_destino_id, r.funcionario_nome = 'Reposição automática' as automatica,
         (select jsonb_agg(jsonb_build_object(
                   'item_id', ri.item_id, 'nome', i.nome, 'um', i.unidade_medida, 'categoria', i.categoria,
                   'solicitada', ri.quantidade_solicitada, 'obs', ri.observacao,
                   'saldo_central', round(coalesce(sc.quantidade_atual, 0), 3),
                   'saldo_local', round(coalesce(sl.quantidade_atual, 0), 3),
                   'nivel', n.nivel_reposicao,
                   'fracionado', lower(btrim(coalesce(i.unidade_medida, ''))) = any (array['kg','g','grama','gramas','l','litro','litros','ml','mililitro','mililitros'])
                 ) order by i.categoria nulls last, i.nome)
            from requisicoes_internas_itens ri
            join itens_estoque i on i.id = ri.item_id
            left join saldos_estoque sc on sc.item_id = ri.item_id and sc.estoque_id = (select id from central)
            left join saldos_estoque sl on sl.item_id = ri.item_id and sl.estoque_id = r.estoque_destino_id
            left join itens_estoque_niveis n on n.item_id = ri.item_id and n.estoque_id = r.estoque_destino_id
           where ri.requisicao_id = r.id) as itens
    from requisicoes_internas r
   where r.status in ('pendente', 'aprovado')
     and r.estoque_destino_id in (select estoque_id from balcoes)
),
sem_contagem as (
  select b.estoque_id, jsonb_agg(jsonb_build_object('item_id', c.item_id, 'nome', c.nome, 'um', c.um, 'contado_em', c.contado_em) order by c.nome) as lista
    from balcoes b, lateral fn_reposicao_balcao_calcular(b.estoque_id) c
   where c.grupo = 'sem_baixa' and (c.contado_em is null or c.contado_em < now() - interval '2 days')
   group by b.estoque_id
)
select jsonb_build_object(
  'gerado_em', now(),
  'central_id', (select id from central),
  'balcoes', coalesce((select jsonb_agg(jsonb_build_object(
      'estoque_id', b.estoque_id, 'nome', b.nome, 'slug', b.slug,
      'requisicoes', coalesce((select jsonb_agg(jsonb_build_object(
                         'id', q.id, 'numero', q.numero_requisicao, 'quando', q.data_requisicao, 'solicitante', q.funcionario_nome,
                         'status', q.status, 'automatica', q.automatica, 'observacoes', q.observacoes, 'itens', coalesce(q.itens, '[]'::jsonb))
                         order by q.automatica desc, q.data_requisicao)
                        from reqs q where q.estoque_destino_id = b.estoque_id), '[]'::jsonb),
      'sem_contagem', coalesce((select lista from sem_contagem s where s.estoque_id = b.estoque_id), '[]'::jsonb),
      'entregues_hoje', (select count(*) from requisicoes_internas r where r.estoque_destino_id = b.estoque_id and r.status = 'concluido' and r.data_conclusao::date = current_date),
      'niveis', (select count(*) from itens_estoque_niveis n where n.estoque_id = b.estoque_id)
    ) order by b.nome) from balcoes b), '[]'::jsonb),
  'outras_abertas', (select count(*) from requisicoes_internas r where r.status in ('pendente', 'aprovado') and r.estoque_destino_id not in (select estoque_id from balcoes))
);
$$;

-- ─── Pedido pelo link do setor: já nasce aprovado e registra a contagem ───────
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

  -- 1. Requisição: sem etapa de aprovação, já entra como "a entregar"
  insert into requisicoes_internas (numero_requisicao, data_requisicao, funcionario_nome, setor,
                                    estoque_origem_id, estoque_destino_id, status, observacoes, criado_anonimamente, data_aprovacao)
  values ('', now(), btrim(p_nome), v_est.setor_nome, v_central, v_est.estoque_id, 'aprovado',
          nullif(btrim(coalesce(p_observacoes, '')), ''), true, now())
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
      insert into balcao_contagens (estoque_id, item_id, contado, sistema, contado_por, contado_em)
      values (v_est.estoque_id, v_item_id, v_contado, v_saldo, btrim(p_nome), now())
      on conflict (estoque_id, item_id) do update
        set contado = excluded.contado, sistema = excluded.sistema, contado_por = excluded.contado_por, contado_em = excluded.contado_em;
      v_n_contagens := v_n_contagens + 1;
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
  v_msg := v_msg || E'\nEntregar em Estoque › Reposição de balcão.';
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

-- ─── Permissões ───────────────────────────────────────────────────────────────
revoke execute on function public.fn_reposicao_balcao_estoques() from public;
revoke execute on function public.fn_reposicao_balcao_calcular(uuid) from public;
revoke execute on function public.fn_reposicao_balcao_gerar(uuid, boolean) from public;
revoke execute on function public.fn_reposicao_balcao_gerar_todos(boolean, boolean) from public;
revoke execute on function public.fn_reposicao_balcao_hoje() from public;
grant execute on function public.fn_reposicao_balcao_estoques() to authenticated, service_role;
grant execute on function public.fn_reposicao_balcao_calcular(uuid) to authenticated, service_role;
grant execute on function public.fn_reposicao_balcao_gerar(uuid, boolean) to authenticated, service_role;
grant execute on function public.fn_reposicao_balcao_gerar_todos(boolean, boolean) to authenticated, service_role;
grant execute on function public.fn_reposicao_balcao_hoje() to authenticated, service_role;

-- ─── Job diário: 10:30 UTC = 6h30 em Cuiabá, depois da baixa ZIG das 6h ───────
select cron.unschedule(jobid) from cron.job where jobname = 'reposicao-balcao-diaria';
select cron.schedule('reposicao-balcao-diaria', '30 10 * * *', $cmd$ select public.fn_reposicao_balcao_gerar_todos(); $cmd$);
