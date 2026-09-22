/*
  # Estoque Beta: fornecedor só é escolhido sozinho com semelhança alta

  "AMBEV DISTRIBUIDORA" estava casando com "QUANTEX DISTRIBUIDORA" porque a
  palavra comum pesava demais. Por nome, o sistema só escolhe sozinho acima
  de 0,6 de semelhança; abaixo disso mostra as opções e a pessoa decide.
  Por CNPJ continua igual: bateu, é ele.
*/

CREATE OR REPLACE FUNCTION fn_beta_receber_preparar(p_linhas jsonb, p_fornecedor jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
DECLARE
  v_cnpj text := regexp_replace(coalesce(p_fornecedor->>'cnpj', ''), '\D', '', 'g');
  v_nome text := unaccent(lower(trim(coalesce(p_fornecedor->>'nome', ''))));
  v_forn jsonb;
  v_opcoes jsonb;
  v_linhas jsonb;
BEGIN
  IF v_cnpj <> '' THEN
    SELECT jsonb_build_object('id', f.id, 'nome', f.nome) INTO v_forn
    FROM fornecedores f
    WHERE regexp_replace(coalesce(f.cnpj, ''), '\D', '', 'g') = v_cnpj AND f.status = 'ativo'
    LIMIT 1;
  END IF;

  SELECT coalesce(jsonb_agg(o ORDER BY (o->>'score')::numeric DESC), '[]'::jsonb) INTO v_opcoes
  FROM (
    SELECT jsonb_build_object('id', f.id, 'nome', f.nome,
      'score', round(similarity(unaccent(lower(f.nome)), v_nome)::numeric, 3)) AS o
    FROM fornecedores f
    WHERE f.status = 'ativo' AND v_nome <> '' AND similarity(unaccent(lower(f.nome)), v_nome) > 0.2
    ORDER BY similarity(unaccent(lower(f.nome)), v_nome) DESC
    LIMIT 5
  ) x;

  IF v_forn IS NULL AND jsonb_array_length(v_opcoes) > 0 AND (v_opcoes->0->>'score')::numeric >= 0.6 THEN
    v_forn := jsonb_build_object('id', v_opcoes->0->>'id', 'nome', v_opcoes->0->>'nome');
  END IF;

  SELECT coalesce(jsonb_agg(linha ORDER BY (linha->>'indice')::int), '[]'::jsonb) INTO v_linhas
  FROM (
    SELECT jsonb_build_object(
      'indice', ord - 1,
      'descricao', l->>'descricao',
      'codigo', l->>'codigo',
      'quantidade', nullif(l->>'quantidade', '')::numeric,
      'unidade', l->>'unidade',
      'valor_unitario', nullif(l->>'valor_unitario', '')::numeric,
      'valor_total', nullif(l->>'valor_total', '')::numeric,
      'opcoes', (SELECT fn_beta_buscar_item(l->>'descricao', NULL)),
      'sugestao', (
        SELECT CASE WHEN (op->>'score')::numeric >= 0.3 THEN op ELSE NULL END
        FROM jsonb_array_elements(fn_beta_buscar_item(l->>'descricao', NULL)) op
        LIMIT 1
      )
    ) AS linha
    FROM jsonb_array_elements(coalesce(p_linhas, '[]'::jsonb)) WITH ORDINALITY AS t(l, ord)
  ) y;

  RETURN jsonb_build_object('fornecedor', v_forn, 'fornecedor_opcoes', v_opcoes, 'linhas', v_linhas);
END;
$$;
