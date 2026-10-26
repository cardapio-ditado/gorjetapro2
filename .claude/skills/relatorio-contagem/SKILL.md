---
name: relatorio-contagem
description: Gera o relatório "Faltas e sobras da contagem" do Bar e do Estoque Central (Ditado Popular) em PDF, sempre no mesmo layout (modelo de 23/10). Use depois de fechar uma contagem do Bar e/ou do Central, ou quando o Kadu pedir o relatório da contagem, faltas e sobras, cruzamento Bar × Central.
---

# Relatório de contagem (Bar e Central)

O layout é fixo: **não invente formato novo**. A referência é `modelo-23-10.html` (relatório de 23/10 aprovado pelo Kadu). O gerador `gera.py` reproduz exatamente esse layout; o que muda a cada contagem são os dados e os textos do `config.json`.

## Estrutura (nesta ordem, sempre)

1. Cabeçalho: "Ditado Popular · Bar e Central", "Faltas e sobras da contagem", selos (✓ Lançado e aprovado no sistema + pendências), à direita: Contagem, Vendas Zig, Anterior.
2. Faixa azul: `Contagem anterior + Entradas e transferências − Vendas Zig = Deveria ter → comparado com a contagem de hoje`.
3. **Faltas: sumiu do estoque** — tabela Item | Contagem anterior | Entrou | Vendeu | Deveria | Contado | Dif. Linha de baixo do item: `Estoque · nota · R$ valor`. Última linha: "Doses abertas no balcão" (garrafas com diferença fracionada < 1 e < R$ 15).
4. **Sobras: tem mais do que o sistema esperava** — mesma tabela.
5. (opcional) **Vendas de garrafa e cadastro da Zig (não é perda)** — item | o que houve | ajuste.
6. (opcional) Blocos explicativos (ex.: rótulo trocado, notas lançadas antes de fechar).
7. **Desceu do Central sem requisição** — chips item + quantidade (sobra no Bar = falta no Central).
   **Lançado para o Bar, mas ficou no Central** — chips (falta no Bar = sobra no Central).
8. Cartões de total: Faltas (a custo) e Sobras (a custo), com os 3 maiores.
9. **Para a próxima contagem fechar** — 4 a 6 orientações curtas, em negrito o título.
10. Rodapé: "Gerado a partir do Estoque Beta 2 · contagem de DD/MM/AAAA aprovada (Bar: N itens, Central: M itens)".

## Passo a passo

1. **Dados.** Rode `consulta.sql` trocando `__DATA__` pela data da contagem (ex.: `2026-10-26`) com `mcp__Supabase__execute_sql` (projeto `nzdiojmrukdxavrdazot`). Remova as linhas de comentário (`--`) antes de enviar. Salve o JSON da coluna `r` em `dados.json` no scratchpad.
   - `linhas`: um registro por estoque e item contado (anterior, entrou, vendeu, deveria, contado, custo).
   - `acertos`: o que foi lançado depois do fechamento (`correcao` = transferência ou venda reconhecida; com custo 0 = zerado sem custo; `contagem` = complemento de contagem).
   - Confira: `anterior + entrou − vendeu = deveria` em todas as linhas.
2. **Config.** Escreva `config.json` (exemplo em `exemplo-config.json`):
   - `data_curta`, `dia_semana`, `vendas_zig` (ex.: "23 a 25/10 (sex a dom)"), `anterior`.
   - `badges`: `[{"txt": "✓ Lançado e aprovado no sistema"}, {"txt": "…", "tipo": "pend"}]`.
   - `ignorar`: `{"NOME NO SISTEMA": "explicação"}`. Item com correção fora do resultado (ex.: unidade errada no cadastro). Vai para "não é perda".
   - `pares`: `[["ITEM NO BAR", "ITEM NO CENTRAL", "rótulo do chip"]]`, quando o mesmo produto aparece com nomes diferentes nos dois estoques.
   - `notas`: `{"Bar|NOME NO SISTEMA": "texto curto"}`. Aparece na linha de baixo do item.
   - `explicados.linhas`, `blocos`, `dicas`: textos do dia, curtos e diretos, com valores e quantidades.
3. **Gerar.** `python3 gera.py dados.json config.json Contagem-Bar-Central-DD-MM.html` e `node pdf.cjs Contagem-Bar-Central-DD-MM.html Contagem-Bar-Central-DD-MM.pdf`.
4. **Conferir** as páginas (`pdftoppm -r 60 -png arquivo.pdf pg` e ler as imagens) antes de mandar. Envie com SendUserFile.

## Regras de cálculo (já no gera.py)

- Diferença por estoque = contado − deveria. Item não contado com acerto depois do fechamento: a diferença é o acerto.
- Cruzamento: se um estoque sobra e o outro falta no mesmo item, a parte que se compensa vira chip de transferência e sai das faltas/sobras. Em unidades inteiras; com acerto explícito, a quantidade exata.
- Valores a custo médio (valor_unitario da folha da contagem).
- Garrafa: diferença fracionada < 1 e < R$ 15 vai para "Doses abertas no balcão".
- Acerto com custo 0 (zerar negativo do Bar) vai para "não é perda", agrupado.

## Antes de fechar a contagem (para o relatório sair certo)

- Lance as notas que faltam antes de concluir. Uma nota faltando aparece como sobra grande (ex.: chopp e água em 26/10).
- Se alguém lançar transferência no meio da contagem, atualize `quantidade_sistema` da folha para o saldo atual antes de concluir. O Bar processa pela folha.
- Garrafa vendida pelo Bar que saiu do Central: lance como transferência (com custo), não como perda no Central.
- Destilado negativo no Bar que não estava no balcão: zerar sem custo (a perda já saiu no Central).

## Estilo do texto

Português simples, sem jargão. Nada de dado sensível de colaborador. Horários em Cuiabá. Nomes de exibição em `nomes.json`; acrescente os itens novos que aparecerem.
