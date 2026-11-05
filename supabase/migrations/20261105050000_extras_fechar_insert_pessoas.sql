-- Trava de extras completa (05/11/2026, com a tela nova publicada): pessoa nova só por
-- fn_extras_cadastrar_pessoa (nome completo, PIX, aviso de parecido). Nada de insert direto.
revoke insert on public.extras_pessoas from anon, authenticated;
