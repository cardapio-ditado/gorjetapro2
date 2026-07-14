import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft,
  Search,
  Filter,
  Download,
  Calendar,
  DollarSign,
  Building2,
  Phone,
  Mail,
  FileText,
  Package,
  Receipt,
  ArrowDown,
  ArrowUp,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  CreditCard,
  Banknote,
  History,
  Activity,
  TrendingUp,
  TrendingDown
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

interface Fornecedor {
  id: string;
  nome: string;
  cnpj?: string;
  telefone?: string;
  email?: string;
  responsavel?: string;
  endereco?: string;
  status: string;
}

interface LancamentoKardex {
  tipo: 'conta_pagar' | 'pagamento';
  data: string;
  descricao: string;
  documento?: string;
  categoria?: string;
  centro_custo?: string;
  forma_pagamento?: string;
  conta_bancaria?: string;
  valor_debito: number; // Compras
  valor_credito: number; // Pagamentos
  saldo_acumulado: number;
  status?: string;
  observacoes?: string;
  criado_em: string;
}

interface IndicadoresFornecedor {
  total_comprado: number;
  total_pago: number;
  saldo_pendente: number;
  total_contas: number;
  contas_vencidas: number;
  valor_vencido: number;
  ticket_medio: number;
  prazo_medio_pagamento: number;
  maior_compra: number;
  menor_compra: number;
}

interface DadosGrafico {
  periodo: string;
  compras: number;
  pagamentos: number;
  saldo_acumulado: number;
}

const KardexFornecedor: React.FC = () => {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<Fornecedor | null>(null);
  const [lancamentos, setLancamentos] = useState<LancamentoKardex[]>([]);
  const [indicadores, setIndicadores] = useState<IndicadoresFornecedor | null>(null);
  const [dadosGrafico, setDadosGrafico] = useState<DadosGrafico[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [dataInicial, setDataInicial] = useState(dayjs().subtract(1, 'year').format('YYYY-MM-DD'));
  const [dataFinal, setDataFinal] = useState(dayjs().format('YYYY-MM-DD'));
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoriaFilter, setCategoriaFilter] = useState('all');
  const [tipoLancamentoFilter, setTipoLancamentoFilter] = useState('all');
  
  // Dados para filtros
  const [categorias, setCategorias] = useState<any[]>([]);

  useEffect(() => {
    fetchFornecedores();
    fetchCategorias();
  }, []);

  useEffect(() => {
    if (fornecedorSelecionado) {
      fetchKardexFornecedor();
    }
  }, [fornecedorSelecionado, dataInicial, dataFinal, statusFilter, categoriaFilter, tipoLancamentoFilter]);

  const fetchFornecedores = async () => {
    try {
      const { data, error } = await supabase
        .from('fornecedores')
        .select('*')
        .eq('status', 'ativo')
        .order('nome');

      if (error) throw error;
      setFornecedores(data || []);
    } catch (err) {
      console.error('Error fetching suppliers:', err);
      setError('Erro ao carregar fornecedores');
    }
  };

  const fetchCategorias = async () => {
    try {
      const { data, error } = await supabase
        .from('vw_categoria_tree')
        .select('id, nome, caminho_completo')
        .eq('tipo', 'despesa')
        .eq('status', 'ativo')
        .order('caminho_completo');

      if (error) throw error;
      setCategorias(data || []);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  const fetchKardexFornecedor = async () => {
    if (!fornecedorSelecionado) return;

    try {
      setLoading(true);
      setError(null);

      // Buscar contas a pagar
      let queryContas = supabase
        .from('vw_contas_pagar')
        .select('*')
        .eq('fornecedor_id', fornecedorSelecionado.id);

      // Aplicar filtros
      if (dataInicial) {
        queryContas = queryContas.gte('data_emissao', dataInicial);
      }
      if (dataFinal) {
        queryContas = queryContas.lte('data_emissao', dataFinal);
      }
      if (statusFilter !== 'all') {
        queryContas = queryContas.eq('status', statusFilter);
      }
      if (categoriaFilter !== 'all') {
        queryContas = queryContas.eq('categoria_id', categoriaFilter);
      }

      const { data: contasData, error: contasError } = await queryContas.order('data_emissao');

      if (contasError) throw contasError;

      // Buscar pagamentos
      let queryPagamentos = supabase
        .from('vw_pagamentos_fornecedor')
        .select('*')
        .eq('fornecedor_id', fornecedorSelecionado.id);

      if (dataInicial) {
        queryPagamentos = queryPagamentos.gte('data_pagamento', dataInicial);
      }
      if (dataFinal) {
        queryPagamentos = queryPagamentos.lte('data_pagamento', dataFinal);
      }

      const { data: pagamentosData, error: pagamentosError } = await queryPagamentos.order('data_pagamento');

      if (pagamentosError) throw pagamentosError;

      // Combinar e ordenar lançamentos cronologicamente
      const lancamentosCombinados: any[] = [];

      // Adicionar contas a pagar
      (contasData || []).forEach(conta => {
        if (tipoLancamentoFilter === 'all' || tipoLancamentoFilter === 'conta_pagar') {
          lancamentosCombinados.push({
            tipo: 'conta_pagar',
            data: conta.data_emissao,
            descricao: conta.descricao,
            documento: conta.numero_documento,
            categoria: conta.categoria_nome,
            centro_custo: conta.centro_custo_nome,
            forma_pagamento: conta.forma_pagamento_nome,
            valor_debito: conta.valor_total,
            valor_credito: 0,
            status: conta.status,
            observacoes: conta.observacoes,
            criado_em: conta.criado_em || conta.data_emissao,
            conta_id: conta.id
          });
        }
      });

      // Adicionar pagamentos
      (pagamentosData || []).forEach(pagamento => {
        if (tipoLancamentoFilter === 'all' || tipoLancamentoFilter === 'pagamento') {
          lancamentosCombinados.push({
            tipo: 'pagamento',
            data: pagamento.data_pagamento,
            descricao: `Pagamento - ${pagamento.conta_descricao}`,
            documento: pagamento.numero_comprovante,
            forma_pagamento: pagamento.forma_pagamento_nome,
            conta_bancaria: pagamento.conta_bancaria,
            valor_debito: 0,
            valor_credito: pagamento.valor_pagamento,
            status: 'pago',
            observacoes: pagamento.observacoes,
            criado_em: pagamento.data_pagamento,
            pagamento_id: pagamento.pagamento_id,
            conta_id: pagamento.conta_pagar_id
          });
        }
      });

      // Ordenar cronologicamente
      lancamentosCombinados.sort((a, b) => 
        dayjs(a.data).diff(dayjs(b.data)) || dayjs(a.criado_em).diff(dayjs(b.criado_em))
      );

      // Calcular saldo acumulado
      let saldoAcumulado = 0;
      const lancamentosProcessados: LancamentoKardex[] = lancamentosCombinados.map(lanc => {
        saldoAcumulado += (lanc.valor_debito - lanc.valor_credito);
        
        return {
          tipo: lanc.tipo,
          data: lanc.data,
          descricao: lanc.descricao,
          documento: lanc.documento,
          categoria: lanc.categoria,
          centro_custo: lanc.centro_custo,
          forma_pagamento: lanc.forma_pagamento,
          conta_bancaria: lanc.conta_bancaria,
          valor_debito: lanc.valor_debito,
          valor_credito: lanc.valor_credito,
          saldo_acumulado: saldoAcumulado,
          status: lanc.status,
          observacoes: lanc.observacoes,
          criado_em: lanc.criado_em
        };
      });

      setLancamentos(lancamentosProcessados);
      calcularIndicadores(contasData || [], pagamentosData || []);
      prepararDadosGrafico(lancamentosProcessados);

    } catch (err) {
      console.error('Error fetching supplier kardex:', err);
      setError('Erro ao carregar kardex do fornecedor');
      setLancamentos([]);
    } finally {
      setLoading(false);
    }
  };

  const calcularIndicadores = (contas: any[], pagamentos: any[]) => {
    const totalComprado = contas.reduce((sum, c) => sum + c.valor_total, 0);
    const totalPago = pagamentos.reduce((sum, p) => sum + p.valor_pagamento, 0);
    const saldoPendente = totalComprado - totalPago;
    const totalContas = contas.length;
    const contasVencidas = contas.filter(c => c.esta_vencida).length;
    const valorVencido = contas.filter(c => c.esta_vencida).reduce((sum, c) => sum + c.saldo_restante, 0);
    const ticketMedio = totalContas > 0 ? totalComprado / totalContas : 0;
    
    // Calcular prazo médio de pagamento
    const contasPagas = contas.filter(c => c.status === 'pago');
    const prazoMedioPagamento = contasPagas.length > 0
      ? contasPagas.reduce((sum, c) => {
          const pagamentosConta = pagamentos.filter(p => p.conta_pagar_id === c.id);
          if (pagamentosConta.length > 0) {
            const primeiroPagamento = pagamentosConta.sort((a, b) => dayjs(a.data_pagamento).diff(dayjs(b.data_pagamento)))[0];
            return sum + dayjs(primeiroPagamento.data_pagamento).diff(dayjs(c.data_emissao), 'days');
          }
          return sum;
        }, 0) / contasPagas.length
      : 0;

    const valores = contas.map(c => c.valor_total).filter(v => v > 0);
    const maiorCompra = valores.length > 0 ? Math.max(...valores) : 0;
    const menorCompra = valores.length > 0 ? Math.min(...valores) : 0;

    setIndicadores({
      total_comprado: totalComprado,
      total_pago: totalPago,
      saldo_pendente: saldoPendente,
      total_contas: totalContas,
      contas_vencidas: contasVencidas,
      valor_vencido: valorVencido,
      ticket_medio: ticketMedio,
      prazo_medio_pagamento: prazoMedioPagamento,
      maior_compra: maiorCompra,
      menor_compra: menorCompra
    });
  };

  const prepararDadosGrafico = (lancamentos: LancamentoKardex[]) => {
    // Agrupar por mês para o gráfico
    const dadosPorMes: { [key: string]: {
      compras: number;
      pagamentos: number;
      saldo_final: number;
    } } = {};

    lancamentos.forEach(lanc => {
      const mes = dayjs(lanc.data).format('MM/YYYY');
      
      if (!dadosPorMes[mes]) {
        dadosPorMes[mes] = {
          compras: 0,
          pagamentos: 0,
          saldo_final: lanc.saldo_acumulado
        };
      }

      if (lanc.tipo === 'conta_pagar') {
        dadosPorMes[mes].compras += lanc.valor_debito;
      } else {
        dadosPorMes[mes].pagamentos += lanc.valor_credito;
      }

      // Usar o último saldo do mês
      dadosPorMes[mes].saldo_final = lanc.saldo_acumulado;
    });

    const dadosArray = Object.entries(dadosPorMes)
      .map(([periodo, valores]) => ({
        periodo,
        compras: valores.compras,
        pagamentos: valores.pagamentos,
        saldo_acumulado: valores.saldo_final
      }))
      .slice(-12); // Últimos 12 meses

    setDadosGrafico(dadosArray);
  };

  const exportarKardex = () => {
    if (!fornecedorSelecionado || lancamentos.length === 0) {
      alert('Selecione um fornecedor e certifique-se de que há lançamentos para exportar');
      return;
    }

    const reportGenerator = new ReportGenerator({
      title: 'Kardex Financeiro do Fornecedor',
      subtitle: `Fornecedor: ${fornecedorSelecionado.nome} | Período: ${dayjs(dataInicial).format('DD/MM/YYYY')} a ${dayjs(dataFinal).format('DD/MM/YYYY')}`,
      filename: `kardex-fornecedor-${fornecedorSelecionado.nome.replace(/\s+/g, '-')}-${dayjs().format('YYYY-MM-DD')}.pdf`,
      orientation: 'landscape'
    });

    let currentY = reportGenerator.addHeader(
      'Kardex Financeiro do Fornecedor',
      `Fornecedor: ${fornecedorSelecionado.nome} | Período: ${dayjs(dataInicial).format('DD/MM/YYYY')} a ${dayjs(dataFinal).format('DD/MM/YYYY')}`
    );

    // Informações do fornecedor
    const infoFornecedor = [
      ['Nome', fornecedorSelecionado.nome],
      ['CNPJ', fornecedorSelecionado.cnpj || '-'],
      ['Telefone', fornecedorSelecionado.telefone || '-'],
      ['Email', fornecedorSelecionado.email || '-'],
      ['Responsável', fornecedorSelecionado.responsavel || '-'],
      ['Status', fornecedorSelecionado.status === 'ativo' ? 'Ativo' : 'Inativo']
    ];

    currentY = reportGenerator.addSection('Dados do Fornecedor', [], currentY);
    currentY = reportGenerator.addTable(['Campo', 'Valor'], infoFornecedor, currentY);

    // Resumo financeiro
    if (indicadores) {
      const resumo = [
        ['Total Comprado', formatCurrency(indicadores.total_comprado)],
        ['Total Pago', formatCurrency(indicadores.total_pago)],
        ['Saldo Pendente', formatCurrency(indicadores.saldo_pendente)],
        ['Total de Contas', indicadores.total_contas.toString()],
        ['Contas Vencidas', `${indicadores.contas_vencidas} (${formatCurrency(indicadores.valor_vencido)})`],
        ['Ticket Médio', formatCurrency(indicadores.ticket_medio)],
        ['Prazo Médio Pagamento', `${indicadores.prazo_medio_pagamento.toFixed(0)} dias`],
        ['Maior Compra', formatCurrency(indicadores.maior_compra)],
        ['Menor Compra', formatCurrency(indicadores.menor_compra)]
      ];

      currentY = reportGenerator.addSection('Resumo Financeiro', [], currentY + 10);
      currentY = reportGenerator.addTable(['Indicador', 'Valor'], resumo, currentY);
    }

    // Kardex detalhado
    const headers = [
      'Data',
      'Tipo',
      'Descrição',
      'Documento',
      'Débito (Compras)',
      'Crédito (Pagtos)',
      'Saldo Acumulado',
      'Status'
    ];

    const data = lancamentos.map(lanc => [
      dayjs(lanc.data).format('DD/MM/YYYY'),
      lanc.tipo === 'conta_pagar' ? 'Compra' : 'Pagamento',
      lanc.descricao,
      lanc.documento || '-',
      lanc.valor_debito > 0 ? formatCurrency(lanc.valor_debito) : '-',
      lanc.valor_credito > 0 ? formatCurrency(lanc.valor_credito) : '-',
      formatCurrency(lanc.saldo_acumulado),
      lanc.status || '-'
    ]);

    currentY = reportGenerator.addSection('Kardex Detalhado', [], currentY + 10);
    reportGenerator.addTable(headers, data, currentY);

    reportGenerator.save(`kardex-fornecedor-${fornecedorSelecionado.nome.replace(/\s+/g, '-')}-${dayjs().format('YYYY-MM-DD')}.pdf`);
  };

  const exportarExcel = () => {
    if (!fornecedorSelecionado || lancamentos.length === 0) {
      alert('Selecione um fornecedor e certifique-se de que há lançamentos para exportar');
      return;
    }

    const headers = [
      'Data',
      'Hora',
      'Tipo',
      'Descrição',
      'Documento',
      'Categoria',
      'Centro de Custo',
      'Forma de Pagamento',
      'Conta Bancária',
      'Débito (Compras)',
      'Crédito (Pagamentos)',
      'Saldo Acumulado',
      'Status',
      'Observações'
    ];

    const data = lancamentos.map(lanc => [
      dayjs(lanc.data).format('DD/MM/YYYY'),
      dayjs(lanc.criado_em).format('HH:mm'),
      lanc.tipo === 'conta_pagar' ? 'Compra' : 'Pagamento',
      lanc.descricao,
      lanc.documento || '',
      lanc.categoria || '',
      lanc.centro_custo || '',
      lanc.forma_pagamento || '',
      lanc.conta_bancaria || '',
      lanc.valor_debito,
      lanc.valor_credito,
      lanc.saldo_acumulado,
      lanc.status || '',
      lanc.observacoes || ''
    ]);

    const fileName = `kardex-fornecedor-${fornecedorSelecionado.nome.replace(/\s+/g, '-')}-${dayjs().format('YYYY-MM-DD')}`;
    exportToExcel(data, fileName, headers);
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getStatusColor = (status?: string) => {
    switch (status) {
      case 'pago':
        return 'text-green-400 bg-green-900/30';
      case 'em_aberto':
        return 'text-blue-400 bg-blue-900/30';
      case 'parcialmente_pago':
        return 'text-yellow-400 bg-yellow-900/30';
      case 'vencido':
        return 'text-red-400 bg-red-900/30';
      case 'cancelado':
        return 'text-white/70 bg-white/10';
      default:
        return 'text-white/70 bg-white/10';
    }
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'pago':
        return <CheckCircle className="w-4 h-4" />;
      case 'em_aberto':
        return <Clock className="w-4 h-4" />;
      case 'parcialmente_pago':
        return <AlertTriangle className="w-4 h-4" />;
      case 'vencido':
        return <XCircle className="w-4 h-4" />;
      case 'cancelado':
        return <FileText className="w-4 h-4" />;
      default:
        return <Activity className="w-4 h-4" />;
    }
  };

  const getStatusText = (status?: string) => {
    switch (status) {
      case 'pago':
        return 'Pago';
      case 'em_aberto':
        return 'Em Aberto';
      case 'parcialmente_pago':
        return 'Parcialmente Pago';
      case 'vencido':
        return 'Vencido';
      case 'cancelado':
        return 'Cancelado';
      default:
        return status || '-';
    }
  };

  const getTipoIcon = (tipo: string) => {
    return tipo === 'conta_pagar' ? <Package className="w-4 h-4" /> : <Receipt className="w-4 h-4" />;
  };

  const getTipoColor = (tipo: string) => {
    return tipo === 'conta_pagar' ? 'text-blue-400 bg-blue-900/30' : 'text-green-400 bg-green-900/30';
  };

  const filteredFornecedores = fornecedores.filter(f => 
    f.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.cnpj?.includes(searchTerm) ||
    f.email?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  if (!fornecedorSelecionado) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h3 className="text-lg font-medium text-white">Kardex Financeiro do Fornecedor</h3>
        </div>

        {error && (
          <div className="p-4 bg-red-900/30 text-red-400 rounded-lg border border-red-700/40">
            {error}
          </div>
        )}

        {/* Seleção de Fornecedor */}
        <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
          <h4 className="text-md font-medium text-white mb-4">Selecionar Fornecedor</h4>
          
          <div className="mb-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar por nome, CNPJ ou email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFornecedores.map((fornecedor) => (
              <div
                key={fornecedor.id}
                onClick={() => setFornecedorSelecionado(fornecedor)}
                className="p-4 border border-white/10 rounded-lg hover:border-[#7D1F2C] hover:shadow-md cursor-pointer transition-all duration-200"
              >
                <div className="flex items-start">
                  <div className="p-2 bg-blue-500/15 rounded-lg mr-3">
                    <Building2 className="w-5 h-5 text-blue-400" />
                  </div>
                  <div className="flex-1">
                    <h5 className="font-medium text-white">{fornecedor.nome}</h5>
                    {fornecedor.cnpj && (
                      <p className="text-sm text-white/60">CNPJ: {fornecedor.cnpj}</p>
                    )}
                    {fornecedor.email && (
                      <p className="text-sm text-white/60">{fornecedor.email}</p>
                    )}
                    {fornecedor.telefone && (
                      <p className="text-sm text-white/60">{fornecedor.telefone}</p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {filteredFornecedores.length === 0 && (
            <div className="text-center py-8">
              <Building2 className="w-12 h-12 text-white/40 mx-auto mb-4" />
              <p className="text-white/50">
                {searchTerm ? 'Nenhum fornecedor encontrado' : 'Nenhum fornecedor cadastrado'}
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
            onClick={() => setFornecedorSelecionado(null)}
            className="mr-4 p-2 text-white/60 hover:text-white/90 hover:bg-white/10 rounded-lg"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h3 className="text-lg font-medium text-white">
            Kardex Financeiro - {fornecedorSelecionado.nome}
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
        <div className="p-4 bg-red-900/30 text-red-400 rounded-lg border border-red-700/40">
          {error}
        </div>
      )}

      {/* Dados do Fornecedor */}
      <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
        <h4 className="text-md font-medium text-white mb-4 flex items-center">
          <Building2 className="w-5 h-5 mr-2 text-[#7D1F2C]" />
          Dados do Fornecedor
        </h4>
        
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div>
            <h5 className="text-sm font-medium text-white/50 mb-2">Informações Básicas</h5>
            <div className="space-y-1">
              <p className="font-medium text-white">{fornecedorSelecionado.nome}</p>
              {fornecedorSelecionado.cnpj && (
                <p className="text-sm text-white/60">CNPJ: {fornecedorSelecionado.cnpj}</p>
              )}
              {fornecedorSelecionado.responsavel && (
                <p className="text-sm text-white/60">Responsável: {fornecedorSelecionado.responsavel}</p>
              )}
            </div>
          </div>

          <div>
            <h5 className="text-sm font-medium text-white/50 mb-2">Contato</h5>
            <div className="space-y-1">
              {fornecedorSelecionado.telefone && (
                <div className="flex items-center text-sm text-white/60">
                  <Phone className="w-4 h-4 mr-2" />
                  {fornecedorSelecionado.telefone}
                </div>
              )}
              {fornecedorSelecionado.email && (
                <div className="flex items-center text-sm text-white/60">
                  <Mail className="w-4 h-4 mr-2" />
                  {fornecedorSelecionado.email}
                </div>
              )}
            </div>
          </div>

          <div>
            <h5 className="text-sm font-medium text-white/50 mb-2">Totais do Período</h5>
            {indicadores && (
              <div className="space-y-1">
                <p className="text-sm">
                  <span className="text-white/60">Total Comprado:</span>
                  <span className="font-medium text-white ml-2">
                    {formatCurrency(indicadores.total_comprado)}
                  </span>
                </p>
                <p className="text-sm">
                  <span className="text-white/60">Total Pago:</span>
                  <span className="font-medium text-green-400 ml-2">
                    {formatCurrency(indicadores.total_pago)}
                  </span>
                </p>
                <p className="text-sm">
                  <span className="text-white/60">Ticket Médio:</span>
                  <span className="font-medium text-white ml-2">
                    {formatCurrency(indicadores.ticket_medio)}
                  </span>
                </p>
              </div>
            )}
          </div>

          <div>
            <h5 className="text-sm font-medium text-white/50 mb-2">Situação Atual</h5>
            {indicadores && (
              <div className="space-y-1">
                <p className="text-sm">
                  <span className="text-white/60">Saldo Pendente:</span>
                  <span className={`font-medium ml-2 ${
                    indicadores.saldo_pendente > 0 ? 'text-red-400' : 'text-green-400'
                  }`}>
                    {formatCurrency(indicadores.saldo_pendente)}
                  </span>
                </p>
                <p className="text-sm">
                  <span className="text-white/60">Prazo Médio:</span>
                  <span className="font-medium text-white ml-2">
                    {indicadores.prazo_medio_pagamento.toFixed(0)} dias
                  </span>
                </p>
                {indicadores.contas_vencidas > 0 && (
                  <p className="text-sm">
                    <span className="text-white/60">Vencidas:</span>
                    <span className="font-medium text-red-400 ml-2">
                      {indicadores.contas_vencidas} contas
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Indicadores */}
      {indicadores && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <Package className="w-8 h-8 text-blue-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Total Comprado</p>
                <p className="text-2xl font-bold text-blue-400">
                  {formatCurrency(indicadores.total_comprado)}
                </p>
                <p className="text-sm text-white/60">{indicadores.total_contas} compras</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <CheckCircle className="w-8 h-8 text-green-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Total Pago</p>
                <p className="text-2xl font-bold text-green-400">
                  {formatCurrency(indicadores.total_pago)}
                </p>
                <p className="text-sm text-white/60">
                  {indicadores.total_comprado > 0 ? ((indicadores.total_pago / indicadores.total_comprado) * 100).toFixed(1) : 0}% pago
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <Clock className="w-8 h-8 text-orange-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Saldo Pendente</p>
                <p className="text-2xl font-bold text-orange-400">
                  {formatCurrency(indicadores.saldo_pendente)}
                </p>
                <p className="text-sm text-white/60">A pagar</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <XCircle className="w-8 h-8 text-red-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Contas Vencidas</p>
                <p className="text-2xl font-bold text-red-400">
                  {indicadores.contas_vencidas}
                </p>
                <p className="text-sm text-white/60">
                  {formatCurrency(indicadores.valor_vencido)}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-[#12141f] p-4 rounded-lg border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Data Inicial
            </label>
            <input
              type="date"
              value={dataInicial}
              onChange={(e) => setDataInicial(e.target.value)}
              className="w-full rounded-md bg-white/5 border border-white/20 text-white focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
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
              className="w-full rounded-md bg-white/5 border border-white/20 text-white focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Tipo de Lançamento
            </label>
            <select
              value={tipoLancamentoFilter}
              onChange={(e) => setTipoLancamentoFilter(e.target.value)}
              className="w-full rounded-md bg-white/5 border border-white/20 text-white focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            >
              <option value="all">Todos os Lançamentos</option>
              <option value="conta_pagar">Compras</option>
              <option value="pagamento">Pagamentos</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Status
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="w-full rounded-md bg-white/5 border border-white/20 text-white focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            >
              <option value="all">Todos os Status</option>
              <option value="em_aberto">Em Aberto</option>
              <option value="parcialmente_pago">Parcialmente Pago</option>
              <option value="pago">Pago</option>
              <option value="vencido">Vencido</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Categoria
            </label>
            <select
              value={categoriaFilter}
              onChange={(e) => setCategoriaFilter(e.target.value)}
              className="w-full rounded-md bg-white/5 border border-white/20 text-white focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            >
              <option value="all">Todas as Categorias</option>
              {categorias.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.caminho_completo || cat.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={fetchKardexFornecedor}
              className="w-full px-4 py-2 bg-[#7D1F2C] text-white rounded-md hover:bg-[#6a1a25]"
            >
              <Filter className="w-4 h-4 inline mr-2" />
              Filtrar
            </button>
          </div>
        </div>
      </div>

      {/* Gráfico de Evolução */}
      {dadosGrafico.length > 0 && (
        <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
          <h4 className="text-lg font-medium text-white mb-4">
            Evolução Financeira
          </h4>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dadosGrafico}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="periodo" />
                <YAxis />
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
                <Bar dataKey="compras" fill="#dc2626" name="Compras" />
                <Bar dataKey="pagamentos" fill="#059669" name="Pagamentos" />
                <Line 
                  type="monotone" 
                  dataKey="saldo_acumulado" 
                  stroke="#7D1F2C" 
                  strokeWidth={3}
                  name="Saldo Acumulado"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Kardex Detalhado */}
      <div className="bg-[#12141f] rounded-lg border border-white/10">
        <div className="p-6">
          <h4 className="text-lg font-medium text-white mb-4 flex items-center">
            <FileText className="w-5 h-5 mr-2 text-[#7D1F2C]" />
            Kardex Detalhado (Estilo Extrato Bancário)
          </h4>

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]"></div>
            </div>
          ) : (
            <>
              {lancamentos.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left bg-white/5 border-b border-white/10">
                        <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Data</th>
                        <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Tipo</th>
                        <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Descrição</th>
                        <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Documento</th>
                        <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Categoria</th>
                        <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Débito</th>
                        <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Crédito</th>
                        <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Saldo</th>
                        <th className="px-4 py-3 text-xs font-medium text-white/50 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-transparent divide-y divide-white/10">
                      {lancamentos.map((lanc, index) => (
                        <tr key={index} className={`hover:bg-white/5 ${
                          lanc.tipo === 'pagamento' ? 'bg-green-500/10' : ''
                        }`}>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {dayjs(lanc.data).format('DD/MM/YYYY')}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getTipoColor(lanc.tipo)}`}>
                              {getTipoIcon(lanc.tipo)}
                              <span className="ml-1">
                                {lanc.tipo === 'conta_pagar' ? 'Compra' : 'Pagamento'}
                              </span>
                            </span>
                          </td>
                          <td className="px-4 py-3 max-w-xs">
                            <div className="font-medium text-white truncate">{lanc.descricao}</div>
                            {lanc.observacoes && (
                              <div className="text-xs text-white/50 truncate">{lanc.observacoes}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-sm">
                            {lanc.documento || '-'}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            <div>{lanc.categoria || '-'}</div>
                            {lanc.centro_custo && (
                              <div className="text-xs text-white/50">{lanc.centro_custo}</div>
                            )}
                            {lanc.forma_pagamento && (
                              <div className="text-xs text-blue-400">{lanc.forma_pagamento}</div>
                            )}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            {lanc.valor_debito > 0 ? (
                              <span className="font-medium text-red-400">
                                {formatCurrency(lanc.valor_debito)}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            {lanc.valor_credito > 0 ? (
                              <span className="font-medium text-green-400">
                                {formatCurrency(lanc.valor_credito)}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap text-right">
                            <span className={`font-bold ${
                              lanc.saldo_acumulado >= 0 ? 'text-white' : 'text-red-400'
                            }`}>
                              {formatCurrency(lanc.saldo_acumulado)}
                            </span>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {lanc.status && (
                              <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(lanc.status)}`}>
                                {getStatusIcon(lanc.status)}
                                <span className="ml-1">{getStatusText(lanc.status)}</span>
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  
                  {/* Totalizadores */}
                  <div className="mt-4 p-4 bg-white/5 rounded-lg border-t-2 border-[#7D1F2C]">
                    <div className="grid grid-cols-3 gap-4 text-center">
                      <div>
                        <span className="text-sm text-white/60">Total Débitos (Compras)</span>
                        <div className="text-lg font-bold text-red-400">
                          {formatCurrency(lancamentos.reduce((sum, l) => sum + l.valor_debito, 0))}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm text-white/60">Total Créditos (Pagamentos)</span>
                        <div className="text-lg font-bold text-green-400">
                          {formatCurrency(lancamentos.reduce((sum, l) => sum + l.valor_credito, 0))}
                        </div>
                      </div>
                      <div>
                        <span className="text-sm text-white/60">Saldo Final</span>
                        <div className={`text-lg font-bold ${
                          (indicadores?.saldo_pendente || 0) >= 0 ? 'text-white' : 'text-red-400'
                        }`}>
                          {formatCurrency(indicadores?.saldo_pendente || 0)}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-12">
                  <FileText className="w-16 h-16 text-white/40 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-white mb-2">Nenhum lançamento encontrado</h3>
                  <p className="text-white/50">
                    Não há lançamentos registrados para este fornecedor no período selecionado.
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

export default KardexFornecedor;