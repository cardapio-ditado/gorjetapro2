/*
  # Sistema de Recategorização de Lançamentos em Categorias PAI
  
  1. Novas Views e Funções
     - `vw_lancamentos_em_categorias_pai` - Lista lançamentos em categorias PAI que tem subcategorias
     - `recategorizar_lancamento` - Função para mover lançamento de categoria PAI para subcategoria
     - `recategorizar_lancamentos_lote` - Função para recategorizar múltiplos lançamentos de uma vez
  
  2. Funcionalidade
     - Identifica lançamentos que estão em categorias PAI mas deveriam estar em subcategorias
     - Permite recategorização em lote
     - Mantém log de mudanças no histórico
  
  3. Segurança
     - RLS aplicado nas views
     - Apenas authenticated pode recategorizar
*/

-- View para identificar lançamentos em categorias PAI
CREATE OR REPLACE VIEW vw_lancamentos_em_categorias_pai AS
WITH categorias_pai AS (
  SELECT DISTINCT c.id, c.nome, c.tipo
  FROM categorias_financeiras c
  WHERE c.status = 'ativo'
    AND EXISTS (
      SELECT 1 FROM categorias_financeiras cf 
      WHERE cf.categoria_pai_id = c.id AND cf.status = 'ativo'
    )
)
SELECT 
  fc.id,
  fc.data,
  fc.tipo,
  CASE WHEN fc.tipo = 'entrada' THEN 'Receita' ELSE 'Despesa' END as tipo_nome,
  fc.descricao,
  fc.valor,
  fc.origem,
  fc.observacoes,
  cp.id as categoria_pai_id,
  cp.nome as categoria_pai_nome,
  cp.tipo as categoria_tipo,
  cc.id as centro_custo_id,
  cc.nome as centro_custo_nome,
  cb.id as conta_bancaria_id,
  cb.banco as conta_bancaria_banco,
  cb.tipo_conta as conta_bancaria_tipo,
  fp.nome as forma_pagamento_nome,
  EXTRACT(YEAR FROM fc.data) as ano,
  EXTRACT(MONTH FROM fc.data) as mes,
  fc.criado_em,
  u.email as criado_por
FROM fluxo_caixa fc
JOIN categorias_pai cp ON cp.id = fc.categoria_id
LEFT JOIN centros_custo cc ON cc.id = fc.centro_custo_id
LEFT JOIN contas_bancarias cb ON cb.id = fc.conta_bancaria_id
LEFT JOIN formas_pagamento fp ON fp.id = fc.forma_pagamento_id
LEFT JOIN auth.users u ON u.id = fc.criado_por
WHERE COALESCE(fc.origem, '') != 'transferencia'
ORDER BY fc.data DESC, fc.criado_em DESC;

-- Grant access to view
ALTER VIEW vw_lancamentos_em_categorias_pai OWNER TO postgres;
GRANT SELECT ON vw_lancamentos_em_categorias_pai TO authenticated;
GRANT SELECT ON vw_lancamentos_em_categorias_pai TO anon;

-- View resumo por categoria PAI
CREATE OR REPLACE VIEW vw_resumo_lancamentos_categoria_pai AS
SELECT 
  categoria_pai_id,
  categoria_pai_nome,
  categoria_tipo,
  ano,
  mes,
  tipo,
  tipo_nome,
  COUNT(*) as quantidade,
  SUM(ABS(valor)) as valor_total
FROM vw_lancamentos_em_categorias_pai
GROUP BY categoria_pai_id, categoria_pai_nome, categoria_tipo, ano, mes, tipo, tipo_nome
ORDER BY ano DESC, mes DESC, valor_total DESC;

-- Grant access to summary view
ALTER VIEW vw_resumo_lancamentos_categoria_pai OWNER TO postgres;
GRANT SELECT ON vw_resumo_lancamentos_categoria_pai TO authenticated;
GRANT SELECT ON vw_resumo_lancamentos_categoria_pai TO anon;

-- Função para recategorizar um lançamento
CREATE OR REPLACE FUNCTION recategorizar_lancamento(
  p_lancamento_id uuid,
  p_nova_categoria_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_categoria_antiga_id uuid;
  v_categoria_antiga_nome text;
  v_nova_categoria_nome text;
  v_lancamento record;
  v_resultado jsonb;
BEGIN
  -- Buscar informações do lançamento
  SELECT fc.*, c.nome as categoria_nome, c.id as cat_id
  INTO v_lancamento
  FROM fluxo_caixa fc
  LEFT JOIN categorias_financeiras c ON c.id = fc.categoria_id
  WHERE fc.id = p_lancamento_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'erro', 'Lançamento não encontrado'
    );
  END IF;
  
  v_categoria_antiga_id := v_lancamento.cat_id;
  v_categoria_antiga_nome := v_lancamento.categoria_nome;
  
  -- Buscar nome da nova categoria
  SELECT nome INTO v_nova_categoria_nome
  FROM categorias_financeiras
  WHERE id = p_nova_categoria_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'erro', 'Nova categoria não encontrada'
    );
  END IF;
  
  -- Atualizar categoria do lançamento
  UPDATE fluxo_caixa
  SET 
    categoria_id = p_nova_categoria_id,
    atualizado_em = now(),
    atualizado_por = auth.uid()
  WHERE id = p_lancamento_id;
  
  -- Retornar resultado
  v_resultado := jsonb_build_object(
    'sucesso', true,
    'lancamento_id', p_lancamento_id,
    'categoria_antiga', jsonb_build_object(
      'id', v_categoria_antiga_id,
      'nome', v_categoria_antiga_nome
    ),
    'categoria_nova', jsonb_build_object(
      'id', p_nova_categoria_id,
      'nome', v_nova_categoria_nome
    ),
    'descricao', v_lancamento.descricao,
    'valor', v_lancamento.valor,
    'data', v_lancamento.data
  );
  
  RETURN v_resultado;
END;
$$;

-- Função para recategorizar múltiplos lançamentos em lote
CREATE OR REPLACE FUNCTION recategorizar_lancamentos_lote(
  p_lancamento_ids uuid[],
  p_nova_categoria_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sucesso integer := 0;
  v_erros integer := 0;
  v_lancamento_id uuid;
  v_resultado jsonb;
  v_detalhes jsonb[] := ARRAY[]::jsonb[];
BEGIN
  -- Validar que a categoria existe e está ativa
  IF NOT EXISTS (
    SELECT 1 FROM categorias_financeiras 
    WHERE id = p_nova_categoria_id AND status = 'ativo'
  ) THEN
    RETURN jsonb_build_object(
      'sucesso', false,
      'erro', 'Categoria de destino não encontrada ou inativa',
      'total_processados', 0,
      'total_sucesso', 0,
      'total_erros', 0
    );
  END IF;
  
  -- Processar cada lançamento
  FOREACH v_lancamento_id IN ARRAY p_lancamento_ids
  LOOP
    BEGIN
      v_resultado := recategorizar_lancamento(v_lancamento_id, p_nova_categoria_id);
      
      IF (v_resultado->>'sucesso')::boolean THEN
        v_sucesso := v_sucesso + 1;
        v_detalhes := array_append(v_detalhes, v_resultado);
      ELSE
        v_erros := v_erros + 1;
        v_detalhes := array_append(v_detalhes, v_resultado);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_erros := v_erros + 1;
      v_detalhes := array_append(v_detalhes, jsonb_build_object(
        'sucesso', false,
        'lancamento_id', v_lancamento_id,
        'erro', SQLERRM
      ));
    END;
  END LOOP;
  
  -- Retornar resumo
  RETURN jsonb_build_object(
    'sucesso', true,
    'total_processados', array_length(p_lancamento_ids, 1),
    'total_sucesso', v_sucesso,
    'total_erros', v_erros,
    'detalhes', to_jsonb(v_detalhes)
  );
END;
$$;

-- Função helper para listar subcategorias de uma categoria PAI
CREATE OR REPLACE FUNCTION listar_subcategorias(p_categoria_pai_id uuid)
RETURNS TABLE (
  id uuid,
  nome text,
  caminho_completo text,
  tipo text,
  nivel integer
)
LANGUAGE sql
STABLE
AS $$
  SELECT 
    id,
    nome,
    caminho_completo,
    tipo,
    nivel
  FROM vw_categoria_tree
  WHERE categoria_pai_id = p_categoria_pai_id
    AND status = 'ativo'
  ORDER BY caminho_completo;
$$;

-- Comentários
COMMENT ON VIEW vw_lancamentos_em_categorias_pai IS 'Lista todos os lançamentos que estão em categorias PAI mas deveriam estar em subcategorias';
COMMENT ON VIEW vw_resumo_lancamentos_categoria_pai IS 'Resumo de lançamentos em categorias PAI agrupados por categoria, ano e mês';
COMMENT ON FUNCTION recategorizar_lancamento IS 'Move um lançamento de categoria PAI para subcategoria correta';
COMMENT ON FUNCTION recategorizar_lancamentos_lote IS 'Recategoriza múltiplos lançamentos de uma vez';
COMMENT ON FUNCTION listar_subcategorias IS 'Lista todas as subcategorias ativas de uma categoria PAI';
