/*
  # Corrigir Seleção de Semana Atual - Visão Estratégica
  
  ## Problema
  A semana atual está sendo selecionada incorretamente (última criada em vez da que contém hoje)
  
  ## Solução
  Criar função RPC que retorna a semana que CONTÉM a data atual
  
  ## Mudanças
  1. Função `get_semana_atual_ve()` - retorna semana onde hoje está entre data_inicio e data_inicio + 6 dias
  2. Função `get_semanas_futuras_ve()` - retorna semanas onde data_inicio > hoje
  3. Adicionar campo calculado `data_fim` nas semanas (virtual)
  
  ## Segurança
  - Funções SECURITY DEFINER para performance
  - Sem alterações em RLS
*/

-- 1. Função para obter semana atual (que contém hoje)
CREATE OR REPLACE FUNCTION get_semana_atual_ve()
RETURNS TABLE (
  id uuid,
  data_inicio date,
  faturamento numeric,
  criado_em timestamptz,
  criado_por uuid,
  atualizado_em timestamptz,
  data_fim date
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.data_inicio,
    s.faturamento,
    s.criado_em,
    s.criado_por,
    s.atualizado_em,
    (s.data_inicio + INTERVAL '6 days')::date as data_fim
  FROM visao_estrategica_semanas s
  WHERE CURRENT_DATE >= s.data_inicio 
    AND CURRENT_DATE <= (s.data_inicio + INTERVAL '6 days')::date
  ORDER BY s.data_inicio DESC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Função para obter semanas futuras (onde data_inicio > hoje)
CREATE OR REPLACE FUNCTION get_semanas_futuras_ve()
RETURNS TABLE (
  id uuid,
  data_inicio date,
  faturamento numeric,
  criado_em timestamptz,
  criado_por uuid,
  atualizado_em timestamptz,
  data_fim date
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.data_inicio,
    s.faturamento,
    s.criado_em,
    s.criado_por,
    s.atualizado_em,
    (s.data_inicio + INTERVAL '6 days')::date as data_fim
  FROM visao_estrategica_semanas s
  WHERE s.data_inicio > CURRENT_DATE
  ORDER BY s.data_inicio ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Função para obter todas as semanas com data_fim calculada
CREATE OR REPLACE FUNCTION get_todas_semanas_ve()
RETURNS TABLE (
  id uuid,
  data_inicio date,
  faturamento numeric,
  criado_em timestamptz,
  criado_por uuid,
  atualizado_em timestamptz,
  data_fim date
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    s.id,
    s.data_inicio,
    s.faturamento,
    s.criado_em,
    s.criado_por,
    s.atualizado_em,
    (s.data_inicio + INTERVAL '6 days')::date as data_fim
  FROM visao_estrategica_semanas s
  ORDER BY s.data_inicio DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Comentários
COMMENT ON FUNCTION get_semana_atual_ve IS 
  'Retorna a semana que contém a data atual (CURRENT_DATE entre data_inicio e data_inicio + 6 dias)';

COMMENT ON FUNCTION get_semanas_futuras_ve IS 
  'Retorna semanas futuras (onde data_inicio > CURRENT_DATE) ordenadas por data_inicio ASC';

COMMENT ON FUNCTION get_todas_semanas_ve IS 
  'Retorna todas as semanas com campo data_fim calculado (data_inicio + 6 dias)';
