/*
  # Corrigir RLS da Tabela solicitacoes_anexos
  
  ## Problema
  - Usuários autenticados não conseguem inserir anexos
  - Políticas RLS estão bloqueando operações legítimas
  
  ## Solução
  - Remover todas as políticas existentes
  - Recriar políticas mais permissivas
  - Permitir anônimos também para facilitar uso em solicitações públicas
*/

-- Desabilitar RLS temporariamente
ALTER TABLE solicitacoes_anexos DISABLE ROW LEVEL SECURITY;

-- Remover todas as políticas antigas
DROP POLICY IF EXISTS "Usuários autenticados podem adicionar anexos" ON solicitacoes_anexos;
DROP POLICY IF EXISTS "Usuários autenticados podem ver anexos" ON solicitacoes_anexos;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar anexos" ON solicitacoes_anexos;
DROP POLICY IF EXISTS "Anônimos podem ver anexos de solicitações públicas" ON solicitacoes_anexos;

-- Reabilitar RLS
ALTER TABLE solicitacoes_anexos ENABLE ROW LEVEL SECURITY;

-- Criar políticas permissivas para authenticated
CREATE POLICY "Authenticated: Select all"
  ON solicitacoes_anexos
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated: Insert all"
  ON solicitacoes_anexos
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated: Update all"
  ON solicitacoes_anexos
  FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated: Delete all"
  ON solicitacoes_anexos
  FOR DELETE
  TO authenticated
  USING (true);

-- Criar políticas para anon
CREATE POLICY "Anon: Select public requests"
  ON solicitacoes_anexos
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM solicitacoes s
      WHERE s.id = solicitacao_id
      AND s.origem = 'publico'
    )
  );

CREATE POLICY "Anon: Insert public requests"
  ON solicitacoes_anexos
  FOR INSERT
  TO anon
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM solicitacoes s
      WHERE s.id = solicitacao_id
      AND s.origem = 'publico'
    )
  );
