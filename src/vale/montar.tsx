import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ProvedorVale } from './carrinho';
import Home from './Home';
import Checkout from './Checkout';
import Comprovante from './Comprovante';
import { Consultar, NaoAchou, Regulamento } from './Paginas';
import './vale.css';

/**
 * Entrada da página pública do Vale Ditado (ditado.org/vale). Carregada por src/main.tsx só nessa rota,
 * sem o sistema, o login e o CSS do sistema: a página precisa abrir rápido no 4G.
 */
export function montar() {
  document.body.classList.add('vale');
  document.documentElement.lang = 'pt-BR';
  const meta = document.querySelector('meta[name="description"]');
  meta?.setAttribute('content', 'Vale Ditado: kits, cartelas de chopp e vales com desconto para usar no Ditado Brasa & Bar.');
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <ProvedorVale>
          <Routes>
            <Route path="/vale" element={<Home />} />
            <Route path="/vale/checkout" element={<Checkout />} />
            <Route path="/vale/c/:token" element={<Comprovante />} />
            <Route path="/vale/consultar" element={<Consultar />} />
            <Route path="/vale/regulamento" element={<Regulamento />} />
            <Route path="*" element={<NaoAchou />} />
          </Routes>
        </ProvedorVale>
      </BrowserRouter>
    </StrictMode>,
  );
}
