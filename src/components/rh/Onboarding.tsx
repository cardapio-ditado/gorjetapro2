import React, { useState, useEffect } from 'react';
import { Rocket, Plus, CheckCircle, Circle, ChevronRight, X, Trash2, AlertCircle, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';

interface Template {
  id: string;
  titulo: string;
  funcao: string;
  descricao: string;
  ativo: boolean;
  criado_em: string;
  tarefas?: TarefaTemplate[];
}

interface TarefaTemplate {
  id: string;
  template_id: string;
  titulo: string;
  descricao: string;
  responsavel: string;
  prazo_dias: number;
  ordem: number;
}

interface Instancia {
  id: string;
  colaborador_id: string;
  template_id: string | null;
  nome_template: string;
  data_inicio: string;
  data_prevista_conclusao: string | null;
  data_conclusao: string | null;
  status: string;
  observacoes: string;
  colaboradores?: { nome_completo: string };
  tarefas?: TarefaInstancia[];
}

interface TarefaInstancia {
  id: string;
  instancia_id: string;
  titulo: string;
  descricao: string;
  responsavel: string;
  prazo_data: string | null;
  concluida: boolean;
  concluida_em: string | null;
  concluida_por: string;
  ordem: number;
}

interface Colaborador {
  id: string;
  nome_completo: string;
}

const inp = 'w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#7D1F2C]/60 focus:ring-1 focus:ring-[#7D1F2C]/40';
const sel = inp + ' appearance-none';

export default function Onboarding() {
  const [aba, setAba] = useState<'instancias' | 'templates'>('instancias');
  const [instancias, setInstancias] = useState<Instancia[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [loading, setLoading] = useState(true);
  const [instanciaAberta, setInstanciaAberta] = useState<Instancia | null>(null);
  const [modalNova, setModalNova] = useState(false);
  const [modalTemplate, setModalTemplate] = useState<Template | null | 'novo'>(null);
  const [form, setForm] = useState<Record<string, any>>({});
  const [templateForm, setTemplateForm] = useState<Record<string, any>>({});
  const [templateTarefas, setTemplateTarefas] = useState<Partial<TarefaTemplate>[]>([]);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: inst }, { data: tmpl }, { data: col }] = await Promise.all([
      supabase.from('rh_onboarding_instancias').select('*, colaboradores(nome_completo)').order('criado_em', { ascending: false }),
      supabase.from('rh_onboarding_templates').select('*, rh_onboarding_tarefas_template(*)').order('titulo'),
      supabase.from('colaboradores').select('id, nome_completo').eq('status', 'ativo').order('nome_completo'),
    ]);
    setInstancias((inst ?? []) as Instancia[]);
    setTemplates((tmpl ?? []) as Template[]);
    setColaboradores((col ?? []) as Colaborador[]);
    setLoading(false);
  };

  const abrirInstancia = async (inst: Instancia) => {
    const { data } = await supabase.from('rh_onboarding_tarefas').select('*').eq('instancia_id', inst.id).order('ordem');
    setInstanciaAberta({ ...inst, tarefas: data ?? [] });
  };

  const toggleTarefa = async (tarefa: TarefaInstancia) => {
    const concluida = !tarefa.concluida;
    await supabase.from('rh_onboarding_tarefas').update({
      concluida,
      concluida_em: concluida ? new Date().toISOString() : null,
    }).eq('id', tarefa.id);
    if (instanciaAberta) {
      const novasTarefas = instanciaAberta.tarefas!.map(t => t.id === tarefa.id ? { ...t, concluida } : t);
      const todasConcluidas = novasTarefas.every(t => t.concluida);
      if (todasConcluidas) {
        await supabase.from('rh_onboarding_instancias').update({ status: 'concluido', data_conclusao: dayjs().format('YYYY-MM-DD') }).eq('id', instanciaAberta.id);
      }
      setInstanciaAberta({ ...instanciaAberta, tarefas: novasTarefas });
    }
    fetchAll();
  };

  const iniciarOnboarding = async () => {
    if (!form.colaborador_id || !form.template_id) return;
    setSalvando(true);
    const tmpl = templates.find(t => t.id === form.template_id);
    const { data: inst } = await supabase.from('rh_onboarding_instancias').insert({
      colaborador_id: form.colaborador_id,
      template_id: form.template_id,
      nome_template: tmpl?.titulo ?? '',
      data_inicio: dayjs().format('YYYY-MM-DD'),
      data_prevista_conclusao: form.data_prevista || null,
      status: 'em_andamento',
      observacoes: form.observacoes || '',
    }).select().single();
    if (inst && tmpl?.tarefas) {
      for (const tt of tmpl.tarefas) {
        await supabase.from('rh_onboarding_tarefas').insert({
          instancia_id: inst.id,
          titulo: tt.titulo,
          descricao: tt.descricao,
          responsavel: tt.responsavel,
          prazo_data: tt.prazo_dias ? dayjs().add(tt.prazo_dias, 'day').format('YYYY-MM-DD') : null,
          ordem: tt.ordem,
        });
      }
    }
    setSalvando(false);
    setModalNova(false);
    fetchAll();
  };

  const salvarTemplate = async () => {
    if (!templateForm.titulo) return;
    setSalvando(true);
    let tmplId: string;
    if (modalTemplate !== 'novo' && modalTemplate?.id) {
      await supabase.from('rh_onboarding_templates').update({ titulo: templateForm.titulo, funcao: templateForm.funcao || '', descricao: templateForm.descricao || '' }).eq('id', modalTemplate.id);
      tmplId = modalTemplate.id;
      await supabase.from('rh_onboarding_tarefas_template').delete().eq('template_id', tmplId);
    } else {
      const { data } = await supabase.from('rh_onboarding_templates').insert({ titulo: templateForm.titulo, funcao: templateForm.funcao || '', descricao: templateForm.descricao || '' }).select().single();
      tmplId = data!.id;
    }
    for (let i = 0; i < templateTarefas.length; i++) {
      const t = templateTarefas[i];
      if (t.titulo) {
        await supabase.from('rh_onboarding_tarefas_template').insert({ template_id: tmplId, titulo: t.titulo, descricao: t.descricao || '', responsavel: t.responsavel || '', prazo_dias: t.prazo_dias || 1, ordem: i });
      }
    }
    setSalvando(false);
    setModalTemplate(null);
    fetchAll();
  };

  const excluirInstancia = async (id: string) => {
    if (!confirm('Excluir este onboarding?')) return;
    await supabase.from('rh_onboarding_instancias').delete().eq('id', id);
    fetchAll();
  };

  const progressoInstancia = (inst: Instancia) => {
    if (!inst.tarefas || inst.tarefas.length === 0) return 0;
    return Math.round(inst.tarefas.filter(t => t.concluida).length / inst.tarefas.length * 100);
  };

  const statusBadge = (s: string) => ({
    em_andamento: 'bg-blue-500/20 text-blue-400',
    concluido: 'bg-emerald-500/20 text-emerald-400',
    cancelado: 'bg-red-500/20 text-red-400',
  }[s] ?? 'bg-white/10 text-white/50');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['instancias', 'templates'] as const).map(t => (
            <button key={t} onClick={() => setAba(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${aba === t ? 'bg-[#7D1F2C] text-white' : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'}`}>
              {t === 'instancias' ? 'Em Andamento' : 'Templates'}
            </button>
          ))}
        </div>
        {aba === 'instancias' ? (
          <button onClick={() => { setForm({}); setModalNova(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-[#7D1F2C] hover:bg-[#9b2535] text-white rounded-xl text-sm font-medium transition-all">
            <Plus className="w-4 h-4" />Iniciar Onboarding
          </button>
        ) : (
          <button onClick={() => { setTemplateForm({}); setTemplateTarefas([{ titulo: '', prazo_dias: 1, responsavel: '', ordem: 0 }]); setModalTemplate('novo'); }}
            className="flex items-center gap-2 px-4 py-2 bg-[#7D1F2C] hover:bg-[#9b2535] text-white rounded-xl text-sm font-medium transition-all">
            <Plus className="w-4 h-4" />Novo Template
          </button>
        )}
      </div>

      {loading ? <div className="text-center py-12 text-white/40">Carregando...</div> : aba === 'instancias' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {instancias.length === 0 ? (
            <div className="col-span-2 text-center py-12 text-white/40">Nenhum onboarding em andamento.</div>
          ) : instancias.map(inst => {
            const prog = progressoInstancia(inst);
            const diasRestantes = inst.data_prevista_conclusao ? dayjs(inst.data_prevista_conclusao).diff(dayjs(), 'day') : null;
            return (
              <div key={inst.id} className="bg-white/5 border border-white/10 rounded-xl p-5 hover:bg-white/8 transition-all">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <p className="text-white font-medium">{inst.colaboradores?.nome_completo}</p>
                    <p className="text-white/50 text-xs mt-0.5">{inst.nome_template}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${statusBadge(inst.status)}`}>
                      {inst.status === 'em_andamento' ? 'Em andamento' : inst.status === 'concluido' ? 'Concluído' : 'Cancelado'}
                    </span>
                    <button onClick={() => excluirInstancia(inst.id)} className="p-1.5 hover:bg-red-500/20 rounded-lg text-white/30 hover:text-red-400 transition-all">
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div className="mb-3">
                  <div className="flex justify-between text-xs text-white/50 mb-1.5">
                    <span>Progresso</span>
                    <span>{prog}%</span>
                  </div>
                  <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-[#7D1F2C] to-[#D4AF37] rounded-full transition-all duration-500" style={{ width: `${prog}%` }} />
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 text-xs text-white/40">
                    <span>Início: {dayjs(inst.data_inicio).format('DD/MM/YYYY')}</span>
                    {diasRestantes !== null && (
                      <span className={diasRestantes < 0 ? 'text-red-400' : diasRestantes < 3 ? 'text-yellow-400' : ''}>
                        {diasRestantes < 0 ? `${Math.abs(diasRestantes)}d atrasado` : `${diasRestantes}d restantes`}
                      </span>
                    )}
                  </div>
                  <button onClick={() => abrirInstancia(inst)}
                    className="flex items-center gap-1 text-xs text-[#D4AF37] hover:text-white transition-all">
                    Ver tarefas<ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-3">
          {templates.map(t => (
            <div key={t.id} className="bg-white/5 border border-white/10 rounded-xl p-5 hover:bg-white/8 transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">{t.titulo}</p>
                  <p className="text-white/50 text-xs">{t.funcao && `${t.funcao} · `}{(t as any).rh_onboarding_tarefas_template?.length ?? 0} tarefas</p>
                </div>
                <button onClick={() => { setTemplateForm({ titulo: t.titulo, funcao: t.funcao, descricao: t.descricao }); setTemplateTarefas((t as any).rh_onboarding_tarefas_template?.sort((a: any, b: any) => a.ordem - b.ordem) ?? []); setModalTemplate(t); }}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/70 hover:text-white rounded-lg text-xs transition-all">
                  Editar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal checklist de instância */}
      {instanciaAberta && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setInstanciaAberta(null)}>
          <div className="bg-[#0c0e1a] border border-white/10 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <div>
                <h2 className="text-white font-semibold">{instanciaAberta.colaboradores?.nome_completo}</h2>
                <p className="text-white/40 text-xs">{instanciaAberta.nome_template}</p>
              </div>
              <button onClick={() => setInstanciaAberta(null)} className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-all"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-2">
              {(instanciaAberta.tarefas ?? []).map(t => (
                <button key={t.id} onClick={() => toggleTarefa(t)}
                  className="w-full flex items-start gap-3 p-3 rounded-xl hover:bg-white/5 transition-all text-left">
                  {t.concluida ? <CheckCircle className="w-5 h-5 text-emerald-400 mt-0.5 flex-shrink-0" /> : <Circle className="w-5 h-5 text-white/30 mt-0.5 flex-shrink-0" />}
                  <div className="flex-1">
                    <p className={`text-sm ${t.concluida ? 'text-white/40 line-through' : 'text-white/80'}`}>{t.titulo}</p>
                    {t.responsavel && <p className="text-white/30 text-xs">{t.responsavel}</p>}
                    {t.prazo_data && !t.concluida && (
                      <p className={`text-xs mt-0.5 ${dayjs(t.prazo_data).isBefore(dayjs()) ? 'text-red-400' : 'text-white/30'}`}>
                        Prazo: {dayjs(t.prazo_data).format('DD/MM')}
                      </p>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Modal nova instância */}
      {modalNova && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setModalNova(false)}>
          <div className="bg-[#0c0e1a] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="text-white font-semibold">Iniciar Onboarding</h2>
              <button onClick={() => setModalNova(false)} className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-all"><X className="w-5 h-5" /></button>
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
                <label className="text-white/60 text-xs mb-1.5 block">Template de Onboarding</label>
                <select value={form.template_id || ''} onChange={e => setForm(f => ({ ...f, template_id: e.target.value }))} className={sel}>
                  <option value="">Selecione...</option>
                  {templates.filter(t => t.ativo).map(t => <option key={t.id} value={t.id}>{t.titulo}{t.funcao ? ` (${t.funcao})` : ''}</option>)}
                </select>
              </div>
              <div>
                <label className="text-white/60 text-xs mb-1.5 block">Prazo previsto</label>
                <input type="date" value={form.data_prevista || ''} onChange={e => setForm(f => ({ ...f, data_prevista: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className="text-white/60 text-xs mb-1.5 block">Observações</label>
                <textarea value={form.observacoes || ''} onChange={e => setForm(f => ({ ...f, observacoes: e.target.value }))} rows={2} className={inp + ' resize-none'} />
              </div>
            </div>
            <div className="p-6 border-t border-white/10 flex justify-end gap-3">
              <button onClick={() => setModalNova(false)} className="px-4 py-2 rounded-xl text-white/60 hover:text-white hover:bg-white/5 text-sm transition-all">Cancelar</button>
              <button onClick={iniciarOnboarding} disabled={salvando || !form.colaborador_id || !form.template_id}
                className="px-6 py-2 bg-[#7D1F2C] hover:bg-[#9b2535] text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50">
                {salvando ? 'Iniciando...' : 'Iniciar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal template */}
      {modalTemplate !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setModalTemplate(null)}>
          <div className="bg-[#0c0e1a] border border-white/10 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="text-white font-semibold">{modalTemplate === 'novo' ? 'Novo Template' : 'Editar Template'}</h2>
              <button onClick={() => setModalTemplate(null)} className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-all"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-white/60 text-xs mb-1.5 block">Nome do Template</label>
                <input value={templateForm.titulo || ''} onChange={e => setTemplateForm(f => ({ ...f, titulo: e.target.value }))} placeholder="Ex: Onboarding Garçom" className={inp} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-white/60 text-xs mb-1.5 block">Função Alvo</label>
                  <input value={templateForm.funcao || ''} onChange={e => setTemplateForm(f => ({ ...f, funcao: e.target.value }))} placeholder="Ex: Garçom" className={inp} />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-white/60 text-xs">Tarefas do Template</label>
                  <button onClick={() => setTemplateTarefas(t => [...t, { titulo: '', prazo_dias: 1, responsavel: '', ordem: t.length }])}
                    className="flex items-center gap-1 text-xs text-[#D4AF37] hover:text-white transition-all">
                    <Plus className="w-3 h-3" />Adicionar
                  </button>
                </div>
                <div className="space-y-2">
                  {templateTarefas.map((t, i) => (
                    <div key={i} className="flex items-center gap-2 bg-white/5 rounded-xl p-3">
                      <div className="flex-1">
                        <input value={t.titulo || ''} onChange={e => setTemplateTarefas(tt => tt.map((x, j) => j === i ? { ...x, titulo: e.target.value } : x))}
                          placeholder={`Tarefa ${i + 1}`} className="bg-transparent text-white text-sm w-full focus:outline-none placeholder-white/20" />
                        <div className="flex gap-2 mt-1.5">
                          <input value={t.responsavel || ''} onChange={e => setTemplateTarefas(tt => tt.map((x, j) => j === i ? { ...x, responsavel: e.target.value } : x))}
                            placeholder="Responsável" className="bg-transparent text-white/50 text-xs flex-1 focus:outline-none placeholder-white/20" />
                          <input type="number" value={t.prazo_dias || 1} min={1}
                            onChange={e => setTemplateTarefas(tt => tt.map((x, j) => j === i ? { ...x, prazo_dias: parseInt(e.target.value) } : x))}
                            className="bg-transparent text-white/50 text-xs w-16 focus:outline-none" />
                          <span className="text-white/30 text-xs">dias</span>
                        </div>
                      </div>
                      <button onClick={() => setTemplateTarefas(tt => tt.filter((_, j) => j !== i))} className="p-1 hover:bg-red-500/20 rounded text-white/30 hover:text-red-400 transition-all">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-white/10 flex justify-end gap-3">
              <button onClick={() => setModalTemplate(null)} className="px-4 py-2 rounded-xl text-white/60 hover:text-white hover:bg-white/5 text-sm transition-all">Cancelar</button>
              <button onClick={salvarTemplate} disabled={salvando}
                className="px-6 py-2 bg-[#7D1F2C] hover:bg-[#9b2535] text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50">
                {salvando ? 'Salvando...' : 'Salvar Template'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
