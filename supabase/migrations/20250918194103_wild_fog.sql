/*
  # Auto-sync gorjetas to contas a pagar

  1. New Functions
    - `sincronizar_gorjeta_conta_pagar()` - Syncs gorjeta data to contas_pagar
    - `sincronizar_conta_gorjeta()` - Syncs contas_pagar changes back to gorjeta
    - `remover_conta_gorjeta()` - Removes conta_pagar when gorjeta is deleted

  2. Triggers
    - Auto-create/update conta_pagar when gorjeta is saved
    - Auto-update gorjeta when conta_pagar status changes
    - Auto-remove conta_pagar when gorjeta is deleted

  3. Fornecedor Management
    - Auto-create "RH - Pagamentos de Funcionários" supplier if not exists
    - Link all gorjeta payments to this supplier
*/

-- Função para sincronizar gorjeta para conta a pagar
CREATE OR REPLACE FUNCTION sincronizar_gorjeta_conta_pagar()
RETURNS TRIGGER AS $$
DECLARE
    v_fornecedor_id uuid;
    v_conta_id uuid;
    v_colaborador_nome text;
    v_descricao text;
    v_numero_documento text;
    v_data_vencimento date;
BEGIN
    -- Buscar ou criar fornecedor para RH
    SELECT id INTO v_fornecedor_id
    FROM fornecedores 
    WHERE nome = 'RH - Pagamentos de Funcionários'
    LIMIT 1;
    
    IF v_fornecedor_id IS NULL THEN
        INSERT INTO fornecedores (nome, status, observacoes)
        VALUES ('RH - Pagamentos de Funcionários', 'ativo', 'Fornecedor automático para pagamentos de RH')
        RETURNING id INTO v_fornecedor_id;
    END IF;

    -- Buscar nome do colaborador
    SELECT nome_completo INTO v_colaborador_nome
    FROM colaboradores 
    WHERE id = NEW.colaborador_id;
    
    IF v_colaborador_nome IS NULL THEN
        v_colaborador_nome := 'Colaborador não encontrado';
    END IF;

    -- Montar descrição e documento
    v_descricao := 'Gorjeta Semanal - ' || v_colaborador_nome || ' - Semana ' || NEW.semana || '/' || NEW.ano;
    v_numero_documento := 'GORJ-' || NEW.semana || '-' || NEW.ano || '-' || SUBSTRING(NEW.colaborador_id::text, 1, 8);
    
    -- Data de vencimento: próxima sexta-feira
    v_data_vencimento := CURRENT_DATE + (6 - EXTRACT(DOW FROM CURRENT_DATE))::integer;
    IF v_data_vencimento <= CURRENT_DATE THEN
        v_data_vencimento := v_data_vencimento + 7;
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- Criar nova conta a pagar
        INSERT INTO contas_pagar (
            fornecedor_id,
            descricao,
            valor_total,
            valor_pago,
            saldo_restante,
            data_emissao,
            data_vencimento,
            numero_documento,
            status,
            origem_rh_tipo,
            origem_rh_id,
            origem_rh_semana,
            origem_rh_ano,
            observacoes
        ) VALUES (
            v_fornecedor_id,
            v_descricao,
            NEW.valor_pago,
            0,
            NEW.valor_pago,
            CURRENT_DATE,
            v_data_vencimento,
            v_numero_documento,
            CASE 
                WHEN NEW.status_pagamento = 'pago' THEN 'pago'
                WHEN NEW.status_pagamento = 'cancelado' THEN 'cancelado'
                ELSE 'em_aberto'
            END,
            'gorjeta_semanal',
            NEW.id,
            NEW.semana,
            NEW.ano,
            'Conta gerada automaticamente pelo sistema de gorjetas'
        ) RETURNING id INTO v_conta_id;

        -- Atualizar gorjeta com ID do fornecedor
        UPDATE pagamentos_gorjeta 
        SET 
            fornecedor_id = v_fornecedor_id,
            valor_total_final = NEW.valor_pago,
            saldo_restante = CASE 
                WHEN NEW.status_pagamento = 'pago' THEN 0
                ELSE NEW.valor_pago
            END
        WHERE id = NEW.id;

    ELSIF TG_OP = 'UPDATE' THEN
        -- Atualizar conta a pagar existente
        UPDATE contas_pagar 
        SET 
            descricao = v_descricao,
            valor_total = NEW.valor_pago,
            saldo_restante = CASE 
                WHEN NEW.status_pagamento = 'pago' THEN 0
                ELSE NEW.valor_pago - COALESCE(valor_pago, 0)
            END,
            status = CASE 
                WHEN NEW.status_pagamento = 'pago' THEN 'pago'
                WHEN NEW.status_pagamento = 'cancelado' THEN 'cancelado'
                ELSE 'em_aberto'
            END,
            numero_documento = v_numero_documento,
            data_vencimento = v_data_vencimento
        WHERE origem_rh_tipo = 'gorjeta_semanal' 
          AND origem_rh_id = NEW.id;

        -- Atualizar campos da gorjeta
        UPDATE pagamentos_gorjeta 
        SET 
            fornecedor_id = v_fornecedor_id,
            valor_total_final = NEW.valor_pago,
            saldo_restante = CASE 
                WHEN NEW.status_pagamento = 'pago' THEN 0
                ELSE NEW.valor_pago
            END
        WHERE id = NEW.id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Função para sincronizar conta a pagar de volta para gorjeta
CREATE OR REPLACE FUNCTION sincronizar_conta_gorjeta()
RETURNS TRIGGER AS $$
BEGIN
    -- Só sincronizar se for conta de gorjeta
    IF NEW.origem_rh_tipo = 'gorjeta_semanal' AND NEW.origem_rh_id IS NOT NULL THEN
        UPDATE pagamentos_gorjeta 
        SET 
            status_pagamento = CASE 
                WHEN NEW.status = 'pago' THEN 'pago'
                WHEN NEW.status = 'cancelado' THEN 'cancelado'
                ELSE 'pendente'
            END,
            valor_total_final = NEW.valor_total,
            saldo_restante = NEW.saldo_restante
        WHERE id = NEW.origem_rh_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Função para remover conta a pagar quando gorjeta é excluída
CREATE OR REPLACE FUNCTION remover_conta_gorjeta()
RETURNS TRIGGER AS $$
BEGIN
    -- Remover conta a pagar correspondente
    DELETE FROM contas_pagar 
    WHERE origem_rh_tipo = 'gorjeta_semanal' 
      AND origem_rh_id = OLD.id;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Criar triggers
DROP TRIGGER IF EXISTS trg_sincronizar_gorjeta_conta_pagar ON pagamentos_gorjeta;
CREATE TRIGGER trg_sincronizar_gorjeta_conta_pagar
    AFTER INSERT OR UPDATE ON pagamentos_gorjeta
    FOR EACH ROW
    EXECUTE FUNCTION sincronizar_gorjeta_conta_pagar();

DROP TRIGGER IF EXISTS trg_sincronizar_conta_gorjeta ON contas_pagar;
CREATE TRIGGER trg_sincronizar_conta_gorjeta
    AFTER UPDATE ON contas_pagar
    FOR EACH ROW
    WHEN (NEW.origem_rh_tipo = 'gorjeta_semanal')
    EXECUTE FUNCTION sincronizar_conta_gorjeta();

DROP TRIGGER IF EXISTS trg_remover_conta_gorjeta ON pagamentos_gorjeta;
CREATE TRIGGER trg_remover_conta_gorjeta
    BEFORE DELETE ON pagamentos_gorjeta
    FOR EACH ROW
    EXECUTE FUNCTION remover_conta_gorjeta();

-- Sincronizar gorjetas existentes (executar uma vez)
DO $$
DECLARE
    v_fornecedor_id uuid;
    v_gorjeta RECORD;
    v_colaborador_nome text;
    v_descricao text;
    v_numero_documento text;
    v_data_vencimento date;
BEGIN
    -- Buscar ou criar fornecedor para RH
    SELECT id INTO v_fornecedor_id
    FROM fornecedores 
    WHERE nome = 'RH - Pagamentos de Funcionários'
    LIMIT 1;
    
    IF v_fornecedor_id IS NULL THEN
        INSERT INTO fornecedores (nome, status, observacoes)
        VALUES ('RH - Pagamentos de Funcionários', 'ativo', 'Fornecedor automático para pagamentos de RH')
        RETURNING id INTO v_fornecedor_id;
    END IF;

    -- Sincronizar todas as gorjetas existentes que não têm conta a pagar
    FOR v_gorjeta IN 
        SELECT pg.* 
        FROM pagamentos_gorjeta pg
        LEFT JOIN contas_pagar cp ON (cp.origem_rh_tipo = 'gorjeta_semanal' AND cp.origem_rh_id = pg.id)
        WHERE cp.id IS NULL
    LOOP
        -- Buscar nome do colaborador
        SELECT nome_completo INTO v_colaborador_nome
        FROM colaboradores 
        WHERE id = v_gorjeta.colaborador_id;
        
        IF v_colaborador_nome IS NULL THEN
            v_colaborador_nome := 'Colaborador não encontrado';
        END IF;

        -- Montar descrição e documento
        v_descricao := 'Gorjeta Semanal - ' || v_colaborador_nome || ' - Semana ' || v_gorjeta.semana || '/' || v_gorjeta.ano;
        v_numero_documento := 'GORJ-' || v_gorjeta.semana || '-' || v_gorjeta.ano || '-' || SUBSTRING(v_gorjeta.colaborador_id::text, 1, 8);
        
        -- Data de vencimento baseada na data de pagamento ou próxima sexta
        IF v_gorjeta.data_pagamento IS NOT NULL THEN
            v_data_vencimento := v_gorjeta.data_pagamento;
        ELSE
            v_data_vencimento := CURRENT_DATE + (6 - EXTRACT(DOW FROM CURRENT_DATE))::integer;
            IF v_data_vencimento <= CURRENT_DATE THEN
                v_data_vencimento := v_data_vencimento + 7;
            END IF;
        END IF;

        -- Criar conta a pagar
        INSERT INTO contas_pagar (
            fornecedor_id,
            descricao,
            valor_total,
            valor_pago,
            saldo_restante,
            data_emissao,
            data_vencimento,
            numero_documento,
            status,
            origem_rh_tipo,
            origem_rh_id,
            origem_rh_semana,
            origem_rh_ano,
            observacoes
        ) VALUES (
            v_fornecedor_id,
            v_descricao,
            v_gorjeta.valor_pago,
            CASE WHEN v_gorjeta.status_pagamento = 'pago' THEN v_gorjeta.valor_pago ELSE 0 END,
            CASE WHEN v_gorjeta.status_pagamento = 'pago' THEN 0 ELSE v_gorjeta.valor_pago END,
            COALESCE(v_gorjeta.data_pagamento, CURRENT_DATE),
            v_data_vencimento,
            v_numero_documento,
            CASE 
                WHEN v_gorjeta.status_pagamento = 'pago' THEN 'pago'
                WHEN v_gorjeta.status_pagamento = 'cancelado' THEN 'cancelado'
                ELSE 'em_aberto'
            END,
            'gorjeta_semanal',
            v_gorjeta.id,
            v_gorjeta.semana,
            v_gorjeta.ano,
            'Conta gerada automaticamente pelo sistema de gorjetas'
        );

        -- Atualizar gorjeta com fornecedor
        UPDATE pagamentos_gorjeta 
        SET 
            fornecedor_id = v_fornecedor_id,
            valor_total_final = v_gorjeta.valor_pago,
            saldo_restante = CASE 
                WHEN v_gorjeta.status_pagamento = 'pago' THEN 0
                ELSE v_gorjeta.valor_pago
            END
        WHERE id = v_gorjeta.id;
    END LOOP;

    RAISE NOTICE 'Sincronização de gorjetas concluída com sucesso!';
END;
$$;