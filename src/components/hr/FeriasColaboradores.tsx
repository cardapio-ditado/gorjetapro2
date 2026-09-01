import React, { useState, useEffect, useMemo } from 'react';
import { Plus, Search, CheckCircle, XCircle, AlertTriangle, CreditCard as Edit2, Trash2, Download, CalendarDays, Award, Brain, ChevronRight, Info, Users, Timer } from 'lucide-react';
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

/**
 * FÉRIAS — uma tela só.
 *
 * A versão anterior tinha três abas (Por Colaborador, Lançamentos, Monitoramento)
 * e dois formulários parecidos. O RH, tentando "incluir as férias" de alguém,
 * gravou seis anos base e nenhuma férias — e depois não achou nada na aba
 * Lançamentos, porque não havia nada lá. Esta tela é a lista de pessoas: cada
 * uma com seu resumo em uma frase e, ao abrir, a história ano a ano. Há um
 * único botão de gravar, "Lançar férias", que pede só quem e as datas.
 *
 * O fluxo previsto → solicitado → aprovado nunca foi usado (os 81 lançamentos
 * do banco são "gozado"), então a tela não o oferece: férias no passado são
 * "tiradas", no futuro são "agendadas".
 */

// ────────────────────────────────────────
// Types
// ────────────────────────────────────────

interface Colab {
  id: string;
  nome_completo: string;
  data_admissao?: string;
  funcao_nome?: string;
  status?: string;
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

/** Um lançamento de férias (linha de ferias_colaboradores). */
interface Gozo {
  id: string;
  colaborador_id: string;
  periodo_aquisitivo_id?: string | null;
  data_inicio: string;
  data_fim: string;
  dias_corridos: number;
  dias_uteis?: number;
  data_prevista_retorno?: string | null;
  status: string;
  observacoes?: string | null;
}

const inp = 'w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-wine/60';
const sel = 'w-full bg-[#0e1019] border border-white/15 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-wine/60';

// ────────────────────────────────────────
// Helpers
// ────────────────────────────────────────

const fmt = (d: string) => dayjs(d).format('DD/MM/YYYY');
const fmtCurto = (d: string) => dayjs(d).format('DD/MM/YY');

/**
 * A situação REAL das férias vem das DATAS; o status gravado só diz se alguém
 * confirmou. Quem está de férias hoje está "em gozo", aconteça o que for no
 * campo status.
 */
type SituacaoFerias = 'em_gozo' | 'agendada' | 'sem_registro' | 'gozada' | 'cancelada';

function situacaoFerias(f: { data_inicio: string; data_fim: string; status: string }): SituacaoFerias {
  if (f.status === 'cancelado') return 'cancelada';
  const hoje = dayjs();
  if (hoje.isBetween(dayjs(f.data_inicio), dayjs(f.data_fim), 'day', '[]')) return 'em_gozo';
  if (dayjs(f.data_inicio).isAfter(hoje, 'day')) return 'agendada';
  return f.status === 'gozado' ? 'gozada' : 'sem_registro';
}

const periodoStatusLabel: Record<string, string> = {
  pendente: 'Ainda não tirou', parcial: 'Tirou uma parte', completo: 'Tirou tudo', vencido: 'Vencido',
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
 * aniversário de admissão. O prazo para conceder são os 12 meses seguintes —
 * art. 134 da CLT.
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

const rotuloAnoBase = (p: { periodo_aquisitivo_inicio: string; periodo_aquisitivo_fim: string }) =>
  `${dayjs(p.periodo_aquisitivo_inicio).format('YYYY')} → ${dayjs(p.periodo_aquisitivo_fim).format('YYYY')}`;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// ────────────────────────────────────────
// Component
// ────────────────────────────────────────

/** O que se diz de cada pessoa, em uma linha, no cartão fechado. */
type Pendencia = 'vencido' | 'a_tirar' | 'em_dia' | 'sem_ano_base';

interface Pessoa {
  colab: Colab;
  periodos: (Periodo & { gozos: Gozo[] })[];
  semVinculo: Gozo[];
  emGozo: Gozo | null;
  proximaAgendada: Gozo | null;
  semRegistro: number;
  diasVencidos: number;
  diasATirar: number;
  proximoPrazo: string | null;
  pendencia: Pendencia;
}

type Filtro = 'todos' | 'vencido' | 'a_tirar' | 'em_ferias' | 'em_dia';

const FeriasColaboradores: React.FC = () => {
  const [aba, setAba] = useState<'pessoas' | 'alertas'>('pessoas');
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [gozos, setGozos] = useState<Gozo[]>([]);
  const [colaboradores, setColaboradores] = useState<Colab[]>([]);
  const [expandido, setExpandido] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Confirmação visível depois de gravar. Sem isso o modal fechava em silêncio
  // e a pessoa não tinha como saber se algo tinha sido salvo — nem onde.
  const [sucesso, setSucesso] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');

  // Form - Férias
  const [showFeriasForm, setShowFeriasForm] = useState(false);
  const [editingFerias, setEditingFerias] = useState<Gozo | null>(null);
  const [periodosDisponiveis, setPeriodosDisponiveis] = useState<Periodo[]>([]);
  // Quando a pessoa escolhe o ano base com a própria mão, a sugestão
  // automática para de sobrescrever a escolha a cada mudança de data.
  const [anoBaseManual, setAnoBaseManual] = useState(false);
  const [feriasForm, setFeriasForm] = useState({
    colaborador_id: '', periodo_aquisitivo_id: '',
    data_inicio: '', data_fim: '', observacoes: '',
  });

  // Form - Ano base manual (casos fora do padrão)
  const [showPeriodoForm, setShowPeriodoForm] = useState(false);
  const [periodoForm, setPeriodoForm] = useState({
    colaborador_id: '',
    periodo_aquisitivo_inicio: '', periodo_aquisitivo_fim: '',
    periodo_concessivo_inicio: '', periodo_concessivo_fim: '',
    dias_direito: '30', observacoes: '',
  });

  useEffect(() => { fetchTudo(); }, []);

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

  // ── Dados ──

  const fetchTudo = async () => {
    setLoading(true);
    try {
      const [cRes, pRes, gRes] = await Promise.all([
        supabase
          .from('vw_colaboradores_completo')
          .select('id, nome_completo, data_admissao, funcao_nome, status')
          .eq('status', 'ativo')
          .order('nome_completo'),
        supabase
          .from('periodos_aquisitivos_ferias')
          .select('*, colaborador:colaboradores(nome_completo, funcao_personalizada, data_admissao)')
          .order('periodo_aquisitivo_inicio', { ascending: true }),
        supabase
          .from('ferias_colaboradores')
          .select('id, colaborador_id, periodo_aquisitivo_id, data_inicio, data_fim, dias_corridos, dias_uteis, data_prevista_retorno, status, observacoes')
          .order('data_inicio', { ascending: true }),
      ]);
      if (cRes.error) throw cRes.error;
      if (pRes.error) throw pRes.error;
      if (gRes.error) throw gRes.error;
      setColaboradores((cRes.data || []) as Colab[]);
      setPeriodos((pRes.data || []).map((p: Periodo & { colaborador?: { nome_completo?: string; funcao_personalizada?: string; data_admissao?: string } }) => ({
        ...p,
        colaborador_nome: p.colaborador?.nome_completo || '—',
        funcao_nome: p.colaborador?.funcao_personalizada || '',
        data_admissao: p.colaborador?.data_admissao,
      })));
      setGozos((gRes.data || []) as Gozo[]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const fetchPeriodosDisponiveis = async (colaboradorId: string): Promise<Periodo[]> => {
    const { data } = await supabase
      .from('periodos_aquisitivos_ferias')
      .select('*')
      .eq('colaborador_id', colaboradorId)
      .order('periodo_aquisitivo_inicio', { ascending: true });
    const lista = (data || []) as Periodo[];
    setPeriodosDisponiveis(lista);
    return lista;
  };

  // ── Lançar férias ──

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

  const abrirEdicao = (g: Gozo) => {
    setEditingFerias(g);
    setAnoBaseManual(true);
    setFeriasForm({ colaborador_id: g.colaborador_id, periodo_aquisitivo_id: g.periodo_aquisitivo_id || '', data_inicio: g.data_inicio, data_fim: g.data_fim, observacoes: g.observacoes || '' });
    fetchPeriodosDisponiveis(g.colaborador_id);
    setError(null);
    setShowFeriasForm(true);
  };

  const fecharLancamento = () => {
    setShowFeriasForm(false);
    setEditingFerias(null);
    setAnoBaseManual(false);
    setError(null);
  };

  const salvarFerias = async () => {
    if (!feriasForm.colaborador_id || !feriasForm.data_inicio || !feriasForm.data_fim) {
      return setError('Preencha quem vai tirar férias, o primeiro e o último dia.');
    }
    const ini = dayjs(feriasForm.data_inicio);
    const fim = dayjs(feriasForm.data_fim);
    if (fim.isBefore(ini)) return setError('O último dia precisa ser depois do primeiro.');

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
        // direto como tiradas. Futuras ficam agendadas até alguém confirmar.
        status: editingFerias?.status
          || (fim.isBefore(dayjs(), 'day') ? 'gozado' : 'previsto'),
      };
      if (editingFerias) {
        const { error } = await supabase.from('ferias_colaboradores').update(payload).eq('id', editingFerias.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('ferias_colaboradores').insert([payload]);
        if (error) throw error;
      }

      const periodoUsado = periodosDisponiveis.find(p => p.id === periodoId);
      const nomeAnoBase = anoBaseCriado ? `ano base ${anoBaseCriado}, criado agora` : periodoUsado ? `ano base ${rotuloAnoBase(periodoUsado)}` : 'sem ano base vinculado';
      setSucesso(
        `${editingFerias ? 'Férias atualizadas' : payload.status === 'gozado' ? 'Férias registradas como tiradas' : 'Férias agendadas'}: `
        + `${colab?.nome_completo ?? 'colaborador'}, ${fmt(feriasForm.data_inicio)} a ${fmt(feriasForm.data_fim)} (${payload.dias_corridos} dias), ${nomeAnoBase}.`
      );
      // Mostra onde o lançamento foi parar: o cartão da pessoa, aberto.
      setExpandido(e => ({ ...e, [feriasForm.colaborador_id]: true }));
      fecharLancamento();
      setFeriasForm({ colaborador_id: '', periodo_aquisitivo_id: '', data_inicio: '', data_fim: '', observacoes: '' });
      fetchTudo();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const confirmarTiradas = async (g: Gozo) => {
    const { error } = await supabase.from('ferias_colaboradores').update({ status: 'gozado' }).eq('id', g.id);
    if (error) return setError(error.message);
    setSucesso(`Confirmado: férias de ${fmt(g.data_inicio)} a ${fmt(g.data_fim)} marcadas como tiradas.`);
    fetchTudo();
  };

  const excluirFerias = async (g: Gozo) => {
    if (!confirm(`Apagar as férias de ${fmt(g.data_inicio)} a ${fmt(g.data_fim)}? Os ${g.dias_corridos} dias voltam para o saldo.`)) return;
    const { error } = await supabase.from('ferias_colaboradores').delete().eq('id', g.id);
    if (error) return setError(error.message);
    setSucesso(`Férias de ${fmt(g.data_inicio)} a ${fmt(g.data_fim)} apagadas.`);
    fetchTudo();
  };

  // ── Ano base ──

  /**
   * Cria os anos base que faltam entre a admissão e hoje. Idempotente: pula
   * os que já existem. É o que o RH fazia à mão, um por um, no botão errado.
   */
  const gerarAnosBase = async (colab: Colab) => {
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
        setSucesso(`${plural(novos.length, 'ano base criado', 'anos base criados')} para ${colab.nome_completo}, de ${dayjs(novos[0].periodo_aquisitivo_inicio).format('YYYY')} a ${dayjs(novos[novos.length - 1].periodo_aquisitivo_fim).format('YYYY')}.`);
        setExpandido(e => ({ ...e, [colab.id]: true }));
      }
      fetchTudo();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

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

      // O concessivo é derivado do aquisitivo — recalculado na hora de gravar.
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
      setSucesso('Ano base criado.');
      setExpandido(e => ({ ...e, [periodoForm.colaborador_id]: true }));
      setPeriodoForm({
        colaborador_id: '', periodo_aquisitivo_inicio: '', periodo_aquisitivo_fim: '',
        periodo_concessivo_inicio: '', periodo_concessivo_fim: '',
        dias_direito: '30', observacoes: '',
      });
      fetchTudo();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const excluirPeriodo = async (p: Periodo, nome: string) => {
    if (!confirm(`Apagar o ano base ${rotuloAnoBase(p)} de ${nome}? As férias lançadas nele não são apagadas, só perdem o vínculo.`)) return;
    const { error } = await supabase.from('periodos_aquisitivos_ferias').delete().eq('id', p.id);
    if (error) return setError(error.message);
    fetchTudo();
  };

  /**
   * O concessivo deriva do aquisitivo, sempre: começa no dia seguinte ao fim do
   * aquisitivo e termina 12 meses depois (art. 134 da CLT).
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

  const autoFillConcessivo = (fimAquis: string) => {
    setPeriodoForm(p => ({ ...p, ...calcularConcessivo(fimAquis) }));
  };

  const autoFillFromAdmissao = (colaboradorId: string) => {
    const colab = colaboradores.find(c => c.id === colaboradorId);
    if (!colab?.data_admissao) return;
    const anos = Math.max(1, dayjs().diff(dayjs(colab.data_admissao), 'year'));
    setPeriodoForm(p => ({ ...p, ...anoBaseN(colab.data_admissao!, anos - 1) }));
  };

  // ── Exportar ──

  const exportarFerias = () => {
    const nome = new Map(colaboradores.map(c => [c.id, c.nome_completo]));
    periodos.forEach(p => { if (!nome.has(p.colaborador_id) && p.colaborador_nome) nome.set(p.colaborador_id, p.colaborador_nome); });
    const periodoPorId = new Map(periodos.map(p => [p.id, p]));
    const linhas = gozos
      .filter(g => g.status !== 'cancelado')
      .sort((a, b) => (nome.get(a.colaborador_id) || '').localeCompare(nome.get(b.colaborador_id) || '') || a.data_inicio.localeCompare(b.data_inicio))
      .map(g => {
        const p = g.periodo_aquisitivo_id ? periodoPorId.get(g.periodo_aquisitivo_id) : undefined;
        return [
          nome.get(g.colaborador_id) || '', p ? rotuloAnoBase(p) : '', p ? fmt(p.periodo_concessivo_fim) : '',
          fmt(g.data_inicio), fmt(g.data_fim), g.dias_corridos, g.dias_uteis ?? '',
          g.data_prevista_retorno ? fmt(g.data_prevista_retorno) : '',
          situacaoTexto[situacaoFerias(g)], g.observacoes || '',
        ];
      });
    if (linhas.length === 0) return alert('Sem férias para exportar.');
    exportToExcel(linhas, `ferias-${dayjs().format('YYYY-MM-DD')}`,
      ['Colaborador', 'Ano base', 'Tirar até', 'Início', 'Fim', 'Dias', 'Dias úteis', 'Retorno', 'Situação', 'Observações']);
  };

  // ── A lista de pessoas ──

  const pessoas = useMemo<Pessoa[]>(() => {
    const mapa = new Map<string, Pessoa>();
    const nova = (colab: Colab): Pessoa => ({
      colab, periodos: [], semVinculo: [], emGozo: null, proximaAgendada: null,
      semRegistro: 0, diasVencidos: 0, diasATirar: 0, proximoPrazo: null, pendencia: 'sem_ano_base',
    });
    for (const c of colaboradores) mapa.set(c.id, nova(c));
    // Quem saiu da empresa mas ainda tem ano base com saldo continua na lista:
    // férias vencidas de ex-funcionário é passivo trabalhista, não some.
    for (const p of periodos) {
      if (!mapa.has(p.colaborador_id)) {
        if (p.dias_restantes <= 0) continue;
        mapa.set(p.colaborador_id, nova({ id: p.colaborador_id, nome_completo: p.colaborador_nome || '—', funcao_nome: p.funcao_nome, data_admissao: p.data_admissao, status: 'inativo' }));
      }
    }
    const idsPeriodos = new Set(periodos.map(p => p.id));
    for (const p of periodos) {
      const pes = mapa.get(p.colaborador_id);
      if (!pes) continue;
      pes.periodos.push({ ...p, gozos: gozos.filter(g => g.periodo_aquisitivo_id === p.id && g.status !== 'cancelado') });
    }
    for (const g of gozos) {
      if (g.status === 'cancelado') continue;
      const pes = mapa.get(g.colaborador_id);
      if (!pes) continue;
      if (!g.periodo_aquisitivo_id || !idsPeriodos.has(g.periodo_aquisitivo_id)) pes.semVinculo.push(g);
      const sit = situacaoFerias(g);
      if (sit === 'em_gozo') pes.emGozo = g;
      if (sit === 'agendada' && (!pes.proximaAgendada || g.data_inicio < pes.proximaAgendada.data_inicio)) pes.proximaAgendada = g;
      if (sit === 'sem_registro') pes.semRegistro++;
    }
    for (const pes of mapa.values()) {
      for (const p of pes.periodos) {
        if (p.dias_restantes <= 0) continue;
        // Vencido se decide pela DATA, não pelo status gravado.
        if (diasParaVencer(p.periodo_concessivo_fim) < 0) pes.diasVencidos += p.dias_restantes;
        else {
          pes.diasATirar += p.dias_restantes;
          if (!pes.proximoPrazo || p.periodo_concessivo_fim < pes.proximoPrazo) pes.proximoPrazo = p.periodo_concessivo_fim;
        }
      }
      pes.pendencia = pes.diasVencidos > 0 ? 'vencido' : pes.diasATirar > 0 ? 'a_tirar' : pes.periodos.length > 0 ? 'em_dia' : 'sem_ano_base';
    }
    return Array.from(mapa.values());
  }, [colaboradores, periodos, gozos]);

  const totais = useMemo(() => ({
    emFerias: pessoas.filter(p => p.emGozo).length,
    vencido: pessoas.filter(p => p.pendencia === 'vencido').length,
    aTirar: pessoas.filter(p => p.pendencia === 'a_tirar').length,
    semRegistro: pessoas.reduce((s, p) => s + p.semRegistro, 0),
  }), [pessoas]);

  const listaVisivel = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const peso = (p: Pessoa) => p.emGozo ? 0 : p.pendencia === 'vencido' ? 1 : p.pendencia === 'a_tirar' ? 2 : p.pendencia === 'sem_ano_base' ? 4 : 3;
    return pessoas
      .filter(p => !b || p.colab.nome_completo.toLowerCase().includes(b))
      .filter(p =>
        filtro === 'todos' ? true :
        filtro === 'em_ferias' ? !!p.emGozo :
        filtro === 'em_dia' ? p.pendencia === 'em_dia' && !p.emGozo :
        p.pendencia === filtro)
      .sort((a, c) => peso(a) - peso(c) || a.colab.nome_completo.localeCompare(c.colab.nome_completo));
  }, [pessoas, busca, filtro]);

  // ── Textos ──

  const situacaoTexto: Record<SituacaoFerias, string> = {
    em_gozo: 'De férias agora', agendada: 'Agendadas', sem_registro: 'Terminou — confirmar', gozada: 'Tiradas', cancelada: 'Canceladas',
  };
  const situacaoCls: Record<SituacaoFerias, string> = {
    em_gozo: 'bg-sky-900/30 border-sky-700/40 text-sky-200',
    agendada: 'bg-yellow-900/25 border-yellow-700/40 text-yellow-200',
    sem_registro: 'bg-red-900/25 border-red-700/40 text-red-200',
    gozada: 'bg-green-900/20 border-green-700/30 text-green-200',
    cancelada: 'bg-white/5 border-white/10 text-white/40',
  };

  /** A frase do cartão fechado: o que a pessoa precisa saber sem abrir nada. */
  const resumo = (p: Pessoa) => {
    const partes: { texto: string; cls: string }[] = [];
    if (p.emGozo) partes.push({ texto: `De férias até ${fmtCurto(p.emGozo.data_fim)}`, cls: 'bg-sky-900/40 text-sky-200 border-sky-700/40' });
    else if (p.proximaAgendada) partes.push({ texto: `Férias marcadas para ${fmtCurto(p.proximaAgendada.data_inicio)}`, cls: 'bg-yellow-900/25 text-yellow-200 border-yellow-700/40' });
    if (p.pendencia === 'vencido') partes.push({ texto: `${plural(p.diasVencidos, 'dia vencido', 'dias vencidos')}`, cls: 'bg-red-900/40 text-red-200 border-red-700/50 font-semibold' });
    else if (p.pendencia === 'a_tirar') partes.push({ texto: `${plural(p.diasATirar, 'dia a tirar', 'dias a tirar')} até ${fmtCurto(p.proximoPrazo!)}`, cls: 'bg-amber-900/25 text-amber-200 border-amber-700/40' });
    else if (p.pendencia === 'em_dia') partes.push({ texto: 'Em dia', cls: 'bg-green-900/25 text-green-200 border-green-700/40' });
    else partes.push({ texto: 'Sem ano base ainda', cls: 'bg-white/5 text-white/50 border-white/10' });
    if (p.semRegistro > 0) partes.push({ texto: `${plural(p.semRegistro, 'férias a confirmar', 'férias a confirmar')}`, cls: 'bg-red-900/25 text-red-200 border-red-700/40' });
    return partes;
  };

  // ── Render ──

  const BotaoLancar = ({ colaboradorId, periodoId, rotulo = 'Lançar férias', destaque = false }: { colaboradorId?: string; periodoId?: string; rotulo?: string; destaque?: boolean }) => (
    <button
      onClick={() => abrirLancamento(colaboradorId, periodoId)}
      className={`inline-flex items-center gap-1.5 rounded-lg text-xs font-medium transition-colors focus-ring whitespace-nowrap ${
        destaque
          ? 'px-3 py-1.5 bg-wine text-white hover:bg-[#9D2F3C]'
          : 'px-2.5 py-1.5 bg-wine/20 text-[#e8949e] border border-wine/40 hover:bg-wine/40'
      }`}
    >
      <Plus className="w-3.5 h-3.5" /> {rotulo}
    </button>
  );

  const FeriasChip = ({ g }: { g: Gozo }) => {
    const sit = situacaoFerias(g);
    return (
      <div className={`flex items-center gap-2 flex-wrap rounded-lg border px-2.5 py-1.5 text-xs ${situacaoCls[sit]}`}>
        <span className="font-mono font-semibold">{fmt(g.data_inicio)} a {fmt(g.data_fim)}</span>
        <span className="opacity-80">· {plural(g.dias_corridos, 'dia', 'dias')}</span>
        <span className="opacity-80">· {situacaoTexto[sit]}</span>
        {sit === 'em_gozo' && <span className="opacity-80">· volta {fmtCurto(g.data_prevista_retorno || dayjs(g.data_fim).add(1, 'day').format('YYYY-MM-DD'))}</span>}
        {(sit === 'em_gozo' || sit === 'sem_registro') && g.status !== 'gozado' && (
          <button onClick={() => confirmarTiradas(g)} className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 focus-ring" title="Confirmar que essas férias foram tiradas">
            <Award className="w-3 h-3" /> Confirmar
          </button>
        )}
        <span className="ml-auto inline-flex items-center gap-0.5">
          <button onClick={() => abrirEdicao(g)} className="p-1 rounded hover:bg-white/15 opacity-70 hover:opacity-100 focus-ring" title="Corrigir datas" aria-label="Corrigir datas">
            <Edit2 className="w-3.5 h-3.5" />
          </button>
          <button onClick={() => excluirFerias(g)} className="p-1 rounded hover:bg-red-500/20 opacity-70 hover:opacity-100 focus-ring" title="Apagar" aria-label="Apagar">
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* Topo: título, ação principal e a troca discreta para os alertas */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h3 className="text-lg font-bold text-white font-display">Férias</h3>
          <p className="text-white/50 text-sm">Quem está de férias, quem precisa tirar e o que cada pessoa já tirou</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={exportarFerias} className="flex items-center gap-2 px-3 py-2 bg-white/5 border border-white/15 rounded-xl text-white/70 hover:bg-white/10 text-sm focus-ring">
            <Download className="w-4 h-4" /> Exportar
          </button>
          <div className="flex gap-1 bg-white/5 p-1 rounded-xl">
            {([
              { key: 'pessoas', label: 'Pessoas', icon: Users },
              { key: 'alertas', label: 'Alertas', icon: Brain },
            ] as const).map(({ key, label, icon: Icon }) => (
              <button key={key} onClick={() => setAba(key)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors focus-ring ${aba === key ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'}`}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
          <button
            onClick={() => abrirLancamento()}
            className="flex items-center gap-2 px-4 py-2 bg-wine text-white rounded-xl hover:bg-[#9D2F3C] text-sm font-semibold shadow-lg shadow-wine/20 focus-ring"
          >
            <Plus className="w-4 h-4" /> Lançar férias
          </button>
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

      {aba === 'alertas' && <MonitoramentoFeriasIA />}

      {aba === 'pessoas' && (
        <div className="space-y-4">
          {/* Os números que importam, clicáveis — cada um é um filtro da lista */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {([
              { key: 'em_ferias', label: 'De férias agora', value: totais.emFerias, cls: 'text-sky-300', icon: Award },
              { key: 'vencido', label: 'Com férias vencidas', value: totais.vencido, cls: 'text-red-300', icon: AlertTriangle },
              { key: 'a_tirar', label: 'Com dias a tirar', value: totais.aTirar, cls: 'text-amber-300', icon: Timer },
              { key: 'em_dia', label: 'Em dia', value: pessoas.filter(p => p.pendencia === 'em_dia' && !p.emGozo).length, cls: 'text-green-300', icon: CheckCircle },
            ] as const).map(({ key, label, value, cls, icon: Icon }) => (
              <button key={key} onClick={() => setFiltro(f => f === key ? 'todos' : key)}
                className={`text-left bg-[#12141f] border rounded-xl p-3.5 flex items-center gap-3 transition-colors focus-ring ${filtro === key ? 'border-wine/60 bg-wine/10' : 'border-white/10 hover:border-white/20'}`}
                aria-pressed={filtro === key}>
                <Icon className={`w-6 h-6 ${cls} shrink-0`} />
                <div className="min-w-0">
                  <p className={`text-2xl font-bold leading-none ${cls}`}>{value}</p>
                  <p className="text-xs text-white/60 mt-1 truncate">{label}</p>
                </div>
              </button>
            ))}
          </div>

          <div className="bg-blue-900/20 border border-blue-700/30 rounded-xl p-3.5 flex gap-3 text-sm">
            <Info className="w-4 h-4 mt-0.5 shrink-0 text-blue-300" />
            <p className="text-blue-200/80">
              Cada ano trabalhado é um <strong className="text-blue-100">ano base</strong> e dá direito a 30 dias de férias,
              que devem ser tiradas nos 12 meses seguintes. Para registrar férias tiradas ou marcar as próximas,
              clique em <strong className="text-blue-100">Lançar férias</strong> e informe só a pessoa e as datas.
            </p>
          </div>

          <div className="flex gap-3 flex-wrap items-center">
            <div className="flex-1 min-w-56 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 w-4 h-4" />
              <input className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/15 rounded-xl text-white text-sm placeholder-white/30 focus:outline-none focus:border-wine/60" placeholder="Procurar pessoa..." value={busca} onChange={e => setBusca(e.target.value)} />
            </div>
            <select className={sel + ' w-auto'} value={filtro} onChange={e => setFiltro(e.target.value as Filtro)} aria-label="Mostrar">
              <option value="todos">Todas as pessoas</option>
              <option value="em_ferias">De férias agora</option>
              <option value="vencido">Com férias vencidas</option>
              <option value="a_tirar">Com dias a tirar</option>
              <option value="em_dia">Em dia</option>
            </select>
            <button
              onClick={() => { setError(null); setPeriodoForm({ colaborador_id: '', periodo_aquisitivo_inicio: '', periodo_aquisitivo_fim: '', periodo_concessivo_inicio: '', periodo_concessivo_fim: '', dias_direito: '30', observacoes: '' }); setShowPeriodoForm(true); }}
              className="px-3 py-2 text-white/50 hover:text-white text-xs rounded-xl hover:bg-white/5 focus-ring"
              title="Só para casos fora do padrão — ao lançar férias o ano base é criado sozinho"
            >
              Ano base manual
            </button>
          </div>

          {loading && pessoas.length === 0 ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine" /></div>
          ) : listaVisivel.length === 0 ? (
            <div className="text-center py-12 bg-[#12141f] border border-white/10 rounded-xl">
              <CalendarDays className="w-12 h-12 text-white/20 mx-auto mb-3" />
              <p className="text-white/60 text-sm">{busca || filtro !== 'todos' ? 'Ninguém com esse filtro.' : 'Nenhum colaborador ativo.'}</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {listaVisivel.map(pes => {
                const c = pes.colab;
                const aberto = expandido[c.id] ?? false;
                return (
                  <div key={c.id} className={`bg-[#12141f] border rounded-xl overflow-hidden ${pes.pendencia === 'vencido' ? 'border-red-700/40' : pes.emGozo ? 'border-sky-700/40' : 'border-white/10'}`}>
                    {/* Cabeçalho da pessoa: nome, a frase de situação e o botão */}
                    <div className="flex items-center gap-3 px-4 py-3">
                      <button
                        onClick={() => setExpandido(e => ({ ...e, [c.id]: !aberto }))}
                        className="flex-1 min-w-0 flex items-center gap-3 text-left rounded-lg focus-ring"
                        aria-expanded={aberto}
                      >
                        <ChevronRight className={`w-4 h-4 shrink-0 text-white/40 transition-transform ${aberto ? 'rotate-90' : ''}`} />
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-white truncate">
                            {c.nome_completo}
                            {c.status === 'inativo' && <span className="ml-2 text-xs font-normal text-white/40">(desligado)</span>}
                          </p>
                          <p className="text-white/50 text-xs truncate">
                            {c.funcao_nome || ''}{c.data_admissao ? `${c.funcao_nome ? ' · ' : ''}na casa desde ${fmt(c.data_admissao)}` : ''}
                          </p>
                        </div>
                      </button>
                      <div className="flex items-center gap-1.5 flex-wrap justify-end">
                        {resumo(pes).map(r => (
                          <span key={r.texto} className={`px-2.5 py-1 text-xs rounded-full border ${r.cls}`}>{r.texto}</span>
                        ))}
                      </div>
                      <BotaoLancar colaboradorId={c.id} />
                    </div>

                    {aberto && (
                      <div className="border-t border-white/10 divide-y divide-white/5">
                        {pes.periodos.length === 0 && (
                          <div className="px-4 py-4 flex items-center gap-3 flex-wrap">
                            <p className="text-sm text-white/60 flex-1">
                              {c.data_admissao
                                ? 'Ainda não tem nenhum ano base. Lance as férias normalmente que o ano base é criado sozinho — ou crie de uma vez todos desde a admissão.'
                                : 'Sem data de admissão no cadastro. Preencha em Colaboradores para o sistema calcular os anos base.'}
                            </p>
                            {c.data_admissao && (
                              <button onClick={() => gerarAnosBase(c)} className="px-2.5 py-1.5 text-white/60 border border-white/15 rounded-lg hover:bg-white/5 hover:text-white text-xs focus-ring whitespace-nowrap">
                                Criar anos base desde {dayjs(c.data_admissao).format('YYYY')}
                              </button>
                            )}
                          </div>
                        )}

                        {/* Um bloco por ano base, do mais antigo ao mais novo, em frases */}
                        {pes.periodos.map(p => {
                          const dias = diasParaVencer(p.periodo_concessivo_fim);
                          const vencido = p.dias_restantes > 0 && dias < 0;
                          const tirouTudo = p.dias_restantes <= 0;
                          return (
                            <div key={p.id} className={`px-4 py-3 ${vencido ? 'bg-red-900/10' : ''}`}>
                              <div className="flex items-start gap-3 flex-wrap">
                                <div className="min-w-[210px]">
                                  <p className="text-white font-semibold font-mono">Ano base {rotuloAnoBase(p)}</p>
                                  <p className="text-white/50 text-xs mt-0.5">
                                    trabalhou de {fmt(p.periodo_aquisitivo_inicio)} a {fmt(p.periodo_aquisitivo_fim)}
                                  </p>
                                  <p className={`text-xs mt-0.5 ${vencido ? 'text-red-300' : 'text-white/50'}`}>
                                    {p.dias_direito} dias de direito · tirar até {fmt(p.periodo_concessivo_fim)}
                                  </p>
                                </div>
                                <div className="flex-1 min-w-[260px] space-y-1.5">
                                  {p.gozos.length === 0 && (
                                    <p className={`text-sm ${vencido ? 'text-red-200' : 'text-white/70'}`}>
                                      {vencido
                                        ? <><AlertTriangle className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />Ainda não tirou: {plural(p.dias_restantes, 'dia vencido', 'dias vencidos')} desde {fmt(p.periodo_concessivo_fim)}</>
                                        : dias <= 60
                                          ? <>Ainda não tirou: {plural(p.dias_restantes, 'dia', 'dias')} a tirar, faltam {plural(dias, 'dia', 'dias')} para o prazo</>
                                          : <>Ainda não tirou: {plural(p.dias_restantes, 'dia', 'dias')} a tirar até {fmt(p.periodo_concessivo_fim)}</>}
                                    </p>
                                  )}
                                  {p.gozos.map(g => <FeriasChip key={g.id} g={g} />)}
                                  {p.gozos.length > 0 && !tirouTudo && (
                                    <p className={`text-xs ${vencido ? 'text-red-300' : 'text-amber-200/80'}`}>
                                      Tirou {p.dias_gozados} de {p.dias_direito} dias · {vencido
                                        ? `${plural(p.dias_restantes, 'dia vencido', 'dias vencidos')} desde ${fmt(p.periodo_concessivo_fim)}`
                                        : `ainda ${plural(p.dias_restantes, 'dia', 'dias')} a tirar até ${fmt(p.periodo_concessivo_fim)}`}
                                    </p>
                                  )}
                                  {tirouTudo && p.gozos.length > 0 && (
                                    <p className="text-xs text-green-300/80"><CheckCircle className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />Tirou tudo</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {!tirouTudo && <BotaoLancar colaboradorId={c.id} periodoId={p.id} rotulo="Lançar neste ano" />}
                                  <button onClick={() => excluirPeriodo(p, c.nome_completo)} className="p-1.5 text-white/25 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors focus-ring" title="Apagar este ano base" aria-label="Apagar este ano base">
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}

                        {pes.semVinculo.length > 0 && (
                          <div className="px-4 py-3">
                            <p className="text-xs text-amber-300/90 mb-1.5">Férias lançadas sem ano base — abra cada uma em "corrigir" e escolha o ano base:</p>
                            <div className="space-y-1.5">{pes.semVinculo.map(g => <FeriasChip key={g.id} g={g} />)}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ═══════ MODAL: Lançar férias ═══════ */}
      {showFeriasForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#12141f] border border-white/15 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div>
                <h3 className="text-lg font-bold text-white">{editingFerias ? 'Corrigir férias' : 'Lançar férias'}</h3>
                {!editingFerias && <p className="text-xs text-white/50 mt-0.5">Quem, de que dia a que dia. O resto o sistema resolve.</p>}
              </div>
              <button onClick={fecharLancamento} className="text-white/40 hover:text-white focus-ring rounded" aria-label="Fechar"><XCircle className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && (
                <div className="p-3 bg-red-900/30 text-red-300 rounded-xl border border-red-700/40 text-sm">{error}</div>
              )}

              <div>
                <label className="block text-xs text-white/50 mb-1">Quem *</label>
                <select className={sel} value={feriasForm.colaborador_id} disabled={!!editingFerias}
                  onChange={e => { const id = e.target.value; setAnoBaseManual(false); setFeriasForm(f => ({ ...f, colaborador_id: id, periodo_aquisitivo_id: '' })); setPeriodosDisponiveis([]); if (id) fetchPeriodosDisponiveis(id); }}>
                  <option value="">Escolher a pessoa...</option>
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

              {feriasForm.data_inicio && feriasForm.data_fim && dayjs(feriasForm.data_fim).isSameOrAfter(dayjs(feriasForm.data_inicio)) && (
                <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-white/70 px-1">
                  <span><strong className="text-white">{dayjs(feriasForm.data_fim).diff(dayjs(feriasForm.data_inicio), 'days') + 1}</strong> dias</span>
                  <span><strong className="text-white">{calcularDiasUteis(feriasForm.data_inicio, feriasForm.data_fim)}</strong> dias úteis</span>
                  <span>volta ao trabalho <strong className="text-white">{fmt(calcularDataRetorno(feriasForm.data_fim))}</strong></span>
                  {!editingFerias && (
                    <span className="text-sky-300">
                      {dayjs(feriasForm.data_fim).isBefore(dayjs(), 'day') ? 'Já passou: entra como férias tiradas.' : 'Entra como férias agendadas.'}
                    </span>
                  )}
                </div>
              )}

              {/* O ano base é consequência: sugerido a partir das datas (o mais
                  antigo com saldo), criado na hora se não existir. Fica visível
                  para quem quiser conferir ou trocar — não como pergunta. */}
              {feriasForm.colaborador_id && (() => {
                const colab = colaboradores.find(c => c.id === feriasForm.colaborador_id);
                const escolhido = periodosDisponiveis.find(p => p.id === feriasForm.periodo_aquisitivo_id);
                const auto = feriasForm.periodo_aquisitivo_id === ANO_BASE_AUTO;
                const previsto = auto && colab?.data_admissao && feriasForm.data_inicio ? anoBaseParaData(colab.data_admissao, feriasForm.data_inicio) : null;
                const diasPedidos = feriasForm.data_inicio && feriasForm.data_fim ? dayjs(feriasForm.data_fim).diff(dayjs(feriasForm.data_inicio), 'day') + 1 : 0;
                return (
                  <div className={`rounded-xl border p-3 ${escolhido || previsto ? 'bg-white/[0.03] border-white/10' : 'bg-amber-900/15 border-amber-700/30'}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-xs text-white/50">Conta como férias do</p>
                        {escolhido ? (
                          <>
                            <p className="text-sm text-white font-semibold font-mono mt-0.5">
                              ano base {rotuloAnoBase(escolhido)}
                              <span className="text-white/50 font-sans font-normal"> · {escolhido.dias_restantes} de {escolhido.dias_direito} dias disponíveis</span>
                            </p>
                            <p className="text-xs text-white/50 mt-0.5">
                              prazo para tirar: até {fmt(escolhido.periodo_concessivo_fim)}
                              {feriasForm.data_inicio && dayjs(feriasForm.data_inicio).isAfter(dayjs(escolhido.periodo_concessivo_fim), 'day') && (
                                <span className="text-amber-300"> — fora do prazo (a lei manda pagar em dobro)</span>
                              )}
                              {diasPedidos > escolhido.dias_restantes && !editingFerias && (
                                <span className="text-amber-300"> — passa do saldo deste ano base</span>
                              )}
                            </p>
                          </>
                        ) : previsto ? (
                          <>
                            <p className="text-sm text-white font-semibold font-mono mt-0.5">
                              ano base {rotuloAnoBase(previsto)}
                              <span className="text-gold/80 font-sans font-normal"> · será criado ao salvar</span>
                            </p>
                            <p className="text-xs text-white/50 mt-0.5">
                              calculado pela admissão em {fmt(colab!.data_admissao!)} · prazo para tirar até {fmt(previsto.periodo_concessivo_fim)}
                            </p>
                          </>
                        ) : !feriasForm.data_inicio ? (
                          <p className="text-sm text-white/60 mt-0.5">Informe o primeiro dia para o ano base ser escolhido.</p>
                        ) : (
                          <p className="text-sm text-amber-200 mt-0.5 flex items-center gap-1.5">
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            {colab?.data_admissao ? 'Nenhum ano base escolhido — as férias ficam sem vínculo.' : 'Pessoa sem data de admissão: preencha em Colaboradores para o ano base ser calculado.'}
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

              <div>
                <label className="block text-xs text-white/50 mb-1">Observação (opcional)</label>
                <textarea className={inp + ' resize-none'} rows={2} value={feriasForm.observacoes}
                  onChange={e => setFeriasForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Ex.: vendeu 10 dias, férias coletivas..." />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={fecharLancamento} className="flex-1 px-4 py-2 border border-white/15 text-white/70 rounded-xl hover:bg-white/5 text-sm focus-ring">Cancelar</button>
                <button onClick={salvarFerias} disabled={loading} className="flex-1 px-4 py-2 bg-wine text-white rounded-xl hover:bg-[#9D2F3C] disabled:opacity-50 text-sm font-medium focus-ring">
                  {loading ? 'Salvando...' : editingFerias ? 'Salvar correção' : 'Lançar férias'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════ MODAL: Ano base manual ═══════ */}
      {showPeriodoForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#12141f] border border-white/15 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div>
                <h3 className="text-lg font-bold text-white">Ano base manual</h3>
                <p className="text-xs text-white/50 mt-0.5">Só para casos fora do padrão. Para registrar férias tiradas, use "Lançar férias".</p>
              </div>
              <button onClick={() => { setShowPeriodoForm(false); setError(null); }} className="text-white/40 hover:text-white focus-ring rounded" aria-label="Fechar"><XCircle className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && (
                <div className="p-3 bg-red-900/30 text-red-300 rounded-xl border border-red-700/40 text-sm">{error}</div>
              )}
              <div>
                <label className="block text-xs text-white/50 mb-1">Quem *</label>
                <select className={sel} value={periodoForm.colaborador_id}
                  onChange={e => {
                    const id = e.target.value;
                    setPeriodoForm(p => ({ ...p, colaborador_id: id }));
                    if (id) autoFillFromAdmissao(id);
                  }}>
                  <option value="">Escolher a pessoa...</option>
                  {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
                </select>
              </div>

              <div>
                <p className="text-xs font-semibold text-white/60 mb-2 uppercase tracking-wide">Ano base — o ano trabalhado</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-white/50 mb-1">Início</label>
                    <input type="date" className={inp} value={periodoForm.periodo_aquisitivo_inicio}
                      onChange={e => setPeriodoForm(p => ({ ...p, periodo_aquisitivo_inicio: e.target.value }))} />
                  </div>
                  <div>
                    <label className="block text-xs text-white/50 mb-1">Fim</label>
                    <input type="date" className={inp} value={periodoForm.periodo_aquisitivo_fim}
                      onChange={e => { const v = e.target.value; setPeriodoForm(p => ({ ...p, periodo_aquisitivo_fim: v })); autoFillConcessivo(v); }} />
                  </div>
                </div>
              </div>

              {/* O prazo para conceder é consequência do ano base — não se digita. */}
              <div>
                <p className="text-xs font-semibold text-white/60 mb-2 uppercase tracking-wide">
                  Prazo para tirar <span className="text-gold/70 normal-case font-normal">(calculado sozinho)</span>
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-white/50 mb-1">De</label>
                    <input type="date" readOnly disabled tabIndex={-1} className={inp + ' opacity-60 cursor-not-allowed'} value={periodoForm.periodo_concessivo_inicio} />
                  </div>
                  <div>
                    <label className="block text-xs text-white/50 mb-1">Até</label>
                    <input type="date" readOnly disabled tabIndex={-1} className={inp + ' opacity-60 cursor-not-allowed'} value={periodoForm.periodo_concessivo_fim} />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs text-white/50 mb-1">Dias de direito</label>
                <input type="number" className={inp} value={periodoForm.dias_direito}
                  onChange={e => setPeriodoForm(p => ({ ...p, dias_direito: e.target.value }))} min="1" max="30" />
                <p className="text-xs text-white/40 mt-1">30 é o normal. Menos que isso só quando houve muitas faltas no ano.</p>
              </div>

              <div>
                <label className="block text-xs text-white/50 mb-1">Observação</label>
                <textarea className={inp + ' resize-none'} rows={2} value={periodoForm.observacoes}
                  onChange={e => setPeriodoForm(p => ({ ...p, observacoes: e.target.value }))} />
              </div>

              <div className="flex gap-3 pt-2">
                <button onClick={() => { setShowPeriodoForm(false); setError(null); }} className="flex-1 px-4 py-2 border border-white/15 text-white/70 rounded-xl hover:bg-white/5 text-sm focus-ring">Cancelar</button>
                <button onClick={salvarPeriodo} disabled={loading} className="flex-1 px-4 py-2 bg-wine text-white rounded-xl hover:bg-[#9D2F3C] disabled:opacity-50 text-sm font-medium focus-ring">
                  {loading ? 'Salvando...' : 'Criar ano base'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FeriasColaboradores;
