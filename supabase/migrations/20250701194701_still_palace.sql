/*
  # Sistema Completo de Fluxo de Caixa

  1. Melhorias na tabela fluxo_caixa
    - Adicionar campos para integração com contas a pagar
    - Adicionar campos para controle de origem dos lançamentos

  2. Função de integração automática
    - Criar lançamentos automáticos quando contas são pagas
    - Manter referência para rastreabilidade

  3. Views para projeção
    - Combinar lançamentos reais com contas em aberto
    - Calcular saldos projetados

  4. Triggers para automação
    - Integração automática contas a pagar > fluxo de caixa
*/

-- Melhorar tabela fluxo_caixa
DO $$
BEGIN
  -- Adicionar campo para referenciar conta a pagar
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fluxo_caixa' AND column_name = 'conta_pagar_id'
  ) THEN
    ALTER TABLE fluxo_caixa ADD COLUMN conta_pagar_id uuid REFERENCES contas_pagar(id);
  END IF;
  
  -- Adicionar campo para referenciar pagamento específico
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fluxo_caixa' AND column_name = 'pagamento_id'
  ) THEN
    ALTER TABLE fluxo_caixa ADD COLUMN pagamento_id uuid REFERENCES pagamentos_contas(id);
  END IF;
  
  -- Adicionar campo para identificar origem do lançamento
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fluxo_caixa' AND column_name = 'origem'
  ) THEN
    ALTER TABLE fluxo_caixa ADD COLUMN origem text DEFAULT 'manual' CHECK (origem IN ('manual', 'conta_pagar', 'recorrente'));
  END IF;
  
  -- Adicionar campo para observações
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'fluxo_caixa' AND column_name = 'observacoes'
  ) THEN
    ALTER TABLE fluxo_caixa ADD COLUMN observacoes text;
  END IF;
END $$;

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_fluxo_caixa_conta_pagar ON fluxo_caixa(conta_pagar_id);
CREATE INDEX IF NOT EXISTS idx_fluxo_caixa_pagamento ON fluxo_caixa(pagamento_id);
CREATE INDEX IF NOT EXISTS idx_fluxo_caixa_origem ON fluxo_caixa(origem);

-- Função para criar lançamento no fluxo de caixa a partir de pagamento
CREATE OR REPLACE FUNCTION criar_lancamento_fluxo_caixa()
RETURNS TRIGGER AS $$
DECLARE
  conta_info RECORD;
  descricao_lancamento text;
BEGIN
  -- Buscar informações da conta a pagar
  SELECT 
    cp.descricao,
    cp.categoria_id,
    cp.centro_custo_id,
    f.nome as fornecedor_nome
  INTO conta_info
  FROM contas_pagar cp
  LEFT JOIN fornecedores f ON cp.fornecedor_id = f.id
  WHERE cp.id = NEW.conta_pagar_id;
  
  -- Criar descrição do lançamento
  descricao_lancamento := 'Pagamento de ' || conta_info.descricao;
  IF conta_info.fornecedor_nome IS NOT NULL THEN
    descricao_lancamento := descricao_lancamento || ' - ' || conta_info.fornecedor_nome;
  END IF;
  
  -- Inserir lançamento no fluxo de caixa
  INSERT INTO fluxo_caixa (
    tipo,
    valor,
    data,
    descricao,
    categoria_id,
    centro_custo_id,
    forma_pagamento_id,
    conta_bancaria_id,
    conta_pagar_id,
    pagamento_id,
    origem,
    observacoes
  ) VALUES (
    'saida',
    NEW.valor_pagamento,
    NEW.data_pagamento,
    descricao_lancamento,
    conta_info.categoria_id,
    conta_info.centro_custo_id,
    NEW.forma_pagamento_id,
    NEW.conta_bancaria_id,
    NEW.conta_pagar_id,
    NEW.id,
    'conta_pagar',
    NEW.observacoes
  );
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Função para remover lançamento do fluxo de caixa quando pagamento é excluído
CREATE OR REPLACE FUNCTION remover_lancamento_fluxo_caixa()
RETURNS TRIGGER AS $$
BEGIN
  -- Remover lançamento correspondente no fluxo de caixa
  DELETE FROM fluxo_caixa 
  WHERE pagamento_id = OLD.id;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

-- Função para atualizar lançamento do fluxo de caixa quando pagamento é editado
CREATE OR REPLACE FUNCTION atualizar_lancamento_fluxo_caixa()
RETURNS TRIGGER AS $$
DECLARE
  conta_info RECORD;
  descricao_lancamento text;
BEGIN
  -- Buscar informações da conta a pagar
  SELECT 
    cp.descricao,
    cp.categoria_id,
    cp.centro_custo_id,
    f.nome as fornecedor_nome
  INTO conta_info
  FROM contas_pagar cp
  LEFT JOIN fornecedores f ON cp.fornecedor_id = f.id
  WHERE cp.id = NEW.conta_pagar_id;
  
  -- Criar descrição do lançamento
  descricao_lancamento := 'Pagamento de ' || conta_info.descricao;
  IF conta_info.fornecedor_nome IS NOT NULL THEN
    descricao_lancamento := descricao_lancamento || ' - ' || conta_info.fornecedor_nome;
  END IF;
  
  -- Atualizar lançamento no fluxo de caixa
  UPDATE fluxo_caixa 
  SET 
    valor = NEW.valor_pagamento,
    data = NEW.data_pagamento,
    descricao = descricao_lancamento,
    categoria_id = conta_info.categoria_id,
    centro_custo_id = conta_info.centro_custo_id,
    forma_pagamento_id = NEW.forma_pagamento_id,
    conta_bancaria_id = NEW.conta_bancaria_id,
    observacoes = NEW.observacoes
  WHERE pagamento_id = NEW.id;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar triggers para integração automática
DROP TRIGGER IF EXISTS trg_pagamento_criar_fluxo ON pagamentos_contas;
CREATE TRIGGER trg_pagamento_criar_fluxo
  AFTER INSERT ON pagamentos_contas
  FOR EACH ROW EXECUTE FUNCTION criar_lancamento_fluxo_caixa();

DROP TRIGGER IF EXISTS trg_pagamento_remover_fluxo ON pagamentos_contas;
CREATE TRIGGER trg_pagamento_remover_fluxo
  BEFORE DELETE ON pagamentos_contas
  FOR EACH ROW EXECUTE FUNCTION remover_lancamento_fluxo_caixa();

DROP TRIGGER IF EXISTS trg_pagamento_atualizar_fluxo ON pagamentos_contas;
CREATE TRIGGER trg_pagamento_atualizar_fluxo
  AFTER UPDATE ON pagamentos_contas
  FOR EACH ROW EXECUTE FUNCTION atualizar_lancamento_fluxo_caixa();

-- View para projeção de fluxo de caixa
CREATE OR REPLACE VIEW vw_projecao_fluxo_caixa AS
-- Lançamentos reais do fluxo de caixa
SELECT 
  fc.id,
  fc.data,
  fc.descricao,
  cat.nome as categoria,
  cat.caminho_completo as categoria_completa,
  cc.nome as centro_custo,
  fp.nome as forma_pagamento,
  bc.banco as conta_bancaria,
  CASE 
    WHEN fc.tipo = 'entrada' THEN fc.valor
    ELSE -fc.valor
  END as valor,
  'realizado' as status,
  fc.origem,
  fc.observacoes,
  fc.criado_em
FROM fluxo_caixa fc
LEFT JOIN vw_categoria_tree cat ON fc.categoria_id = cat.id
LEFT JOIN centros_custo cc ON fc.centro_custo_id = cc.id
LEFT JOIN formas_pagamento fp ON fc.forma_pagamento_id = fp.id
LEFT JOIN bancos_contas bc ON fc.conta_bancaria_id = bc.id

UNION ALL

-- Contas a pagar em aberto (projeção)
SELECT 
  cp.id,
  cp.data_vencimento as data,
  'Previsão: ' || cp.descricao as descricao,
  cat.nome as categoria,
  cat.caminho_completo as categoria_completa,
  cc.nome as centro_custo,
  fp.nome as forma_pagamento,
  NULL as conta_bancaria,
  -cp.saldo_restante as valor,
  CASE 
    WHEN cp.data_vencimento < CURRENT_DATE THEN 'vencido'
    ELSE 'previsto'
  END as status,
  'conta_pagar' as origem,
  cp.observacoes,
  cp.criado_em
FROM contas_pagar cp
LEFT JOIN vw_categoria_tree cat ON cp.categoria_id = cat.id
LEFT JOIN centros_custo cc ON cp.centro_custo_id = cc.id
LEFT JOIN formas_pagamento fp ON cp.forma_pagamento_id = fp.id
WHERE cp.status IN ('em_aberto', 'parcialmente_pago', 'vencido')
AND cp.saldo_restante > 0

ORDER BY data DESC;

-- View para indicadores do dashboard
CREATE OR REPLACE VIEW vw_indicadores_financeiros AS
WITH 
contas_abertas AS (
  SELECT 
    COUNT(*) as total_contas_abertas,
    COALESCE(SUM(saldo_restante), 0) as valor_contas_abertas
  FROM contas_pagar 
  WHERE status IN ('em_aberto', 'parcialmente_pago')
),
contas_vencidas AS (
  SELECT 
    COUNT(*) as total_contas_vencidas,
    COALESCE(SUM(saldo_restante), 0) as valor_contas_vencidas
  FROM contas_pagar 
  WHERE status = 'vencido' OR (
    status IN ('em_aberto', 'parcialmente_pago') 
    AND data_vencimento < CURRENT_DATE
  )
),
proximo_mes AS (
  SELECT 
    COALESCE(SUM(saldo_restante), 0) as valor_proximo_mes
  FROM contas_pagar 
  WHERE status IN ('em_aberto', 'parcialmente_pago', 'vencido')
  AND data_vencimento BETWEEN CURRENT_DATE AND (CURRENT_DATE + INTERVAL '30 days')
),
saldo_real AS (
  SELECT 
    COALESCE(SUM(
      CASE 
        WHEN tipo = 'entrada' THEN valor
        ELSE -valor
      END
    ), 0) as saldo_fluxo_caixa
  FROM fluxo_caixa
),
saldo_projetado AS (
  SELECT 
    COALESCE(SUM(valor), 0) as saldo_com_projecao
  FROM vw_projecao_fluxo_caixa
  WHERE status = 'realizado'
)
SELECT 
  ca.total_contas_abertas,
  ca.valor_contas_abertas,
  cv.total_contas_vencidas,
  cv.valor_contas_vencidas,
  pm.valor_proximo_mes,
  sr.saldo_fluxo_caixa,
  (sr.saldo_fluxo_caixa - ca.valor_contas_abertas) as saldo_projetado
FROM contas_abertas ca
CROSS JOIN contas_vencidas cv
CROSS JOIN proximo_mes pm
CROSS JOIN saldo_real sr
CROSS JOIN saldo_projetado sp;

-- Inserir alguns lançamentos de exemplo no fluxo de caixa
INSERT INTO fluxo_caixa (
  tipo,
  valor,
  data,
  descricao,
  origem,
  observacoes
) VALUES 
(
  'entrada',
  5000.00,
  CURRENT_DATE - INTERVAL '2 days',
  'Vendas do final de semana',
  'manual',
  'Vendas de sexta e sábado'
),
(
  'entrada',
  3200.00,
  CURRENT_DATE - INTERVAL '1 day',
  'Evento corporativo',
  'manual',
  'Happy hour empresa XYZ'
),
(
  'saida',
  800.00,
  CURRENT_DATE - INTERVAL '3 days',
  'Compra de bebidas',
  'manual',
  'Reposição de estoque'
)
ON CONFLICT DO NOTHING;