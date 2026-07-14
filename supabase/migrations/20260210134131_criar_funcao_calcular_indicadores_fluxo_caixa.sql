/*
  # Criar Função para Calcular Indicadores do Fluxo de Caixa
  
  1. Objetivo
    - Calcular indicadores precisos baseados no extrato linha a linha
    - Garantir consistência total nos valores
    - Comportamento igual a um extrato bancário
  
  2. Funcionamento
    - Recebe filtros: data inicial, data final, conta bancária
    - Calcula saldo anterior ao período (último saldo antes da data inicial)
    - Soma entradas e saídas do período filtrado
    - Retorna saldo final baseado no último registro do período
  
  3. Retorno
    - saldo_anterior: Saldo acumulado até o dia anterior à data inicial
    - entradas_periodo: Total de entradas no período
    - saidas_periodo: Total de saídas no período
    - saldo_periodo: Diferença entre entradas e saídas do período
    - saldo_final: Saldo acumulado no final do período
    - total_transacoes: Quantidade de transações no período
*/

-- Criar função para calcular indicadores
CREATE OR REPLACE FUNCTION calcular_indicadores_fluxo_caixa(
  p_data_inicial DATE,
  p_data_final DATE,
  p_conta_bancaria_id UUID DEFAULT NULL
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

  -- 3. Calcular totais do período
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
    AND (p_conta_bancaria_id IS NULL OR e.conta_bancaria_id = p_conta_bancaria_id);

  -- Se não houver transações no período, retornar zeros
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT v_saldo_anterior, 0::NUMERIC, 0::NUMERIC, 0::NUMERIC, v_saldo_anterior, 0::BIGINT;
  END IF;
END;
$$;

-- Permitir acesso autenticado
GRANT EXECUTE ON FUNCTION calcular_indicadores_fluxo_caixa TO authenticated;

-- Adicionar comentário
COMMENT ON FUNCTION calcular_indicadores_fluxo_caixa IS 'Calcula indicadores do fluxo de caixa com precisão de extrato bancário, garantindo valores consistentes';