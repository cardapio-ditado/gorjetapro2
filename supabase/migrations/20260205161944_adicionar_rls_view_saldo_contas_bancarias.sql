/*
  # Adicionar RLS para View de Saldo de Contas Bancárias
  
  1. Segurança
    - Criar políticas RLS para permitir leitura da view
    - Usuários autenticados podem visualizar os saldos das contas
*/

-- A view herda as permissões da tabela base, mas vamos garantir acesso
ALTER TABLE bancos_contas ENABLE ROW LEVEL SECURITY;

-- Política para permitir leitura de contas bancárias ativas para usuários autenticados
DROP POLICY IF EXISTS "Usuários autenticados podem ler contas bancárias" ON bancos_contas;
CREATE POLICY "Usuários autenticados podem ler contas bancárias"
  ON bancos_contas FOR SELECT
  TO authenticated
  USING (true);

-- Permitir inserção apenas para usuários autenticados
DROP POLICY IF EXISTS "Usuários autenticados podem inserir contas bancárias" ON bancos_contas;
CREATE POLICY "Usuários autenticados podem inserir contas bancárias"
  ON bancos_contas FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Permitir atualização apenas para usuários autenticados
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar contas bancárias" ON bancos_contas;
CREATE POLICY "Usuários autenticados podem atualizar contas bancárias"
  ON bancos_contas FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Permitir exclusão apenas para usuários autenticados
DROP POLICY IF EXISTS "Usuários autenticados podem excluir contas bancárias" ON bancos_contas;
CREATE POLICY "Usuários autenticados podem excluir contas bancárias"
  ON bancos_contas FOR DELETE
  TO authenticated
  USING (true);