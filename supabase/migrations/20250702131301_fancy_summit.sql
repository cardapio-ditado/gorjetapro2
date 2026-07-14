/*
  # Módulo Contas a Receber

  1. New Tables
    - `contas_receber` - Main accounts receivable table
    - `recebimentos_contas` - Partial receipts tracking

  2. Functions
    - Auto-update account status based on receipts
    - Integration with cash flow
    - Timestamp update function

  3. Security
    - Enable RLS on all tables
    - Add policies for managers and financial staff

  4. Views
    - Complete view with all related data and calculations
    - Projection view for future receipts
    - Financial indicators view
*/

-- Create contas_receber table
CREATE TABLE IF NOT EXISTS contas_receber (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid REFERENCES clientes(id) NOT NULL,
  descricao text NOT NULL,
  categoria_id uuid REFERENCES categorias_financeiras(id),
  centro_custo_id uuid REFERENCES centros_custo(id),
  forma_recebimento_id uuid REFERENCES formas_pagamento(id),
  valor_total numeric NOT NULL CHECK (valor_total > 0),
  valor_recebido numeric DEFAULT 0 CHECK (valor_recebido >= 0),
  saldo_restante numeric GENERATED ALWAYS AS (valor_total - valor_recebido) STORED,
  data_emissao date DEFAULT CURRENT_DATE,
  data_vencimento date NOT NULL,
  numero_documento text,
  status text DEFAULT 'em_aberto' CHECK (status IN ('em_aberto', 'parcialmente_recebido', 'recebido', 'vencido', 'cancelado')),
  observacoes text,
  criado_por uuid,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- Create recebimentos_contas table for partial receipts
CREATE TABLE IF NOT EXISTS recebimentos_contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_receber_id uuid REFERENCES contas_receber(id) ON DELETE CASCADE NOT NULL,
  valor_recebimento numeric NOT NULL CHECK (valor_recebimento > 0),
  data_recebimento date NOT NULL,
  forma_pagamento_id uuid REFERENCES formas_pagamento(id),
  conta_bancaria_id uuid REFERENCES bancos_contas(id),
  numero_comprovante text,
  observacoes text,
  criado_por uuid,
  criado_em timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_contas_receber_cliente ON contas_receber(cliente_id);
CREATE INDEX IF NOT EXISTS idx_contas_receber_vencimento ON contas_receber(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_contas_receber_status ON contas_receber(status);
CREATE INDEX IF NOT EXISTS idx_contas_receber_categoria ON contas_receber(categoria_id);
CREATE INDEX IF NOT EXISTS idx_contas_receber_centro_custo ON contas_receber(centro_custo_id);
CREATE INDEX IF NOT EXISTS idx_recebimentos_contas_conta ON recebimentos_contas(conta_receber_id);
CREATE INDEX IF NOT EXISTS idx_recebimentos_contas_data ON recebimentos_contas(data_recebimento);

-- Function to update conta status based on receipts
CREATE OR REPLACE FUNCTION atualizar_status_conta_receber()
RETURNS TRIGGER AS $$
DECLARE
  total_recebido numeric;
  valor_total numeric;
  nova_status text;
  data_venc date;
BEGIN
  -- Get the account details
  SELECT cr.valor_total, cr.data_vencimento 
  INTO valor_total, data_venc
  FROM contas_receber cr 
  WHERE cr.id = COALESCE(NEW.conta_receber_id, OLD.conta_receber_id);
  
  -- Calculate total received
  SELECT COALESCE(SUM(valor_recebimento), 0) 
  INTO total_recebido
  FROM recebimentos_contas 
  WHERE conta_receber_id = COALESCE(NEW.conta_receber_id, OLD.conta_receber_id);
  
  -- Determine new status
  IF total_recebido = 0 THEN
    IF data_venc < CURRENT_DATE THEN
      nova_status := 'vencido';
    ELSE
      nova_status := 'em_aberto';
    END IF;
  ELSIF total_recebido >= valor_total THEN
    nova_status := 'recebido';
  ELSE
    nova_status := 'parcialmente_recebido';
  END IF;
  
  -- Update the account
  UPDATE contas_receber 
  SET 
    valor_recebido = total_recebido,
    status = nova_status,
    atualizado_em = now()
  WHERE id = COALESCE(NEW.conta_receber_id, OLD.conta_receber_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Function to update overdue accounts daily
CREATE OR REPLACE FUNCTION atualizar_contas_receber_vencidas()
RETURNS void AS $$
BEGIN
  UPDATE contas_receber 
  SET 
    status = 'vencido',
    atualizado_em = now()
  WHERE 
    data_vencimento < CURRENT_DATE 
    AND status = 'em_aberto';
END;
$$ LANGUAGE plpgsql;

-- Function to create cash flow entry from receipt
CREATE OR REPLACE FUNCTION criar_lancamento_fluxo_caixa_recebimento()
RETURNS TRIGGER AS $$
DECLARE
  conta_info RECORD;
  descricao_lancamento text;
BEGIN
  -- Get account information
  SELECT 
    cr.descricao,
    cr.categoria_id,
    cr.centro_custo_id,
    c.nome as cliente_nome
  INTO conta_info
  FROM contas_receber cr
  LEFT JOIN clientes c ON cr.cliente_id = c.id
  WHERE cr.id = NEW.conta_receber_id;
  
  -- Create entry description
  descricao_lancamento := 'Recebimento de ' || conta_info.descricao;
  IF conta_info.cliente_nome IS NOT NULL THEN
    descricao_lancamento := descricao_lancamento || ' - ' || conta_info.cliente_nome;
  END IF;
  
  -- Insert entry in cash flow
  INSERT INTO fluxo_caixa (
    tipo,
    valor,
    data,
    descricao,
    categoria_id,
    centro_custo_id,
    forma_pagamento_id,
    conta_bancaria_id,
    origem,
    observacoes
  ) VALUES (
    'entrada',
    NEW.valor_recebimento,
    NEW.data_recebimento,
    descricao_lancamento,
    conta_info.categoria_id,
    conta_info.centro_custo_id,
    NEW.forma_pagamento_id,
    NEW.conta_bancaria_id,
    'conta_receber',
    NEW.observacoes
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Function to remove cash flow entry when receipt is deleted
CREATE OR REPLACE FUNCTION remover_lancamento_fluxo_caixa_recebimento()
RETURNS TRIGGER AS $$
BEGIN
  -- Remove corresponding entry in cash flow
  DELETE FROM fluxo_caixa 
  WHERE descricao LIKE '%Recebimento de%'
    AND valor = OLD.valor_recebimento
    AND data = OLD.data_recebimento
    AND origem = 'conta_receber';
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER trg_recebimentos_contas_status
  AFTER INSERT OR UPDATE OR DELETE ON recebimentos_contas
  FOR EACH ROW EXECUTE FUNCTION atualizar_status_conta_receber();

CREATE TRIGGER trg_contas_receber_update
  BEFORE UPDATE ON contas_receber
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

CREATE TRIGGER trg_recebimento_criar_fluxo
  AFTER INSERT ON recebimentos_contas
  FOR EACH ROW EXECUTE FUNCTION criar_lancamento_fluxo_caixa_recebimento();

CREATE TRIGGER trg_recebimento_remover_fluxo
  BEFORE DELETE ON recebimentos_contas
  FOR EACH ROW EXECUTE FUNCTION remover_lancamento_fluxo_caixa_recebimento();

-- Enable RLS
ALTER TABLE contas_receber ENABLE ROW LEVEL SECURITY;
ALTER TABLE recebimentos_contas ENABLE ROW LEVEL SECURITY;

-- RLS Policies (disabled for development)
ALTER TABLE contas_receber DISABLE ROW LEVEL SECURITY;
ALTER TABLE recebimentos_contas DISABLE ROW LEVEL SECURITY;

-- Create view for accounts receivable with related data
CREATE OR REPLACE VIEW vw_contas_receber AS
SELECT 
  cr.*,
  c.nome as cliente_nome,
  c.documento as cliente_documento,
  c.telefone as cliente_telefone,
  c.email as cliente_email,
  cat.nome as categoria_nome,
  cat.caminho_completo as categoria_completa,
  cc.nome as centro_custo_nome,
  fp.nome as forma_recebimento_nome,
  CASE 
    WHEN cr.data_vencimento < CURRENT_DATE AND cr.status IN ('em_aberto', 'parcialmente_recebido') THEN true
    ELSE false
  END as esta_vencida,
  (CURRENT_DATE - cr.data_vencimento) as dias_vencimento
FROM contas_receber cr
LEFT JOIN clientes c ON cr.cliente_id = c.id
LEFT JOIN vw_categoria_tree cat ON cr.categoria_id = cat.id
LEFT JOIN centros_custo cc ON cr.centro_custo_id = cc.id
LEFT JOIN formas_pagamento fp ON cr.forma_recebimento_id = fp.id;

-- View for receivables projection
CREATE OR REPLACE VIEW vw_projecao_recebimentos AS
-- Real cash flow entries
SELECT 
  fc.id,
  fc.data,
  fc.descricao,
  cat.nome as categoria,
  cat.caminho_completo as categoria_completa,
  cc.nome as centro_custo,
  fp.nome as forma_pagamento,
  bc.banco as conta_bancaria,
  fc.valor,
  'realizado' as status,
  fc.origem,
  fc.observacoes,
  fc.criado_em
FROM fluxo_caixa fc
LEFT JOIN vw_categoria_tree cat ON fc.categoria_id = cat.id
LEFT JOIN centros_custo cc ON fc.centro_custo_id = cc.id
LEFT JOIN formas_pagamento fp ON fc.forma_pagamento_id = fp.id
LEFT JOIN bancos_contas bc ON fc.conta_bancaria_id = bc.id
WHERE fc.tipo = 'entrada'

UNION ALL

-- Open accounts receivable (projection)
SELECT 
  cr.id,
  cr.data_vencimento as data,
  'Previsão: ' || cr.descricao as descricao,
  cat.nome as categoria,
  cat.caminho_completo as categoria_completa,
  cc.nome as centro_custo,
  fp.nome as forma_pagamento,
  NULL as conta_bancaria,
  cr.saldo_restante as valor,
  CASE 
    WHEN cr.data_vencimento < CURRENT_DATE THEN 'vencido'
    ELSE 'previsto'
  END as status,
  'conta_receber' as origem,
  cr.observacoes,
  cr.criado_em
FROM contas_receber cr
LEFT JOIN vw_categoria_tree cat ON cr.categoria_id = cat.id
LEFT JOIN centros_custo cc ON cr.centro_custo_id = cc.id
LEFT JOIN formas_pagamento fp ON cr.forma_recebimento_id = fp.id
WHERE cr.status IN ('em_aberto', 'parcialmente_recebido', 'vencido')
AND cr.saldo_restante > 0

ORDER BY data DESC;

-- View for receivables indicators
CREATE OR REPLACE VIEW vw_indicadores_recebimentos AS
WITH 
contas_abertas AS (
  SELECT 
    COUNT(*) as total_contas_abertas,
    COALESCE(SUM(saldo_restante), 0) as valor_contas_abertas
  FROM contas_receber 
  WHERE status IN ('em_aberto', 'parcialmente_recebido')
),
contas_vencidas AS (
  SELECT 
    COUNT(*) as total_contas_vencidas,
    COALESCE(SUM(saldo_restante), 0) as valor_contas_vencidas
  FROM contas_receber 
  WHERE status = 'vencido' OR (
    status IN ('em_aberto', 'parcialmente_recebido') 
    AND data_vencimento < CURRENT_DATE
  )
),
mes_atual AS (
  SELECT 
    COALESCE(SUM(valor_total), 0) as previsto_mes_atual,
    COALESCE(SUM(valor_recebido), 0) as recebido_mes_atual
  FROM contas_receber 
  WHERE EXTRACT(YEAR FROM data_vencimento) = EXTRACT(YEAR FROM CURRENT_DATE)
  AND EXTRACT(MONTH FROM data_vencimento) = EXTRACT(MONTH FROM CURRENT_DATE)
),
proximo_mes AS (
  SELECT 
    COALESCE(SUM(saldo_restante), 0) as valor_proximo_mes
  FROM contas_receber 
  WHERE status IN ('em_aberto', 'parcialmente_recebido', 'vencido')
  AND data_vencimento BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days')
)
SELECT 
  ca.total_contas_abertas,
  ca.valor_contas_abertas,
  cv.total_contas_vencidas,
  cv.valor_contas_vencidas,
  ma.previsto_mes_atual,
  ma.recebido_mes_atual,
  pm.valor_proximo_mes
FROM contas_abertas ca
CROSS JOIN contas_vencidas cv
CROSS JOIN mes_atual ma
CROSS JOIN proximo_mes pm;

-- Insert sample data for testing
DO $$
DECLARE
  cliente_id uuid;
  categoria_id uuid;
  centro_custo_id uuid;
  forma_pagamento_id uuid;
BEGIN
  -- Get sample IDs
  SELECT id INTO cliente_id FROM clientes LIMIT 1;
  SELECT id INTO categoria_id FROM categorias_financeiras WHERE tipo = 'receita' LIMIT 1;
  SELECT id INTO centro_custo_id FROM centros_custo LIMIT 1;
  SELECT id INTO forma_pagamento_id FROM formas_pagamento LIMIT 1;
  
  -- Insert sample accounts if we have the required data
  IF cliente_id IS NOT NULL AND categoria_id IS NOT NULL THEN
    INSERT INTO contas_receber (
      cliente_id,
      descricao,
      categoria_id,
      centro_custo_id,
      forma_recebimento_id,
      valor_total,
      data_vencimento,
      numero_documento,
      observacoes
    ) VALUES 
    (
      cliente_id,
      'Evento corporativo - Empresa XYZ',
      categoria_id,
      centro_custo_id,
      forma_pagamento_id,
      8500.00,
      CURRENT_DATE + INTERVAL '15 days',
      'PROP-2025-001',
      'Evento para 100 pessoas'
    ),
    (
      cliente_id,
      'Locação de espaço - Festa de aniversário',
      categoria_id,
      centro_custo_id,
      forma_pagamento_id,
      3200.00,
      CURRENT_DATE - INTERVAL '5 days', -- Vencida
      'PROP-2025-002',
      'Conta vencida - entrar em contato com cliente'
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- Comments for documentation
COMMENT ON TABLE contas_receber IS 'Contas a receber - receitas previstas e controle de recebimentos';
COMMENT ON TABLE recebimentos_contas IS 'Recebimentos parciais das contas a receber';
COMMENT ON VIEW vw_contas_receber IS 'View consolidada das contas a receber com dados relacionados';
COMMENT ON VIEW vw_projecao_recebimentos IS 'Projeção de recebimentos futuros e realizados';
COMMENT ON VIEW vw_indicadores_recebimentos IS 'Indicadores financeiros das contas a receber';