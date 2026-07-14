/*
  # View para Saldo Atualizado de Contas Bancárias
  
  1. Nova View
    - `vw_bancos_contas_saldo` - Calcula o saldo atual de cada conta bancária
      baseado no saldo inicial + entradas - saídas do fluxo de caixa
  
  2. Detalhes
    - Considera o saldo_inicial da conta
    - Soma todas as entradas (receita)
    - Subtrai todas as saídas (despesa)
    - Calcula o saldo_atual real e atualizado
*/

CREATE OR REPLACE VIEW vw_bancos_contas_saldo AS
SELECT 
  bc.id,
  bc.banco,
  bc.tipo_conta,
  bc.numero_conta,
  bc.agencia,
  bc.titular,
  bc.documento_titular,
  bc.saldo_inicial,
  bc.status,
  bc.criado_em,
  bc.atualizado_em,
  COALESCE(bc.saldo_inicial, 0) + 
  COALESCE(SUM(CASE WHEN fc.tipo = 'receita' THEN fc.valor ELSE 0 END), 0) - 
  COALESCE(SUM(CASE WHEN fc.tipo = 'despesa' THEN fc.valor ELSE 0 END), 0) as saldo_atual,
  COUNT(fc.id) as total_movimentacoes,
  COALESCE(SUM(CASE WHEN fc.tipo = 'receita' THEN fc.valor ELSE 0 END), 0) as total_entradas,
  COALESCE(SUM(CASE WHEN fc.tipo = 'despesa' THEN fc.valor ELSE 0 END), 0) as total_saidas
FROM bancos_contas bc
LEFT JOIN fluxo_caixa fc ON fc.conta_bancaria_id = bc.id
GROUP BY 
  bc.id,
  bc.banco,
  bc.tipo_conta,
  bc.numero_conta,
  bc.agencia,
  bc.titular,
  bc.documento_titular,
  bc.saldo_inicial,
  bc.status,
  bc.criado_em,
  bc.atualizado_em;