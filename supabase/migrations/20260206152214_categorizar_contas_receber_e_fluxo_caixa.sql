/*
  # Categorizar Contas a Receber e Fluxo de Caixa Não Classificados

  ## Problema
  - Contas a receber foram criadas sem categoria_id
  - Quando essas contas são baixadas, geram lançamentos no fluxo_caixa também sem categoria_id
  - Resultado: aparecem como "não categorizados" nos relatórios

  ## Solução
  1. Buscar uma categoria padrão de receita ("Vendas" ou "Receita de Vendas")
  2. Atualizar todas as contas_receber sem categoria para usar essa categoria padrão
  3. Atualizar os lançamentos do fluxo_caixa vinculados a essas contas para ter a mesma categoria
  4. Atualizar lançamentos manuais baseados em descrições comuns

  ## Impacto
  - Remove lançamentos da lista de "não categorizados"
  - Melhora a precisão dos relatórios financeiros
  - Facilita análise de receitas
*/

DO $$
DECLARE
  categoria_receita_id UUID;
  categoria_vendas_id UUID;
  categoria_servicos_id UUID;
  total_contas_atualizadas INT := 0;
  total_fluxo_atualizado INT := 0;
BEGIN
  -- Buscar categorias de receita disponíveis
  SELECT id INTO categoria_vendas_id
  FROM categorias_financeiras
  WHERE tipo = 'receita' 
    AND (nome ILIKE '%venda%' OR nome ILIKE '%receita%')
  LIMIT 1;
  
  SELECT id INTO categoria_servicos_id
  FROM categorias_financeiras
  WHERE tipo = 'receita'
    AND nome ILIKE '%serviço%'
  LIMIT 1;
  
  -- Se não encontrar categorias específicas, pegar qualquer categoria de receita
  IF categoria_vendas_id IS NULL THEN
    SELECT id INTO categoria_vendas_id
    FROM categorias_financeiras
    WHERE tipo = 'receita'
    LIMIT 1;
  END IF;
  
  -- Usar vendas como categoria padrão para receitas
  categoria_receita_id := categoria_vendas_id;
  
  RAISE NOTICE '======================================================';
  RAISE NOTICE 'Iniciando categorização de lançamentos não classificados';
  RAISE NOTICE '======================================================';
  
  IF categoria_receita_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma categoria de receita encontrada no sistema!';
  END IF;
  
  RAISE NOTICE 'Categoria padrão para receitas: %', categoria_receita_id;
  
  -- 1. Atualizar contas_receber sem categoria
  UPDATE contas_receber
  SET categoria_id = categoria_receita_id
  WHERE categoria_id IS NULL;
  
  GET DIAGNOSTICS total_contas_atualizadas = ROW_COUNT;
  RAISE NOTICE '1. Contas a receber atualizadas: %', total_contas_atualizadas;
  
  -- 2. Atualizar fluxo_caixa de entradas vindas de conta_receber
  UPDATE fluxo_caixa fc
  SET categoria_id = cr.categoria_id
  FROM contas_receber cr
  WHERE fc.conta_receber_id = cr.id
    AND fc.tipo = 'entrada'
    AND fc.origem = 'conta_receber'
    AND fc.categoria_id IS NULL;
  
  GET DIAGNOSTICS total_fluxo_atualizado = ROW_COUNT;
  RAISE NOTICE '2. Lançamentos de fluxo_caixa (origem: conta_receber) atualizados: %', total_fluxo_atualizado;
  
  -- 3. Atualizar lançamentos manuais de entrada sem categoria para usar categoria de receitas
  UPDATE fluxo_caixa
  SET categoria_id = categoria_receita_id
  WHERE tipo = 'entrada'
    AND origem = 'manual'
    AND categoria_id IS NULL;
  
  GET DIAGNOSTICS total_fluxo_atualizado = ROW_COUNT;
  RAISE NOTICE '3. Lançamentos manuais de entrada atualizados: %', total_fluxo_atualizado;
  
  -- 4. Para lançamentos de saída manuais, tentar categorizar baseado em descrição
  -- Advogados e serviços profissionais
  UPDATE fluxo_caixa
  SET categoria_id = (
    SELECT id FROM categorias_financeiras 
    WHERE tipo = 'despesa' 
      AND (nome ILIKE '%serviço%' OR nome ILIKE '%terceirizad%')
    LIMIT 1
  )
  WHERE tipo = 'saida'
    AND origem = 'manual'
    AND categoria_id IS NULL
    AND (
      descricao ILIKE '%advogad%' 
      OR descricao ILIKE '%tribut%'
      OR descricao ILIKE '%juridic%'
      OR descricao ILIKE '%contab%'
    );
  
  GET DIAGNOSTICS total_fluxo_atualizado = ROW_COUNT;
  RAISE NOTICE '4. Lançamentos de serviços profissionais atualizados: %', total_fluxo_atualizado;
  
  -- Compras e fornecedores
  UPDATE fluxo_caixa
  SET categoria_id = (
    SELECT id FROM categorias_financeiras 
    WHERE tipo = 'despesa' 
      AND (nome ILIKE '%compra%' OR nome ILIKE '%mercadoria%' OR nome ILIKE '%fornecedor%')
    LIMIT 1
  )
  WHERE tipo = 'saida'
    AND origem = 'manual'
    AND categoria_id IS NULL
    AND (
      descricao ILIKE '%compra%'
      OR descricao ILIKE '%fornecedor%'
    );
  
  GET DIAGNOSTICS total_fluxo_atualizado = ROW_COUNT;
  RAISE NOTICE '5. Lançamentos de compras atualizados: %', total_fluxo_atualizado;
  
  -- Energia e utilidades
  UPDATE fluxo_caixa
  SET categoria_id = (
    SELECT id FROM categorias_financeiras 
    WHERE tipo = 'despesa' 
      AND (nome ILIKE '%energ%' OR nome ILIKE '%utilid%' OR nome ILIKE '%serviço%')
    LIMIT 1
  )
  WHERE tipo = 'saida'
    AND origem = 'manual'
    AND categoria_id IS NULL
    AND (
      descricao ILIKE '%energia%'
      OR descricao ILIKE '%luz%'
      OR descricao ILIKE '%agua%'
    );
  
  GET DIAGNOSTICS total_fluxo_atualizado = ROW_COUNT;
  RAISE NOTICE '6. Lançamentos de energia/utilidades atualizados: %', total_fluxo_atualizado;
  
  -- Empréstimos e ajustes
  UPDATE fluxo_caixa
  SET categoria_id = (
    SELECT id FROM categorias_financeiras 
    WHERE tipo = CASE 
      WHEN fc.tipo = 'entrada' THEN 'receita'
      ELSE 'despesa'
    END
    AND (nome ILIKE '%emprést%' OR nome ILIKE '%financ%' OR nome ILIKE '%ajuste%')
    LIMIT 1
  )
  FROM fluxo_caixa fc
  WHERE fluxo_caixa.id = fc.id
    AND fc.origem = 'manual'
    AND fc.categoria_id IS NULL
    AND (
      fc.descricao ILIKE '%emprést%'
      OR fc.descricao ILIKE '%ajuste%'
      OR fc.descricao ILIKE '%devoluç%'
    );
  
  GET DIAGNOSTICS total_fluxo_atualizado = ROW_COUNT;
  RAISE NOTICE '7. Lançamentos de empréstimos/ajustes atualizados: %', total_fluxo_atualizado;
  
  -- Para lançamentos que ainda ficaram sem categoria, usar categoria padrão
  UPDATE fluxo_caixa
  SET categoria_id = (
    SELECT id FROM categorias_financeiras 
    WHERE tipo = CASE 
      WHEN fluxo_caixa.tipo = 'entrada' THEN 'receita'
      ELSE 'despesa'
    END
    LIMIT 1
  )
  WHERE categoria_id IS NULL
    AND origem != 'transferencia';
  
  GET DIAGNOSTICS total_fluxo_atualizado = ROW_COUNT;
  RAISE NOTICE '8. Lançamentos restantes com categoria padrão: %', total_fluxo_atualizado;
  
  RAISE NOTICE '======================================================';
  RAISE NOTICE 'Categorização concluída com sucesso!';
  RAISE NOTICE '======================================================';
  
END $$;
