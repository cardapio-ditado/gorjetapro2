-- Portal do Gestor: resumo do Livro da Noite.

create or replace function public.fn_portal_gestor()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := fn_usuario_sistema_id();
  v_hoje date := (now() at time zone 'America/Cuiaba')::date;
  v_venda date;
begin
  if v_uid is null or v_uid::text not in (
    select jsonb_array_elements_text(coalesce((select valor from configuracoes_sistema where chave = 'portal_gestores'), '[]')::jsonb)) then
    return jsonb_build_object('gestor', false);
  end if;

  select max(data) into v_venda from faturamento_zig_diario where data < v_hoje + 1;

  return jsonb_build_object(
    'gestor', true,
    'hoje', v_hoje,

    'estoque', fn_beta2_hoje(),
    'livro', fn_livro_resumo(),

    'extras', (
      with abertas as (
        select coalesce(f.pessoa_id::text, lower(trim(f.nome))) as chave, coalesce(p.nome, f.nome) as nome,
               f.data_trabalho, f.saldo_restante
          from extras_freelancers f left join extras_pessoas p on p.id = f.pessoa_id
         where f.status_pagamento <> 'cancelado' and f.saldo_restante > 0.004),
      por_pessoa as (
        select chave, min(nome) as nome, count(*) as diarias, sum(saldo_restante) as falta, min(data_trabalho) as desde
          from abertas group by chave)
      select jsonb_build_object(
        'valor', coalesce((select sum(saldo_restante) from abertas), 0),
        'diarias', (select count(*) from abertas),
        'pessoas', (select count(*) from por_pessoa),
        'mais_antiga', (select min(data_trabalho) from abertas),
        'lista', coalesce((select jsonb_agg(jsonb_build_object('nome', nome, 'diarias', diarias, 'falta', falta, 'desde', desde) order by falta desc)
                             from (select * from por_pessoa order by falta desc limit 5) x), '[]'::jsonb))),

    'musicos', (
      with abertos as (
        select lower(trim(nome)) as chave, nome, data_evento::date as data, saldo_restante
          from musicos
         where coalesce(status_pagamento, 'pendente') <> 'cancelado' and saldo_restante > 0.004),
      por_artista as (
        select chave, min(nome) as nome, count(*) as shows, sum(saldo_restante) as falta, min(data) as desde
          from abertos group by chave)
      select jsonb_build_object(
        'valor', coalesce((select sum(saldo_restante) from abertos), 0),
        'shows', (select count(*) from abertos),
        'artistas', (select count(*) from por_artista),
        'mais_antigo', (select min(data) from abertos),
        'lista', coalesce((select jsonb_agg(jsonb_build_object('nome', nome, 'shows', shows, 'falta', falta, 'desde', desde) order by falta desc)
                             from (select * from por_artista order by falta desc limit 5) x), '[]'::jsonb))),

    'tarefas', (
      select jsonb_build_object(
        'abertas', count(*),
        'atrasadas', count(*) filter (where data_limite < v_hoje),
        'aprovacao', count(*) filter (where requer_aprovacao and coalesce(status_aprovacao, 'pendente') = 'pendente'),
        'lista', coalesce(jsonb_agg(jsonb_build_object(
            'id', id, 'numero', numero_tarefa, 'titulo', titulo, 'setor', setor, 'responsavel', responsavel,
            'prioridade', prioridade, 'fase', fase, 'data_limite', data_limite,
            'aprovacao', requer_aprovacao and coalesce(status_aprovacao, 'pendente') = 'pendente')
          order by (data_limite < v_hoje) desc nulls last, (requer_aprovacao and coalesce(status_aprovacao, 'pendente') = 'pendente') desc,
                   data_limite nulls last, criado_em), '[]'::jsonb))
        from tarefas_setoriais
       where not coalesce(arquivada, false) and coalesce(fase, '') <> 'concluido'),

    'vendas', case when v_venda is null then null else (
      select jsonb_build_object(
        'data', z.data, 'total', z.total, 'bebidas', z.bebidas, 'alimentos', z.alimentos,
        'outros', coalesce(z.outros, 0) + coalesce(z.couvert, 0) + coalesce(z.taxa_servico, 0), 'transacoes', z.num_transacoes,
        'semana_passada', (select total from faturamento_zig_diario where data = z.data - 7),
        'mes', (select coalesce(sum(total), 0) from faturamento_zig_diario where data between date_trunc('month', z.data)::date and z.data))
        from faturamento_zig_diario z where z.data = v_venda) end,

    'contas', jsonb_build_object(
      'vencidas', (select jsonb_build_object('qtd', count(*), 'valor', coalesce(sum(saldo_restante), 0))
                     from contas_pagar where status not in ('pago', 'cancelado') and saldo_restante > 0 and data_vencimento < v_hoje),
      'semana', (select jsonb_build_object('qtd', count(*), 'valor', coalesce(sum(saldo_restante), 0))
                   from contas_pagar where status not in ('pago', 'cancelado') and saldo_restante > 0 and data_vencimento between v_hoje and v_hoje + 7),
      'lista_vencidas', coalesce((select jsonb_agg(j order by v desc) from (
          select jsonb_build_object('descricao', cp.descricao, 'categoria', cf.nome, 'valor', cp.saldo_restante, 'vencimento', cp.data_vencimento) j, cp.saldo_restante v
            from contas_pagar cp left join categorias_financeiras cf on cf.id = cp.categoria_id
           where cp.status not in ('pago', 'cancelado') and cp.saldo_restante > 0 and cp.data_vencimento < v_hoje
           order by cp.saldo_restante desc limit 5) x), '[]'::jsonb),
      'lista_semana', coalesce((select jsonb_agg(j order by d) from (
          select jsonb_build_object('descricao', cp.descricao, 'categoria', cf.nome, 'valor', cp.saldo_restante, 'vencimento', cp.data_vencimento) j, cp.data_vencimento d
            from contas_pagar cp left join categorias_financeiras cf on cf.id = cp.categoria_id
           where cp.status not in ('pago', 'cancelado') and cp.saldo_restante > 0 and cp.data_vencimento between v_hoje and v_hoje + 7
           order by cp.data_vencimento, cp.saldo_restante desc limit 5) x), '[]'::jsonb)),

    'semana', jsonb_build_object(
      'eventos', coalesce((select jsonb_agg(jsonb_build_object('nome', nome_evento, 'data', data_evento, 'hora', horario_inicio,
                             'pessoas', quantidade_pessoas, 'pagamento', status_pagamento) order by data_evento, horario_inicio)
                             from eventos_fechados where data_evento between v_hoje and v_hoje + 7), '[]'::jsonb),
      'shows', coalesce((select jsonb_agg(jsonb_build_object('nome', nome, 'data', data_evento::date, 'hora', horario_inicio) order by data_evento, horario_inicio)
                           from musicos where data_evento::date between v_hoje and v_hoje + 7 and coalesce(status_pagamento, '') <> 'cancelado'), '[]'::jsonb),
      'extras', coalesce((select jsonb_agg(jsonb_build_object('data', data_trabalho, 'qtd', n, 'valor', v) order by data_trabalho)
                            from (select data_trabalho, count(*) n, sum(valor_diaria) v from extras_freelancers
                                   where data_trabalho between v_hoje and v_hoje + 7 and status_pagamento <> 'cancelado'
                                   group by data_trabalho) x), '[]'::jsonb))
  );
end $function$;

revoke execute on function public.fn_portal_gestor() from public, anon;
grant execute on function public.fn_portal_gestor() to authenticated;
