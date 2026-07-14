import React, { useState, useEffect } from 'react';
import { TrendingUp, Settings, FileText, CreditCard, Calendar, History, DollarSign, Plus, CreditCard as Edit2, Trash2, Check, X, Save, AlertTriangle, Download, PieChart, Receipt, Link, Link2, Search } from 'lucide-react';
import dayjs from '../lib/dayjs';
import { formatCurrency } from '../utils/currency';
import * as veService from '../services/visaoEstrategica';
import { PageHeader, KPICard, SectionCard } from '../components/ui';

type TabType = 'dashboard' | 'config' | 'despesas' | 'pagamentos' | 'futuro' | 'historico' | 'relatorios';

interface CategoriaEditavelProps {
  categoria: veService.Categoria;
  editMode: boolean;
  semanaAtual: veService.Semana | null;
  onUpdate: (data: { nome?: string; percentual?: number; cor?: string }) => Promise<void>;
  onDelete: () => Promise<void>;
}

const CategoriaEditavel: React.FC<CategoriaEditavelProps> = ({
  categoria,
  editMode,
  semanaAtual,
  onUpdate,
  onDelete
}) => {
  const [nome, setNome] = useState(categoria.nome);
  const [percentual, setPercentual] = useState(categoria.percentual.toString());
  const [cor, setCor] = useState(categoria.cor);
  const [editing, setEditing] = useState(false);

  const handleSave = async () => {
    const updates: any = {};

    if (nome !== categoria.nome) updates.nome = nome;
    if (parseFloat(percentual) !== categoria.percentual) updates.percentual = parseFloat(percentual);
    if (cor !== categoria.cor) updates.cor = cor;

    if (Object.keys(updates).length > 0) {
      await onUpdate(updates);
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setNome(categoria.nome);
    setPercentual(categoria.percentual.toString());
    setCor(categoria.cor);
    setEditing(false);
  };

  if (editMode && editing) {
    return (
      <div className="p-4 bg-[#12141f] rounded-lg border-2 border-blue-500">
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-white/80 mb-2">Categoria (Fixa)</label>
            <p className="font-medium text-white mb-3">{categoria.nome}</p>
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <label className="block text-xs font-medium text-white/80 mb-1">Percentual do Faturamento</label>
              <div className="relative">
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={percentual}
                  onChange={(e) => setPercentual(e.target.value)}
                  className="w-full px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                />
                <span className="absolute right-3 top-2 text-white/40">%</span>
              </div>
            </div>
            <div className="w-32">
              <label className="block text-xs font-medium text-white/80 mb-1">Cor</label>
              <input
                type="color"
                value={cor}
                onChange={(e) => setCor(e.target.value)}
                className="w-full h-[42px] border border-white/20 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          <div className="flex gap-2">
            <button
              onClick={handleSave}
              className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium flex items-center justify-center gap-2"
            >
              <Check className="w-4 h-4" />
              Salvar
            </button>
            <button
              onClick={handleCancel}
              className="px-3 py-2 bg-[#12141f]/10 text-white/60 rounded-lg hover:bg-[#12141f]/15 font-medium"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 bg-[#12141f]/5 rounded-lg border border-white/10">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-4 h-4 rounded-full" style={{ backgroundColor: categoria.cor }} />
          <div>
            <h4 className="font-medium text-white">{categoria.nome}</h4>
            {semanaAtual && (
              <p className="text-sm text-white/40">
                Orçamento: {formatCurrency((semanaAtual.faturamento * categoria.percentual) / 100)}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-2xl font-bold text-white">{categoria.percentual}%</div>
            <div className="text-xs text-white/40">do faturamento</div>
          </div>
          {editMode && (
            <div className="flex gap-2">
              <button
                onClick={() => setEditing(true)}
                className="p-2 text-[#7D1F2C] hover:bg-blue-500/10 rounded-lg"
                title="Editar"
              >
                <Edit2 className="w-4 h-4" />
              </button>
              <button
                onClick={onDelete}
                className="p-2 text-red-400 hover:bg-red-500/10 rounded-lg"
                title="Excluir"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Subcategorias */}
      {categoria.subcategorias && categoria.subcategorias.length > 0 && (
        <div className="mt-3 pt-3 border-t border-white/20">
          <div className="text-xs font-semibold text-white/40 uppercase mb-2">Subcategorias</div>
          <div className="grid grid-cols-2 gap-2">
            {categoria.subcategorias.map(sub => (
              <div key={sub.id} className="flex items-center justify-between text-xs bg-[#12141f] px-2 py-1 rounded border border-white/10">
                <span className="text-white/80">{sub.nome}</span>
                <span className="text-white/40 font-medium">{sub.percentual}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

const VisaoEstrategica: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [loading, setLoading] = useState(true);
  const [categorias, setCategorias] = useState<veService.Categoria[]>([]);
  const [semanaAtual, setSemanaAtual] = useState<veService.Semana | null>(null);
  const [despesas, setDespesas] = useState<veService.Despesa[]>([]);
  const [despesasContasPagar, setDespesasContasPagar] = useState<veService.DespesaContaPagar[]>([]);
  const [contasVencidas, setContasVencidas] = useState<veService.ContaPorCategoria[]>([]);
  const [contasFuturas, setContasFuturas] = useState<veService.ContaPorCategoria[]>([]);
  const [gastos, setGastos] = useState<Record<string, number>>({});

  // Config state
  const [limiteComprometimento, setLimiteComprometimento] = useState(100);
  const [editingCategories, setEditingCategories] = useState(false);
  const [showAdicionarCategoria, setShowAdicionarCategoria] = useState(false);
  const [categoriasDisponiveis, setCategoriasDisponiveis] = useState<any[]>([]);

  // Modal nova categoria
  const [categoriaEditando, setCategoriaEditando] = useState<any>(null);
  const [percentualCategoria, setPercentualCategoria] = useState('');
  const [corCategoria, setCorCategoria] = useState('#3b82f6');
  const [subcategoriasConfig, setSubcategoriasConfig] = useState<Record<string, number>>({});
  const [subcategoriasDisponiveis, setSubcategoriasDisponiveis] = useState<any[]>([]);

  // Semana state
  const [showNovaSemana, setShowNovaSemana] = useState(false);
  const [novoFaturamento, setNovoFaturamento] = useState('');
  const [editandoFaturamento, setEditandoFaturamento] = useState(false);
  const [faturamentoEdit, setFaturamentoEdit] = useState('');
  const [semanasFuturas, setSemanasFuturas] = useState<veService.Semana[]>([]);
  const [semanaFuturaSelecionada, setSemanaFuturaSelecionada] = useState<veService.Semana | null>(null);
  const [gastosFuturos, setGastosFuturos] = useState<Record<string, number>>({});
  const [showNovaSemanaFutura, setShowNovaSemanaFutura] = useState(false);
  const [novaSemanaFutura, setNovaSemanaFutura] = useState({
    data_inicio: '',
    faturamento: ''
  });

  // Despesa state
  const [showNovaDespesa, setShowNovaDespesa] = useState(false);
  const [novaDespesa, setNovaDespesa] = useState({
    fornecedor: '',
    valor: '',
    categoria_id: '',
    subcategoria_id: '',
    descricao: '',
    data_vencimento: dayjs().add(7, 'days').format('YYYY-MM-DD'),
    tipo_lancamento: 'previsao' as 'previsao' | 'realizada'
  });
  const [categoriaDetalhada, setCategoriaDetalhada] = useState<veService.Categoria | null>(null);
  const [showModalDetalhes, setShowModalDetalhes] = useState(false);
  const [tipoVisualizacao, setTipoVisualizacao] = useState<'atual' | 'futura'>('atual');


  // Pagamentos informativos state
  const [todosPagamentosInformativos, setTodosPagamentosInformativos] = useState<any[]>([]);
  const [pagamentoEditando, setPagamentoEditando] = useState<any>(null);
  const [valorEditandoPagamento, setValorEditandoPagamento] = useState('');
  const [observacaoEditandoPagamento, setObservacaoEditandoPagamento] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      // Carregar dados principais primeiro
      const [cats, semana, desps, despCP, vencidas, futuras, semFuturas] = await Promise.all([
        veService.getCategorias(),
        veService.getSemanaAtual(),
        veService.getDespesas(),
        veService.getDespesasContasPagar(),
        veService.getContasVencidasPorCategoria(),
        veService.getContasFuturasPorCategoria(),
        veService.getSemanasFuturas()
      ]);

      setCategorias(cats);
      setSemanaAtual(semana);
      setDespesas(desps);
      setDespesasContasPagar(despCP);
      setContasVencidas(vencidas);
      setContasFuturas(futuras);
      setSemanasFuturas(semFuturas);

      // Calcular gastos com pagamentos informativos
      if (semana) {
        const gastosCalculados = await veService.calcularGastosComPagamentosInformativos(
          desps.filter(d => d.semana_id === semana.id),
          semana.id
        );
        setGastos(gastosCalculados);
      }

      // Calcular gastos futuros - usar primeira semana se não houver seleção
      const semanaParaCalculo = semanaFuturaSelecionada || semFuturas[0];
      if (semanaParaCalculo) {
        const gastosFut = await veService.calcularGastosComPagamentosInformativos(
          desps.filter(d => d.semana_id === semanaParaCalculo.id),
          semanaParaCalculo.id
        );
        setGastosFuturos(gastosFut);

        // Selecionar primeira semana futura se não houver seleção
        if (!semanaFuturaSelecionada && semFuturas.length > 0) {
          setSemanaFuturaSelecionada(semFuturas[0]);
        }
      }

      // Carregar pagamentos separadamente para não bloquear a UI
      try {
        const todosPagamentos = await veService.getTodosPagamentosDetalhados();
        setTodosPagamentosInformativos(todosPagamentos);
      } catch (errorPag) {
        console.error('Erro ao carregar pagamentos:', errorPag);
        setTodosPagamentosInformativos([]);
      }

      if (cats.length > 0 && !novaDespesa.categoria_id) {
        setNovaDespesa(prev => ({ ...prev, categoria_id: cats[0].id }));
      }
    } catch (error: any) {
      console.error('Erro ao carregar dados: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCriarSemana = async () => {
    try {
      const fat = parseFloat(novoFaturamento);
      if (!fat || fat <= 0) {
        alert('Informe um faturamento válido');
        return;
      }

      await veService.criarSemana(fat);
      alert('Semana criada com sucesso!');
      setShowNovaSemana(false);
      setNovoFaturamento('');
      loadData();
    } catch (error: any) {
      console.error('Erro ao criar semana:', error);
      alert('Erro ao criar semana: ' + error.message);
    }
  };

  const handleAtualizarFaturamento = async () => {
    if (!semanaAtual) return;

    try {
      const fat = parseFloat(faturamentoEdit);
      if (!fat || fat <= 0) {
        console.error('Informe um faturamento válido');
        return;
      }

      await veService.atualizarFaturamentoSemana(semanaAtual.id, fat);
      console.log('Faturamento atualizado!');
      setEditandoFaturamento(false);
      loadData();
    } catch (error: any) {
      console.error('Erro ao atualizar: ' + error.message);
    }
  };

  const handleCriarSemanaFutura = async () => {
    try {
      if (!novaSemanaFutura.data_inicio) {
        alert('Informe a data de início da semana');
        return;
      }

      const fat = parseFloat(novaSemanaFutura.faturamento);
      if (!fat || fat <= 0) {
        alert('Informe um faturamento válido');
        return;
      }

      await veService.criarSemanaFutura(novaSemanaFutura.data_inicio, fat);
      alert('Semana futura criada com sucesso!');
      setShowNovaSemanaFutura(false);
      setNovaSemanaFutura({ data_inicio: '', faturamento: '' });
      loadData();
    } catch (error: any) {
      console.error('Erro ao criar semana futura:', error);
      alert('Erro ao criar semana futura: ' + error.message);
    }
  };

  const handleCriarDespesa = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const valor = parseFloat(novaDespesa.valor);
      if (!valor || valor <= 0) {
        alert('Informe um valor válido');
        return;
      }

      if (!novaDespesa.fornecedor) {
        alert('Informe o fornecedor');
        return;
      }

      if (!novaDespesa.categoria_id) {
        alert('Selecione uma categoria');
        return;
      }

      if (!novaDespesa.data_vencimento) {
        alert('Informe a data de vencimento');
        return;
      }

      await veService.criarDespesa({
        semana_id: null,
        fornecedor: novaDespesa.fornecedor,
        valor,
        categoria_id: novaDespesa.categoria_id,
        subcategoria_id: novaDespesa.subcategoria_id || null,
        descricao: novaDespesa.descricao || null,
        data_vencimento: novaDespesa.data_vencimento,
        tipo_lancamento: novaDespesa.tipo_lancamento || 'previsao',
        is_override: false,
        motivo_override: null,
        status: 'ativa',
        conta_pagar_id: null,
        observacao_conversao: null,
        convertido_em: null,
        convertido_por: null
      });

      const tipoMsg = novaDespesa.tipo_lancamento === 'realizada' ? 'confirmada' : 'prevista';
      alert(`Despesa ${tipoMsg} cadastrada com sucesso! Será atribuída automaticamente à semana correspondente.`);
      setShowNovaDespesa(false);
      setNovaDespesa({
        fornecedor: '',
        valor: '',
        categoria_id: '',
        subcategoria_id: '',
        descricao: '',
        data_vencimento: dayjs().add(7, 'days').format('YYYY-MM-DD'),
        tipo_lancamento: 'previsao' as 'previsao' | 'realizada'
      });
      loadData();
    } catch (error: any) {
      console.error('Erro ao criar despesa:', error);
      alert('Erro ao criar despesa: ' + (error.message || 'Erro desconhecido'));
    }
  };

  const handleExcluirDespesa = async (id: string) => {
    if (!confirm('Excluir esta despesa?')) return;

    try {
      await veService.excluirDespesa(id);
      console.log('Despesa excluída!');
      loadData();
    } catch (error: any) {
      console.error('Erro: ' + error.message);
    }
  };

  const handleEditarPagamento = (pagamento: any) => {
    setPagamentoEditando(pagamento);
    setValorEditandoPagamento(pagamento.valor_pago.toString());
    setObservacaoEditandoPagamento(pagamento.observacao || '');
  };

  const handleSalvarEdicaoPagamento = async () => {
    if (!pagamentoEditando) return;

    try {
      const novoValor = parseFloat(valorEditandoPagamento);
      if (!novoValor || novoValor <= 0) {
        alert('Informe um valor válido');
        return;
      }

      await veService.editarPagamentoParcial(
        pagamentoEditando.id,
        novoValor,
        observacaoEditandoPagamento
      );

      console.log('Pagamento atualizado!');
      setPagamentoEditando(null);
      setValorEditandoPagamento('');
      setObservacaoEditandoPagamento('');
      loadData();
    } catch (error: any) {
      console.error('Erro ao editar: ' + error.message);
      alert('Erro ao editar pagamento: ' + error.message);
    }
  };

  const handleExcluirPagamento = async (id: string) => {
    if (!confirm('Excluir este pagamento?')) return;

    try {
      await veService.excluirPagamentoParcial(id);
      console.log('Pagamento excluído!');
      loadData();
    } catch (error: any) {
      console.error('Erro: ' + error.message);
      alert('Erro ao excluir pagamento: ' + error.message);
    }
  };

  // Calculations
  const orcamentos = semanaAtual ? veService.calcularOrcamentos(semanaAtual.faturamento, categorias) : {};
  const orcamentosFuturos = semanaFuturaSelecionada ? veService.calcularOrcamentos(semanaFuturaSelecionada.faturamento, categorias) : {};

  const tabs = [
    { id: 'dashboard' as TabType, label: 'Dashboard', icon: <PieChart className="w-4 h-4" /> },
    { id: 'config' as TabType, label: 'Configurações', icon: <Settings className="w-4 h-4" /> },
    { id: 'despesas' as TabType, label: 'Despesas', icon: <FileText className="w-4 h-4" /> },
    { id: 'pagamentos' as TabType, label: 'Pagamentos', icon: <DollarSign className="w-4 h-4" /> },
    { id: 'futuro' as TabType, label: 'Visão Futura', icon: <Calendar className="w-4 h-4" /> },
    { id: 'relatorios' as TabType, label: 'Relatórios', icon: <Receipt className="w-4 h-4" /> },
    { id: 'historico' as TabType, label: 'Histórico', icon: <History className="w-4 h-4" /> },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-white/40">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0f1a]">
      <div className="bg-[#12141f] border-b border-white/10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-white flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-[#7D1F2C]" />
              Visão Estratégica
            </h1>
            <p className="mt-2 text-sm text-white/60">
              Controle de fluxo de caixa semanal com categorias percentuais
            </p>
          </div>

          {/* Tabs */}
          <div className="flex space-x-1 border-b border-white/10">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-[#7D1F2C] text-[#7D1F2C]'
                    : 'border-transparent text-white/40 hover:text-white/80 hover:border-white/20'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* DASHBOARD TAB */}
        {activeTab === 'dashboard' && (
          <div className="space-y-6">
            {!semanaAtual || showNovaSemana ? (
              <div className="bg-[#12141f] rounded-lg border border-white/10 p-8 text-center">
                <DollarSign className="w-16 h-16 text-[#7D1F2C] mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-white mb-2">Criar Nova Semana</h2>
                <p className="text-white/60 mb-6">
                  Informe o faturamento previsto para calcular os orçamentos
                </p>

                <div className="max-w-md mx-auto">
                  <input
                    type="number"
                    step="0.01"
                    value={novoFaturamento}
                    onChange={(e) => setNovoFaturamento(e.target.value)}
                    placeholder="Ex: 100000.00"
                    className="w-full px-4 py-3 text-center text-2xl font-bold border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C] bg-white/5 text-white"
                  />
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={handleCriarSemana}
                      className="flex-1 bg-[#7D1F2C] text-white px-6 py-3 rounded-lg hover:bg-[#6a1a25] font-medium"
                    >
                      Criar Semana
                    </button>
                    {semanaAtual && (
                      <button
                        onClick={() => setShowNovaSemana(false)}
                        className="px-6 py-3 bg-[#12141f]/10 text-white/60 rounded-lg hover:bg-[#12141f]/15 font-medium"
                      >
                        Cancelar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <>
                {/* Header da Semana */}
                <div className="bg-[#12141f] rounded-lg border border-white/10 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-sm font-medium text-white/40">Faturamento Base</h3>
                      {editandoFaturamento ? (
                        <div className="flex items-center gap-2 mt-2">
                          <input
                            type="number"
                            step="0.01"
                            value={faturamentoEdit}
                            onChange={(e) => setFaturamentoEdit(e.target.value)}
                            className="text-3xl font-bold border-b-2 border-[#7D1F2C] focus:outline-none w-64 bg-transparent text-white"
                            autoFocus
                          />
                          <button onClick={handleAtualizarFaturamento} className="text-green-400 hover:text-green-400">
                            <Check className="w-6 h-6" />
                          </button>
                          <button onClick={() => setEditandoFaturamento(false)} className="text-white/60 hover:text-white/80">
                            <X className="w-6 h-6" />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-3">
                          <p className="text-4xl font-bold text-white">{formatCurrency(semanaAtual.faturamento)}</p>
                          <button
                            onClick={() => {
                              setFaturamentoEdit(semanaAtual.faturamento.toString());
                              setEditandoFaturamento(true);
                            }}
                            className="text-white/30 hover:text-white/60"
                          >
                            <Edit2 className="w-5 h-5" />
                          </button>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm text-white/40">Período da Semana</p>
                        <p className="text-lg font-medium text-white">
                          {dayjs(semanaAtual.data_inicio).format('DD/MM/YYYY')} - {dayjs(semanaAtual.data_inicio).add(6, 'days').format('DD/MM/YYYY')}
                        </p>
                        <p className="text-xs text-white/30 mt-1">
                          Última dia: {dayjs(semanaAtual.data_inicio).add(6, 'days').format('dddd, DD/MM')}
                        </p>
                      </div>
                      <button
                        onClick={() => setShowNovaSemana(true)}
                        className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] font-medium flex items-center gap-2"
                      >
                        <Plus className="w-4 h-4" />
                        Nova Semana
                      </button>
                    </div>
                  </div>
                </div>

                {/* Potes de Categoria */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {categorias.map((cat) => {
                    const orcamento = orcamentos[cat.id] || 0;
                    const gasto = gastos[cat.id] || 0;
                    const disponivel = orcamento - gasto;
                    const percentualUsado = orcamento > 0 ? (gasto / orcamento) * 100 : 0;

                    return (
                      <div
                        key={cat.id}
                        onClick={() => {
                          setCategoriaDetalhada(cat);
                          setTipoVisualizacao('atual');
                          setShowModalDetalhes(true);
                        }}
                        className="bg-[#12141f] rounded-lg border border-white/10 p-6 cursor-pointer hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2">
                            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cat.cor }} />
                            <h3 className="font-medium text-white">{cat.nome}</h3>
                          </div>
                          <span className="text-xs font-medium text-white/40">{cat.percentual}%</span>
                        </div>

                        <div className="space-y-2 mb-4">
                          <div className="flex justify-between text-sm">
                            <span className="text-white/60">Orçamento</span>
                            <span className="font-medium">{formatCurrency(orcamento)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-white/60">Gasto</span>
                            <span className="font-medium text-red-400">{formatCurrency(gasto)}</span>
                          </div>
                          <div className="flex justify-between text-sm">
                            <span className="text-white/60">Disponível</span>
                            <span className="font-medium text-green-400">{formatCurrency(disponivel)}</span>
                          </div>
                        </div>

                        {/* Progress Bar */}
                        <div className="relative pt-1">
                          <div className="flex mb-2 items-center justify-between">
                            <div>
                              <span className={`text-xs font-semibold inline-block ${
                                percentualUsado > 90 ? 'text-red-400' : percentualUsado > 70 ? 'text-yellow-400' : 'text-green-400'
                              }`}>
                                {percentualUsado.toFixed(1)}%
                              </span>
                            </div>
                          </div>
                          <div className="overflow-hidden h-2 text-xs flex rounded bg-white/10">
                            <div
                              style={{ width: `${Math.min(percentualUsado, 100)}%`, backgroundColor: cat.cor }}
                              className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center transition-all duration-500"
                            />
                          </div>
                        </div>

                        {/* Subcategorias */}
                        {cat.subcategorias && cat.subcategorias.length > 0 && (
                          <div className="mt-4 pt-4 border-t border-white/10">
                            <h4 className="text-xs font-semibold text-white/40 uppercase mb-3">Subcategorias</h4>
                            <div className="space-y-2">
                              {cat.subcategorias.map((sub) => {
                                const subKey = `${cat.id}_${sub.id}`;
                                const subOrc = orcamentos[subKey] || 0;
                                const subGasto = gastos[subKey] || 0;
                                const subDisponivel = subOrc - subGasto;
                                const subPercent = subOrc > 0 ? (subGasto / subOrc) * 100 : 0;

                                return (
                                  <div key={sub.id} className="space-y-1">
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="text-white/80 font-medium">{sub.nome}</span>
                                      <span className="text-white/40">{sub.percentual}%</span>
                                    </div>
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="text-white/40">
                                        {formatCurrency(subGasto)} / {formatCurrency(subOrc)}
                                      </span>
                                      <span className={`font-medium ${
                                        subDisponivel < 0 ? 'text-red-400' : 'text-green-400'
                                      }`}>
                                        {formatCurrency(subDisponivel)}
                                      </span>
                                    </div>
                                    <div className="overflow-hidden h-1 rounded bg-[#12141f]/10">
                                      <div
                                        style={{
                                          width: `${Math.min(subPercent, 100)}%`,
                                          backgroundColor: subPercent > 90 ? '#dc2626' : subPercent > 70 ? '#f59e0b' : cat.cor
                                        }}
                                        className="h-full transition-all duration-500"
                                      />
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* DESPESAS TAB */}
        {activeTab === 'despesas' && (
          <DespesasTab
            despesasContasPagar={despesasContasPagar}
            despesasManuais={despesas}
            semanaAtual={semanaAtual}
            semanasFuturas={semanasFuturas}
            categorias={categorias}
            onReload={loadData}
            onExcluirDespesa={handleExcluirDespesa}
            onCriarDespesa={handleCriarDespesa}
            novaDespesa={novaDespesa}
            setNovaDespesa={setNovaDespesa}
          />
        )}

        {/* PAGAMENTOS TAB */}
        {activeTab === 'pagamentos' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-2xl font-bold text-white">Pagamentos Registrados</h2>
                <p className="text-sm text-white/60 mt-1">Gerenciar pagamentos informativos feitos no planejamento</p>
              </div>
            </div>

            <div className="bg-[#12141f] rounded-lg border border-white/10 overflow-hidden">
              <table className="min-w-full divide-y divide-white/10">
                <thead className="bg-[#1a1d2e]">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                      Fornecedor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                      Descrição
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                      Categoria
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                      Vencimento
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                      Data Pagamento
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-white/40 uppercase tracking-wider">
                      Valor Pago
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-white/40 uppercase tracking-wider">
                      Valor Total
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                      Semana
                    </th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-white/40 uppercase tracking-wider">
                      Ações
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-[#12141f] divide-y divide-white/10">
                  {todosPagamentosInformativos.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="px-6 py-12 text-center text-sm text-white/40">
                        Nenhum pagamento registrado ainda
                      </td>
                    </tr>
                  ) : (
                    todosPagamentosInformativos.map((pagamento: any) => (
                      <tr key={pagamento.id} className="hover:bg-[#12141f]/5">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">
                          {pagamento.fornecedor_nome}
                        </td>
                        <td className="px-6 py-4 text-sm text-white/60">
                          {pagamento.descricao || '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-white/60">
                          <div className="flex flex-col">
                            <span className="font-medium">{pagamento.categoria_nome}</span>
                            {pagamento.subcategoria_nome && (
                              <span className="text-xs text-white/40">{pagamento.subcategoria_nome}</span>
                            )}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white/60">
                          {dayjs(pagamento.data_vencimento).format('DD/MM/YYYY')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                          {dayjs(pagamento.data_pagamento_informativo).format('DD/MM/YYYY')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-bold text-green-400">
                          {formatCurrency(pagamento.valor_pago)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-white/60">
                          {formatCurrency(pagamento.valor_total_conta)}
                        </td>
                        <td className="px-6 py-4 text-sm text-white/60">
                          <div className="flex flex-col">
                            <span>{dayjs(pagamento.semana_data_inicio).format('DD/MM/YYYY')}</span>
                            <span className="text-xs text-white/40">{formatCurrency(pagamento.semana_faturamento)}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-center text-sm">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={() => handleEditarPagamento(pagamento)}
                              className="text-[#7D1F2C] hover:text-blue-300 p-1 rounded hover:bg-blue-500/10"
                              title="Editar pagamento"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleExcluirPagamento(pagamento.id)}
                              className="text-red-400 hover:text-red-300 p-1 rounded hover:bg-red-500/10"
                              title="Excluir pagamento"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {pagamentoEditando && (
              <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
                <div className="bg-[#0f1020] rounded-lg p-6 max-w-md w-full mx-4">
                  <h3 className="text-lg font-bold text-white mb-4">Editar Pagamento</h3>

                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-1">Fornecedor</label>
                      <input
                        type="text"
                        value={pagamentoEditando.fornecedor_nome}
                        disabled
                        className="w-full px-3 py-2 border border-white/20 rounded-lg bg-[#12141f]/10 text-white/60"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-1">Valor Pago</label>
                      <input
                        type="number"
                        step="0.01"
                        value={valorEditandoPagamento}
                        onChange={(e) => setValorEditandoPagamento(e.target.value)}
                        className="w-full px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                        autoFocus
                      />
                      <p className="text-xs text-white/40 mt-1">
                        Valor total da conta: {formatCurrency(pagamentoEditando.valor_total_conta)}
                      </p>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-1">Observação</label>
                      <textarea
                        value={observacaoEditandoPagamento}
                        onChange={(e) => setObservacaoEditandoPagamento(e.target.value)}
                        className="w-full px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                        rows={3}
                        placeholder="Observações sobre este pagamento (opcional)"
                      />
                    </div>
                  </div>

                  <div className="mt-6 flex gap-2">
                    <button
                      onClick={handleSalvarEdicaoPagamento}
                      className="flex-1 bg-[#7D1F2C] text-white px-4 py-2 rounded-lg hover:bg-[#6a1a25] font-medium"
                    >
                      Salvar
                    </button>
                    <button
                      onClick={() => {
                        setPagamentoEditando(null);
                        setValorEditandoPagamento('');
                        setObservacaoEditandoPagamento('');
                      }}
                      className="flex-1 bg-[#12141f]/10 text-white/60 px-4 py-2 rounded-lg hover:bg-[#12141f]/15 font-medium"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* CONFIGURAÇÕES TAB */}
        {activeTab === 'config' && (
          <div className="space-y-6">
            <h2 className="text-2xl font-bold text-white">Configurações e Previsões</h2>

            {/* Gestão de Semanas Futuras */}
            <div className="bg-[#12141f] rounded-lg border border-white/10 p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-white">Semanas Futuras</h3>
                  <p className="text-sm text-white/60 mt-1">
                    Crie semanas futuras para planejar compromissos antecipadamente
                  </p>
                </div>
                <button
                  onClick={() => setShowNovaSemanaFutura(true)}
                  className="bg-[#7D1F2C] text-white px-4 py-2 rounded-lg hover:bg-[#6a1a25] flex items-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  Nova Semana Futura
                </button>
              </div>

              {showNovaSemanaFutura && (
                <div className="bg-blue-500/10 border border-[#7D1F2C]/40 rounded-lg p-4 mb-4">
                  <h4 className="font-medium text-white mb-3">Criar Nova Semana Futura</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-1">
                        Data de Início (Segunda-feira)
                      </label>
                      <input
                        type="date"
                        value={novaSemanaFutura.data_inicio}
                        onChange={(e) => setNovaSemanaFutura({ ...novaSemanaFutura, data_inicio: e.target.value })}
                        className="w-full px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white/80 mb-1">
                        Faturamento Previsto
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={novaSemanaFutura.faturamento}
                        onChange={(e) => setNovaSemanaFutura({ ...novaSemanaFutura, faturamento: e.target.value })}
                        placeholder="Ex: 100000.00"
                        className="w-full px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={handleCriarSemanaFutura}
                      className="bg-[#7D1F2C] text-white px-4 py-2 rounded-lg hover:bg-[#6a1a25]"
                    >
                      Criar Semana
                    </button>
                    <button
                      onClick={() => {
                        setShowNovaSemanaFutura(false);
                        setNovaSemanaFutura({ data_inicio: '', faturamento: '' });
                      }}
                      className="bg-[#12141f]/10 text-white/60 px-4 py-2 rounded-lg hover:bg-[#12141f]/15"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {semanasFuturas.length > 0 ? (
                <div className="space-y-3">
                  {semanasFuturas.map((sem) => (
                    <div key={sem.id} className="flex justify-between items-center p-4 bg-[#12141f]/5 rounded-lg border border-white/10">
                      <div>
                        <p className="font-medium text-white">
                          Semana de {dayjs(sem.data_inicio).format('DD/MM/YYYY')}
                        </p>
                        <p className="text-sm text-white/60">
                          Faturamento: {formatCurrency(sem.faturamento)}
                        </p>
                      </div>
                      <button
                        onClick={async () => {
                          if (confirm('Excluir esta semana futura?')) {
                            await veService.excluirSemana(sem.id);
                            loadData();
                          }
                        }}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-white/40 py-4">
                  Nenhuma semana futura criada
                </p>
              )}
            </div>

            {/* Previsão de Gastos por Categoria */}
            <div className="bg-[#12141f] rounded-lg border border-white/10 p-6">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold text-white">Previsão de Gastos por Categoria</h3>
                  <p className="text-sm text-white/60 mt-1">
                    Percentuais definidos para cada categoria. O faturamento da semana é distribuído automaticamente.
                  </p>
                </div>
                <button
                  onClick={() => setEditingCategories(!editingCategories)}
                  className={`px-4 py-2 rounded-lg font-medium flex items-center gap-2 ${
                    editingCategories
                      ? 'bg-white/10 text-white/60 hover:bg-white/15'
                      : 'bg-[#7D1F2C] text-white hover:bg-[#6a1a25]'
                  }`}
                >
                  <Edit2 className="w-4 h-4" />
                  {editingCategories ? 'Cancelar' : 'Editar'}
                </button>
              </div>

              <div className="space-y-4">
                {categorias.map((cat, idx) => (
                  <CategoriaEditavel
                    key={cat.id}
                    categoria={cat}
                    editMode={editingCategories}
                    semanaAtual={semanaAtual}
                    onUpdate={async (updated) => {
                      // Atualizar apenas percentual e cor
                      if (updated.percentual !== undefined) {
                        await veService.configurarCategoriaPercentual(
                          cat.id,
                          updated.percentual,
                          updated.cor || cat.cor,
                          cat.ordem
                        );
                      }
                      loadData();
                    }}
                    onDelete={async () => {
                      if (confirm(`Tem certeza que deseja remover "${cat.nome}" da Visão Estratégica?`)) {
                        await veService.removerCategoriaConfig(cat.id);
                        loadData();
                      }
                    }}
                  />
                ))}
              </div>

              {categorias.length === 0 && (
                <p className="text-center text-white/40 py-8">
                  Nenhuma categoria configurada. Clique em "Adicionar Categoria" para começar.
                </p>
              )}

              {editingCategories && (
                <>
                  <button
                    onClick={async () => {
                      const disponiveis = await veService.getCategoriasDisponiveis();
                      setCategoriasDisponiveis(disponiveis);
                      setShowAdicionarCategoria(true);
                    }}
                    className="w-full mt-4 px-4 py-3 border-2 border-dashed border-white/20 rounded-lg text-white/60 hover:border-[#7D1F2C] hover:text-[#7D1F2C] font-medium flex items-center justify-center gap-2"
                  >
                    <Plus className="w-5 h-5" />
                    Adicionar Categoria do Plano de Contas
                  </button>

                  <div className="mt-6 p-4 bg-[#12141f]/5 rounded-lg border border-white/10">
                    <p className="text-sm text-white/60 mb-2">
                      <strong>Nota:</strong> As categorias vêm do Plano de Contas em "Cadastros Gerais" - "Categorias Financeiras".
                    </p>
                    <p className="text-sm text-white/60">
                      Configure apenas os percentuais aqui. Para criar novas categorias, vá até Cadastros Gerais.
                    </p>
                  </div>
                </>
              )}

              {categorias.length > 0 && (
                <div className="mt-6 p-4 bg-blue-500/10 rounded-lg border border-[#7D1F2C]/40">
                  <div className="flex justify-between items-center">
                    <span className="text-sm font-medium text-blue-300">Total de Percentuais:</span>
                    <span className="text-xl font-bold text-blue-300">
                      {categorias.reduce((acc, cat) => acc + cat.percentual, 0).toFixed(1)}%
                    </span>
                  </div>
                  {categorias.reduce((acc, cat) => acc + cat.percentual, 0) !== 100 && (
                    <p className="text-xs text-amber-400 mt-2">
                      <AlertTriangle className="w-3 h-3 inline mr-1" />
                      Atenção: A soma dos percentuais deve ser 100%
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Contas Vencidas por Categoria */}
            <div className="bg-[#12141f] rounded-lg border border-white/10 p-6">
              <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                <AlertTriangle className="w-6 h-6 text-red-400" />
                Contas Vencidas por Categoria
              </h3>

              {contasVencidas.length > 0 ? (
                <div className="space-y-4">
                  {contasVencidas.map((conta) => (
                    <div key={conta.categoria_id} className="p-4 bg-red-500/8 rounded-lg border border-red-500/20">
                      <div className="flex justify-between items-center mb-2">
                        <h4 className="font-medium text-white">{conta.categoria_nome}</h4>
                        <span className="text-xs bg-red-500/15 text-red-300 px-2 py-1 rounded">
                          {conta.quantidade_contas} conta{conta.quantidade_contas !== 1 ? 's' : ''}
                        </span>
                      </div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                          <p className="text-white/60">Total Vencido</p>
                          <p className="font-bold text-red-400">{formatCurrency(conta.total_vencido || 0)}</p>
                        </div>
                        <div>
                          <p className="text-white/60">Valor Original</p>
                          <p className="font-medium text-white">{formatCurrency(conta.valor_total_original)}</p>
                        </div>
                        <div>
                          <p className="text-white/60">Já Pago</p>
                          <p className="font-medium text-green-400">{formatCurrency(conta.valor_ja_pago)}</p>
                        </div>
                        <div>
                          <p className="text-white/60">Vencimento Mais Antigo</p>
                          <p className="font-medium text-white/80">
                            {conta.vencimento_mais_antigo ? dayjs(conta.vencimento_mais_antigo).format('DD/MM/YYYY') : '-'}
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-center text-white/40 py-8">Nenhuma conta vencida</p>
              )}
            </div>
          </div>
        )}

        {/* VISÃO FUTURA TAB */}
        {activeTab === 'futuro' && (
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-2xl font-bold text-white">Visão Futura - Orçamento Comprometido</h2>
            </div>

            {semanasFuturas.length === 0 ? (
              <div className="bg-[#12141f] rounded-lg border border-white/10 p-12 text-center">
                <Calendar className="w-16 h-16 text-white/20 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Nenhuma semana futura criada</h3>
                <p className="text-white/40">Crie semanas futuras na aba "Configurações" para visualizar os compromissos</p>
              </div>
            ) : (
              <>
                {/* Seletor de Semana */}
                <div className="bg-[#12141f] rounded-lg border border-white/10 p-6">
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Selecione a Semana Futura
                  </label>
                  <select
                    value={semanaFuturaSelecionada?.id || ''}
                    onChange={(e) => {
                      const semana = semanasFuturas.find(s => s.id === e.target.value);
                      if (semana) {
                        setSemanaFuturaSelecionada(semana);
                        // Recalcular gastos para esta semana
                        veService.calcularGastosComPagamentosInformativos(
                          despesas.filter(d => d.semana_id === semana.id),
                          semana.id
                        ).then(gastosFut => setGastosFuturos(gastosFut));
                      }
                    }}
                    className="w-full px-4 py-3 bg-[#12141f]/5 border border-white/20 rounded-lg text-white placeholder-white/30 focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C] text-lg font-medium"
                  >
                    {semanasFuturas.map(sem => (
                      <option key={sem.id} value={sem.id}>
                        Semana de {dayjs(sem.data_inicio).format('DD/MM/YYYY')} - Faturamento: {formatCurrency(sem.faturamento)}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Dashboard da Semana Futura */}
                {semanaFuturaSelecionada && (
                  <div className="bg-[#12141f] rounded-lg shadow-sm border border-white/10 p-6">
                    <div className="flex justify-between items-center mb-6">
                      <div>
                        <h3 className="text-2xl font-bold text-white">
                          Semana de {dayjs(semanaFuturaSelecionada.data_inicio).format('DD/MM/YYYY')}
                        </h3>
                        <p className="text-white/60">Orçamento Comprometido</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-white/60">Faturamento Previsto</p>
                        <p className="text-3xl font-bold text-[#7D1F2C]">{formatCurrency(semanaFuturaSelecionada.faturamento)}</p>
                      </div>
                    </div>

                    <div className="space-y-4">
                      {categorias.map((cat, idx) => {
                        const orcamento = (semanaFuturaSelecionada.faturamento * cat.percentual) / 100;
                        const gasto = gastosFuturos[cat.id] || 0;
                        const saldo = orcamento - gasto;
                        const percentualGasto = orcamento > 0 ? (gasto / orcamento) * 100 : 0;
                        const isOverBudget = percentualGasto > limiteComprometimento;

                        return (
                          <div
                            key={cat.id}
                            onClick={() => {
                              setCategoriaDetalhada(cat);
                              setTipoVisualizacao('futura');
                              setShowModalDetalhes(true);
                            }}
                            className={`bg-[#12141f] rounded-lg border-2 p-4 transition-all cursor-pointer hover:shadow-md ${
                              isOverBudget ? 'border-red-500 shadow-lg' : 'border-white/10'
                            }`}
                          >
                            <div className="flex justify-between items-start mb-2">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-4 h-4 rounded"
                                  style={{ backgroundColor: cat.cor }}
                                />
                                <h4 className="font-semibold text-white">{cat.nome}</h4>
                              </div>
                              <div className="text-right">
                                <p className="text-sm text-white/60">
                                  {formatCurrency(gasto)} / {formatCurrency(orcamento)}
                                </p>
                                <p className={`text-xs font-medium ${saldo >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                  Saldo: {formatCurrency(saldo)}
                                </p>
                              </div>
                            </div>

                            <div className="relative w-full bg-white/10 rounded-full h-3 overflow-hidden">
                              <div
                                className={`absolute top-0 left-0 h-full rounded-full transition-all ${
                                  isOverBudget ? 'bg-red-500' : 'bg-[#7D1F2C]'
                                }`}
                                style={{ width: `${Math.min(percentualGasto, 100)}%` }}
                              />
                              {percentualGasto > 100 && (
                                <div
                                  className="absolute top-0 left-0 h-full bg-red-700 animate-pulse"
                                  style={{ width: `${Math.min((percentualGasto - 100), 100)}%` }}
                                />
                              )}
                            </div>

                            <div className="flex justify-between items-center mt-2">
                              <span className="text-xs text-white/60">
                                {percentualGasto.toFixed(1)}% comprometido
                              </span>
                              {isOverBudget && (
                                <span className="text-xs font-bold text-red-400 animate-pulse">
                                  ACIMA DO LIMITE!
                                </span>
                              )}
                            </div>

                            {/* Subcategorias */}
                            {cat.subcategorias && cat.subcategorias.length > 0 && (
                              <div className="mt-3 pl-6 space-y-2 border-l-2 border-white/10">
                                {cat.subcategorias.map(sub => {
                                  const orcamentoSub = (semanaFuturaSelecionada.faturamento * sub.percentual) / 100;
                                  const gastoSub = gastosFuturos[`${cat.id}_${sub.id}`] || 0;
                                  const saldoSub = orcamentoSub - gastoSub;
                                  const percentualSub = orcamentoSub > 0 ? (gastoSub / orcamentoSub) * 100 : 0;

                                  return (
                                    <div key={sub.id} className="text-sm">
                                      <div className="flex justify-between items-center mb-1">
                                        <span className="text-white/80">{sub.nome}</span>
                                        <span className="text-white/60">
                                          {formatCurrency(gastoSub)} / {formatCurrency(orcamentoSub)}
                                        </span>
                                      </div>
                                      <div className="relative w-full bg-[#12141f]/10 rounded-full h-2 overflow-hidden">
                                        <div
                                          className="absolute top-0 left-0 h-full bg-[#7D1F2C] rounded-full"
                                          style={{ width: `${Math.min(percentualSub, 100)}%` }}
                                        />
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* Resumo Geral */}
                    <div className="mt-6 bg-[#12141f] rounded-lg border border-[#7D1F2C]/60 p-6">
                      <div className="grid grid-cols-3 gap-6 text-center">
                        <div>
                          <p className="text-sm text-white/60 mb-1">Total Orçado</p>
                          <p className="text-2xl font-bold text-white">
                            {formatCurrency(semanaFuturaSelecionada.faturamento)}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-white/60 mb-1">Total Comprometido</p>
                          <p className="text-2xl font-bold text-[#7D1F2C]">
                            {formatCurrency(
                              Object.entries(gastosFuturos)
                                .filter(([key]) => !key.includes('_'))
                                .reduce((sum, [, valor]) => sum + valor, 0)
                            )}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-white/60 mb-1">Saldo Disponível</p>
                          <p className={`text-2xl font-bold ${
                            (semanaFuturaSelecionada.faturamento - Object.entries(gastosFuturos)
                              .filter(([key]) => !key.includes('_'))
                              .reduce((sum, [, valor]) => sum + valor, 0)) >= 0
                              ? 'text-green-400'
                              : 'text-red-400'
                          }`}>
                            {formatCurrency(semanaFuturaSelecionada.faturamento - Object.entries(gastosFuturos)
                              .filter(([key]) => !key.includes('_'))
                              .reduce((sum, [, valor]) => sum + valor, 0))}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* RELATÓRIOS TAB */}
        {activeTab === 'relatorios' && (
          <RelatoriosTab />
        )}

        {activeTab === 'historico' && (
          <div className="bg-[#12141f] rounded-lg border border-white/10 p-6">
            <h2 className="text-2xl font-bold text-white mb-6">Histórico</h2>
            <p className="text-white/60">
              Histórico de semanas anteriores. Em desenvolvimento.
            </p>
          </div>
        )}
      </div>

      {/* Modal Adicionar Categoria */}
      {showAdicionarCategoria && !categoriaEditando && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#12141f] rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Adicionar Categoria do Plano de Contas</h3>
              <button
                onClick={() => setShowAdicionarCategoria(false)}
                className="text-white/30 hover:text-white/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">
              {categoriasDisponiveis.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-white/40">Todas as categorias de despesa já estão configuradas!</p>
                  <p className="text-sm text-white/30 mt-2">
                    Para adicionar novas categorias, vá até Cadastros Gerais - Categorias Financeiras.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {categoriasDisponiveis.map((cat) => (
                    <div
                      key={cat.id}
                      className="flex items-center justify-between p-4 border border-white/10 rounded-lg hover:border-blue-500 hover:bg-blue-500/10 transition-colors cursor-pointer"
                      onClick={async () => {
                        // Buscar subcategorias se existir
                        if (cat.tem_filhas) {
                          const subs = await veService.getSubcategorias(cat.id);
                          setSubcategoriasDisponiveis(subs);
                        } else {
                          setSubcategoriasDisponiveis([]);
                        }

                        setCategoriaEditando(cat);
                        setPercentualCategoria('');
                        setCorCategoria('#3b82f6');
                        setSubcategoriasConfig({});
                      }}
                    >
                      <div>
                        <h4 className="font-medium text-white">{cat.nome}</h4>
                        {cat.descricao && (
                          <p className="text-sm text-white/40 mt-1">{cat.descricao}</p>
                        )}
                        {cat.tem_filhas && (
                          <p className="text-xs text-[#7D1F2C] mt-1">Possui subcategorias</p>
                        )}
                      </div>
                      <Plus className="w-5 h-5 text-[#7D1F2C]" />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setShowAdicionarCategoria(false)}
                className="px-4 py-2 bg-white/10 text-white/60 rounded-lg hover:bg-white/15"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Configurar Categoria */}
      {categoriaEditando && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#12141f] rounded-lg max-w-2xl w-full max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Configurar: {categoriaEditando.nome}</h3>
              <button
                onClick={() => {
                  setCategoriaEditando(null);
                  setSubcategoriasDisponiveis([]);
                }}
                className="text-white/30 hover:text-white/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(80vh-200px)] space-y-6">
              {/* Cor */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">Cor da Categoria</label>
                <div className="flex items-center gap-4 mb-3">
                  <input
                    type="color"
                    value={corCategoria}
                    onChange={(e) => setCorCategoria(e.target.value)}
                    className="w-20 h-12 border-2 border-white/20 rounded-lg cursor-pointer"
                  />
                  <div
                    className="flex-1 h-12 rounded-lg border-2 border-white/20"
                    style={{ backgroundColor: corCategoria }}
                  />
                  <span className="text-sm text-white/60 font-mono">{corCategoria}</span>
                </div>
                <div className="flex gap-2">
                  <span className="text-xs text-white/40">Sugestões:</span>
                  {['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#6b7280'].map((cor) => (
                    <button
                      key={cor}
                      onClick={() => setCorCategoria(cor)}
                      className="w-8 h-8 rounded-full border-2 border-white/20 hover:scale-110 transition-transform"
                      style={{ backgroundColor: cor }}
                      title={cor}
                    />
                  ))}
                </div>
              </div>

              {/* Subcategorias */}
              {subcategoriasDisponiveis.length > 0 ? (
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-3">
                    Configure o percentual de cada subcategoria
                  </label>
                  <p className="text-xs text-white/40 mb-4">
                    O percentual da categoria principal será a soma dos percentuais das subcategorias.
                  </p>

                  <div className="space-y-2">
                    {subcategoriasDisponiveis.map((sub) => (
                      <div key={sub.id} className="flex items-center gap-3 bg-[#12141f]/5 p-3 rounded-lg">
                        <div className="flex-1">
                          <span className="text-sm font-medium text-white">{sub.nome}</span>
                        </div>
                        <div className="w-32 relative">
                          <input
                            type="number"
                            step="0.1"
                            min="0"
                            max="100"
                            value={subcategoriasConfig[sub.id] || 0}
                            onChange={(e) => {
                              setSubcategoriasConfig({
                                ...subcategoriasConfig,
                                [sub.id]: parseFloat(e.target.value) || 0
                              });
                            }}
                            className="w-full px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C] text-right pr-8"
                            placeholder="0"
                          />
                          <span className="absolute right-3 top-2.5 text-white/40 text-sm">%</span>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-4 p-4 bg-blue-500/10 rounded-lg border border-[#7D1F2C]/40">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-blue-300">
                        Total da categoria "{categoriaEditando.nome}":
                      </span>
                      <span className="text-xl font-bold text-blue-300">
                        {Object.values(subcategoriasConfig).reduce((sum, val) => sum + val, 0).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-2">
                    Percentual do Faturamento
                  </label>
                  <div className="relative">
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      max="100"
                      value={percentualCategoria}
                      onChange={(e) => setPercentualCategoria(e.target.value)}
                      className="w-full px-4 py-3 bg-[#12141f]/5 border border-white/20 rounded-lg text-white placeholder-white/30 focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C] text-right pr-12 text-lg"
                      placeholder="Ex: 35"
                    />
                    <span className="absolute right-4 top-3.5 text-white/40 text-lg">%</span>
                  </div>
                  <p className="text-xs text-white/40 mt-2">
                    Este percentual será aplicado sobre o faturamento semanal.
                  </p>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
              <button
                onClick={() => {
                  setCategoriaEditando(null);
                  setSubcategoriasDisponiveis([]);
                }}
                className="px-4 py-2 bg-white/10 text-white/60 rounded-lg hover:bg-white/15"
              >
                Cancelar
              </button>
              <button
                onClick={async () => {
                  try {
                    if (subcategoriasDisponiveis.length > 0) {
                      // Salvar percentuais das subcategorias
                      const totalPercentual = Object.values(subcategoriasConfig).reduce((sum, val) => sum + val, 0);

                      if (totalPercentual === 0) {
                        alert('Configure pelo menos uma subcategoria com percentual maior que 0.');
                        return;
                      }

                      // Salvar categoria principal com percentual total
                      await veService.configurarCategoriaPercentual(
                        categoriaEditando.id,
                        totalPercentual,
                        corCategoria,
                        categorias.length + 1
                      );

                      // Salvar cada subcategoria
                      for (const [subId, percentual] of Object.entries(subcategoriasConfig)) {
                        if (percentual > 0) {
                          await veService.configurarSubcategoriaPercentual(subId, percentual);
                        }
                      }
                    } else {
                      // Categoria sem subcategorias
                      const perc = parseFloat(percentualCategoria);
                      if (isNaN(perc) || perc <= 0) {
                        alert('Digite um percentual válido maior que 0.');
                        return;
                      }

                      await veService.configurarCategoriaPercentual(
                        categoriaEditando.id,
                        perc,
                        corCategoria,
                        categorias.length + 1
                      );
                    }

                    setCategoriaEditando(null);
                    setSubcategoriasDisponiveis([]);
                    setShowAdicionarCategoria(false);
                    loadData();
                  } catch (error) {
                    console.error('Erro ao salvar categoria:', error);
                    alert('Erro ao salvar categoria. Tente novamente.');
                  }
                }}
                className="px-6 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] font-medium"
              >
                Salvar Configuração
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalhamento de Categoria */}
      {showModalDetalhes && categoriaDetalhada && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#12141f] rounded-lg max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center">
              <div className="flex items-center gap-3">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: categoriaDetalhada.cor }} />
                <h2 className="text-xl font-bold text-white">
                  {categoriaDetalhada.nome}
                </h2>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex bg-[#12141f]/10 rounded-lg p-1">
                  <button
                    onClick={() => setTipoVisualizacao('atual')}
                    className={`px-4 py-2 rounded font-medium text-sm transition-colors ${
                      tipoVisualizacao === 'atual'
                        ? 'bg-[#12141f] text-[#7D1F2C] shadow'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    Semana Atual
                  </button>
                  <button
                    onClick={() => setTipoVisualizacao('futura')}
                    className={`px-4 py-2 rounded font-medium text-sm transition-colors ${
                      tipoVisualizacao === 'futura'
                        ? 'bg-[#12141f] text-[#7D1F2C] shadow'
                        : 'text-white/60 hover:text-white'
                    }`}
                  >
                    Semana Futura
                  </button>
                </div>
                <button
                  onClick={() => setShowModalDetalhes(false)}
                  className="text-white/30 hover:text-white/60"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto max-h-[calc(90vh-140px)]">
              {(() => {
                const semanaReferencia = tipoVisualizacao === 'atual' ? semanaAtual : semanaFuturaSelecionada;
                const gastosReferencia = tipoVisualizacao === 'atual' ? gastos : gastosFuturos;
                const orcamentosReferencia = tipoVisualizacao === 'atual' ? orcamentos : orcamentosFuturos;

                if (!semanaReferencia) {
                  return (
                    <div className="text-center py-12">
                      <Calendar className="w-16 h-16 text-white/20 mx-auto mb-4" />
                      <p className="text-white/40">
                        Nenhuma semana {tipoVisualizacao === 'futura' ? 'futura' : 'atual'} disponível
                      </p>
                    </div>
                  );
                }

                if (!categoriaDetalhada) {
                  return (
                    <div className="text-center py-12">
                      <FileText className="w-16 h-16 text-white/20 mx-auto mb-4" />
                      <p className="text-white/40">Erro ao carregar categoria</p>
                    </div>
                  );
                }

                const orcamento = orcamentosReferencia[categoriaDetalhada.id] || 0;
                const gasto = gastosReferencia[categoriaDetalhada.id] || 0;
                const disponivel = orcamento - gasto;

                const despesasManuaisCat = despesas.filter(d =>
                  d.semana_id === semanaReferencia.id &&
                  d.categoria_id === categoriaDetalhada.id &&
                  d.status === 'ativa'
                );

                const pagamentosCat = todosPagamentosInformativos.filter(p => {
                  return p.semana_id === semanaReferencia.id &&
                    p.categoria_id === categoriaDetalhada.id;
                });

                const contasCat = despesasContasPagar.filter(d => {
                  // Verificar se a conta pertence à categoria selecionada
                  if (d.categoria_id !== categoriaDetalhada.id && d.subcategoria_id !== categoriaDetalhada.id) {
                    return false;
                  }

                  // Para semana atual: todas as contas com vencimento na semana ou com pagamentos na semana
                  if (tipoVisualizacao === 'atual') {
                    const temPagamentoNaSemana = todosPagamentosInformativos.some(p =>
                      p.conta_pagar_id === d.id && p.semana_id === semanaReferencia.id
                    );

                    // Se não tem data de vencimento válida, usar apenas pagamentos
                    if (!d.data_vencimento) {
                      return temPagamentoNaSemana;
                    }

                    const dataVencimento = dayjs(d.data_vencimento);
                    if (!dataVencimento.isValid()) {
                      return temPagamentoNaSemana;
                    }

                    const inicioSemana = dayjs(semanaReferencia.data_inicio);
                    const fimSemana = inicioSemana.add(6, 'days');
                    const venceNaSemana = dataVencimento.isSameOrAfter(inicioSemana, 'day') &&
                                         dataVencimento.isSameOrBefore(fimSemana, 'day');
                    return venceNaSemana || temPagamentoNaSemana;
                  }

                  // Para semana futura: apenas contas com pagamentos planejados
                  const temPagamentoNaSemana = todosPagamentosInformativos.some(p =>
                    p.conta_pagar_id === d.id && p.semana_id === semanaReferencia.id
                  );
                  return temPagamentoNaSemana;
                });

                return (
                  <div className="space-y-6">
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-blue-500/10 rounded-lg p-4">
                        <p className="text-sm text-white/60 mb-1">Orçamento</p>
                        <p className="text-2xl font-bold text-[#7D1F2C]">{formatCurrency(orcamento)}</p>
                      </div>
                      <div className="bg-red-500/10 rounded-lg p-4">
                        <p className="text-sm text-white/60 mb-1">Gasto</p>
                        <p className="text-2xl font-bold text-red-400">{formatCurrency(gasto)}</p>
                      </div>
                      <div className={`rounded-lg p-4 ${disponivel >= 0 ? 'bg-green-500/10' : 'bg-orange-500/10'}`}>
                        <p className="text-sm text-white/60 mb-1">Disponível</p>
                        <p className={`text-2xl font-bold ${disponivel >= 0 ? 'text-green-400' : 'text-orange-400'}`}>
                          {formatCurrency(disponivel)}
                        </p>
                      </div>
                    </div>

                    {despesasManuaisCat.length > 0 && (
                      <div>
                        <h3 className="text-lg font-bold text-white mb-3">Despesas Lançadas</h3>
                        <div className="bg-[#12141f] border border-white/10 rounded-lg overflow-hidden">
                          <table className="min-w-full">
                            <thead className="bg-[#1a1d2e]">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Tipo</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Fornecedor</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Descrição</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Vencimento</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-white/40 uppercase">Valor</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10">
                              {despesasManuaisCat.map((despesa: any) => {
                                const tipoLancamento = despesa.tipo_lancamento || 'previsao';
                                return (
                                  <tr key={despesa.id} className="hover:bg-[#12141f]/5">
                                    <td className="px-4 py-3">
                                      {tipoLancamento === 'previsao' && (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-300">
                                          Previsão
                                        </span>
                                      )}
                                      {tipoLancamento === 'confirmada' && (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-300">
                                          Confirmada
                                        </span>
                                      )}
                                      {tipoLancamento === 'realizada' && (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-300">
                                          Realizada
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-sm font-medium text-white">
                                      {despesa.fornecedor}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-white/60">
                                      {despesa.descricao || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-white/60">
                                      {despesa.data_vencimento ? dayjs(despesa.data_vencimento).format('DD/MM/YYYY') : '-'}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-bold text-white">
                                      {formatCurrency(despesa.valor)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {pagamentosCat.length > 0 && (
                      <div>
                        <h3 className="text-lg font-bold text-white mb-3">Pagamentos Realizados</h3>
                        <div className="bg-[#12141f] border border-white/10 rounded-lg overflow-hidden">
                          <table className="min-w-full">
                            <thead className="bg-[#1a1d2e]">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Fornecedor</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Descrição</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Subcategoria</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-white/40 uppercase">Valor</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10">
                              {pagamentosCat.map((pag: any) => {
                                const subcat = categorias.find(c => c.id === pag.categoria_financeira_id);
                                return (
                                  <tr key={pag.id} className="hover:bg-[#12141f]/5">
                                    <td className="px-4 py-3 text-sm font-medium text-white">
                                      {pag.fornecedor_nome || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-white/60">
                                      {pag.conta_descricao || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-white/60">
                                      {subcat?.nome || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-bold text-green-400">
                                      {formatCurrency(pag.valor_pago)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {contasCat.length > 0 && (
                      <div>
                        <h3 className="text-lg font-bold text-white mb-3">
                          Contas a Pagar {tipoVisualizacao === 'atual' ? 'do Período' : 'com Pagamentos Planejados'}
                        </h3>
                        <div className="bg-[#12141f] border border-white/10 rounded-lg overflow-hidden">
                          <table className="min-w-full">
                            <thead className="bg-[#1a1d2e]">
                              <tr>
                                <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Status</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Fornecedor</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Descrição</th>
                                <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Vencimento</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-white/40 uppercase">Valor Total</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-white/40 uppercase">Saldo Restante</th>
                                <th className="px-4 py-3 text-right text-xs font-medium text-white/40 uppercase">Pago na Semana</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/10">
                              {contasCat.map((conta: any) => {
                                const pagamentosNaSemana = todosPagamentosInformativos.filter(p =>
                                  p.conta_pagar_id === conta.id && p.semana_id === semanaReferencia.id
                                );
                                const totalPagoNaSemana = pagamentosNaSemana.reduce((sum, p) => sum + p.valor_pago, 0);
                                const situacao = conta.situacao || 'futura';

                                return (
                                  <tr key={conta.id} className="hover:bg-[#12141f]/5">
                                    <td className="px-4 py-3">
                                      {situacao === 'vencida' && (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-500/15 text-red-300">
                                          Vencida
                                        </span>
                                      )}
                                      {situacao === 'vencendo' && (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-300">
                                          Vencendo
                                        </span>
                                      )}
                                      {situacao === 'futura' && (
                                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-300">
                                          A Vencer
                                        </span>
                                      )}
                                    </td>
                                    <td className="px-4 py-3 text-sm font-medium text-white">
                                      {conta.fornecedor_nome || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-white/60">
                                      {conta.descricao || '-'}
                                    </td>
                                    <td className="px-4 py-3 text-sm text-white/60">
                                      {dayjs(conta.data_vencimento).format('DD/MM/YYYY')}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-medium text-white">
                                      {formatCurrency(conta.valor_total || conta.valor || 0)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-medium text-orange-400">
                                      {formatCurrency(conta.valor_restante_planejamento || conta.valor_restante || 0)}
                                    </td>
                                    <td className="px-4 py-3 text-right text-sm font-bold text-[#7D1F2C]">
                                      {formatCurrency(totalPagoNaSemana)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {despesasManuaisCat.length === 0 && pagamentosCat.length === 0 && contasCat.length === 0 && (
                      <div className="text-center py-12">
                        <FileText className="w-16 h-16 text-white/20 mx-auto mb-4" />
                        <p className="text-white/40">Nenhum lançamento nesta categoria para a semana selecionada</p>
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="px-6 py-4 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setShowModalDetalhes(false)}
                className="px-6 py-2 bg-white/10 text-white/60 rounded-lg hover:bg-white/15"
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

const RelatoriosTab: React.FC = () => {
  const [dataFiltro, setDataFiltro] = useState(dayjs().format('YYYY-MM-DD'));
  const [pagamentosDia, setPagamentosDia] = useState<veService.RelatorioPagamentoInformativo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadPagamentosDia();
  }, [dataFiltro]);

  const loadPagamentosDia = async () => {
    try {
      setLoading(true);
      const dados = await veService.getPagamentosInformativosDoDia(dataFiltro);
      setPagamentosDia(dados);
    } catch (error: any) {
      console.error('Erro ao carregar pagamentos:', error);
    } finally {
      setLoading(false);
    }
  };

  const totalDia = pagamentosDia.reduce((sum, p) => sum + Number(p.valor_pago), 0);

  const agruparPorCategoria = () => {
    const grupos: Record<string, { nome: string; pagamentos: veService.RelatorioPagamentoInformativo[]; total: number }> = {};

    pagamentosDia.forEach(pag => {
      const catNome = pag.categoria_nome || 'SEM CATEGORIA';

      if (!grupos[catNome]) {
        grupos[catNome] = {
          nome: catNome,
          pagamentos: [],
          total: 0
        };
      }

      grupos[catNome].pagamentos.push(pag);
      grupos[catNome].total += Number(pag.valor_pago);
    });

    return grupos;
  };

  const grupos = agruparPorCategoria();

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Relatório de Pagamentos Informativos</h2>
          <p className="text-sm text-white/60 mt-1">
            Pagamentos marcados no planejamento (não afetam o financeiro real)
          </p>
        </div>
      </div>

      {/* Filtro de Data */}
      <div className="bg-[#12141f] rounded-lg border border-white/10 p-6">
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-white/80">Data:</label>
          <input
            type="date"
            value={dataFiltro}
            onChange={(e) => setDataFiltro(e.target.value)}
            className="px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
          />
          <div className="flex-1 text-right">
            <span className="text-sm text-white/60">Total do Dia: </span>
            <span className="text-2xl font-bold text-[#7D1F2C]">{formatCurrency(totalDia)}</span>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="bg-[#12141f] rounded-lg border border-white/10 p-12 text-center">
          <p className="text-white/40">Carregando...</p>
        </div>
      ) : pagamentosDia.length === 0 ? (
        <div className="bg-[#12141f] rounded-lg border border-white/10 p-12 text-center">
          <Receipt className="w-16 h-16 text-white/20 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">
            Nenhum pagamento informativo
          </h3>
          <p className="text-white/40">
            Não há pagamentos informativos registrados para {dayjs(dataFiltro).format('DD/MM/YYYY')}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Lista por Categoria */}
          {Object.values(grupos).map((grupo) => (
            <div key={grupo.nome} className="bg-[#12141f] rounded-lg border border-white/10 overflow-hidden">
              <div className="px-6 py-4 bg-blue-500/10 border-b-2 border-[#7D1F2C]">
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold text-white uppercase">{grupo.nome}</h3>
                  <span className="text-xl font-bold text-white">
                    {formatCurrency(grupo.total)}
                  </span>
                </div>
              </div>

              <div className="p-6">
                <table className="min-w-full">
                  <thead className="bg-[#1a1d2e]">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">
                        Fornecedor
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">
                        Descrição
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">
                        Vencimento
                      </th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-white/40 uppercase">
                        Valor Pago
                      </th>
                      <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">
                        Observação
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-[#12141f] divide-y divide-white/5">
                    {grupo.pagamentos.map((pag, idx) => (
                      <tr key={pag.id} className="hover:bg-[#12141f]/5">
                        <td className="px-4 py-3 text-sm font-medium text-white">
                          {pag.fornecedor_nome || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-white/60">
                          {pag.conta_descricao || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-white whitespace-nowrap">
                          {dayjs(pag.data_vencimento).format('DD/MM/YYYY')}
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-right text-green-400">
                          {formatCurrency(pag.valor_pago)}
                        </td>
                        <td className="px-4 py-3 text-sm text-white/60">
                          {pag.observacao || '-'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}

          {/* Resumo Final */}
          <div className="rounded-lg p-6 bg-blue-500/15 border border-[#7D1F2C]/60">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-bold text-white">RESUMO DO DIA</h3>
              <span className="text-3xl font-bold text-[#7D1F2C]">
                {formatCurrency(totalDia)}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-white/60">Total de Pagamentos</p>
                <p className="text-lg font-bold text-white">{pagamentosDia.length}</p>
              </div>
              <div>
                <p className="text-white/60">Categorias</p>
                <p className="text-lg font-bold text-white">{Object.keys(grupos).length}</p>
              </div>
              <div>
                <p className="text-white/60">Data</p>
                <p className="text-lg font-bold text-white">{dayjs(dataFiltro).format('DD/MM/YYYY')}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface DespesasTabProps {
  despesasContasPagar: veService.DespesaContaPagar[];
  despesasManuais: veService.Despesa[];
  semanaAtual: veService.Semana | null;
  semanasFuturas: veService.Semana[];
  categorias: veService.Categoria[];
  onReload: () => void;
  onExcluirDespesa: (id: string) => void;
  onCriarDespesa: (e: React.FormEvent) => void;
  novaDespesa: any;
  setNovaDespesa: (despesa: any) => void;
}

const DespesasTab: React.FC<DespesasTabProps> = ({
  despesasContasPagar,
  despesasManuais,
  semanaAtual,
  semanasFuturas,
  categorias,
  onReload,
  onExcluirDespesa,
  onCriarDespesa,
  novaDespesa,
  setNovaDespesa
}) => {
  const [subTab, setSubTab] = useState<'vencidas' | 'vencendo' | 'manuais'>('vencidas');
  const [showNovaDespesaManual, setShowNovaDespesaManual] = useState(false);
  const [contasSelecionadas, setContasSelecionadas] = useState<Set<string>>(new Set());
  const [showModalPagamento, setShowModalPagamento] = useState(false);
  const [observacao, setObservacao] = useState('');
  const [showModalParcial, setShowModalParcial] = useState(false);
  const [contaParcialSelecionada, setContaParcialSelecionada] = useState<any>(null);
  const [valorParcial, setValorParcial] = useState('');
  const [observacaoParcial, setObservacaoParcial] = useState('');
  const [showHistorico, setShowHistorico] = useState(false);
  const [showModalVincular, setShowModalVincular] = useState(false);
  const [despesaParaVincular, setDespesaParaVincular] = useState<any>(null);
  const [contasDisponiveis, setContasDisponiveis] = useState<veService.ContaPagarDisponivel[]>([]);
  const [buscaVincular, setBuscaVincular] = useState('');
  const [showModalImportarFuturas, setShowModalImportarFuturas] = useState(false);
  const [contasFuturas, setContasFuturas] = useState<veService.ContaFuturaDisponivel[]>([]);
  const [buscaFuturas, setBuscaFuturas] = useState('');
  const [historicoPagamentos, setHistoricoPagamentos] = useState<veService.PagamentoInformativo[]>([]);
  const [showModalEditar, setShowModalEditar] = useState(false);
  const [pagamentoEditar, setPagamentoEditar] = useState<veService.PagamentoInformativo | null>(null);
  const [valorEditar, setValorEditar] = useState('');
  const [observacaoEditar, setObservacaoEditar] = useState('');
  const [mostrarPagas, setMostrarPagas] = useState(false);

  const despesasFiltradas = subTab === 'manuais'
    ? []
    : despesasContasPagar.filter(d => {
        const situacaoCorreta = subTab === 'vencidas' ? d.situacao === 'vencida' : d.situacao === 'vencendo';

        const statusPlanejamento = (d as any).status_planejamento;
        const isPagoTotalmente = statusPlanejamento === 'pago_planejamento';

        if (!mostrarPagas && isPagoTotalmente) {
          return false;
        }

        return situacaoCorreta;
      });

  const despesasManuaisFiltradas = despesasManuais;

  const despesasManuaisAtivas = despesasManuaisFiltradas.filter(d => d.status === 'ativa');

  const handleToggleSelecao = (contaId: string) => {
    const novasSelecoes = new Set(contasSelecionadas);
    if (novasSelecoes.has(contaId)) {
      novasSelecoes.delete(contaId);
    } else {
      novasSelecoes.add(contaId);
    }
    setContasSelecionadas(novasSelecoes);
  };

  const handleMarcarComoInformativo = async () => {
    if (!semanaAtual) {
      alert('Crie uma semana primeiro');
      return;
    }

    if (contasSelecionadas.size === 0) {
      alert('Selecione pelo menos uma conta');
      return;
    }

    try {
      for (const contaId of contasSelecionadas) {
        const conta = despesasFiltradas.find(d => d.id === contaId);
        if (conta) {
          const valorRestante = (conta as any).valor_restante_planejamento || conta.valor_restante || 0;
          await veService.registrarPagamentoParcial(
            contaId,
            semanaAtual.id,
            Number(valorRestante),
            observacao || undefined
          );
        }
      }

      alert('Pagamentos informativos registrados com sucesso!');
      setContasSelecionadas(new Set());
      setShowModalPagamento(false);
      setObservacao('');
      onReload();
    } catch (error: any) {
      console.error('Erro:', error);
      alert('Erro ao registrar pagamentos: ' + error.message);
    }
  };

  const handleDesmarcarInformativo = async (contaId: string) => {
    if (!confirm('Desmarcar esta conta como paga no planejamento?')) return;

    try {
      await veService.desmarcarPagamentoInformativo(contaId);
      onReload();
    } catch (error: any) {
      console.error('Erro:', error);
      alert('Erro ao desmarcar: ' + error.message);
    }
  };

  const handleAbrirPagamentoParcial = (conta: any) => {
    setContaParcialSelecionada(conta);
    setValorParcial('');
    setObservacaoParcial('');
    setShowModalParcial(true);
  };

  const handleRegistrarPagamentoParcial = async () => {
    if (!semanaAtual) {
      alert('Crie uma semana primeiro');
      return;
    }

    if (!contaParcialSelecionada) return;

    const valor = parseFloat(valorParcial);
    if (!valor || valor <= 0) {
      alert('Informe um valor válido');
      return;
    }

    const valorRestante = contaParcialSelecionada.valor_restante_planejamento || 0;
    if (valor > valorRestante) {
      alert(`Valor não pode ser maior que o saldo restante (${formatCurrency(valorRestante)})`);
      return;
    }

    try {
      await veService.registrarPagamentoParcial(
        contaParcialSelecionada.id,
        semanaAtual.id,
        valor,
        observacaoParcial || undefined
      );

      alert('Pagamento parcial registrado com sucesso!');
      setShowModalParcial(false);
      setContaParcialSelecionada(null);
      setValorParcial('');
      setObservacaoParcial('');
      onReload();
    } catch (error: any) {
      console.error('Erro:', error);
      alert('Erro ao registrar pagamento parcial: ' + error.message);
    }
  };

  const handleAbrirVincular = async (despesa: any) => {
    try {
      const contas = await veService.getContasPagarDisponiveis();
      setContasDisponiveis(contas);
      setDespesaParaVincular(despesa);
      setBuscaVincular('');
      setShowModalVincular(true);
    } catch (error: any) {
      console.error('Erro:', error);
      alert('Erro ao buscar contas: ' + error.message);
    }
  };

  const handleVincularConta = async (contaId: string) => {
    if (!despesaParaVincular) return;

    try {
      await veService.vincularDespesaContaPagar(despesaParaVincular.id, contaId);
      alert('Despesa vinculada com sucesso!');
      setShowModalVincular(false);
      setDespesaParaVincular(null);
      onReload();
    } catch (error: any) {
      console.error('Erro:', error);
      alert('Erro ao vincular: ' + error.message);
    }
  };

  const handleDesvincular = async (despesa: any) => {
    if (!confirm('Desvincular esta despesa da conta a pagar?')) return;

    try {
      await veService.desvincularDespesaContaPagar(despesa.id);
      alert('Despesa desvinculada com sucesso!');
      onReload();
    } catch (error: any) {
      console.error('Erro:', error);
      alert('Erro ao desvincular: ' + error.message);
    }
  };

  const handleAbrirImportarFuturas = async () => {
    try {
      const contas = await veService.getContasFuturasDisponiveis();
      setContasFuturas(contas);
      setBuscaFuturas('');
      setShowModalImportarFuturas(true);
    } catch (error: any) {
      console.error('Erro:', error);
      alert('Erro ao buscar contas futuras: ' + error.message);
    }
  };

  const handleImportarContaFutura = async (contaId: string, dataPagamento?: string) => {
    if (!semanaAtual) {
      alert('Crie uma semana primeiro');
      return;
    }

    try {
      await veService.importarContaFuturaComoPrevisao(contaId, semanaAtual.id, dataPagamento);
      alert('Conta futura importada como previsão!');

      // Recarregar lista
      const contas = await veService.getContasFuturasDisponiveis();
      setContasFuturas(contas);
      onReload();
    } catch (error: any) {
      console.error('Erro:', error);
      alert('Erro ao importar: ' + error.message);
    }
  };

  const handleVerHistorico = async (conta: any) => {
    try {
      const historico = await veService.listarPagamentosContaPagar(conta.id);
      setHistoricoPagamentos(historico);
      setContaParcialSelecionada(conta);
      setShowHistorico(true);
    } catch (error: any) {
      console.error('Erro:', error);
      alert('Erro ao carregar histórico: ' + error.message);
    }
  };

  const handleExcluirPagamento = async (pagamentoId: string) => {
    if (!confirm('Deseja realmente excluir este pagamento?')) return;

    try {
      await veService.excluirPagamentoParcial(pagamentoId);
      alert('Pagamento excluído com sucesso!');

      if (contaParcialSelecionada) {
        const historico = await veService.listarPagamentosContaPagar(contaParcialSelecionada.id);
        setHistoricoPagamentos(historico);
      }

      onReload();
    } catch (error: any) {
      console.error('Erro:', error);
      alert('Erro ao excluir pagamento: ' + error.message);
    }
  };

  const handleAbrirEditar = (pagamento: veService.PagamentoInformativo) => {
    setPagamentoEditar(pagamento);
    setValorEditar(pagamento.valor_pago.toString());
    setObservacaoEditar(pagamento.observacao || '');
    setShowModalEditar(true);
  };

  const handleEditarPagamento = async () => {
    if (!pagamentoEditar) return;

    const novoValor = parseFloat(valorEditar);
    if (!novoValor || novoValor <= 0) {
      alert('Informe um valor válido');
      return;
    }

    try {
      await veService.editarPagamentoParcial(
        pagamentoEditar.id,
        novoValor,
        observacaoEditar
      );

      alert('Pagamento editado com sucesso!');
      setShowModalEditar(false);
      setPagamentoEditar(null);

      if (contaParcialSelecionada) {
        const historico = await veService.listarPagamentosContaPagar(contaParcialSelecionada.id);
        setHistoricoPagamentos(historico);
      }

      onReload();
    } catch (error: any) {
      console.error('Erro:', error);
      alert('Erro ao editar pagamento: ' + error.message);
    }
  };

  const agruparPorCategoria = (despesas: veService.DespesaContaPagar[]) => {
    const grupos: Record<string, {
      nome: string;
      subcategorias: Record<string, {
        nome: string;
        contas: veService.DespesaContaPagar[];
        total: number;
      }>;
      total: number;
    }> = {};

    despesas.forEach(despesa => {
      const catNome = despesa.categoria_nome || 'SEM CATEGORIA';
      const subNome = despesa.subcategoria_nome || 'GERAL';

      if (!grupos[catNome]) {
        grupos[catNome] = {
          nome: catNome,
          subcategorias: {},
          total: 0
        };
      }

      if (!grupos[catNome].subcategorias[subNome]) {
        grupos[catNome].subcategorias[subNome] = {
          nome: subNome,
          contas: [],
          total: 0
        };
      }

      grupos[catNome].subcategorias[subNome].contas.push(despesa);
      const valorRestante = (despesa as any).valor_restante_planejamento || despesa.valor_restante || 0;
      grupos[catNome].subcategorias[subNome].total += Number(valorRestante);
      grupos[catNome].total += Number(valorRestante);
    });

    return grupos;
  };

  const grupos = agruparPorCategoria(despesasFiltradas);
  const totalGeral = despesasFiltradas.reduce((sum, d) => {
    const valorRestante = (d as any).valor_restante_planejamento || d.valor_restante || 0;
    return sum + Number(valorRestante);
  }, 0);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-white">Despesas</h2>
          <p className="text-sm text-white/60 mt-1">
            Contas a pagar e despesas lançadas manualmente
          </p>
        </div>
        <div className="flex items-center gap-3">
          {subTab === 'manuais' ? (
            <>
              <button
                onClick={handleAbrirImportarFuturas}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2"
              >
                <Download className="w-4 h-4" />
                Importar Contas Futuras
              </button>
              <button
                onClick={() => setShowNovaDespesaManual(true)}
                className="bg-[#7D1F2C] text-white px-4 py-2 rounded-lg hover:bg-[#6a1a25] flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                Nova Despesa Manual
              </button>
            </>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm text-white/80 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mostrarPagas}
                  onChange={(e) => setMostrarPagas(e.target.checked)}
                  className="rounded border-white/20"
                />
                Mostrar despesas totalmente pagas
              </label>
              {contasSelecionadas.size > 0 && (
                <button
                  onClick={() => setShowModalPagamento(true)}
                  className="bg-[#7D1F2C] text-white px-4 py-2 rounded-lg hover:bg-[#6a1a25] flex items-center gap-2"
                >
                  <Check className="w-4 h-4" />
                  Marcar {contasSelecionadas.size} como Pago
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-b border-white/10">
        <button
          onClick={() => setSubTab('vencidas')}
          className={`px-6 py-3 font-medium transition-colors ${
            subTab === 'vencidas'
              ? 'border-b-2 border-red-600 text-red-400'
              : 'text-white/40 hover:text-white/80'
          }`}
        >
          Despesas Vencidas ({despesasContasPagar.filter(d => d.situacao === 'vencida' && !(d as any).pagamento_informativo_id).length})
        </button>
        <button
          onClick={() => setSubTab('vencendo')}
          className={`px-6 py-3 font-medium transition-colors ${
            subTab === 'vencendo'
              ? 'border-b-2 border-yellow-600 text-yellow-400'
              : 'text-white/40 hover:text-white/80'
          }`}
        >
          Despesas Vencendo ({despesasContasPagar.filter(d => d.situacao === 'vencendo' && !(d as any).pagamento_informativo_id).length})
        </button>
        <button
          onClick={() => setSubTab('manuais')}
          className={`px-6 py-3 font-medium transition-colors ${
            subTab === 'manuais'
              ? 'border-b-2 border-[#7D1F2C] text-[#7D1F2C]'
              : 'text-white/40 hover:text-white/80'
          }`}
        >
          Despesas Lançadas ({despesasManuais.filter(d => d.status === 'ativa').length})
        </button>
      </div>

      {/* Renderização de Despesas Manuais */}
      {subTab === 'manuais' && (
        <div className="bg-[#12141f] rounded-lg border border-white/10 overflow-hidden">
          <table className="min-w-full">
            <thead className="bg-[#1a1d2e]">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Tipo</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Fornecedor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Categoria</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Vencimento</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">Semana</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-white/40 uppercase">Valor</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-white/40 uppercase">Ações</th>
              </tr>
            </thead>
            <tbody className="bg-[#12141f] divide-y divide-white/5">
              {despesasManuaisAtivas.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-white/40">
                    Nenhuma despesa lançada nesta semana
                  </td>
                </tr>
              ) : (
                despesasManuaisAtivas.map((despesa: any) => {
                  const categoria = categorias.find(c => c.id === despesa.categoria_financeira_id);
                  const semana = [semanaAtual, ...semanasFuturas].find(s => s?.id === despesa.semana_id);
                  const tipoLancamento = despesa.tipo_lancamento || 'previsao';

                  return (
                    <tr key={despesa.id} className="hover:bg-[#12141f]/5">
                      <td className="px-4 py-3">
                        {tipoLancamento === 'previsao' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-500/15 text-yellow-300">
                            Previsão
                          </span>
                        )}
                        {tipoLancamento === 'confirmada' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-300">
                            Confirmada
                          </span>
                        )}
                        {tipoLancamento === 'realizada' && (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-300">
                            Realizada
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm font-medium text-white">
                        {despesa.fornecedor}
                      </td>
                      <td className="px-4 py-3 text-sm text-white/60">
                        {categoria?.nome || '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-white">
                        {despesa.data_vencimento ? dayjs(despesa.data_vencimento).format('DD/MM/YYYY') : '-'}
                      </td>
                      <td className="px-4 py-3 text-sm text-white/60">
                        {semana ? (
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                            semana.id === semanaAtual?.id
                              ? 'bg-blue-500/15 text-blue-300'
                              : 'bg-purple-500/15 text-purple-300'
                          }`}>
                            {semana.id === semanaAtual?.id ? 'Atual' : 'Futura'}
                            {semana.data_inicio ? ` - ${dayjs(semana.data_inicio).format('DD/MM')}` : ''}
                          </span>
                        ) : (
                          <span className="text-xs text-white/30">Sem semana</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-bold text-white">
                        {formatCurrency(despesa.valor)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          {tipoLancamento === 'previsao' && (
                            <button
                              onClick={async () => {
                                if (confirm('Confirmar esta previsão? Ela será marcada como confirmada.')) {
                                  try {
                                    await veService.confirmarPrevisao(despesa.id);
                                    alert('Previsão confirmada!');
                                    onReload();
                                  } catch (error: any) {
                                    alert('Erro ao confirmar: ' + error.message);
                                  }
                                }
                              }}
                              className="text-green-400 hover:text-green-300 text-xs font-medium px-2 py-1 border border-green-600 rounded hover:bg-green-500/10"
                              title="Confirmar previsão"
                            >
                              <Check className="w-4 h-4" />
                            </button>
                          )}
                          {despesa.conta_pagar_id ? (
                            <button
                              onClick={() => handleDesvincular(despesa)}
                              className="text-orange-400 hover:text-orange-300 text-xs font-medium px-2 py-1 border border-orange-600 rounded hover:bg-orange-500/10"
                              title="Desvincular da conta a pagar"
                            >
                              <Link2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              onClick={() => handleAbrirVincular(despesa)}
                              className="text-[#7D1F2C] hover:text-blue-300 text-xs font-medium px-2 py-1 border border-[#7D1F2C] rounded hover:bg-blue-500/10"
                              title="Vincular com conta a pagar"
                            >
                              <Link className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => onExcluirDespesa(despesa.id)}
                            className="text-red-400 hover:text-red-300 text-xs font-medium px-2 py-1 border border-red-600 rounded hover:bg-red-500/10"
                            title="Excluir despesa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Renderização de Contas a Pagar */}
      {subTab !== 'manuais' && despesasFiltradas.length === 0 ? (
        <div className="bg-[#12141f] rounded-lg border border-white/10 p-12 text-center">
          <FileText className="w-16 h-16 text-white/20 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-white mb-2">
            Nenhuma despesa {subTab === 'vencidas' ? 'vencida' : 'vencendo'}
          </h3>
          <p className="text-white/40">
            Não há contas {subTab === 'vencidas' ? 'vencidas' : 'a vencer'}
          </p>
        </div>
      ) : subTab !== 'manuais' && (
        <div className="space-y-6">
          {Object.values(grupos).map((grupo) => (
            <div key={grupo.nome} className="bg-[#12141f] rounded-lg border border-white/10 overflow-hidden">
              <div className={`px-6 py-4 ${subTab === 'vencidas' ? 'bg-red-500/10 border-b-2 border-red-600' : 'bg-yellow-500/10 border-b-2 border-yellow-600'}`}>
                <div className="flex justify-between items-center">
                  <h3 className="text-lg font-bold text-white uppercase">{grupo.nome}</h3>
                  <span className={`text-xl font-bold ${subTab === 'vencidas' ? 'text-red-400' : 'text-yellow-400'}`}>
                    {formatCurrency(grupo.total)}
                  </span>
                </div>
              </div>

              <div className="divide-y divide-white/10">
                {Object.values(grupo.subcategorias).map((subcategoria) => (
                  <div key={subcategoria.nome} className="p-6">
                    <div className="flex justify-between items-center mb-4">
                      <h4 className="text-sm font-semibold text-white/80 uppercase tracking-wide">
                        {subcategoria.nome}
                      </h4>
                      <span className="text-sm font-bold text-white">
                        {formatCurrency(subcategoria.total)}
                      </span>
                    </div>

                    <table className="min-w-full">
                      <thead className="bg-[#1a1d2e]">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase w-12">
                            <input
                              type="checkbox"
                              onChange={(e) => {
                                if (e.target.checked) {
                                  const novos = new Set(contasSelecionadas);
                                  subcategoria.contas.forEach(c => {
                                    if (!c.pagamento_informativo_id) novos.add(c.id);
                                  });
                                  setContasSelecionadas(novos);
                                } else {
                                  const novos = new Set(contasSelecionadas);
                                  subcategoria.contas.forEach(c => novos.delete(c.id));
                                  setContasSelecionadas(novos);
                                }
                              }}
                              className="rounded border-white/20"
                            />
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">
                            Fornecedor
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">
                            Descrição
                          </th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-white/40 uppercase">
                            Vencimento
                          </th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-white/40 uppercase">
                            Valor
                          </th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-white/40 uppercase">
                            Status
                          </th>
                          <th className="px-4 py-2 text-center text-xs font-medium text-white/40 uppercase">
                            Ações
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-[#12141f] divide-y divide-white/5">
                        {subcategoria.contas.map((conta: any) => {
                          const statusPlanejamento = conta.status_planejamento;
                          const isPagoTotalmente = statusPlanejamento === 'pago_planejamento';
                          const isParcialmentePago = statusPlanejamento === 'parcialmente_pago_planejamento';
                          const temPagamentos = conta.quantidade_pagamentos > 0;
                          const valorRestante = conta.valor_restante_planejamento || 0;

                          return (
                            <tr key={conta.id} className={`hover:bg-[#12141f]/5 ${isPagoTotalmente ? 'bg-green-500/10' : isParcialmentePago ? 'bg-blue-500/10' : ''}`}>
                              <td className="px-4 py-3 text-center">
                                {!isPagoTotalmente && (
                                  <input
                                    type="checkbox"
                                    checked={contasSelecionadas.has(conta.id)}
                                    onChange={() => handleToggleSelecao(conta.id)}
                                    className="rounded border-white/20"
                                  />
                                )}
                              </td>
                              <td className="px-4 py-3 text-sm font-medium text-white">
                                {conta.fornecedor_nome || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-white/60">
                                {conta.descricao || '-'}
                              </td>
                              <td className="px-4 py-3 text-sm text-white whitespace-nowrap">
                                {dayjs(conta.data_vencimento).format('DD/MM/YYYY')}
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="flex flex-col items-end">
                                  <span className={`text-sm font-bold ${
                                    isPagoTotalmente ? 'text-green-400' :
                                    isParcialmentePago ? 'text-[#7D1F2C]' :
                                    subTab === 'vencidas' ? 'text-red-400' : 'text-yellow-400'
                                  }`}>
                                    {formatCurrency(valorRestante)}
                                  </span>
                                  {isParcialmentePago && (
                                    <span className="text-xs text-white/40">
                                      Pago: {formatCurrency(conta.valor_pago_planejamento)}
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-center">
                                {isPagoTotalmente ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-500/15 text-green-300">
                                    Pago Planejamento
                                  </span>
                                ) : isParcialmentePago ? (
                                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-500/15 text-blue-300">
                                    Parc. Pago Plan.
                                  </span>
                                ) : (
                                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                    conta.status_real === 'em_aberto'
                                      ? 'bg-[#12141f]/10 text-white/90'
                                      : conta.status_real === 'parcialmente_pago'
                                      ? 'bg-orange-500/15 text-orange-300'
                                      : 'bg-[#12141f]/10 text-white/90'
                                  }`}>
                                    {conta.status_real === 'em_aberto' ? 'Em Aberto' :
                                     conta.status_real === 'parcialmente_pago' ? 'Parc. Pago Real' :
                                     conta.status_real}
                                  </span>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  {!isPagoTotalmente && valorRestante > 0 && (
                                    <button
                                      onClick={() => handleAbrirPagamentoParcial(conta)}
                                      className="text-[#7D1F2C] hover:text-blue-300 text-xs font-medium px-2 py-1 border border-[#7D1F2C] rounded hover:bg-blue-500/10"
                                      title="Registrar pagamento"
                                    >
                                      <DollarSign className="w-4 h-4" />
                                    </button>
                                  )}
                                  {temPagamentos && (
                                    <button
                                      onClick={() => handleVerHistorico(conta)}
                                      className="text-green-400 hover:text-green-300 text-xs font-medium px-2 py-1 border border-green-600 rounded hover:bg-green-500/10"
                                      title="Ver histórico de pagamentos"
                                    >
                                      <History className="w-4 h-4" />
                                    </button>
                                  )}
                                  {temPagamentos && (
                                    <button
                                      onClick={() => handleDesmarcarInformativo(conta.id)}
                                      className="text-red-400 hover:text-red-300 text-xs font-medium px-2 py-1 border border-red-600 rounded hover:bg-red-500/10"
                                      title="Remover todos os pagamentos"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className={`rounded-lg p-6 ${subTab === 'vencidas' ? 'bg-red-500/15 border-2 border-red-600' : 'bg-yellow-500/15 border-2 border-yellow-600'}`}>
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-bold text-white">TOTAL GERAL</h3>
              <span className={`text-3xl font-bold ${subTab === 'vencidas' ? 'text-red-400' : 'text-yellow-400'}`}>
                {formatCurrency(totalGeral)}
              </span>
            </div>
            <p className="text-sm text-white/80 mt-2">
              {despesasFiltradas.length} conta(s) • {Object.keys(grupos).length} categoria(s)
            </p>
          </div>
        </div>
      )}

      {/* Formulário de Nova Despesa Manual */}
      {showNovaDespesaManual && (
        <div className="bg-[#12141f] rounded-lg border border-white/10 p-6">
          <h3 className="text-lg font-bold text-white mb-4">Nova Despesa Manual</h3>
          <form onSubmit={(e) => {
            onCriarDespesa(e);
            setShowNovaDespesaManual(false);
          }}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Fornecedor/Descrição</label>
                <input
                  type="text"
                  value={novaDespesa.fornecedor}
                  onChange={(e) => setNovaDespesa({ ...novaDespesa, fornecedor: e.target.value })}
                  className="w-full px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Valor</label>
                <input
                  type="number"
                  step="0.01"
                  value={novaDespesa.valor}
                  onChange={(e) => setNovaDespesa({ ...novaDespesa, valor: e.target.value })}
                  className="w-full px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Categoria</label>
                <select
                  value={novaDespesa.categoria_id}
                  onChange={(e) => setNovaDespesa({ ...novaDespesa, categoria_id: e.target.value, subcategoria_id: '' })}
                  className="w-full px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C]"
                  required
                >
                  <option value="">Selecione...</option>
                  {categorias.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.nome}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Subcategoria</label>
                <select
                  value={novaDespesa.subcategoria_id}
                  onChange={(e) => setNovaDespesa({ ...novaDespesa, subcategoria_id: e.target.value })}
                  className="w-full px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C]"
                  disabled={!novaDespesa.categoria_id}
                >
                  <option value="">Nenhuma</option>
                  {categorias
                    .find(c => c.id === novaDespesa.categoria_id)
                    ?.subcategorias?.map(sub => (
                      <option key={sub.id} value={sub.id}>{sub.nome}</option>
                    ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Data de Vencimento</label>
                <input
                  type="date"
                  value={novaDespesa.data_vencimento}
                  onChange={(e) => setNovaDespesa({ ...novaDespesa, data_vencimento: e.target.value })}
                  className="w-full px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C]"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Tipo de Lançamento</label>
                <select
                  value={novaDespesa.tipo_lancamento || 'previsao'}
                  onChange={(e) => setNovaDespesa({ ...novaDespesa, tipo_lancamento: e.target.value as 'previsao' | 'realizada' })}
                  className="w-full px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C]"
                >
                  <option value="previsao">Previsão (Planejamento)</option>
                  <option value="realizada">Realizada (Confirmada)</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-white/80 mb-1">Observações (opcional)</label>
                <input
                  type="text"
                  value={novaDespesa.descricao}
                  onChange={(e) => setNovaDespesa({ ...novaDespesa, descricao: e.target.value })}
                  className="w-full px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C]"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                type="submit"
                className="bg-[#7D1F2C] text-white px-4 py-2 rounded-lg hover:bg-[#6a1a25]"
              >
                Salvar Despesa
              </button>
              <button
                type="button"
                onClick={() => setShowNovaDespesaManual(false)}
                className="bg-[#12141f]/10 text-white/60 px-4 py-2 rounded-lg hover:bg-[#12141f]/15"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      {/* DESPESAS MANUAIS */}
      {subTab === 'manuais' && (
        <div className="space-y-6">
          {despesasManuaisFiltradas.length === 0 ? (
            <div className="bg-[#12141f] rounded-lg border border-white/10 p-12 text-center">
              <FileText className="w-16 h-16 text-white/20 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">
                Nenhuma despesa lançada manualmente
              </h3>
              <p className="text-white/40">
                Despesas lançadas manualmente aparecem aqui. Use o dashboard para adicionar despesas.
              </p>
            </div>
          ) : (
            <div className="bg-[#12141f] rounded-lg border border-white/10">
              <div className="px-6 py-4 bg-blue-500/10 border-b-2 border-[#7D1F2C]">
                <h3 className="text-lg font-bold text-white">
                  DESPESAS LANÇADAS MANUALMENTE
                </h3>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-[#1a1d2e]">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">
                        Fornecedor
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">
                        Vencimento
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-white/40 uppercase">
                        Valor
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase">
                        Categoria
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-white/40 uppercase">
                        Status
                      </th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-white/40 uppercase">
                        Ações
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {despesasManuaisFiltradas.map(desp => (
                      <tr key={desp.id} className={`hover:bg-[#12141f]/5 ${desp.status !== 'ativa' ? 'opacity-60' : ''}`}>
                        <td className="px-4 py-3 text-sm text-white">
                          {desp.fornecedor}
                        </td>
                        <td className="px-4 py-3 text-sm text-white/60">
                          {desp.data_vencimento ? dayjs(desp.data_vencimento).format('DD/MM/YYYY') : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-white">
                          {formatCurrency(desp.valor)}
                        </td>
                        <td className="px-4 py-3 text-sm text-white/60">
                          {desp.categoria_nome || '-'}
                          {desp.subcategoria_nome && ` / ${desp.subcategoria_nome}`}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {desp.status === 'ativa' && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-500/15 text-green-300">
                              Ativa
                            </span>
                          )}
                          {desp.status === 'convertida' && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-500/15 text-blue-300">
                              Convertida
                            </span>
                          )}
                          {desp.status === 'cancelada' && (
                            <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-[#12141f]/10 text-white/90">
                              Cancelada
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            {desp.status === 'ativa' && (
                              <button
                                onClick={() => {
                                  if (confirm('Cancelar esta despesa? Ela não será mais contabilizada nos totais.')) {
                                    veService.cancelarDespesaManual(desp.id, 'Cancelada manualmente pelo usuário').then(() => {
                                      onReload();
                                    });
                                  }
                                }}
                                className="text-orange-400 hover:text-orange-300"
                                title="Cancelar despesa"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                            {desp.status === 'cancelada' && (
                              <button
                                onClick={() => {
                                  if (confirm('Reativar esta despesa?')) {
                                    veService.reativarDespesaManual(desp.id).then(() => {
                                      onReload();
                                    });
                                  }
                                }}
                                className="text-green-400 hover:text-green-300"
                                title="Reativar despesa"
                              >
                                <Check className="w-4 h-4" />
                              </button>
                            )}
                            <button
                              onClick={() => {
                                if (confirm('Excluir esta despesa definitivamente?')) {
                                  onExcluirDespesa(desp.id);
                                }
                              }}
                              className="text-red-400 hover:text-red-300"
                              title="Excluir definitivamente"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-[#12141f]/5">
                    <tr>
                      <td colSpan={2} className="px-4 py-3 text-sm font-bold text-white text-right">
                        TOTAL:
                      </td>
                      <td className="px-4 py-3 text-sm font-bold text-[#7D1F2C] text-right">
                        {formatCurrency(despesasManuaisAtivas.reduce((sum, d) => sum + d.valor, 0))}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Modal Confirmar Pagamentos Informativos */}
      {showModalPagamento && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#12141f] rounded-lg max-w-2xl w-full">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Marcar Pagamentos no Planejamento</h3>
              <button
                onClick={() => setShowModalPagamento(false)}
                className="text-white/30 hover:text-white/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-blue-500/10 border border-[#7D1F2C]/40 rounded-lg p-4">
                <p className="text-sm text-blue-300">
                  <strong>Importante:</strong> Esta ação marca as contas como pagas apenas para efeitos de planejamento semanal.
                  O módulo financeiro real (Contas a Pagar) não será afetado.
                </p>
              </div>

              <div>
                <p className="text-sm text-white/80 font-medium mb-2">
                  Você está marcando {contasSelecionadas.size} conta(s) como pagas no planejamento:
                </p>
                <div className="max-h-48 overflow-y-auto bg-[#12141f]/5 rounded-lg p-3 space-y-2">
                  {Array.from(contasSelecionadas).map(contaId => {
                    const conta = despesasFiltradas.find(d => d.id === contaId);
                    if (!conta) return null;
                    const valorExibir = (conta as any).valor_restante_planejamento || conta.valor_restante || 0;
                    return (
                      <div key={contaId} className="flex justify-between text-sm bg-[#12141f] p-2 rounded border border-white/10">
                        <span className="text-white">{(conta as any).fornecedor_nome || conta.fornecedor}</span>
                        <span className="font-bold text-white">{formatCurrency(valorExibir)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Observação (opcional)
                </label>
                <textarea
                  value={observacao}
                  onChange={(e) => setObservacao(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                  placeholder="Ex: Pagamentos confirmados para esta semana"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
              <button
                onClick={() => setShowModalPagamento(false)}
                className="px-4 py-2 bg-white/10 text-white/60 rounded-lg hover:bg-white/15"
              >
                Cancelar
              </button>
              <button
                onClick={handleMarcarComoInformativo}
                className="px-6 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] font-medium flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                Confirmar Pagamentos
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Pagamento Parcial */}
      {showModalParcial && contaParcialSelecionada && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#12141f] rounded-lg max-w-lg w-full">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Registrar Pagamento Parcial</h3>
              <button
                onClick={() => setShowModalParcial(false)}
                className="text-white/30 hover:text-white/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-blue-500/10 border border-[#7D1F2C]/40 rounded-lg p-4">
                <p className="text-sm text-blue-300">
                  <strong>Pagamento Informativo:</strong> Este registro é apenas para o planejamento e não afeta o financeiro real.
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Fornecedor:</span>
                  <span className="font-medium">{contaParcialSelecionada.fornecedor_nome}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Vencimento:</span>
                  <span className="font-medium">{dayjs(contaParcialSelecionada.data_vencimento).format('DD/MM/YYYY')}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Valor Total:</span>
                  <span className="font-medium">{formatCurrency(contaParcialSelecionada.valor_total)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Já Pago (Real):</span>
                  <span className="font-medium text-[#7D1F2C]">{formatCurrency(contaParcialSelecionada.valor_pago_real || 0)}</span>
                </div>
                {contaParcialSelecionada.valor_pago_planejamento > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Já Pago (Planejamento):</span>
                    <span className="font-medium text-green-400">{formatCurrency(contaParcialSelecionada.valor_pago_planejamento)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm pt-2 border-t border-white/10">
                  <span className="text-white font-semibold">Saldo Restante:</span>
                  <span className="font-bold text-lg text-red-400">{formatCurrency(contaParcialSelecionada.valor_restante_planejamento)}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Valor do Pagamento Parcial <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={contaParcialSelecionada.valor_restante_planejamento}
                  value={valorParcial}
                  onChange={(e) => setValorParcial(e.target.value)}
                  className="w-full px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Observação (opcional)
                </label>
                <textarea
                  value={observacaoParcial}
                  onChange={(e) => setObservacaoParcial(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                  placeholder="Ex: Primeira parcela"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
              <button
                onClick={() => setShowModalParcial(false)}
                className="px-4 py-2 bg-white/10 text-white/60 rounded-lg hover:bg-white/15"
              >
                Cancelar
              </button>
              <button
                onClick={handleRegistrarPagamentoParcial}
                className="px-6 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] font-medium flex items-center gap-2"
              >
                <DollarSign className="w-4 h-4" />
                Registrar Pagamento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Editar Pagamento */}
      {showModalEditar && pagamentoEditar && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#12141f] rounded-lg max-w-lg w-full">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Editar Pagamento Informativo</h3>
              <button
                onClick={() => setShowModalEditar(false)}
                className="text-white/30 hover:text-white/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                <p className="text-sm text-yellow-300">
                  <strong>Atenção:</strong> Ao editar o valor, certifique-se de que não excede o saldo disponível da conta.
                </p>
              </div>

              <div className="space-y-2 bg-[#12141f]/5 rounded-lg p-3">
                <div className="flex justify-between text-sm">
                  <span className="text-white/60">Data do Pagamento:</span>
                  <span className="font-medium">{dayjs(pagamentoEditar.data_pagamento_informativo).format('DD/MM/YYYY')}</span>
                </div>
                {pagamentoEditar.semana_data_inicio && (
                  <div className="flex justify-between text-sm">
                    <span className="text-white/60">Semana:</span>
                    <span className="font-medium">
                      {dayjs(pagamentoEditar.semana_data_inicio).format('DD/MM/YYYY')} - {dayjs(pagamentoEditar.semana_data_fim).format('DD/MM/YYYY')}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-sm pt-2 border-t border-white/10">
                  <span className="text-white/60">Valor Atual:</span>
                  <span className="font-bold text-green-400">{formatCurrency(pagamentoEditar.valor_pago)}</span>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Novo Valor <span className="text-red-400">*</span>
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={valorEditar}
                  onChange={(e) => setValorEditar(e.target.value)}
                  className="w-full px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                  placeholder="0.00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Observação
                </label>
                <textarea
                  value={observacaoEditar}
                  onChange={(e) => setObservacaoEditar(e.target.value)}
                  rows={2}
                  className="w-full px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                  placeholder="Ex: Valor corrigido"
                />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-white/10 flex justify-end gap-3">
              <button
                onClick={() => setShowModalEditar(false)}
                className="px-4 py-2 bg-white/10 text-white/60 rounded-lg hover:bg-white/15"
              >
                Cancelar
              </button>
              <button
                onClick={handleEditarPagamento}
                className="px-6 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] font-medium flex items-center gap-2"
              >
                <Save className="w-4 h-4" />
                Salvar Alterações
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Histórico de Pagamentos */}
      {showHistorico && contaParcialSelecionada && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#12141f] rounded-lg max-w-3xl w-full max-h-[80vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Histórico de Pagamentos Informativos</h3>
              <button
                onClick={() => setShowHistorico(false)}
                className="text-white/30 hover:text-white/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 overflow-y-auto flex-1">
              <div className="bg-[#12141f]/5 border border-white/10 rounded-lg p-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-white/60">Fornecedor:</span>
                    <p className="font-medium mt-1">{contaParcialSelecionada.fornecedor_nome}</p>
                  </div>
                  <div>
                    <span className="text-white/60">Valor Total:</span>
                    <p className="font-medium mt-1">{formatCurrency(contaParcialSelecionada.valor_total)}</p>
                  </div>
                  <div>
                    <span className="text-white/60">Total Pago (Planejamento):</span>
                    <p className="font-medium mt-1 text-green-400">{formatCurrency(contaParcialSelecionada.valor_pago_planejamento || 0)}</p>
                  </div>
                  <div>
                    <span className="text-white/60">Saldo Restante:</span>
                    <p className="font-medium mt-1 text-red-400">{formatCurrency(contaParcialSelecionada.valor_restante_planejamento || 0)}</p>
                  </div>
                </div>
              </div>

              {historicoPagamentos.length === 0 ? (
                <div className="text-center py-8">
                  <Receipt className="w-12 h-12 text-white/20 mx-auto mb-3" />
                  <p className="text-white/40">Nenhum pagamento registrado</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {historicoPagamentos.map((pagamento) => (
                    <div key={pagamento.id} className="bg-[#12141f] border border-white/10 rounded-lg p-4 hover:shadow-md transition-shadow">
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-bold text-lg text-green-400">{formatCurrency(pagamento.valor_pago)}</span>
                            {pagamento.observacao && (
                              <span className="text-xs bg-blue-500/15 text-[#7D1F2C] px-2 py-0.5 rounded">
                                {pagamento.observacao}
                              </span>
                            )}
                          </div>
                          <div className="text-sm text-white/60">
                            Data: {dayjs(pagamento.data_pagamento_informativo).format('DD/MM/YYYY')}
                          </div>
                          {pagamento.semana_data_inicio && (
                            <div className="text-xs text-white/40 mt-1">
                              Semana: {dayjs(pagamento.semana_data_inicio).format('DD/MM/YYYY')} • Faturamento: {formatCurrency(pagamento.semana_faturamento || 0)}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <button
                            onClick={() => handleAbrirEditar(pagamento)}
                            className="text-[#7D1F2C] hover:text-blue-300 p-2"
                            title="Editar pagamento"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleExcluirPagamento(pagamento.id)}
                            className="text-red-400 hover:text-red-300 p-2"
                            title="Excluir pagamento"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setShowHistorico(false)}
                className="px-4 py-2 bg-white/10 text-white/60 rounded-lg hover:bg-white/15"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Vincular Despesa com Conta a Pagar */}
      {showModalVincular && despesaParaVincular && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#12141f] rounded-lg max-w-3xl w-full max-h-[80vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center">
              <h2 className="text-xl font-bold text-white">
                Vincular Despesa com Conta a Pagar
              </h2>
              <button
                onClick={() => {
                  setShowModalVincular(false);
                  setDespesaParaVincular(null);
                }}
                className="text-white/30 hover:text-white/60"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              <div className="bg-blue-500/10 rounded-lg p-4 mb-6">
                <h3 className="font-medium text-white mb-2">Despesa a Vincular</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-white/60">Fornecedor:</span>
                    <span className="ml-2 font-medium">{despesaParaVincular.fornecedor}</span>
                  </div>
                  <div>
                    <span className="text-white/60">Valor:</span>
                    <span className="ml-2 font-medium">{formatCurrency(despesaParaVincular.valor)}</span>
                  </div>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Buscar Conta
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-white/30" />
                  </div>
                  <input
                    type="text"
                    value={buscaVincular}
                    onChange={(e) => setBuscaVincular(e.target.value)}
                    placeholder="Buscar por fornecedor ou descrição..."
                    className="block w-full pl-10 pr-3 py-2 border border-white/20 rounded-lg focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                  />
                </div>
              </div>

              <h3 className="font-medium text-white mb-3">Selecione a Conta a Pagar</h3>
              <div className="overflow-y-auto max-h-96">
                {(() => {
                  const contasFiltradas = contasDisponiveis.filter(c => {
                    if (!buscaVincular) return true;
                    const termo = buscaVincular.toLowerCase();
                    return (
                      c.fornecedor_nome?.toLowerCase().includes(termo) ||
                      c.descricao?.toLowerCase().includes(termo)
                    );
                  });

                  if (contasFiltradas.length === 0) {
                    return (
                      <div className="text-center py-12">
                        <FileText className="w-16 h-16 text-white/20 mx-auto mb-4" />
                        <p className="text-white/40">
                          {buscaVincular ? 'Nenhuma conta encontrada com este termo' : 'Nenhuma conta a pagar disponível'}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {contasFiltradas.map(conta => (
                      <div
                        key={conta.id}
                        onClick={() => {
                          if (!conta.ja_vinculada) {
                            handleVincularConta(conta.id);
                          }
                        }}
                        className={`border rounded-lg p-4 transition-all ${
                          conta.ja_vinculada
                            ? 'bg-[#12141f]/10 border-white/10 opacity-50 cursor-not-allowed'
                            : 'border-white/10 hover:border-blue-500 hover:bg-blue-500/10 cursor-pointer'
                        }`}
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-medium text-white">{conta.fornecedor_nome}</h4>
                              {conta.ja_vinculada && (
                                <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-500/15 text-red-300">
                                  Já Vinculada
                                </span>
                              )}
                            </div>
                            <p className="text-sm text-white/60 mb-1">{conta.descricao}</p>
                            <div className="flex gap-4 text-xs text-white/40">
                              <span>Vencimento: {dayjs(conta.data_vencimento).format('DD/MM/YYYY')}</span>
                              <span>Categoria: {conta.categoria_nome}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-lg font-bold text-white">{formatCurrency(conta.valor_total)}</p>
                            {conta.valor_pago > 0 && (
                              <p className="text-xs text-green-400">
                                Pago: {formatCurrency(conta.valor_pago)}
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-white/10 flex justify-end">
              <button
                onClick={() => {
                  setShowModalVincular(false);
                  setDespesaParaVincular(null);
                }}
                className="px-6 py-2 bg-white/10 text-white/60 rounded-lg hover:bg-white/15"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Importar Contas Futuras */}
      {showModalImportarFuturas && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-[#12141f] rounded-lg max-w-4xl w-full max-h-[85vh] overflow-hidden">
            <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center">
              <div>
                <h2 className="text-xl font-bold text-white">
                  Importar Contas Futuras como Previsão
                </h2>
                <p className="text-sm text-white/60 mt-1">
                  Contas com vencimento a partir de 30 dias
                </p>
              </div>
              <button
                onClick={() => setShowModalImportarFuturas(false)}
                className="text-white/30 hover:text-white/60"
              >
                <X className="w-6 h-6" />
              </button>
            </div>

            <div className="p-6">
              <div className="mb-4">
                <label className="block text-sm font-medium text-white/80 mb-2">
                  Buscar Conta
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-white/30" />
                  </div>
                  <input
                    type="text"
                    value={buscaFuturas}
                    onChange={(e) => setBuscaFuturas(e.target.value)}
                    placeholder="Buscar por fornecedor ou descrição..."
                    className="block w-full pl-10 pr-3 py-2 border border-white/20 rounded-lg focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                  />
                </div>
              </div>

              <div className="overflow-y-auto max-h-[55vh]">
                {(() => {
                  const contasFiltradas = contasFuturas.filter(c => {
                    // Filtrar contas já importadas
                    if (c.ja_importada) return false;

                    // Filtrar por busca
                    if (!buscaFuturas) return true;
                    const termo = buscaFuturas.toLowerCase();
                    return (
                      c.fornecedor_nome?.toLowerCase().includes(termo) ||
                      c.descricao?.toLowerCase().includes(termo)
                    );
                  });

                  if (contasFiltradas.length === 0) {
                    return (
                      <div className="text-center py-12">
                        <FileText className="w-16 h-16 text-white/20 mx-auto mb-4" />
                        <p className="text-white/40">
                          {buscaFuturas ? 'Nenhuma conta encontrada' : 'Nenhuma conta futura disponível'}
                        </p>
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-3">
                      {contasFiltradas.map(conta => (
                        <div
                          key={conta.id}
                          className={`border rounded-lg p-4 ${
                            conta.ja_importada
                              ? 'bg-[#12141f]/10 border-white/10 opacity-50'
                              : 'border-white/10 hover:border-green-500 hover:bg-green-500/10'
                          }`}
                        >
                          <div className="flex justify-between items-start mb-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <h4 className="font-medium text-white">{conta.fornecedor_nome}</h4>
                                {conta.ja_importada && (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/15 text-green-300">
                                    Já Importada
                                  </span>
                                )}
                              </div>
                              <p className="text-sm text-white/60 mb-2">{conta.descricao}</p>
                              <div className="flex gap-4 text-xs text-white/40">
                                <span>Vencimento: {dayjs(conta.data_vencimento).format('DD/MM/YYYY')}</span>
                                <span>Em {conta.dias_ate_vencimento} dias</span>
                                <span>Categoria: {conta.categoria_nome}</span>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-white">{formatCurrency(conta.valor_total)}</p>
                            </div>
                          </div>

                          {!conta.ja_importada && (
                            <div className="flex gap-2 pt-3 border-t border-white/10">
                              <button
                                onClick={() => handleImportarContaFutura(conta.id)}
                                className="flex-1 bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm font-medium"
                              >
                                Importar com Vencimento Original
                              </button>
                              <button
                                onClick={() => {
                                  const dataPagamento = prompt(
                                    'Digite a data de pagamento prevista (DD/MM/AAAA):',
                                    dayjs(conta.data_vencimento).format('DD/MM/YYYY')
                                  );
                                  if (dataPagamento) {
                                    const partes = dataPagamento.split('/');
                                    if (partes.length === 3) {
                                      const dataFormatada = `${partes[2]}-${partes[1]}-${partes[0]}`;
                                      handleImportarContaFutura(conta.id, dataFormatada);
                                    } else {
                                      alert('Data inválida');
                                    }
                                  }
                                }}
                                className="flex-1 bg-[#7D1F2C] text-white px-4 py-2 rounded-lg hover:bg-[#6a1a25] text-sm font-medium"
                              >
                                Importar com Data Personalizada
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className="px-6 py-4 border-t border-white/10 flex justify-end">
              <button
                onClick={() => setShowModalImportarFuturas(false)}
                className="px-6 py-2 bg-white/10 text-white/60 rounded-lg hover:bg-white/15"
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

export default VisaoEstrategica;
