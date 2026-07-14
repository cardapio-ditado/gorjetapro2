import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, CreditCard as Edit, Trash2, Eye, EyeOff, Briefcase, DollarSign, Users, CheckCircle, Download, FileText, Target, Activity } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { exportToExcel } from '../../utils/reportGenerator';
import dayjs from 'dayjs';

interface FuncaoRH {
  id: string;
  nome: string;
  descricao?: string;
  salario_base: number;
  percentual_comissao: number;
  status: 'ativo' | 'inativo';
  criado_em: string;
  atualizado_em: string;
  criado_por?: string;
}

interface FormData {
  nome: string;
  descricao: string;
  salario_base: number;
  percentual_comissao: number;
  status: 'ativo' | 'inativo';
}

interface IndicadoresFuncoes {
  total_funcoes: number;
  funcoes_ativas: number;
  funcoes_inativas: number;
  salario_medio: number;
  funcoes_com_comissao: number;
  colaboradores_vinculados: number;
}

const FuncoesRH: React.FC = () => {
  const [funcoes, setFuncoes] = useState<FuncaoRH[]>([]);
  const [indicadores, setIndicadores] = useState<IndicadoresFuncoes | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingFuncao, setEditingFuncao] = useState<FuncaoRH | null>(null);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ativo' | 'inativo'>('all');
  const [comissaoFilter, setComissaoFilter] = useState<'all' | 'com_comissao' | 'sem_comissao'>('all');
  
  const [formData, setFormData] = useState<FormData>({
    nome: '',
    descricao: '',
    salario_base: 0,
    percentual_comissao: 0,
    status: 'ativo'
  });

  useEffect(() => {
    fetchData();
    fetchIndicadores();
  }, []);

  useEffect(() => {
    fetchData();
  }, [statusFilter, comissaoFilter]);

  const fetchData = async () => {
    try {
      setLoading(true);
      setError(null);

      let query = supabase.from('funcoes_rh').select('*');

      // Aplicar filtros
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      if (comissaoFilter === 'com_comissao') {
        query = query.gt('percentual_comissao', 0);
      } else if (comissaoFilter === 'sem_comissao') {
        query = query.eq('percentual_comissao', 0);
      }

      const { data, error } = await query.order('nome');

      if (error) throw error;
      setFuncoes(data || []);
    } catch (err) {
      console.error('Error fetching functions:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar funções');
    } finally {
      setLoading(false);
    }
  };

  const fetchIndicadores = async () => {
    try {
      const { data, error } = await supabase
        .from('funcoes_rh')
        .select('*');

      if (error) throw error;

      const totalFuncoes = (data || []).length;
      const funcoesAtivas = (data || []).filter(f => f.status === 'ativo').length;
      const funcoesInativas = totalFuncoes - funcoesAtivas;
      const salarioMedio = totalFuncoes > 0 
        ? (data || []).reduce((sum, f) => sum + (f.salario_base || 0), 0) / totalFuncoes
        : 0;
      const funcoesComComissao = (data || []).filter(f => (f.percentual_comissao || 0) > 0).length;

      // Buscar colaboradores vinculados
      const { data: colaboradoresData, error: colaboradoresError } = await supabase
        .from('colaboradores')
        .select('funcao_id')
        .not('funcao_id', 'is', null);

      if (colaboradoresError) throw colaboradoresError;

      setIndicadores({
        total_funcoes: totalFuncoes,
        funcoes_ativas: funcoesAtivas,
        funcoes_inativas: funcoesInativas,
        salario_medio: salarioMedio,
        funcoes_com_comissao: funcoesComComissao,
        colaboradores_vinculados: (colaboradoresData || []).length
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
        throw new Error('Nome da função é obrigatório');
      }

      const dataToSave = {
        ...formData,
        salario_base: parseFloat(formData.salario_base.toString()) || 0,
        percentual_comissao: parseFloat(formData.percentual_comissao.toString()) || 0
      };

      if (editingFuncao) {
        const { error } = await supabase
          .from('funcoes_rh')
          .update({ ...dataToSave, atualizado_em: new Date().toISOString() })
          .eq('id', editingFuncao.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('funcoes_rh')
          .insert([dataToSave]);

        if (error) throw error;
      }

      setShowForm(false);
      setEditingFuncao(null);
      resetForm();
      fetchData();
      fetchIndicadores();
    } catch (err) {
      console.error('Error saving function:', err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar função');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta função?')) return;

    try {
      setLoading(true);
      const { error } = await supabase
        .from('funcoes_rh')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchData();
      fetchIndicadores();
    } catch (err) {
      console.error('Error deleting function:', err);
      setError(err instanceof Error ? err.message : 'Erro ao excluir função');
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (funcao: FuncaoRH) => {
    try {
      setLoading(true);
      const { error } = await supabase
        .from('funcoes_rh')
        .update({ 
          status: funcao.status === 'ativo' ? 'inativo' : 'ativo',
          atualizado_em: new Date().toISOString()
        })
        .eq('id', funcao.id);

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

  const openForm = (funcao?: FuncaoRH) => {
    if (funcao) {
      setEditingFuncao(funcao);
      setFormData({
        nome: funcao.nome,
        descricao: funcao.descricao || '',
        salario_base: funcao.salario_base || 0,
        percentual_comissao: funcao.percentual_comissao || 0,
        status: funcao.status
      });
    } else {
      setEditingFuncao(null);
      resetForm();
    }
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      nome: '',
      descricao: '',
      salario_base: 0,
      percentual_comissao: 0,
      status: 'ativo'
    });
  };

  const filteredFuncoes = funcoes.filter(funcao => {
    const matchesSearch = funcao.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         funcao.descricao?.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(value);
  };

  const exportData = () => {
    if (filteredFuncoes.length === 0) {
      alert('Não há dados para exportar');
      return;
    }

    const headers = [
      'Nome',
      'Descrição',
      'Salário Base',
      'Percentual Comissão',
      'Status',
      'Criado em'
    ];

    const data = filteredFuncoes.map(funcao => [
      funcao.nome,
      funcao.descricao || '',
      funcao.salario_base,
      `${funcao.percentual_comissao}%`,
      funcao.status === 'ativo' ? 'Ativo' : 'Inativo',
      dayjs(funcao.criado_em).format('DD/MM/YYYY')
    ]);

    const fileName = `funcoes-rh-${dayjs().format('YYYY-MM-DD')}`;
    exportToExcel(data, fileName, headers);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-white">Funções de RH</h3>
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
            Nova Função
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
              <Briefcase className="w-8 h-8 text-blue-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Total Funções</p>
                <p className="text-2xl font-bold text-blue-600">
                  {indicadores.total_funcoes}
                </p>
                <p className="text-sm text-white/50">Cadastradas</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <CheckCircle className="w-8 h-8 text-green-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Funções Ativas</p>
                <p className="text-2xl font-bold text-green-600">
                  {indicadores.funcoes_ativas}
                </p>
                <p className="text-sm text-white/50">Em uso</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <EyeOff className="w-8 h-8 text-white/50 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Funções Inativas</p>
                <p className="text-2xl font-bold text-white/50">
                  {indicadores.funcoes_inativas}
                </p>
                <p className="text-sm text-white/50">Desabilitadas</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <DollarSign className="w-8 h-8 text-purple-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Salário Médio</p>
                <p className="text-2xl font-bold text-purple-600">
                  {formatCurrency(indicadores.salario_medio)}
                </p>
                <p className="text-sm text-white/50">Por função</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <Target className="w-8 h-8 text-orange-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Com Comissão</p>
                <p className="text-2xl font-bold text-orange-600">
                  {indicadores.funcoes_com_comissao}
                </p>
                <p className="text-sm text-white/50">Funções</p>
              </div>
            </div>
          </div>

          <div className="bg-[#12141f] p-6 rounded-lg border border-white/10">
            <div className="flex items-center">
              <Users className="w-8 h-8 text-teal-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-white/50">Colaboradores</p>
                <p className="text-2xl font-bold text-teal-600">
                  {indicadores.colaboradores_vinculados}
                </p>
                <p className="text-sm text-white/50">Vinculados</p>
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
                placeholder="Buscar funções..."
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
              <option value="ativo">Ativo</option>
              <option value="inativo">Inativo</option>
            </select>
          </div>

          <div>
            <select
              value={comissaoFilter}
              onChange={(e) => setComissaoFilter(e.target.value as any)}
              className="w-full border border-white/20 rounded-lg px-4 py-2 bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            >
              <option value="all">Todas as Comissões</option>
              <option value="com_comissao">Com Comissão</option>
              <option value="sem_comissao">Sem Comissão</option>
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

      {/* Lista de Funções */}
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
                    Função
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Salário Base
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider">
                    Comissão
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
                {filteredFuncoes.map((funcao) => (
                  <tr key={funcao.id} className="hover:bg-white/5">
                    <td className="px-6 py-4">
                      <div>
                        <div className="font-medium text-white">{funcao.nome}</div>
                        {funcao.descricao && (
                          <div className="text-sm text-white/40">{funcao.descricao}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-medium text-white">
                        {formatCurrency(funcao.salario_base)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className={`font-medium ${
                        funcao.percentual_comissao > 0 ? 'text-green-600' : 'text-white/30'
                      }`}>
                        {funcao.percentual_comissao}%
                      </div>
                      {funcao.percentual_comissao > 0 && (
                        <div className="text-xs text-green-600">
                          <Target className="w-3 h-3 inline mr-1" />
                          Com comissão
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        funcao.status === 'ativo' ? 'text-green-300 bg-green-900/30' : 'text-red-300 bg-red-900/30'
                      }`}>
                        {funcao.status === 'ativo' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white/50">
                        {dayjs(funcao.criado_em).format('DD/MM/YYYY')}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => openForm(funcao)}
                          className="text-blue-600 hover:text-blue-800"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleStatus(funcao)}
                          className={`${funcao.status === 'ativo' ? 'text-green-600' : 'text-white/30'} hover:opacity-75`}
                          title={funcao.status === 'ativo' ? 'Desativar' : 'Ativar'}
                        >
                          {funcao.status === 'ativo' ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleDelete(funcao.id)}
                          className="text-red-600 hover:text-red-800"
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

          {filteredFuncoes.length === 0 && (
            <div className="text-center py-12">
              <Briefcase className="w-16 h-16 text-white/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">Nenhuma função encontrada</h3>
              <p className="text-white/40">
                {searchTerm || statusFilter !== 'all' || comissaoFilter !== 'all'
                  ? 'Nenhuma função corresponde aos filtros aplicados.'
                  : 'Nenhuma função cadastrada.'}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Modal do Formulário */}
      {showForm && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#12141f] rounded-lg p-6 w-full max-w-2xl">
            <h3 className="text-lg font-medium text-white mb-4">
              {editingFuncao ? 'Editar Função' : 'Nova Função'}
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
                  placeholder="Ex: Garçom, Cozinheiro, Gerente"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Salário Base
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <span className="text-white/40 sm:text-sm">R$</span>
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.salario_base}
                    onChange={(e) => setFormData({ ...formData, salario_base: parseFloat(e.target.value) || 0 })}
                    className="pl-10 w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
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
                    className="w-full rounded-md border border-white/20 bg-white/5 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                    <span className="text-white/40 sm:text-sm">%</span>
                  </div>
                </div>
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
                  placeholder="Descrição das responsabilidades da função..."
                />
              </div>

              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="status"
                  checked={formData.status === 'ativo'}
                  onChange={(e) => setFormData({ ...formData, status: e.target.checked ? 'ativo' : 'inativo' })}
                  className="rounded border-white/20 text-[#7D1F2C] focus:ring-[#7D1F2C]"
                />
                <label htmlFor="status" className="ml-2 text-sm text-white/80">
                  Função ativa
                </label>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-white/20 rounded-md text-white/80 hover:bg-white/5"
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
    </div>
  );
};

export default FuncoesRH;