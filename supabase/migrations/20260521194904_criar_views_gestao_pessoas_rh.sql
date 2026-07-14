/*
  # Criar views para módulos de Gestão de Pessoas RH

  Adiciona colunas faltantes e cria views necessárias para os 6 novos submodules:
  - vw_avaliacoes_devidas
  - vw_disc_time
  - vw_marcos_mes
*/

-- Adicionar coluna recorrente em rh_marcos se não existir
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rh_marcos' AND column_name = 'recorrente') THEN
    ALTER TABLE rh_marcos ADD COLUMN recorrente boolean DEFAULT false;
  END IF;
END $$;

-- Adicionar titulo em rh_historico_carreira se não existir
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rh_historico_carreira' AND column_name = 'titulo') THEN
    ALTER TABLE rh_historico_carreira ADD COLUMN titulo text DEFAULT '';
  END IF;
END $$;

-- Adicionar avaliador_nome em rh_avaliacoes se não existir
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rh_avaliacoes' AND column_name = 'avaliador_nome') THEN
    ALTER TABLE rh_avaliacoes ADD COLUMN avaliador_nome text DEFAULT '';
  END IF;
END $$;

-- Adicionar periodo_referencia em rh_avaliacoes se não existir
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rh_avaliacoes' AND column_name = 'periodo_referencia') THEN
    ALTER TABLE rh_avaliacoes ADD COLUMN periodo_referencia text DEFAULT '';
  END IF;
END $$;

-- Adicionar nome_template em rh_onboarding_instancias se não existir
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rh_onboarding_instancias' AND column_name = 'nome_template') THEN
    ALTER TABLE rh_onboarding_instancias ADD COLUMN nome_template text DEFAULT '';
  END IF;
END $$;

-- Adicionar data_prevista_conclusao em rh_onboarding_instancias se não existir
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rh_onboarding_instancias' AND column_name = 'data_prevista_conclusao') THEN
    ALTER TABLE rh_onboarding_instancias ADD COLUMN data_prevista_conclusao date;
  END IF;
END $$;

-- Adicionar atualizado_em em rh_onboarding_instancias se não existir
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rh_onboarding_instancias' AND column_name = 'atualizado_em') THEN
    ALTER TABLE rh_onboarding_instancias ADD COLUMN atualizado_em timestamptz DEFAULT now();
  END IF;
END $$;

-- ==============================================================
-- Views
-- ==============================================================

CREATE OR REPLACE VIEW vw_avaliacoes_devidas AS
SELECT
  c.id AS colaborador_id,
  c.nome_completo,
  c.data_admissao,
  c.funcao_personalizada,
  COALESCE(f.nome, c.funcao_personalizada, 'Sem função') AS funcao_nome,
  EXTRACT(YEAR FROM AGE(CURRENT_DATE, c.data_admissao))::integer AS anos_empresa,
  COUNT(a.id) AS total_avaliacoes,
  MAX(a.data_avaliacao) AS ultima_avaliacao,
  CASE
    WHEN MAX(a.data_avaliacao) IS NULL THEN 'nunca_avaliado'
    WHEN MAX(a.data_avaliacao) < CURRENT_DATE - INTERVAL '12 months' THEN 'atrasado'
    WHEN MAX(a.data_avaliacao) < CURRENT_DATE - INTERVAL '9 months' THEN 'a_vencer'
    ELSE 'em_dia'
  END AS situacao
FROM colaboradores c
LEFT JOIN funcoes_rh f ON c.funcao_id = f.id
LEFT JOIN rh_avaliacoes a ON a.colaborador_id = c.id
WHERE c.status = 'ativo'
GROUP BY c.id, c.nome_completo, c.data_admissao, c.funcao_personalizada, f.nome
ORDER BY anos_empresa DESC NULLS LAST, c.nome_completo;

CREATE OR REPLACE VIEW vw_disc_time AS
SELECT
  c.id AS colaborador_id,
  c.nome_completo,
  COALESCE(f.nome, c.funcao_personalizada, 'Sem função') AS funcao_nome,
  d.score_d,
  d.score_i,
  d.score_s,
  d.score_c,
  d.perfil_dominante,
  d.perfil_secundario,
  d.data_aplicacao
FROM colaboradores c
LEFT JOIN funcoes_rh f ON c.funcao_id = f.id
LEFT JOIN rh_disc_colaborador d ON d.colaborador_id = c.id
WHERE c.status = 'ativo'
ORDER BY c.nome_completo;

CREATE OR REPLACE VIEW vw_marcos_mes AS
SELECT
  m.id,
  m.colaborador_id,
  c.nome_completo,
  m.tipo,
  m.descricao,
  m.data_marco,
  m.notificado,
  EXTRACT(DAY FROM m.data_marco)::integer AS dia_marco
FROM rh_marcos m
JOIN colaboradores c ON c.id = m.colaborador_id
WHERE EXTRACT(MONTH FROM m.data_marco) = EXTRACT(MONTH FROM CURRENT_DATE)
ORDER BY EXTRACT(DAY FROM m.data_marco);
