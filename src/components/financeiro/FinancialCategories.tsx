import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, CreditCard as Edit, Trash2, Eye, EyeOff, ChevronRight, ChevronDown, FolderOpen, Folder, Tag, TrendingUp, TrendingDown } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SearchableSelect } from '../common/SearchableSelect';

interface FinancialCategory {
  id: string;
  nome: string;
  tipo: 'receita' | 'despesa';
  categoria_pai_id?: string;
  descricao?: string;
  status: 'ativo' | 'inativo';
  ordem: number;
  criado_em: string;
  children?: FinancialCategory[];
  nivel?: number;
  caminho_completo?: string;
  nome_indentado?: string;
}

interface CategoryFormData {
  nome: string;
  tipo: 'receita' | 'despesa';
  categoria_pai_id?: string;
  descricao?: string;
  status: 'ativo' | 'inativo';
  ordem: number;
}

const FinancialCategories: React.FC = () => {
  const [categories, setCategories] = useState<FinancialCategory[]>([]);
  const [filteredCategories, setFilteredCategories] = useState<FinancialCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingCategory, setEditingCategory] = useState<FinancialCategory | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'receita' | 'despesa'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'ativo' | 'inativo'>('all');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  
  const [formData, setFormData] = useState<CategoryFormData>({
    nome: '',
    tipo: 'despesa',
    categoria_pai_id: '',
    descricao: '',
    status: 'ativo',
    ordem: 0
  });

  useEffect(() => {
    fetchCategories();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [categories, searchTerm, typeFilter, statusFilter]);

  const fetchCategories = async () => {
    try {
      setLoading(true);
      setError(null);

      const { data, error } = await supabase
        .from('vw_categoria_tree')
        .select('*');

      if (error) throw error;

      setCategories(data || []);
    } catch (err) {
      console.error('Error fetching categories:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar categorias');
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...categories];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(cat => 
        cat.nome.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cat.caminho_completo?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(cat => cat.tipo === typeFilter);
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(cat => cat.status === statusFilter);
    }

    setFilteredCategories(filtered);
  };

  const handleSave = async () => {
    try {
      setLoading(true);
      setError(null);

      const dataToSave = {
        ...formData,
        categoria_pai_id: formData.categoria_pai_id || null,
        ordem: formData.ordem || 0
      };

      if (editingCategory) {
        const { error } = await supabase
          .from('categorias_financeiras')
          .update(dataToSave)
          .eq('id', editingCategory.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('categorias_financeiras')
          .insert([dataToSave]);

        if (error) throw error;
      }

      setShowForm(false);
      setEditingCategory(null);
      resetForm();
      fetchCategories();
    } catch (err) {
      console.error('Error saving category:', err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar categoria');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta categoria?')) return;

    try {
      setLoading(true);
      setError(null);

      const { error } = await supabase
        .from('categorias_financeiras')
        .delete()
        .eq('id', id);

      if (error) throw error;
      fetchCategories();
    } catch (err) {
      console.error('Error deleting category:', err);
      setError(err instanceof Error ? err.message : 'Erro ao excluir categoria');
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (category: FinancialCategory) => {
    try {
      setLoading(true);
      setError(null);

      const newStatus = category.status === 'ativo' ? 'inativo' : 'ativo';

      const { error } = await supabase
        .from('categorias_financeiras')
        .update({ status: newStatus })
        .eq('id', category.id);

      if (error) throw error;
      fetchCategories();
    } catch (err) {
      console.error('Error updating status:', err);
      setError(err instanceof Error ? err.message : 'Erro ao atualizar status');
    } finally {
      setLoading(false);
    }
  };

  const openForm = (category?: FinancialCategory) => {
    if (category) {
      setEditingCategory(category);
      setFormData({
        nome: category.nome,
        tipo: category.tipo,
        categoria_pai_id: category.categoria_pai_id || '',
        descricao: category.descricao || '',
        status: category.status,
        ordem: category.ordem
      });
    } else {
      setEditingCategory(null);
      resetForm();
    }
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      nome: '',
      tipo: 'despesa',
      categoria_pai_id: '',
      descricao: '',
      status: 'ativo',
      ordem: 0
    });
  };

  const toggleExpanded = (categoryId: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(categoryId)) {
      newExpanded.delete(categoryId);
    } else {
      newExpanded.add(categoryId);
    }
    setExpandedCategories(newExpanded);
  };

  const getParentCategories = () => {
    return categories.filter(cat => 
      cat.nivel === 0 && 
      cat.tipo === formData.tipo && 
      cat.status === 'ativo'
    );
  };

  const getCategoryIcon = (category: FinancialCategory) => {
    if (category.nivel === 0) {
      return category.tipo === 'receita' ? 
        <TrendingUp className="w-4 h-4 text-green-400" /> : 
        <TrendingDown className="w-4 h-4 text-red-400" />;
    }
    return <Tag className="w-4 h-4 text-white/50" />;
  };

  const getStatusColor = (status: string) => {
    return status === 'ativo' ? 
      'text-green-400 bg-green-900/30' : 
      'text-red-400 bg-red-900/30';
  };

  const getTypeColor = (tipo: string) => {
    return tipo === 'receita' ? 
      'text-green-400 bg-green-900/30' : 
      'text-red-400 bg-red-900/30';
  };

  const getIndentationStyle = (nivel: number) => {
    return {
      paddingLeft: `${nivel * 24}px`
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium text-white">Categorias Financeiras</h3>
        <button
          onClick={() => openForm()}
          className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25]"
        >
          <Plus className="w-4 h-4 inline mr-2" />
          Nova Categoria
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-900/30 text-red-400 rounded-lg border border-red-700/40">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/40 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar categorias..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white placeholder-white/40 focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
            />
          </div>
        </div>
        <SearchableSelect
          options={[
            { value: 'all', label: 'Todos os Tipos' },
            { value: 'receita', label: 'Receita' },
            { value: 'despesa', label: 'Despesa' }
          ]}
          value={typeFilter}
          onChange={(value) => setTypeFilter(value as any)}
          placeholder="Tipo"
          theme="dark"
        />
        <SearchableSelect
          options={[
            { value: 'all', label: 'Todos os Status' },
            { value: 'ativo', label: 'Ativo' },
            { value: 'inativo', label: 'Inativo' }
          ]}
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as any)}
          placeholder="Status"
          theme="dark"
        />
      </div>

      {/* Categories Tree */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]"></div>
        </div>
      ) : (
        <div className="bg-[#12141f] rounded-lg border border-white/10">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left bg-white/5 border-b border-white/10">
                  <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                    Categoria
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                    Tipo
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                    Descrição
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-xs font-medium text-white/50 uppercase tracking-wider">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody className="bg-transparent divide-y divide-white/10">
                {filteredCategories.map((category) => (
                  <tr key={category.id} className="hover:bg-white/5">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center" style={getIndentationStyle(category.nivel || 0)}>
                        {getCategoryIcon(category)}
                        <span className={`ml-2 ${category.nivel === 0 ? 'font-semibold text-white' : 'font-medium text-white/80'}`}>
                          {category.nome}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getTypeColor(category.tipo)}`}>
                        {category.tipo === 'receita' ? 'Receita' : 'Despesa'}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm text-white/60">
                        {category.descricao || '-'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(category.status)}`}>
                        {category.status === 'ativo' ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex space-x-2">
                        <button
                          onClick={() => openForm(category)}
                          className="text-[#7D1F2C] hover:text-[#6a1a25]"
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => toggleStatus(category)}
                          className={`${category.status === 'ativo' ? 'text-green-400' : 'text-white/40'} hover:opacity-75`}
                          title={category.status === 'ativo' ? 'Desativar' : 'Ativar'}
                        >
                          {category.status === 'ativo' ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                        </button>
                        <button
                          onClick={() => handleDelete(category.id)}
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
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-[#0f1020] rounded-lg p-6 w-full max-w-md">
            <h3 className="text-lg font-medium text-white mb-4">
              {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
            </h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Nome *
                </label>
                <input
                  type="text"
                  value={formData.nome}
                  onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
                  className="w-full rounded-md bg-white/5 border border-white/20 text-white focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Tipo *
                </label>
                <select
                  value={formData.tipo}
                  onChange={(e) => setFormData({ ...formData, tipo: e.target.value as 'receita' | 'despesa', categoria_pai_id: '' })}
                  className="w-full rounded-md bg-white/5 border border-white/20 text-white focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  required
                >
                  <option value="receita">Receita</option>
                  <option value="despesa">Despesa</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Categoria Pai
                </label>
                <select
                  value={formData.categoria_pai_id}
                  onChange={(e) => setFormData({ ...formData, categoria_pai_id: e.target.value })}
                  className="w-full rounded-md bg-white/5 border border-white/20 text-white focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                >
                  <option value="">Categoria Principal</option>
                  {getParentCategories().map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Descrição
                </label>
                <textarea
                  value={formData.descricao}
                  onChange={(e) => setFormData({ ...formData, descricao: e.target.value })}
                  className="w-full rounded-md bg-white/5 border border-white/20 text-white focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                  rows={3}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Ordem
                </label>
                <input
                  type="number"
                  value={formData.ordem}
                  onChange={(e) => setFormData({ ...formData, ordem: parseInt(e.target.value) || 0 })}
                  className="w-full rounded-md bg-white/5 border border-white/20 text-white focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Status
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as 'ativo' | 'inativo' })}
                  className="w-full rounded-md bg-white/5 border border-white/20 text-white focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                >
                  <option value="ativo">Ativo</option>
                  <option value="inativo">Inativo</option>
                </select>
              </div>
            </div>
            
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-white/20 rounded-md text-white/80 hover:bg-white/10"
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

export default FinancialCategories;