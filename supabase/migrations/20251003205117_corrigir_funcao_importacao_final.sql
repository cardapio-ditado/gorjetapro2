/*
  # Corrigir função de importação sem ON CONFLICT

  1. Solução
    - Usar verificação EXISTS antes de inserir
    - Remove dependência de índice único com WHERE clause
*/

-- Recriar a função com verificação manual
CREATE OR REPLACE FUNCTION api_fin_criar_ou_importar_agenda(p_data date)
RETURNS uuid
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_agenda_id uuid;
  v_conta record;
  v_exists boolean;
BEGIN
  -- Criar ou buscar agenda existente
  INSERT INTO agenda_pagamentos (data_base, criado_em)
  VALUES (p_data, now())
  ON CONFLICT (data_base) DO NOTHING
  RETURNING id INTO v_agenda_id;
  
  -- Se não retornou ID, buscar o existente
  IF v_agenda_id IS NULL THEN
    SELECT id INTO v_agenda_id 
    FROM agenda_pagamentos 
    WHERE data_base = p_data;
  END IF;
  
  -- Importar contas a pagar elegíveis
  FOR v_conta IN 
    SELECT 
      cp.id as conta_pagar_id,
      f.nome as fornecedor_nome,
      cp.descricao,
      cp.saldo_restante as valor,
      cp.data_vencimento as vencimento,
      cp.prioridade_sugerida
    FROM contas_pagar cp
    LEFT JOIN fornecedores f ON f.id = cp.fornecedor_id
    WHERE cp.status IN ('em_aberto', 'parcialmente_pago', 'autorizado_pagamento')
      AND cp.saldo_restante > 0
    ORDER BY 
      CASE WHEN cp.data_vencimento < CURRENT_DATE THEN 0 ELSE 1 END,
      CASE 
        WHEN cp.prioridade_sugerida = 'urgente' THEN 0
        WHEN cp.prioridade_sugerida = 'alta' THEN 1
        WHEN cp.prioridade_sugerida = 'media' THEN 2
        WHEN cp.prioridade_sugerida = 'baixa' THEN 3
        ELSE 4
      END,
      cp.data_vencimento ASC
  LOOP
    -- Verificar se já existe este item na agenda
    SELECT EXISTS (
      SELECT 1 FROM agenda_pagamento_itens
      WHERE agenda_id = v_agenda_id
        AND conta_pagar_id = v_conta.conta_pagar_id
    ) INTO v_exists;
    
    -- Inserir apenas se não existe
    IF NOT v_exists THEN
      INSERT INTO agenda_pagamento_itens (
        agenda_id,
        origem,
        conta_pagar_id,
        fornecedor,
        descricao,
        valor,
        vencimento,
        status
      )
      VALUES (
        v_agenda_id,
        'ap',
        v_conta.conta_pagar_id,
        COALESCE(v_conta.fornecedor_nome, 'Fornecedor não identificado'),
        v_conta.descricao,
        v_conta.valor,
        v_conta.vencimento,
        'proposto'
      );
    END IF;
  END LOOP;
  
  RETURN v_agenda_id;
END;
$$;

GRANT EXECUTE ON FUNCTION api_fin_criar_ou_importar_agenda(date) TO anon, authenticated, service_role;
