# VALE DITADO — copy final da página `/vale`
*Ditado Brasa & Bar · Redator · v1 de 24/11/2026 · base: `PRD-vale-ditado.md`, `produtos.md`, `textos.md` (v2) · nada publicado.*
*Organizado pelos IDs de seção do layout (S1–S10, C1–C3, E1). Texto entre `{chaves}` = variável do sistema. `[CONFIRMAR]` = dado que ainda depende do Kadu, do advogado ou do contador: não ir para produção com ele.*

**Regras de ouro para o programador**
- Não trocar preço, prazo ou regra no texto: tudo vem daqui ou do admin.
- "%" de desconto: **arredondar para baixo** (nunca anunciar desconto maior que o real). Os valores já calculados estão em S4.
- Não citar Open de Chopp nem rodízio em nenhum lugar.
- Aviso legal fixo no rodapé e no checkout: "Beba com moderação. Proibido para menores de 18 anos."

---

## S1 — HERO

### Versão Black Brasa (fase `black`, 27/11 a 30/11)
- **Faixa (sobretítulo):** BLACK BRASA · SÓ ATÉ SEGUNDA (30/11)
- **Título:** Mais vale um Ditado na mão.
- **Subtítulo:** Kits, cartelas de chopp e vales com até 34% de desconto. Compra agora, usa em até 6 meses.
- **CTA principal:** Escolher meu vale
- **Linha de apoio (abaixo do CTA):** Só pelo site. No bar não tem esse preço.

### Versão Natal (fase `natal`, 01/12 a 24/12)
- **Faixa (sobretítulo):** VALE DE NATAL · ATÉ 24/12
- **Título:** Dá um Ditado de presente.
- **Subtítulo:** Kit com chopp, cartela ou vale em reais, com o nome de quem vai ganhar. Usa em até 6 meses.
- **CTA principal:** Escolher o presente
- **Linha de apoio:** Presente que ninguém devolve.

*Alt da logo:* "Ditado Brasa & Bar"

---

## S2 — BARRA DE URGÊNCIA / CONTADOR

- **Black Brasa:** A Black Brasa acaba em **{dd}d {hh}h {mm}min**
- **Natal:** O Vale de Natal acaba em **{dd}d {hh}h {mm}min**
- **Último dia (menos de 24h):** Último dia. Acaba às {hora} de hoje.
- **Linha fixa ao lado:** Lote limitado · até 2 de cada produto por CPF
- *Hora final de cada fase:* `[CONFIRMAR: hora de encerramento em 30/11 e 24/12]`

---

## S3 — DESTAQUES (3 blocos curtos)

1. **Até 34% mais barato** — Preço que só existe aqui no site.
2. **6 meses para usar** — Qualquer dia que a casa abrir. Dá para usar aos poucos.
3. **Pra você ou de presente** — Coloca o nome de quem vai ganhar na compra.

*Ditado da seção (opcional, abaixo dos blocos):* Quem guarda, tem.

---

## S4 — GRADE DE PRODUTOS

**Título da seção:** Escolha o seu
**Subtítulo:** Lote limitado. Quando acabar, acabou.

**Microcopy padrão do card**
- Preço: `de R$ {de}` (riscado) · `por R$ {por}` (grande)
- Selo de desconto: `-{pct}%`
- Estoque normal: `Restam {N}`
- Estoque abaixo de 20% do lote: `Últimos {N}`
- Estoque zero: selo `Esgotado` + botão desativado `Esgotou`
- Botão: `Quero este` · depois de adicionado: `No carrinho ({qtd})`
- Limite atingido no card: `Máximo de 2 por CPF`
- Rodapé dos cards com chopp (texto pequeno): `Não vale no happy hour (até 21h).`

**Blocos (títulos de grupo opcionais):** Chopp pra várias visitas · Kits de mesa · Drinks · Pra família · Vale pra gastar no que quiser

| # | slug | Nome | Linha de composição | Selo temático | de → por | Selo % | Lote |
|---|---|---|---|---|---|---|---|
| 1 | cartela-5 | Cartela 5 Chopps | 5 chopps Brahma 300 ml. Dois hoje, três no sábado. | Use em várias visitas | de R$ 92,50 por **R$ 64,90** | -29% | 100 |
| 2 | cartela-10 | Cartela 10 Chopps | 10 chopps Brahma 300 ml, aos poucos, em 6 meses. | Use em várias visitas | de R$ 185,00 por **R$ 129,90** | -29% | 50 |
| 3 | abre-a-brasa | Abre a Brasa | Linguiça portuguesa na massa, queijo coalho com mel, pão de alho e 4 chopps. | Começo de conversa | de R$ 184,00 por **R$ 129,90** | -29% | 60 |
| 4 | kit-boteco | Kit Boteco | Torresmo de rolo, bolinho de costela (8 un) e 6 chopps. | Pra turma | de R$ 227,00 por **R$ 159,90** | -29% | 60 |
| 5 | kit-passarinho | Kit Passarinho | Frango a passarinho, fritas 500 g e 4 chopps. | Clássico de boteco | de R$ 168,00 por **R$ 119,90** | -28% | 50 |
| 6 | kit-picanha | Kit Picanha | Picanha acebolada 400 g e 4 chopps. | Da brasa | de R$ 193,00 por **R$ 139,90** | -27% | 40 |
| 7 | tabua-chopp | Tábua & Chopp | Tábua de frios Ditado e 4 chopps. | Pra beliscar | de R$ 203,90 por **R$ 149,90** | -26% | 40 |
| 8 | assado-do-ze | Assado do Zé | Coxa e sobrecoxa desossada na brasa, para 2, e 4 chopps. | Pra 2 | de R$ 163,00 por **R$ 119,90** | -26% | 30 |
| 9 | role-de-gin | Rolê de Gin | 4 gin tônica. | Vale no happy hour | de R$ 116,00 por **R$ 79,90** | -31% | 50 |
| 10 | rodada-caipirinha | Rodada de Caipirinha | 4 caipirinhas de 500 ml. | Vale no happy hour | de R$ 151,60 por **R$ 99,90** | -34% | 40 |
| 11 | familia | Família no Ditado | Picanha na chapa com cascata de queijo e 4 refrigerantes. | Sem álcool | de R$ 196,00 por **R$ 159,90** | -18% | 30 |
| 12 | vale-100 | Vale Ditado 100 | Paga R$ 100, consome R$ 125 no cardápio. | Ganha R$ 25 | de R$ 125,00 por **R$ 100,00** | +25% de crédito | 100 |
| 13 | vale-200 | Vale Ditado 200 | Paga R$ 200, consome R$ 250 no cardápio. | Ganha R$ 50 | de R$ 250,00 por **R$ 200,00** | +25% de crédito | 50 |

*Notas:*
- Rodapé "Não vale no happy hour (até 21h)" só nos cards 1 a 8 (os que têm chopp). Gin e caipirinha não têm essa trava pelo PRD; o selo "Vale no happy hour" só entra se o Kadu confirmar `[CONFIRMAR: gin e caipirinha valem no happy hour?]`. Se não confirmar, usar o selo "Drinks da casa".
- Nos vales 100 e 200, mostrar o selo `+25% de crédito` no lugar do `-%` (vende melhor e é exato). Texto pequeno no card: `Não paga garrafas nem outras promoções.`
- Card sem foto (tipográfico): só nome, composição e preço. Não usar imagem gerada por IA.

---

## S5 — VALES DE CRÉDITO

**Título:** Não sabe o que escolher? Dá crédito.
**Texto:** Você paga R$ 100 e consome R$ 125. Ou paga R$ 200 e consome R$ 250. Usa no que quiser do cardápio, em quantas visitas quiser, por 6 meses.
**Linha pequena:** Não paga garrafas nem itens de outras promoções. Não dá troco: se passar do saldo, paga a diferença na hora.
**CTA:** Quero o Vale 100 · Quero o Vale 200

---

## S6 — COMO FUNCIONA

**Título:** Simples como pedir mais uma.
1. **Compra aqui.** Escolhe, paga no Pix e pronto.
2. **Recebe o código.** Chega na hora, com QR code. Salva no WhatsApp.
3. **Mostra no bar.** O garçom lê o código e dá baixa no que você usar. O resto fica guardado.

---

## S7 — PRESENTE DE NATAL

**Título:** Presente bom é o que vira encontro.
**Texto:** Na compra, marque "é presente" e coloque o nome e o CPF de quem vai ganhar. O vale sai no nome da pessoa. Você manda o link pelo WhatsApp e ela usa quando quiser, em até 6 meses.
**Lista curta:**
- Pro amigo do chopp: Cartela 10 Chopps
- Pra turma do trabalho: Kit Boteco
- Pra família toda: Família no Ditado
- Pra quem você não sabe o gosto: Vale Ditado 200
**CTA:** Montar meu presente
*(Na fase Black Brasa, trocar o título por: "Já adianta o presente de Natal.")*

---

## S8 — REGRAS RESUMIDAS

**Título:** O combinado
- Vale **6 meses** a partir da compra. A data exata vem no seu vale.
- Usa **qualquer dia** que o bar estiver aberto.
- Produtos com chopp **não valem no happy hour (até 21h)**. Depois das 21h, tudo certo.
- Pode usar **aos poucos**, em mais de uma visita.
- **10% de serviço** sobre o valor que você pagou, não sobre o preço cheio.
- **Couvert artístico à parte**, nos dias de música com couvert.
- **Não junta** com outras promoções. Os vales 100 e 200 não pagam garrafas nem outras promoções.
- Até **2 de cada produto por CPF**.
- Bebida alcoólica só para **maiores de 18**, com documento com foto na hora.
- Mudou de ideia? **7 dias** para cancelar, com devolução integral.

**Link:** Ler o regulamento completo

---

## S9 — FAQ

**Título:** Pergunta de mesa

**1. Posso dar de presente?**
Pode. Marque "é presente" e coloque nome e CPF de quem vai ganhar. Se preferir, transfere depois pelo WhatsApp, sem custo.

**2. Preciso usar tudo de uma vez?**
Não. Usa em quantas visitas quiser, dentro dos 6 meses. O saldo fica no seu comprovante.

**3. Vale no fim de semana?**
Vale. Qualquer dia que a casa abrir. Só os produtos com chopp ficam fora do happy hour, até as 21h.

**4. O Vale Ditado 100 paga qualquer coisa?**
Qualquer item do cardápio, menos garrafas e o que já estiver em outra promoção.

**5. Paga 10%?**
Paga, mas sobre o valor que você pagou, não sobre o preço cheio. O couvert é à parte.

**6. Junta com outra promoção?**
Não. O vale já é a promoção.

**7. Perdi o código. E agora?**
Abra o link do comprovante que você salvou. Se perdeu também, chame no WhatsApp com seu CPF que a gente reenvia.

**8. E a nota fiscal?**
Sai em nome da K M Popular Bar Ltda `[CONFIRMAR com contador: emitida na compra ou no resgate]`.

---

## S10 — RODAPÉ

Ditado Brasa & Bar · *Onde há fumaça, há fogo.*
K M POPULAR BAR LTDA · CNPJ 12.061.357/0001-69
`[CONFIRMAR: endereço completo]` · Cuiabá-MT
Atendimento: WhatsApp (65) 4141-3655 · `[CONFIRMAR: e-mail]` · `[CONFIRMAR: dias e horário de atendimento]`
Links: Regulamento · Consultar meu vale · Privacidade
**Beba com moderação. Proibido para menores de 18 anos.**

---

## C1 — CHECKOUT

**Título:** Quase lá.
**Subtítulo:** Preencha seus dados. O vale sai no seu nome (ou no de quem vai ganhar).

### Resumo do carrinho
- Título: Seu pedido
- Linha: `{qtd}x {produto}` · `R$ {subtotal}`
- Total: `Total: R$ {total}`
- Economia: `Você economizou R$ {economia}`
- Remover: `Tirar`
- Carrinho vazio: Carrinho vazio. A mesa está posta, falta escolher. [Ver os vales]

### Campos
| Campo | Label | Placeholder | Ajuda (abaixo do campo) |
|---|---|---|---|
| nome | Nome completo | Como está no documento | |
| cpf | CPF | 000.000.000-00 | Usado para emitir e conferir o vale. |
| nascimento | Data de nascimento | dd/mm/aaaa | |
| celular | Celular (WhatsApp) | (65) 90000-0000 | O comprovante chega por aqui. |
| email | E-mail (opcional) | voce@email.com | |

**É presente?**
- Caixa: `É presente`
- Campos que abrem: `Nome de quem vai ganhar` (placeholder: Nome completo) · `CPF de quem vai ganhar` (placeholder: 000.000.000-00)
- Ajuda: O vale fica no nome da pessoa. Só ela resgata.

### Mensagens de validação
- Campo vazio: Falta preencher este campo.
- Nome incompleto: Coloque nome e sobrenome.
- **CPF inválido:** Esse CPF não confere. Dá uma olhada nos números.
- CPF do presenteado inválido: O CPF de quem vai ganhar não confere.
- Data inválida: Data inválida. Use dd/mm/aaaa.
- Celular inválido: Confira o celular com DDD.
- E-mail inválido: Esse e-mail parece incompleto.
- **Menor de 18 com item de álcool:** Pela lei, produto com bebida alcoólica só para maiores de 18. Tire do carrinho os itens com álcool para continuar. A Família no Ditado e os Vales Ditado 100 e 200 você pode levar. *(Botão: Tirar itens com álcool)*
- **Limite por CPF:** Esse CPF já chegou no limite de 2 {produto}. Cada CPF leva até 2 de cada produto.
- Limite no carrinho: Máximo de 2 por CPF.
- Lote acabou durante a compra: Enquanto você preenchia, o lote de {produto} acabou. Tiramos ele do carrinho. O resto continua garantido.
- Estoque menor que o pedido: Só restam {N} de {produto}. Ajustamos a quantidade.

### Resumo das regras (antes de pagar)
**Título:** Antes de pagar, confira:
- Válido até **{data_validade}** (6 meses).
- Qualquer dia que o bar abrir. Produtos com chopp não valem no happy hour (até 21h).
- Pode usar aos poucos, em mais de uma visita.
- 10% de serviço sobre o valor pago. Couvert à parte.
- Não junta com outras promoções.
- 7 dias para desistir, com devolução integral.

### Os 3 aceites obrigatórios
1. ☐ Li e aceito o [regulamento].
2. ☐ Sou maior de 18 anos. *(só aparece se houver item com álcool)*
3. ☐ Entendi as regras de uso: validade, happy hour, 10% e couvert.

- Erro se faltar aceite: Marque as caixas obrigatórias para continuar.

### Consentimento WhatsApp (separado, desmarcado, opcional)
☐ Quero receber novidades e ofertas do Ditado pelo WhatsApp. Posso sair quando quiser respondendo SAIR.
*Texto pequeno:* Opcional. Não muda nada na sua compra.

### Forma de pagamento
- Título: Como você quer pagar?
- Opção 1: **Pix** · aprovação na hora (selecionada por padrão)
- Opção 2: Cartão de crédito
- Botão: **Pagar R$ {total}**
- Botão carregando: Gerando seu pagamento...
- Texto de segurança: Pagamento processado por `[CONFIRMAR: Asaas ou Mercado Pago]` em nome de K M POPULAR BAR LTDA.
- Lote reservado: Separamos seus vales por 30 minutos.

---

## C2 — PAGAMENTO PIX

**Título:** Paga no Pix e pronto.
**Instruções:**
1. Abra o app do seu banco.
2. Escolha Pix e leia o QR code, ou use o "copia e cola".
3. Confira o recebedor: **K M POPULAR BAR LTDA**.
4. Pague. Esta tela atualiza sozinha.

- Valor: `R$ {total}`
- Botão: **Copiar código Pix**
- Após copiar: Código copiado. Agora é só colar no app do banco.
- Prazo: Seus vales ficam reservados por **{mm:ss}**.

**Aguardando:**
- Título: Esperando o Pix cair...
- Texto: Pode deixar esta tela aberta. Assim que o banco confirmar, seus códigos aparecem aqui.
- Link: Já paguei e não atualizou → Verificar de novo

**Pago (transição):** Pix recebido! Gerando seus vales...

**Expirou:**
- Título: O tempo do Pix acabou.
- Texto: Os vales voltaram para o lote. Se ainda tiver, dá para gerar um Pix novo.
- Botão: Gerar novo Pix
- Linha: Pagou e caiu aqui? Chame no WhatsApp (65) 4141-3655 com o comprovante.

**Cartão (se escolhido):**
- Recusado: O cartão não passou. Tente outro cartão ou pague no Pix.
- Processando: Confirmando com o banco...

---

## C3 — SUCESSO / COMPROVANTE (`/vale/c/:token`)

**Título:** Tá na mão!
**Subtítulo:** Mais vale um Ditado na mão. Agora é só marcar o dia.
**Texto:** Seus vales estão abaixo. Guarde este link: ele mostra o saldo atualizado a cada visita.

**Card de cada vale**
- `{produto}` · Código **{codigo}** · [QR code]
- Titular: `{primeiro_nome} {inicial_sobrenome}.`
- Válido até **{data_validade}**
- Saldo: `{item}: {usado} de {total} usados` (kit) · `Saldo: R$ {saldo} de R$ {credito}` (crédito)
- Status: Ativo · Em uso · Usado · Vencido · Cancelado
- Para usar: Mostre este código ao garçom ou no caixa, com documento com foto.

**Regras resumidas (rodapé do comprovante):** Produtos com chopp não valem no happy hour (até 21h) · 10% sobre o valor pago · couvert à parte · não junta com outras promoções.

**Botões**
- **Salvar no WhatsApp**
- Baixar imagem
- Ver regulamento

**Texto pré-preenchido do wa.me** (`https://wa.me/?text=` + texto codificado):
```
Meu Vale Ditado está garantido!
{produto_1}{, produto_2...}
Válido até {data_validade}.
Para ver os códigos e o saldo: {link_comprovante}
Ditado Brasa & Bar · Onde há fumaça, há fogo.
```
*Versão presente (se o pedido for presente):*
```
Você ganhou um Ditado de presente!
{produto_1}{, produto_2...}, no seu nome.
Válido até {data_validade}. É só mostrar o código no bar.
Ver o vale: {link_comprovante}
Ditado Brasa & Bar · Onde há fumaça, há fogo.
```
*Ajuda abaixo do botão:* Dica: mande para você mesmo ou para quem vai ganhar.

---

## E1 — ESGOTADO E ERROS

- **Produto esgotado (card):** Esse lote acabou. Quem chegou, chegou.
- **Tudo esgotado (página):** Título: Acabou o lote. · Texto: Obrigado a quem garantiu o seu. A brasa continua acesa: a gente se vê no bar. · Botão: Reservar mesa (ditado.org/reserva)
- **Campanha encerrada (depois de 24/12):** Título: A venda do Vale Ditado acabou. · Texto: Quem comprou usa até a data do vale. Já tem o seu? [Consultar meu vale]
- **Campanha ainda não abriu:** A Black Brasa começa em 27/11 `[CONFIRMAR: hora]`. Volta aqui.
- **Erro no pagamento:** Algo falhou ao gerar o pagamento. Nada foi cobrado. Tente de novo.
- **Erro genérico:** Deu ruim do nosso lado. Tente de novo em instantes ou chame no WhatsApp (65) 4141-3655.
- **Sem conexão:** Parece que a internet caiu. Confira e tente de novo.
- **Comprovante não encontrado:** Não achamos esse vale. Confira o link ou chame no WhatsApp.
- **Consulta (`/vale/consultar`) sem resultado:** Código ou CPF não conferem. Confira e tente de novo.
- **Vale vencido (no comprovante):** Este vale venceu em {data_validade}.
- **Vale cancelado/estornado:** Este vale foi cancelado e o valor devolvido.

---

## Pendências `[CONFIRMAR]` desta página
1. Hora de abertura (27/11) e de encerramento (30/11 e 24/12).
2. Endereço completo, e-mail e horário de atendimento (rodapé).
3. Gateway (Asaas ou Mercado Pago), para o texto de segurança.
4. Nota fiscal: na compra ou no resgate (FAQ 8; contador).
5. Gin e caipirinha valem no happy hour? (selo dos cards 9 e 10).
6. Regulamento revisado pelo advogado antes de linkar (inclui redação da taxa de 10% como opcional).

---

## ADENDO 24/11 — Brinde só da Black Brasa (decisão do Kadu)
Todo vale pago até 30/11 às 23:59 ganha **1 Dupla de Bolinho de Costela** (R$ 18 no cardápio).
- **Selo nos cards (S3/S4/S5):** "+ BRINDE BLACK"
- **Linha no card:** "Comprando até 30/11: + Dupla de Bolinho de Costela de brinde."
- **S2 (relógio):** "BLACK BRASA · o brinde acaba em {d}d {h}h {m}m"
- **S1 subtítulo extra (fase Black):** "Comprou até segunda, ganhou bolinho. Quem cedo compra, o bolinho ajuda."
- **C3 (comprovante):** item "Dupla de Bolinho de Costela (brinde Black)" no saldo.
- **Regra (S8/regulamento):** "Brinde válido para vales pagos até 30/11/2026 às 23:59, um por vale, resgatado junto com o vale, dentro da validade."
- **A partir de 01/12:** selo, linha e relógio do brinde somem; a S2 volta para "Vale de Natal · vendas até 24/12".

## ADENDO 24/11 (2) — Natal entra como "sucesso da Black" (Kadu)
- **Durante a Black (27 a 30/11): não citar Natal em lugar nenhum** (nem S1, S2, S7, FAQ, regulamento). O cliente tem que achar que acaba na segunda. A S7 vira "Dá de presente" genérico, sem a palavra Natal.
- **A partir de 01/12:** fase "Vale de Natal", com faixa no topo: "Por causa do sucesso da Black Brasa, o Ditado abriu o Vale de Natal. Mesmos vales, até 24/12." Sem o brinde de bolinho.
- **Regra de honestidade:** só usar "por causa do sucesso" se a Black vender de verdade (sugestão: pelo menos 100 vales ou R$ 10 mil). Se vender menos, a faixa fica: "Voltou: Vale de Natal do Ditado, até 24/12."
