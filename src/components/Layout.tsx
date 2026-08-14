import { Link, Outlet, useLocation } from 'react-router-dom';
import { ChevronLeft, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Logo from './Logo';

const TITULOS: Record<string, string> = {
  '/viagens': 'Prestação de Contas Externa',
  '/cadastros': 'Cadastros',
  '/eventos': 'Eventos',
};

export default function Layout() {
  const { session, sair } = useAuth();
  const { pathname } = useLocation();
  const titulo =
    Object.entries(TITULOS).find(([rota]) => pathname.startsWith(rota))?.[1] ?? 'RR Bares';

  return (
    <div className="min-h-screen bg-night-950">
      <header className="sticky top-0 z-40 border-b border-night-800 bg-night-900/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-8">
          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="flex items-center gap-1.5 rounded-lg border border-night-700 px-2.5 py-1.5 text-sm text-zinc-400 transition hover:border-zinc-500 hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
              Módulos
            </Link>
            <div className="h-6 w-px bg-night-700" />
            <Logo size={34} showName={false} />
            <h1 className="text-sm font-semibold text-white sm:text-base">{titulo}</h1>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs text-zinc-500 sm:block">{session?.user.email}</span>
            <button onClick={sair} className="btn-ghost !px-2.5 !py-1.5" title="Sair">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
        <Outlet />
      </main>
    </div>
  );
}
