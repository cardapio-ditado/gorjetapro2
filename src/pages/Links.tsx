import { useEffect } from 'react';
import { CalendarDays, ChevronRight, Globe, Instagram, MapPin, MessageCircle, UtensilsCrossed } from 'lucide-react';

/**
 * Links da bio do Instagram (ditado.org/links), no lugar do Linktree (Kadu, 19/11/2026).
 * Página pública, sem login, na identidade nova do Ditado Brasa & Bar (Guia de Marca):
 * carvão #1A1A1A, vermelho brasa #E31E24, âmbar #FFB347, off-white #F4EDE4;
 * Bebas Neue nos títulos, Yellowtail no ditado, Inter no texto; slogan assinado pelo Ditado Popular.
 * Os contatos vêm do site oficial (ditado-popular-site, src/lib/site.ts). O @ do Instagram não muda.
 */

const COR = { carvao: '#1A1A1A', vermelho: '#E31E24', ambar: '#FFB347', off: '#F4EDE4' };
const BEBAS = "'Bebas Neue', 'Oswald', 'Arial Narrow', sans-serif";
const YELLOWTAIL = "'Yellowtail', 'Brush Script MT', cursive";

const WHATS = '556541413655';
const ENDERECO = 'R. Sen. Vilas Bôas, 89 · Praça Popular · Cuiabá-MT';
const MAPS = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Ditado Popular, R. Sen. Vilas Bôas, 89 - Popular, Cuiabá - MT, 78045-430')}`;

const LINKS: Array<{ titulo: string; sub: string; href: string; Icone: typeof Globe; destaque?: boolean; externo?: boolean }> = [
  { titulo: 'Reservar mesa', sub: 'A equipe confirma pelo WhatsApp', href: '/reserva', Icone: CalendarDays, destaque: true },
  { titulo: 'Cardápio', sub: 'Brasa, petisco, chopp e drinks', href: 'https://ditadopopular-bra.ola.click/products', Icone: UtensilsCrossed, externo: true },
  { titulo: 'WhatsApp', sub: 'Chama a gente: (65) 4141-3655', href: `https://wa.me/${WHATS}?text=${encodeURIComponent('Olá! Vim pelo Instagram do Ditado.')}`, Icone: MessageCircle, externo: true },
  { titulo: 'Como chegar', sub: 'A esquina mais charmosa de Cuiabá', href: MAPS, Icone: MapPin, externo: true },
  { titulo: 'Instagram', sub: '@ditadopopular', href: 'https://www.instagram.com/ditadopopular/', Icone: Instagram, externo: true },
  { titulo: 'Site', sub: 'ditadopopular.com.br', href: 'https://ditadopopular.com.br', Icone: Globe, externo: true },
];

/** As fontes da marca só nesta página (o resto do sistema não usa). */
function useFontesDaMarca() {
  useEffect(() => {
    const id = 'fontes-ditado-brasa';
    if (document.getElementById(id)) return;
    const l = document.createElement('link');
    l.id = id; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Yellowtail&display=swap';
    document.head.appendChild(l);
  }, []);
}

export default function Links() {
  useFontesDaMarca();
  useEffect(() => { document.title = 'Ditado Brasa & Bar · Links'; }, []);
  return (
    <div className="min-h-screen" style={{ background: COR.carvao, color: COR.off }}>
      <div className="relative max-w-md mx-auto px-4 pt-10 pb-12">
        {/* luz da brasa atrás do logo */}
        <div aria-hidden className="pointer-events-none absolute left-1/2 -translate-x-1/2 top-0" style={{
          width: 420, maxWidth: '100%', height: 300, background: 'radial-gradient(closest-side, rgba(255,179,71,0.22), rgba(227,30,36,0.10) 55%, transparent)',
        }} />

        <header className="relative flex flex-col items-center text-center mb-8">
          <img src="/marca/ditado-brasa-bar.svg" alt="Ditado Brasa & Bar" style={{ width: 250, maxWidth: '78%', height: 'auto' }} />
          <p className="mt-3" style={{ fontFamily: BEBAS, letterSpacing: '0.28em', fontSize: 15, color: COR.ambar }}>Desde 2008 · Cuiabá</p>
          <p className="mt-5 leading-none" style={{ fontFamily: YELLOWTAIL, fontSize: 32, color: COR.ambar, textShadow: '0 0 18px rgba(255,179,71,0.45)' }}>
            Onde há fumaça, há fogo.
          </p>
          <p className="mt-1 text-xs" style={{ color: 'rgba(244,237,228,0.6)' }}>— Ditado Popular</p>
        </header>

        <nav aria-label="Links do Ditado" className="relative flex flex-col gap-3">
          {LINKS.map(({ titulo, sub, href, Icone, destaque, externo }) => (
            <a key={titulo} href={href} {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="flex items-center gap-3 rounded-2xl px-4 py-3 transition-transform active:scale-[0.98] hover:brightness-110"
              style={destaque
                ? { background: COR.vermelho, color: COR.off, boxShadow: '0 10px 28px rgba(227,30,36,0.35)' }
                : { background: 'rgba(244,237,228,0.05)', border: '1px solid rgba(244,237,228,0.12)', color: COR.off }}>
              <span className="flex items-center justify-center rounded-xl flex-shrink-0" style={{
                width: 42, height: 42,
                background: destaque ? 'rgba(244,237,228,0.16)' : 'rgba(255,179,71,0.12)',
                color: destaque ? COR.off : COR.ambar,
              }}>
                <Icone size={20} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block leading-none" style={{ fontFamily: BEBAS, fontSize: 24, letterSpacing: '0.04em' }}>{titulo}</span>
                <span className="block text-xs truncate mt-0.5" style={{ opacity: destaque ? 0.9 : 0.65 }}>{sub}</span>
              </span>
              <ChevronRight size={18} style={{ opacity: 0.6 }} />
            </a>
          ))}
        </nav>

        <footer className="relative mt-10 text-center text-xs" style={{ color: 'rgba(244,237,228,0.45)' }}>
          <p style={{ fontFamily: BEBAS, fontSize: 16, letterSpacing: '0.12em', color: 'rgba(244,237,228,0.7)' }}>Ditado Brasa &amp; Bar</p>
          <p className="mt-1">{ENDERECO}</p>
        </footer>
      </div>
    </div>
  );
}
