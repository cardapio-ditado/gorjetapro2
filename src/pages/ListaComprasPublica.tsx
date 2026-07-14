import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Circle, ShoppingCart, RefreshCw, Package, ChevronDown, ChevronRight } from 'lucide-react';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

type TipoCompra = 'todos' | 'rua' | 'fornecedor' | 'ambos';
type StatusLista = 'aberta' | 'em_andamento' | 'concluida' | 'cancelada';

interface ItemLista {
  id: string; lista_id: string; item_id: string;
  nome_item: string; categoria: string; unidade_medida: string;
  tipo_compra: TipoCompra;
  fornecedor_nome: string | null; fornecedor_tel: string | null;
  estoque_atual: number; estoque_minimo: number;
  quantidade_sugerida: number; quantidade_comprar: number;
  custo_unitario: number; custo_estimado: number;
  comprado: boolean; comprado_em: string | null;
  observacao: string | null;
}

interface Lista {
  id: string; numero: string; titulo: string;
  tipo_compra: TipoCompra; status: StatusLista;
  gerado_por: string; observacoes: string | null;
  total_itens: number; itens_comprados: number;
  valor_estimado: number; criado_em: string;
}

const TIPO_COLOR: Record<string, string> = {
  rua: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  fornecedor: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  ambos: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

function fmt(n: number, dec = 2) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

export default function ListaComprasPublica() {
  const { id } = useParams<{ id: string }>();
  const [lista, setLista] = useState<Lista | null>(null);
  const [itens, setItens] = useState<ItemLista[]>([]);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState('');
  const [salvando, setSalvando] = useState<string | null>(null);
  const [expandidas, setExpandidas] = useState<Set<string>>(new Set());

  const headers = { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' };

  useEffect(() => { if (id) carregar(); }, [id]);

  const carregar = async () => {
    setLoading(true);
    try {
      const [rLista, rItens] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/listas_compra?id=eq.${id}&select=*`, { headers }),
        fetch(`${SUPABASE_URL}/rest/v1/listas_compra_itens?lista_id=eq.${id}&order=categoria,nome_item`, { headers }),
      ]);
      const [dLista, dItens] = await Promise.all([rLista.json(), rItens.json()]);
      if (!dLista[0]) { setErro('Lista não encontrada.'); return; }
      setLista(dLista[0]);
      if (Array.isArray(dItens)) {
        setItens(dItens);
        setExpandidas(new Set(dItens.map((i: ItemLista) => i.categoria)));
      }
    } catch {
      setErro('Erro ao carregar a lista. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  const toggleComprado = async (item: ItemLista) => {
    if (lista?.status === 'concluida') return;
    const novo = !item.comprado;
    setSalvando(item.id);
    setItens(prev => prev.map(i => i.id === item.id ? { ...i, comprado: novo, comprado_em: novo ? new Date().toISOString() : null } : i));

    await fetch(`${SUPABASE_URL}/rest/v1/listas_compra_itens?id=eq.${item.id}`, {
      method: 'PATCH', headers: { ...headers, Prefer: 'return=minimal' },
      body: JSON.stringify({ comprado: novo, comprado_em: novo ? new Date().toISOString() : null }),
    });

    // Atualiza contagem na lista
    const r = await fetch(`${SUPABASE_URL}/rest/v1/listas_compra?id=eq.${id}&select=*`, { headers });
    const d = await r.json();
    if (d[0]) setLista(d[0]);
    setSalvando(null);
  };

  const categorias = [...new Set(itens.map(i => i.categoria))].sort();
  const totalComprados = itens.filter(i => i.comprado).length;
  const pct = itens.length > 0 ? Math.round((totalComprados / itens.length) * 100) : 0;

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#080c14' }}>
      <div className="flex flex-col items-center gap-4">
        <RefreshCw size={28} className="animate-spin text-white/40" />
        <p className="text-white/40 text-sm">Carregando lista...</p>
      </div>
    </div>
  );

  if (erro) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#080c14' }}>
      <div className="text-center">
        <Package size={48} className="mx-auto mb-4 text-white/20" />
        <p className="text-white/60 text-lg font-medium">{erro}</p>
      </div>
    </div>
  );

  if (!lista) return null;

  return (
    <div className="min-h-screen" style={{ background: '#080c14', color: '#e8edf8' }}>
      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg, #7D1F2C 0%, #5a1520 60%, #3d0f16 100%)' }}>
        <div className="max-w-2xl mx-auto px-4 py-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <ShoppingCart size={20} className="text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white leading-tight">{lista.numero}</h1>
              <p className="text-white/60 text-sm">{lista.titulo}</p>
            </div>
          </div>

          {/* Progresso */}
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.15)' }}>
              <div className="h-full bg-green-400 rounded-full transition-all duration-500" style={{ width: `${pct}%` }} />
            </div>
            <span className="text-white font-semibold text-sm min-w-[60px] text-right">{totalComprados}/{itens.length}</span>
          </div>

          {lista.status === 'concluida' && (
            <div className="mt-3 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/30 w-fit">
              <CheckCircle2 size={14} className="text-green-400" />
              <span className="text-green-400 text-xs font-medium">Lista concluída</span>
            </div>
          )}
        </div>
      </div>

      {/* Itens */}
      <div className="max-w-2xl mx-auto px-4 py-4 space-y-3">
        {categorias.map(cat => {
          const itensCat = itens.filter(i => i.categoria === cat);
          const comprados = itensCat.filter(i => i.comprado).length;
          const isExp = expandidas.has(cat);
          return (
            <div key={cat} className="rounded-2xl overflow-hidden" style={{ background: '#101520', border: '1px solid rgba(255,255,255,0.08)' }}>
              <button
                onClick={() => setExpandidas(prev => { const s = new Set(prev); if (s.has(cat)) s.delete(cat); else s.add(cat); return s; })}
                className="w-full flex items-center justify-between px-4 py-3 transition-colors hover:bg-white/5"
              >
                <div className="flex items-center gap-2">
                  {isExp ? <ChevronDown size={15} className="text-white/30" /> : <ChevronRight size={15} className="text-white/30" />}
                  <span className="font-semibold text-white/90 text-sm">{cat}</span>
                  <span className="text-xs text-white/30">{itensCat.length} itens</span>
                </div>
                {comprados > 0 && (
                  <span className="text-xs text-green-400 font-medium">{comprados}/{itensCat.length} ✓</span>
                )}
              </button>

              {isExp && (
                <div className="divide-y" style={{ borderColor: 'rgba(255,255,255,0.05)' }}>
                  {itensCat.map(item => (
                    <button
                      key={item.id}
                      onClick={() => toggleComprado(item)}
                      disabled={salvando === item.id}
                      className={`w-full flex items-start gap-3 px-4 py-3.5 text-left transition-all active:scale-[0.99] ${item.comprado ? 'opacity-60' : ''} ${salvando === item.id ? 'opacity-40' : ''}`}
                      style={item.comprado ? { background: 'rgba(34,197,94,0.06)' } : undefined}
                    >
                      <div className="flex-shrink-0 mt-0.5">
                        {item.comprado
                          ? <CheckCircle2 size={24} className="text-green-400" />
                          : <Circle size={24} className="text-white/25" />
                        }
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold ${item.comprado ? 'line-through text-white/30' : 'text-white/90'}`}>
                          {item.nome_item}
                        </p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          <span className="text-base font-bold text-white">{fmt(item.quantidade_comprar, item.quantidade_comprar % 1 === 0 ? 0 : 2)} <span className="text-xs font-normal text-white/50">{item.unidade_medida}</span></span>
                          {item.tipo_compra && item.tipo_compra !== 'todos' && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${TIPO_COLOR[item.tipo_compra] || ''}`}>
                              {item.tipo_compra === 'rua' ? 'Rua' : 'Fornecedor'}
                            </span>
                          )}
                        </div>
                        {item.fornecedor_nome && (
                          <p className="text-xs text-blue-400 mt-0.5">{item.fornecedor_nome}{item.fornecedor_tel && ` · ${item.fornecedor_tel}`}</p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}

        {itens.length === 0 && (
          <div className="text-center py-16 text-white/30">
            <Package size={32} className="mx-auto mb-3 opacity-40" />
            <p>Nenhum item nesta lista</p>
          </div>
        )}

        <p className="text-center text-xs text-white/20 py-4">
          Gerado em {new Date(lista.criado_em).toLocaleString('pt-BR')} · Toque para marcar como comprado
        </p>
      </div>
    </div>
  );
}
