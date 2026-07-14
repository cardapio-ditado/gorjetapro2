import { useEffect, useState } from 'react';
import {
  Package, AlertTriangle, DollarSign, Activity,
  TrendingDown, TrendingUp, ArrowRight, RefreshCw,
  ShoppingCart, ClipboardList, BarChart2, PlusCircle,
  ShieldCheck, ShieldAlert, ChevronDown, ChevronUp,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

function fmtQtd(n: number | string): string {
  const num = Number(n);
  if (isNaN(num)) return '0';
  return parseFloat(num.toFixed(3)).toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function fmtCurrency(n: number): string {
  return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

interface NegativoItem {
  item_id: string;
  estoque_id: string;
  quantidade_atual: number;
  itens_estoque: { nome: string; codigo: string | null } | null;
  estoques: { nome: string } | null;
}

interface MovItem {
  id: string;
  tipo_movimentacao: string;
  quantidade: number;
  data_movimentacao: string;
  item: { nome: string; codigo: string | null } | null;
  estoque_origem: { nome: string } | null;
  estoque_destino: { nome: string } | null;
}

const TIPO_LABEL: Record<string, string> = {
  entrada: 'Entrada', saida: 'Saída', transferencia: 'Transf.',
  ajuste_positivo: 'Aj.+', ajuste_negativo: 'Aj.-',
  producao: 'Produção', consumo: 'Consumo', perda: 'Perda',
  venda: 'Venda', devolucao: 'Devolução',
};

function tipoColor(tipo: string) {
  if (['entrada', 'producao', 'devolucao', 'ajuste_positivo'].includes(tipo))
    return 'bg-green-500/15 text-green-300';
  if (['saida', 'consumo', 'perda', 'venda', 'ajuste_negativo'].includes(tipo))
    return 'bg-red-500/15 text-red-300';
  return 'bg-blue-500/15 text-blue-300';
}

export default function DashboardEstoque({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const [totalItens, setTotalItens] = useState(0);
  const [valorTotal, setValorTotal] = useState(0);
  const [movsHoje, setMovsHoje] = useState(0);
  const [itensNegativos, setItensNegativos] = useState<NegativoItem[]>([]);
  const [movsRecentes, setMovsRecentes] = useState<MovItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [mostrarNegativos, setMostrarNegativos] = useState(false);
  const [divergencias, setDivergencias] = useState<any[]>([]);
  const [loadingIntegridade, setLoadingIntegridade] = useState(true);
  const [mostrarDivergencias, setMostrarDivergencias] = useState(false);

  useEffect(() => { load(); loadIntegridade(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [saldosRes, negativosRes, movsRes] = await Promise.all([
        supabase.from('saldos_estoque').select('quantidade_atual, valor_total'),
        supabase
          .from('saldos_estoque')
          .select('item_id, estoque_id, quantidade_atual, itens_estoque(nome, codigo), estoques(nome)')
          .lt('quantidade_atual', 0)
          .order('quantidade_atual', { ascending: true })
          .limit(10),
        supabase
          .from('movimentacoes_estoque')
          .select('id, tipo_movimentacao, quantidade, data_movimentacao, item:itens_estoque(nome,codigo), estoque_origem:estoque_origem_id(nome), estoque_destino:estoque_destino_id(nome)')
          .eq('data_movimentacao', new Date().toISOString().split('T')[0])
          .order('criado_em', { ascending: false })
          .limit(10),
      ]);

      const saldos = saldosRes.data || [];
      setTotalItens(saldos.length);
      setValorTotal(saldos.reduce((s, r) => s + (r.valor_total || 0), 0));
      setItensNegativos((negativosRes.data || []) as unknown as NegativoItem[]);
      setMovsHoje(movsRes.data?.length || 0);
      setMovsRecentes((movsRes.data || []) as unknown as MovItem[]);
    } catch (e) {
      console.error('Dashboard estoque:', e);
    } finally {
      setLoading(false);
    }
  }

  async function loadIntegridade() {
    setLoadingIntegridade(true);
    try {
      const { data } = await supabase.from('vw_conciliacao_saldos').select('*').limit(50);
      setDivergencias(data || []);
    } catch {
      setDivergencias([]);
    } finally {
      setLoadingIntegridade(false);
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-white/10 border-t-[#D4AF37]" />
    </div>
  );

  return (
    <div className="space-y-6">

      {/* Selo de integridade */}
      {!loadingIntegridade && (
        divergencias.length === 0 ? (
          <div className="flex items-center gap-3 px-5 py-3.5 bg-green-500/10 border border-green-500/20 rounded-xl">
            <ShieldCheck className="w-5 h-5 text-green-400 shrink-0" />
            <p className="text-green-300 text-sm font-semibold">Estoque íntegro — saldos e histórico conferem</p>
          </div>
        ) : (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-3.5">
              <div className="flex items-center gap-3">
                <ShieldAlert className="w-5 h-5 text-red-400 shrink-0" />
                <p className="text-red-300 text-sm font-semibold">
                  {divergencias.length} divergência{divergencias.length !== 1 ? 's' : ''} encontrada{divergencias.length !== 1 ? 's' : ''}
                </p>
              </div>
              <button
                onClick={() => setMostrarDivergencias(v => !v)}
                className="flex items-center gap-1 text-red-400 text-xs hover:text-red-300"
              >
                {mostrarDivergencias ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                {mostrarDivergencias ? 'Ocultar' : 'Ver detalhes'}
              </button>
            </div>
            {mostrarDivergencias && (
              <div className="border-t border-red-500/20 overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-red-500/10">
                      {['Estoque', 'Item', 'Saldo', 'Histórico', 'Divergência', 'Impacto'].map(h => (
                        <th key={h} className="text-left px-4 py-2 text-red-400/60 font-semibold">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {divergencias.map((d, i) => (
                      <tr key={i} className="border-b border-red-500/5">
                        <td className="px-4 py-2 text-white/60">{d.estoque || d.estoque_nome || '—'}</td>
                        <td className="px-4 py-2 text-white/80 font-medium">{d.item || d.item_nome || '—'}</td>
                        <td className="px-4 py-2 text-white/60">{Number(d.saldo_tela ?? 0).toFixed(3)}</td>
                        <td className="px-4 py-2 text-white/60">{Number(d.saldo_historico ?? 0).toFixed(3)}</td>
                        <td className="px-4 py-2 text-red-300 font-semibold">{Number(d.divergencia ?? 0).toFixed(3)}</td>
                        <td className="px-4 py-2 text-red-300">{d.impacto_reais != null ? `R$ ${Number(d.impacto_reais).toFixed(2)}` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total de Itens',       value: totalItens.toString(),    icon: Package,       color: 'text-blue-400',   bg: 'bg-blue-500/10' },
          { label: 'Valor em Estoque',     value: fmtCurrency(valorTotal),  icon: DollarSign,    color: 'text-green-400',  bg: 'bg-green-500/10' },
          { label: 'Movimentações Hoje',   value: movsHoje.toString(),      icon: Activity,      color: 'text-amber-400',  bg: 'bg-amber-500/10' },
          { label: 'Itens com Problema',   value: itensNegativos.length.toString(), icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-500/10' },
        ].map(({ label, value, icon: Icon, color, bg }) => (
          <div key={label} className="bg-[#12141f] border border-white/10 rounded-xl p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-1">{label}</p>
                <p className="text-xl font-bold text-white truncate">{value}</p>
              </div>
              <div className={`${bg} p-2.5 rounded-xl shrink-0`}>
                <Icon className={`w-5 h-5 ${color}`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Alerta negativos */}
      {itensNegativos.length > 0 && (
        <div className="bg-red-500/10 border-2 border-red-500/40 rounded-xl p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3 min-w-0">
              <div className="bg-red-500/20 p-2.5 rounded-xl shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-red-300 mb-0.5">
                  {itensNegativos.length} {itensNegativos.length === 1 ? 'item com' : 'itens com'} saldo NEGATIVO
                </h3>
                <p className="text-sm text-red-400/80">
                  Esses itens tiveram saída antes da entrada registrada. Regularize para manter o estoque preciso.
                </p>
              </div>
            </div>
            <button
              onClick={() => setMostrarNegativos(v => !v)}
              className="flex items-center gap-1.5 px-3 py-2 bg-red-600 text-white rounded-xl text-sm font-semibold hover:bg-red-700 shrink-0"
            >
              {mostrarNegativos ? 'Ocultar' : 'Ver Detalhes'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>

          {mostrarNegativos && (
            <div className="mt-4 border-t border-red-500/20 pt-4 space-y-2">
              {itensNegativos.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-2 px-3 bg-red-500/10 rounded-xl">
                  <div className="min-w-0">
                    <p className="font-semibold text-white text-sm truncate">
                      {item.itens_estoque?.nome || item.item_id}
                    </p>
                    <p className="text-xs text-red-400/70 mt-0.5">
                      {item.estoques?.nome} · {item.itens_estoque?.codigo || '—'}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 ml-3 shrink-0">
                    <TrendingDown className="w-4 h-4 text-red-400" />
                    <span className="font-bold text-red-300 tabular-nums">{fmtQtd(item.quantidade_atual)}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Grid: negativos + movimentações */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Movimentações de hoje */}
        <div className="bg-[#12141f] border border-white/10 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold text-white">Movimentações de Hoje</h3>
            <button onClick={load} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
              <RefreshCw className="w-4 h-4 text-white/40" />
            </button>
          </div>
          {movsRecentes.length === 0 ? (
            <p className="text-white/30 text-sm text-center py-8">Nenhuma movimentação hoje</p>
          ) : (
            <div className="space-y-2">
              {movsRecentes.map(mov => (
                <div key={mov.id} className="flex items-center gap-3 py-2 px-3 bg-white/5 rounded-xl">
                  <span className={`text-xs px-2 py-1 rounded-lg font-semibold shrink-0 ${tipoColor(mov.tipo_movimentacao)}`}>
                    {TIPO_LABEL[mov.tipo_movimentacao] || mov.tipo_movimentacao}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {mov.item?.nome || '—'}
                    </p>
                    <p className="text-xs text-white/30 truncate">
                      {mov.estoque_origem?.nome && `De: ${mov.estoque_origem.nome}`}
                      {mov.estoque_destino?.nome && ` Para: ${mov.estoque_destino.nome}`}
                    </p>
                  </div>
                  <span className="text-sm font-bold text-white tabular-nums shrink-0">
                    {fmtQtd(mov.quantidade)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ações rápidas */}
        <div className="bg-[#12141f] border border-white/10 rounded-xl p-5">
          <h3 className="font-bold text-white mb-4">Ações Rápidas</h3>
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Nova Compra',      icon: ShoppingCart, color: 'text-emerald-400', bg: 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30', tab: 'compras' },
              { label: 'Nova Requisição',  icon: ClipboardList, color: 'text-blue-400',   bg: 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30',   tab: 'requisicoes' },
              { label: 'Nova Contagem',    icon: Package,       color: 'text-amber-400',  bg: 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30',  tab: 'contagem' },
              { label: 'Ver Inventário',   icon: BarChart2,     color: 'text-white/60',   bg: 'bg-white/5 hover:bg-white/10 border-white/10',              tab: 'inventario' },
            ].map(({ label, icon: Icon, color, bg, tab }) => (
              <button
                key={tab}
                onClick={() => onNavigate?.(tab)}
                className={`flex flex-col items-center justify-center gap-2.5 p-4 rounded-xl border-2 transition-all ${bg}`}
              >
                <Icon className={`w-7 h-7 ${color}`} />
                <span className="text-sm font-semibold text-white/70">{label}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
