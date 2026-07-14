/*
  # Aprovação de Contas a Pagar com Priorização Colaborativa

  1. Schema Changes
    - Add prioridade_sugerida to contas_pagar
    - Add observacao_tesouraria to contas_pagar
    - Add observacao_aprovacao to contas_pagar
    - Add sugerido_por and data_sugestao to contas_pagar
    - Create log_alteracoes_contas table for tracking changes
    - Create ordem_pagamento_consolidada view

  2. Functions
    - Create function to log changes to contas_pagar
    - Create trigger to automatically log changes

  3. Security
    - Maintain existing RLS policies
*/

-- Add new fields to contas_pagar table
DO $$
BEGIN
  -- Add prioridade_sugerida field
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contas_pagar' AND column_name = 'prioridade_sugerida'
  ) THEN
    ALTER TABLE contas_pagar ADD COLUMN prioridade_sugerida text CHECK (prioridade_sugerida IN ('baixa', 'media', 'alta', 'urgente'));
  END IF;
  
  -- Add observacao_tesouraria field
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contas_pagar' AND column_name = 'observacao_tesouraria'
  ) THEN
    ALTER TABLE contas_pagar ADD COLUMN observacao_tesouraria text;
  END IF;
  
  -- Add observacao_aprovacao field
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contas_pagar' AND column_name = 'observacao_aprovacao'
  ) THEN
    ALTER TABLE contas_pagar ADD COLUMN observacao_aprovacao text;
  END IF;
  
  -- Add sugerido_por field
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contas_pagar' AND column_name = 'sugerido_por'
  ) THEN
    ALTER TABLE contas_pagar ADD COLUMN sugerido_por uuid;
  END IF;
  
  -- Add data_sugestao field
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contas_pagar' AND column_name = 'data_sugestao'
  ) THEN
    ALTER TABLE contas_pagar ADD COLUMN data_sugestao timestamptz;
  END IF;
END $$;

-- Create log_alteracoes_contas table for tracking changes
CREATE TABLE IF NOT EXISTS log_alteracoes_contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conta_id uuid NOT NULL REFERENCES contas_pagar(id) ON DELETE CASCADE,
  usuario_id uuid,
  usuario_nome text,
  tipo_alteracao text NOT NULL,
  campo_alterado text NOT NULL,
  valor_anterior text,
  valor_novo text,
  data_alteracao timestamptz DEFAULT now()
);

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_log_alteracoes_conta ON log_alteracoes_contas(conta_id);
CREATE INDEX IF NOT EXISTS idx_log_alteracoes_usuario ON log_alteracoes_contas(usuario_id);
CREATE INDEX IF NOT EXISTS idx_log_alteracoes_data ON log_alteracoes_contas(data_alteracao);

-- Function to log changes to contas_pagar
CREATE OR REPLACE FUNCTION registrar_alteracao_conta()
RETURNS TRIGGER AS $$
DECLARE
  usuario_nome text;
  campo text;
  valor_anterior text;
  valor_novo text;
BEGIN
  -- Get user name if available
  SELECT nome INTO usuario_nome FROM usuarios WHERE id = NEW.criado_por;
  
  -- Check which fields changed
  IF OLD.prioridade_sugerida IS DISTINCT FROM NEW.prioridade_sugerida THEN
    INSERT INTO log_alteracoes_contas (
      conta_id, 
      usuario_id, 
      usuario_nome, 
      tipo_alteracao, 
      campo_alterado, 
      valor_anterior, 
      valor_novo
    ) VALUES (
      NEW.id,
      NEW.sugerido_por,
      usuario_nome,
      'prioridade',
      'prioridade_sugerida',
      OLD.prioridade_sugerida::text,
      NEW.prioridade_sugerida::text
    );
  END IF;
  
  IF OLD.observacao_tesouraria IS DISTINCT FROM NEW.observacao_tesouraria THEN
    INSERT INTO log_alteracoes_contas (
      conta_id, 
      usuario_id, 
      usuario_nome, 
      tipo_alteracao, 
      campo_alterado, 
      valor_anterior, 
      valor_novo
    ) VALUES (
      NEW.id,
      NEW.sugerido_por,
      usuario_nome,
      'observacao',
      'observacao_tesouraria',
      OLD.observacao_tesouraria,
      NEW.observacao_tesouraria
    );
  END IF;
  
  IF OLD.aprovado_para_pagamento IS DISTINCT FROM NEW.aprovado_para_pagamento THEN
    INSERT INTO log_alteracoes_contas (
      conta_id, 
      usuario_id, 
      usuario_nome, 
      tipo_alteracao, 
      campo_alterado, 
      valor_anterior, 
      valor_novo
    ) VALUES (
      NEW.id,
      NEW.aprovado_por,
      usuario_nome,
      'aprovacao',
      'aprovado_para_pagamento',
      OLD.aprovado_para_pagamento::text,
      NEW.aprovado_para_pagamento::text
    );
  END IF;
  
  IF OLD.observacao_aprovacao IS DISTINCT FROM NEW.observacao_aprovacao THEN
    INSERT INTO log_alteracoes_contas (
      conta_id, 
      usuario_id, 
      usuario_nome, 
      tipo_alteracao, 
      campo_alterado, 
      valor_anterior, 
      valor_novo
    ) VALUES (
      NEW.id,
      NEW.aprovado_por,
      usuario_nome,
      'observacao',
      'observacao_aprovacao',
      OLD.observacao_aprovacao,
      NEW.observacao_aprovacao
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for logging changes
DROP TRIGGER IF EXISTS trg_log_alteracoes_contas ON contas_pagar;
CREATE TRIGGER trg_log_alteracoes_contas
  AFTER UPDATE ON contas_pagar
  FOR EACH ROW
  WHEN (
    OLD.prioridade_sugerida IS DISTINCT FROM NEW.prioridade_sugerida OR
    OLD.observacao_tesouraria IS DISTINCT FROM NEW.observacao_tesouraria OR
    OLD.aprovado_para_pagamento IS DISTINCT FROM NEW.aprovado_para_pagamento OR
    OLD.observacao_aprovacao IS DISTINCT FROM NEW.observacao_aprovacao
  )
  EXECUTE FUNCTION registrar_alteracao_conta();

-- Create view for consolidated payment order
CREATE OR REPLACE VIEW ordem_pagamento_consolidada AS
SELECT
  cp.id AS conta_id,
  cp.descricao,
  f.nome AS fornecedor,
  cp.valor_total,
  cp.valor_pago,
  cp.saldo_restante,
  cp.data_emissao,
  cp.data_vencimento,
  cp.numero_documento,
  cp.status,
  cp.prioridade_sugerida,
  cp.observacao_tesouraria,
  cp.aprovado_para_pagamento,
  u_gestor.nome AS gestor_aprovador,
  cp.data_aprovacao,
  cp.observacao_aprovacao,
  u_tesouraria.nome AS sugerido_por_nome,
  cp.data_sugestao,
  cat.nome AS categoria_nome,
  cc.nome AS centro_custo_nome,
  fp.nome AS forma_pagamento_nome,
  CASE 
    WHEN cp.data_vencimento < CURRENT_DATE AND cp.status IN ('em_aberto', 'parcialmente_pago') THEN true
    ELSE false
  END as esta_vencida,
  (CURRENT_DATE - cp.data_vencimento) as dias_vencimento
FROM contas_pagar cp
LEFT JOIN fornecedores f ON cp.fornecedor_id = f.id
LEFT JOIN usuarios u_gestor ON cp.aprovado_por = u_gestor.id
LEFT JOIN usuarios u_tesouraria ON cp.sugerido_por = u_tesouraria.id
LEFT JOIN vw_categoria_tree cat ON cp.categoria_id = cat.id
LEFT JOIN centros_custo cc ON cp.centro_custo_id = cc.id
LEFT JOIN formas_pagamento fp ON cp.forma_pagamento_id = fp.id
ORDER BY
  CASE 
    WHEN cp.prioridade_sugerida = 'urgente' THEN 1
    WHEN cp.prioridade_sugerida = 'alta' THEN 2
    WHEN cp.prioridade_sugerida = 'media' THEN 3
    WHEN cp.prioridade_sugerida = 'baixa' THEN 4
    ELSE 5
  END,
  cp.data_vencimento ASC;

-- Create view for approved payment orders
CREATE OR REPLACE VIEW ordem_pagamento_autorizada AS
SELECT *
FROM ordem_pagamento_consolidada
WHERE aprovado_para_pagamento = true;

-- Update vw_contas_pagar view to include new fields
DROP VIEW IF EXISTS vw_contas_pagar;
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
  u_sugerido.nome as sugerido_por_nome,
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
LEFT JOIN usuarios u_aprovado ON cp.aprovado_por = u_aprovado.id
LEFT JOIN usuarios u_sugerido ON cp.sugerido_por = u_sugerido.id;

-- Create view for pending accounts
CREATE OR REPLACE VIEW vw_contas_pagar_pendentes AS
SELECT *
FROM vw_contas_pagar
WHERE status IN ('em_aberto', 'parcialmente_pago', 'vencido')
AND (aprovado_para_pagamento IS NULL OR aprovado_para_pagamento = false);

-- Create view for approval indicators
CREATE OR REPLACE VIEW vw_indicadores_aprovacao AS
SELECT
  COUNT(*) as total_contas_pendentes,
  COUNT(CASE WHEN prioridade_sugerida = 'urgente' THEN 1 END) as contas_urgentes,
  COUNT(CASE WHEN aprovado_para_pagamento = true THEN 1 END) as contas_aprovadas,
  SUM(CASE WHEN aprovado_para_pagamento = true THEN saldo_restante ELSE 0 END) as valor_aprovado,
  SUM(saldo_restante) as valor_total_pendente
FROM contas_pagar
WHERE status IN ('em_aberto', 'parcialmente_pago', 'vencido');

-- Add comments for documentation
COMMENT ON COLUMN contas_pagar.prioridade_sugerida IS 'Prioridade sugerida pela tesouraria (baixa, media, alta, urgente)';
COMMENT ON COLUMN contas_pagar.observacao_tesouraria IS 'Observações da tesouraria sobre a conta';
COMMENT ON COLUMN contas_pagar.observacao_aprovacao IS 'Observações do gestor no momento da aprovação';
COMMENT ON COLUMN contas_pagar.sugerido_por IS 'Usuário da tesouraria que sugeriu a prioridade';
COMMENT ON COLUMN contas_pagar.data_sugestao IS 'Data em que a prioridade foi sugerida';

COMMENT ON TABLE log_alteracoes_contas IS 'Histórico de alterações em contas a pagar para auditoria';
COMMENT ON VIEW ordem_pagamento_consolidada IS 'Visão consolidada para impressão da ordem de pagamento';
COMMENT ON VIEW ordem_pagamento_autorizada IS 'Visão filtrada apenas com contas aprovadas para pagamento';
COMMENT ON VIEW vw_contas_pagar_pendentes IS 'Contas a pagar pendentes de aprovação';
COMMENT ON VIEW vw_indicadores_aprovacao IS 'Indicadores para o painel de aprovação de contas';