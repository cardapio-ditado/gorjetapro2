import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Plus, Search, CheckCircle, XCircle, AlertTriangle, CreditCard as Edit2, Trash2, Download, CalendarDays, Award, Brain, ChevronRight, Info, Users, ArrowLeft, Hourglass } from 'lucide-react';
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
 * FÉRIAS — a lista de pessoas e, por pessoa, uma página.
 *
 * A lista responde "quem está de férias, quem precisa tirar". Clicar numa
 * pessoa abre a página dela: a linha do tempo dos anos base, o que tirou em
 * cada um e o que falta. Há um único botão de gravar, "Lançar férias", que
 * pede só quem e as datas.
 *
 * Os anos base não se criam: nascem sozinhos da data de admissão (a função
 * gerar_anos_base_automaticos roda ao abrir a tela e só cria o que falta).
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
  setor_nome?: string;
  foto_url?: string;
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
  /** Abono pecuniário (art. 143): dias convertidos em dinheiro, até 1/3 do direito. */
  dias_vendidos: number;
  abono_observacoes?: string | null;
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
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const iniciais = (nome: string) => nome.split(' ').filter(Boolean).map(n => n[0]).slice(0, 2).join('').toUpperCase();

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
const situacaoCor: Record<SituacaoFerias, string> = {
  em_gozo: '#38bdf8', agendada: '#facc15', sem_registro: '#f87171', gozada: '#4ade80', cancelada: '#6b7280',
};

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

/** Ano base ainda acumulando: a pessoa não completou os 12 meses. */
const emCurso = (p: Periodo) => dayjs(p.periodo_aquisitivo_fim).isSameOrAfter(dayjs(), 'day');

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
// O que a CLT diz (arts. 129 a 145)
// ────────────────────────────────────────

/**
 * Art. 130: os dias de férias dependem das faltas injustificadas no ano base.
 * Não é um número livre — são quatro degraus.
 */
const DEGRAUS_DIREITO = [
  { dias: 30, faltas: 'até 5 faltas' },
  { dias: 24, faltas: '6 a 14 faltas' },
  { dias: 18, faltas: '15 a 23 faltas' },
  { dias: 12, faltas: '24 a 32 faltas' },
];

/** Art. 143: pode vender até 1/3 dos dias a que tem direito. */
const maxVendaveis = (diasDireito: number) => Math.floor(diasDireito / 3);

/**
 * Avisos legais sobre um lançamento — não bloqueiam (o RH pode estar
 * registrando o que já aconteceu), mas aparecem antes de gravar.
 */
function avisosLegais(opts: {
  dataInicio: string; dataFim: string; periodo?: Periodo | null; outrosGozos: Gozo[]; editandoId?: string | null;
}): { nivel: 'alerta' | 'info'; texto: string }[] {
  const { dataInicio, dataFim, periodo } = opts;
  const avisos: { nivel: 'alerta' | 'info'; texto: string }[] = [];
  if (!dataInicio || !dataFim) return avisos;
  const ini = dayjs(dataInicio);
  const fim = dayjs(dataFim);
  if (fim.isBefore(ini, 'day')) return avisos;
  const dias = fim.diff(ini, 'day') + 1;

  // Art. 134 §3º: não pode começar nos 2 dias antes de feriado ou do descanso
  // semanal. Com descanso no domingo, isso proíbe sexta e sábado.
  if (ini.day() === 5 || ini.day() === 6) {
    avisos.push({ nivel: 'alerta', texto: `Começa numa ${ini.day() === 5 ? 'sexta' : 'sábado'}: a lei proíbe iniciar férias nos 2 dias antes do descanso semanal ou de feriado (art. 134, §3º). Se o descanso da pessoa não é no domingo, ignore.` });
  }

  if (periodo) {
    const outros = opts.outrosGozos.filter(g => g.id !== opts.editandoId && g.status !== 'cancelado');
    const blocos = [...outros.map(g => g.dias_corridos), dias];
    // Férias fracionadas: diz qual período será este e o que já foi lançado.
    if (outros.length > 0 && !opts.editandoId) {
      const lista = outros.map(g => `${g.dias_corridos}d em ${fmtCurto(g.data_inicio)}`).join(', ');
      avisos.push({ nivel: 'info', texto: `Férias divididas: este será o ${outros.length + 1}º período do ano base (já lançado: ${lista}).` });
    }
    // Art. 134 §1º: até 3 períodos; um de pelo menos 14 dias; os outros de pelo menos 5.
    if (blocos.length > 3) {
      avisos.push({ nivel: 'alerta', texto: `Seria o ${blocos.length}º período deste ano base — a lei permite dividir as férias em no máximo 3 (art. 134, §1º).` });
    }
    if (dias < 5) {
      avisos.push({ nivel: 'alerta', texto: `Só ${plural(dias, 'dia', 'dias')}: nenhum período de férias pode ter menos de 5 dias corridos (art. 134, §1º).` });
    }
    const totalPrevisto = blocos.reduce((s, d) => s + d, 0);
    const disponivel = periodo.dias_direito - periodo.dias_vendidos;
    if (blocos.length > 1 && totalPrevisto >= disponivel && !blocos.some(d => d >= 14)) {
      avisos.push({ nivel: 'alerta', texto: 'Dividindo as férias, um dos períodos precisa ter pelo menos 14 dias corridos (art. 134, §1º) — nenhum tem.' });
    }
    // Art. 137: depois do prazo, paga em dobro.
    if (ini.isAfter(dayjs(periodo.periodo_concessivo_fim), 'day')) {
      avisos.push({ nivel: 'alerta', texto: `Depois do prazo (${fmt(periodo.periodo_concessivo_fim)}): a empresa paga essas férias em dobro (art. 137).` });
    }
  }

  // Art. 145: o pagamento (salário + 1/3) sai até 2 dias antes do início.
  if (ini.isAfter(dayjs(), 'day')) {
    avisos.push({ nivel: 'info', texto: `Pagar até ${fmt(ini.subtract(2, 'day').format('YYYY-MM-DD'))}: salário dos dias mais 1/3 (art. 145 e CF art. 7º, XVII).` });
  }
  return avisos;
}

const rotuloAnoBase = (p: { periodo_aquisitivo_inicio: string; periodo_aquisitivo_fim: string }) =>
  `${dayjs(p.periodo_aquisitivo_inicio).format('YYYY')} → ${dayjs(p.periodo_aquisitivo_fim).format('YYYY')}`;

// ────────────────────────────────────────
// Modelo de leitura
// ────────────────────────────────────────

type Pendencia = 'vencido' | 'a_tirar' | 'em_dia' | 'primeiro_ano' | 'sem_ano_base';

interface Pessoa {
  colab: Colab;
  periodos: (Periodo & { gozos: Gozo[] })[];
  semVinculo: Gozo[];
  emGozo: Gozo | null;
  proximaAgendada: Gozo | null;
  semRegistro: number;
  diasVencidos: number;
  diasATirar: number;
  diasTirados: number;
  diasVendidos: number;
  proximoPrazo: string | null;
  anoEmCurso: Periodo | null;
  pendencia: Pendencia;
}

type Filtro = 'todos' | 'vencido' | 'a_tirar' | 'em_ferias' | 'em_dia';

// ────────────────────────────────────────
// Component
// ────────────────────────────────────────

const FeriasColaboradores: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const pessoaId = searchParams.get('pessoa');

  const [aba, setAba] = useState<'pessoas' | 'alertas'>('pessoas');
  const [periodos, setPeriodos] = useState<Periodo[]>([]);
  const [gozos, setGozos] = useState<Gozo[]>([]);
  const [colaboradores, setColaboradores] = useState<Colab[]>([]);
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

  // Abono pecuniário (vender férias) e dias de direito — dois modais pequenos
  // sobre um ano base específico.
  const [abonoForm, setAbonoForm] = useState<{ periodo: Periodo; nome: string; dias: string; obs: string } | null>(null);
  const [direitoForm, setDireitoForm] = useState<{ periodo: Periodo; nome: string; dias: number } | null>(null);

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

  // ── Navegação lista ↔ página da pessoa (fica na URL: voltar do navegador funciona) ──

  const abrirPessoa = (id: string) => {
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.set('pessoa', id); return n; });
    window.scrollTo({ top: 0 });
  };
  const voltarParaLista = () => {
    setSearchParams(prev => { const n = new URLSearchParams(prev); n.delete('pessoa'); return n; });
  };

  // ── Dados ──

  const fetchTudo = async () => {
    setLoading(true);
    try {
      // Anos base nascem sozinhos da admissão. A função só cria o que falta.
      const { error: errAuto } = await supabase.rpc('gerar_anos_base_automaticos');
      if (errAuto) console.warn('gerar_anos_base_automaticos:', errAuto.message);

      const [cRes, pRes, gRes] = await Promise.all([
        supabase
          .from('vw_colaboradores_completo')
          .select('id, nome_completo, data_admissao, funcao_nome, setor_nome, foto_url, status')
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
      const idPessoa = feriasForm.colaborador_id;
      fecharLancamento();
      setFeriasForm({ colaborador_id: '', periodo_aquisitivo_id: '', data_inicio: '', data_fim: '', observacoes: '' });
      await fetchTudo();
      // Mostra onde o lançamento foi parar: a página da pessoa.
      abrirPessoa(idPessoa);
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

  // ── Ano base manual (exceção) ──

  const calcularConcessivo = (fimAquis: string) => {
    if (!fimAquis || !dayjs(fimAquis).isValid()) {
      return { periodo_concessivo_inicio: '', periodo_concessivo_fim: '' };
    }
    return {
      periodo_concessivo_inicio: dayjs(fimAquis).add(1, 'day').format('YYYY-MM-DD'),
      periodo_concessivo_fim: dayjs(fimAquis).add(1, 'year').format('YYYY-MM-DD'),
    };
  };

  const abrirAnoBaseManual = (colaboradorId = '') => {
    setError(null);
    const colab = colaboradores.find(c => c.id === colaboradorId);
    const base = colab?.data_admissao ? anoBaseN(colab.data_admissao, Math.max(0, dayjs().diff(dayjs(colab.data_admissao), 'year'))) : null;
    setPeriodoForm({
      colaborador_id: colaboradorId,
      periodo_aquisitivo_inicio: base?.periodo_aquisitivo_inicio ?? '', periodo_aquisitivo_fim: base?.periodo_aquisitivo_fim ?? '',
      periodo_concessivo_inicio: base?.periodo_concessivo_inicio ?? '', periodo_concessivo_fim: base?.periodo_concessivo_fim ?? '',
      dias_direito: '30', observacoes: '',
    });
    setShowPeriodoForm(true);
  };

  const salvarPeriodo = async () => {
    if (!periodoForm.colaborador_id || !periodoForm.periodo_aquisitivo_inicio || !periodoForm.periodo_concessivo_fim) {
      return setError('Preencha colaborador e as datas do período.');
    }
    setLoading(true);
    setError(null);
    try {
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
      fetchTudo();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  /** Art. 130: os dias de direito seguem os degraus de faltas. */
  const salvarDiasDireito = async () => {
    if (!direitoForm) return;
    const { periodo: p, dias } = direitoForm;
    if (p.dias_vendidos > maxVendaveis(dias)) {
      return setError(`Com ${dias} dias de direito só se pode vender ${maxVendaveis(dias)}; este ano base tem ${p.dias_vendidos} vendidos. Ajuste a venda primeiro.`);
    }
    const { error } = await supabase.from('periodos_aquisitivos_ferias').update({ dias_direito: dias }).eq('id', p.id);
    if (error) return setError(error.message);
    setDireitoForm(null);
    setSucesso(`Ano base ${rotuloAnoBase(p)}: ${plural(dias, 'dia', 'dias')} de direito.`);
    fetchTudo();
  };

  /** Art. 143: vender até 1/3 das férias. Os dias vendidos saem do saldo. */
  const salvarAbono = async () => {
    if (!abonoForm) return;
    const { periodo: p, dias, obs } = abonoForm;
    const n = parseInt(dias);
    const max = maxVendaveis(p.dias_direito);
    if (isNaN(n) || n < 0) return setError('Informe quantos dias foram vendidos.');
    if (n > max) return setError(`Com ${p.dias_direito} dias de direito, a lei permite vender no máximo ${max} (um terço — art. 143).`);
    if (n > p.dias_direito - p.dias_gozados) return setError(`A pessoa já tirou ${p.dias_gozados} dias deste ano base; sobram ${p.dias_direito - p.dias_gozados} para vender.`);
    const { error } = await supabase.from('periodos_aquisitivos_ferias').update({ dias_vendidos: n, abono_observacoes: obs || null }).eq('id', p.id);
    if (error) return setError(error.message);
    setAbonoForm(null);
    setSucesso(n === 0
      ? `Ano base ${rotuloAnoBase(p)}: venda de férias desfeita.`
      : `${abonoForm.nome} vendeu ${plural(n, 'dia', 'dias')} do ano base ${rotuloAnoBase(p)}. Sobram ${p.dias_direito - p.dias_gozados - n} para tirar.`);
    fetchTudo();
  };

  const excluirPeriodo = async (p: Periodo, nome: string) => {
    if (!confirm(`Apagar o ano base ${rotuloAnoBase(p)} de ${nome}? As férias lançadas nele não são apagadas, só perdem o vínculo. Atenção: se a data bater com a admissão, ele volta sozinho na próxima abertura da tela.`)) return;
    const { error } = await supabase.from('periodos_aquisitivos_ferias').delete().eq('id', p.id);
    if (error) return setError(error.message);
    fetchTudo();
  };

  // ── Exportar ──

  const exportarFerias = () => {
    const nome = new Map(colaboradores.map(c => [c.id, c.nome_completo]));
    periodos.forEach(p => { if (!nome.has(p.colaborador_id) && p.colaborador_nome) nome.set(p.colaborador_id, p.colaborador_nome); });
    const periodoPorId = new Map(periodos.map(p => [p.id, p]));
    const linhas = gozos
      .filter(g => g.status !== 'cancelado')
      .filter(g => !pessoaId || g.colaborador_id === pessoaId)
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
      semRegistro: 0, diasVencidos: 0, diasATirar: 0, diasTirados: 0, diasVendidos: 0, proximoPrazo: null, anoEmCurso: null, pendencia: 'sem_ano_base',
    });
    for (const c of colaboradores) mapa.set(c.id, nova(c));
    // Quem saiu da empresa mas ainda tem ano base com saldo continua na lista:
    // férias vencidas de ex-funcionário é passivo trabalhista, não some.
    for (const p of periodos) {
      if (!mapa.has(p.colaborador_id)) {
        if (p.dias_restantes <= 0 || emCurso(p)) continue;
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
      if (sit === 'gozada' || sit === 'em_gozo') pes.diasTirados += g.dias_corridos;
    }
    for (const pes of mapa.values()) {
      for (const p of pes.periodos) {
        pes.diasVendidos += p.dias_vendidos || 0;
        if (emCurso(p)) { pes.anoEmCurso = p; continue; }
        if (p.dias_restantes <= 0) continue;
        // Vencido se decide pela DATA, não pelo status gravado.
        if (diasParaVencer(p.periodo_concessivo_fim) < 0) pes.diasVencidos += p.dias_restantes;
        else {
          pes.diasATirar += p.dias_restantes;
          if (!pes.proximoPrazo || p.periodo_concessivo_fim < pes.proximoPrazo) pes.proximoPrazo = p.periodo_concessivo_fim;
        }
      }
      const completados = pes.periodos.filter(p => !emCurso(p)).length;
      pes.pendencia = pes.diasVencidos > 0 ? 'vencido'
        : pes.diasATirar > 0 ? 'a_tirar'
        : completados > 0 ? 'em_dia'
        : pes.anoEmCurso ? 'primeiro_ano'
        : 'sem_ano_base';
    }
    return Array.from(mapa.values());
  }, [colaboradores, periodos, gozos]);

  const totais = useMemo(() => ({
    emFerias: pessoas.filter(p => p.emGozo).length,
    vencido: pessoas.filter(p => p.pendencia === 'vencido').length,
    aTirar: pessoas.filter(p => p.pendencia === 'a_tirar').length,
    emDia: pessoas.filter(p => (p.pendencia === 'em_dia' || p.pendencia === 'primeiro_ano') && !p.emGozo).length,
  }), [pessoas]);

  const listaVisivel = useMemo(() => {
    const b = busca.trim().toLowerCase();
    const peso = (p: Pessoa) => p.emGozo ? 0 : p.pendencia === 'vencido' ? 1 : p.pendencia === 'a_tirar' ? 2 : p.pendencia === 'em_dia' ? 3 : 4;
    return pessoas
      .filter(p => !b || p.colab.nome_completo.toLowerCase().includes(b))
      .filter(p =>
        filtro === 'todos' ? true :
        filtro === 'em_ferias' ? !!p.emGozo :
        filtro === 'em_dia' ? (p.pendencia === 'em_dia' || p.pendencia === 'primeiro_ano') && !p.emGozo :
        p.pendencia === filtro)
      .sort((a, c) => peso(a) - peso(c) || a.colab.nome_completo.localeCompare(c.colab.nome_completo));
  }, [pessoas, busca, filtro]);

  const pessoaAberta = useMemo(() => pessoas.find(p => p.colab.id === pessoaId) ?? null, [pessoas, pessoaId]);

  /** A frase do cartão da lista: o que se precisa saber sem abrir nada. */
  const resumo = (p: Pessoa) => {
    const partes: { texto: string; cls: string }[] = [];
    if (p.emGozo) partes.push({ texto: `De férias até ${fmtCurto(p.emGozo.data_fim)}`, cls: 'bg-sky-900/40 text-sky-200 border-sky-700/40' });
    else if (p.proximaAgendada) partes.push({ texto: `Férias marcadas para ${fmtCurto(p.proximaAgendada.data_inicio)}`, cls: 'bg-yellow-900/25 text-yellow-200 border-yellow-700/40' });
    if (p.pendencia === 'vencido') partes.push({ texto: plural(p.diasVencidos, 'dia vencido', 'dias vencidos'), cls: 'bg-red-900/40 text-red-200 border-red-700/50 font-semibold' });
    else if (p.pendencia === 'a_tirar') partes.push({ texto: `${plural(p.diasATirar, 'dia a tirar', 'dias a tirar')} até ${fmtCurto(p.proximoPrazo!)}`, cls: 'bg-amber-900/25 text-amber-200 border-amber-700/40' });
    else if (p.pendencia === 'em_dia') partes.push({ texto: 'Em dia', cls: 'bg-green-900/25 text-green-200 border-green-700/40' });
    else if (p.pendencia === 'primeiro_ano') partes.push({ texto: `1º ano completa em ${fmtCurto(p.anoEmCurso!.periodo_aquisitivo_fim)}`, cls: 'bg-white/5 text-white/60 border-white/10' });
    else partes.push({ texto: p.colab.data_admissao ? 'Sem ano base' : 'Sem data de admissão', cls: 'bg-white/5 text-white/50 border-white/10' });
    if (p.semRegistro > 0) partes.push({ texto: plural(p.semRegistro, 'férias a confirmar', 'férias a confirmar'), cls: 'bg-red-900/25 text-red-200 border-red-700/40' });
    return partes;
  };

  // ── Peças de tela ──

  const Avatar = ({ c, tamanho = 'md' }: { c: Colab; tamanho?: 'md' | 'lg' }) => {
    const cls = tamanho === 'lg' ? 'w-16 h-16 text-lg rounded-2xl' : 'w-10 h-10 text-xs rounded-xl';
    return c.foto_url ? (
      <img src={c.foto_url} alt="" className={`${cls} object-cover shrink-0 border border-white/10`} />
    ) : (
      <div className={`${cls} shrink-0 flex items-center justify-center font-bold text-white`} style={{ background: 'linear-gradient(135deg, var(--wine), var(--gold))' }}>
        {iniciais(c.nome_completo)}
      </div>
    );
  };

  const BotaoLancar = ({ colaboradorId, periodoId, rotulo = 'Lançar férias', destaque = false }: { colaboradorId?: string; periodoId?: string; rotulo?: string; destaque?: boolean }) => (
    <button
      onClick={e => { e.stopPropagation(); abrirLancamento(colaboradorId, periodoId); }}
      className={`inline-flex items-center gap-1.5 rounded-lg font-medium transition-colors focus-ring whitespace-nowrap ${
        destaque
          ? 'px-4 py-2 text-sm bg-wine text-white hover:bg-[#9D2F3C] shadow-lg shadow-wine/20'
          : 'px-2.5 py-1.5 text-xs bg-wine/20 text-[#e8949e] border border-wine/40 hover:bg-wine/40'
      }`}
    >
      <Plus className={destaque ? 'w-4 h-4' : 'w-3.5 h-3.5'} /> {rotulo}
    </button>
  );

  const FeriasChip = ({ g, ordem }: { g: Gozo; ordem?: string }) => {
    const sit = situacaoFerias(g);
    return (
      <div className={`flex items-center gap-2 flex-wrap rounded-lg border px-2.5 py-1.5 text-xs ${situacaoCls[sit]}`}>
        {ordem && <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-semibold tracking-wide">{ordem}</span>}
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

  /**
   * A linha do tempo da pessoa: uma faixa por ano base, cada faixa com 24 meses
   * — os 12 trabalhados (escuro) e os 12 do prazo para tirar (claro). Os dias
   * tirados aparecem como blocos coloridos no lugar em que caíram. Hoje é a
   * linha dourada.
   */
  const LinhaDoTempo = ({ pes }: { pes: Pessoa }) => {
    const hoje = dayjs();
    return (
      <div className="space-y-2.5">
        {pes.periodos.map(p => {
          const ini = dayjs(p.periodo_aquisitivo_inicio);
          const fimTotal = dayjs(p.periodo_concessivo_fim);
          const total = Math.max(1, fimTotal.diff(ini, 'day') + 1);
          const pct = (d: dayjs.Dayjs) => Math.min(100, Math.max(0, (d.diff(ini, 'day') / total) * 100));
          const fimAquis = pct(dayjs(p.periodo_aquisitivo_fim).add(1, 'day'));
          const hojePct = hoje.isBetween(ini, fimTotal, 'day', '[]') ? pct(hoje) : null;
          const vencido = !emCurso(p) && p.dias_restantes > 0 && diasParaVencer(p.periodo_concessivo_fim) < 0;
          const tudo = p.dias_restantes <= 0 && p.gozos.length > 0;
          return (
            <div key={p.id} className="flex items-center gap-3">
              <div className="w-[92px] shrink-0 text-right">
                <p className="text-xs font-mono font-semibold text-white">{rotuloAnoBase(p)}</p>
                <p className={`text-[11px] leading-tight ${vencido ? 'text-red-300' : tudo ? 'text-green-300/80' : emCurso(p) ? 'text-white/40' : 'text-amber-200/80'}`}>
                  {emCurso(p) ? 'em andamento' : tudo ? (p.dias_vendidos > 0 ? `tirou + vendeu ${p.dias_vendidos}d` : 'tirou tudo') : vencido ? `${p.dias_restantes}d vencidos` : p.gozos.length || p.dias_vendidos ? `faltam ${p.dias_restantes}d` : `${p.dias_restantes}d a tirar`}
                </p>
              </div>
              <div className="relative flex-1 h-7 rounded-md overflow-hidden" style={{ background: 'rgba(255,255,255,0.04)' }} title={`Trabalhou de ${fmt(p.periodo_aquisitivo_inicio)} a ${fmt(p.periodo_aquisitivo_fim)} · tirar até ${fmt(p.periodo_concessivo_fim)}`}>
                {/* os 12 meses trabalhados */}
                <div className="absolute inset-y-0 left-0 rounded-l-md" style={{ width: `${fimAquis}%`, background: 'rgba(255,255,255,0.09)' }} />
                {/* o prazo para tirar */}
                <div className={`absolute inset-y-0 rounded-r-md border-y border-r ${vencido ? 'border-red-500/40 bg-red-500/10' : 'border-white/15'}`} style={{ left: `${fimAquis}%`, right: 0 }} />
                {/* os dias tirados */}
                {p.gozos.map(g => {
                  const gi = dayjs(g.data_inicio);
                  const gf = dayjs(g.data_fim).add(1, 'day');
                  const atrasado = gi.isAfter(fimTotal, 'day');
                  const left = atrasado ? 97 : pct(gi);
                  const width = atrasado ? 3 : Math.max(1.2, pct(gf) - left);
                  const sit = situacaoFerias(g);
                  return (
                    <div key={g.id} className="absolute top-1 bottom-1 rounded-sm" style={{ left: `${left}%`, width: `${width}%`, background: situacaoCor[sit], opacity: 0.9 }}
                      title={`${fmt(g.data_inicio)} a ${fmt(g.data_fim)} · ${g.dias_corridos} dias · ${situacaoTexto[sit]}${atrasado ? ' · tiradas depois do prazo' : ''}`} />
                  );
                })}
                {/* dias vendidos: bloco listrado no fim do prazo */}
                {p.dias_vendidos > 0 && (
                  <div className="absolute top-1 bottom-1 rounded-sm" style={{ right: 0, width: `${Math.max(2, (p.dias_vendidos / total) * 100)}%`, background: 'repeating-linear-gradient(135deg, rgba(212,175,55,0.85) 0 3px, rgba(212,175,55,0.25) 3px 6px)' }}
                    title={`${plural(p.dias_vendidos, 'dia vendido', 'dias vendidos')} (abono pecuniário)`} />
                )}
                {hojePct !== null && (
                  <div className="absolute top-0 bottom-0 w-0.5" style={{ left: `${hojePct}%`, background: 'var(--gold)' }} title="Hoje" />
                )}
                <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-[10px] text-white/35 pointer-events-none">{ini.format('MM/YY')}</span>
                <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[10px] text-white/35 pointer-events-none">{fimTotal.format('MM/YY')}</span>
              </div>
            </div>
          );
        })}
        <div className="flex flex-wrap gap-x-4 gap-y-1 pl-[104px] text-[11px] text-white/45">
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ background: 'rgba(255,255,255,0.12)' }} />12 meses trabalhados</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm border border-white/25" />prazo para tirar</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ background: situacaoCor.gozada }} />tiradas</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ background: situacaoCor.em_gozo }} />de férias agora</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ background: situacaoCor.agendada }} />agendadas</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ background: 'repeating-linear-gradient(135deg, rgba(212,175,55,0.85) 0 2px, rgba(212,175,55,0.25) 2px 4px)' }} />vendidas</span>
          <span className="inline-flex items-center gap-1.5"><span className="w-0.5 h-3" style={{ background: 'var(--gold)' }} />hoje</span>
        </div>
      </div>
    );
  };

  /**
   * O panorama do time, em vez de quatro quadrados com números: uma barra com
   * a situação de todo mundo (clicável, filtra a lista) e o calendário dos
   * próximos 12 meses — quem está fora, quando, por quanto tempo.
   */
  const PanoramaDoTime = () => {
    const segmentos: { key: Filtro; label: string; value: number; cor: string; texto: string }[] = [
      { key: 'em_ferias', label: 'de férias agora', value: totais.emFerias, cor: situacaoCor.em_gozo, texto: 'text-sky-300' },
      { key: 'vencido', label: 'com férias vencidas', value: totais.vencido, cor: situacaoCor.sem_registro, texto: 'text-red-300' },
      { key: 'a_tirar', label: 'com dias a tirar', value: totais.aTirar, cor: '#f59e0b', texto: 'text-amber-300' },
      { key: 'em_dia', label: 'em dia', value: totais.emDia, cor: situacaoCor.gozada, texto: 'text-green-300' },
    ];
    const totalPessoas = segmentos.reduce((s, x) => s + x.value, 0) || 1;

    // Calendário: do mês passado até 10 meses à frente.
    const inicio = dayjs().startOf('month').subtract(1, 'month');
    const fimJanela = inicio.add(12, 'month');
    const totalDias = fimJanela.diff(inicio, 'day');
    const pct = (d: dayjs.Dayjs) => Math.min(100, Math.max(0, (d.diff(inicio, 'day') / totalDias) * 100));
    const meses = Array.from({ length: 12 }, (_, i) => inicio.add(i, 'month'));
    const linhas = pessoas
      .map(pes => ({
        pes,
        barras: gozos
          .filter(g => g.colaborador_id === pes.colab.id && g.status !== 'cancelado')
          .filter(g => dayjs(g.data_fim).isAfter(inicio) && dayjs(g.data_inicio).isBefore(fimJanela)),
      }))
      .filter(l => l.barras.length > 0)
      .sort((a, b) => a.barras[0].data_inicio.localeCompare(b.barras[0].data_inicio));
    const hojePct = pct(dayjs());

    return (
      <div className="bg-[#12141f] border border-white/10 rounded-2xl p-5 space-y-5">
        {/* A barra do time */}
        <div>
          <div className="flex items-baseline justify-between flex-wrap gap-2 mb-2">
            <h4 className="text-sm font-semibold text-white">O time hoje</h4>
            <p className="text-xs text-white/50">{plural(totalPessoas, 'pessoa', 'pessoas')} · clique numa cor para filtrar a lista</p>
          </div>
          <div className="flex h-9 rounded-xl overflow-hidden border border-white/10">
            {segmentos.filter(s => s.value > 0).map(s => (
              <button
                key={s.key}
                onClick={() => setFiltro(f => f === s.key ? 'todos' : s.key)}
                className={`relative flex items-center justify-center text-sm font-bold text-[#0d0f1a] transition-opacity focus-ring ${filtro !== 'todos' && filtro !== s.key ? 'opacity-30' : ''}`}
                style={{ width: `${(s.value / totalPessoas) * 100}%`, background: s.cor, minWidth: 28 }}
                title={`${s.value} ${s.label}`}
                aria-pressed={filtro === s.key}
              >
                {s.value}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-2.5">
            {segmentos.map(s => (
              <button key={s.key} onClick={() => setFiltro(f => f === s.key ? 'todos' : s.key)}
                className={`inline-flex items-center gap-1.5 text-xs focus-ring rounded ${filtro === s.key ? 'text-white' : 'text-white/60 hover:text-white'}`}>
                <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.cor }} />
                <strong className={s.texto}>{s.value}</strong> {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* O calendário */}
        <div>
          <h4 className="text-sm font-semibold text-white mb-0.5">Calendário de férias</h4>
          <p className="text-xs text-white/50 mb-3">Do mês passado aos próximos dez meses. Cada barra é um período de férias; a linha dourada é hoje.</p>
          {linhas.length === 0 ? (
            <p className="text-sm text-white/50 py-4 text-center border border-dashed border-white/10 rounded-xl">Nenhuma férias lançada nesta janela. Marque as próximas em "Lançar férias".</p>
          ) : (
            <div className="overflow-x-auto">
              <div className="min-w-[640px]">
                {/* cabeçalho dos meses */}
                <div className="flex ml-[140px] border-b border-white/10">
                  {meses.map(m => (
                    <div key={m.format('YYYY-MM')} className={`flex-1 text-center text-[11px] py-1 capitalize ${m.isSame(dayjs(), 'month') ? 'text-gold font-semibold' : 'text-white/45'}`}>
                      {m.format('MMM')}<span className="hidden lg:inline">/{m.format('YY')}</span>
                    </div>
                  ))}
                </div>
                <div className="relative">
                  {/* grade dos meses */}
                  <div className="absolute inset-y-0 left-[140px] right-0 flex pointer-events-none">
                    {meses.map(m => <div key={m.format('YYYY-MM')} className="flex-1 border-l border-white/5" />)}
                  </div>
                  {/* hoje */}
                  <div className="absolute top-0 bottom-0 w-0.5 pointer-events-none z-10" style={{ left: `calc(140px + (100% - 140px) * ${hojePct / 100})`, background: 'var(--gold)' }} />
                  {linhas.map(({ pes, barras }) => (
                    <div key={pes.colab.id} className="flex items-center h-9 border-b border-white/5 last:border-b-0">
                      <button onClick={() => abrirPessoa(pes.colab.id)} className="w-[140px] shrink-0 pr-3 text-left text-xs text-white/80 hover:text-white truncate focus-ring rounded" title={pes.colab.nome_completo}>
                        {pes.colab.nome_completo.split(' ').slice(0, 2).join(' ')}
                      </button>
                      <div className="relative flex-1 h-full">
                        {barras.map(g => {
                          const sit = situacaoFerias(g);
                          const left = pct(dayjs(g.data_inicio));
                          const width = Math.max(0.8, pct(dayjs(g.data_fim).add(1, 'day')) - left);
                          return (
                            <button
                              key={g.id}
                              onClick={() => abrirPessoa(pes.colab.id)}
                              className="absolute top-1.5 bottom-1.5 rounded-md text-[10px] font-semibold text-[#0d0f1a] overflow-hidden whitespace-nowrap px-1.5 text-left focus-ring"
                              style={{ left: `${left}%`, width: `${width}%`, background: situacaoCor[sit] }}
                              title={`${fmt(g.data_inicio)} a ${fmt(g.data_fim)} · ${g.dias_corridos} dias · ${situacaoTexto[sit]}`}
                            >
                              {width > 6 ? `${fmtCurto(g.data_inicio).slice(0, 5)}–${fmtCurto(g.data_fim).slice(0, 5)} · ${g.dias_corridos}d` : ''}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1 mt-3 text-[11px] text-white/45">
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ background: situacaoCor.gozada }} />tiradas</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ background: situacaoCor.em_gozo }} />de férias agora</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ background: situacaoCor.agendada }} />agendadas</span>
            <span className="inline-flex items-center gap-1.5"><span className="w-3 h-2 rounded-sm" style={{ background: situacaoCor.sem_registro }} />terminaram sem confirmação</span>
          </div>
        </div>
      </div>
    );
  };

  /** A página de uma pessoa. */
  const PaginaPessoa = ({ pes }: { pes: Pessoa }) => {
    const c = pes.colab;
    const tempoDeCasa = c.data_admissao ? (() => {
      const anos = dayjs().diff(dayjs(c.data_admissao), 'year');
      const meses = dayjs().diff(dayjs(c.data_admissao).add(anos, 'year'), 'month');
      return anos > 0 ? `${plural(anos, 'ano', 'anos')}${meses > 0 ? ` e ${plural(meses, 'mês', 'meses')}` : ''}` : plural(meses, 'mês', 'meses');
    })() : null;

    return (
      <div className="space-y-5">
        <button onClick={voltarParaLista} className="inline-flex items-center gap-1.5 text-sm text-white/60 hover:text-white focus-ring rounded-lg">
          <ArrowLeft className="w-4 h-4" /> Todas as pessoas
        </button>

        {/* Quem é */}
        <div className={`bg-[#12141f] border rounded-2xl p-5 ${pes.pendencia === 'vencido' ? 'border-red-700/40' : pes.emGozo ? 'border-sky-700/40' : 'border-white/10'}`}>
          <div className="flex items-start gap-4 flex-wrap">
            <Avatar c={c} tamanho="lg" />
            <div className="flex-1 min-w-[200px]">
              <h3 className="text-xl font-bold text-white font-display leading-tight">
                {c.nome_completo}
                {c.status === 'inativo' && <span className="ml-2 text-sm font-normal text-white/40">(desligado)</span>}
              </h3>
              <p className="text-white/60 text-sm mt-1">
                {[c.funcao_nome, c.setor_nome].filter(Boolean).join(' · ')}
              </p>
              <p className="text-white/50 text-sm">
                {c.data_admissao ? `Na casa desde ${fmt(c.data_admissao)} · ${tempoDeCasa}` : 'Sem data de admissão no cadastro'}
              </p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {resumo(pes).map(r => (
                  <span key={r.texto} className={`px-2.5 py-1 text-xs rounded-full border ${r.cls}`}>{r.texto}</span>
                ))}
              </div>
            </div>
            <BotaoLancar colaboradorId={c.id} destaque />
          </div>

          {/* Os números da pessoa */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-5">
            {[
              { label: 'Dias vencidos', value: pes.diasVencidos, cls: pes.diasVencidos > 0 ? 'text-red-300' : 'text-white/40', sub: pes.diasVencidos > 0 ? 'a lei manda pagar em dobro' : 'nenhum' },
              { label: 'Dias a tirar', value: pes.diasATirar, cls: pes.diasATirar > 0 ? 'text-amber-300' : 'text-white/40', sub: pes.proximoPrazo ? `até ${fmt(pes.proximoPrazo)}` : pes.anoEmCurso ? `próximos 30 a partir de ${fmtCurto(dayjs(pes.anoEmCurso.periodo_aquisitivo_fim).add(1, 'day').format('YYYY-MM-DD'))}` : 'nenhum' },
              { label: 'Dias já tirados', value: pes.diasTirados, cls: 'text-green-300', sub: pes.diasVendidos > 0 ? `mais ${plural(pes.diasVendidos, 'dia vendido', 'dias vendidos')}` : `em ${plural(pes.periodos.filter(p => p.gozos.length > 0).length, 'ano base', 'anos base')}` },
              { label: 'Próximas férias', value: pes.emGozo ? 'agora' : pes.proximaAgendada ? fmtCurto(pes.proximaAgendada.data_inicio) : '—', cls: pes.emGozo ? 'text-sky-300' : pes.proximaAgendada ? 'text-yellow-300' : 'text-white/40', sub: pes.emGozo ? `volta ${fmtCurto(pes.emGozo.data_prevista_retorno || dayjs(pes.emGozo.data_fim).add(1, 'day').format('YYYY-MM-DD'))}` : pes.proximaAgendada ? `${plural(pes.proximaAgendada.dias_corridos, 'dia', 'dias')} · até ${fmtCurto(pes.proximaAgendada.data_fim)}` : 'nada marcado' },
            ].map(t => (
              <div key={t.label} className="bg-white/[0.03] border border-white/10 rounded-xl p-3">
                <p className="text-xs text-white/50">{t.label}</p>
                <p className={`text-2xl font-bold leading-tight mt-0.5 ${t.cls}`}>{t.value}</p>
                <p className="text-[11px] text-white/45 mt-0.5 truncate">{t.sub}</p>
              </div>
            ))}
          </div>
        </div>

        {pes.periodos.length === 0 ? (
          <div className="bg-[#12141f] border border-white/10 rounded-2xl p-6 text-center">
            <CalendarDays className="w-10 h-10 text-white/20 mx-auto mb-3" />
            <p className="text-white/70 text-sm">
              {c.data_admissao
                ? 'Os anos base desta pessoa ainda não apareceram. Recarregue a tela — eles nascem sozinhos da data de admissão.'
                : 'Sem data de admissão no cadastro. Preencha em Colaboradores e os anos base aparecem sozinhos.'}
            </p>
          </div>
        ) : (
          <>
            {/* A linha do tempo */}
            <div className="bg-[#12141f] border border-white/10 rounded-2xl p-5">
              <h4 className="text-sm font-semibold text-white mb-1">Linha do tempo</h4>
              <p className="text-xs text-white/50 mb-4">Cada faixa é um ano base: os 12 meses trabalhados e, em seguida, os 12 meses de prazo para tirar as férias.</p>
              <LinhaDoTempo pes={pes} />
            </div>

            {/* Ano a ano, em frases */}
            <div className="bg-[#12141f] border border-white/10 rounded-2xl overflow-hidden">
              <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between flex-wrap gap-2">
                <h4 className="text-sm font-semibold text-white">Ano a ano</h4>
                <button onClick={() => abrirAnoBaseManual(c.id)} className="text-xs text-white/40 hover:text-white/80 focus-ring rounded" title="Só para casos fora do padrão">
                  ano base manual
                </button>
              </div>
              <div className="divide-y divide-white/5">
                {[...pes.periodos].reverse().map(p => {
                  const curso = emCurso(p);
                  const dias = diasParaVencer(p.periodo_concessivo_fim);
                  const vencido = !curso && p.dias_restantes > 0 && dias < 0;
                  const tirouTudo = p.dias_restantes <= 0;
                  return (
                    <div key={p.id} className={`px-5 py-4 ${vencido ? 'bg-red-900/10' : ''}`}>
                      <div className="flex items-start gap-4 flex-wrap">
                        <div className="min-w-[220px]">
                          <p className="text-white font-semibold font-mono">Ano base {rotuloAnoBase(p)}</p>
                          <p className="text-white/50 text-xs mt-0.5">
                            {curso ? 'trabalhando desde' : 'trabalhou de'} {fmt(p.periodo_aquisitivo_inicio)}{curso ? `, completa em ${fmt(p.periodo_aquisitivo_fim)}` : ` a ${fmt(p.periodo_aquisitivo_fim)}`}
                          </p>
                          <p className={`text-xs mt-0.5 ${vencido ? 'text-red-300' : 'text-white/50'}`}>
                            <button onClick={() => { setError(null); setDireitoForm({ periodo: p, nome: c.nome_completo, dias: p.dias_direito }); }} className="underline decoration-dotted underline-offset-2 hover:text-white focus-ring rounded" title="Ajustar os dias de direito (depende das faltas no ano — art. 130)">
                              {p.dias_direito} dias de direito
                            </button>
                            {' '}· tirar até {fmt(p.periodo_concessivo_fim)}
                          </p>
                          {p.dias_vendidos > 0 && (
                            <p className="text-xs mt-1 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-gold/10 border border-gold/30 text-gold/90">
                              Vendeu {plural(p.dias_vendidos, 'dia', 'dias')}{p.abono_observacoes ? ` · ${p.abono_observacoes}` : ''}
                            </p>
                          )}
                        </div>
                        <div className="flex-1 min-w-[260px] space-y-1.5">
                          {curso ? (
                            <p className="text-sm text-white/60 flex items-center gap-1.5">
                              <Hourglass className="w-3.5 h-3.5 shrink-0" />
                              Em andamento: completa o ano em {fmt(p.periodo_aquisitivo_fim)}; depois disso, {p.dias_direito} dias a tirar até {fmt(p.periodo_concessivo_fim)}.
                            </p>
                          ) : p.gozos.length === 0 ? (
                            <p className={`text-sm ${vencido ? 'text-red-200' : 'text-white/70'}`}>
                              {vencido
                                ? <><AlertTriangle className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />Ainda não tirou: {plural(p.dias_restantes, 'dia vencido', 'dias vencidos')} desde {fmt(p.periodo_concessivo_fim)}</>
                                : dias <= 60
                                  ? <>Ainda não tirou: {plural(p.dias_restantes, 'dia', 'dias')} a tirar, faltam {plural(dias, 'dia', 'dias')} para o prazo</>
                                  : <>Ainda não tirou: {plural(p.dias_restantes, 'dia', 'dias')} a tirar até {fmt(p.periodo_concessivo_fim)}</>}
                            </p>
                          ) : null}
                          {p.gozos.map((g, i) => <FeriasChip key={g.id} g={g} ordem={p.gozos.length > 1 ? `${i + 1}º período` : undefined} />)}
                          {p.gozos.length > 1 && (() => {
                            // Art. 134 §1º: até 3 períodos, um de 14+ dias, os demais de 5+.
                            const ds = p.gozos.map(g => g.dias_corridos);
                            const fora = ds.length > 3 || ds.some(d => d < 5) || (p.dias_restantes <= 0 && !ds.some(d => d >= 14));
                            return (
                              <p className={`text-xs ${fora ? 'text-amber-200/90' : 'text-white/50'}`}>
                                Férias divididas em {ds.length} períodos: {ds.join(' + ')} dias
                                {fora && <> — fora da regra da CLT (até 3 períodos, um com 14+ dias, os outros com 5+)</>}
                              </p>
                            );
                          })()}
                          {!curso && (p.gozos.length > 0 || p.dias_vendidos > 0) && !tirouTudo && (
                            <p className={`text-xs ${vencido ? 'text-red-300' : 'text-amber-200/80'}`}>
                              Tirou {p.dias_gozados}{p.dias_vendidos > 0 ? ` e vendeu ${p.dias_vendidos}` : ''} de {p.dias_direito} dias · {vencido
                                ? `${plural(p.dias_restantes, 'dia vencido', 'dias vencidos')} desde ${fmt(p.periodo_concessivo_fim)}`
                                : `ainda ${plural(p.dias_restantes, 'dia', 'dias')} a tirar até ${fmt(p.periodo_concessivo_fim)}`}
                            </p>
                          )}
                          {tirouTudo && (p.gozos.length > 0 || p.dias_vendidos > 0) && (
                            <p className="text-xs text-green-300/80"><CheckCircle className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />{p.dias_vendidos > 0 ? `Tirou ${p.dias_gozados} e vendeu ${p.dias_vendidos}: fechado` : 'Tirou tudo'}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {!curso && !tirouTudo && <BotaoLancar colaboradorId={c.id} periodoId={p.id} rotulo="Lançar neste ano" />}
                          {!curso && (p.dias_vendidos > 0 || p.dias_direito - p.dias_gozados > 0) && (
                            <button
                              onClick={() => { setError(null); setAbonoForm({ periodo: p, nome: c.nome_completo, dias: String(p.dias_vendidos || maxVendaveis(p.dias_direito)), obs: p.abono_observacoes || '' }); }}
                              className="px-2.5 py-1.5 text-xs rounded-lg border border-gold/30 text-gold/80 hover:bg-gold/10 hover:text-gold transition-colors focus-ring whitespace-nowrap"
                              title="Abono pecuniário: converter até 1/3 das férias em dinheiro (art. 143)"
                            >
                              {p.dias_vendidos > 0 ? 'Venda' : 'Vendeu férias'}
                            </button>
                          )}
                          <button onClick={() => excluirPeriodo(p, c.nome_completo)} className="p-1.5 text-white/25 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors focus-ring" title="Apagar este ano base" aria-label="Apagar este ano base">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              {pes.semVinculo.length > 0 && (
                <div className="px-5 py-4 border-t border-white/10">
                  <p className="text-xs text-amber-300/90 mb-1.5">Férias lançadas sem ano base — abra em "corrigir" e escolha o ano base:</p>
                  <div className="space-y-1.5">{pes.semVinculo.map(g => <FeriasChip key={g.id} g={g} />)}</div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    );
  };

  // ── Render ──

  return (
    <div className="space-y-5">
      {/* Topo: título, ação principal e a troca discreta para os alertas */}
      {!pessoaId && (
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
            <BotaoLancar destaque />
          </div>
        </div>
      )}

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

      {pessoaId ? (
        pessoaAberta ? <PaginaPessoa pes={pessoaAberta} /> : loading ? (
          <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine" /></div>
        ) : (
          <div className="text-center py-12 bg-[#12141f] border border-white/10 rounded-xl">
            <p className="text-white/60 text-sm">Pessoa não encontrada.</p>
            <button onClick={voltarParaLista} className="mt-3 text-sm text-[#e8949e] hover:text-white focus-ring rounded">Voltar para a lista</button>
          </div>
        )
      ) : aba === 'alertas' ? (
        <MonitoramentoFeriasIA />
      ) : (
        <div className="space-y-4">
          {!loading || pessoas.length > 0 ? <PanoramaDoTime /> : null}

          <p className="text-xs text-white/45 px-1 flex gap-2">
            <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>
              Cada ano trabalhado vira um ano base sozinho, pela data de admissão, com 30 dias de férias a tirar nos 12 meses seguintes
              — dá para dividir em até 3 períodos e vender até 10 dias. Clique numa pessoa para ver a história dela.
            </span>
          </p>

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
          </div>

          {loading && pessoas.length === 0 ? (
            <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-wine" /></div>
          ) : listaVisivel.length === 0 ? (
            <div className="text-center py-12 bg-[#12141f] border border-white/10 rounded-xl">
              <CalendarDays className="w-12 h-12 text-white/20 mx-auto mb-3" />
              <p className="text-white/60 text-sm">{busca || filtro !== 'todos' ? 'Ninguém com esse filtro.' : 'Nenhum colaborador ativo.'}</p>
            </div>
          ) : (
            <div className="space-y-2">
              {listaVisivel.map(pes => {
                const c = pes.colab;
                return (
                  <div
                    key={c.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => abrirPessoa(c.id)}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrirPessoa(c.id); } }}
                    className={`group bg-[#12141f] border rounded-xl px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors hover:bg-white/[0.03] focus-ring ${pes.pendencia === 'vencido' ? 'border-red-700/40' : pes.emGozo ? 'border-sky-700/40' : 'border-white/10 hover:border-white/20'}`}
                  >
                    <Avatar c={c} />
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-white truncate">
                        {c.nome_completo}
                        {c.status === 'inativo' && <span className="ml-2 text-xs font-normal text-white/40">(desligado)</span>}
                      </p>
                      <p className="text-white/50 text-xs truncate">
                        {c.funcao_nome || ''}{c.data_admissao ? `${c.funcao_nome ? ' · ' : ''}na casa desde ${fmt(c.data_admissao)}` : ''}
                      </p>
                    </div>
                    <div className="hidden sm:flex items-center gap-1.5 flex-wrap justify-end">
                      {resumo(pes).map(r => (
                        <span key={r.texto} className={`px-2.5 py-1 text-xs rounded-full border ${r.cls}`}>{r.texto}</span>
                      ))}
                    </div>
                    <BotaoLancar colaboradorId={c.id} />
                    <ChevronRight className="w-4 h-4 shrink-0 text-white/30 group-hover:text-white/70 transition-colors" />
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

              {/* O que a CLT tem a dizer sobre estas datas — avisa, não bloqueia:
                  o RH pode estar registrando o que já aconteceu. */}
              {(() => {
                const periodo = periodosDisponiveis.find(p => p.id === feriasForm.periodo_aquisitivo_id) ?? null;
                const outros = periodo ? gozos.filter(g => g.periodo_aquisitivo_id === periodo.id) : [];
                const avisos = avisosLegais({ dataInicio: feriasForm.data_inicio, dataFim: feriasForm.data_fim, periodo, outrosGozos: outros, editandoId: editingFerias?.id });
                if (avisos.length === 0) return null;
                return (
                  <ul className="space-y-1.5">
                    {avisos.map(a => (
                      <li key={a.texto} className={`flex gap-2 text-xs rounded-lg px-3 py-2 border ${a.nivel === 'alerta' ? 'bg-amber-900/15 border-amber-700/30 text-amber-200' : 'bg-white/[0.03] border-white/10 text-white/60'}`}>
                        {a.nivel === 'alerta' ? <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> : <Info className="w-3.5 h-3.5 mt-0.5 shrink-0" />}
                        <span>{a.texto}</span>
                      </li>
                    ))}
                  </ul>
                );
              })()}

              <div>
                <label className="block text-xs text-white/50 mb-1">Observação (opcional)</label>
                <textarea className={inp + ' resize-none'} rows={2} value={feriasForm.observacoes}
                  onChange={e => setFeriasForm(f => ({ ...f, observacoes: e.target.value }))} placeholder="Ex.: férias coletivas, a pedido do colaborador..." />
                <p className="text-[11px] text-white/40 mt-1">Vendeu dias? Isso se registra na página da pessoa, no ano base, em "Vendeu férias".</p>
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

      {/* ═══════ MODAL: Vendeu férias (abono pecuniário, art. 143) ═══════ */}
      {abonoForm && (() => {
        const p = abonoForm.periodo;
        const max = maxVendaveis(p.dias_direito);
        const n = parseInt(abonoForm.dias) || 0;
        const sobra = p.dias_direito - p.dias_gozados - n;
        const prazoPedido = dayjs(p.periodo_aquisitivo_fim).subtract(15, 'day');
        return (
          <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-[#12141f] border border-white/15 rounded-2xl w-full max-w-md">
              <div className="flex items-center justify-between p-5 border-b border-white/10">
                <div>
                  <h3 className="text-lg font-bold text-white">Vendeu férias</h3>
                  <p className="text-xs text-white/50 mt-0.5">{abonoForm.nome} · ano base {rotuloAnoBase(p)}</p>
                </div>
                <button onClick={() => { setAbonoForm(null); setError(null); }} className="text-white/40 hover:text-white focus-ring rounded" aria-label="Fechar"><XCircle className="w-5 h-5" /></button>
              </div>
              <div className="p-5 space-y-4">
                {error && <div className="p-3 bg-red-900/30 text-red-300 rounded-xl border border-red-700/40 text-sm">{error}</div>}

                <div className="bg-white/[0.03] border border-white/10 rounded-xl p-3 text-xs text-white/60 space-y-1">
                  <p>A pessoa pode trocar até <strong className="text-white">um terço</strong> das férias por dinheiro (abono pecuniário, art. 143 da CLT).</p>
                  <p>Com <strong className="text-white">{p.dias_direito} dias</strong> de direito, dá para vender no máximo <strong className="text-white">{max}</strong>. Os dias vendidos são pagos junto com as férias, também com o 1/3.</p>
                  <p>O pedido é do empregado e vale até <strong className="text-white">{fmt(prazoPedido.format('YYYY-MM-DD'))}</strong> (15 dias antes de fechar o ano base). Depois disso, só se a empresa aceitar.</p>
                </div>

                <div>
                  <label className="block text-xs text-white/50 mb-1">Quantos dias vendeu</label>
                  <div className="flex gap-2">
                    {[0, ...Array.from({ length: max }, (_, i) => i + 1).filter(d => d === max || d % 5 === 0)].map(d => (
                      <button key={d} onClick={() => setAbonoForm(f => f && ({ ...f, dias: String(d) }))}
                        className={`flex-1 py-2 rounded-xl text-sm border transition-colors focus-ring ${n === d ? 'bg-gold/20 border-gold/50 text-gold' : 'border-white/15 text-white/60 hover:bg-white/5'}`}>
                        {d === 0 ? 'Nenhum' : `${d} dias`}
                      </button>
                    ))}
                    <input type="number" min={0} max={max} className={inp + ' w-20 flex-none text-center'} value={abonoForm.dias}
                      onChange={e => setAbonoForm(f => f && ({ ...f, dias: e.target.value }))} aria-label="Outro número de dias" />
                  </div>
                  <p className="text-xs mt-2 text-white/60">
                    {n > max ? <span className="text-amber-300">Passa do limite legal de {max} dias.</span>
                      : n > 0 ? <>Sobram <strong className="text-white">{Math.max(0, sobra)} dias</strong> para tirar de folga{p.dias_gozados > 0 ? ` (já tirou ${p.dias_gozados})` : ''}.</>
                      : 'Nenhum dia vendido neste ano base.'}
                  </p>
                </div>

                <div>
                  <label className="block text-xs text-white/50 mb-1">Observação (opcional)</label>
                  <input className={inp} value={abonoForm.obs} onChange={e => setAbonoForm(f => f && ({ ...f, obs: e.target.value }))} placeholder="Ex.: pedido em 10/02/2026, pago com as férias" />
                </div>

                <div className="flex gap-3 pt-1">
                  <button onClick={() => { setAbonoForm(null); setError(null); }} className="flex-1 px-4 py-2 border border-white/15 text-white/70 rounded-xl hover:bg-white/5 text-sm focus-ring">Cancelar</button>
                  <button onClick={salvarAbono} className="flex-1 px-4 py-2 bg-wine text-white rounded-xl hover:bg-[#9D2F3C] text-sm font-medium focus-ring">Salvar</button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ═══════ MODAL: Dias de direito (art. 130) ═══════ */}
      {direitoForm && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#12141f] border border-white/15 rounded-2xl w-full max-w-md">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div>
                <h3 className="text-lg font-bold text-white">Dias de direito</h3>
                <p className="text-xs text-white/50 mt-0.5">{direitoForm.nome} · ano base {rotuloAnoBase(direitoForm.periodo)}</p>
              </div>
              <button onClick={() => { setDireitoForm(null); setError(null); }} className="text-white/40 hover:text-white focus-ring rounded" aria-label="Fechar"><XCircle className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              {error && <div className="p-3 bg-red-900/30 text-red-300 rounded-xl border border-red-700/40 text-sm">{error}</div>}
              <p className="text-xs text-white/60">Os dias de férias dependem das faltas sem justificativa no ano base (art. 130 da CLT). Mais de 32 faltas: perde as férias do ano.</p>
              <div className="space-y-2">
                {DEGRAUS_DIREITO.map(d => (
                  <button key={d.dias} onClick={() => setDireitoForm(f => f && ({ ...f, dias: d.dias }))}
                    className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm transition-colors focus-ring ${direitoForm.dias === d.dias ? 'bg-wine/20 border-wine/50 text-white' : 'border-white/15 text-white/70 hover:bg-white/5'}`}>
                    <span className="font-semibold">{d.dias} dias</span>
                    <span className="text-xs opacity-70">{d.faltas}</span>
                  </button>
                ))}
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={() => { setDireitoForm(null); setError(null); }} className="flex-1 px-4 py-2 border border-white/15 text-white/70 rounded-xl hover:bg-white/5 text-sm focus-ring">Cancelar</button>
                <button onClick={salvarDiasDireito} className="flex-1 px-4 py-2 bg-wine text-white rounded-xl hover:bg-[#9D2F3C] text-sm font-medium focus-ring">Salvar</button>
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
                <p className="text-xs text-white/50 mt-0.5">Só para casos fora do padrão — os anos base normais nascem sozinhos. Para registrar férias tiradas, use "Lançar férias".</p>
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
                  onChange={e => abrirAnoBaseManual(e.target.value)}>
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
                      onChange={e => { const v = e.target.value; setPeriodoForm(p => ({ ...p, periodo_aquisitivo_fim: v, ...calcularConcessivo(v) })); }} />
                  </div>
                </div>
              </div>

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
