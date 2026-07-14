/*
  # Criar Função para Agrupar Pagamentos por Categoria e Semana

  ## Descrição
  Cria uma função RPC que retorna os pagamentos informativos agrupados por categoria
  para uma semana específica. Isso melhora a performance e simplifica o cálculo de gastos
  no dashboard da Visão Estratégica.

  ## Funcionalidade
  - Agrupa pagamentos informativos por categoria_id e categoria_pai_id
  - Filtra por semana específica
  - Retorna soma total de pagamentos por categoria
  - Usado no dashboard para calcular gastos em tempo real

  ## Retorno
  Tabela com:
  - semana_id: ID da semana
  - categoria_id: ID da categoria da despesa
  - categoria_pai_id: ID da categoria pai (se for subcategoria)
  - total_pago: Soma total pago nesta categoria/semana
*/

CREATE OR REPLACE FUNCTION get_pagamentos_por_categoria_semana(
  p_semana_id uuid
)
RETURNS TABLE (
  semana_id uuid,
  categoria_id uuid,
  categoria_pai_id uuid,
  total_pago numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    pi.semana_id,
    cp.categoria_id,
    cf.categoria_pai_id,
    SUM(pi.valor_pago) as total_pago
  FROM visao_estrategica_pagamentos_informativos pi
  INNER JOIN contas_pagar cp ON cp.id = pi.conta_pagar_id  
  LEFT JOIN categorias_financeiras cf ON cf.id = cp.categoria_id
  WHERE pi.semana_id = p_semana_id
  GROUP BY pi.semana_id, cp.categoria_id, cf.categoria_pai_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION get_pagamentos_por_categoria_semana TO authenticated, anon;

COMMENT ON FUNCTION get_pagamentos_por_categoria_semana IS 'Retorna pagamentos informativos agrupados por categoria para uma semana específica. Usado para calcular gastos no dashboard.';
