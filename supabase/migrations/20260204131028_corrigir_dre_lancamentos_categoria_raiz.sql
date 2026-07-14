/*
  # Corrigir DRE - Lidar com Lançamentos em Categoria Raiz
  
  ## Problema Identificado
  Os lançamentos estão sendo feitos diretamente nas categorias raiz (nível 0)
  como "Receitas Operacionais" e "Outras Receitas", ao invés das subcategorias.
  
  A view anterior estava duplicando valores porque esperava apenas lançamentos
  em subcategorias.
  
  ## Solução
  Ajustar a view para:
  1. Mostrar lançamentos feitos diretamente em categorias raiz (sem duplicar)
  2. Mostrar lançamentos em subcategorias + totalizador da raiz
  3. Cada lançamento aparece apenas uma vez no cálculo
  
  ## Impacto
  - Valores do DRE batem exatamente com o fluxo de caixa
  - Não há duplicações
  - Funciona tanto para lançamentos em raiz quanto em subcategorias
*/

-- Remover view antiga
DROP VIEW IF EXISTS vw_dre_consolidado CASCADE;

-- Recriar view corrigida
CREATE OR REPLACE VIEW vw_dre_consolidado AS
WITH RECURSIVE categoria_tree AS (
  -- Categorias raiz (nível 0)
  SELECT 
    id,
    nome,
    tipo,
    categoria_pai_id,
    id AS categoria_raiz_id,
    nome AS categoria_raiz_nome,
    0 AS nivel,
    ARRAY[id] AS caminho
  FROM categorias_financeiras
  WHERE categoria_pai_id IS NULL 
    AND status = 'ativo'
  
  UNION ALL
  
  -- Subcategorias (nível 1+)
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
  JOIN categoria_tree ct ON c.categoria_pai_id = ct.id
  WHERE c.status = 'ativo'
),

-- Lançamentos do fluxo de caixa com categoria (excluindo transferências)
lancamentos_categorizados AS (
  SELECT 
    fc.id,
    fc.categoria_id,
    fc.centro_custo_id,
    fc.data,
    fc.valor,
    fc.tipo,
    EXTRACT(year FROM fc.data) AS ano,
    EXTRACT(month FROM fc.data) AS mes
  FROM fluxo_caixa fc
  WHERE fc.categoria_id IS NOT NULL
    AND fc.origem != 'transferencia'
),

-- Associar cada lançamento à sua categoria (folha da árvore) com hierarquia
lancamentos_com_hierarquia AS (
  SELECT 
    lc.id AS lancamento_id,
    ct.id AS categoria_id,
    ct.nome AS categoria_nome,
    ct.categoria_raiz_id,
    ct.categoria_raiz_nome,
    ct.tipo,
    ct.nivel,
    lc.centro_custo_id,
    lc.ano,
    lc.mes,
    lc.valor,
    CASE 
      WHEN ct.tipo = 'receita' THEN lc.valor
      ELSE -ABS(lc.valor)
    END AS valor_ajustado
  FROM lancamentos_categorizados lc
  JOIN categoria_tree ct ON lc.categoria_id = ct.id
),

-- Agregar valores por categoria onde os lançamentos realmente estão
valores_por_categoria AS (
  SELECT 
    categoria_id,
    categoria_nome,
    categoria_raiz_id,
    categoria_raiz_nome,
    tipo,
    nivel,
    centro_custo_id,
    ano,
    mes,
    SUM(valor_ajustado) AS valor_total,
    COUNT(lancamento_id) AS quantidade_lancamentos
  FROM lancamentos_com_hierarquia
  GROUP BY 
    categoria_id,
    categoria_nome,
    categoria_raiz_id,
    categoria_raiz_nome,
    tipo,
    nivel,
    centro_custo_id,
    ano,
    mes
),

-- Lançamentos sem categoria (excluindo transferências)
lancamentos_sem_categoria AS (
  SELECT 
    fc.centro_custo_id,
    fc.data,
    fc.valor,
    fc.tipo,
    EXTRACT(year FROM fc.data) AS ano,
    EXTRACT(month FROM fc.data) AS mes,
    CASE 
      WHEN fc.tipo = 'entrada' THEN 'receita'
      ELSE 'despesa'
    END AS tipo_categoria
  FROM fluxo_caixa fc
  WHERE fc.categoria_id IS NULL
    AND fc.origem != 'transferencia'
),

-- Agregar lançamentos sem categoria
lancamentos_nao_classificados AS (
  SELECT 
    gen_random_uuid() AS categoria_id,
    'Lançamentos Não Classificados' AS categoria_nome,
    gen_random_uuid() AS categoria_raiz_id,
    CASE 
      WHEN tipo_categoria = 'receita' THEN 'Receitas Não Classificadas'
      ELSE 'Despesas Não Classificadas'
    END AS categoria_raiz_nome,
    tipo_categoria AS tipo,
    1 AS nivel,
    centro_custo_id,
    ano,
    mes,
    SUM(
      CASE 
        WHEN tipo_categoria = 'receita' THEN valor
        ELSE -ABS(valor)
      END
    ) AS valor_total,
    COUNT(*) AS quantidade_lancamentos
  FROM lancamentos_sem_categoria
  GROUP BY 
    tipo_categoria,
    centro_custo_id,
    ano,
    mes
),

-- Calcular totais das categorias raiz APENAS quando há subcategorias com valores
totais_categoria_raiz AS (
  SELECT DISTINCT ON (categoria_raiz_id, tipo, centro_custo_id, ano, mes)
    categoria_raiz_id,
    categoria_raiz_nome,
    categoria_raiz_id AS categoria_id,
    categoria_raiz_nome AS categoria_nome,
    tipo,
    0 AS nivel,
    centro_custo_id,
    ano,
    mes,
    SUM(valor_total) OVER (
      PARTITION BY categoria_raiz_id, tipo, centro_custo_id, ano, mes
    ) AS valor_total,
    SUM(quantidade_lancamentos) OVER (
      PARTITION BY categoria_raiz_id, tipo, centro_custo_id, ano, mes
    ) AS quantidade_lancamentos
  FROM valores_por_categoria
  WHERE nivel > 0  -- Apenas criar totais quando há subcategorias
)

-- UNIÃO FINAL: Apenas valores reais (sem duplicação)
SELECT 
  categoria_raiz_id,
  categoria_raiz_nome,
  categoria_id,
  categoria_nome,
  tipo,
  nivel,
  centro_custo_id,
  ano,
  mes,
  valor_total,
  quantidade_lancamentos
FROM valores_por_categoria
WHERE valor_total != 0 OR quantidade_lancamentos > 0

UNION ALL

-- Adicionar lançamentos não classificados
SELECT 
  categoria_raiz_id,
  categoria_raiz_nome,
  categoria_id,
  categoria_nome,
  tipo,
  nivel,
  centro_custo_id,
  ano,
  mes,
  valor_total,
  quantidade_lancamentos
FROM lancamentos_nao_classificados
WHERE valor_total != 0 OR quantidade_lancamentos > 0

UNION ALL

-- Adicionar totais de categoria raiz APENAS quando há subcategorias
SELECT 
  categoria_raiz_id,
  categoria_raiz_nome,
  categoria_id,
  categoria_nome,
  tipo,
  nivel,
  centro_custo_id,
  ano,
  mes,
  valor_total,
  quantidade_lancamentos
FROM totais_categoria_raiz
WHERE valor_total != 0 OR quantidade_lancamentos > 0

ORDER BY tipo, categoria_raiz_nome, nivel, categoria_nome;

-- Conceder permissões
GRANT SELECT ON vw_dre_consolidado TO authenticated;
GRANT SELECT ON vw_dre_consolidado TO anon;
