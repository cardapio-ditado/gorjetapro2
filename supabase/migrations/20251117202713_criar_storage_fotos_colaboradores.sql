/*
  # Criar storage para fotos de colaboradores

  1. Storage
    - Criar bucket 'fotos' para armazenar fotos dos colaboradores
    - Configurar políticas públicas de leitura
    - Configurar políticas de upload para usuários autenticados
*/

-- Criar bucket de fotos se não existir
INSERT INTO storage.buckets (id, name, public)
VALUES ('fotos', 'fotos', true)
ON CONFLICT (id) DO NOTHING;

-- Remover políticas antigas se existirem
DROP POLICY IF EXISTS "Public Access" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete" ON storage.objects;

-- Criar políticas
CREATE POLICY "Public Access"
ON storage.objects FOR SELECT
USING (bucket_id = 'fotos');

CREATE POLICY "Authenticated users can upload"
ON storage.objects FOR INSERT
TO authenticated, anon
WITH CHECK (bucket_id = 'fotos');

CREATE POLICY "Authenticated users can update"
ON storage.objects FOR UPDATE
TO authenticated, anon
USING (bucket_id = 'fotos');

CREATE POLICY "Authenticated users can delete"
ON storage.objects FOR DELETE
TO authenticated, anon
USING (bucket_id = 'fotos');
