/*
  # Habilitar Trigger Sempre Ativo

  1. Alterações
    - Habilita o trigger de atualização de saldos em modo ALWAYS (sempre ativo)
    - Isso garante que o trigger funcionará mesmo em operações especiais

  2. Notas
    - ALWAYS é mais forte que ENABLE normal
*/

ALTER TABLE movimentacoes_estoque 
ENABLE ALWAYS TRIGGER trg_atualizar_saldos_movimentacao;
