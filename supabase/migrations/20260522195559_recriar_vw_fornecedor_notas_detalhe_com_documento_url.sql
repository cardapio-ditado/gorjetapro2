/*
  # Recriar vw_fornecedor_notas_detalhe com documento_url

  A coluna documento_url existe em fornecedor_notas mas não estava na view,
  impedindo que o anexo da nota fosse exibido. É necessário dropar e recriar
  pois CREATE OR REPLACE não permite inserir colunas no meio da lista.
*/

DROP VIEW IF EXISTS vw_fornecedor_notas_detalhe;

CREATE VIEW vw_fornecedor_notas_detalhe AS
 SELECT id,
    numero_nota,
    data_emissao,
    data_entrada,
    data_vencimento,
    tipo,
    prazo_pagamento,
    valor_total,
    valor_pago,
    round(valor_total - valor_pago, 2) AS saldo_restante,
    status_pagamento,
    observacoes,
    documento_url,
        CASE
            WHEN tipo = 'normal'::text AND status_pagamento <> 'pago'::text AND data_vencimento < CURRENT_DATE THEN CURRENT_DATE - data_vencimento
            ELSE 0
        END AS dias_atraso,
    COALESCE(( SELECT sum(ni.quantidade_usada)
           FROM fornecedor_notas_itens ni
          WHERE ni.nota_id = n.id), 0::numeric) AS total_qtd_usada,
    COALESCE(( SELECT sum(ni.quantidade_devolvida)
           FROM fornecedor_notas_itens ni
          WHERE ni.nota_id = n.id), 0::numeric) AS total_qtd_devolvida,
    criado_em,
    entrada_compra_id
   FROM fornecedor_notas n
  WHERE fornecedor_id = '99c8ac2f-08b1-4862-88cc-9d2e0b900f4e'::uuid
  ORDER BY data_emissao DESC;
