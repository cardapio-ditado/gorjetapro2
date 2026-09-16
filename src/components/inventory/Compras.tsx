import { useState, useEffect, useCallback, useMemo } from 'react';
import { ShoppingBag, RefreshCw, Search, X, Loader2, Package, AlertTriangle, CheckCircle2, Plus, Store, Truck, ClipboardList } from 'lucide-react';
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
}

interface Origem { tipo: Destino; fornecedor_id?: string | null }

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
}

const RUA = 'rua';
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
    origem: o && (o.tipo === 'rua' || o.tipo === 'fornecedor')
      ? { tipo: o.tipo as Destino, fornecedor_id: (o.fornecedor_id as string | null) ?? null } : null,
    recentes: (Array.isArray(raw.recentes) ? (raw.recentes as Record<string, unknown>[]) : []).map(r => ({
      fornecedor_id: String(r.fornecedor_id), nome: String(r.nome ?? ''),
      modalidade: (r.modalidade === 'rua' ? 'rua' : 'entrega') as Modalidade, ultimo_preco: numOuNull(r.ultimo_preco),
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
  if (it.origem.tipo === 'rua') return RUA;
  return it.origem.fornecedor_id ? fId(it.origem.fornecedor_id) : '';
}

function linhaInicial(it: ItemCompra): Linha {
  // Já em lista aberta: começa zerado para não duplicar sem querer.
  return { quantidade: it.em_lista > 0 ? 0 : it.sugerida, origem: origemInicial(it) };
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

  // ── Itens visíveis ──
  const todos = useMemo(() => [...(tela?.itens ?? []), ...extras], [tela, extras]);
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
    for (const it of tela?.itens ?? []) if (it.situacao in t) t[it.situacao as keyof typeof t] += 1;
    return t;
  }, [tela]);

  // ── Edição ──
  const setLinha = (id: string, patch: Partial<Linha>) =>
    setLinhas(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const origemDaCategoria = (lista: readonly ItemCompra[], origem: string) =>
    setLinhas(prev => {
      const n = { ...prev };
      for (const it of lista) n[it.item_id] = { ...n[it.item_id], origem };
      return n;
    });

  /** Um clique: linhas com quantidade e sem origem vão para a Rua. */
  const semOrigemParaRua = () =>
    setLinhas(prev => {
      const n = { ...prev };
      for (const it of todos) {
        const st = n[it.item_id];
        if (st && st.quantidade > 0 && !resolver(st.origem)) n[it.item_id] = { ...st, origem: RUA };
      }
      return n;
    });

  const adicionarExtra = (itemId: string) => {
    const c = tela?.catalogo.find(x => x.item_id === itemId);
    if (!c || todos.some(x => x.item_id === itemId)) { setAdicionando(false); return; }
    const it: ItemCompra = {
      item_id: c.item_id, nome: c.nome, categoria: c.categoria, um: c.um, fracionado: c.fracionado,
      saldo: c.saldo, ponto: c.ponto, situacao: 'extra', sugerida: 0, preco: c.preco,
      em_lista: 0, em_lista_onde: null, origem: null, recentes: [],
    };
    setExtras(prev => [...prev, it]);
    setLinhas(prev => ({ ...prev, [it.item_id]: { quantidade: 0, origem: '' } }));
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

  const listasHoje = (tela?.listas ?? []).filter(l => l.data === tela?.hoje);
  const listasAnteriores = (tela?.listas ?? []).filter(l => l.data !== tela?.hoje);

  /** Opções do select de origem: Rua, quem já vendeu o item, e todos os fornecedores. */
  const opcoesOrigem = (it: ItemCompra | null) => (
    <>
      <option value="">—</option>
      <option value={RUA}>🛒 Rua</option>
      {it && it.recentes.length > 0 && (
        <optgroup label="Já comprou de">
          {it.recentes.map(f => (
            <option key={f.fornecedor_id} value={fId(f.fornecedor_id)}>
              {f.modalidade === 'rua' ? '🛒 ' : '🚚 '}{f.nome}{f.ultimo_preco ? ` · ${fmtMoeda(f.ultimo_preco)}` : ''}
            </option>
          ))}
        </optgroup>
      )}
      <optgroup label="Todos os fornecedores">
        {(tela?.fornecedores ?? []).map(f => (
          <option key={f.id} value={fId(f.id)}>{f.modalidade === 'rua' ? '🛒 ' : '🚚 '}{f.nome}</option>
        ))}
      </optgroup>
    </>
  );

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
                Baseado no Estoque Central: o que está abaixo do ponto de pedido. Ajuste a quantidade, escolha Rua ou o fornecedor e gere as listas.
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
                        <select value="" onChange={e => { if (e.target.value) origemDaCategoria(lista, e.target.value); }}
                          className="w-full text-xs border border-white/10 rounded-md px-2 py-1 bg-[#0c1018] text-white/60 focus:outline-none" title="Origem de todos os itens desta categoria">
                          <option value="">Origem de todos…</option>
                          {opcoesOrigem(null)}
                        </select>
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
                              {it.situacao === 'extra' && (
                                <button onClick={() => removerExtra(it.item_id)} className="text-white/30 hover:text-white/60" title="Tirar da tela"><X size={12} /></button>
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
                            <select value={st.origem} onChange={e => setLinha(it.item_id, { origem: e.target.value })}
                              className={`w-full text-xs border rounded-md px-2 py-1.5 bg-[#0c1018] text-white focus:outline-none focus:ring-2 focus:ring-wine/30 ${ativa && !r ? 'border-red-500/60' : 'border-white/10'}`}>
                              {opcoesOrigem(it)}
                            </select>
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
            Comprar = o que falta para chegar ao ponto (ponto 5, tem 3 → 2). Zero = não compra. 🚚 fornecedor entrega (vira pedido) · 🛒 loja de rua (vai na lista do comprador).
          </p>

          {/* Rodapé fixo */}
          <div className="sticky bottom-0 rounded-b-2xl border-t border-white/10 bg-[#12141f]/95 backdrop-blur px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-white/60 min-w-0 space-y-1">
              <p>
                <span className="text-white font-semibold">{plural(resumo.itens, 'item', 'itens')} · {fmtMoeda(resumo.valor)} estimado</span>
                {resumo.rua > 0 && <span className="ml-2 inline-flex items-center gap-1 text-orange-300"><Store size={12} /> Rua ({resumo.rua})</span>}
                {resumo.pedidosTxt && <span className="ml-2 inline-flex items-center gap-1 text-blue-300"><Truck size={12} /> {resumo.pedidosTxt}</span>}
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
