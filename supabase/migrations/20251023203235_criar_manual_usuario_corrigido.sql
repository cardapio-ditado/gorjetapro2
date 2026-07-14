/*
  # Sistema de Manual do Usuário

  1. Novas Tabelas
    - `manual_categorias`
      - `id` (uuid, primary key)
      - `nome` (text) - Nome da categoria
      - `descricao` (text) - Descrição da categoria
      - `icone` (text) - Nome do ícone a ser usado
      - `cor` (text) - Cor de destaque
      - `ordem` (integer) - Ordem de exibição
      - `ativo` (boolean) - Se está ativo
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `manual_topicos`
      - `id` (uuid, primary key)
      - `categoria_id` (uuid, foreign key) - Referência à categoria
      - `titulo` (text) - Título do tópico
      - `conteudo` (text) - Conteúdo em HTML/Markdown
      - `tags` (text[]) - Tags para busca
      - `ordem` (integer) - Ordem dentro da categoria
      - `ativo` (boolean) - Se está ativo
      - `visualizacoes` (integer) - Contador de visualizações
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)

    - `manual_visualizacoes`
      - `id` (uuid, primary key)
      - `topico_id` (uuid, foreign key) - Referência ao tópico
      - `usuario_id` (uuid, foreign key) - Referência ao usuário
      - `visualizado_em` (timestamptz) - Data/hora da visualização
      - `tempo_leitura` (integer) - Tempo em segundos

  2. Security
    - Enable RLS em todas as tabelas
    - Políticas permitem leitura para todos usuários autenticados
    - Apenas usuários do sistema podem gerenciar o conteúdo
*/

-- Criar tabela de categorias
CREATE TABLE IF NOT EXISTS manual_categorias (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  icone text DEFAULT 'BookOpen',
  cor text DEFAULT 'blue',
  ordem integer DEFAULT 0,
  ativo boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Criar tabela de tópicos
CREATE TABLE IF NOT EXISTS manual_topicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_id uuid REFERENCES manual_categorias(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  conteudo text NOT NULL,
  tags text[] DEFAULT '{}',
  ordem integer DEFAULT 0,
  ativo boolean DEFAULT true,
  visualizacoes integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Criar tabela de visualizações
CREATE TABLE IF NOT EXISTS manual_visualizacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topico_id uuid REFERENCES manual_topicos(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  visualizado_em timestamptz DEFAULT now(),
  tempo_leitura integer DEFAULT 0
);

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_manual_topicos_categoria ON manual_topicos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_manual_topicos_tags ON manual_topicos USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_manual_visualizacoes_topico ON manual_visualizacoes(topico_id);
CREATE INDEX IF NOT EXISTS idx_manual_visualizacoes_usuario ON manual_visualizacoes(usuario_id);

-- Enable RLS
ALTER TABLE manual_categorias ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_topicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_visualizacoes ENABLE ROW LEVEL SECURITY;

-- Políticas para manual_categorias (todos usuários autenticados podem ler)
CREATE POLICY "Usuários autenticados podem ler categorias ativas"
  ON manual_categorias FOR SELECT
  TO authenticated
  USING (ativo = true);

CREATE POLICY "Usuários autenticados podem gerenciar categorias"
  ON manual_categorias FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Políticas para manual_topicos (todos usuários autenticados podem ler)
CREATE POLICY "Usuários autenticados podem ler tópicos ativos"
  ON manual_topicos FOR SELECT
  TO authenticated
  USING (
    ativo = true 
    AND EXISTS (
      SELECT 1 FROM manual_categorias
      WHERE manual_categorias.id = manual_topicos.categoria_id
      AND manual_categorias.ativo = true
    )
  );

CREATE POLICY "Usuários autenticados podem gerenciar tópicos"
  ON manual_topicos FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Políticas para manual_visualizacoes
CREATE POLICY "Usuários podem registrar suas visualizações"
  ON manual_visualizacoes FOR INSERT
  TO authenticated
  WITH CHECK (usuario_id = auth.uid());

CREATE POLICY "Usuários podem ver suas próprias visualizações"
  ON manual_visualizacoes FOR SELECT
  TO authenticated
  USING (usuario_id = auth.uid());

-- Função para atualizar updated_at
CREATE OR REPLACE FUNCTION update_manual_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para atualizar updated_at
DROP TRIGGER IF EXISTS update_manual_categorias_updated_at ON manual_categorias;
CREATE TRIGGER update_manual_categorias_updated_at
  BEFORE UPDATE ON manual_categorias
  FOR EACH ROW
  EXECUTE FUNCTION update_manual_updated_at();

DROP TRIGGER IF EXISTS update_manual_topicos_updated_at ON manual_topicos;
CREATE TRIGGER update_manual_topicos_updated_at
  BEFORE UPDATE ON manual_topicos
  FOR EACH ROW
  EXECUTE FUNCTION update_manual_updated_at();

-- Função para incrementar visualizações
CREATE OR REPLACE FUNCTION incrementar_visualizacao_topico()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE manual_topicos
  SET visualizacoes = visualizacoes + 1
  WHERE id = NEW.topico_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para incrementar visualizações
DROP TRIGGER IF EXISTS trigger_incrementar_visualizacao ON manual_visualizacoes;
CREATE TRIGGER trigger_incrementar_visualizacao
  AFTER INSERT ON manual_visualizacoes
  FOR EACH ROW
  EXECUTE FUNCTION incrementar_visualizacao_topico();
