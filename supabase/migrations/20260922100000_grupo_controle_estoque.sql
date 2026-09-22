/*
  # Grupo de controle: cada item passa a ter uma regra só

  O estoque tentava controlar 600 itens do mesmo jeito. Isso não funciona,
  porque papel toalha e whisky não se controlam igual. A partir daqui cada
  item cai em um de três grupos, e o grupo define o que o sistema espera dele.

  1. `vende`   - tem ficha técnica e baixa sozinho quando vende.
                 A contagem só confere.
  2. `conta`   - não tem como baixar sozinho. O consumo é a diferença entre
                 duas contagens: saldo anterior + entradas - saldo contado.
  3. `gasta`   - não é insumo de venda (limpeza, descartável, utensílio,
                 uniforme). Vira despesa quando sai do estoque. Não entra na
                 contagem do dia a dia, só na conferência periódica.

  A classificação abaixo é a primeira leva, feita pela regra óbvia. Ela é
  revisável item a item na tela de revisão.
*/

-- 1. A coluna
ALTER TABLE itens_estoque
  ADD COLUMN IF NOT EXISTS grupo_controle text;

ALTER TABLE itens_estoque
  DROP CONSTRAINT IF EXISTS itens_estoque_grupo_controle_check;

ALTER TABLE itens_estoque
  ADD CONSTRAINT itens_estoque_grupo_controle_check
  CHECK (grupo_controle IS NULL OR grupo_controle IN ('vende', 'conta', 'gasta'));

CREATE INDEX IF NOT EXISTS idx_itens_estoque_grupo_controle
  ON itens_estoque (grupo_controle) WHERE status = 'ativo';

COMMENT ON COLUMN itens_estoque.grupo_controle IS
  'Como o item é controlado: vende (baixa por ficha), conta (inventário periódico), gasta (despesa na saída)';

-- 2. Primeira classificação: o que não é insumo de venda vira "gasta"
UPDATE itens_estoque
SET grupo_controle = 'gasta'
WHERE grupo_controle IS NULL
  AND categoria IN (
    'Utensílios',
    'Descartáveis',
    'Produtos de Limpeza',
    'Material de Escritório',
    'Equipamentos',
    'Uniformes',
    'MANUTENÇÃO  DE CARRO'
  );

-- 3. Quem é ingrediente de alguma ficha já baixa sozinho
UPDATE itens_estoque i
SET grupo_controle = 'vende'
WHERE i.grupo_controle IS NULL
  AND EXISTS (SELECT 1 FROM ficha_ingredientes fi WHERE fi.item_estoque_id = i.id);

-- 4. O resto vive de contagem
UPDATE itens_estoque
SET grupo_controle = 'conta'
WHERE grupo_controle IS NULL;

-- 5. O que é "gasta" sai da rotação diária de contagem
INSERT INTO contagem_ciclos (categoria, ciclo_dias) VALUES
  ('Descartáveis', 30),
  ('Produtos de Limpeza', 30),
  ('Material de Escritório', 90),
  ('Utensílios', 90),
  ('Equipamentos', 90),
  ('Uniformes', 90)
ON CONFLICT (categoria) DO UPDATE SET ciclo_dias = EXCLUDED.ciclo_dias, atualizado_em = now();

-- 6. Painel: quantos itens em cada grupo, e quanto valem
CREATE OR REPLACE FUNCTION fn_estoque_grupos()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_agg(linha ORDER BY linha->>'grupo')
  FROM (
    SELECT jsonb_build_object(
      'grupo', coalesce(i.grupo_controle, 'sem_grupo'),
      'itens', count(*),
      'valor_parado', round(coalesce(sum(sal.saldo * coalesce(i.custo_medio, 0)), 0)::numeric, 2)
    ) AS linha
    FROM itens_estoque i
    LEFT JOIN (
      SELECT item_id, sum(quantidade_atual) AS saldo
      FROM saldos_estoque GROUP BY item_id
    ) sal ON sal.item_id = i.id
    WHERE i.status = 'ativo'
    GROUP BY coalesce(i.grupo_controle, 'sem_grupo')
  ) x;
$$;

REVOKE ALL ON FUNCTION fn_estoque_grupos() FROM public, anon;
GRANT EXECUTE ON FUNCTION fn_estoque_grupos() TO authenticated;

-- 7. Definir o grupo de um item, da tela de revisão
CREATE OR REPLACE FUNCTION fn_grupo_controle_definir(p_item_id uuid, p_grupo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_grupo IS NOT NULL AND p_grupo NOT IN ('vende', 'conta', 'gasta') THEN
    RAISE EXCEPTION 'Grupo inválido: %', p_grupo;
  END IF;

  UPDATE itens_estoque SET grupo_controle = p_grupo WHERE id = p_item_id;
END;
$$;

REVOKE ALL ON FUNCTION fn_grupo_controle_definir(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION fn_grupo_controle_definir(uuid, text) TO authenticated;
