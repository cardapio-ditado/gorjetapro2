import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes, useLocation } from 'react-router-dom';
import { ProvedorVale } from './carrinho';
import { guardarFbclid, iniciarPixel, pageView } from './pixel';
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
  // barra do navegador na cor do fundo da página (off-white do manual da marca)
  let cor = document.querySelector('meta[name="theme-color"]');
  if (!cor) { cor = document.createElement('meta'); cor.setAttribute('name', 'theme-color'); document.head.appendChild(cor); }
  cor.setAttribute('content', '#f5efe6');
  // fonte dos títulos antes do CSS pedir (evita o título piscar em outra fonte)
  const fonte = document.createElement('link');
  Object.assign(fonte, { rel: 'preload', as: 'font', type: 'font/woff2', href: '/fonts/vale/charis-sil-700-latin.woff2', crossOrigin: 'anonymous' });
  document.head.appendChild(fonte);
  guardarFbclid();
  iniciarPixel();
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <BrowserRouter>
        <RastreioRotas />
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

/** PageView do Pixel da Meta a cada troca de rota (o comprovante fica de fora, ver pixel.ts). */
function RastreioRotas() {
  const { pathname } = useLocation();
  useEffect(() => { pageView(pathname); }, [pathname]);
  return null;
}
