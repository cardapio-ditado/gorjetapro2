-- Fix unique constraint on agenda_pagamentos table
-- This ensures ON CONFLICT works properly in the RPC function

-- Add unique constraint if it doesn't exist
DO $$
BEGIN
  -- Check if the unique constraint already exists
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_name = 'agenda_pagamentos_data_base_key'
    AND table_name = 'agenda_pagamentos'
    AND table_schema = 'public'
  ) THEN
    -- Add the unique constraint
    ALTER TABLE agenda_pagamentos
    ADD CONSTRAINT agenda_pagamentos_data_base_key UNIQUE (data_base);
  END IF;
END $$;