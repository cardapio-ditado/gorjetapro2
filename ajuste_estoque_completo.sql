-- Script de Ajuste Massivo de Estoque Central
-- Atualização de inventário baseada em contagem física

DO $$
DECLARE
  v_estoque_id UUID;
  v_item_id UUID;
  v_saldo_atual NUMERIC;
  v_nova_quantidade NUMERIC;
  v_custo_medio NUMERIC;
  v_ajuste NUMERIC;
  v_item_nome TEXT;
BEGIN
  -- Buscar ID do estoque central
  SELECT id INTO v_estoque_id
  FROM estoques
  WHERE LOWER(nome) LIKE '%central%'
  LIMIT 1;

  IF v_estoque_id IS NULL THEN
    RAISE EXCEPTION 'Estoque Central não encontrado!';
  END IF;

  RAISE NOTICE '=== INICIANDO AJUSTES DE ESTOQUE ===';
  RAISE NOTICE 'Estoque ID: %', v_estoque_id;

  -- Criar função auxiliar para ajustar
  CREATE TEMP TABLE ajustes_temp (
    nome_item TEXT,
    quantidade_nova NUMERIC
  );

  -- LATICÍNIOS E DERIVADOS
  INSERT INTO ajustes_temp VALUES
    ('CREME DE LEITE P', 5),
    ('LEITE NINHO', 1),
    ('LEITE CONDENSADO P', 5),
    ('LEITE CONDENSADO 2,5KG', 1),
    ('LEITE INTEGRAL', 8),
    ('LEITE DE COCO', 4),
    ('CHANTILLY', 1);

  -- CONDIMENTOS E TEMPEROS
  INSERT INTO ajustes_temp VALUES
    ('AÇAFRÃO PCT', 15),
    ('NÓZ-MOSCADA', 4),
    ('TEMPERO BAIANO', 4),
    ('ALECRIM', 4),
    ('COLORAU', 1),
    ('CANELA CASCA PCT', 8),
    ('SAL GROSSO', 6),
    ('SAL REFINADO', 11),
    ('PAPRICA DOCE', 4),
    ('PIMENTA SIRIA', 4),
    ('PIMENTA DO REINO PCT', 2),
    ('CANELA EM PÓ PCT', 4);

  -- MOLHOS E CONSERVAS
  INSERT INTO ajustes_temp VALUES
    ('M. HELLMAMS PCT P', 6),
    ('AZEITE 200ML LATA', 13),
    ('PICHES', 8),
    ('EXTRATO DE TOMATE', 3),
    ('BARBECUE', 1),
    ('OLEO DE SOJA', 11),
    ('PIMENTA TABASCO', 12),
    ('PALMITO', 2);

  -- BEBIDAS
  INSERT INTO ajustes_temp VALUES
    ('CERVEJA PRETA', 3),
    ('SUCO ABACAXI', 2),
    ('SUCO MARACUJÁ', 2);

  -- GRÃOS E CEREAIS
  INSERT INTO ajustes_temp VALUES
    ('ARROZ', 5),
    ('ARROZ ARBÓREO', 2),
    ('FARINHA DE TRIGO', 1),
    ('FARINHA ROSCA VASILHA', 3),
    ('FEIJÃO PRETO', 15),
    ('FEIJÃO CARIOCA', 2),
    ('FUBÁ DE MILHO', 1),
    ('MACARRÃO ESPAGUETE', 2),
    ('MACARRÃO TALHARIM', 2);

  -- AÇÚCARES E DOCES
  INSERT INTO ajustes_temp VALUES
    ('AÇÚCAR MASCAVO', 1),
    ('CAFÉ', 1),
    ('AÇÚCAR REFINADA', 8),
    ('SUCO PCT', 9),
    ('COBERTURA MORANGO', 1),
    ('COBERTURA CHOCOLATE', 1),
    ('OVOS', 8),
    ('CEREJA EM CALDA', 2),
    ('MEL', 1);

  -- OUTROS
  INSERT INTO ajustes_temp VALUES
    ('PURURUCA', 8),
    ('ADOÇANTE', 2),
    ('BISNAGUINHA', 2),
    ('PÃO HAMBURGUER', 2),
    ('PÃO DE FORMA', 2);

  -- Processar ajustes
  FOR v_item_nome, v_nova_quantidade IN
    SELECT nome_item, quantidade_nova FROM ajustes_temp
  LOOP
    -- Buscar item
    SELECT id INTO v_item_id
    FROM itens_estoque
    WHERE UPPER(nome) LIKE '%' || UPPER(v_item_nome) || '%'
    LIMIT 1;

    IF v_item_id IS NOT NULL THEN
      -- Buscar saldo atual e custo médio
      SELECT COALESCE(saldo_atual, 0), COALESCE(custo_medio, 5.0)
      INTO v_saldo_atual, v_custo_medio
      FROM saldos_estoque
      WHERE estoque_id = v_estoque_id AND item_id = v_item_id;

      -- Calcular ajuste necessário
      v_ajuste := v_nova_quantidade - COALESCE(v_saldo_atual, 0);

      -- Se houver diferença, criar movimentação de ajuste
      IF v_ajuste != 0 THEN
        INSERT INTO movimentacoes_estoque (
          estoque_destino_id,
          item_id,
          tipo_movimentacao,
          quantidade,
          custo_unitario,
          custo_total,
          data_movimentacao,
          motivo,
          observacoes
        ) VALUES (
          v_estoque_id,
          v_item_id,
          'ajuste',
          v_ajuste,
          v_custo_medio,
          v_ajuste * v_custo_medio,
          CURRENT_DATE,
          'Ajuste de inventário',
          'Ajuste de estoque: ' || v_saldo_atual || ' → ' || v_nova_quantidade
        );

        RAISE NOTICE 'Ajustado: % de % para % (diferença: %)',
          v_item_nome, v_saldo_atual, v_nova_quantidade, v_ajuste;
      ELSE
        RAISE NOTICE 'OK: % já está com quantidade correta (%)', v_item_nome, v_nova_quantidade;
      END IF;
    ELSE
      RAISE NOTICE 'ATENÇÃO: Item não encontrado: %', v_item_nome;
    END IF;
  END LOOP;

  DROP TABLE ajustes_temp;

  RAISE NOTICE '=== AJUSTES CONCLUÍDOS ===';
END $$;
