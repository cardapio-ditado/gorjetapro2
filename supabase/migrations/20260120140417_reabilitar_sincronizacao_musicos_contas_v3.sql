/*
  # Reabilitar Sincronização Automática de Músicos com Contas a Pagar
  
  ## Objetivo
  Quando os valores de um músico (valor base, consumo ou adicional) forem alterados,
  o sistema deve automaticamente:
  1. Recalcular o valor_total_final do músico
  2. Atualizar a conta a pagar correspondente com o novo valor
  
  ## Alterações
  1. Trigger para calcular automaticamente o valor_total_final
  2. Trigger para sincronizar alterações com contas a pagar
  3. Mantém a integridade entre músicos e contas a pagar
  
  ## Observações
  - Apenas contas vinculadas (origem_modulo = 'musicos') são atualizadas
  - O saldo_restante é calculado automaticamente (coluna gerada)
  - A sincronização evita loops infinitos comparando OLD e NEW
*/

-- Função para calcular e atualizar o valor total final do músico
CREATE OR REPLACE FUNCTION calcular_valor_total_musico()
RETURNS TRIGGER AS $$
BEGIN
    -- Calcular valor total final = valor base + consumo + adicional
    NEW.valor_total_final := COALESCE(NEW.valor, 0) + 
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

-- Função para sincronizar músico com conta a pagar (APENAS MÚSICO -> CONTA)
CREATE OR REPLACE FUNCTION sincronizar_musico_para_conta_pagar()
RETURNS TRIGGER AS $$
DECLARE
    v_conta_id uuid;
    v_fornecedor_id uuid;
    v_valor_pago_conta numeric;
BEGIN
    -- Buscar a conta a pagar vinculada a este músico
    SELECT id, fornecedor_id, valor_pago 
    INTO v_conta_id, v_fornecedor_id, v_valor_pago_conta
    FROM contas_pagar
    WHERE origem_modulo = 'musicos' 
      AND origem_id = NEW.id;
    
    -- Se existe conta vinculada, atualizar
    IF v_conta_id IS NOT NULL THEN
        -- Atualizar valor total da conta (saldo_restante é calculado automaticamente)
        UPDATE contas_pagar
        SET 
            valor_total = NEW.valor_total_final,
            valor_original = NEW.valor_total_final,
            valor_final = NEW.valor_total_final,
            descricao = 'Pagamento Músico: ' || COALESCE(NEW.nome, 'Sem nome') || ' - ' || 
                       COALESCE(NEW.data_evento::text, 'Sem data'),
            data_vencimento = COALESCE(NEW.data_evento::date, CURRENT_DATE),
            status = CASE 
                WHEN (NEW.valor_total_final - COALESCE(v_valor_pago_conta, 0)) <= 0 AND NEW.valor_total_final > 0 THEN 'pago'
                WHEN NEW.status_pagamento = 'cancelado' THEN 'cancelado'
                ELSE 'em_aberto'
            END,
            atualizado_em = now()
        WHERE id = v_conta_id;
        
    -- Se não existe e há fornecedor_id, criar nova conta
    ELSIF NEW.fornecedor_id IS NOT NULL AND NEW.valor_total_final > 0 THEN
        INSERT INTO contas_pagar (
            fornecedor_id,
            descricao,
            categoria_id,
            valor_total,
            valor_original,
            valor_final,
            valor_pago,
            data_vencimento,
            data_emissao,
            status,
            tipo_pagamento,
            origem_modulo,
            origem_id
        ) VALUES (
            NEW.fornecedor_id,
            'Pagamento Músico: ' || COALESCE(NEW.nome, 'Sem nome') || ' - ' || 
            COALESCE(NEW.data_evento::text, 'Sem data'),
            (SELECT id FROM categorias_financeiras WHERE nome = 'Músicos e Artistas' LIMIT 1),
            NEW.valor_total_final,
            NEW.valor_total_final,
            NEW.valor_total_final,
            0,
            COALESCE(NEW.data_evento::date, CURRENT_DATE),
            CURRENT_DATE,
            CASE 
                WHEN NEW.status_pagamento = 'cancelado' THEN 'cancelado'
                ELSE 'em_aberto'
            END,
            'unica',
            'musicos',
            NEW.id
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Função para sincronizar conta a pagar de volta para músico (APENAS PAGAMENTOS)
-- Esta função SOMENTE atualiza quando há pagamentos, não atualiza valores
CREATE OR REPLACE FUNCTION sincronizar_pagamento_conta_para_musico()
RETURNS TRIGGER AS $$
DECLARE
    v_valor_pago_old numeric;
    v_status_old text;
BEGIN
    -- Verificar se é uma conta de músico
    IF NEW.origem_modulo = 'musicos' AND NEW.origem_id IS NOT NULL THEN
        -- Pegar valores antigos para comparação
        v_valor_pago_old := COALESCE(OLD.valor_pago, 0);
        v_status_old := OLD.status;
        
        -- Só atualizar músico se houve mudança em valor_pago ou status
        -- Isso evita loop infinito
        IF v_valor_pago_old != COALESCE(NEW.valor_pago, 0) OR v_status_old != NEW.status THEN
            -- Atualizar apenas campos de pagamento do músico
            UPDATE musicos
            SET 
                valor_pago = COALESCE(NEW.valor_pago, 0),
                saldo_restante = NEW.saldo_restante,
                status_pagamento = CASE 
                    WHEN NEW.status = 'pago' THEN 'pago'
                    WHEN NEW.status = 'cancelado' THEN 'cancelado'
                    ELSE 'pendente'
                END
            WHERE id = NEW.origem_id
              -- Só atualizar se os valores realmente mudaram
              AND (
                  COALESCE(valor_pago, 0) != COALESCE(NEW.valor_pago, 0) OR
                  status_pagamento != CASE 
                      WHEN NEW.status = 'pago' THEN 'pago'
                      WHEN NEW.status = 'cancelado' THEN 'cancelado'
                      ELSE 'pendente'
                  END
              );
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop triggers antigos se existirem
DROP TRIGGER IF EXISTS trg_calcular_valor_total_musico ON musicos;
DROP TRIGGER IF EXISTS trg_sincronizar_musico_conta ON musicos;
DROP TRIGGER IF EXISTS trg_sincronizar_conta_musico ON contas_pagar;
DROP TRIGGER IF EXISTS trg_sincronizar_pagamento_conta_musico ON contas_pagar;

-- Criar trigger para calcular valor total (BEFORE para modificar o NEW)
CREATE TRIGGER trg_calcular_valor_total_musico
    BEFORE INSERT OR UPDATE OF valor, valor_consumo, valor_adicional
    ON musicos
    FOR EACH ROW
    EXECUTE FUNCTION calcular_valor_total_musico();

-- Criar trigger para sincronizar músico -> conta a pagar (AFTER porque precisa do ID)
CREATE TRIGGER trg_sincronizar_musico_conta
    AFTER INSERT OR UPDATE OF valor_total_final, fornecedor_id, nome, data_evento, status_pagamento
    ON musicos
    FOR EACH ROW
    EXECUTE FUNCTION sincronizar_musico_para_conta_pagar();

-- Criar trigger para sincronizar APENAS PAGAMENTOS de conta a pagar -> músico
CREATE TRIGGER trg_sincronizar_pagamento_conta_musico
    AFTER UPDATE OF valor_pago, status
    ON contas_pagar
    FOR EACH ROW
    EXECUTE FUNCTION sincronizar_pagamento_conta_para_musico();

-- Atualizar valores existentes para garantir consistência
UPDATE musicos 
SET 
    valor_total_final = COALESCE(valor, 0) + COALESCE(valor_consumo, 0) + COALESCE(valor_adicional, 0),
    saldo_restante = (COALESCE(valor, 0) + COALESCE(valor_consumo, 0) + COALESCE(valor_adicional, 0)) - COALESCE(valor_pago, 0)
WHERE valor_total_final IS NULL 
   OR valor_total_final != (COALESCE(valor, 0) + COALESCE(valor_consumo, 0) + COALESCE(valor_adicional, 0));
