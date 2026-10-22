-- Relatório do dia sob demanda, no lugar do envio automático das 07:00.
--
-- Com o WhatsApp oficial, mensagem fora das 24 h exige um modelo pago (a Meta
-- classificou o aviso como marketing). Agora o relatório é pedido: no
-- WhatsApp ("relatório", "relatório de sábado"), pela ferramenta
-- relatorio_do_dia do agente, que só aparece para quem tem a ação
-- 'relatorio'; e na tela "Relatório do dia" (admin e master). A conversa
-- começa pela pessoa, então a resposta não é cobrada.
--
-- O relatório do dia D cobre as vendas da Zig de D e o que foi lançado de
-- D 07:00 até D+1 07:00 (ou até agora, se ainda não deu esse horário), a
-- mesma janela do envio das 07:00. Furos, pendências e zerados são de agora.

update public.agente_config
   set valor = jsonb_set(valor, '{ativo}', 'false'::jsonb), atualizado_em = now()
 where chave = 'relatorio_diario';

insert into public.agente_permissoes (papel, acao, modo, estoques) values
  ('dono', 'relatorio', 'direto', null),
  ('gerente_geral', 'relatorio', 'direto', null)
on conflict (papel, acao) do nothing;

drop function if exists public.fn_relatorio_diario_texto(date, timestamptz);

create or replace function public.fn_relatorio_diario_texto(p_data date default null, p_desde timestamptz default null, p_ate timestamptz default null)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v_dia date := coalesce(p_data, fn_hoje_cuiaba() - 1);
  v_desde timestamptz := coalesce(p_desde, now() - interval '24 hours');
  v_ate timestamptz := coalesce(p_ate, now());
  v_bar uuid := '10b3aacf-61b1-4add-91ac-0949d3e7f3a3';
  v_coz uuid := '1da77d06-f428-49b4-afa7-9ffaa90b8557';
  v_central uuid := 'ea043464-d54e-4f42-8e40-4edddc5b4b51';
  t text;
  s text;
  f record;
  lg record;
  n int;
  v numeric;
  v2 numeric;
  d record;
begin
  t := '📊 *Relatório ' || (array['domingo','segunda','terça','quarta','quinta','sexta','sábado'])[extract(dow from v_dia)::int + 1]
       || ' ' || to_char(v_dia, 'DD/MM') || '*' || chr(10)
       || '_Lançamentos de ' || to_char(v_desde at time zone 'America/Cuiaba', 'DD/MM HH24:MI')
       || ' até ' || to_char(v_ate at time zone 'America/Cuiaba', 'DD/MM HH24:MI') || '_' || chr(10);

  -- ─── Vendas e baixa da Zig ───
  t := t || chr(10) || '💰 *Vendas Zig*' || chr(10);
  select * into f from faturamento_zig_diario where data = v_dia;
  if f.data is not null then
    t := t || 'Faturamento ' || fn_fmt_brl(f.total) || ' · ' || coalesce(f.num_comandas, 0) || ' comandas' || chr(10)
           || '• Bebidas ' || fn_fmt_brl(f.bebidas) || ' · Alimentos ' || fn_fmt_brl(f.alimentos) || chr(10);
  else
    t := t || '⚠️ Faturamento da Zig ainda não sincronizado.' || chr(10);
  end if;

  select * into lg from zig_vendas_sync_logs where dtinicio = v_dia order by iniciado_em desc limit 1;
  if lg.id is null then
    t := t || '⚠️ *A baixa da Zig não rodou para ' || to_char(v_dia, 'DD/MM') || '.* O estoque não está com as vendas.' || chr(10);
  elsif lg.status <> 'sucesso' then
    t := t || '⚠️ *A baixa da Zig falhou:* ' || left(coalesce(lg.erro_mensagem, lg.status), 120) || chr(10);
  end if;

  select count(*), sum(coalesce(custo_total, quantidade * coalesce(custo_unitario, 0)))
    into n, v
    from movimentacoes_estoque where origem_tipo = 'zig' and tipo_movimentacao = 'saida' and data_movimentacao = v_dia;
  if n > 0 then
    t := t || 'Baixa no estoque: ' || n || ' movimentos · custo ' || fn_fmt_brl(v) || chr(10);
    select string_agg('• ' || nome || ': ' || fn_fmt_qtd(q) || ' ' || fn_fmt_un(um) || ' (' || fn_fmt_brl(c) || ')', chr(10) order by c desc)
      into s
      from (select trim(coalesce(i.nome, m.item_descricao)) nome, i.unidade_medida um, sum(m.quantidade) q,
                   sum(coalesce(m.custo_total, m.quantidade * coalesce(m.custo_unitario, 0))) c
              from movimentacoes_estoque m left join itens_estoque i on i.id = m.item_id
             where m.origem_tipo = 'zig' and m.tipo_movimentacao = 'saida' and m.data_movimentacao = v_dia
             group by 1, 2 order by c desc limit 8) x;
    t := t || '_Maior custo:_' || chr(10) || s || chr(10);
  end if;
  if lg.id is not null and coalesce(lg.total_nao_mapeados, 0) > 0 then
    t := t || '⚠️ ' || lg.total_nao_mapeados || ' produtos vendidos sem vínculo com o estoque (não baixaram).' || chr(10);
  end if;

  -- ─── Furos: venderam sem ter no setor ───
  select count(*), string_agg('• ' || nome || ': ' || fn_fmt_qtd(q) || ' ' || fn_fmt_un(um), chr(10) order by valor)
    into n, s
    from (select trim(i.nome) nome, i.unidade_medida um, sa.quantidade_atual q,
                 sa.quantidade_atual * coalesce(sa.custo_medio, i.custo_medio, 0) valor,
                 row_number() over (order by sa.quantidade_atual * coalesce(sa.custo_medio, i.custo_medio, 0)) rn
            from saldos_estoque sa join itens_estoque i on i.id = sa.item_id
           where sa.estoque_id in (v_bar, v_coz) and sa.quantidade_atual < -0.01
             and exists (select 1 from movimentacoes_estoque m
                          where m.item_id = sa.item_id and m.estoque_origem_id = sa.estoque_id
                            and m.origem_tipo = 'zig' and m.data_movimentacao = v_dia)) x
   where rn <= 12;
  if n > 0 then
    t := t || chr(10) || '🚨 *Furos no Bar/Cozinha* (venderam sem ter no setor)' || chr(10) || s || chr(10)
           || '_Provável mercadoria que desceu sem transferência._' || chr(10);
  end if;

  -- ─── Notas lançadas ───
  select count(*), sum(e.valor_total),
         string_agg('• ' || trim(coalesce(fo.nome, 'Fornecedor')) || coalesce(' ' || nullif(e.numero_documento, ''), '')
                    || ' · ' || fn_fmt_brl(e.valor_total) || ' · ' || fn_quem_fez(e.observacoes, e.criado_por), chr(10) order by e.criado_em)
    into n, v, s
    from entradas_compras e left join fornecedores fo on fo.id = e.fornecedor_id
   where e.criado_em >= v_desde and e.criado_em < v_ate;
  t := t || chr(10) || '🧾 *Notas lançadas*' || case when n > 0 then ' (' || n || ' · ' || fn_fmt_brl(v) || ')' || chr(10) || s else chr(10) || 'Nenhuma.' end || chr(10);

  -- ─── Transferências ───
  select count(*) into n from movimentacoes_estoque where tipo_movimentacao = 'transferencia' and criado_em >= v_desde and criado_em < v_ate;
  t := t || chr(10) || '🔁 *Transferências*';
  if n = 0 then
    t := t || chr(10) || 'Nenhuma.' || chr(10);
  else
    t := t || ' (' || n || ' itens)' || chr(10);
    for d in
      select eo.nome de, ed.nome para,
             string_agg(distinct fn_quem_fez(m.motivo, m.criado_por), ', ') quem,
             string_agg(fn_fmt_qtd(m.q) || ' ' || m.nome, ', ' order by m.q desc) filter (where m.rn <= 12)
               || case when count(*) > 12 then ' e mais ' || (count(*) - 12) || ' itens' else '' end itens
        from (select m.estoque_origem_id, m.estoque_destino_id, trim(coalesce(i.nome, m.item_descricao)) nome,
                     sum(m.quantidade) q, max(m.motivo) motivo, max(m.criado_por::text)::uuid criado_por,
                     row_number() over (partition by m.estoque_origem_id, m.estoque_destino_id order by sum(m.quantidade) desc) rn
                from movimentacoes_estoque m left join itens_estoque i on i.id = m.item_id
               where m.tipo_movimentacao = 'transferencia' and m.criado_em >= v_desde and m.criado_em < v_ate
               group by 1, 2, 3) m
        join estoques eo on eo.id = m.estoque_origem_id
        join estoques ed on ed.id = m.estoque_destino_id
       group by eo.nome, ed.nome
    loop
      t := t || '• *' || replace(d.de, 'Estoque ', '') || ' → ' || replace(d.para, 'Estoque ', '') || '* (' || d.quem || '): ' || d.itens || chr(10);
    end loop;
  end if;

  -- ─── Empréstimos ───
  select count(*), string_agg('• ' || case ev.sentido when 'pegamos' then 'Pegamos de ' else 'Emprestamos para ' end || vz.nome || ': '
                              || fn_fmt_qtd(ev.quantidade) || ' ' || trim(i.nome) || coalesce(' (' || replace(es.nome, 'Estoque ', '') || ')', ''), chr(10))
    into n, s
    from emprestimos_vizinhos ev join vizinhos vz on vz.id = ev.vizinho_id join itens_estoque i on i.id = ev.item_id
    left join estoques es on es.id = ev.estoque_id
   where ev.criado_em >= v_desde and ev.criado_em < v_ate and ev.status <> 'cancelado';
  select sum((quantidade - devolvido) * coalesce(custo_unitario, 0)) filter (where sentido = 'pegamos'),
         sum((quantidade - devolvido) * coalesce(custo_unitario, 0)) filter (where sentido = 'emprestamos')
    into v, v2 from emprestimos_vizinhos where status = 'aberto';
  t := t || chr(10) || '🤝 *Empréstimos*' || chr(10) || case when n > 0 then s || chr(10) else '' end;
  select count(*), string_agg('• Devolução: ' || m.motivo || ' · ' || fn_fmt_qtd(m.quantidade) || ' ' || trim(coalesce(i.nome, m.item_descricao)), chr(10))
    into n, s
    from movimentacoes_estoque m left join itens_estoque i on i.id = m.item_id
   where m.origem_tipo = 'vizinho' and m.criado_em >= v_desde and m.criado_em < v_ate and m.motivo ilike '%devol%';
  if n > 0 then t := t || s || chr(10); end if;
  t := t || 'Em aberto: devemos ' || fn_fmt_brl(v) || ' · nos devem ' || fn_fmt_brl(v2) || chr(10);

  -- ─── Perdas ───
  select count(*), sum(coalesce(m.custo_total, 0)),
         string_agg('• ' || fn_fmt_qtd(m.quantidade) || ' ' || trim(coalesce(i.nome, m.item_descricao)) || ' (' || replace(m.motivo, 'Perda: ', '') || ', '
                    || replace(coalesce(es.nome, ''), 'Estoque ', '') || ') ' || fn_fmt_brl(m.custo_total) || ' · ' || fn_quem_fez(m.observacoes, m.criado_por), chr(10) order by m.custo_total desc)
    into n, v, s
    from movimentacoes_estoque m left join itens_estoque i on i.id = m.item_id left join estoques es on es.id = m.estoque_origem_id
   where m.origem_tipo = 'perda' and m.criado_em >= v_desde and m.criado_em < v_ate;
  t := t || chr(10) || '🗑️ *Perdas*' || case when n > 0 then ' (' || fn_fmt_brl(v) || ')' || chr(10) || s else chr(10) || 'Nenhuma registrada.' end || chr(10);

  -- ─── Contagens ───
  select count(*), sum(valor_total_diferencas) into n, v
    from contagens_estoque where status = 'processada' and coalesce(processado_em, criado_em) >= v_desde and coalesce(processado_em, criado_em) < v_ate;
  if n > 0 then
    t := t || chr(10) || '📋 *Contagens:* ' || n || ' processada(s) · diferença ' || fn_fmt_brl(v) || chr(10);
  end if;

  -- ─── Caderno de Bordo ───
  t := t || chr(10) || '📓 *Caderno de Bordo*' || chr(10);
  if not exists (select 1 from diario_bordo where data_diario = v_dia) then
    t := t || '⚠️ Nenhum caderno registrado. Cobrar o gerente do turno.' || chr(10);
  else
    for d in select * from diario_bordo where data_diario = v_dia order by turno loop
      t := t || '🌙 *Turno ' || coalesce(d.turno, '?') || '* · ' || coalesce(d.registrado_por_nome, 'gerente') || chr(10);
      select string_agg(case gravidade when 'critica' then '🔴 ' when 'alta' then '🟠 ' else '• ' end
                        || upper(replace(setor, '_', ' ')) || ': ' || titulo || case when status = 'pendente' then ' _(pendente)_' else '' end, chr(10))
        into s from ocorrencias_setor where diario_id = d.id;
      t := t || coalesce(s, 'Sem ocorrências estruturadas.') || chr(10);
      select string_agg('• ' || (x->>'nome') || ' · ' || (x->>'tipo') || case when (x->>'justificada')::boolean then ' (justificada)' else ' (SEM justificativa)' end, chr(10))
        into s from jsonb_array_elements(coalesce(d.insights_ia->'faltas_detectadas', '[]'::jsonb)) x;
      if s is not null then t := t || '👤 *Faltas/atrasos:*' || chr(10) || s || chr(10); end if;
      select string_agg('• ' || (x #>> '{}'), chr(10)) into s from jsonb_array_elements(coalesce(d.insights_ia->'insights', '[]'::jsonb)) x;
      if s is not null then t := t || '🔍 *Cruzamentos da IA:*' || chr(10) || s || chr(10); end if;
    end loop;
  end if;

  -- ─── Pendências ───
  select count(*), string_agg('• ' || p.id || ' · ' || p.resumo || ' (' || e.nome || ')', chr(10) order by p.id)
    into n, s from agente_pendencias p join agente_equipe e on e.id = p.solicitante_id where p.status = 'pendente';
  if n > 0 then t := t || chr(10) || '⏳ *Aguardando aprovação (' || n || ')*' || chr(10) || s || chr(10); end if;
  select count(*), string_agg('• [' || replace(setor, '_', ' ') || '] ' || titulo || ' · ' || dias_em_aberto || 'd', chr(10))
    into n, s from (select * from vw_pendencias_diario limit 8) x;
  if n > 0 then t := t || chr(10) || '📌 *Ocorrências em aberto*' || chr(10) || s || chr(10); end if;

  -- ─── Comprar ───
  select count(*), string_agg(r.nome, ', ' order by r.consumo_dia desc) filter (where r.rn <= 15)
    into n, s from (select z.*, row_number() over (order by z.consumo_dia desc nulls last) rn
                      from fn_reposicao_central(90, 2) z where z.situacao = 'zerado' and coalesce(z.consumo_dia, 0) > 0) r;
  if n > 0 then
    t := t || chr(10) || '🛒 *Zerados no Central que estão saindo (' || n || ')*' || chr(10) || s
           || case when n > 15 then ' e mais ' || (n - 15) else '' end || chr(10);
  end if;

  return t;
end $$;

create or replace function public.fn_relatorio_dia(p_data date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_dia date := coalesce(p_data, fn_hoje_cuiaba() - 1);
  v_desde timestamptz := (v_dia + time '07:00') at time zone 'America/Cuiaba';
begin
  if v_dia > fn_hoje_cuiaba() then
    raise exception 'Data no futuro: %', to_char(v_dia, 'DD/MM/YYYY');
  end if;
  return jsonb_build_object(
    'data', v_dia,
    'texto', fn_relatorio_diario_texto(v_dia, v_desde, least(now(), v_desde + interval '24 hours')));
end $$;

-- Para a tela: só admin e master.
create or replace function public.fn_relatorio_dia_tela(p_data date default null)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not fn_agente_ponte_eh_gestor() then
    raise exception 'Só admin ou master vê o relatório do dia.';
  end if;
  return fn_relatorio_dia(p_data);
end $$;

revoke execute on function public.fn_relatorio_diario_texto(date, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.fn_relatorio_diario_texto(date, timestamptz, timestamptz) to service_role;
revoke execute on function public.fn_relatorio_dia(date) from public, anon, authenticated;
grant execute on function public.fn_relatorio_dia(date) to service_role;
revoke execute on function public.fn_relatorio_dia_tela(date) from public, anon;
grant execute on function public.fn_relatorio_dia_tela(date) to authenticated;
