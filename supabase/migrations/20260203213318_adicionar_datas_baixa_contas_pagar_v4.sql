/*
  # Adicionar Datas de Baixa às Contas a Pagar
  
  1. Alterações na Tabela contas_pagar
    - `data_primeira_baixa` (timestamptz) - Data da primeira baixa (parcial ou integral)
    - `data_baixa_integral` (timestamptz) - Data da baixa completa (quando status = 'pago')
    
  2. Atualizar a View vw_contas_pagar
    - Incluir as novas colunas de datas de baixa
    - Incluir informações dos pagamentos parciais realizados
    
  3. Atualizar Trigger para Gerenciar Datas Automaticamente
    - Atualizar data_primeira_baixa no primeiro pagamento
    - Atualizar data_baixa_integral quando saldo chegar a zero
*/

-- Adicionar colunas de datas de baixa na tabela contas_pagar
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contas_pagar' AND column_name = 'data_primeira_baixa'
  ) THEN
    ALTER TABLE contas_pagar ADD COLUMN data_primeira_baixa timestamptz;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'contas_pagar' AND column_name = 'data_baixa_integral'
  ) THEN
    ALTER TABLE contas_pagar ADD COLUMN data_baixa_integral timestamptz;
  END IF;
END $$;

-- Atualizar o trigger que gerencia o status para também gerenciar as datas
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

-- Recriar o trigger
DROP TRIGGER IF EXISTS trg_pagamentos_contas_status ON pagamentos_contas;
CREATE TRIGGER trg_pagamentos_contas_status
  AFTER INSERT OR UPDATE OR DELETE ON pagamentos_contas
  FOR EACH ROW EXECUTE FUNCTION atualizar_status_conta_pagar();

-- Dropar views dependentes primeiro e depois recriar
DROP VIEW IF EXISTS vw_contas_pagar_pendentes CASCADE;
DROP VIEW IF EXISTS vw_contas_pagar CASCADE;

CREATE VIEW vw_contas_pagar AS
SELECT 
  cp.id,
  cp.fornecedor_id,
  cp.descricao,
  cp.categoria_id,
  cp.centro_custo_id,
  cp.forma_pagamento_id,
  cp.valor_total,
  cp.valor_pago,
  cp.saldo_restante,
  cp.data_vencimento,
  cp.data_emissao,
  cp.numero_documento,
  cp.status,
  cp.aprovado_para_pagamento,
  cp.aprovado_por,
  cp.data_aprovacao,
  cp.data_primeira_baixa,
  cp.data_baixa_integral,
  cp.observacoes,
  cp.criado_por,
  cp.criado_em,
  cp.atualizado_em,
  cp.tipo_pagamento,
  cp.prioridade_sugerida,
  cp.observacao_tesouraria,
  cp.observacao_aprovacao,
  cp.sugerido_por,
  cp.data_sugestao,
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
LEFT JOIN vw_categoria_tree cat ON cp.categoria_id = cat.id
LEFT JOIN centros_custo cc ON cp.centro_custo_id = cc.id
LEFT JOIN formas_pagamento fp ON cp.forma_pagamento_id = fp.id
LEFT JOIN usuarios u_criado ON cp.criado_por = u_criado.id
LEFT JOIN usuarios u_aprovado ON cp.aprovado_por = u_aprovado.id
LEFT JOIN usuarios u_sugerido ON cp.sugerido_por = u_sugerido.id;

-- Recriar a view dependente
CREATE VIEW vw_contas_pagar_pendentes AS
SELECT * FROM vw_contas_pagar
WHERE status IN ('em_aberto', 'parcialmente_pago', 'vencido')
AND aprovado_para_pagamento = true;

-- Atualizar contas existentes com pagamentos para preencher as datas
UPDATE contas_pagar cp
SET 
  data_primeira_baixa = (
    SELECT MIN(pc.criado_em)
    FROM pagamentos_contas pc
    WHERE pc.conta_pagar_id = cp.id
  ),
  data_baixa_integral = (
    CASE 
      WHEN cp.status = 'pago' THEN (
        SELECT MAX(pc.criado_em)
        FROM pagamentos_contas pc
        WHERE pc.conta_pagar_id = cp.id
      )
      ELSE NULL
    END
  )
WHERE EXISTS (
  SELECT 1 FROM pagamentos_contas pc WHERE pc.conta_pagar_id = cp.id
);
