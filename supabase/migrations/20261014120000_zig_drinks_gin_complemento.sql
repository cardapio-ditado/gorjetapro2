-- Drinks de gin: o cliente escolhe o gin no complemento da Zig (nacional ou
-- importado). Até aqui os complementos desses drinks eram descartados e a ficha
-- sempre baixava o gin nacional, então o Tanqueray usado nos drinks nunca saía
-- do estoque.
--
-- Agora o drink abre os complementos (expandir_additions) e, com a nova marca
-- baixar_pai_com_additions, continua baixando a própria ficha. Cada complemento
-- vira uma venda à parte, mapeada em Estoque › ZIG Vendas › Mapeamento
-- assistido (o gin importado vai para a ficha TANQUERAY DOSE).

alter table public.mapeamento_itens_vendas
  add column if not exists baixar_pai_com_additions boolean not null default false;

comment on column public.mapeamento_itens_vendas.baixar_pai_com_additions is
  'Produto com complementos expandidos que ainda baixa a própria ficha ou item (ex.: drinks de gin, cujo complemento só diz qual gin foi usado).';

update public.mapeamento_itens_vendas
   set expandir_additions = true,
       baixar_pai_com_additions = true
 where nome_externo in ('GIN TROPICAL', 'GIN DE MORANGO', 'GIN RED VELVET', 'Gin Ditado',
                        'GIN TRADICIONAL', 'GIN MELANCITA', 'GIN JACUZZI', 'Gin Cranberry');

-- Dados ajustados direto no banco em 14/10/2026, junto com esta migração:
--   - ficha nova GIN NACIONAL DOSE (BAG DE GIN BACCO 0,01).
--   - complemento NACIONAL passou a baixar GIN NACIONAL DOSE (antes apontava
--     para a ficha inteira do GIN DITADO NACIONAL).
--   - complemento TANQUERAY GF passou a baixar TANQUERAY DOSE (antes baixava a
--     garrafa inteira).
--   - nas fichas dos 8 drinks, o BAG DE GIN BACCO ficou com baixa_estoque=false
--     (continua no custo da ficha, mas o gin agora sai pelo complemento).
