/*
  # Corrigir políticas RLS do Manual do Usuário
  
  1. Remove políticas duplicadas e conflitantes
  2. Cria políticas simples e claras para leitura de categorias e tópicos ativos
  3. Mantém política de inserção de visualizações
  
  ## Mudanças
  - Remove todas as políticas existentes das tabelas manual_categorias e manual_topicos
  - Cria novas políticas simplificadas que permitem leitura de dados ativos
  - Usuários autenticados podem ler todas as categorias e tópicos ativos
*/

-- Remover políticas existentes
DROP POLICY IF EXISTS "Usuários autenticados podem gerenciar categorias" ON manual_categorias;
DROP POLICY IF EXISTS "Usuários autenticados podem ler categorias ativas" ON manual_categorias;
DROP POLICY IF EXISTS "Usuários autenticados podem gerenciar tópicos" ON manual_topicos;
DROP POLICY IF EXISTS "Usuários autenticados podem ler tópicos ativos" ON manual_topicos;

-- Criar políticas simplificadas para leitura
CREATE POLICY "Permitir leitura de categorias ativas"
  ON manual_categorias
  FOR SELECT
  TO authenticated
  USING (ativo = true);

CREATE POLICY "Permitir leitura de tópicos ativos"
  ON manual_topicos
  FOR SELECT
  TO authenticated
  USING (ativo = true);

-- Políticas de gerenciamento para usuários master
CREATE POLICY "Master pode gerenciar categorias"
  ON manual_categorias
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios 
      WHERE usuarios.id = auth.uid() 
      AND usuarios.funcao = 'master'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios 
      WHERE usuarios.id = auth.uid() 
      AND usuarios.funcao = 'master'
    )
  );

CREATE POLICY "Master pode gerenciar tópicos"
  ON manual_topicos
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM usuarios 
      WHERE usuarios.id = auth.uid() 
      AND usuarios.funcao = 'master'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM usuarios 
      WHERE usuarios.id = auth.uid() 
      AND usuarios.funcao = 'master'
    )
  );
