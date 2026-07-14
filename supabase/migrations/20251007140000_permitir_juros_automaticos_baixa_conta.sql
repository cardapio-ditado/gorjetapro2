/*
  # Permitir cálculo automático de juros na baixa de contas

  ## Descrição
  Atualiza a função `api_fin_dar_baixa_conta` para:
  - Aceitar valores de pagamento maiores que o saldo restante
  - Calcular automaticamente os juros por atraso quando o valor pago excede o saldo
  - Atualizar o campo `juros` na tabela `contas_pagar` com o valor calculado

  ## Mudanças
  1. Remove a validação que impede pagamentos maiores que o saldo
  2. Calcula juros automaticamente: juros = valor_pagamento - saldo_restante
  3. Atualiza o registro da conta com o valor de juros calculado
  4. Mantém compatibilidade com pagamentos sem juros

  ## Segurança
  - Mantém SECURITY DEFINER
  - Grants existentes continuam válidos
*/

-- Recriar função api_fin_dar_baixa_conta com suporte a cálculo automático de juros
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
  v_juros_calculados numeric;
  v_valor_pagar numeric;
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

  -- Calcular juros se o valor pago for maior que o saldo restante
  IF p_valor_pagamento > v_saldo_restante THEN
    v_juros_calculados := p_valor_pagamento - v_saldo_restante;
    v_valor_pagar := v_saldo_restante;

    -- Atualizar o campo juros na conta a pagar
    UPDATE contas_pagar
    SET
      juros = COALESCE(juros, 0) + v_juros_calculados,
      valor_final = valor_original + COALESCE(juros, 0) + v_juros_calculados - COALESCE(desconto, 0),
      atualizado_em = now()
    WHERE id = p_conta_pagar_id;
  ELSE
    v_juros_calculados := 0;
    v_valor_pagar := p_valor_pagamento;
  END IF;

  -- Registrar pagamento (sempre registra o valor pago, incluindo juros)
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
    v_valor_pagar,
    p_data_pagamento,
    p_forma_pagamento_id,
    p_conta_bancaria_id,
    CASE
      WHEN v_juros_calculados > 0 THEN
        COALESCE(p_numero_comprovante || ' ', '') || '(Juros: R$ ' || v_juros_calculados::text || ')'
      ELSE
        p_numero_comprovante
    END,
    CASE
      WHEN v_juros_calculados > 0 THEN
        COALESCE(p_observacoes || ' | ', '') || 'Juros por atraso: R$ ' || v_juros_calculados::text
      ELSE
        p_observacoes
    END,
    p_usuario
  )
  RETURNING id INTO v_pagamento_id;

  -- O trigger atualizar_status_conta_pagar() irá atualizar o status automaticamente

  RETURN v_pagamento_id;
END;
$$;

-- Recriar grant para a função
GRANT EXECUTE ON FUNCTION api_fin_dar_baixa_conta(uuid, numeric, date, uuid, uuid, text, text, uuid) TO anon, authenticated, service_role;
