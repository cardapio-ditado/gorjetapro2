/*
  # Corrigir Foreign Keys Visão Estratégica Despesas
  
  ## Problema
  - Ao criar despesa, está falhando a constraint visao_estrategica_despesas_categoria_id_fkey
  - O sistema foi migrado para usar categorias_financeiras (UUID) mas ainda tem constraints 
    antigas apontando para visao_estrategica_categorias (TEXT)
  
  ## Solução
  1. Remover constraints antigas que referenciam tabelas TEXT
  2. Tornar categoria_id e subcategoria_id nullable (já que usamos categoria_financeira_id agora)
  3. Ajustar código para usar apenas categoria_financeira_id
  
  ## Tabelas Afetadas
  - visao_estrategica_despesas
*/

-- 1. Remover constraints antigas que estão causando erro
ALTER TABLE visao_estrategica_despesas 
  DROP CONSTRAINT IF EXISTS visao_estrategica_despesas_categoria_id_fkey;

ALTER TABLE visao_estrategica_despesas 
  DROP CONSTRAINT IF EXISTS visao_estrategica_despesas_subcategoria_id_fkey;

ALTER TABLE visao_estrategica_despesas 
  DROP CONSTRAINT IF EXISTS fk_subcategoria_categoria;

-- 2. Tornar categoria_id e subcategoria_id nullable (já que são legados)
ALTER TABLE visao_estrategica_despesas 
  ALTER COLUMN categoria_id DROP NOT NULL;

-- 3. Garantir que categoria_financeira_id seja obrigatório
-- ALTER TABLE visao_estrategica_despesas 
--   ALTER COLUMN categoria_financeira_id SET NOT NULL;

-- Nota: Comentado para não quebrar dados existentes sem categoria_financeira_id

-- 4. Comentário
COMMENT ON COLUMN visao_estrategica_despesas.categoria_id IS 'LEGADO: Usar categoria_financeira_id';
COMMENT ON COLUMN visao_estrategica_despesas.subcategoria_id IS 'LEGADO: Usar subcategoria_financeira_id';
