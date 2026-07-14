/*
  # Remover check constraints rígidas de rh_avaliacoes

  As constraints existentes bloqueiam valores personalizados enviados pelo frontend
  (ex: resultado='satisfatorio', recomendacao='manter', status='concluida', tipo='Desempenho Geral').
  Como o sistema agora usa tipos de avaliação configuráveis, os valores precisam ser livres.

  Remove:
    - rh_avaliacoes_recomendacao_check
    - rh_avaliacoes_resultado_check
    - rh_avaliacoes_status_check
    - rh_avaliacoes_tipo_check
*/

ALTER TABLE rh_avaliacoes DROP CONSTRAINT IF EXISTS rh_avaliacoes_recomendacao_check;
ALTER TABLE rh_avaliacoes DROP CONSTRAINT IF EXISTS rh_avaliacoes_resultado_check;
ALTER TABLE rh_avaliacoes DROP CONSTRAINT IF EXISTS rh_avaliacoes_status_check;
ALTER TABLE rh_avaliacoes DROP CONSTRAINT IF EXISTS rh_avaliacoes_tipo_check;
