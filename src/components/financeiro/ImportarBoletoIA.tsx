import React, { useState } from 'react';
import { X, Upload, Camera, CheckCircle, AlertTriangle, Sparkles, Loader } from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface BoletoExtraction {
  beneficiario: {
    nome: string;
    cnpj: string;
    banco: string;
    agencia: string;
    conta: string;
  };
  valores: {
    principal: number;
    juros: number;
    multa: number;
    desconto: number;
    total: number;
  };
  datas: {
    emissao: string;
    vencimento: string;
    competencia: string;
  };
  codigo_barras: string;
  linha_digitavel: string;
  descricao: string;
  categoria_sugerida: string;
  observacoes: string;
  confidences: Record<string, number>;
}

interface ImportarBoletoIAProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (dados: BoletoExtraction) => void;
  tipo: 'pagar' | 'receber';
}

const ImportarBoletoIA: React.FC<ImportarBoletoIAProps> = ({
  isOpen,
  onClose,
  onConfirm,
  tipo,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extracted, setExtracted] = useState<BoletoExtraction | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf'];
    if (!validTypes.includes(selectedFile.type)) {
      setError('Formato inválido. Use JPG, PNG ou PDF.');
      return;
    }

    if (selectedFile.size > 10 * 1024 * 1024) {
      setError('Arquivo muito grande. Máximo 10MB.');
      return;
    }

    setFile(selectedFile);
    setError(null);

    if (selectedFile.type === 'application/pdf') {
      setPreview('pdf');
    } else {
      const reader = new FileReader();
      reader.onload = (e) => setPreview(e.target?.result as string);
      reader.readAsDataURL(selectedFile);
    }
  };

  const handleExtract = async () => {
    if (!file) return;

    console.log('[DEBUG] Arquivo selecionado:', {
      nome: file.name,
      tipo: file.type,
      tamanho: file.size,
    });

    setLoading(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      console.log('[DEBUG] Enviando para:', `${supabaseUrl}/functions/v1/extract-boleto`);

      const response = await fetch(
        `${supabaseUrl}/functions/v1/extract-boleto`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: formData,
        }
      );

      console.log('[DEBUG] Resposta status:', response.status);

      if (!response.ok) {
        const errorText = await response.text();
        let errorMessage = 'Erro ao processar documento';

        try {
          const errorJson = JSON.parse(errorText);
          errorMessage = errorJson.error || errorJson.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }

        console.error('Erro da API:', errorMessage);

        // Se é erro de API key, oferecer modo demo
        if (errorMessage.includes('OPENAI_API_KEY') || errorMessage.includes('API key')) {
          const usarDemo = window.confirm(
            '⚠️ OpenAI API Key não configurada.\n\n' +
            'Deseja usar o MODO DEMO para testar a interface?\n\n' +
            '(Os dados serão simulados para demonstração)'
          );

          if (usarDemo) {
            // Usar dados de demonstração
            const demoData = {
              beneficiario: {
                nome: 'AMBEV S.A.',
                cnpj: '07526557000100',
                banco: 'Banco do Brasil',
                agencia: '1234-5',
                conta: '67890-1',
              },
              valores: {
                principal: 5000.00,
                juros: 0,
                multa: 0,
                desconto: 0,
                total: 5000.00,
              },
              datas: {
                emissao: new Date().toISOString().split('T')[0],
                vencimento: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                competencia: new Date().toISOString().split('T')[0],
              },
              codigo_barras: '34191790010104351004791020150008291070026000',
              linha_digitavel: '34191.79001 01043.510047 91020.150008 2 91070026000',
              descricao: 'Fornecimento de bebidas - Pedido 12345',
              categoria_sugerida: 'Fornecedores',
              observacoes: 'Dados extraídos em MODO DEMO',
              confidences: {
                beneficiario_nome: 0.95,
                valor_total: 0.98,
                vencimento: 0.92,
                categoria: 0.85,
              },
            };

            setExtracted(demoData);
            setLoading(false);
            return;
          }
        }

        throw new Error(errorMessage);
      }

      const data = await response.json();

      if (!data.ok) {
        throw new Error(data.error || 'Erro ao extrair dados');
      }

      setExtracted(data.extracted);
    } catch (err) {
      console.error('Erro na extração:', err);
      setError(err instanceof Error ? err.message : 'Erro ao processar arquivo');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmExtraction = () => {
    if (extracted) {
      onConfirm(extracted);
      handleReset();
    }
  };

  const handleReset = () => {
    setFile(null);
    setPreview(null);
    setExtracted(null);
    setError(null);
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-400';
    if (confidence >= 0.6) return 'text-yellow-400';
    return 'text-red-400';
  };

  const getConfidenceLabel = (confidence: number) => {
    if (confidence >= 0.8) return 'Alta';
    if (confidence >= 0.6) return 'Média';
    return 'Baixa';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f1020] rounded-lg w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-6 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-[#7D1F2C] to-[#a0292e]">
          <div className="text-white">
            <div className="flex items-center gap-2">
              <Sparkles className="w-6 h-6" />
              <h3 className="text-xl font-semibold">
                Importar {tipo === 'pagar' ? 'Conta a Pagar' : 'Conta a Receber'} com IA
              </h3>
            </div>
            <p className="text-sm text-purple-100 mt-1">
              Tire uma foto ou faça upload do boleto/nota fiscal
            </p>
          </div>
          <button
            onClick={() => {
              handleReset();
              onClose();
            }}
            className="text-white hover:text-gray-200"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {error && (
            <div className="mb-4 p-4 bg-red-900/20 border border-red-700/40 rounded-lg flex items-start">
              <AlertTriangle className="w-5 h-5 text-red-400 mr-2 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <p className="text-sm text-red-300">{error}</p>
              </div>
            </div>
          )}

          {!extracted ? (
            <div className="space-y-4">
              {/* Upload Area */}
              <div className="border-2 border-dashed border-white/20 rounded-lg p-8 hover:border-purple-400 transition-colors">
                <div className="text-center">
                  <Camera className="w-12 h-12 text-white/40 mx-auto mb-4" />
                  <label className="cursor-pointer">
                    <span className="text-[#7D1F2C] hover:text-[#7D1F2C] font-medium">
                      Clique para selecionar
                    </span>
                    <span className="text-white/60"> ou arraste o documento</span>
                    <input
                      type="file"
                      className="hidden"
                      accept="image/*,.pdf"
                      onChange={handleFileSelect}
                      capture="environment"
                    />
                  </label>
                  <p className="text-xs text-white/50 mt-2">
                    JPG, PNG ou PDF até 10MB
                  </p>
                </div>

                {preview && (
                  <div className="mt-4">
                    {preview === 'pdf' ? (
                      <div className="flex flex-col items-center justify-center p-8 bg-white/5 rounded border border-white/10">
                        <FileText className="w-24 h-24 text-red-500 mb-4" />
                        <p className="text-white/80 font-medium">{file?.name}</p>
                        <p className="text-sm text-white/50 mt-1">
                          Arquivo PDF ({((file?.size || 0) / 1024 / 1024).toFixed(2)} MB)
                        </p>
                      </div>
                    ) : (
                      <img
                        src={preview}
                        alt="Preview"
                        className="max-h-96 mx-auto rounded border border-white/10"
                      />
                    )}
                  </div>
                )}
              </div>

              {file && (
                <button
                  onClick={handleExtract}
                  disabled={loading}
                  className="w-full px-4 py-3 bg-gradient-to-r from-[#7D1F2C] to-[#a0292e] text-white rounded-lg hover:from-purple-700 hover:to-blue-700 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? (
                    <>
                      <Loader className="w-5 h-5 animate-spin" />
                      Extraindo dados com IA...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      Extrair Dados com IA
                    </>
                  )}
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              {/* Resumo de Confiança */}
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <h4 className="font-medium text-white mb-3">Confiança da Extração</h4>
                <div className="grid grid-cols-4 gap-3">
                  {Object.entries(extracted.confidences).map(([key, value]) => (
                    <div key={key} className="text-center">
                      <div className={`text-2xl font-bold ${getConfidenceColor(value)}`}>
                        {(value * 100).toFixed(0)}%
                      </div>
                      <div className="text-xs text-white/60 mt-1">
                        {key === 'beneficiario_nome' && 'Beneficiário'}
                        {key === 'valor_total' && 'Valor'}
                        {key === 'vencimento' && 'Vencimento'}
                        {key === 'categoria' && 'Categoria'}
                      </div>
                      <div className={`text-xs font-medium mt-1 ${getConfidenceColor(value)}`}>
                        {getConfidenceLabel(value)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Dados Extraídos */}
              <div className="space-y-4">
                <h4 className="font-medium text-white">Dados Extraídos - Revise antes de confirmar</h4>

                {/* Beneficiário */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-white/60 mb-1">Beneficiário</label>
                    <input
                      type="text"
                      value={extracted.beneficiario.nome}
                      onChange={(e) =>
                        setExtracted({
                          ...extracted,
                          beneficiario: { ...extracted.beneficiario, nome: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 bg-white/5 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-1">CNPJ/CPF</label>
                    <input
                      type="text"
                      value={extracted.beneficiario.cnpj || ''}
                      onChange={(e) =>
                        setExtracted({
                          ...extracted,
                          beneficiario: { ...extracted.beneficiario, cnpj: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 bg-white/5 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Valores */}
                <div className="grid grid-cols-5 gap-3">
                  <div>
                    <label className="block text-sm text-white/60 mb-1">Valor Principal</label>
                    <input
                      type="number"
                      step="0.01"
                      value={extracted.valores.principal}
                      onChange={(e) =>
                        setExtracted({
                          ...extracted,
                          valores: { ...extracted.valores, principal: parseFloat(e.target.value) || 0 },
                        })
                      }
                      className="w-full px-3 py-2 bg-white/5 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-1">Juros</label>
                    <input
                      type="number"
                      step="0.01"
                      value={extracted.valores.juros}
                      onChange={(e) =>
                        setExtracted({
                          ...extracted,
                          valores: { ...extracted.valores, juros: parseFloat(e.target.value) || 0 },
                        })
                      }
                      className="w-full px-3 py-2 bg-white/5 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-1">Multa</label>
                    <input
                      type="number"
                      step="0.01"
                      value={extracted.valores.multa}
                      onChange={(e) =>
                        setExtracted({
                          ...extracted,
                          valores: { ...extracted.valores, multa: parseFloat(e.target.value) || 0 },
                        })
                      }
                      className="w-full px-3 py-2 bg-white/5 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-1">Desconto</label>
                    <input
                      type="number"
                      step="0.01"
                      value={extracted.valores.desconto}
                      onChange={(e) =>
                        setExtracted({
                          ...extracted,
                          valores: { ...extracted.valores, desconto: parseFloat(e.target.value) || 0 },
                        })
                      }
                      className="w-full px-3 py-2 bg-white/5 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-1">Valor Total</label>
                    <input
                      type="number"
                      step="0.01"
                      value={extracted.valores.total}
                      onChange={(e) =>
                        setExtracted({
                          ...extracted,
                          valores: { ...extracted.valores, total: parseFloat(e.target.value) || 0 },
                        })
                      }
                      className="w-full px-3 py-2 bg-white/5 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent font-bold"
                    />
                  </div>
                </div>

                {/* Datas */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm text-white/60 mb-1">Data Emissão</label>
                    <input
                      type="date"
                      value={extracted.datas.emissao || ''}
                      onChange={(e) =>
                        setExtracted({
                          ...extracted,
                          datas: { ...extracted.datas, emissao: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 bg-white/5 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-1">Vencimento *</label>
                    <input
                      type="date"
                      value={extracted.datas.vencimento}
                      onChange={(e) =>
                        setExtracted({
                          ...extracted,
                          datas: { ...extracted.datas, vencimento: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 bg-white/5 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-1">Competência</label>
                    <input
                      type="date"
                      value={extracted.datas.competencia || ''}
                      onChange={(e) =>
                        setExtracted({
                          ...extracted,
                          datas: { ...extracted.datas, competencia: e.target.value },
                        })
                      }
                      className="w-full px-3 py-2 bg-white/5 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Categoria e Descrição */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-white/60 mb-1">
                      Categoria Sugerida pela IA
                    </label>
                    <input
                      type="text"
                      value={extracted.categoria_sugerida || ''}
                      onChange={(e) =>
                        setExtracted({ ...extracted, categoria_sugerida: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-white/5 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-white/60 mb-1">Descrição</label>
                    <input
                      type="text"
                      value={extracted.descricao || ''}
                      onChange={(e) =>
                        setExtracted({ ...extracted, descricao: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-white/5 border border-white/20 text-white rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>
                </div>

                {/* Códigos */}
                {(extracted.codigo_barras || extracted.linha_digitavel) && (
                  <div className="grid grid-cols-2 gap-4">
                    {extracted.codigo_barras && (
                      <div>
                        <label className="block text-sm text-white/60 mb-1">Código de Barras</label>
                        <input
                          type="text"
                          value={extracted.codigo_barras}
                          readOnly
                          className="w-full px-3 py-2 border border-white/20 rounded-lg bg-white/5 font-mono text-xs"
                        />
                      </div>
                    )}
                    {extracted.linha_digitavel && (
                      <div>
                        <label className="block text-sm text-white/60 mb-1">Linha Digitável</label>
                        <input
                          type="text"
                          value={extracted.linha_digitavel}
                          readOnly
                          className="w-full px-3 py-2 border border-white/20 rounded-lg bg-white/5 font-mono text-xs"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Ações */}
              <div className="flex gap-3 pt-4 border-t border-white/10">
                <button
                  onClick={handleReset}
                  className="flex-1 px-4 py-2 border border-white/20 text-white/80 rounded-lg hover:bg-white/10"
                >
                  Tentar Novamente
                </button>
                <button
                  onClick={handleConfirmExtraction}
                  className="flex-1 px-4 py-2 bg-gradient-to-r from-[#7D1F2C] to-[#a0292e] text-white rounded-lg hover:from-purple-700 hover:to-blue-700 flex items-center justify-center gap-2"
                >
                  <CheckCircle className="w-5 h-5" />
                  Confirmar e Criar Conta
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default ImportarBoletoIA;
