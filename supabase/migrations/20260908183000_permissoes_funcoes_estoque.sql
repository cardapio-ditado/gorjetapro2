-- As funções novas de reposição e pedido são security definer e leem o estoque
-- inteiro; por padrão o Postgres deixa qualquer papel executá-las (PUBLIC).
-- Restringe a usuários logados e à service role.
revoke execute on function public.fn_reposicao_central(integer, integer) from public, anon;
revoke execute on function public.fn_sugerir_reposicao_local(uuid) from public, anon;
revoke execute on function public.fn_gerar_pedido_compra(uuid, jsonb, text) from public, anon;
revoke execute on function public.fn_gerar_lista_rua(jsonb, text) from public, anon;
revoke execute on function public.fn_lista_compra_gerar_pedidos(uuid) from public, anon;
revoke execute on function public.fn_registrar_uso_mapeamento_zig(text) from public, anon;

grant execute on function public.fn_reposicao_central(integer, integer) to authenticated, service_role;
grant execute on function public.fn_sugerir_reposicao_local(uuid) to authenticated, service_role;
grant execute on function public.fn_gerar_pedido_compra(uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.fn_gerar_lista_rua(jsonb, text) to authenticated, service_role;
grant execute on function public.fn_lista_compra_gerar_pedidos(uuid) to authenticated, service_role;
grant execute on function public.fn_registrar_uso_mapeamento_zig(text) to service_role;
