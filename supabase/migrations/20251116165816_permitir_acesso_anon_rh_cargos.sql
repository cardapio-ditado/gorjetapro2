/*
  # Permitir acesso anônimo aos cargos para desenvolvimento

  1. Alterações
    - Adicionar policy para permitir acesso anônimo de leitura na tabela rh_cargos
    - Adicionar policy para permitir acesso anônimo de leitura na tabela rh_vagas
    - Adicionar policy para permitir acesso anônimo de escrita na tabela rh_vagas
    - Adicionar policy para permitir acesso anônimo de escrita na tabela rh_candidaturas

  2. Segurança
    - Apenas para desenvolvimento
    - Deve ser removido em produção com autenticação real
*/

-- Permitir leitura anônima de cargos
DROP POLICY IF EXISTS "Permitir leitura anônima de cargos" ON rh_cargos;
CREATE POLICY "Permitir leitura anônima de cargos"
  ON rh_cargos
  FOR SELECT
  TO anon
  USING (true);

-- Permitir leitura anônima de vagas
DROP POLICY IF EXISTS "Permitir leitura anônima de vagas" ON rh_vagas;
CREATE POLICY "Permitir leitura anônima de vagas"
  ON rh_vagas
  FOR SELECT
  TO anon
  USING (true);

-- Permitir escrita anônima de vagas
DROP POLICY IF EXISTS "Permitir escrita anônima de vagas" ON rh_vagas;
CREATE POLICY "Permitir escrita anônima de vagas"
  ON rh_vagas
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);

-- Permitir leitura anônima de candidaturas
DROP POLICY IF EXISTS "Permitir leitura anônima de candidaturas" ON rh_candidaturas;
CREATE POLICY "Permitir leitura anônima de candidaturas"
  ON rh_candidaturas
  FOR SELECT
  TO anon
  USING (true);

-- Permitir escrita anônima de candidaturas
DROP POLICY IF EXISTS "Permitir escrita anônima de candidaturas" ON rh_candidaturas;
CREATE POLICY "Permitir escrita anônima de candidaturas"
  ON rh_candidaturas
  FOR ALL
  TO anon
  USING (true)
  WITH CHECK (true);