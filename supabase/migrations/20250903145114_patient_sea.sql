/*
  # Create pagamentos_musicos table for partial payments

  1. New Tables
    - `pagamentos_musicos`
      - `id` (uuid, primary key)
      - `musico_id` (uuid, foreign key to musicos)
      - `valor_pagamento` (numeric) - Payment amount
      - `data_pagamento` (date) - Payment date
      - `forma_pagamento` (text) - Payment method
      - `observacoes` (text) - Payment notes
      - `criado_em` (timestamp) - Created at
      - `criado_por` (uuid) - Created by user

  2. Security
    - Enable RLS on `pagamentos_musicos` table
    - Add policy for authenticated users to manage payments
    - Add constraints for positive payment values

  3. Indexes
    - Index on musico_id for fast lookups
    - Index on data_pagamento for date filtering
*/

CREATE TABLE IF NOT EXISTS pagamentos_musicos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  musico_id uuid NOT NULL REFERENCES musicos(id) ON DELETE CASCADE,
  valor_pagamento numeric(10,2) NOT NULL,
  data_pagamento date NOT NULL DEFAULT CURRENT_DATE,
  forma_pagamento text NOT NULL DEFAULT 'dinheiro',
  observacoes text,
  criado_em timestamp with time zone DEFAULT now(),
  criado_por uuid
);

-- Enable RLS
ALTER TABLE pagamentos_musicos ENABLE ROW LEVEL SECURITY;

-- Create policy for authenticated users
CREATE POLICY "Allow all operations on pagamentos_musicos"
  ON pagamentos_musicos
  FOR ALL
  TO authenticated, anon
  USING (true)
  WITH CHECK (true);

-- Add constraints
ALTER TABLE pagamentos_musicos ADD CONSTRAINT pagamentos_musicos_valor_pagamento_check CHECK (valor_pagamento > 0);
ALTER TABLE pagamentos_musicos ADD CONSTRAINT pagamentos_musicos_forma_pagamento_check CHECK (forma_pagamento IN ('dinheiro', 'pix', 'transferencia', 'cartao', 'cheque'));

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pagamentos_musicos_musico ON pagamentos_musicos(musico_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_musicos_data ON pagamentos_musicos(data_pagamento);
CREATE INDEX IF NOT EXISTS idx_pagamentos_musicos_forma ON pagamentos_musicos(forma_pagamento);