import React, { useState, useEffect } from 'react';
import { Upload, Plus, Search, CreditCard as Edit2, Trash2, Download, Check, X, AlertCircle, FileSpreadsheet, TrendingUp, Archive, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import * as XLSX from 'xlsx';
import { SearchableSelect } from '../common/SearchableSelect';

interface Mapeamento {
  id: string;
  nome_item_externo: string;
  estoque_id: string | null;
  ficha_tecnica_id: string | null;
  tipo_origem: string;
  ativo: boolean;
  confianca: number;
  total_usos: number;
  ultimo_uso: string | null;
  metadata: any;
  criado_em: string;
  atualizado_em: string;
  item_estoque?: {
    nome: string;
    unidade_medida: string;
  } | null;
  ficha_tecnica?: {
    nome: string;
    tipo_consumo: string;
  } | null;
}

interface ItemEstoque {
  id: string;
  nome: string;
  unidade_medida: string;
  categoria?: string;
}

interface FichaTecnica {
  id: string;
  nome: string;
  tipo_consumo: string;
  custo_total: number;
}

export default function MapeamentoItensExcel() {
  const [mapeamentos, setMapeamentos] = useState<Mapeamento[]>([]);
  const [itensEstoque, setItensEstoque] = useState<ItemEstoque[]>([]);
  const [fichasTecnicas, setFichasTecnicas] = useState<FichaTecnica[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [tipoFiltro, setTipoFiltro] = useState<string>('todos');
  const [showAddModal, setShowAddModal] = useState(false);
  const [showImportModal, setShowImportModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Estado do formulário
  const [formData, setFormData] = useState({
    nome_item_externo: '',
    estoque_id: '',
    tipo_mapeamento: 'item' as 'item' | 'ficha_tecnica',
    tipo_origem: 'vendas',
    confianca: 100,
    observacoes: ''
  });

  // Estado da importação
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any[]>([]);
  const [importErrors, setImportErrors] = useState<any[]>([]);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    carregarDados();
  }, []);

  const carregarDados = async () => {
    setLoading(true);
    try {
      await Promise.all([
        carregarMapeamentos(),
        carregarItensEstoque(),
        carregarFichasTecnicas()
      ]);
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
    } finally {
      setLoading(false);
    }
  };

  const carregarMapeamentos = async () => {
    const { data, error } = await supabase
      .from('mapeamentos_itens_excel')
      .select(`
        *,
        item_estoque:itens_estoque(nome, unidade_medida),
        ficha_tecnica:fichas_tecnicas(nome, tipo_consumo)
      `)
      .eq('ativo', true)
      .order('total_usos', { ascending: false });

    if (error) {
      console.error('Erro ao carregar mapeamentos:', error);
      return;
    }

    setMapeamentos(data || []);
  };

  const carregarItensEstoque = async () => {
    const { data, error } = await supabase
      .from('itens_estoque')
      .select('id, nome, unidade_medida, categoria')
      .eq('status', 'ativo')
      .order('nome');

    if (error) {
      console.error('Erro ao carregar itens do estoque:', error);
      return;
    }

    console.log('Itens de estoque carregados:', data?.length);
    setItensEstoque(data || []);
  };

  const carregarFichasTecnicas = async () => {
    const { data, error } = await supabase
      .from('fichas_tecnicas')
      .select('id, nome, tipo_consumo, custo_total')
      .eq('ativo', true)
      .order('nome');

    if (error) {
      console.error('Erro ao carregar fichas técnicas:', error);
      return;
    }

    console.log('Fichas técnicas carregadas:', data?.length);
    setFichasTecnicas(data || []);
  };

  const handleAddMapeamento = async () => {
    if (!formData.nome_item_externo || !formData.estoque_id) {
      alert('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      const metadata = formData.observacoes ? { observacoes: formData.observacoes } : {};

      // Preparar dados baseado no tipo de mapeamento
      const dados: any = {
        nome_item_externo: formData.nome_item_externo,
        tipo_origem: formData.tipo_origem,
        confianca: formData.confianca,
        metadata
      };

      // Adicionar estoque_id ou ficha_tecnica_id baseado no tipo
      if (formData.tipo_mapeamento === 'ficha_tecnica') {
        dados.ficha_tecnica_id = formData.estoque_id;
        dados.estoque_id = null;
      } else {
        dados.estoque_id = formData.estoque_id;
        dados.ficha_tecnica_id = null;
      }

      const { error } = await supabase
        .from('mapeamentos_itens_excel')
        .insert(dados);

      if (error) throw error;

      alert('Mapeamento adicionado com sucesso!');
      setShowAddModal(false);
      resetForm();
      await carregarMapeamentos();
    } catch (error: any) {
      console.error('Erro ao adicionar mapeamento:', error);
      alert('Erro ao adicionar mapeamento: ' + error.message);
    }
  };

  const handleUpdateMapeamento = async (id: string) => {
    if (!formData.nome_item_externo || !formData.estoque_id) {
      alert('Preencha todos os campos obrigatórios');
      return;
    }

    try {
      const metadata = formData.observacoes ? { observacoes: formData.observacoes } : {};

      // Preparar dados baseado no tipo de mapeamento
      const dados: any = {
        nome_item_externo: formData.nome_item_externo,
        tipo_origem: formData.tipo_origem,
        confianca: formData.confianca,
        metadata
      };

      // Adicionar estoque_id ou ficha_tecnica_id baseado no tipo
      if (formData.tipo_mapeamento === 'ficha_tecnica') {
        dados.ficha_tecnica_id = formData.estoque_id;
        dados.estoque_id = null;
      } else {
        dados.estoque_id = formData.estoque_id;
        dados.ficha_tecnica_id = null;
      }

      const { error } = await supabase
        .from('mapeamentos_itens_excel')
        .update(dados)
        .eq('id', id);

      if (error) throw error;

      alert('Mapeamento atualizado com sucesso!');
      setEditingId(null);
      resetForm();
      await carregarMapeamentos();
    } catch (error: any) {
      console.error('Erro ao atualizar mapeamento:', error);
      alert('Erro ao atualizar mapeamento: ' + error.message);
    }
  };

  const handleDeleteMapeamento = async (id: string) => {
    if (!confirm('Deseja realmente desativar este mapeamento?')) return;

    try {
      const { error } = await supabase
        .from('mapeamentos_itens_excel')
        .update({ ativo: false })
        .eq('id', id);

      if (error) throw error;

      alert('Mapeamento desativado com sucesso!');
      await carregarMapeamentos();
    } catch (error: any) {
      console.error('Erro ao desativar mapeamento:', error);
      alert('Erro ao desativar mapeamento: ' + error.message);
    }
  };

  const handleEditClick = (mapeamento: Mapeamento) => {
    const ehFichaTecnica = mapeamento.ficha_tecnica_id !== null;
    setFormData({
      nome_item_externo: mapeamento.nome_item_externo,
      estoque_id: ehFichaTecnica ? mapeamento.ficha_tecnica_id : mapeamento.estoque_id || '',
      tipo_mapeamento: ehFichaTecnica ? 'ficha_tecnica' : 'item',
      tipo_origem: mapeamento.tipo_origem,
      confianca: mapeamento.confianca,
      observacoes: mapeamento.metadata?.observacoes || ''
    });
    setEditingId(mapeamento.id);
    setShowAddModal(true);
  };

  const resetForm = () => {
    setFormData({
      nome_item_externo: '',
      estoque_id: '',
      tipo_mapeamento: 'item',
      tipo_origem: 'vendas',
      confianca: 100,
      observacoes: ''
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportFile(file);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      setImportPreview(jsonData.slice(0, 10));
      setShowImportModal(true);
    } catch (error) {
      console.error('Erro ao ler arquivo:', error);
      alert('Erro ao ler arquivo Excel');
    }
  };

  const handleImportarMapeamentos = async () => {
    if (!importFile) return;

    setImporting(true);
    try {
      const data = await importFile.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json(worksheet);

      const mapeamentosJson = jsonData.map((row: any) => ({
        nome_externo: row['Nome Externo'] || row['nome_externo'],
        nome_estoque: row['Nome no Estoque'] || row['nome_estoque'],
        confianca: row['Confiança'] || row['confianca'] || 100,
        metadata: {
          observacoes: row['Observações'] || row['observacoes'] || ''
        }
      }));

      const { data: resultado, error } = await supabase
        .rpc('importar_mapeamentos_excel', {
          p_mapeamentos: mapeamentosJson,
          p_tipo_origem: formData.tipo_origem
        });

      if (error) throw error;

      if (resultado && resultado.length > 0) {
        const res = resultado[0];
        alert(
          `Importação concluída!\n\n` +
          `✅ Novos: ${res.total_importados}\n` +
          `🔄 Atualizados: ${res.total_atualizados}\n` +
          `❌ Erros: ${res.total_erros}`
        );

        if (res.total_erros > 0) {
          setImportErrors(res.erros);
        }
      }

      await carregarMapeamentos();

      if (!importErrors.length) {
        setShowImportModal(false);
        setImportFile(null);
        setImportPreview([]);
      }
    } catch (error: any) {
      console.error('Erro ao importar mapeamentos:', error);
      alert('Erro ao importar mapeamentos: ' + error.message);
    } finally {
      setImporting(false);
    }
  };

  const handleDownloadModelo = () => {
    const modelo = [
      {
        'Nome Externo': 'COCA COLA 2L',
        'Nome no Estoque': 'Coca-Cola 2 Litros',
        'Confiança': 100,
        'Observações': 'Refrigerante'
      },
      {
        'Nome Externo': 'PICANHA 1KG',
        'Nome no Estoque': 'Picanha',
        'Confiança': 100,
        'Observações': 'Corte especial'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(modelo);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mapeamentos');
    XLSX.writeFile(wb, 'modelo_mapeamentos.xlsx');
  };

  const handleExportarMapeamentos = () => {
    const dadosExport = mapeamentos.map(m => ({
      'Nome Externo': m.nome_item_externo,
      'Nome no Estoque': m.item_estoque?.nome || '',
      'Unidade': m.item_estoque?.unidade_medida || '',
      'Tipo Origem': m.tipo_origem,
      'Confiança': m.confianca,
      'Total Usos': m.total_usos,
      'Último Uso': m.ultimo_uso ? new Date(m.ultimo_uso).toLocaleString('pt-BR') : '-',
      'Observações': m.metadata?.observacoes || ''
    }));

    const ws = XLSX.utils.json_to_sheet(dadosExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Mapeamentos');
    XLSX.writeFile(wb, `mapeamentos_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const mapeamentosFiltrados = mapeamentos.filter(m => {
    const matchSearch = m.nome_item_externo.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        m.item_estoque?.nome.toLowerCase().includes(searchTerm.toLowerCase());
    const matchTipo = tipoFiltro === 'todos' || m.tipo_origem === tipoFiltro;
    return matchSearch && matchTipo;
  });

  const estatisticas = {
    total: mapeamentos.length,
    vendas: mapeamentos.filter(m => m.tipo_origem === 'vendas').length,
    compras: mapeamentos.filter(m => m.tipo_origem === 'compras').length,
    producao: mapeamentos.filter(m => m.tipo_origem === 'producao').length,
    totalUsos: mapeamentos.reduce((acc, m) => acc + m.total_usos, 0)
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-400" />
          <p className="text-white/50">Carregando mapeamentos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#12141f] rounded-lg shadow p-6 border border-white/10">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Mapeamento de Itens</h2>
            <p className="text-sm text-white/50 mt-1">
              Gerencie mapeamentos entre nomes externos (Excel, vendas) e itens do estoque
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleDownloadModelo}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-white/10 text-white/80 rounded-lg hover:bg-gray-200"
            >
              <Download className="w-4 h-4" />
              Baixar Modelo
            </button>
            <label className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer">
              <Upload className="w-4 h-4" />
              Importar Excel
              <input
                type="file"
                accept=".xlsx,.xls"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <button
              onClick={() => {
                resetForm();
                setEditingId(null);
                setShowAddModal(true);
              }}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              <Plus className="w-4 h-4" />
              Adicionar
            </button>
          </div>
        </div>

        {/* Estatísticas */}
        <div className="grid grid-cols-5 gap-4">
          <div className="bg-blue-500/10 rounded-lg p-4">
            <div className="flex items-center gap-2 text-blue-400 mb-1">
              <FileSpreadsheet className="w-4 h-4" />
              <span className="text-xs font-medium">Total</span>
            </div>
            <p className="text-2xl font-bold text-blue-300">{estatisticas.total}</p>
          </div>
          <div className="bg-green-500/10 rounded-lg p-4">
            <div className="flex items-center gap-2 text-green-400 mb-1">
              <TrendingUp className="w-4 h-4" />
              <span className="text-xs font-medium">Vendas</span>
            </div>
            <p className="text-2xl font-bold text-green-300">{estatisticas.vendas}</p>
          </div>
          <div className="bg-purple-500/10 rounded-lg p-4">
            <div className="flex items-center gap-2 text-purple-400 mb-1">
              <Archive className="w-4 h-4" />
              <span className="text-xs font-medium">Compras</span>
            </div>
            <p className="text-2xl font-bold text-purple-300">{estatisticas.compras}</p>
          </div>
          <div className="bg-orange-500/10 rounded-lg p-4">
            <div className="flex items-center gap-2 text-orange-400 mb-1">
              <RefreshCw className="w-4 h-4" />
              <span className="text-xs font-medium">Produção</span>
            </div>
            <p className="text-2xl font-bold text-orange-300">{estatisticas.producao}</p>
          </div>
          <div className="bg-white/5 rounded-lg p-4">
            <div className="flex items-center gap-2 text-white/80 mb-1">
              <Check className="w-4 h-4" />
              <span className="text-xs font-medium">Total Usos</span>
            </div>
            <p className="text-2xl font-bold text-white">{estatisticas.totalUsos}</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-[#12141f] rounded-lg shadow p-4 border border-white/10">
        <div className="flex gap-4">
          <div className="flex-1 relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-white/30" />
            <input
              type="text"
              placeholder="Buscar por nome externo ou item do estoque..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          <select
            value={tipoFiltro}
            onChange={(e) => setTipoFiltro(e.target.value)}
            className="px-4 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            <option value="todos">Todos os Tipos</option>
            <option value="vendas">Vendas</option>
            <option value="compras">Compras</option>
            <option value="producao">Produção</option>
          </select>
          <button
            onClick={handleExportarMapeamentos}
            className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white/80 rounded-lg hover:bg-gray-200"
          >
            <Download className="w-4 h-4" />
            Exportar
          </button>
        </div>
      </div>

      {/* Lista de Mapeamentos */}
      <div className="bg-[#12141f] rounded-lg shadow overflow-hidden border border-white/10">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-white/5">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                  Nome Externo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                  Item do Estoque
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                  Tipo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                  Confiança
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                  Usos
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wider">
                  Último Uso
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-white/40 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-[#12141f] divide-y divide-white/5">
              {mapeamentosFiltrados.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-white/40">
                    <FileSpreadsheet className="w-12 h-12 mx-auto mb-3 text-white/30" />
                    <p className="font-medium">Nenhum mapeamento encontrado</p>
                    <p className="text-sm mt-1">
                      {searchTerm || tipoFiltro !== 'todos'
                        ? 'Tente ajustar os filtros'
                        : 'Adicione seu primeiro mapeamento ou importe via Excel'}
                    </p>
                  </td>
                </tr>
              ) : (
                mapeamentosFiltrados.map((mapeamento) => (
                  <tr key={mapeamento.id} className="hover:bg-white/10/5">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-white">
                        {mapeamento.nome_item_externo}
                      </div>
                      {mapeamento.metadata?.observacoes && (
                        <div className="text-xs text-white/40">
                          {mapeamento.metadata.observacoes}
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-white">
                        {mapeamento.item_estoque?.nome || mapeamento.ficha_tecnica?.nome}
                      </div>
                      <div className="text-xs text-white/40">
                        {mapeamento.item_estoque
                          ? mapeamento.item_estoque.unidade_medida
                          : mapeamento.ficha_tecnica
                          ? `Ficha Técnica - ${mapeamento.ficha_tecnica.tipo_consumo}`
                          : '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                        mapeamento.tipo_origem === 'vendas' ? 'bg-green-500/15 text-green-300' :
                        mapeamento.tipo_origem === 'compras' ? 'bg-purple-500/15 text-purple-300' :
                        'bg-orange-500/15 text-orange-300'
                      }`}>
                        {mapeamento.tipo_origem}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-1 h-2 bg-gray-200 rounded-full overflow-hidden mr-2">
                          <div
                            className={`h-full ${
                              mapeamento.confianca === 100 ? 'bg-green-500/100' :
                              mapeamento.confianca >= 70 ? 'bg-blue-500/100' :
                              'bg-yellow-500/100'
                            }`}
                            style={{ width: `${mapeamento.confianca}%` }}
                          />
                        </div>
                        <span className="text-xs text-white/50">{mapeamento.confianca}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                      {mapeamento.total_usos}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white/40">
                      {mapeamento.ultimo_uso
                        ? new Date(mapeamento.ultimo_uso).toLocaleDateString('pt-BR')
                        : '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleEditClick(mapeamento)}
                        className="text-blue-400 hover:text-blue-300 mr-3"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteMapeamento(mapeamento.id)}
                        className="text-red-400 hover:text-red-300"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Adicionar/Editar */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0f1020] rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-white/10">
            <div className="p-6">
              <h3 className="text-lg font-bold text-white mb-4">
                {editingId ? 'Editar Mapeamento' : 'Adicionar Mapeamento'}
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Nome Externo *
                  </label>
                  <input
                    type="text"
                    value={formData.nome_item_externo}
                    onChange={(e) => setFormData({ ...formData, nome_item_externo: e.target.value })}
                    placeholder="Ex: COCA COLA 2L"
                    className="w-full px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-white/40 mt-1">
                    Nome como aparece no arquivo Excel ou sistema externo
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Tipo de Mapeamento *
                  </label>
                  <div className="flex gap-4">
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="item"
                        checked={formData.tipo_mapeamento === 'item'}
                        onChange={(e) => setFormData({ ...formData, tipo_mapeamento: 'item', estoque_id: '' })}
                        className="mr-2"
                      />
                      Item de Estoque
                    </label>
                    <label className="flex items-center">
                      <input
                        type="radio"
                        value="ficha_tecnica"
                        checked={formData.tipo_mapeamento === 'ficha_tecnica'}
                        onChange={(e) => setFormData({ ...formData, tipo_mapeamento: 'ficha_tecnica', estoque_id: '' })}
                        className="mr-2"
                      />
                      Ficha Técnica
                    </label>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    {formData.tipo_mapeamento === 'item' ? 'Item do Estoque' : 'Ficha Técnica'} *
                  </label>
                  <SearchableSelect
                    options={
                      formData.tipo_mapeamento === 'item'
                        ? itensEstoque.map(item => ({
                            value: item.id,
                            label: `${item.nome}`,
                            sublabel: `${item.unidade_medida} ${item.categoria ? '• ' + item.categoria : ''}`
                          }))
                        : fichasTecnicas.map(ficha => ({
                            value: ficha.id,
                            label: `${ficha.nome}`,
                            sublabel: `${ficha.tipo_consumo} • R$ ${ficha.custo_total.toFixed(2)}`
                          }))
                    }
                    value={formData.estoque_id}
                    onChange={(value) => setFormData({ ...formData, estoque_id: value })}
                    placeholder={`Buscar ${formData.tipo_mapeamento === 'item' ? 'item no estoque' : 'ficha técnica'}...`}
                    emptyMessage={
                      formData.tipo_mapeamento === 'item'
                        ? itensEstoque.length === 0
                          ? 'Nenhum item de estoque cadastrado'
                          : 'Nenhum item encontrado'
                        : fichasTecnicas.length === 0
                        ? 'Nenhuma ficha técnica cadastrada'
                        : 'Nenhuma ficha encontrada'
                    }
                  />
                  <p className="text-xs text-white/40 mt-1">
                    {formData.tipo_mapeamento === 'item'
                      ? `${itensEstoque.length} itens disponíveis`
                      : `${fichasTecnicas.length} fichas disponíveis`}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-1">
                      Tipo de Origem
                    </label>
                    <select
                      value={formData.tipo_origem}
                      onChange={(e) => setFormData({ ...formData, tipo_origem: e.target.value })}
                      className="w-full px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="vendas">Vendas</option>
                      <option value="compras">Compras</option>
                      <option value="producao">Produção</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white/80 mb-1">
                      Confiança (%)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={formData.confianca}
                      onChange={(e) => setFormData({ ...formData, confianca: parseInt(e.target.value) || 0 })}
                      className="w-full px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white/80 mb-1">
                    Observações
                  </label>
                  <textarea
                    value={formData.observacoes}
                    onChange={(e) => setFormData({ ...formData, observacoes: e.target.value })}
                    rows={3}
                    className="w-full px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Informações adicionais..."
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  onClick={() => {
                    setShowAddModal(false);
                    setEditingId(null);
                    resetForm();
                  }}
                  className="px-4 py-2 text-sm text-white/80 hover:bg-white/10/10 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  onClick={() => editingId ? handleUpdateMapeamento(editingId) : handleAddMapeamento()}
                  className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  {editingId ? 'Atualizar' : 'Adicionar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Importar */}
      {showImportModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-[#0f1020] rounded-lg shadow-xl max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto border border-white/10">
            <div className="p-6">
              <h3 className="text-lg font-bold text-white mb-4">
                Importar Mapeamentos via Excel
              </h3>

              <div className="mb-4">
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Tipo de Origem
                </label>
                <select
                  value={formData.tipo_origem}
                  onChange={(e) => setFormData({ ...formData, tipo_origem: e.target.value })}
                  className="w-full px-3 py-2 border border-white/20 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="vendas">Vendas</option>
                  <option value="compras">Compras</option>
                  <option value="producao">Produção</option>
                </select>
              </div>

              {importErrors.length > 0 && (
                <div className="mb-4 p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <h4 className="font-medium text-red-300 mb-2">
                        Erros na Importação ({importErrors.length})
                      </h4>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {importErrors.map((erro, idx) => (
                          <div key={idx} className="text-sm text-red-300">
                            <strong>{erro.nome_externo}</strong> → {erro.erro}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="mb-4">
                <h4 className="font-medium text-white mb-2">
                  Preview (primeiras 10 linhas)
                </h4>
                <div className="overflow-x-auto border border-white/10 rounded-lg">
                  <table className="min-w-full divide-y divide-white/10">
                    <thead className="bg-white/5">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-white/40">
                          Nome Externo
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-white/40">
                          Nome no Estoque
                        </th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-white/40">
                          Confiança
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-[#12141f] divide-y divide-white/5">
                      {importPreview.map((row: any, idx) => (
                        <tr key={idx}>
                          <td className="px-4 py-2 text-sm text-white">
                            {row['Nome Externo'] || row['nome_externo']}
                          </td>
                          <td className="px-4 py-2 text-sm text-white">
                            {row['Nome no Estoque'] || row['nome_estoque']}
                          </td>
                          <td className="px-4 py-2 text-sm text-white">
                            {row['Confiança'] || row['confianca'] || 100}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 mb-4">
                <h4 className="font-medium text-blue-300 mb-2">Formato do Excel</h4>
                <p className="text-sm text-blue-300">
                  O arquivo deve conter as colunas: <strong>Nome Externo</strong>, <strong>Nome no Estoque</strong>,
                  <strong>Confiança</strong> (opcional), <strong>Observações</strong> (opcional)
                </p>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => {
                    setShowImportModal(false);
                    setImportFile(null);
                    setImportPreview([]);
                    setImportErrors([]);
                  }}
                  className="px-4 py-2 text-sm text-white/80 hover:bg-white/10/10 rounded-lg"
                  disabled={importing}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleImportarMapeamentos}
                  disabled={importing}
                  className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {importing ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Importando...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Confirmar Importação
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
