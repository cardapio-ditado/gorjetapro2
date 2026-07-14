/*
  # Corrigir datas das movimentações existentes
  
  1. Problema
    - Movimentações criadas antes da correção do tipo de data ficaram com data errada
    - data_compra = 2026-02-11, mas data_movimentacao = 2026-02-10
    - Isso ocorreu porque o trigger copiava a data, mas como era timestamptz, sofria conversão de timezone
    
  2. Solução
    - Atualizar movimentações de compras para usar a data_compra correta da tabela entradas_compras
    - Garantir que data_movimentacao = data_compra para origem_tipo = 'compra'
    
  3. Impacto
    - Corrige todas as movimentações de compras que têm data incorreta
    - Apenas movimentações vindas de compras serão afetadas
*/

-- Atualizar movimentações de compras para usar a data correta da compra
UPDATE movimentacoes_estoque m
SET data_movimentacao = ec.data_compra
FROM entradas_compras ec
WHERE m.origem_tipo = 'compra'
  AND m.origem_id = ec.id
  AND m.data_movimentacao != ec.data_compra;

-- Log de quantos registros foram corrigidos
DO $$
DECLARE
  registros_corrigidos INTEGER;
BEGIN
  GET DIAGNOSTICS registros_corrigidos = ROW_COUNT;
  RAISE NOTICE 'Corrigidas % movimentações de compras', registros_corrigidos;
END $$;
