import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Package, AlertTriangle, DollarSign, Activity, RefreshCw,
  ShoppingCart, ClipboardList, BarChart2, ShieldCheck, ShieldAlert,
  Zap, ClipboardCheck, ArrowLeftRight, Snowflake, Tag, ChevronRight, Loader2,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

// ─── Formatação ──────────────────────────────────────────────────────────────
function fmtQtd(n: number | string | null | undefined): string {
  const num = Number(n ?? 0);
  if (isNaN(num)) return '0';
  return parseFloat(num.toFixed(3)).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}
function fmtCurrency(n: number | null | undefined): string {
  return Number(n ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 });
}
function fmtData(d: string | null | undefined): string {
  if (!d) return '—';
  const [y, m, day] = d.slice(0, 10).split('-');
  return `${day}/${m}/${y.slice(2)}`;
}
function fmtHora(ts: string): string {
  try { return new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); } catch { return ''; }
}
function diasDesde(ts: string | null | undefined): number | null {
  if (!ts) return null;
  return Math.floor((Date.now() - new Date(ts).getTime()) / 86400000);
}

// ─── Payload de fn_dashboard_estoque ─────────────────────────────────────────
interface Posicao {
  item_id: string; estoque_id: string; nome: string; estoque: string;
  qtd: number; um: string; valor?: number; ultima_saida?: string | null;
}
interface MovHoje {
  id: string; tipo: string; item: string; qtd: number; um: string;
  origem: string | null; destino: string | null; origem_tipo: string | null; hora: string;
}
interface Dashboard {
  gerado_em: string;
  hoje: string;
  saude: {
    zig: { ultima: string | null; itens: number | null; movs: number | null; dias_atraso: number; dias_sem_baixa_30d: number; sem_mapeamento_7d: number };
    contagens: { estoque: string; ultima: string | null }[];
    divergencias: number;
    transferencias_pendentes: number;
  };
  dinheiro: {
    valor_total: number; posicoes: number; itens: number; itens_ativos: number;
    por_estoque: { estoque: string; valor: number; itens: number }[];
    por_categoria: { categoria: string; valor: number; itens: number }[];
    compras_7d: number; compras_30d: number; vendido_7d: number; vendido_30d: number;
    parados: { posicoes: number; valor: number; lista: Posicao[] };
  };
  acao: {
    central: { zerados: number; comprar: number; atencao: number };
    negativos: Posicao[];
    sem_custo: Posicao[];
    hoje: { total: number; entradas: number; saidas: number; transferencias: number; ajustes: number; ultimas: MovHoje[] };
  };
}

const TIPO_LABEL: Record<string, string> = {
  entrada: 'Entrada', saida: 'Saída', transferencia: 'Transf.', ajuste: 'Ajuste',
};
function tipoColor(tipo: string) {
  if (tipo === 'entrada') return 'bg-green-500/15 text-green-300';
  if (tipo === 'saida') return 'bg-red-500/15 text-red-300';
  if (tipo === 'ajuste') return 'bg-amber-500/15 text-amber-300';
  return 'bg-blue-500/15 text-blue-300';
}
const ORIGEM_LABEL: Record<string, string> = {
  compra: 'compra', zig: 'venda ZIG', requisicao: 'transferência', contagem: 'contagem',
  zeragem: 'zeragem', manual: 'manual', producao: 'produção',
};

type Tom = 'ok' | 'atencao' | 'erro' | 'neutro';
const TOM: Record<Tom, string> = {
  ok:      'border-green-500/30 bg-green-500/10 text-green-300',
  atencao: 'border-amber-500/30 bg-amber-500/10 text-amber-300',
  erro:    'border-red-500/40 bg-red-500/10 text-red-300',
  neutro:  'border-white/10 bg-white/5 text-white/70',
};

export default function DashboardEstoque({ onNavigate }: { onNavigate?: (tab: string) => void }) {
  const navigate = useNavigate();
  const [dados, setDados] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true); setErro(null);
    try {
      const { data, error } = await supabase.rpc('fn_dashboard_estoque');
      if (error) throw error;
      setDados(data as Dashboard);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar o dashboard');
    } finally {
      setLoading(false);
    }
  }

  const abrirExtrato = (p: Posicao) =>
    navigate(`/advanced-inventory?area=analise&tela=kardex&item=${p.item_id}&estoque=${p.estoque_id}`);

  if (loading && !dados) return (
    <div className="flex items-center justify-center py-20">
      <div className="animate-spin rounded-full h-8 w-8 border-2 border-white/10 border-t-[#D4AF37]" />
    </div>
  );

  if (erro || !dados) return (
    <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-5 text-red-300 text-sm">
      {erro || 'Sem dados'}
      <button onClick={load} className="ml-3 underline">tentar de novo</button>
    </div>
  );

  const { saude, dinheiro, acao } = dados;

  // ── Semáforos ──
  const zigTom: Tom = saude.zig.dias_atraso <= 0 ? 'ok' : saude.zig.dias_atraso === 1 ? 'atencao' : 'erro';
  const zigTexto = !saude.zig.ultima
    ? 'Nenhuma baixa registrada'
    : saude.zig.dias_atraso <= 0
      ? `Última: ${fmtData(saude.zig.ultima)} · ${saude.zig.itens} itens`
      : `Parada há ${saude.zig.dias_atraso} dia${saude.zig.dias_atraso > 1 ? 's' : ''} · última ${fmtData(saude.zig.ultima)}`;

  const contagemMaisVelha = Math.max(...saude.contagens.filter(c => c.ultima).map(c => diasDesde(c.ultima) ?? 0), 0);
  const contagemTom: Tom = contagemMaisVelha <= 7 ? 'ok' : contagemMaisVelha <= 15 ? 'atencao' : 'erro';

  const maxEstoque = Math.max(...dinheiro.por_estoque.map(e => e.valor), 1);
  const maxCategoria = Math.max(...dinheiro.por_categoria.map(c => c.valor), 1);

  return (
    <div className="space-y-6">

      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/50">
          Calculado agora do histórico de movimentações · {fmtHora(dados.gerado_em)}
        </p>
        <button onClick={load} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors" title="Atualizar">
          {loading ? <Loader2 className="w-4 h-4 text-white/40 animate-spin" /> : <RefreshCw className="w-4 h-4 text-white/40" />}
        </button>
      </div>

      {/* ── Saúde do sistema ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
        <button onClick={() => onNavigate?.('zig')} className={`text-left rounded-xl border px-4 py-3.5 transition-colors hover:brightness-110 ${TOM[zigTom]}`}>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-4 h-4 shrink-0" />
            <p className="text-xs font-semibold uppercase tracking-wide">Baixa ZIG</p>
          </div>
          <p className="text-sm font-bold text-white">{zigTexto}</p>
          <p className="text-xs mt-1 opacity-80">
            {saude.zig.dias_sem_baixa_30d > 0 && `${saude.zig.dias_sem_baixa_30d} dias sem baixa nos últimos 30`}
            {saude.zig.dias_sem_baixa_30d > 0 && saude.zig.sem_mapeamento_7d > 0 && ' · '}
            {saude.zig.sem_mapeamento_7d > 0 && `${saude.zig.sem_mapeamento_7d} produtos vendidos sem mapeamento`}
            {saude.zig.dias_sem_baixa_30d === 0 && saude.zig.sem_mapeamento_7d === 0 && 'Todos os dias baixados, tudo mapeado'}
          </p>
        </button>

        <button onClick={() => onNavigate?.('contagem')} className={`text-left rounded-xl border px-4 py-3.5 transition-colors hover:brightness-110 ${TOM[contagemTom]}`}>
          <div className="flex items-center gap-2 mb-1">
            <ClipboardCheck className="w-4 h-4 shrink-0" />
            <p className="text-xs font-semibold uppercase tracking-wide">Última contagem</p>
          </div>
          <div className="text-sm font-bold text-white space-y-0.5">
            {saude.contagens.filter(c => c.ultima).map(c => (
              <p key={c.estoque} className="flex justify-between gap-2">
                <span className="truncate">{c.estoque.replace('Estoque ', '')}</span>
                <span className="shrink-0 font-normal">{fmtData(c.ultima)}</span>
              </p>
            ))}
          </div>
          <p className="text-xs mt-1 opacity-80">
            {saude.contagens.filter(c => !c.ultima).length > 0 && `Sem contagem: ${saude.contagens.filter(c => !c.ultima).map(c => c.estoque.replace('Estoque ', '')).join(', ')}`}
          </p>
        </button>

        <button onClick={() => onNavigate?.('inventario')} className={`text-left rounded-xl border px-4 py-3.5 transition-colors hover:brightness-110 ${TOM[saude.divergencias === 0 ? 'ok' : 'erro']}`}>
          <div className="flex items-center gap-2 mb-1">
            {saude.divergencias === 0 ? <ShieldCheck className="w-4 h-4 shrink-0" /> : <ShieldAlert className="w-4 h-4 shrink-0" />}
            <p className="text-xs font-semibold uppercase tracking-wide">Saldos × histórico</p>
          </div>
          <p className="text-sm font-bold text-white">
            {saude.divergencias === 0 ? 'Conferem' : `${saude.divergencias} divergência${saude.divergencias > 1 ? 's' : ''}`}
          </p>
          <p className="text-xs mt-1 opacity-80">
            {saude.divergencias === 0 ? 'Cada saldo bate com a soma das movimentações' : 'Saldo gravado diferente do que o histórico diz'}
          </p>
        </button>

        <button onClick={() => onNavigate?.('requisicoes')} className={`text-left rounded-xl border px-4 py-3.5 transition-colors hover:brightness-110 ${TOM[saude.transferencias_pendentes === 0 ? 'ok' : 'atencao']}`}>
          <div className="flex items-center gap-2 mb-1">
            <ArrowLeftRight className="w-4 h-4 shrink-0" />
            <p className="text-xs font-semibold uppercase tracking-wide">Transferências</p>
          </div>
          <p className="text-sm font-bold text-white">
            {saude.transferencias_pendentes === 0 ? 'Nada pendente' : `${saude.transferencias_pendentes} aguardando entrega`}
          </p>
          <p className="text-xs mt-1 opacity-80">Reposição de balcão e pedidos internos</p>
        </button>
      </div>

      {/* ── Dinheiro ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-[#12141f] border border-white/10 rounded-xl p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-1">Valor em estoque</p>
              <p className="text-2xl font-bold text-white truncate">{fmtCurrency(dinheiro.valor_total)}</p>
              <p className="text-xs text-white/50 mt-1">{dinheiro.itens} itens com saldo · {dinheiro.posicoes} posições · {dinheiro.itens_ativos} cadastrados</p>
            </div>
            <div className="bg-green-500/10 p-2.5 rounded-xl shrink-0"><DollarSign className="w-5 h-5 text-green-400" /></div>
          </div>
        </div>

        <div className="bg-[#12141f] border border-white/10 rounded-xl p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-1">Comprado</p>
              <p className="text-2xl font-bold text-white truncate">{fmtCurrency(dinheiro.compras_7d)}</p>
              <p className="text-xs text-white/50 mt-1">últimos 7 dias · {fmtCurrency(dinheiro.compras_30d)} em 30 dias</p>
            </div>
            <div className="bg-emerald-500/10 p-2.5 rounded-xl shrink-0"><ShoppingCart className="w-5 h-5 text-emerald-400" /></div>
          </div>
        </div>

        <div className="bg-[#12141f] border border-white/10 rounded-xl p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-1">Custo do vendido</p>
              <p className="text-2xl font-bold text-white truncate">{fmtCurrency(dinheiro.vendido_7d)}</p>
              <p className="text-xs text-white/50 mt-1">baixa ZIG, 7 dias · {fmtCurrency(dinheiro.vendido_30d)} em 30 dias</p>
            </div>
            <div className="bg-amber-500/10 p-2.5 rounded-xl shrink-0"><Activity className="w-5 h-5 text-amber-400" /></div>
          </div>
        </div>

        <div className="bg-[#12141f] border border-white/10 rounded-xl p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-1">Estoque parado</p>
              <p className="text-2xl font-bold text-white truncate">{fmtCurrency(dinheiro.parados.valor)}</p>
              <p className="text-xs text-white/50 mt-1">{dinheiro.parados.posicoes} posições sem saída há 60 dias</p>
            </div>
            <div className="bg-sky-500/10 p-2.5 rounded-xl shrink-0"><Snowflake className="w-5 h-5 text-sky-400" /></div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Por estoque */}
        <div className="bg-[#12141f] border border-white/10 rounded-xl p-5">
          <h3 className="font-bold text-white mb-4">Onde está o dinheiro</h3>
          <div className="space-y-3">
            {dinheiro.por_estoque.map(e => (
              <div key={e.estoque}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-white/80">{e.estoque.replace('Estoque ', '')}</span>
                  <span className="text-white font-semibold tabular-nums">{fmtCurrency(e.valor)}</span>
                </div>
                <div className="h-2 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full bg-[#D4AF37]" style={{ width: `${(e.valor / maxEstoque) * 100}%` }} />
                </div>
                <p className="text-caption text-white/40 mt-0.5">{e.itens} itens</p>
              </div>
            ))}
          </div>
        </div>

        {/* Por categoria */}
        <div className="bg-[#12141f] border border-white/10 rounded-xl p-5">
          <h3 className="font-bold text-white mb-4">Por categoria</h3>
          <div className="space-y-2.5">
            {dinheiro.por_categoria.map(c => (
              <div key={c.categoria}>
                <div className="flex justify-between text-sm mb-0.5">
                  <span className="text-white/80 truncate">{c.categoria}</span>
                  <span className="text-white font-semibold tabular-nums shrink-0 ml-2">{fmtCurrency(c.valor)}</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full rounded-full bg-blue-400/70" style={{ width: `${(c.valor / maxCategoria) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Parados */}
        <div className="bg-[#12141f] border border-white/10 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <Snowflake className="w-4 h-4 text-sky-400" />
            <h3 className="font-bold text-white">Parado há mais de 60 dias</h3>
          </div>
          <p className="text-xs text-white/50 mb-4">Tem saldo e nenhuma saída registrada. Ou está estragando, ou saiu sem registro.</p>
          {dinheiro.parados.lista.length === 0 ? (
            <p className="text-white/50 text-sm text-center py-6">Nada parado</p>
          ) : (
            <div className="divide-y divide-white/5">
              {dinheiro.parados.lista.map(p => (
                <button key={`${p.item_id}|${p.estoque_id}`} onClick={() => abrirExtrato(p)}
                  className="w-full flex items-center justify-between gap-3 py-2 text-left hover:bg-white/5 rounded-lg px-1 -mx-1">
                  <div className="min-w-0">
                    <p className="text-sm text-white truncate">{p.nome.trim()}</p>
                    <p className="text-xs text-white/50">{p.estoque.replace('Estoque ', '')} · {fmtQtd(p.qtd)} {p.um} · {p.ultima_saida ? `última saída ${fmtData(p.ultima_saida)}` : 'nunca saiu'}</p>
                  </div>
                  <span className="text-sm font-semibold text-white tabular-nums shrink-0">{fmtCurrency(p.valor)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Ação de hoje ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Central: comprar */}
        <div className="space-y-4">
          <button onClick={() => onNavigate?.('dia')} className="w-full text-left bg-[#12141f] border border-white/10 rounded-xl p-5 hover:border-wine/60 transition-colors group">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-white flex items-center gap-2"><ShoppingCart className="w-4 h-4 text-emerald-400" /> Central precisa comprar</h3>
              <ChevronRight className="w-4 h-4 text-white/30 group-hover:text-white/70" />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="bg-red-500/10 rounded-lg py-2">
                <p className="text-xl font-bold text-red-300">{acao.central.zerados}</p>
                <p className="text-caption text-white/50">zerados</p>
              </div>
              <div className="bg-amber-500/10 rounded-lg py-2">
                <p className="text-xl font-bold text-amber-300">{acao.central.comprar}</p>
                <p className="text-caption text-white/50">comprar</p>
              </div>
              <div className="bg-yellow-500/10 rounded-lg py-2">
                <p className="text-xl font-bold text-yellow-300">{acao.central.atencao}</p>
                <p className="text-caption text-white/50">atenção</p>
              </div>
            </div>
            <p className="text-xs text-white/50 mt-3">Mesmo motor da Compras do dia. Clique para montar a lista.</p>
          </button>

          {/* Sem custo */}
          {acao.sem_custo.length > 0 && (
            <div className="bg-[#12141f] border border-white/10 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <Tag className="w-4 h-4 text-white/50" />
                <h3 className="font-bold text-white">Sem custo cadastrado</h3>
              </div>
              <p className="text-xs text-white/50 mb-3">{acao.sem_custo.length} posições com saldo valendo R$ 0 em qualquer conta.</p>
              <div className="space-y-1">
                {acao.sem_custo.slice(0, 6).map(p => (
                  <button key={`${p.item_id}|${p.estoque_id}`} onClick={() => onNavigate?.('itens')}
                    className="w-full flex justify-between text-xs text-left hover:bg-white/5 rounded px-1 py-0.5">
                    <span className="text-white/80 truncate">{p.nome.trim()}</span>
                    <span className="text-white/40 shrink-0 ml-2">{p.estoque.replace('Estoque ', '')} · {fmtQtd(p.qtd)} {p.um}</span>
                  </button>
                ))}
                {acao.sem_custo.length > 6 && <p className="text-caption text-white/40">+{acao.sem_custo.length - 6}</p>}
              </div>
            </div>
          )}
        </div>

        {/* Negativos */}
        <div className={`rounded-xl p-5 border ${acao.negativos.length > 0 ? 'bg-red-500/10 border-red-500/30' : 'bg-[#12141f] border-white/10'}`}>
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className={`w-4 h-4 ${acao.negativos.length > 0 ? 'text-red-400' : 'text-white/40'}`} />
            <h3 className="font-bold text-white">
              {acao.negativos.length === 0 ? 'Nenhum saldo negativo' : `${acao.negativos.length} saldo${acao.negativos.length > 1 ? 's' : ''} negativo${acao.negativos.length > 1 ? 's' : ''}`}
            </h3>
          </div>
          <p className="text-xs text-white/50 mb-3">Saiu mais do que entrou. Clique para ver o extrato e achar o furo.</p>
          <div className="divide-y divide-white/5 max-h-[420px] overflow-y-auto">
            {acao.negativos.map(p => (
              <button key={`${p.item_id}|${p.estoque_id}`} onClick={() => abrirExtrato(p)}
                className="w-full flex items-center justify-between gap-3 py-2 text-left hover:bg-white/5 rounded-lg px-1 -mx-1">
                <div className="min-w-0">
                  <p className="text-sm text-white truncate">{p.nome.trim()}</p>
                  <p className="text-xs text-white/50">{p.estoque.replace('Estoque ', '')}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-bold text-red-300 tabular-nums">{fmtQtd(p.qtd)} {p.um}</p>
                  <p className="text-caption text-white/40">{fmtCurrency(p.valor)}</p>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Movimentações de hoje */}
        <div className="bg-[#12141f] border border-white/10 rounded-xl p-5">
          <div className="flex items-center justify-between mb-1">
            <h3 className="font-bold text-white">Hoje · {acao.hoje.total} movimentações</h3>
          </div>
          <p className="text-xs text-white/50 mb-3">
            {acao.hoje.entradas} entradas · {acao.hoje.saidas} saídas · {acao.hoje.transferencias} transferências
            {acao.hoje.ajustes > 0 && ` · ${acao.hoje.ajustes} ajustes`}
          </p>
          {acao.hoje.ultimas.length === 0 ? (
            <p className="text-white/50 text-sm text-center py-6">Nenhuma movimentação hoje</p>
          ) : (
            <div className="space-y-1.5 max-h-[420px] overflow-y-auto">
              {acao.hoje.ultimas.map(m => (
                <div key={m.id} className="flex items-center gap-2.5 py-1.5 px-2 bg-white/5 rounded-lg">
                  <span className={`text-caption px-1.5 py-0.5 rounded font-semibold shrink-0 ${tipoColor(m.tipo)}`}>
                    {TIPO_LABEL[m.tipo] || m.tipo}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{m.item.trim()}</p>
                    <p className="text-caption text-white/50 truncate">
                      {m.tipo === 'transferencia'
                        ? `${m.origem?.replace('Estoque ', '')} → ${m.destino?.replace('Estoque ', '')}`
                        : (m.destino || m.origem || '').replace('Estoque ', '')}
                      {m.origem_tipo && ` · ${ORIGEM_LABEL[m.origem_tipo] || m.origem_tipo}`}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-semibold text-white tabular-nums">{fmtQtd(m.qtd)} {m.um}</p>
                    <p className="text-caption text-white/40">{fmtHora(m.hora)}</p>
                  </div>
                </div>
              ))}
              {acao.hoje.total > acao.hoje.ultimas.length && (
                <p className="text-caption text-white/40 text-center pt-1">mostrando as últimas {acao.hoje.ultimas.length} de {acao.hoje.total}</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Ações rápidas ────────────────────────────────────────────────── */}
      <div className="bg-[#12141f] border border-white/10 rounded-xl p-5">
        <h3 className="font-bold text-white mb-4">Ações Rápidas</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Nova Compra',      icon: ShoppingCart,  color: 'text-emerald-400', bg: 'bg-emerald-500/10 hover:bg-emerald-500/20 border-emerald-500/30', tab: 'compras' },
            { label: 'Nova Requisição',  icon: ClipboardList, color: 'text-blue-400',    bg: 'bg-blue-500/10 hover:bg-blue-500/20 border-blue-500/30',          tab: 'requisicoes' },
            { label: 'Nova Contagem',    icon: Package,       color: 'text-amber-400',   bg: 'bg-amber-500/10 hover:bg-amber-500/20 border-amber-500/30',       tab: 'contagem' },
            { label: 'Ver Inventário',   icon: BarChart2,     color: 'text-white/60',    bg: 'bg-white/5 hover:bg-white/10 border-white/10',                     tab: 'inventario' },
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
  );
}
