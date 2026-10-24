-- A Casa ao Vivo: maquete 3D da noite (clientes por praça de garçom, a partir
-- da ZIG). Só gerentes: módulo "casa" (o master vê tudo).
insert into public.modulos_sistema (nome, slug, icone, cor, ordem, ativo)
values ('A Casa ao Vivo', 'casa', 'Gamepad2', 'from-amber-600 to-red-800', 12, true)
on conflict (slug) do nothing;

insert into public.permissoes_usuario (usuario_id, modulo_id, aba_id, pode_visualizar, pode_criar, pode_editar, pode_excluir, pode_aprovar, observacoes)
select u.id, m.id, null, true, true, true, false, false, 'Gerente: A Casa ao Vivo'
  from public.usuarios_sistema u cross join public.modulos_sistema m
 where m.slug = 'casa'
   and u.id in ('701e034b-a494-49ff-ab30-97dbdcf34db3',  -- Cristiano
                '157d9179-7ae4-4159-84be-8759c839a0d7')  -- Gilberto
on conflict do nothing;

-- Quem pode ver a casa: master, ou quem tem o módulo "casa" liberado.
create or replace function public.fn_casa_pode()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((
    select u.ativo and (
      u.nivel = 'master'
      or exists (
        select 1 from permissoes_usuario p
          join modulos_sistema m on m.id = p.modulo_id
         where p.usuario_id = u.id and m.slug = 'casa' and p.aba_id is null and p.pode_visualizar)
    )
    from usuarios_sistema u where u.id = fn_usuario_sistema_id()), false)
$function$;

revoke execute on function public.fn_casa_pode() from public, anon;
grant execute on function public.fn_casa_pode() to authenticated;

-- Onde o gerente arrastou cada praça de garçom na maquete (fica para as
-- próximas noites).
create table if not exists public.casa_pracas (
  garcom text primary key,
  x numeric not null,
  z numeric not null,
  atualizado_por text,
  atualizado_em timestamptz not null default now()
);
alter table public.casa_pracas enable row level security;
create policy casa_pracas_ler on public.casa_pracas for select to authenticated using (fn_casa_pode());
create policy casa_pracas_gravar on public.casa_pracas for insert to authenticated with check (fn_casa_pode());
create policy casa_pracas_mudar on public.casa_pracas for update to authenticated using (fn_casa_pode()) with check (fn_casa_pode());
