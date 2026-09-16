-- ═══════════════════════════════════════════════════════════════════════════
-- LISTA DA RUA: "NÃO ACHEI" SÓ NO FIM
--
-- O comprador passa por vários mercados com a mesma lista. No meio do
-- caminho um item ou foi comprado ou ainda não. "Não encontrado" é decisão
-- de fim de rodada: ao terminar, o que sobrou é marcado de uma vez e volta
-- a aparecer em Compras no dia seguinte.
-- ═══════════════════════════════════════════════════════════════════════════

-- Lista só fecha sozinha quando TUDO foi comprado.
create or replace function public.atualizar_contadores_lista()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lista uuid := coalesce(new.lista_id, old.lista_id); v_total int; v_comprados int; v_nao int;
begin
  select count(*), count(*) filter (where comprado), count(*) filter (where nao_encontrado and not comprado)
    into v_total, v_comprados, v_nao
    from listas_compra_itens where lista_id = v_lista;
  update listas_compra
     set total_itens = v_total, itens_comprados = v_comprados, itens_nao_encontrados = v_nao,
         valor_estimado = (select coalesce(sum(custo_estimado), 0) from listas_compra_itens where lista_id = v_lista),
         valor_pago = (select coalesce(sum(valor_pago), 0) from listas_compra_itens where lista_id = v_lista and comprado),
         status = case when v_total > 0 and v_comprados = v_total and status in ('aberta', 'em_andamento') then 'concluida'
                       when v_comprados > 0 and v_comprados < v_total and status = 'aberta' then 'em_andamento'
                       else status end,
         concluido_em = case when v_total > 0 and v_comprados = v_total and status in ('aberta', 'em_andamento') then now() else concluido_em end,
         atualizado_em = now()
   where id = v_lista;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

-- Terminar a rodada: o que não foi comprado vira "não encontrado" e a lista fecha.
create or replace function public.fn_lista_publica_terminar(p_lista_id uuid)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_nao int;
begin
  if not exists (select 1 from listas_compra where id = p_lista_id and status in ('aberta', 'em_andamento')) then
    raise exception 'Lista não encontrada ou já fechada';
  end if;
  update listas_compra_itens
     set nao_encontrado = true
   where lista_id = p_lista_id and comprado = false;
  get diagnostics v_nao = row_count;
  update listas_compra
     set status = 'concluida', concluido_em = now(), atualizado_em = now()
   where id = p_lista_id;
  return (select jsonb_build_object('lista_id', id, 'status', status, 'itens', total_itens, 'comprados', itens_comprados,
                                    'nao_encontrados', itens_nao_encontrados, 'valor_pago', valor_pago)
            from listas_compra where id = p_lista_id);
end;
$$;

-- O "não achei" por item sai; o link só usa comprar / desfazer / terminar.
drop function if exists public.fn_lista_publica_nao_encontrei(uuid);
drop function if exists public.fn_lista_publica_concluir(uuid);

grant execute on function public.fn_lista_publica_terminar(uuid) to anon, authenticated, service_role;
