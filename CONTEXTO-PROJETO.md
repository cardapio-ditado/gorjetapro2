# CONTEXTO DO PROJETO — Gestão Ditado / Gorjeta Pro

Documento de handoff para o Claude Code. Resume a arquitetura, os bugs já corrigidos, o que está pendente e as regras invioláveis do sistema.

## 1. O QUE É O SISTEMA

Sistema de gestão para o bar Ditado Popular (Cuiabá-MT). Cobre estoque multi-local, compras, produção com ficha técnica, integração de vendas ZIG (POS), financeiro, RH, fidelidade, músicos/cachês e diário de bordo operacional.

Stack:

* Frontend: React + TypeScript + Vite + TailwindCSS, construído no Bolt.new
* Backend: Supabase (Postgres) — project ref `nzdiojmrukdxavrdazot`
* Domínio de produção: `www.ditado.org`
* Repositório: GitHub `cardapio-ditado/gorjetapro2`
* Edge functions em Deno; agendamentos via `pg_cron` + `pg_net`
* IA embarcada: OpenAI `gpt-4o-mini` nas edge functions `analisar-*` e `processar-diario-bordo`

Fuso: Cuiabá é UTC-4. Dia operacional "vira" às 05:00 (madrugada pertence ao dia anterior). Agendamentos cron em UTC.

## 2. REGRAS INVIOLÁVEIS (nunca quebrar)

1. O front NUNCA escreve em `saldos_estoque`. Todo movimento de estoque é um INSERT em `movimentacoes_estoque`; um trigger (`trg_atualizar_saldos` → `atualizar_saldos_movimentacao`) atualiza o saldo. Escrever saldo direto foi a causa raiz do bug histórico de contagem.
2. Régua única de saldo: a função canônica `fn_saldo_por_movimentacoes(item_id, estoque_id)` é a ÚNICA fonte de verdade para saldo. As funções `recalcular_saldo_item_estoque` e `calcular_saldo_item_estoque` são aliases dela. Nunca reintroduzir cálculo de saldo paralelo.
3. Produção é transacional: concluir produção usa SOMENTE a RPC `processar_producao`. Nunca baixar insumo ou dar entrada de produto direto do front.
4. Validação de UUID antes de gravar: o login master usa id fake `temp-master` (dívida técnica). Antes de gravar `usuario.id` em qualquer coluna UUID (`registrado_por`, `criado_por`, etc.), validar com regex de UUID e enviar `null` se não for válido. Ignorar isso quebra com erro `invalid input syntax for type uuid`.
5. Transição de página só com opacidade: a classe `.page-transition` (em `index.css`) que envolve todas as páginas NÃO pode usar `transform` — transform em ancestral sequestra modais `position:fixed` e os joga para o fim da página. Já corrigido; não regredir.
6. `onAuthStateChange` sem await: o callback do `supabase.auth.onAuthStateChange` NUNCA pode fazer chamadas `await supabase.*` dentro dele — trava a sessão por 5s (deadlock da lock do gotrue). Já corrigido no AuthContext com `setTimeout(0)`; não regredir.

## 3. BUGS JÁ CORRIGIDOS (não reintroduzir)

Estoque / contagem:

* Produção "fantasma": 33 produções concluídas não geravam movimentação (INSERT falhava em colunas inexistentes, erro engolido por try/catch). Corrigido com `processar_producao` + backfill de 89 movimentações + ressync de 172 saldos.
* Três funções de saldo divergentes (73% dos saldos discordavam). Unificadas na régua única.
* Âncora de contagem tratava o AJUSTE (delta) como saldo absoluto. Corrigido.
* Resíduos de ponto flutuante ("contei 5, aparece 4,99"): zeragem de 30/04 semeou 0,001; tolerância da contagem deixava resíduo. Contagem agora é verdade absoluta (sem tolerância); 58 resíduos limpos.
* Itens duplicados por grafia/espaço ("Tiras de frango " vs "TIRAS DE FRANGO "). PENDENTE fundir (ver seção 5).
* Formatação de quantidade: `.toFixed(2)` mostrava "4.99"/"5.00". Helper `formatarQuantidade` (pt-BR, sem zeros à direita) aplicado em ItensEstoque e ContagemContador.

Chopp / ZIG:

* 6 produtos de chopp de evento sem mapeamento (venda não baixava barril). Mapeados na ficha "CHOPP 300ML" (0,35 L/copo). "CHOPP SPATEN" marcado `ignorar_estoque`.

Auth / segurança:

* Login antigo aceitava qualquer senha (só validava `length >= 3`). Migrado para Supabase Auth real (`signInWithPassword`).
* Deadlock de 5s no carregamento (await dentro do onAuthStateChange). Corrigido.
* Carregamento duplo de perfil na inicialização. Corrigido com refs.
* Trigger `on_auth_user_created` legado (gravava na tabela `usuarios` não usada) abortava criação de contas. Removido.
* Convite do Supabase entrava sem definir senha. Corrigido com componente `AuthRecoveryGate` que intercepta `type=invite`/`recovery` → força `/redefinir-senha`.
* `usuarios_sistema.senha_hash` era NOT NULL (relíquia). Agora nullable.
* Perfil não reapontava para conta do Auth recriada. Trigger `handle_novo_usuario_auth` corrigido para reapontar.

Financeiro / CMV:

* CMV preciso implementado: `calcular_cmv(data_inicio, data_fim, faturamento_manual?)` usa fórmula EI + Compras − EF; snapshots diários de valor de estoque (`snapshots_valor_estoque`) via cron às 05:00.

## 4. FUNÇÕES E OBJETOS-CHAVE NO BANCO (já existem, usar, não recriar)

Estoque:

* `fn_saldo_por_movimentacoes(item_id, estoque_id)` — saldo canônico
* `processar_producao(...)` — conclusão de produção transacional
* `processar_contagem_estoque(contagem_id, usuario_id)` — processa contagem sem tolerância
* `fn_sugestao_compra(ciclo_padrao, dias_seguranca, dias_historico)` — sugestão de compra por consumo real, previsão por dia da semana; respeita `fornecedores.ciclo_compra_dias`
* `vw_conciliacao_saldos` — divergências saldo tela vs histórico (meta: 0 linhas)
* `conciliacao_saldos_log` — auditoria de ressync/zeragem

CMV:

* `calcular_cmv(...)`, `fn_valor_estoque_atual(estoque_id?)`, `registrar_snapshot_valor_estoque(origem)`, tabela `snapshots_valor_estoque`

Diário de Bordo:

* Tabela `diario_bordo` (1 por data+turno), `ocorrencias_setor` (colunas novas: `diario_id`, `funcionario_id`, `gerado_por_ia`)
* Edge function `processar-diario-bordo` — IA estrutura texto em ocorrências por setor + detecta faltas + insights
* Edge function `digest-diario-telegram` — resumo 05:30 Cuiabá para Kadu + Cristiano
* `vw_pendencias_diario`, `fn_contexto_diario_ia()`
* Setores válidos: bar, cozinha, administrativo, salao, relacionamento_clientes, seguranca, manutencao

Auth:

* `fn_perfil_atual()` — perfil do usuário logado (RPC pós-login)
* `auth_pre_cadastro` — pré-cadastro da equipe (email → nível + módulos)
* `handle_novo_usuario_auth()` — trigger que vincula/cria perfil ao criar conta no Auth
* `auth_trigger_log` — erros do trigger (deve estar vazio)

Portal do Gerente:

* `fn_portal_gerente_dia(data)` — resumo do turno (reservas, escala, cachê, totais)
* `fn_portal_fidelidade_busca(termo)` — busca cliente por CPF/telefone + prêmios
* Página `src/pages/PortalGerente.tsx`, rota `/portal-gerente`, item no SidebarModern

## 5. PENDÊNCIAS ABERTAS (a fazer)

Operacional (não-código, do Kadu):

* Desativar usuário compartilhado "Gerente Sistema" (`gerente@ditadopopular.com`) — `ativo=false`
* Reenviar convite da Evelyn (nutrievelynfigueiredo@hotmail.com — verificar spam do Hotmail)
* Contagem geral de reset (estoque foi zerado via `origem_tipo='zeragem'` em 06/07; física ainda não lançada)

Código / faxina técnica:

* Fundir itens_estoque duplicados por nome normalizado + criar unique index (impede duplicata nova)
* Fundir fornecedores duplicados (ex.: "DIEGO MARTIM" vs "DIEGO MARTINS", músicos em tipo 'geral' vs 'musico')
* Aposentar o `temp-master`: criar usuário master real no Auth e remover o id fake e o fallback do AuthContext (elimina a família inteira de bugs de UUID)
* Padronizar o menu (SidebarModern): RH e Financeiro ainda em `?tab=N`; só o estoque migrou para `?area=`
* Módulos duplicados em `modulos_sistema` (português/inglês: estoque/inventory, eventos/events, rh/staff) — unificar e padronizar checagem de permissão
* Código morto: arquivos `.old`/`.bak`, `producaoService.ts` e `producaoServiceCompleto.ts` (só `producaoServiceSimples.ts` é usado), `stockMovements.ts`, `ComprasEstoque.tsx` (2289 linhas, quebrar)
* Tabelas `_arquivo_*` e `_backup_*` (23 tabelas) — restos de migrações antigas, avaliar drop

## 6. SEGURANÇA — RLS (A GRANDE PENDÊNCIA)

Estado atual (scan de segurança do Supabase): 926 achados. Os críticos:

* 94 tabelas SEM RLS (`rls_disabled_in_public`) — 71 são tabelas reais em uso, 23 são `_arquivo/_backup`.
* 299 políticas "sempre verdadeiro" (`rls_policy_always_true`) — RLS ligado mas porta aberta.
* 1 view expondo `auth.users` (`auth_users_exposed`).
* 79 security definer views, 233 funções com search_path mutável.

Tabelas sensíveis SEM proteção (prioridade máxima): `funcionarios`, `documentos_funcionarios`, `rh_disciplinar`, `contas_bancarias`, `contas_pagar`, `contas_receber`, `pagamentos_contas`, `recebimentos_contas`, `pagamentos_gorjeta`, `log_alteracoes_contas`, `historico_estornos_pagamento`, `clientes`, `fidelidade_visitas`, `fidelidade_clientes`, `fidelidade_premios`, `usuarios`, `usuarios_sistema`, `telegram_usuarios_bot`.

Risco atual real: a chave anônima do Supabase está no JS público de `www.ditado.org`. Sem RLS, qualquer pessoa com conhecimento técnico lê folha de pagamento, financeiro e CPF de clientes sem senha. O login novo tranca a porta da frente; o RLS tranca a janela dos fundos.

Plano da Fase 3 (fazer por GRUPOS, testando entre cada um — NÃO ligar tudo de uma vez em produção):

1. Habilitar RLS grupo por grupo, na ordem: RH → Financeiro → Clientes/Fidelidade → Estoque → resto.
2. Política padrão: `authenticated` pode tudo; `anon` bloqueado. Ex.:

```sql
ALTER TABLE funcionarios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth_all" ON funcionarios FOR ALL TO authenticated USING (true) WITH CHECK (true);
```

3. EXCEÇÕES que precisam de acesso anônimo (rotas públicas — não trancar sem política para `anon`): fluxo do QR de requisição (`requisicoes_internas`, `requisicoes_internas_itens`, `itens_estoque`, `estoques`), cardápio/mapa de mesas público, contagem mobile por token, pré-entrevista, DISC público, lista de compras pública.
4. Depois do RLS: revisar as 299 políticas "always true" para escopo real por nível de usuário.
5. Corrigir search_path das funções (`SET search_path = public`) e a view que expõe `auth.users`.

## 7. EQUIPE E PERMISSÕES

8 usuários, uma conta cada (login individual via Supabase Auth):

* Kadu (dono) — master
* Cristiano (gerente geral) — admin
* Beth/Elizabeth (financeiro) — admin
* Claudeano (gerente operação) — admin
* Eunicea (RH) — usuário, módulo rh
* Evelyn (chefe estoque) — usuário, módulos estoque + eventos
* Carol (estoque) — usuário, módulo estoque
* Katia (estoque noturno) — usuário, módulo estoque

Permissões: tabelas `permissoes_usuario` + view `vw_permissoes_usuario`; níveis `master/admin/usuario/visitante` (enum `nivel_usuario_enum`). Master vê tudo. Usuário nasce com visualizar/criar/editar (sem excluir/aprovar).

## 8. COMO TRABALHAR NESTE PROJETO

* Mudanças de banco: migrations idempotentes, com log de auditoria em operações destrutivas. Sempre validar contra o banco vivo (o zip do repo pode estar defasado das edge functions em produção).
* Depois de qualquer DDL, rodar o security advisor do Supabase.
* Arquivos que o front usa e não pode quebrar: `AuthContext.tsx`, `App.tsx`, `SidebarModern.tsx`, `index.css`, `producaoServiceSimples.ts`.
* O sistema nasceu de sprints de IA sem faxina — há muito código morto e feature pela metade enterrada. Ao mexer numa área, verificar se a funcionalidade já existe antes de recriar.
