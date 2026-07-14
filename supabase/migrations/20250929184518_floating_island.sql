/*
  Fix unique constraint issue in agenda_pagamentos table
  
  This migration ensures the unique constraint on data_base column exists
  and fixes the ON CONFLICT clause in the RPC function.
*/

-- Ensure the unique constraint exists on agenda_pagamentos.data_base
DO $$
BEGIN
  -- Check if unique constraint exists, if not create it
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_type = 'UNIQUE' 
    AND table_name = 'agenda_pagamentos' 
    AND constraint_name = 'agenda_pagamentos_data_base_key'
  ) THEN
    ALTER TABLE agenda_pagamentos 
    ADD CONSTRAINT agenda_pagamentos_data_base_key UNIQUE (data_base);
  END IF;
END $$;

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_agenda_pagamentos_data_base 
ON agenda_pagamentos(data_base);

CREATE INDEX IF NOT EXISTS idx_agenda_pagamentos_status 
ON agenda_pagamentos(status);

-- Recreate the RPC function with proper constraint reference
CREATE OR REPLACE FUNCTION api_fin_criar_ou_importar_agenda(p_data date)
RETURNS uuid
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
DECLARE
  v_agenda_id uuid;
  v_conta record;
BEGIN
  -- Create or get existing agenda
  INSERT INTO agenda_pagamentos (data_base, criado_por, criado_em)
  VALUES (p_data, auth.uid(), now())
  ON CONFLICT (data_base) DO NOTHING;
  
  -- Get the agenda_id
  SELECT id INTO v_agenda_id 
  FROM agenda_pagamentos 
  WHERE data_base = p_data;
  
  -- Import from contas_pagar (avoid duplicates)
  FOR v_conta IN 
    SELECT 
      cp.id as conta_id,
      f.nome as fornecedor_nome,
      cp.descricao,
      cp.valor_total,
      cp.data_vencimento
    FROM contas_pagar cp
    INNER JOIN fornecedores f ON f.id = cp.fornecedor_id
    WHERE cp.status IN ('em_aberto', 'parcialmente_pago')
      AND cp.data_vencimento <= p_data
      AND cp.saldo_restante > 0
      AND NOT EXISTS (
        SELECT 1 FROM agenda_pagamento_itens api
        WHERE api.agenda_id = v_agenda_id 
        AND api.conta_pagar_id = cp.id
      )
  LOOP
    INSERT INTO agenda_pagamento_itens (
      agenda_id,
      origem,
      conta_pagar_id,
      fornecedor,
      descricao,
      valor,
      vencimento,
      status
    ) VALUES (
      v_agenda_id,
      'ap',
      v_conta.conta_id,
      v_conta.fornecedor_nome,
      v_conta.descricao,
      v_conta.valor_total,
      v_conta.data_vencimento,
      'proposto'
    );
  END LOOP;
  
  RETURN v_agenda_id;
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION api_fin_criar_ou_importar_agenda(date) TO anon;
GRANT EXECUTE ON FUNCTION api_fin_criar_ou_importar_agenda(date) TO authenticated;
GRANT EXECUTE ON FUNCTION api_fin_criar_ou_importar_agenda(date) TO service_role;