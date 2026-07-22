import React, { useState, useEffect, useCallback } from 'react';
import {
  Music, Calendar, AlertTriangle, X, RefreshCw,
  UserCheck, UserX, Gift, Briefcase, MessageSquare, Package, BookOpen,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import ChatFinanceiroIA from '../components/financeiro/ChatFinanceiroIA';

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Blindados contra null/undefined (payload parcial durante recarga de sessão).
const fmtR = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtData = (d: string | null | undefined) => {
  if (!d) return '—';
  const dt = new Date(d + (d.includes('T') ? '' : 'T12:00'));
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

const diasAtraso = (d: string | null | undefined) => {
  if (!d) return 0;
  const dt = new Date(d + (d.includes('T') ? '' : 'T12:00'));
  if (isNaN(dt.getTime())) return 0;
  const diff = Date.now() - dt.getTime();
  return Math.max(0, Math.floor(diff / 86400000));
};

const saudacao = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
};

// ─── Tipos do payload da RPC canônica fn_dashboard_dono ──────────────────────
interface PainelDono {
  data: string;
  caixa: {
    hoje: { entradas: number; saidas: number };
    mes: { entradas: number; saidas: number };
    serie_14d: { data: string; entradas: number; saidas: number }[];
  };
  vendas: {
    data: string; total: number; bebidas: number; alimentos: number; outros: number;
    transacoes: number; mes: number;
    anterior: { data: string; total: number } | null;
    serie_14d: { data: string; total: number }[];
  } | null;
  cmv: {
    success: boolean; cmv: number; cmv_percentual: number | null;
    compras: number; avisos?: string[];
    faturamento?: { valor: number };
  };
  contas: {
    vencidas: { qtd: number; valor: number };
    semana: { qtd: number; valor: number };
    lista_vencidas: { id: string; descricao: string; categoria: string | null; valor: number; vencimento: string }[];
    lista_semana: { id: string; descricao: string; categoria: string | null; valor: number; vencimento: string }[];
  };
  equipe: {
    colaboradores: { ativos: number; ferias: number; afastados: number };
    caches: { qtd: number; valor: number; lista: { nome: string; data: string; total: number; pago: number; saldo: number }[] };
    extras: { qtd: number; valor: number; lista: { nome: string; funcao: string | null; setor: string | null; data: string; valor: number }[] };
    rh_contas: { qtd: number; valor: number; lista: { descricao: string; categoria: string; valor: number; vencimento: string }[] };
  };
  estoque: { valor_total: number; negativos: number; abaixo_minimo: number };
  diario: { pendencias: number; criticas: number; lista: { titulo: string; setor: string; gravidade: string; dias: number }[] };
  eventos: { nome: string; data: string; pessoas: number | null; valor: number | null; pagamento: string | null }[];
}

// ─── RadarRow — linha de alerta do painel lateral ────────────────────────────
function RadarRow({
  icon: Icon, label, valor, sub, sev, onClick,
}: {
  icon: React.ElementType; label: string; valor: string;
  sub?: string; sev: 'red' | 'amber' | 'ok'; onClick?: () => void;
}) {
  const cor = sev === 'red' ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.7)]'
    : sev === 'amber' ? 'bg-yellow-400 shadow-[0_0_8px_rgba(250,204,21,0.5)]'
    : 'bg-emerald-500';
  return (
    <button onClick={onClick}
      className="w-full flex items-center gap-3 px-3 py-3 rounded-xl hover:bg-white/[0.06] transition-colors text-left">
      <span className={`w-2 h-2 rounded-full shrink-0 ${cor}`} />
      <Icon className="w-4 h-4 text-white/35 shrink-0" />
      <span className="flex-1 min-w-0 text-[12.5px] font-semibold text-white/80 truncate">{label}</span>
      <span className="text-right shrink-0">
        <span className={`block text-sm font-black ${sev === 'red' ? 'text-red-400' : 'text-white'}`}>{valor}</span>
        {sub && <span className="block text-[10px] text-white/40">{sub}</span>}
      </span>
    </button>
  );
}

// ─── ListaScroll ──────────────────────────────────────────────────────────────
function ListaScroll({
  titulo, items, emptyMsg, renderItem, maxH = 'max-h-72',
}: {
  titulo: string; items: any[]; emptyMsg: string;
  renderItem: (item: any, i: number) => React.ReactNode; maxH?: string;
}) {
  const lista = items ?? [];
  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex justify-between items-center">
        <p className="text-sm font-bold text-white">{titulo}</p>
        <span className="text-xs text-white/50 font-medium">{lista.length} item{lista.length !== 1 ? 's' : ''}</span>
      </div>
      {lista.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-xs text-white/40">{emptyMsg}</p>
        </div>
      ) : (
        <div className={`${maxH} overflow-y-auto divide-y divide-white/5`}>
          {lista.map(renderItem)}
        </div>
      )}
    </div>
  );
}

// ─── ModalRH ──────────────────────────────────────────────────────────────────
function ModalRH({ contas, onClose }: { contas: PainelDono['equipe']['rh_contas']['lista']; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="glass-modal rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center">
          <h3 className="font-bold text-white">Custo RH — Contas em Aberto</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-xl">
            <X className="w-4 h-4 text-white/40" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-white/5">
          {(contas ?? []).map((c, i) => {
            const vencido = new Date(c.vencimento) < new Date();
            return (
              <div key={i} className={`px-5 py-3.5 flex items-center gap-3 ${vencido ? 'bg-red-500/5' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{c.descricao}</p>
                  <p className="text-[10px] text-white/50 mt-0.5">
                    {c.categoria} · vence {fmtData(c.vencimento)}
                    {vencido && <span className="text-red-400 ml-1">· {diasAtraso(c.vencimento)}d atraso</span>}
                  </p>
                </div>
                <p className={`text-sm font-bold shrink-0 ${vencido ? 'text-red-400' : 'text-white'}`}>
                  {fmtR(Number(c.valor))}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard (Painel do Dono) ───────────────────────────────────────────────
// Layout bento: manchete de vendas gigante + radar lateral + blocos de gestão.
// Todos os KPIs vêm da RPC canônica fn_dashboard_dono — não duplicar cálculos aqui.
const Dashboard: React.FC = () => {
  const [loading, setLoading]         = useState(true);
  const [refreshing, setRefreshing]   = useState(false);
  const [showChatIA, setShowChatIA]   = useState(false);
  const [showModalRH, setShowModalRH] = useState(false);
  const [showEstoqueDetalhe, setShowEstoqueDetalhe] = useState(false);

  const [painel, setPainel]           = useState<PainelDono | null>(null);
  const [itensAtencao, setItensAtencao] = useState<any[]>([]);

  const refVencidas = React.useRef<HTMLDivElement>(null);
  const refSemana   = React.useRef<HTMLDivElement>(null);
  const refMusicos  = React.useRef<HTMLDivElement>(null);
  const refExtras   = React.useRef<HTMLDivElement>(null);
  const refDiario   = React.useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [{ data: painelData, error }, { data: itensAtencaoData }] = await Promise.all([
        supabase.rpc('fn_dashboard_dono'),
        supabase.rpc('get_itens_atencao_dashboard'),
      ]);
      if (error) throw error;
      setPainel(painelData as PainelDono);
      setItensAtencao(itensAtencaoData ?? []);
    } catch (e) {
      console.error('Erro ao carregar painel do dono:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const refresh = () => { setRefreshing(true); load(); };

  if (loading || !painel) return (
    <div className="flex items-center justify-center min-h-96">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#7D1F2C]" />
    </div>
  );

  // Blindagem contra payload parcial
  const caixa   = painel.caixa   ?? { hoje: { entradas: 0, saidas: 0 }, mes: { entradas: 0, saidas: 0 }, serie_14d: [] };
  const vendas  = painel.vendas  ?? null;
  const cmv     = painel.cmv     ?? { success: false, cmv: 0, cmv_percentual: null, compras: 0, avisos: [] };
  const contas  = painel.contas  ?? { vencidas: { qtd: 0, valor: 0 }, semana: { qtd: 0, valor: 0 }, lista_vencidas: [], lista_semana: [] };
  const equipe  = painel.equipe  ?? {
    colaboradores: { ativos: 0, ferias: 0, afastados: 0 },
    caches: { qtd: 0, valor: 0, lista: [] },
    extras: { qtd: 0, valor: 0, lista: [] },
    rh_contas: { qtd: 0, valor: 0, lista: [] },
  };
  const estoque = painel.estoque ?? { valor_total: 0, negativos: 0, abaixo_minimo: 0 };
  const diario  = painel.diario  ?? { pendencias: 0, criticas: 0, lista: [] };
  const eventos = painel.eventos ?? [];

  const resultadoMes = Number(caixa.mes.entradas) - Number(caixa.mes.saidas);
  const dataLonga = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  const variacaoVendas = vendas?.anterior && Number(vendas.anterior.total) > 0
    ? ((Number(vendas.total) - Number(vendas.anterior.total)) / Number(vendas.anterior.total)) * 100
    : null;

  const serieVendas = vendas?.serie_14d ?? [];
  const maxVendas   = Math.max(1, ...serieVendas.map(d => Number(d.total)));
  const serieCaixa  = caixa.serie_14d ?? [];
  const maxCaixa    = Math.max(1, ...serieCaixa.map(d => Math.max(Number(d.entradas), Number(d.saidas))));

  const estoqueAlertas = Number(estoque.negativos) + Number(estoque.abaixo_minimo);
  const scrollTo = (ref: React.RefObject<HTMLDivElement>) =>
    ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  return (
    <div className="space-y-5 pb-16">

      {/* ── SAUDAÇÃO SLIM ─────────────────────────────────────────────── */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <p className="text-[#D4AF37] text-[10px] font-black uppercase tracking-[0.3em] mb-1">Ditado Popular</p>
          <h1 className="text-2xl font-black text-white leading-none">{saudacao()}, Kadu</h1>
          <p className="text-white/40 text-xs mt-1 capitalize">{dataLonga}</p>
        </div>
        <button onClick={refresh} disabled={refreshing}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-white/60 glass-soft hover:bg-white/10 transition-colors">
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Atualizar
        </button>
      </div>

      {/* ── BENTO GRID ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-4">

        {/* MANCHETE: vendas da noite */}
        <div className="col-span-12 lg:col-span-8 relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#7D1F2C] via-[#9B2535] to-[#3d0e16] border border-[#D4AF37]/25 shadow-[0_24px_80px_rgba(125,31,44,0.45)] p-6 lg:p-8 flex flex-col justify-between min-h-[280px]">
          <div className="absolute inset-0 opacity-[0.06]"
            style={{ backgroundImage: 'repeating-linear-gradient(45deg,#D4AF37 0,#D4AF37 1px,transparent 0,transparent 50%),repeating-linear-gradient(-45deg,#D4AF37 0,#D4AF37 1px,transparent 0,transparent 50%)', backgroundSize: '28px 28px' }} />
          <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-[#D4AF37] opacity-10 -translate-y-1/2 translate-x-1/3 blur-2xl" />

          {vendas ? (
            <>
              <div className="relative flex items-start justify-between flex-wrap gap-2">
                <p className="text-white/60 text-[11px] font-bold uppercase tracking-[0.2em]">
                  Vendas da noite · {fmtData(vendas.data)}
                </p>
                {variacaoVendas !== null && (
                  <span className={`text-[11px] font-black px-2.5 py-1 rounded-lg ${
                    variacaoVendas >= 0 ? 'bg-emerald-500/25 text-emerald-300' : 'bg-red-500/25 text-red-300'
                  }`}>
                    {variacaoVendas >= 0 ? '▲ +' : '▼ '}{variacaoVendas.toFixed(0)}% vs {fmtData(vendas.anterior!.data)}
                  </span>
                )}
              </div>

              <div className="relative mt-2">
                <p className="text-5xl lg:text-7xl font-black tracking-tight text-gold-gradient leading-none">
                  {fmtR(Number(vendas.total))}
                </p>
              </div>

              {/* série 14 noites */}
              {serieVendas.length > 0 && (
                <div className="relative flex items-end gap-1.5 h-16 mt-5">
                  {serieVendas.map((d, i) => (
                    <div key={d.data} className="flex-1 h-full flex items-end" title={`${fmtData(d.data)} · ${fmtR(Number(d.total))}`}>
                      <div className={`w-full rounded-t ${i === serieVendas.length - 1 ? 'bg-[#D4AF37]' : 'bg-white/25'}`}
                        style={{ height: `${Math.max(3, (Number(d.total) / maxVendas) * 100)}%` }} />
                    </div>
                  ))}
                </div>
              )}

              <div className="relative grid grid-cols-3 gap-3 mt-5">
                {[
                  { label: 'Bebidas',   valor: fmtR(Number(vendas.bebidas)) },
                  { label: 'Alimentos', valor: fmtR(Number(vendas.alimentos)) },
                  { label: 'No mês',    valor: fmtR(Number(vendas.mes)) },
                ].map(k => (
                  <div key={k.label} className="bg-black/25 border border-white/10 rounded-xl px-3 py-2.5">
                    <p className="text-white/50 text-[9px] font-bold uppercase tracking-wider">{k.label}</p>
                    <p className="text-white font-black text-base mt-0.5">{k.valor}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="relative flex-1 flex items-center justify-center">
              <p className="text-white/50 text-sm">Sem vendas ZIG sincronizadas ainda</p>
            </div>
          )}
        </div>

        {/* RADAR DO DIA */}
        <div className="col-span-12 lg:col-span-4 glass-card rounded-3xl p-4 flex flex-col">
          <p className="text-sm font-bold text-white px-3 pt-2 pb-3">Radar do dia</p>
          <div className="flex-1 flex flex-col justify-start divide-y divide-white/5">
            <RadarRow icon={AlertTriangle} label="Contas atrasadas"
              valor={fmtR(Number(contas.vencidas.valor))} sub={`${contas.vencidas.qtd} conta${contas.vencidas.qtd !== 1 ? 's' : ''}`}
              sev={contas.vencidas.qtd > 0 ? 'red' : 'ok'} onClick={() => scrollTo(refVencidas)} />
            <RadarRow icon={Calendar} label="Vence em 7 dias"
              valor={fmtR(Number(contas.semana.valor))} sub={`${contas.semana.qtd} conta${contas.semana.qtd !== 1 ? 's' : ''}`}
              sev={contas.semana.qtd > 0 ? 'amber' : 'ok'} onClick={() => scrollTo(refSemana)} />
            <RadarRow icon={Package} label="Estoque em alerta"
              valor={String(estoqueAlertas)} sub={`${estoque.negativos} neg · ${estoque.abaixo_minimo} baixo`}
              sev={Number(estoque.negativos) > 0 ? 'red' : estoqueAlertas > 0 ? 'amber' : 'ok'}
              onClick={() => setShowEstoqueDetalhe(true)} />
            <RadarRow icon={Music} label="Cachês em aberto"
              valor={fmtR(Number(equipe.caches.valor))} sub={`${equipe.caches.qtd} músico${equipe.caches.qtd !== 1 ? 's' : ''}`}
              sev={(equipe.caches.lista ?? []).some(m => new Date(m.data) < new Date()) ? 'red' : equipe.caches.qtd > 0 ? 'amber' : 'ok'}
              onClick={() => scrollTo(refMusicos)} />
            <RadarRow icon={Briefcase} label="Extras em aberto"
              valor={fmtR(Number(equipe.extras.valor))} sub={`${equipe.extras.qtd} extra${equipe.extras.qtd !== 1 ? 's' : ''}`}
              sev={(equipe.extras.lista ?? []).some(e => new Date(e.data) < new Date()) ? 'red' : equipe.extras.qtd > 0 ? 'amber' : 'ok'}
              onClick={() => scrollTo(refExtras)} />
            <RadarRow icon={BookOpen} label="Diário de bordo"
              valor={`${diario.pendencias}`} sub={diario.criticas > 0 ? `${diario.criticas} crítica${diario.criticas !== 1 ? 's' : ''}` : 'pendências'}
              sev={diario.criticas > 0 ? 'red' : diario.pendencias > 0 ? 'amber' : 'ok'}
              onClick={() => scrollTo(refDiario)} />
          </div>
        </div>

        {/* CAIXA DO MÊS */}
        <div className="col-span-12 sm:col-span-6 lg:col-span-4 glass-card rounded-3xl p-5">
          <p className="text-[10px] font-bold text-white/55 uppercase tracking-widest mb-3">Caixa do mês</p>
          <div className="space-y-1.5">
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-white/50">Entradas</span>
              <span className="text-base font-black text-emerald-400">{fmtR(Number(caixa.mes.entradas))}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-white/50">Saídas</span>
              <span className="text-base font-black text-red-400">{fmtR(Number(caixa.mes.saidas))}</span>
            </div>
            <div className="flex justify-between items-baseline border-t border-white/10 pt-1.5">
              <span className="text-xs font-bold text-white/70">Resultado</span>
              <span className={`text-lg font-black ${resultadoMes >= 0 ? 'text-gold-gradient' : 'text-red-400'}`}>{fmtR(resultadoMes)}</span>
            </div>
          </div>
          <div className="flex items-end gap-1 h-12 mt-4">
            {serieCaixa.map(d => (
              <div key={d.data} className="flex-1 h-full flex items-end justify-center gap-px" title={`${fmtData(d.data)} · +${fmtR(Number(d.entradas))} / -${fmtR(Number(d.saidas))}`}>
                <div className="flex-1 bg-emerald-500/60 rounded-t-sm min-h-[2px]" style={{ height: `${Math.max(2, (Number(d.entradas) / maxCaixa) * 100)}%` }} />
                <div className="flex-1 bg-red-500/60 rounded-t-sm min-h-[2px]" style={{ height: `${Math.max(2, (Number(d.saidas) / maxCaixa) * 100)}%` }} />
              </div>
            ))}
          </div>
          <p className="text-[9px] text-white/35 mt-1">últimos 14 dias · sem transferências</p>
        </div>

        {/* CMV + ESTOQUE */}
        <div className="col-span-12 sm:col-span-6 lg:col-span-4 glass-card rounded-3xl p-5">
          <p className="text-[10px] font-bold text-white/55 uppercase tracking-widest mb-3">CMV do mês</p>
          <p className="text-3xl font-black text-white leading-none">{fmtR(Number(cmv.cmv))}</p>
          {cmv.cmv_percentual !== null ? (
            <p className={`text-xs mt-2 font-semibold ${Number(cmv.cmv_percentual) > 35 ? 'text-yellow-400' : 'text-emerald-400'}`}>
              {Number(cmv.cmv_percentual).toFixed(1)}% do faturamento
            </p>
          ) : (
            <p className="text-xs mt-2 text-yellow-400/80" title={(cmv.avisos ?? []).join(' · ')}>
              % indisponível — importar vendas ZIG
            </p>
          )}
          <div className="border-t border-white/10 mt-4 pt-3 space-y-1.5">
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-white/50">Compras no mês</span>
              <span className="text-sm font-bold text-white">{fmtR(Number(cmv.compras))}</span>
            </div>
            <div className="flex justify-between items-baseline">
              <span className="text-xs text-white/50">Valor em estoque</span>
              <span className="text-sm font-bold text-white">{fmtR(Number(estoque.valor_total))}</span>
            </div>
          </div>
        </div>

        {/* EQUIPE */}
        <div className="col-span-12 lg:col-span-4 glass-card rounded-3xl p-5 flex flex-col">
          <p className="text-[10px] font-bold text-white/55 uppercase tracking-widest mb-3">Equipe</p>
          <div className="flex flex-wrap gap-2">
            {[
              { icon: UserCheck, label: 'Ativos',    value: equipe.colaboradores.ativos,    color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
              { icon: Gift,      label: 'Férias',    value: equipe.colaboradores.ferias,    color: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
              { icon: UserX,     label: 'Afastados', value: equipe.colaboradores.afastados, color: 'bg-red-500/15 text-red-300 border-red-500/30' },
            ].map(p => (
              <div key={p.label} className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border ${p.color}`}>
                <p.icon className="w-3.5 h-3.5" />
                {p.value} {p.label}
              </div>
            ))}
          </div>
          <button onClick={() => setShowModalRH(true)}
            className="mt-auto pt-4 flex items-center justify-between text-left group">
            <div>
              <p className="text-[10px] font-bold text-white/45 uppercase tracking-wider">Custo RH em aberto</p>
              <p className="text-xl font-black text-white mt-0.5">{fmtR(Number(equipe.rh_contas.valor))}</p>
            </div>
            <span className="text-[10px] font-bold text-teal-400 group-hover:text-teal-300 transition-colors">
              {equipe.rh_contas.qtd} conta{equipe.rh_contas.qtd !== 1 ? 's' : ''} →
            </span>
          </button>
        </div>
      </div>

      {/* ── DETALHES: CONTAS ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div ref={refVencidas}>
          <ListaScroll
            titulo="Contas Atrasadas"
            items={contas.lista_vencidas}
            emptyMsg="Nenhuma conta atrasada"
            renderItem={(c, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-red-500/5 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{c.descricao}</p>
                  <p className="text-[10px] text-white/50 mt-0.5">
                    {c.categoria}
                    <span className="text-red-400 ml-1">· {diasAtraso(c.vencimento)}d atraso</span>
                  </p>
                </div>
                <p className="text-sm font-bold text-red-400 shrink-0">{fmtR(Number(c.valor))}</p>
              </div>
            )}
          />
          {(contas.lista_vencidas ?? []).length > 0 && (
            <div className="mt-1 px-4 py-2 glass-soft rounded-xl flex justify-between">
              <p className="text-[10px] text-white/50">Total atrasado</p>
              <p className="text-xs font-black text-red-400">{fmtR(Number(contas.vencidas.valor))}</p>
            </div>
          )}
        </div>

        <div ref={refSemana}>
          <ListaScroll
            titulo="Vence em 7 dias"
            items={contas.lista_semana}
            emptyMsg="Nada vence nos próximos 7 dias"
            renderItem={(c, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-blue-500/5 transition-colors">
                <div className="w-10 shrink-0 text-center">
                  <p className="text-[10px] font-black text-blue-400">{fmtData(c.vencimento)}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{c.descricao}</p>
                  <p className="text-[10px] text-white/50">{c.categoria}</p>
                </div>
                <p className="text-sm font-bold text-white shrink-0">{fmtR(Number(c.valor))}</p>
              </div>
            )}
          />
          {(contas.lista_semana ?? []).length > 0 && (
            <div className="mt-1 px-4 py-2 glass-soft rounded-xl flex justify-between">
              <p className="text-[10px] text-white/50">Total da semana</p>
              <p className="text-xs font-black text-blue-400">{fmtR(Number(contas.semana.valor))}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── DETALHES: MÚSICOS + EXTRAS ────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div ref={refMusicos}>
          <ListaScroll
            titulo="Músicos em Aberto"
            items={equipe.caches.lista}
            emptyMsg="Nenhum cachê pendente"
            renderItem={(m, i) => {
              const vencido = new Date(m.data) < new Date();
              return (
                <div key={i} className={`flex items-center gap-3 px-4 py-3 hover:bg-pink-500/5 transition-colors ${vencido ? 'bg-red-500/5' : ''}`}>
                  <div className="w-10 shrink-0 text-center">
                    <p className={`text-[10px] font-black ${vencido ? 'text-red-400' : 'text-pink-400'}`}>
                      {fmtData(m.data)}
                    </p>
                    {vencido && <p className="text-[9px] text-red-400">{diasAtraso(m.data)}d</p>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{m.nome}</p>
                    <p className="text-[10px] text-white/50">
                      Total: {fmtR(Number(m.total))}
                      {Number(m.pago) > 0 && ` · Pago: ${fmtR(Number(m.pago))}`}
                    </p>
                  </div>
                  <p className={`text-sm font-bold shrink-0 ${vencido ? 'text-red-400' : 'text-pink-400'}`}>
                    {fmtR(Number(m.saldo))}
                  </p>
                </div>
              );
            }}
          />
          {(equipe.caches.lista ?? []).length > 0 && (
            <div className="mt-1 px-4 py-2 glass-soft rounded-xl flex justify-between">
              <p className="text-[10px] text-white/50">Total em aberto</p>
              <p className="text-xs font-black text-pink-400">{fmtR(Number(equipe.caches.valor))}</p>
            </div>
          )}
        </div>

        <div ref={refExtras}>
          <ListaScroll
            titulo="Extras em Aberto"
            items={equipe.extras.lista}
            emptyMsg="Nenhum extra pendente"
            renderItem={(e, i) => {
              const vencido = new Date(e.data) < new Date();
              return (
                <div key={i} className={`flex items-center gap-3 px-4 py-3 hover:bg-orange-500/5 transition-colors ${vencido ? 'bg-red-500/5' : ''}`}>
                  <div className="w-10 shrink-0 text-center">
                    <p className={`text-[10px] font-black ${vencido ? 'text-red-400' : 'text-orange-400'}`}>
                      {fmtData(e.data)}
                    </p>
                    {vencido && <p className="text-[9px] text-red-400">{diasAtraso(e.data)}d</p>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{e.nome}</p>
                    <p className="text-[10px] text-white/50">
                      {e.funcao}{e.setor ? ` · ${e.setor}` : ''}
                    </p>
                  </div>
                  <p className={`text-sm font-bold shrink-0 ${vencido ? 'text-red-400' : 'text-orange-400'}`}>
                    {fmtR(Number(e.valor))}
                  </p>
                </div>
              );
            }}
          />
          {(equipe.extras.lista ?? []).length > 0 && (
            <div className="mt-1 px-4 py-2 glass-soft rounded-xl flex justify-between">
              <p className="text-[10px] text-white/50">Total em aberto</p>
              <p className="text-xs font-black text-orange-400">{fmtR(Number(equipe.extras.valor))}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── DETALHES: EVENTOS + DIÁRIO ────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <ListaScroll
          titulo="Eventos — próximos 14 dias"
          items={eventos}
          emptyMsg="Nenhum evento fechado no período"
          renderItem={(ev, i) => (
            <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-purple-500/5 transition-colors">
              <div className="w-10 shrink-0 text-center">
                <p className="text-[10px] font-black text-purple-400">{fmtData(ev.data)}</p>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-white truncate">{ev.nome}</p>
                <p className="text-[10px] text-white/50">
                  {ev.pessoas ? `${ev.pessoas} pessoas` : ''}
                  {ev.pagamento && ev.pagamento !== 'pago' && <span className="text-yellow-400 ml-1">· pgto {ev.pagamento}</span>}
                </p>
              </div>
              <p className="text-sm font-bold text-purple-300 shrink-0">{ev.valor ? fmtR(Number(ev.valor)) : '—'}</p>
            </div>
          )}
        />

        <div ref={refDiario}>
          <ListaScroll
            titulo="Diário de Bordo — pendências"
            items={diario.lista}
            emptyMsg="Nenhuma pendência aberta"
            renderItem={(p, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-yellow-500/5 transition-colors">
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0 uppercase ${
                  p.gravidade === 'critica' || p.gravidade === 'alta'
                    ? 'bg-red-500/20 text-red-400'
                    : 'bg-yellow-500/20 text-yellow-400'
                }`}>
                  {p.setor}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{p.titulo}</p>
                  <p className="text-[10px] text-white/50">gravidade {p.gravidade}</p>
                </div>
                <p className="text-[10px] font-bold text-white/50 shrink-0">{p.dias}d aberto</p>
              </div>
            )}
          />
        </div>
      </div>

      {/* ── MODAL DETALHE ESTOQUE ─────────────────────────────────────── */}
      {showEstoqueDetalhe && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="glass-modal rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-white">Itens para Reposição</h3>
                <p className="text-xs text-white/50 mt-0.5">Movimentados nos últimos 3 dias</p>
              </div>
              <button onClick={() => setShowEstoqueDetalhe(false)} className="p-1.5 hover:bg-white/10 rounded-xl">
                <X className="w-4 h-4 text-white/40" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-white/5">
              {(itensAtencao ?? []).map((item: any, i: number) => (
                <div key={i} className={`px-5 py-3.5 flex items-start gap-3 ${item.status_alerta === 'negativo' ? 'bg-red-500/5' : ''}`}>
                  <div className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                    item.status_alerta === 'negativo' ? 'bg-red-500'
                    : item.status_alerta === 'zerado' ? 'bg-white/30'
                    : 'bg-yellow-500'
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white">{item.nome}</p>
                    <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                      <span className="text-[10px] text-white/50">{item.estoque_nome}</span>
                      <span className="text-[10px] text-white/30">·</span>
                      <span className="text-[10px] text-white/50">{item.categoria}</span>
                      {item.ultima_mov && (
                        <>
                          <span className="text-[10px] text-white/30">·</span>
                          <span className="text-[10px] text-white/50">
                            mov: {new Date(item.ultima_mov + 'T12:00').toLocaleDateString('pt-BR')}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`text-sm font-black ${
                      Number(item.saldo_real) < 0 ? 'text-red-400'
                      : Number(item.saldo_real) === 0 ? 'text-white/30'
                      : 'text-yellow-400'
                    }`}>
                      {parseFloat(Number(item.saldo_real ?? 0).toFixed(3)).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {item.unidade_medida}
                    </p>
                    {item.estoque_minimo > 0 && (
                      <p className="text-[10px] text-white/40 mt-0.5">min: {item.estoque_minimo}</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-white/10 grid grid-cols-3 gap-3 text-center">
              {[
                { label: 'Negativos', count: (itensAtencao ?? []).filter((i: any) => i.status_alerta === 'negativo').length, color: 'text-red-400' },
                { label: 'Zerados',   count: (itensAtencao ?? []).filter((i: any) => i.status_alerta === 'zerado').length,   color: 'text-white/40' },
                { label: 'Criticos',  count: (itensAtencao ?? []).filter((i: any) => i.status_alerta === 'critico').length,  color: 'text-yellow-400' },
              ].map(s => (
                <div key={s.label}>
                  <p className={`text-lg font-black ${s.color}`}>{s.count}</p>
                  <p className="text-[10px] text-white/50">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL RH ─────────────────────────────────────────────────── */}
      {showModalRH && <ModalRH contas={equipe.rh_contas.lista} onClose={() => setShowModalRH(false)} />}

      {/* ── CHAT IA ───────────────────────────────────────────────────── */}
      {!showChatIA && (
        <button
          onClick={() => setShowChatIA(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-gradient-to-br from-blue-600 to-cyan-600 text-white rounded-full shadow-2xl hover:scale-110 transition-all flex items-center justify-center z-40"
        >
          <MessageSquare className="w-6 h-6" />
          <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-green-500 rounded-full border-2 border-[#0d0f1a] animate-pulse" />
        </button>
      )}

      {showChatIA && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-3xl">
            <ChatFinanceiroIA onClose={() => setShowChatIA(false)} />
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
