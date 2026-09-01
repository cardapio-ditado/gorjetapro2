import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Plus, Search, Filter, Calendar, CheckCircle, XCircle, AlertTriangle, CreditCard as Edit2, Trash2, Download, CalendarDays, CalendarCheck, Timer, Award, Users, Brain, ChevronRight, Info } from 'lucide-react';
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
  data_admissao?: string;
}

/** Um lançamento de férias visto pela ótica do período a que pertence. */
interface Gozo {
  id: string;
  colaborador_id: string;
  periodo_aquisitivo_id?: string | null;
  data_inicio: string;
  data_fim: string;
  dias_corridos: number;
  status: string;
}

const inp = 'w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-wine/60';
const sel = 'w-full bg-[#0e1019] border border-white/15 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-wine/60';

// ────────────────────────────────────────
// Helpers
// ────────────────────────────────────────

const statusFeriasLabel: Record<string, string> = {
  previsto: 'Previsto', solicitado: 'Solicitado', aprovado: 'Aprovado',
  gozado: 'Gozado', cancelado: 'Cancelado',
};

/**
 * A situação REAL das férias vem das DATAS; o status do fluxo (previsto →
 * solicitado → aprovado → gozado) só diz em que pé está a burocracia. A tela
 * antiga lia o dias_vencimento da view (que é HOJE − data_fim, ou seja, dias
 * DESDE o término) como se fosse "dias até vencer" — resultado invertido:
 * quem estava DE FÉRIAS naquele momento aparecia como "Vencida há Xd".
 */
type SituacaoFerias = 'em_gozo' | 'agendada' | 'sem_registro' | 'gozada' | 'cancelada';

function situacaoFerias(f: { data_inicio: string; data_fim: string; status: string }): SituacaoFerias {
  if (f.status === 'cancelado') return 'cancelada';
  const hoje = dayjs();
  if (hoje.isBetween(dayjs(f.data_inicio), dayjs(f.data_fim), 'day', '[]')) return 'em_gozo';
  if (dayjs(f.data_inicio).isAfter(hoje, 'day')) return 'agendada';
  return f.status === 'gozado' ? 'gozada' : 'sem_registro';
}

const situacaoInfo: Record<SituacaoFerias, { rotulo: string; cls: string; prioridade: number }> = {
  em_gozo:      { rotulo: 'Em férias agora', cls: 'text-sky-300 bg-sky-900/30 border-sky-700/40', prioridade: 0 },
  sem_registro: { rotulo: 'Terminou sem registro', cls: 'text-red-300 bg-red-900/30 border-red-700/40', prioridade: 1 },
  agendada:     { rotulo: 'Agendada', cls: 'text-yellow-300 bg-yellow-900/30 border-yellow-700/40', prioridade: 2 },
  gozada:       { rotulo: 'Gozada', cls: 'text-green-300 bg-green-900/30 border-green-700/40', prioridade: 3 },
  cancelada:    { rotulo: 'Cancelada', cls: 'text-white/50 bg-white/10 border-white/10', prioridade: 4 },
};

// Os status reais do banco são pendente | parcial | completo | vencido —
// "gozado" nunca existiu aqui (era o bug que deixava o filtro sem efeito).
const periodoStatusLabel: Record<string, string> = {
  pendente: 'Pendente', parcial: 'Parcial', completo: 'Completo', vencido: 'Vencido',
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

/**
 * O k-ésimo ano base de quem foi admitido em `admissao`: 12 meses a partir do
 * aniversário de admissão. O concessivo (prazo para conceder) são os 12 meses
 * seguintes — art. 134 da CLT.
 */
function anoBaseN(admissao: string, k: number) {
  const adm = dayjs(admissao);
  const ini = adm.add(k, 'year');
  const fim = adm.add(k + 1, 'year').subtract(1, 'day');
  return {
    periodo_aquisitivo_inicio: ini.format('YYYY-MM-DD'),
    periodo_aquisitivo_fim: fim.format('YYYY-MM-DD'),
    periodo_concessivo_inicio: fim.add(1, 'day').format('YYYY-MM-DD'),
    periodo_concessivo_fim: fim.add(1, 'year').format('YYYY-MM-DD'),
  };
}

/** O ano base a que férias iniciadas em `dataInicio` pertencem, se ele ainda não existir. */
function anoBaseParaData(admissao: string, dataInicio: string) {
  // Férias se tiram DEPOIS de completar o ano base: o último completado antes
  // da data. Antes de fechar o primeiro ano (férias coletivas, por exemplo),
  // o ano base é o que está em curso.
  const k = Math.max(0, dayjs(dataInicio).diff(dayjs(admissao), 'year') - 1);
  return anoBaseN(admissao, k);
}

/**
 * Qual ano base "paga" as férias que começam em `dataInicio`.
 *
 * Os dias se consomem do mais antigo para o mais novo: se a pessoa tem saldo
 * de dois anos, as férias de hoje quitam o mais velho (é o que vence primeiro
 * e o que a lei manda pagar em dobro se atrasar). Só entra na conta ano base
 * já completado antes das férias. Sem saldo em lugar nenhum, fica o ano cujo
 * prazo de concessão cobre a data — para o RH ver que está lançando a mais.
 */
function sugerirAnoBase(periodos: Periodo[], dataInicio: string): Periodo | null {
  if (!dataInicio || periodos.length === 0) return null;
  const d = dayjs(dataInicio);
  const completados = periodos
    .filter(p => dayjs(p.periodo_aquisitivo_fim).isBefore(d, 'day'))
    .sort((a, b) => a.periodo_aquisitivo_inicio.localeCompare(b.periodo_aquisitivo_inicio));
  const comSaldo = completados.find(p => p.dias_restantes > 0);
  if (comSaldo) return comSaldo;
  const noPrazo = periodos.find(p =>
    d.isBetween(dayjs(p.periodo_concessivo_inicio), dayjs(p.periodo_concessivo_fim), 'day', '[]'));
  return noPrazo ?? null;
}

/** Sentinela do select de ano base: "crie o ano base certo para mim". */
const ANO_BASE_AUTO = '__auto__';

// ────────────────────────────────────────
// Component
// ────────────────────────────────────────

const FeriasColaboradores: React.FC = () => {
  const [viewMode, setViewMode] = useState<'ferias' | 'periodos' | 'monitoramento'>('periodos');
  const [ferias, setFerias] = useState<Ferias[]>([]);
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [gozos, setGozos] = useState<Gozo[]>([]);
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Confirmação visível depois de gravar. O modal fechava em silêncio e a
  // pessoa não tinha como saber se algo tinha sido salvo — nem onde.
  const [sucesso, setSucesso] = useState<string | null>(null);

  // Form - Férias
  const [showFeriasForm, setShowFeriasForm] = useState(false);
  const [editingFerias, setEditingFerias] = useState<Ferias | null>(null);
  const [periodosDisponiveis, setPeriodosDisponiveis] = useState<Periodo[]>([]);
  // Quando a pessoa escolhe o ano base com a própria mão, a sugestão
  // automática para de sobrescrever a escolha a cada mudança de data.
  const [anoBaseManual, setAnoBaseManual] = useState(false);
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
  // 'all' por padrao: o filtro antigo abria travado no ano corrente e so
  // oferecia 5 anos, entao o historico (ha lancamentos desde 2014) ficava
  // invisivel sem nenhum caminho para chega-lo.
  const [anoFilter, setAnoFilter] = useState<number | 'all'>('all');
  const [anosDisponiveis, setAnosDisponiveis] = useState<number[]>([]);
  const [searchPeriodos, setSearchPeriodos] = useState('');
  const [statusPeriodoFilter, setStatusPeriodoFilter] = useState('all');

  // Indicators
  const [indicadores, setIndicadores] = useState({
    total: 0, previstas: 0, solicitadas: 0, aprovadas: 0, vencidas: 0,
    periodosVencendo: 0, periodosCriticos: 0,
  });

  useEffect(() => {
    fetchColaboradores();
    fetchAnosDisponiveis();
  }, []);

  // statusPeriodoFilter ficou de fora de propósito: na visão por colaborador o
  // filtro de status é aplicado localmente, sem nova ida ao banco.
  useEffect(() => {
    if (viewMode === 'ferias') fetchFerias();
    if (viewMode === 'periodos') fetchPeriodos();
  }, [viewMode, statusFilter, anoFilter]);

  useEffect(() => {
    fetchIndicadores();
  }, [ferias, periodos]);

  useEffect(() => {
    if (!sucesso) return;
    const t = setTimeout(() => setSucesso(null), 12000);
    return () => clearTimeout(t);
  }, [sucesso]);

  // Sugere o ano base sempre que colaborador/data mudam — a menos que a
  // pessoa já tenha escolhido um por conta própria.
  useEffect(() => {
    if (editingFerias || anoBaseManual || !feriasForm.colaborador_id) return;
    const sugerido = sugerirAnoBase(periodosDisponiveis, feriasForm.data_inicio);
    const colab = colaboradores.find(c => c.id === feriasForm.colaborador_id);
    const proximo = sugerido ? sugerido.id : (feriasForm.data_inicio && colab?.data_admissao ? ANO_BASE_AUTO : '');
    if (proximo !== feriasForm.periodo_aquisitivo_id) {
      setFeriasForm(f => ({ ...f, periodo_aquisitivo_id: proximo }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feriasForm.colaborador_id, feriasForm.data_inicio, periodosDisponiveis, anoBaseManual, editingFerias]);

  const fetchAnosDisponiveis = async () => {
    const { data } = await supabase
      .from('ferias_colaboradores')
      .select('data_inicio')
      .order('data_inicio', { ascending: true })
      .limit(1);
    const primeiro = data?.[0]?.data_inicio ? new Date(data[0].data_inicio).getFullYear() : new Date().getFullYear();
    const ultimo = new Date().getFullYear() + 1;
    setAnosDisponiveis(Array.from({ length: ultimo - primeiro + 1 }, (_, i) => ultimo - i));
  };

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
      if (anoFilter !== 'all') {
        q = q.gte('data_inicio', `${anoFilter}-01-01`).lte('data_inicio', `${anoFilter}-12-31`);
      }
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
      // Períodos e gozos vêm juntos: a tela agrupa por colaborador e mostra o
      // gozo DENTRO do período a que pertence — filtro de status é local.
      const [pRes, gRes] = await Promise.all([
        supabase
          .from('periodos_aquisitivos_ferias')
          .select('*, colaborador:colaboradores(nome_completo, funcao_personalizada, data_admissao)')
          .order('periodo_aquisitivo_inicio', { ascending: false }),
        supabase
          .from('ferias_colaboradores')
          .select('id, colaborador_id, periodo_aquisitivo_id, data_inicio, data_fim, dias_corridos, status'),
      ]);
      if (pRes.error) throw pRes.error;
      if (gRes.error) throw gRes.error;
      setPeriodos((pRes.data || []).map((p: any) => ({
        ...p,
        colaborador_nome: p.colaborador?.nome_completo || '—',
        funcao_nome: p.colaborador?.funcao_personalizada || '—',
        data_admissao: p.colaborador?.data_admissao,
      })));
      setGozos((gRes.data || []) as Gozo[]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPeriodosDisponiveis = async (colaboradorId: string): Promise<Periodo[]> => {
    // Todos os períodos, inclusive vencidos: férias antigas se lançam num
    // período que já venceu — era o filtro por pendente/parcial que impedia.
    const { data } = await supabase
      .from('periodos_aquisitivos_ferias')
      .select('*, colaborador:colaboradores(nome_completo)')
      .eq('colaborador_id', colaboradorId)
      .order('periodo_aquisitivo_inicio', { ascending: true });
    const mapped: Periodo[] = (data || []).map((p: any) => ({
      ...p,
      colaborador_nome: p.colaborador?.nome_completo || '—',
    }));
    setPeriodosDisponiveis(mapped);
    return mapped;
  };

  /**
   * A ÚNICA porta de entrada para lançar férias. Recebe, opcionalmente, quem
   * e de qual ano base — os botões espalhados pela tela só passam isso.
   */
  const abrirLancamento = (colaboradorId = '', periodoId = '') => {
    setEditingFerias(null);
    setAnoBaseManual(!!periodoId);
    setFeriasForm({ colaborador_id: colaboradorId, periodo_aquisitivo_id: periodoId, data_inicio: '', data_fim: '', observacoes: '' });
    setPeriodosDisponiveis([]);
    if (colaboradorId) fetchPeriodosDisponiveis(colaboradorId);
    setError(null);
    setShowFeriasForm(true);
  };

  const fecharLancamento = () => {
    setShowFeriasForm(false);
    setEditingFerias(null);
    setAnoBaseManual(false);
    setError(null);
  };

  const rotuloAnoBase = (p: { periodo_aquisitivo_inicio: string; periodo_aquisitivo_fim: string }) =>
    `${dayjs(p.periodo_aquisitivo_inicio).format('YYYY')} → ${dayjs(p.periodo_aquisitivo_fim).format('YYYY')}`;

  /**
   * Cria os anos base que faltam entre a admissão e hoje. Idempotente: pula
   * os que já existem. É o que o RH fazia à mão, um por um, no botão errado.
   */
  const gerarAnosBase = async (colab: { id: string; nome_completo: string; data_admissao?: string }) => {
    if (!colab.data_admissao) return setError(`${colab.nome_completo} está sem data de admissão no cadastro — preencha em Colaboradores.`);
    setLoading(true);
    setError(null);
    try {
      const existentes = await fetchPeriodosDisponiveis(colab.id);
      const jaTem = new Set(existentes.map(p => p.periodo_aquisitivo_inicio));
      const novos: Array<ReturnType<typeof anoBaseN> & { colaborador_id: string; dias_direito: number; dias_gozados: number; status: string }> = [];
      for (let k = 0; ; k++) {
        const ab = anoBaseN(colab.data_admissao, k);
        if (dayjs(ab.periodo_aquisitivo_inicio).isAfter(dayjs(), 'day')) break;
        if (!jaTem.has(ab.periodo_aquisitivo_inicio)) {
          novos.push({ colaborador_id: colab.id, ...ab, dias_direito: 30, dias_gozados: 0, status: 'pendente' });
        }
      }
      if (novos.length === 0) {
        setSucesso(`${colab.nome_completo} já tem todos os anos base desde a admissão.`);
      } else {
        const { error } = await supabase.from('periodos_aquisitivos_ferias').insert(novos);
        if (error) throw error;
        setSucesso(`${novos.length} ano${novos.length > 1 ? 's' : ''} base criado${novos.length > 1 ? 's' : ''} para ${colab.nome_completo}, de ${dayjs(novos[0].periodo_aquisitivo_inicio).format('YYYY')} a ${dayjs(novos[novos.length - 1].periodo_aquisitivo_fim).format('YYYY')}.`);
        setExpandido(e => ({ ...e, [colab.id]: true }));
      }
      fetchPeriodos();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchIndicadores = useCallback(() => {
    const previstas = ferias.filter(f => f.status === 'previsto').length;
    const solicitadas = ferias.filter(f => f.status === 'solicitado').length;
    const aprovadas = ferias.filter(f => f.status === 'aprovado').length;
    // dias_vencimento da view é HOJE − data_fim (dias desde o término);
    // "vencida" aqui significa terminou sem ninguém registrar o gozo.
    const vencidas = ferias.filter(f => situacaoFerias(f) === 'sem_registro').length;
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
      const colab = colaboradores.find(c => c.id === feriasForm.colaborador_id);
      let periodoId: string | null = feriasForm.periodo_aquisitivo_id || null;
      let anoBaseCriado: string | null = null;

      // Sem ano base que sirva? Cria o certo na hora, a partir da admissão.
      // Era o passo que fazia o RH desistir: a tela mandava "cadastrar um ano
      // base primeiro" em outra aba, e o botão de lá parecia ser o de férias.
      if (periodoId === ANO_BASE_AUTO) {
        if (!colab?.data_admissao) throw new Error('Colaborador sem data de admissão no cadastro — preencha em Colaboradores para o ano base ser calculado.');
        const ab = anoBaseParaData(colab.data_admissao, feriasForm.data_inicio);
        const existente = periodosDisponiveis.find(p => p.periodo_aquisitivo_inicio === ab.periodo_aquisitivo_inicio);
        if (existente) {
          periodoId = existente.id;
        } else {
          const { data: novo, error: errAb } = await supabase
            .from('periodos_aquisitivos_ferias')
            .insert([{ colaborador_id: colab.id, ...ab, dias_direito: 30, dias_gozados: 0, status: 'pendente' }])
            .select('id')
            .single();
          if (errAb) throw errAb;
          periodoId = novo.id;
          anoBaseCriado = rotuloAnoBase(ab);
        }
      }

      const payload = {
        colaborador_id: feriasForm.colaborador_id,
        periodo_aquisitivo_id: periodoId,
        data_inicio: feriasForm.data_inicio,
        data_fim: feriasForm.data_fim,
        observacoes: feriasForm.observacoes || null,
        dias_corridos: fim.diff(ini, 'days') + 1,
        dias_uteis: calcularDiasUteis(feriasForm.data_inicio, feriasForm.data_fim),
        data_prevista_retorno: calcularDataRetorno(feriasForm.data_fim),
        // Datas que já passaram são registro histórico, não previsão: entram
        // direto como gozadas, sem obrigar ninguém a passar pelo fluxo de
        // solicitar/aprovar algo que já aconteceu.
        status: editingFerias?.status
          || (dayjs(feriasForm.data_fim).isBefore(dayjs(), 'day') ? 'gozado' : 'previsto'),
      };
      if (editingFerias) {
        const { error } = await supabase.from('ferias_colaboradores').update(payload).eq('id', editingFerias.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('ferias_colaboradores').insert([payload]);
        if (error) throw error;
      }

      const periodoUsado = periodosDisponiveis.find(p => p.id === periodoId);
      const nomeAnoBase = anoBaseCriado ? `ano base ${anoBaseCriado} (criado agora)` : periodoUsado ? `ano base ${rotuloAnoBase(periodoUsado)}` : 'sem ano base vinculado';
      setSucesso(
        `${editingFerias ? 'Férias atualizadas' : payload.status === 'gozado' ? 'Férias registradas como gozadas' : 'Férias agendadas'}: `
        + `${colab?.nome_completo ?? 'colaborador'} · ${dayjs(feriasForm.data_inicio).format('DD/MM/YYYY')} a ${dayjs(feriasForm.data_fim).format('DD/MM/YYYY')} · ${payload.dias_corridos} dias · ${nomeAnoBase}.`
      );
      // Mostra onde o lançamento foi parar: o cartão da pessoa, aberto.
      setExpandido(e => ({ ...e, [feriasForm.colaborador_id]: true }));
      fecharLancamento();
      setFeriasForm({ colaborador_id: '', periodo_aquisitivo_id: '', data_inicio: '', data_fim: '', observacoes: '' });
      fetchFerias();
      fetchPeriodos();
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
    if (!confirm('Excluir este lançamento de férias? Os dias voltam ao saldo do período.')) return;
    await supabase.from('ferias_colaboradores').delete().eq('id', id);
    fetchFerias();
    fetchPeriodos();
  };

  // ── Período CRUD ──

  const salvarPeriodo = async () => {
    if (!periodoForm.colaborador_id || !periodoForm.periodo_aquisitivo_inicio || !periodoForm.periodo_concessivo_fim) {
      return setError('Preencha colaborador e as datas do período.');
    }
    setLoading(true);
    setError(null);
    try {
      // Trava contra o engano de 27/08: o mesmo ano base gravado de novo por
      // quem, na verdade, queria lançar as férias tiradas nele.
      const { data: repetido } = await supabase
        .from('periodos_aquisitivos_ferias')
        .select('id, periodo_aquisitivo_inicio, periodo_aquisitivo_fim')
        .eq('colaborador_id', periodoForm.colaborador_id)
        .eq('periodo_aquisitivo_inicio', periodoForm.periodo_aquisitivo_inicio)
        .maybeSingle();
      if (repetido) {
        const nome = colaboradores.find(c => c.id === periodoForm.colaborador_id)?.nome_completo ?? 'este colaborador';
        throw new Error(`O ano base ${rotuloAnoBase(repetido)} já existe para ${nome}. Se a ideia é registrar as férias que a pessoa tirou, use "Lançar férias".`);
      }

      // Recalcula na hora de gravar em vez de confiar no que está no estado:
      // o concessivo é derivado, e derivado não se salva "como está na tela".
      const concessivo = calcularConcessivo(periodoForm.periodo_aquisitivo_fim);
      const { error } = await supabase.from('periodos_aquisitivos_ferias').insert([{
        colaborador_id: periodoForm.colaborador_id,
        periodo_aquisitivo_inicio: periodoForm.periodo_aquisitivo_inicio,
        periodo_aquisitivo_fim: periodoForm.periodo_aquisitivo_fim,
        periodo_concessivo_inicio: concessivo.periodo_concessivo_inicio,
        periodo_concessivo_fim: concessivo.periodo_concessivo_fim,
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
    if (!confirm('Excluir este ano base? Os lançamentos de férias vinculados a ele perdem o vínculo (não são apagados).')) return;
    await supabase.from('periodos_aquisitivos_ferias').delete().eq('id', id);
    fetchPeriodos();
  };

  /**
   * O concessivo deriva do aquisitivo, sempre: começa no dia seguinte ao fim do
   * aquisitivo e termina 12 meses depois (art. 134 da CLT). Basta o FIM do
   * aquisitivo para calcular — antes exigia as duas datas, então mexer só no
   * fim deixava o concessivo desatualizado no formulário.
   */
  const calcularConcessivo = (fimAquis: string) => {
    if (!fimAquis || !dayjs(fimAquis).isValid()) {
      return { periodo_concessivo_inicio: '', periodo_concessivo_fim: '' };
    }
    return {
      periodo_concessivo_inicio: dayjs(fimAquis).add(1, 'day').format('YYYY-MM-DD'),
      periodo_concessivo_fim: dayjs(fimAquis).add(1, 'year').format('YYYY-MM-DD'),
    };
  };

  const autoFillConcessivo = (_iniAquis: string, fimAquis: string) => {
    setPeriodoForm(p => ({ ...p, ...calcularConcessivo(fimAquis) }));
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

  // Quem está de férias agora abre a lista; depois o que precisa de ação
  // (terminou sem registro), depois agendadas e por fim o histórico.
  const filteredFerias = ferias
    .filter(f =>
      f.colaborador_nome.toLowerCase().includes(searchFerias.toLowerCase()) ||
      (f.observacoes || '').toLowerCase().includes(searchFerias.toLowerCase())
    )
    .sort((a, b) =>
      situacaoInfo[situacaoFerias(a)].prioridade - situacaoInfo[situacaoFerias(b)].prioridade
      || b.data_inicio.localeCompare(a.data_inicio)
    );

  /**
   * A visão que faltava: cada colaborador com seus anos base, e dentro de cada
   * ano base o prazo concessivo e os dias efetivamente gozados. Quem tem
   * período vencido sobe para o topo — é onde o RH precisa agir.
   */
  interface CartaoColaborador {
    id: string;
    nome: string;
    funcao: string;
    admissao?: string;
    periodos: (Periodo & { gozosDoPeriodo: Gozo[] })[];
    semVinculo: number;
    diasDevidos: number;
    temVencido: boolean;
  }

  const porColaborador = useMemo<CartaoColaborador[]>(() => {
    const busca = searchPeriodos.trim().toLowerCase();
    const idsPeriodos = new Set(periodos.map(p => p.id));
    const mapa = new Map<string, CartaoColaborador>();

    for (const p of periodos) {
      let c = mapa.get(p.colaborador_id);
      if (!c) {
        c = {
          id: p.colaborador_id,
          nome: p.colaborador_nome || '—',
          funcao: p.funcao_nome || '',
          admissao: p.data_admissao,
          periodos: [], semVinculo: 0, diasDevidos: 0, temVencido: false,
        };
        mapa.set(p.colaborador_id, c);
      }
      if (statusPeriodoFilter !== 'all' && p.status !== statusPeriodoFilter) continue;
      c.periodos.push({
        ...p,
        gozosDoPeriodo: gozos
          .filter(g => g.periodo_aquisitivo_id === p.id && g.status !== 'cancelado')
          .sort((a, b) => a.data_inicio.localeCompare(b.data_inicio)),
      });
      if (p.status !== 'completo') c.diasDevidos += Math.max(0, p.dias_restantes);
      // Vencido se decide pela DATA, não pelo status gravado: a função de
      // monitoramento reclassifica períodos como "parcial" sem olhar o prazo,
      // e o alerta vermelho não pode depender de quem gravou por último.
      if (p.dias_restantes > 0 && diasParaVencer(p.periodo_concessivo_fim) < 0) c.temVencido = true;
    }

    for (const g of gozos) {
      if (g.status === 'cancelado') continue;
      if (g.periodo_aquisitivo_id && idsPeriodos.has(g.periodo_aquisitivo_id)) continue;
      const c = mapa.get(g.colaborador_id);
      if (c) c.semVinculo++;
    }

    let lista = Array.from(mapa.values()).filter(c => c.periodos.length > 0);
    if (busca) lista = lista.filter(c => c.nome.toLowerCase().includes(busca));
    const peso = (c: CartaoColaborador) => (c.temVencido ? 0 : c.diasDevidos > 0 ? 1 : 2);
    lista.sort((a, b) => peso(a) - peso(b) || a.nome.localeCompare(b.nome));
    return lista;
  }, [periodos, gozos, searchPeriodos, statusPeriodoFilter]);

  // Quem está ativo mas ainda não tem nenhum ano base — invisível na lista
  // acima, que só nasce dos períodos. Sem isso a pessoa "não existia" em Férias.
  const semAnoBase = useMemo(() => {
    const comPeriodo = new Set(periodos.map(p => p.colaborador_id));
    const busca = searchPeriodos.trim().toLowerCase();
    return colaboradores
      .filter(c => !comPeriodo.has(c.id))
      .filter(c => !busca || c.nome_completo.toLowerCase().includes(busca));
  }, [colaboradores, periodos, searchPeriodos]);

  // Countdown badge do prazo concessivo
  const GozoBadge = ({ p }: { p: Periodo }) => {
    const dias = diasParaVencer(p.periodo_concessivo_fim);
    if (p.status === 'completo') return <span className="px-2 py-0.5 text-xs rounded-full bg-green-900/30 text-green-300">Concluído</span>;
    if (dias < 0) return <span className="px-2 py-0.5 text-xs rounded-full bg-red-900/40 text-red-300 font-semibold">Vencido há {Math.abs(dias)}d</span>;
    if (dias <= 30) return <span className="px-2 py-0.5 text-xs rounded-full bg-red-900/30 text-red-300 font-semibold animate-pulse">{dias}d restantes</span>;
    if (dias <= 60) return <span className="px-2 py-0.5 text-xs rounded-full bg-yellow-900/30 text-yellow-300">{dias}d restantes</span>;
    return <span className="px-2 py-0.5 text-xs rounded-full bg-white/10 text-white/50">{dias}d restantes</span>;
  };

  return (
    <div className="space-y-6">
      {/* View Mode Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
          {([
            { key: 'periodos', label: 'Por Colaborador', icon: Users },
            { key: 'ferias', label: 'Lançamentos', icon: Calendar },
            { key: 'monitoramento', label: 'Monitoramento IA', icon: Brain },
          ] as const).map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setViewMode(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                viewMode === key ? 'bg-wine text-white' : 'text-white/60 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* A ação principal da tela inteira, sempre à vista, em qualquer aba.
            Antes o botão grande da aba inicial era "Novo Ano Base" — e foi
            nele que o RH clicou seis vezes tentando lançar férias. */}
        <div className="flex gap-3 flex-wrap items-center">
          <button
            onClick={() => abrirLancamento()}
            className="flex items-center gap-2 px-4 py-2 bg-wine text-white rounded-xl hover:bg-[#9D2F3C] text-sm font-semibold shadow-lg shadow-wine/20 focus-ring"
          >
            <Plus className="w-4 h-4" /> Lançar férias
          </button>
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

      {error && !showFeriasForm && !showPeriodoForm && (
        <div className="p-3 bg-red-900/30 text-red-300 rounded-xl border border-red-700/40 text-sm">{error}</div>
      )}
      {sucesso && (
        <div role="status" className="flex items-start gap-3 p-3 bg-green-900/25 text-green-200 rounded-xl border border-green-700/40 text-sm">
          <CheckCircle className="w-4 h-4 mt-0.5 shrink-0 text-green-400" />
          <p className="flex-1">{sucesso}</p>
          <button onClick={() => setSucesso(null)} className="text-green-300/60 hover:text-green-200 focus-ring rounded" aria-label="Fechar aviso">
            <XCircle className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ───── MONITORAMENTO IA ───── */}
      {viewMode === 'monitoramento' && <MonitoramentoFeriasIA />}

      {/* ───── FÉRIAS POR COLABORADOR ───── */}
      {viewMode === 'periodos' && (
        <div className="space-y-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h3 className="text-lg font-bold text-white font-display">Férias por Colaborador</h3>
              <p className="text-white/50 text-sm">Cada pessoa com seus anos base, o prazo de cada um e o que já foi tirado</p>
            </div>
            {/* Secundário de propósito: o ano base normalmente nasce sozinho
                ao lançar férias. Aqui é só para casos fora do padrão
                (direito reduzido por faltas, período fracionado etc.). */}
            <button
              onClick={() => { setError(null); setPeriodoForm({ colaborador_id: '', periodo_aquisitivo_inicio: '', periodo_aquisitivo_fim: '', periodo_concessivo_inicio: '', periodo_concessivo_fim: '', dias_direito: '30', observacoes: '' }); setShowPeriodoForm(true); }}
              className="flex items-center gap-2 px-3 py-2 border border-white/15 text-white/60 rounded-xl hover:bg-white/5 hover:text-white text-sm focus-ring"
              title="Só para casos fora do padrão — ao lançar férias o ano base é criado sozinho"
            >
              Ano base manual
            </button>
          </div>

          {/* Legenda dos três conceitos — a régua de leitura da tela toda */}
          <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-4 flex gap-3 text-sm text-blue-300">
            <Info className="w-4 h-4 mt-0.5 shrink-0" />
            <div className="text-blue-300/70 space-y-1.5">
              <p>
                <strong className="text-blue-200">Ano base</strong> é o ano trabalhado que dá o direito às férias.{' '}
                <strong className="text-blue-200">Conceder até</strong> é o prazo legal (12 meses após o ano base) para a pessoa tirá-las.{' '}
                <strong className="text-blue-200">Férias tiradas</strong> são os dias que ela de fato usufruiu dentro desse prazo.
              </p>
              <p>
                Para registrar férias tiradas ou agendar as próximas, clique em <strong className="text-blue-200">Lançar férias</strong>:
                o ano base certo é escolhido — ou criado — sozinho a partir da admissão e das datas.
              </p>
            </div>
          </div>

          {/* Filtros */}
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-48 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 w-4 h-4" />
              <input className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/15 rounded-xl text-white text-sm placeholder-white/30 focus:outline-none" placeholder="Buscar colaborador..." value={searchPeriodos} onChange={e => setSearchPeriodos(e.target.value)} />
            </div>
            <select className={sel + ' w-auto'} value={statusPeriodoFilter} onChange={e => setStatusPeriodoFilter(e.target.value)}>
              <option value="all">Todos os anos base</option>
              <option value="vencido">Vencidos</option>
              <option value="pendente">Pendentes</option>
              <option value="parcial">Parciais</option>
              <option value="completo">Completos</option>
            </select>
          </div>

          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine" /></div>
          ) : porColaborador.length === 0 ? (
            <div className="text-center py-12 bg-[#12141f] border border-white/10 rounded-xl">
              <CalendarDays className="w-12 h-12 text-white/20 mx-auto mb-3" />
              <p className="text-white/60 text-sm">Nenhum colaborador com ano base {statusPeriodoFilter !== 'all' ? `"${periodoStatusLabel[statusPeriodoFilter]}"` : 'cadastrado'}.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {porColaborador.map(c => {
                const aberto = expandido[c.id] ?? (c.temVencido || c.diasDevidos > 0);
                return (
                  <div key={c.id} className={`bg-[#12141f] border rounded-xl overflow-hidden ${c.temVencido ? 'border-red-700/40' : 'border-white/10'}`}>
                    {/* Cabeçalho da pessoa: abre/fecha os anos base e, sem
                        precisar abrir nada, lança férias direto para ela. */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      <button
                        onClick={() => setExpandido(e => ({ ...e, [c.id]: !aberto }))}
                        className="flex-1 min-w-0 flex items-center gap-3 text-left rounded-lg focus-ring"
                        aria-expanded={aberto}
                      >
                        <ChevronRight className={`w-4 h-4 shrink-0 text-white/40 transition-transform ${aberto ? 'rotate-90' : ''}`} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white truncate">{c.nome}</p>
                          <p className="text-white/50 text-xs">
                            {c.funcao}{c.admissao ? ` · admissão ${dayjs(c.admissao).format('DD/MM/YYYY')}` : ''}
                          </p>
                        </div>
                      </button>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          onClick={() => abrirLancamento(c.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 bg-wine/25 text-[#e08590] border border-wine/40 rounded-lg hover:bg-wine/45 text-xs transition-colors focus-ring"
                          title={`Lançar férias de ${c.nome}`}
                        >
                          <Plus className="w-3.5 h-3.5" /> Lançar férias
                        </button>
                        {c.temVencido ? (
                          <span className="px-2.5 py-1 text-xs rounded-full bg-red-900/40 text-red-300 font-semibold">
                            {c.diasDevidos}d vencidos a conceder
                          </span>
                        ) : c.diasDevidos > 0 ? (
                          <span className="px-2.5 py-1 text-xs rounded-full bg-yellow-900/30 text-yellow-300">
                            {c.diasDevidos}d a conceder
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 text-xs rounded-full bg-green-900/30 text-green-300">Em dia</span>
                        )}
                        <span className="text-white/40 text-xs hidden sm:block">
                          {c.periodos.length} {c.periodos.length === 1 ? 'ano base' : 'anos base'}
                        </span>
                      </div>
                    </div>

                    {/* Os anos base da pessoa, um por linha */}
                    {aberto && (
                      <div className="border-t border-white/10 overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="bg-white/[0.03] border-b border-white/10">
                              {['Ano base', 'Conceder até', 'Férias tiradas no período', 'Saldo', ''].map(h => (
                                <th key={h} className="px-4 py-2 text-left text-xs font-medium text-white/50 uppercase tracking-wide whitespace-nowrap">{h}</th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {c.periodos.map(p => (
                              <tr key={p.id} className={p.status === 'vencido' ? 'bg-red-900/10' : ''}>
                                <td className="px-4 py-3 whitespace-nowrap align-top">
                                  <p className="text-white font-semibold font-mono">
                                    {dayjs(p.periodo_aquisitivo_inicio).format('YYYY')} → {dayjs(p.periodo_aquisitivo_fim).format('YYYY')}
                                  </p>
                                  <p className="text-white/50 text-xs mt-0.5">
                                    {dayjs(p.periodo_aquisitivo_inicio).format('DD/MM/YYYY')} – {dayjs(p.periodo_aquisitivo_fim).format('DD/MM/YYYY')}
                                  </p>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap align-top">
                                  <p className={`font-medium font-mono ${p.status === 'vencido' ? 'text-red-300' : 'text-white/90'}`}>
                                    {dayjs(p.periodo_concessivo_fim).format('DD/MM/YYYY')}
                                  </p>
                                  <div className="mt-1"><GozoBadge p={p} /></div>
                                </td>
                                <td className="px-4 py-3 align-top">
                                  {p.gozosDoPeriodo.length === 0 ? (
                                    <span className="text-white/40 text-xs">— nenhum dia lançado</span>
                                  ) : (
                                    <div className="flex flex-wrap gap-1.5">
                                      {p.gozosDoPeriodo.map(g => (
                                        <span key={g.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-sky-900/30 border border-sky-700/30 text-sky-200 text-xs whitespace-nowrap font-mono">
                                          {dayjs(g.data_inicio).format('DD/MM/YY')} – {dayjs(g.data_fim).format('DD/MM/YY')}
                                          <span className="text-sky-400/80">· {g.dias_corridos}d</span>
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap align-top">
                                  <p className="text-white font-mono">
                                    <span className="font-semibold">{p.dias_gozados}</span>
                                    <span className="text-white/40">/{p.dias_direito}d</span>
                                  </p>
                                  <div className="h-1 w-16 bg-white/10 rounded-full overflow-hidden mt-1.5">
                                    <div
                                      className={`h-full rounded-full ${p.status === 'vencido' ? 'bg-red-500' : p.status === 'completo' ? 'bg-green-500' : 'bg-yellow-500'}`}
                                      style={{ width: `${Math.min(100, (p.dias_gozados / Math.max(1, p.dias_direito)) * 100)}%` }}
                                    />
                                  </div>
                                </td>
                                <td className="px-4 py-3 whitespace-nowrap align-top">
                                  <div className="flex items-center gap-1 justify-end">
                                    {p.dias_restantes > 0 && (
                                      <button
                                        onClick={() => abrirLancamento(c.id, p.id)}
                                        className="flex items-center gap-1 px-2.5 py-1.5 text-white/60 border border-white/15 rounded-lg hover:bg-white/5 hover:text-white text-xs transition-colors focus-ring whitespace-nowrap"
                                        title="Lançar dias de férias descontando deste ano base"
                                      >
                                        <Plus className="w-3.5 h-3.5" /> Lançar neste ano
                                      </button>
                                    )}
                                    <button onClick={() => excluirPeriodo(p.id)} className="p-1.5 text-red-400/40 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors focus-ring" title="Excluir ano base" aria-label="Excluir ano base">
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                        {c.semVinculo > 0 && (
                          <p className="px-4 py-2 text-xs text-amber-400/80 border-t border-white/5">
                            {c.semVinculo} lançamento{c.semVinculo > 1 ? 's' : ''} de férias sem ano base vinculado — veja na aba Lançamentos.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Quem ainda não tem ano base nenhum — antes simplesmente não
              aparecia aqui, e o RH ia para "Novo Ano Base" tentar consertar. */}
          {!loading && statusPeriodoFilter === 'all' && semAnoBase.length > 0 && (
            <div className="bg-[#12141f] border border-dashed border-white/15 rounded-xl">
              <div className="px-4 py-3 border-b border-white/10">
                <p className="text-sm font-semibold text-white/80">
                  {semAnoBase.length} colaborador{semAnoBase.length > 1 ? 'es' : ''} ativo{semAnoBase.length > 1 ? 's' : ''} ainda sem ano base
                </p>
                <p className="text-xs text-white/50 mt-0.5">
                  Lance as férias normalmente — o ano base é criado sozinho. Ou gere de uma vez todos os anos base desde a admissão.
                </p>
              </div>
              <ul className="divide-y divide-white/5">
                {semAnoBase.map(c => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-white truncate">{c.nome_completo}</p>
                      <p className="text-xs text-white/50">
                        {c.funcao_nome || ''}{c.data_admissao ? ` · admissão ${dayjs(c.data_admissao).format('DD/MM/YYYY')}` : ' · sem data de admissão'}
                      </p>
                    </div>
                    <button
                      onClick={() => gerarAnosBase(c)}
                      disabled={!c.data_admissao}
                      className="px-2.5 py-1.5 text-white/60 border border-white/15 rounded-lg hover:bg-white/5 hover:text-white text-xs transition-colors focus-ring disabled:opacity-40 disabled:cursor-not-allowed whitespace-nowrap"
                      title="Cria todos os anos base desde a admissão até hoje"
                    >
                      Gerar anos base
                    </button>
                    <button
                      onClick={() => abrirLancamento(c.id)}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-wine/25 text-[#e08590] border border-wine/40 rounded-lg hover:bg-wine/45 text-xs transition-colors focus-ring whitespace-nowrap"
                    >
                      <Plus className="w-3.5 h-3.5" /> Lançar férias
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ───── CONTROLE DE FÉRIAS ───── */}
      {viewMode === 'ferias' && (
        <div className="space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <h3 className="text-lg font-bold text-white font-display">Lançamentos de Férias</h3>
            <div className="flex gap-2">
              <button onClick={exportarFerias} className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/15 rounded-xl text-white/70 hover:bg-white/10 text-sm">
                <Download className="w-4 h-4" /> Exportar
              </button>
            </div>
          </div>

          {/* Indicadores — contam pela situação real (datas), não pelo status */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: 'Em férias agora', value: ferias.filter(f => situacaoFerias(f) === 'em_gozo').length, icon: Award, color: 'text-sky-400' },
              { label: 'Agendadas', value: ferias.filter(f => situacaoFerias(f) === 'agendada').length, icon: Calendar, color: 'text-yellow-400' },
              { label: anoFilter === 'all' ? 'Gozadas (todas)' : `Gozadas em ${anoFilter}`, value: ferias.filter(f => situacaoFerias(f) === 'gozada').length, icon: CheckCircle, color: 'text-green-400' },
              { label: 'Terminadas sem registro', value: ferias.filter(f => situacaoFerias(f) === 'sem_registro').length, icon: AlertTriangle, color: 'text-red-400' },
            ].map(({ label, value, icon: Icon, color }) => (
              <div key={label} className="bg-[#12141f] border border-white/10 rounded-xl p-4 flex items-center gap-3">
                <Icon className={`w-7 h-7 ${color} shrink-0`} />
                <div>
                  <p className="text-xs text-white/60">{label}</p>
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
                <option value="all">Todas as etapas</option>
                <option value="previsto">Etapa: Previsto</option>
                <option value="solicitado">Etapa: Solicitado</option>
                <option value="aprovado">Etapa: Aprovado</option>
                <option value="gozado">Etapa: Gozado</option>
                <option value="cancelado">Etapa: Cancelado</option>
              </select>
              <select className={sel} value={anoFilter} onChange={e => setAnoFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value))}>
                <option value="all">Todos os anos</option>
                {anosDisponiveis.map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <button onClick={fetchFerias} className="flex items-center justify-center gap-2 px-4 py-2 bg-wine text-white rounded-xl hover:bg-[#9D2F3C] text-sm">
                <Filter className="w-4 h-4" /> Filtrar
              </button>
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine" /></div>
          ) : (
            <div className="bg-[#12141f] border border-white/10 rounded-xl overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-white/5 border-b border-white/10">
                      {['Colaborador', 'Férias', 'Duração', 'Situação', 'Ações'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-white/60 uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filteredFerias.map(f => {
                      const sit = situacaoFerias(f);
                      const info = situacaoInfo[sit];
                      const hoje = dayjs();
                      return (
                        <tr key={f.id} className={`hover:bg-white/3 transition-colors ${
                          sit === 'em_gozo' ? 'bg-sky-900/10 border-l-2 border-sky-500' :
                          sit === 'sem_registro' ? 'bg-red-900/10 border-l-2 border-red-600' : ''
                        }`}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-white">{f.colaborador_nome}</p>
                            <p className="text-xs text-white/60">{f.funcao_nome}</p>
                          </td>
                          <td className="px-4 py-3 text-sm whitespace-nowrap">
                            <p className="text-white font-mono">{dayjs(f.data_inicio).format('DD/MM/YYYY')} – {dayjs(f.data_fim).format('DD/MM/YYYY')}</p>
                            {f.data_prevista_retorno && (
                              <p className="text-white/50 text-xs mt-0.5">retorno {dayjs(f.data_prevista_retorno).format('DD/MM/YYYY')}</p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-sm whitespace-nowrap">
                            <p className="text-white font-mono">{f.dias_corridos}d</p>
                            <p className="text-white/50 text-xs">{f.dias_uteis} úteis</p>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full border ${info.cls}`}>
                              {info.rotulo}
                            </span>
                            <p className="text-xs text-white/50 mt-1">
                              {sit === 'em_gozo' && <>volta {f.data_prevista_retorno ? dayjs(f.data_prevista_retorno).format('DD/MM') : dayjs(f.data_fim).add(1, 'day').format('DD/MM')} · faltam {dayjs(f.data_fim).diff(hoje, 'day')}d</>}
                              {sit === 'agendada' && <>começa em {dayjs(f.data_inicio).diff(hoje, 'day')}d · etapa: {statusFeriasLabel[f.status] || f.status}</>}
                              {sit === 'gozada' && <>encerrada em {dayjs(f.data_fim).format('DD/MM/YYYY')}</>}
                              {sit === 'sem_registro' && <>terminaria em {dayjs(f.data_fim).format('DD/MM')} — confirme abaixo se foram tiradas</>}
                            </p>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {sit === 'agendada' && f.status === 'previsto' && (
                                <button onClick={() => handleSolicitar(f.id)} className="p-1.5 text-blue-400 hover:text-blue-300 hover:bg-blue-900/30 rounded-lg focus-ring" title="Solicitar aprovação">
                                  <CalendarCheck className="w-4 h-4" />
                                </button>
                              )}
                              {f.status === 'solicitado' && (
                                <button onClick={() => { setFeriasParaAprovar(f); setShowApprovalModal(true); }} className="p-1.5 text-green-400 hover:text-green-300 hover:bg-green-900/30 rounded-lg focus-ring" title="Aprovar / rejeitar">
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                              )}
                              {/* Confirmação de gozo: para quem está de férias (registro em dia)
                                  ou já voltou sem ninguém marcar (o vermelho da tabela). */}
                              {(sit === 'em_gozo' || sit === 'sem_registro') && f.status !== 'gozado' && (
                                <button onClick={() => handleIniciarFerias(f.id)} className="p-1.5 text-sky-400 hover:text-sky-300 hover:bg-sky-900/30 rounded-lg focus-ring" title="Confirmar que as férias foram/estão sendo gozadas">
                                  <Award className="w-4 h-4" />
                                </button>
                              )}
                              <button onClick={() => { setEditingFerias(f); setAnoBaseManual(true); setError(null); setFeriasForm({ colaborador_id: f.colaborador_id, periodo_aquisitivo_id: f.periodo_aquisitivo_id || '', data_inicio: f.data_inicio, data_fim: f.data_fim, observacoes: f.observacoes || '' }); fetchPeriodosDisponiveis(f.colaborador_id); setShowFeriasForm(true); }}
                                className="p-1.5 text-white/40 hover:text-white hover:bg-white/5 rounded-lg focus-ring" title="Editar">
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button onClick={() => excluirFerias(f.id)} className="p-1.5 text-red-400/40 hover:text-red-400 hover:bg-red-900/20 rounded-lg focus-ring" title="Excluir">
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {filteredFerias.length === 0 && (
                <div className="text-center py-12">
                  <CalendarDays className="w-12 h-12 text-white/20 mx-auto mb-3" />
                  <p className="text-white/60 text-sm">
                    {searchFerias || statusFilter !== 'all' || anoFilter !== 'all'
                      ? 'Nenhum lançamento com esses filtros.'
                      : 'Nenhum lançamento de férias ainda.'}
                  </p>
                  <button onClick={() => abrirLancamento()} className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-wine text-white rounded-xl hover:bg-[#9D2F3C] text-sm font-medium focus-ring">
                    <Plus className="w-4 h-4" /> Lançar férias
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
              <div>
                <h3 className="text-lg font-bold text-white">Ano base manual</h3>
                <p className="text-xs text-white/50 mt-0.5">Só para casos fora do padrão. Para registrar férias tiradas, use "Lançar férias".</p>
              </div>
              <button onClick={() => setShowPeriodoForm(false)} className="text-white/40 hover:text-white focus-ring rounded" aria-label="Fechar"><XCircle className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && (
                <div className="p-3 bg-red-900/30 text-red-300 rounded-xl border border-red-700/40 text-sm">{error}</div>
              )}
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
                <p className="text-xs font-semibold text-white/60 mb-2 uppercase tracking-wide">Ano base — período aquisitivo (ano trabalhado)</p>
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

              {/* Concessivo é consequência do aquisitivo, não escolha de quem
                  cadastra: começa no dia seguinte ao fim do aquisitivo e dura
                  12 meses. Ficava editável e rotulado "Período de Gozo" — foi
                  o que levou o RH a digitar aqui as datas em que a pessoa
                  tirou férias. Gozo se lança em Controle de Férias. */}
              <div>
                <p className="text-xs font-semibold text-white/60 mb-2 uppercase tracking-wide">
                  Conceder até — período concessivo <span className="text-gold/70 normal-case font-normal">(calculado automaticamente)</span>
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-white/50 mb-1">Início</label>
                    <input type="date" readOnly disabled tabIndex={-1}
                      className={inp + ' opacity-60 cursor-not-allowed'}
                      value={periodoForm.periodo_concessivo_inicio} />
                  </div>
                  <div>
                    <label className="block text-xs text-white/50 mb-1">Fim (prazo legal)</label>
                    <input type="date" readOnly disabled tabIndex={-1}
                      className={inp + ' opacity-60 cursor-not-allowed'}
                      value={periodoForm.periodo_concessivo_fim} />
                  </div>
                </div>
                <p className="text-xs text-white/40 mt-2">
                  Prazo em que a empresa deve conceder as férias — não é quando o colaborador as tirou.
                  As datas que ele de fato usufruiu (o gozo) se lançam em <strong className="text-white/60">Controle de Férias</strong>.
                </p>
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
                <button onClick={salvarPeriodo} disabled={loading} className="flex-1 px-4 py-2 bg-wine text-white rounded-xl hover:bg-[#9D2F3C] disabled:opacity-50 text-sm font-medium">
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
              <div>
                <h3 className="text-lg font-bold text-white">{editingFerias ? 'Editar férias' : 'Lançar férias'}</h3>
                {!editingFerias && <p className="text-xs text-white/50 mt-0.5">Quem, de que dia a que dia. O resto o sistema resolve.</p>}
              </div>
              <button onClick={fecharLancamento} className="text-white/40 hover:text-white focus-ring rounded" aria-label="Fechar"><XCircle className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && (
                <div className="p-3 bg-red-900/30 text-red-300 rounded-xl border border-red-700/40 text-sm">{error}</div>
              )}

              <div>
                <label className="block text-xs text-white/50 mb-1">Colaborador *</label>
                <select className={sel} value={feriasForm.colaborador_id}
                  onChange={e => { const id = e.target.value; setAnoBaseManual(false); setFeriasForm(f => ({ ...f, colaborador_id: id, periodo_aquisitivo_id: '' })); setPeriodosDisponiveis([]); if (id) fetchPeriodosDisponiveis(id); }}>
                  <option value="">Selecionar colaborador...</option>
                  {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-white/50 mb-1">Primeiro dia de férias *</label>
                  <input type="date" className={inp} value={feriasForm.data_inicio}
                    onChange={e => setFeriasForm(f => ({ ...f, data_inicio: e.target.value }))} />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Último dia de férias *</label>
                  <input type="date" className={inp} value={feriasForm.data_fim}
                    onChange={e => setFeriasForm(f => ({ ...f, data_fim: e.target.value }))} />
                </div>
              </div>

              {/* O ano base é consequência: sugerido a partir das datas (o mais
                  antigo com saldo), criado na hora se não existir. Fica visível
                  para quem quiser conferir ou trocar — não como pergunta. */}
              {feriasForm.colaborador_id && (() => {
                const colab = colaboradores.find(c => c.id === feriasForm.colaborador_id);
                const escolhido = periodosDisponiveis.find(p => p.id === feriasForm.periodo_aquisitivo_id);
                const auto = feriasForm.periodo_aquisitivo_id === ANO_BASE_AUTO;
                const previsto = auto && colab?.data_admissao && feriasForm.data_inicio ? anoBaseParaData(colab.data_admissao, feriasForm.data_inicio) : null;
                return (
                  <div className={`rounded-xl border p-3 ${escolhido || previsto ? 'bg-white/[0.03] border-white/10' : 'bg-amber-900/15 border-amber-700/30'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-white/50">Dias descontados do ano base</p>
                        {escolhido ? (
                          <>
                            <p className="text-sm text-white font-semibold font-mono mt-0.5">
                              {rotuloAnoBase(escolhido)}
                              <span className="text-white/50 font-sans font-normal"> · {escolhido.dias_restantes} de {escolhido.dias_direito} dias disponíveis</span>
                            </p>
                            <p className="text-xs text-white/50 mt-0.5">
                              Prazo legal para conceder: até {dayjs(escolhido.periodo_concessivo_fim).format('DD/MM/YYYY')}
                              {feriasForm.data_inicio && dayjs(feriasForm.data_inicio).isAfter(dayjs(escolhido.periodo_concessivo_fim), 'day') && (
                                <span className="text-amber-300"> — férias fora do prazo (a lei manda pagar em dobro)</span>
                              )}
                              {feriasForm.data_inicio && feriasForm.data_fim && dayjs(feriasForm.data_fim).diff(dayjs(feriasForm.data_inicio), 'day') + 1 > escolhido.dias_restantes && (
                                <span className="text-amber-300"> — passa do saldo deste ano base</span>
                              )}
                            </p>
                          </>
                        ) : previsto ? (
                          <>
                            <p className="text-sm text-white font-semibold font-mono mt-0.5">
                              {rotuloAnoBase(previsto)}
                              <span className="text-gold/80 font-sans font-normal"> · será criado ao salvar</span>
                            </p>
                            <p className="text-xs text-white/50 mt-0.5">
                              Calculado pela admissão em {dayjs(colab!.data_admissao).format('DD/MM/YYYY')} · prazo para conceder até {dayjs(previsto.periodo_concessivo_fim).format('DD/MM/YYYY')}
                            </p>
                          </>
                        ) : !feriasForm.data_inicio ? (
                          <p className="text-sm text-white/60 mt-0.5">Informe o primeiro dia para o ano base ser escolhido.</p>
                        ) : (
                          <p className="text-sm text-amber-200 mt-0.5 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            {colab?.data_admissao ? 'Nenhum ano base escolhido — as férias ficam sem vínculo.' : 'Colaborador sem data de admissão: preencha em Colaboradores para o ano base ser calculado.'}
                          </p>
                        )}
                      </div>
                      {(periodosDisponiveis.length > 0 || colab?.data_admissao) && (
                        <select
                          className={sel + ' w-auto max-w-[220px] text-xs py-1.5'}
                          value={feriasForm.periodo_aquisitivo_id}
                          onChange={e => { setAnoBaseManual(true); setFeriasForm(f => ({ ...f, periodo_aquisitivo_id: e.target.value })); }}
                          aria-label="Trocar o ano base"
                        >
                          <option value="">Sem vínculo</option>
                          {colab?.data_admissao && feriasForm.data_inicio && (
                            <option value={ANO_BASE_AUTO}>Criar o ano base certo</option>
                          )}
                          {periodosDisponiveis.map(p => (
                            <option key={p.id} value={p.id}>
                              {rotuloAnoBase(p)} · {p.dias_restantes}d disponíveis · {periodoStatusLabel[p.status] || p.status}
                            </option>
                          ))}
                        </select>
                      )}
                    </div>
                  </div>
                );
              })()}

              {feriasForm.data_inicio && feriasForm.data_fim && dayjs(feriasForm.data_fim).isAfter(dayjs(feriasForm.data_inicio)) && (
                <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-3">
                  <p className="text-xs font-semibold text-blue-300 mb-2">Cálculo Automático</p>
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div><p className="text-white/60 text-xs">Dias corridos</p><p className="text-white font-bold">{dayjs(feriasForm.data_fim).diff(dayjs(feriasForm.data_inicio), 'days') + 1}</p></div>
                    <div><p className="text-white/60 text-xs">Dias úteis</p><p className="text-white font-bold">{calcularDiasUteis(feriasForm.data_inicio, feriasForm.data_fim)}</p></div>
                    <div><p className="text-white/60 text-xs">Retorno</p><p className="text-white font-bold">{dayjs(calcularDataRetorno(feriasForm.data_fim)).format('DD/MM/YYYY')}</p></div>
                  </div>
                  {!editingFerias && dayjs(feriasForm.data_fim).isBefore(dayjs(), 'day') && (
                    <p className="text-xs text-sky-300 mt-2">
                      As datas já passaram: será registrado direto como <strong>férias gozadas</strong>, sem passar por solicitação e aprovação.
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs text-white/50 mb-1">Observações</label>
                <textarea className={inp + ' resize-none'} rows={2} value={feriasForm.observacoes}
                  onChange={e => setFeriasForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Observações..." />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={fecharLancamento} className="flex-1 px-4 py-2 border border-white/15 text-white/70 rounded-xl hover:bg-white/5 text-sm focus-ring">Cancelar</button>
                <button onClick={salvarFerias} disabled={loading} className="flex-1 px-4 py-2 bg-wine text-white rounded-xl hover:bg-[#9D2F3C] disabled:opacity-50 text-sm font-medium focus-ring">
                  {loading ? 'Salvando...' : editingFerias ? 'Salvar alterações' : 'Lançar férias'}
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
                <p className="text-white/60">{feriasParaAprovar.funcao_nome}</p>
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
