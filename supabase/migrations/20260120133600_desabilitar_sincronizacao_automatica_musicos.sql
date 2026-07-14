/*
  # Desabilitar Sincronização Automática de Músicos com Contas a Pagar

  ## Objetivo
  O status "pendente" ou "pago" no módulo de músicos deve ser apenas para controle interno.
  As baixas no contas a pagar devem ser efetuadas manualmente, sem vinculação automática.

  ## Alterações
  1. Remove trigger que cria automaticamente contas a pagar quando músico é inserido/atualizado
  2. Remove trigger que sincroniza status de volta para músicos quando conta é paga
  3. Remove trigger que atualiza músicos quando há pagamentos
  4. Mantém a tabela de músicos independente para controle interno apenas

  ## Observações
  - Os usuários poderão continuar marcando status manualmente no módulo de músicos
  - As contas a pagar devem ser criadas e gerenciadas manualmente no módulo financeiro
  - Não há mais vínculo automático entre os dois módulos
*/

-- Remover trigger que cria contas a pagar automaticamente a partir de músicos
DROP TRIGGER IF EXISTS trg_sincronizar_musico_conta_pagar ON musicos;

-- Remover trigger que sincroniza contas a pagar de volta para músicos
DROP TRIGGER IF EXISTS trg_sincronizar_conta_musico ON contas_pagar;

-- Remover trigger que sincroniza pagamentos para músicos
DROP TRIGGER IF EXISTS trg_sincronizar_pagamentos_musicos ON pagamentos_contas;

-- Remover as funções associadas (opcional, mas mantém o banco limpo)
DROP FUNCTION IF EXISTS sincronizar_musico_conta_pagar();
DROP FUNCTION IF EXISTS sincronizar_conta_musico();
DROP FUNCTION IF EXISTS sincronizar_pagamentos_musicos();

-- Adicionar comentário na tabela para documentar o comportamento
COMMENT ON COLUMN musicos.status_pagamento IS 'Status informativo apenas para controle interno. Não vincula automaticamente com contas a pagar.';
COMMENT ON COLUMN musicos.valor_pago IS 'Valor informativo apenas para controle interno. Gerenciado manualmente.';
COMMENT ON COLUMN musicos.saldo_restante IS 'Saldo informativo apenas para controle interno. Gerenciado manualmente.';
