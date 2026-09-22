/*
  # Estoque Beta: montar o balcão

  Módulo separado do estoque atual, para testar um jeito mais simples de
  operar. Não altera nenhuma tela ou função do módulo antigo. Reaproveita
  os níveis de reposição que já existem em itens_estoque_niveis.

  A ideia em uma frase: todo dia o Central "monta" cada balcão até o nível.
  Montar é contar o que tem, e o sistema calcula o que levar. A contagem do
  balcão e a transferência do Central saem do mesmo gesto.

  Regras do dia:
    - item de controle "contagem" (não baixa por venda): contado todo dia;
    - item de controle "venda" (baixa por ficha): reposto pelo saldo do
      sistema todo dia e contado só nos dias de conferência (seg e qui).

  Tudo que o beta grava em movimentacoes_estoque leva origem_tipo = 'beta',
  para ser identificável e reversível em bloco.
*/

-- ---------------------------------------------------------------------------
-- 1. Como se conta cada item (a parte que resolve ovo x cartela)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beta_item_config (
  item_id uuid PRIMARY KEY REFERENCES itens_estoque(id) ON DELETE CASCADE,
  rotulo_solto text NOT NULL DEFAULT 'unidade',   -- "ovo", "garrafa", "pacote"
  rotulo_fechado text,                             -- "cartela", "caixa", "fardo"
  fator_fechado numeric,                           -- 1 cartela = 30 ovos
  permite_fracao boolean NOT NULL DEFAULT false,   -- garrafa aberta em décimos
  foto_url text,
  dica text,                                       -- "conte só as cartelas fechadas"
  atualizado_em timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE beta_item_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS beta_item_config_ler ON beta_item_config;
CREATE POLICY beta_item_config_ler ON beta_item_config
  FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- 2. Uma montagem por balcão por dia
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS beta_montagens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estoque_id uuid NOT NULL REFERENCES estoques(id),
  data date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Cuiaba')::date,
  conferencia boolean NOT NULL DEFAULT false,     -- dia de contar também os de venda
  status text NOT NULL DEFAULT 'contando'
    CHECK (status IN ('contando', 'levando', 'concluida', 'cancelada')),
  responsavel text,
  iniciado_em timestamptz NOT NULL DEFAULT now(),
  concluido_em timestamptz,
  UNIQUE (estoque_id, data)
);

CREATE TABLE IF NOT EXISTS beta_montagem_itens (
  montagem_id uuid NOT NULL REFERENCES beta_montagens(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES itens_estoque(id),
  controle text NOT NULL,                          -- 'contagem' | 'venda'
  nivel numeric NOT NULL,
  saldo_antes numeric NOT NULL DEFAULT 0,          -- saldo do balcão no sistema ao abrir
  fechados numeric,                                -- o que a pessoa digitou
  soltos numeric,
  contado numeric,                                 -- fechados*fator + soltos
  levar numeric NOT NULL DEFAULT 0,                -- nivel - (contado ou saldo)
  entregue numeric,                                -- o que de fato foi levado
  contado_em timestamptz,
  PRIMARY KEY (montagem_id, item_id)
);

ALTER TABLE beta_montagens ENABLE ROW LEVEL SECURITY;
ALTER TABLE beta_montagem_itens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS beta_montagens_ler ON beta_montagens;
CREATE POLICY beta_montagens_ler ON beta_montagens FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS beta_montagem_itens_ler ON beta_montagem_itens;
CREATE POLICY beta_montagem_itens_ler ON beta_montagem_itens FOR SELECT TO authenticated USING (true);

-- ---------------------------------------------------------------------------
-- 3. Fotos dos itens
-- ---------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('estoque-fotos', 'estoque-fotos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS estoque_fotos_ler ON storage.objects;
CREATE POLICY estoque_fotos_ler ON storage.objects
  FOR SELECT USING (bucket_id = 'estoque-fotos');

DROP POLICY IF EXISTS estoque_fotos_enviar ON storage.objects;
CREATE POLICY estoque_fotos_enviar ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'estoque-fotos');

DROP POLICY IF EXISTS estoque_fotos_trocar ON storage.objects;
CREATE POLICY estoque_fotos_trocar ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'estoque-fotos');

-- ---------------------------------------------------------------------------
-- 4. Funções
-- ---------------------------------------------------------------------------

-- Rótulo padrão a partir da unidade cadastrada
CREATE OR REPLACE FUNCTION beta_rotulo_padrao(p_unidade text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(coalesce(p_unidade, ''))
    WHEN 'kg' THEN 'kg'
    WHEN 'g' THEN 'g'
    WHEN 'litro' THEN 'litro'
    WHEN 'pacote' THEN 'pacote'
    WHEN 'pct' THEN 'pacote'
    WHEN 'caixa' THEN 'caixa'
    ELSE 'unidade'
  END;
$$;

-- Painel: os balcões e a situação da montagem de hoje
CREATE OR REPLACE FUNCTION fn_beta_painel()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_hoje date := (now() AT TIME ZONE 'America/Cuiaba')::date;
  v_dow int := extract(isodow FROM v_hoje);   -- 1 = segunda ... 7 = domingo
BEGIN
  RETURN jsonb_build_object(
    'hoje', v_hoje,
    'dia_conferencia', v_dow IN (1, 4),
    'balcoes', (
      SELECT jsonb_agg(jsonb_build_object(
        'id', e.id,
        'nome', e.nome,
        'itens', (SELECT count(*) FROM itens_estoque_niveis n
                  JOIN itens_estoque i ON i.id = n.item_id AND i.status = 'ativo'
                  WHERE n.estoque_id = e.id),
        'itens_contagem', (SELECT count(*) FROM itens_estoque_niveis n
                  JOIN itens_estoque i ON i.id = n.item_id AND i.status = 'ativo'
                  WHERE n.estoque_id = e.id AND n.controle = 'contagem'),
        'montagem', (
          SELECT jsonb_build_object(
            'id', m.id, 'status', m.status, 'conferencia', m.conferencia,
            'iniciado_em', m.iniciado_em, 'concluido_em', m.concluido_em,
            'contados', (SELECT count(*) FROM beta_montagem_itens mi
                         WHERE mi.montagem_id = m.id AND mi.contado_em IS NOT NULL),
            'total', (SELECT count(*) FROM beta_montagem_itens mi WHERE mi.montagem_id = m.id)
          )
          FROM beta_montagens m
          WHERE m.estoque_id = e.id AND m.data = v_hoje
        )
      ) ORDER BY e.nome)
      FROM estoques e
      WHERE e.tipo <> 'central'
        AND EXISTS (SELECT 1 FROM itens_estoque_niveis n WHERE n.estoque_id = e.id)
    )
  );
END;
$$;

-- Abre (ou retoma) a montagem de hoje de um balcão e devolve a lista
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
    VALUES (p_estoque_id, v_hoje, v_conf, p_responsavel)
    RETURNING * INTO v_m;

    -- Fotografa a lista do balcão no momento da abertura
    INSERT INTO beta_montagem_itens (montagem_id, item_id, controle, nivel, saldo_antes, levar)
    SELECT v_m.id, n.item_id, coalesce(n.controle, 'contagem'), coalesce(n.nivel_reposicao, 0),
           coalesce(s.quantidade_atual, 0),
           -- item de venda em dia comum: levar = nível - saldo do sistema
           CASE WHEN coalesce(n.controle, 'contagem') = 'venda' AND NOT v_conf
                THEN greatest(0, coalesce(n.nivel_reposicao, 0) - coalesce(s.quantidade_atual, 0))
                ELSE 0 END
    FROM itens_estoque_niveis n
    JOIN itens_estoque i ON i.id = n.item_id AND i.status = 'ativo'
    LEFT JOIN saldos_estoque s ON s.item_id = n.item_id AND s.estoque_id = p_estoque_id
    WHERE n.estoque_id = p_estoque_id
      AND coalesce(n.nivel_reposicao, 0) > 0;
  ELSIF v_m.status = 'contando' AND p_responsavel IS NOT NULL AND v_m.responsavel IS NULL THEN
    UPDATE beta_montagens SET responsavel = p_responsavel WHERE id = v_m.id;
  END IF;

  RETURN jsonb_build_object(
    'montagem', (SELECT to_jsonb(m) FROM beta_montagens m WHERE m.id = v_m.id),
    'estoque', (SELECT jsonb_build_object('id', e.id, 'nome', e.nome) FROM estoques e WHERE e.id = p_estoque_id),
    'itens', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'item_id', mi.item_id,
        'nome', trim(i.nome),
        'categoria', i.categoria,
        'unidade', i.unidade_medida,
        'controle', mi.controle,
        'precisa_contar', (mi.controle = 'contagem' OR v_m.conferencia),
        'nivel', mi.nivel,
        'saldo_antes', mi.saldo_antes,
        'saldo_central', coalesce((SELECT sc.quantidade_atual FROM saldos_estoque sc
                                   WHERE sc.item_id = mi.item_id AND sc.estoque_id = v_central), 0),
        'fechados', mi.fechados,
        'soltos', mi.soltos,
        'contado', mi.contado,
        'levar', mi.levar,
        'entregue', mi.entregue,
        'contado_em', mi.contado_em,
        'rotulo_solto', coalesce(c.rotulo_solto, beta_rotulo_padrao(i.unidade_medida)),
        'rotulo_fechado', c.rotulo_fechado,
        'fator_fechado', c.fator_fechado,
        'permite_fracao', coalesce(c.permite_fracao, false),
        'foto_url', c.foto_url,
        'dica', c.dica
      ) ORDER BY i.categoria, trim(i.nome)), '[]'::jsonb)
      FROM beta_montagem_itens mi
      JOIN itens_estoque i ON i.id = mi.item_id
      LEFT JOIN beta_item_config c ON c.item_id = mi.item_id
      WHERE mi.montagem_id = v_m.id
    )
  );
END;
$$;

-- Grava a contagem de um item e devolve quanto levar
CREATE OR REPLACE FUNCTION fn_beta_montagem_contar(
  p_montagem_id uuid, p_item_id uuid, p_fechados numeric, p_soltos numeric
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fator numeric;
  v_contado numeric;
  v_nivel numeric;
  v_status text;
BEGIN
  SELECT status INTO v_status FROM beta_montagens WHERE id = p_montagem_id;
  IF v_status IS DISTINCT FROM 'contando' THEN
    RAISE EXCEPTION 'Esta montagem já foi fechada';
  END IF;

  SELECT coalesce(c.fator_fechado, 0) INTO v_fator
  FROM beta_item_config c WHERE c.item_id = p_item_id;

  v_contado := coalesce(p_fechados, 0) * coalesce(v_fator, 0) + coalesce(p_soltos, 0);

  UPDATE beta_montagem_itens
  SET fechados = p_fechados,
      soltos = p_soltos,
      contado = v_contado,
      levar = greatest(0, nivel - v_contado),
      contado_em = now()
  WHERE montagem_id = p_montagem_id AND item_id = p_item_id
  RETURNING nivel INTO v_nivel;

  IF v_nivel IS NULL THEN
    RAISE EXCEPTION 'Item não está nesta montagem';
  END IF;

  RETURN jsonb_build_object('contado', v_contado, 'levar', greatest(0, v_nivel - v_contado));
END;
$$;

-- Fecha a contagem e devolve a lista do que buscar no Central
CREATE OR REPLACE FUNCTION fn_beta_montagem_fechar_contagem(p_montagem_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_faltam int;
BEGIN
  SELECT count(*) INTO v_faltam
  FROM beta_montagens m
  JOIN beta_montagem_itens mi ON mi.montagem_id = m.id
  WHERE m.id = p_montagem_id
    AND mi.contado_em IS NULL
    AND (mi.controle = 'contagem' OR m.conferencia);

  IF v_faltam > 0 THEN
    RETURN jsonb_build_object('success', false, 'faltam', v_faltam);
  END IF;

  UPDATE beta_montagens SET status = 'levando' WHERE id = p_montagem_id AND status = 'contando';

  RETURN jsonb_build_object('success', true,
    'levar', (SELECT count(*) FROM beta_montagem_itens WHERE montagem_id = p_montagem_id AND levar > 0));
END;
$$;

-- Confirma o que foi levado: grava ajuste de contagem no balcão e transferência
CREATE OR REPLACE FUNCTION fn_beta_montagem_concluir(p_montagem_id uuid, p_entregas jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_m beta_montagens%ROWTYPE;
  v_central uuid;
  v_it record;
  v_saldo numeric;
  v_dif numeric;
  v_custo numeric;
  v_ajustes int := 0;
  v_transf int := 0;
  v_entregue numeric;
BEGIN
  SELECT * INTO v_m FROM beta_montagens WHERE id = p_montagem_id;
  IF v_m.id IS NULL THEN RAISE EXCEPTION 'Montagem não encontrada'; END IF;
  IF v_m.status = 'concluida' THEN
    RETURN jsonb_build_object('success', true, 'ja_concluida', true);
  END IF;

  SELECT id INTO v_central FROM estoques WHERE tipo = 'central' LIMIT 1;

  -- O que a pessoa marcou como levado (pode ser diferente do sugerido)
  IF p_entregas IS NOT NULL THEN
    UPDATE beta_montagem_itens mi
    SET entregue = (e->>'entregue')::numeric
    FROM jsonb_array_elements(p_entregas) e
    WHERE mi.montagem_id = p_montagem_id AND mi.item_id = (e->>'item_id')::uuid;
  END IF;

  FOR v_it IN
    SELECT mi.*, i.custo_medio
    FROM beta_montagem_itens mi JOIN itens_estoque i ON i.id = mi.item_id
    WHERE mi.montagem_id = p_montagem_id
  LOOP
    v_custo := coalesce(v_it.custo_medio, 0);

    -- 1. Ajuste de contagem no balcão (só para quem foi contado)
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
          (CASE WHEN v_dif < 0 THEN v_m.estoque_id END,
           CASE WHEN v_dif > 0 THEN v_m.estoque_id END,
           v_it.item_id,
           CASE WHEN v_dif > 0 THEN 'entrada' ELSE 'saida' END,
           abs(v_dif), v_custo, abs(v_dif) * v_custo, v_m.data,
           'Contagem na montagem do balcão (beta)', 'beta', p_montagem_id,
           'beta_' || p_montagem_id || '_' || v_it.item_id || '_ajuste')
        ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING;
        v_ajustes := v_ajustes + 1;
      END IF;
    END IF;

    -- 2. Transferência do Central para o balcão
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

-- Configurar como um item se conta
CREATE OR REPLACE FUNCTION fn_beta_config_item(p_item_id uuid, p_config jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO beta_item_config (item_id, rotulo_solto, rotulo_fechado, fator_fechado, permite_fracao, foto_url, dica)
  VALUES (
    p_item_id,
    coalesce(nullif(trim(p_config->>'rotulo_solto'), ''), 'unidade'),
    nullif(trim(p_config->>'rotulo_fechado'), ''),
    nullif(p_config->>'fator_fechado', '')::numeric,
    coalesce((p_config->>'permite_fracao')::boolean, false),
    nullif(trim(p_config->>'foto_url'), ''),
    nullif(trim(p_config->>'dica'), '')
  )
  ON CONFLICT (item_id) DO UPDATE SET
    rotulo_solto = EXCLUDED.rotulo_solto,
    rotulo_fechado = EXCLUDED.rotulo_fechado,
    fator_fechado = EXCLUDED.fator_fechado,
    permite_fracao = EXCLUDED.permite_fracao,
    foto_url = coalesce(EXCLUDED.foto_url, beta_item_config.foto_url),
    dica = EXCLUDED.dica,
    atualizado_em = now();
END;
$$;

-- Só a foto (qualquer pessoa pode tirar a foto do item durante a montagem)
CREATE OR REPLACE FUNCTION fn_beta_foto_item(p_item_id uuid, p_foto_url text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_unidade text;
BEGIN
  SELECT unidade_medida INTO v_unidade FROM itens_estoque WHERE id = p_item_id;
  INSERT INTO beta_item_config (item_id, rotulo_solto, foto_url)
  VALUES (p_item_id, beta_rotulo_padrao(v_unidade), p_foto_url)
  ON CONFLICT (item_id) DO UPDATE SET foto_url = EXCLUDED.foto_url, atualizado_em = now();
END;
$$;

-- Nível e controle de um item em um balcão (compartilhado com o módulo atual)
CREATE OR REPLACE FUNCTION fn_beta_nivel_definir(p_estoque_id uuid, p_item_id uuid, p_nivel numeric, p_controle text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_controle NOT IN ('contagem', 'venda') THEN
    RAISE EXCEPTION 'Controle inválido: %', p_controle;
  END IF;
  INSERT INTO itens_estoque_niveis (item_id, estoque_id, nivel_reposicao, controle, atualizado_em)
  VALUES (p_item_id, p_estoque_id, greatest(0, coalesce(p_nivel, 0)), p_controle, now())
  ON CONFLICT (item_id, estoque_id) DO UPDATE SET
    nivel_reposicao = EXCLUDED.nivel_reposicao,
    controle = EXCLUDED.controle,
    atualizado_em = now();
END;
$$;

-- Lista para a tela de configuração: itens do balcão + candidatos + sugestão de nível
CREATE OR REPLACE FUNCTION fn_beta_niveis_listar(p_estoque_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN jsonb_build_object(
    'itens', (
      SELECT coalesce(jsonb_agg(jsonb_build_object(
        'item_id', i.id,
        'nome', trim(i.nome),
        'categoria', i.categoria,
        'unidade', i.unidade_medida,
        'nivel', n.nivel_reposicao,
        'controle', n.controle,
        'tem_ficha', EXISTS (SELECT 1 FROM ficha_ingredientes fi WHERE fi.item_estoque_id = i.id),
        -- consumo médio por dia nos últimos 30 dias, pelas baixas de venda neste balcão
        'consumo_dia', round(coalesce((
          SELECT sum(m.quantidade) / 30.0 FROM movimentacoes_estoque m
          WHERE m.item_id = i.id AND m.estoque_origem_id = p_estoque_id
            AND m.tipo_movimentacao = 'saida' AND m.origem_tipo = 'zig'
            AND m.data_movimentacao >= current_date - 30), 0)::numeric, 2),
        'rotulo_solto', coalesce(c.rotulo_solto, beta_rotulo_padrao(i.unidade_medida)),
        'rotulo_fechado', c.rotulo_fechado,
        'fator_fechado', c.fator_fechado,
        'permite_fracao', coalesce(c.permite_fracao, false),
        'foto_url', c.foto_url,
        'dica', c.dica
      ) ORDER BY (n.item_id IS NULL), i.categoria, trim(i.nome)), '[]'::jsonb)
      FROM itens_estoque i
      LEFT JOIN itens_estoque_niveis n ON n.item_id = i.id AND n.estoque_id = p_estoque_id
      LEFT JOIN beta_item_config c ON c.item_id = i.id
      WHERE i.status = 'ativo' AND i.tipo_item = 'insumo'
        AND (n.item_id IS NOT NULL
             OR EXISTS (SELECT 1 FROM movimentacoes_estoque m
                        WHERE m.item_id = i.id AND (m.estoque_origem_id = p_estoque_id OR m.estoque_destino_id = p_estoque_id)
                          AND m.data_movimentacao >= current_date - 60))
    )
  );
END;
$$;

-- Permissões: só usuário logado
REVOKE ALL ON FUNCTION fn_beta_painel() FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_montagem_abrir(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_montagem_contar(uuid, uuid, numeric, numeric) FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_montagem_fechar_contagem(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_montagem_concluir(uuid, jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_config_item(uuid, jsonb) FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_foto_item(uuid, text) FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_nivel_definir(uuid, uuid, numeric, text) FROM public, anon;
REVOKE ALL ON FUNCTION fn_beta_niveis_listar(uuid) FROM public, anon;

GRANT EXECUTE ON FUNCTION fn_beta_painel() TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_montagem_abrir(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_montagem_contar(uuid, uuid, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_montagem_fechar_contagem(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_montagem_concluir(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_config_item(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_foto_item(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_nivel_definir(uuid, uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION fn_beta_niveis_listar(uuid) TO authenticated;
