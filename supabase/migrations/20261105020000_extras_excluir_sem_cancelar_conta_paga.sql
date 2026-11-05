-- Excluir a diária apagava a conta sem pagamento (certo) e marcava "cancelado" a conta que já tinha
-- pagamento (errado: o financeiro perdia a situação real). Agora a conta paga fica e só perde o vínculo.
create or replace function public.fn_extra_excluir_conta()
returns trigger language plpgsql security definer set search_path to 'public' as $$
begin
  if old.conta_pagar_id is not null then
    delete from contas_pagar where id = old.conta_pagar_id and coalesce(valor_pago, 0) = 0
      and not exists (select 1 from pagamentos_contas where conta_pagar_id = old.conta_pagar_id);
    update contas_pagar
       set origem_modulo = case when origem_modulo = 'outros' and origem_id = old.id then null else origem_modulo end,
           origem_id = case when origem_id = old.id then null else origem_id end,
           observacoes = concat_ws(' · ', nullif(btrim(observacoes), ''), 'Diária de extra excluída do módulo em ' || to_char(current_date, 'DD/MM/YYYY')),
           atualizado_em = now()
     where id = old.conta_pagar_id;
  end if;
  return old;
end $$;
