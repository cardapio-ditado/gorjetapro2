/*
  # Criar Storage para Áudios de Entrevistas

  1. Criar bucket para áudios
  2. Configurar políticas de acesso
*/

-- Criar bucket para áudios de entrevistas
INSERT INTO storage.buckets (id, name, public)
VALUES ('entrevistas-audio', 'entrevistas-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Permitir upload para usuários autenticados
CREATE POLICY "Authenticated users can upload audio"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'entrevistas-audio');

-- Permitir leitura pública dos áudios
CREATE POLICY "Anyone can view audio"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'entrevistas-audio');

-- Permitir atualização para usuários autenticados
CREATE POLICY "Authenticated users can update audio"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'entrevistas-audio')
WITH CHECK (bucket_id = 'entrevistas-audio');

-- Permitir exclusão para usuários autenticados
CREATE POLICY "Authenticated users can delete audio"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'entrevistas-audio');
