/*
  # Reabilitar Sincronização de Gorjetas com Contas a Pagar

  Esta migração reabilita a sincronização automática entre o sistema de gorjetas
  e o sistema de contas a pagar, usando a mesma lógica dos músicos.

  1. Funções de Sincronização
     - Função para sincronizar pagamentos de gorjeta com contas a pagar
     - Função para sincronizar contas a pagar com pagamentos de gorjeta
     - Função para remover contas de gorjeta quando necessário

  2. Triggers
     - Trigger para criar/atualizar conta a pagar quando gorjeta for registrada
     - Trigger para sincronizar quando conta a pagar for atualizada
     - Trigger para remover conta quando gorjeta for excluída

  3. Campos Adicionais
     - Adicionar campos necessários para vinculação
*/

-- Função para sincronizar pagamento de gorjeta com contas a pagar
CREATE OR REPLACE FUNCTION sincronizar_gorjeta_conta_pagar()
RETURNS TRIGGER AS $$
DECLARE
    v_fornecedor_id uuid;
    v_conta_id uuid;
    v_descricao text;
    v_data_vencimento date;
BEGIN
    -- Se o pagamento foi removido, não fazer nada (será tratado pelo trigger de DELETE)
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;

    -- Buscar ou criar fornecedor para o colaborador
    SELECT id INTO v_fornecedor_id
    FROM fornecedores 
    WHERE nome = (
        SELECT nome_completo 
        FROM colaboradores 
        WHERE id = NEW.colaborador_id
    );

    -- Se não existe fornecedor, criar um
    IF v_fornecedor_id IS NULL THEN
        INSERT INTO fornecedores (nome, status, observacoes)
        SELECT 
            nome_completo,
            'ativo',
            'Fornecedor criado automaticamente para pagamento de gorjeta'
        FROM colaboradores 
        WHERE id = NEW.colaborador_id
        RETURNING id INTO v_fornecedor_id;
    END IF;

    -- Definir descrição e data de vencimento
    v_descricao := 'Pagamento de Gorjeta - Semana ' || NEW.semana || '/' || NEW.ano || ' - ' || 
                   (SELECT nome_completo FROM colaboradores WHERE id = NEW.colaborador_id);
    
    -- Data de vencimento: segunda-feira da semana seguinte
    v_data_vencimento := (
        date_trunc('week', make_date(NEW.ano, 1, 4)) + 
        (NEW.semana - 1) * interval '1 week' + 
        interval '7 days'
    )::date;

    -- Verificar se já existe conta a pagar para esta gorjeta
    SELECT id INTO v_conta_id
    FROM contas_pagar
    WHERE origem_modulo = 'rh'
      AND origem_rh_tipo = 'gorjeta_semanal'
      AND origem_rh_id = NEW.colaborador_id
      AND origem_rh_semana = NEW.semana
      AND origem_rh_ano = NEW.ano;

    IF v_conta_id IS NOT NULL THEN
        -- Atualizar conta existente
        UPDATE contas_pagar
        SET 
            valor_total = NEW.valor_total_final,
            saldo_restante = NEW.valor_total_final - COALESCE(valor_pago, 0),
            data_vencimento = v_data_vencimento,
            descricao = v_descricao,
            atualizado_em = now()
        WHERE id = v_conta_id;
    ELSE
        -- Criar nova conta a pagar
        INSERT INTO contas_pagar (
            fornecedor_id,
            descricao,
            valor_total,
            valor_pago,
            saldo_restante,
            data_vencimento,
            data_emissao,
            status,
            tipo_pagamento,
            origem_modulo,
            origem_rh_tipo,
            origem_rh_id,
            origem_rh_semana,
            origem_rh_ano
        ) VALUES (
            v_fornecedor_id,
            v_descricao,
            NEW.valor_total_final,
            0,
            NEW.valor_total_final,
            v_data_vencimento,
            CURRENT_DATE,
            'em_aberto',
            'unica',
            'rh',
            'gorjeta_semanal',
            NEW.colaborador_id,
            NEW.semana,
            NEW.ano
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Função para sincronizar conta a pagar com pagamento de gorjeta
CREATE OR REPLACE FUNCTION sincronizar_conta_gorjeta()
RETURNS TRIGGER AS $$
BEGIN
    -- Verificar se é uma conta de gorjeta
    IF NEW.origem_rh_tipo = 'gorjeta_semanal' AND NEW.origem_rh_id IS NOT NULL THEN
        -- Atualizar o pagamento de gorjeta correspondente
        UPDATE pagamentos_gorjeta
        SET 
            valor_total_final = NEW.valor_total,
            saldo_restante = NEW.saldo_restante,
            status_pagamento = CASE 
                WHEN NEW.status = 'pago' THEN 'pago'
                WHEN NEW.status = 'cancelado' THEN 'cancelado'
                ELSE 'pendente'
            END,
            atualizado_em = now()
        WHERE colaborador_id = NEW.origem_rh_id
          AND semana = NEW.origem_rh_semana
          AND ano = NEW.origem_rh_ano;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Função para remover conta de gorjeta
CREATE OR REPLACE FUNCTION remover_conta_gorjeta()
RETURNS TRIGGER AS $$
BEGIN
    -- Verificar se é uma conta de gorjeta
    IF OLD.origem_rh_tipo = 'gorjeta_semanal' AND OLD.origem_rh_id IS NOT NULL THEN
        -- Marcar pagamento de gorjeta como cancelado em vez de excluir
        UPDATE pagamentos_gorjeta
        SET 
            status_pagamento = 'cancelado',
            atualizado_em = now()
        WHERE colaborador_id = OLD.origem_rh_id
          AND semana = OLD.origem_rh_semana
          AND ano = OLD.origem_rh_ano;
    END IF;

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Criar triggers para sincronização de gorjetas
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

DROP TRIGGER IF EXISTS trg_remover_conta_gorjeta ON contas_pagar;
CREATE TRIGGER trg_remover_conta_gorjeta
    BEFORE DELETE ON contas_pagar
    FOR EACH ROW
    WHEN (OLD.origem_rh_tipo = 'gorjeta_semanal')
    EXECUTE FUNCTION remover_conta_gorjeta();

-- Comentar as funções como ativas
COMMENT ON FUNCTION sincronizar_gorjeta_conta_pagar() IS 'Sincroniza automaticamente pagamentos de gorjeta com contas a pagar';
COMMENT ON FUNCTION sincronizar_conta_gorjeta() IS 'Sincroniza automaticamente contas a pagar com pagamentos de gorjeta';
COMMENT ON FUNCTION remover_conta_gorjeta() IS 'Remove automaticamente contas de gorjeta quando necessário';