/*
  # Corrigir status de contas a pagar e melhorar view

  1. Correcao de Dados
    - Atualiza contas com saldo_restante = 0 que estao incorretamente como 'em_aberto' para 'pago'
    - Define data_baixa_integral para contas corrigidas

  2. Melhoria na View vw_contas_pagar
    - Adiciona campo `situacao_vencimento`: 'atrasada', 'vence_hoje', 'vence_em_breve', 'no_prazo', 'paga', 'cancelada'
    - Adiciona campo `dias_para_vencer` (positivo = dias restantes, negativo = dias de atraso)
    - Corrige `status` em tempo real para contas com saldo zero
    - Melhora `esta_vencida` para tambem considerar contas com status autorizado_pagamento

  3. Correcao do Trigger normalize_status
    - Corrige mapeamento cancelado/cancelada
    - Adiciona tratamento para status invalidos como 'pendente' e 'parcial'

  4. Notas
    - Nenhuma coluna removida ou tabela alterada destrutivamente
    - Apenas atualizacoes de status em contas com saldo zero
*/

-- 1. Corrigir contas com saldo zero que estao como em_aberto
UPDATE contas_pagar
SET 
  status = 'pago',
  data_baixa_integral = COALESCE(data_baixa_integral, data_primeira_baixa, now()),
  atualizado_em = now()
WHERE saldo_restante <= 0 
  AND status NOT IN ('pago', 'cancelado');

-- 2. Corrigir o trigger de normalize para nao gerar status invalido
CREATE OR REPLACE FUNCTION contas_pagar_normalize_status()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IS NULL THEN
    NEW.status := 'em_aberto';
  ELSE
    NEW.status := lower(NEW.status);
    IF NEW.status IN ('em aberto','aberta','aberto') THEN
      NEW.status := 'em_aberto';
    ELSIF NEW.status IN ('paga','quitada','quitado','pago') THEN
      NEW.status := 'pago';
    ELSIF NEW.status IN ('cancelado','cancelada') THEN
      NEW.status := 'cancelado';
    ELSIF NEW.status IN ('parcial','parcialmente pago','parcialmente_pago') THEN
      NEW.status := 'parcialmente_pago';
    ELSIF NEW.status IN ('agendada','agendado','pendente') THEN
      NEW.status := 'em_aberto';
    ELSIF NEW.status IN ('autorizado','autorizado_pagamento') THEN
      NEW.status := 'autorizado_pagamento';
    ELSIF NEW.status IN ('vencido','vencida') THEN
      NEW.status := 'vencido';
    END IF;
    NEW.status := replace(NEW.status, ' ', '_');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 3. Dropar e recriar view com campos melhorados
DROP VIEW IF EXISTS vw_contas_pagar_pendentes;
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
  CASE
    WHEN cp.saldo_restante <= 0 AND cp.status NOT IN ('cancelado') THEN 'pago'
    ELSE cp.status
  END AS status,
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
  cp.eh_recorrente,
  cp.frequencia_recorrencia,
  cp.dia_vencimento_recorrente,
  cp.recorrencia_ativa,
  cp.data_inicio_recorrencia,
  cp.data_fim_recorrencia,
  cp.eh_parcelado,
  cp.numero_parcela,
  cp.total_parcelas,
  cp.parcelamento_grupo_id,
  cp.valor_original,
  cp.valor_final,
  cp.desconto,
  cp.juros,
  f.nome AS fornecedor_nome,
  f.categoria_padrao_id AS fornecedor_categoria_padrao,
  cat.nome AS categoria_nome,
  cat.caminho_completo AS categoria_completa,
  cc.nome AS centro_custo_nome,
  fp.nome AS forma_pagamento_nome,
  u_criado.nome AS criado_por_nome,
  u_aprovado.nome AS aprovado_por_nome,
  u_sugerido.nome AS sugerido_por_nome,
  CASE
    WHEN cp.saldo_restante <= 0 AND cp.status NOT IN ('cancelado') THEN false
    WHEN cp.data_vencimento < CURRENT_DATE AND cp.status IN ('em_aberto', 'parcialmente_pago', 'autorizado_pagamento') THEN true
    ELSE false
  END AS esta_vencida,
  (CURRENT_DATE - cp.data_vencimento) AS dias_vencimento,
  CASE
    WHEN cp.saldo_restante <= 0 AND cp.status NOT IN ('cancelado') THEN 'paga'
    WHEN cp.status = 'cancelado' THEN 'cancelada'
    WHEN cp.data_vencimento < CURRENT_DATE AND cp.saldo_restante > 0 THEN 'atrasada'
    WHEN cp.data_vencimento = CURRENT_DATE AND cp.saldo_restante > 0 THEN 'vence_hoje'
    WHEN cp.data_vencimento <= (CURRENT_DATE + INTERVAL '7 days') AND cp.saldo_restante > 0 THEN 'vence_em_breve'
    WHEN cp.saldo_restante > 0 THEN 'no_prazo'
    ELSE 'paga'
  END AS situacao_vencimento,
  (cp.data_vencimento - CURRENT_DATE) AS dias_para_vencer,
  (SELECT count(*) FROM pagamentos_contas pc WHERE pc.conta_pagar_id = cp.id) AS total_pagamentos_parciais,
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
  )
  FROM pagamentos_contas pc
  LEFT JOIN formas_pagamento fp2 ON pc.forma_pagamento_id = fp2.id
  LEFT JOIN bancos_contas bc ON pc.conta_bancaria_id = bc.id
  WHERE pc.conta_pagar_id = cp.id) AS pagamentos_historico
FROM contas_pagar cp
LEFT JOIN fornecedores f ON cp.fornecedor_id = f.id
LEFT JOIN vw_categoria_tree cat ON cp.categoria_id = cat.id
LEFT JOIN centros_custo cc ON cp.centro_custo_id = cc.id
LEFT JOIN formas_pagamento fp ON cp.forma_pagamento_id = fp.id
LEFT JOIN usuarios u_criado ON cp.criado_por = u_criado.id
LEFT JOIN usuarios u_aprovado ON cp.aprovado_por = u_aprovado.id
LEFT JOIN usuarios u_sugerido ON cp.sugerido_por = u_sugerido.id;

-- 4. Recriar view de contas pendentes
CREATE OR REPLACE VIEW vw_contas_pagar_pendentes AS
SELECT *
FROM vw_contas_pagar
WHERE status IN ('em_aberto', 'parcialmente_pago', 'vencido')
AND (aprovado_para_pagamento IS NULL OR aprovado_para_pagamento = false);
