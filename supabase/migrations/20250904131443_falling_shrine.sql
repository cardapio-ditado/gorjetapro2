/*
  # Sincronização de Pagamentos de Músicos

  1. Função para Sincronizar Pagamentos
    - Atualiza automaticamente os valores na tabela `musicos` quando há pagamentos em `contas_pagar`
    - Calcula `valor_pago`, `saldo_restante` e `status_pagamento` baseado nos dados financeiros
    - Mantém consistência entre os módulos

  2. Trigger Automático
    - Executa após inserção, atualização ou exclusão de pagamentos
    - Garante sincronização em tempo real
    - Funciona para todas as contas originadas do módulo de músicos

  3. Segurança
    - Verifica se a conta pertence ao módulo de músicos antes de sincronizar
    - Trata casos onde o músico pode não existir mais
    - Logs de erro para debugging
*/

-- Função para sincronizar pagamentos de músicos
CREATE OR REPLACE FUNCTION sincronizar_pagamentos_musicos()
RETURNS TRIGGER AS $$
DECLARE
    conta_musico RECORD;
    total_pago NUMERIC := 0;
    novo_saldo NUMERIC := 0;
    novo_status TEXT := 'pendente';
BEGIN
    -- Buscar a conta a pagar relacionada
    IF TG_OP = 'DELETE' THEN
        SELECT * INTO conta_musico 
        FROM contas_pagar 
        WHERE id = OLD.conta_pagar_id 
        AND origem_modulo = 'musicos';
    ELSE
        SELECT * INTO conta_musico 
        FROM contas_pagar 
        WHERE id = NEW.conta_pagar_id 
        AND origem_modulo = 'musicos';
    END IF;

    -- Se não é uma conta de músico, não fazer nada
    IF conta_musico IS NULL OR conta_musico.origem_id IS NULL THEN
        RETURN COALESCE(NEW, OLD);
    END IF;

    -- Calcular total pago para esta conta
    SELECT COALESCE(SUM(valor_pagamento), 0) INTO total_pago
    FROM pagamentos_contas
    WHERE conta_pagar_id = conta_musico.id;

    -- Calcular novo saldo
    novo_saldo := conta_musico.valor_total - total_pago;

    -- Determinar novo status
    IF total_pago = 0 THEN
        novo_status := 'pendente';
    ELSIF novo_saldo <= 0 THEN
        novo_status := 'pago';
    ELSE
        novo_status := 'pendente'; -- Parcialmente pago ainda é pendente
    END IF;

    -- Atualizar a tabela musicos
    UPDATE musicos 
    SET 
        valor_pago = total_pago,
        saldo_restante = GREATEST(novo_saldo, 0),
        status_pagamento = novo_status
    WHERE id = conta_musico.origem_id::uuid;

    RETURN COALESCE(NEW, OLD);
EXCEPTION
    WHEN OTHERS THEN
        -- Log do erro (em produção, usar uma tabela de logs)
        RAISE WARNING 'Erro ao sincronizar pagamento de músico: %', SQLERRM;
        RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Trigger para sincronizar após operações em pagamentos_contas
DROP TRIGGER IF EXISTS trg_sincronizar_pagamentos_musicos ON pagamentos_contas;
CREATE TRIGGER trg_sincronizar_pagamentos_musicos
    AFTER INSERT OR UPDATE OR DELETE ON pagamentos_contas
    FOR EACH ROW
    EXECUTE FUNCTION sincronizar_pagamentos_musicos();

-- Função para sincronizar quando uma conta a pagar de músico é atualizada
CREATE OR REPLACE FUNCTION sincronizar_conta_musico()
RETURNS TRIGGER AS $$
BEGIN
    -- Verificar se é uma conta de músico
    IF NEW.origem_modulo = 'musicos' AND NEW.origem_id IS NOT NULL THEN
        -- Atualizar valores na tabela musicos
        UPDATE musicos 
        SET 
            valor_pago = NEW.valor_pago,
            saldo_restante = NEW.saldo_restante,
            status_pagamento = CASE 
                WHEN NEW.saldo_restante <= 0 THEN 'pago'
                WHEN NEW.valor_pago > 0 THEN 'pendente'
                ELSE 'pendente'
            END
        WHERE id = NEW.origem_id::uuid;
    END IF;

    RETURN NEW;
EXCEPTION
    WHEN OTHERS THEN
        RAISE WARNING 'Erro ao sincronizar conta de músico: %', SQLERRM;
        RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para sincronizar quando contas_pagar é atualizada
DROP TRIGGER IF EXISTS trg_sincronizar_conta_musico ON contas_pagar;
CREATE TRIGGER trg_sincronizar_conta_musico
    AFTER UPDATE ON contas_pagar
    FOR EACH ROW
    WHEN (NEW.origem_modulo = 'musicos')
    EXECUTE FUNCTION sincronizar_conta_musico();

-- Sincronizar dados existentes (executar uma vez)
DO $$
DECLARE
    musico_record RECORD;
    conta_record RECORD;
    total_pago NUMERIC;
BEGIN
    -- Para cada músico que tem conta a pagar associada
    FOR musico_record IN 
        SELECT m.id as musico_id, cp.id as conta_id, cp.valor_total, cp.valor_pago, cp.saldo_restante
        FROM musicos m
        INNER JOIN contas_pagar cp ON cp.origem_id::uuid = m.id AND cp.origem_modulo = 'musicos'
    LOOP
        -- Atualizar valores do músico baseado na conta a pagar
        UPDATE musicos 
        SET 
            valor_pago = musico_record.valor_pago,
            saldo_restante = musico_record.saldo_restante,
            status_pagamento = CASE 
                WHEN musico_record.saldo_restante <= 0 THEN 'pago'
                WHEN musico_record.valor_pago > 0 THEN 'pendente'
                ELSE 'pendente'
            END
        WHERE id = musico_record.musico_id;
    END LOOP;
END $$;