import React, { useState, useEffect, useRef } from 'react';
import {
  Users, Upload, FileText, Brain, TrendingUp,
  CheckCircle, XCircle, Clock, Search, Filter,
  Eye, Mail, Phone, Calendar, Award,
  AlertCircle, MessageSquare, Link as LinkIcon,
  Pencil, Trash2, Paperclip, Download, X, Plus
} from 'lucide-react';
import { candidaturaService, vagaService, candidatoService } from '../../services/rhService';
import { supabase } from '../../lib/supabase';
import PreEntrevistaView from './PreEntrevistaView';

interface Candidatura {
  id: string;
  vaga_id: string;
  candidato_id: string;
  status: string;
  etapa_atual: string;
  data_aplicacao: string;
  notas?: Record<string, number>;
  pontuacao_geral?: number;
  parecer_ia?: string;
  recomendacao?: string;
  observacoes?: string;
  vaga?: any;
  candidato?: any;
}

interface Vaga {
  id: string;
  titulo: string;
  status: string;
}

interface Documento {
  nome: string;
  url: string;
  tipo: string;
  tamanho?: number;
  adicionado_em: string;
}

const inp = 'w-full bg-white/5 border border-white/15 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-[#7D1F2C]/60 focus:ring-1 focus:ring-[#7D1F2C]/40 placeholder-white/25';
const sel = inp + ' appearance-none';

const STATUS_MAP: Record<string, { cor: string; label: string }> = {
  novo: { cor: 'bg-blue-500/20 text-blue-300', label: 'Novo' },
  triagem: { cor: 'bg-yellow-500/20 text-yellow-300', label: 'Em Triagem' },
  em_processo: { cor: 'bg-sky-500/20 text-sky-300', label: 'Em Processo' },
  aprovado: { cor: 'bg-emerald-500/20 text-emerald-300', label: 'Aprovado' },
  recusado: { cor: 'bg-red-500/20 text-red-300', label: 'Recusado' },
  banco_talentos: { cor: 'bg-[#D4AF37]/20 text-[#D4AF37]', label: 'Banco de Talentos' },
};

const GestaoCandidaturas: React.FC = () => {
  const [candidaturas, setCandidaturas] = useState<Candidatura[]>([]);
  const [vagas, setVagas] = useState<Vaga[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVaga, setSelectedVaga] = useState<string>('todas');
  const [selectedStatus, setSelectedStatus] = useState<string>('todas');
  const [searchTerm, setSearchTerm] = useState('');
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [selectedCandidatura, setSelectedCandidatura] = useState<Candidatura | null>(null);
  const [showAnaliseModal, setShowAnaliseModal] = useState(false);
  const [preEntrevistas, setPreEntrevistas] = useState<Record<string, any>>({});
  const [showProximaEtapaModal, setShowProximaEtapaModal] = useState(false);

  // Edit candidato
  const [editando, setEditando] = useState<Candidatura | null>(null);
  const [editForm, setEditForm] = useState<Record<string, any>>({});
  const [salvandoEdit, setSalvandoEdit] = useState(false);

  // Documentos
  const [showDocModal, setShowDocModal] = useState(false);
  const [docCandidatura, setDocCandidatura] = useState<Candidatura | null>(null);
  const [documentos, setDocumentos] = useState<Documento[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { carregarDados(); }, [selectedVaga, selectedStatus]);

  const carregarDados = async () => {
    try {
      setLoading(true);
      const [candidaturasData, vagasData] = await Promise.all([
        candidaturaService.listar(
          selectedVaga === 'todas' ? undefined : selectedVaga,
          selectedStatus === 'todas' ? undefined : selectedStatus
        ),
        vagaService.listar()
      ]);
      setCandidaturas(candidaturasData);
      setVagas(vagasData.filter(v => v.status === 'aberta'));

      if (candidaturasData.length > 0) {
        const { data: peData } = await supabase
          .from('rh_pre_entrevistas')
          .select('candidatura_id, status, pontuacao, recomendacao')
          .in('candidatura_id', candidaturasData.map(c => c.id));
        const map: Record<string, any> = {};
        peData?.forEach(pe => { map[pe.candidatura_id] = pe; });
        setPreEntrevistas(map);
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  // ─── Editar candidato ───────────────────────────────────────────────────────
  const abrirEdicao = (c: Candidatura) => {
    setEditando(c);
    setEditForm({
      nome: c.candidato?.nome ?? '',
      email: c.candidato?.email ?? '',
      telefone: c.candidato?.telefone ?? '',
      status: c.status,
      observacoes: c.observacoes ?? '',
    });
  };

  const salvarEdicao = async () => {
    if (!editando) return;
    setSalvandoEdit(true);
    await supabase.from('rh_candidatos').update({
      nome: editForm.nome,
      email: editForm.email,
      telefone: editForm.telefone,
    }).eq('id', editando.candidato_id);
    await candidaturaService.atualizar(editando.id, {
      status: editForm.status,
      observacoes: editForm.observacoes,
    });
    setSalvandoEdit(false);
    setEditando(null);
    carregarDados();
  };

  // ─── Excluir candidatura ────────────────────────────────────────────────────
  const excluirCandidatura = async (c: Candidatura) => {
    if (!confirm(`Excluir a candidatura de "${c.candidato?.nome}"? Esta ação não pode ser desfeita.`)) return;
    await supabase.from('rh_candidaturas').delete().eq('id', c.id);
    carregarDados();
  };

  // ─── Documentos ─────────────────────────────────────────────────────────────
  const abrirDocumentos = async (c: Candidatura) => {
    setDocCandidatura(c);
    const docs: Documento[] = JSON.parse(c.candidato?.documentos ?? '[]') ?? [];
    // Busca documentos atualizados do candidato
    const { data } = await supabase.from('rh_candidatos').select('documentos, curriculo_arquivo_url').eq('id', c.candidato_id).maybeSingle();
    setDocumentos(data?.documentos ?? []);
    setShowDocModal(true);
  };

  const uploadDocumento = async (file: File) => {
    if (!docCandidatura) return;
    setUploadingDoc(true);
    const ext = file.name.split('.').pop() ?? 'pdf';
    const path = `${docCandidatura.candidato_id}/${Date.now()}-${file.name}`;
    const { data: uploadData, error } = await supabase.storage.from('curriculos-candidatos').upload(path, file, { cacheControl: '3600', upsert: false });
    if (error) { alert('Erro no upload: ' + error.message); setUploadingDoc(false); return; }
    const novoDoc: Documento = {
      nome: file.name,
      url: uploadData.path,
      tipo: file.type,
      tamanho: file.size,
      adicionado_em: new Date().toISOString(),
    };
    const novosDocumentos = [...documentos, novoDoc];
    await supabase.from('rh_candidatos').update({ documentos: novosDocumentos }).eq('id', docCandidatura.candidato_id);
    setDocumentos(novosDocumentos);
    setUploadingDoc(false);
  };

  const baixarDocumento = async (doc: Documento) => {
    const { data } = await supabase.storage.from('curriculos-candidatos').createSignedUrl(doc.url, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  };

  const excluirDocumento = async (doc: Documento) => {
    if (!docCandidatura) return;
    if (!confirm(`Excluir "${doc.nome}"?`)) return;
    await supabase.storage.from('curriculos-candidatos').remove([doc.url]);
    const novos = documentos.filter(d => d.url !== doc.url);
    await supabase.from('rh_candidatos').update({ documentos: novos }).eq('id', docCandidatura.candidato_id);
    setDocumentos(novos);
  };

  // ─── IA e pré-entrevista ────────────────────────────────────────────────────
  const handleAnalisarCurriculo = async (candidaturaId: string, curriculoTexto: string) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analisar-curriculo-ia`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}` },
          body: JSON.stringify({ candidatura_id: candidaturaId, curriculo_texto: curriculoTexto })
        }
      );
      if (!response.ok) throw new Error('Erro ao analisar currículo');
      carregarDados();
    } catch (error) {
      console.error('Erro ao analisar currículo:', error);
    }
  };

  const handleGerarLinkPreEntrevista = async (candidatura_id: string) => {
    try {
      const { data: existente } = await supabase.from('rh_pre_entrevistas').select('token').eq('candidatura_id', candidatura_id).maybeSingle();
      let token = existente?.token;
      if (!token) {
        token = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, '0')).join('');
        await supabase.from('rh_pre_entrevistas').insert({ candidatura_id, token, status: 'pendente' });
      }
      const link = `${window.location.origin}/pre-entrevista?token=${token}`;
      await navigator.clipboard.writeText(link);
      alert('Link copiado!\n\n' + link);
      carregarDados();
    } catch (error) {
      alert('Erro ao gerar link: ' + (error as any).message);
    }
  };

  const avancarProximaEtapa = async (decisao: 'entrevista' | 'dispensar' | 'banco_talentos') => {
    if (!selectedCandidatura) return;
    const map = {
      entrevista: { status: 'em_processo', etapa_atual: 'entrevista_pessoal' },
      dispensar: { status: 'recusado', etapa_atual: 'finalizado' },
      banco_talentos: { status: 'banco_talentos', etapa_atual: 'banco_talentos' },
    };
    await candidaturaService.atualizar(selectedCandidatura.id, map[decisao]);
    setShowProximaEtapaModal(false);
    setSelectedCandidatura(null);
    carregarDados();
  };

  const handleUploadCurriculo = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const nome = fd.get('nome') as string;
    const email = fd.get('email') as string;
    const telefone = fd.get('telefone') as string;
    const vaga_id = fd.get('vaga_id') as string;
    const curriculoTexto = fd.get('curriculo_texto') as string;
    try {
      let candidato = await candidatoService.buscarPorEmail(email);
      if (!candidato) candidato = await candidatoService.criar({ nome, email, telefone });
      const candidaturasExistentes = await candidaturaService.listar(vaga_id);
      if (candidaturasExistentes.some(c => c.candidato_id === candidato.id)) { alert('Candidato já se candidatou para esta vaga'); return; }
      const candidatura = await candidaturaService.criar({ vaga_id, candidato_id: candidato.id, curriculo_url: '', status: 'novo', etapa_atual: 'triagem_curriculo' });
      if (curriculoTexto.trim()) await handleAnalisarCurriculo(candidatura.id, curriculoTexto);
      form.reset();
      setShowUploadModal(false);
      carregarDados();
    } catch (error) {
      alert('Erro ao cadastrar: ' + (error as any).message);
    }
  };

  const candidaturasFiltradas = candidaturas.filter(c => {
    const s = searchTerm.toLowerCase();
    return c.candidato?.nome?.toLowerCase().includes(s) || c.candidato?.email?.toLowerCase().includes(s) || c.vaga?.titulo?.toLowerCase().includes(s);
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#7D1F2C]"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-white">Gestão de Candidaturas</h2>
          <p className="text-white/50 text-sm">Análise e acompanhamento de candidatos</p>
        </div>
        <button onClick={() => setShowUploadModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-[#7D1F2C] hover:bg-[#9b2535] text-white rounded-xl text-sm font-medium transition-all">
          <Plus className="w-4 h-4" />Nova Candidatura
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total', val: candidaturas.length, cor: 'text-white', bg: 'bg-white/5' },
          { label: 'Em Triagem', val: candidaturas.filter(c => c.status === 'triagem').length, cor: 'text-yellow-400', bg: 'bg-yellow-500/10' },
          { label: 'Aprovados', val: candidaturas.filter(c => c.status === 'aprovado').length, cor: 'text-emerald-400', bg: 'bg-emerald-500/10' },
          { label: 'Banco Talentos', val: candidaturas.filter(c => c.status === 'banco_talentos').length, cor: 'text-[#D4AF37]', bg: 'bg-[#D4AF37]/10' },
        ].map(k => (
          <div key={k.label} className={`${k.bg} border border-white/10 rounded-xl p-4`}>
            <p className="text-white/50 text-xs">{k.label}</p>
            <p className={`text-2xl font-bold mt-1 ${k.cor}`}>{k.val}</p>
          </div>
        ))}
      </div>

      {/* Filtros */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 w-4 h-4" />
          <input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar por nome, email ou vaga..."
            className="w-full pl-9 pr-4 py-2 bg-white/5 border border-white/15 rounded-xl text-white text-sm focus:outline-none placeholder-white/30" />
        </div>
        <select value={selectedVaga} onChange={e => setSelectedVaga(e.target.value)} className="px-3 py-2 bg-white/5 border border-white/15 rounded-xl text-white text-sm focus:outline-none appearance-none">
          <option value="todas">Todas as Vagas</option>
          {vagas.map(v => <option key={v.id} value={v.id}>{v.titulo}</option>)}
        </select>
        <select value={selectedStatus} onChange={e => setSelectedStatus(e.target.value)} className="px-3 py-2 bg-white/5 border border-white/15 rounded-xl text-white text-sm focus:outline-none appearance-none">
          <option value="todas">Todos os Status</option>
          {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
      </div>

      {/* Lista */}
      {candidaturasFiltradas.length === 0 ? (
        <div className="text-center py-16 text-white/30">
          <Users className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>Nenhuma candidatura encontrada</p>
        </div>
      ) : (
        <div className="space-y-3">
          {candidaturasFiltradas.map(c => {
            const st = STATUS_MAP[c.status] ?? STATUS_MAP.novo;
            const pe = preEntrevistas[c.id];
            return (
              <div key={c.id} className="bg-white/5 border border-white/10 rounded-xl p-5 hover:bg-white/8 transition-all">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap mb-2">
                      <h3 className="text-white font-semibold">{c.candidato?.nome}</h3>
                      <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${st.cor}`}>{st.label}</span>
                      {c.recomendacao && (
                        <span className="text-xs px-2.5 py-1 rounded-full bg-blue-500/20 text-blue-300 flex items-center gap-1">
                          <Brain className="w-3 h-3" />
                          {c.recomendacao === 'apto' ? 'Recomendado IA' : c.recomendacao === 'banco_talentos' ? 'BT IA' : 'Não recom.'}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/50 mb-3">
                      {c.candidato?.email && <span className="flex items-center gap-1"><Mail className="w-3 h-3" />{c.candidato.email}</span>}
                      {c.candidato?.telefone && <span className="flex items-center gap-1"><Phone className="w-3 h-3" />{c.candidato.telefone}</span>}
                      <span className="flex items-center gap-1"><Award className="w-3 h-3" />{c.vaga?.titulo}</span>
                      <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{new Date(c.data_aplicacao).toLocaleDateString('pt-BR')}</span>
                    </div>
                    {c.pontuacao_geral ? (
                      <div className="flex items-center gap-3 max-w-xs">
                        <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-[#7D1F2C] to-[#D4AF37]" style={{ width: `${c.pontuacao_geral}%` }} />
                        </div>
                        <span className="text-xs text-white/60">{c.pontuacao_geral}/100</span>
                      </div>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    {pe?.status === 'concluida' ? (
                      <button onClick={() => { setSelectedCandidatura(c); setShowProximaEtapaModal(true); }}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-medium transition-all">
                        <CheckCircle className="w-3.5 h-3.5" />Próxima Etapa
                      </button>
                    ) : (
                      <button onClick={() => handleGerarLinkPreEntrevista(c.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium transition-all">
                        <LinkIcon className="w-3.5 h-3.5" />{pe ? 'Reenviar' : 'Pré-Entrevista'}
                      </button>
                    )}
                    <button onClick={() => { setSelectedCandidatura(c); setShowAnaliseModal(true); }}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-all">
                      <Eye className="w-3.5 h-3.5" />Detalhes
                    </button>
                    <button onClick={() => abrirDocumentos(c)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white/80 hover:text-white rounded-lg text-xs font-medium transition-all">
                      <Paperclip className="w-3.5 h-3.5" />Documentos
                    </button>
                    <div className="flex gap-1">
                      <button onClick={() => abrirEdicao(c)}
                        className="flex-1 flex items-center justify-center gap-1 px-2 py-1.5 bg-white/5 hover:bg-white/15 text-white/60 hover:text-white rounded-lg text-xs transition-all">
                        <Pencil className="w-3.5 h-3.5" />Editar
                      </button>
                      <button onClick={() => excluirCandidatura(c)}
                        className="flex items-center justify-center px-2 py-1.5 bg-red-500/10 hover:bg-red-500/25 text-red-400 rounded-lg text-xs transition-all">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Modal: Nova Candidatura ─── */}
      {showUploadModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setShowUploadModal(false)}>
          <div className="bg-[#0c0e1a] border border-white/10 rounded-2xl p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-white">Nova Candidatura</h3>
              <button onClick={() => setShowUploadModal(false)} className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleUploadCurriculo} className="space-y-4">
              <div>
                <label className="text-white/60 text-xs mb-1.5 block">Vaga *</label>
                <select name="vaga_id" required className={sel}>
                  <option value="">Selecione uma vaga</option>
                  {vagas.map(v => <option key={v.id} value={v.id}>{v.titulo}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-white/60 text-xs mb-1.5 block">Nome Completo *</label>
                  <input type="text" name="nome" required className={inp} />
                </div>
                <div>
                  <label className="text-white/60 text-xs mb-1.5 block">Email *</label>
                  <input type="email" name="email" required className={inp} />
                </div>
              </div>
              <div>
                <label className="text-white/60 text-xs mb-1.5 block">Telefone</label>
                <input type="tel" name="telefone" className={inp} />
              </div>
              <div>
                <label className="text-white/60 text-xs mb-1.5 block">Currículo (texto)</label>
                <textarea name="curriculo_texto" rows={8} placeholder="Cole o texto do currículo para análise IA..." className={inp + ' resize-none font-mono text-xs'} />
              </div>
              <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-start gap-2">
                <Brain className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-blue-300">O currículo será analisado automaticamente pela IA com base na cultura organizacional.</p>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button type="button" onClick={() => setShowUploadModal(false)} className="px-4 py-2 text-white/60 hover:text-white hover:bg-white/5 rounded-xl text-sm transition-all">Cancelar</button>
                <button type="submit" className="px-6 py-2 bg-[#7D1F2C] hover:bg-[#9b2535] text-white rounded-xl text-sm font-medium transition-all flex items-center gap-2">
                  <Upload className="w-4 h-4" />Cadastrar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─── Modal: Editar Candidatura ─── */}
      {editando && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setEditando(null)}>
          <div className="bg-[#0c0e1a] border border-white/10 rounded-2xl p-6 max-w-lg w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-white">Editar Candidatura</h3>
              <button onClick={() => setEditando(null)} className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-white/60 text-xs mb-1.5 block">Nome</label>
                  <input value={editForm.nome || ''} onChange={e => setEditForm(f => ({ ...f, nome: e.target.value }))} className={inp} />
                </div>
                <div>
                  <label className="text-white/60 text-xs mb-1.5 block">Telefone</label>
                  <input value={editForm.telefone || ''} onChange={e => setEditForm(f => ({ ...f, telefone: e.target.value }))} className={inp} />
                </div>
              </div>
              <div>
                <label className="text-white/60 text-xs mb-1.5 block">Email</label>
                <input value={editForm.email || ''} onChange={e => setEditForm(f => ({ ...f, email: e.target.value }))} className={inp} />
              </div>
              <div>
                <label className="text-white/60 text-xs mb-1.5 block">Status</label>
                <select value={editForm.status || 'novo'} onChange={e => setEditForm(f => ({ ...f, status: e.target.value }))} className={sel}>
                  {Object.entries(STATUS_MAP).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-white/60 text-xs mb-1.5 block">Observações</label>
                <textarea value={editForm.observacoes || ''} onChange={e => setEditForm(f => ({ ...f, observacoes: e.target.value }))} rows={3} className={inp + ' resize-none'} />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setEditando(null)} className="px-4 py-2 text-white/60 hover:text-white hover:bg-white/5 rounded-xl text-sm transition-all">Cancelar</button>
              <button onClick={salvarEdicao} disabled={salvandoEdit}
                className="px-6 py-2 bg-[#7D1F2C] hover:bg-[#9b2535] text-white rounded-xl text-sm font-medium transition-all disabled:opacity-50">
                {salvandoEdit ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: Documentos ─── */}
      {showDocModal && docCandidatura && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setShowDocModal(false)}>
          <div className="bg-[#0c0e1a] border border-white/10 rounded-2xl p-6 max-w-lg w-full max-h-[85vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <div>
                <h3 className="text-lg font-bold text-white">Documentos</h3>
                <p className="text-white/40 text-xs">{docCandidatura.candidato?.nome}</p>
              </div>
              <button onClick={() => setShowDocModal(false)} className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"><X className="w-5 h-5" /></button>
            </div>

            <input ref={fileInputRef} type="file" className="hidden"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
              onChange={async e => { const f = e.target.files?.[0]; if (f) { await uploadDocumento(f); e.target.value = ''; } }} />

            <button onClick={() => fileInputRef.current?.click()} disabled={uploadingDoc}
              className="w-full flex items-center justify-center gap-2 py-3 border-2 border-dashed border-white/20 rounded-xl text-white/50 hover:text-white hover:border-white/40 transition-all text-sm mb-4 disabled:opacity-50">
              {uploadingDoc ? <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />Enviando...</> : <><Paperclip className="w-4 h-4" />Anexar Documento (PDF, Word, Imagem)</>}
            </button>

            {documentos.length === 0 ? (
              <div className="text-center py-8 text-white/30">
                <FileText className="w-10 h-10 mx-auto mb-2 opacity-30" />
                <p className="text-sm">Nenhum documento anexado</p>
              </div>
            ) : (
              <div className="space-y-2">
                {documentos.map((doc, i) => (
                  <div key={i} className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-xl px-4 py-3 hover:bg-white/8 transition-all">
                    <FileText className="w-5 h-5 text-white/40 flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-white text-sm truncate">{doc.nome}</p>
                      {doc.tamanho && <p className="text-white/30 text-xs">{(doc.tamanho / 1024).toFixed(0)} KB</p>}
                    </div>
                    <button onClick={() => baixarDocumento(doc)} className="p-1.5 hover:bg-white/10 rounded-lg text-white/50 hover:text-white transition-all">
                      <Download className="w-4 h-4" />
                    </button>
                    <button onClick={() => excluirDocumento(doc)} className="p-1.5 hover:bg-red-500/20 rounded-lg text-white/30 hover:text-red-400 transition-all">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Modal: Análise detalhada ─── */}
      {showAnaliseModal && selectedCandidatura && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => setShowAnaliseModal(false)}>
          <div className="bg-[#0c0e1a] border border-white/10 rounded-2xl p-6 max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-white">Análise Detalhada — {selectedCandidatura.candidato?.nome}</h3>
              <button onClick={() => setShowAnaliseModal(false)} className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-5">
              {selectedCandidatura.pontuacao_geral && (
                <div>
                  <p className="text-white/60 text-xs mb-2">Pontuação Geral</p>
                  <div className="flex items-center gap-4">
                    <div className="flex-1 h-3 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-[#7D1F2C] to-[#D4AF37]" style={{ width: `${selectedCandidatura.pontuacao_geral}%` }} />
                    </div>
                    <span className="text-2xl font-bold text-white">{selectedCandidatura.pontuacao_geral}/100</span>
                  </div>
                </div>
              )}
              {selectedCandidatura.parecer_ia && (
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                  <div className="flex items-start gap-2">
                    <Brain className="w-5 h-5 text-blue-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-blue-300 text-xs font-semibold mb-1">Parecer da IA</p>
                      <p className="text-blue-200 text-sm">{selectedCandidatura.parecer_ia}</p>
                    </div>
                  </div>
                </div>
              )}
              <PreEntrevistaView candidatura_id={selectedCandidatura.id} />
            </div>
            <div className="flex justify-end pt-4 border-t border-white/10 mt-6">
              <button onClick={() => setShowAnaliseModal(false)} className="px-4 py-2 text-white/60 hover:text-white hover:bg-white/5 rounded-xl text-sm transition-all">Fechar</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal: Próxima Etapa ─── */}
      {showProximaEtapaModal && selectedCandidatura && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4 z-50" onClick={() => { setShowProximaEtapaModal(false); setSelectedCandidatura(null); }}>
          <div className="bg-[#0c0e1a] border border-white/10 rounded-2xl p-6 max-w-md w-full shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">Próxima Etapa</h3>
              <button onClick={() => { setShowProximaEtapaModal(false); setSelectedCandidatura(null); }} className="p-2 hover:bg-white/10 rounded-lg text-white/40 hover:text-white transition-all"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-white font-medium mb-1">{selectedCandidatura.candidato?.nome}</p>
            {preEntrevistas[selectedCandidatura.id]?.pontuacao && (
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 mb-4 flex items-center justify-between">
                <span className="text-blue-300 text-sm">Pontuação Pré-Entrevista</span>
                <span className="text-xl font-bold text-blue-400">{preEntrevistas[selectedCandidatura.id].pontuacao}/100</span>
              </div>
            )}
            <div className="space-y-2 mt-4">
              <button onClick={() => avancarProximaEtapa('entrevista')}
                className="w-full px-4 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl flex items-center gap-3 transition-all">
                <CheckCircle className="w-5 h-5" />
                <div className="text-left"><p className="font-semibold text-sm">Convocar para Entrevista</p><p className="text-xs text-emerald-100">Candidato aprovado na triagem</p></div>
              </button>
              <button onClick={() => avancarProximaEtapa('banco_talentos')}
                className="w-full px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl flex items-center gap-3 transition-all">
                <Award className="w-5 h-5" />
                <div className="text-left"><p className="font-semibold text-sm">Banco de Talentos</p><p className="text-xs text-blue-100">Guardar para futuras oportunidades</p></div>
              </button>
              <button onClick={() => avancarProximaEtapa('dispensar')}
                className="w-full px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl flex items-center gap-3 transition-all">
                <XCircle className="w-5 h-5" />
                <div className="text-left"><p className="font-semibold text-sm">Dispensar</p><p className="text-xs text-red-100">Não seguir com o processo</p></div>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GestaoCandidaturas;
