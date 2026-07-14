/*
  # Criar Categoria "Músicos e Artistas" no Plano de Contas

  1. Objetivo
    - Garantir que existe uma categoria específica para músicos
    - Criar automaticamente se não existir
    - Vinculada como subcategoria de "Despesas Operacionais"
  
  2. Estrutura
    - Categoria pai: Despesas Operacionais
    - Categoria filho: Músicos e Artistas
    - Tipo: despesa
  
  3. Notas
    - Usa IF NOT EXISTS para evitar duplicação
    - Mantém integridade de dados existentes
*/

DO $$
DECLARE
  v_categoria_pai_id uuid;
  v_categoria_musicos_id uuid;
BEGIN
  -- Buscar ou criar categoria pai "Despesas Operacionais"
  SELECT id INTO v_categoria_pai_id
  FROM categorias_financeiras
  WHERE nome = 'Despesas Operacionais' AND tipo = 'despesa' AND categoria_pai_id IS NULL
  LIMIT 1;

  IF v_categoria_pai_id IS NULL THEN
    INSERT INTO categorias_financeiras (nome, tipo, categoria_pai_id, status)
    VALUES ('Despesas Operacionais', 'despesa', NULL, 'ativo')
    RETURNING id INTO v_categoria_pai_id;
  END IF;

  -- Verificar se já existe categoria "Músicos e Artistas"
  SELECT id INTO v_categoria_musicos_id
  FROM categorias_financeiras
  WHERE nome = 'Músicos e Artistas' AND tipo = 'despesa';

  -- Criar categoria "Músicos e Artistas" se não existir
  IF v_categoria_musicos_id IS NULL THEN
    INSERT INTO categorias_financeiras (nome, tipo, categoria_pai_id, status)
    VALUES ('Músicos e Artistas', 'despesa', v_categoria_pai_id, 'ativo');
  END IF;
END $$;