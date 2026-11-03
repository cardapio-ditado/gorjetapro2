---
name: contagem-estoque
description: Registrar a contagem (auditoria) do Bar e do Estoque Central do Ditado Popular quando o Kadu dita o que tem em cada freezer, prateleira ou depósito. Use sempre que ele começar uma contagem, mandar quantidades por local ("freezer da Pepsi: 24 Guaraná…") ou falar em fileiras, prateleiras, fundo, caixas e fardos.
---

# Contagem de estoque (Bar e Central)

Antes de anotar qualquer coisa, leia as **regras da casa** abaixo. Não pergunte
ao Kadu o que já está aqui (tamanho de fileira, prateleira, caixa, fardo).

## Como o Kadu quer

- Ele dita um **local** por mensagem (freezer, prateleira, depósito). Anote e
  responda curto: o que entrou daquele local e o total de cada item até agora.
- **Não fale em falta, sobra, saldo do sistema ou diferença** enquanto ele
  conta. O cruzamento Bar × Central só sai quando ele disser que terminou os dois.
- Mostre a conta quando converter (ex.: "4 fileiras × 7 + 49 = 77").
- Só pergunte o que não dá para resolver aqui: nome que bate em dois itens, ou
  número que ele não disse e não está nas regras.

## Regras da casa (medidas)

A fonte é `supabase/functions/agente-whatsapp/prompt.ts` (seção "Regras da casa").
Se lá mudar, vale o que estiver lá. Hoje:

- **Freezers do bar, 600 ml:** prateleira cheia = **49** (7 fileiras de **7**).
  Fundo cheio = **56** (7 fileiras de **8**). Fileira na prateleira = 7; fileira no fundo = 8.
- **Fileira de long neck = 9.** No **freezer long neck**, a fileira do **fundo tem 10**.
- **Freezer do Red Bull:** fileira de lata = **8** (contagem de 03/11). Água de coco: o
  Kadu diz quantas por fileira.
- **Fardo de refrigerante lata = 15** (Pepsi, Pepsi Black, Pepsi Twist, Guaraná, Guaraná Zero).
  **Sukita e Soda: fardo de 12.** Tônica vem em caixa de 12 (espelho da De Ville). Água: fardo de 12.
  Se ele disser a quantidade do fardo ("3 fardos, 24 cada"), vale o que ele disse.
- **Caixa** de cerveja (600 ml ou long neck) = 24.
  Caixa de Red Bull = 24. Budweiser às vezes vem em caixa de 6.
- **Garrafa aberta** em fração (meia = 0,5). Item que não tem: 0.
- **Long neck em fardo de 6** na câmara fria ("fardo", "fardinho"): 6 cada, salvo se ele disser outro número.

## Onde fica cada local

- **Bar:** freezers (Pepsi, Red Bull, Original 1/2/3, long neck, freezer 4), garrafas abertas e lacradas do balcão.
- **Câmara fria = Estoque Central** (não é do Bar). Anote na contagem do Central.
- **Chopp Brahma barril** fica no Central, em litros: barril = 50 L, o engatado vai pelo que ele disser.
- **Coca-Cola** não entra na folha do Bar (só no Central).
- Margarina em kg (caixa 12 kg = 12, pote 3 kg = 3, pote 500 g = 0,5).
- Tanqueray por garrafa (1 por garrafa), mesmo o cadastro estando em litro.

## Como o Kadu chama os itens

| Ele diz | Item no sistema |
|---|---|
| Guaraná / Guaraná normal | GUARANÁ LATA |
| Guaraná Zero | GUARANÁ ZERO LATA |
| Pepsi / Pepsi normal | PEPSI LATA |
| Pepsi Black / Twist | PEPSI BLACK LATA / PEPSI TWIST LATA |
| Limoneto | H2O LIMONETO |
| H2O / H2O normal | H20 |
| Suquita | SUKITA LT |
| Tônica / Tônica Zero | TÔNICA ANTARCTICA LT / TÔNICA ZERO LT |
| Soda | SODA ANTARTICA LT |
| Red Bull tradicional / melancia / tropical | RED TRADICIONAL LT / RED MELANCIA LT / RED TROPICAL LT |
| Red Bull zero | RED SUGAR FREE LT |
| Água com gás / sem gás | ÁGUA C/ GAS / ÁGUA S/ GÁS |
| Original / Corona (600) | ORIGINAL 600ML / CORONA 600ML |
| Stella normal (600) | STELLA ARTOIS 600 ML (não é a Pure Gold) |
| Stella Pure Gold / "Puro Gold" | STELLA PURE GOLD 600 ML ou … LONG NECK |
| Stella normal long neck | STELLA ARTOIS LONG NECK |
| Corona Zero | CORONA CERO LONG NECK |
| Skol Beats Sense / GT | SKOL BEATS SENSES LONG NECK / SKOL BEATS GT LONG NECK |
| Smirnoff Ice | ICE SMIRNOFF LONG NECK |
| Stella 600 (sem dizer qual) | STELLA ARTOIS 600 ML |
| La Linda | LA LINDA MALBEC |
| DV Catena | DV. CATENA MALBEC MALBEC GF |
| Nuances | NUACES  CABERNET SAUVIGNON GF |
| Naturelli | NATURELLE TINTO SUABE 750 ML |
| Pérgola tinto seco 1 L / suave 750 ml | PERGOLA SECO 1 L / PERGOLA SUAVE 750  ML GF |
| Pérgola **aberta** (seco ou suave) | sempre a de **1 L**: PERGOLA SECO 1 L / PERGOLA SUAVE 1 L |
| Gold / Black / Red / Blue | JOHNNIE WALKER GOLD RESERVE GF / … BLACK LABEL  GF / … RED LABEL GF / … BLUE LABEL GF |
| Velho Barreiro ("Zero Barreiro" no áudio) | Velho barreiro |
| Stock Curaçao / Stock Curaçao Blue | CURACAU TRIPLE SEC / CURACAU BLUE |
| Tequila ouro / prata, José Corvo | JOSÉ CUERVO OURO GF / JOSÉ CUERVO PRATA GF |
| Absolute / Grey Goose / Belvedere | ABSOLUT GF / GREY GOOSE GF / BELVEDERE GF |
| Balena | LICOR BALLENA GF |
| Premissas / Premícias | PRIMICIAS MOSCATEL |
| Xarope sem quantidade ("xarope de cranberry, …") | 1 de cada (avise) |
| "Garrafas abertas" / "letras aberto" | local das garrafas em uso no balcão, anotadas em fração |

Acrescente aqui todo apelido novo confirmado.

## Banco (Supabase `nzdiojmrukdxavrdazot`)

Estoques: Bar `10b3aacf-61b1-4add-91ac-0949d3e7f3a3` · Estoque Central `ea043464-d54e-4f42-8e40-4edddc5b4b51`.

**Abrir a auditoria do Bar** (reaproveita a do dia se já houver aberta):
```sql
select set_config('request.jwt.claims','{"sub":"fc0f2a96-5379-48a4-b525-ec41ed9b25fd","role":"authenticated"}', true);
select fn_contagem_setor_abrir('10b3aacf-61b1-4add-91ac-0949d3e7f3a3', 'auditoria', 'Kadu');
```
A contagem aberta: `contagens_estoque` com `bloco = '__auditoria'` e `status = 'em_andamento'`.

**Central:** a contagem é por zona = categoria do item (`itens_estoque.categoria`).
`fn_contagem_bloco_abrir(central, categoria, 'Kadu')` abre a zona ou devolve a do dia
(`->>'id'`). Item que não estiver na zona: insira a linha com
`calcular_saldo_item_estoque(item, central)` e anote igual (partes por local).

**Anotar por local**, igual ao agente do WhatsApp: cada linha guarda `partes`
(`{"Freezer Pepsi": 26, "Freezer Original 1": 77}`) e `quantidade_contada` é a soma.
O mesmo item em outro local soma. Para corrigir um local, troque só a parte dele.
```sql
with v(nome, q) as (values ('ORIGINAL 600ML', 77), ('CORONA 600ML', 81)),
l as (select ci.id, coalesce(ci.partes, case when ci.quantidade_contada is not null
                then jsonb_build_object('tela', ci.quantidade_contada) else '{}'::jsonb end)
             || jsonb_build_object('NOME DO LOCAL', v.q) partes
        from v join itens_estoque it on it.nome = v.nome
        join contagens_estoque_itens ci on ci.item_estoque_id = it.id and ci.contagem_id = '<CONTAGEM>')
update contagens_estoque_itens ci set partes = l.partes,
  quantidade_contada = (select sum(value::numeric) from jsonb_each_text(l.partes)),
  quantidade_sistema = calcular_saldo_item_estoque(ci.item_estoque_id, '<ESTOQUE>'),
  contado_em = now(),
  observacao = (select string_agg(key || ': ' || fn_fmt_qtd(value::numeric), ' · ' order by key) from jsonb_each_text(l.partes))
from l where ci.id = l.id;
```
`jsonb_build_object('LOCAL', q)` com `||` **substitui** a parte daquele local: para
somar dentro do mesmo local, some antes. Confira que todos os nomes foram
achados (nome que não casar não grava nada).

**Não conclua** a contagem sem o "pode" do Kadu. O relatório final segue a skill
`relatorio-contagem`.
