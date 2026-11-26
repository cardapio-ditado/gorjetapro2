/**
 * Pixel da Meta só na página pública do Vale Ditado (Kadu, 26/11/2026). O sistema não carrega o Pixel:
 * a base entra no <head> por montar.tsx, que só roda nas rotas /vale.
 *
 * Eventos:
 * - PageView a cada troca de rota (RastreioRotas), menos no comprovante.
 * - ViewContent ao abrir /vale.
 * - InitiateCheckout no clique de "Ir para o pagamento".
 * - Purchase vai pelo servidor (API de Conversões, função "vale", quando o pagamento confirma).
 *
 * O comprovante (/vale/c/:token) fica fora do Pixel: o endereço dele é o link secreto dos vales do cliente,
 * e o Pixel manda o endereço da página para a Meta em todo evento.
 * autoConfig desligado: o Pixel não lê botões e dados da página por conta própria.
 * Falha em silêncio: bloqueador de anúncio ou rede ruim nunca atrapalham a compra.
 */
export const PIXEL_ID = '1074066107036036';

type Fbq = ((...args: unknown[]) => void) & { callMethod?: (...a: unknown[]) => void; queue: unknown[]; loaded?: boolean; version?: string; push?: unknown };
declare global { interface Window { fbq?: Fbq; _fbq?: Fbq } }

const privada = (caminho: string) => /^\/vale\/c\//.test(caminho);

/** Código base da Meta (o mesmo do Gerenciador de Eventos), sem o PageView: quem manda é a rota. */
export function iniciarPixel() {
  try {
    if (window.fbq) return;
    const f = function (...args: unknown[]) {
      if (f.callMethod) f.callMethod(...args); else f.queue.push(args);
    } as Fbq;
    f.push = f; f.loaded = true; f.version = '2.0'; f.queue = [];
    window.fbq = f; window._fbq = f;
    const s = document.createElement('script');
    s.async = true;
    s.src = 'https://connect.facebook.net/en_US/fbevents.js';
    document.head.appendChild(s);
    f('set', 'autoConfig', false, PIXEL_ID);
    f('init', PIXEL_ID);
  } catch { /* sem Pixel, a página segue */ }
}

function enviar(evento: string, dados?: Record<string, unknown>) {
  try {
    if (privada(location.pathname)) return;
    window.fbq?.('track', evento, dados);
  } catch { /* idem */ }
}

let ultimaRota = '';
export function pageView(caminho: string) {
  if (caminho === ultimaRota || privada(caminho)) return;
  ultimaRota = caminho;
  enviar('PageView');
}

export const viewContent = () =>
  enviar('ViewContent', { content_name: 'Vale Ditado', content_category: 'Vale Ditado', content_type: 'product' });

export function initiateCheckout(linhas: { slug: string; quantidade: number; preco: number }[], total: number) {
  enviar('InitiateCheckout', {
    value: Number(total.toFixed(2)), currency: 'BRL', content_type: 'product',
    content_ids: linhas.map((l) => l.slug),
    contents: linhas.map((l) => ({ id: l.slug, quantity: l.quantidade, item_price: l.preco })),
    num_items: linhas.reduce((n, l) => n + l.quantidade, 0),
  });
}

/** Cookies do Pixel (_fbp e _fbc), mandados com o pedido para a API de Conversões casar a compra com a visita. */
export function cookiesMeta(): { fbp?: string; fbc?: string } {
  try {
    const ler = (n: string) => document.cookie.split('; ').find((c) => c.startsWith(n + '='))?.slice(n.length + 1);
    const fbp = ler('_fbp');
    let fbc = ler('_fbc');
    if (!fbc) {
      const clid = new URLSearchParams(location.search).get('fbclid') || sessionStorage.getItem('vale_fbclid');
      if (clid) fbc = `fb.1.${Date.now()}.${clid}`;
    }
    return { ...(fbp ? { fbp } : {}), ...(fbc ? { fbc: fbc.slice(0, 300) } : {}) };
  } catch { return {}; }
}

/** Guarda o fbclid da entrada: o _fbc do Pixel pode não existir se o script foi bloqueado. */
export function guardarFbclid() {
  try {
    const clid = new URLSearchParams(location.search).get('fbclid');
    if (clid) sessionStorage.setItem('vale_fbclid', clid.slice(0, 250));
  } catch { /* idem */ }
}
