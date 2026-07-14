import React, { useState } from 'react';
import { X, Send, Sparkles, Loader, CheckCircle, AlertCircle, DollarSign, Calendar, User, AlertTriangle } from 'lucide-react';
import ModalRevisaoFornecedores from './ModalRevisaoFornecedores';

interface LancamentoLoteIAProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const LancamentoLoteIA: React.FC<LancamentoLoteIAProps> = ({ isOpen, onClose, onSuccess }) => {
  const [mensagem, setMensagem] = useState('');
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);
  const [pendentesRevisao, setPendentesRevisao] = useState<any[] | null>(null);
  const [loadingRevisao, setLoadingRevisao] = useState(false);

  if (!isOpen) return null;

  const handleLancar = async () => {
    if (!mensagem.trim()) {
      setError('Digite a mensagem com os lançamentos');
      return;
    }

    setLoading(true);
    setError(null);
    setResultado(null);

    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/lancar-contas-lote-ia`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ mensagem }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.error || `Erro ${response.status}: ${response.statusText}`;
        throw new Error(errorMsg);
      }

      if (!data.success) {
        throw new Error(data.error || 'Erro desconhecido');
      }

      setResultado(data);

      // Se houver pendentes, abrir modal de revisão
      if (data.pendentes_revisao && data.pendentes_revisao.length > 0) {
        setPendentesRevisao(data.pendentes_revisao);
      } else if (data.resumo.total_sucesso > 0) {
        setTimeout(() => {
          onSuccess();
        }, 2000);
      }
    } catch (err) {
      console.error('Erro ao lançar:', err);
      setError(err instanceof Error ? err.message : 'Erro ao processar lançamentos');
    } finally {
      setLoading(false);
    }
  };

  const handleFechar = () => {
    setMensagem('');
    setResultado(null);
    setError(null);
    setPendentesRevisao(null);
    onClose();
  };

  const handleConfirmarRevisao = async (revisados: any[]) => {
    setLoadingRevisao(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/confirmar-lancamentos-revisao`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ lancamentos_revisados: revisados }),
      });

      const data = await response.json();

      if (!response.ok) {
        const errorMsg = data.error || `Erro ${response.status}: ${response.statusText}`;
        throw new Error(errorMsg);
      }

      if (!data.success) {
        throw new Error(data.error || 'Erro desconhecido');
      }

      // Atualizar resultado com lançamentos da revisão
      setResultado((prev: any) => ({
        ...prev,
        resumo: {
          ...prev.resumo,
          total_sucesso: prev.resumo.total_sucesso + data.resumo.total_sucesso,
          total_pendente: 0
        },
        lancamentos_criados: [
          ...(prev.lancamentos_criados || []),
          ...data.lancamentos_criados
        ]
      }));

      setPendentesRevisao(null);

      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err) {
      console.error('Erro ao confirmar:', err);
      setError(err instanceof Error ? err.message : 'Erro ao confirmar lançamentos');
    } finally {
      setLoadingRevisao(false);
    }
  };

  const exemplos = [
    'Incluir contas a pagar com vencimento dia 03/11:\nsalario kadu 1750\nsalario kadu atrasado 1000\naugusto 1000\ncristiano ferias 500',
    'Lançar contas de RH dia 05/12:\njoao silva freelancer 800\nmaria santos 13 salario 2000\nfornecedor xyz vale 300',
  ];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f1020] rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-white/10 bg-gradient-to-r from-[#7D1F2C] to-[#a0292e]">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">
                  Lançamento em Lote com IA
                </h3>
                <p className="text-sm text-green-100 mt-1">
                  Cole suas contas e deixe a IA processar automaticamente
                </p>
              </div>
            </div>
            <button
              onClick={handleFechar}
              className="text-white hover:text-green-100 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {!resultado ? (
            <>
              {/* Input de Mensagem */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-white/80">
                  Digite ou cole os lançamentos
                </label>
                <textarea
                  value={mensagem}
                  onChange={(e) => setMensagem(e.target.value)}
                  placeholder="Ex: Incluir contas a pagar com vencimento dia 03/11:&#10;salario kadu 1750&#10;salario kadu atrasado 1000&#10;augusto 1000&#10;cristiano ferias 500"
                  rows={10}
                  className="w-full px-4 py-3 border border-white/20 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent font-mono text-sm"
                  disabled={loading}
                />
                <p className="text-xs text-white/50">
                  A IA vai identificar automaticamente: nomes, valores, categorias e datas de vencimento
                </p>
              </div>

              {/* Exemplos */}
              <div className="space-y-3">
                <p className="text-sm font-medium text-white/80">Exemplos de formato:</p>
                <div className="space-y-2">
                  {exemplos.map((exemplo, index) => (
                    <button
                      key={index}
                      onClick={() => setMensagem(exemplo)}
                      className="w-full text-left px-4 py-3 bg-white/5 hover:bg-gray-500/15 rounded-lg text-xs font-mono text-white/80 transition-colors whitespace-pre-wrap"
                    >
                      {exemplo}
                    </button>
                  ))}
                </div>
              </div>

              {/* Dicas */}
              <div className="bg-blue-900/20 border border-blue-700/40 rounded-lg p-4">
                <h4 className="font-semibold text-blue-300 mb-2">Dicas:</h4>
                <ul className="text-sm text-blue-300 space-y-1">
                  <li>• Inclua a data de vencimento no início da mensagem</li>
                  <li>• Coloque cada conta em uma linha separada</li>
                  <li>• Formato: nome/descrição + valor</li>
                  <li>• A IA identifica automaticamente salários, férias, freelancers, etc</li>
                  <li>• Nomes parecidos são encontrados automaticamente (ex: "kadu" encontra "Carlos Eduardo")</li>
                </ul>
              </div>

              {/* Error */}
              {error && (
                <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-4 flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-red-300">Erro</p>
                    <p className="text-sm text-red-400 mt-1">{error}</p>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-6">
              {/* Resumo */}
              <div className="bg-white/5 border border-white/10 rounded-2xl p-6">
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-12 h-12 bg-[#7D1F2C] rounded-lg flex items-center justify-center">
                    <CheckCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-white text-lg">Lançamentos Processados</h4>
                    <p className="text-sm text-green-400">{resultado.resumo.contexto}</p>
                  </div>
                </div>

                <div className="grid grid-cols-4 gap-4 mt-4">
                  <div className="bg-[#12141f] rounded-lg p-4">
                    <p className="text-sm text-white/60">Total Processado</p>
                    <p className="text-2xl font-bold text-white">{resultado.resumo.total_processado}</p>
                  </div>
                  <div className="bg-[#12141f] rounded-lg p-4">
                    <p className="text-sm text-white/60">Sucesso</p>
                    <p className="text-2xl font-bold text-green-400">{resultado.resumo.total_sucesso}</p>
                  </div>
                  <div className="bg-[#12141f] rounded-lg p-4">
                    <p className="text-sm text-white/60">Pendente</p>
                    <p className="text-2xl font-bold text-orange-400">{resultado.resumo.total_pendente || 0}</p>
                  </div>
                  <div className="bg-[#12141f] rounded-lg p-4">
                    <p className="text-sm text-white/60">Erros</p>
                    <p className="text-2xl font-bold text-red-400">{resultado.resumo.total_erros}</p>
                  </div>
                </div>
              </div>

              {/* Lançamentos Criados */}
              {resultado.lancamentos_criados && resultado.lancamentos_criados.length > 0 && (
                <div className="space-y-3">
                  <h5 className="font-semibold text-white">Contas criadas:</h5>
                  <div className="space-y-2">
                    {resultado.lancamentos_criados.map((lanc: any, index: number) => (
                      <div
                        key={index}
                        className="bg-[#12141f] border border-white/10 rounded-lg p-4"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <CheckCircle className="w-5 h-5 text-green-400" />
                              <p className="font-medium text-white">{lanc.descricao}</p>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-white/60">
                              <div className="flex items-center gap-1">
                                <DollarSign className="w-4 h-4" />
                                <span className="font-medium">
                                  R$ {lanc.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Calendar className="w-4 h-4" />
                                <span>{new Date(lanc.data_vencimento).toLocaleDateString('pt-BR')}</span>
                              </div>
                              {lanc.fornecedor_nome && (
                                <div className="flex items-center gap-1">
                                  <User className="w-4 h-4" />
                                  <span>{lanc.fornecedor_nome}</span>
                                </div>
                              )}
                            </div>
                            {lanc.categoria_sugerida && (
                              <div className="mt-2">
                                <span className="inline-block px-2 py-1 bg-blue-900/30 text-blue-400 text-xs rounded">
                                  {lanc.categoria_sugerida.nome}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Erros */}
              {resultado.erros && resultado.erros.length > 0 && (
                <div className="bg-red-900/20 border border-red-700/40 rounded-lg p-4">
                  <h5 className="font-semibold text-red-300 mb-3">Erros encontrados:</h5>
                  <div className="space-y-2">
                    {resultado.erros.map((erro: any, index: number) => (
                      <div key={index} className="text-sm text-red-400">
                        <p className="font-medium">{erro.lancamento}</p>
                        <p className="text-xs">{erro.erro}</p>
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
          <div className="flex justify-end gap-3">
            {resultado ? (
              <>
                <button
                  onClick={() => {
                    setResultado(null);
                    setMensagem('');
                  }}
                  className="px-6 py-2 border border-white/20 rounded-lg text-white/80 hover:bg-white/10 transition-colors"
                >
                  Novo Lançamento
                </button>
                <button
                  onClick={handleFechar}
                  className="px-6 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] transition-colors"
                >
                  Concluir
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleFechar}
                  className="px-6 py-2 border border-white/20 rounded-lg text-white/80 hover:bg-white/10 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleLancar}
                  disabled={loading || !mensagem.trim()}
                  className="px-6 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                >
                  {loading ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <Send className="w-5 h-5" />
                      Processar com IA
                    </>
                  )}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Revisão de Fornecedores */}
      {pendentesRevisao && (
        <ModalRevisaoFornecedores
          isOpen={true}
          pendentes={pendentesRevisao}
          onConfirmar={handleConfirmarRevisao}
          onCancelar={() => setPendentesRevisao(null)}
        />
      )}
    </div>
  );
};

export default LancamentoLoteIA;
