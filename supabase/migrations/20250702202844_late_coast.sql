/*
  # Advanced Management Reports Module

  1. Views
    - vw_dre_consolidado - Consolidated income statement with hierarchical categories
    - dre_consolidado - Simplified income statement for reporting
    - vw_projecao_fluxo_caixa - Cash flow projection combining real and projected transactions
    - vw_indicadores_financeiros - Financial indicators dashboard
    - vw_ranking_fornecedores - Supplier ranking by spend

  2. Functions
    - obter_dre_periodo - Get income statement for specific period
    - obter_projecao_fluxo_caixa - Get cash flow projection
    - obter_despesas_por_categoria - Analyze expenses by category
    - obter_despesas_por_fornecedor - Analyze expenses by supplier
    - obter_kpis_financeiros - Calculate SMART financial KPIs
    - obter_comparativo_mensal - Monthly revenue/expense comparison

  3. Security
    - All views and functions respect existing RLS policies
*/

-- Drop existing views if they exist to avoid conflicts
DROP VIEW IF EXISTS vw_dre_consolidado CASCADE;
DROP VIEW IF EXISTS dre_consolidado CASCADE;
DROP VIEW IF EXISTS vw_projecao_fluxo_caixa CASCADE;
DROP VIEW IF EXISTS vw_indicadores_financeiros CASCADE;

-- Create view for DRE (Income Statement) with monthly breakdown
CREATE OR REPLACE VIEW vw_dre_consolidado AS
WITH RECURSIVE categoria_tree AS (
  -- Base case: root categories (no parent)
  SELECT 
    id,
    nome,
    tipo,
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
    c.tipo,
    c.categoria_pai_id,
    ct.categoria_raiz_id,
    ct.categoria_raiz_nome,
    ct.nivel + 1,
    ct.caminho || c.id
  FROM categorias_financeiras c
  INNER JOIN categoria_tree ct ON c.categoria_pai_id = ct.id
  WHERE c.status = 'ativo'
),
transacoes_por_categoria AS (
  SELECT 
    fc.categoria_id,
    fc.centro_custo_id,
    fc.data,
    fc.valor,
    fc.tipo,
    EXTRACT(YEAR FROM fc.data) as ano,
    EXTRACT(MONTH FROM fc.data) as mes
  FROM fluxo_caixa fc
  WHERE fc.categoria_id IS NOT NULL
)
SELECT 
  ct.categoria_raiz_id,
  ct.categoria_raiz_nome,
  ct.id as categoria_id,
  ct.nome as categoria_nome,
  ct.tipo,
  ct.nivel,
  tpc.centro_custo_id,
  tpc.ano,
  tpc.mes,
  COALESCE(SUM(CASE WHEN ct.tipo = 'receita' THEN tpc.valor ELSE -tpc.valor END), 0) as valor_total,
  COUNT(tpc.valor) as quantidade_lancamentos
FROM categoria_tree ct
LEFT JOIN transacoes_por_categoria tpc ON ct.id = tpc.categoria_id
GROUP BY 
  ct.categoria_raiz_id,
  ct.categoria_raiz_nome,
  ct.id,
  ct.nome,
  ct.tipo,
  ct.nivel,
  tpc.centro_custo_id,
  tpc.ano,
  tpc.mes
ORDER BY ct.tipo, ct.categoria_raiz_nome, ct.nivel, ct.nome;

-- Create simplified DRE view for reporting
CREATE OR REPLACE VIEW dre_consolidado AS
SELECT
  vw.tipo,
  CASE WHEN vw.nivel = 0 THEN vw.categoria_nome ELSE NULL END as categoria_principal,
  CASE WHEN vw.nivel > 0 THEN vw.categoria_nome ELSE NULL END as subcategoria,
  SUM(vw.valor_total) as total
FROM vw_dre_consolidado vw
GROUP BY vw.tipo, vw.nivel, vw.categoria_nome
ORDER BY vw.tipo, vw.nivel, vw.categoria_nome;

-- Create view for cash flow projection
CREATE OR REPLACE VIEW vw_projecao_fluxo_caixa AS
-- Real cash flow entries
SELECT 
  fc.id,
  fc.data,
  fc.descricao,
  cat.nome as categoria,
  cat.caminho_completo as categoria_completa,
  cc.nome as centro_custo,
  fp.nome as forma_pagamento,
  bc.banco as conta_bancaria,
  CASE 
    WHEN fc.tipo = 'entrada' THEN fc.valor
    ELSE -fc.valor
  END as valor,
  'realizado' as status,
  fc.origem,
  fc.observacoes,
  fc.criado_em
FROM fluxo_caixa fc
LEFT JOIN vw_categoria_tree cat ON fc.categoria_id = cat.id
LEFT JOIN centros_custo cc ON fc.centro_custo_id = cc.id
LEFT JOIN formas_pagamento fp ON fc.forma_pagamento_id = fp.id
LEFT JOIN bancos_contas bc ON fc.conta_bancaria_id = bc.id

UNION ALL

-- Accounts payable projection
SELECT 
  cp.id,
  cp.data_vencimento as data,
  'Previsão: ' || cp.descricao as descricao,
  cat.nome as categoria,
  cat.caminho_completo as categoria_completa,
  cc.nome as centro_custo,
  fp.nome as forma_pagamento,
  NULL as conta_bancaria,
  -cp.saldo_restante as valor,
  CASE 
    WHEN cp.data_vencimento < CURRENT_DATE THEN 'vencido'
    ELSE 'previsto'
  END as status,
  'conta_pagar' as origem,
  cp.observacoes,
  cp.criado_em
FROM contas_pagar cp
LEFT JOIN vw_categoria_tree cat ON cp.categoria_id = cat.id
LEFT JOIN centros_custo cc ON cp.centro_custo_id = cc.id
LEFT JOIN formas_pagamento fp ON cp.forma_pagamento_id = fp.id
WHERE cp.status IN ('em_aberto', 'parcialmente_pago', 'vencido')
AND cp.saldo_restante > 0

UNION ALL

-- Accounts receivable projection (if table exists)
SELECT 
  cr.id,
  cr.data_vencimento as data,
  'Previsão Recebimento: ' || cr.descricao as descricao,
  cat.nome as categoria,
  cat.caminho_completo as categoria_completa,
  cc.nome as centro_custo,
  fp.nome as forma_pagamento,
  NULL as conta_bancaria,
  cr.saldo_restante as valor,
  CASE 
    WHEN cr.data_vencimento < CURRENT_DATE THEN 'vencido'
    ELSE 'previsto'
  END as status,
  'conta_receber' as origem,
  cr.observacoes,
  cr.criado_em
FROM contas_receber cr
LEFT JOIN vw_categoria_tree cat ON cr.categoria_id = cat.id
LEFT JOIN centros_custo cc ON cr.centro_custo_id = cc.id
LEFT JOIN formas_pagamento fp ON cr.forma_recebimento_id = fp.id
WHERE cr.status IN ('em_aberto', 'parcialmente_recebido', 'vencido')
AND cr.saldo_restante > 0

ORDER BY data;

-- Create view for financial indicators
CREATE OR REPLACE VIEW vw_indicadores_financeiros AS
WITH 
contas_abertas AS (
  SELECT 
    COUNT(*) as total_contas_abertas,
    COALESCE(SUM(saldo_restante), 0) as valor_contas_abertas
  FROM contas_pagar 
  WHERE status IN ('em_aberto', 'parcialmente_pago')
),
contas_vencidas AS (
  SELECT 
    COUNT(*) as total_contas_vencidas,
    COALESCE(SUM(saldo_restante), 0) as valor_contas_vencidas
  FROM contas_pagar 
  WHERE status = 'vencido' OR (
    status IN ('em_aberto', 'parcialmente_pago') 
    AND data_vencimento < CURRENT_DATE
  )
),
proximo_mes AS (
  SELECT 
    COALESCE(SUM(saldo_restante), 0) as valor_proximo_mes
  FROM contas_pagar 
  WHERE status IN ('em_aberto', 'parcialmente_pago', 'vencido')
  AND data_vencimento BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days')
),
saldo_real AS (
  SELECT 
    COALESCE(SUM(
      CASE 
        WHEN tipo = 'entrada' THEN valor
        ELSE -valor
      END
    ), 0) as saldo_fluxo_caixa
  FROM fluxo_caixa
),
saldo_projetado AS (
  SELECT 
    COALESCE(SUM(valor), 0) as saldo_com_projecao
  FROM vw_projecao_fluxo_caixa
)
SELECT 
  ca.total_contas_abertas,
  ca.valor_contas_abertas,
  cv.total_contas_vencidas,
  cv.valor_contas_vencidas,
  pm.valor_proximo_mes,
  sr.saldo_fluxo_caixa,
  (sr.saldo_fluxo_caixa - ca.valor_contas_abertas) as saldo_projetado
FROM contas_abertas ca
CROSS JOIN contas_vencidas cv
CROSS JOIN proximo_mes pm
CROSS JOIN saldo_real sr
CROSS JOIN saldo_projetado sp;

-- Create function to update existing vw_ranking_fornecedores if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.views WHERE table_name = 'vw_ranking_fornecedores') THEN
    EXECUTE '
    CREATE VIEW vw_ranking_fornecedores AS
    SELECT 
      f.id,
      f.nome,
      f.cnpj,
      f.telefone,
      f.email,
      COALESCE(SUM(cp.valor_total), 0) as total_compras,
      COALESCE(SUM(cp.valor_pago), 0) as total_pago,
      COALESCE(SUM(cp.saldo_restante), 0) as saldo_pendente,
      COUNT(cp.id) as total_contas,
      COUNT(CASE WHEN cp.status IN (''em_aberto'', ''parcialmente_pago'') AND cp.data_vencimento < CURRENT_DATE THEN 1 END) as contas_vencidas,
      CASE 
        WHEN COUNT(cp.id) > 0 THEN COALESCE(SUM(cp.valor_total), 0) / COUNT(cp.id)
        ELSE 0
      END as ticket_medio,
      MAX(cp.data_emissao) as ultima_compra,
      CASE 
        WHEN COALESCE(SUM(cp.valor_total), 0) = 0 THEN 0
        ELSE (COALESCE(SUM(cp.valor_pago), 0) / COALESCE(SUM(cp.valor_total), 1)) * 100
      END as percentual_pago
    FROM fornecedores f
    LEFT JOIN contas_pagar cp ON f.id = cp.fornecedor_id
    WHERE f.status = ''ativo''
    GROUP BY f.id, f.nome, f.cnpj, f.telefone, f.email
    ORDER BY total_compras DESC';
  END IF;
END $$;

-- Create function for period-based DRE
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
      tipo,
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
      c.tipo,
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
      fc.tipo
    FROM fluxo_caixa fc
    WHERE fc.categoria_id IS NOT NULL
      AND fc.data BETWEEN p_data_inicial AND p_data_final
      AND (p_centro_custo_id IS NULL OR fc.centro_custo_id = p_centro_custo_id)
  )
  SELECT 
    ct.tipo,
    ct.categoria_raiz_nome as categoria_principal,
    ct.nome as categoria_nome,
    ct.nivel,
    COALESCE(SUM(CASE WHEN ct.tipo = 'receita' THEN tf.valor ELSE -tf.valor END), 0) as valor_total
  FROM categoria_tree ct
  LEFT JOIN transacoes_filtradas tf ON ct.id = tf.categoria_id
  GROUP BY 
    ct.tipo,
    ct.categoria_raiz_nome,
    ct.nome,
    ct.nivel
  ORDER BY ct.tipo, ct.nivel, ct.categoria_raiz_nome, ct.nome;
END;
$$ LANGUAGE plpgsql;

-- Create function for cash flow projection by period
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
      WHEN tipo = 'entrada' THEN valor
      ELSE -valor
    END
  ), 0)
  INTO saldo_anterior
  FROM fluxo_caixa
  WHERE data < p_data_inicial
    AND (p_centro_custo_id IS NULL OR centro_custo_id = p_centro_custo_id);
  
  RETURN QUERY
  WITH dias AS (
    SELECT generate_series(p_data_inicial, p_data_final, '1 day'::interval)::date as data
  ),
  fluxo_real AS (
    SELECT 
      fc.data,
      COALESCE(SUM(CASE WHEN fc.tipo = 'entrada' THEN fc.valor ELSE 0 END), 0) as entradas,
      COALESCE(SUM(CASE WHEN fc.tipo = 'saida' THEN fc.valor ELSE 0 END), 0) as saidas
    FROM fluxo_caixa fc
    WHERE fc.data BETWEEN p_data_inicial AND p_data_final
      AND (p_centro_custo_id IS NULL OR fc.centro_custo_id = p_centro_custo_id)
    GROUP BY fc.data
  ),
  contas_pagar_projetadas AS (
    SELECT 
      cp.data_vencimento as data,
      0 as entradas,
      COALESCE(SUM(cp.saldo_restante), 0) as saidas
    FROM contas_pagar cp
    WHERE cp.status IN ('em_aberto', 'parcialmente_pago', 'vencido')
      AND cp.data_vencimento BETWEEN p_data_inicial AND p_data_final
      AND (p_centro_custo_id IS NULL OR cp.centro_custo_id = p_centro_custo_id)
    GROUP BY cp.data_vencimento
  ),
  fluxo_consolidado AS (
    SELECT 
      d.data,
      COALESCE(fr.entradas, 0) as entradas,
      COALESCE(fr.saidas, 0) + COALESCE(cpp.saidas, 0) as saidas,
      COALESCE(fr.entradas, 0) - (COALESCE(fr.saidas, 0) + COALESCE(cpp.saidas, 0)) as saldo_dia
    FROM dias d
    LEFT JOIN fluxo_real fr ON d.data = fr.data
    LEFT JOIN contas_pagar_projetadas cpp ON d.data = cpp.data
  )
  SELECT 
    fc.data,
    fc.entradas,
    fc.saidas,
    fc.saldo_dia,
    saldo_anterior + SUM(fc.saldo_dia) OVER (ORDER BY fc.data ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW) as saldo_acumulado
  FROM fluxo_consolidado fc
  ORDER BY fc.data;
END;
$$ LANGUAGE plpgsql;

-- Create function for expense analysis by category
CREATE OR REPLACE FUNCTION obter_despesas_por_categoria(
  p_data_inicial date,
  p_data_final date,
  p_centro_custo_id uuid DEFAULT NULL
)
RETURNS TABLE (
  categoria_id uuid,
  categoria_nome text,
  categoria_completa text,
  nivel integer,
  total_despesas numeric,
  percentual_total numeric,
  quantidade_lancamentos bigint
) AS $$
BEGIN
  RETURN QUERY
  WITH despesas_periodo AS (
    SELECT 
      fc.categoria_id,
      SUM(fc.valor) as total_valor,
      COUNT(*) as qtd_lancamentos
    FROM fluxo_caixa fc
    WHERE fc.tipo = 'saida'
      AND fc.data BETWEEN p_data_inicial AND p_data_final
      AND (p_centro_custo_id IS NULL OR fc.centro_custo_id = p_centro_custo_id)
      AND fc.categoria_id IS NOT NULL
    GROUP BY fc.categoria_id
  ),
  total_despesas AS (
    SELECT COALESCE(SUM(total_valor), 0) as valor_total
    FROM despesas_periodo
  )
  SELECT 
    cat.id as categoria_id,
    cat.nome as categoria_nome,
    cat.caminho_completo as categoria_completa,
    cat.nivel,
    COALESCE(dp.total_valor, 0) as total_despesas,
    CASE 
      WHEN (SELECT valor_total FROM total_despesas) = 0 THEN 0
      ELSE (COALESCE(dp.total_valor, 0) / (SELECT valor_total FROM total_despesas)) * 100
    END as percentual_total,
    COALESCE(dp.qtd_lancamentos, 0) as quantidade_lancamentos
  FROM vw_categoria_tree cat
  LEFT JOIN despesas_periodo dp ON cat.id = dp.categoria_id
  WHERE cat.tipo = 'despesa'
  ORDER BY cat.nivel, COALESCE(dp.total_valor, 0) DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function for expense analysis by supplier
CREATE OR REPLACE FUNCTION obter_despesas_por_fornecedor(
  p_data_inicial date,
  p_data_final date
)
RETURNS TABLE (
  fornecedor_id uuid,
  fornecedor_nome text,
  total_compras numeric,
  total_pago numeric,
  saldo_pendente numeric,
  total_contas bigint,
  contas_vencidas bigint,
  percentual_total numeric
) AS $$
DECLARE
  total_geral numeric;
BEGIN
  -- Calculate total spend for the period
  SELECT COALESCE(SUM(cp.valor_total), 0)
  INTO total_geral
  FROM contas_pagar cp
  WHERE cp.data_emissao BETWEEN p_data_inicial AND p_data_final;
  
  -- Return zero if no data
  IF total_geral = 0 THEN
    total_geral := 1; -- Avoid division by zero
  END IF;
  
  RETURN QUERY
  SELECT 
    f.id as fornecedor_id,
    f.nome as fornecedor_nome,
    COALESCE(SUM(cp.valor_total), 0) as total_compras,
    COALESCE(SUM(cp.valor_pago), 0) as total_pago,
    COALESCE(SUM(cp.saldo_restante), 0) as saldo_pendente,
    COUNT(cp.id) as total_contas,
    COUNT(CASE WHEN cp.status IN ('em_aberto', 'parcialmente_pago') AND cp.data_vencimento < CURRENT_DATE THEN 1 END) as contas_vencidas,
    (COALESCE(SUM(cp.valor_total), 0) / total_geral) * 100 as percentual_total
  FROM fornecedores f
  LEFT JOIN contas_pagar cp ON f.id = cp.fornecedor_id
  WHERE f.status = 'ativo'
    AND cp.data_emissao BETWEEN p_data_inicial AND p_data_final
  GROUP BY f.id, f.nome
  ORDER BY total_compras DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function for SMART KPIs
CREATE OR REPLACE FUNCTION obter_kpis_financeiros(
  p_data_inicial date,
  p_data_final date,
  p_periodo_anterior_inicial date,
  p_periodo_anterior_final date
)
RETURNS TABLE (
  kpi_nome text,
  valor_atual numeric,
  valor_anterior numeric,
  variacao_percentual numeric,
  unidade text
) AS $$
DECLARE
  receita_atual numeric;
  receita_anterior numeric;
  despesa_atual numeric;
  despesa_anterior numeric;
  cmv_atual numeric;
  cmv_anterior numeric;
BEGIN
  -- Calculate current period values
  SELECT COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END), 0)
  INTO receita_atual, despesa_atual
  FROM fluxo_caixa
  WHERE data BETWEEN p_data_inicial AND p_data_final;
  
  -- Calculate previous period values
  SELECT COALESCE(SUM(CASE WHEN tipo = 'entrada' THEN valor ELSE 0 END), 0),
         COALESCE(SUM(CASE WHEN tipo = 'saida' THEN valor ELSE 0 END), 0)
  INTO receita_anterior, despesa_anterior
  FROM fluxo_caixa
  WHERE data BETWEEN p_periodo_anterior_inicial AND p_periodo_anterior_final;
  
  -- Calculate CMV (Cost of Goods Sold)
  SELECT COALESCE(SUM(valor), 0)
  INTO cmv_atual
  FROM fluxo_caixa fc
  JOIN vw_categoria_tree cat ON fc.categoria_id = cat.id
  WHERE fc.data BETWEEN p_data_inicial AND p_data_final
    AND fc.tipo = 'saida'
    AND (cat.caminho_completo LIKE 'CMV%' OR cat.nome LIKE 'CMV%');
  
  SELECT COALESCE(SUM(valor), 0)
  INTO cmv_anterior
  FROM fluxo_caixa fc
  JOIN vw_categoria_tree cat ON fc.categoria_id = cat.id
  WHERE fc.data BETWEEN p_periodo_anterior_inicial AND p_periodo_anterior_final
    AND fc.tipo = 'saida'
    AND (cat.caminho_completo LIKE 'CMV%' OR cat.nome LIKE 'CMV%');
  
  -- Return KPIs
  RETURN QUERY
  
  -- Receita Total
  SELECT 
    'Receita Total'::text as kpi_nome,
    receita_atual as valor_atual,
    receita_anterior as valor_anterior,
    CASE 
      WHEN receita_anterior = 0 THEN NULL
      ELSE ((receita_atual - receita_anterior) / receita_anterior) * 100
    END as variacao_percentual,
    'R$'::text as unidade
  
  UNION ALL
  
  -- Despesa Total
  SELECT 
    'Despesa Total'::text as kpi_nome,
    despesa_atual as valor_atual,
    despesa_anterior as valor_anterior,
    CASE 
      WHEN despesa_anterior = 0 THEN NULL
      ELSE ((despesa_atual - despesa_anterior) / despesa_anterior) * 100
    END as variacao_percentual,
    'R$'::text as unidade
  
  UNION ALL
  
  -- Resultado Líquido
  SELECT 
    'Resultado Líquido'::text as kpi_nome,
    (receita_atual - despesa_atual) as valor_atual,
    (receita_anterior - despesa_anterior) as valor_anterior,
    CASE 
      WHEN (receita_anterior - despesa_anterior) = 0 THEN NULL
      ELSE (((receita_atual - despesa_atual) - (receita_anterior - despesa_anterior)) / ABS(receita_anterior - despesa_anterior)) * 100
    END as variacao_percentual,
    'R$'::text as unidade
  
  UNION ALL
  
  -- Margem Líquida
  SELECT 
    'Margem Líquida'::text as kpi_nome,
    CASE 
      WHEN receita_atual = 0 THEN 0
      ELSE ((receita_atual - despesa_atual) / receita_atual) * 100
    END as valor_atual,
    CASE 
      WHEN receita_anterior = 0 THEN 0
      ELSE ((receita_anterior - despesa_anterior) / receita_anterior) * 100
    END as valor_anterior,
    CASE 
      WHEN receita_anterior = 0 OR ((receita_anterior - despesa_anterior) / receita_anterior) = 0 THEN NULL
      ELSE (
        (((receita_atual - despesa_atual) / receita_atual) - ((receita_anterior - despesa_anterior) / receita_anterior)) / 
        ABS(((receita_anterior - despesa_anterior) / receita_anterior))
      ) * 100
    END as variacao_percentual,
    '%'::text as unidade
  
  UNION ALL
  
  -- CMV (Custo de Mercadoria Vendida)
  SELECT 
    'CMV'::text as kpi_nome,
    cmv_atual as valor_atual,
    cmv_anterior as valor_anterior,
    CASE 
      WHEN cmv_anterior = 0 THEN NULL
      ELSE ((cmv_atual - cmv_anterior) / cmv_anterior) * 100
    END as variacao_percentual,
    'R$'::text as unidade
  
  UNION ALL
  
  -- % CMV sobre Vendas
  SELECT 
    '% CMV sobre Vendas'::text as kpi_nome,
    CASE 
      WHEN receita_atual = 0 THEN 0
      ELSE (cmv_atual / receita_atual) * 100
    END as valor_atual,
    CASE 
      WHEN receita_anterior = 0 THEN 0
      ELSE (cmv_anterior / receita_anterior) * 100
    END as valor_anterior,
    CASE 
      WHEN receita_anterior = 0 OR (cmv_anterior / receita_anterior) = 0 THEN NULL
      ELSE (
        ((cmv_atual / receita_atual) - (cmv_anterior / receita_anterior)) / 
        ABS((cmv_anterior / receita_anterior))
      ) * 100
    END as variacao_percentual,
    '%'::text as unidade;
END;
$$ LANGUAGE plpgsql;

-- Create function for monthly revenue/expense comparison
CREATE OR REPLACE FUNCTION obter_comparativo_mensal(
  p_ano integer,
  p_centro_custo_id uuid DEFAULT NULL
)
RETURNS TABLE (
  mes integer,
  nome_mes text,
  receitas numeric,
  despesas numeric,
  resultado numeric
) AS $$
BEGIN
  RETURN QUERY
  WITH meses AS (
    SELECT generate_series(1, 12) as mes
  ),
  nomes_meses AS (
    SELECT 
      1 as mes, 'Janeiro' as nome_mes UNION ALL
      SELECT 2, 'Fevereiro' UNION ALL
      SELECT 3, 'Março' UNION ALL
      SELECT 4, 'Abril' UNION ALL
      SELECT 5, 'Maio' UNION ALL
      SELECT 6, 'Junho' UNION ALL
      SELECT 7, 'Julho' UNION ALL
      SELECT 8, 'Agosto' UNION ALL
      SELECT 9, 'Setembro' UNION ALL
      SELECT 10, 'Outubro' UNION ALL
      SELECT 11, 'Novembro' UNION ALL
      SELECT 12, 'Dezembro'
  ),
  receitas_mensais AS (
    SELECT 
      EXTRACT(MONTH FROM data)::integer as mes,
      SUM(valor) as total
    FROM fluxo_caixa
    WHERE EXTRACT(YEAR FROM data) = p_ano
      AND tipo = 'entrada'
      AND (p_centro_custo_id IS NULL OR centro_custo_id = p_centro_custo_id)
    GROUP BY mes
  ),
  despesas_mensais AS (
    SELECT 
      EXTRACT(MONTH FROM data)::integer as mes,
      SUM(valor) as total
    FROM fluxo_caixa
    WHERE EXTRACT(YEAR FROM data) = p_ano
      AND tipo = 'saida'
      AND (p_centro_custo_id IS NULL OR centro_custo_id = p_centro_custo_id)
    GROUP BY mes
  )
  SELECT 
    m.mes,
    nm.nome_mes,
    COALESCE(rm.total, 0) as receitas,
    COALESCE(dm.total, 0) as despesas,
    COALESCE(rm.total, 0) - COALESCE(dm.total, 0) as resultado
  FROM meses m
  JOIN nomes_meses nm ON m.mes = nm.mes
  LEFT JOIN receitas_mensais rm ON m.mes = rm.mes
  LEFT JOIN despesas_mensais dm ON m.mes = dm.mes
  ORDER BY m.mes;
END;
$$ LANGUAGE plpgsql;

-- Add comments for documentation
COMMENT ON VIEW vw_dre_consolidado IS 'Consolidated income statement with hierarchical categories';
COMMENT ON VIEW dre_consolidado IS 'Simplified income statement for reporting';
COMMENT ON VIEW vw_projecao_fluxo_caixa IS 'Cash flow projection combining real and projected transactions';
COMMENT ON VIEW vw_indicadores_financeiros IS 'Financial indicators dashboard';
COMMENT ON FUNCTION obter_dre_periodo IS 'Function to get income statement for a specific period';
COMMENT ON FUNCTION obter_projecao_fluxo_caixa IS 'Function to get cash flow projection for a specific period';
COMMENT ON FUNCTION obter_despesas_por_categoria IS 'Function to analyze expenses by category';
COMMENT ON FUNCTION obter_despesas_por_fornecedor IS 'Function to analyze expenses by supplier';
COMMENT ON FUNCTION obter_kpis_financeiros IS 'Function to calculate SMART financial KPIs';
COMMENT ON FUNCTION obter_comparativo_mensal IS 'Function to get monthly revenue/expense comparison';