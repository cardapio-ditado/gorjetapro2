
/*
  # Corrigir DRE para incluir categorias PAI com valores diretos

  Problema identificado:
  - Alguns lançamentos foram feitos em categorias PAI (que tem subcategorias)
  - A função DRE mostrava apenas categorias FOLHA
  - Isso causava valores "perdidos" no DRE

  Solução:
  - Modificar função para incluir TODAS as categorias que tenham valores
  - Criar função auxiliar para identificar lançamentos em categorias PAI
  - Adicionar indicador de categoria PAI vs FOLHA no resultado
*/

DROP FUNCTION IF EXISTS obter_dre_periodo(date, date, uuid);

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
  eh_categoria_folha boolean,
  tem_valor_direto boolean
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
  -- Resultado: TODAS as categorias que tem valores (folha OU pai)
  SELECT 
    ct.cat_tipo::text as tipo_categoria,
    ct.categoria_raiz_nome::text as categoria_principal,
    ct.nome::text as categoria_nome,
    ct.cat_nivel as nivel,
    COALESCE(vpc.valor_liquido, 0) as valor_total,
    ct.eh_folha as eh_categoria_folha,
    (vpc.valor_liquido IS NOT NULL) as tem_valor_direto
  FROM categoria_tree ct
  LEFT JOIN valores_por_categoria vpc ON ct.id = vpc.categoria_id
  WHERE COALESCE(vpc.valor_liquido, 0) != 0  -- Apenas categorias com valores
  ORDER BY ct.cat_tipo, ct.cat_nivel, ct.categoria_raiz_nome, ct.nome;
END;
$$;

-- Função para identificar lançamentos em categorias PAI (possível problema)
CREATE OR REPLACE FUNCTION listar_lancamentos_categoria_pai(
  p_data_inicial date DEFAULT NULL,
  p_data_final date DEFAULT NULL
)
RETURNS TABLE(
  data date,
  descricao text,
  categoria_nome text,
  categoria_tem_filhas boolean,
  valor numeric,
  tipo text,
  origem text
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    fc.data,
    fc.descricao,
    c.nome as categoria_nome,
    EXISTS (
      SELECT 1 FROM categorias_financeiras cf 
      WHERE cf.categoria_pai_id = c.id AND cf.status = 'ativo'
    ) as categoria_tem_filhas,
    fc.valor,
    fc.tipo,
    fc.origem
  FROM fluxo_caixa fc
  JOIN categorias_financeiras c ON c.id = fc.categoria_id
  WHERE (p_data_inicial IS NULL OR fc.data >= p_data_inicial)
    AND (p_data_final IS NULL OR fc.data <= p_data_final)
    AND EXISTS (
      SELECT 1 FROM categorias_financeiras cf 
      WHERE cf.categoria_pai_id = c.id AND cf.status = 'ativo'
    )
  ORDER BY fc.data DESC, fc.valor DESC;
END;
$$;

COMMENT ON FUNCTION listar_lancamentos_categoria_pai IS 'Identifica lançamentos feitos em categorias PAI (que possuem subcategorias). Isso pode indicar erro de categorização.';
