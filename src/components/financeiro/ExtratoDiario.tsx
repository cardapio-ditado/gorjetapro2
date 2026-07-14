import React, { useState, useEffect } from 'react';
import { Download, FileText, ArrowUpRight, ArrowDownRight, TrendingUp, ChevronDown } from 'lucide-react';
import { Menu } from '@headlessui/react';
import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';
import { ReportGenerator, exportToExcel } from '../../utils/reportGenerator';

interface ExtratoDiario {
  data: string; saldo_anterior: number; total_entradas: number;
  total_saidas: number; saldo_final: number; quantidade_lancamentos: number;
  qtd_entradas: number; qtd_saidas: number; ano: number; mes: number; dia: number;
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

const ExtratoDiario: React.FC = () => {
  const [extrato, setExtrato] = useState<ExtratoDiario[]>([]);
  const [loading, setLoading] = useState(true);
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

  useEffect(() => { fetchExtrato(); }, [filterType, startDate, endDate, selectedYear, selectedMonth]);

  const fetchExtrato = async () => {
    try {
      setLoading(true); setError(null);
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
    finally { setLoading(false); }
  };

  const fetchLancamentosDetalhados = async (data: string) => {
    const { data: l } = await supabase.from('fluxo_caixa').select('*')
      .gte('data', `${data} 00:00:00`).lte('data', `${data} 23:59:59`).order('data', { ascending: true });
    return l || [];
  };

  const exportarExcel = () => {
    const headers = ['Data', 'Saldo Anterior', 'Entradas', 'Saídas', 'Saldo Final', 'Qtd Lançamentos'];
    const data = extrato.map(e => [dayjs(e.data).format('DD/MM/YYYY'), fmt(e.saldo_anterior), fmt(e.total_entradas), fmt(e.total_saidas), fmt(e.saldo_final), e.quantidade_lancamentos.toString()]);
    exportToExcel(data, headers, `extrato-${selectedYear}`);
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
      const lancamentos = await fetchLancamentosDetalhados(dia.data);
      if (lancamentos.length) {
        y = rg.addTable(['Tipo', 'Descrição', 'C. Custo', 'Valor'],
          lancamentos.map((l: any) => [l.tipo === 'entrada' ? 'ENTRADA' : 'SAÍDA', (l.descricao || '').substring(0, 40), l.centro_custo || '-', fmt(Math.abs(l.valor))]), y);
      }
    }
    rg.save(`extrato-detalhado-${selectedYear}.pdf`);
  };

  const totalE = extrato.reduce((s, e) => s + e.total_entradas, 0);
  const totalS = extrato.reduce((s, e) => s + e.total_saidas, 0);
  const saldoI = extrato[extrato.length - 1]?.saldo_anterior || 0;
  const saldoF = extrato[0]?.saldo_final || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: '-apple-system,BlinkMacSystemFont,"Inter",sans-serif' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
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
      </div>

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
      {!loading && extrato.length > 0 && (
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

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: `2px solid rgba(212,175,55,0.15)`, borderTop: `2px solid ${S.gold}`, animation: 'spin 0.8s linear infinite' }} />
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      ) : extrato.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: S.label, fontSize: 13 }}>Nenhuma movimentação no período</div>
      ) : (
        <div style={{ background: S.card, borderRadius: 12, border: `1px solid ${S.border}`, overflow: 'hidden' }}>
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
                  <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.03)` }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.02)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                    <td style={{ padding: '10px 14px' }}>
                      <p style={{ color: S.text, fontSize: 12, fontWeight: 500, margin: 0 }}>{dayjs(dia.data).format('DD/MM/YYYY')}</p>
                      <p style={{ color: S.label, fontSize: 10, margin: 0 }}>{dayjs(dia.data).format('dddd')}</p>
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
    </div>
  );
};

export default ExtratoDiario;
