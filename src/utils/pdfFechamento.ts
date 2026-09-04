import jsPDF from 'jspdf';
import dayjs from 'dayjs';

/**
 * Relatório de Fechamento de Sócios em PDF, em três níveis:
 *   simplificado — só os grupos (o que o sócio lê em um minuto)
 *   analítico    — grupos abertos em categorias
 *   completo     — analítico + o extrato de todos os lançamentos do período
 *
 * Feito direto com jsPDF (sem plugin de tabela): cabeçalho com a marca,
 * quatro números, tabelas com zebra e quebra de página, rodapé numerado.
 */

export type NivelRelatorio = 'simplificado' | 'analitico' | 'completo';

export interface FechamentoCategoria { nome: string; total: number; qtd: number }
export interface FechamentoGrupo { id: string; nome: string; grupo_dre: string | null; total: number; qtd: number; categorias: FechamentoCategoria[] }
export interface FechamentoBloco { total: number; grupos: FechamentoGrupo[]; sem_categoria: { total: number; qtd: number } }
export interface FechamentoConta { id: string; banco: string; tipo: string; saldo: number }
export interface FechamentoExtratoLinha {
  data: string; tipo: 'entrada' | 'saida'; valor: number; descricao: string | null;
  grupo: string | null; categoria: string | null; conta: string | null; forma: string | null; origem: string | null;
}
export interface FechamentoDados {
  periodo: { inicio: string; fim: string; dias: number };
  saldo_inicial: { total: number; contas: FechamentoConta[] };
  saldo_final: { total: number; contas: FechamentoConta[] };
  entradas: FechamentoBloco;
  saidas: FechamentoBloco;
  transferencias: { entradas: number; saidas: number; liquido: number };
  sem_conta: { liquido: number; qtd: number };
  extrato?: FechamentoExtratoLinha[] | null;
  anterior: { inicio: string; fim: string; saldo_inicial: number; entradas: number; saidas: number; saldo_final: number } | null;
}

type RGB = [number, number, number];
export interface LinhaTabela { celulas: string[]; estilo?: 'grupo' | 'categoria' | 'total' | 'aviso' | 'normal'; cor?: RGB }

const VINHO: RGB = [125, 31, 44];
const DOURADO: RGB = [212, 175, 55];
const TINTA: [number, number, number] = [31, 27, 26];
const CINZA: [number, number, number] = [110, 104, 100];
const CINZA_CLARO: [number, number, number] = [236, 233, 228];
const ZEBRA: [number, number, number] = [249, 248, 245];
const VERDE: [number, number, number] = [5, 122, 85];
const VERMELHO: [number, number, number] = [185, 28, 28];
const AMBAR: [number, number, number] = [180, 83, 9];

const n = (v: unknown) => Number(v) || 0;
const brl = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0).replace(/\u00A0/g, ' ');
const fmt = (d: string) => dayjs(d).format('DD/MM/YYYY');
const pct = (parte: number, todo: number) => (todo > 0 ? `${Math.round((parte / todo) * 100)}%` : '');

const A4 = { w: 210, h: 297, margem: 16 };

class Pagina {
  doc: jsPDF;
  y = 0;
  private readonly topo = 22;
  private readonly rodape = 16;
  constructor(private titulo: string, private subtitulo: string) {
    this.doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    this.novaPagina(true);
  }

  get largura() { return A4.w - A4.margem * 2; }
  get limite() { return A4.h - this.rodape; }

  novaPagina(primeira = false) {
    if (!primeira) this.doc.addPage();
    // faixa da marca
    this.doc.setFillColor(...VINHO);
    this.doc.rect(0, 0, A4.w, 14, 'F');
    this.doc.setFillColor(...DOURADO);
    this.doc.rect(0, 14, A4.w, 0.8, 'F');
    this.doc.setTextColor(255, 255, 255);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(11);
    this.doc.text('DITADO POPULAR', A4.margem, 9);
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    this.doc.text(`${this.titulo}  ·  ${this.subtitulo}`, A4.w - A4.margem, 9, { align: 'right' });
    this.y = this.topo;
  }

  garantir(altura: number) {
    if (this.y + altura > this.limite) this.novaPagina();
  }

  titulo1(texto: string) {
    this.garantir(16);
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(18);
    this.doc.setTextColor(...TINTA);
    this.doc.text(texto, A4.margem, this.y + 6);
    this.y += 10;
  }

  paragrafo(texto: string, cor: [number, number, number] = CINZA, tamanho = 9.5) {
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(tamanho);
    this.doc.setTextColor(...cor);
    const linhas = this.doc.splitTextToSize(texto, this.largura) as string[];
    this.garantir(linhas.length * tamanho * 0.45 + 2);
    this.doc.text(linhas, A4.margem, this.y + 4);
    this.y += linhas.length * tamanho * 0.45 + 3;
  }

  secao(texto: string, valor?: string, cor: [number, number, number] = TINTA) {
    this.garantir(14);
    this.y += 4;
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(12.5);
    this.doc.setTextColor(...TINTA);
    this.doc.text(texto, A4.margem, this.y + 5);
    if (valor) {
      this.doc.setTextColor(...cor);
      this.doc.text(valor, A4.w - A4.margem, this.y + 5, { align: 'right' });
    }
    this.doc.setDrawColor(...DOURADO);
    this.doc.setLineWidth(0.5);
    this.doc.line(A4.margem, this.y + 7.5, A4.w - A4.margem, this.y + 7.5);
    this.y += 10;
  }

  /** Os quatro números do fechamento, lado a lado. */
  cartoes(itens: { rotulo: string; valor: string; nota?: string; cor?: [number, number, number]; destaque?: boolean }[]) {
    const gap = 4;
    const w = (this.largura - gap * (itens.length - 1)) / itens.length;
    const h = 24;
    this.garantir(h + 4);
    itens.forEach((it, i) => {
      const x = A4.margem + i * (w + gap);
      if (it.destaque) {
        this.doc.setFillColor(...VINHO);
        this.doc.roundedRect(x, this.y, w, h, 2, 2, 'F');
      } else {
        this.doc.setFillColor(...ZEBRA);
        this.doc.setDrawColor(...CINZA_CLARO);
        this.doc.roundedRect(x, this.y, w, h, 2, 2, 'FD');
      }
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(7);
      this.doc.setTextColor(...(it.destaque ? [255, 220, 180] as [number, number, number] : CINZA));
      this.doc.text(it.rotulo.toUpperCase(), x + 4, this.y + 6);
      this.doc.setFontSize(12.5);
      this.doc.setTextColor(...(it.destaque ? [255, 255, 255] as [number, number, number] : (it.cor ?? TINTA)));
      this.doc.text(it.valor, x + 4, this.y + 14);
      if (it.nota) {
        this.doc.setFont('helvetica', 'normal');
        this.doc.setFontSize(6.5);
        this.doc.setTextColor(...(it.destaque ? [255, 235, 210] as [number, number, number] : CINZA));
        this.doc.text(this.doc.splitTextToSize(it.nota, w - 8)[0], x + 4, this.y + 20);
      }
    });
    this.y += h + 4;
  }

  /**
   * Tabela com cabeçalho repetido a cada página. `larguras` em mm; a última
   * coluna com largura 0 ocupa o que sobrar. Colunas numéricas alinhadas à
   * direita quando `alinhar[i] === 'right'`.
   */
  tabela(opts: {
    colunas: string[]; larguras: number[]; alinhar?: ('left' | 'right')[];
    linhas: LinhaTabela[];
    zebra?: boolean;
  }) {
    const { colunas, alinhar = [], linhas, zebra = true } = opts;
    const sobra = this.largura - opts.larguras.reduce((s, w) => s + w, 0);
    const larguras = opts.larguras.map(w => (w === 0 ? sobra : w));
    const xs: number[] = [];
    let acc = A4.margem;
    larguras.forEach(w => { xs.push(acc); acc += w; });

    const cabecalho = () => {
      this.doc.setFillColor(...CINZA_CLARO);
      this.doc.rect(A4.margem, this.y, this.largura, 6.5, 'F');
      this.doc.setFont('helvetica', 'bold');
      this.doc.setFontSize(7.5);
      this.doc.setTextColor(...CINZA);
      colunas.forEach((c, i) => {
        const dir = alinhar[i] === 'right';
        this.doc.text(c.toUpperCase(), dir ? xs[i] + larguras[i] - 2 : xs[i] + 2, this.y + 4.4, { align: dir ? 'right' : 'left' });
      });
      this.y += 6.5;
    };

    this.garantir(6.5 + 7);
    cabecalho();

    linhas.forEach((l, idx) => {
      const estilo = l.estilo ?? 'normal';
      const tam = estilo === 'categoria' ? 8 : 8.5;
      this.doc.setFontSize(tam);
      // altura: a maior coluna quebrada
      const quebradas = l.celulas.map((c, i) => this.doc.splitTextToSize(c ?? '', larguras[i] - 4) as string[]);
      const nLinhas = Math.max(1, ...quebradas.map(q => q.length));
      const h = nLinhas * tam * 0.42 + 3;
      if (this.y + h > this.limite) { this.novaPagina(); cabecalho(); }

      if (estilo === 'total') {
        this.doc.setFillColor(...ZEBRA);
        this.doc.rect(A4.margem, this.y, this.largura, h, 'F');
        this.doc.setDrawColor(...TINTA);
        this.doc.setLineWidth(0.3);
        this.doc.line(A4.margem, this.y, A4.w - A4.margem, this.y);
      } else if (estilo === 'aviso') {
        this.doc.setFillColor(255, 247, 230);
        this.doc.rect(A4.margem, this.y, this.largura, h, 'F');
      } else if (zebra && idx % 2 === 1 && estilo !== 'categoria') {
        this.doc.setFillColor(...ZEBRA);
        this.doc.rect(A4.margem, this.y, this.largura, h, 'F');
      }

      this.doc.setFont('helvetica', estilo === 'grupo' || estilo === 'total' ? 'bold' : 'normal');
      this.doc.setTextColor(...(l.cor ?? (estilo === 'categoria' ? CINZA : estilo === 'aviso' ? AMBAR : TINTA)));
      quebradas.forEach((q, i) => {
        const dir = alinhar[i] === 'right';
        const recuo = estilo === 'categoria' && i === 0 ? 6 : 0;
        this.doc.text(q, dir ? xs[i] + larguras[i] - 2 : xs[i] + 2 + recuo, this.y + tam * 0.42 + 1.2, { align: dir ? 'right' : 'left' });
      });
      this.doc.setDrawColor(...CINZA_CLARO);
      this.doc.setLineWidth(0.15);
      this.doc.line(A4.margem, this.y + h, A4.w - A4.margem, this.y + h);
      this.y += h;
    });
    this.y += 3;
  }

  rodapes(geradoEm: string) {
    const total = this.doc.getNumberOfPages();
    for (let i = 1; i <= total; i++) {
      this.doc.setPage(i);
      this.doc.setFont('helvetica', 'normal');
      this.doc.setFontSize(7.5);
      this.doc.setTextColor(...CINZA);
      this.doc.setDrawColor(...CINZA_CLARO);
      this.doc.line(A4.margem, A4.h - 11, A4.w - A4.margem, A4.h - 11);
      this.doc.text(`Gerado pelo sistema de gestão Ditado Popular em ${geradoEm} · regime de caixa`, A4.margem, A4.h - 7);
      this.doc.text(`Página ${i} de ${total}`, A4.w - A4.margem, A4.h - 7, { align: 'right' });
    }
  }
}

const ehSocio = (g: FechamentoGrupo) => g.grupo_dre === 'abaixo_da_linha';

function linhasDoBloco(bloco: FechamentoBloco, nivel: NivelRelatorio, rotuloSocios: string) {
  const todo = n(bloco.total);
  const linhas: LinhaTabela[] = [];
  const empurrar = (g: FechamentoGrupo) => {
    linhas.push({ celulas: [g.nome, String(g.qtd), pct(n(g.total), todo), brl(n(g.total))], estilo: 'grupo' });
    if (nivel !== 'simplificado') {
      const abrir = g.categorias.length > 1 || (g.categorias.length === 1 && g.categorias[0].nome !== g.nome);
      if (abrir) for (const c of g.categorias) {
        linhas.push({ celulas: [c.nome, String(c.qtd), pct(n(c.total), todo), brl(n(c.total))], estilo: 'categoria' });
      }
    }
  };
  bloco.grupos.filter(g => !ehSocio(g)).forEach(empurrar);
  const socios = bloco.grupos.filter(ehSocio);
  if (socios.length) {
    linhas.push({ celulas: [rotuloSocios, '', '', ''], estilo: 'aviso' });
    socios.forEach(empurrar);
  }
  if (n(bloco.sem_categoria.total) > 0) {
    linhas.push({ celulas: [`Sem categoria (${bloco.sem_categoria.qtd} lançamentos ainda não classificados)`, String(bloco.sem_categoria.qtd), pct(n(bloco.sem_categoria.total), todo), brl(n(bloco.sem_categoria.total))], estilo: 'aviso' });
  }
  linhas.push({ celulas: ['Total', '', '', brl(todo)], estilo: 'total' });
  return linhas;
}

export function gerarPdfFechamento(dados: FechamentoDados, nivel: NivelRelatorio) {
  const periodo = `${fmt(dados.periodo.inicio)} a ${fmt(dados.periodo.fim)}`;
  const nomeNivel = { simplificado: 'Simplificado', analitico: 'Analítico', completo: 'Completo' }[nivel];
  const pg = new Pagina('Fechamento de Sócios', periodo);

  const ini = n(dados.saldo_inicial.total);
  const fim = n(dados.saldo_final.total);
  const ent = n(dados.entradas.total);
  const sai = n(dados.saidas.total);
  const transf = n(dados.transferencias?.liquido);
  const resultado = ent - sai;

  pg.titulo1('Fechamento de Sócios');
  pg.paragrafo(`Período de ${periodo} (${dados.periodo.dias} ${dados.periodo.dias === 1 ? 'dia' : 'dias'}) · Relatório ${nomeNivel.toLowerCase()} · Regime de caixa: só o que entrou e saiu das contas neste período.`);
  pg.y += 2;

  pg.cartoes([
    { rotulo: 'Começou com', valor: brl(ini), nota: `saldo em ${dayjs(dados.periodo.inicio).subtract(1, 'day').format('DD/MM/YYYY')}` },
    { rotulo: 'Entrou', valor: `+ ${brl(ent)}`, cor: VERDE, nota: dados.anterior ? `anterior: ${brl(n(dados.anterior.entradas))}` : undefined },
    { rotulo: 'Foi pago', valor: `- ${brl(sai)}`, cor: VERMELHO, nota: dados.anterior ? `anterior: ${brl(n(dados.anterior.saidas))}` : undefined },
    { rotulo: 'Sobrou na conta', valor: brl(fim), destaque: true, nota: resultado >= 0 ? `${brl(resultado)} a mais que no início` : `${brl(Math.abs(resultado))} a menos que no início` },
  ]);

  pg.paragrafo(
    `Começou com ${brl(ini)}, entrou ${brl(ent)}, pagou ${brl(sai)}` +
    (transf !== 0 ? ` (mais ${brl(transf)} de acerto entre contas)` : '') +
    ` e terminou com ${brl(fim)}.`, TINTA, 10);

  const colunas = ['Grupo / categoria', 'Lanç.', '% do total', 'Valor'];
  const larguras = [0, 16, 20, 34];
  const alinhar: ('left' | 'right')[] = ['left', 'right', 'right', 'right'];

  pg.secao('O que entrou', brl(ent), VERDE);
  pg.tabela({ colunas, larguras, alinhar, linhas: linhasDoBloco(dados.entradas, nivel, 'Não é venda: sócios e empréstimos') });

  pg.secao('O que foi pago', brl(sai), VERMELHO);
  pg.tabela({ colunas, larguras, alinhar, linhas: linhasDoBloco(dados.saidas, nivel, 'Retiradas de sócios e empréstimos') });

  pg.secao('Onde o dinheiro está', brl(fim));
  const contas: LinhaTabela[] = dados.saldo_final.contas.map(c => {
    const antes = n(dados.saldo_inicial.contas.find(x => x.id === c.id)?.saldo);
    const depois = n(c.saldo);
    return { celulas: [`${c.banco} (${c.tipo})`, brl(antes), brl(depois), `${depois - antes > 0 ? '+' : ''}${brl(depois - antes)}`], estilo: 'normal', cor: depois < 0 ? VERMELHO : undefined };
  });
  contas.push({ celulas: ['Total', brl(ini), brl(fim), `${fim - ini > 0 ? '+' : ''}${brl(fim - ini)}`], estilo: 'total' });
  pg.tabela({ colunas: ['Conta', 'Começo do período', 'Fim do período', 'Variação'], larguras: [0, 36, 36, 34], alinhar: ['left', 'right', 'right', 'right'], linhas: contas });

  const avisos: string[] = [];
  if (transf !== 0) avisos.push(`Transferências entre contas não entram nas listas. Neste período elas não se anulam: sobra ${brl(transf)} líquido, já contado no saldo final.`);
  if (n(dados.sem_conta?.qtd) > 0) avisos.push(`${dados.sem_conta.qtd} lançamentos do período não têm conta bancária: estão nas listas, mas não movem saldo (${brl(n(dados.sem_conta.liquido))}).`);
  const esperado = ini + ent - sai + transf - n(dados.sem_conta?.liquido);
  if (Math.abs(fim - esperado) > 0.5) avisos.push(`A conta não fecha por ${brl(fim - esperado)}: há lançamentos com data ou conta a conferir no Fluxo de Caixa.`);
  if (avisos.length) { pg.y += 2; avisos.forEach(a => pg.paragrafo('• ' + a, AMBAR, 8.5)); }

  if (nivel === 'completo' && dados.extrato) {
    // ── Lançamentos por categoria: cada grupo, cada categoria, o que compõe o número ──
    const operacionais = dados.extrato.filter(l => l.origem !== 'transferencia');
    const porCategoria = (tipo: 'entrada' | 'saida', bloco: FechamentoBloco, titulo: string, cor: RGB) => {
      const linhasTipo = operacionais.filter(l => l.tipo === tipo);
      if (linhasTipo.length === 0) return;
      pg.novaPagina();
      pg.titulo1(titulo);
      pg.paragrafo('Cada grupo aberto em categorias, e cada categoria com os lançamentos que a compõem, em ordem de data.');
      const ordemGrupos = [...bloco.grupos.filter(g => !ehSocio(g)), ...bloco.grupos.filter(ehSocio)];
      const emitirCategoria = (nome: string, itens: FechamentoExtratoLinha[]) => {
        const sub = itens.reduce((s, l) => s + n(l.valor), 0);
        // nome e subtotal na coluna larga (Descrição): a de Data é estreita demais
        const linhas: LinhaTabela[] = [
          { celulas: ['', nome, `${itens.length} lanç.`, ''], estilo: 'grupo' },
          ...itens.map(l => ({ celulas: [fmt(l.data), (l.descricao || '').trim() || '—', l.conta || '—', brl(n(l.valor))], estilo: 'normal' as const })),
          { celulas: ['', `Subtotal · ${nome}`, '', brl(sub)], estilo: 'total' },
        ];
        pg.tabela({ colunas: ['Data', 'Descrição', 'Conta', 'Valor'], larguras: [20, 0, 40, 30], alinhar: ['left', 'left', 'left', 'right'], linhas, zebra: false });
      };
      for (const g of ordemGrupos) {
        const doGrupo = linhasTipo.filter(l => l.grupo === g.nome);
        if (doGrupo.length === 0) continue;
        pg.secao(ehSocio(g) ? `${g.nome} (sócios e empréstimos)` : g.nome, brl(n(g.total)), cor);
        const nomesCat = [...new Set(doGrupo.map(l => l.categoria || g.nome))];
        nomesCat.sort((a, b) => doGrupo.filter(l => (l.categoria || g.nome) === b).reduce((s, l) => s + n(l.valor), 0) - doGrupo.filter(l => (l.categoria || g.nome) === a).reduce((s, l) => s + n(l.valor), 0));
        for (const c of nomesCat) emitirCategoria(c, doGrupo.filter(l => (l.categoria || g.nome) === c));
      }
      const semCat = linhasTipo.filter(l => !l.grupo);
      if (semCat.length) {
        pg.secao('Sem categoria', brl(semCat.reduce((s, l) => s + n(l.valor), 0)), AMBAR);
        emitirCategoria('Lançamentos ainda não classificados', semCat);
      }
    };
    porCategoria('entrada', dados.entradas, 'O que entrou, por categoria', VERDE);
    porCategoria('saida', dados.saidas, 'O que foi pago, por categoria', VERMELHO);

    // ── Extrato: tudo, em ordem de data ──
    pg.novaPagina();
    pg.titulo1('Extrato de lançamentos');
    pg.paragrafo(`Todos os lançamentos de ${periodo}, em ordem de data. ${dados.extrato.length} lançamentos. Transferências entre contas aparecem marcadas e não entram nos totais acima.`);
    let totE = 0, totS = 0;
    const linhas: LinhaTabela[] = dados.extrato.map(l => {
      const transferencia = l.origem === 'transferencia';
      const v = n(l.valor);
      if (!transferencia) { if (l.tipo === 'entrada') totE += v; else totS += v; }
      const cat = [l.grupo, l.categoria && l.categoria !== l.grupo ? l.categoria : null].filter(Boolean).join(' › ') || (transferencia ? 'Transferência' : 'Sem categoria');
      return {
        celulas: [fmt(l.data), (l.descricao || '').trim() || '—', cat, l.conta || '—', l.tipo === 'entrada' ? brl(v) : '', l.tipo === 'saida' ? brl(v) : ''],
        estilo: 'normal',
        cor: transferencia ? CINZA : (l.tipo === 'entrada' ? VERDE : TINTA),
      };
    });
    linhas.push({ celulas: ['Total (sem transferências)', '', '', '', brl(totE), brl(totS)], estilo: 'total', cor: TINTA });
    pg.tabela({
      colunas: ['Data', 'Descrição', 'Grupo › categoria', 'Conta', 'Entrada', 'Saída'],
      larguras: [19, 0, 44, 26, 25, 25],
      alinhar: ['left', 'left', 'left', 'left', 'right', 'right'],
      linhas, zebra: true,
    });
  }

  const geradoEm = dayjs().format('DD/MM/YYYY [às] HH:mm');
  pg.rodapes(geradoEm);
  pg.doc.save(`fechamento-socios-${nivel}-${dayjs(dados.periodo.inicio).format('YYYY-MM-DD')}-a-${dayjs(dados.periodo.fim).format('YYYY-MM-DD')}.pdf`);
}
