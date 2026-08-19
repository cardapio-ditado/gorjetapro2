import React from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut, ChevronRight } from 'lucide-react';
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

/** Hexágono "ponta pra cima" — lados retos na esquerda/direita, ponta em
 *  cima e embaixo. É essa orientação que permite empilhar em fileiras que
 *  se encaixam de verdade (a fileira de baixo entra no vão da de cima),
 *  em vez de depender de deslocar item a item dentro de uma flexbox que
 *  quebra linha sozinha.
 */
const HEXAGONO = 'polygon(50% 0%, 97% 25%, 97% 75%, 50% 100%, 3% 75%, 3% 25%)';
const HEX_W = 186;
const HEX_H = 200;
const HEX_GAP = 14;
const HEX_BORDA = 2;

const Hexagono: React.FC<{
  area: { id: string; nome: string; descricao: string; icone: React.ElementType };
  onClick: () => void;
}> = ({ area, onClick }) => (
  <button
    onClick={onClick}
    className="group relative shrink-0 transition-transform duration-200 hover:scale-[1.06] focus:outline-none"
    style={{ width: HEX_W, height: HEX_H }}
  >
    {/* Camada 1: a borda dourada — um hexágono levemente maior, cheio de cor. */}
    <div className="absolute inset-0" style={{ clipPath: HEXAGONO, background: 'linear-gradient(160deg, var(--gold), rgba(212,175,55,0.25))' }} />
    {/* Camada 2: o preenchimento — hexágono recuado pela espessura da borda,
        por cima da camada 1. As duas usam o MESMO clip-path percentual, então
        a borda sai com espessura uniforme nos seis lados, ponta inclusa. */}
    <div
      className="absolute flex flex-col items-center justify-center text-center px-6"
      style={{
        inset: HEX_BORDA,
        clipPath: HEXAGONO,
        background: 'linear-gradient(160deg, rgba(125,31,44,0.55) 0%, rgba(61,14,22,0.92) 55%, rgba(12,16,24,0.96) 100%)',
      }}
    >
      <span
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
        style={{ background: 'linear-gradient(160deg, rgba(125,31,44,0.65), rgba(212,175,55,0.16))' }}
      />
      <area.icone size={24} className="relative mb-2.5" style={{ color: 'var(--gold)' }} strokeWidth={1.75} />
      <span className="relative text-[14px] font-display font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
        {area.nome}
      </span>
      <span className="relative text-[10.5px] leading-snug mt-1.5" style={{ color: 'var(--text-secondary)' }}>
        {area.descricao}
      </span>
      <span
        className="relative text-[9px] uppercase tracking-widest mt-2.5 opacity-0 group-hover:opacity-100 transition-opacity"
        style={{ color: 'var(--gold)' }}
      >
        Entrar
      </span>
    </div>
  </button>
);

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

  // Duas fileiras fixas — 3 em cima, o resto embaixo deslocado meio passo —
  // é o arranjo de colmeia pra até 5 favos (o total de áreas que existem).
  // Sem depender de quebra de linha automática pra decidir o deslocamento,
  // que era a causa do desalinhamento. As fileiras NÃO se encaixam uma na
  // outra: favo cobrindo favo come a borda dourada do de cima.
  const fileiras = areas.length > 3 ? [areas.slice(0, 3), areas.slice(3)] : [areas];

  const iniciais =
    usuario?.nome_completo
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase() ?? 'U';

  return (
    <div className="min-h-screen relative overflow-y-auto">
      {/* A imagem inteira, sem corte de painel — é o pano de fundo da tela toda. */}
      <img
        src="/images/login-hero-ditado-bar.jpg"
        alt="Ditado Bar — Sistema de Gestão Inteligente"
        className="fixed inset-0 w-full h-full object-cover"
        style={{ objectPosition: '22% center' }}
      />
      {/* Sombra só no canto onde os favos pousam — o resto da foto fica vívido. */}
      <div
        className="fixed inset-0"
        style={{ background: 'radial-gradient(900px 800px at 100% 62%, rgba(6,4,8,0.8), transparent 62%), linear-gradient(200deg, transparent 35%, rgba(6,4,8,0.42) 100%)' }}
      />
      {/* No celular a lista ocupa a largura toda e a arte passaria por trás do
          texto — aqui ela vira fundo mesmo, bem apagada. */}
      <div className="fixed inset-0 sm:hidden" style={{ background: 'rgba(6,4,8,0.72)' }} />

      <div className="relative min-h-screen flex flex-col">
        {/* Cabeçalho enxuto: o saguão é passagem, não morada. A marca já está na foto. */}
        <header className="flex items-center justify-end px-6 py-5">
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
              style={{ color: 'var(--text-secondary)' }}
            >
              <LogOut size={14} />
            </button>
          </div>
        </header>

        <main className="flex-1 flex flex-col justify-center items-end px-6 sm:px-10 lg:px-16 pb-16 max-w-full">
          <p
            className="text-right text-[11px] uppercase tracking-[0.18em] font-semibold mb-8"
            style={{ color: 'var(--text-secondary)' }}
          >
            Onde você vai trabalhar agora?
          </p>

          {/* Colmeia — telas sm e maiores. */}
          <div className="hidden sm:flex flex-col items-center">
            {fileiras.map((fileira, fi) => (
              <div
                key={fi}
                className="flex justify-center"
                style={{
                  gap: HEX_GAP,
                  marginTop: fi === 0 ? 0 : HEX_GAP,
                  marginLeft: fi % 2 === 1 ? (HEX_W + HEX_GAP) / 2 : 0,
                }}
              >
                {fileira.map((area) => (
                  <Hexagono key={area.id} area={area} onClick={() => navigate(area.modulos[0].path)} />
                ))}
              </div>
            ))}
          </div>

          {/* Lista — mobile. Hexágono espremido em tela estreita vira ruim; aqui é
              o mesmo cartão em vidro usado no resto do sistema. */}
          <div className="sm:hidden w-full flex flex-col gap-3">
            {areas.map((area) => (
              <button
                key={area.id}
                onClick={() => navigate(area.modulos[0].path)}
                className="glass-card rounded-2xl p-4 flex items-center gap-3.5 text-left group"
              >
                <div className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center bg-gradient-to-br from-wine/25 to-gold/10 border border-gold/15">
                  <area.icone className="w-5 h-5" style={{ color: 'var(--gold)' }} strokeWidth={1.75} />
                </div>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-display font-bold" style={{ color: 'var(--text-primary)' }}>{area.nome}</span>
                  <span className="block text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{area.descricao}</span>
                </span>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
              </button>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
};

export default Saguao;
