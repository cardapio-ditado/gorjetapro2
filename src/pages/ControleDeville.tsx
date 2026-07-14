import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  Package, FileText, RefreshCw, DollarSign, Settings,
  Search, Plus, Trash2, Eye, X, ChevronDown, ChevronRight,
  Printer, AlertTriangle, CheckCircle, ArrowDownToLine,
  Pencil, RotateCcw, Paperclip, Upload, ExternalLink, Image, FileUp
} from 'lucide-react';

const DEVILLE_ID = '99c8ac2f-08b1-4862-88cc-9d2e0b900f4e';

// ─── Types ───────────────────────────────────────────────────────────────────

interface EstoqueItem {
  fornecedor_id: string;
  item_id: string;
  item: string;
  item_codigo: string;
  unidade_medida: string;
  categoria: string;
  total_entradas: number;
  total_saidas: number;
  total_devolvidos: number;
  saldo_atual: number;
  custo_medio: number;
  valor_em_poder: number;
  status_saldo: string;
}

interface KardexItem {
  id: string;
  data_movimento: string;
  item: string;
  tipo: string;
  origem: string;
  nota: string;
  quantidade: number;
  custo_unitario: number;
  valor: number;
  observacoes: string;
}

interface Nota {
  id: string;
  numero_nota: string;
  data_emissao: string;
  data_entrada: string;
  data_vencimento: string | null;
  tipo: 'normal' | 'consignado';
  prazo_pagamento: string;
  valor_total: number;
  valor_pago: number;
  saldo_restante: number;
  status_pagamento: string;
  observacoes: string;
  dias_atraso: number;
  criado_em: string;
  documento_url?: string;
}

interface NotaItem {
  id: string;
  nota_id: string;
  item_id: string;
  descricao_manual: string;
  quantidade: number;
  custo_unitario: number;
  custo_total: number;
  quantidade_usada: number;
  quantidade_devolvida: number;
  item_nome?: string;
  unidade_medida?: string;
}

interface Pagamento {
  id: string;
  fornecedor_id: string;
  nota_id: string | null;
  data_pagamento: string;
  valor: number;
  forma_pagamento: string;
  observacoes: string;
  numero_nota?: string;
}

interface ConsignadoNota {
  nota_id: string;
  numero_nota: string;
  data_entrada: string;
  valor_total: number;
  valor_pago: number;
  saldo_restante: number;
  itens: ConsignadoItem[];
  todosItens: ConsignadoItemCompleto[]; // inclui usados/devolvidos para o doc
}

interface ConsignadoItemCompleto {
  id: string;
  item: string;
  unidade: string;
  qtd_entrada: number;
  qtd_usada: number;
  qtd_devolvida: number;
  custo_unitario: number;
}

interface ConsignadoItem {
  item_consignado_id: string; // = fornecedor_notas_itens.id
  item_id: string;            // = itens_estoque.id (populado no load)
  nota_id: string;
  item: string;
  unidade: string;
  qtd_entrada: number;
  qtd_usada: number;
  qtd_devolvida: number;
  qtd_em_poder: number;
  custo_unitario: number;
  valor_em_poder: number;
  valor_ja_devido: number;
}

interface CatalogoItem {
  catalogo_id: string;
  item_id: string;
  item_nome: string;
  item_codigo: string;
  categoria: string;
  unidade_medida: string;
  custo_medio: number;
  saldo_atual: number;
  ativo: boolean;
  codigo_fornecedor: string;
}

interface ItemEstoque {
  id: string;
  nome: string;
  codigo: string;
  categoria: string;
  unidade_medida: string;
}

interface FormNotaItem {
  item_id: string;
  quantidade: string;
  custo_unitario: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const fmt = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

const fmtQtd = (n: number | null | undefined) => {
  const v = n ?? 0;
  return v % 1 === 0 ? String(v) : v.toFixed(3).replace(/\.?0+$/, '');
};

const fmtDate = (s: string | null | undefined) => {
  if (!s) return '—';
  const [y, m, d] = s.split('-');
  return `${d}/${m}/${y}`;
};

const today = () => new Date().toISOString().split('T')[0];

function calcularVencimento(dataEmissao: string, prazo: string): string {
  const d = new Date(dataEmissao + 'T12:00:00');
  if (prazo === 'd1') d.setDate(d.getDate() + 1);
  else if (prazo === 'd2') d.setDate(d.getDate() + 2);
  else if (prazo === 'd3') d.setDate(d.getDate() + 3);
  else if (prazo === 'semana') d.setDate(d.getDate() + 7);
  else return dataEmissao;
  while ([0, 6].includes(d.getDay())) d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

// ─── Badge helpers ────────────────────────────────────────────────────────────

function BadgeStatus({ status, diasAtraso }: { status: string; diasAtraso?: number }) {
  const map: Record<string, string> = {
    em_aberto: 'text-yellow-300 bg-yellow-900/30',
    parcialmente_pago: 'text-orange-300 bg-orange-900/30',
    pago: 'text-green-300 bg-green-900/30',
    consignado_ativo: 'text-blue-300 bg-blue-900/30',
    vencido: 'text-red-300 bg-red-900/30',
  };
  const labels: Record<string, string> = {
    em_aberto: 'Em Aberto',
    parcialmente_pago: 'Parcial',
    pago: 'Pago',
    consignado_ativo: 'Consignado',
    vencido: 'Vencido',
  };
  const isVencido = (status === 'em_aberto' || status === 'parcialmente_pago') && (diasAtraso ?? 0) > 0;
  const key = isVencido ? 'vencido' : status;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${map[key] ?? 'text-white/50 bg-white/5'}`}>
      {labels[key] ?? status}
      {isVencido && diasAtraso && diasAtraso > 0 && <span className="opacity-80">+{diasAtraso}d</span>}
    </span>
  );
}

function BadgeTipo({ tipo }: { tipo: string }) {
  const map: Record<string, string> = {
    entrada: 'text-green-400 bg-green-500/10',
    saida: 'text-red-400 bg-red-500/10',
    devolucao: 'text-blue-400 bg-blue-500/10',
    ajuste: 'text-yellow-400 bg-yellow-500/10',
  };
  return (
    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${map[tipo] ?? 'text-white/50 bg-white/5'}`}>
      {tipo}
    </span>
  );
}

// ─── Input / Select atoms ─────────────────────────────────────────────────────

const inputCls = 'bg-white/5 border border-white/20 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-white/40 w-full';
const selectCls = 'bg-[#12141f] border border-white/20 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-white/40 w-full';

// ─── Modal shell ──────────────────────────────────────────────────────────────

function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75" onClick={onClose}>
      <div
        className={`relative bg-[#0f1020] border border-white/10 rounded-2xl flex flex-col max-h-[90vh] ${wide ? 'w-full max-w-3xl' : 'w-full max-w-xl'}`}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
          <h2 className="text-white font-semibold">{title}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors"><X size={18} /></button>
        </div>
        <div className="overflow-y-auto px-6 py-4" style={{ maxHeight: 'calc(90vh - 65px)' }}>{children}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA 1 — ESTOQUE
// ═══════════════════════════════════════════════════════════════════════════════

function AbaEstoque() {
  const [itens, setItens] = useState<EstoqueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState('');
  const [catFiltro, setCatFiltro] = useState('');
  const [kardexItem, setKardexItem] = useState<EstoqueItem | null>(null);
  const [kardex, setKardex] = useState<KardexItem[]>([]);
  const [kardexLoading, setKardexLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('vw_fornecedor_estoque')
      .select('*')
      .eq('fornecedor_id', DEVILLE_ID)
      .order('categoria')
      .order('item');
    setItens(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const openKardex = async (item: EstoqueItem) => {
    setKardexItem(item);
    setKardexLoading(true);
    const { data } = await supabase
      .from('vw_fornecedor_kardex')
      .select('*')
      .eq('fornecedor_id', DEVILLE_ID)
      .eq('item', item.item)
      .order('data_movimento', { ascending: false })
      .order('criado_em', { ascending: false });
    setKardex(data ?? []);
    setKardexLoading(false);
  };

  const cats = [...new Set(itens.map(i => i.categoria).filter(Boolean))].sort();
  const filtered = itens.filter(i => {
    const ok = !busca || i.item?.toLowerCase().includes(busca.toLowerCase());
    const okCat = !catFiltro || i.categoria === catFiltro;
    return ok && okCat;
  });

  const totalValor = filtered.reduce((s, i) => s + (i.valor_em_poder ?? 0), 0);

  return (
    <div>
      {/* Filtros */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
          <input className={inputCls + ' pl-8'} placeholder="Buscar item..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <select className={selectCls + ' w-auto min-w-40'} value={catFiltro} onChange={e => setCatFiltro(e.target.value)}>
          <option value="">Todas categorias</option>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <button onClick={load} className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-white/20 text-white/60 hover:text-white hover:bg-white/5 text-sm transition-colors">
          <RefreshCw size={14} />
        </button>
      </div>

      {/* Sumário */}
      <div className="flex items-center justify-between mb-3 text-sm">
        <span className="text-white/40">{filtered.length} itens</span>
        <span className="text-white/60">Valor total em estoque: <span className="text-[#D4AF37] font-semibold">{fmt(totalValor)}</span></span>
      </div>

      {/* Tabela */}
      <div className="bg-[#12141f] border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                {['Item', 'Cat.', 'Un', 'Entradas', 'Saídas', 'Dev.', 'Saldo', 'Custo Médio', 'Valor Total', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-white/30">Carregando...</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-white/30">Nenhum item</td></tr>
              ) : filtered.map(item => {
                const neg = (item.saldo_atual ?? 0) < 0;
                const zero = (item.saldo_atual ?? 0) === 0;
                return (
                  <tr key={item.item_id}
                    className={`border-b border-white/5 last:border-0 transition-colors hover:bg-white/[0.02]
                      ${neg ? 'bg-red-900/10' : ''}`}
                  >
                    <td className={`px-4 py-3 font-medium ${neg ? 'text-red-300' : zero ? 'text-white/30' : 'text-white'}`}>{item.item}</td>
                    <td className="px-4 py-3 text-white/40 text-xs">{item.categoria}</td>
                    <td className="px-4 py-3 text-white/50">{item.unidade_medida}</td>
                    <td className="px-4 py-3 text-green-400">{fmtQtd(item.total_entradas)}</td>
                    <td className="px-4 py-3 text-red-400">{fmtQtd(item.total_saidas)}</td>
                    <td className="px-4 py-3 text-blue-400">{fmtQtd(item.total_devolvidos)}</td>
                    <td className={`px-4 py-3 font-semibold ${neg ? 'text-red-400' : zero ? 'text-white/30' : 'text-white'}`}>{fmtQtd(item.saldo_atual)}</td>
                    <td className="px-4 py-3 text-white/50">{fmt(item.custo_medio)}</td>
                    <td className="px-4 py-3 text-[#D4AF37] font-medium">{fmt(item.valor_em_poder)}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => openKardex(item)} className="text-white/30 hover:text-white transition-colors" title="Ver Kardex">
                        <Eye size={14} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Kardex */}
      {kardexItem && (
        <Modal title={`Kardex — ${kardexItem.item}`} onClose={() => setKardexItem(null)} wide>
          <p className="text-white/40 text-sm mb-4">Saldo atual: <span className="text-white font-medium">{fmtQtd(kardexItem.saldo_atual)} {kardexItem.unidade_medida}</span></p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  {['Data', 'Tipo', 'Nota', 'Origem', 'Qtd', 'Custo Unit.', 'Valor'].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-white/40 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {kardexLoading ? (
                  <tr><td colSpan={7} className="py-6 text-center text-white/30">Carregando...</td></tr>
                ) : kardex.length === 0 ? (
                  <tr><td colSpan={7} className="py-6 text-center text-white/30">Sem movimentações</td></tr>
                ) : kardex.map(k => (
                  <tr key={k.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-3 py-2.5 text-white/60 whitespace-nowrap">{fmtDate(k.data_movimento)}</td>
                    <td className="px-3 py-2.5"><BadgeTipo tipo={k.tipo} /></td>
                    <td className="px-3 py-2.5 text-white/50 text-xs">{k.nota ?? '—'}</td>
                    <td className="px-3 py-2.5 text-white/40 text-xs">{k.origem ?? '—'}</td>
                    <td className="px-3 py-2.5 text-white font-medium">{fmtQtd(k.quantidade)}</td>
                    <td className="px-3 py-2.5 text-white/60">{fmt(k.custo_unitario)}</td>
                    <td className="px-3 py-2.5 text-[#D4AF37]">{fmt(k.valor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA 2 — NOTAS
// ═══════════════════════════════════════════════════════════════════════════════

function AbaNotas() {
  const [notas, setNotas] = useState<Nota[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNova, setShowNova] = useState(false);
  const [notaEditar, setNotaEditar] = useState<Nota | null>(null);
  const [notaPgto, setNotaPgto] = useState<Nota | null>(null);
  const [notaVer, setNotaVer] = useState<Nota | null>(null);
  const [notaItens, setNotaItens] = useState<NotaItem[]>([]);
  const [catalogo, setCatalogo] = useState<CatalogoItem[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('vw_fornecedor_notas_detalhe')
      .select('*')
      .order('criado_em', { ascending: false });
    setNotas(data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
    supabase.from('vw_fornecedor_catalogo').select('*').eq('fornecedor_id', DEVILLE_ID).eq('ativo', true).then(({ data }) => setCatalogo(data ?? []));
  }, [load]);

  const verItens = async (nota: Nota) => {
    setNotaVer(nota);
    const { data } = await supabase
      .from('fornecedor_notas_itens')
      .select('*, itens_estoque(nome, unidade_medida)')
      .eq('nota_id', nota.id);
    setNotaItens((data ?? []).map((d: any) => ({ ...d, item_nome: d.itens_estoque?.nome, unidade_medida: d.itens_estoque?.unidade_medida })));
  };

  const deletarNota = async (nota: Nota) => {
    const temPgto = await supabase.from('fornecedor_pagamentos').select('id').eq('nota_id', nota.id).limit(1);
    if ((temPgto.data ?? []).length > 0) {
      alert('Não é possível excluir: há pagamentos vinculados a esta nota. Exclua os pagamentos primeiro.');
      return;
    }
    if (!window.confirm(`Excluir nota ${nota.numero_nota || 'sem número'}? Esta ação não pode ser desfeita.`)) return;

    // 1. Movimentos de estoque — trigger DELETE reverte fornecedor_estoque_saldo automaticamente
    await supabase.from('fornecedor_estoque_movimentos').delete().eq('nota_id', nota.id);

    // 2. Buscar itens para deletar dependentes
    const { data: itensIds } = await supabase.from('fornecedor_notas_itens').select('id').eq('nota_id', nota.id);
    const ids = (itensIds ?? []).map((i: any) => i.id);
    if (ids.length > 0) {
      await supabase.from('fornecedor_consignado_movimentos').delete().in('nota_item_id', ids);
    }

    // 3. Requisições REQBAR vinculadas (itens primeiro, depois cabeçalho)
    const { data: reqs } = await supabase.from('fornecedor_requisicoes').select('id').eq('nota_id', nota.id);
    const reqIds = (reqs ?? []).map((r: any) => r.id);
    if (reqIds.length > 0) {
      await supabase.from('fornecedor_requisicoes_itens').delete().in('requisicao_id', reqIds);
      await supabase.from('fornecedor_requisicoes').delete().in('id', reqIds);
    }

    // 4. Itens e nota
    await supabase.from('fornecedor_notas_itens').delete().eq('nota_id', nota.id);
    await supabase.from('fornecedor_notas').delete().eq('id', nota.id);
    load();
  };

  // KPIs
  const emAberto = notas.filter(n => n.status_pagamento === 'em_aberto' || n.status_pagamento === 'parcialmente_pago');
  const vencidas = notas.filter(n => (n.status_pagamento === 'em_aberto' || n.status_pagamento === 'parcialmente_pago') && (n.dias_atraso ?? 0) > 0);
  const thisMonth = new Date().toISOString().slice(0, 7);
  const pagoMes = notas.filter(n => n.status_pagamento === 'pago' && n.criado_em?.startsWith(thisMonth)).reduce((s, n) => s + n.valor_pago, 0);
  const totalHist = notas.reduce((s, n) => s + n.valor_total, 0);

  return (
    <div>
      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        {[
          { label: 'Em Aberto', value: `${emAberto.length} notas`, sub: fmt(emAberto.reduce((s, n) => s + n.saldo_restante, 0)), color: 'text-yellow-300' },
          { label: 'Vencido', value: `${vencidas.length} notas`, sub: fmt(vencidas.reduce((s, n) => s + n.saldo_restante, 0)), color: 'text-red-300' },
          { label: 'Pago este mês', value: fmt(pagoMes), sub: thisMonth.split('-').reverse().join('/'), color: 'text-green-300' },
          { label: 'Total histórico', value: fmt(totalHist), sub: `${notas.length} notas`, color: 'text-[#D4AF37]' },
        ].map(k => (
          <div key={k.label} className="bg-[#12141f] border border-white/10 rounded-xl p-4">
            <p className="text-white/40 text-xs mb-1">{k.label}</p>
            <p className={`text-lg font-bold ${k.color}`}>{k.value}</p>
            <p className="text-white/30 text-xs mt-0.5">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white/70 text-sm font-medium">{notas.length} notas registradas</h3>
        <button onClick={() => setShowNova(true)} className="flex items-center gap-2 px-4 py-2 bg-[#7D1F2C] hover:bg-[#6a1a25] text-white rounded-xl text-sm font-medium transition-colors">
          <Plus size={14} /> Nova Nota
        </button>
      </div>

      <div className="bg-[#12141f] border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                {['# Nota', 'Emissão', 'Vencimento', 'Tipo', 'Valor', 'Pago', 'Saldo', 'Status', 'Doc.', 'Ações'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-white/30">Carregando...</td></tr>
              ) : notas.length === 0 ? (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-white/30">Nenhuma nota registrada</td></tr>
              ) : notas.map(nota => (
                <tr key={nota.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-white font-medium">{nota.numero_nota || '—'}</td>
                  <td className="px-4 py-3 text-white/60 whitespace-nowrap">{fmtDate(nota.data_emissao)}</td>
                  <td className="px-4 py-3 text-white/60 whitespace-nowrap">{nota.data_vencimento ? fmtDate(nota.data_vencimento) : '—'}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-xs ${nota.tipo === 'consignado' ? 'text-blue-300 bg-blue-900/30' : 'text-white/50 bg-white/5'}`}>
                      {nota.tipo === 'consignado' ? 'Consignado' : 'Normal'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-white">{fmt(nota.valor_total)}</td>
                  <td className="px-4 py-3 text-green-400">{fmt(nota.valor_pago)}</td>
                  <td className={`px-4 py-3 font-medium ${nota.saldo_restante > 0 ? 'text-yellow-300' : 'text-white/30'}`}>{fmt(nota.saldo_restante)}</td>
                  <td className="px-4 py-3"><BadgeStatus status={nota.status_pagamento} diasAtraso={nota.dias_atraso} /></td>
                  <td className="px-4 py-3">
                    {nota.documento_url ? (
                      <a
                        href={nota.documento_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 transition-colors text-xs"
                        title="Ver documento anexo"
                      >
                        <Paperclip size={11} />
                        Ver
                      </a>
                    ) : (
                      <span className="text-white/20 text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => verItens(nota)} className="p-1.5 text-white/30 hover:text-white transition-colors rounded-lg hover:bg-white/5" title="Ver itens"><Eye size={13} /></button>
                      {nota.tipo !== 'consignado' && nota.status_pagamento !== 'pago' && (
                        <button onClick={() => setNotaPgto(nota)} className="p-1.5 text-white/30 hover:text-green-400 transition-colors rounded-lg hover:bg-white/5" title="Registrar pagamento"><DollarSign size={13} /></button>
                      )}
                      <button onClick={() => setNotaEditar(nota)} className="p-1.5 text-white/30 hover:text-blue-400 transition-colors rounded-lg hover:bg-white/5" title="Editar nota"><Pencil size={13} /></button>
                      <button onClick={() => deletarNota(nota)} className="p-1.5 text-white/30 hover:text-red-400 transition-colors rounded-lg hover:bg-white/5" title="Excluir nota"><Trash2 size={13} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showNova && <ModalNovaNota onClose={() => { setShowNova(false); load(); }} catalogo={catalogo} />}
      {notaEditar && <ModalEditarNota nota={notaEditar} onClose={() => { setNotaEditar(null); load(); }} />}
      {notaPgto && <ModalPagamentoNota nota={notaPgto} onClose={() => { setNotaPgto(null); load(); }} />}
      {notaVer && (
        <Modal title={`Nota ${notaVer.numero_nota || 'S/N'} — Detalhes`} onClose={() => setNotaVer(null)} wide>
          <div className="space-y-5">

            {/* Header summary strip */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Valor Total', value: fmt(notaVer.valor_total), cls: 'text-white' },
                { label: 'Pago', value: fmt(notaVer.valor_pago), cls: 'text-green-400' },
                { label: 'Saldo', value: fmt(notaVer.saldo_restante), cls: notaVer.saldo_restante > 0 ? 'text-yellow-300' : 'text-white/30' },
                { label: 'Status', value: <BadgeStatus status={notaVer.status_pagamento} diasAtraso={notaVer.dias_atraso} />, cls: '' },
              ].map(k => (
                <div key={k.label} className="bg-white/5 border border-white/10 rounded-xl p-3">
                  <p className="text-xs text-white/40 mb-1">{k.label}</p>
                  <div className={`font-semibold ${k.cls}`}>{k.value}</div>
                </div>
              ))}
            </div>

            {/* Detail fields */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-x-6 gap-y-3 text-sm bg-white/3 border border-white/10 rounded-xl px-4 py-4">
              {[
                { label: 'Número da Nota', value: notaVer.numero_nota || '—' },
                { label: 'Tipo', value: notaVer.tipo === 'consignado' ? 'Consignado' : 'Normal' },
                { label: 'Data de Emissão', value: fmtDate(notaVer.data_emissao) },
                { label: 'Data de Entrada', value: fmtDate(notaVer.data_entrada) },
                { label: 'Vencimento', value: notaVer.data_vencimento ? fmtDate(notaVer.data_vencimento) : '—' },
                { label: 'Prazo', value: notaVer.prazo_pagamento || '—' },
              ].map(f => (
                <div key={f.label}>
                  <p className="text-xs text-white/40 mb-0.5">{f.label}</p>
                  <p className="text-white font-medium">{f.value}</p>
                </div>
              ))}
              {notaVer.observacoes && (
                <div className="col-span-2 md:col-span-3">
                  <p className="text-xs text-white/40 mb-0.5">Observações</p>
                  <p className="text-white/70">{notaVer.observacoes}</p>
                </div>
              )}
            </div>

            {/* Documento anexo */}
            {notaVer.documento_url && (
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wide mb-2">Documento Anexo</p>
                {/\.(jpg|jpeg|png|webp|heic|gif)(\?|$)/i.test(notaVer.documento_url) ? (
                  <div className="rounded-xl overflow-hidden border border-white/10 bg-black/30">
                    <img
                      src={notaVer.documento_url}
                      alt="Documento da nota"
                      className="w-full max-h-96 object-contain"
                    />
                    <div className="flex justify-end p-2 border-t border-white/10">
                      <a
                        href={notaVer.documento_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/10 text-white/70 hover:text-white hover:bg-white/15 text-xs transition-colors"
                      >
                        <ExternalLink size={12} /> Abrir em nova aba
                      </a>
                    </div>
                  </div>
                ) : (
                  <a
                    href={notaVer.documento_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-3 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-400 hover:bg-blue-500/15 transition-colors text-sm font-medium"
                  >
                    <Paperclip size={14} />
                    Abrir documento anexo
                    <ExternalLink size={12} className="opacity-60" />
                  </a>
                )}
              </div>
            )}

            {/* Items table — only shown if there are items (consignado or normal with items) */}
            {notaItens.length > 0 && (
              <div>
                <p className="text-xs text-white/40 uppercase tracking-wide mb-2">Itens da Nota</p>
                <div className="bg-[#12141f] border border-white/10 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/10">
                        {['Item', 'Qtd', 'Custo Unit.', 'Total'].map(h => (
                          <th key={h} className="px-3 py-2.5 text-left text-xs font-medium text-white/40 uppercase tracking-wide">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {notaItens.map(it => (
                        <tr key={it.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                          <td className="px-3 py-3 text-white">{it.item_nome || it.descricao_manual || '—'}</td>
                          <td className="px-3 py-3 text-white/70">{fmtQtd(it.quantidade)} {it.unidade_medida}</td>
                          <td className="px-3 py-3 text-white/60">{fmt(it.custo_unitario)}</td>
                          <td className="px-3 py-3 text-[#D4AF37] font-medium">{fmt(it.custo_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-white/10 bg-white/3">
                        <td colSpan={3} className="px-3 py-3 text-right text-white/50 font-medium">Total</td>
                        <td className="px-3 py-3 text-[#D4AF37] font-bold">{fmt(notaItens.reduce((s, i) => s + i.custo_total, 0))}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>
            )}

            {notaItens.length === 0 && notaVer.tipo === 'normal' && (
              <div className="text-center py-4 text-white/30 text-sm bg-white/3 border border-white/10 rounded-xl">
                Nota normal — valor registrado diretamente na NF
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Modal Nova Nota ──────────────────────────────────────────────────────────

function ModalNovaNota({ onClose, catalogo }: { onClose: () => void; catalogo: CatalogoItem[] }) {
  const [tipo, setTipo] = useState<'normal' | 'consignado'>('normal');
  const [numero, setNumero] = useState('');
  const [dataEmissao, setDataEmissao] = useState(today());
  const [prazo, setPrazo] = useState('d1');
  const [dataVencimento, setDataVencimento] = useState(calcularVencimento(today(), 'd1'));
  const [obs, setObs] = useState('');
  // normal: valor direto da NF
  const [valorNF, setValorNF] = useState('');
  // consignado: itens detalhados
  const [itens, setItens] = useState<FormNotaItem[]>([{ item_id: '', quantidade: '', custo_unitario: '' }]);
  const [saving, setSaving] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { alert('Arquivo muito grande. Máximo 10MB.'); return; }
    setArquivo(file);
  };

  const removeArquivo = () => {
    setArquivo(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const uploadArquivo = async (notaId: string): Promise<string | null> => {
    if (!arquivo) return null;
    setUploadProgress(true);
    try {
      const ext = arquivo.name.split('.').pop();
      const path = `${notaId}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('deville-documentos').upload(path, arquivo, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('deville-documentos').getPublicUrl(path);
      return data.publicUrl;
    } catch (e: any) {
      alert('Erro ao enviar arquivo: ' + e.message);
      return null;
    } finally {
      setUploadProgress(false);
    }
  };

  useEffect(() => {
    if (prazo !== 'manual') setDataVencimento(calcularVencimento(dataEmissao, prazo));
  }, [prazo, dataEmissao]);

  const addItem = () => setItens(p => [...p, { item_id: '', quantidade: '', custo_unitario: '' }]);
  const removeItem = (i: number) => setItens(p => p.filter((_, idx) => idx !== i));
  const updateItem = (i: number, field: keyof FormNotaItem, val: string) =>
    setItens(p => p.map((it, idx) => idx === i ? { ...it, [field]: val } : it));

  const valorConsignado = itens.reduce((s, it) => s + (parseFloat(it.quantidade) || 0) * (parseFloat(it.custo_unitario) || 0), 0);

  const save = async () => {
    if (tipo === 'normal') {
      const vNF = parseFloat(valorNF);
      if (!vNF || vNF <= 0) return alert('Informe o valor da NF.');
      setSaving(true);
      try {
        const { data: nota, error } = await supabase.from('fornecedor_notas').insert({
          fornecedor_id: DEVILLE_ID,
          numero_nota: numero || null,
          data_emissao: dataEmissao,
          data_entrada: today(),
          tipo: 'normal',
          prazo_pagamento: prazo,
          data_vencimento: dataVencimento,
          valor_total: vNF,
          valor_pago: 0,
          status_pagamento: 'em_aberto',
          observacoes: obs || null,
        }).select().single();
        if (error) throw error;
        const docUrl = await uploadArquivo(nota.id);
        if (docUrl) await supabase.from('fornecedor_notas').update({ documento_url: docUrl }).eq('id', nota.id);
        onClose();
      } catch (e: any) {
        alert('Erro ao salvar: ' + e.message);
      } finally {
        setSaving(false);
      }
      return;
    }

    // consignado — exige itens
    const validItens = itens.filter(it => it.item_id && it.quantidade && it.custo_unitario);
    if (validItens.length === 0) return alert('Adicione pelo menos um item válido.');
    setSaving(true);
    try {
      const { data: nota, error } = await supabase.from('fornecedor_notas').insert({
        fornecedor_id: DEVILLE_ID,
        numero_nota: numero || null,
        data_emissao: dataEmissao,
        data_entrada: today(),
        tipo: 'consignado',
        prazo_pagamento: 'consignado',
        data_vencimento: null,
        valor_total: valorConsignado,
        valor_pago: 0,
        status_pagamento: 'consignado_ativo',
        observacoes: obs || null,
      }).select().single();
      if (error) throw error;

      const docUrl = await uploadArquivo(nota.id);
      if (docUrl) await supabase.from('fornecedor_notas').update({ documento_url: docUrl }).eq('id', nota.id);

      for (const it of validItens) {
        const qtd = parseFloat(it.quantidade);
        const cu = parseFloat(it.custo_unitario);
        const { data: ni } = await supabase.from('fornecedor_notas_itens').insert({
          nota_id: nota.id, item_id: it.item_id,
          quantidade: qtd, custo_unitario: cu,
          quantidade_usada: 0, quantidade_devolvida: 0,
        }).select().single();
        await supabase.from('fornecedor_estoque_movimentos').insert({
          fornecedor_id: DEVILLE_ID,
          item_id: it.item_id,
          nota_id: nota.id,
          nota_item_id: ni?.id ?? null,
          tipo: 'entrada',
          origem: 'consignado_entrada',
          quantidade: qtd,
          custo_unitario: cu,
          data_movimento: today(),
        });
      }
      onClose();
    } catch (e: any) {
      alert('Erro ao salvar: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Nova Nota — De Ville" onClose={onClose} wide>
      <div className="space-y-4">

        {/* Tipo selector */}
        <div className="grid grid-cols-2 gap-2">
          {(['normal', 'consignado'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTipo(t)}
              className={`py-3 rounded-xl border text-sm font-medium transition-all ${
                tipo === t
                  ? t === 'consignado'
                    ? 'bg-blue-900/40 border-blue-500/50 text-blue-300'
                    : 'bg-[#7D1F2C]/40 border-[#7D1F2C]/60 text-white'
                  : 'border-white/15 text-white/40 hover:border-white/30 hover:text-white/60'
              }`}
            >
              {t === 'normal' ? 'Nota Normal' : 'Consignado'}
              <p className="text-xs mt-0.5 font-normal opacity-70">
                {t === 'normal' ? 'Valor da NF + foto' : 'Itens detalhados obrigatórios'}
              </p>
            </button>
          ))}
        </div>

        {/* Header fields */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Número da Nota</label>
            <input className={inputCls} placeholder="NF-001 (opcional)" value={numero} onChange={e => setNumero(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Data de Emissão</label>
            <input type="date" className={inputCls} value={dataEmissao} onChange={e => setDataEmissao(e.target.value)} />
          </div>
        </div>

        {/* ── NOTA NORMAL: só valor + prazo + foto ── */}
        {tipo === 'normal' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-white/50 mb-1.5">Prazo de Pagamento</label>
                <select className={selectCls} value={prazo} onChange={e => setPrazo(e.target.value)}>
                  <option value="d1">D+1 — amanhã</option>
                  <option value="d2">D+2 — em 2 dias</option>
                  <option value="d3">D+3 — em 3 dias</option>
                  <option value="semana">Semana — 7 dias</option>
                  <option value="manual">Manual — escolher data</option>
                </select>
              </div>
              <div>
                <label className="block text-xs text-white/50 mb-1.5">Data de Vencimento</label>
                <input type="date" className={inputCls} value={dataVencimento} onChange={e => { setPrazo('manual'); setDataVencimento(e.target.value); }} />
              </div>
            </div>

            <div>
              <label className="block text-xs text-white/50 mb-1.5">Valor da NF *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm font-medium pointer-events-none">R$</span>
                <input
                  type="number" min="0" step="0.01" placeholder="0,00"
                  className={inputCls + ' pl-9 text-lg font-semibold'}
                  value={valorNF}
                  onChange={e => setValorNF(e.target.value)}
                />
              </div>
              {parseFloat(valorNF) > 0 && (
                <p className="text-xs text-[#D4AF37]/80 mt-1 pl-1">{fmt(parseFloat(valorNF))}</p>
              )}
            </div>
          </>
        )}

        {/* ── CONSIGNADO: itens detalhados ── */}
        {tipo === 'consignado' && (
          <div>
            <div className="hidden md:grid grid-cols-[1fr_100px_120px_80px_28px] gap-2 px-1 mb-1">
              {['Produto', 'Qtd', 'R$ Unit.', 'Total', ''].map(h => (
                <span key={h} className="text-xs text-white/30 font-medium">{h}</span>
              ))}
            </div>
            <div className="space-y-2">
              {itens.map((it, idx) => {
                const cat = catalogo.find(c => c.item_id === it.item_id);
                const total = (parseFloat(it.quantidade) || 0) * (parseFloat(it.custo_unitario) || 0);
                return (
                  <div key={idx} className="grid grid-cols-1 md:grid-cols-[1fr_100px_120px_80px_28px] gap-2 items-start">
                    <div>
                      <select className={selectCls} value={it.item_id} onChange={e => updateItem(idx, 'item_id', e.target.value)}>
                        <option value="">Selecionar produto...</option>
                        {catalogo.map(c => <option key={c.item_id} value={c.item_id}>{c.item_nome}</option>)}
                      </select>
                      {cat?.custo_medio && <p className="text-xs text-white/25 mt-0.5 pl-1">Último: {fmt(cat.custo_medio)}</p>}
                    </div>
                    <div>
                      <input type="number" min="0" step="0.001" placeholder={cat?.unidade_medida ?? 'Qtd'} className={inputCls} value={it.quantidade} onChange={e => updateItem(idx, 'quantidade', e.target.value)} />
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm pointer-events-none">R$</span>
                      <input type="number" min="0" step="0.01" placeholder="0,00" className={inputCls + ' pl-8'} value={it.custo_unitario} onChange={e => updateItem(idx, 'custo_unitario', e.target.value)} />
                    </div>
                    <div className="flex items-center h-[42px]">
                      <span className={`text-sm font-medium ${total > 0 ? 'text-[#D4AF37]' : 'text-white/20'}`}>{total > 0 ? fmt(total) : '—'}</span>
                    </div>
                    <button onClick={() => removeItem(idx)} className="flex items-center justify-center h-[42px] text-white/20 hover:text-red-400 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                );
              })}
            </div>
            <button onClick={addItem} className="mt-2 flex items-center gap-1.5 text-xs text-white/40 hover:text-white/60 transition-colors px-1 py-1">
              <Plus size={12} /> Adicionar item
            </button>
            <div className="mt-3 flex justify-end">
              <span className="text-sm text-white/50">Valor Total: <span className="text-[#D4AF37] font-bold text-base ml-1">{fmt(valorConsignado)}</span></span>
            </div>
          </div>
        )}

        {/* Anexo — disponível para ambos os tipos */}
        <div>
          <label className="block text-xs text-white/50 mb-1.5 uppercase tracking-wide">
            {tipo === 'normal' ? 'Foto / Documento da NF' : 'Anexar Documento (opcional)'}
          </label>
          <input ref={fileInputRef} type="file" accept="image/*,.pdf,.jpg,.jpeg,.png,.webp,.heic" onChange={handleFileChange} className="hidden" id="deville-file-input" />
          {!arquivo ? (
            <label
              htmlFor="deville-file-input"
              className={`flex flex-col items-center justify-center gap-2 w-full rounded-xl border-2 border-dashed cursor-pointer transition-colors group
                ${tipo === 'normal' ? 'h-32 border-[#7D1F2C]/40 hover:border-[#7D1F2C]/70 bg-[#7D1F2C]/5' : 'h-24 border-white/20 hover:border-white/40 bg-white/3'}`}
            >
              <FileUp size={22} className={`transition-colors ${tipo === 'normal' ? 'text-[#7D1F2C]/60 group-hover:text-[#7D1F2C]/80' : 'text-white/30 group-hover:text-white/50'}`} />
              <span className="text-xs text-white/50 group-hover:text-white/70 transition-colors font-medium">
                {tipo === 'normal' ? 'Clique para anexar a foto da NF' : 'Clique para anexar foto, PDF ou documento'}
              </span>
              <span className="text-xs text-white/25">JPG, PNG, HEIC, PDF — máx. 10MB</span>
            </label>
          ) : (
            <div className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/15">
              <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center flex-shrink-0">
                {arquivo.type.startsWith('image/') ? <Image size={18} className="text-blue-400" /> : <FileText size={18} className="text-orange-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white text-sm font-medium truncate">{arquivo.name}</p>
                <p className="text-white/40 text-xs">{(arquivo.size / 1024 / 1024).toFixed(2)} MB</p>
              </div>
              <button onClick={removeArquivo} className="p-1.5 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                <X size={14} />
              </button>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs text-white/50 mb-1.5">Observações</label>
          <textarea className={inputCls + ' resize-none'} rows={2} placeholder="Observações opcionais..." value={obs} onChange={e => setObs(e.target.value)} />
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/70 hover:bg-white/5 text-sm transition-colors">Cancelar</button>
          <button onClick={save} disabled={saving || uploadProgress} className="flex-1 py-2.5 rounded-xl bg-[#7D1F2C] hover:bg-[#6a1a25] text-white text-sm font-medium transition-colors disabled:opacity-50">
            {uploadProgress ? 'Enviando arquivo...' : saving ? 'Salvando...' : 'Salvar Nota'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal Pagamento Nota ─────────────────────────────────────────────────────

// ─── Modal Editar Nota ────────────────────────────────────────────────────────

function ModalEditarNota({ nota, onClose }: { nota: Nota; onClose: () => void }) {
  const [numero, setNumero] = useState(nota.numero_nota || '');
  const [dataEmissao, setDataEmissao] = useState(nota.data_emissao || '');
  const [dataVencimento, setDataVencimento] = useState(nota.data_vencimento || '');
  const [prazo, setPrazo] = useState(nota.prazo_pagamento || 'manual');
  const [obs, setObs] = useState(nota.observacoes || '');
  const [saving, setSaving] = useState(false);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [docUrlAtual, setDocUrlAtual] = useState(nota.documento_url || '');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (nota.tipo === 'normal' && prazo !== 'manual') {
      setDataVencimento(calcularVencimento(dataEmissao, prazo));
    }
  }, [prazo, dataEmissao, nota.tipo]);

  const uploadArquivoEdicao = async (): Promise<string | null> => {
    if (!arquivo) return null;
    setUploading(true);
    try {
      const ext = arquivo.name.split('.').pop();
      const path = `${nota.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from('deville-documentos').upload(path, arquivo, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('deville-documentos').getPublicUrl(path);
      return data.publicUrl;
    } catch (e: any) {
      alert('Erro ao enviar arquivo: ' + e.message);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      let docUrl = docUrlAtual || null;
      if (arquivo) {
        const uploaded = await uploadArquivoEdicao();
        if (uploaded) docUrl = uploaded;
      }
      await supabase.from('fornecedor_notas').update({
        numero_nota: numero || null,
        data_emissao: dataEmissao,
        data_vencimento: nota.tipo === 'normal' ? dataVencimento || null : null,
        prazo_pagamento: prazo,
        observacoes: obs || null,
        documento_url: docUrl,
      }).eq('id', nota.id);
      onClose();
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const removerDoc = () => {
    setArquivo(null);
    setDocUrlAtual('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const isImage = (url: string) => /\.(jpg|jpeg|png|webp|heic|gif)(\?|$)/i.test(url);

  return (
    <Modal title={`Editar Nota — ${nota.numero_nota || 'sem número'}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-amber-900/20 border border-amber-500/20 rounded-xl px-3 py-2 text-xs text-amber-300">
          Apenas dados da nota são editáveis. Para alterar itens, exclua e recadastre a nota.
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Número da Nota</label>
            <input className={inputCls} value={numero} onChange={e => setNumero(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Data de Emissão</label>
            <input type="date" className={inputCls} value={dataEmissao} onChange={e => setDataEmissao(e.target.value)} />
          </div>
        </div>
        {nota.tipo === 'normal' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-white/50 mb-1.5">Prazo</label>
              <select className={selectCls} value={prazo} onChange={e => setPrazo(e.target.value)}>
                <option value="d1">D+1</option>
                <option value="d2">D+2</option>
                <option value="d3">D+3</option>
                <option value="semana">Semana</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5">Vencimento</label>
              <input type="date" className={inputCls} value={dataVencimento} onChange={e => { setPrazo('manual'); setDataVencimento(e.target.value); }} />
            </div>
          </div>
        )}
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Observações</label>
          <textarea className={inputCls + ' resize-none'} rows={2} value={obs} onChange={e => setObs(e.target.value)} />
        </div>

        {/* Documento / Imagem */}
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Documento / Imagem</label>

          {/* Preview do doc atual (sem novo arquivo selecionado) */}
          {docUrlAtual && !arquivo && (
            <div className="mb-2 rounded-xl border border-white/10 bg-black/20 overflow-hidden">
              {isImage(docUrlAtual) ? (
                <img src={docUrlAtual} alt="Documento" className="w-full max-h-48 object-contain" />
              ) : (
                <a href={docUrlAtual} target="_blank" rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 py-3 text-blue-400 hover:text-blue-300 text-sm transition-colors">
                  <Paperclip className="w-4 h-4" />
                  Ver documento atual
                </a>
              )}
              <div className="flex items-center justify-between px-3 py-2 border-t border-white/10">
                <span className="text-xs text-white/40">Documento atual</span>
                <button onClick={removerDoc} className="text-xs text-red-400 hover:text-red-300 transition-colors flex items-center gap-1">
                  <X className="w-3 h-3" /> Remover
                </button>
              </div>
            </div>
          )}

          {/* Preview do novo arquivo selecionado */}
          {arquivo && (
            <div className="mb-2 rounded-xl border border-blue-500/30 bg-blue-500/5 px-3 py-2 flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm text-blue-300 min-w-0">
                <Paperclip className="w-4 h-4 shrink-0" />
                <span className="truncate">{arquivo.name}</span>
              </div>
              <button onClick={removerDoc} className="text-white/40 hover:text-red-400 transition-colors ml-2 shrink-0">
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          <input
            ref={fileRef}
            type="file"
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) setArquivo(f); }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-dashed border-white/20 text-white/50 hover:border-white/40 hover:text-white/70 text-sm transition-colors"
          >
            <Upload className="w-4 h-4" />
            {docUrlAtual || arquivo ? 'Substituir arquivo' : 'Anexar documento ou imagem'}
          </button>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/70 hover:bg-white/5 text-sm transition-colors">Cancelar</button>
          <button onClick={save} disabled={saving || uploading} className="flex-1 py-2.5 rounded-xl bg-[#7D1F2C] hover:bg-[#6a1a25] text-white text-sm font-medium transition-colors disabled:opacity-50">
            {saving || uploading ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ModalPagamentoNota({ nota, onClose }: { nota: Nota; onClose: () => void }) {
  const [dataPgto, setDataPgto] = useState(today());
  const [valor, setValor] = useState(String(nota.saldo_restante));
  const [forma, setForma] = useState('pix');
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const v = parseFloat(valor);
    if (!v || v <= 0) return alert('Informe um valor válido.');
    setSaving(true);
    try {
      await supabase.from('fornecedor_pagamentos').insert({
        fornecedor_id: DEVILLE_ID,
        nota_id: nota.id,
        data_pagamento: dataPgto,
        valor: v,
        forma_pagamento: forma,
        observacoes: obs || null,
      });
      const novoValorPago = (nota.valor_pago ?? 0) + v;
      const novoStatus = novoValorPago >= nota.valor_total ? 'pago' : 'parcialmente_pago';
      await supabase.from('fornecedor_notas').update({ valor_pago: novoValorPago, status_pagamento: novoStatus }).eq('id', nota.id);
      onClose();
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Registrar Pagamento" onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-white/5 rounded-xl p-3 text-sm">
          <p className="text-white/50">Nota: <span className="text-white font-medium">{nota.numero_nota || '—'}</span></p>
          <p className="text-white/50 mt-1">Saldo: <span className="text-yellow-300 font-semibold">{fmt(nota.saldo_restante)}</span></p>
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Data do Pagamento</label>
          <input type="date" className={inputCls} value={dataPgto} onChange={e => setDataPgto(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Valor</label>
          <input type="number" step="0.01" className={inputCls} value={valor} onChange={e => setValor(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Forma de Pagamento</label>
          <select className={selectCls} value={forma} onChange={e => setForma(e.target.value)}>
            <option value="pix">PIX</option>
            <option value="dinheiro">Dinheiro</option>
            <option value="transferencia">Transferência</option>
            <option value="boleto">Boleto</option>
            <option value="outro">Outro</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Observações</label>
          <textarea className={inputCls + ' resize-none'} rows={2} value={obs} onChange={e => setObs(e.target.value)} />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/70 hover:bg-white/5 text-sm transition-colors">Cancelar</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-[#7D1F2C] hover:bg-[#6a1a25] text-white text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? 'Confirmando...' : 'Confirmar Pagamento'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA 3 — CONSIGNADOS
// ═══════════════════════════════════════════════════════════════════════════════

interface Requisicao {
  id: string;
  numero: string;
  data_requisicao: string;
  valor_total: number;
  observacoes: string | null;
  status: string;
  criado_em: string;
}

function AbaConsignados() {
  const [notas, setNotas] = useState<ConsignadoNota[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [modalRetirar, setModalRetirar] = useState<ConsignadoNota | null>(null);
  const [modalDev, setModalDev] = useState<{ item: ConsignadoItem; notaId: string } | null>(null);
  const [modalPgto, setModalPgto] = useState<ConsignadoNota | null>(null);

  const load = useCallback(async () => {
    setLoading(true);

    const { data: notasData } = await supabase
      .from('vw_fornecedor_notas_detalhe')
      .select('id, numero_nota, data_entrada, valor_total, valor_pago, saldo_restante, status_pagamento')
      .eq('tipo', 'consignado')
      .eq('status_pagamento', 'consignado_ativo')
      .order('data_entrada', { ascending: false });

    if (!notasData || notasData.length === 0) { setNotas([]); setLoading(false); return; }

    const notasList: ConsignadoNota[] = [];
    for (const n of notasData) {
      const { data: emPoder } = await supabase
        .from('vw_consignado_em_poder')
        .select('*')
        .eq('nota_id', n.id);

      const { data: todosItensRaw } = await supabase
        .from('fornecedor_notas_itens')
        .select('id, quantidade, quantidade_usada, quantidade_devolvida, custo_unitario, item_id, itens_estoque(nome, unidade_medida)')
        .eq('nota_id', n.id);

      const todosItens: ConsignadoItemCompleto[] = (todosItensRaw ?? []).map((i: any) => ({
        id: i.id,
        item: i.itens_estoque?.nome ?? '—',
        unidade: i.itens_estoque?.unidade_medida ?? 'un',
        qtd_entrada: Number(i.quantidade),
        qtd_usada: Number(i.quantidade_usada),
        qtd_devolvida: Number(i.quantidade_devolvida),
        custo_unitario: Number(i.custo_unitario),
      }));

      const notaItemIdMap = new Map<string, string>();
      for (const ti of (todosItensRaw ?? [])) notaItemIdMap.set(ti.id, ti.item_id);

      const emPoderEnriquecido = (emPoder ?? []).map((ep: any) => ({
        ...ep,
        item_id: notaItemIdMap.get(ep.item_consignado_id) ?? ep.item_consignado_id,
      }));

      notasList.push({
        nota_id: n.id,
        numero_nota: n.numero_nota,
        data_entrada: n.data_entrada,
        valor_total: Number(n.valor_total),
        valor_pago: Number(n.valor_pago),
        saldo_restante: Number(n.saldo_restante),
        itens: emPoderEnriquecido,
        todosItens,
      });
    }
    setNotas(notasList);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="py-16 text-center text-white/30">Carregando...</div>;
  if (notas.length === 0) return (
    <div className="py-16 text-center">
      <Package className="mx-auto mb-3 text-white/20" size={36} />
      <p className="text-white/30">Nenhum consignado ativo</p>
      <p className="text-white/20 text-xs mt-1">Notas do tipo consignado com status "consignado_ativo" aparecerão aqui</p>
    </div>
  );

  return (
    <div className="space-y-3">
      {notas.map(nota => {
        const totalEmPoder = nota.itens.reduce((s, i) => s + (i.valor_em_poder ?? 0), 0);
        const totalUsado = nota.todosItens.reduce((s, i) => s + i.qtd_usada * i.custo_unitario, 0);
        return (
          <div key={nota.nota_id} className="bg-[#12141f] border border-white/10 rounded-xl overflow-hidden">
            <button
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-white/[0.02] transition-colors"
              onClick={() => setExpanded(p => p === nota.nota_id ? null : nota.nota_id)}
            >
              <div className="flex items-center gap-3">
                <span className="text-blue-400"><Package size={16} /></span>
                <div>
                  <p className="text-white font-medium">Nota {nota.numero_nota || <span className="text-white/40 italic">sem número</span>}</p>
                  <p className="text-white/40 text-xs">Entrada: {fmtDate(nota.data_entrada)} · {nota.itens.length} itens em poder</p>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <div className="text-right mr-1">
                  <p className="text-[#D4AF37] font-semibold text-sm">{fmt(totalEmPoder)}</p>
                  <p className="text-white/30 text-xs">em poder</p>
                </div>
                {nota.itens.length > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); setModalRetirar(nota); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#7D1F2C]/40 hover:bg-[#7D1F2C] border border-red-700/30 text-red-300 hover:text-white text-xs font-semibold transition-all"
                  >
                    <ArrowDownToLine size={12} /> Retirar p/ Bar
                  </button>
                )}
                {nota.saldo_restante > 0 && (
                  <button
                    onClick={e => { e.stopPropagation(); setModalPgto(nota); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 text-xs transition-colors"
                  >
                    <DollarSign size={12} /> Pagar
                  </button>
                )}
                {expanded === nota.nota_id ? <ChevronDown size={14} className="text-white/30" /> : <ChevronRight size={14} className="text-white/30" />}
              </div>
            </button>

            {expanded === nota.nota_id && (
              <div className="border-t border-white/10">
                <div className="grid grid-cols-3 gap-px bg-white/5 border-b border-white/5">
                  {[
                    { label: 'Valor total nota', val: fmt(nota.valor_total), color: 'text-white' },
                    { label: 'Já utilizado', val: fmt(totalUsado), color: 'text-orange-400' },
                    { label: 'Saldo a pagar', val: fmt(nota.saldo_restante), color: nota.saldo_restante > 0 ? 'text-yellow-300' : 'text-green-400' },
                  ].map(k => (
                    <div key={k.label} className="px-4 py-3 bg-[#12141f]">
                      <p className="text-white/30 text-xs">{k.label}</p>
                      <p className={`font-semibold text-sm ${k.color}`}>{k.val}</p>
                    </div>
                  ))}
                </div>

                {nota.itens.length > 0 && (
                  <div className="overflow-x-auto">
                    <p className="px-4 pt-3 pb-1 text-xs text-white/30 font-medium uppercase tracking-wide">Itens em poder</p>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-white/5">
                          {['Item', 'Un', 'Entrada', 'Usado', 'Dev.', 'Em Poder', 'R$/Un', 'Valor'].map(h => (
                            <th key={h} className="px-4 py-2 text-left text-xs font-medium text-white/25 uppercase tracking-wide whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {nota.itens.map(item => (
                          <tr key={item.item_consignado_id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                            <td className="px-4 py-3 text-white font-medium">{item.item}</td>
                            <td className="px-4 py-3 text-white/50">{item.unidade}</td>
                            <td className="px-4 py-3 text-white/50">{fmtQtd(item.qtd_entrada)}</td>
                            <td className="px-4 py-3 text-orange-400">{fmtQtd(item.qtd_usada)}</td>
                            <td className="px-4 py-3 text-blue-400">{fmtQtd(item.qtd_devolvida)}</td>
                            <td className="px-4 py-3 text-white font-semibold">{fmtQtd(item.qtd_em_poder)}</td>
                            <td className="px-4 py-3 text-white/50">{fmt(item.custo_unitario)}</td>
                            <td className="px-4 py-3 text-[#D4AF37]">{fmt(item.valor_em_poder)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <RequisicoesDaNota notaId={nota.nota_id} notaValorPago={nota.valor_pago} notaValorTotal={nota.valor_total} />
              </div>
            )}
          </div>
        );
      })}

      {modalRetirar && <ModalRetirarParaBar nota={modalRetirar} onClose={() => { setModalRetirar(null); load(); }} />}
      {modalDev && <ModalDevolucao item={modalDev.item} notaId={modalDev.notaId} onClose={() => { setModalDev(null); load(); }} />}
      {modalPgto && <ModalPagamentoConsignado nota={modalPgto} onClose={() => { setModalPgto(null); load(); }} />}
    </div>
  );
}

// ─── Sub-componente: requisições da nota (REQBAR) ────────────────────────────

function RequisicoesDaNota({ notaId, notaValorPago, notaValorTotal }: { notaId: string; notaValorPago: number; notaValorTotal: number }) {
  const [reqs, setReqs] = useState<Requisicao[]>([]);
  const [pagarReq, setPagarReq] = useState<Requisicao | null>(null);

  const load = () => {
    supabase.from('fornecedor_requisicoes')
      .select('*')
      .eq('nota_id', notaId)
      .order('criado_em')
      .then(({ data }) => setReqs(data ?? []));
  };

  useEffect(load, [notaId]);

  if (reqs.length === 0) return null;

  return (
    <>
      <div className="border-t border-white/5 px-4 py-3">
        <p className="text-xs text-white/25 font-medium uppercase tracking-wide mb-2">Requisições Bar</p>
        <div className="space-y-1.5">
          {reqs.map(r => (
            <div key={r.id} className="flex items-center justify-between bg-white/[0.03] rounded-lg px-3 py-2">
              <div className="flex items-center gap-3">
                <span className="text-[#D4AF37] font-mono font-bold text-xs">{r.numero}</span>
                <span className="text-white/40 text-xs">{fmtDate(r.data_requisicao)}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${r.status === 'paga' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                  {r.status === 'paga' ? 'Paga' : 'Em aberto'}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-white text-xs font-semibold">{fmt(r.valor_total)}</span>
                {r.status !== 'paga' && (
                  <button
                    onClick={() => setPagarReq(r)}
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-green-500/10 border border-green-500/20 text-green-400 hover:bg-green-500/20 text-xs transition-colors"
                  >
                    <DollarSign size={11} /> Pagar
                  </button>
                )}
                <button
                  onClick={() => imprimirRequisicao(r)}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-white/40 hover:text-white transition-colors"
                  title="Baixar PDF"
                >
                  <Printer size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {pagarReq && (
        <ModalPagarRequisicao
          req={pagarReq}
          notaId={notaId}
          notaValorPago={notaValorPago}
          notaValorTotal={notaValorTotal}
          onClose={() => { setPagarReq(null); load(); }}
        />
      )}
    </>
  );
}

// ─── Modal pagar uma REQBAR específica ───────────────────────────────────────

function ModalPagarRequisicao({
  req, notaId, notaValorPago, notaValorTotal, onClose,
}: {
  req: Requisicao;
  notaId: string;
  notaValorPago: number;
  notaValorTotal: number;
  onClose: () => void;
}) {
  const [dataPgto, setDataPgto] = useState(today());
  const [valor, setValor] = useState(String(req.valor_total.toFixed(2)));
  const [forma, setForma] = useState('pix');
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const v = parseFloat(valor);
    if (!v || v <= 0) return alert('Informe um valor válido.');
    setSaving(true);
    try {
      await supabase.from('fornecedor_pagamentos').insert({
        fornecedor_id: DEVILLE_ID,
        nota_id: notaId,
        requisicao_id: req.id,
        data_pagamento: dataPgto,
        valor: v,
        forma_pagamento: forma,
        observacoes: obs || null,
      });
      await supabase.from('fornecedor_requisicoes').update({ status: 'paga' }).eq('id', req.id);
      const novoValorPago = notaValorPago + v;
      const novoStatus = novoValorPago >= notaValorTotal ? 'pago' : 'consignado_ativo';
      await supabase.from('fornecedor_notas').update({ valor_pago: novoValorPago, status_pagamento: novoStatus }).eq('id', notaId);
      onClose();
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`Pagar ${req.numero}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-[#D4AF37]/10 border border-[#D4AF37]/20 rounded-xl px-4 py-3 text-sm">
          <p className="text-[#D4AF37] font-bold font-mono">{req.numero}</p>
          <p className="text-white/60 text-xs mt-0.5">Requisição de {fmtDate(req.data_requisicao)}</p>
          <div className="flex gap-4 mt-2 pt-2 border-t border-white/10">
            <div><p className="text-white/30 text-xs">Valor da requisição</p><p className="text-white font-semibold">{fmt(req.valor_total)}</p></div>
            {req.observacoes && <div><p className="text-white/30 text-xs">Obs.</p><p className="text-white/70">{req.observacoes}</p></div>}
          </div>
        </div>

        <div>
          <label className="block text-xs text-white/50 mb-1.5">Data do Pagamento</label>
          <input type="date" className={inputCls} value={dataPgto} onChange={e => setDataPgto(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Valor</label>
          <input type="number" step="0.01" min="0.01" className={inputCls} value={valor} onChange={e => setValor(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Forma de Pagamento</label>
          <select className={selectCls} value={forma} onChange={e => setForma(e.target.value)}>
            <option value="pix">PIX</option>
            <option value="dinheiro">Dinheiro</option>
            <option value="transferencia">Transferência</option>
            <option value="boleto">Boleto</option>
            <option value="outro">Outro</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Observações</label>
          <textarea className={inputCls + ' resize-none'} rows={2} value={obs} onChange={e => setObs(e.target.value)} />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/70 hover:bg-white/5 text-sm transition-colors">Cancelar</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-green-700 hover:bg-green-600 text-white text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? 'Confirmando...' : 'Confirmar Pagamento'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Imprimir requisição REQBAR ───────────────────────────────────────────────

async function imprimirRequisicao(req: Requisicao) {
  const { data: itens } = await supabase
    .from('fornecedor_requisicoes_itens')
    .select('*')
    .eq('requisicao_id', req.id);

  const lista = itens ?? [];
  const total = lista.reduce((s, i) => s + Number(i.custo_total ?? 0), 0);
  const agora = new Date().toLocaleString('pt-BR');

  // Monta o conteúdo HTML em um div oculto na página atual (sem popup)
  const container = document.createElement('div');
  container.style.cssText = [
    'position:fixed', 'left:-9999px', 'top:0', 'width:794px',
    'background:#fff', 'color:#1a1a1a', 'font-family:Arial,sans-serif',
    'padding:40px', 'font-size:13px', 'line-height:1.5',
  ].join(';');

  const linhasHtml = lista.map(i => `
    <tr style="background:${lista.indexOf(i) % 2 === 0 ? '#fff' : '#f9f9f9'}">
      <td style="padding:9px 12px;border-bottom:1px solid #eee">${i.item_nome ?? '—'}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #eee;text-align:center">${fmtQtd(Number(i.quantidade))} ${i.unidade ?? ''}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #eee;text-align:right">${fmt(Number(i.custo_unitario))}</td>
      <td style="padding:9px 12px;border-bottom:1px solid #eee;text-align:right;font-weight:700">${fmt(Number(i.custo_total ?? 0))}</td>
    </tr>`).join('');

  container.innerHTML = `
    <div style="border-bottom:3px solid #1a2a4a;padding-bottom:18px;margin-bottom:20px">
      <div style="display:inline-block;background:#1a2a4a;color:#fff;padding:5px 16px;border-radius:5px;font-size:20px;font-weight:900;letter-spacing:1px;margin-bottom:5px">${req.numero}</div>
      <div style="font-size:12px;font-weight:600;color:#555;text-transform:uppercase;letter-spacing:0.5px;margin-top:3px">Requisição de Entrada — Consignado De Ville</div>
      <div style="font-size:10px;color:#999;margin-top:2px">Gerado em: ${agora}</div>
    </div>

    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:12px;background:#f5f5f5;border-radius:6px">
      <tr>
        <td style="padding:10px 14px"><div style="color:#777;font-size:10px">Fornecedor</div><div style="font-weight:600">De Ville Distribuidora de Bebidas</div></td>
        <td style="padding:10px 14px"><div style="color:#777;font-size:10px">Data da Requisição</div><div style="font-weight:600">${fmtDate(req.data_requisicao)}</div></td>
        <td style="padding:10px 14px"><div style="color:#777;font-size:10px">Status</div><div style="font-weight:600">${req.status === 'paga' ? 'Paga' : 'Em Aberto'}</div></td>
      </tr>
      ${req.observacoes ? `<tr><td colspan="3" style="padding:8px 14px;border-top:1px solid #e0e0e0"><div style="color:#777;font-size:10px">Observações</div><div style="font-weight:600">${req.observacoes}</div></td></tr>` : ''}
    </table>

    <table style="width:100%;border-collapse:collapse;margin-bottom:16px;font-size:13px">
      <thead>
        <tr style="background:#1a2a4a">
          <th style="color:#fff;padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.3px">Item</th>
          <th style="color:#fff;padding:9px 12px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.3px">Quantidade</th>
          <th style="color:#fff;padding:9px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.3px">R$/Un</th>
          <th style="color:#fff;padding:9px 12px;text-align:right;font-size:11px;text-transform:uppercase;letter-spacing:0.3px">Total</th>
        </tr>
      </thead>
      <tbody>${linhasHtml}</tbody>
      <tfoot>
        <tr style="background:#1a2a4a">
          <td colspan="3" style="color:#fff;font-weight:700;font-size:13px;padding:11px 12px">TOTAL DA REQUISIÇÃO</td>
          <td style="color:#fff;font-weight:700;font-size:13px;padding:11px 12px;text-align:right">${fmt(total)}</td>
        </tr>
      </tfoot>
    </table>

    <div style="background:#fff8e1;border:1.5px solid #f0c040;border-radius:7px;padding:13px 15px;font-size:11px;color:#7a5f00;line-height:1.7">
      <div style="font-size:12px;color:#5a4000;font-weight:700;margin-bottom:3px">USO INTERNO — SETOR DE COMPRAS</div>
      Dar entrada no sistema do bar apenas nos itens e quantidades listados acima.<br>
      Estes itens foram retirados do lote consignado De Ville para uso no bar.<br>
      Esta requisição <strong>não</strong> representa nova compra — é regularização de consumo.
    </div>

    <div style="display:flex;justify-content:space-between;margin-top:52px">
      <div style="text-align:center;width:190px">
        <div style="border-top:1px solid #aaa;padding-top:5px;font-size:10px;color:#666">Responsável pela Retirada</div>
      </div>
      <div style="text-align:center;width:190px">
        <div style="border-top:1px solid #aaa;padding-top:5px;font-size:10px;color:#666">Setor de Compras / Recebimento</div>
      </div>
      <div style="text-align:center;width:190px">
        <div style="border-top:1px solid #aaa;padding-top:5px;font-size:10px;color:#666">Data: ___/___/______</div>
      </div>
    </div>
  `;

  document.body.appendChild(container);

  try {
    const [{ default: html2canvas }, { default: jsPDF }] = await Promise.all([
      import('html2canvas'),
      import('jspdf'),
    ]);

    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#ffffff',
    });

    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = canvas.height / canvas.width;
    const imgH = pageW * ratio;

    // Se maior que uma página, divide em páginas
    if (imgH <= pageH) {
      pdf.addImage(imgData, 'PNG', 0, 0, pageW, imgH);
    } else {
      let yOffset = 0;
      while (yOffset < imgH) {
        pdf.addImage(imgData, 'PNG', 0, -yOffset, pageW, imgH);
        yOffset += pageH;
        if (yOffset < imgH) pdf.addPage();
      }
    }

    pdf.save(`${req.numero}.pdf`);
  } finally {
    document.body.removeChild(container);
  }
}

// ─── Modal Retirar para o Bar (multi-item, cria REQBAR) ───────────────────────

function ModalRetirarParaBar({ nota, onClose }: { nota: ConsignadoNota; onClose: () => void }) {
  type Sel = { checked: boolean; qtd: string };
  const [sel, setSel] = useState<Record<string, Sel>>(() =>
    Object.fromEntries(nota.itens.map(i => [i.item_consignado_id, { checked: false, qtd: '' }]))
  );
  const [dataReq, setDataReq] = useState(today());
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) =>
    setSel(p => ({ ...p, [id]: { ...p[id], checked: !p[id].checked } }));

  const setQtd = (id: string, v: string) =>
    setSel(p => ({ ...p, [id]: { checked: true, qtd: v } }));

  const itensSelecionados = nota.itens.filter(i => {
    const s = sel[i.item_consignado_id];
    return s?.checked && parseFloat(s.qtd) > 0;
  });

  const total = itensSelecionados.reduce((acc, i) => {
    const q = parseFloat(sel[i.item_consignado_id].qtd) || 0;
    return acc + q * i.custo_unitario;
  }, 0);

  const save = async () => {
    if (itensSelecionados.length === 0) return alert('Selecione ao menos um item com quantidade.');
    for (const item of itensSelecionados) {
      const q = parseFloat(sel[item.item_consignado_id].qtd);
      if (q > item.qtd_em_poder) return alert(`Quantidade de "${item.item}" excede o em poder (${fmtQtd(item.qtd_em_poder)}).`);
    }
    setSaving(true);
    try {
      const { data: numData } = await supabase.rpc('next_reqbar_numero', { p_fornecedor_id: DEVILLE_ID });
      const numero = numData ?? `REQBAR-${Date.now()}`;

      const { data: req, error: errReq } = await supabase
        .from('fornecedor_requisicoes')
        .insert({
          fornecedor_id: DEVILLE_ID, nota_id: nota.nota_id,
          numero, data_requisicao: dataReq,
          valor_total: total, observacoes: obs || null, status: 'aberta',
        })
        .select()
        .single();

      if (errReq || !req) throw new Error(errReq?.message ?? 'Erro ao criar requisição');

      for (const item of itensSelecionados) {
        const q = parseFloat(sel[item.item_consignado_id].qtd);

        await supabase.from('fornecedor_requisicoes_itens').insert({
          requisicao_id: req.id,
          nota_item_id: item.item_consignado_id,
          item_id: item.item_id,
          item_nome: item.item,
          unidade: item.unidade,
          quantidade: q,
          custo_unitario: item.custo_unitario,
        });

        await supabase.from('fornecedor_notas_itens')
          .update({ quantidade_usada: (item.qtd_usada ?? 0) + q })
          .eq('id', item.item_consignado_id);

        await supabase.from('fornecedor_estoque_movimentos').insert({
          fornecedor_id: DEVILLE_ID, item_id: item.item_id,
          nota_id: nota.nota_id, nota_item_id: item.item_consignado_id,
          tipo: 'saida', origem: 'consignado_retirada',
          quantidade: q, custo_unitario: item.custo_unitario, data_movimento: dataReq,
        });
      }

      onClose();
      setTimeout(() => imprimirRequisicao({ ...req, valor_total: total }), 200);
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Retirar para o Bar" onClose={onClose} wide>
      <div className="space-y-4">
        <div className="bg-[#7D1F2C]/10 border border-red-700/20 rounded-xl px-3 py-2 text-xs text-red-300/80">
          Selecione os itens e as quantidades a retirar. Será gerado um documento <strong>REQBAR</strong> para o setor de compras dar entrada no estoque do bar.
        </div>

        <div className="bg-white/5 rounded-xl p-3 text-sm">
          <p className="text-white/50">Nota: <span className="text-white font-medium">{nota.numero_nota || 'sem número'}</span></p>
          <p className="text-white/40 text-xs mt-0.5">Entrada: {fmtDate(nota.data_entrada)}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                <th className="w-8 py-2" />
                <th className="px-3 py-2 text-left text-xs text-white/30 uppercase tracking-wide">Item</th>
                <th className="px-3 py-2 text-center text-xs text-white/30 uppercase tracking-wide">Disponível</th>
                <th className="px-3 py-2 text-center text-xs text-white/30 uppercase tracking-wide">Qtd a retirar</th>
                <th className="px-3 py-2 text-right text-xs text-white/30 uppercase tracking-wide">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {nota.itens.map(item => {
                const s = sel[item.item_consignado_id];
                const q = parseFloat(s?.qtd) || 0;
                const sub = q * item.custo_unitario;
                return (
                  <tr key={item.item_consignado_id} className={`border-b border-white/5 transition-colors ${s?.checked ? 'bg-white/[0.04]' : 'hover:bg-white/[0.02]'}`}>
                    <td className="pl-3 py-3">
                      <input
                        type="checkbox"
                        checked={s?.checked ?? false}
                        onChange={() => toggle(item.item_consignado_id)}
                        className="w-4 h-4 rounded accent-[#D4AF37]"
                      />
                    </td>
                    <td className="px-3 py-3">
                      <p className="text-white font-medium">{item.item}</p>
                      <p className="text-white/35 text-xs">{fmt(item.custo_unitario)}/{item.unidade}</p>
                    </td>
                    <td className="px-3 py-3 text-center text-white/70">{fmtQtd(item.qtd_em_poder)} {item.unidade}</td>
                    <td className="px-3 py-3">
                      <input
                        type="number"
                        min="0"
                        max={item.qtd_em_poder}
                        step="0.001"
                        value={s?.qtd ?? ''}
                        onChange={e => setQtd(item.item_consignado_id, e.target.value)}
                        onClick={() => !s?.checked && toggle(item.item_consignado_id)}
                        className="bg-white/5 border border-white/20 text-white rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-white/40 w-28 text-center"
                        placeholder="0"
                      />
                    </td>
                    <td className="px-3 py-3 text-right">
                      {s?.checked && q > 0 ? <span className="text-[#D4AF37] font-semibold">{fmt(sub)}</span> : <span className="text-white/20">—</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {itensSelecionados.length > 0 && (
          <div className="flex justify-between items-center bg-[#D4AF37]/10 border border-[#D4AF37]/20 rounded-xl px-4 py-3">
            <span className="text-white/60 text-sm">{itensSelecionados.length} item(ns) selecionado(s)</span>
            <span className="text-[#D4AF37] font-bold">{fmt(total)}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Data da Requisição</label>
            <input type="date" className={inputCls} value={dataReq} onChange={e => setDataReq(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Observações</label>
            <input type="text" className={inputCls} value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional" />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/70 hover:bg-white/5 text-sm transition-colors">Cancelar</button>
          <button
            onClick={save}
            disabled={saving || itensSelecionados.length === 0}
            className="flex-1 py-2.5 rounded-xl bg-[#7D1F2C] hover:bg-[#6a1a25] text-white text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            <Printer size={14} />
            {saving ? 'Criando...' : `Criar REQBAR e Imprimir`}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal Pagamento Consignado (com seletor de requisição) ───────────────────

function ModalPagamentoConsignado({ nota, onClose }: { nota: ConsignadoNota; onClose: () => void }) {
  const [dataPgto, setDataPgto] = useState(today());
  const [valor, setValor] = useState(String(nota.saldo_restante.toFixed(2)));
  const [forma, setForma] = useState('pix');
  const [obs, setObs] = useState('');
  const [requisicaoId, setRequisicaoId] = useState('');
  const [requisicoes, setRequisicoes] = useState<Requisicao[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('fornecedor_requisicoes')
      .select('*')
      .eq('nota_id', nota.nota_id)
      .eq('status', 'aberta')
      .order('criado_em')
      .then(({ data }) => setRequisicoes(data ?? []));
  }, [nota.nota_id]);

  useEffect(() => {
    if (requisicaoId) {
      const r = requisicoes.find(r => r.id === requisicaoId);
      if (r) setValor(String(r.valor_total.toFixed(2)));
    }
  }, [requisicaoId, requisicoes]);

  const save = async () => {
    const v = parseFloat(valor);
    if (!v || v <= 0) return alert('Informe um valor válido.');
    setSaving(true);
    try {
      await supabase.from('fornecedor_pagamentos').insert({
        fornecedor_id: DEVILLE_ID, nota_id: nota.nota_id,
        requisicao_id: requisicaoId || null,
        data_pagamento: dataPgto, valor: v,
        forma_pagamento: forma, observacoes: obs || null,
      });
      if (requisicaoId) {
        await supabase.from('fornecedor_requisicoes').update({ status: 'paga' }).eq('id', requisicaoId);
      }
      const novoValorPago = nota.valor_pago + v;
      const novoStatus = novoValorPago >= nota.valor_total ? 'pago' : 'consignado_ativo';
      await supabase.from('fornecedor_notas').update({ valor_pago: novoValorPago, status_pagamento: novoStatus }).eq('id', nota.nota_id);
      onClose();
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Registrar Pagamento — Consignado" onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-white/5 rounded-xl p-3 text-sm space-y-1">
          <p className="text-white font-medium">Nota {nota.numero_nota || <span className="text-white/40 italic">sem número</span>}</p>
          <p className="text-white/50">Entrada: <span className="text-white">{fmtDate(nota.data_entrada)}</span></p>
          <div className="flex gap-4 mt-2 pt-2 border-t border-white/10">
            <div><p className="text-white/30 text-xs">Total nota</p><p className="text-white font-medium">{fmt(nota.valor_total)}</p></div>
            <div><p className="text-white/30 text-xs">Já pago</p><p className="text-green-400 font-medium">{fmt(nota.valor_pago)}</p></div>
            <div><p className="text-white/30 text-xs">Saldo restante</p><p className="text-yellow-300 font-bold">{fmt(nota.saldo_restante)}</p></div>
          </div>
        </div>

        {requisicoes.length > 0 && (
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Vincular a uma Requisição Bar <span className="text-white/25">(opcional)</span></label>
            <select className={selectCls} value={requisicaoId} onChange={e => setRequisicaoId(e.target.value)}>
              <option value="">— Pagamento geral (sem vincular) —</option>
              {requisicoes.map(r => (
                <option key={r.id} value={r.id}>{r.numero} — {fmt(r.valor_total)} — {fmtDate(r.data_requisicao)}</option>
              ))}
            </select>
          </div>
        )}

        <div>
          <label className="block text-xs text-white/50 mb-1.5">Data do Pagamento</label>
          <input type="date" className={inputCls} value={dataPgto} onChange={e => setDataPgto(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Valor <span className="text-white/25">(parcial permitido)</span></label>
          <input type="number" step="0.01" min="0.01" className={inputCls} value={valor} onChange={e => setValor(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Forma de Pagamento</label>
          <select className={selectCls} value={forma} onChange={e => setForma(e.target.value)}>
            <option value="pix">PIX</option>
            <option value="dinheiro">Dinheiro</option>
            <option value="transferencia">Transferência</option>
            <option value="boleto">Boleto</option>
            <option value="outro">Outro</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Observações</label>
          <textarea className={inputCls + ' resize-none'} rows={2} value={obs} onChange={e => setObs(e.target.value)} />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/70 hover:bg-white/5 text-sm transition-colors">Cancelar</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-[#7D1F2C] hover:bg-[#6a1a25] text-white text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? 'Confirmando...' : 'Confirmar Pagamento'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

function ModalUso({ item, notaId, notaNumero, onClose }: { item: ConsignadoItem; notaId: string; notaNumero: string; onClose: () => void }) {
  const [qtd, setQtd] = useState('');
  const [data, setData] = useState(today());
  const [obs, setObs] = useState('');
  const [gerarPgto, setGerarPgto] = useState(false);
  const [forma, setForma] = useState('pix');
  const [valorPgto, setValorPgto] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const q = parseFloat(qtd) || 0;
    setValorPgto(q > 0 ? String((q * item.custo_unitario).toFixed(2)) : '');
  }, [qtd, item.custo_unitario]);

  const save = async () => {
    const q = parseFloat(qtd);
    if (!q || q <= 0 || q > item.qtd_em_poder) return alert('Quantidade inválida.');
    setSaving(true);
    try {
      await supabase.from('fornecedor_consignado_movimentos').insert({
        nota_item_id: item.item_consignado_id, tipo: 'uso', quantidade: q, data_movimento: data, observacoes: obs || null,
      });
      await supabase.from('fornecedor_notas_itens').update({ quantidade_usada: (item.qtd_usada ?? 0) + q }).eq('id', item.item_consignado_id);
      await supabase.from('fornecedor_estoque_movimentos').insert({
        fornecedor_id: DEVILLE_ID, item_id: item.item_id,
        nota_id: notaId, nota_item_id: item.item_consignado_id,
        tipo: 'saida', origem: 'consignado_uso', quantidade: q, custo_unitario: item.custo_unitario, data_movimento: data,
      });
      if (gerarPgto) {
        const vp = parseFloat(valorPgto) || q * item.custo_unitario;
        await supabase.from('fornecedor_pagamentos').insert({
          fornecedor_id: DEVILLE_ID, nota_id: notaId,
          data_pagamento: data, valor: vp, forma_pagamento: forma,
        });
        const { data: notaData } = await supabase.from('fornecedor_notas').select('valor_pago, valor_total').eq('id', notaId).single();
        if (notaData) {
          const novoValorPago = (notaData.valor_pago ?? 0) + vp;
          const novoStatus = novoValorPago >= notaData.valor_total ? 'pago' : 'consignado_ativo';
          await supabase.from('fornecedor_notas').update({ valor_pago: novoValorPago, status_pagamento: novoStatus }).eq('id', notaId);
        }
      }
      onClose();
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Retirar para o Estoque do Bar" onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-[#7D1F2C]/10 border border-red-700/20 rounded-xl px-3 py-2 text-xs text-red-300/80">
          Registra a saída do consignado De Ville e gera documento para o setor de compras dar entrada no estoque do bar.
        </div>
        <div className="bg-white/5 rounded-xl p-3 text-sm space-y-1">
          <p className="text-white font-medium">{item.item}</p>
          <p className="text-white/50">Em poder: <span className="text-white font-semibold">{fmtQtd(item.qtd_em_poder)} {item.unidade}</span></p>
          <p className="text-white/50">Custo unitário: <span className="text-white">{fmt(item.custo_unitario)}</span></p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Quantidade a retirar</label>
            <input type="number" min="0" max={item.qtd_em_poder} step="0.001" className={inputCls} value={qtd} onChange={e => setQtd(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Data</label>
            <input type="date" className={inputCls} value={data} onChange={e => setData(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Observações</label>
          <textarea className={inputCls + ' resize-none'} rows={2} value={obs} onChange={e => setObs(e.target.value)} />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" checked={gerarPgto} onChange={e => setGerarPgto(e.target.checked)} className="w-4 h-4 rounded" />
          <span className="text-sm text-white/70">Registrar pagamento agora</span>
        </label>
        {gerarPgto && (
          <div className="grid grid-cols-2 gap-3 pl-6 border-l-2 border-white/10">
            <div>
              <label className="block text-xs text-white/50 mb-1.5">Forma</label>
              <select className={selectCls} value={forma} onChange={e => setForma(e.target.value)}>
                <option value="pix">PIX</option>
                <option value="dinheiro">Dinheiro</option>
                <option value="transferencia">Transferência</option>
                <option value="boleto">Boleto</option>
                <option value="outro">Outro</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5">Valor</label>
              <input type="number" step="0.01" className={inputCls} value={valorPgto} onChange={e => setValorPgto(e.target.value)} />
            </div>
          </div>
        )}
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/70 hover:bg-white/5 text-sm transition-colors">Cancelar</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-[#7D1F2C] hover:bg-[#6a1a25] text-white text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? 'Registrando...' : 'Confirmar Retirada'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal Devolução ──────────────────────────────────────────────────────────

function ModalDevolucao({ item, notaId, onClose }: { item: ConsignadoItem; notaId: string; onClose: () => void }) {
  const [qtd, setQtd] = useState('');
  const [data, setData] = useState(today());
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const q = parseFloat(qtd);
    if (!q || q <= 0 || q > item.qtd_em_poder) return alert('Quantidade inválida.');
    setSaving(true);
    try {
      await supabase.from('fornecedor_consignado_movimentos').insert({
        nota_item_id: item.item_consignado_id, tipo: 'devolucao', quantidade: q, data_movimento: data, observacoes: obs || null,
      });
      await supabase.from('fornecedor_notas_itens').update({ quantidade_devolvida: (item.qtd_devolvida ?? 0) + q }).eq('id', item.item_consignado_id);
      await supabase.from('fornecedor_estoque_movimentos').insert({
        fornecedor_id: DEVILLE_ID, item_id: item.item_id,
        nota_id: notaId, nota_item_id: item.item_consignado_id,
        tipo: 'devolucao', origem: 'consignado_devolucao',
        quantidade: q, custo_unitario: item.custo_unitario, data_movimento: data,
      });
      onClose();
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Registrar Devolução" onClose={onClose}>
      <div className="space-y-4">
        <div className="bg-white/5 rounded-xl p-3 text-sm space-y-1">
          <p className="text-white font-medium">{item.item}</p>
          <p className="text-white/50">Em poder: <span className="text-white">{fmtQtd(item.qtd_em_poder)} {item.unidade}</span></p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Quantidade a devolver</label>
            <input type="number" min="0" max={item.qtd_em_poder} step="0.001" className={inputCls} value={qtd} onChange={e => setQtd(e.target.value)} />
          </div>
          <div>
            <label className="block text-xs text-white/50 mb-1.5">Data</label>
            <input type="date" className={inputCls} value={data} onChange={e => setData(e.target.value)} />
          </div>
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Observações</label>
          <textarea className={inputCls + ' resize-none'} rows={2} value={obs} onChange={e => setObs(e.target.value)} />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/70 hover:bg-white/5 text-sm transition-colors">Cancelar</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-[#7D1F2C] hover:bg-[#6a1a25] text-white text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? 'Confirmando...' : 'Confirmar Devolução'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA 4 — PAGAMENTOS
// ═══════════════════════════════════════════════════════════════════════════════

function AbaPagamentos() {
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [loading, setLoading] = useState(true);
  const [periodo, setPeriodo] = useState<'semana' | 'mes' | 'tudo' | 'personalizado'>('mes');
  const [dataInicio, setDataInicio] = useState(() => { const d = new Date(); d.setDate(1); return d.toISOString().split('T')[0]; });
  const [dataFim, setDataFim] = useState(today());
  const [showNovoPgto, setShowNovoPgto] = useState(false);
  const [editarPgto, setEditarPgto] = useState<Pagamento | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from('fornecedor_pagamentos')
      .select('*, fornecedor_notas(numero_nota, tipo)')
      .eq('fornecedor_id', DEVILLE_ID)
      .order('data_pagamento', { ascending: false });

    if (periodo !== 'tudo') {
      let ini = dataInicio, fim = dataFim;
      if (periodo === 'mes') {
        const now = new Date();
        ini = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        fim = today();
      } else if (periodo === 'semana') {
        const now = new Date();
        const day = now.getDay();
        const diff = now.getDate() - day + (day === 0 ? -6 : 1);
        ini = new Date(new Date().setDate(diff)).toISOString().split('T')[0];
        fim = today();
      }
      query = query.gte('data_pagamento', ini).lte('data_pagamento', fim);
    }

    const { data } = await query;
    setPagamentos((data ?? []).map((d: any) => ({
      ...d,
      numero_nota: d.fornecedor_notas?.numero_nota,
      tipo_nota: d.fornecedor_notas?.tipo,
    })));
    setLoading(false);
  }, [periodo, dataInicio, dataFim]);

  useEffect(() => { load(); }, [load]);

  const totalPeriodo = pagamentos.reduce((s, p) => s + Number(p.valor), 0);

  const deletarPagamento = async (p: Pagamento) => {
    if (!window.confirm('Excluir este pagamento? O saldo da nota NÃO será recalculado automaticamente — ajuste manualmente se necessário.')) return;
    await supabase.from('fornecedor_pagamentos').delete().eq('id', p.id);
    load();
  };

  const formaLabel: Record<string, string> = { pix: 'PIX', dinheiro: 'Dinheiro', transferencia: 'Transferência', boleto: 'Boleto', outro: 'Outro' };
  const formaColor: Record<string, string> = { pix: 'text-teal-400', dinheiro: 'text-green-400', transferencia: 'text-blue-400', boleto: 'text-orange-400', outro: 'text-white/50' };

  return (
    <div>
      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="flex rounded-xl overflow-hidden border border-white/20">
          {(['semana', 'mes', 'tudo', 'personalizado'] as const).map(p => (
            <button key={p} onClick={() => setPeriodo(p)} className={`px-3 py-2 text-xs font-medium transition-colors ${periodo === p ? 'bg-[#7D1F2C] text-white' : 'text-white/50 hover:text-white hover:bg-white/5'}`}>
              {p === 'personalizado' ? 'Período' : p === 'mes' ? 'Este mês' : p === 'semana' ? 'Esta semana' : 'Todos'}
            </button>
          ))}
        </div>
        {periodo === 'personalizado' && (
          <div className="flex items-center gap-2">
            <input type="date" className={inputCls + ' w-auto'} value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
            <span className="text-white/30 text-sm">até</span>
            <input type="date" className={inputCls + ' w-auto'} value={dataFim} onChange={e => setDataFim(e.target.value)} />
          </div>
        )}
        <button onClick={load} className="p-2.5 rounded-xl border border-white/20 text-white/40 hover:text-white hover:bg-white/5 transition-colors"><RefreshCw size={14} /></button>
        <div className="ml-auto">
          <button onClick={() => setShowNovoPgto(true)} className="flex items-center gap-2 px-4 py-2 bg-[#7D1F2C] hover:bg-[#6a1a25] text-white rounded-xl text-sm font-medium transition-colors">
            <Plus size={14} /> Novo Pagamento
          </button>
        </div>
      </div>

      {/* KPI total */}
      <div className="bg-[#12141f] border border-white/10 rounded-xl p-4 mb-4 flex items-center justify-between">
        <div>
          <p className="text-white/40 text-xs">Total pago no período</p>
          <p className="text-[#D4AF37] text-2xl font-bold mt-0.5">{fmt(totalPeriodo)}</p>
        </div>
        <div className="text-right">
          <p className="text-white/40 text-xs">{pagamentos.length} pagamentos</p>
        </div>
      </div>

      <div className="bg-[#12141f] border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/10">
                {['Data', 'Nota vinculada', 'Tipo nota', 'Forma', 'Valor', 'Observações', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-white/40 uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="py-8 text-center text-white/30">Carregando...</td></tr>
              ) : pagamentos.length === 0 ? (
                <tr><td colSpan={7} className="py-8 text-center text-white/30">Nenhum pagamento no período</td></tr>
              ) : pagamentos.map(p => (
                <tr key={p.id} className="border-b border-white/5 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-4 py-3 text-white/70 whitespace-nowrap">{fmtDate(p.data_pagamento)}</td>
                  <td className="px-4 py-3">
                    {p.nota_id
                      ? <span className="text-white font-medium">{(p as any).numero_nota || <span className="text-white/40 italic">s/ número</span>}</span>
                      : <span className="text-white/25 italic text-xs">Acerto geral</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    {(p as any).tipo_nota
                      ? <span className={`px-2 py-0.5 rounded-full text-xs ${(p as any).tipo_nota === 'consignado' ? 'text-blue-300 bg-blue-900/30' : 'text-white/40 bg-white/5'}`}>
                          {(p as any).tipo_nota === 'consignado' ? 'Consignado' : 'Normal'}
                        </span>
                      : <span className="text-white/20 text-xs">—</span>
                    }
                  </td>
                  <td className="px-4 py-3">
                    <span className={`text-xs font-semibold ${formaColor[p.forma_pagamento] ?? 'text-white/50'}`}>
                      {formaLabel[p.forma_pagamento] ?? p.forma_pagamento}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#D4AF37] font-semibold">{fmt(Number(p.valor))}</td>
                  <td className="px-4 py-3 text-white/40 text-xs max-w-xs truncate">{p.observacoes || '—'}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={() => setEditarPgto(p)} className="p-1.5 text-white/30 hover:text-blue-400 transition-colors rounded-lg hover:bg-white/5" title="Editar"><Pencil size={12} /></button>
                      <button onClick={() => deletarPagamento(p)} className="p-1.5 text-white/30 hover:text-red-400 transition-colors rounded-lg hover:bg-white/5" title="Excluir"><Trash2 size={12} /></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {showNovoPgto && <ModalNovoPagamento onClose={() => { setShowNovoPgto(false); load(); }} />}
      {editarPgto && <ModalEditarPagamento pagamento={editarPgto} onClose={() => { setEditarPgto(null); load(); }} />}
    </div>
  );
}

// ─── Modal Editar Pagamento ───────────────────────────────────────────────────

function ModalEditarPagamento({ pagamento, onClose }: { pagamento: Pagamento; onClose: () => void }) {
  const [dataPgto, setDataPgto] = useState(pagamento.data_pagamento);
  const [valor, setValor] = useState(String(Number(pagamento.valor).toFixed(2)));
  const [forma, setForma] = useState(pagamento.forma_pagamento);
  const [obs, setObs] = useState(pagamento.observacoes || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    const v = parseFloat(valor);
    if (!v || v <= 0) return alert('Informe um valor válido.');
    setSaving(true);
    try {
      const diff = v - Number(pagamento.valor);
      await supabase.from('fornecedor_pagamentos').update({
        data_pagamento: dataPgto, valor: v, forma_pagamento: forma, observacoes: obs || null,
      }).eq('id', pagamento.id);
      // Recalcular valor_pago na nota se houve diferença
      if (pagamento.nota_id && diff !== 0) {
        const { data: notaData } = await supabase.from('fornecedor_notas').select('valor_pago, valor_total, tipo').eq('id', pagamento.nota_id).single();
        if (notaData) {
          const novoValorPago = Math.max(0, Number(notaData.valor_pago) + diff);
          let novoStatus = novoValorPago >= Number(notaData.valor_total) ? 'pago'
            : notaData.tipo === 'consignado' ? 'consignado_ativo' : novoValorPago > 0 ? 'parcialmente_pago' : 'em_aberto';
          await supabase.from('fornecedor_notas').update({ valor_pago: novoValorPago, status_pagamento: novoStatus }).eq('id', pagamento.nota_id);
        }
      }
      onClose();
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Editar Pagamento" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Data do Pagamento</label>
          <input type="date" className={inputCls} value={dataPgto} onChange={e => setDataPgto(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Valor</label>
          <input type="number" step="0.01" className={inputCls} value={valor} onChange={e => setValor(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Forma de Pagamento</label>
          <select className={selectCls} value={forma} onChange={e => setForma(e.target.value)}>
            <option value="pix">PIX</option>
            <option value="dinheiro">Dinheiro</option>
            <option value="transferencia">Transferência</option>
            <option value="boleto">Boleto</option>
            <option value="outro">Outro</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Observações</label>
          <textarea className={inputCls + ' resize-none'} rows={2} value={obs} onChange={e => setObs(e.target.value)} />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/70 hover:bg-white/5 text-sm transition-colors">Cancelar</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-[#7D1F2C] hover:bg-[#6a1a25] text-white text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? 'Salvando...' : 'Salvar Alterações'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ─── Modal Novo Pagamento (seleciona nota + suporte parcial) ──────────────────

function ModalNovoPagamento({ onClose }: { onClose: () => void }) {
  const [notas, setNotas] = useState<Nota[]>([]);
  const [notaId, setNotaId] = useState<string>('');
  const [dataPgto, setDataPgto] = useState(today());
  const [valor, setValor] = useState('');
  const [forma, setForma] = useState('pix');
  const [obs, setObs] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase.from('vw_fornecedor_notas_detalhe').select('*')
      .not('status_pagamento', 'eq', 'pago')
      .order('data_emissao', { ascending: false })
      .then(({ data }) => setNotas(data ?? []));
  }, []);

  const notaSel = notas.find(n => n.id === notaId);

  useEffect(() => {
    if (notaSel) setValor(String(Number(notaSel.saldo_restante).toFixed(2)));
    else setValor('');
  }, [notaId, notaSel]);

  const save = async () => {
    const v = parseFloat(valor);
    if (!v || v <= 0) return alert('Informe um valor válido.');
    setSaving(true);
    try {
      await supabase.from('fornecedor_pagamentos').insert({
        fornecedor_id: DEVILLE_ID,
        nota_id: notaId || null,
        data_pagamento: dataPgto,
        valor: v,
        forma_pagamento: forma,
        observacoes: obs || null,
      });
      if (notaSel) {
        const novoValorPago = Number(notaSel.valor_pago) + v;
        let novoStatus = novoValorPago >= Number(notaSel.valor_total) ? 'pago'
          : notaSel.tipo === 'consignado' ? 'consignado_ativo' : 'parcialmente_pago';
        await supabase.from('fornecedor_notas').update({ valor_pago: novoValorPago, status_pagamento: novoStatus }).eq('id', notaSel.id);
      }
      onClose();
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title="Registrar Pagamento — De Ville" onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Nota <span className="text-white/25">(deixe em branco para acerto geral)</span></label>
          <select className={selectCls} value={notaId} onChange={e => setNotaId(e.target.value)}>
            <option value="">— Acerto geral / sem nota vinculada —</option>
            {notas.map(n => (
              <option key={n.id} value={n.id}>
                {n.numero_nota || 'S/N'} · {n.tipo === 'consignado' ? 'Consig.' : 'Normal'} · {fmtDate(n.data_emissao)} · Saldo: {fmt(Number(n.saldo_restante))}
              </option>
            ))}
          </select>
        </div>

        {notaSel && (
          <div className="bg-white/5 rounded-xl p-3 text-xs grid grid-cols-3 gap-3">
            <div><p className="text-white/30">Total</p><p className="text-white font-medium">{fmt(Number(notaSel.valor_total))}</p></div>
            <div><p className="text-white/30">Pago</p><p className="text-green-400 font-medium">{fmt(Number(notaSel.valor_pago))}</p></div>
            <div><p className="text-white/30">Saldo</p><p className="text-yellow-300 font-bold">{fmt(Number(notaSel.saldo_restante))}</p></div>
          </div>
        )}

        <div>
          <label className="block text-xs text-white/50 mb-1.5">Data do Pagamento</label>
          <input type="date" className={inputCls} value={dataPgto} onChange={e => setDataPgto(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">
            Valor
            {notaSel && <span className="text-white/25 ml-1">(parcial permitido — máx. {fmt(Number(notaSel.saldo_restante))})</span>}
          </label>
          <input type="number" step="0.01" min="0.01" placeholder="0,00" className={inputCls} value={valor} onChange={e => setValor(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Forma de Pagamento</label>
          <select className={selectCls} value={forma} onChange={e => setForma(e.target.value)}>
            <option value="pix">PIX</option>
            <option value="dinheiro">Dinheiro</option>
            <option value="transferencia">Transferência</option>
            <option value="boleto">Boleto</option>
            <option value="outro">Outro</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-white/50 mb-1.5">Observações</label>
          <textarea className={inputCls + ' resize-none'} rows={2} placeholder="Opcional..." value={obs} onChange={e => setObs(e.target.value)} />
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/70 hover:bg-white/5 text-sm transition-colors">Cancelar</button>
          <button onClick={save} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-[#7D1F2C] hover:bg-[#6a1a25] text-white text-sm font-medium transition-colors disabled:opacity-50">
            {saving ? 'Confirmando...' : 'Confirmar Pagamento'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ABA 5 — CATÁLOGO
// ═══════════════════════════════════════════════════════════════════════════════

function AbaCatalogo() {
  const [catalogoItens, setCatalogoItens] = useState<CatalogoItem[]>([]);
  const [todosItens, setTodosItens] = useState<ItemEstoque[]>([]);
  const [loading, setLoading] = useState(true);
  const [buscaCat, setBuscaCat] = useState('');
  const [buscaTodos, setBuscaTodos] = useState('');
  const [catFiltro, setCatFiltro] = useState('');
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [selecionadosCat, setSelecionadosCat] = useState<string[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [codigoForn, setCodigoForn] = useState('');
  const [obsAdd, setObsAdd] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: cat }, { data: todos }] = await Promise.all([
      supabase.from('vw_fornecedor_catalogo').select('*').eq('fornecedor_id', DEVILLE_ID),
      supabase.from('itens_estoque').select('id, nome, codigo, categoria, unidade_medida').eq('status', 'ativo').order('categoria').order('nome'),
    ]);
    setCatalogoItens(cat ?? []);
    setTodosItens(todos ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const catIds = new Set(catalogoItens.filter(c => c.ativo).map(c => c.item_id));
  const cats = [...new Set(todosItens.map(i => i.categoria).filter(Boolean))].sort();

  const todosFiltered = todosItens.filter(i => {
    const noCat = !catIds.has(i.id);
    const ok = !buscaTodos || i.nome?.toLowerCase().includes(buscaTodos.toLowerCase());
    const okCat = !catFiltro || i.categoria === catFiltro;
    return noCat && ok && okCat;
  });

  const catFiltered = catalogoItens.filter(i => i.ativo && (!buscaCat || i.item_nome?.toLowerCase().includes(buscaCat.toLowerCase())));

  const confirmarAdicionar = async () => {
    setSaving(true);
    try {
      for (const id of selecionados) {
        await supabase.from('fornecedor_catalogo').upsert({
          fornecedor_id: DEVILLE_ID, item_id: id,
          ativo: true, codigo_fornecedor: codigoForn || null, observacoes: obsAdd || null,
        }, { onConflict: 'fornecedor_id,item_id' });
      }
      setSelecionados([]);
      setCodigoForn('');
      setObsAdd('');
      setShowModal(false);
      load();
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const removerSelecionados = async () => {
    if (!window.confirm(`Remover ${selecionadosCat.length} item(s) do catálogo?`)) return;
    setSaving(true);
    try {
      for (const id of selecionadosCat) {
        await supabase.from('fornecedor_catalogo').update({ ativo: false }).eq('fornecedor_id', DEVILLE_ID).eq('item_id', id);
      }
      setSelecionadosCat([]);
      load();
    } catch (e: any) {
      alert('Erro: ' + e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleSel = (id: string) => setSelecionados(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const toggleSelCat = (id: string) => setSelecionadosCat(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  return (
    <div>
      <p className="text-white/40 text-sm mb-4">Defina quais itens do cadastro geral o De Ville vende. Somente itens do catálogo aparecem nos modais de nota.</p>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Todos os itens */}
        <div className="bg-[#12141f] border border-white/10 rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-white/10">
            <p className="text-white/70 font-medium text-sm mb-2">Todos os Itens (cadastro geral)</p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={12} />
                <input className={inputCls + ' py-2 pl-8 text-xs'} placeholder="Buscar..." value={buscaTodos} onChange={e => setBuscaTodos(e.target.value)} />
              </div>
              <select className={selectCls + ' w-auto text-xs py-2'} value={catFiltro} onChange={e => setCatFiltro(e.target.value)}>
                <option value="">Categoria</option>
                {cats.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto max-h-80">
            {loading ? <div className="py-8 text-center text-white/30 text-sm">Carregando...</div> :
              todosFiltered.map(item => (
                <label key={item.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] cursor-pointer border-b border-white/5 last:border-0">
                  <input type="checkbox" checked={selecionados.includes(item.id)} onChange={() => toggleSel(item.id)} className="w-3.5 h-3.5 rounded" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{item.nome}</p>
                    <p className="text-white/30 text-xs">{item.categoria} · {item.unidade_medida}</p>
                  </div>
                </label>
              ))
            }
          </div>
          {selecionados.length > 0 && (
            <div className="px-4 py-3 border-t border-white/10">
              <button onClick={() => setShowModal(true)} className="w-full flex items-center justify-center gap-2 py-2 bg-[#7D1F2C] hover:bg-[#6a1a25] text-white rounded-xl text-sm font-medium transition-colors">
                <Plus size={13} /> Adicionar {selecionados.length} item(s) ao catálogo
              </button>
            </div>
          )}
        </div>

        {/* Catálogo De Ville */}
        <div className="bg-[#12141f] border border-white/10 rounded-xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-white/10">
            <p className="text-white/70 font-medium text-sm mb-2">Itens do De Ville ({catFiltered.length})</p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={12} />
              <input className={inputCls + ' py-2 pl-8 text-xs'} placeholder="Buscar no catálogo..." value={buscaCat} onChange={e => setBuscaCat(e.target.value)} />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto max-h-80">
            {loading ? <div className="py-8 text-center text-white/30 text-sm">Carregando...</div> :
              catFiltered.length === 0 ? <div className="py-8 text-center text-white/30 text-sm">Catálogo vazio</div> :
              catFiltered.map(item => (
                <label key={item.item_id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-white/[0.03] cursor-pointer border-b border-white/5 last:border-0">
                  <input type="checkbox" checked={selecionadosCat.includes(item.item_id)} onChange={() => toggleSelCat(item.item_id)} className="w-3.5 h-3.5 rounded" />
                  <CheckCircle size={13} className="text-green-400 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-white text-sm truncate">{item.item_nome}</p>
                    <p className="text-white/30 text-xs">{item.categoria} · {item.unidade_medida}</p>
                  </div>
                  {item.saldo_atual > 0 && <span className="text-xs text-[#D4AF37] flex-shrink-0">{fmtQtd(item.saldo_atual)}</span>}
                </label>
              ))
            }
          </div>
          {selecionadosCat.length > 0 && (
            <div className="px-4 py-3 border-t border-white/10">
              <button onClick={removerSelecionados} disabled={saving} className="w-full flex items-center justify-center gap-2 py-2 border border-red-500/30 text-red-400 hover:bg-red-500/10 rounded-xl text-sm font-medium transition-colors disabled:opacity-50">
                <Trash2 size={13} /> Remover {selecionadosCat.length} selecionado(s)
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Modal confirmar adição */}
      {showModal && (
        <Modal title="Adicionar ao Catálogo De Ville" onClose={() => setShowModal(false)}>
          <div className="space-y-4">
            <p className="text-white/50 text-sm">{selecionados.length} item(s) serão adicionados ao catálogo.</p>
            <div>
              <label className="block text-xs text-white/50 mb-1.5">Código no fornecedor (opcional)</label>
              <input className={inputCls} placeholder="Ex: DV-001" value={codigoForn} onChange={e => setCodigoForn(e.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-white/50 mb-1.5">Observações (opcional)</label>
              <textarea className={inputCls + ' resize-none'} rows={2} value={obsAdd} onChange={e => setObsAdd(e.target.value)} />
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowModal(false)} className="flex-1 py-2.5 rounded-xl border border-white/20 text-white/70 hover:bg-white/5 text-sm transition-colors">Cancelar</button>
              <button onClick={confirmarAdicionar} disabled={saving} className="flex-1 py-2.5 rounded-xl bg-[#7D1F2C] hover:bg-[#6a1a25] text-white text-sm font-medium transition-colors disabled:opacity-50">
                {saving ? 'Adicionando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

const TABS = [
  { label: 'Estoque',      icon: Package },
  { label: 'Notas',        icon: FileText },
  { label: 'Consignados',  icon: RefreshCw },
  { label: 'Pagamentos',   icon: DollarSign },
  { label: 'Catálogo',     icon: Settings },
];

const ControleDeville: React.FC = () => {
  const [tab, setTab] = useState(0);

  return (
    <div className="flex flex-col min-h-screen -m-6 lg:-m-8" style={{ background: '#0d0f1a' }}>

      {/* Hero */}
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #1a2a4a 0%, #0f1a35 60%, #0a1020 100%)' }}>
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '24px 24px' }} />
        <div className="absolute -top-16 -right-16 w-64 h-64 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #D4AF37, transparent 70%)' }} />

        <div className="relative px-6 lg:px-8 pt-7 pb-0">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)' }}>
                <Package className="text-white/70" size={18} />
              </div>
              <div>
                <h1 className="text-white text-2xl font-bold leading-none tracking-tight">Controle De Ville</h1>
                <p className="text-white/40 text-sm mt-1">DE VILLE DISTRIBUIDORA DE BEBIDAS · Estoque isolado</p>
              </div>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <AlertTriangle size={12} className="text-yellow-400/60" />
              <span className="text-yellow-400/60 text-xs">Módulo independente do estoque principal</span>
            </div>
          </div>

          <nav className="flex items-end gap-0 overflow-x-auto scrollbar-hide">
            {TABS.map((t, i) => {
              const Icon = t.icon;
              const active = i === tab;
              return (
                <button key={i} onClick={() => setTab(i)} className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap transition-all duration-150 flex-shrink-0 ${active ? 'border-[#D4AF37] text-white' : 'border-transparent text-white/35 hover:text-white/60 hover:bg-white/5'}`}>
                  <Icon size={12} />{t.label}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 px-6 lg:px-8 py-6" style={{ background: '#0d0f1a' }}>
        {tab === 0 && <AbaEstoque />}
        {tab === 1 && <AbaNotas />}
        {tab === 2 && <AbaConsignados />}
        {tab === 3 && <AbaPagamentos />}
        {tab === 4 && <AbaCatalogo />}
      </div>
    </div>
  );
};

export default ControleDeville;
