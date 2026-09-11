import { Fragment, useState, useEffect, useCallback } from 'react';
import { X, Search, Plus, Trash2, Loader2, Info, Check } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { agruparPorCategoria, SEM_CATEGORIA } from './agruparPorCategoria';

interface Props {
  estoqueId: string;
  estoqueNome: string;
  onClose: () => void;
}

interface LinhaNivel {
  item_id: string;
  nome: string;
  unidade_medida: string;
  categoria: string | null;
  nivel: number;
  saldo: number;
}

interface ItemBusca {
  id: string;
  nome: string;
  unidade_medida: string;
  categoria: string | null;
}

function fmt(n: number): string {
  if (!isFinite(n)) return '0';
  return parseFloat(n.toFixed(3)).toLocaleString('pt-BR', {
    minimumFractionDigits: 0, maximumFractionDigits: 3,
  });
}

const INPUT = 'bg-white/5 border border-white/20 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine/30';

export default function NiveisBalcao({ estoqueId, estoqueNome, onClose }: Props) {
  const [linhas, setLinhas]           = useState<LinhaNivel[]>([]);
  const [loading, setLoading]         = useState(false);
  const [filtro, setFiltro]           = useState('');
  const [filtroCat, setFiltroCat]     = useState('');
  const [edicao, setEdicao]           = useState<Record<string, string>>({});
  const [salvando, setSalvando]       = useState<Record<string, boolean>>({});
  const [erro, setErro]               = useState<string | null>(null);

  // Adicionar item
  const [buscaNovo, setBuscaNovo]           = useState('');
  const [resultados, setResultados]         = useState<ItemBusca[]>([]);
  const [buscando, setBuscando]             = useState(false);
  const [itemNovo, setItemNovo]             = useState<ItemBusca | null>(null);
  const [nivelNovo, setNivelNovo]           = useState('');
  const [adicionando, setAdicionando]       = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const [niveisRes, saldosRes] = await Promise.all([
        supabase.from('itens_estoque_niveis')
          .select('item_id, nivel_reposicao')
          .eq('estoque_id', estoqueId),
        supabase.from('saldos_estoque')
          .select('item_id, quantidade_atual')
          .eq('estoque_id', estoqueId),
      ]);
      if (niveisRes.error) throw niveisRes.error;

      const niveis = (niveisRes.data || []) as { item_id: string; nivel_reposicao: number | string }[];
      const saldoMap: Record<string, number> = {};
      ((saldosRes.data || []) as { item_id: string; quantidade_atual: number | string }[])
        .forEach(s => { saldoMap[s.item_id] = Number(s.quantidade_atual) || 0; });

      const ids = niveis.map(n => n.item_id);
      let itensMap: Record<string, ItemBusca> = {};
      if (ids.length > 0) {
        const { data: itensData } = await supabase
          .from('itens_estoque')
          .select('id, nome, unidade_medida, categoria')
          .in('id', ids);
        itensMap = Object.fromEntries(((itensData || []) as ItemBusca[]).map(i => [i.id, i]));
      }

      const montadas: LinhaNivel[] = niveis.map(n => {
        const info = itensMap[n.item_id];
        return {
          item_id: n.item_id,
          nome: info?.nome || '(item não encontrado)',
          unidade_medida: info?.unidade_medida || '',
          categoria: info?.categoria ?? null,
          nivel: Number(n.nivel_reposicao) || 0,
          saldo: saldoMap[n.item_id] ?? 0,
        };
      }).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

      setLinhas(montadas);
      setEdicao({});
    } catch (e) {
      console.error(e);
      setErro('Erro ao carregar níveis de balcão');
    } finally {
      setLoading(false);
    }
  }, [estoqueId]);

  useEffect(() => { carregar(); }, [carregar]);

  // Busca de itens para adicionar (debounce)
  useEffect(() => {
    const termo = buscaNovo.trim();
    if (termo.length < 2 || itemNovo) { setResultados([]); return; }
    const t = setTimeout(async () => {
      setBuscando(true);
      const { data } = await supabase
        .from('itens_estoque')
        .select('id, nome, unidade_medida, categoria')
        .eq('status', 'ativo')
        .ilike('nome', `%${termo}%`)
        .order('nome')
        .limit(15);
      const jaTem = new Set(linhas.map(l => l.item_id));
      setResultados(((data || []) as ItemBusca[]).filter(i => !jaTem.has(i.id)));
      setBuscando(false);
    }, 300);
    return () => clearTimeout(t);
  }, [buscaNovo, itemNovo, linhas]);

  async function upsertNivel(itemId: string, nivel: number): Promise<boolean> {
    const { error } = await supabase
      .from('itens_estoque_niveis')
      .upsert(
        { item_id: itemId, estoque_id: estoqueId, nivel_reposicao: nivel, atualizado_em: new Date().toISOString() },
        { onConflict: 'item_id,estoque_id' },
      );
    if (error) { console.error(error); setErro('Erro ao salvar nível'); return false; }
    setErro(null);
    return true;
  }

  async function salvarEdicao(linha: LinhaNivel) {
    const raw = edicao[linha.item_id];
    if (raw === undefined) return;
    const valor = Number(raw.replace(',', '.'));
    if (isNaN(valor) || valor < 0) {
      setEdicao(prev => { const c = { ...prev }; delete c[linha.item_id]; return c; });
      return;
    }
    if (valor === linha.nivel) {
      setEdicao(prev => { const c = { ...prev }; delete c[linha.item_id]; return c; });
      return;
    }
    setSalvando(prev => ({ ...prev, [linha.item_id]: true }));
    const ok = await upsertNivel(linha.item_id, valor);
    if (ok) {
      setLinhas(prev => prev.map(l => l.item_id === linha.item_id ? { ...l, nivel: valor } : l));
    }
    setEdicao(prev => { const c = { ...prev }; delete c[linha.item_id]; return c; });
    setSalvando(prev => ({ ...prev, [linha.item_id]: false }));
  }

  async function removerNivel(linha: LinhaNivel) {
    if (!confirm(`Remover o nível de balcão de "${linha.nome}" em ${estoqueNome}?`)) return;
    const { error } = await supabase
      .from('itens_estoque_niveis')
      .delete()
      .eq('item_id', linha.item_id)
      .eq('estoque_id', estoqueId);
    if (error) { console.error(error); setErro('Erro ao remover nível'); return; }
    setLinhas(prev => prev.filter(l => l.item_id !== linha.item_id));
  }

  async function adicionarNovo() {
    if (!itemNovo) return;
    const valor = Number(nivelNovo.replace(',', '.'));
    if (isNaN(valor) || valor < 0) { setErro('Informe um nível válido (0 ou mais)'); return; }
    setAdicionando(true);
    const ok = await upsertNivel(itemNovo.id, valor);
    if (ok) {
      const { data: saldoRow } = await supabase
        .from('saldos_estoque')
        .select('quantidade_atual')
        .eq('estoque_id', estoqueId)
        .eq('item_id', itemNovo.id)
        .maybeSingle();
      const saldo = Number(saldoRow?.quantidade_atual) || 0;
      setLinhas(prev => [
        ...prev.filter(l => l.item_id !== itemNovo.id),
        { item_id: itemNovo.id, nome: itemNovo.nome, unidade_medida: itemNovo.unidade_medida, categoria: itemNovo.categoria, nivel: valor, saldo },
      ].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')));
      setItemNovo(null); setBuscaNovo(''); setNivelNovo(''); setResultados([]);
    }
    setAdicionando(false);
  }

  const termoFiltro = filtro.trim().toLowerCase();
  const categoriaDe = (l: LinhaNivel) => (l.categoria ?? '').trim() || SEM_CATEGORIA;
  const categorias = agruparPorCategoria(linhas).map(([cat]) => cat);
  const linhasFiltradas = linhas.filter(l =>
    (!filtroCat || categoriaDe(l) === filtroCat) &&
    (!termoFiltro || l.nome.toLowerCase().includes(termoFiltro) || (l.categoria || '').toLowerCase().includes(termoFiltro)),
  );
  const grupos = agruparPorCategoria(linhasFiltradas);
  const totalEmFalta = linhas.filter(l => l.nivel - l.saldo > 0).length;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-[#0f1020] border border-white/10 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div>
            <h3 className="text-lg font-bold text-white">Níveis de balcão · {estoqueNome}</h3>
            <p className="text-xs text-white/50 mt-0.5">
              {linhas.length} {linhas.length === 1 ? 'item com nível' : 'itens com nível'}
              {totalEmFalta > 0 && <span className="text-amber-300"> · {totalEmFalta} abaixo do nível</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg">
            <X className="w-5 h-5 text-white/50" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/30 rounded-xl text-xs text-blue-300">
            <Info className="w-4 h-4 shrink-0 mt-0.5" />
            <span>Nível de balcão é quanto este ponto deve ter em mãos. Serve para a requisição ao Central, não para compra.</span>
          </div>

          {erro && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300">{erro}</div>
          )}

          {/* Adicionar item */}
          <div className="bg-[#12141f] border border-white/10 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-white/50 uppercase tracking-wide">Adicionar item</p>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-7 relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input
                    type="text"
                    value={itemNovo ? itemNovo.nome : buscaNovo}
                    onChange={e => { setItemNovo(null); setBuscaNovo(e.target.value); }}
                    placeholder="Buscar item ativo por nome..."
                    className={`w-full pl-9 pr-8 ${INPUT}`}
                  />
                  {buscando && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 animate-spin text-white/30" />}
                  {itemNovo && !buscando && <Check className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-green-400" />}
                </div>
                {!itemNovo && resultados.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-[#1a1c2e] border border-white/10 rounded-xl overflow-hidden max-h-56 overflow-y-auto shadow-xl">
                    {resultados.map(i => (
                      <button
                        key={i.id}
                        onMouseDown={() => { setItemNovo(i); setResultados([]); }}
                        className="flex items-center justify-between w-full px-4 py-2.5 text-left hover:bg-white/5 transition-colors"
                      >
                        <span className="text-sm text-white/80">{i.nome}</span>
                        <span className="text-xs text-white/40 ml-2 shrink-0">{i.unidade_medida}</span>
                      </button>
                    ))}
                  </div>
                )}
                {!itemNovo && buscaNovo.trim().length >= 2 && !buscando && resultados.length === 0 && (
                  <p className="text-caption text-white/40 mt-1">Nenhum item ativo encontrado (ou já possui nível)</p>
                )}
              </div>
              <div className="md:col-span-3">
                <input
                  type="number" min="0" step="any"
                  value={nivelNovo}
                  onChange={e => setNivelNovo(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') adicionarNovo(); }}
                  placeholder={itemNovo ? `Nível (${itemNovo.unidade_medida})` : 'Nível'}
                  disabled={!itemNovo}
                  className={`w-full ${INPUT} disabled:opacity-40`}
                />
              </div>
              <div className="md:col-span-2">
                <button
                  onClick={adicionarNovo}
                  disabled={!itemNovo || nivelNovo === '' || adicionando}
                  className="w-full flex items-center justify-center gap-2 bg-wine text-white rounded-xl py-2 text-sm font-semibold hover:bg-[#6a1a25] disabled:opacity-40"
                >
                  {adicionando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Adicionar
                </button>
              </div>
            </div>
          </div>

          {/* Filtro */}
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="text" value={filtro} onChange={e => setFiltro(e.target.value)}
                placeholder="Filtrar itens com nível..."
                className={`w-full pl-9 ${INPUT}`}
              />
            </div>
            <select
              value={filtroCat} onChange={e => setFiltroCat(e.target.value)}
              aria-label="Filtrar por categoria"
              className={`${INPUT} bg-[#12141f] max-w-[45%] shrink-0`}
            >
              <option value="">Todas</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          {/* Tabela */}
          <div className="border border-white/10 rounded-xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-white/30" />
              </div>
            ) : linhasFiltradas.length === 0 ? (
              <p className="text-center text-white/60 py-10 text-sm">
                {linhas.length === 0 ? 'Nenhum item com nível de balcão neste estoque' : 'Nenhum item corresponde ao filtro'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      {['Item', 'Un', 'Nível', 'Saldo atual', 'Falta', ''].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-white/60 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {grupos.map(([categoria, itensCat]) => (
                      <Fragment key={categoria}>
                        <tr>
                          <td colSpan={6} className="px-3 py-1.5 bg-white/[0.04] text-[11px] font-semibold uppercase tracking-wide text-white/50">
                            {categoria} <span className="normal-case font-normal text-white/30">· {itensCat.length} {itensCat.length === 1 ? 'item' : 'itens'}</span>
                          </td>
                        </tr>
                        {itensCat.map(l => {
                      const falta = Math.max(l.nivel - l.saldo, 0);
                      const emEdicao = edicao[l.item_id];
                      return (
                        <tr key={l.item_id} className="hover:bg-white/5 transition-colors">
                          <td className="px-4 py-2 text-sm text-white">{l.nome}</td>
                          <td className="px-4 py-2 text-sm text-white/50 whitespace-nowrap">{l.unidade_medida}</td>
                          <td className="px-4 py-2">
                            <div className="flex items-center gap-2">
                              <input
                                type="number" min="0" step="any"
                                value={emEdicao !== undefined ? emEdicao : String(l.nivel)}
                                onChange={e => setEdicao(prev => ({ ...prev, [l.item_id]: e.target.value }))}
                                onBlur={() => salvarEdicao(l)}
                                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                className={`w-24 ${INPUT} py-1.5 tabular-nums`}
                              />
                              {salvando[l.item_id] && <Loader2 className="w-3.5 h-3.5 animate-spin text-white/40" />}
                            </div>
                          </td>
                          <td className={`px-4 py-2 text-sm tabular-nums whitespace-nowrap ${l.saldo < 0 ? 'text-red-400' : 'text-white/70'}`}>
                            {fmt(l.saldo)}
                          </td>
                          <td className="px-4 py-2 whitespace-nowrap">
                            {falta > 0 ? (
                              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-300 tabular-nums">
                                {fmt(falta)} {l.unidade_medida}
                              </span>
                            ) : (
                              <span className="text-xs text-white/30">—</span>
                            )}
                          </td>
                          <td className="px-4 py-2">
                            <button onClick={() => removerNivel(l)} className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg" title="Remover nível">
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                        })}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <div className="p-5 border-t border-white/10 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 border border-white/20 text-white/80 rounded-xl hover:bg-white/5 text-sm font-semibold">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
