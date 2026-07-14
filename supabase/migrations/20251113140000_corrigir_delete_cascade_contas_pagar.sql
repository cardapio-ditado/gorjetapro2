/*
  # Corrigir DELETE CASCADE em contas_pagar
  
  1. Problema
    - Constraint em fluxo_caixa.conta_pagar_id não tem ON DELETE CASCADE
    - Isso impede exclusão de contas (erro 409)
  
  2. Solução
    - Remover constraint antiga
    - Adicionar nova constraint com ON DELETE CASCADE
    
  3. Tabelas afetadas
    - fluxo_caixa (principal problema)
*/

-- Remover constraint antiga de fluxo_caixa.conta_pagar_id
DO $$
DECLARE
  constraint_name TEXT;
BEGIN
  -- Buscar nome da constraint
  SELECT conname INTO constraint_name
  FROM pg_constraint
  WHERE conrelid = 'fluxo_caixa'::regclass
    AND confrelid = 'contas_pagar'::regclass
    AND contype = 'f'
    AND ARRAY['conta_pagar_id'::text] = (
      SELECT ARRAY(
        SELECT attname
        FROM pg_attribute
        WHERE attrelid = conrelid
          AND attnum = ANY(conkey)
        ORDER BY attnum
      )
    );
  
  IF constraint_name IS NOT NULL THEN
    RAISE NOTICE 'Removendo constraint: %', constraint_name;
    EXECUTE format('ALTER TABLE fluxo_caixa DROP CONSTRAINT IF EXISTS %I', constraint_name);
  ELSE
    RAISE NOTICE 'Constraint não encontrada';
  END IF;
END $$;

-- Adicionar nova constraint com ON DELETE CASCADE
ALTER TABLE fluxo_caixa
ADD CONSTRAINT fluxo_caixa_conta_pagar_id_fkey 
FOREIGN KEY (conta_pagar_id) 
REFERENCES contas_pagar(id) 
ON DELETE CASCADE;

-- Verificar outras constraints
DO $$
DECLARE
  constraint_info RECORD;
BEGIN
  RAISE NOTICE 'Verificando todas as constraints de contas_pagar:';
  
  FOR constraint_info IN
    SELECT 
      conrelid::regclass AS tabela,
      conname AS constraint_name,
      CASE confdeltype
        WHEN 'a' THEN 'NO ACTION'
        WHEN 'r' THEN 'RESTRICT'
        WHEN 'c' THEN 'CASCADE'
        WHEN 'n' THEN 'SET NULL'
        WHEN 'd' THEN 'SET DEFAULT'
        ELSE 'UNKNOWN'
      END AS delete_action,
      (
        SELECT ARRAY(
          SELECT attname
          FROM pg_attribute
          WHERE attrelid = conrelid
            AND attnum = ANY(conkey)
          ORDER BY attnum
        )
      ) AS colunas
    FROM pg_constraint
    WHERE confrelid = 'contas_pagar'::regclass
      AND contype = 'f'
    ORDER BY conrelid::regclass::text
  LOOP
    RAISE NOTICE '  Tabela: % | Constraint: % | Coluna(s): % | Delete: %',
      constraint_info.tabela,
      constraint_info.constraint_name,
      constraint_info.colunas,
      constraint_info.delete_action;
  END LOOP;
END $$;

-- Comentário
COMMENT ON CONSTRAINT fluxo_caixa_conta_pagar_id_fkey ON fluxo_caixa IS 
'Ao excluir uma conta_pagar, todos os lançamentos no fluxo_caixa são excluídos automaticamente (CASCADE)';
