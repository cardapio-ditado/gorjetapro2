import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, CreditCard as Edit, Trash2, Eye, EyeOff, User, DollarSign, Users, CheckCircle, Download, FileText, Target, Activity, Calendar, Phone, Mail, MapPin, Briefcase, Clock, AlertTriangle, Printer } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { testConnection } from '../../lib/supabase';
import { exportToExcel } from '../../utils/reportGenerator';
import FichaColaborador from './FichaColaborador';
import dayjs from 'dayjs';

interface Colaborador {
  id: string;
  nome_completo: string;
  cpf?: string;
  rg?: string;
  data_nascimento?: string;
  funcao_id?: string;
  funcao_personalizada?: string;
  tipo_vinculo: 'clt' | 'freelancer' | 'prestador';
  data_admissao?: string;
  data_demissao?: string;
  status: 'ativo' | 'inativo' | 'afastado' | 'demitido';
  salario_fixo: number;
  valor_diaria: number;
  percentual_comissao: number;
  foto_url?: string;
  telefone?: string;
  email?: string;
  endereco?: string;
  observacoes?: string;
  criado_em: string;
  atualizado_em: string;
  // Dados da função
  funcao_nome?: string;
  funcao_salario_base?: number;
  funcao_percentual_comissao?: number;
  anos_empresa?: number;
}

interface FormData {
  nome_completo: string;
  cpf: string;
  rg: string;
  data_nascimento: string;
  funcao_id: string;
  funcao_personalizada: string;
  tipo_vinculo: 'clt' | 'freelancer' | 'prestador';
  data_admissao: string;
  data_demissao: string;
  salario_fixo: number;
  valor_diaria: number;
  percentual_comissao: number;
  telefone: string;
  email: string;
  endereco: string;
  observacoes: string;
  status: 'ativo' | 'inativo' | 'afastado' | 'demitido';
  foto_url: string;
}

interface IndicadoresColaboradores {
  total_colaboradores: number;
  colaboradores_ativos: number;
  colaboradores_inativos: number;
  colaboradores_afastados: number;
  colaboradores_demitidos: number;
  salario_medio: number;
  colaboradores_com_comissao: number;
  tipos_vinculo: number;
}

const ColaboradoresRH: React.FC = () => {
  const [colaboradores, setColaboradores] = useState<Colaborador[]>([]);
  const [funcoes, setFuncoes] = useState<any[]>([]);
  const [indicadores, setIndicadores] = useState<IndicadoresColaboradores | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingColaborador, setEditingColaborador] = useState<Colaborador | null>(null);
  const [showFicha, setShowFicha] = useState(false);
  const [fichaColaborador, setFichaColaborador] = useState<Colaborador | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ativo' | 'inativo' | 'afastado' | 'demitido'>('all');
  const [funcaoFilter, setFuncaoFilter] = useState('all');
  const [tipoVinculoFilter, setTipoVinculoFilter] = useState<'all' | 'clt' | 'freelancer' | 'prestador'>('all');
  
  const [formData, setFormData] = useState<FormData>({
    nome_completo: '',
    cpf: '',
    rg: '',
    data_nascimento: '',
    funcao_id: '',
    funcao_personalizada: '',
    tipo_vinculo: 'clt',
    data_admissao: dayjs().format('YYYY-MM-DD'),
    salario_fixo: 0,
    valor_diaria: 0,
    percentual_comissao: 0,
    telefone: '',
    email: '',
    endereco: '',
    observacoes: '',
    status: 'ativo'
  });

  useEffect(() => {
    fetchData();
    fetchFuncoes();
    fetchIndicadores();
  }, []);

  useEffect(() => {
    fetchData();
  }, [statusFilter, funcaoFilter, tipoVinculoFilter]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      if (!supabase) {
        console.warn('Supabase client not initialized');
        setColaboradores([]);
        return;
      }

      let query = supabase.from('vw_colaboradores_completo').select('*');

      // Aplicar filtros
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (funcaoFilter !== 'all') {
        query = query.eq('funcao_id', funcaoFilter);
      }

      if (tipoVinculoFilter !== 'all') {
        query = query.eq('tipo_vinculo', tipoVinculoFilter);
      }

      const { data, error } = await query.order('nome_completo');

      if (error) throw error;
      setColaboradores(data || []);
    } catch (err) {
      console.error('Error fetching employees:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar colaboradores');
    } finally {
      setLoading(false);
    }
  };

  const fetchFuncoes = async () => {
    try {
      const { data, error } = await supabase
        .from('funcoes_rh')
        .select('*')
        .eq('status', 'ativo')
        .order('nome');

      if (error) throw error;
      setFuncoes(data || []);
    } catch (err) {
      console.error('Error fetching functions:', err);
    }
  };

  const fetchIndicadores = async () => {
    try {
      const { data, error } = await supabase
        .from('colaboradores')
        .select('*');

      if (error) throw error;

      const totalColaboradores = (data || []).length;
      const colaboradoresAtivos = (data || []).filter(c => c.status === 'ativo').length;
      const colaboradoresInativos = (data || []).filter(c => c.status === 'inativo').length;
      const colaboradoresAfastados = (data || []).filter(c => c.status === 'afastado').length;
      const colaboradoresDemitidos = (data || []).filter(c => c.status === 'demitido').length;
      const salarioMedio = totalColaboradores > 0 
        ? (data || []).reduce((sum, c) => sum + (c.salario_fixo || 0), 0) / totalColaboradores
        : 0;
      const colaboradoresComComissao = (data || []).filter(c => (c.percentual_comissao || 0) > 0).length;
      const tiposVinculo = new Set((data || []).map(c => c.tipo_vinculo)).size;

      setIndicadores({
        total_colaboradores: totalColaboradores,
        colaboradores_ativos: colaboradoresAtivos,
        colaboradores_inativos: colaboradoresInativos,
        colaboradores_afastados: colaboradoresAfastados,
        colaboradores_demitidos: colaboradoresDemitidos,
        salario_medio: salarioMedio,
        colaboradores_com_comissao: colaboradoresComComissao,
        tipos_vinculo: tiposVinculo
      });
    } catch (err) {
      console.error('Error fetching indicators:', err);
    }
  };

  const handlePhotoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Por favor, selecione uma imagem válida');
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('A imagem deve ter no máximo 2MB');
      return;
    }

    try {
      setUploadingPhoto(true);
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `colaboradores/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('fotos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('fotos')
        .getPublicUrl(filePath);

      setFormData({ ...formData, foto_url: publicUrl });
    } catch (error) {
      console.error('Erro ao fazer upload:', error);
      alert('Erro ao fazer upload da foto');
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);

      // Validações
      if (!formData.nome_completo) {
        throw new Error('Nome completo é obrigatório');
      }

      // Validar data de demissão quando status for inativo ou demitido
      if ((formData.status === 'inativo' || formData.status === 'demitido') && !formData.data_demissao) {
        throw new Error('Data de demissão é obrigatória para colaboradores inativos ou demitidos');
      }

      const dataToSave = {
        ...formData,
        salario_fixo: parseFloat(formData.salario_fixo.toString()) || 0,
        valor_diaria: parseFloat(formData.valor_diaria.toString()) || 0,
        percentual_comissao: parseFloat(formData.percentual_comissao.toString()) || 0,
        funcao_id: formData.funcao_id || null,
        data_nascimento: formData.data_nascimento || null,
        data_admissao: formData.data_admissao || null,
        data_demissao: formData.data_demissao || null,
        foto_url: formData.foto_url || null
      };

      if (editingColaborador) {
        const { error } = await supabase
          .from('colaboradores')
          .update({ ...dataToSave, atualizado_em: new Date().toISOString() })
          .eq('id', editingColaborador.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('colaboradores')
          .insert([dataToSave]);

        if (error) throw error;
      }

      setShowForm(false);
      setEditingColaborador(null);
      resetForm();
      fetchData();
      fetchIndicadores();
    } catch (err) {
      console.error('Error saving employee:', err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar colaborador');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este colaborador?')) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('colaboradores')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchData();
      fetchIndicadores();
    } catch (err) {
      console.error('Error deleting employee:', err);
      setError(err instanceof Error ? err.message : 'Erro ao excluir colaborador');
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (colaborador: Colaborador) => {
    try {
      setLoading(true);
      const newStatus = colaborador.status === 'ativo' ? 'inativo' : 'ativo';
      
      const { error } = await supabase
        .from('colaboradores')
        .update({ 
          status: newStatus,
          atualizado_em: new Date().toISOString()
        })
        .eq('id', colaborador.id);

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

  const openForm = (colaborador?: Colaborador) => {
    if (colaborador) {
      setEditingColaborador(colaborador);
      setFormData({
        nome_completo: colaborador.nome_completo,
        cpf: colaborador.cpf || '',
        rg: colaborador.rg || '',
        data_nascimento: colaborador.data_nascimento || '',
        funcao_id: colaborador.funcao_id || '',
        funcao_personalizada: colaborador.funcao_personalizada || '',
        tipo_vinculo: colaborador.tipo_vinculo,
        data_admissao: colaborador.data_admissao || '',
        salario_fixo: colaborador.salario_fixo || 0,
        valor_diaria: colaborador.valor_diaria || 0,
        percentual_comissao: colaborador.percentual_comissao || 0,
        telefone: colaborador.telefone || '',
        email: colaborador.email || '',
        endereco: colaborador.endereco || '',
        observacoes: colaborador.observacoes || '',
        status: colaborador.status
      });
    } else {
      setEditingColaborador(null);
      resetForm();
    }
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      nome_completo: '',
      cpf: '',
      rg: '',
      data_nascimento: '',
      funcao_id: '',
      funcao_personalizada: '',
      tipo_vinculo: 'clt',
      data_admissao: dayjs().format('YYYY-MM-DD'),
      data_demissao: '',
      salario_fixo: 0,
      valor_diaria: 0,
      percentual_comissao: 0,
      telefone: '',
      email: '',
      endereco: '',
      observacoes: '',
      status: 'ativo',
      foto_url: ''
    });
  };

  const filteredColaboradores = colaboradores.filter(colaborador => {
    const matchesSearch = colaborador.nome_completo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         colaborador.cpf?.includes(searchTerm) ||
                         colaborador.email?.toLowerCase().includes(searchTerm.toLowerCase());
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
      case 'ativo':
        return 'text-green-300 bg-green-900/30';
      case 'inativo':
        return 'text-text-primary bg-white/10';
      case 'afastado':
        return 'text-yellow-300 bg-yellow-900/30';
      case 'demitido':
        return 'text-red-300 bg-red-900/30';
      default:
        return 'text-text-primary bg-white/10';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'ativo':
        return 'Ativo';
      case 'inativo':
        return 'Inativo';
      case 'afastado':
        return 'Afastado';
      case 'demitido':
        return 'Demitido';
      default:
        return status;
    }
  };

  const getTipoVinculoColor = (tipo: string) => {
    switch (tipo) {
      case 'clt':
        return 'text-blue-300 bg-blue-900/30';
      case 'freelancer':
        return 'text-purple-400 bg-purple-500/15';
      case 'prestador':
        return 'text-orange-300 bg-orange-900/30';
      default:
        return 'text-text-primary bg-white/10';
    }
  };

  const getTipoVinculoText = (tipo: string) => {
    switch (tipo) {
      case 'clt':
        return 'CLT';
      case 'freelancer':
        return 'Freelancer';
      case 'prestador':
        return 'Prestador';
      default:
        return tipo;
    }
  };

  const exportData = () => {
    if (filteredColaboradores.length === 0) {
      alert('Não há dados para exportar');
      return;
    }

    const headers = [
      'Nome Completo',
      'CPF',
      'RG',
      'Data Nascimento',
      'Função',
      'Tipo Vínculo',
      'Data Admissão',
      'Salário Fixo',
      'Valor Diária',
      'Percentual Comissão',
      'Telefone',
      'Email',
      'Status',
      'Anos na Empresa'
    ];

    const data = filteredColaboradores.map(colaborador => [
      colaborador.nome_completo,
      colaborador.cpf || '',
      colaborador.rg || '',
      colaborador.data_nascimento ? dayjs(colaborador.data_nascimento).format('DD/MM/YYYY') : '',
      colaborador.funcao_nome || colaborador.funcao_personalizada || '',
      getTipoVinculoText(colaborador.tipo_vinculo),
      colaborador.data_admissao ? dayjs(colaborador.data_admissao).format('DD/MM/YYYY') : '',
      colaborador.salario_fixo,
      colaborador.valor_diaria,
      `${colaborador.percentual_comissao}%`,
      colaborador.telefone || '',
      colaborador.email || '',
      getStatusText(colaborador.status),
      colaborador.anos_empresa?.toFixed(1) || '0'
    ]);

    const fileName = `colaboradores-${dayjs().format('YYYY-MM-DD')}`;
    exportToExcel(data, fileName, headers);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Colaboradores</h3>
        <div className="flex gap-2">
          <button onClick={exportData} className="btn-secondary">
            <Download className="w-4 h-4" />
            Exportar Excel
          </button>
          <button onClick={() => openForm()} className="btn-primary">
            <Plus className="w-4 h-4" />
            Novo Colaborador
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
          <div className="kpi-card">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-text-secondary mb-3">Total Colaboradores</p>
            <div className="flex items-end justify-between">
              <p className="stat-value">{indicadores.total_colaboradores}</p>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(59,130,246,0.12)' }}>
                <Users className="w-4 h-4 text-info" />
              </div>
            </div>
            <p className="stat-label">Cadastrados</p>
          </div>

          <div className="kpi-card">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-text-secondary mb-3">Colaboradores Ativos</p>
            <div className="flex items-end justify-between">
              <p className="stat-value">{indicadores.colaboradores_ativos}</p>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(16,185,129,0.12)' }}>
                <CheckCircle className="w-4 h-4 text-success" />
              </div>
            </div>
            <p className="stat-label">Trabalhando</p>
          </div>

          <div className="kpi-card">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-text-secondary mb-3">Salário Médio</p>
            <div className="flex items-end justify-between">
              <p className="stat-value text-2xl">{formatCurrency(indicadores.salario_medio)}</p>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(212,175,55,0.12)' }}>
                <DollarSign className="w-4 h-4 text-gold" />
              </div>
            </div>
            <p className="stat-label">Por colaborador</p>
          </div>

          <div className="kpi-card">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-text-secondary mb-3">Com Comissão</p>
            <div className="flex items-end justify-between">
              <p className="stat-value">{indicadores.colaboradores_com_comissao}</p>
              <div className="w-9 h-9 rounded-lg flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.12)' }}>
                <Target className="w-4 h-4 text-warning" />
              </div>
            </div>
            <p className="stat-label">Colaboradores</p>
          </div>
        </div>
      )}

      {/* Filtros */}
      <div className="card p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted w-4 h-4" />
            <input
              type="text"
              placeholder="Buscar colaboradores..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="input-dark pl-9"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="input-dark"
          >
            <option value="all">Todos os Status</option>
            <option value="ativo">Ativo</option>
            <option value="inativo">Inativo</option>
            <option value="afastado">Afastado</option>
            <option value="demitido">Demitido</option>
          </select>

          <select
            value={funcaoFilter}
            onChange={(e) => setFuncaoFilter(e.target.value)}
            className="input-dark"
          >
            <option value="all">Todas as Funções</option>
            {funcoes.map((funcao) => (
              <option key={funcao.id} value={funcao.id}>{funcao.nome}</option>
            ))}
          </select>

          <select
            value={tipoVinculoFilter}
            onChange={(e) => setTipoVinculoFilter(e.target.value as any)}
            className="input-dark"
          >
            <option value="all">Todos os Vínculos</option>
            <option value="clt">CLT</option>
            <option value="freelancer">Freelancer</option>
            <option value="prestador">Prestador</option>
          </select>

          <button onClick={fetchData} className="btn-primary justify-center">
            <Filter className="w-4 h-4" />
            Filtrar
          </button>
        </div>
      </div>

      {/* Lista de Colaboradores */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="relative w-10 h-10">
            <div className="absolute inset-0 rounded-full border-2 border-white/8" />
            <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-gold animate-spin" />
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-dark w-full">
              <thead>
                <tr>
                  <th>Colaborador</th>
                  <th>Função</th>
                  <th>Tipo Vínculo</th>
                  <th>Admissão</th>
                  <th>Salário/Diária</th>
                  <th>Comissão</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredColaboradores.map((colaborador) => (
                  <tr key={colaborador.id} className="hover:bg-white/5">
                    <td className="px-6 py-4">
                      <div className="flex items-center">
                        {colaborador.foto_url ? (
                          <img
                            src={colaborador.foto_url}
                            alt={colaborador.nome_completo}
                            className="w-10 h-10 rounded-full object-cover mr-3"
                          />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[#7D1F2C] flex items-center justify-center text-white font-medium mr-3">
                            {colaborador.nome_completo.split(' ').map(n => n[0]).join('').substring(0, 2)}
                          </div>
                        )}
                        <div>
                          <div className="font-medium text-white">{colaborador.nome_completo}</div>
                          {colaborador.cpf && (
                            <div className="text-sm text-text-secondary">CPF: {colaborador.cpf}</div>
                          )}
                          {colaborador.telefone && (
                            <div className="text-sm text-text-secondary flex items-center">
                              <Phone className="w-3 h-3 mr-1" />
                              {colaborador.telefone}
                            </div>
                          )}
                          {colaborador.email && (
                            <div className="text-sm text-text-secondary flex items-center">
                              <Mail className="w-3 h-3 mr-1" />
                              {colaborador.email}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-white">
                          {colaborador.funcao_nome || colaborador.funcao_personalizada || 'Não definida'}
                        </div>
                        {colaborador.funcao_salario_base && (
                          <div className="text-sm text-text-secondary">
                            Base: {formatCurrency(colaborador.funcao_salario_base)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTipoVinculoColor(colaborador.tipo_vinculo)}`}>
                        {getTipoVinculoText(colaborador.tipo_vinculo)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        {colaborador.data_admissao && (
                          <div className="text-sm text-white">
                            {dayjs(colaborador.data_admissao).format('DD/MM/YYYY')}
                          </div>
                        )}
                        {colaborador.anos_empresa && (
                          <div className="text-sm text-text-secondary">
                            {colaborador.anos_empresa.toFixed(1)} anos
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        {colaborador.salario_fixo > 0 && (
                          <div className="text-sm font-medium text-white">
                            {formatCurrency(colaborador.salario_fixo)}
                          </div>
                        )}
                        {colaborador.valor_diaria > 0 && (
                          <div className="text-sm text-text-secondary">
                            Diária: {formatCurrency(colaborador.valor_diaria)}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`text-sm font-semibold ${
                        colaborador.percentual_comissao > 0 ? 'text-success' : 'text-text-muted'
                      }`}>
                        {colaborador.percentual_comissao}%
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(colaborador.status)}`}>
                        {getStatusText(colaborador.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setFichaColaborador(colaborador); setShowFicha(true); }}
                          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-text-secondary hover:text-info hover:bg-info/10"
                          title="Ver Ficha"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => openForm(colaborador)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-text-secondary hover:text-text-primary hover:bg-white/6"
                          title="Editar"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => toggleStatus(colaborador)}
                          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-colors ${
                            colaborador.status === 'ativo'
                              ? 'text-success hover:bg-success/10'
                              : 'text-text-muted hover:text-text-secondary hover:bg-white/6'
                          }`}
                          title={colaborador.status === 'ativo' ? 'Desativar' : 'Ativar'}
                        >
                          {colaborador.status === 'ativo' ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                        </button>
                        <button
                          onClick={() => handleDelete(colaborador.id)}
                          className="w-8 h-8 flex items-center justify-center rounded-lg transition-colors text-text-secondary hover:text-danger hover:bg-danger/10"
                          title="Excluir"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {filteredColaboradores.length === 0 && (
            <div className="text-center py-14">
              <Users className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--text-muted)' }} />
              <h3 className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>Nenhum colaborador encontrado</h3>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {searchTerm || statusFilter !== 'all' || funcaoFilter !== 'all' || tipoVinculoFilter !== 'all'
                  ? 'Nenhum colaborador corresponde aos filtros aplicados.'
                  : 'Nenhum colaborador cadastrado.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Modal do Formulário */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl p-6 w-full max-w-4xl max-h-[90vh] overflow-y-auto animate-slide-up"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)' }}>
            <h3 className="text-base font-semibold mb-5" style={{ color: 'var(--text-primary)' }}>
              {editingColaborador ? 'Editar Colaborador' : 'Novo Colaborador'}
            </h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Nome Completo *
                </label>
                <input
                  type="text"
                  value={formData.nome_completo}
                  onChange={(e) => setFormData({ ...formData, nome_completo: e.target.value })}
                  className="input-dark"
                  required
                  placeholder="Nome completo do colaborador"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  CPF
                </label>
                <input
                  type="text"
                  value={formData.cpf}
                  onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                  className="input-dark"
                  placeholder="000.000.000-00"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  RG
                </label>
                <input
                  type="text"
                  value={formData.rg}
                  onChange={(e) => setFormData({ ...formData, rg: e.target.value })}
                  className="input-dark"
                  placeholder="00.000.000-0"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Data de Nascimento
                </label>
                <input
                  type="date"
                  value={formData.data_nascimento}
                  onChange={(e) => setFormData({ ...formData, data_nascimento: e.target.value })}
                  className="input-dark"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Função
                </label>
                <select
                  value={formData.funcao_id}
                  onChange={(e) => setFormData({ ...formData, funcao_id: e.target.value })}
                  className="input-dark"
                >
                  <option value="">Selecione uma função...</option>
                  {funcoes.map((funcao) => (
                    <option key={funcao.id} value={funcao.id}>
                      {funcao.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Função Personalizada
                </label>
                <input
                  type="text"
                  value={formData.funcao_personalizada}
                  onChange={(e) => setFormData({ ...formData, funcao_personalizada: e.target.value })}
                  className="input-dark"
                  placeholder="Se não houver função cadastrada"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Tipo de Vínculo
                </label>
                <select
                  value={formData.tipo_vinculo}
                  onChange={(e) => setFormData({ ...formData, tipo_vinculo: e.target.value as any })}
                  className="input-dark"
                >
                  <option value="clt">CLT</option>
                  <option value="freelancer">Freelancer</option>
                  <option value="prestador">Prestador de Serviços</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Data de Admissão
                </label>
                <input
                  type="date"
                  value={formData.data_admissao}
                  onChange={(e) => setFormData({ ...formData, data_admissao: e.target.value })}
                  className="input-dark"
                />
              </div>

              {(formData.status === 'inativo' || formData.status === 'demitido') && (
                <div>
                  <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                    Data de Demissão *
                  </label>
                  <input
                    type="date"
                    value={formData.data_demissao}
                    onChange={(e) => setFormData({ ...formData, data_demissao: e.target.value })}
                    className="input-dark"
                    required
                  />
                </div>
              )}

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-text-primary mb-2">
                  Foto do Colaborador
                </label>
                <div className="flex items-center gap-4">
                  {formData.foto_url && (
                    <div className="w-24 h-24 rounded-lg overflow-hidden border-2 border-white/20">
                      <img
                        src={formData.foto_url}
                        alt="Foto do colaborador"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handlePhotoUpload}
                      className="hidden"
                      id="photo-upload"
                      disabled={uploadingPhoto}
                    />
                    <label
                      htmlFor="photo-upload"
                      className={`inline-flex items-center px-4 py-2 border border-white/20 rounded-md shadow-sm text-sm font-medium text-text-primary bg-dark-card hover:bg-white/5 cursor-pointer ${
                        uploadingPhoto ? 'opacity-50 cursor-not-allowed' : ''
                      }`}
                    >
                      {uploadingPhoto ? 'Enviando...' : 'Escolher Foto'}
                    </label>
                    <p className="mt-2 text-xs text-text-secondary">
                      Formatos: JPG, PNG. Tamanho máximo: 2MB
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Salário Fixo
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-text-secondary sm:text-sm">R$</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.salario_fixo}
                    onChange={(e) => setFormData({ ...formData, salario_fixo: parseFloat(e.target.value) || 0 })}
                    className="input-dark pl-10"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Valor da Diária
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-text-secondary sm:text-sm">R$</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.valor_diaria}
                    onChange={(e) => setFormData({ ...formData, valor_diaria: parseFloat(e.target.value) || 0 })}
                    className="input-dark pl-10"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Percentual de Comissão
                </label>
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    value={formData.percentual_comissao}
                    onChange={(e) => setFormData({ ...formData, percentual_comissao: parseFloat(e.target.value) || 0 })}
                    className="input-dark"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <span className="text-text-secondary sm:text-sm">%</span>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Telefone
                </label>
                <input
                  type="tel"
                  value={formData.telefone}
                  onChange={(e) => setFormData({ ...formData, telefone: e.target.value })}
                  className="input-dark"
                  placeholder="(11) 99999-9999"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="input-dark"
                  placeholder="email@exemplo.com"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="input-dark"
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                  <option value="afastado">Afastado</option>
                  <option value="demitido">Demitido</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Endereço
                </label>
                <textarea
                  value={formData.endereco}
                  onChange={(e) => setFormData({ ...formData, endereco: e.target.value })}
                  className="input-dark"
                  rows={2}
                  placeholder="Endereço completo"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold mb-1.5" style={{ color: 'var(--text-secondary)' }}>
                  Observações
                </label>
                <textarea
                  value={formData.observacoes}
                  onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                  className="input-dark"
                  rows={3}
                  placeholder="Observações sobre o colaborador..."
                />
              </div>
            </div>
            
            <div className="mt-6 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)} className="btn-secondary">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={loading || !formData.nome_completo}
                className="btn-primary"
              >
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal da Ficha do Colaborador */}
      {showFicha && fichaColaborador && (
        <FichaColaborador
          colaborador={fichaColaborador}
          onClose={() => {
            setShowFicha(false);
            setFichaColaborador(null);
          }}
        />
      )}
    </div>
  );
};

export default ColaboradoresRH;