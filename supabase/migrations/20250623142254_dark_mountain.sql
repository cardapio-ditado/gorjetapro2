/*
  # Fix vw_categoria_tree view integer conversion error

  1. Problem
    - The view `vw_categoria_tree` is trying to convert UUID values to integers
    - This causes "invalid input syntax for type integer" error
    - The issue is likely in the recursive CTE that calculates the hierarchy level

  2. Solution
    - Drop and recreate the view with proper UUID handling
    - Ensure the nivel (level) calculation uses proper integer arithmetic
    - Fix any UUID to integer conversion issues in the recursive query

  3. Changes
    - Drop existing view
    - Create corrected view with proper type handling
*/

-- Drop the existing view
DROP VIEW IF EXISTS vw_categoria_tree;

-- Recreate the view with proper type handling
CREATE OR REPLACE VIEW vw_categoria_tree AS
WITH RECURSIVE categoria_hierarchy AS (
  -- Base case: root categories (no parent)
  SELECT 
    id,
    nome,
    tipo,
    categoria_pai_id,
    status,
    ordem,
    descricao,
    criado_em,
    0 as nivel,
    nome as caminho_completo,
    nome as nome_indentado
  FROM categorias_financeiras 
  WHERE categoria_pai_id IS NULL
  
  UNION ALL
  
  -- Recursive case: child categories
  SELECT 
    c.id,
    c.nome,
    c.tipo,
    c.categoria_pai_id,
    c.status,
    c.ordem,
    c.descricao,
    c.criado_em,
    ch.nivel + 1 as nivel,
    ch.caminho_completo || ' > ' || c.nome as caminho_completo,
    REPEAT('  ', ch.nivel + 1) || c.nome as nome_indentado
  FROM categorias_financeiras c
  INNER JOIN categoria_hierarchy ch ON c.categoria_pai_id = ch.id
)
SELECT 
  id,
  nome,
  tipo,
  categoria_pai_id,
  status,
  ordem,
  descricao,
  criado_em,
  nivel,
  caminho_completo,
  nome_indentado
FROM categoria_hierarchy
ORDER BY tipo, ordem, caminho_completo;