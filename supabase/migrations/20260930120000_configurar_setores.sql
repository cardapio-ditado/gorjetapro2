/*
  # Configurar setores

  A fonte de verdade da operação por setor: quais itens ficam em cada balcão,
  quanto deve ter e como o item sai (Zig baixa ou conta todo dia), e para os
  de Zig, quais vendas baixam o item aqui (direto ou por ficha técnica).

  Tudo grava nas tabelas que já existem:
    itens_estoque_niveis      presença no setor, nível e forma de baixa
    mapeamento_itens_vendas   venda Zig → item ou ficha, com o setor de origem
    configuracoes_sistema     dias de contagem geral e quem aprova divergência

  Decisões do dono (30/09/2026):
    - O estoque "Bar" vira "Bar de Cerveja" (leva saldo e histórico).
      "Bar de Drinks" nasce vazio; os itens são movidos pela tela.
    - Contagem geral: segunda, quinta e sábado.
    - Aprovam divergência: Cristiano e Kadu.

  Nível 0 significa "ainda não definido" e aparece como pendência.
*/

-- ── 1. Estoques ─────────────────────────────────────────────────────────────
UPDATE estoques
   SET nome = 'Bar de Cerveja',
       descricao = coalesce(nullif(descricao, ''), 'Cervejas, long necks e chope. Era o estoque "Bar".'),
       atualizado_em = now()
 WHERE id = '10b3aacf-61b1-4add-91ac-0949d3e7f3a3' AND nome = 'Bar';

INSERT INTO estoques (nome, tipo, status, descricao, localizacao)
SELECT 'Bar de Drinks', 'secundario', true, 'Destilados, insumos de drinks e garrafas abertas.', 'Bar de drinks'
 WHERE NOT EXISTS (SELECT 1 FROM estoques WHERE nome = 'Bar de Drinks');

-- O link público /pedido/<setor> achava o estoque pelo nome "bar".
CREATE OR REPLACE FUNCTION public.fn_pedido_setor_estoque(p_setor text)
RETURNS TABLE(estoque_id uuid, estoque_nome text, setor_nome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH alvo AS (
    SELECT CASE lower(trim(p_setor))
             WHEN 'bar' THEN 'bar-de-cerveja'
             WHEN 'cerveja' THEN 'bar-de-cerveja'
             WHEN 'drinks' THEN 'bar-de-drinks'
             WHEN 'drink' THEN 'bar-de-drinks'
             ELSE regexp_replace(lower(trim(p_setor)), '\s+', '-', 'g')
           END AS slug
  )
  SELECT e.id, e.nome, e.nome
    FROM estoques e, alvo a
   WHERE e.status = true AND e.tipo <> 'central'
     AND regexp_replace(lower(e.nome), '\s+', '-', 'g') = a.slug
   LIMIT 1;
$$;

-- ── 2. Regras ───────────────────────────────────────────────────────────────
INSERT INTO configuracoes_sistema (chave, valor, descricao, tipo, categoria)
SELECT 'estoque_auditoria_dias', '1,4,6', 'Dias da semana com contagem geral dos setores (1=segunda … 7=domingo)', 'texto', 'estoque'
 WHERE NOT EXISTS (SELECT 1 FROM configuracoes_sistema WHERE chave = 'estoque_auditoria_dias');

INSERT INTO configuracoes_sistema (chave, valor, descricao, tipo, categoria)
SELECT 'estoque_aprovadores',
       (SELECT coalesce(jsonb_agg(id), '[]'::jsonb)::text FROM usuarios_sistema WHERE ativo AND nome_completo IN ('Cristiano', 'Kadu Mendes')),
       'Usuários que aprovam divergências de contagem (ids de usuarios_sistema, em JSON)', 'texto', 'estoque'
 WHERE NOT EXISTS (SELECT 1 FROM configuracoes_sistema WHERE chave = 'estoque_aprovadores');

-- ── 3. Trilha do que mudou ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS setores_config_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  estoque_id uuid REFERENCES estoques(id) ON DELETE SET NULL,
  item_id uuid REFERENCES itens_estoque(id) ON DELETE SET NULL,
  mapeamento_id uuid,
  acao text NOT NULL,
  antes jsonb,
  depois jsonb,
  usuario_id uuid,
  usuario_nome text,
  criado_em timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS setores_config_log_estoque_idx ON setores_config_log (estoque_id, criado_em DESC);
ALTER TABLE setores_config_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS setores_config_log_ler ON setores_config_log;
CREATE POLICY setores_config_log_ler ON setores_config_log FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION setores_log(p_estoque uuid, p_item uuid, p_map uuid, p_acao text, p_antes jsonb, p_depois jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_uid uuid := fn_usuario_sistema_id(); v_nome text;
BEGIN
  SELECT nome_completo INTO v_nome FROM usuarios_sistema WHERE id = v_uid;
  INSERT INTO setores_config_log (estoque_id, item_id, mapeamento_id, acao, antes, depois, usuario_id, usuario_nome)
  VALUES (p_estoque, p_item, p_map, p_acao, p_antes, p_depois, v_uid, v_nome);
END; $$;

/** Só gestor (admin ou master) configura setor. */
CREATE OR REPLACE FUNCTION setores_exigir_gestor()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM usuarios_sistema WHERE id = fn_usuario_sistema_id() AND ativo AND nivel IN ('admin', 'master')) THEN
    RAISE EXCEPTION 'Só gestor pode configurar setores';
  END IF;
END; $$;

-- ── 4. Regras: ler e salvar ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION fn_setores_regras()
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'auditoria_dias', (SELECT coalesce(jsonb_agg(x::int), '[]'::jsonb) FROM regexp_split_to_table(coalesce((SELECT valor FROM configuracoes_sistema WHERE chave = 'estoque_auditoria_dias'), ''), ',') x WHERE x ~ '^\s*[1-7]\s*$'),
    'aprovadores', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome_completo) ORDER BY u.nome_completo), '[]'::jsonb)
                      FROM usuarios_sistema u
                     WHERE u.ativo AND u.id::text IN (SELECT jsonb_array_elements_text(coalesce((SELECT valor FROM configuracoes_sistema WHERE chave = 'estoque_aprovadores'), '[]')::jsonb))),
    'usuarios', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', u.id, 'nome', u.nome_completo) ORDER BY u.nome_completo), '[]'::jsonb)
                   FROM usuarios_sistema u WHERE u.ativo AND u.nivel IN ('admin', 'master'))
  );
$$;

CREATE OR REPLACE FUNCTION fn_setores_regras_salvar(p_dias int[], p_aprovadores uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_antes jsonb;
BEGIN
  PERFORM setores_exigir_gestor();
  IF p_dias IS NULL OR array_length(p_dias, 1) IS NULL THEN RAISE EXCEPTION 'Escolha pelo menos um dia de contagem geral'; END IF;
  IF EXISTS (SELECT 1 FROM unnest(p_dias) d WHERE d < 1 OR d > 7) THEN RAISE EXCEPTION 'Dia da semana inválido'; END IF;
  IF p_aprovadores IS NULL OR array_length(p_aprovadores, 1) IS NULL THEN RAISE EXCEPTION 'Escolha pelo menos um aprovador'; END IF;

  v_antes := fn_setores_regras();
  UPDATE configuracoes_sistema SET valor = array_to_string(ARRAY(SELECT DISTINCT d FROM unnest(p_dias) d ORDER BY d), ','), atualizado_em = now() WHERE chave = 'estoque_auditoria_dias';
  UPDATE configuracoes_sistema SET valor = to_jsonb(p_aprovadores)::text, atualizado_em = now() WHERE chave = 'estoque_aprovadores';
  PERFORM setores_log(NULL, NULL, NULL, 'regras', v_antes - 'usuarios', fn_setores_regras() - 'usuarios');
  RETURN fn_setores_regras();
END; $$;

-- ── 5. Consultas ────────────────────────────────────────────────────────────
/** Fichas ativas que consomem o item com baixa de estoque. */
CREATE OR REPLACE FUNCTION setores_fichas_do_item(p_item_id uuid)
RETURNS TABLE(ficha_id uuid, nome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT f.id, f.nome
    FROM fichas_tecnicas f
    JOIN ficha_ingredientes fi ON fi.ficha_id = f.id
   WHERE fi.item_estoque_id = p_item_id AND coalesce(fi.baixa_estoque, true) AND coalesce(f.ativo, true)
   ORDER BY f.nome;
$$;

/** Os cartões da entrada: um por setor, com o que falta configurar. */
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
  ) ORDER BY e.nome), '[]'::jsonb)
  FROM estoques e WHERE e.status = true AND e.tipo <> 'central';
$$;

/** Todos os itens ativos, com a situação deles neste setor. */
CREATE OR REPLACE FUNCTION fn_setores_itens(p_estoque_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH consumo AS (
    SELECT m.item_id,
           greatest(0, sum(CASE WHEN m.tipo_movimentacao = 'saida' AND m.origem_tipo IN ('zig', 'contagem') THEN m.quantidade
                                WHEN m.tipo_movimentacao = 'entrada' AND m.origem_tipo = 'contagem' THEN -m.quantidade ELSE 0 END)) / 30.0 AS por_dia
      FROM movimentacoes_estoque m
     WHERE (m.estoque_origem_id = p_estoque_id OR m.estoque_destino_id = p_estoque_id)
       AND m.data_movimentacao >= current_date - 30
     GROUP BY m.item_id
  ),
  vendas AS (
    SELECT coalesce(m.item_estoque_id, fi.item_estoque_id) AS item_id,
           count(*) FILTER (WHERE m.item_estoque_id IS NOT NULL) AS direto,
           count(DISTINCT m.id) FILTER (WHERE m.ficha_tecnica_id IS NOT NULL) AS ficha
      FROM mapeamento_itens_vendas m
      LEFT JOIN ficha_ingredientes fi ON fi.ficha_id = m.ficha_tecnica_id AND coalesce(fi.baixa_estoque, true)
     WHERE m.estoque_id = p_estoque_id AND coalesce(m.ignorar_estoque, false) = false
     GROUP BY 1
  )
  SELECT jsonb_build_object(
    'estoque', (SELECT jsonb_build_object('id', e.id, 'nome', e.nome, 'tipo', e.tipo) FROM estoques e WHERE e.id = p_estoque_id),
    'outros_setores', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome) ORDER BY e.nome), '[]'::jsonb) FROM estoques e WHERE e.status AND e.tipo <> 'central' AND e.id <> p_estoque_id),
    'itens', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'item_id', i.id,
        'nome', trim(i.nome),
        'categoria', coalesce(nullif(trim(i.categoria), ''), 'Sem categoria'),
        'unidade', i.unidade_medida,
        'rotulo', coalesce(c.rotulo_solto, i.unidade_medida, 'un'),
        'presente', n.item_id IS NOT NULL,
        'nivel', coalesce(n.nivel_reposicao, 0),
        'controle', n.controle,
        'saldo', round(coalesce(s.quantidade_atual, 0)::numeric, 3),
        'consumo_dia', round(coalesce(k.por_dia, 0)::numeric, 2),
        'vendas_direto', coalesce(v.direto, 0),
        'vendas_ficha', coalesce(v.ficha, 0),
        'tem_ficha', EXISTS (SELECT 1 FROM setores_fichas_do_item(i.id))
      ) ORDER BY coalesce(nullif(trim(i.categoria), ''), 'Sem categoria'), trim(i.nome)), '[]'::jsonb)
      FROM itens_estoque i
      LEFT JOIN itens_estoque_niveis n ON n.item_id = i.id AND n.estoque_id = p_estoque_id
      LEFT JOIN saldos_estoque s ON s.item_id = i.id AND s.estoque_id = p_estoque_id
      LEFT JOIN beta_item_config c ON c.item_id = i.id
      LEFT JOIN consumo k ON k.item_id = i.id
      LEFT JOIN vendas v ON v.item_id = i.id
     WHERE i.status = 'ativo' OR n.item_id IS NOT NULL OR coalesce(s.quantidade_atual, 0) <> 0)
  );
$$;

/** As vendas Zig que baixam este item neste setor, e as fichas que o usam. */
CREATE OR REPLACE FUNCTION fn_setores_vendas_do_item(p_estoque_id uuid, p_item_id uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'vinculadas', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'nome_externo', m.nome_externo, 'categoria', m.zig_category,
        'modo', CASE WHEN m.item_estoque_id = p_item_id THEN 'direto' ELSE 'ficha' END,
        'ficha_nome', f.nome, 'usos', coalesce(m.usado_vezes, 0), 'ultima', m.ultima_utilizacao
      ) ORDER BY m.nome_externo), '[]'::jsonb)
      FROM mapeamento_itens_vendas m
      LEFT JOIN fichas_tecnicas f ON f.id = m.ficha_tecnica_id
     WHERE m.estoque_id = p_estoque_id AND coalesce(m.ignorar_estoque, false) = false
       AND (m.item_estoque_id = p_item_id
            OR EXISTS (SELECT 1 FROM ficha_ingredientes fi WHERE fi.ficha_id = m.ficha_tecnica_id AND fi.item_estoque_id = p_item_id AND coalesce(fi.baixa_estoque, true)))),
    'fichas', (SELECT coalesce(jsonb_agg(jsonb_build_object('id', ficha_id, 'nome', nome)), '[]'::jsonb) FROM setores_fichas_do_item(p_item_id))
  );
$$;

/** Busca uma venda da Zig pelo nome, mostrando para onde ela baixa hoje. */
CREATE OR REPLACE FUNCTION fn_setores_buscar_vendas(p_termo text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id', m.id, 'nome_externo', m.nome_externo, 'categoria', m.zig_category,
    'ignorada', coalesce(m.ignorar_estoque, false),
    'destino', CASE WHEN coalesce(m.ignorar_estoque, false) THEN 'Ignorada no estoque'
                    WHEN m.ficha_tecnica_id IS NOT NULL THEN 'Ficha: ' || coalesce(f.nome, '?')
                    WHEN m.item_estoque_id IS NOT NULL THEN 'Direto: ' || coalesce(trim(i.nome), '?')
                    ELSE 'Sem vínculo' END,
    'estoque_nome', e.nome, 'usos', coalesce(m.usado_vezes, 0)
  ) ORDER BY coalesce(m.usado_vezes, 0) DESC, m.nome_externo), '[]'::jsonb)
  FROM (
    SELECT * FROM mapeamento_itens_vendas m
     WHERE p_termo IS NOT NULL AND length(trim(p_termo)) >= 2
       AND (m.nome_externo ILIKE '%' || trim(p_termo) || '%' OR m.zig_category ILIKE '%' || trim(p_termo) || '%')
     ORDER BY coalesce(m.usado_vezes, 0) DESC, m.nome_externo LIMIT 30
  ) m
  LEFT JOIN fichas_tecnicas f ON f.id = m.ficha_tecnica_id
  LEFT JOIN itens_estoque i ON i.id = m.item_estoque_id
  LEFT JOIN estoques e ON e.id = m.estoque_id;
$$;

-- ── 6. Gravações ────────────────────────────────────────────────────────────
/** Passo 1: quem fica no setor. Remover é barrado com saldo ou venda ligada. */
CREATE OR REPLACE FUNCTION fn_setores_presenca(p_estoque_id uuid, p_incluir uuid[], p_remover uuid[])
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_item uuid; v_saldo numeric; v_vendas int; v_nome text; v_bloqueados text[] := '{}'; v_incluidos int := 0; v_removidos int := 0; v_antes jsonb;
BEGIN
  PERFORM setores_exigir_gestor();
  IF NOT EXISTS (SELECT 1 FROM estoques WHERE id = p_estoque_id AND status AND tipo <> 'central') THEN RAISE EXCEPTION 'Setor não encontrado'; END IF;

  FOREACH v_item IN ARRAY coalesce(p_incluir, '{}') LOOP
    IF EXISTS (SELECT 1 FROM itens_estoque_niveis WHERE estoque_id = p_estoque_id AND item_id = v_item) THEN CONTINUE; END IF;
    INSERT INTO itens_estoque_niveis (item_id, estoque_id, nivel_reposicao, controle) VALUES (v_item, p_estoque_id, 0, 'contagem');
    PERFORM setores_log(p_estoque_id, v_item, NULL, 'incluir', NULL, jsonb_build_object('nivel', 0, 'controle', 'contagem'));
    v_incluidos := v_incluidos + 1;
  END LOOP;

  FOREACH v_item IN ARRAY coalesce(p_remover, '{}') LOOP
    SELECT coalesce(s.quantidade_atual, 0), trim(i.nome) INTO v_saldo, v_nome
      FROM itens_estoque i LEFT JOIN saldos_estoque s ON s.item_id = i.id AND s.estoque_id = p_estoque_id WHERE i.id = v_item;
    SELECT count(*) INTO v_vendas FROM mapeamento_itens_vendas m
     WHERE m.estoque_id = p_estoque_id AND coalesce(m.ignorar_estoque, false) = false
       AND (m.item_estoque_id = v_item OR EXISTS (SELECT 1 FROM ficha_ingredientes fi WHERE fi.ficha_id = m.ficha_tecnica_id AND fi.item_estoque_id = v_item AND coalesce(fi.baixa_estoque, true)));
    IF v_saldo <> 0 OR v_vendas > 0 THEN
      v_bloqueados := v_bloqueados || (v_nome || CASE WHEN v_saldo <> 0 THEN ' (saldo ' || round(v_saldo, 2) || ')' ELSE '' END || CASE WHEN v_vendas > 0 THEN ' (' || v_vendas || ' venda' || CASE WHEN v_vendas > 1 THEN 's' ELSE '' END || ' Zig)' ELSE '' END);
      CONTINUE;
    END IF;
    SELECT to_jsonb(n) - 'item_id' - 'estoque_id' INTO v_antes FROM itens_estoque_niveis n WHERE estoque_id = p_estoque_id AND item_id = v_item;
    DELETE FROM itens_estoque_niveis WHERE estoque_id = p_estoque_id AND item_id = v_item;
    IF FOUND THEN
      PERFORM setores_log(p_estoque_id, v_item, NULL, 'remover', v_antes, NULL);
      v_removidos := v_removidos + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('incluidos', v_incluidos, 'removidos', v_removidos, 'bloqueados', to_jsonb(v_bloqueados));
END; $$;

/** Passo 2: quanto deve ter. p_niveis = [{item_id, nivel}]. */
CREATE OR REPLACE FUNCTION fn_setores_niveis(p_estoque_id uuid, p_niveis jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v_antes numeric; v_n int := 0;
BEGIN
  PERFORM setores_exigir_gestor();
  FOR r IN SELECT (x->>'item_id')::uuid AS item_id, (x->>'nivel')::numeric AS nivel FROM jsonb_array_elements(coalesce(p_niveis, '[]'::jsonb)) x LOOP
    IF r.nivel IS NULL OR r.nivel < 0 THEN RAISE EXCEPTION 'Nível inválido'; END IF;
    SELECT nivel_reposicao INTO v_antes FROM itens_estoque_niveis WHERE estoque_id = p_estoque_id AND item_id = r.item_id;
    IF v_antes IS NULL OR v_antes = r.nivel THEN CONTINUE; END IF;
    UPDATE itens_estoque_niveis SET nivel_reposicao = r.nivel, atualizado_em = now() WHERE estoque_id = p_estoque_id AND item_id = r.item_id;
    PERFORM setores_log(p_estoque_id, r.item_id, NULL, 'nivel', jsonb_build_object('nivel', v_antes), jsonb_build_object('nivel', r.nivel));
    v_n := v_n + 1;
  END LOOP;
  RETURN jsonb_build_object('alterados', v_n);
END; $$;

/** Passo 3: como sai. 'venda' = Zig baixa; 'contagem' = conta todo dia. */
CREATE OR REPLACE FUNCTION fn_setores_controle(p_estoque_id uuid, p_item_id uuid, p_controle text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_antes text;
BEGIN
  PERFORM setores_exigir_gestor();
  IF p_controle NOT IN ('venda', 'contagem') THEN RAISE EXCEPTION 'Forma de baixa inválida'; END IF;
  SELECT controle INTO v_antes FROM itens_estoque_niveis WHERE estoque_id = p_estoque_id AND item_id = p_item_id;
  IF v_antes IS NULL THEN RAISE EXCEPTION 'Item não está neste setor'; END IF;
  IF v_antes <> p_controle THEN
    UPDATE itens_estoque_niveis SET controle = p_controle, atualizado_em = now() WHERE estoque_id = p_estoque_id AND item_id = p_item_id;
    PERFORM setores_log(p_estoque_id, p_item_id, NULL, 'controle', jsonb_build_object('controle', v_antes), jsonb_build_object('controle', p_controle));
  END IF;
  RETURN jsonb_build_object('controle', p_controle);
END; $$;

/** Liga uma venda da Zig a este item neste setor: direto, ou por uma ficha que usa o item. */
CREATE OR REPLACE FUNCTION fn_setores_ligar_venda(p_estoque_id uuid, p_item_id uuid, p_mapeamento_id uuid, p_modo text, p_ficha_id uuid DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_antes jsonb; v_depois jsonb;
BEGIN
  PERFORM setores_exigir_gestor();
  IF p_modo NOT IN ('direto', 'ficha') THEN RAISE EXCEPTION 'Modo inválido'; END IF;
  IF NOT EXISTS (SELECT 1 FROM itens_estoque_niveis WHERE estoque_id = p_estoque_id AND item_id = p_item_id) THEN RAISE EXCEPTION 'Item não está neste setor'; END IF;
  IF p_modo = 'ficha' AND NOT EXISTS (SELECT 1 FROM setores_fichas_do_item(p_item_id) WHERE ficha_id = p_ficha_id) THEN
    RAISE EXCEPTION 'Essa ficha não usa este item com baixa de estoque';
  END IF;
  SELECT jsonb_build_object('estoque_id', estoque_id, 'item_estoque_id', item_estoque_id, 'ficha_tecnica_id', ficha_tecnica_id, 'ignorar_estoque', ignorar_estoque)
    INTO v_antes FROM mapeamento_itens_vendas WHERE id = p_mapeamento_id;
  IF v_antes IS NULL THEN RAISE EXCEPTION 'Venda Zig não encontrada'; END IF;

  UPDATE mapeamento_itens_vendas
     SET estoque_id = p_estoque_id,
         item_estoque_id = CASE WHEN p_modo = 'direto' THEN p_item_id ELSE NULL END,
         ficha_tecnica_id = CASE WHEN p_modo = 'ficha' THEN p_ficha_id ELSE NULL END,
         ignorar_estoque = false,
         tipo_mapeamento = 'manual',
         atualizado_em = now()
   WHERE id = p_mapeamento_id;
  SELECT jsonb_build_object('estoque_id', estoque_id, 'item_estoque_id', item_estoque_id, 'ficha_tecnica_id', ficha_tecnica_id, 'ignorar_estoque', ignorar_estoque)
    INTO v_depois FROM mapeamento_itens_vendas WHERE id = p_mapeamento_id;
  PERFORM setores_log(p_estoque_id, p_item_id, p_mapeamento_id, 'ligar_venda', v_antes, v_depois);
  RETURN fn_setores_vendas_do_item(p_estoque_id, p_item_id);
END; $$;

/** Desliga a venda: ela fica sem vínculo (a Zig passa a apontar como não mapeada). */
CREATE OR REPLACE FUNCTION fn_setores_desligar_venda(p_estoque_id uuid, p_item_id uuid, p_mapeamento_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_antes jsonb;
BEGIN
  PERFORM setores_exigir_gestor();
  SELECT jsonb_build_object('estoque_id', estoque_id, 'item_estoque_id', item_estoque_id, 'ficha_tecnica_id', ficha_tecnica_id, 'ignorar_estoque', ignorar_estoque)
    INTO v_antes FROM mapeamento_itens_vendas WHERE id = p_mapeamento_id AND estoque_id = p_estoque_id;
  IF v_antes IS NULL THEN RAISE EXCEPTION 'Venda não está ligada a este setor'; END IF;
  UPDATE mapeamento_itens_vendas SET estoque_id = NULL, item_estoque_id = NULL, ficha_tecnica_id = NULL, atualizado_em = now() WHERE id = p_mapeamento_id;
  PERFORM setores_log(p_estoque_id, p_item_id, p_mapeamento_id, 'desligar_venda', v_antes, NULL);
  RETURN fn_setores_vendas_do_item(p_estoque_id, p_item_id);
END; $$;

/** Move o item de um setor para outro: nível, forma de baixa, saldo e vendas diretas vão junto. */
CREATE OR REPLACE FUNCTION fn_setores_mover_item(p_de uuid, p_para uuid, p_item_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nivel record; v_saldo numeric; v_custo numeric; v_vendas int; v_fichas int; v_nome text; v_chave text;
BEGIN
  PERFORM setores_exigir_gestor();
  IF p_de = p_para THEN RAISE EXCEPTION 'Origem e destino iguais'; END IF;
  IF NOT EXISTS (SELECT 1 FROM estoques WHERE id = p_para AND status AND tipo <> 'central') THEN RAISE EXCEPTION 'Setor de destino inválido'; END IF;
  SELECT * INTO v_nivel FROM itens_estoque_niveis WHERE estoque_id = p_de AND item_id = p_item_id;
  IF v_nivel IS NULL THEN RAISE EXCEPTION 'Item não está no setor de origem'; END IF;
  SELECT trim(nome), coalesce(custo_medio, 0) INTO v_nome, v_custo FROM itens_estoque WHERE id = p_item_id;

  INSERT INTO itens_estoque_niveis (item_id, estoque_id, nivel_reposicao, controle)
  VALUES (p_item_id, p_para, v_nivel.nivel_reposicao, v_nivel.controle)
  ON CONFLICT (item_id, estoque_id) DO UPDATE SET nivel_reposicao = EXCLUDED.nivel_reposicao, controle = EXCLUDED.controle, atualizado_em = now();
  DELETE FROM itens_estoque_niveis WHERE estoque_id = p_de AND item_id = p_item_id;

  SELECT coalesce(quantidade_atual, 0) INTO v_saldo FROM saldos_estoque WHERE estoque_id = p_de AND item_id = p_item_id;
  v_saldo := coalesce(v_saldo, 0);
  IF v_saldo <> 0 THEN
    v_chave := 'setores_mover_' || p_item_id || '_' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISSMS');
    -- Saldo positivo vai de → para. Negativo: a dívida segue o item, então a transferência é para → de.
    INSERT INTO movimentacoes_estoque (item_id, tipo_movimentacao, quantidade, estoque_origem_id, estoque_destino_id, custo_unitario, custo_total, data_movimentacao, motivo, observacoes, origem_tipo, criado_por, item_descricao, idempotency_key)
    VALUES (p_item_id, 'transferencia', abs(v_saldo), CASE WHEN v_saldo > 0 THEN p_de ELSE p_para END, CASE WHEN v_saldo > 0 THEN p_para ELSE p_de END,
            v_custo, abs(v_saldo) * v_custo, current_date, 'Mudança de setor', 'Configurar setores: item movido de setor', 'setores', fn_usuario_sistema_id(), v_nome, v_chave);
  END IF;

  UPDATE mapeamento_itens_vendas SET estoque_id = p_para, atualizado_em = now()
   WHERE estoque_id = p_de AND item_estoque_id = p_item_id AND coalesce(ignorar_estoque, false) = false;
  GET DIAGNOSTICS v_vendas = ROW_COUNT;
  SELECT count(*) INTO v_fichas FROM mapeamento_itens_vendas m
   WHERE m.estoque_id = p_de AND coalesce(m.ignorar_estoque, false) = false
     AND EXISTS (SELECT 1 FROM ficha_ingredientes fi WHERE fi.ficha_id = m.ficha_tecnica_id AND fi.item_estoque_id = p_item_id AND coalesce(fi.baixa_estoque, true));

  PERFORM setores_log(p_de, p_item_id, NULL, 'mover', jsonb_build_object('de', p_de, 'saldo', v_saldo), jsonb_build_object('para', p_para, 'vendas_movidas', v_vendas, 'fichas_ficaram', v_fichas));
  RETURN jsonb_build_object('saldo_movido', v_saldo, 'vendas_movidas', v_vendas, 'vendas_por_ficha_ficaram', v_fichas);
END; $$;

GRANT EXECUTE ON FUNCTION fn_setores_regras(), fn_setores_regras_salvar(int[], uuid[]), fn_setores_resumo(), fn_setores_itens(uuid),
  fn_setores_vendas_do_item(uuid, uuid), fn_setores_buscar_vendas(text), fn_setores_presenca(uuid, uuid[], uuid[]), fn_setores_niveis(uuid, jsonb),
  fn_setores_controle(uuid, uuid, text), fn_setores_ligar_venda(uuid, uuid, uuid, text, uuid), fn_setores_desligar_venda(uuid, uuid, uuid),
  fn_setores_mover_item(uuid, uuid, uuid) TO authenticated;
