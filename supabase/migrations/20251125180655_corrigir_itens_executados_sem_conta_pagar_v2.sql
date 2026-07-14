/*
  # Corrigir itens executados sem conta a pagar - v2

  ## Problema
  
  Itens ad-hoc que foram executados não têm conta_pagar_id vinculada.
  saldo_restante é coluna gerada, não deve ser inserida diretamente.
  
  ## Solução
  
  Criar contas a pagar para itens executados que não têm vínculo,
  sem inserir saldo_restante (será calculado automaticamente).
*/

DO $$
DECLARE
  v_item record;
  v_conta_pagar_id uuid;
  v_fornecedor_id uuid;
BEGIN
  FOR v_item IN 
    SELECT * FROM agenda_pagamento_itens
    WHERE origem = 'ad-hoc' 
      AND status IN ('aprovado', 'executado')
      AND conta_pagar_id IS NULL
  LOOP
    -- Buscar ou criar fornecedor
    SELECT id INTO v_fornecedor_id
    FROM fornecedores
    WHERE LOWER(nome) = LOWER(v_item.fornecedor)
    LIMIT 1;
    
    IF v_fornecedor_id IS NULL THEN
      INSERT INTO fornecedores (nome, status)
      VALUES (v_item.fornecedor, 'ativo')
      RETURNING id INTO v_fornecedor_id;
    END IF;
    
    -- Criar conta a pagar com status apropriado (sem saldo_restante)
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
      CASE WHEN v_item.status = 'executado' THEN v_item.valor ELSE 0 END,
      CURRENT_DATE,
      v_item.vencimento,
      CASE 
        WHEN v_item.status = 'executado' THEN 'pago'
        ELSE 'autorizado_pagamento'
      END,
      true,
      v_item.aprovado_por,
      v_item.aprovado_em,
      'Criado automaticamente a partir de item ad-hoc ' || v_item.status || ' (correção histórica). ' || COALESCE(v_item.observacao, ''),
      'unica'
    )
    RETURNING id INTO v_conta_pagar_id;
    
    -- Vincular conta ao item
    UPDATE agenda_pagamento_itens
    SET conta_pagar_id = v_conta_pagar_id
    WHERE id = v_item.id;
    
    RAISE NOTICE 'Conta criada para item %: fornecedor %, valor %, status %', 
      v_item.id, v_item.fornecedor, v_item.valor, v_item.status;
  END LOOP;
END $$;
