/*
  # Correção do Fluxo de Aprovação e Baixa de Contas a Pagar

  1. Mudanças
    - Ajustar `api_fin_set_status_item` para mudar status para 'aprovado' ao invés de dar baixa automática
    - Ajustar `api_fin_fechar_agenda` para mudar status das contas para 'autorizado_pagamento'
    - Adicionar nova RPC `api_fin_dar_baixa_conta` para gerente financeiro dar baixa com escolha de conta bancária
    - Adicionar campo `conta_bancaria_id` na tabela `agenda_pagamento_itens`
    
  2. Fluxo Corrigido
    - Diretor aprova na agenda do dia -> Status: 'aprovado'
    - Ao fechar o dia -> Contas passam para 'autorizado_pagamento' (não 'pago')
    - Gerente financeiro dá baixa manual escolhendo conta bancária -> Status: 'pago'

  3. Security
    - Grants para as novas funções
*/

-- Adicionar campo conta_bancaria_id na tabela agenda_pagamento_itens
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'agenda_pagamento_itens' AND column_name = 'conta_bancaria_id'
  ) THEN
    ALTER TABLE agenda_pagamento_itens ADD COLUMN conta_bancaria_id uuid REFERENCES bancos_contas(id);
  END IF;
END $$;

-- Adicionar novo status 'autorizado_pagamento' nas contas_pagar
DO $$
BEGIN
  -- Dropar constraint existente
  ALTER TABLE contas_pagar DROP CONSTRAINT IF EXISTS contas_pagar_status_check;
  
  -- Recriar constraint com novo status
  ALTER TABLE contas_pagar 
  ADD CONSTRAINT contas_pagar_status_check 
  CHECK (status IN ('em_aberto', 'parcialmente_pago', 'pago', 'vencido', 'cancelado', 'autorizado_pagamento'));
END $$;

-- Atualizar função api_fin_set_status_item para apenas aprovar (não dar baixa)
CREATE OR REPLACE FUNCTION api_fin_set_status_item(
  p_item_id uuid,
  p_novo_status text,
  p_usuario uuid DEFAULT NULL
)
RETURNS void
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Validar status
  IF p_novo_status NOT IN ('aprovado', 'reprovado', 'cancelado') THEN
    RAISE EXCEPTION 'Status inválido: %', p_novo_status;
  END IF;
  
  -- Atualizar item (apenas status de aprovação, não dá baixa)
  UPDATE agenda_pagamento_itens
  SET 
    status = p_novo_status,
    aprovado_por = CASE WHEN p_novo_status = 'aprovado' THEN p_usuario ELSE aprovado_por END,
    aprovado_em = CASE WHEN p_novo_status = 'aprovado' THEN now() ELSE aprovado_em END,
    atualizado_em = now()
  WHERE id = p_item_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item não encontrado: %', p_item_id;
  END IF;
END;
$$;

-- Atualizar função api_fin_set_status_item_parcial para apenas aprovar (não dar baixa)
CREATE OR REPLACE FUNCTION api_fin_set_status_item_parcial(
  p_item_id uuid, 
  p_novo_status text, 
  p_valor_aprovado numeric DEFAULT NULL,
  p_usuario uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Atualizar item (apenas status de aprovação, não dá baixa)
  UPDATE agenda_pagamento_itens 
  SET 
    status = p_novo_status,
    valor_aprovado = COALESCE(p_valor_aprovado, valor_original),
    valor = COALESCE(p_valor_aprovado, valor_original),
    aprovado_por = CASE WHEN p_novo_status = 'aprovado' THEN p_usuario ELSE aprovado_por END,
    aprovado_em = CASE WHEN p_novo_status = 'aprovado' THEN now() ELSE aprovado_em END,
    atualizado_em = now()
  WHERE id = p_item_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item da agenda não encontrado: %', p_item_id;
  END IF;
END;
$$;

-- Atualizar api_fin_fechar_agenda para mudar status para 'autorizado_pagamento'
CREATE OR REPLACE FUNCTION api_fin_fechar_agenda(
  p_agenda_id uuid, 
  p_usuario uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  rec_item RECORD;
BEGIN
  -- Verificar se agenda existe e está aberta
  IF NOT EXISTS (
    SELECT 1 FROM agenda_pagamentos 
    WHERE id = p_agenda_id AND status = 'aberta'
  ) THEN
    RAISE EXCEPTION 'Agenda não encontrada ou já está fechada';
  END IF;

  -- Processar itens aprovados
  FOR rec_item IN 
    SELECT * FROM agenda_pagamento_itens 
    WHERE agenda_id = p_agenda_id AND status = 'aprovado'
  LOOP
    -- Se é item do AP, marcar como autorizado para pagamento (não dar baixa ainda)
    IF rec_item.origem = 'ap' AND rec_item.conta_pagar_id IS NOT NULL THEN
      UPDATE contas_pagar
      SET 
        status = 'autorizado_pagamento',
        aprovado_para_pagamento = true,
        aprovado_por = p_usuario,
        data_aprovacao = now(),
        atualizado_em = now()
      WHERE id = rec_item.conta_pagar_id;
    END IF;
    
    -- Marcar item como executado
    UPDATE agenda_pagamento_itens 
    SET 
      status = 'executado',
      executado_por = p_usuario,
      executado_em = now(),
      atualizado_em = now()
    WHERE id = rec_item.id;
  END LOOP;

  -- Fechar agenda
  UPDATE agenda_pagamentos 
  SET 
    status = 'fechada',
    fechado_por = p_usuario,
    fechado_em = now()
  WHERE id = p_agenda_id;
END;
$$;

-- Nova função para gerente financeiro dar baixa em conta a pagar
CREATE OR REPLACE FUNCTION api_fin_dar_baixa_conta(
  p_conta_pagar_id uuid,
  p_valor_pagamento numeric,
  p_data_pagamento date,
  p_forma_pagamento_id uuid,
  p_conta_bancaria_id uuid,
  p_numero_comprovante text DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_usuario uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pagamento_id uuid;
  v_saldo_restante numeric;
BEGIN
  -- Verificar se conta existe
  IF NOT EXISTS (SELECT 1 FROM contas_pagar WHERE id = p_conta_pagar_id) THEN
    RAISE EXCEPTION 'Conta a pagar não encontrada';
  END IF;
  
  -- Buscar saldo restante
  SELECT saldo_restante INTO v_saldo_restante 
  FROM contas_pagar 
  WHERE id = p_conta_pagar_id;
  
  -- Validar valor do pagamento
  IF p_valor_pagamento <= 0 THEN
    RAISE EXCEPTION 'Valor de pagamento deve ser maior que zero';
  END IF;
  
  IF p_valor_pagamento > v_saldo_restante THEN
    RAISE EXCEPTION 'Valor de pagamento (%) maior que saldo restante (%)', p_valor_pagamento, v_saldo_restante;
  END IF;
  
  -- Registrar pagamento
  INSERT INTO pagamentos_contas (
    conta_pagar_id,
    valor_pagamento,
    data_pagamento,
    forma_pagamento_id,
    conta_bancaria_id,
    numero_comprovante,
    observacoes,
    criado_por
  ) VALUES (
    p_conta_pagar_id,
    p_valor_pagamento,
    p_data_pagamento,
    p_forma_pagamento_id,
    p_conta_bancaria_id,
    p_numero_comprovante,
    p_observacoes,
    p_usuario
  )
  RETURNING id INTO v_pagamento_id;
  
  -- O trigger atualizar_status_conta_pagar() irá atualizar o status automaticamente
  
  RETURN v_pagamento_id;
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION api_fin_set_status_item(uuid, text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api_fin_set_status_item_parcial(uuid, text, numeric, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api_fin_fechar_agenda(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api_fin_dar_baixa_conta(uuid, numeric, date, uuid, uuid, text, text, uuid) TO anon, authenticated, service_role;
