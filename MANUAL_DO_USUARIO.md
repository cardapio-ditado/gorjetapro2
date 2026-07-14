# Manual do Usuário - Sistema Ditado Popular

## Índice

1. [Visão Geral](#visão-geral)
2. [Acesso ao Sistema](#acesso-ao-sistema)
3. [Navegação](#navegação)
4. [Dashboard](#dashboard)
5. [Módulo Financeiro](#módulo-financeiro)
6. [Módulo Estoque](#módulo-estoque)
7. [Módulo RH](#módulo-rh)
8. [Módulo Músicos](#módulo-músicos)
9. [Módulo Eventos](#módulo-eventos)
10. [Módulo Ocorrências](#módulo-ocorrências)
11. [Módulo Solicitações](#módulo-solicitações)
12. [Configurações](#configurações)
13. [Dicas e Boas Práticas](#dicas-e-boas-práticas)

---

## 1. Visão Geral

O **Sistema Ditado Popular** é uma plataforma completa de gestão empresarial desenvolvida especificamente para bares, restaurantes e casas de eventos. O sistema integra todas as áreas operacionais em uma única plataforma web.

### Principais Funcionalidades

- **Gestão Financeira Completa**: Contas a pagar, receber, fluxo de caixa e relatórios gerenciais
- **Controle de Estoque**: Gestão de múltiplos estoques, compras, produção e movimentações
- **Recursos Humanos**: Controle de colaboradores, escalas, férias e gorjetas
- **Gestão de Eventos**: Controle de eventos fechados, reservas especiais e normais
- **Solicitações**: Sistema de workflow para aprovações internas
- **Ocorrências**: Livro de registro de acontecimentos nos setores

### Requisitos de Acesso

- Navegador web moderno (Chrome, Firefox, Safari ou Edge)
- Conexão com a internet
- Credenciais de acesso fornecidas pelo administrador

---

## 2. Acesso ao Sistema

### Login

1. Acesse a URL do sistema fornecida pelo administrador
2. Insira seu **usuário** (email ou username)
3. Insira sua **senha**
4. Clique em **Entrar**

### Níveis de Acesso

O sistema possui diferentes níveis de permissão:

- **Master**: Acesso total a todos os módulos e funcionalidades
- **Gerente**: Acesso a múltiplos módulos conforme configuração
- **Usuário**: Acesso específico a módulos e funcionalidades designadas

**Importante**: As funcionalidades visíveis dependem das permissões concedidas ao seu usuário.

---

## 3. Navegação

### Menu Lateral

O menu lateral é a principal forma de navegação do sistema. Ele contém:

- **Logo do Sistema**: Topo do menu
- **Módulos Principais**: Lista de todos os módulos que você tem acesso
- **Indicadores Visuais**: Ícones coloridos identificam cada módulo

### Estrutura dos Módulos

Cada módulo possui:
- **Abas**: Subseções organizadas por funcionalidade
- **Filtros**: Campos para refinar buscas e visualizações
- **Botões de Ação**: Criar novo registro, exportar dados, etc.
- **Tabelas/Listas**: Visualização dos dados cadastrados

### Menu Superior (Topbar)

- **Nome do Usuário**: Canto superior direito
- **Perfil e Logout**: Clique no nome para acessar
- **Menu Mobile**: Botão hambúrguer em dispositivos móveis

---

## 4. Dashboard

O Dashboard é a tela inicial após o login. Apresenta uma visão geral do negócio.

### Informações Disponíveis

- **Resumo Financeiro**: Entradas, saídas e saldo do período
- **Indicadores de Estoque**: Itens críticos, valor total em estoque
- **RH**: Colaboradores ativos, escalas do dia
- **Eventos**: Próximos eventos agendados
- **Gráficos**: Visualização de tendências e performance

### Como Usar

1. Visualize os indicadores principais
2. Clique nos cards para acessar o módulo específico
3. Use os filtros de período para análises customizadas
4. Exporte relatórios quando necessário

---

## 5. Módulo Financeiro

O módulo financeiro gerencia todas as movimentações financeiras da empresa.

### 5.1 Fluxo de Caixa

**Propósito**: Controle de todas as entradas e saídas financeiras.

**Como Usar**:

1. Acesse **Financeiro** > **Fluxo de Caixa**
2. Visualize o resumo de saldo, entradas e saídas
3. Para registrar nova movimentação:
   - Clique em **+ Novo Lançamento**
   - Selecione o tipo: Entrada ou Saída
   - Preencha o valor
   - Escolha a data
   - Selecione o centro de custo
   - Adicione descrição
   - Anexe comprovante (opcional)
   - Clique em **Salvar**

**Filtros Disponíveis**:
- Por período (semana, mês, ano)
- Por categoria/centro de custo
- Por tipo (entrada/saída)

### 5.2 Contas a Pagar

**Propósito**: Gerenciamento de todas as obrigações financeiras.

**Como Criar uma Conta a Pagar**:

1. Clique em **+ Nova Conta a Pagar**
2. Preencha os dados obrigatórios:
   - Fornecedor
   - Descrição
   - Categoria financeira
   - Valor total
   - Data de emissão
   - Data de vencimento
3. Para contas parceladas:
   - Marque "Conta Parcelada"
   - Defina número de parcelas
   - Escolha intervalo (mensal, quinzenal, etc.)
4. Para contas recorrentes:
   - Marque "Conta Recorrente"
   - Defina dia do vencimento
5. Clique em **Salvar**

**Status das Contas**:
- **Pendente**: Aguardando aprovação
- **Em Aberto**: Aprovada, aguardando pagamento
- **Vencida**: Passou da data de vencimento
- **Paga**: Já quitada
- **Cancelada**: Cancelada manualmente

**Funcionalidades Especiais**:
- **Importação em Lote**: Importe múltiplas contas via planilha
- **Aprovação**: Contas pendentes precisam ser aprovadas antes do pagamento
- **Anexos**: Anexe notas fiscais e comprovantes

### 5.3 Contas a Receber

**Propósito**: Gerenciamento de valores a receber de clientes.

**Como Criar uma Conta a Receber**:

1. Clique em **+ Nova Conta a Receber**
2. Selecione ou cadastre o cliente
3. Preencha:
   - Descrição
   - Categoria
   - Valor total
   - Data de emissão
   - Data de vencimento
   - Número do documento (opcional)
4. Para parcelamento:
   - Marque "Conta Parcelada"
   - Configure as parcelas
5. Salve a conta

**Recebimento**:
- Na lista, clique em **Receber**
- Confirme valor recebido
- Selecione forma de recebimento
- Adicione descontos/juros se necessário
- Finalize o recebimento

**Integração com Eventos**:
- Contas podem ser geradas automaticamente de eventos fechados
- Vínculo automático com cliente do evento

### 5.4 Aprovação do Dia

**Propósito**: Visualização e aprovação de contas agendadas para o dia.

**Como Usar**:

1. Acesse **Financeiro** > **Aprovação do Dia**
2. Visualize todas as contas com vencimento hoje
3. Para aprovar:
   - Revise os detalhes da conta
   - Clique em **Aprovar**
   - A conta muda para status "Em Aberto"
4. Para rejeitar:
   - Clique em **Rejeitar**
   - Informe o motivo
   - A conta retorna para "Pendente"

**Dica**: Esta tela é essencial para controle de fluxo de caixa diário.

### 5.5 Baixa de Contas

**Propósito**: Registro de pagamento de contas aprovadas.

**Como Dar Baixa em uma Conta**:

1. Acesse **Financeiro** > **Baixa de Contas**
2. Localize a conta desejada
3. Clique em **Dar Baixa**
4. Preencha:
   - Data do pagamento
   - Valor pago
   - Forma de pagamento
   - Descontos aplicados (se houver)
   - Juros/multas (se houver)
5. Confirme a baixa

**Pagamento Parcial**:
- O sistema permite pagamentos parciais
- O saldo restante permanece em aberto
- Histórico completo de pagamentos é mantido

### 5.6 Ficha Fornecedor

**Propósito**: Visualização completa do relacionamento financeiro com fornecedor.

**Informações Disponíveis**:
- Dados cadastrais do fornecedor
- Histórico de compras
- Contas a pagar (abertas e pagas)
- Total de débitos
- Histórico de pagamentos
- Média de valores

**Como Usar**:
1. Selecione o fornecedor na lista
2. Visualize o resumo financeiro
3. Acesse cada aba para detalhes específicos
4. Exporte relatórios quando necessário

### 5.7 Kardex Fornecedor

**Propósito**: Movimento financeiro detalhado por fornecedor.

**Visualização**:
- Movimentações cronológicas
- Débitos e créditos
- Saldo acumulado
- Notas fiscais vinculadas

### 5.8 Kardex Completo

**Propósito**: Visão consolidada de todo o movimento financeiro.

**Funcionalidades**:
- Filtro por período
- Filtro por categoria
- Filtro por fornecedor/cliente
- Exportação para Excel
- Impressão de relatórios

### 5.9 Relatórios Gerenciais

**Propósito**: Análises e relatórios estratégicos.

**Relatórios Disponíveis**:

1. **DRE (Demonstrativo de Resultado)**:
   - Receitas
   - Despesas por categoria
   - Lucro/prejuízo do período
   - Gráficos de evolução

2. **Fluxo de Caixa Projetado**:
   - Previsão de entradas
   - Previsão de saídas
   - Saldo projetado

3. **Análise de Centro de Custos**:
   - Gastos por setor
   - Comparativos
   - Percentuais

### 5.10 Cadastros Gerais

**Propósito**: Gerenciamento de cadastros básicos do financeiro.

**Cadastros Disponíveis**:

1. **Centro de Custo**:
   - Organize despesas por setor/departamento
   - Ex: Bar, Cozinha, Administração

2. **Fornecedores**:
   - Dados completos
   - Tipo: Pessoa Física ou Jurídica
   - Informações de contato
   - Dados bancários

3. **Clientes**:
   - Cadastro de clientes
   - Histórico de compras
   - Contas a receber

4. **Categorias Financeiras**:
   - Tipo: Receita ou Despesa
   - Descrição
   - Usado para classificação

**Como Cadastrar**:
1. Selecione a aba do cadastro desejado
2. Clique em **+ Novo**
3. Preencha os campos obrigatórios
4. Salve o cadastro

---

## 6. Módulo Estoque

Controle completo de estoques, itens, compras e produção.

### 6.1 Dashboard de Estoque

**Visualizações**:
- Total de itens cadastrados
- Itens abaixo do estoque mínimo
- Valor total em estoque
- Movimentações do mês
- Itens críticos (necessitam reposição urgente)

### 6.2 Estoques

**Propósito**: Gerenciamento de múltiplos estoques.

**Como Criar um Estoque**:

1. Clique em **+ Novo Estoque**
2. Preencha:
   - Nome (ex: Estoque Bar, Estoque Cozinha)
   - Localização
   - Responsável
   - Observações
3. Salve

**Gestão de Estoques**:
- Cada estoque é independente
- Permite transferências entre estoques
- Saldos separados por localização

### 6.3 Itens

**Propósito**: Cadastro de todos os produtos e insumos.

**Como Cadastrar um Item**:

1. Clique em **+ Novo Item**
2. Preencha informações básicas:
   - Nome
   - Código (opcional)
   - Categoria
   - Unidade de medida
   - Estoque mínimo
   - Estoque máximo
3. Informações adicionais:
   - Preço de custo
   - Preço de venda
   - Fornecedor principal
   - Descrição
4. Salve o item

**Tipos de Itens**:
- **Matéria-prima**: Insumos básicos
- **Produto acabado**: Pronto para venda
- **Intermediário**: Semi-acabado

**Controle de Estoque**:
- Estoque atual
- Estoque mínimo (alerta de reposição)
- Estoque máximo (limite de compra)
- Ponto de pedido

### 6.4 Fichas Técnicas

**Propósito**: Receitas e composição de produtos.

**Como Criar uma Ficha Técnica**:

1. Clique em **+ Nova Ficha Técnica**
2. Selecione o produto final
3. Adicione ingredientes:
   - Selecione o item
   - Informe a quantidade
   - A unidade é automática
4. O sistema calcula:
   - Custo total
   - Custo unitário
   - Margem de lucro
5. Salve a ficha

**Uso de Fichas Técnicas**:
- Na produção, a ficha baixa automaticamente os insumos
- Calcula custos precisos
- Controla receitas padronizadas

### 6.5 Compras

**Propósito**: Registro de compras e entrada de mercadorias.

**Como Registrar uma Compra**:

1. Clique em **+ Nova Compra**
2. Selecione:
   - Fornecedor
   - Estoque destino
   - Data da compra
   - Número da nota fiscal
3. Adicione itens:
   - Clique em **+ Adicionar Item**
   - Selecione o produto
   - Quantidade comprada
   - Valor unitário
   - Quantidade recebida (pode ser diferente)
4. O sistema calcula o valor total
5. Opções:
   - Gerar conta a pagar automaticamente
   - Anexar nota fiscal
6. Salve a compra

**Status da Compra**:
- **Pendente**: Aguardando confirmação
- **Recebida**: Mercadoria entregue
- **Parcial**: Recebimento parcial
- **Cancelada**: Compra cancelada

**Recebimento**:
- Confirme as quantidades recebidas
- O estoque é atualizado automaticamente
- Divergências são registradas

### 6.6 Produção

**Propósito**: Registro de produção interna de produtos.

**Como Registrar uma Produção**:

1. Clique em **+ Nova Produção**
2. Selecione:
   - Ficha técnica (produto a produzir)
   - Estoque de origem (insumos)
   - Estoque de destino (produto acabado)
   - Quantidade a produzir
3. O sistema mostra:
   - Insumos necessários
   - Disponibilidade no estoque
   - Alertas de falta
4. Confirme a produção

**Verificação de Insumos**:
- Sistema valida disponibilidade antes de produzir
- Alerta se algum insumo está em falta
- Sugere quantidade máxima possível

**Efeitos no Estoque**:
- Baixa automática dos insumos
- Entrada do produto acabado
- Registro de desperdício (se houver)
- Histórico completo

### 6.7 Requisições Internas

**Propósito**: Solicitações de materiais entre setores.

**Como Criar uma Requisição**:

1. Clique em **+ Nova Requisição**
2. Preencha:
   - Estoque origem
   - Estoque destino
   - Solicitante
   - Justificativa
3. Adicione itens:
   - Produto
   - Quantidade solicitada
4. Envie para aprovação

**Fluxo**:
- **Pendente**: Aguardando aprovação
- **Aprovada**: Autorizada
- **Atendida**: Produtos transferidos
- **Recusada**: Negada

**Atendimento**:
- Responsável do estoque origem aprova
- Sistema transfere os itens entre estoques
- Histórico mantido

### 6.8 Relatórios de Estoque

**Relatórios Disponíveis**:

1. **Posição de Estoque**:
   - Saldo atual de todos os itens
   - Valor total
   - Itens zerados

2. **Curva ABC**:
   - Classificação de itens por valor
   - Giro de estoque
   - Itens mais importantes

3. **Movimentações**:
   - Entradas e saídas por período
   - Por tipo de movimentação
   - Por estoque

4. **Inventário**:
   - Relatório para contagem física
   - Comparação físico x sistema
   - Ajustes necessários

### 6.9 Movimentações

**Propósito**: Registro manual de entradas/saídas.

**Tipos de Movimentação**:

1. **Entrada Manual**:
   - Doações recebidas
   - Ajustes de inventário
   - Devoluções de clientes

2. **Saída Manual**:
   - Quebras
   - Vencimentos
   - Consumo interno
   - Doações

3. **Transferência**:
   - Entre estoques diferentes
   - Rastreável

**Como Registrar**:
1. Selecione tipo de movimentação
2. Escolha o estoque
3. Adicione itens e quantidades
4. Informe motivo/justificativa
5. Salve a movimentação

### 6.10 Kardex Produto

**Propósito**: Histórico completo de movimentações de um item.

**Informações**:
- Todas as entradas (compras, produções, ajustes)
- Todas as saídas (vendas, consumo, baixas)
- Saldo após cada movimentação
- Data e hora de cada operação
- Documento de origem
- Responsável

**Como Usar**:
1. Selecione o produto
2. Defina período de análise
3. Visualize o histórico completo
4. Exporte para análise

---

## 7. Módulo RH

Gestão completa de recursos humanos.

### 7.1 Colaboradores

**Propósito**: Cadastro e gestão da equipe.

**Como Cadastrar um Colaborador**:

1. Clique em **+ Novo Colaborador**
2. **Dados Pessoais**:
   - Nome completo
   - CPF
   - Data de nascimento
   - Estado civil
   - Telefone
   - Email
   - Endereço completo
3. **Dados Profissionais**:
   - Função
   - Setor
   - Data de admissão
   - Tipo de contrato (CLT, PJ, Temporário)
   - Salário
   - Jornada de trabalho
4. **Documentação**:
   - RG
   - CTPS
   - PIS/PASEP
   - Título de eleitor
5. **Informações Bancárias**:
   - Banco
   - Agência
   - Conta
   - Tipo de conta
6. Salve o cadastro

**Gestão de Colaboradores**:
- **Ativo/Inativo**: Controle de status
- **Histórico**: Alterações de função, salário
- **Documentos**: Anexe contratos, exames
- **Ocorrências**: Vincule eventos do colaborador

### 7.2 Escalas

**Propósito**: Planejamento e controle de escalas de trabalho.

**Como Criar uma Escala**:

1. Clique em **+ Nova Escala**
2. Selecione:
   - Período (data inicial e final)
   - Setor
3. Adicione colaboradores:
   - Selecione o funcionário
   - Defina dias de trabalho
   - Defina horários
   - Marque folgas
4. Salve a escala

**Recursos**:
- **Visualização por Semana/Mês**: Calendário visual
- **Conflitos**: Sistema alerta sobreposições
- **Carga Horária**: Controle de horas trabalhadas
- **Impressão**: Gere escala para mural

**Tipos de Marcação**:
- Dia de trabalho (com horários)
- Folga
- Férias
- Falta
- Atestado

### 7.3 Férias

**Propósito**: Controle de férias dos colaboradores.

**Como Cadastrar Férias**:

1. Clique em **+ Novas Férias**
2. Selecione o colaborador
3. Preencha:
   - Data de início
   - Quantidade de dias
   - Período aquisitivo
   - Tipo (30 dias, fracionada)
4. Sistema calcula:
   - Data de retorno
   - Valor do terço constitucional
   - Adiantamento 13º (opcional)
5. Salve o registro

**Status de Férias**:
- **Programada**: Agendada para o futuro
- **Em andamento**: Colaborador está de férias
- **Concluída**: Férias finalizadas
- **Cancelada**: Cancelada antes do início

**Alertas**:
- Sistema alerta férias vencidas
- Período aquisitivo em expiração
- Necessidade de programação

### 7.4 Ocorrências

**Propósito**: Registro de eventos relacionados a colaboradores.

**Tipos de Ocorrências**:
- Advertência
- Suspensão
- Elogio
- Falta
- Atraso
- Acidente de trabalho
- Outros

**Como Registrar**:

1. Clique em **+ Nova Ocorrência**
2. Selecione o colaborador
3. Escolha o tipo
4. Preencha:
   - Data da ocorrência
   - Descrição detalhada
   - Testemunhas (se houver)
   - Medidas tomadas
5. Anexe documentos (se necessário)
6. Salve

**Importância**:
- Histórico do colaborador
- Defesa em processos trabalhistas
- Avaliação de desempenho
- Tomada de decisões

### 7.5 Extras/Freelancers

**Propósito**: Controle de trabalhos extras e freelancers.

**Como Registrar um Extra**:

1. Clique em **+ Novo Extra**
2. Selecione:
   - Colaborador (ou cadastre freelancer)
   - Data do trabalho
   - Evento/motivo
   - Horário início e fim
3. Valor:
   - Informe o valor acordado
   - Ou valor por hora
4. Salve

**Cálculo Automático**:
- Horas trabalhadas
- Valor total a pagar
- Acumulado no mês

**Pagamento**:
- Gera conta a pagar automaticamente
- Vincula ao colaborador
- Histórico de extras

### 7.6 Funções

**Propósito**: Cadastro de cargos e funções.

**Como Cadastrar uma Função**:

1. Clique em **+ Nova Função**
2. Preencha:
   - Nome da função
   - Setor
   - Descrição das atividades
   - Salário base (referência)
   - Requisitos
   - CBO (Classificação Brasileira de Ocupações)
3. Salve

**Uso**:
- Vincula colaboradores a funções
- Padroniza nomenclatura
- Define salários base
- Organiza estrutura

### 7.7 Configurações RH

**Propósito**: Parâmetros e configurações do RH.

**Configurações Disponíveis**:

1. **Setores**:
   - Cadastro de departamentos
   - Organização da empresa

2. **Tipos de Contrato**:
   - CLT
   - PJ
   - Temporário
   - Estágio

3. **Horários de Trabalho**:
   - Turnos predefinidos
   - Jornadas padrão

4. **Feriados**:
   - Cadastro de feriados
   - Nacional/Municipal
   - Afeta cálculos de escala

### 7.8 Relatórios RH

**Relatórios Disponíveis**:

1. **Folha de Pagamento**:
   - Lista de colaboradores
   - Salários
   - Descontos
   - Total da folha

2. **Aniversariantes**:
   - Por mês
   - Gestão de benefícios

3. **Admissões e Demissões**:
   - Por período
   - Turnover

4. **Horas Trabalhadas**:
   - Por colaborador
   - Horas extras
   - Banco de horas

5. **Férias Programadas**:
   - Planejamento anual
   - Por setor

### 7.9 Gorjetas

**Propósito**: Controle e distribuição de gorjetas.

**Como Registrar Gorjetas**:

1. Acesse **RH** > **Gorjetas**
2. Clique em **+ Novo Registro**
3. Selecione:
   - Data
   - Turno
   - Valor total arrecadado
4. Adicione garçons/atendentes:
   - Selecione cada colaborador
   - Informe horas trabalhadas
   - Sistema calcula divisão proporcional
5. Salve o registro

**Critérios de Divisão**:
- Por horas trabalhadas
- Por igual
- Por percentual (experiência)
- Customizado

**Pagamento**:
- Gera relatório para pagamento
- Histórico por colaborador
- Total mensal

---

## 8. Módulo Músicos

**Propósito**: Gestão de músicos e apresentações.

### Como Cadastrar um Músico

1. Clique em **+ Novo Músico**
2. **Dados Pessoais**:
   - Nome artístico
   - Nome completo
   - CPF
   - Telefone
   - Email
3. **Dados Profissionais**:
   - Instrumento principal
   - Estilo musical
   - Experiência
   - Valor do cachê
   - Observações
4. Salve o cadastro

### Agendamento de Apresentações

1. No cadastro do músico, acesse **Agenda**
2. Clique em **+ Nova Apresentação**
3. Preencha:
   - Data e horário
   - Local
   - Tipo de evento
   - Valor acordado
   - Duração
4. Status:
   - Agendado
   - Confirmado
   - Realizado
   - Cancelado

### Gestão Financeira

- Geração automática de contas a pagar
- Histórico de cachês
- Controle de pagamentos
- Relatórios de custos com música

---

## 9. Módulo Eventos

Gestão de eventos, reservas e locações.

### 9.1 Eventos Fechados

**Propósito**: Controle de eventos privados e festas fechadas.

**Como Cadastrar um Evento Fechado**:

1. Clique em **+ Novo Evento Fechado**
2. **Informações do Evento**:
   - Nome do evento
   - Tipo (aniversário, casamento, formatura, corporativo)
   - Data e horário
   - Quantidade de pessoas
3. **Dados do Cliente**:
   - Nome do responsável
   - Telefone
   - Email
   - CPF/CNPJ
4. **Valores**:
   - Valor total do evento
   - Sinal/entrada pago
   - Saldo restante
   - Forma de pagamento
5. **Detalhes**:
   - Descrição/observações
   - Requisitos especiais
   - Contrato assinado? (Sim/Não)
6. Salve o evento

**Geração de Conta a Receber**:
- Se contrato assinado = Sim
- Sistema pergunta se deseja gerar conta a receber
- Define data de vencimento
- Cria automaticamente vinculada ao evento

**Status do Evento**:
- **Orçamento**: Ainda em negociação
- **Confirmado**: Contrato assinado
- **Realizado**: Evento já aconteceu
- **Cancelado**: Evento cancelado

### 9.2 Reservas Especiais

**Propósito**: Reservas de áreas VIP ou espaços especiais.

**Como Criar uma Reserva Especial**:

1. Clique em **+ Nova Reserva Especial**
2. Preencha:
   - Nome do cliente
   - Telefone de contato
   - Data da reserva
   - Horário início e fim
   - Espaço reservado (VIP, Camarote, Área Externa)
   - Quantidade de pessoas
   - Valor da reserva
   - Consumação mínima (se aplicável)
3. Observações especiais
4. Salve

**Confirmação**:
- Status: Pendente, Confirmada, Cancelada
- Envio de lembretes (manual)
- Controle de comparecimento

### 9.3 Reservas Normais

**Propósito**: Reservas de mesas no estabelecimento.

**Como Criar uma Reserva Normal**:

1. Clique em **+ Nova Reserva Normal**
2. Preencha:
   - Nome do cliente
   - Telefone
   - Data e horário
   - Número de pessoas
   - Preferência de mesa (se houver)
   - Observações
3. Salve

**Gestão de Reservas**:
- Calendário visual
- Alertas de reservas do dia
- Controle de no-show
- Lista de espera

**Integração**:
- Atualização de status em tempo real
- Disponibilidade de mesas
- Histórico do cliente

---

## 10. Módulo Ocorrências

**Propósito**: Livro de registro de acontecimentos nos setores (nova funcionalidade).

### Como Funciona

O módulo de Ocorrências serve como um livro de registro onde líderes e gestores documentam acontecimentos importantes em seus setores.

### Como Registrar uma Ocorrência

1. Acesse **Ocorrências** no menu lateral
2. Clique em **+ Nova Ocorrência**
3. **Informações Básicas**:
   - Data e hora da ocorrência
   - Setor (Bar, Cozinha, Eventos, RH, etc.)
   - Tipo (Cliente, Funcionário, Equipamento, Operacional, Segurança, Financeiro)
4. **Classificação**:
   - Gravidade: Baixa, Média, Alta, Crítica
   - Status: Aberta, Em Análise, Resolvida, Arquivada
5. **Descrição Completa**:
   - Título resumido
   - Descrição detalhada do acontecimento
   - Pessoas/clientes envolvidos
   - Ações tomadas
   - Observações adicionais
6. Salve a ocorrência

### Dashboard de Ocorrências

Na tela inicial do módulo:
- **Ocorrências Abertas**: Quantidade pendente de resolução
- **Críticas/Altas**: Ocorrências que necessitam atenção urgente
- **Hoje**: Registros do dia atual

### Filtros e Buscas

**Filtros Disponíveis**:
- Por setor
- Por gravidade
- Por status
- Busca por texto (título, descrição, envolvidos)

### Tipos de Ocorrências

**Com Clientes**:
- Reclamações
- Elogios
- Incidentes
- Solicitações especiais

**Com Funcionários**:
- Conflitos
- Destaques positivos
- Problemas de conduta
- Sugestões

**Operacionais**:
- Falhas de equipamento
- Falta de insumos
- Problemas de processo
- Melhorias necessárias

**Segurança**:
- Incidentes
- Riscos identificados
- Ações preventivas

### Fluxo de Trabalho

1. **Registro**: Líder registra a ocorrência
2. **Análise**: Gestor avalia e classifica
3. **Ação**: Medidas são tomadas
4. **Resolução**: Problema solucionado
5. **Arquivamento**: Registro mantido para histórico

### Importância

- **Rastreabilidade**: Histórico completo de eventos
- **Gestão**: Identificação de padrões e problemas recorrentes
- **Defesa Legal**: Documentação para eventuais processos
- **Melhoria Contínua**: Base para decisões estratégicas

---

## 11. Módulo Solicitações

Sistema de workflow para aprovações internas.

### 11.1 Minhas Solicitações

**Propósito**: Solicitações criadas por você.

**Como Criar uma Solicitação**:

1. Clique em **+ Nova Solicitação**
2. Preencha:
   - Tipo (Compra, Vale, Adiantamento, Reembolso, Outros)
   - Descrição detalhada
   - Valor (se aplicável)
   - Justificativa
   - Urgência
3. Anexe documentos comprobatórios
4. Selecione aprovador
5. Envie

**Status**:
- **Pendente**: Aguardando aprovação
- **Aprovada**: Autorizada
- **Recusada**: Negada
- **Em Análise**: Sendo avaliada
- **Concluída**: Finalizada

**Acompanhamento**:
- Histórico completo
- Comentários do aprovador
- Notificações de mudança de status

### 11.2 Todas as Solicitações

**Propósito**: Visão geral de todas as solicitações (para gestores).

**Filtros**:
- Por solicitante
- Por tipo
- Por status
- Por período
- Por valor

### 11.3 Aguardando Aprovação

**Propósito**: Solicitações que dependem da sua aprovação.

**Como Aprovar uma Solicitação**:

1. Acesse a solicitação
2. Revise todos os detalhes
3. Verifique documentos anexados
4. Opções:
   - **Aprovar**: Autoriza a solicitação
   - **Recusar**: Nega com justificativa
   - **Solicitar Mais Informações**: Pede esclarecimentos
5. Adicione comentários (opcional)
6. Confirme a decisão

**Responsabilidades**:
- Análise criteriosa
- Resposta em tempo hábil
- Justificativa em recusas
- Alinhamento com políticas da empresa

### 11.4 Relatórios de Solicitações

**Análises Disponíveis**:
- Volume de solicitações por período
- Taxa de aprovação/recusa
- Tempo médio de aprovação
- Tipos mais solicitados
- Valores totais

---

## 12. Configurações

### 12.1 Perfil

**Gerenciamento do Seu Perfil**:

1. Acesse **Configurações** > **Perfil**
2. Edite suas informações:
   - Foto de perfil
   - Nome completo
   - Email
   - Telefone
   - Dados pessoais
3. Salve as alterações

### 12.2 Segurança

**Alteração de Senha**:

1. Acesse **Configurações** > **Segurança**
2. Clique em **Alterar Senha**
3. Informe:
   - Senha atual
   - Nova senha
   - Confirmação da nova senha
4. Salve

**Requisitos de Senha**:
- Mínimo 8 caracteres
- Letras e números
- Caractere especial (recomendado)

**Segurança da Conta**:
- Histórico de acessos
- Dispositivos conectados
- Atividades recentes

### 12.3 Notificações

**Preferências de Notificações**:

Configure quais eventos geram notificações:
- Novas solicitações
- Aprovações pendentes
- Vencimento de contas
- Estoque baixo
- Eventos próximos

### 12.4 Usuários (Apenas Administradores)

**Gerenciamento de Usuários**:

**Como Criar um Usuário**:

1. Acesse **Configurações** > **Usuários**
2. Clique em **+ Novo Usuário**
3. Preencha:
   - Nome completo
   - Email (usado para login)
   - Username (opcional)
   - Nível de acesso (Master, Gerente, Usuário)
   - Senha inicial
4. Defina permissões:
   - Selecione módulos permitidos
   - Para cada módulo, defina abas específicas
   - Permissões: leitura, escrita, exclusão
5. Salve

**Desativação de Usuários**:
- Usuários podem ser desativados (não excluídos)
- Mantém histórico de ações
- Pode ser reativado posteriormente

### 12.5 Pagamentos

**Configurações de Formas de Pagamento**:

Cadastre e gerencie:
- Dinheiro
- Cartão de crédito
- Cartão de débito
- PIX
- Transferência bancária
- Boleto
- Cheque

**Dados Bancários**:
- Contas da empresa
- Para geração de boletos
- Para conciliação bancária

### 12.6 Geral

**Configurações Globais do Sistema**:

1. **Dados da Empresa**:
   - Razão social
   - Nome fantasia
   - CNPJ
   - Endereço
   - Telefones
   - Logo

2. **Parâmetros do Sistema**:
   - Moeda padrão
   - Formato de data
   - Fuso horário
   - Idioma

3. **Fiscal**:
   - Regime tributário
   - Informações para NF-e
   - Certificado digital

---

## 13. Dicas e Boas Práticas

### 13.1 Organização

**Cadastros Básicos Primeiro**:
1. Configure cadastros gerais (fornecedores, clientes, categorias)
2. Cadastre itens de estoque
3. Configure usuários e permissões
4. Personalize categorias conforme seu negócio

**Padronização**:
- Use nomes consistentes
- Padronize códigos de produtos
- Defina nomenclaturas claras
- Documente processos internos

### 13.2 Financeiro

**Fluxo de Caixa**:
- Registre todas as movimentações diariamente
- Anexe comprovantes
- Classifique corretamente as despesas
- Reconcilie com extrato bancário

**Contas a Pagar**:
- Cadastre assim que receber a nota
- Não deixe para última hora
- Use o sistema de aprovação
- Acompanhe vencimentos

**Contas a Receber**:
- Cadastre imediatamente após venda/serviço
- Acompanhe inadimplência
- Envie lembretes de vencimento
- Negocie com antecedência

### 13.3 Estoque

**Controle Rigoroso**:
- Faça inventários periódicos (mensal recomendado)
- Ajuste divergências imediatamente
- Mantenha estoque mínimo atualizado
- Atue em itens críticos rapidamente

**Compras Inteligentes**:
- Monitore giro de estoque
- Negocie com fornecedores
- Aproveite promoções (sem exageros)
- Planeje compras com antecedência

**Produção Eficiente**:
- Use fichas técnicas padronizadas
- Minimize desperdícios
- Treine equipe em receitas
- Controle custos rigorosamente

### 13.4 RH

**Documentação**:
- Mantenha todos os documentos digitalizados
- Atualize dados regularmente
- Registre todas as ocorrências
- Cumpra prazos trabalhistas

**Escalas**:
- Planeje com antecedência (mínimo 7 dias)
- Respeite folgas e descanso
- Comunique mudanças rapidamente
- Considere preferências quando possível

**Comunicação**:
- Seja claro e objetivo
- Registre comunicados importantes
- Use o sistema de ocorrências
- Mantenha canal aberto com equipe

### 13.5 Eventos

**Organização**:
- Confirme todos os detalhes por escrito
- Faça follow-up 7 e 2 dias antes
- Tenha checklist de preparação
- Registre feedbacks pós-evento

**Contratos**:
- Use contrato padrão
- Peça sinal/entrada
- Defina políticas de cancelamento
- Gere conta a receber no sistema

### 13.6 Relatórios

**Análise Regular**:
- DRE mensal (no mínimo)
- Fluxo de caixa semanal
- Posição de estoque quinzenal
- Indicadores de RH mensal

**Tomada de Decisão**:
- Base suas decisões em dados
- Compare períodos
- Identifique tendências
- Aja preventivamente

### 13.7 Segurança

**Backup**:
- Sistema realiza backup automático
- Mantenha documentos importantes também fora do sistema
- Não confie 100% em um único local

**Senhas**:
- Use senhas fortes
- Não compartilhe sua senha
- Altere periodicamente
- Não salve em locais públicos

**Acesso**:
- Faça logout ao sair
- Não deixe sessão aberta em computador compartilhado
- Use permissões adequadas para cada usuário
- Monitore acessos suspeitos

### 13.8 Suporte

**Quando Precisar de Ajuda**:

1. **Consulte este Manual**: A maioria das dúvidas está documentada aqui

2. **Contate o Administrador**: Para questões de permissão e configuração

3. **Suporte Técnico**: Para problemas técnicos ou bugs
   - Descreva o problema detalhadamente
   - Informe o que estava fazendo
   - Envie prints se possível
   - Mencione mensagens de erro

**Sugestões e Melhorias**:
- Sistema está em constante evolução
- Suas sugestões são bem-vindas
- Reporte inconsistências
- Proponha novas funcionalidades

---

## Conclusão

Este manual cobre todas as funcionalidades principais do Sistema Ditado Popular. Para operação eficiente:

1. **Familiarize-se** com os módulos relevantes ao seu trabalho
2. **Pratique** regularmente para ganhar agilidade
3. **Mantenha** dados atualizados e organizados
4. **Consulte** este manual sempre que necessário
5. **Sugira** melhorias baseadas na sua experiência

**Lembre-se**: O sistema é uma ferramenta. O sucesso depende do uso correto e consistente por toda a equipe.

---

**Versão do Manual**: 1.0
**Data**: Outubro 2024
**Sistema**: Ditado Popular - Gestão Empresarial

---

Para dúvidas, sugestões ou suporte técnico, entre em contato com o administrador do sistema.
