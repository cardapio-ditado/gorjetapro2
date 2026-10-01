/*
  # Estoque Beta 2: Movimentações (histórico) no padrão

  Uma função de leitura com filtros (período, tipo, origem, estoque, item)
  para a tela de histórico do Beta 2. Só leitura: perda e acerto de saldo
  entram pela Contagem, com aprovação.
*/
CREATE OR REPLACE FUNCTION fn_movimentacoes_lista(p jsonb)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH f AS (
    SELECT coalesce((p->>'de')::date, current_date - 7) AS de, coalesce((p->>'ate')::date, current_date) AS ate,
           nullif(p->>'tipo', '') AS tipo, nullif(p->>'origem', '') AS origem, nullif(p->>'estoque_id', '')::uuid AS estoque_id,
           nullif(p->>'item_id', '')::uuid AS item_id, nullif(trim(p->>'busca'), '') AS busca,
           least(coalesce((p->>'limite')::int, 200), 500) AS limite, coalesce((p->>'pular')::int, 0) AS pular
  ),
  base AS (
    SELECT m.id, m.data_movimentacao AS data, m.criado_em, m.tipo_movimentacao AS tipo,
           CASE WHEN m.origem_tipo IS NULL OR m.origem_tipo = '' THEN 'manual' ELSE m.origem_tipo END AS origem,
           trim(coalesce(i.nome, m.item_descricao, '?')) AS item, i.unidade_medida AS um, i.categoria, m.item_id,
           m.quantidade, m.custo_unitario, m.custo_total, eo.nome AS de_nome, ed.nome AS para_nome, m.motivo, m.observacoes,
           u.nome_completo AS quem
      FROM movimentacoes_estoque m
      LEFT JOIN itens_estoque i ON i.id = m.item_id
      LEFT JOIN estoques eo ON eo.id = m.estoque_origem_id
      LEFT JOIN estoques ed ON ed.id = m.estoque_destino_id
      LEFT JOIN usuarios_sistema u ON u.id = m.criado_por
      CROSS JOIN f
     WHERE m.data_movimentacao BETWEEN f.de AND f.ate
       AND (f.tipo IS NULL OR m.tipo_movimentacao = f.tipo)
       AND (f.origem IS NULL OR (CASE WHEN m.origem_tipo IS NULL OR m.origem_tipo = '' THEN 'manual' ELSE m.origem_tipo END) = f.origem)
       AND (f.estoque_id IS NULL OR m.estoque_origem_id = f.estoque_id OR m.estoque_destino_id = f.estoque_id)
       AND (f.item_id IS NULL OR m.item_id = f.item_id)
       AND (f.busca IS NULL OR unaccent(coalesce(i.nome, m.item_descricao, '')) ILIKE '%' || unaccent(f.busca) || '%')
  )
  SELECT jsonb_build_object(
    'total', (SELECT count(*) FROM base),
    'totais', (SELECT jsonb_build_object(
        'entradas', count(*) FILTER (WHERE tipo = 'entrada'), 'valor_entradas', coalesce(sum(custo_total) FILTER (WHERE tipo = 'entrada'), 0),
        'saidas', count(*) FILTER (WHERE tipo = 'saida'), 'valor_saidas', coalesce(sum(custo_total) FILTER (WHERE tipo = 'saida'), 0),
        'transferencias', count(*) FILTER (WHERE tipo = 'transferencia'), 'ajustes', count(*) FILTER (WHERE tipo = 'ajuste')) FROM base),
    'linhas', (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY b.data DESC, b.criado_em DESC), '[]'::jsonb)
                 FROM (SELECT * FROM base ORDER BY data DESC, criado_em DESC LIMIT (SELECT limite FROM f) OFFSET (SELECT pular FROM f)) b)
  );
$$;

GRANT EXECUTE ON FUNCTION fn_movimentacoes_lista(jsonb) TO authenticated;
