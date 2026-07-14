import React, { useState, useEffect } from 'react';
import { Package, Search, Clock, User, MapPin, AlertCircle, CheckCircle, XCircle, CreditCard as Edit, Eye, Link as LinkIcon, Calendar } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';

interface SolicitacaoPublica {
  id: string;
  numero_solicitacao: string;
  titulo: string;
  descricao: string;
  solicitante_nome: string;
  solicitante_email: string | null;
  solicitante_telefone: string | null;
  local_servico: string | null;
  equipamento_afetado: string | null;
  status: string;
  prioridade: string;
  enriquecida: boolean;
  data_solicitacao: string;
  criado_em: string;
}

interface EnriquecimentoData {
  tipo_solicitacao_id: string;
  setor_solicitante: string;
  prioridade: string;
  data_limite: string;
  valor_estimado: number;
  observacoes: string;
}

export default function SolicitacoesPublicas() {
  const [solicitacoes, setSolicitacoes] = useState<SolicitacaoPublica[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showEnriquecimentoModal, setShowEnriquecimentoModal] = useState(false);
  const [selectedSolicitacao, setSelectedSolicitacao] = useState<SolicitacaoPublica | null>(null);
  const [tiposSolicitacao, setTiposSolicitacao] = useState<any[]>([]);
  const [enriquecimento, setEnriquecimento] = useState<EnriquecimentoData>({
    tipo_solicitacao_id: '',
    setor_solicitante: '',
    prioridade: 'normal',
    data_limite: '',
    valor_estimado: 0,
    observacoes: ''
  });

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    try {
      setLoading(true);

      // Carregar solicitações públicas pendentes
      const { data: solData, error: solError } = await supabase
        .from('solicitacoes')
        .select('*')
        .eq('origem', 'publica')
        .eq('enriquecida', false)
        .order('criado_em', { ascending: false });

      if (solError) throw solError;
      setSolicitacoes(solData || []);

      // Carregar tipos de solicitação
      const { data: tiposData, error: tiposError } = await supabase
        .from('tipos_solicitacao')
        .select('*')
        .eq('status', true)
        .order('nome');

      if (tiposError) throw tiposError;
      setTiposSolicitacao(tiposData || []);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      alert('Erro ao carregar solicitações públicas');
    } finally {
      setLoading(false);
    }
  };

  const abrirEnriquecimento = (solicitacao: SolicitacaoPublica) => {
    setSelectedSolicitacao(solicitacao);
    setEnriquecimento({
      tipo_solicitacao_id: '',
      setor_solicitante: '',
      prioridade: 'normal',
      data_limite: '',
      valor_estimado: 0,
      observacoes: ''
    });
    setShowEnriquecimentoModal(true);
  };

  const salvarEnriquecimento = async () => {
    if (!selectedSolicitacao) return;

    if (!enriquecimento.tipo_solicitacao_id || !enriquecimento.setor_solicitante) {
      alert('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      const { error } = await supabase
        .from('solicitacoes')
        .update({
          tipo_solicitacao_id: enriquecimento.tipo_solicitacao_id,
          setor_solicitante: enriquecimento.setor_solicitante,
          prioridade: enriquecimento.prioridade,
          data_limite: enriquecimento.data_limite || null,
          valor_estimado: enriquecimento.valor_estimado,
          detalhes_tecnicos: enriquecimento.observacoes,
          enriquecida: true,
          enriquecida_por: 'Sistema',
          data_enriquecimento: new Date().toISOString(),
          status: 'em_analise'
        })
        .eq('id', selectedSolicitacao.id);

      if (error) throw error;

      alert('Solicitação enriquecida com sucesso! Agora ela pode seguir o fluxo normal de aprovação.');
      setShowEnriquecimentoModal(false);
      setSelectedSolicitacao(null);
      carregarDados();
    } catch (error) {
      console.error('Erro ao enriquecer solicitação:', error);
      alert('Erro ao enriquecer solicitação');
    }
  };

  const copiarLink = () => {
    const link = `${window.location.origin}/solicitacao`;
    navigator.clipboard.writeText(link);
    alert('Link copiado! Compartilhe com seus funcionários para que possam fazer solicitações.');
  };

  const filteredSolicitacoes = solicitacoes.filter(s => {
    const searchLower = searchTerm.toLowerCase();
    return (
      s.numero_solicitacao.toLowerCase().includes(searchLower) ||
      s.titulo.toLowerCase().includes(searchLower) ||
      s.solicitante_nome.toLowerCase().includes(searchLower)
    );
  });

  const getPrioridadeColor = (prioridade: string) => {
    const colors = {
      baixa: 'bg-white/10 text-white/80',
      normal: 'bg-blue-500/15 text-blue-400',
      alta: 'bg-orange-500/15 text-orange-400',
      urgente: 'bg-red-500/15 text-red-400',
      critica: 'bg-purple-500/15 text-purple-400'
    };
    return colors[prioridade as keyof typeof colors] || colors.normal;
  };

  return (
    <div className="space-y-6">
      {/* Header com botão de copiar link */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-lg p-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
              <Package className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white">Solicitações Públicas</h2>
              <p className="text-blue-100">
                {filteredSolicitacoes.length} solicitações aguardando enriquecimento
              </p>
            </div>
          </div>
          <button
            onClick={copiarLink}
            className="flex items-center gap-2 px-6 py-3 bg-white text-blue-400 rounded-lg hover:bg-blue-500/10 transition-colors font-medium shadow-lg"
          >
            <LinkIcon className="w-5 h-5" />
            Copiar Link do Formulário
          </button>
        </div>
      </div>

      {/* Informações */}
      <div className="bg-blue-500/10 border-l-4 border-blue-400 p-4 rounded-r-lg">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-sm text-blue-300 font-medium mb-1">
              Sobre Solicitações Públicas
            </p>
            <p className="text-sm text-blue-300">
              Estas solicitações foram feitas por funcionários através do formulário público.
              Elas precisam ser enriquecidas com informações técnicas antes de seguirem para aprovação.
            </p>
          </div>
        </div>
      </div>

      {/* Busca */}
      <div className="bg-[#12141f] rounded-xl shadow-sm p-4 border border-white/10">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/30 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar por número, título ou solicitante..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 border border-white/20 bg-white/5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          />
        </div>
      </div>

      {/* Lista de Solicitações */}
      {loading ? (
        <div className="text-center py-12">
          <p className="text-white/70">Carregando solicitações...</p>
        </div>
      ) : filteredSolicitacoes.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl shadow-sm">
          <Package className="w-16 h-16 text-white/30 mx-auto mb-4" />
          <p className="text-white/70">Nenhuma solicitação pública pendente</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {filteredSolicitacoes.map((solicitacao) => (
            <div
              key={solicitacao.id}
              className="bg-[#12141f] rounded-xl shadow-sm border border-white/10 hover:shadow-lg transition-shadow"
            >
              <div className="p-6 space-y-4">
                {/* Header */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-sm font-mono text-white/50">
                        {solicitacao.numero_solicitacao}
                      </span>
                      <span className="px-2 py-1 bg-yellow-500/15 text-yellow-400 text-xs rounded-full font-medium">
                        Pendente
                      </span>
                    </div>
                    <h3 className="text-lg font-semibold text-white">
                      {solicitacao.titulo}
                    </h3>
                  </div>
                </div>

                {/* Descrição */}
                <p className="text-sm text-white/70 line-clamp-3">
                  {solicitacao.descricao}
                </p>

                {/* Informações */}
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-white/70">
                    <User className="w-4 h-4" />
                    <span>{solicitacao.solicitante_nome}</span>
                  </div>

                  {solicitacao.local_servico && (
                    <div className="flex items-center gap-2 text-white/70">
                      <MapPin className="w-4 h-4" />
                      <span>{solicitacao.local_servico}</span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-white/70">
                    <Calendar className="w-4 h-4" />
                    <span>
                      {dayjs(solicitacao.data_solicitacao).format('DD/MM/YYYY HH:mm')}
                    </span>
                  </div>
                </div>

                {/* Botão de Enriquecer */}
                <button
                  onClick={() => abrirEnriquecimento(solicitacao)}
                  className="w-full px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
                >
                  <Edit className="w-5 h-5" />
                  Enriquecer Solicitação
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal de Enriquecimento */}
      {showEnriquecimentoModal && selectedSolicitacao && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1020] rounded-xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto border border-white/10">
            <div className="sticky top-0 bg-[#0f1020] border-b border-white/10 px-6 py-4">
              <h3 className="text-xl font-bold text-white">
                Enriquecer Solicitação
              </h3>
              <p className="text-sm text-white/70 mt-1">
                {selectedSolicitacao.numero_solicitacao}
              </p>
            </div>

            <div className="p-6 space-y-6">
              {/* Informações da Solicitação Original */}
              <div className="bg-white/5 rounded-lg p-4 space-y-3">
                <h4 className="font-semibold text-white">Solicitação Original:</h4>
                <div>
                  <p className="text-sm font-medium text-white/80">Título:</p>
                  <p className="text-sm text-white/70">{selectedSolicitacao.titulo}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-white/80">Descrição:</p>
                  <p className="text-sm text-white/70">{selectedSolicitacao.descricao}</p>
                </div>
                {selectedSolicitacao.local_servico && (
                  <div>
                    <p className="text-sm font-medium text-white/80">Local:</p>
                    <p className="text-sm text-white/70">{selectedSolicitacao.local_servico}</p>
                  </div>
                )}
              </div>

              {/* Formulário de Enriquecimento */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Tipo de Solicitação <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={enriquecimento.tipo_solicitacao_id}
                    onChange={(e) => setEnriquecimento({ ...enriquecimento, tipo_solicitacao_id: e.target.value })}
                    className="w-full px-4 py-2 border border-white/20 bg-white/5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Selecione um tipo</option>
                    {tiposSolicitacao.map((tipo) => (
                      <option key={tipo.id} value={tipo.id}>
                        {tipo.nome} ({tipo.tipo_categoria})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Setor Solicitante <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={enriquecimento.setor_solicitante}
                    onChange={(e) => setEnriquecimento({ ...enriquecimento, setor_solicitante: e.target.value })}
                    className="w-full px-4 py-2 border border-white/20 bg-white/5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ex: Manutenção, Administração, etc."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Prioridade
                    </label>
                    <select
                      value={enriquecimento.prioridade}
                      onChange={(e) => setEnriquecimento({ ...enriquecimento, prioridade: e.target.value })}
                      className="w-full px-4 py-2 border border-white/20 bg-white/5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="baixa">Baixa</option>
                      <option value="normal">Normal</option>
                      <option value="alta">Alta</option>
                      <option value="urgente">Urgente</option>
                      <option value="critica">Crítica</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-2">
                      Data Limite
                    </label>
                    <input
                      type="date"
                      value={enriquecimento.data_limite}
                      onChange={(e) => setEnriquecimento({ ...enriquecimento, data_limite: e.target.value })}
                      className="w-full px-4 py-2 border border-white/20 bg-white/5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Valor Estimado (R$)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={enriquecimento.valor_estimado}
                    onChange={(e) => setEnriquecimento({ ...enriquecimento, valor_estimado: parseFloat(e.target.value) || 0 })}
                    className="w-full px-4 py-2 border border-white/20 bg-white/5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Observações Técnicas
                  </label>
                  <textarea
                    value={enriquecimento.observacoes}
                    onChange={(e) => setEnriquecimento({ ...enriquecimento, observacoes: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-2 border border-white/20 bg-white/5 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                    placeholder="Adicione informações técnicas ou observações relevantes..."
                  />
                </div>
              </div>
            </div>

            <div className="sticky bottom-0 bg-white/5 px-6 py-4 flex gap-4 border-t border-white/10">
              <button
                onClick={() => {
                  setShowEnriquecimentoModal(false);
                  setSelectedSolicitacao(null);
                }}
                className="flex-1 px-6 py-3 border border-white/20 text-white/80 rounded-lg hover:bg-white/10 transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                onClick={salvarEnriquecimento}
                className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                Salvar e Enviar para Aprovação
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
