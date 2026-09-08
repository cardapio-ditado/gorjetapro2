-- ═══════════════════════════════════════════════════════════════════════════
-- DASHBOARD: alertas de estoque passam a olhar o Central
--
-- fn_dashboard_dono.estoque.abaixo_minimo somava os quatro estoques contra o
-- mínimo do produto; get_itens_atencao_dashboard marcava "crítico" em qualquer
-- local abaixo do mínimo. Agora: negativos em qualquer local continuam
-- aparecendo, e "para comprar" é decidido por fn_reposicao_central.
-- ═══════════════════════════════════════════════════════════════════════════

create or replace function public.get_itens_atencao_dashboard()
returns table(item_id uuid, nome text, categoria text, unidade_medida text, estoque_nome text,
              saldo_real numeric, estoque_minimo numeric, custo_medio numeric, ultima_mov date, status_alerta text)
language sql
stable
security definer
set search_path = public
as $$
  with negativos as (
    select ie.id as item_id, ie.nome, ie.categoria, ie.unidade_medida, e.nome as estoque_nome,
           round(s.quantidade_atual, 3) as saldo_real, coalesce(ie.estoque_minimo, 0) as estoque_minimo,
           ie.custo_medio, s.data_ultima_movimentacao::date as ultima_mov, 'negativo'::text as status_alerta,
           0 as ordem
      from saldos_estoque s
      join itens_estoque ie on ie.id = s.item_id and ie.status = 'ativo'
      join estoques e on e.id = s.estoque_id
     where s.quantidade_atual < 0
  ),
  central as (
    select r.item_id, r.nome, r.categoria, r.unidade_medida, 'Estoque Central'::text as estoque_nome,
           round(r.saldo_central, 3) as saldo_real, r.ponto_pedido as estoque_minimo,
           r.custo_medio,
           (select max(m.data_movimentacao) from movimentacoes_estoque m where m.item_id = r.item_id) as ultima_mov,
           case when r.situacao = 'zerado' then 'zerado' else 'critico' end as status_alerta,
           case when r.situacao = 'zerado' then 1 else 2 end as ordem
      from fn_reposicao_central() r
     where r.situacao in ('zerado', 'comprar') and r.custo_medio > 0
  )
  select item_id, nome, categoria, unidade_medida, estoque_nome, saldo_real, estoque_minimo, custo_medio, ultima_mov, status_alerta
    from (select * from negativos union all select * from central) x
   order by ordem, saldo_real asc
   limit 12;
$$;

grant execute on function public.get_itens_atencao_dashboard() to authenticated, service_role;

CREATE OR REPLACE FUNCTION public.fn_dashboard_dono(p_data date DEFAULT CURRENT_DATE)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inicio_mes date := date_trunc('month', p_data)::date;
  v_ultimo_dia_venda date;
  v_cmv jsonb;
  v_result jsonb;
BEGIN
  SELECT max(data) INTO v_ultimo_dia_venda FROM faturamento_zig_diario;
  v_cmv := calcular_cmv(v_inicio_mes, p_data, NULL);

  SELECT jsonb_build_object(
    'gerado_em', now(),
    'data', p_data,

    'caixa', jsonb_build_object(
      'hoje', (SELECT jsonb_build_object(
          'entradas', COALESCE(sum(valor) FILTER (WHERE tipo = 'entrada'), 0),
          'saidas',   COALESCE(sum(valor) FILTER (WHERE tipo = 'saida'), 0))
        FROM fluxo_caixa
        WHERE data = p_data AND COALESCE(origem, '') <> 'transferencia'),
      'mes', (SELECT jsonb_build_object(
          'entradas', COALESCE(sum(valor) FILTER (WHERE tipo = 'entrada'), 0),
          'saidas',   COALESCE(sum(valor) FILTER (WHERE tipo = 'saida'), 0))
        FROM fluxo_caixa
        WHERE data BETWEEN v_inicio_mes AND p_data AND COALESCE(origem, '') <> 'transferencia'),
      'serie_14d', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'data', to_char(d.dia, 'YYYY-MM-DD'),
            'entradas', COALESCE(f.entradas, 0),
            'saidas', COALESCE(f.saidas, 0)) ORDER BY d.dia), '[]'::jsonb)
        FROM generate_series(p_data - 13, p_data, '1 day'::interval) AS d(dia)
        LEFT JOIN (
          SELECT data,
                 sum(valor) FILTER (WHERE tipo = 'entrada') AS entradas,
                 sum(valor) FILTER (WHERE tipo = 'saida') AS saidas
          FROM fluxo_caixa
          WHERE data BETWEEN p_data - 13 AND p_data AND COALESCE(origem, '') <> 'transferencia'
          GROUP BY data
        ) f ON f.data = d.dia::date)
    ),

    -- VENDAS: faturamento real da ZIG (todos os clientes), último dia sincronizado
    'vendas', CASE WHEN v_ultimo_dia_venda IS NULL THEN NULL ELSE (
      SELECT jsonb_build_object(
        'data', fzd.data,
        'total', fzd.total,
        'bebidas', fzd.bebidas,
        'alimentos', fzd.alimentos,
        'outros', fzd.outros + fzd.couvert + fzd.taxa_servico,
        'transacoes', fzd.num_transacoes,
        'anterior', (
          SELECT jsonb_build_object('data', data, 'total', total)
          FROM faturamento_zig_diario WHERE data = fzd.data - 7),
        'mes', (SELECT COALESCE(sum(total), 0) FROM faturamento_zig_diario
                WHERE data BETWEEN v_inicio_mes AND p_data),
        'serie_14d', (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
              'data', to_char(g.dia, 'YYYY-MM-DD'), 'total', COALESCE(fd.total, 0)) ORDER BY g.dia), '[]'::jsonb)
          FROM generate_series(fzd.data - 13, fzd.data, '1 day'::interval) AS g(dia)
          LEFT JOIN faturamento_zig_diario fd ON fd.data = g.dia::date)
      )
      FROM faturamento_zig_diario fzd WHERE fzd.data = v_ultimo_dia_venda) END,

    'cmv', v_cmv,

    'contas', jsonb_build_object(
      'vencidas', (SELECT jsonb_build_object('qtd', count(*), 'valor', COALESCE(sum(saldo_restante), 0))
        FROM contas_pagar
        WHERE status NOT IN ('pago', 'cancelado') AND saldo_restante > 0 AND data_vencimento < p_data),
      'semana', (SELECT jsonb_build_object('qtd', count(*), 'valor', COALESCE(sum(saldo_restante), 0))
        FROM contas_pagar
        WHERE status NOT IN ('pago', 'cancelado') AND saldo_restante > 0
          AND data_vencimento BETWEEN p_data AND p_data + 7),
      'lista_vencidas', (SELECT COALESCE(jsonb_agg(x.j ORDER BY x.valor DESC), '[]'::jsonb) FROM (
          SELECT jsonb_build_object('id', cp.id, 'descricao', cp.descricao,
                 'categoria', cf.nome, 'valor', cp.saldo_restante, 'vencimento', cp.data_vencimento) AS j,
                 cp.saldo_restante AS valor
          FROM contas_pagar cp LEFT JOIN categorias_financeiras cf ON cf.id = cp.categoria_id
          WHERE cp.status NOT IN ('pago','cancelado') AND cp.saldo_restante > 0 AND cp.data_vencimento < p_data
          ORDER BY cp.saldo_restante DESC LIMIT 30) x),
      'lista_semana', (SELECT COALESCE(jsonb_agg(x.j ORDER BY x.venc), '[]'::jsonb) FROM (
          SELECT jsonb_build_object('id', cp.id, 'descricao', cp.descricao,
                 'categoria', cf.nome, 'valor', cp.saldo_restante, 'vencimento', cp.data_vencimento) AS j,
                 cp.data_vencimento AS venc
          FROM contas_pagar cp LEFT JOIN categorias_financeiras cf ON cf.id = cp.categoria_id
          WHERE cp.status NOT IN ('pago','cancelado') AND cp.saldo_restante > 0
            AND cp.data_vencimento BETWEEN p_data AND p_data + 7
          ORDER BY cp.data_vencimento LIMIT 30) x)
    ),

    'equipe', jsonb_build_object(
      'colaboradores', (SELECT jsonb_build_object(
          'ativos', count(*) FILTER (WHERE status = 'ativo'),
          'ferias', count(*) FILTER (WHERE status = 'ferias'),
          'afastados', count(*) FILTER (WHERE status = 'afastado'))
        FROM colaboradores),
      'caches', (SELECT jsonb_build_object('qtd', count(*), 'valor', COALESCE(sum(saldo_restante), 0),
          'lista', COALESCE(jsonb_agg(jsonb_build_object('nome', nome, 'data', data_evento::date,
              'total', valor_total_final, 'pago', valor_pago, 'saldo', saldo_restante) ORDER BY data_evento), '[]'::jsonb))
        FROM musicos
        WHERE COALESCE(status_pagamento, 'pendente') NOT IN ('pago', 'cancelado') AND saldo_restante > 0),
      'extras', (SELECT jsonb_build_object('qtd', count(*), 'valor', COALESCE(sum(valor_diaria), 0),
          'lista', COALESCE(jsonb_agg(jsonb_build_object('nome', nome, 'funcao', funcao_temporaria,
              'setor', setor, 'data', data_trabalho, 'valor', valor_diaria) ORDER BY data_trabalho), '[]'::jsonb))
        FROM extras_freelancers
        WHERE COALESCE(status_pagamento, 'pendente') NOT IN ('pago', 'cancelado') AND valor_diaria > 0),
      'rh_contas', (SELECT jsonb_build_object('qtd', count(*), 'valor', COALESCE(sum(cp.saldo_restante), 0),
          'lista', COALESCE(jsonb_agg(jsonb_build_object('descricao', cp.descricao, 'categoria', cf.nome,
              'valor', cp.saldo_restante, 'vencimento', cp.data_vencimento) ORDER BY cp.data_vencimento), '[]'::jsonb))
        FROM contas_pagar cp JOIN categorias_financeiras cf ON cf.id = cp.categoria_id
        WHERE trim(cf.nome) IN ('Salários Fixos', 'Extras e Freelancers', 'Gorjetas de Garçom',
              'Encargos Trabalhistas', 'Férias', 'Rescisões', 'Adiantamentos e Vales')
          AND cp.status NOT IN ('pago', 'cancelado') AND cp.saldo_restante > 0)
    ),

    'estoque', jsonb_build_object(
      'valor_total', COALESCE(fn_valor_estoque_atual(NULL), 0),
      'negativos', (SELECT count(*) FROM saldos_estoque WHERE quantidade_atual < 0),
      -- Decidido pelo Estoque Central: itens zerados ou no ponto de pedido.
      'abaixo_minimo', (SELECT count(*) FROM fn_reposicao_central() r WHERE r.situacao IN ('zerado', 'comprar'))
    ),

    'diario', jsonb_build_object(
      'pendencias', (SELECT count(*) FROM vw_pendencias_diario),
      'criticas', (SELECT count(*) FROM vw_pendencias_diario WHERE gravidade IN ('alta', 'critica')),
      'lista', (SELECT COALESCE(jsonb_agg(x.j ORDER BY x.dias DESC), '[]'::jsonb) FROM (
          SELECT jsonb_build_object('titulo', titulo, 'setor', setor, 'gravidade', gravidade,
                 'dias', dias_em_aberto, 'data', data_ocorrencia) AS j, dias_em_aberto AS dias
          FROM vw_pendencias_diario
          ORDER BY dias_em_aberto DESC LIMIT 8) x)
    ),

    'eventos', (SELECT COALESCE(jsonb_agg(x.j ORDER BY x.d), '[]'::jsonb) FROM (
        SELECT jsonb_build_object('nome', nome_evento, 'data', data_evento,
               'pessoas', quantidade_pessoas, 'valor', valor_total, 'pagamento', status_pagamento) AS j,
               data_evento AS d
        FROM eventos_fechados
        WHERE data_evento BETWEEN p_data AND p_data + 14
        ORDER BY data_evento LIMIT 10) x)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
