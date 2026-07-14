/*
  # Unificar Centro de Custo para "Ditado Popular"

  ## Mudanças
  
  1. Atualiza todos os lançamentos financeiros para usar o centro de custo "Ditado Popular"
     - fluxo_caixa: 1008 registros (79 sem centro + 929 com outros centros)
     - contas_pagar: todos os registros
     - contas_receber: todos os registros
  
  2. Remove outros centros de custo
     - Mantém apenas "Ditado Popular"
     - Deleta: Administrativo, Alimentos, Bebidas, Imóvel, Marketing, Profissionais, Serviços, Utilidades
  
  ## Motivo
  
  Simplificar estrutura eliminando separação por centros de custo múltiplos.
  Todos os lançamentos passam a pertencer a um único centro: "Ditado Popular".
*/

-- 1. Obter o ID do centro de custo "Ditado Popular"
DO $$
DECLARE
  ditado_popular_id uuid;
BEGIN
  SELECT id INTO ditado_popular_id 
  FROM centros_custo 
  WHERE nome = 'Ditado Popular' 
  LIMIT 1;

  -- 2. Atualizar fluxo_caixa
  UPDATE fluxo_caixa
  SET centro_custo_id = ditado_popular_id
  WHERE centro_custo_id IS NULL 
     OR centro_custo_id != ditado_popular_id;

  -- 3. Atualizar contas_pagar
  UPDATE contas_pagar
  SET centro_custo_id = ditado_popular_id
  WHERE centro_custo_id IS NULL 
     OR centro_custo_id != ditado_popular_id;

  -- 4. Atualizar contas_receber
  UPDATE contas_receber
  SET centro_custo_id = ditado_popular_id
  WHERE centro_custo_id IS NULL 
     OR centro_custo_id != ditado_popular_id;

  -- 5. Deletar outros centros de custo
  DELETE FROM centros_custo 
  WHERE id != ditado_popular_id;

  -- 6. Log do resultado
  RAISE NOTICE 'Centro de custo unificado para: Ditado Popular (%)%', ditado_popular_id, CHR(10);
  RAISE NOTICE 'Outros centros de custo removidos.';
END $$;
