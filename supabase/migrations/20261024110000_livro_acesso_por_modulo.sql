-- Livro da Noite: além de admin/master, vale para quem tem o módulo "livro"
-- liberado (ex.: gerente de turno com nível usuário e só alguns módulos).
create or replace function public.fn_livro_pode()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select coalesce((
    select u.ativo and (
      u.nivel in ('admin', 'master')
      or exists (
        select 1 from permissoes_usuario p
          join modulos_sistema m on m.id = p.modulo_id
         where p.usuario_id = u.id and m.slug = 'livro' and p.aba_id is null and p.pode_visualizar)
    )
    from usuarios_sistema u where u.id = fn_usuario_sistema_id()), false)
$function$;
