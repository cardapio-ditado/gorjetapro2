-- Contagem do Central no Beta 2.
--
-- A máquina de zonas (blocos por categoria, ciclo, agenda) já existe:
-- fn_contagem_blocos, fn_contagem_bloco_abrir, fn_contagem_bloco_concluir,
-- fn_contagem_ciclo_definir e as fn_contagem_agenda_*. Aqui só entram a
-- porta única da tela e a folha de uma zona (todas as linhas, sem o filtro
-- de portfólio dos setores). Anotar reaproveita fn_contagem_setor_anotar.

CREATE OR REPLACE FUNCTION fn_contagem_central_tela()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_central uuid; v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date; v_blocos jsonb; v_agenda jsonb; v_ultimas jsonb;
BEGIN
  SELECT id INTO v_central FROM estoques WHERE tipo = 'central' AND status LIMIT 1;
  v_blocos := fn_contagem_blocos(v_central);
  v_agenda := fn_contagem_agenda(v_central, v_hoje - 1, v_hoje + 13);
  SELECT coalesce(jsonb_agg(x ORDER BY (x->>'processado_em') DESC), '[]'::jsonb) INTO v_ultimas FROM (
    SELECT jsonb_build_object('id', c.id, 'bloco', c.bloco, 'data', c.data_contagem::date, 'processado_em', c.processado_em, 'responsavel', c.responsavel,
             'contados', (SELECT count(*) FROM contagens_estoque_itens ci WHERE ci.contagem_id = c.id AND ci.quantidade_contada IS NOT NULL),
             'diferencas', (SELECT count(*) FROM contagens_estoque_itens ci WHERE ci.contagem_id = c.id AND coalesce(ci.diferenca, 0) <> 0),
             'valor', (SELECT round(coalesce(sum(ci.valor_diferenca), 0), 2) FROM contagens_estoque_itens ci WHERE ci.contagem_id = c.id)) x
    FROM contagens_estoque c
    WHERE c.estoque_id = v_central AND c.status = 'processada' AND c.bloco IS NOT NULL
    ORDER BY c.processado_em DESC LIMIT 12
  ) q;
  RETURN jsonb_build_object(
    'hoje', v_hoje, 'estoque', v_blocos->'estoque', 'tem_agenda', v_blocos->'tem_agenda',
    'blocos', v_blocos->'blocos', 'resumo', v_blocos->'resumo',
    'agenda', coalesce(v_agenda->'itens', '[]'::jsonb), 'ultimas', v_ultimas);
END $$;

CREATE OR REPLACE FUNCTION fn_contagem_central_itens(p_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'id', c.id, 'estoque', jsonb_build_object('id', e.id, 'nome', e.nome), 'bloco', c.bloco,
    'nome', CASE c.bloco WHEN '__zerados' THEN 'Zerados na última contagem' ELSE coalesce(c.bloco, 'Contagem') END,
    'status', c.status, 'responsavel', c.responsavel, 'criado_em', c.criado_em,
    'contados', (SELECT count(*) FROM contagens_estoque_itens ci WHERE ci.contagem_id = c.id AND ci.quantidade_contada IS NOT NULL),
    'total', (SELECT count(*) FROM contagens_estoque_itens ci WHERE ci.contagem_id = c.id),
    'itens', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'linha_id', ci.id, 'item_id', ci.item_estoque_id, 'nome', trim(i.nome), 'categoria', coalesce(nullif(btrim(i.categoria), ''), 'Sem categoria'), 'um', i.unidade_medida,
        'sistema', round(calcular_saldo_item_estoque(ci.item_estoque_id, c.estoque_id), 3), 'contada', ci.quantidade_contada, 'valor_unitario', ci.valor_unitario
      ) ORDER BY trim(i.nome)), '[]'::jsonb)
      FROM contagens_estoque_itens ci JOIN itens_estoque i ON i.id = ci.item_estoque_id WHERE ci.contagem_id = c.id)
  ) FROM contagens_estoque c JOIN estoques e ON e.id = c.estoque_id WHERE c.id = p_id;
$$;
