/*
  # Corrigir Dupla Execução de Estorno
  
  ## Problema Identificado
  
  Quando o usuário usa a função estornar_pagamento_parcial():
  1. A função subtrai o valor estornado da conta_pagar
  2. A função deleta o lançamento do fluxo_caixa
  3. O trigger reverter_pagamento_contas_pagar executa ao deletar
  4. O trigger subtrai o valor NOVAMENTE da conta_pagar
  
  Resultado: ESTORNO EM DOBRO!
  
  ## Solução
  
  A função estornar_pagamento_parcial deve:
  1. Registrar o estorno no histórico
  2. Deletar o fluxo de caixa
  3. NÃO atualizar a conta manualmente (deixar o trigger fazer isso)
  
  O trigger deve verificar se o estorno já foi registrado e apenas
  atualizar a conta_pagar se ainda não houver registro de estorno.
*/

-- 1. Recriar função de estorno (SEM atualizar conta manualmente)
CREATE OR REPLACE FUNCTION estornar_pagamento_parcial(
  p_fluxo_caixa_id uuid,
  p_motivo text DEFAULT NULL,
  p_observacoes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fluxo_record record;
  v_conta_pagar_id uuid;
  v_valor_estornado numeric;
  v_estorno_id uuid;
  v_conta_atualizada record;
BEGIN
  -- Buscar informações do lançamento de fluxo de caixa
  SELECT 
    id, 
    valor, 
    conta_pagar_id, 
    tipo,
    origem
  INTO v_fluxo_record
  FROM fluxo_caixa
  WHERE id = p_fluxo_caixa_id;

  -- Validações
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Lançamento de fluxo de caixa não encontrado'
    );
  END IF;

  IF v_fluxo_record.conta_pagar_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Este lançamento não está vinculado a uma conta a pagar'
    );
  END IF;

  IF v_fluxo_record.tipo != 'saida' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Apenas lançamentos de saída podem ser estornados'
    );
  END IF;

  -- Verificar se já foi estornado
  IF EXISTS (
    SELECT 1 FROM historico_estornos_pagamento 
    WHERE fluxo_caixa_id = p_fluxo_caixa_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Este pagamento já foi estornado anteriormente'
    );
  END IF;

  v_conta_pagar_id := v_fluxo_record.conta_pagar_id;
  v_valor_estornado := v_fluxo_record.valor;

  -- Registrar estorno no histórico ANTES de deletar
  INSERT INTO historico_estornos_pagamento (
    fluxo_caixa_id,
    conta_pagar_id,
    valor_estornado,
    motivo,
    estornado_por,
    observacoes
  ) VALUES (
    p_fluxo_caixa_id,
    v_conta_pagar_id,
    v_valor_estornado,
    p_motivo,
    auth.uid(),
    p_observacoes
  )
  RETURNING id INTO v_estorno_id;

  -- Deletar o lançamento do fluxo de caixa
  -- O trigger reverter_pagamento_contas_pagar vai atualizar a conta
  DELETE FROM fluxo_caixa WHERE id = p_fluxo_caixa_id;

  -- Buscar estado atualizado da conta
  SELECT 
    valor_pago, 
    saldo_restante, 
    status 
  INTO v_conta_atualizada
  FROM contas_pagar
  WHERE id = v_conta_pagar_id;

  -- Retornar resultado
  RETURN jsonb_build_object(
    'success', true,
    'estorno_id', v_estorno_id,
    'valor_estornado', v_valor_estornado,
    'conta_pagar_id', v_conta_pagar_id,
    'novo_valor_pago', v_conta_atualizada.valor_pago,
    'novo_saldo_restante', v_conta_atualizada.saldo_restante,
    'novo_status', v_conta_atualizada.status,
    'message', 'Pagamento estornado com sucesso'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- 2. Recriar trigger para evitar duplicação
CREATE OR REPLACE FUNCTION reverter_pagamento_contas_pagar()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_valor_estornado numeric;
  v_ja_estornado boolean;
BEGIN
  -- Apenas processar se for saída e tiver conta_pagar_id
  IF OLD.tipo = 'saida' AND OLD.conta_pagar_id IS NOT NULL THEN
    v_valor_estornado := OLD.valor;

    -- Verificar se já existe um estorno registrado para este fluxo
    SELECT EXISTS (
      SELECT 1 FROM historico_estornos_pagamento 
      WHERE fluxo_caixa_id = OLD.id
    ) INTO v_ja_estornado;

    -- Se ainda não foi registrado no histórico, registrar como exclusão manual
    IF NOT v_ja_estornado THEN
      INSERT INTO historico_estornos_pagamento (
        fluxo_caixa_id,
        conta_pagar_id,
        valor_estornado,
        motivo,
        estornado_por,
        observacoes
      ) VALUES (
        OLD.id,
        OLD.conta_pagar_id,
        v_valor_estornado,
        'Exclusão manual do lançamento de fluxo de caixa',
        COALESCE(auth.uid(), OLD.criado_por),
        'Estorno automático por exclusão do lançamento'
      );
    END IF;

    -- SEMPRE atualizar a conta a pagar para reverter o pagamento
    UPDATE contas_pagar
    SET 
      valor_pago = GREATEST(0, COALESCE(valor_pago, 0) - v_valor_estornado),
      status = CASE
        WHEN (COALESCE(valor_pago, 0) - v_valor_estornado) <= 0 THEN 'em_aberto'
        WHEN (COALESCE(valor_pago, 0) - v_valor_estornado) < valor_total THEN 'parcialmente_pago'
        ELSE 'pago'
      END,
      data_baixa_integral = CASE
        WHEN (COALESCE(valor_pago, 0) - v_valor_estornado) < valor_total THEN NULL
        ELSE data_baixa_integral
      END,
      atualizado_em = now()
    WHERE id = OLD.conta_pagar_id;
  END IF;

  RETURN OLD;
END;
$$;

-- Garantir permissões
GRANT EXECUTE ON FUNCTION estornar_pagamento_parcial TO authenticated;

-- Comentários
COMMENT ON FUNCTION estornar_pagamento_parcial IS 'Estorna pagamento: registra histórico e deleta do fluxo. Trigger atualiza a conta.';
COMMENT ON FUNCTION reverter_pagamento_contas_pagar IS 'Trigger: reverte pagamento ao deletar do fluxo. Evita duplicação verificando histórico.';
