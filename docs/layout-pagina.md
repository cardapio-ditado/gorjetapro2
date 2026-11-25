# Vale Ditado: layout da página pública (/vale)
*CMO, 24/11/2026. Base: PRD v1, produtos.md, textos.md, marcas.md. IDs de seção iguais aos do `copy-pagina.md` (redator). Tela de referência: celular 375 × 667 px. Desktop: coluna central com no máximo 480 px na grade e 960 px no hero.*

## 0. Sistema visual
- **Fundo:** carvão #1A1A1A, textura de fumaça até 6% de opacidade (WebP < 30 KB ou gradiente CSS).
- **Card:** fundo #242120, borda 1 px âmbar #D99736 a 35%, raio 14 px, padding 16 px.
- **Texto:** off-white #F5EFE6; apoio em off-white a 70%.
- **CTA principal:** fundo âmbar #D99736, texto carvão (~7:1), altura 52 px, largura total, raio 12 px, sans bold 16 px caixa alta.
- **Selo de desconto:** terracota #B65B43 + texto off-white (~5,5:1), sans bold 13 px.
- **Selo "+18":** contorno off-white 50%, 11 px. **Selo "use em várias visitas":** fundo musgo #46513A + off-white.
- **Esgotado:** card a 45% de opacidade + selo carvão sobre off-white.
- Âmbar nunca em letra pequena sobre fundo claro.
- **Tipografia:** títulos em serifa (Charter, reserva Georgia); corpo sans do sistema; preços `tabular-nums`; no máximo 2 famílias.
- **Escala:** H1 34/38 · H2 24/28 · nome do produto 18/22 · preço "por" 26 bold · "de" 14 riscado a 60% · corpo 15/22 · legenda 13.
- **Espaçamento:** base 8 px; margem lateral 16; 32 entre seções; 12 entre cards.
- **Marca:** logo oficial (não recriar), fotos reais, sem dourado nem chama decorativa que dispute com a logo. Variar tamanho entre S3 (grande) e S4 (lista).
- **Desempenho:** WebP 600 px com lazy load (menos o hero, < 80 KB); 1 fonte web no máximo; `motion` só na entrada dos cards, no número do lote e no confete do C3.
- **Toque:** área mínima 44 px; botões fixos respeitam `safe-area-inset-bottom`.

## Ordem da página
- **Black:** S2 (fixa no topo) → S1 → S3 → S4 (com chips) → S5 → S6 → S7 → S8 → S9 → S10; barra do carrinho fixa embaixo.
- **Natal:** S2 → S1 → S3 → **S7** → S4 → S5 → S6 → S8 → S9 → S10.

## S1 · Hero
- **Objetivo:** em 3 s dizer o que é (vale pré-pago com desconto, só online) e levar à grade; a 1ª dobra mostra o topo do 1º destaque.
- **Elementos:** logo (110 px, centro) → faixa da fase "BLACK BRASA · 27 a 30/11" ou "VALE DE NATAL · até 24/12" (selo terracota, de `vale_campanha`) → H1 serifa "Mais vale um Ditado na mão." → subtítulo 16 px → âncora "a partir de R$ 64,90" (âmbar 18 bold) → CTA "ESCOLHER MEU VALE" (rola até S3) → linha de confiança "Pix na hora · Vale chega no WhatsApp · 7 dias para desistir" → foto real (chopp e brasa) com película carvão 60%; Zé Ditado pequeno se houver arquivo.
- **Hierarquia:** H1 > CTA > preço-âncora.
- **Variante `?seg=premio`:** faixa musgo no topo "Você tem um presente esperando no Ditado. Ele vale sem compra." (sem dado pessoal na URL).
- **Mobile:** altura máx. 62vh; sem carrossel nem vídeo automático.

## S2 · Barra de urgência
- Barra fixa no topo, 36 px, terracota, off-white 13 px bold. A barra toda leva à S3. Some quando o carrinho abre.
- **Black (decidido pelo Kadu em 24/11: vantagem só da Black):** "BLACK BRASA · brinde de bolinho de costela acaba em 2d 14h 32m" (relógio até 30/11 23:59). Também: selo "+ BRINDE BLACK" em todos os cards e linha no card "Comprando até 30/11: + Dupla de Bolinho de Costela". No C3, o brinde aparece como item do saldo.
- **Natal:** "Vale de Natal · vendas até 24/12"; nas últimas 72 h vira relógio até 24/12 23:59; no dia 24: "Presente de última hora: chega no WhatsApp na hora".
- **Admin:** `mostrar_contador`, `contador_fim`, limite para mostrar "vendidos" (padrão 50).

## S3 · Destaques
- **Black:** 1. Cartela 5 chopps (R$ 64,90; menor tíquete; chopp é o item mais consumido: 2.871 CPFs / 19.837 un. na amostra da fidelidade, 03/06–23/11) · 2. Kit Boteco (maior economia R$ 67,10 e maior margem R$ 101,83; bolinho de costela é o petisco com mais CPFs, 272) · 3. Vale Ditado 100 (flexível, presente).
- **Natal:** 1. Vale 200 · 2. Cartela 10 · 3. Kit Boteco.
- Fora do destaque: caipirinha (ficha suspeita), Família (menor desconto), Kit Picanha (9 CPFs na amostra).
- **Card:** carrossel horizontal com scroll-snap, card a 84% da largura; foto 4:3, selo "-30%", selo "DESTAQUE" (vira "MAIS PEDIDO" só a partir do 2º dia e só no mais vendido de verdade), nome, composição (2 linhas), "de" riscado, "por" grande, "Restam N de TOTAL", CTA "QUERO ESTE" que vira seletor [− 1 +] (máx. 2 ou o lote) + toast "Adicionado".
- **Hierarquia:** foto > preço "por" > nome > CTA. Config: `destaque_black` / `destaque_natal` (1–3).

## S4 · Grade de produtos
- **Chips-âncora** fixos abaixo da S2 enquanto S4/S5 estão na tela (44 px, rolagem horizontal, destacam a categoria visível). Black: [Chopp] [Petisco + Chopp] [Drinks] [Família] [Crédito]. Natal: + [Presente] no início (leva à S7). **Âncoras, não filtros.**
- **Ordem dos 11 kits:** Cartela 5 → Cartela 10 → Kit Boteco → Abre a Brasa → Kit Passarinho → Tábua & Chopp → Kit Picanha → Assado do Zé → Rolê de Gin → Rodada de Caipirinha → Família.
- **Card em lista (estilo iFood):** foto quadrada 96 px à esquerda (sem foto: inicial em serifa sobre terracota); nome 18, composição 14 (2 linhas), "de" riscado + "por" 22 bold, selo de desconto, "Restam N" (terracota abaixo de 20%), selos "+18" e "use em várias visitas"; botão [+] âmbar 44 px que vira seletor. Toque no card abre bottom sheet com foto grande, composição item a item e regras do produto; CTA "ADICIONAR · R$ X".
- **Títulos dos blocos (H2 serifa 20):** textos do redator.
- **Mobile:** 1 coluna; ≥ 768 px, 2 colunas.

## S5 · Vales de crédito
- Bloco com borda âmbar, 2 cards lado a lado (~165 px no celular): "PAGA R$ 100" (16) → seta → "USA R$ 125" (32 bold âmbar) → chip "+R$ 25 de bônus" → "Restam N" → "QUERO ESTE".
- Linha 13 px: "Vale em qualquer item do cardápio, menos garrafas e outras promoções."

## S6 · Como funciona
- 3 passos empilhados (ícone + número âmbar + 1 linha): Compra com Pix · O código chega na hora e você salva no WhatsApp · Mostra no bar e usa aos poucos, em até 6 meses.
- Link "Já comprei: consultar meu vale" → `/vale/consultar`.

## S7 · Presente de Natal
- Foto real de mesa cheia; H2; 3 argumentos ("Fica no nome de quem ganha" · "Chega no WhatsApp na hora, sem frete" · "Vale 6 meses"); mini-vitrine (Vale 200, Cartela 10, Kit Boteco); CTA "DAR DE PRESENTE" (adiciona e liga "é presente" no C1, `presente=1`).
- Black: compacta (1 linha + CTA, depois da S6). Natal: completa, logo depois da S3.

## S8 · Regras resumidas
- Sempre visível (sem sanfona), 6–8 itens com ícone: validade 6 meses · **chopp só depois das 21h** (negrito) · 10% sobre o valor pago · couvert à parte · não acumula · até 2 por CPF · 18+ com documento · 7 dias para desistir. Link "Regulamento completo" (modal ou página).

## S9 · FAQ
- Sanfona com 8 perguntas, uma aberta por vez, linha 52 px, chevron âmbar. No fim: "Ficou dúvida? Chama no WhatsApp (65) 4141-3655" (`wa.me`).

## S10 · Rodapé
- K M POPULAR BAR LTDA · CNPJ 12.061.357/0001-69 · endereço [PENDENTE] · horário [PENDENTE] · WhatsApp · links Regulamento, Privacidade, Consultar meu vale, Reservar mesa (ditado.org/reserva) · "Beba com moderação. Proibido para menores de 18 anos." · logo pequena + "Onde há fumaça, há fogo."
- 13 px, off-white 70%; 80 px de margem inferior por causa da barra do carrinho.

## Barra do carrinho (global)
- Escondida com carrinho vazio; sobe no 1º item. Fixa embaixo, 64 px, fundo off-white, texto carvão: à esquerda "2 vales · R$ 194,80" + "você economiza R$ 82,70" (13, musgo); à direita botão carvão "CONTINUAR".
- Toque abre gaveta de baixo (até 85% da altura): itens, seletores, remover, total, economia, "IR PARA O PAGAMENTO". Seletor trava no limite/lote com aviso "Máximo 2 por CPF". Desktop: gaveta lateral.

## C1 · Checkout (/vale/checkout)
- Meta: concluir em < 90 s. Uma página só, indicador "1 Dados · 2 Regras · 3 Pagamento", resumo recolhido no topo.
- Campos com label visível, teclado certo e máscara: nome; CPF (`inputmode=numeric`, valida ao sair); nascimento DD/MM/AAAA (sem calendário); celular; e-mail (opcional).
- Menor de 18 com álcool no carrinho: alerta terracota + botão "Remover itens com bebida"; pagamento bloqueado.
- Interruptor "É presente?" abre nome e CPF do presenteado (ligado se veio da S7).
- Bloco de regras (igual S8) com a **data de vencimento exata**; caixas: regulamento (obrigatória), 18+ (obrigatória se houver álcool), "Entendi as regras de uso" (obrigatória). Caixa separada e desmarcada de WhatsApp.
- Pagamento: Pix (selecionado, selo "na hora") ou cartão.
- CTA fixo "PAGAR R$ X COM PIX", desativado dizendo o que falta ("Falta aceitar o regulamento").
- **Medição:** capturar `utm_source`, `utm_campaign` e `seg` e gravar em `vale_pedidos.origem` (campo novo).

## C2 · Pagamento Pix
- Valor grande; **botão principal "COPIAR CÓDIGO PIX"** (vira "Copiado ✓"); passo a passo em 3 linhas; QR recolhido em "Pagar com outro celular / computador" (no desktop, aberto); relógio real da reserva "Seus vales ficam guardados por 29:41"; status com verificação automática → vai sozinho para o C3; botão "Já paguei"; link "Problema? WhatsApp".
- Ao voltar do app do banco (`visibilitychange`), verificar o status na hora.
- Cartão: formulário do gateway em folha de baixo.

## C3 · Sucesso / comprovante (/vale/c/:token)
- Confete leve 1 vez; H1 do redator.
- Card por vale: código monoespaçado 24 px + copiar; QR 180 px; produto; saldo por item ("Chopp 4/6"); "Válido até DD/MM/AAAA"; titular; status.
- CTAs: "SALVAR NO WHATSAPP" (âmbar, largura total) · "Baixar imagem" · (presente) "Enviar para quem vai ganhar" · "RESERVAR MESA" (ditado.org/reserva).
- Bloco "Como usar" (inclui "chopp só depois das 21h"); espaço da v2 "você também tem um presente esperando". Aviso fixo "Guarde este link"; saldo sempre atualizado.

## E1 · Estados de erro
- **Esgotado:** card cinza + "ESGOTADO" (texto do redator), continua visível; botão "Avisar no próximo lote" abre o WhatsApp do bar com texto pronto.
- **Esgotou durante o checkout:** aviso no C1, item removido, total recalculado, sugestão de produto parecido.
- **Reserva expirou (30 min):** "Sua reserva expirou e os vales voltaram para o lote. Ainda restam N." + "Gerar novo Pix" mantendo os dados.
- **Pagamento recusado/erro:** "Não passou. Nada foi cobrado." + "Tentar Pix" / "Tentar outro cartão".
- **Sem conexão:** "Sem internet. Se você já pagou, seu vale está garantido. Abra este link de novo." + link do token.
- **Campanha encerrada (após 24/12):** "O lote de 2026 acabou." + "Consultar meu vale" / "Reservar mesa".
- **Antes de 27/11:** "Abre dia 27/11 à 00h" + WhatsApp.
- **Limite por CPF:** mensagem no C1 com o máximo e o que ainda dá.
- Tom: fundo carvão, ícone neutro, uma ação clara.

## Prova social e escassez
- **Pode:** "Restam N de TOTAL" ao vivo · "Últimos N" abaixo de 20% · "N vales já vendidos" a partir de 50 · "MAIS PEDIDO" a partir do 2º dia com venda real · esgotado visível.
- **Não pode:** "X pessoas vendo agora" · estoque inventado · relógio que reinicia · relógio de fase que não muda preço · "de R$" diferente do preço praticado.
- Conferir na ZIG os "de" dos kits (soma dos itens) antes de publicar.

## Medição
- Funil por produto e por `origem`: ver página → adicionar → checkout → Pix gerado → pago.
- Metas: ≥ 40% dos compradores sumidos há 60+ dias; ≥ R$ 40 de consumo extra por resgate. Reavaliar em 15/01.

## Notas de margem
- Cartela 5 = R$ 12,98 por chopp, acima do "Chopp Promoção" R$ 11,90: vender como "várias visitas, 6 meses", nunca como "o mais barato".
- Destacar o Kit Boteco puxa para a maior margem.

## Adendo 24/11: fases
- Black (27 a 30/11): sem nenhuma menção a Natal; S7 vira 'Dá de presente' genérico; relógio do brinde até 30/11 23:59.
- Natal (a partir de 01/12): faixa terracota no topo com o texto do adendo (2) de copy-pagina.md; S7 completa logo após a S3; sem selo de brinde.

