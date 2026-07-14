/*
  # Sistema de mapeamento inteligente de nomes de consumo

  1. Nova Tabela: mapeamento_nomes_consumo
    - Armazena aprendizado de nomes e suas variações
    - Permite reconhecimento inteligente com similaridade
    
  2. Nova Tabela: historico_processamento_consumo
    - Registra processamentos de planilhas
    - Mantém histórico de descontos aplicados
*/

-- Tabela de mapeamento de nomes
CREATE TABLE IF NOT EXISTS mapeamento_nomes_consumo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  colaborador_id uuid NOT NULL REFERENCES colaboradores(id) ON DELETE CASCADE,
  nome_oficial text NOT NULL,
  nome_variacao text NOT NULL,
  tipo_colaborador text NOT NULL CHECK (tipo_colaborador IN ('funcionario', 'garcom')),
  similaridade_score numeric DEFAULT 100,
  quantidade_usos integer DEFAULT 1,
  criado_em timestamp with time zone DEFAULT now(),
  atualizado_em timestamp with time zone DEFAULT now(),
  UNIQUE(nome_variacao, tipo_colaborador)
);

-- Tabela de histórico de processamento
CREATE TABLE IF NOT EXISTS historico_processamento_consumo (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  arquivo_nome text NOT NULL,
  total_linhas integer NOT NULL,
  linhas_processadas integer NOT NULL,
  linhas_erro integer DEFAULT 0,
  total_valor numeric DEFAULT 0,
  detalhes jsonb,
  erros jsonb,
  processado_por uuid REFERENCES usuarios(id),
  processado_em timestamp with time zone DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_mapeamento_colaborador ON mapeamento_nomes_consumo(colaborador_id);
CREATE INDEX IF NOT EXISTS idx_mapeamento_variacao ON mapeamento_nomes_consumo(nome_variacao);
CREATE INDEX IF NOT EXISTS idx_mapeamento_tipo ON mapeamento_nomes_consumo(tipo_colaborador);
CREATE INDEX IF NOT EXISTS idx_historico_processamento_data ON historico_processamento_consumo(processado_em);

-- RLS
ALTER TABLE mapeamento_nomes_consumo ENABLE ROW LEVEL SECURITY;
ALTER TABLE historico_processamento_consumo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for mapeamento_nomes_consumo"
  ON mapeamento_nomes_consumo FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow all for historico_processamento_consumo"
  ON historico_processamento_consumo FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION update_mapeamento_nomes_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.atualizado_em = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_mapeamento_nomes_updated_at
  BEFORE UPDATE ON mapeamento_nomes_consumo
  FOR EACH ROW
  EXECUTE FUNCTION update_mapeamento_nomes_updated_at();

-- Função para calcular similaridade entre strings (algoritmo Levenshtein simplificado)
CREATE OR REPLACE FUNCTION calcular_similaridade(str1 text, str2 text)
RETURNS numeric AS $$
DECLARE
  len1 integer := length(str1);
  len2 integer := length(str2);
  max_len integer := GREATEST(len1, len2);
  dist integer;
BEGIN
  IF max_len = 0 THEN
    RETURN 100;
  END IF;
  
  -- Usar a função de similaridade do PostgreSQL
  dist := levenshtein(lower(str1), lower(str2));
  
  RETURN ROUND((1 - (dist::numeric / max_len)) * 100, 2);
EXCEPTION
  WHEN OTHERS THEN
    -- Fallback simples se levenshtein não estiver disponível
    IF lower(str1) = lower(str2) THEN
      RETURN 100;
    ELSIF lower(str1) LIKE '%' || lower(str2) || '%' OR lower(str2) LIKE '%' || lower(str1) || '%' THEN
      RETURN 70;
    ELSE
      RETURN 0;
    END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Função para buscar colaborador por nome com similaridade
CREATE OR REPLACE FUNCTION buscar_colaborador_por_nome(
  p_nome text,
  p_tipo text DEFAULT 'funcionario',
  p_limite_similaridade numeric DEFAULT 70
)
RETURNS TABLE (
  colaborador_id uuid,
  nome_oficial text,
  similaridade numeric,
  origem text
) AS $$
BEGIN
  -- Primeiro buscar no mapeamento existente
  RETURN QUERY
  SELECT 
    m.colaborador_id,
    m.nome_oficial,
    m.similaridade_score,
    'mapeamento'::text as origem
  FROM mapeamento_nomes_consumo m
  WHERE m.tipo_colaborador = p_tipo
    AND (
      lower(m.nome_variacao) = lower(p_nome)
      OR calcular_similaridade(m.nome_variacao, p_nome) >= p_limite_similaridade
    )
  ORDER BY m.quantidade_usos DESC, m.similaridade_score DESC
  LIMIT 1;
  
  -- Se não encontrou no mapeamento, buscar diretamente nos colaboradores
  IF NOT FOUND THEN
    RETURN QUERY
    SELECT 
      c.id,
      c.nome_completo,
      calcular_similaridade(c.nome_completo, p_nome),
      'direto'::text as origem
    FROM colaboradores c
    WHERE c.status = 'ativo'
      AND calcular_similaridade(c.nome_completo, p_nome) >= p_limite_similaridade
    ORDER BY calcular_similaridade(c.nome_completo, p_nome) DESC
    LIMIT 1;
  END IF;
END;
$$ LANGUAGE plpgsql;
