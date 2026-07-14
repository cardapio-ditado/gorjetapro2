import React, { useState } from 'react';
import { X, User, Plus, CheckCircle, AlertTriangle, DollarSign, Calendar } from 'lucide-react';

interface PendenteRevisao {
  index: number;
  lancamento: any;
  nome_buscado: string;
  sugestoes: Array<{
    id: string;
    nome: string;
    tipo?: string;
    score: number;
  }>;
}

interface ModalRevisaoFornecedoresProps {
  isOpen: boolean;
  pendentes: PendenteRevisao[];
  onConfirmar: (revisados: any[]) => void;
  onCancelar: () => void;
}

const ModalRevisaoFornecedores: React.FC<ModalRevisaoFornecedoresProps> = ({
  isOpen,
  pendentes,
  onConfirmar,
  onCancelar
}) => {
  const [revisoes, setRevisoes] = useState<Map<number, any>>(new Map());
  const [novosFornecedores, setNovosFornecedores] = useState<Map<number, string>>(new Map());

  if (!isOpen) return null;

  const handleSelecionarFornecedor = (index: number, fornecedorId: string) => {
    const novasRevisoes = new Map(revisoes);
    novasRevisoes.set(index, {
      fornecedor_id: fornecedorId,
      criar_novo_fornecedor: false
    });
    setRevisoes(novasRevisoes);

    // Limpar campo de novo fornecedor se existir
    const novosNomes = new Map(novosFornecedores);
    novosNomes.delete(index);
    setNovosFornecedores(novosNomes);
  };

  const handleCriarNovoFornecedor = (index: number) => {
    const nome = novosFornecedores.get(index) || '';
    if (!nome.trim()) return;

    const novasRevisoes = new Map(revisoes);
    novasRevisoes.set(index, {
      criar_novo_fornecedor: true,
      novo_fornecedor_nome: nome.trim()
    });
    setRevisoes(novasRevisoes);
  };

  const handleConfirmar = () => {
    const revisados = pendentes.map((pendente) => {
      const revisao = revisoes.get(pendente.index);
      return {
        lancamento: pendente.lancamento,
        fornecedor_id: revisao?.fornecedor_id || null,
        criar_novo_fornecedor: revisao?.criar_novo_fornecedor || false,
        novo_fornecedor_nome: revisao?.novo_fornecedor_nome || null
      };
    }).filter(r => r.fornecedor_id || r.criar_novo_fornecedor);

    onConfirmar(revisados);
  };

  const totalRevisados = revisoes.size;
  const totalPendentes = pendentes.length;
  const todosRevisados = totalRevisados === totalPendentes;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
      <div className="bg-[#0f1020] rounded-lg w-full max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-white/10 bg-gradient-to-r from-[#7D1F2C] to-[#a0292e]">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">
                  Revisão de Fornecedores
                </h3>
                <p className="text-sm text-white/60 mt-1">
                  {totalRevisados} de {totalPendentes} lançamentos revisados
                </p>
              </div>
            </div>
            <button
              onClick={onCancelar}
              className="text-white hover:text-orange-100 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-6">
            {pendentes.map((pendente, idx) => {
              const revisao = revisoes.get(pendente.index);
              const novoNome = novosFornecedores.get(pendente.index) || '';
              const fornecedorSelecionado = pendente.sugestoes.find(s => s.id === revisao?.fornecedor_id);

              return (
                <div
                  key={pendente.index}
                  className="bg-[#12141f] border border-white/10 rounded-2xl p-6 space-y-4"
                >
                  {/* Lançamento Info */}
                  <div className="bg-white/5 rounded-lg p-4">
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1">
                        <h4 className="font-semibold text-white text-lg">
                          {pendente.lancamento.descricao}
                        </h4>
                        {pendente.nome_buscado && (
                          <p className="text-sm text-white/60 mt-1">
                            Buscado: <span className="font-medium">{pendente.nome_buscado}</span>
                          </p>
                        )}
                      </div>
                      {revisao && (
                        <CheckCircle className="w-6 h-6 text-green-400 flex-shrink-0" />
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-sm text-white/60">
                      <div className="flex items-center gap-1">
                        <DollarSign className="w-4 h-4" />
                        <span className="font-medium">
                          R$ {pendente.lancamento.valor?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Calendar className="w-4 h-4" />
                        <span>{new Date(pendente.lancamento.data_vencimento).toLocaleDateString('pt-BR')}</span>
                      </div>
                    </div>
                  </div>

                  {/* Sugestões */}
                  {pendente.sugestoes.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-sm font-medium text-white/80">
                        Selecione um fornecedor existente:
                      </p>
                      <div className="grid grid-cols-1 gap-2">
                        {pendente.sugestoes.map((sugestao) => (
                          <button
                            key={sugestao.id}
                            onClick={() => handleSelecionarFornecedor(pendente.index, sugestao.id)}
                            className={`
                              text-left px-4 py-3 rounded-lg border-2 transition-all
                              ${revisao?.fornecedor_id === sugestao.id
                                ? 'border-green-600 bg-green-500/10'
                                : 'border-gray-500/30 hover:border-white/20 bg-white'
                              }
                            `}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <User className="w-4 h-4 text-white/60" />
                                <span className="font-medium text-white">{sugestao.nome}</span>
                                {sugestao.tipo && (
                                  <span className="text-xs px-2 py-0.5 bg-blue-900/30 text-blue-400 rounded">
                                    {sugestao.tipo}
                                  </span>
                                )}
                              </div>
                              {sugestao.score > 0 && (
                                <span className="text-xs text-white/50">
                                  {Math.round(sugestao.score * 100)}% similar
                                </span>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Criar Novo Fornecedor */}
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-white/80">
                      Ou criar novo fornecedor:
                    </p>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={novoNome}
                        onChange={(e) => {
                          const novosNomes = new Map(novosFornecedores);
                          novosNomes.set(pendente.index, e.target.value);
                          setNovosFornecedores(novosNomes);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            handleCriarNovoFornecedor(pendente.index);
                          }
                        }}
                        placeholder="Digite o nome do novo fornecedor"
                        className="flex-1 px-4 py-2 bg-white/5 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-[#7D1F2C] focus:border-transparent"
                      />
                      <button
                        onClick={() => handleCriarNovoFornecedor(pendente.index)}
                        disabled={!novoNome.trim()}
                        className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                      >
                        <Plus className="w-5 h-5" />
                        Criar
                      </button>
                    </div>
                    {revisao?.criar_novo_fornecedor && (
                      <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/8 px-3 py-2 rounded-lg">
                        <CheckCircle className="w-4 h-4" />
                        Será criado: {revisao.novo_fornecedor_nome}
                      </div>
                    )}
                  </div>

                  {/* Status */}
                  {fornecedorSelecionado && (
                    <div className="flex items-center gap-2 text-sm text-green-400 bg-green-500/8 px-3 py-2 rounded-lg">
                      <CheckCircle className="w-4 h-4" />
                      Selecionado: {fornecedorSelecionado.nome}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 bg-white/5">
          <div className="flex justify-between items-center">
            <div className="text-sm text-white/60">
              {todosRevisados ? (
                <span className="text-green-400 font-medium">
                  Todos os lançamentos foram revisados
                </span>
              ) : (
                <span>
                  Revise todos os {totalPendentes} lançamentos antes de confirmar
                </span>
              )}
            </div>
            <div className="flex gap-3">
              <button
                onClick={onCancelar}
                className="px-6 py-2 border border-white/20 rounded-lg text-white/80 hover:bg-white/10 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmar}
                disabled={!todosRevisados}
                className="px-6 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
              >
                <CheckCircle className="w-5 h-5" />
                Confirmar Lançamentos
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModalRevisaoFornecedores;
