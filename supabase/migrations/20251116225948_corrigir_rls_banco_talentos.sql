/*
  # Corrigir políticas RLS do Banco de Talentos

  1. Alterações
    - Remover políticas restritivas existentes
    - Adicionar políticas mais permissivas para authenticated users
*/

-- Remover políticas existentes
DROP POLICY IF EXISTS "Authenticated users can view banco_talentos" ON banco_talentos;
DROP POLICY IF EXISTS "Authenticated users can insert banco_talentos" ON banco_talentos;
DROP POLICY IF EXISTS "Authenticated users can update banco_talentos" ON banco_talentos;
DROP POLICY IF EXISTS "Authenticated users can delete banco_talentos" ON banco_talentos;

-- Criar novas políticas mais permissivas
CREATE POLICY "Allow authenticated users to view banco_talentos"
  ON banco_talentos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow authenticated users to insert banco_talentos"
  ON banco_talentos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to update banco_talentos"
  ON banco_talentos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow authenticated users to delete banco_talentos"
  ON banco_talentos FOR DELETE
  TO authenticated
  USING (true);
