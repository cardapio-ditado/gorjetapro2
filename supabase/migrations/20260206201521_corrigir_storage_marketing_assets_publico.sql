/*
  # Corrigir Storage Marketing Assets

  ## Descrição
  Torna o bucket marketing-assets público para que URLs de ativos
  sejam acessíveis via getPublicUrl().

  ## Alterações
  - Atualiza bucket `marketing-assets` para público
  - Adiciona política de SELECT para acesso anônimo (leitura pública)
*/

UPDATE storage.buckets
SET public = true
WHERE id = 'marketing-assets';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'Acesso público leitura marketing-assets'
  ) THEN
    CREATE POLICY "Acesso público leitura marketing-assets"
      ON storage.objects FOR SELECT
      TO anon
      USING (bucket_id = 'marketing-assets');
  END IF;
END $$;
