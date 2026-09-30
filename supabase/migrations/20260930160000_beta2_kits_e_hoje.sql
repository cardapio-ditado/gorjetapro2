/*
  # Estoque Beta 2: kits de limpeza e a tela "Hoje"

  Kits são estoques do tipo 'kit' (garçons, cozinha, bar, serviços gerais):
  a lista do que cada kit deve ter é configurada em Configurar setores, e
  "repor o kit" é uma transferência do Central até o nível. Vizinhos de
  empréstimo serão estoques do tipo 'vizinho' (ainda sem tela).

  `fn_beta2_hoje()` junta os números que a tela inicial mostra por pessoa.
*/

-- ── Tipos de estoque ────────────────────────────────────────────────────────
DO $$
DECLARE v_nome text;
BEGIN
  SELECT conname INTO v_nome FROM pg_constraint
   WHERE conrelid = 'estoques'::regclass AND contype = 'c' AND pg_get_constraintdef(oid) ILIKE '%tipo%';
  IF v_nome IS NOT NULL THEN EXECUTE format('ALTER TABLE estoques DROP CONSTRAINT %I', v_nome); END IF;
  ALTER TABLE estoques ADD CONSTRAINT estoques_tipo_check CHECK (tipo IN ('central', 'producao', 'secundario', 'geral', 'kit', 'vizinho'));
END $$;

INSERT INTO estoques (nome, tipo, status, descricao)
SELECT x.nome, 'kit', true, x.descricao
  FROM (VALUES
    ('Kit dos garçons', 'Material de limpeza e apoio do salão'),
    ('Kit da cozinha', 'Material de limpeza da cozinha'),
    ('Kit do bar', 'Material de limpeza dos bares'),
    ('Kit dos serviços gerais', 'Material de limpeza geral e banheiros')
  ) AS x(nome, descricao)
 WHERE NOT EXISTS (SELECT 1 FROM estoques e WHERE e.nome = x.nome);

-- ── Configurar setores: kits entram, produção e vizinhos ficam de fora ─────
CREATE OR REPLACE FUNCTION fn_setores_resumo()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH cobertura AS (
    SELECT m.estoque_id, coalesce(m.item_estoque_id, fi.item_estoque_id) AS item_id
      FROM mapeamento_itens_vendas m
      LEFT JOIN ficha_ingredientes fi ON fi.ficha_id = m.ficha_tecnica_id AND coalesce(fi.baixa_estoque, true)
     WHERE m.estoque_id IS NOT NULL AND coalesce(m.ignorar_estoque, false) = false
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', e.id, 'nome', e.nome, 'tipo', e.tipo,
    'itens', (SELECT count(*) FROM itens_estoque_niveis n WHERE n.estoque_id = e.id),
    'sem_nivel', (SELECT count(*) FROM itens_estoque_niveis n WHERE n.estoque_id = e.id AND n.nivel_reposicao <= 0),
    'zig', (SELECT count(*) FROM itens_estoque_niveis n WHERE n.estoque_id = e.id AND n.controle = 'venda'),
    'contagem', (SELECT count(*) FROM itens_estoque_niveis n WHERE n.estoque_id = e.id AND n.controle = 'contagem'),
    'zig_sem_venda', (SELECT count(*) FROM itens_estoque_niveis n WHERE n.estoque_id = e.id AND n.controle = 'venda'
                        AND NOT EXISTS (SELECT 1 FROM cobertura c WHERE c.estoque_id = e.id AND c.item_id = n.item_id)),
    'saldo_sem_cadastro', (SELECT count(*) FROM saldos_estoque s JOIN itens_estoque i ON i.id = s.item_id AND i.status = 'ativo'
                            WHERE s.estoque_id = e.id AND s.quantidade_atual <> 0
                              AND NOT EXISTS (SELECT 1 FROM itens_estoque_niveis n WHERE n.estoque_id = e.id AND n.item_id = s.item_id)),
    'negativos', (SELECT count(*) FROM saldos_estoque s WHERE s.estoque_id = e.id AND s.quantidade_atual < 0)
  ) ORDER BY CASE e.tipo WHEN 'kit' THEN 2 ELSE 1 END, e.nome), '[]'::jsonb)
  FROM estoques e WHERE e.status = true AND e.tipo NOT IN ('central', 'producao', 'vizinho');
$$;

-- ── Kits ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_kits()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH central AS (SELECT id FROM estoques WHERE tipo = 'central' AND status LIMIT 1)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', k.id, 'nome', k.nome, 'descricao', k.descricao,
    'itens', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'item_id', i.id, 'nome', trim(i.nome), 'rotulo', coalesce(c.rotulo_solto, i.unidade_medida, 'un'),
        'nivel', n.nivel_reposicao,
        'saldo', round(coalesce(s.quantidade_atual, 0)::numeric, 3),
        'falta', round(greatest(0, n.nivel_reposicao - coalesce(s.quantidade_atual, 0))::numeric, 3),
        'central_tem', round(coalesce(sc.quantidade_atual, 0)::numeric, 3)
      ) ORDER BY trim(i.nome)), '[]'::jsonb)
      FROM itens_estoque_niveis n
      JOIN itens_estoque i ON i.id = n.item_id
      LEFT JOIN beta_item_config c ON c.item_id = i.id
      LEFT JOIN saldos_estoque s ON s.item_id = i.id AND s.estoque_id = k.id
      LEFT JOIN saldos_estoque sc ON sc.item_id = i.id AND sc.estoque_id = (SELECT id FROM central)
     WHERE n.estoque_id = k.id),
    'faltando', (SELECT count(*) FROM itens_estoque_niveis n LEFT JOIN saldos_estoque s ON s.item_id = n.item_id AND s.estoque_id = k.id
                  WHERE n.estoque_id = k.id AND n.nivel_reposicao > coalesce(s.quantidade_atual, 0)),
    'ultima_reposicao', (SELECT max(m.criado_em) FROM movimentacoes_estoque m WHERE m.estoque_destino_id = k.id AND m.origem_tipo = 'kit')
  ) ORDER BY k.nome), '[]'::jsonb)
  FROM estoques k WHERE k.tipo = 'kit' AND k.status;
$$;

/** Repõe o kit a partir do Central. p_itens = [{item_id, quantidade}]. O que o Central não tem, avisa. */
CREATE OR REPLACE FUNCTION fn_kit_repor(p_kit uuid, p_itens jsonb, p_responsavel text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_central uuid; r record; v_saldo numeric; v_qtd numeric; v_custo numeric; v_nome text; v_n int := 0; v_faltou text[] := '{}'; v_seq int := 0;
BEGIN
  SELECT id INTO v_central FROM estoques WHERE tipo = 'central' AND status LIMIT 1;
  IF NOT EXISTS (SELECT 1 FROM estoques WHERE id = p_kit AND tipo = 'kit' AND status) THEN RAISE EXCEPTION 'Kit não encontrado'; END IF;
  FOR r IN SELECT (x->>'item_id')::uuid AS item_id, (x->>'quantidade')::numeric AS quantidade FROM jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x LOOP
    IF r.quantidade IS NULL OR r.quantidade <= 0 THEN CONTINUE; END IF;
    SELECT trim(nome), coalesce(custo_medio, 0) INTO v_nome, v_custo FROM itens_estoque WHERE id = r.item_id;
    SELECT coalesce(quantidade_atual, 0) INTO v_saldo FROM saldos_estoque WHERE estoque_id = v_central AND item_id = r.item_id;
    v_saldo := coalesce(v_saldo, 0);
    v_qtd := least(r.quantidade, greatest(v_saldo, 0));
    IF v_qtd < r.quantidade THEN v_faltou := v_faltou || (v_nome || ': Central tem ' || round(greatest(v_saldo, 0), 2) || ', pedia ' || round(r.quantidade, 2)); END IF;
    IF v_qtd <= 0 THEN CONTINUE; END IF;
    v_seq := v_seq + 1;
    INSERT INTO movimentacoes_estoque (item_id, tipo_movimentacao, quantidade, estoque_origem_id, estoque_destino_id, custo_unitario, custo_total, data_movimentacao, motivo, observacoes, origem_tipo, criado_por, item_descricao, idempotency_key)
    VALUES (r.item_id, 'transferencia', v_qtd, v_central, p_kit, v_custo, v_qtd * v_custo, current_date, 'Reposição do kit', coalesce('Reposto por ' || nullif(p_responsavel, ''), 'Reposição do kit'), 'kit', fn_usuario_sistema_id(), v_nome,
            'kit_repor_' || p_kit || '_' || r.item_id || '_' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS') || '_' || v_seq);
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('itens', v_n, 'faltou', to_jsonb(v_faltou));
END; $$;

-- ── A tela "Hoje" ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_beta2_hoje()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_central uuid; v_blocos jsonb; v_zig record; v_uid uuid := fn_usuario_sistema_id(); v_gestor boolean; v_aprovador boolean;
BEGIN
  SELECT id INTO v_central FROM estoques WHERE tipo = 'central' AND status LIMIT 1;
  v_blocos := fn_contagem_blocos(v_central);
  SELECT status, coalesce(total_nao_mapeados, 0) AS nao_mapeados, finalizado_em INTO v_zig FROM zig_vendas_sync_logs ORDER BY iniciado_em DESC LIMIT 1;
  SELECT nivel IN ('admin', 'master') INTO v_gestor FROM usuarios_sistema WHERE id = v_uid;
  v_aprovador := v_uid::text IN (SELECT jsonb_array_elements_text(coalesce((SELECT valor FROM configuracoes_sistema WHERE chave = 'estoque_aprovadores'), '[]')::jsonb));

  RETURN jsonb_build_object(
    'hoje', (now() AT TIME ZONE 'America/Cuiaba')::date,
    'gestor', coalesce(v_gestor, false),
    'aprovador', coalesce(v_aprovador, false),
    'pedidos_a_entregar', (SELECT count(*) FROM requisicoes_internas WHERE status IN ('pendente', 'aprovado')),
    'notas_pendentes', (SELECT count(*) FROM entradas_compras WHERE status = 'pendente'),
    'zonas_central', jsonb_build_object(
      'vencidas', (SELECT count(*) FROM jsonb_array_elements(coalesce(v_blocos->'blocos', '[]'::jsonb)) b WHERE b->>'situacao' IN ('atrasado', 'vence_hoje', 'nunca')),
      'em_andamento', (SELECT count(*) FROM jsonb_array_elements(coalesce(v_blocos->'blocos', '[]'::jsonb)) b WHERE b->>'situacao' = 'em_andamento'),
      'total', jsonb_array_length(coalesce(v_blocos->'blocos', '[]'::jsonb))),
    'negativos', (SELECT count(*) FROM saldos_estoque s JOIN estoques e ON e.id = s.estoque_id AND e.status WHERE s.quantidade_atual < 0),
    'zig', CASE WHEN v_zig IS NULL THEN NULL ELSE jsonb_build_object('status', v_zig.status, 'nao_mapeados', v_zig.nao_mapeados, 'finalizado_em', v_zig.finalizado_em) END,
    'central_abaixo_ponto', (SELECT count(*) FROM itens_estoque i JOIN saldos_estoque s ON s.item_id = i.id AND s.estoque_id = v_central
                              WHERE i.status = 'ativo' AND coalesce(i.ponto_reposicao, 0) > 0 AND s.quantidade_atual < i.ponto_reposicao),
    'kits_faltando', (SELECT count(*) FROM estoques k WHERE k.tipo = 'kit' AND k.status
                        AND EXISTS (SELECT 1 FROM itens_estoque_niveis n LEFT JOIN saldos_estoque s ON s.item_id = n.item_id AND s.estoque_id = k.id
                                     WHERE n.estoque_id = k.id AND n.nivel_reposicao > coalesce(s.quantidade_atual, 0))),
    'setores_pendencias', (SELECT coalesce(sum((x->>'sem_nivel')::int + (x->>'zig_sem_venda')::int), 0) FROM jsonb_array_elements(fn_setores_resumo()) x),
    'setores_vazios', (SELECT coalesce(jsonb_agg(x->>'nome'), '[]'::jsonb) FROM jsonb_array_elements(fn_setores_resumo()) x WHERE (x->>'itens')::int = 0)
  );
END; $$;

GRANT EXECUTE ON FUNCTION fn_kits(), fn_kit_repor(uuid, jsonb, text), fn_beta2_hoje() TO authenticated;
