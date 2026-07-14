/*
  # Corrigir função api_fin_incluir_adhoc - remover saldo_restante

  ## Problema
  
  A função api_fin_incluir_adhoc está tentando inserir valor em saldo_restante,
  mas esta é uma coluna GENERATED que deve ser calculada automaticamente.
  
  ## Solução
  
  Remover saldo_restante do INSERT em contas_pagar.
*/

CREATE OR REPLACE FUNCTION api_fin_incluir_adhoc(
  p_agenda_id uuid,
  p_fornecedor text,
  p_descricao text,
  p_valor numeric,
  p_vencimento date,
  p_observacao text DEFAULT NULL,
  p_fornecedor_id uuid DEFAULT NULL
)
RETURNS uuid
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_item_id uuid;
  v_conta_pagar_id uuid;
BEGIN
  -- Se fornecedor_id foi fornecido, criar conta a pagar vinculada
  IF p_fornecedor_id IS NOT NULL THEN
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
      observacoes,
      tipo_pagamento
    )
    VALUES (
      p_fornecedor_id,
      p_descricao,
      p_valor,
      p_valor,
      p_valor,
      0,
      CURRENT_DATE,
      p_vencimento,
      'em_aberto',
      'Criado via agenda ad-hoc: ' || COALESCE(p_observacao, ''),
      'unica'
    )
    RETURNING id INTO v_conta_pagar_id;
  END IF;

  -- Inserir item na agenda
  INSERT INTO agenda_pagamento_itens (
    agenda_id,
    origem,
    conta_pagar_id,
    fornecedor,
    descricao,
    valor,
    vencimento,
    status,
    observacao
  )
  VALUES (
    p_agenda_id,
    'ad-hoc',
    v_conta_pagar_id,
    p_fornecedor,
    p_descricao,
    p_valor,
    p_vencimento,
    'proposto',
    p_observacao
  )
  RETURNING id INTO v_item_id;

  RETURN v_item_id;
END;
$$;
