/*
  # Melhorias no módulo de Recrutamento e Seleção

  1. Adiciona coluna `categoria` em `banco_talentos`
     - 'banco_curriculos': apenas entregou currículo, ainda não passou por triagem
     - 'banco_talentos': passou por processo seletivo e foi aprovado para banco

  2. Adiciona `curriculo_arquivo_url` e `documentos` em `rh_candidatos`
     para armazenar anexos de arquivos

  3. Adiciona `documentos` em `rh_candidaturas` para múltiplos anexos por candidatura

  4. Garante que as políticas RLS permitam acesso anon para banco_talentos
*/

-- Adicionar categoria ao banco_talentos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'banco_talentos' AND column_name = 'categoria') THEN
    ALTER TABLE banco_talentos ADD COLUMN categoria text NOT NULL DEFAULT 'banco_curriculos';
  END IF;
END $$;

-- Adicionar curriculo_arquivo_url em rh_candidatos
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rh_candidatos' AND column_name = 'curriculo_arquivo_url') THEN
    ALTER TABLE rh_candidatos ADD COLUMN curriculo_arquivo_url text DEFAULT '';
  END IF;
END $$;

-- Adicionar curriculo_texto em rh_candidatos (armazena o texto do curriculo para busca)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rh_candidatos' AND column_name = 'curriculo_texto') THEN
    ALTER TABLE rh_candidatos ADD COLUMN curriculo_texto text DEFAULT '';
  END IF;
END $$;

-- Adicionar documentos jsonb em rh_candidatos (lista de {nome, url, tipo})
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'rh_candidatos' AND column_name = 'documentos') THEN
    ALTER TABLE rh_candidatos ADD COLUMN documentos jsonb DEFAULT '[]'::jsonb;
  END IF;
END $$;

-- Atualizar banco_talentos existentes que vieram de processo seletivo para banco_talentos
UPDATE banco_talentos SET categoria = 'banco_talentos' WHERE candidatura_id IS NOT NULL AND categoria = 'banco_curriculos';

-- Garantir que storage bucket curriculos-candidatos existe (via policies)
-- O bucket já foi criado anteriormente como solicitacoes-anexos, criaremos um específico para curriculos

-- Policies para banco_talentos (anon access para inserção de currículos)
DO $$
BEGIN
  -- Verificar se política já existe antes de criar
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'banco_talentos' AND policyname = 'anon_insert_banco_curriculos'
  ) THEN
    EXECUTE 'CREATE POLICY "anon_insert_banco_curriculos" ON banco_talentos FOR INSERT TO anon WITH CHECK (categoria = ''banco_curriculos'')';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'banco_talentos' AND policyname = 'anon_select_banco_curriculos'
  ) THEN
    EXECUTE 'CREATE POLICY "anon_select_banco_curriculos" ON banco_talentos FOR SELECT TO anon USING (true)';
  END IF;
END $$;

-- Policies auth para banco_talentos (update/delete)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'banco_talentos' AND policyname = 'auth_update_banco_talentos'
  ) THEN
    EXECUTE 'CREATE POLICY "auth_update_banco_talentos" ON banco_talentos FOR UPDATE TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'banco_talentos' AND policyname = 'auth_delete_banco_talentos'
  ) THEN
    EXECUTE 'CREATE POLICY "auth_delete_banco_talentos" ON banco_talentos FOR DELETE TO authenticated USING (true)';
  END IF;
END $$;

-- Policies para rh_candidatos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rh_candidatos' AND policyname = 'auth_delete_candidatos'
  ) THEN
    EXECUTE 'CREATE POLICY "auth_delete_candidatos" ON rh_candidatos FOR DELETE TO authenticated USING (true)';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rh_candidatos' AND policyname = 'auth_update_candidatos'
  ) THEN
    EXECUTE 'CREATE POLICY "auth_update_candidatos" ON rh_candidatos FOR UPDATE TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- Policies para rh_candidaturas (delete)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rh_candidaturas' AND policyname = 'auth_delete_candidaturas'
  ) THEN
    EXECUTE 'CREATE POLICY "auth_delete_candidaturas" ON rh_candidaturas FOR DELETE TO authenticated USING (true)';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rh_candidaturas' AND policyname = 'auth_update_candidaturas'
  ) THEN
    EXECUTE 'CREATE POLICY "auth_update_candidaturas" ON rh_candidaturas FOR UPDATE TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

-- Policies para rh_cargos (update/delete)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rh_cargos' AND policyname = 'auth_update_cargos'
  ) THEN
    EXECUTE 'CREATE POLICY "auth_update_cargos" ON rh_cargos FOR UPDATE TO authenticated USING (true) WITH CHECK (true)';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rh_cargos' AND policyname = 'auth_delete_cargos'
  ) THEN
    EXECUTE 'CREATE POLICY "auth_delete_cargos" ON rh_cargos FOR DELETE TO authenticated USING (true)';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rh_cargos' AND policyname = 'auth_insert_cargos'
  ) THEN
    EXECUTE 'CREATE POLICY "auth_insert_cargos" ON rh_cargos FOR INSERT TO authenticated WITH CHECK (true)';
  END IF;
END $$;
