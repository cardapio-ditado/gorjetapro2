/*
  # Configuração de Avaliações de Desempenho v2

  1. Nova tabela `config_avaliacoes`
  2. Coluna `intervalo_avaliacao_meses` em colaboradores
  3. Recria vw_avaliacoes_devidas com intervalo configurado e coluna intervalo_meses
*/

CREATE TABLE IF NOT EXISTS config_avaliacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intervalo_meses integer NOT NULL DEFAULT 6,
  tipos_avaliacao jsonb NOT NULL DEFAULT '["Desempenho Geral"]'::jsonb,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

ALTER TABLE config_avaliacoes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'config_avaliacoes' AND policyname = 'Authenticated read config_avaliacoes') THEN
    CREATE POLICY "Authenticated read config_avaliacoes" ON config_avaliacoes FOR SELECT TO authenticated USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'config_avaliacoes' AND policyname = 'Authenticated upsert config_avaliacoes') THEN
    CREATE POLICY "Authenticated upsert config_avaliacoes" ON config_avaliacoes FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

INSERT INTO config_avaliacoes (intervalo_meses, tipos_avaliacao)
SELECT 6, '["Desempenho Geral"]'::jsonb
WHERE NOT EXISTS (SELECT 1 FROM config_avaliacoes);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'colaboradores' AND column_name = 'intervalo_avaliacao_meses') THEN
    ALTER TABLE colaboradores ADD COLUMN intervalo_avaliacao_meses integer;
  END IF;
END $$;

-- Drop and recreate the view with the new column
DROP VIEW IF EXISTS vw_avaliacoes_devidas;

CREATE VIEW vw_avaliacoes_devidas AS
WITH cfg AS (
  SELECT intervalo_meses FROM config_avaliacoes LIMIT 1
),
ultima_aval AS (
  SELECT
    colaborador_id,
    MAX(data_avaliacao) AS ultima_avaliacao,
    COUNT(*) AS total_avaliacoes
  FROM rh_avaliacoes
  GROUP BY colaborador_id
)
SELECT
  c.id AS colaborador_id,
  c.nome_completo,
  COALESCE(f.nome, c.funcao_personalizada, 'Sem função') AS funcao_nome,
  c.funcao_personalizada,
  c.data_admissao,
  EXTRACT(YEAR FROM AGE(CURRENT_DATE, COALESCE(c.data_admissao, CURRENT_DATE)))::int AS anos_empresa,
  COALESCE(ua.total_avaliacoes, 0) AS total_avaliacoes,
  ua.ultima_avaliacao,
  COALESCE(c.intervalo_avaliacao_meses, cfg.intervalo_meses, 6) AS intervalo_meses,
  CASE
    WHEN ua.ultima_avaliacao IS NULL THEN 'nunca_avaliado'
    WHEN ua.ultima_avaliacao < CURRENT_DATE - (COALESCE(c.intervalo_avaliacao_meses, cfg.intervalo_meses, 6) || ' months')::interval THEN 'atrasado'
    WHEN ua.ultima_avaliacao < CURRENT_DATE - ((COALESCE(c.intervalo_avaliacao_meses, cfg.intervalo_meses, 6) - 1) || ' months')::interval THEN 'a_vencer'
    ELSE 'em_dia'
  END AS situacao
FROM colaboradores c
CROSS JOIN cfg
LEFT JOIN funcoes_rh f ON f.id = c.funcao_id
LEFT JOIN ultima_aval ua ON ua.colaborador_id = c.id
WHERE c.status = 'ativo';
