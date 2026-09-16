import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, CreditCard as Edit, Trash2, Eye, EyeOff, Package, DollarSign, AlertTriangle, CheckCircle, Download, Target, X, ClipboardX } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { exportToExcel } from '../../utils/reportGenerator';
import { formatarQuantidade } from '../../utils/formatarQuantidade';
import dayjs from 'dayjs';

// ── Grupos de contagem (espelha o banco) ──────────────────────────────────────
const GRUPOS_CONTAGEM = [
  { value: 'bebidas',          label: '🍺 Bebidas'       },
  { value: 'alimentos',       label: '🥩 Alimentos'     },
  { value: 'hortifruti',      label: '🥦 Hortifruti'    },
  { value: 'estoque_seco',    label: '🌾 Estoque Seco'  },
  { value: 'estoque_central', label: '📦 Central'       },
  { value: 'outros',          label: '🗂️ Outros'        },
];

// Cabeçalho de bloco por categoria dentro da tabela
const LinhaCategoria = ({ nome, total, colunas }: { nome: string; total: number; colunas: number }) => (
  <tr className="bg-wine/20 border-y border-white/10">
    <td colSpan={colunas} className="px-4 py-2">
      <span className="text-xs font-bold uppercase tracking-wider text-white/90">{nome}</span>
      <span className="ml-2 px-2 py-0.5 text-[10px] font-medium rounded-full bg-white/10 text-white/70">{total}</span>
    </td>
  </tr>
);

interface ItemEstoque {
  id: string;
  nome: string;
  codigo?: string;
  descricao?: string;
  tipo_item?: string;
  categoria?: string;
  unidade_medida: string;
  custo_medio: number;
  status: string;
  estoque_minimo: number;
  ponto_reposicao?: number;
  tem_validade?: boolean;
  observacoes?: string;
  estoque_nativo_id?: string;
  tipo_compra?: string;
  fornecedor_padrao_id?: string;
  grupo_contagem?: string;
  ignorar_contagem?: boolean;
  entra_no_cmv?: boolean;
  minimo_manual?: boolean;
  criado_em: string;
  atualizado_em: string;
  quantidade_total?: number;
  valor_total_estoque?: number;
}

// Linha de fn_reposicao_central (valores numéricos já convertidos com Number())
interface ReposicaoCentral {
  item_id: string;
  ciclo_dias: number | null;
  saldo_central: number;
  consumo_dia: number;
  cobertura_dias: number | null;
  ponto_pedido: number;
  quantidade_sugerida: number;
  criterio: 'ponto' | 'sem_ponto';
  situacao: 'zerado' | 'comprar' | 'atencao' | 'ok';
}

const CRITERIO_BADGE: Record<ReposicaoCentral['criterio'], { label: string; cls: string }> = {
  ponto:     { label: 'ponto de pedido', cls: 'bg-blue-500/15 text-blue-300' },
  sem_ponto: { label: 'sem ponto',       cls: 'bg-white/10 text-white/50' },
};

const SITUACAO_DOT: Record<ReposicaoCentral['situacao'], { title: string; cls: string }> = {
  zerado:  { title: 'Zerado no Central',  cls: 'bg-red-500' },
  comprar: { title: 'Abaixo do ponto',    cls: 'bg-amber-500' },
  atencao: { title: 'No ponto',           cls: 'bg-yellow-400' },
  ok:      { title: 'OK',                 cls: 'bg-green-500' },
};

const fmtNum = (n: number | null | undefined, digits = 2) =>
  n == null || isNaN(n) ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: digits });

interface FormData {
  nome: string;
  codigo: string;
  descricao: string;
  tipo_item: 'insumo' | 'produto_final';
  categoria: string;
  unidade_medida: string;
  custo_medio: number;
  tem_validade: boolean;
  observacoes: string;
  status: 'ativo' | 'inativo';
  estoque_minimo: number;
  ponto_reposicao: number;
  estoque_nativo_id: string;
  tipo_compra: 'fornecedor' | 'rua' | 'ambos';
  fornecedor_padrao_id: string;
  grupo_contagem: string;
  ignorar_contagem: boolean;
  entra_no_cmv: boolean;
  minimo_manual: boolean;
}

interface IndicadoresItens {
  total_itens: number;
  itens_ativos: number;
  itens_inativos: number;
  valor_medio_item: number;
  itens_sem_custo: number;
  unidades_medida_unicas: number;
}

const ItensEstoque: React.FC = () => {
  const [itens, setItens]             = useState<ItemEstoque[]>([]);
  const [estoques, setEstoques]       = useState<{ id: string; nome: string }[]>([]);
  const [fornecedores, setFornecedores] = useState<{ id: string; nome: string }[]>([]);
  const [indicadores, setIndicadores] = useState<IndicadoresItens | null>(null);
  const [loading, setLoading]         = useState(true);
  const [error, setError]             = useState<string | null>(null);
  const [showForm, setShowForm]       = useState(false);
  const [editingItem, setEditingItem] = useState<ItemEstoque | null>(null);
  // Reposição calculada pelo Estoque Central, indexada por item_id
  const [reposicao, setReposicao]     = useState<Record<string, ReposicaoCentral>>({});

  // Filtros
  const [searchTerm, setSearchTerm]       = useState('');
  // Qual lista está aberta: botão "Ativos" ou "Inativos"
  const [statusFilter, setStatusFilter]   = useState<'ativo' | 'inativo'>('ativo');
  const [unidadeFilter, setUnidadeFilter] = useState('all');
  const [custoFilter, setCustoFilter]     = useState<'all' | 'sem_custo' | 'com_custo'>('all');
  const [estoqueFilter, setEstoqueFilter] = useState('all');
  const [grupoFilter, setGrupoFilter]     = useState('all');
  const [ignorarFilter, setIgnorarFilter] = useState<'all' | 'ignorados' | 'nao_ignorados'>('all');

  const hasActiveFilters = unidadeFilter !== 'all' || custoFilter !== 'all'
    || searchTerm !== '' || estoqueFilter !== 'all' || grupoFilter !== 'all' || ignorarFilter !== 'all';

  const clearAllFilters = () => {
    setSearchTerm(''); setUnidadeFilter('all');
    setCustoFilter('all'); setEstoqueFilter('all'); setGrupoFilter('all'); setIgnorarFilter('all');
    localStorage.removeItem('itensEstoque_filters');
    fetchData();
  };

  const [formData, setFormData] = useState<FormData>({
    nome: '', codigo: '', descricao: '', tipo_item: 'insumo', categoria: 'Geral',
    unidade_medida: 'unidade', custo_medio: 0, tem_validade: false, observacoes: '',
    status: 'ativo', estoque_minimo: 0, ponto_reposicao: 0,
    estoque_nativo_id: '', tipo_compra: 'ambos', fornecedor_padrao_id: '',
    grupo_contagem: 'outros', ignorar_contagem: false, entra_no_cmv: true,
    minimo_manual: false,
  });

  const categoriasPredefinidas = [
    'Geral','Bebidas','Bebidas Alcoólicas','Bebidas Não Alcoólicas','Carnes',
    'Frutos do Mar','Vegetais','Temperos e Condimentos','Laticínios','Grãos e Cereais',
    'Massas','Pães e Padaria','Doces e Sobremesas','Óleos e Gorduras',
    'Produtos de Limpeza','Descartáveis','Utensílios','Equipamentos',
    'Material de Escritório','Uniformes','Outros',
  ];

  const unidadesMedida = [
    'unidade','kg','g','litro','ml','metro','cm','dúzia','caixa','pacote','lata','garrafa',
  ];

  const [showNewCategoryInput, setShowNewCategoryInput] = useState(false);
  const [newCategoryName, setNewCategoryName]           = useState('');

  useEffect(() => {
    const saved = localStorage.getItem('itensEstoque_filters');
    if (saved) {
      try {
        const f = JSON.parse(saved);
        setStatusFilter(f.statusFilter === 'inativo' ? 'inativo' : 'ativo');
        if (f.unidadeFilter)  setUnidadeFilter(f.unidadeFilter);
        if (f.custoFilter)    setCustoFilter(f.custoFilter);
        if (f.estoqueFilter)  setEstoqueFilter(f.estoqueFilter);
        if (f.grupoFilter)    setGrupoFilter(f.grupoFilter);
        if (f.ignorarFilter)  setIgnorarFilter(f.ignorarFilter);
      } catch { /* filtros salvos inválidos — ignora */ }
    }
    fetchData(); fetchIndicadores(); fetchEstoques(); fetchFornecedores(); fetchReposicao();
  }, []);

  // Os dois status vêm carregados de uma vez; os botões Ativos/Inativos só
  // trocam a lista mostrada, sem ir ao banco.
  useEffect(() => {
    localStorage.setItem('itensEstoque_filters', JSON.stringify({
      statusFilter, unidadeFilter, custoFilter, estoqueFilter, grupoFilter, ignorarFilter,
    }));
  }, [statusFilter, unidadeFilter, custoFilter, estoqueFilter, grupoFilter, ignorarFilter]);

  useEffect(() => {
    if (estoques.length > 0) fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unidadeFilter, custoFilter, estoqueFilter, grupoFilter, ignorarFilter]);

  const fetchData = async () => {
    try {
      setLoading(true); setError(null);
      let query = supabase.from('itens_estoque').select('*');
      if (unidadeFilter !== 'all')    query = query.eq('unidade_medida', unidadeFilter);
      if (grupoFilter !== 'all')      query = query.eq('grupo_contagem', grupoFilter);
      if (ignorarFilter === 'ignorados')     query = query.eq('ignorar_contagem', true);
      if (ignorarFilter === 'nao_ignorados') query = query.eq('ignorar_contagem', false);
      if (custoFilter === 'sem_custo') query = query.eq('custo_medio', 0);
      if (custoFilter === 'com_custo') query = query.gt('custo_medio', 0);

      const { data, error } = await query.order('nome');
      if (error) throw error;

      let saldosQuery = supabase.from('saldos_estoque').select('item_id, quantidade_atual, valor_total, estoque_id');
      if (estoqueFilter !== 'all') saldosQuery = saldosQuery.eq('estoque_id', estoqueFilter);
      const { data: saldosData, error: saldosError } = await saldosQuery;
      if (saldosError) throw saldosError;

      const saldosPorItem = (saldosData || []).reduce((acc: Record<string, { quantidade_total: number; valor_total: number }>, s) => {
        if (!acc[s.item_id]) acc[s.item_id] = { quantidade_total: 0, valor_total: 0 };
        acc[s.item_id].quantidade_total += parseFloat(s.quantidade_atual || 0);
        acc[s.item_id].valor_total      += parseFloat(s.valor_total || 0);
        return acc;
      }, {});

      setItens((data || []).map(item => ({
        ...item,
        quantidade_total:    saldosPorItem[item.id]?.quantidade_total || 0,
        valor_total_estoque: saldosPorItem[item.id]?.valor_total || 0,
      })));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar itens');
    } finally { setLoading(false); }
  };

  const fetchFornecedores = async () => {
    const { data } = await supabase.from('fornecedores').select('id, nome').eq('status', 'ativo').order('nome');
    setFornecedores(data || []);
  };

  // Carrega o cálculo de reposição do Estoque Central uma vez e indexa por item
  const fetchReposicao = async () => {
    const { data, error } = await supabase.rpc('fn_reposicao_central');
    if (error) { console.error('fn_reposicao_central:', error); return; }
    const idx: Record<string, ReposicaoCentral> = {};
    (data || []).forEach((r: Record<string, unknown>) => {
      const id = String(r.item_id);
      idx[id] = {
        item_id:        id,
        ciclo_dias:     r.ciclo_dias == null ? null : Number(r.ciclo_dias),
        saldo_central:  Number(r.saldo_central ?? 0),
        consumo_dia:    Number(r.consumo_dia ?? 0),
        cobertura_dias: r.cobertura_dias == null ? null : Number(r.cobertura_dias),
        ponto_pedido:   Number(r.ponto_pedido ?? 0),
        quantidade_sugerida: Number(r.quantidade_sugerida ?? 0),
        criterio:       (r.criterio as ReposicaoCentral['criterio']) || 'sem_ponto',
        situacao:       (r.situacao as ReposicaoCentral['situacao']) || 'ok',
      };
    });
    setReposicao(idx);
  };

  const fetchEstoques = async () => {
    const { data } = await supabase.from('estoques').select('id, nome').eq('status', true).order('nome');
    setEstoques(data || []);
  };

  const fetchIndicadores = async () => {
    const { data } = await supabase.from('itens_estoque').select('*');
    if (!data) return;
    const total = data.length;
    setIndicadores({
      total_itens:           total,
      itens_ativos:          data.filter(i => i.status === 'ativo').length,
      itens_inativos:        data.filter(i => i.status !== 'ativo').length,
      valor_medio_item:      total > 0 ? data.reduce((s, i) => s + (i.custo_medio || 0), 0) / total : 0,
      itens_sem_custo:       data.filter(i => (i.custo_medio || 0) === 0).length,
      unidades_medida_unicas: new Set(data.map(i => i.unidade_medida)).size,
    });
  };

  const handleSave = async () => {
    try {
      setLoading(true); setError(null);
      if (!formData.nome || !formData.unidade_medida) throw new Error('Preencha todos os campos obrigatórios');

      const dataToSave = {
        ...formData,
        custo_medio:        parseFloat(formData.custo_medio.toString()) || 0,
        // Um ponto só: o "estoque mínimo" antigo acompanha o ponto de pedido.
        estoque_minimo:     parseFloat(formData.ponto_reposicao.toString()) || 0,
        ponto_reposicao:    parseFloat(formData.ponto_reposicao.toString()) || 0,
        estoque_nativo_id:  formData.estoque_nativo_id  || null,
        fornecedor_padrao_id: formData.fornecedor_padrao_id || null,
        minimo_manual:      true,
      };

      if (editingItem) {
        const { error } = await supabase.from('itens_estoque')
          .update({ ...dataToSave, atualizado_em: new Date().toISOString() }).eq('id', editingItem.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('itens_estoque').insert([dataToSave]);
        if (error) throw error;
      }
      setShowForm(false); setEditingItem(null); resetForm(); fetchData(); fetchIndicadores(); fetchReposicao();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao salvar item');
    } finally { setLoading(false); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir este item?')) return;
    try {
      setLoading(true);
      const { error } = await supabase.from('itens_estoque').delete().eq('id', id);
      if (error) throw error;
      fetchData(); fetchIndicadores();
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro ao excluir item'); }
    finally { setLoading(false); }
  };

  const toggleStatus = async (item: ItemEstoque) => {
    try {
      setLoading(true);
      const { error } = await supabase.from('itens_estoque')
        .update({ status: item.status === 'ativo' ? 'inativo' : 'ativo', atualizado_em: new Date().toISOString() })
        .eq('id', item.id);
      if (error) throw error;
      fetchData(); fetchIndicadores();
    } catch (err) { setError(err instanceof Error ? err.message : 'Erro ao atualizar status'); }
    finally { setLoading(false); }
  };

  // Toggle rápido de ignorar_contagem direto na tabela
  const toggleIgnorarContagem = async (item: ItemEstoque) => {
    try {
      const { error } = await supabase.from('itens_estoque')
        .update({ ignorar_contagem: !item.ignorar_contagem, atualizado_em: new Date().toISOString() })
        .eq('id', item.id);
      if (error) throw error;
      setItens(prev => prev.map(i => i.id === item.id ? { ...i, ignorar_contagem: !i.ignorar_contagem } : i));
    } catch { setError('Erro ao atualizar configuração de contagem'); }
  };

  const openForm = (item?: ItemEstoque) => {
    if (item) {
      setEditingItem(item);
      setFormData({
        nome:               item.nome,
        codigo:             item.codigo || '',
        descricao:          item.descricao || '',
        tipo_item:          (item.tipo_item as FormData['tipo_item']) || 'insumo',
        categoria:          item.categoria || 'Geral',
        unidade_medida:     item.unidade_medida,
        custo_medio:        item.custo_medio || 0,
        tem_validade:       item.tem_validade || false,
        observacoes:        item.observacoes || '',
        status:             item.status as FormData['status'],
        estoque_minimo:     item.estoque_minimo || 0,
        ponto_reposicao:    item.ponto_reposicao || 0,
        estoque_nativo_id:  item.estoque_nativo_id || '',
        tipo_compra:        (item.tipo_compra as FormData['tipo_compra']) || 'ambos',
        fornecedor_padrao_id: item.fornecedor_padrao_id || '',
        grupo_contagem:     item.grupo_contagem || 'outros',
        ignorar_contagem:   item.ignorar_contagem || false,
        entra_no_cmv:       item.entra_no_cmv !== false,
        minimo_manual:      item.minimo_manual === true,
      });
    } else {
      setEditingItem(null); resetForm();
    }
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      nome: '', codigo: '', descricao: '', tipo_item: 'insumo', categoria: 'Geral',
      unidade_medida: 'unidade', custo_medio: 0, tem_validade: false, observacoes: '',
      status: 'ativo', estoque_minimo: 0, ponto_reposicao: 0,
      estoque_nativo_id: '', tipo_compra: 'ambos', fornecedor_padrao_id: '',
      grupo_contagem: 'outros', ignorar_contagem: false, entra_no_cmv: true,
      minimo_manual: false,
    });
    setShowNewCategoryInput(false); setNewCategoryName('');
  };

  const handleCategoryChange = (value: string) => {
    if (value === 'nova_categoria') { setShowNewCategoryInput(true); setNewCategoryName(''); }
    else { setFormData({ ...formData, categoria: value }); setShowNewCategoryInput(false); }
  };

  const handleNewCategoryConfirm = () => {
    if (newCategoryName.trim()) {
      setFormData({ ...formData, categoria: newCategoryName.trim() });
      setShowNewCategoryInput(false); setNewCategoryName('');
    }
  };

  const filteredItens = itens.filter(item =>
    item.nome.toLowerCase().includes(searchTerm.toLowerCase())
  );
  // Ativos e inativos ficam em seções separadas: o inativo não se perde no
  // meio da lista e quem procura um item desligado acha de cara.
  const itensAtivos   = filteredItens.filter(i => i.status === 'ativo');
  const itensInativos = filteredItens.filter(i => i.status !== 'ativo');

  // Blocos por categoria (ordem alfabética; itens já vêm ordenados por nome)
  const agruparPorCategoria = (lista: ItemEstoque[]): [string, ItemEstoque[]][] => {
    const grupos: Record<string, ItemEstoque[]> = {};
    lista.forEach(i => {
      const cat = (i.categoria || 'Geral').trim() || 'Geral';
      (grupos[cat] ||= []).push(i);
    });
    return Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  };
  const blocosAtivos   = agruparPorCategoria(itensAtivos);
  const blocosInativos = agruparPorCategoria(itensInativos);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);

  const exportData = () => {
    // Exporta a lista que está na tela (Ativos ou Inativos)
    const lista = (statusFilter === 'ativo' ? blocosAtivos : blocosInativos).flatMap(([, l]) => l);
    if (lista.length === 0) { alert('Não há dados para exportar'); return; }
    const headers = ['Nome','Código','Tipo','Categoria','Grupo Contagem','Não Contar','Unidade',
                     'Custo Médio','Ponto de Pedido','Sugestão de compra','Critério','Situação','Validade','Status','Observações','Criado em'];
    const data = lista.map(item => [
      item.nome, item.codigo || '', item.tipo_item === 'insumo' ? 'Insumo' : 'Produto para Venda',
      item.categoria || 'Geral',
      GRUPOS_CONTAGEM.find(g => g.value === item.grupo_contagem)?.label || item.grupo_contagem || '',
      item.ignorar_contagem ? 'Sim' : 'Não',
      item.unidade_medida, item.custo_medio, item.ponto_reposicao ?? '',
      reposicao[item.id]?.quantidade_sugerida ?? '',
      reposicao[item.id] ? CRITERIO_BADGE[reposicao[item.id].criterio].label : '',
      reposicao[item.id]?.situacao ?? '',
      item.tem_validade ? 'Sim' : 'Não', item.status,
      item.observacoes || '', dayjs(item.criado_em).format('DD/MM/YYYY'),
    ]);
    exportToExcel(data, `itens-estoque-${dayjs().format('YYYY-MM-DD')}`, headers);
  };

  const grupoLabel = (v?: string) => GRUPOS_CONTAGEM.find(g => g.value === v)?.label || '🗂️ Outros';

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-medium text-white">Itens de Estoque</h3>
          <p className="text-sm text-white/60 mt-1">
            {estoqueFilter === 'all'
              ? 'Quantidades somadas de todos os estoques'
              : `Estoque: ${estoques.find(e => e.id === estoqueFilter)?.nome || ''}`}
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportData}
            className="px-4 py-2 bg-white/5 border border-white/20 rounded-lg text-white/80 hover:bg-white/10">
            <Download className="w-4 h-4 inline mr-2" />Exportar Excel
          </button>
          <button onClick={() => openForm()}
            className="px-4 py-2 bg-wine text-white rounded-lg hover:bg-[#6a1a25]">
            <Plus className="w-4 h-4 inline mr-2" />Novo Item
          </button>
        </div>
      </div>

      {error && <div className="p-4 bg-red-900/30 text-red-300 rounded-lg border border-red-500/30">{error}</div>}

      {/* Indicadores */}
      {indicadores && (
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          {[
            { icon: Package,       color: 'blue',   label: 'Total Itens',   value: indicadores.total_itens,           sub: 'Cadastrados' },
            { icon: CheckCircle,   color: 'green',  label: 'Ativos',        value: indicadores.itens_ativos,          sub: 'Em uso' },
            { icon: EyeOff,        color: 'gray',   label: 'Inativos',      value: indicadores.itens_inativos,        sub: 'Desabilitados' },
            { icon: DollarSign,    color: 'purple', label: 'Custo Médio',   value: formatCurrency(indicadores.valor_medio_item), sub: 'Por item' },
            { icon: AlertTriangle, color: 'orange', label: 'Sem Custo',     value: indicadores.itens_sem_custo,       sub: 'Precisam revisão' },
            { icon: Target,        color: 'teal',   label: 'Unidades',      value: indicadores.unidades_medida_unicas, sub: 'Diferentes' },
          ].map(({ icon: Icon, color, label, value, sub }) => (
            <div key={label} className="bg-[#12141f] p-5 rounded-lg shadow-sm border border-white/10">
              <div className="flex items-center">
                <Icon className={`w-7 h-7 text-${color}-600 mr-3`} />
                <div>
                  <p className="text-xs font-medium text-white/60">{label}</p>
                  <p className={`text-xl font-bold text-${color}-600`}>{value}</p>
                  <p className="text-xs text-white/60">{sub}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Aviso filtros ativos */}
      {hasActiveFilters && (
        <div className="bg-yellow-500/10 border-l-4 border-yellow-400 p-4 rounded flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-400" />
            <div>
              <p className="text-sm font-medium text-yellow-300">Filtros ativos — alguns itens podem estar ocultos</p>
              <p className="text-sm text-yellow-400">
                Mostrando {statusFilter === 'ativo' ? itensAtivos.length : itensInativos.length} {statusFilter === 'ativo' ? 'ativos' : 'inativos'} de {itens.length} itens
              </p>
            </div>
          </div>
          <button onClick={clearAllFilters}
            className="px-4 py-2 bg-yellow-600 text-white rounded-md hover:bg-yellow-700 text-sm font-medium">
            Limpar Filtros
          </button>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-[#12141f] p-4 rounded-lg border border-white/10">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-medium text-white/80 flex items-center gap-2">
            <Filter className="w-4 h-4" /> Filtros
            {hasActiveFilters && (
              <span className="px-2 py-0.5 bg-yellow-500/15 text-yellow-300 text-xs font-medium rounded-full">
                {[unidadeFilter!=='all', custoFilter!=='all',
                  estoqueFilter!=='all', grupoFilter!=='all', ignorarFilter!=='all', searchTerm!=='']
                  .filter(Boolean).length} ativo(s)
              </span>
            )}
          </h4>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {/* Busca */}
          <div className="col-span-2 md:col-span-2 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 w-4 h-4" />
            <input type="text" placeholder="Buscar itens..." value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className={`w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-wine ${searchTerm ? 'border-yellow-400 bg-yellow-500/10' : 'border-white/20'}`} />
          </div>
          {/* Estoque */}
          <select value={estoqueFilter} onChange={e => setEstoqueFilter(e.target.value)}
            className={`border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-wine ${estoqueFilter!=='all' ? 'border-yellow-400 bg-yellow-500/10' : 'border-white/20'}`}>
            <option value="all">Todos estoques</option>
            {estoques.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
          {/* Grupo contagem */}
          <select value={grupoFilter} onChange={e => setGrupoFilter(e.target.value)}
            className={`border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-wine ${grupoFilter!=='all' ? 'border-yellow-400 bg-yellow-500/10' : 'border-white/20'}`}>
            <option value="all">Todos grupos</option>
            {GRUPOS_CONTAGEM.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
          </select>
          {/* Ignorar contagem */}
          <select value={ignorarFilter} onChange={e => setIgnorarFilter(e.target.value as typeof ignorarFilter)}
            className={`border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-wine ${ignorarFilter!=='all' ? 'border-yellow-400 bg-yellow-500/10' : 'border-white/20'}`}>
            <option value="all">Contagem: todos</option>
            <option value="nao_ignorados">✅ Conta normalmente</option>
            <option value="ignorados">⊘ Não contar</option>
          </select>
          {/* Limpar */}
          {hasActiveFilters && (
            <button onClick={clearAllFilters}
              className="flex items-center justify-center gap-1.5 px-3 py-2 bg-white/10 text-white/50 rounded-lg hover:bg-gray-200 text-sm">
              <X className="w-3.5 h-3.5" /> Limpar
            </button>
          )}
        </div>
      </div>

      {/* Botões Ativos / Inativos: cada um abre a sua lista */}
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => setStatusFilter('ativo')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
            statusFilter === 'ativo'
              ? 'bg-green-500/15 text-green-300 border-green-500/40'
              : 'bg-white/5 text-white/60 border-white/15 hover:bg-white/10'
          }`}>
          <CheckCircle className="w-4 h-4" /> Ativos
          <span className={`px-2 py-0.5 text-xs rounded-full ${statusFilter === 'ativo' ? 'bg-green-900/40 text-green-200' : 'bg-white/10 text-white/60'}`}>
            {itensAtivos.length}
          </span>
        </button>
        <button type="button" onClick={() => setStatusFilter('inativo')}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold border transition-all ${
            statusFilter === 'inativo'
              ? 'bg-red-500/15 text-red-300 border-red-500/40'
              : 'bg-white/5 text-white/60 border-white/15 hover:bg-white/10'
          }`}>
          <EyeOff className="w-4 h-4" /> Inativos
          <span className={`px-2 py-0.5 text-xs rounded-full ${statusFilter === 'inativo' ? 'bg-red-900/40 text-red-200' : 'bg-white/10 text-white/60'}`}>
            {itensInativos.length}
          </span>
        </button>
        <span className="text-xs text-white/40 ml-2 hidden md:inline">
          {statusFilter === 'ativo' ? 'Contam, entram no Kardex e nas compras' : 'Não contam e não entram nas compras'}
        </span>
      </div>

      {/* Lista de itens ativos */}
      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-wine" />
        </div>
      ) : statusFilter === 'ativo' && (
        <div className="bg-[#12141f] rounded-lg border border-white/10 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left bg-white/5 border-b">
                  {['Item','Código','Tipo','Categoria','Grupo Contagem','Não Contar',
                    'Unidade','Custo Médio','Qtd.',`Valor Total`,'Ponto de pedido','Criado em','Ações']
                    .map(h => (
                      <th key={h} className="px-4 py-3 text-xs font-medium text-white/60 uppercase tracking-wider whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10">
                {blocosAtivos.map(([categoria, lista]) => (
                <React.Fragment key={categoria}>
                <LinhaCategoria nome={categoria} total={lista.length} colunas={13} />
                {lista.map(item => {
                  const rep = reposicao[item.id];
                  const limiteQtd = rep ? rep.ponto_pedido : item.estoque_minimo;
                  return (
                  <tr key={item.id} className={`hover:bg-white/10/5 ${item.ignorar_contagem ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-white text-sm">{item.nome}</div>
                      {item.descricao && <div className="text-xs text-white/40 truncate max-w-[160px]">{item.descricao}</div>}
                    </td>
                    <td className="px-4 py-3 text-sm text-white/50 whitespace-nowrap">{item.codigo || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${
                        item.tipo_item === 'insumo' ? 'text-blue-300 bg-blue-900/30' : 'text-green-300 bg-green-900/30'
                      }`}>
                        {item.tipo_item === 'insumo' ? 'Insumo' : 'Venda'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-white/50 whitespace-nowrap">{item.categoria || 'Geral'}</td>

                    {/* Grupo de contagem */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs text-white/80">{grupoLabel(item.grupo_contagem)}</span>
                    </td>

                    {/* Toggle rápido ignorar contagem */}
                    <td className="px-4 py-3 whitespace-nowrap text-center">
                      <button
                        onClick={() => toggleIgnorarContagem(item)}
                        title={item.ignorar_contagem ? 'Clique para incluir nas contagens' : 'Clique para excluir das contagens'}
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-all ${
                          item.ignorar_contagem
                            ? 'bg-red-500/10 text-red-400 border-red-500/30 hover:bg-red-500/15'
                            : 'bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/15'
                        }`}>
                        {item.ignorar_contagem
                          ? <><ClipboardX className="w-3 h-3" /> Não conta</>
                          : <><CheckCircle className="w-3 h-3" /> Conta</>}
                      </button>
                    </td>

                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-white/10 text-white/80">
                        {item.unidade_medida}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-sm font-medium ${item.custo_medio > 0 ? 'text-white' : 'text-orange-400'}`}>
                        {formatCurrency(item.custo_medio)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-sm font-medium ${(item.quantidade_total||0) < limiteQtd ? 'text-red-400' : 'text-white'}`}>
                        {formatarQuantidade(item.quantidade_total)} {item.unidade_medida}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-white/80">
                      {formatCurrency(item.valor_total_estoque || 0)}
                    </td>
                    {/* Ponto de pedido (calculado pelo Estoque Central) */}
                    <td className="px-4 py-3 whitespace-nowrap">
                      {rep ? (
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-2 h-2 rounded-full shrink-0 ${SITUACAO_DOT[rep.situacao].cls}`}
                            title={SITUACAO_DOT[rep.situacao].title}
                          />
                          <span className="text-sm text-white/80 tabular-nums">{fmtNum(rep.ponto_pedido, 3)}</span>
                          <span className={`px-1.5 py-0.5 text-[10px] font-medium rounded-full ${CRITERIO_BADGE[rep.criterio].cls}`}>
                            {CRITERIO_BADGE[rep.criterio].label}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-white/40" title="Sem cálculo do Central (item inativo ou sem dados)">
                          {item.ponto_reposicao || '—'}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-white/60">
                      {dayjs(item.criado_em).format('DD/MM/YYYY')}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex gap-1.5">
                        <button onClick={() => openForm(item)} className="text-blue-400 hover:text-blue-300" title="Editar">
                          <Edit className="w-4 h-4" />
                        </button>
                        <button onClick={() => toggleStatus(item)}
                          className="text-green-400 hover:opacity-75"
                          title="Desativar (vai para a seção Itens inativos)">
                          <Eye className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-300" title="Excluir">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
                </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {itensAtivos.length === 0 && (
            <div className="text-center py-12">
              <Package className="w-16 h-16 text-white/30 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-white mb-2">Nenhum item ativo encontrado</h3>
              {hasActiveFilters
                ? <button onClick={clearAllFilters} className="px-4 py-2 bg-wine text-white rounded-lg hover:bg-[#6a1a25]">
                    Limpar filtros
                  </button>
                : <p className="text-white/60">Nenhum item cadastrado.</p>}
            </div>
          )}
        </div>
      )}

      {/* Lista de itens inativos */}
      {!loading && statusFilter === 'inativo' && (
        <div className="bg-[#12141f] rounded-lg border border-white/10 overflow-hidden">
          {itensInativos.length === 0 ? (
              <div className="text-center py-12">
                <EyeOff className="w-16 h-16 text-white/30 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-white mb-2">Nenhum item inativo</h3>
                {hasActiveFilters
                  ? <button onClick={clearAllFilters} className="px-4 py-2 bg-wine text-white rounded-lg hover:bg-[#6a1a25]">
                      Limpar filtros
                    </button>
                  : <p className="text-white/60">Todos os itens estão ativos.</p>}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="text-left bg-white/5 border-b border-white/10">
                      {['Item','Código','Tipo','Categoria','Unidade','Custo Médio','Qtd.','Criado em','Ações'].map(h => (
                        <th key={h} className="px-4 py-3 text-xs font-medium text-white/50 uppercase tracking-wider whitespace-nowrap">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {blocosInativos.map(([categoria, lista]) => (
                    <React.Fragment key={categoria}>
                    <LinhaCategoria nome={categoria} total={lista.length} colunas={9} />
                    {lista.map(item => (
                      <tr key={item.id} className="hover:bg-white/5 text-white/60">
                        <td className="px-4 py-3">
                          <div className="font-medium text-sm text-white/80">{item.nome}</div>
                          {item.descricao && <div className="text-xs text-white/40 truncate max-w-[160px]">{item.descricao}</div>}
                        </td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap">{item.codigo || '-'}</td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap">{item.tipo_item === 'insumo' ? 'Insumo' : 'Venda'}</td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap">{item.categoria || 'Geral'}</td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap">{item.unidade_medida}</td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap">{formatCurrency(item.custo_medio)}</td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap">
                          {formatarQuantidade(item.quantidade_total)} {item.unidade_medida}
                        </td>
                        <td className="px-4 py-3 text-sm whitespace-nowrap">{dayjs(item.criado_em).format('DD/MM/YYYY')}</td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <button onClick={() => toggleStatus(item)}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border bg-green-500/10 text-green-400 border-green-500/30 hover:bg-green-500/15"
                              title="Reativar item">
                              <Eye className="w-3 h-3" /> Ativar
                            </button>
                            <button onClick={() => openForm(item)} className="text-blue-400 hover:text-blue-300" title="Editar">
                              <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={() => handleDelete(item.id)} className="text-red-400 hover:text-red-300" title="Excluir">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
        </div>
      )}

      {/* ── MODAL FORMULÁRIO ── */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1020] rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl border border-white/10">
            <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 sticky top-0 bg-[#0f1020] z-10">
              <h3 className="text-lg font-bold text-white">
                {editingItem ? 'Editar Item' : 'Novo Item'}
              </h3>
              <button onClick={() => setShowForm(false)} className="p-2 hover:bg-white/10/10 rounded-xl">
                <X className="w-5 h-5 text-white/30" />
              </button>
            </div>

            <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Nome */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-white/80 mb-1">Nome *</label>
                <input type="text" value={formData.nome}
                  onChange={e => setFormData({ ...formData, nome: e.target.value })}
                  className="w-full rounded-xl border-white/20 shadow-sm focus:border-wine focus:ring focus:ring-wine/20"
                  placeholder="Ex: Farinha de Trigo" required />
              </div>

              {/* Código */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Código</label>
                <input type="text" value={formData.codigo}
                  onChange={e => setFormData({ ...formData, codigo: e.target.value })}
                  className="w-full rounded-xl border-white/20 shadow-sm focus:border-wine focus:ring focus:ring-wine/20"
                  placeholder="Ex: FAR001" />
              </div>

              {/* Tipo */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Tipo *</label>
                <select value={formData.tipo_item}
                  onChange={e => setFormData({ ...formData, tipo_item: e.target.value as FormData['tipo_item'] })}
                  className="w-full rounded-xl border-white/20 shadow-sm focus:border-wine focus:ring focus:ring-wine/20">
                  <option value="insumo">Insumo</option>
                  <option value="produto_final">Produto para Venda</option>
                </select>
              </div>

              {/* Categoria */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Categoria *</label>
                {!showNewCategoryInput ? (
                  <select value={formData.categoria} onChange={e => handleCategoryChange(e.target.value)}
                    className="w-full rounded-xl border-white/20 shadow-sm focus:border-wine focus:ring focus:ring-wine/20">
                    {categoriasPredefinidas.map(c => <option key={c} value={c}>{c}</option>)}
                    <option value="nova_categoria">+ Criar nova categoria</option>
                  </select>
                ) : (
                  <div className="space-y-2">
                    <input type="text" value={newCategoryName}
                      onChange={e => setNewCategoryName(e.target.value)}
                      className="w-full rounded-xl border-white/20 shadow-sm focus:border-wine"
                      placeholder="Nome da categoria..." autoFocus />
                    <div className="flex gap-2">
                      <button type="button" onClick={handleNewCategoryConfirm}
                        disabled={!newCategoryName.trim()}
                        className="px-3 py-1 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:opacity-50">
                        Confirmar
                      </button>
                      <button type="button" onClick={() => { setShowNewCategoryInput(false); setNewCategoryName(''); setFormData({ ...formData, categoria: 'Geral' }); }}
                        className="px-3 py-1 bg-white/50 text-white text-sm rounded-lg hover:bg-gray-600">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* ★ GRUPO DE CONTAGEM */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">
                  Grupo de Contagem
                </label>
                <select value={formData.grupo_contagem}
                  onChange={e => setFormData({ ...formData, grupo_contagem: e.target.value })}
                  className="w-full rounded-xl border-white/20 shadow-sm focus:border-wine focus:ring focus:ring-wine/20">
                  {GRUPOS_CONTAGEM.map(g => <option key={g.value} value={g.value}>{g.label}</option>)}
                </select>
                <p className="text-xs text-white/60 mt-1">
                  Define em qual aba este item aparece durante a contagem.
                </p>
              </div>

              {/* Descrição */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-white/80 mb-1">Descrição</label>
                <textarea value={formData.descricao}
                  onChange={e => setFormData({ ...formData, descricao: e.target.value })}
                  className="w-full rounded-xl border-white/20 shadow-sm focus:border-wine focus:ring focus:ring-wine/20"
                  rows={2} placeholder="Descrição detalhada..." />
              </div>

              {/* Unidade de medida */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Unidade de Medida *</label>
                <select value={formData.unidade_medida}
                  onChange={e => setFormData({ ...formData, unidade_medida: e.target.value })}
                  className="w-full rounded-xl border-white/20 shadow-sm focus:border-wine focus:ring focus:ring-wine/20">
                  {unidadesMedida.map(u => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>

              {/* Custo médio */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Custo Médio</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/60 text-sm">R$</span>
                  <input type="number" step="0.01" min="0" value={formData.custo_medio}
                    onChange={e => setFormData({ ...formData, custo_medio: parseFloat(e.target.value) || 0 })}
                    className="pl-10 w-full rounded-xl border-white/20 shadow-sm focus:border-wine focus:ring focus:ring-wine/20" />
                </div>
              </div>

              {/* Ponto de pedido — a única régua de Compras */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-white/80 mb-1">Ponto de pedido (no Estoque Central)</label>
                <input type="number" step="0.001" min="0" value={formData.ponto_reposicao}
                  onChange={e => setFormData({ ...formData, ponto_reposicao: parseFloat(e.target.value) || 0 })}
                  className="w-full md:w-1/2 rounded-xl border-white/20 shadow-sm focus:border-wine focus:ring focus:ring-wine/20" />
                <p className="text-xs text-white/60 mt-1">
                  Quando o Central ficar <span className="text-white/90 font-medium">abaixo</span> desse número, o item entra em Compras.
                  Ex.: ponto 5 e tem 3 → aparece com sugestão de comprar 2 (repõe até o ponto). Com 5 não entra. Zero = não controla.
                </p>
              </div>

              {/* Calculado pelo sistema (somente ao editar) */}
              {editingItem && (() => {
                const rep = reposicao[editingItem.id];
                return (
                  <div className="md:col-span-2 bg-white/5 border border-white/10 rounded-xl p-3">
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="w-4 h-4 text-white/60" />
                      <p className="text-xs font-semibold text-white/60 uppercase tracking-wide">Calculado pelo sistema</p>
                      {rep && (
                        <span className={`ml-auto px-1.5 py-0.5 text-[10px] font-medium rounded-full ${CRITERIO_BADGE[rep.criterio].cls}`}>
                          {CRITERIO_BADGE[rep.criterio].label}
                        </span>
                      )}
                    </div>
                    {rep ? (
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                          { label: 'No Central',         value: `${fmtNum(rep.saldo_central, 3)} ${editingItem.unidade_medida}` },
                          { label: 'Consumo/dia',        value: `${fmtNum(rep.consumo_dia, 3)} ${editingItem.unidade_medida}` },
                          { label: 'Cobre',              value: rep.cobertura_dias == null ? '—' : `${fmtNum(rep.cobertura_dias, 1)} dias` },
                          { label: 'Sugestão de compra', value: `${fmtNum(rep.quantidade_sugerida, 3)} ${editingItem.unidade_medida}` },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <p className="text-[11px] text-white/50">{label}</p>
                            <p className="text-sm font-semibold text-white tabular-nums">{value}</p>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-white/50">Sem cálculo disponível para este item (inativo ou sem dados no Estoque Central).</p>
                    )}
                  </div>
                );
              })()}

              {/* Estoque nativo */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Estoque Nativo</label>
                <select value={formData.estoque_nativo_id}
                  onChange={e => setFormData({ ...formData, estoque_nativo_id: e.target.value })}
                  className="w-full rounded-xl border-white/20 shadow-sm focus:border-wine focus:ring focus:ring-wine/20">
                  <option value="">Sem estoque nativo</option>
                  {estoques.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
                </select>
              </div>

              {/* Tipo de compra */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Tipo de Compra *</label>
                <select value={formData.tipo_compra}
                  onChange={e => setFormData({ ...formData, tipo_compra: e.target.value as FormData['tipo_compra'] })}
                  className="w-full rounded-xl border-white/20 shadow-sm focus:border-wine focus:ring focus:ring-wine/20">
                  <option value="ambos">Ambos</option>
                  <option value="fornecedor">Apenas Fornecedor</option>
                  <option value="rua">Apenas Rua/Feira</option>
                </select>
              </div>

              {/* Fornecedor padrão */}
              <div>
                <label className="block text-sm font-medium text-white/80 mb-1">Fornecedor Padrão</label>
                <select value={formData.fornecedor_padrao_id}
                  onChange={e => setFormData({ ...formData, fornecedor_padrao_id: e.target.value })}
                  disabled={formData.tipo_compra === 'rua'}
                  className="w-full rounded-xl border-white/20 shadow-sm focus:border-wine focus:ring focus:ring-wine/20 disabled:opacity-50">
                  <option value="">Nenhum</option>
                  {fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                </select>
              </div>

              {/* Checkboxes */}
              <div className="md:col-span-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">

                {/* Tem validade */}
                <label className="flex items-center gap-3 p-3 bg-white/5 rounded-xl cursor-pointer hover:bg-white/10 transition-colors">
                  <input type="checkbox" checked={formData.tem_validade}
                    onChange={e => setFormData({ ...formData, tem_validade: e.target.checked })}
                    className="w-4 h-4 rounded text-wine border-white/20 focus:ring-wine" />
                  <div>
                    <p className="text-sm font-medium text-white/80">Tem validade</p>
                    <p className="text-xs text-white/60">Controlar vencimento</p>
                  </div>
                </label>

                {/* Status */}
                <label className="flex items-center gap-3 p-3 bg-white/5 rounded-xl cursor-pointer hover:bg-white/10 transition-colors">
                  <input type="checkbox" checked={formData.status === 'ativo'}
                    onChange={e => setFormData({ ...formData, status: e.target.checked ? 'ativo' : 'inativo' })}
                    className="w-4 h-4 rounded text-wine border-white/20 focus:ring-wine" />
                  <div>
                    <p className="text-sm font-medium text-white/80">Item ativo</p>
                    <p className="text-xs text-white/60">Visível no sistema</p>
                  </div>
                </label>

                {/* Entra no CMV */}
                <label className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors border-2 ${
                  formData.entra_no_cmv
                    ? 'bg-emerald-500/10 border-emerald-500/30 hover:bg-emerald-500/15'
                    : 'bg-white/5 border-transparent hover:bg-white/10'
                }`}>
                  <input type="checkbox" checked={formData.entra_no_cmv}
                    onChange={e => setFormData({ ...formData, entra_no_cmv: e.target.checked })}
                    className="w-4 h-4 rounded text-emerald-500 border-white/20 focus:ring-emerald-500" />
                  <div>
                    <p className={`text-sm font-medium ${formData.entra_no_cmv ? 'text-emerald-400' : 'text-white/50'}`}>
                      Entra no CMV
                    </p>
                    <p className="text-xs text-white/60">
                      {formData.entra_no_cmv ? 'Impacta custo das mercadorias' : 'Não compõe o CMV'}
                    </p>
                  </div>
                </label>

                {/* Ignorar contagem */}
                <label className={`flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-colors border-2 ${
                  formData.ignorar_contagem
                    ? 'bg-red-500/10 border-red-500/30 hover:bg-red-500/15'
                    : 'bg-white/5 border-transparent hover:bg-white/10'
                }`}>
                  <input type="checkbox" checked={formData.ignorar_contagem}
                    onChange={e => setFormData({ ...formData, ignorar_contagem: e.target.checked })}
                    className="w-4 h-4 rounded text-red-400 border-white/20 focus:ring-red-500" />
                  <div>
                    <p className={`text-sm font-medium ${formData.ignorar_contagem ? 'text-red-400' : 'text-white/80'}`}>
                      Não contar
                    </p>
                    <p className="text-xs text-white/60">
                      {formData.ignorar_contagem ? 'Excluído das contagens' : 'Aparece na contagem'}
                    </p>
                  </div>
                </label>
              </div>

              {/* Observações */}
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-white/80 mb-1">Observações</label>
                <textarea value={formData.observacoes}
                  onChange={e => setFormData({ ...formData, observacoes: e.target.value })}
                  className="w-full rounded-xl border-white/20 shadow-sm focus:border-wine focus:ring focus:ring-wine/20"
                  rows={2} placeholder="Observações adicionais..." />
              </div>
            </div>

            <div className="px-6 py-4 border-t border-white/5 flex justify-end gap-3">
              <button onClick={() => setShowForm(false)}
                className="px-4 py-2 border border-white/20 rounded-xl text-white/80 hover:bg-white/10/5">
                Cancelar
              </button>
              <button onClick={handleSave}
                disabled={loading || !formData.nome || !formData.unidade_medida}
                className="px-5 py-2 bg-wine text-white rounded-xl hover:bg-[#6a1a25] disabled:opacity-50 font-semibold">
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ItensEstoque;
