export const SEM_CATEGORIA = 'Sem categoria';

/**
 * Agrupa itens por `categoria` (null/vazio → "Sem categoria", sempre por último).
 * Categorias em ordem alfabética (pt-BR); itens ordenados por `nome` dentro da categoria.
 */
export function agruparPorCategoria<T extends { categoria: string | null; nome: string }>(
  itens: T[],
): Array<[string, T[]]> {
  const grupos = new Map<string, T[]>();
  for (const it of itens) {
    const cat = (it.categoria ?? '').trim() || SEM_CATEGORIA;
    const lista = grupos.get(cat);
    if (lista) lista.push(it); else grupos.set(cat, [it]);
  }
  return Array.from(grupos.entries())
    .sort(([a], [b]) => {
      if (a === SEM_CATEGORIA) return 1;
      if (b === SEM_CATEGORIA) return -1;
      return a.localeCompare(b, 'pt-BR');
    })
    .map(([cat, lista]) => [cat, [...lista].sort((x, y) => x.nome.localeCompare(y.nome, 'pt-BR'))]);
}
