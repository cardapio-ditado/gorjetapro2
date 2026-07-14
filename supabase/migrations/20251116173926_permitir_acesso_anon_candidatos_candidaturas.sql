/*
  # Permitir acesso anônimo aos candidatos e candidaturas

  1. Alterações
    - Adicionar policies para permitir acesso anônimo de leitura e escrita na tabela rh_candidatos
    - Adicionar policies para permitir acesso anônimo de leitura e escrita na tabela rh_candidaturas
    
  2. Segurança
    - Apenas para desenvolvimento
    - Deve ser removido em produção com autenticação real
*/

-- Permitir acesso anônimo completo a rh_candidatos
DROP POLICY IF EXISTS "Permitir acesso anônimo a candidatos" ON rh_candidatos;
CREATE POLICY "Permitir acesso anônimo a candidatos"
  ON rh_candidatos
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Permitir acesso anônimo completo a rh_candidaturas
DROP POLICY IF EXISTS "Permitir acesso anônimo a candidaturas" ON rh_candidaturas;
CREATE POLICY "Permitir acesso anônimo a candidaturas"
  ON rh_candidaturas
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);