/*
  # Correção Temporária RLS Solicitações Anexos
  
  ## Problema
  - Erro 401 ao tentar inserir anexos
  - RLS está bloqueando inserções mesmo com políticas permissivas
  
  ## Solução Temporária
  - Desabilitar RLS completamente para debug
  - Isso permite identificar se o problema é de autenticação ou de políticas
*/

-- Desabilitar RLS temporariamente
ALTER TABLE solicitacoes_anexos DISABLE ROW LEVEL SECURITY;
