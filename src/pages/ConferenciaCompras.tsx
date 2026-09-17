import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Search, X, Loader2, ClipboardCheck, Check, Trash2, AlertTriangle, Package, Lock } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { fmtQtd, fmtData, ehFracionado } from '../components/inventory/comprasShared';

/**
 * Conferência do estoque no celular (link público, um por dia).
 *
 * Quem confere não vê a planilha de Compras: busca o item pelo nome, vê o
 * que o sistema acha que tem, e anota quanto tem de verdade e quanto
 * comprar. A planilha de Compras puxa essas anotações.
 */

interface Item {
  item_id: string; nome: string; categoria: string | null; um: string; fracionado: boolean;
  saldo: number; ponto: number; sugerida: number; situacao: string;
  encontrado: number | null; comprar: number | null; obs: string | null; anotado_em: string | null;
}

interface Conferencia { id: string; data: string; titulo: string | null; status: string }

const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const numOuNull = (v: unknown) => (v === null || v === undefined || v === '' ? null : Number(v));

/** "12,5" → 12.5 ; vazio/inválido → null */
function parseNum(s: string): number | null {
  const n = parseFloat(s.trim().replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
const paraTexto = (n: number | null, fracionado: boolean) =>
  n === null ? '' : fracionado ? String(n).replace('.', ',') : String(Math.round(n));

/** busca sem acento e sem caixa */
const limpar = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

function normalizar(raw: Record<string, unknown>): { conferencia: Conferencia; itens: Item[] } {
  const c = (raw.conferencia || {}) as Record<string, unknown>;
  const itens = (Array.isArray(raw.itens) ? (raw.itens as Record<string, unknown>[]) : []).map(i => ({
    item_id: String(i.item_id), nome: String(i.nome ?? '').trim(), categoria: (i.categoria as string | null) ?? null,
    um: String(i.um ?? ''), fracionado: Boolean(i.fracionado) || ehFracionado(String(i.um ?? '')),
    saldo: num(i.saldo), ponto: num(i.ponto), sugerida: num(i.sugerida), situacao: String(i.situacao ?? 'ok'),
    encontrado: numOuNull(i.encontrado), comprar: numOuNull(i.comprar), obs: (i.obs as string | null) ?? null,
    anotado_em: (i.anotado_em as string | null) ?? null,
  }));
  return {
    conferencia: { id: String(c.id), data: String(c.data ?? ''), titulo: (c.titulo as string | null) ?? null, status: String(c.status ?? 'aberta') },
    itens,
  };
}

export default function ConferenciaCompras() {
  const { id } = useParams<{ id: string }>();
  const [conf, setConf] = useState<Conferencia | null>(null);
  const [itens, setItens] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<Item | null>(null);
  const [tem, setTem] = useState('');
  const [comprar, setComprar] = useState('');
  const [obs, setObs] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [ok, setOk] = useState<string | null>(null);
  const buscaRef = useRef<HTMLInputElement>(null);
  const temRef = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    if (!id) return;
    setLoading(true); setErro('');
    try {
      const { data, error } = await supabase.rpc('fn_conferencia_publica', { p_id: id });
      if (error) throw error;
      if (!data) { setErro('Conferência não encontrada.'); return; }
      const n = normalizar(data as Record<string, unknown>);
      setConf(n.conferencia); setItens(n.itens);
    } catch {
      setErro('Erro ao carregar. Tente novamente.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { carregar(); }, [carregar]);
  useEffect(() => { if (aberto) setTimeout(() => temRef.current?.focus(), 80); }, [aberto]);
  useEffect(() => {
    if (!ok) return;
    const t = setTimeout(() => setOk(null), 1800);
    return () => clearTimeout(t);
  }, [ok]);

  const aberta = conf?.status === 'aberta';

  const resultados = useMemo(() => {
    const q = limpar(busca);
    if (q.length < 2) return [];
    const termos = q.split(/\s+/).filter(Boolean);
    return itens
      .filter(it => {
        const alvo = limpar(`${it.nome} ${it.categoria ?? ''}`);
        return termos.every(t => alvo.includes(t));
      })
      .sort((a, b) => {
        const an = limpar(a.nome).startsWith(q) ? 0 : 1;
        const bn = limpar(b.nome).startsWith(q) ? 0 : 1;
        return an - bn || a.nome.localeCompare(b.nome, 'pt-BR');
      })
      .slice(0, 30);
  }, [itens, busca]);

  const anotados = useMemo(() => itens
    .filter(it => it.anotado_em)
    .sort((a, b) => (b.anotado_em ?? '').localeCompare(a.anotado_em ?? '')), [itens]);

  const abrir = (it: Item) => {
    if (!aberta) return;
    setAberto(it);
    setTem(paraTexto(it.encontrado, it.fracionado));
    setComprar(paraTexto(it.comprar ?? (it.encontrado === null ? (it.sugerida > 0 ? it.sugerida : null) : null), it.fracionado));
    setObs(it.obs ?? '');
  };
  const fechar = () => { setAberto(null); setTem(''); setComprar(''); setObs(''); };

  // Digitou quanto tem → sugere comprar o que falta para o ponto.
  const aoMudarTem = (v: string) => {
    setTem(v);
    if (!aberto) return;
    const n = parseNum(v);
    if (n === null || aberto.ponto <= 0) return;
    const falta = Math.max(0, aberto.ponto - n);
    setComprar(paraTexto(aberto.fracionado ? Number(falta.toFixed(2)) : Math.ceil(falta), aberto.fracionado));
  };

  const salvar = async () => {
    if (!aberto || !id) return;
    const encontrado = parseNum(tem);
    const qtdComprar = parseNum(comprar);
    if (encontrado === null && qtdComprar === null && !obs.trim()) { setErro('Anote quanto tem ou quanto comprar.'); return; }
    setSalvando(true); setErro('');
    try {
      const { error } = await supabase.rpc('fn_conferencia_anotar', {
        p_id: id, p_item_id: aberto.item_id, p_encontrado: encontrado, p_comprar: qtdComprar, p_obs: obs.trim() || null,
      });
      if (error) throw error;
      const agora = new Date().toISOString();
      setItens(prev => prev.map(i => (i.item_id === aberto.item_id
        ? { ...i, encontrado, comprar: qtdComprar, obs: obs.trim() || null, anotado_em: agora } : i)));
      setOk(aberto.nome);
      fechar(); setBusca('');
      setTimeout(() => buscaRef.current?.focus(), 50);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Não deu para salvar. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  };

  const apagar = async () => {
    if (!aberto || !id) return;
    setSalvando(true); setErro('');
    try {
      const { error } = await supabase.rpc('fn_conferencia_apagar', { p_id: id, p_item_id: aberto.item_id });
      if (error) throw error;
      setItens(prev => prev.map(i => (i.item_id === aberto.item_id ? { ...i, encontrado: null, comprar: null, obs: null, anotado_em: null } : i)));
      fechar();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Não deu para apagar. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  };

  // ── Render ──
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0c1018] text-white flex items-center justify-center">
        <div className="text-center text-white/50"><Loader2 size={28} className="animate-spin mx-auto mb-3" /><p>Carregando...</p></div>
      </div>
    );
  }
  if (!conf) {
    return (
      <div className="min-h-screen bg-[#0c1018] text-white flex items-center justify-center p-6">
        <div className="text-center text-white/60"><AlertTriangle size={32} className="mx-auto mb-3 text-red-400" /><p>{erro || 'Conferência não encontrada.'}</p></div>
      </div>
    );
  }

  const linhaAnotacao = (it: Item) => [
    it.encontrado !== null ? `tem ${fmtQtd(it.encontrado)} ${it.um}` : '',
    it.comprar !== null ? `comprar ${fmtQtd(it.comprar)} ${it.um}` : '',
    it.obs ? `“${it.obs}”` : '',
  ].filter(Boolean).join(' · ');

  return (
    <div className="min-h-screen bg-[#0c1018] text-white pb-28">
      {/* Cabeçalho + busca fixos */}
      <div className="sticky top-0 z-20 bg-[#0c1018]/95 backdrop-blur border-b border-white/10 px-4 pt-4 pb-3 space-y-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-wine rounded-xl flex items-center justify-center flex-shrink-0">
            <ClipboardCheck size={20} />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-bold leading-tight truncate">{conf.titulo || 'Conferência do estoque'}</h1>
            <p className="text-xs text-white/50">{fmtData(conf.data)} · {anotados.length} {anotados.length === 1 ? 'item anotado' : 'itens anotados'}</p>
          </div>
        </div>
        {aberta ? (
          <div className="relative">
            <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/40" />
            <input ref={buscaRef} value={busca} onChange={e => setBusca(e.target.value)} autoFocus
              placeholder="Digite o nome do item..." inputMode="search" autoComplete="off" autoCorrect="off" autoCapitalize="off"
              className="w-full pl-11 pr-11 py-3.5 text-base rounded-2xl bg-[#12141f] border border-white/15 placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-wine/40" />
            {busca && (
              <button onClick={() => { setBusca(''); buscaRef.current?.focus(); }} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-white/40">
                <X size={18} />
              </button>
            )}
          </div>
        ) : (
          <div className="rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white/60 flex items-center gap-2">
            <Lock size={14} /> Conferência fechada. As anotações já foram para a lista de compras.
          </div>
        )}
      </div>

      {erro && (
        <div className="mx-4 mt-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm px-3 py-2 flex items-center gap-2">
          <AlertTriangle size={14} /> <span className="flex-1">{erro}</span>
          <button onClick={() => setErro('')} className="text-red-300/60"><X size={14} /></button>
        </div>
      )}
      {ok && (
        <div className="mx-4 mt-3 rounded-xl bg-green-500/10 border border-green-500/30 text-green-300 text-sm px-3 py-2 flex items-center gap-2">
          <Check size={14} /> {ok} anotado.
        </div>
      )}

      {/* Resultados da busca */}
      <div className="px-4 mt-3">
        {busca.trim().length >= 2 && (
          resultados.length === 0 ? (
            <p className="text-center text-white/40 py-8 text-sm">Nenhum item com “{busca}”.</p>
          ) : (
            <div className="rounded-2xl bg-[#12141f] border border-white/10 divide-y divide-white/5 overflow-hidden">
              {resultados.map(it => (
                <button key={it.item_id} onClick={() => abrir(it)} className="w-full text-left px-4 py-3 active:bg-white/5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium leading-tight">{it.nome}</p>
                      <p className="text-xs text-white/40 mt-0.5">{it.categoria || 'Sem categoria'} · sistema: {fmtQtd(it.saldo)} {it.um}{it.ponto > 0 ? ` · ponto ${fmtQtd(it.ponto)}` : ''}</p>
                      {it.anotado_em && <p className="text-xs text-green-300 mt-0.5">✓ {linhaAnotacao(it)}</p>}
                    </div>
                    {it.situacao === 'zerado' && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-red-500/15 text-red-300 border border-red-500/30 flex-shrink-0">zerado</span>}
                    {it.situacao === 'comprar' && <span className="text-[10px] px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 flex-shrink-0">abaixo</span>}
                  </div>
                </button>
              ))}
            </div>
          )
        )}
        {busca.trim().length > 0 && busca.trim().length < 2 && (
          <p className="text-center text-white/30 py-6 text-sm">Digite pelo menos 2 letras.</p>
        )}
      </div>

      {/* Anotados */}
      {busca.trim().length < 2 && (
        <div className="px-4 mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-white/40 mb-2">Anotados ({anotados.length})</p>
          {anotados.length === 0 ? (
            <div className="text-center text-white/30 py-10">
              <Package size={32} className="mx-auto mb-2 opacity-40" />
              <p className="text-sm">Busque um item acima e anote quanto tem e quanto comprar.</p>
            </div>
          ) : (
            <div className="rounded-2xl bg-[#12141f] border border-white/10 divide-y divide-white/5 overflow-hidden">
              {anotados.map(it => (
                <button key={it.item_id} onClick={() => abrir(it)} disabled={!aberta} className="w-full text-left px-4 py-3 active:bg-white/5 disabled:opacity-80">
                  <p className="font-medium leading-tight">{it.nome}</p>
                  <p className="text-xs text-green-300 mt-0.5">{linhaAnotacao(it)}</p>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Painel do item */}
      {aberto && (
        <div className="fixed inset-0 z-30 flex items-end sm:items-center sm:justify-center bg-black/60" onClick={fechar}>
          <div className="w-full sm:max-w-md bg-[#12141f] rounded-t-3xl sm:rounded-3xl border-t sm:border border-white/10 p-5 space-y-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-lg font-bold leading-tight">{aberto.nome}</h2>
                <p className="text-sm text-white/50 mt-0.5">
                  Sistema: <span className="text-white/80">{fmtQtd(aberto.saldo)} {aberto.um}</span>
                  {aberto.ponto > 0 && <> · ponto de pedido <span className="text-white/80">{fmtQtd(aberto.ponto)}</span></>}
                </p>
              </div>
              <button onClick={fechar} className="p-1 text-white/40"><X size={20} /></button>
            </div>

            <label className="block">
              <span className="text-sm text-white/70">Quanto tem? <span className="text-white/40">({aberto.um})</span></span>
              <input ref={temRef} value={tem} onChange={e => aoMudarTem(e.target.value)} inputMode="decimal" placeholder="0"
                className="mt-1 w-full text-2xl font-bold px-4 py-3 rounded-2xl bg-[#0c1018] border border-white/15 focus:outline-none focus:ring-2 focus:ring-wine/40" />
            </label>
            <label className="block">
              <span className="text-sm text-white/70">Comprar quanto? <span className="text-white/40">({aberto.um})</span></span>
              <input value={comprar} onChange={e => setComprar(e.target.value)} inputMode="decimal" placeholder="0"
                className="mt-1 w-full text-2xl font-bold px-4 py-3 rounded-2xl bg-[#0c1018] border border-amber-500/30 focus:outline-none focus:ring-2 focus:ring-amber-500/40" />
            </label>
            <input value={obs} onChange={e => setObs(e.target.value)} placeholder="Observação (opcional)"
              className="w-full text-sm px-4 py-2.5 rounded-xl bg-[#0c1018] border border-white/10 placeholder:text-white/30 focus:outline-none" />

            <div className="flex items-center gap-2">
              {aberto.anotado_em && (
                <button onClick={apagar} disabled={salvando} className="px-3 py-3 rounded-2xl border border-white/10 text-white/50 active:bg-white/5" title="Apagar anotação">
                  <Trash2 size={18} />
                </button>
              )}
              <button onClick={salvar} disabled={salvando}
                className="flex-1 flex items-center justify-center gap-2 bg-wine active:bg-[#6a1a25] text-white text-lg font-bold py-3.5 rounded-2xl disabled:opacity-50">
                {salvando ? <Loader2 size={20} className="animate-spin" /> : <Check size={20} />} Anotar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
