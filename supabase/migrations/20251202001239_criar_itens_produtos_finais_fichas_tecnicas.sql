/*
  # Criar itens de estoque para fichas técnicas
  
  1. Objetivo
    - Criar automaticamente um item de estoque do tipo 'produto_final' para cada ficha técnica
    - Permitir que produtos produzidos a partir de fichas técnicas sejam contados no estoque
  
  2. Ações
    - Inserir itens faltantes na tabela itens_estoque baseado nas fichas_tecnicas
    - Criar saldos zerados para cada produto final em todos os estoques
*/

-- Criar itens de estoque para fichas técnicas que ainda não têm item correspondente
INSERT INTO itens_estoque (nome, tipo_item, unidade_medida, status)
SELECT 
  ft.nome,
  'produto_final' as tipo_item,
  'UN' as unidade_medida,
  'ativo' as status
FROM fichas_tecnicas ft
WHERE ft.status = true
  AND NOT EXISTS (
    SELECT 1 FROM itens_estoque ie 
    WHERE ie.nome = ft.nome AND ie.tipo_item = 'produto_final'
  )
ON CONFLICT DO NOTHING;
