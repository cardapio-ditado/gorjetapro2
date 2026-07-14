/*
  # Corrigir RLS para Itens de Contagens de Estoque
  
  1. Alterações
    - Adicionar políticas para usuários anônimos (anon)
    - Permitir operações em itens de contagem para desenvolvimento
  
  2. Segurança
    - Mantém RLS habilitado
    - Adiciona políticas para anon e authenticated
*/

-- Remover políticas existentes
DROP POLICY IF EXISTS "Usuários podem visualizar itens contados" ON contagens_estoque_itens;
DROP POLICY IF EXISTS "Usuários podem inserir itens contados" ON contagens_estoque_itens;
DROP POLICY IF EXISTS "Usuários podem atualizar itens contados" ON contagens_estoque_itens;
DROP POLICY IF EXISTS "Usuários podem deletar itens contados" ON contagens_estoque_itens;

-- Política de SELECT para todos
CREATE POLICY "Permitir visualizar itens contados"
  ON contagens_estoque_itens
  FOR SELECT
  TO anon, authenticated
  USING (true);

-- Política de INSERT para todos
CREATE POLICY "Permitir inserir itens contados"
  ON contagens_estoque_itens
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Política de UPDATE para todos
CREATE POLICY "Permitir atualizar itens contados"
  ON contagens_estoque_itens
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Política de DELETE para todos
CREATE POLICY "Permitir deletar itens contados"
  ON contagens_estoque_itens
  FOR DELETE
  TO anon, authenticated
  USING (true);
