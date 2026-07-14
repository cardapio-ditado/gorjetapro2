import React, { useState, useEffect, useCallback, useRef } from 'react';

const isValidUUID = (val: string | null | undefined): boolean =>
  !!val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
import { supabase } from '../lib/supabase';
import { BookOpen, Calendar, ChevronLeft, ChevronRight, Sparkles, Save, Plus, Trash2, AlertCircle, CheckCircle, Search, Filter, X, CreditCard as Edit2, Clock, RefreshCw, AlertTriangle, Loader2, Sun, Moon, UserX, Eye, MessageSquare, Zap } from 'lucide-react';
import dayjs from '../lib/dayjs';
import { useAuth } from '../contexts/AuthContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DiarioBordo {
  id: string;
  data_diario: string;
  turno: 'dia' | 'noite';
  texto_bruto: string | null;
  texto_ia: string | null;
  insights_ia: InsightsIA | null;
  status_processamento: 'pendente' | 'processando' | 'concluido' | 'erro';
  erro_processamento: string | null;
  registrado_por: string | null;
  registrado_por_nome: string | null;
  criado_em: string;
  atualizado_em: string;
}

interface InsightsIA {
  faltas_detectadas?: FaltaDetectada[];
  insights?: string[];
  resumo?: string;
}

interface FaltaDetectada {
  nome: string;
  tipo: string;
  justificada: boolean;
}

interface OcorrenciaSetor {
  id: string;
  diario_id: string | null;
  data_ocorrencia: string;
  setor: string;
  tipo: string;
  gravidade: 'baixa' | 'media' | 'alta' | 'critica';
  titulo: string;
  descricao: string | null;
  status: 'pendente' | 'em_andamento' | 'resolvida' | 'cancelada';
  funcionario_id: string | null;
  gerado_por_ia: boolean;
  criado_em: string;
}

interface Pendencia {
  id: string;
  titulo: string;
  setor: string;
  gravidade: string;
  dias_em_aberto: number;
  data_ocorrencia: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const SETORES = [
  { value: 'bar',                    label: 'Bar',                     color: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
  { value: 'cozinha',                label: 'Cozinha',                  color: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  { value: 'administrativo',         label: 'Administrativo',           color: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  { value: 'salao',                  label: 'Salão',                    color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  { value: 'relacionamento_clientes',label: 'Relacionamento c/ Clientes',color: 'bg-sky-500/15 text-sky-300 border-sky-500/30' },
  { value: 'seguranca',              label: 'Segurança',                color: 'bg-red-500/15 text-red-300 border-red-500/30' },
  { value: 'manutencao',             label: 'Manutenção',               color: 'bg-gray-500/15 text-gray-300 border-gray-500/30' },
];

const GRAVIDADES = [
  { value: 'baixa',   label: 'Baixa',   color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  { value: 'media',   label: 'Média',   color: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' },
  { value: 'alta',    label: 'Alta',    color: 'bg-orange-500/15 text-orange-300 border-orange-500/30' },
  { value: 'critica', label: 'Crítica', color: 'bg-red-500/15 text-red-300 border-red-500/30' },
];

const STATUS_OPTIONS = [
  { value: 'pendente',      label: 'Pendente',      color: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30' },
  { value: 'em_andamento',  label: 'Em andamento',  color: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
  { value: 'resolvida',     label: 'Resolvida',     color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
  { value: 'cancelada',     label: 'Cancelada',     color: 'bg-gray-500/15 text-gray-300 border-gray-500/30' },
];

const getSetorColor = (v: string) => SETORES.find(s => s.value === v)?.color ?? 'bg-gray-500/15 text-gray-300 border-gray-500/30';
const getGravColor  = (v: string) => GRAVIDADES.find(g => g.value === v)?.color ?? 'bg-gray-500/15 text-gray-300 border-gray-500/30';
const getStatusColor= (v: string) => STATUS_OPTIONS.find(s => s.value === v)?.color ?? 'bg-gray-500/15 text-gray-300 border-gray-500/30';
const getSetorLabel = (v: string) => SETORES.find(s => s.value === v)?.label ?? v;

// ─── Chip component ───────────────────────────────────────────────────────────

const Chip: React.FC<{ className: string; children: React.ReactNode }> = ({ className, children }) => (
  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${className}`}>
    {children}
  </span>
);

// ─── Modal nova ocorrência ────────────────────────────────────────────────────

interface ModalOcorrenciaProps {
  diarioId: string | null;
  dataOcorrencia: string;
  onClose: () => void;
  onSaved: (o: OcorrenciaSetor) => void;
}

const ModalNovaOcorrencia: React.FC<ModalOcorrenciaProps> = ({ diarioId, dataOcorrencia, onClose, onSaved }) => {
  const [form, setForm] = useState({ setor: 'bar', gravidade: 'media', titulo: '', descricao: '', status: 'pendente', tipo: 'incidente' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const submit = async () => {
    if (!form.titulo.trim()) { setErr('Título obrigatório'); return; }
    setSaving(true);
    const { data, error } = await supabase
      .from('ocorrencias_setor')
      .insert([{
        diario_id: diarioId,
        data_ocorrencia: dataOcorrencia,
        setor: form.setor,
        gravidade: form.gravidade,
        titulo: form.titulo.trim(),
        descricao: form.descricao.trim() || null,
        status: form.status,
        tipo: form.tipo,
        gerado_por_ia: false,
      }])
      .select()
      .single();
    setSaving(false);
    if (error) { setErr(error.message); return; }
    onSaved(data);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md rounded-2xl p-6 space-y-4" style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <div className="flex items-center justify-between">
          <h3 className="text-white font-semibold">Adicionar Ocorrência Manual</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X size={18} /></button>
        </div>

        {err && <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{err}</p>}

        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/50 mb-1">Setor</label>
              <select value={form.setor} onChange={e => setForm(f => ({ ...f, setor: e.target.value }))}
                className="w-full bg-black/30 border border-white/15 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30">
                {SETORES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1">Gravidade</label>
              <select value={form.gravidade} onChange={e => setForm(f => ({ ...f, gravidade: e.target.value }))}
                className="w-full bg-black/30 border border-white/15 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30">
                {GRAVIDADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-white/50 mb-1">Título *</label>
            <input type="text" value={form.titulo} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))}
              placeholder="Resumo da ocorrência"
              className="w-full bg-black/30 border border-white/15 rounded-lg px-3 py-2 text-white placeholder-white/25 text-sm focus:outline-none focus:border-white/30" />
          </div>

          <div>
            <label className="block text-xs text-white/50 mb-1">Descrição</label>
            <textarea value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
              rows={3} placeholder="Detalhes da ocorrência..."
              className="w-full bg-black/30 border border-white/15 rounded-lg px-3 py-2 text-white placeholder-white/25 text-sm resize-none focus:outline-none focus:border-white/30" />
          </div>

          <div>
            <label className="block text-xs text-white/50 mb-1">Status</label>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="w-full bg-black/30 border border-white/15 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-white/30">
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div className="flex gap-2 pt-1">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg border border-white/10 text-white/60 hover:text-white text-sm transition-colors">Cancelar</button>
          <button onClick={submit} disabled={saving}
            className="flex-1 py-2 rounded-lg text-white text-sm font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
            style={{ background: 'var(--wine)' }}>
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Ocorrência card (editável inline) ───────────────────────────────────────

interface OcorrenciaCardProps {
  ocorrencia: OcorrenciaSetor;
  onUpdate: (id: string, patch: Partial<OcorrenciaSetor>) => void;
  onDelete: (id: string) => void;
}

const OcorrenciaCard: React.FC<OcorrenciaCardProps> = ({ ocorrencia: o, onUpdate, onDelete }) => {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ setor: o.setor, gravidade: o.gravidade, status: o.status });
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase.from('ocorrencias_setor').update(form).eq('id', o.id);
    setSaving(false);
    if (!error) {
      onUpdate(o.id, form as Partial<OcorrenciaSetor>);
      setEditing(false);
    }
  };

  const del = async () => {
    if (!confirm('Deletar esta ocorrência?')) return;
    await supabase.from('ocorrencias_setor').delete().eq('id', o.id);
    onDelete(o.id);
  };

  return (
    <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-white text-sm font-medium leading-snug">{o.titulo}</p>
          {o.descricao && <p className="text-white/50 text-xs mt-1 line-clamp-2">{o.descricao}</p>}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0">
          {o.gerado_por_ia && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25 font-medium">IA</span>
          )}
          <button onClick={() => setEditing(!editing)} className="p-1.5 text-white/30 hover:text-white rounded-lg hover:bg-white/5 transition-colors">
            <Edit2 size={12} />
          </button>
          <button onClick={del} className="p-1.5 text-white/30 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors">
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {!editing ? (
        <div className="flex flex-wrap gap-1.5">
          <Chip className={getSetorColor(o.setor)}>{getSetorLabel(o.setor)}</Chip>
          <Chip className={getGravColor(o.gravidade)}>{GRAVIDADES.find(g => g.value === o.gravidade)?.label}</Chip>
          <Chip className={getStatusColor(o.status)}>{STATUS_OPTIONS.find(s => s.value === o.status)?.label}</Chip>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid grid-cols-3 gap-2">
            <select value={form.setor} onChange={e => setForm(f => ({ ...f, setor: e.target.value }))}
              className="bg-black/40 border border-white/15 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30">
              {SETORES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <select value={form.gravidade} onChange={e => setForm(f => ({ ...f, gravidade: e.target.value }))}
              className="bg-black/40 border border-white/15 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30">
              {GRAVIDADES.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
            <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}
              className="bg-black/40 border border-white/15 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:border-white/30">
              {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setEditing(false)} className="flex-1 py-1.5 rounded-lg border border-white/10 text-white/50 hover:text-white text-xs transition-colors">Cancelar</button>
            <button onClick={save} disabled={saving}
              className="flex-1 py-1.5 rounded-lg text-white text-xs font-medium flex items-center justify-center gap-1 transition-colors"
              style={{ background: 'var(--wine)' }}>
              {saving ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle size={11} />}
              Salvar
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Aba 1: Caderno do Dia ────────────────────────────────────────────────────

const CadernoDia: React.FC = () => {
  const { usuario } = useAuth();

  const [data, setData]   = useState(dayjs().format('YYYY-MM-DD'));
  const [turno, setTurno] = useState<'dia' | 'noite'>('dia');
  const [texto, setTexto] = useState('');

  const [diario, setDiario]         = useState<DiarioBordo | null>(null);
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaSetor[]>([]);
  const [pendencias, setPendencias]   = useState<Pendencia[]>([]);

  const [loading, setLoading]           = useState(false);
  const [saving, setSaving]             = useState(false);
  const [processando, setProcessando]   = useState(false);
  const [toast, setToast]               = useState<{ msg: string; tipo: 'ok' | 'err' } | null>(null);
  const [showModalOc, setShowModalOc]   = useState(false);

  const toastTimer = useRef<ReturnType<typeof setTimeout>>();

  const showToast = (msg: string, tipo: 'ok' | 'err' = 'ok') => {
    setToast({ msg, tipo });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 4000);
  };

  // Carregar pendências (independente de data/turno)
  useEffect(() => {
    supabase.from('vw_pendencias_diario').select('*').order('dias_em_aberto', { ascending: false })
      .then(({ data }) => setPendencias((data as Pendencia[]) || []));
  }, []);

  // Carregar diário ao mudar data/turno
  const loadDiario = useCallback(async () => {
    setLoading(true);
    const { data: rows, error } = await supabase
      .from('diario_bordo')
      .select('*')
      .eq('data_diario', data)
      .eq('turno', turno)
      .maybeSingle();

    if (error) { showToast(error.message, 'err'); setLoading(false); return; }

    if (rows) {
      setDiario(rows);
      setTexto(rows.texto_bruto || '');
      // carregar ocorrências se já processou
      if (rows.status_processamento === 'concluido' || rows.id) {
        const { data: ocs } = await supabase
          .from('ocorrencias_setor')
          .select('*')
          .eq('diario_id', rows.id)
          .order('criado_em', { ascending: true });
        setOcorrencias((ocs as OcorrenciaSetor[]) || []);
      }
    } else {
      setDiario(null);
      setTexto('');
      setOcorrencias([]);
    }
    setLoading(false);
  }, [data, turno]);

  useEffect(() => { loadDiario(); }, [loadDiario]);

  // Salvar rascunho (upsert)
  const salvarRascunho = async (): Promise<string | null> => {
    setSaving(true);
    const payload = {
      data_diario: data,
      turno,
      texto_bruto: texto,
      registrado_por: isValidUUID(usuario?.id) ? usuario!.id : null,
      registrado_por_nome: usuario?.nome_completo || null,
    };

    let id: string | null = diario?.id || null;

    if (diario) {
      const { error } = await supabase.from('diario_bordo').update({ texto_bruto: texto, atualizado_em: new Date().toISOString() }).eq('id', diario.id);
      if (error) { showToast(error.message, 'err'); setSaving(false); return null; }
    } else {
      const { data: ins, error } = await supabase.from('diario_bordo').insert([payload]).select().single();
      if (error) { showToast(error.message, 'err'); setSaving(false); return null; }
      setDiario(ins);
      id = ins.id;
    }

    setSaving(false);
    return id;
  };

  // Salvar + chamar IA
  const salvarEOrganizar = async () => {
    if (!texto.trim()) { showToast('Escreva algo antes de organizar com IA', 'err'); return; }

    const id = await salvarRascunho();
    if (!id) return;

    setProcessando(true);
    setDiario(prev => prev ? { ...prev, status_processamento: 'processando' } : prev);

    const { data: res, error } = await supabase.functions.invoke('processar-diario-bordo', {
      body: { diario_id: id },
    });

    if (error || res?.error) {
      const msg = error?.message || res?.error || 'Erro ao processar';
      setDiario(prev => prev ? { ...prev, status_processamento: 'erro', erro_processamento: msg } : prev);
      showToast(msg, 'err');
      setProcessando(false);
      return;
    }

    // Recarregar dados atualizados
    await loadDiario();
    setProcessando(false);
    showToast('Caderno organizado com sucesso!');
  };

  const resolverPendencia = async (id: string) => {
    const { error } = await supabase.from('ocorrencias_setor').update({ status: 'resolvida' }).eq('id', id);
    if (!error) setPendencias(prev => prev.filter(p => p.id !== id));
  };

  const updateOcorrencia = (id: string, patch: Partial<OcorrenciaSetor>) => {
    setOcorrencias(prev => prev.map(o => o.id === id ? { ...o, ...patch } : o));
  };

  const deleteOcorrencia = (id: string) => {
    setOcorrencias(prev => prev.filter(o => o.id !== id));
  };

  const ehHoje = data === dayjs().format('YYYY-MM-DD');
  const d = diario;
  const concluido = d?.status_processamento === 'concluido';
  const erro      = d?.status_processamento === 'erro';

  return (
    <div className="space-y-5 max-w-3xl mx-auto">

      {/* Toast */}
      {toast && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg text-sm font-medium animate-slide-up ${
          toast.tipo === 'ok'
            ? 'bg-emerald-900/90 border border-emerald-500/40 text-emerald-200'
            : 'bg-red-900/90 border border-red-500/40 text-red-200'
        }`}>
          {toast.tipo === 'ok' ? <CheckCircle size={15} /> : <AlertCircle size={15} />}
          {toast.msg}
        </div>
      )}

      {/* ── Cabeçalho ── */}
      <div className="flex flex-col sm:flex-row gap-3 items-start sm:items-center justify-between">
        {/* Seletor de data */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <button onClick={() => setData(prev => dayjs(prev).subtract(1, 'day').format('YYYY-MM-DD'))}
            className="p-1 text-white/40 hover:text-white transition-colors">
            <ChevronLeft size={16} />
          </button>
          <Calendar size={14} className="text-white/40" />
          <input type="date" value={data} onChange={e => setData(e.target.value)}
            className="bg-transparent text-white text-sm font-medium border-none outline-none cursor-pointer" />
          <button onClick={() => setData(prev => dayjs(prev).add(1, 'day').format('YYYY-MM-DD'))}
            disabled={ehHoje}
            className="p-1 text-white/40 hover:text-white transition-colors disabled:opacity-30">
            <ChevronRight size={16} />
          </button>
          {!ehHoje && (
            <button onClick={() => setData(dayjs().format('YYYY-MM-DD'))}
              className="ml-1 px-2 py-0.5 text-xs rounded-md"
              style={{ background: 'rgba(125,31,44,0.2)', color: 'var(--wine-light, #e05a6a)' }}>
              Hoje
            </button>
          )}
        </div>

        {/* Toggle turno */}
        <div className="flex items-center rounded-xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.08)' }}>
          {(['dia', 'noite'] as const).map(t => (
            <button key={t}
              onClick={() => setTurno(t)}
              className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-all ${turno === t ? 'text-white' : 'text-white/40 hover:text-white/70'}`}
              style={turno === t ? { background: 'rgba(125,31,44,0.3)' } : undefined}>
              {t === 'dia' ? <Sun size={14} /> : <Moon size={14} />}
              {t === 'dia' ? 'Turno Dia' : 'Turno Noite'}
            </button>
          ))}
        </div>
      </div>

      {/* Info do registrante */}
      <div className="flex items-center gap-2 text-xs text-white/40">
        <Clock size={12} />
        {dayjs(data).format('dddd, D [de] MMMM [de] YYYY')}
        {usuario?.nome_completo && (
          <span className="ml-2 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/50">
            Registrado por {usuario.nome_completo.split(' ')[0]}
          </span>
        )}
      </div>

      {/* ── Pendências ── */}
      {pendencias.length > 0 && (
        <div className="rounded-xl p-4 space-y-3" style={{ background: 'rgba(234,179,8,0.06)', border: '1px solid rgba(234,179,8,0.2)' }}>
          <div className="flex items-center gap-2">
            <AlertTriangle size={14} className="text-yellow-400" />
            <h3 className="text-yellow-300 font-semibold text-sm">Pendências que rolaram ({pendencias.length})</h3>
          </div>
          <div className="space-y-2">
            {pendencias.map(p => (
              <div key={p.id} className="flex items-center justify-between gap-3 py-2 px-3 rounded-lg" style={{ background: 'rgba(0,0,0,0.2)' }}>
                <div className="flex items-center gap-2 min-w-0">
                  <Chip className={getSetorColor(p.setor)}>{getSetorLabel(p.setor)}</Chip>
                  <span className="text-white/80 text-xs truncate">{p.titulo}</span>
                  <span className="text-white/30 text-xs flex-shrink-0">{p.dias_em_aberto}d</span>
                </div>
                <button
                  onClick={() => resolverPendencia(p.id)}
                  className="flex-shrink-0 px-3 py-1 rounded-lg text-xs font-medium text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/10 transition-colors">
                  Resolver
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Textarea principal ── */}
      {loading ? (
        <div className="flex items-center justify-center h-48 text-white/30">
          <Loader2 size={24} className="animate-spin" />
        </div>
      ) : (
        <div className="space-y-3">
          <div className="relative">
            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              placeholder={`Escreva o ${turno === 'dia' ? 'dia' : 'a noite'} como aconteceu: movimento, faltas e atrasos, problemas com clientes, equipamentos, segurança, compras de emergência…`}
              rows={12}
              className="w-full rounded-2xl px-5 py-4 text-white placeholder-white/20 text-sm leading-relaxed resize-none focus:outline-none transition-colors"
              style={{
                background: 'var(--bg-card)',
                border: '1px solid rgba(255,255,255,0.1)',
                fontFamily: 'inherit',
                fontSize: '15px',
                lineHeight: '1.75',
              }}
            />
            {d?.status_processamento === 'processando' && (
              <div className="absolute inset-0 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(2px)' }}>
                <div className="text-center space-y-2">
                  <Loader2 size={28} className="animate-spin text-amber-400 mx-auto" />
                  <p className="text-white/70 text-sm font-medium">Organizando o caderno…</p>
                </div>
              </div>
            )}
          </div>

          {/* Erro de processamento */}
          {erro && (
            <div className="flex items-start gap-3 p-4 rounded-xl" style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <AlertCircle size={16} className="text-red-400 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-red-300 text-sm font-medium">Erro ao processar</p>
                <p className="text-red-400/70 text-xs mt-1">{d?.erro_processamento}</p>
              </div>
              <button
                onClick={salvarEOrganizar}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white flex-shrink-0"
                style={{ background: 'var(--wine)' }}>
                <RefreshCw size={12} />
                Tentar de novo
              </button>
            </div>
          )}

          {/* Botões de ação */}
          <div className="flex items-center gap-3">
            <button
              onClick={salvarEOrganizar}
              disabled={processando || saving || !texto.trim()}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ background: 'linear-gradient(135deg, var(--wine), #a02536)' }}>
              {processando ? (
                <><Loader2 size={15} className="animate-spin" /> Organizando…</>
              ) : (
                <><Sparkles size={15} /> Salvar e organizar com IA</>
              )}
            </button>

            <button
              onClick={async () => { await salvarRascunho(); showToast('Rascunho salvo!'); }}
              disabled={saving || !texto.trim()}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white/60 hover:text-white border border-white/10 hover:border-white/20 text-sm font-medium transition-all disabled:opacity-40">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Salvar rascunho
            </button>

            {(diario?.id) && (
              <button
                onClick={() => setShowModalOc(true)}
                className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-xl text-white/50 hover:text-white border border-white/8 hover:border-white/15 text-sm transition-all">
                <Plus size={14} />
                Ocorrência manual
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Resultados IA ── */}
      {concluido && d && (
        <div className="space-y-5 pt-2">

          {/* Versão organizada */}
          {d.texto_ia && (
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(212,175,55,0.2)' }}>
              <div className="flex items-center gap-2 px-5 py-3" style={{ background: 'rgba(212,175,55,0.08)', borderBottom: '1px solid rgba(212,175,55,0.15)' }}>
                <Sparkles size={14} className="text-amber-400" />
                <span className="text-amber-300 text-sm font-semibold">Versão organizada pela IA</span>
              </div>
              <div className="px-5 py-4" style={{ background: 'var(--bg-card)' }}>
                <p className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap">{d.texto_ia}</p>
              </div>
            </div>
          )}

          {/* Ocorrências geradas */}
          {ocorrencias.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-white/70 text-xs font-semibold uppercase tracking-wider flex items-center gap-2">
                <AlertTriangle size={12} />
                Ocorrências detectadas ({ocorrencias.length})
              </h3>
              <div className="grid gap-2">
                {ocorrencias.map(o => (
                  <OcorrenciaCard key={o.id} ocorrencia={o} onUpdate={updateOcorrencia} onDelete={deleteOcorrencia} />
                ))}
              </div>
            </div>
          )}

          {/* Faltas detectadas */}
          {d.insights_ia?.faltas_detectadas && d.insights_ia.faltas_detectadas.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(239,68,68,0.2)' }}>
              <div className="flex items-center gap-2 px-5 py-3" style={{ background: 'rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(239,68,68,0.15)' }}>
                <UserX size={14} className="text-red-400" />
                <span className="text-red-300 text-sm font-semibold">Faltas detectadas ({d.insights_ia.faltas_detectadas.length})</span>
              </div>
              <div className="divide-y" style={{ background: 'var(--bg-card)', borderColor: 'rgba(255,255,255,0.05)' }}>
                {d.insights_ia.faltas_detectadas.map((f, i) => (
                  <div key={i} className="flex items-center justify-between px-5 py-3 gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="text-white text-sm font-medium">{f.nome}</span>
                      {f.tipo && <span className="text-white/40 text-xs">· {f.tipo}</span>}
                      <span className={`text-xs px-1.5 py-0.5 rounded-full border ${f.justificada ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' : 'bg-red-500/15 text-red-300 border-red-500/30'}`}>
                        {f.justificada ? 'Justificada' : 'Não justificada'}
                      </span>
                    </div>
                    <button
                      className="flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/10 text-white/50 hover:text-white hover:border-white/20 transition-colors"
                      onClick={() => window.open(`/staff?tab=3&busca=${encodeURIComponent(f.nome)}`, '_blank')}>
                      Confirmar no RH
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Insights / Cruzamentos */}
          {d.insights_ia?.insights && d.insights_ia.insights.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid rgba(99,102,241,0.2)' }}>
              <div className="flex items-center gap-2 px-5 py-3" style={{ background: 'rgba(99,102,241,0.08)', borderBottom: '1px solid rgba(99,102,241,0.15)' }}>
                <Zap size={14} className="text-indigo-400" />
                <span className="text-indigo-300 text-sm font-semibold">Cruzamentos da IA</span>
              </div>
              <div className="px-5 py-4 space-y-2" style={{ background: 'var(--bg-card)' }}>
                {d.insights_ia.insights.map((ins, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm text-white/70">
                    <Eye size={13} className="text-indigo-400 mt-0.5 flex-shrink-0" />
                    <span>{ins}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal nova ocorrência */}
      {showModalOc && (
        <ModalNovaOcorrencia
          diarioId={diario?.id || null}
          dataOcorrencia={data}
          onClose={() => setShowModalOc(false)}
          onSaved={o => setOcorrencias(prev => [...prev, o])}
        />
      )}
    </div>
  );
};

// ─── Aba 2: Histórico e Ocorrências ──────────────────────────────────────────

const HistoricoOcorrencias: React.FC = () => {
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaSetor[]>([]);
  const [loading, setLoading]         = useState(true);
  const [busca, setBusca]             = useState('');
  const [filtroSetor, setFiltroSetor] = useState('');
  const [filtroGrav, setFiltroGrav]   = useState('');
  const [filtroStatus, setFiltroStatus] = useState('');
  const [diarioSelecionado, setDiarioSelecionado] = useState<DiarioBordo | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data } = await supabase
        .from('ocorrencias_setor')
        .select('*')
        .order('data_ocorrencia', { ascending: false })
        .limit(300);
      setOcorrencias((data as OcorrenciaSetor[]) || []);
      setLoading(false);
    };
    load();
  }, []);

  const filtradas = ocorrencias.filter(o => {
    const matchBusca = !busca || o.titulo.toLowerCase().includes(busca.toLowerCase()) || o.descricao?.toLowerCase().includes(busca.toLowerCase());
    const matchSetor  = !filtroSetor  || o.setor === filtroSetor;
    const matchGrav   = !filtroGrav   || o.gravidade === filtroGrav;
    const matchStatus = !filtroStatus || o.status === filtroStatus;
    return matchBusca && matchSetor && matchGrav && matchStatus;
  });

  const verDiario = async (diarioId: string) => {
    const { data } = await supabase.from('diario_bordo').select('*').eq('id', diarioId).single();
    if (data) setDiarioSelecionado(data);
  };

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <input
            value={busca}
            onChange={e => setBusca(e.target.value)}
            placeholder="Buscar ocorrências…"
            className="w-full pl-9 pr-4 py-2 rounded-xl text-white placeholder-white/25 text-sm focus:outline-none"
            style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.08)' }}
          />
        </div>
        <div className="flex gap-2">
          {[
            { val: filtroSetor, set: setFiltroSetor, opts: SETORES, label: 'Setor' },
            { val: filtroGrav,  set: setFiltroGrav,  opts: GRAVIDADES, label: 'Gravidade' },
            { val: filtroStatus,set: setFiltroStatus,opts: STATUS_OPTIONS, label: 'Status' },
          ].map(({ val, set, opts, label }) => (
            <select key={label} value={val} onChange={e => set(e.target.value)}
              className="px-3 py-2 rounded-xl text-white text-sm focus:outline-none"
              style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <option value="">{label}</option>
              {opts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ))}
          {(filtroSetor || filtroGrav || filtroStatus || busca) && (
            <button onClick={() => { setFiltroSetor(''); setFiltroGrav(''); setFiltroStatus(''); setBusca(''); }}
              className="px-3 py-2 rounded-xl text-white/40 hover:text-white border border-white/10 text-sm transition-colors">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Resultados */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-white/30" /></div>
      ) : filtradas.length === 0 ? (
        <div className="text-center py-16 text-white/25">
          <AlertTriangle size={32} className="mx-auto mb-3 opacity-40" />
          <p>Nenhuma ocorrência encontrada</p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtradas.map(o => (
            <div key={o.id}
              className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors"
              style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <Chip className={getSetorColor(o.setor)}>{getSetorLabel(o.setor)}</Chip>
                  <Chip className={getGravColor(o.gravidade)}>{GRAVIDADES.find(g => g.value === o.gravidade)?.label}</Chip>
                  <Chip className={getStatusColor(o.status)}>{STATUS_OPTIONS.find(s => s.value === o.status)?.label}</Chip>
                  {o.gerado_por_ia && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25">IA</span>}
                </div>
                <p className="text-white text-sm font-medium truncate">{o.titulo}</p>
                {o.descricao && <p className="text-white/40 text-xs truncate mt-0.5">{o.descricao}</p>}
              </div>
              <div className="flex-shrink-0 text-right">
                <p className="text-white/30 text-xs">{dayjs(o.data_ocorrencia).format('DD/MM/YY')}</p>
                {o.diario_id && (
                  <button
                    onClick={() => verDiario(o.diario_id!)}
                    className="mt-1 flex items-center gap-1 text-xs text-white/30 hover:text-white/60 transition-colors">
                    <MessageSquare size={11} />
                    Ver diário
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal diário de origem */}
      {diarioSelecionado && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}>
          <div className="w-full max-w-lg rounded-2xl overflow-hidden" style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <div className="flex items-center gap-2">
                <BookOpen size={14} className="text-white/50" />
                <span className="text-white font-medium text-sm">
                  Diário — {dayjs(diarioSelecionado.data_diario).format('DD/MM/YYYY')} ({diarioSelecionado.turno})
                </span>
              </div>
              <button onClick={() => setDiarioSelecionado(null)} className="text-white/30 hover:text-white transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="px-5 py-4 max-h-96 overflow-y-auto">
              {diarioSelecionado.texto_ia ? (
                <p className="text-white/75 text-sm leading-relaxed whitespace-pre-wrap">{diarioSelecionado.texto_ia}</p>
              ) : (
                <p className="text-white/75 text-sm leading-relaxed whitespace-pre-wrap">{diarioSelecionado.texto_bruto}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── Página principal ─────────────────────────────────────────────────────────

const Ocorrencias: React.FC = () => {
  const [aba, setAba] = useState<'caderno' | 'historico'>('caderno');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2.5">
            <BookOpen size={22} style={{ color: 'var(--wine)' }} />
            Diário de Bordo
          </h1>
          <p className="text-white/40 text-sm mt-1">Registro do dia com organização por IA</p>
        </div>
      </div>

      {/* Abas */}
      <div className="flex gap-1 p-1 rounded-xl w-fit" style={{ background: 'var(--bg-card)', border: '1px solid rgba(255,255,255,0.06)' }}>
        {[
          { key: 'caderno',   label: 'Caderno do dia',         icon: BookOpen },
          { key: 'historico', label: 'Histórico e ocorrências', icon: Filter },
        ].map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setAba(key as typeof aba)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              aba === key ? 'text-white' : 'text-white/40 hover:text-white/70'
            }`}
            style={aba === key ? { background: 'rgba(125,31,44,0.35)' } : undefined}>
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {/* Conteúdo */}
      {aba === 'caderno' ? <CadernoDia /> : <HistoricoOcorrencias />}
    </div>
  );
};

export default Ocorrencias;
