/*
  # Create descontos_consumo table

  1. New Tables
    - `descontos_consumo`
      - `id` (uuid, primary key)
      - `colaborador_id` (uuid, foreign key to colaboradores)
      - `data_desconto` (date)
      - `valor_desconto` (numeric)
      - `tipo_consumo` (text)
      - `descricao` (text)
      - `observacoes` (text)
      - `criado_em` (timestamp)
      - `atualizado_em` (timestamp)
      - `criado_por` (uuid)

  2. Security
    - Enable RLS on `descontos_consumo` table
    - Add policy for authenticated users to manage all data

  3. Indexes
    - Index on colaborador_id for performance
    - Index on data_desconto for date filtering
*/

CREATE TABLE IF NOT EXISTS descontos_consumo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  data_desconto date NOT NULL,
  valor_desconto numeric(10,2) NOT NULL CHECK (valor_desconto > 0),
  tipo_consumo text NOT NULL CHECK (tipo_consumo IN ('refeicao', 'bebida', 'lanche', 'cafe', 'outros')),
  descricao text NOT NULL,
  observacoes text,
  criado_em timestamp with time zone DEFAULT now(),
  atualizado_em timestamp with time zone DEFAULT now(),
  criado_por uuid
);

-- Enable RLS
ALTER TABLE descontos_consumo ENABLE ROW LEVEL SECURITY;

-- Create policy for all operations
CREATE POLICY "Allow all operations on descontos_consumo"
  ON descontos_consumo
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_descontos_consumo_colaborador 
  ON descontos_consumo(colaborador_id);

CREATE INDEX IF NOT EXISTS idx_descontos_consumo_data 
  ON descontos_consumo(data_desconto);

CREATE INDEX IF NOT EXISTS idx_descontos_consumo_tipo 
  ON descontos_consumo(tipo_consumo);

-- Create trigger to update timestamp
CREATE OR REPLACE FUNCTION atualizar_timestamp_descontos()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_descontos_consumo_update
  BEFORE UPDATE ON descontos_consumo
  FOR EACH ROW
  EXECUTE FUNCTION atualizar_timestamp_descontos();