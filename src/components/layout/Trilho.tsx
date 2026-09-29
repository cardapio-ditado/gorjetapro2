import React from 'react';
import { Link } from 'react-router-dom';
import { Settings } from 'lucide-react';
import { AREAS, type Area, type Module } from './SidebarModern';

interface Props {
  modulos: Module[];
  areaAtual: Area | null;
  onEscolherArea: (area: Area) => void;
  podeConfigurar: boolean;
  iniciais: string;
  nome: string;
  className?: string;
}

/**
 * O trilho: as cinco áreas da casa, sempre à vista, 72px de largura.
 * Substitui o saguão como jeito de trocar de área sem sair da tela.
 */
const Trilho: React.FC<Props> = ({ modulos, areaAtual, onEscolherArea, podeConfigurar, iniciais, nome, className = '' }) => {
  const areasVisiveis = AREAS.filter(a => modulos.some(m => m.group === a.id));

  return (
    <nav
      aria-label="Áreas"
      className={`flex-col items-center gap-2 w-[72px] flex-shrink-0 py-4 ${className}`.trim()}
      style={{ background: 'var(--bg-base)', borderRight: '1px solid var(--border)' }}
    >
      <Link
        to="/"
        aria-label="Saguão"
        title="Saguão"
        className="w-10 h-10 rounded-xl flex items-center justify-center mb-3 flex-shrink-0 font-display font-bold text-xl text-white focus-ring"
        style={{ background: 'var(--wine)' }}
      >
        D
      </Link>

      {areasVisiveis.map(a => {
        const ativa = areaAtual === a.id;
        const Icone = a.icone;
        return (
          <button
            key={a.id}
            type="button"
            onClick={() => onEscolherArea(a.id)}
            aria-label={a.nome}
            aria-current={ativa ? 'page' : undefined}
            title={a.nome}
            className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors focus-ring"
            style={{
              background: ativa ? 'rgba(212,175,55,0.14)' : 'transparent',
              color: ativa ? 'var(--gold)' : 'var(--text-secondary)',
            }}
          >
            <Icone size={22} strokeWidth={1.8} />
          </button>
        );
      })}

      <div className="flex-grow" />

      {podeConfigurar && (
        <Link
          to="/settings"
          aria-label="Configurações"
          title="Configurações"
          className="w-11 h-11 rounded-xl flex items-center justify-center flex-shrink-0 transition-colors focus-ring"
          style={{ color: 'var(--text-secondary)' }}
        >
          <Settings size={22} strokeWidth={1.8} />
        </Link>
      )}
      <div
        aria-hidden="true"
        title={nome}
        className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', color: 'var(--text-primary)' }}
      >
        {iniciais}
      </div>
    </nav>
  );
};

export default Trilho;
