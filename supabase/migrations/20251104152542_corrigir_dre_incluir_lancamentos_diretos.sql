/*
  # Corrigir DRE - Incluir lançamentos diretos nas categorias raiz
  
  1. Problema
    - Existem lançamentos feitos diretamente nas categorias raiz (sem subcategoria)
    - A view atual soma esses valores no total, mas não os exibe como subcategoria
    - Frontend mostra apenas subcategorias, então o total não bate
  
  2. Solução
    - Criar uma entrada virtual "Outros / Não Classificados" para lançamentos diretos
    - Manter a hierarquia correta
    - Total da categoria raiz = soma de TODAS as subcategorias + lançamentos diretos
  
  3. Estrutura
    - Nível 0: Total da categoria raiz
    - Nível 1: Subcategorias normais + "Outros" (se houver lançamentos diretos)
*/

DROP VIEW IF EXISTS vw_dre_consolidado CASCADE;

CREATE OR REPLACE VIEW vw_dre_consolidado AS
WITH RECURSIVE categoria_tree AS (
  -- Categorias raiz (sem pai)
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
  
  -- Subcategorias
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
lancamentos_por_categoria AS (
  -- Buscar todos os lançamentos com suas categorias
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
),
valores_subcategorias AS (
  -- Calcular valores por subcategoria real (apenas categorias que têm pai)
  SELECT 
    ct.id as categoria_id,
    ct.nome as categoria_nome,
    ct.categoria_raiz_id,
    ct.categoria_raiz_nome,
    ct.tipo,
    ct.nivel,
    lpc.centro_custo_id,
    lpc.ano,
    lpc.mes,
    COALESCE(
      SUM(
        CASE 
          WHEN ct.tipo = 'receita' THEN lpc.valor 
          ELSE -ABS(lpc.valor)
        END
      ), 
      0
    ) as valor_total,
    COUNT(lpc.valor) as quantidade_lancamentos
  FROM categoria_tree ct
  LEFT JOIN lancamentos_por_categoria lpc ON ct.id = lpc.categoria_id
  WHERE ct.nivel > 0  -- Apenas subcategorias reais
  GROUP BY 
    ct.id,
    ct.nome,
    ct.categoria_raiz_id,
    ct.categoria_raiz_nome,
    ct.tipo,
    ct.nivel,
    lpc.centro_custo_id,
    lpc.ano,
    lpc.mes
  HAVING lpc.ano IS NOT NULL
),
lancamentos_diretos_raiz AS (
  -- Lançamentos feitos diretamente na categoria raiz (sem subcategoria)
  SELECT 
    ct.categoria_raiz_id,
    ct.categoria_raiz_nome,
    ct.id as categoria_id,
    ct.tipo,
    lpc.centro_custo_id,
    lpc.ano,
    lpc.mes,
    COALESCE(
      SUM(
        CASE 
          WHEN ct.tipo = 'receita' THEN lpc.valor 
          ELSE -ABS(lpc.valor)
        END
      ), 
      0
    ) as valor_total,
    COUNT(lpc.valor) as quantidade_lancamentos
  FROM categoria_tree ct
  LEFT JOIN lancamentos_por_categoria lpc ON ct.id = lpc.categoria_id
  WHERE ct.nivel = 0  -- Apenas categorias raiz
    AND lpc.ano IS NOT NULL
  GROUP BY 
    ct.categoria_raiz_id,
    ct.categoria_raiz_nome,
    ct.id,
    ct.tipo,
    lpc.centro_custo_id,
    lpc.ano,
    lpc.mes
  HAVING COUNT(lpc.valor) > 0
),
subcategorias_com_diretos AS (
  -- Unir subcategorias normais com lançamentos diretos (como "Outros")
  SELECT * FROM valores_subcategorias
  
  UNION ALL
  
  -- Adicionar lançamentos diretos como subcategoria "Outros"
  SELECT 
    ld.categoria_id,
    'Outros / Não Classificados' as categoria_nome,
    ld.categoria_raiz_id,
    ld.categoria_raiz_nome,
    ld.tipo,
    1 as nivel,  -- Nível 1 (subcategoria)
    ld.centro_custo_id,
    ld.ano,
    ld.mes,
    ld.valor_total,
    ld.quantidade_lancamentos
  FROM lancamentos_diretos_raiz ld
),
totais_categoria_raiz AS (
  -- Calcular total da categoria raiz como soma de TODAS as subcategorias
  SELECT DISTINCT ON (sc.categoria_raiz_id, sc.tipo, sc.centro_custo_id, sc.ano, sc.mes)
    sc.categoria_raiz_id,
    sc.categoria_raiz_nome,
    sc.categoria_raiz_id as categoria_id,
    sc.categoria_raiz_nome as categoria_nome,
    sc.tipo,
    0 as nivel,
    sc.centro_custo_id,
    sc.ano,
    sc.mes,
    SUM(sc.valor_total) OVER (
      PARTITION BY sc.categoria_raiz_id, sc.tipo, sc.centro_custo_id, sc.ano, sc.mes
    ) as valor_total,
    SUM(sc.quantidade_lancamentos) OVER (
      PARTITION BY sc.categoria_raiz_id, sc.tipo, sc.centro_custo_id, sc.ano, sc.mes
    ) as quantidade_lancamentos
  FROM subcategorias_com_diretos sc
)
-- Retornar categorias raiz com totais corretos
SELECT * FROM totais_categoria_raiz
WHERE valor_total != 0 OR quantidade_lancamentos > 0

UNION ALL

-- Retornar todas as subcategorias (incluindo "Outros")
SELECT 
  sc.categoria_raiz_id,
  sc.categoria_raiz_nome,
  sc.categoria_id,
  sc.categoria_nome,
  sc.tipo,
  sc.nivel,
  sc.centro_custo_id,
  sc.ano,
  sc.mes,
  sc.valor_total,
  sc.quantidade_lancamentos
FROM subcategorias_com_diretos sc
WHERE sc.valor_total != 0 OR sc.quantidade_lancamentos > 0

ORDER BY tipo, categoria_raiz_nome, nivel, categoria_nome;
