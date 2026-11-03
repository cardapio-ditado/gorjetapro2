-- Conciliação: Pix entre contas do mesmo CNPJ do bar é transferência, não
-- conta a pagar. Ao aprovar, grava a saída numa conta e a entrada na outra
-- (origem 'transferencia', igual à transferência manual de Movimentações):
-- não vira despesa, não entra no resultado nem no DRE.
--
-- - bancos_contas.codigo_compe: código do banco (260 Nubank, 077 Inter…), para
--   achar sozinho a conta do outro lado pelo banco do Pix.
-- - banco_extrato.conta_transferencia_id: a outra conta (sugerida ao classificar).
-- - Conta Nubank da empresa no cadastro.

alter table public.bancos_contas add column if not exists codigo_compe text;
alter table public.banco_extrato add column if not exists conta_transferencia_id uuid references bancos_contas(id);
alter table public.banco_extrato add column if not exists fluxo_caixa_id uuid references fluxo_caixa(id) on delete set null;

update bancos_contas set codigo_compe = '077' where codigo_compe is null and banco ilike '%inter%';
update bancos_contas set codigo_compe = '033' where codigo_compe is null and banco ilike '%santander%';
update bancos_contas set codigo_compe = '748' where codigo_compe is null and banco ilike '%sicredi%';
update bancos_contas set codigo_compe = '290' where codigo_compe is null and banco ilike '%pagseguro%';
update bancos_contas set codigo_compe = '197' where codigo_compe is null and banco ilike 'stone%';

insert into bancos_contas (banco, tipo_conta, titular, documento_titular, saldo_inicial, saldo_atual, status, codigo_compe)
select 'Nubank', 'corrente', 'Ditado Popular', '23.718.514/0001-82', 0, 0, 'ativo', '260'
where not exists (select 1 from bancos_contas where banco ilike 'nubank%');

-- Classificação: Pix para (ou vindo de) o próprio CNPJ = transferência, com a
-- conta do outro lado achada pelo código do banco. O resto segue como antes.
create or replace function public.fn_banco_classificar(e banco_extrato)
returns banco_extrato language plpgsql stable set search_path = public as $$
declare r banco_regras; f uuid;
  -- a coluna gerada doc_digitos ainda não existe no BEFORE INSERT: calcula aqui
  doc text := nullif(regexp_replace(coalesce(e.contraparte_doc, ''), '\D', '', 'g'), '');
  proprio text;
  banco_outro text;
begin
  select nullif(regexp_replace(coalesce(b.documento_titular, ''), '\D', '', 'g'), '') into proprio
    from bancos_contas b where b.id = e.banco_conta_id;
  -- venda na maquininha paga pela própria empresa segue sendo recebimento
  if doc is not null and doc = proprio and coalesce(e.descricao, '') not ilike '%maquininha%' then
    banco_outro := e.payload -> 'paymentData' -> (case when e.sentido = 'debito' then 'receiver' else 'payer' end) ->> 'routingNumber';
    e.classe := 'transferencia';
    e.status := 'pendente';
    e.regra_id := null; e.fornecedor_id := null; e.categoria_id := null;
    select b.id into e.conta_transferencia_id from bancos_contas b
     where b.status = 'ativo' and b.id <> e.banco_conta_id and banco_outro is not null
       and ltrim(b.codigo_compe, '0') = ltrim(banco_outro, '0')
     limit 1;
    return e;
  end if;

  select * into r from banco_regras g
   where g.ativo and (g.sentido is null or g.sentido = e.sentido)
     and ((g.campo = 'documento' and g.padrao = doc)
       or (g.campo = 'descricao' and e.descricao ilike g.padrao))
   order by (g.campo = 'documento') desc, g.criado_em desc
   limit 1;

  e.regra_id := r.id;
  if r.id is not null then
    e.classe := r.classe;
    e.fornecedor_id := r.fornecedor_id;
    e.categoria_id := r.categoria_id;
    e.status := case r.acao when 'automatico' then 'automatica' when 'ignorar' then 'ignorada' else 'pendente' end;
    return e;
  end if;

  e.fornecedor_id := null; e.categoria_id := null;
  e.status := 'pendente';
  if e.sentido = 'credito' then
    e.classe := 'receita_outros';
  elsif doc is not null and length(doc) = 14 then
    select fo.id into f from fornecedores fo
     where fo.status = 'ativo' and regexp_replace(coalesce(fo.cnpj, ''), '\D', '', 'g') = doc
     limit 1;
    e.classe := 'fornecedor';
    e.fornecedor_id := f;
    if f is not null then
      select fo.categoria_padrao_id into e.categoria_id from fornecedores fo where fo.id = f;
    end if;
  elsif doc is not null then
    e.classe := 'pessoa';
  else
    e.classe := 'outros';
  end if;
  return e;
end $$;

-- reclassificar também grava a conta sugerida da transferência
create or replace function public.fn_banco_reclassificar()
returns integer language plpgsql security definer set search_path = public as $$
declare e banco_extrato; n integer := 0;
begin
  if not fn_financeiro_pode() and coalesce(auth.role(), '') <> 'service_role' then
    raise exception 'Sem acesso ao financeiro';
  end if;
  for e in select * from banco_extrato where status = 'pendente' loop
    e := fn_banco_classificar(e);
    update banco_extrato set classe = e.classe, status = e.status, regra_id = e.regra_id,
           fornecedor_id = e.fornecedor_id, categoria_id = e.categoria_id, conta_transferencia_id = e.conta_transferencia_id
     where id = e.id;
    n := n + 1;
  end loop;
  return n;
end $$;

/**
 * Lança um movimento do extrato como transferência entre a conta do extrato e
 * p_outra_conta. Se a mesma transferência já foi lançada à mão em Movimentações
 * (mesmas contas, mesmo valor, até 1 dia de diferença), só marca como
 * conciliada, sem lançar de novo.
 */
create or replace function public.fn_banco_lancar_transferencia(p_extrato_id uuid, p_outra_conta uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  e banco_extrato; v_origem uuid; v_destino uuid; n_origem text; n_destino text; ja uuid; saida uuid;
begin
  if not fn_financeiro_pode() then raise exception 'Sem acesso ao financeiro'; end if;
  select * into e from banco_extrato where id = p_extrato_id for update;
  if e.id is null then raise exception 'Movimento não encontrado'; end if;
  if e.status in ('conciliada', 'ignorada') then raise exception 'Este movimento já foi resolvido'; end if;
  if p_outra_conta is null or p_outra_conta = e.banco_conta_id then raise exception 'Escolha a outra conta da transferência'; end if;

  if e.sentido = 'debito' then v_origem := e.banco_conta_id; v_destino := p_outra_conta;
  else v_origem := p_outra_conta; v_destino := e.banco_conta_id; end if;
  select banco into n_origem from bancos_contas where id = v_origem;
  select banco into n_destino from bancos_contas where id = v_destino;
  if n_origem is null or n_destino is null then raise exception 'Conta não encontrada'; end if;

  -- já lançada à mão?
  select f.id into ja from fluxo_caixa f
   where f.origem = 'transferencia' and f.tipo = 'saida' and f.conta_bancaria_id = v_origem
     and abs(f.valor - e.valor) <= 0.01 and f.data between e.data - 1 and e.data + 1
     and exists (select 1 from fluxo_caixa g where g.origem = 'transferencia' and g.tipo = 'entrada'
                  and g.conta_bancaria_id = v_destino and abs(g.valor - e.valor) <= 0.01 and g.data between e.data - 1 and e.data + 1)
     and not exists (select 1 from banco_extrato x where x.status = 'conciliada' and x.fluxo_caixa_id = f.id)
   limit 1;

  if ja is null then
    insert into fluxo_caixa (tipo, valor, data, descricao, conta_bancaria_id, origem, observacoes, criado_por)
    values ('saida', e.valor, e.data, trim(both ' ' from 'Transferência para ' || trim(n_destino) || ' - Pix'), v_origem, 'transferencia',
            'Conciliação do extrato (' || coalesce(e.contraparte_nome, 'mesmo CNPJ') || ')', auth.uid())
    returning id into saida;
    insert into fluxo_caixa (tipo, valor, data, descricao, conta_bancaria_id, origem, observacoes, criado_por)
    values ('entrada', e.valor, e.data, trim(both ' ' from 'Transferência de ' || trim(n_origem) || ' - Pix'), v_destino, 'transferencia',
            'Conciliação do extrato (' || coalesce(e.contraparte_nome, 'mesmo CNPJ') || ')', auth.uid());
  end if;

  update banco_extrato
     set status = 'conciliada', classe = 'transferencia', conta_transferencia_id = p_outra_conta,
         fluxo_caixa_id = coalesce(ja, saida), resolvido_em = now(), resolvido_por = auth.uid()
   where id = e.id;

  insert into conciliacao_transacoes (banco_conta_id, fitid, data, valor, tipo, descricao, status, fluxo_caixa_id)
  values (e.banco_conta_id, e.externo_id, e.data, e.valor, e.sentido, coalesce(e.descricao, 'Transferência'), 'conciliada', coalesce(ja, saida));

  return jsonb_build_object('ja_lancada', ja is not null, 'origem', trim(n_origem), 'destino', trim(n_destino), 'valor', e.valor);
end $$;

revoke execute on function public.fn_banco_lancar_transferencia(uuid, uuid) from public, anon;
grant execute on function public.fn_banco_lancar_transferencia(uuid, uuid) to authenticated, service_role;
