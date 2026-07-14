/*
  # Corrigir RLS para Contagens de Estoque
  
  1. Alterações
    - Adicionar políticas para usuários anônimos (anon)
    - Permitir operações de contagem para desenvolvimento
  
  2. Segurança
    - Mantém RLS habilitado
    - Adiciona políticas para anon e authenticated
*/

-- Remover políticas existentes se necessário
DROP POLICY IF EXISTS "Usuários podem visualizar contagens" ON contagens_estoque;
DROP POLICY IF EXISTS "Usuários podem criar contagens" ON contagens_estoque;
DROP POLICY IF EXISTS "Usuários podem atualizar contagens" ON contagens_estoque;

-- Política de SELECT para todos
CREATE POLICY "Permitir visualizar contagens"
  ON contagens_estoque
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Política de INSERT para todos
CREATE POLICY "Permitir criar contagens"
  ON contagens_estoque
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Política de UPDATE para todos
CREATE POLICY "Permitir atualizar contagens"
  ON contagens_estoque
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Política de DELETE para todos
CREATE POLICY "Permitir deletar contagens"
  ON contagens_estoque
  FOR DELETE
  TO anon, authenticated
  USING (true);
