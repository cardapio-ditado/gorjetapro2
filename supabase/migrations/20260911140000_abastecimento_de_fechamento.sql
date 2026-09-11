-- ═══════════════════════════════════════════════════════════════════════════
-- ABASTECIMENTO DE FECHAMENTO
--
-- A reposição automática roda de manhã, mas o Bar às vezes abastece no fim da
-- noite (cerveja, principalmente) e vai buscar no Central por conta própria.
-- Este link registra esse abastecimento na hora: cria a requisição já
-- concluída, então a transferência Central → balcão acontece no mesmo
-- instante em que a mercadoria sai fisicamente.
--
-- Por que NÃO é contagem: a baixa ZIG da noite só entra às 6h. Se o balcão
-- "contasse" às 23h, o saldo seria gravado antes das vendas serem descontadas
-- e a baixa da manhã derrubaria o saldo de novo. Abastecimento é só entrada,
-- então convive com a baixa da manhã sem conflito.
--
-- A reposição da manhã enxerga o balcão já abastecido e sugere menos.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Dados da tela ───────────────────────────────────────────────────────────
create or replace function public.fn_abastecimento_dados(p_setor text)
returns jsonb
language sql stable security definer set search_path = public as $$
with s as (select * from fn_pedido_setor_estoque(p_setor)),
central as (select id from estoques where tipo = 'central' and status = true order by criado_em limit 1),
itens as (
  select jsonb_agg(jsonb_build_object(
           'item_id', i.id, 'nome', i.nome, 'categoria', i.categoria, 'um', i.unidade_medida,
           'nivel', n.nivel_reposicao,
           'saldo_local', round(coalesce(sl.quantidade_atual, 0), 3),
           'saldo_central', round(coalesce(sc.quantidade_atual, 0), 3),
           'fracionado', lower(btrim(coalesce(i.unidade_medida, ''))) = any (array['kg','g','grama','gramas','l','litro','litros','ml','mililitro','mililitros'])
         ) order by i.categoria nulls last, i.nome) as lista
    from itens_estoque_niveis n
    join itens_estoque i on i.id = n.item_id and i.status = 'ativo'
    left join saldos_estoque sl on sl.item_id = n.item_id and sl.estoque_id = n.estoque_id
    left join saldos_estoque sc on sc.item_id = n.item_id and sc.estoque_id = (select id from central)
   where n.estoque_id = (select estoque_id from s)
     and n.controle = 'venda'          -- o que baixa pela venda: cerveja, refri, drink
),
outros as (
  select jsonb_agg(jsonb_build_object('item_id', i.id, 'nome', i.nome, 'categoria', i.categoria, 'um', i.unidade_medida,
           'saldo_central', round(coalesce(sc.quantidade_atual, 0), 3)) order by i.nome) as lista
    from itens_estoque i
    left join saldos_estoque sc on sc.item_id = i.id and sc.estoque_id = (select id from central)
   where i.status = 'ativo'
     and not exists (select 1 from itens_estoque_niveis n
                      where n.item_id = i.id and n.estoque_id = (select estoque_id from s) and n.controle = 'venda')
),
pessoas as (
  select jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome_completo) order by c.nome_completo) as lista
    from colaboradores c join setores st on st.id = c.setor_id
   where c.status = 'ativo' and lower(st.nome) = lower((select setor_nome from s))
),
ultimos as (
  select jsonb_agg(jsonb_build_object(
           'numero', r.numero_requisicao, 'quando', r.data_requisicao, 'quem', r.funcionario_nome,
           'itens', (select count(*) from requisicoes_internas_itens ri where ri.requisicao_id = r.id))
           order by r.data_requisicao desc) as lista
    from (select * from requisicoes_internas
           where estoque_destino_id = (select estoque_id from s)
             and observacoes ilike 'Abastecimento de fechamento%'
           order by data_requisicao desc limit 5) r
)
select case when (select estoque_id from s) is null then jsonb_build_object('erro', 'setor desconhecido')
       else jsonb_build_object(
         'setor', (select jsonb_build_object('slug', lower(trim(p_setor)), 'estoque_id', estoque_id, 'nome', setor_nome) from s),
         'itens', coalesce((select lista from itens), '[]'::jsonb),
         'outros_itens', coalesce((select lista from outros), '[]'::jsonb),
         'pessoas', coalesce((select lista from pessoas), '[]'::jsonb),
         'ultimos', coalesce((select lista from ultimos), '[]'::jsonb)
       ) end;
$$;

-- ─── Registro do abastecimento ───────────────────────────────────────────────
-- p_itens: [{"item_id": uuid, "quantidade": n}]
create or replace function public.fn_abastecimento_enviar(
  p_setor text, p_nome text, p_itens jsonb, p_observacoes text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_est record; v_central uuid; v_req uuid; v_numero text;
  v_item jsonb; v_item_id uuid; v_qtd numeric;
  v_nome_item text; v_um text; v_saldo_central numeric;
  v_n int := 0; v_linhas text := ''; v_faltas text := '';
  v_dest record; v_msg text;
begin
  select * into v_est from fn_pedido_setor_estoque(p_setor);
  if v_est.estoque_id is null then raise exception 'Setor desconhecido: %', p_setor; end if;
  select id into v_central from estoques where tipo = 'central' and status = true order by criado_em limit 1;
  if v_central is null then raise exception 'Estoque central não encontrado'; end if;
  if p_nome is null or btrim(p_nome) = '' then raise exception 'Informe quem está abastecendo'; end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' then raise exception 'Itens inválidos'; end if;

  insert into requisicoes_internas (numero_requisicao, data_requisicao, funcionario_nome, setor,
                                    estoque_origem_id, estoque_destino_id, status, observacoes,
                                    criado_anonimamente, data_aprovacao)
  values ('', now(), btrim(p_nome), v_est.setor_nome, v_central, v_est.estoque_id, 'aprovado',
          'Abastecimento de fechamento' || coalesce(' · ' || nullif(btrim(coalesce(p_observacoes, '')), ''), ''),
          true, now())
  returning id, numero_requisicao into v_req, v_numero;

  for v_item in select * from jsonb_array_elements(p_itens) loop
    v_item_id := (v_item->>'item_id')::uuid;
    v_qtd := coalesce((v_item->>'quantidade')::numeric, 0);
    if v_qtd <= 0 then continue; end if;
    select nome, unidade_medida into v_nome_item, v_um from itens_estoque where id = v_item_id and status = 'ativo';
    if v_nome_item is null then continue; end if;

    -- Já entregue: quem pegou no Central levou agora.
    insert into requisicoes_internas_itens (requisicao_id, item_id, quantidade_solicitada, quantidade_aprovada, quantidade_entregue)
    values (v_req, v_item_id, v_qtd, v_qtd, v_qtd);
    v_n := v_n + 1;
    v_linhas := v_linhas || format('• %s %s %s', trim(to_char(v_qtd, 'FM9999990.##')), coalesce(v_um, ''), v_nome_item) || E'\n';

    select coalesce(quantidade_atual, 0) into v_saldo_central from saldos_estoque where item_id = v_item_id and estoque_id = v_central;
    if coalesce(v_saldo_central, 0) < v_qtd then
      v_faltas := v_faltas || format('• %s (Central tinha %s)', v_nome_item, trim(to_char(coalesce(v_saldo_central, 0), 'FM9999990.##'))) || E'\n';
    end if;
  end loop;

  if v_n = 0 then
    delete from requisicoes_internas where id = v_req;
    raise exception 'Nenhum item com quantidade válida';
  end if;

  -- O gatilho de conclusão faz a transferência Central → balcão.
  update requisicoes_internas
     set status = 'concluido', data_conclusao = now(), updated_at = now()
   where id = v_req;

  v_msg := format(E'\U0001F319 <b>Abastecimento de fechamento · %s</b> · %s\nPor %s · %s itens\n\n%s',
                  v_est.setor_nome, v_numero, btrim(p_nome), v_n, v_linhas);
  if v_faltas <> '' then v_msg := v_msg || E'\n⚠️ <b>Saiu mais do que o Central tinha:</b>\n' || v_faltas; end if;
  if p_observacoes is not null and btrim(p_observacoes) <> '' then v_msg := v_msg || E'\n\U0001F4DD ' || btrim(p_observacoes) || E'\n'; end if;
  v_msg := v_msg || E'\nJá transferido do Central. Confira em Estoque › Requisições.';

  for v_dest in
    select telegram_chat_id, nome from telegram_usuarios_bot
     where ativo = true and (cargo = 'gestor' or 'estoque' = any(permissoes))
  loop
    insert into telegram_tarefas_programadas (telegram_chat_id, nome_destinatario, mensagem, tipo_recorrencia, ativo, data_inicio, proxima_execucao, observacoes)
    values (v_dest.telegram_chat_id, v_dest.nome, v_msg, 'unica', true, current_date, now(), 'Abastecimento de fechamento ' || v_numero);
  end loop;

  return jsonb_build_object('id', v_req, 'numero', v_numero, 'itens', v_n, 'faltas', nullif(v_faltas, ''));
end;
$$;

-- ─── Permissões: o link é público (anon), como o da contagem ─────────────────
grant execute on function public.fn_abastecimento_dados(text) to anon, authenticated, service_role;
grant execute on function public.fn_abastecimento_enviar(text, text, jsonb, text) to anon, authenticated, service_role;
