/*
  # Adicionar novas etapas ao processo de candidatura

  1. Alterações
    - Adicionar 'entrevista_pessoal' e 'banco_talentos' aos valores permitidos em etapa_atual
    - Adicionar 'banco_talentos' e 'em_processo' aos valores permitidos em status
*/

-- Remover constraint existente de etapa_atual
ALTER TABLE rh_candidaturas 
DROP CONSTRAINT IF EXISTS rh_candidaturas_etapa_atual_check;

-- Adicionar nova constraint com valores atualizados
ALTER TABLE rh_candidaturas 
ADD CONSTRAINT rh_candidaturas_etapa_atual_check 
CHECK (etapa_atual IN (
  'triagem_curriculo',
  'teste_disc',
  'entrevista',
  'entrevista_pessoal',
  'avaliacao_final',
  'banco_talentos',
  'finalizado'
));

-- Remover constraint existente de status
ALTER TABLE rh_candidaturas 
DROP CONSTRAINT IF EXISTS rh_candidaturas_status_check;

-- Adicionar nova constraint de status com valores atualizados
ALTER TABLE rh_candidaturas 
ADD CONSTRAINT rh_candidaturas_status_check 
CHECK (status IN (
  'novo',
  'triagem',
  'teste',
  'entrevista',
  'em_processo',
  'finalista',
  'aprovado',
  'reprovado',
  'recusado',
  'desistente',
  'banco_talentos'
));
