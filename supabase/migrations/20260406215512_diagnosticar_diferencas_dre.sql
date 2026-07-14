/*
  # Diagnosticar Diferenças no DRE

  Cria função para identificar discrepâncias entre valores agregados
  na view vw_dre_consolidado e soma real dos lançamentos.

  Problema identificado:
  - View agrupa por centro_custo_id
  - Lançamentos individuais podem não bater com agregação
  - Múltiplos centros de custo causam confusão

  Solução:
  - Função de diagnóstico que compara view vs lançamentos reais
  - Identifica exatamente onde estão as diferenças
  - Sugere correções
*/

CREATE OR REPLACE FUNCTION diagnosticar_diferencas_dre(
  p_ano integer,
  p_mes integer DEFAULT NULL
)
RETURNS TABLE(
  categoria_raiz_nome text,
  categoria_nome text,
  nivel integer,
  centro_custo_id uuid,
  valor_view numeric,
  qtd_view integer,
  valor_real numeric,
  qtd_real integer,
  diferenca numeric,
  diagnostico text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH view_agregada AS (
    SELECT
      v.categoria_raiz_nome,
      v.categoria_nome,
      v.categoria_id,
      v.nivel,
      v.centro_custo_id,
      v.valor_total,
      v.quantidade_lancamentos,
      v.tipo
    FROM vw_dre_consolidado v
    WHERE v.ano = p_ano
      AND (p_mes IS NULL OR v.mes = p_mes)
  ),
  lancamentos_reais AS (
    SELECT
      v.categoria_raiz_nome,
      v.categoria_nome,
      v.categoria_id,
      v.nivel,
      COALESCE(fc.centro_custo_id, v.centro_custo_id) as centro_custo_real,
      SUM(
        CASE
          WHEN v.tipo = 'receita' THEN fc.valor
          ELSE -ABS(fc.valor)
        END
      ) as valor_total_real,
      COUNT(fc.id) as qtd_real,
      v.tipo
    FROM view_agregada v
    LEFT JOIN fluxo_caixa fc ON (
      -- Para "Outros", buscar lançamentos diretos na raiz
      (v.categoria_nome = 'Outros' AND fc.categoria_id IN (
        SELECT id FROM categorias_financeiras
        WHERE nome = v.categoria_raiz_nome
          AND categoria_pai_id IS NULL
      ))
      OR
      -- Para categorias normais, buscar por categoria_id
      (v.categoria_nome != 'Outros' AND v.categoria_nome != 'Lançamentos Não Classificados' AND fc.categoria_id = v.categoria_id)
      OR
      -- Para não classificados
      (v.categoria_nome = 'Lançamentos Não Classificados' AND fc.categoria_id IS NULL AND (
        (v.tipo = 'receita' AND fc.tipo = 'entrada') OR
        (v.tipo = 'despesa' AND fc.tipo = 'saida')
      ))
    )
    AND fc.origem != 'transferencia'
    AND EXTRACT(year FROM fc.data) = p_ano
    AND (p_mes IS NULL OR EXTRACT(month FROM fc.data) = p_mes)
    GROUP BY
      v.categoria_raiz_nome,
      v.categoria_nome,
      v.categoria_id,
      v.nivel,
      COALESCE(fc.centro_custo_id, v.centro_custo_id),
      v.tipo
  )
  SELECT
    COALESCE(v.categoria_raiz_nome, lr.categoria_raiz_nome)::text,
    COALESCE(v.categoria_nome, lr.categoria_nome)::text,
    COALESCE(v.nivel, lr.nivel)::integer,
    COALESCE(v.centro_custo_id, lr.centro_custo_real)::uuid,
    COALESCE(v.valor_total, 0)::numeric as valor_view,
    COALESCE(v.quantidade_lancamentos, 0)::integer as qtd_view,
    COALESCE(lr.valor_total_real, 0)::numeric as valor_real,
    COALESCE(lr.qtd_real, 0)::integer as qtd_real,
    ABS(COALESCE(v.valor_total, 0) - COALESCE(lr.valor_total_real, 0))::numeric as diferenca,
    CASE
      WHEN v.valor_total IS NULL THEN 'Lançamentos encontrados mas não na view'
      WHEN lr.valor_total_real IS NULL THEN 'Valor na view mas lançamentos não encontrados'
      WHEN ABS(COALESCE(v.valor_total, 0) - COALESCE(lr.valor_total_real, 0)) > 1 THEN
        'Diferença entre view e lançamentos reais'
      ELSE 'OK'
    END::text as diagnostico
  FROM view_agregada v
  FULL OUTER JOIN lancamentos_reais lr ON (
    v.categoria_id = lr.categoria_id
    AND COALESCE(v.centro_custo_id::text, 'NULL') = COALESCE(lr.centro_custo_real::text, 'NULL')
  )
  WHERE ABS(COALESCE(v.valor_total, 0) - COALESCE(lr.valor_total_real, 0)) > 1
    OR v.valor_total IS NULL
    OR lr.valor_total_real IS NULL
  ORDER BY diferenca DESC;
END;
$$;

COMMENT ON FUNCTION diagnosticar_diferencas_dre IS 'Compara valores da view vw_dre_consolidado com soma real dos lançamentos para identificar discrepâncias';

-- Função simplificada para ver resumo rápido
CREATE OR REPLACE FUNCTION resumo_diferencas_dre(
  p_ano integer,
  p_mes integer DEFAULT NULL
)
RETURNS TABLE(
  total_diferencas bigint,
  soma_diferencas numeric,
  categorias_com_problema bigint
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::bigint as total_diferencas,
    SUM(diferenca)::numeric as soma_diferencas,
    COUNT(DISTINCT categoria_raiz_nome)::bigint as categorias_com_problema
  FROM diagnosticar_diferencas_dre(p_ano, p_mes);
END;
$$;

COMMENT ON FUNCTION resumo_diferencas_dre IS 'Resumo rápido das diferenças encontradas no DRE';
