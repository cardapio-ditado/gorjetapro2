import React, { useState, useEffect, useRef } from 'react';
import {
  TrendingUp,
  Upload,
  History,
  Target,
  FileText,
  DollarSign,
  Package,
  AlertCircle,
  CheckCircle,
  Clock,
  BarChart3,
  Calendar,
  Filter,
  FolderOpen
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import dayjs from '../../lib/dayjs';
import ImportarVendasIA, { ImportarVendasIAHandle } from './ImportarVendasIA';
import LancarVendasModal from './LancarVendasModal';
import BibliotecaMapeamentos from './vendas/BibliotecaMapeamentos';
import HistoricoImportacoes from './vendas/HistoricoImportacoes';
import RelatoriosVendas from './vendas/RelatoriosVendas';

interface ImportacaoVenda {
  id: string;
  arquivo_nome: string;
  criado_em: string;
  total_linhas: number;
  total_processadas: number;
  total_sucesso: number;
  total_erro: number;
  status: string;
  processado_em?: string;
}

interface IndicadoresVendas {
  total_importacoes: number;
  importacoes_mes: number;
  itens_mapeados: number;
  taxa_mapeamento: number;
  ultima_importacao?: string;
}

const VendasDashboard: React.FC = () => {
  const importarVendasRef = useRef<ImportarVendasIAHandle>(null);
  const [activeView, setActiveView] = useState<'dashboard' | 'importar' | 'historico' | 'mapeamentos'>('dashboard');
  const [importacoes, setImportacoes] = useState<ImportacaoVenda[]>([]);
  const [indicadores, setIndicadores] = useState<IndicadoresVendas | null>(null);
  const [loading, setLoading] = useState(true);
  const [showImportar, setShowImportar] = useState(false);
  const [showLancarVenda, setShowLancarVenda] = useState(false);
  const [showBibliotecaMapeamentos, setShowBibliotecaMapeamentos] = useState(false);
  const [showHistorico, setShowHistorico] = useState(false);
  const [showRelatorios, setShowRelatorios] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState<string>('all');
  const [periodo, setPeriodo] = useState<'today' | 'week' | 'month' | 'all'>('month');

  useEffect(() => {
    fetchIndicadores();
    fetchImportacoes();
  }, [periodo]);

  const handleReabrirImportacao = async (importacaoId: string) => {
    setShowImportar(true);
    setTimeout(async () => {
      await importarVendasRef.current?.reabrirImportacao(importacaoId);
    }, 100);
  };

  const fetchIndicadores = async () => {
    try {
      setLoading(true);

      // Calcular datas baseado no período
      let dataInicio = '';
      const dataFim = dayjs().format('YYYY-MM-DD');

      switch (periodo) {
        case 'today':
          dataInicio = dayjs().format('YYYY-MM-DD');
          break;
        case 'week':
          dataInicio = dayjs().subtract(7, 'days').format('YYYY-MM-DD');
          break;
        case 'month':
          dataInicio = dayjs().startOf('month').format('YYYY-MM-DD');
          break;
        default:
          dataInicio = '2020-01-01';
      }

      // Buscar importações
      let query = supabase
        .from('importacoes_vendas')
        .select('*', { count: 'exact' });

      if (periodo !== 'all') {
        query = query
          .gte('criado_em', dataInicio)
          .lte('criado_em', dataFim);
      }

      const { data: importacoesData, error: importacoesError, count } = await query;

      if (importacoesError) throw importacoesError;

      // Buscar mapeamentos
      const { data: mapeamentosData, error: mapeamentosError } = await supabase
        .from('mapeamentos_vendas_estoque')
        .select('id, confianca', { count: 'exact' });

      if (mapeamentosError) throw mapeamentosError;

      const totalImportacoes = count || 0;
      const importacoesMes = (importacoesData || []).length;
      const itensMapeados = (mapeamentosData || []).length;

      // Calcular taxa de mapeamento (baseado em confiança média)
      const confidenciaMedia =
        mapeamentosData && mapeamentosData.length > 0
          ? mapeamentosData.reduce((acc, m) => acc + (m.confianca || 0), 0) / mapeamentosData.length
          : 0;

      const ultimaImportacao =
        importacoesData && importacoesData.length > 0
          ? importacoesData[0].criado_em
          : undefined;

      setIndicadores({
        total_importacoes: totalImportacoes,
        importacoes_mes: importacoesMes,
        itens_mapeados: itensMapeados,
        taxa_mapeamento: confidenciaMedia * 100,
        ultima_importacao: ultimaImportacao
      });
    } catch (error) {
      console.error('Erro ao buscar indicadores:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchImportacoes = async () => {
    try {
      let query = supabase
        .from('importacoes_vendas')
        .select('*')
        .order('criado_em', { ascending: false })
        .limit(10);

      if (filtroStatus !== 'all') {
        query = query.eq('status', filtroStatus);
      }

      const { data, error } = await query;

      if (error) throw error;

      setImportacoes(data || []);
    } catch (error) {
      console.error('Erro ao buscar importações:', error);
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; color: string; icon: any }> = {
      processada: { label: 'Processada', color: 'bg-green-500/15 text-green-300', icon: CheckCircle },
      pendente: { label: 'Pendente', color: 'bg-yellow-500/15 text-yellow-300', icon: Clock },
      erro: { label: 'Erro', color: 'bg-red-500/15 text-red-300', icon: AlertCircle },
      em_processamento: { label: 'Processando', color: 'bg-blue-500/15 text-blue-300', icon: Clock }
    };

    const config = statusConfig[status] || statusConfig.pendente;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </span>
    );
  };

  const renderDashboard = () => (
    <div className="space-y-6">
      {/* Header com ações rápidas */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Gestão de Vendas</h2>
          <p className="text-white/50 mt-1">
            Importe, mapeie e gerencie suas vendas de sistemas externos
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowLancarVenda(true)}
            className="inline-flex items-center px-4 py-2 bg-white border border-white/20 rounded-lg text-sm font-medium text-white/80 hover:bg-white/10/5 transition-colors"
          >
            <FileText className="w-4 h-4 mr-2" />
            Lançar Venda
          </button>
          <button
            onClick={() => setShowImportar(true)}
            className="inline-flex items-center px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-lg text-sm font-medium hover:from-blue-700 hover:to-blue-800 transition-all shadow-sm hover:shadow-md"
          >
            <Upload className="w-4 h-4 mr-2" />
            Importar Vendas
          </button>
        </div>
      </div>

      {/* Filtro de período */}
      <div className="flex items-center gap-2">
        <Calendar className="w-5 h-5 text-white/30" />
        <div className="flex gap-2">
          {[
            { value: 'today', label: 'Hoje' },
            { value: 'week', label: '7 dias' },
            { value: 'month', label: 'Este mês' },
            { value: 'all', label: 'Tudo' }
          ].map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriodo(p.value as any)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                periodo === p.value
                  ? 'bg-blue-500/15 text-blue-400'
                  : 'bg-white/10 text-white/50 hover:bg-gray-200'
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Indicadores */}
      {indicadores && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-6 rounded-xl border border-blue-500/30 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-blue-300 mb-1">Total Importações</p>
                <p className="text-3xl font-bold text-blue-400">
                  {indicadores.total_importacoes}
                </p>
                <p className="text-xs text-blue-400 mt-2">
                  {indicadores.importacoes_mes} no período
                </p>
              </div>
              <div className="bg-blue-200 p-3 rounded-lg">
                <Upload className="w-6 h-6 text-blue-400" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-green-50 to-green-100 p-6 rounded-xl border border-green-500/30 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-green-300 mb-1">Itens Mapeados</p>
                <p className="text-3xl font-bold text-green-400">
                  {indicadores.itens_mapeados}
                </p>
                <p className="text-xs text-green-400 mt-2">No catálogo interno</p>
              </div>
              <div className="bg-green-200 p-3 rounded-lg">
                <Target className="w-6 h-6 text-green-400" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-50 to-purple-100 p-6 rounded-xl border border-purple-500/30 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-purple-300 mb-1">Taxa de Match</p>
                <p className="text-3xl font-bold text-purple-400">
                  {indicadores.taxa_mapeamento.toFixed(1)}%
                </p>
                <p className="text-xs text-purple-400 mt-2">Confiança média</p>
              </div>
              <div className="bg-purple-200 p-3 rounded-lg">
                <BarChart3 className="w-6 h-6 text-purple-400" />
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-orange-50 to-orange-100 p-6 rounded-xl border border-orange-500/30 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-medium text-orange-300 mb-1">Última Importação</p>
                <p className="text-lg font-bold text-orange-400">
                  {indicadores.ultima_importacao
                    ? dayjs(indicadores.ultima_importacao).format('DD/MM/YYYY')
                    : 'Nenhuma'}
                </p>
                <p className="text-xs text-orange-400 mt-2">
                  {indicadores.ultima_importacao
                    ? dayjs(indicadores.ultima_importacao).fromNow()
                    : '-'}
                </p>
              </div>
              <div className="bg-orange-200 p-3 rounded-lg">
                <Clock className="w-6 h-6 text-orange-400" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Histórico recente */}
      <div className="bg-white rounded-xl shadow-sm border border-white/10">
        <div className="px-6 py-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Importações Recentes</h3>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-white/30" />
              <select
                value={filtroStatus}
                onChange={(e) => setFiltroStatus(e.target.value)}
                className="text-sm border border-white/20 rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">Todos os status</option>
                <option value="processada">Processada</option>
                <option value="pendente">Pendente</option>
                <option value="erro">Erro</option>
              </select>
            </div>
          </div>
        </div>

        <div className="divide-y divide-white/10">
          {loading ? (
            <div className="p-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <p className="text-white/40 mt-2">Carregando...</p>
            </div>
          ) : importacoes.length === 0 ? (
            <div className="p-8 text-center">
              <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-white/40">Nenhuma importação encontrada</p>
              <p className="text-sm text-white/30 mt-1">
                Clique em "Importar Vendas" para começar
              </p>
            </div>
          ) : (
            importacoes.map((imp) => (
              <div
                key={imp.id}
                className="p-6 hover:bg-white/10/5 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-medium text-white">{imp.arquivo_nome}</h4>
                      {getStatusBadge(imp.status || 'pendente')}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-white/50">
                      <span className="flex items-center">
                        <Calendar className="w-4 h-4 mr-1" />
                        {dayjs(imp.criado_em).format('DD/MM/YYYY HH:mm')}
                      </span>
                      <span className="flex items-center">
                        <Package className="w-4 h-4 mr-1" />
                        {imp.total_linhas || 0} itens
                      </span>
                      {imp.total_sucesso > 0 && (
                        <span className="flex items-center text-green-400">
                          <CheckCircle className="w-4 h-4 mr-1" />
                          {imp.total_sucesso} sucesso
                        </span>
                      )}
                      {imp.total_erro > 0 && (
                        <span className="flex items-center text-red-400">
                          <AlertCircle className="w-4 h-4 mr-1" />
                          {imp.total_erro} erros
                        </span>
                      )}
                      {imp.processado_em && (
                        <span className="flex items-center text-blue-400">
                          <Clock className="w-4 h-4 mr-1" />
                          Processado {dayjs(imp.processado_em).fromNow()}
                        </span>
                      )}
                    </div>
                  </div>

                  {(imp.status === 'pendente' || imp.status === 'revisao') && (
                    <button
                      onClick={() => handleReabrirImportacao(imp.id)}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors flex items-center gap-2"
                      title="Reabrir para processar"
                    >
                      <FolderOpen className="w-4 h-4" />
                      Reabrir
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Ações rápidas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <button
          onClick={() => setShowHistorico(true)}
          className="p-6 bg-white border-2 border-white/10 rounded-xl hover:border-blue-300 hover:shadow-md transition-all text-left group"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="bg-blue-500/15 p-3 rounded-lg group-hover:bg-blue-200 transition-colors">
              <History className="w-6 h-6 text-blue-400" />
            </div>
          </div>
          <h4 className="font-semibold text-white mb-1">Histórico Completo</h4>
          <p className="text-sm text-white/50">
            Ver todas as importações e seus status
          </p>
        </button>

        <button
          onClick={() => setShowBibliotecaMapeamentos(true)}
          className="p-6 bg-white border-2 border-white/10 rounded-xl hover:border-green-500/40 hover:shadow-md transition-all text-left group"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="bg-green-500/15 p-3 rounded-lg group-hover:bg-green-200 transition-colors">
              <Target className="w-6 h-6 text-green-400" />
            </div>
          </div>
          <h4 className="font-semibold text-white mb-1">Biblioteca de Mapeamentos</h4>
          <p className="text-sm text-white/50">
            Gerenciar correspondências de produtos
          </p>
        </button>

        <button
          onClick={() => setShowRelatorios(true)}
          className="p-6 bg-white border-2 border-white/10 rounded-xl hover:border-purple-300 hover:shadow-md transition-all text-left group"
        >
          <div className="flex items-start justify-between mb-3">
            <div className="bg-purple-500/15 p-3 rounded-lg group-hover:bg-purple-200 transition-colors">
              <BarChart3 className="w-6 h-6 text-purple-400" />
            </div>
          </div>
          <h4 className="font-semibold text-white mb-1">Relatórios e Análises</h4>
          <p className="text-sm text-white/50">
            Insights sobre suas vendas importadas
          </p>
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-6">
      {renderDashboard()}

      {/* Modal de Importação */}
      <ImportarVendasIA
        ref={importarVendasRef}
        isOpen={showImportar}
        onClose={() => {
          setShowImportar(false);
          fetchIndicadores();
          fetchImportacoes();
        }}
        onSuccess={() => {
          setShowImportar(false);
          fetchIndicadores();
          fetchImportacoes();
        }}
      />

      {/* Modal de Lançar Venda */}
      <LancarVendasModal
        isOpen={showLancarVenda}
        onClose={() => {
          setShowLancarVenda(false);
          fetchIndicadores();
          fetchImportacoes();
        }}
        onSuccess={() => {
          setShowLancarVenda(false);
          fetchIndicadores();
          fetchImportacoes();
        }}
      />

      {/* Modal Biblioteca de Mapeamentos */}
      {showBibliotecaMapeamentos && (
        <BibliotecaMapeamentos
          onClose={() => setShowBibliotecaMapeamentos(false)}
        />
      )}

      {/* Modal Histórico de Importações */}
      {showHistorico && (
        <HistoricoImportacoes
          onClose={() => setShowHistorico(false)}
          onViewDetails={(id) => {
            console.log('Ver detalhes da importação:', id);
          }}
          onReabrir={async (importacaoId) => {
            setShowHistorico(false);
            setShowImportar(true);
            setTimeout(async () => {
              await importarVendasRef.current?.reabrirImportacao(importacaoId);
            }, 100);
          }}
        />
      )}

      {/* Modal Relatórios */}
      {showRelatorios && (
        <RelatoriosVendas
          onClose={() => setShowRelatorios(false)}
        />
      )}
    </div>
  );
};

export default VendasDashboard;
