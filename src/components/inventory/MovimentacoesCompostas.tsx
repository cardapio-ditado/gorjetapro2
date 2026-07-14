import React, { useState, useEffect } from 'react';
import { Search, Filter, Package, TrendingDown, Calendar, User, FileText, Eye, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';

interface MovimentacaoComposta {
  id: string;
  tipo: string;
  referencia_id: string;
  referencia_tipo: string;
  descricao: string;
  criado_em: string;
  total_itens?: number;
}

interface ItemMovimentacao {
  id: string;
  tipo_item: string;
  movimentacao: {
    quantidade: number;
    tipo: string;
    item: {
      nome: string;
      unidade_medida: string;
      codigo?: string;
    };
  };
}

const MovimentacoesCompostas: React.FC = () => {
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoComposta[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState<string>('all');
  const [selectedMovimentacao, setSelectedMovimentacao] = useState<string | null>(null);
  const [itensDetalhes, setItensDetalhes] = useState<ItemMovimentacao[]>([]);
  const [loadingDetalhes, setLoadingDetalhes] = useState(false);

  useEffect(() => {
    fetchMovimentacoes();
  }, [tipoFilter]);

  const fetchMovimentacoes = async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase
        .from('movimentacoes_compostas')
        .select('*, movimentacoes_compostas_itens(count)')
        .order('criado_em', { ascending: false })
        .limit(100);

      if (tipoFilter !== 'all') {
        query = query.eq('tipo', tipoFilter);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;

      const movimentacoesComContagem = (data || []).map(mov => ({
        ...mov,
        total_itens: mov.movimentacoes_compostas_itens?.[0]?.count || 0
      }));

      setMovimentacoes(movimentacoesComContagem);
    } catch (err) {
      console.error('Erro ao buscar movimentações compostas:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar movimentações');
    } finally {
      setLoading(false);
    }
  };

  const fetchDetalhesMovimentacao = async (movimentacaoId: string) => {
    try {
      setLoadingDetalhes(true);

      const { data, error: fetchError } = await supabase
        .from('movimentacoes_compostas_itens')
        .select(`
          id,
          tipo_item,
          movimentacao:movimentacoes_estoque (
            quantidade,
            tipo,
            item:itens_estoque (
              nome,
              unidade_medida,
              codigo
            )
          )
        `)
        .eq('composta_id', movimentacaoId);

      if (fetchError) throw fetchError;

      setItensDetalhes(data || []);
    } catch (err) {
      console.error('Erro ao buscar detalhes:', err);
    } finally {
      setLoadingDetalhes(false);
    }
  };

  const handleVerDetalhes = (movimentacaoId: string) => {
    setSelectedMovimentacao(movimentacaoId);
    fetchDetalhesMovimentacao(movimentacaoId);
  };

  const filteredMovimentacoes = movimentacoes.filter(mov =>
    mov.descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    mov.tipo.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'venda':
        return <TrendingDown className="w-5 h-5 text-green-400" />;
      case 'producao':
        return <Package className="w-5 h-5 text-blue-400" />;
      default:
        return <FileText className="w-5 h-5 text-white/50" />;
    }
  };

  const getTipoBadge = (tipo: string) => {
    const classes = {
      venda: 'bg-green-500/15 text-green-300',
      producao: 'bg-blue-500/15 text-blue-300',
      transferencia: 'bg-purple-500/15 text-purple-300',
      ajuste: 'bg-yellow-500/15 text-yellow-300'
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${classes[tipo] || 'bg-white/10 text-white/90'}`}>
        {tipo.toUpperCase()}
      </span>
    );
  };

  const getTipoItemBadge = (tipoItem: string) => {
    const classes = {
      produto_principal: 'bg-indigo-500/15 text-indigo-300',
      insumo: 'bg-orange-500/15 text-orange-300',
      subproduto: 'bg-cyan-100 text-cyan-800',
      desperdicio: 'bg-red-500/15 text-red-300'
    };

    const labels = {
      produto_principal: 'Produto',
      insumo: 'Insumo',
      subproduto: 'Subproduto',
      desperdicio: 'Desperdício'
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${classes[tipoItem] || 'bg-white/10 text-white/90'}`}>
        {labels[tipoItem] || tipoItem}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-bold text-white">Movimentações Compostas</h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/30 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar por descrição ou tipo..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-10 w-full rounded-lg border-white/20 shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
          />
        </div>

        <div>
          <select
            value={tipoFilter}
            onChange={(e) => setTipoFilter(e.target.value)}
            className="w-full rounded-lg border-white/20 shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
          >
            <option value="all">Todos os tipos</option>
            <option value="venda">Vendas</option>
            <option value="producao">Produção</option>
            <option value="transferencia">Transferências</option>
            <option value="ajuste">Ajustes</option>
          </select>
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <p className="text-sm text-red-400">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]"></div>
        </div>
      ) : filteredMovimentacoes.length === 0 ? (
        <div className="text-center py-12 bg-white/5 rounded-lg border-2 border-dashed border-white/20">
          <Package className="w-12 h-12 text-white/30 mx-auto mb-4" />
          <p className="text-white/40">Nenhuma movimentação composta encontrada</p>
        </div>
      ) : (
        <div className="bg-[#12141f] rounded-lg shadow overflow-hidden border border-white/10">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-white/10">
              <thead className="bg-white/5">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                    Descrição
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                    Itens
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                    Data
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-white/40 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-[#12141f] divide-y divide-white/5">
                {filteredMovimentacoes.map((mov) => (
                  <tr key={mov.id} className="hover:bg-white/10/5">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-3">
                        {getTipoIcon(mov.tipo)}
                        {getTipoBadge(mov.tipo)}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-white">{mov.descricao}</div>
                      {mov.referencia_tipo && (
                        <div className="text-xs text-white/40">Ref: {mov.referencia_tipo}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-medium text-white">{mov.total_itens} itens</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-2 text-sm text-white/40">
                        <Calendar className="w-4 h-4" />
                        {dayjs(mov.criado_em).format('DD/MM/YYYY HH:mm')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right">
                      <button
                        onClick={() => handleVerDetalhes(mov.id)}
                        className="inline-flex items-center gap-2 px-3 py-1 text-sm text-blue-400 hover:bg-blue-500/10 rounded-lg"
                      >
                        <Eye className="w-4 h-4" />
                        Ver Detalhes
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selectedMovimentacao && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1020] rounded-lg w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col border border-white/10">
            <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center">
              <h3 className="text-lg font-medium text-white">Detalhes da Movimentação</h3>
              <button
                onClick={() => setSelectedMovimentacao(null)}
                className="p-2 text-white/30 hover:text-white/50 rounded-lg hover:bg-white/10/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              {loadingDetalhes ? (
                <div className="flex justify-center items-center py-12">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#7D1F2C]"></div>
                </div>
              ) : itensDetalhes.length === 0 ? (
                <p className="text-center text-white/40 py-8">Nenhum item encontrado</p>
              ) : (
                <div className="space-y-3">
                  {itensDetalhes.map((item) => (
                    <div key={item.id} className="border rounded-lg p-4 bg-white/5">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <div className="font-medium text-white">
                            {item.movimentacao.item.nome}
                          </div>
                          {item.movimentacao.item.codigo && (
                            <div className="text-xs text-white/40">
                              Código: {item.movimentacao.item.codigo}
                            </div>
                          )}
                        </div>
                        {getTipoItemBadge(item.tipo_item)}
                      </div>
                      <div className="flex items-center gap-4 text-sm">
                        <span className="text-white/50">
                          Quantidade: <span className="font-medium text-white">{item.movimentacao.quantidade}</span> {item.movimentacao.item.unidade_medida}
                        </span>
                        <span className={`px-2 py-1 text-xs rounded-full ${item.movimentacao.tipo === 'saida' ? 'bg-red-500/15 text-red-300' : 'bg-green-500/15 text-green-300'}`}>
                          {item.movimentacao.tipo === 'saida' ? 'SAÍDA' : 'ENTRADA'}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t bg-white/5 flex justify-end">
              <button
                onClick={() => setSelectedMovimentacao(null)}
                className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default MovimentacoesCompostas;
