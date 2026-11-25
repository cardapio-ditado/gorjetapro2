import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { aplicarTema, lerTema } from './lib/tema';

// A página pública do Vale Ditado (ditado.org/vale) carrega só o que ela usa: nem o sistema, nem o
// login, nem o CSS do sistema. Abre rápido no 4G. /vales (resgate e admin) continua no sistema.
if (/^\/vale(\/|$)/.test(window.location.pathname)) {
  import('./vale/montar').then((m) => m.montar());
} else {
  // Antes do primeiro quadro, para a tela não piscar escura em quem usa o claro.
  aplicarTema(lerTema());
  Promise.all([
    import('./App.tsx'),
    import('./index.css'),
    import('./pele.css'),
    import('./tema-claro.css'),
  ]).then(([{ default: App }]) => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  });
}
