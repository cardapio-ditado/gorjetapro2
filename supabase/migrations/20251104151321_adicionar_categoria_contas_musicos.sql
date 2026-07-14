/*
  # Adicionar categoria às contas de músicos
  
  1. Problema
    - Contas a pagar de músicos são criadas sem categoria_id
    - Lançamentos no fluxo_caixa também ficam sem categoria
    - Por isso não aparecem no DRE
  
  2. Solução
    - Atualizar contas existentes de músicos com categoria "Cachê de Músicos"
    - Atualizar lançamentos no fluxo_caixa dessas contas
    - Criar trigger para garantir que novas contas de músicos recebam categoria automaticamente
  
  3. Resultado
    - Todos os pagamentos de músicos aparecerão no DRE
    - Hierarquia correta: Artistas e Eventos > Cachê de Músicos
*/

-- Buscar ID da categoria Cachê de Músicos
DO $$
DECLARE
  v_categoria_cache_musicos uuid;
BEGIN
  -- Buscar categoria
  SELECT id INTO v_categoria_cache_musicos
  FROM categorias_financeiras
  WHERE nome = 'Cachê de Músicos' AND tipo = 'despesa'
  LIMIT 1;
  
  -- Se não existir, não fazer nada (já existe conforme verificado)
  IF v_categoria_cache_musicos IS NULL THEN
    RAISE NOTICE 'Categoria Cachê de Músicos não encontrada';
    RETURN;
  END IF;
  
  -- Atualizar contas a pagar de músicos que não têm categoria
  UPDATE contas_pagar
  SET 
    categoria_id = v_categoria_cache_musicos,
    atualizado_em = now()
  WHERE origem_modulo = 'musicos'
    AND categoria_id IS NULL;
  
  RAISE NOTICE 'Contas de músicos atualizadas: %', (
    SELECT COUNT(*)
    FROM contas_pagar
    WHERE origem_modulo = 'musicos' AND categoria_id = v_categoria_cache_musicos
  );
  
  -- Atualizar lançamentos no fluxo_caixa relacionados a pagamentos de músicos
  UPDATE fluxo_caixa fc
  SET 
    categoria_id = v_categoria_cache_musicos
  FROM pagamentos_contas pc
  INNER JOIN contas_pagar cp ON pc.conta_pagar_id = cp.id
  WHERE fc.pagamento_id = pc.id
    AND cp.origem_modulo = 'musicos'
    AND fc.categoria_id IS NULL;
  
  RAISE NOTICE 'Lançamentos no fluxo_caixa atualizados: %', (
    SELECT COUNT(*)
    FROM fluxo_caixa fc
    INNER JOIN pagamentos_contas pc ON fc.pagamento_id = pc.id
    INNER JOIN contas_pagar cp ON pc.conta_pagar_id = cp.id
    WHERE cp.origem_modulo = 'musicos' AND fc.categoria_id = v_categoria_cache_musicos
  );
END $$;

-- Criar trigger para garantir que novas contas de músicos recebam categoria automaticamente
CREATE OR REPLACE FUNCTION atribuir_categoria_conta_musico()
RETURNS TRIGGER AS $$
DECLARE
  v_categoria_cache uuid;
BEGIN
  -- Se já tem categoria, não fazer nada
  IF NEW.categoria_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  -- Se é conta de músico, atribuir categoria
  IF NEW.origem_modulo = 'musicos' THEN
    SELECT id INTO v_categoria_cache
    FROM categorias_financeiras
    WHERE nome = 'Cachê de Músicos' AND tipo = 'despesa'
    LIMIT 1;
    
    IF v_categoria_cache IS NOT NULL THEN
      NEW.categoria_id := v_categoria_cache;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger
DROP TRIGGER IF EXISTS trg_atribuir_categoria_musico ON contas_pagar;
CREATE TRIGGER trg_atribuir_categoria_musico
  BEFORE INSERT OR UPDATE ON contas_pagar
  FOR EACH ROW
  EXECUTE FUNCTION atribuir_categoria_conta_musico();

-- Atualizar também a função que cria lançamento no fluxo_caixa
-- para garantir que use a categoria da conta
CREATE OR REPLACE FUNCTION criar_fluxo_caixa_baixa_conta_pagar()
RETURNS TRIGGER AS $$
DECLARE
  v_conta_pagar RECORD;
  v_descricao TEXT;
  v_categoria_id uuid;
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
