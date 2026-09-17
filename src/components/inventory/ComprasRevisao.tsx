import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, X, Store, Truck, Ban, Check, AlertTriangle, RefreshCw, ClipboardList } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fmtQtd, fmtData } from './comprasShared';
import { agruparPorCategoria } from './agruparPorCategoria';

/**
 * Aba Revisão (temporária): classificar cada item compravel como
 *   Rua → lista do comprador · Pedido → aba Pedidos (fornecedor escolhido no
 *   dia, por categoria) · Sob demanda → nunca entra sozinho.
 * Marca item a item ou a categoria inteira de uma vez. A sugestão vem do
 * histórico. Segunda seção: pontos de pedido que não giram (zerar/manter).
 */

export type Classe = 'rua' | 'pedido' | 'sob_demanda';

interface ItemRev {
  item_id: string; nome: string; categoria: string | null; um: string; ponto: number; saldo: number; consumo_dia: number;
  classe: Classe | null; compras_180d: number; ultima_compra: string | null;
  ultimo_fornecedor: { nome: string; modalidade: string; compras: number } | null; sugestao: Classe | null;
}
interface SemGiro {
  item_id: string; nome: string; categoria: string | null; um: string; ponto: number; saldo: number;
  compras_180d: number; ultima_compra: string | null; motivo: 'categoria' | 'nunca_comprado' | 'sem_consumo';
}

interface Props { onMudou: () => void }

const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const txt = (v: unknown) => (v === null || v === undefined ? null : String(v));
const classeOk = (v: unknown): Classe | null => (v === 'rua' || v === 'pedido' || v === 'sob_demanda' ? v : null);

export const CLASSE_LABEL: Record<Classe, string> = { rua: 'Rua', pedido: 'Pedido', sob_demanda: 'Sob demanda' };
const CLASSE_COR: Record<Classe, string> = {
  rua: 'bg-orange-500/15 text-orange-300 border-orange-500/40',
  pedido: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
  sob_demanda: 'bg-white/10 text-white/70 border-white/20',
};
const CLASSE_ICONE: Record<Classe, JSX.Element> = { rua: <Store size={11} />, pedido: <Truck size={11} />, sob_demanda: <Ban size={11} /> };
const MOTIVO: Record<SemGiro['motivo'], string> = { categoria: 'utensílio / equipamento', nunca_comprado: 'nunca comprado em 180 dias', sem_consumo: 'sem consumo e sem compra' };

export function ComprasRevisao({ onMudou }: Props) {
  const [itens, setItens] = useState<ItemRev[]>([]);
  const [semGiro, setSemGiro] = useState<SemGiro[]>([]);
  const [totais, setTotais] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [soPendentes, setSoPendentes] = useState(false);
  const [secao, setSecao] = useState<'classe' | 'pontos'>('classe');
  const [ocupado, setOcupado] = useState<string | null>(null);
  /** ponto em edição por item (texto do input) e itens com ponto salvo há pouco */
  const [pontoDraft, setPontoDraft] = useState<Record<string, string>>({});
  const [pontoSalvo, setPontoSalvo] = useState<Set<string>>(new Set());
  const [pontoSalvando, setPontoSalvando] = useState<Set<string>>(new Set());

  const carregar = useCallback(async () => {
    setLoading(true); setErro('');
    try {
      const { data, error } = await supabase.rpc('fn_compras_revisao');
      if (error) throw error;
      const d = (data || {}) as Record<string, unknown>;
      setItens((Array.isArray(d.itens) ? (d.itens as Record<string, unknown>[]) : []).map(p => {
        const uf = p.ultimo_fornecedor && typeof p.ultimo_fornecedor === 'object' ? (p.ultimo_fornecedor as Record<string, unknown>) : null;
        return {
          item_id: String(p.item_id), nome: String(p.nome ?? '').trim(), categoria: txt(p.categoria), um: String(p.um ?? ''),
          ponto: num(p.ponto), saldo: num(p.saldo), consumo_dia: num(p.consumo_dia), classe: classeOk(p.classe),
          compras_180d: num(p.compras_180d), ultima_compra: txt(p.ultima_compra),
          ultimo_fornecedor: uf ? { nome: String(uf.nome ?? ''), modalidade: String(uf.modalidade ?? ''), compras: num(uf.compras) } : null,
          sugestao: classeOk(p.sugestao),
        };
      }));
      setSemGiro((Array.isArray(d.pontos_sem_giro) ? (d.pontos_sem_giro as Record<string, unknown>[]) : []).map(p => ({
        item_id: String(p.item_id), nome: String(p.nome ?? '').trim(), categoria: txt(p.categoria), um: String(p.um ?? ''),
        ponto: num(p.ponto), saldo: num(p.saldo), compras_180d: num(p.compras_180d), ultima_compra: txt(p.ultima_compra),
        motivo: (p.motivo as SemGiro['motivo']) || 'sem_consumo',
      })));
      setTotais(Object.fromEntries(Object.entries((d.totais || {}) as Record<string, unknown>).map(([k, v]) => [k, num(v)])));
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { carregar(); }, [carregar]);

  const buscaLower = busca.trim().toLowerCase();
  const visiveis = useMemo(() => itens.filter(p =>
    (!soPendentes || p.classe === null) && (!buscaLower || p.nome.toLowerCase().includes(buscaLower) || (p.categoria || '').toLowerCase().includes(buscaLower))),
  [itens, soPendentes, buscaLower]);
  const grupos = useMemo(() => agruparPorCategoria(visiveis), [visiveis]);
  const semGiroVis = useMemo(() => semGiro.filter(p => !buscaLower || p.nome.toLowerCase().includes(buscaLower) || (p.categoria || '').toLowerCase().includes(buscaLower)), [semGiro, buscaLower]);

  const aplicarLocal = (ids: Set<string>, classe: Classe) => {
    setItens(prev => prev.map(x => (ids.has(x.item_id) ? { ...x, classe } : x)));
    setTotais(prev => {
      const antes = itens.filter(x => ids.has(x.item_id));
      const t = { ...prev };
      for (const a of antes) {
        if (a.classe === null) t.pendentes = Math.max(0, (t.pendentes ?? 0) - 1); else t[a.classe] = Math.max(0, (t[a.classe] ?? 0) - 1);
        t[classe] = (t[classe] ?? 0) + 1;
      }
      return t;
    });
    onMudou();
  };

  const definir = async (p: ItemRev, classe: Classe) => {
    setOcupado(p.item_id); setErro('');
    try {
      const { error } = await supabase.rpc('fn_compras_classe_definir', { p_item_id: p.item_id, p_classe: classe });
      if (error) throw error;
      aplicarLocal(new Set([p.item_id]), classe);
    } catch (e: unknown) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setOcupado(null); }
  };

  const definirLote = async (lista: ItemRev[], classe: Classe, rotulo: string) => {
    if (lista.length === 0) return;
    if (!window.confirm(`Marcar ${lista.length} ${lista.length === 1 ? 'item' : 'itens'} de "${rotulo}" como ${CLASSE_LABEL[classe]}?`)) return;
    setOcupado(`lote:${rotulo}`); setErro('');
    try {
      const { error } = await supabase.rpc('fn_compras_classe_lote', { p_itens: lista.map(p => ({ item_id: p.item_id, classe })) });
      if (error) throw error;
      aplicarLocal(new Set(lista.map(p => p.item_id)), classe);
    } catch (e: unknown) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setOcupado(null); }
  };

  const aplicarSugestoes = async () => {
    const lista = visiveis.filter(p => p.sugestao && p.classe === null);
    if (lista.length === 0) return;
    if (!window.confirm(`Aplicar a sugestão do histórico em ${lista.length} itens pendentes? Depois dá para trocar um a um.`)) return;
    setOcupado('lote:sugestao'); setErro('');
    try {
      const { error } = await supabase.rpc('fn_compras_classe_lote', { p_itens: lista.map(p => ({ item_id: p.item_id, classe: p.sugestao })) });
      if (error) throw error;
      setItens(prev => prev.map(x => (x.classe === null && x.sugestao && lista.some(l => l.item_id === x.item_id) ? { ...x, classe: x.sugestao } : x)));
      await carregar(); onMudou();
    } catch (e: unknown) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setOcupado(null); }
  };

  const revisarPonto = async (p: SemGiro, acao: 'zerar' | 'manter') => {
    setOcupado(p.item_id); setErro('');
    try {
      const { error } = await supabase.rpc('fn_ponto_revisar', { p_item_id: p.item_id, p_acao: acao });
      if (error) throw error;
      setSemGiro(prev => prev.filter(x => x.item_id !== p.item_id));
      onMudou();
    } catch (e: unknown) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setOcupado(null); }
  };

  const zerarTodos = async () => {
    if (semGiroVis.length === 0 || !window.confirm(`Zerar o ponto de pedido de ${semGiroVis.length} itens? Eles só entram por "Incluir item".`)) return;
    setOcupado('lote:pontos'); setErro('');
    try {
      for (const p of semGiroVis) { const { error } = await supabase.rpc('fn_ponto_revisar', { p_item_id: p.item_id, p_acao: 'zerar' }); if (error) throw error; }
      const ids = new Set(semGiroVis.map(p => p.item_id));
      setSemGiro(prev => prev.filter(x => !ids.has(x.item_id)));
      onMudou();
    } catch (e: unknown) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setOcupado(null); }
  };

  /** Ponto de pedido digitado na lista: salva ao sair do campo (Enter também). */
  const salvarPonto = async (p: ItemRev) => {
    const texto = pontoDraft[p.item_id];
    if (texto === undefined) return;
    const valor = parseFloat(texto.replace(',', '.'));
    if (!Number.isFinite(valor) || valor < 0) { setPontoDraft(prev => { const n = { ...prev }; delete n[p.item_id]; return n; }); return; }
    if (valor === p.ponto) { setPontoDraft(prev => { const n = { ...prev }; delete n[p.item_id]; return n; }); return; }
    setPontoSalvando(prev => new Set(prev).add(p.item_id)); setErro('');
    try {
      const { error } = await supabase.rpc('fn_ponto_revisar', { p_item_id: p.item_id, p_acao: 'definir', p_ponto: valor });
      if (error) throw error;
      setItens(prev => prev.map(x => (x.item_id === p.item_id ? { ...x, ponto: valor } : x)));
      setSemGiro(prev => prev.filter(x => x.item_id !== p.item_id));
      setPontoDraft(prev => { const n = { ...prev }; delete n[p.item_id]; return n; });
      setPontoSalvo(prev => new Set(prev).add(p.item_id));
      setTimeout(() => setPontoSalvo(prev => { const n = new Set(prev); n.delete(p.item_id); return n; }), 2000);
      onMudou();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setPontoSalvando(prev => { const n = new Set(prev); n.delete(p.item_id); return n; });
    }
  };

  const pct = totais.total ? Math.round(((totais.total - (totais.pendentes ?? 0)) / totais.total) * 100) : 0;
  const comSugestao = visiveis.filter(p => p.sugestao && p.classe === null).length;

  const botaoClasse = (p: ItemRev, c: Classe) => (
    <button key={c} onClick={() => definir(p, c)} disabled={ocupado !== null}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border disabled:opacity-50 ${p.classe === c ? CLASSE_COR[c] : 'bg-transparent text-white/50 border-white/10 hover:bg-white/10'} ${p.classe === null && p.sugestao === c ? 'ring-1 ring-teal-400/60' : ''}`}
      title={p.classe === null && p.sugestao === c ? 'sugestão do histórico' : undefined}>
      {ocupado === p.item_id && p.classe !== c ? <Loader2 size={11} className="animate-spin" /> : CLASSE_ICONE[c]} {CLASSE_LABEL[c]}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="bg-[#12141f] rounded-2xl border border-white/10 px-5 py-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-white font-bold flex items-center gap-2"><ClipboardList size={16} /> Revisão do cadastro de compras</h3>
            <p className="text-xs text-white/60 mt-0.5">
              Diga o que cada item é: <span className="text-orange-300">Rua</span> (comprador), <span className="text-blue-300">Pedido</span> (fornecedor escolhido no dia) ou <span className="text-white/80">Sob demanda</span> (nunca entra sozinho). Item a item ou a categoria inteira.
              Na mesma linha, ajuste o <span className="text-white/80">ponto de pedido</span>: digite e saia do campo. Fichas técnicas não entram.
            </p>
          </div>
          <button onClick={carregar} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-xs text-white/60 hover:bg-white/5 disabled:opacity-50">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
        <div>
          <div className="flex items-center justify-between text-xs text-white/60 mb-1">
            <span>{(totais.total ?? 0) - (totais.pendentes ?? 0)} de {totais.total ?? 0} classificados · Rua {totais.rua ?? 0} · Pedido {totais.pedido ?? 0} · Sob demanda {totais.sob_demanda ?? 0}</span>
            <span className={pct === 100 ? 'text-green-300' : 'text-amber-300'}>{pct}%{(totais.pendentes_com_ponto ?? 0) > 0 ? ` · ${totais.pendentes_com_ponto} pendentes têm ponto de pedido` : ''}</span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden"><div className="h-full bg-gradient-to-r from-wine to-gold rounded-full" style={{ width: `${pct}%` }} /></div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setSecao('classe')} className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${secao === 'classe' ? 'bg-teal-500/20 text-teal-200 border-teal-500/40' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}>
            Classificar itens · {totais.pendentes ?? 0} pendentes
          </button>
          <button onClick={() => setSecao('pontos')} className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${secao === 'pontos' ? 'bg-amber-500/20 text-amber-200 border-amber-500/40' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}>
            Pontos que não giram · {semGiro.length}
          </button>
          {secao === 'classe' && (
            <label className="flex items-center gap-1.5 text-xs text-white/60 cursor-pointer ml-1">
              <input type="checkbox" checked={soPendentes} onChange={e => setSoPendentes(e.target.checked)} className="accent-wine" /> só pendentes
            </label>
          )}
          <div className="relative w-full sm:w-64 ml-auto">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar item ou categoria..."
              className="w-full pl-9 pr-8 py-1.5 text-sm border border-white/10 rounded-xl bg-[#0c1018] text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-wine/30" />
            {busca && <button onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30"><X size={14} /></button>}
          </div>
        </div>
      </div>

      {erro && (
        <div className="rounded-xl p-3 text-sm border bg-red-500/10 border-red-500/30 text-red-400 flex items-center gap-2">
          <AlertTriangle size={16} /> <span className="flex-1">{erro}</span><button onClick={() => setErro('')} className="text-red-300/60"><X size={14} /></button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-white/30"><Loader2 size={24} className="animate-spin mx-auto mb-3" /><p>Carregando...</p></div>
      ) : secao === 'classe' ? (
        <div className="bg-[#12141f] rounded-2xl border border-white/10">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-white/70"><span className="text-white font-semibold">{visiveis.length}</span> itens{soPendentes ? ' pendentes' : ''}. O botão com contorno verde é a sugestão do histórico. Ponto zero = não entra na lista automática.</p>
            {comSugestao > 0 && (
              <button onClick={aplicarSugestoes} disabled={ocupado !== null} className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold px-3 py-2 rounded-xl disabled:opacity-50">
                {ocupado === 'lote:sugestao' ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Aplicar as {comSugestao} sugestões
              </button>
            )}
          </div>
          {visiveis.length === 0 ? (
            <p className="text-center text-white/40 py-10 text-sm">{soPendentes ? 'Nenhum item pendente. Revisão concluída.' : 'Nenhum item.'}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0c1018] text-white/50 text-xs">
                    <th className="px-3 py-2 text-left font-medium">Item</th>
                    <th className="px-3 py-2 text-right font-medium w-20">Central</th>
                    <th className="px-3 py-2 text-right font-medium w-32">Ponto de pedido</th>
                    <th className="px-3 py-2 text-left font-medium w-52">Histórico (180 dias)</th>
                    <th className="px-3 py-2 text-left font-medium w-80">Classe</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {grupos.flatMap(([categoria, lista]) => [
                    <tr key={`cat:${categoria}`} className="bg-white/[0.05]">
                      <td colSpan={4} className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-white/60">
                        {categoria} <span className="normal-case font-normal text-white/30">· {lista.length}</span>
                      </td>
                      <td className="px-3 py-1">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-[10px] text-white/40 mr-1">categoria toda:</span>
                          {(['rua', 'pedido', 'sob_demanda'] as Classe[]).map(c => (
                            <button key={c} onClick={() => definirLote(lista, c, categoria)} disabled={ocupado !== null}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border border-white/15 text-white/60 hover:bg-white/10 disabled:opacity-50">
                              {ocupado === `lote:${categoria}` ? <Loader2 size={10} className="animate-spin" /> : CLASSE_ICONE[c]} {CLASSE_LABEL[c]}
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>,
                    ...lista.map(p => (
                      <tr key={p.item_id} className="hover:bg-white/[0.02]">
                        <td className="px-3 py-1.5"><span className="text-white/90">{p.nome}</span><span className="ml-2 text-caption text-white/40">{p.um}</span></td>
                        <td className="px-3 py-1.5 text-right tabular-nums text-white/50" title="saldo no Estoque Central">{fmtQtd(p.saldo)}</td>
                        <td className="px-3 py-1">
                          <div className="flex items-center justify-end gap-1.5">
                            {pontoSalvando.has(p.item_id) ? <Loader2 size={12} className="animate-spin text-white/40" /> : pontoSalvo.has(p.item_id) ? <Check size={12} className="text-green-400" /> : null}
                            <input type="text" inputMode="decimal"
                              value={pontoDraft[p.item_id] ?? (p.ponto > 0 ? String(p.ponto).replace('.', ',') : '')}
                              placeholder="0"
                              onChange={e => setPontoDraft(prev => ({ ...prev, [p.item_id]: e.target.value }))}
                              onBlur={() => salvarPonto(p)}
                              onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                              onFocus={e => e.target.select()}
                              className={`w-20 text-right text-sm font-bold border rounded-md px-2 py-1 bg-[#0c1018] text-white focus:outline-none focus:ring-2 focus:ring-wine/30 ${p.ponto > 0 ? 'border-white/15' : 'border-white/5 text-white/40'}`} />
                          </div>
                        </td>
                        <td className="px-3 py-1.5 text-xs text-white/50">
                          {p.ultimo_fornecedor
                            ? <>{p.ultimo_fornecedor.modalidade === 'rua' ? '🛒 ' : '🚚 '}{p.ultimo_fornecedor.nome} <span className="text-white/30">· {p.compras_180d}x · {p.ultima_compra ? fmtData(p.ultima_compra) : ''}</span></>
                            : <span className="text-white/30">sem compra em 180 dias{p.consumo_dia > 0 ? ' · tem consumo' : ''}</span>}
                        </td>
                        <td className="px-3 py-1.5"><div className="flex items-center gap-1 flex-wrap">{(['rua', 'pedido', 'sob_demanda'] as Classe[]).map(c => botaoClasse(p, c))}</div></td>
                      </tr>
                    )),
                  ])}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-[#12141f] rounded-2xl border border-white/10">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-white/70"><span className="text-white font-semibold">{semGiroVis.length}</span> itens com ponto de pedido que não giram. Zerar tira da lista automática; "Manter" só some daqui.</p>
            {semGiroVis.length > 0 && (
              <button onClick={zerarTodos} disabled={ocupado !== null} className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-3 py-2 rounded-xl disabled:opacity-50">
                {ocupado === 'lote:pontos' ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />} Zerar os {semGiroVis.length} listados
              </button>
            )}
          </div>
          {semGiroVis.length === 0 ? <p className="text-center text-white/40 py-10 text-sm">Nenhum ponto parado para revisar.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0c1018] text-white/50 text-xs">
                    <th className="px-3 py-2 text-left font-medium">Item</th>
                    <th className="px-3 py-2 text-right font-medium w-16">Ponto</th>
                    <th className="px-3 py-2 text-right font-medium w-20">Central</th>
                    <th className="px-3 py-2 text-left font-medium w-40">Última compra</th>
                    <th className="px-3 py-2 text-left font-medium w-44">Por quê</th>
                    <th className="px-3 py-2 text-left font-medium w-48">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {semGiroVis.map(p => (
                    <tr key={p.item_id} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-1.5"><span className="text-white/90">{p.nome}</span><span className="ml-2 text-caption text-white/40">{p.categoria || 'Sem categoria'} · {p.um}</span></td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-white/80">{fmtQtd(p.ponto)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-white/60">{fmtQtd(p.saldo)}</td>
                      <td className="px-3 py-1.5 text-xs text-white/60">{p.ultima_compra ? `${fmtData(p.ultima_compra)} · ${p.compras_180d}x` : 'nenhuma em 180 dias'}</td>
                      <td className="px-3 py-1.5 text-xs text-amber-300/80">{MOTIVO[p.motivo]}</td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1">
                          <button onClick={() => revisarPonto(p, 'zerar')} disabled={ocupado !== null} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20 disabled:opacity-50">
                            {ocupado === p.item_id ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />} Zerar ponto
                          </button>
                          <button onClick={() => revisarPonto(p, 'manter')} disabled={ocupado !== null} className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border border-white/15 text-white/60 hover:bg-white/10 disabled:opacity-50"><Check size={11} /> Manter</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
