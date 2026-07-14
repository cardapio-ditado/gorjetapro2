/*
  # Sistema de Estoque Avançado

  1. New Tables
    - `estoques`
      - `id` (uuid, primary key)
      - `nome` (text, required)
      - `descricao` (text, optional)
      - `localizacao` (text, optional)
      - `tipo` (text, enum: central, producao, secundario, geral)
      - `status` (text, enum: ativo, inativo)
      - `criado_em` (timestamp)
      - `atualizado_em` (timestamp)

    - `itens_estoque`
      - `id` (uuid, primary key)
      - `codigo` (text, optional)
      - `nome` (text, required)
      - `descricao` (text, optional)
      - `tipo_item` (text, enum: insumo, produto_final)
      - `categoria` (text, required)
      - `unidade_medida` (text, required)
      - `estoque_minimo` (numeric, default 0)
      - `ponto_reposicao` (numeric, default 0)
      - `custo_medio` (numeric, default 0)
      - `tem_validade` (boolean, default false)
      - `observacoes` (text, optional)
      - `status` (text, enum: ativo, inativo)
      - `criado_em` (timestamp)
      - `atualizado_em` (timestamp)

    - `saldos_estoque`
      - `id` (uuid, primary key)
      - `estoque_id` (uuid, foreign key)
      - `item_id` (uuid, foreign key)
      - `quantidade_atual` (numeric, default 0)
      - `valor_total` (numeric, default 0)
      - `data_ultima_movimentacao` (timestamp)
      - `atualizado_em` (timestamp)

    - `movimentacoes_estoque`
      - `id` (uuid, primary key)
      - `estoque_origem_id` (uuid, foreign key, optional)
      - `estoque_destino_id` (uuid, foreign key, optional)
      - `item_id` (uuid, foreign key)
      - `tipo_movimentacao` (text, enum: entrada, saida, transferencia, ajuste)
      - `quantidade` (numeric, required)
      - `custo_unitario` (numeric, required)
      - `custo_total` (numeric, required)
      - `data_movimentacao` (timestamp, required)
      - `motivo` (text, optional)
      - `observacoes` (text, optional)
      - `criado_por` (uuid, optional)
      - `criado_em` (timestamp)

    - `entradas_compras`
      - `id` (uuid, primary key)
      - `fornecedor_id` (uuid, foreign key, optional)
      - `numero_documento` (text, optional)
      - `data_compra` (date, required)
      - `estoque_destino_id` (uuid, foreign key)
      - `valor_total` (numeric, required)
      - `observacoes` (text, optional)
      - `status` (text, enum: pendente, recebido, cancelado)
      - `criado_por` (uuid, optional)
      - `criado_em` (timestamp)

    - `itens_entrada_compra`
      - `id` (uuid, primary key)
      - `entrada_compra_id` (uuid, foreign key)
      - `item_id` (uuid, foreign key)
      - `quantidade` (numeric, required)
      - `custo_unitario` (numeric, required)
      - `custo_total` (numeric, required)
      - `data_validade` (date, optional)

  2. Views
    - `vw_estoque_atual` - Saldos atuais com informações dos itens
    - `vw_movimentacoes_detalhadas` - Movimentações com detalhes dos itens

  3. Security
    - Enable RLS on all tables
    - Add policies for authenticated users

  4. Changes
    - Add missing `data_producao` column to existing `producoes` table
*/

-- Create estoques table
CREATE TABLE IF NOT EXISTS estoques (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  localizacao text,
  tipo text NOT NULL DEFAULT 'geral',
  status text NOT NULL DEFAULT 'ativo',
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  
  CONSTRAINT estoques_tipo_check CHECK (tipo = ANY (ARRAY['central'::text, 'producao'::text, 'secundario'::text, 'geral'::text])),
  CONSTRAINT estoques_status_check CHECK (status = ANY (ARRAY['ativo'::text, 'inativo'::text]))
);

-- Create itens_estoque table
CREATE TABLE IF NOT EXISTS itens_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo text,
  nome text NOT NULL,
  descricao text,
  tipo_item text NOT NULL DEFAULT 'insumo',
  categoria text NOT NULL DEFAULT 'Geral',
  unidade_medida text NOT NULL DEFAULT 'unidade',
  estoque_minimo numeric DEFAULT 0,
  ponto_reposicao numeric DEFAULT 0,
  custo_medio numeric DEFAULT 0,
  tem_validade boolean DEFAULT false,
  observacoes text,
  status text NOT NULL DEFAULT 'ativo',
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  
  CONSTRAINT itens_estoque_tipo_item_check CHECK (tipo_item = ANY (ARRAY['insumo'::text, 'produto_final'::text])),
  CONSTRAINT itens_estoque_status_check CHECK (status = ANY (ARRAY['ativo'::text, 'inativo'::text])),
  CONSTRAINT itens_estoque_estoque_minimo_check CHECK (estoque_minimo >= 0),
  CONSTRAINT itens_estoque_ponto_reposicao_check CHECK (ponto_reposicao >= 0),
  CONSTRAINT itens_estoque_custo_medio_check CHECK (custo_medio >= 0)
);

-- Create saldos_estoque table
CREATE TABLE IF NOT EXISTS saldos_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estoque_id uuid NOT NULL REFERENCES estoques(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES itens_estoque(id) ON DELETE CASCADE,
  quantidade_atual numeric DEFAULT 0,
  valor_total numeric DEFAULT 0,
  data_ultima_movimentacao timestamptz,
  atualizado_em timestamptz DEFAULT now(),
  
  CONSTRAINT saldos_estoque_quantidade_check CHECK (quantidade_atual >= 0),
  CONSTRAINT saldos_estoque_valor_check CHECK (valor_total >= 0),
  UNIQUE(estoque_id, item_id)
);

-- Create movimentacoes_estoque table
CREATE TABLE IF NOT EXISTS movimentacoes_estoque (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estoque_origem_id uuid REFERENCES estoques(id),
  estoque_destino_id uuid REFERENCES estoques(id),
  item_id uuid NOT NULL REFERENCES itens_estoque(id) ON DELETE CASCADE,
  tipo_movimentacao text NOT NULL,
  quantidade numeric NOT NULL,
  custo_unitario numeric NOT NULL,
  custo_total numeric NOT NULL,
  data_movimentacao timestamptz NOT NULL DEFAULT now(),
  motivo text,
  observacoes text,
  criado_por uuid,
  criado_em timestamptz DEFAULT now(),
  
  CONSTRAINT movimentacoes_tipo_check CHECK (tipo_movimentacao = ANY (ARRAY['entrada'::text, 'saida'::text, 'transferencia'::text, 'ajuste'::text])),
  CONSTRAINT movimentacoes_quantidade_check CHECK (quantidade > 0),
  CONSTRAINT movimentacoes_custo_unitario_check CHECK (custo_unitario >= 0),
  CONSTRAINT movimentacoes_custo_total_check CHECK (custo_total >= 0)
);

-- Create entradas_compras table
CREATE TABLE IF NOT EXISTS entradas_compras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id uuid REFERENCES fornecedores(id),
  numero_documento text,
  data_compra date NOT NULL DEFAULT CURRENT_DATE,
  estoque_destino_id uuid NOT NULL REFERENCES estoques(id),
  valor_total numeric NOT NULL DEFAULT 0,
  observacoes text,
  status text NOT NULL DEFAULT 'pendente',
  criado_por uuid,
  criado_em timestamptz DEFAULT now(),
  
  CONSTRAINT entradas_compras_status_check CHECK (status = ANY (ARRAY['pendente'::text, 'recebido'::text, 'cancelado'::text])),
  CONSTRAINT entradas_compras_valor_check CHECK (valor_total >= 0)
);

-- Create itens_entrada_compra table
CREATE TABLE IF NOT EXISTS itens_entrada_compra (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entrada_compra_id uuid NOT NULL REFERENCES entradas_compras(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES itens_estoque(id) ON DELETE CASCADE,
  quantidade numeric NOT NULL,
  custo_unitario numeric NOT NULL,
  custo_total numeric NOT NULL,
  data_validade date,
  
  CONSTRAINT itens_entrada_quantidade_check CHECK (quantidade > 0),
  CONSTRAINT itens_entrada_custo_unitario_check CHECK (custo_unitario >= 0),
  CONSTRAINT itens_entrada_custo_total_check CHECK (custo_total >= 0)
);

-- Add missing column to producoes table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'producoes' AND column_name = 'data_producao'
  ) THEN
    ALTER TABLE producoes ADD COLUMN data_producao date DEFAULT CURRENT_DATE;
  END IF;
END $$;

-- Create view for current stock levels
CREATE OR REPLACE VIEW vw_estoque_atual AS
SELECT 
  e.id as estoque_id,
  e.nome as estoque_nome,
  e.tipo as estoque_tipo,
  i.id as item_id,
  i.codigo as item_codigo,
  i.nome as item_nome,
  i.categoria,
  i.unidade_medida,
  i.estoque_minimo,
  i.custo_medio,
  COALESCE(s.quantidade_atual, 0) as quantidade_atual,
  COALESCE(s.valor_total, 0) as valor_total,
  (COALESCE(s.quantidade_atual, 0) < i.estoque_minimo) as abaixo_minimo,
  s.data_ultima_movimentacao
FROM estoques e
CROSS JOIN itens_estoque i
LEFT JOIN saldos_estoque s ON s.estoque_id = e.id AND s.item_id = i.id
WHERE e.status = 'ativo' AND i.status = 'ativo'
ORDER BY e.nome, i.nome;

-- Create view for detailed movements
CREATE OR REPLACE VIEW vw_movimentacoes_detalhadas AS
SELECT 
  m.id,
  m.tipo_movimentacao,
  m.data_movimentacao,
  m.quantidade,
  m.custo_unitario,
  m.custo_total,
  m.motivo,
  m.observacoes,
  i.codigo as item_codigo,
  i.nome as item_nome,
  i.unidade_medida,
  eo.nome as estoque_origem_nome,
  ed.nome as estoque_destino_nome
FROM movimentacoes_estoque m
JOIN itens_estoque i ON i.id = m.item_id
LEFT JOIN estoques eo ON eo.id = m.estoque_origem_id
LEFT JOIN estoques ed ON ed.id = m.estoque_destino_id
ORDER BY m.data_movimentacao DESC;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_saldos_estoque_estoque ON saldos_estoque(estoque_id);
CREATE INDEX IF NOT EXISTS idx_saldos_estoque_item ON saldos_estoque(item_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_data ON movimentacoes_estoque(data_movimentacao);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_item ON movimentacoes_estoque(item_id);
CREATE INDEX IF NOT EXISTS idx_movimentacoes_tipo ON movimentacoes_estoque(tipo_movimentacao);
CREATE INDEX IF NOT EXISTS idx_entradas_compras_data ON entradas_compras(data_compra);
CREATE INDEX IF NOT EXISTS idx_entradas_compras_status ON entradas_compras(status);

-- Enable RLS on all tables
ALTER TABLE estoques ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE saldos_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimentacoes_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE entradas_compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE itens_entrada_compra ENABLE ROW LEVEL SECURITY;

-- Create policies for authenticated users
CREATE POLICY "Users can read estoques"
  ON estoques
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can manage estoques"
  ON estoques
  FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Users can read itens_estoque"
  ON itens_estoque
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can manage itens_estoque"
  ON itens_estoque
  FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Users can read saldos_estoque"
  ON saldos_estoque
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can manage saldos_estoque"
  ON saldos_estoque
  FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Users can read movimentacoes_estoque"
  ON movimentacoes_estoque
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can manage movimentacoes_estoque"
  ON movimentacoes_estoque
  FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Users can read entradas_compras"
  ON entradas_compras
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can manage entradas_compras"
  ON entradas_compras
  FOR ALL
  TO authenticated
  USING (true);

CREATE POLICY "Users can read itens_entrada_compra"
  ON itens_entrada_compra
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can manage itens_entrada_compra"
  ON itens_entrada_compra
  FOR ALL
  TO authenticated
  USING (true);

-- Insert sample data for testing
INSERT INTO estoques (nome, descricao, localizacao, tipo, status) VALUES
('Estoque Principal', 'Estoque central do bar', 'Térreo - Sala 1', 'central', 'ativo'),
('Estoque Cozinha', 'Estoque da área de produção', 'Cozinha', 'producao', 'ativo'),
('Estoque Bar', 'Estoque do balcão', 'Área do Bar', 'secundario', 'ativo')
ON CONFLICT DO NOTHING;

INSERT INTO itens_estoque (codigo, nome, descricao, tipo_item, categoria, unidade_medida, estoque_minimo, ponto_reposicao, custo_medio, tem_validade, status) VALUES
('VOD001', 'Vodka Premium', 'Vodka importada premium', 'insumo', 'Bebidas', 'garrafa', 5, 10, 89.90, false, 'ativo'),
('LIM001', 'Limão Tahiti', 'Limão fresco para drinks', 'insumo', 'Frutas', 'kg', 10, 20, 4.50, true, 'ativo'),
('COPO001', 'Copo Long Drink', 'Copo de vidro 350ml', 'insumo', 'Embalagens', 'unidade', 50, 100, 2.50, false, 'ativo'),
('CAIP001', 'Caipirinha', 'Caipirinha tradicional', 'produto_final', 'Drinks', 'unidade', 0, 0, 12.00, false, 'ativo')
ON CONFLICT DO NOTHING;

-- Insert sample stock balances
INSERT INTO saldos_estoque (estoque_id, item_id, quantidade_atual, valor_total, data_ultima_movimentacao)
SELECT 
  e.id,
  i.id,
  CASE 
    WHEN i.codigo = 'VOD001' THEN 3
    WHEN i.codigo = 'LIM001' THEN 15
    WHEN i.codigo = 'COPO001' THEN 75
    ELSE 0
  END,
  CASE 
    WHEN i.codigo = 'VOD001' THEN 269.70
    WHEN i.codigo = 'LIM001' THEN 67.50
    WHEN i.codigo = 'COPO001' THEN 187.50
    ELSE 0
  END,
  now() - interval '1 day'
FROM estoques e, itens_estoque i
WHERE e.nome = 'Estoque Principal'
ON CONFLICT (estoque_id, item_id) DO NOTHING;

-- Insert sample movements
INSERT INTO movimentacoes_estoque (estoque_destino_id, item_id, tipo_movimentacao, quantidade, custo_unitario, custo_total, data_movimentacao, motivo)
SELECT 
  e.id,
  i.id,
  'entrada',
  CASE 
    WHEN i.codigo = 'LIM001' THEN 5
    WHEN i.codigo = 'COPO001' THEN 25
    ELSE 1
  END,
  i.custo_medio,
  CASE 
    WHEN i.codigo = 'LIM001' THEN 22.50
    WHEN i.codigo = 'COPO001' THEN 62.50
    ELSE i.custo_medio
  END,
  now() - interval '2 hours',
  'Compra'
FROM estoques e, itens_estoque i
WHERE e.nome = 'Estoque Principal' AND i.codigo IN ('LIM001', 'COPO001')
ON CONFLICT DO NOTHING;