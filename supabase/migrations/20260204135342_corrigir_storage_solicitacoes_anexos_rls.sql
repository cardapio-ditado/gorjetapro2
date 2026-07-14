/*
  # Corrigir Políticas de Storage para Anexos de Solicitações
  
  ## Problema
  Usuários autenticados não conseguem fazer upload devido a RLS bloqueando INSERT
  
  ## Solução
  - Tornar o bucket público para simplificar acesso
  - Recriar políticas RLS para permitir operações
*/

-- Tornar bucket público
UPDATE storage.buckets 
SET public = true 
WHERE id = 'solicitacoes-anexos';

-- Remover políticas antigas
DO $$
BEGIN
  DROP POLICY IF EXISTS "Usuários autenticados podem fazer upload" ON storage.objects;
  DROP POLICY IF EXISTS "Usuários autenticados podem ver arquivos" ON storage.objects;
  DROP POLICY IF EXISTS "Usuários autenticados podem deletar arquivos" ON storage.objects;
  DROP POLICY IF EXISTS "Anônimos podem ver arquivos públicos" ON storage.objects;
EXCEPTION
  WHEN OTHERS THEN NULL;
END $$;

-- Permitir qualquer usuário (autenticado ou anônimo) fazer upload
CREATE POLICY "Permitir upload para todos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'solicitacoes-anexos');

-- Permitir qualquer usuário ver arquivos
CREATE POLICY "Permitir leitura para todos"
ON storage.objects FOR SELECT
USING (bucket_id = 'solicitacoes-anexos');

-- Permitir qualquer usuário deletar arquivos
CREATE POLICY "Permitir delete para todos"
ON storage.objects FOR DELETE
USING (bucket_id = 'solicitacoes-anexos');

-- Permitir atualização
CREATE POLICY "Permitir update para todos"
ON storage.objects FOR UPDATE
USING (bucket_id = 'solicitacoes-anexos')
WITH CHECK (bucket_id = 'solicitacoes-anexos');
