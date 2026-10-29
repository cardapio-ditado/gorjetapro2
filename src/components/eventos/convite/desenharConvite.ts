/**
 * O convite da feijoada no formato stories (1080 × 1920), desenhado no canvas.
 *
 * Cada layout é uma foto (geradas por IA, guardadas em marketing-assets/convites/feijoada)
 * com uma zona de texto onde a foto tem espaço vazio, e uma faixa clara embaixo com
 * os logos (cliente | bar) e o endereço. Nada importante fica nos 200 px de cima e
 * nos ~170 px de baixo, que o Instagram e o WhatsApp cobrem.
 */

export const LARGURA = 1080;
export const ALTURA = 1920;
const FAIXA = 300; // altura da faixa dos logos
const SERIFA = '"Instrument Serif", Georgia, serif';
const SANS = 'Manrope, "Helvetica Neue", Arial, sans-serif';

export interface Layout {
  id: string;
  nome: string;
  foto: string; // nome do arquivo em convites/feijoada/
  /** de onde a foto é recortada quando sobra altura */
  ancora: 'topo' | 'centro' | 'base';
  /** onde vai o texto: sobre a parte vazia de cima, de baixo, ou num painel sob a foto */
  zona: 'topo' | 'base' | 'painel';
  alinhamento: 'centro' | 'esquerda';
  tinta: string;
  acento: string;
  tituloItalico?: boolean;
  /** faixa vertical (no convite) onde a foto está vazia e o texto pode ir */
  livre: [number, number];
  /** largura máxima do texto, quando a foto ocupa um lado */
  largura?: number;
  /** escurece (ou clareia) atrás do texto, se a foto precisar */
  veu?: string;
  /** painel: altura da foto */
  fotoAte?: number;
  /** brilho suave atrás das letras, para ler sobre a textura da foto */
  halo?: 'escuro' | 'claro';
}

export const LAYOUTS: Layout[] = [
  { id: 'rustico', nome: 'Rústico', foto: 'rustico', ancora: 'centro', zona: 'base', livre: [930, 1560], alinhamento: 'centro', tinta: '#F6EFE3', acento: '#E9A548', veu: 'rgba(20,11,6,0.78)', halo: 'escuro' },
  { id: 'linho', nome: 'Linho', foto: 'linho', ancora: 'topo', zona: 'topo', livre: [200, 960], alinhamento: 'centro', tinta: '#2B1E17', acento: '#A8432A', tituloItalico: true, halo: 'claro' },
  { id: 'graos', nome: 'Grãos', foto: 'graos', ancora: 'topo', zona: 'topo', livre: [200, 900], alinhamento: 'esquerda', tinta: '#1F1A16', acento: '#A9481C', halo: 'claro' },
  { id: 'noir', nome: 'Noir', foto: 'noir', ancora: 'base', zona: 'topo', livre: [200, 930], alinhamento: 'centro', tinta: '#EFE8DC', acento: '#D4B06A', tituloItalico: true, halo: 'escuro' },
  { id: 'panela', nome: 'Panela', foto: 'panela', ancora: 'topo', zona: 'topo', livre: [200, 880], largura: 560, alinhamento: 'esquerda', tinta: '#F6EFE3', acento: '#F0B064', halo: 'escuro' },
  { id: 'sol', nome: 'Sol', foto: 'sol', ancora: 'base', zona: 'base', livre: [760, 1560], alinhamento: 'esquerda', tinta: '#2A2420', acento: '#A4461A', veu: 'rgba(250,247,242,0.6)', halo: 'claro' },
  { id: 'mesa', nome: 'Mesa farta', foto: 'mesa', ancora: 'centro', zona: 'painel', livre: [950, 1580], alinhamento: 'centro', tinta: '#2A1F18', acento: '#B4532A', fotoAte: 900 },
];

export interface ConviteTexto {
  chamada: string;      // linha pequena acima do título (opcional)
  titulo: string;       // "Feijoada"
  organizador: string;  // "do Rotary Club Cuiabá"
  diaSemana: string;    // "sábado"
  data: string;         // "14 de novembro"
  horario: string;      // "das 11h às 15h"
  destaques: string;    // "Banda ao vivo · Buffet completo"
  preco: string;        // "Convite R$ 35" (vazio = não mostra)
  contato: string;      // "Garanta o seu: (65) 9 9999-9999" (opcional)
  endereco: string;     // "Rua Senador Vilas Boas, 89 · Popular · Cuiabá"
}

export interface ConviteRecursos {
  foto: CanvasImageSource & { width: number; height: number };
  logoBar: CanvasImageSource & { width: number; height: number };
  logoCliente?: (CanvasImageSource & { width: number; height: number }) | null;
}

const PAPEL = '#F4EEE4';
const PAPEL_TINTA = '#4A3F37';

type Ctx = CanvasRenderingContext2D;

/** Texto com espaçamento entre letras (letterSpacing quando o navegador tem). */
function textoEspacado(ctx: Ctx, t: string, x: number, y: number, espaco: number, alinhar: 'centro' | 'esquerda') {
  const temLS = typeof (ctx as { letterSpacing?: unknown }).letterSpacing === 'string';
  if (temLS) {
    (ctx as Ctx & { letterSpacing: string }).letterSpacing = `${espaco}px`;
    const w = ctx.measureText(t).width - espaco; // o último espaço não conta
    ctx.textAlign = 'left';
    ctx.fillText(t, alinhar === 'centro' ? x - w / 2 : x, y);
    (ctx as Ctx & { letterSpacing: string }).letterSpacing = '0px';
    return;
  }
  const larguras = [...t].map(ch => ctx.measureText(ch).width);
  const total = larguras.reduce((s, w) => s + w, 0) + espaco * (larguras.length - 1);
  let cx = alinhar === 'centro' ? x - total / 2 : x;
  ctx.textAlign = 'left';
  [...t].forEach((ch, i) => { ctx.fillText(ch, cx, y); cx += larguras[i] + espaco; });
}

function quebrarLinhas(ctx: Ctx, t: string, max: number, maxLinhas: number): string[] {
  const palavras = t.trim().split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = '';
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (ctx.measureText(tentativa).width <= max || !atual) atual = tentativa;
    else { linhas.push(atual); atual = p; }
  }
  if (atual) linhas.push(atual);
  if (linhas.length > maxLinhas) {
    const resto = linhas.slice(maxLinhas - 1).join(' ');
    return [...linhas.slice(0, maxLinhas - 1), resto];
  }
  return linhas;
}

/** Recorta a foto para cobrir a área (como object-fit: cover). */
function desenharCobrindo(ctx: Ctx, img: ConviteRecursos['foto'], x: number, y: number, w: number, h: number, ancora: Layout['ancora']) {
  const escala = Math.max(w / img.width, h / img.height);
  const sw = w / escala, sh = h / escala;
  const sx = (img.width - sw) / 2;
  const sy = ancora === 'topo' ? 0 : ancora === 'base' ? img.height - sh : (img.height - sh) / 2;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
}

function caber(img: { width: number; height: number }, maxW: number, maxH: number) {
  const e = Math.min(maxW / img.width, maxH / img.height);
  return { w: img.width * e, h: img.height * e };
}

interface Linha { altura: number; desenhar: (y: number) => void }

/** Monta o bloco de texto como uma pilha de linhas, para medir antes de posicionar. k = escala. */
function blocoDeTexto(ctx: Ctx, l: Layout, t: ConviteTexto, x: number, largura: number, k: number, comDestaques = true): Linha[] {
  const al = l.alinhamento;
  const tx = al === 'centro' ? x + largura / 2 : x;
  const alinhar = () => { ctx.textAlign = al === 'centro' ? 'center' : 'left'; };
  const linhas: Linha[] = [];
  const px = (v: number) => Math.round(v * k);
  ctx.textBaseline = 'alphabetic';

  if (t.chamada.trim()) {
    linhas.push({ altura: px(66), desenhar: y => { ctx.font = `700 ${px(29)}px ${SANS}`; ctx.fillStyle = l.acento; textoEspacado(ctx, t.chamada.trim().toUpperCase(), tx, y + px(30), 7 * k, al); } });
  }

  // título: o maior que couber
  const titulo = t.titulo.trim() || 'Feijoada';
  const fTitulo = (tam: number) => `${l.tituloItalico ? 'italic ' : ''}400 ${tam}px ${SERIFA}`;
  let tam = px(250);
  ctx.font = fTitulo(tam);
  while (ctx.measureText(titulo).width > largura && tam > 80) { tam -= 4; ctx.font = fTitulo(tam); }
  const tamTitulo = tam;
  linhas.push({ altura: tamTitulo * 0.86, desenhar: y => {
    ctx.font = fTitulo(tamTitulo); ctx.fillStyle = l.tinta; alinhar();
    // a serifa tem "respiro" à esquerda: puxa um pouco para alinhar com o resto
    ctx.fillText(titulo, al === 'centro' ? tx : tx - tamTitulo * 0.03, y + tamTitulo * 0.74);
  } });

  if (t.organizador.trim()) {
    ctx.font = `italic 400 ${px(66)}px ${SERIFA}`;
    for (const o of quebrarLinhas(ctx, t.organizador.trim(), largura, 2)) {
      linhas.push({ altura: px(74), desenhar: y => { ctx.font = `italic 400 ${px(66)}px ${SERIFA}`; ctx.fillStyle = l.tinta; alinhar(); ctx.fillText(o, tx, y + px(58)); } });
    }
  }

  // fio
  linhas.push({ altura: px(74), desenhar: y => {
    const w = px(96);
    ctx.fillStyle = l.acento;
    ctx.fillRect(al === 'centro' ? tx - w / 2 : tx, y + px(36), w, Math.max(2, px(3)));
  } });

  if (t.diaSemana.trim()) {
    linhas.push({ altura: px(52), desenhar: y => { ctx.font = `700 ${px(31)}px ${SANS}`; ctx.fillStyle = l.acento; textoEspacado(ctx, t.diaSemana.trim().toUpperCase(), tx, y + px(31), 6 * k, al); } });
  }
  if (t.data.trim()) {
    linhas.push({ altura: px(94), desenhar: y => { ctx.font = `400 ${px(88)}px ${SERIFA}`; ctx.fillStyle = l.tinta; alinhar(); ctx.fillText(t.data.trim(), tx, y + px(74)); } });
  }
  if (t.horario.trim()) {
    linhas.push({ altura: px(62), desenhar: y => { ctx.font = `600 ${px(40)}px ${SANS}`; ctx.fillStyle = l.tinta; alinhar(); ctx.fillText(t.horario.trim(), tx, y + px(45)); } });
  }
  if (t.destaques.trim() && comDestaques) {
    ctx.font = `600 ${px(32)}px ${SANS}`;
    const ds = quebrarLinhas(ctx, t.destaques.trim(), largura, 2);
    linhas.push({ altura: px(16), desenhar: () => undefined });
    for (const d of ds) {
      linhas.push({ altura: px(46), desenhar: y => { ctx.font = `600 ${px(32)}px ${SANS}`; ctx.fillStyle = l.tinta; alinhar(); ctx.fillText(d, tx, y + px(34)); } });
    }
  }
  if (t.preco.trim()) {
    // é uma peça de venda: o preço é grande, na serifa, na cor de destaque
    linhas.push({ altura: px(104), desenhar: y => { ctx.font = `400 ${px(78)}px ${SERIFA}`; ctx.fillStyle = l.acento; alinhar(); ctx.fillText(t.preco.trim(), tx, y + px(84)); } });
  }
  if (t.contato.trim()) {
    ctx.font = `700 ${px(31)}px ${SANS}`;
    for (const c of quebrarLinhas(ctx, t.contato.trim(), largura, 2)) {
      linhas.push({ altura: px(46), desenhar: y => { ctx.font = `700 ${px(31)}px ${SANS}`; ctx.fillStyle = l.tinta; alinhar(); ctx.fillText(c, tx, y + px(34)); } });
    }
  }
  return linhas;
}

export function desenharConvite(canvas: HTMLCanvasElement, l: Layout, t: ConviteTexto, r: ConviteRecursos) {
  canvas.width = LARGURA; canvas.height = ALTURA;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, LARGURA, ALTURA);
  ctx.fillStyle = PAPEL; ctx.fillRect(0, 0, LARGURA, ALTURA);

  const topoFaixa = ALTURA - FAIXA;
  const fotoAte = l.zona === 'painel' ? (l.fotoAte ?? 900) : topoFaixa;
  desenharCobrindo(ctx, r.foto, 0, 0, LARGURA, fotoAte, l.ancora);

  const margem = l.alinhamento === 'centro' ? 90 : 96;
  const largura = l.largura ?? LARGURA - 2 * margem;
  const [livreIni, livreFim] = l.livre;
  const soma = (ls: Linha[]) => ls.reduce((acc, x) => acc + x.altura, 0);
  // mede no tamanho cheio; se não couber na parte livre da foto, reduz tudo junto
  const livre = livreFim - livreIni;
  let linhas = blocoDeTexto(ctx, l, t, margem, largura, 1);
  // não deixa a letra ficar miúda: antes de encolher muito, tira os destaques
  let comDestaques = true;
  if (livre / soma(linhas) < 0.85 && t.destaques.trim()) { comDestaques = false; linhas = blocoDeTexto(ctx, l, t, margem, largura, 1, false); }
  const k = Math.min(1, livre / soma(linhas));
  if (k < 1) linhas = blocoDeTexto(ctx, l, t, margem, largura, k, comDestaques);
  const alturaBloco = soma(linhas);

  const y0 = l.zona === 'topo' ? livreIni
    : l.zona === 'base' ? livreFim - alturaBloco
    : livreIni + (livreFim - livreIni - alturaBloco) / 2;

  if (l.veu) {
    // véu só onde vai o texto, sumindo para cima
    const ini = Math.max(0, y0 - 260);
    const g = ctx.createLinearGradient(0, ini, 0, topoFaixa);
    g.addColorStop(0, l.veu.replace(/[\d.]+\)$/, '0)'));
    g.addColorStop(0.45, l.veu);
    g.addColorStop(1, l.veu);
    ctx.fillStyle = g; ctx.fillRect(0, ini, LARGURA, topoFaixa - ini);
  }

  if (l.halo && l.zona !== 'painel') {
    ctx.shadowColor = l.halo === 'escuro' ? 'rgba(0,0,0,0.6)' : 'rgba(255,251,245,0.9)';
    ctx.shadowBlur = 26;
  }
  let y = y0;
  for (const linha of linhas) { linha.desenhar(y); y += linha.altura; }
  ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0;

  // faixa dos logos
  ctx.fillStyle = PAPEL; ctx.fillRect(0, topoFaixa, LARGURA, FAIXA);
  const centroLogos = topoFaixa + 96;
  const bar = caber(r.logoBar, 290, 120);
  if (r.logoCliente) {
    const cli = caber(r.logoCliente, 300, 130);
    const gap = 56;
    const total = cli.w + gap * 2 + 2 + bar.w;
    let x = (LARGURA - total) / 2;
    ctx.drawImage(r.logoCliente, x, centroLogos - cli.h / 2, cli.w, cli.h);
    x += cli.w + gap;
    ctx.fillStyle = 'rgba(74,63,55,0.35)'; ctx.fillRect(x, centroLogos - 50, 2, 100);
    x += 2 + gap;
    ctx.drawImage(r.logoBar, x, centroLogos - bar.h / 2, bar.w, bar.h);
  } else {
    ctx.drawImage(r.logoBar, (LARGURA - bar.w) / 2, centroLogos - bar.h / 2, bar.w, bar.h);
  }
  if (t.endereco.trim()) {
    ctx.font = `600 21px ${SANS}`; ctx.fillStyle = PAPEL_TINTA;
    textoEspacado(ctx, t.endereco.trim().toUpperCase(), LARGURA / 2, topoFaixa + 196, 3.5, 'centro');
  }
}

export async function carregarFontesConvite() {
  if (!('fonts' in document)) return;
  await Promise.all([
    document.fonts.load(`400 100px "Instrument Serif"`),
    document.fonts.load(`italic 400 100px "Instrument Serif"`),
    document.fonts.load(`500 30px Manrope`),
    document.fonts.load(`600 30px Manrope`),
    document.fonts.load(`700 30px Manrope`),
  ]);
}
