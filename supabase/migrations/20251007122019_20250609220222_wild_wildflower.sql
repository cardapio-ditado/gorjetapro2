/*
  # Financial General Registrations

  1. New Tables
    - `centros_custo` - Cost centers for financial categorization
    - `fornecedores` - Suppliers management
    - `clientes` - Customers management  
    - `categorias_financeiras` - Financial categories for income/expense
    - `formas_pagamento` - Payment methods
    - `bancos_contas` - Bank accounts management

  2. Security
    - Enable RLS on all new tables
    - Add policies for managers and financial staff access
    - Add foreign key relationships to fluxo_caixa table

  3. Default Data
    - Insert common cost centers, categories, and payment methods
*/

-- Centro de Custo
CREATE TABLE IF NOT EXISTS centros_custo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  status text DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- Fornecedores
CREATE TABLE IF NOT EXISTS fornecedores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cnpj text,
  telefone text,
  email text,
  responsavel text,
  endereco text,
  observacoes text,
  status text DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- Clientes
CREATE TABLE IF NOT EXISTS clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  documento text,
  telefone text,
  email text,
  cidade text,
  tipo text DEFAULT 'fisico' CHECK (tipo IN ('fisico', 'juridico')),
  recorrente boolean DEFAULT false,
  observacoes text,
  status text DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- Categorias Financeiras
CREATE TABLE IF NOT EXISTS categorias_financeiras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo text NOT NULL CHECK (tipo IN ('receita', 'despesa')),
  descricao text,
  status text DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- Formas de Pagamento
CREATE TABLE IF NOT EXISTS formas_pagamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  prazo_padrao integer DEFAULT 0,
  observacoes text,
  status text DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- Bancos e Contas
CREATE TABLE IF NOT EXISTS bancos_contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  banco text NOT NULL,
  tipo_conta text DEFAULT 'corrente' CHECK (tipo_conta IN ('corrente', 'poupanca', 'investimento')),
  numero_conta text,
  agencia text,
  titular text,
  documento_titular text,
  saldo_inicial numeric DEFAULT 0,
  saldo_atual numeric DEFAULT 0,
  status text DEFAULT 'ativo' CHECK (status IN ('ativo', 'inativo')),
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE centros_custo ENABLE ROW LEVEL SECURITY;
ALTER TABLE fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias_financeiras ENABLE ROW LEVEL SECURITY;
ALTER TABLE formas_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE bancos_contas ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Gerentes e financeiro podem gerenciar centros de custo"
  ON centros_custo FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'funcao'::text) = ANY (ARRAY['gerente'::text, 'financeiro'::text]));

CREATE POLICY "Gerentes e financeiro podem gerenciar fornecedores"
  ON fornecedores FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'funcao'::text) = ANY (ARRAY['gerente'::text, 'financeiro'::text]));

CREATE POLICY "Gerentes e financeiro podem gerenciar clientes"
  ON clientes FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'funcao'::text) = ANY (ARRAY['gerente'::text, 'financeiro'::text]));

CREATE POLICY "Gerentes e financeiro podem gerenciar categorias"
  ON categorias_financeiras FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'funcao'::text) = ANY (ARRAY['gerente'::text, 'financeiro'::text]));

CREATE POLICY "Gerentes e financeiro podem gerenciar formas de pagamento"
  ON formas_pagamento FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'funcao'::text) = ANY (ARRAY['gerente'::text, 'financeiro'::text]));

CREATE POLICY "Gerentes e financeiro podem gerenciar bancos e contas"
  ON bancos_contas FOR ALL
  TO authenticated
  USING ((auth.jwt() ->> 'funcao'::text) = ANY (ARRAY['gerente'::text, 'financeiro'::text]));

-- Insert default data
INSERT INTO centros_custo (nome, descricao) VALUES
  ('Bar', 'Operações do bar e bebidas'),
  ('Cozinha', 'Operações da cozinha e alimentos'),
  ('RH', 'Recursos humanos e folha de pagamento'),
  ('Eventos', 'Organização e produção de eventos'),
  ('Administrativo', 'Despesas administrativas gerais'),
  ('Marketing', 'Publicidade e marketing')
ON CONFLICT DO NOTHING;

INSERT INTO categorias_financeiras (nome, tipo, descricao) VALUES
  ('Venda Direta', 'receita', 'Vendas diretas no estabelecimento'),
  ('Delivery', 'receita', 'Vendas por delivery'),
  ('Eventos', 'receita', 'Receitas de eventos e festas'),
  ('Aluguel', 'despesa', 'Aluguel do estabelecimento'),
  ('Fornecedores', 'despesa', 'Compras de fornecedores'),
  ('Salários', 'despesa', 'Folha de pagamento'),
  ('Comissões', 'despesa', 'Comissões de vendas'),
  ('Utilities', 'despesa', 'Água, luz, telefone, internet'),
  ('Marketing', 'despesa', 'Publicidade e marketing')
ON CONFLICT DO NOTHING;

INSERT INTO formas_pagamento (nome, prazo_padrao, observacoes) VALUES
  ('Dinheiro', 0, 'Pagamento à vista em espécie'),
  ('PIX', 0, 'Transferência instantânea'),
  ('Cartão Débito', 1, 'Compensação em 1 dia útil'),
  ('Cartão Crédito', 30, 'Compensação em 30 dias'),
  ('Boleto', 3, 'Compensação em 3 dias úteis'),
  ('Transferência', 1, 'TED/DOC - 1 dia útil')
ON CONFLICT DO NOTHING;

-- Update fluxo_caixa table to include foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fluxo_caixa' AND column_name = 'centro_custo_id'
  ) THEN
    ALTER TABLE fluxo_caixa ADD COLUMN centro_custo_id uuid REFERENCES centros_custo(id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fluxo_caixa' AND column_name = 'categoria_id'
  ) THEN
    ALTER TABLE fluxo_caixa ADD COLUMN categoria_id uuid REFERENCES categorias_financeiras(id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fluxo_caixa' AND column_name = 'forma_pagamento_id'
  ) THEN
    ALTER TABLE fluxo_caixa ADD COLUMN forma_pagamento_id uuid REFERENCES formas_pagamento(id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fluxo_caixa' AND column_name = 'conta_bancaria_id'
  ) THEN
    ALTER TABLE fluxo_caixa ADD COLUMN conta_bancaria_id uuid REFERENCES bancos_contas(id);
  END IF;
END $$;