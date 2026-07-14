/*
  # Corrigir DRE - Remover Duplicações de Valores
  
  ## Problema Identificado
  A view vw_dre_consolidado estava duplicando valores ao mostrar:
  - Categoria raiz (nível 0) com o total
  - Subcategorias (nível 1+) com os mesmos valores
  
  Isso causava valores duplicados no DRE (140% a mais do que o real).
  
  ## Solução
  Reconstruir a view para:
  1. Categorias raiz (nível 0) = apenas totalizador (soma das subcategorias)
  2. Subcategorias (nível 1+) = valores reais dos lançamentos
  3. Nunca contar o mesmo lançamento duas vezes
  
  ## Impacto
  - Remove duplicações no DRE
  - Valores do DRE passam a bater com o fluxo de caixa
  - Mantém hierarquia de categorias para visualização
*/

-- Remover view antiga
DROP VIEW IF EXISTS vw_dre_consolidado CASCADE;

-- Recriar view sem duplicações
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

-- Lançamentos do fluxo de caixa com categoria
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
    AND fc.origem != 'transferencia' -- Excluir transferências
),

-- Associar cada lançamento à sua categoria (folha da árvore)
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

-- Agregar valores por categoria folha (onde os lançamentos realmente estão)
valores_por_categoria_folha AS (
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

-- Lançamentos sem categoria
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
    AND fc.origem != 'transferencia' -- Excluir transferências
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

-- Calcular totais das categorias raiz (apenas soma das subcategorias)
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
  FROM valores_por_categoria_folha
)

-- UNIÃO FINAL: Apenas categorias folha (onde estão os lançamentos reais)
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
FROM valores_por_categoria_folha
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

-- Adicionar totais de categoria raiz (apenas para visualização hierárquica)
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
