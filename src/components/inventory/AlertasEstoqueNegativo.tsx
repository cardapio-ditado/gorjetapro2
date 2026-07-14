import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, Clock, TrendingDown, TrendingUp, RefreshCw } from 'lucide-react';
import { buscarAlertasNegativos, estatisticasNegativos } from '../../services/movimentacoesService';
import dayjs from '../../lib/dayjs';

interface AlertaNegativo {
  id: string;
  item_id: string;
  estoque_id: string;
  data_ficou_negativo: string;
  quantidade_negativa: number;
  valor_total: number;
  observacao: string;
  data_regularizacao?: string;
  item: { nome: string; codigo: string; unidade_medida: string };
  estoque: { nome: string };
}

interface Estatisticas {
  totalItensNegativos: number;
  totalAlertasAtivos: number;
  valorTotalNegativo: number;
  itensNegativos: any[];
}

export default function AlertasEstoqueNegativo() {
  const [alertas, setAlertas]   = useState<AlertaNegativo[]>([]);
  const [stats, setStats]       = useState<Estatisticas>({ totalItensNegativos: 0, totalAlertasAtivos: 0, valorTotalNegativo: 0, itensNegativos: [] });
  const [loading, setLoading]   = useState(true);
  const [apenasCriticos, setApenasCriticos] = useState(false);

  useEffect(() => { carregar(); }, []);

  async function carregar() {
    setLoading(true);
    try {
      const [alertasData, statsData] = await Promise.all([
        buscarAlertasNegativos(),
        estatisticasNegativos(),
      ]);
      setAlertas(alertasData as AlertaNegativo[]);
      setStats(statsData);
    } catch (err) {
      console.error('Erro ao carregar alertas:', err);
    } finally {
      setLoading(false);
    }
  }

  const filtrados = apenasCriticos
    ? alertas.filter(a => Math.abs(a.quantidade_negativa) > 5)
    : alertas;

  const formatarTempo = (data: string) => {
    const diff = dayjs().diff(dayjs(data), 'day');
    if (diff === 0) return 'Hoje';
    if (diff === 1) return 'Ontem';
    if (diff < 7)  return `${diff} dias atrás`;
    if (diff < 30) return `${Math.floor(diff / 7)} sem. atrás`;
    return `${Math.floor(diff / 30)} meses atrás`;
  };

  const getSeveridade = (quantidade: number) => {
    const abs = Math.abs(quantidade);
    if (abs >= 10) return 'critico';
    if (abs >= 5)  return 'alto';
    return 'medio';
  };

  if (loading) return (
    <div className="flex items-center justify-center py-8">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-500" />
    </div>
  );

  if (alertas.length === 0) return (
    <div className="bg-green-500/10 border border-green-500/30 rounded-xl p-6">
      <div className="flex items-center gap-3">
        <CheckCircle className="h-6 w-6 text-green-400 shrink-0" />
        <div>
          <h3 className="font-semibold text-green-300">Tudo em ordem!</h3>
          <p className="text-sm text-green-400">Nenhum item com saldo negativo no momento.</p>
        </div>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-red-500/10 border-2 border-red-500/30 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-red-400">Itens Negativos</p>
            <p className="text-2xl font-bold text-red-300">{stats.totalItensNegativos}</p>
          </div>
          <div className="bg-red-500/15 p-3 rounded-full"><TrendingDown className="h-6 w-6 text-red-400" /></div>
        </div>
        <div className="bg-orange-500/10 border-2 border-orange-500/30 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-orange-400">Alertas Ativos</p>
            <p className="text-2xl font-bold text-orange-300">{stats.totalAlertasAtivos}</p>
          </div>
          <div className="bg-orange-500/15 p-3 rounded-full"><AlertTriangle className="h-6 w-6 text-orange-400" /></div>
        </div>
        <div className="bg-yellow-500/10 border-2 border-yellow-500/30 rounded-xl p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-yellow-400">Valor Total</p>
            <p className="text-2xl font-bold text-yellow-300">R$ {Math.abs(stats.valorTotalNegativo).toFixed(2)}</p>
          </div>
          <div className="bg-yellow-500/15 p-3 rounded-full"><TrendingUp className="h-6 w-6 text-yellow-400" /></div>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex items-center justify-between bg-[#12141f] px-4 py-3 rounded-xl border border-white/10">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={apenasCriticos}
            onChange={e => setApenasCriticos(e.target.checked)}
            className="rounded border-white/20 bg-white/5 text-red-400 focus:ring-red-500"
          />
          <span className="text-sm text-white/70">Apenas críticos (&gt; 5 un.)</span>
        </label>
        <button onClick={carregar} className="flex items-center gap-1.5 text-sm text-blue-400 hover:text-blue-300 font-medium">
          <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
      </div>

      {/* Lista */}
      <div className="space-y-2">
        {filtrados.map(alerta => {
          const sev = getSeveridade(alerta.quantidade_negativa);
          return (
            <div key={alerta.id} className={`border-l-4 rounded-xl p-4 ${
              sev === 'critico' ? 'border-red-500 bg-red-500/10'
              : sev === 'alto'  ? 'border-orange-500 bg-orange-500/10'
              : 'border-yellow-500 bg-yellow-500/10'
            }`}>
              <div className="flex items-start gap-2 mb-2">
                <AlertTriangle className={`h-5 w-5 shrink-0 mt-0.5 ${
                  sev === 'critico' ? 'text-red-400' : sev === 'alto' ? 'text-orange-400' : 'text-yellow-400'
                }`} />
                <h3 className="font-semibold text-white/90">{alerta.item.codigo} — {alerta.item.nome}</h3>
                {sev === 'critico' && (
                  <span className="px-2 py-0.5 text-xs font-bold bg-red-500/15 text-red-400 rounded-full">CRÍTICO</span>
                )}
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm ml-7">
                <div>
                  <p className="text-white/50 text-xs">Estoque</p>
                  <p className="font-medium text-white/90">{alerta.estoque.nome}</p>
                </div>
                <div>
                  <p className="text-white/50 text-xs">Saldo Negativo</p>
                  <p className="font-bold text-red-400">{alerta.quantidade_negativa.toFixed(2)} {alerta.item.unidade_medida}</p>
                </div>
                <div>
                  <p className="text-white/50 text-xs">Valor</p>
                  <p className="font-medium text-white/90">R$ {Math.abs(alerta.valor_total).toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-white/50 text-xs">Há quanto tempo</p>
                  <div className="flex items-center gap-1 text-white/90">
                    <Clock className="h-3 w-3" />
                    <span className="font-medium">{formatarTempo(alerta.data_ficou_negativo)}</span>
                  </div>
                </div>
              </div>

              {alerta.observacao && (
                <p className="mt-2 text-xs text-white/50 italic ml-7">{alerta.observacao}</p>
              )}
            </div>
          );
        })}
      </div>

      {filtrados.length === 0 && alertas.length > 0 && (
        <div className="text-center py-8 text-white/40">
          <p>Nenhum alerta crítico.</p>
          <button onClick={() => setApenasCriticos(false)} className="mt-2 text-blue-400 hover:text-blue-300 font-medium">
            Mostrar todos
          </button>
        </div>
      )}

      <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
        <h4 className="font-semibold text-blue-300 mb-2">O que fazer?</h4>
        <ul className="space-y-1 text-sm text-blue-300">
          <li>• Verifique se a saída foi lançada antes da entrada correspondente</li>
          <li>• Registre a entrada de mercadoria para regularizar o saldo</li>
          <li>• Confira se não houve erro no lançamento da quantidade</li>
          <li>• Regularize o mais rápido possível</li>
        </ul>
      </div>
    </div>
  );
}