import React, { useState, useEffect, useCallback } from 'react';
import { RefreshCw, TrendingUp, Calendar, Award, Beer, UtensilsCrossed, Receipt } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';

interface DiaFaturamento {
  data: string;
  total: number;
  bebidas: number;
  alimentos: number;
  taxa_servico: number;
  couvert: number;
  outros: number;
  num_transacoes: number;
  num_comandas: number;
  sincronizado_em: string;
}

const fmt   = (v: number) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);
const fmtK  = (v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(Math.round(v));

const S = {
  card: '#12141f', border: 'rgba(255,255,255,0.06)', label: 'rgba(255,255,255,0.35)',
  text: 'rgba(255,255,255,0.85)', muted: 'rgba(255,255,255,0.5)',
  green: '#4ade80', red: '#f87171', blue: '#60a5fa', gold: '#D4AF37', wine: '#7D1F2C',
  greenBg: 'rgba(74,222,128,0.08)', blueBg: 'rgba(96,165,250,0.08)',
  goldBg: 'rgba(212,175,55,0.08)', wineBg: 'rgba(125,31,44,0.12)',
};

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.05)', border: `1px solid ${S.border}`,
  borderRadius: 8, padding: '7px 12px', color: S.text, fontSize: 12, outline: 'none', width: '100%',
};

const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const FaturamentoZig: React.FC = () => {
  const [dados, setDados] = useState<DiaFaturamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const [tipoFiltro, setTipoFiltro] = useState<'mes' | 'periodo'>('mes');
  const [ano, setAno] = useState(dayjs().year());
  const [mes, setMes] = useState(dayjs().month() + 1);
  const [inicio, setInicio] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [fim, setFim] = useState(dayjs().format('YYYY-MM-DD'));

  const anos  = Array.from({ length: 4 }, (_, i) => dayjs().year() - i);
  const meses = Array.from({ length: 12 }, (_, i) => ({ v: i + 1, l: dayjs().month(i).format('MMMM') }));

  // Intervalo efetivo conforme o filtro
  const intervalo = useCallback(() => {
    if (tipoFiltro === 'mes') {
      const base = dayjs(`${ano}-${String(mes).padStart(2, '0')}-01`);
      return { di: base.startOf('month').format('YYYY-MM-DD'), df: base.endOf('month').format('YYYY-MM-DD') };
    }
    return { di: inicio, df: fim };
  }, [tipoFiltro, ano, mes, inicio, fim]);

  const carregar = useCallback(async () => {
    setLoading(true); setErro(null);
    const { di, df } = intervalo();
    const { data, error } = await supabase
      .from('faturamento_zig_diario')
      .select('*')
      .gte('data', di).lte('data', df)
      .order('data', { ascending: true });
    if (error) setErro(error.message);
    else setDados((data as DiaFaturamento[]) ?? []);
    setLoading(false);
  }, [intervalo]);

  useEffect(() => { carregar(); }, [carregar]);

  const sincronizar = async () => {
    setSyncing(true); setErro(null); setMsg(null);
    const { di, df } = intervalo();
    try {
      const { data, error } = await supabase.functions.invoke('sync-faturamento-zig-diario', {
        body: { dtinicio: di, dtfim: df },
      });
      if (error) throw error;
      if (data && data.ok === false) throw new Error(data.error || 'Falha na sincronização');
      setMsg(`Sincronizado: ${data?.dias_processados ?? 0} dia(s) · ${fmt(Number(data?.total_faturamento ?? 0))}`);
      await carregar();
    } catch (e: any) {
      setErro(`Erro ao sincronizar: ${e.message}`);
    } finally {
      setSyncing(false);
    }
  };

  // Totais e destaques
  const totalPeriodo = dados.reduce((s, d) => s + Number(d.total), 0);
  const totBebidas   = dados.reduce((s, d) => s + Number(d.bebidas), 0);
  const totAlimentos = dados.reduce((s, d) => s + Number(d.alimentos), 0);
  const totCouvert   = dados.reduce((s, d) => s + Number(d.couvert) + Number(d.taxa_servico), 0);
  const totComandas  = dados.reduce((s, d) => s + Number(d.num_comandas), 0);
  const ticketMedio  = totComandas > 0 ? totalPeriodo / totComandas : 0;
  const diasComVenda = dados.filter(d => Number(d.total) > 0).length;
  const media        = diasComVenda > 0 ? totalPeriodo / diasComVenda : 0;
  const melhorDia    = dados.reduce<DiaFaturamento | null>((m, d) => (!m || Number(d.total) > Number(m.total) ? d : m), null);

  const chartData = dados.map(d => ({
    dia: dayjs(d.data).format('DD/MM'),
    diaSemana: DIAS_SEMANA[dayjs(d.data).day()],
    fimDeSemana: [5, 6].includes(dayjs(d.data).day()), // sex/sáb
    total: Number(d.total),
  }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, fontFamily: '-apple-system,BlinkMacSystemFont,"Inter",sans-serif' }}>

      {/* Filtros + sincronizar */}
      <div style={{ background: S.card, borderRadius: 12, padding: '14px 16px', border: `1px solid ${S.border}`, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['mes', 'periodo'] as const).map(t => (
              <button key={t} onClick={() => setTipoFiltro(t)}
                style={{ padding: '7px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', fontSize: 12,
                  background: tipoFiltro === t ? S.wine : 'rgba(255,255,255,0.05)',
                  color: tipoFiltro === t ? 'white' : S.label }}>
                {t === 'mes' ? 'Por Mês' : 'Por Período'}
              </button>
            ))}
          </div>
          <button onClick={sincronizar} disabled={syncing}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: S.wine, border: 'none',
              borderRadius: 8, padding: '8px 16px', color: 'white', fontSize: 12, fontWeight: 600,
              cursor: syncing ? 'wait' : 'pointer', opacity: syncing ? 0.7 : 1 }}>
            <RefreshCw style={{ width: 13, height: 13, animation: syncing ? 'spin 0.8s linear infinite' : 'none' }} />
            {syncing ? 'Sincronizando…' : 'Sincronizar ZIG'}
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {tipoFiltro === 'mes' ? (
            <>
              <select value={ano} onChange={e => setAno(Number(e.target.value))} style={inputStyle}>
                {anos.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <select value={mes} onChange={e => setMes(Number(e.target.value))} style={inputStyle}>
                {meses.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
            </>
          ) : (
            <>
              <input type="date" value={inicio} onChange={e => setInicio(e.target.value)} style={inputStyle} />
              <input type="date" value={fim} onChange={e => setFim(e.target.value)} style={inputStyle} />
            </>
          )}
        </div>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>

      {msg &&  <div style={{ background: S.greenBg, border: `1px solid rgba(74,222,128,0.2)`, borderRadius: 10, padding: '10px 14px', color: S.green, fontSize: 12 }}>{msg}</div>}
      {erro && <div style={{ background: 'rgba(248,113,113,0.1)', border: `1px solid rgba(248,113,113,0.2)`, borderRadius: 10, padding: '10px 14px', color: S.red, fontSize: 12 }}>{erro}</div>}

      {/* Cards resumo */}
      {!loading && dados.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10 }}>
          {[
            { icon: TrendingUp, label: 'Faturamento no período', value: fmt(totalPeriodo), color: S.gold, bg: S.goldBg },
            { icon: Receipt,    label: `Ticket médio (${totComandas} comandas)`, value: fmt(ticketMedio), color: S.green, bg: S.greenBg },
            { icon: Calendar,   label: `Média/dia (${diasComVenda} dias)`, value: fmt(media), color: S.blue, bg: S.blueBg },
            { icon: Award,      label: melhorDia ? `Melhor dia · ${dayjs(melhorDia.data).format('DD/MM')}` : 'Melhor dia', value: melhorDia ? fmt(Number(melhorDia.total)) : '—', color: S.gold, bg: S.goldBg },
            { icon: Beer,       label: 'Bebidas', value: fmt(totBebidas), color: S.blue, bg: S.blueBg },
            { icon: UtensilsCrossed, label: 'Alimentos', value: fmt(totAlimentos), color: S.gold, bg: S.goldBg },
            { icon: TrendingUp, label: 'Couvert + Taxa', value: fmt(totCouvert), color: S.muted, bg: 'rgba(255,255,255,0.03)' },
          ].map((c, i) => (
            <div key={i} style={{ background: c.bg, borderRadius: 12, padding: '12px 14px', border: `1px solid ${S.border}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                <c.icon style={{ width: 12, height: 12, color: c.color, opacity: 0.7 }} />
                <p style={{ color: c.color, opacity: 0.7, fontSize: 9.5, margin: 0, textTransform: 'uppercase', letterSpacing: '0.5px' }}>{c.label}</p>
              </div>
              <p style={{ color: c.color, fontSize: 17, fontWeight: 800, margin: 0, letterSpacing: '-0.5px' }}>{c.value}</p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
          <div style={{ width: 32, height: 32, borderRadius: '50%', border: `2px solid rgba(212,175,55,0.15)`, borderTop: `2px solid ${S.gold}`, animation: 'spin 0.8s linear infinite' }} />
        </div>
      ) : dados.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 48, color: S.label, fontSize: 13 }}>
          Nenhum faturamento ZIG neste período. Clique em <strong style={{ color: S.text }}>Sincronizar ZIG</strong> para puxar da ZIG.
        </div>
      ) : (
        <>
          {/* Gráfico de barras por dia */}
          <div style={{ background: S.card, borderRadius: 12, border: `1px solid ${S.border}`, padding: '16px' }}>
            <p style={{ color: S.text, fontSize: 13, fontWeight: 700, margin: '0 0 12px' }}>Faturamento por dia</p>
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={chartData} margin={{ top: 4, right: 8, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                <XAxis dataKey="dia" stroke={S.label} style={{ fontSize: 10 }} tickLine={false} />
                <YAxis stroke={S.label} style={{ fontSize: 10 }} tickFormatter={fmtK} tickLine={false} axisLine={false} width={40} />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  contentStyle={{ background: '#1a1020', border: `1px solid ${S.border}`, borderRadius: 10, fontSize: 12 }}
                  labelStyle={{ color: S.text }}
                  formatter={(v: any, _n: any, p: any) => [fmt(Number(v)), p?.payload?.diaSemana ?? 'Total']}
                />
                <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                  {chartData.map((d, i) => (
                    <Cell key={i} fill={d.fimDeSemana ? S.gold : S.wine} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 10, color: S.label }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: S.gold }} /> sex/sáb</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, borderRadius: 2, background: S.wine }} /> demais dias</span>
            </div>
          </div>

          {/* Tabela dia a dia */}
          <div style={{ background: S.card, borderRadius: 12, border: `1px solid ${S.border}`, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                <thead>
                  <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                    {['Data', 'Total', 'Comandas', 'Ticket médio', 'Bebidas', 'Alimentos', 'Couvert', 'Taxa Serv.'].map((h, i) => (
                      <th key={i} style={{ padding: '10px 14px', textAlign: i > 0 ? 'right' : 'left', fontSize: 10, fontWeight: 600, color: S.label, textTransform: 'uppercase', letterSpacing: '0.6px', borderBottom: `1px solid ${S.border}` }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {dados.map((d, i) => {
                    const fds = [5, 6].includes(dayjs(d.data).day());
                    return (
                      <tr key={i} style={{ borderBottom: `1px solid rgba(255,255,255,0.03)`, background: fds ? 'rgba(212,175,55,0.03)' : 'transparent' }}>
                        <td style={{ padding: '10px 14px' }}>
                          <p style={{ color: S.text, fontSize: 12, fontWeight: 500, margin: 0 }}>{dayjs(d.data).format('DD/MM/YYYY')}</p>
                          <p style={{ color: fds ? S.gold : S.label, fontSize: 10, margin: 0 }}>{DIAS_SEMANA[dayjs(d.data).day()]}</p>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                          <span style={{ color: S.gold, fontSize: 13, fontWeight: 700, fontFamily: 'monospace' }}>{fmt(Number(d.total))}</span>
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: S.muted, fontSize: 12 }}>{d.num_comandas}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: S.green, fontSize: 12, fontWeight: 600, fontFamily: 'monospace' }}>
                          {Number(d.num_comandas) > 0 ? fmt(Number(d.total) / Number(d.num_comandas)) : '—'}
                        </td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: S.text, fontSize: 12, fontFamily: 'monospace' }}>{fmt(Number(d.bebidas))}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: S.text, fontSize: 12, fontFamily: 'monospace' }}>{fmt(Number(d.alimentos))}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: S.muted, fontSize: 12, fontFamily: 'monospace' }}>{fmt(Number(d.couvert))}</td>
                        <td style={{ padding: '10px 14px', textAlign: 'right', color: S.muted, fontSize: 12, fontFamily: 'monospace' }}>{fmt(Number(d.taxa_servico))}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ background: 'rgba(255,255,255,0.03)', borderTop: `1px solid ${S.border}` }}>
                    <td style={{ padding: '10px 14px', color: S.text, fontSize: 12, fontWeight: 700 }}>Total</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: S.gold, fontSize: 13, fontWeight: 800, fontFamily: 'monospace' }}>{fmt(totalPeriodo)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: S.text, fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>{totComandas}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: S.green, fontSize: 12, fontWeight: 800, fontFamily: 'monospace' }}>{fmt(ticketMedio)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: S.text, fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>{fmt(totBebidas)}</td>
                    <td style={{ padding: '10px 14px', textAlign: 'right', color: S.text, fontSize: 12, fontWeight: 700, fontFamily: 'monospace' }}>{fmt(totAlimentos)}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>

          <p style={{ color: S.label, fontSize: 10, textAlign: 'right' }}>
            Faturamento bruto por noite operacional, direto da ZIG. Sincroniza automaticamente todo dia às 05:15.
          </p>
        </>
      )}
    </div>
  );
};

export default FaturamentoZig;
