import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, CreditCard as Edit, Trash2, Eye, User, DollarSign, Calendar, Clock, CheckCircle, XCircle, Download, FileText, Users, Activity, TrendingUp, AlertTriangle, Phone, MapPin, Briefcase, Target, Award } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { testConnection } from '../../lib/supabase';
import { exportToExcel } from '../../utils/reportGenerator';
import dayjs from 'dayjs';

interface ExtraFreelancer {
  id: string;
  nome: string;
  cpf?: string;
  telefone?: string;
  funcao_temporaria: string;
  valor_diaria: number;
  data_trabalho: string;
  horario_inicio?: string;
  horario_fim?: string;
  setor: string;
  motivo_contratacao?: string;
  evento_id?: string;
  observacoes?: string;
  status_pagamento: 'pendente' | 'pago' | 'cancelado';
  data_pagamento?: string;
  criado_em: string;
  atualizado_em: string;
  criado_por?: string;
}

interface FormData {
  nome: string;
  cpf: string;
  telefone: string;
  funcao_temporaria: string;
  valor_diaria: number;
  data_trabalho: string;
  horario_inicio: string;
  horario_fim: string;
  setor: string;
  motivo_contratacao: string;
  observacoes: string;
  status_pagamento: 'pendente' | 'pago' | 'cancelado';
  data_pagamento: string;
}

interface IndicadoresExtras {
  total_extras: number;
  extras_mes_atual: number;
  valor_total_mes: number;
  valor_pago_mes: number;
  valor_pendente_mes: number;
  extras_pendentes: number;
  setores_com_extras: number;
  funcoes_diferentes: number;
}

const ExtrasFreelancers: React.FC = () => {
  const [extras, setExtras] = useState<ExtraFreelancer[]>([]);
  const [indicadores, setIndicadores] = useState<IndicadoresExtras | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingExtra, setEditingExtra] = useState<ExtraFreelancer | null>(null);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pendente' | 'pago' | 'cancelado'>('all');
  const [setorFilter, setSetorFilter] = useState('all');
  const [mesFilter, setMesFilter] = useState(dayjs().month() + 1);
  const [anoFilter, setAnoFilter] = useState(dayjs().year());
  
  const [formData, setFormData] = useState<FormData>({
    nome: '',
    cpf: '',
    telefone: '',
    funcao_temporaria: '',
    valor_diaria: 0,
    data_trabalho: dayjs().format('YYYY-MM-DD'),
    horario_inicio: '08:00',
    horario_fim: '17:00',
    setor: 'Salão',
    motivo_contratacao: '',
    observacoes: '',
    status_pagamento: 'pendente',
    data_pagamento: ''
  });

  const setores = [
    'Salão', 'Bar', 'Cozinha', 'Recepção', 'Limpeza', 
    'Segurança', 'Administração', 'Estoque', 'Eventos', 'Outros'
  ];

  const funcoesPadrao = [
    'Garçom Extra', 'Auxiliar de Cozinha', 'Barman Extra', 'Segurança',
    'Limpeza', 'Recepcionista', 'Auxiliar Geral', 'Músico', 'DJ',
    'Fotógrafo', 'Decorador', 'Outros'
  ];

  useEffect(() => {
    fetchData();
    fetchIndicadores();
  }, []);

  useEffect(() => {
    fetchData();
  }, [statusFilter, setorFilter, mesFilter, anoFilter]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Test Supabase connection first
      const connectionOk = await testConnection();
      
      if (!connectionOk) {
        console.warn('Supabase connection failed, using empty data');
        setExtras([]);
        setLoading(false);
        return;
      }

      let query = supabase.from('extras_freelancers').select('*');

      // Aplicar filtros
      if (statusFilter !== 'all') {
        query = query.eq('status_pagamento', statusFilter);
      }

      if (setorFilter !== 'all') {
        query = query.eq('setor', setorFilter);
      }

      // Filtro por mês/ano
      const inicioMes = dayjs().year(anoFilter).month(mesFilter - 1).startOf('month').format('YYYY-MM-DD');
      const fimMes = dayjs().year(anoFilter).month(mesFilter - 1).endOf('month').format('YYYY-MM-DD');
      
      query = query.gte('data_trabalho', inicioMes).lte('data_trabalho', fimMes);

      const { data, error } = await query.order('data_trabalho', { ascending: false });

      if (error) throw error;
      setExtras(data || []);
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
      setExtras([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchIndicadores = async () => {
    try {
      const connectionOk = await testConnection();
      
      if (!connectionOk) {
        setIndicadores(null);
        return;
      }

      // Buscar dados do mês atual
      const inicioMes = dayjs().startOf('month').format('YYYY-MM-DD');
      const fimMes = dayjs().endOf('month').format('YYYY-MM-DD');

      const { data, error } = await supabase
        .from('extras_freelancers')
        .select('*')
        .gte('data_trabalho', inicioMes)
        .lte('data_trabalho', fimMes);

      if (error) throw error;

      // Buscar dados gerais
      const { data: todosExtras, error: todosError } = await supabase
        .from('extras_freelancers')
        .select('*');

      if (todosError) throw todosError;

      const extrasMes = (data || []).length;
      const valorTotalMes = (data || []).reduce((sum, e) => sum + (e.valor_diaria || 0), 0);
      const valorPagoMes = (data || []).filter(e => e.status_pagamento === 'pago').reduce((sum, e) => sum + (e.valor_diaria || 0), 0);
      const valorPendenteMes = (data || []).filter(e => e.status_pagamento === 'pendente').reduce((sum, e) => sum + (e.valor_diaria || 0), 0);
      const extrasPendentes = (data || []).filter(e => e.status_pagamento === 'pendente').length;
      
      const setoresUnicos = new Set((todosExtras || []).map(e => e.setor)).size;
      const funcoesUnicas = new Set((todosExtras || []).map(e => e.funcao_temporaria)).size;

      setIndicadores({
        total_extras: (todosExtras || []).length,
        extras_mes_atual: extrasMes,
        valor_total_mes: valorTotalMes,
        valor_pago_mes: valorPagoMes,
        valor_pendente_mes: valorPendenteMes,
        extras_pendentes: extrasPendentes,
        setores_com_extras: setoresUnicos,
        funcoes_diferentes: funcoesUnicas
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
      if (!formData.nome || !formData.funcao_temporaria || !formData.data_trabalho || !formData.setor) {
        throw new Error('Preencha todos os campos obrigatórios');
      }

      if (formData.valor_diaria <= 0) {
        throw new Error('Valor da diária deve ser maior que zero');
      }

      const dataToSave = {
        ...formData,
        valor_diaria: parseFloat(formData.valor_diaria.toString()),
        data_pagamento: formData.status_pagamento === 'pago' && formData.data_pagamento ? formData.data_pagamento : null
      };

      if (editingExtra) {
        const { error } = await supabase
          .from('extras_freelancers')
          .update({ ...dataToSave, atualizado_em: new Date().toISOString() })
          .eq('id', editingExtra.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('extras_freelancers')
          .insert([dataToSave]);

        if (error) throw error;
      }

      setShowForm(false);
      setEditingExtra(null);
      resetForm();
      fetchData();
      fetchIndicadores();
    } catch (err) {
      console.error('Error saving extra:', err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar extra/freelancer');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este registro?')) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('extras_freelancers')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchData();
      fetchIndicadores();
    } catch (err) {
      console.error('Error deleting extra:', err);
      setError(err instanceof Error ? err.message : 'Erro ao excluir extra/freelancer');
    } finally {
      setLoading(false);
    }
  };

  const marcarComoPago = async (id: string) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('extras_freelancers')
        .update({ 
          status_pagamento: 'pago',
          data_pagamento: dayjs().format('YYYY-MM-DD'),
          atualizado_em: new Date().toISOString()
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

  const openForm = (extra?: ExtraFreelancer) => {
    if (extra) {
      setEditingExtra(extra);
      setFormData({
        nome: extra.nome,
        cpf: extra.cpf || '',
        telefone: extra.telefone || '',
        funcao_temporaria: extra.funcao_temporaria,
        valor_diaria: extra.valor_diaria,
        data_trabalho: extra.data_trabalho,
        horario_inicio: extra.horario_inicio || '08:00',
        horario_fim: extra.horario_fim || '17:00',
        setor: extra.setor,
        motivo_contratacao: extra.motivo_contratacao || '',
        observacoes: extra.observacoes || '',
        status_pagamento: extra.status_pagamento,
        data_pagamento: extra.data_pagamento || ''
      });
    } else {
      setEditingExtra(null);
      resetForm();
    }
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      nome: '',
      cpf: '',
      telefone: '',
      funcao_temporaria: '',
      valor_diaria: 0,
      data_trabalho: dayjs().format('YYYY-MM-DD'),
      horario_inicio: '08:00',
      horario_fim: '17:00',
      setor: 'Salão',
      motivo_contratacao: '',
      observacoes: '',
      status_pagamento: 'pendente',
      data_pagamento: ''
    });
  };

  const filteredExtras = extras.filter(extra => {
    const matchesSearch = extra.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         extra.funcao_temporaria.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         extra.cpf?.includes(searchTerm) ||
                         extra.telefone?.includes(searchTerm);
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
        return 'text-green-300 bg-green-900/30';
      case 'pendente':
        return 'text-yellow-300 bg-yellow-900/30';
      case 'cancelado':
        return 'text-red-300 bg-red-900/30';
      default:
        return 'text-white/80 bg-white/10';
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

  const getSetorColor = (setor: string) => {
    const colors = {
      'Salão': 'bg-green-900/30 text-green-300',
      'Bar': 'bg-blue-900/30 text-blue-300',
      'Cozinha': 'bg-red-900/30 text-red-300',
      'Recepção': 'bg-purple-900/30 text-purple-300',
      'Limpeza': 'bg-yellow-900/30 text-yellow-300',
      'Segurança': 'bg-white/10 text-white/90',
      'Administração': 'bg-indigo-900/30 text-indigo-300',
      'Estoque': 'bg-orange-500/15 text-orange-400',
      'Eventos': 'bg-pink-900/30 text-pink-300'
    };
    return colors[setor as keyof typeof colors] || 'bg-white/10 text-white/90';
  };

  const exportData = () => {
    if (filteredExtras.length === 0) {
      alert('Não há dados para exportar');
      return;
    }

    const headers = [
      'Nome',
      'CPF',
      'Telefone',
      'Função Temporária',
      'Valor Diária',
      'Data Trabalho',
      'Horário Início',
      'Horário Fim',
      'Setor',
      'Motivo Contratação',
      'Status Pagamento',
      'Data Pagamento',
      'Observações'
    ];

    const data = filteredExtras.map(extra => [
      extra.nome,
      extra.cpf || '',
      extra.telefone || '',
      extra.funcao_temporaria,
      extra.valor_diaria,
      dayjs(extra.data_trabalho).format('DD/MM/YYYY'),
      extra.horario_inicio || '',
      extra.horario_fim || '',
      extra.setor,
      extra.motivo_contratacao || '',
      getStatusText(extra.status_pagamento),
      extra.data_pagamento ? dayjs(extra.data_pagamento).format('DD/MM/YYYY') : '',
      extra.observacoes || ''
    ]);

    const fileName = `extras-freelancers-${mesFilter}-${anoFilter}`;
    exportToExcel(data, fileName, headers);
  };

  const calcularHorasTrabalhadas = (inicio: string, fim: string) => {
    if (!inicio || !fim) return 0;
    
    const inicioTime = dayjs(`2000-01-01 ${inicio}`);
    const fimTime = dayjs(`2000-01-01 ${fim}`);
    
    return fimTime.diff(inicioTime, 'hours', true);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-white">Extras & Freelancers</h3>
        <div className="flex gap-2">
          <button
            onClick={exportData}
            className="px-4 py-2 bg-[#12141f] border border-white/20 rounded-lg text-white/80 hover:bg-white/5"
          >
            <Download className="w-4 h-4 inline mr-2" />
            Exportar Excel
          </button>
          <button
            onClick={() => openForm()}
            className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25]"
          >
            <Plus className="w-4 h-4 inline mr-2" />
            Novo Extra/Freelancer
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <Users className="w-8 h-8 text-blue-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Extras Este Mês</p>
                <p className="text-2xl font-bold text-blue-400">
                  {indicadores.extras_mes_atual}
                </p>
                <p className="text-sm text-white/50">
                  Total geral: {indicadores.total_extras}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <DollarSign className="w-8 h-8 text-green-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Valor Total Mês</p>
                <p className="text-2xl font-bold text-green-400">
                  {formatCurrency(indicadores.valor_total_mes)}
                </p>
                <p className="text-sm text-white/50">
                  Pago: {formatCurrency(indicadores.valor_pago_mes)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <Clock className="w-8 h-8 text-orange-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Pendentes</p>
                <p className="text-2xl font-bold text-orange-400">
                  {indicadores.extras_pendentes}
                </p>
                <p className="text-sm text-white/50">
                  {formatCurrency(indicadores.valor_pendente_mes)}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <Target className="w-8 h-8 text-purple-400 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Setores Ativos</p>
                <p className="text-2xl font-bold text-purple-400">
                  {indicadores.setores_com_extras}
                </p>
                <p className="text-sm text-white/50">
                  {indicadores.funcoes_diferentes} funções
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-[#12141f] p-4 rounded-lg border border-white/10">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          <div>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/30 w-5 h-5" />
              <input
                type="text"
                placeholder="Buscar extras..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-white/20 rounded-lg bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
              />
            </div>
          </div>

          <div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            >
              <option value="all">Todos os Status</option>
              <option value="pendente">Pendente</option>
              <option value="pago">Pago</option>
              <option value="cancelado">Cancelado</option>
            </select>
          </div>

          <div>
            <select
              value={setorFilter}
              onChange={(e) => setSetorFilter(e.target.value)}
              className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            >
              <option value="all">Todos os Setores</option>
              {setores.map((setor) => (
                <option key={setor} value={setor}>
                  {setor}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={mesFilter}
              onChange={(e) => setMesFilter(parseInt(e.target.value))}
              className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={i + 1}>
                  {dayjs().month(i).format('MMMM')}
                </option>
              ))}
            </select>
          </div>

          <div>
            <select
              value={anoFilter}
              onChange={(e) => setAnoFilter(parseInt(e.target.value))}
              className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            >
              {Array.from({ length: 3 }, (_, i) => dayjs().year() - 1 + i).map(ano => (
                <option key={ano} value={ano}>
                  {ano}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Lista de Extras/Freelancers */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]"></div>
        </div>
      ) : (
        <div className="bg-[#12141f] rounded-lg border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left bg-white/5 border-b border-white/10">
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Pessoa
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Função
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Data Trabalho
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Horário
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Setor
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Valor Diária
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Status Pagamento
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-[#12141f] divide-y divide-white/5">
                {filteredExtras.map((extra) => (
                  <tr key={extra.id} className="hover:bg-white/5">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        <div className="w-10 h-10 rounded-full bg-[#7D1F2C] flex items-center justify-center text-white font-medium mr-3">
                          {extra.nome.split(' ').map(n => n[0]).join('').substring(0, 2)}
                        </div>
                        <div>
                          <div className="font-medium text-white">{extra.nome}</div>
                          {extra.cpf && (
                            <div className="text-sm text-white/40">CPF: {extra.cpf}</div>
                          )}
                          {extra.telefone && (
                            <div className="text-sm text-white/40 flex items-center">
                              <Phone className="w-3 h-3 mr-1" />
                              {extra.telefone}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-white">{extra.funcao_temporaria}</div>
                        {extra.motivo_contratacao && (
                          <div className="text-sm text-white/40">{extra.motivo_contratacao}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white">
                        {dayjs(extra.data_trabalho).format('DD/MM/YYYY')}
                      </div>
                      <div className="text-sm text-white/40">
                        {dayjs(extra.data_trabalho).format('dddd')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white">
                        {extra.horario_inicio} - {extra.horario_fim}
                      </div>
                      <div className="text-sm text-white/40">
                        {calcularHorasTrabalhadas(extra.horario_inicio || '', extra.horario_fim || '')}h trabalhadas
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getSetorColor(extra.setor)}`}>
                        {extra.setor}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-white">
                        {formatCurrency(extra.valor_diaria)}
                      </div>
                      <div className="text-sm text-white/40">
                        {formatCurrency(extra.valor_diaria / calcularHorasTrabalhadas(extra.horario_inicio || '', extra.horario_fim || '') || 0)}/h
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(extra.status_pagamento)}`}>
                        {getStatusIcon(extra.status_pagamento)}
                        <span className="ml-1">{getStatusText(extra.status_pagamento)}</span>
                      </span>
                      {extra.data_pagamento && (
                        <div className="text-xs text-white/40 mt-1">
                          Pago em: {dayjs(extra.data_pagamento).format('DD/MM/YYYY')}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex space-x-2">
                        {extra.status_pagamento === 'pendente' && (
                          <button
                            onClick={() => marcarComoPago(extra.id)}
                            className="text-green-400 hover:text-green-300"
                            title="Marcar como Pago"
                          >
                            <CheckCircle className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          onClick={() => openForm(extra)}
                          className="text-blue-400 hover:text-blue-300"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(extra.id)}
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

          {filteredExtras.length === 0 && (
            <div className="text-center py-12">
              <Users className="w-16 h-16 text-white/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">Nenhum extra/freelancer encontrado</h3>
              <p className="text-white/40">
                {searchTerm || statusFilter !== 'all' || setorFilter !== 'all'
                  ? 'Nenhum registro corresponde aos filtros aplicados.'
                  : 'Nenhum extra/freelancer cadastrado para este período.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Modal do Formulário */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0f1020] rounded-lg p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-medium text-white mb-4">
              {editingExtra ? 'Editar Extra/Freelancer' : 'Novo Extra/Freelancer'}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Nome Completo *
                </label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  required
                  placeholder="Nome completo da pessoa"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  CPF
                </label>
                <input
                  type="text"
                  value={formData.cpf}
                  onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  placeholder="000.000.000-00"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Telefone
                </label>
                <input
                  type="tel"
                  value={formData.telefone}
                  onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  placeholder="(11) 99999-9999"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Função Temporária *
                </label>
                <select
                  value={formData.funcao_temporaria}
                  onChange={(e) => setFormData({ ...formData, funcao_temporaria: e.target.value })}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  required
                >
                  <option value="">Selecione uma função...</option>
                  {funcoesPadrao.map((funcao) => (
                    <option key={funcao} value={funcao}>
                      {funcao}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Valor da Diária *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-white/40 sm:text-sm">R$</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={formData.valor_diaria}
                    onChange={(e) => setFormData({ ...formData, valor_diaria: parseFloat(e.target.value) || 0 })}
                    className="pl-10 w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Data do Trabalho *
                </label>
                <input
                  type="date"
                  value={formData.data_trabalho}
                  onChange={(e) => setFormData({ ...formData, data_trabalho: e.target.value })}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
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
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
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
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Setor *
                </label>
                <select
                  value={formData.setor}
                  onChange={(e) => setFormData({ ...formData, setor: e.target.value })}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  required
                >
                  {setores.map((setor) => (
                    <option key={setor} value={setor}>
                      {setor}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Motivo da Contratação
                </label>
                <input
                  type="text"
                  value={formData.motivo_contratacao}
                  onChange={(e) => setFormData({ ...formData, motivo_contratacao: e.target.value })}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  placeholder="Ex: Evento especial, substituição, demanda extra"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Status do Pagamento
                </label>
                <select
                  value={formData.status_pagamento}
                  onChange={(e) => setFormData({ ...formData, status_pagamento: e.target.value as any })}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                >
                  <option value="pendente">Pendente</option>
                  <option value="pago">Pago</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </div>

              {formData.status_pagamento === 'pago' && (
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Data do Pagamento
                  </label>
                  <input
                    type="date"
                    value={formData.data_pagamento}
                    onChange={(e) => setFormData({ ...formData, data_pagamento: e.target.value })}
                    className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  />
                </div>
              )}

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Observações
                </label>
                <textarea
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  rows={3}
                  placeholder="Observações sobre o trabalho realizado..."
                />
              </div>

              {/* Cálculo de Horas e Valor por Hora */}
              {formData.horario_inicio && formData.horario_fim && formData.valor_diaria > 0 && (
                <div className="md:col-span-2 p-4 bg-blue-900/20 rounded-lg border border-blue-500/30">
                  <h4 className="font-medium text-blue-300 mb-2">Cálculo Automático</h4>
                  <div className="grid grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-blue-400 font-medium">Horas Trabalhadas:</span>
                      <div className="text-lg font-bold text-blue-300">
                        {calcularHorasTrabalhadas(formData.horario_inicio, formData.horario_fim)}h
                      </div>
                    </div>
                    <div>
                      <span className="text-blue-400 font-medium">Valor por Hora:</span>
                      <div className="text-lg font-bold text-blue-300">
                        {formatCurrency(formData.valor_diaria / calcularHorasTrabalhadas(formData.horario_inicio, formData.horario_fim) || 0)}
                      </div>
                    </div>
                    <div>
                      <span className="text-blue-400 font-medium">Total Diária:</span>
                      <div className="text-lg font-bold text-blue-300">
                        {formatCurrency(formData.valor_diaria)}
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
                  setEditingExtra(null);
                  resetForm();
                }}
                className="px-4 py-2 border border-white/20 rounded-md text-white/80 hover:bg-white/5"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={loading || !formData.nome || !formData.funcao_temporaria || !formData.data_trabalho || !formData.setor || formData.valor_diaria <= 0}
                className="px-4 py-2 bg-[#7D1F2C] text-white rounded-md hover:bg-[#6a1a25] disabled:opacity-50"
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

export default ExtrasFreelancers;