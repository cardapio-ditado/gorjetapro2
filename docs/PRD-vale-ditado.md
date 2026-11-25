# PRD — Vale Ditado (venda online de vales pré-pagos)
*Versão 1 · 24/11/2026 · Dono: Kadu Mendes · Sistema: Gestão Ditado (`cardapio-ditado/gorjetapro2`, React + TS + Vite + Tailwind, Supabase `nzdiojmrukdxavrdazot`, domínio www.ditado.org)*

## 1. Problema e objetivo
O Ditado Brasa & Bar perdeu movimento e tem ~9 mil clientes (CPF + telefone na fidelidade) que sumiram há 1 a 6 meses. Queremos:
1. **Reativar** esses clientes com uma oferta que só existe online.
2. **Antecipar caixa** vendendo vales pré-pagos (kits e créditos) para consumir no bar.
3. Ter o **embrião do "Clube do Ditado"**: saber quem compra, o que compra e se volta.

Nada de promoção no salão: o desconto só existe comprando pelo link.

**Metas (estimativa):** vender 30–50% do lote (R$ 25–42 mil) entre 27/11 e 24/12; ≥ 40% dos compradores sumidos há 60+ dias; consumo extra ≥ R$ 40 por resgate.

## 2. Campanha
- **Nome:** "Mais vale um Ditado na mão".
- **Fase 1 – Black Brasa:** 27/11 a 30/11/2026. **Fase 2 – Vale de Natal:** 01/12 a 24/12/2026. Mesmos produtos e preços; muda só o texto/banner (configurável no admin).
- **Validade de cada vale:** 6 meses a partir da compra.
- **Uso:** qualquer dia que o bar abre. Produtos com chopp **não valem no happy hour (até 21h)**. Não acumula com outras promoções. Os vales de crédito não pagam outras promoções nem garrafas.
- **Taxa de serviço 10%** calculada sobre o valor pago (não sobre o preço cheio). Couvert artístico à parte.
- **Limite:** 2 unidades de cada produto por CPF (configurável).
- **Vantagem só da Black Brasa (Kadu, 24/11):** todo vale pago até **30/11 às 23:59** ganha de brinde **1 Dupla de Bolinho de Costela** (R$ 18 no cardápio, custo ~R$ 3,70), que entra como item extra no saldo do vale. Pagou a partir de 01/12, não tem brinde. O relógio da S2 conta até 30/11 23:59 e diz "o brinde acaba em…". Custo estimado: ~R$ 1,1 mil a cada 300 vales vendidos na Black. Configurável no admin (`vale_campanha.brinde_descricao`, `brinde_ate`).

## 3. Produtos (seed inicial; tudo editável no admin)
| slug | Produto | Composição | De | Por | Lote | Tipo | Álcool |
|---|---|---|---|---|---|---|---|
| abre-a-brasa | Abre a Brasa | linguiça portuguesa na massa + queijo coalho com mel + pão de alho + 4 chopps | 184,00 | 129,90 | 60 | kit | sim |
| cartela-5 | Cartela 5 chopps | 5 Chopp Brahma 300 ml | 92,50 | 64,90 | 100 | kit | sim |
| cartela-10 | Cartela 10 chopps | 10 Chopp Brahma 300 ml | 185,00 | 129,90 | 50 | kit | sim |
| kit-boteco | Kit Boteco | torresmo de rolo + bolinho de costela 8 un + 6 chopps | 227,00 | 159,90 | 60 | kit | sim |
| kit-passarinho | Kit Passarinho | frango a passarinho + fritas 500 g + 4 chopps | 168,00 | 119,90 | 50 | kit | sim |
| kit-picanha | Kit Picanha | picanha acebolada 400 g + 4 chopps | 193,00 | 139,90 | 40 | kit | sim |
| tabua-chopp | Tábua & Chopp | tábua de frios Ditado + 4 chopps | 203,90 | 149,90 | 40 | kit | sim |
| assado-do-ze | Assado do Zé | coxa e sobrecoxa desossada na brasa (2 pessoas) + 4 chopps | 163,00 | 119,90 | 30 | kit | sim |
| role-de-gin | Rolê de Gin | 4 gin tônica | 116,00 | 79,90 | 50 | kit | sim |
| rodada-caipirinha | Rodada de Caipirinha | 4 caipirinhas 500 ml | 151,60 | 99,90 | 40 | kit | sim |
| familia | Família no Ditado | picanha na chapa com cascata de queijo + 4 refrigerantes | 196,00 | 159,90 | 30 | kit | não |
| vale-100 | Vale Ditado 100 | paga R$ 100, consome R$ 125 | 125,00 | 100,00 | 100 | credito | não* |
| vale-200 | Vale Ditado 200 | paga R$ 200, consome R$ 250 | 250,00 | 200,00 | 50 | credito | não* |

*Crédito pode ser usado em bebida alcoólica: a conferência de idade acontece no resgate.
Teto se esgotar tudo: 700 vales ≈ R$ 84,3 mil.

**Kit = itens com quantidade** (ex.: Kit Boteco = 1 torresmo, 1 bolinho, 6 chopps). Cada item tem saldo próprio e pode ser resgatado em visitas diferentes. **Crédito = saldo em R$** (125 ou 250), abatido por valor.

## 4. Experiência do cliente (público, sem login)
### 4.1 Página `/vale` (mobile-first)
- Hero com a marca (Zé Ditado, "Mais vale um Ditado na mão", fase atual: Black Brasa ou Natal), contagem regressiva até o fim da fase.
- Grade de cards dos produtos: foto real (upload no admin; sem foto → card tipográfico), nome, composição, "de R$ X por R$ Y", % de desconto, **"restam N"** (lote ao vivo) e selo "Esgotado". Cartelas com o selo "use em várias visitas".
- Carrinho lateral (drawer) com quantidade e total; respeita limite por CPF e estoque do lote.
- Bloco "Como funciona" (3 passos: compra → recebe o código → mostra no bar) e FAQ curto.
- Rodapé: razão social K M POPULAR BAR LTDA, CNPJ 12.061.357/0001-69, endereço, canal de atendimento, link do regulamento.
- Aviso curto: "Beba com moderação. Proibido para menores de 18 anos."

### 4.2 Checkout `/vale/checkout`
- Campos: nome completo, CPF (validação de dígito), data de nascimento, celular (WhatsApp), e-mail (opcional).
- **Menor de 18 anos:** bloquear produtos com álcool (mensagem clara) — pode comprar só os sem álcool.
- Opção "é presente": nome + CPF de quem vai usar (o vale fica nominal ao presenteado).
- **Resumo das regras antes de pagar** (validade com data exata, happy hour, 10%, couvert, não acumula, arrependimento de 7 dias) com 3 caixas obrigatórias: li o regulamento · sou maior de 18 (se houver álcool) · entendi as regras de uso.
- **Caixa separada e desmarcada:** "Quero receber novidades do Ditado pelo WhatsApp" (LGPD).
- Pagamento: **Pix (principal)** com QR code + copia-e-cola na própria página e polling de status; **cartão de crédito** como alternativa.
- Reserva do lote por 30 min enquanto o pagamento está pendente; expirou → devolve ao lote.

### 4.3 Sucesso / comprovante `/vale/c/:token`
- Mostra cada vale com **código único** (ex.: `DIT-7K3P-Q9XA`) + **QR code**, saldo por item, validade, regras resumidas.
- Botões: "Salvar no WhatsApp" (link `wa.me` com o texto e o link do comprovante), "Baixar PDF/imagem" (jspdf/html2canvas já estão no projeto).
- O link do comprovante é permanente e mostra o saldo atualizado (o cliente acompanha o que já usou).
- E-mail de confirmação se informado (pode ser v1.1).

### 4.4 Consulta `/vale/consultar`
- Cliente digita o código + os 3 primeiros dígitos do CPF → vê saldo e validade. Sem expor dados pessoais.

## 5. Experiência da casa (interno, com login e permissão)
### 5.1 Resgate `/vales/resgate` (tablet do caixa/hostess)
- Ler QR pela câmera ou digitar o código.
- Mostra: nome do titular (primeiro nome + sobrenome abreviado), produto, saldo por item, validade, alerta se vencido, alerta **"tem álcool: conferir documento com foto"** (checkbox obrigatório para baixar item com álcool) e alerta se o horário for antes das 21h em produto com chopp.
- Dar baixa parcial: escolher itens e quantidades (ou valor em R$ para crédito); confirma → grava resgate com usuário, data/hora e mesa/comanda ZIG (campo texto).
- Mostra o que lançar na ZIG: o caixa lança o item no botão "VALE PRÉ-PAGO" correspondente e fecha com a forma de pagamento "Voucher pré-pago" (configuração da ZIG fora do escopo do código).
- Impede baixa dupla (transação/lock no banco).

### 5.2 Admin `/vales` (gerente/Kadu)
- CRUD de produtos (preço de/por, composição em itens, lote, limite por CPF, foto, ativo, ordem, flag álcool, tipo kit/crédito).
- Configuração da campanha: fase atual, textos do hero, datas de início/fim da venda, validade em meses, horário do happy hour.
- Lista de pedidos (filtros: status, produto, data) e de vales (emitido, parcial, resgatado, vencido, estornado).
- **Dashboard:** vendidos por produto, receita, lote restante, % resgatado, passivo em aberto (R$ ainda a entregar), compradores novos x recorrentes (cruzando CPF com `fidelidade_clientes.ultima_visita`), consumo extra por resgate (v1.1, cruzando com ZIG).
- Estorno/arrependimento: botão "Reembolsar" (só se o vale não foi usado ou dentro de 7 dias; parcial proporcional) que chama o estorno do gateway e marca o vale como estornado.
- Exportar CSV (sem CPF completo).

## 6. Pagamento
- **Gateway:** Asaas (recomendado: Pix R$ 1,08–2,15 por cobrança, cartão, API + webhook simples) ou Mercado Pago (Pix 0,99%). Implementar com uma camada `paymentProvider` para trocar de provedor sem reescrever.
- **Conta OBRIGATORIAMENTE no CNPJ da K M POPULAR BAR LTDA (12.061.357/0001-69).** Nunca na conta da CEM/Stone.
- Chaves só em **Supabase secrets** (edge functions). Nada de chave no front. Começar em **sandbox**.
- Fluxo: edge function cria cobrança → front mostra Pix/cartão → **webhook** do gateway (validar assinatura/token) confirma → gera os códigos → comprovante. Webhook idempotente (guardar `evento_id`).
- **Nota fiscal (NFC-e):** decisão pendente do contador (na venda ou no resgate). Deixar campos `nfce_status` e `nfce_chave` no pedido e não emitir nada automático na v1.

## 7. Modelo de dados (Supabase, schema `public`, prefixo `vale_`)
- `vale_campanha` (id, fase, titulo, subtitulo, inicio_venda, fim_venda, validade_meses, happy_hour_fim, brinde_descricao, brinde_ate, ativo) — o webhook adiciona o item do brinde ao `vale_codigo_saldos` quando `pago_em <= brinde_ate`
- `vale_produtos` (id, slug, nome, composicao_texto, preco_de, preco_por, tipo kit|credito, credito_valor, tem_alcool, lote_total, lote_vendido, limite_por_cpf, foto_url, ordem, ativo)
- `vale_produto_itens` (id, produto_id, descricao, quantidade, tem_alcool) — itens do kit
- `vale_pedidos` (id, token_publico, nome, cpf, data_nascimento, telefone, email, aceita_whatsapp, aceite_regulamento_em, valor_total, status pendente|pago|expirado|cancelado|estornado, gateway, gateway_cobranca_id, pago_em, reserva_expira_em, nfce_status, nfce_chave, criado_em)
- `vale_pedidos.origem` (text: utm_source / utm_campaign / seg) e `vale_produtos.destaque_black`, `destaque_natal`, `categoria`; `vale_campanha.mostrar_contador`, `contador_fim` (ver layout-pagina.md)
- `vale_pedido_itens` (id, pedido_id, produto_id, quantidade, preco_unit)
- `vale_codigos` (id, codigo único, pedido_id, produto_id, titular_nome, titular_cpf, validade, status ativo|parcial|resgatado|vencido|estornado, saldo_credito, criado_em)
- `vale_codigo_saldos` (id, codigo_id, item_id, quantidade_total, quantidade_usada) — saldo por item do kit
- `vale_resgates` (id, codigo_id, item_id ou valor, quantidade, usuario_id, comanda_zig, documento_conferido, criado_em)
- `vale_webhook_eventos` (id, gateway, evento_id único, payload jsonb, processado_em)

**RLS:** anônimo só lê `vale_campanha` e `vale_produtos` ativos. Toda escrita pública passa por edge function com service role. Comprovante acessado por `token_publico` aleatório (não sequencial). Resgate e admin só para usuários autenticados com permissão.
**Concorrência:** decremento de lote e baixa de resgate via RPC transacional (`SELECT ... FOR UPDATE`), nunca do front.
**CPF:** guardar completo só no banco; na tela mostrar mascarado.

## 8. Edge functions (Deno)
- `vale-criar-pedido` — valida dados, idade, limite por CPF, estoque; reserva lote; cria cobrança no gateway; devolve QR Pix/checkout.
- `vale-webhook` — valida assinatura, idempotência, marca pago, gera códigos e saldos.
- `vale-status` — polling do status do pedido pelo token.
- `vale-expirar-reservas` — cron a cada 5 min (pg_cron), libera lote de pedidos pendentes vencidos.
- `vale-estornar` — admin; chama estorno do gateway.
- `vale-resgatar` — autenticado; baixa transacional.

## 9. Visual
- **Moderno, mobile-first, rápido** (Lighthouse ≥ 90 em mobile). Tailwind + `motion` (já no projeto) para micro-animações discretas (cards entrando, contador do lote, confete leve no sucesso).
- Paleta da marca: carvão `#1A1A1A` (fundo), off-white `#F5EFE6` (texto/cards), âmbar `#D99736` (destaque/CTA), terracota `#B65B43` (selos de desconto). Títulos em serifa (Georgia ou equivalente), texto em sans.
- Clima "brasa": fundo escuro com textura sutil de fumaça/brasa, cards com borda âmbar fina, preço "por" grande, "de" riscado.
- Logo oficial do Ditado (arquivo existente; não recriar). Fotos reais dos pratos (nunca imagem gerada por IA para comida).
- Acessibilidade: contraste AA, botões ≥ 44 px, labels em todos os campos.

## 10. Fora do escopo da v1
Emissão automática de NFC-e; integração automática com a ZIG; disparo de WhatsApp em massa; assinatura recorrente do "Clube"; resgate dos prêmios da fidelidade (v2: mostrar no comprovante "você também tem um presente esperando").

## 11. Critérios de aceite
1. Compra com Pix em sandbox gera código + QR e comprovante em < 10 s após o webhook.
2. Lote nunca fica negativo com 20 compras simultâneas no último item.
3. Menor de 18 não consegue comprar produto com álcool.
4. Resgate parcial de um Kit Boteco em 2 visitas mostra saldo certo no comprovante do cliente.
5. Webhook repetido não gera código duplicado.
6. Nenhuma chave de gateway aparece no bundle do front.
7. Página `/vale` abre em < 2 s no 4G e passa no Lighthouse mobile ≥ 90.
8. Admin consegue trocar a fase (Black Brasa → Natal) sem deploy.

## 12. Pendências do Kadu (antes de ir para produção)
- Abrir conta no gateway no CNPJ da K M e gerar chaves.
- Contador: NFC-e na venda ou no resgate.
- Advogado: revisar o regulamento (`textos.md`).
- Endereço, e-mail de atendimento e horário para o rodapé.
- Fotos reais dos 13 produtos.
- Criar na ZIG o botão "VALE PRÉ-PAGO" e a forma de pagamento "Voucher pré-pago".

## 13. Fases (Kadu, 24/11)
- A página nasce só como **Black Brasa** (27 a 30/11). Nenhum texto menciona Natal durante a Black.
- Em 01/12 o admin troca a fase para **Vale de Natal**, com a faixa do adendo (2) de copy-pagina.md ("Por causa do sucesso da Black Brasa...", só se a Black vendeu de verdade; senão, texto neutro). Sem brinde. Vendas até 24/12.

