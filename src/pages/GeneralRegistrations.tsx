import React, { useState, useEffect } from 'react';
import { Tab } from '@headlessui/react';
import { Plus, Search, Filter, CreditCard as Edit, Trash2, Download, Building2, Users, CreditCard, Tag, Banknote, Building, Eye, EyeOff, FileText, CheckCircle, XCircle, Settings, BarChart3, Vault } from 'lucide-react';
import { supabase } from '../lib/supabase';
import FinancialCategories from '../components/financeiro/FinancialCategories';
import DRESimplificado from '../components/diretoria/DRESimplificado';
import { PageHeader } from '../components/ui';

interface CostCenter {
  id: string;
  nome: string;
  descricao?: string;
  status: 'ativo' | 'inativo';
  criado_em: string;
}

interface Supplier {
  id: string;
  nome: string;
  cnpj?: string;
  telefone?: string;
  email?: string;
  responsavel?: string;
  endereco?: string;
  observacoes?: string;
  categoria_padrao_id?: string;
  tipo: 'geral' | 'musico' | 'rh';
  status: 'ativo' | 'inativo';
  criado_em: string;
}

interface Customer {
  id: string;
  nome: string;
  documento?: string;
  telefone?: string;
  email?: string;
  cidade?: string;
  tipo: 'fisico' | 'juridico';
  recorrente: boolean;
  observacoes?: string;
  status: 'ativo' | 'inativo';
  criado_em: string;
}

interface PaymentMethod {
  id: string;
  nome: string;
  prazo_padrao: number;
  observacoes?: string;
  status: 'ativo' | 'inativo';
  criado_em: string;
}

interface BankAccount {
  id: string;
  banco: string;
  tipo_conta: 'corrente' | 'poupanca' | 'investimento' | 'cofre';
  numero_conta?: string;
  agencia?: string;
  titular?: string;
  documento_titular?: string;
  saldo_inicial: number;
  saldo_atual: number;
  status: 'ativo' | 'inativo';
  criado_em: string;
}

interface FinancialCategory {
  id: string;
  nome: string;
  tipo: 'receita' | 'despesa';
  categoria_pai_id?: string;
  status: 'ativo' | 'inativo';
  nivel?: number;
  caminho_completo?: string;
}

const GeneralRegistrations: React.FC = () => {
  const [selectedTab, setSelectedTab] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Data states
  const [costCenters, setCostCenters] = useState<CostCenter[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([]);
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([]);
  const [financialCategories, setFinancialCategories] = useState<FinancialCategory[]>([]);
  
  // Form states
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [formData, setFormData] = useState<any>({});
  
  // Filter states
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const tabTitles = [
    'Centro de Custo',
    'Fornecedores', 
    'Clientes',
    'Categorias Financeiras',
    'Formas de Pagamento',
    'Bancos e Contas',
    'Relatório DRE'
  ];

  const tabIcons = [
    Building2,
    Building,
    Users,
    Tag,
    CreditCard,
    Banknote,
    BarChart3
  ];

  useEffect(() => {
    if (selectedTab < 6) { // Don't fetch data for DRE tab
      fetchData();
    }
    // Always fetch financial categories for supplier form
    if (selectedTab === 1) {
      fetchFinancialCategories();
    }
  }, [selectedTab]);

  const fetchFinancialCategories = async () => {
    try {
      const { data, error } = await supabase
        .from('vw_categoria_tree')
        .select('*')
        .eq('tipo', 'despesa') // Only expense categories for suppliers
        .eq('status', 'ativo');

      if (error) throw error;
      setFinancialCategories(data || []);
    } catch (err) {
      console.error('Error fetching financial categories:', err);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      let tableName = '';
      let setter: any = null;
      
      switch (selectedTab) {
        case 0:
          tableName = 'centros_custo';
          setter = setCostCenters;
          break;
        case 1:
          tableName = 'fornecedores';
          setter = setSuppliers;
          break;
        case 2:
          tableName = 'clientes';
          setter = setCustomers;
          break;
        case 3:
          // Categories are handled by the FinancialCategories component
          return;
        case 4:
          tableName = 'formas_pagamento';
          setter = setPaymentMethods;
          break;
        case 5:
          tableName = 'vw_bancos_contas_saldo';
          setter = setBankAccounts;
          break;
      }

      if (tableName && setter) {
        const { data, error } = await supabase
          .from(tableName)
          .select('*')
          .order('criado_em', { ascending: false });
          
        if (error) throw error;
        setter(data || []);
      }
    } catch (err) {
      console.error('Error fetching data:', err);
      setError(err instanceof Error ? err.message : 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    setLoading(true);
    setError(null);
    
    try {
      let tableName = '';
      
      switch (selectedTab) {
        case 0: tableName = 'centros_custo'; break;
        case 1: tableName = 'fornecedores'; break;
        case 2: tableName = 'clientes'; break;
        case 4: tableName = 'formas_pagamento'; break;
        case 5: tableName = 'bancos_contas'; break;
      }
      
      // Prepare data for saving
      const dataToSave = { ...formData };
      
      // Convert numeric fields for bank accounts
      if (selectedTab === 5) {
        dataToSave.saldo_inicial = parseFloat(dataToSave.saldo_inicial) || 0;
        dataToSave.saldo_atual = parseFloat(dataToSave.saldo_atual) || 0;
      }
      
      if (editingItem) {
        const { error } = await supabase
          .from(tableName)
          .update({ ...dataToSave, atualizado_em: new Date().toISOString() })
          .eq('id', editingItem.id);
          
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from(tableName)
          .insert([dataToSave]);
          
        if (error) throw error;
      }
      
      setShowForm(false);
      setEditingItem(null);
      setFormData({});
      fetchData();
    } catch (err) {
      console.error('Error saving data:', err);
      setError(err instanceof Error ? err.message : 'Erro ao salvar dados');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este item?')) return;
    
    setLoading(true);
    setError(null);
    
    try {
      let tableName = '';
      
      switch (selectedTab) {
        case 0: tableName = 'centros_custo'; break;
        case 1: tableName = 'fornecedores'; break;
        case 2: tableName = 'clientes'; break;
        case 4: tableName = 'formas_pagamento'; break;
        case 5: tableName = 'bancos_contas'; break;
      }
      
      const { error } = await supabase
        .from(tableName)
        .delete()
        .eq('id', id);
        
      if (error) throw error;
      fetchData();
    } catch (err) {
      console.error('Error deleting data:', err);
      setError(err instanceof Error ? err.message : 'Erro ao excluir item');
    } finally {
      setLoading(false);
    }
  };

  const toggleStatus = async (item: any) => {
    const newStatus = item.status === 'ativo' ? 'inativo' : 'ativo';
    
    setLoading(true);
    setError(null);
    
    try {
      let tableName = '';
      
      switch (selectedTab) {
        case 0: tableName = 'centros_custo'; break;
        case 1: tableName = 'fornecedores'; break;
        case 2: tableName = 'clientes'; break;
        case 4: tableName = 'formas_pagamento'; break;
        case 5: tableName = 'bancos_contas'; break;
      }
      
      const { error } = await supabase
        .from(tableName)
        .update({ status: newStatus, atualizado_em: new Date().toISOString() })
        .eq('id', item.id);
        
      if (error) throw error;
      fetchData();
    } catch (err) {
      console.error('Error updating status:', err);
      setError(err instanceof Error ? err.message : 'Erro ao atualizar status');
    } finally {
      setLoading(false);
    }
  };

  const openForm = (item?: any) => {
    if (item) {
      setEditingItem(item);
      setFormData({ ...item });
    } else {
      setEditingItem(null);
      setFormData({
        status: 'ativo',
        ...(selectedTab === 1 && { tipo: 'geral' }),
        ...(selectedTab === 2 && { tipo: 'fisico', recorrente: false }),
        ...(selectedTab === 4 && { prazo_padrao: 0 }),
        ...(selectedTab === 5 && { tipo_conta: 'corrente', saldo_inicial: 0, saldo_atual: 0 })
      });
    }
    setShowForm(true);
  };

  const exportData = () => {
    // Implementation for CSV/Excel export
    console.log('Export functionality to be implemented');
  };

  const getCurrentData = () => {
    switch (selectedTab) {
      case 0: return costCenters;
      case 1: return suppliers;
      case 2: return customers;
      case 4: return paymentMethods;
      case 5: return bankAccounts;
      default: return [];
    }
  };

  const filteredData = getCurrentData().filter(item => {
    const matchesSearch = item.nome?.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         item.banco?.toLowerCase().includes(searchTerm.toLowerCase()) || false;
    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getCategoryName = (categoryId: string) => {
    const category = financialCategories.find(cat => cat.id === categoryId);
    return category ? category.caminho_completo || category.nome : '';
  };

  const renderForm = () => {
    const fields = getFormFields();
    
    return (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
        <div className="bg-[#0f1020] rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
          <h3 className="text-lg font-medium text-white mb-4">
            {editingItem ? 'Editar' : 'Novo'} {tabTitles[selectedTab]}
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {fields.map((field) => (
              <div key={field.name} className={field.fullWidth ? 'md:col-span-2' : ''}>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-1">*</span>}
                </label>
                {field.type === 'select' ? (
                  <select
                    value={formData[field.name] || ''}
                    onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                    className="w-full rounded-md bg-[#12141f]/5 border-white/20 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                    required={field.required}
                  >
                    {field.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : field.type === 'textarea' ? (
                  <textarea
                    value={formData[field.name] || ''}
                    onChange={(e) => setFormData({ ...formData, [field.name]: e.target.value })}
                    className="w-full rounded-md bg-[#12141f]/5 border-white/20 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                    rows={3}
                    required={field.required}
                  />
                ) : field.type === 'checkbox' ? (
                  <input
                    type="checkbox"
                    checked={formData[field.name] || false}
                    onChange={(e) => setFormData({ ...formData, [field.name]: e.target.checked })}
                    className="rounded border-white/20 text-[#7D1F2C] focus:ring-[#7D1F2C]"
                  />
                ) : (
                  <input
                    type={field.type}
                    value={formData[field.name] ?? ''}
                    onChange={(e) => setFormData({ ...formData, [field.name]: field.type === 'number' ? (e.target.value === '' ? null : parseFloat(e.target.value)) : e.target.value })}
                    className="w-full rounded-md bg-[#12141f]/5 border-white/20 text-white shadow-sm focus:border-[#7D1F2C] focus:ring focus:ring-[#7D1F2C] focus:ring-opacity-50"
                    required={field.required}
                    step={field.type === 'number' ? '1' : undefined}
                    min={field.type === 'number' ? '1' : undefined}
                  />
                )}
                {(field as any).helpText && (
                  <p className="mt-1 text-xs text-white/40">{(field as any).helpText}</p>
                )}
              </div>
            ))}
          </div>
          
          <div className="mt-6 flex justify-end space-x-3">
            <button
              onClick={() => setShowForm(false)}
              className="px-4 py-2 border border-white/20 rounded-md text-white/80 hover:bg-[#12141f]/5"
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              disabled={loading || !formData.nome && !formData.banco}
              className="px-4 py-2 bg-[#7D1F2C] text-white rounded-md hover:bg-[#6a1a25] disabled:opacity-50"
            >
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const getFormFields = () => {
    switch (selectedTab) {
      case 0: // Centro de Custo
        return [
          { name: 'nome', label: 'Nome', type: 'text', required: true },
          { name: 'descricao', label: 'Descrição', type: 'textarea', fullWidth: true },
          { name: 'status', label: 'Status', type: 'select', required: true, options: [
            { value: 'ativo', label: 'Ativo' },
            { value: 'inativo', label: 'Inativo' }
          ]}
        ];
      case 1: // Fornecedores
        return [
          { name: 'nome', label: 'Nome', type: 'text', required: true },
          { name: 'cnpj', label: 'CNPJ', type: 'text' },
          { name: 'telefone', label: 'Telefone', type: 'text' },
          { name: 'email', label: 'E-mail', type: 'email' },
          { name: 'responsavel', label: 'Responsável', type: 'text' },
          { name: 'tipo', label: 'Tipo de Fornecedor', type: 'select', required: true, options: [
            { value: 'geral', label: 'Geral (Aparece em todos os contextos)' },
            { value: 'musico', label: '🎵 Músico/Artista (Apenas aba Músicos)' },
            { value: 'rh', label: '👥 RH/Colaborador (Apenas aba RH)' }
          ]},
          {
            name: 'categoria_padrao_id',
            label: 'Categoria Padrão',
            type: 'select',
            options: [
              { value: '', label: 'Selecione uma categoria...' },
              ...financialCategories.map(cat => ({
                value: cat.id,
                label: cat.caminho_completo || cat.nome
              }))
            ]
          },
          { name: 'ciclo_compra_dias', label: 'Ciclo de compra (dias)', type: 'number', helpText: 'Deixe vazio para compra diária' },
          { name: 'endereco', label: 'Endereço', type: 'textarea', fullWidth: true },
          { name: 'observacoes', label: 'Observações', type: 'textarea', fullWidth: true },
          { name: 'status', label: 'Status', type: 'select', required: true, options: [
            { value: 'ativo', label: 'Ativo' },
            { value: 'inativo', label: 'Inativo' }
          ]}
        ];
      case 2: // Clientes
        return [
          { name: 'nome', label: 'Nome', type: 'text', required: true },
          { name: 'documento', label: 'CPF/CNPJ', type: 'text' },
          { name: 'telefone', label: 'Telefone', type: 'text' },
          { name: 'email', label: 'E-mail', type: 'email' },
          { name: 'cidade', label: 'Cidade', type: 'text' },
          { name: 'tipo', label: 'Tipo', type: 'select', required: true, options: [
            { value: 'fisico', label: 'Pessoa Física' },
            { value: 'juridico', label: 'Pessoa Jurídica' }
          ]},
          { name: 'recorrente', label: 'Cliente Recorrente', type: 'checkbox' },
          { name: 'observacoes', label: 'Observações', type: 'textarea', fullWidth: true },
          { name: 'status', label: 'Status', type: 'select', required: true, options: [
            { value: 'ativo', label: 'Ativo' },
            { value: 'inativo', label: 'Inativo' }
          ]}
        ];
      case 4: // Formas de Pagamento
        return [
          { name: 'nome', label: 'Nome', type: 'text', required: true },
          { name: 'prazo_padrao', label: 'Prazo Padrão (dias)', type: 'number', required: true },
          { name: 'observacoes', label: 'Observações', type: 'textarea', fullWidth: true },
          { name: 'status', label: 'Status', type: 'select', required: true, options: [
            { value: 'ativo', label: 'Ativo' },
            { value: 'inativo', label: 'Inativo' }
          ]}
        ];
      case 5: // Bancos e Contas
        return [
          { name: 'banco', label: 'Banco/Instituição', type: 'text', required: true },
          { name: 'tipo_conta', label: 'Tipo de Conta', type: 'select', required: true, options: [
            { value: 'corrente', label: 'Conta Corrente' },
            { value: 'poupanca', label: 'Poupança' },
            { value: 'investimento', label: 'Investimento' },
            { value: 'cofre', label: 'Cofre (Dinheiro em Espécie)' }
          ]},
          { name: 'numero_conta', label: 'Número da Conta', type: 'text' },
          { name: 'agencia', label: 'Agência', type: 'text' },
          { name: 'titular', label: 'Titular', type: 'text' },
          { name: 'documento_titular', label: 'CPF/CNPJ do Titular', type: 'text' },
          { name: 'saldo_inicial', label: 'Saldo Inicial', type: 'number' },
          { name: 'saldo_atual', label: 'Saldo Atual', type: 'number' },
          { name: 'status', label: 'Status', type: 'select', required: true, options: [
            { value: 'ativo', label: 'Ativo' },
            { value: 'inativo', label: 'Inativo' }
          ]}
        ];
      default:
        return [];
    }
  };

  const renderTable = () => {
    const columns = getTableColumns();

    return (
      <div className="overflow-x-auto shadow-sm border border-white/10 rounded-lg">
        <table className="w-full min-w-max">
          <thead>
            <tr className="text-left bg-[#12141f]/5">
              {columns.map((column) => (
                <th key={column.key} className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider sticky left-0 bg-[#12141f]/5 z-10">
                  {column.label}
                </th>
              ))}
              <th className="px-6 py-3 text-xs font-medium text-white/40 uppercase tracking-wider sticky right-0 bg-[#12141f]/5 z-10">
                Ações
              </th>
            </tr>
          </thead>
          <tbody className="bg-[#12141f] divide-y divide-white/10">
            {filteredData.map((item) => (
              <tr key={item.id} className="hover:bg-[#12141f]/5">
                {columns.map((column) => (
                  <td key={column.key} className="px-6 py-4 whitespace-nowrap text-sm">
                    {column.render ? column.render(item) : item[column.key]}
                  </td>
                ))}
                <td className="px-6 py-4 whitespace-nowrap sticky right-0 bg-[#12141f]">
                  <div className="flex space-x-2">
                    <button
                      onClick={() => openForm(item)}
                      className="text-[#7D1F2C] hover:text-[#6a1a25]"
                      title="Editar"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => toggleStatus(item)}
                      className={`${item.status === 'ativo' ? 'text-green-400' : 'text-white/30'} hover:opacity-75`}
                      title={item.status === 'ativo' ? 'Desativar' : 'Ativar'}
                    >
                      {item.status === 'ativo' ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleDelete(item.id)}
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
    );
  };

  const getTableColumns = () => {
    switch (selectedTab) {
      case 0: // Centro de Custo
        return [
          { key: 'nome', label: 'Nome' },
          { key: 'descricao', label: 'Descrição' },
          { 
            key: 'status', 
            label: 'Status',
            render: (item: any) => (
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                item.status === 'ativo' ? 'text-emerald-400 bg-emerald-500/20' : 'text-red-400 bg-red-500/20'
              }`}>
                {item.status === 'ativo' ? 'Ativo' : 'Inativo'}
              </span>
            )
          }
        ];
      case 1: // Fornecedores
        return [
          { key: 'nome', label: 'Nome' },
          {
            key: 'tipo',
            label: 'Tipo',
            render: (item: any) => {
              const tipoMap = {
                'geral': { label: 'Geral', icon: '', color: 'bg-[#12141f]/10 text-white/80' },
                'musico': { label: 'Músico', icon: '🎵', color: 'bg-blue-500/15 text-blue-400' },
                'rh': { label: 'RH', icon: '👥', color: 'bg-purple-500/15 text-purple-400' }
              };
              const tipo = tipoMap[item.tipo as keyof typeof tipoMap] || tipoMap.geral;
              return (
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${tipo.color}`}>
                  {tipo.icon} {tipo.label}
                </span>
              );
            }
          },
          { key: 'cnpj', label: 'CNPJ' },
          { key: 'telefone', label: 'Telefone' },
          { key: 'email', label: 'E-mail' },
          { key: 'responsavel', label: 'Responsável' },
          {
            key: 'categoria_padrao_id',
            label: 'Categoria Padrão',
            render: (item: any) => (
              <span className="text-sm text-white/60">
                {item.categoria_padrao_id ? getCategoryName(item.categoria_padrao_id) : '-'}
              </span>
            )
          },
          {
            key: 'status',
            label: 'Status',
            render: (item: any) => (
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                item.status === 'ativo' ? 'text-emerald-400 bg-emerald-500/20' : 'text-red-400 bg-red-500/20'
              }`}>
                {item.status === 'ativo' ? 'Ativo' : 'Inativo'}
              </span>
            )
          }
        ];
      case 2: // Clientes
        return [
          { key: 'nome', label: 'Nome' },
          { key: 'documento', label: 'CPF/CNPJ' },
          { key: 'telefone', label: 'Telefone' },
          { key: 'email', label: 'E-mail' },
          { 
            key: 'tipo', 
            label: 'Tipo',
            render: (item: any) => item.tipo === 'fisico' ? 'Pessoa Física' : 'Pessoa Jurídica'
          },
          { 
            key: 'recorrente', 
            label: 'Recorrente',
            render: (item: any) => item.recorrente ? <CheckCircle className="w-4 h-4 text-green-500" /> : <XCircle className="w-4 h-4 text-white/30" />
          },
          { 
            key: 'status', 
            label: 'Status',
            render: (item: any) => (
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                item.status === 'ativo' ? 'text-emerald-400 bg-emerald-500/20' : 'text-red-400 bg-red-500/20'
              }`}>
                {item.status === 'ativo' ? 'Ativo' : 'Inativo'}
              </span>
            )
          }
        ];
      case 4: // Formas de Pagamento
        return [
          { key: 'nome', label: 'Nome' },
          { 
            key: 'prazo_padrao', 
            label: 'Prazo Padrão',
            render: (item: any) => `${item.prazo_padrao} dias`
          },
          { key: 'observacoes', label: 'Observações' },
          { 
            key: 'status', 
            label: 'Status',
            render: (item: any) => (
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                item.status === 'ativo' ? 'text-emerald-400 bg-emerald-500/20' : 'text-red-400 bg-red-500/20'
              }`}>
                {item.status === 'ativo' ? 'Ativo' : 'Inativo'}
              </span>
            )
          }
        ];
      case 5: // Bancos e Contas
        return [
          { 
            key: 'banco', 
            label: 'Banco/Instituição',
            render: (item: any) => (
              <div className="flex items-center">
                {item.tipo_conta === 'cofre' && <Vault className="w-4 h-4 mr-2 text-[#7D1F2C]" />}
                <span>{item.banco}</span>
              </div>
            )
          },
          { 
            key: 'tipo_conta', 
            label: 'Tipo',
            render: (item: any) => {
              const tipos = {
                corrente: 'Conta Corrente',
                poupanca: 'Poupança',
                investimento: 'Investimento',
                cofre: 'Cofre (Espécie)'
              };
              return (
                <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                  item.tipo_conta === 'cofre' ? 'text-orange-400 bg-orange-500/20' : 'text-blue-400 bg-blue-500/20'
                }`}>
                  {tipos[item.tipo_conta as keyof typeof tipos] || item.tipo_conta}
                </span>
              );
            }
          },
          { key: 'numero_conta', label: 'Conta' },
          { key: 'agencia', label: 'Agência' },
          { key: 'titular', label: 'Titular' },
          { 
            key: 'saldo_atual', 
            label: 'Saldo Atual',
            render: (item: any) => (
              <span className={`font-medium ${
                item.saldo_atual >= 0 ? 'text-green-400' : 'text-red-400'
              }`}>
                R$ {item.saldo_atual?.toFixed(2) || '0,00'}
              </span>
            )
          },
          { 
            key: 'status', 
            label: 'Status',
            render: (item: any) => (
              <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                item.status === 'ativo' ? 'text-emerald-400 bg-emerald-500/20' : 'text-red-400 bg-red-500/20'
              }`}>
                {item.status === 'ativo' ? 'Ativo' : 'Inativo'}
              </span>
            )
          }
        ];
      default:
        return [];
    }
  };

  // If Financial Categories tab is selected, render the FinancialCategories component
  if (selectedTab === 3) {
    return (
      <div className="min-h-screen bg-[#0d0f1a]">
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold text-white/90">Cadastros Gerais</h2>
          </div>

          <Tab.Group selectedIndex={selectedTab} onChange={(index) => setSelectedTab(index)}>
            <Tab.List className="flex space-x-1 rounded-xl bg-[#12141f] p-1 mb-6 shadow overflow-x-auto">
              {tabTitles.map((title, index) => {
                const Icon = tabIcons[index];
                return (
                  <Tab
                    key={title}
                    className={({ selected }) =>
                      `flex items-center whitespace-nowrap rounded-lg py-2.5 px-4 text-sm font-medium leading-5 transition-all
                      ${selected
                        ? 'bg-[#7D1F2C] text-white shadow'
                        : 'text-white/80 hover:bg-[#12141f]/10 hover:text-white'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {title}
                  </Tab>
                );
              })}
            </Tab.List>

            <Tab.Panels>
              {tabTitles.map((title, index) => (
                <Tab.Panel key={title} className="rounded-xl bg-[#12141f] p-6 shadow">
                  {index === 3 ? (
                    <FinancialCategories />
                  ) : index === 6 ? (
                    <DRESimplificado />
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-white/40">Conteúdo em desenvolvimento</p>
                    </div>
                  )}
                </Tab.Panel>
              ))}
            </Tab.Panels>
          </Tab.Group>
        </div>
      </div>
    );
  }

  // If DRE Report tab is selected, render the DRESimplificado component
  if (selectedTab === 6) {
    return (
      <div className="min-h-screen bg-[#0d0f1a]">
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-semibold text-white/90">Cadastros Gerais</h2>
          </div>

          <Tab.Group selectedIndex={selectedTab} onChange={(index) => setSelectedTab(index)}>
            <Tab.List className="flex space-x-1 rounded-xl bg-[#12141f] p-1 mb-6 shadow overflow-x-auto">
              {tabTitles.map((title, index) => {
                const Icon = tabIcons[index];
                return (
                  <Tab
                    key={title}
                    className={({ selected }) =>
                      `flex items-center whitespace-nowrap rounded-lg py-2.5 px-4 text-sm font-medium leading-5 transition-all
                      ${selected
                        ? 'bg-[#7D1F2C] text-white shadow'
                        : 'text-white/80 hover:bg-[#12141f]/10 hover:text-white'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {title}
                  </Tab>
                );
              })}
            </Tab.List>

            <Tab.Panels>
              {tabTitles.map((title, index) => (
                <Tab.Panel key={title} className="rounded-xl bg-[#12141f] p-6 shadow">
                  {index === 3 ? (
                    <FinancialCategories />
                  ) : index === 6 ? (
                    <DRESimplificado />
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-white/40">Conteúdo em desenvolvimento</p>
                    </div>
                  )}
                </Tab.Panel>
              ))}
            </Tab.Panels>
          </Tab.Group>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0d0f1a]">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-semibold text-white/90">Cadastros Gerais</h2>
          <div className="flex gap-2">
            <button 
              onClick={exportData}
              className="px-4 py-2 bg-[#12141f] border border-white/20 rounded-lg text-white/80 hover:bg-[#12141f]/5"
            >
              <Download className="w-4 h-4 inline mr-2" />
              Exportar
            </button>
            {selectedTab < 6 && selectedTab !== 3 && (
              <button 
                onClick={() => openForm()}
                className="px-4 py-2 bg-[#7D1F2C] text-white rounded-lg hover:bg-[#6a1a25]"
              >
                <Plus className="w-4 h-4 inline mr-2" />
                Novo {tabTitles[selectedTab]}
              </button>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/20 text-red-400 rounded-lg">
            {error}
          </div>
        )}

        <Tab.Group selectedIndex={selectedTab} onChange={setSelectedTab}>
          <Tab.List className="flex space-x-1 rounded-xl bg-[#12141f] p-1 mb-6 shadow overflow-x-auto">
            {tabTitles.map((title, index) => {
              const Icon = tabIcons[index];
              return (
                <Tab
                  key={title}
                  className={({ selected }) =>
                    `flex items-center whitespace-nowrap rounded-lg py-2.5 px-4 text-sm font-medium leading-5 transition-all
                    ${selected
                      ? 'bg-[#7D1F2C] text-white shadow'
                      : 'text-white/80 hover:bg-[#12141f]/10 hover:text-white'
                    }`
                  }
                >
                  <Icon className="w-4 h-4 mr-2" />
                  {title}
                </Tab>
              );
            })}
          </Tab.List>

          <Tab.Panels>
            {tabTitles.map((title, index) => (
              <Tab.Panel key={title} className="rounded-xl bg-[#12141f] p-6 shadow">
                {index === 3 ? (
                  <FinancialCategories />
                ) : index === 6 ? (
                  <DRESimplificado />
                ) : (
                  <>
                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row gap-4 mb-6">
                      <div className="flex-1">
                        <div className="relative">
                          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-white/30 w-5 h-5" />
                          <input
                            type="text"
                            placeholder={`Buscar ${title.toLowerCase()}...`}
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 bg-[#12141f]/5 border border-white/20 rounded-lg text-white placeholder-white/30 focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                          />
                        </div>
                      </div>
                      <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="border border-white/20 rounded-lg px-4 py-2 focus:ring-2 focus:ring-[#7D1F2C] focus:border-[#7D1F2C]"
                      >
                        <option value="all">Todos os Status</option>
                        <option value="ativo">Ativo</option>
                        <option value="inativo">Inativo</option>
                      </select>
                    </div>

                    {/* Loading State */}
                    {loading ? (
                      <div className="flex justify-center items-center h-64">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#7D1F2C]"></div>
                      </div>
                    ) : (
                      <>
                        {/* Table */}
                        {filteredData.length > 0 ? (
                          renderTable()
                        ) : (
                          <div className="text-center py-8">
                            <FileText className="w-12 h-12 text-white/30 mx-auto mb-4" />
                            <p className="text-white/40">
                              {searchTerm || statusFilter !== 'all' 
                                ? 'Nenhum resultado encontrado' 
                                : `Nenhum ${title.toLowerCase()} cadastrado`
                              }
                            </p>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}
              </Tab.Panel>
            ))}
          </Tab.Panels>
        </Tab.Group>

        {/* Form Modal */}
        {showForm && renderForm()}
      </div>
    </div>
  );
};

export default GeneralRegistrations;