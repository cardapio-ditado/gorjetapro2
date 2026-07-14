/*
  # Atualizar Função de Indicadores com Filtro por Tipo
  
  1. Objetivo
    - Adicionar suporte a filtro por tipo (entrada/saída) nos indicadores
    - Garantir que KPIs reflitam exatamente os filtros aplicados
  
  2. Mudanças
    - Dropar função antiga
    - Criar nova versão com parâmetro p_tipo
    - Filtrar transações por tipo quando especificado
  
  3. Comportamento
    - Se p_tipo é NULL: inclui todas as transações (comportamento atual)
    - Se p_tipo é 'entrada': inclui apenas entradas
    - Se p_tipo é 'saida': inclui apenas saídas
*/

-- Dropar função antiga
DROP FUNCTION IF EXISTS calcular_indicadores_fluxo_caixa(DATE, DATE, UUID);

-- Criar função com parâmetro adicional
CREATE OR REPLACE FUNCTION calcular_indicadores_fluxo_caixa(
  p_data_inicial DATE,
  p_data_final DATE,
  p_conta_bancaria_id UUID DEFAULT NULL,
  p_tipo TEXT DEFAULT NULL
)
RETURNS TABLE (
  saldo_anterior NUMERIC,
  entradas_periodo NUMERIC,
  saidas_periodo NUMERIC,
  saldo_periodo NUMERIC,
  saldo_final NUMERIC,
  total_transacoes BIGINT
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_saldo_anterior NUMERIC := 0;
  v_saldo_final NUMERIC := 0;
BEGIN
  -- 1. Buscar o último saldo ANTES do período (saldo anterior)
  -- Sempre busca sem filtro de tipo para ter o saldo real
  SELECT COALESCE(e.saldo_acumulado, 0)
  INTO v_saldo_anterior
  FROM view_extrato_fluxo_caixa e
  WHERE e.data < p_data_inicial
    AND (p_conta_bancaria_id IS NULL OR e.conta_bancaria_id = p_conta_bancaria_id)
  ORDER BY e.data DESC, e.id DESC
  LIMIT 1;

  -- Se não houver transações anteriores, o saldo anterior é zero
  v_saldo_anterior := COALESCE(v_saldo_anterior, 0);

  -- 2. Buscar o último saldo DO período (saldo final)
  -- Sempre busca sem filtro de tipo para ter o saldo real acumulado
  SELECT COALESCE(e.saldo_acumulado, v_saldo_anterior)
  INTO v_saldo_final
  FROM view_extrato_fluxo_caixa e
  WHERE e.data >= p_data_inicial 
    AND e.data <= p_data_final
    AND (p_conta_bancaria_id IS NULL OR e.conta_bancaria_id = p_conta_bancaria_id)
  ORDER BY e.data DESC, e.id DESC
  LIMIT 1;

  -- Se não houver transações no período, o saldo final é igual ao anterior
  v_saldo_final := COALESCE(v_saldo_final, v_saldo_anterior);

  -- 3. Calcular totais do período COM filtro de tipo se especificado
  RETURN QUERY
  SELECT 
    v_saldo_anterior,
    COALESCE(SUM(e.valor_entrada), 0) as entradas_periodo,
    COALESCE(SUM(e.valor_saida), 0) as saidas_periodo,
    COALESCE(SUM(e.valor_entrada) - SUM(e.valor_saida), 0) as saldo_periodo,
    v_saldo_final as saldo_final,
    COUNT(*)::BIGINT as total_transacoes
  FROM view_extrato_fluxo_caixa e
  WHERE e.data >= p_data_inicial 
    AND e.data <= p_data_final
    AND (p_conta_bancaria_id IS NULL OR e.conta_bancaria_id = p_conta_bancaria_id)
    AND (p_tipo IS NULL OR e.tipo = p_tipo);

  -- Se não houver transações no período, retornar zeros
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT v_saldo_anterior, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, v_saldo_anterior, 0::BIGINT;
  END IF;
END;
$$;

-- Garantir permissões
GRANT EXECUTE ON FUNCTION calcular_indicadores_fluxo_caixa TO authenticated;

-- Atualizar comentário
COMMENT ON FUNCTION calcular_indicadores_fluxo_caixa IS 'Calcula indicadores do fluxo de caixa com precisão de extrato bancário, suportando filtros por data, conta e tipo';
