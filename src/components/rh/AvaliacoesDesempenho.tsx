import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardCheck, Plus, Star, AlertTriangle, CheckCircle, Clock, X, Search,
  Settings, Bell, Trash2, ChevronDown, ChevronRight, Edit2, GripVertical, Save,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Criterio {
  id: string;
  nome: string;
  descricao: string;
}

interface TipoAvaliacao {
  id: string;
  nome: string;
  descricao: string;
  ativo: boolean;
  criterios: Criterio[];
}

interface ColaboradorAvaliacao {
  colaborador_id: string;
  nome_completo: string;
  funcao_nome: string;
  anos_empresa: number;
  total_avaliacoes: number;
  ultima_avaliacao: string | null;
  situacao: 'nunca_avaliado' | 'atrasado' | 'a_vencer' | 'em_dia';
  intervalo_meses: number;
}

interface Avaliacao {
  id: string;
  colaborador_id: string;
  avaliador: string;
  avaliador_nome?: string;
  tipo: string;
  tipo_id?: string;
  status: string;
  periodo_referencia?: string;
  data_avaliacao: string;
  nota_geral: number;
  resultado: string;
  recomendacao: string;
  pontos_fortes: string;
  pontos_melhoria: string;
  plano_acao: string;
  observacoes: string;
  criterios_notas: { criterio_id: string; criterio_nome: string; nota: number }[];
}

interface Colaborador {
  id: string;
  nome_completo: string;
}

interface ConfigAvaliacoes {
  id: string;
  intervalo_meses: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const RESULTADOS = ['insatisfatorio', 'regular', 'satisfatorio', 'bom', 'excelente'];
const RECOMENDACOES = ['manter', 'capacitar', 'promover', 'advertir', 'demitir'];

const resultadoLabel = (r: string) => ({
  insatisfatorio: 'Insatisfatório', regular: 'Regular', satisfatorio: 'Satisfatório',
  bom: 'Bom', excelente: 'Excelente',
}[r] ?? r);

const recomendacaoLabel = (r: string) => ({
  manter: 'Manter', capacitar: 'Capacitar', promover: 'Promover',
  advertir: 'Advertir', demitir: 'Desligar',
}[r] ?? r);

const situacaoBadge = (s: string) => ({
  nunca_avaliado: { label: 'Nunca avaliado', cls: 'bg-red-500/20 text-red-400 border border-red-500/30' },
  atrasado:       { label: 'Atrasado',        cls: 'bg-orange-500/20 text-orange-400 border border-orange-500/30' },
  a_vencer:       { label: 'A vencer',         cls: 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' },
  em_dia:         { label: 'Em dia',            cls: 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' },
}[s] ?? { label: s, cls: 'bg-white/10 text-white/60' });

const notaCor = (n: number) =>
  n <= 2 ? 'text-red-400' : n === 3 ? 'text-yellow-400' : 'text-emerald-400';
const notaBg = (n: number) =>
  n <= 2 ? 'bg-red-500/10 border-red-500/20' : n === 3 ? 'bg-yellow-500/10 border-yellow-500/20' : 'bg-emerald-500/10 border-emerald-500/20';

const inp = 'w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#7D1F2C]/60 focus:ring-1 focus:ring-[#7D1F2C]/40';
const sel = inp + ' appearance-none';

const calcMedia = (notas: number[]) => {
  const v = notas.filter(n => n > 0);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
};

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AvaliacoesDesempenho() {
  const [aba, setAba] = useState<'devidas' | 'historico' | 'config'>('devidas');
  const [devidas, setDevidas] = useState<ColaboradorAvaliacao[]>([]);
  const [avaliacoes, setAvaliacoes] = useState<Avaliacao[]>([]);
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [tipos, setTipos] = useState<TipoAvaliacao[]>([]);
  const [config, setConfig] = useState<ConfigAvaliacoes | null>(null);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set());
  const [modal, setModal] = useState<{ open: boolean; colaboradorId?: string; avaliacao?: Avaliacao } | null>(null);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    const [{ data: d1 }, { data: d2 }, { data: d3 }, { data: d4 }, { data: d5 }] = await Promise.all([
      supabase.from('vw_avaliacoes_devidas').select('*'),
      supabase.from('rh_avaliacoes').select('*, colaboradores(nome_completo)').order('data_avaliacao', { ascending: false }),
      supabase.from('colaboradores').select('id, nome_completo').eq('status', 'ativo').order('nome_completo'),
      supabase.from('config_avaliacoes').select('*').maybeSingle(),
      supabase.from('rh_avaliacao_tipos').select('*').eq('ativo', true).order('nome'),
    ]);
    setDevidas((d1 ?? []) as ColaboradorAvaliacao[]);
    setAvaliacoes((d2 ?? []).map((a: any) => ({
      ...a,
      criterios_notas: Array.isArray(a.criterios_notas) ? a.criterios_notas : [],
    })) as Avaliacao[]);
    setColaboradores((d3 ?? []) as Colaborador[]);
    if (d4) setConfig(d4 as ConfigAvaliacoes);
    setTipos((d5 ?? []) as TipoAvaliacao[]);
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const toggleExpand = (id: string) =>
    setExpandidos(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const excluir = async (id: string) => {
    if (!confirm('Excluir esta avaliação?')) return;
    await supabase.from('rh_avaliacoes').delete().eq('id', id);
    fetchAll();
  };

  const kpiNunca    = devidas.filter(d => d.situacao === 'nunca_avaliado').length;
  const kpiAtrasado = devidas.filter(d => d.situacao === 'atrasado').length;
  const kpiAVencer  = devidas.filter(d => d.situacao === 'a_vencer').length;
  const alertas     = devidas.filter(d => ['a_vencer', 'atrasado', 'nunca_avaliado'].includes(d.situacao));
  const devidasFiltradas = devidas
    .filter(d => d.nome_completo.toLowerCase().includes(busca.toLowerCase()))
    .filter(d => d.situacao !== 'em_dia');

  const proximaAvaliacao = (d: ColaboradorAvaliacao) =>
    d.ultima_avaliacao ? dayjs(d.ultima_avaliacao).add(d.intervalo_meses, 'month') : null;

  return (
    <div className="space-y-6">
      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Nunca avaliados', val: kpiNunca, icon: <AlertTriangle className="w-6 h-6 text-red-400" />, color: 'red' },
          { label: 'Atrasados', val: kpiAtrasado, icon: <Clock className="w-6 h-6 text-orange-400" />, color: 'orange' },
          { label: 'A vencer em breve', val: kpiAVencer, icon: <Bell className="w-6 h-6 text-yellow-400" />, color: 'yellow' },
          { label: 'Total realizadas', val: avaliacoes.length, icon: <CheckCircle className="w-6 h-6 text-emerald-400" />, color: 'emerald' },
        ].map(({ label, val, icon, color }) => (
          <div key={label} className={`bg-${color}-500/10 border border-${color}-500/20 rounded-xl p-4 flex items-center gap-4`}>
            <div className={`w-12 h-12 rounded-xl bg-${color}-500/20 flex items-center justify-center`}>{icon}</div>
            <div>
              <p className={`text-2xl font-bold text-${color}-400`}>{val}</p>
              <p className="text-sm text-white/60">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Alertas */}
      {alertas.length > 0 && aba !== 'config' && (
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Bell className="w-4 h-4 text-amber-400" />
            <span className="text-amber-300 font-medium text-sm">Alertas de Avaliação</span>
            <span className="text-xs text-amber-300/60 ml-1">— Intervalo: {config?.intervalo_meses ?? 6} meses</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {alertas.slice(0, 8).map(d => {
              const prox = proximaAvaliacao(d);
              const badge = situacaoBadge(d.situacao);
              return (
                <div key={d.colaborador_id} className="flex items-center gap-2 bg-black/20 rounded-lg px-3 py-1.5">
                  <span className="text-white/80 text-xs font-medium">{d.nome_completo.split(' ')[0]}</span>
                  <span className={`text-xs px-1.5 py-0.5 rounded-full ${badge.cls}`}>{badge.label}</span>
                  {prox && <span className="text-white/40 text-xs">próx: {prox.format('MM/YYYY')}</span>}
                  <button onClick={() => setModal({ open: true, colaboradorId: d.colaborador_id })}
                    className="text-xs text-[#7D1F2C] hover:text-red-400 font-medium">Avaliar</button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Abas */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex gap-2">
          {([['devidas', 'Pendentes'], ['historico', 'Histórico'], ['config', 'Configurações']] as const).map(([t, label]) => (
            <button key={t} onClick={() => setAba(t)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${aba === t ? 'bg-[#7D1F2C] text-white' : 'bg-white/5 text-white/60 hover:text-white hover:bg-white/10'}`}>
              {t === 'config' && <Settings className="w-3.5 h-3.5" />}
              {label}
              {t === 'devidas' && devidasFiltradas.length > 0 && (
                <span className="bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">{devidasFiltradas.length}</span>
              )}
            </button>
          ))}
        </div>
        {aba !== 'config' && (
          <div className="flex gap-2 items-center">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
              <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar colaborador..."
                className="bg-white/5 border border-white/15 rounded-xl pl-9 pr-4 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-[#7D1F2C]/60 w-56" />
            </div>
            <button onClick={() => setModal({ open: true })}
              className="flex items-center gap-2 px-4 py-2 bg-[#7D1F2C] hover:bg-[#9b2535] text-white rounded-xl text-sm font-medium transition-all">
              <Plus className="w-4 h-4" /> Nova Avaliação
            </button>
          </div>
        )}
      </div>

      {/* Conteúdo */}
      {loading ? (
        <div className="text-center py-12 text-white/40">Carregando...</div>
      ) : aba === 'config' ? (
        <ConfigPanel config={config} tipos={tipos} onRefresh={fetchAll} />
      ) : aba === 'devidas' ? (
        <div className="space-y-2">
          {devidasFiltradas.length === 0 ? (
            <div className="text-center py-12 text-white/40">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>Nenhuma avaliação pendente.</p>
            </div>
          ) : devidasFiltradas.map(d => {
            const badge = situacaoBadge(d.situacao);
            const prox = proximaAvaliacao(d);
            return (
              <div key={d.colaborador_id} className="bg-white/5 border border-white/10 rounded-xl px-5 py-4 flex items-center justify-between hover:bg-white/[0.08] transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-[#7D1F2C]/30 flex items-center justify-center text-white font-semibold text-sm">
                    {d.nome_completo.split(' ').map((n: string) => n[0]).join('').substring(0, 2)}
                  </div>
                  <div>
                    <p className="text-white font-medium">{d.nome_completo}</p>
                    <p className="text-white/50 text-xs">
                      {d.funcao_nome} · {d.anos_empresa ?? 0} ano(s)
                      {prox && <span className="ml-2 text-white/30">próxima: {prox.format('MM/YYYY')}</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${badge.cls}`}>{badge.label}</span>
                  {d.ultima_avaliacao && <span className="text-white/40 text-xs">Última: {dayjs(d.ultima_avaliacao).format('DD/MM/YYYY')}</span>}
                  <button onClick={() => setModal({ open: true, colaboradorId: d.colaborador_id })}
                    className="flex items-center gap-1 px-3 py-1.5 bg-[#7D1F2C]/30 hover:bg-[#7D1F2C]/60 text-white/80 hover:text-white rounded-lg text-xs font-medium transition-all">
                    <Plus className="w-3 h-3" /> Avaliar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Histórico */
        <div className="space-y-2">
          {avaliacoes.filter(a => {
            const nome = (a as any).colaboradores?.nome_completo ?? '';
            return nome.toLowerCase().includes(busca.toLowerCase());
          }).map(a => {
            const media = a.nota_geral || calcMedia(a.criterios_notas.map(c => c.nota));
            const expanded = expandidos.has(a.id);
            return (
              <div key={a.id} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden transition-all">
                <div className="px-5 py-4 flex items-center justify-between cursor-pointer hover:bg-white/[0.04]" onClick={() => toggleExpand(a.id)}>
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 rounded-full bg-[#7D1F2C]/30 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                      {((a as any).colaboradores?.nome_completo ?? '?').split(' ').map((n: string) => n[0]).join('').substring(0, 2)}
                    </div>
                    <div>
                      <p className="text-white font-medium">{(a as any).colaboradores?.nome_completo}</p>
                      <p className="text-white/50 text-xs flex flex-wrap gap-x-2">
                        <span className="text-white/70 font-medium">{a.tipo}</span>
                        {a.periodo_referencia && <span>{a.periodo_referencia}</span>}
                        <span>{dayjs(a.data_avaliacao).format('DD/MM/YYYY')}</span>
                        {a.avaliador && <span className="text-white/30">por {a.avaliador}</span>}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {media > 0 && (
                      <div className="text-center">
                        <p className={`text-xl font-bold ${notaCor(media)}`}>{media.toFixed(1)}</p>
                        <p className="text-white/40 text-xs">média</p>
                      </div>
                    )}
                    <span className="text-xs px-2 py-1 rounded-full bg-white/10 text-white/60">{resultadoLabel(a.resultado)}</span>
                    <span className="text-xs px-2 py-1 rounded-full bg-white/5 text-white/40">{recomendacaoLabel(a.recomendacao)}</span>
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                      <button onClick={() => setModal({ open: true, avaliacao: a, colaboradorId: a.colaborador_id })}
                        className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-all" title="Editar">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => excluir(a.id)}
                        className="p-2 hover:bg-red-500/20 rounded-lg text-white/50 hover:text-red-400 transition-all" title="Excluir">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    {expanded ? <ChevronDown className="w-4 h-4 text-white/30" /> : <ChevronRight className="w-4 h-4 text-white/30" />}
                  </div>
                </div>

                {expanded && (
                  <div className="border-t border-white/8 px-5 py-4 bg-black/20 space-y-4">
                    {/* Critérios com notas */}
                    {a.criterios_notas.length > 0 ? (
                      <>
                        <p className="text-white/40 text-xs uppercase tracking-wide font-medium">Critérios Avaliados</p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                          {a.criterios_notas.map(c => (
                            <div key={c.criterio_id} className={`rounded-lg border px-3 py-2.5 ${notaBg(c.nota)}`}>
                              <p className="text-white/60 text-xs mb-1.5">{c.criterio_nome}</p>
                              <div className="flex items-center gap-2">
                                <div className="flex gap-0.5">
                                  {[1,2,3,4,5].map(i => (
                                    <Star key={i} className={`w-3.5 h-3.5 ${i <= c.nota ? notaCor(c.nota) + ' fill-current' : 'text-white/15'}`} />
                                  ))}
                                </div>
                                <span className={`text-sm font-bold ${notaCor(c.nota)}`}>{c.nota}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    ) : (
                      <p className="text-white/30 text-sm">Nenhum critério registrado nesta avaliação.</p>
                    )}

                    {/* Textos qualitativos */}
                    {(a.pontos_fortes || a.pontos_melhoria || a.plano_acao) && (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        {a.pontos_fortes && (
                          <div className="bg-emerald-500/5 border border-emerald-500/15 rounded-lg px-3 py-2.5">
                            <p className="text-emerald-400 text-xs font-medium mb-1">Pontos Fortes</p>
                            <p className="text-white/70 text-xs leading-relaxed">{a.pontos_fortes}</p>
                          </div>
                        )}
                        {a.pontos_melhoria && (
                          <div className="bg-yellow-500/5 border border-yellow-500/15 rounded-lg px-3 py-2.5">
                            <p className="text-yellow-400 text-xs font-medium mb-1">Pontos de Melhoria</p>
                            <p className="text-white/70 text-xs leading-relaxed">{a.pontos_melhoria}</p>
                          </div>
                        )}
                        {a.plano_acao && (
                          <div className="bg-blue-500/5 border border-blue-500/15 rounded-lg px-3 py-2.5">
                            <p className="text-blue-400 text-xs font-medium mb-1">Plano de Ação</p>
                            <p className="text-white/70 text-xs leading-relaxed">{a.plano_acao}</p>
                          </div>
                        )}
                      </div>
                    )}
                    {a.observacoes && (
                      <div className="bg-white/5 rounded-lg px-3 py-2.5">
                        <p className="text-white/40 text-xs font-medium mb-1">Observações</p>
                        <p className="text-white/70 text-xs leading-relaxed">{a.observacoes}</p>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de avaliação */}
      {modal?.open && (
        <ModalAvaliacao
          colaboradorId={modal.colaboradorId}
          avaliacao={modal.avaliacao}
          colaboradores={colaboradores}
          tipos={tipos}
          onClose={() => { setModal(null); fetchAll(); }}
        />
      )}
    </div>
  );
}

// ─── Modal de Avaliação ───────────────────────────────────────────────────────

function ModalAvaliacao({
  colaboradorId, avaliacao, colaboradores, tipos, onClose,
}: {
  colaboradorId?: string;
  avaliacao?: Avaliacao;
  colaboradores: Colaborador[];
  tipos: TipoAvaliacao[];
  onClose: () => void;
}) {
  const tipoInicial = avaliacao?.tipo_id
    ? tipos.find(t => t.id === avaliacao.tipo_id) ?? tipos[0]
    : tipos.find(t => t.nome === avaliacao?.tipo) ?? tipos[0];

  const [colab, setColab]     = useState(avaliacao?.colaborador_id ?? colaboradorId ?? '');
  const [avaliador, setAvaliador] = useState(avaliacao?.avaliador ?? '');
  const [tipoSel, setTipoSel] = useState<TipoAvaliacao | null>(tipoInicial ?? null);
  const [periodo, setPeriodo] = useState(avaliacao?.periodo_referencia ?? dayjs().format('YYYY') + '-S' + (dayjs().month() < 6 ? '1' : '2'));
  const [dataAv, setDataAv]   = useState(avaliacao?.data_avaliacao ?? dayjs().format('YYYY-MM-DD'));
  const [notas, setNotas]     = useState<Record<string, number>>(() => {
    const m: Record<string, number> = {};
    (avaliacao?.criterios_notas ?? []).forEach(c => { m[c.criterio_id] = c.nota; });
    return m;
  });
  const [resultado, setResultado]     = useState(avaliacao?.resultado ?? 'satisfatorio');
  const [recomendacao, setRecomendacao] = useState(avaliacao?.recomendacao ?? 'manter');
  const [fortes, setFortes]     = useState(avaliacao?.pontos_fortes ?? '');
  const [melhoria, setMelhoria] = useState(avaliacao?.pontos_melhoria ?? '');
  const [plano, setPlano]       = useState(avaliacao?.plano_acao ?? '');
  const [obs, setObs]           = useState(avaliacao?.observacoes ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro]         = useState('');

  // Quando muda o tipo, reseta notas
  const mudarTipo = (id: string) => {
    const t = tipos.find(t => t.id === id) ?? null;
    setTipoSel(t);
    setNotas({});
  };

  const criterios = tipoSel?.criterios ?? [];
  const mediaCriterios = calcMedia(criterios.map(c => notas[c.id] || 0));

  const salvar = async () => {
    setErro('');
    if (!colab)     { setErro('Selecione o colaborador.'); return; }
    if (!avaliador) { setErro('Informe o avaliador.'); return; }
    if (!tipoSel)   { setErro('Selecione o tipo de avaliação.'); return; }
    if (criterios.some(c => !notas[c.id])) { setErro('Preencha todos os critérios.'); return; }

    const criteriosNotas = criterios.map(c => ({
      criterio_id: c.id,
      criterio_nome: c.nome,
      nota: notas[c.id] || 0,
    }));

    setSalvando(true);
    try {
      const payload = {
        colaborador_id: colab,
        avaliador,
        tipo: tipoSel.nome,
        tipo_id: tipoSel.id,
        status: 'concluida',
        periodo_referencia: periodo || null,
        data_avaliacao: dataAv,
        nota_geral: Math.round(mediaCriterios * 10) / 10,
        resultado,
        recomendacao,
        pontos_fortes: fortes || null,
        pontos_melhoria: melhoria || null,
        plano_acao: plano || null,
        observacoes: obs || null,
        criterios_notas: criteriosNotas,
      };

      if (avaliacao?.id) {
        const { error } = await supabase.from('rh_avaliacoes').update(payload).eq('id', avaliacao.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('rh_avaliacoes').insert(payload);
        if (error) throw error;
      }
      onClose();
    } catch (e: any) {
      setErro(e.message || 'Erro ao salvar avaliação.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0c0e1a] border border-white/10 rounded-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-white/10 sticky top-0 bg-[#0c0e1a] z-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#7D1F2C]/30 flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-[#7D1F2C]" />
            </div>
            <div>
              <h2 className="text-white font-semibold">{avaliacao ? 'Editar Avaliação' : 'Nova Avaliação de Desempenho'}</h2>
              <p className="text-white/40 text-xs">Preencha todos os critérios do tipo selecionado</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-all">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {erro && (
            <div className="p-3 bg-red-900/30 border border-red-500/30 rounded-xl text-red-300 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {erro}
            </div>
          )}

          {/* Dados básicos */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-white/60 text-xs mb-1.5 block">Colaborador *</label>
              <select value={colab} onChange={e => setColab(e.target.value)} className={sel}>
                <option value="">Selecione...</option>
                {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
              </select>
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1.5 block">Avaliador *</label>
              <input value={avaliador} onChange={e => setAvaliador(e.target.value)} placeholder="Nome do avaliador" className={inp} />
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1.5 block">Tipo de Avaliação *</label>
              <select value={tipoSel?.id ?? ''} onChange={e => mudarTipo(e.target.value)} className={sel}>
                <option value="">Selecione...</option>
                {tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1.5 block">Período de Referência</label>
              <input value={periodo} onChange={e => setPeriodo(e.target.value)} placeholder="ex: 2026-S1" className={inp} />
            </div>
            <div className="col-span-2">
              <label className="text-white/60 text-xs mb-1.5 block">Data da Avaliação *</label>
              <input type="date" value={dataAv} onChange={e => setDataAv(e.target.value)} className={inp + ' max-w-xs'} />
            </div>
          </div>

          {/* Descrição do tipo selecionado */}
          {tipoSel?.descricao && (
            <div className="bg-white/5 border border-white/10 rounded-xl px-4 py-3">
              <p className="text-white/40 text-xs uppercase tracking-wide mb-1">Sobre este tipo</p>
              <p className="text-white/70 text-sm">{tipoSel.descricao}</p>
            </div>
          )}

          {/* Critérios do tipo */}
          {criterios.length > 0 ? (
            <div>
              <p className="text-white/60 text-xs mb-3 font-medium uppercase tracking-wide">
                Critérios de Avaliação — {tipoSel?.nome} ({criterios.length} critérios)
              </p>
              <div className="space-y-4">
                {criterios.map(c => (
                  <div key={c.id} className="bg-white/3 border border-white/8 rounded-xl p-4">
                    <div className="flex items-start justify-between gap-4 mb-3">
                      <div>
                        <p className="text-white font-medium text-sm">{c.nome}</p>
                        {c.descricao && <p className="text-white/50 text-xs mt-0.5">{c.descricao}</p>}
                      </div>
                      {notas[c.id] > 0 && (
                        <span className={`text-lg font-bold shrink-0 ${notaCor(notas[c.id])}`}>{notas[c.id]}/5</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {[1, 2, 3, 4, 5].map(i => {
                        const ativo = i <= (notas[c.id] || 0);
                        const cor = notas[c.id] <= 2 ? 'fill-red-400 text-red-400' : notas[c.id] === 3 ? 'fill-yellow-400 text-yellow-400' : 'fill-emerald-400 text-emerald-400';
                        return (
                          <button key={i} onClick={() => setNotas(n => ({ ...n, [c.id]: i }))}
                            className="transition-transform hover:scale-110 active:scale-95">
                            <Star className={`w-8 h-8 ${ativo ? cor : 'text-white/20 hover:text-white/40'}`} />
                          </button>
                        );
                      })}
                      {notas[c.id] > 0 && (
                        <button onClick={() => setNotas(n => { const m = { ...n }; delete m[c.id]; return m; })}
                          className="ml-2 text-white/30 hover:text-red-400 text-xs self-center transition-colors">
                          limpar
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Média calculada */}
              {criterios.every(c => notas[c.id]) && (
                <div className="mt-3 p-4 bg-white/5 rounded-xl flex items-center justify-between border border-white/10">
                  <span className="text-white/60 text-sm">Média Geral</span>
                  <span className={`text-2xl font-bold ${notaCor(mediaCriterios)}`}>{mediaCriterios.toFixed(2)}</span>
                </div>
              )}
            </div>
          ) : tipoSel ? (
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-amber-300 text-sm">
              Este tipo de avaliação não tem critérios definidos. Acesse Configurações para adicionar critérios.
            </div>
          ) : null}

          {/* Resultado e recomendação */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-white/60 text-xs mb-1.5 block">Resultado</label>
              <select value={resultado} onChange={e => setResultado(e.target.value)} className={sel}>
                {RESULTADOS.map(r => <option key={r} value={r}>{resultadoLabel(r)}</option>)}
              </select>
            </div>
            <div>
              <label className="text-white/60 text-xs mb-1.5 block">Recomendação</label>
              <select value={recomendacao} onChange={e => setRecomendacao(e.target.value)} className={sel}>
                {RECOMENDACOES.map(r => <option key={r} value={r}>{recomendacaoLabel(r)}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="text-white/60 text-xs mb-1.5 block">Pontos Fortes</label>
            <textarea value={fortes} onChange={e => setFortes(e.target.value)} rows={2}
              className={inp + ' resize-none'} placeholder="Descreva os pontos fortes observados..." />
          </div>
          <div>
            <label className="text-white/60 text-xs mb-1.5 block">Pontos de Melhoria</label>
            <textarea value={melhoria} onChange={e => setMelhoria(e.target.value)} rows={2}
              className={inp + ' resize-none'} placeholder="O que precisa melhorar..." />
          </div>
          <div>
            <label className="text-white/60 text-xs mb-1.5 block">Plano de Ação</label>
            <textarea value={plano} onChange={e => setPlano(e.target.value)} rows={2}
              className={inp + ' resize-none'} placeholder="Ações recomendadas..." />
          </div>
          <div>
            <label className="text-white/60 text-xs mb-1.5 block">Observações</label>
            <textarea value={obs} onChange={e => setObs(e.target.value)} rows={2}
              className={inp + ' resize-none'} placeholder="Observações gerais..." />
          </div>
        </div>

        <div className="p-6 border-t border-white/10 flex justify-end gap-3 sticky bottom-0 bg-[#0c0e1a]">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-white/60 hover:text-white hover:bg-white/5 text-sm transition-all">
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando}
            className="px-6 py-2 bg-[#7D1F2C] hover:bg-[#9b2535] text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50">
            {salvando ? 'Salvando...' : 'Salvar Avaliação'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Painel de Configurações ──────────────────────────────────────────────────

function ConfigPanel({ config, tipos, onRefresh }: {
  config: ConfigAvaliacoes | null;
  tipos: TipoAvaliacao[];
  onRefresh: () => void;
}) {
  const [intervalo, setIntervalo] = useState(config?.intervalo_meses ?? 6);
  const [salvandoConfig, setSalvandoConfig] = useState(false);
  const [editandoTipo, setEditandoTipo] = useState<TipoAvaliacao | null>(null);
  const [criandoTipo, setCriandoTipo] = useState(false);

  const salvarIntervalo = async () => {
    setSalvandoConfig(true);
    try {
      if (config?.id) {
        const { error } = await supabase.from('config_avaliacoes').update({ intervalo_meses: intervalo, atualizado_em: new Date().toISOString() }).eq('id', config.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('config_avaliacoes').insert({ intervalo_meses: intervalo });
        if (error) throw error;
      }
      onRefresh();
      alert('Intervalo salvo com sucesso!');
    } catch (e: any) {
      alert('Erro ao salvar: ' + e.message);
    } finally {
      setSalvandoConfig(false);
    }
  };

  const excluirTipo = async (id: string) => {
    if (!confirm('Excluir este tipo de avaliação?')) return;
    await supabase.from('rh_avaliacao_tipos').delete().eq('id', id);
    onRefresh();
  };

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Intervalo */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-1">Intervalo entre Avaliações</h3>
        <p className="text-white/40 text-sm mb-4">De quantos em quantos meses cada colaborador deve ser avaliado.</p>
        <div className="flex items-center gap-4">
          <input type="number" min={1} max={24} value={intervalo}
            onChange={e => setIntervalo(parseInt(e.target.value) || 6)}
            className="bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#7D1F2C]/60 w-24" />
          <span className="text-white/60 text-sm">meses</span>
          <button onClick={salvarIntervalo} disabled={salvandoConfig}
            className="flex items-center gap-2 px-4 py-2 bg-[#7D1F2C] hover:bg-[#9b2535] text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50">
            <Save className="w-4 h-4" />
            {salvandoConfig ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      </div>

      {/* Tipos de avaliação */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-white font-semibold">Tipos de Avaliação</h3>
            <p className="text-white/40 text-sm mt-0.5">Defina os tipos e os critérios de cada um.</p>
          </div>
          <button onClick={() => setCriandoTipo(true)}
            className="flex items-center gap-2 px-4 py-2 bg-[#7D1F2C] hover:bg-[#9b2535] text-white rounded-xl text-sm font-medium transition-all">
            <Plus className="w-4 h-4" /> Novo Tipo
          </button>
        </div>

        <div className="space-y-3">
          {tipos.map(t => (
            <div key={t.id} className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
              <div className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">{t.nome}</p>
                  {t.descricao && <p className="text-white/40 text-xs mt-0.5">{t.descricao}</p>}
                  <p className="text-white/30 text-xs mt-1">{t.criterios.length} critério(s)</p>
                </div>
                <div className="flex gap-1">
                  <button onClick={() => setEditandoTipo(t)}
                    className="p-2 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-all" title="Editar">
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => excluirTipo(t.id)}
                    className="p-2 hover:bg-red-500/20 rounded-lg text-white/50 hover:text-red-400 transition-all" title="Excluir">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              {t.criterios.length > 0 && (
                <div className="px-4 pb-3 flex flex-wrap gap-2">
                  {t.criterios.map(c => (
                    <span key={c.id} className="text-xs bg-white/8 text-white/60 px-2 py-1 rounded-lg">{c.nome}</span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Modal editar/criar tipo */}
      {(editandoTipo || criandoTipo) && (
        <ModalTipo
          tipo={editandoTipo ?? undefined}
          onClose={() => { setEditandoTipo(null); setCriandoTipo(false); onRefresh(); }}
        />
      )}
    </div>
  );
}

// ─── Modal de Tipo de Avaliação ───────────────────────────────────────────────

function ModalTipo({ tipo, onClose }: { tipo?: TipoAvaliacao; onClose: () => void }) {
  const [nome, setNome]     = useState(tipo?.nome ?? '');
  const [desc, setDesc]     = useState(tipo?.descricao ?? '');
  const [criterios, setCriterios] = useState<Criterio[]>(tipo?.criterios ?? []);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro]     = useState('');

  const addCriterio = () =>
    setCriterios(c => [...c, { id: `c_${Date.now()}`, nome: '', descricao: '' }]);

  const updCriterio = (idx: number, field: keyof Criterio, val: string) =>
    setCriterios(c => c.map((cr, i) => i === idx ? { ...cr, [field]: val } : cr));

  const delCriterio = (idx: number) =>
    setCriterios(c => c.filter((_, i) => i !== idx));

  const salvar = async () => {
    setErro('');
    if (!nome.trim()) { setErro('Informe o nome do tipo.'); return; }
    if (criterios.some(c => !c.nome.trim())) { setErro('Preencha o nome de todos os critérios.'); return; }
    setSalvando(true);
    try {
      const payload = {
        nome: nome.trim(),
        descricao: desc.trim() || null,
        criterios: criterios.map(c => ({ ...c, nome: c.nome.trim(), descricao: c.descricao.trim() })),
        atualizado_em: new Date().toISOString(),
      };
      if (tipo?.id) {
        const { error } = await supabase.from('rh_avaliacao_tipos').update(payload).eq('id', tipo.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('rh_avaliacao_tipos').insert({ ...payload, ativo: true });
        if (error) throw error;
      }
      onClose();
    } catch (e: any) {
      setErro(e.message || 'Erro ao salvar.');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-[#0c0e1a] border border-white/10 rounded-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <h2 className="text-white font-semibold">{tipo ? 'Editar Tipo de Avaliação' : 'Novo Tipo de Avaliação'}</h2>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-all">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {erro && (
            <div className="p-3 bg-red-900/30 border border-red-500/30 rounded-xl text-red-300 text-sm flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" /> {erro}
            </div>
          )}

          <div>
            <label className="text-white/60 text-xs mb-1.5 block">Nome do Tipo *</label>
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex: Desempenho Geral, Técnica, 360 Graus..."
              className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#7D1F2C]/60" />
          </div>
          <div>
            <label className="text-white/60 text-xs mb-1.5 block">Descrição</label>
            <textarea value={desc} onChange={e => setDesc(e.target.value)} rows={2} placeholder="Descreva o objetivo deste tipo de avaliação..."
              className="w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#7D1F2C]/60 resize-none" />
          </div>

          {/* Critérios */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-white/60 text-xs font-medium uppercase tracking-wide">
                Critérios de Avaliação ({criterios.length})
              </label>
              <button onClick={addCriterio}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/15 text-white rounded-lg text-xs transition-all">
                <Plus className="w-3.5 h-3.5" /> Adicionar Critério
              </button>
            </div>

            {criterios.length === 0 ? (
              <div className="text-center py-6 text-white/30 text-sm border border-dashed border-white/10 rounded-xl">
                Nenhum critério adicionado ainda.
                <br />
                <button onClick={addCriterio} className="text-[#7D1F2C] hover:text-red-400 mt-1 text-xs">
                  Clique para adicionar o primeiro
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {criterios.map((c, idx) => (
                  <div key={c.id} className="bg-white/5 border border-white/10 rounded-xl p-3">
                    <div className="flex items-start gap-3">
                      <GripVertical className="w-4 h-4 text-white/20 mt-2 shrink-0" />
                      <div className="flex-1 space-y-2">
                        <input
                          value={c.nome}
                          onChange={e => updCriterio(idx, 'nome', e.target.value)}
                          placeholder="Nome do critério *"
                          className="w-full bg-white/5 border border-white/15 rounded-lg px-3 py-1.5 text-white text-sm focus:outline-none focus:border-[#7D1F2C]/60"
                        />
                        <input
                          value={c.descricao}
                          onChange={e => updCriterio(idx, 'descricao', e.target.value)}
                          placeholder="Descrição / o que será avaliado..."
                          className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-white/70 text-xs focus:outline-none focus:border-white/25"
                        />
                      </div>
                      <button onClick={() => delCriterio(idx)}
                        className="p-1.5 hover:bg-red-500/20 rounded-lg text-white/30 hover:text-red-400 transition-all mt-0.5 shrink-0">
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-white/10 flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-white/60 hover:text-white hover:bg-white/5 text-sm transition-all">
            Cancelar
          </button>
          <button onClick={salvar} disabled={salvando}
            className="px-6 py-2 bg-[#7D1F2C] hover:bg-[#9b2535] text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50">
            {salvando ? 'Salvando...' : 'Salvar Tipo'}
          </button>
        </div>
      </div>
    </div>
  );
}
