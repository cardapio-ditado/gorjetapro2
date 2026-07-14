/*
  # Recriar View Músicos Financeiro

  1. Nova View
    - Drop e recriação da `vw_musicos_financeiro`
    - Inclui todos os campos da tabela musicos
    - Inclui nome do fornecedor quando disponível

  2. Funcionalidade
    - Facilita consultas financeiras de músicos
    - Integra informações de fornecedores
    - Mantém compatibilidade com código existente
*/

-- Dropar view antiga se existir
DROP VIEW IF EXISTS vw_musicos_financeiro;

-- Criar view para músicos com informações financeiras
CREATE VIEW vw_musicos_financeiro AS
SELECT 
  m.id,
  m.nome,
  m.contato,
  m.valor,
  m.status_pagamento,
  m.data_evento,
  m.horario_inicio,
  m.horario_fim,
  m.material_promocional,
  m.observacoes,
  m.checkin,
  m.valor_consumo,
  m.valor_adicional,
  m.valor_total_final,
  m.valor_pago,
  m.saldo_restante,
  m.fornecedor_id,
  f.nome as fornecedor_nome,
  m.criado_em
FROM musicos m
LEFT JOIN fornecedores f ON m.fornecedor_id = f.id;