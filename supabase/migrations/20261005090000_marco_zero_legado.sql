-- Marco zero do Estoque Beta 2 · 05/10/2026.
--
-- Operação única, já aplicada em produção pelo MCP (em partes, por causa do
-- limite de 60 s da ferramenta). Fica aqui como registro do que foi feito.
--
-- Decisão do dono: o Beta 2 passa a ser o estoque oficial a partir de hoje.
-- O histórico transacional vai para o esquema `legado` (só leitura) e as
-- tabelas do `public` recomeçam vazias. Os saldos iniciais nascem pela
-- contagem de hoje (zonas do Central, auditoria dos setores, kits).
--
-- Foi para o legado (copiado e zerado no public):
--   movimentacoes_estoque (26.137), saldos_estoque (1.006),
--   contagens_estoque (105) + itens (22.428) + ajustes (4.814),
--   requisicoes_internas (237, inclusive 13 pedidos abertos e 43 reposições
--   automáticas antigas) + itens (2.826), alertas_estoque_negativo (5.096),
--   auditoria_estoque (37.092), zig_vendas_sync_ids (6.246; copiado e
--   reinserido no public sem o vínculo com a movimentação, para a Zig não
--   reimportar vendas antigas).
--
-- Ficou como estava (cadastro e compras):
--   itens_estoque, estoques, fornecedores, fichas_tecnicas + ficha_ingredientes,
--   itens_estoque_niveis, contagem_ciclos, contagem_agenda, mapeamento da Zig,
--   configuracoes_sistema, entradas_compras + itens (1.860 notas, ligadas às
--   contas a pagar e ao histórico de preço), listas_compra, conferências,
--   snapshots_valor_estoque, vizinhos e emprestimos_vizinhos (1 linha, com o
--   vínculo da movimentação anulado).

CREATE SCHEMA IF NOT EXISTS legado;
COMMENT ON SCHEMA legado IS 'Histórico do estoque até 05/10/2026, antes do marco zero do Estoque Beta 2. Só leitura.';
CREATE TABLE legado.movimentacoes_estoque AS TABLE public.movimentacoes_estoque;
CREATE TABLE legado.saldos_estoque AS TABLE public.saldos_estoque;
CREATE TABLE legado.contagens_estoque AS TABLE public.contagens_estoque;
CREATE TABLE legado.contagens_estoque_itens AS TABLE public.contagens_estoque_itens;
CREATE TABLE legado.contagens_estoque_ajustes AS TABLE public.contagens_estoque_ajustes;
CREATE TABLE legado.requisicoes_internas AS TABLE public.requisicoes_internas;
CREATE TABLE legado.requisicoes_internas_itens AS TABLE public.requisicoes_internas_itens;
CREATE TABLE legado.alertas_estoque_negativo AS TABLE public.alertas_estoque_negativo;
CREATE TABLE legado.auditoria_estoque AS TABLE public.auditoria_estoque;
CREATE TABLE legado.zig_vendas_sync_ids AS TABLE public.zig_vendas_sync_ids;
ALTER TABLE legado.movimentacoes_estoque ADD PRIMARY KEY (id);
ALTER TABLE legado.contagens_estoque ADD PRIMARY KEY (id);
ALTER TABLE legado.contagens_estoque_itens ADD PRIMARY KEY (id);
ALTER TABLE legado.requisicoes_internas ADD PRIMARY KEY (id);
CREATE INDEX ON legado.movimentacoes_estoque (item_id, data_movimentacao);
CREATE INDEX ON legado.contagens_estoque_itens (contagem_id);
REVOKE ALL ON SCHEMA legado FROM anon, authenticated;

TRUNCATE public.contagens_estoque_ajustes, public.contagens_estoque_itens, public.contagens_estoque,
         public.requisicoes_internas_itens, public.requisicoes_internas,
         public.alertas_estoque_negativo, public.auditoria_estoque, public.saldos_estoque,
         public.itens_importacao_vendas, public.movimentacoes_compostas_itens, public.alertas_estoque, public.itens_consignados_movimentos,
         public.movimentacoes_estoque, public.zig_vendas_sync_ids;

INSERT INTO public.zig_vendas_sync_ids (id, zig_product_id, zig_product_name, data_venda, sincronizado_em, movimentacao_id, quantidade)
SELECT id, zig_product_id, zig_product_name, data_venda, sincronizado_em, NULL, quantidade FROM legado.zig_vendas_sync_ids
ON CONFLICT (id) DO NOTHING;

UPDATE public.emprestimos_vizinhos SET movimentacao_id = NULL WHERE movimentacao_id IS NOT NULL;
