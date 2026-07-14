/*
  # Corrigir Fórmula de Cálculo do Valor Total de Músicos
  
  ## Correção
  A fórmula correta é:
  valor_total_final = valor - valor_consumo + valor_adicional
  
  Onde:
  - valor: valor base do músico
  - valor_consumo: valor a ser DESCONTADO (consumo do músico)
  - valor_adicional: valor a ser SOMADO (adicionais/horas extras)
  
  ## Alterações
  - Atualização da função calcular_valor_total_musico() com a fórmula correta
  - Recalcular todos os valores existentes com a fórmula correta
*/

-- Atualizar função com a fórmula correta
CREATE OR REPLACE FUNCTION calcular_valor_total_musico()
RETURNS TRIGGER AS $$
BEGIN
    -- Fórmula correta: valor total final = valor base - consumo + adicional
    NEW.valor_total_final := COALESCE(NEW.valor, 0) - 
                             COALESCE(NEW.valor_consumo, 0) + 
                             COALESCE(NEW.valor_adicional, 0);
    
    -- Recalcular saldo restante = valor total - valor pago
    NEW.saldo_restante := NEW.valor_total_final - COALESCE(NEW.valor_pago, 0);
    
    -- Atualizar status de pagamento baseado no saldo
    IF NEW.saldo_restante <= 0 AND NEW.valor_total_final > 0 THEN
        NEW.status_pagamento := 'pago';
    ELSIF NEW.valor_total_final > 0 THEN
        NEW.status_pagamento := 'pendente';
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Recalcular todos os valores existentes com a fórmula correta
UPDATE musicos 
SET 
    valor_total_final = COALESCE(valor, 0) - COALESCE(valor_consumo, 0) + COALESCE(valor_adicional, 0),
    saldo_restante = (COALESCE(valor, 0) - COALESCE(valor_consumo, 0) + COALESCE(valor_adicional, 0)) - COALESCE(valor_pago, 0)
WHERE TRUE;
