/*
  # Adicionar suporte para IA nas compras

  ## Descrição
  Adiciona campos para suportar extração de dados via IA (OpenAI Vision)
  nas compras de estoque.

  ## Mudanças
  1. Adicionar campos em entradas_compras:
     - origem_arquivo_url: URL do arquivo no storage
     - origem_hash: Hash do arquivo para deduplicação
     - ia_confidences: Níveis de confiança da extração

  2. Criar tabela de auditoria de extrações IA:
     - Armazena request/response completos
     - Permite rastreabilidade e debugging

  ## Segurança
  - RLS habilitado na tabela de auditoria
  - Políticas para usuários autenticados
*/

-- Adicionar campos nas entradas_compras
ALTER TABLE entradas_compras 
  ADD COLUMN IF NOT EXISTS origem_arquivo_url text,
  ADD COLUMN IF NOT EXISTS origem_hash text,
  ADD COLUMN IF NOT EXISTS ia_confidences jsonb;

-- Criar índice para busca por hash (deduplicação)
CREATE INDEX IF NOT EXISTS idx_entradas_compras_hash 
  ON entradas_compras(origem_hash) 
  WHERE origem_hash IS NOT NULL;

-- Tabela de auditoria de extrações IA
CREATE TABLE IF NOT EXISTS ai_extractions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrada_compra_id uuid REFERENCES entradas_compras(id) ON DELETE SET NULL,
  arquivo_url text,
  arquivo_hash text,
  request_payload jsonb NOT NULL,
  response_payload jsonb NOT NULL,
  model_used text NOT NULL,
  tokens_used integer,
  processing_time_ms integer,
  success boolean DEFAULT true,
  error_message text,
  created_at timestamptz DEFAULT now(),
  created_by uuid
);

-- Índices para auditoria
CREATE INDEX IF NOT EXISTS idx_ai_extractions_compra 
  ON ai_extractions(entrada_compra_id);
CREATE INDEX IF NOT EXISTS idx_ai_extractions_created 
  ON ai_extractions(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_extractions_hash 
  ON ai_extractions(arquivo_hash);

-- RLS na tabela de auditoria
ALTER TABLE ai_extractions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read ai_extractions"
  ON ai_extractions
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert ai_extractions"
  ON ai_extractions
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Comentários para documentação
COMMENT ON TABLE ai_extractions IS 'Auditoria de extrações de dados via IA (OpenAI Vision)';
COMMENT ON COLUMN entradas_compras.origem_arquivo_url IS 'URL do arquivo original (nota fiscal, foto)';
COMMENT ON COLUMN entradas_compras.origem_hash IS 'SHA-256 hash do arquivo para deduplicação';
COMMENT ON COLUMN entradas_compras.ia_confidences IS 'Níveis de confiança da extração por campo (0-1)';
