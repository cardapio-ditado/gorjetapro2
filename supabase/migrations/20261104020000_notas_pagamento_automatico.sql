-- Nota de compra ligada ao pagamento, de qualquer conta, sozinha.
--
-- Todo pagamento de fornecedor vira baixa de conta a pagar (fluxo_caixa,
-- origem 'conta_pagar'): dinheiro sai do Cofre Principal, Pix da Stone, do
-- PagSeguro… Quando a baixa entra, procura a nota do mesmo fornecedor (uma
-- nota até 1%, soma de 2 até R$ 1, soma de 3 no centavo) e liga
-- entradas_compras.conta_pagar_id. Cobre o caixa, a aprovação em lote da
-- conciliação e o lançamento direto em Contas a Pagar.
--
-- Não mexe no financeiro: nenhum valor, data, baixa ou saldo muda. Só a nota
-- passa a dizer qual pagamento a quitou. Se a baixa for estornada (fluxo
-- apagado), a nota volta a "sem pagamento".
--
-- Na conciliação "um por um", a escolha de notas de quem concilia manda:
-- fn_banco_vincular_notas troca as ligadas automaticamente por ela.

alter table public.entradas_compras add column if not exists pago_em date;
alter table public.entradas_compras add column if not exists pago_meio text;
alter table public.entradas_compras add column if not exists pago_ligado_por text; -- 'automatico' | 'conciliacao'

-- ── a busca (sem checagem de acesso: usada por gatilho e pela tela) ─────────
create or replace function public.fn_notas_combinar(p_fornecedor uuid, p_valor numeric, p_data date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  c record;
  ids uuid[] := '{}'; vals numeric[] := '{}'; dias int[] := '{}';
  n int; i int; j int; k int;
  tol numeric := greatest(2, coalesce(p_valor, 0) * 0.01);         -- uma nota: até 1%
  tol_soma numeric := greatest(1, coalesce(p_valor, 0) * 0.0005);  -- soma de 2 notas: quase exata
  tol_tres numeric := 0.10;                                        -- soma de 3: no centavo
  melhor uuid[]; melhor_dif numeric; melhor_dias int; dif numeric; d int;
  notas jsonb;
begin
  if p_fornecedor is null or p_valor is null or p_data is null then
    return jsonb_build_object('notas', '[]'::jsonb, 'combinacao', '[]'::jsonb);
  end if;

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

  -- menos notas primeiro; no empate, a diferença menor e as datas mais perto
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

-- a tela da conciliação continua chamando esta (com checagem de acesso)
create or replace function public.fn_banco_notas_sugeridas(p_fornecedor uuid, p_valor numeric, p_data date)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not fn_financeiro_pode() then raise exception 'Sem acesso ao financeiro'; end if;
  return fn_notas_combinar(p_fornecedor, p_valor, p_data);
end $$;

-- "Dinheiro · Cofre Principal" / "PIX · Stone"
create or replace function public.fn_notas_meio_pagamento(p_fluxo fluxo_caixa)
returns text language sql stable security definer set search_path = public as $$
  select nullif(concat_ws(' · ', initcap(lower(fp.nome)), trim(bc.banco)), '')
    from (select 1) x
    left join formas_pagamento fp on fp.id = p_fluxo.forma_pagamento_id
    left join bancos_contas bc on bc.id = p_fluxo.conta_bancaria_id
$$;

-- ── liga as notas de um pagamento (baixa) ───────────────────────────────────
create or replace function public.fn_notas_ligar_pagamento(p_fluxo_id uuid)
returns integer language plpgsql security definer set search_path = public as $$
declare f fluxo_caixa; v_forn uuid; v_ids uuid[]; n int := 0;
begin
  select * into f from fluxo_caixa where id = p_fluxo_id;
  if f.id is null or f.conta_pagar_id is null or f.tipo <> 'saida' then return 0; end if;
  -- conta já com nota ligada (ex.: segunda parcela): não liga de novo
  if exists (select 1 from entradas_compras where conta_pagar_id = f.conta_pagar_id) then return 0; end if;
  select fornecedor_id into v_forn from contas_pagar where id = f.conta_pagar_id;
  if v_forn is null then return 0; end if;

  select array(select jsonb_array_elements_text(fn_notas_combinar(v_forn, f.valor, f.data) -> 'combinacao')::uuid) into v_ids;
  if coalesce(array_length(v_ids, 1), 0) = 0 then return 0; end if;

  update entradas_compras
     set conta_pagar_id = f.conta_pagar_id, pago_em = f.data,
         pago_meio = fn_notas_meio_pagamento(f), pago_ligado_por = 'automatico'
   where id = any(v_ids) and conta_pagar_id is null;
  get diagnostics n = row_count;
  return n;
end $$;

-- gatilho: nunca impede o pagamento; se algo falhar, a nota só fica sem ligação
create or replace function public.trg_fluxo_ligar_notas()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.conta_pagar_id is not null and new.tipo = 'saida' then
      begin
        perform fn_notas_ligar_pagamento(new.id);
      exception when others then
        raise warning 'ligar notas ao pagamento %: %', new.id, sqlerrm;
      end;
    end if;
    return new;
  end if;
  -- estorno: a conta ficou sem nenhuma baixa → a nota volta a "sem pagamento"
  if old.conta_pagar_id is not null and old.tipo = 'saida'
     and not exists (select 1 from fluxo_caixa x where x.conta_pagar_id = old.conta_pagar_id and x.tipo = 'saida' and x.id <> old.id) then
    begin
      update entradas_compras set conta_pagar_id = null, pago_em = null, pago_meio = null, pago_ligado_por = null
       where conta_pagar_id = old.conta_pagar_id;
    exception when others then
      raise warning 'desligar notas do pagamento %: %', old.id, sqlerrm;
    end;
  end if;
  return old;
end $$;

drop trigger if exists trg_fluxo_ligar_notas on public.fluxo_caixa;
create trigger trg_fluxo_ligar_notas after insert or delete on public.fluxo_caixa
  for each row execute function trg_fluxo_ligar_notas();

-- ── conciliação "um por um": a escolha de quem concilia manda ───────────────
create or replace function public.fn_banco_vincular_notas(p_conta_pagar uuid, p_notas uuid[])
returns integer language plpgsql security definer set search_path = public as $$
declare n int; f fluxo_caixa;
begin
  if not fn_financeiro_pode() then raise exception 'Sem acesso ao financeiro'; end if;
  if p_conta_pagar is null then return 0; end if;
  p_notas := coalesce(p_notas, '{}');
  -- o que o gatilho ligou sozinho e não foi escolhido volta a ficar livre
  update entradas_compras set conta_pagar_id = null, pago_em = null, pago_meio = null, pago_ligado_por = null
   where conta_pagar_id = p_conta_pagar and pago_ligado_por = 'automatico' and not (id = any(p_notas));
  if array_length(p_notas, 1) is null then return 0; end if;
  select * into f from fluxo_caixa where conta_pagar_id = p_conta_pagar and tipo = 'saida' order by criado_em desc limit 1;
  update entradas_compras
     set conta_pagar_id = p_conta_pagar, pago_em = coalesce(f.data, current_date),
         pago_meio = coalesce(fn_notas_meio_pagamento(f), pago_meio), pago_ligado_por = 'conciliacao'
   where id = any(p_notas) and (conta_pagar_id is null or conta_pagar_id = p_conta_pagar);
  get diagnostics n = row_count;
  return n;
end $$;

-- ── passar a limpo: pagamentos desde uma data, do mais antigo ao mais novo ──
create or replace function public.fn_notas_ligar_passado(p_desde date)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r record; pag int := 0; notas int := 0; k int;
begin
  for r in
    select id from fluxo_caixa
     where tipo = 'saida' and conta_pagar_id is not null
       and data between p_desde and current_date + 1
     order by data, criado_em
  loop
    k := fn_notas_ligar_pagamento(r.id);
    if k > 0 then pag := pag + 1; notas := notas + k; end if;
  end loop;
  return jsonb_build_object('pagamentos', pag, 'notas', notas);
end $$;

revoke all on function public.fn_notas_combinar(uuid, numeric, date) from public, anon, authenticated;
revoke all on function public.fn_notas_meio_pagamento(fluxo_caixa) from public, anon, authenticated;
revoke all on function public.fn_notas_ligar_pagamento(uuid) from public, anon, authenticated;
revoke all on function public.fn_notas_ligar_passado(date) from public, anon, authenticated;
revoke all on function public.trg_fluxo_ligar_notas() from public, anon, authenticated;
grant execute on function public.fn_banco_notas_sugeridas(uuid, numeric, date) to authenticated;
grant execute on function public.fn_banco_vincular_notas(uuid, uuid[]) to authenticated;
