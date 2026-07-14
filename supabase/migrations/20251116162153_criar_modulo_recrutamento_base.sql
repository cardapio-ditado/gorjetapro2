/*
  # Módulo de Recrutamento e Seleção - Estrutura Base

  ## Descrição
  Sistema completo de recrutamento alinhado à cultura organizacional do Ditado Popular.
  DNA: "Embriagar os corações de felicidade"
  Valores: Hospitalidade, Respeito, Qualidade, Inovação e Proatividade

  ## 1. Novas Tabelas

  ### `rh_cargos` (Scorecards)
  Define os cargos com missão, competências e indicadores
  - `id` (uuid, PK)
  - `nome` (text) - Nome do cargo
  - `descricao` (text) - Descrição detalhada
  - `missao` (text) - Missão específica do cargo
  - `competencias` (jsonb) - Competências obrigatórias e desejáveis
  - `indicadores` (jsonb) - Métricas de performance
  - `status` (text) - ativo, inativo
  - `criado_em`, `atualizado_em` (timestamptz)

  ### `rh_vagas`
  Vagas abertas vinculadas a cargos
  - `id` (uuid, PK)
  - `cargo_id` (uuid, FK)
  - `titulo` (text) - Título da vaga
  - `descricao` (text) - Descrição completa
  - `requisitos` (text) - Requisitos necessários
  - `local_trabalho` (text) - Local ou unidade
  - `regime_contratual` (text) - CLT, MEI, etc
  - `salario_faixa` (text) - Faixa salarial (opcional)
  - `beneficios` (text) - Benefícios oferecidos
  - `status` (text) - aberta, pausada, fechada
  - `data_abertura`, `data_fechamento` (timestamptz)
  - `criado_por` (uuid, FK auth.users)
  - `criado_em`, `atualizado_em` (timestamptz)

  ### `rh_candidatos`
  Dados dos candidatos
  - `id` (uuid, PK)
  - `nome` (text)
  - `email` (text, unique)
  - `telefone` (text)
  - `cpf` (text) - Criptografado
  - `data_nascimento` (date)
  - `endereco` (jsonb) - Endereço completo
  - `linkedin` (text)
  - `portfolio` (text)
  - `observacoes` (text)
  - `criado_em`, `atualizado_em` (timestamptz)

  ### `rh_candidaturas`
  Candidaturas dos candidatos às vagas
  - `id` (uuid, PK)
  - `vaga_id` (uuid, FK)
  - `candidato_id` (uuid, FK)
  - `curriculo_url` (text) - URL do currículo no storage
  - `carta_apresentacao` (text)
  - `status` (text) - novo, triagem, teste, entrevista, finalista, aprovado, reprovado, desistente
  - `etapa_atual` (text) - triagem_curriculo, teste_disc, entrevista, avaliacao_final
  - `notas` (jsonb) - Notas por competência (0-100)
  - `parecer_ia` (text) - Análise gerada pela IA
  - `parecer_gestor` (text) - Análise do gestor
  - `recomendacao` (text) - apto, banco_talentos, nao_recomendado
  - `perfil_disc` (text) - Resultado DISC
  - `resumo_disc` (text)
  - `pontuacao_geral` (numeric) - Nota geral (0-100)
  - `data_aplicacao` (timestamptz)
  - `criado_em`, `atualizado_em` (timestamptz)

  ## 2. Índices
  Índices para otimizar consultas frequentes

  ## 3. Security
  - RLS habilitado em todas as tabelas
  - Políticas para usuários autenticados
  - Proteção de dados sensíveis (LGPD)
*/

-- =====================================================
-- TABELA: rh_cargos (Scorecards)
-- =====================================================
CREATE TABLE IF NOT EXISTS rh_cargos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text NOT NULL,
  missao text NOT NULL,
  competencias jsonb NOT NULL DEFAULT '{"obrigatorias": [], "desejaveis": []}'::jsonb,
  indicadores jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

COMMENT ON TABLE rh_cargos IS 'Scorecards dos cargos com competências e indicadores';
COMMENT ON COLUMN rh_cargos.competencias IS 'JSON: {obrigatorias: [], desejaveis: []}';
COMMENT ON COLUMN rh_cargos.indicadores IS 'JSON: [{nome, meta, descricao}]';

-- =====================================================
-- TABELA: rh_vagas
-- =====================================================
CREATE TABLE IF NOT EXISTS rh_vagas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cargo_id uuid NOT NULL REFERENCES rh_cargos(id) ON DELETE RESTRICT,
  titulo text NOT NULL,
  descricao text NOT NULL,
  requisitos text NOT NULL,
  local_trabalho text,
  regime_contratual text,
  salario_faixa text,
  beneficios text,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'pausada', 'fechada')),
  data_abertura timestamptz DEFAULT now(),
  data_fechamento timestamptz,
  criado_por uuid REFERENCES auth.users(id),
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

COMMENT ON TABLE rh_vagas IS 'Vagas abertas para recrutamento';

-- =====================================================
-- TABELA: rh_candidatos
-- =====================================================
CREATE TABLE IF NOT EXISTS rh_candidatos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text NOT NULL UNIQUE,
  telefone text,
  cpf text,
  data_nascimento date,
  endereco jsonb,
  linkedin text,
  portfolio text,
  observacoes text,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

COMMENT ON TABLE rh_candidatos IS 'Dados pessoais dos candidatos';
COMMENT ON COLUMN rh_candidatos.endereco IS 'JSON: {logradouro, numero, complemento, bairro, cidade, estado, cep}';

-- =====================================================
-- TABELA: rh_candidaturas
-- =====================================================
CREATE TABLE IF NOT EXISTS rh_candidaturas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vaga_id uuid NOT NULL REFERENCES rh_vagas(id) ON DELETE CASCADE,
  candidato_id uuid NOT NULL REFERENCES rh_candidatos(id) ON DELETE CASCADE,
  curriculo_url text NOT NULL,
  carta_apresentacao text,
  status text NOT NULL DEFAULT 'novo' CHECK (
    status IN ('novo', 'triagem', 'teste', 'entrevista', 'finalista', 'aprovado', 'reprovado', 'desistente')
  ),
  etapa_atual text DEFAULT 'triagem_curriculo' CHECK (
    etapa_atual IN ('triagem_curriculo', 'teste_disc', 'entrevista', 'avaliacao_final')
  ),
  notas jsonb DEFAULT '{}'::jsonb,
  parecer_ia text,
  parecer_gestor text,
  recomendacao text CHECK (recomendacao IN ('apto', 'banco_talentos', 'nao_recomendado')),
  perfil_disc text,
  resumo_disc text,
  pontuacao_geral numeric(5,2) CHECK (pontuacao_geral >= 0 AND pontuacao_geral <= 100),
  data_aplicacao timestamptz DEFAULT now(),
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  UNIQUE(vaga_id, candidato_id)
);

COMMENT ON TABLE rh_candidaturas IS 'Candidaturas dos candidatos às vagas';
COMMENT ON COLUMN rh_candidaturas.notas IS 'JSON: {competencia: nota (0-100)}';

-- =====================================================
-- ÍNDICES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_rh_vagas_status ON rh_vagas(status);
CREATE INDEX IF NOT EXISTS idx_rh_vagas_cargo ON rh_vagas(cargo_id);
CREATE INDEX IF NOT EXISTS idx_rh_vagas_data_abertura ON rh_vagas(data_abertura DESC);

CREATE INDEX IF NOT EXISTS idx_rh_candidatos_email ON rh_candidatos(email);
CREATE INDEX IF NOT EXISTS idx_rh_candidatos_nome ON rh_candidatos(nome);

CREATE INDEX IF NOT EXISTS idx_rh_candidaturas_vaga ON rh_candidaturas(vaga_id);
CREATE INDEX IF NOT EXISTS idx_rh_candidaturas_candidato ON rh_candidaturas(candidato_id);
CREATE INDEX IF NOT EXISTS idx_rh_candidaturas_status ON rh_candidaturas(status);
CREATE INDEX IF NOT EXISTS idx_rh_candidaturas_etapa ON rh_candidaturas(etapa_atual);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- rh_cargos
ALTER TABLE rh_cargos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem ver cargos"
  ON rh_cargos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar cargos"
  ON rh_cargos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar cargos"
  ON rh_cargos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- rh_vagas
ALTER TABLE rh_vagas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem ver vagas"
  ON rh_vagas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar vagas"
  ON rh_vagas FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar vagas"
  ON rh_vagas FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- rh_candidatos
ALTER TABLE rh_candidatos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem ver candidatos"
  ON rh_candidatos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar candidatos"
  ON rh_candidatos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar candidatos"
  ON rh_candidatos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- rh_candidaturas
ALTER TABLE rh_candidaturas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem ver candidaturas"
  ON rh_candidaturas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar candidaturas"
  ON rh_candidaturas FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar candidaturas"
  ON rh_candidaturas FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- TRIGGERS PARA UPDATED_AT
-- =====================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_rh_cargos_updated_at
  BEFORE UPDATE ON rh_cargos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rh_vagas_updated_at
  BEFORE UPDATE ON rh_vagas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rh_candidatos_updated_at
  BEFORE UPDATE ON rh_candidatos
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rh_candidaturas_updated_at
  BEFORE UPDATE ON rh_candidaturas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
