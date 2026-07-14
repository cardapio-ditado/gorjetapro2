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
  DollarSign,
  Building2,
  Users,
  Package,
  CreditCard,
  Receipt,
  Target,
  Activity,
  Zap,
  AlertTriangle,
  CheckCircle,
  Clock
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { testConnection } from '../../lib/supabase';
import dayjs from 'dayjs';
import { ReportGenerator, exportToExcel } from '../../utils/reportGenerator';

interface FluxoCaixaData {
  data: string;
  entradas: number;
  saidas: number;
  saldo_diario: number;
  saldo_acumulado: number;
}

interface CategoriaData {
  categoria: string;
  valor: number;
  percentual: number;
  tipo: 'receita' | 'despesa';
  cor: string;
}

interface FornecedorData {
  fornecedor: string;
  total_compras: number;
  total_pago: number;
  saldo_pendente: number;
  ticket_medio: number;
  ultima_compra: string;
}

interface ContaBancariaData {
  banco: string;
  tipo_conta: string;
  saldo_inicial: number;
  entradas: number;
  saidas: number;
  saldo_final: number;
  movimentacoes: number;
}

interface IndicadoresFinanceiros {
  saldo_total: number;
  receitas_mes: number;
  despesas_mes: number;
  resultado_mes: number;
  contas_pagar_abertas: number;
  valor_contas_pagar: number;
  contas_receber_abertas: number;
  valor_contas_receber: number;
  margem_operacional: number;
}

const RelatoriosGerenciais: React.FC = () => {
  const [dreData, setDreData] = useState<DREData[]>([]);
  const [groupedDRE, setGroupedDRE] = useState<DREGroup[]>([]);
  const [fluxoCaixaData, setFluxoCaixaData] = useState<FluxoCaixaData[]>([]);
  const [contasPagarData, setContasPagarData] = useState<ContasPagarData[]>([]);
  const [contasReceberData, setContasReceberData] = useState<ContasReceberData[]>([]);
  const [fornecedorRanking, setFornecedorRanking] = useState<FornecedorRanking[]>([]);
  
  // Dados dos relatórios
  const [categoriasData, setCategorias] = useState<CategoriaData[]>([]);
  const [fornecedoresData, setFornecedores] = useState<FornecedorData[]>([]);
  const [contasBancariasData, setContasBancarias] = useState<ContaBancariaData[]>([]);
  const [indicadores, setIndicadores] = useState<IndicadoresFinanceiros | null>(null);
  const [centrosCusto, setCentrosCusto] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'fluxo_caixa' | 'categorias' | 'fornecedores' | 'contas_bancarias'>('fluxo_caixa');
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number | 'all'>('all');
  const [selectedCostCenter, setSelectedCostCenter] = useState<string | 'all'>('all');
  const [dataInicial, setDataInicial] = useState(dayjs().subtract(6, 'months').format('YYYY-MM-DD'));
  const [centroCusto, setCentroCusto] = useState('all');
  const [periodoInicial, setPeriodoInicial] = useState(dayjs().subtract(6, 'months').format('YYYY-MM-DD'));
  const [periodoFinal, setPeriodoFinal] = useState(dayjs().format('YYYY-MM-DD'));
  const [agrupamento, setAgrupamento] = useState<'diario' | 'semanal' | 'mensal'>('mensal');
  
  // Dados para filtros
  const COLORS = ['#7D1F2C', '#059669', '#dc2626', '#2563eb', '#7c3aed', '#ea580c', '#0891b2', '#be123c'];

  useEffect(() => {
    fetchCentrosCusto();
    fetchIndicadores();
    fetchRelatorios();
  }, []);

  useEffect(() => {
    fetchRelatorios();
  }, [activeTab, periodoInicial, periodoFinal, centroCusto, agrupamento]);

  const fetchCentrosCusto = async () => {
    try {
      const connectionOk = await testConnection();
      if (!connectionOk) {
        setCentrosCusto([]);
        return;
      }

      const { data, error } = await supabase
        .from('centros_custo')
        .select('id, nome')
        .eq('status', 'ativo')
        .order('nome');

      if (error) throw error;
      setCentrosCusto(data || []);
    } catch (err) {
      console.error('Error fetching cost centers:', err);
      setCentrosCusto([]);
    }
  };

  const fetchIndicadores = async () => {
    try {
      const connectionOk = await testConnection();
      if (!connectionOk) {
        setIndicadores(null);
        return;
      }

      // Calcular indicadores do mês atual
      const inicioMes = dayjs().startOf('month').format('YYYY-MM-DD');
      const fimMes = dayjs().endOf('month').format('YYYY-MM-DD');

      // Buscar dados do fluxo de caixa
      const { data: fluxoData, error: fluxoError } = await supabase
        .from('fluxo_caixa')
        .select('tipo, valor')
        .gte('data', inicioMes)
        .lte('data', fimMes);

      if (fluxoError) throw fluxoError;

      // Buscar contas a pagar
      const { data: contasPagarData, error: contasPagarError } = await supabase
        .from('contas_pagar')
        .select('valor_total, saldo_restante, status')
        .neq('status', 'cancelado');

      if (contasPagarError) throw contasPagarError;

      // Buscar contas a receber
      const { data: contasReceberData, error: contasReceberError } = await supabase
        .from('contas_receber')
        .select('valor_total, saldo_restante, status')
        .neq('status', 'cancelado');

      if (contasReceberError) throw contasReceberError;

      // Buscar saldos das contas bancárias
      const { data: contasBancarias, error: bancariasError } = await supabase
        .from('vw_bancos_contas_saldo')
        .select('saldo_atual')
        .eq('status', 'ativo');

      if (bancariasError) throw bancariasError;

      // Calcular indicadores
      const receitasMes = (fluxoData || []).filter(f => f.tipo === 'entrada').reduce((sum, f) => sum + (f.valor || 0), 0);
      const despesasMes = (fluxoData || []).filter(f => f.tipo === 'saida').reduce((sum, f) => sum + Math.abs(f.valor || 0), 0);
      const resultadoMes = receitasMes - despesasMes;
      const saldoTotal = (contasBancarias || []).reduce((sum, conta) => sum + (conta.saldo_atual || 0), 0);
      
      const contasPagarAbertas = (contasPagarData || []).filter(c => ['em_aberto', 'parcialmente_pago', 'vencido'].includes(c.status)).length;
      const valorContasPagar = (contasPagarData || []).filter(c => ['em_aberto', 'parcialmente_pago', 'vencido'].includes(c.status)).reduce((sum, c) => sum + (c.saldo_restante || 0), 0);
      
      const contasReceberAbertas = (contasReceberData || []).filter(c => ['em_aberto', 'parcialmente_recebido'].includes(c.status)).length;
      const valorContasReceber = (contasReceberData || []).filter(c => ['em_aberto', 'parcialmente_recebido'].includes(c.status)).reduce((sum, c) => sum + (c.saldo_restante || 0), 0);
      
      const margemOperacional = receitasMes > 0 ? (resultadoMes / receitasMes) * 100 : 0;

      setIndicadores({
        saldo_total: saldoTotal,
        receitas_mes: receitasMes,
        despesas_mes: despesasMes,
        resultado_mes: resultadoMes,
        contas_pagar_abertas: contasPagarAbertas,
        valor_contas_pagar: valorContasPagar,
        contas_receber_abertas: contasReceberAbertas,
        valor_contas_receber: valorContasReceber,
        margem_operacional: margemOperacional
      });

    } catch (err) {
      console.error('Error fetching indicators:', err);
      setIndicadores(null);
    }
  };

  const fetchRelatorios = async () => {
    try {
      setLoading(true);
      setError(null);

      const connectionOk = await testConnection();
      if (!connectionOk) {
        console.warn('Supabase not connected, using empty data');
        clearAllData();
        setLoading(false);
        return;
      }

      switch (activeTab) {
        case 'fluxo_caixa':
          await fetchFluxoCaixa();
          break;
        case 'categorias':
          await fetchCategorias();
          break;
        case 'fornecedores':
          await fetchFornecedores();
          break;
        case 'contas_bancarias':
          await fetchContasBancarias();
          break;
      }

    } catch (err) {
      console.error('Error fetching reports:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar relatórios');
      clearAllData();
    } finally {
      setLoading(false);
    }
  };

  const clearAllData = () => {
    setFluxoCaixaData([]);
    setCategorias([]);
    setFornecedores([]);
    setContasBancarias([]);
  };

  const fetchFluxoCaixa = async () => {
    try {
      let query = supabase
        .from('fluxo_caixa')
        .select('data, tipo, valor, centro_custo')
        .gte('data', periodoInicial)
        .lte('data', periodoFinal);

      if (centroCusto !== 'all') {
        query = query.eq('centro_custo', centrosCusto.find(c => c.id === centroCusto)?.nome);
      }

      const { data, error } = await query.order('data');

      if (error) throw error;

      // Processar dados por período
      const dadosPorPeriodo: { [key: string]: {
        entradas: number;
        saidas: number;
        saldo_diario: number;
      } } = {};

      let saldoAcumulado = 0;

      // Buscar saldo inicial das contas bancárias
      const { data: contasBancarias, error: bancariasError } = await supabase
        .from('vw_bancos_contas_saldo')
        .select('saldo_inicial, saldo_atual')
        .eq('status', 'ativo');

      if (!bancariasError && contasBancarias) {
        saldoAcumulado = contasBancarias.reduce((sum, conta) => {
          const saldoInicial = parseFloat(conta.saldo_inicial?.toString() || '0') || 0;
          return sum + saldoInicial;
        }, 0);
      }

      (data || []).forEach(mov => {
        let periodo = '';
        const dataFormatada = dayjs(mov.data);
        
        if (agrupamento === 'diario') {
          periodo = dataFormatada.format('DD/MM/YYYY');
        } else if (agrupamento === 'semanal') {
          periodo = `Sem ${dataFormatada.week()}/${dataFormatada.year()}`;
        } else {
          periodo = dataFormatada.format('MM/YYYY');
        }

        if (!dadosPorPeriodo[periodo]) {
          dadosPorPeriodo[periodo] = {
            entradas: 0,
            saidas: 0,
            saldo_diario: 0
          };
        }

        const valor = parseFloat(mov.valor?.toString() || '0') || 0;

        if (mov.tipo === 'entrada') {
          dadosPorPeriodo[periodo].entradas += valor;
          saldoAcumulado += valor;
        } else {
          dadosPorPeriodo[periodo].saidas += Math.abs(valor);
          saldoAcumulado -= Math.abs(valor);
        }

        dadosPorPeriodo[periodo].saldo_diario = saldoAcumulado;
      });

      // Converter para array
      const fluxoArray: FluxoCaixaData[] = Object.entries(dadosPorPeriodo)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([data, valores], index, array) => ({
          data,
          entradas: valores.entradas,
          saidas: valores.saidas,
          saldo_diario: valores.saldo_diario,
          saldo_acumulado: valores.saldo_diario
        }));

      setFluxoCaixaData(fluxoArray);
    } catch (err) {
      console.error('Error fetching cash flow:', err);
      setFluxoCaixaData([]);
    }
  };

  const fetchCategorias = async () => {
    try {
      // Buscar dados do fluxo de caixa com categorias
      let query = supabase
        .from('fluxo_caixa')
        .select(`
          tipo,
          valor,
          centro_custo,
          categoria_id
        `)
        .gte('data', periodoInicial)
        .lte('data', periodoFinal);

      if (centroCusto !== 'all') {
        query = query.eq('centro_custo', centrosCusto.find(c => c.id === centroCusto)?.nome);
      }

      const { data: fluxoData, error: fluxoError } = await query;

      if (fluxoError) throw fluxoError;

      // Buscar nomes das categorias
      const { data: categoriasNomes, error: categoriasError } = await supabase
        .from('categorias_financeiras')
        .select('id, nome, tipo');

      if (categoriasError) throw categoriasError;

      // Agrupar por centro de custo se não houver categorias específicas
      const categoriasPorTipo: { [key: string]: { valor: number; tipo: 'receita' | 'despesa' } } = {};

      (fluxoData || []).forEach(mov => {
        let nomeCategoria = 'Outros';
        let tipoCategoria: 'receita' | 'despesa' = mov.tipo === 'entrada' ? 'receita' : 'despesa';

        if (mov.categoria_id && categoriasNomes) {
          const categoria = categoriasNomes.find(c => c.id === mov.categoria_id);
          if (categoria) {
            nomeCategoria = categoria.nome;
            tipoCategoria = categoria.tipo;
          }
        } else if (mov.centro_custo) {
          nomeCategoria = mov.centro_custo;
        }

        const chave = `${nomeCategoria}_${tipoCategoria}`;

        if (!categoriasPorTipo[chave]) {
          categoriasPorTipo[chave] = { valor: 0, tipo: tipoCategoria };
        }

        categoriasPorTipo[chave].valor += Math.abs(parseFloat(mov.valor?.toString() || '0') || 0);
      });

      // Converter para array com percentuais
      const totalReceitas = Object.values(categoriasPorTipo)
        .filter(cat => cat.tipo === 'receita')
        .reduce((sum, cat) => sum + cat.valor, 0);
      
      const totalDespesas = Object.values(categoriasPorTipo)
        .filter(cat => cat.tipo === 'despesa')
        .reduce((sum, cat) => sum + cat.valor, 0);

      const categoriasArray: CategoriaData[] = Object.entries(categoriasPorTipo)
        .map(([chave, dados], index) => {
          const [categoria] = chave.split('_');
          const total = dados.tipo === 'receita' ? totalReceitas : totalDespesas;
          
          return {
            categoria,
            valor: dados.valor,
            percentual: total > 0 ? (dados.valor / total) * 100 : 0,
            tipo: dados.tipo,
            cor: COLORS[index % COLORS.length]
          };
        })
        .sort((a, b) => b.valor - a.valor);

      setCategorias(categoriasArray);
    } catch (err) {
      console.error('Error fetching categories:', err);
      setCategorias([]);
    }
  };

  const fetchFornecedores = async () => {
    try {
      // Buscar dados dos fornecedores
      const { data: fornecedoresNomes, error: fornecedoresError } = await supabase
        .from('fornecedores')
        .select('id, nome')
        .eq('status', 'ativo')
        .order('nome');

      if (fornecedoresError) throw fornecedoresError;

      // Buscar contas a pagar por fornecedor
      const { data: contasPagar, error: contasError } = await supabase
        .from('contas_pagar')
        .select('fornecedor_id, valor_total, valor_pago, saldo_restante, data_emissao')
        .gte('data_emissao', periodoInicial)
        .lte('data_emissao', periodoFinal);

      if (contasError) throw contasError;

      // Processar dados por fornecedor
      const fornecedoresPorId: { [key: string]: {
        nome: string;
        total_compras: number;
        total_pago: number;
        saldo_pendente: number;
        count_compras: number;
        ultima_compra: string;
      } } = {};

      // Inicializar com todos os fornecedores
      (fornecedoresNomes || []).forEach(fornecedor => {
        fornecedoresPorId[fornecedor.id] = {
          nome: fornecedor.nome,
          total_compras: 0,
          total_pago: 0,
          saldo_pendente: 0,
          count_compras: 0,
          ultima_compra: ''
        };
      });

      // Processar contas a pagar
      (contasPagar || []).forEach(conta => {
        if (fornecedoresPorId[conta.fornecedor_id]) {
          const fornecedor = fornecedoresPorId[conta.fornecedor_id];
          fornecedor.total_compras += conta.valor_total || 0;
          fornecedor.total_pago += conta.valor_pago || 0;
          fornecedor.saldo_pendente += conta.saldo_restante || 0;
          fornecedor.count_compras += 1;
          
          if (!fornecedor.ultima_compra || conta.data_emissao > fornecedor.ultima_compra) {
            fornecedor.ultima_compra = conta.data_emissao;
          }
        }
      });

      // Converter para array e filtrar apenas fornecedores com movimentação
      const fornecedoresArray: FornecedorData[] = Object.values(fornecedoresPorId)
        .filter(f => f.total_compras > 0)
        .map(f => ({
          fornecedor: f.nome,
          total_compras: f.total_compras,
          total_pago: f.total_pago,
          saldo_pendente: f.saldo_pendente,
          ticket_medio: f.count_compras > 0 ? f.total_compras / f.count_compras : 0,
          ultima_compra: f.ultima_compra
        }))
        .sort((a, b) => b.total_compras - a.total_compras)
        .slice(0, 10); // Top 10

      setFornecedores(fornecedoresArray);
    } catch (err) {
      console.error('Error fetching suppliers:', err);
      setFornecedores([]);
    }
  };

  const fetchContasBancarias = async () => {
    try {
      // Buscar contas bancárias
      const { data: contas, error: contasError } = await supabase
        .from('vw_bancos_contas_saldo')
        .select('*')
        .eq('status', 'ativo')
        .order('banco');

      if (contasError) throw contasError;

      // Buscar movimentações por conta
      const { data: fluxoData, error: fluxoError } = await supabase
        .from('fluxo_caixa')
        .select('conta_bancaria_id, tipo, valor')
        .gte('data', periodoInicial)
        .lte('data', periodoFinal)
        .not('conta_bancaria_id', 'is', null);

      if (fluxoError) throw fluxoError;

      // Processar dados das contas
      const contasProcessadas: ContaBancariaData[] = (contas || []).map(conta => {
        const movimentacoesConta = (fluxoData || []).filter(m => m.conta_bancaria_id === conta.id);
        
        const entradas = movimentacoesConta
          .filter(m => m.tipo === 'entrada')
          .reduce((sum, m) => sum + (parseFloat(m.valor?.toString() || '0') || 0), 0);
        
        const saidas = movimentacoesConta
          .filter(m => m.tipo === 'saida')
          .reduce((sum, m) => sum + Math.abs(parseFloat(m.valor?.toString() || '0') || 0), 0);

        const saldoInicial = parseFloat(conta.saldo_inicial?.toString() || '0') || 0;
        const saldoFinal = saldoInicial + entradas - saidas;

        return {
          banco: conta.banco,
          tipo_conta: conta.tipo_conta || 'corrente',
          saldo_inicial: saldoInicial,
          entradas,
          saidas,
          saldo_final: saldoFinal,
          movimentacoes: movimentacoesConta.length
        };
      });

      setContasBancarias(contasProcessadas);
    } catch (err) {
      console.error('Error fetching bank accounts:', err);
      setContasBancarias([]);
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
    try {
      if (activeTab === 'fluxo_caixa' && fluxoCaixaData.length > 0) {
        const reportGenerator = new ReportGenerator({
          title: 'Relatório de Fluxo de Caixa',
          subtitle: `Período: ${dayjs(periodoInicial).format('DD/MM/YYYY')} a ${dayjs(periodoFinal).format('DD/MM/YYYY')}`,
          filename: `fluxo-caixa-${dayjs().format('YYYY-MM-DD')}.pdf`
        });

        let currentY = reportGenerator.addHeader(
          'Relatório de Fluxo de Caixa',
          `Período: ${dayjs(periodoInicial).format('DD/MM/YYYY')} a ${dayjs(periodoFinal).format('DD/MM/YYYY')}`
        );

        // Resumo executivo
        if (indicadores) {
          const resumo = [
            ['Total de Receitas', formatCurrency(indicadores.receitas_mes)],
            ['Total de Despesas', formatCurrency(indicadores.despesas_mes)],
            ['Resultado do Período', formatCurrency(indicadores.resultado_mes)],
            ['Margem Operacional', formatPercentage(indicadores.margem_operacional)],
            ['Saldo Total em Contas', formatCurrency(indicadores.saldo_total)]
          ];

          currentY = reportGenerator.addSection('Resumo Executivo', [], currentY);
          currentY = reportGenerator.addTable(['Indicador', 'Valor'], resumo, currentY);
        }

        // Dados detalhados do fluxo
        const headers = ['Período', 'Entradas', 'Saídas', 'Resultado', 'Saldo Acumulado'];
        const data = fluxoCaixaData.map(item => [
          item.data,
          formatCurrency(item.entradas),
          formatCurrency(item.saidas),
          formatCurrency(item.entradas - item.saidas),
          formatCurrency(item.saldo_acumulado)
        ]);

        currentY = reportGenerator.addSection('Fluxo de Caixa Detalhado', [], currentY + 10);
        reportGenerator.addTable(headers, data, currentY);

        reportGenerator.save(`fluxo-caixa-${dayjs().format('YYYY-MM-DD')}.pdf`);

      } else if (activeTab === 'fornecedores' && fornecedoresData.length > 0) {
        exportarRelatorioFornecedores();
      } else {
        alert('Não há dados para exportar');
      }
    } catch (err) {
      console.error('Error exporting report:', err);
      setError('Erro ao exportar relatório');
    }
  };

  const exportarRelatorioFornecedores = () => {
    const headers = [
      'Fornecedor',
      'Total Compras',
      'Total Pago',
      'Saldo Pendente',
      'Ticket Médio',
      'Última Compra'
    ];

    const data = fornecedoresData.map(f => [
      f.fornecedor,
      f.total_compras,
      f.total_pago,
      f.saldo_pendente,
      f.ticket_medio,
      f.ultima_compra ? dayjs(f.ultima_compra).format('DD/MM/YYYY') : ''
    ]);

    const fileName = `ranking-fornecedores-${dayjs().format('YYYY-MM-DD')}`;
    exportToExcel(data, fileName, headers);
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
      case 'fluxo_caixa':
        return (
          <div className="space-y-6">
            {fluxoCaixaData.length > 0 ? (
              <>
                {/* Gráfico de Fluxo de Caixa */}
                <div className="bg-white/5 p-6 rounded-lg">
                  <h4 className="text-lg font-medium text-white mb-4">
                    Evolução do Fluxo de Caixa
                  </h4>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={fluxoCaixaData}>
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
                          dataKey="entradas" 
                          stackId="1"
                          stroke="#059669" 
                          fill="#059669" 
                          fillOpacity={0.6}
                          name="Entradas"
                        />
                        <Area 
                          type="monotone" 
                          dataKey="saidas" 
                          stackId="2"
                          stroke="#dc2626" 
                          fill="#dc2626" 
                          fillOpacity={0.6}
                          name="Saídas"
                        />
                        <Line 
                          type="monotone" 
                          dataKey="saldo_acumulado" 
                          stroke="#7D1F2C" 
                          strokeWidth={3}
                          name="Saldo Acumulado"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Tabela detalhada */}
                <div className="bg-[#12141f] rounded-lg shadow-sm border border-white/10">
                  <div className="p-6">
                    <h4 className="text-lg font-medium text-white mb-4">
                      Fluxo de Caixa Detalhado
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left bg-white/5 border-b border-white/10">
                            <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Período</th>
                            <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Entradas</th>
                            <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Saídas</th>
                            <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Resultado</th>
                            <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Saldo Acumulado</th>
                          </tr>
                        </thead>
                        <tbody className="bg-transparent divide-y divide-white/10">
                          {fluxoCaixaData.map((item, index) => {
                            const resultado = item.entradas - item.saidas;
                            return (
                              <tr key={index} className="hover:bg-white/5">
                                <td className="px-4 py-3 font-medium text-white">{item.data}</td>
                                <td className="px-4 py-3 font-medium text-green-400">
                                  {formatCurrency(item.entradas)}
                                </td>
                                <td className="px-4 py-3 font-medium text-red-400">
                                  {formatCurrency(item.saidas)}
                                </td>
                                <td className={`px-4 py-3 font-medium ${
                                  resultado >= 0 ? 'text-green-400' : 'text-red-400'
                                }`}>
                                  {formatCurrency(resultado)}
                                </td>
                                <td className={`px-4 py-3 font-bold ${
                                  item.saldo_acumulado >= 0 ? 'text-blue-400' : 'text-red-400'
                                }`}>
                                  {formatCurrency(item.saldo_acumulado)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-12">
                <BarChart3 className="w-16 h-16 text-white/30 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Nenhum dado encontrado</h3>
                <p className="text-white/50">
                  Não há dados de fluxo de caixa para o período selecionado.
                </p>
              </div>
            )}
          </div>
        );

      case 'categorias':
        return (
          <div className="space-y-6">
            {categoriasData.length > 0 ? (
              <>
                {/* Gráficos de Receitas e Despesas */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white/5 p-6 rounded-lg">
                    <h4 className="text-lg font-medium text-white mb-4">
                      Distribuição de Receitas
                    </h4>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoriasData.filter(c => c.tipo === 'receita')}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="valor"
                          >
                            {categoriasData.filter(c => c.tipo === 'receita').map((entry, index) => (
                              <Cell key={`cell-receita-${index}`} fill={entry.cor} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => formatCurrency(value)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white/5 p-6 rounded-lg">
                    <h4 className="text-lg font-medium text-white mb-4">
                      Distribuição de Despesas
                    </h4>
                    <div className="h-64">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={categoriasData.filter(c => c.tipo === 'despesa')}
                            cx="50%"
                            cy="50%"
                            innerRadius={40}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="valor"
                          >
                            {categoriasData.filter(c => c.tipo === 'despesa').map((entry, index) => (
                              <Cell key={`cell-despesa-${index}`} fill={entry.cor} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(value: number) => formatCurrency(value)} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>

                {/* Tabela de Categorias */}
                <div className="bg-[#12141f] rounded-lg shadow-sm border border-white/10">
                  <div className="p-6">
                    <h4 className="text-lg font-medium text-white mb-4">
                      Análise por Categoria
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left bg-white/5 border-b border-white/10">
                            <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Categoria</th>
                            <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Tipo</th>
                            <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Valor</th>
                            <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Percentual</th>
                          </tr>
                        </thead>
                        <tbody className="bg-transparent divide-y divide-white/10">
                          {categoriasData.map((categoria, index) => (
                            <tr key={index} className="hover:bg-white/5">
                              <td className="px-4 py-3 font-medium text-white">{categoria.categoria}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                  categoria.tipo === 'receita' ? 'text-green-300 bg-green-900/30' : 'text-red-300 bg-red-900/30'
                                }`}>
                                  {categoria.tipo === 'receita' ? 'Receita' : 'Despesa'}
                                </span>
                              </td>
                              <td className={`px-4 py-3 font-medium ${
                                categoria.tipo === 'receita' ? 'text-green-400' : 'text-red-400'
                              }`}>
                                {formatCurrency(categoria.valor)}
                              </td>
                              <td className="px-4 py-3 font-medium text-blue-400">
                                {formatPercentage(categoria.percentual)}
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
                <Target className="w-16 h-16 text-white/30 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Nenhum dado encontrado</h3>
                <p className="text-white/50">
                  Não há dados de categorias para o período selecionado.
                </p>
              </div>
            )}
          </div>
        );

      case 'fornecedores':
        return (
          <div className="space-y-6">
            {fornecedoresData.length > 0 ? (
              <div className="bg-[#12141f] rounded-lg shadow-sm border border-white/10">
                <div className="p-6">
                  <h4 className="text-lg font-medium text-white mb-4">
                    Ranking de Fornecedores por Volume de Compras
                  </h4>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left bg-white/5 border-b border-white/10">
                          <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Pos.</th>
                          <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Fornecedor</th>
                          <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Total Compras</th>
                          <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Total Pago</th>
                          <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Saldo Pendente</th>
                          <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Ticket Médio</th>
                          <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Última Compra</th>
                          <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">% Pago</th>
                        </tr>
                      </thead>
                      <tbody className="bg-transparent divide-y divide-white/10">
                        {fornecedoresData.map((fornecedor, index) => {
                          const percentualPago = fornecedor.total_compras > 0 
                            ? (fornecedor.total_pago / fornecedor.total_compras) * 100
                            : 0;
                          
                          return (
                            <tr key={index} className="hover:bg-white/5">
                              <td className="px-4 py-3 whitespace-nowrap">
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold text-white ${
                                  index === 0 ? 'bg-yellow-500/100' : 
                                  index === 1 ? 'bg-gray-400' : 
                                  index === 2 ? 'bg-orange-600' : 'bg-gray-300'
                                }`}>
                                  {index + 1}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-medium text-white">{fornecedor.fornecedor}</td>
                              <td className="px-4 py-3 font-medium text-white">
                                {formatCurrency(fornecedor.total_compras)}
                              </td>
                              <td className="px-4 py-3 font-medium text-green-400">
                                {formatCurrency(fornecedor.total_pago)}
                              </td>
                              <td className="px-4 py-3 font-medium text-red-400">
                                {formatCurrency(fornecedor.saldo_pendente)}
                              </td>
                              <td className="px-4 py-3 font-medium text-blue-400">
                                {formatCurrency(fornecedor.ticket_medio)}
                              </td>
                              <td className="px-4 py-3 text-white">
                                {fornecedor.ultima_compra ? dayjs(fornecedor.ultima_compra).format('DD/MM/YYYY') : '-'}
                              </td>
                              <td className="px-4 py-3">
                                <div className={`text-sm font-medium ${
                                  percentualPago >= 90 ? 'text-green-400' :
                                  percentualPago >= 50 ? 'text-yellow-400' : 'text-red-400'
                                }`}>
                                  {formatPercentage(percentualPago)}
                                </div>
                                <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                                  <div 
                                    className={`h-1.5 rounded-full ${
                                      percentualPago >= 90 ? 'bg-green-500/100' :
                                      percentualPago >= 50 ? 'bg-yellow-500/100' : 'bg-red-500/100'
                                    }`}
                                    style={{ width: `${Math.min(percentualPago, 100)}%` }}
                                  ></div>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center py-12">
                <Building2 className="w-16 h-16 text-white/30 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Nenhum fornecedor encontrado</h3>
                <p className="text-white/50">
                  Não há dados de fornecedores para o período selecionado.
                </p>
              </div>
            )}
          </div>
        );

      case 'contas_bancarias':
        return (
          <div className="space-y-6">
            {contasBancariasData.length > 0 ? (
              <>
                {/* Gráfico de Saldos */}
                <div className="bg-white/5 p-6 rounded-lg">
                  <h4 className="text-lg font-medium text-white mb-4">
                    Saldos das Contas Bancárias
                  </h4>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={contasBancariasData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="banco" />
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
                        <Bar dataKey="saldo_inicial" fill="#94a3b8" name="Saldo Inicial" />
                        <Bar dataKey="entradas" fill="#059669" name="Entradas" />
                        <Bar dataKey="saidas" fill="#dc2626" name="Saídas" />
                        <Bar dataKey="saldo_final" fill="#7D1F2C" name="Saldo Final" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>

                {/* Tabela detalhada */}
                <div className="bg-[#12141f] rounded-lg shadow-sm border border-white/10">
                  <div className="p-6">
                    <h4 className="text-lg font-medium text-white mb-4">
                      Movimentação das Contas Bancárias
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead>
                          <tr className="text-left bg-white/5 border-b border-white/10">
                            <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Banco/Conta</th>
                            <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Tipo</th>
                            <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Sld. Inicial</th>
                            <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Entradas</th>
                            <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Saídas</th>
                            <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Sld. Final</th>
                            <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Movs.</th>
                          </tr>
                        </thead>
                        <tbody className="bg-transparent divide-y divide-white/10">
                          {contasBancariasData.map((conta, index) => (
                            <tr key={index} className="hover:bg-white/5">
                              <td className="px-4 py-3 font-medium text-white">{conta.banco}</td>
                              <td className="px-4 py-3">
                                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                                  conta.tipo_conta === 'cofre' ? 'text-orange-300 bg-orange-900/30' : 'text-blue-300 bg-blue-900/30'
                                }`}>
                                  {conta.tipo_conta === 'corrente' ? 'Corrente' :
                                   conta.tipo_conta === 'poupanca' ? 'Poupança' :
                                   conta.tipo_conta === 'investimento' ? 'Investimento' :
                                   conta.tipo_conta === 'cofre' ? 'Cofre' : conta.tipo_conta}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-medium text-white">
                                {formatCurrency(conta.saldo_inicial)}
                              </td>
                              <td className="px-4 py-3 font-medium text-green-400">
                                {formatCurrency(conta.entradas)}
                              </td>
                              <td className="px-4 py-3 font-medium text-red-400">
                                {formatCurrency(conta.saidas)}
                              </td>
                              <td className={`px-4 py-3 font-bold ${
                                conta.saldo_final >= 0 ? 'text-green-400' : 'text-red-400'
                              }`}>
                                {formatCurrency(conta.saldo_final)}
                              </td>
                              <td className="px-4 py-3 text-white">
                                {conta.movimentacoes}
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
                <CreditCard className="w-16 h-16 text-white/30 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Nenhuma conta encontrada</h3>
                <p className="text-white/50">
                  Não há contas bancárias cadastradas ou com movimentação.
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
        <h3 className="text-lg font-medium text-white">Relatórios Gerenciais</h3>
        <button
          onClick={exportarRelatorio}
          className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25]"
        >
          <Download className="w-4 h-4 inline mr-2" />
          Exportar Relatório
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 text-red-300 rounded-lg">
          {error}
        </div>
      )}

      {/* Indicadores Gerais */}
      {indicadores && (
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div className="bg-[#12141f] p-6 rounded-lg shadow-sm border border-white/10">
            <div className="flex items-center">
              <DollarSign className={`w-8 h-8 mr-3 ${
                indicadores.saldo_total >= 0 ? 'text-green-400' : 'text-red-400'
              }`} />
              <div>
                <p className="text-sm font-medium text-white/50">Saldo Total</p>
                <p className={`text-2xl font-bold ${
                  indicadores.saldo_total >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {formatCurrency(indicadores.saldo_total)}
                </p>
                <p className="text-sm text-white/70">Contas bancárias</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg shadow-sm border border-white/10">
            <div className="flex items-center">
              <TrendingUp className="w-8 h-8 text-green-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Receitas do Mês</p>
                <p className="text-2xl font-bold text-green-400">
                  {formatCurrency(indicadores.receitas_mes)}
                </p>
                <p className="text-sm text-white/70">
                  Margem: {formatPercentage(indicadores.margem_operacional)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg shadow-sm border border-white/10">
            <div className="flex items-center">
              <TrendingDown className="w-8 h-8 text-red-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Despesas do Mês</p>
                <p className="text-2xl font-bold text-red-400">
                  {formatCurrency(indicadores.despesas_mes)}
                </p>
                <p className="text-sm text-white/70">Gasto total</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg shadow-sm border border-white/10">
            <div className="flex items-center">
              <CreditCard className="w-8 h-8 text-orange-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Contas a Pagar</p>
                <p className="text-2xl font-bold text-orange-400">
                  {indicadores.contas_pagar_abertas}
                </p>
                <p className="text-sm text-white/70">
                  {formatCurrency(indicadores.valor_contas_pagar)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg shadow-sm border border-white/10">
            <div className="flex items-center">
              <Receipt className="w-8 h-8 text-blue-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Contas a Receber</p>
                <p className="text-2xl font-bold text-blue-400">
                  {indicadores.contas_receber_abertas}
                </p>
                <p className="text-sm text-white/70">
                  {formatCurrency(indicadores.valor_contas_receber)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-[#12141f] p-4 rounded-lg shadow-sm border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Período Inicial
            </label>
            <input
              type="date"
              value={periodoInicial}
              onChange={(e) => setPeriodoInicial(e.target.value)}
              className="w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
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
              className="w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Agrupamento
            </label>
            <select
              value={agrupamento}
              onChange={(e) => setAgrupamento(e.target.value as any)}
              className="w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            >
              <option value="diario">Diário</option>
              <option value="semanal">Semanal</option>
              <option value="mensal">Mensal</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Centro de Custo
            </label>
            <select
              value={centroCusto}
              onChange={(e) => setCentroCusto(e.target.value)}
              className="w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            >
              <option value="all">Todos os Centros</option>
              {centrosCusto.map(centro => (
                <option key={centro.id} value={centro.id}>
                  {centro.nome}
                </option>
              ))}
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

      {/* Tabs */}
      <div className="bg-[#12141f] rounded-lg shadow-sm border border-white/10">
        <div className="border-b border-white/10">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('fluxo_caixa')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'fluxo_caixa'
                  ? 'border-[#7D1F2C] text-[#7D1F2C]'
                  : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/20'
              }`}
            >
              <BarChart3 className="w-5 h-5 inline mr-2" />
              Fluxo de Caixa
            </button>
            <button
              onClick={() => setActiveTab('categorias')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'categorias'
                  ? 'border-[#7D1F2C] text-[#7D1F2C]'
                  : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/20'
              }`}
            >
              <Target className="w-5 h-5 inline mr-2" />
              Por Categoria
            </button>
            <button
              onClick={() => setActiveTab('fornecedores')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'fornecedores'
                  ? 'border-[#7D1F2C] text-[#7D1F2C]'
                  : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/20'
              }`}
            >
              <Building2 className="w-5 h-5 inline mr-2" />
              Ranking Fornecedores
            </button>
            <button
              onClick={() => setActiveTab('contas_bancarias')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'contas_bancarias'
                  ? 'border-[#7D1F2C] text-[#7D1F2C]'
                  : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/20'
              }`}
            >
              <CreditCard className="w-5 h-5 inline mr-2" />
              Contas Bancárias
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

export default RelatoriosGerenciais;