/*
  # Create Solicitações Indicators View

  1. New Views
    - `vw_indicadores_solicitacoes`
      - Aggregates key metrics from solicitacoes table
      - Provides dashboard indicators for the frontend
      - Calculates counts by status, priority, and timing
      - Includes financial totals and execution time averages

  2. Security
    - View inherits security from underlying tables
*/

CREATE OR REPLACE VIEW public.vw_indicadores_solicitacoes AS
SELECT
    COUNT(s.id) AS total_solicitacoes,
    COUNT(CASE WHEN s.status = 'enviado' THEN s.id END) AS solicitacoes_enviadas,
    COUNT(CASE WHEN s.status = 'em_analise' THEN s.id END) AS solicitacoes_em_analise,
    COUNT(CASE WHEN s.status = 'aprovado' THEN s.id END) AS solicitacoes_aprovadas,
    COUNT(CASE WHEN s.status = 'em_execucao' THEN s.id END) AS solicitacoes_em_execucao,
    COUNT(CASE WHEN s.status = 'concluido' THEN s.id END) AS solicitacoes_concluidas,
    COUNT(CASE WHEN s.prioridade = 'urgente' THEN s.id END) AS solicitacoes_urgentes,
    COUNT(CASE WHEN s.status IN ('enviado', 'em_analise', 'aprovado', 'em_execucao') AND s.data_limite < NOW() THEN s.id END) AS solicitacoes_atrasadas,
    COALESCE(SUM(s.valor_total_orcado), 0) AS valor_total_orcado,
    COALESCE(SUM(s.valor_aprovado), 0) AS valor_total_gasto,
    COUNT(DISTINCT s.setor_solicitante) AS setores_ativos,
    COALESCE(AVG(EXTRACT(EPOCH FROM (s.criado_em - s.data_solicitacao))) / 3600 / 24, 0) AS tempo_medio_execucao
FROM
    public.solicitacoes s;