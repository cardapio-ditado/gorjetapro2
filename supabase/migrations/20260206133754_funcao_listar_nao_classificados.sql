/*
  # Função para Listar Lançamentos Não Classificados

  Facilita a visualização de lançamentos que precisam ser categorizados.
*/

CREATE OR REPLACE FUNCTION listar_nao_classificados(
  p_ano INT,
  p_mes INT DEFAULT NULL,
  p_tipo TEXT DEFAULT NULL -- 'entrada' ou 'saida'
)
RETURNS TABLE (
  id UUID,
  data DATE,
  tipo TEXT,
  descricao TEXT,
  valor NUMERIC,
  centro_custo_nome TEXT,
  origem TEXT,
  conta_bancaria TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    fc.id,
    fc.data,
    fc.tipo,
    fc.descricao,
    fc.valor,
    COALESCE(cc.nome, 'Sem Centro de Custo') AS centro_custo_nome,
    fc.origem,
    COALESCE(cb.nome, 'Sem Conta Bancária') AS conta_bancaria
  FROM fluxo_caixa fc
  LEFT JOIN centros_custo cc ON cc.id = fc.centro_custo_id
  LEFT JOIN contas_bancarias cb ON cb.id = fc.conta_bancaria_id
  WHERE fc.categoria_id IS NULL
    AND EXTRACT(year FROM fc.data) = p_ano
    AND (p_mes IS NULL OR EXTRACT(month FROM fc.data) = p_mes)
    AND (p_tipo IS NULL OR fc.tipo = p_tipo)
    AND fc.origem != 'transferencia'
  ORDER BY fc.data DESC, ABS(fc.valor) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Função para contar e somar não classificados
CREATE OR REPLACE FUNCTION resumo_nao_classificados(
  p_ano INT,
  p_mes INT DEFAULT NULL
)
RETURNS TABLE (
  tipo TEXT,
  quantidade BIGINT,
  valor_total NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    CASE 
      WHEN fc.tipo = 'entrada' THEN 'RECEITAS NÃO CLASSIFICADAS'
      ELSE 'DESPESAS NÃO CLASSIFICADAS'
    END AS tipo,
    COUNT(*)::BIGINT AS quantidade,
    SUM(ABS(fc.valor))::NUMERIC AS valor_total
  FROM fluxo_caixa fc
  WHERE fc.categoria_id IS NULL
    AND EXTRACT(year FROM fc.data) = p_ano
    AND (p_mes IS NULL OR EXTRACT(month FROM fc.data) = p_mes)
    AND fc.origem != 'transferencia'
  GROUP BY fc.tipo
  ORDER BY fc.tipo;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Conceder permissões
GRANT EXECUTE ON FUNCTION listar_nao_classificados TO authenticated;
GRANT EXECUTE ON FUNCTION resumo_nao_classificados TO authenticated;

-- Comentários com exemplos
COMMENT ON FUNCTION listar_nao_classificados IS '
Lista lançamentos sem categoria para facilitar a categorização.

Exemplos de uso:
-- Todos os não classificados de 2026
SELECT * FROM listar_nao_classificados(2026);

-- Apenas receitas não classificadas de janeiro/2026
SELECT * FROM listar_nao_classificados(2026, 1, ''entrada'');

-- Apenas despesas não classificadas de fevereiro/2026
SELECT * FROM listar_nao_classificados(2026, 2, ''saida'');

-- Ver os 10 maiores valores não classificados
SELECT * FROM listar_nao_classificados(2026) ORDER BY ABS(valor) DESC LIMIT 10;
';

COMMENT ON FUNCTION resumo_nao_classificados IS '
Mostra resumo com quantidade e total de lançamentos não classificados.

Exemplos de uso:
-- Resumo de 2026
SELECT * FROM resumo_nao_classificados(2026);

-- Resumo de janeiro/2026
SELECT * FROM resumo_nao_classificados(2026, 1);
';
