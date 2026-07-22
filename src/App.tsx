import React, { lazy, Suspense, useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import SidebarModern from './components/layout/SidebarModern';
import ProtectedRoute from './components/layout/ProtectedRoute';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import Topbar from './components/layout/Topbar';
import Login from './pages/Login';
import AuthRecoveryGate from './components/AuthRecoveryGate';
import { testConnection } from './lib/supabase';

const Dashboard           = lazy(() => import('./pages/Dashboard'));
const Finance             = lazy(() => import('./pages/Finance'));
const AdvancedInventory   = lazy(() => import('./pages/AdvancedInventory'));
const Staff               = lazy(() => import('./pages/Staff'));
const Musicians           = lazy(() => import('./pages/Musicians'));
const Events              = lazy(() => import('./pages/Events'));
const Settings            = lazy(() => import('./pages/Settings'));
const MetasTarefas        = lazy(() => import('./pages/MetasTarefas'));
const Ocorrencias         = lazy(() => import('./pages/Ocorrencias'));
const ManualUsuario       = lazy(() => import('./pages/ManualUsuario'));
const Recruitment         = lazy(() => import('./pages/Recruitment'));
const PreEntrevista       = lazy(() => import('./pages/PreEntrevista'));
const SolicitacaoPublica  = lazy(() => import('./pages/SolicitacaoPublica'));
const RequisicaoPublica   = lazy(() => import('./pages/RequisicaoPublica'));
const CartazRequisicao    = lazy(() => import('./components/inventory/CartazRequisicao'));
const GestaoEstrategica   = lazy(() => import('./pages/GestaoEstrategica'));
const VisaoEstrategica    = lazy(() => import('./pages/VisaoEstrategica'));
const Entradas            = lazy(() => import('./pages/Entradas'));
const DashboardFinanceiro = lazy(() => import('./pages/DashboardFinanceiro'));
const ZigVendasSync       = lazy(() => import('./pages/ZigVendasSync'));
const ZigRecebimentos     = lazy(() => import('./pages/ZigRecebimentos'));
const ListaCompras        = lazy(() => import('./pages/ListaCompras'));
const ListaComprasPublica = lazy(() => import('./pages/ListaComprasPublica'));
const MapaMesasPublico    = lazy(() => import('./pages/MapaMesasPublico'));
const ContagemMobile      = lazy(() => import('./components/inventory/contagem/ContagemMobile'));
const DiscPublico         = lazy(() => import('./pages/DiscPublico'));
const DRESimplificado     = lazy(() => import('./pages/DRESimplificado'));
const ControleDeville     = lazy(() => import('./pages/ControleDeville'));
const AgendaDiaria        = lazy(() => import('./pages/AgendaDiaria'));
const FidelidadeModule    = lazy(() => import('./pages/FidelidadeModule'));
const RedefinirSenha      = lazy(() => import('./pages/RedefinirSenha'));
const PortalGerente       = lazy(() => import('./pages/PortalGerente'));

const PageLoader = () => (
  <div className="flex flex-col items-center justify-center h-full min-h-[300px] gap-4">
    <div className="relative w-10 h-10">
      <div className="absolute inset-0 rounded-full border-2 border-white/8" />
      <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-[#D4AF37] animate-spin" />
    </div>
    <p className="text-xs font-sans font-medium" style={{ color: 'var(--text-muted)' }}>Carregando...</p>
  </div>
);

function AppContent() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { usuario, logout } = useAuth();
  const location = useLocation();

  useEffect(() => { testConnection(); }, []);

  const rotasPublicas = ['/pre-entrevista', '/solicitacao', '/requisicao-estoque', '/cartaz-requisicao', '/contagem-mobile', '/disc', '/compras-publica', '/reservar-mesa', '/mapademesas', '/login', '/redefinir-senha'];
  const isRotaPublica = rotasPublicas.some(r => location.pathname.startsWith(r));

  if (location.pathname === '/login') return <Login />;
  if (location.pathname === '/redefinir-senha') return <RedefinirSenha />;

  if (!usuario && !isRotaPublica) return <Login />;

  // Conta criada com senha provisória (ver GerenciamentoUsuarios) — obrigada
  // a trocar antes de usar o resto do sistema. Mesma tela/mecanismo do link
  // de convite/recuperação, só que disparado por este flag em vez do hash.
  if (usuario?.precisa_trocar_senha) return <RedefinirSenha />;

  if (isRotaPublica) {
    return (
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route path="/pre-entrevista"         element={<PreEntrevista />} />
          <Route path="/solicitacao"            element={<SolicitacaoPublica />} />
          <Route path="/requisicao-estoque"     element={<RequisicaoPublica />} />
          <Route path="/cartaz-requisicao"      element={<CartazRequisicao />} />
          <Route path="/contagem-mobile/:token"   element={<ContagemMobile />} />
          <Route path="/disc"                     element={<DiscPublico />} />
          <Route path="/compras-publica/:id"      element={<ListaComprasPublica />} />
          <Route path="/reservar-mesa"            element={<MapaMesasPublico />} />
          <Route path="/mapademesas"              element={<MapaMesasPublico />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden ambient-glow">

      {/* Overlay mobile */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)' }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── SIDEBAR ── */}
      <aside className={`
        fixed inset-y-0 left-0 z-50 flex flex-col w-[232px]
        transition-transform duration-300 ease-in-out
        lg:translate-x-0 lg:static lg:inset-0
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        glass-sidebar
      `}>
        <SidebarModern onNavigate={() => setSidebarOpen(false)} onCloseMobile={() => setSidebarOpen(false)} />
      </aside>

      {/* ── MAIN ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Topbar toggleSidebar={() => setSidebarOpen(v => !v)} user={usuario} onLogout={logout} />

        <main className="flex-1 overflow-y-auto">
          <div key={location.key} className="p-5 lg:p-7 min-h-full page-transition">
            <Suspense fallback={<PageLoader />}>
              <Routes>
                <Route path="/"                    element={<ProtectedRoute moduloSlug="dashboard">     <Dashboard />           </ProtectedRoute>} />
                <Route path="/dashboard"           element={<ProtectedRoute moduloSlug="dashboard">     <Dashboard />           </ProtectedRoute>} />
                <Route path="/portal-gerente"      element={<ProtectedRoute moduloSlug="dashboard">     <PortalGerente />       </ProtectedRoute>} />
                <Route path="/agenda-diaria"       element={<ProtectedRoute moduloSlug="dashboard">     <AgendaDiaria />        </ProtectedRoute>} />
                <Route path="/finance"             element={<ProtectedRoute moduloSlug="financeiro">    <Finance />             </ProtectedRoute>} />
                <Route path="/financeiro"          element={<ProtectedRoute moduloSlug="financeiro">    <DashboardFinanceiro /> </ProtectedRoute>} />
                <Route path="/advanced-inventory"  element={<ProtectedRoute moduloSlug="estoque">       <AdvancedInventory />   </ProtectedRoute>} />
                <Route path="/staff"               element={<ProtectedRoute moduloSlug="rh">            <Staff />               </ProtectedRoute>} />
                <Route path="/recruitment"         element={<ProtectedRoute moduloSlug="rh">            <Recruitment />         </ProtectedRoute>} />
                <Route path="/musicians"           element={<ProtectedRoute moduloSlug="musicos">       <Musicians />           </ProtectedRoute>} />
                <Route path="/events"              element={<ProtectedRoute moduloSlug="eventos">       <Events />              </ProtectedRoute>} />
                <Route path="/metas-tarefas"       element={<ProtectedRoute moduloSlug="solicitacoes">  <MetasTarefas />        </ProtectedRoute>} />
                <Route path="/ocorrencias"         element={<ProtectedRoute moduloSlug="ocorrencias">   <Ocorrencias />         </ProtectedRoute>} />
                <Route path="/gestao-estrategica"  element={<ProtectedRoute moduloSlug="financeiro">    <GestaoEstrategica />   </ProtectedRoute>} />
                <Route path="/visao-estrategica"   element={<ProtectedRoute moduloSlug="financeiro">    <VisaoEstrategica />    </ProtectedRoute>} />
                <Route path="/entradas"            element={<ProtectedRoute moduloSlug="financeiro">    <Entradas />            </ProtectedRoute>} />
                <Route path="/zig-vendas"          element={<ProtectedRoute moduloSlug="estoque">       <ZigVendasSync />       </ProtectedRoute>} />
                <Route path="/zig-recebimentos"    element={<ProtectedRoute moduloSlug="financeiro">    <ZigRecebimentos />     </ProtectedRoute>} />
                <Route path="/lista-compras"       element={<ProtectedRoute moduloSlug="estoque">       <ListaCompras />        </ProtectedRoute>} />
                <Route path="/dre-simplificado"    element={<ProtectedRoute moduloSlug="financeiro">    <DRESimplificado />     </ProtectedRoute>} />
                <Route path="/controle-deville"    element={<ProtectedRoute moduloSlug="estoque">       <ControleDeville />     </ProtectedRoute>} />
                <Route path="/fidelidade"          element={<ProtectedRoute moduloSlug="dashboard">     <FidelidadeModule />    </ProtectedRoute>} />
                <Route path="/manual"              element={<ManualUsuario />} />
                <Route path="/settings"            element={<ProtectedRoute moduloSlug="configuracoes"> <Settings />            </ProtectedRoute>} />
                <Route path="*" element={
                  <div className="flex flex-col items-center justify-center min-h-[60vh] text-center">
                    <p className="text-8xl font-black leading-none mb-4"
                      style={{ background: 'linear-gradient(135deg,var(--wine),var(--gold))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                      404
                    </p>
                    <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Página não encontrada</h3>
                    <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>A URL acessada não existe neste sistema.</p>
                  </div>
                } />
              </Routes>
            </Suspense>
          </div>
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <AuthRecoveryGate />
        <AppContent />
      </Router>
    </AuthProvider>
  );
}

export default App;
