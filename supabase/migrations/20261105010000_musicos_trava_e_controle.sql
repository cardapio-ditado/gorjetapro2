-- Músicos: trava de artista, controle do gerente separado do financeiro (opção C, combinada com o Kadu em 05/11/2026).
--
-- 1) Excluir um show apagava TODAS as contas em aberto do fornecedor (e tirava o fornecedor das pagas).
--    Agora só a conta daquele show: sem pagamento sai; com pagamento fica no financeiro, sem o vínculo.
create or replace function public.excluir_contas_pagar_musico()
returns trigger language plpgsql as $$
declare v_id uuid;
begin
  for v_id in select id from contas_pagar where origem_modulo = 'musicos' and origem_id = old.id loop
    if exists (select 1 from pagamentos_contas where conta_pagar_id = v_id)
       or exists (select 1 from fluxo_caixa where conta_pagar_id = v_id) then
      update contas_pagar
         set origem_modulo = null, origem_id = null,
             observacoes = concat_ws(' · ', nullif(btrim(observacoes), ''),
                                     'Show excluído do módulo de Músicos em ' || to_char(current_date, 'DD/MM/YYYY'))
       where id = v_id;
    else
      delete from contas_pagar where id = v_id;
    end if;
  end loop;
  return old;
end $$;

-- 2) O show cria a conta só ao ser lançado (ou quando ganha fornecedor). Editar um show antigo
--    não recria conta que o financeiro já limpou. Trocar o artista leva a conta junto.
create or replace function public.sincronizar_musico_para_conta_pagar()
returns trigger language plpgsql as $$
declare
  v_conta_id uuid;
  v_valor_pago_conta numeric;
  v_desc text := 'Pagamento Músico: ' || coalesce(new.nome, 'Sem nome') || ' - ' || coalesce(new.data_evento::date::text, 'Sem data');
begin
  select id, valor_pago into v_conta_id, v_valor_pago_conta
    from contas_pagar where origem_modulo = 'musicos' and origem_id = new.id;

  if v_conta_id is not null then
    update contas_pagar set
      fornecedor_id = coalesce(new.fornecedor_id, fornecedor_id),
      valor_total = new.valor_total_final, valor_original = new.valor_total_final, valor_final = new.valor_total_final,
      descricao = v_desc,
      data_vencimento = coalesce(new.data_evento::date, current_date),
      status = case
        when (new.valor_total_final - coalesce(v_valor_pago_conta, 0)) <= 0 and new.valor_total_final > 0 then 'pago'
        when new.status_pagamento = 'cancelado' then 'cancelado'
        when coalesce(v_valor_pago_conta, 0) > 0 then 'parcialmente_pago'
        else 'em_aberto' end,
      atualizado_em = now()
    where id = v_conta_id;
  elsif new.fornecedor_id is not null and new.valor_total_final > 0 and new.status_pagamento <> 'cancelado'
        and (tg_op = 'INSERT' or (tg_op = 'UPDATE' and old.fornecedor_id is null)) then
    insert into contas_pagar (fornecedor_id, descricao, categoria_id, valor_total, valor_original, valor_final, valor_pago,
                              data_vencimento, data_emissao, status, tipo_pagamento, origem_modulo, origem_id)
    values (new.fornecedor_id, v_desc,
            (select id from categorias_financeiras where nome = 'Cachê de Músicos' limit 1),
            new.valor_total_final, new.valor_total_final, new.valor_total_final, 0,
            coalesce(new.data_evento::date, current_date), current_date, 'em_aberto', 'unica', 'musicos', new.id);
  end if;
  return new;
end $$;

-- 3) Opção C: o "pagamento informado" do gerente (musicos_pagamentos) é o controle dele e não é
--    sobrescrito pelo financeiro. O financeiro continua só no Contas a Pagar; os dois são comparados.
drop trigger if exists trg_sincronizar_pagamento_conta_musico on public.contas_pagar;

-- 4) Situação do show no financeiro, para o módulo mostrar lado a lado (sem abrir o Contas a Pagar).
create or replace function public.fn_musicos_situacao_financeiro(p_ids uuid[])
returns table (musico_id uuid, fin_status text, fin_valor numeric, fin_pago numeric, fin_saldo numeric, fin_fornecedor text)
language sql stable security definer set search_path to 'public' as $$
  select c.origem_id, c.status, c.valor_total, coalesce(c.valor_pago, 0), c.saldo_restante, btrim(f.nome)
    from contas_pagar c left join fornecedores f on f.id = c.fornecedor_id
   where auth.uid() is not null and c.origem_modulo = 'musicos' and c.origem_id = any(p_ids);
$$;
revoke all on function public.fn_musicos_situacao_financeiro(uuid[]) from public, anon;
grant execute on function public.fn_musicos_situacao_financeiro(uuid[]) to authenticated;

-- 5) Cadastro de artista: chave Pix para a conciliação reconhecer quem recebe.
alter table public.fornecedores add column if not exists chave_pix text;

-- 6) Todo show novo precisa de artista (fornecedor). Os antigos não são checados.
alter table public.musicos drop constraint if exists musicos_artista_obrigatorio;
alter table public.musicos add constraint musicos_artista_obrigatorio check (fornecedor_id is not null) not valid;
