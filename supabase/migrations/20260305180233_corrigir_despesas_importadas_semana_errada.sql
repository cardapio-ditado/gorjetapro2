/*
  # Corrigir Despesas Importadas na Semana Errada
  
  ## Descrição
  Despesas que foram importadas de contas futuras podem estar associadas à semana errada.
  Esta migration move essas despesas para a semana correta baseada na data de vencimento.
  
  ## Ações
  1. Identificar despesas importadas (conta_pagar_id NOT NULL)
  2. Calcular semana correta baseada na data de vencimento
  3. Criar semana se não existir
  4. Mover despesa para semana correta
*/

DO $$
DECLARE
  v_despesa record;
  v_data_inicio_semana date;
  v_semana_correta_id uuid;
  v_ultimo_faturamento numeric;
  v_contador int := 0;
BEGIN
  -- Buscar último faturamento para usar como base em novas semanas
  SELECT faturamento INTO v_ultimo_faturamento
  FROM visao_estrategica_semanas
  ORDER BY data_inicio DESC
  LIMIT 1;
  
  v_ultimo_faturamento := COALESCE(v_ultimo_faturamento, 100000);
  
  -- Processar todas as despesas importadas
  FOR v_despesa IN 
    SELECT id, data_vencimento, semana_id, fornecedor
    FROM visao_estrategica_despesas
    WHERE conta_pagar_id IS NOT NULL
      AND status = 'ativa'
      AND data_vencimento IS NOT NULL
  LOOP
    -- Calcular início da semana correta
    v_data_inicio_semana := calcular_inicio_semana(v_despesa.data_vencimento);
    
    -- Buscar semana correspondente
    SELECT id INTO v_semana_correta_id
    FROM visao_estrategica_semanas
    WHERE data_inicio = v_data_inicio_semana;
    
    -- Se semana não existe, criar
    IF v_semana_correta_id IS NULL THEN
      INSERT INTO visao_estrategica_semanas (data_inicio, faturamento)
      VALUES (v_data_inicio_semana, v_ultimo_faturamento)
      RETURNING id INTO v_semana_correta_id;
      
      RAISE NOTICE 'Semana criada automaticamente: %', to_char(v_data_inicio_semana, 'DD/MM/YYYY');
    END IF;
    
    -- Mover despesa para semana correta se estiver na semana errada
    IF v_despesa.semana_id != v_semana_correta_id THEN
      UPDATE visao_estrategica_despesas
      SET semana_id = v_semana_correta_id
      WHERE id = v_despesa.id;
      
      v_contador := v_contador + 1;
      
      RAISE NOTICE 'Despesa % movida para semana de %', 
        v_despesa.fornecedor, 
        to_char(v_data_inicio_semana, 'DD/MM/YYYY');
    END IF;
  END LOOP;
  
  RAISE NOTICE 'Total de despesas corrigidas: %', v_contador;
END $$;
