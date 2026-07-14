import React, { useState, useEffect } from 'react';
import { 
  Calendar,
  Download,
  Plus,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  DollarSign,
  Building2,
  FileText,
  Trash2,
  Eye,
  User,
  Package,
  CreditCard,
  Banknote,
  Target,
  Activity,
  TrendingUp,
  RotateCcw,
  Lock,
  Unlock
} from 'lucide-react';
import dayjs from 'dayjs';
import {
  criarOuImportarAgenda,
  carregarAgenda,
  incluirAdHoc,
  setStatusItem,
  setStatusItemParcial,
  gerarRelatorioPDF,
  fecharAgenda,
  reabrirAgenda,
  type AgendaCompleta,
  type AgendaPagamentoItem,
  type PayloadAdHoc
} from '../../services/financeiroDia';
import { supabase } from '../../lib/supabase';
import { ReportGenerator } from '../../utils/reportGenerator';

interface AgendaPagamentosDiaProps {
  diretor?: boolean;
  userId?: string;
}

interface Totais {
  proposto: number;
  aprovado: number;
  reprovado: number;
  executado: number;
  cancelado: number;
}

interface AprovacaoModal {
  isOpen: boolean;
  item: AgendaPagamentoItem | null;
  valorAprovado: number;
}

const AgendaPagamentosDia: React.FC<AgendaPagamentosDiaProps> = ({
  diretor = false,
  userId
}) => {
  const [dataISO, setDataISO] = useState(dayjs().format('YYYY-MM-DD'));
  const [agendaCompleta, setAgendaCompleta] = useState<AgendaCompleta | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showFormAdHoc, setShowFormAdHoc] = useState(false);
  const [aprovacaoModal, setAprovacaoModal] = useState<AprovacaoModal>({
    isOpen: false,
    item: null,
    valorAprovado: 0
  });
  const [totais, setTotais] = useState<Totais>({
    proposto: 0,
    aprovado: 0,
    reprovado: 0,
    executado: 0,
    cancelado: 0
  });

  const [fornecedores, setFornecedores] = useState<Array<{id: string, nome: string}>>([]);
  const [formAdHoc, setFormAdHoc] = useState({
    fornecedor: '',
    fornecedor_id: '',
    descricao: '',
    valor: 0,
    vencimento: dayjs().format('YYYY-MM-DD'),
    observacao: '',
    mostrar_novo_fornecedor: false,
    novo_fornecedor_nome: ''
  });

  useEffect(() => {
    carregarDados();
  }, [dataISO]);

  useEffect(() => {
    carregarFornecedores();
  }, []);

  useEffect(() => {
    if (agendaCompleta) {
      calcularTotais();
    }
  }, [agendaCompleta]);

  const carregarFornecedores = async () => {
    try {
      const { data, error } = await supabase
        .from('fornecedores')
        .select('id, nome')
        .eq('status', 'ativo')
        .order('nome');

      if (error) throw error;
      setFornecedores(data || []);
    } catch (err) {
      console.error('Erro ao carregar fornecedores:', err);
    }
  };

  const carregarDados = async () => {
    try {
      setLoading(true);
      setError(null);

      const agenda = await carregarAgenda(dataISO);
      setAgendaCompleta(agenda);
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const calcularTotais = () => {
    if (!agendaCompleta) {
      setTotais({ proposto: 0, aprovado: 0, reprovado: 0, executado: 0, cancelado: 0 });
      return;
    }

    const novos: Totais = {
      proposto: 0,
      aprovado: 0,
      reprovado: 0,
      executado: 0,
      cancelado: 0
    };

    agendaCompleta.itens.forEach(item => {
      switch (item.status) {
        case 'proposto':
          novos.proposto += item.valor;
          break;
        case 'aprovado':
          novos.aprovado += item.valor;
          break;
        case 'reprovado':
          novos.reprovado += item.valor;
          break;
        case 'executado':
          novos.executado += item.valor;
          break;
        case 'cancelado':
          novos.cancelado += item.valor;
          break;
      }
    });

    setTotais(novos);
  };

  const handleImportarAP = async () => {
    try {
      setLoading(true);
      setError(null);

      // Verificar se agenda já existe antes de tentar criar
      const agendaExistente = await carregarAgenda(dataISO);
      if (agendaExistente) {
        alert('Agenda para esta data já existe. Os dados foram recarregados.');
        setAgendaCompleta(agendaExistente);
        return;
      }

      await criarOuImportarAgenda(dataISO);
      await carregarDados();
    } catch (err) {
      console.error('Erro ao importar:', err);
      setError(err instanceof Error ? err.message : 'Erro ao importar do Contas a Pagar');
    } finally {
      setLoading(false);
    }
  };

  const handleAdicionarAdHoc = async () => {
    try {
      if (!agendaCompleta) {
        throw new Error('Nenhuma agenda carregada');
      }

      if (!formAdHoc.descricao || formAdHoc.valor <= 0) {
        throw new Error('Preencha todos os campos obrigatórios');
      }

      setLoading(true);
      setError(null);

      let fornecedorId = formAdHoc.fornecedor_id;
      let fornecedorNome = formAdHoc.fornecedor;

      // Se está criando novo fornecedor
      if (formAdHoc.mostrar_novo_fornecedor && formAdHoc.novo_fornecedor_nome) {
        const { data: novoFornecedor, error: fornecedorError } = await supabase
          .from('fornecedores')
          .insert([{ nome: formAdHoc.novo_fornecedor_nome, status: 'ativo' }])
          .select()
          .single();

        if (fornecedorError) throw fornecedorError;
        fornecedorId = novoFornecedor.id;
        fornecedorNome = novoFornecedor.nome;

        // Recarregar lista de fornecedores
        await carregarFornecedores();
      } else if (fornecedorId) {
        // Buscar nome do fornecedor selecionado
        const fornecedorSelecionado = fornecedores.find(f => f.id === fornecedorId);
        if (fornecedorSelecionado) {
          fornecedorNome = fornecedorSelecionado.nome;
        }
      }

      if (!fornecedorNome) {
        throw new Error('Selecione um fornecedor ou adicione um novo');
      }

      // Chamar função RPC com fornecedor_id
      const { error } = await supabase.rpc('api_fin_incluir_adhoc', {
        p_agenda_id: agendaCompleta.agenda.id,
        p_fornecedor: fornecedorNome,
        p_descricao: formAdHoc.descricao,
        p_valor: formAdHoc.valor,
        p_vencimento: formAdHoc.vencimento,
        p_observacao: formAdHoc.observacao || null,
        p_fornecedor_id: fornecedorId || null
      });

      if (error) throw error;

      // Reset form
      setFormAdHoc({
        fornecedor: '',
        descricao: '',
        valor: 0,
        vencimento: dayjs().format('YYYY-MM-DD'),
        observacao: '',
        fornecedor_id: '',
        mostrar_novo_fornecedor: false,
        novo_fornecedor_nome: ''
      });
      setShowFormAdHoc(false);

      await carregarDados();
    } catch (err) {
      console.error('Erro ao adicionar ad-hoc:', err);
      setError(err instanceof Error ? err.message : 'Erro ao adicionar pagamento ad-hoc');
    } finally {
      setLoading(false);
    }
  };

  const handleAlterarStatus = async (itemId: string, novoStatus: 'aprovado' | 'reprovado' | 'cancelado') => {
    try {
      setLoading(true);
      setError(null);

      await setStatusItem(itemId, novoStatus, userId);
      await carregarDados();
    } catch (err) {
      console.error('Erro ao alterar status:', err);
      setError(err instanceof Error ? err.message : 'Erro ao alterar status');
    } finally {
      setLoading(false);
    }
  };

  const handleAprovarParcial = async (item: AgendaPagamentoItem) => {
    setAprovacaoModal({
      isOpen: true,
      item,
      valorAprovado: item.valor
    });
  };

  const confirmarAprovacaoParcial = async () => {
    if (!aprovacaoModal.item) return;

    try {
      setLoading(true);
      setError(null);

      await setStatusItemParcial(
        aprovacaoModal.item.id, 
        'aprovado', 
        aprovacaoModal.valorAprovado,
        userId
      );
      
      setAprovacaoModal({ isOpen: false, item: null, valorAprovado: 0 });
      await carregarDados();
    } catch (err) {
      console.error('Erro ao aprovar valor parcial:', err);
      setError(err instanceof Error ? err.message : 'Erro ao aprovar valor parcial');
    } finally {
      setLoading(false);
    }
  };

  const handleGeneratePDFReport = async () => {
    if (!agendaCompleta) {
      alert('Nenhuma agenda carregada para gerar relatório');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const dadosRelatorio = await gerarRelatorioPDF(dataISO);
      
      const reportGenerator = new ReportGenerator({
        title: 'Relatório da Agenda de Pagamentos',
        subtitle: `Data: ${dayjs(dataISO).format('DD/MM/YYYY')} - Status: ${agendaCompleta.agenda.status}`,
        filename: `agenda-pagamentos-${dataISO}.pdf`,
        orientation: 'landscape'
      });
      
      let currentY = reportGenerator.addHeader(
        'Relatório da Agenda de Pagamentos',
        `Data: ${dayjs(dataISO).format('DD/MM/YYYY')} - Status: ${agendaCompleta.agenda.status}`
      );

      // Resumo executivo
      const resumo = [
        ['Indicador', 'Valor'],
        ['Total de Itens', agendaCompleta.itens.length.toString()],
        ['Valor Total Proposto', formatCurrency(totais.proposto)],
        ['Valor Total Aprovado', formatCurrency(totais.aprovado)],
        ['Valor Total Executado', formatCurrency(totais.executado)],
        ['Valor Total Reprovado', formatCurrency(totais.reprovado)],
        ['Data de Criação', dayjs(agendaCompleta.agenda.criado_em).format('DD/MM/YYYY HH:mm')],
        ['Data de Fechamento', agendaCompleta.agenda.fechado_em ? dayjs(agendaCompleta.agenda.fechado_em).format('DD/MM/YYYY HH:mm') : 'Não fechada']
      ];

      currentY = reportGenerator.addSection('Resumo Executivo', [], currentY);
      currentY = reportGenerator.addTable(['Indicador', 'Valor'], resumo, currentY);

      // Itens aprovados
      const itensAprovados = agendaCompleta.itens.filter(item => item.status === 'aprovado' || item.status === 'executado');
      if (itensAprovados.length > 0) {
        const headersAprovados = ['Origem', 'Fornecedor', 'Descrição', 'Valor Original', 'Valor Aprovado', 'Vencimento', 'Status'];
        const dataAprovados = itensAprovados.map(item => [
          item.origem === 'ap' ? 'Contas a Pagar' : 'Ad-hoc',
          item.fornecedor,
          item.descricao.length > 50 ? item.descricao.substring(0, 50) + '...' : item.descricao,
          formatCurrency(item.valor_original || item.valor),
          formatCurrency(item.valor_aprovado || item.valor),
          dayjs(item.vencimento).format('DD/MM/YYYY'),
          item.status === 'executado' ? 'Executado' : 'Aprovado'
        ]);

        currentY = reportGenerator.addSection('Pagamentos Aprovados/Executados', [], currentY + 10);
        currentY = reportGenerator.addTable(headersAprovados, dataAprovados, currentY);
      }

      // Itens reprovados
      const itensReprovados = agendaCompleta.itens.filter(item => item.status === 'reprovado');
      if (itensReprovados.length > 0) {
        const headersReprovados = ['Origem', 'Fornecedor', 'Descrição', 'Valor', 'Vencimento', 'Observação'];
        const dataReprovados = itensReprovados.map(item => [
          item.origem === 'ap' ? 'Contas a Pagar' : 'Ad-hoc',
          item.fornecedor,
          item.descricao.length > 50 ? item.descricao.substring(0, 50) + '...' : item.descricao,
          formatCurrency(item.valor),
          dayjs(item.vencimento).format('DD/MM/YYYY'),
          item.observacao || 'Não informado'
        ]);

        currentY = reportGenerator.addSection('Pagamentos Reprovados', [], currentY + 10);
        currentY = reportGenerator.addTable(headersReprovados, dataReprovados, currentY);
      }

      // Análise por origem
      const itensAP = agendaCompleta.itens.filter(item => item.origem === 'ap');
      const itensAdHoc = agendaCompleta.itens.filter(item => item.origem === 'ad-hoc');
      
      const analiseOrigem = [
        ['Origem', 'Quantidade', 'Valor Total', 'Aprovados', 'Valor Aprovado'],
        [
          'Contas a Pagar',
          itensAP.length.toString(),
          formatCurrency(itensAP.reduce((sum, item) => sum + item.valor, 0)),
          itensAP.filter(item => item.status === 'aprovado' || item.status === 'executado').length.toString(),
          formatCurrency(itensAP.filter(item => item.status === 'aprovado' || item.status === 'executado').reduce((sum, item) => sum + (item.valor_aprovado || item.valor), 0))
        ],
        [
          'Ad-hoc',
          itensAdHoc.length.toString(),
          formatCurrency(itensAdHoc.reduce((sum, item) => sum + item.valor, 0)),
          itensAdHoc.filter(item => item.status === 'aprovado' || item.status === 'executado').length.toString(),
          formatCurrency(itensAdHoc.filter(item => item.status === 'aprovado' || item.status === 'executado').reduce((sum, item) => sum + (item.valor_aprovado || item.valor), 0))
        ]
      ];

      currentY = reportGenerator.addSection('Análise por Origem', [], currentY + 10);
      reportGenerator.addTable(['Origem', 'Quantidade', 'Valor Total', 'Aprovados', 'Valor Aprovado'], analiseOrigem, currentY);

      reportGenerator.save(`agenda-pagamentos-${dataISO}.pdf`);
      
    } catch (err) {
      console.error('Erro ao gerar relatório:', err);
      setError(err instanceof Error ? err.message : 'Erro ao gerar relatório PDF');
    } finally {
      setLoading(false);
    }
  };

  const handleFecharAgenda = async () => {
    if (!agendaCompleta) return;
    
    const itensAprovados = agendaCompleta.itens.filter(item => item.status === 'aprovado');
    
    if (itensAprovados.length === 0) {
      alert('Não há itens aprovados para executar');
      return;
    }

    const totalAprovado = itensAprovados.reduce((sum, item) => sum + item.valor, 0);
    
    if (!confirm(`Confirma o fechamento da agenda?\n\nItens aprovados: ${itensAprovados.length}\nValor total: ${formatCurrency(totalAprovado)}\n\nEsta ação irá executar os pagamentos e não poderá ser desfeita.`)) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await fecharAgenda(agendaCompleta.agenda.id, userId);
      await carregarDados();
    } catch (err) {
      console.error('Erro ao fechar agenda:', err);
      setError(err instanceof Error ? err.message : 'Erro ao fechar agenda');
    } finally {
      setLoading(false);
    }
  };

  const handleReabrirAgenda = async () => {
    if (!agendaCompleta) return;

    if (!confirm('Confirma a reabertura da agenda?\n\nEsta ação permitirá novas alterações nos pagamentos.')) {
      return;
    }

    try {
      setLoading(true);
      setError(null);

      await reabrirAgenda(agendaCompleta.agenda.id);
      await carregarDados();
    } catch (err) {
      console.error('Erro ao reabrir agenda:', err);
      setError(err instanceof Error ? err.message : 'Erro ao reabrir agenda');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'proposto':
        return 'text-blue-300 bg-blue-900/30 border-blue-200';
      case 'aprovado':
        return 'text-green-300 bg-green-900/30 border-green-200';
      case 'reprovado':
        return 'text-red-300 bg-red-900/30 border-red-200';
      case 'executado':
        return 'text-purple-300 bg-purple-900/30 border-purple-200';
      case 'cancelado':
        return 'text-white/50 bg-white/10 border-white/10';
      default:
        return 'text-white/50 bg-white/10 border-white/10';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'proposto':
        return <Clock className="w-4 h-4" />;
      case 'aprovado':
        return <CheckCircle className="w-4 h-4" />;
      case 'reprovado':
        return <XCircle className="w-4 h-4" />;
      case 'executado':
        return <Target className="w-4 h-4" />;
      case 'cancelado':
        return <Trash2 className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'proposto':
        return 'Proposto';
      case 'aprovado':
        return 'Aprovado';
      case 'reprovado':
        return 'Reprovado';
      case 'executado':
        return 'Executado';
      case 'cancelado':
        return 'Cancelado';
      default:
        return status;
    }
  };

  const getOrigemColor = (origem: string) => {
    return origem === 'ap' ? 'text-blue-300 bg-blue-900/30' : 'text-orange-300 bg-orange-900/30';
  };

  const getOrigemText = (origem: string) => {
    return origem === 'ap' ? 'Contas a Pagar' : 'Ad-hoc';
  };

  const isAgendaAberta = () => {
    return agendaCompleta?.agenda?.status === 'aberta';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-white">Aprovação do Dia</h3>
        <div className="flex items-center space-x-3">
          {agendaCompleta && (
            <div className="flex items-center space-x-2">
              <span className={`inline-flex items-center px-3 py-1 text-sm font-medium rounded-full border ${
                agendaCompleta.agenda.status === 'aberta'
                  ? 'text-green-300 bg-green-900/30 border-green-200'
                  : 'text-white/50 bg-white/10 border-white/10'
              }`}>
                {agendaCompleta.agenda.status === 'aberta' ? (
                  <Unlock className="w-4 h-4 mr-1" />
                ) : (
                  <Lock className="w-4 h-4 mr-1" />
                )}
                {agendaCompleta.agenda.status === 'aberta' ? 'Aberta' : 'Fechada'}
              </span>
              
              {diretor && (
                <>
                  {agendaCompleta.agenda.status === 'aberta' ? (
                    <button
                      onClick={handleFecharAgenda}
                      disabled={loading}
                      className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                    >
                      <Lock className="w-4 h-4 inline mr-2" />
                      Fechar Dia
                    </button>
                  ) : (
                    <button
                      onClick={handleReabrirAgenda}
                      disabled={loading}
                      className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                    >
                      <Unlock className="w-4 h-4 inline mr-2" />
                      Reabrir
                    </button>
                  )}
                </>
              )}
              <button
                onClick={handleGeneratePDFReport}
                disabled={!agendaCompleta || loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <FileText className="w-4 h-4 inline mr-2" />
                Relatório PDF
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 text-red-300 rounded-lg">
          {error}
        </div>
      )}

      {/* Seletor de Data e Controles */}
      <div className="bg-[#12141f] p-6 rounded-lg shadow-sm border border-white/10">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center space-x-4">
            <div>
              <label className="block text-sm font-medium text-white/80 mb-1">
                Data da Agenda
              </label>
              <input
                type="date"
                value={dataISO}
                onChange={(e) => setDataISO(e.target.value)}
                className="rounded-md border-white/20 shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
              />
            </div>
            <div className="pt-6">
              <button
                onClick={handleImportarAP}
                disabled={loading}
                className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] disabled:opacity-50"
              >
                <Download className="w-4 h-4 inline mr-2" />
                {loading ? 'Processando...' : 'Importar do Contas a Pagar'}
              </button>
            </div>
          </div>

          {isAgendaAberta() && (
            <button
              onClick={() => setShowFormAdHoc(!showFormAdHoc)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 inline mr-2" />
              Pagamento Ad-hoc
            </button>
          )}
        </div>

        {/* Formulário Ad-hoc */}
        {showFormAdHoc && isAgendaAberta() && (
          <div className="mt-6 p-4 bg-blue-500/10 rounded-lg border border-blue-200">
            <h4 className="text-md font-medium text-blue-300 mb-3">Adicionar Pagamento Ad-hoc</h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Fornecedor *
                </label>
                <select
                  value={formAdHoc.fornecedor_id}
                  onChange={(e) => {
                    const valor = e.target.value;
                    if (valor === '_novo') {
                      setFormAdHoc({
                        ...formAdHoc,
                        fornecedor_id: '',
                        mostrar_novo_fornecedor: true,
                        novo_fornecedor_nome: ''
                      });
                    } else {
                      setFormAdHoc({
                        ...formAdHoc,
                        fornecedor_id: valor,
                        mostrar_novo_fornecedor: false,
                        novo_fornecedor_nome: ''
                      });
                    }
                  }}
                  className="w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  required
                >
                  <option value="">Selecione um fornecedor</option>
                  {fornecedores.map(f => (
                    <option key={f.id} value={f.id}>{f.nome}</option>
                  ))}
                  <option value="_novo">➕ Adicionar Novo Fornecedor</option>
                </select>
                {formAdHoc.mostrar_novo_fornecedor && (
                  <input
                    type="text"
                    value={formAdHoc.novo_fornecedor_nome}
                    onChange={(e) => setFormAdHoc({ ...formAdHoc, novo_fornecedor_nome: e.target.value })}
                    className="mt-2 w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                    placeholder="Nome do novo fornecedor"
                    required
                  />
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Valor *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-white/50 sm:text-sm">R$</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={formAdHoc.valor}
                    onChange={(e) => setFormAdHoc({ ...formAdHoc, valor: parseFloat(e.target.value) || 0 })}
                    className="pl-10 w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Descrição *
                </label>
                <input
                  type="text"
                  value={formAdHoc.descricao}
                  onChange={(e) => setFormAdHoc({ ...formAdHoc, descricao: e.target.value })}
                  className="w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  placeholder="Descrição do pagamento"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Vencimento
                </label>
                <input
                  type="date"
                  value={formAdHoc.vencimento}
                  onChange={(e) => setFormAdHoc({ ...formAdHoc, vencimento: e.target.value })}
                  className="w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Observação
                </label>
                <textarea
                  value={formAdHoc.observacao}
                  onChange={(e) => setFormAdHoc({ ...formAdHoc, observacao: e.target.value })}
                  className="w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  rows={2}
                  placeholder="Observações sobre o pagamento"
                />
              </div>

              <div className="md:col-span-2 flex justify-end space-x-3">
                <button
                  onClick={() => setShowFormAdHoc(false)}
                  className="px-4 py-2 border border-white/20 rounded-md text-white/80 hover:bg-white/5"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleAdicionarAdHoc}
                  disabled={
                    loading ||
                    !formAdHoc.descricao ||
                    formAdHoc.valor <= 0 ||
                    (!formAdHoc.fornecedor_id && !formAdHoc.novo_fornecedor_nome)
                  }
                  className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                >
                  {loading ? 'Adicionando...' : 'Adicionar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Cards de Totais */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-[#12141f] p-6 rounded-lg shadow-sm border border-white/10">
          <div className="flex items-center">
            <Clock className="w-8 h-8 text-blue-400 mr-3" />
            <div>
              <p className="text-sm font-medium text-white/50">Proposto</p>
              <p className="text-2xl font-bold text-blue-400">
                {formatCurrency(totais.proposto)}
              </p>
              <p className="text-sm text-white/70">Aguardando decisão</p>
            </div>
          </div>
        </div>

        <div className="bg-[#12141f] p-6 rounded-lg shadow-sm border border-white/10">
          <div className="flex items-center">
            <CheckCircle className="w-8 h-8 text-green-400 mr-3" />
            <div>
              <p className="text-sm font-medium text-white/50">Aprovado</p>
              <p className="text-2xl font-bold text-green-400">
                {formatCurrency(totais.aprovado)}
              </p>
              <p className="text-sm text-white/70">Pronto para pagamento</p>
            </div>
          </div>
        </div>

        <div className="bg-[#12141f] p-6 rounded-lg shadow-sm border border-white/10">
          <div className="flex items-center">
            <XCircle className="w-8 h-8 text-red-400 mr-3" />
            <div>
              <p className="text-sm font-medium text-white/50">Reprovado</p>
              <p className="text-2xl font-bold text-red-400">
                {formatCurrency(totais.reprovado)}
              </p>
              <p className="text-sm text-white/70">Não autorizado</p>
            </div>
          </div>
        </div>

        <div className="bg-[#12141f] p-6 rounded-lg shadow-sm border border-white/10">
          <div className="flex items-center">
            <Target className="w-8 h-8 text-purple-400 mr-3" />
            <div>
              <p className="text-sm font-medium text-white/50">Executado</p>
              <p className="text-2xl font-bold text-purple-400">
                {formatCurrency(totais.executado)}
              </p>
              <p className="text-sm text-white/70">Pagamento realizado</p>
            </div>
          </div>
        </div>

        <div className="bg-[#12141f] p-6 rounded-lg shadow-sm border border-white/10">
          <div className="flex items-center">
            <Trash2 className="w-8 h-8 text-white/70 mr-3" />
            <div>
              <p className="text-sm font-medium text-white/50">Cancelado</p>
              <p className="text-2xl font-bold text-white/70">
                {formatCurrency(totais.cancelado)}
              </p>
              <p className="text-sm text-white/70">Cancelado</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabela de Itens */}
      <div className="bg-[#12141f] rounded-lg shadow-sm border border-white/10 overflow-hidden">
        <div className="px-6 py-4 border-b border-white/10">
          <h4 className="text-lg font-medium text-white">
            Pagamentos da Agenda - {dayjs(dataISO).format('DD/MM/YYYY')}
          </h4>
          {agendaCompleta && (
            <p className="text-sm text-white/70 mt-1">
              {agendaCompleta.itens.length} item(ns) | Total: {formatCurrency(agendaCompleta.itens.reduce((sum, item) => sum + item.valor, 0))}
            </p>
          )}
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]"></div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            {agendaCompleta && agendaCompleta.itens.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="text-left bg-white/5 border-b border-white/10">
                    <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                      Origem
                    </th>
                    <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                      Fornecedor
                    </th>
                    <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                      Descrição
                    </th>
                    <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                      Vencimento
                    </th>
                    <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                      Valor
                    </th>
                    <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                      Status
                    </th>
                    {(diretor && isAgendaAberta()) && (
                      <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                        Ações
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody className="bg-transparent divide-y divide-white/10">
                  {agendaCompleta.itens.map((item) => (
                    <tr key={item.id} className="hover:bg-white/5">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getOrigemColor(item.origem)}`}>
                          {item.origem === 'ap' ? <CreditCard className="w-3 h-3 mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                          {getOrigemText(item.origem)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center">
                          <Building2 className="w-4 h-4 text-white/30 mr-2" />
                          <span className="font-medium text-white">{item.fornecedor}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="font-medium text-white">{item.descricao}</div>
                          {item.observacao && (
                            <div className="text-sm text-white/50">{item.observacao}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={
                          dayjs(item.vencimento).isBefore(dayjs(), 'day') ? 'text-red-400' : 'text-white'
                        }>
                          {dayjs(item.vencimento).format('DD/MM/YYYY')}
                          {dayjs(item.vencimento).isBefore(dayjs(), 'day') && (
                            <div className="text-xs text-red-400">
                              Vencida
                            </div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="font-medium text-white">
                          {formatCurrency(item.valor)}
                          {item.valor_aprovado && item.valor_aprovado !== item.valor && (
                            <div className="text-xs text-blue-400 mt-1">
                              Aprovado: {formatCurrency(item.valor_aprovado)}
                            </div>
                          )}
                          {item.valor_original && item.valor_original !== item.valor && (
                            <div className="text-xs text-white/50 mt-1">
                              Original: {formatCurrency(item.valor_original)}
                            </div>
                          )}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full border ${getStatusColor(item.status)}`}>
                          {getStatusIcon(item.status)}
                          <span className="ml-1">{getStatusText(item.status)}</span>
                        </span>
                        {item.aprovado_em && (
                          <div className="text-xs text-white/50 mt-1">
                            {dayjs(item.aprovado_em).format('DD/MM HH:mm')}
                          </div>
                        )}
                        {item.executado_em && (
                          <div className="text-xs text-purple-400 mt-1">
                            Exec: {dayjs(item.executado_em).format('DD/MM HH:mm')}
                          </div>
                        )}
                      </td>
                      {(diretor && isAgendaAberta()) && (
                        <td className="px-6 py-4 whitespace-nowrap">
                          {item.status === 'proposto' && (
                            <div className="flex space-x-2">
                              <button
                                onClick={() => handleAprovarParcial(item)}
                                disabled={loading}
                                className="text-blue-400 hover:text-blue-300 disabled:opacity-50"
                                title="Aprovar (com valor ajustável)"
                              >
                                <DollarSign className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleAlterarStatus(item.id, 'aprovado')}
                                disabled={loading}
                                className="text-green-400 hover:text-green-300 disabled:opacity-50"
                                title="Aprovar valor total"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleAlterarStatus(item.id, 'reprovado')}
                                disabled={loading}
                                className="text-red-400 hover:text-red-300 disabled:opacity-50"
                                title="Reprovar"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleAlterarStatus(item.id, 'cancelado')}
                                disabled={loading}
                                className="text-white/70 hover:text-white/90 disabled:opacity-50"
                                title="Cancelar"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          )}
                          {item.status !== 'proposto' && (
                            <span className="text-sm text-white/30">-</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="text-center py-12">
                <Calendar className="w-16 h-16 text-white/30 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">
                  {agendaCompleta ? 'Nenhum pagamento na agenda' : 'Nenhuma agenda para esta data'}
                </h3>
                <p className="text-white/50 mb-4">
                  {agendaCompleta 
                    ? 'Clique em "Importar do Contas a Pagar" para buscar pagamentos pendentes ou adicione pagamentos ad-hoc.'
                    : 'Clique em "Importar do Contas a Pagar" para criar a agenda e importar pagamentos pendentes.'}
                </p>
                <button
                  onClick={handleImportarAP}
                  disabled={loading}
                  className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25] disabled:opacity-50"
                >
                  <Download className="w-4 h-4 inline mr-2" />
                  {loading ? 'Processando...' : 'Importar do Contas a Pagar'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Informações Adicionais */}
      {agendaCompleta && (
        <div className="bg-white/5 p-4 rounded-lg border border-white/10">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm text-white/70">
            <div>
              <span className="font-medium">Agenda criada em:</span>
              <div>{dayjs(agendaCompleta.agenda.criado_em).format('DD/MM/YYYY HH:mm')}</div>
            </div>
            {agendaCompleta.agenda.fechado_em && (
              <div>
                <span className="font-medium">Fechada em:</span>
                <div>{dayjs(agendaCompleta.agenda.fechado_em).format('DD/MM/YYYY HH:mm')}</div>
              </div>
            )}
            <div>
              <span className="font-medium">Total de itens:</span>
              <div>{agendaCompleta.itens.length}</div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Aprovação Parcial */}
      {aprovacaoModal.isOpen && aprovacaoModal.item && (
        <div className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50">
          <div className="bg-[#0f1020] rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-white mb-4">
              Aprovar Pagamento
            </h3>
            
            {/* Informações do item */}
            <div className="mb-4 p-4 bg-white/5 rounded-lg">
              <div className="text-sm">
                <div className="font-medium text-white mb-2">{aprovacaoModal.item.fornecedor}</div>
                <div className="text-white/80 mb-2">{aprovacaoModal.item.descricao}</div>
                <div className="text-white/70">
                  <span className="font-medium">Valor Original:</span> {formatCurrency(aprovacaoModal.item.valor)}
                </div>
                <div className="text-white/70">
                  <span className="font-medium">Vencimento:</span> {dayjs(aprovacaoModal.item.vencimento).format('DD/MM/YYYY')}
                </div>
              </div>
            </div>

            {/* Valor a aprovar */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-white/80 mb-2">
                Valor a Aprovar *
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <span className="text-white/50 sm:text-sm">R$</span>
                </div>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={aprovacaoModal.item.valor}
                  value={aprovacaoModal.valorAprovado}
                  onChange={(e) => setAprovacaoModal({
                    ...aprovacaoModal,
                    valorAprovado: parseFloat(e.target.value) || 0
                  })}
                  className="pl-10 w-full rounded-md border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  required
                />
              </div>
              <p className="text-xs text-white/50 mt-1">
                Máximo: {formatCurrency(aprovacaoModal.item.valor)}
              </p>
              {aprovacaoModal.valorAprovado < aprovacaoModal.item.valor && (
                <p className="text-xs text-orange-400 mt-1">
                  ⚠️ Aprovação parcial - Diferença: {formatCurrency(aprovacaoModal.item.valor - aprovacaoModal.valorAprovado)}
                </p>
              )}
            </div>
            
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => setAprovacaoModal({ isOpen: false, item: null, valorAprovado: 0 })}
                className="px-4 py-2 border border-white/20 rounded-md text-white/80 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={confirmarAprovacaoParcial}
                disabled={loading || aprovacaoModal.valorAprovado <= 0 || aprovacaoModal.valorAprovado > aprovacaoModal.item.valor}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
              >
                {loading ? 'Aprovando...' : 'Aprovar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AgendaPagamentosDia;