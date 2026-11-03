import { jsPDF } from 'jspdf';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QRCodeSVG } from 'qrcode.react';
import { supabase } from '../../../lib/supabase';

/**
 * Ingressos no papel moeda: folha de ~21 × 30 cm com 12 ingressos (2 colunas ×
 * 6 linhas), cada um com ~10,5 × 5 cm. À esquerda o canhoto, separado por uma
 * faixa holográfica; à direita um círculo (selo), onde vai o QR code.
 * Impressora laser preto e branco: só preto, nada de cinza (sai manchado no
 * papel moeda), e nada impresso em cima da faixa holográfica nem das faixas
 * decoradas de cima e de baixo de cada ingresso.
 *
 * As medidas saíram de foto: a posição fina vem do ajuste do papel, que se
 * acerta com a folha de teste (imprime em papel comum e põe contra a luz em
 * cima do papel moeda).
 */

export interface AjustePapel {
  /** desloca tudo para a direita (+) ou esquerda (−), mm */
  dx: number;
  /** desloca tudo para baixo (+) ou para cima (−), mm */
  dy: number;
  /** largura de cada coluna (canhoto + ingresso), mm */
  largura: number;
  /** altura de cada ingresso, mm */
  altura: number;
  /** onde começa a faixa holográfica, a partir da borda esquerda do ingresso, mm */
  faixa: number;
}

export const AJUSTE_PADRAO: AjustePapel = { dx: 0, dy: 0, largura: 105, altura: 50, faixa: 26 };

const LARGURA_FAIXA = 7;   // faixa holográfica + folga
const BANDA = 8.5;         // faixas decoradas em cima e embaixo de cada ingresso
const QR = 16;             // lado do QR code, mm
const SELO_DA_DIREITA = 10.5; // centro do círculo, a partir da borda direita
const COLUNAS = 2;
const LINHAS = 6;
export const POR_FOLHA = COLUNAS * LINHAS;

export interface DadosIngresso {
  numero: number;
  codigo: string;
  valor: number | null;
}

export interface DadosEvento {
  nome: string;
  data: string;          // YYYY-MM-DD
  horario?: string | null;
  frase?: string;
}

export async function carregarAjuste(): Promise<AjustePapel> {
  const { data } = await supabase.from('configuracoes_sistema').select('valor').eq('chave', 'ingresso_papel').maybeSingle();
  try { return { ...AJUSTE_PADRAO, ...(data?.valor ? JSON.parse(data.valor) : {}) }; } catch { return AJUSTE_PADRAO; }
}

export async function salvarAjuste(a: AjustePapel) {
  const { error } = await supabase.rpc('fn_ingresso_papel_salvar', { p_ajuste: a });
  if (error) throw error;
}

/** Link que vai no QR: a câmera do celular abre direto a conferência no sistema. */
export const linkIngresso = (codigo: string) => `${window.location.origin}/ingresso/${codigo}`;

const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
function dataCurta(iso: string) {
  const [a, m, d] = iso.split('-').map(Number);
  return `${DIAS[new Date(a, m - 1, d).getDay()]} ${String(d).padStart(2, '0')}/${String(m).padStart(2, '0')}/${a}`;
}
const horaCurta = (h?: string | null) => {
  if (!h) return '';
  const [hh, mm] = h.split(':');
  return mm && mm !== '00' ? `${Number(hh)}h${mm}` : `${Number(hh)}h`;
};
const numeroTxt = (n: number) => String(n).padStart(3, '0');

/** Logo da casa em preto puro, como PNG (o SVG é vermelho). */
let logoCache: { url: string; proporcao: number } | null = null;
async function logoPreto() {
  if (logoCache) return logoCache;
  const svg = (await (await fetch('/marca/ditado-brasa-bar.svg')).text()).replace(/fill="#[0-9a-fA-F]{6}"/g, 'fill="#000000"');
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  await new Promise<void>((ok, erro) => { img.onload = () => ok(); img.onerror = () => erro(new Error('logo')); img.src = url; });
  const W = 1130, H = Math.round(W * 1050 / 2260);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  c.getContext('2d')!.drawImage(img, 0, 0, W, H);
  URL.revokeObjectURL(url);
  logoCache = { url: c.toDataURL('image/png'), proporcao: H / W };
  return logoCache;
}

/**
 * QR em retângulos vetoriais (nítido na laser). Usa o qrcode.react, que o
 * sistema já tem: o SVG dele traz cada trecho preto de uma linha como
 * "M x y h largura v1 H x z", e cada trecho vira um retângulo no PDF.
 */
function desenharQr(doc: jsPDF, texto: string, x: number, y: number, lado: number) {
  const svg = renderToStaticMarkup(createElement(QRCodeSVG, { value: texto, level: 'M', marginSize: 0 }));
  const n = Number(/viewBox="0 0 (\d+)/.exec(svg)?.[1]);
  const preto = /fill="#000000" d="([^"]+)"/.exec(svg)?.[1];
  if (!n || !preto) throw new Error('Não consegui gerar o QR code.');
  const m = lado / n;
  doc.setFillColor(0, 0, 0);
  for (const t of preto.matchAll(/M\s*(\d+)[\s,]+(\d+)\s*h(\d+)v1H\d+z/g)) {
    doc.rect(x + Number(t[1]) * m, y + Number(t[2]) * m, Number(t[3]) * m + 0.02, m + 0.02, 'F');
  }
}

/** Texto que cabe na largura: quebra em até `linhas` linhas e corta o resto com reticências. */
function caber(doc: jsPDF, texto: string, largura: number, linhas: number): string[] {
  const partes = doc.splitTextToSize(texto, largura) as string[];
  if (partes.length <= linhas) return partes;
  const r = partes.slice(0, linhas);
  let ultima = r[linhas - 1];
  while (ultima.length > 1 && doc.getTextWidth(ultima + '…') > largura) ultima = ultima.slice(0, -1);
  r[linhas - 1] = ultima.trimEnd() + '…';
  return r;
}

function desenharIngresso(doc: jsPDF, x: number, y: number, a: AjustePapel, ev: DadosEvento, ing: DadosIngresso, logo: { url: string; proporcao: number }) {
  doc.setTextColor(0, 0, 0);
  const topo = y + BANDA + 0.8;
  const base = y + a.altura - BANDA - 0.8;
  const meio = (topo + base) / 2;

  // ── canhoto (até a faixa holográfica) ──
  const cx = x + 2.5, cl = a.faixa - 4.5;
  doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5);
  doc.text('CANHOTO', cx, topo + 2);
  doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
  doc.text(`Nº ${numeroTxt(ing.numero)}`, cx, topo + 8);
  doc.setFont('helvetica', 'normal'); doc.setFontSize(6);
  const nomeC = caber(doc, ev.nome.toUpperCase(), cl, 3);
  doc.text(nomeC, cx, topo + 12.5, { lineHeightFactor: 1.15 });
  doc.setFont('helvetica', 'bold'); doc.setFontSize(6.5);
  doc.text(dataCurta(ev.data).slice(4), cx, base - 0.5);

  // ── ingresso ──
  const ix = x + a.faixa + LARGURA_FAIXA;           // depois da faixa holográfica
  const seloX = x + a.largura - SELO_DA_DIREITA;     // centro do círculo
  const fim = seloX - QR / 2 - 2.5;                  // texto termina antes do QR
  const lt = fim - ix;

  const lw = 13, lh = lw * logo.proporcao;
  doc.addImage(logo.url, 'PNG', ix, topo - 0.3, lw, lh, 'logo-ditado', 'FAST');
  doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
  doc.text(`Nº ${numeroTxt(ing.numero)}`, fim, topo + 3.2, { align: 'right' });

  doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
  const nome = caber(doc, ev.nome.toUpperCase(), lt, 2);
  doc.text(nome, ix, topo + lh + 3.6, { lineHeightFactor: 1.1 });
  const depoisNome = topo + lh + 3.6 + (nome.length - 1) * 3.7;

  doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5);
  const quando = [dataCurta(ev.data), horaCurta(ev.horario)].filter(Boolean).join(' · ');
  doc.text(quando, ix, depoisNome + 3.8);

  if (ing.valor != null && ing.valor > 0) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10);
    doc.text(brl(ing.valor), ix, depoisNome + 8.3);
  }
  if (ev.frase) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(5.5);
    doc.text(caber(doc, ev.frase, lt, 2), ix, base - (doc.splitTextToSize(ev.frase, lt).length > 1 ? 2.3 : 0), { lineHeightFactor: 1.15 });
  }

  // ── QR no círculo ──
  desenharQr(doc, linkIngresso(ing.codigo), seloX - QR / 2, meio - QR / 2, QR);
  // código por extenso: se o QR estragar, a portaria digita
  doc.setFont('courier', 'bold'); doc.setFontSize(5.5);
  doc.text(ing.codigo, seloX, meio + QR / 2 + 2.4, { align: 'center' });
}

function origem(a: AjustePapel, posicao: number) {
  const col = posicao % COLUNAS, lin = Math.floor(posicao / COLUNAS);
  return { x: a.dx + col * a.largura, y: a.dy + lin * a.altura };
}

/**
 * PDF A4 com os ingressos. `inicio` (0–11) é a primeira posição livre da
 * primeira folha, para aproveitar folha já usada em parte.
 */
export async function gerarIngressosPdf(ev: DadosEvento, ingressos: DadosIngresso[], a: AjustePapel, inicio = 0): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const logo = await logoPreto();
  let pos = Math.max(0, Math.min(POR_FOLHA - 1, inicio));
  ingressos.forEach((ing, i) => {
    if (i > 0 && pos === 0) doc.addPage();
    const { x, y } = origem(a, pos);
    desenharIngresso(doc, x, y, a, ev, ing, logo);
    pos = (pos + 1) % POR_FOLHA;
  });
  return doc;
}

/**
 * Folha de teste: contorno de cada ingresso, faixa holográfica, círculo e
 * réguas em mm, com um ingresso de exemplo. Imprime em papel comum e põe
 * contra a luz em cima do papel moeda para ver quanto ajustar.
 */
export async function gerarFolhaTeste(a: AjustePapel): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const logo = await logoPreto();
  doc.setDrawColor(0, 0, 0);

  // réguas na borda de cima e da esquerda (sem deslocamento: medem a folha)
  doc.setLineWidth(0.15); doc.setFont('helvetica', 'normal'); doc.setFontSize(4.5); doc.setTextColor(0, 0, 0);
  for (let mm = 5; mm <= 205; mm++) {
    const t = mm % 10 === 0 ? 3 : mm % 5 === 0 ? 2 : 1;
    doc.line(mm, 5, mm, 5 + t);
    if (mm % 10 === 0) doc.text(String(mm), mm, 10.2, { align: 'center' });
  }
  for (let mm = 5; mm <= 292; mm++) {
    const t = mm % 10 === 0 ? 3 : mm % 5 === 0 ? 2 : 1;
    doc.line(5, mm, 5 + t, mm);
    if (mm % 10 === 0) doc.text(String(mm), 9, mm + 1.5);
  }

  const ev: DadosEvento = { nome: 'Teste de alinhamento', data: new Date().toISOString().slice(0, 10), horario: '19:00', frase: 'Folha de teste. Confira se as linhas batem com o papel moeda.' };
  for (let p = 0; p < POR_FOLHA; p++) {
    const { x, y } = origem(a, p);
    doc.setLineWidth(0.25);
    doc.rect(x, y, a.largura, a.altura);                                   // contorno do ingresso
    doc.setLineDashPattern([1, 1], 0);
    doc.line(x, y + BANDA, x + a.largura, y + BANDA);                       // faixas decoradas
    doc.line(x, y + a.altura - BANDA, x + a.largura, y + a.altura - BANDA);
    doc.rect(x + a.faixa, y, LARGURA_FAIXA - 1, a.altura);                  // faixa holográfica
    doc.setLineDashPattern([], 0);
    doc.circle(x + a.largura - SELO_DA_DIREITA, y + a.altura / 2, 9.5);     // círculo
    // exemplo na posição 4 (longe das réguas)
    if (p === 3) desenharIngresso(doc, x, y, a, ev, { numero: 4, codigo: 'TESTE', valor: 35 }, logo);
    else {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14);
      doc.text(String(p + 1), x + a.faixa + LARGURA_FAIXA + 4, y + a.altura / 2 + 2);
    }
  }
  return doc;
}

/** Abre o PDF numa aba nova para imprimir. */
export function abrirPdf(doc: jsPDF, nomeArquivo: string) {
  const url = doc.output('bloburl') as unknown as string;
  const aba = window.open(url, '_blank');
  if (!aba) doc.save(nomeArquivo);
}
