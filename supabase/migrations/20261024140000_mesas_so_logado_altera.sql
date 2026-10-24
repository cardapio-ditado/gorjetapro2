-- Mesas: qualquer um continua lendo (a página pública do mapa de mesas lê sem
-- login), mas criar, alterar e apagar só com login (o mapa é editado em
-- Eventos; a reserva da Brasa usa a service role).
alter policy anon_insert_mesas on public.mesas to authenticated;
alter policy anon_update_mesas on public.mesas to authenticated;
alter policy anon_delete_mesas on public.mesas to authenticated;
alter policy anon_insert_mesas on public.mesas rename to mesas_criar_logado;
alter policy anon_update_mesas on public.mesas rename to mesas_alterar_logado;
alter policy anon_delete_mesas on public.mesas rename to mesas_apagar_logado;
