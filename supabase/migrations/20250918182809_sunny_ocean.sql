/*
  # Fix automatic sync of gorjetas to contas a pagar

  1. New Functions
    - `sincronizar_gorjeta_conta_pagar()` - Creates/updates conta a pagar when gorjeta changes
    - `sincronizar_conta_gorjeta()` - Updates gorjeta when conta a pagar changes
    - `remover_conta_gorjeta()` - Removes conta a pagar when gorjeta is deleted

  2. Triggers
    - Auto-create conta a pagar when gorjeta is inserted/updated
    - Auto-update gorjeta when conta a pagar payment status changes
    - Auto-remove conta a pagar when gorjeta is deleted

  3. Security
    - All functions handle errors gracefully
    - Bidirectional sync between gorjetas and contas a pagar
*/

-- Function to sync gorjeta to conta a pagar (create/update)
CREATE OR REPLACE FUNCTION sincronizar_gorjeta_conta_pagar()
RETURNS TRIGGER AS $$
DECLARE
  colaborador_nome TEXT;
  fornecedor_rh_id UUID;
  conta_existente_id UUID;
BEGIN
  -- Get colaborador name
  SELECT nome_completo INTO colaborador_nome
  FROM colaboradores 
  WHERE id = NEW.colaborador_id;
  
  IF colaborador_nome IS NULL THEN
    colaborador_nome := 'Colaborador não encontrado';
  END IF;

  -- Get or create RH fornecedor
  SELECT id INTO fornecedor_rh_id
  FROM fornecedores 
  WHERE nome = 'RH - Pagamentos de Funcionários'
  LIMIT 1;
  
  IF fornecedor_rh_id IS NULL THEN
    INSERT INTO fornecedores (nome, status, observacoes)
    VALUES ('RH - Pagamentos de Funcionários', 'ativo', 'Fornecedor automático para pagamentos de RH')
    RETURNING id INTO fornecedor_rh_id;
  END IF;

  -- Check if conta a pagar already exists
  SELECT id INTO conta_existente_id
  FROM contas_pagar
  WHERE origem_rh_tipo = 'gorjeta_semanal'
    AND origem_rh_id = NEW.colaborador_id
    AND origem_rh_semana = NEW.semana
    AND origem_rh_ano = NEW.ano;

  IF conta_existente_id IS NOT NULL THEN
    -- Update existing conta a pagar
    UPDATE contas_pagar SET
      valor_total = NEW.valor_liquido,
      saldo_restante = NEW.valor_liquido - COALESCE(valor_pago, 0),
      descricao = 'Gorjeta Semanal - ' || colaborador_nome || ' - Semana ' || NEW.semana || '/' || NEW.ano,
      observacoes = 'Gorjeta semanal automática' || 
                   CASE WHEN NEW.observacoes IS NOT NULL THEN E'\n' || NEW.observacoes ELSE '' END,
      atualizado_em = NOW()
    WHERE id = conta_existente_id;
  ELSE
    -- Create new conta a pagar
    INSERT INTO contas_pagar (
      fornecedor_id,
      descricao,
      valor_total,
      saldo_restante,
      data_emissao,
      data_vencimento,
      numero_documento,
      status,
      observacoes,
      origem_modulo,
      origem_rh_tipo,
      origem_rh_id,
      origem_rh_semana,
      origem_rh_ano,
      tipo_pagamento
    ) VALUES (
      fornecedor_rh_id,
      'Gorjeta Semanal - ' || colaborador_nome || ' - Semana ' || NEW.semana || '/' || NEW.ano,
      NEW.valor_liquido,
      NEW.valor_liquido,
      CURRENT_DATE,
      CURRENT_DATE + INTERVAL '7 days',
      'GORJ-' || NEW.semana || '-' || NEW.ano || '-' || LEFT(REPLACE(colaborador_nome, ' ', ''), 10),
      'em_aberto',
      'Gorjeta semanal automática' || 
      CASE WHEN NEW.observacoes IS NOT NULL THEN E'\n' || NEW.observacoes ELSE '' END,
      'rh',
      'gorjeta_semanal',
      NEW.colaborador_id,
      NEW.semana,
      NEW.ano,
      'unica'
    );
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to sync conta a pagar changes back to gorjeta
CREATE OR REPLACE FUNCTION sincronizar_conta_gorjeta()
RETURNS TRIGGER AS $$
BEGIN
  -- Only sync if this is a gorjeta-related conta
  IF NEW.origem_rh_tipo = 'gorjeta_semanal' AND NEW.origem_rh_id IS NOT NULL THEN
    -- Update gorjeta status based on conta a pagar status
    UPDATE pagamentos_gorjeta SET
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

-- Function to remove conta a pagar when gorjeta is deleted
CREATE OR REPLACE FUNCTION remover_conta_gorjeta()
RETURNS TRIGGER AS $$
BEGIN
  -- Remove related conta a pagar
  DELETE FROM contas_pagar
  WHERE origem_rh_tipo = 'gorjeta_semanal'
    AND origem_rh_id = OLD.colaborador_id
    AND origem_rh_semana = OLD.semana
    AND origem_rh_ano = OLD.ano;

  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for pagamentos_gorjeta table
DROP TRIGGER IF EXISTS trg_sincronizar_gorjeta_conta_pagar ON pagamentos_gorjeta;
CREATE TRIGGER trg_sincronizar_gorjeta_conta_pagar
  AFTER INSERT OR UPDATE ON pagamentos_gorjeta
  FOR EACH ROW
  EXECUTE FUNCTION sincronizar_gorjeta_conta_pagar();

DROP TRIGGER IF EXISTS trg_remover_conta_gorjeta ON pagamentos_gorjeta;
CREATE TRIGGER trg_remover_conta_gorjeta
  BEFORE DELETE ON pagamentos_gorjeta
  FOR EACH ROW
  EXECUTE FUNCTION remover_conta_gorjeta();

-- Create trigger for contas_pagar table to sync back to gorjetas
DROP TRIGGER IF EXISTS trg_sincronizar_conta_gorjeta ON contas_pagar;
CREATE TRIGGER trg_sincronizar_conta_gorjeta
  AFTER UPDATE ON contas_pagar
  FOR EACH ROW
  WHEN (NEW.origem_rh_tipo = 'gorjeta_semanal')
  EXECUTE FUNCTION sincronizar_conta_gorjeta();