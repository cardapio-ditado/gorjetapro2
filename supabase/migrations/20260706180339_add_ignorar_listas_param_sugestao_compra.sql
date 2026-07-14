CREATE OR REPLACE FUNCTION public.fn_sugestao_compra(
  p_ciclo_padrao integer DEFAULT 1,
  p_dias_seguranca integer DEFAULT 1,
  p_dias_historico integer DEFAULT 28,
  p_ignorar_listas boolean DEFAULT false
)
RETURNS TABLE(item_id uuid, nome text, categoria text, unidade_medida text, fornecedor_nome text, ciclo_dias integer, consumo_medio_diario numeric, demanda_prevista numeric, saldo_atual numeric, em_lista_aberta numeric, quantidade_sugerida numeric, custo_medio numeric, custo_estimado numeric, criterio text)
LANGUAGE sql
STABLE
AS $function$
  WITH datas AS (
    SELECT d::date AS dia
    FROM generate_series(CURRENT_DATE - p_dias_historico, CURRENT_DATE - 1, interval '1 day') d
  ),
  consumo_dia AS (
    SELECT m.item_id AS cd_item, m.data_movimentacao AS dia, SUM(m.quantidade) AS qtd
    FROM movimentacoes_estoque m
    WHERE m.tipo_movimentacao = 'saida'
      AND m.origem_tipo NOT IN ('contagem','zeragem','normalizacao','legado')
      AND m.data_movimentacao >= CURRENT_DATE - p_dias_historico
      AND m.data_movimentacao < CURRENT_DATE
    GROUP BY 1, 2
  ),
  itens_com_consumo AS (
    SELECT DISTINCT cd_item FROM consumo_dia
  ),
  media_por_dow AS (
    SELECT ic.cd_item AS md_item,
           EXTRACT(dow FROM d.dia)::int AS dow,
           AVG(COALESCE(cd.qtd, 0)) AS media
    FROM itens_com_consumo ic
    CROSS JOIN datas d
    LEFT JOIN consumo_dia cd ON cd.cd_item = ic.cd_item AND cd.dia = d.dia
    GROUP BY 1, 2
  ),
  base AS (
    SELECT i.id AS b_item, i.nome AS b_nome, i.categoria AS b_cat,
           i.unidade_medida AS b_um, i.estoque_minimo AS b_min,
           f.nome AS b_forn,
           (COALESCE(f.ciclo_compra_dias, p_ciclo_padrao) + p_dias_seguranca) AS b_k
    FROM itens_estoque i
    LEFT JOIN fornecedores f ON f.id = i.fornecedor_padrao_id
  ),
  demanda AS (
    SELECT b.b_item AS d_item,
           SUM(COALESCE(md.media, 0)) AS prevista
    FROM base b
    CROSS JOIN LATERAL generate_series(0, b.b_k - 1) g
    LEFT JOIN media_por_dow md
      ON md.md_item = b.b_item
     AND md.dow = EXTRACT(dow FROM CURRENT_DATE + g)::int
    GROUP BY 1
  ),
  consumo_medio AS (
    SELECT cd_item AS cm_item, SUM(qtd) / p_dias_historico::numeric AS diario
    FROM consumo_dia GROUP BY 1
  ),
  saldo AS (
    SELECT s.item_id AS s_item, SUM(s.quantidade_atual) AS saldo_total,
           MAX(COALESCE(s.custo_medio,0)) AS custo_medio
    FROM saldos_estoque s GROUP BY 1
  ),
  em_lista AS (
    SELECT li.item_id AS el_item,
           SUM(GREATEST(li.quantidade_comprar, li.quantidade_sugerida)) AS qtd_em_lista
    FROM listas_compra_itens li
    JOIN listas_compra l ON l.id = li.lista_id
    WHERE l.status IN ('aberta','em_andamento') AND li.comprado = false
    GROUP BY 1
  )
  SELECT
    b.b_item,
    b.b_nome,
    b.b_cat,
    b.b_um,
    b.b_forn,
    b.b_k - p_dias_seguranca,
    ROUND(COALESCE(cm.diario, 0), 3),
    ROUND(COALESCE(d.prevista, 0), 3),
    ROUND(COALESCE(s.saldo_total, 0), 3),
    ROUND(COALESCE(el.qtd_em_lista, 0), 3),
    CASE
      WHEN COALESCE(d.prevista, 0) > 0 THEN
        GREATEST(0, ROUND(
          d.prevista
          - COALESCE(s.saldo_total, 0)
          - CASE WHEN p_ignorar_listas THEN 0 ELSE COALESCE(el.qtd_em_lista, 0) END,
          2))
      WHEN COALESCE(b.b_min, 0) > 0 AND COALESCE(s.saldo_total, 0) < b.b_min THEN
        GREATEST(0, ROUND(
          b.b_min * 1.2
          - COALESCE(s.saldo_total, 0)
          - CASE WHEN p_ignorar_listas THEN 0 ELSE COALESCE(el.qtd_em_lista, 0) END,
          2))
      ELSE 0
    END,
    ROUND(COALESCE(s.custo_medio, 0), 4),
    ROUND(GREATEST(0,
      CASE
        WHEN COALESCE(d.prevista, 0) > 0 THEN
          d.prevista
          - COALESCE(s.saldo_total, 0)
          - CASE WHEN p_ignorar_listas THEN 0 ELSE COALESCE(el.qtd_em_lista, 0) END
        WHEN COALESCE(b.b_min, 0) > 0 AND COALESCE(s.saldo_total, 0) < b.b_min THEN
          b.b_min * 1.2
          - COALESCE(s.saldo_total, 0)
          - CASE WHEN p_ignorar_listas THEN 0 ELSE COALESCE(el.qtd_em_lista, 0) END
        ELSE 0
      END) * COALESCE(s.custo_medio, 0), 2),
    CASE
      WHEN COALESCE(d.prevista, 0) > 0 THEN 'previsao_dia_semana'
      WHEN COALESCE(b.b_min, 0) > 0 THEN 'fallback_minimo'
      ELSE 'sem_dados'
    END
  FROM base b
  LEFT JOIN demanda d        ON d.d_item = b.b_item
  LEFT JOIN consumo_medio cm ON cm.cm_item = b.b_item
  LEFT JOIN saldo s          ON s.s_item = b.b_item
  LEFT JOIN em_lista el      ON el.el_item = b.b_item
  ORDER BY 11 DESC NULLS LAST;
$function$;
