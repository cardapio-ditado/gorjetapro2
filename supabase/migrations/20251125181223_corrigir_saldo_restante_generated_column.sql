/*
  # Corrigir erro de saldo_restante na função api_fin_set_status_item

  ## Problema
  
  A coluna saldo_restante é GENERATED e não pode receber valores diretamente.
  Deve ser calculada automaticamente como (valor_total - valor_pago).
  
  ## Solução
  
  Remover saldo_restante do INSERT, será calculado automaticamente.
*/

CREATE OR REPLACE FUNCTION api_fin_set_status_item(
  p_item_id uuid,
  p_novo_status text,
  p_usuario uuid DEFAULT NULL
)
RETURNS void
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_item record;
  v_conta_pagar_id uuid;
  v_fornecedor_id uuid;
BEGIN
  -- Validar status
  IF p_novo_status NOT IN ('aprovado', 'reprovado', 'cancelado') THEN
    RAISE EXCEPTION 'Status inválido: %', p_novo_status;
  END IF;
  
  -- Buscar informações do item
  SELECT * INTO v_item
  FROM agenda_pagamento_itens
  WHERE id = p_item_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item não encontrado: %', p_item_id;
  END IF;
  
  -- Se aprovado e é ad-hoc SEM conta vinculada, criar conta a pagar
  IF p_novo_status = 'aprovado' AND v_item.origem = 'ad-hoc' AND v_item.conta_pagar_id IS NULL THEN
    -- Tentar buscar fornecedor pelo nome
    SELECT id INTO v_fornecedor_id
    FROM fornecedores
    WHERE LOWER(nome) = LOWER(v_item.fornecedor)
    LIMIT 1;
    
    -- Se não encontrou fornecedor, criar um genérico
    IF v_fornecedor_id IS NULL THEN
      INSERT INTO fornecedores (nome, status)
      VALUES (v_item.fornecedor, 'ativo')
      RETURNING id INTO v_fornecedor_id;
    END IF;
    
    -- Criar conta a pagar (SEM saldo_restante - será calculado automaticamente)
    INSERT INTO contas_pagar (
      fornecedor_id,
      descricao,
      valor_total,
      valor_original,
      valor_final,
      valor_pago,
      data_emissao,
      data_vencimento,
      status,
      aprovado_para_pagamento,
      aprovado_por,
      data_aprovacao,
      observacoes,
      tipo_pagamento
    )
    VALUES (
      v_fornecedor_id,
      v_item.descricao,
      v_item.valor,
      v_item.valor,
      v_item.valor,
      0,
      CURRENT_DATE,
      v_item.vencimento,
      'autorizado_pagamento',
      true,
      p_usuario,
      now(),
      'Criado automaticamente a partir de item ad-hoc aprovado. ' || COALESCE(v_item.observacao, ''),
      'unica'
    )
    RETURNING id INTO v_conta_pagar_id;
    
    -- Atualizar item da agenda com a conta criada
    UPDATE agenda_pagamento_itens
    SET 
      conta_pagar_id = v_conta_pagar_id,
      status = p_novo_status,
      aprovado_por = p_usuario,
      aprovado_em = now(),
      atualizado_em = now()
    WHERE id = p_item_id;
    
  ELSE
    -- Atualizar item da agenda normalmente
    UPDATE agenda_pagamento_itens
    SET 
      status = p_novo_status,
      aprovado_por = CASE WHEN p_novo_status = 'aprovado' THEN p_usuario ELSE aprovado_por END,
      aprovado_em = CASE WHEN p_novo_status = 'aprovado' THEN now() ELSE aprovado_em END,
      atualizado_em = now()
    WHERE id = p_item_id;
    
    -- Se aprovado e vinculado a uma conta a pagar existente, autorizar pagamento
    IF p_novo_status = 'aprovado' AND v_item.conta_pagar_id IS NOT NULL THEN
      UPDATE contas_pagar
      SET 
        status = 'autorizado_pagamento',
        aprovado_para_pagamento = true,
        aprovado_por = p_usuario,
        data_aprovacao = now(),
        atualizado_em = now()
      WHERE id = v_item.conta_pagar_id;
    END IF;
    
    -- Se reprovado e vinculado a uma conta a pagar, remover autorização
    IF p_novo_status = 'reprovado' AND v_item.conta_pagar_id IS NOT NULL THEN
      UPDATE contas_pagar
      SET 
        status = CASE 
          WHEN valor_pago > 0 THEN 'parcialmente_pago'
          ELSE 'em_aberto'
        END,
        aprovado_para_pagamento = false,
        aprovado_por = NULL,
        data_aprovacao = NULL,
        atualizado_em = now()
      WHERE id = v_item.conta_pagar_id;
    END IF;
  END IF;
END;
$$;
