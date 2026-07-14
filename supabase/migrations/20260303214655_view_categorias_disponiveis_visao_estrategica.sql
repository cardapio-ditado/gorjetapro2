/*
  # View de Categorias Disponíveis para Visão Estratégica
  
  ## Descrição
  Cria uma view para mostrar categorias financeiras que ainda não foram
  configuradas na Visão Estratégica, facilitando a seleção de novas
  categorias para adicionar.
  
  ## Views Criadas
  1. v_categorias_disponiveis_ve - Categorias de despesa não configuradas
  
  ## Segurança
  - RLS habilitado com acesso para usuários autenticados
*/

-- View para listar categorias financeiras disponíveis (não configuradas)
CREATE OR REPLACE VIEW v_categorias_disponiveis_ve AS
SELECT 
  cf.id,
  cf.nome,
  cf.tipo,
  cf.descricao,
  cf.ordem,
  EXISTS(
    SELECT 1 FROM categorias_financeiras sub 
    WHERE sub.categoria_pai_id = cf.id 
    AND sub.status = 'ativo'
  ) as tem_filhas
FROM categorias_financeiras cf
LEFT JOIN visao_estrategica_categorias_config vc ON cf.id = vc.categoria_financeira_id
WHERE cf.tipo = 'despesa'
  AND cf.status = 'ativo'
  AND cf.categoria_pai_id IS NULL
  AND vc.id IS NULL  -- Não está configurada
ORDER BY cf.ordem, cf.nome;

-- RLS para a view
ALTER VIEW v_categorias_disponiveis_ve OWNER TO postgres;

GRANT SELECT ON v_categorias_disponiveis_ve TO authenticated;

COMMENT ON VIEW v_categorias_disponiveis_ve IS 'Categorias financeiras de despesa disponíveis para configuração na Visão Estratégica';
