/*
  # View para Facilitar Categorização de Lançamentos
  
  1. Objetivo
    - Criar uma view que liste todos os lançamentos sem categoria
    - Facilitar a identificação e categorização desses lançamentos
    - Permitir análise rápida dos valores não classificados
  
  2. Estrutura
    - Lista completa de lançamentos sem categoria
    - Informações necessárias para categorização
    - Ordenado por data (mais recentes primeiro)
*/

CREATE OR REPLACE VIEW vw_fluxo_caixa_sem_categoria AS
SELECT 
  fc.id,
  fc.tipo,
  fc.valor,
  fc.data,
  fc.descricao,
  fc.centro_custo_id,
  cc.nome as centro_custo_nome,
  fc.forma_pagamento_id,
  fp.nome as forma_pagamento_nome,
  fc.conta_bancaria_id,
  bc.banco as conta_bancaria_banco,
  bc.tipo_conta as conta_bancaria_tipo,
  fc.origem,
  fc.observacoes,
  fc.criado_por,
  u.nome as criado_por_nome,
  fc.criado_em,
  EXTRACT(YEAR FROM fc.data) as ano,
  EXTRACT(MONTH FROM fc.data) as mes,
  CASE 
    WHEN fc.tipo = 'entrada' THEN 'Receita'
    ELSE 'Despesa'
  END as tipo_nome
FROM fluxo_caixa fc
LEFT JOIN centros_custo cc ON fc.centro_custo_id = cc.id
LEFT JOIN formas_pagamento fp ON fc.forma_pagamento_id = fp.id
LEFT JOIN bancos_contas bc ON fc.conta_bancaria_id = bc.id
LEFT JOIN usuarios u ON fc.criado_por = u.id
WHERE fc.categoria_id IS NULL
ORDER BY fc.data DESC, fc.criado_em DESC;

-- Adicionar RLS
ALTER VIEW vw_fluxo_caixa_sem_categoria SET (security_invoker = on);

-- Criar função para categorizar lançamento em lote
CREATE OR REPLACE FUNCTION categorizar_lancamento_fluxo(
  p_lancamento_id uuid,
  p_categoria_id uuid
)
RETURNS void AS $$
BEGIN
  UPDATE fluxo_caixa
  SET categoria_id = p_categoria_id
  WHERE id = p_lancamento_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar função para categorizar múltiplos lançamentos
CREATE OR REPLACE FUNCTION categorizar_lancamentos_lote(
  p_lancamento_ids uuid[],
  p_categoria_id uuid
)
RETURNS integer AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE fluxo_caixa
  SET categoria_id = p_categoria_id
  WHERE id = ANY(p_lancamento_ids);
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Criar view de resumo dos lançamentos não categorizados
CREATE OR REPLACE VIEW vw_resumo_lancamentos_sem_categoria AS
SELECT 
  EXTRACT(YEAR FROM fc.data) as ano,
  EXTRACT(MONTH FROM fc.data) as mes,
  fc.tipo,
  CASE 
    WHEN fc.tipo = 'entrada' THEN 'Receita'
    ELSE 'Despesa'
  END as tipo_nome,
  COUNT(*) as quantidade,
  SUM(fc.valor) as valor_total
FROM fluxo_caixa fc
WHERE fc.categoria_id IS NULL
GROUP BY 
  EXTRACT(YEAR FROM fc.data),
  EXTRACT(MONTH FROM fc.data),
  fc.tipo
ORDER BY ano DESC, mes DESC, fc.tipo;

-- Adicionar RLS
ALTER VIEW vw_resumo_lancamentos_sem_categoria SET (security_invoker = on);
