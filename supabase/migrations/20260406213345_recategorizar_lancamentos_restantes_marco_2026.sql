/*
  # Recategorização Final - Lançamentos Restantes Março 2026
  
  1. Movimentações
     - AMBEV (CMV - Bebidas PAI) → Chopp e Cervejas
     - Seguro Predial (Despesas Fixas PAI) → IPTU e Licenças
     - Impostos diversos (IMPOSTOS PAI) → IMPOSTOS FEDERAIS
  
  2. Impacto
     - Remove todos os lançamentos de categorias PAI em março/2026
     - Corrige DRE completamente
*/

-- Mover AMBEV para "Chopp e Cervejas"
DO $$
DECLARE
  v_categoria_destino_id uuid;
  v_qtd_movidos integer;
BEGIN
  -- Buscar ID de "Chopp e Cervejas"
  SELECT id INTO v_categoria_destino_id
  FROM categorias_financeiras
  WHERE nome = 'Chopp e Cervejas'
    AND status = 'ativo';
  
  -- Mover lançamento da AMBEV
  UPDATE fluxo_caixa
  SET categoria_id = v_categoria_destino_id
  WHERE LOWER(descricao) LIKE '%ambev%'
    AND EXTRACT(YEAR FROM data) = 2026
    AND EXTRACT(MONTH FROM data) = 3;
  
  GET DIAGNOSTICS v_qtd_movidos = ROW_COUNT;
  RAISE NOTICE 'Movidos % lançamentos AMBEV para Chopp e Cervejas', v_qtd_movidos;
END $$;

-- Mover Seguro Predial para "IPTU e Licenças"
DO $$
DECLARE
  v_categoria_destino_id uuid;
  v_qtd_movidos integer;
BEGIN
  -- Buscar ID de "IPTU e Licenças"
  SELECT id INTO v_categoria_destino_id
  FROM categorias_financeiras
  WHERE nome = 'IPTU e Licenças'
    AND status = 'ativo';
  
  -- Mover seguro predial
  UPDATE fluxo_caixa
  SET categoria_id = v_categoria_destino_id
  WHERE LOWER(descricao) LIKE '%seguro predial%'
    AND EXTRACT(YEAR FROM data) = 2026
    AND EXTRACT(MONTH FROM data) = 3;
  
  GET DIAGNOSTICS v_qtd_movidos = ROW_COUNT;
  RAISE NOTICE 'Movidos % lançamentos de Seguro Predial para IPTU e Licenças', v_qtd_movidos;
END $$;

-- Mover impostos e taxas diversos para "IMPOSTOS FEDERAIS"
DO $$
DECLARE
  v_categoria_pai_id uuid;
  v_categoria_destino_id uuid;
  v_qtd_movidos integer;
BEGIN
  -- Buscar ID da categoria PAI "IMPOSTOS"
  SELECT id INTO v_categoria_pai_id
  FROM categorias_financeiras
  WHERE nome = 'IMPOSTOS'
    AND categoria_pai_id IS NULL
    AND status = 'ativo';
  
  -- Buscar ID de "IMPOSTOS FEDERAIS"
  SELECT id INTO v_categoria_destino_id
  FROM categorias_financeiras
  WHERE nome = 'IMPOSTOS FEDERAIS'
    AND status = 'ativo';
  
  -- Mover todos os lançamentos restantes em IMPOSTOS (PAI)
  UPDATE fluxo_caixa
  SET categoria_id = v_categoria_destino_id
  WHERE categoria_id = v_categoria_pai_id
    AND EXTRACT(YEAR FROM data) = 2026
    AND EXTRACT(MONTH FROM data) = 3;
  
  GET DIAGNOSTICS v_qtd_movidos = ROW_COUNT;
  RAISE NOTICE 'Movidos % impostos/taxas diversos para IMPOSTOS FEDERAIS', v_qtd_movidos;
END $$;

-- Verificação final
DO $$
DECLARE
  v_count_total integer;
BEGIN
  -- Contar TODOS os lançamentos restantes em categorias PAI em março/2026
  SELECT COUNT(*)::integer INTO v_count_total
  FROM fluxo_caixa fc
  JOIN categorias_financeiras c ON c.id = fc.categoria_id
  WHERE c.categoria_pai_id IS NULL
    AND EXTRACT(YEAR FROM fc.data) = 2026
    AND EXTRACT(MONTH FROM fc.data) = 3
    AND COALESCE(fc.origem, '') != 'transferencia';
  
  RAISE NOTICE '=== VERIFICAÇÃO FINAL ===';
  RAISE NOTICE 'Lançamentos restantes em categorias PAI (março/2026): %', v_count_total;
  
  IF v_count_total = 0 THEN
    RAISE NOTICE '✅ SUCESSO! Todos os lançamentos foram recategorizados!';
  ELSE
    RAISE WARNING '⚠️ Ainda existem % lançamentos em categorias PAI', v_count_total;
  END IF;
END $$;
