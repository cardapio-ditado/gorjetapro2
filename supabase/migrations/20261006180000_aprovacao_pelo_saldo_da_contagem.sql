-- Aprovação de auditoria acerta pelo saldo de quando se contou.
--
-- Antes, processar_contagem_estoque comparava o contado com o saldo do momento
-- do processamento. Quando a auditoria era aprovada no dia seguinte, depois da
-- baixa automática da Zig, o acerto "devolvia" as vendas da noite: o saldo
-- voltava ao contado e as vendas sumiam do consumo.
--
-- Agora as contagens do Beta 2 (setores e Central) acertam pela foto que a
-- folha mostrou: diferença = contado − quantidade_sistema (gravada ao abrir a
-- folha). O que entrou ou saiu depois da contagem fica preservado.
-- processar_contagem_estoque continua existindo para o que ainda a usa.

CREATE OR REPLACE FUNCTION fn_contagem_processar_pela_folha(p_contagem_id uuid, p_usuario_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c record; v_i record; v_dif numeric; v_tipo text; v_qtd numeric; v_mov uuid; v_chave text; v_ajustes int := 0; v_sem int := 0;
BEGIN
  SELECT * INTO v_c FROM contagens_estoque WHERE id = p_contagem_id FOR UPDATE;
  IF v_c.id IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Contagem não encontrada'); END IF;
  IF v_c.status NOT IN ('em_andamento', 'finalizada') THEN RETURN jsonb_build_object('success', false, 'error', 'Contagem não pode ser processada. Status atual: ' || v_c.status); END IF;

  FOR v_i IN SELECT * FROM contagens_estoque_itens WHERE contagem_id = p_contagem_id AND quantidade_contada IS NOT NULL LOOP
    -- A base é a foto da folha. Se por algum motivo não houver foto, cai no saldo atual (comportamento antigo).
    v_dif := round((v_i.quantidade_contada - coalesce(v_i.quantidade_sistema, calcular_saldo_item_estoque(v_i.item_estoque_id, v_c.estoque_id)))::numeric, 4);
    IF v_dif = 0 THEN v_sem := v_sem + 1; CONTINUE; END IF;
    v_tipo := CASE WHEN v_dif > 0 THEN 'entrada' ELSE 'saida' END; v_qtd := abs(v_dif);
    v_chave := 'contagem_' || p_contagem_id::text || '_' || v_i.item_estoque_id::text;
    IF EXISTS (SELECT 1 FROM movimentacoes_estoque WHERE idempotency_key = v_chave) THEN v_ajustes := v_ajustes + 1; CONTINUE; END IF;

    INSERT INTO movimentacoes_estoque (item_id, tipo_movimentacao, origem_tipo, quantidade, estoque_origem_id, estoque_destino_id, custo_unitario, custo_total, data_movimentacao, motivo, observacoes, criado_por, criado_em, origem_id, idempotency_key)
    VALUES (v_i.item_estoque_id, v_tipo, 'contagem', v_qtd,
            CASE WHEN v_tipo = 'saida' THEN v_c.estoque_id END, CASE WHEN v_tipo = 'entrada' THEN v_c.estoque_id END,
            coalesce(v_i.valor_unitario, 0), v_qtd * coalesce(v_i.valor_unitario, 0), v_c.data_contagem::date,
            'Ajuste de contagem física',
            concat('Contagem: ', p_contagem_id::text, ' | Contado: ', v_i.quantidade_contada, ' | Sistema na folha: ', v_i.quantidade_sistema, ' | Diff: ', v_dif),
            coalesce(p_usuario_id, v_c.criado_por), now(), p_contagem_id, v_chave)
    RETURNING id INTO v_mov;

    INSERT INTO contagens_estoque_ajustes (contagem_id, contagem_item_id, tipo_ajuste, quantidade_ajustada, motivo, movimentacao_id, criado_por)
    VALUES (p_contagem_id, v_i.id, CASE WHEN v_dif > 0 THEN 'sobra' ELSE 'perda' END, v_qtd, 'Ajuste automático por contagem física', v_mov, coalesce(p_usuario_id, v_c.criado_por))
    ON CONFLICT DO NOTHING;
    v_ajustes := v_ajustes + 1;
  END LOOP;

  UPDATE contagens_estoque SET status = 'processada', processado_em = now() WHERE id = p_contagem_id;
  RETURN jsonb_build_object('success', true, 'total_ajustes', v_ajustes, 'total_sem_diff', v_sem);
END $$;

-- Aprovação: "manter o sistema" em um item = contado passa a ser a foto da folha (diferença zero).
CREATE OR REPLACE FUNCTION fn_aprovacao_decidir(p_id uuid, p_acao text, p_manter uuid[] DEFAULT '{}'::uuid[], p_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c record; v_proc jsonb; v_uid uuid := fn_usuario_sistema_id(); n int := 0;
BEGIN
  IF NOT (v_uid::text IN (SELECT jsonb_array_elements_text(coalesce((SELECT valor FROM configuracoes_sistema WHERE chave = 'estoque_aprovadores'), '[]')::jsonb))
          OR EXISTS (SELECT 1 FROM usuarios_sistema WHERE id = v_uid AND nivel = 'master')) THEN
    RAISE EXCEPTION 'Só quem está na lista de aprovadores pode decidir.';
  END IF;
  SELECT * INTO v_c FROM contagens_estoque WHERE id = p_id AND bloco = '__auditoria';
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'Auditoria não encontrada'; END IF;
  IF v_c.status <> 'finalizada' THEN RAISE EXCEPTION 'Esta auditoria já foi decidida.'; END IF;
  IF p_acao = 'rejeitar' THEN
    UPDATE contagens_estoque SET status = 'cancelada', observacoes = concat_ws(' | ', observacoes, 'Rejeitada: ' || coalesce(p_motivo, 'sem motivo')) WHERE id = p_id;
    PERFORM setores_log(v_c.estoque_id, NULL, NULL, 'auditoria_rejeitada', NULL, jsonb_build_object('contagem', p_id, 'motivo', p_motivo));
    RETURN jsonb_build_object('id', p_id, 'acao', 'rejeitada');
  ELSIF p_acao = 'aprovar' THEN
    IF array_length(p_manter, 1) IS NOT NULL THEN
      UPDATE contagens_estoque_itens ci SET quantidade_contada = coalesce(ci.quantidade_sistema, calcular_saldo_item_estoque(ci.item_estoque_id, v_c.estoque_id)),
             observacao = concat_ws(' | ', observacao, 'Mantido o sistema na aprovação')
       WHERE ci.contagem_id = p_id AND ci.id = ANY (p_manter);
      GET DIAGNOSTICS n = ROW_COUNT;
    END IF;
    v_proc := fn_contagem_processar_pela_folha(p_id, v_uid);
    IF coalesce((v_proc->>'success')::boolean, false) = false THEN RAISE EXCEPTION '%', v_proc->>'error'; END IF;
    UPDATE contagens_estoque SET observacoes = concat_ws(' | ', observacoes, 'Aprovada' || CASE WHEN p_motivo IS NOT NULL THEN ': ' || p_motivo ELSE '' END) WHERE id = p_id;
    PERFORM setores_log(v_c.estoque_id, NULL, NULL, 'auditoria_aprovada', NULL, jsonb_build_object('contagem', p_id, 'acertos', v_proc->'total_ajustes', 'mantidos', n));
    RETURN jsonb_build_object('id', p_id, 'acao', 'aprovada', 'acertos', (v_proc->>'total_ajustes')::int, 'mantidos', n);
  END IF;
  RAISE EXCEPTION 'Ação inválida';
END; $$;

-- Concluir contagem do setor: a diária e a auditoria sem diferença processam na hora, pela folha.
CREATE OR REPLACE FUNCTION fn_contagem_setor_concluir(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_c record; v_fin json; v_proc jsonb; v_dif int; v_valor numeric;
BEGIN
  SELECT * INTO v_c FROM contagens_estoque WHERE id = p_id;
  IF v_c.id IS NULL THEN RAISE EXCEPTION 'Contagem não encontrada'; END IF;
  IF v_c.status <> 'em_andamento' THEN RAISE EXCEPTION 'Esta contagem já foi concluída.'; END IF;
  IF v_c.bloco NOT IN ('__diaria', '__auditoria') THEN RAISE EXCEPTION 'Use a tela do Central para esta contagem.'; END IF;
  v_fin := finalizar_contagem_estoque(p_id);
  IF coalesce((v_fin->>'success')::boolean, false) = false THEN RAISE EXCEPTION '%', v_fin->>'error'; END IF;
  SELECT count(*) FILTER (WHERE quantidade_contada IS NOT NULL AND coalesce(diferenca, 0) <> 0), coalesce(sum(abs(valor_diferenca)) FILTER (WHERE quantidade_contada IS NOT NULL AND coalesce(diferenca, 0) <> 0), 0)
    INTO v_dif, v_valor FROM contagens_estoque_itens WHERE contagem_id = p_id;
  IF v_c.bloco = '__diaria' OR v_dif = 0 THEN
    v_proc := fn_contagem_processar_pela_folha(p_id, fn_usuario_sistema_id());
    RETURN jsonb_build_object('id', p_id, 'modo', CASE v_c.bloco WHEN '__diaria' THEN 'diaria' ELSE 'auditoria' END, 'aprovacao', false,
      'contados', (v_fin->>'total_contados')::int, 'acertos', (v_proc->>'total_ajustes')::int, 'valor', v_valor);
  END IF;
  RETURN jsonb_build_object('id', p_id, 'modo', 'auditoria', 'aprovacao', true, 'contados', (v_fin->>'total_contados')::int, 'diferencas', v_dif, 'valor', v_valor);
END; $$;
