/*
  # Fix Ambiguous Column References in Database Functions

  1. Problem
    - The functions `obter_dre_periodo` and `obter_projecao_fluxo_caixa` have ambiguous column references
    - This causes errors when these functions are called from the application

  2. Solution
    - Qualify all column references with their table/CTE aliases
    - Rename columns in CTEs to avoid name conflicts
    - Maintain the same function signatures and return types
*/

-- Drop the function with ambiguous column references
DROP FUNCTION IF EXISTS obter_dre_periodo(date, date, uuid);

-- Recreate the function with properly qualified column references
CREATE OR REPLACE FUNCTION obter_dre_periodo(
  p_data_inicial date,
  p_data_final date,
  p_centro_custo_id uuid DEFAULT NULL
)
RETURNS TABLE (
  tipo text,
  categoria_principal text,
  categoria_nome text,
  nivel integer,
  valor_total numeric
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE categoria_tree AS (
    -- Base case: root categories (no parent)
    SELECT 
      id,
      nome,
      tipo AS cat_tipo,
      categoria_pai_id,
      id as categoria_raiz_id,
      nome as categoria_raiz_nome,
      0 as nivel,
      ARRAY[id] as caminho
    FROM categorias_financeiras 
    WHERE categoria_pai_id IS NULL AND status = 'ativo'
    
    UNION ALL
    
    -- Recursive case: subcategories
    SELECT 
      c.id,
      c.nome,
      c.tipo AS cat_tipo,
      c.categoria_pai_id,
      ct.categoria_raiz_id,
      ct.categoria_raiz_nome,
      ct.nivel + 1,
      ct.caminho || c.id
    FROM categorias_financeiras c
    INNER JOIN categoria_tree ct ON c.categoria_pai_id = ct.id
    WHERE c.status = 'ativo'
  ),
  transacoes_filtradas AS (
    SELECT 
      fc.categoria_id,
      fc.valor,
      fc.tipo AS fc_tipo
    FROM fluxo_caixa fc
    WHERE fc.categoria_id IS NOT NULL
      AND fc.data BETWEEN p_data_inicial AND p_data_final
      AND (p_centro_custo_id IS NULL OR fc.centro_custo_id = p_centro_custo_id)
  )
  SELECT 
    ct.cat_tipo AS tipo,
    ct.categoria_raiz_nome AS categoria_principal,
    ct.nome AS categoria_nome,
    ct.nivel,
    COALESCE(SUM(CASE WHEN ct.cat_tipo = 'receita' THEN tf.valor ELSE -tf.valor END), 0) AS valor_total
  FROM categoria_tree ct
  LEFT JOIN transacoes_filtradas tf ON ct.id = tf.categoria_id
  GROUP BY 
    ct.cat_tipo,
    ct.categoria_raiz_nome,
    ct.nome,
    ct.nivel
  ORDER BY ct.cat_tipo, ct.nivel, ct.categoria_raiz_nome, ct.nome;
END;
$$ LANGUAGE plpgsql;

-- Drop the function with ambiguous column references
DROP FUNCTION IF EXISTS obter_projecao_fluxo_caixa(date, date, uuid);

-- Recreate the function with properly qualified column references
CREATE OR REPLACE FUNCTION obter_projecao_fluxo_caixa(
  p_data_inicial date,
  p_data_final date,
  p_centro_custo_id uuid DEFAULT NULL
)
RETURNS TABLE (
  data date,
  entradas numeric,
  saidas numeric,
  saldo_dia numeric,
  saldo_acumulado numeric
) AS $$
DECLARE
  saldo_anterior numeric := 0;
BEGIN
  -- Calculate previous balance
  SELECT COALESCE(SUM(
    CASE 
      WHEN fc.tipo = 'entrada' THEN fc.valor
      ELSE -fc.valor
    END
  ), 0)
  INTO saldo_anterior
  FROM fluxo_caixa fc
  WHERE fc.data < p_data_inicial
    AND (p_centro_custo_id IS NULL OR fc.centro_custo_id = p_centro_custo_id);
  
  RETURN QUERY
  WITH dias AS (
    SELECT generate_series(p_data_inicial, p_data_final, '1 day'::interval)::date AS dia_data
  ),
  fluxo_real AS (
    SELECT 
      fc.data AS fc_data,
      COALESCE(SUM(CASE WHEN fc.tipo = 'entrada' THEN fc.valor ELSE 0 END), 0) AS entradas,
      COALESCE(SUM(CASE WHEN fc.tipo = 'saida' THEN fc.valor ELSE 0 END), 0) AS saidas
    FROM fluxo_caixa fc
    WHERE fc.data BETWEEN p_data_inicial AND p_data_final
      AND (p_centro_custo_id IS NULL OR fc.centro_custo_id = p_centro_custo_id)
    GROUP BY fc.data
  ),
  contas_pagar_projetadas AS (
    SELECT 
      cp.data_vencimento AS cp_data,
      0 AS entradas,
      COALESCE(SUM(cp.saldo_restante), 0) AS saidas
    FROM contas_pagar cp
    WHERE cp.status IN ('em_aberto', 'parcialmente_pago', 'vencido')
      AND cp.data_vencimento BETWEEN p_data_inicial AND p_data_final
      AND (p_centro_custo_id IS NULL OR cp.centro_custo_id = p_centro_custo_id)
    GROUP BY cp.data_vencimento
  ),
  fluxo_consolidado AS (
    SELECT 
      d.dia_data AS data,
      COALESCE(fr.entradas, 0) AS entradas,
      COALESCE(fr.saidas, 0) + COALESCE(cpp.saidas, 0) AS saidas,
      COALESCE(fr.entradas, 0) - (COALESCE(fr.saidas, 0) + COALESCE(cpp.saidas, 0)) AS saldo_dia
    FROM dias d
    LEFT JOIN fluxo_real fr ON d.dia_data = fr.fc_data
    LEFT JOIN contas_pagar_projetadas cpp ON d.dia_data = cpp.cp_data
  )
  SELECT 
    fc.data,
    fc.entradas,
    fc.saidas,
    fc.saldo_dia,
    saldo_anterior + SUM(fc.saldo_dia) OVER (ORDER BY fc.data ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) AS saldo_acumulado
  FROM fluxo_consolidado fc
  ORDER BY fc.data;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON FUNCTION obter_dre_periodo(date, date, uuid) IS 'Function to get income statement for a specific period with fixed ambiguous column references';
COMMENT ON FUNCTION obter_projecao_fluxo_caixa(date, date, uuid) IS 'Function to get cash flow projection for a specific period with fixed ambiguous column references';