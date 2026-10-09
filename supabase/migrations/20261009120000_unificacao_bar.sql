-- Unificação dos bares (09/10/2026).
-- Bar de Cerveja e Bar de Drinks passam a ser um só estoque, "Bar".
-- O que foi feito direto no banco (registrado em setores_config_log, ação 'unificacao'):
--   · saldos do Bar de Drinks transferidos para o Bar (44 movimentos, motivo "Unificação dos bares");
--   · configuração do Drinks incorporada à do Bar (nível maior, controle 'venda' se qualquer um era);
--   · vínculos da Zig do Drinks → Bar; garrafas de bebida alcoólica que baixavam do Central → Bar
--     (chopp continua no Central);
--   · 25 vinhos, whiskies e destilados que só existiam no Central entram no Bar com nível 0 e 'venda';
--   · Bar de Cerveja renomeado para "Bar"; Bar de Drinks inativado como "Bar de Drinks (unificado no Bar)".
-- Esta migration só ajusta a página pública do pedido: os links antigos /pedido/cerveja e
-- /pedido/drinks continuam abrindo, agora no Bar.

CREATE OR REPLACE FUNCTION public.fn_pedido_setor_estoque(p_setor text)
RETURNS TABLE(estoque_id uuid, estoque_nome text, setor_nome text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH alvo AS (
    SELECT CASE lower(trim(p_setor))
             WHEN 'bar' THEN 'bar'
             WHEN 'cerveja' THEN 'bar'
             WHEN 'drinks' THEN 'bar'
             WHEN 'drink' THEN 'bar'
             WHEN 'bar-de-cerveja' THEN 'bar'
             WHEN 'bar-de-drinks' THEN 'bar'
             ELSE regexp_replace(lower(trim(p_setor)), '\s+', '-', 'g')
           END AS slug
  )
  SELECT e.id, e.nome, e.nome
    FROM estoques e, alvo a
   WHERE e.status = true AND e.tipo <> 'central'
     AND regexp_replace(lower(e.nome), '\s+', '-', 'g') = a.slug
   LIMIT 1;
$$;
