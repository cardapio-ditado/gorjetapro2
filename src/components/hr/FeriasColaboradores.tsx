import React, { useState, useEffect, useCallback } from 'react';
import { Plus, Search, Filter, Calendar, Clock, CheckCircle, XCircle, AlertTriangle, CreditCard as Edit2, Trash2, Download, CalendarDays, CalendarCheck, Timer, Award, Target, Activity, Users, Brain, ChevronRight, Info, BarChart2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import MonitoramentoFeriasIA from './MonitoramentoFeriasIA';
import dayjs from 'dayjs';
import isSameOrBefore from 'dayjs/plugin/isSameOrBefore';
import isSameOrAfter from 'dayjs/plugin/isSameOrAfter';
import isBetween from 'dayjs/plugin/isBetween';
import { exportToExcel } from '../../utils/reportGenerator';

dayjs.extend(isSameOrBefore);
dayjs.extend(isSameOrAfter);
dayjs.extend(isBetween);

// ────────────────────────────────────────
// Types
// ────────────────────────────────────────

interface Ferias {
  id: string;
  colaborador_id: string;
  periodo_aquisitivo_id?: string;
  data_inicio: string;
  data_fim: string;
  dias_corridos: number;
  dias_uteis: number;
  data_prevista_retorno?: string;
  status: 'previsto' | 'solicitado' | 'aprovado' | 'gozado' | 'cancelado';
  data_solicitacao?: string;
  data_aprovacao?: string;
  observacoes?: string;
  colaborador_nome: string;
  data_admissao: string;
  funcao_nome?: string;
  dias_vencimento: number;
}

interface Periodo {
  id: string;
  colaborador_id: string;
  periodo_aquisitivo_inicio: string;
  periodo_aquisitivo_fim: string;
  periodo_concessivo_inicio: string;
  periodo_concessivo_fim: string;
  dias_direito: number;
  dias_gozados: number;
  dias_restantes: number;
  status: string;
  observacoes?: string;
  colaborador_nome?: string;
  funcao_nome?: string;
}

const inp = 'w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#7D1F2C]/60';
const sel = 'w-full bg-[#0e1019] border border-white/15 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#7D1F2C]/60';

// ────────────────────────────────────────
// Helpers
// ────────────────────────────────────────

const statusFeriasColor: Record<string, string> = {
  previsto: 'text-blue-300 bg-blue-900/30 border-blue-700/40',
  solicitado: 'text-yellow-300 bg-yellow-900/30 border-yellow-700/40',
  aprovado: 'text-green-300 bg-green-900/30 border-green-700/40',
  gozado: 'text-sky-300 bg-sky-900/30 border-sky-700/40',
  cancelado: 'text-red-300 bg-red-900/30 border-red-700/40',
};

const statusFeriasLabel: Record<string, string> = {
  previsto: 'Previsto', solicitado: 'Solicitado', aprovado: 'Aprovado',
  gozado: 'Gozado', cancelado: 'Cancelado',
};

const periodoStatusColor: Record<string, string> = {
  pendente: 'text-blue-300 bg-blue-900/30',
  parcial: 'text-yellow-300 bg-yellow-900/30',
  gozado: 'text-green-300 bg-green-900/30',
  vencido: 'text-red-300 bg-red-900/30',
};

function calcularDiasUteis(dataInicio: string, dataFim: string) {
  let dias = 0;
  let d = dayjs(dataInicio);
  const fim = dayjs(dataFim);
  while (d.isSameOrBefore(fim)) {
    if (d.day() !== 0 && d.day() !== 6) dias++;
    d = d.add(1, 'day');
  }
  return dias;
}

function calcularDataRetorno(dataFim: string) {
  let d = dayjs(dataFim).add(1, 'day');
  while (d.day() === 0 || d.day() === 6) d = d.add(1, 'day');
  return d.format('YYYY-MM-DD');
}

function diasParaVencer(dataFim: string) {
  return dayjs(dataFim).diff(dayjs(), 'day');
}

// ────────────────────────────────────────
// Component
// ────────────────────────────────────────

const FeriasColaboradores: React.FC = () => {
  const [viewMode, setViewMode] = useState<'ferias' | 'periodos' | 'monitoramento'>('periodos');
  const [ferias, setFerias] = useState<Ferias[]>([]);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Form - Férias
  const [showFeriasForm, setShowFeriasForm] = useState(false);
  const [editingFerias, setEditingFerias] = useState<Ferias | null>(null);
  const [periodosDisponiveis, setPeriodosDisponiveis] = useState<Periodo[]>([]);
  const [feriasForm, setFeriasForm] = useState({
    colaborador_id: '', periodo_aquisitivo_id: '',
    data_inicio: '', data_fim: '', observacoes: '',
  });

  // Form - Período
  const [showPeriodoForm, setShowPeriodoForm] = useState(false);
  const [periodoForm, setPeriodoForm] = useState({
    colaborador_id: '',
    periodo_aquisitivo_inicio: '', periodo_aquisitivo_fim: '',
    periodo_concessivo_inicio: '', periodo_concessivo_fim: '',
    dias_direito: '30', observacoes: '',
  });

  // Approval
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [feriasParaAprovar, setFeriasParaAprovar] = useState<Ferias | null>(null);
  const [obsAprovacao, setObsAprovacao] = useState('');

  // Filters
  const [searchFerias, setSearchFerias] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [anoFilter, setAnoFilter] = useState(new Date().getFullYear());
  const [searchPeriodos, setSearchPeriodos] = useState('');
  const [statusPeriodoFilter, setStatusPeriodoFilter] = useState('all');

  // Indicators
  const [indicadores, setIndicadores] = useState({
    total: 0, previstas: 0, solicitadas: 0, aprovadas: 0, vencidas: 0,
    periodosVencendo: 0, periodosCriticos: 0,
  });

  useEffect(() => {
    fetchColaboradores();
  }, []);

  useEffect(() => {
    if (viewMode === 'ferias') fetchFerias();
    if (viewMode === 'periodos') fetchPeriodos();
  }, [viewMode, statusFilter, anoFilter, statusPeriodoFilter]);

  useEffect(() => {
    fetchIndicadores();
  }, [ferias, periodos]);

  const fetchColaboradores = async () => {
    const { data } = await supabase
      .from('vw_colaboradores_completo')
      .select('id, nome_completo, data_admissao, funcao_nome, status')
      .eq('status', 'ativo')
      .order('nome_completo');
    setColaboradores(data || []);
  };

  const fetchFerias = async () => {
    setLoading(true);
    setError(null);
    try {
      let q = supabase.from('vw_ferias_detalhadas').select('*');
      if (statusFilter !== 'all') q = q.eq('status', statusFilter);
      q = q.gte('data_inicio', `${anoFilter}-01-01`).lte('data_inicio', `${anoFilter}-12-31`);
      const { data, error } = await q.order('data_inicio', { ascending: false });
      if (error) throw error;
      setFerias(data || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPeriodos = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('periodos_aquisitivos_ferias')
        .select('*, colaborador:colaboradores(nome_completo, funcao_personalizada)')
        .order('periodo_concessivo_fim', { ascending: true });
      if (statusPeriodoFilter !== 'all') q = q.eq('status', statusPeriodoFilter);
      const { data, error } = await q;
      if (error) throw error;
      const mapped = (data || []).map((p: any) => ({
        ...p,
        colaborador_nome: p.colaborador?.nome_completo || '—',
        funcao_nome: p.colaborador?.funcao_personalizada || '—',
      }));
      setPeriodos(mapped);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPeriodosDisponiveis = async (colaboradorId: string) => {
    const { data } = await supabase
      .from('periodos_aquisitivos_ferias')
      .select('*, colaborador:colaboradores(nome_completo)')
      .eq('colaborador_id', colaboradorId)
      .in('status', ['pendente', 'parcial'])
      .order('periodo_aquisitivo_inicio', { ascending: false });
    const mapped = (data || []).map((p: any) => ({
      ...p,
      colaborador_nome: p.colaborador?.nome_completo || '—',
    }));
    setPeriodosDisponiveis(mapped);
  };

  const fetchIndicadores = useCallback(() => {
    const previstas = ferias.filter(f => f.status === 'previsto').length;
    const solicitadas = ferias.filter(f => f.status === 'solicitado').length;
    const aprovadas = ferias.filter(f => f.status === 'aprovado').length;
    const vencidas = ferias.filter(f => f.dias_vencimento < 0).length;
    const periodosVencendo = periodos.filter(p => {
      const d = diasParaVencer(p.periodo_concessivo_fim);
      return d >= 0 && d <= 60 && p.status !== 'gozado';
    }).length;
    const periodosCriticos = periodos.filter(p => {
      const d = diasParaVencer(p.periodo_concessivo_fim);
      return d < 0 && p.status !== 'gozado';
    }).length;
    setIndicadores({ total: ferias.length, previstas, solicitadas, aprovadas, vencidas, periodosVencendo, periodosCriticos });
  }, [ferias, periodos]);

  // ── Férias CRUD ──

  const salvarFerias = async () => {
    if (!feriasForm.colaborador_id || !feriasForm.data_inicio || !feriasForm.data_fim) {
      return setError('Preencha colaborador, data de início e data de fim.');
    }
    const ini = dayjs(feriasForm.data_inicio);
    const fim = dayjs(feriasForm.data_fim);
    if (fim.isSameOrBefore(ini)) return setError('Data de fim deve ser posterior à data de início.');

    setLoading(true);
    setError(null);
    try {
      const payload = {
        colaborador_id: feriasForm.colaborador_id,
        periodo_aquisitivo_id: feriasForm.periodo_aquisitivo_id || null,
        data_inicio: feriasForm.data_inicio,
        data_fim: feriasForm.data_fim,
        observacoes: feriasForm.observacoes || null,
        dias_corridos: fim.diff(ini, 'days') + 1,
        dias_uteis: calcularDiasUteis(feriasForm.data_inicio, feriasForm.data_fim),
        data_prevista_retorno: calcularDataRetorno(feriasForm.data_fim),
        status: editingFerias?.status || 'previsto',
      };
      if (editingFerias) {
        const { error } = await supabase.from('ferias_colaboradores').update(payload).eq('id', editingFerias.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('ferias_colaboradores').insert([payload]);
        if (error) throw error;
      }
      setShowFeriasForm(false);
      setEditingFerias(null);
      setFeriasForm({ colaborador_id: '', periodo_aquisitivo_id: '', data_inicio: '', data_fim: '', observacoes: '' });
      fetchFerias();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSolicitar = async (id: string) => {
    await supabase.from('ferias_colaboradores').update({ status: 'solicitado', data_solicitacao: new Date().toISOString() }).eq('id', id);
    fetchFerias();
  };

  const handleApproval = async (id: string, aprovado: boolean) => {
    await supabase.from('ferias_colaboradores').update({
      status: aprovado ? 'aprovado' : 'cancelado',
      data_aprovacao: aprovado ? new Date().toISOString() : null,
      observacoes: obsAprovacao || null,
    }).eq('id', id);
    setShowApprovalModal(false);
    fetchFerias();
  };

  const handleIniciarFerias = async (id: string) => {
    await supabase.from('ferias_colaboradores').update({ status: 'gozado' }).eq('id', id);
    fetchFerias();
  };

  const excluirFerias = async (id: string) => {
    if (!confirm('Excluir este período de férias?')) return;
    await supabase.from('ferias_colaboradores').delete().eq('id', id);
    fetchFerias();
  };

  // ── Período CRUD ──

  const salvarPeriodo = async () => {
    if (!periodoForm.colaborador_id || !periodoForm.periodo_aquisitivo_inicio || !periodoForm.periodo_concessivo_fim) {
      return setError('Preencha colaborador e as datas do período.');
    }
    setLoading(true);
    setError(null);
    try {
      const { error } = await supabase.from('periodos_aquisitivos_ferias').insert([{
        colaborador_id: periodoForm.colaborador_id,
        periodo_aquisitivo_inicio: periodoForm.periodo_aquisitivo_inicio,
        periodo_aquisitivo_fim: periodoForm.periodo_aquisitivo_fim,
        periodo_concessivo_inicio: periodoForm.periodo_concessivo_inicio,
        periodo_concessivo_fim: periodoForm.periodo_concessivo_fim,
        dias_direito: parseInt(periodoForm.dias_direito) || 30,
        dias_gozados: 0,
        status: 'pendente',
        observacoes: periodoForm.observacoes || null,
      }]);
      if (error) throw error;
      setShowPeriodoForm(false);
      setPeriodoForm({
        colaborador_id: '', periodo_aquisitivo_inicio: '', periodo_aquisitivo_fim: '',
        periodo_concessivo_inicio: '', periodo_concessivo_fim: '',
        dias_direito: '30', observacoes: '',
      });
      fetchPeriodos();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const excluirPeriodo = async (id: string) => {
    if (!confirm('Excluir este período aquisitivo?')) return;
    await supabase.from('periodos_aquisitivos_ferias').delete().eq('id', id);
    fetchPeriodos();
  };

  // Auto-fill período concessivo when aquisitivo dates are set
  const autoFillConcessivo = (iniAquis: string, fimAquis: string) => {
    if (iniAquis && fimAquis) {
      const iniConc = dayjs(fimAquis).add(1, 'day').format('YYYY-MM-DD');
      const fimConc = dayjs(fimAquis).add(1, 'year').format('YYYY-MM-DD');
      setPeriodoForm(p => ({ ...p, periodo_concessivo_inicio: iniConc, periodo_concessivo_fim: fimConc }));
    }
  };

  // Auto-fill aquisitivo from admission date
  const autoFillFromAdmissao = (colaboradorId: string) => {
    const colab = colaboradores.find(c => c.id === colaboradorId);
    if (!colab?.data_admissao) return;
    const adm = dayjs(colab.data_admissao);
    const hoje = dayjs();
    // Find the most recent completed aquisitivo year
    let anosCompletos = hoje.diff(adm, 'year');
    if (anosCompletos < 1) anosCompletos = 1;
    const iniAquis = adm.add(anosCompletos - 1, 'year').format('YYYY-MM-DD');
    const fimAquis = adm.add(anosCompletos, 'year').subtract(1, 'day').format('YYYY-MM-DD');
    const iniConc = adm.add(anosCompletos, 'year').format('YYYY-MM-DD');
    const fimConc = adm.add(anosCompletos + 1, 'year').subtract(1, 'day').format('YYYY-MM-DD');
    setPeriodoForm(p => ({
      ...p,
      periodo_aquisitivo_inicio: iniAquis,
      periodo_aquisitivo_fim: fimAquis,
      periodo_concessivo_inicio: iniConc,
      periodo_concessivo_fim: fimConc,
    }));
  };

  const exportarFerias = () => {
    if (filteredFerias.length === 0) return alert('Sem dados para exportar.');
    const headers = ['Colaborador', 'Função', 'Início', 'Fim', 'Dias Corridos', 'Dias Úteis', 'Retorno', 'Status', 'Observações'];
    const data = filteredFerias.map(f => [
      f.colaborador_nome, f.funcao_nome || '',
      dayjs(f.data_inicio).format('DD/MM/YYYY'), dayjs(f.data_fim).format('DD/MM/YYYY'),
      f.dias_corridos, f.dias_uteis,
      f.data_prevista_retorno ? dayjs(f.data_prevista_retorno).format('DD/MM/YYYY') : '',
      statusFeriasLabel[f.status] || f.status, f.observacoes || '',
    ]);
    exportToExcel(data, `ferias-${dayjs().format('YYYY-MM-DD')}`, headers);
  };

  const filteredFerias = ferias.filter(f =>
    f.colaborador_nome.toLowerCase().includes(searchFerias.toLowerCase()) ||
    (f.observacoes || '').toLowerCase().includes(searchFerias.toLowerCase())
  );

  const filteredPeriodos = periodos.filter(p =>
    p.colaborador_nome?.toLowerCase().includes(searchPeriodos.toLowerCase())
  );

  // Countdown badge
  const GozoBadge = ({ p }: { p: Periodo }) => {
    const dias = diasParaVencer(p.periodo_concessivo_fim);
    if (p.status === 'gozado') return <span className="px-2 py-0.5 text-xs rounded-full bg-green-900/30 text-green-300">Concluído</span>;
    if (dias < 0) return <span className="px-2 py-0.5 text-xs rounded-full bg-red-900/40 text-red-300 font-semibold">Vencido há {Math.abs(dias)}d</span>;
    if (dias <= 30) return <span className="px-2 py-0.5 text-xs rounded-full bg-red-900/30 text-red-300 font-semibold animate-pulse">{dias}d para vencer</span>;
    if (dias <= 60) return <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-900/30 text-yellow-300">{dias}d para vencer</span>;
    return <span className="px-2 py-0.5 text-xs rounded-full bg-white/10 text-white/50">{dias}d para vencer</span>;
  };

  return (
    <div className="space-y-6">
      {/* View Mode Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
          {([
            { key: 'periodos', label: 'Períodos', icon: CalendarDays },
            { key: 'ferias', label: 'Controle de Férias', icon: Calendar },
            { key: 'monitoramento', label: 'Monitoramento IA', icon: Brain },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setViewMode(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === key ? 'bg-[#7D1F2C] text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* Quick KPIs */}
        <div className="flex gap-3 flex-wrap">
          {indicadores.periodosCriticos > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-red-900/30 border border-red-700/40 rounded-xl text-sm text-red-300">
              <AlertTriangle className="w-4 h-4" />
              {indicadores.periodosCriticos} período{indicadores.periodosCriticos > 1 ? 's' : ''} vencido{indicadores.periodosCriticos > 1 ? 's' : ''}
            </div>
          )}
          {indicadores.periodosVencendo > 0 && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-yellow-900/30 border border-yellow-700/40 rounded-xl text-sm text-yellow-300">
              <Timer className="w-4 h-4" />
              {indicadores.periodosVencendo} vencendo em 60d
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-3 bg-red-900/30 text-red-300 rounded-xl border border-red-700/40 text-sm">{error}</div>
      )}

      {/* ───── MONITORAMENTO IA ───── */}
      {viewMode === 'monitoramento' && <MonitoramentoFeriasIA />}

      {/* ───── PERÍODOS AQUISITIVOS ───── */}
      {viewMode === 'periodos' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-bold text-white">Períodos Aquisitivos e de Gozo</h3>
              <p className="text-white/50 text-sm">Gerencie os períodos antes de cadastrar férias</p>
            </div>
            <button
              onClick={() => { setPeriodoForm({ colaborador_id: '', periodo_aquisitivo_inicio: '', periodo_aquisitivo_fim: '', periodo_concessivo_inicio: '', periodo_concessivo_fim: '', dias_direito: '30', observacoes: '' }); setShowPeriodoForm(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-[#7D1F2C] text-white rounded-xl hover:bg-[#9D2F3C] text-sm font-medium"
            >
              <Plus className="w-4 h-4" /> Novo Período
            </button>
          </div>

          {/* Explicação */}
          <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-4 flex gap-3 text-sm text-blue-300">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium mb-1">Como funciona:</p>
              <p className="text-blue-300/70">O <strong className="text-blue-200">Período Aquisitivo</strong> é o ano de trabalho em que o colaborador conquista o direito às férias. O <strong className="text-blue-200">Período de Gozo (Concessivo)</strong> é o prazo de 12 meses após o aquisitivo em que as férias devem ser tiradas. Após criar o período, vá em "Controle de Férias" para agendar as datas.</p>
            </div>
          </div>

          {/* Filters */}
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-48 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 w-4 h-4" />
              <input className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/15 rounded-xl text-white text-sm placeholder-white/30 focus:outline-none" placeholder="Buscar colaborador..." value={searchPeriodos} onChange={e => setSearchPeriodos(e.target.value)} />
            </div>
            <select className={sel + ' w-auto'} value={statusPeriodoFilter} onChange={e => { setStatusPeriodoFilter(e.target.value); }}>
              <option value="all">Todos os status</option>
              <option value="pendente">Pendente</option>
              <option value="parcial">Parcial</option>
              <option value="gozado">Gozado</option>
              <option value="vencido">Vencido</option>
            </select>
          </div>

          {/* Períodos list */}
          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#7D1F2C]" /></div>
          ) : filteredPeriodos.length === 0 ? (
            <div className="text-center py-12 bg-[#12141f] border border-white/10 rounded-xl">
              <CalendarDays className="w-12 h-12 text-white/20 mx-auto mb-3" />
              <p className="text-white/40 text-sm">Nenhum período cadastrado.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredPeriodos.map(p => {
                const diasGozo = diasParaVencer(p.periodo_concessivo_fim);
                const isCritico = diasGozo < 0 && p.status !== 'gozado';
                const isAlerta = diasGozo >= 0 && diasGozo <= 60 && p.status !== 'gozado';
                return (
                  <div key={p.id} className={`bg-[#12141f] border rounded-xl p-4 ${isCritico ? 'border-red-700/50 bg-red-900/10' : isAlerta ? 'border-yellow-700/40 bg-yellow-900/10' : 'border-white/10'}`}>
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-white truncate">{p.colaborador_nome}</p>
                          <span className={`px-2 py-0.5 text-xs rounded-full font-medium ${periodoStatusColor[p.status] || 'bg-white/10 text-white/60'}`}>{p.status}</span>
                        </div>
                        <p className="text-white/40 text-xs mb-3">{p.funcao_nome}</p>

                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          <div>
                            <p className="text-white/40 text-xs mb-0.5">Período Aquisitivo</p>
                            <p className="text-white/80 font-medium">
                              {dayjs(p.periodo_aquisitivo_inicio).format('DD/MM/YYYY')}<br />
                              <span className="text-white/40">até</span>{' '}
                              {dayjs(p.periodo_aquisitivo_fim).format('DD/MM/YYYY')}
                            </p>
                          </div>
                          <div>
                            <p className="text-white/40 text-xs mb-0.5">Período de Gozo</p>
                            <p className={`font-medium ${isCritico ? 'text-red-300' : isAlerta ? 'text-yellow-300' : 'text-white/80'}`}>
                              {dayjs(p.periodo_concessivo_inicio).format('DD/MM/YYYY')}<br />
                              <span className={isCritico || isAlerta ? '' : 'text-white/40'}>até </span>
                              {dayjs(p.periodo_concessivo_fim).format('DD/MM/YYYY')}
                            </p>
                          </div>
                          <div>
                            <p className="text-white/40 text-xs mb-0.5">Dias</p>
                            <p className="text-white/80">
                              <span className="text-white font-semibold">{p.dias_restantes}</span> restantes
                              <br /><span className="text-white/40 text-xs">{p.dias_gozados} gozados de {p.dias_direito}</span>
                            </p>
                          </div>
                          <div>
                            <p className="text-white/40 text-xs mb-1">Alerta de Gozo</p>
                            <GozoBadge p={p} />
                          </div>
                        </div>

                        {/* Progress bar */}
                        <div className="mt-3">
                          <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${isCritico ? 'bg-red-500' : isAlerta ? 'bg-yellow-500' : 'bg-green-500'}`}
                              style={{ width: `${Math.min(100, (p.dias_gozados / p.dias_direito) * 100)}%` }}
                            />
                          </div>
                          <p className="text-white/30 text-xs mt-0.5">{Math.round((p.dias_gozados / p.dias_direito) * 100)}% utilizado</p>
                        </div>
                      </div>

                      <div className="flex gap-1.5 shrink-0">
                        <button
                          onClick={() => { setViewMode('ferias'); setShowFeriasForm(true); setFeriasForm(f => ({ ...f, colaborador_id: p.colaborador_id, periodo_aquisitivo_id: p.id })); fetchPeriodosDisponiveis(p.colaborador_id); }}
                          className="flex items-center gap-1 px-3 py-1.5 bg-[#7D1F2C]/30 text-[#e05060] border border-[#7D1F2C]/40 rounded-lg hover:bg-[#7D1F2C]/50 text-xs transition-colors"
                          title="Agendar férias deste período"
                        >
                          <Plus className="w-3.5 h-3.5" /> Agendar
                        </button>
                        <button onClick={() => excluirPeriodo(p.id)} className="p-1.5 text-red-400/40 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ───── CONTROLE DE FÉRIAS ───── */}
      {viewMode === 'ferias' && (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-lg font-bold text-white">Controle de Férias</h3>
            <div className="flex gap-2">
              <button onClick={exportarFerias} className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/15 rounded-xl text-white/70 hover:bg-white/10 text-sm">
                <Download className="w-4 h-4" /> Exportar
              </button>
              <button onClick={() => { setEditingFerias(null); setFeriasForm({ colaborador_id: '', periodo_aquisitivo_id: '', data_inicio: '', data_fim: '', observacoes: '' }); setShowFeriasForm(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-[#7D1F2C] text-white rounded-xl hover:bg-[#9D2F3C] text-sm font-medium">
                <Plus className="w-4 h-4" /> Cadastrar Férias
              </button>
            </div>
          </div>

          {/* Indicadores */}
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
            {[
              { label: 'Colaboradores', value: colaboradores.length, icon: Users, color: 'text-blue-400' },
              { label: 'Previstas', value: indicadores.previstas, icon: Calendar, color: 'text-sky-400' },
              { label: 'Solicitadas', value: indicadores.solicitadas, icon: Clock, color: 'text-yellow-400' },
              { label: 'Aprovadas', value: indicadores.aprovadas, icon: CheckCircle, color: 'text-green-400' },
              { label: 'Em Gozo', value: ferias.filter(f => f.status === 'gozado' && dayjs().isBetween(dayjs(f.data_inicio), dayjs(f.data_fim), 'day', '[]')).length, icon: Award, color: 'text-sky-400' },
              { label: 'Vencidas', value: indicadores.vencidas, icon: AlertTriangle, color: 'text-red-400' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-[#12141f] border border-white/10 rounded-xl p-4 flex items-center gap-3">
                <Icon className={`w-7 h-7 ${color} shrink-0`} />
                <div>
                  <p className="text-xs text-white/40">{label}</p>
                  <p className={`text-xl font-bold ${color}`}>{value}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Filters */}
          <div className="bg-[#12141f] border border-white/10 rounded-xl p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="relative col-span-2 md:col-span-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 w-4 h-4" />
                <input className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/15 rounded-xl text-white text-sm placeholder-white/30 focus:outline-none" placeholder="Buscar colaborador..." value={searchFerias} onChange={e => setSearchFerias(e.target.value)} />
              </div>
              <select className={sel} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="all">Todos os Status</option>
                <option value="previsto">Previsto</option>
                <option value="solicitado">Solicitado</option>
                <option value="aprovado">Aprovado</option>
                <option value="gozado">Gozado</option>
                <option value="cancelado">Cancelado</option>
              </select>
              <select className={sel} value={anoFilter} onChange={e => setAnoFilter(parseInt(e.target.value))}>
                {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <button onClick={fetchFerias} className="flex items-center justify-center gap-2 px-4 py-2 bg-[#7D1F2C] text-white rounded-xl hover:bg-[#9D2F3C] text-sm">
                <Filter className="w-4 h-4" /> Filtrar
              </button>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#7D1F2C]" /></div>
          ) : (
            <div className="bg-[#12141f] border border-white/10 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      {['Colaborador', 'Período', 'Duração', 'Retorno', 'Status', 'Alertas', 'Ações'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredFerias.map(f => (
                      <tr key={f.id} className={`hover:bg-white/3 transition-colors ${
                        f.dias_vencimento < 0 ? 'bg-red-900/10 border-l-2 border-red-600' :
                        f.dias_vencimento <= 30 ? 'bg-yellow-900/10 border-l-2 border-yellow-600' : ''
                      }`}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-white">{f.colaborador_nome}</p>
                          <p className="text-xs text-white/40">{f.funcao_nome}</p>
                          <p className="text-xs text-white/30">Adm: {dayjs(f.data_admissao).format('DD/MM/YYYY')}</p>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <p className="text-white">{dayjs(f.data_inicio).format('DD/MM/YYYY')}</p>
                          <p className="text-white/40 text-xs">até</p>
                          <p className="text-white">{dayjs(f.data_fim).format('DD/MM/YYYY')}</p>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <p className="text-white">{f.dias_corridos}d corridos</p>
                          <p className="text-white/40 text-xs">{f.dias_uteis} úteis</p>
                        </td>
                        <td className="px-4 py-3 text-sm text-white/80">
                          {f.data_prevista_retorno ? dayjs(f.data_prevista_retorno).format('DD/MM/YYYY') : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full border ${statusFeriasColor[f.status] || 'text-white/60 bg-white/10 border-white/10'}`}>
                            {statusFeriasLabel[f.status] || f.status}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm space-y-1">
                          {f.data_aprovacao && <p className="text-green-400 text-xs flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Aprovado {dayjs(f.data_aprovacao).format('DD/MM')}</p>}
                          {f.dias_vencimento < 0 && <p className="text-red-400 text-xs flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Vencida há {Math.abs(f.dias_vencimento)}d</p>}
                          {f.dias_vencimento >= 0 && f.dias_vencimento <= 30 && <p className="text-yellow-400 text-xs flex items-center gap-1"><Timer className="w-3 h-3" /> Vence em {f.dias_vencimento}d</p>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {f.status === 'previsto' && (
                              <button onClick={() => handleSolicitar(f.id)} className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded-lg" title="Solicitar">
                                <CalendarCheck className="w-4 h-4" />
                              </button>
                            )}
                            {f.status === 'solicitado' && (
                              <button onClick={() => { setFeriasParaAprovar(f); setShowApprovalModal(true); }} className="p-1.5 text-green-400 hover:text-green-300 hover:bg-green-900/30 rounded-lg" title="Aprovar">
                                <CheckCircle className="w-4 h-4" />
                              </button>
                            )}
                            {f.status === 'aprovado' && dayjs().isSameOrAfter(dayjs(f.data_inicio)) && (
                              <button onClick={() => handleIniciarFerias(f.id)} className="p-1.5 text-sky-400 hover:text-sky-300 hover:bg-sky-900/30 rounded-lg" title="Iniciar Gozo">
                                <Award className="w-4 h-4" />
                              </button>
                            )}
                            <button onClick={() => { setEditingFerias(f); setFeriasForm({ colaborador_id: f.colaborador_id, periodo_aquisitivo_id: f.periodo_aquisitivo_id || '', data_inicio: f.data_inicio, data_fim: f.data_fim, observacoes: f.observacoes || '' }); fetchPeriodosDisponiveis(f.colaborador_id); setShowFeriasForm(true); }}
                              className="p-1.5 text-white/40 hover:text-white hover:bg-white/5 rounded-lg" title="Editar">
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button onClick={() => excluirFerias(f.id)} className="p-1.5 text-red-400/40 hover:text-red-400 hover:bg-red-900/20 rounded-lg" title="Excluir">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredFerias.length === 0 && (
                <div className="text-center py-12">
                  <CalendarDays className="w-12 h-12 text-white/20 mx-auto mb-3" />
                  <p className="text-white/40 text-sm">Nenhuma férias encontrada.</p>
                  <button onClick={() => { setViewMode('periodos'); }} className="mt-3 text-sm text-[#7D1F2C] hover:text-[#e05060]">
                    Criar um período aquisitivo primeiro
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══════ MODAL: Novo Período ═══════ */}
      {showPeriodoForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#12141f] border border-white/15 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h3 className="text-lg font-bold text-white">Novo Período Aquisitivo</h3>
              <button onClick={() => setShowPeriodoForm(false)} className="text-white/40 hover:text-white"><XCircle className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-white/50 mb-1">Colaborador *</label>
                <select className={sel} value={periodoForm.colaborador_id}
                  onChange={e => {
                    const id = e.target.value;
                    setPeriodoForm(p => ({ ...p, colaborador_id: id }));
                    if (id) autoFillFromAdmissao(id);
                  }}>
                  <option value="">Selecionar colaborador...</option>
                  {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
                </select>
              </div>

              <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-3 text-xs text-blue-300">
                As datas foram preenchidas automaticamente com base na data de admissão. Revise e ajuste se necessário.
              </div>

              <div>
                <p className="text-xs font-semibold text-white/60 mb-2 uppercase tracking-wide">Período Aquisitivo (ano trabalhado)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-white/50 mb-1">Início</label>
                    <input type="date" className={inp} value={periodoForm.periodo_aquisitivo_inicio}
                      onChange={e => { const v = e.target.value; setPeriodoForm(p => ({ ...p, periodo_aquisitivo_inicio: v })); autoFillConcessivo(v, periodoForm.periodo_aquisitivo_fim); }} />
                  </div>
                  <div>
                    <label className="block text-xs text-white/50 mb-1">Fim</label>
                    <input type="date" className={inp} value={periodoForm.periodo_aquisitivo_fim}
                      onChange={e => { const v = e.target.value; setPeriodoForm(p => ({ ...p, periodo_aquisitivo_fim: v })); autoFillConcessivo(periodoForm.periodo_aquisitivo_inicio, v); }} />
                  </div>
                </div>
              </div>

              <div>
                <p className="text-xs font-semibold text-white/60 mb-2 uppercase tracking-wide">Período de Gozo (prazo para tirar férias)</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-white/50 mb-1">Início</label>
                    <input type="date" className={inp} value={periodoForm.periodo_concessivo_inicio}
                      onChange={e => setPeriodoForm(p => ({ ...p, periodo_concessivo_inicio: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs text-white/50 mb-1">Fim (prazo máximo)</label>
                    <input type="date" className={inp} value={periodoForm.periodo_concessivo_fim}
                      onChange={e => setPeriodoForm(p => ({ ...p, periodo_concessivo_fim: e.target.value }))} />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs text-white/50 mb-1">Dias de Direito</label>
                <input type="number" className={inp} value={periodoForm.dias_direito}
                  onChange={e => setPeriodoForm(p => ({ ...p, dias_direito: e.target.value }))} min="1" max="30" />
              </div>

              <div>
                <label className="block text-xs text-white/50 mb-1">Observações</label>
                <textarea className={inp + ' resize-none'} rows={2} value={periodoForm.observacoes}
                  onChange={e => setPeriodoForm(p => ({ ...p, observacoes: e.target.value }))} />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowPeriodoForm(false)} className="flex-1 px-4 py-2 border border-white/15 text-white/70 rounded-xl hover:bg-white/5 text-sm">Cancelar</button>
                <button onClick={salvarPeriodo} disabled={loading} className="flex-1 px-4 py-2 bg-[#7D1F2C] text-white rounded-xl hover:bg-[#9D2F3C] disabled:opacity-50 text-sm font-medium">
                  {loading ? 'Salvando...' : 'Salvar Período'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ MODAL: Cadastrar Férias ═══════ */}
      {showFeriasForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#12141f] border border-white/15 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h3 className="text-lg font-bold text-white">{editingFerias ? 'Editar Férias' : 'Cadastrar Férias'}</h3>
              <button onClick={() => { setShowFeriasForm(false); setEditingFerias(null); }} className="text-white/40 hover:text-white"><XCircle className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs text-white/50 mb-1">Colaborador *</label>
                <select className={sel} value={feriasForm.colaborador_id}
                  onChange={e => { const id = e.target.value; setFeriasForm(f => ({ ...f, colaborador_id: id, periodo_aquisitivo_id: '' })); if (id) fetchPeriodosDisponiveis(id); }}>
                  <option value="">Selecionar colaborador...</option>
                  {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
                </select>
              </div>

              {feriasForm.colaborador_id && (
                <div>
                  <label className="block text-xs text-white/50 mb-1">Período Aquisitivo</label>
                  <select className={sel} value={feriasForm.periodo_aquisitivo_id}
                    onChange={e => setFeriasForm(f => ({ ...f, periodo_aquisitivo_id: e.target.value }))}>
                    <option value="">Selecionar período (opcional)...</option>
                    {periodosDisponiveis.map(p => (
                      <option key={p.id} value={p.id}>
                        {dayjs(p.periodo_aquisitivo_inicio).format('DD/MM/YYYY')} – {dayjs(p.periodo_aquisitivo_fim).format('DD/MM/YYYY')}
                        {' '}({p.dias_restantes}d restantes · gozo até {dayjs(p.periodo_concessivo_fim).format('DD/MM/YYYY')})
                      </option>
                    ))}
                  </select>
                  {periodosDisponiveis.length === 0 && (
                    <p className="text-xs text-amber-400 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Nenhum período disponível. Cadastre primeiro na aba "Períodos".
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Data de Início *</label>
                  <input type="date" className={inp} value={feriasForm.data_inicio}
                    onChange={e => setFeriasForm(f => ({ ...f, data_inicio: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Data de Fim *</label>
                  <input type="date" className={inp} value={feriasForm.data_fim}
                    onChange={e => setFeriasForm(f => ({ ...f, data_fim: e.target.value }))} />
                </div>
              </div>

              {feriasForm.data_inicio && feriasForm.data_fim && dayjs(feriasForm.data_fim).isAfter(dayjs(feriasForm.data_inicio)) && (
                <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-3">
                  <p className="text-xs font-semibold text-blue-300 mb-2">Cálculo Automático</p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div><p className="text-white/40 text-xs">Dias corridos</p><p className="text-white font-bold">{dayjs(feriasForm.data_fim).diff(dayjs(feriasForm.data_inicio), 'days') + 1}</p></div>
                    <div><p className="text-white/40 text-xs">Dias úteis</p><p className="text-white font-bold">{calcularDiasUteis(feriasForm.data_inicio, feriasForm.data_fim)}</p></div>
                    <div><p className="text-white/40 text-xs">Retorno</p><p className="text-white font-bold">{dayjs(calcularDataRetorno(feriasForm.data_fim)).format('DD/MM/YYYY')}</p></div>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs text-white/50 mb-1">Observações</label>
                <textarea className={inp + ' resize-none'} rows={2} value={feriasForm.observacoes}
                  onChange={e => setFeriasForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Observações..." />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowFeriasForm(false); setEditingFerias(null); }} className="flex-1 px-4 py-2 border border-white/15 text-white/70 rounded-xl hover:bg-white/5 text-sm">Cancelar</button>
                <button onClick={salvarFerias} disabled={loading} className="flex-1 px-4 py-2 bg-[#7D1F2C] text-white rounded-xl hover:bg-[#9D2F3C] disabled:opacity-50 text-sm font-medium">
                  {loading ? 'Salvando...' : editingFerias ? 'Salvar' : 'Cadastrar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ MODAL: Aprovação ═══════ */}
      {showApprovalModal && feriasParaAprovar && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#12141f] border border-white/15 rounded-2xl w-full max-w-md">
            <div className="p-5 border-b border-white/10">
              <h3 className="text-lg font-bold text-white">Aprovar / Rejeitar Férias</h3>
            </div>
            <div className="p-5 space-y-4">
              <div className="bg-white/5 rounded-xl p-4 text-sm space-y-1">
                <p className="font-semibold text-white">{feriasParaAprovar.colaborador_nome}</p>
                <p className="text-white/40">{feriasParaAprovar.funcao_nome}</p>
                <p className="text-white/70">Período: {dayjs(feriasParaAprovar.data_inicio).format('DD/MM/YYYY')} a {dayjs(feriasParaAprovar.data_fim).format('DD/MM/YYYY')}</p>
                <p className="text-white/70">Duração: {feriasParaAprovar.dias_corridos} dias corridos ({feriasParaAprovar.dias_uteis} úteis)</p>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1">Observações</label>
                <textarea className={inp + ' resize-none'} rows={3} value={obsAprovacao}
                  onChange={e => setObsAprovacao(e.target.value)} placeholder="Observações da decisão..." />
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => setShowApprovalModal(false)} className="flex-1 px-4 py-2 border border-white/15 text-white/70 rounded-xl hover:bg-white/5 text-sm">Cancelar</button>
                <button onClick={() => handleApproval(feriasParaAprovar.id, false)} className="flex-1 px-4 py-2 bg-red-700 text-white rounded-xl hover:bg-red-600 text-sm font-medium">Rejeitar</button>
                <button onClick={() => handleApproval(feriasParaAprovar.id, true)} className="flex-1 px-4 py-2 bg-green-700 text-white rounded-xl hover:bg-green-600 text-sm font-medium">Aprovar</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeriasColaboradores;
