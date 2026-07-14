/*
  # Sistema de Avaliações com Tipos e Critérios Configuráveis

  1. Correções
    - `config_avaliacoes`: adiciona políticas para role anon (SELECT, INSERT, UPDATE)
    - `rh_avaliacoes`: adiciona coluna `criterios_notas` JSONB para armazenar notas dinâmicas
      e habilita RLS com acesso anon

  2. Nova tabela
    - `rh_avaliacao_tipos`: cada tipo de avaliação com seus critérios definidos
      - `nome` (text) — nome do tipo (ex: "Desempenho Geral")
      - `descricao` (text) — descrição do tipo
      - `ativo` (bool)
      - `criterios` (jsonb) — array de {id, nome, descricao, peso} definidos pelo usuário

  3. Segurança
    - RLS em `rh_avaliacao_tipos` com acesso anon total
    - RLS em `rh_avaliacoes` com acesso anon total
    - Políticas anon em `config_avaliacoes`
*/

-- ─── Corrigir config_avaliacoes para aceitar anon ────────────────────────────

CREATE POLICY "Anon read config_avaliacoes"
  ON config_avaliacoes FOR SELECT TO anon USING (true);

CREATE POLICY "Anon insert config_avaliacoes"
  ON config_avaliacoes FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon update config_avaliacoes"
  ON config_avaliacoes FOR UPDATE TO anon
  USING (true) WITH CHECK (true);

-- ─── Adicionar criterios_notas em rh_avaliacoes ──────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rh_avaliacoes' AND column_name = 'criterios_notas'
  ) THEN
    ALTER TABLE rh_avaliacoes ADD COLUMN criterios_notas jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Habilitar RLS e dar acesso anon
ALTER TABLE rh_avaliacoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon select rh_avaliacoes"
  ON rh_avaliacoes FOR SELECT TO anon USING (true);

CREATE POLICY "Anon insert rh_avaliacoes"
  ON rh_avaliacoes FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon update rh_avaliacoes"
  ON rh_avaliacoes FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon delete rh_avaliacoes"
  ON rh_avaliacoes FOR DELETE TO anon USING (true);

-- ─── Tabela de tipos de avaliação com critérios ──────────────────────────────

CREATE TABLE IF NOT EXISTS rh_avaliacao_tipos (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome        text NOT NULL,
  descricao   text,
  ativo       boolean NOT NULL DEFAULT true,
  criterios   jsonb NOT NULL DEFAULT '[]'::jsonb,
  criado_em   timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

ALTER TABLE rh_avaliacao_tipos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anon select rh_avaliacao_tipos"
  ON rh_avaliacao_tipos FOR SELECT TO anon USING (true);

CREATE POLICY "Anon insert rh_avaliacao_tipos"
  ON rh_avaliacao_tipos FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anon update rh_avaliacao_tipos"
  ON rh_avaliacao_tipos FOR UPDATE TO anon USING (true) WITH CHECK (true);

CREATE POLICY "Anon delete rh_avaliacao_tipos"
  ON rh_avaliacao_tipos FOR DELETE TO anon USING (true);

-- Tipo padrão com os critérios clássicos de desempenho
INSERT INTO rh_avaliacao_tipos (nome, descricao, criterios) VALUES (
  'Desempenho Geral',
  'Avaliação padrão de desempenho cobrindo as principais competências comportamentais e técnicas.',
  '[
    {"id":"pontualidade","nome":"Pontualidade","descricao":"Cumpre horários e prazos estabelecidos"},
    {"id":"produtividade","nome":"Produtividade","descricao":"Entrega resultados com qualidade e no tempo esperado"},
    {"id":"trabalho_equipe","nome":"Trabalho em Equipe","descricao":"Colabora e se relaciona bem com colegas"},
    {"id":"atendimento","nome":"Atendimento","descricao":"Qualidade no atendimento a clientes internos e externos"},
    {"id":"conhecimento","nome":"Conhecimento Técnico","descricao":"Domínio das ferramentas e técnicas da função"},
    {"id":"postura","nome":"Postura Profissional","descricao":"Apresentação, comunicação e ética no trabalho"}
  ]'::jsonb
);
