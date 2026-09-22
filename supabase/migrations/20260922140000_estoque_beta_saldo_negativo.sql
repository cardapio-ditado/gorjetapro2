/*
  # Estoque Beta: item com saldo negativo é contado, não reposto no escuro

  No primeiro dia muitos itens de venda estão com saldo negativo no sistema
  (herança da transferência que nunca era lançada). Repor "até o nível" a
  partir de um saldo negativo geraria uma transferência absurda. Regra:

    - saldo do balcão negativo (ou acima do nível) = o sistema não é
      confiável para esse item hoje, então ele entra na contagem do dia;
    - a contagem acerta o saldo e só então o sistema calcula o que levar.

  A flag fica gravada na própria montagem para que a tela, o fechamento da
  contagem e a conclusão usem a mesma regra.
*/

ALTER TABLE beta_montagem_itens
  ADD COLUMN IF NOT EXISTS precisa_contar boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION fn_beta_montagem_abrir(p_estoque_id uuid, p_responsavel text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_conf boolean := extract(isodow FROM (now() AT TIME ZONE 'America/Cuiaba')::date) IN (1, 4);
  v_central uuid;
  v_m beta_montagens%ROWTYPE;
BEGIN
  SELECT id INTO v_central FROM estoques WHERE tipo = 'central' LIMIT 1;
  SELECT * INTO v_m FROM beta_montagens WHERE estoque_id = p_estoque_id AND data = v_hoje;

  IF v_m.id IS NULL THEN
    INSERT INTO beta_montagens (estoque_id, data, conferencia, responsavel)
    VALUES (p_estoque_id, v_hoje, v_conf, p_responsavel) RETURNING * INTO v_m;

    INSERT INTO beta_montagem_itens (montagem_id, item_id, controle, nivel, saldo_antes, precisa_contar, levar)
    SELECT v_m.id, n.item_id, coalesce(n.controle, 'contagem'), coalesce(n.nivel_reposicao, 0),
           coalesce(s.quantidade_atual, 0),
           -- conta quando: não baixa por venda, é dia de conferência, ou o saldo não é confiável
           (coalesce(n.controle, 'contagem') = 'contagem'
              OR v_conf
              OR coalesce(s.quantidade_atual, 0) < 0
              OR coalesce(s.quantidade_atual, 0) > coalesce(n.nivel_reposicao, 0) * 3),
           -- item de venda confiável em dia comum: levar = nível - saldo do sistema
           CASE WHEN coalesce(n.controle, 'contagem') = 'venda' AND NOT v_conf
                     AND coalesce(s.quantidade_atual, 0) >= 0
                     AND coalesce(s.quantidade_atual, 0) <= coalesce(n.nivel_reposicao, 0) * 3
                THEN greatest(0, coalesce(n.nivel_reposicao, 0) - coalesce(s.quantidade_atual, 0))
                ELSE 0 END
    FROM itens_estoque_niveis n
    JOIN itens_estoque i ON i.id = n.item_id AND i.status = 'ativo'
    LEFT JOIN saldos_estoque s ON s.item_id = n.item_id AND s.estoque_id = p_estoque_id
    WHERE n.estoque_id = p_estoque_id AND coalesce(n.nivel_reposicao, 0) > 0;
  ELSIF v_m.status = 'contando' AND p_responsavel IS NOT NULL AND v_m.responsavel IS NULL THEN
    UPDATE beta_montagens SET responsavel = p_responsavel WHERE id = v_m.id;
  END IF;

  RETURN jsonb_build_object(
    'montagem', (SELECT to_jsonb(m) FROM beta_montagens m WHERE m.id = v_m.id),
    'estoque', (SELECT jsonb_build_object('id', e.id, 'nome', e.nome) FROM estoques e WHERE e.id = p_estoque_id),
    'itens', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'item_id', mi.item_id, 'nome', trim(i.nome), 'categoria', i.categoria, 'unidade', i.unidade_medida,
        'controle', mi.controle, 'precisa_contar', mi.precisa_contar,
        'nivel', mi.nivel, 'saldo_antes', mi.saldo_antes,
        'saldo_central', coalesce((SELECT sc.quantidade_atual FROM saldos_estoque sc
                                   WHERE sc.item_id = mi.item_id AND sc.estoque_id = v_central), 0),
        'fechados', mi.fechados, 'soltos', mi.soltos, 'contado', mi.contado, 'levar', mi.levar,
        'entregue', mi.entregue, 'contado_em', mi.contado_em,
        'rotulo_solto', coalesce(c.rotulo_solto, beta_rotulo_padrao(i.unidade_medida)),
        'rotulo_fechado', c.rotulo_fechado, 'fator_fechado', c.fator_fechado,
        'permite_fracao', coalesce(c.permite_fracao, false), 'foto_url', c.foto_url, 'dica', c.dica
      ) ORDER BY i.categoria, trim(i.nome)), '[]'::jsonb)
      FROM beta_montagem_itens mi
      JOIN itens_estoque i ON i.id = mi.item_id
      LEFT JOIN beta_item_config c ON c.item_id = mi.item_id
      WHERE mi.montagem_id = v_m.id
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION fn_beta_montagem_fechar_contagem(p_montagem_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_faltam int;
BEGIN
  SELECT count(*) INTO v_faltam
  FROM beta_montagem_itens mi
  WHERE mi.montagem_id = p_montagem_id AND mi.precisa_contar AND mi.contado_em IS NULL;

  IF v_faltam > 0 THEN
    RETURN jsonb_build_object('success', false, 'faltam', v_faltam);
  END IF;

  UPDATE beta_montagens SET status = 'levando' WHERE id = p_montagem_id AND status = 'contando';

  RETURN jsonb_build_object('success', true,
    'levar', (SELECT count(*) FROM beta_montagem_itens WHERE montagem_id = p_montagem_id AND levar > 0));
END;
$$;

-- Conclusão: recusa se ainda houver item obrigatório sem contar
CREATE OR REPLACE FUNCTION fn_beta_montagem_concluir(p_montagem_id uuid, p_entregas jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_m beta_montagens%ROWTYPE; v_central uuid; v_it record;
  v_saldo numeric; v_dif numeric; v_custo numeric;
  v_ajustes int := 0; v_transf int := 0; v_entregue numeric; v_faltam int;
BEGIN
  SELECT * INTO v_m FROM beta_montagens WHERE id = p_montagem_id;
  IF v_m.id IS NULL THEN RAISE EXCEPTION 'Montagem não encontrada'; END IF;
  IF v_m.status = 'concluida' THEN RETURN jsonb_build_object('success', true, 'ja_concluida', true); END IF;

  SELECT count(*) INTO v_faltam FROM beta_montagem_itens
  WHERE montagem_id = p_montagem_id AND precisa_contar AND contado_em IS NULL;
  IF v_faltam > 0 THEN
    RAISE EXCEPTION 'Ainda faltam % itens para contar', v_faltam;
  END IF;

  SELECT id INTO v_central FROM estoques WHERE tipo = 'central' LIMIT 1;

  IF p_entregas IS NOT NULL THEN
    UPDATE beta_montagem_itens mi SET entregue = (e->>'entregue')::numeric
    FROM jsonb_array_elements(p_entregas) e
    WHERE mi.montagem_id = p_montagem_id AND mi.item_id = (e->>'item_id')::uuid;
  END IF;

  FOR v_it IN
    SELECT mi.*, i.custo_medio FROM beta_montagem_itens mi JOIN itens_estoque i ON i.id = mi.item_id
    WHERE mi.montagem_id = p_montagem_id
  LOOP
    v_custo := coalesce(v_it.custo_medio, 0);

    IF v_it.contado_em IS NOT NULL THEN
      SELECT coalesce(quantidade_atual, 0) INTO v_saldo
      FROM saldos_estoque WHERE item_id = v_it.item_id AND estoque_id = v_m.estoque_id;
      v_saldo := coalesce(v_saldo, 0);
      v_dif := v_it.contado - v_saldo;
      IF abs(v_dif) >= 0.001 THEN
        INSERT INTO movimentacoes_estoque
          (estoque_origem_id, estoque_destino_id, item_id, tipo_movimentacao, quantidade,
           custo_unitario, custo_total, data_movimentacao, motivo, origem_tipo, origem_id, idempotency_key)
        VALUES
          (CASE WHEN v_dif < 0 THEN v_m.estoque_id END, CASE WHEN v_dif > 0 THEN v_m.estoque_id END,
           v_it.item_id, CASE WHEN v_dif > 0 THEN 'entrada' ELSE 'saida' END,
           abs(v_dif), v_custo, abs(v_dif) * v_custo, v_m.data,
           'Contagem na montagem do balcão (beta)', 'beta', p_montagem_id,
           'beta_' || p_montagem_id || '_' || v_it.item_id || '_ajuste')
        ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
        v_ajustes := v_ajustes + 1;
      END IF;
    END IF;

    v_entregue := coalesce(v_it.entregue, v_it.levar, 0);
    IF v_entregue > 0 THEN
      INSERT INTO movimentacoes_estoque
        (estoque_origem_id, estoque_destino_id, item_id, tipo_movimentacao, quantidade,
         custo_unitario, custo_total, data_movimentacao, motivo, origem_tipo, origem_id, idempotency_key)
      VALUES
        (v_central, v_m.estoque_id, v_it.item_id, 'transferencia', v_entregue,
         v_custo, v_entregue * v_custo, v_m.data,
         'Montagem do balcão (beta)', 'beta', p_montagem_id,
         'beta_' || p_montagem_id || '_' || v_it.item_id || '_transf')
      ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
      v_transf := v_transf + 1;
      UPDATE beta_montagem_itens SET entregue = v_entregue
      WHERE montagem_id = p_montagem_id AND item_id = v_it.item_id;
    END IF;
  END LOOP;

  UPDATE beta_montagens SET status = 'concluida', concluido_em = now() WHERE id = p_montagem_id;
  RETURN jsonb_build_object('success', true, 'ajustes', v_ajustes, 'transferencias', v_transf);
END;
$$;
