/*
  # Adicionar Relatório de Pagamentos Informativos

  ## Descrição
  Cria uma view para relatório diário de pagamentos informativos
  agrupados por data

  ## Mudanças
  1. View para listar pagamentos informativos do dia com detalhes
  2. Função para obter resumo por data
*/

-- View de pagamentos informativos detalhados
CREATE OR REPLACE VIEW v_relatorio_pagamentos_informativos AS
SELECT 
  pi.id,
  pi.conta_pagar_id,
  pi.semana_id,
  pi.valor_pago,
  pi.data_pagamento_informativo,
  pi.observacao,
  pi.criado_em,
  
  -- Dados da conta
  cp.descricao as conta_descricao,
  cp.valor_total as conta_valor_total,
  cp.data_vencimento,
  
  -- Dados do fornecedor
  f.nome as fornecedor_nome,
  
  -- Dados da categoria
  cat.nome as categoria_nome,
  
  -- Dados do centro de custo
  cc.nome as centro_custo_nome,
  
  -- Dados da semana
  s.data_inicio as semana_data_inicio,
  s.faturamento as semana_faturamento

FROM visao_estrategica_pagamentos_informativos pi
LEFT JOIN contas_pagar cp ON cp.id = pi.conta_pagar_id
LEFT JOIN fornecedores f ON f.id = cp.fornecedor_id
LEFT JOIN categorias_financeiras cat ON cat.id = cp.categoria_id
LEFT JOIN centros_custo cc ON cc.id = cp.centro_custo_id
LEFT JOIN visao_estrategica_semanas s ON s.id = pi.semana_id
ORDER BY pi.data_pagamento_informativo DESC, pi.criado_em DESC;

-- Permitir acesso à view
GRANT SELECT ON v_relatorio_pagamentos_informativos TO authenticated, anon;

-- View de resumo por data
CREATE OR REPLACE VIEW v_resumo_pagamentos_informativos_por_data AS
SELECT 
  pi.data_pagamento_informativo,
  COUNT(DISTINCT pi.id) as quantidade_pagamentos,
  SUM(pi.valor_pago) as total_pago,
  COUNT(DISTINCT cp.fornecedor_id) as quantidade_fornecedores,
  COUNT(DISTINCT cp.categoria_id) as quantidade_categorias,
  
  -- Agrupamento por categoria
  json_agg(
    DISTINCT jsonb_build_object(
      'categoria_id', cat.id,
      'categoria_nome', cat.nome,
      'total', (
        SELECT SUM(pi2.valor_pago)
        FROM visao_estrategica_pagamentos_informativos pi2
        LEFT JOIN contas_pagar cp2 ON cp2.id = pi2.conta_pagar_id
        WHERE cp2.categoria_id = cat.id
        AND pi2.data_pagamento_informativo = pi.data_pagamento_informativo
      )
    )
  ) FILTER (WHERE cat.id IS NOT NULL) as por_categoria

FROM visao_estrategica_pagamentos_informativos pi
LEFT JOIN contas_pagar cp ON cp.id = pi.conta_pagar_id
LEFT JOIN categorias_financeiras cat ON cat.id = cp.categoria_id
GROUP BY pi.data_pagamento_informativo
ORDER BY pi.data_pagamento_informativo DESC;

-- Permitir acesso à view
GRANT SELECT ON v_resumo_pagamentos_informativos_por_data TO authenticated, anon;

-- Comentários
COMMENT ON VIEW v_relatorio_pagamentos_informativos IS 'Relatório detalhado de pagamentos informativos com informações completas';
COMMENT ON VIEW v_resumo_pagamentos_informativos_por_data IS 'Resumo diário de pagamentos informativos agrupados por data';
