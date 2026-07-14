/*
  # Unificar Centro de Custo no Fluxo de Caixa para Ditado Popular

  1. Alterações
    - Atualiza todos os lançamentos de fluxo_caixa para usar centro_custo = 'Ditado Popular'
    - Remove a possibilidade de centros de custo diversos no fluxo de caixa
  
  2. Justificativa
    - Simplificar a gestão do fluxo de caixa
    - Centralizar todos os lançamentos em um único centro de custo
    - Manter consistência nos relatórios financeiros
*/

-- Atualizar todos os registros existentes
UPDATE fluxo_caixa 
SET centro_custo = 'Ditado Popular'
WHERE centro_custo IS NOT NULL;

-- Definir valor padrão para novos registros
ALTER TABLE fluxo_caixa 
ALTER COLUMN centro_custo SET DEFAULT 'Ditado Popular';
