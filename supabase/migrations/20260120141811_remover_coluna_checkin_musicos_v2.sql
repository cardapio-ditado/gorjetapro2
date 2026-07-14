/*
  # Remover Coluna Checkin da Tabela Músicos
  
  ## Alterações
  - Recria a view vw_musicos_financeiro sem a coluna checkin
  - Remove a coluna checkin da tabela musicos
  
  ## Observações
  - A coluna não é mais necessária no fluxo atual
*/

-- Recriar view sem a coluna checkin
DROP VIEW IF EXISTS vw_musicos_financeiro;

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

-- Agora remover a coluna checkin
ALTER TABLE musicos DROP COLUMN IF EXISTS checkin;
