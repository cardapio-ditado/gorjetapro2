import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft,
  Search,
  Filter,
  Download,
  Calendar,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Clock,
  CheckCircle,
  XCircle,
  Building2,
  Phone,
  Mail,
  FileText,
  Package,
  Receipt,
  ArrowDown,
  ArrowUp
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

interface ExtratoItem {
  tipo: 'conta_pagar' | 'pagamento';
  data: string;
  descricao: string;
  documento?: string;
  valor_total: number;
  valor_pago: number;
  saldo_restante: number;
  status: string;
  categoria?: string;
  centro_custo?: string;
  observacoes?: string;
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

const KardexFinanceiroFornecedor: React.FC = () => {
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [fornecedorSelecionado, setFornecedorSelecionado] = useState<Fornecedor | null>(null);
  const [extrato, setExtrato] = useState<ExtratoItem[]>([]);
  const [indicadores, setIndicadores] = useState<IndicadoresFornecedor | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [filtros, setFiltros] = useState<FiltrosPeriodo>({
    dataInicial: dayjs().subtract(3, 'month').format('YYYY-MM-DD'),
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

      // Buscar extrato do fornecedor
      let queryExtrato = supabase.rpc('obter_extrato_fornecedor', {
        p_fornecedor_id: fornecedorSelecionado.id
      });

      // Aplicar filtros de data
      if (filtros.dataInicial && filtros.dataInicial.trim() !== '') {
        queryExtrato = supabase.rpc('obter_extrato_fornecedor', {
          p_fornecedor_id: fornecedorSelecionado.id,
          p_data_inicial: filtros.dataInicial,
          p_data_final: filtros.dataFinal && filtros.dataFinal.trim() !== '' ? filtros.dataFinal : null
        });
      }

      const { data: extratoData, error: extratoError } = await queryExtrato;

      if (extratoError) throw extratoError;

      // Buscar indicadores do fornecedor
      const { data: indicadoresData, error: indicadoresError } = await supabase
        .from('vw_indicadores_fornecedor')
        .select('*')
        .eq('fornecedor_id', fornecedorSelecionado.id)
        .single();

      if (indicadoresError) throw indicadoresError;

      setExtrato(extratoData || []);
      setIndicadores(indicadoresData);

    } catch (err) {
      console.error('Error fetching supplier data:', err);
      setError('Erro ao carregar dados do fornecedor');
    } finally {
      setLoading(false);
    }
  };

  const exportarKardex = () => {
    // TODO: Implementar exportação em PDF/Excel
    console.log('Exportar kardex financeiro');
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
        return 'text-[#7D1F2C] bg-blue-900/30';
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
        return <Clock className="w-4 h-4" />;
      case 'vencido':
        return <XCircle className="w-4 h-4" />;
      case 'cancelado':
        return <FileText className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
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

  const getTipoIcon = (tipo: string) => {
    return tipo === 'conta_pagar' ? <Package className="w-4 h-4" /> : <Receipt className="w-4 h-4" />;
  };

  const getTipoColor = (tipo: string) => {
    return tipo === 'conta_pagar' ? 'text-[#7D1F2C] bg-blue-900/30' : 'text-green-400 bg-green-900/30';
  };

  const getTipoText = (tipo: string) => {
    return tipo === 'conta_pagar' ? 'Compra' : 'Pagamento';
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
                    <Building2 className="w-5 h-5 text-[#7D1F2C]" />
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
        <button
          onClick={exportarKardex}
          className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25]"
        >
          <Download className="w-4 h-4 inline mr-2" />
          Exportar Kardex
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
                    {indicadores.total_contas - (indicadores.total_contas - indicadores.contas_vencidas)}
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

      {/* Kardex (Extrato) */}
      <div className="bg-[#12141f] rounded-lg border border-white/10">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <h4 className="text-lg font-medium text-white flex items-center">
              <FileText className="w-5 h-5 mr-2 text-[#7D1F2C]" />
              Kardex Financeiro
            </h4>
            <div className="text-sm text-white/50">
              {extrato.length} lançamentos no período
            </div>
          </div>

          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]"></div>
            </div>
          ) : (
            <>
              {extrato.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left bg-white/5 border-b border-white/10">
                        <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                          Data
                        </th>
                        <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                          Tipo
                        </th>
                        <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                          Descrição
                        </th>
                        <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                          Documento
                        </th>
                        <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                          Valor
                        </th>
                        <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                          Categoria
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-transparent divide-y divide-white/10">
                      {extrato.map((item, index) => (
                        <tr key={index} className={`hover:bg-white/5 ${
                          item.tipo === 'pagamento' ? 'bg-green-500/5' : ''
                        }`}>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {dayjs(item.data).format('DD/MM/YYYY')}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getTipoColor(item.tipo)}`}>
                              {getTipoIcon(item.tipo)}
                              <span className="ml-1">{getTipoText(item.tipo)}</span>
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="font-medium text-white">{item.descricao}</div>
                            {item.observacoes && (
                              <div className="text-sm text-white/50">{item.observacoes}</div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {item.documento || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {item.tipo === 'conta_pagar' ? (
                              <div>
                                <div className="font-medium text-white">
                                  {formatCurrency(item.valor_total)}
                                </div>
                                {item.valor_pago > 0 && (
                                  <div className="text-sm text-green-400">
                                    <ArrowDown className="w-3 h-3 inline mr-1" />
                                    Pago: {formatCurrency(item.valor_pago)}
                                  </div>
                                )}
                                {item.saldo_restante > 0 && (
                                  <div className="text-sm text-orange-400">
                                    <Clock className="w-3 h-3 inline mr-1" />
                                    Saldo: {formatCurrency(item.saldo_restante)}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <div className="font-medium text-green-400">
                                <ArrowUp className="w-4 h-4 inline mr-1" />
                                {formatCurrency(item.valor_pago)}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(item.status)}`}>
                              {getStatusIcon(item.status)}
                              <span className="ml-1">{getStatusText(item.status)}</span>
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {item.categoria || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
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

export default KardexFinanceiroFornecedor;