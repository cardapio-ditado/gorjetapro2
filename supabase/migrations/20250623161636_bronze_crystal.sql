/*
  # Contas a Pagar Module

  1. New Tables
    - `contas_pagar` - Main accounts payable table
    - `pagamentos_contas` - Partial payments tracking
    - `anexos_contas` - File attachments for accounts

  2. Functions
    - Auto-update account status based on payments
    - Update overdue accounts function
    - Timestamp update function

  3. Security
    - Enable RLS on all tables
    - Policies for managers and financial staff

  4. Views
    - Complete view with all related data and calculations
*/

-- Create function to update timestamps if it doesn't exist
CREATE OR REPLACE FUNCTION atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create contas_pagar table
CREATE TABLE IF NOT EXISTS contas_pagar (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id uuid REFERENCES fornecedores(id) NOT NULL,
  descricao text NOT NULL,
  categoria_id uuid REFERENCES categorias_financeiras(id),
  centro_custo_id uuid REFERENCES centros_custo(id),
  forma_pagamento_id uuid REFERENCES formas_pagamento(id),
  valor_total numeric NOT NULL CHECK (valor_total > 0),
  valor_pago numeric DEFAULT 0 CHECK (valor_pago >= 0),
  saldo_restante numeric GENERATED ALWAYS AS (valor_total - valor_pago) STORED,
  data_vencimento date NOT NULL,
  data_emissao date DEFAULT CURRENT_DATE,
  numero_documento text,
  status text DEFAULT 'em_aberto' CHECK (status IN ('em_aberto', 'parcialmente_pago', 'pago', 'vencido', 'cancelado')),
  aprovado_para_pagamento boolean DEFAULT false,
  aprovado_por uuid REFERENCES usuarios(id),
  data_aprovacao timestamptz,
  observacoes text,
  criado_por uuid REFERENCES usuarios(id),
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- Create pagamentos_contas table for partial payments
CREATE TABLE IF NOT EXISTS pagamentos_contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_pagar_id uuid REFERENCES contas_pagar(id) ON DELETE CASCADE NOT NULL,
  valor_pagamento numeric NOT NULL CHECK (valor_pagamento > 0),
  data_pagamento date NOT NULL,
  forma_pagamento_id uuid REFERENCES formas_pagamento(id),
  conta_bancaria_id uuid REFERENCES bancos_contas(id),
  numero_comprovante text,
  observacoes text,
  criado_por uuid REFERENCES usuarios(id),
  criado_em timestamptz DEFAULT now()
);

-- Create anexos_contas table for file attachments
CREATE TABLE IF NOT EXISTS anexos_contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_pagar_id uuid REFERENCES contas_pagar(id) ON DELETE CASCADE NOT NULL,
  nome_arquivo text NOT NULL,
  tipo_arquivo text,
  tamanho_arquivo integer,
  url_arquivo text NOT NULL,
  tipo_anexo text DEFAULT 'comprovante' CHECK (tipo_anexo IN ('comprovante', 'nota_fiscal', 'contrato', 'outros')),
  criado_por uuid REFERENCES usuarios(id),
  criado_em timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_contas_pagar_fornecedor ON contas_pagar(fornecedor_id);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_vencimento ON contas_pagar(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_status ON contas_pagar(status);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_categoria ON contas_pagar(categoria_id);
CREATE INDEX IF NOT EXISTS idx_contas_pagar_centro_custo ON contas_pagar(centro_custo_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_contas_conta ON pagamentos_contas(conta_pagar_id);
CREATE INDEX IF NOT EXISTS idx_pagamentos_contas_data ON pagamentos_contas(data_pagamento);
CREATE INDEX IF NOT EXISTS idx_anexos_contas_conta ON anexos_contas(conta_pagar_id);

-- Function to update conta status based on payments
CREATE OR REPLACE FUNCTION atualizar_status_conta_pagar()
RETURNS TRIGGER AS $$
DECLARE
  total_pago numeric;
  valor_total numeric;
  nova_status text;
  data_venc date;
BEGIN
  -- Get the account details
  SELECT cp.valor_total, cp.data_vencimento 
  INTO valor_total, data_venc
  FROM contas_pagar cp 
  WHERE cp.id = COALESCE(NEW.conta_pagar_id, OLD.conta_pagar_id);
  
  -- Calculate total paid
  SELECT COALESCE(SUM(valor_pagamento), 0) 
  INTO total_pago
  FROM pagamentos_contas 
  WHERE conta_pagar_id = COALESCE(NEW.conta_pagar_id, OLD.conta_pagar_id);
  
  -- Determine new status
  IF total_pago = 0 THEN
    IF data_venc < CURRENT_DATE THEN
      nova_status := 'vencido';
    ELSE
      nova_status := 'em_aberto';
    END IF;
  ELSIF total_pago >= valor_total THEN
    nova_status := 'pago';
  ELSE
    nova_status := 'parcialmente_pago';
  END IF;
  
  -- Update the account
  UPDATE contas_pagar 
  SET 
    valor_pago = total_pago,
    status = nova_status,
    atualizado_em = now()
  WHERE id = COALESCE(NEW.conta_pagar_id, OLD.conta_pagar_id);
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Function to update overdue accounts daily
CREATE OR REPLACE FUNCTION atualizar_contas_vencidas()
RETURNS void AS $$
BEGIN
  UPDATE contas_pagar 
  SET 
    status = 'vencido',
    atualizado_em = now()
  WHERE 
    data_vencimento < CURRENT_DATE 
    AND status = 'em_aberto';
END;
$$ LANGUAGE plpgsql;

-- Create triggers
CREATE TRIGGER trg_pagamentos_contas_status
  AFTER INSERT OR UPDATE OR DELETE ON pagamentos_contas
  FOR EACH ROW EXECUTE FUNCTION atualizar_status_conta_pagar();

CREATE TRIGGER trg_contas_pagar_update
  BEFORE UPDATE ON contas_pagar
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

-- Enable RLS
ALTER TABLE contas_pagar ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos_contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE anexos_contas ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Gerentes e financeiro podem gerenciar contas a pagar"
  ON contas_pagar FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'funcao'::text) = ANY (ARRAY['gerente'::text, 'financeiro'::text]));

CREATE POLICY "Gerentes e financeiro podem gerenciar pagamentos"
  ON pagamentos_contas FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'funcao'::text) = ANY (ARRAY['gerente'::text, 'financeiro'::text]));

CREATE POLICY "Gerentes e financeiro podem gerenciar anexos"
  ON anexos_contas FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'funcao'::text) = ANY (ARRAY['gerente'::text, 'financeiro'::text]));

-- Create view for accounts payable with related data
CREATE OR REPLACE VIEW vw_contas_pagar AS
SELECT 
  cp.*,
  f.nome as fornecedor_nome,
  f.categoria_padrao_id as fornecedor_categoria_padrao,
  cat.nome as categoria_nome,
  cat.caminho_completo as categoria_completa,
  cc.nome as centro_custo_nome,
  fp.nome as forma_pagamento_nome,
  u_criado.nome as criado_por_nome,
  u_aprovado.nome as aprovado_por_nome,
  CASE 
    WHEN cp.data_vencimento < CURRENT_DATE AND cp.status IN ('em_aberto', 'parcialmente_pago') THEN true
    ELSE false
  END as esta_vencida,
  (CURRENT_DATE - cp.data_vencimento) as dias_vencimento
FROM contas_pagar cp
LEFT JOIN fornecedores f ON cp.fornecedor_id = f.id
LEFT JOIN vw_categoria_tree cat ON cp.categoria_id = cat.id
LEFT JOIN centros_custo cc ON cp.centro_custo_id = cc.id
LEFT JOIN formas_pagamento fp ON cp.forma_pagamento_id = fp.id
LEFT JOIN usuarios u_criado ON cp.criado_por = u_criado.id
LEFT JOIN usuarios u_aprovado ON cp.aprovado_por = u_aprovado.id;

-- Insert sample data for testing
DO $$
DECLARE
  fornecedor_id uuid;
  categoria_id uuid;
  centro_custo_id uuid;
  forma_pagamento_id uuid;
  usuario_id uuid;
BEGIN
  -- Get sample IDs
  SELECT id INTO fornecedor_id FROM fornecedores LIMIT 1;
  SELECT id INTO categoria_id FROM categorias_financeiras WHERE tipo = 'despesa' LIMIT 1;
  SELECT id INTO centro_custo_id FROM centros_custo LIMIT 1;
  SELECT id INTO forma_pagamento_id FROM formas_pagamento LIMIT 1;
  SELECT id INTO usuario_id FROM usuarios LIMIT 1;
  
  -- Insert sample accounts if we have the required data
  IF fornecedor_id IS NOT NULL AND categoria_id IS NOT NULL THEN
    INSERT INTO contas_pagar (
      fornecedor_id,
      descricao,
      categoria_id,
      centro_custo_id,
      forma_pagamento_id,
      valor_total,
      data_vencimento,
      numero_documento,
      observacoes,
      criado_por
    ) VALUES 
    (
      fornecedor_id,
      'Compra de bebidas - Nota Fiscal 12345',
      categoria_id,
      centro_custo_id,
      forma_pagamento_id,
      2500.00,
      CURRENT_DATE + INTERVAL '15 days',
      'NF-12345',
      'Compra para evento do final de semana',
      usuario_id
    ),
    (
      fornecedor_id,
      'Fornecimento de alimentos - Pedido 67890',
      categoria_id,
      centro_custo_id,
      forma_pagamento_id,
      1800.00,
      CURRENT_DATE - INTERVAL '5 days', -- Vencida
      'PED-67890',
      'Conta vencida - entrar em contato com fornecedor',
      usuario_id
    )
    ON CONFLICT DO NOTHING;
  END IF;
END $$;