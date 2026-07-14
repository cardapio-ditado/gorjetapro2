/*
  # Expandir setores permitidos em tarefas_setoriais

  Adiciona 'delivery' e 'rh' como valores válidos para a coluna setor.
  Remove e recria o CHECK constraint com os novos valores.

  Em seguida migra as tarefas do setor 'cozinha' para 'delivery'.
*/

-- Remove o check constraint atual
ALTER TABLE tarefas_setoriais DROP CONSTRAINT IF EXISTS tarefas_setoriais_setor_check;

-- Recria com os novos setores incluídos
ALTER TABLE tarefas_setoriais
  ADD CONSTRAINT tarefas_setoriais_setor_check
  CHECK (setor IN ('gestao','marketing','cozinha','bar','salao','delivery','rh'));

-- Migra tarefas da cozinha para o delivery
UPDATE tarefas_setoriais SET setor = 'delivery' WHERE setor = 'cozinha';
