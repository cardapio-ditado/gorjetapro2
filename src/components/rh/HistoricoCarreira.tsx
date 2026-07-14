import React, { useState, useEffect } from 'react';
import { TrendingUp, Plus, X, Search, ArrowUpRight, DollarSign, Briefcase, UserCheck, PauseCircle, RotateCcw, MoreHorizontal } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';

interface Evento {
  id: string;
  colaborador_id: string;
  tipo: string;
  titulo?: string;
  descricao: string;
  data_evento: string;
  funcao_anterior: string;
  funcao_nova: string;
  salario_anterior: number | null;
  salario_novo: number | null;
  percentual_reajuste: number | null;
  registrado_por: string;
}

interface Colaborador {
  id: string;
  nome_completo: string;
  funcao_personalizada?: string;
  data_admissao?: string;
  salario_fixo?: number;
}

const TIPOS_EVENTO = [
  { key: 'admissao', label: 'Admissão', icon: UserCheck, cor: 'text-emerald-400', bg: 'bg-emerald-500/20 border-emerald-500/30' },
  { key: 'promocao', label: 'Promoção', icon: ArrowUpRight, cor: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/30' },
  { key: 'ajuste_salarial', label: 'Ajuste Salarial', icon: DollarSign, cor: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/20 border-[#D4AF37]/30' },
  { key: 'mudanca_funcao', label: 'Mudança de Função', icon: Briefcase, cor: 'text-sky-400', bg: 'bg-sky-500/20 border-sky-500/30' },
  { key: 'afastamento', label: 'Afastamento', icon: PauseCircle, cor: 'text-orange-400', bg: 'bg-orange-500/20 border-orange-500/30' },
  { key: 'retorno', label: 'Retorno', icon: RotateCcw, cor: 'text-teal-400', bg: 'bg-teal-500/20 border-teal-500/30' },
  { key: 'outros', label: 'Outros', icon: MoreHorizontal, cor: 'text-white/50', bg: 'bg-white/10 border-white/20' },
];

const tipoCfg = (tipo: string) => TIPOS_EVENTO.find(t => t.key === tipo) ?? TIPOS_EVENTO[TIPOS_EVENTO.length - 1];

const inp = 'w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#7D1F2C]/60 focus:ring-1 focus:ring-[#7D1F2C]/40';
const sel = inp + ' appearance-none';

const fmt = (v: number | null) => v ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : '—';

export default function HistoricoCarreira() {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [colaboradorSel, setColaboradorSel] = useState<string>('');
  const [busca, setBusca] = useState('');
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [loading, setLoading] = useState(false);
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    supabase.from('colaboradores').select('id, nome_completo, funcao_personalizada, data_admissao, salario_fixo').eq('status', 'ativo').order('nome_completo')
      .then(({ data }) => setColaboradores((data ?? []) as Colaborador[]));
  }, []);

  useEffect(() => {
    if (!colaboradorSel) { setEventos([]); return; }
    fetchEventos();
  }, [colaboradorSel]);

  const fetchEventos = async () => {
    setLoading(true);
    const { data } = await supabase.from('rh_historico_carreira').select('*').eq('colaborador_id', colaboradorSel).order('data_evento', { ascending: false });
    setEventos((data ?? []) as Evento[]);
    setLoading(false);
  };

  const colaboradorInfo = colaboradores.find(c => c.id === colaboradorSel);
  const colaboradoresFiltrados = colaboradores.filter(c => c.nome_completo.toLowerCase().includes(busca.toLowerCase()));

  const abrirModal = () => {
    setForm({
      colaborador_id: colaboradorSel || '',
      tipo: 'promocao',
      titulo: '',
      descricao: '',
      data_evento: dayjs().format('YYYY-MM-DD'),
      funcao_anterior: colaboradorInfo?.funcao_personalizada || '',
      funcao_nova: '',
      salario_anterior: colaboradorInfo?.salario_fixo || null,
      salario_novo: null,
      registrado_por: '',
      atualizar_colaborador: false,
    });
    setModal(true);
  };

  const salvar = async () => {
    if (!form.colaborador_id || !form.tipo) return;
    setSalvando(true);
    const reajuste = form.salario_anterior && form.salario_novo
      ? Math.round((form.salario_novo - form.salario_anterior) / form.salario_anterior * 100 * 10) / 10
      : null;
    await supabase.from('rh_historico_carreira').insert({
      colaborador_id: form.colaborador_id,
      tipo: form.tipo,
      titulo: form.titulo || tipoCfg(form.tipo).label,
      descricao: form.descricao || '',
      data_evento: form.data_evento,
      funcao_anterior: form.funcao_anterior || '',
      funcao_nova: form.funcao_nova || '',
      salario_anterior: form.salario_anterior || null,
      salario_novo: form.salario_novo || null,
      percentual_reajuste: reajuste,
      registrado_por: form.registrado_por || '',
    });
    if (form.atualizar_colaborador) {
      const upd: Record<string, any> = {};
      if (form.funcao_nova) upd.funcao_personalizada = form.funcao_nova;
      if (form.salario_novo) upd.salario_fixo = parseFloat(form.salario_novo);
      if (Object.keys(upd).length > 0) {
        await supabase.from('colaboradores').update(upd).eq('id', form.colaborador_id);
      }
    }
    setSalvando(false);
    setModal(false);
    fetchEventos();
  };

  const excluir = async (id: string) => {
    if (!confirm('Excluir este evento?')) return;
    await supabase.from('rh_historico_carreira').delete().eq('id', id);
    fetchEventos();
  };

  return (
    <div className="flex gap-6 h-full">
      {/* Painel esquerdo: lista de colaboradores */}
      <div className="w-64 flex-shrink-0 space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar colaborador..."
            className="bg-white/5 border border-white/15 rounded-xl pl-9 pr-4 py-2 text-xs text-white placeholder-white/30 focus:outline-none w-full" />
        </div>
        <div className="space-y-1 max-h-[600px] overflow-y-auto">
          {colaboradoresFiltrados.map(c => (
            <button key={c.id} onClick={() => setColaboradorSel(c.id)}
              className={`w-full text-left px-3 py-2.5 rounded-xl transition-all text-sm ${colaboradorSel === c.id ? 'bg-[#7D1F2C] text-white' : 'text-white/60 hover:text-white hover:bg-white/5'}`}>
              <p className="font-medium truncate">{c.nome_completo}</p>
              {c.data_admissao && <p className="text-xs opacity-60 mt-0.5">desde {dayjs(c.data_admissao).format('DD/MM/YYYY')}</p>}
            </button>
          ))}
        </div>
      </div>

      {/* Painel direito: timeline */}
      <div className="flex-1 min-w-0">
        {!colaboradorSel ? (
          <div className="flex items-center justify-center h-64 text-white/30">
            <div className="text-center">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Selecione um colaborador para ver o histórico</p>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-white font-semibold text-lg">{colaboradorInfo?.nome_completo}</h3>
                <p className="text-white/50 text-sm">
                  {colaboradorInfo?.funcao_personalizada ?? 'Sem função'}
                  {colaboradorInfo?.salario_fixo ? ` · ${fmt(colaboradorInfo.salario_fixo)}` : ''}
                </p>
              </div>
              <button onClick={abrirModal}
                className="flex items-center gap-2 px-4 py-2 bg-[#7D1F2C] hover:bg-[#9b2535] text-white rounded-xl text-sm font-medium transition-all">
                <Plus className="w-4 h-4" />Adicionar Evento
              </button>
            </div>

            {loading ? (
              <div className="text-center py-12 text-white/40">Carregando...</div>
            ) : eventos.length === 0 ? (
              <div className="text-center py-12 text-white/40">Nenhum evento registrado.</div>
            ) : (
              <div className="relative">
                <div className="absolute left-5 top-0 bottom-0 w-px bg-white/10" />
                <div className="space-y-4">
                  {eventos.map((e, idx) => {
                    const cfg = tipoCfg(e.tipo);
                    const Icon = cfg.icon;
                    return (
                      <div key={e.id} className="relative flex gap-5">
                        <div className={`relative z-10 w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border ${cfg.bg}`}>
                          <Icon className={`w-4 h-4 ${cfg.cor}`} />
                        </div>
                        <div className="flex-1 bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/8 transition-all">
                          <div className="flex items-start justify-between">
                            <div>
                              <div className="flex items-center gap-2">
                                <p className={`font-medium text-sm ${cfg.cor}`}>{e.titulo || cfg.label}</p>
                                <span className="text-white/30 text-xs">{dayjs(e.data_evento).format('DD/MM/YYYY')}</span>
                              </div>
                              {e.descricao && <p className="text-white/60 text-sm mt-1">{e.descricao}</p>}
                              <div className="flex gap-4 mt-2 flex-wrap">
                                {(e.funcao_anterior || e.funcao_nova) && (
                                  <p className="text-white/40 text-xs">
                                    {e.funcao_anterior && <span className="line-through mr-1">{e.funcao_anterior}</span>}
                                    {e.funcao_nova && <span className="text-white/60">{e.funcao_nova}</span>}
                                  </p>
                                )}
                                {(e.salario_anterior || e.salario_novo) && (
                                  <p className="text-white/40 text-xs">
                                    {e.salario_anterior && <span className="mr-1">{fmt(e.salario_anterior)}</span>}
                                    {e.salario_novo && <span className="text-emerald-400">{fmt(e.salario_novo)}</span>}
                                    {e.percentual_reajuste !== null && e.percentual_reajuste !== undefined && (
                                      <span className="ml-1 text-emerald-400">+{e.percentual_reajuste}%</span>
                                    )}
                                  </p>
                                )}
                              </div>
                              {e.registrado_por && <p className="text-white/30 text-xs mt-1">por {e.registrado_por}</p>}
                            </div>
                            <button onClick={() => excluir(e.id)} className="p-1.5 hover:bg-red-500/20 rounded-lg text-white/20 hover:text-red-400 transition-all ml-2">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setModal(false)}>
          <div className="bg-[#0c0e1a] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="text-white font-semibold">Novo Evento de Carreira</h2>
              <button onClick={() => setModal(false)} className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-all"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              {!colaboradorSel && (
                <div>
                  <label className="text-white/60 text-xs mb-1.5 block">Colaborador</label>
                  <select value={form.colaborador_id || ''} onChange={e => setForm(f => ({ ...f, colaborador_id: e.target.value }))} className={sel}>
                    <option value="">Selecione...</option>
                    {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
                  </select>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-white/60 text-xs mb-1.5 block">Tipo de Evento</label>
                  <select value={form.tipo || 'promocao'} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} className={sel}>
                    {TIPOS_EVENTO.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-white/60 text-xs mb-1.5 block">Data</label>
                  <input type="date" value={form.data_evento || ''} onChange={e => setForm(f => ({ ...f, data_evento: e.target.value }))} className={inp} />
                </div>
              </div>
              <div>
                <label className="text-white/60 text-xs mb-1.5 block">Título (opcional)</label>
                <input value={form.titulo || ''} onChange={e => setForm(f => ({ ...f, titulo: e.target.value }))} placeholder={tipoCfg(form.tipo ?? 'outros').label} className={inp} />
              </div>
              <div>
                <label className="text-white/60 text-xs mb-1.5 block">Descrição</label>
                <textarea value={form.descricao || ''} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} rows={2} className={inp + ' resize-none'} />
              </div>
              {['mudanca_funcao', 'promocao', 'admissao'].includes(form.tipo) && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-white/60 text-xs mb-1.5 block">Função Anterior</label>
                    <input value={form.funcao_anterior || ''} onChange={e => setForm(f => ({ ...f, funcao_anterior: e.target.value }))} className={inp} />
                  </div>
                  <div>
                    <label className="text-white/60 text-xs mb-1.5 block">Função Nova</label>
                    <input value={form.funcao_nova || ''} onChange={e => setForm(f => ({ ...f, funcao_nova: e.target.value }))} className={inp} />
                  </div>
                </div>
              )}
              {['ajuste_salarial', 'promocao', 'admissao'].includes(form.tipo) && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-white/60 text-xs mb-1.5 block">Salário Anterior</label>
                    <input type="number" step="0.01" value={form.salario_anterior || ''} onChange={e => setForm(f => ({ ...f, salario_anterior: parseFloat(e.target.value) || null }))} className={inp} />
                  </div>
                  <div>
                    <label className="text-white/60 text-xs mb-1.5 block">Salário Novo</label>
                    <input type="number" step="0.01" value={form.salario_novo || ''} onChange={e => setForm(f => ({ ...f, salario_novo: parseFloat(e.target.value) || null }))} className={inp} />
                  </div>
                </div>
              )}
              <div>
                <label className="text-white/60 text-xs mb-1.5 block">Registrado por</label>
                <input value={form.registrado_por || ''} onChange={e => setForm(f => ({ ...f, registrado_por: e.target.value }))} className={inp} />
              </div>
              {(form.funcao_nova || form.salario_novo) && (
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={form.atualizar_colaborador || false} onChange={e => setForm(f => ({ ...f, atualizar_colaborador: e.target.checked }))}
                    className="w-4 h-4 rounded accent-[#7D1F2C]" />
                  <span className="text-white/60 text-sm">Atualizar dados do colaborador (função/salário)</span>
                </label>
              )}
            </div>
            <div className="p-6 border-t border-white/10 flex justify-end gap-3">
              <button onClick={() => setModal(false)} className="px-4 py-2 rounded-xl text-white/60 hover:text-white hover:bg-white/5 text-sm transition-all">Cancelar</button>
              <button onClick={salvar} disabled={salvando}
                className="px-6 py-2 bg-[#7D1F2C] hover:bg-[#9b2535] text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50">
                {salvando ? 'Salvando...' : 'Salvar Evento'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
