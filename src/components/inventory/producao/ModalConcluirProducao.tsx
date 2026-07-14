import React, { useState } from 'react';
import { X, CheckCircle, AlertTriangle } from 'lucide-react';

interface ModalConcluirProducaoProps {
  producao: any;
  onClose: () => void;
  onConfirm: (dados: {
    quantidade_produzida: number;
    quantidade_aprovada: number;
    observacoes?: string;
  }) => void;
}

const ModalConcluirProducao: React.FC<ModalConcluirProducaoProps> = ({
  producao, onClose, onConfirm,
}) => {
  const [quantidadeProduzida, setQuantidadeProduzida] = useState<number>(producao.quantidade);
  const [quantidadeAprovada, setQuantidadeAprovada]   = useState<number>(producao.quantidade);
  const [observacoes, setObservacoes]                 = useState('');

  const quantidadeRejeitada   = quantidadeProduzida - quantidadeAprovada;
  const percentualDesperdicio = quantidadeProduzida > 0
    ? (quantidadeRejeitada / quantidadeProduzida) * 100 : 0;

  const handleSubmit = () => {
    if (quantidadeProduzida <= 0 || quantidadeAprovada < 0) {
      alert('Preencha as quantidades corretamente'); return;
    }
    if (quantidadeAprovada > quantidadeProduzida) {
      alert('A quantidade aprovada não pode ser maior que a produzida'); return;
    }
    onConfirm({ quantidade_produzida: quantidadeProduzida, quantidade_aprovada: quantidadeAprovada, observacoes });
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f1020] border border-white/10 rounded-2xl p-6 w-full max-w-lg">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-lg font-bold text-white">Concluir Produção</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <X className="w-5 h-5 text-white/40" />
          </button>
        </div>

        {/* Info da produção */}
        <div className="bg-blue-500/10 border border-blue-500/30 p-4 rounded-xl mb-5">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
            <div className="space-y-1 text-sm">
              <p className="font-semibold text-blue-300">Informações da Produção</p>
              <p className="text-blue-400">Ficha: <span className="font-medium text-white">{producao.ficha_nome}</span></p>
              <p className="text-blue-400">Lote: <span className="font-medium text-white">{producao.lote_producao}</span></p>
              <p className="text-blue-400">Qtd. Planejada: <span className="font-medium text-white">{producao.quantidade}</span></p>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1.5">Quantidade Produzida *</label>
            <input type="number" min="0" step="0.001" value={quantidadeProduzida}
              onChange={e => setQuantidadeProduzida(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl border border-white/20 bg-white/5 text-white px-3 py-2.5 focus:border-[#7D1F2C] focus:ring-2 focus:ring-[#7D1F2C]/30 focus:outline-none" />
            <p className="text-xs text-white/40 mt-1">Total produzido (aprovados + rejeitados)</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1.5">Quantidade Aprovada *</label>
            <input type="number" min="0" max={quantidadeProduzida} step="0.001" value={quantidadeAprovada}
              onChange={e => setQuantidadeAprovada(parseFloat(e.target.value) || 0)}
              className="w-full rounded-xl border border-white/20 bg-white/5 text-white px-3 py-2.5 focus:border-[#7D1F2C] focus:ring-2 focus:ring-[#7D1F2C]/30 focus:outline-none" />
            <p className="text-xs text-white/40 mt-1">Aprovada pelo controle de qualidade</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1.5">Observações</label>
            <textarea value={observacoes} onChange={e => setObservacoes(e.target.value)} rows={3}
              placeholder="Observações sobre a produção..."
              className="w-full rounded-xl border border-white/20 bg-white/5 text-white px-3 py-2.5 focus:border-[#7D1F2C] focus:ring-2 focus:ring-[#7D1F2C]/30 focus:outline-none resize-none" />
          </div>

          {quantidadeRejeitada > 0 && (
            <div className="bg-yellow-500/10 border border-yellow-500/30 p-4 rounded-xl">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-semibold text-yellow-300 text-sm mb-2">Análise de Desperdício</p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-yellow-400">Quantidade Rejeitada</p>
                      <p className="font-bold text-yellow-300">{quantidadeRejeitada.toFixed(3)}</p>
                    </div>
                    <div>
                      <p className="text-yellow-400">% Desperdício</p>
                      <p className="font-bold text-yellow-300">{percentualDesperdicio.toFixed(2)}%</p>
                    </div>
                  </div>
                  {percentualDesperdicio > 10 && (
                    <p className="text-xs text-yellow-400 mt-2">
                      ⚠️ Desperdício acima de 10%. Registre o motivo nas observações.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-3">
          <button onClick={onClose}
            className="px-4 py-2.5 border border-white/20 rounded-xl text-white/80 hover:bg-white/5 text-sm font-medium transition-colors">
            Cancelar
          </button>
          <button onClick={handleSubmit}
            className="px-4 py-2.5 bg-[#7D1F2C] text-white rounded-xl hover:bg-[#6a1a25] text-sm font-semibold transition-colors">
            Concluir Produção
          </button>
        </div>
      </div>
    </div>
  );
};

export default ModalConcluirProducao;