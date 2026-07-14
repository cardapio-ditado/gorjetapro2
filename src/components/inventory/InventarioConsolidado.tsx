import React, { useState, useEffect, useMemo } from 'react';
import {
  Search, Filter, Download, Eye, X, ChevronUp, ChevronDown,
  AlertTriangle, Package, Loader2, History,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { exportToExcel } from '../../utils/reportGenerator';

function fmtQtd(n: number | string | null | undefined): string {
  const num = Number(n ?? 0);
  if (isNaN(num)) return '0';
  return parseFloat(num.toFixed(3)).toLocaleString('pt-BR', {
    minimumFractionDigits: 0, maximumFractionDigits: 3,
  });
}

function fmtCurrency(n: number | null | undefined): string {
  return (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface VwInventarioRow {
  item_id: string;
  estoque_id: string;
  item_nome: string;
  item_codigo: string | null;
  item_categoria: string | null;
  item_unidade_medida: string;
  item_custo_medio: number;
  item_estoque_minimo: number;
  estoque_nome: string;
  saldo_atual: number;
  valor_total: number;
}

interface KardexRow {
  id: string;
  tipo_movimentacao: string;
  quantidade: number;
  custo_unitario: number | null;
  custo_total: number | null;
  data_movimentacao: string;
  motivo: string | null;
  observacoes: string | null;
  criado_em: string;
  estoque_origem_id: string | null;
  estoque_destino_id: string | null;
  origem_tipo: string | null;
}

interface Estoque { id: string; nome: string; }

type SortField = 'nome' | 'saldo' | 'valor';

const TIPO_LABEL: Record<string, string> = {
  entrada: 'Entrada', saida: 'Saída', transferencia: 'Transf.',
  ajuste_positivo: 'Aj.+', ajuste_negativo: 'Aj.-',
  producao: 'Produção', consumo: 'Consumo', perda: 'Perda',
  venda: 'Venda', devolucao: 'Devolução',
};

function tipoColor(tipo: string) {
  if (['entrada', 'producao', 'devolucao', 'ajuste_positivo'].includes(tipo))
    return 'bg-green-500/15 text-green-300';
  if (['saida', 'consumo', 'perda', 'venda', 'ajuste_negativo'].includes(tipo))
    return 'bg-red-500/15 text-red-300';
  return 'bg-blue-500/15 text-blue-300';
}

function statusBadge(saldo: number, minimo: number) {
  if (saldo < 0) return { label: 'Negativo', cls: 'bg-red-500/20 text-red-300' };
  if (saldo === 0) return { label: 'Zerado', cls: 'bg-white/10 text-white/40' };
  if (saldo < minimo && minimo > 0) return { label: 'Crítico', cls: 'bg-yellow-500/15 text-yellow-300' };
  return { label: 'OK', cls: 'bg-green-500/15 text-green-300' };
}

export default function InventarioConsolidado() {
  const [rows, setRows]         = useState<VwInventarioRow[]>([]);
  const [estoques, setEstoques] = useState<Estoque[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  const [searchTerm, setSearchTerm]         = useState('');
  const [estoqueFilter, setEstoqueFilter]   = useState('all');
  const [statusFilter, setStatusFilter]     = useState('all');
  const [categoriaFilter, setCategoriaFilter] = useState('all');
  const [sortBy, setSortBy]                 = useState<SortField>('nome');
  const [sortAsc, setSortAsc]               = useState(true);

  // Kardex modal
  const [kardexItem, setKardexItem]         = useState<{ id: string; nome: string; estoqueId: string } | null>(null);
  const [kardexRows, setKardexRows]         = useState<KardexRow[]>([]);
  const [kardexLoading, setKardexLoading]   = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setError(null);
    try {
      const [estRes, invRes] = await Promise.all([
        supabase.from('estoques').select('id, nome').eq('status', true).order('nome'),
        supabase.from('vw_inventario').select('*').order('item_nome'),
      ]);
      if (estRes.error) throw estRes.error;
      if (invRes.error) throw invRes.error;
      setEstoques(estRes.data || []);
      setRows((invRes.data || []) as VwInventarioRow[]);
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar inventário');
    } finally {
      setLoading(false);
    }
  }

  async function abrirKardex(itemId: string, itemNome: string, estoqueId: string) {
    setKardexItem({ id: itemId, nome: itemNome, estoqueId });
    setKardexLoading(true);
    setKardexRows([]);
    try {
      const { data, error } = await supabase
        .from('movimentacoes_estoque')
        .select('id, tipo_movimentacao, quantidade, custo_unitario, custo_total, data_movimentacao, motivo, observacoes, criado_em, estoque_origem_id, estoque_destino_id, origem_tipo')
        .eq('item_id', itemId)
        .or(`estoque_origem_id.eq.${estoqueId},estoque_destino_id.eq.${estoqueId}`)
        .order('criado_em', { ascending: false })
        .limit(50);
      if (error) throw error;
      setKardexRows((data || []) as KardexRow[]);
    } catch (e: any) {
      console.error(e);
    } finally {
      setKardexLoading(false);
    }
  }

  const categorias = useMemo(() =>
    Array.from(new Set(rows.map(r => r.item_categoria).filter(Boolean))).sort() as string[],
    [rows]
  );

  const itensFiltrados = useMemo(() => {
    let r = [...rows];

    if (estoqueFilter !== 'all') r = r.filter(row => row.estoque_id === estoqueFilter);
    if (categoriaFilter !== 'all') r = r.filter(row => row.item_categoria === categoriaFilter);
    if (statusFilter !== 'all') {
      r = r.filter(row => {
        const s = row.saldo_atual;
        const min = row.item_estoque_minimo;
        if (statusFilter === 'negativo') return s < 0;
        if (statusFilter === 'zerado') return s === 0;
        if (statusFilter === 'critico') return s > 0 && s < min && min > 0;
        if (statusFilter === 'ok') return s >= min || min === 0;
        return true;
      });
    }
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      r = r.filter(row =>
        row.item_nome.toLowerCase().includes(t) ||
        (row.item_codigo?.toLowerCase().includes(t) ?? false)
      );
    }

    r.sort((a, b) => {
      let cmp = 0;
      if (sortBy === 'nome')   cmp = a.item_nome.localeCompare(b.item_nome);
      if (sortBy === 'saldo')  cmp = a.saldo_atual - b.saldo_atual;
      if (sortBy === 'valor')  cmp = a.valor_total - b.valor_total;
      return sortAsc ? cmp : -cmp;
    });

    return r;
  }, [rows, estoqueFilter, categoriaFilter, statusFilter, searchTerm, sortBy, sortAsc]);

  function toggleSort(field: SortField) {
    if (sortBy === field) setSortAsc(v => !v);
    else { setSortBy(field); setSortAsc(true); }
  }

  function SortIcon({ field }: { field: SortField }) {
    if (sortBy !== field) return <ChevronUp className="w-3 h-3 text-white/20" />;
    return sortAsc
      ? <ChevronUp className="w-3 h-3 text-white/60" />
      : <ChevronDown className="w-3 h-3 text-white/60" />;
  }

  function exportar() {
    const headers = ['Item', 'Código', 'Categoria', 'Estoque', 'Unidade', 'Saldo', 'Custo Unit.', 'Valor Total', 'Status'];
    const rows = itensFiltrados.map(r => [
      r.item_nome,
      r.item_codigo || '',
      r.item_categoria || '',
      r.estoque_nome,
      r.item_unidade_medida,
      String(r.saldo_atual),
      String(r.item_custo_medio),
      String(r.valor_total),
      statusBadge(r.saldo_atual, r.item_estoque_minimo).label,
    ]);
    exportToExcel(rows, 'inventario', headers);
  }

  const negativosCount = rows.filter(r => r.saldo_atual < 0).length;

  if (loading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="w-7 h-7 animate-spin text-white/30" />
    </div>
  );

  if (error) return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 text-red-300 text-sm">
      {error}
    </div>
  );

  return (
    <div className="space-y-5">

      {/* Alerta negativos */}
      {negativosCount > 0 && (
        <div className="flex items-center gap-3 bg-red-500/10 border border-red-500/30 rounded-xl p-4">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <p className="text-sm text-red-300">
            <strong>{negativosCount}</strong> {negativosCount === 1 ? 'item está' : 'itens estão'} com saldo negativo.
            Use o filtro "Negativo" para ver.
          </p>
        </div>
      )}

      {/* Filtros */}
      <div className="bg-[#12141f] border border-white/10 rounded-xl p-4 flex flex-wrap gap-3">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome ou código..."
            className="w-full pl-9 pr-3 py-2.5 bg-white/5 border border-white/20 text-white rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/30"
          />
        </div>

        <select
          value={estoqueFilter} onChange={e => setEstoqueFilter(e.target.value)}
          className="bg-[#12141f] border border-white/20 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none"
        >
          <option value="all">Todos os Estoques</option>
          {estoques.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
        </select>

        <select
          value={categoriaFilter} onChange={e => setCategoriaFilter(e.target.value)}
          className="bg-[#12141f] border border-white/20 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none"
        >
          <option value="all">Todas as Categorias</option>
          {categorias.map(c => <option key={c} value={c}>{c}</option>)}
        </select>

        <select
          value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="bg-[#12141f] border border-white/20 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none"
        >
          <option value="all">Todos os Status</option>
          <option value="ok">OK</option>
          <option value="critico">Crítico</option>
          <option value="zerado">Zerado</option>
          <option value="negativo">Negativo</option>
        </select>

        <button
          onClick={exportar}
          className="flex items-center gap-2 border border-white/20 text-white/70 rounded-xl px-3 py-2.5 text-sm font-semibold hover:bg-white/5"
        >
          <Download className="w-4 h-4" /> Exportar
        </button>
      </div>

      {/* Contador */}
      <p className="text-xs text-white/40">
        {itensFiltrados.length} {itensFiltrados.length === 1 ? 'item' : 'itens'} exibidos
      </p>

      {/* Tabela */}
      <div className="bg-[#12141f] border border-white/10 rounded-xl overflow-hidden">
        {itensFiltrados.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-white/30">
            <Package className="w-10 h-10" />
            <p className="text-sm">Nenhum item encontrado</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-white/5 border-b border-white/10">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wide">
                    <button onClick={() => toggleSort('nome')} className="flex items-center gap-1 hover:text-white/60">
                      Item <SortIcon field="nome" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wide">Categoria</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wide">Estoque</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-white/40 uppercase tracking-wide">Un</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-white/40 uppercase tracking-wide">
                    <button onClick={() => toggleSort('saldo')} className="flex items-center gap-1 ml-auto hover:text-white/60">
                      Saldo <SortIcon field="saldo" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-white/40 uppercase tracking-wide">Custo Unit.</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-white/40 uppercase tracking-wide">
                    <button onClick={() => toggleSort('valor')} className="flex items-center gap-1 ml-auto hover:text-white/60">
                      Valor Total <SortIcon field="valor" />
                    </button>
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-white/40 uppercase tracking-wide">Status</th>
                  <th className="px-4 py-3 text-center text-xs font-semibold text-white/40 uppercase tracking-wide">Histórico</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {itensFiltrados.map((row, i) => {
                  const st = statusBadge(row.saldo_atual, row.item_estoque_minimo);
                  const negativo = row.saldo_atual < 0;
                  return (
                    <tr
                      key={`${row.item_id}-${row.estoque_id}-${i}`}
                      className={`hover:bg-white/5 transition-colors ${negativo ? 'bg-red-500/5' : ''}`}
                    >
                      <td className="px-4 py-3">
                        <p className={`text-sm font-semibold ${negativo ? 'text-red-200' : 'text-white'}`}>
                          {row.item_nome}
                        </p>
                        {row.item_codigo && (
                          <p className="text-xs text-white/30 mt-0.5">{row.item_codigo}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-white/50">{row.item_categoria || '—'}</td>
                      <td className="px-4 py-3 text-sm text-white/60">{row.estoque_nome}</td>
                      <td className="px-4 py-3 text-sm text-white/50">{row.item_unidade_medida}</td>
                      <td className={`px-4 py-3 text-sm font-bold text-right tabular-nums ${negativo ? 'text-red-300' : 'text-white'}`}>
                        {fmtQtd(row.saldo_atual)}
                      </td>
                      <td className="px-4 py-3 text-sm text-white/50 text-right tabular-nums">
                        {fmtCurrency(row.item_custo_medio)}
                      </td>
                      <td className={`px-4 py-3 text-sm font-semibold text-right tabular-nums ${negativo ? 'text-red-300' : 'text-white/80'}`}>
                        {fmtCurrency(row.valor_total)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${st.cls}`}>
                          {st.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => abrirKardex(row.item_id, row.item_nome, row.estoque_id)}
                          className="p-1.5 text-white/40 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
                          title="Ver Histórico"
                        >
                          <History className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Kardex */}
      {kardexItem && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1020] border border-white/10 rounded-2xl max-w-3xl w-full max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <div>
                <h3 className="text-lg font-bold text-white">{kardexItem.nome}</h3>
                <p className="text-xs text-white/40 mt-0.5">
                  {estoques.find(e => e.id === kardexItem.estoqueId)?.nome || kardexItem.estoqueId} · Últimas 50 movimentações
                </p>
              </div>
              <button
                onClick={() => { setKardexItem(null); setKardexRows([]); }}
                className="p-1.5 hover:bg-white/10 rounded-lg"
              >
                <X className="w-5 h-5 text-white/50" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              {kardexLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-6 h-6 animate-spin text-white/30" />
                </div>
              ) : kardexRows.length === 0 ? (
                <p className="text-center text-white/30 py-12 text-sm">Nenhuma movimentação encontrada</p>
              ) : (
                <table className="min-w-full">
                  <thead className="bg-white/5 border-b border-white/10 sticky top-0">
                    <tr>
                      {['Data', 'Tipo', 'Qtd', 'Custo Unit.', 'Total', 'Origem', 'Obs'].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-white/40 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {kardexRows.map(row => (
                      <tr key={row.id} className="hover:bg-white/5">
                        <td className="px-4 py-2.5 text-xs text-white/50 whitespace-nowrap">
                          {new Date(row.data_movimentacao).toLocaleDateString('pt-BR')}
                        </td>
                        <td className="px-4 py-2.5">
                          <span className={`text-xs px-2 py-0.5 rounded-lg font-semibold ${tipoColor(row.tipo_movimentacao)}`}>
                            {TIPO_LABEL[row.tipo_movimentacao] || row.tipo_movimentacao}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-sm font-semibold text-white tabular-nums whitespace-nowrap">
                          {fmtQtd(row.quantidade)}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-white/50 tabular-nums whitespace-nowrap">
                          {row.custo_unitario != null ? fmtCurrency(row.custo_unitario) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-sm text-white/60 tabular-nums whitespace-nowrap">
                          {row.custo_total != null ? fmtCurrency(row.custo_total) : '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-white/40">
                          {row.origem_tipo || '—'}
                        </td>
                        <td className="px-4 py-2.5 text-xs text-white/30 max-w-[150px] truncate">
                          {row.observacoes || row.motivo || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
