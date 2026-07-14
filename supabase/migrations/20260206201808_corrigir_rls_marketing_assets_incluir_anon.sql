/*
  # Corrigir RLS Marketing Assets - Incluir anon

  ## Descricao
  Os outros buckets que funcionam (fotos, solicitacoes-anexos) permitem
  acesso anon nas operacoes de upload/update/delete. O bucket marketing-assets
  precisa do mesmo padrao para funcionar no ambiente da aplicacao.

  ## Alteracoes
  - Remove politicas antigas que so permitem authenticated
  - Recria politicas permitindo anon e authenticated para INSERT, UPDATE, DELETE
*/

DROP POLICY IF EXISTS "Usuários autenticados podem fazer upload de ativos" ON storage.objects;
DROP POLICY IF EXISTS "Usuários autenticados podem atualizar ativos" ON storage.objects;
DROP POLICY IF EXISTS "Usuários autenticados podem deletar ativos" ON storage.objects;
DROP POLICY IF EXISTS "Usuários autenticados podem visualizar ativos" ON storage.objects;

CREATE POLICY "Marketing assets upload"
  ON storage.objects FOR INSERT
  TO anon, authenticated
  WITH CHECK (bucket_id = 'marketing-assets');

CREATE POLICY "Marketing assets select"
  ON storage.objects FOR SELECT
  TO anon, authenticated
  USING (bucket_id = 'marketing-assets');

CREATE POLICY "Marketing assets update"
  ON storage.objects FOR UPDATE
  TO anon, authenticated
  USING (bucket_id = 'marketing-assets')
  WITH CHECK (bucket_id = 'marketing-assets');

CREATE POLICY "Marketing assets delete"
  ON storage.objects FOR DELETE
  TO anon, authenticated
  USING (bucket_id = 'marketing-assets');
