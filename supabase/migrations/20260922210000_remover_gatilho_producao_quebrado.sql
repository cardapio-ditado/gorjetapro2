/*
  # Remove o gatilho antigo de conclusão de produção

  `trg_processar_conclusao_producao` dispara em toda atualização de
  `producoes` e a função `processar_conclusao_producao()` consulta a tabela
  `estoque_saldos`, que não existe mais (o saldo vive em `saldos_estoque`).
  Resultado: qualquer produção que tente ser concluída falha com
  "relation estoque_saldos does not exist". A última produção concluída
  com sucesso foi em 27/03/2026, antes da troca de tabela.

  A baixa de insumos e a entrada do produto já são feitas por
  `processar_producao(...)`, que é a função atual. O gatilho é código morto
  e só derruba a operação.
*/

DROP TRIGGER IF EXISTS trg_processar_conclusao_producao ON producoes;
DROP FUNCTION IF EXISTS processar_conclusao_producao();
