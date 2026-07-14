/*
  # Corrigir RLS para bancos_contas

  1. Alterações
    - Remove política restritiva antiga
    - Adiciona novas políticas separadas para SELECT, INSERT, UPDATE, DELETE
    - Permite que todos os usuários autenticados gerenciem bancos e contas
  
  2. Segurança
    - Mantém RLS ativo
    - Permite acesso apenas para usuários autenticados
    - Cada operação tem sua própria política
*/

-- Remove política antiga restritiva
DROP POLICY IF EXISTS "Gerentes e financeiro podem gerenciar bancos e contas" ON bancos_contas;

-- Cria políticas granulares para cada operação
CREATE POLICY "Usuários autenticados podem visualizar bancos e contas"
  ON bancos_contas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar bancos e contas"
  ON bancos_contas FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar bancos e contas"
  ON bancos_contas FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem excluir bancos e contas"
  ON bancos_contas FOR DELETE
  TO authenticated
  USING (true);
