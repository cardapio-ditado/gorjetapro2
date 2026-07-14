import React, { useState } from 'react';
import { X, Upload, Camera, CheckCircle, AlertTriangle, XCircle, Plus, Loader, CreditCard as Edit2, Save } from 'lucide-react';

interface ItemPedido {
  id: string;
  item_id: string;
  item_nome: string;
  item_codigo?: string;
  quantidade_pedida: number;
  unidade_medida: string;
  custo_unitario: number;
}

interface ComparacaoItem {
  item_pedido: ItemPedido;
  item_recebido: any;
  status: 'ok' | 'divergencia' | 'faltando' | 'extra';
  diferencas: {
    quantidade?: { pedido: number; recebido: number };
    valor_unitario?: { pedido: number; recebido: number };
    descricao?: { pedido: string; recebido: string };
  };
  similarity_score?: number;
}

interface ConferenciaRecebimentoModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (comparacoes: ComparacaoItem[]) => void;
  compra: any;
  itens: ItemPedido[];
}

const ConferenciaRecebimentoModal: React.FC<ConferenciaRecebimentoModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  compra,
  itens,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [comparacoes, setComparacoes] = useState<ComparacaoItem[] | null>(null);
  const [resumo, setResumo] = useState<any>(null);
  const [editandoIdx, setEditandoIdx] = useState<number | null>(null);
  const [valorEditado, setValorEditado] = useState({ quantidade: 0, valor_unitario: 0 });

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.size > 20 * 1024 * 1024) {
      setError('Arquivo muito grande. Máximo: 20MB');
      return;
    }

    setFile(selectedFile);
    setError(null);

    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleConferir = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);

    console.log('=== INÍCIO DA CONFERÊNCIA ===');
    console.log('Arquivo:', file.name, file.size, 'bytes');
    console.log('Total de itens:', itens.length);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Preparar dados do pedido (apenas dados serializáveis)
      const itensSimplifcados = [];
      for (const item of itens) {
        itensSimplifcados.push({
          descricao: String(item.item_nome || ''),
          codigo: item.item_codigo ? String(item.item_codigo) : null,
          quantidade_pedida: parseFloat(String(item.quantidade_pedida || 0)),
          unidade: String(item.unidade_medida || ''),
          valor_unitario: parseFloat(String(item.custo_unitario || 0)),
        });
      }

      const pedidoData = {
        compra_id: String(compra?.id || ''),
        numero_documento: String(compra?.numero_documento || ''),
        fornecedor: String(compra?.fornecedores?.nome || ''),
        itens: itensSimplifcados,
      };

      console.log('Preparando conferência:', {
        totalItens: itensSimplifcados.length,
        primeiroItem: itensSimplifcados[0],
      });

      formData.append('pedido', JSON.stringify(pedidoData));

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      console.log('Enviando para:', `${supabaseUrl}/functions/v1/conferir-recebimento`);

      const response = await fetch(`${supabaseUrl}/functions/v1/conferir-recebimento`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: formData,
      });

      console.log('Status da resposta:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Resposta de erro (texto):', errorText);

        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText };
        }

        const errorMsg = errorData?.error || `Erro HTTP ${response.status}: ${errorText.substring(0, 100)}`;
        console.error('Erro na conferência:', errorData);
        throw new Error(errorMsg);
      }

      const data = await response.json();
      console.log('Resposta da API:', data.success ? 'Sucesso' : 'Falha');

      if (!data.success) {
        const errorMsg = data.error || 'Erro desconhecido';
        console.error('Erro da API:', data);
        throw new Error(errorMsg);
      }

      // Mapear comparações de volta para incluir dados completos do item
      const comparacoesCompletas = data.comparacoes.map((comp: any) => {
        const itemPedido = itens.find(i =>
          i.item_nome.toLowerCase() === comp.item_pedido.descricao.toLowerCase()
        );

        return {
          ...comp,
          item_pedido: itemPedido || comp.item_pedido,
        };
      });

      setComparacoes(comparacoesCompletas);
      setResumo(data.resumo);
    } catch (err) {
      console.error('Erro ao conferir:', err);
      setError(err instanceof Error ? err.message : 'Erro ao processar arquivo');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (comparacoes) {
      onConfirm(comparacoes);
    }
  };

  const handleEditarItem = (idx: number, comp: ComparacaoItem) => {
    setEditandoIdx(idx);
    setValorEditado({
      quantidade: comp.item_recebido?.quantidade || 0,
      valor_unitario: comp.item_recebido?.valor_unitario || 0,
    });
  };

  const handleSalvarEdicao = (idx: number) => {
    if (!comparacoes) return;

    const novasComparacoes = [...comparacoes];
    const comp = novasComparacoes[idx];

    if (comp.item_recebido) {
      // Atualizar valores
      comp.item_recebido.quantidade = valorEditado.quantidade;
      comp.item_recebido.valor_unitario = valorEditado.valor_unitario;
      comp.item_recebido.valor_total = valorEditado.quantidade * valorEditado.valor_unitario;

      // Recalcular status e divergências
      const diferencas: ComparacaoItem['diferencas'] = {};
      let status: 'ok' | 'divergencia' | 'faltando' | 'extra' = 'ok';

      // Verificar quantidade
      if (Math.abs(comp.item_recebido.quantidade - comp.item_pedido.quantidade_pedida) > 0.01) {
        status = 'divergencia';
        diferencas.quantidade = {
          pedido: comp.item_pedido.quantidade_pedida,
          recebido: comp.item_recebido.quantidade,
        };
      }

      // Verificar valor unitário
      if (Math.abs(comp.item_recebido.valor_unitario - (comp.item_pedido.custo_unitario || 0)) > 0.01) {
        status = 'divergencia';
        diferencas.valor_unitario = {
          pedido: comp.item_pedido.custo_unitario || 0,
          recebido: comp.item_recebido.valor_unitario,
        };
      }

      comp.status = status;
      comp.diferencas = diferencas;
    }

    setComparacoes(novasComparacoes);

    // Recalcular resumo
    const novoResumo = {
      ...resumo,
      ok: novasComparacoes.filter(c => c.status === 'ok').length,
      divergencias: novasComparacoes.filter(c => c.status === 'divergencia').length,
      faltando: novasComparacoes.filter(c => c.status === 'faltando').length,
      extras: novasComparacoes.filter(c => c.status === 'extra').length,
    };
    setResumo(novoResumo);

    setEditandoIdx(null);
  };

  const handleCancelarEdicao = () => {
    setEditandoIdx(null);
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setComparacoes(null);
    setResumo(null);
    setError(null);
    setEditandoIdx(null);
  };

  if (!isOpen) return null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'ok':
        return <CheckCircle className="w-5 h-5 text-green-400" />;
      case 'divergencia':
        return <AlertTriangle className="w-5 h-5 text-yellow-400" />;
      case 'faltando':
        return <XCircle className="w-5 h-5 text-red-400" />;
      case 'extra':
        return <Plus className="w-5 h-5 text-blue-400" />;
      default:
        return null;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'ok':
        return 'Conforme';
      case 'divergencia':
        return 'Divergência';
      case 'faltando':
        return 'Faltando';
      case 'extra':
        return 'Extra';
      default:
        return status;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ok':
        return 'bg-green-500/10 border-green-500/30 text-green-300';
      case 'divergencia':
        return 'bg-yellow-500/10 border-yellow-500/30 text-yellow-300';
      case 'faltando':
        return 'bg-red-500/10 border-red-500/30 text-red-300';
      case 'extra':
        return 'bg-blue-500/10 border-blue-500/30 text-blue-300';
      default:
        return 'bg-white/5 border-white/10 text-white/90';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f1020] rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col border border-white/10">
        <div className="p-6 border-b border-white/10 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-semibold text-white">Conferência de Recebimento com IA</h3>
            <p className="text-sm text-white/40 mt-1">
              Faça upload da nota fiscal recebida para comparar com o pedido
            </p>
          </div>
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            className="text-white/30 hover:text-white/50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg flex items-start">
              <AlertTriangle className="w-5 h-5 text-red-400 mr-2 mt-0.5" />
              <div className="flex-1">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            </div>
          )}

          {!comparacoes ? (
            <div className="space-y-4">
              {/* Info do Pedido */}
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h4 className="font-medium text-white mb-3">Pedido Original</h4>
                <div className="grid grid-cols-3 gap-4 text-sm">
                  <div>
                    <span className="text-white/50">Fornecedor:</span>
                    <div className="font-medium">{compra.fornecedores?.nome}</div>
                  </div>
                  <div>
                    <span className="text-white/50">Número NF:</span>
                    <div className="font-medium">{compra.numero_documento || '-'}</div>
                  </div>
                  <div>
                    <span className="text-white/50">Total de Itens:</span>
                    <div className="font-medium">{itens.length}</div>
                  </div>
                </div>
              </div>

              {/* Upload */}
              <div className="border-2 border-dashed border-white/20 rounded-lg p-8">
                <div className="text-center">
                  <Camera className="w-12 h-12 text-white/30 mx-auto mb-4" />
                  <label className="cursor-pointer">
                    <span className="text-blue-400 hover:text-blue-400 font-medium">
                      Clique para selecionar
                    </span>
                    <span className="text-white/50"> ou arraste a foto da nota recebida</span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*"
                      onChange={handleFileSelect}
                      capture="environment"
                    />
                  </label>
                  <p className="text-xs text-white/40 mt-2">
                    JPG, PNG até 20MB
                  </p>
                </div>

                {preview && (
                  <div className="mt-4">
                    <img
                      src={preview}
                      alt="Preview"
                      className="max-h-96 mx-auto rounded border border-white/10"
                    />
                  </div>
                )}
              </div>

              {file && (
                <button
                  onClick={handleConferir}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] disabled:opacity-50 flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <Loader className="w-5 h-5 mr-2 animate-spin" />
                      Analisando com IA...
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-5 h-5 mr-2" />
                      Conferir Recebimento
                    </>
                  )}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Resumo */}
              <div className="grid grid-cols-5 gap-4">
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-green-400">{resumo.itens_ok}</div>
                  <div className="text-sm text-green-300">Conforme</div>
                </div>
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-yellow-400">{resumo.itens_divergencia}</div>
                  <div className="text-sm text-yellow-300">Divergências</div>
                </div>
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-red-400">{resumo.itens_faltando}</div>
                  <div className="text-sm text-red-300">Faltando</div>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-blue-400">{resumo.itens_extra}</div>
                  <div className="text-sm text-blue-300">Extras</div>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-lg p-4 text-center">
                  <div className="text-2xl font-bold text-white/50">{resumo.total_itens_pedido}</div>
                  <div className="text-sm text-white/90">Total Pedido</div>
                </div>
              </div>

              {/* Comparações */}
              <div>
                <h4 className="font-medium text-white mb-3">Comparação Detalhada</h4>
                <div className="space-y-3">
                  {comparacoes.map((comp, idx) => (
                    <div
                      key={idx}
                      className={`border rounded-lg p-4 ${getStatusColor(comp.status)}`}
                    >
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center">
                          {getStatusIcon(comp.status)}
                          <span className="ml-2 font-medium">{getStatusLabel(comp.status)}</span>
                        </div>
                        {comp.similarity_score && (
                          <span className="text-xs px-2 py-1 bg-white rounded">
                            {(comp.similarity_score * 100).toFixed(0)}% match
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        {/* Pedido */}
                        <div>
                          <div className="font-medium text-white/80 mb-1">Pedido:</div>
                          <div className="space-y-1">
                            <div>{comp.item_pedido.item_nome || comp.item_pedido.descricao}</div>
                            {comp.item_pedido.quantidade_pedida > 0 && (
                              <div className="text-xs">
                                Qtd: {comp.item_pedido.quantidade_pedida} {comp.item_pedido.unidade_medida}
                                {' • '}
                                {formatCurrency(comp.item_pedido.custo_unitario || comp.item_pedido.valor_unitario)}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Recebido */}
                        <div>
                          <div className="font-medium text-white/80 mb-1 flex items-center justify-between">
                            <span>Recebido:</span>
                            {comp.item_recebido && editandoIdx !== idx && (
                              <button
                                onClick={() => handleEditarItem(idx, comp)}
                                className="text-blue-400 hover:text-blue-400 text-xs flex items-center"
                              >
                                <Edit2 className="w-3 h-3 mr-1" />
                                Editar
                              </button>
                            )}
                          </div>
                          {comp.item_recebido ? (
                            editandoIdx === idx ? (
                              <div className="space-y-2">
                                <div>{comp.item_recebido.descricao}</div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="text-xs text-white/50">Quantidade:</label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={valorEditado.quantidade}
                                      onChange={(e) => setValorEditado({ ...valorEditado, quantidade: parseFloat(e.target.value) || 0 })}
                                      className="w-full px-2 py-1 text-sm border border-white/20 rounded"
                                    />
                                  </div>
                                  <div>
                                    <label className="text-xs text-white/50">Valor Unit.:</label>
                                    <input
                                      type="number"
                                      step="0.01"
                                      value={valorEditado.valor_unitario}
                                      onChange={(e) => setValorEditado({ ...valorEditado, valor_unitario: parseFloat(e.target.value) || 0 })}
                                      className="w-full px-2 py-1 text-sm border border-white/20 rounded"
                                    />
                                  </div>
                                </div>
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleSalvarEdicao(idx)}
                                    className="flex-1 px-3 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700 flex items-center justify-center"
                                  >
                                    <Save className="w-3 h-3 mr-1" />
                                    Salvar
                                  </button>
                                  <button
                                    onClick={handleCancelarEdicao}
                                    className="flex-1 px-3 py-1 bg-gray-300 text-white/80 text-xs rounded hover:bg-gray-400"
                                  >
                                    Cancelar
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                <div>{comp.item_recebido.descricao}</div>
                                <div className="text-xs">
                                  Qtd: {comp.item_recebido.quantidade} {comp.item_recebido.unidade}
                                  {' • '}
                                  {formatCurrency(comp.item_recebido.valor_unitario)}
                                </div>
                              </div>
                            )
                          ) : (
                            <div className="text-white/40 italic">Não recebido</div>
                          )}
                        </div>
                      </div>

                      {/* Divergências */}
                      {Object.keys(comp.diferencas).length > 0 && (
                        <div className="mt-3 pt-3 border-t border-current/20">
                          <div className="text-xs font-medium mb-2">Divergências:</div>
                          <div className="space-y-1 text-xs">
                            {comp.diferencas.quantidade && (
                              <div>
                                Quantidade: {comp.diferencas.quantidade.pedido} → {comp.diferencas.quantidade.recebido}
                              </div>
                            )}
                            {comp.diferencas.valor_unitario && (
                              <div>
                                Valor: {formatCurrency(comp.diferencas.valor_unitario.pedido)} → {formatCurrency(comp.diferencas.valor_unitario.recebido)}
                              </div>
                            )}
                            {comp.diferencas.descricao && (
                              <div>
                                Descrição diferente (verificar se é o mesmo produto)
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {comparacoes && (
          <div className="p-6 border-t border-white/10 bg-white/5 flex justify-between gap-3">
            <button
              onClick={reset}
              className="px-4 py-2 border border-white/20 rounded-lg text-white/80 hover:bg-white/10/10"
            >
              Nova Conferência
            </button>
            <button
              onClick={handleConfirm}
              className="px-6 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] flex items-center"
            >
              <CheckCircle className="w-5 h-5 mr-2" />
              Confirmar Recebimento
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ConferenciaRecebimentoModal;
