/*
  # Corrigir RLS da tabela visao_estrategica_semanas
  
  ## Descrição
  Ajusta as políticas RLS para garantir que usuários autenticados possam
  criar, ler, atualizar e deletar semanas.
  
  ## Problema
  A política atual usa FOR ALL sem WITH CHECK, o que pode bloquear inserções.
  
  ## Solução
  - Remove política antiga
  - Cria políticas específicas para cada operação (SELECT, INSERT, UPDATE, DELETE)
*/

-- Remove política antiga
DROP POLICY IF EXISTS "Permitir acesso a semanas" ON visao_estrategica_semanas;

-- Política de SELECT
CREATE POLICY "Permitir leitura de semanas"
  ON visao_estrategica_semanas FOR SELECT
  TO authenticated
  USING (true);

-- Política de INSERT
CREATE POLICY "Permitir criação de semanas"
  ON visao_estrategica_semanas FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Política de UPDATE
CREATE POLICY "Permitir atualização de semanas"
  ON visao_estrategica_semanas FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Política de DELETE
CREATE POLICY "Permitir exclusão de semanas"
  ON visao_estrategica_semanas FOR DELETE
  TO authenticated
  USING (true);