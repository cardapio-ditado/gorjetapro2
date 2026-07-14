/*
  # Setup completo: Eventos e Contas a Receber

  1. Tabelas Criadas
    - categorias_financeiras
    - clientes
    - centros_custo
    - formas_pagamento
    - bancos_contas
    - contas_receber
    - recebimentos_contas
    - eventos_fechados
    - reservas_especiais
    - reservas_normais

  2. Integração
    - Adiciona categoria "Receita de Eventos"
    - Vincula eventos a contas a receber
    - Função para gerar conta automaticamente

  3. Security
    - RLS habilitado em todas as tabelas
    - Políticas permissivas para desenvolvimento
*/

-- Função para atualizar timestamp
CREATE OR REPLACE FUNCTION atualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ===== TABELAS BASE =====

-- Centros de Custo
CREATE TABLE IF NOT EXISTS centros_custo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
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

-- Contas a Receber
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

-- Recebimentos de Contas
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

-- Eventos Fechados
CREATE TABLE IF NOT EXISTS eventos_fechados (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_evento text NOT NULL,
  data_evento date NOT NULL,
  horario_inicio time NOT NULL,
  horario_fim time NOT NULL,
  cliente_responsavel text NOT NULL,
  telefone_cliente text,
  tipo_evento text NOT NULL DEFAULT 'festa_privada',
  promocao_vinculada text,
  observacoes text,
  valor_total numeric(10,2) NOT NULL DEFAULT 0,
  quantidade_pessoas integer DEFAULT 1,
  status_pagamento text NOT NULL DEFAULT 'pendente',
  forma_pagamento text,
  contrato_assinado boolean DEFAULT false,
  convite_impresso boolean DEFAULT false,
  data_retirada_convite date,
  data_pagamento_contrato date,
  conta_receber_id uuid REFERENCES contas_receber(id) ON DELETE SET NULL,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  
  CONSTRAINT eventos_fechados_tipo_evento_check 
    CHECK (tipo_evento IN ('show', 'festa_privada', 'corporativo', 'casamento', 'aniversario', 'formatura', 'outros')),
  CONSTRAINT eventos_fechados_status_pagamento_check 
    CHECK (status_pagamento IN ('pendente', 'pago_parcial', 'pago_total', 'cancelado')),
  CONSTRAINT eventos_fechados_quantidade_pessoas_check 
    CHECK (quantidade_pessoas > 0)
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
    CHECK (quantidade_pessoas > 0)
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
    CHECK (numero_pessoas > 0)
);

-- ===== ÍNDICES =====
CREATE INDEX IF NOT EXISTS idx_contas_receber_cliente ON contas_receber(cliente_id);
CREATE INDEX IF NOT EXISTS idx_contas_receber_vencimento ON contas_receber(data_vencimento);
CREATE INDEX IF NOT EXISTS idx_contas_receber_status ON contas_receber(status);
CREATE INDEX IF NOT EXISTS idx_eventos_fechados_data ON eventos_fechados(data_evento);
CREATE INDEX IF NOT EXISTS idx_eventos_fechados_conta_receber ON eventos_fechados(conta_receber_id);
CREATE INDEX IF NOT EXISTS idx_reservas_especiais_data ON reservas_especiais(data_reserva);
CREATE INDEX IF NOT EXISTS idx_reservas_normais_data ON reservas_normais(data_reserva);

-- ===== RLS =====
ALTER TABLE centros_custo ENABLE ROW LEVEL SECURITY;
ALTER TABLE clientes ENABLE ROW LEVEL SECURITY;
ALTER TABLE categorias_financeiras ENABLE ROW LEVEL SECURITY;
ALTER TABLE formas_pagamento ENABLE ROW LEVEL SECURITY;
ALTER TABLE bancos_contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE contas_receber ENABLE ROW LEVEL SECURITY;
ALTER TABLE recebimentos_contas ENABLE ROW LEVEL SECURITY;
ALTER TABLE eventos_fechados ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservas_especiais ENABLE ROW LEVEL SECURITY;
ALTER TABLE reservas_normais ENABLE ROW LEVEL SECURITY;

-- Políticas permissivas para desenvolvimento
CREATE POLICY "Allow all on centros_custo" ON centros_custo FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on clientes" ON clientes FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on categorias_financeiras" ON categorias_financeiras FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on formas_pagamento" ON formas_pagamento FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on bancos_contas" ON bancos_contas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on contas_receber" ON contas_receber FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on recebimentos_contas" ON recebimentos_contas FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on eventos_fechados" ON eventos_fechados FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on reservas_especiais" ON reservas_especiais FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on reservas_normais" ON reservas_normais FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ===== DADOS INICIAIS =====
INSERT INTO categorias_financeiras (nome, tipo, descricao) VALUES
  ('Receita de Eventos', 'receita', 'Receitas provenientes de eventos fechados, festas privadas e locações de espaço'),
  ('Venda Direta', 'receita', 'Vendas diretas no estabelecimento'),
  ('Fornecedores', 'despesa', 'Compras de fornecedores')
ON CONFLICT DO NOTHING;

INSERT INTO formas_pagamento (nome, prazo_padrao, observacoes) VALUES
  ('Dinheiro', 0, 'Pagamento à vista em espécie'),
  ('PIX', 0, 'Transferência instantânea'),
  ('Cartão Débito', 1, 'Compensação em 1 dia útil'),
  ('Cartão Crédito', 30, 'Compensação em 30 dias')
ON CONFLICT DO NOTHING;

-- ===== FUNÇÃO PARA GERAR CONTA A RECEBER DO EVENTO =====
CREATE OR REPLACE FUNCTION criar_conta_receber_evento(
  p_evento_id uuid,
  p_data_vencimento date DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
  v_evento RECORD;
  v_categoria_id uuid;
  v_cliente_id uuid;
  v_conta_id uuid;
  v_data_venc date;
BEGIN
  -- Buscar dados do evento
  SELECT * INTO v_evento FROM eventos_fechados WHERE id = p_evento_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Evento não encontrado';
  END IF;

  -- Verificar se já existe conta vinculada
  IF v_evento.conta_receber_id IS NOT NULL THEN
    RAISE EXCEPTION 'Este evento já possui uma conta a receber vinculada';
  END IF;

  -- Buscar categoria "Receita de Eventos"
  SELECT id INTO v_categoria_id
  FROM categorias_financeiras
  WHERE nome = 'Receita de Eventos' AND tipo = 'receita'
  LIMIT 1;

  -- Buscar ou criar cliente
  SELECT id INTO v_cliente_id
  FROM clientes
  WHERE nome = v_evento.cliente_responsavel
  LIMIT 1;

  IF v_cliente_id IS NULL THEN
    INSERT INTO clientes (nome, telefone, tipo, observacoes)
    VALUES (
      v_evento.cliente_responsavel,
      v_evento.telefone_cliente,
      'fisico',
      'Cliente criado automaticamente via evento: ' || v_evento.nome_evento
    )
    RETURNING id INTO v_cliente_id;
  END IF;

  -- Definir data de vencimento
  v_data_venc := COALESCE(p_data_vencimento, v_evento.data_evento);

  -- Criar conta a receber
  INSERT INTO contas_receber (
    cliente_id,
    descricao,
    categoria_id,
    valor_total,
    data_emissao,
    data_vencimento,
    numero_documento,
    status,
    observacoes
  ) VALUES (
    v_cliente_id,
    'Evento: ' || v_evento.nome_evento,
    v_categoria_id,
    v_evento.valor_total,
    CURRENT_DATE,
    v_data_venc,
    'EVENTO-' || to_char(CURRENT_DATE, 'YYYY-MM') || '-' || substring(v_evento.id::text from 1 for 8),
    'em_aberto',
    'Conta gerada automaticamente do evento ' || v_evento.nome_evento || 
    '. Data do evento: ' || to_char(v_evento.data_evento, 'DD/MM/YYYY') ||
    CASE WHEN v_evento.quantidade_pessoas IS NOT NULL 
      THEN '. Quantidade de pessoas: ' || v_evento.quantidade_pessoas::text
      ELSE ''
    END
  )
  RETURNING id INTO v_conta_id;

  -- Atualizar evento com a referência
  UPDATE eventos_fechados
  SET 
    conta_receber_id = v_conta_id,
    atualizado_em = now()
  WHERE id = p_evento_id;

  RETURN v_conta_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION criar_conta_receber_evento IS 'Cria uma conta a receber vinculada a um evento fechado';
