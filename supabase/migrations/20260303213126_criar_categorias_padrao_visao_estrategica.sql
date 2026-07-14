/*
  # Criar categorias padrão para Visão Estratégica
  
  ## Descrição
  Cria as categorias padrão de despesas com porcentagens configuráveis
  
  ## Categorias Padrão
  - Recursos Humanos (folha de pagamento)
  - Operações (despesas operacionais)
  - Marketing
  - Fundo de Reserva (para débitos vencidos)
  - Outras Despesas
  
  ## Características
  - Cada categoria tem uma porcentagem padrão do faturamento
  - As porcentagens podem ser editadas posteriormente
  - O fundo de reserva é uma categoria especial para provisionar débitos vencidos
*/

-- Inserir categorias padrão
INSERT INTO visao_estrategica_categorias (id, nome, percentual, cor, ordem) VALUES
  ('rh', 'Recursos Humanos', 35.0, '#3b82f6', 1),
  ('operacoes', 'Operações', 30.0, '#10b981', 2),
  ('marketing', 'Marketing', 10.0, '#8b5cf6', 3),
  ('fundo_reserva', 'Fundo de Reserva', 5.0, '#f59e0b', 4),
  ('outras', 'Outras Despesas', 10.0, '#6b7280', 5)
ON CONFLICT (id) DO NOTHING;

-- Inserir subcategorias exemplo para RH
INSERT INTO visao_estrategica_subcategorias (id, categoria_id, nome, percentual) VALUES
  ('rh_folha', 'rh', 'Folha de Pagamento', 70.0),
  ('rh_encargos', 'rh', 'Encargos e Benefícios', 20.0),
  ('rh_treinamento', 'rh', 'Treinamento', 10.0)
ON CONFLICT (id) DO NOTHING;

-- Inserir subcategorias exemplo para Operações
INSERT INTO visao_estrategica_subcategorias (id, categoria_id, nome, percentual) VALUES
  ('op_aluguel', 'operacoes', 'Aluguel e Condomínio', 30.0),
  ('op_fornecedores', 'operacoes', 'Fornecedores', 40.0),
  ('op_utilidades', 'operacoes', 'Utilidades (água, luz, internet)', 20.0),
  ('op_manutencao', 'operacoes', 'Manutenção', 10.0)
ON CONFLICT (id) DO NOTHING;

-- Inserir subcategorias exemplo para Marketing
INSERT INTO visao_estrategica_subcategorias (id, categoria_id, nome, percentual) VALUES
  ('mkt_digital', 'marketing', 'Marketing Digital', 60.0),
  ('mkt_eventos', 'marketing', 'Eventos e Promoções', 30.0),
  ('mkt_material', 'marketing', 'Material Gráfico', 10.0)
ON CONFLICT (id) DO NOTHING;