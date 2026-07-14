
/*
  # Corrigir função obter_dre_periodo

  Correções aplicadas:
  1. Remove ambiguidade de nomes de variáveis (tipo vs fc.tipo)
  2. Corrige lógica para usar tipo da categoria, não tipo do fluxo_caixa
  3. Agrupa corretamente valores por hierarquia de categorias
  4. Evita duplicação de valores entre categoria pai e filha
  5. Usa apenas valores de categorias FOLHA (sem filhas)
*/

-- Drop da função anterior com múltiplas assinaturas
DROP FUNCTION IF EXISTS obter_dre_periodo(date, date);
DROP FUNCTION IF EXISTS obter_dre_periodo(date, date, uuid);

-- Criar nova função corrigida
CREATE OR REPLACE FUNCTION obter_dre_periodo(
  p_data_inicial date,
  p_data_final date,
  p_centro_custo_id uuid DEFAULT NULL
)
RETURNS TABLE(
  tipo_categoria text,
  categoria_principal text,
  categoria_nome text,
  nivel integer,
  valor_total numeric,
  eh_categoria_folha boolean
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE categoria_tree AS (
    -- Categorias raiz (sem pai)
    SELECT 
      c.id,
      c.nome,
      c.tipo as cat_tipo,
      c.categoria_pai_id,
      c.id as categoria_raiz_id,
      c.nome as categoria_raiz_nome,
      0 as cat_nivel,
      ARRAY[c.id] as caminho,
      NOT EXISTS (
        SELECT 1 FROM categorias_financeiras cf 
        WHERE cf.categoria_pai_id = c.id AND cf.status = 'ativo'
      ) as eh_folha
    FROM categorias_financeiras c
    WHERE c.categoria_pai_id IS NULL 
      AND c.status = 'ativo'
    
    UNION ALL
    
    -- Subcategorias (recursivo)
    SELECT 
      c.id,
      c.nome,
      c.tipo as cat_tipo,
      c.categoria_pai_id,
      ct.categoria_raiz_id,
      ct.categoria_raiz_nome,
      ct.cat_nivel + 1,
      ct.caminho || c.id,
      NOT EXISTS (
        SELECT 1 FROM categorias_financeiras cf 
        WHERE cf.categoria_pai_id = c.id AND cf.status = 'ativo'
      ) as eh_folha
    FROM categorias_financeiras c
    INNER JOIN categoria_tree ct ON c.categoria_pai_id = ct.id
    WHERE c.status = 'ativo'
  ),
  -- Valores do fluxo de caixa agrupados por categoria
  valores_por_categoria AS (
    SELECT 
      fc.categoria_id,
      SUM(CASE 
        WHEN fc.tipo = 'entrada' THEN fc.valor 
        WHEN fc.tipo = 'saida' THEN -fc.valor 
        ELSE 0 
      END) as valor_liquido
    FROM fluxo_caixa fc
    WHERE fc.categoria_id IS NOT NULL
      AND fc.data BETWEEN p_data_inicial AND p_data_final
      AND (p_centro_custo_id IS NULL OR fc.centro_custo_id = p_centro_custo_id)
      -- Excluir transferências
      AND COALESCE(fc.origem, '') != 'transferencia'
    GROUP BY fc.categoria_id
  )
  -- Resultado final apenas com categorias FOLHA que tem valores
  SELECT 
    ct.cat_tipo::text as tipo_categoria,
    ct.categoria_raiz_nome::text as categoria_principal,
    ct.nome::text as categoria_nome,
    ct.cat_nivel as nivel,
    COALESCE(vpc.valor_liquido, 0) as valor_total,
    ct.eh_folha as eh_categoria_folha
  FROM categoria_tree ct
  LEFT JOIN valores_por_categoria vpc ON ct.id = vpc.categoria_id
  WHERE ct.eh_folha = true  -- APENAS categorias folha
    AND COALESCE(vpc.valor_liquido, 0) != 0  -- APENAS com valores
  ORDER BY ct.cat_tipo, ct.cat_nivel, ct.categoria_raiz_nome, ct.nome;
END;
$$;

-- Criar função para totais por categoria principal
CREATE OR REPLACE FUNCTION obter_dre_totais_principais(
  p_data_inicial date,
  p_data_final date,
  p_centro_custo_id uuid DEFAULT NULL
)
RETURNS TABLE(
  tipo_categoria text,
  categoria_principal text,
  valor_total numeric
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    tipo_categoria,
    categoria_principal,
    SUM(valor_total) as valor_total
  FROM obter_dre_periodo(p_data_inicial, p_data_final, p_centro_custo_id)
  GROUP BY tipo_categoria, categoria_principal
  ORDER BY tipo_categoria, categoria_principal;
END;
$$;

-- Criar função para resumo do DRE
CREATE OR REPLACE FUNCTION obter_dre_resumo(
  p_data_inicial date,
  p_data_final date,
  p_centro_custo_id uuid DEFAULT NULL
)
RETURNS TABLE(
  item text,
  valor numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_receitas numeric;
  v_despesas numeric;
BEGIN
  -- Calcular receitas (entrada)
  SELECT COALESCE(SUM(fc.valor), 0) INTO v_receitas
  FROM fluxo_caixa fc
  WHERE fc.tipo = 'entrada'
    AND fc.categoria_id IS NOT NULL
    AND fc.data BETWEEN p_data_inicial AND p_data_final
    AND (p_centro_custo_id IS NULL OR fc.centro_custo_id = p_centro_custo_id)
    AND COALESCE(fc.origem, '') != 'transferencia';

  -- Calcular despesas (saída)
  SELECT COALESCE(SUM(fc.valor), 0) INTO v_despesas
  FROM fluxo_caixa fc
  WHERE fc.tipo = 'saida'
    AND fc.categoria_id IS NOT NULL
    AND fc.data BETWEEN p_data_inicial AND p_data_final
    AND (p_centro_custo_id IS NULL OR fc.centro_custo_id = p_centro_custo_id)
    AND COALESCE(fc.origem, '') != 'transferencia';

  RETURN QUERY
  SELECT 'Receitas'::text, v_receitas
  UNION ALL
  SELECT 'Despesas'::text, v_despesas
  UNION ALL
  SELECT 'Resultado'::text, v_receitas - v_despesas;
END;
$$;
