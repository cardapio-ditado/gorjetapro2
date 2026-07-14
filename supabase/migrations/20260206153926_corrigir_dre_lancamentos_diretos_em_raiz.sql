/*
  # Corrigir DRE - Lançamentos Diretos em Categoria Raiz

  ## Problema Identificado
  Quando uma categoria raiz tem lançamentos diretos E subcategorias, a view mostra:
  - Nível 0: Categoria raiz com lançamentos diretos = R$ 5.199,24
  - Nível 1: Subcategoria = R$ 51.532,49
  
  Ao somar: R$ 5.199,24 + R$ 51.532,49 = R$ 56.731,73
  
  Mas o usuário espera que a categoria raiz mostre o TOTAL (R$ 56.731,73)
  e os lançamentos diretos apareçam como uma subcategoria separada.

  ## Solução
  Modificar a view para:
  1. Lançamentos diretos em categoria raiz aparecem como nível 1 "Outros"
  2. Criar totalizadores de nível 0 que somam TODAS as subcategorias
  3. Garantir que a hierarquia seja consistente e somável

  ## Estrutura Final
  ```
  Artistas e Eventos (nível 0) = R$ 56.731,73 [TOTALIZADOR]
    ├─ Cachê de Músicos (nível 1) = R$ 51.532,49
    └─ Outros (nível 1) = R$ 5.199,24 [lançamentos diretos da raiz]
  ```

  ## Impacto
  - Totais consistentes e somáveis
  - Hierarquia clara e intuitiva
  - Elimina confusão na apresentação dos dados
*/

DROP VIEW IF EXISTS vw_dre_consolidado CASCADE;

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
    0 AS nivel
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
    ct.nivel + 1
  FROM categorias_financeiras c
  JOIN categoria_tree ct ON c.categoria_pai_id = ct.id
  WHERE c.status = 'ativo'
),

-- Lançamentos do fluxo de caixa
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

-- Associar lançamentos com hierarquia
lancamentos_com_hierarquia AS (
  SELECT 
    lc.id AS lancamento_id,
    ct.id AS categoria_id,
    ct.nome AS categoria_nome,
    ct.categoria_pai_id,
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

-- Separar lançamentos diretos de categoria raiz (nível 0) 
-- para aparecerem como "Outros" no nível 1
lancamentos_diretos_raiz AS (
  SELECT 
    categoria_raiz_id,
    categoria_raiz_nome,
    gen_random_uuid() AS categoria_outros_id,
    'Outros' AS categoria_nome,
    tipo,
    1 AS nivel,  -- Forçar nível 1
    centro_custo_id,
    ano,
    mes,
    SUM(valor_ajustado) AS valor_total,
    COUNT(lancamento_id) AS quantidade_lancamentos
  FROM lancamentos_com_hierarquia
  WHERE nivel = 0  -- Lançamentos diretos na raiz
  GROUP BY 
    categoria_raiz_id,
    categoria_raiz_nome,
    tipo,
    centro_custo_id,
    ano,
    mes
  HAVING SUM(valor_ajustado) != 0 OR COUNT(lancamento_id) > 0
),

-- Lançamentos em subcategorias (nível 1+)
lancamentos_subcategorias AS (
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
    SUM(valor_ajustado) AS valor_total,
    COUNT(lancamento_id) AS quantidade_lancamentos
  FROM lancamentos_com_hierarquia
  WHERE nivel > 0  -- Apenas subcategorias
  GROUP BY 
    categoria_raiz_id,
    categoria_raiz_nome,
    categoria_id,
    categoria_nome,
    tipo,
    nivel,
    centro_custo_id,
    ano,
    mes
  HAVING SUM(valor_ajustado) != 0 OR COUNT(lancamento_id) > 0
),

-- UNIÃO de subcategorias reais + "Outros" (lançamentos diretos)
todas_subcategorias AS (
  SELECT * FROM lancamentos_subcategorias
  UNION ALL
  SELECT 
    categoria_raiz_id,
    categoria_raiz_nome,
    categoria_outros_id AS categoria_id,
    categoria_nome,
    tipo,
    nivel,
    centro_custo_id,
    ano,
    mes,
    valor_total,
    quantidade_lancamentos
  FROM lancamentos_diretos_raiz
),

-- Criar totalizadores de nível 0 (categoria raiz)
totalizadores_raiz AS (
  SELECT 
    categoria_raiz_id,
    categoria_raiz_nome,
    categoria_raiz_id AS categoria_id,  -- ID da própria raiz
    categoria_raiz_nome AS categoria_nome,  -- Nome da própria raiz
    tipo,
    0 AS nivel,  -- Nível 0 = totalizador
    centro_custo_id,
    ano,
    mes,
    SUM(valor_total) AS valor_total,  -- Soma todas as subcategorias
    SUM(quantidade_lancamentos) AS quantidade_lancamentos
  FROM todas_subcategorias
  GROUP BY 
    categoria_raiz_id,
    categoria_raiz_nome,
    tipo,
    centro_custo_id,
    ano,
    mes
  HAVING SUM(valor_total) != 0 OR SUM(quantidade_lancamentos) > 0
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
    AND fc.origem != 'transferencia'
),

-- Agregar não classificados
lancamentos_nao_classificados AS (
  SELECT 
    gen_random_uuid() AS categoria_raiz_id,
    CASE 
      WHEN tipo_categoria = 'receita' THEN 'Receitas Não Classificadas'
      ELSE 'Despesas Não Classificadas'
    END AS categoria_raiz_nome,
    gen_random_uuid() AS categoria_id,
    'Lançamentos Não Classificados' AS categoria_nome,
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
  HAVING SUM(
    CASE 
      WHEN tipo_categoria = 'receita' THEN valor
      ELSE -ABS(valor)
    END
  ) != 0 OR COUNT(*) > 0
)

-- UNIÃO FINAL: Totalizadores (nível 0) + Subcategorias (nível 1+)
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
FROM totalizadores_raiz

UNION ALL

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
FROM todas_subcategorias

UNION ALL

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

ORDER BY tipo, categoria_raiz_nome, nivel, categoria_nome;

-- Conceder permissões
GRANT SELECT ON vw_dre_consolidado TO authenticated;
GRANT SELECT ON vw_dre_consolidado TO anon;

-- Comentário
COMMENT ON VIEW vw_dre_consolidado IS 'DRE consolidado com hierarquia consistente: nível 0 = totalizadores, nível 1+ = detalhamento';
