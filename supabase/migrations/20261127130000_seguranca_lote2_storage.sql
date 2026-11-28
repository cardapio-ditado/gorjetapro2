-- Segurança, lote 2 parte 3 (Kadu, 27/11/2026): arquivos (Storage).
-- Visitante sem login (anon) podia listar, baixar, enviar, trocar e apagar arquivos em várias pastas:
-- currículos de candidatos, áudios de entrevista, fotos de colaboradores, comprovantes, documentos da Deville,
-- anexos de tarefas e marketing. Agora essas regras valem só para quem está logado (authenticated).
-- Pastas públicas continuam servindo o arquivo pelo endereço público que o sistema já grava (as fotos e
-- documentos não quebram); o que sai é a listagem e a escrita sem login.
-- Fica como está a pasta solicitacoes-anexos, usada pela página pública de solicitação (lote 3).
alter policy "Acesso público leitura marketing-assets" on storage.objects to authenticated;
alter policy "Anon update deville-documentos" on storage.objects to authenticated;
alter policy "Anon upload deville-documentos" on storage.objects to authenticated;
alter policy "Anyone can view audio" on storage.objects to authenticated;
alter policy "Authenticated users can delete" on storage.objects to authenticated;
alter policy "Authenticated users can update" on storage.objects to authenticated;
alter policy "Authenticated users can upload" on storage.objects to authenticated;
alter policy "Marketing assets delete" on storage.objects to authenticated;
alter policy "Marketing assets select" on storage.objects to authenticated;
alter policy "Marketing assets update" on storage.objects to authenticated;
alter policy "Marketing assets upload" on storage.objects to authenticated;
alter policy "Public Access" on storage.objects to authenticated;
alter policy "Public read deville-documentos" on storage.objects to authenticated;
alter policy anon_insert_curriculos on storage.objects to authenticated;
alter policy anon_select_curriculos on storage.objects to authenticated;
alter policy copa_delete_publico on storage.objects to authenticated;
alter policy copa_leitura_publica on storage.objects to authenticated;
alter policy copa_update_publico on storage.objects to authenticated;
alter policy copa_upload_publico on storage.objects to authenticated;
alter policy credito_delete on storage.objects to authenticated;
alter policy credito_select on storage.objects to authenticated;
alter policy credito_update on storage.objects to authenticated;
alter policy credito_upload on storage.objects to authenticated;
alter policy tarefas_anexos_storage_delete on storage.objects to authenticated;
alter policy tarefas_anexos_storage_insert on storage.objects to authenticated;
alter policy tarefas_anexos_storage_select on storage.objects to authenticated;
-- solicitacoes-anexos: a página pública só envia e mostra a foto; apagar e trocar só logado.
alter policy "Permitir delete para todos" on storage.objects to authenticated;
alter policy "Permitir update para todos" on storage.objects to authenticated;
