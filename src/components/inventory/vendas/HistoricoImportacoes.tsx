import React, { useState, useEffect, useCallback } from 'react';
import {
  History, Search, Calendar, Package, CheckCircle, AlertCircle,
  Clock, ArrowLeft, Eye, Trash2, FileText, TrendingUp, AlertTriangle, FolderOpen,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import dayjs from '../../../lib/dayjs';

interface ImportacaoVenda {
  id: string;
  arquivo_nome: string;
  arquivo_tamanho?: number;
  criado_em: string;
  processado_em?: string;
  total_linhas: number;
  total_processadas: number;
  total_sucesso: number;
  total_erro: number;
  status: string;
  observacoes?: string;
  estoque?: { nome: string };
}

interface Props {
  onClose: () => void;
  onViewDetails?: (importacaoId: string) => void;
  onReabrir?: (importacaoId: string) => void;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  processada:       { label: 'Processada',   color: 'bg-green-500/15 text-green-300 border-green-500/30',  icon: CheckCircle },
  pendente:         { label: 'Pendente',     color: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30', icon: Clock },
  erro:             { label: 'Erro',         color: 'bg-red-500/15 text-red-300 border-red-500/30',       icon: AlertCircle },
  em_processamento: { label: 'Processando',  color: 'bg-blue-500/15 text-blue-300 border-blue-500/30',    icon: Clock },
};

function formatBytes(bytes?: number) {
  if (!bytes) return '—';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

const ITENS_POR_PAGINA = 20;

const HistoricoImportacoes: React.FC<Props> = ({ onClose, onViewDetails, onReabrir }) => {
  const [importacoes, setImportacoes]       = useState<ImportacaoVenda[]>([]);
  const [loading, setLoading]               = useState(true);
  const [searchTerm, setSearchTerm]         = useState('');
  const [filtroStatus, setFiltroStatus]     = useState('all');
  const [periodo, setPeriodo]               = useState<'week' | 'month' | 'quarter' | 'year' | 'all'>('month');
  const [paginaAtual, setPaginaAtual]       = useState(1);
  const [totalPaginas, setTotalPaginas]     = useState(1);

  const fetchImportacoes = useCallback(async () => {
    setLoading(true);
    try {
      const dataInicio: Record<string, string> = {
        week:    dayjs().subtract(7, 'days').format('YYYY-MM-DD'),
        month:   dayjs().subtract(30, 'days').format('YYYY-MM-DD'),
        quarter: dayjs().subtract(90, 'days').format('YYYY-MM-DD'),
        year:    dayjs().subtract(365, 'days').format('YYYY-MM-DD'),
        all:     '2020-01-01',
      };

      let query = supabase
        .from('importacoes_vendas')
        .select('*, estoque:estoques(nome)', { count: 'exact' })
        .gte('criado_em', dataInicio[periodo])
        .order('criado_em', { ascending: false });

      if (filtroStatus !== 'all') query = query.eq('status', filtroStatus);

      const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
      query = query.range(inicio, inicio + ITENS_POR_PAGINA - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      setImportacoes(data || []);
      setTotalPaginas(Math.ceil((count || 0) / ITENS_POR_PAGINA));
    } catch (err) {
      console.error('Erro ao buscar importações:', err);
    } finally {
      setLoading(false);
    }
  }, [filtroStatus, periodo, paginaAtual]);

  useEffect(() => { fetchImportacoes(); }, [fetchImportacoes]);

  // Reset página ao mudar filtros
  useEffect(() => { setPaginaAtual(1); }, [filtroStatus, periodo, searchTerm]);

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja excluir esta importação? Esta ação não pode ser desfeita.')) return;
    try {
      const { error } = await supabase.from('importacoes_vendas').delete().eq('id', id);
      if (error) throw error;
      fetchImportacoes();
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir importação');
    }
  };

  const importacoesFiltradas = importacoes.filter(imp =>
    imp.arquivo_nome.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const StatusBadge = ({ status }: { status: string }) => {
    const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pendente;
    const Icon = cfg.icon;
    return (
      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.color}`}>
        <Icon className="w-3 h-3 mr-1.5" /> {cfg.label}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0d0f1a] border border-white/10 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-700 to-blue-800 px-6 py-5">
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
              <ArrowLeft className="w-5 h-5 text-white" />
            </button>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <History className="w-6 h-6" /> Histórico de Importações
              </h2>
              <p className="text-blue-200 text-sm mt-0.5">Gerencie todas as importações de vendas</p>
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="px-6 py-4 border-b border-white/10 flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 w-4 h-4" />
            <input type="text" placeholder="Buscar por nome do arquivo..."
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 border border-white/20 bg-white/5 text-white rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 focus:outline-none text-sm" />
          </div>
          <select value={periodo} onChange={e => setPeriodo(e.target.value as any)}
            className="px-4 py-2.5 border border-white/20 bg-white/5 text-white rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm">
            <option value="week">Última semana</option>
            <option value="month">Último mês</option>
            <option value="quarter">Último trimestre</option>
            <option value="year">Último ano</option>
            <option value="all">Todo período</option>
          </select>
          <select value={filtroStatus} onChange={e => setFiltroStatus(e.target.value)}
            className="px-4 py-2.5 border border-white/20 bg-white/5 text-white rounded-xl focus:ring-2 focus:ring-blue-500 focus:outline-none text-sm">
            <option value="all">Todos os status</option>
            <option value="processada">Processada</option>
            <option value="pendente">Pendente</option>
            <option value="erro">Erro</option>
            <option value="em_processamento">Em processamento</option>
          </select>
        </div>

        {/* Lista */}
        <div className="flex-1 overflow-y-auto divide-y divide-white/5">
          {loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="w-10 h-10 border-b-2 border-blue-500 rounded-full animate-spin" />
            </div>
          ) : importacoesFiltradas.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 gap-3">
              <History className="w-12 h-12 text-white/20" />
              <p className="text-white/40">Nenhuma importação encontrada</p>
            </div>
          ) : importacoesFiltradas.map(imp => {
            const taxaSucesso = imp.total_linhas > 0 ? (imp.total_sucesso / imp.total_linhas) * 100 : 0;
            return (
              <div key={imp.id} className="px-6 py-5 hover:bg-white/5 transition-colors">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <FileText className="w-4 h-4 text-white/30 shrink-0" />
                      <h4 className="font-semibold text-white text-sm truncate">{imp.arquivo_nome}</h4>
                      <StatusBadge status={imp.status || 'pendente'} />
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
                      <div>
                        <p className="text-xs text-white/40 mb-0.5">Importado em</p>
                        <p className="text-sm text-white flex items-center gap-1">
                          <Calendar className="w-3.5 h-3.5 text-white/30" />
                          {dayjs(imp.criado_em).format('DD/MM/YYYY HH:mm')}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-white/40 mb-0.5">Total de itens</p>
                        <p className="text-sm text-white flex items-center gap-1">
                          <Package className="w-3.5 h-3.5 text-white/30" />
                          {imp.total_linhas || 0}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-white/40 mb-0.5">Taxa de sucesso</p>
                        <p className={`text-sm font-medium flex items-center gap-1 ${
                          taxaSucesso >= 80 ? 'text-green-400' : taxaSucesso >= 50 ? 'text-yellow-400' : 'text-red-400'
                        }`}>
                          <TrendingUp className="w-3.5 h-3.5" />
                          {taxaSucesso.toFixed(1)}%
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-white/40 mb-0.5">Tamanho</p>
                        <p className="text-sm text-white">{formatBytes(imp.arquivo_tamanho)}</p>
                      </div>
                    </div>

                    {/* Barra de progresso */}
                    {imp.total_linhas > 0 && (
                      <div className="mb-2">
                        <div className="flex justify-between text-xs text-white/40 mb-1">
                          <span>Progresso</span>
                          <span>{imp.total_processadas || 0} / {imp.total_linhas}</span>
                        </div>
                        <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all"
                            style={{ width: `${((imp.total_processadas || 0) / imp.total_linhas) * 100}%` }} />
                        </div>
                        <div className="flex gap-4 mt-1.5 text-xs">
                          {imp.total_sucesso > 0 && (
                            <span className="flex items-center gap-1 text-green-400">
                              <CheckCircle className="w-3 h-3" /> {imp.total_sucesso} sucesso
                            </span>
                          )}
                          {imp.total_erro > 0 && (
                            <span className="flex items-center gap-1 text-red-400">
                              <AlertCircle className="w-3 h-3" /> {imp.total_erro} erros
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {imp.observacoes && (
                      <div className="mt-2 p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
                        <p className="text-sm text-yellow-300 flex items-start gap-2">
                          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                          {imp.observacoes}
                        </p>
                      </div>
                    )}
                  </div>

                  {/* Ações */}
                  <div className="flex flex-col gap-2 shrink-0">
                    {(imp.status === 'pendente' || imp.status === 'revisao') && onReabrir && (
                      <button onClick={() => onReabrir(imp.id)}
                        className="p-2 text-green-400 hover:bg-green-500/10 rounded-xl transition-colors" title="Reabrir">
                        <FolderOpen className="w-5 h-5" />
                      </button>
                    )}
                    {onViewDetails && (
                      <button onClick={() => onViewDetails(imp.id)}
                        className="p-2 text-blue-400 hover:bg-blue-500/10 rounded-xl transition-colors" title="Ver detalhes">
                        <Eye className="w-5 h-5" />
                      </button>
                    )}
                    <button onClick={() => handleDelete(imp.id)}
                      className="p-2 text-red-400 hover:bg-red-500/10 rounded-xl transition-colors" title="Excluir">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Paginação + footer */}
        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
          {totalPaginas > 1 ? (
            <>
              <p className="text-sm text-white/40">Página {paginaAtual} de {totalPaginas}</p>
              <div className="flex gap-2">
                <button onClick={() => setPaginaAtual(p => Math.max(1, p - 1))} disabled={paginaAtual === 1}
                  className="px-4 py-2 border border-white/20 bg-white/5 text-white/80 rounded-xl text-sm font-medium hover:bg-white/10 disabled:opacity-40 transition-colors">
                  Anterior
                </button>
                <button onClick={() => setPaginaAtual(p => Math.min(totalPaginas, p + 1))} disabled={paginaAtual === totalPaginas}
                  className="px-4 py-2 border border-white/20 bg-white/5 text-white/80 rounded-xl text-sm font-medium hover:bg-white/10 disabled:opacity-40 transition-colors">
                  Próxima
                </button>
              </div>
            </>
          ) : (
            <div className="flex-1" />
          )}
          <button onClick={onClose}
            className="ml-4 px-5 py-2 border border-white/20 text-white/70 rounded-xl text-sm font-medium hover:bg-white/5 transition-colors">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default HistoricoImportacoes;