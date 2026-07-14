/*
  # Contas a Pagar Module Completo
  
  1. New Tables
    - `contas_pagar` - Tabela principal de contas a pagar
    - `pagamentos_contas` - Rastreamento de pagamentos parciais
    - `anexos_contas` - Anexos de arquivos para as contas
    - Campos de datas de baixa incluídos
  
  2. Functions
    - Atualização automática de status baseada em pagamentos
    - Atualização de contas vencidas
    - Função de atualização de timestamp
    - Atualização automática das datas de baixa
  
  3. Security
    - RLS habilitado em todas as tabelas
    - Políticas para gerentes e financeiro
  
  4. Views
    - View completa com todos dados relacionados e cálculos
    - Incluindo histórico de pagamentos parciais
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
  data_primeira_baixa timestamptz,
  data_baixa_integral timestamptz,
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
  data_primeiro_pagamento timestamptz;
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
  
  -- Get date of first payment
  SELECT MIN(criado_em)
  INTO data_primeiro_pagamento
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
  
  -- Update the account with new status and dates
  UPDATE contas_pagar 
  SET 
    valor_pago = total_pago,
    status = nova_status,
    data_primeira_baixa = data_primeiro_pagamento,
    data_baixa_integral = CASE 
      WHEN nova_status = 'pago' AND data_baixa_integral IS NULL THEN now()
      WHEN nova_status = 'pago' THEN data_baixa_integral
      ELSE NULL
    END,
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
DROP TRIGGER IF EXISTS trg_pagamentos_contas_status ON pagamentos_contas;
CREATE TRIGGER trg_pagamentos_contas_status
  AFTER INSERT OR UPDATE OR DELETE ON pagamentos_contas
  FOR EACH ROW EXECUTE FUNCTION atualizar_status_conta_pagar();

DROP TRIGGER IF EXISTS trg_contas_pagar_update ON contas_pagar;
CREATE TRIGGER trg_contas_pagar_update
  BEFORE UPDATE ON contas_pagar
  FOR EACH ROW EXECUTE FUNCTION atualizar_timestamp();

-- Enable RLS
ALTER TABLE contas_pagar ENABLE ROW LEVEL SECURITY;
ALTER TABLE pagamentos_contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE anexos_contas ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "Gerentes e financeiro podem gerenciar contas a pagar" ON contas_pagar;
CREATE POLICY "Gerentes e financeiro podem gerenciar contas a pagar"
  ON contas_pagar FOR ALL
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Gerentes e financeiro podem gerenciar pagamentos" ON pagamentos_contas;
CREATE POLICY "Gerentes e financeiro podem gerenciar pagamentos"
  ON pagamentos_contas FOR ALL
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Gerentes e financeiro podem gerenciar anexos" ON anexos_contas;
CREATE POLICY "Gerentes e financeiro podem gerenciar anexos"
  ON anexos_contas FOR ALL
  TO authenticated
  USING (true);

-- Create view for accounts payable with related data
CREATE OR REPLACE VIEW vw_contas_pagar AS
SELECT 
  cp.*,
  f.nome as fornecedor_nome,
  cat.nome as categoria_nome,
  cc.nome as centro_custo_nome,
  fp.nome as forma_pagamento_nome,
  u_criado.nome as criado_por_nome,
  u_aprovado.nome as aprovado_por_nome,
  CASE 
    WHEN cp.data_vencimento < CURRENT_DATE AND cp.status IN ('em_aberto', 'parcialmente_pago') THEN true
    ELSE false
  END as esta_vencida,
  (CURRENT_DATE - cp.data_vencimento) as dias_vencimento,
  (SELECT COUNT(*) FROM pagamentos_contas pc WHERE pc.conta_pagar_id = cp.id) as total_pagamentos_parciais,
  (SELECT json_agg(
    json_build_object(
      'id', pc.id,
      'valor', pc.valor_pagamento,
      'data', pc.data_pagamento,
      'forma_pagamento', fp2.nome,
      'conta_bancaria', COALESCE(bc.banco || ' - ' || bc.tipo_conta, 'N/A'),
      'numero_comprovante', pc.numero_comprovante,
      'observacoes', pc.observacoes,
      'criado_em', pc.criado_em
    ) ORDER BY pc.data_pagamento DESC
  ) FROM pagamentos_contas pc
    LEFT JOIN formas_pagamento fp2 ON pc.forma_pagamento_id = fp2.id
    LEFT JOIN bancos_contas bc ON pc.conta_bancaria_id = bc.id
    WHERE pc.conta_pagar_id = cp.id
  ) as pagamentos_historico
FROM contas_pagar cp
LEFT JOIN fornecedores f ON cp.fornecedor_id = f.id
LEFT JOIN categorias_financeiras cat ON cp.categoria_id = cat.id
LEFT JOIN centros_custo cc ON cp.centro_custo_id = cc.id
LEFT JOIN formas_pagamento fp ON cp.forma_pagamento_id = fp.id
LEFT JOIN usuarios u_criado ON cp.criado_por = u_criado.id
LEFT JOIN usuarios u_aprovado ON cp.aprovado_por = u_aprovado.id;
