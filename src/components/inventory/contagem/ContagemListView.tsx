// ContagemListView.tsx
import React, { useEffect, useState } from 'react';
import {
  ClipboardCheck, Plus, History, Eye, Play,
  Package, AlertTriangle, Loader2, Trash2,
} from 'lucide-react';
import dayjs from 'dayjs';
import type { Contagem } from './types';
import * as service from './contagemService';
import { formatCurrency } from '../../../utils/currency';

interface Props {
  onNovaContagem: () => void;
  onContinuarContagem: (contagem: Contagem) => void;
  onVerResultado: (contagem: Contagem) => void;
  onHistorico: () => void;
}

const ContagemListView: React.FC<Props> = ({
  onNovaContagem, onContinuarContagem, onVerResultado, onHistorico,
}) => {
  const [contagens, setContagens] = useState<Contagem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);

  const load = async () => {
    setLoading(true);
    try { setContagens(await service.loadContagensAtivas()); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleCancelar = async (contagem: Contagem) => {
    if (!confirm('Deseja cancelar esta contagem? Esta ação não pode ser desfeita.')) return;
    try { await service.cancelarContagem(contagem.id); load(); }
    catch (err: any) { alert('Erro ao cancelar: ' + err.message); }
  };

  const emAndamento = contagens.filter(c => c.status === 'em_andamento');
  const finalizadas = contagens.filter(c => c.status === 'finalizada');

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <Loader2 className="w-8 h-8 animate-spin text-white/30" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Contagem de Estoque</h2>
          <p className="text-sm text-white/40 mt-1">Gerencie contagens físicas e compare com saldos do sistema</p>
        </div>
        <div className="flex gap-3">
          <button onClick={onHistorico}
            className="px-4 py-2.5 bg-white/5 border border-white/10 text-white/80 rounded-xl hover:bg-white/10 flex items-center gap-2 text-sm font-medium shadow-sm transition-colors">
            <History className="w-4 h-4" /> Histórico
          </button>
          <button onClick={onNovaContagem}
            className="px-5 py-2.5 bg-gradient-to-r from-[#7D1F2C] to-[#D4AF37] text-white rounded-xl hover:opacity-90 flex items-center gap-2 text-sm font-semibold shadow-md transition-all">
            <Plus className="w-4 h-4" /> Nova Contagem
          </button>
        </div>
      </div>

      {/* Finalizadas aguardando processamento */}
      {finalizadas.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white/40 uppercase tracking-wider">Aguardando Processamento</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {finalizadas.map(c => (
              <div key={c.id} className="bg-[#12141f] rounded-2xl border border-amber-500/30 shadow-sm hover:shadow-md transition-all p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-amber-500/15 flex items-center justify-center">
                      <AlertTriangle className="w-4 h-4 text-amber-400" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-white text-sm">{c.estoque_nome}</h4>
                      <p className="text-xs text-white/40">{c.responsavel}</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-amber-500/15 text-amber-400 text-xs font-semibold rounded-full">Finalizada</span>
                </div>
                <div className="grid grid-cols-3 gap-2 mb-4">
                  <div className="text-center p-2 bg-white/5 rounded-lg">
                    <p className="text-lg font-bold text-white">{c.total_itens_contados}</p>
                    <p className="text-[10px] text-white/40 uppercase">Contados</p>
                  </div>
                  <div className="text-center p-2 bg-white/5 rounded-lg">
                    <p className="text-lg font-bold text-orange-400">{c.total_diferencas}</p>
                    <p className="text-[10px] text-white/40 uppercase">Diferenças</p>
                  </div>
                  <div className="text-center p-2 bg-white/5 rounded-lg">
                    <p className="text-sm font-bold text-red-400">{formatCurrency(Math.abs(c.valor_total_diferencas))}</p>
                    <p className="text-[10px] text-white/40 uppercase">Valor</p>
                  </div>
                </div>
                <button onClick={() => onVerResultado(c)}
                  className="w-full py-2 bg-amber-600 text-white rounded-xl text-sm font-semibold hover:bg-amber-700 flex items-center justify-center gap-2 transition-colors">
                  <Eye className="w-4 h-4" /> Ver Resultado
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Em andamento */}
      {emAndamento.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-semibold text-white/40 uppercase tracking-wider">Em Andamento</h3>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {emAndamento.map(c => (
              <div key={c.id} className="bg-[#12141f] rounded-2xl border border-blue-500/20 shadow-sm hover:shadow-md transition-all p-5">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
                      <ClipboardCheck className="w-4 h-4 text-blue-400" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-white text-sm">{c.estoque_nome}</h4>
                      <p className="text-xs text-white/40">{c.responsavel}</p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 bg-blue-500/15 text-blue-400 text-xs font-semibold rounded-full">Em Andamento</span>
                </div>
                <p className="text-xs text-white/30 mb-4">
                  Iniciada em {dayjs(c.criado_em).format('DD/MM/YYYY [às] HH:mm')}
                </p>
                <div className="flex gap-2">
                  <button onClick={() => onContinuarContagem(c)}
                    className="flex-1 py-2 bg-blue-600 text-white rounded-xl text-sm font-semibold hover:bg-blue-700 flex items-center justify-center gap-2 transition-colors">
                    <Play className="w-4 h-4" /> Continuar
                  </button>
                  <button onClick={() => handleCancelar(c)}
                    className="p-2 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-xl transition-colors" title="Cancelar contagem">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Vazio */}
      {contagens.length === 0 && (
        <div className="bg-[#12141f] rounded-2xl border border-white/5 shadow-sm p-16 text-center">
          <div className="w-20 h-20 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-6">
            <Package className="w-10 h-10 text-gray-300" />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Nenhuma contagem em andamento</h3>
          <p className="text-white/40 text-sm mb-8 max-w-md mx-auto">
            Inicie uma nova contagem para comparar quantidades físicas com os saldos do sistema.
          </p>
          <button onClick={onNovaContagem}
            className="px-6 py-3 bg-gradient-to-r from-[#7D1F2C] to-[#D4AF37] text-white rounded-xl hover:opacity-90 font-semibold shadow-md transition-all">
            Iniciar Nova Contagem
          </button>
        </div>
      )}
    </div>
  );
};

export default ContagemListView;