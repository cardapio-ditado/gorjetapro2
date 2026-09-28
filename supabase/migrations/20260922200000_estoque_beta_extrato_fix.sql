/*
  # Estoque Beta: extrato do item, saldo acumulado

  O saldo após cada movimento é uma função de janela, e o Postgres não aceita
  função de janela dentro de agregado. O cálculo passa para uma subconsulta.
*/

CREATE OR REPLACE FUNCTION fn_beta_extrato(p_item_id uuid, p_estoque_id uuid DEFAULT NULL, p_inicio date DEFAULT NULL, p_fim date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_inicio date := coalesce(p_inicio, (now() AT TIME ZONE 'America/Cuiaba')::date - 30);
  v_fim date := coalesce(p_fim, (now() AT TIME ZONE 'America/Cuiaba')::date);
  v_saldo_inicial numeric;
  v_movs jsonb;
  v_resumo jsonb;
BEGIN
  CREATE TEMP TABLE IF NOT EXISTS tmp_extrato (
    id uuid, data date, criado_em timestamptz, tipo text, origem text, motivo text, observacoes text,
    estoque_origem text, estoque_destino text, quantidade numeric, sinal int, custo_unitario numeric, custo_total numeric
  ) ON COMMIT DROP;
  DELETE FROM tmp_extrato;

  INSERT INTO tmp_extrato
  SELECT m.id, m.data_movimentacao, m.criado_em, m.tipo_movimentacao, m.origem_tipo, m.motivo, m.observacoes,
         eo.nome, ed.nome, m.quantidade,
         CASE
           WHEN p_estoque_id IS NULL THEN
             CASE WHEN m.tipo_movimentacao = 'transferencia' THEN 0
                  WHEN m.estoque_destino_id IS NOT NULL THEN 1
                  WHEN m.estoque_origem_id IS NOT NULL THEN -1 ELSE 0 END
           ELSE
             CASE WHEN m.estoque_destino_id = p_estoque_id THEN 1
                  WHEN m.estoque_origem_id = p_estoque_id THEN -1 ELSE 0 END
         END,
         m.custo_unitario, m.custo_total
  FROM movimentacoes_estoque m
  LEFT JOIN estoques eo ON eo.id = m.estoque_origem_id
  LEFT JOIN estoques ed ON ed.id = m.estoque_destino_id
  WHERE m.item_id = p_item_id
    AND (p_estoque_id IS NULL OR m.estoque_origem_id = p_estoque_id OR m.estoque_destino_id = p_estoque_id);

  SELECT coalesce(sum(quantidade * sinal), 0) INTO v_saldo_inicial FROM tmp_extrato WHERE data < v_inicio;

  -- Saldo acumulado numa subconsulta; a agregação em JSON vem por fora
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id, 'data', s.data, 'criado_em', s.criado_em, 'tipo', s.tipo, 'origem', s.origem,
    'origem_rotulo', beta_origem_rotulo(s.origem, s.tipo, s.motivo),
    'motivo', s.motivo, 'observacoes', s.observacoes,
    'estoque_origem', s.estoque_origem, 'estoque_destino', s.estoque_destino,
    'quantidade', round(s.quantidade::numeric, 3), 'sinal', s.sinal,
    'saldo_apos', round(s.saldo_apos::numeric, 3),
    'custo_unitario', round(coalesce(s.custo_unitario, 0)::numeric, 4),
    'custo_total', round(coalesce(s.custo_total, 0)::numeric, 2)
  ) ORDER BY s.data DESC, s.criado_em DESC), '[]'::jsonb) INTO v_movs
  FROM (
    SELECT t.*, v_saldo_inicial + sum(t.quantidade * t.sinal) OVER (ORDER BY t.data, t.criado_em, t.id) AS saldo_apos
    FROM tmp_extrato t WHERE t.data BETWEEN v_inicio AND v_fim
  ) s;

  SELECT jsonb_build_object(
    'compras', round(coalesce(sum(quantidade) FILTER (WHERE origem = 'compra' AND sinal = 1), 0)::numeric, 3),
    'vendas', round(coalesce(sum(quantidade) FILTER (WHERE origem = 'zig' AND sinal = -1), 0)::numeric, 3),
    'ajustes_mais', round(coalesce(sum(quantidade) FILTER (WHERE (origem IN ('contagem', 'zeragem', 'normalizacao', 'manual') OR (origem = 'beta' AND motivo ILIKE 'Contagem%')) AND sinal = 1), 0)::numeric, 3),
    'ajustes_menos', round(coalesce(sum(quantidade) FILTER (WHERE (origem IN ('contagem', 'zeragem', 'normalizacao', 'manual') OR (origem = 'beta' AND motivo ILIKE 'Contagem%')) AND sinal = -1), 0)::numeric, 3),
    'transferencias_entrada', round(coalesce(sum(quantidade) FILTER (WHERE tipo = 'transferencia' AND sinal = 1), 0)::numeric, 3),
    'transferencias_saida', round(coalesce(sum(quantidade) FILTER (WHERE tipo = 'transferencia' AND sinal = -1), 0)::numeric, 3),
    'producao_consumo', round(coalesce(sum(quantidade) FILTER (WHERE origem = 'producao' AND sinal = -1), 0)::numeric, 3),
    'producao_entrada', round(coalesce(sum(quantidade) FILTER (WHERE origem = 'producao' AND sinal = 1), 0)::numeric, 3),
    'movimentos', count(*)
  ) INTO v_resumo
  FROM tmp_extrato WHERE data BETWEEN v_inicio AND v_fim;

  RETURN jsonb_build_object(
    'item', (SELECT jsonb_build_object('id', i.id, 'nome', trim(i.nome), 'categoria', i.categoria, 'unidade', i.unidade_medida,
                                       'rotulo_solto', coalesce(c.rotulo_solto, beta_rotulo_padrao(i.unidade_medida)), 'foto_url', c.foto_url,
                                       'custo_medio', round(coalesce(i.custo_medio, 0)::numeric, 4))
             FROM itens_estoque i LEFT JOIN beta_item_config c ON c.item_id = i.id WHERE i.id = p_item_id),
    'estoque', (SELECT jsonb_build_object('id', e.id, 'nome', e.nome) FROM estoques e WHERE e.id = p_estoque_id),
    'inicio', v_inicio, 'fim', v_fim,
    'saldo_inicial', round(v_saldo_inicial::numeric, 3),
    'saldo_final', round((v_saldo_inicial + coalesce((SELECT sum(quantidade * sinal) FROM tmp_extrato WHERE data BETWEEN v_inicio AND v_fim), 0))::numeric, 3),
    'movimentos', v_movs,
    'resumo', v_resumo
  );
END;
$$;
