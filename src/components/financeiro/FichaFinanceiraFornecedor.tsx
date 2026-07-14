import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft,
  Search,
  Filter,
  Download,
  FileText,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  Building2,
  Phone,
  Mail,
  FileX,
  Eye,
  CreditCard,
  Banknote,
  ShoppingCart,
  Receipt,
  History,
  Package
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
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

interface ContaPagar {
  id: string;
  data_emissao: string;
  data_vencimento: string;
  numero_documento?: string;
  descricao: string;
  valor_total: number;
  valor_pago: number;
  saldo_restante: number;
  status: string;
  categoria_nome?: string;
  centro_custo_nome?: string;
  forma_pagamento_nome?: string;
  esta_vencida: boolean;
  dias_vencimento: number;
  ultimo_pagamento?: string;
}

interface Pagamento {
  id: string;
  data_pagamento: string;
  valor_pagamento: number;
  forma_pagamento_nome?: string;
  conta_bancaria?: string;
  numero_comprovante?: string;
  observacoes?: string;
  descricao_conta: string;
}

interface IndicadoresFornecedor {
  total_comprado: number;
  total_pago: number;
  saldo_pendente: number;
  total_contas: number;
  contas_vencidas: number;
  valor_vencido: number;
  ticket_medio: number;
}

interface FiltrosPeriodo {
  dataInicial: string;
  dataFinal: string;
  status: string;
  centroCusto: string;
  formaPagamento: string;
}

const FichaFinanceiraFornecedor: React.FC = () => {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<Fornecedor | null>(null);
  const [contasPagar, setContasPagar] = useState<ContaPagar[]>([]);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [indicadores, setIndicadores] = useState<IndicadoresFornecedor | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'compras' | 'pagamentos'>('compras');
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filtros, setFiltros] = useState<FiltrosPeriodo>({
    dataInicial: dayjs().subtract(1, 'year').format('YYYY-MM-DD'),
    dataFinal: dayjs().format('YYYY-MM-DD'),
    status: 'all',
    centroCusto: 'all',
    formaPagamento: 'all'
  });
  
  // Dados para filtros
  const [centrosCusto, setCentrosCusto] = useState<any[]>([]);
  const [formasPagamento, setFormasPagamento] = useState<any[]>([]);

  useEffect(() => {
    fetchFornecedores();
    fetchDadosFiltros();
  }, []);

  useEffect(() => {
    if (fornecedorSelecionado) {
      fetchDadosFornecedor();
    }
  }, [fornecedorSelecionado, filtros]);

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

  const fetchDadosFiltros = async () => {
    try {
      const [centros, formas] = await Promise.all([
        supabase.from('centros_custo').select('*').eq('status', 'ativo'),
        supabase.from('formas_pagamento').select('*').eq('status', 'ativo')
      ]);

      setCentrosCusto(centros.data || []);
      setFormasPagamento(formas.data || []);
    } catch (err) {
      console.error('Error fetching filter data:', err);
    }
  };

  const fetchDadosFornecedor = async () => {
    if (!fornecedorSelecionado) return;

    try {
      setLoading(true);
      setError(null);

      // Buscar contas a pagar (histórico de compras)
      let queryContas = supabase
        .from('vw_contas_pagar')
        .select('*')
        .eq('fornecedor_id', fornecedorSelecionado.id);

      // Aplicar filtros de data
      if (filtros.dataInicial) {
        queryContas = queryContas.gte('data_emissao', filtros.dataInicial);
      }
      if (filtros.dataFinal) {
        queryContas = queryContas.lte('data_emissao', filtros.dataFinal);
      }

      // Aplicar outros filtros
      if (filtros.status !== 'all') {
        queryContas = queryContas.eq('status', filtros.status);
      }
      if (filtros.centroCusto !== 'all') {
        queryContas = queryContas.eq('centro_custo_id', filtros.centroCusto);
      }
      if (filtros.formaPagamento !== 'all') {
        queryContas = queryContas.eq('forma_pagamento_id', filtros.formaPagamento);
      }

      const { data: contasData, error: contasError } = await queryContas
        .order('data_emissao', { ascending: false });

      if (contasError) throw contasError;

      // Buscar pagamentos (histórico de pagamentos)
      const { data: pagamentosData, error: pagamentosError } = await supabase
        .from('vw_pagamentos_fornecedor')
        .select('*')
        .eq('fornecedor_id', fornecedorSelecionado.id)
        .gte('data_pagamento', filtros.dataInicial)
        .lte('data_pagamento', filtros.dataFinal)
        .order('data_pagamento', { ascending: false });

      if (pagamentosError) throw pagamentosError;

      // Processar dados dos pagamentos
      const pagamentosProcessados = (pagamentosData || []).map(p => ({
        id: p.pagamento_id,
        data_pagamento: p.data_pagamento,
        valor_pagamento: p.valor_pagamento,
        forma_pagamento_nome: p.forma_pagamento_nome,
        conta_bancaria: p.conta_bancaria,
        numero_comprovante: p.numero_comprovante,
        observacoes: p.observacoes,
        descricao_conta: p.conta_descricao || 'Conta não encontrada'
      }));

      // Adicionar data do último pagamento às contas
      const contasComUltimoPagamento = (contasData || []).map(conta => {
        const pagamentosConta = pagamentosProcessados.filter(p => 
          pagamentosData?.find(pd => pd.pagamento_id === p.id)?.conta_pagar_id === conta.id
        );
        const ultimoPagamento = pagamentosConta.length > 0 
          ? pagamentosConta.sort((a, b) => dayjs(b.data_pagamento).diff(dayjs(a.data_pagamento)))[0]
          : null;

        return {
          ...conta,
          ultimo_pagamento: ultimoPagamento?.data_pagamento
        };
      });

      setContasPagar(contasComUltimoPagamento);
      setPagamentos(pagamentosProcessados);

      // Calcular indicadores
      calcularIndicadores(contasComUltimoPagamento);

    } catch (err) {
      console.error('Error fetching supplier data:', err);
      setError('Erro ao carregar dados do fornecedor');
    } finally {
      setLoading(false);
    }
  };

  const calcularIndicadores = (contas: ContaPagar[]) => {
    const totalComprado = contas.reduce((sum, conta) => sum + conta.valor_total, 0);
    const totalPago = contas.reduce((sum, conta) => sum + conta.valor_pago, 0);
    const saldoPendente = contas.reduce((sum, conta) => sum + conta.saldo_restante, 0);
    const totalContas = contas.length;
    const contasVencidas = contas.filter(c => c.esta_vencida).length;
    const valorVencido = contas.filter(c => c.esta_vencida).reduce((sum, conta) => sum + conta.saldo_restante, 0);
    const ticketMedio = totalContas > 0 ? totalComprado / totalContas : 0;

    setIndicadores({
      total_comprado: totalComprado,
      total_pago: totalPago,
      saldo_pendente: saldoPendente,
      total_contas: totalContas,
      contas_vencidas: contasVencidas,
      valor_vencido: valorVencido,
      ticket_medio: ticketMedio
    });
  };

  const exportarFicha = () => {
    // TODO: Implementar exportação em PDF/Excel
    console.log('Exportar ficha financeira');
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pago':
        return 'text-green-400 bg-green-900/30';
      case 'em_aberto':
        return 'text-white/60 bg-blue-900/30';
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

  const getStatusIcon = (status: string) => {
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
        return <FileX className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getStatusText = (status: string) => {
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
        return 'Desconhecido';
    }
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
          <h3 className="text-lg font-medium text-white">Ficha Financeira do Fornecedor</h3>
        </div>

        {error && (
          <div className="p-4 bg-red-900/30 text-red-400 rounded-lg border border-red-700/40">
            {error}
          </div>
        )}

        {/* Busca de Fornecedores */}
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
                  <div className="p-2 bg-[#7D1F2C]/20 rounded-lg mr-3">
                    <Building2 className="w-5 h-5 text-white/60" />
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
            Ficha Financeira - {fornecedorSelecionado.nome}
          </h3>
        </div>
        <button
          onClick={exportarFicha}
          className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25]"
        >
          <Download className="w-4 h-4 inline mr-2" />
          Exportar Ficha
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 text-red-400 rounded-lg border border-red-700/40">
          {error}
        </div>
      )}

      {/* Visão Geral do Fornecedor */}
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
            <h5 className="text-sm font-medium text-white/50 mb-2">Totais Históricos</h5>
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
                  <span className="text-white/60">Contas em Aberto:</span>
                  <span className="font-medium text-white ml-2">
                    {indicadores.total_contas - contasPagar.filter(c => c.status === 'pago').length}
                  </span>
                </p>
                {indicadores.contas_vencidas > 0 && (
                  <p className="text-sm">
                    <span className="text-white/60">Contas Vencidas:</span>
                    <span className="font-medium text-red-400 ml-2">
                      {indicadores.contas_vencidas} ({formatCurrency(indicadores.valor_vencido)})
                    </span>
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Indicadores do Período */}
      {indicadores && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <ShoppingCart className="w-8 h-8 text-white/60 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Total Comprado</p>
                <p className="text-2xl font-bold text-white/60">
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
                  {indicadores.total_comprado > 0 ? ((indicadores.total_pago / indicadores.total_comprado) * 100).toFixed(1) : 0}% do total
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
                <p className="text-sm text-white/60">
                  {contasPagar.filter(c => c.status !== 'pago').length} contas abertas
                </p>
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
              value={filtros.dataInicial}
              onChange={(e) => setFiltros({ ...filtros, dataInicial: e.target.value })}
              className="w-full rounded-md bg-white/5 border border-white/20 text-white focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Data Final
            </label>
            <input
              type="date"
              value={filtros.dataFinal}
              onChange={(e) => setFiltros({ ...filtros, dataFinal: e.target.value })}
              className="w-full rounded-md bg-white/5 border border-white/20 text-white focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Status
            </label>
            <select
              value={filtros.status}
              onChange={(e) => setFiltros({ ...filtros, status: e.target.value })}
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
              Centro de Custo
            </label>
            <select
              value={filtros.centroCusto}
              onChange={(e) => setFiltros({ ...filtros, centroCusto: e.target.value })}
              className="w-full rounded-md bg-white/5 border border-white/20 text-white focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            >
              <option value="all">Todos os Centros</option>
              {centrosCusto.map((cc) => (
                <option key={cc.id} value={cc.id}>
                  {cc.nome}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/80 mb-1">
              Forma de Pagamento
            </label>
            <select
              value={filtros.formaPagamento}
              onChange={(e) => setFiltros({ ...filtros, formaPagamento: e.target.value })}
              className="w-full rounded-md bg-white/5 border border-white/20 text-white focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
            >
              <option value="all">Todas as Formas</option>
              {formasPagamento.map((fp) => (
                <option key={fp.id} value={fp.id}>
                  {fp.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={fetchDadosFornecedor}
              className="w-full px-4 py-2 bg-[#7D1F2C] text-white rounded-md hover:bg-[#6a1a25]"
            >
              <Filter className="w-4 h-4 inline mr-2" />
              Filtrar
            </button>
          </div>
        </div>
      </div>

      {/* Tabs para Histórico de Compras e Pagamentos */}
      <div className="bg-[#12141f] rounded-lg border border-white/10">
        <div className="border-b border-white/10">
          <nav className="flex space-x-8 px-6">
            <button
              onClick={() => setActiveTab('compras')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'compras'
                  ? 'border-[#7D1F2C] text-[#7D1F2C]'
                  : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/20'
              }`}
            >
              <Package className="w-5 h-5 inline mr-2" />
              Histórico de Compras ({contasPagar.length})
            </button>
            <button
              onClick={() => setActiveTab('pagamentos')}
              className={`py-4 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'pagamentos'
                  ? 'border-[#7D1F2C] text-[#7D1F2C]'
                  : 'border-transparent text-white/50 hover:text-white/80 hover:border-white/20'
              }`}
            >
              <Receipt className="w-5 h-5 inline mr-2" />
              Histórico de Pagamentos ({pagamentos.length})
            </button>
          </nav>
        </div>

        <div className="p-6">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]"></div>
            </div>
          ) : (
            <>
              {/* Histórico de Compras (Contas a Pagar) */}
              {activeTab === 'compras' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-lg font-medium text-white flex items-center">
                      <ShoppingCart className="w-5 h-5 mr-2 text-[#7D1F2C]" />
                      Histórico de Compras
                    </h4>
                    <div className="text-sm text-white/50">
                      Total: {formatCurrency(contasPagar.reduce((sum, c) => sum + c.valor_total, 0))}
                    </div>
                  </div>

                  {contasPagar.length > 0 ? (
                    <div className="space-y-3">
                      {contasPagar.map((conta) => (
                        <div key={conta.id} className="p-4 border border-white/10 rounded-lg hover:bg-white/5 transition-colors">
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1">
                              <div className="flex items-center mb-2">
                                {getStatusIcon(conta.status)}
                                <span className="ml-2 font-medium text-white">
                                  {conta.numero_documento || `Compra ${conta.id.slice(0, 8)}`}
                                </span>
                                <span className={`ml-2 px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(conta.status)}`}>
                                  {getStatusText(conta.status)}
                                </span>
                                {conta.esta_vencida && (
                                  <span className="ml-2 px-2 py-1 text-xs font-medium rounded-full bg-red-500/15 text-red-400">
                                    Vencida há {conta.dias_vencimento} dias
                                  </span>
                                )}
                              </div>
                              <p className="text-white/80 mb-2">{conta.descricao}</p>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm text-white/60">
                                <div>
                                  <span className="font-medium">Emissão:</span>
                                  <br />
                                  {dayjs(conta.data_emissao).format('DD/MM/YYYY')}
                                </div>
                                <div>
                                  <span className={`font-medium ${conta.esta_vencida ? 'text-red-400' : ''}`}>
                                    Vencimento:
                                  </span>
                                  <br />
                                  <span className={conta.esta_vencida ? 'text-red-400' : ''}>
                                    {dayjs(conta.data_vencimento).format('DD/MM/YYYY')}
                                  </span>
                                </div>
                                {conta.categoria_nome && (
                                  <div>
                                    <span className="font-medium">Categoria:</span>
                                    <br />
                                    {conta.categoria_nome}
                                  </div>
                                )}
                                {conta.centro_custo_nome && (
                                  <div>
                                    <span className="font-medium">Centro de Custo:</span>
                                    <br />
                                    {conta.centro_custo_nome}
                                  </div>
                                )}
                              </div>
                              {conta.ultimo_pagamento && (
                                <div className="mt-2 text-sm text-green-400">
                                  <History className="w-4 h-4 inline mr-1" />
                                  Último pagamento: {dayjs(conta.ultimo_pagamento).format('DD/MM/YYYY')}
                                </div>
                              )}
                            </div>
                            <div className="text-right ml-6">
                              <div className="text-lg font-bold text-white mb-1">
                                {formatCurrency(conta.valor_total)}
                              </div>
                              {conta.valor_pago > 0 && (
                                <div className="text-sm text-green-400 mb-1">
                                  <CheckCircle className="w-4 h-4 inline mr-1" />
                                  Pago: {formatCurrency(conta.valor_pago)}
                                </div>
                              )}
                              {conta.saldo_restante > 0 && (
                                <div className={`text-sm font-medium ${
                                  conta.esta_vencida ? 'text-red-400' : 'text-orange-400'
                                }`}>
                                  <Clock className="w-4 h-4 inline mr-1" />
                                  Saldo: {formatCurrency(conta.saldo_restante)}
                                </div>
                              )}
                              {conta.status === 'pago' && (
                                <div className="text-sm text-green-400">
                                  <CheckCircle className="w-4 h-4 inline mr-1" />
                                  Quitado
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Package className="w-16 h-16 text-white/40 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-white mb-2">Nenhuma compra encontrada</h3>
                      <p className="text-white/50">
                        Não há compras registradas para este fornecedor no período selecionado.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Histórico de Pagamentos */}
              {activeTab === 'pagamentos' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-lg font-medium text-white flex items-center">
                      <Receipt className="w-5 h-5 mr-2 text-[#7D1F2C]" />
                      Histórico de Pagamentos
                    </h4>
                    <div className="text-sm text-white/50">
                      Total: {formatCurrency(pagamentos.reduce((sum, p) => sum + p.valor_pagamento, 0))}
                    </div>
                  </div>

                  {pagamentos.length > 0 ? (
                    <div className="space-y-3">
                      {pagamentos.map((pagamento) => (
                        <div key={pagamento.id} className="p-4 border border-white/10 rounded-lg hover:bg-white/5 transition-colors">
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1">
                              <div className="flex items-center mb-2">
                                <CheckCircle className="w-5 h-5 text-green-500" />
                                <span className="ml-2 font-medium text-white">
                                  Pagamento - {dayjs(pagamento.data_pagamento).format('DD/MM/YYYY')}
                                </span>
                                <span className="ml-2 px-2 py-1 text-xs font-medium rounded-full bg-green-500/15 text-green-400">
                                  Realizado
                                </span>
                              </div>
                              <p className="text-white/80 mb-2">{pagamento.descricao_conta}</p>
                              <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm text-white/60">
                                {pagamento.forma_pagamento_nome && (
                                  <div>
                                    <span className="font-medium">Forma de Pagamento:</span>
                                    <br />
                                    {pagamento.forma_pagamento_nome}
                                  </div>
                                )}
                                {pagamento.conta_bancaria && (
                                  <div>
                                    <span className="font-medium">Conta/Banco:</span>
                                    <br />
                                    {pagamento.conta_bancaria}
                                  </div>
                                )}
                                {pagamento.numero_comprovante && (
                                  <div>
                                    <span className="font-medium">Comprovante:</span>
                                    <br />
                                    {pagamento.numero_comprovante}
                                  </div>
                                )}
                              </div>
                              {pagamento.observacoes && (
                                <div className="mt-2 text-sm text-white/60">
                                  <span className="font-medium">Observações:</span> {pagamento.observacoes}
                                </div>
                              )}
                            </div>
                            <div className="text-right ml-6">
                              <div className="text-lg font-bold text-green-400">
                                {formatCurrency(pagamento.valor_pagamento)}
                              </div>
                              <div className="text-sm text-white/50">
                                {dayjs(pagamento.data_pagamento).format('DD/MM/YYYY')}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12">
                      <Receipt className="w-16 h-16 text-white/40 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-white mb-2">Nenhum pagamento encontrado</h3>
                      <p className="text-white/50">
                        Não há pagamentos registrados para este fornecedor no período selecionado.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default FichaFinanceiraFornecedor;