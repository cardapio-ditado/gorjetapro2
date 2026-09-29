import React, { useEffect, useRef, useState } from 'react';
import { ChevronDown, LayoutTemplate, LogOut, Menu, Moon, Search, Sun } from 'lucide-react';
import type { Usuario } from '../../contexts/AuthContext';
import { alternarTema, lerTema, type Tema } from '../../lib/tema';
import { definirLayout } from '../../lib/layout';

interface Props {
  caminho: string[];
  usuario: Usuario | null;
  onLogout: () => void;
  onAbrirMenu: () => void;
  onAbrirBusca: () => void;
}

/** O topo: caminho à esquerda, busca no meio, pessoa à direita. 56px. */
const Topo: React.FC<Props> = ({ caminho, usuario, onLogout, onAbrirMenu, onAbrirBusca }) => {
  const [menuAberto, setMenuAberto] = useState(false);
  const [tema, setTema] = useState<Tema>(() => lerTema());
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuAberto(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const iniciais = usuario?.nome_completo?.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'U';
  const primeiroNome = usuario?.nome_completo?.split(' ')[0] || 'Usuário';
  const ehMac = typeof navigator !== 'undefined' && /Mac/i.test(navigator.platform);

  return (
    <header className="h-14 flex items-center gap-3 px-4 lg:px-7 flex-shrink-0" style={{ background: 'var(--bg-base)', borderBottom: '1px solid var(--border)' }}>
      <button type="button" onClick={onAbrirMenu} className="lg:hidden btn-icon" aria-label="Abrir menu">
        <Menu size={18} />
      </button>

      <nav aria-label="Caminho" className="hidden sm:flex items-center gap-2 min-w-0 t-label" style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>
        {caminho.map((parte, i) => (
          <React.Fragment key={`${parte}-${i}`}>
            {i > 0 && <span aria-hidden="true" style={{ opacity: 0.5 }}>/</span>}
            <span className="truncate" style={i === caminho.length - 1 ? { color: 'var(--text-primary)' } : undefined}>{parte}</span>
          </React.Fragment>
        ))}
      </nav>

      <div className="flex-grow" />

      <button
        type="button"
        onClick={onAbrirBusca}
        className="flex items-center gap-2.5 h-9 px-3 rounded-lg w-11 sm:w-72 lg:w-96 focus-ring"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border-strong)', color: 'var(--text-secondary)' }}
        aria-label="Buscar no sistema"
      >
        <Search size={16} aria-hidden="true" />
        <span className="hidden sm:inline flex-1 text-left t-body truncate">Ir para qualquer tela ou item</span>
        <kbd className="hidden sm:inline t-caption px-1.5 py-0.5 rounded" style={{ border: '1px solid var(--border-strong)' }}>{ehMac ? '⌘' : 'Ctrl'} K</kbd>
      </button>

      <div className="relative flex-shrink-0" ref={menuRef}>
        <button
          type="button"
          onClick={() => setMenuAberto(v => !v)}
          aria-haspopup="menu"
          aria-expanded={menuAberto}
          className="flex items-center gap-2 pl-1 pr-2 h-9 rounded-lg hover:bg-white/[0.05] focus-ring"
        >
          <span className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-semibold" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}>
            {iniciais}
          </span>
          <span className="hidden md:inline t-label" style={{ color: 'var(--text-primary)' }}>{primeiroNome}</span>
          <ChevronDown size={14} style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />
        </button>

        {menuAberto && (
          <div role="menu" className="absolute right-0 mt-2 w-64 rounded-xl overflow-hidden z-50 p-2" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', boxShadow: 'var(--shadow-overlay)' }}>
            <div className="px-3 py-2 mb-1" style={{ borderBottom: '1px solid var(--border)' }}>
              <p className="t-label truncate" style={{ color: 'var(--text-primary)', margin: 0 }}>{usuario?.nome_completo || 'Usuário'}</p>
              <p className="t-caption truncate" style={{ margin: '2px 0 0' }}>{usuario?.email || usuario?.cargo || usuario?.nivel || ''}</p>
            </div>
            <button type="button" role="menuitem" onClick={() => setTema(alternarTema())} className="w-full flex items-center gap-3 px-3 h-10 rounded-lg t-body hover:bg-white/[0.05]" style={{ color: 'var(--text-primary)' }}>
              {tema === 'claro' ? <Moon size={16} aria-hidden="true" /> : <Sun size={16} aria-hidden="true" />}
              {tema === 'claro' ? 'Usar tema escuro' : 'Usar tema claro'}
            </button>
            <button type="button" role="menuitem" onClick={() => definirLayout('classico')} className="w-full flex items-center gap-3 px-3 h-10 rounded-lg t-body hover:bg-white/[0.05]" style={{ color: 'var(--text-primary)' }}>
              <LayoutTemplate size={16} aria-hidden="true" />
              Voltar ao layout clássico
            </button>
            <div className="my-1" style={{ height: 1, background: 'var(--border)' }} />
            <button type="button" role="menuitem" onClick={onLogout} className="w-full flex items-center gap-3 px-3 h-10 rounded-lg t-body hover:bg-red-500/10" style={{ color: '#fca5a5' }}>
              <LogOut size={16} aria-hidden="true" />
              Sair do sistema
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Topo;
