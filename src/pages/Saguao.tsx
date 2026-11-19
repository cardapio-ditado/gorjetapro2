import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, LogOut } from 'lucide-react';
import { AREAS, MODULES, moduloLiberado } from '../components/layout/SidebarModern';
import { useAuth } from '../contexts/AuthContext';

/**
 * O saguão: a entrada do sistema, um cartão por ÁREA da casa.
 *
 * Identidade Ditado Brasa & Bar (Manual da Marca v1.2 e proposta visual de
 * 19/11/2026): base off-white, painel verde musgo, a primeira área em terracota,
 * títulos em serifa editorial, vermelho só na logo.
 *
 * Um cartão por área — Operação, Financeiro, Estoque, Recursos Humanos, Clientes
 * e Parceiros, Sistema — e não um por módulo: a pessoa pensa "vou mexer no
 * dinheiro", não "vou abrir Contas a Pagar". As telas da área aparecem na
 * lateral depois que ela entra.
 *
 * AREAS e MODULES vêm do sidebar — uma verdade só. Área sem nenhum módulo que
 * o usuário possa ver não vira cartão: cartão que não abre nada é porta trancada.
 */

const COR = {
  offwhite: '#F5EFE6',
  cartao: '#FFFDF9',
  terracota: '#B65B43',
  musgo: '#46513A',
  carvao: '#1A1A1A',
  apoio: '#5E554D',
  borda: 'rgba(26,26,26,0.12)',
};
const SERIFA = "Charter, 'Bitstream Charter', 'Noto Serif', Georgia, serif";

const Cartao: React.FC<{
  area: { id: string; nome: string; descricao: string; icone: React.ElementType; cor: string };
  destaque: boolean;
  onClick: () => void;
}> = ({ area, destaque, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="group text-left rounded-xl p-5 flex flex-col gap-3 transition-transform duration-150 hover:-translate-y-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
    style={destaque
      ? { background: area.cor, color: '#FFFFFF', outlineColor: COR.musgo, minHeight: 148 }
      : { background: COR.cartao, color: COR.carvao, border: `1px solid ${COR.borda}`, borderTop: `4px solid ${area.cor}`, outlineColor: COR.musgo, minHeight: 148 }}
  >
    <area.icone size={30} strokeWidth={1.6} style={{ color: destaque ? '#FFFFFF' : area.cor }} />
    <span className="block">
      <span className="block text-lg font-semibold leading-tight" style={{ color: destaque ? '#FFFFFF' : area.cor }}>{area.nome}</span>
      <span className="flex items-end gap-3 mt-1">
        <span className="flex-1 text-sm leading-snug" style={{ color: destaque ? 'rgba(255,255,255,0.88)' : COR.apoio }}>{area.descricao}</span>
        <ArrowRight size={18} className="flex-shrink-0 transition-transform duration-150 group-hover:translate-x-0.5" />
      </span>
    </span>
  </button>
);

const Saguao: React.FC = () => {
  const navigate = useNavigate();
  const { temAcessoModulo, usuario, logout } = useAuth();

  const permitidos = MODULES.filter((m) => moduloLiberado(m, temAcessoModulo));

  // Cada cartão leva ao primeiro módulo visível da área — a ordem em MODULES
  // já é a ordem de importância dentro dela.
  const areas = AREAS.map((area) => ({
    ...area,
    modulos: permitidos.filter((m) => m.group === area.id),
  })).filter((a) => a.modulos.length > 0);

  const primeiroNome = usuario?.nome_completo?.split(' ')[0] ?? 'Usuário';
  const inicial = primeiroNome.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen flex flex-col" style={{ background: COR.offwhite, color: COR.carvao }}>
      {/* Topo: a logo assina sobre o claro, como pede o manual. */}
      <header className="flex items-center gap-4 px-5 sm:px-8 py-3" style={{ background: '#FBF8F2', borderBottom: `1px solid ${COR.borda}` }}>
        <img src="/marca/ditado-brasa-bar.svg" alt="Ditado Brasa & Bar" style={{ height: 52, width: 'auto' }} />
        <span aria-hidden className="hidden sm:block h-9 w-px" style={{ background: COR.borda }} />
        <span className="hidden sm:block text-lg font-semibold" style={{ color: COR.apoio }}>Gestão</span>
        <span className="flex-1" />
        <span className="flex items-center gap-2.5">
          <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold" style={{ background: COR.musgo, color: COR.offwhite }}>{inicial}</span>
          <span className="hidden sm:block text-sm font-semibold">{primeiroNome}</span>
          <button type="button" onClick={logout} title="Sair" aria-label="Sair"
            className="w-9 h-9 flex items-center justify-center rounded-lg transition-colors hover:bg-black/5" style={{ color: COR.apoio }}>
            <LogOut size={16} />
          </button>
        </span>
      </header>

      <main className="flex-1 flex flex-col lg:flex-row">
        {/* Painel musgo: o convite. */}
        <section className="relative overflow-hidden lg:w-[40%] lg:flex-shrink-0 px-6 sm:px-10 lg:px-12 py-10 lg:py-16 flex flex-col justify-center" style={{ background: COR.musgo, color: COR.offwhite }}>
          <h1 className="relative font-bold leading-[1.08]" style={{ fontFamily: SERIFA, fontSize: 'clamp(34px, 3.8vw, 56px)', color: COR.offwhite, maxWidth: 460 }}>
            Tudo pronto para abrir a casa.
          </h1>
          <p className="relative mt-4 text-lg leading-snug" style={{ color: 'rgba(245,239,230,0.88)', maxWidth: 380 }}>
            Pessoas, operação e resultado no mesmo lugar.
          </p>
          {/* Arcos em terracota: o mesmo desenho da proposta, discreto, só no desktop. */}
          <div aria-hidden className="hidden lg:grid absolute left-0 bottom-0 grid-cols-4 gap-2" style={{ width: 320 }}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <span key={i} style={{
                width: 72, height: 72, background: COR.terracota, opacity: i < 4 && i !== 1 ? 0 : 0.95,
                borderTopLeftRadius: i % 2 === 0 ? 72 : 0, borderTopRightRadius: i % 2 === 1 ? 72 : 0,
              }} />
            ))}
          </div>
        </section>

        {/* As áreas. */}
        <section className="flex-1 min-w-0 px-5 sm:px-10 py-8 lg:py-14">
          <h2 className="font-bold mb-6" style={{ fontFamily: SERIFA, fontSize: 'clamp(28px, 3vw, 40px)', lineHeight: 1.1, color: COR.carvao }}>
            Onde vamos trabalhar?
          </h2>
          <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(min(220px, 100%), 1fr))', maxWidth: 900 }}>
            {areas.map((area, i) => (
              <Cartao key={area.id} area={area} destaque={i === 0} onClick={() => navigate(area.modulos[0].path)} />
            ))}
          </div>
          {areas.length === 0 && (
            <p className="text-base" style={{ color: COR.apoio }}>Seu usuário ainda não tem nenhuma área liberada. Fale com o Kadu.</p>
          )}
        </section>
      </main>
    </div>
  );
};

export default Saguao;
