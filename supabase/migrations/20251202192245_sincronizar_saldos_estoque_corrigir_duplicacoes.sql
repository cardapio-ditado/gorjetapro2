/*
  # Sincronizar tabelas de saldo e corrigir duplicações

  ## Problema Identificado
  As duas tabelas de saldo estão divergentes:
  - estoque_saldos.quantidade (CORRETO - 47kg bacon)
  - saldos_estoque.quantidade_atual (DUPLICADO - 10kg bacon)
  
  Causa: A função processar_entrada_compra estava atualizando saldos_estoque
  diretamente E depois o trigger também atualizava, causando duplicação.

  ## Solução
  1. Usar estoque_saldos como fonte da verdade (tem histórico completo)
  2. Sincronizar saldos_estoque baseado em estoque_saldos
  3. Corrigir todos os itens divergentes
  
  ## Segurança
  - Backup dos saldos antigos antes de corrigir
  - Registra divergências encontradas
*/

-- Criar tabela temporária para backup
CREATE TEMP TABLE IF NOT EXISTS backup_saldos_divergentes AS
SELECT 
  ie.nome,
  ie.codigo,
  se.id as saldos_estoque_id,
  se.quantidade_atual as qtd_antiga_saldos_estoque,
  es.quantidade as qtd_correta_estoque_saldos,
  se.valor_total as valor_antigo,
  es.valor_total as valor_correto,
  now() as backup_em
FROM itens_estoque ie
JOIN saldos_estoque se ON se.item_id = ie.id
JOIN estoque_saldos es ON es.item_estoque_id = ie.id AND es.estoque_id = se.estoque_id
WHERE se.quantidade_atual != es.quantidade
  OR se.valor_total != es.valor_total;

-- Sincronizar saldos_estoque baseado em estoque_saldos (fonte da verdade)
UPDATE saldos_estoque se
SET 
  quantidade_atual = es.quantidade,
  valor_total = es.valor_total,
  data_ultima_movimentacao = es.atualizado_em,
  atualizado_em = now()
FROM estoque_saldos es
WHERE es.item_estoque_id = se.item_id
  AND es.estoque_id = se.estoque_id
  AND (se.quantidade_atual != es.quantidade OR se.valor_total != es.valor_total);

-- Mostrar quantos registros foram corrigidos
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM backup_saldos_divergentes;
  RAISE NOTICE 'Sincronização concluída: % itens corrigidos', v_count;
END $$;