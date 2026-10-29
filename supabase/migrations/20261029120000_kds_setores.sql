-- KDS em três setores: cozinha (ponto COZINHA da ZIG), bar e drinks (pela
-- categoria do produto: a ZIG manda drinks pelo ponto CHOPP e água de coco
-- pelo ponto DRINK, então o ponto não serve para separar os dois).
alter table public.kds_pratos add column if not exists setor text not null default 'cozinha'
  check (setor in ('cozinha', 'bar', 'drinks'));
create index if not exists kds_pratos_noite_setor on public.kds_pratos (noite, setor);
update public.modulos_sistema set nome = 'KDS (cozinha, bar e drinks)' where slug = 'kds';
