/*
  # Corrigir default de data_movimentacao para usar timezone correto
  
  1. Problema
    - Coluna data_movimentacao usa DEFAULT now() que retorna UTC
    - Movimentações criadas sem especificar data ficam com data incorreta
    
  2. Solução
    - Alterar default para timezone('America/Sao_Paulo', now())
    - Todas as novas movimentações terão data correta
    
  3. Impacto
    - Apenas novos registros serão afetados
    - Registros históricos permanecem inalterados
*/

-- Alterar default da coluna data_movimentacao
ALTER TABLE movimentacoes_estoque 
ALTER COLUMN data_movimentacao 
SET DEFAULT timezone('America/Sao_Paulo', now());
