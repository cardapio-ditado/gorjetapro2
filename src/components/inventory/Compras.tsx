import { useState, useEffect, useCallback, useMemo } from 'react';
import { ShoppingBag, RefreshCw, Search, X, Loader2, Package, AlertTriangle, CheckCircle2, Plus, Store, Truck, ClipboardList, CalendarClock, Undo2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SearchableSelect } from '../common/SearchableSelect';
import { fmtQtd, fmtMoeda, type Situacao } from './comprasShared';
import { CardListaCompra, normalizarLista, type ListaResumo } from './CardListaCompra';
import { agruparPorCategoria, SEM_CATEGORIA } from './agruparPorCategoria';

/**
 * Compras — uma planilha.
 *
 * Tudo se baseia no Estoque Central. Abaixou do ponto de pedido do cadastro,
 * a linha aparece: Produto · Central · Comprar · Origem, agrupado por
 * categoria. Comprar já vem sugerido (o que falta para chegar ao ponto);
 * quantidade zero = não compra. Origem é Rua ou o nome do fornecedor. Ao
 * gerar, cada destino vira uma lista própria com link.
 */

// ─── Tipos (espelham fn_compras_tela) ────────────────────────────────────────
type Modalidade = 'entrega' | 'rua';
type Destino = 'rua' | 'fornecedor';

interface FornecedorRecente {
  fornecedor_id: string;
  nome: string;
  modalidade: Modalidade;
  ultimo_preco: number | null;
  /** quantas vezes o item foi comprado ali (180 dias) */
  compras: number;
}

type MotivoOrigem = 'historico' | 'ultima_lista' | 'cadastro';

/** Sugestão de origem do banco: onde mais comprou → última lista → cadastro. */
interface Origem { tipo: Destino; fornecedor_id?: string | null; motivo?: MotivoOrigem | null; compras?: number }

interface ItemCompra {
  item_id: string;
  nome: string;
  categoria: string | null;
  um: string;
  fracionado: boolean;
  saldo: number;
  ponto: number;
  situacao: Situacao | 'extra';
  sugerida: number;
  preco: number;
  em_lista: number;
  em_lista_onde: string | null;
  /** Tirado da lista de hoje: fica escondido até esta data (volta no dia seguinte). */
  adiado_ate: string | null;
  origem: Origem | null;
  recentes: FornecedorRecente[];
}

interface ItemCatalogo {
  item_id: string; nome: string; categoria: string | null; um: string;
  fracionado: boolean; saldo: number; ponto: number; preco: number;
}

interface Fornecedor { id: string; nome: string; modalidade: Modalidade }

interface Tela {
  hoje: string;
  itens: ItemCompra[];
  catalogo: ItemCatalogo[];
  listas: ListaResumo[];
  fornecedores: Fornecedor[];
}

/** Estado editável de cada linha: quantidade (0 = não compra) e origem do select. */
interface Linha {
  quantidade: number;
  /** 'rua' | 'f:<uuid>' | '' (sem origem) */
  origem: string;
  /** "Outro fornecedor…" aberto (busca) */
  outro: boolean;
}

const RUA = 'rua';
const OUTRO = '__outro';
const fId = (id: string) => `f:${id}`;
const idDe = (v: string) => (v.startsWith('f:') ? v.slice(2) : null);

const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const numOuNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

function normalizarItem(raw: Record<string, unknown>): ItemCompra {
  const o = raw.origem && typeof raw.origem === 'object' ? (raw.origem as Record<string, unknown>) : null;
  return {
    item_id: String(raw.item_id),
    nome: String(raw.nome ?? ''),
    categoria: (raw.categoria as string | null) ?? null,
    um: String(raw.um ?? ''),
    fracionado: Boolean(raw.fracionado),
    saldo: num(raw.saldo),
    ponto: num(raw.ponto),
    situacao: ((raw.situacao as Situacao) || 'ok'),
    sugerida: num(raw.sugerida),
    preco: num(raw.preco),
    em_lista: num(raw.em_lista),
    em_lista_onde: (raw.em_lista_onde as string | null) ?? null,
    adiado_ate: raw.adiado_ate ? String(raw.adiado_ate).slice(0, 10) : null,
    origem: o && (o.tipo === 'rua' || o.tipo === 'fornecedor')
      ? {
          tipo: o.tipo as Destino, fornecedor_id: (o.fornecedor_id as string | null) ?? null,
          motivo: (o.motivo === 'historico' || o.motivo === 'ultima_lista' || o.motivo === 'cadastro') ? o.motivo : null,
          compras: num(o.compras),
        }
      : null,
    recentes: (Array.isArray(raw.recentes) ? (raw.recentes as Record<string, unknown>[]) : []).map(r => ({
      fornecedor_id: String(r.fornecedor_id), nome: String(r.nome ?? ''),
      modalidade: (r.modalidade === 'rua' ? 'rua' : 'entrega') as Modalidade, ultimo_preco: numOuNull(r.ultimo_preco),
      compras: num(r.compras),
    })),
  };
}

function normalizarCatalogo(raw: Record<string, unknown>): ItemCatalogo {
  return {
    item_id: String(raw.item_id), nome: String(raw.nome ?? ''), categoria: (raw.categoria as string | null) ?? null,
    um: String(raw.um ?? ''), fracionado: Boolean(raw.fracionado), saldo: num(raw.saldo), ponto: num(raw.ponto), preco: num(raw.preco),
  };
}

function origemInicial(it: ItemCompra): string {
  if (!it.origem) return '';
  // Loja de rua com histórico vem com o id: a linha mostra a loja, e o
  // resolver manda para a lista da Rua com a loja anotada.
  if (it.origem.fornecedor_id) return fId(it.origem.fornecedor_id);
  return it.origem.tipo === 'rua' ? RUA : '';
}

const MOTIVO_LABEL: Record<MotivoOrigem, string> = {
  historico: 'onde mais comprou', ultima_lista: 'última lista', cadastro: 'cadastro',
};

/** Legenda curta do porquê da sugestão ("onde mais comprou · 5x"). */
function motivoSugestao(it: ItemCompra): string {
  const o = it.origem;
  if (!o?.motivo) return '';
  const vezes = o.motivo === 'historico' && o.compras ? ` · ${o.compras}x` : '';
  return `${MOTIVO_LABEL[o.motivo]}${vezes}`;
}

function linhaInicial(it: ItemCompra): Linha {
  // Já em lista aberta: começa zerado para não duplicar sem querer.
  return { quantidade: it.em_lista > 0 ? 0 : it.sugerida, origem: origemInicial(it), outro: false };
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const ORDEM: Record<string, number> = { zerado: 0, comprar: 1, atencao: 2, extra: 3 };
const nomeCat = (c: string | null) => (c ?? '').trim() || SEM_CATEGORIA;
const arredondar = (q: number, fracionado: boolean) => (fracionado ? Number(q.toFixed(2)) : Math.round(q));

// ─── Componente ──────────────────────────────────────────────────────────────
export default function Compras() {
  const [tela, setTela] = useState<Tela | null>(null);
  const [linhas, setLinhas] = useState<Record<string, Linha>>({});
  const [extras, setExtras] = useState<ItemCompra[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [gerando, setGerando] = useState(false);
  const [resultado, setResultado] = useState<{ ok: boolean; texto: string; ids: string[] } | null>(null);
  const [filtroSit, setFiltroSit] = useState<Record<'zerado' | 'comprar' | 'atencao', boolean>>({ zerado: true, comprar: true, atencao: false });
  const [busca, setBusca] = useState('');
  const [filtroCat, setFiltroCat] = useState<string | null>(null);
  const [adicionando, setAdicionando] = useState(false);
  /** categoria com a busca "Outro fornecedor…" aberta no cabeçalho */
  const [catOutro, setCatOutro] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try {
      const { data, error } = await supabase.rpc('fn_compras_tela');
      if (error) { setErro(error.message); return; }
      const d = (data || {}) as Record<string, unknown>;
      const itens = (Array.isArray(d.itens) ? (d.itens as Record<string, unknown>[]) : []).map(normalizarItem);
      setTela({
        hoje: String(d.hoje ?? ''),
        itens,
        catalogo: (Array.isArray(d.catalogo) ? (d.catalogo as Record<string, unknown>[]) : []).map(normalizarCatalogo),
        listas: (Array.isArray(d.listas) ? (d.listas as Record<string, unknown>[]) : []).map(normalizarLista),
        fornecedores: (Array.isArray(d.fornecedores) ? (d.fornecedores as Record<string, unknown>[]) : []).map(f => ({
          id: String(f.id), nome: String(f.nome ?? '').trim(), modalidade: (f.modalidade === 'rua' ? 'rua' : 'entrega') as Modalidade,
        })),
      });
      setExtras([]);
      const l: Record<string, Linha> = {};
      for (const it of itens) l[it.item_id] = linhaInicial(it);
      setLinhas(l);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Fornecedores ──
  const fornPorId = useMemo(() => {
    const m = new Map<string, Fornecedor>();
    for (const f of tela?.fornecedores ?? []) m.set(f.id, f);
    return m;
  }, [tela]);

  const opcoesFornecedor = useMemo(() => (tela?.fornecedores ?? []).map(f => ({
    value: f.id, label: f.nome, sublabel: f.modalidade === 'rua' ? 'Loja de rua · vai na lista do comprador' : 'Entrega · vira pedido',
  })), [tela]);

  /** Resolve o valor do select em destino + fornecedor/loja. */
  const resolver = useCallback((origem: string): { destino: Destino; fornecedorId: string | null; lojaId: string | null; nome: string } | null => {
    if (origem === RUA) return { destino: 'rua', fornecedorId: null, lojaId: null, nome: 'Rua' };
    const id = idDe(origem);
    if (!id) return null;
    const f = fornPorId.get(id);
    if (!f) return null;
    // Loja de rua escolhida como origem: vai para a lista da Rua, com a loja anotada.
    if (f.modalidade === 'rua') return { destino: 'rua', fornecedorId: null, lojaId: f.id, nome: f.nome };
    return { destino: 'fornecedor', fornecedorId: f.id, lojaId: null, nome: f.nome };
  }, [fornPorId]);

  // ── Adiados: fora da lista de hoje, voltam sozinhos amanhã ──
  const adiados = useMemo(() => (tela?.itens ?? []).filter(it => it.adiado_ate), [tela]);
  const valorAdiado = useMemo(() => adiados.reduce((s, it) => s + it.sugerida * it.preco, 0), [adiados]);
  const [adiando, setAdiando] = useState<string | null>(null);

  const marcarAdiado = (itemId: string, ate: string | null) =>
    setTela(prev => prev ? { ...prev, itens: prev.itens.map(it => (it.item_id === itemId ? { ...it, adiado_ate: ate } : it)) } : prev);

  /** Tira da lista de hoje; o item volta sozinho no dia seguinte. */
  const adiar = async (it: ItemCompra) => {
    setAdiando(it.item_id);
    try {
      const { data, error } = await supabase.rpc('fn_compras_adiar', { p_item_id: it.item_id, p_dias: 1 });
      const r = (data || {}) as { success?: boolean; error?: string; adiado_ate?: string };
      if (error || r.success === false) { setErro(error?.message || r.error || 'Não foi possível adiar'); return; }
      marcarAdiado(it.item_id, String(r.adiado_ate ?? tela?.hoje ?? ''));
      setLinha(it.item_id, { quantidade: 0 });
    } finally {
      setAdiando(null);
    }
  };

  const trazerDeVolta = async (it: ItemCompra) => {
    setAdiando(it.item_id);
    try {
      const { error } = await supabase.rpc('fn_compras_adiar_desfazer', { p_item_id: it.item_id });
      if (error) { setErro(error.message); return; }
      marcarAdiado(it.item_id, null);
      setLinha(it.item_id, { quantidade: it.em_lista > 0 ? 0 : it.sugerida });
    } finally {
      setAdiando(null);
    }
  };

  // ── Itens visíveis ──
  const todos = useMemo(() => [...(tela?.itens ?? []).filter(it => !it.adiado_ate), ...extras], [tela, extras]);
  const buscaLower = busca.trim().toLowerCase();

  const visiveisBase = useMemo(() => todos.filter(it => {
    if (it.situacao !== 'extra' && (it.situacao === 'ok' || !filtroSit[it.situacao])) return false;
    if (buscaLower && !it.nome.toLowerCase().includes(buscaLower) && !(it.categoria || '').toLowerCase().includes(buscaLower)) return false;
    return true;
  }), [todos, filtroSit, buscaLower]);

  const categorias = useMemo(() =>
    agruparPorCategoria(visiveisBase).map(([nome, lista]) => ({ nome, total: lista.length })),
  [visiveisBase]);

  const catAtiva = filtroCat && categorias.some(c => c.nome === filtroCat) ? filtroCat : null;
  const visiveis = useMemo(() => (catAtiva ? visiveisBase.filter(it => nomeCat(it.categoria) === catAtiva) : visiveisBase), [visiveisBase, catAtiva]);

  const grupos = useMemo(() =>
    agruparPorCategoria(visiveis).map(([cat, lista]) =>
      [cat, [...lista].sort((a, b) => (ORDEM[a.situacao] ?? 9) - (ORDEM[b.situacao] ?? 9) || a.nome.localeCompare(b.nome, 'pt-BR'))] as const),
  [visiveis]);

  const totais = useMemo(() => {
    const t = { zerado: 0, comprar: 0, atencao: 0 };
    for (const it of tela?.itens ?? []) if (!it.adiado_ate && it.situacao in t) t[it.situacao as keyof typeof t] += 1;
    return t;
  }, [tela]);

  // ── Edição ──
  const setLinha = (id: string, patch: Partial<Linha>) =>
    setLinhas(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const origemDaCategoria = (lista: readonly ItemCompra[], origem: string) =>
    setLinhas(prev => {
      const n = { ...prev };
      for (const it of lista) n[it.item_id] = { ...n[it.item_id], origem, outro: false };
      return n;
    });

  /** Um clique: linhas com quantidade e sem origem vão para a Rua. */
  const semOrigemParaRua = () =>
    setLinhas(prev => {
      const n = { ...prev };
      for (const it of todos) {
        const st = n[it.item_id];
        if (st && st.quantidade > 0 && !resolver(st.origem)) n[it.item_id] = { ...st, origem: RUA, outro: false };
      }
      return n;
    });

  const adicionarExtra = (itemId: string) => {
    const c = tela?.catalogo.find(x => x.item_id === itemId);
    if (!c || todos.some(x => x.item_id === itemId)) { setAdicionando(false); return; }
    const it: ItemCompra = {
      item_id: c.item_id, nome: c.nome, categoria: c.categoria, um: c.um, fracionado: c.fracionado,
      saldo: c.saldo, ponto: c.ponto, situacao: 'extra', sugerida: 0, preco: c.preco,
      em_lista: 0, em_lista_onde: null, adiado_ate: null, origem: null, recentes: [],
    };
    setExtras(prev => [...prev, it]);
    setLinhas(prev => ({ ...prev, [it.item_id]: { quantidade: 0, origem: '', outro: false } }));
    setAdicionando(false);
  };

  const removerExtra = (id: string) => {
    setExtras(prev => prev.filter(x => x.item_id !== id));
    setLinhas(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  // ── Resumo: linhas com quantidade > 0 ──
  const ativas = useMemo(() => todos
    .map(it => ({ it, st: linhas[it.item_id] }))
    .filter(({ st }) => st && st.quantidade > 0),
  [todos, linhas]);

  const resumo = useMemo(() => {
    let valor = 0, rua = 0, semOrigem = 0;
    const pedidos = new Map<string, number>();
    for (const { it, st } of ativas) {
      valor += st.quantidade * it.preco;
      const r = resolver(st.origem);
      if (!r) { semOrigem += 1; continue; }
      if (r.destino === 'rua') rua += 1;
      else pedidos.set(r.nome, (pedidos.get(r.nome) ?? 0) + 1);
    }
    const pedidosTxt = [...pedidos.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).map(([n, c]) => `${n} (${c})`).join(', ');
    return { itens: ativas.length, valor, rua, pedidosTxt, semOrigem };
  }, [ativas, resolver]);

  const podeGerar = ativas.length > 0 && resumo.semOrigem === 0 && !gerando;

  // ── Gerar ──
  const gerar = async () => {
    if (!podeGerar) return;
    setGerando(true); setResultado(null);
    try {
      const linhasEnvio = ativas.map(({ it, st }) => {
        const r = resolver(st.origem)!;
        return { item_id: it.item_id, quantidade: st.quantidade, destino: r.destino, fornecedor_id: r.fornecedorId, loja_id: r.lojaId };
      });
      const { data, error } = await supabase.rpc('fn_compras_gerar', { p_linhas: linhasEnvio });
      if (error) { setResultado({ ok: false, texto: error.message, ids: [] }); return; }
      const r = (data || {}) as { linhas?: number; listas?: Record<string, unknown>[] };
      const listas = (r.listas ?? []).map(normalizarLista);
      const partes = listas.map(l => (l.tipo === 'rua' ? `Rua (${plural(l.itens, 'item', 'itens')})` : `${l.fornecedor_nome} (${plural(l.itens, 'item', 'itens')})`));
      setResultado({
        ok: true,
        texto: `${plural(num(r.linhas), 'linha', 'linhas')} em ${plural(listas.length, 'lista', 'listas')}: ${partes.join(' · ')}. Os links estão logo acima.`,
        ids: listas.map(l => l.lista_id),
      });
      await carregar();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e: unknown) {
      setResultado({ ok: false, texto: e instanceof Error ? e.message : String(e), ids: [] });
    } finally {
      setGerando(false);
    }
  };

  const toggleSit = (s: 'zerado' | 'comprar' | 'atencao') => setFiltroSit(prev => ({ ...prev, [s]: !prev[s] }));
  const chips: { s: 'zerado' | 'comprar' | 'atencao'; label: string; ativo: string }[] = [
    { s: 'zerado', label: `Zerado (${totais.zerado})`, ativo: 'bg-red-500/20 text-red-300 border-red-500/40' },
    { s: 'comprar', label: `Abaixo do ponto (${totais.comprar})`, ativo: 'bg-amber-500/20 text-amber-300 border-amber-500/40' },
    { s: 'atencao', label: `No ponto (${totais.atencao})`, ativo: 'bg-yellow-500/15 text-yellow-200 border-yellow-500/40' },
  ];

  const opcoesCatalogo = useMemo(() => (tela?.catalogo ?? [])
    .filter(c => !todos.some(x => x.item_id === c.item_id))
    .map(c => ({ value: c.item_id, label: c.nome, sublabel: `${nomeCat(c.categoria)} · ${fmtQtd(c.saldo)} ${c.um} no Central` })),
  [tela, todos]);

  const listasAbertas = (tela?.listas ?? []).filter(l => l.status !== 'concluida');
  const listasHoje = listasAbertas.filter(l => l.data === tela?.hoje);
  const listasAnteriores = listasAbertas.filter(l => l.data !== tela?.hoje);
  // Concluídas dos últimos 7 dias: ficam à mão para imprimir em PDF.
  const listasConcluidas = (tela?.listas ?? []).filter(l => l.status === 'concluida');

  /**
   * Opções do select de origem: Rua, quem já vendeu o item, a origem atual (se
   * veio de fora dessa lista) e "Outro fornecedor…", que abre a busca. A lista
   * completa de fornecedores NÃO entra aqui: são 550 nomes, e repetir isso em
   * 300 linhas travava o navegador.
   */
  const opcoesOrigem = (it: ItemCompra | null, origemAtual: string) => {
    const idAtual = idDe(origemAtual);
    const foraDosRecentes = idAtual && !(it?.recentes ?? []).some(f => f.fornecedor_id === idAtual) ? fornPorId.get(idAtual) : null;
    return (
      <>
        <option value="">—</option>
        <option value={RUA}>🛒 Rua</option>
        {it && it.recentes.length > 0 && (
          <optgroup label="Já comprou de">
            {it.recentes.map(f => (
              <option key={f.fornecedor_id} value={fId(f.fornecedor_id)}>
                {f.modalidade === 'rua' ? '🛒 ' : '🚚 '}{f.nome}{f.compras > 0 ? ` · ${f.compras}x` : ''}{f.ultimo_preco ? ` · ${fmtMoeda(f.ultimo_preco)}` : ''}
              </option>
            ))}
          </optgroup>
        )}
        {foraDosRecentes && (
          <option value={fId(foraDosRecentes.id)}>{foraDosRecentes.modalidade === 'rua' ? '🛒 ' : '🚚 '}{foraDosRecentes.nome}</option>
        )}
        <option value={OUTRO}>Outro fornecedor…</option>
      </>
    );
  };

  // ── Render ──
  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="bg-[#12141f] rounded-2xl border border-white/10 px-5 py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-wine rounded-xl flex items-center justify-center flex-shrink-0">
              <ShoppingBag size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Compras</h2>
              <p className="text-sm text-white/60">
                Baseado no Estoque Central: o que está abaixo do ponto de pedido. A origem já vem sugerida por onde o item é mais comprado; ajuste a quantidade, troque a origem se mudou algo e gere as listas.
              </p>
            </div>
          </div>
          <button onClick={carregar} disabled={carregando}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-sm font-medium text-white/60 hover:bg-white/5 disabled:opacity-50">
            <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
      </div>

      {/* Listas abertas */}
      {(listasHoje.length > 0 || listasAnteriores.length > 0) && (
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/50 flex items-center gap-2 px-1">
            <ClipboardList size={14} /> Listas abertas
          </p>
          {listasHoje.map(l => <CardListaCompra key={l.lista_id} lista={l} onMudou={carregar} destaque={resultado?.ids.includes(l.lista_id)} />)}
          {listasAnteriores.length > 0 && (
            <details className="group">
              <summary className="cursor-pointer text-xs text-white/50 px-1 py-1 select-none">
                {plural(listasAnteriores.length, 'lista de dias anteriores ainda aberta', 'listas de dias anteriores ainda abertas')} — conclua ou cancele para não travar sugestão
              </summary>
              <div className="space-y-2 mt-2">
                {listasAnteriores.map(l => <CardListaCompra key={l.lista_id} lista={l} onMudou={carregar} />)}
              </div>
            </details>
          )}
        </div>
      )}

      {/* Concluídas: imprimir em PDF */}
      {listasConcluidas.length > 0 && (
        <details className="group" open={listasHoje.length === 0 && listasAnteriores.length === 0}>
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-white/50 flex items-center gap-2 px-1 py-1 select-none">
            <CheckCircle2 size={14} className="text-green-400" /> Listas concluídas · últimos 7 dias ({listasConcluidas.length})
            <span className="normal-case font-normal text-white/30 tracking-normal">— clique para ver e imprimir em PDF</span>
          </summary>
          <div className="space-y-2 mt-2">
            {listasConcluidas.map(l => <CardListaCompra key={l.lista_id} lista={l} onMudou={carregar} />)}
          </div>
        </details>
      )}

      {resultado && (
        <div className={`rounded-xl px-4 py-3 text-sm border flex items-start gap-2 ${resultado.ok ? 'bg-green-500/10 border-green-500/30 text-green-300' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
          {resultado.ok ? <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />}
          <p className="flex-1">{resultado.texto}</p>
          <button onClick={() => setResultado(null)} className="text-white/30 hover:text-white/60"><X size={14} /></button>
        </div>
      )}

      {erro && (
        <div className="rounded-xl p-3 text-sm border bg-red-500/10 border-red-500/30 text-red-400 flex items-center gap-3 flex-wrap">
          <AlertTriangle size={16} className="flex-shrink-0" />
          <span className="flex-1">{erro}</span>
          <button onClick={carregar} className="text-xs font-semibold underline underline-offset-2 hover:opacity-80">Tentar de novo</button>
        </div>
      )}

      {/* Filtros */}
      {tela && (
        <div className="bg-[#12141f] rounded-2xl border border-white/10 px-5 py-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
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
            <div className="ml-auto flex items-center gap-2">
              {adicionando ? (
                <div className="w-72">
                  <SearchableSelect theme="dark" options={opcoesCatalogo} value="" onChange={adicionarExtra}
                    placeholder="Buscar item para incluir..." emptyMessage="Nenhum item" />
                </div>
              ) : (
                <button onClick={() => setAdicionando(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-white/10 text-xs font-medium text-white/70 hover:bg-white/5">
                  <Plus size={14} /> Incluir item
                </button>
              )}
            </div>
          </div>

          {categorias.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-caption text-white/40 mr-1">Categoria:</span>
              <button onClick={() => setFiltroCat(null)}
                className={`px-2.5 py-1 rounded-lg text-caption font-medium border transition-colors ${catAtiva === null ? 'bg-white/15 text-white border-white/30' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}>
                Todas <span className="opacity-60">({visiveisBase.length})</span>
              </button>
              {categorias.map(c => (
                <button key={c.nome} onClick={() => setFiltroCat(prev => (prev === c.nome ? null : c.nome))}
                  className={`px-2.5 py-1 rounded-lg text-caption font-medium border transition-colors ${catAtiva === c.nome ? 'bg-white/15 text-white border-white/30' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}>
                  {c.nome} <span className="opacity-60">({c.total})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {carregando && !tela && !erro && (
        <div className="text-center py-16 text-white/30">
          <Loader2 size={24} className="animate-spin mx-auto mb-3" />
          <p>Conferindo o Central...</p>
        </div>
      )}

      {tela && !carregando && visiveis.length === 0 && (
        <div className="bg-[#12141f] rounded-2xl border border-white/10 text-center py-14 text-white/40">
          <Package size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-white/70 font-medium">Nada abaixo do ponto com esses filtros.</p>
          {adiados.length > 0 && <p className="text-xs mt-1">{plural(adiados.length, 'item adiado', 'itens adiados')} para amanhã, logo abaixo.</p>}
        </div>
      )}

      {/* Adiados para amanhã: fora da lista de hoje, com o valor cortado */}
      {tela && adiados.length > 0 && (
        <div className="bg-[#12141f] rounded-2xl border border-amber-500/30">
          <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm font-semibold text-amber-300 flex items-center gap-2">
              <CalendarClock size={16} /> Adiados para amanhã
              <span className="px-2 py-0.5 text-xs rounded-full bg-amber-500/15 text-amber-200">{adiados.length}</span>
            </p>
            <p className="text-xs text-white/60">
              Cortado da compra de hoje: <span className="text-amber-300 font-semibold">{fmtMoeda(valorAdiado)}</span>. Voltam sozinhos na lista de amanhã.
            </p>
          </div>
          <div className="overflow-x-auto rounded-b-2xl">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-white/5">
                {[...adiados].sort((a, b) => nomeCat(a.categoria).localeCompare(nomeCat(b.categoria), 'pt-BR') || a.nome.localeCompare(b.nome, 'pt-BR')).map(it => (
                  <tr key={it.item_id} className="hover:bg-white/[0.02]">
                    <td className="px-3 py-1.5">
                      <span className="text-white/80">{it.nome.trim()}</span>
                      <span className="ml-2 text-caption text-white/40">{nomeCat(it.categoria)}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-white/60" title="no Central">
                      {fmtQtd(it.saldo)} {it.um}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums whitespace-nowrap text-white/60" title="sugestão de compra × preço médio">
                      {fmtQtd(it.sugerida)} {it.um} · <span className="text-amber-300">{fmtMoeda(it.sugerida * it.preco)}</span>
                    </td>
                    <td className="px-3 py-1.5 text-right w-40">
                      <button onClick={() => trazerDeVolta(it)} disabled={adiando === it.item_id}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium border border-white/15 text-white/70 hover:bg-white/10 disabled:opacity-50">
                        {adiando === it.item_id ? <Loader2 size={12} className="animate-spin" /> : <Undo2 size={12} />} Trazer de volta
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Planilha */}
      {tela && visiveis.length > 0 && (
        <div className="bg-[#12141f] rounded-2xl border border-white/10">
          <div className="overflow-x-auto rounded-t-2xl">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#0c1018] text-white/50 text-xs">
                  <th className="px-3 py-2 text-left font-medium">Produto</th>
                  <th className="px-3 py-2 text-right font-medium w-28">Central</th>
                  <th className="px-3 py-2 text-right font-medium w-32">Comprar</th>
                  <th className="px-3 py-2 text-left font-medium w-72">Origem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {grupos.flatMap(([categoria, lista]) => {
                  const ativasCat = lista.filter(it => (linhas[it.item_id]?.quantidade ?? 0) > 0).length;
                  return [
                    <tr key={`cat:${categoria}`} className="bg-white/[0.05]">
                      <td colSpan={3} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/60">
                        {categoria} <span className="normal-case font-normal text-white/30">· {ativasCat} de {lista.length}</span>
                      </td>
                      <td className="px-3 py-1">
                        {catOutro === categoria ? (
                          <div className="flex items-center gap-1">
                            <div className="flex-1 min-w-0">
                              <SearchableSelect theme="dark" options={opcoesFornecedor} value="" placeholder="Fornecedor para toda a categoria..." emptyMessage="Nenhum"
                                onChange={v => { if (v) origemDaCategoria(lista, fId(v)); setCatOutro(null); }} />
                            </div>
                            <button onClick={() => setCatOutro(null)} className="text-white/30 hover:text-white/60"><X size={12} /></button>
                          </div>
                        ) : (
                          <select value="" onChange={e => { if (e.target.value === OUTRO) setCatOutro(categoria); else if (e.target.value) origemDaCategoria(lista, e.target.value); }}
                            className="w-full text-xs border border-white/10 rounded-md px-2 py-1 bg-[#0c1018] text-white/60 focus:outline-none" title="Origem de todos os itens desta categoria">
                            <option value="">Origem de todos…</option>
                            <option value={RUA}>🛒 Rua</option>
                            <option value={OUTRO}>Fornecedor…</option>
                          </select>
                        )}
                      </td>
                    </tr>,
                    ...lista.map(it => {
                      const st = linhas[it.item_id] ?? linhaInicial(it);
                      const r = resolver(st.origem);
                      const ativa = st.quantidade > 0;
                      return (
                        <tr key={it.item_id} className={`hover:bg-white/[0.02] ${ativa ? '' : 'opacity-50'}`}>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-white/90">{it.nome.trim()}</span>
                              <span className="text-caption text-white/40">{it.um}</span>
                              {it.situacao === 'extra' ? (
                                <button onClick={() => removerExtra(it.item_id)} className="text-white/30 hover:text-white/60" title="Tirar da tela"><X size={12} /></button>
                              ) : (
                                <button onClick={() => adiar(it)} disabled={adiando === it.item_id}
                                  className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium text-white/40 border border-transparent hover:text-amber-300 hover:border-amber-500/40 hover:bg-amber-500/10 disabled:opacity-50"
                                  title="Tirar da lista de hoje e jogar para amanhã (corte de custo)">
                                  {adiando === it.item_id ? <Loader2 size={11} className="animate-spin" /> : <CalendarClock size={11} />} Amanhã
                                </button>
                              )}
                              {it.em_lista > 0 && (
                                <span className="text-caption text-orange-300/80">já na lista: {it.em_lista_onde || fmtQtd(it.em_lista)}</span>
                              )}
                            </div>
                          </td>
                          <td className={`px-3 py-1.5 text-right tabular-nums whitespace-nowrap ${it.saldo <= 0 ? 'text-red-400 font-semibold' : 'text-white/80'}`}
                            title={it.ponto > 0 ? `ponto de pedido: ${fmtQtd(it.ponto)}` : 'sem ponto de pedido'}>
                            {fmtQtd(it.saldo)}
                          </td>
                          <td className="px-3 py-1 text-right">
                            <input type="number" min={0} step={it.fracionado ? 0.01 : 1} value={st.quantidade}
                              onChange={e => {
                                const v = parseFloat(e.target.value);
                                setLinha(it.item_id, { quantidade: arredondar(Number.isFinite(v) ? Math.max(0, v) : 0, it.fracionado) });
                              }}
                              onFocus={e => e.target.select()}
                              className="w-24 text-right text-sm font-bold border border-white/10 rounded-md px-2 py-1 bg-[#0c1018] text-white focus:outline-none focus:ring-2 focus:ring-wine/30" />
                          </td>
                          <td className="px-3 py-1">
                            <select value={st.outro ? OUTRO : st.origem}
                              onChange={e => (e.target.value === OUTRO
                                ? setLinha(it.item_id, { outro: true, origem: '' })
                                : setLinha(it.item_id, { origem: e.target.value, outro: false }))}
                              className={`w-full text-xs border rounded-md px-2 py-1.5 bg-[#0c1018] text-white focus:outline-none focus:ring-2 focus:ring-wine/30 ${ativa && !r ? 'border-red-500/60' : 'border-white/10'}`}>
                              {opcoesOrigem(it, st.origem)}
                            </select>
                            {st.outro && (
                              <SearchableSelect theme="dark" className="mt-1" options={opcoesFornecedor} value="" placeholder="Buscar fornecedor..." emptyMessage="Nenhum"
                                onChange={v => setLinha(it.item_id, { origem: v ? fId(v) : '', outro: false })} />
                            )}
                            {/* Por que o sistema sugeriu essa origem; se mudou, avisa e deixa voltar */}
                            {it.origem?.motivo && !st.outro && (
                              st.origem === origemInicial(it) ? (
                                <p className="text-[10px] text-white/35 mt-0.5 leading-tight">sugerido: {motivoSugestao(it)}</p>
                              ) : (
                                <p className="text-[10px] text-amber-300/80 mt-0.5 leading-tight">
                                  alterado ·{' '}
                                  <button type="button" onClick={() => setLinha(it.item_id, { origem: origemInicial(it), outro: false })}
                                    className="underline underline-offset-2 hover:text-amber-200">
                                    voltar para {resolver(origemInicial(it))?.nome ?? 'sugestão'}
                                  </button>
                                </p>
                              )
                            )}
                          </td>
                        </tr>
                      );
                    }),
                  ];
                })}
              </tbody>
            </table>
          </div>

          <p className="px-4 py-2 text-caption text-white/40 border-t border-white/5">
            Comprar = o que falta para chegar ao ponto (ponto 5, tem 3 → 2). Zero = não compra. "Amanhã" tira o item da lista de hoje para cortar custo; ele volta sozinho no dia seguinte. 🚚 fornecedor entrega (vira pedido) · 🛒 loja de rua (vai na lista do comprador).
          </p>

          {/* Rodapé fixo */}
          <div className="sticky bottom-0 rounded-b-2xl border-t border-white/10 bg-[#12141f]/95 backdrop-blur px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-white/60 min-w-0 space-y-1">
              <p>
                <span className="text-white font-semibold">{plural(resumo.itens, 'item', 'itens')} · {fmtMoeda(resumo.valor)} estimado</span>
                {resumo.rua > 0 && <span className="ml-2 inline-flex items-center gap-1 text-orange-300"><Store size={12} /> Rua ({resumo.rua})</span>}
                {resumo.pedidosTxt && <span className="ml-2 inline-flex items-center gap-1 text-blue-300"><Truck size={12} /> {resumo.pedidosTxt}</span>}
                {adiados.length > 0 && <span className="ml-2 inline-flex items-center gap-1 text-amber-300"><CalendarClock size={12} /> {adiados.length} p/ amanhã ({fmtMoeda(valorAdiado)} cortado)</span>}
              </p>
              {resumo.semOrigem > 0 && (
                <p className="text-red-300 flex items-center gap-2 flex-wrap">
                  <span>{plural(resumo.semOrigem, 'item sem origem', 'itens sem origem')}</span>
                  <button onClick={semOrigemParaRua} className="px-2 py-0.5 rounded-md border border-orange-500/40 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20">
                    mandar para a Rua
                  </button>
                </p>
              )}
            </div>
            <button onClick={gerar} disabled={!podeGerar}
              className="flex items-center gap-2 bg-wine hover:bg-[#6a1a25] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
              {gerando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
              {gerando ? 'Gerando...' : 'Gerar listas'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
