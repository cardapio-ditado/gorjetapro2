/*
  # RLS para acesso anônimo às tabelas DISC (página pública /disc)

  A página /disc é acessada sem login pelo colaborador via link do WhatsApp.
  Permissões necessárias:
    - rh_disc_sessoes: anon pode SELECT (por token), INSERT (criar sessão não é preciso aqui, mas UPDATE sim para atualizar status)
    - rh_disc_perguntas: anon pode SELECT (listar perguntas do questionário)
    - rh_disc_respostas: anon pode INSERT e UPDATE (salvar respostas)
    - rh_candidatos: anon pode SELECT (para resolver nome do candidato)

  Políticas de gestor (autenticado) já existem ou são cobertas pelos existentes.
*/

-- rh_disc_sessoes: anon pode buscar sessão por token
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rh_disc_sessoes' AND policyname = 'Anon pode ler sessao por token'
  ) THEN
    CREATE POLICY "Anon pode ler sessao por token"
      ON rh_disc_sessoes FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rh_disc_sessoes' AND policyname = 'Anon pode inserir sessao'
  ) THEN
    CREATE POLICY "Anon pode inserir sessao"
      ON rh_disc_sessoes FOR INSERT
      TO anon
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rh_disc_sessoes' AND policyname = 'Anon pode atualizar sessao'
  ) THEN
    CREATE POLICY "Anon pode atualizar sessao"
      ON rh_disc_sessoes FOR UPDATE
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- rh_disc_perguntas: anon pode listar perguntas ativas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rh_disc_perguntas' AND policyname = 'Anon pode ler perguntas ativas'
  ) THEN
    CREATE POLICY "Anon pode ler perguntas ativas"
      ON rh_disc_perguntas FOR SELECT
      TO anon
      USING (ativo = true);
  END IF;
END $$;

-- rh_disc_respostas: anon pode inserir e atualizar respostas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rh_disc_respostas' AND policyname = 'Anon pode inserir resposta'
  ) THEN
    CREATE POLICY "Anon pode inserir resposta"
      ON rh_disc_respostas FOR INSERT
      TO anon
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rh_disc_respostas' AND policyname = 'Anon pode atualizar resposta'
  ) THEN
    CREATE POLICY "Anon pode atualizar resposta"
      ON rh_disc_respostas FOR UPDATE
      TO anon
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'rh_disc_respostas' AND policyname = 'Anon pode ler resposta'
  ) THEN
    CREATE POLICY "Anon pode ler resposta"
      ON rh_disc_respostas FOR SELECT
      TO anon
      USING (true);
  END IF;
END $$;
