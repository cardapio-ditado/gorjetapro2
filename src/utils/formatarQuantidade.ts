/**
 * formatarQuantidade — exibição de quantidades de estoque sem artefatos
 *
 * PROBLEMA: a UI usa `.toFixed(2)`, que transforma 4,994 em "4.99" e
 * 5,0005 em "5.00" de forma inconsistente, além de mostrar "12.00"
 * para itens de unidade inteira.
 *
 * REGRA:
 *  - Arredonda a 3 casas (precisão real do estoque)
 *  - Remove zeros à direita (5.000 -> "5", 0.225 -> "0,225")
 *  - Formato brasileiro (vírgula decimal)
 *
 * ONDE APLICAR (substituir os `.toFixed(2)` / `.toFixed(3)` de exibição):
 *  - src/components/inventory/ItensEstoque.tsx (linha ~544)
 *  - src/components/inventory/InventarioConsolidado.tsx
 *  - src/components/inventory/contagem/ContagemContador.tsx (quantidade_sistema)
 *  - src/components/inventory/KardexProduto.tsx
 *  Obs.: NÃO usar em valores monetários — só em quantidades.
 */
export function formatarQuantidade(valor: number | string | null | undefined): string {
  const n = Number(valor);
  if (valor === null || valor === undefined || Number.isNaN(n)) return '0';

  // Arredonda a 3 casas para eliminar resíduo de ponto flutuante
  const arredondado = Math.round(n * 1000) / 1000;

  // Inteiro exato: sem casas decimais
  if (Number.isInteger(arredondado)) {
    return arredondado.toLocaleString('pt-BR');
  }

  // Fração real (peso, litro, dose): até 3 casas, sem zeros à direita
  return arredondado.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

/**
 * Exemplo de uso na linha 544 de ItensEstoque.tsx:
 *
 * ANTES:
 *   {(item.quantidade_total||0).toFixed(2)} {item.unidade_medida}
 *
 * DEPOIS:
 *   {formatarQuantidade(item.quantidade_total)} {item.unidade_medida}
 */