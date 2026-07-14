import React, { useState, useEffect } from 'react';
import { 
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  AreaChart,
  Area
} from 'recharts';
import { 
  Calendar,
  Download,
  Filter,
  TrendingUp,
  TrendingDown,
  BarChart3,
  FileText,
  Package,
  DollarSign,
  Activity,
  AlertTriangle,
  CheckCircle,
  Factory,
  ShoppingCart,
  ArrowLeftRight,
  Target,
  Zap
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import dayjs from 'dayjs';
import { ReportGenerator, exportToExcel } from '../../utils/reportGenerator';

interface MovimentacaoData {
  data: string;
  entradas: number;
  saidas: number;
  transferencias: number;
  ajustes: number;
  valor_entradas: number;
  valor_saidas: number;
}

interface CMVData {
  periodo: string;
  custo_mercadoria_vendida: number;
  receita_vendas: number;
  margem_bruta: number;
  percentual_cmv: number;
}

interface EstoqueValorData {
  estoque_nome: string;
  valor_total: number;
  quantidade_itens: number;
  percentual_valor: number;
}

interface ItemMaisMovimentado {
  item_nome: string;
  item_codigo?: string;
  total_movimentacoes: number;
  quantidade_total: number;
  valor_total: number;
  tipo_item: string;
}

interface IndicadoresRelatorio {
  valor_total_estoque: number;
  movimentacoes_periodo: number;
  cmv_periodo: number;
  margem_bruta_periodo: number;
  itens_criticos: number;
  giro_estoque: number;
}

const RelatoriosEstoque: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'movimentacoes' | 'cmv' | 'valor' | 'giro'>('movimentacoes');
  
  // Dados dos relatórios
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoData[]>([]);
  const [cmvData, setCmvData] = useState<CMVData[]>([]);
  const [estoqueValor, setEstoqueValor] = useState<EstoqueValorData[]>([]);
  const [itensMaisMovimentados, setItensMaisMovimentados] = useState<ItemMaisMovimentado[]>([]);
  const [indicadores, setIndicadores] = useState<IndicadoresRelatorio | null>(null);
  
  // Filtros
  const [periodoInicial, setPeriodoInicial] = useState(dayjs().subtract(3, 'month').format('YYYY-MM-DD'));
  const [periodoFinal, setPeriodoFinal] = useState(dayjs().format('YYYY-MM-DD'));
  const [estoqueFilter, setEstoqueFilter] = useState('all');
  const [tipoItemFilter, setTipoItemFilter] = useState('all');
  const [agrupamento, setAgrupamento] = useState<'diario' | 'semanal' | 'mensal'>('mensal');
  
  // Dados para filtros
  const [estoques, setEstoques] = useState<any[]>([]);

  const COLORS = ['#7D1F2C', '#D4AF37', '#2563eb', '#059669', '#dc2626', '#7c3aed', '#ea580c', '#0891b2'];

  useEffect(() => {
    fetchEstoques();
  }, []);

  useEffect(() => {
    fetchRelatorios();
  }, [activeTab, periodoInicial, periodoFinal, estoqueFilter, tipoItemFilter, agrupamento]);

  const fetchEstoques = async () => {
    try {
      const { data, error } = await supabase
        .from('estoques')
        .select('id, nome')
        .eq('status', true)
        .order('nome');

      if (error) throw error;
      setEstoques(data || []);
    } catch (err) {
      console.error('Error fetching stocks:', err);
    }
  };

  const fetchRelatorios = async () => {
    try {
      setLoading(true);
      setError(null);

      switch (activeTab) {
        case 'movimentacoes':
          await fetchMovimentacoes();
          break;
        case 'cmv':
          await fetchCMV();
          break;
        case 'valor':
          await fetchEstoqueValor();
          break;
        case 'giro':
          await fetchGiroEstoque();
          break;
      }

      await fetchIndicadores();
    } catch (err) {
      console.error('Error fetching reports:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar relatórios');
    } finally {
      setLoading(false);
    }
  };

  const fetchMovimentacoes = async () => {
    try {
      let query = supabase
        .from('movimentacoes_estoque')
        .select('data_movimentacao, tipo_movimentacao, quantidade, custo_total, estoque_origem_id, estoque_destino_id')
        .gte('data_movimentacao', periodoInicial)
        .lte('data_movimentacao', periodoFinal);

      if (estoqueFilter !== 'all') {
        query = query.or(`estoque_origem_id.eq.${estoqueFilter},estoque_destino_id.eq.${estoqueFilter}`);
      }

      const { data, error } = await query.order('data_movimentacao');

      if (error) throw error;

      // Processar dados por período
      const movimentacoesPorPeriodo: { [key: string]: {
        entradas: number;
        saidas: number;
        transferencias: number;
        ajustes: number;
        valor_entradas: number;
        valor_saidas: number;
      } } = {};

      (data || []).forEach(mov => {
        let periodo = '';
        const data = dayjs(mov.data_movimentacao);
        
        if (agrupamento === 'diario') {
          periodo = data.format('DD/MM/YYYY');
        } else if (agrupamento === 'semanal') {
          periodo = `Sem ${data.week()}/${data.year()}`;
        } else {
          periodo = data.format('MM/YYYY');
        }

        if (!movimentacoesPorPeriodo[periodo]) {
          movimentacoesPorPeriodo[periodo] = {
            entradas: 0,
            saidas: 0,
            transferencias: 0,
            ajustes: 0,
            valor_entradas: 0,
            valor_saidas: 0
          };
        }

        const valor = Math.abs(mov.custo_total || 0);

        switch (mov.tipo_movimentacao) {
          case 'entrada':
            movimentacoesPorPeriodo[periodo].entradas += 1;
            movimentacoesPorPeriodo[periodo].valor_entradas += valor;
            break;
          case 'saida':
            movimentacoesPorPeriodo[periodo].saidas += 1;
            movimentacoesPorPeriodo[periodo].valor_saidas += valor;
            break;
          case 'transferencia':
            movimentacoesPorPeriodo[periodo].transferencias += 1;
            break;
          case 'ajuste':
            movimentacoesPorPeriodo[periodo].ajustes += 1;
            break;
        }
      });

      // Converter para array
      const movimentacoesArray: MovimentacaoData[] = Object.entries(movimentacoesPorPeriodo)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([data, valores]) => ({
          data,
          ...valores
        }));

      setMovimentacoes(movimentacoesArray);
    } catch (err) {
      console.error('Error fetching movements:', err);
      setMovimentacoes([]);
    }
  };

  const fetchCMV = async () => {
    try {
      // Buscar saídas de estoque (vendas) por período
      let query = supabase
        .from('movimentacoes_estoque')
        .select('data_movimentacao, custo_total, motivo')
        .eq('tipo_movimentacao', 'saida')
        .gte('data_movimentacao', periodoInicial)
        .lte('data_movimentacao', periodoFinal);

      if (estoqueFilter !== 'all') {
        query = query.eq('estoque_origem_id', estoqueFilter);
      }

      const { data, error } = await query.order('data_movimentacao');

      if (error) throw error;

      // Processar CMV por período
      const cmvPorPeriodo: { [key: string]: { cmv: number; receita: number } } = {};

      (data || []).forEach(mov => {
        const data = dayjs(mov.data_movimentacao);
        let periodo = '';
        
        if (agrupamento === 'diario') {
          periodo = data.format('DD/MM/YYYY');
        } else if (agrupamento === 'semanal') {
          periodo = `Sem ${data.week()}/${data.year()}`;
        } else {
          periodo = data.format('MM/YYYY');
        }

        if (!cmvPorPeriodo[periodo]) {
          cmvPorPeriodo[periodo] = { cmv: 0, receita: 0 };
        }

        cmvPorPeriodo[periodo].cmv += Math.abs(mov.custo_total || 0);
        
        // Simular receita (assumindo margem de 200% sobre o custo)
        cmvPorPeriodo[periodo].receita += Math.abs(mov.custo_total || 0) * 3;
      });

      // Converter para array
      const cmvArray: CMVData[] = Object.entries(cmvPorPeriodo)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([periodo, valores]) => {
          const margemBruta = valores.receita - valores.cmv;
          const percentualCMV = valores.receita > 0 ? (valores.cmv / valores.receita) * 100 : 0;
          
          return {
            periodo,
            custo_mercadoria_vendida: valores.cmv,
            receita_vendas: valores.receita,
            margem_bruta: margemBruta,
            percentual_cmv: percentualCMV
          };
        });

      setCmvData(cmvArray);
    } catch (err) {
      console.error('Error fetching CMV:', err);
      setCmvData([]);
    }
  };

  const fetchEstoqueValor = async () => {
    try {
      let query = supabase.from('vw_estoque_atual').select('*');

      if (estoqueFilter !== 'all') {
        // Filtrar por estoque específico se necessário
      }

      if (tipoItemFilter !== 'all') {
        query = query.eq('tipo_item', tipoItemFilter);
      }

      const { data, error } = await query;

      if (error) throw error;

      // Agrupar por estoque
      const valorPorEstoque: { [key: string]: { valor_total: number; quantidade_itens: number } } = {};
      let valorTotalGeral = 0;

      (data || []).forEach(item => {
        const estoqueNome = item.estoque_nome || 'Estoque não identificado';
        
        if (!valorPorEstoque[estoqueNome]) {
          valorPorEstoque[estoqueNome] = { valor_total: 0, quantidade_itens: 0 };
        }

        valorPorEstoque[estoqueNome].valor_total += item.valor_total || 0;
        valorPorEstoque[estoqueNome].quantidade_itens += 1;
        valorTotalGeral += item.valor_total || 0;
      });

      // Converter para array com percentuais
      const estoqueArray: EstoqueValorData[] = Object.entries(valorPorEstoque)
        .map(([estoque_nome, dados]) => ({
          estoque_nome,
          valor_total: dados.valor_total,
          quantidade_itens: dados.quantidade_itens,
          percentual_valor: valorTotalGeral > 0 ? (dados.valor_total / valorTotalGeral) * 100 : 0
        }))
        .sort((a, b) => b.valor_total - a.valor_total);

      setEstoqueValor(estoqueArray);
    } catch (err) {
      console.error('Error fetching stock value:', err);
      setEstoqueValor([]);
    }
  };

  const fetchGiroEstoque = async () => {
    try {
      // Buscar itens mais movimentados
      const { data, error } = await supabase
        .from('movimentacoes_estoque')
        .select(`
          item_id,
          quantidade,
          custo_total,
          itens_estoque!inner(nome, codigo, tipo_item)
        `)
        .gte('data_movimentacao', periodoInicial)
        .lte('data_movimentacao', periodoFinal);

      if (error) throw error;

      // Agrupar por item
      const itensPorMovimentacao: { [key: string]: {
        item_nome: string;
        item_codigo?: string;
        tipo_item: string;
        total_movimentacoes: number;
        quantidade_total: number;
        valor_total: number;
      } } = {};

      (data || []).forEach(mov => {
        const itemId = mov.item_id;
        const itemNome = mov.itens_estoque.nome;
        const itemCodigo = mov.itens_estoque.codigo;
        const tipoItem = mov.itens_estoque.tipo_item;

        if (!itensPorMovimentacao[itemId]) {
          itensPorMovimentacao[itemId] = {
            item_nome: itemNome,
            item_codigo: itemCodigo,
            tipo_item: tipoItem,
            total_movimentacoes: 0,
            quantidade_total: 0,
            valor_total: 0
          };
        }

        itensPorMovimentacao[itemId].total_movimentacoes += 1;
        itensPorMovimentacao[itemId].quantidade_total += Math.abs(mov.quantidade || 0);
        itensPorMovimentacao[itemId].valor_total += Math.abs(mov.custo_total || 0);
      });

      // Converter para array e ordenar
      const itensArray: ItemMaisMovimentado[] = Object.values(itensPorMovimentacao)
        .sort((a, b) => b.total_movimentacoes - a.total_movimentacoes)
        .slice(0, 10);

      setItensMaisMovimentados(itensArray);
    } catch (err) {
      console.error('Error fetching stock turnover:', err);
      setItensMaisMovimentados([]);
    }
  };

  const fetchIndicadores = async () => {
    try {
      // Buscar valor total do estoque
      const { data: estoqueData, error: estoqueError } = await supabase
        .from('vw_estoque_atual')
        .select('valor_total, abaixo_minimo');

      if (estoqueError) throw estoqueError;

      const valorTotalEstoque = (estoqueData || []).reduce((sum, item) => sum + (item.valor_total || 0), 0);
      const itensCriticos = (estoqueData || []).filter(item => item.abaixo_minimo).length;

      // Buscar movimentações do período
      const { data: movData, error: movError } = await supabase
        .from('movimentacoes_estoque')
        .select('custo_total')
        .gte('data_movimentacao', periodoInicial)
        .lte('data_movimentacao', periodoFinal);

      if (movError) throw movError;

      const movimentacoesPeriodo = (movData || []).length;

      // Calcular CMV do período (saídas)
      const { data: saidasData, error: saidasError } = await supabase
        .from('movimentacoes_estoque')
        .select('custo_total')
        .eq('tipo_movimentacao', 'saida')
        .gte('data_movimentacao', periodoInicial)
        .lte('data_movimentacao', periodoFinal);

      if (saidasError) throw saidasError;

      const cmvPeriodo = (saidasData || []).reduce((sum, s) => sum + Math.abs(s.custo_total || 0), 0);
      const receitaEstimada = cmvPeriodo * 3; // Assumindo margem de 200%
      const margemBruta = receitaEstimada - cmvPeriodo;

      // Calcular giro do estoque (CMV / Estoque Médio)
      const giroEstoque = valorTotalEstoque > 0 ? cmvPeriodo / valorTotalEstoque : 0;

      setIndicadores({
        valor_total_estoque: valorTotalEstoque,
        movimentacoes_periodo: movimentacoesPeriodo,
        cmv_periodo: cmvPeriodo,
        margem_bruta_periodo: margemBruta,
        itens_criticos: itensCriticos,
        giro_estoque: giroEstoque
      });

    } catch (err) {
      console.error('Error fetching indicators:', err);
      setIndicadores(null);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const formatPercentage = (value: number) => {
    return `${value.toFixed(1)}%`;
  };

  const exportarRelatorio = () => {
    console.log('Exportar relatório de estoque');
  };

  const renderTabContent = () => {
    if (loading) {
      return (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]"></div>
        </div>
      );
    }

    switch (activeTab) {
      case 'movimentacoes':
        return (
          <div className="space-y-6">
            {movimentacoes.length > 0 ? (
              <>
                {/* Gráfico de Movimentações */}
                <div className="bg-white/5 p-6 rounded-lg">
                  <h4 className="text-lg font-medium text-white mb-4">
                    Movimentações por Período
                  </h4>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={movimentacoes}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="data" />
                        <YAxis />
                        <Tooltip 
                          contentStyle={{
                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                            border: 'none',
                            borderRadius: '8px',
                            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                          }}
                        />
                        <Legend />
                        <Bar dataKey="entradas" fill="#059669" name="Entradas" />
                        <Bar dataKey="saidas" fill="#dc2626" name="Saídas" />
                        <Bar dataKey="transferencias" fill="#2563eb" name="Transferências" />
                        <Bar dataKey="ajustes" fill="#7c3aed" name="Ajustes" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Gráfico de Valores */}
                <div className="bg-white/5 p-6 rounded-lg">
                  <h4 className="text-lg font-medium text-white mb-4">
                    Valores Movimentados
                  </h4>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={movimentacoes}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="data" />
                        <YAxis tickFormatter={(value) => formatCurrency(value)} />
                        <Tooltip 
                          formatter={(value: number) => formatCurrency(value)}
                          contentStyle={{
                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                            border: 'none',
                            borderRadius: '8px',
                            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                          }}
                        />
                        <Legend />
                        <Area 
                          type="monotone" 
                          dataKey="valor_entradas" 
                          stackId="1"
                          stroke="#059669" 
                          fill="#059669" 
                          fillOpacity={0.6}
                          name="Valor Entradas"
                        />
                        <Area 
                          type="monotone" 
                          dataKey="valor_saidas" 
                          stackId="2"
                          stroke="#dc2626" 
                          fill="#dc2626" 
                          fillOpacity={0.6}
                          name="Valor Saídas"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <Activity className="w-16 h-16 text-white/30 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Nenhuma movimentação encontrada</h3>
                <p className="text-white/40">
                  Não há movimentações de estoque para o período selecionado.
                </p>
              </div>
            )}
          </div>
        );

      case 'cmv':
        return (
          <div className="space-y-6">
            {cmvData.length > 0 ? (
              <>
                {/* Gráfico de CMV */}
                <div className="bg-white/5 p-6 rounded-lg">
                  <h4 className="text-lg font-medium text-white mb-4">
                    Custo da Mercadoria Vendida (CMV)
                  </h4>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={cmvData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="periodo" />
                        <YAxis tickFormatter={(value) => formatCurrency(value)} />
                        <Tooltip 
                          formatter={(value: number, name: string) => 
                            name === 'percentual_cmv' ? formatPercentage(value) : formatCurrency(value)
                          }
                          contentStyle={{
                            backgroundColor: 'rgba(255, 255, 255, 0.95)',
                            border: 'none',
                            borderRadius: '8px',
                            boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                          }}
                        />
                        <Legend />
                        <Bar dataKey="receita_vendas" fill="#059669" name="Receita de Vendas" />
                        <Bar dataKey="custo_mercadoria_vendida" fill="#dc2626" name="CMV" />
                        <Bar dataKey="margem_bruta" fill="#7D1F2C" name="Margem Bruta" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Tabela de CMV */}
                <div className="bg-[#12141f] rounded-lg border border-white/10">
                  <div className="p-6">
                    <h4 className="text-lg font-medium text-white mb-4">
                      Análise Detalhada do CMV
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left bg-white/5 border-b">
                            <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Período</th>
                            <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Receita</th>
                            <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">CMV</th>
                            <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Margem Bruta</th>
                            <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">% CMV</th>
                          </tr>
                        </thead>
                        <tbody className="bg-[#12141f] divide-y divide-white/5">
                          {cmvData.map((item, index) => (
                            <tr key={index} className="hover:bg-white/10/5">
                              <td className="px-4 py-3 font-medium text-white">{item.periodo}</td>
                              <td className="px-4 py-3 font-medium text-green-600">
                                {formatCurrency(item.receita_vendas)}
                              </td>
                              <td className="px-4 py-3 font-medium text-red-600">
                                {formatCurrency(item.custo_mercadoria_vendida)}
                              </td>
                              <td className="px-4 py-3 font-medium text-blue-600">
                                {formatCurrency(item.margem_bruta)}
                              </td>
                              <td className="px-4 py-3 font-medium text-white">
                                {formatPercentage(item.percentual_cmv)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <DollarSign className="w-16 h-16 text-white/30 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Nenhum dado de CMV encontrado</h3>
                <p className="text-white/40">
                  Não há saídas de estoque (vendas) para calcular o CMV no período selecionado.
                </p>
              </div>
            )}
          </div>
        );

      case 'valor':
        return (
          <div className="space-y-6">
            {estoqueValor.length > 0 ? (
              <>
                {/* Gráfico de Distribuição de Valor */}
                <div className="bg-white/5 p-6 rounded-lg">
                  <h4 className="text-lg font-medium text-white mb-4">
                    Distribuição de Valor por Estoque
                  </h4>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={estoqueValor}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={120}
                          paddingAngle={5}
                          dataKey="valor_total"
                        >
                          {estoqueValor.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-4">
                    {estoqueValor.map((item, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div 
                            className="w-3 h-3 rounded-full" 
                            style={{ backgroundColor: COLORS[index % COLORS.length] }}
                          ></div>
                          <span className="text-sm text-white/50">{item.estoque_nome}</span>
                        </div>
                        <div className="text-right">
                          <span className="text-sm font-medium text-white">
                            {formatCurrency(item.valor_total)}
                          </span>
                          <div className="text-xs text-white/40">
                            {formatPercentage(item.percentual_valor)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tabela de Valores */}
                <div className="bg-[#12141f] rounded-lg border border-white/10">
                  <div className="p-6">
                    <h4 className="text-lg font-medium text-white mb-4">
                      Análise de Valor por Estoque
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left bg-white/5 border-b">
                            <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Estoque</th>
                            <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Qtd Itens</th>
                            <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Valor Total</th>
                            <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">% do Total</th>
                            <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Valor Médio/Item</th>
                          </tr>
                        </thead>
                        <tbody className="bg-[#12141f] divide-y divide-white/5">
                          {estoqueValor.map((item, index) => (
                            <tr key={index} className="hover:bg-white/10/5">
                              <td className="px-4 py-3 font-medium text-white">{item.estoque_nome}</td>
                              <td className="px-4 py-3 text-white">{item.quantidade_itens}</td>
                              <td className="px-4 py-3 font-medium text-white">
                                {formatCurrency(item.valor_total)}
                              </td>
                              <td className="px-4 py-3 font-medium text-blue-600">
                                {formatPercentage(item.percentual_valor)}
                              </td>
                              <td className="px-4 py-3 text-white">
                                {formatCurrency(item.quantidade_itens > 0 ? item.valor_total / item.quantidade_itens : 0)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <Package className="w-16 h-16 text-white/30 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Nenhum dado de valor encontrado</h3>
                <p className="text-white/40">
                  Não há itens em estoque para análise de valor.
                </p>
              </div>
            )}
          </div>
        );

      case 'giro':
        return (
          <div className="space-y-6">
            {itensMaisMovimentados.length > 0 ? (
              <div className="bg-[#12141f] rounded-lg border border-white/10">
                <div className="p-6">
                  <h4 className="text-lg font-medium text-white mb-4">
                    Top 10 Itens Mais Movimentados
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left bg-white/5 border-b">
                          <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Pos.</th>
                          <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Item</th>
                          <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Tipo</th>
                          <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Movimentações</th>
                          <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Quantidade Total</th>
                          <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Valor Total</th>
                        </tr>
                      </thead>
                      <tbody className="bg-[#12141f] divide-y divide-white/5">
                        {itensMaisMovimentados.map((item, index) => (
                          <tr key={index} className="hover:bg-white/10/5">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white ${
                                index === 0 ? 'bg-yellow-500' : 
                                index === 1 ? 'bg-gray-400' : 
                                index === 2 ? 'bg-orange-600' : 'bg-gray-300'
                              }`}>
                                {index + 1}
                              </span>
                            </td>
                            <td className="px-4 py-3">
                              <div>
                                <div className="font-medium text-white">{item.item_nome}</div>
                                {item.item_codigo && (
                                  <div className="text-sm text-white/40">Código: {item.item_codigo}</div>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                item.tipo_item === 'insumo' ? 'text-blue-300 bg-blue-900/30' : 'text-green-300 bg-green-900/30'
                              }`}>
                                {item.tipo_item === 'insumo' ? 'Insumo' : 'Produto Final'}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="font-medium text-white">{item.total_movimentacoes}</span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="font-medium text-white">{item.quantidade_total.toFixed(3)}</span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="font-medium text-white">
                                {formatCurrency(item.valor_total)}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <Target className="w-16 h-16 text-white/30 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Nenhum dado de giro encontrado</h3>
                <p className="text-white/40">
                  Não há movimentações suficientes para análise de giro de estoque.
                </p>
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-white">Relatórios de Estoque</h3>
        <button
          onClick={exportarRelatorio}
          className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25]"
        >
          <Download className="w-4 h-4 inline mr-2" />
          Exportar Relatório
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 text-red-300 rounded-lg border border-red-500/30">
          {error}
        </div>
      )}

      {/* Filtros */}
      <div className="bg-[#12141f] p-4 rounded-lg border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Período Inicial
            </label>
            <input
              type="date"
              value={periodoInicial}
              onChange={(e) => setPeriodoInicial(e.target.value)}
              className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Período Final
            </label>
            <input
              type="date"
              value={periodoFinal}
              onChange={(e) => setPeriodoFinal(e.target.value)}
              className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Agrupamento
            </label>
            <select
              value={agrupamento}
              onChange={(e) => setAgrupamento(e.target.value as any)}
              className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            >
              <option value="diario">Diário</option>
              <option value="semanal">Semanal</option>
              <option value="mensal">Mensal</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Estoque
            </label>
            <select
              value={estoqueFilter}
              onChange={(e) => setEstoqueFilter(e.target.value)}
              className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            >
              <option value="all">Todos os Estoques</option>
              {estoques.map((estoque) => (
                <option key={estoque.id} value={estoque.id}>
                  {estoque.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Tipo de Item
            </label>
            <select
              value={tipoItemFilter}
              onChange={(e) => setTipoItemFilter(e.target.value)}
              className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            >
              <option value="all">Todos os Tipos</option>
              <option value="insumo">Insumos</option>
              <option value="produto_final">Produtos Finais</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={fetchRelatorios}
              className="w-full px-4 py-2 bg-[#7D1F2C] text-white rounded-md hover:bg-[#6a1a25]"
            >
              <Filter className="w-4 h-4 inline mr-2" />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      {/* Indicadores */}
      {indicadores && (
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <Package className="w-8 h-8 text-blue-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Valor Total</p>
                <p className="text-2xl font-bold text-blue-600">
                  {formatCurrency(indicadores.valor_total_estoque)}
                </p>
                <p className="text-sm text-white/50">Em estoque</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <Activity className="w-8 h-8 text-purple-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Movimentações</p>
                <p className="text-2xl font-bold text-purple-600">
                  {indicadores.movimentacoes_periodo}
                </p>
                <p className="text-sm text-white/50">No período</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <DollarSign className="w-8 h-8 text-red-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">CMV</p>
                <p className="text-2xl font-bold text-red-600">
                  {formatCurrency(indicadores.cmv_periodo)}
                </p>
                <p className="text-sm text-white/50">No período</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <TrendingUp className="w-8 h-8 text-green-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Margem Bruta</p>
                <p className="text-2xl font-bold text-green-600">
                  {formatCurrency(indicadores.margem_bruta_periodo)}
                </p>
                <p className="text-sm text-white/50">No período</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <AlertTriangle className="w-8 h-8 text-orange-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Itens Críticos</p>
                <p className="text-2xl font-bold text-orange-600">
                  {indicadores.itens_criticos}
                </p>
                <p className="text-sm text-white/50">Abaixo do mínimo</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <Target className="w-8 h-8 text-teal-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Giro do Estoque</p>
                <p className="text-2xl font-bold text-teal-600">
                  {indicadores.giro_estoque.toFixed(2)}x
                </p>
                <p className="text-sm text-white/50">No período</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-[#12141f] rounded-lg border border-white/10">
        <div className="border-b border-white/10">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('movimentacoes')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'movimentacoes'
                  ? 'border-[#7D1F2C] text-[#7D1F2C]'
                  : 'border-transparent text-white/40 hover:text-white/80 hover:border-white/20'
              }`}
            >
              <Activity className="w-5 h-5 inline mr-2" />
              Movimentações
            </button>
            <button
              onClick={() => setActiveTab('cmv')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'cmv'
                  ? 'border-[#7D1F2C] text-[#7D1F2C]'
                  : 'border-transparent text-white/40 hover:text-white/80 hover:border-white/20'
              }`}
            >
              <DollarSign className="w-5 h-5 inline mr-2" />
              CMV
            </button>
            <button
              onClick={() => setActiveTab('valor')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'valor'
                  ? 'border-[#7D1F2C] text-[#7D1F2C]'
                  : 'border-transparent text-white/40 hover:text-white/80 hover:border-white/20'
              }`}
            >
              <Package className="w-5 h-5 inline mr-2" />
              Valor por Estoque
            </button>
            <button
              onClick={() => setActiveTab('giro')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'giro'
                  ? 'border-[#7D1F2C] text-[#7D1F2C]'
                  : 'border-transparent text-white/40 hover:text-white/80 hover:border-white/20'
              }`}
            >
              <Target className="w-5 h-5 inline mr-2" />
              Giro de Estoque
            </button>
          </nav>
        </div>

        <div className="p-6">
          {renderTabContent()}
        </div>
      </div>
    </div>
  );
};

export default RelatoriosEstoque;