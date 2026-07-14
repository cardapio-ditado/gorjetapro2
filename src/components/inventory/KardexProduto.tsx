import React, { useState, useEffect } from 'react';
import {
  ArrowLeft,
  Search,
  Filter,
  Download,
  Calendar,
  Package,
  DollarSign,
  AlertTriangle,
  CheckCircle,
  FileText,
  BarChart3,
  TrendingUp,
  TrendingDown,
  Activity,
  ArrowUp,
  ArrowDown,
  ArrowLeftRight,
  RotateCcw,
  Warehouse,
  Eye,
  AlertCircle,
  Info
} from 'lucide-react';
import { 
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { supabase } from '../../lib/supabase';
import { ReportGenerator, exportToExcel } from '../../utils/reportGenerator';
import dayjs from 'dayjs';
import { buscarAlertasNegativos, buscarAuditoriaItem } from '../../services/movimentacoesService';

interface ItemEstoque {
  id: string;
  codigo?: string;
  nome: string;
  descricao?: string;
  tipo_item: string;
  categoria: string;
  unidade_medida: string;
  custo_medio: number;
  status: string;
}

interface MovimentacaoKardex {
  id: string;
  data_movimentacao: string;
  tipo_movimentacao: 'entrada' | 'saida' | 'transferencia' | 'ajuste';
  quantidade: number;
  custo_unitario: number;
  custo_total: number;
  saldo_quantidade: number;
  saldo_valor: number;
  custo_medio_ponderado: number;
  motivo?: string;
  observacoes?: string;
  estoque_origem_nome?: string;
  estoque_destino_nome?: string;
  criado_em: string;
}

interface SaldoEstoque {
  estoque_id: string;
  estoque_nome: string;
  quantidade_atual: number;
  valor_total: number;
  custo_medio_atual: number;
  data_ultima_movimentacao?: string;
}

interface IndicadoresProduto {
  quantidade_total: number;
  valor_total: number;
  custo_medio_geral: number;
  total_movimentacoes: number;
  entradas_periodo: number;
  saidas_periodo: number;
  giro_periodo: number;
  estoques_com_saldo: number;
  ultima_entrada?: string;
  ultima_saida?: string;
}

interface MovimentacaoGrafico {
  data: string;
  entrada: number;
  saida: number;
  saldo: number;
  custo_medio: number;
}

const KardexProduto: React.FC = () => {
  const [itensEstoque, setItensEstoque] = useState<ItemEstoque[]>([]);
  const [itemSelecionado, setItemSelecionado] = useState<ItemEstoque | null>(null);
  const [movimentacoes, setMovimentacoes] = useState<MovimentacaoKardex[]>([]);
  const [saldosEstoque, setSaldosEstoque] = useState<SaldoEstoque[]>([]);
  const [indicadores, setIndicadores] = useState<IndicadoresProduto | null>(null);
  const [dadosGrafico, setDadosGrafico] = useState<MovimentacaoGrafico[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [dataInicial, setDataInicial] = useState(dayjs().subtract(3, 'month').format('YYYY-MM-DD'));
  const [dataFinal, setDataFinal] = useState(dayjs().format('YYYY-MM-DD'));
  const [tipoFilter, setTipoFilter] = useState('all');
  const [estoqueFilter, setEstoqueFilter] = useState('all');

  // Dados para filtros
  const [estoques, setEstoques] = useState<any[]>([]);

  // Alertas e auditoria
  const [alertasAtivos, setAlertasAtivos] = useState<any[]>([]);
  const [auditoria, setAuditoria] = useState<any[]>([]);

  useEffect(() => {
    fetchItensEstoque();
    fetchEstoques();
  }, []);

  useEffect(() => {
    if (itemSelecionado) {
      fetchKardexProduto();
    }
  }, [itemSelecionado, dataInicial, dataFinal, tipoFilter, estoqueFilter]);

  const fetchItensEstoque = async () => {
    try {
      const { data, error } = await supabase
        .from('itens_estoque')
        .select('*')
        .eq('status', 'ativo')
        .order('nome');

      if (error) throw error;
      setItensEstoque(data || []);
    } catch (err) {
      console.error('Error fetching items:', err);
      setError('Erro ao carregar itens');
    }
  };

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

  const fetchKardexProduto = async () => {
    if (!itemSelecionado) return;

    try {
      setLoading(true);
      setError(null);

      // Buscar movimentações
      let queryMovimentacoes = supabase
        .from('movimentacoes_estoque')
        .select(`
          *,
          estoque_origem:estoques!estoque_origem_id(nome),
          estoque_destino:estoques!estoque_destino_id(nome),
          item:itens_estoque!inner(codigo, nome, unidade_medida)
        `)
        .eq('item_id', itemSelecionado.id);

      // Aplicar filtros
      if (dataInicial) {
        queryMovimentacoes = queryMovimentacoes.gte('data_movimentacao', dataInicial);
      }
      if (dataFinal) {
        queryMovimentacoes = queryMovimentacoes.lte('data_movimentacao', dataFinal);
      }
      if (tipoFilter !== 'all') {
        queryMovimentacoes = queryMovimentacoes.eq('tipo_movimentacao', tipoFilter);
      }
      if (estoqueFilter !== 'all') {
        queryMovimentacoes = queryMovimentacoes.or(`estoque_origem_id.eq.${estoqueFilter},estoque_destino_id.eq.${estoqueFilter}`);
      }

      const { data: movimentacoesData, error: movError } = await queryMovimentacoes
        .order('data_movimentacao', { ascending: true });

      if (movError) throw movError;

      // Processar movimentações com saldo acumulado
      const movimentacoesProcessadas = calcularSaldosAcumulados((movimentacoesData || []).map(mov => ({
        ...mov,
        estoque_origem_nome: mov.estoque_origem?.nome,
        estoque_destino_nome: mov.estoque_destino?.nome,
        item_codigo: mov.item?.codigo,
        item_nome: mov.item?.nome,
        unidade_medida: mov.item?.unidade_medida
      })));
      setMovimentacoes(movimentacoesProcessadas);

      // Buscar todos os estoques e calcular saldo REAL via SQL function
      const { data: estoquesData, error: estoquesError } = await supabase
        .from('estoques')
        .select('id, nome')
        .eq('status', true)
        .order('nome');

      if (estoquesError) throw estoquesError;

      // Calcular saldo real para cada estoque usando a função SQL confiável
      const saldosProcessados: SaldoEstoque[] = [];
      for (const estoque of (estoquesData || [])) {
        const { data: saldoReal } = await supabase.rpc('calcular_saldo_item_estoque', {
          p_item_id:    itemSelecionado.id,
          p_estoque_id: estoque.id,
        });
        const qtd = Number(saldoReal ?? 0);
        // Só mostrar estoques onde o item tem histórico (qtd != 0) ou tem registro
        const { data: temRegistro } = await supabase
          .from('saldos_estoque')
          .select('valor_total, atualizado_em')
          .eq('item_id', itemSelecionado.id)
          .eq('estoque_id', estoque.id)
          .maybeSingle();

        if (qtd !== 0 || temRegistro) {
          saldosProcessados.push({
            estoque_id:               estoque.id,
            estoque_nome:             estoque.nome,
            quantidade_atual:         qtd,
            valor_total:              qtd * Number(itemSelecionado.custo_medio || 0),
            custo_medio_atual:        Number(itemSelecionado.custo_medio || 0),
            data_ultima_movimentacao: temRegistro?.atualizado_em,
          });
        }
      }

      // Buscar alertas ativos para este item
      const alertasData = await buscarAlertasNegativos();
      const alertasItem = alertasData.filter((a: any) => a.item_id === itemSelecionado.id);
      setAlertasAtivos(alertasItem);

      setSaldosEstoque(saldosProcessados);

      // Calcular indicadores
      calcularIndicadores(movimentacoesProcessadas, saldosProcessados);

      // Preparar dados para gráfico
      prepararDadosGrafico(movimentacoesProcessadas);

    } catch (err) {
      console.error('Error fetching product kardex:', err);
      setError('Erro ao carregar kardex do produto');
      setMovimentacoes([]);
      setSaldosEstoque([]);
    } finally {
      setLoading(false);
    }
  };

  const calcularSaldosAcumulados = (movimentacoes: any[]): MovimentacaoKardex[] => {
    let saldoQuantidade = 0;
    let saldoValor = 0;
    let custoMedioPonderado = 0;

    return movimentacoes.map(mov => {
      const quantidade = mov.quantidade || 0;
      const custoUnitario = mov.custo_unitario || 0;
      const custoTotal = Math.abs(mov.custo_total || 0);

      if (mov.tipo_movimentacao === 'entrada' || 
         (mov.tipo_movimentacao === 'transferencia' && mov.estoque_destino_id === estoqueFilter)) {
        // Entrada ou transferência para o estoque filtrado
        const valorAnterior = saldoValor;
        const quantidadeAnterior = saldoQuantidade;
        
        saldoQuantidade += quantidade;
        saldoValor += custoTotal;
        
        // Calcular novo custo médio ponderado
        custoMedioPonderado = saldoQuantidade > 0 ? saldoValor / saldoQuantidade : custoUnitario;
        
      } else if (mov.tipo_movimentacao === 'saida' ||
                (mov.tipo_movimentacao === 'transferencia' && mov.estoque_origem_id === estoqueFilter)) {
        // Saída ou transferência do estoque filtrado
        saldoQuantidade -= quantidade;
        saldoValor -= (quantidade * custoMedioPonderado);

        // PERMITIR SALDO NEGATIVO - não forçar a zero
        custoMedioPonderado = saldoQuantidade !== 0 ? saldoValor / saldoQuantidade : custoMedioPonderado;

      } else if (mov.tipo_movimentacao === 'ajuste') {
        // Ajuste (pode ser positivo ou negativo)
        if (quantidade > 0) {
          saldoQuantidade += quantidade;
          saldoValor += custoTotal;
        } else {
          saldoQuantidade += quantidade; // quantidade já é negativa em ajustes de redução
          saldoValor += custoTotal; // custoTotal já considera o sinal
        }

        // PERMITIR SALDO NEGATIVO - não forçar a zero
        custoMedioPonderado = saldoQuantidade !== 0 ? saldoValor / saldoQuantidade : custoMedioPonderado;
      }

      return {
        id: mov.id,
        data_movimentacao: mov.data_movimentacao,
        tipo_movimentacao: mov.tipo_movimentacao,
        quantidade: quantidade,
        custo_unitario: custoUnitario,
        custo_total: custoTotal,
        saldo_quantidade: saldoQuantidade,
        saldo_valor: saldoValor,
        custo_medio_ponderado: custoMedioPonderado,
        motivo: mov.motivo,
        observacoes: mov.observacoes,
        estoque_origem_nome: mov.estoque_origem_nome,
        estoque_destino_nome: mov.estoque_destino_nome,
        criado_em: mov.criado_em || mov.data_movimentacao
      };
    });
  };

  const calcularIndicadores = (movimentacoes: MovimentacaoKardex[], saldos: SaldoEstoque[]) => {
    const quantidadeTotal = saldos.reduce((sum, s) => sum + s.quantidade_atual, 0);
    const valorTotal = saldos.reduce((sum, s) => sum + s.valor_total, 0);
    const custoMedioGeral = quantidadeTotal > 0 ? valorTotal / quantidadeTotal : 0;
    
    const entradasPeriodo = movimentacoes.filter(m => 
      m.tipo_movimentacao === 'entrada' || 
      (m.tipo_movimentacao === 'transferencia' && m.estoque_destino_nome)
    ).reduce((sum, m) => sum + m.quantidade, 0);
    
    const saidasPeriodo = movimentacoes.filter(m => 
      m.tipo_movimentacao === 'saida' || 
      (m.tipo_movimentacao === 'transferencia' && m.estoque_origem_nome)
    ).reduce((sum, m) => sum + m.quantidade, 0);
    
    const giroPeriodo = quantidadeTotal > 0 ? saidasPeriodo / quantidadeTotal : 0;
    
    const ultimaEntrada = movimentacoes
      .filter(m => m.tipo_movimentacao === 'entrada')
      .sort((a, b) => dayjs(b.data_movimentacao).diff(dayjs(a.data_movimentacao)))[0];
    
    const ultimaSaida = movimentacoes
      .filter(m => m.tipo_movimentacao === 'saida')
      .sort((a, b) => dayjs(b.data_movimentacao).diff(dayjs(a.data_movimentacao)))[0];

    setIndicadores({
      quantidade_total: quantidadeTotal,
      valor_total: valorTotal,
      custo_medio_geral: custoMedioGeral,
      total_movimentacoes: movimentacoes.length,
      entradas_periodo: entradasPeriodo,
      saidas_periodo: saidasPeriodo,
      giro_periodo: giroPeriodo,
      estoques_com_saldo: saldos.length,
      ultima_entrada: ultimaEntrada?.data_movimentacao,
      ultima_saida: ultimaSaida?.data_movimentacao
    });
  };

  const prepararDadosGrafico = (movimentacoes: MovimentacaoKardex[]) => {
    // Agrupar por data para o gráfico
    const dadosPorData: { [key: string]: {
      entrada: number;
      saida: number;
      saldo: number;
      custo_medio: number;
    } } = {};

    movimentacoes.forEach(mov => {
      const dataFormatada = dayjs(mov.data_movimentacao).format('DD/MM');
      
      if (!dadosPorData[dataFormatada]) {
        dadosPorData[dataFormatada] = {
          entrada: 0,
          saida: 0,
          saldo: mov.saldo_quantidade,
          custo_medio: mov.custo_medio_ponderado
        };
      }

      if (mov.tipo_movimentacao === 'entrada') {
        dadosPorData[dataFormatada].entrada += mov.quantidade;
      } else if (mov.tipo_movimentacao === 'saida') {
        dadosPorData[dataFormatada].saida += mov.quantidade;
      }

      // Atualizar com o último saldo do dia
      dadosPorData[dataFormatada].saldo = mov.saldo_quantidade;
      dadosPorData[dataFormatada].custo_medio = mov.custo_medio_ponderado;
    });

    const dadosArray = Object.entries(dadosPorData)
      .map(([data, valores]) => ({
        data,
        ...valores
      }))
      .slice(-30); // Últimos 30 registros para o gráfico

    setDadosGrafico(dadosArray);
  };

  const exportarKardex = () => {
    if (!itemSelecionado || movimentacoes.length === 0) {
      alert('Selecione um item e certifique-se de que há movimentações para exportar');
      return;
    }

    const reportGenerator = new ReportGenerator({
      title: 'Kardex de Produto',
      subtitle: `Produto: ${itemSelecionado.nome} | Período: ${dayjs(dataInicial).format('DD/MM/YYYY')} a ${dayjs(dataFinal).format('DD/MM/YYYY')}`,
      filename: `kardex-produto-${itemSelecionado.nome.replace(/\s+/g, '-')}-${dayjs().format('YYYY-MM-DD')}.pdf`,
      orientation: 'landscape'
    });

    let currentY = reportGenerator.addHeader(
      'Kardex de Produto',
      `Produto: ${itemSelecionado.nome} | Período: ${dayjs(dataInicial).format('DD/MM/YYYY')} a ${dayjs(dataFinal).format('DD/MM/YYYY')}`
    );

    // Informações do produto
    const infoProduto = [
      ['Nome', itemSelecionado.nome],
      ['Código', itemSelecionado.codigo || '-'],
      ['Tipo', itemSelecionado.tipo_item === 'insumo' ? 'Insumo' : 'Produto Final'],
      ['Categoria', itemSelecionado.categoria],
      ['Unidade de Medida', itemSelecionado.unidade_medida],
      ['Status', itemSelecionado.status === 'ativo' ? 'Ativo' : 'Inativo'],
      ['Descrição', itemSelecionado.descricao || '-']
    ];

    currentY = reportGenerator.addSection('Dados do Produto', [], currentY);
    currentY = reportGenerator.addTable(['Campo', 'Valor'], infoProduto, currentY);

    // Resumo dos saldos atuais
    if (saldosEstoque.length > 0) {
      const saldosHeaders = ['Estoque', 'Quantidade', 'Valor Total', 'Custo Médio', 'Última Movimentação'];
      const saldosData = saldosEstoque.map(saldo => [
        saldo.estoque_nome,
        `${saldo.quantidade_atual.toFixed(3)} ${itemSelecionado.unidade_medida}`,
        formatCurrency(saldo.valor_total),
        formatCurrency(saldo.custo_medio_atual),
        saldo.data_ultima_movimentacao ? dayjs(saldo.data_ultima_movimentacao).format('DD/MM/YYYY') : '-'
      ]);

      currentY = reportGenerator.addSection('Saldos Atuais por Estoque', [], currentY + 10);
      currentY = reportGenerator.addTable(saldosHeaders, saldosData, currentY);
    }

    // Resumo dos indicadores
    if (indicadores) {
      const resumo = [
        ['Quantidade Total em Estoque', `${indicadores.quantidade_total.toFixed(3)} ${itemSelecionado.unidade_medida}`],
        ['Valor Total em Estoque', formatCurrency(indicadores.valor_total)],
        ['Custo Médio Geral', formatCurrency(indicadores.custo_medio_geral)],
        ['Total de Movimentações', indicadores.total_movimentacoes.toString()],
        ['Entradas no Período', `${indicadores.entradas_periodo.toFixed(3)} ${itemSelecionado.unidade_medida}`],
        ['Saídas no Período', `${indicadores.saidas_periodo.toFixed(3)} ${itemSelecionado.unidade_medida}`],
        ['Giro do Estoque', `${indicadores.giro_periodo.toFixed(2)}x`],
        ['Estoques com Saldo', indicadores.estoques_com_saldo.toString()],
        ['Última Entrada', indicadores.ultima_entrada ? dayjs(indicadores.ultima_entrada).format('DD/MM/YYYY') : '-'],
        ['Última Saída', indicadores.ultima_saida ? dayjs(indicadores.ultima_saida).format('DD/MM/YYYY') : '-']
      ];

      currentY = reportGenerator.addSection('Indicadores do Período', [], currentY + 10);
      currentY = reportGenerator.addTable(['Indicador', 'Valor'], resumo, currentY);
    }

    // Kardex detalhado
    const headers = [
      'Data',
      'Tipo',
      'Origem',
      'Destino',
      'Entrada',
      'Saída',
      'Saldo Qtd',
      'Custo Unit.',
      'Custo Médio',
      'Saldo Valor',
      'Motivo'
    ];

    const data = movimentacoes.map(mov => [
      dayjs(mov.data_movimentacao).format('DD/MM/YYYY'),
      getTipoText(mov.tipo_movimentacao),
      mov.estoque_origem_nome || '-',
      mov.estoque_destino_nome || '-',
      mov.tipo_movimentacao === 'entrada' || 
      (mov.tipo_movimentacao === 'transferencia' && mov.estoque_destino_nome) || 
      (mov.tipo_movimentacao === 'ajuste' && mov.quantidade > 0) 
        ? `${mov.quantidade.toFixed(3)}` : '-',
      mov.tipo_movimentacao === 'saida' || 
      (mov.tipo_movimentacao === 'transferencia' && mov.estoque_origem_nome) || 
      (mov.tipo_movimentacao === 'ajuste' && mov.quantidade < 0) 
        ? `${Math.abs(mov.quantidade).toFixed(3)}` : '-',
      `${mov.saldo_quantidade.toFixed(3)}`,
      formatCurrency(mov.custo_unitario),
      formatCurrency(mov.custo_medio_ponderado),
      formatCurrency(mov.saldo_valor),
      mov.motivo || '-'
    ]);

    currentY = reportGenerator.addSection('Kardex Detalhado', [], currentY + 10);
    reportGenerator.addTable(headers, data, currentY);

    reportGenerator.save(`kardex-produto-${itemSelecionado.nome.replace(/\s+/g, '-')}-${dayjs().format('YYYY-MM-DD')}.pdf`);
  };

  const exportarExcel = () => {
    if (!itemSelecionado || movimentacoes.length === 0) {
      alert('Selecione um item e certifique-se de que há movimentações para exportar');
      return;
    }

    const headers = [
      'Data',
      'Hora',
      'Tipo Movimentação',
      'Estoque Origem',
      'Estoque Destino',
      'Quantidade',
      'Custo Unitário',
      'Custo Total',
      'Saldo Quantidade',
      'Saldo Valor',
      'Custo Médio Ponderado',
      'Motivo',
      'Observações'
    ];

    const data = movimentacoes.map(mov => [
      dayjs(mov.data_movimentacao).format('DD/MM/YYYY'),
      dayjs(mov.criado_em).format('HH:mm'),
      getTipoText(mov.tipo_movimentacao),
      mov.estoque_origem_nome || '',
      mov.estoque_destino_nome || '',
      mov.quantidade.toFixed(3),
      mov.custo_unitario,
      mov.custo_total,
      mov.saldo_quantidade.toFixed(3),
      mov.saldo_valor,
      mov.custo_medio_ponderado,
      mov.motivo || '',
      mov.observacoes || ''
    ]);

    const fileName = `kardex-produto-${itemSelecionado.nome.replace(/\s+/g, '-')}-${dayjs().format('YYYY-MM-DD')}`;
    exportToExcel(data, fileName, headers);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'entrada':
        return 'text-green-300 bg-green-900/30';
      case 'saida':
        return 'text-red-300 bg-red-900/30';
      case 'transferencia':
        return 'text-blue-300 bg-blue-900/30';
      case 'ajuste':
        return 'text-purple-400 bg-purple-500/15';
      default:
        return 'text-white/80 bg-white/10';
    }
  };

  const getTipoIcon = (tipo: string) => {
    switch (tipo) {
      case 'entrada':
        return <ArrowUp className="w-4 h-4" />;
      case 'saida':
        return <ArrowDown className="w-4 h-4" />;
      case 'transferencia':
        return <ArrowLeftRight className="w-4 h-4" />;
      case 'ajuste':
        return <RotateCcw className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getTipoText = (tipo: string) => {
    switch (tipo) {
      case 'entrada':
        return 'Entrada';
      case 'saida':
        return 'Saída';
      case 'transferencia':
        return 'Transferência';
      case 'ajuste':
        return 'Ajuste';
      default:
        return tipo;
    }
  };

  const filteredItens = itensEstoque.filter(item => 
    item.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.codigo?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!itemSelecionado) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium text-white">Kardex de Produto</h3>
        </div>

        {error && (
          <div className="p-4 bg-red-900/30 text-red-300 rounded-lg border border-red-500/30">
            {error}
          </div>
        )}

        {/* Seleção de Item */}
        <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
          <h4 className="text-md font-medium text-white mb-4">Selecionar Produto</h4>
          
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/30 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar por nome ou código..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-white/20 rounded-lg bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredItens.map((item) => (
              <div
                key={item.id}
                onClick={() => setItemSelecionado(item)}
                className="p-4 border border-white/10 rounded-lg hover:border-[#7D1F2C] hover:shadow-md cursor-pointer transition-all duration-200"
              >
                <div className="flex items-start">
                  <div className="p-2 bg-blue-500/15 rounded-lg mr-3">
                    <Package className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <h5 className="font-medium text-white">{item.nome}</h5>
                    {item.codigo && (
                      <p className="text-sm text-white/50">Código: {item.codigo}</p>
                    )}
                    <p className="text-sm text-white/50">Categoria: {item.categoria}</p>
                    <p className="text-sm text-white/50">Unidade: {item.unidade_medida}</p>
                    <span className={`mt-2 inline-block px-2 py-1 text-xs font-medium rounded-full ${
                      item.tipo_item === 'insumo' ? 'text-blue-300 bg-blue-900/30' : 'text-green-300 bg-green-900/30'
                    }`}>
                      {item.tipo_item === 'insumo' ? 'Insumo' : 'Produto Final'}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredItens.length === 0 && (
            <div className="text-center py-8">
              <Package className="w-12 h-12 text-white/30 mx-auto mb-4" />
              <p className="text-white/40">
                {searchTerm ? 'Nenhum item encontrado' : 'Nenhum item cadastrado'}
              </p>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div className="flex items-center">
          <button
            onClick={() => setItemSelecionado(null)}
            className="mr-4 p-2 text-white/50 hover:text-white/90 hover:bg-white/10/10 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h3 className="text-lg font-medium text-white">
            Kardex - {itemSelecionado.nome}
          </h3>
        </div>
        <div className="flex gap-2">
          <button
            onClick={exportarExcel}
            className="px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white/80 hover:bg-white/10"
          >
            <Download className="w-4 h-4 inline mr-2" />
            Excel
          </button>
          <button
            onClick={exportarKardex}
            className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25]"
          >
            <FileText className="w-4 h-4 inline mr-2" />
            PDF
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 text-red-300 rounded-lg border border-red-500/30">
          {error}
        </div>
      )}

      {/* Informações do Produto */}
      <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
        <h4 className="text-md font-medium text-white mb-4 flex items-center">
          <Package className="w-5 h-5 mr-2 text-[#7D1F2C]" />
          Informações do Produto
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <h5 className="text-sm font-medium text-white/50 mb-2">Dados Básicos</h5>
            <div className="space-y-1">
              <p className="font-medium text-white">{itemSelecionado.nome}</p>
              {itemSelecionado.codigo && (
                <p className="text-sm text-white/50">Código: {itemSelecionado.codigo}</p>
              )}
              <p className="text-sm text-white/50">Categoria: {itemSelecionado.categoria}</p>
              <p className="text-sm text-white/50">Unidade: {itemSelecionado.unidade_medida}</p>
            </div>
          </div>

          <div>
            <h5 className="text-sm font-medium text-white/50 mb-2">Tipo</h5>
            <span className={`inline-block px-3 py-1 text-sm font-medium rounded-full ${
              itemSelecionado.tipo_item === 'insumo' ? 'text-blue-300 bg-blue-900/30' : 'text-green-300 bg-green-900/30'
            }`}>
              {itemSelecionado.tipo_item === 'insumo' ? 'Insumo' : 'Produto Final'}
            </span>
            {itemSelecionado.descricao && (
              <p className="text-sm text-white/50 mt-2">{itemSelecionado.descricao}</p>
            )}
          </div>

          <div>
            <h5 className="text-sm font-medium text-white/50 mb-2">Estoque Atual</h5>
            {indicadores && (
              <div className="space-y-1">
                <p className="text-sm">
                  <span className="text-white/50">Quantidade:</span>
                  <span className="font-medium text-white ml-2">
                    {indicadores.quantidade_total.toFixed(3)} {itemSelecionado.unidade_medida}
                  </span>
                </p>
                <p className="text-sm">
                  <span className="text-white/50">Valor Total:</span>
                  <span className="font-medium text-green-400 ml-2">
                    {formatCurrency(indicadores.valor_total)}
                  </span>
                </p>
                <p className="text-sm">
                  <span className="text-white/50">Custo Médio:</span>
                  <span className="font-medium text-white ml-2">
                    {formatCurrency(indicadores.custo_medio_geral)}
                  </span>
                </p>
              </div>
            )}
          </div>

          <div>
            <h5 className="text-sm font-medium text-white/50 mb-2">Movimentações</h5>
            {indicadores && (
              <div className="space-y-1">
                <p className="text-sm">
                  <span className="text-white/50">Total:</span>
                  <span className="font-medium text-white ml-2">
                    {indicadores.total_movimentacoes}
                  </span>
                </p>
                <p className="text-sm">
                  <span className="text-white/50">Giro:</span>
                  <span className="font-medium text-blue-400 ml-2">
                    {indicadores.giro_periodo.toFixed(2)}x
                  </span>
                </p>
                <p className="text-sm">
                  <span className="text-white/50">Estoques:</span>
                  <span className="font-medium text-white ml-2">
                    {indicadores.estoques_com_saldo}
                  </span>
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Alerta de Saldos Negativos */}
      {alertasAtivos.length > 0 && (
        <div className="bg-gradient-to-r from-red-50 to-orange-50 border-2 border-red-300 rounded-lg p-6 shadow-lg">
          <div className="flex items-start gap-4">
            <div className="bg-red-500/15 p-3 rounded-full">
              <AlertTriangle className="h-8 w-8 text-red-400" />
            </div>
            <div className="flex-1">
              <h3 className="text-xl font-bold text-red-300 mb-1">
                Este item tem {alertasAtivos.length} {alertasAtivos.length === 1 ? 'estoque' : 'estoques'} com saldo NEGATIVO
              </h3>
              <div className="space-y-2 mt-3">
                {alertasAtivos.map((alerta: any) => (
                  <div key={alerta.id} className="flex items-center gap-2 text-sm">
                    <AlertCircle className="h-4 w-4 text-red-400" />
                    <span className="font-medium text-red-300">{alerta.estoque.nome}:</span>
                    <span className="text-red-400">
                      {alerta.quantidade_negativa.toFixed(2)} {itemSelecionado.unidade_medida}
                    </span>
                    <span className="text-red-400">
                      (há {dayjs().diff(dayjs(alerta.data_ficou_negativo), 'day')} {dayjs().diff(dayjs(alerta.data_ficou_negativo), 'day') === 1 ? 'dia' : 'dias'})
                    </span>
                  </div>
                ))}
              </div>
              <p className="text-sm text-red-400 mt-3">
                Registre a entrada correspondente para regularizar o estoque.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Indicadores */}
      {indicadores && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <TrendingUp className="w-8 h-8 text-green-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Entradas</p>
                <p className="text-2xl font-bold text-green-400">
                  {indicadores.entradas_periodo.toFixed(1)}
                </p>
                <p className="text-sm text-white/50">{itemSelecionado.unidade_medida}</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <TrendingDown className="w-8 h-8 text-red-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Saídas</p>
                <p className="text-2xl font-bold text-red-400">
                  {indicadores.saidas_periodo.toFixed(1)}
                </p>
                <p className="text-sm text-white/50">{itemSelecionado.unidade_medida}</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <Package className="w-8 h-8 text-blue-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Saldo Total</p>
                <p className="text-2xl font-bold text-blue-400">
                  {indicadores.quantidade_total.toFixed(1)}
                </p>
                <p className="text-sm text-white/50">{itemSelecionado.unidade_medida}</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <Activity className="w-8 h-8 text-purple-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Giro do Estoque</p>
                <p className="text-2xl font-bold text-purple-400">
                  {indicadores.giro_periodo.toFixed(2)}x
                </p>
                <p className="text-sm text-white/50">No período</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-[#12141f] p-4 rounded-lg border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Data Inicial
            </label>
            <input
              type="date"
              value={dataInicial}
              onChange={(e) => setDataInicial(e.target.value)}
              className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Data Final
            </label>
            <input
              type="date"
              value={dataFinal}
              onChange={(e) => setDataFinal(e.target.value)}
              className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Tipo Movimentação
            </label>
            <select
              value={tipoFilter}
              onChange={(e) => setTipoFilter(e.target.value)}
              className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            >
              <option value="all">Todos os Tipos</option>
              <option value="entrada">Entradas</option>
              <option value="saida">Saídas</option>
              <option value="transferencia">Transferências</option>
              <option value="ajuste">Ajustes</option>
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

          <div className="flex items-end">
            <button
              onClick={fetchKardexProduto}
              className="w-full px-4 py-2 bg-[#7D1F2C] text-white rounded-md hover:bg-[#6a1a25]"
            >
              <Filter className="w-4 h-4 inline mr-2" />
              Atualizar
            </button>
          </div>
        </div>
      </div>

      {/* Saldos por Estoque */}
      {saldosEstoque.length > 0 && (
        <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
          <h4 className="text-lg font-medium text-white mb-4 flex items-center">
            <Warehouse className="w-5 h-5 mr-2 text-[#7D1F2C]" />
            Saldos Atuais por Estoque
          </h4>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {saldosEstoque.map((saldo) => (
              <div key={saldo.estoque_id} className="p-4 bg-white/5 rounded-lg border border-white/10">
                <div className="flex items-center justify-between mb-2">
                  <h5 className="font-medium text-white">{saldo.estoque_nome}</h5>
                  <Warehouse className="w-5 h-5 text-blue-400" />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between">
                    <span className="text-sm text-white/50">Quantidade:</span>
                    <span className="text-sm font-medium text-white">
                      {saldo.quantidade_atual.toFixed(3)} {itemSelecionado.unidade_medida}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-white/50">Valor:</span>
                    <span className="text-sm font-medium text-green-400">
                      {formatCurrency(saldo.valor_total)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-white/50">Custo Médio:</span>
                    <span className="text-sm font-medium text-blue-400">
                      {formatCurrency(saldo.custo_medio_atual)}
                    </span>
                  </div>
                  {saldo.data_ultima_movimentacao && (
                    <div className="flex justify-between">
                      <span className="text-sm text-white/50">Última Movimentação:</span>
                      <span className="text-sm text-white/40">
                        {dayjs(saldo.data_ultima_movimentacao).format('DD/MM/YYYY')}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gráfico de Evolução */}
      {dadosGrafico.length > 0 && (
        <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
          <h4 className="text-lg font-medium text-white mb-4">
            Evolução do Estoque
          </h4>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={dadosGrafico}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="data" />
                <YAxis />
                <Tooltip 
                  formatter={(value: number, name: string) => [
                    name === 'custo_medio' ? formatCurrency(value) : value.toFixed(3),
                    name
                  ]}
                  contentStyle={{
                    backgroundColor: 'rgba(255, 255, 255, 0.95)',
                    border: 'none',
                    borderRadius: '8px',
                    boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
                  }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="saldo" 
                  stroke="#7D1F2C" 
                  strokeWidth={3}
                  name="Saldo" 
                />
                <Line 
                  type="monotone" 
                  dataKey="custo_medio" 
                  stroke="#D4AF37" 
                  strokeWidth={2}
                  name="Custo Médio" 
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Kardex Detalhado */}
      <div className="bg-[#12141f] rounded-lg border border-white/10">
        <div className="p-6">
          <h4 className="text-lg font-medium text-white mb-4 flex items-center">
            <FileText className="w-5 h-5 mr-2 text-[#7D1F2C]" />
            Kardex Detalhado
          </h4>

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]"></div>
            </div>
          ) : (
            <>
              {movimentacoes.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left bg-white/5 border-b">
                        <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Data</th>
                        <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Tipo</th>
                        <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Origem</th>
                        <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Destino</th>
                        <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Entrada</th>
                        <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Saída</th>
                        <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Saldo Qtd</th>
                        <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Custo Unit.</th>
                        <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Custo Médio</th>
                        <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Saldo Valor</th>
                        <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Motivo</th>
                        <th className="px-4 py-3 text-xs font-medium text-white/40 uppercase">Observações</th>
                      </tr>
                    </thead>
                    <tbody className="bg-[#12141f] divide-y divide-white/5">
                      {movimentacoes.map((mov) => {
                        const saldoNegativo = mov.saldo_quantidade < 0;
                        return (
                        <tr key={mov.id} className={`hover:bg-white/10/5 ${saldoNegativo ? 'bg-red-500/10 border-l-4 border-red-500' : ''}`}>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {dayjs(mov.data_movimentacao).format('DD/MM/YYYY')}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getTipoColor(mov.tipo_movimentacao)}`}>
                              {getTipoIcon(mov.tipo_movimentacao)}
                              <span className="ml-1">{getTipoText(mov.tipo_movimentacao)}</span>
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            {mov.estoque_origem_nome || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            {mov.estoque_destino_nome || '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            {(mov.tipo_movimentacao === 'entrada' || 
                             (mov.tipo_movimentacao === 'transferencia' && mov.estoque_destino_nome) ||
                             (mov.tipo_movimentacao === 'ajuste' && mov.quantidade > 0)) 
                              ? `+${mov.quantidade.toFixed(3)}` : '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            {(mov.tipo_movimentacao === 'saida' || 
                             (mov.tipo_movimentacao === 'transferencia' && mov.estoque_origem_nome) ||
                             (mov.tipo_movimentacao === 'ajuste' && mov.quantidade < 0)) 
                              ? `-${Math.abs(mov.quantidade).toFixed(3)}` : '-'}
                          </td>
                          <td className={`px-4 py-3 whitespace-nowrap text-sm font-bold ${saldoNegativo ? 'text-red-400' : 'text-white/90'}`}>
                            {saldoNegativo && <AlertTriangle className="inline h-4 w-4 mr-1" />}
                            {mov.saldo_quantidade.toFixed(3)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            {formatCurrency(mov.custo_unitario)}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-blue-400">
                            {formatCurrency(mov.custo_medio_ponderado)}
                          </td>
                          <td className={`px-4 py-3 whitespace-nowrap text-sm font-medium ${saldoNegativo ? 'text-red-400' : 'text-green-400'}`}>
                            {formatCurrency(mov.saldo_valor)}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {mov.motivo || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm text-white/50 max-w-[200px]">
                            {mov.observacoes ? (
                              <span title={mov.observacoes} className="truncate block">{mov.observacoes}</span>
                            ) : '-'}
                          </td>
                        </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-12">
                  <Activity className="w-16 h-16 text-white/30 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">Nenhuma movimentação encontrada</h3>
                  <p className="text-white/40">
                    Não há movimentações registradas para este produto no período selecionado.
                  </p>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default KardexProduto;