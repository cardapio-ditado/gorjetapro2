import { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import PrestacaoPublica from './pages/publico/PrestacaoPublica';

// Sistema interno carregado sob demanda — visitantes do link público do
// colaborador (/p/:token) nunca baixam esse pacote (login, cadastros,
// financeiro, cliente do Supabase etc.), só a tela leve de lançamento.
const AppInterno = lazy(() => import('./AppInterno'));

function CarregandoInterno() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-night-950">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-night-700 border-t-gold-500" />
    </div>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* link público do colaborador — sem login, bundle independente e leve */}
        <Route path="/p/:token" element={<PrestacaoPublica />} />
        <Route
          path="*"
          element={
            <Suspense fallback={<CarregandoInterno />}>
              <AppInterno />
            </Suspense>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
