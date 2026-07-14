/*
  # Permitir upload anônimo no bucket deville-documentos

  O bucket já tem política SELECT pública e INSERT apenas para autenticados.
  Esta migração adiciona política INSERT para usuários anônimos (role anon),
  necessário pois o app usa o cliente sem autenticação de sessão.
*/

CREATE POLICY "Anon upload deville-documentos"
  ON storage.objects
  FOR INSERT
  TO anon
  WITH CHECK (bucket_id = 'deville-documentos');

CREATE POLICY "Anon update deville-documentos"
  ON storage.objects
  FOR UPDATE
  TO anon
  USING (bucket_id = 'deville-documentos')
  WITH CHECK (bucket_id = 'deville-documentos');
