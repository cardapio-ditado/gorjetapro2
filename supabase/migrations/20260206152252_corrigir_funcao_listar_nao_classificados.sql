/*
  # Corrigir Função Listar Não Classificados

  ## Problema
  - A função estava tentando acessar cb.nome mas a tabela bancos_contas usa outra estrutura

  ## Solução
  - Corrigir o SELECT para usar os campos corretos da tabela bancos_contas
*/

CREATE OR REPLACE FUNCTION listar_nao_classificados(
  p_ano INT,
  p_mes INT DEFAULT NULL,
  p_tipo TEXT DEFAULT NULL
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
    COALESCE(bc.banco || ' - ' || bc.tipo_conta, 'Sem Conta Bancária') AS conta_bancaria
  FROM fluxo_caixa fc
  LEFT JOIN centros_custo cc ON cc.id = fc.centro_custo_id
  LEFT JOIN bancos_contas bc ON bc.id = fc.conta_bancaria_id
  WHERE fc.categoria_id IS NULL
    AND EXTRACT(year FROM fc.data) = p_ano
    AND (p_mes IS NULL OR EXTRACT(month FROM fc.data) = p_mes)
    AND (p_tipo IS NULL OR fc.tipo = p_tipo)
    AND fc.origem != 'transferencia'
  ORDER BY fc.data DESC, ABS(fc.valor) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION listar_nao_classificados TO authenticated;
