-- Segurança, lote 2 parte 2 (Kadu, 27/11/2026): funções SECURITY DEFINER (rodam com permissão do dono e ignoram RLS)
-- que qualquer visitante podia chamar pela chave pública (anon). Entre elas executar_sql_seguro,
-- create_user_if_not_exists, recalcular_saldos_do_zero, relatórios de estoque, portal de fidelidade.
-- Agora só quem está logado (authenticated), o servidor (service_role) e o papel de leitura da IA (ia_leitura) chamam.
-- Ficam abertas para anon só as funções das páginas públicas:
--   lista de compras pública, conferência de compras, pedido do setor/abastecimento, reserva pelo link, contador do site,
--   Vale Ditado (vitrine, pedido, consulta, regulamento), contagem pelo celular (lote 3), perfil e troca de senha.
-- Funções de gatilho ficam como estão (não dá para chamá-las pela API).
-- Nenhum dado muda.
do $$
declare
  f record;
  publicas text[] := array[
    'fn_abastecimento_dados','fn_abastecimento_enviar',
    'fn_conferencia_anotar','fn_conferencia_apagar','fn_conferencia_publica',
    'fn_lista_publica','fn_lista_publica_comprar','fn_lista_publica_marcar','fn_lista_publica_terminar',
    'fn_pedido_setor_dados','fn_pedido_setor_enviar','fn_pedido_setor_estoque',
    'fn_reserva_publica','fn_site_registrar',
    'fn_vale_consultar','fn_vale_pedido_publico','fn_vale_regulamento','fn_vale_vitrine',
    'bulk_import_contagem_itens','cancelar_contagem_estoque','finalizar_contagem_estoque',
    'processar_contagem_estoque','reabrir_contagem_estoque',
    'fn_marcar_senha_trocada','fn_perfil_atual'];
begin
  for f in
    select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) args
    from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' and p.prosecdef
      and p.prorettype <> 'trigger'::regtype
      and has_function_privilege('anon', p.oid, 'execute')
      and p.proname <> all (publicas)
  loop
    execute format('revoke execute on function public.%I(%s) from public, anon', f.proname, f.args);
    execute format('grant execute on function public.%I(%s) to authenticated, service_role, ia_leitura', f.proname, f.args);
  end loop;
end $$;
