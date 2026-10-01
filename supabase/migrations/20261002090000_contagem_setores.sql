/*
  # Estoque Beta 2: Contagem dos setores e aprovação de diferenças

  Duas contagens por setor (Bar de Cerveja, Bar de Drinks, Cozinha e kits),
  guardadas em contagens_estoque como "blocos" especiais:
    __diaria    → só os itens que a Zig não baixa (controle = contagem).
                  Concluir acerta o saldo na hora: o contado é o consumo.
    __auditoria → tudo do setor (configurado ou com saldo). Concluir só
                  fecha; as diferenças esperam Cristiano ou Kadu aprovar
                  (tudo, ou mantendo o sistema em alguns itens) ou rejeitar.
                  Sem diferença, processa direto.
  O acerto de saldo continua sendo o de sempre (processar_contagem_estoque):
  movimentação de contagem por item, com a diferença contra o saldo atual.
  Os dias de auditoria vêm de estoque_auditoria_dias (1=seg … 7=dom).

  Funções: fn_contagem_setor_tela, fn_contagem_setor_abrir,
  fn_contagem_setor_itens, fn_contagem_setor_anotar,
  fn_contagem_setor_concluir, fn_aprovacoes_tela, fn_aprovacao_decidir;
  fn_beta2_hoje ganha contagem_setores_falta, auditoria_hoje e
  aprovacoes_pendentes.
  (Corpos aplicados via SQL nesta mesma data; a referência é o banco.)
*/
