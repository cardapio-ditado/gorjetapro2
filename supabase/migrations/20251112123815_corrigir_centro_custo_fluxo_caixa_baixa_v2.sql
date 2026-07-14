/*
  # Corrigir centro de custo na baixa de contas a pagar
  
  1. Problema
    - Trigger estava criando lançamentos no fluxo_caixa com centro_custo como TEXT (nome)
    - Não estava preenchendo centro_custo_id (UUID)
    - Resultado: lançamentos duplicados com centros de custo incorretos
  
  2. Solução
    - Atualizar trigger para usar centro_custo_id da conta a pagar
    - Manter centro_custo (TEXT) apenas para referência visual
    - Usar centro de custo da conta a pagar, não fallback
  
  3. Segurança
    - Mantém SECURITY DEFINER
    - Não altera RLS
*/

-- Atualizar função que cria lançamento no fluxo_caixa ao dar baixa
CREATE OR REPLACE FUNCTION criar_fluxo_caixa_baixa_conta_pagar()
RETURNS TRIGGER AS $$
DECLARE
  v_conta_pagar RECORD;
  v_descricao TEXT;
  v_categoria_id uuid;
  v_centro_custo_nome TEXT;
BEGIN
  -- Buscar dados da conta a pagar
  SELECT 
    cp.*,
    f.nome as fornecedor_nome,
    cat.nome as categoria_nome,
    cc.nome as centro_custo_nome
  INTO v_conta_pagar
  FROM contas_pagar cp
  LEFT JOIN fornecedores f ON cp.fornecedor_id = f.id
  LEFT JOIN categorias_financeiras cat ON cp.categoria_id = cat.id
  LEFT JOIN centros_custo cc ON cp.centro_custo_id = cc.id
  WHERE cp.id = NEW.conta_pagar_id;
  
  -- Determinar categoria (usar da conta ou padrão de músicos)
  v_categoria_id := v_conta_pagar.categoria_id;
  
  IF v_categoria_id IS NULL AND v_conta_pagar.origem_modulo = 'musicos' THEN
    SELECT id INTO v_categoria_id
    FROM categorias_financeiras
    WHERE nome = 'Cachê de Músicos' AND tipo = 'despesa'
    LIMIT 1;
  END IF;
  
  -- Montar descrição do lançamento
  IF v_conta_pagar.fornecedor_nome IS NOT NULL THEN
    v_descricao := 'Pagamento: ' || v_conta_pagar.descricao || ' - ' || v_conta_pagar.fornecedor_nome;
  ELSE
    v_descricao := 'Pagamento: ' || v_conta_pagar.descricao;
  END IF;
  
  -- Adicionar número do documento se existir
  IF v_conta_pagar.numero_documento IS NOT NULL THEN
    v_descricao := v_descricao || ' (Doc: ' || v_conta_pagar.numero_documento || ')';
  END IF;
  
  -- Criar lançamento no fluxo de caixa
  INSERT INTO fluxo_caixa (
    tipo,
    valor,
    data,
    descricao,
    centro_custo,
    centro_custo_id,
    categoria_id,
    conta_bancaria_id,
    forma_pagamento_id,
    observacoes,
    origem,
    conta_pagar_id,
    pagamento_id,
    criado_por
  ) VALUES (
    'saida',
    NEW.valor_pagamento,
    NEW.data_pagamento,
    v_descricao,
    v_conta_pagar.centro_custo_nome,
    v_conta_pagar.centro_custo_id,
    v_categoria_id,
    NEW.conta_bancaria_id,
    NEW.forma_pagamento_id,
    COALESCE(NEW.observacoes, 'Baixa de conta a pagar'),
    'conta_pagar',
    NEW.conta_pagar_id,
    NEW.id,
    NEW.criado_por
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Limpar lançamentos duplicados no fluxo_caixa
DO $$
DECLARE
  v_pagamento_id uuid;
  v_count int;
  v_keep_id uuid;
BEGIN
  -- Para cada pagamento que tem múltiplos lançamentos
  FOR v_pagamento_id IN 
    SELECT pagamento_id
    FROM fluxo_caixa
    WHERE pagamento_id IS NOT NULL
      AND origem = 'conta_pagar'
    GROUP BY pagamento_id
    HAVING COUNT(*) > 1
  LOOP
    -- Contar quantos tem
    SELECT COUNT(*) INTO v_count
    FROM fluxo_caixa
    WHERE pagamento_id = v_pagamento_id;
    
    RAISE NOTICE 'Pagamento % tem % lançamentos', v_pagamento_id, v_count;
    
    -- Encontrar qual ID manter (o mais recente com centro_custo_id correto)
    SELECT fc.id INTO v_keep_id
    FROM fluxo_caixa fc
    INNER JOIN pagamentos_contas pc ON fc.pagamento_id = pc.id
    INNER JOIN contas_pagar cp ON pc.conta_pagar_id = cp.id
    WHERE fc.pagamento_id = v_pagamento_id
      AND (fc.centro_custo_id = cp.centro_custo_id OR (fc.centro_custo_id IS NULL AND cp.centro_custo_id IS NULL))
    ORDER BY fc.criado_em DESC
    LIMIT 1;
    
    -- Se não encontrou nenhum com centro_custo_id correto, manter o mais recente
    IF v_keep_id IS NULL THEN
      SELECT fc.id INTO v_keep_id
      FROM fluxo_caixa fc
      WHERE fc.pagamento_id = v_pagamento_id
      ORDER BY fc.criado_em DESC
      LIMIT 1;
    END IF;
    
    -- Deletar todos exceto o que vamos manter
    DELETE FROM fluxo_caixa
    WHERE pagamento_id = v_pagamento_id
      AND id != v_keep_id;
    
    RAISE NOTICE 'Mantido lançamento %, deletados % duplicatas', v_keep_id, v_count - 1;
  END LOOP;
  
  RAISE NOTICE 'Limpeza de duplicatas concluída';
END $$;
