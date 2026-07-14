/*
  # Criar Banco de Talentos e Entrevistas Pessoais

  1. Nova Tabela: banco_talentos
    - `id` (uuid, PK)
    - `candidato_id` (uuid, FK para rh_candidatos)
    - `candidatura_id` (uuid, FK para rh_candidaturas) - origem
    - `data_inclusao` (timestamp)
    - `motivo_inclusao` (text)
    - `areas_interesse` (text[])
    - `disponibilidade` (text)
    - `pretensao_salarial` (numeric)
    - `observacoes` (text)
    - `status` (text) - ativo, contatado, contratado, inativo
    - `ultima_atualizacao` (timestamp)

  2. Nova Tabela: entrevistas_pessoais
    - `id` (uuid, PK)
    - `candidatura_id` (uuid, FK para rh_candidaturas)
    - `data_entrevista` (timestamp)
    - `entrevistador` (text)
    - `cargo_avaliado` (text)
    - `audio_url` (text) - URL do áudio armazenado
    - `transcricao` (text) - transcrição do áudio
    - `duracao_minutos` (integer)
    - `notas_entrevistador` (text)
    - `analise_ia` (jsonb) - análise da IA sobre o áudio
    - `pontuacao` (integer)
    - `recomendacao` (text)
    - `pontos_fortes` (text[])
    - `pontos_fracos` (text[])
    - `status` (text) - agendada, realizada, analisada
    - `created_at` (timestamp)
    - `updated_at` (timestamp)

  3. Security
    - RLS habilitado em ambas tabelas
    - Políticas para authenticated users
*/

-- Criar tabela banco_talentos
CREATE TABLE IF NOT EXISTS banco_talentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidato_id uuid REFERENCES rh_candidatos(id) ON DELETE CASCADE NOT NULL,
  candidatura_id uuid REFERENCES rh_candidaturas(id) ON DELETE SET NULL,
  data_inclusao timestamptz DEFAULT now() NOT NULL,
  motivo_inclusao text,
  areas_interesse text[],
  disponibilidade text,
  pretensao_salarial numeric(10,2),
  observacoes text,
  status text DEFAULT 'ativo' CHECK (status IN ('ativo', 'contatado', 'contratado', 'inativo')),
  ultima_atualizacao timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(candidato_id)
);

-- Criar tabela entrevistas_pessoais
CREATE TABLE IF NOT EXISTS entrevistas_pessoais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidatura_id uuid REFERENCES rh_candidaturas(id) ON DELETE CASCADE NOT NULL,
  data_entrevista timestamptz DEFAULT now(),
  entrevistador text,
  cargo_avaliado text,
  audio_url text,
  transcricao text,
  duracao_minutos integer,
  notas_entrevistador text,
  analise_ia jsonb,
  pontuacao integer CHECK (pontuacao >= 0 AND pontuacao <= 100),
  recomendacao text CHECK (recomendacao IN ('contratar', 'segunda_entrevista', 'banco_talentos', 'recusar')),
  pontos_fortes text[],
  pontos_fracos text[],
  status text DEFAULT 'agendada' CHECK (status IN ('agendada', 'realizada', 'analisada')),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_banco_talentos_candidato ON banco_talentos(candidato_id);
CREATE INDEX IF NOT EXISTS idx_banco_talentos_status ON banco_talentos(status);
CREATE INDEX IF NOT EXISTS idx_entrevistas_candidatura ON entrevistas_pessoais(candidatura_id);
CREATE INDEX IF NOT EXISTS idx_entrevistas_status ON entrevistas_pessoais(status);

-- Habilitar RLS
ALTER TABLE banco_talentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE entrevistas_pessoais ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para banco_talentos
CREATE POLICY "Authenticated users can view banco_talentos"
  ON banco_talentos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert banco_talentos"
  ON banco_talentos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update banco_talentos"
  ON banco_talentos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete banco_talentos"
  ON banco_talentos FOR DELETE
  TO authenticated
  USING (true);

-- Políticas RLS para entrevistas_pessoais
CREATE POLICY "Authenticated users can view entrevistas_pessoais"
  ON entrevistas_pessoais FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert entrevistas_pessoais"
  ON entrevistas_pessoais FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update entrevistas_pessoais"
  ON entrevistas_pessoais FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete entrevistas_pessoais"
  ON entrevistas_pessoais FOR DELETE
  TO authenticated
  USING (true);

-- Trigger para atualizar ultima_atualizacao
CREATE OR REPLACE FUNCTION update_banco_talentos_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.ultima_atualizacao = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_banco_talentos_timestamp
  BEFORE UPDATE ON banco_talentos
  FOR EACH ROW
  EXECUTE FUNCTION update_banco_talentos_timestamp();

-- Trigger para atualizar updated_at em entrevistas
CREATE OR REPLACE FUNCTION update_entrevistas_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_entrevistas_timestamp
  BEFORE UPDATE ON entrevistas_pessoais
  FOR EACH ROW
  EXECUTE FUNCTION update_entrevistas_timestamp();
