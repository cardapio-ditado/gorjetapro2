/*
  # Processar todas as vendas pendentes de uma importação

  Processa todos os itens mapeados de uma importação que ainda
  não tiveram seus insumos baixados automaticamente.

  Uso: SELECT * FROM processar_vendas_importacao(importacao_id);
*/

CREATE OR REPLACE FUNCTION processar_vendas_importacao(
  p_importacao_id UUID
) RETURNS TABLE (
  total_itens INTEGER,
  processados INTEGER,
  com_erro INTEGER,
  detalhes JSONB
) AS $$
DECLARE
  v_item_id UUID;
  v_resultado RECORD;
  v_total INTEGER := 0;
  v_sucesso INTEGER := 0;
  v_erros INTEGER := 0;
  v_detalhes JSONB := '[]'::JSONB;
BEGIN
  -- Processar cada item da importação
  FOR v_item_id IN
    SELECT id
    FROM itens_importacao_vendas
    WHERE importacao_id = p_importacao_id
      AND status = 'mapeado'
      AND movimentacao_id IS NULL
    ORDER BY linha_numero
  LOOP
    v_total := v_total + 1;

    -- Tentar baixar insumos
    SELECT * INTO v_resultado
    FROM baixar_insumos_venda_automatica(v_item_id)
    LIMIT 1;

    IF v_resultado.sucesso THEN
      v_sucesso := v_sucesso + 1;
    ELSE
      v_erros := v_erros + 1;
    END IF;

    -- Adicionar aos detalhes
    v_detalhes := v_detalhes || jsonb_build_object(
      'item_id', v_item_id,
      'sucesso', v_resultado.sucesso,
      'mensagem', v_resultado.mensagem,
      'movimentacoes', v_resultado.total_movimentacoes
    );
  END LOOP;

  -- Retornar resultado consolidado
  RETURN QUERY SELECT
    v_total,
    v_sucesso,
    v_erros,
    v_detalhes;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION processar_vendas_importacao IS
'Processa todas as vendas mapeadas de uma importação.
Uso: SELECT * FROM processar_vendas_importacao(importacao_id);';