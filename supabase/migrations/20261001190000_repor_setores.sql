/*
  # Estoque Beta 2: Repor os setores

  Todo dia, depois da baixa da Zig, cada setor (Bar de Cerveja, Bar de Drinks,
  Cozinha) tem uma lista do que falta até o nível configurado: nível − saldo.
  A tela mostra a lista, o estoquista ajusta e manda; a transferência do
  Central sai num toque. O registro continua sendo uma requisição interna
  "Reposição automática" (concluída na hora), para o histórico e os
  relatórios não mudarem. Reposições automáticas de dias anteriores que
  ninguém entregou ficam como "rejeitado" (não entregue) ao mandar a de hoje.

  A tela Hoje deixa de contar reposições automáticas como "pedidos a entregar"
  e passa a mostrar quantos setores têm o que repor.
*/

CREATE OR REPLACE FUNCTION fn_repor_tela()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH z AS (SELECT status, finalizado_em, coalesce(total_nao_mapeados, 0) AS nao_mapeados FROM zig_vendas_sync_logs ORDER BY iniciado_em DESC LIMIT 1)
  SELECT jsonb_build_object(
    'hoje', (now() AT TIME ZONE 'America/Cuiaba')::date,
    'zig', (SELECT jsonb_build_object('status', status, 'finalizado_em', finalizado_em, 'nao_mapeados', nao_mapeados, 'de_hoje', (finalizado_em AT TIME ZONE 'America/Cuiaba')::date = (now() AT TIME ZONE 'America/Cuiaba')::date) FROM z),
    'setores', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', e.id, 'nome', e.nome,
        'itens', (SELECT coalesce(jsonb_agg(jsonb_build_object(
            'item_id', c.item_id, 'nome', trim(c.nome), 'categoria', c.categoria, 'um', c.um, 'nivel', c.nivel, 'saldo', c.saldo_local, 'central', c.saldo_central,
            'sugestao', c.sugestao, 'por_contagem', c.grupo = 'sem_baixa', 'contado_em', c.contado_em
          ) ORDER BY c.categoria NULLS LAST, trim(c.nome)), '[]'::jsonb) FROM fn_reposicao_balcao_calcular(e.id) c WHERE c.sugestao > 0),
        'configurados', (SELECT count(*) FROM itens_estoque_niveis n WHERE n.estoque_id = e.id),
        'ultima_entrega', (SELECT jsonb_build_object('quando', r.data_conclusao, 'itens', (SELECT count(*) FROM requisicoes_internas_itens ri WHERE ri.requisicao_id = r.id AND coalesce(ri.quantidade_entregue, 0) > 0))
                             FROM requisicoes_internas r WHERE r.estoque_destino_id = e.id AND r.status = 'concluido' AND r.funcionario_nome = 'Reposição automática' ORDER BY r.data_conclusao DESC LIMIT 1)
      ) ORDER BY e.nome), '[]'::jsonb)
      FROM estoques e WHERE e.status AND e.tipo IN ('geral', 'secundario'))
  );
$$;

CREATE OR REPLACE FUNCTION fn_repor_setor(p_estoque uuid, p_itens jsonb, p_responsavel text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_est record; v_central uuid; v_req uuid; v_usuario uuid := fn_usuario_sistema_id(); r record; v_saldo numeric; v_qtd numeric; v_nome text; v_n int := 0; v_faltou text[] := '{}'; v_velhas int;
BEGIN
  SELECT id, nome INTO v_est FROM estoques WHERE id = p_estoque AND status AND tipo IN ('geral', 'secundario');
  IF v_est.id IS NULL THEN RAISE EXCEPTION 'Setor não encontrado'; END IF;
  SELECT id INTO v_central FROM estoques WHERE tipo = 'central' AND status ORDER BY criado_em LIMIT 1;

  -- Reposições automáticas de dias anteriores que ninguém entregou: ficam como não entregues.
  UPDATE requisicoes_internas SET status = 'rejeitado', observacoes = concat_ws(' | ', observacoes, 'Substituída pela reposição de ' || to_char(now() AT TIME ZONE 'America/Cuiaba', 'DD/MM'))
   WHERE estoque_destino_id = p_estoque AND funcionario_nome = 'Reposição automática' AND status IN ('pendente', 'aprovado')
     AND (data_requisicao AT TIME ZONE 'America/Cuiaba')::date < (now() AT TIME ZONE 'America/Cuiaba')::date;
  GET DIAGNOSTICS v_velhas = ROW_COUNT;

  SELECT id INTO v_req FROM requisicoes_internas
   WHERE estoque_destino_id = p_estoque AND funcionario_nome = 'Reposição automática' AND status IN ('pendente', 'aprovado')
     AND (data_requisicao AT TIME ZONE 'America/Cuiaba')::date = (now() AT TIME ZONE 'America/Cuiaba')::date
   ORDER BY data_requisicao DESC LIMIT 1;
  IF v_req IS NULL THEN
    INSERT INTO requisicoes_internas (numero_requisicao, data_requisicao, funcionario_nome, setor, estoque_origem_id, estoque_destino_id, status, observacoes, criado_anonimamente, data_aprovacao, aprovado_por)
    VALUES ('', now(), 'Reposição automática', v_est.nome, v_central, p_estoque, 'aprovado', 'Reposição do setor pelo Beta 2 (nível − saldo).', false, now(), v_usuario)
    RETURNING id INTO v_req;
  END IF;
  -- O que está na requisição de hoje e não veio na lista de agora: entregue zero.
  UPDATE requisicoes_internas_itens SET quantidade_entregue = 0, quantidade_aprovada = 0 WHERE requisicao_id = v_req;

  FOR r IN SELECT (x->>'item_id')::uuid AS item_id, (x->>'quantidade')::numeric AS quantidade FROM jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) x LOOP
    IF r.quantidade IS NULL OR r.quantidade <= 0 THEN CONTINUE; END IF;
    SELECT trim(nome) INTO v_nome FROM itens_estoque WHERE id = r.item_id;
    SELECT coalesce(quantidade_atual, 0) INTO v_saldo FROM saldos_estoque WHERE estoque_id = v_central AND item_id = r.item_id;
    v_saldo := coalesce(v_saldo, 0);
    v_qtd := least(r.quantidade, greatest(v_saldo, 0));
    IF v_qtd < r.quantidade THEN v_faltou := v_faltou || (v_nome || ': Central tem ' || trim(to_char(greatest(v_saldo, 0), 'FM9999990.###')) || ', pedia ' || trim(to_char(r.quantidade, 'FM9999990.###'))); END IF;
    UPDATE requisicoes_internas_itens SET quantidade_solicitada = r.quantidade, quantidade_aprovada = v_qtd, quantidade_entregue = v_qtd,
           observacao = coalesce('Entregue por ' || nullif(p_responsavel, ''), 'Reposição do setor')
     WHERE requisicao_id = v_req AND item_id = r.item_id;
    IF NOT FOUND THEN
      INSERT INTO requisicoes_internas_itens (requisicao_id, item_id, quantidade_solicitada, quantidade_aprovada, quantidade_entregue, observacao)
      VALUES (v_req, r.item_id, r.quantidade, v_qtd, v_qtd, coalesce('Entregue por ' || nullif(p_responsavel, ''), 'Reposição do setor'));
    END IF;
    IF v_qtd > 0 THEN v_n := v_n + 1; END IF;
  END LOOP;

  IF v_n = 0 THEN RAISE EXCEPTION 'Nada para mandar: o Central não tem saldo dos itens pedidos.'; END IF;

  -- Concluir dispara as transferências Central → setor (gatilho processar_requisicao_interna).
  UPDATE requisicoes_internas SET status = 'concluido', data_conclusao = now(), concluido_por = v_usuario,
         observacoes = concat_ws(' | ', observacoes, coalesce('Entregue por ' || nullif(p_responsavel, ''), NULL))
   WHERE id = v_req;

  RETURN jsonb_build_object('requisicao_id', v_req, 'setor', v_est.nome, 'itens', v_n, 'faltou', to_jsonb(v_faltou), 'antigas_encerradas', v_velhas,
    'movimentacoes', (SELECT count(*) FROM movimentacoes_estoque WHERE origem_tipo = 'requisicao' AND origem_id = v_req));
END; $$;

GRANT EXECUTE ON FUNCTION fn_repor_tela(), fn_repor_setor(uuid, jsonb, text) TO authenticated;

-- Hoje: reposição automática não é "pedido a entregar"; vira "setores a repor".
-- (fn_beta2_hoje reescrita com os campos novos: ver 20260930160000_beta2_kits_e_hoje.sql para a base.)
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
    'pedidos_a_entregar', (SELECT count(*) FROM requisicoes_internas WHERE status IN ('pendente', 'aprovado') AND funcionario_nome IS DISTINCT FROM 'Reposição automática'),
    'repor_setores', (SELECT count(*) FROM estoques e WHERE e.status AND e.tipo IN ('geral', 'secundario') AND EXISTS (SELECT 1 FROM fn_reposicao_balcao_calcular(e.id) c WHERE c.sugestao > 0)),
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
