-- ═══════════════════════════════════════════════════════════════════════════
-- BAIXA AUTOMÁTICA DAS VENDAS ZIG
--
-- A baixa das vendas da ZIG no estoque era manual (tela Estoque › ZIG Vendas)
-- e parou de ser feita em 04/08/2026. A partir de agora a edge function
-- zig-baixa-automatica roda todo dia às 6h de Cuiabá (10h UTC), processa o
-- dia anterior e avisa os gestores pelo Telegram o que ficou sem mapeamento.
-- ═══════════════════════════════════════════════════════════════════════════

-- Marca o uso de um mapeamento ZIG (contador e última utilização).
create or replace function public.fn_registrar_uso_mapeamento_zig(p_nome_externo text)
returns void
language sql
security definer
set search_path = public
as $$
  update mapeamento_itens_vendas
     set usado_vezes = coalesce(usado_vezes, 0) + 1,
         ultima_utilizacao = now(),
         atualizado_em = now()
   where nome_externo = p_nome_externo;
$$;

grant execute on function public.fn_registrar_uso_mapeamento_zig(text) to service_role;

-- Job diário. A chave abaixo é a chave pública (anon) do projeto, a mesma que
-- o site usa; ela só serve para o gateway aceitar a chamada.
select cron.unschedule(jobid) from cron.job where jobname = 'zig-baixa-automatica-diaria';

select cron.schedule(
  'zig-baixa-automatica-diaria',
  '0 10 * * *',
  $cmd$
    SELECT net.http_post(
      url := 'https://nzdiojmrukdxavrdazot.supabase.co/functions/v1/zig-baixa-automatica',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im56ZGlvam1ydWtkeGF2cmRhem90Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDg4OTA1NjksImV4cCI6MjA2NDQ2NjU2OX0.-6VLiW0Ui4OEhMhYXpXJKhKC2tgujjrPywgnRW4BLY0'
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 150000
    );
  $cmd$
);
