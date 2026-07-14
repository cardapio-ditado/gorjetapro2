/*
  # Permitir acesso às views de lista de compras

  ## Problema
  
  As views vw_lista_compras_rua e vw_lista_compras_fornecedor foram criadas
  mas não têm RLS configurado.
  
  ## Solução
  
  Criar policies para permitir acesso authenticated às views.
*/

-- Dar permissão de SELECT nas views
GRANT SELECT ON vw_lista_compras_rua TO authenticated;
GRANT SELECT ON vw_lista_compras_fornecedor TO authenticated;
GRANT SELECT ON vw_lista_compras_rua TO anon;
GRANT SELECT ON vw_lista_compras_fornecedor TO anon;
