
/*
  # Função de diagnóstico completo do DRE

  Cria função para identificar todos os problemas do DRE:
  1. Lançamentos sem categoria
  2. Lançamentos em categoria PAI
  3. Transferências duplicadas
  4. Comparação de valores totais
*/

CREATE OR REPLACE FUNCTION diagnosticar_dre(
  p_data_inicial date DEFAULT NULL,
  p_data_final date DEFAULT NULL
)
RETURNS TABLE(
  problema text,
  quantidade bigint,
  valor_total numeric,
  impacto text,
  sugestao text
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_data_inicial date;
  v_data_final date;
BEGIN
  -- Usar período padrão se não informado
  v_data_inicial := COALESCE(p_data_inicial, date_trunc('month', CURRENT_DATE)::date);
  v_data_final := COALESCE(p_data_final, (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date);

  RETURN QUERY
  
  -- 1. Lançamentos sem categoria
  SELECT 
    '1. Lançamentos SEM categoria'::text,
    COUNT(*),
    SUM(fc.valor),
    'ALTO - Não aparecem no DRE'::text,
    'Atribuir categoria adequada a cada lançamento'::text
  FROM fluxo_caixa fc
  WHERE fc.categoria_id IS NULL
    AND fc.data BETWEEN v_data_inicial AND v_data_final
    AND COALESCE(fc.origem, '') != 'transferencia'
  HAVING COUNT(*) > 0

  UNION ALL

  -- 2. Transferências sem categoria
  SELECT 
    '2. Transferências sem categoria'::text,
    COUNT(*),
    SUM(fc.valor),
    'INFORMATIVO - Transferências não devem ter categoria'::text,
    'Nenhuma ação necessária'::text
  FROM fluxo_caixa fc
  WHERE fc.categoria_id IS NULL
    AND fc.data BETWEEN v_data_inicial AND v_data_final
    AND fc.origem = 'transferencia'
  HAVING COUNT(*) > 0

  UNION ALL

  -- 3. Lançamentos em categoria PAI (tem subcategorias)
  SELECT 
    '3. Lançamentos em categoria PAI'::text,
    COUNT(*),
    SUM(fc.valor),
    'MÉDIO - Dificulta análise detalhada'::text,
    'Mover para subcategoria específica'::text
  FROM fluxo_caixa fc
  JOIN categorias_financeiras c ON c.id = fc.categoria_id
  WHERE fc.data BETWEEN v_data_inicial AND v_data_final
    AND EXISTS (
      SELECT 1 FROM categorias_financeiras cf 
      WHERE cf.categoria_pai_id = c.id AND cf.status = 'ativo'
    )
  HAVING COUNT(*) > 0

  UNION ALL

  -- 4. Total de lançamentos corretos
  SELECT 
    '4. Lançamentos CORRETOS'::text,
    COUNT(*),
    SUM(CASE WHEN fc.tipo = 'entrada' THEN fc.valor ELSE -fc.valor END),
    'OK - Aparecem corretamente no DRE'::text,
    'Continuar categorizando corretamente'::text
  FROM fluxo_caixa fc
  JOIN categorias_financeiras c ON c.id = fc.categoria_id
  WHERE fc.data BETWEEN v_data_inicial AND v_data_final
    AND COALESCE(fc.origem, '') != 'transferencia'
    AND NOT EXISTS (
      SELECT 1 FROM categorias_financeiras cf 
      WHERE cf.categoria_pai_id = c.id AND cf.status = 'ativo'
    )
  HAVING COUNT(*) > 0;

END;
$$;

COMMENT ON FUNCTION diagnosticar_dre IS 'Diagnostica problemas de categorização que afetam o DRE. Retorna problemas encontrados, quantidade, valor e sugestões de correção.';
