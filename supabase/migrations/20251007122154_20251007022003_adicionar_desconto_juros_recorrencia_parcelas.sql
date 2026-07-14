/*
  # Adicionar desconto, juros, recorrência e parcelamento em contas a pagar

  ## Descrição
  Adiciona suporte para:
  - Descontos e juros em pagamentos
  - Pagamentos recorrentes (mensais, trimestrais, etc)
  - Pagamentos parcelados com vinculação entre parcelas

  ## Novas Colunas em contas_pagar
  1. Controle Financeiro: desconto, juros, valor_original, valor_final
  2. Pagamento Recorrente: eh_recorrente, frequencia_recorrencia, etc
  3. Pagamento Parcelado: eh_parcelado, numero_parcela, total_parcelas

  ## Segurança
  - RLS já está habilitado na tabela
  - Policies existentes continuam válidas
*/

-- Adicionar colunas de desconto e juros
ALTER TABLE contas_pagar 
ADD COLUMN IF NOT EXISTS desconto numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS juros numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS valor_original numeric,
ADD COLUMN IF NOT EXISTS valor_final numeric;

-- Adicionar colunas de recorrência
ALTER TABLE contas_pagar
ADD COLUMN IF NOT EXISTS eh_recorrente boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS frequencia_recorrencia text CHECK (frequencia_recorrencia IN ('mensal', 'bimestral', 'trimestral', 'semestral', 'anual')),
ADD COLUMN IF NOT EXISTS dia_vencimento_recorrente integer CHECK (dia_vencimento_recorrente >= 1 AND dia_vencimento_recorrente <= 31),
ADD COLUMN IF NOT EXISTS recorrencia_ativa boolean DEFAULT true,
ADD COLUMN IF NOT EXISTS data_inicio_recorrencia date,
ADD COLUMN IF NOT EXISTS data_fim_recorrencia date,
ADD COLUMN IF NOT EXISTS conta_recorrente_origem_id uuid REFERENCES contas_pagar(id) ON DELETE SET NULL;

-- Adicionar colunas de parcelamento
ALTER TABLE contas_pagar
ADD COLUMN IF NOT EXISTS eh_parcelado boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS numero_parcela integer CHECK (numero_parcela >= 1),
ADD COLUMN IF NOT EXISTS total_parcelas integer CHECK (total_parcelas >= 1),
ADD COLUMN IF NOT EXISTS parcelamento_grupo_id uuid;

-- Atualizar valor_original para contas existentes
UPDATE contas_pagar 
SET valor_original = valor_total
WHERE valor_original IS NULL;

-- Atualizar valor_final para contas existentes
UPDATE contas_pagar
SET valor_final = valor_total + COALESCE(juros, 0) - COALESCE(desconto, 0)
WHERE valor_final IS NULL;

-- Criar índices para melhor performance
CREATE INDEX IF NOT EXISTS idx_contas_pagar_recorrente ON contas_pagar(eh_recorrente, recorrencia_ativa) WHERE eh_recorrente = true;
CREATE INDEX IF NOT EXISTS idx_contas_pagar_parcelamento ON contas_pagar(parcelamento_grupo_id) WHERE eh_parcelado = true;
CREATE INDEX IF NOT EXISTS idx_contas_pagar_recorrencia_origem ON contas_pagar(conta_recorrente_origem_id) WHERE conta_recorrente_origem_id IS NOT NULL;

-- Função para calcular valor final automaticamente
CREATE OR REPLACE FUNCTION calcular_valor_final_conta()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.valor_original IS NULL THEN
    NEW.valor_original := NEW.valor_total;
  END IF;

  NEW.valor_final := NEW.valor_original + COALESCE(NEW.juros, 0) - COALESCE(NEW.desconto, 0);

  IF NEW.valor_final < 0 THEN
    NEW.valor_final := 0;
  END IF;

  NEW.valor_total := NEW.valor_final;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para calcular valor final automaticamente
DROP TRIGGER IF EXISTS trg_calcular_valor_final_conta ON contas_pagar;

CREATE TRIGGER trg_calcular_valor_final_conta
  BEFORE INSERT OR UPDATE OF valor_original, desconto, juros
  ON contas_pagar
  FOR EACH ROW
  EXECUTE FUNCTION calcular_valor_final_conta();

-- Função para gerar próxima conta recorrente
CREATE OR REPLACE FUNCTION gerar_proxima_conta_recorrente(conta_origem_id uuid)
RETURNS uuid AS $$
DECLARE
  conta_origem contas_pagar;
  nova_data_vencimento date;
  nova_conta_id uuid;
  meses_adicionar integer;
BEGIN
  SELECT * INTO conta_origem FROM contas_pagar WHERE id = conta_origem_id;

  IF NOT FOUND OR NOT conta_origem.eh_recorrente OR NOT conta_origem.recorrencia_ativa THEN
    RETURN NULL;
  END IF;

  IF conta_origem.data_fim_recorrencia IS NOT NULL 
     AND CURRENT_DATE >= conta_origem.data_fim_recorrencia THEN
    UPDATE contas_pagar SET recorrencia_ativa = false WHERE id = conta_origem_id;
    RETURN NULL;
  END IF;

  meses_adicionar := CASE conta_origem.frequencia_recorrencia
    WHEN 'mensal' THEN 1
    WHEN 'bimestral' THEN 2
    WHEN 'trimestral' THEN 3
    WHEN 'semestral' THEN 6
    WHEN 'anual' THEN 12
    ELSE 1
  END;

  nova_data_vencimento := conta_origem.data_vencimento + (meses_adicionar || ' months')::interval;

  IF EXISTS (
    SELECT 1 FROM contas_pagar 
    WHERE conta_recorrente_origem_id = COALESCE(conta_origem.conta_recorrente_origem_id, conta_origem_id)
    AND data_vencimento = nova_data_vencimento
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO contas_pagar (
    fornecedor_id, descricao, categoria_id, centro_custo_id, forma_pagamento_id,
    valor_original, valor_total, valor_final, desconto, juros,
    data_emissao, data_vencimento, numero_documento, status, observacoes,
    eh_recorrente, frequencia_recorrencia, dia_vencimento_recorrente, recorrencia_ativa,
    data_inicio_recorrencia, data_fim_recorrencia, conta_recorrente_origem_id
  ) VALUES (
    conta_origem.fornecedor_id, conta_origem.descricao, conta_origem.categoria_id,
    conta_origem.centro_custo_id, conta_origem.forma_pagamento_id,
    conta_origem.valor_original, conta_origem.valor_original, conta_origem.valor_original,
    0, 0, CURRENT_DATE, nova_data_vencimento,
    conta_origem.numero_documento || ' - REC', 'em_aberto',
    'Gerado automaticamente - Pagamento recorrente',
    true, conta_origem.frequencia_recorrencia, conta_origem.dia_vencimento_recorrente, true,
    conta_origem.data_inicio_recorrencia, conta_origem.data_fim_recorrencia,
    COALESCE(conta_origem.conta_recorrente_origem_id, conta_origem_id)
  ) RETURNING id INTO nova_conta_id;

  RETURN nova_conta_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION calcular_valor_final_conta() TO authenticated;
GRANT EXECUTE ON FUNCTION gerar_proxima_conta_recorrente(uuid) TO authenticated;