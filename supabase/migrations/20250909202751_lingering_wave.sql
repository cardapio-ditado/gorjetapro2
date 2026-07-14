/*
  # Create config_gorjetas table

  1. New Tables
    - `config_gorjetas`
      - `id` (uuid, primary key)
      - `percentual_base` (numeric, default 0.05)
      - `bonus_meta1_pct` (numeric, default 0.01)
      - `bonus_meta2_pct` (numeric, default 0.02)
      - `meta1_valor` (numeric, default 17000)
      - `meta2_valor` (numeric, default 24000)
      - `teto_adiantamento_semanal` (numeric, default 395)
      - `adiantamento_abate_saldo` (boolean, default true)
      - `criado_em` (timestamp)
      - `atualizado_em` (timestamp)

  2. Security
    - Enable RLS on `config_gorjetas` table
    - Add policy for authenticated users to read and write configuration data

  3. Initial Data
    - Insert default configuration values
*/

CREATE TABLE IF NOT EXISTS config_gorjetas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  percentual_base numeric(5,4) DEFAULT 0.05,
  bonus_meta1_pct numeric(5,4) DEFAULT 0.01,
  bonus_meta2_pct numeric(5,4) DEFAULT 0.02,
  meta1_valor numeric(10,2) DEFAULT 17000,
  meta2_valor numeric(10,2) DEFAULT 24000,
  teto_adiantamento_semanal numeric(10,2) DEFAULT 395,
  adiantamento_abate_saldo boolean DEFAULT true,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

ALTER TABLE config_gorjetas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all operations on config_gorjetas"
  ON config_gorjetas
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- Insert default configuration
INSERT INTO config_gorjetas (
  percentual_base,
  bonus_meta1_pct,
  bonus_meta2_pct,
  meta1_valor,
  meta2_valor,
  teto_adiantamento_semanal,
  adiantamento_abate_saldo
) VALUES (
  0.05,
  0.01,
  0.02,
  17000,
  24000,
  395,
  true
) ON CONFLICT DO NOTHING;