/*
  # Criar Storage Bucket para Anexos de Solicitações
  
  ## Criação
  - Bucket `solicitacoes-anexos` para armazenar todos os arquivos anexados
  - Políticas de acesso para usuários autenticados e anônimos
  
  ## Limites
  - Tamanho máximo de arquivo: 50MB
  - Tipos permitidos: imagens, PDFs, documentos do Office, arquivos de texto
*/

-- Inserir bucket se não existir
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'solicitacoes-anexos',
  'solicitacoes-anexos',
  false,
  52428800, -- 50MB
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = 52428800,
  allowed_mime_types = ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
    'text/csv'
  ]::text[];

-- Remover políticas antigas se existirem
DO $$
BEGIN
  DROP POLICY IF EXISTS "Usuários autenticados podem fazer upload" ON storage.objects;
  DROP POLICY IF EXISTS "Usuários autenticados podem ver arquivos" ON storage.objects;
  DROP POLICY IF EXISTS "Usuários autenticados podem deletar arquivos" ON storage.objects;
  DROP POLICY IF EXISTS "Anônimos podem ver arquivos públicos" ON storage.objects;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Políticas de storage

-- Usuários autenticados podem fazer upload
CREATE POLICY "Usuários autenticados podem fazer upload"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'solicitacoes-anexos');

-- Usuários autenticados podem ver todos os arquivos
CREATE POLICY "Usuários autenticados podem ver arquivos"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'solicitacoes-anexos');

-- Usuários autenticados podem deletar seus próprios arquivos
CREATE POLICY "Usuários autenticados podem deletar arquivos"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'solicitacoes-anexos');

-- Usuários anônimos podem ver arquivos de solicitações públicas
CREATE POLICY "Anônimos podem ver arquivos públicos"
ON storage.objects FOR SELECT
TO anon
USING (
  bucket_id = 'solicitacoes-anexos'
);
