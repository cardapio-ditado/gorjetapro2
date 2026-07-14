/*
  # Criar sistema de auditoria de IA para financeiro

  1. Nova Tabela
    - `ia_extractions_financeiro`
      - Registro de todas extrações de IA
      - Dados originais vs corrigidos
      - Métricas de acurácia

  2. Segurança
    - RLS habilitado
    - Políticas de leitura

  3. Índices
    - Por tipo de extração
    - Por data
    - Por usuário
*/

-- Criar tabela de auditoria
CREATE TABLE IF NOT EXISTS ia_extractions_financeiro (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_extracao text NOT NULL CHECK (tipo_extracao IN ('boleto', 'nota_fiscal', 'extrato', 'outro')),
  tipo_conta text CHECK (tipo_conta IN ('pagar', 'receber')),
  
  -- Dados da extração
  dados_extraidos jsonb NOT NULL,
  dados_corrigidos jsonb,
  
  -- Métricas
  confidence_media numeric(3,2),
  campos_corretos integer DEFAULT 0,
  campos_total integer DEFAULT 0,
  acuracia numeric(3,2),
  
  -- Categorização
  categoria_sugerida_id uuid,
  categoria_aceita boolean,
  
  -- Duplicatas
  duplicatas_detectadas integer DEFAULT 0,
  duplicata_confirmada boolean,
  
  -- Metadata
  arquivo_nome text,
  arquivo_tamanho integer,
  arquivo_tipo text,
  modelo_ia text DEFAULT 'gpt-4o',
  tokens_usados integer,
  tempo_processamento_ms integer,
  
  -- Conta criada
  conta_id uuid,
  
  -- Auditoria
  usuario_id uuid,
  criado_em timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE ia_extractions_financeiro ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura de extrações"
  ON ia_extractions_financeiro
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Permitir inserção de extrações"
  ON ia_extractions_financeiro
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Índices
CREATE INDEX idx_ia_extractions_tipo ON ia_extractions_financeiro (tipo_extracao);
CREATE INDEX idx_ia_extractions_data ON ia_extractions_financeiro (criado_em DESC);
CREATE INDEX idx_ia_extractions_usuario ON ia_extractions_financeiro (usuario_id);
CREATE INDEX idx_ia_extractions_conta ON ia_extractions_financeiro (conta_id);

-- View para métricas de IA
CREATE OR REPLACE VIEW vw_metricas_ia_financeiro AS
SELECT 
  tipo_extracao,
  COUNT(*) as total_extracoes,
  AVG(confidence_media) as confidence_media,
  AVG(acuracia) as acuracia_media,
  SUM(CASE WHEN categoria_aceita THEN 1 ELSE 0 END) as categorias_aceitas,
  SUM(CASE WHEN categoria_aceita IS NOT NULL THEN 1 ELSE 0 END) as categorias_sugeridas,
  SUM(duplicatas_detectadas) as total_duplicatas_detectadas,
  SUM(CASE WHEN duplicata_confirmada THEN 1 ELSE 0 END) as duplicatas_confirmadas,
  AVG(tokens_usados) as tokens_medio,
  AVG(tempo_processamento_ms) as tempo_medio_ms
FROM ia_extractions_financeiro
GROUP BY tipo_extracao;

COMMENT ON TABLE ia_extractions_financeiro IS 'Auditoria de todas extrações de IA no módulo financeiro';
COMMENT ON VIEW vw_metricas_ia_financeiro IS 'Métricas agregadas de performance da IA financeira';