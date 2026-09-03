import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import './tema-claro.css';
import { aplicarTema, lerTema } from './lib/tema';

// Antes do primeiro quadro, para a tela não piscar escura em quem usa o claro.
aplicarTema(lerTema());

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
