/*
  # Tabelas de Entrevistas e Testes DISC

  ## Descrição
  Tabelas complementares para gestão de entrevistas e aplicação/resultados
  dos testes comportamentais DISC.

  ## 1. Novas Tabelas

  ### `rh_entrevistas`
  Registro de entrevistas realizadas
  - `id` (uuid, PK)
  - `candidatura_id` (uuid, FK)
  - `tipo` (text) - chat, video, presencial
  - `data_hora` (timestamptz) - Data/hora da entrevista
  - `duracao_minutos` (integer) - Duração em minutos
  - `entrevistador` (text) - Nome do entrevistador
  - `perguntas_respostas` (jsonb) - Array de perguntas e respostas
  - `relatorio` (text) - Relatório gerado pela IA ou entrevistador
  - `pontuacao` (numeric) - Nota da entrevista (0-100)
  - `observacoes` (text)
  - `status` (text) - agendada, em_andamento, concluida, cancelada
  - `criado_em`, `atualizado_em` (timestamptz)

  ### `rh_disc_perguntas`
  Banco de perguntas para o teste DISC
  - `id` (serial, PK)
  - `pergunta` (text) - Texto da pergunta
  - `opcoes` (jsonb) - Array de opções [{letra, texto, perfil}]
  - `ordem` (integer) - Ordem de apresentação
  - `ativo` (boolean)
  - `criado_em` (timestamptz)

  ### `rh_disc_respostas`
  Respostas dos candidatos ao teste DISC
  - `id` (uuid, PK)
  - `candidatura_id` (uuid, FK)
  - `pergunta_id` (integer, FK)
  - `opcao_selecionada` (text) - Letra da opção (D/I/S/C)
  - `respondido_em` (timestamptz)

  ### `rh_disc_resultados`
  Resultado calculado do teste DISC
  - `id` (uuid, PK)
  - `candidatura_id` (uuid, FK)
  - `perfil_dominante` (text) - D, I, S, C, DI, DS, IS, IC, SC, DC
  - `pontuacoes` (jsonb) - Pontuação por dimensão {D, I, S, C}
  - `resumo` (text) - Descrição do perfil
  - `pontos_fortes` (text[]) - Lista de pontos fortes
  - `areas_desenvolvimento` (text[]) - Áreas a desenvolver
  - `compatibilidade_cargo` (numeric) - % de compatibilidade (0-100)
  - `criado_em`, `atualizado_em` (timestamptz)

  ## 2. Security
  - RLS habilitado
  - Políticas de acesso por autenticação
*/

-- =====================================================
-- TABELA: rh_entrevistas
-- =====================================================
CREATE TABLE IF NOT EXISTS rh_entrevistas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidatura_id uuid NOT NULL REFERENCES rh_candidaturas(id) ON DELETE CASCADE,
  tipo text NOT NULL CHECK (tipo IN ('chat', 'video', 'presencial', 'telefone')),
  data_hora timestamptz NOT NULL,
  duracao_minutos integer,
  entrevistador text,
  perguntas_respostas jsonb DEFAULT '[]'::jsonb,
  relatorio text,
  pontuacao numeric(5,2) CHECK (pontuacao >= 0 AND pontuacao <= 100),
  observacoes text,
  status text NOT NULL DEFAULT 'agendada' CHECK (
    status IN ('agendada', 'em_andamento', 'concluida', 'cancelada')
  ),
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

COMMENT ON TABLE rh_entrevistas IS 'Registro de entrevistas com candidatos';
COMMENT ON COLUMN rh_entrevistas.perguntas_respostas IS 'JSON: [{pergunta, resposta, avaliacao}]';

-- =====================================================
-- TABELA: rh_disc_perguntas
-- =====================================================
CREATE TABLE IF NOT EXISTS rh_disc_perguntas (
  id serial PRIMARY KEY,
  pergunta text NOT NULL,
  opcoes jsonb NOT NULL,
  ordem integer NOT NULL,
  ativo boolean DEFAULT true,
  criado_em timestamptz DEFAULT now(),
  UNIQUE(ordem)
);

COMMENT ON TABLE rh_disc_perguntas IS 'Banco de perguntas do teste DISC';
COMMENT ON COLUMN rh_disc_perguntas.opcoes IS 'JSON: [{letra: "D", texto: "...", perfil: "dominante"}]';

-- =====================================================
-- TABELA: rh_disc_respostas
-- =====================================================
CREATE TABLE IF NOT EXISTS rh_disc_respostas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidatura_id uuid NOT NULL REFERENCES rh_candidaturas(id) ON DELETE CASCADE,
  pergunta_id integer NOT NULL REFERENCES rh_disc_perguntas(id) ON DELETE CASCADE,
  opcao_selecionada text NOT NULL CHECK (opcao_selecionada IN ('D', 'I', 'S', 'C')),
  respondido_em timestamptz DEFAULT now(),
  UNIQUE(candidatura_id, pergunta_id)
);

COMMENT ON TABLE rh_disc_respostas IS 'Respostas dos candidatos ao teste DISC';

-- =====================================================
-- TABELA: rh_disc_resultados
-- =====================================================
CREATE TABLE IF NOT EXISTS rh_disc_resultados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  candidatura_id uuid NOT NULL REFERENCES rh_candidaturas(id) ON DELETE CASCADE,
  perfil_dominante text NOT NULL,
  pontuacoes jsonb NOT NULL,
  resumo text,
  pontos_fortes text[],
  areas_desenvolvimento text[],
  compatibilidade_cargo numeric(5,2) CHECK (compatibilidade_cargo >= 0 AND compatibilidade_cargo <= 100),
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  UNIQUE(candidatura_id)
);

COMMENT ON TABLE rh_disc_resultados IS 'Resultados calculados do teste DISC';
COMMENT ON COLUMN rh_disc_resultados.pontuacoes IS 'JSON: {D: 25, I: 30, S: 20, C: 25}';

-- =====================================================
-- ÍNDICES
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_rh_entrevistas_candidatura ON rh_entrevistas(candidatura_id);
CREATE INDEX IF NOT EXISTS idx_rh_entrevistas_data ON rh_entrevistas(data_hora DESC);
CREATE INDEX IF NOT EXISTS idx_rh_entrevistas_status ON rh_entrevistas(status);

CREATE INDEX IF NOT EXISTS idx_rh_disc_perguntas_ordem ON rh_disc_perguntas(ordem);
CREATE INDEX IF NOT EXISTS idx_rh_disc_perguntas_ativo ON rh_disc_perguntas(ativo);

CREATE INDEX IF NOT EXISTS idx_rh_disc_respostas_candidatura ON rh_disc_respostas(candidatura_id);

CREATE INDEX IF NOT EXISTS idx_rh_disc_resultados_candidatura ON rh_disc_resultados(candidatura_id);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- rh_entrevistas
ALTER TABLE rh_entrevistas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem ver entrevistas"
  ON rh_entrevistas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar entrevistas"
  ON rh_entrevistas FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar entrevistas"
  ON rh_entrevistas FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- rh_disc_perguntas
ALTER TABLE rh_disc_perguntas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem ver perguntas DISC"
  ON rh_disc_perguntas FOR SELECT
  TO authenticated
  USING (ativo = true);

CREATE POLICY "Usuários autenticados podem gerenciar perguntas DISC"
  ON rh_disc_perguntas FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- rh_disc_respostas
ALTER TABLE rh_disc_respostas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem ver respostas DISC"
  ON rh_disc_respostas FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem registrar respostas DISC"
  ON rh_disc_respostas FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- rh_disc_resultados
ALTER TABLE rh_disc_resultados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuários autenticados podem ver resultados DISC"
  ON rh_disc_resultados FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem criar resultados DISC"
  ON rh_disc_resultados FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Usuários autenticados podem atualizar resultados DISC"
  ON rh_disc_resultados FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- =====================================================
-- TRIGGERS
-- =====================================================
CREATE TRIGGER update_rh_entrevistas_updated_at
  BEFORE UPDATE ON rh_entrevistas
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rh_disc_resultados_updated_at
  BEFORE UPDATE ON rh_disc_resultados
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- POPULAR PERGUNTAS DISC (Exemplo simplificado)
-- =====================================================
INSERT INTO rh_disc_perguntas (pergunta, opcoes, ordem) VALUES
('Como você geralmente age em situações de pressão?', 
 '[
   {"letra": "D", "texto": "Tomo decisões rápidas e assumo o controle", "perfil": "Dominância"},
   {"letra": "I", "texto": "Busco apoio da equipe e mantenho o otimismo", "perfil": "Influência"},
   {"letra": "S", "texto": "Mantenho a calma e sigo procedimentos estabelecidos", "perfil": "Estabilidade"},
   {"letra": "C", "texto": "Analiso cuidadosamente os detalhes antes de agir", "perfil": "Conformidade"}
 ]'::jsonb, 1),

('Quando trabalho em equipe, eu prefiro:', 
 '[
   {"letra": "D", "texto": "Liderar e direcionar as atividades", "perfil": "Dominância"},
   {"letra": "I", "texto": "Motivar e envolver todos os membros", "perfil": "Influência"},
   {"letra": "S", "texto": "Dar suporte e colaborar harmoniosamente", "perfil": "Estabilidade"},
   {"letra": "C", "texto": "Garantir precisão e qualidade no trabalho", "perfil": "Conformidade"}
 ]'::jsonb, 2),

('Diante de um problema complexo, minha primeira reação é:', 
 '[
   {"letra": "D", "texto": "Agir imediatamente para resolver", "perfil": "Dominância"},
   {"letra": "I", "texto": "Conversar com outros para encontrar soluções criativas", "perfil": "Influência"},
   {"letra": "S", "texto": "Buscar soluções testadas e confiáveis", "perfil": "Estabilidade"},
   {"letra": "C", "texto": "Analisar dados e informações detalhadamente", "perfil": "Conformidade"}
 ]'::jsonb, 3),

('No ambiente de trabalho, valorizo mais:', 
 '[
   {"letra": "D", "texto": "Resultados e conquistas", "perfil": "Dominância"},
   {"letra": "I", "texto": "Relacionamentos e reconhecimento", "perfil": "Influência"},
   {"letra": "S", "texto": "Estabilidade e harmonia", "perfil": "Estabilidade"},
   {"letra": "C", "texto": "Precisão e qualidade", "perfil": "Conformidade"}
 ]'::jsonb, 4),

('Quando recebo feedback, eu:', 
 '[
   {"letra": "D", "texto": "Foco em como melhorar e superar desafios", "perfil": "Dominância"},
   {"letra": "I", "texto": "Aprecio o reconhecimento e busco entender o ponto de vista", "perfil": "Influência"},
   {"letra": "S", "texto": "Escuto atentamente e implemento mudanças gradualmente", "perfil": "Estabilidade"},
   {"letra": "C", "texto": "Analiso criticamente e busco evidências", "perfil": "Conformidade"}
 ]'::jsonb, 5)
ON CONFLICT (ordem) DO NOTHING;
