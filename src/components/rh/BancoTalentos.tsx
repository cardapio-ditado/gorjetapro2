import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Users, Search, Filter, Eye, Star, Phone, Mail, Calendar, Briefcase, DollarSign, Plus, CreditCard as Edit2, Trash2, Upload, FileText, Download, X, ArrowUpCircle, Sparkles, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import FichaCandidato from './FichaCandidato';

interface Documento {
  nome: string;
  url: string;
  tipo: string;
  tamanho: number;
  adicionado_em: string;
}

interface Talento {
  id: string;
  candidato_id: string;
  candidatura_id?: string;
  data_inclusao: string;
  motivo_inclusao: string;
  areas_interesse: string[];
  disponibilidade: string;
  pretensao_salarial: number;
  observacoes: string;
  status: string;
  categoria: 'banco_curriculos' | 'banco_talentos';
  candidato?: {
    id: string;
    nome: string;
    email: string;
    telefone: string;
    endereco: string;
    cidade: string;
    estado: string;
    curriculo_texto: string;
    documentos?: Documento[];
  };
  candidatura?: {
    vaga?: { titulo: string };
  };
}

interface FormState {
  nome: string;
  email: string;
  telefone: string;
  areas_interesse: string[];
  disponibilidade: string;
  pretensao_salarial: string;
  observacoes: string;
  status: string;
}

const EMPTY_FORM: FormState = {
  nome: '', email: '', telefone: '',
  areas_interesse: [],
  disponibilidade: '',
  pretensao_salarial: '',
  observacoes: '',
  status: 'ativo',
};

const AREAS = ['Cozinha', 'Bar', 'Atendimento', 'Caixa', 'Delivery', 'Limpeza', 'Administração', 'Marketing', 'TI', 'RH', 'Financeiro', 'Produção', 'Logística', 'Outro'];

const inp = 'w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#7D1F2C]/60';
const sel = 'w-full bg-[#0e1019] border border-white/15 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#7D1F2C]/60';

export default function BancoTalentos() {
  const [talentos, setTalentos] = useState<Talento[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ativo');
  const [categoriaTab, setCategoriaTab] = useState<'banco_curriculos' | 'banco_talentos'>('banco_talentos');
  const [selectedTalento, setSelectedTalento] = useState<Talento | null>(null);
  const [showFicha, setShowFicha] = useState(false);

  const [showCadastrarModal, setShowCadastrarModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<Talento | null>(null);
  const [showDocsModal, setShowDocsModal] = useState<Talento | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [docs, setDocs] = useState<Documento[]>([]);
  const [extractingAI, setExtractingAI] = useState(false);

  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM });

  const cvFileRef = useRef<HTMLInputElement>(null);
  const docFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { carregarTalentos(); }, [statusFilter, categoriaTab]);

  const carregarTalentos = async () => {
    try {
      setLoading(true);
      let query = supabase
        .from('banco_talentos')
        .select('*, candidato:rh_candidatos(*), candidatura:rh_candidaturas(vaga:rh_vagas(titulo))')
        .eq('categoria', categoriaTab)
        .order('data_inclusao', { ascending: false });

      if (statusFilter !== 'todos') query = query.eq('status', statusFilter);

      const { data, error } = await query;
      if (error) throw error;
      setTalentos(data || []);
    } catch (err) {
      console.error('Erro ao carregar banco de talentos:', err);
    } finally {
      setLoading(false);
    }
  };

  const filteredTalentos = talentos.filter(t => {
    const s = searchTerm.toLowerCase();
    return (
      t.candidato?.nome?.toLowerCase().includes(s) ||
      t.candidato?.email?.toLowerCase().includes(s) ||
      t.areas_interesse?.some(a => a.toLowerCase().includes(s))
    );
  });

  const setField = useCallback(<K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm(prev => ({ ...prev, [key]: value }));
  }, []);

  const toggleArea = useCallback((area: string) => {
    setForm(prev => ({
      ...prev,
      areas_interesse: prev.areas_interesse.includes(area)
        ? prev.areas_interesse.filter(a => a !== area)
        : [...prev.areas_interesse, area],
    }));
  }, []);

  // AI extract CV data
  const extrairDadosCurriculo = async (file: File) => {
    setExtractingAI(true);
    try {
      const fd = new FormData();
      fd.append('file', file);

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/extrair-dados-curriculo`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
          body: fd,
        }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || 'Falha na extração');

      const d = json.dados;
      setForm(prev => ({
        ...prev,
        nome: d.nome || prev.nome,
        email: d.email || prev.email,
        telefone: d.telefone || prev.telefone,
        disponibilidade: d.disponibilidade || prev.disponibilidade,
        pretensao_salarial: d.pretensao_salarial ? String(d.pretensao_salarial) : prev.pretensao_salarial,
        areas_interesse: d.areas_interesse?.length ? d.areas_interesse : prev.areas_interesse,
        observacoes: d.observacoes || prev.observacoes,
      }));
    } catch (err: any) {
      alert('Erro ao processar currículo com IA: ' + err.message);
    } finally {
      setExtractingAI(false);
    }
  };

  const cadastrarCurriculo = async () => {
    if (!form.nome.trim()) { alert('Nome é obrigatório.'); return; }
    setSaving(true);
    try {
      const { data: cand, error: eCand } = await supabase
        .from('rh_candidatos')
        .insert({ nome: form.nome, email: form.email || null, telefone: form.telefone || null })
        .select()
        .single();
      if (eCand) throw eCand;

      const { error: eBT } = await supabase.from('banco_talentos').insert({
        candidato_id: cand.id,
        candidatura_id: null,
        categoria: 'banco_curriculos',
        status: 'ativo',
        areas_interesse: form.areas_interesse,
        disponibilidade: form.disponibilidade || null,
        pretensao_salarial: form.pretensao_salarial ? parseFloat(form.pretensao_salarial) : null,
        observacoes: form.observacoes || null,
        motivo_inclusao: 'Entrega de currículo',
        data_inclusao: new Date().toISOString(),
      });
      if (eBT) throw eBT;

      setShowCadastrarModal(false);
      setForm({ ...EMPTY_FORM });
      await carregarTalentos();
    } catch (err: any) {
      alert('Erro ao cadastrar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const abrirEditar = (t: Talento) => {
    setForm({
      nome: t.candidato?.nome || '',
      email: t.candidato?.email || '',
      telefone: t.candidato?.telefone || '',
      areas_interesse: t.areas_interesse || [],
      disponibilidade: t.disponibilidade || '',
      pretensao_salarial: t.pretensao_salarial?.toString() || '',
      observacoes: t.observacoes || '',
      status: t.status || 'ativo',
    });
    setShowEditModal(t);
  };

  const salvarEdicao = async () => {
    if (!showEditModal) return;
    setSaving(true);
    try {
      const { error: e1 } = await supabase.from('rh_candidatos').update({
        nome: form.nome, email: form.email || null, telefone: form.telefone || null,
      }).eq('id', showEditModal.candidato_id);
      if (e1) throw e1;

      const { error: e2 } = await supabase.from('banco_talentos').update({
        areas_interesse: form.areas_interesse,
        disponibilidade: form.disponibilidade || null,
        pretensao_salarial: form.pretensao_salarial ? parseFloat(form.pretensao_salarial) : null,
        observacoes: form.observacoes || null,
        status: form.status,
      }).eq('id', showEditModal.id);
      if (e2) throw e2;

      setShowEditModal(null);
      await carregarTalentos();
    } catch (err: any) {
      alert('Erro ao salvar: ' + err.message);
    } finally {
      setSaving(false);
    }
  };

  const excluir = async (t: Talento) => {
    if (!confirm(`Excluir ${t.candidato?.nome} do banco de talentos?`)) return;
    try {
      await supabase.from('banco_talentos').delete().eq('id', t.id);
      await carregarTalentos();
    } catch (err: any) {
      alert('Erro ao excluir: ' + err.message);
    }
  };

  const promover = async (t: Talento) => {
    if (!confirm(`Promover ${t.candidato?.nome} para Banco de Talentos (pós-triagem)?`)) return;
    try {
      await supabase.from('banco_talentos').update({ categoria: 'banco_talentos' }).eq('id', t.id);
      await carregarTalentos();
    } catch (err: any) {
      alert('Erro ao promover: ' + err.message);
    }
  };

  const abrirDocs = (t: Talento) => {
    setDocs(t.candidato?.documentos || []);
    setShowDocsModal(t);
  };

  const uploadDocumento = async (file: File) => {
    if (!showDocsModal) return;
    setUploadingDoc(true);
    try {
      const path = `${showDocsModal.candidato_id}/${Date.now()}-${file.name}`;
      const { data: up, error: eUp } = await supabase.storage
        .from('curriculos-candidatos').upload(path, file, { cacheControl: '3600', upsert: false });
      if (eUp) throw eUp;

      const novoDoc: Documento = {
        nome: file.name, url: up.path, tipo: file.type,
        tamanho: file.size, adicionado_em: new Date().toISOString(),
      };
      const novos = [...docs, novoDoc];
      await supabase.from('rh_candidatos').update({ documentos: novos }).eq('id', showDocsModal.candidato_id);
      setDocs(novos);
    } catch (err: any) {
      alert('Erro ao enviar documento: ' + err.message);
    } finally {
      setUploadingDoc(false);
    }
  };

  const downloadDoc = async (doc: Documento) => {
    const { data, error } = await supabase.storage.from('curriculos-candidatos').createSignedUrl(doc.url, 60);
    if (error || !data) { alert('Erro ao gerar link.'); return; }
    window.open(data.signedUrl, '_blank');
  };

  const excluirDoc = async (doc: Documento) => {
    if (!showDocsModal || !confirm(`Excluir ${doc.nome}?`)) return;
    await supabase.storage.from('curriculos-candidatos').remove([doc.url]);
    const novos = docs.filter(d => d.url !== doc.url);
    await supabase.from('rh_candidatos').update({ documentos: novos }).eq('id', showDocsModal.candidato_id);
    setDocs(novos);
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { color: string; label: string }> = {
      ativo: { color: 'bg-green-900/30 text-green-300', label: 'Ativo' },
      contatado: { color: 'bg-blue-900/30 text-blue-300', label: 'Contatado' },
      contratado: { color: 'bg-amber-900/30 text-amber-300', label: 'Contratado' },
      inativo: { color: 'bg-white/10 text-white/60', label: 'Inativo' },
    };
    const b = map[status] || map.ativo;
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${b.color}`}>{b.label}</span>;
  };

  // Reusable form fields — rendered inline (not a sub-component) to avoid remount issues
  const renderFormFields = (showStatus = false) => (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className="block text-xs text-white/50 mb-1">Nome *</label>
          <input
            className={inp}
            value={form.nome}
            onChange={e => setField('nome', e.target.value)}
            placeholder="Nome completo"
          />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1">E-mail</label>
          <input
            className={inp}
            type="email"
            value={form.email}
            onChange={e => setField('email', e.target.value)}
            placeholder="email@exemplo.com"
          />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1">Telefone</label>
          <input
            className={inp}
            value={form.telefone}
            onChange={e => setField('telefone', e.target.value)}
            placeholder="(00) 00000-0000"
          />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1">Disponibilidade</label>
          <select className={sel} value={form.disponibilidade} onChange={e => setField('disponibilidade', e.target.value)}>
            <option value="">Selecionar</option>
            <option value="imediata">Imediata</option>
            <option value="15_dias">15 dias</option>
            <option value="30_dias">30 dias</option>
            <option value="a_combinar">A combinar</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1">Pretensão Salarial</label>
          <input
            className={inp}
            type="number"
            value={form.pretensao_salarial}
            onChange={e => setField('pretensao_salarial', e.target.value)}
            placeholder="R$ 0,00"
          />
        </div>
        {showStatus && (
          <div className="col-span-2">
            <label className="block text-xs text-white/50 mb-1">Status</label>
            <select className={sel} value={form.status} onChange={e => setField('status', e.target.value)}>
              <option value="ativo">Ativo</option>
              <option value="contatado">Contatado</option>
              <option value="contratado">Contratado</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>
        )}
      </div>

      <div>
        <label className="block text-xs text-white/50 mb-2">Áreas de Interesse</label>
        <div className="flex flex-wrap gap-1.5">
          {AREAS.map(area => (
            <button
              key={area}
              type="button"
              onClick={() => toggleArea(area)}
              className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                form.areas_interesse.includes(area)
                  ? 'bg-[#7D1F2C]/40 border-[#7D1F2C] text-white'
                  : 'border-white/10 text-white/50 hover:border-white/30'
              }`}
            >
              {area}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-xs text-white/50 mb-1">Observações / Resumo</label>
        <textarea
          className={inp + ' resize-none'}
          rows={3}
          value={form.observacoes}
          onChange={e => setField('observacoes', e.target.value)}
          placeholder="Experiência, habilidades, objetivo profissional..."
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Users className="w-8 h-8 text-[#7D1F2C]" />
          <div>
            <h2 className="text-2xl font-bold text-white">Banco de Talentos</h2>
            <p className="text-white/50">Candidatos e currículos para futuras oportunidades</p>
          </div>
        </div>
        <button
          onClick={() => { setForm({ ...EMPTY_FORM }); setShowCadastrarModal(true); }}
          className="flex items-center gap-2 px-4 py-2 bg-[#7D1F2C] text-white rounded-xl hover:bg-[#9D2F3C] transition-colors text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          Cadastrar Currículo
        </button>
      </div>

      {/* Category Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 w-fit">
        {(['banco_talentos', 'banco_curriculos'] as const).map(cat => (
          <button
            key={cat}
            onClick={() => setCategoriaTab(cat)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              categoriaTab === cat ? 'bg-[#7D1F2C] text-white' : 'text-white/50 hover:text-white'
            }`}
          >
            {cat === 'banco_talentos' ? <Star className="w-4 h-4" /> : <FileText className="w-4 h-4" />}
            {cat === 'banco_talentos' ? 'Banco de Talentos' : 'Banco de Currículos'}
          </button>
        ))}
      </div>

      <div className="bg-[#12141f] border border-white/10 rounded-xl p-6 space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 w-4 h-4" />
            <input
              type="text"
              placeholder="Buscar por nome, email ou área..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/15 rounded-xl text-white text-sm placeholder-white/30 focus:outline-none focus:border-[#7D1F2C]/60"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-white/30" />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="bg-[#0e1019] border border-white/15 rounded-xl px-3 py-2 text-white text-sm focus:outline-none"
            >
              <option value="ativo">Ativos</option>
              <option value="contatado">Contatados</option>
              <option value="contratado">Contratados</option>
              <option value="inativo">Inativos</option>
              <option value="todos">Todos</option>
            </select>
          </div>
        </div>

        {/* Cards */}
        {loading ? (
          <div className="flex justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#7D1F2C]" />
          </div>
        ) : filteredTalentos.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-14 h-14 text-white/20 mx-auto mb-3" />
            <p className="text-white/40 text-sm">
              {categoriaTab === 'banco_curriculos' ? 'Nenhum currículo cadastrado.' : 'Nenhum talento encontrado.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredTalentos.map(talento => (
              <div key={talento.id} className="bg-white/3 border border-white/10 rounded-xl p-4 flex flex-col gap-3 hover:border-white/20 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-white truncate">{talento.candidato?.nome}</h3>
                    <div className="mt-1">{getStatusBadge(talento.status)}</div>
                  </div>
                  {categoriaTab === 'banco_curriculos' && (
                    <span className="shrink-0 px-2 py-0.5 bg-amber-900/20 text-amber-400 text-xs rounded-full border border-amber-800/30">Currículo</span>
                  )}
                  {categoriaTab === 'banco_talentos' && talento.candidatura?.vaga && (
                    <span className="shrink-0 px-2 py-0.5 bg-blue-900/20 text-blue-300 text-xs rounded-full border border-blue-800/30 truncate max-w-[90px]">{talento.candidatura.vaga.titulo}</span>
                  )}
                </div>

                <div className="space-y-1.5 text-sm text-white/50">
                  {talento.candidato?.email && (
                    <div className="flex items-center gap-2"><Mail className="w-3.5 h-3.5 shrink-0 text-white/30" /><span className="truncate">{talento.candidato.email}</span></div>
                  )}
                  {talento.candidato?.telefone && (
                    <div className="flex items-center gap-2"><Phone className="w-3.5 h-3.5 shrink-0 text-white/30" /><span>{talento.candidato.telefone}</span></div>
                  )}
                  {talento.pretensao_salarial > 0 && (
                    <div className="flex items-center gap-2"><DollarSign className="w-3.5 h-3.5 shrink-0 text-white/30" /><span>R$ {talento.pretensao_salarial.toLocaleString('pt-BR')}</span></div>
                  )}
                  {talento.areas_interesse?.length > 0 && (
                    <div className="flex items-start gap-2">
                      <Briefcase className="w-3.5 h-3.5 shrink-0 text-white/30 mt-0.5" />
                      <div className="flex flex-wrap gap-1">
                        {talento.areas_interesse.slice(0, 3).map((a, i) => (
                          <span key={i} className="px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded text-xs">{a}</span>
                        ))}
                        {talento.areas_interesse.length > 3 && <span className="text-white/30 text-xs">+{talento.areas_interesse.length - 3}</span>}
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-xs text-white/30">
                    <Calendar className="w-3.5 h-3.5" />
                    {new Date(talento.data_inclusao).toLocaleDateString('pt-BR')}
                  </div>
                </div>

                <div className="flex gap-1.5 mt-auto pt-2 border-t border-white/5 flex-wrap">
                  <button onClick={() => { setSelectedTalento(talento); setShowFicha(true); }}
                    className="flex items-center gap-1 px-2 py-1.5 bg-blue-600/20 text-blue-300 rounded-lg hover:bg-blue-600/30 text-xs transition-colors">
                    <Eye className="w-3.5 h-3.5" /> Ficha
                  </button>
                  <button onClick={() => abrirDocs(talento)}
                    className="flex items-center gap-1 px-2 py-1.5 bg-white/5 text-white/60 rounded-lg hover:bg-white/10 text-xs transition-colors">
                    <FileText className="w-3.5 h-3.5" /> Docs
                  </button>
                  <button onClick={() => abrirEditar(talento)}
                    className="flex items-center gap-1 px-2 py-1.5 bg-white/5 text-white/60 rounded-lg hover:bg-white/10 text-xs transition-colors">
                    <Edit2 className="w-3.5 h-3.5" /> Editar
                  </button>
                  {categoriaTab === 'banco_curriculos' && (
                    <button onClick={() => promover(talento)}
                      className="flex items-center gap-1 px-2 py-1.5 bg-green-600/20 text-green-300 rounded-lg hover:bg-green-600/30 text-xs transition-colors">
                      <ArrowUpCircle className="w-3.5 h-3.5" /> Promover
                    </button>
                  )}
                  <button onClick={() => excluir(talento)}
                    className="flex items-center gap-1 px-2 py-1.5 bg-red-600/10 text-red-400 rounded-lg hover:bg-red-600/20 text-xs transition-colors ml-auto">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Cadastrar Currículo Modal ── */}
      {showCadastrarModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#12141f] border border-white/15 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h3 className="text-lg font-bold text-white">Cadastrar Currículo</h3>
              <button onClick={() => setShowCadastrarModal(false)} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-5">
              <div className="bg-amber-900/20 border border-amber-800/30 rounded-xl p-3 text-xs text-amber-300">
                Candidato que entregou currículo. Ficará no <strong>Banco de Currículos</strong> e pode ser promovido para Banco de Talentos após triagem.
              </div>

              {/* AI Upload */}
              <div>
                <p className="text-xs text-white/50 mb-2">Anexar currículo e preencher com IA</p>
                <input
                  type="file"
                  ref={cvFileRef}
                  className="hidden"
                  accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                  onChange={e => {
                    if (e.target.files?.[0]) extrairDadosCurriculo(e.target.files[0]);
                  }}
                />
                <button
                  type="button"
                  onClick={() => cvFileRef.current?.click()}
                  disabled={extractingAI}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-[#7D1F2C]/40 rounded-xl text-white/60 hover:border-[#7D1F2C] hover:text-white transition-colors text-sm disabled:opacity-50"
                >
                  {extractingAI ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Lendo currículo com IA...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4 text-amber-400" />
                      Enviar currículo — IA preenche automaticamente
                    </>
                  )}
                </button>
                {extractingAI && (
                  <p className="text-xs text-white/30 text-center mt-1">Aguarde, o Claude está analisando o arquivo...</p>
                )}
              </div>

              <div className="relative">
                <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-white/10" /></div>
                <div className="relative flex justify-center"><span className="bg-[#12141f] px-3 text-xs text-white/30">ou preencha manualmente</span></div>
              </div>

              {renderFormFields(false)}

              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowCadastrarModal(false)}
                  className="flex-1 px-4 py-2 border border-white/15 text-white/70 rounded-xl hover:bg-white/5 text-sm">
                  Cancelar
                </button>
                <button onClick={cadastrarCurriculo} disabled={saving}
                  className="flex-1 px-4 py-2 bg-[#7D1F2C] text-white rounded-xl hover:bg-[#9D2F3C] disabled:opacity-50 text-sm font-medium">
                  {saving ? 'Salvando...' : 'Cadastrar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Modal ── */}
      {showEditModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#12141f] border border-white/15 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h3 className="text-lg font-bold text-white">Editar Candidato</h3>
              <button onClick={() => setShowEditModal(null)} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-5">
              {renderFormFields(true)}
              <div className="flex gap-3 pt-2">
                <button onClick={() => setShowEditModal(null)}
                  className="flex-1 px-4 py-2 border border-white/15 text-white/70 rounded-xl hover:bg-white/5 text-sm">
                  Cancelar
                </button>
                <button onClick={salvarEdicao} disabled={saving}
                  className="flex-1 px-4 py-2 bg-[#7D1F2C] text-white rounded-xl hover:bg-[#9D2F3C] disabled:opacity-50 text-sm font-medium">
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Documents Modal ── */}
      {showDocsModal && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#12141f] border border-white/15 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h3 className="text-lg font-bold text-white">Documentos — {showDocsModal.candidato?.nome}</h3>
              <button onClick={() => setShowDocsModal(null)} className="text-white/40 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-5 space-y-4">
              <input type="file" ref={docFileRef} className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={e => { if (e.target.files?.[0]) uploadDocumento(e.target.files[0]); }} />
              <button onClick={() => docFileRef.current?.click()} disabled={uploadingDoc}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-white/15 rounded-xl text-white/50 hover:border-[#7D1F2C]/60 hover:text-white/80 transition-colors text-sm disabled:opacity-50">
                {uploadingDoc ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                {uploadingDoc ? 'Enviando...' : 'Clique para anexar (PDF, Word, Imagem — máx. 10MB)'}
              </button>

              {docs.length === 0 ? (
                <div className="text-center py-8 text-white/30 text-sm">Nenhum documento anexado.</div>
              ) : (
                <div className="space-y-2">
                  {docs.map((doc, i) => (
                    <div key={i} className="flex items-center gap-3 bg-white/5 rounded-xl px-3 py-2.5">
                      <FileText className="w-4 h-4 text-white/40 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-white truncate">{doc.nome}</p>
                        <p className="text-xs text-white/30">{(doc.tamanho / 1024).toFixed(1)} KB · {new Date(doc.adicionado_em).toLocaleDateString('pt-BR')}</p>
                      </div>
                      <button onClick={() => downloadDoc(doc)} className="p-1.5 text-white/40 hover:text-white transition-colors"><Download className="w-4 h-4" /></button>
                      <button onClick={() => excluirDoc(doc)} className="p-1.5 text-red-400/60 hover:text-red-400 transition-colors"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {showFicha && selectedTalento && (
        <FichaCandidato
          talento={selectedTalento}
          onClose={() => { setShowFicha(false); setSelectedTalento(null); }}
          onUpdate={carregarTalentos}
        />
      )}
    </div>
  );
}
