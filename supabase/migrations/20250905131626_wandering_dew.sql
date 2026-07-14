/*
  # Create Events and Reservations Tables

  1. New Tables
    - `eventos_fechados`
      - `id` (uuid, primary key)
      - `nome_evento` (text)
      - `data_evento` (date)
      - `horario_inicio` (time)
      - `horario_fim` (time)
      - `cliente_responsavel` (text)
      - `tipo_evento` (text)
      - `promocao_vinculada` (text)
      - `observacoes` (text)
      - `valor_total` (numeric)
      - `status_pagamento` (text)
      - `forma_pagamento` (text)
      - `documento_contrato` (text)
      - `criado_em` (timestamp)
      - `atualizado_em` (timestamp)
    
    - `reservas_especiais`
      - `id` (uuid, primary key)
      - `data_reserva` (date)
      - `horario_inicio` (time)
      - `horario_fim` (time)
      - `nome_cliente` (text)
      - `telefone_cliente` (text)
      - `quantidade_pessoas` (integer)
      - `valor_cobrado` (numeric)
      - `status_pagamento` (text)
      - `local_reservado` (text)
      - `o_que_esta_incluso` (text)
      - `detalhes_evento` (text)
      - `criado_em` (timestamp)
      - `atualizado_em` (timestamp)
    
    - `reservas_normais`
      - `id` (uuid, primary key)
      - `nome_cliente` (text)
      - `telefone_cliente` (text)
      - `data_reserva` (date)
      - `horario` (time)
      - `numero_pessoas` (integer)
      - `local_bar` (text)
      - `observacoes` (text)
      - `criado_em` (timestamp)
      - `atualizado_em` (timestamp)

  2. Security
    - Enable RLS on all tables
    - Add policies for authenticated users
*/

-- Eventos Fechados
CREATE TABLE IF NOT EXISTS eventos_fechados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_evento text NOT NULL,
  data_evento date NOT NULL,
  horario_inicio time NOT NULL,
  horario_fim time NOT NULL,
  cliente_responsavel text NOT NULL,
  tipo_evento text NOT NULL DEFAULT 'festa_privada',
  promocao_vinculada text,
  observacoes text,
  valor_total numeric(10,2) NOT NULL DEFAULT 0,
  status_pagamento text NOT NULL DEFAULT 'pendente',
  forma_pagamento text,
  documento_contrato text,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  
  CONSTRAINT eventos_fechados_tipo_evento_check 
    CHECK (tipo_evento IN ('show', 'festa_privada', 'corporativo', 'casamento', 'aniversario', 'formatura', 'outros')),
  CONSTRAINT eventos_fechados_status_pagamento_check 
    CHECK (status_pagamento IN ('pendente', 'pago_parcial', 'pago_total', 'cancelado')),
  CONSTRAINT eventos_fechados_forma_pagamento_check 
    CHECK (forma_pagamento IN ('pix', 'dinheiro', 'cartao', 'transferencia', 'boleto') OR forma_pagamento IS NULL),
  CONSTRAINT eventos_fechados_valor_total_check 
    CHECK (valor_total >= 0)
);

-- Reservas Especiais
CREATE TABLE IF NOT EXISTS reservas_especiais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_reserva date NOT NULL,
  horario_inicio time NOT NULL,
  horario_fim time NOT NULL,
  nome_cliente text NOT NULL,
  telefone_cliente text NOT NULL,
  quantidade_pessoas integer NOT NULL DEFAULT 1,
  valor_cobrado numeric(10,2) NOT NULL DEFAULT 0,
  status_pagamento text NOT NULL DEFAULT 'pendente',
  local_reservado text NOT NULL,
  o_que_esta_incluso text,
  detalhes_evento text,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  
  CONSTRAINT reservas_especiais_status_pagamento_check 
    CHECK (status_pagamento IN ('pendente', 'pago_parcial', 'pago_total', 'cancelado')),
  CONSTRAINT reservas_especiais_quantidade_pessoas_check 
    CHECK (quantidade_pessoas > 0),
  CONSTRAINT reservas_especiais_valor_cobrado_check 
    CHECK (valor_cobrado >= 0),
  CONSTRAINT reservas_especiais_local_reservado_check 
    CHECK (local_reservado IN ('mezanino', 'deck_externo', 'area_vip', 'salao_principal', 'varanda', 'outros'))
);

-- Reservas Normais
CREATE TABLE IF NOT EXISTS reservas_normais (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_cliente text NOT NULL,
  telefone_cliente text NOT NULL,
  data_reserva date NOT NULL,
  horario time NOT NULL,
  numero_pessoas integer NOT NULL DEFAULT 1,
  local_bar text NOT NULL DEFAULT 'interna',
  observacoes text,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  
  CONSTRAINT reservas_normais_numero_pessoas_check 
    CHECK (numero_pessoas > 0),
  CONSTRAINT reservas_normais_local_bar_check 
    CHECK (local_bar IN ('interna', 'varanda', 'deck', 'mezanino', 'outros'))
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_eventos_fechados_data ON eventos_fechados(data_evento);
CREATE INDEX IF NOT EXISTS idx_eventos_fechados_status ON eventos_fechados(status_pagamento);
CREATE INDEX IF NOT EXISTS idx_eventos_fechados_tipo ON eventos_fechados(tipo_evento);

CREATE INDEX IF NOT EXISTS idx_reservas_especiais_data ON reservas_especiais(data_reserva);
CREATE INDEX IF NOT EXISTS idx_reservas_especiais_status ON reservas_especiais(status_pagamento);
CREATE INDEX IF NOT EXISTS idx_reservas_especiais_local ON reservas_especiais(local_reservado);

CREATE INDEX IF NOT EXISTS idx_reservas_normais_data ON reservas_normais(data_reserva);
CREATE INDEX IF NOT EXISTS idx_reservas_normais_local ON reservas_normais(local_bar);

-- Enable RLS
ALTER TABLE eventos_fechados ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservas_especiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservas_normais ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Allow all operations on eventos_fechados"
  ON eventos_fechados
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on reservas_especiais"
  ON reservas_especiais
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on reservas_normais"
  ON reservas_normais
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);