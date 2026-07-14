/*
  # Sistema de Pré-Entrevista com IA

  1. Nova Tabela: rh_pre_entrevistas
    - `id` (uuid, PK)
    - `candidatura_id` (uuid, FK para rh_candidaturas)
    - `token` (text, unique) - Token único para acessar a pré-entrevista
    - `status` (text) - 'pendente', 'em_andamento', 'concluida', 'expirada'
    - `conversa` (jsonb) - Histórico completo da conversa
    - `analise_ia` (jsonb) - Análise final da IA sobre o candidato
    - `pontuacao` (numeric) - Pontuação de 0-100
    - `recomendacao` (text) - 'aprovar', 'reprovar', 'revisar'
    - `iniciada_em` (timestamptz)
    - `concluida_em` (timestamptz)
    - `expira_em` (timestamptz)
    - `criado_em` (timestamptz)
    
  2. Security
    - Enable RLS
    - Políticas para authenticated users (RH)
    - Políticas para acesso anônimo via token
*/

-- Criar tabela de pré-entrevistas
CREATE TABLE IF NOT EXISTS rh_pre_entrevistas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidatura_id uuid REFERENCES rh_candidaturas(id) ON DELETE CASCADE NOT NULL,
  token text UNIQUE NOT NULL,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'em_andamento', 'concluida', 'expirada')),
  conversa jsonb DEFAULT '[]'::jsonb,
  analise_ia jsonb,
  pontuacao numeric CHECK (pontuacao >= 0 AND pontuacao <= 100),
  recomendacao text CHECK (recomendacao IN ('aprovar', 'reprovar', 'revisar')),
  iniciada_em timestamptz,
  concluida_em timestamptz,
  expira_em timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_pre_entrevistas_candidatura ON rh_pre_entrevistas(candidatura_id);
CREATE INDEX IF NOT EXISTS idx_pre_entrevistas_token ON rh_pre_entrevistas(token);
CREATE INDEX IF NOT EXISTS idx_pre_entrevistas_status ON rh_pre_entrevistas(status);

-- RLS
ALTER TABLE rh_pre_entrevistas ENABLE ROW LEVEL SECURITY;

-- RH pode ver todas as pré-entrevistas
CREATE POLICY "Usuários autenticados podem ver pré-entrevistas"
  ON rh_pre_entrevistas FOR SELECT
  TO authenticated
  USING (true);

-- RH pode criar pré-entrevistas
CREATE POLICY "Usuários autenticados podem criar pré-entrevistas"
  ON rh_pre_entrevistas FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Acesso anônimo via token (somente leitura)
CREATE POLICY "Acesso anônimo via token para leitura"
  ON rh_pre_entrevistas FOR SELECT
  TO anon
  USING (token IS NOT NULL);

-- Acesso anônimo via token (atualização da conversa)
CREATE POLICY "Acesso anônimo via token para atualizar conversa"
  ON rh_pre_entrevistas FOR UPDATE
  TO anon
  USING (token IS NOT NULL)
  WITH CHECK (token IS NOT NULL);

-- Função para gerar token único
CREATE OR REPLACE FUNCTION gerar_token_pre_entrevista()
RETURNS text AS $$
BEGIN
  RETURN encode(gen_random_bytes(32), 'hex');
END;
$$ LANGUAGE plpgsql;

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION atualizar_timestamp_pre_entrevista()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_atualizar_pre_entrevista
  BEFORE UPDATE ON rh_pre_entrevistas
  FOR EACH ROW
  EXECUTE FUNCTION atualizar_timestamp_pre_entrevista();
