/*
  # Initial Database Schema

  1. Authentication and Users
    - `usuarios` table for user management
    - RLS policies for user data protection
  
  2. Financial Management
    - `fluxo_caixa` table for financial transactions
    - RLS policies for financial data
  
  3. Inventory Management
    - `insumos` table for stock items
    - `fichas_tecnicas` and `ficha_ingredientes` for recipes
    - `producoes` for production orders
    - `requisicoes_estoque` for stock requests
  
  4. HR Management
    - `funcionarios` for employee records
    - `extras` for freelance workers
    - `escalas` for work schedules
    - `documentos_funcionarios` for employee documents
  
  5. Event Management
    - `musicos` for artist bookings
  
  6. Operations
    - `ocorrencias` for incident reports

  Security:
    - RLS enabled on all tables
    - Policies for data access based on user roles
*/

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS usuarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  senha TEXT NOT NULL,
  funcao TEXT CHECK (funcao IN ('gerente', 'financeiro', 'estoquista', 'rh', 'operador')),
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Financial transactions
CREATE TABLE IF NOT EXISTS fluxo_caixa (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tipo TEXT CHECK (tipo IN ('entrada', 'saida')),
  valor NUMERIC NOT NULL,
  data DATE NOT NULL,
  descricao TEXT,
  centro_custo TEXT,
  comprovante TEXT,
  criado_por UUID REFERENCES usuarios(id),
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Inventory items
CREATE TABLE IF NOT EXISTS insumos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  unidade TEXT,
  fornecedor TEXT,
  estoque_atual NUMERIC,
  estoque_minimo NUMERIC,
  validade DATE,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Technical recipes
CREATE TABLE IF NOT EXISTS fichas_tecnicas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT NOT NULL,
  porcoes INTEGER,
  custo_total NUMERIC,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Recipe ingredients
CREATE TABLE IF NOT EXISTS ficha_ingredientes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ficha_id UUID REFERENCES fichas_tecnicas(id),
  insumo_id UUID REFERENCES insumos(id),
  quantidade NUMERIC,
  UNIQUE(ficha_id, insumo_id)
);

-- Production orders
CREATE TABLE IF NOT EXISTS producoes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ficha_id UUID REFERENCES fichas_tecnicas(id),
  quantidade INTEGER,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Stock requests
CREATE TABLE IF NOT EXISTS requisicoes_estoque (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  setor TEXT,
  insumo_id UUID REFERENCES insumos(id),
  quantidade NUMERIC,
  status TEXT CHECK (status IN ('pendente', 'aprovado', 'entregue')),
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Employees
CREATE TABLE IF NOT EXISTS funcionarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT,
  cpf TEXT UNIQUE,
  funcao TEXT,
  admissao DATE,
  status TEXT CHECK (status IN ('ativo', 'inativo')),
  observacoes TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Freelancers
CREATE TABLE IF NOT EXISTS extras (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT,
  contato TEXT,
  valor_hora NUMERIC,
  funcao TEXT,
  datas_trabalhadas JSONB,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Work schedules
CREATE TABLE IF NOT EXISTS escalas (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  funcionario_id UUID REFERENCES funcionarios(id),
  data DATE,
  turno TEXT,
  setor TEXT
);

-- Employee documents
CREATE TABLE IF NOT EXISTS documentos_funcionarios (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  funcionario_id UUID REFERENCES funcionarios(id),
  tipo TEXT,
  arquivo TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Musicians/Artists
CREATE TABLE IF NOT EXISTS musicos (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome TEXT,
  contato TEXT,
  valor NUMERIC,
  status_pagamento TEXT CHECK (status_pagamento IN ('pendente', 'pago', 'cancelado')),
  data_evento TIMESTAMP WITH TIME ZONE,
  material_promocional TEXT,
  observacoes TEXT,
  checkin BOOLEAN DEFAULT FALSE,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Incidents
CREATE TABLE IF NOT EXISTS ocorrencias (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  data TIMESTAMP WITH TIME ZONE,
  setor TEXT,
  descricao TEXT,
  acao_tomada TEXT,
  responsavel TEXT,
  assinatura TEXT,
  criado_em TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW())
);

-- Enable Row Level Security
ALTER TABLE usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE fluxo_caixa ENABLE ROW LEVEL SECURITY;
ALTER TABLE insumos ENABLE ROW LEVEL SECURITY;
ALTER TABLE fichas_tecnicas ENABLE ROW LEVEL SECURITY;
ALTER TABLE ficha_ingredientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE producoes ENABLE ROW LEVEL SECURITY;
ALTER TABLE requisicoes_estoque ENABLE ROW LEVEL SECURITY;
ALTER TABLE funcionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE extras ENABLE ROW LEVEL SECURITY;
ALTER TABLE escalas ENABLE ROW LEVEL SECURITY;
ALTER TABLE documentos_funcionarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE musicos ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocorrencias ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Gerentes podem ver todos os usuários"
  ON usuarios FOR SELECT
  TO authenticated
  USING (auth.jwt() ->> 'funcao' = 'gerente');

CREATE POLICY "Usuários podem ver seus próprios dados"
  ON usuarios FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Gerentes e financeiro podem ver transações"
  ON fluxo_caixa FOR SELECT
  TO authenticated
  USING (
    auth.jwt() ->> 'funcao' IN ('gerente', 'financeiro')
  );

CREATE POLICY "Gerentes e estoquistas podem ver estoque"
  ON insumos FOR SELECT
  TO authenticated
  USING (
    auth.jwt() ->> 'funcao' IN ('gerente', 'estoquista')
  );

CREATE POLICY "Gerentes e RH podem ver funcionários"
  ON funcionarios FOR SELECT
  TO authenticated
  USING (
    auth.jwt() ->> 'funcao' IN ('gerente', 'rh')
  );

CREATE POLICY "Gerentes podem ver músicos"
  ON musicos FOR SELECT
  TO authenticated
  USING (
    auth.jwt() ->> 'funcao' = 'gerente'
  );

CREATE POLICY "Gerentes e operadores podem ver ocorrências"
  ON ocorrencias FOR SELECT
  TO authenticated
  USING (
    auth.jwt() ->> 'funcao' IN ('gerente', 'operador')
  );