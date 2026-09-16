import { useState, useEffect, useCallback, useMemo } from 'react';
import { ShoppingBag, RefreshCw, Search, X, Loader2, Package, AlertTriangle, CheckCircle2, Plus, Store, Truck, ClipboardList } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SearchableSelect } from '../common/SearchableSelect';
import { fmtQtd, fmtMoeda, fmtData, BadgeSituacao, type Situacao } from './comprasShared';
import { CardListaCompra, normalizarLista, type ListaResumo } from './CardListaCompra';
import { agruparPorCategoria, SEM_CATEGORIA } from './agruparPorCategoria';

/**
 * Compras
 *
 * Regra única: abaixou do ponto de pedido do cadastro, aparece aqui. O gestor
 * escolhe a origem linha a linha (Rua ou um fornecedor) e confirma. Cada
 * destino vira uma lista própria com link: a da Rua vai para o comprador, a
 * de cada fornecedor vira o pedido. O valor estimado usa a média dos últimos
 * preços pagos.
 */

// ─── Tipos (espelham fn_compras_tela) ────────────────────────────────────────
type Modalidade = 'entrega' | 'rua';
type Destino = 'rua' | 'fornecedor';

interface FornecedorRecente {
  fornecedor_id: string;
  nome: string;
  modalidade: Modalidade;
  telefone: string | null;
  ultima: string | null;
  ultimo_preco: number | null;
  compras: number;
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
  consumo_dia: number;
  preco: number;
  preco_origem: 'compras' | 'custo_medio' | null;
  em_lista: number;
  em_lista_onde: string | null;
  origem: Origem | null;
  recentes: FornecedorRecente[];
}

interface ItemCatalogo {
  item_id: string; nome: string; categoria: string | null; um: string;
  fracionado: boolean; saldo: number; ponto: number; preco: number;
}

interface Fornecedor { id: string; nome: string; modalidade: Modalidade; telefone: string | null }

interface Tela {
  hoje: string;
  itens: ItemCompra[];
  catalogo: ItemCatalogo[];
  listas: ListaResumo[];
  fornecedores: Fornecedor[];
}

/** Estado editável de cada linha. `origem` guarda o valor do select. */
interface Linha {
  marcado: boolean;
  quantidade: number;
  /** 'rua' | 'f:<uuid>' | '' (sem origem) */
  origem: string;
  /** picker de "Outro fornecedor…" aberto */
  outro: boolean;
}

const OUTRO = '__outro';
const RUA = 'rua';
const fId = (id: string) => `f:${id}`;
const idDe = (v: string) => (v.startsWith('f:') ? v.slice(2) : null);

const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const numOuNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

function normalizarRecente(raw: Record<string, unknown>): FornecedorRecente {
  return {
    fornecedor_id: String(raw.fornecedor_id),
    nome: String(raw.nome ?? ''),
    modalidade: raw.modalidade === 'rua' ? 'rua' : 'entrega',
    telefone: (raw.telefone as string | null) ?? null,
    ultima: (raw.ultima as string | null) ?? null,
    ultimo_preco: numOuNull(raw.ultimo_preco),
    compras: num(raw.compras),
  };
}

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
    consumo_dia: num(raw.consumo_dia),
    preco: num(raw.preco),
    preco_origem: raw.preco_origem === 'compras' ? 'compras' : raw.preco_origem === 'custo_medio' ? 'custo_medio' : null,
    em_lista: num(raw.em_lista),
    em_lista_onde: (raw.em_lista_onde as string | null) ?? null,
    origem: o && (o.tipo === 'rua' || o.tipo === 'fornecedor')
      ? { tipo: o.tipo as Destino, fornecedor_id: (o.fornecedor_id as string | null) ?? null } : null,
    recentes: (Array.isArray(raw.recentes) ? (raw.recentes as Record<string, unknown>[]) : []).map(normalizarRecente),
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
  const origem = origemInicial(it);
  return {
    // Já em lista aberta: fica desmarcado para não duplicar sem querer.
    marcado: (it.situacao === 'zerado' || it.situacao === 'comprar') && it.em_lista <= 0,
    quantidade: it.sugerida,
    origem,
    outro: false,
  };
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
  const [origemMassa, setOrigemMassa] = useState('');
  const [origemMassaOutro, setOrigemMassaOutro] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try {
      const { data, error } = await supabase.rpc('fn_compras_tela');
      if (error) { setErro(error.message); return; }
      const d = (data || {}) as Record<string, unknown>;
      const itens = (Array.isArray(d.itens) ? (d.itens as Record<string, unknown>[]) : []).map(normalizarItem);
      const t: Tela = {
        hoje: String(d.hoje ?? ''),
        itens,
        catalogo: (Array.isArray(d.catalogo) ? (d.catalogo as Record<string, unknown>[]) : []).map(normalizarCatalogo),
        listas: (Array.isArray(d.listas) ? (d.listas as Record<string, unknown>[]) : []).map(normalizarLista),
        fornecedores: (Array.isArray(d.fornecedores) ? (d.fornecedores as Record<string, unknown>[]) : []).map(f => ({
          id: String(f.id), nome: String(f.nome ?? ''), modalidade: (f.modalidade === 'rua' ? 'rua' : 'entrega') as Modalidade,
          telefone: (f.telefone as string | null) ?? null,
        })),
      };
      setTela(t);
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
    value: f.id, label: f.nome, sublabel: f.modalidade === 'rua' ? 'Loja de rua · comprador vai buscar' : 'Entrega',
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

  // ── Edição das linhas ──
  const setLinha = (id: string, patch: Partial<Linha>) =>
    setLinhas(prev => ({ ...prev, [id]: { ...prev[id], ...patch } }));

  const escolherOrigem = (id: string, valor: string) => {
    if (valor === OUTRO) { setLinha(id, { outro: true, origem: '' }); return; }
    setLinha(id, { outro: false, origem: valor, marcado: valor ? true : linhas[id]?.marcado ?? false });
  };

  const marcarCategoria = (lista: readonly ItemCompra[], marcado: boolean) =>
    setLinhas(prev => {
      const n = { ...prev };
      for (const it of lista) n[it.item_id] = { ...n[it.item_id], marcado };
      return n;
    });

  const aplicarOrigemMassa = () => {
    if (!origemMassa) return;
    setLinhas(prev => {
      const n = { ...prev };
      for (const it of visiveis) if (n[it.item_id]?.marcado) n[it.item_id] = { ...n[it.item_id], origem: origemMassa, outro: false };
      return n;
    });
  };

  /** Um clique para os marcados que ficaram sem origem irem para a lista da Rua. */
  const semOrigemParaRua = () =>
    setLinhas(prev => {
      const n = { ...prev };
      for (const it of todos) {
        const st = n[it.item_id];
        if (st?.marcado && !resolver(st.origem)) n[it.item_id] = { ...st, origem: RUA, outro: false };
      }
      return n;
    });

  const adicionarExtra = (itemId: string) => {
    const c = tela?.catalogo.find(x => x.item_id === itemId);
    if (!c || todos.some(x => x.item_id === itemId)) { setAdicionando(false); return; }
    const it: ItemCompra = {
      item_id: c.item_id, nome: c.nome, categoria: c.categoria, um: c.um, fracionado: c.fracionado,
      saldo: c.saldo, ponto: c.ponto, situacao: 'extra', sugerida: 0, consumo_dia: 0,
      preco: c.preco, preco_origem: c.preco > 0 ? 'custo_medio' : null,
      em_lista: 0, em_lista_onde: null, origem: null, recentes: [],
    };
    setExtras(prev => [...prev, it]);
    setLinhas(prev => ({ ...prev, [it.item_id]: { marcado: true, quantidade: 0, origem: '', outro: false } }));
    setAdicionando(false);
  };

  const removerExtra = (id: string) => {
    setExtras(prev => prev.filter(x => x.item_id !== id));
    setLinhas(prev => { const n = { ...prev }; delete n[id]; return n; });
  };

  // ── Resumo ──
  const marcadas = useMemo(() => todos
    .map(it => ({ it, st: linhas[it.item_id] }))
    .filter(({ st }) => st && st.marcado),
  [todos, linhas]);

  const resumo = useMemo(() => {
    let valor = 0, rua = 0, semOrigem = 0, semQtd = 0;
    const pedidos = new Map<string, number>();
    for (const { it, st } of marcadas) {
      if (st.quantidade <= 0) { semQtd += 1; continue; }
      valor += st.quantidade * it.preco;
      const r = resolver(st.origem);
      if (!r) { semOrigem += 1; continue; }
      if (r.destino === 'rua') rua += 1;
      else pedidos.set(r.nome, (pedidos.get(r.nome) ?? 0) + 1);
    }
    const pedidosTxt = [...pedidos.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR')).map(([n, c]) => `${n} (${c})`).join(', ');
    return { itens: marcadas.length, valor, rua, pedidos: pedidos.size, pedidosTxt, semOrigem, semQtd };
  }, [marcadas, resolver]);

  const podeGerar = marcadas.length > 0 && resumo.semOrigem === 0 && resumo.semQtd === 0 && !gerando;

  // ── Gerar ──
  const gerar = async () => {
    if (!podeGerar) return;
    setGerando(true); setResultado(null);
    try {
      const linhasEnvio = marcadas.map(({ it, st }) => {
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
                Tudo que está abaixo do ponto de pedido do Central. Escolha a origem de cada item e gere as listas:
                uma da Rua para o comprador e uma por fornecedor.
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
                  <Plus size={14} /> Incluir item que não está abaixo do ponto
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
          <p>Conferindo o que está abaixo do ponto...</p>
        </div>
      )}

      {tela && !carregando && visiveis.length === 0 && (
        <div className="bg-[#12141f] rounded-2xl border border-white/10 text-center py-14 text-white/40">
          <Package size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-white/70 font-medium">Nada abaixo do ponto com esses filtros.</p>
        </div>
      )}

      {tela && visiveis.length > 0 && (
        <div className="bg-[#12141f] rounded-2xl border border-white/10">
          <div className="overflow-x-auto rounded-t-2xl">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-[#0c1018] text-white/40">
                  <th className="px-3 py-2 w-8" />
                  <th className="px-3 py-2 text-left font-medium">Item</th>
                  <th className="px-3 py-2 text-right font-medium">Tem</th>
                  <th className="px-3 py-2 text-right font-medium">Ponto</th>
                  <th className="px-3 py-2 text-right font-medium">Comprar</th>
                  <th className="px-3 py-2 text-left font-medium">Origem</th>
                  <th className="px-3 py-2 text-right font-medium">Preço médio</th>
                  <th className="px-3 py-2 text-right font-medium">Estimado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {grupos.flatMap(([categoria, lista]) => {
                  const marcadosCat = lista.filter(it => linhas[it.item_id]?.marcado).length;
                  const subtotal = lista.reduce((s, it) => {
                    const st = linhas[it.item_id];
                    return s + (st?.marcado ? st.quantidade * it.preco : 0);
                  }, 0);
                  return [
                    <tr key={`cat:${categoria}`}>
                      <td className="px-3 py-1.5 bg-white/[0.04]">
                        <input type="checkbox" checked={marcadosCat === lista.length} onChange={e => marcarCategoria(lista, e.target.checked)}
                          className="w-4 h-4 rounded border-white/20 bg-transparent accent-[#7D1F2C] cursor-pointer" title="Marcar toda a categoria" />
                      </td>
                      <td colSpan={7} className="px-3 py-1.5 bg-white/[0.04] text-[11px] font-semibold uppercase tracking-wide text-white/50">
                        {categoria} <span className="normal-case font-normal text-white/30">· {marcadosCat} de {lista.length} · {fmtMoeda(subtotal)}</span>
                      </td>
                    </tr>,
                    ...lista.map(it => {
                      const st = linhas[it.item_id] ?? linhaInicial(it);
                      const r = resolver(st.origem);
                      const estimado = st.quantidade * it.preco;
                      const valorSelect = st.outro ? OUTRO : st.origem;
                      const recentesEntrega = it.recentes;
                      const origemForaDosRecentes = idDe(st.origem) && !recentesEntrega.some(f => f.fornecedor_id === idDe(st.origem)) ? fornPorId.get(idDe(st.origem)!) : null;
                      return (
                        <tr key={it.item_id} className={`hover:bg-white/[0.02] align-top ${st.marcado ? '' : 'opacity-55'}`}>
                          <td className="px-3 py-2.5">
                            <input type="checkbox" checked={st.marcado} onChange={e => setLinha(it.item_id, { marcado: e.target.checked })}
                              className="w-4 h-4 rounded border-white/20 bg-transparent accent-[#7D1F2C] cursor-pointer" />
                          </td>
                          <td className="px-3 py-2 min-w-[200px]">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="text-white/90 font-medium">{it.nome.trim()}</p>
                              <span className="text-caption text-white/40">{it.um}</span>
                              {it.situacao === 'extra'
                                ? <span className="text-caption px-1.5 py-0.5 rounded-md border bg-purple-500/10 text-purple-300 border-purple-500/30">incluído à mão</span>
                                : <BadgeSituacao s={it.situacao} />}
                              {it.situacao === 'extra' && (
                                <button onClick={() => removerExtra(it.item_id)} className="text-white/30 hover:text-white/60" title="Tirar da tela"><X size={12} /></button>
                              )}
                            </div>
                            <div className="flex items-center gap-2 flex-wrap mt-0.5 text-caption">
                              {it.consumo_dia > 0 && <span className="text-white/40">sai ~{fmtQtd(it.consumo_dia)}/dia</span>}
                              {it.em_lista > 0 && (
                                <span className="px-1.5 py-0.5 rounded-md border bg-orange-500/10 text-orange-300 border-orange-500/30">
                                  já na lista: {it.em_lista_onde || fmtQtd(it.em_lista)}
                                </span>
                              )}
                            </div>
                          </td>
                          <td className={`px-3 py-2.5 text-right whitespace-nowrap ${it.saldo <= 0 ? 'text-red-400 font-semibold' : 'text-white/80'}`}>
                            {fmtQtd(it.saldo)}
                          </td>
                          <td className="px-3 py-2.5 text-right text-white/60 whitespace-nowrap">{it.ponto > 0 ? fmtQtd(it.ponto) : '—'}</td>
                          <td className="px-3 py-2 text-right whitespace-nowrap">
                            <input type="number" min={0} step={it.fracionado ? 0.01 : 1} value={st.quantidade}
                              onChange={e => {
                                const v = parseFloat(e.target.value);
                                setLinha(it.item_id, { quantidade: arredondar(Number.isFinite(v) ? Math.max(0, v) : 0, it.fracionado) });
                              }}
                              className={`w-20 text-right text-sm font-bold border rounded-lg px-2 py-1 bg-[#0c1018] text-white focus:outline-none focus:ring-2 focus:ring-wine/30 ${st.marcado && st.quantidade <= 0 ? 'border-red-500/50' : 'border-white/10'}`} />
                          </td>
                          <td className="px-3 py-2 min-w-[230px]">
                            <select value={valorSelect} onChange={e => escolherOrigem(it.item_id, e.target.value)}
                              className={`w-full text-xs border rounded-lg px-2 py-1.5 bg-[#0c1018] text-white focus:outline-none focus:ring-2 focus:ring-wine/30 ${st.marcado && !r ? 'border-red-500/50' : 'border-white/10'}`}>
                              <option value="">Escolher origem…</option>
                              <option value={RUA}>🛒 Rua (comprador vai buscar)</option>
                              {recentesEntrega.length > 0 && <option disabled>── já comprou de ──</option>}
                              {recentesEntrega.map(f => (
                                <option key={f.fornecedor_id} value={fId(f.fornecedor_id)}>
                                  {f.modalidade === 'rua' ? '🛒 ' : '🚚 '}{f.nome}
                                  {f.ultimo_preco ? ` · ${fmtMoeda(f.ultimo_preco)}` : ''}{f.ultima ? ` (${fmtData(f.ultima).slice(0, 5)})` : ''}
                                </option>
                              ))}
                              {origemForaDosRecentes && (
                                <option value={fId(origemForaDosRecentes.id)}>{origemForaDosRecentes.modalidade === 'rua' ? '🛒 ' : '🚚 '}{origemForaDosRecentes.nome}</option>
                              )}
                              <option disabled>──────────</option>
                              <option value={OUTRO}>Outro fornecedor…</option>
                            </select>
                            {st.outro && (
                              <SearchableSelect theme="dark" className="mt-1.5" options={opcoesFornecedor} value=""
                                placeholder="Buscar fornecedor..." emptyMessage="Nenhum fornecedor ativo"
                                onChange={v => escolherOrigem(it.item_id, v ? fId(v) : '')} />
                            )}
                            <div className="mt-1 min-h-[16px] text-caption">
                              {r
                                ? r.destino === 'rua'
                                  ? <span className="text-orange-300/80">{r.lojaId ? `Lista da Rua · ${r.nome}` : 'Lista da Rua'}</span>
                                  : <span className="text-blue-300/80">Pedido para {r.nome}</span>
                                : <span className="text-white/30">{st.outro ? 'Escolha o fornecedor' : 'Sem origem'}</span>}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right whitespace-nowrap">
                            {it.preco > 0 ? (
                              <span title={it.preco_origem === 'compras' ? 'Média das últimas compras' : 'Custo médio do cadastro (sem compra recente)'}
                                className={it.preco_origem === 'compras' ? 'text-white/80' : 'text-white/50'}>
                                {fmtMoeda(it.preco)}
                              </span>
                            ) : <span className="text-white/30" title="Sem preço conhecido">—</span>}
                          </td>
                          <td className="px-3 py-2.5 text-right text-white font-medium whitespace-nowrap">
                            {estimado > 0 ? fmtMoeda(estimado) : '—'}
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
            "Comprar" sugere o que falta para chegar ao ponto (ponto 5, tem 3 → 2). Preço médio = média das últimas 5 compras recebidas; em cinza, é o custo do cadastro.
            🚚 fornecedor entrega (vira pedido) · 🛒 loja de rua (vai na lista do comprador).
          </p>

          {/* Rodapé fixo */}
          <div className="sticky bottom-0 rounded-b-2xl border-t border-white/10 bg-[#12141f]/95 backdrop-blur px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="text-xs text-white/60 min-w-0 space-y-1">
              <p>
                <span className="text-white font-semibold">{plural(resumo.itens, 'item marcado', 'itens marcados')} · {fmtMoeda(resumo.valor)}</span>
                {resumo.rua > 0 && <span className="ml-2 inline-flex items-center gap-1 text-orange-300"><Store size={12} /> Rua ({resumo.rua})</span>}
                {resumo.pedidosTxt && <span className="ml-2 inline-flex items-center gap-1 text-blue-300"><Truck size={12} /> {resumo.pedidosTxt}</span>}
              </p>
              {(resumo.semOrigem > 0 || resumo.semQtd > 0) && (
                <p className="text-red-300 flex items-center gap-2 flex-wrap">
                  {resumo.semOrigem > 0 && (
                    <>
                      <span>{plural(resumo.semOrigem, 'item marcado sem origem', 'itens marcados sem origem')}</span>
                      <button onClick={semOrigemParaRua} className="px-2 py-0.5 rounded-md border border-orange-500/40 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20">
                        mandar para a Rua
                      </button>
                    </>
                  )}
                  {resumo.semOrigem > 0 && resumo.semQtd > 0 && <span>·</span>}
                  {resumo.semQtd > 0 && <span>{plural(resumo.semQtd, 'item marcado com quantidade zero', 'itens marcados com quantidade zero')}</span>}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5">
                <span className="text-caption text-white/40">Origem dos marcados:</span>
                {origemMassaOutro ? (
                  <div className="w-56">
                    <SearchableSelect theme="dark" options={opcoesFornecedor} value={idDe(origemMassa) ?? ''}
                      placeholder="Buscar fornecedor..." emptyMessage="Nenhum"
                      onChange={v => { setOrigemMassa(v ? fId(v) : ''); }} />
                  </div>
                ) : (
                  <select value={origemMassa} onChange={e => { if (e.target.value === OUTRO) { setOrigemMassaOutro(true); setOrigemMassa(''); } else setOrigemMassa(e.target.value); }}
                    className="text-xs border border-white/10 rounded-lg px-2 py-1.5 bg-[#0c1018] text-white focus:outline-none">
                    <option value="">—</option>
                    <option value={RUA}>🛒 Rua</option>
                    <option value={OUTRO}>Fornecedor…</option>
                  </select>
                )}
                <button onClick={aplicarOrigemMassa} disabled={!origemMassa}
                  className="px-2.5 py-1.5 rounded-lg border border-white/10 text-xs text-white/70 hover:bg-white/5 disabled:opacity-40">Aplicar</button>
                {origemMassaOutro && <button onClick={() => { setOrigemMassaOutro(false); setOrigemMassa(''); }} className="text-white/30 hover:text-white/60"><X size={12} /></button>}
              </div>
              <button onClick={gerar} disabled={!podeGerar}
                className="flex items-center gap-2 bg-wine hover:bg-[#6a1a25] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
                {gerando ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />}
                {gerando ? 'Gerando...' : 'Gerar listas'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
