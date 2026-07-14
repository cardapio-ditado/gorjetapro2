/*
  # Corrigir CASCADE em fluxo_caixa.pagamento_id
  
  1. Problema
    - fluxo_caixa.pagamento_id → pagamentos_contas(id) sem CASCADE
    - Isso impede exclusão de pagamentos e contas
  
  2. Solução
    - Remover constraint antiga
    - Adicionar com ON DELETE CASCADE
*/

-- Remover constraint de pagamento_id
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'fluxo_caixa'::regclass
    AND confrelid = 'pagamentos_contas'::regclass
    AND contype = 'f';
  
  IF constraint_name IS NOT NULL THEN
    RAISE NOTICE 'Removendo constraint: %', constraint_name;
    EXECUTE format('ALTER TABLE fluxo_caixa DROP CONSTRAINT IF EXISTS %I', constraint_name);
  END IF;
END $$;

-- Adicionar constraint com CASCADE
ALTER TABLE fluxo_caixa
ADD CONSTRAINT fluxo_caixa_pagamento_id_fkey 
FOREIGN KEY (pagamento_id) 
REFERENCES pagamentos_contas(id) 
ON DELETE CASCADE;

COMMENT ON CONSTRAINT fluxo_caixa_pagamento_id_fkey ON fluxo_caixa IS 
'Ao excluir um pagamento, o lançamento no fluxo_caixa é excluído automaticamente (CASCADE)';
