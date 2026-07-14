/*
  # Corrigir RLS da Tabela de Configuração de Categorias
  
  ## Resumo
  Corrige as políticas de Row Level Security da tabela `visao_estrategica_categorias_config`
  para permitir que usuários autenticados possam inserir, atualizar e excluir configurações.
  
  ## Mudanças
  1. Remove política genérica "FOR ALL" que estava incompleta
  2. Cria políticas específicas para cada operação (SELECT, INSERT, UPDATE, DELETE)
  3. Todas as políticas permitem acesso total para usuários autenticados
  
  ## Segurança
  - Apenas usuários autenticados podem gerenciar configurações
  - Políticas com USING e WITH CHECK corretos para cada operação
*/

-- Remover política antiga que estava incompleta
DROP POLICY IF EXISTS "Permitir gestão config categorias" ON visao_estrategica_categorias_config;
DROP POLICY IF EXISTS "Permitir leitura config categorias" ON visao_estrategica_categorias_config;

-- Criar políticas específicas para cada operação
CREATE POLICY "Usuários autenticados podem ler config categorias"
  ON visao_estrategica_categorias_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem inserir config categorias"
  ON visao_estrategica_categorias_config FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar config categorias"
  ON visao_estrategica_categorias_config FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem excluir config categorias"
  ON visao_estrategica_categorias_config FOR DELETE
  TO authenticated
  USING (true);
