-- ═══════════════════════════════════════════════════════════════════════════
-- CRON sync-zig-fidelidade-diario: corrigir comando que falhava todo dia
--
-- O comando antigo montava o header Authorization concatenando com || dentro
-- de um literal JSON entre aspas simples, então o JSON ficava inválido
-- ("Token | is invalid") e o job falhou em 100% das execuções. Além disso,
-- ele buscava a URL e a chave no vault, que está vazio neste projeto.
--
-- A edge function sync-zig-fidelidade roda com verify_jwt = false e usa a
-- service role internamente, então não precisa de Authorization. Fica igual
-- aos jobs que funcionam (sync-faturamento-zig-diario): URL fixa do projeto
-- e headers montados com jsonb_build_object.
-- ═══════════════════════════════════════════════════════════════════════════

select cron.alter_job(
  job_id  => (select jobid from cron.job where jobname = 'sync-zig-fidelidade-diario'),
  command => $cmd$
    SELECT net.http_post(
      url := 'https://nzdiojmrukdxavrdazot.supabase.co/functions/v1/sync-zig-fidelidade',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := '{}'::jsonb,
      timeout_milliseconds := 60000
    );
  $cmd$
);
