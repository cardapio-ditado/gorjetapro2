/*
  # Funções de Diagnóstico para DRE

  Cria funções que ajudam a diagnosticar discrepâncias entre:
  - Total mostrado na view vw_dre_consolidado
  - Lançamentos individuais no fluxo_caixa
*/

-- Função para listar lançamentos de uma categoria
CREATE OR REPLACE FUNCTION listar_lancamentos_categoria(
  p_categoria_nome_parcial TEXT,
  p_ano INT,
  p_mes INT DEFAULT NULL,
  p_centro_custo_id UUID DEFAULT NULL
)
RETURNS TABLE (
  data DATE,
  descricao TEXT,
  categoria_id UUID,
  categoria_nome TEXT,
  categoria_raiz_nome TEXT,
  centro_custo_id UUID,
  centro_custo TEXT,
  valor NUMERIC,
  tipo TEXT,
  origem TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE categoria_tree AS (
    -- Categorias raiz
    SELECT
      id,
      nome,
      categoria_pai_id,
      id AS raiz_id,
      nome AS raiz_nome
    FROM categorias_financeiras
    WHERE categoria_pai_id IS NULL

    UNION ALL

    -- Subcategorias
    SELECT
      c.id,
      c.nome,
      c.categoria_pai_id,
      ct.raiz_id,
      ct.raiz_nome
    FROM categorias_financeiras c
    JOIN categoria_tree ct ON c.categoria_pai_id = ct.id
  )
  SELECT
    fc.data,
    fc.descricao,
    fc.categoria_id,
    COALESCE(ct.nome, 'Sem Categoria') AS categoria_nome,
    COALESCE(ct.raiz_nome, 'Sem Categoria Raiz') AS categoria_raiz_nome,
    fc.centro_custo_id,
    COALESCE(cc.nome, 'Sem Centro de Custo') AS centro_custo,
    fc.valor,
    fc.tipo,
    fc.origem
  FROM fluxo_caixa fc
  LEFT JOIN categoria_tree ct ON ct.id = fc.categoria_id
  LEFT JOIN centros_custo cc ON cc.id = fc.centro_custo_id
  WHERE EXTRACT(year FROM fc.data) = p_ano
    AND (p_mes IS NULL OR EXTRACT(month FROM fc.data) = p_mes)
    AND (p_centro_custo_id IS NULL OR fc.centro_custo_id = p_centro_custo_id)
    AND fc.origem != 'transferencia'
    AND (
      -- Buscar por nome da categoria ou categoria raiz
      ct.nome ILIKE '%' || p_categoria_nome_parcial || '%'
      OR ct.raiz_nome ILIKE '%' || p_categoria_nome_parcial || '%'
      -- OU se buscar "Sem Categoria", mostrar lançamentos sem categoria
      OR (p_categoria_nome_parcial ILIKE '%sem%' AND fc.categoria_id IS NULL)
      OR (p_categoria_nome_parcial ILIKE '%não%' AND fc.categoria_id IS NULL)
    )
  ORDER BY fc.data DESC, ABS(fc.valor) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para comparar totais (simplificada - retorna apenas os dados do fluxo)
CREATE OR REPLACE FUNCTION somar_lancamentos_categoria(
  p_categoria_raiz_nome TEXT,
  p_ano INT,
  p_mes INT DEFAULT NULL,
  p_centro_custo_id UUID DEFAULT NULL
)
RETURNS TABLE (
  categoria_raiz_nome TEXT,
  total_receitas NUMERIC,
  total_despesas NUMERIC,
  quantidade_total BIGINT,
  quantidade_receitas BIGINT,
  quantidade_despesas BIGINT
) AS $$
BEGIN
  RETURN QUERY
  WITH RECURSIVE categoria_tree AS (
    SELECT
      id,
      nome,
      tipo,
      categoria_pai_id,
      id AS raiz_id,
      nome AS raiz_nome
    FROM categorias_financeiras
    WHERE categoria_pai_id IS NULL

    UNION ALL

    SELECT
      c.id,
      c.nome,
      c.tipo,
      c.categoria_pai_id,
      ct.raiz_id,
      ct.raiz_nome
    FROM categorias_financeiras c
    JOIN categoria_tree ct ON c.categoria_pai_id = ct.id
  )
  SELECT
    COALESCE(ct.raiz_nome, 'Sem Categoria Raiz')::TEXT AS categoria_raiz_nome,
    SUM(CASE WHEN fc.tipo = 'entrada' THEN fc.valor ELSE 0 END) AS total_receitas,
    SUM(CASE WHEN fc.tipo = 'saida' THEN ABS(fc.valor) ELSE 0 END) AS total_despesas,
    COUNT(*)::BIGINT AS quantidade_total,
    COUNT(*) FILTER (WHERE fc.tipo = 'entrada')::BIGINT AS quantidade_receitas,
    COUNT(*) FILTER (WHERE fc.tipo = 'saida')::BIGINT AS quantidade_despesas
  FROM fluxo_caixa fc
  LEFT JOIN categoria_tree ct ON ct.id = fc.categoria_id
  WHERE EXTRACT(year FROM fc.data) = p_ano
    AND (p_mes IS NULL OR EXTRACT(month FROM fc.data) = p_mes)
    AND (p_centro_custo_id IS NULL OR fc.centro_custo_id = p_centro_custo_id)
    AND fc.origem != 'transferencia'
    AND (
      ct.raiz_nome ILIKE '%' || p_categoria_raiz_nome || '%'
      OR (p_categoria_raiz_nome ILIKE '%não class%' AND fc.categoria_id IS NULL)
      OR (p_categoria_raiz_nome ILIKE '%sem categ%' AND fc.categoria_id IS NULL)
    )
  GROUP BY ct.raiz_nome;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Conceder permissões
GRANT EXECUTE ON FUNCTION listar_lancamentos_categoria TO authenticated;
GRANT EXECUTE ON FUNCTION somar_lancamentos_categoria TO authenticated;

-- Comentários com exemplos de uso
COMMENT ON FUNCTION listar_lancamentos_categoria IS '
Lista todos os lançamentos de uma categoria para análise detalhada.

Exemplos:
SELECT * FROM listar_lancamentos_categoria(''Artistas'', 2026);
SELECT * FROM listar_lancamentos_categoria(''Sem Categoria'', 2026, 1);
SELECT SUM(ABS(valor)), COUNT(*) FROM listar_lancamentos_categoria(''Artistas'', 2026);
';

COMMENT ON FUNCTION somar_lancamentos_categoria IS '
Soma os lançamentos reais de uma categoria raiz para comparar com a view.

Exemplos:
SELECT * FROM somar_lancamentos_categoria(''Artistas'', 2026);
SELECT * FROM somar_lancamentos_categoria(''Despesas Não Classificadas'', 2026);
';
