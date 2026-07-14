/*
  # Módulo Aprovação do Dia - Tabelas e Funções

  1. Novas Tabelas
    - `agenda_pagamentos`
      - `id` (uuid, primary key)
      - `data_base` (date, unique) - Data da agenda
      - `status` (text) - 'aberta' ou 'fechada'
      - `criado_por` (uuid) - Usuário que criou
      - `fechado_por` (uuid) - Usuário que fechou
      - Timestamps de criação e fechamento

    - `agenda_pagamento_itens`
      - `id` (uuid, primary key)
      - `agenda_id` (uuid, foreign key)
      - `origem` (text) - 'ap' (Accounts Payable) ou 'ad-hoc'
      - `conta_pagar_id` (uuid) - Referência para contas_pagar quando origem='ap'
      - `fornecedor` (text) - Nome do fornecedor
      - `descricao` (text) - Descrição do pagamento
      - `valor` (numeric) - Valor a pagar
      - `vencimento` (date) - Data de vencimento
      - `status` (text) - 'proposto', 'aprovado', 'reprovado', 'executado', 'cancelado'
      - `observacao` (text) - Observações
      - Campos de auditoria (aprovado_por, executado_por, timestamps)

  2. Funções RPC
    - `api_fin_criar_ou_importar_agenda` - Criar agenda e importar contas a pagar
    - `api_fin_incluir_adhoc` - Adicionar pagamento ad-hoc
    - `api_fin_set_status_item` - Alterar status do item
    - `api_fin_fechar_agenda` - Fechar agenda e executar pagamentos
    - `api_fin_reabrir_agenda` - Reabrir agenda

  3. Segurança
    - RLS habilitado em todas as tabelas
    - Policies amplas para desenvolvimento (restringir em produção)
    - Grants para anon, authenticated, service_role
*/

-- ========================================
-- TABELAS
-- ========================================

-- Tabela principal da agenda diária
CREATE TABLE IF NOT EXISTS agenda_pagamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data_base date NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta', 'fechada')),
  criado_por uuid NULL,
  criado_em timestamptz DEFAULT now(),
  fechado_por uuid NULL,
  fechado_em timestamptz NULL
);

-- Itens da agenda (pagamentos individuais)
CREATE TABLE IF NOT EXISTS agenda_pagamento_itens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agenda_id uuid NOT NULL REFERENCES agenda_pagamentos(id) ON DELETE CASCADE,
  origem text NOT NULL CHECK (origem IN ('ap', 'ad-hoc')),
  conta_pagar_id uuid NULL, -- Referência para contas_pagar quando origem='ap'
  fornecedor text NOT NULL,
  descricao text NOT NULL,
  valor numeric(14,2) NOT NULL CHECK (valor >= 0),
  vencimento date NOT NULL,
  status text NOT NULL DEFAULT 'proposto' CHECK (status IN ('proposto', 'aprovado', 'reprovado', 'executado', 'cancelado')),
  observacao text NULL,
  aprovado_por uuid NULL,
  aprovado_em timestamptz NULL,
  executado_por uuid NULL,
  executado_em timestamptz NULL,
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now()
);

-- Índice único para evitar duplicação de AP na mesma agenda
CREATE UNIQUE INDEX IF NOT EXISTS idx_agenda_itens_ap_unico 
ON agenda_pagamento_itens (agenda_id, conta_pagar_id) 
WHERE conta_pagar_id IS NOT NULL;

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_agenda_pagamentos_data_base ON agenda_pagamentos(data_base);
CREATE INDEX IF NOT EXISTS idx_agenda_pagamentos_status ON agenda_pagamentos(status);
CREATE INDEX IF NOT EXISTS idx_agenda_itens_agenda_id ON agenda_pagamento_itens(agenda_id);
CREATE INDEX IF NOT EXISTS idx_agenda_itens_status ON agenda_pagamento_itens(status);
CREATE INDEX IF NOT EXISTS idx_agenda_itens_origem ON agenda_pagamento_itens(origem);

-- ========================================
-- RLS E POLICIES
-- ========================================

-- Habilitar RLS
ALTER TABLE agenda_pagamentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE agenda_pagamento_itens ENABLE ROW LEVEL SECURITY;

-- Policies amplas para desenvolvimento (restringir em produção)
CREATE POLICY "Allow all operations on agenda_pagamentos"
  ON agenda_pagamentos
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all operations on agenda_pagamento_itens"
  ON agenda_pagamento_itens
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- ========================================
-- TRIGGERS
-- ========================================

-- Trigger para atualizar timestamp
CREATE OR REPLACE FUNCTION atualizar_timestamp_agenda()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agenda_itens_update ON agenda_pagamento_itens;
CREATE TRIGGER trg_agenda_itens_update
  BEFORE UPDATE ON agenda_pagamento_itens
  FOR EACH ROW
  EXECUTE FUNCTION atualizar_timestamp_agenda();

-- ========================================
-- FUNÇÕES RPC
-- ========================================

-- RPC 1: Criar ou importar agenda
CREATE OR REPLACE FUNCTION api_fin_criar_ou_importar_agenda(p_data date)
RETURNS uuid
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_agenda_id uuid;
  v_conta record;
BEGIN
  -- Criar ou buscar agenda existente
  INSERT INTO agenda_pagamentos (data_base, criado_em)
  VALUES (p_data, now())
  ON CONFLICT (data_base) DO NOTHING
  RETURNING id INTO v_agenda_id;
  
  -- Se não retornou ID, buscar o existente
  IF v_agenda_id IS NULL THEN
    SELECT id INTO v_agenda_id 
    FROM agenda_pagamentos 
    WHERE data_base = p_data;
  END IF;
  
  -- Importar contas a pagar elegíveis (idempotente)
  FOR v_conta IN 
    SELECT 
      cp.id as conta_pagar_id,
      f.nome as fornecedor_nome,
      cp.descricao,
      cp.saldo_restante as valor,
      cp.data_vencimento as vencimento
    FROM contas_pagar cp
    LEFT JOIN fornecedores f ON f.id = cp.fornecedor_id
    WHERE cp.status IN ('em_aberto', 'parcialmente_pago')
      AND cp.data_vencimento <= p_data
      AND cp.saldo_restante > 0
  LOOP
    -- Inserir item (ON CONFLICT DO NOTHING para idempotência)
    INSERT INTO agenda_pagamento_itens (
      agenda_id,
      origem,
      conta_pagar_id,
      fornecedor,
      descricao,
      valor,
      vencimento,
      status
    )
    VALUES (
      v_agenda_id,
      'ap',
      v_conta.conta_pagar_id,
      COALESCE(v_conta.fornecedor_nome, 'Fornecedor não identificado'),
      v_conta.descricao,
      v_conta.valor,
      v_conta.vencimento,
      'proposto'
    )
    ON CONFLICT (agenda_id, conta_pagar_id) DO NOTHING;
  END LOOP;
  
  RETURN v_agenda_id;
END;
$$;

-- RPC 2: Incluir pagamento ad-hoc
CREATE OR REPLACE FUNCTION api_fin_incluir_adhoc(
  p_agenda_id uuid,
  p_fornecedor text,
  p_descricao text,
  p_valor numeric,
  p_vencimento date,
  p_observacao text DEFAULT NULL
)
RETURNS uuid
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_item_id uuid;
BEGIN
  INSERT INTO agenda_pagamento_itens (
    agenda_id,
    origem,
    conta_pagar_id,
    fornecedor,
    descricao,
    valor,
    vencimento,
    status,
    observacao
  )
  VALUES (
    p_agenda_id,
    'ad-hoc',
    NULL,
    p_fornecedor,
    p_descricao,
    p_valor,
    p_vencimento,
    'proposto',
    p_observacao
  )
  RETURNING id INTO v_item_id;
  
  RETURN v_item_id;
END;
$$;

-- RPC 3: Alterar status do item
CREATE OR REPLACE FUNCTION api_fin_set_status_item(
  p_item_id uuid,
  p_novo_status text,
  p_usuario uuid DEFAULT NULL
)
RETURNS void
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Validar status
  IF p_novo_status NOT IN ('aprovado', 'reprovado', 'cancelado') THEN
    RAISE EXCEPTION 'Status inválido: %', p_novo_status;
  END IF;
  
  -- Atualizar item
  UPDATE agenda_pagamento_itens
  SET 
    status = p_novo_status,
    aprovado_por = CASE WHEN p_novo_status = 'aprovado' THEN p_usuario ELSE aprovado_por END,
    aprovado_em = CASE WHEN p_novo_status = 'aprovado' THEN now() ELSE aprovado_em END,
    atualizado_em = now()
  WHERE id = p_item_id;
  
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item não encontrado: %', p_item_id;
  END IF;
END;
$$;

-- RPC 4: Fechar agenda
CREATE OR REPLACE FUNCTION api_fin_fechar_agenda(
  p_agenda_id uuid,
  p_usuario uuid DEFAULT NULL
)
RETURNS void
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
DECLARE
  v_item record;
BEGIN
  -- Verificar se agenda existe e está aberta
  IF NOT EXISTS (
    SELECT 1 FROM agenda_pagamentos 
    WHERE id = p_agenda_id AND status = 'aberta'
  ) THEN
    RAISE EXCEPTION 'Agenda não encontrada ou já fechada';
  END IF;
  
  -- Processar itens aprovados
  FOR v_item IN 
    SELECT * FROM agenda_pagamento_itens 
    WHERE agenda_id = p_agenda_id AND status = 'aprovado'
  LOOP
    -- Se vinculado ao AP, quitar a conta
    IF v_item.conta_pagar_id IS NOT NULL THEN
      UPDATE contas_pagar
      SET 
        status = 'pago',
        valor_pago = valor_total,
        atualizado_em = now()
      WHERE id = v_item.conta_pagar_id;
    END IF;
    
    -- Marcar item como executado
    UPDATE agenda_pagamento_itens
    SET 
      status = 'executado',
      executado_por = p_usuario,
      executado_em = now(),
      atualizado_em = now()
    WHERE id = v_item.id;
  END LOOP;
  
  -- Fechar agenda
  UPDATE agenda_pagamentos
  SET 
    status = 'fechada',
    fechado_por = p_usuario,
    fechado_em = now()
  WHERE id = p_agenda_id;
END;
$$;

-- RPC 5: Reabrir agenda
CREATE OR REPLACE FUNCTION api_fin_reabrir_agenda(p_agenda_id uuid)
RETURNS void
SECURITY DEFINER
LANGUAGE plpgsql
AS $$
BEGIN
  -- Verificar se agenda existe
  IF NOT EXISTS (SELECT 1 FROM agenda_pagamentos WHERE id = p_agenda_id) THEN
    RAISE EXCEPTION 'Agenda não encontrada';
  END IF;
  
  -- Reabrir agenda (sem desfazer históricos)
  UPDATE agenda_pagamentos
  SET status = 'aberta'
  WHERE id = p_agenda_id;
END;
$$;

-- ========================================
-- GRANTS
-- ========================================

-- Grants para as funções RPC
GRANT EXECUTE ON FUNCTION api_fin_criar_ou_importar_agenda(date) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api_fin_incluir_adhoc(uuid, text, text, numeric, date, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api_fin_set_status_item(uuid, text, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api_fin_fechar_agenda(uuid, uuid) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION api_fin_reabrir_agenda(uuid) TO anon, authenticated, service_role;

-- ========================================
-- DADOS DE TESTE (OPCIONAL)
-- ========================================

-- Inserir fornecedores de teste se não existirem
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM fornecedores WHERE nome = 'RH - Pagamentos de Funcionários') THEN
    INSERT INTO fornecedores (nome, status, criado_em)
    VALUES ('RH - Pagamentos de Funcionários', 'ativo', now());
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM fornecedores WHERE nome = 'Fornecedor A') THEN
    INSERT INTO fornecedores (nome, status, criado_em)
    VALUES ('Fornecedor A', 'ativo', now());
  END IF;
END $$;

-- Inserir contas a pagar de teste
DO $$
DECLARE
  v_fornecedor_rh_id uuid;
  v_fornecedor_a_id uuid;
BEGIN
  -- Buscar IDs dos fornecedores
  SELECT id INTO v_fornecedor_rh_id FROM fornecedores WHERE nome = 'RH - Pagamentos de Funcionários' LIMIT 1;
  SELECT id INTO v_fornecedor_a_id FROM fornecedores WHERE nome = 'Fornecedor A' LIMIT 1;
  
  -- Inserir contas de teste se não existirem
  IF NOT EXISTS (SELECT 1 FROM contas_pagar WHERE descricao = 'Gorjeta Semanal - Teste') THEN
    INSERT INTO contas_pagar (
      fornecedor_id,
      descricao,
      valor_total,
      valor_pago,
      data_emissao,
      data_vencimento,
      status
    )
    VALUES 
    (
      v_fornecedor_rh_id,
      'Gorjeta Semanal - Teste',
      1500.00,
      0,
      CURRENT_DATE - INTERVAL '7 days',
      CURRENT_DATE - INTERVAL '1 day',
      'em_aberto'
    ),
    (
      v_fornecedor_a_id,
      'Fornecimento de Materiais - Teste',
      850.00,
      0,
      CURRENT_DATE - INTERVAL '5 days',
      CURRENT_DATE,
      'em_aberto'
    );
  END IF;
END $$;