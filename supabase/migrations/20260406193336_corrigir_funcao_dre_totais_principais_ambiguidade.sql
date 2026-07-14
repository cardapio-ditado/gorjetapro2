
/*
  # Corrigir ambiguidade na função obter_dre_totais_principais

  Correções:
  1. Usa aliases para evitar ambiguidade de nomes
*/

DROP FUNCTION IF EXISTS obter_dre_totais_principais(date, date, uuid);

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
    dre.tipo_categoria,
    dre.categoria_principal,
    SUM(dre.valor_total) as valor_total
  FROM obter_dre_periodo(p_data_inicial, p_data_final, p_centro_custo_id) as dre
  GROUP BY dre.tipo_categoria, dre.categoria_principal
  ORDER BY dre.tipo_categoria, dre.categoria_principal;
END;
$$;
