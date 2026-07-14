/*
  # Corrigir RLS para Mapeamentos Excel - Permitir Acesso Anon

  1. Alterações
    - Adiciona políticas para role `anon` além de `authenticated`
    - Permite que usuários não autenticados também possam gerenciar mapeamentos
    - Mantém as políticas existentes para usuários autenticados
  
  2. Segurança
    - Sistema interno então permite acesso anon
    - RLS continua ativo para proteção básica
*/

-- Drop políticas antigas
DROP POLICY IF EXISTS "Usuários autenticados podem ler mapeamentos ativos" ON mapeamentos_itens_excel;
DROP POLICY IF EXISTS "Usuários autenticados podem criar mapeamentos" ON mapeamentos_itens_excel;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar mapeamentos" ON mapeamentos_itens_excel;
DROP POLICY IF EXISTS "Usuários autenticados podem desativar mapeamentos" ON mapeamentos_itens_excel;

-- Criar novas políticas que permitem authenticated e anon
CREATE POLICY "Permitir ler mapeamentos ativos"
  ON mapeamentos_itens_excel
  FOR SELECT
  TO authenticated, anon
  USING (ativo = true);

CREATE POLICY "Permitir criar mapeamentos"
  ON mapeamentos_itens_excel
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Permitir atualizar mapeamentos"
  ON mapeamentos_itens_excel
  FOR UPDATE
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir desativar mapeamentos"
  ON mapeamentos_itens_excel
  FOR DELETE
  TO authenticated, anon
  USING (true);
