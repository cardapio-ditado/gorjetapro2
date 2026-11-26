-- Vale Ditado no bar (Kadu, 25/11/2026): como o vale é lançado na ZIG, para o 10% sair sobre o valor pago.
-- A ZIG calcula o 10% antes do desconto, então o vale não usa desconto: na primeira baixa o garçom lança o
-- produto "VALE <KIT>" no preço do vale (carrega o valor e o 10%), e cada item servido sai como "VALE <ITEM>"
-- a R$ 0,00 (vai para a cozinha e o bar e baixa o estoque). O valor do kit fecha na forma "Voucher pré-pago".
-- Vales 100 e 200 usam itens normais + desconto "Vale Ditado" (Kadu escolheu: a casa banca a diferença do 10%).
--
-- Aqui só o vínculo de estoque, categoria "VALE" na ZIG:
--  * "VALE <KIT>": não baixa estoque (quem baixa são os itens).
--  * "VALE <ITEM>": copia o vínculo do produto normal da ZIG (mesma ficha, item, estoque e regra de complementos).
--    Se o produto normal ainda não tem ficha, o VALE fica igual (pendente no Mapeamento assistido).
--  * "VALE COXA E SOBRECOXA NA BRASA": sem produto normal equivalente; fica pendente.
-- Nomes só com letras, números e espaço, para casar com a ZIG sem depender de acento ou pontuação.

insert into mapeamento_itens_vendas (nome_externo, nome_normalizado, tipo_mapeamento, origem, confianca, usado_vezes,
                                     zig_category, ignorar_estoque, expandir_additions, baixar_pai_com_additions)
select nome, lower(nome), 'manual', 'manual', 1, 0, 'VALE', true, false, false
from unnest(array['VALE CARTELA 5 CHOPPS', 'VALE CARTELA 10 CHOPPS', 'VALE ABRE A BRASA', 'VALE KIT BOTECO', 'VALE KIT PASSARINHO',
                  'VALE KIT PICANHA', 'VALE TABUA E CHOPP', 'VALE ASSADO DO ZE', 'VALE ROLE DE GIN', 'VALE RODADA DE CAIPIRINHA',
                  'VALE FAMILIA NO DITADO']) as nome
on conflict (nome_externo) do nothing;

insert into mapeamento_itens_vendas (nome_externo, nome_normalizado, tipo_mapeamento, origem, confianca, usado_vezes, zig_category,
                                     item_estoque_id, ficha_tecnica_id, estoque_id, ignorar_estoque, expandir_additions, baixar_pai_com_additions)
select v.nome, lower(v.nome), 'manual', 'manual', 1, 0, 'VALE',
       m.item_estoque_id, m.ficha_tecnica_id, m.estoque_id, coalesce(m.ignorar_estoque, false),
       coalesce(m.expandir_additions, false), coalesce(m.baixar_pai_com_additions, false)
from (values
  ('VALE CHOPP BRAHMA 300', 'CHOPP BRAHMA 300'),
  ('VALE CAIPIRINHA 500', 'CAIPIRINHA'),
  ('VALE GIN TONICA', 'GIN TRADICIONAL'),
  ('VALE TORRESMO DE ROLO', 'TORRESMO DE ROLO'),
  ('VALE BOLINHO DE COSTELA 8 UN', 'BOLINHO DE COSTELA 8 UN'),
  ('VALE FRANGO A PASSARINHO', 'FRANGO A PASSARINHO'),
  ('VALE FRITAS 500G', 'FRITAS TRADICIONAL 500G'),
  ('VALE LINGUICA PORTUGUESA NA MASSA', 'LINGUICA PORTUGUESA NA MASSA'),
  ('VALE QUEIJO COALHO COM MEL', 'QUEIJO COALHO COM MEL'),
  ('VALE PAO DE ALHO', 'PÃO DE ALHO'),
  ('VALE PICANHA ACEBOLADA 400G', 'PICANHA ACEBOLADA 400G'),
  ('VALE PICANHA NA CHAPA CASCATA DE QUEIJO', 'PICANHA NA CHAPA C/ CASCATA DE QUEIJO'),
  ('VALE TABUA DE FRIOS', 'TÁBUA DE FRIOS DITADO'),
  ('VALE COXA E SOBRECOXA NA BRASA', null),
  ('VALE PEPSI LT', 'PEPSI LT'),
  ('VALE PEPSI BLACK LT', 'PEPSI BLACK LT'),
  ('VALE PEPSI TWIST LT', 'PEPSI TWIST LT'),
  ('VALE GUARANA LT', 'GUARANÁ ANTARCTICA LT'),
  ('VALE GUARANA ZERO LT', 'GUARANÁ ZERO LT'),
  ('VALE SODA LT', 'SODA ANTARTICA LT'),
  ('VALE SUKITA LT', 'SUKITA LT')
) as v(nome, origem_zig)
left join mapeamento_itens_vendas m on m.nome_externo = v.origem_zig
on conflict (nome_externo) do nothing;
