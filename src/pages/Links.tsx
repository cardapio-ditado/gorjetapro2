import { useEffect } from 'react';
import { CalendarDays, ChevronRight, Globe, Instagram, MapPin, MessageCircle, UtensilsCrossed } from 'lucide-react';

/**
 * Links da bio do Instagram (ditado.org/links), no lugar do Linktree (Kadu, 19/11/2026).
 * Página pública, sem login, no Manual da Marca Ditado Brasa & Bar (v1.2, nov/2026):
 * - base off-white #F5EFE6; protagonistas terracota #B65B43 e verde musgo #46513A;
 *   texto carvão #1A1A1A; o vermelho fica só na logo (arquivo em /marca).
 * - títulos em serifa editorial (Bitstream Charter, proposta do manual; Noto Serif quando
 *   o aparelho não tem Charter) e informações em sans simples (Liberation Sans / Arial).
 * - slogan "Onde há fumaça, há fogo." e a síntese "Brasa • Música • Encontros".
 * - leitura: texto claro sobre terracota/musgo, texto escuro sobre off-white.
 * Os contatos vêm do site oficial (ditado-popular-site, src/lib/site.ts). O @ do Instagram não muda.
 */

const COR = { offwhite: '#F5EFE6', terracota: '#B65B43', musgo: '#46513A', carvao: '#1A1A1A', tabaco: '#6B4938' };
const SERIFA = "Charter, 'Bitstream Charter', 'Noto Serif', Georgia, serif";
const SANS = "'Liberation Sans', Arial, Helvetica, sans-serif";

const WHATS = '556541413655';
const ENDERECO = 'R. Sen. Vilas Bôas, 89 · Praça Popular · Cuiabá-MT';
const MAPS = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent('Ditado Popular, R. Sen. Vilas Bôas, 89 - Popular, Cuiabá - MT, 78045-430')}`;

const LINKS: Array<{ titulo: string; sub: string; href: string; Icone: typeof Globe; destaque?: boolean; externo?: boolean }> = [
  { titulo: 'Reservar mesa', sub: 'A equipe confirma pelo WhatsApp', href: '/reserva', Icone: CalendarDays, destaque: true },
  { titulo: 'Cardápio', sub: 'Brasa, petiscos, chopp e drinks', href: 'https://ditadopopular-bra.ola.click/products', Icone: UtensilsCrossed, externo: true },
  { titulo: 'WhatsApp', sub: '(65) 4141-3655', href: `https://wa.me/${WHATS}?text=${encodeURIComponent('Olá! Vim pelo Instagram do Ditado.')}`, Icone: MessageCircle, externo: true },
  { titulo: 'Como chegar', sub: 'Praça Popular, Cuiabá', href: MAPS, Icone: MapPin, externo: true },
  { titulo: 'Instagram', sub: '@ditadopopular', href: 'https://www.instagram.com/ditadopopular/', Icone: Instagram, externo: true },
  { titulo: 'Site', sub: 'www.ditadopopular.com.br', href: 'https://www.ditadopopular.com.br', Icone: Globe, externo: true },
];

/** Noto Serif só nesta página, para quem não tem a Charter no aparelho. */
function useSerifa() {
  useEffect(() => {
    const id = 'fonte-ditado-serifa';
    if (document.getElementById(id)) return;
    const l = document.createElement('link');
    l.id = id; l.rel = 'stylesheet';
    l.href = 'https://fonts.googleapis.com/css2?family=Noto+Serif:wght@400;600&display=swap';
    document.head.appendChild(l);
  }, []);
}

export default function Links() {
  useSerifa();
  useEffect(() => { document.title = 'Ditado Brasa & Bar · Links'; }, []);
  return (
    <div className="min-h-screen" style={{ background: COR.offwhite, color: COR.carvao, fontFamily: SANS }}>
      <div className="max-w-md mx-auto px-4 pt-10 pb-12">
        <header className="flex flex-col items-center text-center mb-8">
          <img src="/marca/ditado-brasa-bar.svg" alt="Ditado Brasa & Bar" style={{ width: 250, maxWidth: '78%', height: 'auto' }} />
          <p className="mt-5 text-xs font-bold" style={{ letterSpacing: '0.18em', color: COR.musgo }}>BRASA • MÚSICA • ENCONTROS</p>
          <p className="mt-3" style={{ fontFamily: SERIFA, fontSize: 28, lineHeight: 1.15, color: COR.musgo }}>Onde há fumaça, há fogo.</p>
        </header>

        <nav aria-label="Links do Ditado" className="flex flex-col gap-3">
          {LINKS.map(({ titulo, sub, href, Icone, destaque, externo }) => (
            <a key={titulo} href={href} {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
              className="flex items-center gap-3 rounded-2xl px-4 py-3.5 transition-transform active:scale-[0.98] hover:brightness-110"
              style={destaque
                ? { background: COR.terracota, color: '#FFFFFF' }
                : { background: COR.musgo, color: COR.offwhite }}>
              <span className="flex items-center justify-center rounded-xl flex-shrink-0"
                style={{ width: 42, height: 42, background: 'rgba(255,255,255,0.14)' }}>
                <Icone size={20} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block leading-tight" style={{ fontFamily: SERIFA, fontSize: 20, fontWeight: 600 }}>{titulo}</span>
                <span className="block text-sm truncate" style={{ opacity: 0.88 }}>{sub}</span>
              </span>
              <ChevronRight size={18} style={{ opacity: 0.75 }} />
            </a>
          ))}
        </nav>

        <footer className="mt-10 text-center text-xs" style={{ color: COR.tabaco }}>
          <p style={{ fontFamily: SERIFA, fontSize: 15, color: COR.carvao }}>Ditado Brasa &amp; Bar</p>
          <p className="mt-1">{ENDERECO}</p>
          <p className="mt-1">Desde 2008</p>
        </footer>
      </div>
    </div>
  );
}
