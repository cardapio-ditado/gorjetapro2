-- Data das movimentações no dia de Cuiabá.
--
-- O banco roda em UTC, então current_date e o cast de timestamptz para date
-- viram o dia seguinte depois das 20h de Cuiabá. Uma requisição concluída às
-- 22h de 12/10 entrava no estoque como 13/10.
--
-- Corrige: o padrão da coluna, o trigger da requisição interna e as funções
-- que gravam movimentação com current_date. Também acerta a data das
-- transferências por requisição desde 01/10 (o saldo não muda, só o dia).

create or replace function public.fn_hoje_cuiaba()
returns date language sql stable
as $$ select (now() at time zone 'America/Cuiaba')::date $$;

alter table public.movimentacoes_estoque
  alter column data_movimentacao set default public.fn_hoje_cuiaba();

create or replace function public.processar_requisicao_interna()
 returns trigger
 language plpgsql
 security definer
as $function$
declare
  item_req             record;
  quantidade_processar numeric;
  chave_idempotency    text;
  ja_existe            boolean;
begin
  if new.status != 'concluido' or (old.status is not null and old.status = 'concluido') then
    return new;
  end if;

  for item_req in
    select item_id, quantidade_solicitada, quantidade_aprovada, quantidade_entregue
      from requisicoes_internas_itens where requisicao_id = new.id
  loop
    quantidade_processar := coalesce(item_req.quantidade_entregue,
                                     nullif(item_req.quantidade_aprovada, 0),
                                     item_req.quantidade_solicitada);
    if coalesce(quantidade_processar, 0) <= 0 then continue; end if;

    chave_idempotency := 'req_' || new.id::text || '_' || item_req.item_id::text;
    select exists(select 1 from movimentacoes_estoque where idempotency_key = chave_idempotency) into ja_existe;
    if ja_existe then continue; end if;

    insert into movimentacoes_estoque (
      estoque_origem_id, estoque_destino_id, item_id, tipo_movimentacao, quantidade,
      custo_unitario, custo_total, data_movimentacao, motivo, observacoes,
      criado_por, criado_em, origem_id, origem_tipo, idempotency_key)
    select new.estoque_origem_id, new.estoque_destino_id, item_req.item_id, 'transferencia', quantidade_processar,
           coalesce(ie.custo_medio, 0), quantidade_processar * coalesce(ie.custo_medio, 0),
           (coalesce(new.data_requisicao, now()) at time zone 'America/Cuiaba')::date,
           'Transferência por requisição interna',
           concat('Requisição: ', new.numero_requisicao, ' - Solicitante: ', new.funcionario_nome,
                  case when new.setor is not null then concat(' - Setor: ', new.setor) else '' end),
           new.concluido_por, now(), new.id, 'requisicao', chave_idempotency
      from itens_estoque ie where ie.id = item_req.item_id;
  end loop;
  return new;
end;
$function$;

-- Funções que gravavam movimentação com current_date (dia UTC).
do $$
declare f text; def text;
begin
  foreach f in array array['fn_mover_estoques', 'fn_kit_repor', 'fn_setores_mover_item',
                           'fn_pedido_setor_enviar', 'fn_emprestimo_mov', 'fn_producao_mov'] loop
    select pg_get_functiondef(p.oid) into def
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = f;
    if def is null or position('current_date' in def) = 0 then continue; end if;
    execute replace(def, 'current_date', 'public.fn_hoje_cuiaba()');
  end loop;
end $$;

-- Transferências por requisição já gravadas com o dia UTC.
update public.movimentacoes_estoque m
   set data_movimentacao = (r.data_requisicao at time zone 'America/Cuiaba')::date
  from public.requisicoes_internas r
 where r.id = m.origem_id
   and m.origem_tipo = 'requisicao'
   and m.data_movimentacao >= date '2026-10-01'
   and m.data_movimentacao <> (r.data_requisicao at time zone 'America/Cuiaba')::date;
