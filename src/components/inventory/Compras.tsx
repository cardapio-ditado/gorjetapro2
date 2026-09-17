import { useState, useEffect, useCallback, useMemo, type ReactNode } from 'react';
import {
  ShoppingBag, RefreshCw, Search, X, Loader2, Package, AlertTriangle, CheckCircle2, Plus, Store, Truck, ClipboardList,
  CalendarClock, Undo2, Smartphone, Copy, Check, MessageCircle, Lock, RotateCcw, ClipboardCheck,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SearchableSelect } from '../common/SearchableSelect';
import { fmtQtd, fmtMoeda, fmtData, urlConferencia, urlWhatsApp, type Situacao } from './comprasShared';
import { CardListaCompra, normalizarLista, type ListaResumo } from './CardListaCompra';
import { agruparPorCategoria, SEM_CATEGORIA } from './agruparPorCategoria';
import { ComprasRevisao, type Classe } from './ComprasRevisao';

/**
 * Compras — por ponto de pedido, em abas.
 *
 * Tudo entra pelo ponto de pedido do cadastro (manual). A CLASSE do item diz
 * a aba: Rua (lista do comprador) · Pedido (blocos por categoria; o
 * fornecedor é escolhido no dia, por categoria ou por linha) · Sob demanda
 * (nunca entra sozinho). A aba Revisão classifica os itens uma vez.
 */

type Modalidade = 'entrega' | 'rua';
type Destino = 'rua' | 'fornecedor';
type Aba = 'rua' | 'pedidos' | 'demanda' | 'revisao';

interface FornecedorRecente { fornecedor_id: string; nome: string; modalidade: Modalidade; ultimo_preco: number | null; compras: number }
interface MaisComprado { fornecedor_id: string; modalidade: Modalidade; compras: number }

interface ItemCompra {
  item_id: string; nome: string; categoria: string | null; um: string; fracionado: boolean;
  saldo: number; ponto: number; situacao: Situacao | 'extra'; sugerida: number; preco: number;
  em_lista: number; em_lista_onde: string | null; adiado_ate: string | null;
  classe: Classe | null; mais_comprado: MaisComprado | null; recentes: FornecedorRecente[];
}
interface ItemCatalogo {
  item_id: string; nome: string; categoria: string | null; um: string; fracionado: boolean;
  saldo: number; ponto: number; preco: number; classe: Classe | null; recentes: FornecedorRecente[];
}
interface Fornecedor { id: string; nome: string; modalidade: Modalidade; telefone: string | null }
interface FornCategoria { fornecedor_id: string; nome: string; compras: number }
interface Anotacao { item_id: string; nome: string; um: string; encontrado: number | null; comprar: number | null; obs: string | null; anotado_em: string }
interface Conferencia { id: string; data: string; status: 'aberta' | 'fechada'; titulo: string | null; itens: Anotacao[] }

interface Tela {
  hoje: string; itens: ItemCompra[]; catalogo: ItemCatalogo[]; listas: ListaResumo[];
  fornecedores: Fornecedor[]; categoriaFornecedores: Record<string, FornCategoria[]>; conferencia: Conferencia | null;
  config: { pendentes_classe: number; pendentes_classe_com_ponto: number; pontos_sem_giro: number };
}

/** quantidade (0 = não compra); origem: '' = usar o da categoria (Pedidos) / sem origem (Sob demanda); 'rua' | 'f:<id>' */
interface Linha { quantidade: number; origem: string; outro: boolean }
interface OpcaoForn { id: string; nome: string; sub?: string }

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
const classeOk = (v: unknown): Classe | null => (v === 'rua' || v === 'pedido' || v === 'sob_demanda' ? v : null);

const recentesDe = (raw: unknown): FornecedorRecente[] => (Array.isArray(raw) ? (raw as Record<string, unknown>[]) : []).map(r => ({
  fornecedor_id: String(r.fornecedor_id), nome: String(r.nome ?? ''), modalidade: (r.modalidade === 'rua' ? 'rua' : 'entrega') as Modalidade,
  ultimo_preco: numOuNull(r.ultimo_preco), compras: num(r.compras),
}));

function normalizarItem(raw: Record<string, unknown>): ItemCompra {
  const m = raw.mais_comprado && typeof raw.mais_comprado === 'object' ? (raw.mais_comprado as Record<string, unknown>) : null;
  return {
    item_id: String(raw.item_id), nome: String(raw.nome ?? '').trim(), categoria: txt(raw.categoria), um: String(raw.um ?? ''),
    fracionado: Boolean(raw.fracionado), saldo: num(raw.saldo), ponto: num(raw.ponto),
    situacao: ((raw.situacao as Situacao) || 'ok'), sugerida: num(raw.sugerida), preco: num(raw.preco),
    em_lista: num(raw.em_lista), em_lista_onde: txt(raw.em_lista_onde),
    adiado_ate: raw.adiado_ate ? String(raw.adiado_ate).slice(0, 10) : null,
    classe: classeOk(raw.classe),
    mais_comprado: m ? { fornecedor_id: String(m.fornecedor_id), modalidade: (m.modalidade === 'rua' ? 'rua' : 'entrega') as Modalidade, compras: num(m.compras) } : null,
    recentes: recentesDe(raw.recentes),
  };
}
function normalizarCatalogo(raw: Record<string, unknown>): ItemCatalogo {
  return {
    item_id: String(raw.item_id), nome: String(raw.nome ?? '').trim(), categoria: txt(raw.categoria), um: String(raw.um ?? ''),
    fracionado: Boolean(raw.fracionado), saldo: num(raw.saldo), ponto: num(raw.ponto), preco: num(raw.preco),
    classe: classeOk(raw.classe), recentes: recentesDe(raw.recentes),
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
const extraDoCatalogo = (c: ItemCatalogo, quantidade: number): ItemCompra => ({
  item_id: c.item_id, nome: c.nome, categoria: c.categoria, um: c.um, fracionado: c.fracionado,
  saldo: c.saldo, ponto: c.ponto, situacao: 'extra', sugerida: quantidade, preco: c.preco,
  em_lista: 0, em_lista_onde: null, adiado_ate: null, classe: c.classe, mais_comprado: null, recentes: c.recentes,
});

// ─── Componente ──────────────────────────────────────────────────────────────
export default function Compras() {
  const [tela, setTela] = useState<Tela | null>(null);
  const [linhas, setLinhas] = useState<Record<string, Linha>>({});
  const [extras, setExtras] = useState<ItemCompra[]>([]);
  const [fornCategoria, setFornCategoria] = useState<Record<string, string>>({});
  const [catOutro, setCatOutro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [gerando, setGerando] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string; ids: string[] } | null>(null);
  const [aba, setAba] = useState<Aba>(() => {
    try { const s = localStorage.getItem('compras:aba'); return (s === 'pedidos' || s === 'demanda' || s === 'revisao') ? s : 'rua'; } catch { return 'rua'; }
  });
  const [mostrarNoPonto, setMostrarNoPonto] = useState(false);
  const [busca, setBusca] = useState('');
  const [adicionando, setAdicionando] = useState(false);
  const [adiando, setAdiando] = useState<string | null>(null);
  const [confOcupado, setConfOcupado] = useState<'criar' | 'status' | null>(null);
  const [linkCopiado, setLinkCopiado] = useState(false);
  const [soConferidos, setSoConferidos] = useState(false);

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
      const cf: Record<string, FornCategoria[]> = {};
      for (const [cat, lista] of Object.entries((d.categoria_fornecedores || {}) as Record<string, unknown>)) {
        cf[cat] = (Array.isArray(lista) ? (lista as Record<string, unknown>[]) : []).map(f => ({ fornecedor_id: String(f.fornecedor_id), nome: String(f.nome ?? ''), compras: num(f.compras) }));
      }
      setTela({
        hoje: String(d.hoje ?? ''), itens, catalogo,
        listas: (Array.isArray(d.listas) ? (d.listas as Record<string, unknown>[]) : []).map(normalizarLista),
        fornecedores: (Array.isArray(d.fornecedores) ? (d.fornecedores as Record<string, unknown>[]) : []).map(f => ({
          id: String(f.id), nome: String(f.nome ?? '').trim(), modalidade: (f.modalidade === 'rua' ? 'rua' : 'entrega') as Modalidade, telefone: txt(f.telefone),
        })),
        categoriaFornecedores: cf, conferencia,
        config: { pendentes_classe: num(cfg.pendentes_classe), pendentes_classe_com_ponto: num(cfg.pendentes_classe_com_ponto), pontos_sem_giro: num(cfg.pontos_sem_giro) },
      });
      // Fornecedor do dia por categoria: começa no mais usado; troca à vontade.
      setFornCategoria(prev => {
        const n = { ...prev };
        for (const [cat, lista] of Object.entries(cf)) if (!n[cat] && lista[0]) n[cat] = lista[0].fornecedor_id;
        return n;
      });
      const l: Record<string, Linha> = {};
      for (const it of itens) l[it.item_id] = { quantidade: it.em_lista > 0 ? 0 : it.sugerida, origem: '', outro: false };
      // Conferência do celular: a quantidade anotada manda; item fora do ponto entra como extra.
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
  const fornPorId = useMemo(() => { const m = new Map<string, Fornecedor>(); for (const f of tela?.fornecedores ?? []) m.set(f.id, f); return m; }, [tela]);
  const opcoesFornecedor = useMemo(() => (tela?.fornecedores ?? []).map(f => ({
    value: f.id, label: f.nome, sublabel: f.modalidade === 'rua' ? 'Loja de rua · vai na lista do comprador' : 'Entrega · vira pedido',
  })), [tela]);
  const anotacaoPorItem = useMemo(() => { const m = new Map<string, Anotacao>(); for (const a of tela?.conferencia?.itens ?? []) m.set(a.item_id, a); return m; }, [tela]);
  const temConferidos = anotacaoPorItem.size > 0;

  /** Resolve 'rua' | 'f:<id>' em destino. Loja de rua vira lista da Rua com a loja anotada. */
  const resolver = useCallback((origem: string): { destino: Destino; fornecedorId: string | null; lojaId: string | null; nome: string } | null => {
    if (origem === RUA) return { destino: 'rua', fornecedorId: null, lojaId: null, nome: 'Rua' };
    const id = idDe(origem); if (!id) return null;
    const f = fornPorId.get(id); if (!f) return null;
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
  const todos = useMemo(() => [...doPonto, ...extras], [doPonto, extras]);

  const itensRua = useMemo(() => todos.filter(it => it.classe === 'rua' && bate(it) && situacaoOk(it) && (!soConferidos || !temConferidos || anotacaoPorItem.has(it.item_id))), [todos, bate, situacaoOk, soConferidos, temConferidos, anotacaoPorItem]);
  const itensPedido = useMemo(() => todos.filter(it => it.classe === 'pedido' && bate(it) && situacaoOk(it)), [todos, bate, situacaoOk]);
  const itensDemanda = useMemo(() => extras.filter(it => it.classe !== 'rua' && it.classe !== 'pedido' && bate(it)), [extras, bate]);
  const semClasseNoPonto = useMemo(() => doPonto.filter(it => it.classe === null && it.situacao !== 'atencao').length, [doPonto]);

  const ordenar = (lista: ItemCompra[]) => [...lista].sort((a, b) => (ORDEM[a.situacao] ?? 9) - (ORDEM[b.situacao] ?? 9) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const gruposRua = useMemo(() => agruparPorCategoria(itensRua).map(([cat, lista]) => [cat, ordenar(lista)] as const), [itensRua]);
  const gruposPedido = useMemo(() => agruparPorCategoria(itensPedido).map(([cat, lista]) => [cat, ordenar(lista)] as const), [itensPedido]);

  const totalDe = useCallback((lista: ItemCompra[]) => {
    let itens = 0, valor = 0;
    for (const it of lista) { const q = linhas[it.item_id]?.quantidade ?? 0; if (q > 0) { itens += 1; valor += q * it.preco; } }
    return { itens, valor };
  }, [linhas]);
  const totRua = useMemo(() => totalDe(itensRua), [itensRua, totalDe]);
  const totPedido = useMemo(() => totalDe(itensPedido), [itensPedido, totalDe]);
  const contagemNoPonto = useMemo(() => doPonto.filter(it => it.situacao === 'atencao' && it.classe !== null).length, [doPonto]);

  /** Fornecedor efetivo de uma linha da aba Pedidos: a linha, senão o da categoria. */
  const origemPedido = useCallback((it: ItemCompra) => {
    const st = linhas[it.item_id];
    if (st?.origem) return st.origem;
    const f = fornCategoria[nomeCat(it.categoria)];
    return f ? fId(f) : '';
  }, [linhas, fornCategoria]);

  /** Resumo dos pedidos por fornecedor (para o rodapé). */
  const resumoPedidos = useMemo(() => {
    const m = new Map<string, { nome: string; itens: number; valor: number }>();
    let semForn = 0;
    for (const it of itensPedido) {
      const q = linhas[it.item_id]?.quantidade ?? 0; if (q <= 0) continue;
      const r = resolver(origemPedido(it));
      if (!r) { semForn += 1; continue; }
      const k = r.fornecedorId ?? r.lojaId ?? 'rua';
      const e = m.get(k) ?? { nome: r.nome, itens: 0, valor: 0 };
      e.itens += 1; e.valor += q * it.preco; m.set(k, e);
    }
    return { fornecedores: [...m.values()].sort((a, b) => b.valor - a.valor), semForn };
  }, [itensPedido, linhas, resolver, origemPedido]);

  // ── Edição ──
  const setLinha = (id: string, patch: Partial<Linha>) => setLinhas(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  const adicionarExtra = (itemId: string) => {
    const c = tela?.catalogo.find(x => x.item_id === itemId);
    if (!c || todos.some(x => x.item_id === itemId)) { setAdicionando(false); return; }
    setExtras(prev => [...prev, extraDoCatalogo(c, 0)]);
    setLinhas(prev => ({ ...prev, [c.item_id]: { quantidade: 0, origem: '', outro: false } }));
    setAdicionando(false);
    setAba(c.classe === 'rua' ? 'rua' : c.classe === 'pedido' ? 'pedidos' : 'demanda');
  };
  const removerExtra = (id: string) => { setExtras(prev => prev.filter(x => x.item_id !== id)); setLinhas(prev => { const n = { ...prev }; delete n[id]; return n; }); };
  const opcoesCatalogo = useMemo(() => (tela?.catalogo ?? [])
    .filter(c => !todos.some(x => x.item_id === c.item_id))
    .map(c => ({ value: c.item_id, label: c.nome, sublabel: `${nomeCat(c.categoria)} · ${fmtQtd(c.saldo)} ${c.um} no Central${c.classe ? ` · ${c.classe === 'rua' ? 'Rua' : c.classe === 'pedido' ? 'Pedido' : 'Sob demanda'}` : ''}` })),
  [tela, todos]);

  // ── Adiar ──
  const marcarAdiado = (itemId: string, ate: string | null) => setTela(prev => prev ? { ...prev, itens: prev.itens.map(it => (it.item_id === itemId ? { ...it, adiado_ate: ate } : it)) } : prev);
  const adiar = async (it: ItemCompra) => {
    setAdiando(it.item_id);
    try {
      const { data, error } = await supabase.rpc('fn_compras_adiar', { p_item_id: it.item_id, p_dias: 1 });
      const r = (data || {}) as { success?: boolean; error?: string; adiado_ate?: string };
      if (error || r.success === false) { setErro(error?.message || r.error || 'Não foi possível adiar'); return; }
      marcarAdiado(it.item_id, String(r.adiado_ate ?? tela?.hoje ?? '')); setLinha(it.item_id, { quantidade: 0 });
    } finally { setAdiando(null); }
  };
  const trazerDeVolta = async (it: ItemCompra) => {
    setAdiando(it.item_id);
    try {
      const { error } = await supabase.rpc('fn_compras_adiar_desfazer', { p_item_id: it.item_id });
      if (error) { setErro(error.message); return; }
      marcarAdiado(it.item_id, null); setLinha(it.item_id, { quantidade: it.em_lista > 0 ? 0 : it.sugerida });
    } finally { setAdiando(null); }
  };

  // ── Gerar ──
  type LinhaEnvio = { item_id: string; quantidade: number; destino: Destino; fornecedor_id: string | null; loja_id: string | null; observacao?: string | null };
  const gerar = async (chave: string, linhasEnvio: LinhaEnvio[]) => {
    if (linhasEnvio.length === 0) { setErro('Nenhum item com quantidade.'); return; }
    setGerando(chave); setResultado(null); setErro('');
    try {
      const { data, error } = await supabase.rpc('fn_compras_gerar', { p_linhas: linhasEnvio });
      if (error) { setResultado({ ok: false, texto: error.message, ids: [] }); return; }
      const r = (data || {}) as { linhas?: number; listas?: Record<string, unknown>[] };
      const listas = (r.listas ?? []).map(normalizarLista);
      const partes = listas.map(l => (l.tipo === 'rua' ? `Rua (${plural(l.itens, 'item', 'itens')})` : `${l.fornecedor_nome} (${plural(l.itens, 'item', 'itens')})`));
      setResultado({ ok: true, texto: `${plural(num(r.linhas), 'linha', 'linhas')} em ${plural(listas.length, 'lista', 'listas')}: ${partes.join(' · ')}. Os cards estão logo acima, com o botão de WhatsApp.`, ids: listas.map(l => l.lista_id) });
      await carregar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: unknown) {
      setResultado({ ok: false, texto: e instanceof Error ? e.message : String(e), ids: [] });
    } finally { setGerando(null); }
  };
  const obsConferencia = (it: ItemCompra) => { const a = anotacaoPorItem.get(it.item_id); return a && a.encontrado !== null ? `conferido: tinha ${fmtQtd(a.encontrado)}` : null; };

  const gerarRua = () => gerar('rua', itensRua.filter(it => (linhas[it.item_id]?.quantidade ?? 0) > 0)
    .map(it => ({ item_id: it.item_id, quantidade: linhas[it.item_id].quantidade, destino: 'rua' as Destino, fornecedor_id: null, loja_id: null, observacao: obsConferencia(it) })));

  const gerarPedidos = () => {
    const ativos = itensPedido.filter(it => (linhas[it.item_id]?.quantidade ?? 0) > 0);
    const semForn = ativos.filter(it => !resolver(origemPedido(it)));
    if (semForn.length > 0) { setErro(`Escolha o fornecedor de hoje para: ${[...new Set(semForn.map(it => nomeCat(it.categoria)))].join(', ')}.`); return; }
    gerar('pedidos', ativos.map(it => { const r = resolver(origemPedido(it))!; return { item_id: it.item_id, quantidade: linhas[it.item_id].quantidade, destino: r.destino, fornecedor_id: r.fornecedorId, loja_id: r.lojaId }; }));
  };

  const gerarDemanda = () => {
    const ativos = itensDemanda.filter(it => (linhas[it.item_id]?.quantidade ?? 0) > 0);
    const semOrigem = ativos.filter(it => !resolver(linhas[it.item_id].origem));
    if (semOrigem.length > 0) { setErro(`Escolha Rua ou um fornecedor para: ${semOrigem.map(i => i.nome).join(', ')}.`); return; }
    gerar('demanda', ativos.map(it => { const r = resolver(linhas[it.item_id].origem)!; return { item_id: it.item_id, quantidade: linhas[it.item_id].quantidade, destino: r.destino, fornecedor_id: r.fornecedorId, loja_id: r.lojaId }; }));
  };

  // ── Conferência ──
  const criarConferencia = async () => { setConfOcupado('criar'); setErro(''); try { const { error } = await supabase.rpc('fn_conferencia_criar'); if (error) { setErro(error.message); return; } await carregar(); } finally { setConfOcupado(null); } };
  const statusConferencia = async (status: 'aberta' | 'fechada') => {
    const c = tela?.conferencia; if (!c) return;
    if (status === 'fechada' && !window.confirm('Fechar a conferência de hoje? O celular para de aceitar anotações.')) return;
    setConfOcupado('status'); setErro('');
    try { const { error } = await supabase.rpc('fn_conferencia_status', { p_id: c.id, p_status: status }); if (error) { setErro(error.message); return; } await carregar(); } finally { setConfOcupado(null); }
  };
  const copiarLinkConferencia = async () => {
    const c = tela?.conferencia; if (!c) return;
    try { await navigator.clipboard.writeText(urlConferencia(c.id)); setLinkCopiado(true); setTimeout(() => setLinkCopiado(false), 2500); } catch { window.prompt('Copie o link:', urlConferencia(c.id)); }
  };

  // ── Listas ──
  const listasAbertas = (tela?.listas ?? []).filter(l => l.status !== 'concluida');
  const listasRuaAbertas = listasAbertas.filter(l => l.tipo === 'rua');
  const listasFornAbertas = listasAbertas.filter(l => l.tipo === 'fornecedor');
  const listasConcluidas = (tela?.listas ?? []).filter(l => l.status === 'concluida');

  // ── Sub-render ──
  const selectFornecedor = (valor: string, onChange: (v: string) => void, opcoes: OpcaoForn[], vazio: string, aberto: boolean, setAberto: (v: boolean) => void, destaque?: boolean) => (
    aberto ? (
      <div className="flex items-center gap-1">
        <div className="flex-1 min-w-0"><SearchableSelect theme="dark" options={opcoesFornecedor} value="" placeholder="Buscar fornecedor..." emptyMessage="Nenhum" onChange={v => { if (v) onChange(fId(v)); setAberto(false); }} /></div>
        <button onClick={() => setAberto(false)} className="text-white/30 hover:text-white/60"><X size={12} /></button>
      </div>
    ) : (
      <select value={valor} onChange={e => (e.target.value === OUTRO ? setAberto(true) : onChange(e.target.value))}
        className={`w-full text-xs border rounded-md px-2 py-1.5 bg-[#0c1018] text-white focus:outline-none focus:ring-2 focus:ring-wine/30 ${destaque ? 'border-red-500/60' : 'border-white/10'}`}>
        <option value="">{vazio}</option>
        {opcoes.map(o => <option key={o.id} value={fId(o.id)}>{o.nome}{o.sub ? ` · ${o.sub}` : ''}</option>)}
        <option value={OUTRO}>Outro fornecedor…</option>
      </select>
    )
  );

  const badgeSituacao = (it: ItemCompra) => it.situacao === 'zerado'
    ? <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-300 border border-red-500/30">zerado</span>
    : it.situacao === 'atencao' ? <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-yellow-500/10 text-yellow-200 border border-yellow-500/30">no ponto</span>
    : it.situacao === 'extra' ? <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/10 text-white/60 border border-white/15">incluído</span> : null;

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
            {it.situacao === 'extra'
              ? <button onClick={() => removerExtra(it.item_id)} className="text-white/30 hover:text-white/60" title="Tirar da tela"><X size={12} /></button>
              : <button onClick={() => adiar(it)} disabled={adiando === it.item_id} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium text-white/40 border border-transparent hover:text-amber-300 hover:border-amber-500/40 hover:bg-amber-500/10 disabled:opacity-50" title="Tirar da lista de hoje e jogar para amanhã">
                  {adiando === it.item_id ? <Loader2 size={11} className="animate-spin" /> : <CalendarClock size={11} />} Amanhã
                </button>}
            {it.em_lista > 0 && <span className="text-caption text-orange-300/80">já na lista: {it.em_lista_onde || fmtQtd(it.em_lista)}</span>}
            {a && <span className="text-caption text-teal-300/90 inline-flex items-center gap-1" title={a.obs ? `Obs: ${a.obs}` : 'Anotado na conferência'}><Smartphone size={10} />{a.encontrado !== null ? `tem ${fmtQtd(a.encontrado)}` : ''}{a.encontrado !== null && a.comprar !== null ? ' · ' : ''}{a.comprar !== null ? `pediu ${fmtQtd(a.comprar)}` : ''}</span>}
          </div>
        </td>
        <td className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap ${it.saldo <= 0 ? 'text-red-400 font-semibold' : 'text-white/80'}`} title="saldo no Estoque Central">{fmtQtd(it.saldo)}</td>
        <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-white/50" title="ponto de pedido do cadastro">{it.ponto > 0 ? fmtQtd(it.ponto) : '—'}</td>
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
    <thead><tr className="bg-[#0c1018] text-white/50 text-xs">
      <th className="px-3 py-2 text-left font-medium">Produto</th>
      <th className="px-3 py-2 text-right font-medium w-24">Central</th>
      <th className="px-3 py-2 text-right font-medium w-20">Ponto</th>
      <th className="px-3 py-2 text-right font-medium w-32">Comprar</th>
      {ultima !== undefined && <th className="px-3 py-2 text-left font-medium w-72">{ultima}</th>}
    </tr></thead>
  );

  const barraFiltros = (extraChips?: ReactNode) => (
    <div className="bg-[#12141f] rounded-2xl border border-white/10 px-4 py-2.5 flex items-center gap-2 flex-wrap">
      {extraChips}
      <button onClick={() => setMostrarNoPonto(v => !v)} title="Itens exatamente no ponto (ainda não abaixo)"
        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${mostrarNoPonto ? 'bg-yellow-500/15 text-yellow-200 border-yellow-500/40' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'}`}>
        No ponto ({contagemNoPonto})
      </button>
      <div className="relative w-full sm:w-64">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar item ou categoria..." className="w-full pl-9 pr-8 py-1.5 text-sm border border-white/10 rounded-xl bg-[#0c1018] text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-wine/30" />
        {busca && <button onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"><X size={14} /></button>}
      </div>
      <div className="ml-auto">
        {adicionando ? <div className="w-80"><SearchableSelect theme="dark" options={opcoesCatalogo} value="" onChange={adicionarExtra} placeholder="Buscar item para incluir..." emptyMessage="Nenhum item" /></div>
          : <button onClick={() => setAdicionando(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 text-xs font-medium text-white/70 hover:bg-white/5"><Plus size={14} /> Incluir item</button>}
      </div>
    </div>
  );

  const avisoSemClasse = semClasseNoPonto > 0 && (
    <button onClick={() => setAba('revisao')} className="w-full text-left rounded-xl px-4 py-2.5 text-sm border bg-amber-500/10 border-amber-500/30 text-amber-200 flex items-center gap-2 hover:bg-amber-500/15">
      <AlertTriangle size={15} /> {plural(semClasseNoPonto, 'item abaixo do ponto ainda sem classe', 'itens abaixo do ponto ainda sem classe')} (não aparecem em nenhuma aba). Clique para classificar.
    </button>
  );

  const blocoAdiados = adiados.length > 0 && (
    <div className="bg-[#12141f] rounded-2xl border border-amber-500/30">
      <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm font-semibold text-amber-300 flex items-center gap-2"><CalendarClock size={16} /> Adiados para amanhã <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/15 text-amber-200">{adiados.length}</span></p>
        <p className="text-xs text-white/60">Cortado de hoje: <span className="text-amber-300 font-semibold">{fmtMoeda(valorAdiado)}</span>. Voltam sozinhos amanhã.</p>
      </div>
      <div className="overflow-x-auto rounded-b-2xl"><table className="w-full text-sm"><tbody className="divide-y divide-white/5">
        {[...adiados].sort((a, b) => nomeCat(a.categoria).localeCompare(nomeCat(b.categoria), 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR')).map(it => (
          <tr key={it.item_id} className="hover:bg-white/[0.02]">
            <td className="px-3 py-1.5"><span className="text-white/80">{it.nome}</span><span className="ml-2 text-caption text-white/40">{nomeCat(it.categoria)}</span></td>
            <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-white/60">{fmtQtd(it.saldo)} {it.um}</td>
            <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-white/60">{fmtQtd(it.sugerida)} {it.um} · <span className="text-amber-300">{fmtMoeda(it.sugerida * it.preco)}</span></td>
            <td className="px-3 py-1.5 text-right w-40"><button onClick={() => trazerDeVolta(it)} disabled={adiando === it.item_id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-white/15 text-white/70 hover:bg-white/10 disabled:opacity-50">{adiando === it.item_id ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />} Trazer de volta</button></td>
          </tr>
        ))}
      </tbody></table></div>
    </div>
  );

  const cardConferencia = tela && (
    <div className={`rounded-2xl border px-4 py-3 bg-[#12141f] ${tela.conferencia?.status === 'aberta' ? 'border-teal-500/30' : 'border-white/10'}`}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 bg-teal-500/15"><Smartphone size={17} className="text-teal-300" /></div>
          <div className="min-w-0">
            <p className="text-white font-bold leading-tight text-sm">Conferência no celular{tela.conferencia && <span className={`ml-2 px-1.5 py-0.5 text-[10px] font-semibold rounded-md align-middle ${tela.conferencia.status === 'aberta' ? 'bg-teal-500/15 text-teal-300' : 'bg-white/10 text-white/50'}`}>{tela.conferencia.status}</span>}</p>
            <p className="text-xs text-white/60 mt-0.5">{tela.conferencia ? <>{plural(tela.conferencia.itens.length, 'item anotado', 'itens anotados')} hoje; a quantidade anotada já está preenchida.</> : <>Apoio enquanto os saldos não são confiáveis.</>}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {tela.conferencia ? (
            <>
              <a href={urlConferencia(tela.conferencia.id)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-xs font-medium text-white/70 hover:bg-white/5"><Smartphone size={13} /> Abrir</a>
              <button onClick={copiarLinkConferencia} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-xs font-medium text-white/70 hover:bg-white/5">{linkCopiado ? <Check size={13} className="text-green-400" /> : <Copy size={13} />} {linkCopiado ? 'Copiado' : 'Copiar link'}</button>
              <a href={urlWhatsApp(`📋 Conferência do estoque · ${fmtData(tela.conferencia.data)}\nAbra o link, busque o item pelo nome e anote quanto tem e quanto comprar:\n${urlConferencia(tela.conferencia.id)}`)} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-green-500/30 bg-green-500/10 text-xs font-medium text-green-300 hover:bg-green-500/20"><MessageCircle size={13} /> WhatsApp</a>
              {tela.conferencia.status === 'aberta'
                ? <button onClick={() => statusConferencia('fechada')} disabled={confOcupado !== null} className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-white/10 text-xs text-white/50 hover:bg-white/5 disabled:opacity-50">{confOcupado === 'status' ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />} Fechar</button>
                : <button onClick={() => statusConferencia('aberta')} disabled={confOcupado !== null} className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-white/10 text-xs text-white/50 hover:bg-white/5 disabled:opacity-50">{confOcupado === 'status' ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Reabrir</button>}
            </>
          ) : (
            <button onClick={criarConferencia} disabled={confOcupado !== null} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-teal-500/30 bg-teal-500/10 text-xs font-semibold text-teal-200 hover:bg-teal-500/20 disabled:opacity-50">{confOcupado === 'criar' ? <Loader2 size={13} className="animate-spin" /> : <Smartphone size={13} />} Gerar link de conferência</button>
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

  const pendentesRevisao = (tela?.config.pendentes_classe ?? 0) + (tela?.config.pontos_sem_giro ?? 0);
  const abas: { k: Aba; label: string; icone: ReactNode; badge: string; alerta?: boolean }[] = [
    { k: 'rua', label: 'Rua', icone: <Store size={15} />, badge: `${itensRua.length}${totRua.valor > 0 ? ` · ${fmtMoeda(totRua.valor)}` : ''}` },
    { k: 'pedidos', label: 'Pedidos', icone: <Truck size={15} />, badge: `${itensPedido.length}${totPedido.valor > 0 ? ` · ${fmtMoeda(totPedido.valor)}` : ''}` },
    { k: 'demanda', label: 'Sob demanda', icone: <Plus size={15} />, badge: String(itensDemanda.length) },
    { k: 'revisao', label: 'Revisão', icone: <ClipboardCheck size={15} />, badge: String(pendentesRevisao), alerta: pendentesRevisao > 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="bg-[#12141f] rounded-2xl border border-white/10 px-5 py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-wine rounded-xl flex items-center justify-center flex-shrink-0"><ShoppingBag size={20} className="text-white" /></div>
            <div>
              <h2 className="text-lg font-bold text-white">Compras</h2>
              <p className="text-sm text-white/60">Pelo ponto de pedido do cadastro, no Estoque Central. Rua vai para o comprador; Pedidos viram pedido por fornecedor.</p>
            </div>
          </div>
          <button onClick={carregar} disabled={carregando} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-sm font-medium text-white/60 hover:bg-white/5 disabled:opacity-50"><RefreshCw size={14} className={carregando ? 'animate-spin' : ''} /> Atualizar</button>
        </div>
        <div className="mt-3 flex items-center gap-1.5 flex-wrap">
          {abas.map(a => (
            <button key={a.k} onClick={() => setAba(a.k)} className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-semibold border transition-colors ${aba === a.k ? 'bg-wine text-white border-wine' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'}`}>
              {a.icone} {a.label}
              <span className={`px-1.5 py-0.5 text-[11px] rounded-md ${aba === a.k ? 'bg-white/20' : a.alerta ? 'bg-amber-500/20 text-amber-200' : 'bg-white/10 text-white/60'}`}>{a.badge}</span>
            </button>
          ))}
        </div>
      </div>

      {resultado && (
        <div className={`rounded-xl px-4 py-3 text-sm border flex items-start gap-2 ${resultado.ok ? 'bg-green-500/10 border-green-500/30 text-green-300' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
          {resultado.ok ? <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />}
          <p className="flex-1">{resultado.texto}</p><button onClick={() => setResultado(null)} className="text-white/30 hover:text-white/60"><X size={14} /></button>
        </div>
      )}
      {erro && (
        <div className="rounded-xl p-3 text-sm border bg-red-500/10 border-red-500/30 text-red-400 flex items-center gap-3 flex-wrap"><AlertTriangle size={16} className="flex-shrink-0" /><span className="flex-1">{erro}</span><button onClick={() => setErro('')} className="text-red-300/60"><X size={14} /></button></div>
      )}
      {carregando && !tela && !erro && <div className="text-center py-16 text-white/30"><Loader2 size={24} className="animate-spin mx-auto mb-3" /><p>Conferindo o Central...</p></div>}

      {/* ── RUA ── */}
      {tela && aba === 'rua' && (
        <>
          {listasBloco(listasRuaAbertas, 'Listas da Rua abertas')}
          {cardConferencia}
          {avisoSemClasse}
          {barraFiltros(temConferidos && (
            <button onClick={() => setSoConferidos(v => !v)} className={`px-3 py-1.5 rounded-xl text-xs font-semibold border inline-flex items-center gap-1.5 ${soConferidos ? 'bg-teal-500/20 text-teal-200 border-teal-500/40' : 'bg-white/5 text-white/40 border-white/10 hover:bg-white/10'}`}><Smartphone size={12} /> Só conferidos ({anotacaoPorItem.size})</button>
          ))}
          {itensRua.length === 0 ? (
            <div className="bg-[#12141f] rounded-2xl border border-white/10 text-center py-14 text-white/40"><Package size={32} className="mx-auto mb-3 opacity-40" /><p className="text-white/70 font-medium">Nada da Rua abaixo do ponto{soConferidos && temConferidos ? ' entre os conferidos' : ''}.</p></div>
          ) : (
            <div className="bg-[#12141f] rounded-2xl border border-white/10">
              <div className="overflow-x-auto rounded-t-2xl"><table className="w-full text-sm">{cabecalhoTabela()}
                <tbody className="divide-y divide-white/5">
                  {gruposRua.flatMap(([categoria, lista]) => [
                    <tr key={`cat:${categoria}`} className="bg-white/[0.05]"><td colSpan={4} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/60">{categoria} <span className="normal-case font-normal text-white/30">· {lista.filter(it => (linhas[it.item_id]?.quantidade ?? 0) > 0).length} de {lista.length}</span></td></tr>,
                    ...lista.map(it => linhaItem(it)),
                  ])}
                </tbody></table></div>
              <div className="sticky bottom-0 rounded-b-2xl border-t border-white/10 bg-[#12141f]/95 backdrop-blur px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                <p className="text-xs text-white/60"><span className="text-white font-semibold">{plural(totRua.itens, 'item', 'itens')} · {fmtMoeda(totRua.valor)} estimado</span> · Comprar = o que falta para o ponto. Zero = não compra.</p>
                <button onClick={gerarRua} disabled={totRua.itens === 0 || gerando !== null} className="flex items-center gap-2 bg-wine hover:bg-[#6a1a25] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl">{gerando === 'rua' ? <Loader2 size={14} className="animate-spin" /> : <Store size={14} />} Gerar lista da Rua</button>
              </div>
            </div>
          )}
          {blocoAdiados}
        </>
      )}

      {/* ── PEDIDOS ── */}
      {tela && aba === 'pedidos' && (
        <>
          {listasBloco(listasFornAbertas, 'Pedidos abertos (somem quando a nota entra)')}
          {avisoSemClasse}
          {barraFiltros()}
          {itensPedido.length === 0 ? (
            <div className="bg-[#12141f] rounded-2xl border border-white/10 text-center py-14 text-white/40"><Package size={32} className="mx-auto mb-3 opacity-40" /><p className="text-white/70 font-medium">Nenhum item de pedido abaixo do ponto.</p></div>
          ) : (
            <div className="bg-[#12141f] rounded-2xl border border-white/10">
              <div className="overflow-x-auto rounded-t-2xl"><table className="w-full text-sm">{cabecalhoTabela('Fornecedor de hoje')}
                <tbody className="divide-y divide-white/5">
                  {gruposPedido.flatMap(([categoria, lista]) => {
                    const daCat = fornCategoria[categoria] ?? '';
                    const opcoesCat: OpcaoForn[] = (tela.categoriaFornecedores[categoria] ?? []).map(f => ({ id: f.fornecedor_id, nome: f.nome, sub: `${f.compras}x` }));
                    if (daCat && !opcoesCat.some(o => o.id === daCat) && fornPorId.get(daCat)) opcoesCat.push({ id: daCat, nome: fornPorId.get(daCat)!.nome });
                    const nomeCatForn = daCat ? fornPorId.get(daCat)?.nome : null;
                    return [
                      <tr key={`cat:${categoria}`} className="bg-white/[0.05]">
                        <td colSpan={3} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/60">{categoria} <span className="normal-case font-normal text-white/30">· {lista.filter(it => (linhas[it.item_id]?.quantidade ?? 0) > 0).length} de {lista.length}</span></td>
                        <td className="px-3 py-1 text-right"><span className="text-[10px] text-white/40">para toda a categoria →</span></td>
                        <td className="px-3 py-1">
                          {selectFornecedor(daCat ? fId(daCat) : '', v => setFornCategoria(prev => ({ ...prev, [categoria]: idDe(v) ?? '' })), opcoesCat, 'Escolher fornecedor de hoje…', catOutro === categoria, ab => setCatOutro(ab ? categoria : null), !daCat && lista.some(it => (linhas[it.item_id]?.quantidade ?? 0) > 0 && !linhas[it.item_id]?.origem))}
                        </td>
                      </tr>,
                      ...lista.map(it => {
                        const st = linhas[it.item_id] ?? { quantidade: 0, origem: '', outro: false };
                        const idAtual = idDe(st.origem);
                        const opcoes: OpcaoForn[] = it.recentes.filter(f => f.modalidade === 'entrega').map(f => ({ id: f.fornecedor_id, nome: f.nome, sub: `${f.compras}x${f.ultimo_preco ? ` · ${fmtMoeda(f.ultimo_preco)}` : ''}` }));
                        if (idAtual && !opcoes.some(o => o.id === idAtual) && fornPorId.get(idAtual)) opcoes.push({ id: idAtual, nome: fornPorId.get(idAtual)!.nome });
                        return linhaItem(it, selectFornecedor(st.origem, v => setLinha(it.item_id, { origem: v, outro: false }), opcoes, nomeCatForn ? `= ${nomeCatForn}` : '= o da categoria', st.outro, ab => setLinha(it.item_id, { outro: ab }), st.quantidade > 0 && !resolver(origemPedido(it))));
                      }),
                    ];
                  })}
                </tbody></table></div>
              <p className="px-4 py-2 text-caption text-white/40 border-t border-white/5">O fornecedor da categoria vale para todas as linhas dela; troque numa linha só quando quiser. Cada fornecedor vira um pedido com botão de WhatsApp.</p>
              <div className="sticky bottom-0 rounded-b-2xl border-t border-white/10 bg-[#12141f]/95 backdrop-blur px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
                <div className="text-xs text-white/60 min-w-0">
                  <p><span className="text-white font-semibold">{plural(totPedido.itens, 'item', 'itens')} · {fmtMoeda(totPedido.valor)} estimado</span>{resumoPedidos.fornecedores.length > 0 && <span className="ml-2 inline-flex items-center gap-1 text-blue-300"><Truck size={12} /> {resumoPedidos.fornecedores.map(f => `${f.nome} (${f.itens} · ${fmtMoeda(f.valor)})`).join(', ')}</span>}</p>
                  {resumoPedidos.semForn > 0 && <p className="text-red-300">{plural(resumoPedidos.semForn, 'item sem fornecedor', 'itens sem fornecedor')}: escolha no cabeçalho da categoria.</p>}
                </div>
                <button onClick={gerarPedidos} disabled={totPedido.itens === 0 || resumoPedidos.semForn > 0 || gerando !== null} className="flex items-center gap-2 bg-wine hover:bg-[#6a1a25] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl">
                  {gerando === 'pedidos' ? <Loader2 size={14} className="animate-spin" /> : <Truck size={14} />} Gerar pedidos{resumoPedidos.fornecedores.length > 0 ? ` (${resumoPedidos.fornecedores.length})` : ''}
                </button>
              </div>
            </div>
          )}
          {blocoAdiados}
        </>
      )}

      {/* ── SOB DEMANDA ── */}
      {tela && aba === 'demanda' && (
        <>
          {barraFiltros()}
          <div className="bg-[#12141f] rounded-2xl border border-white/10">
            <div className="px-4 py-3 border-b border-white/10"><p className="text-sm text-white/70">Nada entra aqui sozinho. "Incluir item", escolha Rua ou o fornecedor e gere.</p></div>
            {itensDemanda.length === 0 ? <p className="text-center text-white/40 py-10 text-sm">Nenhum item incluído.</p> : (
              <>
                <div className="overflow-x-auto"><table className="w-full text-sm">{cabecalhoTabela('Origem')}
                  <tbody className="divide-y divide-white/5">
                    {itensDemanda.map(it => {
                      const st = linhas[it.item_id] ?? { quantidade: 0, origem: '', outro: false };
                      const idAtual = idDe(st.origem);
                      const opcoes: OpcaoForn[] = it.recentes.map(f => ({ id: f.fornecedor_id, nome: `${f.modalidade === 'rua' ? '🛒 ' : '🚚 '}${f.nome}`, sub: `${f.compras}x` }));
                      if (idAtual && !opcoes.some(o => o.id === idAtual) && fornPorId.get(idAtual)) opcoes.push({ id: idAtual, nome: fornPorId.get(idAtual)!.nome });
                      return linhaItem(it, (
                        st.outro ? selectFornecedor(st.origem, v => setLinha(it.item_id, { origem: v, outro: false }), opcoes, '—', true, ab => setLinha(it.item_id, { outro: ab })) : (
                          <select value={st.origem} onChange={e => (e.target.value === OUTRO ? setLinha(it.item_id, { outro: true }) : setLinha(it.item_id, { origem: e.target.value }))}
                            className={`w-full text-xs border rounded-md px-2 py-1.5 bg-[#0c1018] text-white focus:outline-none ${st.quantidade > 0 && !resolver(st.origem) ? 'border-red-500/60' : 'border-white/10'}`}>
                            <option value="">—</option><option value={RUA}>🛒 Rua</option>
                            {opcoes.map(o => <option key={o.id} value={fId(o.id)}>{o.nome} · {o.sub}</option>)}
                            <option value={OUTRO}>Outro fornecedor…</option>
                          </select>
                        )
                      ));
                    })}
                  </tbody></table></div>
                <div className="rounded-b-2xl border-t border-white/10 px-5 py-3 flex items-center justify-end">
                  <button onClick={gerarDemanda} disabled={gerando !== null} className="flex items-center gap-2 bg-wine hover:bg-[#6a1a25] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl">{gerando === 'demanda' ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Gerar</button>
                </div>
              </>
            )}
          </div>
        </>
      )}

      {tela && aba === 'revisao' && <ComprasRevisao onMudou={carregar} />}

      {tela && aba !== 'revisao' && listasConcluidas.length > 0 && (
        <details className="group">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-white/50 flex items-center gap-2 px-1 py-1 select-none"><CheckCircle2 size={14} className="text-green-400" /> Listas concluídas · últimos 7 dias ({listasConcluidas.length}) <span className="normal-case font-normal text-white/30 tracking-normal">— ver e imprimir em PDF</span></summary>
          <div className="space-y-2 mt-2">{listasConcluidas.map(l => <CardListaCompra key={l.lista_id} lista={l} onMudou={carregar} />)}</div>
        </details>
      )}
    </div>
  );
}
