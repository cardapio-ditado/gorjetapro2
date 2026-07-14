/*
  # Adicionar constraint UNIQUE no CPF

  1. Alterações
    - Adicionar constraint UNIQUE no campo CPF para evitar duplicatas
*/

-- Adicionar constraint unique no CPF
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'funcionarios_cpf_key'
  ) THEN
    ALTER TABLE funcionarios ADD CONSTRAINT funcionarios_cpf_key UNIQUE (cpf);
  END IF;
END $$;
