import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { MODULES, Module } from '../components/layout/SidebarModern';
import { useAuth } from '../contexts/AuthContext';

/**
 * O saguão: a entrada do sistema, um favo por módulo.
 *
 * Substitui a chegada direta no Dashboard com um sidebar de 14 módulos e ~60
 * subtelas todos abertos ao mesmo tempo. Aqui a pessoa escolhe UM módulo; lá
 * dentro, a lateral mostra só as telas daquele módulo (SidebarModern decide).
 *
 * A lista de módulos é a MESMA do sidebar (MODULES) — uma verdade só. Um
 * módulo novo cadastrado lá nasce aqui sem ninguém lembrar de duplicar, e a
 * permissão (temAcessoModulo) vale igual nos dois lugares: quem não tem o
 * módulo nem vê o favo.
 */

const GRUPOS: Array<{ id: Module['group']; rotulo: string; descricao: string }> = [
  { id: 'operacao', rotulo: 'Operação', descricao: 'O dia a dia da casa' },
  { id: 'gestao', rotulo: 'Gestão', descricao: 'Dinheiro, estoque e metas' },
  { id: 'sistema', rotulo: 'Sistema', descricao: 'Rotinas e ajustes' },
];

/** O hexágono. Recorte CSS puro — sem imagem, escala em qualquer tela. */
const HEXAGONO = 'polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0% 50%)';

const Saguao: React.FC = () => {
  const navigate = useNavigate();
  const { temAcessoModulo, usuario, logout } = useAuth();

  const visiveis = MODULES.filter((m) => temAcessoModulo(m.slug));
  const iniciais =
    usuario?.nome_completo
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() ?? 'U';

  const favo = (m: Module, i: number) => (
    <button
      key={m.name + m.path}
      onClick={() => navigate(m.path)}
      className="group relative flex flex-col items-center justify-center text-center transition-transform duration-200 hover:scale-[1.06] focus:outline-none"
      style={{
        width: 148,
        height: 128,
        clipPath: HEXAGONO,
        background: 'linear-gradient(160deg, rgba(125,31,44,0.34), rgba(125,31,44,0.10))',
        border: '1px solid rgba(212,175,55,0.15)',
        // O deslocamento alternado é o que faz favos, e não uma grade: cada
        // célula ímpar desce meio passo, encaixando na fileira como colmeia.
        transform: i % 2 === 1 ? 'translateY(28px)' : undefined,
      }}
    >
      <span
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{
          clipPath: HEXAGONO,
          background: 'linear-gradient(160deg, rgba(125,31,44,0.55), rgba(212,175,55,0.12))',
        }}
      />
      <m.icon size={22} className="relative mb-1.5" style={{ color: 'var(--gold)' }} />
      <span
        className="relative text-[12px] font-semibold leading-tight px-4"
        style={{ color: 'var(--text-primary)' }}
      >
        {m.name}
      </span>
      <span
        className="relative text-[9px] uppercase tracking-widest mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: 'var(--gold)' }}
      >
        Entrar
      </span>
    </button>
  );

  return (
    <div className="min-h-screen ambient-glow overflow-y-auto" style={{ background: 'var(--bg-dark)' }}>
      {/* Cabeçalho enxuto: o saguão é passagem, não morada. */}
      <header className="flex items-center justify-between px-6 py-4 max-w-5xl mx-auto">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 flex items-center justify-center"
            style={{
              clipPath: HEXAGONO,
              background: 'linear-gradient(135deg, var(--wine), var(--gold))',
            }}
          >
            <span className="text-white text-[10px] font-black tracking-tighter">DP</span>
          </div>
          <div>
            <p className="text-[15px] font-bold leading-none" style={{ color: 'var(--text-primary)' }}>
              Ditado Popular
            </p>
            <p
              className="text-[9px] mt-0.5 tracking-widest uppercase font-medium"
              style={{ color: 'var(--text-muted)' }}
            >
              Gestão
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
            style={{ background: 'linear-gradient(135deg, var(--wine), var(--gold))' }}
          >
            {iniciais}
          </div>
          <button
            onClick={logout}
            title="Sair"
            className="w-8 h-8 flex items-center justify-center rounded-lg transition-all hover:bg-white/[0.06]"
            style={{ color: 'var(--text-muted)' }}
          >
            <LogOut size={14} />
          </button>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 pb-16">
        {GRUPOS.map((grupo) => {
          const modulos = visiveis.filter((m) => m.group === grupo.id);
          if (modulos.length === 0) return null;
          return (
            <section key={grupo.id} className="mt-8">
              <div className="mb-4">
                <h2
                  className="text-[11px] font-bold uppercase tracking-[0.14em]"
                  style={{ color: 'var(--gold)' }}
                >
                  {grupo.rotulo}
                </h2>
                <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  {grupo.descricao}
                </p>
              </div>
              {/* pb compensa o meio passo dos favos ímpares. */}
              <div className="flex flex-wrap gap-x-2 gap-y-8 pb-8">
                {modulos.map(favo)}
              </div>
            </section>
          );
        })}
      </main>
    </div>
  );
};

export default Saguao;
