/*
  # Add missing RH integration columns to contas_pagar

  1. New Columns
    - `origem_rh_tipo` (text) - Type of RH origin (gorjeta_semanal, adiantamento)
    - `origem_rh_id` (uuid) - ID of the RH record
    - `origem_rh_semana` (integer) - Week number for weekly tips
    - `origem_rh_ano` (integer) - Year for weekly tips

  2. Constraints
    - Check constraint for valid RH types
    - Check constraint for valid week numbers (1-53)
    - Check constraint for valid years (2020-2050)

  3. Indexes
    - Index for RH origin queries
    - Index for week/year queries
*/

-- Add missing columns for RH integration
DO $$
BEGIN
  -- Add origem_rh_tipo column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contas_pagar' AND column_name = 'origem_rh_tipo'
  ) THEN
    ALTER TABLE contas_pagar ADD COLUMN origem_rh_tipo text;
  END IF;

  -- Add origem_rh_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contas_pagar' AND column_name = 'origem_rh_id'
  ) THEN
    ALTER TABLE contas_pagar ADD COLUMN origem_rh_id uuid;
  END IF;

  -- Add origem_rh_semana column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contas_pagar' AND column_name = 'origem_rh_semana'
  ) THEN
    ALTER TABLE contas_pagar ADD COLUMN origem_rh_semana integer;
  END IF;

  -- Add origem_rh_ano column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'contas_pagar' AND column_name = 'origem_rh_ano'
  ) THEN
    ALTER TABLE contas_pagar ADD COLUMN origem_rh_ano integer;
  END IF;
END $$;

-- Add check constraints
DO $$
BEGIN
  -- Check constraint for origem_rh_tipo
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'contas_pagar' AND constraint_name = 'contas_pagar_origem_rh_tipo_check'
  ) THEN
    ALTER TABLE contas_pagar ADD CONSTRAINT contas_pagar_origem_rh_tipo_check 
    CHECK (origem_rh_tipo IS NULL OR origem_rh_tipo = ANY (ARRAY['gorjeta_semanal'::text, 'adiantamento'::text]));
  END IF;

  -- Check constraint for origem_rh_semana
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'contas_pagar' AND constraint_name = 'contas_pagar_origem_rh_semana_check'
  ) THEN
    ALTER TABLE contas_pagar ADD CONSTRAINT contas_pagar_origem_rh_semana_check 
    CHECK (origem_rh_semana IS NULL OR (origem_rh_semana >= 1 AND origem_rh_semana <= 53));
  END IF;

  -- Check constraint for origem_rh_ano
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'contas_pagar' AND constraint_name = 'contas_pagar_origem_rh_ano_check'
  ) THEN
    ALTER TABLE contas_pagar ADD CONSTRAINT contas_pagar_origem_rh_ano_check 
    CHECK (origem_rh_ano IS NULL OR (origem_rh_ano >= 2020 AND origem_rh_ano <= 2050));
  END IF;
END $$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_contas_pagar_origem_rh 
ON contas_pagar (origem_rh_tipo, origem_rh_id);

CREATE INDEX IF NOT EXISTS idx_contas_pagar_rh_semana_ano 
ON contas_pagar (origem_rh_semana, origem_rh_ano);

-- Function to create weekly tip account
CREATE OR REPLACE FUNCTION criar_conta_pagar_gorjeta_semanal(
  p_colaborador_id uuid,
  p_semana integer,
  p_ano integer,
  p_valor_liquido numeric,
  p_observacoes text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_fornecedor_id uuid;
  v_conta_id uuid;
  v_colaborador_nome text;
  v_data_vencimento date;
BEGIN
  -- Get employee name
  SELECT nome_completo INTO v_colaborador_nome
  FROM colaboradores
  WHERE id = p_colaborador_id;

  IF v_colaborador_nome IS NULL THEN
    RAISE EXCEPTION 'Colaborador não encontrado';
  END IF;

  -- Calculate due date (3 days after week end)
  v_data_vencimento := (
    SELECT date_trunc('week', make_date(p_ano, 1, 4)) + 
           (p_semana - 1) * interval '1 week' + 
           interval '6 days' + 
           interval '3 days'
  );

  -- Find or create supplier for employee
  SELECT id INTO v_fornecedor_id
  FROM fornecedores
  WHERE nome = 'RH - ' || v_colaborador_nome
    AND status = 'ativo';

  IF v_fornecedor_id IS NULL THEN
    -- Create supplier for employee
    INSERT INTO fornecedores (
      nome,
      responsavel,
      observacoes,
      status
    ) VALUES (
      'RH - ' || v_colaborador_nome,
      v_colaborador_nome,
      'Fornecedor criado automaticamente para pagamento de gorjetas do colaborador',
      'ativo'
    ) RETURNING id INTO v_fornecedor_id;
  END IF;

  -- Create account payable
  INSERT INTO contas_pagar (
    fornecedor_id,
    descricao,
    valor_total,
    data_vencimento,
    data_emissao,
    status,
    observacoes,
    origem_rh_tipo,
    origem_rh_id,
    origem_rh_semana,
    origem_rh_ano
  ) VALUES (
    v_fornecedor_id,
    'Gorjeta Semanal - ' || v_colaborador_nome || ' - Semana ' || p_semana || '/' || p_ano,
    p_valor_liquido,
    v_data_vencimento,
    CURRENT_DATE,
    'em_aberto',
    p_observacoes,
    'gorjeta_semanal',
    p_colaborador_id,
    p_semana,
    p_ano
  ) RETURNING id INTO v_conta_id;

  RETURN v_conta_id;
END;
$$ LANGUAGE plpgsql;

-- Function to create advance account
CREATE OR REPLACE FUNCTION criar_conta_pagar_adiantamento(
  p_colaborador_id uuid,
  p_adiantamento_id uuid,
  p_valor numeric,
  p_data_adiantamento date,
  p_observacoes text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_fornecedor_id uuid;
  v_conta_id uuid;
  v_colaborador_nome text;
BEGIN
  -- Get employee name
  SELECT nome_completo INTO v_colaborador_nome
  FROM colaboradores
  WHERE id = p_colaborador_id;

  IF v_colaborador_nome IS NULL THEN
    RAISE EXCEPTION 'Colaborador não encontrado';
  END IF;

  -- Find or create supplier for employee
  SELECT id INTO v_fornecedor_id
  FROM fornecedores
  WHERE nome = 'RH - ' || v_colaborador_nome
    AND status = 'ativo';

  IF v_fornecedor_id IS NULL THEN
    -- Create supplier for employee
    INSERT INTO fornecedores (
      nome,
      responsavel,
      observacoes,
      status
    ) VALUES (
      'RH - ' || v_colaborador_nome,
      v_colaborador_nome,
      'Fornecedor criado automaticamente para pagamento de adiantamentos do colaborador',
      'ativo'
    ) RETURNING id INTO v_fornecedor_id;
  END IF;

  -- Create account payable
  INSERT INTO contas_pagar (
    fornecedor_id,
    descricao,
    valor_total,
    data_vencimento,
    data_emissao,
    status,
    observacoes,
    origem_rh_tipo,
    origem_rh_id
  ) VALUES (
    v_fornecedor_id,
    'Adiantamento Salarial - ' || v_colaborador_nome || ' - ' || to_char(p_data_adiantamento, 'DD/MM/YYYY'),
    p_valor,
    p_data_adiantamento + interval '1 day', -- Due next day
    CURRENT_DATE,
    'em_aberto',
    p_observacoes,
    'adiantamento',
    p_adiantamento_id
  ) RETURNING id INTO v_conta_id;

  RETURN v_conta_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to sync payment status
CREATE OR REPLACE FUNCTION sincronizar_pagamento_rh()
RETURNS trigger AS $$
BEGIN
  -- Update payment status based on account status
  IF NEW.origem_rh_tipo = 'adiantamento' AND NEW.origem_rh_id IS NOT NULL THEN
    -- Update advance payment status
    UPDATE descontos_outros
    SET status_pagamento = CASE
      WHEN NEW.status = 'pago' THEN 'pago'
      WHEN NEW.status = 'cancelado' THEN 'cancelado'
      ELSE 'pendente'
    END
    WHERE id = NEW.origem_rh_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for payment sync
DROP TRIGGER IF EXISTS trg_sincronizar_pagamento_rh ON contas_pagar;
CREATE TRIGGER trg_sincronizar_pagamento_rh
  AFTER UPDATE ON contas_pagar
  FOR EACH ROW
  WHEN (NEW.origem_rh_tipo IS NOT NULL)
  EXECUTE FUNCTION sincronizar_pagamento_rh();

-- Create view for RH payments report
CREATE OR REPLACE VIEW vw_pagamentos_rh AS
SELECT 
  cp.id as conta_id,
  cp.fornecedor_id,
  f.nome as fornecedor_nome,
  cp.descricao,
  cp.valor_total,
  cp.valor_pago,
  cp.saldo_restante,
  cp.data_emissao,
  cp.data_vencimento,
  cp.status,
  cp.origem_rh_tipo,
  cp.origem_rh_id,
  cp.origem_rh_semana,
  cp.origem_rh_ano,
  cp.observacoes,
  -- Employee data
  c.nome_completo as colaborador_nome,
  c.funcao_personalizada,
  fr.nome as funcao_nome,
  -- Payment data
  COALESCE(
    (SELECT SUM(valor_pagamento) 
     FROM pagamentos_contas 
     WHERE conta_pagar_id = cp.id), 0
  ) as total_pago,
  EXISTS(
    SELECT 1 FROM pagamentos_contas 
    WHERE conta_pagar_id = cp.id
  ) as tem_pagamentos
FROM contas_pagar cp
LEFT JOIN fornecedores f ON f.id = cp.fornecedor_id
LEFT JOIN colaboradores c ON c.id = cp.origem_rh_id
LEFT JOIN funcoes_rh fr ON fr.id = c.funcao_id
WHERE cp.origem_rh_tipo IS NOT NULL;