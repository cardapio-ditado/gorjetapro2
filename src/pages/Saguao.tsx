import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { AREAS, MODULES } from '../components/layout/SidebarModern';
import { useAuth } from '../contexts/AuthContext';

/**
 * O saguão: a entrada do sistema, um favo por ÁREA da casa.
 *
 * Cinco favos — Operação, Financeiro, Estoque, Recursos Humanos, Gestão — e
 * não um por módulo: catorze hexágonos é o sidebar gigante de novo, só que
 * deitado. A pessoa pensa "vou mexer no dinheiro", não "vou abrir o módulo
 * Contas a Pagar"; o favo é a área, e as telas da área aparecem na lateral
 * depois que ela entra.
 *
 * AREAS e MODULES vêm do sidebar — uma verdade só. Área sem nenhum módulo
 * que o usuário possa ver não vira favo: favo que não abre nada é vitrine de
 * porta trancada.
 */

/** O hexágono. Recorte CSS puro — sem imagem, escala em qualquer tela. */
const HEXAGONO = 'polygon(25% 3%, 75% 3%, 100% 50%, 75% 97%, 25% 97%, 0% 50%)';

const Saguao: React.FC = () => {
  const navigate = useNavigate();
  const { temAcessoModulo, usuario, logout } = useAuth();

  const permitidos = MODULES.filter((m) => temAcessoModulo(m.slug));

  // Cada favo leva ao primeiro módulo visível da área — a ordem em MODULES
  // já é a ordem de importância dentro dela.
  const areas = AREAS.map((area) => ({
    ...area,
    modulos: permitidos.filter((m) => m.group === area.id),
  })).filter((a) => a.modulos.length > 0);

  const iniciais =
    usuario?.nome_completo
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() ?? 'U';

  return (
    <div className="min-h-screen ambient-glow overflow-y-auto" style={{ background: 'var(--bg-dark)' }}>
      {/* Cabeçalho enxuto: o saguão é passagem, não morada. */}
      <header className="flex items-center justify-between px-6 py-5 max-w-4xl mx-auto">
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

      <main className="max-w-4xl mx-auto px-6 pb-20 pt-6">
        <p
          className="text-center text-[11px] uppercase tracking-[0.18em] font-semibold mb-10"
          style={{ color: 'var(--text-muted)' }}
        >
          Onde você vai trabalhar agora?
        </p>

        {/* pb compensa o meio passo dos favos ímpares. */}
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-12 pb-10">
          {areas.map((area, i) => (
            <button
              key={area.id}
              onClick={() => navigate(area.modulos[0].path)}
              className="group relative flex flex-col items-center justify-center text-center transition-transform duration-200 hover:scale-[1.05] focus:outline-none"
              style={{
                width: 208,
                height: 182,
                clipPath: HEXAGONO,
                background: 'linear-gradient(160deg, rgba(125,31,44,0.36), rgba(125,31,44,0.10))',
                border: '1px solid rgba(212,175,55,0.15)',
                // O deslocamento alternado é o que faz colmeia, e não grade:
                // cada favo ímpar desce meio passo e encaixa na fileira.
                transform: i % 2 === 1 ? 'translateY(42px)' : undefined,
              }}
            >
              <span
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                style={{
                  clipPath: HEXAGONO,
                  background: 'linear-gradient(160deg, rgba(125,31,44,0.6), rgba(212,175,55,0.14))',
                }}
              />
              <area.icone size={26} className="relative mb-2" style={{ color: 'var(--gold)' }} />
              <span
                className="relative text-[14px] font-bold leading-tight px-6"
                style={{ color: 'var(--text-primary)' }}
              >
                {area.nome}
              </span>
              <span
                className="relative text-[10px] leading-snug px-8 mt-1.5"
                style={{ color: 'var(--text-secondary)' }}
              >
                {area.descricao}
              </span>
              <span
                className="relative text-[9px] uppercase tracking-widest mt-2 opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ color: 'var(--gold)' }}
              >
                Entrar
              </span>
            </button>
          ))}
        </div>
      </main>
    </div>
  );
};

export default Saguao;
