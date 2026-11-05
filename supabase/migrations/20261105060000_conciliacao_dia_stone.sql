-- Conciliação no dia da Stone (horário de Brasília), combinado com o Kadu em 05/11/2026.
-- O extrato da Stone fecha o dia à meia-noite de Brasília (23h de Cuiabá). A coluna `data`
-- continua em Cuiabá para o resto do sistema; só a conciliação usa `data_stone`.
alter table public.banco_extrato
  add column if not exists data_stone date generated always as ((data_hora at time zone 'America/Sao_Paulo')::date) stored;
create index if not exists banco_extrato_integ_data_stone on public.banco_extrato (integracao_id, data_stone);

-- Recebimentos do dia: agora o dia da Stone (antes `data = p_data`).
create or replace function public.fn_banco_lancar_recebimentos(p_integracao_id uuid, p_data date)
 returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  integ banco_integracoes;
  v_cliente uuid; v_categoria uuid; v_pix uuid; v_cartao uuid;
  g record; v_conta uuid; v_doc text; lancados jsonb := '[]'::jsonb;
begin
  if not fn_financeiro_pode() then raise exception 'Sem acesso ao financeiro'; end if;
  if p_data >= (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'O dia ainda não terminou: lance a partir de amanhã.';
  end if;

  select * into integ from banco_integracoes where id = p_integracao_id;
  if integ.id is null then raise exception 'Conta conectada não encontrada'; end if;

  select id into v_cliente from clientes where nome = 'DITADO VENDAS' order by criado_em limit 1;
  select id into v_categoria from categorias_financeiras where nome = 'Receitas Operacionais' and tipo = 'receita' and status = 'ativo' limit 1;
  select id into v_pix from formas_pagamento where nome = 'PIX' limit 1;
  select id into v_cartao from formas_pagamento where nome = 'CARTAO DE CREDITO' limit 1;
  if v_cliente is null then raise exception 'Cliente DITADO VENDAS não encontrado'; end if;

  -- trava os movimentos do dia para dois cliques simultâneos não lançarem duas vezes
  perform 1 from banco_extrato
   where integracao_id = p_integracao_id and data_stone = p_data and conta_receber_id is null
     and classe in ('receita_cartao', 'receita_pix') and status <> 'ignorada'
   for update;

  for g in
    select fn_banco_grupo_recebimento(classe, descricao) grupo, count(*) qtd, sum(valor) total, array_agg(id) ids
      from banco_extrato
     where integracao_id = p_integracao_id and data_stone = p_data and conta_receber_id is null
       and classe in ('receita_cartao', 'receita_pix') and status <> 'ignorada'
     group by 1
     order by 1
  loop
    v_doc := 'stone-' || to_char(p_data, 'YYYYMMDD') || '-' || g.grupo;
    if exists (select 1 from contas_receber where numero_documento = v_doc) then continue; end if;

    insert into contas_receber (cliente_id, descricao, categoria_id, forma_recebimento_id, valor_total, valor_recebido,
                                data_emissao, data_vencimento, numero_documento, status, observacoes, criado_por, conta_bancaria_id)
    values (v_cliente,
            case g.grupo when 'pix_maquininha' then 'STONE · PIX MAQUININHA'
                         when 'cartao_antecipacao' then 'STONE · CARTÃO (ANTECIPAÇÃO)'
                         else 'STONE · CARTÃO (LIQUIDAÇÃO)' end,
            v_categoria,
            case when g.grupo = 'pix_maquininha' then v_pix else v_cartao end,
            g.total, 0, p_data, p_data, v_doc, 'em_aberto',
            g.qtd || ' movimento(s) do extrato da Stone de ' || to_char(p_data, 'DD/MM/YYYY'),
            auth.uid(), integ.banco_conta_id)
    returning id into v_conta;

    insert into recebimentos_contas (conta_receber_id, valor_recebimento, data_recebimento, forma_pagamento_id, conta_bancaria_id,
                                     numero_comprovante, observacoes, criado_por)
    values (v_conta, g.total, p_data, case when g.grupo = 'pix_maquininha' then v_pix else v_cartao end, integ.banco_conta_id,
            v_doc, 'Extrato Stone (conciliação)', auth.uid());

    update banco_extrato set conta_receber_id = v_conta where id = any (g.ids);
    lancados := lancados || jsonb_build_object('grupo', g.grupo, 'qtd', g.qtd, 'total', g.total, 'conta_receber_id', v_conta);
  end loop;

  return jsonb_build_object('data', p_data, 'lancados', lancados);
end $function$;
