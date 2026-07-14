/*
  # Melhorar algoritmo de similaridade de nomes

  1. Alterações
    - Criar extensão fuzzystrmatch para algoritmos avançados
    - Implementar função melhorada com múltiplas estratégias
    - Adicionar normalização de nomes (remover acentos, pontuação)
    - Implementar score ponderado
*/

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Função para normalizar nomes (remover acentos, pontuação, espaços extras)
CREATE OR REPLACE FUNCTION normalizar_nome(nome text)
RETURNS text AS $$
BEGIN
  RETURN lower(
    regexp_replace(
      translate(
        nome,
        'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
        'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
      ),
      '[^a-z0-9 ]', '', 'g'
    )
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Função melhorada de similaridade com múltiplas estratégias
CREATE OR REPLACE FUNCTION calcular_similaridade_avancada(str1 text, str2 text)
RETURNS numeric AS $$
DECLARE
  nome1_normalizado text;
  nome2_normalizado text;
  score_exato numeric := 0;
  score_levenshtein numeric := 0;
  score_soundex numeric := 0;
  score_trigram numeric := 0;
  score_iniciais numeric := 0;
  score_palavras numeric := 0;
  score_final numeric := 0;
  palavras1 text[];
  palavras2 text[];
  iniciais1 text;
  iniciais2 text;
BEGIN
  -- Normalizar os nomes
  nome1_normalizado := normalizar_nome(str1);
  nome2_normalizado := normalizar_nome(str2);
  
  -- 1. Match exato (100%)
  IF nome1_normalizado = nome2_normalizado THEN
    RETURN 100;
  END IF;
  
  -- 2. Levenshtein Distance (0-40 pontos)
  BEGIN
    score_levenshtein := GREATEST(0, (1 - (levenshtein(nome1_normalizado, nome2_normalizado)::numeric / 
                         GREATEST(length(nome1_normalizado), length(nome2_normalizado)))) * 40);
  EXCEPTION WHEN OTHERS THEN
    score_levenshtein := 0;
  END;
  
  -- 3. Soundex (0-15 pontos) - sons parecidos
  BEGIN
    IF soundex(nome1_normalizado) = soundex(nome2_normalizado) THEN
      score_soundex := 15;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    score_soundex := 0;
  END;
  
  -- 4. Trigramas (0-25 pontos) - sequências de 3 caracteres
  BEGIN
    score_trigram := similarity(nome1_normalizado, nome2_normalizado) * 25;
  EXCEPTION WHEN OTHERS THEN
    score_trigram := 0;
  END;
  
  -- 5. Iniciais (0-10 pontos)
  palavras1 := string_to_array(nome1_normalizado, ' ');
  palavras2 := string_to_array(nome2_normalizado, ' ');
  
  iniciais1 := (SELECT string_agg(left(word, 1), '') FROM unnest(palavras1) AS word);
  iniciais2 := (SELECT string_agg(left(word, 1), '') FROM unnest(palavras2) AS word);
  
  IF iniciais1 = iniciais2 THEN
    score_iniciais := 10;
  ELSIF iniciais1 LIKE iniciais2 || '%' OR iniciais2 LIKE iniciais1 || '%' THEN
    score_iniciais := 5;
  END IF;
  
  -- 6. Palavras em comum (0-10 pontos)
  SELECT COUNT(*) * 3 INTO score_palavras
  FROM unnest(palavras1) AS p1
  WHERE p1 = ANY(palavras2) AND length(p1) > 2;
  
  score_palavras := LEAST(score_palavras, 10);
  
  -- Score final ponderado
  score_final := score_levenshtein + score_soundex + score_trigram + score_iniciais + score_palavras;
  
  RETURN ROUND(LEAST(score_final, 100), 2);
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Função melhorada para buscar colaborador
CREATE OR REPLACE FUNCTION buscar_colaborador_por_nome_avancado(
  p_nome text,
  p_tipo text DEFAULT 'funcionario',
  p_limite_similaridade numeric DEFAULT 60
)
RETURNS TABLE (
  colaborador_id uuid,
  nome_oficial text,
  similaridade numeric,
  origem text,
  metodo_match text
) AS $$
BEGIN
  -- Primeiro: buscar no mapeamento existente
  RETURN QUERY
  SELECT 
    m.colaborador_id,
    m.nome_oficial,
    calcular_similaridade_avancada(m.nome_variacao, p_nome) as similaridade,
    'mapeamento'::text as origem,
    'cache'::text as metodo_match
  FROM mapeamento_nomes_consumo m
  WHERE m.tipo_colaborador = p_tipo
    AND (
      normalizar_nome(m.nome_variacao) = normalizar_nome(p_nome)
      OR calcular_similaridade_avancada(m.nome_variacao, p_nome) >= 90
    )
  ORDER BY m.quantidade_usos DESC, calcular_similaridade_avancada(m.nome_variacao, p_nome) DESC
  LIMIT 1;
  
  -- Se encontrou no mapeamento, retornar
  IF FOUND THEN
    RETURN;
  END IF;
  
  -- Segundo: buscar diretamente nos colaboradores ativos com múltiplas estratégias
  RETURN QUERY
  WITH candidatos AS (
    SELECT 
      c.id,
      c.nome_completo,
      calcular_similaridade_avancada(c.nome_completo, p_nome) as score,
      CASE
        WHEN normalizar_nome(c.nome_completo) = normalizar_nome(p_nome) THEN 'exato'
        WHEN normalizar_nome(c.nome_completo) LIKE '%' || normalizar_nome(p_nome) || '%' THEN 'substring'
        WHEN normalizar_nome(p_nome) LIKE '%' || normalizar_nome(c.nome_completo) || '%' THEN 'substring_reverso'
        WHEN similarity(normalizar_nome(c.nome_completo), normalizar_nome(p_nome)) > 0.5 THEN 'trigram'
        ELSE 'fuzzy'
      END as metodo
    FROM colaboradores c
    WHERE c.status = 'ativo'
  )
  SELECT 
    id,
    nome_completo,
    score,
    'direto'::text as origem,
    metodo
  FROM candidatos
  WHERE score >= p_limite_similaridade
  ORDER BY score DESC, length(nome_completo) ASC
  LIMIT 1;
  
END;
$$ LANGUAGE plpgsql;

-- View para debug de similaridade
CREATE OR REPLACE VIEW vw_teste_similaridade AS
SELECT 
  c.id,
  c.nome_completo,
  c.status,
  normalizar_nome(c.nome_completo) as nome_normalizado,
  (SELECT string_agg(left(word, 1), '') FROM unnest(string_to_array(normalizar_nome(c.nome_completo), ' ')) AS word) as iniciais
FROM colaboradores c
WHERE c.status = 'ativo'
ORDER BY c.nome_completo;

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_colaboradores_nome_normalizado ON colaboradores USING gin (normalizar_nome(nome_completo) gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_mapeamento_nome_normalizado ON mapeamento_nomes_consumo USING gin (normalizar_nome(nome_variacao) gin_trgm_ops);
