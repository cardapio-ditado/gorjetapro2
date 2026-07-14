import React, { useState, useEffect } from 'react';
import { Target, Award, TrendingUp, CheckCircle, AlertCircle, Plus, CreditCard as Edit2, Trash2, X, Save, ChevronDown, ChevronUp } from 'lucide-react';
import { cargoService, Cargo } from '../../services/rhService';

const inp = 'w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#7D1F2C]/60';
const sel = 'w-full bg-[#0e1019] border border-white/15 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#7D1F2C]/60';

type CargoForm = {
  nome: string;
  descricao: string;
  missao: string;
  remuneracao: string;
  beneficios_cargo: string;
  formato_trabalho: string;
  status: 'ativo' | 'inativo';
  obrigatorias: string;
  desejaveis: string;
  comportamentais: string;
  indicadores: Array<{ nome: string; meta: string; descricao: string }>;
};

const emptyForm: CargoForm = {
  nome: '', descricao: '', missao: '', remuneracao: '', beneficios_cargo: '', formato_trabalho: '',
  status: 'ativo', obrigatorias: '', desejaveis: '', comportamentais: '',
  indicadores: [],
};

const cargoToForm = (c: Cargo): CargoForm => ({
  nome: c.nome || '',
  descricao: c.descricao || '',
  missao: c.missao || '',
  remuneracao: c.remuneracao || '',
  beneficios_cargo: c.beneficios_cargo || '',
  formato_trabalho: c.formato_trabalho || '',
  status: c.status || 'ativo',
  obrigatorias: (c.competencias?.obrigatorias || []).join('\n'),
  desejaveis: (c.competencias?.desejaveis || []).join('\n'),
  comportamentais: (c.competencias?.comportamentais || []).join('\n'),
  indicadores: c.indicadores || [],
});

const formToCargo = (f: CargoForm): Omit<Cargo, 'id' | 'criado_em' | 'atualizado_em'> => ({
  nome: f.nome,
  descricao: f.descricao,
  missao: f.missao,
  remuneracao: f.remuneracao,
  beneficios_cargo: f.beneficios_cargo,
  formato_trabalho: f.formato_trabalho,
  status: f.status,
  competencias: {
    obrigatorias: f.obrigatorias.split('\n').map(s => s.trim()).filter(Boolean),
    desejaveis: f.desejaveis.split('\n').map(s => s.trim()).filter(Boolean),
    comportamentais: f.comportamentais.split('\n').map(s => s.trim()).filter(Boolean),
  },
  indicadores: f.indicadores,
});

const GestaoCargos: React.FC = () => {
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedCargo, setSelectedCargo] = useState<Cargo | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingCargo, setEditingCargo] = useState<Cargo | null>(null);
  const [form, setForm] = useState<CargoForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [showIndicadorForm, setShowIndicadorForm] = useState(false);
  const [novoInd, setNovoInd] = useState({ nome: '', meta: '', descricao: '' });
  const [expandedSection, setExpandedSection] = useState<string | null>('competencias');

  useEffect(() => { carregarCargos(); }, []);

  const carregarCargos = async () => {
    try {
      setLoading(true);
      const data = await cargoService.listar();
      setCargos(data);
    } catch (error) {
      console.error('Erro ao carregar cargos:', error);
    } finally {
      setLoading(false);
    }
  };

  const abrirNovo = () => {
    setEditingCargo(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const abrirEditar = (cargo: Cargo, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingCargo(cargo);
    setForm(cargoToForm(cargo));
    setShowModal(true);
  };

  const salvar = async () => {
    if (!form.nome.trim()) return alert('Nome do cargo é obrigatório.');
    setSaving(true);
    try {
      const payload = formToCargo(form);
      if (editingCargo) {
        const updated = await cargoService.atualizar(editingCargo.id, payload);
        if (selectedCargo?.id === editingCargo.id) setSelectedCargo(updated);
      } else {
        await cargoService.criar(payload);
      }
      setShowModal(false);
      await carregarCargos();
    } catch (err: any) {
      alert('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const excluir = async (cargo: Cargo, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Excluir o cargo "${cargo.nome}"? Esta ação não pode ser desfeita.`)) return;
    try {
      await cargoService.deletar(cargo.id);
      if (selectedCargo?.id === cargo.id) setSelectedCargo(null);
      await carregarCargos();
    } catch (err: any) {
      alert('Erro ao excluir: ' + err.message);
    }
  };

  const adicionarIndicador = () => {
    if (!novoInd.nome.trim()) return;
    setForm(f => ({ ...f, indicadores: [...f.indicadores, { ...novoInd }] }));
    setNovoInd({ nome: '', meta: '', descricao: '' });
    setShowIndicadorForm(false);
  };

  const removerIndicador = (idx: number) => {
    setForm(f => ({ ...f, indicadores: f.indicadores.filter((_, i) => i !== idx) }));
  };

  const Section = ({ id, title, icon: Icon, iconColor, children }: any) => (
    <div className="border border-white/10 rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpandedSection(expandedSection === id ? null : id)}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-white/3 transition-colors"
      >
        <span className="flex items-center gap-2 text-sm font-medium text-white">
          <Icon className={`w-4 h-4 ${iconColor}`} />
          {title}
        </span>
        {expandedSection === id ? <ChevronUp className="w-4 h-4 text-white/30" /> : <ChevronDown className="w-4 h-4 text-white/30" />}
      </button>
      {expandedSection === id && <div className="px-3 pb-3 space-y-3 border-t border-white/5">{children}</div>}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Gestão de Cargos</h2>
          <p className="text-white/50">{cargos.length} cargo{cargos.length !== 1 ? 's' : ''} cadastrado{cargos.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={abrirNovo}
          className="flex items-center gap-2 px-4 py-2 bg-[#7D1F2C] text-white rounded-xl hover:bg-[#9D2F3C] transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Novo Cargo
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Lista */}
        <div className="space-y-3">
          {cargos.length === 0 && (
            <div className="text-center py-12 text-white/30 border border-white/10 rounded-xl">
              <Target className="w-12 h-12 mx-auto mb-2 opacity-20" />
              <p className="text-sm">Nenhum cargo cadastrado ainda.</p>
            </div>
          )}
          {cargos.map(cargo => (
            <div
              key={cargo.id}
              onClick={() => setSelectedCargo(cargo)}
              className={`p-4 border rounded-xl cursor-pointer transition-all ${
                selectedCargo?.id === cargo.id
                  ? 'border-[#7D1F2C] bg-[#7D1F2C]/10'
                  : 'border-white/10 hover:border-white/20 bg-[#12141f]'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-white mb-1 truncate">{cargo.nome}</h3>
                  <p className="text-sm text-white/50 line-clamp-2">{cargo.descricao}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-white/40">
                    <span className="flex items-center gap-1">
                      <CheckCircle className="w-3.5 h-3.5" />
                      {cargo.competencias?.obrigatorias?.length || 0} obrigatórias
                    </span>
                    <span className="flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5" />
                      {cargo.indicadores?.length || 0} indicadores
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${cargo.status === 'ativo' ? 'bg-green-500/15 text-green-400' : 'bg-white/10 text-white/60'}`}>
                    {cargo.status}
                  </span>
                  <button
                    onClick={e => abrirEditar(cargo, e)}
                    className="p-1.5 text-white/30 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
                    title="Editar"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={e => excluir(cargo, e)}
                    className="p-1.5 text-red-400/30 hover:text-red-400 rounded-lg hover:bg-red-500/10 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Detalhes */}
        <div className="bg-[#12141f] border border-white/10 rounded-xl p-6 sticky top-4 max-h-[calc(100vh-120px)] overflow-y-auto">
          {selectedCargo ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xl font-bold text-white mb-1">{selectedCargo.nome}</h3>
                  <p className="text-white/50 text-sm">{selectedCargo.descricao}</p>
                </div>
                <button onClick={e => abrirEditar(selectedCargo, e)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 text-white/60 rounded-xl hover:bg-white/10 text-xs transition-colors">
                  <Edit2 className="w-3.5 h-3.5" /> Editar
                </button>
              </div>

              {selectedCargo.missao && (
                <div>
                  <h4 className="font-semibold text-white mb-2 flex items-center gap-2 text-sm">
                    <Target className="w-4 h-4 text-[#7D1F2C]" /> Missão
                  </h4>
                  <p className="text-white/70 text-sm bg-white/5 p-3 rounded-xl">{selectedCargo.missao}</p>
                </div>
              )}

              {selectedCargo.competencias?.obrigatorias?.length > 0 && (
                <div>
                  <h4 className="font-semibold text-white mb-2 flex items-center gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500" /> Competências Obrigatórias
                  </h4>
                  <ul className="space-y-1">
                    {selectedCargo.competencias.obrigatorias.map((c, i) => (
                      <li key={i} className="text-sm text-white/70 flex items-start gap-2">
                        <span className="text-green-500 mt-1">•</span>{c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedCargo.competencias?.desejaveis?.length > 0 && (
                <div>
                  <h4 className="font-semibold text-white mb-2 flex items-center gap-2 text-sm">
                    <Award className="w-4 h-4 text-blue-400" /> Competências Desejáveis
                  </h4>
                  <ul className="space-y-1">
                    {selectedCargo.competencias.desejaveis.map((c, i) => (
                      <li key={i} className="text-sm text-white/70 flex items-start gap-2">
                        <span className="text-blue-400 mt-1">•</span>{c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedCargo.competencias?.comportamentais?.length > 0 && (
                <div>
                  <h4 className="font-semibold text-white mb-2 flex items-center gap-2 text-sm">
                    <Award className="w-4 h-4 text-amber-400" /> Comportamentais
                  </h4>
                  <ul className="space-y-1">
                    {selectedCargo.competencias.comportamentais.map((c, i) => (
                      <li key={i} className="text-sm text-white/70 flex items-start gap-2">
                        <span className="text-amber-400 mt-1">•</span>{c}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {selectedCargo.indicadores?.length > 0 && (
                <div>
                  <h4 className="font-semibold text-white mb-2 flex items-center gap-2 text-sm">
                    <TrendingUp className="w-4 h-4 text-[#D4AF37]" /> Indicadores
                  </h4>
                  <div className="space-y-2">
                    {selectedCargo.indicadores.map((ind, i) => (
                      <div key={i} className="bg-white/5 p-3 rounded-xl">
                        <div className="flex items-center justify-between mb-0.5">
                          <span className="font-medium text-sm text-white">{ind.nome}</span>
                          <span className="text-xs text-[#7D1F2C] font-medium">Meta: {ind.meta}</span>
                        </div>
                        {ind.descricao && <p className="text-xs text-white/40">{ind.descricao}</p>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {selectedCargo.remuneracao && (
                <div>
                  <h4 className="font-semibold text-white mb-1 text-sm">Remuneração</h4>
                  <p className="text-sm text-white/70 bg-emerald-500/10 p-3 rounded-xl">{selectedCargo.remuneracao}</p>
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-white/30">
              <Target className="w-14 h-14 mx-auto mb-3 opacity-20" />
              <p className="text-sm">Selecione um cargo para ver os detalhes</p>
            </div>
          )}
        </div>
      </div>

      {/* Info */}
      <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-sm text-blue-300">
          Os cargos do Ditado Popular já estão pré-cadastrados com competências e indicadores. Ao criar uma vaga, selecione o cargo e o formulário será preenchido automaticamente.
        </p>
      </div>

      {/* Modal Criar/Editar */}
      {showModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#12141f] border border-white/15 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h3 className="text-lg font-bold text-white">
                {editingCargo ? 'Editar Cargo' : 'Novo Cargo'}
              </h3>
              <button onClick={() => setShowModal(false)} className="text-white/40 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Basic Info */}
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs text-white/50 mb-1">Nome do Cargo *</label>
                  <input className={inp} value={form.nome} onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Garçom, Cozinheiro..." />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-white/50 mb-1">Descrição</label>
                  <textarea className={inp + ' resize-none'} rows={2} value={form.descricao} onChange={e => setForm(f => ({ ...f, descricao: e.target.value }))} placeholder="Breve descrição do cargo..." />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-white/50 mb-1">Missão</label>
                  <textarea className={inp + ' resize-none'} rows={2} value={form.missao} onChange={e => setForm(f => ({ ...f, missao: e.target.value }))} placeholder="Missão principal do cargo..." />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Remuneração</label>
                  <input className={inp} value={form.remuneracao} onChange={e => setForm(f => ({ ...f, remuneracao: e.target.value }))} placeholder="Ex: R$ 1.800 + gorjeta" />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Formato de Trabalho</label>
                  <select className={sel} value={form.formato_trabalho} onChange={e => setForm(f => ({ ...f, formato_trabalho: e.target.value }))}>
                    <option value="">Selecionar</option>
                    <option value="presencial">Presencial</option>
                    <option value="remoto">Remoto</option>
                    <option value="hibrido">Híbrido</option>
                  </select>
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-white/50 mb-1">Benefícios</label>
                  <input className={inp} value={form.beneficios_cargo} onChange={e => setForm(f => ({ ...f, beneficios_cargo: e.target.value }))} placeholder="VT, VR, plano de saúde..." />
                </div>
                <div>
                  <label className="block text-xs text-white/50 mb-1">Status</label>
                  <select className={sel} value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as 'ativo' | 'inativo' }))}>
                    <option value="ativo">Ativo</option>
                    <option value="inativo">Inativo</option>
                  </select>
                </div>
              </div>

              {/* Competências */}
              <Section id="competencias" title="Competências" icon={CheckCircle} iconColor="text-green-400">
                <div className="pt-3 space-y-3">
                  <div>
                    <label className="block text-xs text-white/50 mb-1">Obrigatórias (uma por linha)</label>
                    <textarea className={inp + ' resize-none'} rows={4} value={form.obrigatorias} onChange={e => setForm(f => ({ ...f, obrigatorias: e.target.value }))} placeholder="Ex: Experiência em atendimento&#10;Comunicação clara&#10;Pontualidade" />
                  </div>
                  <div>
                    <label className="block text-xs text-white/50 mb-1">Desejáveis (uma por linha)</label>
                    <textarea className={inp + ' resize-none'} rows={3} value={form.desejaveis} onChange={e => setForm(f => ({ ...f, desejaveis: e.target.value }))} placeholder="Competências desejáveis..." />
                  </div>
                  <div>
                    <label className="block text-xs text-white/50 mb-1">Comportamentais (uma por linha)</label>
                    <textarea className={inp + ' resize-none'} rows={3} value={form.comportamentais} onChange={e => setForm(f => ({ ...f, comportamentais: e.target.value }))} placeholder="Proatividade, trabalho em equipe..." />
                  </div>
                </div>
              </Section>

              {/* Indicadores */}
              <Section id="indicadores" title="Indicadores de Performance" icon={TrendingUp} iconColor="text-amber-400">
                <div className="pt-3 space-y-2">
                  {form.indicadores.map((ind, i) => (
                    <div key={i} className="flex items-start gap-2 bg-white/5 rounded-xl p-2.5">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white font-medium">{ind.nome}</p>
                        <p className="text-xs text-white/40">Meta: {ind.meta}{ind.descricao && ` · ${ind.descricao}`}</p>
                      </div>
                      <button onClick={() => removerIndicador(i)} className="text-red-400/50 hover:text-red-400 p-1"><X className="w-3.5 h-3.5" /></button>
                    </div>
                  ))}

                  {showIndicadorForm ? (
                    <div className="bg-white/5 rounded-xl p-3 space-y-2">
                      <input className={inp} placeholder="Nome do indicador" value={novoInd.nome} onChange={e => setNovoInd(n => ({ ...n, nome: e.target.value }))} />
                      <div className="grid grid-cols-2 gap-2">
                        <input className={inp} placeholder="Meta" value={novoInd.meta} onChange={e => setNovoInd(n => ({ ...n, meta: e.target.value }))} />
                        <input className={inp} placeholder="Descrição (opcional)" value={novoInd.descricao} onChange={e => setNovoInd(n => ({ ...n, descricao: e.target.value }))} />
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => setShowIndicadorForm(false)} className="flex-1 py-1.5 border border-white/15 text-white/50 rounded-lg text-xs">Cancelar</button>
                        <button onClick={adicionarIndicador} className="flex-1 py-1.5 bg-[#7D1F2C] text-white rounded-lg text-xs">Adicionar</button>
                      </div>
                    </div>
                  ) : (
                    <button onClick={() => setShowIndicadorForm(true)}
                      className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-white/15 rounded-xl text-white/40 hover:text-white/70 hover:border-white/30 text-xs transition-colors">
                      <Plus className="w-3.5 h-3.5" /> Adicionar indicador
                    </button>
                  )}
                </div>
              </Section>
            </div>

            <div className="flex gap-3 p-5 border-t border-white/10">
              <button onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 border border-white/15 text-white/70 rounded-xl hover:bg-white/5 text-sm">
                Cancelar
              </button>
              <button onClick={salvar} disabled={saving}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-[#7D1F2C] text-white rounded-xl hover:bg-[#9D2F3C] disabled:opacity-50 text-sm font-medium">
                <Save className="w-4 h-4" />
                {saving ? 'Salvando...' : editingCargo ? 'Salvar Alterações' : 'Criar Cargo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GestaoCargos;
