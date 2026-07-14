/*
  # Recategorização Automática de Lançamentos - Março 2026
  
  1. Categorias Criadas
     - "Receita Venda de Salão" (subcategoria de Receitas Operacionais)
  
  2. Movimentações Realizadas
     - Lançamentos de Receitas Operacionais (PAI) → Receita Venda de Salão
       (exceto empréstimos)
     - Empréstimos KADU → Outras Receitas  
     - FGTS em IMPOSTOS (PAI) → IMPOSTOS FEDERAIS
  
  3. Impacto
     - Corrige exibição no DRE detalhado
     - Organiza lançamentos em subcategorias corretas
     - Remove valores de categorias PAI
*/

-- PASSO 1: Criar subcategoria "Receita Venda de Salão"
DO $$
DECLARE
  v_categoria_pai_id uuid;
  v_nova_categoria_id uuid;
BEGIN
  -- Buscar ID da categoria PAI "Receitas Operacionais"
  SELECT id INTO v_categoria_pai_id
  FROM categorias_financeiras
  WHERE nome = 'Receitas Operacionais'
    AND tipo = 'receita'
    AND categoria_pai_id IS NULL
    AND status = 'ativo';
  
  -- Verificar se a subcategoria já existe
  SELECT id INTO v_nova_categoria_id
  FROM categorias_financeiras
  WHERE nome = 'Receita Venda de Salão'
    AND categoria_pai_id = v_categoria_pai_id;
  
  -- Criar subcategoria se não existir
  IF v_nova_categoria_id IS NULL THEN
    INSERT INTO categorias_financeiras (
      nome,
      tipo,
      categoria_pai_id,
      status
    ) VALUES (
      'Receita Venda de Salão',
      'receita',
      v_categoria_pai_id,
      'ativo'
    )
    RETURNING id INTO v_nova_categoria_id;
    
    RAISE NOTICE 'Criada subcategoria: Receita Venda de Salão (ID: %)', v_nova_categoria_id;
  ELSE
    RAISE NOTICE 'Subcategoria já existe: Receita Venda de Salão (ID: %)', v_nova_categoria_id;
  END IF;
END $$;

-- PASSO 2: Mover vendas do ZIG/Caixa/Máquinas para "Receita Venda de Salão"
DO $$
DECLARE
  v_categoria_pai_id uuid;
  v_nova_categoria_id uuid;
  v_qtd_movidos integer;
BEGIN
  -- Buscar IDs
  SELECT id INTO v_categoria_pai_id
  FROM categorias_financeiras
  WHERE nome = 'Receitas Operacionais' AND categoria_pai_id IS NULL;
  
  SELECT id INTO v_nova_categoria_id
  FROM categorias_financeiras
  WHERE nome = 'Receita Venda de Salão'
    AND categoria_pai_id = v_categoria_pai_id;
  
  -- Mover lançamentos de vendas (ZIG, Caixa, Máquinas) - EXCETO empréstimos
  UPDATE fluxo_caixa
  SET categoria_id = v_nova_categoria_id
  WHERE categoria_id = v_categoria_pai_id
    AND tipo = 'entrada'
    AND LOWER(descricao) NOT LIKE '%emprestimo%'
    AND LOWER(descricao) NOT LIKE '%empréstimo%';
  
  GET DIAGNOSTICS v_qtd_movidos = ROW_COUNT;
  RAISE NOTICE 'Movidos % lançamentos de vendas para Receita Venda de Salão', v_qtd_movidos;
END $$;

-- PASSO 3: Mover empréstimos KADU para "Outras Receitas"
DO $$
DECLARE
  v_categoria_destino_id uuid;
  v_qtd_movidos integer;
BEGIN
  -- Buscar ID de "Outras Receitas"
  SELECT id INTO v_categoria_destino_id
  FROM categorias_financeiras
  WHERE nome = 'Outras Receitas'
    AND tipo = 'receita'
    AND categoria_pai_id IS NULL
    AND status = 'ativo';
  
  -- Mover empréstimos KADU
  UPDATE fluxo_caixa
  SET categoria_id = v_categoria_destino_id
  WHERE tipo = 'entrada'
    AND (
      LOWER(descricao) LIKE '%emprestimo kadu%'
      OR LOWER(descricao) LIKE '%empréstimo kadu%'
    )
    AND EXTRACT(YEAR FROM data) = 2026
    AND EXTRACT(MONTH FROM data) = 3;
  
  GET DIAGNOSTICS v_qtd_movidos = ROW_COUNT;
  RAISE NOTICE 'Movidos % empréstimos KADU para Outras Receitas', v_qtd_movidos;
END $$;

-- PASSO 4: Mover FGTS da categoria PAI "IMPOSTOS" para subcategoria "IMPOSTOS FEDERAIS"
DO $$
DECLARE
  v_categoria_pai_id uuid;
  v_categoria_destino_id uuid;
  v_qtd_movidos integer;
BEGIN
  -- Buscar IDs
  SELECT id INTO v_categoria_pai_id
  FROM categorias_financeiras
  WHERE nome = 'IMPOSTOS'
    AND categoria_pai_id IS NULL
    AND status = 'ativo';
  
  SELECT id INTO v_categoria_destino_id
  FROM categorias_financeiras
  WHERE nome = 'IMPOSTOS FEDERAIS'
    AND categoria_pai_id = v_categoria_pai_id
    AND status = 'ativo';
  
  -- Mover todos os lançamentos de FGTS que estão na categoria PAI "IMPOSTOS"
  UPDATE fluxo_caixa
  SET categoria_id = v_categoria_destino_id
  WHERE categoria_id = v_categoria_pai_id
    AND tipo = 'saida'
    AND LOWER(descricao) LIKE '%fgts%'
    AND EXTRACT(YEAR FROM data) = 2026
    AND EXTRACT(MONTH FROM data) = 3;
  
  GET DIAGNOSTICS v_qtd_movidos = ROW_COUNT;
  RAISE NOTICE 'Movidos % lançamentos de FGTS para IMPOSTOS FEDERAIS', v_qtd_movidos;
END $$;

-- PASSO 5: Verificar resultados
DO $$
DECLARE
  v_count_receitas_operacionais integer;
  v_count_impostos_pai integer;
  v_count_venda_salao integer;
  v_count_impostos_federais integer;
BEGIN
  -- Contar lançamentos restantes em Receitas Operacionais (PAI)
  SELECT COUNT(*)::integer INTO v_count_receitas_operacionais
  FROM fluxo_caixa fc
  JOIN categorias_financeiras c ON c.id = fc.categoria_id
  WHERE c.nome = 'Receitas Operacionais'
    AND c.categoria_pai_id IS NULL
    AND EXTRACT(YEAR FROM fc.data) = 2026
    AND EXTRACT(MONTH FROM fc.data) = 3;
  
  -- Contar lançamentos restantes em IMPOSTOS (PAI)
  SELECT COUNT(*)::integer INTO v_count_impostos_pai
  FROM fluxo_caixa fc
  JOIN categorias_financeiras c ON c.id = fc.categoria_id
  WHERE c.nome = 'IMPOSTOS'
    AND c.categoria_pai_id IS NULL
    AND EXTRACT(YEAR FROM fc.data) = 2026
    AND EXTRACT(MONTH FROM fc.data) = 3;
  
  -- Contar lançamentos em Receita Venda de Salão
  SELECT COUNT(*)::integer INTO v_count_venda_salao
  FROM fluxo_caixa fc
  JOIN categorias_financeiras c ON c.id = fc.categoria_id
  WHERE c.nome = 'Receita Venda de Salão'
    AND EXTRACT(YEAR FROM fc.data) = 2026
    AND EXTRACT(MONTH FROM fc.data) = 3;
  
  -- Contar lançamentos em IMPOSTOS FEDERAIS
  SELECT COUNT(*)::integer INTO v_count_impostos_federais
  FROM fluxo_caixa fc
  JOIN categorias_financeiras c ON c.id = fc.categoria_id
  WHERE c.nome = 'IMPOSTOS FEDERAIS'
    AND LOWER(fc.descricao) LIKE '%fgts%'
    AND EXTRACT(YEAR FROM fc.data) = 2026
    AND EXTRACT(MONTH FROM fc.data) = 3;
  
  RAISE NOTICE '=== RESULTADO DA RECATEGORIZAÇÃO ===';
  RAISE NOTICE 'Receitas Operacionais (PAI) restantes: %', v_count_receitas_operacionais;
  RAISE NOTICE 'IMPOSTOS (PAI) restantes: %', v_count_impostos_pai;
  RAISE NOTICE 'Receita Venda de Salão: %', v_count_venda_salao;
  RAISE NOTICE 'IMPOSTOS FEDERAIS (FGTS): %', v_count_impostos_federais;
END $$;
