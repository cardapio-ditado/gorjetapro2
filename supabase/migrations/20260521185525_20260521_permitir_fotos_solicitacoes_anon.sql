/*
  # Permitir upload de fotos em solicitações por usuários anônimos

  ## Objetivo
  Permitir que usuários sem autenticação (que enviam solicitações via link público)
  possam fazer upload de fotos na tabela solicitacoes_anexos e no bucket de storage.

  ## Mudanças
  1. Nova policy INSERT para anon em solicitacoes_anexos (apenas para solicitações públicas)
  2. Nova policy INSERT para anon no bucket de storage solicitacoes-anexos
  3. Nova policy SELECT para anon no bucket de storage (para visualização)
*/

-- Policy: anon pode inserir anexos em solicitações de origem 'publica'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'solicitacoes_anexos' AND policyname = 'Anon pode inserir fotos em solicitacoes publicas'
  ) THEN
    CREATE POLICY "Anon pode inserir fotos em solicitacoes publicas"
      ON solicitacoes_anexos
      FOR INSERT
      TO anon
      WITH CHECK (
        EXISTS (
          SELECT 1 FROM solicitacoes
          WHERE solicitacoes.id = solicitacao_id
            AND solicitacoes.origem = 'publica'
        )
      );
  END IF;
END $$;

-- Policy: anon pode ler anexos de solicitações públicas
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'solicitacoes_anexos' AND policyname = 'Anon pode ler anexos de solicitacoes publicas'
  ) THEN
    CREATE POLICY "Anon pode ler anexos de solicitacoes publicas"
      ON solicitacoes_anexos
      FOR SELECT
      TO anon
      USING (
        EXISTS (
          SELECT 1 FROM solicitacoes
          WHERE solicitacoes.id = solicitacao_id
            AND solicitacoes.origem = 'publica'
        )
      );
  END IF;
END $$;

-- Policy storage: anon pode fazer upload no bucket solicitacoes-anexos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
      AND schemaname = 'storage'
      AND policyname = 'Anon upload fotos solicitacoes'
  ) THEN
    CREATE POLICY "Anon upload fotos solicitacoes"
      ON storage.objects
      FOR INSERT
      TO anon
      WITH CHECK (bucket_id = 'solicitacoes-anexos');
  END IF;
END $$;

-- Policy storage: anon pode ler objetos do bucket solicitacoes-anexos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'objects'
      AND schemaname = 'storage'
      AND policyname = 'Anon ler fotos solicitacoes'
  ) THEN
    CREATE POLICY "Anon ler fotos solicitacoes"
      ON storage.objects
      FOR SELECT
      TO anon
      USING (bucket_id = 'solicitacoes-anexos');
  END IF;
END $$;
