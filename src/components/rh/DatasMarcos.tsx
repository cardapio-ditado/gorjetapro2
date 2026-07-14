import React, { useState, useEffect } from 'react';
import { CalendarDays, Plus, X, Bell, BellOff, ChevronLeft, ChevronRight } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';

dayjs.locale('pt-br');

interface Marco {
  id: string;
  colaborador_id: string | null;
  nome_completo?: string;
  tipo: string;
  descricao: string;
  data_marco: string;
  notificado: boolean;
  dia_marco?: number;
}

interface Colaborador {
  id: string;
  nome_completo: string;
}

const TIPO_CONFIG = {
  aniversario_empresa: { label: 'Aniversário na Empresa', cls: 'bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/30', dot: 'bg-[#D4AF37]' },
  aniversario_pessoal: { label: 'Aniversário Pessoal', cls: 'bg-pink-500/20 text-pink-400 border-pink-500/30', dot: 'bg-pink-400' },
  avaliacao_devida: { label: 'Avaliação', cls: 'bg-orange-500/20 text-orange-400 border-orange-500/30', dot: 'bg-orange-400' },
  outro: { label: 'Outro', cls: 'bg-white/10 text-white/60 border-white/20', dot: 'bg-white/40' },
};

const tipoCfg = (tipo: string) => TIPO_CONFIG[tipo as keyof typeof TIPO_CONFIG] ?? TIPO_CONFIG.outro;

const inp = 'w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#7D1F2C]/60';
const sel = inp + ' appearance-none';

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const DIAS_SEMANA = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function DatasMarcos() {
  const [marcosMes, setMarcosMes] = useState<Marco[]>([]);
  const [todosMarcos, setTodosMarcos] = useState<Marco[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [loading, setLoading] = useState(true);
  const [mesAtual, setMesAtual] = useState(dayjs());
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState<Record<string, any>>({});
  const [salvando, setSalvando] = useState(false);
  const [diaSel, setDiaSel] = useState<number | null>(null);

  useEffect(() => { fetchAll(); }, [mesAtual]);

  const fetchAll = async () => {
    setLoading(true);
    const mes = mesAtual.month() + 1;
    const [{ data: mm }, { data: todos }, { data: col }] = await Promise.all([
      supabase.from('rh_marcos').select('*, colaboradores(nome_completo)')
        .filter('data_marco', 'gte', mesAtual.startOf('month').format('YYYY-MM-DD'))
        .filter('data_marco', 'lte', mesAtual.endOf('month').format('YYYY-MM-DD'))
        .order('data_marco'),
      supabase.from('rh_marcos').select('*, colaboradores(nome_completo)').order('data_marco'),
      supabase.from('colaboradores').select('id, nome_completo').eq('status', 'ativo').order('nome_completo'),
    ]);
    const mapMes = (list: any[]) => list.map(m => ({
      ...m,
      nome_completo: m.colaboradores?.nome_completo,
      dia_marco: dayjs(m.data_marco).date(),
    }));
    setMarcosMes(mapMes(mm ?? []));
    setTodosMarcos(mapMes(todos ?? []));
    setColaboradores((col ?? []) as Colaborador[]);
    setLoading(false);
  };

  const notificar = async (marco: Marco) => {
    await supabase.from('rh_marcos').update({ notificado: !marco.notificado }).eq('id', marco.id);
    fetchAll();
  };

  const excluir = async (id: string) => {
    if (!confirm('Excluir este marco?')) return;
    await supabase.from('rh_marcos').delete().eq('id', id);
    fetchAll();
  };

  const salvar = async () => {
    if (!form.tipo || !form.data_marco || !form.descricao) return;
    setSalvando(true);
    await supabase.from('rh_marcos').insert({
      colaborador_id: form.colaborador_id || null,
      tipo: form.tipo,
      descricao: form.descricao,
      data_marco: form.data_marco,
      notificado: false,
    });
    setSalvando(false);
    setModal(false);
    fetchAll();
  };

  // Gera os dias do calendário
  const primeiroDia = mesAtual.startOf('month').day();
  const diasNoMes = mesAtual.daysInMonth();
  const diasCalendario: (number | null)[] = [
    ...Array(primeiroDia).fill(null),
    ...Array.from({ length: diasNoMes }, (_, i) => i + 1),
  ];
  while (diasCalendario.length % 7 !== 0) diasCalendario.push(null);

  const marcosNoDia = (dia: number) => marcosMes.filter(m => m.dia_marco === dia);

  const marcosDiaSel = diaSel ? marcosMes.filter(m => m.dia_marco === diaSel) : [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => setMesAtual(m => m.subtract(1, 'month'))} className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-all">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h2 className="text-white font-semibold text-lg capitalize">{mesAtual.format('MMMM [de] YYYY')}</h2>
          <button onClick={() => setMesAtual(m => m.add(1, 'month'))} className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-all">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setMesAtual(dayjs())} className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-lg text-sm transition-all">
            Hoje
          </button>
          <button onClick={() => { setForm({ tipo: 'outro', data_marco: dayjs().format('YYYY-MM-DD'), descricao: '' }); setModal(true); }}
            className="flex items-center gap-2 px-4 py-2 bg-[#7D1F2C] hover:bg-[#9b2535] text-white rounded-xl text-sm font-medium transition-all">
            <Plus className="w-4 h-4" />Novo Marco
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendário */}
        <div className="lg:col-span-2">
          <div className="bg-white/5 border border-white/10 rounded-2xl p-5">
            <div className="grid grid-cols-7 mb-3">
              {DIAS_SEMANA.map(d => (
                <div key={d} className="text-center text-white/30 text-xs font-medium py-2">{d}</div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {diasCalendario.map((dia, idx) => {
                if (!dia) return <div key={idx} className="h-14" />;
                const marcosHoje = marcosNoDia(dia);
                const hoje = dayjs().date() === dia && dayjs().month() === mesAtual.month() && dayjs().year() === mesAtual.year();
                const selecionado = diaSel === dia;
                return (
                  <button key={idx} onClick={() => setDiaSel(d => d === dia ? null : dia)}
                    className={`h-14 rounded-xl flex flex-col items-center justify-start pt-2 transition-all relative ${
                      selecionado ? 'bg-[#7D1F2C] ring-2 ring-[#7D1F2C]/50' :
                      hoje ? 'bg-white/10 ring-1 ring-white/30' :
                      marcosHoje.length > 0 ? 'bg-white/5 hover:bg-white/10' :
                      'hover:bg-white/5'
                    }`}>
                    <span className={`text-sm font-medium ${hoje ? 'text-white' : 'text-white/70'}`}>{dia}</span>
                    {marcosHoje.length > 0 && (
                      <div className="flex gap-0.5 mt-1 flex-wrap justify-center px-1">
                        {marcosHoje.slice(0, 3).map((m, i) => (
                          <div key={i} className={`w-1.5 h-1.5 rounded-full ${tipoCfg(m.tipo).dot}`} />
                        ))}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detalhes do dia selecionado */}
          {diaSel && marcosDiaSel.length > 0 && (
            <div className="mt-4 bg-white/5 border border-white/10 rounded-xl p-4 space-y-2">
              <p className="text-white/50 text-xs mb-3">Marcos em {diaSel} de {mesAtual.format('MMMM')}</p>
              {marcosDiaSel.map(m => {
                const cfg = tipoCfg(m.tipo);
                return (
                  <div key={m.id} className={`flex items-center justify-between p-3 rounded-xl border ${cfg.cls}`}>
                    <div>
                      <p className="text-white font-medium text-sm">{m.nome_completo ?? 'Geral'}</p>
                      <p className="text-sm opacity-80">{m.descricao}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => notificar(m)} className="p-1.5 rounded-lg hover:bg-black/20 transition-all">
                        {m.notificado ? <Bell className="w-4 h-4 opacity-80" /> : <BellOff className="w-4 h-4 opacity-40" />}
                      </button>
                      <button onClick={() => excluir(m.id)} className="p-1.5 rounded-lg hover:bg-black/20 transition-all">
                        <X className="w-4 h-4 opacity-40 hover:opacity-100" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Lista lateral */}
        <div>
          <p className="text-white/50 text-xs mb-3 uppercase tracking-wider">Marcos do Mês</p>
          {loading ? (
            <div className="text-center py-8 text-white/30">Carregando...</div>
          ) : marcosMes.length === 0 ? (
            <div className="text-center py-8 text-white/30">Sem marcos neste mês.</div>
          ) : (
            <div className="space-y-2 max-h-[500px] overflow-y-auto pr-1">
              {marcosMes.map(m => {
                const cfg = tipoCfg(m.tipo);
                return (
                  <div key={m.id} className="bg-white/5 border border-white/10 rounded-xl p-3 hover:bg-white/8 transition-all">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className={`text-xs px-2 py-0.5 rounded-full border ${cfg.cls}`}>{cfg.label}</span>
                          <span className="text-white/30 text-xs">dia {m.dia_marco}</span>
                        </div>
                        <p className="text-white text-sm truncate">{m.nome_completo ?? 'Geral'}</p>
                        <p className="text-white/50 text-xs truncate">{m.descricao}</p>
                      </div>
                      <div className="flex flex-col items-center gap-1">
                        <button onClick={() => notificar(m)} className="p-1.5 hover:bg-white/10 rounded-lg transition-all" title={m.notificado ? 'Notificado' : 'Notificar'}>
                          {m.notificado ? <Bell className="w-3.5 h-3.5 text-[#D4AF37]" /> : <BellOff className="w-3.5 h-3.5 text-white/30" />}
                        </button>
                        <button onClick={() => excluir(m.id)} className="p-1.5 hover:bg-red-500/20 rounded-lg transition-all">
                          <X className="w-3.5 h-3.5 text-white/20 hover:text-red-400" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Legenda */}
          <div className="mt-4 space-y-1.5">
            {Object.entries(TIPO_CONFIG).map(([k, v]) => (
              <div key={k} className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${v.dot}`} />
                <span className="text-white/40 text-xs">{v.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Modal */}
      {modal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={() => setModal(false)}>
          <div className="bg-[#0c0e1a] border border-white/10 rounded-2xl w-full max-w-md shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-white/10">
              <h2 className="text-white font-semibold">Novo Marco</h2>
              <button onClick={() => setModal(false)} className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-all"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-white/60 text-xs mb-1.5 block">Tipo</label>
                <select value={form.tipo || 'outro'} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))} className={sel}>
                  {Object.entries(TIPO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-white/60 text-xs mb-1.5 block">Colaborador (opcional)</label>
                <select value={form.colaborador_id || ''} onChange={e => setForm(f => ({ ...f, colaborador_id: e.target.value }))} className={sel}>
                  <option value="">Nenhum (marco geral)</option>
                  {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
                </select>
              </div>
              <div>
                <label className="text-white/60 text-xs mb-1.5 block">Data</label>
                <input type="date" value={form.data_marco || ''} onChange={e => setForm(f => ({ ...f, data_marco: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className="text-white/60 text-xs mb-1.5 block">Descrição</label>
                <input value={form.descricao || ''} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Ex: 5 anos de empresa" className={inp} />
              </div>
            </div>
            <div className="p-6 border-t border-white/10 flex justify-end gap-3">
              <button onClick={() => setModal(false)} className="px-4 py-2 rounded-xl text-white/60 hover:text-white hover:bg-white/5 text-sm transition-all">Cancelar</button>
              <button onClick={salvar} disabled={salvando || !form.tipo || !form.data_marco || !form.descricao}
                className="px-6 py-2 bg-[#7D1F2C] hover:bg-[#9b2535] text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50">
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
