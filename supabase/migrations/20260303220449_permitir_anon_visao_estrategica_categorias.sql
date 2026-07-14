/*
  # Permitir Acesso Anônimo às Configurações de Categorias
  
  ## Resumo
  Ajusta as políticas de Row Level Security da tabela `visao_estrategica_categorias_config`
  para permitir que usuários anônimos (desenvolvimento) e autenticados possam gerenciar
  as configurações de categorias.
  
  ## Mudanças
  1. Remove políticas antigas que só permitiam usuários autenticados
  2. Cria novas políticas permitindo tanto `authenticated` quanto `anon`
  3. Políticas separadas para cada operação (SELECT, INSERT, UPDATE, DELETE)
  
  ## Segurança
  - Permite acesso completo para usuários autenticados e anônimos
  - Necessário para desenvolvimento com usuário temporário
*/

-- Remover políticas antigas
DROP POLICY IF EXISTS "Usuários autenticados podem ler config categorias" ON visao_estrategica_categorias_config;
DROP POLICY IF EXISTS "Usuários autenticados podem inserir config categorias" ON visao_estrategica_categorias_config;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar config categorias" ON visao_estrategica_categorias_config;
DROP POLICY IF EXISTS "Usuários autenticados podem excluir config categorias" ON visao_estrategica_categorias_config;

-- Criar políticas que permitem authenticated e anon
CREATE POLICY "Permitir leitura config categorias"
  ON visao_estrategica_categorias_config FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Permitir inserção config categorias"
  ON visao_estrategica_categorias_config FOR INSERT
  TO authenticated, anon
  WITH CHECK (true);

CREATE POLICY "Permitir atualização config categorias"
  ON visao_estrategica_categorias_config FOR UPDATE
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Permitir exclusão config categorias"
  ON visao_estrategica_categorias_config FOR DELETE
  TO authenticated, anon
  USING (true);
