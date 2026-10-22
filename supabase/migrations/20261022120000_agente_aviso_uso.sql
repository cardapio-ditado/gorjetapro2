-- O aviso da Meta ("toque em Ver") passa a ser marcado com uso.aviso.
-- uso.modelo é o modelo de IA de cada resposta do agente: usado para marcar o
-- aviso, tirava as respostas do histórico do agente e da tela de conversas.

update public.agente_mensagens
   set uso = jsonb_build_object('aviso', uso ->> 'modelo')
 where direcao = 'saida' and uso ->> 'modelo' = 'aviso_estoque';

create or replace function public.fn_agente_conversa(p_equipe uuid, p_antes bigint default null, p_limite integer default 60)
returns jsonb
language plpgsql
stable security definer
set search_path to 'public'
as $function$
begin
  if not fn_agente_ponte_eh_gestor() then
    raise exception 'Só admin ou master vê as conversas do agente.';
  end if;
  return coalesce((
    select jsonb_agg(x order by x.id)
    from (
      select m.id, m.direcao, m.tipo, m.texto, m.midia_path, m.status, m.entrega, m.erro, m.criado_em,
             (m.uso ->> 'manual') is not null as manual, m.uso ->> 'por' as por, m.uso ->> 'aviso' as aviso,
             case when (m.leitura ->> 'ok')::boolean then jsonb_build_object(
               'fornecedor', m.leitura #>> '{nota,fornecedor}', 'numero', m.leitura #>> '{nota,numero}',
               'total', m.leitura #>> '{nota,total}') end as nota
        from agente_mensagens m
       where m.equipe_id = p_equipe
         and m.status not in ('ignorada', 'simulada')
         and (p_antes is null or m.id < p_antes)
       order by m.id desc
       limit greatest(1, least(coalesce(p_limite, 60), 200))
    ) x), '[]'::jsonb);
end
$function$;
