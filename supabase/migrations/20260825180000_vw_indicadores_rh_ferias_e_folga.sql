/*
  vw_indicadores_rh: dois contadores mentiam.

  - colaboradores_ferias contava so status 'aprovado' entre as datas; quem
    esta DE FERIAS tem status 'gozado', entao o KPI vivia em zero. Passa a
    contar pelas datas (hoje dentro do intervalo), excluindo cancelado.
  - colaboradores_sem_folga_7_dias devolvia o quadro inteiro (49): o filtro
    c.status='ativo' estava DENTRO do NOT EXISTS, virando condicao da folga
    em vez de condicao do colaborador. Sobe para o WHERE externo.
*/
CREATE OR REPLACE VIEW vw_indicadores_rh AS
SELECT
  (SELECT count(*) FROM colaboradores WHERE status = 'ativo') AS colaboradores_ativos,
  (SELECT count(*) FROM colaboradores WHERE status = 'inativo') AS colaboradores_inativos,
  (SELECT count(*) FROM colaboradores) AS total_colaboradores,
  (SELECT count(*) FROM escalas_trabalho
    WHERE data_escala >= date_trunc('month', CURRENT_DATE)) AS escalas_mes_atual,
  (SELECT count(DISTINCT setor) FROM escalas_trabalho
    WHERE data_escala >= date_trunc('month', CURRENT_DATE)) AS setores_ativos,
  (SELECT count(*) FROM ferias_colaboradores
    WHERE status <> 'cancelado'
      AND data_inicio <= CURRENT_DATE
      AND data_fim >= CURRENT_DATE) AS colaboradores_ferias,
  (SELECT count(*) FROM ocorrencias_colaborador
    WHERE data_ocorrencia >= date_trunc('month', CURRENT_DATE)) AS ocorrencias_mes,
  (SELECT COALESCE(sum(valor_comissao), 0) FROM comissoes_garcom
    WHERE data_calculo >= date_trunc('month', CURRENT_DATE)) AS comissoes_mes,
  (SELECT COALESCE(sum(valor_diaria), 0) FROM extras_freelancers
    WHERE data_trabalho >= date_trunc('month', CURRENT_DATE)) AS extras_mes,
  (SELECT count(*) FROM colaboradores c
    WHERE c.status = 'ativo'
      AND NOT EXISTS (
        SELECT 1 FROM escalas_trabalho e
         WHERE e.colaborador_id = c.id
           AND e.eh_folga = true
           AND e.data_escala >= CURRENT_DATE - interval '7 days'
      )) AS colaboradores_sem_folga_7_dias;
