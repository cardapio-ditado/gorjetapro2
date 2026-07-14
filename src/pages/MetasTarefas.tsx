import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Target, Plus, X, AlertTriangle, Wrench, ShoppingCart, BarChart2,
  Utensils, GlassWater, Users as Users2, ChevronDown, CheckCircle,
  Clock, XCircle, DollarSign, Paperclip, Shield, ThumbsUp, ThumbsDown,
  ChevronRight, Trash2, Upload, FileText, Image as ImageIcon, File, Eye,
  Check, Loader2, Calendar, User, Tag, Archive, RotateCcw,
  Bike, SquareUser as UserSquare2, Camera, CreditCard, PlusCircle,
  Building2, Wallet, AlertCircle, CheckSquare,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import AprovacoesSolicitacoes from '../components/solicitacoes/AprovacoesSolicitacoes';
import RelatoriosSolicitacoes from '../components/solicitacoes/RelatoriosSolicitacoes';
import SolicitacoesPublicas from '../components/solicitacoes/SolicitacoesPublicas';
import SolicitacaoForm from '../components/solicitacoes/SolicitacaoForm';
import { ChatSolicitacaoIA } from '../components/solicitacoes/ChatSolicitacaoIA';

// ─── Constantes ───────────────────────────────────────────────────────────────

const SETORES = [
  { id: 'gestao',    label: 'Gestão',            sub: 'Financeiro · Compras · Estoque',         icon: BarChart2,   cor: 'from-blue-900/40 to-blue-950/20 border-blue-500/20',       corIcon: 'text-blue-400',   corAccent: '#3b82f6' },
  { id: 'marketing', label: 'Marketing e Vendas', sub: 'Campanhas · Redes sociais · Comercial',  icon: Target,      cor: 'from-orange-900/30 to-orange-950/20 border-orange-500/20', corIcon: 'text-orange-400', corAccent: '#f97316' },
  { id: 'cozinha',   label: 'Cozinha',            sub: 'Produção · Ficha técnica · Desperdício', icon: Utensils,    cor: 'from-emerald-900/30 to-emerald-950/20 border-emerald-500/20', corIcon: 'text-emerald-400', corAccent: '#10b981' },
  { id: 'bar',       label: 'Bar',                sub: 'Bebidas · Drinks · Estoque bar',         icon: GlassWater,  cor: 'from-amber-900/30 to-amber-950/20 border-amber-500/20',   corIcon: 'text-amber-400',  corAccent: '#f59e0b' },
  { id: 'salao',     label: 'Salão',              sub: 'Atendimento · Serviço · Equipe',         icon: Users2,      cor: 'from-rose-900/30 to-rose-950/20 border-rose-500/20',       corIcon: 'text-rose-400',   corAccent: '#f43f5e' },
  { id: 'delivery',  label: 'Delivery',           sub: 'Pedidos · Entrega · Embalagem',          icon: Bike,        cor: 'from-sky-900/30 to-sky-950/20 border-sky-500/20',          corIcon: 'text-sky-400',    corAccent: '#0ea5e9' },
  { id: 'rh',        label: 'RH',                 sub: 'Pessoas · Escalas · Recrutamento',       icon: UserSquare2, cor: 'from-violet-900/30 to-violet-950/20 border-violet-500/20', corIcon: 'text-violet-400', corAccent: '#8b5cf6' },
];

const FASES = [
  { id: 'solicitado',   label: 'A Fazer',       cor: 'border-white/15 bg-white/[0.02]',         badgeCls: 'bg-white/10 text-white/50',            dot: 'bg-white/40' },
  { id: 'em_andamento', label: 'Em Andamento',  cor: 'border-blue-500/25 bg-blue-950/20',        badgeCls: 'bg-blue-500/15 text-blue-400',          dot: 'bg-blue-400' },
  { id: 'concluido',    label: 'Concluído',     cor: 'border-emerald-500/25 bg-emerald-950/20',  badgeCls: 'bg-emerald-500/15 text-emerald-400',    dot: 'bg-emerald-400' },
  { id: 'cancelado',    label: 'Cancelado',     cor: 'border-white/8 bg-white/[0.01] opacity-60', badgeCls: 'bg-white/8 text-white/30',             dot: 'bg-white/20' },
];

const PRIORIDADES = [
  { id: 'urgente', label: 'Urgente', cls: 'text-red-400',    dot: 'bg-red-400',    badge: 'bg-red-500/15 text-red-400' },
  { id: 'alta',    label: 'Alta',    cls: 'text-orange-400', dot: 'bg-orange-400', badge: 'bg-orange-500/15 text-orange-400' },
  { id: 'media',   label: 'Média',   cls: 'text-blue-400',   dot: 'bg-blue-400',   badge: 'bg-blue-500/10 text-blue-400' },
  { id: 'baixa',   label: 'Baixa',   cls: 'text-white/40',   dot: 'bg-white/30',   badge: 'bg-white/8 text-white/40' },
];

const APROVACAO_STATUS = {
  pendente:  { label: 'Ag. Aprovação', cls: 'bg-yellow-500/15 text-yellow-400', icon: <Clock className="w-3 h-3" /> },
  aprovado:  { label: 'Aprovado',      cls: 'bg-emerald-500/15 text-emerald-400', icon: <ThumbsUp className="w-3 h-3" /> },
  rejeitado: { label: 'Rejeitado',     cls: 'bg-red-500/15 text-red-400',       icon: <ThumbsDown className="w-3 h-3" /> },
};

const RESPONSAVEIS = ['Cristiano', 'Kadu', 'Beth', 'Evelyn', 'João Vitor', 'Henrian', 'Claudeano', 'Eunicea', 'Outro'];

const fmtR = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtData = (d: string) => new Date(d + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
const prioInfo = (p: string) => PRIORIDADES.find(x => x.id === p) ?? PRIORIDADES[2];
const faseInfo = (f: string) => FASES.find(x => x.id === f) ?? FASES[0];

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface ChecklistItem { id: string; texto: string; concluido: boolean; }

interface Tarefa {
  id: string;
  numero_tarefa: number;
  setor: string;
  titulo: string;
  descricao: string | null;
  responsavel: string | null;
  solicitante: string | null;
  prioridade: string;
  fase: string;
  data_limite: string | null;
  tem_custo: boolean;
  valor_estimado: number | null;
  valor_real: number | null;
  requer_aprovacao: boolean;
  status_aprovacao: 'pendente' | 'aprovado' | 'rejeitado' | null;
  aprovado_por: string | null;
  aprovado_em: string | null;
  obs_aprovacao: string | null;
  checklist: ChecklistItem[];
  arquivada: boolean;
  arquivada_em: string | null;
  arquivada_por: string | null;
  criado_em: string;
  atualizado_em: string;
  anexos?: Anexo[];
}

interface Anexo {
  id: string;
  tarefa_id: string;
  nome_arquivo: string;
  url_arquivo: string;
  storage_path: string | null;
  tipo_mime: string | null;
  tamanho_bytes: number | null;
  descricao: string | null;
  criado_em: string;
}

interface CreditoFornecedor {
  id: string;
  fornecedor_id: string | null;
  nome_fornecedor: string;
  descricao: string | null;
  credito_total: number;
  credito_usado: number;
  credito_saldo: number;
  status: 'ativo' | 'encerrado' | 'suspenso';
  data_inicio: string;
  data_validade: string | null;
  obs: string | null;
  criado_em: string;
}

interface CreditoConsumo {
  id: string;
  credito_id: string;
  data_consumo: string;
  descricao: string;
  valor: number;
  comprovante_url: string | null;
  obs: string | null;
  criado_em: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatBytes = (b: number | null) => {
  if (!b) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1048576) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1048576).toFixed(1)} MB`;
};

const fileIcon = (mime: string | null) => {
  if (!mime) return <File className="w-4 h-4 text-white/40" />;
  if (mime.startsWith('image/')) return <ImageIcon className="w-4 h-4 text-blue-400" />;
  if (mime === 'application/pdf') return <FileText className="w-4 h-4 text-red-400" />;
  return <FileText className="w-4 h-4 text-white/50" />;
};

const inputCls = 'w-full bg-white/5 border border-white/15 text-white placeholder-white/20 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-white/35 transition-colors';
const selectCls = 'w-full bg-[#12141f] border border-white/15 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-white/35 transition-colors';

// ═══════════════════════════════════════════════════════════════════════════════
// DRAWER DE TAREFA
// ═══════════════════════════════════════════════════════════════════════════════

interface TarefaDrawerProps {
  tarefa: Tarefa | null;
  mode: 'view' | 'edit' | 'create';
  setorInicial?: string;
  onClose: () => void;
  onSave: (t: Tarefa) => void;
  onDelete?: (id: string) => void;
  onArquivar?: (id: string) => void;
}

const TarefaDrawer: React.FC<TarefaDrawerProps> = ({ tarefa, mode, setorInicial = 'gestao', onClose, onSave, onDelete, onArquivar }) => {
  const isCreate = mode === 'create';
  const [salvando, setSalvando] = useState(false);
  const [uploadando, setUploadando] = useState(false);
  const [erro, setErro] = useState('');
  const [aba, setAba] = useState<'info' | 'custo' | 'aprovacao' | 'checklist' | 'anexos'>('info');
  const fileRef = useRef<HTMLInputElement>(null);
  const [aprovandoPor, setAprovandoPor] = useState('');
  const [obsAprov, setObsAprov] = useState('');

  const [setor, setSetor]             = useState(tarefa?.setor ?? setorInicial);
  const [titulo, setTitulo]           = useState(tarefa?.titulo ?? '');
  const [descricao, setDescricao]     = useState(tarefa?.descricao ?? '');
  const [responsavel, setResponsavel] = useState(tarefa?.responsavel ?? '');
  const [solicitante, setSolicitante] = useState(tarefa?.solicitante ?? '');
  const [prioridade, setPrioridade]   = useState(tarefa?.prioridade ?? 'media');
  const [fase, setFase]               = useState(tarefa?.fase ?? 'solicitado');
  const [dataLimite, setDataLimite]   = useState(tarefa?.data_limite ?? '');
  const [temCusto, setTemCusto]       = useState(tarefa?.tem_custo ?? false);
  const [valorEstimado, setValorEstimado] = useState(tarefa?.valor_estimado?.toString() ?? '');
  const [valorReal, setValorReal]     = useState(tarefa?.valor_real?.toString() ?? '');
  const [requerAprovacao, setRequerAprovacao] = useState(tarefa?.requer_aprovacao ?? false);
  const [statusAprovacao, setStatusAprovacao] = useState(tarefa?.status_aprovacao ?? null as 'pendente' | 'aprovado' | 'rejeitado' | null);
  const [checklist, setChecklist]     = useState<ChecklistItem[]>(tarefa?.checklist ?? []);
  const [novoItem, setNovoItem]       = useState('');
  const [anexos, setAnexos]           = useState<Anexo[]>(tarefa?.anexos ?? []);

  useEffect(() => {
    if (tarefa?.id) {
      supabase.from('tarefas_anexos').select('*').eq('tarefa_id', tarefa.id).order('criado_em')
        .then(({ data }) => { if (data) setAnexos(data as Anexo[]); });
    }
  }, [tarefa?.id]);

  useEffect(() => {
    if (requerAprovacao && !statusAprovacao) setStatusAprovacao('pendente');
    if (!requerAprovacao) setStatusAprovacao(null);
  }, [requerAprovacao]);

  const salvar = async () => {
    if (!titulo.trim()) { setErro('Título obrigatório.'); return; }
    setSalvando(true); setErro('');
    try {
      const payload = {
        setor, titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        responsavel: responsavel || null,
        solicitante: solicitante.trim() || null,
        prioridade, fase,
        data_limite: dataLimite || null,
        tem_custo: temCusto,
        valor_estimado: temCusto && valorEstimado ? parseFloat(valorEstimado) : null,
        valor_real: temCusto && valorReal ? parseFloat(valorReal) : null,
        requer_aprovacao: requerAprovacao,
        status_aprovacao: requerAprovacao ? statusAprovacao : null,
        aprovado_por: tarefa?.aprovado_por ?? null,
        aprovado_em: tarefa?.aprovado_em ?? null,
        obs_aprovacao: tarefa?.obs_aprovacao ?? null,
        checklist,
        atualizado_em: new Date().toISOString(),
      };
      let resultado: Tarefa;
      if (isCreate) {
        const { data, error } = await supabase.from('tarefas_setoriais').insert(payload).select('*').single();
        if (error || !data) { setErro('Erro ao salvar.'); return; }
        resultado = data as Tarefa;
      } else {
        const { data, error } = await supabase.from('tarefas_setoriais').update(payload).eq('id', tarefa!.id).select('*').single();
        if (error || !data) { setErro('Erro ao salvar.'); return; }
        resultado = data as Tarefa;
      }
      resultado.anexos = anexos;
      onSave(resultado);
    } finally { setSalvando(false); }
  };

  const aprovar = async (decisao: 'aprovado' | 'rejeitado') => {
    if (!tarefa?.id || !aprovandoPor) return;
    setSalvando(true);
    const payload = {
      status_aprovacao: decisao,
      aprovado_por: aprovandoPor,
      aprovado_em: new Date().toISOString(),
      obs_aprovacao: obsAprov || null,
      atualizado_em: new Date().toISOString(),
    };
    const { data } = await supabase.from('tarefas_setoriais').update(payload).eq('id', tarefa.id).select('*').single();
    if (data) { setStatusAprovacao(decisao); onSave({ ...tarefa, ...data, anexos } as Tarefa); }
    setSalvando(false);
  };

  const addChecklistItem = () => {
    if (!novoItem.trim()) return;
    setChecklist(c => [...c, { id: Date.now().toString(), texto: novoItem.trim(), concluido: false }]);
    setNovoItem('');
  };

  const uploadAnexo = async (file: File) => {
    if (!tarefa?.id && isCreate) return;
    setUploadando(true);
    try {
      const path = `${tarefa?.id ?? 'tmp'}/${Date.now()}_${file.name}`;
      const { error: upErr } = await supabase.storage.from('tarefas-anexos').upload(path, file);
      if (upErr) { alert('Erro no upload: ' + upErr.message); return; }
      const { data: urlData } = supabase.storage.from('tarefas-anexos').getPublicUrl(path);
      const { data: novoAnexo } = await supabase.from('tarefas_anexos').insert({
        tarefa_id: tarefa!.id, nome_arquivo: file.name,
        url_arquivo: urlData.publicUrl, storage_path: path,
        tipo_mime: file.type, tamanho_bytes: file.size,
      }).select('*').single();
      if (novoAnexo) setAnexos(a => [...a, novoAnexo as Anexo]);
    } finally { setUploadando(false); }
  };

  const removerAnexo = async (anexo: Anexo) => {
    if (!confirm('Remover este arquivo?')) return;
    if (anexo.storage_path) await supabase.storage.from('tarefas-anexos').remove([anexo.storage_path]);
    await supabase.from('tarefas_anexos').delete().eq('id', anexo.id);
    setAnexos(a => a.filter(x => x.id !== anexo.id));
  };

  const checkDone = checklist.filter(c => c.concluido).length;

  const ABAS_DRAWER = [
    { id: 'info' as const, label: 'Informações', count: 0 },
    { id: 'custo' as const, label: 'Custo', count: 0, badge: temCusto ? '💰' : undefined },
    { id: 'aprovacao' as const, label: 'Aprovação', badge: requerAprovacao ? (statusAprovacao ?? 'pendente') : undefined },
    { id: 'checklist' as const, label: 'Checklist', count: checklist.length },
    { id: 'anexos' as const, label: 'Anexos', count: anexos.length },
  ];

  const faseCurrent = faseInfo(fase);
  const prioCurrent = prioInfo(prioridade);

  return (
    <div className="fixed inset-0 z-50 flex" onClick={onClose}>
      <div className="flex-1 bg-black/60 backdrop-blur-sm" />
      <div className="w-full max-w-xl bg-[#0c0e1a] border-l border-white/10 flex flex-col h-full overflow-hidden shadow-2xl" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-start gap-3 px-5 py-4 border-b border-white/10 shrink-0">
          <div className="flex-1 min-w-0">
            {tarefa?.numero_tarefa && <span className="text-[10px] font-bold text-white/30 font-mono">#{tarefa.numero_tarefa}</span>}
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${faseCurrent.badgeCls}`}>
                <span className={`w-1.5 h-1.5 rounded-full ${faseCurrent.dot}`} />{faseCurrent.label}
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${prioCurrent.badge}`}>{prioCurrent.label}</span>
              {requerAprovacao && statusAprovacao && (
                <span className={`flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${APROVACAO_STATUS[statusAprovacao]?.cls}`}>
                  {APROVACAO_STATUS[statusAprovacao]?.icon}{APROVACAO_STATUS[statusAprovacao]?.label}
                </span>
              )}
            </div>
            <p className="text-base font-bold text-white mt-1.5 leading-snug">{titulo || 'Nova Tarefa'}</p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Arquivar */}
            {!isCreate && tarefa && !tarefa.arquivada && (fase === 'concluido' || fase === 'cancelado') && onArquivar && (
              <button onClick={() => onArquivar(tarefa.id)}
                className="p-2 rounded-xl text-white/25 hover:text-yellow-400 hover:bg-yellow-500/10 transition-all" title="Arquivar">
                <Archive className="w-4 h-4" />
              </button>
            )}
            {!isCreate && onDelete && (
              <button onClick={() => { if (confirm('Excluir tarefa?')) onDelete(tarefa!.id); }}
                className="p-2 rounded-xl text-white/25 hover:text-red-400 hover:bg-red-500/10 transition-all">
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-xl text-white/30 hover:text-white/70 hover:bg-white/8 transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-0.5 px-4 pt-3 shrink-0 overflow-x-auto">
          {ABAS_DRAWER.map(a => (
            <button key={a.id} onClick={() => setAba(a.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                aba === a.id ? 'bg-[#7D1F2C] text-white' : 'text-white/35 hover:text-white/60 hover:bg-white/5'
              }`}>
              {a.label}
              {(a as any).count > 0 && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${aba === a.id ? 'bg-white/20 text-white' : 'bg-white/10 text-white/40'}`}>
                  {(a as any).count}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">

          {aba === 'info' && (
            <>
              <div>
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wide mb-2">Setor</label>
                <div className="flex flex-wrap gap-1.5">
                  {SETORES.map(s => (
                    <button key={s.id} type="button" onClick={() => setSetor(s.id)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all ${setor === s.id ? 'bg-[#7D1F2C] text-white ring-1 ring-[#9B2535]/50' : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60'}`}>
                      {s.label}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wide mb-1.5">Título *</label>
                <input type="text" value={titulo} onChange={e => setTitulo(e.target.value)} autoFocus
                  placeholder="Descreva a tarefa ou meta..." className={inputCls} />
              </div>
              <div>
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wide mb-1.5">Descrição</label>
                <textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3}
                  placeholder="Contexto, detalhes, observações importantes..."
                  className={inputCls + ' resize-none'} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wide mb-1.5">Prioridade</label>
                  <div className="flex flex-col gap-1">
                    {PRIORIDADES.map(p => (
                      <button key={p.id} type="button" onClick={() => setPrioridade(p.id)}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-bold transition-all ${prioridade === p.id ? `${p.badge} ring-1 ring-current/30` : 'bg-white/5 text-white/35 hover:bg-white/10'}`}>
                        <span className={`w-2 h-2 rounded-full ${p.dot}`} />{p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wide mb-1.5">Fase</label>
                  <div className="flex flex-col gap-1">
                    {FASES.map(f => (
                      <button key={f.id} type="button" onClick={() => setFase(f.id)}
                        className={`flex items-center gap-2 px-2.5 py-2 rounded-lg text-xs font-bold transition-all ${fase === f.id ? `${f.badgeCls} ring-1 ring-current/30` : 'bg-white/5 text-white/35 hover:bg-white/10'}`}>
                        <span className={`w-2 h-2 rounded-full ${f.dot}`} />{f.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wide mb-1.5"><User className="w-3 h-3 inline mr-1" />Responsável</label>
                  <select value={responsavel} onChange={e => setResponsavel(e.target.value)} className={selectCls}>
                    <option value="">— ninguém —</option>
                    {RESPONSAVEIS.map(r => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wide mb-1.5"><Tag className="w-3 h-3 inline mr-1" />Solicitante</label>
                  <input type="text" value={solicitante} onChange={e => setSolicitante(e.target.value)} placeholder="Quem solicitou..." className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wide mb-1.5"><Calendar className="w-3 h-3 inline mr-1" />Data Limite</label>
                <input type="date" value={dataLimite} onChange={e => setDataLimite(e.target.value)} className={inputCls} />
              </div>
              {erro && <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2">{erro}</p>}
            </>
          )}

          {aba === 'custo' && (
            <>
              <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl">
                <div>
                  <p className="text-sm font-bold text-white">Esta tarefa tem custo?</p>
                  <p className="text-xs text-white/40 mt-0.5">Ative para registrar valores e orçamentos</p>
                </div>
                <button onClick={() => setTemCusto(v => !v)}
                  className={`relative w-12 h-6 rounded-full transition-all duration-300 ${temCusto ? 'bg-emerald-500' : 'bg-white/15'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300 ${temCusto ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>
              {temCusto && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wide mb-1.5">Valor Estimado</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm font-bold">R$</span>
                        <input type="number" min="0" step="0.01" value={valorEstimado} onChange={e => setValorEstimado(e.target.value)}
                          placeholder="0,00" className={inputCls + ' pl-9'} />
                      </div>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wide mb-1.5">Custo Real</label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm font-bold">R$</span>
                        <input type="number" min="0" step="0.01" value={valorReal} onChange={e => setValorReal(e.target.value)}
                          placeholder="0,00" className={inputCls + ' pl-9'} />
                      </div>
                    </div>
                  </div>
                  {valorEstimado && valorReal && parseFloat(valorReal) > 0 && (
                    <div className={`p-3 rounded-xl border text-sm font-bold ${parseFloat(valorReal) > parseFloat(valorEstimado) ? 'bg-red-500/10 border-red-500/20 text-red-400' : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'}`}>
                      {parseFloat(valorReal) > parseFloat(valorEstimado)
                        ? `Acima do orçamento em ${fmtR(parseFloat(valorReal) - parseFloat(valorEstimado))}`
                        : `Dentro do orçamento — economia de ${fmtR(parseFloat(valorEstimado) - parseFloat(valorReal))}`}
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {aba === 'aprovacao' && (
            <>
              <div className="flex items-center justify-between p-4 bg-white/5 border border-white/10 rounded-2xl">
                <div>
                  <p className="text-sm font-bold text-white">Requer aprovação?</p>
                  <p className="text-xs text-white/40 mt-0.5">Bloqueia execução até ser aprovada</p>
                </div>
                <button onClick={() => setRequerAprovacao(v => !v)}
                  className={`relative w-12 h-6 rounded-full transition-all duration-300 ${requerAprovacao ? 'bg-[#7D1F2C]' : 'bg-white/15'}`}>
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-300 ${requerAprovacao ? 'translate-x-6' : 'translate-x-0'}`} />
                </button>
              </div>
              {requerAprovacao && (
                <>
                  <div>
                    <label className="block text-[10px] font-bold text-white/40 uppercase tracking-wide mb-2">Status de Aprovação</label>
                    <div className="flex gap-2">
                      {(['pendente', 'aprovado', 'rejeitado'] as const).map(s => (
                        <button key={s} type="button" onClick={() => setStatusAprovacao(s)}
                          className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold transition-all ${statusAprovacao === s ? `${APROVACAO_STATUS[s].cls} ring-1 ring-current/30` : 'bg-white/5 text-white/35 hover:bg-white/10'}`}>
                          {APROVACAO_STATUS[s].icon}{APROVACAO_STATUS[s].label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {!isCreate && tarefa?.status_aprovacao === 'pendente' && (
                    <div className="border border-yellow-500/20 bg-yellow-500/5 rounded-2xl p-4 space-y-3">
                      <p className="text-xs font-bold text-yellow-400 uppercase tracking-wide">Registrar Decisão</p>
                      <select value={aprovandoPor} onChange={e => setAprovandoPor(e.target.value)} className={selectCls}>
                        <option value="">— selecione —</option>
                        {RESPONSAVEIS.map(r => <option key={r} value={r}>{r}</option>)}
                      </select>
                      <textarea value={obsAprov} onChange={e => setObsAprov(e.target.value)} rows={2}
                        placeholder="Justificativa, condições..."
                        className={inputCls + ' resize-none'} />
                      <div className="flex gap-2">
                        <button onClick={() => aprovar('aprovado')} disabled={!aprovandoPor || salvando}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 transition-all disabled:opacity-40">
                          <ThumbsUp className="w-4 h-4" /> Aprovar
                        </button>
                        <button onClick={() => aprovar('rejeitado')} disabled={!aprovandoPor || salvando}
                          className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold bg-red-600/15 text-red-400 border border-red-500/25 hover:bg-red-600/25 transition-all disabled:opacity-40">
                          <ThumbsDown className="w-4 h-4" /> Rejeitar
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {aba === 'checklist' && (
            <>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: checklist.length ? `${(checkDone / checklist.length) * 100}%` : '0%' }} />
                </div>
                <span className="text-xs font-bold text-white/50 shrink-0">{checkDone}/{checklist.length}</span>
              </div>
              <div className="space-y-1.5">
                {checklist.map(item => (
                  <div key={item.id} className="flex items-center gap-2.5 p-2.5 bg-white/4 border border-white/8 rounded-xl group hover:border-white/12 transition-all">
                    <button onClick={() => setChecklist(c => c.map(x => x.id === item.id ? { ...x, concluido: !x.concluido } : x))}
                      className={`shrink-0 w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all ${item.concluido ? 'bg-emerald-500 border-emerald-500' : 'border-white/25 hover:border-white/50'}`}>
                      {item.concluido && <Check className="w-3 h-3 text-white" />}
                    </button>
                    <span className={`flex-1 text-sm transition-all ${item.concluido ? 'line-through text-white/30' : 'text-white'}`}>{item.texto}</span>
                    <button onClick={() => setChecklist(c => c.filter(x => x.id !== item.id))}
                      className="opacity-0 group-hover:opacity-100 p-1 text-white/25 hover:text-red-400 transition-all">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2">
                <input type="text" value={novoItem} onChange={e => setNovoItem(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && addChecklistItem()}
                  placeholder="Novo item de checklist..." className={inputCls} />
                <button onClick={addChecklistItem}
                  className="px-3 py-2.5 rounded-xl bg-white/8 text-white/60 hover:bg-white/15 hover:text-white transition-all">
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </>
          )}

          {aba === 'anexos' && (
            <>
              {isCreate && (
                <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl">
                  <p className="text-xs text-yellow-400">Salve a tarefa primeiro para poder anexar arquivos.</p>
                </div>
              )}
              {!isCreate && (
                <>
                  <div onClick={() => fileRef.current?.click()}
                    className="border-2 border-dashed border-white/15 rounded-2xl p-6 text-center cursor-pointer hover:border-white/30 hover:bg-white/3 transition-all group">
                    <input ref={fileRef} type="file" className="hidden" accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt"
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadAnexo(f); e.target.value = ''; }} />
                    {uploadando ? <Loader2 className="w-8 h-8 text-white/30 animate-spin mx-auto mb-2" />
                      : <Upload className="w-8 h-8 text-white/25 group-hover:text-white/50 mx-auto mb-2 transition-all" />}
                    <p className="text-sm text-white/40 font-medium">{uploadando ? 'Enviando...' : 'Clique para anexar arquivo'}</p>
                    <p className="text-xs text-white/20 mt-1">PDF, Word, Excel, imagens — máx. 20 MB</p>
                  </div>
                  {anexos.length > 0 && (
                    <div className="space-y-2">
                      {anexos.map(a => (
                        <div key={a.id} className="flex items-center gap-3 p-3 bg-white/4 border border-white/8 rounded-xl hover:border-white/15 transition-all group">
                          <div className="shrink-0">{fileIcon(a.tipo_mime)}</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate">{a.nome_arquivo}</p>
                            <p className="text-[10px] text-white/30 mt-0.5">{formatBytes(a.tamanho_bytes)} · {new Date(a.criado_em).toLocaleDateString('pt-BR')}</p>
                          </div>
                          <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                            <a href={a.url_arquivo} target="_blank" rel="noopener noreferrer"
                              className="p-1.5 rounded-lg bg-white/8 text-white/50 hover:bg-white/15 hover:text-white transition-all">
                              <Eye className="w-3.5 h-3.5" />
                            </a>
                            <button onClick={() => removerAnexo(a)}
                              className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-white/10 flex gap-3 shrink-0">
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-bold border border-white/15 text-white/50 hover:bg-white/5 hover:text-white/70 transition-all">
            Fechar
          </button>
          <button onClick={salvar} disabled={salvando || !titulo.trim()}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-[#7D1F2C] text-white hover:bg-[#9B2535] transition-all disabled:opacity-40 flex items-center justify-center gap-2">
            {salvando ? <><Loader2 className="w-4 h-4 animate-spin" /> Salvando...</> : (isCreate ? 'Criar Tarefa' : 'Salvar Alterações')}
          </button>
        </div>
      </div>
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// KANBAN CARDS
// ═══════════════════════════════════════════════════════════════════════════════

interface KanbanCardProps {
  tarefa: Tarefa;
  onOpen: (t: Tarefa) => void;
  onMove: (id: string, fase: string) => void;
  onDelete: (id: string) => void;
  onArquivar: (id: string) => void;
  faseAtual: string;
}

const KanbanCard: React.FC<KanbanCardProps> = ({ tarefa, onOpen, onMove, onDelete, onArquivar, faseAtual }) => {
  const prio = prioInfo(tarefa.prioridade);
  const vencida = tarefa.data_limite && new Date(tarefa.data_limite + 'T23:59') < new Date();
  const aprovSt = tarefa.requer_aprovacao && tarefa.status_aprovacao ? APROVACAO_STATUS[tarefa.status_aprovacao] : null;
  const checkTotal = tarefa.checklist?.length ?? 0;
  const checkDone  = tarefa.checklist?.filter(c => c.concluido).length ?? 0;

  return (
    <div className="bg-[#0d0f1a]/80 border border-white/10 rounded-xl p-3 group hover:border-white/25 transition-all cursor-pointer"
      onClick={() => onOpen(tarefa)}>
      <div className="flex items-center gap-1.5 mb-2">
        <span className={`w-2 h-2 rounded-full shrink-0 ${prio.dot}`} />
        <span className={`text-[9px] font-bold ${prio.cls}`}>{prio.label}</span>
        <div className="flex-1" />
        {aprovSt && (
          <span className={`flex items-center gap-0.5 text-[9px] font-bold px-1.5 py-0.5 rounded-md ${aprovSt.cls}`}>
            {aprovSt.icon}{aprovSt.label}
          </span>
        )}
      </div>
      <p className="text-[11px] font-semibold text-white leading-snug mb-2">{tarefa.titulo}</p>
      {tarefa.descricao && (
        <p className="text-[9px] text-white/35 mb-2 line-clamp-2 leading-relaxed">{tarefa.descricao}</p>
      )}
      <div className="flex flex-wrap items-center gap-1.5">
        {tarefa.responsavel && <span className="text-[9px] text-white/40 bg-white/8 px-1.5 py-0.5 rounded-md">{tarefa.responsavel}</span>}
        {tarefa.data_limite && (
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${vencida ? 'bg-red-500/20 text-red-400' : 'bg-white/6 text-white/30'}`}>
            {fmtData(tarefa.data_limite)}
          </span>
        )}
        {tarefa.tem_custo && tarefa.valor_estimado && (
          <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">{fmtR(tarefa.valor_estimado)}</span>
        )}
        {checkTotal > 0 && (
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${checkDone === checkTotal ? 'bg-emerald-500/15 text-emerald-400' : 'bg-white/6 text-white/30'}`}>
            {checkDone}/{checkTotal}
          </span>
        )}
        {(tarefa.anexos?.length ?? 0) > 0 && (
          <span className="text-[9px] text-white/30 bg-white/5 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
            <Paperclip className="w-2.5 h-2.5" />{tarefa.anexos!.length}
          </span>
        )}
      </div>
      <div className="mt-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all flex-wrap" onClick={e => e.stopPropagation()}>
        {FASES.filter(f => f.id !== faseAtual).map(f => (
          <button key={f.id} onClick={() => onMove(tarefa.id, f.id)}
            className="text-[8px] px-2 py-0.5 rounded-md bg-white/8 text-white/35 hover:bg-white/15 hover:text-white/70 transition-all">
            → {f.label}
          </button>
        ))}
        {(faseAtual === 'concluido' || faseAtual === 'cancelado') && (
          <button onClick={() => onArquivar(tarefa.id)}
            className="text-[8px] px-2 py-0.5 rounded-md bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 transition-all flex items-center gap-0.5">
            <Archive className="w-2.5 h-2.5" /> Arquivar
          </button>
        )}
        <button onClick={() => { if (confirm('Excluir tarefa?')) onDelete(tarefa.id); }}
          className="text-[8px] px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all ml-auto">
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
};

// ─── KanbanSetor ──────────────────────────────────────────────────────────────

interface KanbanSetorProps {
  setor: typeof SETORES[number];
  tarefas: Tarefa[];
  onAdd: (setor: string) => void;
  onOpen: (t: Tarefa) => void;
  onMove: (id: string, fase: string) => void;
  onDelete: (id: string) => void;
  onArquivar: (id: string) => void;
}

const KanbanSetor: React.FC<KanbanSetorProps> = ({ setor, tarefas, onAdd, onOpen, onMove, onDelete, onArquivar }) => {
  const [aberto, setAberto] = useState(true);
  const Icon = setor.icon;
  const pendentes = tarefas.filter(t => t.fase !== 'concluido' && t.fase !== 'cancelado').length;
  const urgentes = tarefas.filter(t => t.prioridade === 'urgente' && t.fase !== 'concluido' && t.fase !== 'cancelado').length;
  const aguardAprov = tarefas.filter(t => t.requer_aprovacao && t.status_aprovacao === 'pendente').length;

  return (
    <div className={`rounded-2xl border bg-gradient-to-br ${setor.cor} overflow-hidden`}>
      <button onClick={() => setAberto(v => !v)}
        className="w-full flex items-center gap-3 px-4 py-3.5 hover:bg-white/5 transition-colors">
        <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: `${setor.corAccent}22`, border: `1px solid ${setor.corAccent}44` }}>
          <Icon className={`w-4 h-4 ${setor.corIcon}`} />
        </div>
        <div className="flex-1 text-left">
          <p className="text-sm font-bold text-white">{setor.label}</p>
          <p className="text-[10px] text-white/40">{setor.sub}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {urgentes > 0 && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-red-500/15 text-red-400">{urgentes}u</span>}
          {aguardAprov > 0 && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/15 text-yellow-400 flex items-center gap-1">
              <Shield className="w-2.5 h-2.5" />{aguardAprov}
            </span>
          )}
          {pendentes > 0 && <span className="text-[9px] font-bold px-2 py-0.5 rounded-full text-white/50 bg-white/10">{pendentes} pend.</span>}
          <button onClick={e => { e.stopPropagation(); onAdd(setor.id); }}
            className="p-1.5 rounded-lg hover:bg-white/15 transition-all" style={{ color: setor.corAccent }}>
            <Plus className="w-3.5 h-3.5" />
          </button>
          <ChevronDown className={`w-4 h-4 text-white/25 transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`} />
        </div>
      </button>

      {aberto && (
        <div className="px-4 pb-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2.5">
            {FASES.map(fase => {
              const itens = tarefas.filter(t => t.fase === fase.id);
              return (
                <div key={fase.id} className={`rounded-xl border p-2.5 flex flex-col gap-2 min-h-[100px] ${fase.cor}`}>
                  <div className="flex items-center justify-between mb-0.5">
                    <p className="text-[10px] font-black text-white/55 uppercase tracking-wide">{fase.label}</p>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${fase.badgeCls}`}>{itens.length}</span>
                  </div>
                  {itens.length === 0 && (
                    <div className="flex-1 flex items-center justify-center"><p className="text-[9px] text-white/12">vazio</p></div>
                  )}
                  {itens.map(t => (
                    <KanbanCard key={t.id} tarefa={t} onOpen={onOpen} onMove={onMove} onDelete={onDelete} onArquivar={onArquivar} faseAtual={fase.id} />
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// SOLICITAÇÕES — mesmo visual que Tarefas
// ═══════════════════════════════════════════════════════════════════════════════

interface SolicitacaoSol {
  id: string;
  numero_solicitacao: string;
  titulo: string;
  descricao: string;
  status: string;
  prioridade: string;
  setor_solicitante: string;
  solicitante_nome: string;
  criado_em: string;
  data_solicitacao: string;
  data_limite: string | null;
  valor_estimado: number | null;
  origem: 'sistema' | 'publica';
  enriquecida: boolean;
  arquivada?: boolean;
  tipos_solicitacao?: { id: string; nome: string; tipo_categoria: string } | null;
}

const COLUNAS_SOL = [
  { id: 'nova',      label: 'A Fazer',          statuses: ['rascunho','enviado'],                              cor: 'border-white/15 bg-white/[0.02]',        badgeCls: 'bg-white/10 text-white/50',          dot: 'bg-white/40',    nextStatus: 'em_analise',  nextLabel: 'Iniciar análise' },
  { id: 'analise',   label: 'Em Análise',        statuses: ['em_analise','aguardando_orcamento'],               cor: 'border-yellow-500/20 bg-yellow-950/10',   badgeCls: 'bg-yellow-500/15 text-yellow-400',   dot: 'bg-yellow-400',  nextStatus: 'aprovado',    nextLabel: 'Aprovar' },
  { id: 'execucao',  label: 'Em Execução',       statuses: ['aprovado','em_execucao','orcamento_aprovado'],     cor: 'border-blue-500/20 bg-blue-950/10',       badgeCls: 'bg-blue-500/15 text-blue-400',       dot: 'bg-blue-400',    nextStatus: 'concluido',   nextLabel: 'Concluir' },
  { id: 'concluido', label: 'Concluído',         statuses: ['concluido'],                                       cor: 'border-emerald-500/20 bg-emerald-950/10', badgeCls: 'bg-emerald-500/15 text-emerald-400', dot: 'bg-emerald-400', nextStatus: null,          nextLabel: null },
  { id: 'fechado',   label: 'Rejeitado/Cancelado', statuses: ['rejeitado','cancelado'],                         cor: 'border-white/8 bg-white/[0.01] opacity-60', badgeCls: 'bg-white/8 text-white/30',          dot: 'bg-white/20',    nextStatus: null,          nextLabel: null },
] as const;

const STATUS_LABEL: Record<string, { label: string; cls: string }> = {
  rascunho: { label: 'Rascunho', cls: 'bg-white/10 text-white/50' },
  enviado: { label: 'Enviado', cls: 'bg-sky-500/20 text-sky-400' },
  em_analise: { label: 'Em Análise', cls: 'bg-yellow-500/20 text-yellow-400' },
  aguardando_orcamento: { label: 'Ag. Orçamento', cls: 'bg-orange-500/20 text-orange-400' },
  aprovado: { label: 'Aprovado', cls: 'bg-emerald-500/20 text-emerald-400' },
  orcamento_aprovado: { label: 'Orç. Aprovado', cls: 'bg-teal-500/20 text-teal-400' },
  em_execucao: { label: 'Em Execução', cls: 'bg-blue-500/20 text-blue-400' },
  concluido: { label: 'Concluído', cls: 'bg-emerald-500/20 text-emerald-400' },
  rejeitado: { label: 'Rejeitado', cls: 'bg-red-500/20 text-red-400' },
  cancelado: { label: 'Cancelado', cls: 'bg-white/10 text-white/40' },
};

const PRIO_SOL: Record<string, { label: string; dot: string; cls: string }> = {
  critica: { label: 'Crítica', dot: 'bg-red-500',    cls: 'text-red-400' },
  urgente: { label: 'Urgente', dot: 'bg-red-400',    cls: 'text-red-400' },
  alta:    { label: 'Alta',    dot: 'bg-orange-400', cls: 'text-orange-400' },
  normal:  { label: 'Normal',  dot: 'bg-blue-400',   cls: 'text-blue-400' },
  media:   { label: 'Média',   dot: 'bg-blue-400',   cls: 'text-blue-400' },
  baixa:   { label: 'Baixa',   dot: 'bg-white/30',   cls: 'text-white/40' },
};

// Card de solicitação — visual igual ao KanbanCard de tarefas
interface SolCardProps {
  sol: SolicitacaoSol;
  onOpen: (s: SolicitacaoSol) => void;
  onMover: (id: string, status: string) => void;
  onDelete: (id: string) => void;
  onArquivar: (id: string) => void;
  colunaAtual: typeof COLUNAS_SOL[number];
}

const SolCard: React.FC<SolCardProps> = ({ sol, onOpen, onMover, onDelete, onArquivar, colunaAtual }) => {
  const pr = PRIO_SOL[sol.prioridade] ?? PRIO_SOL.normal;
  const st = STATUS_LABEL[sol.status] ?? STATUS_LABEL.enviado;
  const vencida = sol.data_limite && new Date(sol.data_limite + 'T23:59') < new Date();
  const isPublica = sol.origem === 'publica';
  const naoEnriquecida = isPublica && !sol.enriquecida;

  return (
    <div onClick={() => onOpen(sol)}
      className="bg-[#0d0f1a]/90 border border-white/10 rounded-xl p-3 group hover:border-white/25 transition-all cursor-pointer">
      <div className="flex items-center gap-1.5 mb-2">
        {isPublica ? (
          <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${naoEnriquecida ? 'bg-orange-500/20 text-orange-400' : 'bg-violet-500/15 text-violet-400'}`}>
            {naoEnriquecida ? 'Via Link ⚠️' : 'Via Link'}
          </span>
        ) : (
          <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md bg-sky-500/10 text-sky-400">Manual</span>
        )}
        <div className="flex-1" />
        <span className={`flex items-center gap-1 text-[9px] font-bold ${pr.cls}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${pr.dot}`} />{pr.label}
        </span>
      </div>
      <p className="text-[9px] text-white/25 font-mono mb-0.5">#{sol.numero_solicitacao}</p>
      <p className="text-[11px] font-semibold text-white leading-snug mb-2">{sol.titulo}</p>
      {sol.setor_solicitante && <p className="text-[9px] text-white/35 mb-2 truncate">{sol.setor_solicitante}</p>}
      <div className="flex flex-wrap items-center gap-1">
        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${st.cls}`}>{st.label}</span>
        {sol.solicitante_nome && <span className="text-[9px] text-white/35 bg-white/6 px-1.5 py-0.5 rounded-md truncate max-w-[80px]">{sol.solicitante_nome}</span>}
        {sol.data_limite && (
          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${vencida ? 'bg-red-500/20 text-red-400' : 'bg-white/6 text-white/30'}`}>{fmtData(sol.data_limite)}</span>
        )}
        {sol.valor_estimado && sol.valor_estimado > 0 && (
          <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md">{fmtR(sol.valor_estimado)}</span>
        )}
      </div>
      <div className="mt-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-all flex-wrap" onClick={e => e.stopPropagation()}>
        {colunaAtual.nextStatus && (
          <button onClick={() => onMover(sol.id, colunaAtual.nextStatus!)}
            className="text-[8px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-all font-bold">
            {colunaAtual.nextLabel}
          </button>
        )}
        {COLUNAS_SOL.filter(c => c.id !== colunaAtual.id && c.id !== 'fechado').map(c => (
          <button key={c.id} onClick={() => onMover(sol.id, c.statuses[0])}
            className="text-[8px] px-2 py-0.5 rounded-md bg-white/8 text-white/35 hover:bg-white/15 hover:text-white/70 transition-all">
            → {c.label}
          </button>
        ))}
        {(colunaAtual.id === 'concluido' || colunaAtual.id === 'fechado') && (
          <button onClick={() => onArquivar(sol.id)}
            className="text-[8px] px-2 py-0.5 rounded-md bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 transition-all flex items-center gap-0.5">
            <Archive className="w-2.5 h-2.5" /> Arquivar
          </button>
        )}
        <button onClick={() => onMover(sol.id, 'cancelado')}
          className="text-[8px] px-2 py-0.5 rounded-md bg-white/5 text-white/25 hover:bg-white/10 transition-all">
          Cancelar
        </button>
        <button onClick={() => { if (confirm('Excluir?')) onDelete(sol.id); }}
          className="text-[8px] px-1.5 py-0.5 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all ml-auto">
          <Trash2 className="w-2.5 h-2.5" />
        </button>
      </div>
    </div>
  );
};

// ─── SolicitacoesTab ──────────────────────────────────────────────────────────

type AbaSol = 'kanban' | 'aprovacoes' | 'publicas' | 'relatorios';

const SolicitacoesTab: React.FC = () => {
  const [abaSol, setAbaSol] = useState<AbaSol>('kanban');
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoSol[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editando, setEditando] = useState<SolicitacaoSol | null>(null);
  const [tiposSol, setTiposSol] = useState<{ id: string; nome: string; tipo_categoria: string }[]>([]);
  const [busca, setBusca] = useState('');
  const [filtroOrigem, setFiltroOrigem] = useState<'todos' | 'sistema' | 'publica'>('todos');
  const [novoViaLink, setNovoViaLink] = useState(false);
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('solicitacoes').select('*, tipos_solicitacao(id, nome, tipo_categoria)').order('criado_em', { ascending: false });
    if (!mostrarArquivadas) q = q.or('arquivada.is.null,arquivada.eq.false');
    const { data } = await q;
    setSolicitacoes((data ?? []) as SolicitacaoSol[]);
    setLoading(false);
  }, [mostrarArquivadas]);

  useEffect(() => {
    fetchData();
    supabase.from('tipos_solicitacao').select('id, nome, tipo_categoria').eq('status', true).order('nome')
      .then(({ data }) => { if (data) setTiposSol(data); });

    const channel = supabase.channel('sol-kanban')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'solicitacoes' }, payload => {
        const nova = payload.new as SolicitacaoSol;
        setSolicitacoes(prev => [nova, ...prev]);
        if (nova.origem === 'publica') setNovoViaLink(true);
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'solicitacoes' }, payload => {
        setSolicitacoes(prev => prev.map(s => s.id === payload.new.id ? { ...s, ...payload.new } : s));
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'solicitacoes' }, payload => {
        setSolicitacoes(prev => prev.filter(s => s.id !== payload.old.id));
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  const moverStatus = async (id: string, status: string) => {
    const extra: Record<string, unknown> = { status };
    if (status === 'concluido') extra.data_resolucao = new Date().toISOString();
    await supabase.from('solicitacoes').update(extra).eq('id', id);
    setSolicitacoes(ss => ss.map(s => s.id === id ? { ...s, status } : s));
  };

  const arquivarSol = async (id: string) => {
    await supabase.from('solicitacoes').update({ arquivada: true, arquivada_em: new Date().toISOString() }).eq('id', id);
    setSolicitacoes(ss => ss.filter(s => s.id !== id));
  };

  const handleDelete = async (id: string) => {
    await supabase.from('solicitacoes').delete().eq('id', id);
    setSolicitacoes(ss => ss.filter(s => s.id !== id));
  };

  const filtered = solicitacoes.filter(s => {
    if (filtroOrigem !== 'todos' && s.origem !== filtroOrigem) return false;
    if (!busca) return true;
    return (
      s.titulo.toLowerCase().includes(busca.toLowerCase()) ||
      (s.solicitante_nome ?? '').toLowerCase().includes(busca.toLowerCase()) ||
      (s.numero_solicitacao ?? '').includes(busca)
    );
  });

  const totalPendentes = solicitacoes.filter(s => !['concluido','cancelado','rejeitado'].includes(s.status)).length;
  const totalViaLink   = solicitacoes.filter(s => s.origem === 'publica').length;
  const semTriagem     = solicitacoes.filter(s => s.origem === 'publica' && !s.enriquecida).length;
  const urgentes       = solicitacoes.filter(s => ['critica','urgente'].includes(s.prioridade) && !['concluido','cancelado','rejeitado'].includes(s.status)).length;

  const TABS_SOL = [
    { id: 'kanban' as AbaSol,     label: 'Kanban' },
    { id: 'aprovacoes' as AbaSol, label: 'Aprovações' },
    { id: 'publicas' as AbaSol,   label: 'Via Link' },
    { id: 'relatorios' as AbaSol, label: 'Relatórios' },
  ];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {[
          { label: 'Pendentes',      val: totalPendentes, cls: 'text-yellow-400', bg: 'bg-yellow-500/8 border-yellow-500/15' },
          { label: 'Urgentes',       val: urgentes,       cls: 'text-red-400',    bg: 'bg-red-500/8 border-red-500/15' },
          { label: 'Via Link Total', val: totalViaLink,   cls: 'text-violet-400', bg: 'bg-violet-500/8 border-violet-500/15' },
          { label: 'Sem Triagem',    val: semTriagem,     cls: 'text-orange-400', bg: `bg-orange-500/8 border-orange-500/15 ${semTriagem > 0 ? 'ring-1 ring-orange-500/30' : ''}` },
        ].map(k => (
          <div key={k.label} className={`border rounded-xl p-3 text-center ${k.bg}`}>
            <p className="text-[10px] text-white/35 uppercase font-bold tracking-wide">{k.label}</p>
            <p className={`text-xl font-black mt-0.5 ${k.cls}`}>{k.val}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-1 bg-[#12141f] border border-white/10 rounded-xl p-1 flex-wrap">
        {TABS_SOL.map(t => (
          <button key={t.id} onClick={() => setAbaSol(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${abaSol === t.id ? 'bg-[#7D1F2C] text-white shadow' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}>
            {t.label}
            {t.id === 'publicas' && semTriagem > 0 && (
              <span className="ml-0.5 text-[9px] font-black bg-orange-500 text-white px-1.5 py-0.5 rounded-full">{semTriagem}</span>
            )}
          </button>
        ))}
        <button onClick={() => { setEditando(null); setShowForm(true); }}
          className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold bg-[#7D1F2C] text-white hover:bg-[#9B2535] transition-all">
          <Plus className="w-3.5 h-3.5" /> Nova
        </button>
      </div>

      {abaSol === 'aprovacoes' && <AprovacoesSolicitacoes />}
      {abaSol === 'publicas'   && <SolicitacoesPublicas />}
      {abaSol === 'relatorios' && <RelatoriosSolicitacoes />}

      {abaSol === 'kanban' && (
        <>
          {novoViaLink && (
            <div className="flex items-center gap-3 bg-orange-500/10 border border-orange-500/30 rounded-xl px-4 py-3">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-400" />
              </span>
              <p className="text-sm font-semibold text-orange-300 flex-1">Novo chamado recebido via link</p>
              <button onClick={() => setNovoViaLink(false)} className="text-orange-400/60 hover:text-orange-300">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <div className="flex gap-2 flex-wrap">
            <input type="text" value={busca} onChange={e => setBusca(e.target.value)}
              placeholder="Buscar por título, solicitante ou número..."
              className="flex-1 min-w-[200px] bg-[#12141f] border border-white/10 text-white placeholder-white/25 rounded-xl px-4 py-2 text-sm focus:outline-none focus:border-white/25" />
            <div className="flex gap-1 bg-[#12141f] border border-white/10 rounded-xl p-1">
              {[{ id: 'todos' as const, label: 'Todos' }, { id: 'sistema' as const, label: 'Manual' }, { id: 'publica' as const, label: 'Via Link' }].map(f => (
                <button key={f.id} onClick={() => setFiltroOrigem(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${filtroOrigem === f.id ? 'bg-white/15 text-white' : 'text-white/35 hover:text-white/60'}`}>
                  {f.label}
                </button>
              ))}
            </div>
            <button onClick={() => setMostrarArquivadas(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${mostrarArquivadas ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-[#12141f] border-white/10 text-white/40 hover:text-white/70'}`}>
              <Archive className="w-3.5 h-3.5" /> {mostrarArquivadas ? 'Ocultar arquivadas' : 'Ver arquivadas'}
            </button>
            <button onClick={fetchData} disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#12141f] border border-white/10 text-white/40 hover:text-white/70 text-xs font-bold disabled:opacity-40 transition-all">
              <RotateCcw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </button>
          </div>

          {loading
            ? <div className="flex justify-center py-16"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#7D1F2C]" /></div>
            : (
              <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: 300 }}>
                {COLUNAS_SOL.map(coluna => {
                  const itens = filtered.filter(s => coluna.statuses.includes(s.status as any));
                  return (
                    <div key={coluna.id}
                      className={`flex-shrink-0 w-64 rounded-2xl border flex flex-col ${coluna.cor}`}
                      style={{ minWidth: 240, maxWidth: 280 }}>
                      <div className="px-3 py-2.5 border-b border-white/8">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-black text-white/60 uppercase tracking-wide">{coluna.label}</p>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${coluna.badgeCls}`}>{itens.length}</span>
                        </div>
                      </div>
                      <div className="flex-1 overflow-y-auto p-2.5 space-y-2" style={{ maxHeight: 600 }}>
                        {itens.length === 0 && (
                          <div className="flex items-center justify-center h-16"><p className="text-[9px] text-white/12">vazio</p></div>
                        )}
                        {itens.map(s => (
                          <SolCard key={s.id} sol={s} onOpen={s => setEditando(s)} onMover={moverStatus} onDelete={handleDelete} onArquivar={arquivarSol} colunaAtual={coluna} />
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          }
        </>
      )}

      {showForm && (
        <SolicitacaoForm isOpen={showForm} onClose={() => { setShowForm(false); setEditando(null); }}
          solicitacao={editando ?? undefined} onSave={() => { fetchData(); setShowForm(false); setEditando(null); }} />
      )}
      {editando && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1020] border border-white/10 rounded-2xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-white font-bold">#{editando.numero_solicitacao}</h3>
              <button onClick={() => setEditando(null)} className="text-white/40 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-white font-medium mb-4">{editando.titulo}</p>
            <div className="space-y-2">
              {Object.entries(STATUS_LABEL).map(([k, v]) => (
                <button key={k} onClick={() => { moverStatus(editando.id, k); setEditando(null); }}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition-all ${editando.status === k ? v.cls + ' ring-1 ring-current/30' : 'bg-white/5 text-white/50 hover:bg-white/10'}`}>
                  {v.label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => { arquivarSol(editando.id); setEditando(null); }}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-xl text-xs font-bold bg-yellow-500/15 text-yellow-400 hover:bg-yellow-500/25 transition-all">
                <Archive className="w-3.5 h-3.5" /> Arquivar
              </button>
              <button onClick={() => setEditando(null)}
                className="flex-1 py-2 rounded-xl text-xs font-bold border border-white/15 text-white/50 hover:bg-white/5 transition-all">
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// CRÉDITO DE FORNECEDORES (PERMUTA)
// ═══════════════════════════════════════════════════════════════════════════════

const CreditoFornecedoresTab: React.FC = () => {
  const [creditos, setCreditos]         = useState<CreditoFornecedor[]>([]);
  const [consumos, setConsumos]         = useState<Record<string, CreditoConsumo[]>>({});
  const [loading, setLoading]           = useState(true);
  const [creditoAberto, setCreditoAberto] = useState<string | null>(null);
  const [modalCredito, setModalCredito] = useState(false);
  const [modalConsumo, setModalConsumo] = useState<string | null>(null); // credito_id
  const [salvando, setSalvando]         = useState(false);
  const [uploadando, setUploadando]     = useState(false);
  const comprovanteRef = useRef<HTMLInputElement>(null);

  // Form novo crédito
  const [formC, setFormC] = useState({ nome_fornecedor: '', descricao: '', credito_total: '', data_validade: '', obs: '' });
  // Form novo consumo
  const [formK, setFormK] = useState({ data_consumo: new Date().toISOString().split('T')[0], descricao: '', valor: '', obs: '' });
  const [arquivoComprovante, setArquivoComprovante] = useState<File | null>(null);

  const fetchCreditos = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from('credito_fornecedores').select('*').order('criado_em', { ascending: false });
    setCreditos((data ?? []) as CreditoFornecedor[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchCreditos(); }, [fetchCreditos]);

  const fetchConsumos = async (creditoId: string) => {
    const { data } = await supabase.from('credito_consumos').select('*').eq('credito_id', creditoId).order('data_consumo', { ascending: false });
    setConsumos(prev => ({ ...prev, [creditoId]: (data ?? []) as CreditoConsumo[] }));
  };

  const toggleCredito = (id: string) => {
    if (creditoAberto === id) { setCreditoAberto(null); return; }
    setCreditoAberto(id);
    if (!consumos[id]) fetchConsumos(id);
  };

  const salvarCredito = async () => {
    if (!formC.nome_fornecedor || !formC.credito_total) return;
    setSalvando(true);
    await supabase.from('credito_fornecedores').insert({
      nome_fornecedor: formC.nome_fornecedor,
      descricao: formC.descricao || null,
      credito_total: parseFloat(formC.credito_total),
      data_validade: formC.data_validade || null,
      obs: formC.obs || null,
    });
    setModalCredito(false);
    setFormC({ nome_fornecedor: '', descricao: '', credito_total: '', data_validade: '', obs: '' });
    fetchCreditos();
    setSalvando(false);
  };

  const uploadComprovante = async (creditoId: string): Promise<string | null> => {
    if (!arquivoComprovante) return null;
    setUploadando(true);
    try {
      const ext = arquivoComprovante.name.split('.').pop();
      const path = `${creditoId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('credito-comprovantes').upload(path, arquivoComprovante, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('credito-comprovantes').getPublicUrl(path);
      return data.publicUrl;
    } catch (e: any) {
      alert('Erro ao enviar comprovante: ' + e.message);
      return null;
    } finally {
      setUploadando(false);
    }
  };

  const salvarConsumo = async (creditoId: string) => {
    if (!formK.descricao || !formK.valor) return;
    setSalvando(true);
    const comprovanteUrl = await uploadComprovante(creditoId);
    await supabase.from('credito_consumos').insert({
      credito_id: creditoId,
      data_consumo: formK.data_consumo,
      descricao: formK.descricao,
      valor: parseFloat(formK.valor),
      comprovante_url: comprovanteUrl,
      obs: formK.obs || null,
    });
    setModalConsumo(null);
    setFormK({ data_consumo: new Date().toISOString().split('T')[0], descricao: '', valor: '', obs: '' });
    setArquivoComprovante(null);
    fetchConsumos(creditoId);
    fetchCreditos(); // atualiza saldos
    setSalvando(false);
  };

  const excluirConsumo = async (consumo: CreditoConsumo) => {
    if (!confirm('Excluir este consumo?')) return;
    await supabase.from('credito_consumos').delete().eq('id', consumo.id);
    fetchConsumos(consumo.credito_id);
    fetchCreditos();
  };

  const encerrarCredito = async (id: string) => {
    if (!confirm('Encerrar este crédito?')) return;
    await supabase.from('credito_fornecedores').update({ status: 'encerrado' }).eq('id', id);
    fetchCreditos();
  };

  const statusCor = (s: string) => ({
    ativo:     'bg-emerald-500/20 text-emerald-400',
    encerrado: 'bg-white/10 text-white/40',
    suspenso:  'bg-yellow-500/20 text-yellow-400',
  })[s] ?? 'bg-white/10 text-white/40';

  const totalCreditoTotal  = creditos.filter(c => c.status === 'ativo').reduce((a, b) => a + Number(b.credito_total), 0);
  const totalCreditoUsado  = creditos.filter(c => c.status === 'ativo').reduce((a, b) => a + Number(b.credito_usado), 0);
  const totalCreditoSaldo  = creditos.filter(c => c.status === 'ativo').reduce((a, b) => a + Number(b.credito_saldo), 0);

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: 'Crédito concedido', val: fmtR(totalCreditoTotal), cls: 'text-white' },
          { label: 'Já consumido',      val: fmtR(totalCreditoUsado), cls: 'text-orange-400' },
          { label: 'Saldo disponível',  val: fmtR(totalCreditoSaldo), cls: 'text-emerald-400' },
        ].map(k => (
          <div key={k.label} className="bg-[#12141f] border border-white/10 rounded-xl p-4">
            <p className="text-[10px] text-white/40 uppercase font-bold tracking-wide mb-1">{k.label}</p>
            <p className={`text-lg font-black ${k.cls}`}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-white/60">{creditos.length} acordos de crédito/permuta</p>
        <button onClick={() => setModalCredito(true)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-[#7D1F2C] text-white text-sm font-bold hover:bg-[#9B2535] transition-all">
          <Plus className="w-4 h-4" /> Novo Crédito
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#7D1F2C]" /></div>
      ) : creditos.length === 0 ? (
        <div className="text-center py-16">
          <CreditCard className="w-12 h-12 text-white/15 mx-auto mb-3" />
          <p className="text-white/30 text-sm">Nenhum crédito cadastrado</p>
          <p className="text-white/20 text-xs mt-1">Clique em "Novo Crédito" para registrar uma permuta</p>
        </div>
      ) : (
        <div className="space-y-3">
          {creditos.map(c => {
            const pct = c.credito_total > 0 ? Math.min(100, (Number(c.credito_usado) / Number(c.credito_total)) * 100) : 0;
            const aberto = creditoAberto === c.id;
            const vencido = c.data_validade && new Date(c.data_validade + 'T23:59') < new Date() && c.status === 'ativo';

            return (
              <div key={c.id} className="bg-[#12141f] border border-white/10 rounded-2xl overflow-hidden">
                {/* Cabeçalho do crédito */}
                <button onClick={() => toggleCredito(c.id)}
                  className="w-full flex items-start gap-4 px-5 py-4 hover:bg-white/5 transition-colors text-left">
                  <div className="w-10 h-10 rounded-xl bg-[#7D1F2C]/20 border border-[#7D1F2C]/30 flex items-center justify-center shrink-0">
                    <Building2 className="w-5 h-5 text-[#D4AF37]" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <p className="text-sm font-bold text-white">{c.nome_fornecedor}</p>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md ${statusCor(c.status)}`}>
                        {c.status === 'ativo' ? 'Ativo' : c.status === 'encerrado' ? 'Encerrado' : 'Suspenso'}
                      </span>
                      {vencido && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-red-500/20 text-red-400">Vencido</span>}
                    </div>
                    {c.descricao && <p className="text-xs text-white/40 mb-2 truncate">{c.descricao}</p>}
                    {/* Barra de progresso */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-500 ${pct >= 100 ? 'bg-red-500' : pct >= 80 ? 'bg-orange-500' : 'bg-emerald-500'}`}
                          style={{ width: `${pct}%` }} />
                      </div>
                      <span className="text-[10px] text-white/40 shrink-0">{pct.toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center gap-4 mt-1.5 text-xs">
                      <span className="text-white/40">Total: <span className="text-white font-bold">{fmtR(Number(c.credito_total))}</span></span>
                      <span className="text-white/40">Usado: <span className="text-orange-400 font-bold">{fmtR(Number(c.credito_usado))}</span></span>
                      <span className="text-white/40">Saldo: <span className="text-emerald-400 font-bold">{fmtR(Number(c.credito_saldo))}</span></span>
                    </div>
                    {c.data_validade && (
                      <p className="text-[10px] text-white/30 mt-1">Validade: {fmtData(c.data_validade)}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {c.status === 'ativo' && (
                      <button onClick={e => { e.stopPropagation(); setModalConsumo(c.id); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#7D1F2C]/40 text-white text-xs font-bold hover:bg-[#7D1F2C] transition-all border border-[#7D1F2C]/40"
                        title="Registrar consumo">
                        <PlusCircle className="w-3.5 h-3.5" /> Consumo
                      </button>
                    )}
                    <ChevronDown className={`w-4 h-4 text-white/25 transition-transform duration-200 ${aberto ? 'rotate-180' : ''}`} />
                  </div>
                </button>

                {/* Consumos */}
                {aberto && (
                  <div className="border-t border-white/10">
                    <div className="px-5 py-3 flex items-center justify-between border-b border-white/5">
                      <p className="text-xs font-bold text-white/50 uppercase tracking-wide">Histórico de Consumos</p>
                      {c.status === 'ativo' && (
                        <div className="flex gap-2">
                          <button onClick={() => setModalConsumo(c.id)}
                            className="text-xs text-[#D4AF37] font-bold hover:text-white transition-colors flex items-center gap-1">
                            <Plus className="w-3 h-3" /> Registrar consumo
                          </button>
                          <button onClick={() => encerrarCredito(c.id)}
                            className="text-xs text-white/30 font-bold hover:text-red-400 transition-colors">
                            Encerrar
                          </button>
                        </div>
                      )}
                    </div>

                    {!consumos[c.id] ? (
                      <div className="py-6 text-center"><div className="animate-spin rounded-full h-5 w-5 border-b-2 border-[#7D1F2C] mx-auto" /></div>
                    ) : consumos[c.id].length === 0 ? (
                      <div className="py-8 text-center">
                        <Wallet className="w-8 h-8 text-white/15 mx-auto mb-2" />
                        <p className="text-xs text-white/30">Nenhum consumo registrado</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-white/5">
                        {consumos[c.id].map(k => (
                          <div key={k.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/5 transition-colors group">
                            <div className="shrink-0">
                              <p className="text-[10px] font-bold text-white/40">{fmtData(k.data_consumo)}</p>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white">{k.descricao}</p>
                              {k.obs && <p className="text-[10px] text-white/35 mt-0.5">{k.obs}</p>}
                            </div>
                            <div className="flex items-center gap-2 shrink-0">
                              <p className="text-sm font-bold text-orange-400">{fmtR(Number(k.valor))}</p>
                              {k.comprovante_url && (
                                <a href={k.comprovante_url} target="_blank" rel="noopener noreferrer"
                                  className="p-1.5 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-all" title="Ver comprovante">
                                  <Eye className="w-3.5 h-3.5" />
                                </a>
                              )}
                              <button onClick={() => excluirConsumo(k)}
                                className="p-1.5 rounded-lg text-white/20 hover:text-red-400 hover:bg-red-500/10 transition-all opacity-0 group-hover:opacity-100">
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        ))}
                        {/* Total consumos */}
                        <div className="flex items-center justify-between px-5 py-3 bg-white/3">
                          <span className="text-xs font-bold text-white/50">Total consumido</span>
                          <span className="text-sm font-black text-orange-400">{fmtR(Number(c.credito_usado))}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal: Novo Crédito */}
      {modalCredito && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setModalCredito(false)}>
          <div className="bg-[#0f1020] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <h3 className="text-white font-bold">Novo Crédito / Permuta</h3>
              <button onClick={() => setModalCredito(false)} className="text-white/40 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-3">
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-wide mb-1.5">Nome do Fornecedor *</label>
                <input value={formC.nome_fornecedor} onChange={e => setFormC(f => ({ ...f, nome_fornecedor: e.target.value }))}
                  placeholder="Ex: Rádio FM, Portal de Notícias..." className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-wide mb-1.5">Descrição do Acordo</label>
                <textarea value={formC.descricao} onChange={e => setFormC(f => ({ ...f, descricao: e.target.value }))} rows={2}
                  placeholder="Contexto da permuta, o que foi combinado..." className={inputCls + ' resize-none'} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase tracking-wide mb-1.5">Crédito Total *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm font-bold">R$</span>
                    <input type="number" step="0.01" min="0" value={formC.credito_total}
                      onChange={e => setFormC(f => ({ ...f, credito_total: e.target.value }))}
                      placeholder="0,00" className={inputCls + ' pl-9'} />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase tracking-wide mb-1.5">Validade</label>
                  <input type="date" value={formC.data_validade} onChange={e => setFormC(f => ({ ...f, data_validade: e.target.value }))} className={inputCls} />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-wide mb-1.5">Observações</label>
                <textarea value={formC.obs} onChange={e => setFormC(f => ({ ...f, obs: e.target.value }))} rows={2}
                  className={inputCls + ' resize-none'} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-white/10 flex gap-3">
              <button onClick={() => setModalCredito(false)}
                className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/60 hover:bg-white/5 text-sm transition-all">Cancelar</button>
              <button onClick={salvarCredito} disabled={salvando || !formC.nome_fornecedor || !formC.credito_total}
                className="flex-1 py-2.5 rounded-xl bg-[#7D1F2C] text-white text-sm font-bold hover:bg-[#9B2535] disabled:opacity-50 transition-all">
                {salvando ? 'Salvando...' : 'Criar Crédito'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Registrar Consumo */}
      {modalConsumo && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setModalConsumo(null)}>
          <div className="bg-[#0f1020] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
              <div>
                <h3 className="text-white font-bold">Registrar Consumo</h3>
                <p className="text-xs text-white/40 mt-0.5">{creditos.find(c => c.id === modalConsumo)?.nome_fornecedor}</p>
              </div>
              <button onClick={() => setModalConsumo(null)} className="text-white/40 hover:text-white"><X className="w-4 h-4" /></button>
            </div>
            <div className="px-6 py-4 space-y-3">
              {/* Saldo disponível */}
              {(() => {
                const c = creditos.find(x => x.id === modalConsumo);
                if (!c) return null;
                return (
                  <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 flex justify-between text-sm">
                    <span className="text-white/50">Saldo disponível</span>
                    <span className="font-black text-emerald-400">{fmtR(Number(c.credito_saldo))}</span>
                  </div>
                );
              })()}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase tracking-wide mb-1.5">Data *</label>
                  <input type="date" value={formK.data_consumo} onChange={e => setFormK(f => ({ ...f, data_consumo: e.target.value }))} className={inputCls} />
                </div>
                <div>
                  <label className="block text-xs font-bold text-white/40 uppercase tracking-wide mb-1.5">Valor *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm font-bold">R$</span>
                    <input type="number" step="0.01" min="0" value={formK.valor}
                      onChange={e => setFormK(f => ({ ...f, valor: e.target.value }))}
                      placeholder="0,00" className={inputCls + ' pl-9'} />
                  </div>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-wide mb-1.5">Descrição *</label>
                <input value={formK.descricao} onChange={e => setFormK(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="O que foi consumido do crédito..." className={inputCls} />
              </div>
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-wide mb-1.5">Observações</label>
                <textarea value={formK.obs} onChange={e => setFormK(f => ({ ...f, obs: e.target.value }))} rows={2}
                  className={inputCls + ' resize-none'} />
              </div>
              {/* Upload comprovante */}
              <div>
                <label className="block text-xs font-bold text-white/40 uppercase tracking-wide mb-1.5">Comprovante</label>
                <input ref={comprovanteRef} type="file" className="hidden"
                  accept="image/*,.pdf,.jpg,.jpeg,.png,.webp"
                  onChange={e => { const f = e.target.files?.[0]; if (f) setArquivoComprovante(f); }} />
                {arquivoComprovante ? (
                  <div className="flex items-center gap-3 p-3 bg-white/5 border border-white/15 rounded-xl">
                    <Paperclip className="w-4 h-4 text-blue-400 shrink-0" />
                    <span className="text-sm text-white flex-1 truncate">{arquivoComprovante.name}</span>
                    <button onClick={() => { setArquivoComprovante(null); if (comprovanteRef.current) comprovanteRef.current.value = ''; }}
                      className="text-white/30 hover:text-red-400"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <button onClick={() => comprovanteRef.current?.click()}
                    className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-white/20 text-white/50 hover:border-white/40 hover:text-white/70 text-sm transition-colors">
                    <Upload className="w-4 h-4" /> Anexar comprovante
                  </button>
                )}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-white/10 flex gap-3">
              <button onClick={() => setModalConsumo(null)}
                className="flex-1 py-2.5 rounded-xl border border-white/15 text-white/60 hover:bg-white/5 text-sm transition-all">Cancelar</button>
              <button onClick={() => salvarConsumo(modalConsumo)} disabled={salvando || uploadando || !formK.descricao || !formK.valor}
                className="flex-1 py-2.5 rounded-xl bg-[#7D1F2C] text-white text-sm font-bold hover:bg-[#9B2535] disabled:opacity-50 transition-all">
                {salvando || uploadando ? 'Salvando...' : 'Registrar Consumo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// PÁGINA PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

type AbaModulo = 'tarefas' | 'solicitacoes' | 'credito';

const MetasTarefas: React.FC = () => {
  const [abaModulo, setAbaModulo] = useState<AbaModulo>('tarefas');
  const [tarefas, setTarefas]     = useState<Tarefa[]>([]);
  const [loading, setLoading]     = useState(true);
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);

  const [drawerAberto, setDrawerAberto] = useState(false);
  const [drawerTarefa, setDrawerTarefa] = useState<Tarefa | null>(null);
  const [drawerMode, setDrawerMode]     = useState<'view' | 'edit' | 'create'>('create');
  const [drawerSetor, setDrawerSetor]   = useState('gestao');

  const carregar = useCallback(async () => {
    setLoading(true);
    let q = supabase.from('tarefas_setoriais')
      .select('*, tarefas_anexos(id, nome_arquivo, url_arquivo, storage_path, tipo_mime, tamanho_bytes, criado_em)')
      .order('criado_em', { ascending: false });
    if (!mostrarArquivadas) q = q.or('arquivada.is.null,arquivada.eq.false');
    const { data } = await q;
    setTarefas((data ?? []).map(t => ({
      ...t,
      checklist: Array.isArray(t.checklist) ? t.checklist : [],
      anexos: t.tarefas_anexos ?? [],
    })) as Tarefa[]);
    setLoading(false);
  }, [mostrarArquivadas]);

  useEffect(() => { carregar(); }, [carregar]);

  const abrirNova = (setor: string) => {
    setDrawerTarefa(null); setDrawerSetor(setor); setDrawerMode('create'); setDrawerAberto(true);
  };
  const abrirDetalhe = (t: Tarefa) => {
    setDrawerTarefa(t); setDrawerMode('edit'); setDrawerAberto(true);
  };
  const fecharDrawer = () => {
    setDrawerAberto(false); setDrawerTarefa(null); setDrawerMode('create');
  };

  const moverTarefa = async (id: string, fase: string) => {
    await supabase.from('tarefas_setoriais').update({ fase, atualizado_em: new Date().toISOString() }).eq('id', id);
    setTarefas(ts => ts.map(t => t.id === id ? { ...t, fase } : t));
  };

  const excluirTarefa = async (id: string) => {
    await supabase.from('tarefas_setoriais').delete().eq('id', id);
    setTarefas(ts => ts.filter(t => t.id !== id));
    if (drawerTarefa?.id === id) fecharDrawer();
  };

  const arquivarTarefa = async (id: string) => {
    await supabase.from('tarefas_setoriais').update({
      arquivada: true, arquivada_em: new Date().toISOString(), arquivada_por: 'Sistema',
    }).eq('id', id);
    setTarefas(ts => ts.filter(t => t.id !== id));
    fecharDrawer();
  };

  const onSave = (t: Tarefa) => {
    setTarefas(ts => {
      const existe = ts.find(x => x.id === t.id);
      if (existe) return ts.map(x => x.id === t.id ? t : x);
      return [t, ...ts];
    });
    fecharDrawer();
  };

  const pendentes  = tarefas.filter(t => t.fase !== 'concluido' && t.fase !== 'cancelado').length;
  const urgentes   = tarefas.filter(t => t.prioridade === 'urgente' && t.fase !== 'concluido' && t.fase !== 'cancelado').length;
  const concluidas = tarefas.filter(t => t.fase === 'concluido').length;
  const agAprov    = tarefas.filter(t => t.requer_aprovacao && t.status_aprovacao === 'pendente').length;

  return (
    <div className="space-y-5 pb-16">

      {/* Header */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1f35] via-[#12172a] to-[#0d1020] border border-white/10 p-5">
        <div className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%)', backgroundSize: '20px 20px' }} />
        <div className="relative">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: 'linear-gradient(135deg,#7D1F2C,#D4AF37)' }}>
                <Target className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className="text-xl font-black text-white leading-none">Metas, Tarefas & Créditos</h1>
                <p className="text-xs text-white/40 mt-0.5">Gestão por setor · Solicitações · Permuta de fornecedores</p>
              </div>
            </div>
            {abaModulo === 'tarefas' && (
              <button onClick={() => abrirNova('gestao')}
                className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-sm font-bold bg-[#7D1F2C] text-white hover:bg-[#9B2535] transition-all shrink-0">
                <Plus className="w-4 h-4" /> Nova Tarefa
              </button>
            )}
          </div>
          {abaModulo === 'tarefas' && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Pendentes',     val: pendentes,  cls: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
                { label: 'Urgentes',      val: urgentes,   cls: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
                { label: 'Ag. Aprovação', val: agAprov,    cls: 'text-orange-400', bg: 'bg-orange-500/10 border-orange-500/20' },
                { label: 'Concluídas',    val: concluidas, cls: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
              ].map(k => (
                <div key={k.label} className={`border rounded-xl p-3 text-center ${k.bg}`}>
                  <p className="text-[10px] text-white/40 uppercase font-bold tracking-wide">{k.label}</p>
                  <p className={`text-2xl font-black mt-0.5 ${k.cls}`}>{k.val}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Tabs principais */}
      <div className="flex gap-1 bg-[#12141f] border border-white/10 rounded-xl p-1">
        {[
          { id: 'tarefas'      as AbaModulo, label: 'Metas & Tarefas',           icon: <Target className="w-4 h-4" /> },
          { id: 'solicitacoes' as AbaModulo, label: 'Solicitações & Manutenção', icon: <Wrench className="w-4 h-4" /> },
          { id: 'credito'      as AbaModulo, label: 'Crédito Fornecedores',      icon: <CreditCard className="w-4 h-4" /> },
        ].map(t => (
          <button key={t.id} onClick={() => setAbaModulo(t.id)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-bold transition-all ${abaModulo === t.id ? 'bg-[#7D1F2C] text-white shadow-lg' : 'text-white/40 hover:text-white/70 hover:bg-white/5'}`}>
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* Aba Tarefas */}
      {abaModulo === 'tarefas' && (
        <>
          {/* Botão arquivadas */}
          <div className="flex justify-end">
            <button onClick={() => setMostrarArquivadas(v => !v)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ${mostrarArquivadas ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' : 'bg-[#12141f] border-white/10 text-white/40 hover:text-white/70'}`}>
              <Archive className="w-3.5 h-3.5" /> {mostrarArquivadas ? 'Ocultar arquivadas' : 'Ver arquivadas'}
            </button>
          </div>

          {loading
            ? <div className="flex justify-center py-20"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#7D1F2C]" /></div>
            : (
              <div className="space-y-3">
                {SETORES.map(setor => (
                  <KanbanSetor
                    key={setor.id}
                    setor={setor}
                    tarefas={tarefas.filter(t => t.setor === setor.id)}
                    onAdd={abrirNova}
                    onOpen={abrirDetalhe}
                    onMove={moverTarefa}
                    onDelete={excluirTarefa}
                    onArquivar={arquivarTarefa}
                  />
                ))}
              </div>
            )
          }
        </>
      )}

      {abaModulo === 'solicitacoes' && <SolicitacoesTab />}
      {abaModulo === 'credito'      && <CreditoFornecedoresTab />}

      {/* Drawer tarefa */}
      {drawerAberto && (
        <TarefaDrawer
          tarefa={drawerTarefa}
          mode={drawerMode}
          setorInicial={drawerSetor}
          onClose={fecharDrawer}
          onSave={onSave}
          onDelete={excluirTarefa}
          onArquivar={arquivarTarefa}
        />
      )}
    </div>
  );
};

export default MetasTarefas;
