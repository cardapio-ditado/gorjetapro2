import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Search, X, Store, Truck, Check, AlertTriangle, Ban, ShieldCheck, RefreshCw } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { SearchableSelect } from '../common/SearchableSelect';
import { fmtQtd, fmtData } from './comprasShared';

/**
 * Configurar compras: duas revisões que o gestor faz uma vez.
 *
 * 1. "Como compra": para onde cada item vai (Rua ou um fornecedor). Vem
 *    sugerido pelo histórico; o gestor confirma, troca ou define em lote.
 * 2. "Pontos que não giram": itens com ponto de pedido que nunca são
 *    comprados (copo, embalagem, vinho parado). O gestor zera ou mantém.
 *    O sistema não mexe em ponto nenhum sozinho.
 */

type Via = 'rua' | 'fornecedor';

interface Sugestao { via: Via; fornecedor_id: string; nome: string; modalidade: 'rua' | 'entrega'; compras: number }

interface Pendente {
  item_id: string; nome: string; categoria: string | null; um: string; ponto: number;
  via: Via | null; fornecedor_id: string | null; fornecedor_nome: string | null; fornecedor_modalidade: string | null;
  sugestao: Sugestao | null;
}

interface SemGiro {
  item_id: string; nome: string; categoria: string | null; um: string; ponto: number; saldo: number;
  consumo_dia: number; compras_180d: number; ultima_compra: string | null; motivo: 'categoria' | 'nunca_comprado' | 'sem_consumo';
}

interface Fornecedor { id: string; nome: string; modalidade: 'rua' | 'entrega' }

interface Props {
  fornecedores: Fornecedor[];
  /** chamado depois de qualquer alteração, para a tela de Compras recarregar */
  onMudou: () => void;
}

const num = (v: unknown) => (v === null || v === undefined || v === '' ? 0 : Number(v));
const txt = (v: unknown) => (v === null || v === undefined ? null : String(v));
const MOTIVO: Record<SemGiro['motivo'], string> = {
  categoria: 'utensílio / equipamento', nunca_comprado: 'nunca comprado em 180 dias', sem_consumo: 'sem consumo e sem compra',
};

export function ComprasConfigurar({ fornecedores, onMudou }: Props) {
  const [pendentes, setPendentes] = useState<Pendente[]>([]);
  const [semGiro, setSemGiro] = useState<SemGiro[]>([]);
  const [totais, setTotais] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [busca, setBusca] = useState('');
  const [soComPonto, setSoComPonto] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [outro, setOutro] = useState<string | null>(null);
  const [secao, setSecao] = useState<'via' | 'pontos'>('via');

  const carregar = useCallback(async () => {
    setLoading(true); setErro('');
    try {
      const { data, error } = await supabase.rpc('fn_compras_config');
      if (error) throw error;
      const d = (data || {}) as Record<string, unknown>;
      setPendentes((Array.isArray(d.pendentes_via) ? (d.pendentes_via as Record<string, unknown>[]) : []).map(p => {
        const s = p.sugestao && typeof p.sugestao === 'object' ? (p.sugestao as Record<string, unknown>) : null;
        return {
          item_id: String(p.item_id), nome: String(p.nome ?? '').trim(), categoria: txt(p.categoria), um: String(p.um ?? ''), ponto: num(p.ponto),
          via: p.via === 'rua' || p.via === 'fornecedor' ? p.via : null,
          fornecedor_id: txt(p.fornecedor_id), fornecedor_nome: txt(p.fornecedor_nome), fornecedor_modalidade: txt(p.fornecedor_modalidade),
          sugestao: s ? { via: s.via === 'rua' ? 'rua' : 'fornecedor', fornecedor_id: String(s.fornecedor_id), nome: String(s.nome ?? ''), modalidade: s.modalidade === 'rua' ? 'rua' : 'entrega', compras: num(s.compras) } : null,
        };
      }));
      setSemGiro((Array.isArray(d.pontos_sem_giro) ? (d.pontos_sem_giro as Record<string, unknown>[]) : []).map(p => ({
        item_id: String(p.item_id), nome: String(p.nome ?? '').trim(), categoria: txt(p.categoria), um: String(p.um ?? ''),
        ponto: num(p.ponto), saldo: num(p.saldo), consumo_dia: num(p.consumo_dia), compras_180d: num(p.compras_180d),
        ultima_compra: txt(p.ultima_compra), motivo: (p.motivo as SemGiro['motivo']) || 'sem_consumo',
      })));
      const t = (d.totais || {}) as Record<string, unknown>;
      setTotais(Object.fromEntries(Object.entries(t).map(([k, v]) => [k, num(v)])));
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const opcoesFornecedor = useMemo(() => fornecedores.map(f => ({
    value: f.id, label: f.nome, sublabel: f.modalidade === 'rua' ? 'Loja de rua · vai na lista do comprador' : 'Entrega · vira pedido',
  })), [fornecedores]);

  const buscaLower = busca.trim().toLowerCase();
  const filtrar = <T extends { nome: string; categoria: string | null; ponto: number }>(lista: T[]) => lista.filter(p =>
    (!soComPonto || p.ponto > 0) && (!buscaLower || p.nome.toLowerCase().includes(buscaLower) || (p.categoria || '').toLowerCase().includes(buscaLower)));

  const pendentesVis = useMemo(() => filtrar(pendentes), [pendentes, buscaLower, soComPonto]); // eslint-disable-line react-hooks/exhaustive-deps
  const semGiroVis = useMemo(() => filtrar(semGiro), [semGiro, buscaLower, soComPonto]); // eslint-disable-line react-hooks/exhaustive-deps
  const comSugestao = useMemo(() => pendentesVis.filter(p => p.sugestao), [pendentesVis]);

  // ── Ações ──
  const definir = async (p: Pendente, via: Via, fornecedorId: string | null) => {
    setOcupado(p.item_id); setErro('');
    try {
      const { error } = await supabase.rpc('fn_compras_definir_via', { p_item_id: p.item_id, p_via: via, p_fornecedor_id: fornecedorId });
      if (error) throw error;
      setPendentes(prev => prev.filter(x => x.item_id !== p.item_id));
      setOutro(null);
      onMudou();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  };

  const confirmarSugestoes = async () => {
    if (comSugestao.length === 0) return;
    if (!window.confirm(`Confirmar a sugestão do histórico para ${comSugestao.length} itens? Depois dá para trocar um a um no cadastro.`)) return;
    setOcupado('lote'); setErro('');
    try {
      const lote = comSugestao.map(p => ({ item_id: p.item_id, via: p.sugestao!.via, fornecedor_id: p.sugestao!.fornecedor_id }));
      const { error } = await supabase.rpc('fn_compras_definir_via_lote', { p_itens: lote });
      if (error) throw error;
      const ids = new Set(lote.map(l => l.item_id));
      setPendentes(prev => prev.filter(x => !ids.has(x.item_id)));
      onMudou();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  };

  const revisarPonto = async (p: SemGiro, acao: 'zerar' | 'manter') => {
    setOcupado(p.item_id); setErro('');
    try {
      const { error } = await supabase.rpc('fn_ponto_revisar', { p_item_id: p.item_id, p_acao: acao });
      if (error) throw error;
      setSemGiro(prev => prev.filter(x => x.item_id !== p.item_id));
      onMudou();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  };

  const zerarTodosVisiveis = async () => {
    if (semGiroVis.length === 0) return;
    if (!window.confirm(`Zerar o ponto de pedido de ${semGiroVis.length} itens? Eles saem da lista automática e passam a entrar só por "Incluir item".`)) return;
    setOcupado('lote'); setErro('');
    try {
      for (const p of semGiroVis) {
        const { error } = await supabase.rpc('fn_ponto_revisar', { p_item_id: p.item_id, p_acao: 'zerar' });
        if (error) throw error;
      }
      const ids = new Set(semGiroVis.map(p => p.item_id));
      setSemGiro(prev => prev.filter(x => !ids.has(x.item_id)));
      onMudou();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  };

  // ── Render ──
  const viaAtual = (p: Pendente) => {
    if (p.via === 'rua') return p.fornecedor_nome && p.fornecedor_modalidade === 'rua' ? `Rua · ${p.fornecedor_nome}` : 'Rua';
    if (p.via === 'fornecedor' && p.fornecedor_nome) return p.fornecedor_nome;
    return null;
  };

  return (
    <div className="space-y-4">
      <div className="bg-[#12141f] rounded-2xl border border-white/10 px-5 py-4 space-y-3">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-white font-bold">Configurar compras</h3>
            <p className="text-xs text-white/60 mt-0.5">
              Duas revisões feitas uma vez. O ponto de pedido de cada item continua sendo o do cadastro: nada é calculado.
            </p>
          </div>
          <button onClick={carregar} disabled={loading} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-xs text-white/60 hover:bg-white/5 disabled:opacity-50">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Atualizar
          </button>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-center">
          {[
            ['Itens compráveis', totais.itens], ['Com ponto', totais.com_ponto], ['Vão pela Rua', totais.via_rua],
            ['Vão por fornecedor', totais.via_fornecedor], ['Sem destino', totais.sem_via],
          ].map(([l, v]) => (
            <div key={String(l)} className="bg-white/5 rounded-xl px-2 py-2">
              <p className="text-lg font-bold text-white">{v ?? 0}</p>
              <p className="text-[10px] uppercase tracking-wide text-white/40">{l}</p>
            </div>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={() => setSecao('via')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${secao === 'via' ? 'bg-teal-500/20 text-teal-200 border-teal-500/40' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}>
            Como compra · {pendentes.length} a revisar
          </button>
          <button onClick={() => setSecao('pontos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${secao === 'pontos' ? 'bg-amber-500/20 text-amber-200 border-amber-500/40' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'}`}>
            Pontos que não giram · {semGiro.length}
          </button>
          <label className="ml-auto flex items-center gap-1.5 text-xs text-white/60 cursor-pointer">
            <input type="checkbox" checked={soComPonto} onChange={e => setSoComPonto(e.target.checked)} className="accent-wine" /> só itens com ponto de pedido
          </label>
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
            <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar item ou categoria..."
              className="w-full pl-9 pr-8 py-1.5 text-sm border border-white/10 rounded-xl bg-[#0c1018] text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-wine/30" />
            {busca && <button onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-white/30"><X size={14} /></button>}
          </div>
        </div>
      </div>

      {erro && (
        <div className="rounded-xl p-3 text-sm border bg-red-500/10 border-red-500/30 text-red-400 flex items-center gap-2">
          <AlertTriangle size={16} /> <span className="flex-1">{erro}</span>
          <button onClick={() => setErro('')} className="text-red-300/60"><X size={14} /></button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-white/30"><Loader2 size={24} className="animate-spin mx-auto mb-3" /><p>Carregando...</p></div>
      ) : secao === 'via' ? (
        <div className="bg-[#12141f] rounded-2xl border border-white/10">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-white/70">
              <span className="text-white font-semibold">{pendentesVis.length}</span> itens a revisar{soComPonto ? ' com ponto de pedido' : ''}.
              A sugestão vem de onde o item foi mais comprado em 180 dias.
            </p>
            {comSugestao.length > 0 && (
              <button onClick={confirmarSugestoes} disabled={ocupado !== null}
                className="flex items-center gap-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold px-3 py-2 rounded-xl disabled:opacity-50">
                {ocupado === 'lote' ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />} Confirmar as {comSugestao.length} sugestões
              </button>
            )}
          </div>
          {pendentesVis.length === 0 ? (
            <p className="text-center text-white/40 py-10 text-sm">Nada a revisar aqui.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0c1018] text-white/50 text-xs">
                    <th className="px-3 py-2 text-left font-medium">Item</th>
                    <th className="px-3 py-2 text-right font-medium w-20">Ponto</th>
                    <th className="px-3 py-2 text-left font-medium w-44">Hoje</th>
                    <th className="px-3 py-2 text-left font-medium w-56">Sugestão</th>
                    <th className="px-3 py-2 text-left font-medium w-[22rem]">Definir</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {pendentesVis.map(p => (
                    <tr key={p.item_id} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-1.5">
                        <span className="text-white/90">{p.nome}</span>
                        <span className="ml-2 text-caption text-white/40">{p.categoria || 'Sem categoria'} · {p.um}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-white/70">{p.ponto > 0 ? fmtQtd(p.ponto) : '—'}</td>
                      <td className="px-3 py-1.5 text-xs text-white/60">{viaAtual(p) ?? <span className="text-amber-300">sem destino</span>}</td>
                      <td className="px-3 py-1.5 text-xs">
                        {p.sugestao
                          ? <span className="text-teal-300">{p.sugestao.modalidade === 'rua' ? '🛒 ' : '🚚 '}{p.sugestao.nome} <span className="text-white/40">· {p.sugestao.compras}x</span></span>
                          : <span className="text-white/30">sem histórico</span>}
                      </td>
                      <td className="px-3 py-1.5">
                        {outro === p.item_id ? (
                          <div className="flex items-center gap-1">
                            <div className="flex-1 min-w-0">
                              <SearchableSelect theme="dark" options={opcoesFornecedor} value="" placeholder="Buscar fornecedor..." emptyMessage="Nenhum"
                                onChange={v => { if (!v) return; const f = fornecedores.find(x => x.id === v); definir(p, f?.modalidade === 'rua' ? 'rua' : 'fornecedor', v); }} />
                            </div>
                            <button onClick={() => setOutro(null)} className="text-white/30 hover:text-white/60"><X size={12} /></button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 flex-wrap">
                            {p.sugestao && (
                              <button onClick={() => definir(p, p.sugestao!.via, p.sugestao!.fornecedor_id)} disabled={ocupado !== null}
                                className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border bg-teal-500/10 text-teal-300 border-teal-500/30 hover:bg-teal-500/20 disabled:opacity-50">
                                {ocupado === p.item_id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />} Confirmar
                              </button>
                            )}
                            <button onClick={() => definir(p, 'rua', null)} disabled={ocupado !== null}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border border-white/15 text-white/70 hover:bg-white/10 disabled:opacity-50">
                              <Store size={11} /> Rua
                            </button>
                            <button onClick={() => setOutro(p.item_id)} disabled={ocupado !== null}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border border-white/15 text-white/70 hover:bg-white/10 disabled:opacity-50">
                              <Truck size={11} /> Fornecedor…
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        <div className="bg-[#12141f] rounded-2xl border border-white/10">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-sm text-white/70">
              <span className="text-white font-semibold">{semGiroVis.length}</span> itens com ponto de pedido que não giram: sem consumo medido e sem compra em 180 dias, ou utensílio/equipamento.
              Zerar o ponto tira o item da lista automática; "Manter" só some daqui.
            </p>
            {semGiroVis.length > 0 && (
              <button onClick={zerarTodosVisiveis} disabled={ocupado !== null}
                className="flex items-center gap-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold px-3 py-2 rounded-xl disabled:opacity-50">
                {ocupado === 'lote' ? <Loader2 size={13} className="animate-spin" /> : <Ban size={13} />} Zerar o ponto dos {semGiroVis.length} listados
              </button>
            )}
          </div>
          {semGiroVis.length === 0 ? (
            <p className="text-center text-white/40 py-10 text-sm">Nenhum ponto parado para revisar.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0c1018] text-white/50 text-xs">
                    <th className="px-3 py-2 text-left font-medium">Item</th>
                    <th className="px-3 py-2 text-right font-medium w-20">Ponto</th>
                    <th className="px-3 py-2 text-right font-medium w-24">Central</th>
                    <th className="px-3 py-2 text-left font-medium w-36">Última compra</th>
                    <th className="px-3 py-2 text-left font-medium w-44">Por quê</th>
                    <th className="px-3 py-2 text-left font-medium w-48">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {semGiroVis.map(p => (
                    <tr key={p.item_id} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-1.5">
                        <span className="text-white/90">{p.nome}</span>
                        <span className="ml-2 text-caption text-white/40">{p.categoria || 'Sem categoria'} · {p.um}</span>
                      </td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-white/80">{fmtQtd(p.ponto)}</td>
                      <td className="px-3 py-1.5 text-right tabular-nums text-white/60">{fmtQtd(p.saldo)}</td>
                      <td className="px-3 py-1.5 text-xs text-white/60">{p.ultima_compra ? `${fmtData(p.ultima_compra)} · ${p.compras_180d}x` : 'nenhuma em 180 dias'}</td>
                      <td className="px-3 py-1.5 text-xs text-amber-300/80">{MOTIVO[p.motivo]}</td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1">
                          <button onClick={() => revisarPonto(p, 'zerar')} disabled={ocupado !== null}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold border bg-amber-500/10 text-amber-300 border-amber-500/30 hover:bg-amber-500/20 disabled:opacity-50">
                            {ocupado === p.item_id ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />} Zerar ponto
                          </button>
                          <button onClick={() => revisarPonto(p, 'manter')} disabled={ocupado !== null}
                            className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs border border-white/15 text-white/60 hover:bg-white/10 disabled:opacity-50">
                            <Check size={11} /> Manter
                          </button>
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
