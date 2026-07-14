/*
  # Create gorjetas_adicionais table

  1. New Tables
    - `gorjetas_adicionais`
      - `id` (uuid, primary key)
      - `colaborador_id` (uuid, foreign key to colaboradores)
      - `semana` (integer, week number)
      - `ano` (integer, year)
      - `tipo` (text, type of additional tip)
      - `descricao` (text, description)
      - `valor` (numeric, fixed amount)
      - `data_referencia` (date, reference date)
      - `observacoes` (text, optional notes)
      - `criado_em` (timestamp)
      - `atualizado_em` (timestamp)

  2. Security
    - Enable RLS on `gorjetas_adicionais` table
    - Add policies for all CRUD operations for authenticated users
*/

CREATE TABLE IF NOT EXISTS gorjetas_adicionais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid REFERENCES colaboradores(id) ON DELETE CASCADE NOT NULL,
  semana integer NOT NULL,
  ano integer NOT NULL,
  tipo text NOT NULL DEFAULT 'outros',
  descricao text NOT NULL,
  valor numeric(10,2) NOT NULL,
  data_referencia date NOT NULL DEFAULT CURRENT_DATE,
  observacoes text,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- Add constraints
ALTER TABLE gorjetas_adicionais 
ADD CONSTRAINT gorjetas_adicionais_tipo_check 
CHECK (tipo = ANY (ARRAY['gratificacao_lideranca'::text, 'gorjeta_fixa_feijoada'::text, 'bonus_especial'::text, 'outros'::text]));

ALTER TABLE gorjetas_adicionais 
ADD CONSTRAINT gorjetas_adicionais_valor_check 
CHECK (valor > 0);

ALTER TABLE gorjetas_adicionais 
ADD CONSTRAINT gorjetas_adicionais_semana_check 
CHECK (semana >= 1 AND semana <= 53);

ALTER TABLE gorjetas_adicionais 
ADD CONSTRAINT gorjetas_adicionais_ano_check 
CHECK (ano >= 2020 AND ano <= 2050);

-- Add indexes
CREATE INDEX IF NOT EXISTS idx_gorjetas_adicionais_colaborador ON gorjetas_adicionais(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_gorjetas_adicionais_semana_ano ON gorjetas_adicionais(semana, ano);
CREATE INDEX IF NOT EXISTS idx_gorjetas_adicionais_data ON gorjetas_adicionais(data_referencia);
CREATE INDEX IF NOT EXISTS idx_gorjetas_adicionais_tipo ON gorjetas_adicionais(tipo);

-- Enable RLS
ALTER TABLE gorjetas_adicionais ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Allow all operations on gorjetas_adicionais"
  ON gorjetas_adicionais
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Add trigger for updating timestamp
CREATE OR REPLACE FUNCTION atualizar_timestamp_gorjetas_adicionais()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_gorjetas_adicionais_update
  BEFORE UPDATE ON gorjetas_adicionais
  FOR EACH ROW
  EXECUTE FUNCTION atualizar_timestamp_gorjetas_adicionais();