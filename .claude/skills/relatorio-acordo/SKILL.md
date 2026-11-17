---
name: relatorio-acordo
description: Gera o relatório de pagamentos de um acordo trabalhista (Jurídico do Ditado) em PDF, sempre no layout do relatório do Augusto de 04/11/2026, com os comprovantes anexos, e ensina a lançar comprovantes do acordo na Central de agentes. Use quando o Kadu pedir o relatório de um acordo (Augusto, Eduardo, Maria Sandra, Creosnaldo, Arian, Thiago…), mandar comprovantes de acordo para juntar, ou pedir o relatório "igual ao do Augusto".
---

# Relatório de acordo trabalhista

O layout é fixo: **não invente formato novo**. A referência é o relatório do Augusto (04/11/2026), aprovado pelo Kadu.
O gerador `gera.py` reproduz esse layout; o que muda a cada acordo são os dados da Central e os textos do `config.json`.
O relatório é para o advogado da empresa (Dr. Rodolpho). Nada aqui altera o financeiro (CLAUDE.md, regra 7).

## De onde vêm os dados

Central de agentes, 5º andar (Jurídico): https://claude.ai/artifact/9reGQma3mboq6maWUcqhXt

- `acordos/<id>`: nome, processo, vara, empresa, advogados, `pago_a`, `clausula.faixas` (multa por atraso), `documentos` (ata).
- `parcelas/<id>-NN`: `n`, `venc`, `valor` (`valor_ata` quando difere), `fin` (conta no Contas a Pagar: `titulo`, `status`, `pagamentos`).
- `comprovantes/<id>-cNN`: `parcela`, `data`, `valor`, `descricao`, `obs`, `pago_por`, `asset` (arquivo), `arquivo`.

## Regra de ouro: o pagamento abate sempre a parcela mais antiga

**Pagamento feito no mês seguinte quase nunca é a parcela do mês seguinte: geralmente é a parcela anterior paga com atraso** (Kadu, 12/11/2026).
Ao juntar comprovantes, ponha os pagamentos em ordem de data e vá quitando as parcelas da mais antiga para a mais nova. Só passa para a
próxima parcela quando a anterior estiver quitada. Não case o pagamento com a parcela pelo mês do Pix nem pela descrição do comprovante.

- **Pix pago em duplicidade segue a mesma regra.** Primeiro fecha a parcela mais antiga em aberto; só o que sobrar vira pagamento
  adiantado da seguinte. Não jogue o Pix inteiro para a última parcela: a parcela antiga fecharia mais tarde e cairia numa faixa de
  multa maior (Eduardo, 12/11/2026: com o Pix de 05/11 na 3ª parcela ela fecha em 10 dias, faixa de 20%; fora dela, em 11 dias, 50%).
- A parcela fica quitada no dia do pagamento que completa o valor dela. É esse dia que conta o atraso e a faixa da multa.
- **Comprovante entra sempre com o valor cheio do Pix**, na parcela que ele fecha. Não divida um comprovante em dois valores (o Kadu
  estranha "juntei 691 e aparece 191"). Se o Pix passa do que faltava, o que sobra vai para a parcela seguinte como uma linha
  **sem arquivo**: `valor` = a sobra, `asset: null`, `sobra_de: <id do comprovante>`, `descricao: "Sobra do Pix de R$ X de DD/MM"`.
- Pix dividido entre dois acordos (mesmo escritório): `valor` = a parte deste acordo e `valor_pix` = o Pix inteiro, com a explicação em `obs`.
- Parcela paga pelo financeiro sem comprovante: fica só com `fin.status = "pago"` e `fin.pagamentos`; o relatório mostra "sem comprovante".

## Juntar comprovantes na Central

1. Leia cada comprovante (data, valor, quem recebeu). Confira no Contas a Pagar se existe a baixa (somente leitura).
2. Se o acordo ainda não existe na Central, peça a ata ou a petição do acordo: sem ela não dá para saber parcelas, vencimentos e multa.
   Crie `acordos/<id>` e as parcelas com as datas e valores da ata, e anexe a ata em `documentos`.
3. Suba os arquivos: `Artifact` publish com `url`, `asset: true` e `file_paths` (os arquivos precisam estar dentro da pasta do repositório:
   copie para uma pasta temporária e apague depois). Imagem colada no chat sem arquivo: está em base64 na última linha `attachment` do
   histórico da sessão (`~/.claude/projects/.../<sessão>.jsonl`).
4. Grave os comprovantes com `ArtifactData` (batch), seguindo a regra de ouro. Atualize a `nota` das parcelas que mudaram.
5. CPF não vai em texto nenhum (nota, obs, relatório, resposta). Chave Pix que é CPF: escreva só "Pix para CPF".

## Gerar o relatório

1. **Dados.** Com `ArtifactData` e `out_dir` numa pasta do scratchpad (ex.: `db`): `get` em `acordos/<id>` e `query` em `parcelas` e
   `comprovantes` com `where: [["acordo", "==", "<id>"]]`.
2. **Comprovantes.** Baixe cada arquivo com `Artifact` read, `path: <id do asset>` e `out_dir` numa pasta (ex.: `comprovantes`).
   É um arquivo por chamada (`paths` não serve para asset). O arquivo sai com o nome `<id do asset>.<ext>`.
3. **Config.** Escreva `config.json` (modelo em `exemplo-config.json`, o do Eduardo):
   - `destinatario` (padrão: Dr. Rodolpho Vasconcellos Dias) e `emitido` (AAAA-MM-DD, a data de hoje em Cuiabá).
   - `dados`: linhas de "Dados do acordo", nesta ordem: Processo, Partes, Valor, Pagamento, Advogados, No sistema. Texto corrido, tirado da ata.
   - `notas`: caixas depois da tabela (título em negrito + texto). "Como foi calculado" entra sozinha, a partir da cláusula do acordo.
     Use as outras para o que é próprio do acordo: prazo para o reclamante noticiar inadimplemento (quando a ata tiver), Pix compartilhado,
     pagamentos em partes, o que falta pagar.
4. **Gerar.** `python3 gera.py db <id> comprovantes config.json Relatorio-Acordo-<Nome>.html` e
   `node ../relatorio-contagem/pdf.cjs Relatorio-Acordo-<Nome>.html Relatorio-Acordo-<Nome>.pdf`.
5. **Conferir** as páginas (`pdftoppm -r 70 -png arquivo.pdf pg` e ler as imagens): totais dos cartões, parcela a parcela e se todo
   comprovante aparece. Envie com SendUserFile.

## Estrutura (nesta ordem, sempre)

1. Cabeçalho: "Acordo trabalhista · Nome", "Relatório de pagamentos para o Dr. …", à direita "Ditado Popular / emitido em".
2. Quatro cartões: Valor do acordo (com a composição das parcelas), Pago (N de M quitadas), Em aberto (em vermelho, com a próxima parcela), Atraso médio.
3. Dados do acordo.
4. Parcela a parcela: Nº, Referente, Vencimento, Valor, Pagamentos (Pix), Pago, Situação, Atraso, Faixa da multa, Multa máx., No sistema. Parcela vencida em aberto fica com fundo rosa. Linha de total.
5. Caixas de nota.
6. Anexo · comprovantes por mês: uma faixa por parcela e os comprovantes em cartões (3 por linha), com data, valor, descrição e observação.

## Regras de cálculo (já no gera.py, iguais às da página da Central)

- Atraso em dias corridos entre o vencimento e a quitação. Vencimento em sábado, domingo ou feriado passa para o dia útil seguinte
  (art. 132, §1º, do Código Civil). A lista de feriados é a mesma da página; acrescente o ano novo nos dois lugares.
- Faixa da multa: a primeira faixa de `clausula.faixas` em que o atraso cabe. "Multa máx." = percentual × valor da parcela (pela ata),
  somada só nas faixas sobre a parcela. A faixa "100% do saldo" aparece, mas não entra na soma. A multa só é devida se o reclamante pedir
  ao juiz, e o juiz pode reduzir (art. 413 do Código Civil).
- Pago da parcela nunca passa do valor dela; o que passa aparece como "vão para a parcela seguinte".
- Atraso médio: média dos dias de atraso das parcelas quitadas (em dia conta zero).
