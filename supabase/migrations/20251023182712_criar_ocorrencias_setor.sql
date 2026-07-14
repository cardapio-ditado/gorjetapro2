/*
  # Livro de Ocorrências dos Setores

  1. Nova Tabela
    - `ocorrencias_setor`
      - `id` (uuid, primary key)
      - `data_ocorrencia` (timestamptz) - Data e hora da ocorrência
      - `setor` (text) - Setor onde ocorreu (bar, cozinha, eventos, etc)
      - `tipo_ocorrencia` (text) - Tipo: cliente, funcionario, equipamento, operacional, outros
      - `gravidade` (text) - Nível: baixa, media, alta, critica
      - `titulo` (text) - Título resumido da ocorrência
      - `descricao` (text) - Descrição detalhada do acontecimento
      - `envolvidos` (text) - Pessoas/clientes envolvidos
      - `acoes_tomadas` (text) - Ações que foram tomadas
      - `observacoes` (text) - Observações adicionais
      - `registrado_por` (uuid) - ID do usuário que registrou
      - `status` (text) - Status: aberta, em_analise, resolvida, arquivada
      - `criado_em` (timestamptz)
      - `atualizado_em` (timestamptz)

  2. Security
    - Enable RLS
    - Políticas permissivas para desenvolvimento

  3. Índices
    - Por data de ocorrência
    - Por setor
    - Por tipo e gravidade
    - Por status
*/

-- Criar tabela de ocorrências
CREATE TABLE IF NOT EXISTS ocorrencias_setor (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_ocorrencia timestamptz NOT NULL DEFAULT now(),
  setor text NOT NULL,
  tipo_ocorrencia text NOT NULL,
  gravidade text NOT NULL DEFAULT 'media',
  titulo text NOT NULL,
  descricao text NOT NULL,
  envolvidos text,
  acoes_tomadas text,
  observacoes text,
  registrado_por uuid,
  status text NOT NULL DEFAULT 'aberta',
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  
  CONSTRAINT ocorrencias_setor_setor_check 
    CHECK (setor IN ('bar', 'cozinha', 'eventos', 'administracao', 'rh', 'estoque', 'financeiro', 'atendimento', 'outros')),
  CONSTRAINT ocorrencias_setor_tipo_check 
    CHECK (tipo_ocorrencia IN ('cliente', 'funcionario', 'equipamento', 'operacional', 'seguranca', 'financeiro', 'outros')),
  CONSTRAINT ocorrencias_setor_gravidade_check 
    CHECK (gravidade IN ('baixa', 'media', 'alta', 'critica')),
  CONSTRAINT ocorrencias_setor_status_check 
    CHECK (status IN ('aberta', 'em_analise', 'resolvida', 'arquivada'))
);

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_ocorrencias_data ON ocorrencias_setor(data_ocorrencia DESC);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_setor ON ocorrencias_setor(setor);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_tipo ON ocorrencias_setor(tipo_ocorrencia);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_gravidade ON ocorrencias_setor(gravidade);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_status ON ocorrencias_setor(status);
CREATE INDEX IF NOT EXISTS idx_ocorrencias_registrado_por ON ocorrencias_setor(registrado_por);

-- Trigger para atualizar timestamp
CREATE TRIGGER trg_ocorrencias_setor_update
  BEFORE UPDATE ON ocorrencias_setor
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

-- Enable RLS
ALTER TABLE ocorrencias_setor ENABLE ROW LEVEL SECURITY;

-- Política permissiva para desenvolvimento
CREATE POLICY "Allow all on ocorrencias_setor"
  ON ocorrencias_setor
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- View para relatórios de ocorrências
CREATE OR REPLACE VIEW vw_ocorrencias_resumo AS
SELECT 
  setor,
  tipo_ocorrencia,
  gravidade,
  status,
  COUNT(*) as total_ocorrencias,
  COUNT(*) FILTER (WHERE status = 'aberta') as abertas,
  COUNT(*) FILTER (WHERE status = 'em_analise') as em_analise,
  COUNT(*) FILTER (WHERE status = 'resolvida') as resolvidas,
  COUNT(*) FILTER (WHERE gravidade = 'critica') as criticas,
  COUNT(*) FILTER (WHERE gravidade = 'alta') as altas,
  MAX(data_ocorrencia) as ultima_ocorrencia
FROM ocorrencias_setor
GROUP BY setor, tipo_ocorrencia, gravidade, status;

-- Comentários
COMMENT ON TABLE ocorrencias_setor IS 'Livro de ocorrências dos setores - registro de acontecimentos importantes';
COMMENT ON COLUMN ocorrencias_setor.setor IS 'Setor onde ocorreu o acontecimento';
COMMENT ON COLUMN ocorrencias_setor.tipo_ocorrencia IS 'Tipo da ocorrência: cliente, funcionário, equipamento, etc';
COMMENT ON COLUMN ocorrencias_setor.gravidade IS 'Nível de gravidade: baixa, média, alta, crítica';
COMMENT ON COLUMN ocorrencias_setor.status IS 'Status atual: aberta, em análise, resolvida, arquivada';
