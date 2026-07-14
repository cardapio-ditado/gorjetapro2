/*
  # Corrigir View de Saldo de Contas Bancárias
  
  1. Alterações
    - Corrige os tipos de movimentação de 'receita'/'despesa' para 'entrada'/'saida'
    - Mantém o cálculo correto do saldo
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
  COALESCE(SUM(CASE WHEN fc.tipo = 'entrada' THEN fc.valor ELSE 0 END), 0) - 
  COALESCE(SUM(CASE WHEN fc.tipo = 'saida' THEN fc.valor ELSE 0 END), 0) as saldo_atual,
  COUNT(fc.id) as total_movimentacoes,
  COALESCE(SUM(CASE WHEN fc.tipo = 'entrada' THEN fc.valor ELSE 0 END), 0) as total_entradas,
  COALESCE(SUM(CASE WHEN fc.tipo = 'saida' THEN fc.valor ELSE 0 END), 0) as total_saidas
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