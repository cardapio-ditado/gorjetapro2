import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { AREAS, type Area, type Module } from './SidebarModern';

interface Props {
  modulos: Module[];
  areaAtual: Area | null;
  onNavegar?: () => void;
  className?: string;
}

/**
 * A coluna da área: as telas da área aberta, em grupos, 232px.
 * Um módulo com sub-telas vira um grupo com cabeçalho; os separadores
 * "─ Compras" da lista antiga viram cabeçalhos também.
 */
const ColunaArea: React.FC<Props> = ({ modulos, areaAtual, onNavegar, className = '' }) => {
  const location = useLocation();
  const atual = location.pathname + location.search;

  const ativo = (path: string) => atual === path || (location.pathname === path && !path.includes('?'));

  const area = AREAS.find(a => a.id === areaAtual) ?? null;
  const daArea = area ? modulos.filter(m => m.group === area.id) : modulos;

  const estiloLink = (on: boolean): React.CSSProperties => ({
    color: on ? 'var(--text-primary)' : 'var(--text-secondary)',
    background: on ? 'rgba(255,255,255,0.07)' : 'transparent',
    fontWeight: on ? 600 : 500,
  });

  const Cabecalho: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="t-caps px-3 pt-4 pb-1.5" style={{ color: 'var(--text-secondary)', fontSize: 11, letterSpacing: '0.08em', margin: 0 }}>
      {children}
    </p>
  );

  const LinkTela: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => {
    const on = ativo(to);
    return (
      <Link
        to={to}
        onClick={onNavegar}
        aria-current={on ? 'page' : undefined}
        className="flex items-center h-9 px-3 rounded-lg text-sm transition-colors hover:bg-white/[0.05] focus-ring"
        style={estiloLink(on)}
      >
        <span className="truncate">{children}</span>
      </Link>
    );
  };

  return (
    <nav
      aria-label={area ? area.nome : 'Telas'}
      className={`flex-col w-[232px] flex-shrink-0 overflow-y-auto scrollbar-hide ${className}`.trim()}
      style={{ background: 'var(--bg-dark)', borderRight: '1px solid var(--border)' }}
    >
      <div className="px-4 pt-5 pb-2">
        <p className="t-section" style={{ color: 'var(--text-primary)', fontSize: 20, fontWeight: 600, margin: 0 }}>
          {area ? area.nome : 'Ditado Popular'}
        </p>
        {area && <p className="t-caption" style={{ margin: '2px 0 0' }}>{area.descricao}</p>}
      </div>

      <div className="px-2 pb-6 flex flex-col gap-0.5">
        {daArea.map(m => {
          if (!m.subModules?.length) {
            return <LinkTela key={m.path} to={m.path}>{m.name}</LinkTela>;
          }
          const temSeparadores = m.subModules.some(s => s.name.startsWith('─'));
          return (
            <React.Fragment key={m.path}>
              <Cabecalho>{m.name}</Cabecalho>
              {m.subModules.map(s => {
                if (s.name.startsWith('─')) {
                  return <Cabecalho key={`sep-${s.name}`}>{s.name.replace(/^─\s*/, '')}</Cabecalho>;
                }
                return <LinkTela key={s.path} to={s.path}>{s.name.replace(/^★\s*/, '')}</LinkTela>;
              })}
              {!temSeparadores && <div className="h-2" aria-hidden="true" />}
            </React.Fragment>
          );
        })}
      </div>
    </nav>
  );
};

export default ColunaArea;
