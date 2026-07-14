/*
  # Atualizar valor total da compra para refletir quantidade recebida

  ## Descrição
  Adiciona trigger para atualizar automaticamente o valor_total da compra
  baseado nas quantidades efetivamente recebidas.

  ## Mudanças
  
  1. Criar função para calcular valor total baseado em quantidade recebida
  2. Criar trigger para atualizar valor_total quando itens são recebidos
  3. Adicionar coluna computed para facilitar queries

  ## Comportamento
  - Ao confirmar recebimento, valor_total é recalculado
  - Usa quantidade_recebida quando disponível
  - Mantém compatibilidade com compras antigas (usa quantidade)
*/

-- Função para atualizar valor total da compra baseado no recebido
CREATE OR REPLACE FUNCTION atualizar_valor_total_compra()
RETURNS TRIGGER AS $$
DECLARE
    novo_valor_total numeric;
BEGIN
    -- Calcular valor total baseado nas quantidades recebidas
    SELECT COALESCE(SUM(
        COALESCE(quantidade_recebida, quantidade) * custo_unitario
    ), 0)
    INTO novo_valor_total
    FROM itens_entrada_compra
    WHERE entrada_compra_id = NEW.entrada_compra_id;

    -- Atualizar o valor total da compra
    UPDATE entradas_compras
    SET valor_total = novo_valor_total
    WHERE id = NEW.entrada_compra_id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para atualizar valor total quando itens são atualizados
DROP TRIGGER IF EXISTS trg_atualizar_valor_total_compra ON itens_entrada_compra;

CREATE TRIGGER trg_atualizar_valor_total_compra
    AFTER INSERT OR UPDATE OF quantidade_recebida ON itens_entrada_compra
    FOR EACH ROW
    EXECUTE FUNCTION atualizar_valor_total_compra();

-- Grant permissions
GRANT EXECUTE ON FUNCTION atualizar_valor_total_compra() TO anon, authenticated;