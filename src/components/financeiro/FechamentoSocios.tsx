import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Download, Info, AlertTriangle, Wallet, ArrowDownToLine, ArrowUpFromLine, PiggyBank, FileText, CalendarRange } from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import { supabase } from '../../lib/supabase';
import { exportToExcel } from '../../utils/reportGenerator';
import { gerarPdfFechamento, type FechamentoDados, type FechamentoGrupo, type FechamentoBloco, type NivelRelatorio } from '../../utils/pdfFechamento';

dayjs.locale('pt-br');

/**
 * FECHAMENTO DE SÓCIOS — o período pelo que passou na conta.
 *
 * O DRE segue competência e fala em margem, CMV, EBITDA. O sócio quer saber
 * outra coisa: quanto tinha, quanto entrou, quanto foi pago, quanto sobrou.
 * Esta tela responde só isso, pelo regime de caixa, para qualquer período
 * (o mês, ou "de 01 a 04/09"), com quatro números no topo e, embaixo, de
 * onde veio e para onde foi — por grupo e categoria. A conta vem pronta do
 * banco (fn_fechamento_socios_periodo). O PDF sai em três níveis.
 */

const brl = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);
const n = (v: unknown) => Number(v) || 0;
const pct = (parte: number, todo: number) => (todo > 0 ? Math.round((parte / todo) * 100) : 0);
const ISO = 'YYYY-MM-DD';

/** Grupos "abaixo da linha": dinheiro de sócio e de empréstimo, não de operação. */
const ehSocioOuEmprestimo = (g: FechamentoGrupo) => g.grupo_dre === 'abaixo_da_linha';

type Atalho = 'mes_atual' | 'mes_passado' | 'ate_hoje' | 'ultimos_7' | 'personalizado';

function periodoDoAtalho(a: Atalho): { inicio: string; fim: string } | null {
  const hoje = dayjs();
  switch (a) {
    case 'mes_atual': return { inicio: hoje.startOf('month').format(ISO), fim: hoje.endOf('month').format(ISO) };
    case 'mes_passado': { const m = hoje.subtract(1, 'month'); return { inicio: m.startOf('month').format(ISO), fim: m.endOf('month').format(ISO) }; }
    case 'ate_hoje': return { inicio: hoje.startOf('month').format(ISO), fim: hoje.format(ISO) };
    case 'ultimos_7': return { inicio: hoje.subtract(6, 'day').format(ISO), fim: hoje.format(ISO) };
    default: return null;
  }
}

const FechamentoSocios: React.FC = () => {
  const [atalho, setAtalho] = useState<Atalho>('mes_passado');
  const [periodo, setPeriodo] = useState(() => periodoDoAtalho('mes_passado')!);
  const [dados, setDados] = useState<FechamentoDados | null>(null);
  const [loading, setLoading] = useState(true);
  const [gerandoPdf, setGerandoPdf] = useState<NivelRelatorio | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<Record<string, boolean>>({});
  const [menuPdf, setMenuPdf] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuPdf(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const periodoValido = !!periodo.inicio && !!periodo.fim && !dayjs(periodo.fim).isBefore(dayjs(periodo.inicio));

  useEffect(() => {
    if (!periodoValido) return;
    let vivo = true;
    (async () => {
      setLoading(true);
      setErro(null);
      const { data, error } = await supabase.rpc('fn_fechamento_socios_periodo', { p_inicio: periodo.inicio, p_fim: periodo.fim });
      if (!vivo) return;
      if (error) setErro(error.message);
      else setDados(data as FechamentoDados);
      setLoading(false);
    })();
    return () => { vivo = false; };
  }, [periodo, periodoValido]);

  const escolherAtalho = (a: Atalho) => {
    setAtalho(a);
    const p = periodoDoAtalho(a);
    if (p) setPeriodo(p);
  };

  const resumo = useMemo(() => {
    if (!dados) return null;
    const ini = n(dados.saldo_inicial.total);
    const fim = n(dados.saldo_final.total);
    const ent = n(dados.entradas.total);
    const sai = n(dados.saidas.total);
    const transf = n(dados.transferencias?.liquido);
    const semConta = n(dados.sem_conta?.liquido);
    // ini + ent − sai + transferências líquidas − (o que não passou por conta) = fim
    const esperado = ini + ent - sai + transf - semConta;
    return { ini, fim, ent, sai, transf, semConta, resultado: ent - sai, diferenca: fim - esperado };
  }, [dados]);

  const emAndamento = periodoValido && !dayjs(periodo.fim).isBefore(dayjs(), 'day');
  const rotuloPeriodo = periodoValido
    ? (dayjs(periodo.inicio).isSame(dayjs(periodo.inicio).startOf('month'), 'day') && dayjs(periodo.fim).isSame(dayjs(periodo.fim).endOf('month'), 'day') && dayjs(periodo.inicio).isSame(dayjs(periodo.fim), 'month')
        ? dayjs(periodo.inicio).format('MMMM [de] YYYY')
        : `${dayjs(periodo.inicio).format('DD/MM/YYYY')} a ${dayjs(periodo.fim).format('DD/MM/YYYY')}`)
    : '';

  const alternar = (id: string) => setAberto(a => ({ ...a, [id]: !a[id] }));

  const gerarPdf = async (nivel: NivelRelatorio) => {
    if (!dados) return;
    setMenuPdf(false);
    setGerandoPdf(nivel);
    try {
      let completo = dados;
      if (nivel === 'completo') {
        // o extrato só é buscado quando o relatório pede
        const { data, error } = await supabase.rpc('fn_fechamento_socios_periodo', { p_inicio: periodo.inicio, p_fim: periodo.fim, p_com_extrato: true });
        if (error) throw error;
        completo = data as FechamentoDados;
      }
      gerarPdfFechamento(completo, nivel);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setGerandoPdf(null);
    }
  };

  const exportarExcel = () => {
    if (!dados || !resumo) return;
    const linhas: (string | number)[][] = [];
    linhas.push(['Saldo em conta no início do período', '', '', resumo.ini]);
    for (const g of dados.entradas.grupos) {
      linhas.push(['Entrada', g.nome, '', n(g.total)]);
      for (const c of g.categorias) linhas.push(['Entrada', g.nome, c.nome, n(c.total)]);
    }
    if (n(dados.entradas.sem_categoria.total) > 0) linhas.push(['Entrada', 'Sem categoria', '', n(dados.entradas.sem_categoria.total)]);
    linhas.push(['Total de entradas', '', '', resumo.ent]);
    for (const g of dados.saidas.grupos) {
      linhas.push(['Saída', g.nome, '', n(g.total)]);
      for (const c of g.categorias) linhas.push(['Saída', g.nome, c.nome, n(c.total)]);
    }
    if (n(dados.saidas.sem_categoria.total) > 0) linhas.push(['Saída', 'Sem categoria', '', n(dados.saidas.sem_categoria.total)]);
    linhas.push(['Total pago', '', '', resumo.sai]);
    if (resumo.transf !== 0) linhas.push(['Transferências entre contas (líquido)', '', '', resumo.transf]);
    linhas.push(['Saldo em conta no fim do período', '', '', resumo.fim]);
    for (const c of dados.saldo_final.contas) linhas.push(['Saldo por conta', c.banco, c.tipo, n(c.saldo)]);
    exportToExcel(linhas, `fechamento-socios-${periodo.inicio}-a-${periodo.fim}`, ['Bloco', 'Grupo', 'Categoria', 'Valor']);
  };

  const Linha = ({ g, todo, cor }: { g: FechamentoGrupo; todo: number; cor: string }) => {
    const id = `${g.id}`;
    const temFilhas = g.categorias.length > 1 || (g.categorias.length === 1 && g.categorias[0].nome !== g.nome);
    return (
      <div className="border-b border-white/5 last:border-b-0">
        <button
          onClick={() => temFilhas && alternar(id)}
          className={`w-full flex items-center gap-3 px-4 py-3 text-left ${temFilhas ? 'hover:bg-white/[0.03] cursor-pointer' : 'cursor-default'} focus-ring`}
          aria-expanded={aberto[id] ?? false}
        >
          <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${temFilhas ? 'text-white/40' : 'text-transparent'} ${aberto[id] ? '' : '-rotate-90'}`} />
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium truncate">{g.nome}</p>
            <div className="mt-1.5 h-1.5 w-full max-w-xs bg-white/10 rounded-full overflow-hidden">
              <div className="h-full rounded-full" style={{ width: `${pct(n(g.total), todo)}%`, background: cor }} />
            </div>
          </div>
          <span className="text-white/50 text-xs w-10 text-right font-mono">{pct(n(g.total), todo)}%</span>
          <span className="text-white font-mono font-semibold w-32 text-right">{brl(n(g.total))}</span>
        </button>
        {temFilhas && aberto[id] && (
          <div className="pb-2 pl-11 pr-4">
            {g.categorias.map(c => (
              <div key={c.nome} className="flex items-center gap-3 py-1.5 text-sm">
                <span className="flex-1 text-white/70 truncate">{c.nome}</span>
                <span className="text-white/40 text-xs">{c.qtd} lanç.</span>
                <span className="text-white/80 font-mono w-32 text-right">{brl(n(c.total))}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const Bloco = ({ titulo, subtitulo, bloco, cor, rotuloSocios, corSocios }: {
    titulo: string; subtitulo: string; bloco: FechamentoBloco; cor: string; rotuloSocios: string; corSocios: string;
  }) => {
    const operacao = bloco.grupos.filter(g => !ehSocioOuEmprestimo(g));
    const socios = bloco.grupos.filter(ehSocioOuEmprestimo);
    const todo = n(bloco.total);
    return (
      <div className="bg-[#12141f] border border-white/10 rounded-2xl overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
          <div>
            <h3 className="text-white font-semibold">{titulo}</h3>
            <p className="text-white/50 text-xs mt-0.5">{subtitulo}</p>
          </div>
          <span className="text-xl font-bold font-mono" style={{ color: cor }}>{brl(todo)}</span>
        </div>
        {operacao.length === 0 && socios.length === 0 && n(bloco.sem_categoria.total) === 0 && (
          <p className="px-5 py-8 text-center text-white/50 text-sm">Nada lançado neste período.</p>
        )}
        {operacao.map(g => <Linha key={g.id} g={g} todo={todo} cor={cor} />)}
        {socios.length > 0 && (
          <>
            <div className="px-4 py-2 bg-white/[0.03] border-y border-white/5 text-xs font-semibold uppercase tracking-wide" style={{ color: corSocios }}>{rotuloSocios}</div>
            {socios.map(g => <Linha key={g.id} g={g} todo={todo} cor={corSocios} />)}
          </>
        )}
        {n(bloco.sem_categoria.total) > 0 && (
          <div className="flex items-center gap-3 px-4 py-3 bg-amber-900/10 border-t border-amber-700/20">
            <AlertTriangle className="w-4 h-4 text-amber-300 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-amber-200 text-sm font-medium">Sem categoria</p>
              <p className="text-amber-200/70 text-xs">{bloco.sem_categoria.qtd} lançamentos ainda sem categoria. Estão na soma, mas não dá para dizer de onde vieram.</p>
            </div>
            <span className="text-amber-200 font-mono font-semibold w-32 text-right">{brl(n(bloco.sem_categoria.total))}</span>
          </div>
        )}
      </div>
    );
  };

  const atalhos: { key: Atalho; rotulo: string }[] = [
    { key: 'mes_passado', rotulo: 'Mês passado' },
    { key: 'mes_atual', rotulo: 'Este mês' },
    { key: 'ate_hoje', rotulo: 'Do dia 1 até hoje' },
    { key: 'ultimos_7', rotulo: 'Últimos 7 dias' },
    { key: 'personalizado', rotulo: 'Escolher datas' },
  ];

  return (
    <div className="space-y-6">
      {/* Cabeçalho: o período e as ações */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-bold text-white font-display">Fechamento de Sócios</h2>
          <p className="text-white/50 text-sm">Quanto tinha, quanto entrou, quanto foi pago, quanto sobrou. Só o que passou pela conta.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={exportarExcel} disabled={!dados} className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/15 rounded-xl text-white/70 hover:bg-white/10 text-sm disabled:opacity-40 focus-ring">
            <Download className="w-4 h-4" /> Excel
          </button>
          <div className="relative" ref={menuRef}>
            <button onClick={() => setMenuPdf(v => !v)} disabled={!dados || !!gerandoPdf}
              className="flex items-center gap-2 px-4 py-2 bg-wine text-white rounded-xl hover:bg-[#9D2F3C] text-sm font-semibold disabled:opacity-50 focus-ring">
              <FileText className="w-4 h-4" /> {gerandoPdf ? 'Gerando…' : 'Relatório em PDF'} <ChevronDown className="w-3.5 h-3.5" />
            </button>
            {menuPdf && (
              <div className="absolute right-0 mt-2 w-80 rounded-xl border border-white/10 shadow-2xl shadow-black/60 overflow-hidden z-50" style={{ background: 'var(--bg-card)' }}>
                {([
                  { nivel: 'simplificado', titulo: 'Simplificado', desc: 'Só os grupos. Uma página, para ler em um minuto.' },
                  { nivel: 'analitico', titulo: 'Analítico', desc: 'Grupos abertos em categorias.' },
                  { nivel: 'completo', titulo: 'Completo', desc: 'Analítico mais o extrato de todos os lançamentos do período.' },
                ] as { nivel: NivelRelatorio; titulo: string; desc: string }[]).map(o => (
                  <button key={o.nivel} onClick={() => gerarPdf(o.nivel)} className="w-full text-left px-4 py-3 hover:bg-white/5 border-b border-white/5 last:border-b-0 focus-ring">
                    <p className="text-white text-sm font-semibold">{o.titulo}</p>
                    <p className="text-white/50 text-xs mt-0.5">{o.desc}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* O período: atalhos e, se quiser, as datas exatas */}
      <div className="bg-[#12141f] border border-white/10 rounded-2xl p-4 flex items-center gap-3 flex-wrap">
        <CalendarRange className="w-4 h-4 text-white/40 shrink-0" />
        <div className="flex gap-1 bg-white/5 p-1 rounded-xl flex-wrap">
          {atalhos.map(a => (
            <button key={a.key} onClick={() => escolherAtalho(a.key)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors focus-ring ${atalho === a.key ? 'bg-wine text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>
              {a.rotulo}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-sm text-white/60">
          <span>de</span>
          <input type="date" value={periodo.inicio} max={periodo.fim || undefined}
            onChange={e => { setAtalho('personalizado'); setPeriodo(p => ({ ...p, inicio: e.target.value })); }}
            className="bg-white/5 border border-white/15 rounded-lg px-2.5 py-1.5 text-white text-sm focus:outline-none focus:border-wine/60" />
          <span>até</span>
          <input type="date" value={periodo.fim} min={periodo.inicio || undefined}
            onChange={e => { setAtalho('personalizado'); setPeriodo(p => ({ ...p, fim: e.target.value })); }}
            className="bg-white/5 border border-white/15 rounded-lg px-2.5 py-1.5 text-white text-sm focus:outline-none focus:border-wine/60" />
        </div>
        {periodoValido && <span className="ml-auto text-sm text-white/80 capitalize font-medium">{rotuloPeriodo}</span>}
        {!periodoValido && <span className="ml-auto text-sm text-amber-300">A data final precisa ser depois da inicial.</span>}
      </div>

      {erro && <div className="p-3 bg-red-900/30 text-red-300 rounded-xl border border-red-700/40 text-sm">{erro}</div>}

      {loading || !dados || !resumo ? (
        <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine" /></div>
      ) : (
        <>
          {emAndamento && (
            <div className="flex gap-2 items-start text-xs text-sky-200/80 bg-sky-900/15 border border-sky-700/30 rounded-xl px-4 py-3">
              <Info className="w-4 h-4 shrink-0 mt-0.5" />
              <span>Período ainda em andamento: os números vão mudando até o último dia. Para fechar de verdade, escolha um período que já terminou.</span>
            </div>
          )}

          {/* A conta em quatro números, na ordem em que se lê */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-[#12141f] border border-white/10 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-white/50 text-xs font-semibold uppercase tracking-wide"><Wallet className="w-4 h-4" />Começou com</div>
              <p className="text-2xl font-bold font-mono text-white mt-2">{brl(resumo.ini)}</p>
              <p className="text-white/40 text-xs mt-1">saldo das contas em {dayjs(dados.periodo.inicio).subtract(1, 'day').format('DD/MM')}</p>
            </div>
            <div className="bg-[#12141f] border border-white/10 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-white/50 text-xs font-semibold uppercase tracking-wide"><ArrowDownToLine className="w-4 h-4 text-emerald-400" />Entrou</div>
              <p className="text-2xl font-bold font-mono text-emerald-300 mt-2">+ {brl(resumo.ent)}</p>
              <p className="text-white/40 text-xs mt-1">
                {dados.anterior ? `período anterior: ${brl(n(dados.anterior.entradas))}` : 'tudo que caiu na conta'}
              </p>
            </div>
            <div className="bg-[#12141f] border border-white/10 rounded-2xl p-4">
              <div className="flex items-center gap-2 text-white/50 text-xs font-semibold uppercase tracking-wide"><ArrowUpFromLine className="w-4 h-4 text-red-400" />Foi pago</div>
              <p className="text-2xl font-bold font-mono text-red-300 mt-2">− {brl(resumo.sai)}</p>
              <p className="text-white/40 text-xs mt-1">
                {dados.anterior ? `período anterior: ${brl(n(dados.anterior.saidas))}` : 'tudo que saiu da conta'}
              </p>
            </div>
            <div className={`rounded-2xl p-4 border ${resumo.resultado >= 0 ? 'bg-emerald-900/20 border-emerald-700/40' : 'bg-red-900/20 border-red-700/40'}`}>
              <div className="flex items-center gap-2 text-white/70 text-xs font-semibold uppercase tracking-wide"><PiggyBank className="w-4 h-4" />Sobrou na conta</div>
              <p className={`text-2xl font-bold font-mono mt-2 ${resumo.fim >= 0 ? 'text-white' : 'text-red-300'}`}>{brl(resumo.fim)}</p>
              <p className={`text-xs mt-1 font-medium ${resumo.resultado >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                {resumo.resultado >= 0 ? `${brl(resumo.resultado)} a mais do que começou` : `${brl(Math.abs(resumo.resultado))} a menos do que começou`}
              </p>
            </div>
          </div>

          {/* A frase que resume o período */}
          <p className="text-white/70 text-sm px-1">
            Começou com <strong className="text-white">{brl(resumo.ini)}</strong>, entrou <strong className="text-emerald-300">{brl(resumo.ent)}</strong>, pagou <strong className="text-red-300">{brl(resumo.sai)}</strong>
            {resumo.transf !== 0 && <> (mais <strong className="text-white">{brl(resumo.transf)}</strong> de acerto entre contas)</>}
            {' '}e terminou com <strong className="text-white">{brl(resumo.fim)}</strong>.
          </p>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            <Bloco
              titulo="O que entrou"
              subtitulo="Dinheiro que caiu nas contas no período, por origem"
              bloco={dados.entradas}
              cor="#34d399"
              rotuloSocios="Não é venda: sócios e empréstimos"
              corSocios="#fbbf24"
            />
            <Bloco
              titulo="O que foi pago"
              subtitulo="Dinheiro que saiu das contas no período, por grupo"
              bloco={dados.saidas}
              cor="#f87171"
              rotuloSocios="Retiradas de sócios e empréstimos"
              corSocios="#fbbf24"
            />
          </div>

          {/* Onde o dinheiro está */}
          <div className="bg-[#12141f] border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10">
              <h3 className="text-white font-semibold">Onde o dinheiro está</h3>
              <p className="text-white/50 text-xs mt-0.5">Saldo de cada conta no começo e no fim do período</p>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-white/50 uppercase tracking-wide bg-white/[0.02]">
                  <th className="text-left px-5 py-2 font-medium">Conta</th>
                  <th className="text-right px-5 py-2 font-medium">Começo</th>
                  <th className="text-right px-5 py-2 font-medium">Fim</th>
                  <th className="text-right px-5 py-2 font-medium">Variação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {dados.saldo_final.contas.map(c => {
                  const ini = n(dados.saldo_inicial.contas.find(x => x.id === c.id)?.saldo);
                  const fim = n(c.saldo);
                  const d = fim - ini;
                  return (
                    <tr key={c.id}>
                      <td className="px-5 py-2.5 text-white">{c.banco}<span className="text-white/40 text-xs ml-2 capitalize">{c.tipo}</span></td>
                      <td className="px-5 py-2.5 text-right font-mono text-white/70">{brl(ini)}</td>
                      <td className={`px-5 py-2.5 text-right font-mono font-semibold ${fim < 0 ? 'text-red-300' : 'text-white'}`}>{brl(fim)}</td>
                      <td className={`px-5 py-2.5 text-right font-mono ${d > 0 ? 'text-emerald-300' : d < 0 ? 'text-red-300' : 'text-white/40'}`}>{d > 0 ? '+' : ''}{brl(d)}</td>
                    </tr>
                  );
                })}
                <tr className="bg-white/[0.03] font-semibold">
                  <td className="px-5 py-2.5 text-white">Total</td>
                  <td className="px-5 py-2.5 text-right font-mono text-white/80">{brl(resumo.ini)}</td>
                  <td className="px-5 py-2.5 text-right font-mono text-white">{brl(resumo.fim)}</td>
                  <td className={`px-5 py-2.5 text-right font-mono ${resumo.fim - resumo.ini >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>{resumo.fim - resumo.ini > 0 ? '+' : ''}{brl(resumo.fim - resumo.ini)}</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Avisos de conferência — só aparecem quando algo não fecha */}
          {(Math.abs(resumo.diferenca) > 0.5 || n(dados.sem_conta.qtd) > 0 || resumo.transf !== 0) && (
            <div className="text-xs text-white/50 space-y-1 px-1">
              {resumo.transf !== 0 && (
                <p>Transferências entre contas não entram nas listas. Neste período elas não se anulam: sobra {brl(resumo.transf)} líquido, já contado no saldo final.</p>
              )}
              {n(dados.sem_conta.qtd) > 0 && (
                <p className="text-amber-300/90">{dados.sem_conta.qtd} lançamentos do período não têm conta bancária: estão nas listas, mas não movem saldo nenhum ({brl(n(dados.sem_conta.liquido))}).</p>
              )}
              {Math.abs(resumo.diferenca) > 0.5 && (
                <p className="text-amber-300/90">A conta não fecha por {brl(resumo.diferenca)}. Vale conferir lançamentos com data ou conta errada em Fluxo de Caixa.</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default FechamentoSocios;
