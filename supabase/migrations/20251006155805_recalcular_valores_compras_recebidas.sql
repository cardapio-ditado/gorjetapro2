/*
  # Recalcular valores de compras já recebidas

  ## Descrição
  Atualiza o valor_total de todas as compras com status 'recebido' para refletir
  as quantidades efetivamente recebidas ao invés das quantidades pedidas.

  ## Mudanças
  
  1. Atualizar valor_total de compras recebidas baseado em quantidade_recebida
  2. Usar COALESCE para compatibilidade com registros antigos
*/

-- Atualizar valor_total de todas as compras recebidas
UPDATE entradas_compras ec
SET valor_total = (
  SELECT COALESCE(SUM(
    COALESCE(iec.quantidade_recebida, iec.quantidade) * iec.custo_unitario
  ), 0)
  FROM itens_entrada_compra iec
  WHERE iec.entrada_compra_id = ec.id
)
WHERE ec.status = 'recebido';