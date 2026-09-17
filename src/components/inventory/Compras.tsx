import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import {
  ShoppingBag, RefreshCw, Search, X, Loader2, Package, AlertTriangle, CheckCircle2, Plus, Store, Truck, ClipboardList,
  CalendarClock, Undo2, Smartphone, Copy, Check, MessageCircle, Lock, RotateCcw, Settings2, Phone, Send,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SearchableSelect } from '../common/SearchableSelect';
import { fmtQtd, fmtMoeda, fmtData, urlConferencia, urlWhatsApp, textoPedidoFornecedor, type Situacao } from './comprasShared';
import { CardListaCompra, normalizarLista, type ListaResumo } from './CardListaCompra';
import { agruparPorCategoria, SEM_CATEGORIA } from './agruparPorCategoria';
import { ComprasConfigurar } from './ComprasConfigurar';

/**
 * Compras — por ponto de pedido, em abas.
 *
 * Tudo entra pelo ponto de pedido do cadastro (manual). O "como compra" de
 * cada item diz para onde ele vai:
 *   Rua          → lista do comprador, em blocos por categoria.
 *   Fornecedores → um card por fornecedor, sempre à mostra; pede quando quiser.
 *   Sob demanda  → nada entra sozinho; só pela busca "Incluir item".
 *   Configurar   → revisar "como compra" e pontos que não giram.
 */

// ─── Tipos (espelham fn_compras_tela) ────────────────────────────────────────
type Modalidade = 'entrega' | 'rua';
type Destino = 'rua' | 'fornecedor';
type Aba = 'rua' | 'fornecedores' | 'demanda' | 'config';

interface FornecedorRecente { fornecedor_id: string; nome: string; modalidade: Modalidade; ultimo_preco: number | null; compras: number }

/** Para onde o item vai, pelo cadastro. */
interface Compra {
  via: Destino | null;
  fornecedor_id: string | null; fornecedor_nome: string | null; fornecedor_tel: string | null;
  modalidade: Modalidade | null; revisada: boolean;
}

interface Origem { tipo: Destino; fornecedor_id?: string | null; motivo?: string | null; compras?: number }

interface ItemCompra {
  item_id: string; nome: string; categoria: string | null; um: string; fracionado: boolean;
  saldo: number; ponto: number; situacao: Situacao | 'extra'; sugerida: number; preco: number;
  em_lista: number; em_lista_onde: string | null; adiado_ate: string | null;
  compra: Compra; origem: Origem | null; recentes: FornecedorRecente[];
}

interface ItemCatalogo {
  item_id: string; nome: string; categoria: string | null; um: string; fracionado: boolean;
  saldo: number; ponto: number; preco: number; compra: Compra;
}

interface Fornecedor { id: string; nome: string; modalidade: Modalidade; telefone: string | null }

interface Anotacao { item_id: string; nome: string; um: string; encontrado: number | null; comprar: number | null; obs: string | null; anotado_em: string }
interface Conferencia { id: string; data: string; status: 'aberta' | 'fechada'; titulo: string | null; itens: Anotacao[] }

interface Tela {
  hoje: string; itens: ItemCompra[]; catalogo: ItemCatalogo[]; listas: ListaResumo[];
  fornecedores: Fornecedor[]; conferencia: Conferencia | null;
  config: { pendentes_via: number; pontos_sem_giro: number };
}

/** Estado editável de cada linha: quantidade (0 = não compra); origem só para "Sob demanda". */
interface Linha { quantidade: number; origem: string; outro: boolean }

const RUA = 'rua';
const OUTRO = '__outro';
const fId = (id: string) => `f:${id}`;
const idDe = (v: string) => (v.startsWith('f:') ? v.slice(2) : null);
const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const numOuNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));
const txt = (v: unknown) => (v === null || v === undefined ? null : String(v));
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const nomeCat = (c: string | null) => (c ?? '').trim() || SEM_CATEGORIA;
const arredondar = (q: number, fracionado: boolean) => (fracionado ? Number(q.toFixed(2)) : Math.round(q));
const ORDEM: Record<string, number> = { zerado: 0, comprar: 1, atencao: 2, extra: 3 };

function normalizarCompra(raw: unknown): Compra {
  const c = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  return {
    via: c.via === 'rua' || c.via === 'fornecedor' ? c.via : null,
    fornecedor_id: txt(c.fornecedor_id), fornecedor_nome: txt(c.fornecedor_nome), fornecedor_tel: txt(c.fornecedor_tel),
    modalidade: c.modalidade === 'rua' ? 'rua' : c.modalidade === 'entrega' ? 'entrega' : null,
    revisada: Boolean(c.revisada),
  };
}

function normalizarItem(raw: Record<string, unknown>): ItemCompra {
  const o = raw.origem && typeof raw.origem === 'object' ? (raw.origem as Record<string, unknown>) : null;
  return {
    item_id: String(raw.item_id), nome: String(raw.nome ?? '').trim(), categoria: txt(raw.categoria), um: String(raw.um ?? ''),
    fracionado: Boolean(raw.fracionado), saldo: num(raw.saldo), ponto: num(raw.ponto),
    situacao: ((raw.situacao as Situacao) || 'ok'), sugerida: num(raw.sugerida), preco: num(raw.preco),
    em_lista: num(raw.em_lista), em_lista_onde: txt(raw.em_lista_onde),
    adiado_ate: raw.adiado_ate ? String(raw.adiado_ate).slice(0, 10) : null,
    compra: normalizarCompra(raw.compra),
    origem: o && (o.tipo === 'rua' || o.tipo === 'fornecedor')
      ? { tipo: o.tipo as Destino, fornecedor_id: txt(o.fornecedor_id), motivo: txt(o.motivo), compras: num(o.compras) } : null,
    recentes: (Array.isArray(raw.recentes) ? (raw.recentes as Record<string, unknown>[]) : []).map(r => ({
      fornecedor_id: String(r.fornecedor_id), nome: String(r.nome ?? ''), modalidade: (r.modalidade === 'rua' ? 'rua' : 'entrega') as Modalidade,
      ultimo_preco: numOuNull(r.ultimo_preco), compras: num(r.compras),
    })),
  };
}

function normalizarCatalogo(raw: Record<string, unknown>): ItemCatalogo {
  return {
    item_id: String(raw.item_id), nome: String(raw.nome ?? '').trim(), categoria: txt(raw.categoria), um: String(raw.um ?? ''),
    fracionado: Boolean(raw.fracionado), saldo: num(raw.saldo), ponto: num(raw.ponto), preco: num(raw.preco), compra: normalizarCompra(raw.compra),
  };
}

function normalizarConferencia(raw: unknown): Conferencia | null {
  if (!raw || typeof raw !== 'object') return null;
  const c = raw as Record<string, unknown>;
  return {
    id: String(c.id), data: String(c.data ?? ''), status: c.status === 'fechada' ? 'fechada' : 'aberta', titulo: txt(c.titulo),
    itens: (Array.isArray(c.itens) ? (c.itens as Record<string, unknown>[]) : []).map(a => ({
      item_id: String(a.item_id), nome: String(a.nome ?? '').trim(), um: String(a.um ?? ''),
      encontrado: numOuNull(a.encontrado), comprar: numOuNull(a.comprar), obs: txt(a.obs), anotado_em: String(a.anotado_em ?? ''),
    })),
  };
}

function extraDoCatalogo(c: ItemCatalogo, quantidade: number): ItemCompra {
  return {
    item_id: c.item_id, nome: c.nome, categoria: c.categoria, um: c.um, fracionado: c.fracionado,
    saldo: c.saldo, ponto: c.ponto, situacao: 'extra', sugerida: quantidade, preco: c.preco,
    em_lista: 0, em_lista_onde: null, adiado_ate: null, compra: c.compra, origem: null, recentes: [],
  };
}

// ─── Componente ──────────────────────────────────────────────────────────────
export default function Compras() {
  const [tela, setTela] = useState<Tela | null>(null);
  const [linhas, setLinhas] = useState<Record<string, Linha>>({});
  const [extras, setExtras] = useState<ItemCompra[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [gerando, setGerando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string; ids: string[] } | null>(null);
  const [aba, setAba] = useState<Aba>(() => {
    try { const s = localStorage.getItem('compras:aba'); return (s === 'fornecedores' || s === 'demanda' || s === 'config') ? s : 'rua'; } catch { return 'rua'; }
  });
  const [mostrarNoPonto, setMostrarNoPonto] = useState(false);
  const [busca, setBusca] = useState('');
  const [adicionando, setAdicionando] = useState(false);
  const [adiando, setAdiando] = useState<string | null>(null);
  const [confOcupado, setConfOcupado] = useState<'criar' | 'status' | null>(null);
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [soConferidos, setSoConferidos] = useState(false);
  const [cardAberto, setCardAberto] = useState<Record<string, boolean>>({});
  const [definindo, setDefinindo] = useState<string | null>(null);
  const [definirOutro, setDefinirOutro] = useState<string | null>(null);

  useEffect(() => { try { localStorage.setItem('compras:aba', aba); } catch { /* sem storage */ } }, [aba]);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try {
      const { data, error } = await supabase.rpc('fn_compras_tela');
      if (error) { setErro(error.message); return; }
      const d = (data || {}) as Record<string, unknown>;
      const itens = (Array.isArray(d.itens) ? (d.itens as Record<string, unknown>[]) : []).map(normalizarItem);
      const catalogo = (Array.isArray(d.catalogo) ? (d.catalogo as Record<string, unknown>[]) : []).map(normalizarCatalogo);
      const conferencia = normalizarConferencia(d.conferencia);
      const cfg = (d.config || {}) as Record<string, unknown>;
      setTela({
        hoje: String(d.hoje ?? ''), itens, catalogo,
        listas: (Array.isArray(d.listas) ? (d.listas as Record<string, unknown>[]) : []).map(normalizarLista),
        fornecedores: (Array.isArray(d.fornecedores) ? (d.fornecedores as Record<string, unknown>[]) : []).map(f => ({
          id: String(f.id), nome: String(f.nome ?? '').trim(), modalidade: (f.modalidade === 'rua' ? 'rua' : 'entrega') as Modalidade, telefone: txt(f.telefone),
        })),
        conferencia,
        config: { pendentes_via: num(cfg.pendentes_via), pontos_sem_giro: num(cfg.pontos_sem_giro) },
      });
      const l: Record<string, Linha> = {};
      for (const it of itens) l[it.item_id] = { quantidade: it.em_lista > 0 ? 0 : it.sugerida, origem: '', outro: false };

      // Conferência de hoje: a quantidade anotada no celular manda. Item
      // anotado que não está abaixo do ponto entra como extra, na aba do seu destino.
      const extrasIniciais: ItemCompra[] = [];
      for (const a of conferencia?.itens ?? []) {
        if (a.comprar === null) continue;
        if (l[a.item_id]) { l[a.item_id] = { ...l[a.item_id], quantidade: a.comprar }; continue; }
        const c = catalogo.find(x => x.item_id === a.item_id);
        if (!c) continue;
        extrasIniciais.push(extraDoCatalogo(c, a.comprar));
        l[c.item_id] = { quantidade: a.comprar, origem: '', outro: false };
      }
      setExtras(extrasIniciais);
      setLinhas(l);
      setSoConferidos((conferencia?.itens.length ?? 0) > 0);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Índices ──
  const fornPorId = useMemo(() => {
    const m = new Map<string, Fornecedor>();
    for (const f of tela?.fornecedores ?? []) m.set(f.id, f);
    return m;
  }, [tela]);
  const opcoesFornecedor = useMemo(() => (tela?.fornecedores ?? []).map(f => ({
    value: f.id, label: f.nome, sublabel: f.modalidade === 'rua' ? 'Loja de rua · vai na lista do comprador' : 'Entrega · vira pedido',
  })), [tela]);
  const anotacaoPorItem = useMemo(() => {
    const m = new Map<string, Anotacao>();
    for (const a of tela?.conferencia?.itens ?? []) m.set(a.item_id, a);
    return m;
  }, [tela]);
  const temConferidos = anotacaoPorItem.size > 0;

  /** Resolve o select de origem (só Sob demanda) em destino + fornecedor/loja. */
  const resolver = useCallback((origem: string): { destino: Destino; fornecedorId: string | null; lojaId: string | null; nome: string } | null => {
    if (origem === RUA) return { destino: 'rua', fornecedorId: null, lojaId: null, nome: 'Rua' };
    const id = idDe(origem);
    if (!id) return null;
    const f = fornPorId.get(id);
    if (!f) return null;
    if (f.modalidade === 'rua') return { destino: 'rua', fornecedorId: null, lojaId: f.id, nome: f.nome };
    return { destino: 'fornecedor', fornecedorId: f.id, lojaId: null, nome: f.nome };
  }, [fornPorId]);

  // ── Itens por aba ──
  const buscaLower = busca.trim().toLowerCase();
  const bate = useCallback((it: ItemCompra) => !buscaLower || it.nome.toLowerCase().includes(buscaLower) || nomeCat(it.categoria).toLowerCase().includes(buscaLower), [buscaLower]);
  const situacaoOk = useCallback((it: ItemCompra) => it.situacao === 'extra' || it.situacao === 'zerado' || it.situacao === 'comprar' || (it.situacao === 'atencao' && mostrarNoPonto), [mostrarNoPonto]);

  const doPonto = useMemo(() => (tela?.itens ?? []).filter(it => !it.adiado_ate), [tela]);
  const adiados = useMemo(() => (tela?.itens ?? []).filter(it => it.adiado_ate), [tela]);
  const valorAdiado = useMemo(() => adiados.reduce((s, it) => s + it.sugerida * it.preco, 0), [adiados]);

  /** Tudo que pode virar compra hoje: abaixo do ponto + extras, cada um com sua via. */
  const todos = useMemo(() => [...doPonto, ...extras], [doPonto, extras]);

  const filtroRua = useCallback((it: ItemCompra) => bate(it) && situacaoOk(it) && (!soConferidos || !temConferidos || anotacaoPorItem.has(it.item_id)), [bate, situacaoOk, soConferidos, temConferidos, anotacaoPorItem]);

  const itensRua = useMemo(() => todos.filter(it => it.compra.via === 'rua' && filtroRua(it)), [todos, filtroRua]);
  const itensForn = useMemo(() => todos.filter(it => it.compra.via === 'fornecedor' && bate(it) && situacaoOk(it)), [todos, bate, situacaoOk]);
  const itensSemVia = useMemo(() => todos.filter(it => it.compra.via === null && it.situacao !== 'extra' && bate(it) && situacaoOk(it)), [todos, bate, situacaoOk]);
  const itensDemanda = useMemo(() => extras.filter(it => it.compra.via === null && bate(it)), [extras, bate]);

  const gruposRua = useMemo(() => agruparPorCategoria(itensRua).map(([cat, lista]) =>
    [cat, [...lista].sort((a, b) => (ORDEM[a.situacao] ?? 9) - (ORDEM[b.situacao] ?? 9) || a.nome.localeCompare(b.nome, 'pt-BR'))] as const), [itensRua]);

  const cardsForn = useMemo(() => {
    const m = new Map<string, { fornecedor: Fornecedor; itens: ItemCompra[] }>();
    for (const it of itensForn) {
      const id = it.compra.fornecedor_id!;
      const f = fornPorId.get(id) ?? { id, nome: it.compra.fornecedor_nome ?? 'Fornecedor', modalidade: 'entrega' as Modalidade, telefone: it.compra.fornecedor_tel };
      (m.get(id) ?? m.set(id, { fornecedor: f, itens: [] }).get(id)!).itens.push(it);
    }
    return [...m.values()]
      .map(c => ({ ...c, itens: [...c.itens].sort((a, b) => nomeCat(a.categoria).localeCompare(nomeCat(b.categoria), 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR')) }))
      .sort((a, b) => b.itens.length - a.itens.length || a.fornecedor.nome.localeCompare(b.fornecedor.nome, 'pt-BR'));
  }, [itensForn, fornPorId]);

  const totalDe = useCallback((lista: ItemCompra[]) => {
    let itens = 0, valor = 0;
    for (const it of lista) { const q = linhas[it.item_id]?.quantidade ?? 0; if (q > 0) { itens += 1; valor += q * it.preco; } }
    return { itens, valor };
  }, [linhas]);

  const totRua = useMemo(() => totalDe(itensRua), [itensRua, totalDe]);
  const totForn = useMemo(() => totalDe(itensForn), [itensForn, totalDe]);
  const contagemNoPonto = useMemo(() => doPonto.filter(it => it.situacao === 'atencao').length, [doPonto]);

  // ── Edição ──
  const setLinha = (id: string, patch: Partial<Linha>) => setLinhas(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const adicionarExtra = (itemId: string) => {
    const c = tela?.catalogo.find(x => x.item_id === itemId);
    if (!c || todos.some(x => x.item_id === itemId)) { setAdicionando(false); return; }
    setExtras(prev => [...prev, extraDoCatalogo(c, 0)]);
    setLinhas(prev => ({ ...prev, [c.item_id]: { quantidade: 0, origem: '', outro: false } }));
    setAdicionando(false);
    if (c.compra.via === 'rua') setAba('rua');
    else if (c.compra.via === 'fornecedor') setAba('fornecedores');
    else setAba('demanda');
  };
  const removerExtra = (id: string) => {
    setExtras(prev => prev.filter(x => x.item_id !== id));
    setLinhas(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  const opcoesCatalogo = useMemo(() => (tela?.catalogo ?? [])
    .filter(c => !todos.some(x => x.item_id === c.item_id))
    .map(c => ({ value: c.item_id, label: c.nome, sublabel: `${nomeCat(c.categoria)} · ${fmtQtd(c.saldo)} ${c.um} no Central${c.compra.via === 'rua' ? ' · Rua' : c.compra.fornecedor_nome ? ` · ${c.compra.fornecedor_nome}` : ''}` })),
  [tela, todos]);

  // ── Adiar ──
  const marcarAdiado = (itemId: string, ate: string | null) =>
    setTela(prev => prev ? { ...prev, itens: prev.itens.map(it => (it.item_id === itemId ? { ...it, adiado_ate: ate } : it)) } : prev);
  const adiar = async (it: ItemCompra) => {
    setAdiando(it.item_id);
    try {
      const { data, error } = await supabase.rpc('fn_compras_adiar', { p_item_id: it.item_id, p_dias: 1 });
      const r = (data || {}) as { success?: boolean; error?: string; adiado_ate?: string };
      if (error || r.success === false) { setErro(error?.message || r.error || 'Não foi possível adiar'); return; }
      marcarAdiado(it.item_id, String(r.adiado_ate ?? tela?.hoje ?? ''));
      setLinha(it.item_id, { quantidade: 0 });
    } finally { setAdiando(null); }
  };
  const trazerDeVolta = async (it: ItemCompra) => {
    setAdiando(it.item_id);
    try {
      const { error } = await supabase.rpc('fn_compras_adiar_desfazer', { p_item_id: it.item_id });
      if (error) { setErro(error.message); return; }
      marcarAdiado(it.item_id, null);
      setLinha(it.item_id, { quantidade: it.em_lista > 0 ? 0 : it.sugerida });
    } finally { setAdiando(null); }
  };

  // ── Definir "como compra" direto da lista ──
  const definirVia = async (it: ItemCompra, via: Destino, fornecedorId: string | null) => {
    setDefinindo(it.item_id); setErro('');
    try {
      const { error } = await supabase.rpc('fn_compras_definir_via', { p_item_id: it.item_id, p_via: via, p_fornecedor_id: fornecedorId });
      if (error) { setErro(error.message); return; }
      const f = fornecedorId ? fornPorId.get(fornecedorId) : null;
      const compra: Compra = { via: f?.modalidade === 'rua' ? 'rua' : via, fornecedor_id: fornecedorId, fornecedor_nome: f?.nome ?? null, fornecedor_tel: f?.telefone ?? null, modalidade: f?.modalidade ?? null, revisada: true };
      setTela(prev => prev ? { ...prev, itens: prev.itens.map(x => (x.item_id === it.item_id ? { ...x, compra } : x)), config: { ...prev.config, pendentes_via: Math.max(0, prev.config.pendentes_via - 1) } } : prev);
      setExtras(prev => prev.map(x => (x.item_id === it.item_id ? { ...x, compra } : x)));
      setDefinirOutro(null);
    } finally { setDefinindo(null); }
  };

  // ── Gerar ──
  type LinhaEnvio = { item_id: string; quantidade: number; destino: Destino; fornecedor_id: string | null; loja_id: string | null; observacao?: string | null };

  const gerar = async (chave: string, linhasEnvio: LinhaEnvio[], depois?: (listas: ListaResumo[]) => void) => {
    if (linhasEnvio.length === 0) { setErro('Nenhum item com quantidade.'); return; }
    setGerando(chave); setResultado(null); setErro('');
    try {
      const { data, error } = await supabase.rpc('fn_compras_gerar', { p_linhas: linhasEnvio });
      if (error) { setResultado({ ok: false, texto: error.message, ids: [] }); return; }
      const r = (data || {}) as { linhas?: number; listas?: Record<string, unknown>[] };
      const listas = (r.listas ?? []).map(normalizarLista);
      const partes = listas.map(l => (l.tipo === 'rua' ? `Rua (${plural(l.itens, 'item', 'itens')})` : `${l.fornecedor_nome} (${plural(l.itens, 'item', 'itens')})`));
      setResultado({ ok: true, texto: `${plural(num(r.linhas), 'linha', 'linhas')} em ${plural(listas.length, 'lista', 'listas')}: ${partes.join(' · ')}. Os links estão em "Listas abertas".`, ids: listas.map(l => l.lista_id) });
      depois?.(listas);
      await carregar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: unknown) {
      setResultado({ ok: false, texto: e instanceof Error ? e.message : String(e), ids: [] });
    } finally { setGerando(null); }
  };

  const obsConferencia = (it: ItemCompra) => {
    const a = anotacaoPorItem.get(it.item_id);
    return a && a.encontrado !== null ? `conferido: tinha ${fmtQtd(a.encontrado)}` : null;
  };

  const gerarRua = () => gerar('rua', itensRua
    .filter(it => (linhas[it.item_id]?.quantidade ?? 0) > 0)
    .map(it => ({ item_id: it.item_id, quantidade: linhas[it.item_id].quantidade, destino: 'rua' as Destino, fornecedor_id: null,
      loja_id: it.compra.modalidade === 'rua' ? it.compra.fornecedor_id : null, observacao: obsConferencia(it) })));

  const enviarPedido = (card: { fornecedor: Fornecedor; itens: ItemCompra[] }) => {
    const ativos = card.itens.filter(it => (linhas[it.item_id]?.quantidade ?? 0) > 0);
    const linhasEnvio = ativos.map(it => ({ item_id: it.item_id, quantidade: linhas[it.item_id].quantidade, destino: 'fornecedor' as Destino, fornecedor_id: card.fornecedor.id, loja_id: null }));
    gerar(card.fornecedor.id, linhasEnvio, () => {
      const texto = textoPedidoFornecedor(card.fornecedor.nome, fmtData(tela?.hoje ?? ''), ativos.map(it => ({ nome: it.nome, quantidade: linhas[it.item_id].quantidade, um: it.um })));
      window.open(urlWhatsApp(texto, card.fornecedor.telefone), '_blank', 'noopener');
    });
  };

  const gerarDemanda = () => {
    const ativos = itensDemanda.filter(it => (linhas[it.item_id]?.quantidade ?? 0) > 0);
    const semOrigem = ativos.filter(it => !resolver(linhas[it.item_id].origem));
    if (semOrigem.length > 0) { setErro(`Escolha Rua ou um fornecedor para: ${semOrigem.map(i => i.nome).join(', ')}.`); return; }
    gerar('demanda', ativos.map(it => {
      const r = resolver(linhas[it.item_id].origem)!;
      return { item_id: it.item_id, quantidade: linhas[it.item_id].quantidade, destino: r.destino, fornecedor_id: r.fornecedorId, loja_id: r.lojaId };
    }));
  };

  // ── Conferência ──
  const criarConferencia = async () => {
    setConfOcupado('criar'); setErro('');
    try { const { error } = await supabase.rpc('fn_conferencia_criar'); if (error) { setErro(error.message); return; } await carregar(); }
    finally { setConfOcupado(null); }
  };
  const statusConferencia = async (status: 'aberta' | 'fechada') => {
    const c = tela?.conferencia; if (!c) return;
    if (status === 'fechada' && !window.confirm('Fechar a conferência de hoje? O celular para de aceitar anotações.')) return;
    setConfOcupado('status'); setErro('');
    try { const { error } = await supabase.rpc('fn_conferencia_status', { p_id: c.id, p_status: status }); if (error) { setErro(error.message); return; } await carregar(); }
    finally { setConfOcupado(null); }
  };
  const copiarLinkConferencia = async () => {
    const c = tela?.conferencia; if (!c) return;
    try { await navigator.clipboard.writeText(urlConferencia(c.id)); setLinkCopiado(true); setTimeout(() => setLinkCopiado(false), 2500); }
    catch { window.prompt('Copie o link:', urlConferencia(c.id)); }
  };

  // ── Listas ──
  const listasAbertas = (tela?.listas ?? []).filter(l => l.status !== 'concluida');
  const listasRuaAbertas = listasAbertas.filter(l => l.tipo === 'rua');
  const listasFornAbertas = listasAbertas.filter(l => l.tipo === 'fornecedor');
  const listasConcluidas = (tela?.listas ?? []).filter(l => l.status === 'concluida');

  // ── Sub-render ──
  const badgeSituacao = (it: ItemCompra) => it.situacao === 'zerado'
    ? <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-300 border border-red-500/30">zerado</span>
    : it.situacao === 'atencao' ? <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-yellow-500/10 text-yellow-200 border border-yellow-500/30">no ponto</span>
    : it.situacao === 'extra' ? <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/10 text-white/60 border border-white/15">incluído</span>
    : null;

  const linhaItem = (it: ItemCompra, extra?: ReactNode) => {
    const st = linhas[it.item_id] ?? { quantidade: 0, origem: '', outro: false };
    const ativa = st.quantidade > 0;
    const a = anotacaoPorItem.get(it.item_id);
    return (
      <tr key={it.item_id} className={`hover:bg-white/[0.02] ${ativa ? '' : 'opacity-50'}`}>
        <td className="px-3 py-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white/90">{it.nome}</span>
            <span className="text-caption text-white/40">{it.um}</span>
            {badgeSituacao(it)}
            {it.situacao === 'extra' ? (
              <button onClick={() => removerExtra(it.item_id)} className="text-white/30 hover:text-white/60" title="Tirar da tela"><X size={12} /></button>
            ) : (
              <button onClick={() => adiar(it)} disabled={adiando === it.item_id}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium text-white/40 border border-transparent hover:text-amber-300 hover:border-amber-500/40 hover:bg-amber-500/10 disabled:opacity-50"
                title="Tirar da lista de hoje e jogar para amanhã (corte de custo)">
                {adiando === it.item_id ? <Loader2 size={11} className="animate-spin" /> : <CalendarClock size={11} />} Amanhã
              </button>
            )}
            {it.em_lista > 0 && <span className="text-caption text-orange-300/80">já na lista: {it.em_lista_onde || fmtQtd(it.em_lista)}</span>}
            {a && (
              <span className="text-caption text-teal-300/90 inline-flex items-center gap-1" title={a.obs ? `Obs: ${a.obs}` : 'Anotado na conferência do celular'}>
                <Smartphone size={10} />
                {a.encontrado !== null ? `tem ${fmtQtd(a.encontrado)}` : ''}{a.encontrado !== null && a.comprar !== null ? ' · ' : ''}{a.comprar !== null ? `pediu ${fmtQtd(a.comprar)}` : ''}
              </span>
            )}
          </div>
        </td>
        <td className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap ${it.saldo <= 0 ? 'text-red-400 font-semibold' : 'text-white/80'}`} title="saldo no Estoque Central">
          {fmtQtd(it.saldo)}
        </td>
        <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-white/50" title="ponto de pedido do cadastro">
          {it.ponto > 0 ? fmtQtd(it.ponto) : '—'}
        </td>
        <td className="px-3 py-1 text-right">
          <input type="number" min={0} step={it.fracionado ? 0.01 : 1} value={st.quantidade}
            onChange={e => { const v = parseFloat(e.target.value); setLinha(it.item_id, { quantidade: arredondar(Number.isFinite(v) ? Math.max(0, v) : 0, it.fracionado) }); }}
            onFocus={e => e.target.select()}
            className="w-24 text-right text-sm font-bold border border-white/10 rounded-md px-2 py-1 bg-[#0c1018] text-white focus:outline-none focus:ring-2 focus:ring-wine/30" />
        </td>
        {extra !== undefined && <td className="px-3 py-1">{extra}</td>}
      </tr>
    );
  };

  const cabecalhoTabela = (ultima?: string) => (
    <thead>
      <tr className="bg-[#0c1018] text-white/50 text-xs">
        <th className="px-3 py-2 text-left font-medium">Produto</th>
        <th className="px-3 py-2 text-right font-medium w-24">Central</th>
        <th className="px-3 py-2 text-right font-medium w-20">Ponto</th>
        <th className="px-3 py-2 text-right font-medium w-32">Comprar</th>
        {ultima !== undefined && <th className="px-3 py-2 text-left font-medium w-72">{ultima}</th>}
      </tr>
    </thead>
  );

  /** Itens abaixo do ponto sem "como compra": resolve na hora. */
  const blocoSemVia = itensSemVia.length > 0 && (
    <div className="bg-[#12141f] rounded-2xl border border-amber-500/30">
      <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-amber-200 font-semibold flex items-center gap-2"><AlertTriangle size={15} /> {plural(itensSemVia.length, 'item abaixo do ponto sem destino', 'itens abaixo do ponto sem destino')}</p>
        <p className="text-xs text-white/50">Diga se vai pela Rua ou por qual fornecedor. Fica salvo no cadastro.</p>
      </div>
      <div className="overflow-x-auto rounded-b-2xl">
        <table className="w-full text-sm">
          {cabecalhoTabela('Como compra')}
          <tbody className="divide-y divide-white/5">
            {itensSemVia.map(it => linhaItem(it, (
              definirOutro === it.item_id ? (
                <div className="flex items-center gap-1">
                  <div className="flex-1 min-w-0">
                    <SearchableSelect theme="dark" options={opcoesFornecedor} value="" placeholder="Buscar fornecedor..." emptyMessage="Nenhum"
                      onChange={v => { if (!v) return; const f = fornPorId.get(v); definirVia(it, f?.modalidade === 'rua' ? 'rua' : 'fornecedor', v); }} />
                  </div>
                  <button onClick={() => setDefinirOutro(null)} className="text-white/30 hover:text-white/60"><X size={12} /></button>
                </div>
              ) : (
                <div className="flex items-center gap-1 flex-wrap">
                  {it.origem?.fornecedor_id && fornPorId.get(it.origem.fornecedor_id) && (
                    <button onClick={() => definirVia(it, it.origem!.tipo, it.origem!.fornecedor_id!)} disabled={definindo !== null}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border bg-teal-500/10 text-teal-300 border-teal-500/30 hover:bg-teal-500/20 disabled:opacity-50"
                      title={it.origem.motivo === 'historico' ? `onde mais comprou · ${it.origem.compras}x` : 'sugestão'}>
                      {definindo === it.item_id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} {fornPorId.get(it.origem.fornecedor_id)!.nome}{it.origem.compras ? ` · ${it.origem.compras}x` : ''}
                    </button>
                  )}
                  <button onClick={() => definirVia(it, 'rua', null)} disabled={definindo !== null}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border border-white/15 text-white/70 hover:bg-white/10 disabled:opacity-50"><Store size={11} /> Rua</button>
                  <button onClick={() => setDefinirOutro(it.item_id)} disabled={definindo !== null}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border border-white/15 text-white/70 hover:bg-white/10 disabled:opacity-50"><Truck size={11} /> Fornecedor…</button>
                </div>
              )
            )))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const barraFiltros = (extraChips?: ReactNode) => (
    <div className="bg-[#12141f] rounded-2xl border border-white/10 px-4 py-2.5 flex items-center gap-2 flex-wrap">
      {extraChips}
      <button onClick={() => setMostrarNoPonto(v => !v)}
        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${mostrarNoPonto ? 'bg-yellow-500/15 text-yellow-200 border-yellow-500/40' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'}`}
        title="Itens exatamente no ponto (ainda não abaixo)">
        No ponto ({contagemNoPonto})
      </button>
      <div className="relative w-full sm:w-64">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar item ou categoria..."
          className="w-full pl-9 pr-8 py-1.5 text-sm border border-white/10 rounded-xl bg-[#0c1018] text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-wine/30" />
        {busca && <button onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"><X size={14} /></button>}
      </div>
      <div className="ml-auto">
        {adicionando ? (
          <div className="w-80">
            <SearchableSelect theme="dark" options={opcoesCatalogo} value="" onChange={adicionarExtra} placeholder="Buscar item para incluir..." emptyMessage="Nenhum item" />
          </div>
        ) : (
          <button onClick={() => setAdicionando(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 text-xs font-medium text-white/70 hover:bg-white/5">
            <Plus size={14} /> Incluir item
          </button>
        )}
      </div>
    </div>
  );

  const blocoAdiados = adiados.length > 0 && (
    <div className="bg-[#12141f] rounded-2xl border border-amber-500/30">
      <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-semibold text-amber-300 flex items-center gap-2"><CalendarClock size={16} /> Adiados para amanhã <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/15 text-amber-200">{adiados.length}</span></p>
        <p className="text-xs text-white/60">Cortado da compra de hoje: <span className="text-amber-300 font-semibold">{fmtMoeda(valorAdiado)}</span>. Voltam sozinhos amanhã.</p>
      </div>
      <div className="overflow-x-auto rounded-b-2xl">
        <table className="w-full text-sm"><tbody className="divide-y divide-white/5">
          {[...adiados].sort((a, b) => nomeCat(a.categoria).localeCompare(nomeCat(b.categoria), 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR')).map(it => (
            <tr key={it.item_id} className="hover:bg-white/[0.02]">
              <td className="px-3 py-1.5"><span className="text-white/80">{it.nome}</span><span className="ml-2 text-caption text-white/40">{nomeCat(it.categoria)} · {it.compra.via === 'rua' ? 'Rua' : it.compra.fornecedor_nome ?? 'sem destino'}</span></td>
              <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-white/60">{fmtQtd(it.saldo)} {it.um}</td>
              <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-white/60">{fmtQtd(it.sugerida)} {it.um} · <span className="text-amber-300">{fmtMoeda(it.sugerida * it.preco)}</span></td>
              <td className="px-3 py-1.5 text-right w-40">
                <button onClick={() => trazerDeVolta(it)} disabled={adiando === it.item_id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-white/15 text-white/70 hover:bg-white/10 disabled:opacity-50">
                  {adiando === it.item_id ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />} Trazer de volta
                </button>
              </td>
            </tr>
          ))}
        </tbody></table>
      </div>
    </div>
  );

  const cardConferencia = tela && (
    <div className={`rounded-2xl border px-4 py-3 bg-[#12141f] ${tela.conferencia?.status === 'aberta' ? 'border-teal-500/30' : 'border-white/10'}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-teal-500/15"><Smartphone size={17} className="text-teal-300" /></div>
          <div className="min-w-0">
            <p className="text-white font-bold leading-tight text-sm">
              Conferência no celular
              {tela.conferencia && <span className={`ml-2 px-1.5 py-0.5 text-[10px] font-semibold rounded-md align-middle ${tela.conferencia.status === 'aberta' ? 'bg-teal-500/15 text-teal-300' : 'bg-white/10 text-white/50'}`}>{tela.conferencia.status}</span>}
            </p>
            <p className="text-xs text-white/60 mt-0.5">
              {tela.conferencia
                ? <>{plural(tela.conferencia.itens.length, 'item anotado', 'itens anotados')} hoje. O que foi anotado já está com a quantidade preenchida.</>
                : <>Apoio enquanto os saldos não são confiáveis: alguém confere in loco e anota quanto tem e quanto comprar.</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {tela.conferencia ? (
            <>
              <a href={urlConferencia(tela.conferencia.id)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-xs font-medium text-white/70 hover:bg-white/5"><Smartphone size={13} /> Abrir</a>
              <button onClick={copiarLinkConferencia} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-xs font-medium text-white/70 hover:bg-white/5">{linkCopiado ? <Check size={13} className="text-green-400" /> : <Copy size={13} />} {linkCopiado ? 'Copiado' : 'Copiar link'}</button>
              <a href={urlWhatsApp(`📋 Conferência do estoque · ${fmtData(tela.conferencia.data)}\nAbra o link, busque o item pelo nome e anote quanto tem e quanto comprar:\n${urlConferencia(tela.conferencia.id)}`)} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-green-500/30 bg-green-500/10 text-xs font-medium text-green-300 hover:bg-green-500/20"><MessageCircle size={13} /> WhatsApp</a>
              {tela.conferencia.status === 'aberta'
                ? <button onClick={() => statusConferencia('fechada')} disabled={confOcupado !== null} className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-white/10 text-xs text-white/50 hover:bg-white/5 disabled:opacity-50">{confOcupado === 'status' ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />} Fechar</button>
                : <button onClick={() => statusConferencia('aberta')} disabled={confOcupado !== null} className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-white/10 text-xs text-white/50 hover:bg-white/5 disabled:opacity-50">{confOcupado === 'status' ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Reabrir</button>}
            </>
          ) : (
            <button onClick={criarConferencia} disabled={confOcupado !== null} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-teal-500/30 bg-teal-500/10 text-xs font-semibold text-teal-200 hover:bg-teal-500/20 disabled:opacity-50">
              {confOcupado === 'criar' ? <Loader2 size={13} className="animate-spin" /> : <Smartphone size={13} />} Gerar link de conferência
            </button>
          )}
        </div>
      </div>
    </div>
  );

  const listasBloco = (lista: ListaResumo[], titulo: string) => lista.length > 0 && (
    <div className="space-y-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-white/50 flex items-center gap-2 px-1"><ClipboardList size={14} /> {titulo}</p>
      {lista.map(l => <CardListaCompra key={l.lista_id} lista={l} onMudou={carregar} destaque={resultado?.ids.includes(l.lista_id)} />)}
    </div>
  );

  const abas: { k: Aba; label: string; icone: ReactNode; badge: string; alerta?: boolean }[] = [
    { k: 'rua', label: 'Rua', icone: <Store size={15} />, badge: `${itensRua.length}${totRua.valor > 0 ? ` · ${fmtMoeda(totRua.valor)}` : ''}` },
    { k: 'fornecedores', label: 'Fornecedores', icone: <Truck size={15} />, badge: `${cardsForn.length}${totForn.valor > 0 ? ` · ${fmtMoeda(totForn.valor)}` : ''}` },
    { k: 'demanda', label: 'Sob demanda', icone: <Plus size={15} />, badge: String(itensDemanda.length) },
    { k: 'config', label: 'Configurar', icone: <Settings2 size={15} />, badge: String((tela?.config.pendentes_via ?? 0) + (tela?.config.pontos_sem_giro ?? 0)), alerta: (tela?.config.pendentes_via ?? 0) + (tela?.config.pontos_sem_giro ?? 0) > 0 },
  ];

  // ── Render ──
  return (
    <div className="space-y-4">
      <div className="bg-[#12141f] rounded-2xl border border-white/10 px-5 py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-wine rounded-xl flex items-center justify-center flex-shrink-0"><ShoppingBag size={20} className="text-white" /></div>
            <div>
              <h2 className="text-lg font-bold text-white">Compras</h2>
              <p className="text-sm text-white/60">Pelo ponto de pedido do cadastro, no Estoque Central. Rua vai para o comprador; fornecedor vira pedido no WhatsApp.</p>
            </div>
          </div>
          <button onClick={carregar} disabled={carregando} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-sm font-medium text-white/60 hover:bg-white/5 disabled:opacity-50">
            <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          {abas.map(a => (
            <button key={a.k} onClick={() => setAba(a.k)}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors ${aba === a.k ? 'bg-wine text-white border-wine' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'}`}>
              {a.icone} {a.label}
              <span className={`px-1.5 py-0.5 text-[11px] rounded-md ${aba === a.k ? 'bg-white/20' : a.alerta ? 'bg-amber-500/20 text-amber-200' : 'bg-white/10 text-white/60'}`}>{a.badge}</span>
            </button>
          ))}
        </div>
      </div>

      {resultado && (
        <div className={`rounded-xl px-4 py-3 text-sm border flex items-start gap-2 ${resultado.ok ? 'bg-green-500/10 border-green-500/30 text-green-300' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
          {resultado.ok ? <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />}
          <p className="flex-1">{resultado.texto}</p>
          <button onClick={() => setResultado(null)} className="text-white/30 hover:text-white/60"><X size={14} /></button>
        </div>
      )}
      {erro && (
        <div className="rounded-xl p-3 text-sm border bg-red-500/10 border-red-500/30 text-red-400 flex items-center gap-3 flex-wrap">
          <AlertTriangle size={16} className="flex-shrink-0" /><span className="flex-1">{erro}</span>
          <button onClick={() => setErro('')} className="text-red-300/60"><X size={14} /></button>
        </div>
      )}

      {carregando && !tela && !erro && (
        <div className="text-center py-16 text-white/30"><Loader2 size={24} className="animate-spin mx-auto mb-3" /><p>Conferindo o Central...</p></div>
      )}

      {tela && aba === 'rua' && (
        <>
          {listasBloco(listasRuaAbertas, 'Listas da Rua abertas')}
          {cardConferencia}
          {barraFiltros(temConferidos && (
            <button onClick={() => setSoConferidos(v => !v)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 ${soConferidos ? 'bg-teal-500/20 text-teal-200 border-teal-500/40' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'}`}>
              <Smartphone size={12} /> Só conferidos ({anotacaoPorItem.size})
            </button>
          ))}
          {blocoSemVia}
          {itensRua.length === 0 ? (
            <div className="bg-[#12141f] rounded-2xl border border-white/10 text-center py-14 text-white/40">
              <Package size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-white/70 font-medium">Nada da Rua abaixo do ponto{soConferidos && temConferidos ? ' entre os conferidos' : ''}.</p>
            </div>
          ) : (
            <div className="bg-[#12141f] rounded-2xl border border-white/10">
              <div className="overflow-x-auto rounded-t-2xl">
                <table className="w-full text-sm">
                  {cabecalhoTabela()}
                  <tbody className="divide-y divide-white/5">
                    {gruposRua.flatMap(([categoria, lista]) => [
                      <tr key={`cat:${categoria}`} className="bg-white/[0.05]">
                        <td colSpan={4} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/60">
                          {categoria} <span className="normal-case font-normal text-white/30">· {lista.filter(it => (linhas[it.item_id]?.quantidade ?? 0) > 0).length} de {lista.length}</span>
                        </td>
                      </tr>,
                      ...lista.map(it => linhaItem(it)),
                    ])}
                  </tbody>
                </table>
              </div>
              <div className="sticky bottom-0 rounded-b-2xl border-t border-white/10 bg-[#12141f]/95 backdrop-blur px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-white/60"><span className="text-white font-semibold">{plural(totRua.itens, 'item', 'itens')} · {fmtMoeda(totRua.valor)} estimado</span> · Comprar = o que falta para o ponto. Zero = não compra.</p>
                <button onClick={gerarRua} disabled={totRua.itens === 0 || gerando !== null}
                  className="flex items-center gap-2 bg-wine hover:bg-[#6a1a25] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
                  {gerando === 'rua' ? <Loader2 size={14} className="animate-spin" /> : <Store size={14} />} Gerar lista da Rua
                </button>
              </div>
            </div>
          )}
          {blocoAdiados}
        </>
      )}

      {tela && aba === 'fornecedores' && (
        <>
          {listasBloco(listasFornAbertas, 'Pedidos abertos (somem quando a nota entra)')}
          {barraFiltros()}
          {blocoSemVia}
          {cardsForn.length === 0 ? (
            <div className="bg-[#12141f] rounded-2xl border border-white/10 text-center py-14 text-white/40">
              <Package size={32} className="mx-auto mb-3 opacity-40" />
              <p className="text-white/70 font-medium">Nenhum fornecedor com item abaixo do ponto.</p>
            </div>
          ) : cardsForn.map(card => {
            const tot = totalDe(card.itens);
            const aberto = cardAberto[card.fornecedor.id] ?? (cardsForn.length <= 3);
            return (
              <div key={card.fornecedor.id} className="bg-[#12141f] rounded-2xl border border-white/10">
                <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
                  <button onClick={() => setCardAberto(prev => ({ ...prev, [card.fornecedor.id]: !aberto }))} className="flex items-center gap-3 min-w-0 text-left">
                    <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-blue-500/15"><Truck size={17} className="text-blue-400" /></div>
                    <div className="min-w-0">
                      <p className="text-white font-bold leading-tight">{card.fornecedor.nome}</p>
                      <p className="text-xs text-white/60 mt-0.5">
                        {plural(card.itens.length, 'item abaixo do ponto', 'itens abaixo do ponto')} · <span className="text-white/90">{fmtMoeda(tot.valor)}</span> em {plural(tot.itens, 'item', 'itens')}
                        {card.fornecedor.telefone && <span className="inline-flex items-center gap-1 ml-2 text-blue-300"><Phone size={11} /> {card.fornecedor.telefone}</span>}
                        <span className="ml-2 text-white/30">{aberto ? 'recolher' : 'ver itens'}</span>
                      </p>
                    </div>
                  </button>
                  <button onClick={() => enviarPedido(card)} disabled={tot.itens === 0 || gerando !== null}
                    className="flex items-center gap-2 bg-wine hover:bg-[#6a1a25] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors"
                    title="Gera o pedido e abre o WhatsApp do fornecedor com os itens">
                    {gerando === card.fornecedor.id ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Enviar pedido
                  </button>
                </div>
                {aberto && (
                  <div className="overflow-x-auto border-t border-white/5 rounded-b-2xl">
                    <table className="w-full text-sm">
                      {cabecalhoTabela()}
                      <tbody className="divide-y divide-white/5">{card.itens.map(it => linhaItem(it))}</tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
          {blocoAdiados}
        </>
      )}

      {tela && aba === 'demanda' && (
        <>
          {barraFiltros()}
          <div className="bg-[#12141f] rounded-2xl border border-white/10">
            <div className="px-4 py-3 border-b border-white/10">
              <p className="text-sm text-white/70">Nada entra aqui sozinho. Use "Incluir item" para o que não tem ponto de pedido ou não tem destino no cadastro, escolha Rua ou o fornecedor e gere.</p>
            </div>
            {itensDemanda.length === 0 ? (
              <p className="text-center text-white/40 py-10 text-sm">Nenhum item incluído.</p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    {cabecalhoTabela('Origem')}
                    <tbody className="divide-y divide-white/5">
                      {itensDemanda.map(it => {
                        const st = linhas[it.item_id] ?? { quantidade: 0, origem: '', outro: false };
                        const idAtual = idDe(st.origem);
                        const atual = idAtual ? fornPorId.get(idAtual) : null;
                        return linhaItem(it, (
                          <>
                            <select value={st.outro ? OUTRO : st.origem}
                              onChange={e => (e.target.value === OUTRO ? setLinha(it.item_id, { outro: true, origem: '' }) : setLinha(it.item_id, { origem: e.target.value, outro: false }))}
                              className={`w-full text-xs border rounded-md px-2 py-1.5 bg-[#0c1018] text-white focus:outline-none ${st.quantidade > 0 && !resolver(st.origem) ? 'border-red-500/60' : 'border-white/10'}`}>
                              <option value="">—</option>
                              <option value={RUA}>🛒 Rua</option>
                              {it.recentes.length > 0 && <optgroup label="Já comprou de">{it.recentes.map(f => <option key={f.fornecedor_id} value={fId(f.fornecedor_id)}>{f.modalidade === 'rua' ? '🛒 ' : '🚚 '}{f.nome}{f.compras > 0 ? ` · ${f.compras}x` : ''}</option>)}</optgroup>}
                              {atual && !it.recentes.some(f => f.fornecedor_id === atual.id) && <option value={fId(atual.id)}>{atual.modalidade === 'rua' ? '🛒 ' : '🚚 '}{atual.nome}</option>}
                              <option value={OUTRO}>Outro fornecedor…</option>
                            </select>
                            {st.outro && <SearchableSelect theme="dark" className="mt-1" options={opcoesFornecedor} value="" placeholder="Buscar fornecedor..." emptyMessage="Nenhum" onChange={v => setLinha(it.item_id, { origem: v ? fId(v) : '', outro: false })} />}
                          </>
                        ));
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="rounded-b-2xl border-t border-white/10 px-5 py-3 flex items-center justify-end">
                  <button onClick={gerarDemanda} disabled={gerando !== null}
                    className="flex items-center gap-2 bg-wine hover:bg-[#6a1a25] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
                    {gerando === 'demanda' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Gerar
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {tela && aba === 'config' && (
        <ComprasConfigurar fornecedores={tela.fornecedores} onMudou={carregar} />
      )}

      {tela && aba !== 'config' && listasConcluidas.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-white/50 flex items-center gap-2 px-1 py-1 select-none">
            <CheckCircle2 size={14} className="text-green-400" /> Listas concluídas · últimos 7 dias ({listasConcluidas.length})
            <span className="normal-case font-normal text-white/30 tracking-normal">— ver e imprimir em PDF</span>
          </summary>
          <div className="space-y-2 mt-2">{listasConcluidas.map(l => <CardListaCompra key={l.lista_id} lista={l} onMudou={carregar} />)}</div>
        </details>
      )}
    </div>
  );
}
