import React, { useEffect, useState } from 'react';
import { X, ClipboardCheck, Loader2, Package } from 'lucide-react';
import type { Estoque } from './types';
import * as service from './contagemService';
import { useAuth } from '../../../contexts/AuthContext';

interface Props {
  onClose: () => void;
  onCreated: (contagemId: string) => void;
}

const ContagemNovaModal: React.FC<Props> = ({ onClose, onCreated }) => {
  const { usuario } = useAuth();
  const [estoques, setEstoques] = useState<Estoque[]>([]);
  const [estoqueId, setEstoqueId] = useState('');
  const [responsavel, setResponsavel] = useState(usuario?.nome_completo || '');
  const [observacoes, setObservacoes] = useState('');
  const [incluirSemSaldo, setIncluirSemSaldo] = useState(true);
  const [loading, setLoading] = useState(false);
  const [loadingEstoques, setLoadingEstoques] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    service.loadEstoques().then((data) => {
      setEstoques(data);
      setLoadingEstoques(false);
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!estoqueId || !responsavel.trim()) return;

    setLoading(true);
    setError(null);
    try {
      const contagem = await service.criarContagem({
        estoque_id: estoqueId,
        responsavel: responsavel.trim(),
        observacoes: observacoes.trim() || undefined,
        criado_por: usuario?.id,
        incluir_sem_saldo: incluirSemSaldo,
      });
      onCreated(contagem.id);
    } catch (err: any) {
      console.error('Erro ao criar contagem:', err);
      setError(err.message || 'Erro ao criar contagem');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-[#0f1020] rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#7D1F2C] to-[#D4AF37] flex items-center justify-center">
              <ClipboardCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Nova Contagem</h3>
              <p className="text-xs text-white/40">Preencha os dados para iniciar</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/10/10 rounded-xl transition-colors"
          >
            <X className="w-5 h-5 text-white/30" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1.5">Estoque</label>
            {loadingEstoques ? (
              <div className="flex items-center gap-2 px-4 py-2.5 border border-white/10 rounded-xl text-sm text-white/30">
                <Loader2 className="w-4 h-4 animate-spin" />
                Carregando estoques...
              </div>
            ) : estoques.length === 0 ? (
              <div className="flex items-center gap-2 px-4 py-2.5 border border-amber-500/30 bg-amber-500/10 rounded-xl text-sm text-amber-300">
                <Package className="w-4 h-4" />
                Nenhum estoque ativo encontrado. Cadastre um estoque primeiro.
              </div>
            ) : (
              <select
                value={estoqueId}
                onChange={(e) => setEstoqueId(e.target.value)}
                className="w-full px-4 py-2.5 border border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/5 text-white"
                required
              >
                <option value="">Selecione o estoque</option>
                {estoques.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nome}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1.5">Responsavel</label>
            <input
              type="text"
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              placeholder="Nome do responsavel pela contagem"
              className="w-full px-4 py-2.5 border border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1.5">Observacoes</label>
            <textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              rows={2}
              placeholder="Observacoes sobre esta contagem (opcional)"
              className="w-full px-4 py-2.5 border border-white/10 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
            />
          </div>

          <label className="flex items-center gap-3 p-3 bg-white/5 rounded-xl cursor-pointer hover:bg-white/10/10 transition-colors">
            <input
              type="checkbox"
              checked={incluirSemSaldo}
              onChange={(e) => setIncluirSemSaldo(e.target.checked)}
              className="w-4 h-4 text-blue-400 rounded border-white/20 focus:ring-blue-500"
            />
            <div>
              <p className="text-sm font-medium text-white/80">Incluir itens sem saldo</p>
              <p className="text-xs text-white/40">
                Carrega todos os itens do estoque, inclusive os com saldo zero
              </p>
            </div>
          </label>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-400">
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-white/10 text-white/80 rounded-xl text-sm font-medium hover:bg-white/10/5 transition-colors"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !estoqueId || !responsavel.trim()}
              className="flex-1 px-4 py-2.5 bg-gradient-to-r from-[#7D1F2C] to-[#D4AF37] text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-all"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Criando...
                </>
              ) : (
                <>
                  <ClipboardCheck className="w-4 h-4" />
                  Iniciar Contagem
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ContagemNovaModal;
