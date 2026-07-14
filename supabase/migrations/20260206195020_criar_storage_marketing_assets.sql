/*
  # Criar Storage para Ativos de Marketing

  ## Descrição
  Cria bucket de storage para armazenar ativos de marketing (imagens, vídeos, documentos)
  com políticas de segurança apropriadas.

  ## Storage Bucket
  - `marketing-assets` - Armazenamento de todos os ativos

  ## Políticas
  - Usuários autenticados podem fazer upload
  - Usuários autenticados podem visualizar
  - Usuários autenticados podem atualizar/deletar seus próprios ativos
*/

-- Criar bucket de storage
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'marketing-assets',
  'marketing-assets',
  false,
  52428800, -- 50MB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    'video/mp4',
    'video/quicktime',
    'video/webm',
    'application/pdf',
    'audio/mpeg',
    'audio/wav'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Políticas de storage
CREATE POLICY "Usuários autenticados podem fazer upload de ativos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'marketing-assets');

CREATE POLICY "Usuários autenticados podem visualizar ativos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'marketing-assets');

CREATE POLICY "Usuários autenticados podem atualizar ativos"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'marketing-assets')
  WITH CHECK (bucket_id = 'marketing-assets');

CREATE POLICY "Usuários autenticados podem deletar ativos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'marketing-assets');
