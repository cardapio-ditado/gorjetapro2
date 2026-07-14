import React, { useState, useRef } from 'react';
import { Package, CheckCircle, AlertCircle, Camera, X, Image as ImageIcon, Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';

interface FotoPreview {
  file: File;
  preview: string;
}

const MAX_FOTOS = 5;
const MAX_SIZE_MB = 10;

export default function SolicitacaoPublica() {
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [numeroSolicitacao, setNumeroSolicitacao] = useState('');
  const [fotos, setFotos] = useState<FotoPreview[]>([]);
  const [uploadProgress, setUploadProgress] = useState('');
  const fotoInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    titulo: '',
    descricao: '',
    solicitante_nome: '',
    solicitante_email: '',
    solicitante_telefone: '',
    local_servico: '',
    equipamento_afetado: ''
  });

  const handleFotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const disponiveis = MAX_FOTOS - fotos.length;
    if (disponiveis <= 0) return;

    const novas: FotoPreview[] = [];
    for (const file of files.slice(0, disponiveis)) {
      if (file.size > MAX_SIZE_MB * 1024 * 1024) continue;
      if (!file.type.startsWith('image/')) continue;
      novas.push({ file, preview: URL.createObjectURL(file) });
    }
    setFotos(prev => [...prev, ...novas]);
    if (e.target) e.target.value = '';
  };

  const removerFoto = (index: number) => {
    setFotos(prev => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const uploadFotos = async (solicitacaoId: string) => {
    for (let i = 0; i < fotos.length; i++) {
      const { file } = fotos[i];
      setUploadProgress(`Enviando foto ${i + 1} de ${fotos.length}...`);
      const ext = file.name.split('.').pop() ?? 'jpg';
      const path = `${solicitacaoId}/${Date.now()}-${i}.${ext}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('solicitacoes-anexos')
        .upload(path, file, { cacheControl: '3600', upsert: false });

      if (uploadError) {
        console.error('Erro upload foto:', uploadError);
        continue;
      }

      await supabase.from('solicitacoes_anexos').insert({
        solicitacao_id: solicitacaoId,
        nome_arquivo: file.name,
        caminho_storage: uploadData.path,
        tipo_arquivo: file.type,
        tamanho_bytes: file.size,
        enviado_por: formData.solicitante_nome || 'Solicitante'
      });
    }
    setUploadProgress('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase
        .from('solicitacoes')
        .insert({
          titulo: formData.titulo,
          descricao: formData.descricao,
          solicitante_nome: formData.solicitante_nome,
          solicitante_email: formData.solicitante_email || null,
          solicitante_telefone: formData.solicitante_telefone || null,
          local_servico: formData.local_servico || null,
          equipamento_afetado: formData.equipamento_afetado || null,
          origem: 'publica',
          status: 'enviado',
          prioridade: 'normal',
          data_solicitacao: new Date().toISOString()
        })
        .select()
        .single();

      if (error) throw error;

      if (fotos.length > 0) {
        await uploadFotos(data.id);
      }

      setNumeroSolicitacao(data.numero_solicitacao);
      setSuccess(true);
      fotos.forEach(f => URL.revokeObjectURL(f.preview));
      setFotos([]);
      setFormData({
        titulo: '',
        descricao: '',
        solicitante_nome: '',
        solicitante_email: '',
        solicitante_telefone: '',
        local_servico: '',
        equipamento_afetado: ''
      });
    } catch (error) {
      console.error('Erro ao enviar solicitação:', error);
      alert('Erro ao enviar solicitação. Tente novamente.');
    } finally {
      setLoading(false);
      setUploadProgress('');
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  if (success) {
    return (
      <div className="min-h-screen bg-[#0d0f1a] flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-[#12141f] rounded-2xl p-8 text-center border border-white/10">
          <div className="w-16 h-16 bg-emerald-500/15 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-10 h-10 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-bold text-white mb-2">Solicitação Enviada!</h2>
          <p className="text-white/50 mb-5">Sua solicitação foi registrada com sucesso.</p>
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6">
            <p className="text-xs text-white/40 mb-1 uppercase tracking-wide font-bold">Número da Solicitação</p>
            <p className="text-3xl font-black text-blue-400">{numeroSolicitacao}</p>
          </div>
          <p className="text-sm text-white/35 mb-6">
            Guarde este número para acompanhar o andamento. Nossa equipe irá analisar e entrar em contato em breve.
          </p>
          <button
            onClick={() => { setSuccess(false); setNumeroSolicitacao(''); }}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold"
          >
            Fazer Nova Solicitação
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0f1a] py-12 px-4">
      <div className="max-w-3xl mx-auto">
        <div className="bg-[#12141f] rounded-2xl overflow-hidden border border-white/10">

          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-8 py-6">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/15 rounded-xl flex items-center justify-center">
                <Package className="w-7 h-7 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-white">Nova Solicitação</h1>
                <p className="text-blue-100 text-sm">Preencha o formulário para fazer sua solicitação</p>
              </div>
            </div>
          </div>

          {/* Aviso */}
          <div className="bg-blue-500/8 border-l-4 border-blue-500 px-6 py-4">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-blue-300 font-semibold mb-1">Informações Importantes</p>
                <ul className="text-sm text-blue-300/80 space-y-0.5">
                  <li>• Descreva detalhadamente o que precisa</li>
                  <li>• Informe o local onde o serviço deve ser realizado</li>
                  <li>• Fotos ajudam muito a equipe entender o problema</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Formulário */}
          <form onSubmit={handleSubmit} className="p-8 space-y-8">

            {/* Dados do Solicitante */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-white/40 uppercase tracking-widest">Seus Dados</h3>

              <div>
                <label className="block text-sm font-semibold text-white/70 mb-2">
                  Seu Nome <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="solicitante_nome"
                  value={formData.solicitante_nome}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 bg-white/5 border border-white/15 rounded-xl text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all"
                  placeholder="Digite seu nome completo"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-white/70 mb-2">Email (opcional)</label>
                  <input
                    type="email"
                    name="solicitante_email"
                    value={formData.solicitante_email}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-white/5 border border-white/15 rounded-xl text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all"
                    placeholder="seu@email.com"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white/70 mb-2">Telefone (opcional)</label>
                  <input
                    type="tel"
                    name="solicitante_telefone"
                    value={formData.solicitante_telefone}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-white/5 border border-white/15 rounded-xl text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all"
                    placeholder="(00) 00000-0000"
                  />
                </div>
              </div>
            </div>

            {/* Detalhes da Solicitação */}
            <div className="space-y-4">
              <h3 className="text-sm font-black text-white/40 uppercase tracking-widest">Detalhes da Solicitação</h3>

              <div>
                <label className="block text-sm font-semibold text-white/70 mb-2">
                  Título <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="titulo"
                  value={formData.titulo}
                  onChange={handleChange}
                  required
                  className="w-full px-4 py-3 bg-white/5 border border-white/15 rounded-xl text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all"
                  placeholder="Ex: Conserto de ar condicionado, Compra de materiais..."
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-white/70 mb-2">
                  Descrição Detalhada <span className="text-red-400">*</span>
                </label>
                <textarea
                  name="descricao"
                  value={formData.descricao}
                  onChange={handleChange}
                  required
                  rows={5}
                  className="w-full px-4 py-3 bg-white/5 border border-white/15 rounded-xl text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all resize-none"
                  placeholder="Descreva detalhadamente o que você precisa, incluindo o motivo e qualquer informação relevante..."
                />
                <p className="text-xs text-white/30 mt-1">Quanto mais detalhes, mais rápido atendemos</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-white/70 mb-2">Local do Serviço</label>
                  <input
                    type="text"
                    name="local_servico"
                    value={formData.local_servico}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-white/5 border border-white/15 rounded-xl text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all"
                    placeholder="Ex: Salão, Cozinha, Bar..."
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-white/70 mb-2">Equipamento Afetado</label>
                  <input
                    type="text"
                    name="equipamento_afetado"
                    value={formData.equipamento_afetado}
                    onChange={handleChange}
                    className="w-full px-4 py-3 bg-white/5 border border-white/15 rounded-xl text-white placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all"
                    placeholder="Ex: Ar condicionado, Impressora..."
                  />
                </div>
              </div>
            </div>

            {/* Upload de Fotos */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-white/40 uppercase tracking-widest">
                  Fotos <span className="text-white/20 font-normal normal-case tracking-normal">(opcional)</span>
                </h3>
                <span className="text-xs text-white/30">{fotos.length}/{MAX_FOTOS} fotos</span>
              </div>

              {/* Área de drop / botão */}
              {fotos.length < MAX_FOTOS && (
                <label className="block cursor-pointer">
                  <input
                    ref={fotoInputRef}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={handleFotoSelect}
                  />
                  <div className="border-2 border-dashed border-white/15 rounded-xl p-6 flex flex-col items-center gap-2 hover:border-blue-500/40 hover:bg-blue-500/5 transition-all group">
                    <div className="w-10 h-10 rounded-xl bg-white/8 flex items-center justify-center group-hover:bg-blue-500/15 transition-all">
                      <Camera className="w-5 h-5 text-white/30 group-hover:text-blue-400 transition-all" />
                    </div>
                    <p className="text-sm font-semibold text-white/40 group-hover:text-white/60 transition-all">
                      Clique para adicionar fotos
                    </p>
                    <p className="text-xs text-white/20">
                      Até {MAX_FOTOS} fotos · máx. {MAX_SIZE_MB}MB cada · JPG, PNG, WEBP
                    </p>
                  </div>
                </label>
              )}

              {/* Previews */}
              {fotos.length > 0 && (
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {fotos.map((foto, i) => (
                    <div key={i} className="relative aspect-square group">
                      <img
                        src={foto.preview}
                        alt={`Foto ${i + 1}`}
                        className="w-full h-full object-cover rounded-lg border border-white/10"
                      />
                      <button
                        type="button"
                        onClick={() => removerFoto(i)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600"
                      >
                        <X className="w-3 h-3" />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 rounded-b-lg px-1 py-0.5">
                        <p className="text-[9px] text-white/60 truncate">{foto.file.name}</p>
                      </div>
                    </div>
                  ))}
                  {fotos.length < MAX_FOTOS && (
                    <label className="aspect-square border-2 border-dashed border-white/10 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-blue-500/30 hover:bg-blue-500/5 transition-all">
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        className="hidden"
                        onChange={handleFotoSelect}
                      />
                      <ImageIcon className="w-5 h-5 text-white/20" />
                      <span className="text-[9px] text-white/25 mt-1">Mais</span>
                    </label>
                  )}
                </div>
              )}
            </div>

            {/* Botões */}
            <div className="flex gap-3 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => {
                  setFormData({ titulo: '', descricao: '', solicitante_nome: '', solicitante_email: '', solicitante_telefone: '', local_servico: '', equipamento_afetado: '' });
                  fotos.forEach(f => URL.revokeObjectURL(f.preview));
                  setFotos([]);
                }}
                className="px-6 py-3 border border-white/15 text-white/60 rounded-xl hover:bg-white/5 transition-colors font-medium"
              >
                Limpar
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-xl hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    {uploadProgress || 'Enviando...'}
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Enviar Solicitação{fotos.length > 0 ? ` + ${fotos.length} foto${fotos.length > 1 ? 's' : ''}` : ''}
                  </>
                )}
              </button>
            </div>
          </form>
        </div>

        <div className="text-center mt-6 text-sm text-white/30">
          <p>Após o envio você receberá um número de protocolo.</p>
        </div>
      </div>
    </div>
  );
}
