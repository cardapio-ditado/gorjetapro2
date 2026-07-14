/*
  # Fix RLS policies for inventory tables

  1. Security Updates
    - Update RLS policies to allow anonymous access for development
    - Ensure all inventory tables have proper policies
    - Allow INSERT, UPDATE, DELETE operations for anon role

  2. Tables affected
    - estoques
    - itens_estoque
    - saldos_estoque
    - movimentacoes_estoque
    - entradas_compras
    - itens_entrada_compra
    - producoes
*/

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can manage estoques" ON estoques;
DROP POLICY IF EXISTS "Users can read estoques" ON estoques;
DROP POLICY IF EXISTS "Users can manage itens_estoque" ON itens_estoque;
DROP POLICY IF EXISTS "Users can read itens_estoque" ON itens_estoque;
DROP POLICY IF EXISTS "Users can manage saldos_estoque" ON saldos_estoque;
DROP POLICY IF EXISTS "Users can read saldos_estoque" ON saldos_estoque;
DROP POLICY IF EXISTS "Users can manage movimentacoes_estoque" ON movimentacoes_estoque;
DROP POLICY IF EXISTS "Users can read movimentacoes_estoque" ON movimentacoes_estoque;
DROP POLICY IF EXISTS "Users can manage entradas_compras" ON entradas_compras;
DROP POLICY IF EXISTS "Users can read entradas_compras" ON entradas_compras;
DROP POLICY IF EXISTS "Users can manage itens_entrada_compra" ON itens_entrada_compra;
DROP POLICY IF EXISTS "Users can read itens_entrada_compra" ON itens_entrada_compra;

-- Create permissive policies for development (allow anon access)
CREATE POLICY "Allow all operations on estoques"
  ON estoques
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on itens_estoque"
  ON itens_estoque
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on saldos_estoque"
  ON saldos_estoque
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on movimentacoes_estoque"
  ON movimentacoes_estoque
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on entradas_compras"
  ON entradas_compras
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on itens_entrada_compra"
  ON itens_entrada_compra
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Ensure producoes table has RLS enabled and policy
ALTER TABLE producoes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on producoes"
  ON producoes
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);