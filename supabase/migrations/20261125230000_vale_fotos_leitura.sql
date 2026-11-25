-- Vale Ditado: o envio de foto pelo admin (/vales) dava "new row violates row-level security policy".
-- O Storage grava o arquivo com INSERT ... RETURNING, e o RETURNING precisa de uma regra de leitura (SELECT).
-- A pasta vale-fotos tinha regra de inserir, alterar e apagar para o gerente, mas não de ler.
-- As fotos já são públicas pelo link (bucket público); esta regra só deixa o gerente ler no envio.
drop policy if exists vale_fotos_gerente_le on storage.objects;
create policy vale_fotos_gerente_le on storage.objects
  for select to authenticated
  using (bucket_id = 'vale-fotos' and public.fn_vale_pode(true));
