-- Pagamento recorrente: o formulário de Contas a Pagar promete que "o sistema
-- gerará automaticamente as próximas contas", mas nada chamava
-- gerar_proxima_conta_recorrente. Esta rotina roda todo dia: para cada série
-- recorrente ativa, olha a última conta da série e, se ela vence em até 30
-- dias, gera a próxima (a função não duplica). Assim sempre há o mês seguinte
-- lançado.
-- Séries paradas (última conta vencida há mais de 45 dias) ficam de fora: a
-- rotina não preenche meses passados, que provavelmente já foram lançados à mão.

create or replace function public.fn_contas_recorrentes_gerar()
returns integer language plpgsql security definer set search_path = public as $$
declare r record; n integer := 0; nova uuid;
begin
  for r in
    select distinct on (coalesce(conta_recorrente_origem_id, id)) id, data_vencimento
      from contas_pagar
     where eh_recorrente and recorrencia_ativa and status <> 'cancelado'
     order by coalesce(conta_recorrente_origem_id, id), data_vencimento desc
  loop
    if r.data_vencimento between current_date - 45 and current_date + 30 then
      nova := gerar_proxima_conta_recorrente(r.id);
      if nova is not null then n := n + 1; end if;
    end if;
  end loop;
  return n;
end $$;

revoke execute on function public.fn_contas_recorrentes_gerar() from public, anon;
grant execute on function public.fn_contas_recorrentes_gerar() to authenticated, service_role;

select cron.schedule('contas-recorrentes-gerar', '17 10 * * *', $c$ select public.fn_contas_recorrentes_gerar() $c$);
