-- ═══════════════════════════════════════════════════════════════════════════
-- CONTAGEM POR BALCÃO + BAIXA ZIG EM DUAS RODADAS (noite e manhã)
--
-- 1. Contagem: a versão em produção de bulk_import_contagem_itens carregava
--    TODOS os itens ativos (633) em qualquer estoque. A contagem da Cozinha
--    vinha cheia de item do Bar. Agora, num balcão (estoque não-central)
--    entram só os itens do cadastro do balcão e os que têm saldo lá. No
--    Central continua tudo (nativo do Central ou sem nativo).
--
-- 2. Baixa ZIG por diferença: zig_vendas_sync_ids guarda quanto já foi
--    baixado por produto/dia. Assim a rotina pode rodar mais de uma vez no
--    mesmo dia (fim da noite e manhã) baixando só o que faltou. Linhas
--    antigas (quantidade nula) contam como dia fechado.
--
-- 3. Jobs da noite (criados DESLIGADOS até o gestor confirmar o horário):
--    zig-baixa-noite às 23h de Cuiabá processa o próprio dia;
--    reposicao-balcao-noite às 23h20 gera a reposição para abastecer no
--    fechamento. A rodada da manhã continua e pega o que sobrou.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Contagem só com os itens do balcão ───────────────────────────────────
create or replace function public.bulk_import_contagem_itens(
  p_contagem_id uuid, p_estoque_id uuid, p_incluir_sem_saldo boolean default true)
returns json
language plpgsql security definer set search_path = public as $$
declare
  v_total_inserido integer := 0;
  v_status text;
  v_tipo text;
begin
  select status into v_status from contagens_estoque where id = p_contagem_id;
  if v_status is null then return json_build_object('success', false, 'error', 'Contagem não encontrada'); end if;
  if v_status <> 'em_andamento' then return json_build_object('success', false, 'error', 'Contagem não está em andamento'); end if;
  select tipo into v_tipo from estoques where id = p_estoque_id;

  insert into contagens_estoque_itens (contagem_id, item_estoque_id, quantidade_sistema, valor_unitario)
  select p_contagem_id, ie.id, calcular_saldo_item_estoque(ie.id, p_estoque_id), coalesce(ie.custo_medio, 0)
    from itens_estoque ie
   where ie.status = 'ativo'
     and (
       case when v_tipo = 'central' then
         -- Central: tudo que é dele ou não tem dono
         (ie.estoque_nativo_id is null or ie.estoque_nativo_id = p_estoque_id)
         and (p_incluir_sem_saldo or calcular_saldo_item_estoque(ie.id, p_estoque_id) <> 0)
       else
         -- Balcão: cadastro do balcão + o que tem saldo lá
         exists (select 1 from itens_estoque_niveis n where n.item_id = ie.id and n.estoque_id = p_estoque_id)
         or calcular_saldo_item_estoque(ie.id, p_estoque_id) <> 0
       end)
     and not exists (select 1 from contagens_estoque_itens cei where cei.contagem_id = p_contagem_id and cei.item_estoque_id = ie.id)
   order by ie.nome;

  get diagnostics v_total_inserido = row_count;
  return json_build_object('success', true, 'total_inserido', v_total_inserido);
end;
$$;

-- ─── 2. Baixa por diferença ───────────────────────────────────────────────────
alter table public.zig_vendas_sync_ids add column if not exists quantidade numeric;
comment on column public.zig_vendas_sync_ids.quantidade is 'Quantidade já baixada do produto nesse dia (nula = dia fechado pela versão antiga)';

-- ─── 3. Jobs da noite (desligados) ───────────────────────────────────────────
select cron.unschedule(jobid) from cron.job where jobname in ('zig-baixa-noite', 'reposicao-balcao-noite');

select cron.schedule('zig-baixa-noite', '0 3 * * *', $cmd$
  select net.http_post(
    url := 'https://nzdiojmrukdxavrdazot.supabase.co/functions/v1/zig-baixa-automatica',
    headers := jsonb_build_object('Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56ZGlvam1ydWtkeGF2cmRhem90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4OTA1NjksImV4cCI6MjA2NDQ2NjU2OX0.-6VLiW0Ui4OEhMhYXpXJKhKC2tgujjrPywgnRW4BLY0'),
    body := jsonb_build_object(
      'dtinicio', to_char((now() at time zone 'America/Cuiaba')::date, 'YYYY-MM-DD'),
      'dtfim',    to_char((now() at time zone 'America/Cuiaba')::date, 'YYYY-MM-DD'),
      'avisar', false),
    timeout_milliseconds := 150000);
$cmd$);

select cron.schedule('reposicao-balcao-noite', '20 3 * * *', $cmd$ select public.fn_reposicao_balcao_gerar_todos(); $cmd$);

select cron.alter_job(jobid, active := false) from cron.job where jobname in ('zig-baixa-noite', 'reposicao-balcao-noite');
