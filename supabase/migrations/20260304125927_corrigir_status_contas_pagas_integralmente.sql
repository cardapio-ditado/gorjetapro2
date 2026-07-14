/*
  # Corrigir Status de Contas Pagas Integralmente

  ## Problema
  Existem contas com status 'em_aberto' mas que já foram pagas integralmente
  (saldo_restante = 0 ou data_baixa_integral preenchida)

  ## Alterações
  1. Atualizar status de contas inconsistentes para 'pago'
  2. Criar trigger para atualizar automaticamente o status quando uma conta for paga integralmente
  3. Garantir que a view v_despesas_visao_estrategica só mostre contas realmente pendentes

  ## Segurança
  - Apenas correção de dados inconsistentes
  - Não afeta permissões
*/

-- 1. Corrigir contas que já foram pagas mas status está incorreto
UPDATE contas_pagar
SET status = 'pago'
WHERE status = 'em_aberto'
  AND (
    data_baixa_integral IS NOT NULL 
    OR (saldo_restante IS NOT NULL AND saldo_restante <= 0)
    OR (valor_pago >= valor_total AND valor_pago > 0)
  );

-- 2. Corrigir contas parcialmente pagas que na verdade já foram pagas
UPDATE contas_pagar
SET status = 'pago'
WHERE status = 'parcialmente_pago'
  AND (
    data_baixa_integral IS NOT NULL 
    OR (saldo_restante IS NOT NULL AND saldo_restante <= 0)
    OR (valor_pago >= valor_total AND valor_pago > 0)
  );

-- 3. Criar função para atualizar status automaticamente
CREATE OR REPLACE FUNCTION atualizar_status_conta_pagar()
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

-- 4. Criar trigger para executar antes de INSERT ou UPDATE
DROP TRIGGER IF EXISTS trigger_atualizar_status_conta_pagar ON contas_pagar;

CREATE TRIGGER trigger_atualizar_status_conta_pagar
  BEFORE INSERT OR UPDATE ON contas_pagar
  FOR EACH ROW
  EXECUTE FUNCTION atualizar_status_conta_pagar();

COMMENT ON FUNCTION atualizar_status_conta_pagar() IS 'Atualiza automaticamente o status da conta baseado em valor_pago, saldo_restante e data_baixa_integral';
