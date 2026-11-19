# Gorjeta Pro — Estoque Beta 2
## Especificação inicial de arquitetura e operação | 22/09/2026

**Status:** proposta técnica para implementação por fases; ainda não implantada.  
**Princípio:** estoque antigo continua operando; Beta 2 não escreve em tabelas oficiais até migração homologada.  
**Fonte operacional:** entrevista com Kadu sobre a operação do Ditado Popular.  
**Fonte técnica:** leitura de código GitHub e consultas SELECT ao Supabase `gestao ditado`; os valores apresentados são retratos de consulta, não medições físicas.

## 0. Segurança de implantação — bloqueadores

1. O Beta anterior **não é sandbox**: `fn_beta_montagem_concluir`, `fn_beta_central_concluir`, `fn_beta_pedir_mais`, `fn_beta_transferir` e `fn_beta_receber_concluir` escrevem na estrutura oficial (`movimentacoes_estoque`, `entradas_compras` e correlatas). Não reutilizar essas RPCs no Beta 2.
2. Proibir qualquer trigger ou endpoint Beta 2 capaz de alterar `saldos_estoque`, `movimentacoes_estoque`, `contagens_estoque`, `entradas_compras`, `itens_entrada_compra`, `producoes`, dados Zig ou financeiro durante o piloto.
3. Versionar e proteger um snapshot inicial de itens, saldos e eventos (somente IDs, quantidades e dados necessários). Testes são simulados ou gravados exclusivamente em tabelas `beta2_*`. `beta2_*` devem ter políticas RLS específicas; usuário autenticado com perfil apropriado; NÃO conceder EXECUTE indiscriminado a `anon` em RPCs mutadoras.
4. Backup verificável e plano de rollback antes de qualquer migração. Nenhum `UPDATE/DELETE/TRUNCATE` ou recálculo em massa na base oficial durante investigação.

## 1. Fatos da operação (confirmados pelo proprietário)

- Estoquista diurno 08–17h (sábado 08–13h); comprador continua comprando, inclusive domingo; estoque noturno será eliminado após teste de cobertura.
- Bar 17–01h dom–qui, sexta 17–02h30, sábado 11h30–02h30; reposições hoje são avulsas, sem aceite digital; fins de semana com menor controle.
- Henrian responde pelos dois bares, João Vitor pela cozinha, Cristiano é gestor diurno e aprovador de divergências; gerente e subgerente noturnos cuidam de exceções, funcionários designados podem confirmar recebimento pelo celular.
- Estoque seco comporta o volume atual e tem posições habituais e espaço para separar entregas.
- Câmara central: ~8m resfriamento e ~4m congelamento; grade, se trancada, também bloqueia congelamento. Barris conectados na central servem 4 torneiras, barris 50L. Congelado contém carne, gelo ensacado próprio e bolinhos prontos; central resfriada recebe carne em descongelamento.
- Câmara da cozinha tem pouco espaço, central longe; manter cozinha como estoque operacional, sem usar central como extensão de cozinha no expediente.
- Dois bares com produtos de consumo próprios, mas cadastro atual tem somente um estoque administrativo `Bar`; confirmação de origem por terminal Zig ainda não demonstrada.
- Compra diária sob restrição de capital de giro; chopp pedido para entrega no dia seguinte, cerveja/chopp precisam de reserva fria; chopp faltante às vezes é emprestado de vizinhos.
- Segunda–quinta rodízio ~18–22h, ~40 petiscos, passadores, tradicional e premium; Zig registra modalidade e copos promocionais com preço zero. Produções e descarte não são registrados de forma consistente.
- Reserva de papel/químicos pode ficar na antiga sala do caixa, separando químicos de itens de contato com alimentos; limpeza diurna/noturna compartilha armário de uso; apenas 1 reposição programada diária; armários externos consolidam utensílios de sábado; Clube do Whisky = bens de terceiros.

## 2. Estrutura física x escrituração

**Estoque administrativo inicial (não alterar ainda):**
- `Estoque Central`
- `Bar`
- `Cozinha`
- `Estoque PRODUCAO` (sem definir seu destino até verificar integração de fichas/produção)

**Endereços físicos propostos (`beta2_locations`):**
- Central/seco; central/resfriado/barris-cheios; central/resfriado/barris-conectados; central/resfriado/vasilhames; central/resfriado/hortifrúti; central/resfriado/descongelamento; central/congelado/carnes; central/congelado/bolinhos; central/congelado/gelo.
- Bar/drinks/abertos; bar/drinks/fechados; bar/cervejas/freezers; caixas térmicas de gelo — localização indicativa, sem inventário individual de cada pá.
- Cozinha/resfriado; cozinha/congelado; cozinha/seco.
- Sala de consumo interno/reserva papéis; compartimento segregado químicos; armário de limpeza compartilhado/kit; armários externos/utensílios; Clube do Whisky separado como custódia de terceiros.

**Regra:** mudança de endereço no MESMO estoque administrativo não gera venda, perda nem transferência entre estoques; pode gerar evento de movimentação física auditável. Não dividir administrativamente Drinks/Cervejas antes de comprovar identificação da origem das vendas Zig e benefício real de saldo separado.

## 3. Fonte da verdade e contrato de evento Beta 2

Usar ledger append-only `beta2_events` com:
- `id` UUID, `event_type` (receipt | transfer_out | transfer_in | internal_consumption | production_input | production_output | sale | waste | count_adjustment | location_move | loan_in | loan_out | keg_connect | keg_disconnect), `item_id`, `quantity_base` > 0, `uom_base`, `from_stock_id`, `to_stock_id`, `from_location_id`, `to_location_id`, `effective_at` timestamptz (fato físico), `recorded_at` timestamptz (registro), `actor_user_id`, `authorized_by`, `source_system`, `source_document_type`, `source_document_id`, `source_line_id`, `idempotency_key`, `reason_code`, `cost_snapshot`, `metadata`.
- Impor `UNIQUE(idempotency_key)` para eventos externos/reprocessáveis e unicidade `(source_system, source_document_type, source_document_id, source_line_id, event_type)` quando aplicável.
- Nunca atualizar histórico para corrigir: lançar evento compensatório com referência ao evento original.
- Saldos Beta 2 consolidados são derivados do ledger e reconciliados diariamente; transações atômicas, lock/concorrência por `(item_id,stock_id)`.
- Snapshot oficial só leitura, com data de corte documentada. Conciliar compras retroativas, vendas Zig processadas depois da contagem e transferências abertas por `effective_at` e `recorded_at`; contagem deve ter `counted_at`, `expected_at_count`, `movement_after_count`, `expected_at_approval`.
- Distinção indispensável: saldo físico, reservado, disponível, pendente de transferência e sob custódia de terceiros.
- Tipos de material: mercadoria à venda, ingrediente, preparação, consumo interno, utensílio/patrimonial, terceiros, vasilhame/retornável. Campo `entra_no_cmv` existente deve ser auditado semanticamente e não determinar sozinho saída física.

## 4. Contratos das telas e rotinas

### Central "O que fazer hoje"
08h: ocorrências noturnas/recebimentos pendentes → contagem cíclica programada → lista de reposições do dia → lista de compra com prioridades e custo estimado → expedição e aceite → 17h prontidão dos setores. Sábado: prontidão feijoada antes 11h30; sexta reserva planejada para sábado e domingo. Não pressupor recebimento integral até as 17h.

### Abastecimento por estoque/kit
- `target_level` por item/setor/dia de semana/evento: previsão de demanda até PRÓXIMO abastecimento + prazo de resfriamento/reposição + segurança; teto limitado pelo caixa. Gerar `suggested = max(0,target - on_hand - in_transit_confirmed)` com arredondamento de embalagem e sugestão de substituto explicitamente aprovada.
- Separar pedido → separação → entregue → recebido (aceite digital com usuário, horário e divergência). Rejeição/parcial não pode fazer sumir diferença.
- Para materiais de consumo: kit = conjunto de padrões de reposição, não SKU fictício; químicos fisicamente segregados de papéis/contato alimentar. Reserva significativa do armário deve continuar inventariável; consumíveis distribuídos para uso podem virar `internal_consumption` sem mini-inventários por dispenser.
- Noturno: movimentação emergencial pelo gerente/subgerente ou responsável autorizado, sem permissão de alterar saldos diretamente; estoquista concilia amanhã. Câmara fria não pode ficar inacessível à cozinha.

### Contagem
- Cega quando viável; contagem por zona/risco ABC; responsável físico + contado em + recontagem por valor/percentual; fila de diferenças para Cristiano; ajuste exige `reason_code`, evidência da recontagem e aprovação, não mistura com consumo interno.
- Vendas/entradas/transferências após contagem preservadas; nunca `set saldo = contado` na aprovação posterior sem recálculo temporal.
- Evidenciar "quantidade teórica atual", "física no momento", "movimentações posteriores" e "diferença validada".

### Cozinha/rodízio
- Preparação transforma insumos em lotes de produto acabado com rendimento e custo; baixa por venda deve consumir produto preparado, não seus ingredientes novamente; registro simplificado por lote.
- Rodízio: produção por lote, estoque pronto inicial/final, sobras aproveitáveis e descartes. Custo atribuível ao rodízio por período deve excluir à la carte; se não existir dado de saída precisa, chamar de estimativa, não CMV exato por pessoa.
- Chopp premium: lançamento promocional de 0 reais gera baixa se mapeado e servido; pacote OPEN DE CHOPP não pode gerar segunda baixa. Distinguir 300ml nominal × ficha 350ml (50ml de perda presumida): validar regra com operação antes de alterá-la.

### Barris, gelo, empréstimos
- Barris cheios lacrados, conectados, vazios (vasilhames em custódia); conexão/troca rápida por torneira e responsável, sem supor volume residual = 0 em retirada antecipada.
- Gelo das duas máquinas é produção própria, não compra; registrar ensacamento de reserva quando necessário, sem baixa por pá.
- Empréstimo de barril vizinho requer entrada documentada e passivo de devolução; devolução ou pagamento separado da venda.
- Coletor de perda de chopp só é medição se não misturar água de limpeza; nunca inferir perda total de líquido misturado.

## 5. Reconciliações e achados que bloqueiam homologação

Retrato da consulta 22/09/2026:
- 661 itens cadastrados, 600 ativos; 4 estoques administrativos, 24.215 movimentações.
- 61 linhas de saldo negativo: 42 no Bar, 19 na Cozinha. Negativos não são prova de perda; investigar pelo histórico antes de corrigir. Exemplos: Stella Pure Gold 600 ml Bar -327, Original 600 ml Bar -280.
- 7.066 movimentações com `origem_tipo='zig'`, das quais 6.016 sem `idempotency_key`; não presumir duplicidade: cruzar tabela auxiliar e versões antigas.
- Logs da sincronização Zig são agregados; `status='sucesso'` não implica cobertura de 100% do que deveria baixar. O sistema tem outras Edge Functions de importação; auditar se executam simultaneamente.
- `CHOPP PROMOCIONAL RODIZIO` mapeia a ficha `CHOPP 300ML` consumindo 0,35 L do `CHOPP BRAHMA BARRIL` no Central. `OPEN DE CHOPP` aparece marcado para ignorar estoque; validar comportamento para evitar dupla baixa.
- `fn_beta_montagem_concluir` e `fn_beta_central_concluir`: ajustam saldos reais pelo saldo de conclusão vs contagem anterior; risco de anular movimento ocorrido entre contagem e conclusão. Não copiar.
- `processar_contagem_estoque`: gera ajuste antes de etapa obrigatória de aprovação gerencial. Beta 2 deve separar detectar e aprovar.
- Receita/compras: trigger ativo `processar_entrada_compra()` usa chave de idempotência por linha da compra; manter garantia e testar mesmo item repetido.
- Checar RLS e EXECUTE para cada função: o ledger do Beta 2 não herda permissões abertas de tabelas legadas. Não ativar RLS em produção sem política/testes.
- Temperaturas de resfriamento/congelamento ainda sem registro operacional: instituir conferência física agora, independentemente de software.

## 6. Fases de construção

**F0 — Isolamento:** branch separada, migrations apenas `beta2_*`, nenhuma alteração das funções legadas, SQL SELECT para auditoria; ambiente de testes e políticas RLS.

**F1 — Cadastro e espelho:** importação de catálogo em leitura, endereços físicos, unidades/fatores, kits, classes de controle; pendências cadastrais sem alterar oficial.

**F2 — Ledger e simulador:** ingestão de cópias de compras, transferências, vendas Zig, produção, contagens e consumo; filtros de duplicidade, ordem temporal, snapshot e reconciliação por SKU.

**F3 — UX operacional:** montagem programada, kits, aceite, exceção noturna, inventário cego, fila de aprovação Cristiano, fluxo fim de semana.

**F4 — Produção, chopp, compras:** rodízio, preparação, barris, gelo próprio, empréstimos, lista com orçamento e alerta de ruptura.

**F5 — Homologação lado a lado:** pelo menos um ciclo de semanas incluindo sábado e domingo; inventário físico com data de corte, análise de desvios item a item, procedimentos e treinamento Henrian/João Vitor/Cristiano.

**F6 — Cutover reversível:** uma e apenas uma fonte de baixa por venda/compra/transferência; backup, janela controlada, monitoramento, plano de rollback. Não encerrar estoque noturno antes de provar cobertura nas noites de pico.

## 7. Testes obrigatórios, com resultados observáveis

1. Contagem 10 às 16h, venda 2 às 16h30, aprovação às 17h: saldo final 8; nenhum ajuste indevido.
2. Compra com duas linhas iguais do mesmo item: ambas entram exatamente uma vez; reprocessar não altera.
3. Venda Zig repetida/atrasada/cancelada: baixa única, reversão identificável e histórico intacto.
4. Copo promocional Premium a preço 0: baixa pelo item servido; pacote OPEN não duplica; ficha de 300ml/350ml sinalizada para validação.
5. Estoque Central transfere 5, setor confirma 4: central não perde item sem destino identificado; uma unidade fica em divergência investigável.
6. Kit reposição: 5 desejados, 2 restantes, entrega 3; reserva significativa não vira despesa antecipada.
7. Chopp conectado no Central é baixado do Central, sem transferência fictícia ao Bar; retirada parcial exige volume residual.
8. Produto vendido sem ficha/mapeamento: aparece pendente, não classificado como sucesso completo.
9. Balanço temporal: contagem antes da entrada de compra, compra registrada depois; saldo após as duas operações correto.
10. Usuário de bar não consegue ajustar saldo, alterar custos ou lançar compra; Cristiano pode aprovar diferença com trilha de auditoria.
11. Beta 2 não cria uma única linha nas tabelas oficiais ao executar todas as telas do piloto.
12. Estresse de duas requisições simultâneas do mesmo evento: idempotência no banco, sem saldo duplicado.

## 8. Critérios de sucesso

- Nenhum saldo oficial impactado durante o Beta 2.
- Todas as entradas, saídas e transferências com identificador de origem e autor, sem correções silenciosas.
- Pendências Zig expostas por dia e impacto financeiro estimado.
- Explicação auditável das divergências entre contagem e saldo teórico.
- Abastecimento dentro da capacidade física, orçamento e tempo até próximo estoquista.
- Operação do sábado 11h30 e domingo contempladas; temperatura e higiene fora do escopo de software não ficam sem dono.
- Mensagem WhatsApp desejada pelo proprietário é integração futura; não presumir que já existe conector ou envio configurado.

### Critério de mudança deste documento
Atualizar após comprovar estrutura real de vendas por ponto Zig, fontes de baixa ativas (cron/Edge), tratamentos de estoque em produção e validação pelo proprietário dos padrões de kit e chopp. Não ocultar dados ainda não verificados.
