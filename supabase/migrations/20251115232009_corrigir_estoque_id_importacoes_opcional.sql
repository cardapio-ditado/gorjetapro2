/*
  # Tornar estoque_id opcional em importacoes_vendas

  1. Alterações
    - Campo `estoque_id` agora aceita NULL
    - Cada item pode ter estoque diferente, não precisa de estoque global
  
  2. Motivo
    - Importações de vendas podem ter produtos de diferentes estoques
    - O estoque é definido por item, não por importação
*/

ALTER TABLE importacoes_vendas 
ALTER COLUMN estoque_id DROP NOT NULL;
