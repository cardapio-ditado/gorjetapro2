/*
  # Reabilitar Trigger de Atualização de Saldos

  1. Alterações
    - Reabilita o trigger `trg_atualizar_saldos_movimentacao` na tabela `movimentacoes_estoque`
    - O trigger atualiza automaticamente os saldos quando há movimentações
    - Necessário para que as transferências entre estoques funcionem corretamente

  2. Notas
    - O trigger já existe, apenas estava desabilitado
    - Suporta: entrada, saida, transferencia e ajuste
*/

ALTER TABLE movimentacoes_estoque 
ENABLE TRIGGER trg_atualizar_saldos_movimentacao;
