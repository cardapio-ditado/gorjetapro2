/*
  # Professional Chart of Accounts for Bar/Restaurant

  1. Categories Structure
    - Clear existing sample data (children first, then parents)
    - Add comprehensive chart of accounts with hierarchy
    - Include proper ordering for DRE presentation

  2. Main Categories
    - Receitas Operacionais (Operating Revenue)
    - Outras Receitas (Other Revenue)
    - Despesas Fixas (Fixed Expenses)
    - Despesas Variáveis (Variable Expenses)
    - Pessoal (Personnel)
    - Operacional (Operational)
    - Outras Despesas (Other Expenses)

  3. Subcategories
    - Each main category has relevant subcategories
    - Proper ordering for professional presentation
*/

-- Clear existing sample data - delete children first to avoid foreign key constraint violations
DELETE FROM categorias_financeiras WHERE categoria_pai_id IS NOT NULL AND nome IN (
  'Venda Balcão', 'Delivery', 'Eventos Privados', 'Taxa de Serviço', 'Couvert',
  'Aluguel', 'Salários', 'Seguros', 'Contabilidade',
  'Fornecedores', 'Comissões', 'Energia Elétrica', 'Água', 'Telefone/Internet',
  'Material de Escritório', 'Marketing', 'Manutenção', 'Taxas Bancárias'
);

-- Then delete parent categories
DELETE FROM categorias_financeiras WHERE categoria_pai_id IS NULL AND nome IN (
  'Vendas', 'Serviços', 'Outras Receitas', 
  'Despesas Fixas', 'Despesas Variáveis', 'Despesas Administrativas',
  'Venda Direta', 'Eventos', 'Utilities'
);

-- Receitas Operacionais
INSERT INTO categorias_financeiras (id, nome, tipo, status, ordem) VALUES
(gen_random_uuid(), 'Receitas Operacionais', 'receita', 'ativo', 1);

-- Subcategorias de Receitas Operacionais
WITH pai AS (
  SELECT id FROM categorias_financeiras WHERE nome = 'Receitas Operacionais' AND categoria_pai_id IS NULL
)
INSERT INTO categorias_financeiras (id, nome, tipo, categoria_pai_id, status, ordem)
SELECT gen_random_uuid(), nome, 'receita', pai.id, 'ativo', ordem
FROM pai, (VALUES
  ('Vendas no Salão', 1),
  ('Vendas no Delivery', 2),
  ('Eventos e Locações', 3),
  ('Taxa de Serviço', 4),
  ('Couvert Artístico', 5)
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
  ('Receita Financeira', 1),
  ('Multas e Juros Recebidos', 2),
  ('Reembolsos', 3)
) AS sub(nome, ordem);

-- Despesas Fixas
INSERT INTO categorias_financeiras (id, nome, tipo, status, ordem) VALUES
(gen_random_uuid(), 'Despesas Fixas', 'despesa', 'ativo', 1);

-- Subcategorias de Despesas Fixas
WITH pai AS (
  SELECT id FROM categorias_financeiras WHERE nome = 'Despesas Fixas' AND categoria_pai_id IS NULL
)
INSERT INTO categorias_financeiras (id, nome, tipo, categoria_pai_id, status, ordem)
SELECT gen_random_uuid(), nome, 'despesa', pai.id, 'ativo', ordem
FROM pai, (VALUES
  ('Aluguel', 1),
  ('Condomínio', 2),
  ('IPTU', 3),
  ('Internet e Telefonia', 4),
  ('Contabilidade', 5),
  ('Segurança Patrimonial', 6)
) AS sub(nome, ordem);

-- Despesas Variáveis
INSERT INTO categorias_financeiras (id, nome, tipo, status, ordem) VALUES
(gen_random_uuid(), 'Despesas Variáveis', 'despesa', 'ativo', 2);

WITH pai AS (
  SELECT id FROM categorias_financeiras WHERE nome = 'Despesas Variáveis' AND categoria_pai_id IS NULL
)
INSERT INTO categorias_financeiras (id, nome, tipo, categoria_pai_id, status, ordem)
SELECT gen_random_uuid(), nome, 'despesa', pai.id, 'ativo', ordem
FROM pai, (VALUES
  ('Compras de Alimentos', 1),
  ('Compras de Bebidas', 2),
  ('Materiais de Limpeza', 3),
  ('Utensílios e Descartáveis', 4)
) AS sub(nome, ordem);

-- Despesas com Pessoal
INSERT INTO categorias_financeiras (id, nome, tipo, status, ordem) VALUES
(gen_random_uuid(), 'Pessoal', 'despesa', 'ativo', 3);

WITH pai AS (
  SELECT id FROM categorias_financeiras WHERE nome = 'Pessoal' AND categoria_pai_id IS NULL
)
INSERT INTO categorias_financeiras (id, nome, tipo, categoria_pai_id, status, ordem)
SELECT gen_random_uuid(), nome, 'despesa', pai.id, 'ativo', ordem
FROM pai, (VALUES
  ('Salários', 1),
  ('Encargos Sociais', 2),
  ('Comissões', 3),
  ('Freelancers/Extras', 4),
  ('Benefícios', 5),
  ('Uniformes', 6)
) AS sub(nome, ordem);

-- Despesas Operacionais
INSERT INTO categorias_financeiras (id, nome, tipo, status, ordem) VALUES
(gen_random_uuid(), 'Operacional', 'despesa', 'ativo', 4);

WITH pai AS (
  SELECT id FROM categorias_financeiras WHERE nome = 'Operacional' AND categoria_pai_id IS NULL
)
INSERT INTO categorias_financeiras (id, nome, tipo, categoria_pai_id, status, ordem)
SELECT gen_random_uuid(), nome, 'despesa', pai.id, 'ativo', ordem
FROM pai, (VALUES
  ('Energia Elétrica', 1),
  ('Água e Esgoto', 2),
  ('Manutenção e Reparos', 3),
  ('Transporte e Logística', 4),
  ('Marketing e Publicidade', 5),
  ('Licenças e Taxas', 6)
) AS sub(nome, ordem);

-- Outras Despesas
INSERT INTO categorias_financeiras (id, nome, tipo, status, ordem) VALUES
(gen_random_uuid(), 'Outras Despesas', 'despesa', 'ativo', 5);

WITH pai AS (
  SELECT id FROM categorias_financeiras WHERE nome = 'Outras Despesas' AND categoria_pai_id IS NULL
)
INSERT INTO categorias_financeiras (id, nome, tipo, categoria_pai_id, status, ordem)
SELECT gen_random_uuid(), nome, 'despesa', pai.id, 'ativo', ordem
FROM pai, (VALUES
  ('Despesas Financeiras', 1),
  ('Multas e Juros Pagos', 2),
  ('Doações', 3)
) AS sub(nome, ordem);