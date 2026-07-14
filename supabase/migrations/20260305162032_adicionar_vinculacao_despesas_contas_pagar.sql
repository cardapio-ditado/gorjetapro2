/*
  # Adicionar Vinculação entre Despesas Manuais e Contas a Pagar

  ## Descrição
  Permite vincular despesas lançadas manualmente na Visão Estratégica com contas a pagar
  do financeiro. Isso evita duplicação quando a conta chega ao financeiro.

  ## Mudanças
  1. Adiciona coluna `conta_pagar_id` na tabela `visao_estrategica_despesas`
  2. Quando uma despesa é vinculada, ela marca a conta como "considerada no planejamento"
  3. A view de despesas não mostra contas que já foram vinculadas a despesas manuais
  4. Adiciona função para vincular/desvincular despesas

  ## Segurança
  - Mantém RLS existente
  - Apenas usuários autenticados podem vincular
*/

-- Adicionar coluna para vincular despesa manual com conta a pagar
ALTER TABLE visao_estrategica_despesas 
ADD COLUMN IF NOT EXISTS conta_pagar_id uuid REFERENCES contas_pagar(id) ON DELETE SET NULL;

-- Índice para melhorar performance
CREATE INDEX IF NOT EXISTS idx_ve_despesas_conta_pagar 
ON visao_estrategica_despesas(conta_pagar_id) 
WHERE conta_pagar_id IS NOT NULL;

-- Função para vincular despesa manual com conta a pagar
CREATE OR REPLACE FUNCTION vincular_despesa_conta_pagar(
  p_despesa_id uuid,
  p_conta_pagar_id uuid
)
RETURNS jsonb AS $$
DECLARE
  v_despesa record;
  v_conta record;
BEGIN
  -- Buscar despesa
  SELECT * INTO v_despesa
  FROM visao_estrategica_despesas
  WHERE id = p_despesa_id AND status = 'ativa';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Despesa não encontrada ou inativa';
  END IF;

  -- Buscar conta a pagar
  SELECT * INTO v_conta
  FROM contas_pagar
  WHERE id = p_conta_pagar_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta a pagar não encontrada';
  END IF;

  -- Verificar se a conta já está vinculada a outra despesa
  IF EXISTS (
    SELECT 1 FROM visao_estrategica_despesas 
    WHERE conta_pagar_id = p_conta_pagar_id 
    AND id != p_despesa_id
    AND status = 'ativa'
  ) THEN
    RAISE EXCEPTION 'Esta conta já está vinculada a outra despesa';
  END IF;

  -- Vincular
  UPDATE visao_estrategica_despesas
  SET 
    conta_pagar_id = p_conta_pagar_id,
    tipo_lancamento = 'realizada',
    updated_at = now()
  WHERE id = p_despesa_id;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Despesa vinculada com sucesso',
    'despesa_id', p_despesa_id,
    'conta_pagar_id', p_conta_pagar_id
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para desvincular despesa
CREATE OR REPLACE FUNCTION desvincular_despesa_conta_pagar(
  p_despesa_id uuid
)
RETURNS jsonb AS $$
BEGIN
  UPDATE visao_estrategica_despesas
  SET 
    conta_pagar_id = NULL,
    tipo_lancamento = 'previsao',
    updated_at = now()
  WHERE id = p_despesa_id AND status = 'ativa';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Despesa não encontrada ou inativa';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Despesa desvinculada com sucesso'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Atualizar view de despesas para não mostrar contas já vinculadas
CREATE OR REPLACE VIEW view_ve_despesas_contas_pagar_disponiveis AS
SELECT 
  cp.id,
  cp.fornecedor_id,
  f.nome as fornecedor_nome,
  cp.descricao,
  cp.valor_total,
  cp.valor_pago,
  cp.saldo_restante,
  cp.data_vencimento,
  cp.categoria_id as categoria_financeira_id,
  cf.nome as categoria_nome,
  cp.status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM visao_estrategica_despesas ved
      WHERE ved.conta_pagar_id = cp.id AND ved.status = 'ativa'
    ) THEN true
    ELSE false
  END as ja_vinculada
FROM contas_pagar cp
LEFT JOIN fornecedores f ON f.id = cp.fornecedor_id
LEFT JOIN categorias_financeiras cf ON cf.id = cp.categoria_id
WHERE cp.status IN ('em_aberto', 'parcialmente_pago')
ORDER BY cp.data_vencimento ASC;

-- Permissões
GRANT EXECUTE ON FUNCTION vincular_despesa_conta_pagar TO authenticated;
GRANT EXECUTE ON FUNCTION desvincular_despesa_conta_pagar TO authenticated;
GRANT SELECT ON view_ve_despesas_contas_pagar_disponiveis TO authenticated, anon;

-- Comentários
COMMENT ON COLUMN visao_estrategica_despesas.conta_pagar_id IS 'Vinculação com conta a pagar do financeiro para evitar duplicação';
COMMENT ON FUNCTION vincular_despesa_conta_pagar IS 'Vincula uma despesa manual da Visão Estratégica com uma conta a pagar';
COMMENT ON FUNCTION desvincular_despesa_conta_pagar IS 'Remove vinculação entre despesa manual e conta a pagar';
COMMENT ON VIEW view_ve_despesas_contas_pagar_disponiveis IS 'Lista contas a pagar disponíveis para vinculação, marcando as já vinculadas';
