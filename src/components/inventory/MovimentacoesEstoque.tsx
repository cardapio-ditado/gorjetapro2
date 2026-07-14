import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, CreditCard as Edit, Trash2, Eye, ArrowLeftRight, ArrowUp, ArrowDown, RotateCcw, TrendingUp, TrendingDown, Package, DollarSign, AlertTriangle, CheckCircle, Download, FileText, Calendar, Building, Activity, Target, Zap, Sparkles, ShoppingCart } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { exportToExcel } from '../../utils/reportGenerator';
import dayjs from '../../lib/dayjs';
import ImportarVendasIA from './ImportarVendasIA';
import LancarVendasModal from './LancarVendasModal';
import { SearchableSelect } from '../common/SearchableSelect';

interface Movimentacao {
  id: string;
  estoque_origem_id?: string;
  estoque_destino_id?: string;
  item_id: string;
  tipo_movimentacao: 'entrada' | 'saida' | 'transferencia' | 'ajuste';
  quantidade: number;
  custo_unitario: number;
  custo_total: number;
  data_movimentacao: string;
  motivo?: string;
  observacoes?: string;
  criado_por?: string;
  criado_em: string;
  origem_tipo?: string;
  origem_id?: string;
  // Dados relacionados
  item_nome: string;
  item_codigo?: string;
  unidade_medida: string;
  estoque_origem_nome?: string;
  estoque_destino_nome?: string;
}

interface FormMovimentacao {
  tipo_movimentacao: 'entrada' | 'saida' | 'transferencia' | 'ajuste';
  item_id: string;
  estoque_origem_id: string;
  estoque_destino_id: string;
  quantidade: number;
  custo_unitario: number;
  data_movimentacao: string;
  motivo: string;
  observacoes: string;
  usar_ficha_tecnica: boolean;
  ficha_tecnica_id: string;
}

interface ItemMovimentacao {
  id: string;
  item_id: string;
  item_nome: string;
  unidade_medida: string;
  quantidade: number;
  custo_unitario: number;
  custo_total: number;
}

interface ItemDisponivel {
  id: string;
  codigo?: string;
  nome: string;
  unidade_medida: string;
  custo_medio: number;
  estoque_id: string;
  estoque_nome: string;
  quantidade_atual: number;
}

interface FichaTecnica {
  id: string;
  nome: string;
  tipo_consumo: string;
  custo_total: number;
  ativo: boolean;
}

interface IndicadoresMovimentacao {
  total_movimentacoes: number;
  movimentacoes_mes: number;
  entradas_mes: number;
  saidas_mes: number;
  transferencias_mes: number;
  ajustes_mes: number;
  valor_total_movimentado: number;
}

const MovimentacoesEstoque: React.FC = () => {
  const [movimentacoes, setMovimentacoes] = useState<Movimentacao[]>([]);
  const [itensDisponiveis, setItensDisponiveis] = useState<ItemDisponivel[]>([]);
  const [estoques, setEstoques] = useState<any[]>([]);
  const [fichasTecnicas, setFichasTecnicas] = useState<FichaTecnica[]>([]);
  const [indicadores, setIndicadores] = useState<IndicadoresMovimentacao | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingMovimentacao, setEditingMovimentacao] = useState<Movimentacao | null>(null);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFilter, setTipoFilter] = useState<'all' | 'entrada' | 'saida' | 'transferencia' | 'ajuste'>('all');
  const [estoqueFilter, setEstoqueFilter] = useState('all');
  const [itemFilter, setItemFilter] = useState('all');
  const [dataInicial, setDataInicial] = useState(dayjs().subtract(30, 'days').format('YYYY-MM-DD'));
  const [dataFinal, setDataFinal] = useState(dayjs().format('YYYY-MM-DD'));
  
  const [formData, setFormData] = useState<FormMovimentacao>({
    tipo_movimentacao: 'entrada',
    item_id: '',
    estoque_origem_id: '',
    estoque_destino_id: '',
    quantidade: 0,
    custo_unitario: 0,
    data_movimentacao: dayjs().format('YYYY-MM-DD'),
    motivo: '',
    observacoes: '',
    usar_ficha_tecnica: false,
    ficha_tecnica_id: ''
  });

  const [showImportarVendas, setShowImportarVendas] = useState(false);
  const [showLancarVendas, setShowLancarVendas] = useState(false);
  const [itensMovimentacao, setItensMovimentacao] = useState<ItemMovimentacao[]>([]);

  useEffect(() => {
    fetchData();
    fetchEstoques();
    fetchItensDisponiveis();
    fetchFichasTecnicas();
    fetchIndicadores();
  }, []);

  useEffect(() => {
    fetchData();
    fetchIndicadores();
  }, [tipoFilter, estoqueFilter, itemFilter, dataInicial, dataFinal]);

  useEffect(() => {
    // Atualizar itens disponíveis quando mudar o estoque de origem
    if (formData.estoque_origem_id && formData.tipo_movimentacao === 'transferencia') {
      fetchItensDisponiveis();
    }
  }, [formData.estoque_origem_id, formData.tipo_movimentacao]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Buscar diretamente da tabela movimentacoes_estoque com JOINs
      let query = supabase
        .from('movimentacoes_estoque')
        .select(`
          *,
          itens_estoque!inner(
            codigo,
            nome,
            unidade_medida
          ),
          estoque_origem:estoques!estoque_origem_id(nome),
          estoque_destino:estoques!estoque_destino_id(nome)
        `);

      // Aplicar filtros
      if (tipoFilter !== 'all') {
        query = query.eq('tipo_movimentacao', tipoFilter);
      }

      if (estoqueFilter !== 'all') {
        query = query.or(`estoque_origem_id.eq.${estoqueFilter},estoque_destino_id.eq.${estoqueFilter}`);
      }

      if (itemFilter !== 'all') {
        query = query.eq('item_id', itemFilter);
      }

      if (dataInicial) {
        query = query.gte('data_movimentacao', dataInicial);
      }

      if (dataFinal) {
        query = query.lte('data_movimentacao', dataFinal);
      }

      const { data, error } = await query.order('data_movimentacao', { ascending: false });

      if (error) throw error;

      const movimentacoesProcessadas: Movimentacao[] = (data || []).map(mov => ({
        id: mov.id,
        estoque_origem_id: mov.estoque_origem_id,
        estoque_destino_id: mov.estoque_destino_id,
        item_id: mov.item_id,
        tipo_movimentacao: mov.tipo_movimentacao,
        quantidade: mov.quantidade,
        custo_unitario: mov.custo_unitario,
        custo_total: mov.custo_total,
        data_movimentacao: mov.data_movimentacao,
        motivo: mov.motivo,
        observacoes: mov.observacoes,
        criado_por: mov.criado_por,
        criado_em: mov.criado_em,
        origem_tipo: mov.origem_tipo,
        origem_id: mov.origem_id,
        item_nome: mov.itens_estoque?.nome || 'Item não encontrado',
        item_codigo: mov.itens_estoque?.codigo,
        unidade_medida: mov.itens_estoque?.unidade_medida || 'un',
        estoque_origem_nome: mov.estoque_origem?.nome,
        estoque_destino_nome: mov.estoque_destino?.nome
      }));

      setMovimentacoes(movimentacoesProcessadas);
    } catch (err) {
      console.error('Error fetching movements:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar movimentações');
      setMovimentacoes([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchEstoques = async () => {
    try {
      const { data, error } = await supabase
        .from('estoques')
        .select('*')
        .eq('status', true)
        .order('nome');

      if (error) throw error;
      setEstoques(data || []);
    } catch (err) {
      console.error('Error fetching stocks:', err);
      setEstoques([]);
    }
  };

  const fetchItensDisponiveis = async () => {
    try {
      // Buscar saldos de estoque com informações dos itens
      const { data, error } = await supabase
        .from('saldos_estoque')
        .select(`
          *,
          itens_estoque!inner(
            id,
            codigo,
            nome,
            unidade_medida,
            custo_medio,
            status
          ),
          estoques!inner(
            id,
            nome
          )
        `)
        .gt('quantidade_atual', 0)
        .eq('itens_estoque.status', 'ativo')
        .eq('estoques.status', true)
        .order('itens_estoque(nome)');

      if (error) throw error;

      const itensProcessados: ItemDisponivel[] = (data || []).map(saldo => ({
        id: saldo.item_id,
        codigo: saldo.itens_estoque?.codigo,
        nome: saldo.itens_estoque?.nome || 'Item não encontrado',
        unidade_medida: saldo.itens_estoque?.unidade_medida || 'un',
        custo_medio: saldo.itens_estoque?.custo_medio || 0,
        estoque_id: saldo.estoque_id,
        estoque_nome: saldo.estoques?.nome || 'Estoque não encontrado',
        quantidade_atual: saldo.quantidade_atual || 0
      }));

      setItensDisponiveis(itensProcessados);
    } catch (err) {
      console.error('Error fetching available items:', err);
      setItensDisponiveis([]);
    }
  };

  const fetchFichasTecnicas = async () => {
    try {
      const { data, error } = await supabase
        .from('fichas_tecnicas')
        .select('id, nome, tipo_consumo, custo_total, ativo')
        .eq('ativo', true)
        .eq('tipo_consumo', 'venda_direta')
        .order('nome');

      if (error) throw error;
      setFichasTecnicas(data || []);
    } catch (err) {
      console.error('Error fetching fichas tecnicas:', err);
      setFichasTecnicas([]);
    }
  };

  const fetchIndicadores = async () => {
    try {
      // Aplicar os mesmos filtros que são usados no fetchData
      let query = supabase
        .from('movimentacoes_estoque')
        .select('tipo_movimentacao, custo_total, estoque_origem_id, estoque_destino_id, item_id, data_movimentacao');

      // Aplicar filtro de tipo
      if (tipoFilter !== 'all') {
        query = query.eq('tipo_movimentacao', tipoFilter);
      }

      // Aplicar filtro de estoque
      if (estoqueFilter !== 'all') {
        query = query.or(`estoque_origem_id.eq.${estoqueFilter},estoque_destino_id.eq.${estoqueFilter}`);
      }

      // Aplicar filtro de item
      if (itemFilter !== 'all') {
        query = query.eq('item_id', itemFilter);
      }

      // Aplicar filtro de data
      if (dataInicial) {
        query = query.gte('data_movimentacao', dataInicial);
      }

      if (dataFinal) {
        query = query.lte('data_movimentacao', dataFinal);
      }

      const { data: movimentacoesData, error } = await query;

      if (error) throw error;

      // Buscar total geral (sem filtro de data, mas com outros filtros)
      let queryTotal = supabase
        .from('movimentacoes_estoque')
        .select('custo_total');

      if (tipoFilter !== 'all') {
        queryTotal = queryTotal.eq('tipo_movimentacao', tipoFilter);
      }

      if (estoqueFilter !== 'all') {
        queryTotal = queryTotal.or(`estoque_origem_id.eq.${estoqueFilter},estoque_destino_id.eq.${estoqueFilter}`);
      }

      if (itemFilter !== 'all') {
        queryTotal = queryTotal.eq('item_id', itemFilter);
      }

      const { data: totalData, error: totalError } = await queryTotal;

      if (totalError) throw totalError;

      const movimentacoesMes = (movimentacoesData || []).length;
      const entradasMes = (movimentacoesData || []).filter(m => m.tipo_movimentacao === 'entrada').length;
      const saidasMes = (movimentacoesData || []).filter(m => m.tipo_movimentacao === 'saida').length;
      const transferenciasMes = (movimentacoesData || []).filter(m => m.tipo_movimentacao === 'transferencia').length;
      const ajustesMes = (movimentacoesData || []).filter(m => m.tipo_movimentacao === 'ajuste').length;
      const valorTotalMovimentado = (movimentacoesData || []).reduce((sum, m) => sum + Math.abs(m.custo_total || 0), 0);

      setIndicadores({
        total_movimentacoes: (totalData || []).length,
        movimentacoes_mes: movimentacoesMes,
        entradas_mes: entradasMes,
        saidas_mes: saidasMes,
        transferencias_mes: transferenciasMes,
        ajustes_mes: ajustesMes,
        valor_total_movimentado: valorTotalMovimentado
      });
    } catch (err) {
      console.error('Error fetching indicators:', err);
      setIndicadores(null);
    }
  };

  const handleAdicionarItem = () => {
    if (!formData.item_id || formData.quantidade <= 0) {
      alert('Selecione um item e quantidade');
      return;
    }

    const item = itensDisponiveis.find(i => i.id === formData.item_id);
    if (!item) {
      alert('Item não encontrado');
      return;
    }

    const itemJaExiste = itensMovimentacao.find(im => im.item_id === formData.item_id);
    if (itemJaExiste) {
      alert('Este item já foi adicionado');
      return;
    }

    const custoTotal = formData.quantidade * formData.custo_unitario;

    const novoItem: ItemMovimentacao = {
      id: crypto.randomUUID(),
      item_id: formData.item_id,
      item_nome: item.nome,
      unidade_medida: item.unidade_medida,
      quantidade: formData.quantidade,
      custo_unitario: formData.custo_unitario,
      custo_total: custoTotal
    };

    setItensMovimentacao([...itensMovimentacao, novoItem]);

    setFormData({
      ...formData,
      item_id: '',
      quantidade: 0,
      custo_unitario: 0
    });
  };

  const handleRemoverItemMovimentacao = (id: string) => {
    setItensMovimentacao(itensMovimentacao.filter(item => item.id !== id));
  };

  const handleSaveMultiplo = async () => {
    try {
      setLoading(true);
      setError(null);

      if (itensMovimentacao.length === 0) {
        throw new Error('Adicione pelo menos um item para movimentação');
      }

      // Validações específicas por tipo
      if (formData.tipo_movimentacao === 'transferencia') {
        if (!formData.estoque_origem_id || !formData.estoque_destino_id) {
          throw new Error('Para transferências, selecione os estoques de origem e destino');
        }
        if (formData.estoque_origem_id === formData.estoque_destino_id) {
          throw new Error('Os estoques de origem e destino devem ser diferentes');
        }
      } else if (formData.tipo_movimentacao === 'saida') {
        if (!formData.estoque_origem_id) {
          throw new Error('Para saídas, selecione o estoque de origem');
        }
      } else if (formData.tipo_movimentacao === 'entrada') {
        if (!formData.estoque_destino_id) {
          throw new Error('Para entradas, selecione o estoque de destino');
        }
      }

      const movimentacoes = itensMovimentacao.map(item => ({
        tipo_movimentacao: formData.tipo_movimentacao,
        item_id: item.item_id,
        estoque_origem_id: formData.estoque_origem_id || null,
        estoque_destino_id: formData.estoque_destino_id || null,
        quantidade: item.quantidade,
        custo_unitario: item.custo_unitario,
        custo_total: item.custo_total,
        data_movimentacao: formData.data_movimentacao,
        motivo: formData.motivo,
        observacoes: formData.observacoes,
        origem_tipo: 'manual'
      }));

      const { error } = await supabase
        .from('movimentacoes_estoque')
        .insert(movimentacoes);

      if (error) throw error;

      setShowForm(false);
      setItensMovimentacao([]);
      resetForm();
      fetchData();
      fetchItensDisponiveis();
      fetchIndicadores();
      alert(`${movimentacoes.length} movimentação(ões) criada(s) com sucesso!`);
    } catch (err) {
      console.error('Error saving movements:', err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar movimentações');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (itensMovimentacao.length > 0) {
      return handleSaveMultiplo();
    }

    try {
      setLoading(true);
      setError(null);

      // Validações - se usar ficha técnica, não precisa de item_id
      if (!formData.usar_ficha_tecnica && (!formData.item_id || formData.quantidade <= 0 || formData.custo_unitario < 0)) {
        throw new Error('Preencha todos os campos obrigatórios com valores válidos');
      }

      if (formData.usar_ficha_tecnica && !formData.ficha_tecnica_id) {
        throw new Error('Selecione uma ficha técnica');
      }

      // Se estiver usando ficha técnica de venda direta
      if (formData.usar_ficha_tecnica && formData.tipo_movimentacao === 'saida') {
        if (!formData.estoque_origem_id) {
          throw new Error('Selecione o estoque de origem');
        }

        // Buscar ingredientes da ficha técnica
        const { data: ingredientes, error: errorIngredientes } = await supabase
          .from('ficha_ingredientes')
          .select('item_estoque_id, quantidade')
          .eq('ficha_id', formData.ficha_tecnica_id);

        if (errorIngredientes) throw errorIngredientes;

        if (!ingredientes || ingredientes.length === 0) {
          throw new Error('Ficha técnica sem ingredientes cadastrados');
        }

        // Criar movimentação composta
        const { data: movComposta, error: errorComposta } = await supabase
          .from('movimentacoes_compostas')
          .insert([{
            tipo: 'venda',
            referencia_tipo: 'ficha_tecnica',
            referencia_id: formData.ficha_tecnica_id,
            descricao: `Venda com ficha técnica - ${formData.motivo || 'Venda'}`
          }])
          .select()
          .single();

        if (errorComposta) throw errorComposta;

        // Criar movimentações de saída para cada ingrediente
        const movimentacoes = ingredientes.map(ing => ({
          estoque_origem_id: formData.estoque_origem_id,
          estoque_destino_id: null,
          item_id: ing.item_estoque_id,
          tipo_movimentacao: 'saida',
          quantidade: ing.quantidade * formData.quantidade,
          custo_unitario: 0, // Será calculado pelo trigger
          custo_total: 0,
          data_movimentacao: formData.data_movimentacao,
          motivo: formData.motivo || 'Venda com ficha técnica',
          observacoes: formData.observacoes,
          origem_tipo: 'venda_ficha_tecnica'
        }));

        const { data: movsInsert, error: errorMovs } = await supabase
          .from('movimentacoes_estoque')
          .insert(movimentacoes)
          .select();

        if (errorMovs) throw errorMovs;

        // Vincular movimentações à movimentação composta
        const itensComposta = (movsInsert || []).map(mov => ({
          composta_id: movComposta.id,
          movimentacao_id: mov.id,
          tipo_item: 'insumo'
        }));

        const { error: errorItens } = await supabase
          .from('movimentacoes_compostas_itens')
          .insert(itensComposta);

        if (errorItens) throw errorItens;

      } else {
        // Fluxo normal sem ficha técnica
        // Validações específicas por tipo
        if (formData.tipo_movimentacao === 'transferencia') {
          if (!formData.estoque_origem_id || !formData.estoque_destino_id) {
            throw new Error('Para transferências, selecione os estoques de origem e destino');
          }
          if (formData.estoque_origem_id === formData.estoque_destino_id) {
            throw new Error('Os estoques de origem e destino devem ser diferentes');
          }

          const itemOrigem = itensDisponiveis.find(item =>
            item.id === formData.item_id && item.estoque_id === formData.estoque_origem_id
          );

          if (!itemOrigem || itemOrigem.quantidade_atual < formData.quantidade) {
            throw new Error(`Quantidade insuficiente no estoque de origem. Disponível: ${itemOrigem?.quantidade_atual || 0}`);
          }
        } else if (formData.tipo_movimentacao === 'saida') {
          if (!formData.estoque_origem_id) {
            throw new Error('Para saídas, selecione o estoque de origem');
          }

          const itemOrigem = itensDisponiveis.find(item =>
            item.id === formData.item_id && item.estoque_id === formData.estoque_origem_id
          );

          if (!itemOrigem || itemOrigem.quantidade_atual < formData.quantidade) {
            throw new Error(`Quantidade insuficiente no estoque. Disponível: ${itemOrigem?.quantidade_atual || 0}`);
          }
        } else if (formData.tipo_movimentacao === 'entrada') {
          if (!formData.estoque_destino_id) {
            throw new Error('Para entradas, selecione o estoque de destino');
          }
        }

        const custoTotal = formData.quantidade * formData.custo_unitario;

        const dataToSave = {
          tipo_movimentacao: formData.tipo_movimentacao,
          item_id: formData.item_id,
          estoque_origem_id: formData.estoque_origem_id || null,
          estoque_destino_id: formData.estoque_destino_id || null,
          quantidade: formData.quantidade,
          custo_unitario: formData.custo_unitario,
          custo_total: custoTotal,
          data_movimentacao: formData.data_movimentacao,
          motivo: formData.motivo,
          observacoes: formData.observacoes,
          origem_tipo: 'manual'
        };

        if (editingMovimentacao) {
          const { error } = await supabase
            .from('movimentacoes_estoque')
            .update(dataToSave)
            .eq('id', editingMovimentacao.id);

          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('movimentacoes_estoque')
            .insert([dataToSave]);

          if (error) throw error;
        }
      }

      setShowForm(false);
      setEditingMovimentacao(null);
      resetForm();
      fetchData();
      fetchItensDisponiveis();
      fetchIndicadores();
    } catch (err) {
      console.error('Error saving movement:', err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar movimentação');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta movimentação?')) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('movimentacoes_estoque')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchData();
      fetchItensDisponiveis();
      fetchIndicadores();
    } catch (err) {
      console.error('Error deleting movement:', err);
      setError(err instanceof Error ? err.message : 'Erro ao excluir movimentação');
    } finally {
      setLoading(false);
    }
  };

  const openForm = (movimentacao?: Movimentacao) => {
    if (movimentacao) {
      setEditingMovimentacao(movimentacao);
      setFormData({
        tipo_movimentacao: movimentacao.tipo_movimentacao,
        item_id: movimentacao.item_id,
        estoque_origem_id: movimentacao.estoque_origem_id || '',
        estoque_destino_id: movimentacao.estoque_destino_id || '',
        quantidade: movimentacao.quantidade,
        custo_unitario: movimentacao.custo_unitario,
        data_movimentacao: movimentacao.data_movimentacao,
        motivo: movimentacao.motivo || '',
        observacoes: movimentacao.observacoes || ''
      });
    } else {
      setEditingMovimentacao(null);
      resetForm();
    }
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      tipo_movimentacao: 'entrada',
      item_id: '',
      estoque_origem_id: '',
      estoque_destino_id: '',
      quantidade: 0,
      custo_unitario: 0,
      data_movimentacao: dayjs().format('YYYY-MM-DD'),
      motivo: '',
      observacoes: '',
      usar_ficha_tecnica: false,
      ficha_tecnica_id: ''
    });
    setItensMovimentacao([]);
  };

  const filteredMovimentacoes = movimentacoes.filter(mov => {
    const matchesSearch = mov.item_nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         mov.motivo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         mov.observacoes?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         mov.estoque_origem_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         mov.estoque_destino_nome?.toLowerCase().includes(searchTerm.toLowerCase());
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

  const getOrigemText = (origemTipo?: string) => {
    if (!origemTipo) return { label: 'Manual', color: 'text-white/50 bg-white/10' };

    switch (origemTipo) {
      case 'compra':
        return { label: 'Compra', color: 'text-blue-400 bg-blue-500/15' };
      case 'producao':
        return { label: 'Produção', color: 'text-green-400 bg-green-500/15' };
      case 'contagem':
        return { label: 'Contagem', color: 'text-purple-400 bg-purple-500/15' };
      case 'requisicao':
        return { label: 'Requisição', color: 'text-orange-400 bg-orange-500/15' };
      case 'venda':
        return { label: 'Venda', color: 'text-pink-600 bg-pink-100' };
      case 'manual':
        return { label: 'Manual', color: 'text-white/50 bg-white/10' };
      default:
        return { label: origemTipo, color: 'text-white/50 bg-white/10' };
    }
  };

  const getItensParaFormulario = () => {
    if (formData.tipo_movimentacao === 'saida' || formData.tipo_movimentacao === 'transferencia') {
      // Para saídas e transferências, mostrar apenas itens com saldo no estoque de origem
      return itensDisponiveis.filter(item => 
        item.estoque_id === formData.estoque_origem_id && 
        item.quantidade_atual > 0
      );
    } else {
      // Para entradas e ajustes, mostrar todos os itens únicos (sem duplicar por estoque)
      const itensUnicos = new Map();
      itensDisponiveis.forEach(item => {
        if (!itensUnicos.has(item.id)) {
          itensUnicos.set(item.id, item);
        }
      });
      return Array.from(itensUnicos.values());
    }
  };

  const exportData = () => {
    if (filteredMovimentacoes.length === 0) {
      alert('Não há dados para exportar');
      return;
    }

    const headers = [
      'Data',
      'Tipo',
      'Item',
      'Código',
      'Estoque Origem',
      'Estoque Destino',
      'Quantidade',
      'Unidade',
      'Custo Unitário',
      'Custo Total',
      'Motivo',
      'Observações'
    ];

    const data = filteredMovimentacoes.map(mov => [
      dayjs(mov.data_movimentacao).format('DD/MM/YYYY'),
      getTipoText(mov.tipo_movimentacao),
      mov.item_nome,
      mov.item_codigo || '',
      mov.estoque_origem_nome || '',
      mov.estoque_destino_nome || '',
      mov.quantidade.toFixed(3),
      mov.unidade_medida,
      mov.custo_unitario,
      mov.custo_total,
      mov.motivo || '',
      mov.observacoes || ''
    ]);

    const fileName = `movimentacoes-estoque-${dayjs().format('YYYY-MM-DD')}`;
    exportToExcel(data, fileName, headers);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-white">Movimentações de Estoque</h3>
        <div className="flex gap-2">
          <button
            onClick={exportData}
            className="px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white/80 hover:bg-white/10"
          >
            <Download className="w-4 h-4 inline mr-2" />
            Exportar Excel
          </button>
          <button
            onClick={() => setShowLancarVendas(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center gap-2"
          >
            <ShoppingCart className="w-4 h-4" />
            Lançar Vendas
          </button>
          <button
            onClick={() => setShowImportarVendas(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
          >
            <Sparkles className="w-4 h-4" />
            Importar Vendas (IA)
          </button>
          <button
            onClick={() => openForm()}
            className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25]"
          >
            <Plus className="w-4 h-4 inline mr-2" />
            Nova Movimentação
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
              <Activity className="w-8 h-8 text-blue-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Total Movimentações</p>
                <p className="text-2xl font-bold text-blue-400">
                  {indicadores.total_movimentacoes}
                </p>
                <p className="text-sm text-white/50">Registradas</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <TrendingUp className="w-8 h-8 text-green-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Entradas</p>
                <p className="text-2xl font-bold text-green-400">
                  {indicadores.entradas_mes}
                </p>
                <p className="text-sm text-white/50">Este mês</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <TrendingDown className="w-8 h-8 text-red-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Saídas</p>
                <p className="text-2xl font-bold text-red-400">
                  {indicadores.saidas_mes}
                </p>
                <p className="text-sm text-white/50">Este mês</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <ArrowLeftRight className="w-8 h-8 text-blue-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Transferências</p>
                <p className="text-2xl font-bold text-blue-400">
                  {indicadores.transferencias_mes}
                </p>
                <p className="text-sm text-white/50">Este mês</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <RotateCcw className="w-8 h-8 text-purple-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Ajustes</p>
                <p className="text-2xl font-bold text-purple-400">
                  {indicadores.ajustes_mes}
                </p>
                <p className="text-sm text-white/50">Este mês</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <DollarSign className="w-8 h-8 text-teal-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Valor Movimentado</p>
                <p className="text-2xl font-bold text-teal-400">
                  {formatCurrency(indicadores.valor_total_movimentado)}
                </p>
                <p className="text-sm text-white/50">Este mês</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-[#12141f] p-4 rounded-lg border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
          <div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/30 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar movimentações..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-white/20 rounded-lg bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
              />
            </div>
          </div>

          <div>
            <select
              value={tipoFilter}
              onChange={(e) => setTipoFilter(e.target.value as any)}
              className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            >
              <option value="all">Todos os Tipos</option>
              <option value="entrada">Entradas</option>
              <option value="saida">Saídas</option>
              <option value="transferencia">Transferências</option>
              <option value="ajuste">Ajustes</option>
            </select>
          </div>

          <div>
            <select
              value={estoqueFilter}
              onChange={(e) => setEstoqueFilter(e.target.value)}
              className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
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
            <select
              value={itemFilter}
              onChange={(e) => setItemFilter(e.target.value)}
              className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            >
              <option value="all">Todos os Itens</option>
              {Array.from(new Set(itensDisponiveis.map(item => ({ id: item.id, nome: item.nome }))))
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.nome}
                  </option>
                ))}
            </select>
          </div>

          <div>
            <input
              type="date"
              value={dataInicial}
              onChange={(e) => setDataInicial(e.target.value)}
              className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            />
          </div>

          <div>
            <input
              type="date"
              value={dataFinal}
              onChange={(e) => setDataFinal(e.target.value)}
              className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            />
          </div>
        </div>
      </div>

      {/* Lista de Movimentações */}
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
                    Data
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Origem
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Item
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Origem → Destino
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Quantidade
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Custo
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Motivo
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-[#12141f] divide-y divide-white/5">
                {filteredMovimentacoes.map((mov) => (
                  <tr key={mov.id} className="hover:bg-white/10/5">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white">
                        {dayjs(mov.data_movimentacao).format('DD/MM/YYYY')}
                      </div>
                      <div className="text-xs text-white/40">
                        {dayjs(mov.criado_em).format('HH:mm')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getTipoColor(mov.tipo_movimentacao)}`}>
                        {getTipoIcon(mov.tipo_movimentacao)}
                        <span className="ml-1">{getTipoText(mov.tipo_movimentacao)}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getOrigemText(mov.origem_tipo).color}`}>
                        {getOrigemText(mov.origem_tipo).label}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-white">{mov.item_nome}</div>
                        {mov.item_codigo && (
                          <div className="text-sm text-white/40">Cód: {mov.item_codigo}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm">
                        {mov.tipo_movimentacao === 'entrada' && (
                          <div className="flex items-center text-green-400">
                            <ArrowDown className="w-4 h-4 mr-1" />
                            → {mov.estoque_destino_nome}
                          </div>
                        )}
                        {mov.tipo_movimentacao === 'saida' && (
                          <div className="flex items-center text-red-400">
                            <ArrowUp className="w-4 h-4 mr-1" />
                            {mov.estoque_origem_nome} →
                          </div>
                        )}
                        {mov.tipo_movimentacao === 'transferencia' && (
                          <div className="flex items-center text-blue-400">
                            <ArrowLeftRight className="w-4 h-4 mr-1" />
                            {mov.estoque_origem_nome} → {mov.estoque_destino_nome}
                          </div>
                        )}
                        {mov.tipo_movimentacao === 'ajuste' && (
                          <div className="flex items-center text-purple-400">
                            <RotateCcw className="w-4 h-4 mr-1" />
                            {mov.estoque_destino_nome || mov.estoque_origem_nome}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-right">
                        {mov.tipo_movimentacao === 'entrada' && (
                          <TrendingUp className="w-4 h-4 text-green-500 mr-2" />
                        )}
                        {mov.tipo_movimentacao === 'saida' && (
                          <TrendingDown className="w-4 h-4 text-red-500 mr-2" />
                        )}
                        <span className={`font-medium ${
                          mov.tipo_movimentacao === 'entrada' ? 'text-green-400' : 'text-red-400'
                        }`}>
                          {mov.tipo_movimentacao === 'entrada' ? '+' : '-'}{mov.quantidade.toFixed(3)} {mov.unidade_medida}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-right">
                        <div className="font-medium text-white">
                          {formatCurrency(mov.custo_total)}
                        </div>
                        <div className="text-sm text-white/40">
                          Unit: {formatCurrency(mov.custo_unitario)}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-white">
                        {mov.motivo || '-'}
                      </div>
                      {mov.observacoes && (
                        <div className="text-sm text-white/40">{mov.observacoes}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => openForm(mov)}
                          className="text-blue-400 hover:text-blue-300"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(mov.id)}
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

          {filteredMovimentacoes.length === 0 && (
            <div className="text-center py-12">
              <ArrowLeftRight className="w-16 h-16 text-white/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">Nenhuma movimentação encontrada</h3>
              <p className="text-white/40">
                {searchTerm || tipoFilter !== 'all' || estoqueFilter !== 'all' || itemFilter !== 'all'
                  ? 'Nenhuma movimentação corresponde aos filtros aplicados.'
                  : 'Nenhuma movimentação registrada no período.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Modal do Formulário */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0f1020] rounded-lg p-6 w-full max-w-3xl max-h-[90vh] overflow-y-auto border border-white/10">
            <h3 className="text-lg font-medium text-white mb-4">
              {editingMovimentacao ? 'Editar Movimentação' : 'Nova Movimentação'}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Tipo de Movimentação *
                </label>
                <select
                  value={formData.tipo_movimentacao}
                  onChange={(e) => {
                    setFormData({ 
                      ...formData, 
                      tipo_movimentacao: e.target.value as any,
                      item_id: '',
                      estoque_origem_id: '',
                      estoque_destino_id: ''
                    });
                  }}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  required
                >
                  <option value="entrada">Entrada</option>
                  <option value="saida">Saída</option>
                  <option value="transferencia">Transferência</option>
                  <option value="ajuste">Ajuste</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Data da Movimentação *
                </label>
                <input
                  type="date"
                  value={formData.data_movimentacao}
                  onChange={(e) => setFormData({ ...formData, data_movimentacao: e.target.value })}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  required
                />
              </div>

              {/* Opção de usar Ficha Técnica - Apenas para saídas */}
              {formData.tipo_movimentacao === 'saida' && (
                <div className="md:col-span-2 p-4 bg-blue-900/20 rounded-lg border border-blue-500/30">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.usar_ficha_tecnica}
                      onChange={(e) => setFormData({
                        ...formData,
                        usar_ficha_tecnica: e.target.checked,
                        item_id: '',
                        ficha_tecnica_id: ''
                      })}
                      className="rounded border-white/20 text-[#7D1F2C] focus:ring-[#7D1F2C]"
                    />
                    <span className="ml-2 text-sm font-medium text-white">
                      Usar Ficha Técnica de Venda Direta
                    </span>
                  </label>
                  <p className="text-xs text-white/50 mt-1 ml-6">
                    Marque para baixar automaticamente todos os insumos de uma receita
                  </p>
                </div>
              )}

              {/* Estoque de Origem - Para saídas e transferências */}
              {(formData.tipo_movimentacao === 'saida' || formData.tipo_movimentacao === 'transferencia') && (
                <div>
                  <SearchableSelect
                    label="Estoque de Origem"
                    options={estoques.map(e => ({ value: e.id, label: e.nome }))}
                    value={formData.estoque_origem_id}
                    onChange={(value) => setFormData({
                      ...formData,
                      estoque_origem_id: value,
                      item_id: '' // Reset item quando mudar estoque
                    })}
                    placeholder="Selecione o estoque de origem..."
                    required
                    className="w-full"
                  />
                </div>
              )}

              {/* Estoque de Destino - Para entradas, transferências e ajustes */}
              {(formData.tipo_movimentacao === 'entrada' || formData.tipo_movimentacao === 'transferencia' || formData.tipo_movimentacao === 'ajuste') && (
                <div>
                  <SearchableSelect
                    label="Estoque de Destino"
                    options={estoques
                      .filter(estoque => estoque.id !== formData.estoque_origem_id)
                      .map(e => ({ value: e.id, label: e.nome }))}
                    value={formData.estoque_destino_id}
                    onChange={(value) => setFormData({ ...formData, estoque_destino_id: value })}
                    placeholder="Selecione o estoque de destino..."
                    required
                    className="w-full"
                  />
                </div>
              )}

              {/* Seleção de Ficha Técnica ou Item */}
              {formData.usar_ficha_tecnica ? (
                <div className="md:col-span-2">
                  <SearchableSelect
                    label="Ficha Técnica de Venda Direta"
                    options={fichasTecnicas.map(f => ({
                      value: f.id,
                      label: f.nome,
                      sublabel: `Custo: ${formatCurrency(f.custo_total)}`
                    }))}
                    value={formData.ficha_tecnica_id}
                    onChange={(value) => {
                      const fichaSelecionada = fichasTecnicas.find(f => f.id === value);
                      setFormData({
                        ...formData,
                        ficha_tecnica_id: value,
                        custo_unitario: fichaSelecionada?.custo_total || 0
                      });
                    }}
                    placeholder="Selecione uma ficha técnica..."
                    required
                    emptyMessage="Nenhuma ficha técnica de venda direta cadastrada"
                    className="w-full"
                  />
                </div>
              ) : (
                <div className="md:col-span-2">
                  <SearchableSelect
                    label="Item"
                    options={getItensParaFormulario().map(item => ({
                      value: item.id,
                      label: item.codigo ? `${item.codigo} - ${item.nome}` : item.nome,
                      sublabel: `${item.estoque_nome} - ${item.quantidade_atual.toFixed(3)} ${item.unidade_medida}`
                    }))}
                    value={formData.item_id}
                    onChange={(value) => {
                      const itemSelecionado = getItensParaFormulario().find(item => item.id === value);
                      setFormData({
                        ...formData,
                        item_id: value,
                        custo_unitario: itemSelecionado?.custo_medio || 0
                      });
                    }}
                    placeholder="Selecione um item..."
                    required
                    emptyMessage={(formData.tipo_movimentacao === 'saida' || formData.tipo_movimentacao === 'transferencia') && formData.estoque_origem_id ? 'Nenhum item disponível no estoque selecionado' : 'Nenhum item encontrado'}
                    className="w-full"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Quantidade * {formData.usar_ficha_tecnica && '(porções)'}
                </label>
                <input
                  type="number"
                  step={formData.usar_ficha_tecnica ? "1" : "0.001"}
                  min={formData.usar_ficha_tecnica ? "1" : "0.001"}
                  value={formData.quantidade}
                  onChange={(e) => setFormData({ ...formData, quantidade: parseFloat(e.target.value) || 0 })}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  required
                />
                {formData.usar_ficha_tecnica ? (
                  <p className="text-xs text-white/40 mt-1">
                    Quantidade de porções/vendas desta ficha técnica
                  </p>
                ) : (
                  formData.item_id && (formData.tipo_movimentacao === 'saida' || formData.tipo_movimentacao === 'transferencia') && (
                    (() => {
                      const item = getItensParaFormulario().find(i => i.id === formData.item_id);
                      return item && (
                        <p className="text-xs text-white/40 mt-1">
                          Disponível: {item.quantidade_atual.toFixed(3)} {item.unidade_medida}
                        </p>
                      );
                    })()
                  )
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Custo Unitário *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-white/40 sm:text-sm">R$</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.custo_unitario}
                    onChange={(e) => setFormData({ ...formData, custo_unitario: parseFloat(e.target.value) || 0 })}
                    className="pl-10 w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                    required
                  />
                </div>
              </div>

              {!editingMovimentacao && !formData.usar_ficha_tecnica && (
                <div className="md:col-span-2 flex items-end justify-end">
                  <button
                    type="button"
                    onClick={handleAdicionarItem}
                    disabled={!formData.item_id || formData.quantidade <= 0 || formData.custo_unitario < 0}
                    className="px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Plus className="w-4 h-4 inline mr-2" />
                    Adicionar Item à Movimentação
                  </button>
                </div>
              )}

              {itensMovimentacao.length > 0 && (
                <div className="md:col-span-2 mb-4">
                  <h4 className="text-sm font-medium text-white/80 mb-2 flex items-center">
                    <Package className="w-4 h-4 mr-2" />
                    Itens para Movimentação ({itensMovimentacao.length})
                  </h4>
                  <div className="border border-white/10 rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full">
                        <thead className="bg-white/5">
                          <tr>
                            <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">Item</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">Quantidade</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">Custo Unit.</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">Custo Total</th>
                            <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-white/10">
                          {itensMovimentacao.map((item) => (
                            <tr key={item.id}>
                              <td className="px-4 py-2 text-sm">
                                <div className="font-medium">{item.item_nome}</div>
                                <div className="text-xs text-white/40">{item.unidade_medida}</div>
                              </td>
                              <td className="px-4 py-2 text-sm">{item.quantidade.toFixed(3)}</td>
                              <td className="px-4 py-2 text-sm">{formatCurrency(item.custo_unitario)}</td>
                              <td className="px-4 py-2 text-sm font-medium">{formatCurrency(item.custo_total)}</td>
                              <td className="px-4 py-2">
                                <button
                                  type="button"
                                  onClick={() => handleRemoverItemMovimentacao(item.id)}
                                  className="text-red-400 hover:text-red-300"
                                  title="Remover"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot className="bg-white/5">
                          <tr>
                            <td colSpan={3} className="px-4 py-2 text-sm font-medium text-right">Total:</td>
                            <td className="px-4 py-2 text-sm font-bold text-[#7D1F2C]">
                              {formatCurrency(itensMovimentacao.reduce((sum, item) => sum + item.custo_total, 0))}
                            </td>
                            <td></td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Motivo
                </label>
                <input
                  type="text"
                  value={formData.motivo}
                  onChange={(e) => setFormData({ ...formData, motivo: e.target.value })}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  placeholder="Ex: Reposição, Venda, Defeito, etc."
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Observações
                </label>
                <textarea
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  rows={2}
                  placeholder="Observações sobre a movimentação..."
                />
              </div>

              {/* Resumo do Custo */}
              {formData.quantidade > 0 && formData.custo_unitario > 0 && (
                <div className="md:col-span-2 p-4 bg-blue-900/20 rounded-lg border border-blue-500/30">
                  <h4 className="font-medium text-blue-300 mb-2">Resumo da Movimentação</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-blue-400 font-medium">Quantidade:</span>
                      <div className="text-lg font-bold text-blue-300">
                        {formData.quantidade.toFixed(3)}
                      </div>
                    </div>
                    <div>
                      <span className="text-blue-400 font-medium">Custo Unitário:</span>
                      <div className="text-lg font-bold text-blue-300">
                        {formatCurrency(formData.custo_unitario)}
                      </div>
                    </div>
                    <div>
                      <span className="text-blue-400 font-medium">Custo Total:</span>
                      <div className="text-lg font-bold text-blue-300">
                        {formatCurrency(formData.quantidade * formData.custo_unitario)}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => {
                  setShowForm(false);
                  setEditingMovimentacao(null);
                  resetForm();
                }}
                className="px-4 py-2 border border-white/20 rounded-md text-white/80 hover:bg-white/10/5"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={
                  loading ||
                  (itensMovimentacao.length === 0 && (
                    formData.quantidade <= 0 ||
                    (formData.usar_ficha_tecnica ? !formData.ficha_tecnica_id : (!formData.item_id || formData.custo_unitario < 0))
                  ))
                }
                className="px-4 py-2 bg-[#7D1F2C] text-white rounded-md hover:bg-[#6a1a25] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Salvando...' : itensMovimentacao.length > 0 ? `Salvar Movimentação (${itensMovimentacao.length} ${itensMovimentacao.length === 1 ? 'item' : 'itens'})` : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Importar Vendas IA */}
      <ImportarVendasIA
        isOpen={showImportarVendas}
        onClose={() => setShowImportarVendas(false)}
        onSuccess={() => {
          setShowImportarVendas(false);
          fetchData();
        }}
      />

      {/* Modal Lançar Vendas Manualmente */}
      <LancarVendasModal
        isOpen={showLancarVendas}
        onClose={() => setShowLancarVendas(false)}
        onSuccess={() => {
          setShowLancarVendas(false);
          fetchData();
          fetchItensDisponiveis();
          fetchIndicadores();
        }}
      />
    </div>
  );
};

export default MovimentacoesEstoque;