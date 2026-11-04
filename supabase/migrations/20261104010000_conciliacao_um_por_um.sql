-- Conciliação "um por um": um card por pagamento, com a nota de compra que bate.
--
-- - banco_extrato.adiado_*: "pular, lançar depois", com o motivo (falta a nota,
--   perguntar a quem pagou…). Continua pendente; a lista mostra a etiqueta.
-- - fn_banco_notas_sugeridas: notas de compra (entradas_compras) do fornecedor,
--   ainda sem pagamento ligado, perto da data do Pix. Acha a nota ou a soma de
--   até 3 notas que dá o valor pago (ex.: Pix de R$ 2.036 = espelhos 100215 +
--   100226 da De Ville).
-- - fn_banco_vincular_notas: liga as notas à conta a pagar criada na
--   conciliação (entradas_compras.conta_pagar_id), para a nota aparecer paga.

alter table public.banco_extrato add column if not exists adiado_motivo text;
alter table public.banco_extrato add column if not exists adiado_em timestamptz;
alter table public.banco_extrato add column if not exists adiado_por uuid;

create or replace function public.fn_banco_notas_sugeridas(p_fornecedor uuid, p_valor numeric, p_data date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c record;
  ids uuid[] := '{}'; vals numeric[] := '{}'; dias int[] := '{}';
  n int; i int; j int; k int;
  tol numeric := greatest(2, coalesce(p_valor, 0) * 0.01);     -- uma nota: até 1%
  tol_soma numeric := greatest(1, coalesce(p_valor, 0) * 0.0005); -- soma de 2 notas: quase exata
  tol_tres numeric := 0.10;                                        -- soma de 3: no centavo (com 3 notas, coincidência é fácil)
  melhor uuid[]; melhor_dif numeric; melhor_dias int; dif numeric; d int;
  notas jsonb;
begin
  if not fn_financeiro_pode() then raise exception 'Sem acesso ao financeiro'; end if;
  if p_fornecedor is null or p_valor is null then return jsonb_build_object('notas', '[]'::jsonb, 'combinacao', '[]'::jsonb); end if;

  for c in
    select e.id, e.valor_total v, abs(e.data_compra - p_data) dd
      from entradas_compras e
     where e.fornecedor_id = p_fornecedor and e.status = 'recebido' and e.conta_pagar_id is null
       and coalesce(e.valor_total, 0) > 0
       and e.data_compra between p_data - 10 and p_data + 3
     order by abs(e.data_compra - p_data), e.data_compra desc
     limit 12
  loop
    ids := ids || c.id; vals := vals || round(c.v, 2); dias := dias || c.dd;
  end loop;
  n := coalesce(array_length(ids, 1), 0);

  -- menos notas primeiro; no empate, a diferença menor e as datas mais perto do Pix
  for i in 1..n loop
    dif := abs(vals[i] - p_valor); d := dias[i];
    if dif <= tol and (melhor is null or dif < melhor_dif or (dif = melhor_dif and d < melhor_dias)) then
      melhor := array[ids[i]]; melhor_dif := dif; melhor_dias := d;
    end if;
  end loop;
  if melhor is null then
    for i in 1..n loop for j in i + 1..n loop
      dif := abs(vals[i] + vals[j] - p_valor); d := dias[i] + dias[j];
      if dif <= tol_soma and (melhor is null or dif < melhor_dif or (dif = melhor_dif and d < melhor_dias)) then
        melhor := array[ids[i], ids[j]]; melhor_dif := dif; melhor_dias := d;
      end if;
    end loop; end loop;
  end if;
  if melhor is null then
    for i in 1..n loop for j in i + 1..n loop for k in j + 1..n loop
      dif := abs(vals[i] + vals[j] + vals[k] - p_valor); d := dias[i] + dias[j] + dias[k];
      if dif <= tol_tres and (melhor is null or dif < melhor_dif or (dif = melhor_dif and d < melhor_dias)) then
        melhor := array[ids[i], ids[j], ids[k]]; melhor_dif := dif; melhor_dias := d;
      end if;
    end loop; end loop; end loop;
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'numero', nullif(trim(coalesce(e.numero_documento, '')), ''), 'data', e.data_compra,
           'valor', round(e.valor_total, 2), 'itens', (select count(*) from itens_entrada_compra ie where ie.entrada_compra_id = e.id))
           order by e.data_compra desc, e.criado_em desc), '[]'::jsonb)
    into notas
    from entradas_compras e where e.id = any(ids);

  return jsonb_build_object('notas', notas, 'combinacao', to_jsonb(coalesce(melhor, '{}'::uuid[])),
    'diferenca', case when melhor is null then null else round(melhor_dif, 2) end);
end $$;

create or replace function public.fn_banco_vincular_notas(p_conta_pagar uuid, p_notas uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not fn_financeiro_pode() then raise exception 'Sem acesso ao financeiro'; end if;
  if p_conta_pagar is null or coalesce(array_length(p_notas, 1), 0) = 0 then return 0; end if;
  update entradas_compras set conta_pagar_id = p_conta_pagar
   where id = any(p_notas) and conta_pagar_id is null;
  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function public.fn_banco_notas_sugeridas(uuid, numeric, date) from public, anon;
revoke all on function public.fn_banco_vincular_notas(uuid, uuid[]) from public, anon;
grant execute on function public.fn_banco_notas_sugeridas(uuid, numeric, date) to authenticated;
grant execute on function public.fn_banco_vincular_notas(uuid, uuid[]) to authenticated;
