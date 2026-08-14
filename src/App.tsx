import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Login from './pages/Login';
import Home from './pages/Home';
import Layout from './components/Layout';
import ViagensList from './pages/viagens/ViagensList';
import ViagemDetalhe from './pages/viagens/ViagemDetalhe';
import Cadastros from './pages/cadastros/Cadastros';
import Eventos from './pages/eventos/Eventos';
import Placeholder from './pages/Placeholder';
import PrestacaoPublica from './pages/publico/PrestacaoPublica';

function Protegido({ children }: { children: React.ReactNode }) {
  const { session, carregando } = useAuth();
  if (carregando) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-night-950">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-night-700 border-t-gold-500" />
      </div>
    );
  }
  if (!session) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* link público do colaborador — sem login */}
          <Route path="/p/:token" element={<PrestacaoPublica />} />
          <Route
            path="/"
            element={
              <Protegido>
                <Home />
              </Protegido>
            }
          />
          <Route
            element={
              <Protegido>
                <Layout />
              </Protegido>
            }
          >
            <Route path="/viagens" element={<ViagensList />} />
            <Route path="/viagens/:id" element={<ViagemDetalhe />} />
            <Route path="/cadastros" element={<Cadastros />} />
            <Route path="/eventos" element={<Eventos />} />
            <Route path="/modulo/:slug" element={<Placeholder />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
