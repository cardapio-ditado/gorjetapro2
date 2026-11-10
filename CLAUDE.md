# CLAUDE.md — Ditado Popular (Gestão Ditado / Gorjeta Pro)

Regras permanentes para qualquer agente que trabalhe neste repositório. A parte técnica
(arquitetura, regras do estoque, bugs já corrigidos) está em `CONTEXTO-PROJETO.md`: leia antes de mexer.

- Sistema do bar Ditado Popular, Cuiabá-MT (UTC-4). Dono: Kadu.
- Supabase: projeto `nzdiojmrukdxavrdazot`. Produção publica a branch `main`.
- Responda sempre em **português**, direto e sem jargão.

## Como trabalhar com o Kadu

1. **Não construa nada sem antes falar o plano** e receber o "pode". Pergunta, consulta e análise
   (somente leitura) podem ser feitas direto.
2. **Financeiro só muda com OK explícito.** O valor do fluxo de caixa nunca pode mudar.
   Antes e depois de qualquer mudança em massa, confira os totais (fluxo, contas a pagar, pago,
   status). Se mudou, desfaça (rode dentro de um bloco que aborta se os totais mudarem).
3. **Limpeza de dados só depois de analisar junto com o Kadu.** Primeiro mostre a lista e o motivo,
   depois execute. Antes de apagar ou reduzir algo, faça backup em tabela `_backup_*` (RLS ligado,
   sem acesso de anon/authenticated).
4. **Dado sensível de colaborador fica fora de relatório, print e resposta:** CPF, RG, salário, férias,
   vale. Não repita CPF de ninguém, mesmo que apareça numa consulta.
5. **Senhas e tokens:** nunca pedir senha por escrito nem colocar em arquivo. O token da ZIG
   nunca é copiado nem exposto, e a edge function `zig-buscar-vendas` não é redeployada.
   Os segredos o Kadu configura sozinho.
6. **Contagem de estoque:** não concluir sem o "pode" do Kadu (ver skills `contagem-estoque` e
   `relatorio-contagem`).
7. **Jurídico não altera o financeiro.**
8. **Commits:** só no branch combinado, com mensagem clara em português. Não abrir PR nem publicar
   na `main` sem pedido. Sem identificador de modelo em commit, código ou PR.
9. Quando errar, diga que errou e corrija. Não afirme que algo está completo sem ter verificado.

## Estoque (onde estão as regras)

Não duplicar aqui: cada regra tem uma fonte só.
- **Regras invioláveis do estoque**: `CONTEXTO-PROJETO.md`, seções 2 a 4. O front nunca escreve
  saldo, só movimentação. A régua única de saldo é `fn_saldo_por_movimentacoes`. Produção só por
  `processar_producao`. Contagem é verdade absoluta, sem tolerância.
- **Medidas da casa** (fileira, prateleira, fundo, caixa, fardo, kg): skill `contagem-estoque`
  (`.claude/skills/contagem-estoque/SKILL.md`). A fonte original é `supabase/functions/agente-whatsapp/prompt.ts`,
  seção "Regras da casa". Não pergunte ao Kadu o que já está lá. Quando ele disser outro número, vale o dele.
- **Relatório de faltas e sobras**: skill `relatorio-contagem`, sempre no layout do modelo de 23/10.

## Regras de negócio combinadas

### Músicos (05/11/2026)
- Show novo exige **artista cadastrado** (fornecedor `tipo = 'musico'`). Projeto é opcional e vira
  "Projeto · Artista". Só gerente/admin cadastra artista novo (nome, chave PIX, aviso de parecido).
- **Opção C:** o "Informar" do gerente (`musicos_pagamentos`) é o controle dele. O financeiro fica no
  Contas a Pagar, e os dois são comparados lado a lado (`fn_musicos_situacao_financeiro`), sem um
  sobrescrever o outro.
- Antes de outubro/2026 não há dívida com músicos: as contas antigas foram limpas em 05/11.
- **10/11/2026:** o controle do Cristiano é a referência. O Contas a Pagar de músicos foi acertado para ficar
  igual ao controle, show por show (backup `_backup_contas_musicos_20261110`). Conta de músico só nasce do
  show no módulo (trava `trg_contas_pagar_trava_musico`): o financeiro paga a conta do show, nunca cria avulsa.
- O fornecedor genérico "MÚSICOS E ARTISTAS" está inativo e não deve ser usado.

### Extras / diaristas (05/11/2026)
- Fornecedor tem 4 tipos: `geral`, `musico`, `rh` (colaborador) e **`extra`** (diarista).
- Diária só com **pessoa do cadastro**. Pessoa nova só por `fn_extras_cadastrar_pessoa`: nome
  completo como no PIX, chave PIX obrigatória, aviso de nome parecido, e já ligada a quem recebe o
  PIX (`extras_pessoas.fornecedor_id`).
- Mesma pessoa com dois cadastros: juntar (`juntado_com`). Com o OK do Kadu, juntar também o
  fornecedor criado pelo módulo no fornecedor que recebe o PIX (`fn_fornecedor_unificar`).
- Colaborador da casa que faz extra continua como colaborador; o PIX dele pode ser salário ou vale.

### Andar Operacional (prioridade de pagamento)
- Atualização diária às 6:32 (Cuiabá). Passo a passo em `scripts/operacional/README.md`.
- Prazo: extra da casa 7 dias, extra de fora 2 dias, músico 7 dias.
- Dívida real = diária/show lançado − PIX recebido. Um PIX só paga diária do mesmo dia ou anterior.
- **Corte do financeiro:** até o dia anterior ao primeiro PIX da Stone sem baixa, controle e financeiro
  têm que bater; diferença ali é real. Depois do corte, o PIX do banco aparece "sem baixa, a
  confirmar" e não abate a dívida sozinho.
- O andar só lê. Nada no financeiro é alterado por ele.
