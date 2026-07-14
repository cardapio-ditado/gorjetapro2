/*
  # Adicionar referência de contas a receber no fluxo de caixa
  
  ## Alteração
  Adiciona coluna conta_receber_id na tabela fluxo_caixa para vincular
  lançamentos de entrada às contas a receber correspondentes.
  
  ## Impacto
  Permite rastreabilidade entre fluxo de caixa e contas a receber
*/

-- Adicionar coluna se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'fluxo_caixa' AND column_name = 'conta_receber_id'
  ) THEN
    ALTER TABLE fluxo_caixa ADD COLUMN conta_receber_id UUID REFERENCES contas_receber(id) ON DELETE SET NULL;
    
    RAISE NOTICE 'Coluna conta_receber_id adicionada com sucesso';
  ELSE
    RAISE NOTICE 'Coluna conta_receber_id já existe';
  END IF;
END $$;

-- Criar índice para melhor performance
CREATE INDEX IF NOT EXISTS idx_fluxo_caixa_conta_receber_id 
ON fluxo_caixa(conta_receber_id) 
WHERE conta_receber_id IS NOT NULL;
