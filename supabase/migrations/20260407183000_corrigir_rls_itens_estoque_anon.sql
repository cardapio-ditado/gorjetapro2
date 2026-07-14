/*
  # Corrigir RLS para Acesso Anônimo aos Itens de Estoque

  1. Correção
    - Corrigir policy de itens_estoque para usar `status = true` (boolean) ao invés de 'ativo' (string)
    - Garantir que todos os acessos necessários estejam funcionando

  2. Segurança
    - Manter acesso restrito apenas a itens ativos
*/

-- Corrigir policy de itens_estoque
DROP POLICY IF EXISTS "Usuários anônimos podem ler itens de estoque" ON itens_estoque;
CREATE POLICY "Usuários anônimos podem ler itens de estoque"
  ON itens_estoque
  FOR SELECT
  TO anon
  USING (status = true);
