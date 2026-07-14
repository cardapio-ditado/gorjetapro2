/*
  # Módulo de Visão Estratégica - Gestão de Fluxo de Caixa Semanal

  ## Descrição
  Sistema completo de controle de fluxo de caixa baseado em semanas com:
  - Provisão de faturamento semanal
  - Categorias com percentuais pré-definidos (caixinhas)
  - Controle de débitos antigos
  - Projeção de semanas futuras
  - Controle de compras a prazo

  ## Tabelas Criadas
  1. visao_estrategica_categorias - Categorias de orçamento
  2. visao_estrategica_subcategorias - Subdivisões
  3. visao_estrategica_semanas - Semanas de controle
  4. visao_estrategica_despesas - Despesas lançadas
  5. visao_estrategica_dividas - Dívidas antigas
  6. visao_estrategica_pagamentos_dividas - Histórico de pagamentos
  7. visao_estrategica_projecoes_futuras - Projeções customizadas
  8. visao_estrategica_config - Configurações do módulo

  ## Segurança
  - RLS habilitado em todas as tabelas
  - Acesso para usuários autenticados
*/

-- 1. CATEGORIAS DE ORÇAMENTO
CREATE TABLE IF NOT EXISTS visao_estrategica_categorias (
  id text PRIMARY KEY,
  nome text NOT NULL,
  percentual numeric NOT NULL CHECK (percentual >= 0 AND percentual <= 100),
  cor text NOT NULL DEFAULT '#dc2626',
  ordem int DEFAULT 0,
  criado_em timestamptz DEFAULT NOW(),
  atualizado_em timestamptz DEFAULT NOW()
);

ALTER TABLE visao_estrategica_categorias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura de categorias"
  ON visao_estrategica_categorias FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Permitir criação/edição de categorias"
  ON visao_estrategica_categorias FOR ALL
  TO authenticated
  USING (true);

-- 2. SUBCATEGORIAS
CREATE TABLE IF NOT EXISTS visao_estrategica_subcategorias (
  id text PRIMARY KEY,
  categoria_id text NOT NULL REFERENCES visao_estrategica_categorias(id) ON DELETE CASCADE,
  nome text NOT NULL,
  percentual numeric NOT NULL CHECK (percentual >= 0),
  criado_em timestamptz DEFAULT NOW(),
  atualizado_em timestamptz DEFAULT NOW()
);

ALTER TABLE visao_estrategica_subcategorias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura de subcategorias"
  ON visao_estrategica_subcategorias FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Permitir criação/edição de subcategorias"
  ON visao_estrategica_subcategorias FOR ALL
  TO authenticated
  USING (true);

-- 3. SEMANAS
CREATE TABLE IF NOT EXISTS visao_estrategica_semanas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_inicio date NOT NULL UNIQUE,
  faturamento numeric NOT NULL CHECK (faturamento > 0),
  criado_em timestamptz DEFAULT NOW(),
  criado_por uuid REFERENCES auth.users(id),
  atualizado_em timestamptz DEFAULT NOW()
);

ALTER TABLE visao_estrategica_semanas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir acesso a semanas"
  ON visao_estrategica_semanas FOR ALL
  TO authenticated
  USING (true);

-- 4. DESPESAS
CREATE TABLE IF NOT EXISTS visao_estrategica_despesas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  semana_id uuid REFERENCES visao_estrategica_semanas(id) ON DELETE CASCADE,
  fornecedor text NOT NULL,
  valor numeric NOT NULL CHECK (valor > 0),
  categoria_id text NOT NULL REFERENCES visao_estrategica_categorias(id),
  subcategoria_id text REFERENCES visao_estrategica_subcategorias(id),
  descricao text,
  data_vencimento date,
  is_override boolean DEFAULT false,
  motivo_override text,
  criado_em timestamptz DEFAULT NOW(),
  criado_por uuid REFERENCES auth.users(id),
  CONSTRAINT fk_subcategoria_categoria
    FOREIGN KEY (subcategoria_id)
    REFERENCES visao_estrategica_subcategorias(id)
    ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ve_despesas_semana ON visao_estrategica_despesas(semana_id);
CREATE INDEX IF NOT EXISTS idx_ve_despesas_categoria ON visao_estrategica_despesas(categoria_id);
CREATE INDEX IF NOT EXISTS idx_ve_despesas_vencimento ON visao_estrategica_despesas(data_vencimento);

ALTER TABLE visao_estrategica_despesas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir acesso a despesas"
  ON visao_estrategica_despesas FOR ALL
  TO authenticated
  USING (true);

-- 5. DÍVIDAS
CREATE TABLE IF NOT EXISTS visao_estrategica_dividas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  valor_total numeric NOT NULL CHECK (valor_total > 0),
  valor_pago numeric DEFAULT 0 CHECK (valor_pago >= 0),
  prioridade text NOT NULL CHECK (prioridade IN ('alta', 'media', 'baixa')) DEFAULT 'media',
  status text NOT NULL CHECK (status IN ('pendente', 'parcialmente_pago', 'pago')) DEFAULT 'pendente',
  criado_em timestamptz DEFAULT NOW(),
  criado_por uuid REFERENCES auth.users(id),
  atualizado_em timestamptz DEFAULT NOW()
);

ALTER TABLE visao_estrategica_dividas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir acesso a dívidas"
  ON visao_estrategica_dividas FOR ALL
  TO authenticated
  USING (true);

-- 6. PAGAMENTOS DE DÍVIDAS
CREATE TABLE IF NOT EXISTS visao_estrategica_pagamentos_dividas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  divida_id uuid NOT NULL REFERENCES visao_estrategica_dividas(id) ON DELETE CASCADE,
  semana_id uuid REFERENCES visao_estrategica_semanas(id) ON DELETE SET NULL,
  valor numeric NOT NULL CHECK (valor > 0),
  pago_em timestamptz DEFAULT NOW(),
  pago_por uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_ve_pagamentos_divida ON visao_estrategica_pagamentos_dividas(divida_id);

ALTER TABLE visao_estrategica_pagamentos_dividas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir acesso a pagamentos"
  ON visao_estrategica_pagamentos_dividas FOR ALL
  TO authenticated
  USING (true);

-- 7. PROJEÇÕES FUTURAS CUSTOMIZADAS
CREATE TABLE IF NOT EXISTS visao_estrategica_projecoes_futuras (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_inicio date NOT NULL UNIQUE,
  faturamento_customizado numeric NOT NULL CHECK (faturamento_customizado > 0),
  criado_em timestamptz DEFAULT NOW(),
  criado_por uuid REFERENCES auth.users(id),
  atualizado_em timestamptz DEFAULT NOW()
);

ALTER TABLE visao_estrategica_projecoes_futuras ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir acesso a projeções"
  ON visao_estrategica_projecoes_futuras FOR ALL
  TO authenticated
  USING (true);

-- 8. CONFIGURAÇÕES DO MÓDULO
CREATE TABLE IF NOT EXISTS visao_estrategica_config (
  chave text PRIMARY KEY,
  valor jsonb NOT NULL,
  atualizado_em timestamptz DEFAULT NOW()
);

ALTER TABLE visao_estrategica_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir acesso a config"
  ON visao_estrategica_config FOR ALL
  TO authenticated
  USING (true);

-- Inserir configuração padrão
INSERT INTO visao_estrategica_config (chave, valor)
VALUES ('limite_comprometimento_futuro', '100'::jsonb)
ON CONFLICT (chave) DO NOTHING;

-- COMENTÁRIOS
COMMENT ON TABLE visao_estrategica_semanas IS 'Semanas de controle de fluxo de caixa com faturamento previsto';
COMMENT ON TABLE visao_estrategica_categorias IS 'Categorias de orçamento com percentuais pré-definidos';
COMMENT ON TABLE visao_estrategica_subcategorias IS 'Subdivisões de categorias';
COMMENT ON TABLE visao_estrategica_despesas IS 'Despesas lançadas com validação de orçamento';
COMMENT ON TABLE visao_estrategica_dividas IS 'Dívidas antigas para controle e quitação';
COMMENT ON TABLE visao_estrategica_pagamentos_dividas IS 'Histórico de pagamentos de dívidas';
COMMENT ON TABLE visao_estrategica_projecoes_futuras IS 'Projeções customizadas de faturamento';
