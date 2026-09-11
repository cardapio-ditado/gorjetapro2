import { useState, useEffect, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarDays, RefreshCw, Search, X, Truck, Store, AlertTriangle,
  ChevronDown, ChevronRight, Phone, Send, ShoppingCart,
  Package, Info, ExternalLink, Users, Wallet,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  DIAS, fmt, fmtQtd, fmtMoeda, ehFracionado,
  BadgeSituacao, BadgeCriterio, DiasCompra, MensagemBox,
  type Situacao, type Criterio, type Mensagem,
} from './comprasShared';
import { PainelListaDoDia, urlListaPublica, normalizarListaDoDia, type ListaDoDia } from './PainelListaDoDia';
import { agruparPorCategoria } from './agruparPorCategoria';

// ─── Tipos ───────────────────────────────────────────────────────────────────
type TipoCompra = 'fornecedor' | 'rua' | 'ambos';
type Modalidade = 'entrega' | 'rua';

interface ItemReposicao {
  item_id: string;
  nome: string;
  codigo: string | null;
  categoria: string | null;
  unidade_medida: string;
  tipo_compra: TipoCompra;
  fornecedor_id: string | null;
  fornecedor_nome: string | null;
  fornecedor_telefone: string | null;
  ciclo_dias: number;
  dias_compra: number[] | null;
  saldo_central: number;
  saldo_pontas: number;
  consumo_dia: number;
  cobertura_dias: number | null;
  ponto_pedido: number;
  alvo: number;
  estoque_minimo: number;
  minimo_manual: boolean;
  em_lista_aberta: number;
  em_pedido_pendente: number;
  quantidade_sugerida: number;
  custo_medio: number;
  custo_estimado: number;
  criterio: Criterio;
  situacao: Situacao;
}

interface CardFornecedor {
  id: string;
  nome: string;
  telefone: string | null;
  ciclo_dias: number;
  dias_compra: number[] | null;
  itens: ItemReposicao[];
}
// ─── Helpers ─────────────────────────────────────────────────────────────────
function hojeIso(): number {
  // getDay(): 0=Dom..6=Sáb → ISO 1=Seg..7=Dom
  return ((new Date().getDay() + 6) % 7) + 1;
}

function precisaComprar(s: Situacao) { return s === 'zerado' || s === 'comprar'; }

function compraNoDia(dias: number[] | null, dia: number): boolean {
  return !dias || dias.length === 0 || dias.includes(dia);
}

function normalizar(raw: Record<string, unknown>): ItemReposicao {
  const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));
  return {
    item_id: String(raw.item_id),
    nome: String(raw.nome ?? ''),
    codigo: (raw.codigo as string | null) ?? null,
    categoria: (raw.categoria as string | null) ?? null,
    unidade_medida: String(raw.unidade_medida ?? ''),
    tipo_compra: ((raw.tipo_compra as TipoCompra) || 'ambos'),
    fornecedor_id: (raw.fornecedor_id as string | null) ?? null,
    fornecedor_nome: (raw.fornecedor_nome as string | null) ?? null,
    fornecedor_telefone: (raw.fornecedor_telefone as string | null) ?? null,
    ciclo_dias: num(raw.ciclo_dias),
    dias_compra: Array.isArray(raw.dias_compra) ? (raw.dias_compra as unknown[]).map(Number) : null,
    saldo_central: num(raw.saldo_central),
    saldo_pontas: num(raw.saldo_pontas),
    consumo_dia: num(raw.consumo_dia),
    cobertura_dias: raw.cobertura_dias === null || raw.cobertura_dias === undefined ? null : Number(raw.cobertura_dias),
    ponto_pedido: num(raw.ponto_pedido),
    alvo: num(raw.alvo),
    estoque_minimo: num(raw.estoque_minimo),
    minimo_manual: Boolean(raw.minimo_manual),
    em_lista_aberta: num(raw.em_lista_aberta),
    em_pedido_pendente: num(raw.em_pedido_pendente),
    quantidade_sugerida: num(raw.quantidade_sugerida),
    custo_medio: num(raw.custo_medio),
    custo_estimado: num(raw.custo_estimado),
    criterio: ((raw.criterio as Criterio) || 'sem_consumo'),
    situacao: ((raw.situacao as Situacao) || 'ok'),
  };
}
// ─── Sub-componentes ─────────────────────────────────────────────────────────
interface LinhaProps {
  item: ItemReposicao;
  editavel: boolean;
  marcado: boolean;
  quantidade: number;
  onMarcar: () => void;
  onQuantidade: (q: number) => void;
}

function LinhaItem({ item, editavel, marcado, quantidade, onMarcar, onQuantidade }: LinhaProps) {
  const fracionado = ehFracionado(item.unidade_medida);
  const custoEstimado = Number((quantidade * item.custo_medio).toFixed(2));
  return (
    <tr className={`hover:bg-white/[0.02] ${editavel && !marcado ? 'opacity-50' : ''}`}>
      {editavel && (
        <td className="px-3 py-2">
          <input type="checkbox" checked={marcado} onChange={onMarcar}
            className="w-4 h-4 rounded border-white/20 bg-transparent accent-[#7D1F2C] cursor-pointer" />
        </td>
      )}
      <td className="px-3 py-2 min-w-[180px]">
        <div className="flex items-center gap-1.5 flex-wrap">
          <p className="text-white/90 font-medium">{item.nome}</p>
          <span className="text-caption text-white/40">{item.unidade_medida}</span>
          <BadgeSituacao s={item.situacao} />
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
          <BadgeCriterio c={item.criterio} />
          {item.em_pedido_pendente > 0 && (
            <span className="text-caption text-blue-400">já em pedido: {fmtQtd(item.em_pedido_pendente)}</span>
          )}
          {item.em_lista_aberta > 0 && (
            <span className="text-caption text-orange-400">em lista: {fmtQtd(item.em_lista_aberta)}</span>
          )}
        </div>
      </td>
      <td className={`px-3 py-2 text-right whitespace-nowrap ${item.saldo_central <= 0 ? 'text-red-400' : 'text-white/80'}`}>
        {fmtQtd(item.saldo_central)}
      </td>
      <td className="px-3 py-2 text-right text-white/60 whitespace-nowrap">
        {item.consumo_dia > 0 ? fmt(item.consumo_dia, 2) : '—'}
      </td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {item.cobertura_dias === null
          ? <span className="text-white/40">sem histórico</span>
          : <span className={item.cobertura_dias <= item.ciclo_dias ? 'text-amber-400' : 'text-white/70'}>cobre {fmt(item.cobertura_dias, 1)} dias</span>}
      </td>
      <td className="px-3 py-2 text-right text-white/60 whitespace-nowrap">{fmtQtd(item.ponto_pedido)}</td>
      <td className="px-3 py-2 text-right whitespace-nowrap">
        {editavel ? (
          <input type="number" min={0} step={fracionado ? 0.01 : 1} value={quantidade}
            onChange={e => {
              const v = parseFloat(e.target.value);
              const q = Number.isFinite(v) ? Math.max(0, v) : 0;
              onQuantidade(fracionado ? Number(q.toFixed(2)) : Math.round(q));
            }}
            className="w-20 text-right text-sm font-bold border border-white/10 rounded-lg px-2 py-1 bg-[#0c1018] text-white focus:outline-none focus:ring-2 focus:ring-wine/30" />
        ) : (
          <span className="text-white font-semibold">{fmtQtd(item.quantidade_sugerida)}</span>
        )}
      </td>
      <td className="px-3 py-2 text-right text-white/60 whitespace-nowrap">
        {item.custo_medio > 0 ? fmtMoeda(item.custo_medio) : '—'}
      </td>
      <td className="px-3 py-2 text-right text-white font-medium whitespace-nowrap">
        {custoEstimado > 0 ? fmtMoeda(custoEstimado) : '—'}
      </td>
    </tr>
  );
}

function CabecalhoTabela({ editavel }: { editavel: boolean }) {
  return (
    <thead>
      <tr className="bg-[#0c1018] text-white/40">
        {editavel && <th className="px-3 py-2 w-8" />}
        <th className="px-3 py-2 text-left font-medium">Item</th>
        <th className="px-3 py-2 text-right font-medium">Saldo Central</th>
        <th className="px-3 py-2 text-right font-medium">Consumo/dia</th>
        <th className="px-3 py-2 text-right font-medium">Cobertura</th>
        <th className="px-3 py-2 text-right font-medium">Ponto de pedido</th>
        <th className="px-3 py-2 text-right font-medium">Quantidade</th>
        <th className="px-3 py-2 text-right font-medium">Custo unit.</th>
        <th className="px-3 py-2 text-right font-medium">Custo est.</th>
      </tr>
    </thead>
  );
}
// ─── Componente principal ────────────────────────────────────────────────────
export default function ComprasDaSemana() {
  const hoje = hojeIso();
  const [itens, setItens] = useState<ItemReposicao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [dia, setDia] = useState<number>(hoje);
  const [mostrarTodos, setMostrarTodos] = useState(false);
  const [incluirAtencao, setIncluirAtencao] = useState(false);
  const [busca, setBusca] = useState('');
  const [colapsados, setColapsados] = useState<Set<string>>(new Set());
  const [marcados, setMarcados] = useState<Record<string, boolean>>({});
  const [quantidades, setQuantidades] = useState<Record<string, number>>({});
  const [gerando, setGerando] = useState<string | null>(null);
  const [mensagens, setMensagens] = useState<Record<string, Mensagem>>({});
  const [listaDia, setListaDia] = useState<ListaDoDia | null>(null);
  /** modalidade de cada fornecedor ativo (entrega | rua) */
  const [modalidades, setModalidades] = useState<Record<string, Modalidade>>({});

  const carregarListaDia = useCallback(async (): Promise<ListaDoDia | null> => {
    try {
      const { data, error } = await supabase.rpc('fn_lista_do_dia_resumo');
      const l = error ? null : normalizarListaDoDia(data);
      setListaDia(l);
      return l;
    } catch {
      setListaDia(null);
      return null;
    }
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try {
      const [{ data, error }, rForn] = await Promise.all([
        supabase.rpc('fn_reposicao_central'),
        supabase.from('fornecedores').select('id, modalidade').eq('status', 'ativo'),
      ]);
      if (error) { setErro(error.message); return; }
      const mods: Record<string, Modalidade> = {};
      for (const f of (rForn.data || []) as { id: string; modalidade: string | null }[]) {
        mods[f.id] = f.modalidade === 'rua' ? 'rua' : 'entrega';
      }
      setModalidades(mods);
      const lista = (Array.isArray(data) ? data : []).map(r => normalizar(r as Record<string, unknown>));
      setItens(lista);
      // Reinicia seleção/quantidades com a sugestão nova
      const m: Record<string, boolean> = {};
      const q: Record<string, number> = {};
      for (const it of lista) {
        m[it.item_id] = precisaComprar(it.situacao);
        q[it.item_id] = it.quantidade_sugerida;
      }
      setMarcados(m); setQuantidades(q);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); carregarListaDia(); }, [carregar, carregarListaDia]);

  // ── Filtros ──
  const buscaLower = busca.trim().toLowerCase();
  const bateBusca = useCallback((it: ItemReposicao) =>
    !buscaLower || it.nome.toLowerCase().includes(buscaLower) || (it.codigo || '').toLowerCase().includes(buscaLower),
  [buscaLower]);

  const relevante = useCallback((it: ItemReposicao) =>
    precisaComprar(it.situacao) || (incluirAtencao && it.situacao === 'atencao'),
  [incluirAtencao]);

  // Item é "de rua" pelo tipo de compra ou porque o fornecedor preferido é uma loja de rua
  const ehRua = useCallback((it: ItemReposicao) =>
    it.tipo_compra === 'rua' || (!!it.fornecedor_id && modalidades[it.fornecedor_id] === 'rua'),
  [modalidades]);

  // Cards por fornecedor (itens de rua ficam no card de rua)
  const cardsFornecedor = useMemo<CardFornecedor[]>(() => {
    const map = new Map<string, CardFornecedor>();
    for (const it of itens) {
      if (!it.fornecedor_id || ehRua(it)) continue;
      if (!relevante(it)) continue;
      if (!mostrarTodos && !compraNoDia(it.dias_compra, dia)) continue;
      let card = map.get(it.fornecedor_id);
      if (!card) {
        card = {
          id: it.fornecedor_id,
          nome: it.fornecedor_nome || 'Fornecedor',
          telefone: it.fornecedor_telefone,
          ciclo_dias: it.ciclo_dias,
          dias_compra: it.dias_compra,
          itens: [],
        };
        map.set(it.fornecedor_id, card);
      }
      card.itens.push(it);
    }
    return [...map.values()].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [itens, relevante, mostrarTodos, dia, ehRua]);

  const itensRua = useMemo(() =>
    itens.filter(it => ehRua(it) && precisaComprar(it.situacao)),
  [itens, ehRua]);

  const itensSemFornecedor = useMemo(() =>
    itens.filter(it => !it.fornecedor_id && !ehRua(it) && precisaComprar(it.situacao)),
  [itens, ehRua]);

  // Aplicação da busca
  const cardsVisiveis = useMemo(() =>
    cardsFornecedor.map(c => ({ ...c, itens: c.itens.filter(bateBusca) })).filter(c => c.itens.length > 0),
  [cardsFornecedor, bateBusca]);
  const ruaVisiveis = useMemo(() => itensRua.filter(bateBusca), [itensRua, bateBusca]);
  const semFornVisiveis = useMemo(() => itensSemFornecedor.filter(bateBusca), [itensSemFornecedor, bateBusca]);

  // ── Resumo (conjunto filtrado pelo dia, sem busca) ──
  const resumo = useMemo(() => {
    const doDia = cardsFornecedor.flatMap(c => c.itens).filter(it => precisaComprar(it.situacao));
    const todos = [...doDia, ...itensRua, ...itensSemFornecedor];
    return {
      itensComprar: todos.length,
      valor: todos.reduce((s, it) => s + it.custo_estimado, 0),
      fornecedores: cardsFornecedor.length,
      semFornecedor: itensSemFornecedor.length,
    };
  }, [cardsFornecedor, itensRua, itensSemFornecedor]);

  // ── Helpers de UI ──
  const toggleColapso = (key: string) =>
    setColapsados(prev => { const s = new Set(prev); if (s.has(key)) s.delete(key); else s.add(key); return s; });

  const setMsg = (key: string, msg: Mensagem | null) =>
    setMensagens(prev => { const n = { ...prev }; if (msg) n[key] = msg; else delete n[key]; return n; });

  const selecionadosDe = (lista: ItemReposicao[]) =>
    lista.filter(it => marcados[it.item_id] && (quantidades[it.item_id] ?? 0) > 0);

  const valorSelecionado = (lista: ItemReposicao[]) =>
    selecionadosDe(lista).reduce((s, it) => s + (quantidades[it.item_id] ?? 0) * it.custo_medio, 0);

  // ── Ações ──
  const gerarPedido = async (card: CardFornecedor) => {
    const key = `forn:${card.id}`;
    const sel = selecionadosDe(card.itens);
    if (sel.length === 0) { setMsg(key, { tipo: 'erro', texto: 'Marque ao menos um item com quantidade maior que zero.' }); return; }
    setGerando(key); setMsg(key, null);
    try {
      const { data, error } = await supabase.rpc('fn_gerar_pedido_compra', {
        p_fornecedor_id: card.id,
        p_itens: sel.map(it => ({ item_id: it.item_id, quantidade: quantidades[it.item_id], custo_unitario: it.custo_medio })),
        p_observacoes: `Gerado em Compras da semana (${new Date().toLocaleDateString('pt-BR')})`,
      });
      if (error) { setMsg(key, { tipo: 'erro', texto: error.message }); return; }
      const r = (data || {}) as { entrada_id?: string; itens?: number; valor?: number; lista_id?: string; lista_numero?: string };
      const numLista = r.lista_numero || 'de hoje';
      setMsg(key, {
        tipo: 'ok',
        texto: `Pedido gerado para ${card.nome}: ${Number(r.itens ?? sel.length)} ${Number(r.itens ?? sel.length) === 1 ? 'item' : 'itens'}, ${fmtMoeda(Number(r.valor ?? 0))}. Fica pendente no Estoque Central até o recebimento. Adicionado à lista do comprador ${numLista}.`,
        link: '/advanced-inventory?area=operacao&tela=receber',
        linkLabel: 'Receber mercadoria',
        linkExterno: r.lista_id ? { href: urlListaPublica(r.lista_id), label: 'Abrir lista' } : undefined,
      });
      await Promise.all([carregar(), carregarListaDia()]);
    } catch (e: unknown) {
      setMsg(key, { tipo: 'erro', texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setGerando(null);
    }
  };

  const gerarListaRua = async () => {
    const key = 'rua';
    const sel = selecionadosDe(itensRua);
    if (sel.length === 0) { setMsg(key, { tipo: 'erro', texto: 'Marque ao menos um item com quantidade maior que zero.' }); return; }
    setGerando(key); setMsg(key, null);
    try {
      const { data, error } = await supabase.rpc('fn_gerar_lista_rua', {
        p_itens: sel.map(it => ({ item_id: it.item_id, quantidade: quantidades[it.item_id], fornecedor_id: it.fornecedor_id ?? null })),
        p_titulo: `Compra de rua – ${new Date().toLocaleDateString('pt-BR')}`,
      });
      if (error) { setMsg(key, { tipo: 'erro', texto: error.message }); return; }
      const r = (data || {}) as { lista_id?: string; numero?: string; itens?: number; valor?: number };
      setMsg(key, {
        tipo: 'ok',
        texto: `Lista de rua gerada: ${Number(r.itens ?? sel.length)} ${Number(r.itens ?? sel.length) === 1 ? 'item' : 'itens'}, ${fmtMoeda(Number(r.valor ?? 0))}. Adicionado à lista do comprador ${r.numero || 'de hoje'}.`,
        link: '/advanced-inventory?area=compras&tela=lista-compras',
        linkLabel: 'Abrir listas de compras',
        linkExterno: r.lista_id ? { href: urlListaPublica(r.lista_id), label: 'Abrir lista' } : undefined,
      });
      await Promise.all([carregar(), carregarListaDia()]);
    } catch (e: unknown) {
      setMsg(key, { tipo: 'erro', texto: e instanceof Error ? e.message : String(e) });
    } finally {
      setGerando(null);
    }
  };

  // ── Render ──
  const nadaParaComprar = !carregando && !erro
    && cardsVisiveis.length === 0 && ruaVisiveis.length === 0 && semFornVisiveis.length === 0;
  const nomeDia = dia === hoje ? 'hoje' : DIAS[dia - 1].sigla;

  // Linhas agrupadas por categoria (cabeçalho ocupa todas as colunas de CabecalhoTabela)
  const renderLinhas = (lista: ItemReposicao[], editavel: boolean) =>
    agruparPorCategoria(lista).flatMap(([categoria, doGrupo]) => [
      <tr key={`cat:${categoria}`}>
        <td colSpan={editavel ? 9 : 8} className="px-3 py-1.5 bg-white/[0.04] text-[11px] font-semibold uppercase tracking-wide text-white/50">
          {categoria} <span className="normal-case font-normal text-white/30">· {doGrupo.length} {doGrupo.length === 1 ? 'item' : 'itens'}</span>
        </td>
      </tr>,
      ...doGrupo.map(it => (
        <LinhaItem key={it.item_id} item={it} editavel={editavel}
          marcado={!!marcados[it.item_id]}
          quantidade={quantidades[it.item_id] ?? 0}
          onMarcar={() => setMarcados(prev => ({ ...prev, [it.item_id]: !prev[it.item_id] }))}
          onQuantidade={q => setQuantidades(prev => ({ ...prev, [it.item_id]: q }))} />
      )),
    ]);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[#12141f] rounded-2xl border border-white/10 px-5 py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-wine rounded-xl flex items-center justify-center flex-shrink-0">
              <CalendarDays size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Compras da semana</h2>
              <p className="text-sm text-white/60">O que pedir a cada fornecedor no dia certo, olhando só o saldo do Estoque Central.</p>
            </div>
          </div>
          <button onClick={carregar} disabled={carregando}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-sm font-medium text-white/60 hover:bg-white/5 disabled:opacity-50">
            <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>

        {/* Dia + toggles */}
        <div className="flex items-center gap-2 flex-wrap mt-4">
          <button onClick={() => setDia(hoje)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${dia === hoje ? 'bg-wine text-white border-wine' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'}`}>
            Hoje
          </button>
          <span className="w-px h-5 bg-white/10 mx-1" />
          {DIAS.map(d => (
            <button key={d.n} onClick={() => setDia(d.n)}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors ${dia === d.n ? 'bg-wine text-white border-wine' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'} ${mostrarTodos ? 'opacity-40' : ''}`}>
              {d.sigla}
            </button>
          ))}
          <div className="flex items-center gap-3 ml-auto flex-wrap">
            <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer select-none">
              <input type="checkbox" checked={mostrarTodos} onChange={e => setMostrarTodos(e.target.checked)} className="accent-[#7D1F2C]" />
              Mostrar todos os fornecedores
            </label>
            <label className="flex items-center gap-2 text-xs text-white/60 cursor-pointer select-none">
              <input type="checkbox" checked={incluirAtencao} onChange={e => setIncluirAtencao(e.target.checked)} className="accent-[#7D1F2C]" />
              Incluir itens em atenção
            </label>
          </div>
        </div>
      </div>

      {/* Resumo */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Itens para comprar', valor: String(resumo.itensComprar), icon: ShoppingCart, cor: 'text-amber-400' },
          { label: 'Valor estimado', valor: fmtMoeda(resumo.valor), icon: Wallet, cor: 'text-green-400' },
          { label: mostrarTodos ? 'Fornecedores' : 'Fornecedores do dia', valor: String(resumo.fornecedores), icon: Users, cor: 'text-blue-400' },
          { label: 'Itens sem fornecedor', valor: String(resumo.semFornecedor), icon: AlertTriangle, cor: resumo.semFornecedor > 0 ? 'text-red-400' : 'text-white/40' },
        ].map(c => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="bg-[#12141f] rounded-2xl border border-white/10 px-4 py-3 flex items-center gap-3">
              <Icon size={18} className={c.cor} />
              <div className="min-w-0">
                <p className="text-caption text-white/50 uppercase tracking-wide truncate">{c.label}</p>
                <p className="text-lg font-bold text-white leading-tight">{c.valor}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Lista do comprador de hoje */}
      {listaDia && <PainelListaDoDia lista={listaDia} />}

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar item..."
          className="w-full pl-9 pr-8 py-2 text-sm border border-white/10 rounded-xl bg-[#12141f] text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-wine/30" />
        {busca && <button onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/60"><X size={14} /></button>}
      </div>

      {erro && (
        <div className="rounded-xl p-3 text-sm border bg-red-500/10 border-red-500/30 text-red-400">{erro}</div>
      )}

      {carregando && itens.length === 0 && (
        <div className="text-center py-16 text-white/30">
          <RefreshCw size={24} className="animate-spin mx-auto mb-3" />
          <p>Calculando reposição pelo Estoque Central...</p>
        </div>
      )}

      {nadaParaComprar && (
        <div className="bg-[#12141f] rounded-2xl border border-white/10 text-center py-14 text-white/40">
          <Package size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-white/70 font-medium">Nada para comprar {nomeDia}</p>
          <p className="text-xs mt-1">
            {busca ? 'Nenhum item bate com a busca.' : mostrarTodos ? 'Nenhum item abaixo do ponto de pedido no Central.' : 'Nenhum fornecedor compra nesse dia com item abaixo do ponto de pedido. Marque "Mostrar todos os fornecedores" para ver o restante.'}
          </p>
        </div>
      )}

      {/* ── Cards por fornecedor ── */}
      {cardsVisiveis.map(card => {
        const key = `forn:${card.id}`;
        const aberto = !colapsados.has(key);
        const sel = selecionadosDe(card.itens);
        const valorSel = valorSelecionado(card.itens);
        const msg = mensagens[key];
        return (
          <div key={key} className="bg-[#12141f] rounded-2xl border border-white/10 overflow-hidden">
            <button onClick={() => toggleColapso(key)}
              className="w-full flex items-center justify-between gap-3 px-5 py-3 hover:bg-white/5 transition-colors text-left">
              <div className="flex items-center gap-3 min-w-0">
                {aberto ? <ChevronDown size={16} className="text-white/30 flex-shrink-0" /> : <ChevronRight size={16} className="text-white/30 flex-shrink-0" />}
                <Truck size={16} className="text-blue-400 flex-shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-white/90">{card.nome}</span>
                    {card.telefone && (
                      <a href={`tel:${card.telefone.replace(/\s/g, '')}`} onClick={e => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline">
                        <Phone size={11} /> {card.telefone}
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-caption text-white/50 mt-0.5 flex-wrap">
                    <span>compra a cada {card.ciclo_dias} {card.ciclo_dias === 1 ? 'dia' : 'dias'}</span>
                    <DiasCompra dias={card.dias_compra} />
                  </div>
                </div>
              </div>
              <div className="text-right text-xs flex-shrink-0">
                <p className="font-semibold text-white">{card.itens.length} {card.itens.length === 1 ? 'item' : 'itens'}</p>
                <p className="text-white/50">{fmtMoeda(card.itens.reduce((s, it) => s + it.custo_estimado, 0))} est.</p>
              </div>
            </button>
            {aberto && (
              <>
                <div className="overflow-x-auto border-t border-white/5">
                  <table className="w-full text-xs">
                    <CabecalhoTabela editavel />
                    <tbody className="divide-y divide-white/5">{renderLinhas(card.itens, true)}</tbody>
                  </table>
                </div>
                {msg && <MensagemBox msg={msg} onFechar={() => setMsg(key, null)} />}
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-white/5 bg-white/[0.02] flex-wrap">
                  <p className="text-xs text-white/50">
                    {sel.length} {sel.length === 1 ? 'item selecionado' : 'itens selecionados'} · {fmtMoeda(valorSel)}
                  </p>
                  <button onClick={() => gerarPedido(card)} disabled={gerando !== null || sel.length === 0}
                    className="flex items-center gap-2 bg-wine hover:bg-[#6a1a25] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
                    <Send size={14} className={gerando === key ? 'animate-pulse' : ''} />
                    {gerando === key ? 'Gerando...' : `Gerar pedido para ${card.nome}`}
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })}

      {/* ── Compra de rua ── */}
      {ruaVisiveis.length > 0 && (() => {
        const key = 'rua';
        const aberto = !colapsados.has(key);
        const sel = selecionadosDe(itensRua);
        const msg = mensagens[key];
        return (
          <div className="bg-[#12141f] rounded-2xl border border-orange-500/20 overflow-hidden">
            <button onClick={() => toggleColapso(key)}
              className="w-full flex items-center justify-between gap-3 px-5 py-3 hover:bg-white/5 transition-colors text-left">
              <div className="flex items-center gap-3">
                {aberto ? <ChevronDown size={16} className="text-white/30" /> : <ChevronRight size={16} className="text-white/30" />}
                <Store size={16} className="text-orange-400" />
                <div>
                  <span className="font-semibold text-white/90">Compra de rua</span>
                  <p className="text-caption text-white/50">Itens comprados no mercado/atacado, sem pedido a fornecedor</p>
                </div>
              </div>
              <div className="text-right text-xs flex-shrink-0">
                <p className="font-semibold text-white">{ruaVisiveis.length} {ruaVisiveis.length === 1 ? 'item' : 'itens'}</p>
                <p className="text-white/50">{fmtMoeda(ruaVisiveis.reduce((s, it) => s + it.custo_estimado, 0))} est.</p>
              </div>
            </button>
            {aberto && (
              <>
                <div className="overflow-x-auto border-t border-white/5">
                  <table className="w-full text-xs">
                    <CabecalhoTabela editavel />
                    <tbody className="divide-y divide-white/5">{renderLinhas(ruaVisiveis, true)}</tbody>
                  </table>
                </div>
                {msg && <MensagemBox msg={msg} onFechar={() => setMsg(key, null)} />}
                <div className="flex items-center justify-between gap-3 px-5 py-3 border-t border-white/5 bg-white/[0.02] flex-wrap">
                  <p className="text-xs text-white/50">
                    {sel.length} {sel.length === 1 ? 'item selecionado' : 'itens selecionados'} · {fmtMoeda(valorSelecionado(itensRua))}
                  </p>
                  <button onClick={gerarListaRua} disabled={gerando !== null || sel.length === 0}
                    className="flex items-center gap-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
                    <ShoppingCart size={14} className={gerando === key ? 'animate-pulse' : ''} />
                    {gerando === key ? 'Gerando...' : 'Gerar lista de rua'}
                  </button>
                </div>
              </>
            )}
          </div>
        );
      })()}

      {/* ── Sem fornecedor definido ── */}
      {semFornVisiveis.length > 0 && (() => {
        const key = 'sem';
        const aberto = !colapsados.has(key);
        return (
          <div className="bg-[#12141f] rounded-2xl border border-red-500/20 overflow-hidden">
            <button onClick={() => toggleColapso(key)}
              className="w-full flex items-center justify-between gap-3 px-5 py-3 hover:bg-white/5 transition-colors text-left">
              <div className="flex items-center gap-3">
                {aberto ? <ChevronDown size={16} className="text-white/30" /> : <ChevronRight size={16} className="text-white/30" />}
                <AlertTriangle size={16} className="text-red-400" />
                <div>
                  <span className="font-semibold text-white/90">Sem fornecedor definido</span>
                  <p className="text-caption text-white/50">Precisam de compra, mas não entram em nenhum pedido</p>
                </div>
              </div>
              <div className="text-right text-xs flex-shrink-0">
                <p className="font-semibold text-white">{semFornVisiveis.length} {semFornVisiveis.length === 1 ? 'item' : 'itens'}</p>
                <p className="text-white/50">{fmtMoeda(semFornVisiveis.reduce((s, it) => s + it.custo_estimado, 0))} est.</p>
              </div>
            </button>
            {aberto && (
              <>
                <div className="overflow-x-auto border-t border-white/5">
                  <table className="w-full text-xs">
                    <CabecalhoTabela editavel={false} />
                    <tbody className="divide-y divide-white/5">{renderLinhas(semFornVisiveis, false)}</tbody>
                  </table>
                </div>
                <div className="flex items-center gap-2 px-5 py-3 border-t border-white/5 bg-white/[0.02] text-xs text-white/60 flex-wrap">
                  <Info size={13} className="text-white/40 flex-shrink-0" />
                  <span>Defina o fornecedor padrão para o item entrar no pedido.</span>
                  <Link to="/advanced-inventory?area=cadastros&tela=itens"
                    className="inline-flex items-center gap-1 text-blue-400 hover:underline font-medium">
                    <ExternalLink size={12} /> Cadastros › Itens
                  </Link>
                </div>
              </>
            )}
          </div>
        );
      })()}
    </div>
  );
}
