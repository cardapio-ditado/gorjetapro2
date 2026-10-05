-- Vínculos da Zig no Beta 2.
--
-- A tabela mapeamento_itens_vendas já é a verdade: a baixa automática
-- (zig-baixa-automatica, 3h e 10h) lê o vínculo pelo nome do produto da
-- Zig e cadastra sozinha, sem vínculo, tudo que vendeu e não conhecia.
-- Aqui só entram a porta da tela (catálogo com situação e vendas dos
-- últimos 30 dias, lidas dos logs) e o salvar, com as mesmas regras do
-- edge function: item ou ficha + estoque de origem, ou ignorar.

CREATE OR REPLACE FUNCTION fn_zig_vinculos_tela()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_produtos jsonb; v_tot jsonb; v_sync jsonb; v_estoques jsonb; v_fichas jsonb;
BEGIN
  -- Vendas dos últimos 30 dias por produto, somando o que baixou e o que ficou pendente.
  WITH logs AS (
    SELECT * FROM zig_vendas_sync_logs WHERE iniciado_em >= now() - interval '30 days' AND status IN ('sucesso', 'sucesso_parcial')
  ), vendas AS (
    SELECT x->>'nome' nome, sum(coalesce((x->>'quantidade')::numeric, 0)) qtd, max(x->>'data_venda') ultima, 0 pendencias
    FROM logs, jsonb_array_elements(coalesce(logs.itens_processados, '[]'::jsonb)) x GROUP BY 1
    UNION ALL
    SELECT x->>'nome', sum(coalesce((x->>'quantidade')::numeric, 0)), max(x->>'data_venda'), count(*)
    FROM logs, jsonb_array_elements(coalesce(logs.itens_pendentes, '[]'::jsonb)) x GROUP BY 1
  ), por_nome AS (
    SELECT nome, sum(qtd) qtd, max(ultima) ultima, sum(pendencias) pendencias FROM vendas GROUP BY nome
  ), prod AS (
    SELECT m.id, m.nome_externo nome, coalesce(nullif(trim(m.zig_category), ''), 'Sem categoria') categoria,
           CASE WHEN m.ignorar_estoque THEN 'ignorar'
                WHEN m.estoque_id IS NOT NULL AND m.ficha_tecnica_id IS NOT NULL THEN 'ficha'
                WHEN m.estoque_id IS NOT NULL AND m.item_estoque_id IS NOT NULL THEN 'item'
                WHEN m.item_estoque_id IS NOT NULL OR m.ficha_tecnica_id IS NOT NULL OR m.estoque_id IS NOT NULL THEN 'incompleto'
                ELSE 'sem_vinculo' END situacao,
           m.item_estoque_id item_id, trim(i.nome) item_nome, i.unidade_medida item_um,
           m.ficha_tecnica_id ficha_id, f.nome ficha_nome,
           m.estoque_id, e.nome estoque_nome, coalesce(m.expandir_additions, false) expandir,
           coalesce(v.qtd, 0) vendido_30d, v.ultima ultima_venda, coalesce(v.pendencias, 0) pendencias, m.usado_vezes, m.atualizado_em
    FROM mapeamento_itens_vendas m
    LEFT JOIN itens_estoque i ON i.id = m.item_estoque_id
    LEFT JOIN fichas_tecnicas f ON f.id = m.ficha_tecnica_id
    LEFT JOIN estoques e ON e.id = m.estoque_id
    LEFT JOIN por_nome v ON v.nome = m.nome_externo
  )
  SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY CASE situacao WHEN 'sem_vinculo' THEN 0 WHEN 'incompleto' THEN 1 WHEN 'item' THEN 2 WHEN 'ficha' THEN 2 ELSE 3 END, vendido_30d DESC, nome), '[]'::jsonb),
         jsonb_build_object(
           'sem_vinculo', count(*) FILTER (WHERE situacao = 'sem_vinculo'),
           'incompletos', count(*) FILTER (WHERE situacao = 'incompleto'),
           'ignorados', count(*) FILTER (WHERE situacao = 'ignorar'),
           'vinculados', count(*) FILTER (WHERE situacao IN ('item', 'ficha')),
           'sem_vinculo_vendendo', count(*) FILTER (WHERE situacao IN ('sem_vinculo', 'incompleto') AND vendido_30d > 0),
           'vendas_paradas_30d', coalesce(sum(vendido_30d) FILTER (WHERE situacao IN ('sem_vinculo', 'incompleto')), 0))
  INTO v_produtos, v_tot FROM prod p;

  SELECT jsonb_build_object('iniciado_em', iniciado_em, 'status', status, 'periodo', dtinicio || ' a ' || dtfim, 'baixados', total_mapeados, 'pendentes', total_nao_mapeados, 'ignorados', total_ignorados, 'movimentacoes', total_movimentacoes, 'erro', erro_mensagem)
  INTO v_sync FROM zig_vendas_sync_logs ORDER BY iniciado_em DESC LIMIT 1;

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'tipo', tipo) ORDER BY CASE tipo WHEN 'geral' THEN 0 WHEN 'secundario' THEN 1 WHEN 'central' THEN 2 ELSE 3 END, nome), '[]'::jsonb)
  INTO v_estoques FROM estoques WHERE status AND tipo IN ('central', 'geral', 'secundario', 'producao');

  SELECT coalesce(jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'tipo', coalesce(tipo_consumo, '')) ORDER BY nome), '[]'::jsonb)
  INTO v_fichas FROM fichas_tecnicas WHERE coalesce(ativo, true);

  RETURN jsonb_build_object('produtos', v_produtos, 'totais', v_tot, 'ultimo_sync', v_sync, 'estoques', v_estoques, 'fichas', v_fichas);
END $$;

-- p: { nome, modo: item | ficha | ignorar | limpar, item_id, ficha_id, estoque_id, expandir }
CREATE OR REPLACE FUNCTION fn_zig_vinculo_salvar(p jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nome text := trim(coalesce(p->>'nome', '')); v_modo text := coalesce(p->>'modo', ''); v_item uuid := nullif(p->>'item_id', '')::uuid;
        v_ficha uuid := nullif(p->>'ficha_id', '')::uuid; v_est uuid := nullif(p->>'estoque_id', '')::uuid; v_exp boolean := coalesce((p->>'expandir')::boolean, false); v_id uuid;
BEGIN
  IF v_nome = '' THEN RAISE EXCEPTION 'Produto da Zig sem nome'; END IF;
  IF v_modo NOT IN ('item', 'ficha', 'ignorar', 'limpar') THEN RAISE EXCEPTION 'Modo inválido'; END IF;
  IF v_modo = 'item' AND (v_item IS NULL OR v_est IS NULL) THEN RAISE EXCEPTION 'Escolha o item e o estoque de onde sai'; END IF;
  IF v_modo = 'ficha' AND (v_ficha IS NULL OR v_est IS NULL) THEN RAISE EXCEPTION 'Escolha a ficha e o estoque de onde sai'; END IF;
  IF v_modo = 'item' AND NOT EXISTS (SELECT 1 FROM itens_estoque WHERE id = v_item AND status = 'ativo') THEN RAISE EXCEPTION 'Item não encontrado ou inativo'; END IF;
  IF v_modo = 'ficha' AND NOT EXISTS (SELECT 1 FROM fichas_tecnicas WHERE id = v_ficha AND coalesce(ativo, true)) THEN RAISE EXCEPTION 'Ficha não encontrada ou inativa'; END IF;
  IF v_est IS NOT NULL AND NOT EXISTS (SELECT 1 FROM estoques WHERE id = v_est AND status AND tipo IN ('central', 'geral', 'secundario', 'producao')) THEN RAISE EXCEPTION 'Estoque de origem inválido'; END IF;

  INSERT INTO mapeamento_itens_vendas (nome_externo, nome_normalizado, item_estoque_id, ficha_tecnica_id, estoque_id, ignorar_estoque, expandir_additions, tipo_mapeamento, origem, confianca, atualizado_em)
  VALUES (v_nome, lower(regexp_replace(unaccent(v_nome), '\s+', ' ', 'g')),
          CASE WHEN v_modo = 'item' THEN v_item END, CASE WHEN v_modo = 'ficha' THEN v_ficha END, CASE WHEN v_modo IN ('item', 'ficha') THEN v_est END,
          v_modo = 'ignorar', v_exp AND v_modo <> 'ignorar', 'manual', 'manual', CASE WHEN v_modo = 'limpar' THEN 0 ELSE 1 END, now())
  ON CONFLICT (nome_externo) DO UPDATE SET
    item_estoque_id = EXCLUDED.item_estoque_id, ficha_tecnica_id = EXCLUDED.ficha_tecnica_id, estoque_id = EXCLUDED.estoque_id,
    ignorar_estoque = EXCLUDED.ignorar_estoque, expandir_additions = EXCLUDED.expandir_additions,
    tipo_mapeamento = 'manual', origem = 'manual', confianca = EXCLUDED.confianca, atualizado_em = now()
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('id', v_id, 'nome', v_nome, 'modo', v_modo);
END $$;
