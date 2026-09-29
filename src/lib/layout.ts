/**
 * Qual casca o sistema usa: a clássica (lateral de 232px + topo) ou a nova
 * (trilho de áreas + coluna da área + topo com busca). Preferência de quem
 * usa, guardada no navegador, para a nova ser testada sem mudar nada para
 * o resto da equipe.
 */
export type Layout = 'classico' | 'novo';

const CHAVE = 'dp-layout';
const EVENTO = 'dp-layout-mudou';

export function lerLayout(): Layout {
  try {
    return localStorage.getItem(CHAVE) === 'novo' ? 'novo' : 'classico';
  } catch {
    return 'classico';
  }
}

export function definirLayout(layout: Layout) {
  try { localStorage.setItem(CHAVE, layout); } catch { /* sem storage: vale só a sessão */ }
  window.dispatchEvent(new Event(EVENTO));
}

export function alternarLayout(): Layout {
  const proximo: Layout = lerLayout() === 'novo' ? 'classico' : 'novo';
  definirLayout(proximo);
  return proximo;
}

/** Avisa quando o layout muda; devolve a função que cancela. */
export function aoMudarLayout(fn: (layout: Layout) => void): () => void {
  const h = () => fn(lerLayout());
  window.addEventListener(EVENTO, h);
  return () => window.removeEventListener(EVENTO, h);
}
