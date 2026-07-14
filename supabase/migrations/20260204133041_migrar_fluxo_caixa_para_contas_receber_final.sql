/*
  # Migrar Lançamentos do Fluxo de Caixa para Contas a Receber
  
  ## Objetivo
  Converter todos os lançamentos de entrada do fluxo de caixa em contas a receber,
  dando baixa automática na mesma data do lançamento original.
  
  ## O que faz
  1. Cria contas a receber para cada entrada do fluxo de caixa (exceto transferências)
  2. Marca as contas como recebidas
  3. Vincula o lançamento do fluxo de caixa à conta a receber criada
  
  ## Impacto
  - Permite rastreabilidade completa de todas as receitas
  - Integra histórico do fluxo de caixa com contas a receber
  - Não altera valores, apenas cria vínculo
  - Facilita análise de receitas por cliente
*/

-- Criar contas a receber a partir de lançamentos do fluxo de caixa
DO $$
DECLARE
  lancamento RECORD;
  nova_conta_id UUID;
  cliente_padrao_id UUID;
  total_migrados INTEGER := 0;
BEGIN
  -- Buscar ou criar um cliente padrão para lançamentos sem cliente específico
  SELECT id INTO cliente_padrao_id 
  FROM clientes 
  WHERE nome = 'Cliente Padrão - Migração Fluxo Caixa'
  LIMIT 1;
  
  IF cliente_padrao_id IS NULL THEN
    INSERT INTO clientes (nome, tipo, status, observacoes, recorrente)
    VALUES (
      'Cliente Padrão - Migração Fluxo Caixa',
      'juridico',
      'ativo',
      'Cliente fictício criado para migração automática de lançamentos do fluxo de caixa',
      false
    )
    RETURNING id INTO cliente_padrao_id;
    
    RAISE NOTICE 'Cliente padrão criado: %', cliente_padrao_id;
  END IF;

  -- Para cada entrada no fluxo de caixa que não tem conta a receber vinculada
  FOR lancamento IN 
    SELECT 
      fc.id,
      fc.descricao,
      fc.valor,
      fc.data,
      fc.categoria_id,
      fc.centro_custo_id,
      fc.origem
    FROM fluxo_caixa fc
    WHERE fc.tipo = 'entrada'
      AND COALESCE(fc.origem, '') != 'transferencia'
      AND COALESCE(fc.origem, '') != 'conta_receber'
      AND fc.conta_receber_id IS NULL
    ORDER BY fc.data
  LOOP
    -- Criar conta a receber (saldo_restante é calculado automaticamente)
    INSERT INTO contas_receber (
      cliente_id,
      descricao,
      valor_total,
      valor_recebido,
      data_emissao,
      data_vencimento,
      status,
      categoria_id,
      centro_custo_id,
      observacoes
    )
    VALUES (
      cliente_padrao_id,
      COALESCE(lancamento.descricao, 'Migração automática do fluxo de caixa'),
      lancamento.valor,
      lancamento.valor, -- Marca como totalmente recebido
      lancamento.data,
      lancamento.data,
      'recebido',
      lancamento.categoria_id,
      lancamento.centro_custo_id,
      'Migrado automaticamente do fluxo de caixa em ' || NOW()::date
    )
    RETURNING id INTO nova_conta_id;
    
    -- Atualizar o lançamento do fluxo de caixa
    UPDATE fluxo_caixa
    SET 
      origem = 'conta_receber',
      conta_receber_id = nova_conta_id
    WHERE id = lancamento.id;
    
    total_migrados := total_migrados + 1;
    
    -- Log a cada 100 registros
    IF total_migrados % 100 = 0 THEN
      RAISE NOTICE 'Migrados % registros...', total_migrados;
    END IF;
  END LOOP;
  
  RAISE NOTICE '==============================================';
  RAISE NOTICE 'Migração concluída com sucesso!';
  RAISE NOTICE 'Total de lançamentos migrados: %', total_migrados;
  RAISE NOTICE '==============================================';
  
  -- Mostrar resumo
  RAISE NOTICE 'Resumo da migração:';
  RAISE NOTICE '- Todos os lançamentos de entrada foram convertidos em contas a receber';
  RAISE NOTICE '- As contas foram marcadas como "recebido" na data do lançamento original';
  RAISE NOTICE '- Os lançamentos do fluxo de caixa foram vinculados às contas a receber';
  
END $$;
