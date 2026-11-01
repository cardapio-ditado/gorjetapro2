-- DRE: a árvore de categorias filtrava status = 'ativo', então lançamentos
-- antigos em categorias depois desativadas sumiam do DRE (o histórico mudava
-- ao desativar uma categoria). E "origem <> 'transferencia'" descartava
-- lançamentos com origem vazia. Mesma visão, sem esses dois cortes.
create or replace view public.vw_dre_consolidado as
 WITH RECURSIVE categoria_tree AS (
         SELECT categorias_financeiras.id, categorias_financeiras.nome, categorias_financeiras.tipo, categorias_financeiras.categoria_pai_id,
            categorias_financeiras.id AS categoria_raiz_id, categorias_financeiras.nome AS categoria_raiz_nome, 0 AS nivel
           FROM categorias_financeiras
          WHERE categorias_financeiras.categoria_pai_id IS NULL
        UNION ALL
         SELECT c.id, c.nome, c.tipo, c.categoria_pai_id, ct.categoria_raiz_id, ct.categoria_raiz_nome, ct.nivel + 1
           FROM categorias_financeiras c
             JOIN categoria_tree ct ON c.categoria_pai_id = ct.id
        ), lancamentos_categorizados AS (
         SELECT fc.id, fc.categoria_id, fc.centro_custo_id, fc.data, fc.valor, fc.tipo,
            EXTRACT(year FROM fc.data) AS ano, EXTRACT(month FROM fc.data) AS mes
           FROM fluxo_caixa fc
          WHERE fc.categoria_id IS NOT NULL AND COALESCE(fc.origem, '') <> 'transferencia'::text
        ), lancamentos_com_hierarquia AS (
         SELECT lc.id AS lancamento_id, ct.id AS categoria_id, ct.nome AS categoria_nome, ct.categoria_pai_id,
            ct.categoria_raiz_id, ct.categoria_raiz_nome, ct.tipo, ct.nivel, lc.centro_custo_id, lc.ano, lc.mes, lc.valor,
                CASE WHEN lc.tipo = 'entrada'::text THEN abs(lc.valor) ELSE - abs(lc.valor) END AS valor_ajustado
           FROM lancamentos_categorizados lc
             JOIN categoria_tree ct ON lc.categoria_id = ct.id
        ), lancamentos_diretos_raiz AS (
         SELECT h.categoria_raiz_id, h.categoria_raiz_nome, gen_random_uuid() AS categoria_id, 'Outros'::text AS categoria_nome,
            h.tipo, 1 AS nivel, NULL::uuid AS centro_custo_id, h.ano, h.mes,
            sum(h.valor_ajustado) AS valor_total, count(h.lancamento_id) AS quantidade_lancamentos
           FROM lancamentos_com_hierarquia h
          WHERE h.nivel = 0
          GROUP BY h.categoria_raiz_id, h.categoria_raiz_nome, h.tipo, h.ano, h.mes
         HAVING sum(h.valor_ajustado) <> 0::numeric OR count(h.lancamento_id) > 0
        ), lancamentos_subcategorias AS (
         SELECT h.categoria_raiz_id, h.categoria_raiz_nome, h.categoria_id, h.categoria_nome, h.tipo, h.nivel,
            NULL::uuid AS centro_custo_id, h.ano, h.mes,
            sum(h.valor_ajustado) AS valor_total, count(h.lancamento_id) AS quantidade_lancamentos
           FROM lancamentos_com_hierarquia h
          WHERE h.nivel > 0
          GROUP BY h.categoria_raiz_id, h.categoria_raiz_nome, h.categoria_id, h.categoria_nome, h.tipo, h.nivel, h.ano, h.mes
         HAVING sum(h.valor_ajustado) <> 0::numeric OR count(h.lancamento_id) > 0
        ), lancamentos_sem_categoria AS (
         SELECT fc.centro_custo_id, fc.data, fc.valor, fc.tipo,
            EXTRACT(year FROM fc.data) AS ano, EXTRACT(month FROM fc.data) AS mes,
                CASE WHEN fc.tipo = 'entrada'::text THEN 'receita'::text ELSE 'despesa'::text END AS tipo_categoria
           FROM fluxo_caixa fc
          WHERE fc.categoria_id IS NULL AND COALESCE(fc.origem, '') <> 'transferencia'::text
        ), lancamentos_nao_classificados AS (
         SELECT gen_random_uuid() AS categoria_raiz_id,
                CASE WHEN s.tipo_categoria = 'receita'::text THEN 'Receitas Não Classificadas'::text ELSE 'Despesas Não Classificadas'::text END AS categoria_raiz_nome,
            gen_random_uuid() AS categoria_id, 'Lançamentos Não Classificados'::text AS categoria_nome,
            s.tipo_categoria AS tipo, 1 AS nivel, NULL::uuid AS centro_custo_id, s.ano, s.mes,
            sum(CASE WHEN s.tipo_categoria = 'receita'::text THEN s.valor ELSE - abs(s.valor) END) AS valor_total,
            count(*) AS quantidade_lancamentos
           FROM lancamentos_sem_categoria s
          GROUP BY s.tipo_categoria, s.ano, s.mes
         HAVING sum(CASE WHEN s.tipo_categoria = 'receita'::text THEN s.valor ELSE - abs(s.valor) END) <> 0::numeric OR count(*) > 0
        )
 SELECT categoria_raiz_id, categoria_raiz_nome, categoria_id, categoria_nome, tipo, nivel, centro_custo_id, ano, mes, valor_total, quantidade_lancamentos
   FROM lancamentos_subcategorias
UNION ALL
 SELECT categoria_raiz_id, categoria_raiz_nome, categoria_id, categoria_nome, tipo, nivel, centro_custo_id, ano, mes, valor_total, quantidade_lancamentos
   FROM lancamentos_diretos_raiz
UNION ALL
 SELECT categoria_raiz_id, categoria_raiz_nome, categoria_id, categoria_nome, tipo, nivel, centro_custo_id, ano, mes, valor_total, quantidade_lancamentos
   FROM lancamentos_nao_classificados
  ORDER BY 5, 2, 6, 4;

revoke all on table public.vw_dre_consolidado from anon;
