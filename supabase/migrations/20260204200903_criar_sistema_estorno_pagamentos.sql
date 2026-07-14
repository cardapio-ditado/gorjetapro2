/*
  # Sistema de Estorno de Pagamentos Parciais

  ## Descrição
  Implementa sistema completo para permitir estorno de pagamentos parciais 
  realizados por engano e sincronização automática entre fluxo_caixa e contas_pagar.

  ## 1. Nova Tabela
  - `historico_estornos_pagamento`
    - Registra todos os estornos realizados para auditoria
    - Campos: id, fluxo_caixa_id, conta_pagar_id, valor_estornado, motivo, estornado_por, data_estorno

  ## 2. Funções
  - `estornar_pagamento_parcial()`: Estorna um pagamento específico do fluxo de caixa
  - `reverter_pagamento_contas_pagar()`: Atualiza contas_pagar ao excluir lançamento do fluxo

  ## 3. Trigger
  - Trigger automático para ajustar contas_pagar quando lançamento de fluxo é excluído

  ## 4. Security
  - RLS habilitado para tabela de histórico de estornos
  - Políticas de acesso apenas para usuários autenticados
*/

-- 1. Criar tabela de histórico de estornos
CREATE TABLE IF NOT EXISTS historico_estornos_pagamento (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fluxo_caixa_id uuid REFERENCES fluxo_caixa(id) ON DELETE SET NULL,
  conta_pagar_id uuid REFERENCES contas_pagar(id) ON DELETE CASCADE,
  valor_estornado numeric NOT NULL,
  motivo text,
  estornado_por uuid REFERENCES auth.users(id),
  data_estorno timestamptz DEFAULT now(),
  observacoes text,
  criado_em timestamptz DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE historico_estornos_pagamento ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Usuários autenticados podem visualizar estornos"
  ON historico_estornos_pagamento
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Usuários autenticados podem registrar estornos"
  ON historico_estornos_pagamento
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- 2. Função para estornar pagamento parcial
CREATE OR REPLACE FUNCTION estornar_pagamento_parcial(
  p_fluxo_caixa_id uuid,
  p_motivo text DEFAULT NULL,
  p_observacoes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fluxo_record record;
  v_conta_pagar_id uuid;
  v_valor_estornado numeric;
  v_novo_valor_pago numeric;
  v_novo_saldo_restante numeric;
  v_novo_status text;
  v_estorno_id uuid;
BEGIN
  -- Buscar informações do lançamento de fluxo de caixa
  SELECT 
    id, 
    valor, 
    conta_pagar_id, 
    tipo,
    origem
  INTO v_fluxo_record
  FROM fluxo_caixa
  WHERE id = p_fluxo_caixa_id;

  -- Validações
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Lançamento de fluxo de caixa não encontrado'
    );
  END IF;

  IF v_fluxo_record.conta_pagar_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Este lançamento não está vinculado a uma conta a pagar'
    );
  END IF;

  IF v_fluxo_record.tipo != 'saida' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Apenas lançamentos de saída podem ser estornados'
    );
  END IF;

  -- Verificar se já foi estornado
  IF EXISTS (
    SELECT 1 FROM historico_estornos_pagamento 
    WHERE fluxo_caixa_id = p_fluxo_caixa_id
  ) THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Este pagamento já foi estornado anteriormente'
    );
  END IF;

  v_conta_pagar_id := v_fluxo_record.conta_pagar_id;
  v_valor_estornado := v_fluxo_record.valor;

  -- Registrar estorno no histórico
  INSERT INTO historico_estornos_pagamento (
    fluxo_caixa_id,
    conta_pagar_id,
    valor_estornado,
    motivo,
    estornado_por,
    observacoes
  ) VALUES (
    p_fluxo_caixa_id,
    v_conta_pagar_id,
    v_valor_estornado,
    p_motivo,
    auth.uid(),
    p_observacoes
  )
  RETURNING id INTO v_estorno_id;

  -- Atualizar conta a pagar
  UPDATE contas_pagar
  SET 
    valor_pago = COALESCE(valor_pago, 0) - v_valor_estornado,
    saldo_restante = COALESCE(saldo_restante, valor_total) + v_valor_estornado,
    status = CASE
      WHEN (COALESCE(valor_pago, 0) - v_valor_estornado) <= 0 THEN 'pendente'
      WHEN (COALESCE(valor_pago, 0) - v_valor_estornado) < valor_total THEN 'parcial'
      ELSE 'pago'
    END,
    data_baixa_integral = CASE
      WHEN (COALESCE(valor_pago, 0) - v_valor_estornado) < valor_total THEN NULL
      ELSE data_baixa_integral
    END,
    atualizado_em = now()
  WHERE id = v_conta_pagar_id
  RETURNING valor_pago, saldo_restante, status 
  INTO v_novo_valor_pago, v_novo_saldo_restante, v_novo_status;

  -- Excluir o lançamento do fluxo de caixa
  DELETE FROM fluxo_caixa WHERE id = p_fluxo_caixa_id;

  -- Retornar resultado
  RETURN jsonb_build_object(
    'success', true,
    'estorno_id', v_estorno_id,
    'valor_estornado', v_valor_estornado,
    'conta_pagar_id', v_conta_pagar_id,
    'novo_valor_pago', v_novo_valor_pago,
    'novo_saldo_restante', v_novo_saldo_restante,
    'novo_status', v_novo_status,
    'message', 'Pagamento estornado com sucesso'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$;

-- 3. Trigger para reverter pagamento ao excluir do fluxo de caixa
CREATE OR REPLACE FUNCTION reverter_pagamento_contas_pagar()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_valor_estornado numeric;
BEGIN
  -- Apenas processar se for saída e tiver conta_pagar_id
  IF OLD.tipo = 'saida' AND OLD.conta_pagar_id IS NOT NULL THEN
    v_valor_estornado := OLD.valor;

    -- Verificar se não é um estorno já registrado
    IF NOT EXISTS (
      SELECT 1 FROM historico_estornos_pagamento 
      WHERE fluxo_caixa_id = OLD.id
    ) THEN
      -- Registrar no histórico como exclusão manual
      INSERT INTO historico_estornos_pagamento (
        fluxo_caixa_id,
        conta_pagar_id,
        valor_estornado,
        motivo,
        estornado_por,
        observacoes
      ) VALUES (
        OLD.id,
        OLD.conta_pagar_id,
        v_valor_estornado,
        'Exclusão manual do lançamento de fluxo de caixa',
        auth.uid(),
        'Estorno automático por exclusão do lançamento'
      );
    END IF;

    -- Atualizar conta a pagar
    UPDATE contas_pagar
    SET 
      valor_pago = GREATEST(0, COALESCE(valor_pago, 0) - v_valor_estornado),
      saldo_restante = LEAST(valor_total, COALESCE(saldo_restante, valor_total) + v_valor_estornado),
      status = CASE
        WHEN (COALESCE(valor_pago, 0) - v_valor_estornado) <= 0 THEN 'pendente'
        WHEN (COALESCE(valor_pago, 0) - v_valor_estornado) < valor_total THEN 'parcial'
        ELSE 'pago'
      END,
      data_baixa_integral = CASE
        WHEN (COALESCE(valor_pago, 0) - v_valor_estornado) < valor_total THEN NULL
        ELSE data_baixa_integral
      END,
      atualizado_em = now()
    WHERE id = OLD.conta_pagar_id;
  END IF;

  RETURN OLD;
END;
$$;

-- Remover trigger antigo se existir
DROP TRIGGER IF EXISTS trigger_reverter_pagamento_contas_pagar ON fluxo_caixa;

-- Criar trigger
CREATE TRIGGER trigger_reverter_pagamento_contas_pagar
  BEFORE DELETE ON fluxo_caixa
  FOR EACH ROW
  EXECUTE FUNCTION reverter_pagamento_contas_pagar();

-- Comentários
COMMENT ON TABLE historico_estornos_pagamento IS 'Registra todos os estornos de pagamentos para auditoria';
COMMENT ON FUNCTION estornar_pagamento_parcial IS 'Estorna um pagamento parcial e atualiza a conta a pagar correspondente';
COMMENT ON FUNCTION reverter_pagamento_contas_pagar IS 'Trigger para reverter pagamento ao excluir lançamento do fluxo de caixa';
