/*
  # Popular Scorecards do Ditado Popular

  ## Descrição
  Cadastra todos os cargos (scorecards) do Ditado Popular com suas competências,
  indicadores e informações completas para facilitar a abertura de vagas.

  ## Cargos Cadastrados
  1. Auxiliar de Cozinha
  2. Garçom
  3. Auxiliar de Limpeza na Cozinha
  4. Cozinheiro
  5. Barman
  6. Auxiliar de Limpeza
  7. Cumim
  8. Auxiliar de Bar
  9. Atendente
  10. Caixa de PDV
*/

-- Limpar cargos existentes (apenas se necessário)
-- DELETE FROM rh_cargos;

-- =====================================================
-- 1. AUXILIAR DE COZINHA
-- =====================================================
INSERT INTO rh_cargos (nome, descricao, missao, competencias, indicadores, status) VALUES (
  'Auxiliar de Cozinha',
  'Responsável pelo suporte eficiente dos ingredientes, limpeza e organização na cozinha.',
  'Eficiente dos ingredientes, a limpeza e a organização, para contribuir com a oferta de pratos de alta qualidade e reforçar a experiência excepcional dos clientes.',
  '{
    "obrigatorias": [
      "Capacidade de seguir instruções detalhadas de preparação de alimentos e de manutenção dos padrões de higiene",
      "Habilidade para trabalhar em um ambiente de cozinha de ritmo acelerado",
      "Conhecimento básico de técnicas de corte, pré-preparo de ingredientes e manuseio de equipamentos de cozinha"
    ],
    "desejaveis": [
      "Experiência prévia como auxiliar de cozinha em restaurantes ou bares",
      "Interesse em aprender e crescer dentro da área culinária",
      "Conhecimento sobre práticas de segurança alimentar e higiene"
    ],
    "comportamentais": [
      "Atenção aos Detalhes: Mantém um alto padrão de limpeza e organização na cozinha",
      "Agilidade: Capacidade de executar múltiplas tarefas de forma eficiente sob pressão",
      "Trabalho em Equipe: Habilidade para trabalhar cooperativamente com o restante da equipe de cozinha e serviço"
    ]
  }'::jsonb,
  '[
    {"nome": "Eficiência na Preparação", "meta": "Alta", "descricao": "Agilidade e precisão na preparação dos ingredientes conforme solicitado"},
    {"nome": "Limpeza e Organização", "meta": "Excelente", "descricao": "Manutenção de um ambiente de trabalho limpo e organizado"},
    {"nome": "Contribuição para a Satisfação do Cliente", "meta": "Alta", "descricao": "Suporte indireto através da qualidade e rapidez no serviço de cozinha"}
  ]'::jsonb,
  'ativo'
) ON CONFLICT DO NOTHING;

-- =====================================================
-- 2. GARÇOM
-- =====================================================
INSERT INTO rh_cargos (nome, descricao, missao, competencias, indicadores, status) VALUES (
  'Garçom',
  'Atendimento excepcional aos clientes, embreagando seus corações de felicidade.',
  'Embreagando seus corações de felicidade através de um serviço de alta qualidade, respeitoso e proativo.',
  '{
    "obrigatorias": [
      "Proatividade na solução de necessidades dos clientes",
      "Excelente habilidade de comunicação",
      "Capacidade de trabalhar bem em equipe"
    ],
    "desejaveis": [
      "Experiência prévia em bares ou restaurantes de alta movimentação",
      "Conhecimento básico em coquetelaria e culinária brasileira"
    ],
    "comportamentais": [
      "Alegria e Positividade: Manter uma atitude positiva e contagiante",
      "Respeito: Tratamento cordial para com clientes e equipe",
      "Motivação e Engajamento: Energia alta e dedicação ao trabalho"
    ]
  }'::jsonb,
  '[
    {"nome": "Satisfação do Cliente", "meta": "95%+", "descricao": "Medida através de feedback direto e avaliações"},
    {"nome": "Eficiência no Serviço", "meta": "Rápido", "descricao": "Tempo de resposta para pedidos e resolução de questões"},
    {"nome": "Contribuição para a Equipe", "meta": "Alta", "descricao": "Capacidade de trabalhar harmoniosamente e apoiar colegas"}
  ]'::jsonb,
  'ativo'
) ON CONFLICT DO NOTHING;

-- =====================================================
-- 3. AUXILIAR DE LIMPEZA NA COZINHA
-- =====================================================
INSERT INTO rh_cargos (nome, descricao, missao, competencias, indicadores, status) VALUES (
  'Auxiliar de Limpeza na Cozinha',
  'Manutenção da higiene e organização da cozinha, operação da lava-louças.',
  'Apoiando a equipe de cozinha para proporcionar uma experiência excepcional aos clientes, de acordo com a missão do Ditado Popular de embreagar os corações com felicidade.',
  '{
    "obrigatorias": [
      "Habilidade para realizar tarefas de limpeza profundas e manutenção regular da cozinha, incluindo equipamentos e áreas de preparo",
      "Conhecimento sobre os padrões de higiene e segurança alimentar",
      "Capacidade de manusear corretamente a lava-louças, incluindo carregar, operar e manter o equipamento",
      "Capacidade de organizar e gerenciar eficientemente o tempo para cumprir todas as tarefas de limpeza programadas"
    ],
    "desejaveis": [
      "Experiência anterior em limpeza em cozinhas de restaurantes, bares ou similares",
      "Familiaridade com o manuseio e a diluição correta de produtos de limpeza",
      "Disponibilidade para trabalhar em turnos, incluindo noites e fins de semana"
    ],
    "comportamentais": [
      "Atenção aos Detalhes: Foco excepcional na limpeza e organização, garantindo um ambiente de trabalho seguro e higienizado",
      "Iniciativa: Capacidade de identificar áreas que necessitam de atenção extra e agir de forma proativa",
      "Resiliência: Habilidade para manter a positividade e a eficiência sob pressão"
    ]
  }'::jsonb,
  '[
    {"nome": "Níveis de Higiene", "meta": "100%", "descricao": "Manutenção dos padrões de limpeza e higiene conforme regulamentações de saúde"},
    {"nome": "Eficiência na Limpeza", "meta": "Alta", "descricao": "Completar tarefas de limpeza dentro dos prazos estabelecidos"},
    {"nome": "Eficiência no Uso da Lava-Louças", "meta": "Ótima", "descricao": "Maximizar capacidade do equipamento, garantindo louças prontas para uso"}
  ]'::jsonb,
  'ativo'
) ON CONFLICT DO NOTHING;

-- =====================================================
-- 4. COZINHEIRO
-- =====================================================
INSERT INTO rh_cargos (nome, descricao, missao, competencias, indicadores, status) VALUES (
  'Cozinheiro',
  'Preparação de pratos de alta qualidade, mantendo eficiência na cozinha.',
  'Clientes, mantendo a eficiência na cozinha e contribuindo para a missão do bar de embreagar os corações de felicidade através da gastronomia.',
  '{
    "obrigatorias": [
      "Experiência comprovada na preparação de uma ampla variedade de pratos, com ênfase na culinária brasileira e petiscos",
      "Habilidade para trabalhar em um ambiente de cozinha de ritmo acelerado, mantendo padrões de qualidade",
      "Conhecimento em normas de segurança alimentar e higiene"
    ],
    "desejaveis": [
      "Formação em Gastronomia ou cursos relacionados",
      "Experiência em criação e inovação de pratos, contribuindo para a atualização do menu",
      "Capacidade de gerenciar estoques de ingredientes, minimizando desperdícios"
    ],
    "comportamentais": [
      "Atenção aos Detalhes: Foco na qualidade e apresentação dos pratos",
      "Criatividade: Aptidão para inovar e experimentar novos pratos e combinações",
      "Trabalho em Equipe: Habilidade para colaborar com outros membros garantindo experiência satisfatória"
    ]
  }'::jsonb,
  '[
    {"nome": "Satisfação do Cliente", "meta": "95%+", "descricao": "Feedback positivo sobre a qualidade e sabor dos pratos"},
    {"nome": "Eficiência na Cozinha", "meta": "Alta", "descricao": "Capacidade de preparar pratos dentro dos tempos estipulados mantendo qualidade"},
    {"nome": "Inovação no Menu", "meta": "Mensal", "descricao": "Contribuição para o desenvolvimento de novos pratos e melhorias no menu"}
  ]'::jsonb,
  'ativo'
) ON CONFLICT DO NOTHING;

-- =====================================================
-- 5. BARMAN
-- =====================================================
INSERT INTO rh_cargos (nome, descricao, missao, competencias, indicadores, status) VALUES (
  'Barman',
  'Preparação de bebidas excepcionais com qualidade e criatividade.',
  'E tradicionais com qualidade, rapidez e um serviço amigável, contribuindo para a atmosfera única e alegre do Ditado Popular.',
  '{
    "obrigatorias": [
      "Domínio na preparação de uma ampla gama de bebidas, incluindo coquetéis clássicos e criações próprias",
      "Conhecimento sobre vinhos, cervejas e destilados, podendo fazer recomendações aos clientes",
      "Habilidade para manter o bar organizado, limpo e bem abastecido"
    ],
    "desejaveis": [
      "Curso de barman ou mixologia",
      "Experiência anterior em bares de alta movimentação",
      "Capacidade de criar novas bebidas, alinhadas com as tendências do mercado e preferências dos clientes"
    ],
    "comportamentais": [
      "Criatividade e Inovação: Capacidade de inovar e surpreender os clientes com novas bebidas",
      "Comunicação Eficaz: Habilidade para se comunicar de forma clara e amigável",
      "Trabalho em Equipe: Colaboração com o resto da equipe para garantir serviço ágil e de qualidade"
    ]
  }'::jsonb,
  '[
    {"nome": "Satisfação do Cliente", "meta": "95%+", "descricao": "Feedback positivo sobre a qualidade e originalidade das bebidas"},
    {"nome": "Eficiência Operacional", "meta": "Alta", "descricao": "Rapidez e precisão na preparação de pedidos, mesmo em alta demanda"},
    {"nome": "Inovação", "meta": "Trimestral", "descricao": "Número de novas bebidas introduzidas e aceitas pelos clientes"}
  ]'::jsonb,
  'ativo'
) ON CONFLICT DO NOTHING;

-- =====================================================
-- 6. AUXILIAR DE LIMPEZA
-- =====================================================
INSERT INTO rh_cargos (nome, descricao, missao, competencias, indicadores, status) VALUES (
  'Auxiliar de Limpeza',
  'Manutenção da limpeza e organização de todo o ambiente do bar.',
  'Organizado, contribuindo para uma experiência acolhedora e agradável para os clientes, alinhada à missão de embreagar os corações de felicidade.',
  '{
    "obrigatorias": [
      "Habilidade para realizar tarefas de limpeza e organização com eficiência e atenção aos detalhes",
      "Conhecimento sobre o uso adequado de produtos de limpeza e equipamentos",
      "Capacidade de seguir rotinas de limpeza e manutenção estabelecidas, mantendo padrões elevados de higiene"
    ],
    "desejaveis": [
      "Experiência prévia em limpeza comercial, especialmente em bares, restaurantes ou ambientes similares",
      "Familiaridade com regulamentos de saúde e segurança no trabalho"
    ],
    "comportamentais": [
      "Iniciativa e Proatividade: Capacidade de identificar áreas que necessitam de atenção e agir autonomamente",
      "Organização: Manter ferramentas e produtos de limpeza organizados",
      "Discrição e Respeito: Conduzir atividades minimizando interrupções ao ambiente"
    ]
  }'::jsonb,
  '[
    {"nome": "Nível de Limpeza e Organização", "meta": "Excelente", "descricao": "Avaliações regulares da limpeza dos ambientes do bar"},
    {"nome": "Cumprimento das Rotinas", "meta": "100%", "descricao": "Adesão aos cronogramas de limpeza estabelecidos"},
    {"nome": "Feedback Positivo", "meta": "95%+", "descricao": "Comentários positivos sobre limpeza e manutenção"}
  ]'::jsonb,
  'ativo'
) ON CONFLICT DO NOTHING;

-- =====================================================
-- 7. CUMIM
-- =====================================================
INSERT INTO rh_cargos (nome, descricao, missao, competencias, indicadores, status) VALUES (
  'Cumim',
  'Apoio aos garçons e atendimento inicial aos clientes.',
  'Garantindo que os clientes tenham uma experiência memorável e acolhedora, contribuindo para a missão do bar de embreagar os corações de felicidade.',
  '{
    "obrigatorias": [
      "Capacidade de trabalhar em equipe e seguir instruções dos garçons para garantir um serviço eficiente",
      "Boa comunicação e habilidade para interagir positivamente com os clientes",
      "Agilidade e eficiência na execução de tarefas, como servir água, pão, e retirar pratos da mesa"
    ],
    "desejaveis": [
      "Experiência anterior em funções de apoio em restaurantes ou bares",
      "Conhecimento básico sobre o menu e bebidas oferecidas para auxiliar os clientes em dúvidas simples"
    ],
    "comportamentais": [
      "Atitude Positiva: Manter uma postura entusiasmada e uma expressão amigável, mesmo sob pressão",
      "Proatividade: Capacidade de antecipar necessidades dos clientes e dos garçons",
      "Atenção aos Detalhes: Cuidado ao arrumar as mesas e manter a área limpa e organizada"
    ]
  }'::jsonb,
  '[
    {"nome": "Satisfação do Cliente", "meta": "95%+", "descricao": "Feedback positivo sobre a assistência recebida"},
    {"nome": "Eficiência no Serviço", "meta": "Alta", "descricao": "Tempo de resposta e agilidade no apoio"},
    {"nome": "Ordem e Limpeza", "meta": "Excelente", "descricao": "Manutenção da limpeza das mesas e ambiente"}
  ]'::jsonb,
  'ativo'
) ON CONFLICT DO NOTHING;

-- =====================================================
-- 8. AUXILIAR DE BAR
-- =====================================================
INSERT INTO rh_cargos (nome, descricao, missao, competencias, indicadores, status) VALUES (
  'Auxiliar de Bar',
  'Suporte ao barman na preparação de bebidas e organização do bar.',
  'Garantindo um ambiente limpo, organizado e eficiente, para proporcionar uma experiência excepcional aos clientes.',
  '{
    "obrigatorias": [
      "Habilidade para seguir instruções na preparação de bebidas básicas e na organização do bar",
      "Capacidade de trabalhar em ritmo acelerado, mantendo a organização e limpeza do ambiente",
      "Conhecimento básico sobre os diferentes tipos de bebidas e utensílios de bar"
    ],
    "desejaveis": [
      "Experiência prévia em posições de apoio em bares ou restaurantes",
      "Interesse em aprender sobre mixologia e evoluir na carreira de bar"
    ],
    "comportamentais": [
      "Atenção aos Detalhes: Assegurar que todas as bebidas e o ambiente do bar mantenham alto padrão",
      "Proatividade: Identificar necessidades de reabastecimento ou limpeza antes de ser solicitado",
      "Trabalho em Equipe: Trabalhar harmoniosamente com o barman e equipe"
    ]
  }'::jsonb,
  '[
    {"nome": "Eficiência na Preparação", "meta": "Alta", "descricao": "Tempo e precisão na preparação e suporte ao barman"},
    {"nome": "Manutenção do Bar", "meta": "Excelente", "descricao": "Nível de organização, limpeza e reabastecimento"},
    {"nome": "Satisfação do Cliente", "meta": "95%+", "descricao": "Contribuição para experiência positiva através do suporte"}
  ]'::jsonb,
  'ativo'
) ON CONFLICT DO NOTHING;

-- =====================================================
-- 9. ATENDENTE
-- =====================================================
INSERT INTO rh_cargos (nome, descricao, missao, competencias, indicadores, status) VALUES (
  'Atendente',
  'Fechamento de contas e atendimento final aos clientes.',
  'Agradável para os clientes, reforçando a percepção de excelência em serviço e hospitalidade do Ditado Popular.',
  '{
    "obrigatorias": [
      "Precisão nos detalhes ao preparar e apresentar a conta",
      "Excelente habilidade de comunicação e interação com o cliente",
      "Capacidade de resolver dúvidas e problemas relacionados à conta de forma satisfatória"
    ],
    "desejaveis": [
      "Experiência com sistemas de ponto de venda (PDV) e processamento de pagamentos",
      "Conhecimento em técnicas de vendas para sugestão de itens adicionais ou serviços"
    ],
    "comportamentais": [
      "Profissionalismo e Discrição: Manter postura profissional garantindo privacidade durante cobrança",
      "Paciência e Empatia: Lidar com situações delicadas ou clientes insatisfeitos de forma calma",
      "Atenção aos Detalhes: Verificar precisão das contas e satisfação do cliente"
    ]
  }'::jsonb,
  '[
    {"nome": "Precisão na Conta", "meta": "99%+", "descricao": "Erros mínimos em contas e cobranças"},
    {"nome": "Satisfação no Pagamento", "meta": "95%+", "descricao": "Avaliações positivas do processo de fechamento"},
    {"nome": "Eficiência no Fechamento", "meta": "Rápido", "descricao": "Tempo médio para conclusão do processo de pagamento"}
  ]'::jsonb,
  'ativo'
) ON CONFLICT DO NOTHING;

-- =====================================================
-- 10. CAIXA DE PDV
-- =====================================================
INSERT INTO rh_cargos (nome, descricao, missao, competencias, indicadores, status) VALUES (
  'Caixa de PDV',
  'Operação do caixa e processamento de transações financeiras.',
  'Amigável, reforçando a excelência no serviço e na experiência do cliente no Ditado Popular.',
  '{
    "obrigatorias": [
      "Habilidade com sistemas de ponto de venda (PDV) e processamento rápido de transações",
      "Capacidade de gerenciar transações financeiras com precisão e integridade",
      "Bom conhecimento de matemática básica e habilidades de contabilidade"
    ],
    "desejaveis": [
      "Experiência prévia em cargos de caixa, especialmente em ambientes de alta demanda",
      "Familiaridade com princípios de atendimento ao cliente e resolução de conflitos"
    ],
    "comportamentais": [
      "Atenção aos Detalhes: Garantir precisão nas transações e no troco fornecido",
      "Paciência e Compostura: Manter a calma sob pressão, especialmente em picos de atividade",
      "Comunicação Eficiente: Comunicar-se claramente e de maneira amigável com clientes"
    ]
  }'::jsonb,
  '[
    {"nome": "Precisão nas Transações", "meta": "99%+", "descricao": "Erros mínimos em caixa e fechamento diários"},
    {"nome": "Satisfação do Cliente", "meta": "95%+", "descricao": "Feedback positivo sobre interação e eficiência no caixa"},
    {"nome": "Tempo de Atendimento", "meta": "Rápido", "descricao": "Manter fluxo eficiente minimizando tempo de espera"}
  ]'::jsonb,
  'ativo'
) ON CONFLICT DO NOTHING;
