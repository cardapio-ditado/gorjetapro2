/*
  # Estoque Beta 2: Configurar Central

  O ponto de pedido do Central passa a ter dois modos por item:
    manual → o número que o gestor digitou (como é hoje, nada muda sozinho)
    auto   → ponto = consumo por dia × (ciclo do fornecedor + segurança),
             recalculado todo dia depois da baixa da Zig.

  Nenhum item muda de modo nesta migração: tudo continua manual até o gestor
  ligar o automático na tela, item a item ou "em todos com consumo".

  Regras em configuracoes_sistema: estoque_seguranca_dias (2) e
  estoque_cobertura_padrao_dias (7, quando o fornecedor não tem ciclo).
*/

ALTER TABLE itens_estoque
  ADD COLUMN IF NOT EXISTS ponto_modo text NOT NULL DEFAULT 'manual' CHECK (ponto_modo IN ('manual', 'auto')),
  ADD COLUMN IF NOT EXISTS ponto_calculado numeric,
  ADD COLUMN IF NOT EXISTS ponto_calculado_em timestamptz;

INSERT INTO configuracoes_sistema (chave, valor, descricao, tipo, categoria)
SELECT 'estoque_seguranca_dias', '2', 'Dias de segurança somados ao ciclo do fornecedor no ponto de pedido automático', 'numero', 'estoque'
 WHERE NOT EXISTS (SELECT 1 FROM configuracoes_sistema WHERE chave = 'estoque_seguranca_dias');
INSERT INTO configuracoes_sistema (chave, valor, descricao, tipo, categoria)
SELECT 'estoque_cobertura_padrao_dias', '7', 'Ciclo de compra usado quando o fornecedor do item não tem ciclo definido', 'numero', 'estoque'
 WHERE NOT EXISTS (SELECT 1 FROM configuracoes_sistema WHERE chave = 'estoque_cobertura_padrao_dias');

CREATE OR REPLACE FUNCTION fn_central_regras()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'seguranca_dias', coalesce((SELECT valor::int FROM configuracoes_sistema WHERE chave = 'estoque_seguranca_dias' AND valor ~ '^\d+$'), 2),
    'cobertura_padrao_dias', coalesce((SELECT valor::int FROM configuracoes_sistema WHERE chave = 'estoque_cobertura_padrao_dias' AND valor ~ '^\d+$'), 7),
    'historico_dias', 90
  );
$$;

CREATE OR REPLACE FUNCTION fn_central_regras_salvar(p_seguranca int, p_cobertura int)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_antes jsonb;
BEGIN
  PERFORM setores_exigir_gestor();
  IF p_seguranca IS NULL OR p_seguranca < 0 OR p_seguranca > 30 THEN RAISE EXCEPTION 'Segurança: de 0 a 30 dias'; END IF;
  IF p_cobertura IS NULL OR p_cobertura < 1 OR p_cobertura > 60 THEN RAISE EXCEPTION 'Cobertura padrão: de 1 a 60 dias'; END IF;
  v_antes := fn_central_regras();
  UPDATE configuracoes_sistema SET valor = p_seguranca::text, atualizado_em = now() WHERE chave = 'estoque_seguranca_dias';
  UPDATE configuracoes_sistema SET valor = p_cobertura::text, atualizado_em = now() WHERE chave = 'estoque_cobertura_padrao_dias';
  PERFORM setores_log(NULL, NULL, NULL, 'central_regras', v_antes, fn_central_regras());
  PERFORM fn_central_aplicar_auto();
  RETURN fn_central_regras();
END; $$;

/** Todos os insumos do Central com consumo, ciclo, sugestão e ponto atual. */
CREATE OR REPLACE FUNCTION fn_central_itens()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH g AS (SELECT (fn_central_regras()->>'seguranca_dias')::int AS seg, (fn_central_regras()->>'cobertura_padrao_dias')::int AS cob),
  r AS (SELECT * FROM fn_reposicao_central()),
  calc AS (
    SELECT r.item_id, r.nome, r.categoria, r.unidade_medida, r.saldo_central, r.consumo_dia, r.ponto_pedido, r.fornecedor_nome,
           coalesce(f.ciclo_compra_dias, g.cob) AS ciclo, g.seg,
           (lower(btrim(coalesce(r.unidade_medida, ''))) = ANY (ARRAY['kg','g','grama','gramas','l','litro','litros','ml'])) AS fracionado,
           i.ponto_modo, i.classe_compra, i.ponto_calculado_em
      FROM r
      JOIN itens_estoque i ON i.id = r.item_id
      LEFT JOIN fornecedores f ON f.id = i.fornecedor_padrao_id
      CROSS JOIN g
  ),
  sug AS (
    SELECT c.*, c.ciclo + c.seg AS cobertura,
           CASE WHEN c.fracionado THEN round(c.consumo_dia * (c.ciclo + c.seg), 2) ELSE ceil(c.consumo_dia * (c.ciclo + c.seg)) END AS sugerido
      FROM calc c
  )
  SELECT jsonb_build_object(
    'regras', fn_central_regras(),
    'totais', jsonb_build_object(
      'itens', count(*), 'auto', count(*) FILTER (WHERE ponto_modo = 'auto'), 'manual', count(*) FILTER (WHERE ponto_modo = 'manual'),
      'com_consumo', count(*) FILTER (WHERE consumo_dia > 0), 'abaixo', count(*) FILTER (WHERE ponto_pedido > 0 AND saldo_central < ponto_pedido),
      'diferentes', count(*) FILTER (WHERE ponto_modo = 'manual' AND consumo_dia > 0 AND sugerido <> ponto_pedido)),
    'itens', coalesce(jsonb_agg(jsonb_build_object(
      'item_id', item_id, 'nome', trim(nome), 'categoria', categoria, 'um', unidade_medida, 'saldo', saldo_central, 'consumo_dia', consumo_dia,
      'ciclo_dias', ciclo, 'cobertura_dias', cobertura, 'sugerido', sugerido, 'ponto', ponto_pedido, 'modo', ponto_modo,
      'fornecedor', fornecedor_nome, 'classe', classe_compra, 'calculado_em', ponto_calculado_em,
      'cobertura_atual_dias', CASE WHEN consumo_dia > 0 THEN round(saldo_central / consumo_dia, 1) END
    ) ORDER BY categoria NULLS LAST, trim(nome)), '[]'::jsonb)
  ) FROM sug;
$$;

/** Recalcula o ponto de quem está no automático. Roda todo dia depois da Zig e ao mudar regra. */
CREATE OR REPLACE FUNCTION fn_central_aplicar_auto()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  WITH s AS (SELECT (x->>'item_id')::uuid AS item_id, (x->>'sugerido')::numeric AS sugerido FROM jsonb_array_elements(fn_central_itens()->'itens') x WHERE x->>'modo' = 'auto')
  UPDATE itens_estoque i SET ponto_reposicao = s.sugerido, estoque_minimo = s.sugerido, ponto_calculado = s.sugerido, ponto_calculado_em = now(), atualizado_em = now()
    FROM s WHERE i.id = s.item_id AND coalesce(i.ponto_reposicao, 0) IS DISTINCT FROM s.sugerido;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN jsonb_build_object('atualizados', n);
END; $$;

/** Um item: manual com o número digitado, ou automático (já aplica a sugestão). */
CREATE OR REPLACE FUNCTION fn_central_definir(p_item uuid, p_modo text, p_ponto numeric DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_antes jsonb; v_sug numeric; v_novo numeric;
BEGIN
  PERFORM setores_exigir_gestor();
  IF p_modo NOT IN ('manual', 'auto') THEN RAISE EXCEPTION 'Modo inválido'; END IF;
  SELECT jsonb_build_object('ponto', ponto_reposicao, 'modo', ponto_modo) INTO v_antes FROM itens_estoque WHERE id = p_item;
  IF v_antes IS NULL THEN RAISE EXCEPTION 'Item não encontrado'; END IF;
  IF p_modo = 'auto' THEN
    SELECT (x->>'sugerido')::numeric INTO v_sug FROM jsonb_array_elements(fn_central_itens()->'itens') x WHERE x->>'item_id' = p_item::text;
    IF v_sug IS NULL THEN RAISE EXCEPTION 'Este item não entra no cálculo do Central (não é insumo ativo).'; END IF;
    v_novo := v_sug;
    UPDATE itens_estoque SET ponto_modo = 'auto', ponto_reposicao = v_novo, estoque_minimo = v_novo, ponto_calculado = v_novo, ponto_calculado_em = now(),
           minimo_manual = false, ponto_revisado_em = now(), atualizado_em = now() WHERE id = p_item;
  ELSE
    IF p_ponto IS NULL OR p_ponto < 0 THEN RAISE EXCEPTION 'Informe o ponto (zero ou mais)'; END IF;
    v_novo := p_ponto;
    UPDATE itens_estoque SET ponto_modo = 'manual', ponto_reposicao = v_novo, estoque_minimo = v_novo, minimo_manual = true, ponto_revisado_em = now(), atualizado_em = now() WHERE id = p_item;
  END IF;
  PERFORM setores_log(NULL, p_item, NULL, 'central_ponto', v_antes, jsonb_build_object('ponto', v_novo, 'modo', p_modo));
  RETURN jsonb_build_object('item_id', p_item, 'modo', p_modo, 'ponto', v_novo);
END; $$;

/** Liga o automático em todos os insumos com consumo. Quem não tem consumo fica como está. */
CREATE OR REPLACE FUNCTION fn_central_auto_em_todos()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE n int;
BEGIN
  PERFORM setores_exigir_gestor();
  WITH s AS (SELECT (x->>'item_id')::uuid AS item_id FROM jsonb_array_elements(fn_central_itens()->'itens') x WHERE (x->>'consumo_dia')::numeric > 0 AND x->>'modo' = 'manual')
  UPDATE itens_estoque i SET ponto_modo = 'auto', minimo_manual = false, ponto_revisado_em = now() FROM s WHERE i.id = s.item_id;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM setores_log(NULL, NULL, NULL, 'central_auto_em_todos', NULL, jsonb_build_object('ligados', n));
  RETURN jsonb_build_object('ligados', n, 'aplicado', fn_central_aplicar_auto());
END; $$;

GRANT EXECUTE ON FUNCTION fn_central_regras(), fn_central_regras_salvar(int, int), fn_central_itens(), fn_central_aplicar_auto(), fn_central_definir(uuid, text, numeric), fn_central_auto_em_todos() TO authenticated;

-- Todo dia às 10:20 UTC (06:20 em Cuiabá), depois da baixa da Zig das 10:00 UTC.
SELECT cron.schedule('central-ponto-automatico', '20 10 * * *', $$ SELECT public.fn_central_aplicar_auto(); $$)
 WHERE NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'central-ponto-automatico');
