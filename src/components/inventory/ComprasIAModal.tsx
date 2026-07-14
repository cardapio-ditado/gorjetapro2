import React, { useState, useEffect } from 'react';
import { X, AlertTriangle, CheckCircle, Loader, Upload, FileText, Trash2, MapPin, Plus } from 'lucide-react';
import dayjs from 'dayjs';
import ItemMappingModal from './ItemMappingModal';

interface ExtractionData {
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
    emitente: {
      nome: string;
      cnpj?: string | null;
    };
    documento: {
      numero?: string | null;
      serie?: string | null;
      data_emissao?: string | null;
    };
    itens: Array<{
      descricao: string;
      codigo?: string | null;
      quantidade: number;
      unidade?: string | null;
      valor_unitario: number;
      valor_total: number;
      desconto?: number | null;
    }>;
    totais: {
      valor_produtos?: number | null;
      valor_descontos?: number | null;
      valor_total: number;
    };
    observacoes?: string | null;
    confidences?: Record<string, number>;
  };
  validation: {
    somaItens: number;
    total: number;
    diferenca: number;
  };
  meta: {
    tokens: number;
    processingTime: number;
  };
}

interface ComprasIAModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (data: ExtractionData & { itemMappings?: Array<{ extracted: any; itemId: string | null }> }) => void;
  estoques: any[];
}

const ComprasIAModal: React.FC<ComprasIAModalProps> = ({ isOpen, onClose, onConfirm, estoques }) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractionData, setExtractionData] = useState<ExtractionData | null>(null);
  const [estoqueDestinoId, setEstoqueDestinoId] = useState('');
  const [editedData, setEditedData] = useState<ExtractionData | null>(null);
  const [showMappingModal, setShowMappingModal] = useState(false);
  const [itemMappings, setItemMappings] = useState<Array<{ extracted: any; itemId: string | null }>>([]);

  useEffect(() => {
    if (extractionData) {
      setEditedData(JSON.parse(JSON.stringify(extractionData)));
    }
  }, [extractionData]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    if (selectedFile.size > 20 * 1024 * 1024) {
      setError('Arquivo muito grande. Máximo: 20MB');
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
      const response = await fetch(`${supabaseUrl}/functions/v1/extract-nota`, {
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
      console.error('Erro ao extrair dados:', err);
      setError(err instanceof Error ? err.message : 'Erro ao processar arquivo');
    } finally {
      setLoading(false);
    }
  };

  const updateItem = (index: number, field: string, value: any) => {
    if (!editedData) return;
    const newData = { ...editedData };
    newData.extracted.itens[index] = {
      ...newData.extracted.itens[index],
      [field]: value,
    };

    const item = newData.extracted.itens[index];
    if (field === 'quantidade' || field === 'valor_unitario') {
      item.valor_total = item.quantidade * item.valor_unitario;
    }

    const somaItens = newData.extracted.itens.reduce((sum, it) => sum + it.valor_total, 0);
    newData.validation.somaItens = Number(somaItens.toFixed(2));
    newData.validation.diferenca = Math.abs(somaItens - newData.extracted.totais.valor_total);

    setEditedData(newData);
  };

  const removeItem = (index: number) => {
    if (!editedData) return;
    const newData = { ...editedData };
    newData.extracted.itens.splice(index, 1);

    const somaItens = newData.extracted.itens.reduce((sum, it) => sum + it.valor_total, 0);
    newData.validation.somaItens = Number(somaItens.toFixed(2));
    newData.validation.diferenca = Math.abs(somaItens - newData.extracted.totais.valor_total);

    setEditedData(newData);
  };

  const addNewItem = () => {
    if (!editedData) return;
    const newData = { ...editedData };

    // Adicionar novo item vazio
    const newItem = {
      descricao: '',
      codigo: null,
      quantidade: 1,
      unidade: 'UN',
      valor_unitario: 0,
      valor_total: 0,
      desconto: null,
    };

    newData.extracted.itens.push(newItem);
    setEditedData(newData);
  };

  const handleOpenMapping = () => {
    if (!editedData || !estoqueDestinoId) {
      setError('Selecione o estoque de destino');
      return;
    }
    setShowMappingModal(true);
  };

  const handleMappingConfirm = (mappings: Array<{ extracted: any; itemId: string | null }>) => {
    setItemMappings(mappings);
    setShowMappingModal(false);

    // Confirmar direto após mapear
    if (editedData && estoqueDestinoId) {
      onConfirm({
        ...editedData,
        estoqueDestinoId,
        itemMappings: mappings,
      } as any);
    }
  };

  const reset = () => {
    setFile(null);
    setPreview(null);
    setExtractionData(null);
    setEditedData(null);
    setError(null);
    setEstoqueDestinoId('');
    setItemMappings([]);
    setShowMappingModal(false);
  };

  if (!isOpen) return null;

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
    }).format(value);
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f1020] rounded-lg w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col border border-white/10">
        <div className="p-6 border-b border-white/10 flex justify-between items-center">
          <div>
            <h3 className="text-xl font-semibold text-white">Importar Nota com IA</h3>
            <p className="text-sm text-white/40 mt-1">
              Faça upload de foto ou PDF da nota fiscal para extração automática
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

          {!extractionData ? (
            <div className="space-y-4">
              <div className="border-2 border-dashed border-white/20 rounded-lg p-8">
                <div className="text-center">
                  <Upload className="w-12 h-12 text-white/30 mx-auto mb-4" />
                  <label className="cursor-pointer">
                    <span className="text-blue-400 hover:text-blue-400 font-medium">
                      Clique para selecionar
                    </span>
                    <span className="text-white/50"> ou arraste o arquivo aqui</span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,application/pdf"
                      onChange={handleFileSelect}
                    />
                  </label>
                  <p className="text-xs text-white/40 mt-2">
                    JPG, PNG, PDF até 20MB
                  </p>
                </div>

                {file && (
                  <div className="mt-4 p-4 bg-white/5 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center">
                        <FileText className="w-5 h-5 text-white/50 mr-2" />
                        <div>
                          <p className="text-sm font-medium text-white">{file.name}</p>
                          <p className="text-xs text-white/40">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                      </div>
                    </div>

                    {preview && (
                      <div className="mt-4">
                        <img
                          src={preview}
                          alt="Preview"
                          className="max-h-64 mx-auto rounded border border-white/10"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {file && (
                <button
                  onClick={handleExtract}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] disabled:opacity-50 flex items-center justify-center"
                >
                  {loading ? (
                    <>
                      <Loader className="w-5 h-5 mr-2 animate-spin" />
                      Processando com IA...
                    </>
                  ) : (
                    <>
                      <Upload className="w-5 h-5 mr-2" />
                      Extrair Dados
                    </>
                  )}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Fornecedor *
                  </label>
                  <input
                    type="text"
                    value={editedData?.extracted.emitente.nome || ''}
                    onChange={(e) =>
                      setEditedData({
                        ...editedData!,
                        extracted: {
                          ...editedData!.extracted,
                          emitente: { ...editedData!.extracted.emitente, nome: e.target.value },
                        },
                      })
                    }
                    className="w-full border border-white/20 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    CNPJ
                  </label>
                  <input
                    type="text"
                    value={editedData?.extracted.emitente.cnpj || ''}
                    onChange={(e) =>
                      setEditedData({
                        ...editedData!,
                        extracted: {
                          ...editedData!.extracted,
                          emitente: { ...editedData!.extracted.emitente, cnpj: e.target.value },
                        },
                      })
                    }
                    className="w-full border border-white/20 rounded-lg px-3 py-2"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Número NF
                  </label>
                  <input
                    type="text"
                    value={editedData?.extracted.documento.numero || ''}
                    onChange={(e) =>
                      setEditedData({
                        ...editedData!,
                        extracted: {
                          ...editedData!.extracted,
                          documento: { ...editedData!.extracted.documento, numero: e.target.value },
                        },
                      })
                    }
                    className="w-full border border-white/20 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Série
                  </label>
                  <input
                    type="text"
                    value={editedData?.extracted.documento.serie || ''}
                    onChange={(e) =>
                      setEditedData({
                        ...editedData!,
                        extracted: {
                          ...editedData!.extracted,
                          documento: { ...editedData!.extracted.documento, serie: e.target.value },
                        },
                      })
                    }
                    className="w-full border border-white/20 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Data Emissão
                  </label>
                  <input
                    type="date"
                    value={editedData?.extracted.documento.data_emissao || dayjs().format('YYYY-MM-DD')}
                    onChange={(e) =>
                      setEditedData({
                        ...editedData!,
                        extracted: {
                          ...editedData!.extracted,
                          documento: {
                            ...editedData!.extracted.documento,
                            data_emissao: e.target.value,
                          },
                        },
                      })
                    }
                    className="w-full border border-white/20 rounded-lg px-3 py-2"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Estoque Destino *
                  </label>
                  <select
                    value={estoqueDestinoId}
                    onChange={(e) => setEstoqueDestinoId(e.target.value)}
                    className="w-full border border-white/20 rounded-lg px-3 py-2"
                    required
                  >
                    <option value="">Selecione...</option>
                    {estoques.map((est) => (
                      <option key={est.id} value={est.id}>
                        {est.nome}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-2">
                  <h4 className="font-medium text-white">Itens da Nota</h4>
                  <div className="flex items-center gap-2">
                    {editedData && editedData.validation.diferenca > 0.5 && (
                      <span className="text-xs bg-yellow-500/15 text-yellow-300 px-2 py-1 rounded">
                        <AlertTriangle className="w-3 h-3 inline mr-1" />
                        Diferença: {formatCurrency(editedData.validation.diferenca)}
                      </span>
                    )}
                  </div>
                </div>

                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-white/5">
                        <tr>
                          <th className="px-3 py-2 text-left">Descrição</th>
                          <th className="px-3 py-2 text-center">Qtd</th>
                          <th className="px-3 py-2 text-center">Un</th>
                          <th className="px-3 py-2 text-right">V. Unit</th>
                          <th className="px-3 py-2 text-right">V. Total</th>
                          <th className="px-3 py-2 text-center">Ações</th>
                        </tr>
                      </thead>
                      <tbody>
                        {editedData?.extracted.itens.map((item, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={item.descricao}
                                onChange={(e) => updateItem(idx, 'descricao', e.target.value)}
                                className="w-full border border-white/20 rounded px-2 py-1"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="number"
                                step="0.01"
                                value={item.quantidade}
                                onChange={(e) =>
                                  updateItem(idx, 'quantidade', parseFloat(e.target.value) || 0)
                                }
                                className="w-20 border border-white/20 rounded px-2 py-1 text-center"
                              />
                            </td>
                            <td className="px-3 py-2">
                              <input
                                type="text"
                                value={item.unidade || ''}
                                onChange={(e) => updateItem(idx, 'unidade', e.target.value)}
                                className="w-16 border border-white/20 rounded px-2 py-1 text-center"
                              />
                            </td>
                            <td className="px-3 py-2 text-right">
                              <input
                                type="number"
                                step="0.01"
                                value={item.valor_unitario}
                                onChange={(e) =>
                                  updateItem(idx, 'valor_unitario', parseFloat(e.target.value) || 0)
                                }
                                className="w-24 border border-white/20 rounded px-2 py-1 text-right"
                              />
                            </td>
                            <td className="px-3 py-2 text-right font-medium">
                              {formatCurrency(item.valor_total)}
                            </td>
                            <td className="px-3 py-2 text-center">
                              <button
                                onClick={() => removeItem(idx)}
                                className="text-red-400 hover:text-red-300"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-3 bg-blue-500/10 border-t border-blue-500/30">
                    <button
                      onClick={addNewItem}
                      className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <Plus className="w-4 h-4" />
                      Adicionar Item Manualmente
                    </button>
                    <p className="text-xs text-blue-400 text-center mt-1">
                      Adicione itens que não foram reconhecidos pela IA
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex justify-between items-center">
                  <div className="text-sm text-white/50">
                    <span>Soma itens: {formatCurrency(editedData?.validation.somaItens || 0)}</span>
                    <span className="mx-2">•</span>
                    <span>Total NF: {formatCurrency(editedData?.extracted.totais.valor_total || 0)}</span>
                  </div>
                  <div className="text-lg font-bold text-[#7D1F2C]">
                    Total: {formatCurrency(editedData?.extracted.totais.valor_total || 0)}
                  </div>
                </div>
              </div>

              {extractionData?.meta && (
                <div className="text-xs text-white/40 flex items-center justify-end gap-4">
                  <span>Processado em {extractionData.meta.processingTime}ms</span>
                  <span>•</span>
                  <span>{extractionData.meta.tokens} tokens</span>
                </div>
              )}
            </div>
          )}
        </div>

        {extractionData && (
          <div className="p-6 border-t border-white/10 bg-white/5 flex justify-between gap-3">
            <button
              onClick={reset}
              className="px-4 py-2 border border-white/20 rounded-lg text-white/80 hover:bg-white/10/10"
            >
              Voltar
            </button>
            <button
              onClick={handleOpenMapping}
              disabled={!estoqueDestinoId}
              className="px-6 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] disabled:opacity-50 flex items-center"
            >
              <MapPin className="w-5 h-5 mr-2" />
              Mapear Itens e Confirmar
            </button>
          </div>
        )}
      </div>

      <ItemMappingModal
        isOpen={showMappingModal}
        onClose={() => setShowMappingModal(false)}
        onConfirm={handleMappingConfirm}
        extractedItems={editedData?.extracted.itens || []}
      />
    </div>
  );
};

export default ComprasIAModal;
