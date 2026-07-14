/*
  # Criar lançamento no fluxo de caixa ao baixar conta a pagar
  
  1. Mudanças
    - Adicionar trigger para criar automaticamente um lançamento no fluxo_caixa quando uma conta a pagar é baixada
    - Isso garante que despesas aparecerão no DRE e nos KPIs financeiros
    - Suporta baixas parciais
  
  2. Comportamento
    - Ao inserir um pagamento em pagamentos_contas, cria lançamento de saída no fluxo_caixa
    - Usa a categoria, centro de custo e conta bancária do pagamento
    - Vincula o lançamento à conta a pagar através do campo conta_pagar_id
  
  3. Segurança
    - Mantém RLS existente
    - Não duplica lançamentos existentes
*/

-- Função para criar lançamento no fluxo de caixa ao baixar conta a pagar
CREATE OR REPLACE FUNCTION criar_fluxo_caixa_baixa_conta_pagar()
RETURNS TRIGGER AS $$
DECLARE
  v_conta_pagar RECORD;
  v_descricao TEXT;
BEGIN
  -- Buscar dados da conta a pagar
  SELECT 
    cp.*,
    f.nome as fornecedor_nome,
    cat.nome as categoria_nome
  INTO v_conta_pagar
  FROM contas_pagar cp
  LEFT JOIN fornecedores f ON cp.fornecedor_id = f.id
  LEFT JOIN categorias_financeiras cat ON cp.categoria_id = cat.id
  WHERE cp.id = NEW.conta_pagar_id;
  
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
    COALESCE(
      (SELECT nome FROM centros_custo WHERE id = v_conta_pagar.centro_custo_id),
      'Administração'
    ),
    v_conta_pagar.categoria_id,
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

-- Criar trigger para executar após inserção de pagamento
DROP TRIGGER IF EXISTS trg_criar_fluxo_baixa_conta ON pagamentos_contas;
CREATE TRIGGER trg_criar_fluxo_baixa_conta
  AFTER INSERT ON pagamentos_contas
  FOR EACH ROW
  EXECUTE FUNCTION criar_fluxo_caixa_baixa_conta_pagar();

-- Criar também lançamento para pagamentos existentes que ainda não têm entrada no fluxo
DO $$
DECLARE
  v_pagamento RECORD;
  v_conta_pagar RECORD;
  v_descricao TEXT;
BEGIN
  FOR v_pagamento IN 
    SELECT pc.* 
    FROM pagamentos_contas pc
    WHERE NOT EXISTS (
      SELECT 1 FROM fluxo_caixa fc 
      WHERE fc.pagamento_id = pc.id
    )
  LOOP
    -- Buscar dados da conta a pagar
    SELECT 
      cp.*,
      f.nome as fornecedor_nome,
      cat.nome as categoria_nome
    INTO v_conta_pagar
    FROM contas_pagar cp
    LEFT JOIN fornecedores f ON cp.fornecedor_id = f.id
    LEFT JOIN categorias_financeiras cat ON cp.categoria_id = cat.id
    WHERE cp.id = v_pagamento.conta_pagar_id;
    
    -- Montar descrição
    IF v_conta_pagar.fornecedor_nome IS NOT NULL THEN
      v_descricao := 'Pagamento: ' || v_conta_pagar.descricao || ' - ' || v_conta_pagar.fornecedor_nome;
    ELSE
      v_descricao := 'Pagamento: ' || v_conta_pagar.descricao;
    END IF;
    
    IF v_conta_pagar.numero_documento IS NOT NULL THEN
      v_descricao := v_descricao || ' (Doc: ' || v_conta_pagar.numero_documento || ')';
    END IF;
    
    -- Criar lançamento retroativo
    INSERT INTO fluxo_caixa (
      tipo,
      valor,
      data,
      descricao,
      centro_custo,
      categoria_id,
      conta_bancaria_id,
      forma_pagamento_id,
      observacoes,
      origem,
      conta_pagar_id,
      pagamento_id,
      criado_por,
      criado_em
    ) VALUES (
      'saida',
      v_pagamento.valor_pagamento,
      v_pagamento.data_pagamento,
      v_descricao,
      COALESCE(
        (SELECT nome FROM centros_custo WHERE id = v_conta_pagar.centro_custo_id),
        'Administração'
      ),
      v_conta_pagar.categoria_id,
      v_pagamento.conta_bancaria_id,
      v_pagamento.forma_pagamento_id,
      COALESCE(v_pagamento.observacoes, 'Baixa de conta a pagar (retroativo)'),
      'conta_pagar',
      v_pagamento.conta_pagar_id,
      v_pagamento.id,
      v_pagamento.criado_por,
      v_pagamento.criado_em
    );
  END LOOP;
END $$;
