/*
  # Recriar vw_fornecedor_notas_detalhe sem COALESCE na data_vencimento

  O COALESCE adicionado anteriormente retornava '1970-01-01' para notas consignadas,
  causando:
    - Exibição incorreta "01/01/1970" na tela
    - Formulário de edição sendo pré-preenchido com data errada
  
  O frontend já trata null corretamente (fmtDate retorna '—' para null).
  Retornamos null onde não há vencimento (notas consignadas).
*/

DROP VIEW IF EXISTS vw_fornecedor_notas_detalhe;

CREATE VIEW vw_fornecedor_notas_detalhe AS
SELECT
  id,
  numero_nota,
  data_emissao,
  data_entrada,
  data_vencimento,
  tipo,
  prazo_pagamento,
  valor_total,
  valor_pago,
  ROUND(valor_total - valor_pago, 2) AS saldo_restante,
  status_pagamento,
  observacoes,
  documento_url,
  CASE
    WHEN tipo = 'normal'
      AND status_pagamento <> 'pago'
      AND data_vencimento IS NOT NULL
      AND data_vencimento < CURRENT_DATE
    THEN (CURRENT_DATE - data_vencimento)
    ELSE 0
  END AS dias_atraso,
  COALESCE((
    SELECT SUM(ni.quantidade_usada)
    FROM fornecedor_notas_itens ni
    WHERE ni.nota_id = n.id
  ), 0) AS total_qtd_usada,
  COALESCE((
    SELECT SUM(ni.quantidade_devolvida)
    FROM fornecedor_notas_itens ni
    WHERE ni.nota_id = n.id
  ), 0) AS total_qtd_devolvida,
  criado_em,
  entrada_compra_id
FROM fornecedor_notas n
WHERE fornecedor_id = '99c8ac2f-08b1-4862-88cc-9d2e0b900f4e'
ORDER BY data_emissao DESC;
