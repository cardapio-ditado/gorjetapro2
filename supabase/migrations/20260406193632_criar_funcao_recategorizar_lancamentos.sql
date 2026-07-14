
/*
  # Função para recategorizar lançamentos

  Cria função para facilitar a correção de lançamentos categorizados incorretamente
*/

CREATE OR REPLACE FUNCTION recategorizar_lancamento_fluxo(
  p_fluxo_caixa_id uuid,
  p_nova_categoria_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_categoria_existe boolean;
  v_categoria_ativa boolean;
BEGIN
  -- Verificar se categoria existe e está ativa
  SELECT 
    EXISTS(SELECT 1 FROM categorias_financeiras WHERE id = p_nova_categoria_id),
    EXISTS(SELECT 1 FROM categorias_financeiras WHERE id = p_nova_categoria_id AND status = 'ativo')
  INTO v_categoria_existe, v_categoria_ativa;
  
  IF NOT v_categoria_existe THEN
    RAISE EXCEPTION 'Categoria não encontrada';
  END IF;
  
  IF NOT v_categoria_ativa THEN
    RAISE EXCEPTION 'Categoria está inativa';
  END IF;
  
  -- Atualizar categoria
  UPDATE fluxo_caixa
  SET 
    categoria_id = p_nova_categoria_id,
    atualizado_em = NOW()
  WHERE id = p_fluxo_caixa_id;
  
  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION recategorizar_lancamento_fluxo IS 'Recategoriza um lançamento do fluxo de caixa. Valida se a categoria existe e está ativa.';

-- Função para recategorizar em lote baseado em padrões
CREATE OR REPLACE FUNCTION recategorizar_lote_por_padrao(
  p_descricao_padrao text,
  p_nova_categoria_id uuid,
  p_data_inicial date DEFAULT NULL,
  p_data_final date DEFAULT NULL,
  p_simular boolean DEFAULT true
)
RETURNS TABLE(
  id uuid,
  data date,
  descricao text,
  valor numeric,
  categoria_antiga text,
  categoria_nova text,
  seria_atualizado boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_categoria_nova_nome text;
BEGIN
  -- Buscar nome da categoria nova
  SELECT nome INTO v_categoria_nova_nome
  FROM categorias_financeiras
  WHERE id = p_nova_categoria_id;
  
  IF v_categoria_nova_nome IS NULL THEN
    RAISE EXCEPTION 'Categoria destino não encontrada';
  END IF;
  
  -- Se não for simulação, fazer update
  IF NOT p_simular THEN
    UPDATE fluxo_caixa fc
    SET 
      categoria_id = p_nova_categoria_id,
      atualizado_em = NOW()
    WHERE fc.descricao ILIKE '%' || p_descricao_padrao || '%'
      AND (p_data_inicial IS NULL OR fc.data >= p_data_inicial)
      AND (p_data_final IS NULL OR fc.data <= p_data_final);
  END IF;
  
  -- Retornar lançamentos que seriam/foram afetados
  RETURN QUERY
  SELECT 
    fc.id,
    fc.data,
    fc.descricao,
    fc.valor,
    COALESCE(c.nome, 'SEM CATEGORIA') as categoria_antiga,
    v_categoria_nova_nome as categoria_nova,
    NOT p_simular as seria_atualizado
  FROM fluxo_caixa fc
  LEFT JOIN categorias_financeiras c ON c.id = fc.categoria_id
  WHERE fc.descricao ILIKE '%' || p_descricao_padrao || '%'
    AND (p_data_inicial IS NULL OR fc.data >= p_data_inicial)
    AND (p_data_final IS NULL OR fc.data <= p_data_final)
  ORDER BY fc.data DESC, fc.valor DESC;
END;
$$;

COMMENT ON FUNCTION recategorizar_lote_por_padrao IS 'Recategoriza lançamentos em lote baseado em padrão de descrição. Use p_simular=true para preview.';
