/*
  # Desabilitar Trigger de Histórico Automático

  ## Problema
  O trigger automático que registra mudanças de status está causando
  erros de RLS quando tenta inserir no histórico

  ## Solução
  Desabilitar o trigger temporariamente até que as políticas RLS
  estejam 100% corretas
*/

-- Desabilitar trigger de registro automático de status
DROP TRIGGER IF EXISTS producao_registrar_status ON producoes;

-- Comentar a função para referência futura
COMMENT ON FUNCTION trigger_registrar_mudanca_status() IS 'Trigger desabilitado - causava conflitos com RLS';
