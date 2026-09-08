import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Search, Compass, Sparkles, Check, ChevronDown, ChevronUp, Info, Loader2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ════════════════════════════════════════════════════════════════════════════
// MAPEAMENTO ASSISTIDO — versão in-app da página "Mapeamento ZIG Ditado"
// Sugere item/ficha + estoque para cada produto ZIG e grava direto em
// mapeamento_itens_vendas a cada mudança (debounce 400 ms).
// ════════════════════════════════════════════════════════════════════════════

// ── tipos ─────────────────────────────────────────────────────────────────
interface MapeamentoRow {
  id: string; nome_externo: string; nome_normalizado: string|null;
  item_estoque_id: string|null; ficha_tecnica_id: string|null; estoque_id: string|null;
  ignorar_estoque: boolean; zig_category: string|null; tipo_mapeamento: string|null;
  origem: string|null; usado_vezes: number|null; ultima_utilizacao: string|null; atualizado_em: string|null;
}
interface Item   { id: string; nome: string; categoria: string|null; unidade_medida: string|null; estoque_nativo_id: string|null; }
interface Ficha  { id: string; nome: string; categoria: string|null; }
interface Estoque{ id: string; nome: string; tipo: string|null; }

type TipoAlvo = 'Item'|'Ficha'|'Ignorar'|'';
type Conf     = 'alta'|'média'|'baixa'|'nenhuma'|'atual';
type Situacao = 'Ignorado'|'Mapeado'|'Vínculo sem estoque'|'Sem vínculo';

interface Sugestao {
  tipo: TipoAlvo; alvo_id: string|null; alvo_nome: string;
  estoque_id: string|null; estoque: string; conf: Conf; motivo: string;
}
interface Produto {
  id: string; nome: string; cat: string|null; vend: number; sit: Situacao;
  atual: { tipo: TipoAlvo; alvo_id: string|null; alvo: string; estoque_id: string|null; estoque: string };
  sug: Sugestao;
}
interface Decisao {
  tipo: TipoAlvo; alvo_id: string|null; alvo_nome: string;
  estoque_id: string|null; estoque_nome: string; obs: string;
}
interface Dados { rows: MapeamentoRow[]; itens: Item[]; fichas: Ficha[]; estoques: Estoque[]; vendido: Record<string, number>; }

type FiltroKey = 'precisa'|'alta'|'media'|'fraca'|'mapeados'|'ignorados'|'decididos'|'todos';

// ── normalização e similaridade (porta fiel do script Python) ─────────────
function normalizar(s: string|null|undefined): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/add__/g, ' ').replace(/_/g, ' ')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/(\d+)\s+ml\b/g, '$1ml')
    .replace(/\s+/g, ' ').trim();
}
function bigramas(s: string): Map<string, number> {
  const m = new Map<string, number>();
  for (let i = 0; i < s.length - 1; i++) { const b = s.slice(i, i + 2); m.set(b, (m.get(b) || 0) + 1); }
  return m;
}
function dice(a: string, b: string): number {
  if (!a || !b) return 0; if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const ba = bigramas(a), bb = bigramas(b);
  let inter = 0; for (const [g, n] of ba) inter += Math.min(n, bb.get(g) || 0);
  return (2 * inter) / ((a.length - 1) + (b.length - 1));
}
function jaccard(a: string, b: string): number {
  const ta = new Set(a.split(' ').filter(Boolean)), tb = new Set(b.split(' ').filter(Boolean));
  if (!ta.size || !tb.size) return 0;
  let inter = 0; for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}
function score(a: string, b: string): number {
  return 0.6 * dice(a, b) + 0.4 * jaccard(a, b);
}
function confDe(s: number): Conf { return s >= 0.8 ? 'alta' : s >= 0.6 ? 'média' : s >= 0.45 ? 'baixa' : 'nenhuma'; }

// ── utilitários ───────────────────────────────────────────────────────────
function maisComum(m: Map<string, number>|undefined): string|null {
  if (!m || !m.size) return null;
  let best: string|null = null, bn = -1;
  for (const [k, n] of m) if (n > bn) { best = k; bn = n; }
  return best;
}
function inc(map: Map<string, Map<string, number>>, k1: string, k2: string) {
  let inner = map.get(k1); if (!inner) { inner = new Map(); map.set(k1, inner); }
  inner.set(k2, (inner.get(k2) || 0) + 1);
}
const fmt  = (n: number) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const hora = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
function completa(d: Decisao|null|undefined): boolean {
  return !!d && (d.tipo === 'Ignorar' || (!!d.tipo && !!d.alvo_id && !!d.estoque_id));
}

const RX_CHOPP   = /chopp|chope|barril/;
const RX_COZINHA = /cozinha|comida|prato|porc|lanche|hamb|burg|sobremesa|entrada|petisco|pastel|espet|pizza|salad|massa|carne|peixe|frango/;
const RX_BAR     = /bebida|drink|cerveja|dose|vinho|whisk|gin|vodka|caipir|suco|refri|agua|energ|long neck|lata|garrafa|shot|coquet|cachac/;

// paginação: PostgREST limita a 1000 linhas por requisição
async function buscarTudo<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[]|null; error: { message: string }|null }>,
): Promise<T[]> {
  const out: T[] = []; const page = 1000;
  for (let i = 0; i < 40; i++) {
    const { data, error } = await build(i * page, (i + 1) * page - 1);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < page) break;
  }
  return out;
}

// ── motor de sugestões ────────────────────────────────────────────────────
function calcularProdutos(D: Dados): Produto[] {
  const itemById  = new Map(D.itens.map(i => [i.id, i]));
  const fichaById = new Map(D.fichas.map(f => [f.id, f]));
  const estById   = new Map(D.estoques.map(e => [e.id, e]));
  const estNome   = (id: string|null) => (id && estById.get(id)?.nome) || '';
  const estPorNome = (nome: string) => D.estoques.find(e => normalizar(e.nome) === normalizar(nome)) || null;
  const estPorTipo = (tipo: string) => D.estoques.find(e => (e.tipo || '') === tipo) || null;
  const estCentral = estPorTipo('central') || estPorNome('Estoque Central');
  const estCozinha = estPorNome('Cozinha') || estPorTipo('secundario');
  const estBar     = estPorNome('Bar') || estPorTipo('geral') || D.estoques[0] || null;

  // estatísticas dos mapeamentos existentes (regras 1 e 2 de estoque)
  const estPorAlvo = new Map<string, Map<string, number>>();
  const estPorCat  = new Map<string, Map<string, number>>();
  for (const r of D.rows) {
    if (!r.estoque_id || r.ignorar_estoque) continue;
    const alvoId = r.ficha_tecnica_id || r.item_estoque_id; if (!alvoId) continue;
    inc(estPorAlvo, alvoId, r.estoque_id);
    const cat = r.ficha_tecnica_id ? fichaById.get(r.ficha_tecnica_id)?.categoria : itemById.get(r.item_estoque_id!)?.categoria;
    if (cat) inc(estPorCat, normalizar(cat), r.estoque_id);
  }

  const itensN  = D.itens.map(i => ({ o: i, n: normalizar(i.nome) }));
  const fichasN = D.fichas.map(f => ({ o: f, n: normalizar(f.nome) }));

  function sugerirEstoque(r: MapeamentoRow, tipo: 'Item'|'Ficha', alvoId: string): { id: string|null; motivo: string } {
    const m1 = maisComum(estPorAlvo.get(alvoId));
    if (m1) return { id: m1, motivo: 'mesmo item já mapeado' };
    const cat = tipo === 'Ficha' ? fichaById.get(alvoId)?.categoria : itemById.get(alvoId)?.categoria;
    if (cat) { const m2 = maisComum(estPorCat.get(normalizar(cat))); if (m2) return { id: m2, motivo: `categoria ${cat}` }; }
    if (tipo === 'Item') { const nat = itemById.get(alvoId)?.estoque_nativo_id; if (nat && estById.has(nat)) return { id: nat, motivo: 'estoque nativo do item' }; }
    const txt = normalizar(`${r.zig_category || ''} ${r.nome_externo}`);
    if (RX_CHOPP.test(txt)   && estCentral) return { id: estCentral.id, motivo: 'regra: chopp/barril → central' };
    if (RX_COZINHA.test(txt) && estCozinha) return { id: estCozinha.id, motivo: 'regra: palavra de cozinha' };
    if (RX_BAR.test(txt)     && estBar)     return { id: estBar.id,     motivo: 'regra: palavra de bar' };
    return { id: estBar?.id || null, motivo: 'padrão (revisar)' };
  }

  return D.rows.map(r => {
    const tipoAtual: TipoAlvo = r.ficha_tecnica_id ? 'Ficha' : r.item_estoque_id ? 'Item' : r.ignorar_estoque ? 'Ignorar' : '';
    const alvoId   = r.ficha_tecnica_id || r.item_estoque_id || null;
    const alvoNome = r.ficha_tecnica_id ? (fichaById.get(r.ficha_tecnica_id)?.nome || '') : r.item_estoque_id ? (itemById.get(r.item_estoque_id)?.nome || '') : '';
    const atual = { tipo: tipoAtual, alvo_id: alvoId, alvo: alvoNome, estoque_id: r.estoque_id, estoque: estNome(r.estoque_id) };
    const base = { id: r.id, nome: r.nome_externo, cat: r.zig_category, vend: D.vendido[r.nome_externo] || 0, atual };

    if (r.ignorar_estoque) {
      return { ...base, sit: 'Ignorado', sug: { tipo: 'Ignorar', alvo_id: null, alvo_nome: '', estoque_id: null, estoque: '', conf: 'atual', motivo: 'já marcado para ignorar' } };
    }
    if (alvoId && r.estoque_id) {
      return { ...base, sit: 'Mapeado', sug: { tipo: tipoAtual, alvo_id: alvoId, alvo_nome: alvoNome, estoque_id: r.estoque_id, estoque: estNome(r.estoque_id), conf: 'atual', motivo: 'mapeamento atual' } };
    }
    if (alvoId) {
      const e = sugerirEstoque(r, tipoAtual as 'Item'|'Ficha', alvoId);
      return { ...base, sit: 'Vínculo sem estoque', sug: { tipo: tipoAtual, alvo_id: alvoId, alvo_nome: alvoNome, estoque_id: e.id, estoque: estNome(e.id), conf: 'média', motivo: `já vinculado a "${alvoNome}", faltava o estoque · estoque ${estNome(e.id) || '?'}: ${e.motivo}` } };
    }

    // sem vínculo: pontua contra itens e fichas
    const nome = normalizar(r.nome_externo);
    const cands: { tipo: 'Item'|'Ficha'; id: string; nome: string; s: number }[] = [];
    for (const { o, n } of itensN)  { const s = score(nome, n); if (s >= 0.45) cands.push({ tipo: 'Item',  id: o.id, nome: o.nome, s }); }
    for (const { o, n } of fichasN) { const s = score(nome, n); if (s >= 0.45) cands.push({ tipo: 'Ficha', id: o.id, nome: o.nome, s }); }
    cands.sort((a, b) => b.s - a.s);
    const best = cands[0];
    if (!best) {
      return { ...base, sit: 'Sem vínculo', sug: { tipo: '', alvo_id: null, alvo_nome: '', estoque_id: null, estoque: '', conf: 'nenhuma', motivo: 'nenhum item ou ficha parecido o bastante (score < 0,45)' } };
    }
    const e = sugerirEstoque(r, best.tipo, best.id);
    const alts = cands.slice(1, 4).map(c => `${c.nome} (${c.tipo.toLowerCase()}, ${c.s.toFixed(2)})`);
    const motivo = `${best.tipo} "${best.nome}" parecido com o nome (score ${best.s.toFixed(2)})`
      + (alts.length ? ` · alternativas: ${alts.join(', ')}` : '')
      + ` · estoque ${estNome(e.id) || '?'}: ${e.motivo}`;
    return { ...base, sit: 'Sem vínculo', sug: { tipo: best.tipo, alvo_id: best.id, alvo_nome: best.nome, estoque_id: e.id, estoque: estNome(e.id), conf: confDe(best.s), motivo } };
  });
}

// ── filtros ───────────────────────────────────────────────────────────────
const FILTROS: { key: FiltroKey; label: string; fn: (p: Produto, decidido: boolean) => boolean }[] = [
  { key: 'precisa',   label: 'Precisa decidir',  fn: (p, d) => !d && p.sit === 'Sem vínculo' },
  { key: 'alta',      label: 'Sugestão alta',    fn: (p, d) => !d && p.sug.conf === 'alta' },
  { key: 'media',     label: 'Sugestão média',   fn: (p, d) => !d && p.sug.conf === 'média' },
  { key: 'fraca',     label: 'Sem sugestão boa', fn: (p, d) => !d && (p.sug.conf === 'baixa' || p.sug.conf === 'nenhuma') },
  { key: 'mapeados',  label: 'Já mapeados',      fn: p => p.sit === 'Mapeado' },
  { key: 'ignorados', label: 'Ignorados',        fn: p => p.sit === 'Ignorado' },
  { key: 'decididos', label: 'Decididos aqui',   fn: (_p, d) => d },
  { key: 'todos',     label: 'Todos',            fn: () => true },
];

const CONF_CLS: Record<Conf, string> = {
  'alta':    'bg-emerald-500/15 text-emerald-300',
  'média':   'bg-amber-500/15 text-amber-300',
  'baixa':   'bg-red-500/15 text-red-300',
  'nenhuma': 'bg-red-500/15 text-red-300',
  'atual':   'bg-white/10 text-white/60',
};
const Tag = ({ cls, children }: { cls: string; children: React.ReactNode }) => (
  <span className={`inline-block font-mono text-[10px] uppercase tracking-wider px-1.5 py-0.5 rounded mr-1 ${cls}`}>{children}</span>
);

// ════════════════════════════════════════════════════════════════════════════
export default function MapeamentoZigAssistido() {
  const [dados, setDados]       = useState<Dados|null>(null);
  const [erroCarga, setErroCarga] = useState('');
  const [status, setStatus]     = useState<{ texto: string; erro: boolean }>({ texto: 'Carregando…', erro: false });
  const [filtro, setFiltro]     = useState<FiltroKey>('precisa');
  const [busca, setBusca]       = useState('');
  const [aberto, setAberto]     = useState<string|null>(null);
  const [dec, setDec]           = useState<Record<string, Decisao>>({});     // decisões salvas nesta sessão
  const [draft, setDraft]       = useState<Record<string, Decisao>>({});     // rascunhos em edição
  const [salvando, setSalvando] = useState<Record<string, boolean>>({});
  const [bulkRodando, setBulkRodando] = useState(false);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // ── carga ──
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const [rows, itens, fichas, estoques] = await Promise.all([
          buscarTudo<MapeamentoRow>((a, b) => supabase.from('mapeamento_itens_vendas')
            .select('id,nome_externo,nome_normalizado,item_estoque_id,ficha_tecnica_id,estoque_id,ignorar_estoque,zig_category,tipo_mapeamento,origem,usado_vezes,ultima_utilizacao,atualizado_em')
            .order('nome_externo').range(a, b)),
          buscarTudo<Item>((a, b) => supabase.from('itens_estoque')
            .select('id,nome,categoria,unidade_medida,estoque_nativo_id').eq('status', 'ativo').order('nome').range(a, b)),
          buscarTudo<Ficha>((a, b) => supabase.from('fichas_tecnicas')
            .select('id,nome,categoria').eq('ativo', true).order('nome').range(a, b)),
          buscarTudo<Estoque>((a, b) => supabase.from('estoques')
            .select('id,nome,tipo').eq('status', true).order('nome').range(a, b)),
        ]);

        // vendido nos últimos 120 dias (opcional — falha em silêncio)
        const vendido: Record<string, number> = {};
        try {
          const desde = new Date(); desde.setDate(desde.getDate() - 120);
          const movs = await buscarTudo<{ quantidade: number|string|null; observacoes: string|null }>((a, b) => supabase.from('movimentacoes_estoque')
            .select('quantidade,observacoes').eq('origem_tipo', 'zig')
            .gte('data_movimentacao', desde.toISOString().slice(0, 10)).like('observacoes', '%produto: %').range(a, b));
          for (const m of movs) {
            const i = (m.observacoes || '').indexOf('produto: '); if (i < 0) continue;
            const nome = (m.observacoes || '').slice(i + 9).trim();
            vendido[nome] = (vendido[nome] || 0) + (Number(m.quantidade) || 0);
          }
        } catch { /* coluna "vendido" fica vazia */ }

        if (!vivo) return;
        setDados({ rows, itens, fichas, estoques, vendido });
        setStatus({ texto: 'Conectado. Salva sozinho a cada mudança.', erro: false });
      } catch (e: unknown) {
        if (!vivo) return;
        const msg = e instanceof Error ? e.message : String(e);
        setErroCarga(msg); setStatus({ texto: 'Erro ao carregar: ' + msg, erro: true });
      }
    })();
    return () => { vivo = false; };
  }, []);

  useEffect(() => { const t = timers.current; return () => { Object.values(t).forEach(clearTimeout); }; }, []);

  // ── sugestões (uma vez, após a carga) ──
  const produtos = useMemo(() => (dados ? calcularProdutos(dados) : []), [dados]);
  const pendentesIniciais = useMemo(() => produtos.filter(p => p.sit === 'Sem vínculo').length, [produtos]);

  // ── helpers de decisão ──
  const rascunhoInicial = useCallback((p: Produto): Decisao => {
    const s = dec[p.id]; if (s) return { ...s };
    if (p.sit === 'Mapeado' || p.sit === 'Ignorado') {
      return { tipo: p.atual.tipo, alvo_id: p.atual.alvo_id, alvo_nome: p.atual.alvo, estoque_id: p.atual.estoque_id, estoque_nome: p.atual.estoque, obs: '' };
    }
    if (p.sug.conf === 'alta' || p.sug.conf === 'média') {
      return { tipo: p.sug.tipo, alvo_id: p.sug.alvo_id, alvo_nome: p.sug.alvo_nome, estoque_id: p.sug.estoque_id, estoque_nome: p.sug.estoque, obs: '' };
    }
    return { tipo: '', alvo_id: null, alvo_nome: '', estoque_id: null, estoque_nome: '', obs: '' };
  }, [dec]);

  const persistir = useCallback(async (p: Produto, d: Decisao): Promise<boolean> => {
    const ignorar = d.tipo === 'Ignorar';
    const payload = {
      item_estoque_id:  !ignorar && d.tipo === 'Item'  ? d.alvo_id : null,
      ficha_tecnica_id: !ignorar && d.tipo === 'Ficha' ? d.alvo_id : null,
      estoque_id:       ignorar ? null : d.estoque_id,
      ignorar_estoque:  ignorar,
      tipo_mapeamento:  'manual',   // CHECK: só 'manual' | 'automatico'
      origem:           'manual',   // CHECK: 'manual' | 'ia' | 'sugestao_ia'
      confianca:        1,
      atualizado_em:    new Date().toISOString(),
    };
    setSalvando(s => ({ ...s, [p.id]: true }));
    const { error } = await supabase.from('mapeamento_itens_vendas').update(payload).eq('id', p.id);
    setSalvando(s => { const n = { ...s }; delete n[p.id]; return n; });
    if (error) { setStatus({ texto: `Não salvou "${p.nome}": ${error.message}`, erro: true }); return false; }
    setDec(prev => ({ ...prev, [p.id]: { ...d } }));
    setStatus({ texto: 'Salvo · ' + hora(), erro: false });
    return true;
  }, []);

  const salvar = useCallback((p: Produto, d: Decisao) => {
    const body = { ...d };
    setDraft(prev => ({ ...prev, [p.id]: body }));
    clearTimeout(timers.current[p.id]);
    timers.current[p.id] = setTimeout(() => { delete timers.current[p.id]; void persistir(p, body); }, 400);
  }, [persistir]);

  const toggle = (p: Produto) => {
    setAberto(a => (a === p.id ? null : p.id));
    if (aberto !== p.id && !draft[p.id]) setDraft(prev => ({ ...prev, [p.id]: rascunhoInicial(p) }));
  };

  const aceitarAltas = async () => {
    const alvo = produtos.filter(p => !dec[p.id] && p.sug.conf === 'alta');
    if (!alvo.length || !window.confirm(`Aceitar a sugestão de ${alvo.length} produtos com confiança alta?`)) return;
    setBulkRodando(true);
    let ok = 0;
    for (const p of alvo) { if (await persistir(p, rascunhoInicial(p))) ok++; }
    setBulkRodando(false);
    setStatus({ texto: ok === alvo.length ? `${ok} sugestões altas salvas · ${hora()}` : `${ok} de ${alvo.length} salvas — veja os erros`, erro: ok !== alvo.length });
  };

  // ── derivados de render ──
  const decidido = (p: Produto) => !!dec[p.id];
  const contagens = useMemo(() => Object.fromEntries(FILTROS.map(f => [f.key, produtos.filter(p => f.fn(p, !!dec[p.id])).length])) as Record<FiltroKey, number>, [produtos, dec]);
  const decididos = useMemo(() => produtos.filter(p => p.sit === 'Sem vínculo' && completa(dec[p.id])).length, [produtos, dec]);
  const altas = contagens.alta;
  const q = normalizar(busca);
  const fn = FILTROS.find(f => f.key === filtro)!.fn;
  const linhas = produtos.filter(p => fn(p, decidido(p)) && (!q || normalizar(p.nome).includes(q) || normalizar(p.sug.alvo_nome).includes(q) || normalizar(p.atual.alvo).includes(q) || normalizar(dec[p.id]?.alvo_nome).includes(q)));
  const pct = pendentesIniciais ? Math.min(100, Math.round(100 * decididos / pendentesIniciais)) : 0;

  if (erroCarga) {
    return (
      <div className="p-6"><div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300 flex gap-2"><AlertTriangle size={16} className="shrink-0 mt-0.5"/>{erroCarga}</div></div>
    );
  }
  if (!dados) {
    return <div className="p-10 flex items-center justify-center gap-2 text-white/60 text-sm"><Loader2 size={16} className="animate-spin"/>Carregando produtos, itens, fichas e estoques…</div>;
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-4">
      {/* ── cabeçalho ── */}
      <div className="bg-[#12141f] rounded-2xl border border-white/10 p-5 space-y-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="w-10 h-10 rounded-xl bg-wine flex items-center justify-center shrink-0"><Compass size={20} className="text-white"/></div>
          <div className="flex-1 min-w-[260px]">
            <h1 className="text-xl font-bold text-white">Mapeamento assistido</h1>
            <p className="text-sm text-white/60 max-w-[62ch]">Cada produto vendido na ZIG precisa dizer qual item do estoque baixa e de qual estoque sai. Abra o produto, confira a sugestão e salve — cada mudança grava na hora.</p>
          </div>
          <div className="min-w-[220px] flex-1 sm:flex-none space-y-1">
            <div className="font-mono text-[11px] uppercase tracking-wider text-white/40">Decididos</div>
            <div className="text-2xl font-bold text-white leading-none">{decididos} <span className="text-white/40 text-base font-medium">de {pendentesIniciais} pendentes</span></div>
            <div className="h-2 bg-white/5 rounded overflow-hidden"><div className="h-full bg-wine transition-all" style={{ width: `${pct}%` }}/></div>
            <div className={`text-xs ${status.erro ? 'text-red-300' : 'text-white/50'}`}>{status.texto}</div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="flex-1 min-w-[240px] flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-2">
            <Search size={14} className="text-white/40 shrink-0"/>
            <input type="search" value={busca} onChange={e => setBusca(e.target.value)} placeholder="produto, item ou ficha" autoComplete="off"
              className="flex-1 min-w-0 bg-transparent outline-none text-sm text-white placeholder:text-white/30"/>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {FILTROS.map(f => (
              <button key={f.key} type="button" onClick={() => setFiltro(f.key)} aria-pressed={filtro === f.key}
                className={`px-2.5 py-1.5 rounded-lg text-xs border transition-colors inline-flex items-center gap-1.5 ${filtro === f.key ? 'bg-wine border-wine text-white' : 'bg-white/5 border-white/10 text-white/60 hover:text-white'}`}>
                {f.label}<b className={`font-mono text-[10px] font-medium ${filtro === f.key ? 'text-white/80' : 'text-white/40'}`}>{contagens[f.key]}</b>
              </button>
            ))}
          </div>
          <button type="button" onClick={aceitarAltas} disabled={altas === 0 || bulkRodando}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold border border-wine text-wine-light hover:bg-wine/20 disabled:opacity-40 disabled:cursor-default transition-colors">
            {bulkRodando ? <Loader2 size={14} className="animate-spin"/> : <Sparkles size={14}/>}
            {altas ? `Aceitar ${altas} sugestões de confiança alta` : 'Sugestões altas todas decididas'}
          </button>
        </div>
      </div>

      {/* ── dica ── */}
      <div className="bg-gold-muted border-l-4 border-gold rounded-r-lg px-4 py-2.5 text-sm text-white/80 flex gap-2">
        <Info size={16} className="text-gold shrink-0 mt-0.5"/>
        <div>Comece pelos que <b className="text-white">precisam de decisão</b>: produto sem vínculo. Item que não existe no cadastro: escolha Ignorar por enquanto e escreva o nome na observação.
          <span className="block text-xs text-white/50 mt-0.5">A aba <b>🗺 Mapeamento clássico</b> continua disponível — é a mesma tabela, só muda a forma de editar.</span></div>
      </div>

      {/* ── lista ── */}
      {linhas.length === 0 ? (
        <div className="p-10 text-center text-white/50 text-sm">Nada aqui com esse filtro.</div>
      ) : (
        <div className="space-y-1.5">
          {linhas.map(p => (
            <Linha key={p.id} p={p} d={draft[p.id] || dec[p.id] || null} decidido={decidido(p)} decSalva={dec[p.id]}
              aberto={aberto === p.id} salvando={!!salvando[p.id]} estoques={dados.estoques} itens={dados.itens} fichas={dados.fichas}
              onToggle={() => toggle(p)} onUsar={() => salvar(p, rascunhoInicial(p))} onChange={d => salvar(p, d)}/>
          ))}
        </div>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// LINHA
// ════════════════════════════════════════════════════════════════════════════
interface LinhaProps {
  p: Produto; d: Decisao|null; decidido: boolean; decSalva: Decisao|undefined; aberto: boolean; salvando: boolean;
  estoques: Estoque[]; itens: Item[]; fichas: Ficha[];
  onToggle: () => void; onUsar: () => void; onChange: (d: Decisao) => void;
}
function Linha({ p, d, decidido, decSalva, aberto, salvando, estoques, itens, fichas, onToggle, onUsar, onChange }: LinhaProps) {
  const ok = completa(d);
  const borda = decidido ? (completa(decSalva) ? 'border-l-emerald-500' : 'border-l-amber-500') : p.sit === 'Sem vínculo' ? 'border-l-red-500' : 'border-l-transparent';
  const podeUsar = !decidido && (p.sug.conf === 'alta' || p.sug.conf === 'média');

  const hoje = decSalva
    ? (decSalva.tipo === 'Ignorar' ? <span>Ignorado</span> : <span><strong className="text-white font-semibold">{decSalva.alvo_nome || '—'}</strong> · {decSalva.estoque_nome || <span className="text-amber-300">sem estoque</span>}</span>)
    : p.sit === 'Ignorado' ? <span>Ignorado</span>
    : p.sit === 'Sem vínculo' ? <span>Sem vínculo</span>
    : <span><strong className="text-white font-semibold">{p.atual.alvo}</strong> · {p.atual.estoque || <span className="text-amber-300">sem estoque</span>}</span>;

  return (
    <div className={`bg-[#12141f] border border-white/10 border-l-4 rounded-xl ${borda}`}>
      <div role="button" tabIndex={0} aria-expanded={aberto}
        onClick={e => { if ((e.target as HTMLElement).closest('button')) return; onToggle(); }}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onToggle(); } }}
        className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr_1.2fr_auto] gap-1 md:gap-3 items-center px-4 py-2.5 cursor-pointer hover:bg-white/5 rounded-xl">
        <div className="text-sm font-semibold text-white">
          {p.nome}
          <small className="block font-normal text-xs text-white/50">{p.cat || 'sem categoria ZIG'}{p.vend ? ` · vendido ${fmt(p.vend)}` : ''}</small>
        </div>
        <div className="text-xs text-white/60"><span className="font-mono text-[10px] uppercase tracking-wider text-white/40">Hoje</span><br/>{hoje}</div>
        <div className="text-xs text-white/60"><span className="font-mono text-[10px] uppercase tracking-wider text-white/40">Sugestão</span><br/>
          {p.sug.tipo
            ? <><Tag cls={CONF_CLS[p.sug.conf]}>{p.sug.conf}</Tag>{p.sug.tipo === 'Ignorar' ? 'Ignorar' : <><strong className="text-white font-semibold">{p.sug.alvo_nome}</strong> · {p.sug.estoque || '?'}</>}</>
            : <><Tag cls={CONF_CLS.nenhuma}>nenhuma</Tag>sem parecido</>}
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          {salvando && <Loader2 size={14} className="animate-spin text-white/40"/>}
          {decidido && <Tag cls={ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-amber-500/15 text-amber-300'}>{ok ? 'decidido' : 'incompleto'}</Tag>}
          {podeUsar && (
            <button type="button" onClick={onUsar} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-wine text-white hover:bg-wine-light whitespace-nowrap">
              <Check size={12}/>Usar sugestão
            </button>
          )}
          <button type="button" onClick={onToggle} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs border border-white/10 text-white/70 hover:text-white hover:bg-white/5 whitespace-nowrap">
            {aberto ? <><ChevronUp size={12}/>Fechar</> : <><ChevronDown size={12}/>Editar</>}
          </button>
        </div>
      </div>
      {aberto && d && <Editor p={p} d={d} estoques={estoques} itens={itens} fichas={fichas} onChange={onChange}/>}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// EDITOR
// ════════════════════════════════════════════════════════════════════════════
function Editor({ p, d, estoques, itens, fichas, onChange }: { p: Produto; d: Decisao; estoques: Estoque[]; itens: Item[]; fichas: Ficha[]; onChange: (d: Decisao) => void }) {
  const setTipo = (t: TipoAlvo) => {
    if (d.tipo === t) { onChange({ ...d }); return; }
    const n: Decisao = { ...d, tipo: t, alvo_id: null, alvo_nome: '' };
    if (t === 'Ignorar') { n.estoque_id = null; n.estoque_nome = ''; }
    onChange(n);
  };
  const escolher = (o: { id: string; nome: string }) => {
    const n: Decisao = { ...d, alvo_id: o.id, alvo_nome: o.nome };
    if (!n.estoque_id && p.sug.estoque_id && p.sug.alvo_id === o.id) { n.estoque_id = p.sug.estoque_id; n.estoque_nome = p.sug.estoque; }
    onChange(n);
  };
  const label = 'font-mono text-[11px] uppercase tracking-wider text-white/40';

  return (
    <div className="border-t border-white/10 px-4 py-3 grid grid-cols-1 lg:grid-cols-[180px_1fr_280px] gap-4 items-start">
      <div className="space-y-1.5">
        <span className={label}>Como dá baixa</span>
        <div className="flex rounded-lg border border-white/10 overflow-hidden">
          {(['Item', 'Ficha', 'Ignorar'] as TipoAlvo[]).map(t => (
            <button key={t} type="button" aria-pressed={d.tipo === t} onClick={() => setTipo(t)}
              className={`flex-1 px-1 py-1.5 text-xs transition-colors ${d.tipo === t ? 'bg-wine text-white' : 'text-white/60 hover:bg-white/5'}`}>{t}</button>
          ))}
        </div>
      </div>

      <div className="space-y-1.5 min-w-0">
        <span className={label}>{d.tipo === 'Ficha' ? 'Qual ficha técnica' : 'Qual item do estoque'}</span>
        {d.tipo === 'Ignorar'
          ? <div className="text-xs text-white/60 py-1.5">Não mexe no estoque (couvert, taxa, serviço).</div>
          : <Combo key={d.tipo} tipo={d.tipo} itens={itens} fichas={fichas} selecionado={d.alvo_nome} onEscolher={escolher}/>}
      </div>

      <div className="space-y-3">
        <div className="space-y-1.5">
          <span className={label}>De qual estoque sai</span>
          <div className="flex flex-wrap gap-1.5">
            {estoques.map(e => (
              <button key={e.id} type="button" aria-pressed={d.estoque_id === e.id} disabled={d.tipo === 'Ignorar'}
                onClick={() => onChange({ ...d, estoque_id: e.id, estoque_nome: e.nome })}
                className={`px-2.5 py-1.5 rounded-lg text-xs border transition-colors disabled:opacity-40 disabled:cursor-default ${d.estoque_id === e.id ? 'bg-wine border-wine text-white' : 'bg-white/5 border-white/10 text-white/70 hover:text-white'}`}>
                {e.nome}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-1.5">
          <span className={label}>Observação <span className="normal-case tracking-normal text-white/30">(só nesta tela)</span></span>
          <input value={d.obs} onChange={e => onChange({ ...d, obs: e.target.value })} placeholder='ex.: cadastrar item novo "…"'
            className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-wine"/>
        </div>
      </div>

      <div className="lg:col-span-3 text-xs text-white/50"><b className="text-white/80">Por que a sugestão:</b> {p.sug.motivo || '—'}</div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMBOBOX (item ou ficha)
// ════════════════════════════════════════════════════════════════════════════
type Opcao = { id: string; nome: string; cat: string|null; um: string|null };
function Combo({ tipo, itens, fichas, selecionado, onEscolher }: { tipo: TipoAlvo; itens: Item[]; fichas: Ficha[]; selecionado: string; onEscolher: (o: Opcao) => void }) {
  const [q, setQ]       = useState('');
  const [open, setOpen] = useState(false);
  const [idx, setIdx]   = useState(-1);
  const listRef = useRef<HTMLUListElement>(null);

  const fonte = useMemo<Opcao[]>(() => tipo === 'Ficha'
    ? fichas.map(f => ({ id: f.id, nome: f.nome, cat: f.categoria, um: null }))
    : itens.map(i => ({ id: i.id, nome: i.nome, cat: i.categoria, um: i.unidade_medida })), [tipo, itens, fichas]);
  const fonteN = useMemo(() => fonte.map(o => ({ o, n: normalizar(o.nome) })), [fonte]);

  const opts = useMemo(() => {
    const toks = normalizar(q).split(' ').filter(Boolean);
    return fonteN.filter(({ n }) => toks.every(t => n.includes(t))).slice(0, 30).map(x => x.o);
  }, [q, fonteN]);

  useEffect(() => { setIdx(-1); }, [q]);
  useEffect(() => {
    if (idx < 0 || !listRef.current) return;
    const li = listRef.current.children[idx] as HTMLElement|undefined;
    li?.scrollIntoView({ block: 'nearest' });
  }, [idx]);

  const escolher = (o: Opcao) => { onEscolher(o); setQ(''); setOpen(false); };
  const mostrar = open && opts.length > 0;

  return (
    <div className="relative">
      <input value={q} autoComplete="off" placeholder={tipo === 'Ficha' ? 'digite o nome da ficha' : 'digite o nome do item'}
        onChange={e => { setQ(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={e => {
          if (!mostrar) return;
          if (e.key === 'ArrowDown')      { e.preventDefault(); setIdx(i => Math.min(opts.length - 1, i + 1)); }
          else if (e.key === 'ArrowUp')   { e.preventDefault(); setIdx(i => Math.max(0, i - 1)); }
          else if (e.key === 'Enter')     { e.preventDefault(); if (opts[idx]) escolher(opts[idx]); }
          else if (e.key === 'Escape')    { setOpen(false); }
        }}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-white/30 outline-none focus:border-wine"/>
      {mostrar && (
        <ul ref={listRef} role="listbox" className="absolute left-0 right-0 top-full z-20 mt-1 max-h-60 overflow-auto bg-[#1a1d2b] border border-white/10 rounded-lg shadow-xl">
          {opts.map((o, i) => (
            <li key={o.id} role="option" aria-selected={i === idx}
              onMouseDown={e => { e.preventDefault(); escolher(o); }}
              onMouseEnter={() => setIdx(i)}
              className={`px-3 py-1.5 cursor-pointer flex justify-between gap-3 text-sm ${i === idx ? 'bg-wine/30 text-white' : 'text-white/80'}`}>
              <span className="truncate">{o.nome}</span>
              <small className="text-white/40 shrink-0">{o.cat || ''}{o.um ? ` · ${o.um}` : ''}</small>
            </li>
          ))}
        </ul>
      )}
      <div className="text-xs text-emerald-300 font-semibold min-h-[18px] mt-1">{selecionado ? `✓ ${selecionado}` : ''}</div>
    </div>
  );
}
