import { jsPDF } from 'jspdf';
import type { Bloco, Trecho } from './contratoFeijoada';
import { CONTRATADA } from './contratoFeijoada';

/**
 * Desenha o contrato em PDF (A4), com parágrafos justificados e negrito no
 * meio do texto. O PDF sai sem assinatura: as partes assinam no gov.br.
 */

const MARGEM_X = 22, MARGEM_TOPO = 22, MARGEM_BAIXO = 22;
const LARGURA = 210 - 2 * MARGEM_X;
const CORPO = 10.5, ENTRELINHA = 5.1;
const RECUO_ITEM = 6;

type Palavra = { t: string; b: boolean; w: number };

// getTextWidth desconta o kerning (ex.: "TA", "AT"), mas o texto é desenhado
// sem ele: medindo letra a letra a palavra em maiúsculas não come o espaço.
function medir(doc: jsPDF, t: string, b: boolean) {
  doc.setFont('helvetica', b ? 'bold' : 'normal');
  let w = 0;
  for (const ch of t) w += doc.getTextWidth(ch);
  return w;
}

function quebrar(doc: jsPDF, trechos: Trecho[], largura: number): Palavra[][] {
  const palavras: Palavra[] = [];
  for (const tr of trechos) {
    // um trecho pode começar ou terminar no meio de uma palavra ("(b)negrito,(n) resto")
    // espaço comum quebra a linha; o não separável (o de "R$ 35,00") não
    const pedacos = tr.t.split(/([ \t\n]+)/);
    for (const p of pedacos) {
      if (!p) continue;
      if (/^[ \t\n]+$/.test(p)) { palavras.push({ t: ' ', b: !!tr.b, w: 0 }); continue; }
      const t = p.replace(/\u00a0/g, ' ');
      palavras.push({ t, b: !!tr.b, w: medir(doc, t, !!tr.b) });
    }
  }
  // junta pedaços colados (sem espaço entre eles) numa "palavra" só para a quebra
  const grupos: Palavra[][] = [];
  let atual: Palavra[] = [];
  for (const p of palavras) {
    if (p.t === ' ') { if (atual.length) grupos.push(atual); atual = []; continue; }
    atual.push(p);
  }
  if (atual.length) grupos.push(atual);

  doc.setFont('helvetica', 'normal');
  const espaco = doc.getTextWidth(' ');
  const linhas: Palavra[][][] = [];
  let linha: Palavra[][] = [], w = 0;
  for (const g of grupos) {
    const gw = g.reduce((s, p) => s + p.w, 0);
    if (linha.length && w + espaco + gw > largura) { linhas.push(linha); linha = []; w = 0; }
    w += (linha.length ? espaco : 0) + gw;
    linha.push(g);
  }
  if (linha.length) linhas.push(linha);
  // cada linha: grupos separados por um marcador de espaço
  return linhas.map(l => l.flatMap((g, i) => (i ? [{ t: ' ', b: false, w: espaco }, ...g] : g)));
}

function desenharLinha(doc: jsPDF, linha: Palavra[], x: number, y: number, largura: number, justificar: boolean) {
  const espacos = linha.filter(p => p.t === ' ').length;
  const ocupado = linha.reduce((s, p) => s + p.w, 0);
  const extra = justificar && espacos ? (largura - ocupado) / espacos : 0;
  let cx = x;
  for (const p of linha) {
    if (p.t === ' ') { cx += p.w + extra; continue; }
    doc.setFont('helvetica', p.b ? 'bold' : 'normal');
    doc.text(p.t, cx, y);
    cx += p.w;
  }
}

export function gerarContratoPdf(blocos: Bloco[], rodape: string): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.setProperties({ title: 'Contrato de evento – Feijoada', author: `${CONTRATADA.razao} – ${CONTRATADA.fantasia}`, creator: 'Ditado Popular' });
  doc.setTextColor(25, 25, 25);
  let y = MARGEM_TOPO;
  const fim = 297 - MARGEM_BAIXO;
  const novaPagina = () => { doc.addPage(); y = MARGEM_TOPO; };
  const garantir = (mm: number) => { if (y + mm > fim) novaPagina(); };

  const paragrafo = (trechos: Trecho[], recuo = 0, marcador?: string) => {
    doc.setFontSize(CORPO);
    const linhas = quebrar(doc, trechos, LARGURA - recuo);
    linhas.forEach((l, i) => {
      garantir(ENTRELINHA);
      if (i === 0 && marcador) { doc.setFont('helvetica', 'normal'); doc.text(marcador, MARGEM_X + 1.5, y); }
      desenharLinha(doc, l, MARGEM_X + recuo, y, LARGURA - recuo, i < linhas.length - 1);
      y += ENTRELINHA;
    });
  };

  for (let k = 0; k < blocos.length; k++) {
    const b = blocos[k];
    switch (b.tipo) {
      case 'titulo': {
        doc.setFont('helvetica', 'bold'); doc.setFontSize(12.5);
        const linhas = doc.splitTextToSize(b.texto, LARGURA - 10) as string[];
        garantir(linhas.length * 6 + 6);
        for (const l of linhas) { doc.text(l, 105, y, { align: 'center' }); y += 6; }
        y += 5;
        break;
      }
      case 'clausula': {
        // título da cláusula não fica sozinho no pé da página
        garantir(ENTRELINHA * 3 + 4);
        y += 3;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(CORPO);
        doc.text(b.texto, MARGEM_X, y);
        y += ENTRELINHA + 0.8;
        break;
      }
      case 'subtitulo': {
        garantir(ENTRELINHA * 3);
        y += 2.5;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(CORPO);
        doc.text(b.texto, MARGEM_X, y);
        y += ENTRELINHA + 0.5;
        break;
      }
      case 'paragrafo':
        paragrafo(b.trechos);
        y += 1.6;
        break;
      case 'item':
        paragrafo(b.trechos, RECUO_ITEM, '•');
        y += 0.8;
        break;
      case 'espaco':
        y += b.mm;
        break;
      case 'quebra':
        novaPagina();
        break;
      case 'assinaturas': {
        garantir(78);
        y += 6;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(CORPO);
        doc.text(b.local, MARGEM_X, y);
        y += 26;
        const assinatura = (rotulo: string, nome: string, docum: string) => {
          doc.setDrawColor(60); doc.setLineWidth(0.3);
          doc.line(MARGEM_X, y, MARGEM_X + 105, y);
          y += 5;
          doc.setFont('helvetica', 'bold'); doc.text(rotulo, MARGEM_X, y); y += 5;
          doc.setFont('helvetica', 'normal');
          if (nome) { doc.text(nome, MARGEM_X, y); y += 5; }
          if (docum) { doc.text(docum, MARGEM_X, y); y += 5; }
        };
        assinatura('CONTRATANTE', b.contratante, b.docContratante ? `${b.docContratante.length > 14 ? 'CNPJ' : 'CPF'} ${b.docContratante}` : '');
        y += 18;
        assinatura('CONTRATADA', `${CONTRATADA.razao} – ${CONTRATADA.fantasia}`, `CNPJ ${CONTRATADA.cnpj}`);
        break;
      }
    }
  }

  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(120);
    doc.text(rodape, MARGEM_X, 297 - 10);
    doc.text(`Página ${i} de ${total}`, 210 - MARGEM_X, 297 - 10, { align: 'right' });
  }
  return doc;
}
