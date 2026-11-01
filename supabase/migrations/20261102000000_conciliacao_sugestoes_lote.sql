-- Conciliação: as sugestões de todas as saídas pendentes numa chamada só
-- (antes a tela fazia uma chamada por linha). Roda com a permissão de quem
-- chama: banco_extrato só devolve linhas para quem tem o Financeiro.
create or replace function public.fn_banco_sugestoes(p_ids uuid[])
returns table (id uuid, sugestao jsonb)
language sql stable set search_path = public as $$
  select e.id, fn_conciliacao_sugerir(coalesce(e.contraparte_nome, e.descricao, ''), e.valor, e.data, null)
    from banco_extrato e
   where e.id = any (p_ids)
$$;

revoke execute on function public.fn_banco_sugestoes(uuid[]) from public, anon;
grant execute on function public.fn_banco_sugestoes(uuid[]) to authenticated, service_role;
