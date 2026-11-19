-- KDS (Kadu, 18/11/2026): o burguer sai da parrilla (o hambúrguer, com ponto) e a
-- cozinha só recebe "Montar o burguer" quando a parrilla toca Pronto.
-- espera_parrilla marca a linha da cozinha que espera a carne da parrilla.
alter table public.kds_pratos add column if not exists espera_parrilla boolean not null default false;
