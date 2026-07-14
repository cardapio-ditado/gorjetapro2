import React from 'react';
import { X, AlertTriangle, CheckCircle, Package } from 'lucide-react';
import { VerificacaoEstoque } from '../../../services/producaoService';

interface ModalVerificacaoInsumosProps {
  verificacoes: VerificacaoEstoque[];
  onClose: () => void;
  onConfirm: () => void;
  disponivel: boolean;
}

const ModalVerificacaoInsumos: React.FC<ModalVerificacaoInsumosProps> = ({
  verificacoes, onClose, onConfirm, disponivel,
}) => {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f1020] border border-white/10 rounded-2xl p-6 w-full max-w-3xl max-h-[85vh] flex flex-col">
        <div className="flex justify-between items-center mb-5">
          <h3 className="text-lg font-bold text-white">Verificação de Insumos</h3>
          <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <X className="w-5 h-5 text-white/40" />
          </button>
        </div>

        {/* Status geral */}
        <div className={`p-4 rounded-xl mb-5 flex items-center gap-3 ${
          disponivel ? 'bg-green-500/10 border border-green-500/30' : 'bg-red-500/10 border border-red-500/30'
        }`}>
          {disponivel
            ? <CheckCircle className="w-6 h-6 text-green-400 shrink-0" />
            : <AlertTriangle className="w-6 h-6 text-red-400 shrink-0" />}
          <div>
            <p className={`font-semibold ${disponivel ? 'text-green-300' : 'text-red-300'}`}>
              {disponivel ? 'Todos os insumos disponíveis' : 'Insumos insuficientes'}
            </p>
            <p className={`text-sm ${disponivel ? 'text-green-400' : 'text-red-400'}`}>
              {disponivel
                ? 'A produção pode ser iniciada normalmente'
                : 'Verifique os itens em vermelho antes de prosseguir'}
            </p>
          </div>
        </div>

        {/* Tabela */}
        <div className="flex-1 overflow-y-auto rounded-xl border border-white/10">
          <table className="w-full">
            <thead className="bg-white/5 sticky top-0">
              <tr>
                {['Status', 'Insumo', 'Necessário', 'Disponível', 'Estoque'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-white/40 uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {verificacoes.map((v, i) => (
                <tr key={i} className={!v.tem_estoque_suficiente ? 'bg-red-500/10' : ''}>
                  <td className="px-4 py-3">
                    {v.tem_estoque_suficiente
                      ? <CheckCircle className="w-5 h-5 text-green-400" />
                      : <AlertTriangle className="w-5 h-5 text-red-400" />}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-white/30" />
                      <span className="font-medium text-white text-sm">{v.item_nome}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-sm font-medium text-white tabular-nums">
                    {v.quantidade_necessaria.toFixed(3)}
                  </td>
                  <td className="px-4 py-3 text-sm font-medium tabular-nums">
                    <span className={v.tem_estoque_suficiente ? 'text-green-400' : 'text-red-400'}>
                      {v.quantidade_disponivel.toFixed(3)}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-white/60">{v.estoque_nome}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-5 flex justify-end gap-3">
          <button onClick={onClose}
            className="px-4 py-2.5 border border-white/20 rounded-xl text-white/80 hover:bg-white/5 text-sm font-medium transition-colors">
            Cancelar
          </button>
          {disponivel && (
            <button onClick={onConfirm}
              className="px-4 py-2.5 bg-[#7D1F2C] text-white rounded-xl hover:bg-[#6a1a25] text-sm font-semibold transition-colors">
              Confirmar e Iniciar
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default ModalVerificacaoInsumos;