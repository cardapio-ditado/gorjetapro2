-- Vale Ditado: o brinde da Black Brasa (Dupla de Bolinho de Costela) também sai na ZIG como item a R$ 0,00.
-- Faltou na migração 20261125250000. Copia o vínculo do produto normal (hoje sem ficha: fica pendente igual a ele).
insert into mapeamento_itens_vendas (nome_externo, nome_normalizado, tipo_mapeamento, origem, confianca, usado_vezes, zig_category,
                                     item_estoque_id, ficha_tecnica_id, estoque_id, ignorar_estoque, expandir_additions, baixar_pai_com_additions)
select 'VALE DUPLA DE BOLINHO DE COSTELA', 'vale dupla de bolinho de costela', 'manual', 'manual', 1, 0, 'VALE',
       m.item_estoque_id, m.ficha_tecnica_id, m.estoque_id, coalesce(m.ignorar_estoque, false),
       coalesce(m.expandir_additions, false), coalesce(m.baixar_pai_com_additions, false)
from (select 1) x left join mapeamento_itens_vendas m on m.nome_externo = 'DUPLA DE BOLINHO DE COSTELA'
on conflict (nome_externo) do nothing;
