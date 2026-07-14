/*
  # Corrigir RLS das Tabelas de Produção

  ## Alterações
  
  Remove e recria as políticas RLS das tabelas relacionadas à produção para permitir
  operações corretas por usuários autenticados.

  ### Tabelas Afetadas
  - producao_reserva_insumos
  - producao_transferencias  
  - producao_desperdicios

  ### Políticas
  - SELECT: Permitir visualização para usuários autenticados
  - INSERT: Permitir inserção para usuários autenticados
  - UPDATE: Permitir atualização para usuários autenticados
  - DELETE: Permitir exclusão para usuários autenticados
*/

-- ============================================
-- TABELA: producao_reserva_insumos
-- ============================================

-- Remover políticas antigas
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar reservas" ON producao_reserva_insumos;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir reservas" ON producao_reserva_insumos;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar reservas" ON producao_reserva_insumos;
DROP POLICY IF EXISTS "Usuários autenticados podem excluir reservas" ON producao_reserva_insumos;

-- Criar novas políticas
CREATE POLICY "Autenticados podem visualizar reservas"
  ON producao_reserva_insumos
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Autenticados podem inserir reservas"
  ON producao_reserva_insumos
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Autenticados podem atualizar reservas"
  ON producao_reserva_insumos
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Autenticados podem excluir reservas"
  ON producao_reserva_insumos
  FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- TABELA: producao_transferencias
-- ============================================

-- Remover políticas antigas
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar transferências" ON producao_transferencias;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir transferências" ON producao_transferencias;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar transferências" ON producao_transferencias;
DROP POLICY IF EXISTS "Usuários autenticados podem excluir transferências" ON producao_transferencias;

-- Criar novas políticas
CREATE POLICY "Autenticados podem visualizar transferências"
  ON producao_transferencias
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Autenticados podem inserir transferências"
  ON producao_transferencias
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Autenticados podem atualizar transferências"
  ON producao_transferencias
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Autenticados podem excluir transferências"
  ON producao_transferencias
  FOR DELETE
  TO authenticated
  USING (true);

-- ============================================
-- TABELA: producao_desperdicios
-- ============================================

-- Remover políticas antigas
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar desperdícios" ON producao_desperdicios;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir desperdícios" ON producao_desperdicios;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar desperdícios" ON producao_desperdicios;
DROP POLICY IF EXISTS "Usuários autenticados podem excluir desperdícios" ON producao_desperdicios;

-- Criar novas políticas
CREATE POLICY "Autenticados podem visualizar desperdícios"
  ON producao_desperdicios
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Autenticados podem inserir desperdícios"
  ON producao_desperdicios
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Autenticados podem atualizar desperdícios"
  ON producao_desperdicios
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Autenticados podem excluir desperdícios"
  ON producao_desperdicios
  FOR DELETE
  TO authenticated
  USING (true);
