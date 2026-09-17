import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  CheckCircle2, Circle, ShoppingCart, RefreshCw, Package, Share2, Store, Truck, Phone,
  MessageCircle, XCircle, Minus, Plus, X, Search, MapPin, Undo2, Ban,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { agruparPorCategoria } from '../components/inventory/agruparPorCategoria';
import { fmtQtd, fmtMoeda, fmtData, ehFracionado, urlWhatsApp, textoListaRua, textoPedidoFornecedor } from '../components/inventory/comprasShared';

/**
 * Link público de uma lista de compras — uma lista por link.
 *
 * Rua: o comprador passa por vários mercados com a mesma lista. As lojas
 * ficam sempre no topo — toca na que está, marca os itens (quantidade e
 * preço da etiqueta), troca de loja com um toque, segue. "Não achei" não
 * existe por item: ao tocar "Terminei", o que sobrou é marcado como não
 * encontrado e volta a aparecer em Compras. Tudo pensado para uma mão,
 * dentro do mercado.
 *
 * Fornecedor: é o pedido — marcar simples e botão para mandar no WhatsApp.
 */

interface Lista {
  lista_id: string; numero: string; titulo: string;
  tipo: 'rua' | 'fornecedor'; status: string;
  fornecedor_nome: string | null; fornecedor_tel: string | null;
  data: string; itens: number; comprados: number; nao_encontrados: number; valor: number; valor_pago: number;
  observacoes: string | null; criado_em: string; concluido_em: string | null;
}

interface Item {
  id: string; item_id: string; nome: string; categoria: string | null; um: string;
  quantidade: number; preco: number; estimado: number;
  comprado: boolean; comprado_em: string | null; observacao: string | null; loja: string | null;
  loja_id: string | null; loja_nome: string | null;
  quantidade_comprada: number | null; preco_pago: number | null; valor_pago: number | null;
  nao_encontrado: boolean;
}

interface Loja { id: string | null; nome: string; usos: number }

const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const numOuNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

/** "12,50" → 12.5 e "12.50" → 12.5 (ponto é decimal, não milhar); vazio/inválido → null */
function parsePreco(s: string): number | null {
  const n = parseFloat(s.trim().replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function normalizar(raw: Record<string, unknown>): { lista: Lista; itens: Item[]; lojas: Loja[] } {
  const l = (raw.lista || {}) as Record<string, unknown>;
  const itens = (Array.isArray(raw.itens) ? (raw.itens as Record<string, unknown>[]) : []).map(i => ({
    id: String(i.id), item_id: String(i.item_id), nome: String(i.nome ?? ''), categoria: (i.categoria as string | null) ?? null,
    um: String(i.um ?? ''), quantidade: num(i.quantidade), preco: num(i.preco), estimado: num(i.estimado),
    comprado: Boolean(i.comprado), comprado_em: (i.comprado_em as string | null) ?? null,
    observacao: (i.observacao as string | null) ?? null, loja: (i.loja as string | null) ?? null,
    loja_id: (i.loja_id as string | null) ?? null, loja_nome: (i.loja_nome as string | null) ?? null,
    quantidade_comprada: numOuNull(i.quantidade_comprada), preco_pago: numOuNull(i.preco_pago), valor_pago: numOuNull(i.valor_pago),
    nao_encontrado: Boolean(i.nao_encontrado),
  }));
  const lojas = (Array.isArray(raw.lojas) ? (raw.lojas as Record<string, unknown>[]) : []).map(x => ({
    id: String(x.id), nome: String(x.nome ?? '').trim(), usos: num(x.usos),
  }));
  return {
    lista: {
      lista_id: String(l.lista_id), numero: String(l.numero ?? ''), titulo: String(l.titulo ?? ''),
      tipo: l.tipo === 'fornecedor' ? 'fornecedor' : 'rua', status: String(l.status ?? ''),
      fornecedor_nome: (l.fornecedor_nome as string | null) ?? null, fornecedor_tel: (l.fornecedor_tel as string | null) ?? null,
      data: String(l.data ?? ''), itens: num(l.itens), comprados: num(l.comprados), nao_encontrados: num(l.nao_encontrados),
      valor: num(l.valor), valor_pago: num(l.valor_pago),
      observacoes: (l.observacoes as string | null) ?? null, criado_em: String(l.criado_em ?? ''), concluido_em: (l.concluido_em as string | null) ?? null,
    },
    itens, lojas,
  };
}

const chaveLoja = (id: string) => `lista:${id}:loja`;

export default function ListaComprasPublica() {
  const { id } = useParams<{ id: string }>();
  const [lista, setLista] = useState<Lista | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [lojas, setLojas] = useState<Loja[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState<string | null>(null);
  const [concluindo, setConcluindo] = useState(false);

  // Rua: loja atual (persistida no aparelho) e painel do item aberto
  const [loja, setLoja] = useState<Loja | null>(null);
  const [buscaLoja, setBuscaLoja] = useState('');
  const [aberto, setAberto] = useState<Item | null>(null);
  const [qtd, setQtd] = useState('');
  const [preco, setPreco] = useState('');
  const precoRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    if (!id) return;
    setLoading(true); setErro('');
    try {
      const { data, error } = await supabase.rpc('fn_lista_publica', { p_lista_id: id });
      if (error) throw error;
      if (!data) { setErro('Lista não encontrada.'); return; }
      const n = normalizar(data as Record<string, unknown>);
      setLista(n.lista); setItens(n.itens); setLojas(n.lojas);
      // loja lembrada neste aparelho
      try {
        const salva = localStorage.getItem(chaveLoja(id));
        if (salva) { const p = JSON.parse(salva) as Loja; if (p && p.nome) setLoja(p); }
      } catch { /* sem storage */ }
    } catch {
      setErro('Erro ao carregar a lista. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (aberto) setTimeout(() => precoRef.current?.focus(), 80);
  }, [aberto]);

  const escolherLoja = (l: Loja) => {
    setLoja(l); setBuscaLoja('');
    try { if (id) localStorage.setItem(chaveLoja(id), JSON.stringify(l)); } catch { /* sem storage */ }
  };

  const aberta = lista?.status === 'aberta' || lista?.status === 'em_andamento';
  const rua = lista?.tipo === 'rua';

  const aplicarResumo = (r: Record<string, unknown>) =>
    setLista(prev => (prev ? {
      ...prev, status: String(r.status ?? prev.status), itens: num(r.itens), comprados: num(r.comprados),
      nao_encontrados: num(r.nao_encontrados), valor_pago: num(r.valor_pago),
    } : prev));

  // ── Rua: abrir painel do item ──
  const abrirItem = (item: Item) => {
    if (!aberta) return;
    setAberto(item);
    const q = item.quantidade_comprada ?? item.quantidade;
    setQtd(ehFracionado(item.um) ? String(q).replace('.', ',') : String(Math.round(q)));
    setPreco(item.preco_pago ? String(item.preco_pago).replace('.', ',') : '');
  };

  const fechar = () => { setAberto(null); setQtd(''); setPreco(''); };

  const comprei = async () => {
    if (!aberto || !loja) return;
    const quantidade = parsePreco(qtd) ?? aberto.quantidade;
    const precoNum = parsePreco(preco);
    setSalvando(aberto.id);
    try {
      const { data, error } = await supabase.rpc('fn_lista_publica_comprar', {
        p_item_id: aberto.id, p_loja_id: loja.id, p_loja_nome: loja.nome, p_quantidade: quantidade, p_preco: precoNum,
      });
      if (error) throw error;
      setItens(prev => prev.map(i => (i.id === aberto.id ? {
        ...i, comprado: true, nao_encontrado: false, comprado_em: new Date().toISOString(),
        loja_id: loja.id, loja_nome: loja.nome, quantidade_comprada: quantidade, preco_pago: precoNum,
        valor_pago: precoNum ? Number((precoNum * quantidade).toFixed(2)) : null,
      } : i)));
      aplicarResumo((data || {}) as Record<string, unknown>);
      fechar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Não deu para salvar. Tente de novo.');
    } finally {
      setSalvando(null);
    }
  };

  const desfazer = async (item: Item) => {
    setSalvando(item.id);
    try {
      const { data, error } = await supabase.rpc('fn_lista_publica_marcar', { p_item_id: item.id, p_comprado: false });
      if (error) throw error;
      setItens(prev => prev.map(i => (i.id === item.id ? { ...i, comprado: false, comprado_em: null, loja_nome: null, loja_id: null, preco_pago: null, valor_pago: null, quantidade_comprada: null } : i)));
      aplicarResumo((data || {}) as Record<string, unknown>);
      fechar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Não deu para desfazer. Tente de novo.');
    } finally {
      setSalvando(null);
    }
  };

  // ── Fornecedor: marcar simples ──
  const toggleSimples = async (item: Item) => {
    if (!aberta || salvando) return;
    const novo = !item.comprado;
    setSalvando(item.id);
    setItens(prev => prev.map(i => (i.id === item.id ? { ...i, comprado: novo } : i)));
    try {
      const { data, error } = await supabase.rpc('fn_lista_publica_marcar', { p_item_id: item.id, p_comprado: novo });
      if (error) throw error;
      aplicarResumo((data || {}) as Record<string, unknown>);
    } catch {
      setItens(prev => prev.map(i => (i.id === item.id ? { ...i, comprado: !novo } : i)));
      carregar();
    } finally {
      setSalvando(null);
    }
  };

  // Fim da rodada: o que ficou sem comprar vira "não achou" e volta para Compras amanhã.
  const terminar = async () => {
    if (!lista || !aberta) return;
    const faltam = itens.filter(i => !i.comprado).length;
    const pergunta = faltam === 0 ? 'Terminar a lista?'
      : rua ? `Faltam ${faltam} ${faltam === 1 ? 'item' : 'itens'}. Não achou em nenhum lugar? Eles voltam para a lista de amanhã.`
      : `Faltam ${faltam} ${faltam === 1 ? 'item' : 'itens'}. Concluir mesmo assim? Eles voltam a aparecer em Compras.`;
    if (!window.confirm(pergunta)) return;
    setConcluindo(true);
    try {
      const { error } = await supabase.rpc('fn_lista_publica_terminar', { p_lista_id: lista.lista_id });
      if (error) throw error;
      await carregar();
    } catch {
      setErro('Não foi possível terminar. Tente de novo.');
    } finally {
      setConcluindo(false);
    }
  };

  // ── Derivados ──
  const urlAtual = typeof window !== 'undefined' ? window.location.href : '';
  const totalComprados = itens.filter(i => i.comprado).length;
  const totalNao = itens.filter(i => i.nao_encontrado && !i.comprado).length;
  const pct = itens.length > 0 ? Math.round((totalComprados / itens.length) * 100) : 0;
  const totalEstimado = itens.reduce((s, i) => s + i.estimado, 0);
  const totalPago = itens.reduce((s, i) => s + (i.comprado ? (i.valor_pago ?? 0) : 0), 0);
  const semPreco = itens.filter(i => i.comprado && !i.preco_pago).length;

  const lojasTop = useMemo(() => lojas.slice(0, 6), [lojas]);
  const lojasFiltradas = useMemo(() => {
    const b = buscaLoja.trim().toLowerCase();
    return b ? lojas.filter(l => l.nome.toLowerCase().includes(b)) : lojas;
  }, [lojas, buscaLoja]);

  const linkCompartilhar = lista ? urlWhatsApp(textoListaRua(lista.titulo, urlAtual)) : '';
  const linkPedido = lista && !rua
    ? urlWhatsApp(textoPedidoFornecedor(lista.fornecedor_nome || 'fornecedor', fmtData(lista.data), itens), lista.fornecedor_tel)
    : '';

  // painel: totais ao vivo
  const qtdNum = aberto ? (parsePreco(qtd) ?? 0) : 0;
  const precoNum = parsePreco(preco);
  const totalItem = precoNum && qtdNum > 0 ? precoNum * qtdNum : null;
  const acimaDoNormal = !!(aberto && precoNum && aberto.preco > 0 && precoNum > aberto.preco * 1.2);

  if (loading && !lista) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#080c14' }}>
      <div className="flex flex-col items-center gap-4">
        <RefreshCw size={28} className="animate-spin text-white/40" />
        <p className="text-white/60 text-sm">Carregando lista...</p>
      </div>
    </div>
  );

  if (erro && !lista) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#080c14' }}>
      <div className="text-center">
        <Package size={48} className="mx-auto mb-4 text-white/20" />
        <p className="text-white/60 text-lg font-medium">{erro}</p>
      </div>
    </div>
  );

  if (!lista) return null;

  const Icone = rua ? Store : Truck;

  return (
    <div className="min-h-screen pb-40" style={{ background: '#080c14', color: '#e8edf8' }}>
      {/* Cabeçalho */}
      <div style={{ background: rua
        ? 'linear-gradient(135deg, #7D1F2C 0%, #5a1520 60%, #3d0f16 100%)'
        : 'linear-gradient(135deg, #1e3a8a 0%, #1e2f6b 60%, #14224d 100%)' }}>
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <Icone size={20} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-white leading-tight truncate">{rua ? 'Compras da rua' : `Pedido · ${lista.fornecedor_nome || 'fornecedor'}`}</h1>
              <p className="text-white/70 text-sm truncate">{fmtData(lista.data)} · {lista.numero}</p>
            </div>
            <a href={linkCompartilhar} target="_blank" rel="noopener noreferrer"
              className="flex-shrink-0 flex items-center justify-center w-10 h-10 rounded-xl text-white hover:bg-white/20" title="Compartilhar"
              style={{ background: 'rgba(255,255,255,0.15)' }}>
              <Share2 size={16} />
            </a>
          </div>

          {!rua && (
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <a href={linkPedido} target="_blank" rel="noopener noreferrer"
                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700">
                <MessageCircle size={15} /> Enviar pedido no WhatsApp
              </a>
              {lista.fornecedor_tel && (
                <a href={`tel:${lista.fornecedor_tel.replace(/\s/g, '')}`} className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-white/90 hover:bg-white/20" style={{ background: 'rgba(255,255,255,0.12)' }}>
                  <Phone size={14} /> {lista.fornecedor_tel}
                </a>
              )}
            </div>
          )}

          <div className="flex items-center gap-3">
            <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <div className="h-full bg-green-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-white font-semibold text-sm min-w-[60px] text-right">{totalComprados}/{itens.length}</span>
          </div>

          {lista.status === 'concluida' && (
            <div className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/30 w-fit">
              <CheckCircle2 size={14} className="text-green-400" />
              <span className="text-green-300 text-xs font-medium">Lista terminada{lista.concluido_em ? ` em ${new Date(lista.concluido_em).toLocaleString('pt-BR')}` : ''}</span>
            </div>
          )}
          {lista.status === 'cancelada' && (
            <div className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/30 w-fit">
              <XCircle size={14} className="text-red-300" />
              <span className="text-red-200 text-xs font-medium">Lista cancelada</span>
            </div>
          )}
        </div>
      </div>

      {/* Rua: onde você está */}
      {rua && aberta && (
        <div className="sticky top-0 z-20" style={{ background: '#0b1019', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="max-w-2xl mx-auto px-4 py-2.5">
            <div className="flex items-center gap-2 mb-2">
              <MapPin size={14} className={loja ? 'text-green-400' : 'text-orange-400'} />
              <p className="text-xs font-semibold uppercase tracking-wide text-white/60">
                {loja ? <>Você está em <span className="text-white">{loja.nome}</span></> : 'Onde você está? Toque na loja'}
              </p>
            </div>
              <div className="space-y-2">
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                  {(loja && !lojasTop.some(l => l.nome === loja.nome) ? [loja, ...lojasTop] : lojasTop).map(l => (
                    <button key={l.id ?? l.nome} onClick={() => escolherLoja(l)}
                      className={`flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold border ${loja?.nome === l.nome ? 'bg-green-600 border-green-500 text-white' : 'bg-white/5 border-white/10 text-white/90 active:bg-white/10'}`}>
                      {l.nome}
                    </button>
                  ))}
                  <button onClick={() => setBuscaLoja(' ')}
                    className="flex-shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold border bg-white/5 border-white/10 text-white/70 flex items-center gap-1.5">
                    <Search size={14} /> Outra
                  </button>
                </div>
                {buscaLoja !== '' && (
                  <div className="rounded-xl p-2" style={{ background: '#101520', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <div className="flex items-center gap-2">
                      <input autoFocus value={buscaLoja.trimStart()} onChange={e => setBuscaLoja(e.target.value || ' ')} placeholder="Nome da loja..."
                        className="flex-1 px-3 py-2 text-sm rounded-lg bg-[#0c1018] border border-white/10 text-white placeholder:text-white/30 focus:outline-none" />
                      <button onClick={() => setBuscaLoja('')} className="text-white/40 p-2"><X size={16} /></button>
                    </div>
                    <div className="max-h-48 overflow-y-auto mt-2 divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                      {lojasFiltradas.map(l => (
                        <button key={l.id ?? l.nome} onClick={() => escolherLoja(l)} className="w-full text-left px-2 py-2.5 text-sm text-white/90 active:bg-white/10">{l.nome}</button>
                      ))}
                      {buscaLoja.trim() && !lojas.some(l => l.nome.toLowerCase() === buscaLoja.trim().toLowerCase()) && (
                        <button onClick={() => escolherLoja({ id: null, nome: buscaLoja.trim(), usos: 0 })}
                          className="w-full text-left px-2 py-2.5 text-sm text-green-300 active:bg-white/10">
                          Usar "{buscaLoja.trim()}"
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
          </div>
        </div>
      )}

      {/* Itens por categoria */}
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {erro && (
          <div className="flex items-center gap-2 text-sm text-red-300 px-1">
            <span className="flex-1">{erro}</span>
            <button onClick={() => setErro('')} className="text-white/40"><X size={14} /></button>
          </div>
        )}

        {agruparPorCategoria(itens).map(([categoria, lista2]) => (
          <div key={categoria} className="rounded-2xl overflow-hidden" style={{ background: '#101520', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/50 bg-white/[0.04] flex items-center justify-between">
              <span>{categoria}</span>
              <span className="font-normal normal-case text-white/40">{lista2.filter(i => i.comprado).length}/{lista2.length}</span>
            </div>
            <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              {lista2.map(item => {
                const resolvido = item.comprado || item.nao_encontrado;
                return (
                  <button key={item.id}
                    onClick={() => (rua ? abrirItem(item) : toggleSimples(item))}
                    disabled={!aberta || salvando === item.id}
                    className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-all active:scale-[0.99] ${resolvido ? 'opacity-70' : ''} ${salvando === item.id ? 'opacity-40' : ''}`}
                    style={item.comprado ? { background: 'rgba(34,197,94,0.06)' } : item.nao_encontrado ? { background: 'rgba(249,115,22,0.06)' } : undefined}>
                    <div className="flex-shrink-0 mt-0.5">
                      {item.comprado ? <CheckCircle2 size={26} className="text-green-400" />
                        : item.nao_encontrado ? <Ban size={26} className="text-orange-400" />
                        : <Circle size={26} className="text-white/25" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-base font-semibold ${item.comprado ? 'line-through text-white/60' : 'text-white/90'}`}>{item.nome.trim()}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <span className="text-lg font-bold text-white">{fmtQtd(item.quantidade_comprada ?? item.quantidade)} <span className="text-xs font-normal text-white/50">{item.um}</span></span>
                        {item.comprado && item.loja_nome && <span className="text-xs px-1.5 py-0.5 rounded border bg-green-500/15 text-green-300 border-green-500/30">{item.loja_nome}</span>}
                        {item.comprado && item.preco_pago != null && <span className="text-xs text-white/70">{fmtMoeda(item.preco_pago)}/{item.um} · {fmtMoeda(item.valor_pago ?? 0)}</span>}
                        {item.comprado && item.preco_pago == null && <span className="text-xs text-orange-300">sem preço</span>}
                        {item.nao_encontrado && !item.comprado && <span className="text-xs text-orange-300 font-medium">não achou</span>}
                        {!resolvido && item.loja && <span className="text-xs px-1.5 py-0.5 rounded border bg-orange-500/15 text-orange-300 border-orange-500/30">sugestão: {item.loja}</span>}
                        {item.observacao && <span className="text-xs text-white/50">{item.observacao}</span>}
                      </div>
                    </div>
                    {!resolvido && item.preco > 0 && (
                      <span className="text-xs text-white/40 tabular-nums flex-shrink-0 mt-1" title="Preço normal">~{fmtMoeda(item.preco)}/{item.um}</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        {itens.length === 0 && (
          <div className="text-center py-16 text-white/30">
            <Package size={32} className="mx-auto mb-3 opacity-40" />
            <p>Nenhum item nesta lista</p>
          </div>
        )}

        {itens.length > 0 && (
          <div className="rounded-2xl px-4 py-3 space-y-2" style={{ background: '#101520', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className="text-xs text-white/50">{rua ? 'Gasto até agora' : 'Estimado'}</p>
                <p className="text-xl font-bold text-white">{fmtMoeda(rua ? totalPago : totalEstimado)}</p>
                {rua && <p className="text-xs text-white/50">estimado {fmtMoeda(totalEstimado)}{semPreco > 0 ? ` · ${semPreco} sem preço` : ''}{totalNao > 0 ? ` · ${totalNao} não achou` : ''}{aberta && itens.length - totalComprados > 0 ? ` · faltam ${itens.length - totalComprados}` : ''}</p>}
              </div>
              {aberta && (
                <button onClick={terminar} disabled={concluindo}
                  className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50">
                  <CheckCircle2 size={15} /> {concluindo ? 'Terminando...' : (rua ? 'Terminei as compras' : 'Concluir')}
                </button>
              )}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-white/50 py-4 flex items-center justify-center gap-1.5">
          <ShoppingCart size={12} /> Gerada em {new Date(lista.criado_em).toLocaleString('pt-BR')}{aberta && rua ? ' · toque no item quando pegar' : ''}
        </p>
      </div>

      {/* Rua: painel do item */}
      {rua && aberto && (
        <div className="fixed inset-0 z-30 flex items-end" onClick={fechar}>
          <div className="absolute inset-0 bg-black/60" />
          <div className="relative w-full max-w-2xl mx-auto rounded-t-3xl px-4 pt-4 pb-6 space-y-4" style={{ background: '#111827', borderTop: '1px solid rgba(255,255,255,0.1)' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-lg font-bold text-white leading-tight">{aberto.nome.trim()}</p>
                <p className="text-xs text-white/50 mt-0.5">
                  pedido: {fmtQtd(aberto.quantidade)} {aberto.um}{aberto.preco > 0 ? ` · normal ~${fmtMoeda(aberto.preco)}/${aberto.um}` : ''}
                </p>
              </div>
              <button onClick={fechar} className="text-white/40 p-1"><X size={20} /></button>
            </div>

            {/* Loja */}
            {loja ? (
              <p className="text-sm text-white/70 flex items-center gap-1.5"><MapPin size={14} className="text-green-400" /> {loja.nome}</p>
            ) : (
              <div className="rounded-xl px-3 py-2 text-sm text-orange-200 bg-orange-500/10 border border-orange-500/30">
                Escolha a loja lá em cima antes de marcar.
              </div>
            )}

            {/* Quantidade + preço */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-xs text-white/50 mb-1">Quantidade ({aberto.um})</p>
                {ehFracionado(aberto.um) ? (
                  <input inputMode="decimal" value={qtd} onChange={e => setQtd(e.target.value)}
                    className="w-full text-center text-2xl font-bold px-2 py-2 rounded-xl bg-[#0c1018] border border-white/10 text-white focus:outline-none focus:ring-2 focus:ring-green-500/40" />
                ) : (
                  <div className="flex items-center gap-1">
                    <button onClick={() => setQtd(String(Math.max(0, (parseInt(qtd) || 0) - 1)))} className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white active:bg-white/10"><Minus size={18} /></button>
                    <input inputMode="numeric" value={qtd} onChange={e => setQtd(e.target.value.replace(/\D/g, ''))}
                      className="flex-1 min-w-0 text-center text-2xl font-bold px-1 py-2 rounded-xl bg-[#0c1018] border border-white/10 text-white focus:outline-none" />
                    <button onClick={() => setQtd(String((parseInt(qtd) || 0) + 1))} className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white active:bg-white/10"><Plus size={18} /></button>
                  </div>
                )}
              </div>
              <div>
                <p className="text-xs text-white/50 mb-1">Preço da etiqueta (R$ por {aberto.um})</p>
                <input ref={precoRef} inputMode="decimal" value={preco} onChange={e => setPreco(e.target.value)}
                  placeholder={aberto.preco > 0 ? String(aberto.preco.toFixed(2)).replace('.', ',') : '0,00'}
                  className={`w-full text-center text-2xl font-bold px-2 py-2 rounded-xl bg-[#0c1018] border text-white placeholder:text-white/20 focus:outline-none focus:ring-2 focus:ring-green-500/40 ${acimaDoNormal ? 'border-orange-500/60' : 'border-white/10'}`} />
              </div>
            </div>
            <div className="flex items-center justify-between text-sm min-h-[20px]">
              <span className="text-white/60">{totalItem != null ? <>Total: <span className="text-white font-semibold">{fmtMoeda(totalItem)}</span></> : <span className="text-white/40">sem preço, tudo bem — marca mesmo assim</span>}</span>
              {acimaDoNormal && <span className="text-orange-300 text-xs">mais caro que o normal</span>}
            </div>

            {/* Ações */}
            <button onClick={comprei} disabled={!loja || salvando === aberto.id}
              className="w-full h-14 rounded-2xl text-lg font-bold text-white bg-green-600 active:bg-green-700 disabled:opacity-40 flex items-center justify-center gap-2">
              <CheckCircle2 size={22} /> Comprei
            </button>
            {aberto.comprado && (
              <button onClick={() => desfazer(aberto)} disabled={salvando === aberto.id}
                className="w-full text-sm text-white/50 flex items-center justify-center gap-1.5 py-1">
                <Undo2 size={14} /> Desfazer marcação
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
