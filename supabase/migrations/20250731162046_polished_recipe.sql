/*
  # Corrigir Schema do Estoque Avançado

  1. Colunas Adicionadas
    - `fichas_tecnicas`: ativo, categoria, dificuldade, tempo_preparo
    - `producoes`: custo_total_producao, responsavel, status, observacoes

  2. Views Recriadas
    - `vw_estoque_atual`: Com quantidade_atual, valor_total, abaixo_minimo
    - `vw_fichas_completas`: Com novas colunas e agregações corretas
    - `vw_producao_detalhada`: Nova view para produções detalhadas

  3. Dados de Exemplo
    - Fichas técnicas com categorias e dificuldades
    - Produções com status e responsáveis
*/

-- Adicionar colunas faltantes na tabela fichas_tecnicas
DO $$
BEGIN
  -- Adicionar coluna ativo
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fichas_tecnicas' AND column_name = 'ativo'
  ) THEN
    ALTER TABLE fichas_tecnicas ADD COLUMN ativo BOOLEAN DEFAULT true;
  END IF;

  -- Adicionar coluna categoria
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fichas_tecnicas' AND column_name = 'categoria'
  ) THEN
    ALTER TABLE fichas_tecnicas ADD COLUMN categoria TEXT DEFAULT 'Geral';
  END IF;

  -- Adicionar coluna dificuldade
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fichas_tecnicas' AND column_name = 'dificuldade'
  ) THEN
    ALTER TABLE fichas_tecnicas ADD COLUMN dificuldade TEXT DEFAULT 'Médio';
  END IF;

  -- Adicionar coluna tempo_preparo
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fichas_tecnicas' AND column_name = 'tempo_preparo'
  ) THEN
    ALTER TABLE fichas_tecnicas ADD COLUMN tempo_preparo INTEGER DEFAULT 15;
  END IF;
END $$;

-- Adicionar constraint para dificuldade
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'fichas_tecnicas' AND constraint_name = 'fichas_tecnicas_dificuldade_check'
  ) THEN
    ALTER TABLE fichas_tecnicas ADD CONSTRAINT fichas_tecnicas_dificuldade_check 
    CHECK (dificuldade IN ('Fácil', 'Médio', 'Difícil', 'Expert'));
  END IF;
END $$;

-- Adicionar colunas faltantes na tabela producoes
DO $$
BEGIN
  -- Adicionar coluna custo_total_producao
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'producoes' AND column_name = 'custo_total_producao'
  ) THEN
    ALTER TABLE producoes ADD COLUMN custo_total_producao NUMERIC(10,2) DEFAULT 0;
  END IF;

  -- Adicionar coluna responsavel
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'producoes' AND column_name = 'responsavel'
  ) THEN
    ALTER TABLE producoes ADD COLUMN responsavel TEXT;
  END IF;

  -- Adicionar coluna status
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'producoes' AND column_name = 'status'
  ) THEN
    ALTER TABLE producoes ADD COLUMN status TEXT DEFAULT 'planejado';
  END IF;

  -- Adicionar coluna observacoes
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'producoes' AND column_name = 'observacoes'
  ) THEN
    ALTER TABLE producoes ADD COLUMN observacoes TEXT;
  END IF;
END $$;

-- Adicionar constraint para status de produção
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'producoes' AND constraint_name = 'producoes_status_check'
  ) THEN
    ALTER TABLE producoes ADD CONSTRAINT producoes_status_check 
    CHECK (status IN ('planejado', 'em_andamento', 'concluido', 'cancelado'));
  END IF;
END $$;

-- Recriar view vw_estoque_atual
DROP VIEW IF EXISTS vw_estoque_atual;

CREATE VIEW vw_estoque_atual AS
SELECT 
  ie.id,
  ie.codigo,
  ie.nome,
  ie.descricao,
  ie.tipo_item,
  ie.categoria,
  ie.unidade_medida,
  ie.estoque_minimo,
  ie.ponto_reposicao,
  ie.custo_medio,
  ie.tem_validade,
  ie.status,
  ie.criado_em,
  ie.atualizado_em,
  COALESCE(se.quantidade_atual, 0) as quantidade_atual,
  COALESCE(se.valor_total, 0) as valor_total,
  CASE 
    WHEN COALESCE(se.quantidade_atual, 0) <= ie.estoque_minimo THEN true
    ELSE false
  END as abaixo_minimo,
  e.nome as estoque_nome,
  e.localizacao as estoque_localizacao
FROM itens_estoque ie
LEFT JOIN saldos_estoque se ON ie.id = se.item_id
LEFT JOIN estoques e ON se.estoque_id = e.id
WHERE ie.status = 'ativo';

-- Recriar view vw_fichas_completas
DROP VIEW IF EXISTS vw_fichas_completas;

CREATE VIEW vw_fichas_completas AS
SELECT 
  ft.id as ficha_id,
  ft.nome as nome_ficha,
  ft.categoria,
  ft.dificuldade,
  ft.tempo_preparo,
  ft.porcoes,
  ft.ativo,
  ft.custo_total as custo_estimado,
  ft.criado_em,
  COALESCE(
    json_agg(
      json_build_object(
        'insumo_id', fi.insumo_id,
        'insumo_nome', i.nome,
        'quantidade', fi.quantidade,
        'unidade', i.unidade,
        'custo_unitario', COALESCE(ie.custo_medio, 0)
      ) ORDER BY i.nome
    ) FILTER (WHERE fi.id IS NOT NULL), 
    '[]'::json
  ) as ingredientes,
  COALESCE(
    SUM(fi.quantidade * COALESCE(ie.custo_medio, 0)), 
    0
  ) as custo_total_calculado,
  COALESCE(
    (SELECT COUNT(*) FROM producoes p WHERE p.ficha_id = ft.id), 
    0
  ) as total_producoes
FROM fichas_tecnicas ft
LEFT JOIN ficha_ingredientes fi ON ft.id = fi.ficha_id
LEFT JOIN insumos i ON fi.insumo_id = i.id
LEFT JOIN itens_estoque ie ON i.nome = ie.nome
GROUP BY ft.id, ft.nome, ft.categoria, ft.dificuldade, ft.tempo_preparo, ft.porcoes, ft.ativo, ft.custo_total, ft.criado_em;

-- Criar view vw_producao_detalhada
DROP VIEW IF EXISTS vw_producao_detalhada;

CREATE VIEW vw_producao_detalhada AS
SELECT 
  p.id,
  p.ficha_id,
  p.quantidade,
  p.custo_total_producao,
  p.responsavel,
  p.status,
  p.observacoes,
  p.data_producao,
  p.criado_em,
  ft.nome as ficha_nome,
  ft.categoria as ficha_categoria,
  ft.dificuldade as ficha_dificuldade,
  ft.tempo_preparo as ficha_tempo_preparo,
  ft.porcoes as ficha_porcoes,
  ft.custo_total as custo_unitario_ficha,
  (ft.custo_total * p.quantidade) as custo_total_estimado,
  CASE 
    WHEN p.custo_total_producao > 0 THEN p.custo_total_producao
    ELSE (ft.custo_total * p.quantidade)
  END as custo_total_final
FROM producoes p
INNER JOIN fichas_tecnicas ft ON p.ficha_id = ft.id;

-- Inserir dados de exemplo para fichas técnicas (se não existirem)
INSERT INTO fichas_tecnicas (nome, categoria, dificuldade, tempo_preparo, porcoes, ativo, custo_total)
SELECT * FROM (VALUES
  ('Caipirinha Tradicional', 'Bebidas', 'Fácil', 5, 1, true, 8.50),
  ('Batata Frita Especial', 'Porções', 'Médio', 15, 4, true, 12.00),
  ('Hambúrguer Artesanal', 'Pratos', 'Difícil', 25, 1, true, 18.50),
  ('Mousse de Chocolate', 'Sobremesas', 'Expert', 45, 6, true, 15.00),
  ('Suco Natural Detox', 'Bebidas', 'Fácil', 8, 1, true, 6.50)
) AS v(nome, categoria, dificuldade, tempo_preparo, porcoes, ativo, custo_total)
WHERE NOT EXISTS (
  SELECT 1 FROM fichas_tecnicas WHERE nome = v.nome
);

-- Inserir dados de exemplo para produções (se não existirem)
DO $$
DECLARE
  ficha_caipirinha_id UUID;
  ficha_batata_id UUID;
  ficha_hamburguer_id UUID;
BEGIN
  -- Buscar IDs das fichas
  SELECT id INTO ficha_caipirinha_id FROM fichas_tecnicas WHERE nome = 'Caipirinha Tradicional' LIMIT 1;
  SELECT id INTO ficha_batata_id FROM fichas_tecnicas WHERE nome = 'Batata Frita Especial' LIMIT 1;
  SELECT id INTO ficha_hamburguer_id FROM fichas_tecnicas WHERE nome = 'Hambúrguer Artesanal' LIMIT 1;

  -- Inserir produções se as fichas existirem
  IF ficha_caipirinha_id IS NOT NULL THEN
    INSERT INTO producoes (ficha_id, quantidade, custo_total_producao, responsavel, status, observacoes, data_producao)
    SELECT ficha_caipirinha_id, 20, 170.00, 'João Silva', 'concluido', 'Produção para evento', CURRENT_DATE - INTERVAL '2 days'
    WHERE NOT EXISTS (
      SELECT 1 FROM producoes WHERE ficha_id = ficha_caipirinha_id AND data_producao = CURRENT_DATE - INTERVAL '2 days'
    );
  END IF;

  IF ficha_batata_id IS NOT NULL THEN
    INSERT INTO producoes (ficha_id, quantidade, custo_total_producao, responsavel, status, observacoes, data_producao)
    SELECT ficha_batata_id, 15, 180.00, 'Maria Santos', 'em_andamento', 'Produção em lote', CURRENT_DATE
    WHERE NOT EXISTS (
      SELECT 1 FROM producoes WHERE ficha_id = ficha_batata_id AND data_producao = CURRENT_DATE
    );
  END IF;

  IF ficha_hamburguer_id IS NOT NULL THEN
    INSERT INTO producoes (ficha_id, quantidade, custo_total_producao, responsavel, status, observacoes, data_producao)
    SELECT ficha_hamburguer_id, 10, 185.00, 'Carlos Oliveira', 'planejado', 'Produção para fim de semana', CURRENT_DATE + INTERVAL '1 day'
    WHERE NOT EXISTS (
      SELECT 1 FROM producoes WHERE ficha_id = ficha_hamburguer_id AND data_producao = CURRENT_DATE + INTERVAL '1 day'
    );
  END IF;
END $$;

-- Atualizar fichas existentes com valores padrão para novas colunas
UPDATE fichas_tecnicas 
SET 
  ativo = COALESCE(ativo, true),
  categoria = COALESCE(categoria, 'Geral'),
  dificuldade = COALESCE(dificuldade, 'Médio'),
  tempo_preparo = COALESCE(tempo_preparo, 15)
WHERE ativo IS NULL OR categoria IS NULL OR dificuldade IS NULL OR tempo_preparo IS NULL;

-- Atualizar produções existentes com valores padrão para novas colunas
UPDATE producoes 
SET 
  custo_total_producao = COALESCE(custo_total_producao, 0),
  status = COALESCE(status, 'planejado')
WHERE custo_total_producao IS NULL OR status IS NULL;

-- Inserir alguns itens de estoque de exemplo se não existirem
INSERT INTO itens_estoque (codigo, nome, descricao, tipo_item, categoria, unidade_medida, estoque_minimo, ponto_reposicao, custo_medio, status)
SELECT * FROM (VALUES
  ('VODKA001', 'Vodka Premium', 'Vodka importada premium', 'insumo', 'Bebidas Alcoólicas', 'garrafa', 5, 10, 45.00, 'ativo'),
  ('LIMAO001', 'Limão Tahiti', 'Limão fresco para drinks', 'insumo', 'Frutas', 'kg', 10, 20, 3.50, 'ativo'),
  ('BATATA001', 'Batata Inglesa', 'Batata para fritura', 'insumo', 'Legumes', 'kg', 20, 40, 4.20, 'ativo'),
  ('CARNE001', 'Carne Bovina Premium', 'Carne para hambúrguer', 'insumo', 'Carnes', 'kg', 15, 30, 28.00, 'ativo'),
  ('CHOCOLATE001', 'Chocolate 70%', 'Chocolate para sobremesas', 'insumo', 'Doces', 'kg', 5, 10, 35.00, 'ativo')
) AS v(codigo, nome, descricao, tipo_item, categoria, unidade_medida, estoque_minimo, ponto_reposicao, custo_medio, status)
WHERE NOT EXISTS (
  SELECT 1 FROM itens_estoque WHERE codigo = v.codigo
);

-- Inserir alguns estoques de exemplo se não existirem
INSERT INTO estoques (nome, descricao, localizacao, tipo, status)
SELECT * FROM (VALUES
  ('Estoque Principal', 'Estoque principal do bar', 'Depósito Central', 'central', true),
  ('Estoque Bar', 'Estoque do balcão do bar', 'Área do Bar', 'producao', true),
  ('Estoque Cozinha', 'Estoque da cozinha', 'Área da Cozinha', 'producao', true)
) AS v(nome, descricao, localizacao, tipo, status)
WHERE NOT EXISTS (
  SELECT 1 FROM estoques WHERE nome = v.nome
);

-- Inserir saldos de estoque de exemplo
DO $$
DECLARE
  estoque_principal_id UUID;
  item_vodka_id UUID;
  item_limao_id UUID;
  item_batata_id UUID;
  item_carne_id UUID;
  item_chocolate_id UUID;
BEGIN
  -- Buscar IDs
  SELECT id INTO estoque_principal_id FROM estoques WHERE nome = 'Estoque Principal' LIMIT 1;
  SELECT id INTO item_vodka_id FROM itens_estoque WHERE codigo = 'VODKA001' LIMIT 1;
  SELECT id INTO item_limao_id FROM itens_estoque WHERE codigo = 'LIMAO001' LIMIT 1;
  SELECT id INTO item_batata_id FROM itens_estoque WHERE codigo = 'BATATA001' LIMIT 1;
  SELECT id INTO item_carne_id FROM itens_estoque WHERE codigo = 'CARNE001' LIMIT 1;
  SELECT id INTO item_chocolate_id FROM itens_estoque WHERE codigo = 'CHOCOLATE001' LIMIT 1;

  -- Inserir saldos se os itens e estoque existirem
  IF estoque_principal_id IS NOT NULL THEN
    -- Vodka
    IF item_vodka_id IS NOT NULL THEN
      INSERT INTO saldos_estoque (estoque_id, item_id, quantidade_atual, valor_total)
      SELECT estoque_principal_id, item_vodka_id, 12, 540.00
      WHERE NOT EXISTS (
        SELECT 1 FROM saldos_estoque WHERE estoque_id = estoque_principal_id AND item_id = item_vodka_id
      );
    END IF;

    -- Limão
    IF item_limao_id IS NOT NULL THEN
      INSERT INTO saldos_estoque (estoque_id, item_id, quantidade_atual, valor_total)
      SELECT estoque_principal_id, item_limao_id, 8, 28.00
      WHERE NOT EXISTS (
        SELECT 1 FROM saldos_estoque WHERE estoque_id = estoque_principal_id AND item_id = item_limao_id
      );
    END IF;

    -- Batata
    IF item_batata_id IS NOT NULL THEN
      INSERT INTO saldos_estoque (estoque_id, item_id, quantidade_atual, valor_total)
      SELECT estoque_principal_id, item_batata_id, 25, 105.00
      WHERE NOT EXISTS (
        SELECT 1 FROM saldos_estoque WHERE estoque_id = estoque_principal_id AND item_id = item_batata_id
      );
    END IF;

    -- Carne
    IF item_carne_id IS NOT NULL THEN
      INSERT INTO saldos_estoque (estoque_id, item_id, quantidade_atual, valor_total)
      SELECT estoque_principal_id, item_carne_id, 18, 504.00
      WHERE NOT EXISTS (
        SELECT 1 FROM saldos_estoque WHERE estoque_id = estoque_principal_id AND item_id = item_carne_id
      );
    END IF;

    -- Chocolate
    IF item_chocolate_id IS NOT NULL THEN
      INSERT INTO saldos_estoque (estoque_id, item_id, quantidade_atual, valor_total)
      SELECT estoque_principal_id, item_chocolate_id, 3, 105.00
      WHERE NOT EXISTS (
        SELECT 1 FROM saldos_estoque WHERE estoque_id = estoque_principal_id AND item_id = item_chocolate_id
      );
    END IF;
  END IF;
END $$;

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_fichas_tecnicas_ativo ON fichas_tecnicas(ativo);
CREATE INDEX IF NOT EXISTS idx_fichas_tecnicas_categoria ON fichas_tecnicas(categoria);
CREATE INDEX IF NOT EXISTS idx_producoes_status ON producoes(status);
CREATE INDEX IF NOT EXISTS idx_producoes_responsavel ON producoes(responsavel);
CREATE INDEX IF NOT EXISTS idx_saldos_estoque_quantidade ON saldos_estoque(quantidade_atual);