/*
  # Criar 5 lançamentos de contas a pagar vencidas para testes
  
  1. Contas Vencidas
    - 5 contas com diferentes fornecedores, categorias e valores
    - Todas com status "em_aberto" e vencidas
    - Diferentes níveis de prioridade
    - Algumas com observações da tesouraria
  
  2. Características
    - Diferentes datas de vencimento (de 5 a 60 dias atrás)
    - Valores variados (de R$ 500 a R$ 15.000)
    - Diferentes categorias de despesa
    - Diferentes centros de custo
*/

-- Obter IDs necessários para os lançamentos
DO $$
DECLARE
  fornecedor1_id uuid;
  fornecedor2_id uuid;
  fornecedor3_id uuid;
  fornecedor4_id uuid;
  fornecedor5_id uuid;
  
  categoria1_id uuid;
  categoria2_id uuid;
  categoria3_id uuid;
  categoria4_id uuid;
  categoria5_id uuid;
  
  centro_custo1_id uuid;
  centro_custo2_id uuid;
  centro_custo3_id uuid;
  
  forma_pagamento1_id uuid;
  forma_pagamento2_id uuid;
  forma_pagamento3_id uuid;
BEGIN
  -- Obter IDs de fornecedores (ou criar se não existirem)
  SELECT id INTO fornecedor1_id FROM fornecedores WHERE nome = 'Distribuidora de Bebidas ABC' LIMIT 1;
  SELECT id INTO fornecedor2_id FROM fornecedores WHERE nome = 'Fornecedor de Alimentos XYZ' LIMIT 1;
  SELECT id INTO fornecedor3_id FROM fornecedores WHERE nome = 'Serviços de Limpeza Clean' LIMIT 1;
  SELECT id INTO fornecedor4_id FROM fornecedores WHERE nome = 'Manutenção Predial Rápida' LIMIT 1;
  SELECT id INTO fornecedor5_id FROM fornecedores WHERE nome = 'Gráfica Impressão Total' LIMIT 1;
  
  -- Criar fornecedores se não existirem
  IF fornecedor1_id IS NULL THEN
    INSERT INTO fornecedores (nome, cnpj, telefone, email, status)
    VALUES ('Distribuidora de Bebidas ABC', '12.345.678/0001-01', '(11) 98765-4321', 'contato@bebidasabc.com', 'ativo')
    RETURNING id INTO fornecedor1_id;
  END IF;
  
  IF fornecedor2_id IS NULL THEN
    INSERT INTO fornecedores (nome, cnpj, telefone, email, status)
    VALUES ('Fornecedor de Alimentos XYZ', '23.456.789/0001-02', '(11) 97654-3210', 'vendas@alimentosxyz.com', 'ativo')
    RETURNING id INTO fornecedor2_id;
  END IF;
  
  IF fornecedor3_id IS NULL THEN
    INSERT INTO fornecedores (nome, cnpj, telefone, email, status)
    VALUES ('Serviços de Limpeza Clean', '34.567.890/0001-03', '(11) 96543-2109', 'atendimento@limpezaclean.com', 'ativo')
    RETURNING id INTO fornecedor3_id;
  END IF;
  
  IF fornecedor4_id IS NULL THEN
    INSERT INTO fornecedores (nome, cnpj, telefone, email, status)
    VALUES ('Manutenção Predial Rápida', '45.678.901/0001-04', '(11) 95432-1098', 'servicos@manutencaorapida.com', 'ativo')
    RETURNING id INTO fornecedor4_id;
  END IF;
  
  IF fornecedor5_id IS NULL THEN
    INSERT INTO fornecedores (nome, cnpj, telefone, email, status)
    VALUES ('Gráfica Impressão Total', '56.789.012/0001-05', '(11) 94321-0987', 'vendas@impressaototal.com', 'ativo')
    RETURNING id INTO fornecedor5_id;
  END IF;
  
  -- Obter IDs de categorias (despesas)
  SELECT id INTO categoria1_id FROM categorias_financeiras WHERE nome = 'Fornecedores' AND tipo = 'despesa' LIMIT 1;
  SELECT id INTO categoria2_id FROM categorias_financeiras WHERE nome = 'Energia Elétrica' AND tipo = 'despesa' LIMIT 1;
  SELECT id INTO categoria3_id FROM categorias_financeiras WHERE nome = 'Manutenção' AND tipo = 'despesa' LIMIT 1;
  SELECT id INTO categoria4_id FROM categorias_financeiras WHERE nome = 'Material de Escritório' AND tipo = 'despesa' LIMIT 1;
  SELECT id INTO categoria5_id FROM categorias_financeiras WHERE nome = 'Aluguel' AND tipo = 'despesa' LIMIT 1;
  
  -- Obter categorias genéricas se as específicas não existirem
  IF categoria1_id IS NULL THEN
    SELECT id INTO categoria1_id FROM categorias_financeiras WHERE tipo = 'despesa' LIMIT 1;
  END IF;
  
  IF categoria2_id IS NULL THEN
    SELECT id INTO categoria2_id FROM categorias_financeiras WHERE tipo = 'despesa' LIMIT 1;
  END IF;
  
  IF categoria3_id IS NULL THEN
    SELECT id INTO categoria3_id FROM categorias_financeiras WHERE tipo = 'despesa' LIMIT 1;
  END IF;
  
  IF categoria4_id IS NULL THEN
    SELECT id INTO categoria4_id FROM categorias_financeiras WHERE tipo = 'despesa' LIMIT 1;
  END IF;
  
  IF categoria5_id IS NULL THEN
    SELECT id INTO categoria5_id FROM categorias_financeiras WHERE tipo = 'despesa' LIMIT 1;
  END IF;
  
  -- Obter IDs de centros de custo
  SELECT id INTO centro_custo1_id FROM centros_custo WHERE nome = 'Bar' LIMIT 1;
  SELECT id INTO centro_custo2_id FROM centros_custo WHERE nome = 'Cozinha' LIMIT 1;
  SELECT id INTO centro_custo3_id FROM centros_custo WHERE nome = 'Administrativo' LIMIT 1;
  
  -- Obter centro de custo genérico se os específicos não existirem
  IF centro_custo1_id IS NULL THEN
    SELECT id INTO centro_custo1_id FROM centros_custo LIMIT 1;
  END IF;
  
  IF centro_custo2_id IS NULL THEN
    SELECT id INTO centro_custo2_id FROM centros_custo LIMIT 1;
  END IF;
  
  IF centro_custo3_id IS NULL THEN
    SELECT id INTO centro_custo3_id FROM centros_custo LIMIT 1;
  END IF;
  
  -- Obter IDs de formas de pagamento
  SELECT id INTO forma_pagamento1_id FROM formas_pagamento WHERE nome = 'Boleto' LIMIT 1;
  SELECT id INTO forma_pagamento2_id FROM formas_pagamento WHERE nome = 'PIX' LIMIT 1;
  SELECT id INTO forma_pagamento3_id FROM formas_pagamento WHERE nome = 'Transferência' LIMIT 1;
  
  -- Obter forma de pagamento genérica se as específicas não existirem
  IF forma_pagamento1_id IS NULL THEN
    SELECT id INTO forma_pagamento1_id FROM formas_pagamento LIMIT 1;
  END IF;
  
  IF forma_pagamento2_id IS NULL THEN
    SELECT id INTO forma_pagamento2_id FROM formas_pagamento LIMIT 1;
  END IF;
  
  IF forma_pagamento3_id IS NULL THEN
    SELECT id INTO forma_pagamento3_id FROM formas_pagamento LIMIT 1;
  END IF;
  
  -- Inserir 5 contas a pagar vencidas
  -- Conta 1: Vencida há 5 dias, prioridade urgente
  INSERT INTO contas_pagar (
    fornecedor_id,
    descricao,
    categoria_id,
    centro_custo_id,
    forma_pagamento_id,
    valor_total,
    data_emissao,
    data_vencimento,
    numero_documento,
    status,
    prioridade_sugerida,
    observacao_tesouraria
  ) VALUES (
    fornecedor1_id,
    'Compra de bebidas para evento do final de semana',
    categoria1_id,
    centro_custo1_id,
    forma_pagamento1_id,
    3750.00,
    CURRENT_DATE - INTERVAL '15 days',
    CURRENT_DATE - INTERVAL '5 days',
    'NF-12345',
    'em_aberto',
    'urgente',
    'Fornecedor já ligou cobrando 3 vezes. Risco de não entregar próximo pedido.'
  );
  
  -- Conta 2: Vencida há 15 dias, prioridade alta
  INSERT INTO contas_pagar (
    fornecedor_id,
    descricao,
    categoria_id,
    centro_custo_id,
    forma_pagamento_id,
    valor_total,
    data_emissao,
    data_vencimento,
    numero_documento,
    status,
    prioridade_sugerida,
    observacao_tesouraria
  ) VALUES (
    fornecedor2_id,
    'Fornecimento de alimentos - Pedido mensal',
    categoria1_id,
    centro_custo2_id,
    forma_pagamento2_id,
    8200.00,
    CURRENT_DATE - INTERVAL '45 days',
    CURRENT_DATE - INTERVAL '15 days',
    'NF-67890',
    'em_aberto',
    'alta',
    'Fornecedor importante. Precisamos manter boa relação para eventos futuros.'
  );
  
  -- Conta 3: Vencida há 30 dias, prioridade média
  INSERT INTO contas_pagar (
    fornecedor_id,
    descricao,
    categoria_id,
    centro_custo_id,
    forma_pagamento_id,
    valor_total,
    data_emissao,
    data_vencimento,
    numero_documento,
    status,
    prioridade_sugerida,
    observacao_tesouraria
  ) VALUES (
    fornecedor3_id,
    'Serviços de limpeza - Contrato mensal',
    categoria3_id,
    centro_custo3_id,
    forma_pagamento3_id,
    1850.00,
    CURRENT_DATE - INTERVAL '60 days',
    CURRENT_DATE - INTERVAL '30 days',
    'NF-24680',
    'em_aberto',
    'media',
    'Fornecedor aceita parcelamento. Podemos negociar prazo.'
  );
  
  -- Conta 4: Vencida há 45 dias, prioridade baixa
  INSERT INTO contas_pagar (
    fornecedor_id,
    descricao,
    categoria_id,
    centro_custo_id,
    forma_pagamento_id,
    valor_total,
    data_emissao,
    data_vencimento,
    numero_documento,
    status,
    prioridade_sugerida
  ) VALUES (
    fornecedor4_id,
    'Manutenção do ar condicionado',
    categoria3_id,
    centro_custo3_id,
    forma_pagamento1_id,
    950.00,
    CURRENT_DATE - INTERVAL '75 days',
    CURRENT_DATE - INTERVAL '45 days',
    'OS-13579',
    'em_aberto',
    'baixa'
  );
  
  -- Conta 5: Vencida há 60 dias, sem prioridade definida
  INSERT INTO contas_pagar (
    fornecedor_id,
    descricao,
    categoria_id,
    centro_custo_id,
    forma_pagamento_id,
    valor_total,
    data_emissao,
    data_vencimento,
    numero_documento,
    status
  ) VALUES (
    fornecedor5_id,
    'Impressão de cardápios e materiais promocionais',
    categoria4_id,
    centro_custo3_id,
    forma_pagamento2_id,
    1250.00,
    CURRENT_DATE - INTERVAL '90 days',
    CURRENT_DATE - INTERVAL '60 days',
    'NF-97531',
    'em_aberto'
  );
  
END $$;