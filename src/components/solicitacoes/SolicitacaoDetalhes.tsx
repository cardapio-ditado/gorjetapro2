import React, { useState, useEffect } from 'react';
import { X, Calendar, User, Building, Package, DollarSign, Clock, MessageSquare, FileText, Download, CreditCard as Edit, CheckCircle, XCircle, AlertTriangle, Star, Upload, Settings, Wrench, ShoppingCart, TrendingUp, AlertCircle, Info } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';
import { ReportGenerator } from '../../utils/reportGenerator';

interface SolicitacaoDetalhesProps {
  isOpen: boolean;
  onClose: () => void;
  solicitacao: any;
  onUpdate: () => void;
}

interface Comentario {
  id: string;
  autor_nome: string;
  comentario: string;
  tipo_comentario: string;
  criado_em: string;
}

interface Anexo {
  id: string;
  nome_arquivo: string;
  caminho_storage: string;
  tipo_arquivo?: string;
  tamanho_bytes?: number;
  enviado_por?: string;
  criado_em: string;
}

interface HistoricoItem {
  id: string;
  tipo_alteracao: string;
  campo_alterado?: string;
  valor_anterior?: string;
  valor_novo?: string;
  descricao: string;
  usuario: string;
  criado_em: string;
}

const AnexoFoto: React.FC<{ anexo: any; onDownload: (a: any) => void; onDelete: (id: string, path: string) => void }> = ({ anexo, onDownload, onDelete }) => {
  const [url, setUrl] = React.useState<string | null>(null);
  const [lightbox, setLightbox] = React.useState(false);

  React.useEffect(() => {
    supabase.storage.from('solicitacoes-anexos').createSignedUrl(anexo.caminho_storage, 3600)
      .then(({ data }) => { if (data) setUrl(data.signedUrl); });
  }, [anexo.caminho_storage]);

  return (
    <>
      <div className="relative aspect-square group rounded-xl overflow-hidden border border-white/10 cursor-pointer" onClick={() => setLightbox(true)}>
        {url ? (
          <img src={url} alt={anexo.nome_arquivo} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-white/5 flex items-center justify-center">
            <div className="w-5 h-5 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
          </div>
        )}
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center">
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
            <button onClick={e => { e.stopPropagation(); onDownload(anexo); }} className="w-7 h-7 rounded-lg bg-blue-500/80 text-white flex items-center justify-center hover:bg-blue-500">
              <Download className="w-3.5 h-3.5" />
            </button>
            <button onClick={e => { e.stopPropagation(); onDelete(anexo.id, anexo.caminho_storage); }} className="w-7 h-7 rounded-lg bg-red-500/80 text-white flex items-center justify-center hover:bg-red-500">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent px-1.5 py-1 opacity-0 group-hover:opacity-100 transition-all">
          <p className="text-[9px] text-white/80 truncate">{anexo.nome_arquivo}</p>
        </div>
      </div>

      {lightbox && url && (
        <div className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4" onClick={() => setLightbox(false)}>
          <button className="absolute top-4 right-4 w-9 h-9 rounded-full bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition-all">
            <X className="w-5 h-5" />
          </button>
          <img src={url} alt={anexo.nome_arquivo} className="max-w-full max-h-full object-contain rounded-xl" onClick={e => e.stopPropagation()} />
          <p className="absolute bottom-6 text-sm text-white/50">{anexo.nome_arquivo}</p>
        </div>
      )}
    </>
  );
};

const SolicitacaoDetalhes: React.FC<SolicitacaoDetalhesProps> = ({
  isOpen,
  onClose,
  solicitacao,
  onUpdate
}) => {
  const [comentarios, setComentarios] = useState<Comentario[]>([]);
  const [anexos, setAnexos] = useState<Anexo[]>([]);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  const [novoComentario, setNovoComentario] = useState('');
  const [tipoComentario, setTipoComentario] = useState('geral');
  const [loading, setLoading] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'detalhes' | 'comentarios' | 'anexos' | 'historico'>('detalhes');

  useEffect(() => {
    if (isOpen && solicitacao) {
      fetchComentarios();
      fetchAnexos();
      fetchHistorico();
    }
  }, [isOpen, solicitacao]);

  const fetchComentarios = async () => {
    try {
      const { data, error } = await supabase
        .from('comentarios_solicitacao')
        .select('*')
        .eq('solicitacao_id', solicitacao.id)
        .order('criado_em', { ascending: true });

      if (error) throw error;
      setComentarios(data || []);
    } catch (err) {
      console.error('Error fetching comments:', err);
    }
  };

  const fetchAnexos = async () => {
    try {
      const { data, error } = await supabase
        .from('solicitacoes_anexos')
        .select('*')
        .eq('solicitacao_id', solicitacao.id)
        .order('criado_em', { ascending: false });

      if (error) throw error;
      setAnexos(data || []);
    } catch (err) {
      console.error('Error fetching attachments:', err);
    }
  };

  const fetchHistorico = async () => {
    try {
      const { data, error } = await supabase
        .from('solicitacoes_historico')
        .select('*')
        .eq('solicitacao_id', solicitacao.id)
        .order('criado_em', { ascending: false });

      if (error) throw error;
      setHistorico(data || []);
    } catch (err) {
      console.error('Error fetching history:', err);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      setUploadingFile(true);
      setError(null);

      const fileExt = file.name.split('.').pop();
      const fileName = `${solicitacao.id}/${Date.now()}.${fileExt}`;

      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('solicitacoes-anexos')
        .upload(fileName, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (uploadError) throw uploadError;

      const { error: dbError } = await supabase
        .from('solicitacoes_anexos')
        .insert([{
          solicitacao_id: solicitacao.id,
          nome_arquivo: file.name,
          caminho_storage: uploadData.path,
          tipo_arquivo: file.type,
          tamanho_bytes: file.size,
          enviado_por: 'Usuário Sistema'
        }]);

      if (dbError) throw dbError;

      await fetchAnexos();
      await fetchHistorico();
      alert('Arquivo anexado com sucesso!');
    } catch (err) {
      console.error('Error uploading file:', err);
      setError('Erro ao fazer upload do arquivo. Verifique o tamanho e tipo do arquivo.');
    } finally {
      setUploadingFile(false);
      if (event.target) {
        event.target.value = '';
      }
    }
  };

  const handleDownloadAnexo = async (anexo: Anexo) => {
    try {
      const { data, error } = await supabase.storage
        .from('solicitacoes-anexos')
        .download(anexo.caminho_storage);

      if (error) throw error;

      const url = URL.createObjectURL(data);
      const a = document.createElement('a');
      a.href = url;
      a.download = anexo.nome_arquivo;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Error downloading file:', err);
      alert('Erro ao baixar o arquivo');
    }
  };

  const handleDeleteAnexo = async (anexoId: string, caminhoStorage: string) => {
    if (!confirm('Tem certeza que deseja excluir este anexo?')) return;

    try {
      await supabase.storage
        .from('solicitacoes-anexos')
        .remove([caminhoStorage]);

      const { error } = await supabase
        .from('solicitacoes_anexos')
        .delete()
        .eq('id', anexoId);

      if (error) throw error;

      await fetchAnexos();
      await fetchHistorico();
      alert('Anexo excluído com sucesso!');
    } catch (err) {
      console.error('Error deleting attachment:', err);
      alert('Erro ao excluir anexo');
    }
  };

  const adicionarComentario = async () => {
    if (!novoComentario.trim()) return;

    try {
      setLoading(true);
      
      const { error } = await supabase
        .from('comentarios_solicitacao')
        .insert([{
          solicitacao_id: solicitacao.id,
          autor_nome: 'Usuário Sistema', // TODO: Pegar do contexto
          comentario: novoComentario,
          tipo_comentario: tipoComentario
        }]);

      if (error) throw error;

      setNovoComentario('');
      setTipoComentario('geral');
      fetchComentarios();
      fetchHistorico();
    } catch (err) {
      console.error('Error adding comment:', err);
      setError('Erro ao adicionar comentário');
    } finally {
      setLoading(false);
    }
  };

  const atualizarStatus = async (novoStatus: string, observacoes?: string) => {
    try {
      setLoading(true);

      const updateData: any = {
        status: novoStatus
      };

      // Não há campos data_inicio_execucao, data_conclusao ou observacoes_execucao na tabela
      // Esses campos foram removidos do código

      const { error } = await supabase
        .from('solicitacoes')
        .update(updateData)
        .eq('id', solicitacao.id);

      if (error) throw error;

      // Adicionar comentário automático sobre mudança de status
      await supabase
        .from('comentarios_solicitacao')
        .insert([{
          solicitacao_id: solicitacao.id,
          autor_nome: 'Sistema',
          comentario: `Status alterado para: ${getStatusText(novoStatus)}${observacoes ? `. Observações: ${observacoes}` : ''}`,
          tipo_comentario: 'execucao'
        }]);

      onUpdate();
      fetchComentarios();
      fetchHistorico();
    } catch (err) {
      console.error('Error updating status:', err);
      setError('Erro ao atualizar status');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'rascunho':
        return 'text-white/50 bg-white/10';
      case 'enviado':
        return 'text-blue-300 bg-blue-900/30';
      case 'em_analise':
        return 'text-yellow-300 bg-yellow-900/30';
      case 'aprovado':
        return 'text-green-300 bg-green-900/30';
      case 'em_execucao':
        return 'text-purple-300 bg-purple-900/30';
      case 'aguardando_orcamento':
        return 'text-orange-300 bg-orange-900/30';
      case 'orcamento_aprovado':
        return 'text-indigo-700 bg-indigo-100';
      case 'concluido':
        return 'text-green-300 bg-green-900/30';
      case 'rejeitado':
        return 'text-red-300 bg-red-900/30';
      case 'cancelado':
        return 'text-white/50 bg-white/10';
      default:
        return 'text-white/50 bg-white/10';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'rascunho':
        return 'Rascunho';
      case 'enviado':
        return 'Enviado';
      case 'em_analise':
        return 'Em Análise';
      case 'aprovado':
        return 'Aprovado';
      case 'em_execucao':
        return 'Em Execução';
      case 'aguardando_orcamento':
        return 'Aguardando Orçamento';
      case 'orcamento_aprovado':
        return 'Orçamento Aprovado';
      case 'concluido':
        return 'Concluído';
      case 'rejeitado':
        return 'Rejeitado';
      case 'cancelado':
        return 'Cancelado';
      default:
        return status;
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getTipoComentarioColor = (tipo: string) => {
    switch (tipo) {
      case 'tecnico':
        return 'border-l-blue-500 bg-blue-500/10';
      case 'financeiro':
        return 'border-l-green-500 bg-green-500/10';
      case 'aprovacao':
        return 'border-l-purple-500 bg-purple-500/10';
      case 'execucao':
        return 'border-l-orange-500 bg-orange-500/10';
      default:
        return 'border-l-gray-500 bg-white/5';
    }
  };

  const getTipoHistoricoIcon = (tipo: string) => {
    switch (tipo) {
      case 'criacao':
        return <Star className="w-5 h-5 text-blue-400" />;
      case 'status':
        return <TrendingUp className="w-5 h-5 text-green-400" />;
      case 'financeiro':
        return <DollarSign className="w-5 h-5 text-emerald-600" />;
      case 'dados':
        return <Edit className="w-5 h-5 text-orange-400" />;
      case 'comentario':
        return <MessageSquare className="w-5 h-5 text-purple-400" />;
      case 'anexo':
        return <FileText className="w-5 h-5 text-blue-400" />;
      default:
        return <Info className="w-5 h-5 text-white/70" />;
    }
  };

  const getTipoHistoricoColor = (tipo: string) => {
    switch (tipo) {
      case 'criacao':
        return 'bg-blue-500/10 border-blue-200';
      case 'status':
        return 'bg-green-500/10 border-green-200';
      case 'financeiro':
        return 'bg-emerald-50 border-emerald-200';
      case 'dados':
        return 'bg-orange-500/10 border-orange-200';
      case 'comentario':
        return 'bg-purple-500/10 border-purple-200';
      case 'anexo':
        return 'bg-blue-500/10 border-blue-200';
      default:
        return 'bg-white/5 border-white/10';
    }
  };

  const getTipoHistoricoTexto = (tipo: string) => {
    switch (tipo) {
      case 'criacao':
        return 'Criação';
      case 'status':
        return 'Mudança de Status';
      case 'financeiro':
        return 'Alteração Financeira';
      case 'dados':
        return 'Atualização de Dados';
      case 'comentario':
        return 'Novo Comentário';
      case 'anexo':
        return 'Anexo';
      default:
        return tipo;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
      <div className="bg-[#0f1020] rounded-lg w-full max-w-6xl max-h-[95vh] overflow-hidden border border-white/10">
        <div className="flex justify-between items-center p-6 border-b border-white/10">
          <div>
            <h3 className="text-lg font-medium text-white">
              {solicitacao.numero_solicitacao} - {solicitacao.titulo}
            </h3>
            <div className="flex items-center space-x-2 mt-1">
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(solicitacao.status)}`}>
                {getStatusText(solicitacao.status)}
              </span>
              <span className="text-sm text-white/50">
                Criado em {dayjs(solicitacao.data_solicitacao).format('DD/MM/YYYY')}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/30 hover:text-white/70"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {error && (
          <div className="m-6 p-4 bg-red-900/30 text-red-300 rounded-lg">
            {error}
          </div>
        )}

        <div className="flex h-[calc(95vh-140px)]">
          {/* Sidebar com Tabs */}
          <div className="w-64 border-r border-white/10 p-4">
            <nav className="space-y-2">
              <button
                onClick={() => setActiveTab('detalhes')}
                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'detalhes'
                    ? 'bg-[#7D1F2C] text-white'
                    : 'text-white/80 hover:bg-white/10'
                }`}
              >
                <FileText className="w-4 h-4 mr-2" />
                Detalhes
              </button>
              <button
                onClick={() => setActiveTab('comentarios')}
                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'comentarios'
                    ? 'bg-[#7D1F2C] text-white'
                    : 'text-white/80 hover:bg-white/10'
                }`}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Comentários ({comentarios.length})
              </button>
              <button
                onClick={() => setActiveTab('anexos')}
                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'anexos'
                    ? 'bg-[#7D1F2C] text-white'
                    : 'text-white/80 hover:bg-white/10'
                }`}
              >
                <FileText className="w-4 h-4 mr-2" />
                Anexos ({anexos.length})
              </button>
              <button
                onClick={() => setActiveTab('historico')}
                className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  activeTab === 'historico'
                    ? 'bg-[#7D1F2C] text-white'
                    : 'text-white/80 hover:bg-white/10'
                }`}
              >
                <Clock className="w-4 h-4 mr-2" />
                Histórico
              </button>
            </nav>

            {/* Ações Rápidas */}
            <div className="mt-6 space-y-2">
              <h4 className="text-sm font-medium text-white/50 mb-2">Ações Rápidas</h4>
              
              {solicitacao.status === 'aprovado' && (
                <button
                  onClick={() => atualizarStatus('em_execucao')}
                  className="w-full px-3 py-2 bg-purple-600 text-white text-sm rounded-md hover:bg-purple-700"
                >
                  <Settings className="w-4 h-4 inline mr-1" />
                  Iniciar Execução
                </button>
              )}

              {solicitacao.status === 'em_execucao' && (
                <button
                  onClick={() => atualizarStatus('concluido')}
                  className="w-full px-3 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
                >
                  <CheckCircle className="w-4 h-4 inline mr-1" />
                  Marcar Concluído
                </button>
              )}

              {['enviado', 'em_analise'].includes(solicitacao.status) && (
                <>
                  <button
                    onClick={() => atualizarStatus('aprovado')}
                    className="w-full px-3 py-2 bg-green-600 text-white text-sm rounded-md hover:bg-green-700"
                  >
                    <CheckCircle className="w-4 h-4 inline mr-1" />
                    Aprovar
                  </button>
                  <button
                    onClick={() => atualizarStatus('rejeitado')}
                    className="w-full px-3 py-2 bg-red-600 text-white text-sm rounded-md hover:bg-red-700"
                  >
                    <XCircle className="w-4 h-4 inline mr-1" />
                    Rejeitar
                  </button>
                </>
              )}
            </div>
          </div>

          {/* Conteúdo Principal */}
          <div className="flex-1 p-6 overflow-y-auto">
            {activeTab === 'detalhes' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-md font-medium text-white mb-3">Informações da Solicitação</h4>
                    <div className="space-y-3">
                      <div>
                        <span className="text-sm text-white/70">Número:</span>
                        <span className="ml-2 font-medium">{solicitacao.numero_solicitacao}</span>
                      </div>
                      <div>
                        <span className="text-sm text-white/70">Tipo:</span>
                        <span className="ml-2 font-medium">{solicitacao.tipo_nome}</span>
                      </div>
                      <div>
                        <span className="text-sm text-white/70">Prioridade:</span>
                        <span className="ml-2 font-medium">{solicitacao.prioridade}</span>
                      </div>
                      <div>
                        <span className="text-sm text-white/70">Status:</span>
                        <span className={`ml-2 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(solicitacao.status)}`}>
                          {getStatusText(solicitacao.status)}
                        </span>
                      </div>
                      <div>
                        <span className="text-sm text-white/70">Data Solicitação:</span>
                        <span className="ml-2 font-medium">
                          {dayjs(solicitacao.data_solicitacao).format('DD/MM/YYYY HH:mm')}
                        </span>
                      </div>
                      {solicitacao.data_limite && (
                        <div>
                          <span className="text-sm text-white/70">Data Limite:</span>
                          <span className={`ml-2 font-medium ${
                            dayjs(solicitacao.data_limite).isBefore(dayjs()) ? 'text-red-400' : ''
                          }`}>
                            {dayjs(solicitacao.data_limite).format('DD/MM/YYYY')}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div>
                    <h4 className="text-md font-medium text-white mb-3">Dados do Solicitante</h4>
                    <div className="space-y-3">
                      <div>
                        <span className="text-sm text-white/70">Nome:</span>
                        <span className="ml-2 font-medium">{solicitacao.solicitante_nome}</span>
                      </div>
                      <div>
                        <span className="text-sm text-white/70">Setor:</span>
                        <span className="ml-2 font-medium">{solicitacao.setor_solicitante}</span>
                      </div>
                      {solicitacao.solicitante_email && (
                        <div>
                          <span className="text-sm text-white/70">Email:</span>
                          <span className="ml-2 font-medium">{solicitacao.solicitante_email}</span>
                        </div>
                      )}
                      {solicitacao.local_servico && (
                        <div>
                          <span className="text-sm text-white/70">Local:</span>
                          <span className="ml-2 font-medium">{solicitacao.local_servico}</span>
                        </div>
                      )}
                      {solicitacao.equipamento_afetado && (
                        <div>
                          <span className="text-sm text-white/70">Equipamento:</span>
                          <span className="ml-2 font-medium">{solicitacao.equipamento_afetado}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-md font-medium text-white mb-3">Descrição</h4>
                  <div className="p-4 bg-white/5 rounded-lg">
                    <p className="text-white/80">{solicitacao.descricao}</p>
                  </div>
                </div>

                {solicitacao.detalhes_tecnicos && (
                  <div>
                    <h4 className="text-md font-medium text-white mb-3">Detalhes Técnicos</h4>
                    <div className="p-4 bg-blue-500/10 rounded-lg border-l-4 border-blue-400">
                      <p className="text-white/80">{solicitacao.detalhes_tecnicos}</p>
                    </div>
                  </div>
                )}

                {(solicitacao.valor_estimado > 0 || solicitacao.valor_total_orcado > 0) && (
                  <div>
                    <h4 className="text-md font-medium text-white mb-3">Informações Financeiras</h4>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {solicitacao.valor_estimado > 0 && (
                        <div className="p-4 bg-white/5 rounded-lg">
                          <div className="text-sm text-white/70">Valor Estimado</div>
                          <div className="text-lg font-bold text-white">
                            {formatCurrency(solicitacao.valor_estimado)}
                          </div>
                        </div>
                      )}
                      {solicitacao.valor_total_orcado > 0 && (
                        <div className="p-4 bg-blue-500/10 rounded-lg">
                          <div className="text-sm text-white/70">Valor Orçado</div>
                          <div className="text-lg font-bold text-blue-400">
                            {formatCurrency(solicitacao.valor_total_orcado)}
                          </div>
                        </div>
                      )}
                      {solicitacao.valor_aprovado > 0 && (
                        <div className="p-4 bg-green-500/10 rounded-lg">
                          <div className="text-sm text-white/70">Valor Aprovado</div>
                          <div className="text-lg font-bold text-green-400">
                            {formatCurrency(solicitacao.valor_aprovado)}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'comentarios' && (
              <div className="space-y-6">
                <div>
                  <h4 className="text-md font-medium text-white mb-4">Comentários</h4>
                  
                  {/* Adicionar novo comentário */}
                  <div className="mb-6 p-4 bg-white/5 rounded-lg">
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-3">
                      <div className="md:col-span-3">
                        <textarea
                          value={novoComentario}
                          onChange={(e) => setNovoComentario(e.target.value)}
                          className="w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                          rows={3}
                          placeholder="Adicionar comentário..."
                        />
                      </div>
                      <div className="space-y-2">
                        <select
                          value={tipoComentario}
                          onChange={(e) => setTipoComentario(e.target.value)}
                          className="w-full text-sm rounded-md border-white/20 shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                        >
                          <option value="geral">Geral</option>
                          <option value="tecnico">Técnico</option>
                          <option value="financeiro">Financeiro</option>
                          <option value="aprovacao">Aprovação</option>
                          <option value="execucao">Execução</option>
                        </select>
                        <button
                          onClick={adicionarComentario}
                          disabled={loading || !novoComentario.trim()}
                          className="w-full px-3 py-2 bg-[#7D1F2C] text-white text-sm rounded-md hover:bg-[#6a1a25] disabled:opacity-50"
                        >
                          Adicionar
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Lista de comentários */}
                  <div className="space-y-4">
                    {comentarios.map((comentario) => (
                      <div key={comentario.id} className={`p-4 rounded-lg border-l-4 ${getTipoComentarioColor(comentario.tipo_comentario)}`}>
                        <div className="flex justify-between items-start mb-2">
                          <div>
                            <span className="font-medium text-white">{comentario.autor_nome}</span>
                            <span className="ml-2 text-xs text-white/50 capitalize">
                              ({comentario.tipo_comentario})
                            </span>
                          </div>
                          <span className="text-xs text-white/50">
                            {dayjs(comentario.criado_em).format('DD/MM/YYYY HH:mm')}
                          </span>
                        </div>
                        <p className="text-white/80">{comentario.comentario}</p>
                      </div>
                    ))}

                    {comentarios.length === 0 && (
                      <div className="text-center py-8">
                        <MessageSquare className="w-12 h-12 text-white/30 mx-auto mb-4" />
                        <p className="text-white/50">Nenhum comentário ainda</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'anexos' && (
              <div className="space-y-5">
                <div className="flex justify-between items-center">
                  <h4 className="text-sm font-bold text-white/60 uppercase tracking-wide">
                    Fotos e Arquivos
                    {anexos.length > 0 && <span className="ml-2 text-white/30 font-normal normal-case tracking-normal">({anexos.length})</span>}
                  </h4>
                  <label className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                    uploadingFile
                      ? 'bg-white/5 text-white/30 cursor-not-allowed'
                      : 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30'
                  }`}>
                    <Upload className="w-3.5 h-3.5" />
                    {uploadingFile ? 'Enviando...' : 'Adicionar'}
                    <input
                      type="file"
                      className="hidden"
                      onChange={handleFileUpload}
                      disabled={uploadingFile}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.jpg,.jpeg,.png,.gif,.webp"
                    />
                  </label>
                </div>

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                {/* Grid de fotos */}
                {anexos.some(a => a.tipo_arquivo?.startsWith('image/')) && (
                  <div>
                    <p className="text-xs font-semibold text-white/30 uppercase tracking-wide mb-2">Fotos</p>
                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                      {anexos.filter(a => a.tipo_arquivo?.startsWith('image/')).map((anexo) => (
                        <AnexoFoto key={anexo.id} anexo={anexo} onDownload={handleDownloadAnexo} onDelete={handleDeleteAnexo} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Lista de arquivos não-imagem */}
                {anexos.some(a => !a.tipo_arquivo?.startsWith('image/')) && (
                  <div>
                    <p className="text-xs font-semibold text-white/30 uppercase tracking-wide mb-2">Arquivos</p>
                    <div className="space-y-2">
                      {anexos.filter(a => !a.tipo_arquivo?.startsWith('image/')).map((anexo) => (
                        <div key={anexo.id} className="flex items-center justify-between p-3 border border-white/10 rounded-xl hover:bg-white/5 transition-all">
                          <div className="flex items-center flex-1 min-w-0">
                            <div className="w-8 h-8 rounded-lg bg-white/8 flex items-center justify-center mr-3 shrink-0">
                              <FileText className="w-4 h-4 text-white/30" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-white truncate">{anexo.nome_arquivo}</p>
                              <p className="text-xs text-white/35">
                                {anexo.tamanho_bytes && `${(anexo.tamanho_bytes / 1024 / 1024).toFixed(1)} MB · `}
                                {dayjs(anexo.criado_em).format('DD/MM HH:mm')}
                                {anexo.enviado_por && ` · ${anexo.enviado_por}`}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 ml-2 shrink-0">
                            <button onClick={() => handleDownloadAnexo(anexo)} className="w-7 h-7 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 flex items-center justify-center transition-all" title="Baixar">
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button onClick={() => handleDeleteAnexo(anexo.id, anexo.caminho_storage)} className="w-7 h-7 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 flex items-center justify-center transition-all" title="Excluir">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {anexos.length === 0 && (
                  <div className="text-center py-12 border-2 border-dashed border-white/8 rounded-xl">
                    <FileText className="w-10 h-10 text-white/15 mx-auto mb-3" />
                    <p className="text-sm font-medium text-white/30">Nenhum arquivo ainda</p>
                    <p className="text-xs text-white/20 mt-1">Clique em "Adicionar" para enviar fotos ou documentos</p>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'historico' && (
              <div className="space-y-4">
                <div className="flex justify-between items-center mb-4">
                  <h4 className="text-md font-medium text-white">Histórico Completo</h4>
                  <span className="text-sm text-white/50">
                    {historico.length} {historico.length === 1 ? 'registro' : 'registros'}
                  </span>
                </div>

                {historico.length > 0 ? (
                  <div className="relative">
                    {/* Linha do tempo */}
                    <div className="absolute left-6 top-0 bottom-0 w-0.5 bg-gray-200"></div>

                    <div className="space-y-6">
                      {historico.map((item, index) => (
                        <div key={item.id} className="relative pl-16">
                          {/* Ícone na timeline */}
                          <div className="absolute left-3 top-1 bg-white p-1 rounded-full border-2 border-white/10">
                            {getTipoHistoricoIcon(item.tipo_alteracao)}
                          </div>

                          {/* Conteúdo do histórico */}
                          <div className={`p-4 rounded-lg border ${getTipoHistoricoColor(item.tipo_alteracao)}`}>
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex-1">
                                <div className="flex items-center space-x-2 mb-1">
                                  <span className="text-sm font-semibold text-white">
                                    {getTipoHistoricoTexto(item.tipo_alteracao)}
                                  </span>
                                  {item.campo_alterado && (
                                    <span className="text-xs text-white/50 bg-white px-2 py-0.5 rounded">
                                      {item.campo_alterado}
                                    </span>
                                  )}
                                </div>
                                <p className="text-sm text-white/80">{item.descricao}</p>

                                {/* Mostrar valores anterior e novo se existirem */}
                                {(item.valor_anterior || item.valor_novo) && item.tipo_alteracao !== 'status' && item.tipo_alteracao !== 'comentario' && (
                                  <div className="mt-2 grid grid-cols-2 gap-3 text-xs">
                                    {item.valor_anterior && (
                                      <div className="bg-white bg-opacity-50 p-2 rounded">
                                        <div className="text-white/50 mb-1">Valor Anterior</div>
                                        <div className="font-medium text-white/80 truncate">
                                          {item.valor_anterior}
                                        </div>
                                      </div>
                                    )}
                                    {item.valor_novo && (
                                      <div className="bg-white bg-opacity-50 p-2 rounded">
                                        <div className="text-white/50 mb-1">Novo Valor</div>
                                        <div className="font-medium text-white/80 truncate">
                                          {item.valor_novo}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="text-right ml-4">
                                <div className="text-xs text-white/50">
                                  {dayjs(item.criado_em).format('DD/MM/YYYY')}
                                </div>
                                <div className="text-xs text-white/50">
                                  {dayjs(item.criado_em).format('HH:mm')}
                                </div>
                                {item.usuario && item.usuario !== 'Sistema' && (
                                  <div className="text-xs text-white/70 mt-1 font-medium">
                                    {item.usuario}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Clock className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <p className="text-white/50 text-lg mb-2">Nenhum histórico disponível</p>
                    <p className="text-white/30 text-sm">
                      As alterações nesta solicitação aparecerão aqui
                    </p>
                  </div>
                )}

                {/* Estatísticas do histórico */}
                {historico.length > 0 && (
                  <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="bg-blue-500/10 p-3 rounded-lg">
                      <div className="text-xs text-blue-400 mb-1">Status</div>
                      <div className="text-lg font-bold text-blue-400">
                        {historico.filter(h => h.tipo_alteracao === 'status').length}
                      </div>
                    </div>
                    <div className="bg-emerald-50 p-3 rounded-lg">
                      <div className="text-xs text-emerald-600 mb-1">Financeiro</div>
                      <div className="text-lg font-bold text-emerald-700">
                        {historico.filter(h => h.tipo_alteracao === 'financeiro').length}
                      </div>
                    </div>
                    <div className="bg-purple-500/10 p-3 rounded-lg">
                      <div className="text-xs text-purple-400 mb-1">Comentários</div>
                      <div className="text-lg font-bold text-purple-400">
                        {historico.filter(h => h.tipo_alteracao === 'comentario').length}
                      </div>
                    </div>
                    <div className="bg-orange-500/10 p-3 rounded-lg">
                      <div className="text-xs text-orange-400 mb-1">Anexos</div>
                      <div className="text-lg font-bold text-orange-400">
                        {historico.filter(h => h.tipo_alteracao === 'anexo').length}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SolicitacaoDetalhes;