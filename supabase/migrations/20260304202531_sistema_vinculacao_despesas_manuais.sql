/*
  # Sistema de Vinculação de Despesas Manuais com Contas a Pagar

  1. Alterações na Tabela
    - Adiciona campo `status` para controle do ciclo de vida da despesa
    - Adiciona campo `conta_pagar_id` para vincular à conta a pagar quando convertida
    - Adiciona campo `observacao_conversao` para registrar detalhes da conversão
    - Adiciona campo `convertido_em` para timestamp da conversão
    - Adiciona campo `convertido_por` para rastrear quem fez a conversão

  2. Status Possíveis
    - 'ativa': Despesa provisória, conta nos totais
    - 'convertida': Já foi transformada em conta a pagar, não conta mais nos totais
    - 'cancelada': Despesa cancelada/descartada

  3. Regras
    - Apenas despesas 'ativa' aparecem nos cálculos de orçamento
    - Despesas convertidas mantêm vínculo com a conta a pagar original
    - Histórico completo é preservado para auditoria
*/

-- Adicionar novos campos
DO $$
BEGIN
  -- Campo status
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'visao_estrategica_despesas' AND column_name = 'status'
  ) THEN
    ALTER TABLE visao_estrategica_despesas
    ADD COLUMN status text DEFAULT 'ativa' CHECK (status IN ('ativa', 'convertida', 'cancelada'));
  END IF;

  -- Campo conta_pagar_id
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'visao_estrategica_despesas' AND column_name = 'conta_pagar_id'
  ) THEN
    ALTER TABLE visao_estrategica_despesas
    ADD COLUMN conta_pagar_id uuid REFERENCES contas_pagar(id) ON DELETE SET NULL;
  END IF;

  -- Campo observacao_conversao
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'visao_estrategica_despesas' AND column_name = 'observacao_conversao'
  ) THEN
    ALTER TABLE visao_estrategica_despesas
    ADD COLUMN observacao_conversao text;
  END IF;

  -- Campo convertido_em
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'visao_estrategica_despesas' AND column_name = 'convertido_em'
  ) THEN
    ALTER TABLE visao_estrategica_despesas
    ADD COLUMN convertido_em timestamptz;
  END IF;

  -- Campo convertido_por
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'visao_estrategica_despesas' AND column_name = 'convertido_por'
  ) THEN
    ALTER TABLE visao_estrategica_despesas
    ADD COLUMN convertido_por uuid REFERENCES auth.users(id);
  END IF;
END $$;

-- Criar índice para buscar despesas por conta a pagar
CREATE INDEX IF NOT EXISTS idx_ve_despesas_conta_pagar
ON visao_estrategica_despesas(conta_pagar_id)
WHERE conta_pagar_id IS NOT NULL;

-- Criar índice para filtrar por status
CREATE INDEX IF NOT EXISTS idx_ve_despesas_status
ON visao_estrategica_despesas(status);

-- Função para converter despesa manual em conta a pagar
CREATE OR REPLACE FUNCTION converter_despesa_manual_em_conta_pagar(
  p_despesa_id uuid,
  p_conta_pagar_id uuid,
  p_observacao text DEFAULT NULL
) RETURNS void AS $$
BEGIN
  UPDATE visao_estrategica_despesas
  SET
    status = 'convertida',
    conta_pagar_id = p_conta_pagar_id,
    observacao_conversao = p_observacao,
    convertido_em = now(),
    convertido_por = auth.uid()
  WHERE id = p_despesa_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para cancelar despesa manual
CREATE OR REPLACE FUNCTION cancelar_despesa_manual(
  p_despesa_id uuid,
  p_motivo text DEFAULT NULL
) RETURNS void AS $$
BEGIN
  UPDATE visao_estrategica_despesas
  SET
    status = 'cancelada',
    observacao_conversao = p_motivo,
    convertido_em = now(),
    convertido_por = auth.uid()
  WHERE id = p_despesa_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para reativar despesa cancelada (caso necessário)
CREATE OR REPLACE FUNCTION reativar_despesa_manual(
  p_despesa_id uuid
) RETURNS void AS $$
BEGIN
  UPDATE visao_estrategica_despesas
  SET
    status = 'ativa',
    conta_pagar_id = NULL,
    observacao_conversao = NULL,
    convertido_em = NULL,
    convertido_por = NULL
  WHERE id = p_despesa_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentários
COMMENT ON COLUMN visao_estrategica_despesas.status IS 'Status da despesa: ativa (conta nos totais), convertida (já virou conta a pagar), cancelada (descartada)';
COMMENT ON COLUMN visao_estrategica_despesas.conta_pagar_id IS 'ID da conta a pagar quando a despesa manual foi convertida';
COMMENT ON COLUMN visao_estrategica_despesas.observacao_conversao IS 'Observações sobre a conversão ou cancelamento';
COMMENT ON FUNCTION converter_despesa_manual_em_conta_pagar IS 'Converte uma despesa manual em conta a pagar formal, evitando duplicidade';
