/*
  # Atribuir centro de custo padrão para todas as contas
  
  1. Problema
    - Contas a pagar estão sendo criadas sem centro_custo_id
    - Lançamentos no fluxo_caixa ficam sem centro de custo correto
    - Sistema tem apenas 1 centro de custo ativo: "Ditado Popular"
  
  2. Solução
    - Atualizar todas as contas_pagar existentes com centro_custo_id do "Ditado Popular"
    - Atualizar lançamentos no fluxo_caixa correspondentes
    - Criar trigger para atribuir centro de custo automaticamente em novas contas
  
  3. Resultado
    - Todas as contas terão centro de custo correto
    - Relatórios DRE e financeiros funcionarão corretamente
    - Não haverá mais lançamentos duplicados
*/

-- Buscar ID do centro de custo "Ditado Popular"
DO $$
DECLARE
  v_centro_custo_id uuid;
BEGIN
  -- Buscar centro de custo ativo
  SELECT id INTO v_centro_custo_id
  FROM centros_custo
  WHERE nome = 'Ditado Popular' AND status = 'ativo'
  LIMIT 1;
  
  IF v_centro_custo_id IS NULL THEN
    RAISE EXCEPTION 'Centro de custo "Ditado Popular" não encontrado';
  END IF;
  
  RAISE NOTICE 'Centro de custo ID: %', v_centro_custo_id;
  
  -- Atualizar todas as contas a pagar que não têm centro de custo
  UPDATE contas_pagar
  SET 
    centro_custo_id = v_centro_custo_id,
    atualizado_em = now()
  WHERE centro_custo_id IS NULL;
  
  RAISE NOTICE 'Contas a pagar atualizadas: %', (
    SELECT COUNT(*)
    FROM contas_pagar
    WHERE centro_custo_id = v_centro_custo_id
  );
  
  -- Atualizar lançamentos no fluxo_caixa que vieram de contas a pagar
  UPDATE fluxo_caixa fc
  SET 
    centro_custo_id = cp.centro_custo_id,
    centro_custo = (SELECT nome FROM centros_custo WHERE id = cp.centro_custo_id)
  FROM pagamentos_contas pc
  INNER JOIN contas_pagar cp ON pc.conta_pagar_id = cp.id
  WHERE fc.pagamento_id = pc.id
    AND fc.origem = 'conta_pagar'
    AND (fc.centro_custo_id IS NULL OR fc.centro_custo_id != cp.centro_custo_id);
  
  RAISE NOTICE 'Lançamentos no fluxo_caixa atualizados';
  
  -- Atualizar também lançamentos diretos de contas a pagar (sem pagamento_id)
  UPDATE fluxo_caixa fc
  SET 
    centro_custo_id = cp.centro_custo_id,
    centro_custo = (SELECT nome FROM centros_custo WHERE id = cp.centro_custo_id)
  FROM contas_pagar cp
  WHERE fc.conta_pagar_id = cp.id
    AND fc.origem = 'conta_pagar'
    AND (fc.centro_custo_id IS NULL OR fc.centro_custo_id != cp.centro_custo_id);
    
  RAISE NOTICE 'Atualização completa!';
END $$;

-- Criar função para atribuir centro de custo automaticamente
CREATE OR REPLACE FUNCTION atribuir_centro_custo_padrao()
RETURNS TRIGGER AS $$
DECLARE
  v_centro_custo_id uuid;
BEGIN
  -- Se já tem centro de custo, não fazer nada
  IF NEW.centro_custo_id IS NOT NULL THEN
    RETURN NEW;
  END IF;
  
  -- Buscar centro de custo ativo (priorizar "Ditado Popular")
  SELECT id INTO v_centro_custo_id
  FROM centros_custo
  WHERE status = 'ativo'
  ORDER BY 
    CASE WHEN nome = 'Ditado Popular' THEN 1 ELSE 2 END,
    criado_em ASC
  LIMIT 1;
  
  -- Se encontrou, atribuir
  IF v_centro_custo_id IS NOT NULL THEN
    NEW.centro_custo_id := v_centro_custo_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para contas a pagar
DROP TRIGGER IF EXISTS trg_atribuir_centro_custo_conta_pagar ON contas_pagar;
CREATE TRIGGER trg_atribuir_centro_custo_conta_pagar
  BEFORE INSERT OR UPDATE ON contas_pagar
  FOR EACH ROW
  EXECUTE FUNCTION atribuir_centro_custo_padrao();

-- Criar trigger para contas a receber
DROP TRIGGER IF EXISTS trg_atribuir_centro_custo_conta_receber ON contas_receber;
CREATE TRIGGER trg_atribuir_centro_custo_conta_receber
  BEFORE INSERT OR UPDATE ON contas_receber
  FOR EACH ROW
  EXECUTE FUNCTION atribuir_centro_custo_padrao();
