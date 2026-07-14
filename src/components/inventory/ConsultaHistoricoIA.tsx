import React, { useState } from 'react';
import { X, Send, Sparkles, Loader, Search, Calendar, TrendingUp, Package } from 'lucide-react';

interface ConsultaHistoricoIAProps {
  isOpen: boolean;
  onClose: () => void;
}

const ConsultaHistoricoIA: React.FC<ConsultaHistoricoIAProps> = ({ isOpen, onClose }) => {
  const [pergunta, setPergunta] = useState('');
  const [loading, setLoading] = useState(false);
  const [resposta, setResposta] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const exemplos = [
    'Qual foi a última compra de azeite?',
    'Quando foi a última entrada de cerveja no estoque?',
    'Histórico de compras de carne nos últimos 30 dias',
    'Com que frequência compramos refrigerante?',
    'Último preço pago no óleo de soja',
  ];

  if (!isOpen) return null;

  const handleConsultar = async () => {
    if (!pergunta.trim()) {
      setError('Digite uma pergunta');
      return;
    }

    setLoading(true);
    setError(null);
    setResposta(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/consultar-historico-estoque`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ pergunta }),
      });

      if (!response.ok) {
        throw new Error('Erro ao consultar histórico');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Erro desconhecido');
      }

      setResposta(data);
    } catch (err) {
      console.error('Erro ao consultar:', err);
      setError(err instanceof Error ? err.message : 'Erro ao consultar histórico');
    } finally {
      setLoading(false);
    }
  };

  const handleExemploClick = (exemplo: string) => {
    setPergunta(exemplo);
    setResposta(null);
    setError(null);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleConsultar();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-white/10 bg-gradient-to-r from-indigo-600 to-purple-600">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">
                  Consulta Inteligente de Histórico
                </h3>
                <p className="text-sm text-indigo-100 mt-1">
                  Pergunte sobre movimentações e compras de produtos
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-white hover:text-indigo-100 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Input de Pergunta */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-white/80">
              Faça sua pergunta
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={pergunta}
                onChange={(e) => setPergunta(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Ex: Qual foi a última compra de azeite?"
                className="flex-1 px-4 py-3 border border-white/20 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                disabled={loading}
              />
              <button
                onClick={handleConsultar}
                disabled={loading || !pergunta.trim()}
                className="px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
              >
                {loading ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Consultando...
                  </>
                ) : (
                  <>
                    <Send className="w-5 h-5" />
                    Consultar
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Exemplos */}
          {!resposta && !loading && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-white/80">Exemplos de perguntas:</p>
              <div className="grid grid-cols-1 gap-2">
                {exemplos.map((exemplo, index) => (
                  <button
                    key={index}
                    onClick={() => handleExemploClick(exemplo)}
                    className="text-left px-4 py-3 bg-white/5 hover:bg-white/10/10 rounded-lg text-sm text-white/80 transition-colors flex items-center gap-2"
                  >
                    <Search className="w-4 h-4 text-white/30 flex-shrink-0" />
                    {exemplo}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
              <p className="text-sm text-red-400">{error}</p>
            </div>
          )}

          {/* Resposta */}
          {resposta && (
            <div className="space-y-4">
              {/* Resposta Principal */}
              <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border border-indigo-500/30 rounded-lg p-6">
                <div className="flex items-start gap-3 mb-4">
                  <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Sparkles className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1">
                    <h4 className="font-semibold text-indigo-300 mb-2">Resposta da IA</h4>
                    <div className="prose prose-sm max-w-none text-white/80 whitespace-pre-line">
                      {resposta.resposta}
                    </div>
                  </div>
                </div>
              </div>

              {/* Estatísticas */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="w-5 h-5 text-blue-400" />
                    <span className="text-sm font-medium text-blue-300">Itens Encontrados</span>
                  </div>
                  <p className="text-2xl font-bold text-blue-400">
                    {resposta.itens_encontrados?.length || 0}
                  </p>
                </div>

                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-5 h-5 text-green-400" />
                    <span className="text-sm font-medium text-green-300">Movimentações</span>
                  </div>
                  <p className="text-2xl font-bold text-green-400">
                    {resposta.total_movimentacoes || 0}
                  </p>
                </div>

                <div className="bg-purple-500/10 border border-purple-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Calendar className="w-5 h-5 text-purple-400" />
                    <span className="text-sm font-medium text-purple-300">Compras</span>
                  </div>
                  <p className="text-2xl font-bold text-purple-400">
                    {resposta.total_compras || 0}
                  </p>
                </div>
              </div>

              {/* Itens Encontrados */}
              {resposta.itens_encontrados && resposta.itens_encontrados.length > 0 && (
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <h5 className="font-semibold text-white mb-3">Itens Identificados:</h5>
                  <div className="space-y-2">
                    {resposta.itens_encontrados.map((item: any, index: number) => (
                      <div
                        key={index}
                        className="flex items-center justify-between bg-white rounded-lg p-3"
                      >
                        <div>
                          <p className="font-medium text-white">{item.nome}</p>
                          {item.codigo && (
                            <p className="text-xs text-white/40">Código: {item.codigo}</p>
                          )}
                        </div>
                        <div className="text-right">
                          <span className="inline-block px-3 py-1 bg-indigo-500/15 text-indigo-300 text-xs font-medium rounded-full">
                            {item.categoria}
                          </span>
                          <p className="text-xs text-white/40 mt-1">{item.unidade_medida}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 bg-white/5">
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className="px-6 py-2 border border-white/20 rounded-lg text-white/80 hover:bg-white/10/10 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ConsultaHistoricoIA;
