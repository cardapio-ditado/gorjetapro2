/*
  # Fix Gorjeta Sync to Work Like Musicos System

  1. Tables Updated
    - Add missing fields to `pagamentos_gorjeta` table to match musicos pattern
    - Add fornecedor_id, valor_total_final, valor_pago, saldo_restante, status_pagamento

  2. Functions
    - Create sync function exactly like musicos
    - Handle fornecedor creation/lookup
    - Sync bidirectional changes

  3. Triggers
    - Auto-sync on INSERT/UPDATE/DELETE of pagamentos_gorjeta
    - Auto-sync back from contas_pagar changes
*/

-- First, add missing columns to pagamentos_gorjeta to match musicos pattern
DO $$
BEGIN
  -- Add fornecedor_id column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pagamentos_gorjeta' AND column_name = 'fornecedor_id'
  ) THEN
    ALTER TABLE pagamentos_gorjeta ADD COLUMN fornecedor_id uuid REFERENCES fornecedores(id);
  END IF;

  -- Add valor_total_final column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pagamentos_gorjeta' AND column_name = 'valor_total_final'
  ) THEN
    ALTER TABLE pagamentos_gorjeta ADD COLUMN valor_total_final numeric(10,2) DEFAULT 0;
  END IF;

  -- Add valor_pago column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pagamentos_gorjeta' AND column_name = 'valor_pago'
  ) THEN
    ALTER TABLE pagamentos_gorjeta ADD COLUMN valor_pago numeric(10,2) DEFAULT 0;
  END IF;

  -- Add saldo_restante column
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pagamentos_gorjeta' AND column_name = 'saldo_restante'
  ) THEN
    ALTER TABLE pagamentos_gorjeta ADD COLUMN saldo_restante numeric(10,2) DEFAULT 0;
  END IF;

  -- Modify status_pagamento to match musicos pattern
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pagamentos_gorjeta' AND column_name = 'status_pagamento'
  ) THEN
    ALTER TABLE pagamentos_gorjeta ALTER COLUMN status_pagamento TYPE text;
    ALTER TABLE pagamentos_gorjeta ALTER COLUMN status_pagamento SET DEFAULT 'pendente';
  END IF;
END $$;

-- Add constraints for new columns
DO $$
BEGIN
  -- Add check constraints if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'pagamentos_gorjeta_valor_total_final_check'
  ) THEN
    ALTER TABLE pagamentos_gorjeta ADD CONSTRAINT pagamentos_gorjeta_valor_total_final_check CHECK (valor_total_final >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'pagamentos_gorjeta_valor_pago_check'
  ) THEN
    ALTER TABLE pagamentos_gorjeta ADD CONSTRAINT pagamentos_gorjeta_valor_pago_check CHECK (valor_pago >= 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'pagamentos_gorjeta_saldo_restante_check'
  ) THEN
    ALTER TABLE pagamentos_gorjeta ADD CONSTRAINT pagamentos_gorjeta_saldo_restante_check CHECK (saldo_restante >= 0);
  END IF;

  -- Update status check constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_name = 'pagamentos_gorjeta_status_pagamento_check'
  ) THEN
    ALTER TABLE pagamentos_gorjeta DROP CONSTRAINT pagamentos_gorjeta_status_pagamento_check;
  END IF;
  
  ALTER TABLE pagamentos_gorjeta ADD CONSTRAINT pagamentos_gorjeta_status_pagamento_check 
    CHECK (status_pagamento = ANY (ARRAY['pendente'::text, 'pago'::text, 'cancelado'::text]));
END $$;

-- Create or replace the sync function for gorjetas (based on musicos function)
CREATE OR REPLACE FUNCTION sincronizar_gorjeta_conta_pagar()
RETURNS TRIGGER AS $$
DECLARE
  fornecedor_rh_id uuid;
  conta_existente_id uuid;
  categoria_rh_id uuid;
  centro_custo_rh_id uuid;
  forma_pagamento_id uuid;
  colaborador_nome text;
BEGIN
  -- Get colaborador name
  SELECT nome_completo INTO colaborador_nome
  FROM colaboradores 
  WHERE id = COALESCE(NEW.colaborador_id, OLD.colaborador_id);

  -- Get or create RH supplier
  SELECT id INTO fornecedor_rh_id
  FROM fornecedores 
  WHERE nome = 'RH - Pagamentos de Funcionários'
  LIMIT 1;

  IF fornecedor_rh_id IS NULL THEN
    INSERT INTO fornecedores (nome, status, observacoes)
    VALUES ('RH - Pagamentos de Funcionários', 'ativo', 'Fornecedor automático para pagamentos de RH')
    RETURNING id INTO fornecedor_rh_id;
  END IF;

  -- Get default category for RH payments (try to find "Folha de Pagamento" or similar)
  SELECT id INTO categoria_rh_id
  FROM categorias_financeiras 
  WHERE tipo = 'despesa' 
    AND status = 'ativo'
    AND (nome ILIKE '%folha%' OR nome ILIKE '%pagamento%' OR nome ILIKE '%rh%')
  LIMIT 1;

  -- Get default cost center for RH
  SELECT id INTO centro_custo_rh_id
  FROM centros_custo 
  WHERE status = 'ativo'
    AND (nome ILIKE '%rh%' OR nome ILIKE '%recursos%' OR nome ILIKE '%humanos%')
  LIMIT 1;

  -- Get default payment method
  SELECT id INTO forma_pagamento_id
  FROM formas_pagamento 
  WHERE status = 'ativo'
    AND (nome ILIKE '%pix%' OR nome ILIKE '%dinheiro%' OR nome ILIKE '%transferencia%')
  LIMIT 1;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    -- Update fornecedor_id in pagamentos_gorjeta
    UPDATE pagamentos_gorjeta 
    SET 
      fornecedor_id = fornecedor_rh_id,
      valor_total_final = valor_pago,
      saldo_restante = CASE 
        WHEN status_pagamento = 'pago' THEN 0 
        ELSE valor_pago 
      END
    WHERE id = NEW.id;

    -- Check if conta_pagar already exists
    SELECT id INTO conta_existente_id
    FROM contas_pagar 
    WHERE origem_rh_tipo = 'gorjeta_semanal'
      AND origem_rh_id = NEW.colaborador_id
      AND origem_rh_semana = NEW.semana
      AND origem_rh_ano = NEW.ano;

    IF conta_existente_id IS NOT NULL THEN
      -- Update existing conta_pagar
      UPDATE contas_pagar 
      SET 
        fornecedor_id = fornecedor_rh_id,
        descricao = 'Gorjeta Semanal - ' || COALESCE(colaborador_nome, 'Colaborador') || ' - Semana ' || NEW.semana || '/' || NEW.ano,
        categoria_id = categoria_rh_id,
        centro_custo_id = centro_custo_rh_id,
        forma_pagamento_id = forma_pagamento_id,
        valor_total = NEW.valor_pago,
        valor_pago = CASE WHEN NEW.status_pagamento = 'pago' THEN NEW.valor_pago ELSE 0 END,
        saldo_restante = CASE WHEN NEW.status_pagamento = 'pago' THEN 0 ELSE NEW.valor_pago END,
        data_vencimento = NEW.data_pagamento + INTERVAL '7 days',
        numero_documento = 'GORJ-' || NEW.semana || '-' || NEW.ano || '-' || SUBSTRING(COALESCE(colaborador_nome, 'COL'), 1, 10),
        status = CASE 
          WHEN NEW.status_pagamento = 'pago' THEN 'pago'
          ELSE 'em_aberto'
        END,
        observacoes = 'Gorjeta semanal gerada automaticamente pelo sistema de RH' || 
                     CASE WHEN NEW.observacoes IS NOT NULL THEN E'\n\nObservações: ' || NEW.observacoes ELSE '' END,
        origem_rh_tipo = 'gorjeta_semanal',
        origem_rh_id = NEW.colaborador_id,
        origem_rh_semana = NEW.semana,
        origem_rh_ano = NEW.ano,
        atualizado_em = now()
      WHERE id = conta_existente_id;
    ELSE
      -- Insert new conta_pagar
      INSERT INTO contas_pagar (
        fornecedor_id,
        descricao,
        categoria_id,
        centro_custo_id,
        forma_pagamento_id,
        valor_total,
        valor_pago,
        saldo_restante,
        data_emissao,
        data_vencimento,
        numero_documento,
        status,
        observacoes,
        origem_rh_tipo,
        origem_rh_id,
        origem_rh_semana,
        origem_rh_ano,
        tipo_pagamento
      ) VALUES (
        fornecedor_rh_id,
        'Gorjeta Semanal - ' || COALESCE(colaborador_nome, 'Colaborador') || ' - Semana ' || NEW.semana || '/' || NEW.ano,
        categoria_rh_id,
        centro_custo_rh_id,
        forma_pagamento_id,
        NEW.valor_pago,
        CASE WHEN NEW.status_pagamento = 'pago' THEN NEW.valor_pago ELSE 0 END,
        CASE WHEN NEW.status_pagamento = 'pago' THEN 0 ELSE NEW.valor_pago END,
        NEW.data_pagamento,
        NEW.data_pagamento + INTERVAL '7 days',
        'GORJ-' || NEW.semana || '-' || NEW.ano || '-' || SUBSTRING(COALESCE(colaborador_nome, 'COL'), 1, 10),
        CASE 
          WHEN NEW.status_pagamento = 'pago' THEN 'pago'
          ELSE 'em_aberto'
        END,
        'Gorjeta semanal gerada automaticamente pelo sistema de RH' || 
        CASE WHEN NEW.observacoes IS NOT NULL THEN E'\n\nObservações: ' || NEW.observacoes ELSE '' END,
        'gorjeta_semanal',
        NEW.colaborador_id,
        NEW.semana,
        NEW.ano,
        'unica'
      );
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Remove conta_pagar when gorjeta is deleted
    DELETE FROM contas_pagar 
    WHERE origem_rh_tipo = 'gorjeta_semanal'
      AND origem_rh_id = OLD.colaborador_id
      AND origem_rh_semana = OLD.semana
      AND origem_rh_ano = OLD.ano;

    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for pagamentos_gorjeta
DROP TRIGGER IF EXISTS trg_sincronizar_gorjeta_conta_pagar ON pagamentos_gorjeta;
CREATE TRIGGER trg_sincronizar_gorjeta_conta_pagar
  AFTER INSERT OR UPDATE OR DELETE ON pagamentos_gorjeta
  FOR EACH ROW
  EXECUTE FUNCTION sincronizar_gorjeta_conta_pagar();

-- Create reverse sync function (from contas_pagar back to gorjetas)
CREATE OR REPLACE FUNCTION sincronizar_conta_gorjeta()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process if this is a gorjeta-related conta_pagar
  IF NEW.origem_rh_tipo = 'gorjeta_semanal' THEN
    -- Update corresponding pagamentos_gorjeta
    UPDATE pagamentos_gorjeta 
    SET 
      valor_pago = NEW.valor_pago,
      saldo_restante = NEW.saldo_restante,
      status_pagamento = CASE 
        WHEN NEW.status = 'pago' THEN 'pago'
        WHEN NEW.status = 'cancelado' THEN 'cancelado'
        ELSE 'pendente'
      END
    WHERE colaborador_id = NEW.origem_rh_id
      AND semana = NEW.origem_rh_semana
      AND ano = NEW.origem_rh_ano;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create reverse sync trigger
DROP TRIGGER IF EXISTS trg_sincronizar_conta_gorjeta ON contas_pagar;
CREATE TRIGGER trg_sincronizar_conta_gorjeta
  AFTER UPDATE ON contas_pagar
  FOR EACH ROW
  WHEN (NEW.origem_rh_tipo = 'gorjeta_semanal')
  EXECUTE FUNCTION sincronizar_conta_gorjeta();

-- Update existing pagamentos_gorjeta to have proper values
UPDATE pagamentos_gorjeta 
SET 
  valor_total_final = valor_pago,
  saldo_restante = CASE 
    WHEN status_pagamento = 'pago' THEN 0 
    ELSE valor_pago 
  END
WHERE valor_total_final IS NULL OR valor_total_final = 0;

-- Ensure fornecedor exists
INSERT INTO fornecedores (nome, status, observacoes)
SELECT 'RH - Pagamentos de Funcionários', 'ativo', 'Fornecedor automático para pagamentos de RH'
WHERE NOT EXISTS (
  SELECT 1 FROM fornecedores WHERE nome = 'RH - Pagamentos de Funcionários'
);

-- Update pagamentos_gorjeta with fornecedor_id
UPDATE pagamentos_gorjeta 
SET fornecedor_id = (
  SELECT id FROM fornecedores WHERE nome = 'RH - Pagamentos de Funcionários' LIMIT 1
)
WHERE fornecedor_id IS NULL;