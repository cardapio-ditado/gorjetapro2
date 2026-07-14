/*
  # Permitir acesso público ao Manual do Usuário
  
  1. Remove políticas que exigem autenticação
  2. Adiciona políticas que permitem acesso público de leitura
  3. Mantém restrições de escrita apenas para usuários master
  
  ## Mudanças
  - Permite que qualquer pessoa (incluindo usuários não autenticados) leia categorias e tópicos ativos
  - Isso é apropriado pois o manual do usuário é conteúdo de ajuda público
  - Apenas usuários master autenticados podem modificar o conteúdo
*/

-- Remover políticas existentes
DROP POLICY IF EXISTS "Permitir leitura de categorias ativas" ON manual_categorias;
DROP POLICY IF EXISTS "Master pode gerenciar categorias" ON manual_categorias;
DROP POLICY IF EXISTS "Permitir leitura de tópicos ativos" ON manual_topicos;
DROP POLICY IF EXISTS "Master pode gerenciar tópicos" ON manual_topicos;

-- Criar políticas de leitura pública
CREATE POLICY "Acesso público para leitura de categorias"
  ON manual_categorias
  FOR SELECT
  USING (ativo = true);

CREATE POLICY "Acesso público para leitura de tópicos"
  ON manual_topicos
  FOR SELECT
  USING (ativo = true);

-- Políticas de gerenciamento para usuários master autenticados
CREATE POLICY "Master autenticado pode gerenciar categorias"
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

CREATE POLICY "Master autenticado pode gerenciar tópicos"
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
