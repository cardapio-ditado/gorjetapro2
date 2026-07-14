import React, { useState, useEffect } from 'react';
import { Plus, Search, CreditCard as Edit, Trash2, Eye, Factory, CheckCircle, XCircle, Clock, AlertTriangle, Download, Package, Users, ChefHat, Play, Activity, TrendingUp, DollarSign, FileText, History, ClipboardCheck, BarChart3, Warehouse } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { exportToExcel } from '../../utils/reportGenerator';
import dayjs from 'dayjs';
import { producaoServiceSimples as producaoService, VerificacaoEstoque } from '../../services/producaoServiceSimples';
import ModalVerificacaoInsumos from './producao/ModalVerificacaoInsumos';
import ModalConcluirProducao from './producao/ModalConcluirProducao';
import { useAuth } from '../../contexts/AuthContext';
import { SearchableSelect } from '../common/SearchableSelect';

interface Producao {
  id: string;
  ficha_id: string;
  ficha_nome?: string;
  quantidade: number;
  data_producao: string;
  custo_total_producao: number;
  responsavel?: string;
  status: string;
  observacoes?: string;
  lote_producao?: string;
  hora_inicio?: string;
  hora_fim?: string;
  tempo_producao_minutos?: number;
  quantidade_produzida?: number;
  quantidade_aprovada?: number;
  quantidade_rejeitada?: number;
  percentual_desperdicio?: number;
  estoque_destino_id?: string;
  estoque_destino_nome?: string;
  criado_em: string;
}

interface FichaTecnica {
  id: string;
  nome: string;
  porcoes?: number;
  custo_total?: number;
  ativo: boolean;
}

interface Estoque {
  id: string;
  nome: string;
  tipo: string;
}

interface FormData {
  ficha_id: string;
  quantidade: number;
  data_producao: string;
  responsavel: string;
  observacoes: string;
  estoque_destino_id: string;
}

interface ItemProducao {
  id: string;
  ficha_id: string;
  ficha_nome: string;
  quantidade: number;
  custo_unitario: number;
  custo_total: number;
}

const ProducaoEstoque: React.FC = () => {
  const [producoes, setProducoes] = useState<Producao[]>([]);
  const [fichasTecnicas, setFichasTecnicas] = useState<FichaTecnica[]>([]);
  const [estoques, setEstoques] = useState<Estoque[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingProducao, setEditingProducao] = useState<Producao | null>(null);
  const [showVerificacao, setShowVerificacao] = useState(false);
  const [verificacaoInsumos, setVerificacaoInsumos] = useState<{disponivel: boolean; detalhes: VerificacaoEstoque[]} | null>(null);
  const [producaoParaConcluir, setProducaoParaConcluir] = useState<Producao | null>(null);
  const [showDetalhes, setShowDetalhes] = useState(false);
  const [producaoDetalhes, setProducaoDetalhes] = useState<any>(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [dataInicial, setDataInicial] = useState(dayjs().subtract(30, 'days').format('YYYY-MM-DD'));
  const [dataFinal, setDataFinal] = useState(dayjs().format('YYYY-MM-DD'));

  const { usuario } = useAuth();

  const [formData, setFormData] = useState<FormData>({
    ficha_id: '',
    quantidade: 1,
    data_producao: dayjs().format('YYYY-MM-DD'),
    responsavel: '',
    observacoes: '',
    estoque_destino_id: ''
  });

  const [itensProducao, setItensProducao] = useState<ItemProducao[]>([]);

  const responsaveis = [
    'Chef Principal', 'Sous Chef', 'Cozinheiro 1', 'Cozinheiro 2',
    'Auxiliar de Cozinha', 'Confeiteiro', 'Padeiro'
  ];

  useEffect(() => {
    fetchData();
    fetchFichasTecnicas();
    fetchEstoques();
  }, [statusFilter, dataInicial, dataFinal]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Tentar usar a view completa primeiro
      let query = supabase
        .from('vw_producao_completa')
        .select('*');

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (dataInicial) {
        query = query.gte('data_producao', dataInicial);
      }

      if (dataFinal) {
        query = query.lte('data_producao', dataFinal);
      }

      let { data, error } = await query.order('data_producao', { ascending: false });

      // Se a view não existir, usar a view antiga
      if (error && error.message.includes('does not exist')) {
        console.warn('View vw_producao_completa não existe, usando vw_producao_detalhada');

        let fallbackQuery = supabase
          .from('vw_producao_detalhada')
          .select('*');

        if (statusFilter !== 'all') {
          fallbackQuery = fallbackQuery.eq('status', statusFilter);
        }

        if (dataInicial) {
          fallbackQuery = fallbackQuery.gte('data_producao', dataInicial);
        }

        if (dataFinal) {
          fallbackQuery = fallbackQuery.lte('data_producao', dataFinal);
        }

        const fallbackResult = await fallbackQuery.order('data_producao', { ascending: false });
        data = fallbackResult.data;
        error = fallbackResult.error;
      }

      if (error) throw error;
      setProducoes(data || []);
    } catch (err) {
      console.error('Error fetching productions:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar produções');
      setProducoes([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchFichasTecnicas = async () => {
    try {
      const { data, error } = await supabase
        .from('fichas_tecnicas')
        .select('*')
        .eq('ativo', true)
        .order('nome');

      if (error) throw error;
      setFichasTecnicas(data || []);
    } catch (err) {
      console.error('Error fetching fichas:', err);
      setFichasTecnicas([]);
    }
  };

  const fetchEstoques = async () => {
    try {
      const { data, error } = await supabase
        .from('estoques')
        .select('id, nome, tipo')
        .eq('status', true)
        .order('nome');

      if (error) throw error;
      setEstoques(data || []);
    } catch (err) {
      console.error('Error fetching estoques:', err);
      setEstoques([]);
    }
  };

  const handleAdicionarItem = () => {
    if (!formData.ficha_id || formData.quantidade <= 0) {
      alert('Selecione uma ficha técnica e quantidade');
      return;
    }

    const ficha = fichasTecnicas.find(f => f.id === formData.ficha_id);
    if (!ficha) return;

    const itemJaExiste = itensProducao.find(item => item.ficha_id === formData.ficha_id);
    if (itemJaExiste) {
      alert('Esta ficha técnica já foi adicionada');
      return;
    }

    const custoUnitario = ficha.custo_total || 0;
    const custoTotal = custoUnitario * formData.quantidade;

    const novoItem: ItemProducao = {
      id: crypto.randomUUID(),
      ficha_id: formData.ficha_id,
      ficha_nome: ficha.nome,
      quantidade: formData.quantidade,
      custo_unitario: custoUnitario,
      custo_total: custoTotal
    };

    setItensProducao([...itensProducao, novoItem]);

    setFormData({
      ...formData,
      ficha_id: '',
      quantidade: 1
    });
  };

  const handleRemoverItem = (id: string) => {
    setItensProducao(itensProducao.filter(item => item.id !== id));
  };

  const handleVerificarInsumos = async () => {
    if (itensProducao.length === 0) {
      alert('Adicione pelo menos uma ficha técnica para produção');
      return;
    }

    if (!formData.estoque_destino_id) {
      alert('Selecione o estoque de destino');
      return;
    }

    try {
      setLoading(true);

      for (const item of itensProducao) {
        const resultado = await producaoService.verificarDisponibilidadeInsumos(
          item.ficha_id,
          item.quantidade
        );

        if (!resultado.disponivel) {
          const insumosFaltando = resultado.detalhes
            .filter(d => !d.disponivel)
            .map(d => d.insumo_nome)
            .join(', ');

          alert(`Insumos insuficientes para ${item.ficha_nome}: ${insumosFaltando}`);
          setLoading(false);
          return;
        }
      }

      handleConfirmarProducaoMultipla();
    } catch (error) {
      console.error('Erro ao verificar insumos:', error);
      alert('Erro ao verificar disponibilidade dos insumos');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmarProducaoMultipla = async () => {
    try {
      setLoading(true);

      for (const item of itensProducao) {
        const { data: novaProducao, error } = await supabase
          .from('producoes')
          .insert([{
            ficha_id: item.ficha_id,
            quantidade: item.quantidade,
            data_producao: formData.data_producao,
            responsavel: formData.responsavel,
            observacoes: formData.observacoes,
            custo_total_producao: item.custo_total,
            estoque_destino_id: formData.estoque_destino_id,
            status: 'planejado'
          }])
          .select()
          .single();

        if (error) throw error;

        const resultado = await producaoService.verificarDisponibilidadeInsumos(
          item.ficha_id,
          item.quantidade
        );

        if (resultado.detalhes) {
          await producaoService.reservarInsumos(novaProducao.id, resultado.detalhes);
        }
      }

      setShowForm(false);
      resetForm();
      setItensProducao([]);
      fetchData();
      alert(`${itensProducao.length} produção(ões) planejada(s) com sucesso!`);
    } catch (error) {
      console.error('Erro ao criar produção:', error);
      alert('Erro ao criar produção');
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmarProducao = async () => {
    try {
      setLoading(true);
      setShowVerificacao(false);

      const ficha = fichasTecnicas.find(f => f.id === formData.ficha_id);
      const custoTotal = (ficha?.custo_total || 0) * formData.quantidade;

      if (!formData.estoque_destino_id) {
        alert('Selecione o estoque de destino para a produção');
        return;
      }

      const { data: novaProducao, error } = await supabase
        .from('producoes')
        .insert([{
          ficha_id: formData.ficha_id,
          quantidade: formData.quantidade,
          data_producao: formData.data_producao,
          responsavel: formData.responsavel,
          observacoes: formData.observacoes,
          custo_total_producao: custoTotal,
          estoque_destino_id: formData.estoque_destino_id,
          status: 'planejado'
        }])
        .select()
        .single();

      if (error) throw error;

      if (verificacaoInsumos?.detalhes) {
        await producaoService.reservarInsumos(novaProducao.id, verificacaoInsumos.detalhes);
      }

      setShowForm(false);
      resetForm();
      fetchData();
      alert('Produção planejada com sucesso!');
    } catch (error) {
      console.error('Erro ao criar produção:', error);
      alert('Erro ao criar produção');
    } finally {
      setLoading(false);
    }
  };

  const handleIniciarProducao = async (producao: Producao) => {
    if (!confirm('Deseja iniciar esta produção?')) return;

    try {
      setLoading(true);

      if (!usuario?.id) {
        alert('Usuário não autenticado');
        return;
      }

      await producaoService.iniciarProducao(producao.id, usuario?.id);
      await fetchData();
      alert('Produção iniciada com sucesso!');
    } catch (error) {
      console.error('Erro ao iniciar produção:', error);
      alert('Erro ao iniciar produção');
    } finally {
      setLoading(false);
    }
  };

  const handleAbrirConclusao = (producao: Producao) => {
    setProducaoParaConcluir(producao);
  };

  const handleConcluirProducao = async (dados: any) => {
    if (!producaoParaConcluir) return;

    try {
      setLoading(true);

      if (!usuario?.id) {
        alert('Usuário não autenticado');
        return;
      }

      await producaoService.concluirProducao(
        producaoParaConcluir.id,
        dados.quantidade_produzida,
        dados.quantidade_aprovada,
        dados.observacoes,
        usuario?.id
      );

      setProducaoParaConcluir(null);
      await fetchData();
      alert('Produção concluída com sucesso!');
    } catch (error) {
      console.error('Erro ao concluir produção:', error);
      alert('Erro ao concluir produção');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta produção?')) return;

    try {
      setLoading(true);
      await producaoService.cancelarProducao(id);
      await fetchData();
      alert('Produção excluída com sucesso!');
    } catch (error) {
      console.error('Error deleting production:', error);
      alert('Erro ao excluir produção: ' + (error instanceof Error ? error.message : 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  };

  const handleVerDetalhes = async (producao: Producao) => {
    try {
      setLoading(true);

      const { data: reservas } = await supabase
        .from('producao_reserva_insumos')
        .select('*, itens_estoque(nome, unidade_medida), estoques(nome, tipo)')
        .eq('producao_id', producao.id);

      setProducaoDetalhes({
        producao,
        historico: [],
        qualidade: [],
        reservas: reservas || []
      });
      setShowDetalhes(true);
    } catch (error) {
      console.error('Erro ao carregar detalhes:', error);
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      ficha_id: '',
      quantidade: 1,
      data_producao: dayjs().format('YYYY-MM-DD'),
      responsavel: '',
      observacoes: '',
      estoque_destino_id: ''
    });
    setItensProducao([]);
    setVerificacaoInsumos(null);
  };

  const filteredProducoes = producoes.filter(p => {
    const matchesSearch =
      p.ficha_nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.lote_producao?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.responsavel?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'planejado': return 'text-blue-300 bg-blue-900/30';
      case 'em_andamento': return 'text-yellow-300 bg-yellow-900/30';
      case 'concluido': return 'text-green-300 bg-green-900/30';
      case 'cancelado': return 'text-red-300 bg-red-900/30';
      default: return 'text-white/80 bg-white/10';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'planejado': return <Clock className="w-4 h-4" />;
      case 'em_andamento': return <Play className="w-4 h-4" />;
      case 'concluido': return <CheckCircle className="w-4 h-4" />;
      case 'cancelado': return <XCircle className="w-4 h-4" />;
      default: return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'planejado': return 'Planejado';
      case 'em_andamento': return 'Em Andamento';
      case 'concluido': return 'Concluído';
      case 'cancelado': return 'Cancelado';
      default: return status;
    }
  };

  const exportData = () => {
    if (filteredProducoes.length === 0) {
      alert('Não há dados para exportar');
      return;
    }

    const headers = [
      'Lote', 'Ficha Técnica', 'Quantidade', 'Data', 'Responsável',
      'Status', 'Produzida', 'Aprovada', 'Rejeitada', '% Desperdício',
      'Tempo (min)', 'Custo'
    ];

    const data = filteredProducoes.map(p => [
      p.lote_producao || '',
      p.ficha_nome || '',
      p.quantidade,
      dayjs(p.data_producao).format('DD/MM/YYYY'),
      p.responsavel || '',
      getStatusText(p.status),
      p.quantidade_produzida || 0,
      p.quantidade_aprovada || 0,
      p.quantidade_rejeitada || 0,
      p.percentual_desperdicio || 0,
      p.tempo_producao_minutos || 0,
      p.custo_total_producao
    ]);

    exportToExcel(data, `producoes-${dayjs().format('YYYY-MM-DD')}`, headers);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-white">Controle de Produção Avançado</h3>
        <div className="flex gap-2">
          <button
            onClick={exportData}
            className="px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white/80 hover:bg-white/10"
          >
            <Download className="w-4 h-4 inline mr-2" />
            Exportar
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25]"
          >
            <Plus className="w-4 h-4 inline mr-2" />
            Nova Produção
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 text-red-300 rounded-lg border border-red-500/30">{error}</div>
      )}

      {/* Filtros */}
      <div className="bg-[#12141f] p-4 rounded-lg border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/30 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar produções..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-white/20 rounded-lg bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            />
          </div>

          <SearchableSelect
            options={[
              { value: 'all', label: 'Todos os Status' },
              { value: 'planejado', label: 'Planejado' },
              { value: 'em_andamento', label: 'Em Andamento' },
              { value: 'concluido', label: 'Concluído' },
              { value: 'cancelado', label: 'Cancelado' }
            ]}
            value={statusFilter}
            onChange={setStatusFilter}
            placeholder="Todos os Status"
            className="w-full md:w-auto"
          />

          <input
            type="date"
            value={dataInicial}
            onChange={(e) => setDataInicial(e.target.value)}
            className="border border-white/20 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
          />

          <input
            type="date"
            value={dataFinal}
            onChange={(e) => setDataFinal(e.target.value)}
            className="border border-white/20 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
          />
        </div>
      </div>

      {/* Tabela de Produções */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]"></div>
        </div>
      ) : (
        <div className="bg-[#12141f] rounded-lg border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase">Lote</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase">Ficha</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase">Qtd</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase">Data</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase">Responsável</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {filteredProducoes.map((producao) => (
                  <tr key={producao.id} className="hover:bg-white/10/5">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <Package className="w-4 h-4 text-[#7D1F2C] mr-2" />
                        <span className="font-mono text-sm font-medium">{producao.lote_producao}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-white">{producao.ficha_nome}</div>
                      {producao.estoque_destino_nome && (
                        <div className="text-xs text-white/40">→ {producao.estoque_destino_nome}</div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        <div className="font-medium">{producao.quantidade}</div>
                        {producao.quantidade_aprovada !== undefined && (
                          <div className="text-xs text-green-400">✓ {producao.quantidade_aprovada}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {dayjs(producao.data_producao).format('DD/MM/YYYY')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {producao.responsavel || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(producao.status)}`}>
                        {getStatusIcon(producao.status)}
                        <span className="ml-1">{getStatusText(producao.status)}</span>
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex space-x-2">
                        {producao.status === 'planejado' && (
                          <button
                            onClick={() => handleIniciarProducao(producao)}
                            className="text-green-400 hover:text-green-300"
                            title="Iniciar"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        {producao.status === 'em_andamento' && (
                          <button
                            onClick={() => handleAbrirConclusao(producao)}
                            className="text-blue-400 hover:text-blue-300"
                            title="Concluir"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => handleVerDetalhes(producao)}
                          className="text-white/50 hover:text-white/90"
                          title="Detalhes"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(producao.id)}
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

          {filteredProducoes.length === 0 && (
            <div className="text-center py-12">
              <Factory className="w-16 h-16 text-white/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">Nenhuma produção encontrada</h3>
            </div>
          )}
        </div>
      )}

      {/* Modal Formulário */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0f1020] rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-white mb-4">Nova Produção</h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div className="md:col-span-2">
                <SearchableSelect
                  label="Ficha Técnica"
                  options={fichasTecnicas.map(f => ({ value: f.id, label: f.nome }))}
                  value={formData.ficha_id}
                  onChange={(value) => setFormData({ ...formData, ficha_id: value })}
                  placeholder="Selecione..."
                  className="w-full"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Quantidade *</label>
                <input
                  type="number"
                  min="1"
                  value={formData.quantidade}
                  onChange={(e) => setFormData({ ...formData, quantidade: parseInt(e.target.value) || 1 })}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleAdicionarItem}
                  disabled={!formData.ficha_id || formData.quantidade <= 0}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4 inline mr-2" />
                  Adicionar Item
                </button>
              </div>
            </div>

            {itensProducao.length > 0 && (
              <div className="mb-4">
                <h4 className="text-sm font-medium text-white/80 mb-2">Itens para Produção ({itensProducao.length})</h4>
                <div className="border border-white/10 rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">Ficha Técnica</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">Quantidade</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">Custo Total</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {itensProducao.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-2 text-sm">{item.ficha_nome}</td>
                          <td className="px-4 py-2 text-sm">{item.quantidade}</td>
                          <td className="px-4 py-2 text-sm">R$ {item.custo_total.toFixed(2)}</td>
                          <td className="px-4 py-2">
                            <button
                              onClick={() => handleRemoverItem(item.id)}
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
                        <td colSpan={2} className="px-4 py-2 text-sm font-medium text-right">Total:</td>
                        <td className="px-4 py-2 text-sm font-bold">
                          R$ {itensProducao.reduce((sum, item) => sum + item.custo_total, 0).toFixed(2)}
                        </td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t pt-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Data *</label>
                <input
                  type="date"
                  value={formData.data_producao}
                  onChange={(e) => setFormData({ ...formData, data_producao: e.target.value })}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                />
              </div>

              <div>
                <SearchableSelect
                  label="Responsável"
                  options={responsaveis.map(r => ({ value: r, label: r }))}
                  value={formData.responsavel}
                  onChange={(value) => setFormData({ ...formData, responsavel: value })}
                  placeholder="Selecione..."
                  className="w-full"
                />
              </div>

              <div>
                <SearchableSelect
                  label="Estoque Destino *"
                  options={estoques.filter(e => e.tipo !== 'producao').map(e => ({
                    value: e.id,
                    label: e.nome,
                    sublabel: 'Estoque onde o produto final será armazenado'
                  }))}
                  value={formData.estoque_destino_id}
                  onChange={(value) => setFormData({ ...formData, estoque_destino_id: value })}
                  placeholder="Selecione..."
                  required
                  className="w-full"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-white/80 mb-1">Observações</label>
                <textarea
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  rows={3}
                />
              </div>
            </div>

            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => { setShowForm(false); resetForm(); }}
                className="px-4 py-2 border border-white/20 rounded-md text-white/80 hover:bg-white/10/5"
              >
                Cancelar
              </button>
              <button
                onClick={handleVerificarInsumos}
                disabled={loading || itensProducao.length === 0 || !formData.estoque_destino_id}
                className="px-4 py-2 bg-[#7D1F2C] text-white rounded-md hover:bg-[#6a1a25] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? 'Processando...' : `Confirmar Produção (${itensProducao.length} ${itensProducao.length === 1 ? 'item' : 'itens'})`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Verificação de Insumos */}
      {showVerificacao && verificacaoInsumos && (
        <ModalVerificacaoInsumos
          verificacoes={verificacaoInsumos.detalhes}
          disponivel={verificacaoInsumos.disponivel}
          onClose={() => setShowVerificacao(false)}
          onConfirm={handleConfirmarProducao}
        />
      )}

      {/* Modal Concluir Produção */}
      {producaoParaConcluir && (
        <ModalConcluirProducao
          producao={producaoParaConcluir}
          onClose={() => setProducaoParaConcluir(null)}
          onConfirm={handleConcluirProducao}
        />
      )}

      {/* Modal Detalhes */}
      {showDetalhes && producaoDetalhes && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0f1020] rounded-lg p-6 w-full max-w-6xl max-h-[90vh] overflow-y-auto border border-white/10">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium text-white">
                Detalhes da Produção - {producaoDetalhes.producao.lote_producao}
              </h3>
              <button onClick={() => setShowDetalhes(false)}>
                <XCircle className="w-5 h-5 text-white/30 hover:text-white/50" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-500/10 p-4 rounded-lg">
                <div className="text-sm text-blue-400 font-medium">Ficha Técnica</div>
                <div className="text-lg font-bold text-blue-300">{producaoDetalhes.producao.ficha_nome}</div>
              </div>
              <div className="bg-green-500/10 p-4 rounded-lg">
                <div className="text-sm text-green-400 font-medium">Quantidade</div>
                <div className="text-lg font-bold text-green-300">{producaoDetalhes.producao.quantidade}</div>
              </div>
              <div className="bg-purple-500/10 p-4 rounded-lg">
                <div className="text-sm text-purple-400 font-medium">Custo Total</div>
                <div className="text-lg font-bold text-purple-300">
                  {formatCurrency(producaoDetalhes.producao.custo_total_producao)}
                </div>
              </div>
            </div>


            {producaoDetalhes.reservas.length > 0 && (
              <div className="mb-6">
                <h4 className="font-medium text-white mb-3 flex items-center">
                  <Package className="w-5 h-5 mr-2" />
                  Insumos Reservados
                </h4>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-white/10">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">Insumo</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">Quantidade</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">Estoque</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">Status</th>
                      </tr>
                    </thead>
                    <tbody className="bg-[#12141f] divide-y divide-white/5">
                      {producaoDetalhes.reservas.map((r: any) => (
                        <tr key={r.id}>
                          <td className="px-4 py-2 text-sm">{r.itens_estoque?.nome}</td>
                          <td className="px-4 py-2 text-sm">{r.quantidade_reservada}</td>
                          <td className="px-4 py-2 text-sm">{r.estoques?.nome}</td>
                          <td className="px-4 py-2">
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              r.status_reserva === 'utilizado' ? 'bg-green-500/15 text-green-300' :
                              r.status_reserva === 'cancelado' ? 'bg-red-500/15 text-red-300' :
                              'bg-blue-500/15 text-blue-300'
                            }`}>
                              {r.status_reserva}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <button
                onClick={() => setShowDetalhes(false)}
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

export default ProducaoEstoque;
