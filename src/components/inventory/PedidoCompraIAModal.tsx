import React, { useState } from 'react';
import { X, Upload, Sparkles, Loader, CheckCircle, AlertTriangle, Package, ShoppingCart, FileText } from 'lucide-react';

interface PedidoExtractionData {
  success: boolean;
  extraction_id?: string;
  file: {
    name: string;
    size: number;
    type: string;
    hash: string;
    url: string;
  };
  extracted: {
    fornecedor?: {
      nome: string;
      cnpj?: string;
      telefone?: string;
      email?: string;
    };
    documento?: {
      numero?: string;
      serie?: string;
      data_emissao?: string;
      data_entrega?: string;
    };
    itens: Array<{
      descricao: string;
      codigo?: string;
      quantidade: number;
      unidade?: string;
      valor_unitario: number;
      valor_total: number;
      item_estoque_id?: string | null;
      item_estoque_match?: string;
      requer_novo_item?: boolean;
    }>;
    totais: {
      valor_produtos?: number;
      valor_descontos?: number;
      valor_frete?: number;
      valor_total: number;
    };
    observacoes?: string;
  };
  matching_stats: {
    total_itens: number;
    itens_encontrados: number;
    itens_novos: number;
    taxa_match: number;
  };
  meta: {
    tokens: number;
    processingTime: number;
  };
}

interface PedidoCompraIAModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: PedidoExtractionData & { estoqueDestinoId: string }) => void;
  estoques: any[];
}

const PedidoCompraIAModal: React.FC<PedidoCompraIAModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  estoques,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractionData, setExtractionData] = useState<PedidoExtractionData | null>(null);
  const [estoqueDestinoId, setEstoqueDestinoId] = useState('');

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.size > 20 * 1024 * 1024) {
      setError('Arquivo muito grande. Máximo: 20MB');
      return;
    }

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(selectedFile.type)) {
      setError('Formato inválido. Use JPG, PNG ou PDF.');
      return;
    }

    setFile(selectedFile);
    setError(null);
    setExtractionData(null);

    if (selectedFile.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
      };
      reader.readAsDataURL(selectedFile);
    } else {
      setPreview(null);
    }
  };

  const handleExtract = async () => {
    if (!file) return;

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const response = await fetch(`${supabaseUrl}/functions/v1/extract-pedido`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Falha na extração');
      }

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Erro desconhecido');
      }

      setExtractionData(data);
    } catch (err) {
      console.error('Erro ao extrair pedido:', err);
      setError(err instanceof Error ? err.message : 'Erro ao processar arquivo');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!extractionData || !estoqueDestinoId) {
      setError('Selecione o estoque de destino');
      return;
    }

    onConfirm({
      ...extractionData,
      estoqueDestinoId,
    });

    setFile(null);
    setPreview(null);
    setExtractionData(null);
    setEstoqueDestinoId('');
  };

  const handleCancel = () => {
    setFile(null);
    setPreview(null);
    setExtractionData(null);
    setEstoqueDestinoId('');
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f1020] rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col border border-white/10">
        {/* Header */}
        <div className="p-6 border-b border-white/10 bg-gradient-to-r from-blue-600 to-blue-700">
          <div className="flex justify-between items-start">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-white bg-opacity-20 rounded-lg flex items-center justify-center">
                <Sparkles className="w-6 h-6 text-white" />
              </div>
              <div>
                <h3 className="text-xl font-semibold text-white">
                  Importar Pedido com IA
                </h3>
                <p className="text-sm text-blue-100 mt-1">
                  Extração inteligente com consulta automática de itens no estoque
                </p>
              </div>
            </div>
            <button
              onClick={handleCancel}
              className="text-white hover:text-blue-100 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {!extractionData ? (
            <div className="space-y-6">
              {/* Upload Area */}
              <div className="border-2 border-dashed border-white/20 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={handleFileSelect}
                  className="hidden"
                  id="file-upload-pedido"
                />
                <label
                  htmlFor="file-upload-pedido"
                  className="cursor-pointer flex flex-col items-center gap-4"
                >
                  <div className="w-16 h-16 bg-blue-500/15 rounded-full flex items-center justify-center">
                    <Upload className="w-8 h-8 text-blue-400" />
                  </div>
                  <div>
                    <p className="text-lg font-medium text-white">
                      Clique para selecionar ou arraste um arquivo
                    </p>
                    <p className="text-sm text-white/40 mt-1">
                      JPG, PNG ou PDF até 20MB
                    </p>
                  </div>
                </label>
              </div>

              {/* Preview */}
              {preview && (
                <div className="space-y-4">
                  <h4 className="font-medium text-white">Preview do arquivo:</h4>
                  <img
                    src={preview}
                    alt="Preview"
                    className="w-full h-64 object-contain bg-white/5 rounded-lg border border-white/10"
                  />
                </div>
              )}

              {file && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <FileText className="w-5 h-5 text-blue-400" />
                    <div className="flex-1">
                      <p className="font-medium text-blue-300">{file.name}</p>
                      <p className="text-sm text-blue-400">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-medium text-red-300">Erro</p>
                    <p className="text-sm text-red-400 mt-1">{error}</p>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Stats */}
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-8 h-8 text-green-400" />
                    <div>
                      <p className="text-2xl font-bold text-green-300">
                        {extractionData.matching_stats.itens_encontrados}
                      </p>
                      <p className="text-sm text-green-400">Itens encontrados</p>
                    </div>
                  </div>
                </div>

                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <Package className="w-8 h-8 text-yellow-400" />
                    <div>
                      <p className="text-2xl font-bold text-yellow-300">
                        {extractionData.matching_stats.itens_novos}
                      </p>
                      <p className="text-sm text-yellow-400">Itens novos</p>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-3">
                    <ShoppingCart className="w-8 h-8 text-blue-400" />
                    <div>
                      <p className="text-2xl font-bold text-blue-300">
                        {extractionData.matching_stats.taxa_match}%
                      </p>
                      <p className="text-sm text-blue-400">Taxa de match</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Fornecedor */}
              {extractionData.extracted.fornecedor && (
                <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                  <h4 className="font-semibold text-white mb-3">Fornecedor</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-white/50">Nome</p>
                      <p className="font-medium text-white">
                        {extractionData.extracted.fornecedor.nome}
                      </p>
                    </div>
                    {extractionData.extracted.fornecedor.cnpj && (
                      <div>
                        <p className="text-sm text-white/50">CNPJ</p>
                        <p className="font-medium text-white">
                          {extractionData.extracted.fornecedor.cnpj}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Estoque Destino */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Estoque de Destino *
                </label>
                <select
                  value={estoqueDestinoId}
                  onChange={(e) => setEstoqueDestinoId(e.target.value)}
                  className="w-full px-4 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Selecione o estoque...</option>
                  {estoques.map((estoque) => (
                    <option key={estoque.id} value={estoque.id}>
                      {estoque.nome}
                    </option>
                  ))}
                </select>
              </div>

              {/* Itens */}
              <div>
                <h4 className="font-semibold text-white mb-3">
                  Itens ({extractionData.extracted.itens.length})
                </h4>
                <div className="border border-white/10 rounded-lg overflow-hidden">
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full">
                      <thead className="bg-white/5 sticky top-0">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-white/50">
                            Status
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-white/50">
                            Descrição
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-white/50">
                            Qtd
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-white/50">
                            Unit.
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-white/50">
                            Total
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {extractionData.extracted.itens.map((item, index) => (
                          <tr key={index} className="hover:bg-white/10/5">
                            <td className="px-4 py-3">
                              {item.item_estoque_id ? (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-500/15 text-green-300">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Encontrado
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-300">
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  Novo
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm font-medium text-white">
                                {item.descricao}
                              </p>
                              {item.codigo && (
                                <p className="text-xs text-white/40">Cód: {item.codigo}</p>
                              )}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-white">
                              {item.quantidade} {item.unidade || 'un'}
                            </td>
                            <td className="px-4 py-3 text-right text-sm text-white">
                              {item.valor_unitario.toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              })}
                            </td>
                            <td className="px-4 py-3 text-right text-sm font-medium text-white">
                              {item.valor_total.toLocaleString('pt-BR', {
                                style: 'currency',
                                currency: 'BRL',
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              {/* Totais */}
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <span className="text-lg font-semibold text-white">Total do Pedido</span>
                  <span className="text-2xl font-bold text-blue-400">
                    {extractionData.extracted.totais.valor_total.toLocaleString('pt-BR', {
                      style: 'currency',
                      currency: 'BRL',
                    })}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t border-white/10 bg-white/5">
          <div className="flex justify-between items-center">
            <button
              onClick={handleCancel}
              className="px-6 py-2 border border-white/20 rounded-lg text-white/80 hover:bg-white/10/10 transition-colors"
            >
              Cancelar
            </button>

            {!extractionData ? (
              <button
                onClick={handleExtract}
                disabled={!file || loading}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
              >
                {loading ? (
                  <>
                    <Loader className="w-5 h-5 animate-spin" />
                    Processando...
                  </>
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    Processar com IA
                  </>
                )}
              </button>
            ) : (
              <button
                onClick={handleConfirm}
                disabled={!estoqueDestinoId}
                className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
              >
                <CheckCircle className="w-5 h-5" />
                Confirmar Importação
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PedidoCompraIAModal;
