-- Corrige a idempotencia do recebimento de compras.
--
-- Antes, a chave era composta por compra_id + item_id. Quando o mesmo item
-- aparecia em duas linhas legitimas da mesma compra, apenas a primeira linha
-- gerava movimentacao. A chave passa a usar o id imutavel da linha da compra,
-- mantendo a protecao contra reprocessamento sem descartar itens repetidos.

create or replace function public.processar_entrada_compra()
returns trigger
language plpgsql
security definer
set search_path = public
as $function$
declare
  item_entrada       record;
  chave_idempotency  text;
  ja_existe          boolean;
  novo_custo_medio   numeric;
  quantidade_efetiva numeric;
begin
  -- Processar somente na primeira transicao para recebido.
  if new.status != 'recebido'
     or (old.status is not null and old.status = 'recebido') then
    return new;
  end if;

  for item_entrada in
    select
      id as linha_id,
      item_id,
      coalesce(quantidade_recebida, quantidade) as quantidade,
      quantidade_pedida,
      quantidade_recebida,
      custo_unitario
    from public.itens_entrada_compra
    where entrada_compra_id = new.id
  loop
    quantidade_efetiva := item_entrada.quantidade;

    if coalesce(quantidade_efetiva, 0) <= 0 then
      continue;
    end if;

    -- Uma chave por linha, nao por item. Duas linhas do mesmo item sao validas.
    chave_idempotency :=
      'compra_' || new.id::text || '_linha_' || item_entrada.linha_id::text;

    select exists (
      select 1
      from public.movimentacoes_estoque
      where idempotency_key = chave_idempotency
    )
    into ja_existe;

    if ja_existe then
      continue;
    end if;

    select
      case
        when se.quantidade_atual > 0 then
          (
            se.quantidade_atual * coalesce(ie.custo_medio, 0)
            + quantidade_efetiva * item_entrada.custo_unitario
          ) / (se.quantidade_atual + quantidade_efetiva)
        else item_entrada.custo_unitario
      end
    into novo_custo_medio
    from public.itens_estoque ie
    left join public.saldos_estoque se
      on se.item_id = ie.id
     and se.estoque_id = new.estoque_destino_id
    where ie.id = item_entrada.item_id;

    update public.itens_estoque
    set custo_medio = coalesce(novo_custo_medio, item_entrada.custo_unitario),
        atualizado_em = now()
    where id = item_entrada.item_id;

    insert into public.movimentacoes_estoque (
      estoque_origem_id,
      estoque_destino_id,
      item_id,
      tipo_movimentacao,
      quantidade,
      custo_unitario,
      custo_total,
      data_movimentacao,
      motivo,
      observacoes,
      origem_tipo,
      origem_id,
      criado_por,
      criado_em,
      idempotency_key
    ) values (
      null,
      new.estoque_destino_id,
      item_entrada.item_id,
      'entrada',
      quantidade_efetiva,
      item_entrada.custo_unitario,
      quantidade_efetiva * item_entrada.custo_unitario,
      new.data_compra,
      'Entrada por compra',
      concat(
        'Compra: ', coalesce(new.numero_documento, ''),
        case
          when item_entrada.quantidade_recebida is not null
               and item_entrada.quantidade_recebida != item_entrada.quantidade_pedida
          then concat(
            ' | Pedido: ', item_entrada.quantidade_pedida,
            ' Recebido: ', item_entrada.quantidade_recebida
          )
          else ''
        end
      ),
      'compra',
      new.id,
      new.criado_por,
      now(),
      chave_idempotency
    );
  end loop;

  return new;
end;
$function$;

comment on function public.processar_entrada_compra() is
  'Gera uma movimentacao por linha recebida, com idempotencia por compra e linha.';

-- A funcao e usada exclusivamente pelo trigger de entradas_compras.
revoke execute on function public.processar_entrada_compra() from public, anon, authenticated;
