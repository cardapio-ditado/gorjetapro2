-- Modulo antigo de ocorrencias por setor (tela sem rota) e diario de bordo
-- saem de uso: o Livro da Noite assume. Os dados ficam no schema legado
-- (1 ocorrencia e 1 diario). fn_dashboard_dono, fn_relatorio_diario_texto e
-- fn_contexto_diario_ia citavam estas tabelas e nao sao mais usadas.
alter view public.vw_pendencias_diario set schema legado;
alter view public.vw_ocorrencias_resumo set schema legado;
alter table public.ocorrencias_setor set schema legado;
alter table public.diario_bordo set schema legado;
