/*
  # Corrigir Conflito de Funções de Atualização de Status

  ## Problema
  Existem dois triggers com funções diferentes mas mesmo nome:
  1. trigger_atualizar_status_conta_pagar (BEFORE na contas_pagar) - deve verificar campos da própria conta
  2. trg_pagamentos_contas_status (AFTER na pagamentos_contas) - deve atualizar a conta baseado nos pagamentos

  ## Solução
  1. Renomear a função BEFORE para validar_status_conta_pagar
  2. Restaurar a função AFTER com o nome correto atualizar_status_conta_pagar
  3. Recriar os triggers corretamente

  ## Segurança
  - Apenas correção de lógica de triggers
  - Não afeta permissões
*/

-- 1. Criar nova função para validar status ANTES de salvar (BEFORE trigger na contas_pagar)
CREATE OR REPLACE FUNCTION validar_status_conta_pagar()
RETURNS TRIGGER AS $$
BEGIN
  -- Se foi paga integralmente, marcar como pago
  IF NEW.data_baixa_integral IS NOT NULL 
     OR (NEW.saldo_restante IS NOT NULL AND NEW.saldo_restante <= 0)
     OR (NEW.valor_pago >= NEW.valor_total AND NEW.valor_pago > 0) THEN
    NEW.status = 'pago';
  
  -- Se foi paga parcialmente, marcar como parcialmente_pago
  ELSIF NEW.valor_pago > 0 AND NEW.valor_pago < NEW.valor_total THEN
    NEW.status = 'parcialmente_pago';
  
  -- Caso contrário, manter como em_aberto
  ELSE
    NEW.status = 'em_aberto';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Recriar função correta para atualizar status DEPOIS de pagamentos (AFTER trigger na pagamentos_contas)
CREATE OR REPLACE FUNCTION atualizar_status_conta_pagar()
RETURNS TRIGGER AS $$
DECLARE
  total_pago numeric;
  valor_total numeric;
  nova_status text;
  data_venc date;
  data_primeiro_pagamento timestamptz;
BEGIN
  -- Get the account details
  SELECT cp.valor_total, cp.data_vencimento 
  INTO valor_total, data_venc
  FROM contas_pagar cp 
  WHERE cp.id = COALESCE(NEW.conta_pagar_id, OLD.conta_pagar_id);
  
  -- Calculate total paid
  SELECT COALESCE(SUM(valor_pagamento), 0) 
  INTO total_pago
  FROM pagamentos_contas 
  WHERE conta_pagar_id = COALESCE(NEW.conta_pagar_id, OLD.conta_pagar_id);
  
  -- Get date of first payment
  SELECT MIN(criado_em)
  INTO data_primeiro_pagamento
  FROM pagamentos_contas
  WHERE conta_pagar_id = COALESCE(NEW.conta_pagar_id, OLD.conta_pagar_id);
  
  -- Determine new status
  IF total_pago = 0 THEN
    nova_status := 'em_aberto';
  ELSIF total_pago >= valor_total THEN
    nova_status := 'pago';
  ELSE
    nova_status := 'parcialmente_pago';
  END IF;
  
  -- Update the account with new status and dates
  UPDATE contas_pagar 
  SET 
    valor_pago = total_pago,
    status = nova_status,
    data_primeira_baixa = data_primeiro_pagamento,
    data_baixa_integral = CASE 
      WHEN nova_status = 'pago' AND data_baixa_integral IS NULL THEN now()
      WHEN nova_status = 'pago' THEN data_baixa_integral
      ELSE NULL
    END,
    saldo_restante = valor_total - total_pago,
    atualizado_em = now()
  WHERE id = COALESCE(NEW.conta_pagar_id, OLD.conta_pagar_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- 3. Atualizar o trigger BEFORE na tabela contas_pagar para usar a nova função
DROP TRIGGER IF EXISTS trigger_atualizar_status_conta_pagar ON contas_pagar;
CREATE TRIGGER trigger_atualizar_status_conta_pagar
  BEFORE INSERT OR UPDATE ON contas_pagar
  FOR EACH ROW EXECUTE FUNCTION validar_status_conta_pagar();

-- 4. Garantir que o trigger AFTER na tabela pagamentos_contas está correto
DROP TRIGGER IF EXISTS trg_pagamentos_contas_status ON pagamentos_contas;
CREATE TRIGGER trg_pagamentos_contas_status
  AFTER INSERT OR UPDATE OR DELETE ON pagamentos_contas
  FOR EACH ROW EXECUTE FUNCTION atualizar_status_conta_pagar();

COMMENT ON FUNCTION validar_status_conta_pagar() IS 'Valida e corrige o status da conta baseado nos campos valor_pago, saldo_restante e data_baixa_integral (trigger BEFORE na contas_pagar)';
COMMENT ON FUNCTION atualizar_status_conta_pagar() IS 'Atualiza o status da conta baseado nos pagamentos registrados (trigger AFTER na pagamentos_contas)';
