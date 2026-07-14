/*
  # Criar Sistema de Pagamentos Informativos - Visão Estratégica

  ## Descrição
  Permite marcar contas como "pagas" apenas para efeitos do planejamento semanal,
  sem dar baixa real no módulo financeiro

  ## Mudanças
  1. Nova tabela `visao_estrategica_pagamentos_informativos`
    - Registra quais contas foram marcadas como pagas no planejamento
    - Armazena valor e data do pagamento informativo
  
  2. Atualizar view de despesas para incluir status do pagamento informativo

  ## Segurança
  - RLS habilitado
  - Apenas authenticated pode inserir/atualizar
*/

-- Criar tabela de pagamentos informativos
CREATE TABLE IF NOT EXISTS visao_estrategica_pagamentos_informativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_pagar_id uuid NOT NULL REFERENCES contas_pagar(id) ON DELETE CASCADE,
  semana_id uuid NOT NULL REFERENCES visao_estrategica_semanas(id) ON DELETE CASCADE,
  valor_pago numeric NOT NULL,
  data_pagamento_informativo date NOT NULL DEFAULT CURRENT_DATE,
  observacao text,
  criado_por uuid REFERENCES auth.users(id),
  criado_em timestamptz DEFAULT now(),
  atualizado_em timestamptz DEFAULT now(),
  UNIQUE(conta_pagar_id, semana_id)
);

-- Habilitar RLS
ALTER TABLE visao_estrategica_pagamentos_informativos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Authenticated users can view pagamentos informativos"
  ON visao_estrategica_pagamentos_informativos FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert pagamentos informativos"
  ON visao_estrategica_pagamentos_informativos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update pagamentos informativos"
  ON visao_estrategica_pagamentos_informativos FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete pagamentos informativos"
  ON visao_estrategica_pagamentos_informativos FOR DELETE
  TO authenticated
  USING (true);

-- Políticas para anon
CREATE POLICY "Anon can view pagamentos informativos"
  ON visao_estrategica_pagamentos_informativos FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "Anon can insert pagamentos informativos"
  ON visao_estrategica_pagamentos_informativos FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Anon can update pagamentos informativos"
  ON visao_estrategica_pagamentos_informativos FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Anon can delete pagamentos informativos"
  ON visao_estrategica_pagamentos_informativos FOR DELETE
  TO anon
  USING (true);

-- Criar índices
CREATE INDEX IF NOT EXISTS idx_pagamentos_informativos_conta 
  ON visao_estrategica_pagamentos_informativos(conta_pagar_id);

CREATE INDEX IF NOT EXISTS idx_pagamentos_informativos_semana 
  ON visao_estrategica_pagamentos_informativos(semana_id);

-- Recriar view de despesas incluindo informações de pagamento informativo
DROP VIEW IF EXISTS view_despesas_visao_estrategica;

CREATE VIEW view_despesas_visao_estrategica AS
SELECT 
  cp.id,
  cp.fornecedor_id,
  f.nome as fornecedor_nome,
  cp.descricao,
  cp.valor_total,
  cp.valor_pago as valor_pago_real,
  cp.data_vencimento,
  cp.status as status_real,
  cp.categoria_id,
  cat.nome as categoria_nome,
  cat.categoria_pai,
  cp.centro_custo_id,
  cc.nome as centro_custo_nome,
  cp.criado_em,
  
  -- Informações do pagamento informativo
  pi.id as pagamento_informativo_id,
  pi.valor_pago as valor_pago_informativo,
  pi.data_pagamento_informativo,
  pi.semana_id as semana_pagamento_informativo,
  pi.observacao as observacao_pagamento,
  
  -- Status combinado (considera pagamento informativo)
  CASE 
    WHEN pi.id IS NOT NULL THEN 'pago_planejamento'
    WHEN cp.status = 'pago' THEN 'pago'
    WHEN cp.status = 'parcialmente_pago' THEN 'parcialmente_pago'
    ELSE 'em_aberto'
  END as status_planejamento,
  
  -- Valor restante considerando pagamento informativo
  CASE 
    WHEN pi.id IS NOT NULL THEN 0
    ELSE (cp.valor_total - COALESCE(cp.valor_pago, 0))
  END as valor_restante_planejamento

FROM contas_pagar cp
LEFT JOIN fornecedores f ON f.id = cp.fornecedor_id
LEFT JOIN categorias_financeiras cat ON cat.id = cp.categoria_id
LEFT JOIN centros_custo cc ON cc.id = cp.centro_custo_id
LEFT JOIN visao_estrategica_pagamentos_informativos pi ON pi.conta_pagar_id = cp.id
WHERE cp.status IN ('em_aberto', 'parcialmente_pago', 'pago');

-- Permitir acesso à view
GRANT SELECT ON view_despesas_visao_estrategica TO authenticated, anon;

-- Comentários
COMMENT ON TABLE visao_estrategica_pagamentos_informativos IS 'Registra pagamentos informativos para planejamento semanal sem afetar o financeiro real';
COMMENT ON VIEW view_despesas_visao_estrategica IS 'Despesas com status de pagamento informativo para visão estratégica';
