import React, { useState, useEffect, useCallback } from 'react';
import { Download, FileText, ChevronDown, ArrowUpRight, ArrowDownRight, CalendarDays, CalendarRange, ChevronLeft, ChevronRight } from 'lucide-react';
import { Menu } from '@headlessui/react';
import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';
import { ReportGenerator, exportToExcel } from '../../utils/reportGenerator';

interface ExtratoDia {
  data: string; saldo_anterior: number; total_entradas: number;
  total_saidas: number; saldo_final: number; quantidade_lancamentos: number;
  qtd_entradas: number; qtd_saidas: number; ano: number; mes: number; dia: number;
}

interface Lancamento {
  id: string; tipo: string; valor: number; descricao: string | null;
  centro_custo: string | null; categorias_financeiras: { nome: string } | null;
}

const fmt = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const S = {
  card: '#12141f', border: 'rgba(255,255,255,0.06)', label: 'rgba(255,255,255,0.35)',
  text: 'rgba(255,255,255,0.85)', muted: 'rgba(255,255,255,0.5)',
  green: '#4ade80', red: '#f87171', blue: '#60a5fa', gold: '#D4AF37',
  greenBg: 'rgba(74,222,128,0.08)', redBg: 'rgba(248,113,113,0.08)',
  blueBg: 'rgba(96,165,250,0.08)', goldBg: 'rgba(212,175,55,0.08)',
  greenBorder: 'rgba(74,222,128,0.15)', redBorder: 'rgba(248,113,113,0.15)',
  blueBorder: 'rgba(96,165,250,0.15)', goldBorder: 'rgba(212,175,55,0.15)',
  wine: '#7D1F2C', wineBg: 'rgba(125,31,44,0.2)', wineBorder: 'rgba(125,31,44,0.35)',
};

const inputStyle = {
  background: 'rgba(255,255,255,0.05)', border: `1px solid ${S.border}`,
  borderRadius: 8, padding: '7px 12px', color: S.text, fontSize: 12, outline: 'none', width: '100%',
};

const emptyDia = (data: string): ExtratoDia => ({
  data, saldo_anterior: 0, total_entradas: 0, total_saidas: 0, saldo_final: 0,
  quantidade_lancamentos: 0, qtd_entradas: 0, qtd_saidas: 0,
  ano: dayjs(data).year(), mes: dayjs(data).month() + 1, dia: dayjs(data).date(),
});

const ExtratoDiario: React.FC = () => {
  const [modo, setModo] = useState<'dia' | 'periodo'>('dia');

  // ── Modo Dia ──────────────────────────────────────────────────────────────
  const [diaSel, setDiaSel] = useState(dayjs().format('YYYY-MM-DD'));
  const [resumoDia, setResumoDia] = useState<ExtratoDia | null>(null);
  const [lancamentos, setLancamentos] = useState<Lancamento[]>([]);
  const [loadingDia, setLoadingDia] = useState(true);

  // ── Modo Período ──────────────────────────────────────────────────────────
  const [extrato, setExtrato] = useState<ExtratoDia[]>([]);
  const [loadingPer, setLoadingPer] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<'period' | 'month'>('month');
  const [startDate, setStartDate] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState(dayjs().format('YYYY-MM-DD'));
  const [selectedYear, setSelectedYear] = useState(dayjs().year());
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>(dayjs().month() + 1);

  const years  = Array.from({ length: 5 }, (_, i) => dayjs().year() - i);
  const months = [
    { value: 'all', label: 'Todos os Meses' },
    ...Array.from({ length: 12 }, (_, i) => ({ value: i + 1, label: dayjs().month(i).format('MMMM') }))
  ];

  // ── Fetch: um dia (resumo + lançamentos) ────────────────────────────────────
  const fetchDia = useCallback(async (data: string) => {
    try {
      setLoadingDia(true);
      const [{ data: resumo, error: errR }, { data: lanc }] = await Promise.all([
        supabase.from('vw_extrato_consolidado').select('*').eq('data', data).maybeSingle(),
        supabase.from('fluxo_caixa')
          .select('id, tipo, valor, descricao, centro_custo, categorias_financeiras(nome)')
          .eq('data', data).order('valor', { ascending: false }),
      ]);
      if (errR && errR.code !== 'PGRST116') throw errR;
      setResumoDia((resumo as ExtratoDia) ?? emptyDia(data));
      setLancamentos((lanc as any as Lancamento[]) ?? []);
    } catch (err) {
      console.error('Erro ao carregar dia:', err);
      setResumoDia(emptyDia(data));
      setLancamentos([]);
    } finally {
      setLoadingDia(false);
    }
  }, []);

  // ── Fetch: período ──────────────────────────────────────────────────────────
  const fetchPeriodo = useCallback(async () => {
    try {
      setLoadingPer(true); setError(null);
      let query = supabase.from('vw_extrato_consolidado').select('*');
      if (filterType === 'period') {
        query = query.gte('data', startDate).lte('data', endDate);
      } else {
        query = query.eq('ano', selectedYear);
        if (selectedMonth !== 'all') query = query.eq('mes', selectedMonth);
      }
      const { data, error: err } = await query.order('data', { ascending: false });
      if (err) throw err;
      setExtrato(data || []);
    } catch (err: any) { setError(err.message); }
    finally { setLoadingPer(false); }
  }, [filterType, startDate, endDate, selectedYear, selectedMonth]);

  useEffect(() => { if (modo === 'dia') fetchDia(diaSel); }, [modo, diaSel, fetchDia]);
  useEffect(() => { if (modo === 'periodo') fetchPeriodo(); }, [modo, fetchPeriodo]);

  const irParaDia = (data: string) => { setDiaSel(dayjs(data).format('YYYY-MM-DD')); setModo('dia'); };
  const passoDia  = (delta: number) => setDiaSel(d => dayjs(d).add(delta, 'day').format('YYYY-MM-DD'));

  // ── Exports (período) ───────────────────────────────────────────────────────
  const fetchLancamentosDetalhados = async (data: string) => {
    const { data: l } = await supabase.from('fluxo_caixa').select('*').eq('data', data).order('valor', { ascending: false });
    return l || [];
  };

  const exportarExcel = () => {
    const headers = ['Data', 'Saldo Anterior', 'Entradas', 'Saídas', 'Saldo Final', 'Qtd Lançamentos'];
    const data = extrato.map(e => [dayjs(e.data).format('DD/MM/YYYY'), fmt(e.saldo_anterior), fmt(e.total_entradas), fmt(e.total_saidas), fmt(e.saldo_final), e.quantidade_lancamentos.toString()]);
    exportToExcel(data, `extrato-${selectedYear}`, headers);
  };

  const gerarExtratoSintetico = () => {
    if (!extrato.length) { alert('Sem dados'); return; }
    const rg = new ReportGenerator();
    let y = rg.addHeader('EXTRATO SINTÉTICO', `Ano: ${selectedYear}`);
    const sI = extrato[extrato.length - 1]?.saldo_anterior || 0;
    const sF = extrato[0]?.saldo_final || 0;
    const tE = extrato.reduce((s, e) => s + e.total_entradas, 0);
    const tS = extrato.reduce((s, e) => s + e.total_saidas, 0);
    y = rg.addSection('Resumo', [], y);
    y = rg.addTable(['Indicador', 'Valor'], [['Saldo Inicial', fmt(sI)], ['Entradas', fmt(tE)], ['Saídas', fmt(tS)], ['Saldo Final', fmt(sF)]], y);
    y = rg.addSection('Movimentação Diária', [], y + 10);
    rg.addTable(['Data', 'Saldo Anterior', 'Entradas', 'Saídas', 'Saldo Final'],
      extrato.map(e => [dayjs(e.data).format('DD/MM/YYYY'), fmt(e.saldo_anterior), fmt(e.total_entradas), fmt(e.total_saidas), fmt(e.saldo_final)]), y);
    rg.save(`extrato-sintetico-${selectedYear}.pdf`);
  };

  const gerarExtratoDetalhado = async () => {
    if (!extrato.length) { alert('Sem dados'); return; }
    const rg = new ReportGenerator();
    let y = rg.addHeader('EXTRATO DETALHADO', `Ano: ${selectedYear}`);
    const sI = extrato[extrato.length - 1]?.saldo_anterior || 0;
    const sF = extrato[0]?.saldo_final || 0;
    const tE = extrato.reduce((s, e) => s + e.total_entradas, 0);
    const tS = extrato.reduce((s, e) => s + e.total_saidas, 0);
    y = rg.addSection('Resumo', [], y);
    y = rg.addTable(['Indicador', 'Valor'], [['Saldo Inicial', fmt(sI)], ['Entradas', fmt(tE)], ['Saídas', fmt(tS)], ['Saldo Final', fmt(sF)]], y);
    for (const dia of extrato) {
      rg.pdf.addPage(); y = 20;
      y = rg.addSection(`${dayjs(dia.data).format('DD/MM/YYYY')}`, [`Saldo Anterior: ${fmt(dia.saldo_anterior)}`, `Saldo Final: ${fmt(dia.saldo_final)}`], y);
      const l = await fetchLancamentosDetalhados(dia.data);
      if (l.length) {
        y = rg.addTable(['Tipo', 'Descrição', 'C. Custo', 'Valor'],
          l.map((x: any) => [x.tipo === 'entrada' ? 'ENTRADA' : 'SAÍDA', (x.descricao || '').substring(0, 40), x.centro_custo || '-', fmt(Math.abs(x.valor))]), y);
      }
    }
    rg.save(`extrato-detalhado-${selectedYear}.pdf`);
  };

  const totalE = extrato.reduce((s, e) => s + e.total_entradas, 0);
  const totalS = extrato.reduce((s, e) => s + e.total_saidas, 0);
  const saldoI = extrato[extrato.length - 1]?.saldo_anterior || 0;
  const saldoF = extrato[0]?.saldo_final || 0;

  const resultadoDia = (resumoDia?.total_entradas || 0) - (resumoDia?.total_saidas || 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: '-apple-system,BlinkMacSystemFont,"Inter",sans-serif' }}>

      {/* ── Toggle de modo ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 6, background: S.card, border: `1px solid ${S.border}`, borderRadius: 10, padding: 4 }}>
          {([['dia', 'Dia', CalendarDays], ['periodo', 'Período', CalendarRange]] as const).map(([m, lbl, Ic]) => (
            <button key={m} onClick={() => setModo(m)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 7, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: modo === m ? S.wine : 'transparent', color: modo === m ? 'white' : S.label }}>
              <Ic style={{ width: 13, height: 13 }} /> {lbl}
            </button>
          ))}
        </div>

        {/* Export só faz sentido no período */}
        {modo === 'periodo' && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={exportarExcel} style={{ display: 'flex', alignItems: 'center', gap: 6, background: S.card, border: `1px solid ${S.border}`, borderRadius: 8, padding: '8px 14px', color: S.muted, fontSize: 12, cursor: 'pointer' }}>
              <Download style={{ width: 13, height: 13 }} /> Excel
            </button>
            <Menu as="div" style={{ position: 'relative' }}>
              <Menu.Button style={{ display: 'flex', alignItems: 'center', gap: 6, background: S.wine, border: 'none', borderRadius: 8, padding: '8px 14px', color: 'white', fontSize: 12, cursor: 'pointer' }}>
                <FileText style={{ width: 13, height: 13 }} /> PDF <ChevronDown style={{ width: 11, height: 11 }} />
              </Menu.Button>
              <Menu.Items style={{ position: 'absolute', right: 0, top: '110%', background: '#1a1020', border: `1px solid ${S.border}`, borderRadius: 10, width: 200, zIndex: 50, overflow: 'hidden' }}>
                <Menu.Item>{({ active }) => (
                  <button onClick={gerarExtratoSintetico} style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: active ? 'rgba(255,255,255,0.05)' : 'transparent', border: 'none', color: S.text, fontSize: 12, cursor: 'pointer' }}>
                    Extrato Sintético
                  </button>
                )}</Menu.Item>
                <Menu.Item>{({ active }) => (
                  <button onClick={gerarExtratoDetalhado} style={{ width: '100%', textAlign: 'left', padding: '10px 14px', background: active ? 'rgba(255,255,255,0.05)' : 'transparent', border: 'none', color: S.text, fontSize: 12, cursor: 'pointer' }}>
                    Extrato Detalhado
                  </button>
                )}</Menu.Item>
              </Menu.Items>
            </Menu>
          </div>
        )}
      </div>

      {/* ═══════════════════ MODO DIA ═══════════════════ */}
      {modo === 'dia' && (
        <>
          {/* Navegação de data */}
          <div style={{ background: S.card, borderRadius: 12, padding: '12px 14px', border: `1px solid ${S.border}`, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button onClick={() => passoDia(-1)} title="Dia anterior"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `1px solid ${S.border}`, color: S.text, cursor: 'pointer' }}>
              <ChevronLeft style={{ width: 16, height: 16 }} />
            </button>
            <input type="date" value={diaSel} max={dayjs().format('YYYY-MM-DD')}
              onChange={e => setDiaSel(e.target.value)} style={{ ...inputStyle, width: 'auto', flex: '1 1 160px' }} />
            <button onClick={() => passoDia(1)} disabled={dayjs(diaSel).isSame(dayjs(), 'day')} title="Próximo dia"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `1px solid ${S.border}`, color: S.text, cursor: dayjs(diaSel).isSame(dayjs(), 'day') ? 'not-allowed' : 'pointer', opacity: dayjs(diaSel).isSame(dayjs(), 'day') ? 0.4 : 1 }}>
              <ChevronRight style={{ width: 16, height: 16 }} />
            </button>
            <button onClick={() => setDiaSel(dayjs().format('YYYY-MM-DD'))}
              style={{ padding: '7px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: `1px solid ${S.border}`, color: S.muted, fontSize: 12, cursor: 'pointer' }}>
              Hoje
            </button>
            <span style={{ color: S.label, fontSize: 12, textTransform: 'capitalize', marginLeft: 'auto' }}>
              {dayjs(diaSel).format('dddd, DD [de] MMMM [de] YYYY')}
            </span>
          </div>

          {loadingDia ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', border: `2px solid rgba(212,175,55,0.15)`, borderTop: `2px solid ${S.gold}`, animation: 'spin 0.8s linear infinite' }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          ) : (
            <>
              {/* Cards do dia */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
                {[
                  { label: 'Saldo Anterior', value: fmt(resumoDia?.saldo_anterior || 0), color: S.blue, bg: S.blueBg, border: S.blueBorder, sub: `até ${dayjs(diaSel).subtract(1, 'day').format('DD/MM')}` },
                  { label: 'Entradas', value: fmt(resumoDia?.total_entradas || 0), color: S.green, bg: S.greenBg, border: S.greenBorder, sub: `${resumoDia?.qtd_entradas || 0} lanç.` },
                  { label: 'Saídas', value: fmt(resumoDia?.total_saidas || 0), color: S.red, bg: S.redBg, border: S.redBorder, sub: `${resumoDia?.qtd_saidas || 0} lanç.` },
                  { label: 'Resultado do Dia', value: fmt(resultadoDia), color: resultadoDia >= 0 ? S.green : S.red, bg: resultadoDia >= 0 ? S.greenBg : S.redBg, border: resultadoDia >= 0 ? S.greenBorder : S.redBorder, sub: 'entradas − saídas' },
                  { label: 'Saldo Final', value: fmt(resumoDia?.saldo_final || 0), color: S.gold, bg: S.goldBg, border: S.goldBorder, sub: `até ${dayjs(diaSel).format('DD/MM')}` },
                ].map((c, i) => (
                  <div key={i} style={{ background: c.bg, borderRadius: 12, padding: '12px 14px', border: `1px solid ${c.border}` }}>
                    <p style={{ color: c.color, opacity: 0.6, fontSize: 10, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{c.label}</p>
                    <p style={{ color: c.color, fontSize: 18, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>{c.value}</p>
                    <p style={{ color: S.label, fontSize: 10, margin: '4px 0 0' }}>{c.sub}</p>
                  </div>
                ))}
              </div>

              {/* Como é calculado */}
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '14px 16px', border: `1px solid ${S.border}` }}>
                <p style={{ color: S.muted, fontSize: 11, fontWeight: 600, margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>Como é calculado</p>
                {[
                  { l: 'Saldo Anterior', v: fmt(resumoDia?.saldo_anterior || 0), c: S.blue },
                  { l: '+ Entradas do Dia', v: `+ ${fmt(resumoDia?.total_entradas || 0)}`, c: S.green },
                  { l: '− Saídas do Dia', v: `− ${fmt(resumoDia?.total_saidas || 0)}`, c: S.red },
                ].map((r, i) => (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0' }}>
                    <span style={{ color: S.muted, fontSize: 13 }}>{r.l}</span>
                    <span style={{ color: r.c, fontSize: 13, fontFamily: 'monospace' }}>{r.v}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: `1px solid ${S.border}`, marginTop: 6, paddingTop: 8 }}>
                  <span style={{ color: S.text, fontSize: 13, fontWeight: 700 }}>= Saldo Final</span>
                  <span style={{ color: (resumoDia?.saldo_final || 0) >= 0 ? S.gold : S.red, fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>{fmt(resumoDia?.saldo_final || 0)}</span>
                </div>
              </div>

              {/* Lançamentos do dia */}
              <div style={{ background: S.card, borderRadius: 12, border: `1px solid ${S.border}`, overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderBottom: `1px solid ${S.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <p style={{ color: S.text, fontSize: 13, fontWeight: 700, margin: 0 }}>Lançamentos do dia</p>
                  <span style={{ color: S.label, fontSize: 11 }}>{lancamentos.length} lançamento{lancamentos.length !== 1 ? 's' : ''}</span>
                </div>
                {lancamentos.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: 40, color: S.label, fontSize: 13 }}>Nenhum lançamento neste dia</div>
                ) : (
                  <div style={{ maxHeight: 420, overflowY: 'auto' }}>
                    {lancamentos.map(l => {
                      const entrada = l.tipo === 'entrada';
                      return (
                        <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderBottom: `1px solid rgba(255,255,255,0.03)` }}>
                          <div style={{ width: 30, height: 30, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, background: entrada ? S.greenBg : S.redBg }}>
                            {entrada ? <ArrowUpRight style={{ width: 15, height: 15, color: S.green }} /> : <ArrowDownRight style={{ width: 15, height: 15, color: S.red }} />}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ color: S.text, fontSize: 13, fontWeight: 500, margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.descricao || 'Sem descrição'}</p>
                            <p style={{ color: S.label, fontSize: 10, margin: 0 }}>
                              {l.categorias_financeiras?.nome || 'Sem categoria'}{l.centro_custo ? ` · ${l.centro_custo}` : ''}
                            </p>
                          </div>
                          <span style={{ color: entrada ? S.green : S.red, fontSize: 13, fontWeight: 700, fontFamily: 'monospace', flexShrink: 0 }}>
                            {entrada ? '+' : '−'} {fmt(Math.abs(Number(l.valor)))}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {/* ═══════════════════ MODO PERÍODO ═══════════════════ */}
      {modo === 'periodo' && (
        <>
          {/* Filtros */}
          <div style={{ background: S.card, borderRadius: 12, padding: '14px 16px', border: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              {['month', 'period'].map(t => (
                <button key={t} onClick={() => setFilterType(t as any)}
                  style={{ padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12,
                    background: filterType === t ? S.wine : 'rgba(255,255,255,0.05)',
                    color: filterType === t ? 'white' : S.label }}>
                  {t === 'month' ? 'Por Mês' : 'Por Período'}
                </button>
              ))}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {filterType === 'month' ? (
                <>
                  <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} style={inputStyle}>
                    {years.map(y => <option key={y} value={y}>{y}</option>)}
                  </select>
                  <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value === 'all' ? 'all' : Number(e.target.value))} style={inputStyle}>
                    {months.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </>
              ) : (
                <>
                  <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} style={inputStyle} />
                  <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} style={inputStyle} />
                </>
              )}
            </div>
          </div>

          {/* Cards resumo */}
          {!loadingPer && extrato.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10 }}>
              {[
                { label: 'Saldo Inicial', value: fmt(saldoI), color: S.blue, bg: S.blueBg, border: S.blueBorder },
                { label: 'Total Entradas', value: fmt(totalE), color: S.green, bg: S.greenBg, border: S.greenBorder },
                { label: 'Total Saídas', value: fmt(totalS), color: S.red, bg: S.redBg, border: S.redBorder },
                { label: 'Saldo Final', value: fmt(saldoF), color: S.gold, bg: S.goldBg, border: S.goldBorder },
              ].map((c, i) => (
                <div key={i} style={{ background: c.bg, borderRadius: 12, padding: '12px 14px', border: `1px solid ${c.border}` }}>
                  <p style={{ color: c.color, opacity: 0.6, fontSize: 10, margin: '0 0 6px', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{c.label}</p>
                  <p style={{ color: c.color, fontSize: 18, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>{c.value}</p>
                </div>
              ))}
            </div>
          )}

          {error && <div style={{ background: 'rgba(248,113,113,0.1)', border: `1px solid rgba(248,113,113,0.2)`, borderRadius: 10, padding: '12px 16px', color: S.red, fontSize: 13 }}>{error}</div>}

          {loadingPer ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
              <div style={{ width: 32, height: 32, borderRadius: '50%', border: `2px solid rgba(212,175,55,0.15)`, borderTop: `2px solid ${S.gold}`, animation: 'spin 0.8s linear infinite' }} />
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          ) : extrato.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 48, color: S.label, fontSize: 13 }}>Nenhuma movimentação no período</div>
          ) : (
            <div style={{ background: S.card, borderRadius: 12, border: `1px solid ${S.border}`, overflow: 'hidden' }}>
              <div style={{ padding: '10px 16px', borderBottom: `1px solid ${S.border}` }}>
                <span style={{ color: S.label, fontSize: 11 }}>Clique em um dia para ver os lançamentos detalhados</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                      {['Data', 'Saldo Anterior', 'Entradas', 'Saídas', 'Saldo Final', 'Qtd'].map((h, i) => (
                        <th key={i} style={{ padding: '10px 14px', textAlign: i > 0 ? 'right' : 'left', fontSize: 10, fontWeight: 600, color: S.label, textTransform: 'uppercase', letterSpacing: '0.6px', borderBottom: `1px solid ${S.border}` }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {extrato.map((dia, i) => (
                      <tr key={i} onClick={() => irParaDia(dia.data)} style={{ borderBottom: `1px solid rgba(255,255,255,0.03)`, cursor: 'pointer' }}
                        onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(212,175,55,0.05)'}
                        onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                        <td style={{ padding: '10px 14px' }}>
                          <p style={{ color: S.text, fontSize: 12, fontWeight: 500, margin: 0 }}>{dayjs(dia.data).format('DD/MM/YYYY')}</p>
                          <p style={{ color: S.label, fontSize: 10, margin: 0, textTransform: 'capitalize' }}>{dayjs(dia.data).format('dddd')}</p>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <span style={{ color: S.blue, fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>{fmt(dia.saldo_anterior)}</span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          {dia.qtd_entradas > 0 ? (
                            <>
                              <p style={{ color: S.green, fontSize: 12, fontWeight: 700, margin: 0, fontFamily: 'monospace' }}>{fmt(dia.total_entradas)}</p>
                              <p style={{ color: S.label, fontSize: 10, margin: 0 }}>{dia.qtd_entradas} lanç.</p>
                            </>
                          ) : <span style={{ color: S.muted, fontSize: 12 }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          {dia.qtd_saidas > 0 ? (
                            <>
                              <p style={{ color: S.red, fontSize: 12, fontWeight: 700, margin: 0, fontFamily: 'monospace' }}>{fmt(dia.total_saidas)}</p>
                              <p style={{ color: S.label, fontSize: 10, margin: 0 }}>{dia.qtd_saidas} lanç.</p>
                            </>
                          ) : <span style={{ color: S.muted, fontSize: 12 }}>—</span>}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <p style={{ color: dia.saldo_final >= 0 ? S.gold : S.red, fontSize: 12, fontWeight: 700, margin: 0, fontFamily: 'monospace' }}>{fmt(dia.saldo_final)}</p>
                          <p style={{ color: S.label, fontSize: 10, margin: 0 }}>{dia.saldo_final >= dia.saldo_anterior ? '▲' : '▼'} {fmt(Math.abs(dia.saldo_final - dia.saldo_anterior))}</p>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <span style={{ color: S.muted, fontSize: 12, fontWeight: 500 }}>{dia.quantidade_lancamentos}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ExtratoDiario;
