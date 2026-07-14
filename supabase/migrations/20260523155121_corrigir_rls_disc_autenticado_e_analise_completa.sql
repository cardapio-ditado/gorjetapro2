/*
  # Corrigir RLS disc: usuários autenticados + colunas análise detalhada

  Problema: gestor (autenticado) não tinha política de INSERT/UPDATE em
  rh_disc_sessoes → sessão nunca chegava a 'concluido' → trigger não disparava
  → rh_disc_colaborador ficava vazio → sem percentuais na tela.

  Solução:
  1. Adicionar políticas de INSERT/UPDATE/SELECT para authenticated em rh_disc_sessoes
  2. Adicionar política de UPDATE para authenticated em rh_disc_respostas
  3. Adicionar colunas de análise detalhada em rh_disc_colaborador
  4. Atualizar trigger para salvar análise completa
*/

-- ── 1. RLS rh_disc_sessoes para autenticados ──────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rh_disc_sessoes'
    AND policyname = 'Autenticado pode gerenciar sessoes disc'
  ) THEN
    CREATE POLICY "Autenticado pode gerenciar sessoes disc"
      ON rh_disc_sessoes FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ── 2. RLS rh_disc_respostas UPDATE para autenticados ────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rh_disc_respostas'
    AND policyname = 'Autenticado pode atualizar respostas disc'
  ) THEN
    CREATE POLICY "Autenticado pode atualizar respostas disc"
      ON rh_disc_respostas FOR UPDATE
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ── 3. Novas colunas em rh_disc_colaborador ───────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rh_disc_colaborador' AND column_name = 'visao_equipe'
  ) THEN
    ALTER TABLE rh_disc_colaborador ADD COLUMN visao_equipe text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rh_disc_colaborador' AND column_name = 'visao_trabalho'
  ) THEN
    ALTER TABLE rh_disc_colaborador ADD COLUMN visao_trabalho text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rh_disc_colaborador' AND column_name = 'pontos_fracos'
  ) THEN
    ALTER TABLE rh_disc_colaborador ADD COLUMN pontos_fracos text[];
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rh_disc_colaborador' AND column_name = 'analise_completa'
  ) THEN
    ALTER TABLE rh_disc_colaborador ADD COLUMN analise_completa jsonb;
  END IF;
END $$;

-- Adicionar campo analise_ia em rh_disc_sessoes se não existir (já deve ter)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rh_disc_sessoes' AND column_name = 'pontos_fracos'
  ) THEN
    ALTER TABLE rh_disc_sessoes ADD COLUMN pontos_fracos text[];
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rh_disc_sessoes' AND column_name = 'visao_equipe'
  ) THEN
    ALTER TABLE rh_disc_sessoes ADD COLUMN visao_equipe text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rh_disc_sessoes' AND column_name = 'visao_trabalho'
  ) THEN
    ALTER TABLE rh_disc_sessoes ADD COLUMN visao_trabalho text;
  END IF;
END $$;

-- ── 4. Atualizar trigger para salvar campos extras ────────────────────────────

CREATE OR REPLACE FUNCTION fn_disc_sessao_concluida()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF NEW.status = 'concluido' AND OLD.status != 'concluido' THEN

    IF NEW.colaborador_id IS NOT NULL THEN
      INSERT INTO rh_disc_colaborador (
        colaborador_id, data_aplicacao, aplicado_por,
        score_d, score_i, score_s, score_c,
        perfil_dominante, perfil_secundario,
        resumo, pontos_fortes, pontos_fracos, areas_desenvolvimento,
        estilo_comunicacao, estilo_lideranca, como_motivar, como_desafia,
        visao_equipe, visao_trabalho,
        analise_completa,
        valido_ate, criado_em
      ) VALUES (
        NEW.colaborador_id, CURRENT_DATE,
        COALESCE(NEW.criado_por, 'Sistema'),
        NEW.score_d, NEW.score_i, NEW.score_s, NEW.score_c,
        NEW.perfil_dominante, NEW.perfil_secundario,
        NEW.resumo_ia,
        NEW.pontos_fortes,
        CASE WHEN NEW.analise_ia IS NOT NULL THEN
          ARRAY(SELECT jsonb_array_elements_text(NEW.analise_ia->'pontos_fracos'))
        ELSE NULL END,
        NEW.areas_desenvolvimento,
        NEW.estilo_comunicacao,
        CASE WHEN NEW.analise_ia IS NOT NULL THEN NEW.analise_ia->>'estilo_lideranca' ELSE NULL END,
        NEW.como_motivar,
        CASE WHEN NEW.analise_ia IS NOT NULL THEN NEW.analise_ia->>'como_desafia' ELSE NULL END,
        CASE WHEN NEW.analise_ia IS NOT NULL THEN NEW.analise_ia->>'visao_equipe' ELSE NULL END,
        CASE WHEN NEW.analise_ia IS NOT NULL THEN NEW.analise_ia->>'visao_trabalho' ELSE NULL END,
        NEW.analise_ia,
        CURRENT_DATE + INTERVAL '2 years',
        NOW()
      )
      ON CONFLICT (colaborador_id) DO UPDATE SET
        data_aplicacao        = CURRENT_DATE,
        aplicado_por          = COALESCE(NEW.criado_por, 'Sistema'),
        score_d               = NEW.score_d,
        score_i               = NEW.score_i,
        score_s               = NEW.score_s,
        score_c               = NEW.score_c,
        perfil_dominante      = NEW.perfil_dominante,
        perfil_secundario     = NEW.perfil_secundario,
        resumo                = NEW.resumo_ia,
        pontos_fortes         = NEW.pontos_fortes,
        pontos_fracos         = CASE WHEN NEW.analise_ia IS NOT NULL THEN
                                  ARRAY(SELECT jsonb_array_elements_text(NEW.analise_ia->'pontos_fracos'))
                                ELSE NULL END,
        areas_desenvolvimento = NEW.areas_desenvolvimento,
        estilo_comunicacao    = NEW.estilo_comunicacao,
        estilo_lideranca      = CASE WHEN NEW.analise_ia IS NOT NULL THEN NEW.analise_ia->>'estilo_lideranca' ELSE NULL END,
        como_motivar          = NEW.como_motivar,
        como_desafia          = CASE WHEN NEW.analise_ia IS NOT NULL THEN NEW.analise_ia->>'como_desafia' ELSE NULL END,
        visao_equipe          = CASE WHEN NEW.analise_ia IS NOT NULL THEN NEW.analise_ia->>'visao_equipe' ELSE NULL END,
        visao_trabalho        = CASE WHEN NEW.analise_ia IS NOT NULL THEN NEW.analise_ia->>'visao_trabalho' ELSE NULL END,
        analise_completa      = NEW.analise_ia,
        valido_ate            = CURRENT_DATE + INTERVAL '2 years';
    END IF;

    IF NEW.candidato_id IS NOT NULL THEN
      INSERT INTO rh_disc_resultados (
        candidatura_id, perfil_dominante, pontuacoes, resumo,
        pontos_fortes, areas_desenvolvimento, criado_em, atualizado_em
      )
      SELECT rc.id, NEW.perfil_dominante,
        jsonb_build_object('D', NEW.score_d, 'I', NEW.score_i, 'S', NEW.score_s, 'C', NEW.score_c),
        NEW.resumo_ia, NEW.pontos_fortes, NEW.areas_desenvolvimento,
        NOW(), NOW()
      FROM rh_candidaturas rc
      WHERE rc.candidato_id = NEW.candidato_id
      ORDER BY rc.data_aplicacao DESC
      LIMIT 1
      ON CONFLICT (candidatura_id) DO UPDATE SET
        perfil_dominante      = NEW.perfil_dominante,
        pontuacoes            = jsonb_build_object('D', NEW.score_d, 'I', NEW.score_i, 'S', NEW.score_s, 'C', NEW.score_c),
        resumo                = NEW.resumo_ia,
        pontos_fortes         = NEW.pontos_fortes,
        areas_desenvolvimento = NEW.areas_desenvolvimento,
        atualizado_em         = NOW();
    END IF;

  END IF;
  RETURN NEW;
END;
$$;
