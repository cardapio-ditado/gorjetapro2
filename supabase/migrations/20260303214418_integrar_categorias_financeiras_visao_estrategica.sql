/*
  # Integrar Categorias Financeiras com Visão Estratégica
  
  ## Resumo
  Substituir as categorias próprias da Visão Estratégica pelas categorias financeiras
  já cadastradas no sistema, permitindo que o usuário use exatamente as mesmas
  categorias e subcategorias do Plano de Contas.
  
  ## Mudanças
  1. **Nova Tabela**: `visao_estrategica_categorias_config`
     - Vincula categorias_financeiras com percentuais para a Visão Estratégica
     - Permite que apenas categorias DESPESA sejam configuradas
  
  2. **Alterações nas Tabelas Existentes**:
     - `visao_estrategica_despesas`: categoria_id passa a referenciar categorias_financeiras
  
  3. **Dados Migrados**:
     - Preservar despesas existentes migrando categorias antigas para novas
  
  ## Segurança
  - RLS habilitado com acesso para usuários autenticados
*/

-- 1. Criar tabela de configuração de percentuais
CREATE TABLE IF NOT EXISTS visao_estrategica_categorias_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  categoria_financeira_id uuid NOT NULL REFERENCES categorias_financeiras(id) ON DELETE CASCADE,
  percentual numeric NOT NULL CHECK (percentual >= 0 AND percentual <= 100),
  cor text NOT NULL DEFAULT '#3b82f6',
  ordem int DEFAULT 0,
  ativo boolean DEFAULT true,
  criado_em timestamptz DEFAULT NOW(),
  atualizado_em timestamptz DEFAULT NOW(),
  UNIQUE(categoria_financeira_id)
);

CREATE INDEX IF NOT EXISTS idx_ve_cat_config_categoria ON visao_estrategica_categorias_config(categoria_financeira_id);
CREATE INDEX IF NOT EXISTS idx_ve_cat_config_ativo ON visao_estrategica_categorias_config(ativo) WHERE ativo = true;

ALTER TABLE visao_estrategica_categorias_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Permitir leitura config categorias"
  ON visao_estrategica_categorias_config FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Permitir gestão config categorias"
  ON visao_estrategica_categorias_config FOR ALL
  TO authenticated
  USING (true);

-- 2. Alterar tabela de despesas para usar categorias financeiras
-- Adicionar nova coluna
ALTER TABLE visao_estrategica_despesas 
  ADD COLUMN IF NOT EXISTS categoria_financeira_id uuid REFERENCES categorias_financeiras(id);

ALTER TABLE visao_estrategica_despesas 
  ADD COLUMN IF NOT EXISTS subcategoria_financeira_id uuid REFERENCES categorias_financeiras(id);

-- 3. Migrar dados existentes (se houver)
-- Tentar mapear categorias antigas para novas por nome
DO $$
DECLARE
  cat_old RECORD;
  cat_new_id uuid;
BEGIN
  -- Para cada categoria antiga, tentar encontrar correspondente
  FOR cat_old IN 
    SELECT DISTINCT categoria_id, 
           (SELECT nome FROM visao_estrategica_categorias WHERE id = categoria_id LIMIT 1) as nome
    FROM visao_estrategica_despesas 
    WHERE categoria_id IS NOT NULL
  LOOP
    -- Buscar categoria financeira com nome similar
    SELECT id INTO cat_new_id
    FROM categorias_financeiras
    WHERE LOWER(nome) = LOWER(cat_old.nome)
      AND tipo = 'despesa'
      AND status = 'ativo'
    LIMIT 1;
    
    -- Se encontrou, atualizar
    IF cat_new_id IS NOT NULL THEN
      UPDATE visao_estrategica_despesas
      SET categoria_financeira_id = cat_new_id
      WHERE categoria_id = cat_old.categoria_id;
    END IF;
  END LOOP;
END $$;

-- 4. Tornar obrigatório após migração
-- Nota: Comentado para não quebrar dados antigos que não migraram
-- ALTER TABLE visao_estrategica_despesas ALTER COLUMN categoria_financeira_id SET NOT NULL;

-- 5. Criar índices nas novas colunas
CREATE INDEX IF NOT EXISTS idx_ve_despesas_cat_financeira 
  ON visao_estrategica_despesas(categoria_financeira_id);

CREATE INDEX IF NOT EXISTS idx_ve_despesas_subcat_financeira 
  ON visao_estrategica_despesas(subcategoria_financeira_id);

-- 6. Função helper para obter categorias configuradas com suas subcategorias
CREATE OR REPLACE FUNCTION get_categorias_visao_estrategica()
RETURNS TABLE (
  id uuid,
  nome text,
  tipo text,
  percentual numeric,
  cor text,
  ordem integer,
  tem_filhas boolean,
  subcategorias jsonb
) 
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH categorias_principais AS (
    SELECT 
      cf.id,
      cf.nome,
      cf.tipo,
      vc.percentual,
      vc.cor,
      vc.ordem,
      EXISTS(
        SELECT 1 FROM categorias_financeiras sub 
        WHERE sub.categoria_pai_id = cf.id 
        AND sub.status = 'ativo'
      ) as tem_filhas
    FROM categorias_financeiras cf
    INNER JOIN visao_estrategica_categorias_config vc ON cf.id = vc.categoria_financeira_id
    WHERE cf.tipo = 'despesa'
      AND cf.status = 'ativo'
      AND cf.categoria_pai_id IS NULL
      AND vc.ativo = true
  ),
  subcategorias_agregadas AS (
    SELECT 
      cp.id as categoria_pai_id,
      jsonb_agg(
        jsonb_build_object(
          'id', sub.id,
          'nome', sub.nome,
          'percentual', COALESCE(subconfig.percentual, 0),
          'ordem', sub.ordem
        ) ORDER BY sub.ordem, sub.nome
      ) as subs
    FROM categorias_principais cp
    INNER JOIN categorias_financeiras sub ON sub.categoria_pai_id = cp.id
    LEFT JOIN visao_estrategica_categorias_config subconfig ON sub.id = subconfig.categoria_financeira_id
    WHERE sub.status = 'ativo'
    GROUP BY cp.id
  )
  SELECT 
    cp.id,
    cp.nome,
    cp.tipo,
    cp.percentual,
    cp.cor,
    cp.ordem,
    cp.tem_filhas,
    COALESCE(sa.subs, '[]'::jsonb) as subcategorias
  FROM categorias_principais cp
  LEFT JOIN subcategorias_agregadas sa ON cp.id = sa.categoria_pai_id
  ORDER BY cp.ordem, cp.nome;
END;
$$;

-- 7. Comentários
COMMENT ON TABLE visao_estrategica_categorias_config IS 'Configuração de percentuais para categorias financeiras na Visão Estratégica';
COMMENT ON FUNCTION get_categorias_visao_estrategica() IS 'Retorna categorias financeiras configuradas com suas subcategorias para uso na Visão Estratégica';

-- 8. Popular com algumas categorias padrão se não houver nenhuma
DO $$
DECLARE
  cat_rh_id uuid;
  cat_adm_id uuid;
  cat_mk_id uuid;
BEGIN
  -- Verificar se já há configurações
  IF NOT EXISTS (SELECT 1 FROM visao_estrategica_categorias_config LIMIT 1) THEN
    -- Buscar ou criar categoria RH
    SELECT id INTO cat_rh_id FROM categorias_financeiras 
    WHERE LOWER(nome) LIKE '%recursos humanos%' OR LOWER(nome) LIKE '%pessoal%' OR LOWER(nome) = 'rh'
    AND tipo = 'despesa' AND status = 'ativo' LIMIT 1;
    
    IF cat_rh_id IS NOT NULL THEN
      INSERT INTO visao_estrategica_categorias_config (categoria_financeira_id, percentual, cor, ordem)
      VALUES (cat_rh_id, 35, '#ef4444', 1)
      ON CONFLICT (categoria_financeira_id) DO NOTHING;
    END IF;
    
    -- Buscar categoria Administrativa
    SELECT id INTO cat_adm_id FROM categorias_financeiras 
    WHERE LOWER(nome) LIKE '%administrativa%' OR LOWER(nome) LIKE '%administra%'
    AND tipo = 'despesa' AND status = 'ativo' LIMIT 1;
    
    IF cat_adm_id IS NOT NULL THEN
      INSERT INTO visao_estrategica_categorias_config (categoria_financeira_id, percentual, cor, ordem)
      VALUES (cat_adm_id, 25, '#3b82f6', 2)
      ON CONFLICT (categoria_financeira_id) DO NOTHING;
    END IF;
    
    -- Buscar categoria Marketing
    SELECT id INTO cat_mk_id FROM categorias_financeiras 
    WHERE LOWER(nome) LIKE '%marketing%' OR LOWER(nome) LIKE '%divulga%'
    AND tipo = 'despesa' AND status = 'ativo' LIMIT 1;
    
    IF cat_mk_id IS NOT NULL THEN
      INSERT INTO visao_estrategica_categorias_config (categoria_financeira_id, percentual, cor, ordem)
      VALUES (cat_mk_id, 15, '#10b981', 3)
      ON CONFLICT (categoria_financeira_id) DO NOTHING;
    END IF;
  END IF;
END $$;
