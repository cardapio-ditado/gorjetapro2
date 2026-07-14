/*
  # Corrigir View DRE - Simplificar para Evitar Confusão com Centros de Custo

  ## Problema Identificado
  A view vw_dre_consolidado separa lançamentos por centro de custo,
  criando múltiplas linhas para a mesma categoria.
  
  Isso causa confusão no relatório PDF pois:
  1. View retorna N linhas (uma por centro)
  2. Frontend tenta consolidar mas gera diferenças
  3. Mensagens de erro aparecem no rodapé
  
  ## Solução
  Modificar a view para AGREGAR todos os centros de custo em uma única linha.
  O centro de custo ainda estará disponível nos lançamentos detalhados.
  
  Isso simplifica o DRE e evita diferenças artificiais.
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

-- Lançamentos diretos em categoria raiz (nível 0)
-- Aparecem como "Outros" no nível 1
-- AGREGA TODOS OS CENTROS DE CUSTO
lancamentos_diretos_raiz AS (
  SELECT 
    categoria_raiz_id,
    categoria_raiz_nome,
    gen_random_uuid() AS categoria_id,
    'Outros' AS categoria_nome,
    tipo,
    1 AS nivel,
    NULL::uuid AS centro_custo_id,  -- NULL = todos os centros agregados
    ano,
    mes,
    SUM(valor_ajustado) AS valor_total,
    COUNT(lancamento_id) AS quantidade_lancamentos
  FROM lancamentos_com_hierarquia
  WHERE nivel = 0
  GROUP BY 
    categoria_raiz_id,
    categoria_raiz_nome,
    tipo,
    ano,
    mes
  HAVING SUM(valor_ajustado) != 0 OR COUNT(lancamento_id) > 0
),

-- Lançamentos em subcategorias (nível 1+)  
-- AGREGA TODOS OS CENTROS DE CUSTO
lancamentos_subcategorias AS (
  SELECT 
    categoria_raiz_id,
    categoria_raiz_nome,
    categoria_id,
    categoria_nome,
    tipo,
    nivel,
    NULL::uuid AS centro_custo_id,  -- NULL = todos os centros agregados
    ano,
    mes,
    SUM(valor_ajustado) AS valor_total,
    COUNT(lancamento_id) AS quantidade_lancamentos
  FROM lancamentos_com_hierarquia
  WHERE nivel > 0
  GROUP BY 
    categoria_raiz_id,
    categoria_raiz_nome,
    categoria_id,
    categoria_nome,
    tipo,
    nivel,
    ano,
    mes
  HAVING SUM(valor_ajustado) != 0 OR COUNT(lancamento_id) > 0
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
-- AGREGA TODOS OS CENTROS DE CUSTO
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
    NULL::uuid AS centro_custo_id,  -- NULL = todos os centros agregados
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
    ano,
    mes
  HAVING SUM(
    CASE 
      WHEN tipo_categoria = 'receita' THEN valor
      ELSE -ABS(valor)
    END
  ) != 0 OR COUNT(*) > 0
)

-- UNIÃO FINAL: Uma linha por categoria por mês/ano
-- SEM separação por centro de custo
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
FROM lancamentos_subcategorias

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
FROM lancamentos_diretos_raiz

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

COMMENT ON VIEW vw_dre_consolidado IS 'DRE consolidado agregando TODOS os centros de custo em uma única linha por categoria. Elimina duplicação e diferenças artificiais.';
