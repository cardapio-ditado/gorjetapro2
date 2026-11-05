-- Agente do WhatsApp: auditoria Bar → Central com cruzamento (combinado com o Kadu em 05/11/2026).
-- Com as duas contagens abertas, o mesmo item faltando num lugar e sobrando no outro é provável
-- transferência não lançada. A pessoa confirma e o agente lança a transferência corrigindo a folha.

-- 1) Cruzamento (só lê). Diferença = contado − sistema na folha (o saldo na hora em que o item foi contado).
create or replace function public.fn_agente_contagem_cruzar(p_pessoa uuid)
returns jsonb language plpgsql stable security definer set search_path to 'public' as $function$
declare
  v_bar constant uuid := '10b3aacf-61b1-4add-91ac-0949d3e7f3a3';
  v_central constant uuid := 'ea043464-d54e-4f42-8e40-4edddc5b4b51';
begin
  if not exists (select 1 from agente_equipe e join agente_permissoes p on p.papel = e.papel and p.acao = 'contagem'
                  where e.id = p_pessoa and e.ativo) then
    return jsonb_build_object('status', 'negado', 'motivo', 'O seu papel não permite contagem.');
  end if;
  return (
    with linhas as (
      select c.estoque_id, ci.item_estoque_id item_id, ci.quantidade_contada contado, ci.quantidade_sistema folha,
             coalesce(ci.valor_unitario, 0) custo
        from contagens_estoque c join contagens_estoque_itens ci on ci.contagem_id = c.id
       where c.status = 'em_andamento' and c.criado_em > now() - interval '24 hours'
         and ci.quantidade_contada is not null
         and ((c.estoque_id = v_bar and c.bloco in ('__auditoria', '__diaria'))
              or (c.estoque_id = v_central and c.bloco is not null and c.bloco not like '\_\_%'))),
    b as (select item_id, sum(contado) contado, sum(folha) folha, max(custo) custo from linhas where estoque_id = v_bar group by 1),
    ce as (select item_id, sum(contado) contado, sum(folha) folha, max(custo) custo from linhas where estoque_id = v_central group by 1),
    x as (
      select i.id item_id, trim(i.nome) nome, i.unidade_medida um,
             round(b.contado - b.folha, 3) dif_bar, round(ce.contado - ce.folha, 3) dif_central,
             least(abs(b.contado - b.folha), abs(ce.contado - ce.folha)) qtd, coalesce(nullif(ce.custo, 0), b.custo) custo
        from b join ce using (item_id) join itens_estoque i on i.id = b.item_id
       where sign(b.contado - b.folha) * sign(ce.contado - ce.folha) = -1)
    select jsonb_build_object(
      'status', 'ok',
      'bar_aberto', exists (select 1 from linhas where estoque_id = v_bar),
      'central_aberto', exists (select 1 from linhas where estoque_id = v_central),
      'provaveis_transferencias', coalesce((select jsonb_agg(jsonb_build_object(
          'item_id', item_id, 'nome', nome, 'um', um, 'diferenca_bar', dif_bar, 'diferenca_central', dif_central,
          'quantidade', round(qtd, 3), 'valor', round(qtd * custo, 2),
          'de', case when dif_central < 0 then 'central' else 'bar' end,
          'para', case when dif_central < 0 then 'bar' else 'central' end) order by qtd * custo desc) from x), '[]'::jsonb),
      'diferenca_no_bar_sem_contar_no_central', coalesce((select jsonb_agg(trim(i.nome) order by trim(i.nome))
          from b join itens_estoque i on i.id = b.item_id
         where b.contado <> b.folha and not exists (select 1 from ce where ce.item_id = b.item_id)), '[]'::jsonb))
  );
end $function$;

-- 2) Lança a transferência esquecida e corrige a folha das contagens abertas, para o fechamento não
--    contar a mesma diferença de novo (a transferência aconteceu antes da contagem).
create or replace function public.fn_agente_contagem_transferir(p_pessoa uuid, p_item uuid, p_qtd numeric, p_de uuid, p_para uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $function$
declare
  v_antes numeric := calcular_saldo_item_estoque(p_item, p_de);
  v_res jsonb;
  v_movido numeric;
begin
  if coalesce(p_qtd, 0) <= 0 then raise exception 'Quantidade inválida.'; end if;
  v_res := fn_agente_executar(p_pessoa, 'transferir', jsonb_build_object('de', p_de, 'para', p_para,
    'itens', jsonb_build_array(jsonb_build_object('item_id', p_item, 'quantidade', p_qtd)),
    'motivo', 'Transferência não lançada, achada na contagem'));
  if v_res->>'status' is distinct from 'feito' then return v_res; end if;

  v_movido := v_antes - calcular_saldo_item_estoque(p_item, p_de);
  update contagens_estoque_itens ci
     set quantidade_sistema = ci.quantidade_sistema + case when c.estoque_id = p_de then -v_movido else v_movido end
    from contagens_estoque c
   where c.id = ci.contagem_id and c.status = 'em_andamento' and c.criado_em > now() - interval '24 hours'
     and c.estoque_id in (p_de, p_para) and ci.item_estoque_id = p_item and ci.quantidade_sistema is not null;
  return v_res || jsonb_build_object('movido', v_movido, 'folha_corrigida', true);
end $function$;

revoke all on function public.fn_agente_contagem_cruzar(uuid) from public, anon, authenticated;
revoke all on function public.fn_agente_contagem_transferir(uuid, uuid, numeric, uuid, uuid) from public, anon, authenticated;
grant execute on function public.fn_agente_contagem_cruzar(uuid) to service_role;
grant execute on function public.fn_agente_contagem_transferir(uuid, uuid, numeric, uuid, uuid) to service_role;
