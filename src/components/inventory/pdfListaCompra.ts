import jsPDF from 'jspdf';
import { supabase } from '../../lib/supabase';
import { fmtQtd, fmtMoeda, fmtData } from './comprasShared';

/**
 * PDF da lista de compras, no mesmo desenho da planilha da tela:
 * blocos por categoria e colunas Produto · Un · Central · Comprar ·
 * Comprado · Loja/Origem · Preço · Total. Serve para a lista aberta
 * (levar impressa) e para a concluída (o que foi comprado, onde e por quanto).
 */

interface ItemPdf {
  nome: string; categoria: string; um: string;
  estoque: number | null; quantidade: number; preco: number; estimado: number;
  comprado: boolean; loja: string | null; observacao: string | null;
  quantidade_comprada: number | null; preco_pago: number | null; valor_pago: number | null;
  nao_encontrado: boolean;
}

interface ListaPdf {
  numero: string; titulo: string; tipo: 'rua' | 'fornecedor'; status: string;
  fornecedor_nome: string | null; fornecedor_tel: string | null;
  data: string; itens: number; comprados: number; nao_encontrados: number;
  valor: number; valor_pago: number; observacoes: string | null; concluido_em: string | null;
}

const STATUS: Record<string, string> = { aberta: 'Aberta', em_andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada' };
const SEM_CATEGORIA = 'Sem categoria';

const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const numOuNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const txt = (v: unknown) => (v === null || v === undefined ? null : String(v));

function fmtDataHora(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export async function gerarPdfListaCompra(listaId: string): Promise<void> {
  const { data, error } = await supabase.rpc('fn_lista_publica', { p_lista_id: listaId });
  if (error) throw error;
  const raw = (data || null) as Record<string, unknown> | null;
  if (!raw || !raw.lista) throw new Error('Lista não encontrada');

  const l = raw.lista as Record<string, unknown>;
  const lista: ListaPdf = {
    numero: String(l.numero ?? ''), titulo: String(l.titulo ?? ''),
    tipo: l.tipo === 'fornecedor' ? 'fornecedor' : 'rua', status: String(l.status ?? ''),
    fornecedor_nome: txt(l.fornecedor_nome), fornecedor_tel: txt(l.fornecedor_tel),
    data: String(l.data ?? ''), itens: num(l.itens), comprados: num(l.comprados), nao_encontrados: num(l.nao_encontrados),
    valor: num(l.valor), valor_pago: num(l.valor_pago), observacoes: txt(l.observacoes), concluido_em: txt(l.concluido_em),
  };
  const itens: ItemPdf[] = (Array.isArray(raw.itens) ? (raw.itens as Record<string, unknown>[]) : []).map(i => ({
    nome: String(i.nome ?? '').trim(), categoria: (String(i.categoria ?? '')).trim() || SEM_CATEGORIA, um: String(i.um ?? ''),
    estoque: numOuNull(i.estoque), quantidade: num(i.quantidade), preco: num(i.preco), estimado: num(i.estimado),
    comprado: Boolean(i.comprado), loja: txt(i.loja_nome) || txt(i.loja), observacao: txt(i.observacao),
    quantidade_comprada: numOuNull(i.quantidade_comprada), preco_pago: numOuNull(i.preco_pago), valor_pago: numOuNull(i.valor_pago),
    nao_encontrado: Boolean(i.nao_encontrado),
  }));

  // Blocos por categoria, em ordem alfabética; itens por nome.
  const blocos = new Map<string, ItemPdf[]>();
  for (const it of itens) (blocos.get(it.categoria) ?? blocos.set(it.categoria, []).get(it.categoria)!).push(it);
  const categorias = [...blocos.keys()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  for (const c of categorias) blocos.get(c)!.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const rua = lista.tipo === 'rua';
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pw = pdf.internal.pageSize.getWidth();
  const ph = pdf.internal.pageSize.getHeight();
  const mx = 12;
  const largura = pw - mx * 2;

  // Colunas (x). Direita = alinhado à direita nesse x.
  const col = {
    produto: mx + 2, un: mx + 100, central: mx + 128, comprar: mx + 150,
    comprado: mx + 174, loja: mx + 178, preco: mx + 246, total: mx + largura - 2,
  };
  const lojaLargura = col.preco - 22 - col.loja;

  const cabecalhoTitulo = rua ? 'Lista da Rua' : `Pedido · ${lista.fornecedor_nome || 'fornecedor'}`;
  const totalTitulo = rua && lista.valor_pago > 0 ? 'Pago' : 'Total';

  let y = 0;
  const cabecalhoPagina = (primeira: boolean) => {
    y = 14;
    if (primeira) {
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15);
      pdf.text(`Ditado Popular — ${cabecalhoTitulo}`, mx, y);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(90);
      pdf.text(`${lista.titulo} · ${lista.numero}`, pw - mx, y, { align: 'right' });
      y += 6;
      const linha2 = [
        `Data: ${fmtData(lista.data)}`,
        `Status: ${STATUS[lista.status] || lista.status}`,
        lista.concluido_em ? `Concluída em ${fmtDataHora(lista.concluido_em)}` : '',
        !rua && lista.fornecedor_tel ? `Tel: ${lista.fornecedor_tel}` : '',
      ].filter(Boolean).join('   ·   ');
      pdf.text(linha2, mx, y);
      y += 5;
      if (lista.observacoes) { pdf.text(`Obs: ${lista.observacoes}`, mx, y); y += 5; }
      pdf.setTextColor(0);
      pdf.setDrawColor(200); pdf.line(mx, y, pw - mx, y); y += 6;
    }
    // Cabeçalho da tabela
    pdf.setFillColor(235, 235, 235); pdf.rect(mx, y - 4.5, largura, 7, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(60);
    pdf.text('Produto', col.produto, y);
    pdf.text('Un', col.un, y);
    pdf.text('Central', col.central, y, { align: 'right' });
    pdf.text('Comprar', col.comprar, y, { align: 'right' });
    pdf.text('Comprado', col.comprado, y, { align: 'right' });
    pdf.text(rua ? 'Loja' : 'Observação', col.loja + 6, y);
    pdf.text('Preço', col.preco, y, { align: 'right' });
    pdf.text(totalTitulo, col.total, y, { align: 'right' });
    pdf.setTextColor(0); pdf.setFont('helvetica', 'normal');
    y += 6.5;
  };

  const garantirEspaco = (alturaLinha: number) => {
    if (y + alturaLinha > ph - 14) { pdf.addPage(); cabecalhoPagina(false); }
  };

  const rodapePaginas = () => {
    const n = pdf.getNumberOfPages();
    for (let p = 1; p <= n; p += 1) {
      pdf.setPage(p);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(7.5); pdf.setTextColor(130);
      pdf.text(`Gerado em ${new Date().toLocaleString('pt-BR')}`, mx, ph - 7);
      pdf.text(`Página ${p} de ${n}`, pw - mx, ph - 7, { align: 'right' });
      pdf.setTextColor(0);
    }
  };

  cabecalhoPagina(true);

  let zebra = 0;
  for (const categoria of categorias) {
    const lista_ = blocos.get(categoria)!;
    garantirEspaco(13);
    // Bloco da categoria
    pdf.setFillColor(112, 27, 40); pdf.rect(mx, y - 4.2, largura, 6.2, 'F');
    pdf.setFont('helvetica', 'bold'); pdf.setFontSize(8.5); pdf.setTextColor(255);
    pdf.text(`${categoria.toUpperCase()}  ·  ${lista_.length} ${lista_.length === 1 ? 'item' : 'itens'}`, col.produto, y);
    pdf.setTextColor(0); pdf.setFont('helvetica', 'normal');
    y += 6.5;

    for (const it of lista_) {
      const lojaTxt = rua ? (it.nao_encontrado ? 'não achou' : it.loja || '') : (it.observacao || '');
      const lojaLinhas = pdf.splitTextToSize(lojaTxt, lojaLargura) as string[];
      const nomeLinhas = pdf.splitTextToSize(it.nome, col.un - col.produto - 3) as string[];
      const altura = Math.max(1, lojaLinhas.length, nomeLinhas.length) * 4.2 + 2.2;
      garantirEspaco(altura);

      if (zebra % 2 === 0) { pdf.setFillColor(248, 248, 248); pdf.rect(mx, y - 3.8, largura, altura, 'F'); }
      zebra += 1;

      pdf.setFontSize(8.5);
      if (it.nao_encontrado) pdf.setTextColor(170, 60, 60);
      pdf.text(nomeLinhas, col.produto, y);
      pdf.text(it.um, col.un, y);
      pdf.text(it.estoque === null ? '—' : fmtQtd(it.estoque), col.central, y, { align: 'right' });
      pdf.text(fmtQtd(it.quantidade), col.comprar, y, { align: 'right' });

      const compradoTxt = it.nao_encontrado ? '—'
        : it.comprado ? fmtQtd(it.quantidade_comprada ?? it.quantidade)
        : '';
      pdf.setFont('helvetica', it.comprado ? 'bold' : 'normal');
      pdf.text(compradoTxt, col.comprado, y, { align: 'right' });
      pdf.setFont('helvetica', 'normal');

      if (lojaTxt) pdf.text(lojaLinhas, col.loja + 6, y);

      const preco = it.preco_pago ?? (it.preco > 0 ? it.preco : null);
      const total = it.valor_pago ?? (it.comprado && it.preco_pago == null ? it.estimado : it.nao_encontrado ? null : it.estimado);
      pdf.text(preco === null ? '' : fmtMoeda(preco), col.preco, y, { align: 'right' });
      pdf.text(total === null ? '' : fmtMoeda(total), col.total, y, { align: 'right' });
      pdf.setTextColor(0);
      y += altura;
    }
    y += 1.5;
  }

  // Totais
  garantirEspaco(18);
  pdf.setDrawColor(200); pdf.line(mx, y - 2, pw - mx, y - 2); y += 3;
  pdf.setFont('helvetica', 'bold'); pdf.setFontSize(9);
  const partes = [
    `${lista.itens} ${lista.itens === 1 ? 'item' : 'itens'}`,
    `${lista.comprados} ${lista.comprados === 1 ? 'comprado' : 'comprados'}`,
    rua && lista.nao_encontrados > 0 ? `${lista.nao_encontrados} não achou` : '',
    `Estimado: ${fmtMoeda(lista.valor)}`,
    rua && lista.valor_pago > 0 ? `Pago: ${fmtMoeda(lista.valor_pago)}` : '',
  ].filter(Boolean);
  pdf.text(partes.join('     ·     '), mx, y);
  if (rua && lista.valor_pago > 0 && lista.valor > 0) {
    const dif = lista.valor_pago - lista.valor;
    pdf.setFont('helvetica', 'normal'); pdf.setFontSize(8.5); pdf.setTextColor(dif > 0 ? 170 : 40, dif > 0 ? 60 : 130, dif > 0 ? 60 : 60);
    pdf.text(`${dif > 0 ? '+' : ''}${fmtMoeda(dif)} em relação ao estimado`, pw - mx, y, { align: 'right' });
    pdf.setTextColor(0);
  }

  rodapePaginas();

  const nomeArq = `${rua ? 'lista-rua' : 'pedido-' + (lista.fornecedor_nome || 'fornecedor').toLowerCase().replace(/[^a-z0-9]+/gi, '-')}-${lista.data}-${lista.numero}.pdf`;
  pdf.save(nomeArq);
}
