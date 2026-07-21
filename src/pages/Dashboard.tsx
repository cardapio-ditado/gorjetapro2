import React, { useState, useEffect, useCallback } from 'react';
import {
  Music, Users, Calendar, AlertTriangle, ChevronRight, X, RefreshCw,
  UserCheck, UserX, Gift, Briefcase, MessageSquare,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import ChatFinanceiroIA from '../components/financeiro/ChatFinanceiroIA';

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Blindados contra null/undefined: se qualquer valor do painel vier vazio
// (ex.: sub-objeto ausente durante recarga de sessão), o helper devolve um
// fallback seguro em vez de quebrar a tela inteira com "Cannot read
// properties of undefined (reading 'toLocaleString')".
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

// ─── AlertCard ────────────────────────────────────────────────────────────────
function AlertCard({
  icon: Icon, label, count, value, color, alert, onClick,
}: {
  icon: React.ElementType; label: string; count: number;
  value: number; color: string; alert?: boolean; onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-shrink-0 w-48 rounded-2xl border p-4 text-left transition-all hover:scale-105
        ${alert
          ? 'bg-red-950/40 border-red-500/40 hover:border-red-400/60'
          : 'glass-card hover:border-white/25'
        }`}
    >
      <div className="flex items-center gap-2 mb-2">
        <div className={`p-1.5 rounded-lg ${color}`}>
          <Icon className="w-3.5 h-3.5 text-white" />
        </div>
        <p className="text-[10px] font-bold text-white/60 uppercase tracking-wide">{label}</p>
      </div>
      <p className={`text-xl font-black ${alert ? 'text-red-400' : 'text-white'}`}>{fmtR(value)}</p>
      <p className={`text-[10px] mt-1 ${alert ? 'text-red-400' : 'text-white/50'}`}>
        {count} {count === 1 ? 'item' : 'itens'}
        {alert && count > 0 ? ' em atraso' : ''}
      </p>
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

  // Blindagem: se qualquer bloco do painel vier ausente (ex.: recarga de
  // sessão devolvendo payload parcial), usa um default vazio em vez de
  // quebrar a tela inteira ao acessar sub-propriedades.
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
  const mesNome = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  const variacaoVendas = vendas?.anterior && Number(vendas.anterior.total) > 0
    ? ((Number(vendas.total) - Number(vendas.anterior.total)) / Number(vendas.anterior.total)) * 100
    : null;

  const maxSerie = Math.max(1, ...(caixa.serie_14d ?? []).map(d => Math.max(Number(d.entradas), Number(d.saidas))));

  return (
    <div className="space-y-5 pb-16">

      {/* ── HERO: vendas da última noite + caixa do mês ───────────────── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#7D1F2C] via-[#9B2535] to-[#3d0e16] p-6 shadow-2xl">
        <div className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg,#D4AF37 0,#D4AF37 1px,transparent 0,transparent 50%),repeating-linear-gradient(-45deg,#D4AF37 0,#D4AF37 1px,transparent 0,transparent 50%)', backgroundSize: '28px 28px' }} />
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-[#D4AF37] opacity-5 -translate-y-1/2 translate-x-1/3" />

        <div className="relative flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-[#D4AF37] text-[10px] font-black uppercase tracking-[0.3em] mb-1">Ditado Popular</p>
            <h1 className="text-2xl font-black text-white">{saudacao()}, Kadu</h1>
            <p className="text-white/60 text-xs mt-0.5 capitalize">{mesNome}</p>
          </div>
          <button onClick={refresh} disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-white/60 bg-white/10 hover:bg-white/15 border border-white/15 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>

        {/* Última noite (ZIG / fidelidade) */}
        {vendas && (
          <div className="relative mt-5 bg-white/5 border border-white/10 rounded-2xl p-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-white/65 text-[10px] font-bold uppercase tracking-wider">
                Vendas ZIG · {fmtData(vendas.data)}
              </p>
              {variacaoVendas !== null && (
                <span className={`text-[10px] font-black px-2 py-0.5 rounded-md ${
                  variacaoVendas >= 0 ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'
                }`}>
                  {variacaoVendas >= 0 ? '+' : ''}{variacaoVendas.toFixed(0)}% vs {fmtData(vendas.anterior!.data)}
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-3">
              {[
                { label: 'Faturamento dia', valor: fmtR(Number(vendas.total)),     destaque: true  },
                { label: 'Bebidas',         valor: fmtR(Number(vendas.bebidas)),   destaque: false },
                { label: 'Alimentos',       valor: fmtR(Number(vendas.alimentos)), destaque: false },
                { label: 'No mês',          valor: fmtR(Number(vendas.mes)),       destaque: false },
              ].map(k => (
                <div key={k.label} className="text-center">
                  <p className="text-white/55 text-[9px] font-bold uppercase tracking-wider">{k.label}</p>
                  <p className={`font-black mt-0.5 ${k.destaque ? 'text-[#D4AF37] text-xl' : 'text-white text-lg'}`}>{k.valor}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Caixa do mês (sem transferências entre contas) */}
        <div className="relative grid grid-cols-3 gap-3 mt-3">
          {[
            { label: 'Entradas do mês', value: Number(caixa.mes.entradas), color: 'text-emerald-300' },
            { label: 'Saídas do mês',   value: Number(caixa.mes.saidas),   color: 'text-red-300' },
            { label: 'Resultado',       value: resultadoMes,               color: resultadoMes >= 0 ? 'text-[#D4AF37]' : 'text-red-300' },
          ].map(item => (
            <div key={item.label} className="text-center bg-white/5 rounded-2xl py-3 px-2 border border-white/10">
              <p className="text-white/65 text-[9px] font-bold uppercase tracking-wider">{item.label}</p>
              <p className={`text-lg font-black mt-1 ${item.color}`}>{fmtR(item.value)}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── FAIXA DE ALERTAS ──────────────────────────────────────────── */}
      <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 snap-x snap-mandatory">
        <AlertCard
          icon={AlertTriangle} label="Contas Atrasadas"
          count={contas.vencidas.qtd} value={Number(contas.vencidas.valor)}
          color="bg-red-700" alert={contas.vencidas.qtd > 0}
          onClick={() => refVencidas.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <AlertCard
          icon={Calendar} label="Vence em 7 dias"
          count={contas.semana.qtd} value={Number(contas.semana.valor)}
          color="bg-blue-600"
          onClick={() => refSemana.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <AlertCard
          icon={Music} label="Músicos em Aberto"
          count={equipe.caches.qtd} value={Number(equipe.caches.valor)}
          color="bg-pink-600" alert={(equipe.caches.lista ?? []).some(m => new Date(m.data) < new Date())}
          onClick={() => refMusicos.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <AlertCard
          icon={Briefcase} label="Extras em Aberto"
          count={equipe.extras.qtd} value={Number(equipe.extras.valor)}
          color="bg-orange-600" alert={(equipe.extras.lista ?? []).some(e => new Date(e.data) < new Date())}
          onClick={() => refExtras.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <button
          onClick={() => setShowModalRH(true)}
          className="flex-shrink-0 w-48 rounded-2xl glass-card p-4 text-left hover:border-white/25 hover:scale-105 transition-all"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-teal-700">
              <Users className="w-3.5 h-3.5 text-white" />
            </div>
            <p className="text-[10px] font-bold text-white/60 uppercase tracking-wide">Custo RH</p>
          </div>
          <p className="text-xl font-black text-white">{fmtR(Number(equipe.rh_contas.valor))}</p>
          <p className="text-[10px] mt-1 text-teal-400 flex items-center gap-1">
            {equipe.rh_contas.qtd} conta{equipe.rh_contas.qtd !== 1 ? 's' : ''} · ver detalhe
            <ChevronRight className="w-3 h-3" />
          </p>
        </button>
      </div>

      {/* ── KPIs: CMV real + estoque + diário ─────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="glass-card rounded-2xl p-4">
          <p className="text-[10px] font-bold text-white/55 uppercase tracking-widest mb-1">CMV do Mês</p>
          <p className="text-xl font-black text-white">{fmtR(Number(cmv.cmv))}</p>
          {cmv.cmv_percentual !== null ? (
            <p className={`text-[10px] mt-1.5 font-semibold ${Number(cmv.cmv_percentual) > 35 ? 'text-yellow-400' : 'text-emerald-400'}`}>
              {Number(cmv.cmv_percentual).toFixed(1)}% do faturamento
            </p>
          ) : (
            <p className="text-[10px] mt-1.5 text-yellow-400/80" title={(cmv.avisos ?? []).join(' · ')}>
              % indisponível — importar vendas ZIG
            </p>
          )}
        </div>

        <div className="glass-card rounded-2xl p-4">
          <p className="text-[10px] font-bold text-white/55 uppercase tracking-widest mb-1">Valor em Estoque</p>
          <p className="text-xl font-black text-white">{fmtR(Number(estoque.valor_total))}</p>
          <p className="text-[10px] mt-1.5 text-white/50">compras no mês: {fmtR(Number(cmv.compras))}</p>
        </div>

        <button
          onClick={() => setShowEstoqueDetalhe(true)}
          className="glass-card rounded-2xl p-4 text-left hover:border-red-500/40 hover:bg-red-500/5 transition-all group"
        >
          <p className="text-[10px] font-bold text-white/55 uppercase tracking-widest mb-1">Estoque em Alerta</p>
          <p className={`text-xl font-black ${(estoque.abaixo_minimo + estoque.negativos) > 0 ? 'text-red-400' : 'text-white'}`}>
            {estoque.abaixo_minimo + estoque.negativos}
          </p>
          <p className="text-[10px] mt-1.5 text-white/30 group-hover:text-red-400/70 transition-colors">
            {estoque.negativos} negativo{estoque.negativos !== 1 ? 's' : ''} · {estoque.abaixo_minimo} abaixo do mínimo →
          </p>
        </button>

        <div className={`glass-card rounded-2xl p-4 ${diario.criticas > 0 ? 'border-red-500/40' : ''}`}>
          <p className="text-[10px] font-bold text-white/55 uppercase tracking-widest mb-1">Diário de Bordo</p>
          <p className={`text-xl font-black ${diario.pendencias > 0 ? 'text-yellow-400' : 'text-white'}`}>
            {diario.pendencias}
          </p>
          <p className="text-[10px] mt-1.5 text-white/50">
            pendência{diario.pendencias !== 1 ? 's' : ''}{diario.criticas > 0 ? ` · ${diario.criticas} crítica${diario.criticas !== 1 ? 's' : ''}` : ''}
          </p>
        </div>
      </div>

      {/* ── CAIXA 14 DIAS (mini gráfico) ──────────────────────────────── */}
      <div className="glass-card rounded-2xl p-4">
        <div className="flex justify-between items-center mb-3">
          <p className="text-sm font-bold text-white">Caixa — últimos 14 dias</p>
          <div className="flex items-center gap-3 text-[10px] text-white/50">
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500/70" /> entradas</span>
            <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500/70" /> saídas</span>
          </div>
        </div>
        <div className="flex items-end gap-1 h-24">
          {(caixa.serie_14d ?? []).map(d => (
            <div key={d.data} className="flex-1 h-full flex items-end justify-center gap-px group relative" title={`${fmtData(d.data)} · +${fmtR(Number(d.entradas))} / -${fmtR(Number(d.saidas))}`}>
              <div className="flex-1 bg-emerald-500/60 rounded-t-sm min-h-[2px]" style={{ height: `${Math.max(2, (Number(d.entradas) / maxSerie) * 100)}%` }} />
              <div className="flex-1 bg-red-500/60 rounded-t-sm min-h-[2px]" style={{ height: `${Math.max(2, (Number(d.saidas) / maxSerie) * 100)}%` }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between mt-1 text-[9px] text-white/40">
          <span>{fmtData(caixa.serie_14d?.[0]?.data ?? '')}</span>
          <span>{fmtData(caixa.serie_14d?.[caixa.serie_14d.length - 1]?.data ?? '')}</span>
        </div>
      </div>

      {/* ── CONTAS ATRASADAS + SEMANA ─────────────────────────────────── */}
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

      {/* ── MÚSICOS + EXTRAS ──────────────────────────────────────────── */}
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

      {/* ── EVENTOS PRÓXIMOS + DIÁRIO DE BORDO ────────────────────────── */}
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

      {/* ── EQUIPE ────────────────────────────────────────────────────── */}
      <div className="glass-card rounded-2xl p-5">
        <p className="text-sm font-bold text-white mb-4">Equipe</p>
        <div className="flex flex-wrap gap-3">
          {[
            { icon: UserCheck, label: 'Ativos',    value: equipe.colaboradores.ativos,    color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
            { icon: Gift,      label: 'Férias',    value: equipe.colaboradores.ferias,    color: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
            { icon: UserX,     label: 'Afastados', value: equipe.colaboradores.afastados, color: 'bg-red-500/15 text-red-300 border-red-500/30' },
          ].map(p => (
            <div key={p.label} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border ${p.color}`}>
              <p.icon className="w-4 h-4" />
              {p.value} {p.label}
            </div>
          ))}
        </div>
      </div>

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
