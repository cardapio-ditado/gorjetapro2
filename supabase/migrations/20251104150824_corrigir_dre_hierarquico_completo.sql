/*
  # Corrigir DRE Hierárquico
  
  1. Problema Identificado
    - A view vw_dre_consolidado estava somando apenas lançamentos diretos nas categorias raiz
    - As subcategorias tinham valores próprios que não estavam sendo incluídos no total da categoria raiz
    - Isso causava totais incorretos no DRE
  
  2. Solução
    - Criar nova view que calcula corretamente a hierarquia
    - Categoria raiz (nível 0) = soma de TODAS as subcategorias
    - Se não houver subcategorias, usa o valor da própria categoria
  
  3. Nova View
    - vw_dre_detalhado: view completa com hierarquia correta
    - Substitui vw_dre_consolidado mantendo compatibilidade
*/

-- Remover view antiga
DROP VIEW IF EXISTS vw_dre_consolidado CASCADE;

-- Criar nova view com hierarquia correta
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
  -- Calcular valores por subcategoria (incluindo categorias raiz sem filhos)
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
),
totais_categoria_raiz AS (
  -- Calcular total da categoria raiz como soma de todas subcategorias
  SELECT DISTINCT ON (vs.categoria_raiz_id, vs.tipo, vs.centro_custo_id, vs.ano, vs.mes)
    vs.categoria_raiz_id,
    vs.categoria_raiz_nome,
    vs.categoria_raiz_id as categoria_id,
    vs.categoria_raiz_nome as categoria_nome,
    vs.tipo,
    0 as nivel,
    vs.centro_custo_id,
    vs.ano,
    vs.mes,
    SUM(vs.valor_total) OVER (
      PARTITION BY vs.categoria_raiz_id, vs.tipo, vs.centro_custo_id, vs.ano, vs.mes
    ) as valor_total,
    SUM(vs.quantidade_lancamentos) OVER (
      PARTITION BY vs.categoria_raiz_id, vs.tipo, vs.centro_custo_id, vs.ano, vs.mes
    ) as quantidade_lancamentos
  FROM valores_subcategorias vs
  WHERE vs.ano IS NOT NULL
)
-- Retornar categorias raiz com totais corretos
SELECT * FROM totais_categoria_raiz
WHERE valor_total != 0 OR quantidade_lancamentos > 0

UNION ALL

-- Retornar subcategorias com seus valores
SELECT 
  vs.categoria_raiz_id,
  vs.categoria_raiz_nome,
  vs.categoria_id,
  vs.categoria_nome,
  vs.tipo,
  vs.nivel,
  vs.centro_custo_id,
  vs.ano,
  vs.mes,
  vs.valor_total,
  vs.quantidade_lancamentos
FROM valores_subcategorias vs
WHERE vs.nivel > 0 
  AND (vs.valor_total != 0 OR vs.quantidade_lancamentos > 0)
  AND vs.ano IS NOT NULL

ORDER BY tipo, categoria_raiz_nome, nivel, categoria_nome;

-- Criar view adicional para debug e análise detalhada
CREATE OR REPLACE VIEW vw_dre_debug AS
SELECT 
  vw.tipo,
  vw.categoria_raiz_nome,
  vw.categoria_nome,
  vw.nivel,
  CASE WHEN vw.nivel = 0 THEN '>>> TOTAL' ELSE '    ' || vw.categoria_nome END as categoria_display,
  vw.valor_total,
  vw.quantidade_lancamentos,
  vw.ano,
  vw.mes
FROM vw_dre_consolidado vw
ORDER BY vw.tipo, vw.categoria_raiz_nome, vw.nivel, vw.categoria_nome;
