import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, CreditCard as Edit, Trash2, Eye, Music, Calendar, DollarSign, Clock, User, Phone, CheckCircle, XCircle, AlertTriangle, Download, Building2, Receipt, CreditCard, ChevronLeft, ChevronRight, CalendarDays, FileText, Grid3x3 as Grid3X3, List } from 'lucide-react';
import { ReportGenerator, exportToExcel } from '../utils/reportGenerator';
import { supabase } from '../lib/supabase';
import { testConnection } from '../lib/supabase';
import dayjs from 'dayjs';
import { SearchableSelect } from '../components/common/SearchableSelect';
import { PageHeader, KPICard, SectionCard, Badge } from '../components/ui';

interface Musico {
  id: string;
  nome?: string;
  contato?: string;
  valor?: number;
  data_evento?: string;
  horario_inicio?: string;
  horario_fim?: string;
  material_promocional?: string;
  observacoes?: string;
  valor_consumo: number;
  valor_adicional: number;
  valor_total_final: number;
  valor_pago: number;
  saldo_restante: number;
  status_pagamento: 'pendente' | 'pago' | 'cancelado';
  fornecedor_id?: string;
  fornecedor_nome?: string;
  criado_em: string;
}

interface FormData {
  nome: string;
  contato: string;
  valor: number;
  data_evento: string;
  horario_inicio: string;
  horario_fim: string;
  material_promocional: string;
  observacoes: string;
  valor_consumo: number;
  valor_adicional: number;
  fornecedor_id: string;
  status_pagamento: 'pendente' | 'pago' | 'cancelado';
}

interface IndicadoresMusicos {
  total_apresentacoes: number;
  apresentacoes_mes: number;
  valor_total_mes: number;
  valor_pago_mes: number;
  valor_pendente_mes: number;
  musicos_ativos: number;
}

const similarityScore = (str1: string, str2: string): number => {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 100;

  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;

  if (longer.length === 0) return 100;

  const editDistance = getEditDistance(longer, shorter);
  return ((longer.length - editDistance) / longer.length) * 100;
};

const getEditDistance = (s1: string, s2: string): number => {
  const costs: number[] = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) costs[s2.length] = lastValue;
  }
  return costs[s2.length];
};

const Musicians: React.FC = () => {
  const [musicos, setMusicos] = useState<Musico[]>([]);
  const [fornecedores, setFornecedores] = useState<any[]>([]);
  const [indicadores, setIndicadores] = useState<IndicadoresMusicos | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingMusico, setEditingMusico] = useState<Musico | null>(null);
  const [sugestedFornecedorId, setSugestedFornecedorId] = useState<string>('');
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pendente' | 'pago' | 'cancelado'>('all');
  const [mesFilter, setMesFilter] = useState(dayjs().month() + 1);
  const [anoFilter, setAnoFilter] = useState(dayjs().year());
  const [dataInicio, setDataInicio] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [dataFim, setDataFim] = useState(dayjs().endOf('month').format('YYYY-MM-DD'));
  
  // Calendar view states
  const [viewMode, setViewMode] = useState<'table' | 'calendar'>('table');
  const [currentMonth, setCurrentMonth] = useState(dayjs());
  
  const [formData, setFormData] = useState<FormData>({
    nome: '',
    contato: '',
    valor: 0,
    data_evento: dayjs().format('YYYY-MM-DD'),
    horario_inicio: '20:00',
    horario_fim: '23:00',
    material_promocional: '',
    observacoes: '',
    valor_consumo: 0,
    valor_adicional: 0,
    fornecedor_id: '',
    status_pagamento: 'pendente'
  });

  useEffect(() => {
    fetchData();
    fetchFornecedores();
    fetchIndicadores();
  }, []);

  useEffect(() => {
    fetchData();
    fetchIndicadores();
  }, [statusFilter, mesFilter, anoFilter, dataInicio, dataFim]);

  useEffect(() => {
    if (formData.nome && fornecedores.length > 0 && !editingMusico) {
      const scores = fornecedores.map(f => ({
        id: f.id,
        nome: f.nome,
        score: similarityScore(formData.nome, f.nome)
      }));

      const bestMatch = scores.sort((a, b) => b.score - a.score)[0];

      if (bestMatch.score >= 60) {
        setSugestedFornecedorId(bestMatch.id);
        if (!formData.fornecedor_id) {
          setFormData(prev => ({ ...prev, fornecedor_id: bestMatch.id }));
        }
      } else {
        setSugestedFornecedorId('');
      }
    }
  }, [formData.nome, fornecedores, editingMusico]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      const connectionOk = await testConnection();
      if (!connectionOk) {
        console.warn('Supabase connection failed, using empty data');
        setMusicos([]);
        setLoading(false);
        return;
      }

      let query = supabase.from('vw_musicos_financeiro').select('*');

      // Aplicar filtros
      if (statusFilter !== 'all') {
        query = query.eq('status_pagamento', statusFilter);
      }

      // Filtro por período de data
      if (dataInicio) {
        query = query.gte('data_evento', dataInicio);
      }
      if (dataFim) {
        query = query.lte('data_evento', dataFim);
      }

      const { data, error } = await query.order('data_evento', { ascending: false });

      if (error) throw error;
      setMusicos(data || []);
    } catch (err) {
      console.error('Error fetching musicians:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar músicos');
      setMusicos([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchFornecedores = async () => {
    try {
      const connectionOk = await testConnection();
      if (!connectionOk) {
        setFornecedores([]);
        return;
      }

      const { data, error } = await supabase
        .from('fornecedores')
        .select('id, nome, tipo')
        .eq('status', 'ativo')
        .in('tipo', ['musico', 'geral'])
        .order('nome');

      if (error) throw error;

      const fornecedoresData = (data || []).map((f: any) => ({
        ...f,
        isMusicianType: f.tipo === 'musico'
      }));

      fornecedoresData.sort((a: any, b: any) => {
        if (a.isMusicianType === b.isMusicianType) {
          return a.nome.localeCompare(b.nome);
        }
        return a.isMusicianType ? -1 : 1;
      });

      setFornecedores(fornecedoresData);
    } catch (err) {
      console.error('Error fetching suppliers:', err);
      setFornecedores([]);
    }
  };

  const fetchIndicadores = async () => {
    try {
      const connectionOk = await testConnection();
      if (!connectionOk) {
        setIndicadores(null);
        return;
      }

      let query = supabase.from('musicos').select('*');
      if (dataInicio) query = query.gte('data_evento', dataInicio);
      if (dataFim) query = query.lte('data_evento', dataFim);
      if (statusFilter !== 'all') query = query.eq('status_pagamento', statusFilter);

      const { data, error } = await query;
      if (error) throw error;

      const { data: todosMusicos, error: todosError } = await supabase
        .from('musicos')
        .select('nome');
      if (todosError) throw todosError;

      const registros = data || [];
      const valorTotal = registros.reduce((sum, m) => sum + (m.valor_total_final || 0), 0);
      const valorPago = registros.filter(m => m.status_pagamento === 'pago').reduce((sum, m) => sum + (m.valor_total_final || 0), 0);
      const valorPendente = registros.filter(m => m.status_pagamento === 'pendente').reduce((sum, m) => sum + (m.valor_total_final || 0), 0);
      const musicosUnicos = new Set((todosMusicos || []).map(m => m.nome)).size;

      setIndicadores({
        total_apresentacoes: (todosMusicos || []).length,
        apresentacoes_mes: registros.length,
        valor_total_mes: valorTotal,
        valor_pago_mes: valorPago,
        valor_pendente_mes: valorPendente,
        musicos_ativos: musicosUnicos
      });
    } catch (err) {
      console.error('Error fetching indicators:', err);
      setIndicadores(null);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);

      // Validações
      if (!formData.nome || !formData.data_evento || formData.valor <= 0) {
        throw new Error('Preencha todos os campos obrigatórios');
      }

      let fornecedorId = formData.fornecedor_id;

      // Se não houver fornecedor selecionado, criar automaticamente
      if (!fornecedorId && !editingMusico) {
        const { data: fornecedorExistente } = await supabase
          .from('fornecedores')
          .select('id')
          .eq('nome', formData.nome)
          .eq('tipo', 'musico')
          .maybeSingle();

        if (fornecedorExistente) {
          fornecedorId = fornecedorExistente.id;
        } else {
          const { data: novoFornecedor, error: fornecedorError } = await supabase
            .from('fornecedores')
            .insert([{
              nome: formData.nome,
              telefone: formData.contato || null,
              status: 'ativo',
              tipo: 'musico',
              observacoes: 'Cadastrado automaticamente via módulo de Músicos'
            }])
            .select('id')
            .single();

          if (fornecedorError) throw fornecedorError;
          fornecedorId = novoFornecedor.id;
        }
      }

      const valorTotal = formData.valor + formData.valor_adicional - formData.valor_consumo;

      const dataToSave = {
        ...formData,
        fornecedor_id: fornecedorId,
        valor_total_final: Math.max(0, valorTotal)
      };

      if (editingMusico) {
        const { error } = await supabase
          .from('musicos')
          .update(dataToSave)
          .eq('id', editingMusico.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('musicos')
          .insert([dataToSave]);

        if (error) throw error;
      }

      setShowForm(false);
      setEditingMusico(null);
      resetForm();
      fetchData();
      fetchFornecedores();
      fetchIndicadores();
    } catch (err) {
      console.error('Error saving musician:', err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar músico');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este músico?')) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('musicos')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchData();
      fetchIndicadores();
    } catch (err) {
      console.error('Error deleting musician:', err);
      setError(err instanceof Error ? err.message : 'Erro ao excluir músico');
    } finally {
      setLoading(false);
    }
  };


  const marcarComoPago = async (id: string) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('musicos')
        .update({
          status_pagamento: 'pago'
        })
        .eq('id', id);

      if (error) throw error;
      fetchData();
      fetchIndicadores();
    } catch (err) {
      console.error('Error marking as paid:', err);
      setError(err instanceof Error ? err.message : 'Erro ao marcar como pago');
    } finally {
      setLoading(false);
    }
  };

  const openForm = (musico?: Musico) => {
    if (musico) {
      setEditingMusico(musico);
      setFormData({
        nome: musico.nome || '',
        contato: musico.contato || '',
        valor: musico.valor || 0,
        data_evento: musico.data_evento ? dayjs(musico.data_evento).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'),
        horario_inicio: musico.horario_inicio || '20:00',
        horario_fim: musico.horario_fim || '23:00',
        material_promocional: musico.material_promocional || '',
        observacoes: musico.observacoes || '',
        valor_consumo: musico.valor_consumo || 0,
        valor_adicional: musico.valor_adicional || 0,
        fornecedor_id: musico.fornecedor_id || '',
        status_pagamento: musico.status_pagamento || 'pendente'
      });
    } else {
      setEditingMusico(null);
      resetForm();
    }
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      nome: '',
      contato: '',
      valor: 0,
      data_evento: dayjs().format('YYYY-MM-DD'),
      horario_inicio: '20:00',
      horario_fim: '23:00',
      material_promocional: '',
      observacoes: '',
      valor_consumo: 0,
      valor_adicional: 0,
      fornecedor_id: '',
      status_pagamento: 'pendente'
    });
  };

  const calcularValorTotal = () => {
    const valorBase = formData.valor || 0;
    const adicional = formData.valor_adicional || 0;
    const consumo = formData.valor_consumo || 0;
    return Math.max(0, valorBase + adicional - consumo);
  };

  const filteredMusicos = musicos.filter(musico => {
    const matchesSearch = musico.nome?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         musico.contato?.toLowerCase().includes(searchTerm.toLowerCase());
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
      case 'pago':
        return 'text-emerald-400 bg-emerald-500/20';
      case 'pendente':
        return 'text-yellow-400 bg-yellow-500/20';
      case 'cancelado':
        return 'text-red-400 bg-red-500/20';
      default:
        return 'text-white/80 bg-[#12141f]/10';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'pago':
        return <CheckCircle className="w-4 h-4" />;
      case 'pendente':
        return <Clock className="w-4 h-4" />;
      case 'cancelado':
        return <XCircle className="w-4 h-4" />;
      default:
        return <AlertTriangle className="w-4 h-4" />;
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'pago':
        return 'Pago';
      case 'pendente':
        return 'Pendente';
      case 'cancelado':
        return 'Cancelado';
      default:
        return 'Desconhecido';
    }
  };

  // Calendar functions
  const getDaysInMonth = () => {
    const startOfMonth = currentMonth.startOf('month');
    const endOfMonth = currentMonth.endOf('month');
    const startOfWeek = startOfMonth.startOf('week');
    const endOfWeek = endOfMonth.endOf('week');
    
    const days = [];
    let currentDay = startOfWeek;
    
    while (currentDay.isBefore(endOfWeek) || currentDay.isSame(endOfWeek, 'day')) {
      days.push(currentDay);
      currentDay = currentDay.add(1, 'day');
    }
    
    return days;
  };

  const getMusicosForDay = (day: dayjs.Dayjs) => {
    return filteredMusicos.filter(musico => 
      musico.data_evento && dayjs(musico.data_evento).isSame(day, 'day')
    );
  };

  const isToday = (day: dayjs.Dayjs) => {
    return day.isSame(dayjs(), 'day');
  };

  const isPastDay = (day: dayjs.Dayjs) => {
    return day.isBefore(dayjs(), 'day');
  };

  const isCurrentMonth = (day: dayjs.Dayjs) => {
    return day.isSame(currentMonth, 'month');
  };

  const goToPreviousMonth = () => {
    setCurrentMonth(currentMonth.subtract(1, 'month'));
  };

  const goToNextMonth = () => {
    setCurrentMonth(currentMonth.add(1, 'month'));
  };

  const goToToday = () => {
    setCurrentMonth(dayjs());
  };

  const exportData = () => {
    if (filteredMusicos.length === 0) {
      alert('Não há dados para exportar');
      return;
    }

    const headers = [
      'Nome',
      'Contato',
      'Data Evento',
      'Horário',
      'Valor Base',
      'Consumo',
      'Adicional',
      'Total Final',
      'Status',
      'Check-in',
      'Fornecedor',
      'Observações'
    ];

    const data = filteredMusicos.map(musico => [
      musico.nome || '',
      musico.contato || '',
      musico.data_evento ? dayjs(musico.data_evento).format('DD/MM/YYYY') : '',
      `${musico.horario_inicio || ''} - ${musico.horario_fim || ''}`,
      musico.valor || 0,
      musico.valor_consumo || 0,
      musico.valor_adicional || 0,
      musico.valor_total_final || 0,
      getStatusText(musico.status_pagamento),
      musico.checkin ? 'Presente' : 'Pendente',
      musico.fornecedor_nome || '',
      musico.observacoes || ''
    ]);

    const fileName = `musicos-${dayjs(dataInicio).format('DD-MM-YYYY')}-a-${dayjs(dataFim).format('DD-MM-YYYY')}`;
    exportToExcel(data, fileName, headers);
  };

  const exportToPDF = () => {
    if (filteredMusicos.length === 0) {
      alert('Não há dados para exportar');
      return;
    }

    try {
      const fileName = `musicos-${dayjs(dataInicio).format('DD-MM-YYYY')}-a-${dayjs(dataFim).format('DD-MM-YYYY')}`;

      const reportGenerator = new ReportGenerator({
        title: 'Relatório de Músicos',
        subtitle: `Período: ${dayjs(dataInicio).format('DD/MM/YYYY')} a ${dayjs(dataFim).format('DD/MM/YYYY')}`,
        filename: fileName,
        orientation: 'landscape'
      });

      let currentY = reportGenerator.addHeader(
        'RELATÓRIO DE MÚSICOS',
        `Período: ${dayjs(dataInicio).format('DD/MM/YYYY')} a ${dayjs(dataFim).format('DD/MM/YYYY')}`
      );

      // Resumo do período
      const totalValorBase = filteredMusicos.reduce((sum, m) => sum + (m.valor || 0), 0);
      const totalConsumo = filteredMusicos.reduce((sum, m) => sum + (m.valor_consumo || 0), 0);
      const totalAdicional = filteredMusicos.reduce((sum, m) => sum + (m.valor_adicional || 0), 0);
      const totalGeral = filteredMusicos.reduce((sum, m) => sum + (m.valor_total_final || 0), 0);
      const musicosPagos = filteredMusicos.filter(m => m.status_pagamento === 'pago').length;
      const musicosPendentes = filteredMusicos.filter(m => m.status_pagamento === 'pendente').length;

      const resumo = [
        ['Total de Apresentações', filteredMusicos.length.toString()],
        ['Apresentações Pagas', musicosPagos.toString()],
        ['Apresentações Pendentes', musicosPendentes.toString()],
        ['Total Valor Base', formatCurrency(totalValorBase)],
        ['Total Consumo', formatCurrency(totalConsumo)],
        ['Total Adicional', formatCurrency(totalAdicional)],
        ['Total Geral', formatCurrency(totalGeral)],
        ['Ticket Médio', filteredMusicos.length > 0 ? formatCurrency(totalGeral / filteredMusicos.length) : formatCurrency(0)]
      ];

      currentY = reportGenerator.addSection('Resumo do Período', [], currentY);
      currentY = reportGenerator.addTable(['Indicador', 'Valor'], resumo, currentY);

      // Lista detalhada
      const headers = [
        'Nome',
        'Data',
        'Horário',
        'Valor Base',
        'Consumo',
        'Adicional',
        'Total Final',
        'Status'
      ];

      const data = filteredMusicos.map(musico => [
        musico.nome || '',
        musico.data_evento ? dayjs(musico.data_evento).format('DD/MM/YYYY') : '',
        `${musico.horario_inicio || ''} - ${musico.horario_fim || ''}`,
        formatCurrency(musico.valor || 0),
        formatCurrency(musico.valor_consumo || 0),
        formatCurrency(musico.valor_adicional || 0),
        formatCurrency(musico.valor_total_final || 0),
        getStatusText(musico.status_pagamento)
      ]);

      currentY = reportGenerator.addSection('Detalhamento das Apresentações', [], currentY);
      reportGenerator.addTable(headers, data, currentY);

      reportGenerator.save();
    } catch (error) {
      console.error('Erro ao gerar PDF:', error);
      alert('Erro ao gerar PDF. Tente novamente.');
    }
  };

  const handleDayClick = (day: dayjs.Dayjs) => {
    setFormData({
      ...formData,
      data_evento: day.format('YYYY-MM-DD')
    });
    openForm();
  };

  const generateCalendarPDF = () => {
    try {
      const reportGenerator = new ReportGenerator({
        title: 'Calendário de Músicos',
        subtitle: `${currentMonth.format('MMMM [de] YYYY')}`,
        filename: `calendario-musicos-${currentMonth.format('YYYY-MM')}.pdf`,
        orientation: 'landscape'
      });

      let currentY = reportGenerator.addHeader(
        'CALENDÁRIO DE MÚSICOS',
        `${currentMonth.format('MMMM [de] YYYY').toUpperCase()}`
      );

      // Resumo do mês
      const musicosDoMes = musicos.filter(musico => 
        musico.data_evento && dayjs(musico.data_evento).isSame(currentMonth, 'month')
      );

      const valorTotalMes = musicosDoMes.reduce((sum, m) => sum + (m.valor_total_final || 0), 0);
      const musicosPagos = musicosDoMes.filter(m => m.status_pagamento === 'pago').length;
      const musicosPendentes = musicosDoMes.filter(m => m.status_pagamento === 'pendente').length;

      const resumo = [
        ['Total de Apresentações', musicosDoMes.length.toString()],
        ['Valor Total do Mês', formatCurrency(valorTotalMes)],
        ['Apresentações Pagas', musicosPagos.toString()],
        ['Apresentações Pendentes', musicosPendentes.toString()],
        ['Ticket Médio', musicosDoMes.length > 0 ? formatCurrency(valorTotalMes / musicosDoMes.length) : formatCurrency(0)]
      ];

      currentY = reportGenerator.addSection('Resumo do Mês', [], currentY);
      currentY = reportGenerator.addTable(['Indicador', 'Valor'], resumo, currentY);

      // Agenda detalhada por dia
      const diasComMusicos = getDaysInMonth()
        .filter(day => isCurrentMonth(day) && getMusicosForDay(day).length > 0)
        .sort((a, b) => a.date() - b.date());

      if (diasComMusicos.length > 0) {
        const agendaHeaders = [
          'Data',
          'Dia Semana',
          'Músico/Banda',
          'Horário',
          'Valor Total',
          'Status',
          'Contato'
        ];

        const agendaData = [];
        diasComMusicos.forEach(day => {
          const musicosDoDia = getMusicosForDay(day);
          musicosDoDia.forEach((musico, index) => {
            agendaData.push([
              index === 0 ? day.format('DD/MM/YYYY') : '',
              index === 0 ? day.format('dddd') : '',
              musico.nome || 'Não informado',
              musico.horario_inicio && musico.horario_fim
                ? `${musico.horario_inicio} - ${musico.horario_fim}`
                : 'Não definido',
              formatCurrency(musico.valor_total_final || 0),
              musico.status_pagamento === 'pago' ? 'Pago' :
              musico.status_pagamento === 'pendente' ? 'Pendente' : 'Cancelado',
              musico.contato || '-'
            ]);
          });
        });

        currentY = reportGenerator.addSection('Agenda Detalhada', [], currentY + 10);
        reportGenerator.addTable(agendaHeaders, agendaData, currentY);
      }

      reportGenerator.save(`calendario-musicos-${currentMonth.format('YYYY-MM')}.pdf`);
      
    } catch (error) {
      console.error('Error generating PDF:', error);
      alert('Erro ao gerar PDF. Tente novamente.');
    }
  };

  const renderCalendarView = () => {
    const days = getDaysInMonth();
    const weekDays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    return (
      <div className="space-y-6">
        {/* Calendar Header */}
        <div className="flex justify-between items-center">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <button
                onClick={goToPreviousMonth}
                className="p-2 hover:bg-[#12141f]/10 rounded-lg"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <h4 className="text-xl font-semibold text-white min-w-[200px] text-center">
                {currentMonth.format('MMMM [de] YYYY')}
              </h4>
              <button
                onClick={goToNextMonth}
                className="p-2 hover:bg-[#12141f]/10 rounded-lg"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
            <button
              onClick={goToToday}
              className="px-3 py-1 bg-gradient-to-r from-[#7D1F2C] to-[#601C28] text-white text-sm rounded-md hover:from-[#8B2332] hover:to-[#7D1F2C] transition-all shadow-sm"
            >
              Hoje
            </button>
          </div>
          <button
            onClick={generateCalendarPDF}
            className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-lg hover:from-emerald-700 hover:to-emerald-800 transition-all shadow-md"
          >
            <FileText className="w-4 h-4 inline mr-2" />
            Imprimir PDF
          </button>
        </div>

        {/* Calendar Grid */}
        <div className="bg-[#12141f] rounded-lg border border-white/10 overflow-hidden">
          {/* Week Days Header */}
          <div className="grid grid-cols-7 border-b border-white/10">
            {weekDays.map((day) => (
              <div key={day} className="p-3 text-center text-sm font-medium text-white/40 bg-[#12141f]/5">
                {day}
              </div>
            ))}
          </div>

          {/* Calendar Days */}
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const musicosDoDia = getMusicosForDay(day);
              const isCurrentMonthDay = isCurrentMonth(day);
              const isTodayDay = isToday(day);
              const isPast = isPastDay(day);

              return (
                <div
                  key={day.format('YYYY-MM-DD')}
                  onClick={() => isCurrentMonthDay && handleDayClick(day)}
                  className={`min-h-[120px] p-2 border-b border-r border-white/10 cursor-pointer transition-colors ${
                    isCurrentMonthDay 
                      ? isPast 
                        ? 'bg-[#12141f]/5 hover:bg-[#12141f]/10'
                        : 'bg-[#12141f] hover:bg-blue-500/10'
                      : 'bg-[#12141f]/10'
                  } ${
                    isTodayDay ? 'ring-2 ring-blue-500 ring-inset' : ''
                  }`}
                >
                  <div className={`text-sm font-medium mb-2 ${
                    isCurrentMonthDay 
                      ? isTodayDay 
                        ? 'text-blue-400'
                        : 'text-white'
                      : 'text-white/30'
                  }`}>
                    {day.format('D')}
                  </div>

                  {isCurrentMonthDay && (
                    <div className="space-y-1">
                      {musicosDoDia.slice(0, 2).map((musico, index) => (
                        <div
                          key={musico.id}
                          className={`p-1 rounded text-xs ${
                            musico.status_pagamento === 'pago'
                              ? 'bg-green-500/15 text-green-300'
                              : musico.status_pagamento === 'pendente'
                              ? 'bg-yellow-500/15 text-yellow-300'
                              : 'bg-red-500/15 text-red-300'
                          }`}
                          title={`${musico.nome || 'Sem nome'}\n${musico.horario_inicio || ''} - ${musico.horario_fim || ''}\nValor: ${formatCurrency(musico.valor_total_final || 0)}\nStatus: ${getStatusText(musico.status_pagamento)}`}
                        >
                          <div className="flex items-center">
                            <Music className="w-3 h-3 mr-1" />
                            <span className="truncate">
                              {musico.nome || 'Sem nome'}
                            </span>
                          </div>
                          <div className="text-xs opacity-75">
                            {musico.horario_inicio || ''} - {formatCurrency(musico.valor_total_final || 0)}
                          </div>
                        </div>
                      ))}
                      
                      {musicosDoDia.length > 2 && (
                        <div className="text-xs text-white/40 text-center">
                          +{musicosDoDia.length - 2} mais
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Calendar Legend */}
        <div className="bg-[#12141f] p-4 rounded-lg shadow-sm border border-white/10">
          <h5 className="text-sm font-medium text-white/80 mb-2">Legenda:</h5>
          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex items-center">
              <div className="w-3 h-3 bg-green-500/15 border border-green-200 rounded mr-2"></div>
              <span className="text-white/60">Pago</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-yellow-500/15 border border-yellow-200 rounded mr-2"></div>
              <span className="text-white/60">Pendente</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 bg-red-500/15 border border-red-200 rounded mr-2"></div>
              <span className="text-white/60">Cancelado</span>
            </div>
            <div className="flex items-center">
              <div className="w-3 h-3 border-2 border-blue-500 rounded mr-2"></div>
              <span className="text-white/60">Hoje</span>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex flex-col min-h-screen -m-6 lg:-m-8" style={{ background: '#0d0f1a' }}>

      {/* HERO DA SEÇÃO */}
      <div
        className="relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #7D1F2C 0%, #5a1520 60%, #3d0f16 100%)',
        }}
      >
        {/* Ruído decorativo */}
        <div
          className="absolute inset-0 opacity-[0.03]"
          style={{
            backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '24px 24px',
          }}
        />
        {/* Glow dourado */}
        <div
          className="absolute -top-20 -right-20 w-80 h-80 rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #D4AF37, transparent 70%)' }}
        />

        <div className="relative px-6 lg:px-8 pt-7 pb-0">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 mb-4">
            <span className="text-white/30 text-xs">Músicos</span>
            <ChevronRight className="text-white/20" style={{width:'12px',height:'12px'}} />
            <span className="text-white/60 text-xs font-medium">{viewMode === 'table' ? 'Listagem' : 'Calendário'}</span>
          </div>

          {/* Título + ações */}
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                <Music className="text-white/80" style={{width:'18px',height:'18px'}} />
              </div>
              <div>
                <h1 className="text-white text-2xl font-bold leading-none tracking-tight">
                  Cadastro de Músicos
                </h1>
                <p className="text-white/40 text-sm mt-1">Gerencie apresentações e pagamentos de músicos</p>
              </div>
            </div>

            <div className="flex gap-2 flex-shrink-0">
              {/* View Mode Toggle */}
              <div className="flex rounded-lg p-1" style={{ background: 'rgba(255,255,255,0.1)' }}>
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    viewMode === 'table'
                      ? 'bg-[#12141f]/20 text-white shadow-sm'
                      : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  <List className="w-3 h-3 inline mr-1" />
                  Tabela
                </button>
                <button
                  onClick={() => setViewMode('calendar')}
                  className={`px-3 py-1 rounded-md text-xs font-medium transition-all ${
                    viewMode === 'calendar'
                      ? 'bg-[#12141f]/20 text-white shadow-sm'
                      : 'text-white/50 hover:text-white/80'
                  }`}
                >
                  <CalendarDays className="w-3 h-3 inline mr-1" />
                  Calendário
                </button>
              </div>

              <button
                onClick={exportData}
                className="px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-all"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                <Download className="w-3 h-3 inline mr-1" />
                Excel
              </button>

              <button
                onClick={exportToPDF}
                className="px-3 py-1.5 text-xs font-medium text-white rounded-lg transition-all"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)' }}
              >
                <FileText className="w-3 h-3 inline mr-1" />
                PDF
              </button>

              <button
                onClick={() => openForm()}
                className="px-4 py-1.5 text-xs font-medium rounded-lg transition-all"
                style={{ background: 'linear-gradient(135deg, #D4AF37, #C5A028)', color: '#000' }}
              >
                <Plus className="w-3 h-3 inline mr-1" />
                Nova Apresentação
              </button>
            </div>
          </div>

          {/* SUBNAV - Filtros rápidos */}
          <nav className="flex items-end gap-2 overflow-x-auto scrollbar-hide pb-0">
            <button
              onClick={() => setStatusFilter('all')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-all duration-150 flex-shrink-0 ${
                statusFilter === 'all'
                  ? 'border-[#D4AF37] text-white bg-[#12141f]/5'
                  : 'border-transparent text-white/35 hover:text-white/60 hover:bg-[#12141f]/5'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setStatusFilter('pendente')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-all duration-150 flex-shrink-0 ${
                statusFilter === 'pendente'
                  ? 'border-[#D4AF37] text-white bg-[#12141f]/5'
                  : 'border-transparent text-white/35 hover:text-white/60 hover:bg-[#12141f]/5'
              }`}
            >
              <Clock style={{width:'12px',height:'12px'}} />
              Pendentes
            </button>
            <button
              onClick={() => setStatusFilter('pago')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-all duration-150 flex-shrink-0 ${
                statusFilter === 'pago'
                  ? 'border-[#D4AF37] text-white bg-[#12141f]/5'
                  : 'border-transparent text-white/35 hover:text-white/60 hover:bg-[#12141f]/5'
              }`}
            >
              <CheckCircle style={{width:'12px',height:'12px'}} />
              Pagos
            </button>
            <button
              onClick={() => setStatusFilter('cancelado')}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-all duration-150 flex-shrink-0 ${
                statusFilter === 'cancelado'
                  ? 'border-[#D4AF37] text-white bg-[#12141f]/5'
                  : 'border-transparent text-white/35 hover:text-white/60 hover:bg-[#12141f]/5'
              }`}
            >
              <XCircle style={{width:'12px',height:'12px'}} />
              Cancelados
            </button>
          </nav>
        </div>
      </div>

      {/* CONTEÚDO */}
      <div className="flex-1 px-6 lg:px-8 py-6" style={{ background: '#0d0f1a' }}>
        {error && (
          <div className="mb-6 p-4 rounded-lg" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#fca5a5' }}>
            {error}
          </div>
        )}

        {/* Indicadores */}
        {indicadores && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div className="p-6 rounded-xl hover:scale-[1.02] transition-all" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="flex items-center">
                <div className="p-3 bg-gradient-to-br from-[#7D1F2C] to-[#601C28] rounded-lg">
                  <Music className="w-8 h-8 text-white" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-white/60">Apresentações no Período</p>
                  <p className="text-3xl font-bold text-white">
                    {indicadores.apresentacoes_mes}
                  </p>
                  <p className="text-xs text-white/40 mt-1">
                    Total histórico: {indicadores.total_apresentacoes}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-xl hover:scale-[1.02] transition-all" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="flex items-center">
                <div className="p-3 bg-gradient-to-br from-[#D4AF37] to-[#C5A028] rounded-lg">
                  <DollarSign className="w-8 h-8 text-white" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-white/60">Valor Total no Período</p>
                  <p className="text-3xl font-bold text-[#D4AF37]">
                    {formatCurrency(indicadores.valor_total_mes)}
                  </p>
                  <p className="text-xs text-white/40 mt-1">
                    Pago: {formatCurrency(indicadores.valor_pago_mes)}
                  </p>
                </div>
              </div>
            </div>

            <div className="p-6 rounded-xl hover:scale-[1.02] transition-all" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
              <div className="flex items-center">
                <div className="p-3 bg-gradient-to-br from-amber-600 to-amber-700 rounded-lg">
                  <Clock className="w-8 h-8 text-white" />
                </div>
                <div className="ml-4">
                  <p className="text-sm font-medium text-white/60">Pendentes</p>
                  <p className="text-3xl font-bold text-amber-400">
                    {formatCurrency(indicadores.valor_pendente_mes)}
                  </p>
                  <p className="text-xs text-white/40 mt-1">
                    {indicadores.musicos_ativos} músicos ativos
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className="p-6 rounded-xl mb-6" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-medium text-white/60 mb-2">Buscar</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/30 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Buscar músicos..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 rounded-lg text-sm text-white placeholder-white/30 focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
                  style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.1)' }}
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-white/60 mb-2">Data Início</label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full px-4 py-2 rounded-lg text-sm text-white focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-white/60 mb-2">Data Fim</label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full px-4 py-2 rounded-lg text-sm text-white focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
                style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.1)' }}
              />
            </div>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#D4AF37]"></div>
          </div>
        ) : (
          <>
            {viewMode === 'table' ? (
              <div className="rounded-xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="text-left border-b" style={{ background: 'rgba(255,255,255,0.03)', borderColor: 'rgba(255,255,255,0.1)' }}>
                        <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                          Músico/Banda
                        </th>
                        <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                          Data/Hora
                        </th>
                        <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                          Valor Base
                        </th>
                        <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                          Consumo
                        </th>
                        <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                          Adicional
                        </th>
                        <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                          Total Final
                        </th>
                        <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                          Ações
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y" style={{ divideColor: 'rgba(255,255,255,0.05)' }}>
                      {filteredMusicos.map((musico) => (
                        <tr key={musico.id} className="hover:bg-[#12141f]/5 transition-colors" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                          <td className="px-6 py-4">
                            <div>
                              <div className="font-medium text-white">{musico.nome}</div>
                              {musico.contato && (
                                <div className="text-sm text-white/50 flex items-center">
                                  <Phone className="w-3 h-3 mr-1" />
                                  {musico.contato}
                                </div>
                              )}
                              {musico.fornecedor_nome && (
                                <div className="text-sm flex items-center gap-1 mt-1 px-2 py-1 rounded-full w-fit" style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#93c5fd' }}>
                                  <Music className="w-3 h-3" />
                                  <span className="font-medium">{musico.fornecedor_nome}</span>
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <div>
                              <div className="text-sm text-white">
                                {musico.data_evento ? dayjs(musico.data_evento).format('DD/MM/YYYY') : '-'}
                              </div>
                              {musico.horario_inicio && musico.horario_fim && (
                                <div className="text-sm text-white/50">
                                  {musico.horario_inicio} - {musico.horario_fim}
                                </div>
                              )}
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className="font-medium text-white">
                              {formatCurrency(musico.valor || 0)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`font-medium ${
                              (musico.valor_consumo || 0) > 0 ? 'text-rose-400' : 'text-white/30'
                            }`}>
                              {(musico.valor_consumo || 0) > 0 ? '-' : ''}{formatCurrency(musico.valor_consumo || 0)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`font-medium ${
                              (musico.valor_adicional || 0) > 0 ? 'text-emerald-400' : 'text-white/30'
                            }`}>
                              {(musico.valor_adicional || 0) > 0 ? '+' : ''}{formatCurrency(musico.valor_adicional || 0)}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div>
                              <span className="font-bold text-lg text-[#D4AF37]">
                                {formatCurrency(Math.max(0, (musico.valor || 0) + (musico.valor_adicional || 0) - (musico.valor_consumo || 0)))}
                              </span>
                              <div className="text-xs text-white/40">
                                Base: {formatCurrency(musico.valor || 0)} + Adicional: {formatCurrency(musico.valor_adicional || 0)} - Consumo: {formatCurrency(musico.valor_consumo || 0)}
                              </div>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(musico.status_pagamento)}`}>
                              {getStatusIcon(musico.status_pagamento)}
                              <span className="ml-1">{getStatusText(musico.status_pagamento)}</span>
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex space-x-2">
                              {musico.status_pagamento === 'pendente' && (
                                <button
                                  onClick={() => marcarComoPago(musico.id)}
                                  className="text-green-400 hover:text-green-300"
                                  title="Marcar como Pago"
                                >
                                  <CheckCircle className="w-4 h-4" />
                                </button>
                              )}
                              <button
                                onClick={() => openForm(musico)}
                                className="text-blue-400 hover:text-blue-300"
                                title="Editar"
                              >
                                <Edit className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(musico.id)}
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

                {filteredMusicos.length === 0 && (
                  <div className="text-center py-12">
                    <Music className="w-16 h-16 text-white/20 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-white mb-2">Nenhuma apresentação encontrada</h3>
                    <p className="text-white/50">
                      {searchTerm || statusFilter !== 'all'
                        ? 'Nenhuma apresentação corresponde aos filtros aplicados.'
                        : 'Nenhuma apresentação cadastrada.'}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              renderCalendarView()
            )}
          </>
        )}
      </div>

      {/* Modal do Formulário */}
      {showForm && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="rounded-xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto" style={{ background: '#1a1d2e', border: '1px solid rgba(212, 175, 55, 0.3)' }}>
              <h3 className="text-lg font-medium text-white mb-4">
                {editingMusico ? 'Editar Apresentação' : 'Nova Apresentação'}
              </h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Nome do Músico/Banda *
                  </label>
                  <input
                    type="text"
                    value={formData.nome}
                    onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                    className="w-full rounded-lg px-4 py-2 text-white placeholder-white/30 focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
                    required
                    placeholder="Ex: João da Silva, Banda Samba Raiz"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Contato
                  </label>
                  <input
                    type="text"
                    value={formData.contato}
                    onChange={(e) => setFormData({ ...formData, contato: e.target.value })}
                    className="w-full rounded-lg px-4 py-2 text-white placeholder-white/30 focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
                    placeholder="Telefone ou email"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-sm font-medium text-white/80">
                      Fornecedor (Para Pagamento)
                    </label>
                    {sugestedFornecedorId && formData.fornecedor_id === sugestedFornecedorId && (
                      <span className="text-xs bg-green-500/15 text-green-300 px-2 py-1 rounded-full flex items-center gap-1">
                        <CheckCircle className="w-3 h-3" />
                        Auto-detectado
                      </span>
                    )}
                  </div>
                  <SearchableSelect
                    options={fornecedores.map((f: any) => ({
                      value: f.id,
                      label: f.nome,
                      sublabel: f.isMusicianType ? '🎵 Músico/Artista' : undefined
                    }))}
                    value={formData.fornecedor_id}
                    onChange={(value) => {
                      setFormData({ ...formData, fornecedor_id: value });
                      setSugestedFornecedorId('');
                    }}
                    placeholder="Buscar fornecedor..."
                    emptyMessage="Nenhum fornecedor encontrado"
                    className={sugestedFornecedorId && formData.fornecedor_id === sugestedFornecedorId
                      ? 'border-green-400 bg-green-500/10'
                      : ''
                    }
                  />
                  {sugestedFornecedorId && formData.fornecedor_id === sugestedFornecedorId && (
                    <p className="text-xs text-green-400 mt-1 flex items-center gap-1">
                      <CheckCircle className="w-3 h-3" />
                      Fornecedor associado automaticamente pelo sistema
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Data do Evento *
                  </label>
                  <input
                    type="date"
                    value={formData.data_evento}
                    onChange={(e) => setFormData({ ...formData, data_evento: e.target.value })}
                    className="w-full rounded-lg px-4 py-2 text-white placeholder-white/30 focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Horário de Início
                  </label>
                  <input
                    type="time"
                    value={formData.horario_inicio}
                    onChange={(e) => setFormData({ ...formData, horario_inicio: e.target.value })}
                    className="w-full rounded-lg px-4 py-2 text-white placeholder-white/30 focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Horário de Fim
                  </label>
                  <input
                    type="time"
                    value={formData.horario_fim}
                    onChange={(e) => setFormData({ ...formData, horario_fim: e.target.value })}
                    className="w-full rounded-lg px-4 py-2 text-white placeholder-white/30 focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Valor da Apresentação *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-white/60 sm:text-sm">R$</span>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.valor}
                      onChange={(e) => setFormData({ ...formData, valor: parseFloat(e.target.value) || 0 })}
                      className="pl-10 w-full rounded-md bg-[#12141f]/5 border-white/20 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Desconto de Consumo
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-white/60 sm:text-sm">R$</span>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.valor_consumo}
                      onChange={(e) => setFormData({ ...formData, valor_consumo: parseFloat(e.target.value) || 0 })}
                      className="pl-10 w-full rounded-md bg-[#12141f]/5 border-white/20 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Adicional de Extras
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <span className="text-white/60 sm:text-sm">R$</span>
                    </div>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.valor_adicional}
                      onChange={(e) => setFormData({ ...formData, valor_adicional: parseFloat(e.target.value) || 0 })}
                      className="pl-10 w-full rounded-md bg-[#12141f]/5 border-white/20 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                    />
                  </div>
                  <p className="text-xs text-white/40 mt-1">
                    Ex: Extensão de tempo, repertório especial
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Status do Pagamento
                  </label>
                  <select
                    value={formData.status_pagamento}
                    onChange={(e) => setFormData({ ...formData, status_pagamento: e.target.value as any })}
                    className="w-full rounded-lg px-4 py-2 text-white placeholder-white/30 focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
                  >
                    <option value="pendente">Pendente</option>
                    <option value="pago">Pago</option>
                    <option value="cancelado">Cancelado</option>
                  </select>
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Material Promocional
                  </label>
                  <input
                    type="text"
                    value={formData.material_promocional}
                    onChange={(e) => setFormData({ ...formData, material_promocional: e.target.value })}
                    className="w-full rounded-lg px-4 py-2 text-white placeholder-white/30 focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
                    placeholder="Links para redes sociais, portfolio, etc."
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Observações
                  </label>
                  <textarea
                    value={formData.observacoes}
                    onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                    className="w-full rounded-lg px-4 py-2 text-white placeholder-white/30 focus:ring-2 focus:ring-[#D4AF37] focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.2)' }}
                    rows={3}
                    placeholder="Observações sobre a apresentação..."
                  />
                </div>

                {/* Cálculo do Valor Total */}
                <div className="md:col-span-2 p-4 rounded-lg" style={{ background: 'rgba(212, 175, 55, 0.1)', border: '1px solid rgba(212, 175, 55, 0.3)' }}>
                  <h4 className="font-medium text-[#D4AF37] mb-2">Cálculo do Valor Total</h4>
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div>
                      <span className="text-white/60 font-medium">Valor Base:</span>
                      <div className="text-lg font-bold text-white">
                        {formatCurrency(formData.valor)}
                      </div>
                    </div>
                    <div>
                      <span className="text-white/60 font-medium">Consumo (-):</span>
                      <div className="text-lg font-bold text-rose-400">
                        -{formatCurrency(formData.valor_consumo)}
                      </div>
                    </div>
                    <div>
                      <span className="text-white/60 font-medium">Adicional (+):</span>
                      <div className="text-lg font-bold text-emerald-400">
                        +{formatCurrency(formData.valor_adicional)}
                      </div>
                    </div>
                    <div>
                      <span className="text-white/60 font-medium">Total Final:</span>
                      <div className="text-lg font-bold text-[#D4AF37]">
                        {formatCurrency(calcularValorTotal())}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="mt-6 flex justify-end space-x-3">
                <button
                  onClick={() => {
                    setShowForm(false);
                    setEditingMusico(null);
                    resetForm();
                  }}
                  className="px-6 py-2 rounded-lg text-white/80 hover:bg-[#12141f]/10 transition-all"
                  style={{ border: '1px solid rgba(255,255,255,0.2)' }}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleSave}
                  disabled={loading || !formData.nome || !formData.data_evento || formData.valor <= 0}
                  className="px-6 py-2 rounded-lg text-white font-medium hover:scale-105 transition-all shadow-md disabled:opacity-50"
                  style={{ background: 'linear-gradient(135deg, #D4AF37, #C5A028)' }}
                >
                  {loading ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
};

export default Musicians;