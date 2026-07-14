/*
  # Create vw_fichas_completas view

  1. New View
    - `vw_fichas_completas`
      - Comprehensive view of technical sheets with ingredients
      - Aggregated ingredient data as JSON
      - Calculated total costs
      - Production history count

  2. Security
    - Enable RLS on all tables
    - Add policies for anonymous access (development mode)

  3. Sample Data
    - Insert sample technical sheets
    - Insert sample ingredients
    - Link ingredients to sheets
*/

-- Create vw_fichas_completas view
CREATE OR REPLACE VIEW public.vw_fichas_completas AS
SELECT 
  ft.id AS ficha_id,
  ft.nome AS nome_ficha,
  ft.porcoes,
  ft.custo_total AS custo_estimado,
  ft.criado_em,
  COALESCE(
    json_agg(
      json_build_object(
        'id', fi.id,
        'insumo_id', fi.insumo_id,
        'nome_insumo', i.nome,
        'quantidade', fi.quantidade,
        'unidade', i.unidade,
        'custo_unitario', COALESCE(i.estoque_atual * 0.5, 5.0),
        'custo_total', fi.quantidade * COALESCE(i.estoque_atual * 0.5, 5.0)
      ) ORDER BY i.nome
    ) FILTER (WHERE fi.id IS NOT NULL),
    '[]'::json
  ) AS ingredientes,
  COALESCE(
    SUM(fi.quantidade * COALESCE(i.estoque_atual * 0.5, 5.0)),
    0
  ) AS custo_total_calculado,
  COUNT(DISTINCT p.id) AS total_producoes
FROM fichas_tecnicas ft
LEFT JOIN ficha_ingredientes fi ON fi.ficha_id = ft.id
LEFT JOIN insumos i ON i.id = fi.insumo_id
LEFT JOIN producoes p ON p.ficha_id = ft.id
GROUP BY ft.id, ft.nome, ft.porcoes, ft.custo_total, ft.criado_em;

-- Ensure tables exist with proper structure
CREATE TABLE IF NOT EXISTS public.fichas_tecnicas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  porcoes integer DEFAULT 1,
  custo_total numeric DEFAULT 0,
  criado_em timestamp DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ficha_ingredientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ficha_id uuid REFERENCES fichas_tecnicas(id) ON DELETE CASCADE,
  insumo_id uuid REFERENCES insumos(id) ON DELETE CASCADE,
  quantidade numeric NOT NULL DEFAULT 0
);

-- Enable RLS
ALTER TABLE fichas_tecnicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ficha_ingredientes ENABLE ROW LEVEL SECURITY;

-- Create policies for development (allow all operations)
CREATE POLICY "Allow all operations on fichas_tecnicas"
  ON fichas_tecnicas
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on ficha_ingredientes"
  ON ficha_ingredientes
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Insert sample data if tables are empty
DO $$
BEGIN
  -- Check if fichas_tecnicas has data
  IF NOT EXISTS (SELECT 1 FROM fichas_tecnicas LIMIT 1) THEN
    -- Insert sample technical sheets
    INSERT INTO fichas_tecnicas (id, nome, porcoes, custo_total) VALUES
    ('550e8400-e29b-41d4-a716-446655440001', 'Caipirinha Tradicional', 1, 8.50),
    ('550e8400-e29b-41d4-a716-446655440002', 'Batata Frita Especial', 4, 12.00),
    ('550e8400-e29b-41d4-a716-446655440003', 'Hambúrguer Artesanal', 1, 25.00),
    ('550e8400-e29b-41d4-a716-446655440004', 'Mousse de Chocolate', 6, 18.00);

    -- Check if we have insumos to link
    IF EXISTS (SELECT 1 FROM insumos LIMIT 1) THEN
      -- Get some insumo IDs for linking
      INSERT INTO ficha_ingredientes (ficha_id, insumo_id, quantidade)
      SELECT 
        '550e8400-e29b-41d4-a716-446655440001',
        i.id,
        CASE 
          WHEN i.nome ILIKE '%vodka%' OR i.nome ILIKE '%cachaça%' THEN 0.06
          WHEN i.nome ILIKE '%limão%' OR i.nome ILIKE '%lima%' THEN 1.0
          WHEN i.nome ILIKE '%açúcar%' THEN 0.02
          ELSE 0.1
        END
      FROM insumos i 
      WHERE i.nome ILIKE ANY(ARRAY['%vodka%', '%cachaça%', '%limão%', '%lima%', '%açúcar%'])
      LIMIT 3;

      INSERT INTO ficha_ingredientes (ficha_id, insumo_id, quantidade)
      SELECT 
        '550e8400-e29b-41d4-a716-446655440002',
        i.id,
        CASE 
          WHEN i.nome ILIKE '%batata%' THEN 0.5
          WHEN i.nome ILIKE '%óleo%' THEN 0.1
          WHEN i.nome ILIKE '%sal%' THEN 0.01
          ELSE 0.05
        END
      FROM insumos i 
      WHERE i.nome ILIKE ANY(ARRAY['%batata%', '%óleo%', '%sal%'])
      LIMIT 3;
    END IF;
  END IF;
END $$;