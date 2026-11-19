/**
 * Tema do sistema: claro (padrão, na identidade da marca Ditado Brasa & Bar) ou escuro.
 * Quem já escolheu o escuro continua no escuro; quem nunca escolheu entra no da marca.
 *
 * O tema é uma preferência de quem usa, guardada no navegador. Vale só para o
 * shell dos módulos (.app-shell): Login e Saguão são arte sobre foto e não
 * mudam. A pele clara vive em src/tema-claro.css, gerada a partir dos
 * utilitários em uso (scripts/gerar-tema-claro.mjs).
 */
export type Tema = 'escuro' | 'claro';

const CHAVE = 'dp-tema';

export function lerTema(): Tema {
  try {
    return localStorage.getItem(CHAVE) === 'escuro' ? 'escuro' : 'claro';
  } catch {
    return 'claro';
  }
}

export function aplicarTema(tema: Tema) {
  const raiz = document.documentElement;
  if (tema === 'claro') raiz.setAttribute('data-theme', 'light');
  else raiz.removeAttribute('data-theme');
  try { localStorage.setItem(CHAVE, tema); } catch { /* navegador sem storage: vale só a sessão */ }
}

export function alternarTema(): Tema {
  const proximo: Tema = lerTema() === 'claro' ? 'escuro' : 'claro';
  aplicarTema(proximo);
  return proximo;
}
