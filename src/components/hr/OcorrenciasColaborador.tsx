import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Search, AlertTriangle, User, FileText, CheckCircle,
  XCircle, Download, CreditCard as Edit, Trash2, Receipt,
  Printer, Scale, ShieldAlert, Ban, ThumbsUp, Award
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';
import jsPDF from 'jspdf';
import { exportToExcel } from '../../utils/reportGenerator';
import { imprimirReciboVale, type DadosReciboVale } from '../../utils/reciboVale';

// ── Types ─────────────────────────────────────────────────────────────────────

type TipoFinanceiro = 'consumo_bar' | 'consumo' | 'falta' | 'vale' | 'atestado';
type StatusOcorrencia = 'pendente' | 'aprovado' | 'rejeitado' | 'processado';

interface OcorrenciaFinanceira {
  id: string;
  colaborador_id: string;
  colaborador_nome: string;
  data_ocorrencia: string;
  tipo_ocorrencia: TipoFinanceiro;
  descricao: string;
  valor_vale: number;
  dias_afastamento: number;
  documento_anexo?: string;
  status: StatusOcorrencia;
  aprovado_por?: string;
  data_aprovacao?: string;
  observacoes_aprovacao?: string;
  impacta_folha: boolean;
  criado_em: string;
}

// Disciplinar types (mirrors rh_disciplinar table)
interface RegistroDisciplinar {
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

// ── Constants ─────────────────────────────────────────────────────────────────

const TIPOS_FINANCEIROS: { value: TipoFinanceiro; label: string; color: string }[] = [
  { value: 'consumo_bar', label: 'Consumo no Bar', color: 'bg-amber-500/20 text-amber-300' },
  { value: 'consumo',     label: 'Consumo no Bar', color: 'bg-amber-500/20 text-amber-300' },
  { value: 'falta',       label: 'Falta',          color: 'bg-red-500/20 text-red-300' },
  { value: 'vale',        label: 'Vale',            color: 'bg-green-500/20 text-green-300' },
  { value: 'atestado',    label: 'Atestado',        color: 'bg-blue-500/20 text-blue-300' },
];

const TIPOS_DISCIPLINARES = [
  { key: 'advertencia_verbal',  label: 'Advertência Verbal',  cls: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30' },
  { key: 'advertencia_escrita', label: 'Advertência Escrita', cls: 'bg-orange-500/20 text-orange-400 border-orange-500/30' },
  { key: 'suspensao',           label: 'Suspensão',           cls: 'bg-red-500/20 text-red-400 border-red-500/30' },
  { key: 'justa_causa',         label: 'Justa Causa',         cls: 'bg-red-900/30 text-red-300 border-red-800/50' },
  { key: 'elogio',              label: 'Elogio',              cls: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' },
  { key: 'reconhecimento',      label: 'Reconhecimento',      cls: 'bg-blue-500/20 text-blue-400 border-blue-500/30' },
  { key: 'premio',              label: 'Prêmio',              cls: 'bg-[#D4AF37]/20 text-[#D4AF37] border-[#D4AF37]/30' },
];

const inp = 'w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#7D1F2C]/60 focus:ring-1 focus:ring-[#7D1F2C]/40';
const sel = inp + ' appearance-none';

const tipoFinColor = (tipo: string) =>
  TIPOS_FINANCEIROS.find(t => t.value === tipo)?.color ?? 'bg-white/10 text-white/70';

const tipoDisCfg = (tipo: string) =>
  TIPOS_DISCIPLINARES.find(t => t.key === tipo) ?? TIPOS_DISCIPLINARES[0];

const statusColor: Record<string, string> = {
  pendente:   'bg-yellow-500/20 text-yellow-300',
  aprovado:   'bg-green-500/20 text-green-300',
  rejeitado:  'bg-red-500/20 text-red-300',
  processado: 'bg-blue-500/20 text-blue-300',
};

const fmtBRL = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v);

const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
               'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

// ── Main component ─────────────────────────────────────────────────────────────

const OcorrenciasColaborador: React.FC = () => {
  const [abaAtiva, setAbaAtiva] = useState<'financeiras' | 'disciplinares'>('financeiras');

  return (
    <div className="space-y-6">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-white/5 p-1 rounded-xl w-fit border border-white/10">
        {[
          { key: 'financeiras',   label: 'Ocorrências Financeiras' },
          { key: 'disciplinares', label: 'Ocorrências Disciplinares' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setAbaAtiva(t.key as any)}
            className={`px-5 py-2 rounded-lg text-sm font-medium transition-all ${
              abaAtiva === t.key
                ? 'bg-[#7D1F2C] text-white shadow'
                : 'text-white/60 hover:text-white hover:bg-white/5'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {abaAtiva === 'financeiras'   && <OcorrenciasFinanceiras />}
      {abaAtiva === 'disciplinares' && <OcorrenciasDisciplinares />}
    </div>
  );
};

// ── Ocorrências Financeiras ────────────────────────────────────────────────────

const EMPTY_FIN = {
  colaborador_id: '',
  data_ocorrencia: dayjs().format('YYYY-MM-DD'),
  tipo_ocorrencia: 'consumo_bar' as TipoFinanceiro,
  descricao: '',
  valor_vale: 0,
  dias_afastamento: 0,
  documento_anexo: '',
  impacta_folha: true,
  observacoes_aprovacao: '',
};

function OcorrenciasFinanceiras() {
  const [subAba, setSubAba] = useState<'lancamentos' | 'relatorio'>('lancamentos');
  const [ocorrencias, setOcorrencias] = useState<OcorrenciaFinanceira[]>([]);
  const [colaboradores, setColaboradores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<OcorrenciaFinanceira | null>(null);
  const [delId, setDelId] = useState<string | null>(null);

  const [busca, setBusca] = useState('');
  const [filtroColab, setFiltroColab] = useState('all');
  const [filtroTipo, setFiltroTipo] = useState('all');
  const [filtroStatus, setFiltroStatus] = useState('all');
  const [mes, setMes] = useState(dayjs().month() + 1);
  const [ano, setAno] = useState(dayjs().year());

  const [form, setForm] = useState({ ...EMPTY_FIN });

  useEffect(() => { fetchColabs(); }, []);
  useEffect(() => { fetchOcorrencias(); }, [filtroColab, filtroTipo, filtroStatus, mes, ano]);

  const fetchColabs = async () => {
    const { data } = await supabase
      .from('vw_colaboradores_completo')
      .select('id, nome_completo, funcao_nome, status')
      .eq('status', 'ativo')
      .order('nome_completo');
    setColaboradores(data || []);
  };

  const fetchOcorrencias = async () => {
    setLoading(true);
    setError(null);
    try {
      let q = supabase
        .from('vw_ocorrencias_detalhadas')
        .select('*')
        .in('tipo_ocorrencia', ['consumo_bar', 'consumo', 'falta', 'vale', 'atestado'])
        .eq('mes_ocorrencia', mes)
        .eq('ano_ocorrencia', ano);

      if (filtroColab !== 'all') q = q.eq('colaborador_id', filtroColab);
      if (filtroTipo !== 'all') {
        if (filtroTipo === 'consumo_bar') {
          q = q.in('tipo_ocorrencia', ['consumo_bar', 'consumo']);
        } else {
          q = q.eq('tipo_ocorrencia', filtroTipo);
        }
      }
      if (filtroStatus !== 'all') q = q.eq('status', filtroStatus);

      const { data, error: err } = await q.order('data_ocorrencia', { ascending: false });
      if (err) throw err;
      setOcorrencias(data || []);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const salvar = async () => {
    if (!form.colaborador_id || !form.data_ocorrencia || !form.descricao)
      return setError('Preencha colaborador, data e descrição.');
    setLoading(true);
    setError(null);
    try {
      const payload = {
        ...form,
        valor_vale: parseFloat(String(form.valor_vale)) || 0,
        dias_afastamento: parseInt(String(form.dias_afastamento)) || 0,
      };
      if (editing) {
        const { error: e } = await supabase.from('ocorrencias_colaborador').update(payload).eq('id', editing.id);
        if (e) throw e;
      } else {
        const { error: e } = await supabase.from('ocorrencias_colaborador').insert([payload]);
        if (e) throw e;
      }
      setShowForm(false);
      setEditing(null);
      setForm({ ...EMPTY_FIN });
      fetchOcorrencias();
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const deletar = async (id: string) => {
    setLoading(true);
    const { error: e } = await supabase.from('ocorrencias_colaborador').delete().eq('id', id);
    if (e) setError(e.message);
    setDelId(null);
    fetchOcorrencias();
    setLoading(false);
  };

  const aprovar = async (id: string) => {
    await supabase.from('ocorrencias_colaborador').update({ status: 'aprovado', data_aprovacao: new Date().toISOString() }).eq('id', id);
    fetchOcorrencias();
  };

  const rejeitar = async (id: string) => {
    await supabase.from('ocorrencias_colaborador').update({ status: 'rejeitado', data_aprovacao: new Date().toISOString() }).eq('id', id);
    fetchOcorrencias();
  };

  const gerarRecibo = (oc: OcorrenciaFinanceira) => {
    const colab = colaboradores.find(c => c.id === oc.colaborador_id);
    if (!colab) return;
    const dados: DadosReciboVale = {
      colaborador: { nome_completo: oc.colaborador_nome, cpf: colab.cpf || 'Não informado', funcao_nome: colab.funcao_nome || '' },
      vale: { numero_recibo: `VALE-${dayjs(oc.data_ocorrencia).format('YYYYMMDD')}-${oc.id.substring(0, 8)}`, valor_vale: oc.valor_vale, data_ocorrencia: oc.data_ocorrencia, descricao: oc.descricao },
      empresa: { nome: 'EMPRESA LTDA', endereco: 'Endereço da Empresa' },
    };
    imprimirReciboVale(dados);
  };

  const exportar = () => {
    if (!ocorrencias.length) return alert('Sem dados para exportar');
    const headers = ['Colaborador','Data','Tipo','Descrição','Valor','Dias Afastamento','Impacta Folha','Status'];
    const rows = ocorrencias.map(o => [
      o.colaborador_nome,
      dayjs(o.data_ocorrencia).format('DD/MM/YYYY'),
      TIPOS_FINANCEIROS.find(t => t.value === o.tipo_ocorrencia)?.label ?? o.tipo_ocorrencia,
      o.descricao,
      o.valor_vale || '',
      o.dias_afastamento || '',
      o.impacta_folha ? 'Sim' : 'Não',
      o.status,
    ]);
    exportToExcel(rows, `ocorrencias-financeiras-${mes}-${ano}`, headers);
  };

  const openForm = (oc?: OcorrenciaFinanceira) => {
    if (oc) {
      setEditing(oc);
      setForm({
        colaborador_id: oc.colaborador_id,
        data_ocorrencia: oc.data_ocorrencia,
        tipo_ocorrencia: oc.tipo_ocorrencia,
        descricao: oc.descricao,
        valor_vale: oc.valor_vale,
        dias_afastamento: oc.dias_afastamento,
        documento_anexo: oc.documento_anexo || '',
        impacta_folha: oc.impacta_folha,
        observacoes_aprovacao: oc.observacoes_aprovacao || '',
      });
    } else {
      setEditing(null);
      setForm({ ...EMPTY_FIN });
    }
    setShowForm(true);
  };

  const filtered = ocorrencias.filter(o =>
    o.colaborador_nome.toLowerCase().includes(busca.toLowerCase()) ||
    o.descricao.toLowerCase().includes(busca.toLowerCase())
  );

  // Indicadores
  const isConsumo = (t: string) => t === 'consumo_bar' || t === 'consumo';
  const totais = {
    total: ocorrencias.length,
    consumo: ocorrencias.filter(o => isConsumo(o.tipo_ocorrencia)).length,
    faltas: ocorrencias.filter(o => o.tipo_ocorrencia === 'falta').length,
    vales: ocorrencias.reduce((s, o) => s + (o.tipo_ocorrencia === 'vale' ? o.valor_vale : 0), 0),
  };

  return (
    <div className="space-y-6">
      {/* Sub-tabs: Lançamentos / Relatório */}
      <div className="flex gap-1 bg-white/5 p-1 rounded-lg w-fit border border-white/10">
        {[
          { key: 'lancamentos', label: 'Lançamentos' },
          { key: 'relatorio',   label: 'Relatório Folha' },
        ].map(t => (
          <button
            key={t.key}
            onClick={() => setSubAba(t.key as any)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
              subAba === t.key
                ? 'bg-white/15 text-white'
                : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subAba === 'lancamentos' && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <p className="text-xs text-white/50 mb-1">Total no Período</p>
              <p className="text-2xl font-bold text-white">{totais.total}</p>
            </div>
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
              <p className="text-xs text-amber-300 mb-1">Consumo Bar</p>
              <p className="text-2xl font-bold text-amber-300">{totais.consumo}</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
              <p className="text-xs text-red-300 mb-1">Faltas</p>
              <p className="text-2xl font-bold text-red-300">{totais.faltas}</p>
            </div>
            <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-4">
              <p className="text-xs text-green-300 mb-1">Total Vales</p>
              <p className="text-2xl font-bold text-green-300">{fmtBRL(totais.vales)}</p>
            </div>
          </div>

          {/* Filtros + ações */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className="grid grid-cols-2 md:grid-cols-7 gap-3">
              <div className="md:col-span-2 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                <input type="text" placeholder="Buscar colaborador..." value={busca}
                  onChange={e => setBusca(e.target.value)}
                  className={inp + ' pl-9'} />
              </div>
              <select value={filtroColab} onChange={e => setFiltroColab(e.target.value)} className={sel}>
                <option value="all">Todos colaboradores</option>
                {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
              </select>
              <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className={sel}>
                <option value="all">Todos os tipos</option>
                <option value="consumo_bar">Consumo no Bar</option>
                <option value="falta">Falta</option>
                <option value="vale">Vale</option>
                <option value="atestado">Atestado</option>
              </select>
              <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)} className={sel}>
                <option value="all">Todos status</option>
                <option value="pendente">Pendente</option>
                <option value="aprovado">Aprovado</option>
                <option value="rejeitado">Rejeitado</option>
                <option value="processado">Processado</option>
              </select>
              <select value={mes} onChange={e => setMes(parseInt(e.target.value))} className={sel}>
                {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
              <select value={ano} onChange={e => setAno(parseInt(e.target.value))} className={sel}>
                {[ano - 1, ano, ano + 1].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={exportar} className="px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white/70 hover:bg-white/10 text-sm flex items-center gap-2">
                <Download className="w-4 h-4" /> Exportar Excel
              </button>
              <button onClick={() => openForm()} className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] text-sm flex items-center gap-2">
                <Plus className="w-4 h-4" /> Nova Ocorrência
              </button>
            </div>
          </div>

          {error && <div className="p-3 bg-red-900/30 text-red-300 rounded-lg border border-red-500/30 text-sm">{error}</div>}

          {/* Tabela */}
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            {loading ? (
              <div className="flex justify-center items-center h-48">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#7D1F2C]" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-white/40">
                <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>Nenhuma ocorrência encontrada</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      {['Colaborador','Data','Tipo','Descrição','Valor / Dias','Status','Ações'].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {filtered.map(oc => (
                      <tr key={oc.id} className="hover:bg-white/5">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <User className="w-4 h-4 text-white/20" />
                            <span className="text-white font-medium">{oc.colaborador_nome}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">{dayjs(oc.data_ocorrencia).format('DD/MM/YYYY')}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${tipoFinColor(oc.tipo_ocorrencia)}`}>
                            {TIPOS_FINANCEIROS.find(t => t.value === oc.tipo_ocorrencia)?.label ?? oc.tipo_ocorrencia}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-white/70 max-w-xs truncate">{oc.descricao}</td>
                        <td className="px-4 py-3 text-white/70 whitespace-nowrap">
                          {oc.valor_vale > 0 && <div className="text-green-300">{fmtBRL(oc.valor_vale)}</div>}
                          {oc.dias_afastamento > 0 && <div>{oc.dias_afastamento}d</div>}
                          {!oc.valor_vale && !oc.dias_afastamento && '—'}
                        </td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor[oc.status] ?? 'bg-white/10 text-white/70'}`}>
                            {oc.status}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            {oc.status === 'pendente' && (
                              <>
                                <button onClick={() => aprovar(oc.id)} title="Aprovar" className="p-1 text-green-400 hover:bg-green-500/10 rounded">
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                                <button onClick={() => rejeitar(oc.id)} title="Rejeitar" className="p-1 text-red-400 hover:bg-red-500/10 rounded">
                                  <XCircle className="w-4 h-4" />
                                </button>
                              </>
                            )}
                            {oc.tipo_ocorrencia === 'vale' && oc.valor_vale > 0 && (
                              <button onClick={() => gerarRecibo(oc)} title="Recibo" className="p-1 text-blue-400 hover:bg-blue-500/10 rounded">
                                <Receipt className="w-4 h-4" />
                              </button>
                            )}
                            <button onClick={() => openForm(oc)} title="Editar" className="p-1 text-white/50 hover:text-white hover:bg-white/10 rounded">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => setDelId(oc.id)} title="Excluir" className="p-1 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {subAba === 'relatorio' && (
        <RelatorioFolha colaboradores={colaboradores} />
      )}

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1020] border border-white/10 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-white mb-5">
              {editing ? 'Editar Ocorrência Financeira' : 'Nova Ocorrência Financeira'}
            </h3>
            {error && <div className="mb-4 p-3 bg-red-900/30 text-red-300 rounded-lg text-sm">{error}</div>}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1 uppercase">Colaborador *</label>
                <select value={form.colaborador_id} onChange={e => setForm(f => ({ ...f, colaborador_id: e.target.value }))} className={sel}>
                  <option value="">Selecione...</option>
                  {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1 uppercase">Data *</label>
                  <input type="date" value={form.data_ocorrencia} onChange={e => setForm(f => ({ ...f, data_ocorrencia: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1 uppercase">Tipo *</label>
                  <select value={form.tipo_ocorrencia} onChange={e => setForm(f => ({ ...f, tipo_ocorrencia: e.target.value as TipoFinanceiro }))} className={sel}>
                    {TIPOS_FINANCEIROS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-white/60 mb-1 uppercase">Descrição *</label>
                <textarea rows={3} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))}
                  placeholder="Descreva a ocorrência..." className={inp} />
              </div>
              {(form.tipo_ocorrencia === 'vale' || isConsumo(form.tipo_ocorrencia)) && (
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1 uppercase">
                    {isConsumo(form.tipo_ocorrencia) ? 'Valor do Consumo (R$)' : 'Valor do Vale (R$)'}
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm font-medium">R$</span>
                    <input
                      type="number" step="0.01" min="0"
                      value={form.valor_vale || ''}
                      onChange={e => setForm(f => ({ ...f, valor_vale: parseFloat(e.target.value) || 0 }))}
                      placeholder="0,00"
                      className={inp + ' pl-9'}
                    />
                  </div>
                  {isConsumo(form.tipo_ocorrencia) && (
                    <p className="text-xs text-amber-300/70 mt-1">Este valor será descontado na gorjeta/comissão do colaborador.</p>
                  )}
                </div>
              )}
              {(form.tipo_ocorrencia === 'falta' || form.tipo_ocorrencia === 'atestado') && (
                <div>
                  <label className="block text-xs font-medium text-white/60 mb-1 uppercase">Dias de Afastamento</label>
                  <input type="number" min="0" value={form.dias_afastamento}
                    onChange={e => setForm(f => ({ ...f, dias_afastamento: parseInt(e.target.value) || 0 }))} className={inp} />
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.impacta_folha} onChange={e => setForm(f => ({ ...f, impacta_folha: e.target.checked }))}
                  className="rounded border-white/20 text-[#7D1F2C] focus:ring-[#7D1F2C]" />
                <span className="text-sm text-white/70">Impacta na folha de pagamento</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => { setShowForm(false); setError(null); }} className="px-4 py-2 border border-white/20 rounded-lg text-white/70 hover:bg-white/5">Cancelar</button>
              <button onClick={salvar} disabled={loading} className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] disabled:opacity-50">
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {delId && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1020] border border-white/10 rounded-xl p-6 max-w-sm w-full">
            <h3 className="text-white font-semibold mb-3">Confirmar exclusão</h3>
            <p className="text-white/50 text-sm mb-5">Tem certeza? Esta ação não pode ser desfeita.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setDelId(null)} className="px-4 py-2 border border-white/20 rounded-lg text-white/70 hover:bg-white/5">Cancelar</button>
              <button onClick={() => deletar(delId)} disabled={loading} className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50">
                {loading ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Relatório Folha ───────────────────────────────────────────────────────────

const tipoLabel = (t: string) =>
  TIPOS_FINANCEIROS.find(x => x.value === t)?.label ?? t;

function gerarPDF(dados: any[], periodoLabel: string) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const PW = 297; // landscape width
  const ML = 14;  // margin left
  const MR = 14;  // margin right
  const CW = PW - ML - MR;

  const isConsumo = (t: string) => t === 'consumo_bar' || t === 'consumo';

  // Group by employee
  const agrupado: Record<string, { nome: string; itens: any[] }> = {};
  for (const o of dados) {
    if (!agrupado[o.colaborador_id])
      agrupado[o.colaborador_id] = { nome: o.colaborador_nome, itens: [] };
    agrupado[o.colaborador_id].itens.push(o);
  }

  const totalVales = dados.filter(o => o.tipo_ocorrencia === 'vale').reduce((s, o) => s + (o.valor_vale || 0), 0);
  const totalFaltas = dados.filter(o => o.tipo_ocorrencia === 'falta').length;
  const totalAtestados = dados.filter(o => o.tipo_ocorrencia === 'atestado').length;
  const totalConsumo = dados.filter(o => isConsumo(o.tipo_ocorrencia)).length;

  let y = 14;

  const drawPageHeader = () => {
    // Dark header bar
    doc.setFillColor(125, 31, 44);
    doc.rect(0, 0, PW, 22, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.setTextColor(255, 255, 255);
    doc.text('RELATÓRIO DE OCORRÊNCIAS FINANCEIRAS', ML, 10);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(220, 180, 180);
    doc.text(`Período: ${periodoLabel}   |   Gerado em: ${dayjs().format('DD/MM/YYYY HH:mm')}   |   ${dados.length} ocorrência(s)   |   ${Object.keys(agrupado).length} colaborador(es)`, ML, 17);
    y = 28;
  };

  const checkPageBreak = (neededHeight: number) => {
    if (y + neededHeight > 195) {
      doc.addPage();
      drawPageHeader();
    }
  };

  // Column widths (landscape A4 = 269 usable)
  const cols = { data: 28, tipo: 38, descricao: 100, valor: 32, dias: 22, status: 26 };

  const drawTableHeader = () => {
    doc.setFillColor(245, 245, 245);
    doc.rect(ML, y, CW, 7, 'F');
    doc.setDrawColor(210, 210, 210);
    doc.rect(ML, y, CW, 7, 'S');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(80, 80, 80);
    let x = ML + 2;
    doc.text('DATA', x, y + 4.8); x += cols.data;
    doc.text('TIPO', x, y + 4.8); x += cols.tipo;
    doc.text('DESCRIÇÃO', x, y + 4.8); x += cols.descricao;
    doc.text('VALOR (R$)', x, y + 4.8); x += cols.valor;
    doc.text('DIAS', x, y + 4.8); x += cols.dias;
    doc.text('STATUS', x, y + 4.8);
    y += 7;
  };

  drawPageHeader();

  // Summary boxes
  const boxW = 45;
  const boxes = [
    { label: 'Total de Registros', value: String(dados.length),         bg: [240,240,240] as [number,number,number], fg: [30,30,30] as [number,number,number] },
    { label: 'Consumo no Bar',     value: String(totalConsumo),          bg: [255,248,235] as [number,number,number], fg: [120,80,0] as [number,number,number] },
    { label: 'Faltas',             value: String(totalFaltas),           bg: [255,240,240] as [number,number,number], fg: [150,20,20] as [number,number,number] },
    { label: 'Atestados',          value: String(totalAtestados),        bg: [235,245,255] as [number,number,number], fg: [20,80,150] as [number,number,number] },
    { label: 'Total Vales',        value: fmtBRL(totalVales),            bg: [235,255,240] as [number,number,number], fg: [20,120,50] as [number,number,number] },
  ];
  let bx = ML;
  for (const b of boxes) {
    doc.setFillColor(...b.bg);
    doc.roundedRect(bx, y, boxW, 14, 2, 2, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.roundedRect(bx, y, boxW, 14, 2, 2, 'S');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...b.fg);
    doc.text(b.label, bx + 3, y + 5);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text(b.value, bx + 3, y + 12);
    bx += boxW + 3;
  }
  y += 19;

  // Per-employee sections
  for (const grupo of Object.values(agrupado)) {
    checkPageBreak(18);

    // Employee header
    doc.setFillColor(50, 50, 60);
    doc.rect(ML, y, CW, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(grupo.nome, ML + 3, y + 5.5);

    // Summary badges on right
    const vC = grupo.itens.filter((o: any) => isConsumo(o.tipo_ocorrencia)).length;
    const vF = grupo.itens.filter((o: any) => o.tipo_ocorrencia === 'falta').length;
    const vA = grupo.itens.filter((o: any) => o.tipo_ocorrencia === 'atestado').length;
    const vV = grupo.itens.filter((o: any) => o.tipo_ocorrencia === 'vale').reduce((s: number, o: any) => s + (o.valor_vale || 0), 0);
    const badges: string[] = [];
    if (vC > 0) badges.push(`Consumo: ${vC}x`);
    if (vF > 0) badges.push(`Faltas: ${vF}d`);
    if (vA > 0) badges.push(`Atestado: ${vA}d`);
    if (vV > 0) badges.push(`Vales: ${fmtBRL(vV)}`);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(200, 200, 200);
    doc.text(badges.join('   '), PW - MR - 3, y + 5.5, { align: 'right' });
    y += 8;

    drawTableHeader();

    // Rows
    for (let i = 0; i < grupo.itens.length; i++) {
      checkPageBreak(7);
      const o = grupo.itens[i];
      const rowH = 6.5;
      if (i % 2 === 0) {
        doc.setFillColor(252, 252, 252);
        doc.rect(ML, y, CW, rowH, 'F');
      }
      doc.setDrawColor(230, 230, 230);
      doc.line(ML, y + rowH, ML + CW, y + rowH);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(40, 40, 40);

      let x = ML + 2;
      doc.text(dayjs(o.data_ocorrencia).format('DD/MM/YYYY'), x, y + 4.5); x += cols.data;
      doc.text(tipoLabel(o.tipo_ocorrencia), x, y + 4.5); x += cols.tipo;
      const descTrunc = doc.splitTextToSize(o.descricao || '', cols.descricao - 2)[0];
      doc.text(descTrunc, x, y + 4.5); x += cols.descricao;

      if (o.valor_vale > 0) {
        doc.setTextColor(30, 100, 50);
        doc.setFont('helvetica', 'bold');
        doc.text(fmtBRL(o.valor_vale), x + cols.valor - 2, y + 4.5, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(40, 40, 40);
      }
      x += cols.valor;

      if (o.dias_afastamento > 0) doc.text(`${o.dias_afastamento}d`, x + 2, y + 4.5);
      x += cols.dias;

      // Status badge
      const stColor: Record<string, [number,number,number]> = {
        aprovado:   [220, 245, 225],
        pendente:   [255, 245, 220],
        rejeitado:  [255, 230, 230],
        processado: [220, 235, 255],
      };
      const stText: Record<string, [number,number,number]> = {
        aprovado:   [20, 100, 40],
        pendente:   [120, 80, 0],
        rejeitado:  [150, 20, 20],
        processado: [20, 60, 140],
      };
      const bc = stColor[o.status] ?? [240,240,240];
      const tc = stText[o.status] ?? [60,60,60];
      doc.setFillColor(...bc);
      doc.roundedRect(x, y + 1, cols.status - 2, 4.5, 1, 1, 'F');
      doc.setFontSize(6.5);
      doc.setTextColor(...tc);
      doc.setFont('helvetica', 'bold');
      doc.text(o.status, x + (cols.status - 2) / 2, y + 4.2, { align: 'center' });
      doc.setFont('helvetica', 'normal');

      y += rowH;
    }
    y += 4;
  }

  // Footer totals
  checkPageBreak(14);
  doc.setFillColor(245, 245, 245);
  doc.rect(ML, y, CW, 12, 'F');
  doc.setDrawColor(200, 200, 200);
  doc.rect(ML, y, CW, 12, 'S');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(50, 50, 50);
  doc.text('RESUMO GERAL', ML + 3, y + 5);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  const tots = [
    `Consumo Bar: ${totalConsumo}`,
    `Faltas: ${totalFaltas}`,
    `Atestados: ${totalAtestados}`,
    `Total Vales: ${fmtBRL(totalVales)}`,
    `Total Registros: ${dados.length}`,
  ];
  doc.text(tots.join('     '), ML + 3, y + 10);

  // Page numbers
  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(150, 150, 150);
    doc.setFont('helvetica', 'normal');
    doc.text(`Página ${i} de ${pageCount}`, PW - MR, 205, { align: 'right' });
  }

  const periodo = periodoLabel.replace(/\//g, '-').replace(/ /g, '_');
  doc.save(`relatorio-folha-${periodo}.pdf`);
}

function RelatorioFolha({ colaboradores }: { colaboradores: any[] }) {
  const [mes, setMes] = useState(dayjs().month() + 1);
  const [ano, setAno] = useState(dayjs().year());
  const [usarPeriodo, setUsarPeriodo] = useState(false);
  const [dataInicio, setDataInicio] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [dataFim, setDataFim] = useState(dayjs().endOf('month').format('YYYY-MM-DD'));
  const [colabFiltro, setColabFiltro] = useState('all');
  const [dados, setDados] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [gerandoPDF, setGerandoPDF] = useState(false);

  const buscar = async () => {
    setLoading(true);
    try {
      let q = supabase
        .from('vw_ocorrencias_detalhadas')
        .select('*')
        .in('tipo_ocorrencia', ['consumo_bar', 'consumo', 'falta', 'vale', 'atestado']);

      if (usarPeriodo) {
        q = q.gte('data_ocorrencia', dataInicio).lte('data_ocorrencia', dataFim);
      } else {
        q = q.eq('mes_ocorrencia', mes).eq('ano_ocorrencia', ano);
      }

      if (colabFiltro !== 'all') q = q.eq('colaborador_id', colabFiltro);

      const { data } = await q.order('colaborador_nome').order('data_ocorrencia');
      setDados(data || []);
    } finally {
      setLoading(false);
    }
  };

  const exportarExcel = () => {
    if (!dados.length) return alert('Sem dados para exportar');
    const headers = ['Colaborador','Data','Tipo','Descrição','Valor (R$)','Dias Afastamento','Status','Impacta Folha'];
    const rows = dados.map(o => [
      o.colaborador_nome,
      dayjs(o.data_ocorrencia).format('DD/MM/YYYY'),
      tipoLabel(o.tipo_ocorrencia),
      o.descricao,
      o.valor_vale > 0 ? o.valor_vale.toFixed(2) : '',
      o.dias_afastamento > 0 ? o.dias_afastamento : '',
      o.status,
      o.impacta_folha ? 'Sim' : 'Não',
    ]);
    const periodo = usarPeriodo ? `${dataInicio}_${dataFim}` : `${mes}-${ano}`;
    exportToExcel(rows, `relatorio-folha-${periodo}`, headers);
  };

  const handleGerarPDF = () => {
    if (!dados.length) return alert('Sem dados para gerar PDF');
    setGerandoPDF(true);
    setTimeout(() => {
      gerarPDF(dados, periodoLabel);
      setGerandoPDF(false);
    }, 100);
  };

  const isConsumoRel = (t: string) => t === 'consumo_bar' || t === 'consumo';

  // Agrupado por colaborador
  const agrupado = dados.reduce((acc, o) => {
    const k = o.colaborador_id;
    if (!acc[k]) acc[k] = { nome: o.colaborador_nome, itens: [] };
    acc[k].itens.push(o);
    return acc;
  }, {} as Record<string, { nome: string; itens: any[] }>);

  const totalVales    = dados.filter(o => o.tipo_ocorrencia === 'vale').reduce((s: number, o: any) => s + (o.valor_vale || 0), 0);
  const totalFaltas   = dados.filter(o => o.tipo_ocorrencia === 'falta').length;
  const totalAtestados= dados.filter(o => o.tipo_ocorrencia === 'atestado').length;
  const totalConsumo  = dados.filter(o => isConsumoRel(o.tipo_ocorrencia)).length;

  const periodoLabel = usarPeriodo
    ? `${dayjs(dataInicio).format('DD/MM/YYYY')} a ${dayjs(dataFim).format('DD/MM/YYYY')}`
    : `${MESES[mes - 1]} ${ano}`;

  // Color maps for on-screen preview
  const tipoColors: Record<string, string> = {
    consumo_bar: 'bg-amber-100 text-amber-800',
    consumo:     'bg-amber-100 text-amber-800',
    falta:       'bg-red-100 text-red-800',
    vale:        'bg-green-100 text-green-800',
    atestado:    'bg-blue-100 text-blue-800',
  };
  const statusColors: Record<string, string> = {
    aprovado:   'bg-green-100 text-green-800',
    pendente:   'bg-yellow-100 text-yellow-800',
    rejeitado:  'bg-red-100 text-red-800',
    processado: 'bg-blue-100 text-blue-800',
  };

  return (
    <div className="space-y-6">
      {/* Filtros */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <FileText className="w-5 h-5 text-white/50" />
          Relatório para Folha de Pagamento
        </h3>

        <div className="flex items-center gap-4 mb-4">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-white/70">
            <input type="radio" checked={!usarPeriodo} onChange={() => setUsarPeriodo(false)} />
            Por mês
          </label>
          <label className="flex items-center gap-2 cursor-pointer text-sm text-white/70">
            <input type="radio" checked={usarPeriodo} onChange={() => setUsarPeriodo(true)} />
            Por período livre
          </label>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {!usarPeriodo ? (
            <>
              <select value={mes} onChange={e => setMes(parseInt(e.target.value))} className={sel}>
                {MESES.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
              <select value={ano} onChange={e => setAno(parseInt(e.target.value))} className={sel}>
                {[ano - 1, ano, ano + 1].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </>
          ) : (
            <>
              <div>
                <label className="block text-xs text-white/40 mb-1">Início</label>
                <input type="date" value={dataInicio} onChange={e => setDataInicio(e.target.value)} className={inp} />
              </div>
              <div>
                <label className="block text-xs text-white/40 mb-1">Fim</label>
                <input type="date" value={dataFim} onChange={e => setDataFim(e.target.value)} className={inp} />
              </div>
            </>
          )}
          <div className={usarPeriodo ? '' : 'md:col-span-2'}>
            <select value={colabFiltro} onChange={e => setColabFiltro(e.target.value)} className={sel}>
              <option value="all">Todos os colaboradores</option>
              {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
            </select>
          </div>
          <button onClick={buscar} disabled={loading}
            className="px-4 py-2 bg-[#7D1F2C] text-white rounded-xl hover:bg-[#6a1a25] disabled:opacity-50 font-medium text-sm">
            {loading ? 'Buscando...' : 'Buscar'}
          </button>
        </div>
      </div>

      {dados.length > 0 && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {[
              { label: 'Total',       val: String(dados.length),   cls: 'bg-white/5 border-white/10 text-white' },
              { label: 'Consumo Bar', val: String(totalConsumo),   cls: 'bg-amber-500/10 border-amber-500/20 text-amber-300' },
              { label: 'Faltas',      val: String(totalFaltas),    cls: 'bg-red-500/10 border-red-500/20 text-red-300' },
              { label: 'Atestados',   val: String(totalAtestados), cls: 'bg-blue-500/10 border-blue-500/20 text-blue-300' },
              { label: 'Total Vales', val: fmtBRL(totalVales),     cls: 'bg-green-500/10 border-green-500/20 text-green-300' },
            ].map(k => (
              <div key={k.label} className={`border rounded-xl p-4 text-center ${k.cls}`}>
                <p className="text-xs opacity-70 mb-1">{k.label}</p>
                <p className="text-xl font-bold">{k.val}</p>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-between">
            <p className="text-white/60 text-sm">
              <span className="text-white font-medium">{periodoLabel}</span>
              {' — '}{dados.length} ocorrência(s) · {Object.keys(agrupado).length} colaborador(es)
            </p>
            <div className="flex gap-2">
              <button onClick={exportarExcel}
                className="px-3 py-2 bg-white/5 border border-white/20 rounded-lg text-white/70 hover:bg-white/10 text-sm flex items-center gap-2">
                <Download className="w-4 h-4" /> Excel
              </button>
              <button onClick={handleGerarPDF} disabled={gerandoPDF}
                className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] disabled:opacity-50 text-sm flex items-center gap-2">
                <Printer className="w-4 h-4" />
                {gerandoPDF ? 'Gerando...' : 'Gerar PDF'}
              </button>
            </div>
          </div>

          {/* Preview on-screen — clean white style */}
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-xl">
            {/* Header */}
            <div className="bg-[#7D1F2C] px-6 py-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-white font-bold text-lg">Relatório de Ocorrências Financeiras</h2>
                  <p className="text-red-200 text-sm mt-0.5">Período: {periodoLabel} · Gerado em {dayjs().format('DD/MM/YYYY HH:mm')}</p>
                </div>
                <div className="text-right text-red-200 text-sm">
                  <p className="font-semibold text-white">{dados.length} ocorrência(s)</p>
                  <p>{Object.keys(agrupado).length} colaborador(es)</p>
                </div>
              </div>
            </div>

            {/* Summary strip */}
            <div className="grid grid-cols-5 border-b border-gray-200">
              {[
                { label: 'Total', val: String(dados.length),   bg: 'bg-gray-50',   text: 'text-gray-800' },
                { label: 'Consumo Bar', val: String(totalConsumo),   bg: 'bg-amber-50',  text: 'text-amber-700' },
                { label: 'Faltas',  val: String(totalFaltas),    bg: 'bg-red-50',    text: 'text-red-700' },
                { label: 'Atestados',   val: String(totalAtestados), bg: 'bg-blue-50',   text: 'text-blue-700' },
                { label: 'Total Vales', val: fmtBRL(totalVales),     bg: 'bg-green-50',  text: 'text-green-700' },
              ].map((s, i) => (
                <div key={i} className={`${s.bg} px-4 py-3 text-center border-r border-gray-200 last:border-0`}>
                  <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{s.label}</p>
                  <p className={`text-xl font-bold mt-0.5 ${s.text}`}>{s.val}</p>
                </div>
              ))}
            </div>

            {/* Per-employee */}
            {Object.values(agrupado).map((grupo: any) => {
              const vC = grupo.itens.filter((o: any) => isConsumoRel(o.tipo_ocorrencia)).length;
              const vF = grupo.itens.filter((o: any) => o.tipo_ocorrencia === 'falta').reduce((s: number, o: any) => s + (o.dias_afastamento || 1), 0);
              const vA = grupo.itens.filter((o: any) => o.tipo_ocorrencia === 'atestado').reduce((s: number, o: any) => s + (o.dias_afastamento || 0), 0);
              const vV = grupo.itens.filter((o: any) => o.tipo_ocorrencia === 'vale').reduce((s: number, o: any) => s + (o.valor_vale || 0), 0);

              return (
                <div key={grupo.nome} className="border-b border-gray-200 last:border-0">
                  {/* Employee header */}
                  <div className="bg-gray-800 px-6 py-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <User className="w-4 h-4 text-gray-400" />
                      <span className="font-semibold text-white text-sm">{grupo.nome}</span>
                      <span className="text-gray-400 text-xs">({grupo.itens.length} ocorrência{grupo.itens.length !== 1 ? 's' : ''})</span>
                    </div>
                    <div className="flex gap-4 text-xs">
                      {vC > 0 && <span className="text-amber-300 font-medium">Consumo Bar: {vC}x</span>}
                      {vF > 0 && <span className="text-red-300 font-medium">Faltas: {vF}d</span>}
                      {vA > 0 && <span className="text-blue-300 font-medium">Atestado: {vA}d</span>}
                      {vV > 0 && <span className="text-green-300 font-medium">Vales: {fmtBRL(vV)}</span>}
                    </div>
                  </div>

                  {/* Column headers */}
                  <div className="grid grid-cols-[100px_140px_1fr_120px_80px_100px] bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-500 uppercase tracking-wide px-4 py-2">
                    <span>Data</span>
                    <span>Tipo</span>
                    <span>Descrição</span>
                    <span className="text-right">Valor</span>
                    <span className="text-center">Dias</span>
                    <span className="text-center">Status</span>
                  </div>

                  {/* Rows */}
                  {grupo.itens.map((o: any, i: number) => (
                    <div key={o.id}
                      className={`grid grid-cols-[100px_140px_1fr_120px_80px_100px] px-4 py-2.5 text-sm items-center border-b border-gray-100 last:border-0 ${i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                      <span className="text-gray-600 font-mono text-xs">{dayjs(o.data_ocorrencia).format('DD/MM/YYYY')}</span>
                      <span>
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${tipoColors[o.tipo_ocorrencia] ?? 'bg-gray-100 text-gray-700'}`}>
                          {tipoLabel(o.tipo_ocorrencia)}
                        </span>
                      </span>
                      <span className="text-gray-700">{o.descricao || '—'}</span>
                      <span className="text-right">
                        {o.valor_vale > 0
                          ? <span className="font-semibold text-green-700">{fmtBRL(o.valor_vale)}</span>
                          : <span className="text-gray-400">—</span>}
                      </span>
                      <span className="text-center text-gray-600">
                        {o.dias_afastamento > 0 ? `${o.dias_afastamento}d` : '—'}
                      </span>
                      <span className="text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[o.status] ?? 'bg-gray-100 text-gray-700'}`}>
                          {o.status}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}

            {/* Footer totals */}
            <div className="bg-gray-100 border-t-2 border-gray-300 px-6 py-4 flex justify-end gap-8 text-sm">
              <span className="text-gray-600">Consumo Bar: <strong className="text-amber-700">{totalConsumo}</strong></span>
              <span className="text-gray-600">Faltas: <strong className="text-red-700">{totalFaltas}</strong></span>
              <span className="text-gray-600">Atestados: <strong className="text-blue-700">{totalAtestados}</strong></span>
              <span className="text-gray-600">Total Vales: <strong className="text-green-700">{fmtBRL(totalVales)}</strong></span>
              <span className="font-semibold text-gray-800">Total: {dados.length} registro(s)</span>
            </div>
          </div>
        </>
      )}

      {dados.length === 0 && !loading && (
        <div className="text-center py-12 text-white/40 bg-white/5 rounded-xl border border-white/10">
          <FileText className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Selecione o período e clique em Buscar para gerar o relatório</p>
        </div>
      )}
    </div>
  );
}

// ── Ocorrências Disciplinares ─────────────────────────────────────────────────

function OcorrenciasDisciplinares() {
  const printRef = useRef<HTMLDivElement>(null);
  const [registros, setRegistros] = useState<RegistroDisciplinar[]>([]);
  const [colaboradores, setColaboradores] = useState<{ id: string; nome_completo: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [modal, setModal] = useState<{ open: boolean; editId?: string }>({ open: false });
  const [form, setForm] = useState<Record<string, any>>({});
  const [salvando, setSalvando] = useState(false);
  const [impressao, setImpressao] = useState<RegistroDisciplinar | null>(null);

  useEffect(() => { fetchAll(); }, []);

  const fetchAll = async () => {
    setLoading(true);
    const [{ data: r }, { data: c }] = await Promise.all([
      supabase.from('rh_disciplinar').select('*, colaboradores(nome_completo)').order('data_ocorrencia', { ascending: false }),
      supabase.from('colaboradores').select('id, nome_completo').eq('status', 'ativo').order('nome_completo'),
    ]);
    setRegistros(r || []);
    setColaboradores(c || []);
    setLoading(false);
  };

  const abrir = (tipo: string, reg?: RegistroDisciplinar) => {
    setForm(reg
      ? { ...reg, colaborador_id: reg.colaborador_id }
      : { tipo, data_ocorrencia: dayjs().format('YYYY-MM-DD'), recibado: false }
    );
    setModal({ open: true, editId: reg?.id });
  };

  const salvar = async () => {
    setSalvando(true);
    const payload = { ...form };
    delete payload.colaboradores;
    if (modal.editId) {
      await supabase.from('rh_disciplinar').update(payload).eq('id', modal.editId);
    } else {
      await supabase.from('rh_disciplinar').insert([payload]);
    }
    setSalvando(false);
    setModal({ open: false });
    fetchAll();
  };

  const deletar = async (id: string) => {
    if (!confirm('Excluir este registro?')) return;
    await supabase.from('rh_disciplinar').delete().eq('id', id);
    fetchAll();
  };

  const filtrados = registros.filter(r => {
    const nome = r.colaboradores?.nome_completo ?? '';
    const matchBusca = nome.toLowerCase().includes(busca.toLowerCase()) || r.motivo?.toLowerCase().includes(busca.toLowerCase());
    const matchTipo = !filtroTipo || r.tipo === filtroTipo;
    return matchBusca && matchTipo;
  });

  const cfg = (tipo: string) => tipoDisCfg(tipo);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-white font-semibold">Ocorrências Disciplinares</h3>
        <div className="flex gap-2 flex-wrap">
          {TIPOS_DISCIPLINARES.map(t => (
            <button key={t.key} onClick={() => abrir(t.key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm font-medium ${t.cls} hover:opacity-80 transition-opacity`}>
              <Plus className="w-3.5 h-3.5" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input type="text" placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} className={inp + ' pl-9'} />
        </div>
        <select value={filtroTipo} onChange={e => setFiltroTipo(e.target.value)} className={sel + ' max-w-48'}>
          <option value="">Todos os tipos</option>
          {TIPOS_DISCIPLINARES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
        </select>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#7D1F2C]" />
        </div>
      ) : filtrados.length === 0 ? (
        <div className="text-center py-12 text-white/40 bg-white/5 rounded-xl border border-white/10">
          <Scale className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhum registro disciplinar encontrado</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtrados.map(r => {
            const c = cfg(r.tipo);
            return (
              <div key={r.id} className={`border rounded-xl p-4 ${c.cls} bg-opacity-10`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${c.cls}`}>{c.label}</span>
                      <span className="font-semibold text-white">{r.colaboradores?.nome_completo ?? '—'}</span>
                      <span className="text-sm text-white/40">{dayjs(r.data_ocorrencia).format('DD/MM/YYYY')}</span>
                      {r.recibado && <span className="text-xs bg-green-500/20 text-green-400 px-2 py-0.5 rounded-full">Recibado</span>}
                    </div>
                    <p className="text-white/80 text-sm"><span className="font-medium text-white/60">Motivo:</span> {r.motivo}</p>
                    {r.descricao && <p className="text-white/60 text-sm mt-1">{r.descricao}</p>}
                    {r.registrado_por && <p className="text-xs text-white/40 mt-1">Registrado por: {r.registrado_por}</p>}
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <button onClick={() => setImpressao(r)} className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg" title="Imprimir">
                      <Printer className="w-4 h-4" />
                    </button>
                    <button onClick={() => abrir(r.tipo, r)} className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg" title="Editar">
                      <Edit className="w-4 h-4" />
                    </button>
                    <button onClick={() => deletar(r.id)} className="p-1.5 text-red-400/60 hover:text-red-400 hover:bg-red-500/10 rounded-lg" title="Excluir">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal form disciplinar */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1020] border border-white/10 rounded-xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-white font-semibold">{modal.editId ? 'Editar' : 'Novo'} Registro Disciplinar</h3>
              <button onClick={() => setModal({ open: false })} className="text-white/40 hover:text-white">
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-white/50 mb-1 uppercase">Colaborador *</label>
                  <select value={form.colaborador_id || ''} onChange={e => setForm((f: any) => ({ ...f, colaborador_id: e.target.value }))} className={sel}>
                    <option value="">Selecione...</option>
                    {colaboradores.map(c => <option key={c.id} value={c.id}>{c.nome_completo}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1 uppercase">Tipo *</label>
                  <select value={form.tipo || ''} onChange={e => setForm((f: any) => ({ ...f, tipo: e.target.value }))} className={sel}>
                    {TIPOS_DISCIPLINARES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1 uppercase">Data *</label>
                <input type="date" value={form.data_ocorrencia || ''} onChange={e => setForm((f: any) => ({ ...f, data_ocorrencia: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1 uppercase">Motivo *</label>
                <input type="text" value={form.motivo || ''} onChange={e => setForm((f: any) => ({ ...f, motivo: e.target.value }))} className={inp} placeholder="Motivo da ocorrência" />
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1 uppercase">Descrição</label>
                <textarea rows={3} value={form.descricao || ''} onChange={e => setForm((f: any) => ({ ...f, descricao: e.target.value }))} className={inp} placeholder="Detalhes adicionais..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-white/50 mb-1 uppercase">Registrado por</label>
                  <input type="text" value={form.registrado_por || ''} onChange={e => setForm((f: any) => ({ ...f, registrado_por: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1 uppercase">Testemunha</label>
                  <input type="text" value={form.testemunha || ''} onChange={e => setForm((f: any) => ({ ...f, testemunha: e.target.value }))} className={inp} />
                </div>
              </div>
              {form.tipo === 'suspensao' && (
                <div>
                  <label className="block text-xs text-white/50 mb-1 uppercase">Dias de Suspensão</label>
                  <input type="number" min="1" value={form.dias_suspensao || ''} onChange={e => setForm((f: any) => ({ ...f, dias_suspensao: parseInt(e.target.value) || 0 }))} className={inp} />
                </div>
              )}
              {form.tipo === 'premio' && (
                <div>
                  <label className="block text-xs text-white/50 mb-1 uppercase">Valor do Prêmio (R$)</label>
                  <input type="number" step="0.01" min="0" value={form.valor_premio || ''} onChange={e => setForm((f: any) => ({ ...f, valor_premio: parseFloat(e.target.value) || 0 }))} className={inp} />
                </div>
              )}
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={!!form.recibado} onChange={e => setForm((f: any) => ({ ...f, recibado: e.target.checked }))} className="rounded border-white/20 text-[#7D1F2C]" />
                <span className="text-sm text-white/70">Colaborador recibou o documento</span>
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setModal({ open: false })} className="px-4 py-2 border border-white/20 rounded-lg text-white/70 hover:bg-white/5">Cancelar</button>
              <button onClick={salvar} disabled={salvando} className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] disabled:opacity-50">
                {salvando ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal impressão */}
      {impressao && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 print:p-8" ref={printRef}>
              <div className="text-center mb-6 border-b-2 border-gray-300 pb-4">
                <h2 className="text-xl font-bold text-gray-900">{cfg(impressao.tipo).label?.toUpperCase()}</h2>
                <p className="text-gray-500 text-sm">{dayjs(impressao.data_ocorrencia).format('DD/MM/YYYY')}</p>
              </div>
              <div className="space-y-3 text-sm text-gray-800">
                <p><strong>Colaborador:</strong> {impressao.colaboradores?.nome_completo}</p>
                <p><strong>Motivo:</strong> {impressao.motivo}</p>
                {impressao.descricao && <p><strong>Descrição:</strong> {impressao.descricao}</p>}
                {impressao.registrado_por && <p><strong>Registrado por:</strong> {impressao.registrado_por}</p>}
                {impressao.testemunha && <p><strong>Testemunha:</strong> {impressao.testemunha}</p>}
                {impressao.dias_suspensao && <p><strong>Dias de suspensão:</strong> {impressao.dias_suspensao}</p>}
              </div>
              <div className="mt-12 grid grid-cols-2 gap-8">
                <div className="text-center border-t border-gray-400 pt-2 mt-8">
                  <p className="text-xs text-gray-500">Assinatura do Colaborador</p>
                </div>
                <div className="text-center border-t border-gray-400 pt-2 mt-8">
                  <p className="text-xs text-gray-500">RH / Responsável</p>
                </div>
              </div>
            </div>
            <div className="flex justify-end gap-2 p-4 border-t print:hidden">
              <button onClick={() => setImpressao(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50">Fechar</button>
              <button onClick={() => window.print()} className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] flex items-center gap-2">
                <Printer className="w-4 h-4" /> Imprimir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default OcorrenciasColaborador;
