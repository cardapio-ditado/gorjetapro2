# Fluxo Completo do Módulo de Produção

## Visão Geral

O módulo de produção gerencia todo o ciclo de vida da produção de itens desde o planejamento até a conclusão, incluindo:
- Verificação de disponibilidade de insumos
- Reserva de insumos
- Controle de status (planejado → em_andamento → concluído)
- Baixa automática de insumos do estoque
- Entrada automática do produto final no estoque

## Fluxo de Produção - Passo a Passo

### 1. Planejamento da Produção

**Ação do Usuário:**
- Clica em "Nova Produção"
- Seleciona a Ficha Técnica
- Define a quantidade a produzir
- Define a data da produção
- Seleciona o responsável
- **IMPORTANTE:** Seleciona o Estoque de Destino (onde o produto final será armazenado)
- Adiciona observações (opcional)

**Sistema:**
- Ao clicar em "Verificar Insumos e Criar":
  1. Busca o estoque de produção (tipo='producao')
  2. Verifica disponibilidade de todos os insumos necessários
  3. Calcula quantidade necessária = quantidade_ficha × quantidade_producao
  4. Compara com saldo disponível no estoque de produção
  5. Apresenta resultado ao usuário

**Modal de Verificação:**
- ✅ Verde: Todos os insumos disponíveis
- ❌ Vermelho: Insumos insuficientes
- Lista detalhada: Item, Necessário, Disponível, Estoque

**Confirmação:**
- Se disponível, usuário confirma
- Sistema cria registro na tabela `producoes` com status='planejado'
- Sistema gera código de lote único (LOTE-YYMMDD-0001)
- Sistema cria reservas na tabela `producao_reserva_insumos`
- Reservas impedem que outros processos usem esses insumos

### 2. Iniciando a Produção

**Ação do Usuário:**
- Clica no botão "Play" (Iniciar) na linha da produção

**Sistema:**
- Atualiza status para 'em_andamento'
- Registra hora_inicio
- Registra usuario_inicio
- Cria registro no histórico de status

**Importante:**
- Insumos continuam reservados
- Nenhuma baixa de estoque acontece neste momento
- Produção pode ser pausada se necessário

### 3. Concluindo a Produção

**Ação do Usuário:**
- Clica no botão "Check" (Concluir) na linha da produção
- Abre modal de conclusão
- Informa:
  - Quantidade Produzida (total produzido, incluindo rejeições)
  - Quantidade Aprovada (quantidade que passou no controle de qualidade)
  - Observações (opcional)

**Cálculos Automáticos:**
- Quantidade Rejeitada = Produzida - Aprovada
- Percentual Desperdício = (Rejeitada / Produzida) × 100

**Sistema Executa (em ordem):**

#### 3.1. Atualização da Produção
- Atualiza status para 'concluido'
- Registra hora_fim
- Registra usuario_conclusao
- Salva quantidade_produzida
- Salva quantidade_aprovada
- Calcula quantidade_rejeitada
- Calcula percentual_desperdicio
- Registra observações

#### 3.2. Registro no Histórico
- Cria registro em `producao_historico_status`
- Status: em_andamento → concluido
- Observação: "Produção concluída com sucesso"

#### 3.3. Baixa dos Insumos Utilizados
Para cada reserva com status='reservado':
- Busca saldo atual no estoque de produção
- Subtrai quantidade_reservada do saldo
- Atualiza saldo em `saldos_estoque`
- Cria movimentação de SAÍDA em `movimentacoes_estoque`
- Atualiza reserva para status='utilizado'
- Registra data_utilizacao

#### 3.4. Entrada do Produto Final
- Busca nome da ficha técnica
- Procura item correspondente em `itens_estoque` (pelo nome da ficha)
- Verifica se já existe saldo no estoque de destino
- Se existe: adiciona quantidade_aprovada ao saldo existente
- Se não existe: cria novo registro de saldo
- Cria movimentação de ENTRADA em `movimentacoes_estoque`
- Motivo: "Produção concluída - Lote XXXX"

## Tabelas Utilizadas

### producoes
Tabela principal com todos os dados da produção:
- id, ficha_id, quantidade, data_producao
- status (planejado, em_andamento, concluido, cancelado)
- lote_producao (gerado automaticamente)
- hora_inicio, hora_fim, tempo_producao_minutos
- quantidade_produzida, quantidade_aprovada, quantidade_rejeitada
- percentual_desperdicio
- estoque_destino_id (onde produto final será armazenado)
- usuario_inicio, usuario_conclusao
- responsavel, observacoes

### producao_reserva_insumos
Reservas de insumos para a produção:
- producao_id, item_id, quantidade_reservada
- estoque_origem_id (sempre o estoque de produção)
- status_reserva (reservado, utilizado, cancelado)
- data_reserva, data_utilizacao

### producao_historico_status
Histórico de todas as mudanças de status:
- producao_id, status_anterior, status_novo
- usuario_id, data_mudanca, observacoes

### producao_controle_qualidade
Registros de inspeção de qualidade:
- producao_id, data_inspecao, inspetor_id
- status_qualidade (aprovado, rejeitado)
- quantidade_aprovada, quantidade_rejeitada
- motivo_rejeicao, acoes_corretivas

### producao_consumo_insumos
Registro de consumo real vs planejado:
- producao_id, item_id
- quantidade_planejada, quantidade_real
- variacao, percentual_variacao
- custo_unitario, custo_total

## Views

### vw_producao_completa
View que consolida informações de produção:
- Dados da produção
- Nome da ficha técnica
- Nome do estoque de destino
- Estatísticas agregadas

## Regras de Negócio

### Estoque de Produção
- DEVE existir um estoque com tipo='producao'
- Todos os insumos são verificados e retirados deste estoque
- Se não houver insumos suficientes, produção não pode ser criada

### Estoque de Destino
- DEVE ser selecionado ao criar a produção
- É o estoque onde o produto final será armazenado
- Não pode ser do tipo 'producao'

### Produto Final
- DEVE existir um item em `itens_estoque` com o mesmo nome da ficha técnica
- Se não existir, produção será concluída mas produto não terá entrada no estoque
- Sistema emite warning no console

### Reservas
- Criadas no planejamento
- Impedem uso dos insumos por outros processos
- Permanecem até a conclusão ou cancelamento
- Status: reservado → utilizado (na conclusão)

### Quantidade Aprovada
- Só a quantidade aprovada vai para o estoque de destino
- Quantidade rejeitada é registrada mas não gera entrada
- Percentual alto de desperdício (>10%) gera alerta

## Erros Comuns e Soluções

### "Estoque de produção não encontrado"
**Solução:** Criar um estoque com tipo='producao' ativo

### "Produto final não encontrado"
**Solução:** Criar item em `itens_estoque` com mesmo nome da ficha técnica

### "Insumos insuficientes"
**Solução:**
- Dar entrada nos insumos no estoque de produção
- Ou transferir do estoque central para o de produção
- Ou reduzir quantidade a produzir

### "Nenhum estoque de destino definido"
**Solução:** Editar produção e selecionar estoque de destino

## Exemplo Prático

### Cenário: Produzir 10 unidades de "Pizza Margherita"

1. **Planejamento:**
   - Ficha: Pizza Margherita
   - Quantidade: 10
   - Estoque Destino: Estoque Bar
   - Sistema verifica: precisa 2kg massa, 1kg queijo, 500g tomate
   - Sistema encontra tudo no Estoque Produção
   - Cria reservas
   - Status: planejado

2. **Início:**
   - Chef clica em Iniciar
   - Status: em_andamento
   - Hora início: 14:00

3. **Conclusão:**
   - Chef produz as pizzas
   - Produzida: 10
   - Aprovada: 9 (1 queimou)
   - Status: concluido
   - Hora fim: 15:30
   - Tempo: 90 minutos
   - Desperdício: 10%

4. **Resultado:**
   - Estoque Produção: -2kg massa, -1kg queijo, -500g tomate
   - Estoque Bar: +9 unidades Pizza Margherita
   - Movimentações registradas
   - Histórico completo salvo

## Permissões

Todas as operações exigem usuário autenticado.
Políticas RLS habilitadas para segurança.
