/*
  # Criar bucket de currículos e políticas de acesso

  Bucket: curriculos-candidatos (privado, max 10MB)
*/

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'curriculos-candidatos',
  'curriculos-candidatos',
  false,
  10485760,
  ARRAY['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','image/jpeg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'auth_select_curriculos') THEN
    CREATE POLICY "auth_select_curriculos" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'curriculos-candidatos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'auth_insert_curriculos') THEN
    CREATE POLICY "auth_insert_curriculos" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'curriculos-candidatos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'auth_update_curriculos') THEN
    CREATE POLICY "auth_update_curriculos" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'curriculos-candidatos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'auth_delete_curriculos') THEN
    CREATE POLICY "auth_delete_curriculos" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'curriculos-candidatos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'anon_insert_curriculos') THEN
    CREATE POLICY "anon_insert_curriculos" ON storage.objects FOR INSERT TO anon WITH CHECK (bucket_id = 'curriculos-candidatos');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage' AND policyname = 'anon_select_curriculos') THEN
    CREATE POLICY "anon_select_curriculos" ON storage.objects FOR SELECT TO anon USING (bucket_id = 'curriculos-candidatos');
  END IF;
END $$;
