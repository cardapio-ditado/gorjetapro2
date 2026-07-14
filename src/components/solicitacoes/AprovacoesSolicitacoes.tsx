import React, { useState, useEffect } from 'react';
import { 
  CheckSquare,
  XSquare,
  Clock,
  AlertTriangle,
  Search,
  Filter,
  DollarSign,
  Building2,
  Eye,
  MessageSquare,
  Star,
  Calendar,
  User,
  CheckCircle,
  XCircle,
  FileText
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';

interface SolicitacaoPendente {
  id: string;
  numero_solicitacao: string;
  titulo: string;
  tipo_nome: string;
  tipo_categoria: string;
  descricao: string;
  prioridade: string;
  status: string;
  solicitante_nome: string;
  setor_solicitante: string;
  valor_estimado: number;
  valor_total_orcado: number;
  data_solicitacao: string;
  data_limite?: string;
  total_anexos: number;
  total_comentarios: number;
}

const AprovacoesSolicitacoes: React.FC = () => {
  const [solicitacoesPendentes, setSolicitacoesPendentes] = useState<SolicitacaoPendente[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedSolicitacoes, setSelectedSolicitacoes] = useState<Set<string>>(new Set());
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalType, setApprovalType] = useState<'approve' | 'reject'>('approve');
  const [observacaoAprovacao, setObservacaoAprovacao] = useState('');
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [prioridadeFilter, setPrioridadeFilter] = useState('all');
  const [tipoFilter, setTipoFilter] = useState('all');
  const [setorFilter, setSetorFilter] = useState('all');
  const [valorMinimo, setValorMinimo] = useState('');
  const [valorMaximo, setValorMaximo] = useState('');

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    fetchData();
  }, [prioridadeFilter, tipoFilter, setorFilter, valorMinimo, valorMaximo]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('solicitacoes')
        .select(`
          *,
          tipos_solicitacao!inner(
            nome,
            tipo_categoria
          )
        `)
        .in('status', ['enviado', 'em_analise']);

      // Aplicar filtros
      if (prioridadeFilter !== 'all') {
        query = query.eq('prioridade', prioridadeFilter);
      }

      if (tipoFilter !== 'all') {
        query = query.eq('tipos_solicitacao.tipo_categoria', tipoFilter);
      }

      if (setorFilter !== 'all') {
        query = query.eq('setor_solicitante', setorFilter);
      }

      if (valorMinimo) {
        query = query.gte('valor_estimado', parseFloat(valorMinimo));
      }

      if (valorMaximo) {
        query = query.lte('valor_estimado', parseFloat(valorMaximo));
      }

      const { data, error } = await query.order('data_solicitacao', { ascending: true });

      if (error) throw error;
      
      // Transform data to match expected interface
      const transformedData = (data || []).map((item: any) => ({
        ...item,
        tipo_nome: item.tipos_solicitacao?.nome || '',
        tipo_categoria: item.tipos_solicitacao?.tipo_categoria || '',
        total_anexos: 0, // Will be calculated separately when needed
        total_comentarios: 0 // Will be calculated separately when needed
      }));
      
      setSolicitacoesPendentes(transformedData);
    } catch (err) {
      console.error('Error fetching pending requests:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar solicitações');
    } finally {
      setLoading(false);
    }
  };

  const handleApproval = async (solicitacaoIds: string[], aprovado: boolean, observacao?: string) => {
    try {
      setLoading(true);
      setError(null);

      for (const solicitacaoId of solicitacaoIds) {
        const updateData = {
          status: aprovado ? 'aprovado' : 'rejeitado',
          data_aprovacao: new Date().toISOString(),
          observacoes_aprovacao: observacao || null
        };

        const { error } = await supabase
          .from('solicitacoes')
          .update(updateData)
          .eq('id', solicitacaoId);

        if (error) throw error;

        // Adicionar comentário automático
        await supabase
          .from('comentarios_solicitacao')
          .insert([{
            solicitacao_id: solicitacaoId,
            autor_nome: 'Sistema - Aprovação',
            comentario: `Solicitação ${aprovado ? 'aprovada' : 'rejeitada'}${observacao ? `. Observações: ${observacao}` : ''}`,
            tipo_comentario: 'aprovacao'
          }]);
      }

      setSelectedSolicitacoes(new Set());
      setShowApprovalModal(false);
      setObservacaoAprovacao('');
      fetchData();
    } catch (err) {
      console.error('Error updating approval:', err);
      setError(err instanceof Error ? err.message : 'Erro ao processar aprovação');
    } finally {
      setLoading(false);
    }
  };

  const handleSingleApproval = async (solicitacaoId: string, aprovado: boolean) => {
    await handleApproval([solicitacaoId], aprovado);
  };

  const handleBulkApproval = (type: 'approve' | 'reject') => {
    if (selectedSolicitacoes.size === 0) {
      alert('Selecione pelo menos uma solicitação');
      return;
    }
    setApprovalType(type);
    setShowApprovalModal(true);
  };

  const toggleSolicitacaoSelection = (solicitacaoId: string) => {
    const newSelected = new Set(selectedSolicitacoes);
    if (newSelected.has(solicitacaoId)) {
      newSelected.delete(solicitacaoId);
    } else {
      newSelected.add(solicitacaoId);
    }
    setSelectedSolicitacoes(newSelected);
  };

  const filteredSolicitacoes = solicitacoesPendentes.filter(solicitacao => {
    const matchesSearch = solicitacao.titulo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         solicitacao.numero_solicitacao.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         solicitacao.solicitante_nome.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getPrioridadeColor = (prioridade: string) => {
    switch (prioridade) {
      case 'baixa':
        return 'text-green-300 bg-green-900/30';
      case 'normal':
        return 'text-blue-300 bg-blue-900/30';
      case 'alta':
        return 'text-orange-300 bg-orange-900/30';
      case 'urgente':
        return 'text-red-300 bg-red-900/30';
      case 'critica':
        return 'text-red-300 bg-red-200 border border-red-300';
      default:
        return 'text-white/50 bg-white/10';
    }
  };

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'manutencao_preventiva':
      case 'manutencao_corretiva':
        return <CheckSquare className="w-4 h-4" />;
      case 'aquisicao_equipamento':
      case 'aquisicao_material':
        return <FileText className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-white">Solicitações Aguardando Aprovação</h3>
        <div className="flex space-x-2">
          <button
            onClick={() => handleBulkApproval('approve')}
            disabled={selectedSolicitacoes.size === 0}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            <CheckSquare className="w-4 h-4 inline mr-2" />
            Aprovar Selecionadas ({selectedSolicitacoes.size})
          </button>
          <button
            onClick={() => handleBulkApproval('reject')}
            disabled={selectedSolicitacoes.size === 0}
            className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
          >
            <XSquare className="w-4 h-4 inline mr-2" />
            Rejeitar Selecionadas ({selectedSolicitacoes.size})
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 text-red-300 rounded-lg">
          {error}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-[#12141f] p-4 rounded-lg shadow-sm border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="md:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/30 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar solicitações..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-white/20 bg-white/5 rounded-lg focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
              />
            </div>
          </div>

          <div>
            <select
              value={prioridadeFilter}
              onChange={(e) => setPrioridadeFilter(e.target.value)}
              className="w-full border border-white/20 bg-white/5 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            >
              <option value="all">Todas as Prioridades</option>
              <option value="critica">Crítica</option>
              <option value="urgente">Urgente</option>
              <option value="alta">Alta</option>
              <option value="normal">Normal</option>
              <option value="baixa">Baixa</option>
            </select>
          </div>

          <div>
            <select
              value={tipoFilter}
              onChange={(e) => setTipoFilter(e.target.value)}
              className="w-full border border-white/20 bg-white/5 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            >
              <option value="all">Todos os Tipos</option>
              <option value="manutencao_preventiva">Manutenção Preventiva</option>
              <option value="manutencao_corretiva">Manutenção Corretiva</option>
              <option value="aquisicao_equipamento">Aquisição Equipamento</option>
              <option value="aquisicao_material">Aquisição Material</option>
              <option value="aquisicao_servico">Contratação Serviço</option>
            </select>
          </div>

          <div>
            <input
              type="number"
              placeholder="Valor mínimo"
              value={valorMinimo}
              onChange={(e) => setValorMinimo(e.target.value)}
              className="w-full border border-white/20 bg-white/5 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            />
          </div>

          <div>
            <input
              type="number"
              placeholder="Valor máximo"
              value={valorMaximo}
              onChange={(e) => setValorMaximo(e.target.value)}
              className="w-full border border-white/20 bg-white/5 text-white rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            />
          </div>
        </div>
      </div>

      {/* Lista de Solicitações */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]"></div>
        </div>
      ) : (
        <div className="bg-[#12141f] rounded-lg shadow-sm border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left bg-white/5 border-b border-white/10">
                  <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      checked={selectedSolicitacoes.size === filteredSolicitacoes.length && filteredSolicitacoes.length > 0}
                      onChange={() => {
                        if (selectedSolicitacoes.size === filteredSolicitacoes.length) {
                          setSelectedSolicitacoes(new Set());
                        } else {
                          setSelectedSolicitacoes(new Set(filteredSolicitacoes.map(s => s.id)));
                        }
                      }}
                      className="rounded border-white/20 text-[#7D1F2C] focus:ring-[#7D1F2C]"
                    />
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                    Prioridade
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                    Solicitação
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                    Solicitante
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                    Valor
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                    Prazo
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-transparent divide-y divide-white/10">
                {filteredSolicitacoes.map((solicitacao) => (
                  <tr 
                    key={solicitacao.id} 
                    className={`hover:bg-white/5 ${
                      selectedSolicitacoes.has(solicitacao.id) ? 'bg-blue-500/10' : ''
                    } ${
                      solicitacao.prioridade === 'critica' ? 'border-l-4 border-red-500' : 
                      solicitacao.prioridade === 'urgente' ? 'border-l-4 border-orange-500' : ''
                    }`}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <input
                        type="checkbox"
                        checked={selectedSolicitacoes.has(solicitacao.id)}
                        onChange={() => toggleSolicitacaoSelection(solicitacao.id)}
                        className="rounded border-white/20 text-[#7D1F2C] focus:ring-[#7D1F2C]"
                      />
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getPrioridadeColor(solicitacao.prioridade)}`}>
                        {solicitacao.prioridade === 'critica' && <AlertTriangle className="w-3 h-3 mr-1" />}
                        {solicitacao.prioridade === 'urgente' && <Star className="w-3 h-3 mr-1" />}
                        {solicitacao.prioridade}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-white">{solicitacao.numero_solicitacao}</div>
                        <div className="text-sm font-medium text-white/80">{solicitacao.titulo}</div>
                        <div className="text-sm text-white/50 truncate max-w-xs">
                          {solicitacao.descricao}
                        </div>
                        <div className="flex items-center mt-1 space-x-2">
                          {solicitacao.total_anexos > 0 && (
                            <span className="text-xs text-blue-400">
                              <FileText className="w-3 h-3 inline mr-1" />
                              {solicitacao.total_anexos} anexo(s)
                            </span>
                          )}
                          {solicitacao.total_comentarios > 0 && (
                            <span className="text-xs text-green-400">
                              <MessageSquare className="w-3 h-3 inline mr-1" />
                              {solicitacao.total_comentarios} comentário(s)
                            </span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-white">{solicitacao.solicitante_nome}</div>
                        <div className="text-sm text-white/50">{solicitacao.setor_solicitante}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        {getTipoIcon(solicitacao.tipo_categoria)}
                        <span className="ml-2 text-sm text-white">{solicitacao.tipo_nome}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        {solicitacao.valor_estimado > 0 && (
                          <div className="text-sm font-medium text-white">
                            Est: {formatCurrency(solicitacao.valor_estimado)}
                          </div>
                        )}
                        {solicitacao.valor_total_orcado > 0 && (
                          <div className="text-sm font-medium text-blue-400">
                            Orç: {formatCurrency(solicitacao.valor_total_orcado)}
                          </div>
                        )}
                        {solicitacao.valor_estimado === 0 && solicitacao.valor_total_orcado === 0 && (
                          <span className="text-sm text-white/30">Sem valor</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm text-white">
                          {dayjs(solicitacao.data_solicitacao).format('DD/MM/YYYY')}
                        </div>
                        {solicitacao.data_limite && (
                          <div className={`text-sm ${
                            dayjs(solicitacao.data_limite).isBefore(dayjs()) ? 'text-red-400' : 'text-white/50'
                          }`}>
                            Limite: {dayjs(solicitacao.data_limite).format('DD/MM/YYYY')}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleSingleApproval(solicitacao.id, true)}
                          className="text-green-400 hover:text-green-300"
                          title="Aprovar"
                        >
                          <CheckSquare className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleSingleApproval(solicitacao.id, false)}
                          className="text-red-400 hover:text-red-300"
                          title="Rejeitar"
                        >
                          <XSquare className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {/* TODO: Ver detalhes */}}
                          className="text-blue-400 hover:text-blue-300"
                          title="Ver Detalhes"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredSolicitacoes.length === 0 && (
            <div className="text-center py-12">
              <CheckSquare className="w-16 h-16 text-white/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">Nenhuma solicitação pendente</h3>
              <p className="text-white/50">
                {searchTerm || prioridadeFilter !== 'all' || tipoFilter !== 'all' 
                  ? 'Nenhuma solicitação corresponde aos filtros aplicados.' 
                  : 'Todas as solicitações foram processadas.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Modal de Aprovação/Rejeição em Lote */}
      {showApprovalModal && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-[#0f1020] rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-white mb-4">
              {approvalType === 'approve' ? 'Aprovar Solicitações' : 'Rejeitar Solicitações'}
            </h3>
            
            <div className="mb-4">
              <p className="text-sm text-white/70 mb-2">
                Você está prestes a {approvalType === 'approve' ? 'aprovar' : 'rejeitar'} {selectedSolicitacoes.size} solicitação(ões).
              </p>
              
              <div className="bg-white/5 p-3 rounded-lg">
                <p className="text-sm font-medium text-white/80">
                  Valor total estimado: {formatCurrency(
                    filteredSolicitacoes
                      .filter(s => selectedSolicitacoes.has(s.id))
                      .reduce((sum, s) => sum + (s.valor_estimado || s.valor_total_orcado || 0), 0)
                  )}
                </p>
              </div>
            </div>

            <div className="mb-4">
              <label className="block text-sm font-medium text-white/80 mb-2">
                Observações {approvalType === 'approve' ? 'da Aprovação' : 'da Rejeição'}
              </label>
              <textarea
                value={observacaoAprovacao}
                onChange={(e) => setObservacaoAprovacao(e.target.value)}
                className="w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                rows={3}
                placeholder={`Digite o motivo da ${approvalType === 'approve' ? 'aprovação' : 'rejeição'}...`}
              />
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setShowApprovalModal(false)}
                className="px-4 py-2 border border-white/20 rounded-md text-white/80 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleApproval(Array.from(selectedSolicitacoes), approvalType === 'approve', observacaoAprovacao)}
                disabled={loading}
                className={`px-4 py-2 text-white rounded-md hover:opacity-90 disabled:opacity-50 ${
                  approvalType === 'approve' ? 'bg-green-600' : 'bg-red-600'
                }`}
              >
                {loading ? 'Processando...' : (approvalType === 'approve' ? 'Aprovar' : 'Rejeitar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AprovacoesSolicitacoes;