/*
  # Remove o Estoque Beta (1)

  O módulo foi descartado. Saem as funções fn_beta_*, as tabelas de montagem
  e de contagem do beta, o bucket de fotos e suas políticas.

  Fica de pé só `beta_item_config` (como se conta cada item: solto, fechado,
  fator), porque o Estoque Beta 2 lê essa tabela. Os movimentos de estoque
  gravados com origem 'beta' são história real e não são tocados (hoje: zero).
*/

-- Funções
DROP FUNCTION IF EXISTS fn_beta_buscar_item(text, uuid);
DROP FUNCTION IF EXISTS fn_beta_categorias();
DROP FUNCTION IF EXISTS fn_beta_central_abrir(text, text);
DROP FUNCTION IF EXISTS fn_beta_central_concluir(uuid);
DROP FUNCTION IF EXISTS fn_beta_central_contar(uuid, uuid, numeric, numeric);
DROP FUNCTION IF EXISTS fn_beta_central_zonas();
DROP FUNCTION IF EXISTS fn_beta_config_item(uuid, jsonb);
DROP FUNCTION IF EXISTS fn_beta_extrato(uuid, uuid, date, date);
DROP FUNCTION IF EXISTS fn_beta_ficha_item(uuid);
DROP FUNCTION IF EXISTS fn_beta_fichas_producao();
DROP FUNCTION IF EXISTS fn_beta_foto_item(uuid, text);
DROP FUNCTION IF EXISTS fn_beta_item_salvar(jsonb);
DROP FUNCTION IF EXISTS fn_beta_item_status(uuid, text);
DROP FUNCTION IF EXISTS fn_beta_itens_listar(text, text, text);
DROP FUNCTION IF EXISTS fn_beta_montagem_abrir(uuid, text);
DROP FUNCTION IF EXISTS fn_beta_montagem_concluir(uuid, jsonb);
DROP FUNCTION IF EXISTS fn_beta_montagem_contar(uuid, uuid, numeric, numeric);
DROP FUNCTION IF EXISTS fn_beta_montagem_fechar_contagem(uuid);
DROP FUNCTION IF EXISTS fn_beta_niveis_listar(uuid);
DROP FUNCTION IF EXISTS fn_beta_nivel_definir(uuid, uuid, numeric, text);
DROP FUNCTION IF EXISTS fn_beta_painel();
DROP FUNCTION IF EXISTS fn_beta_painel_dia();
DROP FUNCTION IF EXISTS fn_beta_pedir_mais(uuid, uuid, numeric, text);
DROP FUNCTION IF EXISTS fn_beta_posicao(uuid);
DROP FUNCTION IF EXISTS fn_beta_produzir(uuid, numeric, uuid, uuid, text);
DROP FUNCTION IF EXISTS fn_beta_receber_concluir(jsonb);
DROP FUNCTION IF EXISTS fn_beta_receber_preparar(jsonb, jsonb);
DROP FUNCTION IF EXISTS fn_beta_transferir(uuid, uuid, jsonb, text);
DROP FUNCTION IF EXISTS beta_origem_rotulo(text, text, text);
DROP FUNCTION IF EXISTS beta_rotulo_padrao(text);

-- Tabelas de operação do beta (montar balcão e contar o Central)
DROP TABLE IF EXISTS beta_montagem_itens CASCADE;
DROP TABLE IF EXISTS beta_montagens CASCADE;
DROP TABLE IF EXISTS beta_contagem_itens CASCADE;
DROP TABLE IF EXISTS beta_contagens CASCADE;

-- Fotos dos itens: o bucket `estoque-fotos` está vazio. O Supabase não deixa
-- apagar bucket por SQL; ficam só as políticas removidas. Apagar o bucket,
-- se quiser, pelo painel Storage.
DROP POLICY IF EXISTS estoque_fotos_ler ON storage.objects;
DROP POLICY IF EXISTS estoque_fotos_enviar ON storage.objects;
DROP POLICY IF EXISTS estoque_fotos_trocar ON storage.objects;
