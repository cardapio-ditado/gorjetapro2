import React, { useState, useEffect, useRef } from 'react';
import { Scale, Plus, X, Printer, Search, AlertTriangle, ThumbsUp, Award, AlertCircle, ShieldAlert, Ban } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';

interface Registro {
  id: string;
  colaborador_id: string;
  tipo: string;
  motivo: string;
  descricao: string;
  data_ocorrencia: string;
  registrado_por: string;
  testemunha: string;
  dias_suspensao?: number;
  recibado: boolean;
  valor_premio?: number;
  colaboradores?: { nome_completo: string };
}

interface Colaborador {
  id: string;
  nome_completo: string;
}

const TIPOS = [
  { key: 'advertencia_verbal', label: 'Advertência Verbal', icon: AlertCircle, cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  { key: 'advertencia_escrita', label: 'Advertência Escrita', icon: AlertTriangle, cls: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  { key: 'suspensao', label: 'Suspensão', icon: ShieldAlert, cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { key: 'justa_causa', label: 'Justa Causa', icon: Ban, cls: 'bg-red-900/30 text-red-300 border-red-800/50' },
  { key: 'elogio', label: 'Elogio', icon: ThumbsUp, cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { key: 'reconhecimento', label: 'Reconhecimento', icon: Award, cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { key: 'premio', label: 'Prêmio', icon: Award, cls: 'bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/30' },
];

const inp = 'w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#7D1F2C]/60 focus:ring-1 focus:ring-[#7D1F2C]/40';
const sel = inp + ' appearance-none';

const tipoCfg = (tipo: string) => TIPOS.find(t => t.key === tipo) ?? TIPOS[0];

export default function Disciplinar() {
  const [registros, setRegistros] = useState<Registro[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [modal, setModal] = useState<{ open: boolean; tipo?: string }>({ open: false });
  const [form, setForm] = useState<Record<string, any>>({});
  const [salvando, setSalvando] = useState(false);
  const [impressao, setImpressao] = useState<Registro | null>(null);
  const printRef = useRef<HTMLDivElement>(null);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: r }, { data: c }] = await Promise.all([
      supabase.from('rh_disciplinar').select('*, colaboradores(nome_completo)').order('data_ocorrencia', { ascending: false }),
      supabase.from('colaboradores').select('id, nome_completo').eq('status', 'ativo').order('nome_completo'),
    ]);
    setRegistros((r ?? []) as Registro[]);
    setColaboradores((c ?? []) as Colaborador[]);
    setLoading(false);
  };

  const abrirModal = (tipo: string) => {
    setForm({
      tipo,
      colaborador_id: '',
      motivo: '',
      descricao: '',
      data_ocorrencia: dayjs().format('YYYY-MM-DD'),
      registrado_por: '',
      testemunha: '',
      dias_suspensao: 1,
      valor_premio: 0,
    });
    setModal({ open: true, tipo });
  };

  const salvar = async () => {
    if (!form.colaborador_id || !form.motivo) return;
    setSalvando(true);
    await supabase.from('rh_disciplinar').insert({
      colaborador_id: form.colaborador_id,
      tipo: form.tipo,
      motivo: form.motivo,
      descricao: form.descricao || '',
      data_ocorrencia: form.data_ocorrencia,
      registrado_por: form.registrado_por || '',
      testemunha: form.testemunha || '',
      dias_suspensao: form.tipo === 'suspensao' ? form.dias_suspensao : null,
      valor_premio: form.tipo === 'premio' ? form.valor_premio : null,
    });
    setSalvando(false);
    setModal({ open: false });
    fetchAll();
  };

  const excluir = async (id: string) => {
    if (!confirm('Excluir este registro?')) return;
    await supabase.from('rh_disciplinar').delete().eq('id', id);
    fetchAll();
  };

  const imprimir = (r: Registro) => {
    setImpressao(r);
    setTimeout(() => window.print(), 300);
  };

  const kpiAdvertencias = registros.filter(r => r.tipo.startsWith('advertencia')).length;
  const kpiMes = registros.filter(r => r.tipo.startsWith('advertencia') && dayjs(r.data_ocorrencia).month() === dayjs().month()).length;
  const kpiElogios = registros.filter(r => ['elogio', 'reconhecimento', 'premio'].includes(r.tipo) && dayjs(r.data_ocorrencia).month() === dayjs().month()).length;

  const registrosFiltrados = registros.filter(r => {
    const nome = r.colaboradores?.nome_completo ?? '';
    const matchBusca = nome.toLowerCase().includes(busca.toLowerCase()) || r.motivo.toLowerCase().includes(busca.toLowerCase());
    const matchTipo = !filtroTipo || r.tipo === filtroTipo;
    return matchBusca && matchTipo;
  });

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 flex items-center gap-4">
          <AlertTriangle className="w-8 h-8 text-orange-400" />
          <div>
            <p className="text-2xl font-bold text-orange-400">{kpiAdvertencias}</p>
            <p className="text-xs text-white/50">Total advertências</p>
          </div>
        </div>
        <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 flex items-center gap-4">
          <ShieldAlert className="w-8 h-8 text-red-400" />
          <div>
            <p className="text-2xl font-bold text-red-400">{kpiMes}</p>
            <p className="text-xs text-white/50">Advertências este mês</p>
          </div>
        </div>
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 flex items-center gap-4">
          <ThumbsUp className="w-8 h-8 text-emerald-400" />
          <div>
            <p className="text-2xl font-bold text-emerald-400">{kpiElogios}</p>
            <p className="text-xs text-white/50">Elogios este mês</p>
          </div>
        </div>
      </div>

      {/* Botões de ação rápida */}
      <div className="flex flex-wrap gap-2">
        {TIPOS.map(t => {
          const Icon = t.icon;
          return (
            <button key={t.key} onClick={() => abrirModal(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium border transition-all hover:scale-105 ${t.cls}`}>
              <Icon className="w-4 h-4" />
              + {t.label}
            </button>
          );
        })}
      </div>

      {/* Filtros */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar..."
            className="bg-white/5 border border-white/15 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-white/30 focus:outline-none w-56" />
        </div>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)}
          className="bg-white/5 border border-white/15 rounded-xl px-4 py-2 text-sm text-white focus:outline-none appearance-none">
          <option value="">Todos os tipos</option>
          {TIPOS.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </div>

      {/* Lista */}
      {loading ? <div className="text-center py-12 text-white/40">Carregando...</div> : (
        <div className="space-y-2">
          {registrosFiltrados.length === 0 ? (
            <div className="text-center py-12 text-white/40">Nenhum registro encontrado.</div>
          ) : registrosFiltrados.map(r => {
            const cfg = tipoCfg(r.tipo);
            const Icon = cfg.icon;
            return (
              <div key={r.id} className="bg-white/5 border border-white/10 rounded-xl px-5 py-4 flex items-center justify-between hover:bg-white/8 transition-all">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${cfg.cls}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-white font-medium">{r.colaboradores?.nome_completo}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full border ${cfg.cls}`}>{cfg.label}</span>
                    </div>
                    <p className="text-white/60 text-sm">{r.motivo}</p>
                    {r.dias_suspensao && <p className="text-red-400 text-xs">{r.dias_suspensao} dia(s) de suspensão</p>}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <p className="text-white/40 text-xs">{dayjs(r.data_ocorrencia).format('DD/MM/YYYY')}</p>
                    {r.registrado_por && <p className="text-white/30 text-xs">por {r.registrado_por}</p>}
                  </div>
                  {['advertencia_escrita', 'suspensao', 'justa_causa'].includes(r.tipo) && (
                    <button onClick={() => imprimir(r)} className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all">
                      <Printer className="w-4 h-4" />
                    </button>
                  )}
                  <button onClick={() => excluir(r.id)} className="p-2 hover:bg-red-500/20 rounded-lg text-white/30 hover:text-red-400 transition-all">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      {modal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setModal({ open: false })}>
          <div className="bg-[#0c0e1a] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              {(() => {
                const cfg = tipoCfg(modal.tipo ?? '');
                const Icon = cfg.icon;
                return (
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center border ${cfg.cls}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <h2 className="text-white font-semibold">{cfg.label}</h2>
                  </div>
                );
              })()}
              <button onClick={() => setModal({ open: false })} className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-all"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-white/60 text-xs mb-1.5 block">Colaborador</label>
                <select value={form.colaborador_id || ''} onChange={e => setForm(f => ({ ...f, colaborador_id: e.target.value }))} className={sel}>
                  <option value="">Selecione...</option>
                  {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
                </select>
              </div>
              <div>
                <label className="text-white/60 text-xs mb-1.5 block">Motivo</label>
                <input value={form.motivo || ''} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))} placeholder="Motivo principal" className={inp} />
              </div>
              <div>
                <label className="text-white/60 text-xs mb-1.5 block">Descrição detalhada</label>
                <textarea value={form.descricao || ''} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={3} className={inp + ' resize-none'} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-white/60 text-xs mb-1.5 block">Data</label>
                  <input type="date" value={form.data_ocorrencia || ''} onChange={e => setForm(f => ({ ...f, data_ocorrencia: e.target.value }))} className={inp} />
                </div>
                {form.tipo === 'suspensao' && (
                  <div>
                    <label className="text-white/60 text-xs mb-1.5 block">Dias de suspensão</label>
                    <input type="number" value={form.dias_suspensao || 1} min={1} onChange={e => setForm(f => ({ ...f, dias_suspensao: parseInt(e.target.value) }))} className={inp} />
                  </div>
                )}
                {form.tipo === 'premio' && (
                  <div>
                    <label className="text-white/60 text-xs mb-1.5 block">Valor do prêmio (R$)</label>
                    <input type="number" value={form.valor_premio || 0} min={0} onChange={e => setForm(f => ({ ...f, valor_premio: parseFloat(e.target.value) }))} className={inp} />
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-white/60 text-xs mb-1.5 block">Registrado por</label>
                  <input value={form.registrado_por || ''} onChange={e => setForm(f => ({ ...f, registrado_por: e.target.value }))} placeholder="Nome do responsável" className={inp} />
                </div>
                <div>
                  <label className="text-white/60 text-xs mb-1.5 block">Testemunha</label>
                  <input value={form.testemunha || ''} onChange={e => setForm(f => ({ ...f, testemunha: e.target.value }))} placeholder="Nome (opcional)" className={inp} />
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-white/10 flex justify-end gap-3">
              <button onClick={() => setModal({ open: false })} className="px-4 py-2 rounded-xl text-white/60 hover:text-white hover:bg-white/5 text-sm transition-all">Cancelar</button>
              <button onClick={salvar} disabled={salvando || !form.colaborador_id || !form.motivo}
                className="px-6 py-2 bg-[#7D1F2C] hover:bg-[#9b2535] text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50">
                {salvando ? 'Salvando...' : 'Registrar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Documento para impressão */}
      {impressao && (
        <div ref={printRef} className="hidden print:block fixed inset-0 bg-white text-black p-12 z-[100]">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8 border-b pb-6">
              <h1 className="text-2xl font-bold uppercase">{tipoCfg(impressao.tipo).label}</h1>
              <p className="text-gray-500 mt-1">Documento Disciplinar</p>
            </div>
            <div className="space-y-4">
              <p><strong>Colaborador:</strong> {impressao.colaboradores?.nome_completo}</p>
              <p><strong>Tipo:</strong> {tipoCfg(impressao.tipo).label}</p>
              <p><strong>Data:</strong> {dayjs(impressao.data_ocorrencia).format('DD/MM/YYYY')}</p>
              <p><strong>Motivo:</strong> {impressao.motivo}</p>
              {impressao.descricao && <p><strong>Descrição:</strong> {impressao.descricao}</p>}
              {impressao.dias_suspensao && <p><strong>Dias de Suspensão:</strong> {impressao.dias_suspensao}</p>}
              {impressao.testemunha && <p><strong>Testemunha:</strong> {impressao.testemunha}</p>}
              {impressao.registrado_por && <p><strong>Registrado por:</strong> {impressao.registrado_por}</p>}
            </div>
            <div className="mt-16 grid grid-cols-2 gap-16">
              <div className="border-t border-black pt-2 text-center">
                <p className="text-sm">Assinatura do Colaborador</p>
                <p className="text-xs text-gray-500 mt-1">{impressao.colaboradores?.nome_completo}</p>
              </div>
              <div className="border-t border-black pt-2 text-center">
                <p className="text-sm">Assinatura do Responsável</p>
                <p className="text-xs text-gray-500 mt-1">{impressao.registrado_por || 'Gestão'}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
