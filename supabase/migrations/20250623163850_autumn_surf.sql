/*
  # Add tipo_pagamento to contas_pagar

  1. Schema Changes
    - Add tipo_pagamento column to contas_pagar table
    - Update existing records with default value
    - Drop and recreate view to include new field

  2. Security
    - Maintain existing RLS policies
*/

-- Add tipo_pagamento column to contas_pagar
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contas_pagar' AND column_name = 'tipo_pagamento'
  ) THEN
    ALTER TABLE contas_pagar ADD COLUMN tipo_pagamento text DEFAULT 'unica' CHECK (tipo_pagamento IN ('unica', 'recorrente', 'parcelado', 'carteira'));
  END IF;
END $$;

-- Update existing records to have default value
UPDATE contas_pagar SET tipo_pagamento = 'unica' WHERE tipo_pagamento IS NULL;

-- Drop the existing view first
DROP VIEW IF EXISTS vw_contas_pagar;

-- Recreate the view to include the new field
CREATE VIEW vw_contas_pagar AS
SELECT 
  cp.*,
  f.nome as fornecedor_nome,
  f.categoria_padrao_id as fornecedor_categoria_padrao,
  cat.nome as categoria_nome,
  cat.caminho_completo as categoria_completa,
  cc.nome as centro_custo_nome,
  fp.nome as forma_pagamento_nome,
  u_criado.nome as criado_por_nome,
  u_aprovado.nome as aprovado_por_nome,
  CASE 
    WHEN cp.data_vencimento < CURRENT_DATE AND cp.status IN ('em_aberto', 'parcialmente_pago') THEN true
    ELSE false
  END as esta_vencida,
  (CURRENT_DATE - cp.data_vencimento) as dias_vencimento
FROM contas_pagar cp
LEFT JOIN fornecedores f ON cp.fornecedor_id = f.id
LEFT JOIN vw_categoria_tree cat ON cp.categoria_id = cat.id
LEFT JOIN centros_custo cc ON cp.centro_custo_id = cc.id
LEFT JOIN formas_pagamento fp ON cp.forma_pagamento_id = fp.id
LEFT JOIN usuarios u_criado ON cp.criado_por = u_criado.id
LEFT JOIN usuarios u_aprovado ON cp.aprovado_por = u_aprovado.id;