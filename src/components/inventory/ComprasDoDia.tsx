import { useState, useEffect, useCallback, useMemo } from 'react';
import { ShoppingBag, RefreshCw, Search, X, Loader2, Package, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SearchableSelect } from '../common/SearchableSelect';
import {
  fmt, fmtQtd, fmtMoeda, BadgeSituacao, DiasCompra, MensagemBox,
  type Situacao, type Criterio, type Mensagem,
} from './comprasShared';
import { PainelListaDoDia, urlListaPublica, urlWhatsApp, normalizarListaDoDia, type ListaDoDia } from './PainelListaDoDia';

// ─── Tipos ───────────────────────────────────────────────────────────────────
type Modalidade = 'entrega' | 'rua';

interface FornecedorItem {
  fornecedor_id: string;
  nome: string;
  telefone: string | null;
  modalidade: Modalidade;
  dias_compra: number[] | null;
  ciclo_dias: number;
  compras: number;
  ultima_data: string | null;
  ultimo_preco: number | null;
  menor_preco_90d: number | null;
  preferido: boolean;
}

interface ItemDoDia {
  item_id: string;
  nome: string;
  categoria: string | null;
  um: string;
  saldo_central: number;
  saldo_pontas: number;
  consumo_dia: number;
  cobertura_dias: number | null;
  ponto_pedido: number;
  alvo: number;
  quantidade_sugerida: number;
  custo_medio: number;
  criterio: Criterio;
  situacao: Situacao;
  em_lista_aberta: number;
  em_pedido_pendente: number;
  fracionado: boolean;
  fornecedores: FornecedorItem[];
  origem_sugerida: FornecedorItem | null;
}

interface FornecedorAtivo {
  id: string;
  nome: string;
  modalidade: Modalidade;
  telefone: string | null;
  dias_compra: number[] | null;
}

interface Totais { zerado: number; comprar: number; atencao: number }

interface LinhaState {
  marcado: boolean;
  quantidade: number;
  fornecedorId: string;
  /** true quando o usuário escolheu "Outro fornecedor…" (picker aberto) */
  outro: boolean;
}

interface PedidoGerado {
  fornecedor_id: string;
  fornecedor_nome: string;
  entrada_id: string;
  itens: number;
  valor: number;
  lista_id: string | null;
  lista_numero: string | null;
}

interface ResultadoDecisao {
  pedidos: PedidoGerado[];
  rua_itens: number;
  rua_valor: number;
  lista_id: string | null;
  lista_numero: string | null;
}

const OUTRO = '__outro';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const numOuNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

function normalizarFornecedor(raw: Record<string, unknown>): FornecedorItem {
  return {
    fornecedor_id: String(raw.fornecedor_id),
    nome: String(raw.nome ?? ''),
    telefone: (raw.telefone as string | null) ?? null,
    modalidade: raw.modalidade === 'rua' ? 'rua' : 'entrega',
    dias_compra: Array.isArray(raw.dias_compra) ? (raw.dias_compra as unknown[]).map(Number) : null,
    ciclo_dias: num(raw.ciclo_dias),
    compras: num(raw.compras),
    ultima_data: (raw.ultima_data as string | null) ?? null,
    ultimo_preco: numOuNull(raw.ultimo_preco),
    menor_preco_90d: numOuNull(raw.menor_preco_90d),
    preferido: Boolean(raw.preferido),
  };
}

function normalizarItem(raw: Record<string, unknown>): ItemDoDia {
  const forns = Array.isArray(raw.fornecedores) ? (raw.fornecedores as Record<string, unknown>[]) : [];
  const origem = raw.origem_sugerida && typeof raw.origem_sugerida === 'object'
    ? normalizarFornecedor(raw.origem_sugerida as Record<string, unknown>) : null;
  return {
    item_id: String(raw.item_id),
    nome: String(raw.nome ?? ''),
    categoria: (raw.categoria as string | null) ?? null,
    um: String(raw.um ?? ''),
    saldo_central: num(raw.saldo_central),
    saldo_pontas: num(raw.saldo_pontas),
    consumo_dia: num(raw.consumo_dia),
    cobertura_dias: numOuNull(raw.cobertura_dias),
    ponto_pedido: num(raw.ponto_pedido),
    alvo: num(raw.alvo),
    quantidade_sugerida: num(raw.quantidade_sugerida),
    custo_medio: num(raw.custo_medio),
    criterio: ((raw.criterio as Criterio) || 'sem_consumo'),
    situacao: ((raw.situacao as Situacao) || 'ok'),
    em_lista_aberta: num(raw.em_lista_aberta),
    em_pedido_pendente: num(raw.em_pedido_pendente),
    fracionado: Boolean(raw.fracionado),
    fornecedores: forns.map(normalizarFornecedor),
    origem_sugerida: origem && origem.fornecedor_id ? origem : null,
  };
}

function precisaComprar(s: Situacao) { return s === 'zerado' || s === 'comprar'; }

function diaMes(iso: string): string {
  if (/^\d{4}-\d{2}-\d{2}/.test(iso)) return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function rotuloFornecedor(f: FornecedorItem): string {
  const partes = [f.nome, f.modalidade === 'rua' ? 'rua' : 'entrega'];
  if (f.ultimo_preco) partes.push(`últ. ${fmtMoeda(f.ultimo_preco)}${f.ultima_data ? ` (${diaMes(f.ultima_data)})` : ''}`);
  else if (f.ultima_data) partes.push(`(${diaMes(f.ultima_data)})`);
  return `${f.preferido ? '★ ' : ''}${partes.join(' · ')}`;
}

function estadoInicial(it: ItemDoDia): LinhaState {
  return {
    marcado: precisaComprar(it.situacao) && !!it.origem_sugerida,
    quantidade: it.quantidade_sugerida,
    fornecedorId: it.origem_sugerida?.fornecedor_id ?? '',
    outro: false,
  };
}

function plural(n: number, um: string, varios: string) { return `${n} ${n === 1 ? um : varios}`; }

// ─── Componente principal ────────────────────────────────────────────────────
export default function ComprasDoDia() {
  const [itens, setItens] = useState<ItemDoDia[]>([]);
  const [totais, setTotais] = useState<Totais>({ zerado: 0, comprar: 0, atencao: 0 });
  const [listaDia, setListaDia] = useState<ListaDoDia | null>(null);
  const [fornecedoresAtivos, setFornecedoresAtivos] = useState<FornecedorAtivo[]>([]);
  const [linhas, setLinhas] = useState<Record<string, LinhaState>>({});
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [confirmando, setConfirmando] = useState(false);
  const [mensagem, setMensagem] = useState<Mensagem | null>(null);
  const [filtroSit, setFiltroSit] = useState<Record<'zerado' | 'comprar' | 'atencao', boolean>>({ zerado: true, comprar: true, atencao: false });
  const [busca, setBusca] = useState('');
  const [mostrarPedidos, setMostrarPedidos] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try {
      const [rDia, rForn] = await Promise.all([
        supabase.rpc('fn_compras_do_dia'),
        supabase.from('fornecedores')
          .select('id, nome, modalidade, telefone, dias_compra')
          .eq('status', 'ativo')
          .or('tipo.eq.geral,tipo.is.null')
          .order('nome'),
      ]);
      if (rDia.error) { setErro(rDia.error.message); return; }
      const d = (rDia.data || {}) as Record<string, unknown>;
      const lista = (Array.isArray(d.itens) ? (d.itens as Record<string, unknown>[]) : []).map(normalizarItem);
      const t = (d.totais || {}) as Record<string, unknown>;
      setItens(lista);
      setTotais({ zerado: num(t.zerado), comprar: num(t.comprar), atencao: num(t.atencao) });
      setListaDia(normalizarListaDoDia(d.lista));
      const ativos = ((rForn.data || []) as Record<string, unknown>[]).map(f => ({
        id: String(f.id),
        nome: String(f.nome ?? ''),
        modalidade: (f.modalidade === 'rua' ? 'rua' : 'entrega') as Modalidade,
        telefone: (f.telefone as string | null) ?? null,
        dias_compra: Array.isArray(f.dias_compra) ? (f.dias_compra as unknown[]).map(Number) : null,
      }));
      setFornecedoresAtivos(ativos);
      const l: Record<string, LinhaState> = {};
      for (const it of lista) l[it.item_id] = estadoInicial(it);
      setLinhas(l);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Resolução de fornecedor / modalidade ──
  const ativosPorId = useMemo(() => {
    const m = new Map<string, FornecedorAtivo>();
    for (const f of fornecedoresAtivos) m.set(f.id, f);
    return m;
  }, [fornecedoresAtivos]);

  const infoFornecedor = useCallback((it: ItemDoDia, id: string): { nome: string; modalidade: Modalidade; dias_compra: number[] | null } | null => {
    if (!id) return null;
    const doItem = it.fornecedores.find(f => f.fornecedor_id === id);
    if (doItem) return { nome: doItem.nome, modalidade: doItem.modalidade, dias_compra: doItem.dias_compra };
    const ativo = ativosPorId.get(id);
    if (ativo) return { nome: ativo.nome, modalidade: ativo.modalidade, dias_compra: ativo.dias_compra };
    return null;
  }, [ativosPorId]);

  const opcoesOutro = useMemo(() => fornecedoresAtivos.map(f => ({
    value: f.id,
    label: f.nome,
    sublabel: f.modalidade === 'rua' ? 'Rua · comprador vai buscar' : 'Entrega',
  })), [fornecedoresAtivos]);

  // ── Filtros ──
  const buscaLower = busca.trim().toLowerCase();
  const visiveis = useMemo(() => itens.filter(it => {
    if (it.situacao === 'ok' || !filtroSit[it.situacao]) return false;
    if (!mostrarPedidos && (it.em_pedido_pendente > 0 || it.em_lista_aberta > 0)) return false;
    if (buscaLower && !it.nome.toLowerCase().includes(buscaLower) && !(it.categoria || '').toLowerCase().includes(buscaLower)) return false;
    return true;
  }), [itens, filtroSit, mostrarPedidos, buscaLower]);

  // ── Estado por linha ──
  const setLinha = (id: string, patch: Partial<LinhaState>) =>
    setLinhas(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const escolherOrigem = (it: ItemDoDia, valor: string) => {
    if (valor === OUTRO) { setLinha(it.item_id, { outro: true, fornecedorId: '' }); return; }
    if (valor === '') { setLinha(it.item_id, { outro: false, fornecedorId: '', marcado: false }); return; }
    setLinha(it.item_id, { outro: false, fornecedorId: valor, marcado: true });
  };

  // ── Resumo das linhas marcadas ──
  const marcadas = useMemo(() => itens
    .map(it => ({ it, st: linhas[it.item_id] }))
    .filter(({ st }) => st && st.marcado && st.quantidade > 0),
  [itens, linhas]);

  const resumo = useMemo(() => {
    const pedidos = new Map<string, number>();
    const rua = new Map<string, number>();
    let valor = 0;
    for (const { it, st } of marcadas) {
      valor += st.quantidade * it.custo_medio;
      const f = infoFornecedor(it, st.fornecedorId);
      if (!f) continue;
      const alvo = f.modalidade === 'rua' ? rua : pedidos;
      alvo.set(f.nome, (alvo.get(f.nome) ?? 0) + 1);
    }
    const lista = (m: Map<string, number>) =>
      [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).map(([n, c]) => `${n} (${c})`).join(', ');
    return { itens: marcadas.length, valor, pedidos: lista(pedidos), rua: lista(rua) };
  }, [marcadas, infoFornecedor]);

  // ── Confirmar ──
  const confirmar = async () => {
    if (marcadas.length === 0) return;
    setConfirmando(true); setMensagem(null);
    try {
      const { data, error } = await supabase.rpc('fn_compras_decidir', {
        p_linhas: marcadas.map(({ it, st }) => ({
          item_id: it.item_id,
          quantidade: st.quantidade,
          fornecedor_id: st.fornecedorId || null,
          modalidade: infoFornecedor(it, st.fornecedorId)?.modalidade ?? 'entrega',
        })),
      });
      if (error) { setMensagem({ tipo: 'erro', texto: error.message }); return; }
      const r = (data || {}) as Partial<ResultadoDecisao>;
      const pedidos = Array.isArray(r.pedidos) ? r.pedidos : [];
      const ruaItens = num(r.rua_itens);
      const partes: string[] = [];
      if (pedidos.length > 0) {
        partes.push('Pedidos gerados: ' + pedidos
          .map(p => `${p.fornecedor_nome} (${plural(num(p.itens), 'item', 'itens')}, ${fmtMoeda(num(p.valor))})`)
          .join(', '));
      }
      if (ruaItens > 0) partes.push(`Compra de rua: ${plural(ruaItens, 'item', 'itens')}, ${fmtMoeda(num(r.rua_valor))}`);
      const numeroLista = r.lista_numero || pedidos.find(p => p.lista_numero)?.lista_numero || 'de hoje';
      const listaId = r.lista_id || pedidos.find(p => p.lista_id)?.lista_id || null;
      const url = listaId ? urlListaPublica(listaId) : null;
      setMensagem({
        tipo: 'ok',
        texto: `${partes.join(' · ') || 'Nenhuma compra gerada'}. Tudo na lista do comprador ${numeroLista}.`,
        link: '/advanced-inventory?area=operacao&tela=receber',
        linkLabel: 'Receber mercadoria',
        linkExterno: url ? { href: url, label: 'Abrir lista' } : undefined,
        whatsapp: url ? urlWhatsApp(listaDia?.titulo || `Lista ${numeroLista}`, url) : undefined,
      });
      await carregar();
    } catch (e: unknown) {
      setMensagem({ tipo: 'erro', texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setConfirmando(false);
    }
  };

  const toggleSit = (s: 'zerado' | 'comprar' | 'atencao') => setFiltroSit(prev => ({ ...prev, [s]: !prev[s] }));

  const chips: { s: 'zerado' | 'comprar' | 'atencao'; label: string; ativo: string }[] = [
    { s: 'zerado', label: `Zerado (${totais.zerado})`, ativo: 'bg-red-500/20 text-red-300 border-red-500/40' },
    { s: 'comprar', label: `Comprar (${totais.comprar})`, ativo: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
    { s: 'atencao', label: `Atenção (${totais.atencao})`, ativo: 'bg-yellow-500/15 text-yellow-200 border-yellow-500/40' },
  ];

  // ── Render ──
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[#12141f] rounded-2xl border border-white/10 px-5 py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-wine rounded-xl flex items-center justify-center flex-shrink-0">
              <ShoppingBag size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Compras do dia</h2>
              <p className="text-sm text-white/60">O que o Central precisa hoje, pelo ponto de pedido. Escolha a origem linha a linha e confirme.</p>
            </div>
          </div>
          <button onClick={carregar} disabled={carregando}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-sm font-medium text-white/60 hover:bg-white/5 disabled:opacity-50">
            <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>

        {/* Filtros */}
        <div className="flex items-center gap-2 flex-wrap mt-4">
          {chips.map(c => (
            <button key={c.s} onClick={() => toggleSit(c.s)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${filtroSit[c.s] ? c.ativo : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'}`}>
              {c.label}
            </button>
          ))}
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar item ou categoria..."
              className="w-full pl-9 pr-8 py-1.5 text-sm border border-white/10 rounded-xl bg-[#0c1018] text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-wine/30" />
            {busca && <button onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"><X size={14} /></button>}
          </div>
          <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer select-none ml-auto">
            <input type="checkbox" checked={mostrarPedidos} onChange={e => setMostrarPedidos(e.target.checked)} className="accent-[#7D1F2C]" />
            Mostrar já pedidos / em lista
          </label>
        </div>
      </div>

      {listaDia && <PainelListaDoDia lista={listaDia} />}

      {erro && (
        <div className="rounded-xl p-3 text-sm border bg-red-500/10 border-red-500/30 text-red-400 flex items-center gap-3 flex-wrap">
          <AlertTriangle size={16} className="flex-shrink-0" />
          <span className="flex-1">{erro}</span>
          <button onClick={carregar} className="text-xs font-semibold underline underline-offset-2 hover:opacity-80">Tentar de novo</button>
        </div>
      )}

      {carregando && itens.length === 0 && !erro && (
        <div className="text-center py-16 text-white/30">
          <Loader2 size={24} className="animate-spin mx-auto mb-3" />
          <p>Calculando o que o Central precisa hoje...</p>
        </div>
      )}

      {!carregando && !erro && visiveis.length === 0 && (
        <div className="bg-[#12141f] rounded-2xl border border-white/10 text-center py-14 text-white/40">
          <Package size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-white/70 font-medium">Nada a comprar com esses filtros.</p>
        </div>
      )}

      {visiveis.length > 0 && (
        <div className="bg-[#12141f] rounded-2xl border border-white/10">
          <div className="overflow-x-auto rounded-t-2xl">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#0c1018] text-white/40">
                  <th className="px-3 py-2 w-8" />
                  <th className="px-3 py-2 text-left font-medium">Item</th>
                  <th className="px-3 py-2 text-right font-medium">Central</th>
                  <th className="px-3 py-2 text-right font-medium">Cobertura</th>
                  <th className="px-3 py-2 text-right font-medium">Ponto</th>
                  <th className="px-3 py-2 text-right font-medium">Quantidade</th>
                  <th className="px-3 py-2 text-left font-medium">Origem</th>
                  <th className="px-3 py-2 text-right font-medium">Custo est.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {visiveis.map(it => {
                  const st = linhas[it.item_id] ?? estadoInicial(it);
                  const escolhido = infoFornecedor(it, st.fornecedorId);
                  const custo = Number((st.quantidade * it.custo_medio).toFixed(2));
                  const valorSelect = st.outro ? OUTRO : st.fornecedorId;
                  return (
                    <tr key={it.item_id} className={`hover:bg-white/[0.02] align-top ${st.marcado ? '' : 'opacity-60'}`}>
                      <td className="px-3 py-2.5">
                        <input type="checkbox" checked={st.marcado} onChange={e => setLinha(it.item_id, { marcado: e.target.checked })}
                          className="w-4 h-4 rounded border-white/20 bg-transparent accent-[#7D1F2C] cursor-pointer" title="Comprar hoje" />
                      </td>
                      <td className="px-3 py-2 min-w-[180px]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-white/90 font-medium">{it.nome}</p>
                          <span className="text-caption text-white/40">{it.um}</span>
                          <BadgeSituacao s={it.situacao} />
                        </div>
                        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                          {it.em_pedido_pendente > 0 && (
                            <span className="text-caption px-1.5 py-0.5 rounded-md border bg-blue-500/10 text-blue-400 border-blue-500/30">já em pedido: {fmtQtd(it.em_pedido_pendente)}</span>
                          )}
                          {it.em_lista_aberta > 0 && (
                            <span className="text-caption px-1.5 py-0.5 rounded-md border bg-orange-500/10 text-orange-400 border-orange-500/30">em lista: {fmtQtd(it.em_lista_aberta)}</span>
                          )}
                          {it.categoria && <span className="text-caption text-white/40">{it.categoria}</span>}
                        </div>
                      </td>
                      <td className={`px-3 py-2.5 text-right whitespace-nowrap ${it.saldo_central <= 0 ? 'text-red-400 font-semibold' : 'text-white/80'}`}>
                        {fmtQtd(it.saldo_central)}
                      </td>
                      <td className="px-3 py-2.5 text-right whitespace-nowrap">
                        {it.cobertura_dias === null
                          ? <span className="text-white/40">sem histórico</span>
                          : <span className="text-white/70">cobre {fmt(it.cobertura_dias, 1)} dias</span>}
                      </td>
                      <td className="px-3 py-2.5 text-right text-white/60 whitespace-nowrap">{fmtQtd(it.ponto_pedido)}</td>
                      <td className="px-3 py-2 text-right whitespace-nowrap">
                        <input type="number" min={0} step={it.fracionado ? 0.01 : 1} value={st.quantidade}
                          onChange={e => {
                            const v = parseFloat(e.target.value);
                            const q = Number.isFinite(v) ? Math.max(0, v) : 0;
                            setLinha(it.item_id, { quantidade: it.fracionado ? Number(q.toFixed(2)) : Math.round(q) });
                          }}
                          className="w-20 text-right text-sm font-bold border border-white/10 rounded-lg px-2 py-1 bg-[#0c1018] text-white focus:outline-none focus:ring-2 focus:ring-wine/30" />
                      </td>
                      <td className="px-3 py-2 min-w-[240px]">
                        <select value={valorSelect} onChange={e => escolherOrigem(it, e.target.value)}
                          className="w-full text-xs border border-white/10 rounded-lg px-2 py-1.5 bg-[#0c1018] text-white focus:outline-none focus:ring-2 focus:ring-wine/30">
                          {it.fornecedores.map(f => (
                            <option key={f.fornecedor_id} value={f.fornecedor_id}>{rotuloFornecedor(f)}</option>
                          ))}
                          <option disabled>──────────</option>
                          <option value={OUTRO}>Outro fornecedor…</option>
                          <option value="">Decidir depois</option>
                        </select>
                        {st.outro && (
                          <SearchableSelect theme="dark" className="mt-1.5" options={opcoesOutro} value={st.fornecedorId}
                            placeholder="Buscar fornecedor..." emptyMessage="Nenhum fornecedor ativo"
                            onChange={v => setLinha(it.item_id, { fornecedorId: v, marcado: v ? true : st.marcado })} />
                        )}
                        <div className="mt-1 min-h-[16px]">
                          {escolhido
                            ? escolhido.modalidade === 'rua'
                              ? <span className="text-caption text-orange-400/80">Comprador vai buscar</span>
                              : <span className="flex items-center gap-1.5 text-caption text-white/50">pede <DiasCompra dias={escolhido.dias_compra} /></span>
                            : <span className="text-caption text-white/30">{st.outro ? 'Escolha o fornecedor' : 'Sem origem definida'}</span>}
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right text-white font-medium whitespace-nowrap">
                        {custo > 0 ? fmtMoeda(custo) : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="px-4 py-2 text-caption text-white/40 border-t border-white/5">
            Fornecedores conhecidos vêm das notas recebidas nos últimos 12 meses; ★ é o fornecedor preferido do cadastro.
            A modalidade (entrega ou rua) se ajusta em Cadastros › Fornecedores.
          </p>

          {mensagem && <MensagemBox msg={mensagem} onFechar={() => setMensagem(null)} />}

          {/* Rodapé fixo */}
          <div className="sticky bottom-0 rounded-b-2xl border-t border-white/10 bg-[#12141f]/95 backdrop-blur px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-white/60 min-w-0">
              <span className="text-white font-semibold">{plural(resumo.itens, 'item', 'itens')} · {fmtMoeda(resumo.valor)}</span>
              {(resumo.pedidos || resumo.rua) && <span className="text-white/40"> → </span>}
              {resumo.pedidos && <span>pedidos: <span className="text-blue-300">{resumo.pedidos}</span></span>}
              {resumo.pedidos && resumo.rua && <span className="text-white/40"> · </span>}
              {resumo.rua && <span>rua: <span className="text-orange-300">{resumo.rua}</span></span>}
            </div>
            <button onClick={confirmar} disabled={confirmando || resumo.itens === 0}
              className="flex items-center gap-2 bg-wine hover:bg-[#6a1a25] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
              {confirmando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {confirmando ? 'Confirmando...' : 'Confirmar compras do dia'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
