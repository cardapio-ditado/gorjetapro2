import React, { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { X } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { AREAS, modulosDaCasa, type Area, type Module } from './SidebarModern';
import Trilho from './Trilho';
import ColunaArea from './ColunaArea';
import Topo from './Topo';
import Paleta from './Paleta';

interface Props {
  children: React.ReactNode;
}

function caminhoBase(path: string): string {
  return path.split('?')[0];
}

/**
 * A casca nova: trilho de áreas (72px), coluna da área (232px), topo com
 * busca (56px) e o conteúdo. No celular, trilho e coluna viram uma gaveta.
 * Liga-se por pessoa (menu do usuário › layout), sem mexer em nenhuma tela.
 */
const AppShell: React.FC<Props> = ({ children }) => {
  const { usuario, logout, isAdmin, temAcessoModulo } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [gavetaAberta, setGavetaAberta] = useState(false);
  const [buscaAberta, setBuscaAberta] = useState(false);

  const modulos = useMemo<Module[]>(
    () => modulosDaCasa(isAdmin()).filter(m => temAcessoModulo(m.slug)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usuario?.id, usuario?.nivel],
  );

  const atual = location.pathname + location.search;
  const moduloAtual = useMemo(() => {
    const exato = modulos.find(m => m.subModules?.some(s => s.path === atual) || m.path === atual);
    if (exato) return exato;
    return modulos.find(m => caminhoBase(m.path) === location.pathname || m.subModules?.some(s => caminhoBase(s.path) === location.pathname)) ?? null;
  }, [modulos, atual, location.pathname]);

  const areaAtual: Area | null = moduloAtual?.group ?? null;
  const area = AREAS.find(a => a.id === areaAtual) ?? null;

  const subAtual = moduloAtual?.subModules?.find(s => s.path === atual) ?? moduloAtual?.subModules?.find(s => caminhoBase(s.path) === location.pathname && !s.path.includes('?'));
  const caminho = [area?.nome, moduloAtual?.name, subAtual && subAtual.name !== moduloAtual?.name ? subAtual.name.replace(/^[★─]\s*/, '') : undefined].filter((x): x is string => !!x);

  const escolherArea = (id: Area) => {
    const primeiro = modulos.find(m => m.group === id);
    if (primeiro) navigate(primeiro.subModules?.[0]?.path ?? primeiro.path);
    setGavetaAberta(false);
  };

  useEffect(() => { setGavetaAberta(false); }, [atual]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setBuscaAberta(true); }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const iniciais = usuario?.nome_completo?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';

  return (
    <div className="app-shell flex h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <Trilho
        className="hidden lg:flex"
        modulos={modulos}
        areaAtual={areaAtual}
        onEscolherArea={escolherArea}
        podeConfigurar={temAcessoModulo('configuracoes')}
        iniciais={iniciais}
        nome={usuario?.nome_completo || ''}
      />
      <ColunaArea className="hidden lg:flex" modulos={modulos} areaAtual={areaAtual} />

      {/* Gaveta do celular: trilho e coluna juntos */}
      {gavetaAberta && (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <button type="button" aria-label="Fechar menu" onClick={() => setGavetaAberta(false)} className="absolute inset-0 w-full h-full cursor-default" style={{ background: 'rgba(0,0,0,0.55)' }} />
          <div className="relative flex h-full" style={{ boxShadow: 'var(--shadow-overlay)' }}>
            <Trilho
              className="flex"
              modulos={modulos}
              areaAtual={areaAtual}
              onEscolherArea={escolherArea}
              podeConfigurar={temAcessoModulo('configuracoes')}
              iniciais={iniciais}
              nome={usuario?.nome_completo || ''}
            />
            <ColunaArea className="flex" modulos={modulos} areaAtual={areaAtual} onNavegar={() => setGavetaAberta(false)} />
            <button type="button" onClick={() => setGavetaAberta(false)} className="absolute top-3 right-3 btn-icon" aria-label="Fechar menu">
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
        <Topo
          caminho={caminho.length ? caminho : ['Ditado Popular']}
          usuario={usuario}
          onLogout={logout}
          onAbrirMenu={() => setGavetaAberta(true)}
          onAbrirBusca={() => setBuscaAberta(true)}
        />
        {/* Só opacidade na troca de tela: transform em ancestral sequestra os modais fixed (ver src/index.css). */}
        <main className="flex-1 overflow-y-auto">
          <div key={location.key} className="p-5 lg:p-7 min-h-full animate-fade-in">
            {children}
          </div>
        </main>
      </div>

      <Paleta aberta={buscaAberta} onFechar={() => setBuscaAberta(false)} />
    </div>
  );
};

export default AppShell;
