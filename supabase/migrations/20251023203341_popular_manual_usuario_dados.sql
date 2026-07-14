/*
  # Popular Manual do Usuário com Dados Iniciais

  Insere categorias e tópicos do manual do usuário
*/

-- Inserir Categorias
INSERT INTO manual_categorias (nome, descricao, icone, cor, ordem, ativo) VALUES
('Visão Geral', 'Introdução ao sistema e conceitos básicos', 'Home', 'blue', 1, true),
('Dashboard', 'Como usar o painel principal', 'TrendingUp', 'green', 2, true),
('Módulo Financeiro', 'Gestão financeira completa', 'DollarSign', 'emerald', 3, true),
('Módulo Estoque', 'Controle de estoque e inventário', 'Package', 'orange', 4, true),
('Módulo RH', 'Recursos Humanos e gestão de pessoas', 'Users', 'purple', 5, true),
('Módulo Eventos', 'Gestão de eventos e reservas', 'CalendarDays', 'indigo', 6, true),
('Módulo Ocorrências', 'Livro de registros e ocorrências', 'AlertTriangle', 'red', 7, true),
('Módulo Solicitações', 'Sistema de aprovações', 'ClipboardList', 'teal', 8, true),
('Configurações', 'Configurações do sistema e usuário', 'Settings', 'gray', 9, true),
('Dicas e Boas Práticas', 'Recomendações de uso', 'HelpCircle', 'yellow', 10, true)
ON CONFLICT DO NOTHING;

-- Inserir Tópicos da Visão Geral
INSERT INTO manual_topicos (categoria_id, titulo, conteudo, tags, ordem, ativo) VALUES
(
  (SELECT id FROM manual_categorias WHERE nome = 'Visão Geral' LIMIT 1),
  'Sobre o Sistema',
  '<h3>Sistema Ditado Popular - Gestão Empresarial</h3>
<p>O Sistema Ditado Popular é uma plataforma completa de gestão desenvolvida especificamente para bares, restaurantes e casas de eventos.</p>

<h4>Principais Funcionalidades:</h4>
<ul>
  <li><strong>Gestão Financeira Completa:</strong> Contas a pagar, receber, fluxo de caixa e relatórios gerenciais</li>
  <li><strong>Controle de Estoque:</strong> Múltiplos estoques, compras, produção e movimentações</li>
  <li><strong>Recursos Humanos:</strong> Colaboradores, escalas, férias e gorjetas</li>
  <li><strong>Gestão de Eventos:</strong> Eventos fechados, reservas especiais e normais</li>
  <li><strong>Sistema de Solicitações:</strong> Workflow de aprovações internas</li>
  <li><strong>Livro de Ocorrências:</strong> Registro de acontecimentos nos setores</li>
</ul>',
  ARRAY['sobre', 'sistema', 'introdução', 'funcionalidades'],
  1,
  true
),
(
  (SELECT id FROM manual_categorias WHERE nome = 'Visão Geral' LIMIT 1),
  'Como Navegar',
  '<h3>Navegando pelo Sistema</h3>

<h4>Menu Lateral:</h4>
<p>O menu lateral é sua principal ferramenta de navegação. Ele contém:</p>
<ul>
  <li><strong>Logo do Sistema:</strong> No topo do menu</li>
  <li><strong>Módulos Principais:</strong> Lista de módulos que você tem acesso</li>
  <li><strong>Ícones Coloridos:</strong> Identificam visualmente cada módulo</li>
</ul>

<h4>Estrutura dos Módulos:</h4>
<ul>
  <li><strong>Abas:</strong> Subseções organizadas por funcionalidade</li>
  <li><strong>Filtros:</strong> Para refinar buscas e visualizações</li>
  <li><strong>Botões de Ação:</strong> Criar, editar, excluir registros</li>
  <li><strong>Tabelas/Listas:</strong> Visualização dos dados</li>
</ul>',
  ARRAY['navegação', 'menu', 'interface'],
  2,
  true
),
(
  (SELECT id FROM manual_categorias WHERE nome = 'Visão Geral' LIMIT 1),
  'Níveis de Acesso',
  '<h3>Permissões e Níveis de Acesso</h3>

<h4>Master:</h4>
<ul>
  <li>Acesso total a todos os módulos</li>
  <li>Pode criar e gerenciar usuários</li>
  <li>Acessa todas as configurações</li>
  <li>Visualiza todos os dados</li>
</ul>

<h4>Gerente:</h4>
<ul>
  <li>Acesso a múltiplos módulos conforme configuração</li>
  <li>Pode aprovar solicitações</li>
  <li>Acessa relatórios gerenciais</li>
  <li>Permissões específicas por módulo</li>
</ul>

<h4>Usuário:</h4>
<ul>
  <li>Acesso específico a módulos designados</li>
  <li>Permissões limitadas conforme função</li>
  <li>Pode criar solicitações</li>
  <li>Visualiza apenas dados relacionados ao seu trabalho</li>
</ul>',
  ARRAY['permissões', 'acesso', 'níveis', 'usuário'],
  3,
  true
)
ON CONFLICT DO NOTHING;

-- Inserir Tópicos do Módulo Financeiro
INSERT INTO manual_topicos (categoria_id, titulo, conteudo, tags, ordem, ativo) VALUES
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo Financeiro' LIMIT 1),
  'Fluxo de Caixa',
  '<h3>Fluxo de Caixa</h3>
<p><strong>Propósito:</strong> Controle de todas as entradas e saídas financeiras.</p>

<h4>Como Registrar Movimentação:</h4>
<ol>
  <li>Acesse <strong>Financeiro > Fluxo de Caixa</strong></li>
  <li>Clique em <strong>+ Novo Lançamento</strong></li>
  <li>Selecione o tipo: Entrada ou Saída</li>
  <li>Preencha o valor, data e categoria</li>
  <li>Adicione descrição detalhada</li>
  <li>Anexe comprovante (opcional mas recomendado)</li>
  <li>Clique em <strong>Salvar</strong></li>
</ol>

<h4>Dicas:</h4>
<ul>
  <li>Registre movimentações diariamente</li>
  <li>Sempre anexe comprovantes</li>
  <li>Use descrições claras</li>
  <li>Classifique corretamente o centro de custo</li>
</ul>',
  ARRAY['fluxo', 'caixa', 'financeiro', 'movimentação'],
  1,
  true
),
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo Financeiro' LIMIT 1),
  'Contas a Pagar',
  '<h3>Contas a Pagar</h3>
<p><strong>Propósito:</strong> Gerenciamento de todas as obrigações financeiras.</p>

<h4>Como Criar:</h4>
<ol>
  <li>Clique em <strong>+ Nova Conta a Pagar</strong></li>
  <li>Selecione o fornecedor</li>
  <li>Preencha descrição, categoria e valor</li>
  <li>Defina datas de emissão e vencimento</li>
  <li>Configure parcelamento se necessário</li>
  <li>Salve a conta</li>
</ol>

<h4>Status:</h4>
<ul>
  <li><strong>Pendente:</strong> Aguardando aprovação</li>
  <li><strong>Em Aberto:</strong> Aprovada, aguardando pagamento</li>
  <li><strong>Vencida:</strong> Passou do vencimento</li>
  <li><strong>Paga:</strong> Quitada</li>
</ul>',
  ARRAY['contas', 'pagar', 'fornecedor', 'pagamento'],
  2,
  true
),
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo Financeiro' LIMIT 1),
  'Contas a Receber',
  '<h3>Contas a Receber</h3>
<p><strong>Propósito:</strong> Gerenciamento de valores a receber de clientes.</p>

<h4>Como Receber:</h4>
<ol>
  <li>Na lista, clique em <strong>Receber</strong></li>
  <li>Confirme valor recebido</li>
  <li>Selecione forma de recebimento</li>
  <li>Adicione descontos/juros se necessário</li>
  <li>Finalize o recebimento</li>
</ol>',
  ARRAY['contas', 'receber', 'cliente', 'recebimento'],
  3,
  true
)
ON CONFLICT DO NOTHING;

-- Inserir Tópicos do Módulo Estoque
INSERT INTO manual_topicos (categoria_id, titulo, conteudo, tags, ordem, ativo) VALUES
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo Estoque' LIMIT 1),
  'Gestão de Estoques',
  '<h3>Múltiplos Estoques</h3>
<p>O sistema permite gerenciar vários estoques simultaneamente.</p>

<h4>Como Criar um Estoque:</h4>
<ol>
  <li>Clique em <strong>+ Novo Estoque</strong></li>
  <li>Preencha nome e localização</li>
  <li>Defina responsável</li>
  <li>Salve</li>
</ol>

<h4>Vantagens:</h4>
<ul>
  <li>Cada estoque é independente</li>
  <li>Permite transferências entre estoques</li>
  <li>Controle mais preciso por setor</li>
</ul>',
  ARRAY['estoque', 'gestão', 'múltiplos', 'localização'],
  1,
  true
),
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo Estoque' LIMIT 1),
  'Cadastro de Itens',
  '<h3>Cadastrar Produtos e Insumos</h3>

<h4>Como Cadastrar:</h4>
<ol>
  <li>Clique em <strong>+ Novo Item</strong></li>
  <li>Preencha nome, código e categoria</li>
  <li>Defina unidade de medida</li>
  <li>Configure estoque mínimo e máximo</li>
  <li>Adicione preços de custo e venda</li>
  <li>Salve o item</li>
</ol>

<h4>Alertas:</h4>
<p>O sistema alerta automaticamente quando itens atingem o estoque mínimo.</p>',
  ARRAY['item', 'produto', 'cadastro', 'insumo'],
  2,
  true
),
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo Estoque' LIMIT 1),
  'Fichas Técnicas',
  '<h3>Receitas e Composição</h3>

<h4>Como Criar:</h4>
<ol>
  <li>Clique em <strong>+ Nova Ficha Técnica</strong></li>
  <li>Selecione o produto final</li>
  <li>Adicione ingredientes com quantidades</li>
  <li>Sistema calcula custo automaticamente</li>
  <li>Salve a ficha</li>
</ol>

<h4>Uso:</h4>
<p>Na produção, a ficha baixa automaticamente os insumos e calcula custos precisos.</p>',
  ARRAY['ficha', 'técnica', 'receita', 'produção'],
  3,
  true
),
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo Estoque' LIMIT 1),
  'Registro de Compras',
  '<h3>Entrada de Mercadorias</h3>

<h4>Como Registrar:</h4>
<ol>
  <li>Clique em <strong>+ Nova Compra</strong></li>
  <li>Selecione fornecedor e estoque destino</li>
  <li>Adicione itens, quantidades e valores</li>
  <li>Opcionalmente gere conta a pagar</li>
  <li>Salve a compra</li>
</ol>

<h4>Status:</h4>
<ul>
  <li>Pendente, Recebida, Parcial, Cancelada</li>
</ul>',
  ARRAY['compra', 'entrada', 'nota', 'fiscal'],
  4,
  true
),
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo Estoque' LIMIT 1),
  'Produção',
  '<h3>Registro de Produção Interna</h3>

<h4>Como Produzir:</h4>
<ol>
  <li>Clique em <strong>+ Nova Produção</strong></li>
  <li>Selecione a ficha técnica</li>
  <li>Escolha estoques de origem e destino</li>
  <li>Defina quantidade</li>
  <li>Sistema verifica disponibilidade</li>
  <li>Confirme a produção</li>
</ol>

<h4>Efeitos:</h4>
<ul>
  <li>Baixa automática dos insumos</li>
  <li>Entrada do produto acabado</li>
  <li>Histórico completo</li>
</ul>',
  ARRAY['produção', 'fabricação', 'manufatura'],
  5,
  true
),
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo Estoque' LIMIT 1),
  'Requisições Internas',
  '<h3>Transferências Entre Setores</h3>

<h4>Como Requisitar:</h4>
<ol>
  <li>Clique em <strong>+ Nova Requisição</strong></li>
  <li>Defina estoque origem e destino</li>
  <li>Adicione itens e quantidades</li>
  <li>Justifique a requisição</li>
  <li>Envie para aprovação</li>
</ol>

<h4>Fluxo:</h4>
<p>Pendente → Aprovada → Atendida</p>',
  ARRAY['requisição', 'transferência', 'setor'],
  6,
  true
)
ON CONFLICT DO NOTHING;

-- Continua na próxima migration...
