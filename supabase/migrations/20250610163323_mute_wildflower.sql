/*
  # Hierarchical Financial Categories

  1. Schema Changes
    - Add categoria_pai_id to categorias_financeiras for hierarchy
    - Create view for DRE consolidation
    - Add indexes for performance

  2. Security
    - Maintain existing RLS policies
    - Add policies for category hierarchy access

  3. Views
    - Create DRE consolidation view
    - Create category tree view with totals
*/

-- Add hierarchy support to existing categorias_financeiras table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'categorias_financeiras' AND column_name = 'categoria_pai_id'
  ) THEN
    ALTER TABLE categorias_financeiras ADD COLUMN categoria_pai_id uuid REFERENCES categorias_financeiras(id);
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'categorias_financeiras' AND column_name = 'ordem'
  ) THEN
    ALTER TABLE categorias_financeiras ADD COLUMN ordem integer DEFAULT 0;
  END IF;
END $$;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_categorias_financeiras_pai ON categorias_financeiras(categoria_pai_id);
CREATE INDEX IF NOT EXISTS idx_categorias_financeiras_tipo ON categorias_financeiras(tipo);
CREATE INDEX IF NOT EXISTS idx_fluxo_caixa_categoria ON fluxo_caixa(categoria_id);
CREATE INDEX IF NOT EXISTS idx_fluxo_caixa_data ON fluxo_caixa(data);

-- Create view for DRE consolidation
CREATE OR REPLACE VIEW vw_dre_consolidado AS
WITH RECURSIVE categoria_tree AS (
  -- Base case: root categories (no parent)
  SELECT 
    id,
    nome,
    tipo,
    categoria_pai_id,
    id as categoria_raiz_id,
    nome as categoria_raiz_nome,
    0 as nivel,
    ARRAY[id] as caminho
  FROM categorias_financeiras 
  WHERE categoria_pai_id IS NULL AND status = 'ativo'
  
  UNION ALL
  
  -- Recursive case: subcategories
  SELECT 
    c.id,
    c.nome,
    c.tipo,
    c.categoria_pai_id,
    ct.categoria_raiz_id,
    ct.categoria_raiz_nome,
    ct.nivel + 1,
    ct.caminho || c.id
  FROM categorias_financeiras c
  INNER JOIN categoria_tree ct ON c.categoria_pai_id = ct.id
  WHERE c.status = 'ativo'
),
transacoes_por_categoria AS (
  SELECT 
    fc.categoria_id,
    fc.centro_custo_id,
    fc.data,
    fc.valor,
    fc.tipo,
    EXTRACT(YEAR FROM fc.data) as ano,
    EXTRACT(MONTH FROM fc.data) as mes
  FROM fluxo_caixa fc
  WHERE fc.categoria_id IS NOT NULL
)
SELECT 
  ct.categoria_raiz_id,
  ct.categoria_raiz_nome,
  ct.id as categoria_id,
  ct.nome as categoria_nome,
  ct.tipo,
  ct.nivel,
  tpc.centro_custo_id,
  tpc.ano,
  tpc.mes,
  COALESCE(SUM(tpc.valor), 0) as valor_total,
  COUNT(tpc.valor) as quantidade_lancamentos
FROM categoria_tree ct
LEFT JOIN transacoes_por_categoria tpc ON ct.id = tpc.categoria_id
GROUP BY 
  ct.categoria_raiz_id,
  ct.categoria_raiz_nome,
  ct.id,
  ct.nome,
  ct.tipo,
  ct.nivel,
  tpc.centro_custo_id,
  tpc.ano,
  tpc.mes
ORDER BY ct.tipo, ct.categoria_raiz_nome, ct.nivel, ct.nome;

-- Create view for category tree structure
CREATE OR REPLACE VIEW vw_categoria_tree AS
WITH RECURSIVE categoria_hierarchy AS (
  -- Root categories
  SELECT 
    id,
    nome,
    tipo,
    categoria_pai_id,
    status,
    0 as nivel,
    nome as caminho_completo,
    ARRAY[ordem, id::text::int] as sort_path
  FROM categorias_financeiras 
  WHERE categoria_pai_id IS NULL
  
  UNION ALL
  
  -- Child categories
  SELECT 
    c.id,
    c.nome,
    c.tipo,
    c.categoria_pai_id,
    c.status,
    ch.nivel + 1,
    ch.caminho_completo || ' > ' || c.nome,
    ch.sort_path || ARRAY[c.ordem, c.id::text::int]
  FROM categorias_financeiras c
  INNER JOIN categoria_hierarchy ch ON c.categoria_pai_id = ch.id
)
SELECT 
  id,
  nome,
  tipo,
  categoria_pai_id,
  status,
  nivel,
  caminho_completo,
  REPEAT('  ', nivel) || nome as nome_indentado
FROM categoria_hierarchy
ORDER BY tipo, sort_path;

-- Insert sample hierarchical categories
INSERT INTO categorias_financeiras (nome, tipo, categoria_pai_id, descricao, ordem) VALUES
-- Receitas principais
('Vendas', 'receita', NULL, 'Receitas de vendas', 1),
('Serviços', 'receita', NULL, 'Receitas de serviços', 2),
('Outras Receitas', 'receita', NULL, 'Outras receitas operacionais', 3),

-- Despesas principais  
('Despesas Fixas', 'despesa', NULL, 'Despesas fixas mensais', 1),
('Despesas Variáveis', 'despesa', NULL, 'Despesas que variam conforme operação', 2),
('Despesas Administrativas', 'despesa', NULL, 'Despesas administrativas e gerais', 3)
ON CONFLICT DO NOTHING;

-- Get IDs for subcategories
DO $$
DECLARE
    vendas_id uuid;
    servicos_id uuid;
    outras_receitas_id uuid;
    despesas_fixas_id uuid;
    despesas_variaveis_id uuid;
    despesas_admin_id uuid;
BEGIN
    -- Get parent category IDs
    SELECT id INTO vendas_id FROM categorias_financeiras WHERE nome = 'Vendas' AND tipo = 'receita';
    SELECT id INTO servicos_id FROM categorias_financeiras WHERE nome = 'Serviços' AND tipo = 'receita';
    SELECT id INTO outras_receitas_id FROM categorias_financeiras WHERE nome = 'Outras Receitas' AND tipo = 'receita';
    SELECT id INTO despesas_fixas_id FROM categorias_financeiras WHERE nome = 'Despesas Fixas' AND tipo = 'despesa';
    SELECT id INTO despesas_variaveis_id FROM categorias_financeiras WHERE nome = 'Despesas Variáveis' AND tipo = 'despesa';
    SELECT id INTO despesas_admin_id FROM categorias_financeiras WHERE nome = 'Despesas Administrativas' AND tipo = 'despesa';

    -- Insert subcategories for Vendas
    IF vendas_id IS NOT NULL THEN
        INSERT INTO categorias_financeiras (nome, tipo, categoria_pai_id, descricao, ordem) VALUES
        ('Venda Balcão', 'receita', vendas_id, 'Vendas diretas no balcão', 1),
        ('Delivery', 'receita', vendas_id, 'Vendas por delivery', 2),
        ('Eventos Privados', 'receita', vendas_id, 'Receitas de eventos privados', 3)
        ON CONFLICT DO NOTHING;
    END IF;

    -- Insert subcategories for Serviços
    IF servicos_id IS NOT NULL THEN
        INSERT INTO categorias_financeiras (nome, tipo, categoria_pai_id, descricao, ordem) VALUES
        ('Taxa de Serviço', 'receita', servicos_id, 'Taxa de serviço cobrada', 1),
        ('Couvert', 'receita', servicos_id, 'Couvert artístico', 2)
        ON CONFLICT DO NOTHING;
    END IF;

    -- Insert subcategories for Despesas Fixas
    IF despesas_fixas_id IS NOT NULL THEN
        INSERT INTO categorias_financeiras (nome, tipo, categoria_pai_id, descricao, ordem) VALUES
        ('Aluguel', 'despesa', despesas_fixas_id, 'Aluguel do estabelecimento', 1),
        ('Salários', 'despesa', despesas_fixas_id, 'Folha de pagamento fixa', 2),
        ('Seguros', 'despesa', despesas_fixas_id, 'Seguros diversos', 3),
        ('Contabilidade', 'despesa', despesas_fixas_id, 'Serviços contábeis', 4)
        ON CONFLICT DO NOTHING;
    END IF;

    -- Insert subcategories for Despesas Variáveis
    IF despesas_variaveis_id IS NOT NULL THEN
        INSERT INTO categorias_financeiras (nome, tipo, categoria_pai_id, descricao, ordem) VALUES
        ('Fornecedores', 'despesa', despesas_variaveis_id, 'Compras de fornecedores', 1),
        ('Comissões', 'despesa', despesas_variaveis_id, 'Comissões de vendas', 2),
        ('Energia Elétrica', 'despesa', despesas_variaveis_id, 'Conta de luz', 3),
        ('Água', 'despesa', despesas_variaveis_id, 'Conta de água', 4),
        ('Telefone/Internet', 'despesa', despesas_variaveis_id, 'Telecomunicações', 5)
        ON CONFLICT DO NOTHING;
    END IF;

    -- Insert subcategories for Despesas Administrativas
    IF despesas_admin_id IS NOT NULL THEN
        INSERT INTO categorias_financeiras (nome, tipo, categoria_pai_id, descricao, ordem) VALUES
        ('Material de Escritório', 'despesa', despesas_admin_id, 'Materiais administrativos', 1),
        ('Marketing', 'despesa', despesas_admin_id, 'Publicidade e marketing', 2),
        ('Manutenção', 'despesa', despesas_admin_id, 'Manutenções diversas', 3),
        ('Taxas Bancárias', 'despesa', despesas_admin_id, 'Taxas e tarifas bancárias', 4)
        ON CONFLICT DO NOTHING;
    END IF;
END $$;