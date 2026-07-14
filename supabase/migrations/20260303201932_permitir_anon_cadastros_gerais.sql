/*
  # Permitir acesso anon para cadastros gerais

  1. Alterações
    - Adiciona políticas para role anon em todas as tabelas de cadastros gerais
    - Permite que o sistema use seu próprio controle de acesso via AuthContext
  
  2. Segurança
    - O controle de acesso é feito pela camada de aplicação (AuthContext)
    - RLS continua ativo para outras proteções
*/

-- BANCOS E CONTAS
CREATE POLICY "Anon pode visualizar bancos e contas"
  ON bancos_contas FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon pode criar bancos e contas"
  ON bancos_contas FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon pode atualizar bancos e contas"
  ON bancos_contas FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon pode excluir bancos e contas"
  ON bancos_contas FOR DELETE
  TO anon
  USING (true);

-- CENTROS DE CUSTO
CREATE POLICY "Anon pode visualizar centros de custo"
  ON centros_custo FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon pode criar centros de custo"
  ON centros_custo FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon pode atualizar centros de custo"
  ON centros_custo FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon pode excluir centros de custo"
  ON centros_custo FOR DELETE
  TO anon
  USING (true);

-- FORNECEDORES
CREATE POLICY "Anon pode visualizar fornecedores"
  ON fornecedores FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon pode criar fornecedores"
  ON fornecedores FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon pode atualizar fornecedores"
  ON fornecedores FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon pode excluir fornecedores"
  ON fornecedores FOR DELETE
  TO anon
  USING (true);

-- CLIENTES
CREATE POLICY "Anon pode visualizar clientes"
  ON clientes FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon pode criar clientes"
  ON clientes FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon pode atualizar clientes"
  ON clientes FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon pode excluir clientes"
  ON clientes FOR DELETE
  TO anon
  USING (true);

-- CATEGORIAS FINANCEIRAS
CREATE POLICY "Anon pode visualizar categorias"
  ON categorias_financeiras FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon pode criar categorias"
  ON categorias_financeiras FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon pode atualizar categorias"
  ON categorias_financeiras FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon pode excluir categorias"
  ON categorias_financeiras FOR DELETE
  TO anon
  USING (true);

-- FORMAS DE PAGAMENTO
CREATE POLICY "Anon pode visualizar formas de pagamento"
  ON formas_pagamento FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon pode criar formas de pagamento"
  ON formas_pagamento FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon pode atualizar formas de pagamento"
  ON formas_pagamento FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon pode excluir formas de pagamento"
  ON formas_pagamento FOR DELETE
  TO anon
  USING (true);
