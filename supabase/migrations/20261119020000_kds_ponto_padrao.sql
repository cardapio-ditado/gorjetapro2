-- KDS (Kadu, 18/11/2026): pratos sem a opção de ponto na ZIG (picanha na chapa c/
-- cascata de queijo e chapa mista) entram sozinhos em "Ao ponto" (ponto_origem 'padrao').
alter table public.kds_pratos drop constraint if exists kds_pratos_ponto_origem_check;
alter table public.kds_pratos add constraint kds_pratos_ponto_origem_check
  check (ponto_origem = any (array['zig'::text, 'obs'::text, 'padrao'::text]));
