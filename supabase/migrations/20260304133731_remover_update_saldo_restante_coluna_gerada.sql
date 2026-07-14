/*
  # Remover Update de Coluna Gerada

  ## Problema
  A coluna saldo_restante é GENERATED ALWAYS AS STORED e não pode ser atualizada manualmente

  ## Solução
  Remover a linha que tenta atualizar saldo_restante - ela é calculada automaticamente

  ## Segurança
  - Apenas correção de lógica da função
  - Não afeta permissões
*/

CREATE OR REPLACE FUNCTION atualizar_status_conta_pagar()
RETURNS TRIGGER AS $$
DECLARE
  v_total_pago numeric;
  v_valor_total numeric;
  v_nova_status text;
  v_data_venc date;
  v_data_primeiro_pagamento timestamptz;
BEGIN
  -- Get the account details
  SELECT cp.valor_total, cp.data_vencimento 
  INTO v_valor_total, v_data_venc
  FROM contas_pagar cp 
  WHERE cp.id = COALESCE(NEW.conta_pagar_id, OLD.conta_pagar_id);
  
  -- Calculate total paid
  SELECT COALESCE(SUM(valor_pagamento), 0) 
  INTO v_total_pago
  FROM pagamentos_contas 
  WHERE conta_pagar_id = COALESCE(NEW.conta_pagar_id, OLD.conta_pagar_id);
  
  -- Get date of first payment
  SELECT MIN(criado_em)
  INTO v_data_primeiro_pagamento
  FROM pagamentos_contas
  WHERE conta_pagar_id = COALESCE(NEW.conta_pagar_id, OLD.conta_pagar_id);
  
  -- Determine new status
  IF v_total_pago = 0 THEN
    v_nova_status := 'em_aberto';
  ELSIF v_total_pago >= v_valor_total THEN
    v_nova_status := 'pago';
  ELSE
    v_nova_status := 'parcialmente_pago';
  END IF;
  
  -- Update the account with new status and dates
  -- Note: saldo_restante is a GENERATED column and will update automatically
  UPDATE contas_pagar 
  SET 
    valor_pago = v_total_pago,
    status = v_nova_status,
    data_primeira_baixa = v_data_primeiro_pagamento,
    data_baixa_integral = CASE 
      WHEN v_nova_status = 'pago' AND data_baixa_integral IS NULL THEN now()
      WHEN v_nova_status = 'pago' THEN data_baixa_integral
      ELSE NULL
    END,
    atualizado_em = now()
  WHERE id = COALESCE(NEW.conta_pagar_id, OLD.conta_pagar_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION atualizar_status_conta_pagar() IS 'Atualiza o status da conta baseado nos pagamentos registrados (trigger AFTER na pagamentos_contas)';
