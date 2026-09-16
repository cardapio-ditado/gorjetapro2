import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Circle, ShoppingCart, RefreshCw, Package, Share2, Store, Truck, Phone, MessageCircle, XCircle } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { agruparPorCategoria } from '../components/inventory/agruparPorCategoria';
import { fmtQtd, fmtMoeda, fmtData, urlWhatsApp, textoListaRua, textoPedidoFornecedor } from '../components/inventory/comprasShared';

/**
 * Link público de uma lista de compras — uma lista por link.
 * Rua: o comprador abre no celular e vai marcando. Fornecedor: é o pedido,
 * com botão para mandar o texto no WhatsApp do fornecedor.
 */

interface Lista {
  lista_id: string; numero: string; titulo: string;
  tipo: 'rua' | 'fornecedor'; status: string;
  fornecedor_nome: string | null; fornecedor_tel: string | null;
  data: string; itens: number; comprados: number; valor: number;
  observacoes: string | null; criado_em: string; concluido_em: string | null;
}

interface Item {
  id: string; item_id: string; nome: string; categoria: string | null; um: string;
  quantidade: number; preco: number; estimado: number;
  comprado: boolean; comprado_em: string | null; observacao: string | null; loja: string | null;
}

const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));

function normalizar(raw: Record<string, unknown>): { lista: Lista; itens: Item[] } {
  const l = (raw.lista || {}) as Record<string, unknown>;
  const itens = (Array.isArray(raw.itens) ? (raw.itens as Record<string, unknown>[]) : []).map(i => ({
    id: String(i.id), item_id: String(i.item_id), nome: String(i.nome ?? ''), categoria: (i.categoria as string | null) ?? null,
    um: String(i.um ?? ''), quantidade: num(i.quantidade), preco: num(i.preco), estimado: num(i.estimado),
    comprado: Boolean(i.comprado), comprado_em: (i.comprado_em as string | null) ?? null,
    observacao: (i.observacao as string | null) ?? null, loja: (i.loja as string | null) ?? null,
  }));
  return {
    lista: {
      lista_id: String(l.lista_id), numero: String(l.numero ?? ''), titulo: String(l.titulo ?? ''),
      tipo: l.tipo === 'fornecedor' ? 'fornecedor' : 'rua', status: String(l.status ?? ''),
      fornecedor_nome: (l.fornecedor_nome as string | null) ?? null, fornecedor_tel: (l.fornecedor_tel as string | null) ?? null,
      data: String(l.data ?? ''), itens: num(l.itens), comprados: num(l.comprados), valor: num(l.valor),
      observacoes: (l.observacoes as string | null) ?? null, criado_em: String(l.criado_em ?? ''), concluido_em: (l.concluido_em as string | null) ?? null,
    },
    itens,
  };
}

export default function ListaComprasPublica() {
  const { id } = useParams<{ id: string }>();
  const [lista, setLista] = useState<Lista | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState<string | null>(null);
  const [concluindo, setConcluindo] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    setLoading(true); setErro('');
    try {
      const { data, error } = await supabase.rpc('fn_lista_publica', { p_lista_id: id });
      if (error) throw error;
      if (!data) { setErro('Lista não encontrada.'); return; }
      const n = normalizar(data as Record<string, unknown>);
      setLista(n.lista); setItens(n.itens);
    } catch {
      setErro('Erro ao carregar a lista. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);

  const aberta = lista?.status === 'aberta' || lista?.status === 'em_andamento';

  const toggle = async (item: Item) => {
    if (!aberta || salvando) return;
    const novo = !item.comprado;
    setSalvando(item.id);
    setItens(prev => prev.map(i => (i.id === item.id ? { ...i, comprado: novo, comprado_em: novo ? new Date().toISOString() : null } : i)));
    try {
      const { data, error } = await supabase.rpc('fn_lista_publica_marcar', { p_item_id: item.id, p_comprado: novo });
      if (error) throw error;
      const r = (data || {}) as Record<string, unknown>;
      setLista(prev => (prev ? { ...prev, status: String(r.status ?? prev.status), itens: num(r.itens), comprados: num(r.comprados) } : prev));
    } catch {
      // desfaz o otimista e recarrega o estado real
      setItens(prev => prev.map(i => (i.id === item.id ? { ...i, comprado: !novo } : i)));
      carregar();
    } finally {
      setSalvando(null);
    }
  };

  const concluir = async () => {
    if (!lista || !aberta) return;
    const faltam = itens.filter(i => !i.comprado).length;
    if (!window.confirm(faltam > 0 ? `Concluir a lista com ${faltam} ${faltam === 1 ? 'item' : 'itens'} sem marcar?` : 'Concluir a lista?')) return;
    setConcluindo(true);
    try {
      const { error } = await supabase.rpc('fn_lista_publica_concluir', { p_lista_id: lista.lista_id });
      if (error) throw error;
      await carregar();
    } catch {
      setErro('Não foi possível concluir. Tente de novo.');
    } finally {
      setConcluindo(false);
    }
  };

  const urlAtual = typeof window !== 'undefined' ? window.location.href : '';
  const rua = lista?.tipo === 'rua';
  const totalComprados = itens.filter(i => i.comprado).length;
  const pct = itens.length > 0 ? Math.round((totalComprados / itens.length) * 100) : 0;
  const totalEstimado = itens.reduce((s, i) => s + i.estimado, 0);

  const linkCompartilhar = lista ? urlWhatsApp(textoListaRua(lista.titulo, urlAtual)) : '';
  const linkPedido = lista && !rua
    ? urlWhatsApp(textoPedidoFornecedor(lista.fornecedor_nome || 'fornecedor', fmtData(lista.data), itens), lista.fornecedor_tel)
    : '';

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
    <div className="min-h-screen" style={{ background: '#080c14', color: '#e8edf8' }}>
      {/* Cabeçalho */}
      <div style={{ background: rua
        ? 'linear-gradient(135deg, #7D1F2C 0%, #5a1520 60%, #3d0f16 100%)'
        : 'linear-gradient(135deg, #1e3a8a 0%, #1e2f6b 60%, #14224d 100%)' }}>
        <div className="max-w-2xl mx-auto px-4 py-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <Icone size={20} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-white leading-tight truncate">{rua ? 'Compras da rua' : `Pedido · ${lista.fornecedor_nome || 'fornecedor'}`}</h1>
              <p className="text-white/70 text-sm truncate">{fmtData(lista.data)} · {lista.numero}</p>
            </div>
            <a href={linkCompartilhar} target="_blank" rel="noopener noreferrer"
              className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium text-white hover:bg-white/20"
              style={{ background: 'rgba(255,255,255,0.15)' }}>
              <Share2 size={15} /> Compartilhar
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
              <span className="text-green-300 text-xs font-medium">Lista concluída{lista.concluido_em ? ` em ${new Date(lista.concluido_em).toLocaleString('pt-BR')}` : ''}</span>
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

      {/* Itens por categoria */}
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {erro && <p className="text-sm text-red-300 px-1">{erro}</p>}

        {agruparPorCategoria(itens).map(([categoria, lista2]) => (
          <div key={categoria} className="rounded-2xl overflow-hidden" style={{ background: '#101520', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/50 bg-white/[0.04] flex items-center justify-between">
              <span>{categoria}</span>
              <span className="font-normal normal-case text-white/40">{lista2.filter(i => i.comprado).length}/{lista2.length}</span>
            </div>
            <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
              {lista2.map(item => (
                <button key={item.id} onClick={() => toggle(item)} disabled={!aberta || salvando === item.id}
                  className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-all active:scale-[0.99] ${item.comprado ? 'opacity-60' : ''} ${salvando === item.id ? 'opacity-40' : ''}`}
                  style={item.comprado ? { background: 'rgba(34,197,94,0.06)' } : undefined}>
                  <div className="flex-shrink-0 mt-0.5">
                    {item.comprado ? <CheckCircle2 size={24} className="text-green-400" /> : <Circle size={24} className="text-white/25" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${item.comprado ? 'line-through text-white/60' : 'text-white/90'}`}>{item.nome.trim()}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <span className="text-base font-bold text-white">{fmtQtd(item.quantidade)} <span className="text-xs font-normal text-white/50">{item.um}</span></span>
                      {item.loja && <span className="text-caption px-1.5 py-0.5 rounded border bg-orange-500/15 text-orange-300 border-orange-500/30">{item.loja}</span>}
                      {item.observacao && <span className="text-xs text-white/50">{item.observacao}</span>}
                    </div>
                  </div>
                  {item.estimado > 0 && (
                    <span className="text-xs text-white/40 tabular-nums flex-shrink-0 mt-1" title="Estimado pela média de preço">~{fmtMoeda(item.estimado)}</span>
                  )}
                </button>
              ))}
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
          <div className="rounded-2xl px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ background: '#101520', border: '1px solid rgba(255,255,255,0.08)' }}>
            <div>
              <p className="text-xs text-white/50">Gasto estimado (média de preço)</p>
              <p className="text-lg font-bold text-white">{fmtMoeda(totalEstimado)}</p>
            </div>
            {aberta && (
              <button onClick={concluir} disabled={concluindo}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white bg-green-600 hover:bg-green-700 disabled:opacity-50">
                <CheckCircle2 size={15} /> {concluindo ? 'Concluindo...' : 'Concluir lista'}
              </button>
            )}
          </div>
        )}

        <p className="text-center text-xs text-white/50 py-4 flex items-center justify-center gap-1.5">
          <ShoppingCart size={12} /> Gerada em {new Date(lista.criado_em).toLocaleString('pt-BR')}{aberta ? ' · toque no item para marcar como comprado' : ''}
        </p>
      </div>
    </div>
  );
}
