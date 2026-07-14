/*
  # Corrigir RLS para tabelas financeiras

  1. Alterações
    - Remove políticas restritivas antigas de centros_custo, fornecedores, clientes, etc
    - Adiciona novas políticas separadas para cada operação (SELECT, INSERT, UPDATE, DELETE)
    - Permite que todos os usuários autenticados gerenciem os dados
  
  2. Segurança
    - Mantém RLS ativo em todas as tabelas
    - Permite acesso apenas para usuários autenticados
    - Cada operação tem sua própria política
*/

-- CENTROS DE CUSTO
DROP POLICY IF EXISTS "Gerentes e financeiro podem gerenciar centros de custo" ON centros_custo;

CREATE POLICY "Usuários autenticados podem visualizar centros de custo"
  ON centros_custo FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar centros de custo"
  ON centros_custo FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar centros de custo"
  ON centros_custo FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem excluir centros de custo"
  ON centros_custo FOR DELETE
  TO authenticated
  USING (true);

-- FORNECEDORES
DROP POLICY IF EXISTS "Gerentes e financeiro podem gerenciar fornecedores" ON fornecedores;

CREATE POLICY "Usuários autenticados podem visualizar fornecedores"
  ON fornecedores FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar fornecedores"
  ON fornecedores FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar fornecedores"
  ON fornecedores FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem excluir fornecedores"
  ON fornecedores FOR DELETE
  TO authenticated
  USING (true);

-- CLIENTES
DROP POLICY IF EXISTS "Gerentes e financeiro podem gerenciar clientes" ON clientes;

CREATE POLICY "Usuários autenticados podem visualizar clientes"
  ON clientes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar clientes"
  ON clientes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar clientes"
  ON clientes FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem excluir clientes"
  ON clientes FOR DELETE
  TO authenticated
  USING (true);

-- CATEGORIAS FINANCEIRAS
DROP POLICY IF EXISTS "Gerentes e financeiro podem gerenciar categorias" ON categorias_financeiras;

CREATE POLICY "Usuários autenticados podem visualizar categorias"
  ON categorias_financeiras FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar categorias"
  ON categorias_financeiras FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar categorias"
  ON categorias_financeiras FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem excluir categorias"
  ON categorias_financeiras FOR DELETE
  TO authenticated
  USING (true);

-- FORMAS DE PAGAMENTO
DROP POLICY IF EXISTS "Gerentes e financeiro podem gerenciar formas de pagamento" ON formas_pagamento;

CREATE POLICY "Usuários autenticados podem visualizar formas de pagamento"
  ON formas_pagamento FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar formas de pagamento"
  ON formas_pagamento FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar formas de pagamento"
  ON formas_pagamento FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem excluir formas de pagamento"
  ON formas_pagamento FOR DELETE
  TO authenticated
  USING (true);
