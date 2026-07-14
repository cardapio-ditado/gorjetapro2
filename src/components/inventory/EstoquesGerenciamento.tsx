import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, CreditCard as Edit, Trash2, Eye, Package, DollarSign, AlertTriangle, CheckCircle, Download, FileText, Warehouse, MapPin, BarChart3, TrendingUp, Activity, Target, Zap, ShoppingCart, AlertCircle } from 'lucide-react';
import { supabase, testConnection } from '../../lib/supabase';
import { exportToExcel, ReportGenerator } from '../../utils/reportGenerator';
import dayjs from 'dayjs';

interface Estoque {
  id: string;
  nome: string;
  descricao?: string;
  localizacao?: string;
  tipo: string;
  status: boolean;
  criado_em: string;
  atualizado_em: string;
}

interface SaldoEstoque {
  item_id: string;
  item_nome: string;
  item_codigo?: string;
  unidade_medida: string;
  quantidade_atual: number;
  valor_total: number;
  custo_medio: number;
  abaixo_minimo: boolean;
  estoque_minimo: number;
}

interface FormData {
  nome: string;
  descricao: string;
  localizacao: string;
  tipo: 'central' | 'producao' | 'secundario' | 'geral';
  status: boolean;
}

interface IndicadoresEstoque {
  total_estoques: number;
  estoques_ativos: number;
  valor_total_geral: number;
  itens_total: number;
  itens_criticos: number;
  tipos_diferentes: number;
}

const EstoquesGerenciamento: React.FC = () => {
  const [estoques, setEstoques] = useState<Estoque[]>([]);
  const [saldosEstoque, setSaldosEstoque] = useState<SaldoEstoque[]>([]);
  const [estoqueSelecionado, setEstoqueSelecionado] = useState<Estoque | null>(null);
  const [indicadores, setIndicadores] = useState<IndicadoresEstoque | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingEstoque, setEditingEstoque] = useState<Estoque | null>(null);
  const [showSaldos, setShowSaldos] = useState(false);
  
  // Shopping List states
  const [showListaCompras, setShowListaCompras] = useState(false);
  const [itensParaCompra, setItensParaCompra] = useState<any[]>([]);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ativo' | 'inativo'>('all');
  
  const [formData, setFormData] = useState<FormData>({
    nome: '',
    descricao: '',
    localizacao: '',
    tipo: 'geral',
    status: true
  });

  useEffect(() => {
    fetchData();
    fetchIndicadores();
  }, []);

  useEffect(() => {
    fetchData();
  }, [tipoFilter, statusFilter]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Test connection first
      const isConnected = await testConnection();
      if (!isConnected) {
        console.warn('Supabase connection not available');
        setEstoques([]);
        setError('Conexão com o banco de dados não disponível. Verifique suas configurações.');
        return;
      }

      let query = supabase.from('estoques').select('*');

      // Aplicar filtros
      if (tipoFilter !== 'all') {
        query = query.eq('tipo', tipoFilter);
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter === 'ativo');
      }

      const { data, error } = await query.order('nome');

      if (error) throw error;
      setEstoques(data || []);
    } catch (err) {
      console.error('Error fetching stocks:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar estoques');
    } finally {
      setLoading(false);
    }
  };

  const fetchSaldosEstoque = async (estoqueId: string) => {
    try {
      setLoading(true);
      setError(null);

      // Buscar saldos do estoque com dados dos itens
      const { data, error } = await supabase
        .from('saldos_estoque')
        .select(`
          *,
          itens_estoque (
            id,
            codigo,
            nome,
            unidade_medida,
            estoque_minimo,
            custo_medio
          )
        `)
        .eq('estoque_id', estoqueId)
        .gt('quantidade_atual', 0)
        .order('itens_estoque(nome)');

      if (error) throw error;

      const saldosProcessados: SaldoEstoque[] = (data || []).map(item => ({
        item_id: item.item_id,
        item_nome: item.itens_estoque?.nome || 'Item não encontrado',
        item_codigo: item.itens_estoque?.codigo,
        unidade_medida: item.itens_estoque?.unidade_medida || 'un',
        quantidade_atual: item.quantidade_atual || 0,
        valor_total: item.valor_total || 0,
        custo_medio: item.itens_estoque?.custo_medio || 0,
        abaixo_minimo: (item.quantidade_atual || 0) < (item.itens_estoque?.estoque_minimo || 0),
        estoque_minimo: item.itens_estoque?.estoque_minimo || 0
      }));

      setSaldosEstoque(saldosProcessados);
    } catch (err) {
      console.error('Error fetching stock balances:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar saldos do estoque');
      setSaldosEstoque([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchIndicadores = async () => {
    try {
      const { data: estoquesData, error: estoquesError } = await supabase
        .from('estoques')
        .select('*');

      if (estoquesError) throw estoquesError;

      const { data: saldosData, error: saldosError } = await supabase
        .from('vw_estoque_atual')
        .select('*');

      if (saldosError) throw saldosError;

      const totalEstoques = (estoquesData || []).length;
      const estoquesAtivos = (estoquesData || []).filter(e => e.status).length;
      const valorTotalGeral = (saldosData || []).reduce((sum, s) => sum + (s.valor_total || 0), 0);
      const itensTotal = (saldosData || []).length;
      const itensCriticos = (saldosData || []).filter(s => s.abaixo_minimo).length;
      const tiposDiferentes = new Set((estoquesData || []).map(e => e.tipo)).size;

      setIndicadores({
        total_estoques: totalEstoques,
        estoques_ativos: estoquesAtivos,
        valor_total_geral: valorTotalGeral,
        itens_total: itensTotal,
        itens_criticos: itensCriticos,
        tipos_diferentes: tiposDiferentes
      });
    } catch (err) {
      console.error('Error fetching indicators:', err);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);

      // Validações
      if (!formData.nome) {
        throw new Error('Nome do estoque é obrigatório');
      }

      if (editingEstoque) {
        const { error } = await supabase
          .from('estoques')
          .update({ ...formData, atualizado_em: new Date().toISOString() })
          .eq('id', editingEstoque.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('estoques')
          .insert([formData]);

        if (error) throw error;
      }

      setShowForm(false);
      setEditingEstoque(null);
      resetForm();
      fetchData();
      fetchIndicadores();
    } catch (err) {
      console.error('Error saving stock:', err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar estoque');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este estoque?')) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('estoques')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchData();
      fetchIndicadores();
    } catch (err) {
      console.error('Error deleting stock:', err);
      setError(err instanceof Error ? err.message : 'Erro ao excluir estoque');
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (estoque: Estoque) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('estoques')
        .update({ 
          status: !estoque.status,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', estoque.id);

      if (error) throw error;
      fetchData();
      fetchIndicadores();
    } catch (err) {
      console.error('Error updating status:', err);
      setError(err instanceof Error ? err.message : 'Erro ao atualizar status');
    } finally {
      setLoading(false);
    }
  };

  const openForm = (estoque?: Estoque) => {
    if (estoque) {
      setEditingEstoque(estoque);
      setFormData({
        nome: estoque.nome,
        descricao: estoque.descricao || '',
        localizacao: estoque.localizacao || '',
        tipo: estoque.tipo as any,
        status: estoque.status
      });
    } else {
      setEditingEstoque(null);
      resetForm();
    }
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      nome: '',
      descricao: '',
      localizacao: '',
      tipo: 'geral',
      status: true
    });
  };

  const visualizarEstoque = async (estoque: Estoque) => {
    setEstoqueSelecionado(estoque);
    setShowSaldos(true);
    await fetchSaldosEstoque(estoque.id);
  };

  const filteredEstoques = estoques.filter(estoque => {
    const matchesSearch = estoque.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         estoque.descricao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         estoque.localizacao?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getTipoColor = (tipo: string) => {
    switch (tipo) {
      case 'central':
        return 'text-blue-300 bg-blue-900/30';
      case 'producao':
        return 'text-green-300 bg-green-900/30';
      case 'secundario':
        return 'text-purple-400 bg-purple-500/15';
      case 'geral':
        return 'text-white/80 bg-white/10';
      default:
        return 'text-white/80 bg-white/10';
    }
  };

  const getTipoText = (tipo: string) => {
    switch (tipo) {
      case 'central':
        return 'Central';
      case 'producao':
        return 'Produção';
      case 'secundario':
        return 'Secundário';
      case 'geral':
        return 'Geral';
      default:
        return tipo;
    }
  };

  const exportData = () => {
    if (filteredEstoques.length === 0) {
      alert('Não há dados para exportar');
      return;
    }

    const headers = [
      'Nome',
      'Tipo',
      'Localização',
      'Descrição',
      'Status',
      'Criado em'
    ];

    const data = filteredEstoques.map(estoque => [
      estoque.nome,
      getTipoText(estoque.tipo),
      estoque.localizacao || '',
      estoque.descricao || '',
      estoque.status ? 'Ativo' : 'Inativo',
      dayjs(estoque.criado_em).format('DD/MM/YYYY')
    ]);

    const fileName = `estoques-${dayjs().format('YYYY-MM-DD')}`;
    exportToExcel(data, fileName, headers);
  };

  const exportSaldos = () => {
    if (saldosEstoque.length === 0) {
      alert('Não há dados para exportar');
      return;
    }

    const headers = [
      'Item',
      'Código',
      'Quantidade Atual',
      'Unidade',
      'Valor Total',
      'Custo Médio',
      'Estoque Mínimo',
      'Status'
    ];

    const data = saldosEstoque.map(saldo => [
      saldo.item_nome,
      saldo.item_codigo || '',
      saldo.quantidade_atual,
      saldo.unidade_medida,
      saldo.valor_total,
      saldo.custo_medio,
      saldo.estoque_minimo,
      saldo.abaixo_minimo ? 'CRÍTICO' : 'OK'
    ]);

    const fileName = `saldos-${estoqueSelecionado?.nome.replace(/\s+/g, '-')}-${dayjs().format('YYYY-MM-DD')}`;
    exportToExcel(data, fileName, headers);
  };

  const gerarListaCompras = async (estoque: Estoque) => {
    try {
      setLoading(true);
      setEstoqueSelecionado(estoque);

      // Buscar TODOS os itens cadastrados (apenas insumos, não produtos finais de ficha técnica)
      const { data: todosItens, error: errorItens } = await supabase
        .from('itens_estoque')
        .select(`
          id,
          codigo,
          nome,
          categoria,
          fornecedor,
          unidade_medida,
          estoque_minimo,
          ponto_reposicao,
          custo_medio,
          tipo_item
        `)
        .eq('status', 'ativo')
        .eq('tipo_item', 'insumo');

      if (errorItens) throw errorItens;

      // Buscar saldos existentes para este estoque
      const { data: saldos, error: errorSaldos } = await supabase
        .from('saldos_estoque')
        .select('item_id, quantidade_atual')
        .eq('estoque_id', estoque.id);

      if (errorSaldos) throw errorSaldos;

      // Buscar custo médio real das últimas compras
      const { data: custosCompras, error: errorCustos } = await supabase
        .from('itens_entrada_compra')
        .select('item_id, custo_unitario');

      if (errorCustos) throw errorCustos;

      // Calcular média de custos por item
      const custosMap = new Map();
      if (custosCompras && custosCompras.length > 0) {
        const custosPorItem = custosCompras.reduce((acc, c) => {
          if (!acc[c.item_id]) acc[c.item_id] = [];
          acc[c.item_id].push(c.custo_unitario);
          return acc;
        }, {} as Record<string, number[]>);

        Object.entries(custosPorItem).forEach(([itemId, custos]) => {
          const media = custos.reduce((sum, c) => sum + c, 0) / custos.length;
          custosMap.set(itemId, media);
        });
      }

      // Criar mapa de saldos para lookup rápido
      const saldosMap = new Map(
        (saldos || []).map(s => [s.item_id, s.quantidade_atual || 0])
      );

      console.log('📊 Total de insumos (não inclui produtos de ficha técnica):', todosItens?.length || 0);
      console.log('📦 Itens com saldo neste estoque:', saldos?.length || 0);

      const itensNecessarios = (todosItens || [])
        .map(item => {
          // Se não tem saldo registrado, considerar como 0
          const quantidadeAtual = saldosMap.get(item.id) || 0;
          return { item, quantidadeAtual };
        })
        .filter(({ item, quantidadeAtual }) => {
          const estoqueMinimo = item.estoque_minimo || 0;
          const pontoReposicao = item.ponto_reposicao || estoqueMinimo;

          // Incluir item se: estoque zerado OU quantidade atual <= ponto de reposição
          return quantidadeAtual === 0 || quantidadeAtual <= pontoReposicao;
        })
        .map(({ item, quantidadeAtual }) => {
          const estoqueMinimo = item.estoque_minimo || 0;
          const pontoReposicao = item.ponto_reposicao || estoqueMinimo;

          // Calcular quantidade sugerida: estoque mínimo + 25%
          // Se estoque mínimo for 0, usar valor base de 10 unidades
          const baseCalculo = estoqueMinimo > 0 ? estoqueMinimo : 10;
          const quantidadeIdeal = Math.ceil(baseCalculo * 1.25);
          const quantidadeSugerida = Math.max(quantidadeIdeal - quantidadeAtual, 0);

          // Usar custo médio das compras se disponível, senão usar o cadastrado
          const custoMedio = custosMap.get(item.id) || item.custo_medio || 0;

          return {
            item_id: item.id,
            item_nome: item.nome,
            item_codigo: item.codigo || '',
            categoria: item.categoria || 'Sem Categoria',
            fornecedor: item.fornecedor || 'Não definido',
            unidade_medida: item.unidade_medida || 'un',
            quantidade_atual: quantidadeAtual,
            estoque_minimo: estoqueMinimo,
            ponto_reposicao: pontoReposicao,
            quantidade_sugerida: quantidadeSugerida,
            custo_medio: custoMedio,
            criticidade: quantidadeAtual === 0 || quantidadeAtual < estoqueMinimo ? 'CRÍTICO' : 'BAIXO'
          };
        })
        .sort((a, b) => {
          // Ordenar por criticidade (crítico primeiro) e depois por nome
          if (a.criticidade === 'CRÍTICO' && b.criticidade !== 'CRÍTICO') return -1;
          if (a.criticidade !== 'CRÍTICO' && b.criticidade === 'CRÍTICO') return 1;
          return (a.item_nome || '').localeCompare(b.item_nome || '');
        });

      console.log('🛒 Itens filtrados para lista de compras:', itensNecessarios.length);
      console.log('🔍 Itens críticos:', itensNecessarios.filter(i => i.criticidade === 'CRÍTICO').length);

      setItensParaCompra(itensNecessarios);
      setShowListaCompras(true);
    } catch (err) {
      console.error('Error generating shopping list:', err);
      setError(err instanceof Error ? err.message : 'Erro ao gerar lista de compras');
    } finally {
      setLoading(false);
    }
  };

  const gerarListaComprasPDF = () => {
    if (!estoqueSelecionado || itensParaCompra.length === 0) return;

    try {
     const fileName = `lista-compras-${estoqueSelecionado.nome.replace(/\s+/g, '-')}-${dayjs().format('YYYY-MM-DD')}`;
     
      const reportGenerator = new ReportGenerator({ 
        orientation: 'landscape',
        title: 'Lista de Compras',
        filename: fileName
      });


      // Calcular resumo
      const itensCriticos = itensParaCompra.filter(i => i.criticidade === 'CRÍTICO').length;
      const itensBaixo = itensParaCompra.filter(i => i.criticidade === 'BAIXO').length;
      const valorTotalEstimado = itensParaCompra.reduce((sum, item) => 
        sum + ((item.itens_estoque?.custo_medio || 0) * item.quantidade_sugerida), 0
      );

      // Dados resumo
      const resumoData = [
        ['Itens Críticos (abaixo do mínimo)', itensCriticos.toString()],
        ['Itens com Estoque Baixo', itensBaixo.toString()],
        ['Valor Total Estimado', formatCurrency(valorTotalEstimado)]
      ];

      // Agrupar por fornecedor
      const itensPorFornecedor = itensParaCompra.reduce((acc, item) => {
        const fornecedor = item.fornecedor || 'Fornecedor não definido';
        if (!acc[fornecedor]) {
          acc[fornecedor] = [];
        }
        acc[fornecedor].push(item);
        return acc;
      }, {} as any);

      let currentY = reportGenerator.addHeader(
        'LISTA DE COMPRAS',
        `Estoque: ${estoqueSelecionado.nome} - ${dayjs().format('DD/MM/YYYY HH:mm')}`
      );
      
      // Adicionar resumo
      currentY = reportGenerator.addSection('Resumo da Lista de Compras', [], currentY);
      currentY = reportGenerator.addTable(['Descrição', 'Quantidade'], resumoData, currentY);

      // Adicionar itens por fornecedor
      Object.entries(itensPorFornecedor).forEach(([fornecedor, itens]: [string, any[]]) => {
        currentY = reportGenerator.addSection(`${fornecedor} (${itens.length} itens)`, [], currentY + 10);
        
        const tableData = itens.map(item => [
          item.criticidade || '',
          item.item_codigo || '',
          item.item_nome || '',
          item.categoria || '',
          `${(item.quantidade_atual || 0).toFixed(3)} ${item.unidade_medida}`,
          `${item.estoque_minimo || 0} ${item.unidade_medida}`,
          `${item.quantidade_sugerida || 0} ${item.unidade_medida}`,
          formatCurrency((item.itens_estoque?.custo_medio || 0) * item.quantidade_sugerida)
        ]);

        const headers = ['Status', 'Código', 'Item', 'Categoria', 'Atual', 'Mínimo', 'Sugerido', 'Valor Est.'];
        currentY = reportGenerator.addTable(headers, tableData, currentY);
      });
      reportGenerator.addFooter(`Total de fornecedores: ${Object.keys(itensPorFornecedor).length}`);

      reportGenerator.save(fileName);
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Erro ao gerar PDF. Tente novamente.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-white">Gerenciamento de Estoques</h3>
        <div className="flex gap-2">
          <button
            onClick={exportData}
            className="px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white/80 hover:bg-white/10"
          >
            <Download className="w-4 h-4 inline mr-2" />
            Exportar Excel
          </button>
          <button
            onClick={() => openForm()}
            className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25]"
          >
            <Plus className="w-4 h-4 inline mr-2" />
            Novo Estoque
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 text-red-300 rounded-lg border border-red-500/30">
          {error}
        </div>
      )}

      {/* Indicadores */}
      {indicadores && (
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <Warehouse className="w-8 h-8 text-blue-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Total Estoques</p>
                <p className="text-2xl font-bold text-blue-400">
                  {indicadores.total_estoques}
                </p>
                <p className="text-sm text-white/50">Cadastrados</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <CheckCircle className="w-8 h-8 text-green-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Estoques Ativos</p>
                <p className="text-2xl font-bold text-green-400">
                  {indicadores.estoques_ativos}
                </p>
                <p className="text-sm text-white/50">Em operação</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <DollarSign className="w-8 h-8 text-purple-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Valor Total</p>
                <p className="text-2xl font-bold text-purple-400">
                  {formatCurrency(indicadores.valor_total_geral)}
                </p>
                <p className="text-sm text-white/50">Todos os estoques</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <Package className="w-8 h-8 text-teal-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Total Itens</p>
                <p className="text-2xl font-bold text-teal-400">
                  {indicadores.itens_total}
                </p>
                <p className="text-sm text-white/50">Em estoque</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <AlertTriangle className="w-8 h-8 text-red-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Itens Críticos</p>
                <p className="text-2xl font-bold text-red-400">
                  {indicadores.itens_criticos}
                </p>
                <p className="text-sm text-white/50">Abaixo do mínimo</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <Target className="w-8 h-8 text-orange-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Tipos</p>
                <p className="text-2xl font-bold text-orange-400">
                  {indicadores.tipos_diferentes}
                </p>
                <p className="text-sm text-white/50">Diferentes</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-[#12141f] p-4 rounded-lg border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/30 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar estoques..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-white/20 rounded-lg bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
              />
            </div>
          </div>

          <div>
            <select
              value={tipoFilter}
              onChange={(e) => setTipoFilter(e.target.value)}
              className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            >
              <option value="all">Todos os Tipos</option>
              <option value="central">Central</option>
              <option value="producao">Produção</option>
              <option value="secundario">Secundário</option>
              <option value="geral">Geral</option>
            </select>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            >
              <option value="all">Todos os Status</option>
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>

          <div>
            <button
              onClick={fetchData}
              className="w-full px-4 py-2 bg-[#7D1F2C] text-white rounded-md hover:bg-[#6a1a25]"
            >
              <Filter className="w-4 h-4 inline mr-2" />
              Filtrar
            </button>
          </div>
        </div>
      </div>

      {/* Lista de Estoques */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]"></div>
        </div>
      ) : (
        <div className="bg-[#12141f] rounded-lg border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left bg-white/5 border-b">
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Estoque
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Localização
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Criado em
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-[#12141f] divide-y divide-white/5">
                {filteredEstoques.map((estoque) => (
                  <tr key={estoque.id} className="hover:bg-white/10/5">
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-white">{estoque.nome}</div>
                        {estoque.descricao && (
                          <div className="text-sm text-white/40">{estoque.descricao}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTipoColor(estoque.tipo)}`}>
                        {getTipoText(estoque.tipo)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center text-sm text-white">
                        {estoque.localizacao && (
                          <>
                            <MapPin className="w-4 h-4 mr-1 text-white/30" />
                            {estoque.localizacao}
                          </>
                        )}
                        {!estoque.localizacao && (
                          <span className="text-white/30">-</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        estoque.status ? 'text-green-300 bg-green-900/30' : 'text-red-300 bg-red-900/30'
                      }`}>
                        {estoque.status ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white/50">
                        {dayjs(estoque.criado_em).format('DD/MM/YYYY')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => visualizarEstoque(estoque)}
                          className="text-purple-400 hover:text-purple-300"
                          title="Visualizar Itens"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => gerarListaCompras(estoque)}
                          className="text-green-400 hover:text-green-300"
                          title="Lista de Compras"
                        >
                          <ShoppingCart className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => openForm(estoque)}
                          className="text-blue-400 hover:text-blue-300"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleStatus(estoque)}
                          className={`${estoque.status ? 'text-green-400' : 'text-white/30'} hover:opacity-75`}
                          title={estoque.status ? 'Desativar' : 'Ativar'}
                        >
                          {estoque.status ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleDelete(estoque.id)}
                          className="text-red-400 hover:text-red-300"
                          title="Excluir"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredEstoques.length === 0 && (
            <div className="text-center py-12">
              <Warehouse className="w-16 h-16 text-white/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">Nenhum estoque encontrado</h3>
              <p className="text-white/40">
                {searchTerm || tipoFilter !== 'all' || statusFilter !== 'all'
                  ? 'Nenhum estoque corresponde aos filtros aplicados.'
                  : 'Nenhum estoque cadastrado.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Modal do Formulário */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0f1020] rounded-lg p-6 w-full max-w-2xl border border-white/10">
            <h3 className="text-lg font-medium text-white mb-4">
              {editingEstoque ? 'Editar Estoque' : 'Novo Estoque'}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Nome *
                </label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  required
                  placeholder="Ex: Estoque Principal, Estoque Bar, Estoque Cozinha"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Tipo *
                </label>
                <select
                  value={formData.tipo}
                  onChange={(e) => setFormData({ ...formData, tipo: e.target.value as any })}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  required
                >
                  <option value="geral">Geral</option>
                  <option value="central">Central</option>
                  <option value="producao">Produção</option>
                  <option value="secundario">Secundário</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Localização
                </label>
                <input
                  type="text"
                  value={formData.localizacao}
                  onChange={(e) => setFormData({ ...formData, localizacao: e.target.value })}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  placeholder="Ex: Térreo - Sala 1, Subsolo, Área Externa"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Descrição
                </label>
                <textarea
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  rows={3}
                  placeholder="Descrição detalhada do estoque..."
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="status"
                  checked={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.checked })}
                  className="rounded border-white/20 text-[#7D1F2C] focus:ring-[#7D1F2C]"
                />
                <label htmlFor="status" className="ml-2 text-sm text-white/80">
                  Estoque ativo
                </label>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-white/20 rounded-md text-white/80 hover:bg-white/10/5"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={loading || !formData.nome}
                className="px-4 py-2 bg-[#7D1F2C] text-white rounded-md hover:bg-[#6a1a25] disabled:opacity-50"
              >
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Visualização de Saldos */}
      {showSaldos && estoqueSelecionado && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0f1020] rounded-lg p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto border border-white/10">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-white">
                Itens em Estoque - {estoqueSelecionado.nome}
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={exportSaldos}
                  className="px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white/80 hover:bg-white/10"
                >
                  <Download className="w-4 h-4 inline mr-2" />
                  Exportar
                </button>
                <button
                  onClick={() => setShowSaldos(false)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  Fechar
                </button>
              </div>
            </div>

            {loading ? (
              <div className="flex justify-center items-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]"></div>
              </div>
            ) : (
              <>
                {saldosEstoque.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left bg-white/5 border-b">
                          <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                            Item
                          </th>
                          <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                            Código
                          </th>
                          <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                            Quantidade
                          </th>
                          <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                            Unidade
                          </th>
                          <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                            Valor Total
                          </th>
                          <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                            Custo Médio
                          </th>
                          <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                            Status
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-[#12141f] divide-y divide-white/5">
                        {saldosEstoque.map((saldo) => (
                          <tr key={saldo.item_id} className={`hover:bg-white/10/5 ${
                            saldo.abaixo_minimo ? 'bg-red-500/10 border-l-4 border-red-500' : ''
                          }`}>
                            <td className="px-6 py-4">
                              <div className="font-medium text-white">{saldo.item_nome}</div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-sm text-white">
                                {saldo.item_codigo || '-'}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className={`font-medium ${
                                saldo.abaixo_minimo ? 'text-red-400' : 'text-white'
                              }`}>
                                {saldo.quantidade_atual.toFixed(3)}
                              </div>
                              {saldo.abaixo_minimo && (
                                <div className="text-xs text-red-400">
                                  Mín: {saldo.estoque_minimo}
                                </div>
                              )}
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <span className="text-sm text-white">
                                {saldo.unidade_medida}
                              </span>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="font-medium text-white">
                                {formatCurrency(saldo.valor_total)}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              <div className="text-sm text-white">
                                {formatCurrency(saldo.custo_medio)}
                              </div>
                            </td>
                            <td className="px-6 py-4 whitespace-nowrap">
                              {saldo.abaixo_minimo ? (
                                <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full text-red-300 bg-red-900/30">
                                  <AlertTriangle className="w-3 h-3 mr-1" />
                                  CRÍTICO
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full text-green-300 bg-green-900/30">
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  OK
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Package className="w-16 h-16 text-white/30 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">Estoque vazio</h3>
                    <p className="text-white/40">
                      Este estoque não possui itens cadastrados.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Modal de Lista de Compras */}
      {showListaCompras && estoqueSelecionado && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0f1020] rounded-lg p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto border border-white/10">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-white">
                Lista de Compras - {estoqueSelecionado.nome}
              </h3>
              <div className="flex gap-2">
                <button
                  onClick={gerarListaComprasPDF}
                  className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25]"
                >
                  <Download className="w-4 h-4 inline mr-2" />
                  Gerar PDF
                </button>
                <button
                  onClick={() => setShowListaCompras(false)}
                  className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  Fechar
                </button>
              </div>
            </div>

            {/* Resumo da Lista */}
            <div className="bg-blue-500/10 p-4 rounded-lg mb-6 border border-blue-500/30">
              <h4 className="font-medium text-blue-300 mb-2">Resumo da Lista de Compras</h4>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-blue-400 font-medium">Total de Itens:</span>
                  <div className="text-lg font-bold text-blue-300">
                    {itensParaCompra.length}
                  </div>
                </div>
                <div>
                  <span className="text-blue-400 font-medium">Itens Críticos:</span>
                  <div className="text-lg font-bold text-red-400">
                    {itensParaCompra.filter(i => i.criticidade === 'CRÍTICO').length}
                  </div>
                </div>
                <div>
                  <span className="text-blue-400 font-medium">Estoque Baixo:</span>
                  <div className="text-lg font-bold text-yellow-400">
                    {itensParaCompra.filter(i => i.criticidade === 'BAIXO').length}
                  </div>
                </div>
                <div>
                  <span className="text-blue-400 font-medium">Valor Estimado:</span>
                  <div className="text-lg font-bold text-blue-300">
                    {formatCurrency(itensParaCompra.reduce((sum, item) =>
                      sum + ((item.custo_medio || 0) * item.quantidade_sugerida), 0
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {itensParaCompra.length === 0 ? (
              <div className="text-center py-8">
                <ShoppingCart className="w-16 h-16 text-white/30 mx-auto mb-4" />
                <p className="text-white/40">
                  Não há itens que precisam de reposição neste estoque.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-white/10">
                  <thead className="bg-white/5">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                        Item
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                        Categoria
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                        Fornecedor
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                        Atual
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                        Mínimo
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                        Sugerido
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                        Valor Est.
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-[#12141f] divide-y divide-white/5">
                    {itensParaCompra.map((item, index) => (
                      <tr key={index} className="hover:bg-white/10/5">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            {item.criticidade === 'CRÍTICO' ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-300">
                                <AlertCircle className="w-3 h-3 mr-1" />
                                CRÍTICO
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-300">
                                BAIXO
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div>
                            <div className="text-sm font-medium text-white">
                              {item.item_nome}
                            </div>
                            <div className="text-sm text-white/40">
                              {item.item_codigo}
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          {item.categoria || 'Sem Categoria'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          {item.fornecedor || 'Não definido'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          {(item.quantidade_atual || 0).toFixed(3)} {item.unidade_medida}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          {item.estoque_minimo || 0} {item.unidade_medida}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className="text-sm font-medium text-green-400">
                            {item.quantidade_sugerida} {item.unidade_medida}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          {formatCurrency((item.custo_medio || 0) * item.quantidade_sugerida)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EstoquesGerenciamento;