import { Fragment, useState, useEffect, useCallback } from 'react';
import { X, Search, Plus, Trash2, Loader2, Check, AlertTriangle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { agruparPorCategoria, SEM_CATEGORIA } from './agruparPorCategoria';

interface Props {
  estoqueId: string;
  estoqueNome: string;
  onClose: () => void;
}

type Controle = 'venda' | 'contagem';
type Detectado = 'vendido' | 'ficha' | 'sem_baixa';
type Chip = 'todos' | 'venda' | 'contagem' | 'atencao';

interface ItemCadastro {
  item_id: string;
  nome: string;
  categoria: string | null;
  um: string;
  nivel: number;
  controle: Controle;
  detectado: Detectado;
  saldo_local: number;
  saldo_central: number;
  ultima_contagem: string | null;
  vendas_30d: number;
}

interface CadastroBalcao {
  estoque_id: string;
  nome: string;
  itens: ItemCadastro[] | null;
}

interface ItemBusca {
  id: string;
  nome: string;
  unidade_medida: string;
  categoria: string | null;
}

const CONTROLE_LABEL: Record<Controle, string> = {
  venda: 'Baixa pela venda',
  contagem: 'Precisa contar',
};

const DETECTADO_HINT: Record<Detectado, string> = {
  vendido: 'vende direto no ZIG',
  ficha: 'entra em ficha técnica',
  sem_baixa: 'sem baixa no ZIG',
};

const CHIPS: Array<{ id: Chip; label: string }> = [
  { id: 'todos', label: 'Todos' },
  { id: 'venda', label: 'Baixa pela venda' },
  { id: 'contagem', label: 'Precisa contar' },
  { id: 'atencao', label: 'Atenção' },
];

const UNIDADES_FRACIONADAS = new Set(['kg', 'g', 'l', 'ml']);

function fmt(n: number): string {
  if (!isFinite(n)) return '0';
  return parseFloat(n.toFixed(3)).toLocaleString('pt-BR', {
    minimumFractionDigits: 0, maximumFractionDigits: 3,
  });
}

function fmtData(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function precisaAtencao(l: ItemCadastro): boolean {
  return l.controle === 'venda' && l.detectado === 'sem_baixa';
}

function normalizarItem(raw: ItemCadastro): ItemCadastro {
  return {
    ...raw,
    um: raw.um ?? '',
    nivel: Number(raw.nivel) || 0,
    saldo_local: Number(raw.saldo_local) || 0,
    saldo_central: Number(raw.saldo_central) || 0,
    vendas_30d: Number(raw.vendas_30d) || 0,
    controle: raw.controle === 'contagem' ? 'contagem' : 'venda',
    detectado: raw.detectado === 'vendido' || raw.detectado === 'ficha' ? raw.detectado : 'sem_baixa',
  };
}

const INPUT = 'bg-white/5 border border-white/20 text-white rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-wine/30';

export default function NiveisBalcao({ estoqueId, estoqueNome, onClose }: Props) {
  const [linhas, setLinhas]           = useState<ItemCadastro[]>([]);
  const [loading, setLoading]         = useState(false);
  const [filtro, setFiltro]           = useState('');
  const [filtroCat, setFiltroCat]     = useState('');
  const [chip, setChip]               = useState<Chip>('todos');
  const [edicao, setEdicao]           = useState<Record<string, string>>({});
  const [salvando, setSalvando]       = useState<Record<string, boolean>>({});
  const [erro, setErro]               = useState<string | null>(null);

  // Adicionar item
  const [buscaNovo, setBuscaNovo]     = useState('');
  const [resultados, setResultados]   = useState<ItemBusca[]>([]);
  const [buscando, setBuscando]       = useState(false);
  const [itemNovo, setItemNovo]       = useState<ItemBusca | null>(null);
  const [adicionando, setAdicionando] = useState(false);

  const carregar = useCallback(async () => {
    setLoading(true);
    setErro(null);
    try {
      const { data, error } = await supabase.rpc('fn_balcao_cadastro', { p_estoque_id: estoqueId });
      if (error) throw error;
      const cadastro = (data ?? null) as CadastroBalcao | null;
      setLinhas((cadastro?.itens ?? []).map(normalizarItem));
      setEdicao({});
    } catch (e) {
      console.error(e);
      setErro('Erro ao carregar o cadastro do balcão');
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
        .limit(20);
      const jaTem = new Set(linhas.map(l => l.item_id));
      setResultados(((data || []) as ItemBusca[]).filter(i => !jaTem.has(i.id)));
      setBuscando(false);
    }, 300);
    return () => clearTimeout(t);
  }, [buscaNovo, itemNovo, linhas]);

  async function salvar(itemId: string, nivel: number, controle: Controle): Promise<boolean> {
    const { error } = await supabase.rpc('fn_balcao_cadastro_salvar', {
      p_estoque_id: estoqueId, p_item_id: itemId, p_nivel: nivel, p_controle: controle,
    });
    if (error) { console.error(error); setErro('Erro ao salvar o cadastro'); return false; }
    setErro(null);
    return true;
  }

  function limparEdicao(itemId: string) {
    setEdicao(prev => { const c = { ...prev }; delete c[itemId]; return c; });
  }

  async function salvarNivel(linha: ItemCadastro) {
    const raw = edicao[linha.item_id];
    if (raw === undefined) return;
    const valor = Number(raw.replace(',', '.'));
    if (isNaN(valor) || valor < 0 || valor === linha.nivel) { limparEdicao(linha.item_id); return; }
    setSalvando(prev => ({ ...prev, [linha.item_id]: true }));
    const ok = await salvar(linha.item_id, valor, linha.controle);
    if (ok) setLinhas(prev => prev.map(l => l.item_id === linha.item_id ? { ...l, nivel: valor } : l));
    limparEdicao(linha.item_id);
    setSalvando(prev => ({ ...prev, [linha.item_id]: false }));
  }

  async function mudarControle(linha: ItemCadastro, controle: Controle) {
    if (controle === linha.controle || salvando[linha.item_id]) return;
    setSalvando(prev => ({ ...prev, [linha.item_id]: true }));
    const ok = await salvar(linha.item_id, linha.nivel, controle);
    if (ok) setLinhas(prev => prev.map(l => l.item_id === linha.item_id ? { ...l, controle } : l));
    setSalvando(prev => ({ ...prev, [linha.item_id]: false }));
  }

  async function remover(linha: ItemCadastro) {
    if (!window.confirm(`Remover "${linha.nome}" do cadastro de ${estoqueNome}?`)) return;
    const { error } = await supabase
      .from('itens_estoque_niveis')
      .delete()
      .eq('item_id', linha.item_id)
      .eq('estoque_id', estoqueId);
    if (error) { console.error(error); setErro('Erro ao remover item do cadastro'); return; }
    setLinhas(prev => prev.filter(l => l.item_id !== linha.item_id));
  }

  async function adicionarNovo() {
    if (!itemNovo || adicionando) return;
    setAdicionando(true);
    try {
      const { data: det, error: errDet } = await supabase.rpc('fn_balcao_detectar_baixa', {
        p_item_id: itemNovo.id, p_estoque_id: estoqueId,
      });
      if (errDet) throw errDet;
      const detectado = det as Detectado | null;
      const controle: Controle = detectado === 'vendido' || detectado === 'ficha' ? 'venda' : 'contagem';
      const ok = await salvar(itemNovo.id, 0, controle);
      if (ok) {
        setItemNovo(null); setBuscaNovo(''); setResultados([]);
        await carregar();
      }
    } catch (e) {
      console.error(e);
      setErro('Erro ao adicionar item ao cadastro');
    } finally {
      setAdicionando(false);
    }
  }

  const termoFiltro = filtro.trim().toLowerCase();
  const categoriaDe = (l: ItemCadastro) => (l.categoria ?? '').trim() || SEM_CATEGORIA;
  const categorias = agruparPorCategoria(linhas).map(([cat]) => cat);
  const passaChip = (l: ItemCadastro) => {
    if (chip === 'venda') return l.controle === 'venda';
    if (chip === 'contagem') return l.controle === 'contagem';
    if (chip === 'atencao') return precisaAtencao(l);
    return true;
  };
  const linhasFiltradas = linhas.filter(l =>
    passaChip(l) &&
    (!filtroCat || categoriaDe(l) === filtroCat) &&
    (!termoFiltro || l.nome.toLowerCase().includes(termoFiltro) || (l.categoria || '').toLowerCase().includes(termoFiltro)),
  );
  const grupos = agruparPorCategoria(linhasFiltradas);
  const totalVenda    = linhas.filter(l => l.controle === 'venda').length;
  const totalContagem = linhas.length - totalVenda;
  const totalAtencao  = linhas.filter(precisaAtencao).length;
  const contagemChip: Record<Chip, number> = {
    todos: linhas.length, venda: totalVenda, contagem: totalContagem, atencao: totalAtencao,
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[60] p-4">
      <div className="bg-[#0f1020] border border-white/10 rounded-2xl max-w-5xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-white/10">
          <div>
            <h3 className="text-lg font-bold text-white">Cadastro do balcão · {estoqueNome}</h3>
            <p className="text-xs text-white/50 mt-0.5">Quantidade para abrir a casa e como cada item é controlado.</p>
            <p className="text-xs text-white/40 mt-1">
              {linhas.length} {linhas.length === 1 ? 'item' : 'itens'}
              {linhas.length > 0 && <> · {totalVenda} baixa pela venda · {totalContagem} precisa contar</>}
              {totalAtencao > 0 && <span className="text-amber-300"> · {totalAtencao} em atenção</span>}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-lg" aria-label="Fechar">
            <X className="w-5 h-5 text-white/50" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {erro && (
            <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-sm text-red-300">{erro}</div>
          )}

          {/* Adicionar item */}
          <div className="bg-[#12141f] border border-white/10 rounded-xl p-4 space-y-3">
            <p className="text-xs font-semibold text-white/50 uppercase tracking-wide">Adicionar item</p>
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-9 relative">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
                  <input
                    type="text"
                    value={itemNovo ? itemNovo.nome : buscaNovo}
                    onChange={e => { setItemNovo(null); setBuscaNovo(e.target.value); }}
                    onKeyDown={e => { if (e.key === 'Enter' && itemNovo) adicionarNovo(); }}
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
                  <p className="text-caption text-white/40 mt-1">Nenhum item ativo encontrado (ou já está no cadastro)</p>
                )}
                {itemNovo && (
                  <p className="text-caption text-white/40 mt-1">Entra com nível 0; o controle é sugerido pelo que o sistema detecta no ZIG.</p>
                )}
              </div>
              <div className="md:col-span-3">
                <button
                  onClick={adicionarNovo}
                  disabled={!itemNovo || adicionando}
                  className="w-full flex items-center justify-center gap-2 bg-wine text-white rounded-xl py-2 text-sm font-semibold hover:bg-[#6a1a25] disabled:opacity-40"
                >
                  {adicionando ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                  Adicionar
                </button>
              </div>
            </div>
          </div>

          {/* Chips */}
          <div className="flex gap-2 flex-wrap">
            {CHIPS.map(c => {
              const ativo = chip === c.id;
              const atencao = c.id === 'atencao';
              return (
                <button
                  key={c.id}
                  onClick={() => setChip(c.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border transition-colors ${
                    ativo
                      ? atencao ? 'bg-amber-500/20 border-amber-500/50 text-amber-200' : 'bg-wine/30 border-wine/60 text-white'
                      : atencao && totalAtencao > 0
                        ? 'border-amber-500/30 text-amber-300/80 hover:bg-amber-500/10'
                        : 'border-white/10 text-white/60 hover:bg-white/5'
                  }`}
                >
                  {c.label} <span className="opacity-60 tabular-nums">{contagemChip[c.id]}</span>
                </button>
              );
            })}
          </div>

          {/* Filtro */}
          <div className="flex gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                type="text" value={filtro} onChange={e => setFiltro(e.target.value)}
                placeholder="Filtrar itens do cadastro..."
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
                {linhas.length === 0 ? 'Nenhum item no cadastro deste balcão' : 'Nenhum item corresponde ao filtro'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full">
                  <thead className="bg-white/5 border-b border-white/10">
                    <tr>
                      {['Item', 'Controle', 'Nível (para abrir)', 'No balcão', 'Central', 'Ajuda', ''].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-semibold text-white/60 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {grupos.map(([categoria, itensCat]) => (
                      <Fragment key={categoria}>
                        <tr>
                          <td colSpan={7} className="px-3 py-1.5 bg-white/[0.04] text-[11px] font-semibold uppercase tracking-wide text-white/50">
                            {categoria} <span className="normal-case font-normal text-white/30">· {itensCat.length} {itensCat.length === 1 ? 'item' : 'itens'}</span>
                          </td>
                        </tr>
                        {itensCat.map(l => {
                          const emEdicao = edicao[l.item_id];
                          const ocupado = !!salvando[l.item_id];
                          const step = UNIDADES_FRACIONADAS.has(l.um.trim().toLowerCase()) ? '0.01' : '1';
                          const atencao = precisaAtencao(l);
                          const contagemVendida = l.controle === 'contagem' && l.detectado === 'vendido';
                          return (
                            <tr key={l.item_id} className="hover:bg-white/5 transition-colors align-top">
                              <td className="px-4 py-2.5">
                                <p className="text-sm text-white">{l.nome}</p>
                                {l.um && <p className="text-xs text-white/40">{l.um}</p>}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="inline-flex rounded-lg border border-white/15 overflow-hidden text-xs font-semibold" role="group" aria-label={`Controle de ${l.nome}`}>
                                  {(['venda', 'contagem'] as Controle[]).map(c => {
                                    const ativo = l.controle === c;
                                    return (
                                      <button
                                        key={c}
                                        type="button"
                                        onClick={() => mudarControle(l, c)}
                                        disabled={ocupado}
                                        aria-pressed={ativo}
                                        className={`px-2.5 py-1.5 whitespace-nowrap transition-colors disabled:opacity-60 ${
                                          ativo
                                            ? c === 'venda' ? 'bg-blue-500/25 text-blue-100' : 'bg-amber-500/25 text-amber-100'
                                            : 'text-white/50 hover:bg-white/5'
                                        }`}
                                      >
                                        {CONTROLE_LABEL[c]}
                                      </button>
                                    );
                                  })}
                                </div>
                                <div className="flex items-center gap-1.5 mt-1 text-[11px] text-white/40">
                                  {atencao && (
                                    <span
                                      className="inline-flex shrink-0"
                                      title="Nada dá baixa neste item no ZIG; a reposição nunca vai ser sugerida. Marque Precisa contar ou mapeie o produto."
                                    >
                                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400" aria-label="Atenção" />
                                    </span>
                                  )}
                                  <span className={atencao ? 'text-amber-300' : ''}>{DETECTADO_HINT[l.detectado]}</span>
                                </div>
                                {contagemVendida && (
                                  <p className="text-[11px] text-white/30 mt-0.5">vende no ZIG, mas vai ser controlado por contagem</p>
                                )}
                              </td>
                              <td className="px-4 py-2.5">
                                <div className="flex items-center gap-2">
                                  <input
                                    type="number" min="0" step={step}
                                    value={emEdicao !== undefined ? emEdicao : String(l.nivel)}
                                    onChange={e => setEdicao(prev => ({ ...prev, [l.item_id]: e.target.value }))}
                                    onBlur={() => salvarNivel(l)}
                                    onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                                    aria-label={`Nível de ${l.nome}`}
                                    className={`w-24 ${INPUT} py-1.5 tabular-nums`}
                                  />
                                  {ocupado && <Loader2 className="w-3.5 h-3.5 animate-spin text-white/40" />}
                                </div>
                              </td>
                              <td className={`px-4 py-2.5 text-sm tabular-nums whitespace-nowrap ${l.saldo_local < 0 ? 'text-red-400' : 'text-white/70'}`}>
                                {fmt(l.saldo_local)}
                              </td>
                              <td className={`px-4 py-2.5 text-sm tabular-nums whitespace-nowrap ${l.saldo_central < 0 ? 'text-red-400' : 'text-white/70'}`}>
                                {fmt(l.saldo_central)}
                              </td>
                              <td className="px-4 py-2.5 text-xs text-white/40 whitespace-nowrap">
                                {l.vendas_30d > 0 && <p>vendeu {fmt(l.vendas_30d)} em 30 dias</p>}
                                {l.controle === 'contagem' && (
                                  <p>{l.ultima_contagem ? `contado ${fmtData(l.ultima_contagem)}` : 'nunca contado'}</p>
                                )}
                                {l.vendas_30d <= 0 && l.controle !== 'contagem' && <span className="text-white/25">—</span>}
                              </td>
                              <td className="px-4 py-2.5">
                                <button
                                  onClick={() => remover(l)}
                                  className="p-1 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-lg"
                                  title="Remover do cadastro"
                                  aria-label={`Remover ${l.nome} do cadastro`}
                                >
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

        <div className="p-5 border-t border-white/10 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs text-white/40 min-w-0">
            <span className="text-white/60 font-semibold">Baixa pela venda:</span> repõe pela diferença entre nível e saldo.{' '}
            <span className="text-white/60 font-semibold">Precisa contar:</span> o balcão conta pelo link e a reposição sai da contagem.
          </p>
          <button onClick={onClose} className="px-4 py-2 border border-white/20 text-white/80 rounded-xl hover:bg-white/5 text-sm font-semibold shrink-0">
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
}
