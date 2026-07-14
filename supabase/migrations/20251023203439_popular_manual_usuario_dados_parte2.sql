/*
  # Popular Manual do Usuário - Parte 2

  Insere tópicos adicionais
*/

-- Inserir Tópicos do Módulo RH
INSERT INTO manual_topicos (categoria_id, titulo, conteudo, tags, ordem, ativo) VALUES
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo RH' LIMIT 1),
  'Cadastro de Colaboradores',
  '<h3>Gestão da Equipe</h3>

<h4>Como Cadastrar:</h4>
<ol>
  <li>Clique em <strong>+ Novo Colaborador</strong></li>
  <li>Preencha dados pessoais completos</li>
  <li>Adicione dados profissionais e função</li>
  <li>Inclua documentação</li>
  <li>Dados bancários</li>
  <li>Salve</li>
</ol>

<h4>Gestão:</h4>
<ul>
  <li>Status Ativo/Inativo</li>
  <li>Histórico de alterações</li>
  <li>Anexo de documentos</li>
</ul>',
  ARRAY['colaborador', 'funcionário', 'cadastro', 'rh'],
  1,
  true
),
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo RH' LIMIT 1),
  'Escalas de Trabalho',
  '<h3>Planejamento de Escalas</h3>

<h4>Como Criar:</h4>
<ol>
  <li>Clique em <strong>+ Nova Escala</strong></li>
  <li>Selecione período e setor</li>
  <li>Adicione colaboradores</li>
  <li>Defina dias e horários</li>
  <li>Marque folgas</li>
  <li>Salve</li>
</ol>

<h4>Recursos:</h4>
<ul>
  <li>Visualização por semana/mês</li>
  <li>Alertas de conflitos</li>
  <li>Controle de carga horária</li>
</ul>',
  ARRAY['escala', 'trabalho', 'turno', 'horário'],
  2,
  true
),
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo RH' LIMIT 1),
  'Controle de Férias',
  '<h3>Gestão de Férias</h3>

<h4>Como Cadastrar:</h4>
<ol>
  <li>Clique em <strong>+ Novas Férias</strong></li>
  <li>Selecione o colaborador</li>
  <li>Defina data e quantidade de dias</li>
  <li>Sistema calcula automaticamente</li>
  <li>Salve</li>
</ol>

<h4>Alertas:</h4>
<p>Sistema alerta férias vencidas e períodos próximos.</p>',
  ARRAY['férias', 'descanso', 'período'],
  3,
  true
),
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo RH' LIMIT 1),
  'Gorjetas',
  '<h3>Distribuição de Gorjetas</h3>

<h4>Como Registrar:</h4>
<ol>
  <li>Acesse <strong>RH > Gorjetas</strong></li>
  <li>Clique em <strong>+ Novo Registro</strong></li>
  <li>Selecione data, turno e valor total</li>
  <li>Adicione colaboradores com horas</li>
  <li>Sistema calcula divisão</li>
  <li>Salve</li>
</ol>

<h4>Critérios:</h4>
<p>Por horas, por igual, por percentual ou customizado.</p>',
  ARRAY['gorjeta', 'divisão', 'garçom'],
  4,
  true
)
ON CONFLICT DO NOTHING;

-- Inserir Tópicos do Módulo Eventos
INSERT INTO manual_topicos (categoria_id, titulo, conteudo, tags, ordem, ativo) VALUES
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo Eventos' LIMIT 1),
  'Eventos Fechados',
  '<h3>Festas Privadas</h3>

<h4>Como Cadastrar:</h4>
<ol>
  <li>Clique em <strong>+ Novo Evento Fechado</strong></li>
  <li>Preencha informações do evento</li>
  <li>Dados do cliente</li>
  <li>Valores e formas de pagamento</li>
  <li>Detalhes e observações</li>
  <li>Salve</li>
</ol>

<h4>Geração Automática:</h4>
<p>Sistema pode gerar conta a receber automaticamente quando contrato for assinado.</p>',
  ARRAY['evento', 'fechado', 'festa', 'privado'],
  1,
  true
),
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo Eventos' LIMIT 1),
  'Reservas',
  '<h3>Reservas de Mesas e Áreas</h3>

<h4>Reservas Especiais (VIP):</h4>
<ul>
  <li>Espaços exclusivos</li>
  <li>Consumação mínima</li>
  <li>Horários específicos</li>
</ul>

<h4>Reservas Normais:</h4>
<ul>
  <li>Mesas regulares</li>
  <li>Controle de disponibilidade</li>
  <li>Lista de espera</li>
</ul>',
  ARRAY['reserva', 'mesa', 'vip', 'área'],
  2,
  true
)
ON CONFLICT DO NOTHING;

-- Inserir Tópicos do Módulo Ocorrências
INSERT INTO manual_topicos (categoria_id, titulo, conteudo, tags, ordem, ativo) VALUES
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo Ocorrências' LIMIT 1),
  'Registro de Ocorrências',
  '<h3>Livro de Registros</h3>

<h4>Como Registrar:</h4>
<ol>
  <li>Acesse <strong>Ocorrências</strong></li>
  <li>Clique em <strong>+ Nova Ocorrência</strong></li>
  <li>Selecione data, setor e tipo</li>
  <li>Classifique gravidade e status</li>
  <li>Descreva detalhadamente</li>
  <li>Adicione envolvidos e ações</li>
  <li>Salve</li>
</ol>

<h4>Importância:</h4>
<ul>
  <li>Rastreabilidade de eventos</li>
  <li>Identificação de padrões</li>
  <li>Defesa legal</li>
  <li>Base para decisões</li>
</ul>',
  ARRAY['ocorrência', 'registro', 'livro', 'incidente'],
  1,
  true
),
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo Ocorrências' LIMIT 1),
  'Tipos de Ocorrências',
  '<h3>Categorias de Registro</h3>

<h4>Com Clientes:</h4>
<ul>
  <li>Reclamações e elogios</li>
  <li>Incidentes</li>
  <li>Solicitações especiais</li>
</ul>

<h4>Com Funcionários:</h4>
<ul>
  <li>Conflitos e destaques</li>
  <li>Problemas de conduta</li>
  <li>Sugestões</li>
</ul>

<h4>Operacionais:</h4>
<ul>
  <li>Falhas de equipamento</li>
  <li>Falta de insumos</li>
  <li>Melhorias necessárias</li>
</ul>',
  ARRAY['tipo', 'categoria', 'classificação'],
  2,
  true
)
ON CONFLICT DO NOTHING;

-- Inserir Tópicos do Módulo Solicitações
INSERT INTO manual_topicos (categoria_id, titulo, conteudo, tags, ordem, ativo) VALUES
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo Solicitações' LIMIT 1),
  'Criar Solicitações',
  '<h3>Sistema de Workflow</h3>

<h4>Como Criar:</h4>
<ol>
  <li>Clique em <strong>+ Nova Solicitação</strong></li>
  <li>Selecione o tipo</li>
  <li>Preencha descrição e valor</li>
  <li>Justifique a necessidade</li>
  <li>Anexe comprovantes</li>
  <li>Selecione aprovador</li>
  <li>Envie</li>
</ol>

<h4>Status:</h4>
<p>Pendente → Aprovada/Recusada → Concluída</p>',
  ARRAY['solicitação', 'criar', 'workflow'],
  1,
  true
),
(
  (SELECT id FROM manual_categorias WHERE nome = 'Módulo Solicitações' LIMIT 1),
  'Aprovar Solicitações',
  '<h3>Processo de Aprovação</h3>

<h4>Como Aprovar:</h4>
<ol>
  <li>Acesse <strong>Aguardando Aprovação</strong></li>
  <li>Revise detalhes completos</li>
  <li>Verifique documentos</li>
  <li>Aprove, Recuse ou Solicite Informações</li>
  <li>Adicione comentários</li>
  <li>Confirme</li>
</ol>

<h4>Responsabilidades:</h4>
<ul>
  <li>Análise criteriosa</li>
  <li>Resposta em tempo hábil</li>
  <li>Alinhamento com políticas</li>
</ul>',
  ARRAY['aprovar', 'aprovação', 'autorização'],
  2,
  true
)
ON CONFLICT DO NOTHING;

-- Inserir Tópicos das Dicas
INSERT INTO manual_topicos (categoria_id, titulo, conteudo, tags, ordem, ativo) VALUES
(
  (SELECT id FROM manual_categorias WHERE nome = 'Dicas e Boas Práticas' LIMIT 1),
  'Dicas Financeiras',
  '<h3>Melhores Práticas</h3>

<h4>Fluxo de Caixa:</h4>
<ul>
  <li>Registre diariamente</li>
  <li>Sempre anexe comprovantes</li>
  <li>Classifique corretamente</li>
  <li>Reconcilie com banco</li>
</ul>

<h4>Análises:</h4>
<ul>
  <li>DRE mensal</li>
  <li>Fluxo de caixa semanal</li>
  <li>Compare períodos</li>
  <li>Identifique tendências</li>
</ul>',
  ARRAY['dicas', 'financeiro', 'boas práticas'],
  1,
  true
),
(
  (SELECT id FROM manual_categorias WHERE nome = 'Dicas e Boas Práticas' LIMIT 1),
  'Dicas de Estoque',
  '<h3>Gestão Eficiente</h3>

<h4>Controle:</h4>
<ul>
  <li>Inventários mensais</li>
  <li>Ajuste divergências imediatamente</li>
  <li>Mantenha mínimos atualizados</li>
  <li>PEPS - Primeiro que Entra, Primeiro que Sai</li>
</ul>

<h4>Compras:</h4>
<ul>
  <li>Monitore giro</li>
  <li>Negocie com fornecedores</li>
  <li>Planeje com antecedência</li>
</ul>',
  ARRAY['dicas', 'estoque', 'controle'],
  2,
  true
),
(
  (SELECT id FROM manual_categorias WHERE nome = 'Dicas e Boas Práticas' LIMIT 1),
  'Dicas de RH',
  '<h3>Gestão de Pessoas</h3>

<h4>Documentação:</h4>
<ul>
  <li>Digitalize tudo</li>
  <li>Atualize regularmente</li>
  <li>Registre ocorrências</li>
  <li>Cumpra prazos legais</li>
</ul>

<h4>Comunicação:</h4>
<ul>
  <li>Seja claro e objetivo</li>
  <li>Mantenha canal aberto</li>
  <li>Dê feedback construtivo</li>
</ul>',
  ARRAY['dicas', 'rh', 'pessoas'],
  3,
  true
),
(
  (SELECT id FROM manual_categorias WHERE nome = 'Dicas e Boas Práticas' LIMIT 1),
  'Segurança',
  '<h3>Proteja Seus Dados</h3>

<h4>Senhas:</h4>
<ul>
  <li>Use senhas fortes</li>
  <li>Não compartilhe</li>
  <li>Altere periodicamente</li>
</ul>

<h4>Acesso:</h4>
<ul>
  <li>Faça logout ao sair</li>
  <li>Não deixe sessão aberta</li>
  <li>Use permissões adequadas</li>
</ul>',
  ARRAY['segurança', 'senha', 'acesso'],
  4,
  true
)
ON CONFLICT DO NOTHING;
