/*
  # Allow NULL values for criado_por fields

  1. Schema Changes
    - Remove NOT NULL constraint from criado_por in contas_pagar
    - Remove NOT NULL constraint from criado_por in pagamentos_contas  
    - Remove NOT NULL constraint from criado_por in anexos_contas

  2. Data Cleanup
    - Update any existing records with invalid UUIDs to NULL
    - Use proper UUID validation with text casting

  This allows the system to work in development without authentication
  while maintaining compatibility with production systems.
*/

-- Remove NOT NULL constraint from criado_por in contas_pagar
ALTER TABLE contas_pagar 
ALTER COLUMN criado_por DROP NOT NULL;

-- Remove NOT NULL constraint from criado_por in pagamentos_contas
ALTER TABLE pagamentos_contas 
ALTER COLUMN criado_por DROP NOT NULL;

-- Remove NOT NULL constraint from criado_por in anexos_contas
ALTER TABLE anexos_contas 
ALTER COLUMN criado_por DROP NOT NULL;

-- Update any existing records with invalid UUIDs to NULL
-- Cast UUID to text for regex validation
UPDATE contas_pagar 
SET criado_por = NULL 
WHERE criado_por IS NOT NULL 
AND criado_por::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

UPDATE pagamentos_contas 
SET criado_por = NULL 
WHERE criado_por IS NOT NULL 
AND criado_por::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

UPDATE anexos_contas 
SET criado_por = NULL 
WHERE criado_por IS NOT NULL 
AND criado_por::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';

-- Also clean up any records that might have empty strings or invalid values
-- This handles cases where the UUID field might contain non-UUID data
UPDATE contas_pagar 
SET criado_por = NULL 
WHERE criado_por IS NOT NULL 
AND LENGTH(criado_por::text) != 36;

UPDATE pagamentos_contas 
SET criado_por = NULL 
WHERE criado_por IS NOT NULL 
AND LENGTH(criado_por::text) != 36;

UPDATE anexos_contas 
SET criado_por = NULL 
WHERE criado_por IS NOT NULL 
AND LENGTH(criado_por::text) != 36;