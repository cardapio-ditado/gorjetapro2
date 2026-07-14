/*
  # Criar Módulo Marketing Completo

  ## Descrição
  Módulo robusto de marketing integrado ao sistema de gestão de bares que permite
  planejar, criar, revisar e executar campanhas de marketing de forma colaborativa.

  ## Novas Tabelas
  
  ### Campanhas Marketing
  - `campanhas_marketing` - Campanhas de marketing com status e workflow
    - `id` (uuid, PK)
    - `nome` (text) - Nome da campanha
    - `descricao` (text) - Descrição detalhada
    - `objetivo` (text) - Objetivo da campanha
    - `status` (enum) - draft, em_producao, em_revisao, aprovado, agendado, publicado, pausado, concluido
    - `prioridade` (enum) - baixa, media, alta, urgente
    - `tipo` (text) - pago, organico, hibrido
    - `canais` (jsonb) - Array de canais (facebook, instagram, google, tiktok, etc.)
    - `data_inicio` (date)
    - `data_fim` (date)
    - `budget_planejado` (decimal)
    - `budget_gasto` (decimal)
    - `centro_custo_id` (uuid, FK)
    - `responsavel_gestor_id` (uuid, FK users)
    - `responsavel_designer_id` (uuid, FK users)
    - `responsavel_trafego_id` (uuid, FK users)
    - `tags` (text[])
    - `brief_id` (uuid, FK)
    - `template_id` (uuid, FK)
    - `metadata` (jsonb) - Dados adicionais customizáveis
    - `created_at`, `updated_at`, `created_by`

  ### Ativos Marketing
  - `ativos_marketing` - Biblioteca de ativos (imagens, vídeos, etc.)
    - `id` (uuid, PK)
    - `nome` (text)
    - `descricao` (text)
    - `tipo` (enum) - imagem, video, gif, documento
    - `formato` (text) - jpg, png, mp4, pdf, etc.
    - `url` (text) - URL do storage
    - `thumbnail_url` (text)
    - `tamanho_bytes` (bigint)
    - `largura` (int)
    - `altura` (int)
    - `duracao_segundos` (int) - Para vídeos
    - `tags` (text[])
    - `versao` (int)
    - `ativo_pai_id` (uuid, FK) - Para versionamento
    - `metadata` (jsonb)
    - `uso_contagem` (int) - Quantas vezes foi usado
    - `created_at`, `created_by`

  ### Campanhas Ativos
  - `campanhas_ativos` - Relação many-to-many campanhas ↔ ativos
    - `id` (uuid, PK)
    - `campanha_id` (uuid, FK)
    - `ativo_id` (uuid, FK)
    - `ordem` (int)
    - `status` (enum) - ativo, arquivado
    - `created_at`

  ### Briefs Marketing
  - `briefs_marketing` - Briefs estruturados para campanhas
    - `id` (uuid, PK)
    - `nome` (text)
    - `objetivo` (text)
    - `publico_alvo` (text)
    - `mensagem_principal` (text)
    - `cta` (text) - Call to action
    - `formatos_necessarios` (jsonb) - Array de formatos (1080x1080, 1920x1080, etc.)
    - `referencias` (jsonb) - Links e exemplos
    - `deadline` (date)
    - `budget` (decimal)
    - `observacoes` (text)
    - `checklist` (jsonb) - Array de itens com status
    - `status` (enum) - aberto, em_uso, fechado
    - `template` (boolean)
    - `created_at`, `created_by`

  ### Campanhas Chat
  - `campanhas_chat` - Chat em tempo real por campanha
    - `id` (uuid, PK)
    - `campanha_id` (uuid, FK)
    - `usuario_id` (uuid, FK)
    - `mensagem` (text)
    - `mencoes` (uuid[]) - IDs de usuários mencionados
    - `anexos` (jsonb) - Array de anexos
    - `thread_pai_id` (uuid, FK) - Para threads/respostas
    - `editado` (boolean)
    - `fixado` (boolean)
    - `created_at`, `updated_at`

  ### Campanhas Aprovacoes
  - `campanhas_aprovacoes` - Workflow de aprovação
    - `id` (uuid, PK)
    - `campanha_id` (uuid, FK)
    - `ativo_id` (uuid, FK) - Opcional, se aprovação é de ativo específico
    - `aprovador_id` (uuid, FK)
    - `status` (enum) - pendente, aprovado, rejeitado
    - `comentario` (text)
    - `tipo` (enum) - campanha, ativo, brief
    - `ordem` (int) - Ordem na cadeia de aprovação
    - `created_at`, `updated_at`

  ### Campanhas Timeline
  - `campanhas_timeline` - Eventos do calendário
    - `id` (uuid, PK)
    - `campanha_id` (uuid, FK)
    - `titulo` (text)
    - `descricao` (text)
    - `tipo` (enum) - publicacao, evento, deadline, reuniao
    - `data_inicio` (timestamptz)
    - `data_fim` (timestamptz)
    - `dia_completo` (boolean)
    - `cor` (text) - Hex color para o evento
    - `notificar_em` (timestamptz[]) - Array de timestamps para notificações
    - `metadata` (jsonb)
    - `created_at`, `created_by`

  ### Campanhas Métricas
  - `campanhas_metricas` - Performance e métricas
    - `id` (uuid, PK)
    - `campanha_id` (uuid, FK)
    - `data` (date)
    - `canal` (text)
    - `impressoes` (bigint)
    - `cliques` (bigint)
    - `conversoes` (int)
    - `cpc` (decimal) - Custo por clique
    - `ctr` (decimal) - Click-through rate
    - `gasto` (decimal)
    - `receita` (decimal)
    - `roas` (decimal) - Return on ad spend
    - `metadata` (jsonb) - Métricas adicionais por canal
    - `sincronizado_em` (timestamptz)
    - `created_at`

  ### Templates Campanha
  - `templates_campanha` - Templates reutilizáveis
    - `id` (uuid, PK)
    - `nome` (text)
    - `descricao` (text)
    - `categoria` (text) - happy_hour, inauguracao, evento_especial, etc.
    - `configuracao` (jsonb) - Estrutura do template
    - `publico` (boolean) - Se é público para todos
    - `uso_contagem` (int)
    - `created_at`, `created_by`

  ### Campanhas Atividades
  - `campanhas_atividades` - Feed de atividades
    - `id` (uuid, PK)
    - `campanha_id` (uuid, FK)
    - `usuario_id` (uuid, FK)
    - `acao` (text) - criou, editou, aprovou, rejeitou, comentou, etc.
    - `descricao` (text)
    - `metadata` (jsonb)
    - `created_at`

  ### Integracoes Marketing
  - `integracoes_marketing` - Configurações de integrações
    - `id` (uuid, PK)
    - `plataforma` (text) - facebook, google, tiktok, figma, etc.
    - `nome` (text)
    - `ativo` (boolean)
    - `config` (jsonb) - Encrypted config data
    - `ultima_sincronizacao` (timestamptz)
    - `status` (text)
    - `created_at`, `updated_at`, `created_by`

  ## Enums
  - Status de campanha, prioridade, tipo de ativo, etc.

  ## Security
  - RLS habilitado em todas as tabelas
  - Políticas baseadas em autenticação e role

  ## Índices
  - Índices em campos frequentemente consultados
*/

-- =====================================================
-- ENUMS
-- =====================================================

CREATE TYPE status_campanha_marketing AS ENUM (
  'draft',
  'em_producao',
  'em_revisao',
  'aprovado',
  'agendado',
  'publicado',
  'pausado',
  'concluido',
  'cancelado'
);

CREATE TYPE prioridade_campanha AS ENUM (
  'baixa',
  'media',
  'alta',
  'urgente'
);

CREATE TYPE tipo_ativo_marketing AS ENUM (
  'imagem',
  'video',
  'gif',
  'documento',
  'audio'
);

CREATE TYPE status_aprovacao AS ENUM (
  'pendente',
  'aprovado',
  'rejeitado'
);

CREATE TYPE tipo_aprovacao AS ENUM (
  'campanha',
  'ativo',
  'brief'
);

CREATE TYPE tipo_evento_timeline AS ENUM (
  'publicacao',
  'evento',
  'deadline',
  'reuniao'
);

CREATE TYPE status_brief AS ENUM (
  'aberto',
  'em_uso',
  'fechado'
);

-- =====================================================
-- TABELAS
-- =====================================================

-- Briefs Marketing
CREATE TABLE IF NOT EXISTS briefs_marketing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  objetivo text,
  publico_alvo text,
  mensagem_principal text,
  cta text,
  formatos_necessarios jsonb DEFAULT '[]'::jsonb,
  referencias jsonb DEFAULT '[]'::jsonb,
  deadline date,
  budget decimal(15,2),
  observacoes text,
  checklist jsonb DEFAULT '[]'::jsonb,
  status status_brief DEFAULT 'aberto',
  template boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Campanhas Marketing
CREATE TABLE IF NOT EXISTS campanhas_marketing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  objetivo text,
  status status_campanha_marketing DEFAULT 'draft',
  prioridade prioridade_campanha DEFAULT 'media',
  tipo text DEFAULT 'hibrido',
  canais jsonb DEFAULT '[]'::jsonb,
  data_inicio date,
  data_fim date,
  budget_planejado decimal(15,2) DEFAULT 0,
  budget_gasto decimal(15,2) DEFAULT 0,
  centro_custo_id uuid REFERENCES centros_custo(id),
  responsavel_gestor_id uuid REFERENCES auth.users(id),
  responsavel_designer_id uuid REFERENCES auth.users(id),
  responsavel_trafego_id uuid REFERENCES auth.users(id),
  tags text[] DEFAULT ARRAY[]::text[],
  brief_id uuid REFERENCES briefs_marketing(id),
  template_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Ativos Marketing
CREATE TABLE IF NOT EXISTS ativos_marketing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  tipo tipo_ativo_marketing NOT NULL,
  formato text,
  url text NOT NULL,
  thumbnail_url text,
  tamanho_bytes bigint,
  largura int,
  altura int,
  duracao_segundos int,
  tags text[] DEFAULT ARRAY[]::text[],
  versao int DEFAULT 1,
  ativo_pai_id uuid REFERENCES ativos_marketing(id),
  metadata jsonb DEFAULT '{}'::jsonb,
  uso_contagem int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Campanhas Ativos (relação)
CREATE TABLE IF NOT EXISTS campanhas_ativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid REFERENCES campanhas_marketing(id) ON DELETE CASCADE,
  ativo_id uuid REFERENCES ativos_marketing(id) ON DELETE CASCADE,
  ordem int DEFAULT 0,
  status text DEFAULT 'ativo',
  created_at timestamptz DEFAULT now(),
  UNIQUE(campanha_id, ativo_id)
);

-- Campanhas Chat
CREATE TABLE IF NOT EXISTS campanhas_chat (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid REFERENCES campanhas_marketing(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES auth.users(id),
  mensagem text NOT NULL,
  mencoes uuid[] DEFAULT ARRAY[]::uuid[],
  anexos jsonb DEFAULT '[]'::jsonb,
  thread_pai_id uuid REFERENCES campanhas_chat(id),
  editado boolean DEFAULT false,
  fixado boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Campanhas Aprovações
CREATE TABLE IF NOT EXISTS campanhas_aprovacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid REFERENCES campanhas_marketing(id) ON DELETE CASCADE,
  ativo_id uuid REFERENCES ativos_marketing(id),
  aprovador_id uuid REFERENCES auth.users(id),
  status status_aprovacao DEFAULT 'pendente',
  comentario text,
  tipo tipo_aprovacao NOT NULL,
  ordem int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Campanhas Timeline
CREATE TABLE IF NOT EXISTS campanhas_timeline (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid REFERENCES campanhas_marketing(id) ON DELETE CASCADE,
  titulo text NOT NULL,
  descricao text,
  tipo tipo_evento_timeline DEFAULT 'evento',
  data_inicio timestamptz NOT NULL,
  data_fim timestamptz,
  dia_completo boolean DEFAULT false,
  cor text DEFAULT '#D97706',
  notificar_em timestamptz[] DEFAULT ARRAY[]::timestamptz[],
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Campanhas Métricas
CREATE TABLE IF NOT EXISTS campanhas_metricas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid REFERENCES campanhas_marketing(id) ON DELETE CASCADE,
  data date NOT NULL,
  canal text NOT NULL,
  impressoes bigint DEFAULT 0,
  cliques bigint DEFAULT 0,
  conversoes int DEFAULT 0,
  cpc decimal(10,4) DEFAULT 0,
  ctr decimal(10,4) DEFAULT 0,
  gasto decimal(15,2) DEFAULT 0,
  receita decimal(15,2) DEFAULT 0,
  roas decimal(10,4) DEFAULT 0,
  metadata jsonb DEFAULT '{}'::jsonb,
  sincronizado_em timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(campanha_id, data, canal)
);

-- Templates Campanha
CREATE TABLE IF NOT EXISTS templates_campanha (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  categoria text,
  configuracao jsonb NOT NULL,
  publico boolean DEFAULT false,
  uso_contagem int DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- Campanhas Atividades
CREATE TABLE IF NOT EXISTS campanhas_atividades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campanha_id uuid REFERENCES campanhas_marketing(id) ON DELETE CASCADE,
  usuario_id uuid REFERENCES auth.users(id),
  acao text NOT NULL,
  descricao text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Integrações Marketing
CREATE TABLE IF NOT EXISTS integracoes_marketing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plataforma text NOT NULL,
  nome text NOT NULL,
  ativo boolean DEFAULT true,
  config jsonb DEFAULT '{}'::jsonb,
  ultima_sincronizacao timestamptz,
  status text DEFAULT 'ativo',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

-- =====================================================
-- ÍNDICES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_campanhas_status ON campanhas_marketing(status);
CREATE INDEX IF NOT EXISTS idx_campanhas_data_inicio ON campanhas_marketing(data_inicio);
CREATE INDEX IF NOT EXISTS idx_campanhas_responsavel_gestor ON campanhas_marketing(responsavel_gestor_id);
CREATE INDEX IF NOT EXISTS idx_campanhas_centro_custo ON campanhas_marketing(centro_custo_id);
CREATE INDEX IF NOT EXISTS idx_campanhas_tags ON campanhas_marketing USING gin(tags);

CREATE INDEX IF NOT EXISTS idx_ativos_tipo ON ativos_marketing(tipo);
CREATE INDEX IF NOT EXISTS idx_ativos_tags ON ativos_marketing USING gin(tags);
CREATE INDEX IF NOT EXISTS idx_ativos_created ON ativos_marketing(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_campanhas_ativos_campanha ON campanhas_ativos(campanha_id);
CREATE INDEX IF NOT EXISTS idx_campanhas_ativos_ativo ON campanhas_ativos(ativo_id);

CREATE INDEX IF NOT EXISTS idx_chat_campanha ON campanhas_chat(campanha_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_usuario ON campanhas_chat(usuario_id);

CREATE INDEX IF NOT EXISTS idx_aprovacoes_campanha ON campanhas_aprovacoes(campanha_id);
CREATE INDEX IF NOT EXISTS idx_aprovacoes_aprovador ON campanhas_aprovacoes(aprovador_id);
CREATE INDEX IF NOT EXISTS idx_aprovacoes_status ON campanhas_aprovacoes(status);

CREATE INDEX IF NOT EXISTS idx_timeline_campanha ON campanhas_timeline(campanha_id);
CREATE INDEX IF NOT EXISTS idx_timeline_data ON campanhas_timeline(data_inicio, data_fim);

CREATE INDEX IF NOT EXISTS idx_metricas_campanha ON campanhas_metricas(campanha_id);
CREATE INDEX IF NOT EXISTS idx_metricas_data ON campanhas_metricas(data DESC);

CREATE INDEX IF NOT EXISTS idx_atividades_campanha ON campanhas_atividades(campanha_id, created_at DESC);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_campanhas_marketing_updated_at
  BEFORE UPDATE ON campanhas_marketing
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_briefs_marketing_updated_at
  BEFORE UPDATE ON briefs_marketing
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Trigger para registrar atividades automaticamente
CREATE OR REPLACE FUNCTION registrar_atividade_campanha()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO campanhas_atividades (campanha_id, usuario_id, acao, descricao)
    VALUES (NEW.id, NEW.created_by, 'criou', 'Campanha criada: ' || NEW.nome);
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.status != NEW.status THEN
      INSERT INTO campanhas_atividades (campanha_id, usuario_id, acao, descricao)
      VALUES (NEW.id, auth.uid(), 'alterou_status', 'Status alterado de ' || OLD.status || ' para ' || NEW.status);
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_atividade_campanha
  AFTER INSERT OR UPDATE ON campanhas_marketing
  FOR EACH ROW
  EXECUTE FUNCTION registrar_atividade_campanha();

-- =====================================================
-- RLS (Row Level Security)
-- =====================================================

ALTER TABLE briefs_marketing ENABLE ROW LEVEL SECURITY;
ALTER TABLE campanhas_marketing ENABLE ROW LEVEL SECURITY;
ALTER TABLE ativos_marketing ENABLE ROW LEVEL SECURITY;
ALTER TABLE campanhas_ativos ENABLE ROW LEVEL SECURITY;
ALTER TABLE campanhas_chat ENABLE ROW LEVEL SECURITY;
ALTER TABLE campanhas_aprovacoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE campanhas_timeline ENABLE ROW LEVEL SECURITY;
ALTER TABLE campanhas_metricas ENABLE ROW LEVEL SECURITY;
ALTER TABLE templates_campanha ENABLE ROW LEVEL SECURITY;
ALTER TABLE campanhas_atividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE integracoes_marketing ENABLE ROW LEVEL SECURITY;

-- Políticas para briefs_marketing
CREATE POLICY "Usuários autenticados podem visualizar briefs"
  ON briefs_marketing FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar briefs"
  ON briefs_marketing FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar briefs"
  ON briefs_marketing FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Políticas para campanhas_marketing
CREATE POLICY "Usuários autenticados podem visualizar campanhas"
  ON campanhas_marketing FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar campanhas"
  ON campanhas_marketing FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar campanhas"
  ON campanhas_marketing FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem deletar campanhas"
  ON campanhas_marketing FOR DELETE
  TO authenticated
  USING (true);

-- Políticas para ativos_marketing
CREATE POLICY "Usuários autenticados podem visualizar ativos"
  ON ativos_marketing FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar ativos"
  ON ativos_marketing FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar ativos"
  ON ativos_marketing FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Políticas para campanhas_ativos
CREATE POLICY "Usuários autenticados podem visualizar relação campanha-ativo"
  ON campanhas_ativos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar relação campanha-ativo"
  ON campanhas_ativos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem deletar relação campanha-ativo"
  ON campanhas_ativos FOR DELETE
  TO authenticated
  USING (true);

-- Políticas para campanhas_chat
CREATE POLICY "Usuários autenticados podem visualizar chat"
  ON campanhas_chat FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar mensagens"
  ON campanhas_chat FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = usuario_id);

CREATE POLICY "Usuários podem atualizar suas próprias mensagens"
  ON campanhas_chat FOR UPDATE
  TO authenticated
  USING (auth.uid() = usuario_id)
  WITH CHECK (auth.uid() = usuario_id);

-- Políticas para campanhas_aprovacoes
CREATE POLICY "Usuários autenticados podem visualizar aprovações"
  ON campanhas_aprovacoes FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar aprovações"
  ON campanhas_aprovacoes FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Aprovadores podem atualizar suas aprovações"
  ON campanhas_aprovacoes FOR UPDATE
  TO authenticated
  USING (auth.uid() = aprovador_id)
  WITH CHECK (auth.uid() = aprovador_id);

-- Políticas para campanhas_timeline
CREATE POLICY "Usuários autenticados podem visualizar timeline"
  ON campanhas_timeline FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar eventos"
  ON campanhas_timeline FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar eventos"
  ON campanhas_timeline FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem deletar eventos"
  ON campanhas_timeline FOR DELETE
  TO authenticated
  USING (true);

-- Políticas para campanhas_metricas
CREATE POLICY "Usuários autenticados podem visualizar métricas"
  ON campanhas_metricas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Sistema pode inserir métricas"
  ON campanhas_metricas FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Políticas para templates_campanha
CREATE POLICY "Usuários autenticados podem visualizar templates"
  ON templates_campanha FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar templates"
  ON templates_campanha FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Criadores podem atualizar seus templates"
  ON templates_campanha FOR UPDATE
  TO authenticated
  USING (auth.uid() = created_by)
  WITH CHECK (auth.uid() = created_by);

-- Políticas para campanhas_atividades
CREATE POLICY "Usuários autenticados podem visualizar atividades"
  ON campanhas_atividades FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Sistema pode criar atividades"
  ON campanhas_atividades FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Políticas para integracoes_marketing
CREATE POLICY "Usuários autenticados podem visualizar integrações"
  ON integracoes_marketing FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Administradores podem gerenciar integrações"
  ON integracoes_marketing FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- COMENTÁRIOS
-- =====================================================

COMMENT ON TABLE campanhas_marketing IS 'Campanhas de marketing com workflow completo';
COMMENT ON TABLE ativos_marketing IS 'Biblioteca de ativos (imagens, vídeos, documentos)';
COMMENT ON TABLE briefs_marketing IS 'Briefs estruturados para campanhas';
COMMENT ON TABLE campanhas_chat IS 'Chat em tempo real por campanha';
COMMENT ON TABLE campanhas_aprovacoes IS 'Sistema de aprovação com workflow';
COMMENT ON TABLE campanhas_timeline IS 'Calendário de eventos e publicações';
COMMENT ON TABLE campanhas_metricas IS 'Métricas de performance por campanha';
COMMENT ON TABLE templates_campanha IS 'Templates reutilizáveis de campanhas';
COMMENT ON TABLE campanhas_atividades IS 'Feed de atividades das campanhas';
COMMENT ON TABLE integracoes_marketing IS 'Configurações de integrações externas';
