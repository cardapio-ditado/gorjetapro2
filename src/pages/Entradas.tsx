import React, { useState, useEffect } from 'react';
import { Plus, CheckCircle2, TrendingUp, RefreshCw, AlertTriangle, DollarSign, Target, Trash2 } from 'lucide-react';
import { formatCurrency } from '../utils/currency';
import * as entradasService from '../services/entradasService';
import * as veService from '../services/visaoEstrategica';
import { PageHeader, KPICard, SectionCard } from '../components/ui';

const Entradas: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [semanaAtual, setSemanaAtual] = useState<veService.Semana | null>(null);
  const [entradas, setEntradas] = useState<entradasService.EntradasSemana>({
    previstos: [],
    realizados: [],
    totalPrevisto: 0,
    totalRealizado: 0,
    gap: 0,
    percentualRealizado: 0
  });

  const [newPrevisto, setNewPrevisto] = useState({ descricao: '', valor: '' });
  const [newRealizado, setNewRealizado] = useState({ descricao: '', valor: '' });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const semana = await veService.getSemanaAtual();

      if (semana) {
        setSemanaAtual(semana);
        const entradasData = await entradasService.getEntradasSemana(semana.id);
        setEntradas(entradasData);
      }
    } catch (error: any) {
      console.error('Erro ao carregar dados de entrada:', error.message);
      alert('Erro ao carregar dados de entrada');
    } finally {
      setLoading(false);
    }
  };

  const handleAddPrevisto = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!semanaAtual || !newPrevisto.descricao || !newPrevisto.valor) return;

    try {
      const valor = parseFloat(newPrevisto.valor);
      if (isNaN(valor) || valor <= 0) {
        alert('Valor inválido');
        return;
      }

      await entradasService.criarEntradaPrevista(semanaAtual.id, newPrevisto.descricao, valor);
      setNewPrevisto({ descricao: '', valor: '' });
      fetchData();
      console.log('Provisão adicionada!');
    } catch (error: any) {
      console.error('Erro ao adicionar provisão:', error.message);
      alert('Erro ao adicionar provisão');
    }
  };

  const handleAddRealizado = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!semanaAtual || !newRealizado.descricao || !newRealizado.valor) return;

    try {
      const valor = parseFloat(newRealizado.valor);
      if (isNaN(valor) || valor <= 0) {
        alert('Valor inválido');
        return;
      }

      await entradasService.criarEntradaRealizada(semanaAtual.id, newRealizado.descricao, valor);
      setNewRealizado({ descricao: '', valor: '' });
      fetchData();
      console.log('Entrada real registrada!');
    } catch (error: any) {
      console.error('Erro ao registrar entrada:', error.message);
      alert('Erro ao registrar entrada');
    }
  };

  const removeInflow = async (id: string) => {
    if (!confirm('Deseja excluir este registro?')) return;

    try {
      await entradasService.excluirEntrada(id);
      fetchData();
      console.log('Registro removido');
    } catch (error: any) {
      console.error('Erro ao remover registro:', error.message);
      alert('Erro ao remover registro');
    }
  };

  const handleSyncRevenue = async () => {
    if (!semanaAtual) {
      alert('Nenhuma semana ativa encontrada');
      return;
    }

    setSyncing(true);
    try {
      await entradasService.sincronizarComFaturamento(semanaAtual.id);
      console.log('Caixinhas atualizadas com sucesso!');
      alert('Caixinhas atualizadas com sucesso com o valor Realizado!');
      fetchData();
    } catch (error: any) {
      console.error('Erro ao sincronizar:', error.message);
      alert('Erro ao sincronizar com as caixinhas');
    } finally {
      setSyncing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-white/60">
        Carregando módulo de entradas...
      </div>
    );
  }

  if (!semanaAtual) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <p className="text-white/60 mb-4">Nenhuma semana ativa encontrada</p>
        <p className="text-sm text-white/40">Crie uma semana na Visão Estratégica primeiro</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-white">Entradas: Previsto x Realizado</h1>
          <p className="text-white/60 mt-1">Controle o que deve entrar na semana e alimente suas caixinhas</p>
        </div>
        <button
          onClick={handleSyncRevenue}
          disabled={syncing || entradas.totalRealizado === 0}
          className="flex items-center gap-2 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {syncing ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              Sincronizando...
            </>
          ) : (
            <>
              <TrendingUp className="w-5 h-5" />
              Alimentar Caixinhas ({formatCurrency(entradas.totalRealizado)})
            </>
          )}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#12141f] border border-white/10 rounded-lg p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <Target className="w-5 h-5 text-white/40" />
            <h3 className="text-sm text-white/60 font-medium uppercase">Total Previsto</h3>
          </div>
          <p className="text-3xl font-bold text-white">
            {formatCurrency(entradas.totalPrevisto)}
          </p>
        </div>

        <div className="bg-[#12141f] border border-white/10 rounded-lg p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <CheckCircle2 className="w-5 h-5 text-green-400" />
            <h3 className="text-sm text-white/60 font-medium uppercase">Total Realizado</h3>
          </div>
          <p className="text-3xl font-bold text-green-400">
            {formatCurrency(entradas.totalRealizado)}
          </p>
        </div>

        <div className="bg-[#12141f] border border-white/10 rounded-lg p-6 shadow-sm">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle className={`w-5 h-5 ${entradas.gap > 0 ? 'text-amber-400' : 'text-green-400'}`} />
            <h3 className="text-sm text-white/60 font-medium uppercase">Gap / Faltante</h3>
          </div>
          <p className={`text-3xl font-bold ${entradas.gap > 0 ? 'text-amber-400' : 'text-green-400'}`}>
            {formatCurrency(Math.abs(entradas.gap))}
          </p>
          <div className="mt-3 h-2 bg-[#12141f]/10 rounded-full overflow-hidden">
            <div
              className={`h-full ${entradas.percentualRealizado >= 100 ? 'bg-green-600' : 'bg-amber-500'}`}
              style={{ width: `${Math.min(entradas.percentualRealizado, 100)}%` }}
            />
          </div>
          <p className="text-xs text-white/40 mt-1">{entradas.percentualRealizado.toFixed(1)}% realizado</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#12141f] border border-white/10 rounded-lg p-6 shadow-sm">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <Target className="w-5 h-5" /> Provisões da Semana
          </h2>
          <form onSubmit={handleAddPrevisto} className="flex gap-2 mb-6">
            <input
              type="text"
              placeholder="Ex: Cartão de Crédito"
              value={newPrevisto.descricao}
              onChange={(e) => setNewPrevisto({ ...newPrevisto, descricao: e.target.value })}
              className="flex-1 px-4 py-2 border-b-2 border-white/20 focus:border-blue-600 focus:outline-none"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Valor"
              value={newPrevisto.valor}
              onChange={(e) => setNewPrevisto({ ...newPrevisto, valor: e.target.value })}
              className="w-32 px-4 py-2 border-b-2 border-white/20 focus:border-blue-600 focus:outline-none"
            />
            <button
              type="submit"
              className="px-4 py-2 border border-white/20 hover:bg-[#12141f]/5 rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </form>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {entradas.previstos.map((item) => (
              <div key={item.id} className="flex justify-between items-center p-3 bg-[#12141f]/5 rounded-lg border border-white/10">
                <span className="text-white font-medium">{item.descricao}</span>
                <div className="flex items-center gap-4">
                  <span className="text-white/80">{formatCurrency(item.valor)}</span>
                  <button
                    onClick={() => removeInflow(item.id)}
                    className="text-red-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {entradas.previstos.length === 0 && (
              <p className="text-center text-white/40 py-8">Nenhuma provisão cadastrada</p>
            )}
          </div>
        </div>

        <div className="bg-[#12141f] border-t-4 border-t-green-600 border border-white/10 rounded-lg p-6 shadow-sm">
          <h2 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-green-400" /> Entradas Reais
          </h2>
          <form onSubmit={handleAddRealizado} className="flex gap-2 mb-6">
            <input
              type="text"
              placeholder="Ex: Depósito Pix"
              value={newRealizado.descricao}
              onChange={(e) => setNewRealizado({ ...newRealizado, descricao: e.target.value })}
              className="flex-1 px-4 py-2 border-b-2 border-green-500/40 focus:border-green-600 focus:outline-none"
            />
            <input
              type="number"
              step="0.01"
              placeholder="Valor"
              value={newRealizado.valor}
              onChange={(e) => setNewRealizado({ ...newRealizado, valor: e.target.value })}
              className="w-32 px-4 py-2 border-b-2 border-green-500/40 focus:border-green-600 focus:outline-none"
            />
            <button
              type="submit"
              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
            >
              <Plus className="w-5 h-5" />
            </button>
          </form>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {entradas.realizados.map((item) => (
              <div key={item.id} className="flex justify-between items-center p-3 bg-green-500/10 rounded-lg border border-green-500/30">
                <span className="text-white font-medium">{item.descricao}</span>
                <div className="flex items-center gap-4">
                  <span className="text-green-400 font-bold">{formatCurrency(item.valor)}</span>
                  <button
                    onClick={() => removeInflow(item.id)}
                    className="text-red-400 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
            {entradas.realizados.length === 0 && (
              <p className="text-center text-white/40 py-8">Nenhuma entrada real cadastrada</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Entradas;
