/*
  # Corrigir Ambiguidade na Função de Diagnóstico

  Remove conflito de nomes entre parâmetros RETURNS TABLE e colunas da query.
*/

DROP FUNCTION IF EXISTS diagnosticar_diferencas_dre(integer, integer);
DROP FUNCTION IF EXISTS resumo_diferencas_dre(integer, integer);

-- Função de diagnóstico com aliases corrigidos
CREATE OR REPLACE FUNCTION diagnosticar_diferencas_dre(
  p_ano integer,
  p_mes integer DEFAULT NULL
)
RETURNS TABLE(
  cat_raiz_nome text,
  cat_nome text,
  cat_id uuid,
  valor_view numeric,
  qtd_view integer,
  valor_real numeric,
  qtd_real integer,
  diferenca numeric,
  status text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH comparacao AS (
    SELECT
      v.categoria_raiz_nome,
      v.categoria_nome,
      v.categoria_id,
      v.valor_total as val_view,
      v.quantidade_lancamentos as q_view,
      v.tipo,
      v.categoria_raiz_id,
      
      -- Calcular valores reais dos lançamentos
      COALESCE((
        SELECT SUM(
          CASE
            WHEN v.tipo = 'receita' THEN fc.valor
            ELSE -ABS(fc.valor)
          END
        )
        FROM fluxo_caixa fc
        WHERE (
          -- Categorias normais
          (v.categoria_nome != 'Outros' AND v.categoria_nome != 'Lançamentos Não Classificados' 
           AND fc.categoria_id = v.categoria_id)
          OR
          -- "Outros" = lançamentos diretos na raiz
          (v.categoria_nome = 'Outros' AND fc.categoria_id = v.categoria_raiz_id)
          OR
          -- Não classificados
          (v.categoria_nome = 'Lançamentos Não Classificados' AND fc.categoria_id IS NULL
           AND ((v.tipo = 'receita' AND fc.tipo = 'entrada') OR (v.tipo = 'despesa' AND fc.tipo = 'saida')))
        )
        AND fc.origem != 'transferencia'
        AND EXTRACT(year FROM fc.data) = p_ano
        AND (p_mes IS NULL OR EXTRACT(month FROM fc.data) = p_mes)
      ), 0) as val_real,
      
      COALESCE((
        SELECT COUNT(*)
        FROM fluxo_caixa fc
        WHERE (
          (v.categoria_nome != 'Outros' AND v.categoria_nome != 'Lançamentos Não Classificados' 
           AND fc.categoria_id = v.categoria_id)
          OR
          (v.categoria_nome = 'Outros' AND fc.categoria_id = v.categoria_raiz_id)
          OR
          (v.categoria_nome = 'Lançamentos Não Classificados' AND fc.categoria_id IS NULL
           AND ((v.tipo = 'receita' AND fc.tipo = 'entrada') OR (v.tipo = 'despesa' AND fc.tipo = 'saida')))
        )
        AND fc.origem != 'transferencia'
        AND EXTRACT(year FROM fc.data) = p_ano
        AND (p_mes IS NULL OR EXTRACT(month FROM fc.data) = p_mes)
      ), 0) as q_real
      
    FROM vw_dre_consolidado v
    WHERE v.ano = p_ano
      AND (p_mes IS NULL OR v.mes = p_mes)
  )
  SELECT
    c.categoria_raiz_nome::text,
    c.categoria_nome::text,
    c.categoria_id,
    c.val_view::numeric,
    c.q_view::integer,
    c.val_real::numeric,
    c.q_real::integer,
    ABS(c.val_view - c.val_real)::numeric,
    CASE
      WHEN ABS(c.val_view - c.val_real) < 0.01 THEN 'OK'
      WHEN c.val_real = 0 THEN 'Valor na view mas sem lançamentos'
      WHEN c.val_view = 0 THEN 'Lançamentos encontrados mas não na view'
      ELSE 'Diferença detectada'
    END::text
  FROM comparacao c
  WHERE ABS(c.val_view - c.val_real) > 0.01
  ORDER BY ABS(c.val_view - c.val_real) DESC;
END;
$$;

-- Função de resumo
CREATE OR REPLACE FUNCTION resumo_diferencas_dre(
  p_ano integer,
  p_mes integer DEFAULT NULL
)
RETURNS TABLE(
  total_diferencas bigint,
  soma_diferencas numeric,
  maior_diferenca numeric,
  categorias_problema bigint
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::bigint,
    COALESCE(SUM(d.diferenca), 0)::numeric,
    COALESCE(MAX(d.diferenca), 0)::numeric,
    COUNT(DISTINCT d.cat_raiz_nome)::bigint
  FROM diagnosticar_diferencas_dre(p_ano, p_mes) d
  WHERE d.diferenca > 0.01;
END;
$$;

COMMENT ON FUNCTION diagnosticar_diferencas_dre IS 'Compara valores da view consolidada com lançamentos reais';
COMMENT ON FUNCTION resumo_diferencas_dre IS 'Resumo das diferenças encontradas no DRE';
