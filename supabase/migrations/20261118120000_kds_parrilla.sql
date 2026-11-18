-- KDS da parrilla (Kadu, 18/11/2026): a carne dos assados, executivos, chapas e
-- do queijo coalho na brasa vai para a tela da parrilla, separada por ponto; os
-- acompanhamentos do mesmo prato vão para a cozinha (parte = 'acomp').
--   ponto          o ponto que veio da ZIG (complemento "Ponto da carne") ou da observação
--   ponto_origem   'zig' ou 'obs'
--   precisa_ponto  carne que leva ponto (porco, frango, costela e queijo não levam)
--   ponto_manual   o ponto que o parrilleiro marcou no tablet (o garçom passou depois)
alter table public.kds_pratos drop constraint if exists kds_pratos_setor_check;
alter table public.kds_pratos add constraint kds_pratos_setor_check
  check (setor in ('cozinha', 'bar', 'drinks', 'parrilla'));

alter table public.kds_pratos
  add column if not exists parte text check (parte in ('carne', 'acomp')),
  add column if not exists ponto text check (ponto in ('mal', 'ponto_mal', 'ponto', 'ponto_bem', 'bem')),
  add column if not exists ponto_origem text check (ponto_origem in ('zig', 'obs')),
  add column if not exists precisa_ponto boolean not null default false,
  add column if not exists ponto_manual text check (ponto_manual in ('mal', 'ponto_mal', 'ponto', 'ponto_bem', 'bem')),
  add column if not exists ponto_por text,
  add column if not exists ponto_em timestamptz;

update public.modulos_sistema set nome = 'KDS (cozinha, parrilla, bar e drinks)' where slug = 'kds';
