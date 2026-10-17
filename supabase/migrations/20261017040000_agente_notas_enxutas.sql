-- Notas recentes mais enxutas para o agente (cada caractere vira token pago).
--
-- fn_agente_notas_recentes: tira o id (o agente não usa) e mostra o status só
-- quando a nota não está "recebido" (ex.: cancelada por estorno).
-- fn_agente_notas_fornecedor: só as notas de um fornecedor. É o que o agente
-- precisa para conferir duplicada, em vez da lista de todas as notas.

create or replace function public.fn_agente_notas_recentes(p_dias integer default 3)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'fornecedor', trim(f.nome), 'numero', e.numero_documento,
           'data', e.data_compra, 'valor', e.valor_total,
           'lancada', to_char(e.criado_em at time zone 'America/Cuiaba', 'DD/MM HH24:MI'),
           'itens', (select count(*) from itens_entrada_compra ic where ic.entrada_compra_id = e.id),
           'status', nullif(e.status, 'recebido')))
           order by e.criado_em desc), '[]'::jsonb)
    from entradas_compras e left join fornecedores f on f.id = e.fornecedor_id
   where e.criado_em >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 3), 15)))
$function$;

create or replace function public.fn_agente_notas_fornecedor(p_fornecedor uuid, p_dias integer default 15)
returns jsonb
language sql
stable security definer
set search_path to 'public'
as $function$
  select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
           'numero', e.numero_documento, 'data', e.data_compra, 'valor', e.valor_total,
           'lancada', to_char(e.criado_em at time zone 'America/Cuiaba', 'DD/MM HH24:MI'),
           'itens', (select count(*) from itens_entrada_compra ic where ic.entrada_compra_id = e.id),
           'status', nullif(e.status, 'recebido')))
           order by e.criado_em desc), '[]'::jsonb)
    from entradas_compras e
   where e.fornecedor_id = p_fornecedor
     and e.criado_em >= now() - make_interval(days => greatest(1, least(coalesce(p_dias, 15), 60)))
$function$;

revoke all on function public.fn_agente_notas_fornecedor(uuid, integer) from public, anon, authenticated;
grant execute on function public.fn_agente_notas_fornecedor(uuid, integer) to service_role;
