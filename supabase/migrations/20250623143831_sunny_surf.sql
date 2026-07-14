/*
  # Optimized Chart of Accounts for Bars and Nightclubs
  
  1. Clear existing categories
    - Delete child categories first to avoid foreign key constraints
    - Delete parent categories after
  
  2. Create new optimized structure
    - CMV (Cost of Goods Sold) categories for food and beverages
    - Staff and personnel expenses
    - Artists and entertainment expenses
    - Fixed expenses
    - Operational and utilities
    - Revenue categories
    - Other income and expenses
  
  This structure is specifically designed for bars and nightclubs with focus on:
  - CMV control and analysis
  - Entertainment and artist management
  - Operational efficiency tracking
*/

-- Clear existing categories - delete children first to avoid foreign key constraint violations
DELETE FROM categorias_financeiras WHERE categoria_pai_id IS NOT NULL;

-- Then delete parent categories
DELETE FROM categorias_financeiras WHERE categoria_pai_id IS NULL;

-- CMV - Alimentos
INSERT INTO categorias_financeiras (id, nome, tipo, status, ordem) VALUES
(gen_random_uuid(), 'CMV - Alimentos', 'despesa', 'ativo', 1);

-- Subcategorias de CMV - Alimentos
WITH pai AS (
  SELECT id FROM categorias_financeiras WHERE nome = 'CMV - Alimentos' AND categoria_pai_id IS NULL
)
INSERT INTO categorias_financeiras (id, nome, tipo, categoria_pai_id, status, ordem)
SELECT gen_random_uuid(), nome, 'despesa', pai.id, 'ativo', ordem
FROM pai, (VALUES
  ('Frios e Embutidos', 1),
  ('Hortifruti', 2),
  ('Carnes e Aves', 3),
  ('Peixes e Frutos do Mar', 4),
  ('Grãos e Massas', 5),
  ('Sobremesas e Doces', 6)
) AS sub(nome, ordem);

-- CMV - Bebidas
INSERT INTO categorias_financeiras (id, nome, tipo, status, ordem) VALUES
(gen_random_uuid(), 'CMV - Bebidas', 'despesa', 'ativo', 2);

-- Subcategorias de CMV - Bebidas
WITH pai AS (
  SELECT id FROM categorias_financeiras WHERE nome = 'CMV - Bebidas' AND categoria_pai_id IS NULL
)
INSERT INTO categorias_financeiras (id, nome, tipo, categoria_pai_id, status, ordem)
SELECT gen_random_uuid(), nome, 'despesa', pai.id, 'ativo', ordem
FROM pai, (VALUES
  ('Destilados', 1),
  ('Chopp e Cervejas', 2),
  ('Vinhos', 3),
  ('Refrigerantes e Sucos', 4),
  ('Água Mineral', 5),
  ('Energéticos e Outras Bebidas', 6)
) AS sub(nome, ordem);

-- Equipe e Pessoal
INSERT INTO categorias_financeiras (id, nome, tipo, status, ordem) VALUES
(gen_random_uuid(), 'Equipe e Pessoal', 'despesa', 'ativo', 3);

WITH pai AS (
  SELECT id FROM categorias_financeiras WHERE nome = 'Equipe e Pessoal' AND categoria_pai_id IS NULL
)
INSERT INTO categorias_financeiras (id, nome, tipo, categoria_pai_id, status, ordem)
SELECT gen_random_uuid(), nome, 'despesa', pai.id, 'ativo', ordem
FROM pai, (VALUES
  ('Salários Fixos', 1),
  ('Comissões', 2),
  ('Gorjetas de Garçom', 3),
  ('Extras e Freelancers', 4),
  ('Encargos Trabalhistas', 5),
  ('Uniformes e EPIs', 6)
) AS sub(nome, ordem);

-- Artistas e Eventos
INSERT INTO categorias_financeiras (id, nome, tipo, status, ordem) VALUES
(gen_random_uuid(), 'Artistas e Eventos', 'despesa', 'ativo', 4);

WITH pai AS (
  SELECT id FROM categorias_financeiras WHERE nome = 'Artistas e Eventos' AND categoria_pai_id IS NULL
)
INSERT INTO categorias_financeiras (id, nome, tipo, categoria_pai_id, status, ordem)
SELECT gen_random_uuid(), nome, 'despesa', pai.id, 'ativo', ordem
FROM pai, (VALUES
  ('Cachê de Músicos', 1),
  ('Taxa de Produção de Evento', 2),
  ('Rider Técnico e Equipamentos', 3),
  ('Hospedagem/Transporte de Artistas', 4)
) AS sub(nome, ordem);

-- Despesas Fixas
INSERT INTO categorias_financeiras (id, nome, tipo, status, ordem) VALUES
(gen_random_uuid(), 'Despesas Fixas', 'despesa', 'ativo', 5);

WITH pai AS (
  SELECT id FROM categorias_financeiras WHERE nome = 'Despesas Fixas' AND categoria_pai_id IS NULL
)
INSERT INTO categorias_financeiras (id, nome, tipo, categoria_pai_id, status, ordem)
SELECT gen_random_uuid(), nome, 'despesa', pai.id, 'ativo', ordem
FROM pai, (VALUES
  ('Aluguel', 1),
  ('Condomínio', 2),
  ('IPTU e Licenças', 3),
  ('Contabilidade', 4),
  ('Internet e Comunicação', 5)
) AS sub(nome, ordem);

-- Operacionais e Utilidades
INSERT INTO categorias_financeiras (id, nome, tipo, status, ordem) VALUES
(gen_random_uuid(), 'Operacionais e Utilidades', 'despesa', 'ativo', 6);

WITH pai AS (
  SELECT id FROM categorias_financeiras WHERE nome = 'Operacionais e Utilidades' AND categoria_pai_id IS NULL
)
INSERT INTO categorias_financeiras (id, nome, tipo, categoria_pai_id, status, ordem)
SELECT gen_random_uuid(), nome, 'despesa', pai.id, 'ativo', ordem
FROM pai, (VALUES
  ('Energia Elétrica', 1),
  ('Água e Esgoto', 2),
  ('Materiais de Limpeza', 3),
  ('Manutenção de Equipamentos', 4),
  ('Serviços Terceirizados', 5),
  ('Publicidade e Marketing', 6)
) AS sub(nome, ordem);

-- Outras Despesas
INSERT INTO categorias_financeiras (id, nome, tipo, status, ordem) VALUES
(gen_random_uuid(), 'Outras Despesas', 'despesa', 'ativo', 7);

WITH pai AS (
  SELECT id FROM categorias_financeiras WHERE nome = 'Outras Despesas' AND categoria_pai_id IS NULL
)
INSERT INTO categorias_financeiras (id, nome, tipo, categoria_pai_id, status, ordem)
SELECT gen_random_uuid(), nome, 'despesa', pai.id, 'ativo', ordem
FROM pai, (VALUES
  ('Multas e Juros Pagos', 1),
  ('Perdas e Quebras', 2),
  ('Doações e Patrocínios', 3)
) AS sub(nome, ordem);

-- Receitas Operacionais
INSERT INTO categorias_financeiras (id, nome, tipo, status, ordem) VALUES
(gen_random_uuid(), 'Receitas Operacionais', 'receita', 'ativo', 1);

WITH pai AS (
  SELECT id FROM categorias_financeiras WHERE nome = 'Receitas Operacionais' AND categoria_pai_id IS NULL
)
INSERT INTO categorias_financeiras (id, nome, tipo, categoria_pai_id, status, ordem)
SELECT gen_random_uuid(), nome, 'receita', pai.id, 'ativo', ordem
FROM pai, (VALUES
  ('Vendas de Alimentos', 1),
  ('Vendas de Bebidas', 2),
  ('Taxa de Serviço', 3),
  ('Couvert Artístico', 4),
  ('Locação para Eventos', 5)
) AS sub(nome, ordem);

-- Outras Receitas
INSERT INTO categorias_financeiras (id, nome, tipo, status, ordem) VALUES
(gen_random_uuid(), 'Outras Receitas', 'receita', 'ativo', 2);

WITH pai AS (
  SELECT id FROM categorias_financeiras WHERE nome = 'Outras Receitas' AND categoria_pai_id IS NULL
)
INSERT INTO categorias_financeiras (id, nome, tipo, categoria_pai_id, status, ordem)
SELECT gen_random_uuid(), nome, 'receita', pai.id, 'ativo', ordem
FROM pai, (VALUES
  ('Multas e Juros Recebidos', 1),
  ('Reembolsos Diversos', 2),
  ('Venda de Ativos', 3)
) AS sub(nome, ordem);