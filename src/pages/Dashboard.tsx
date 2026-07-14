import React, { useState, useEffect, useCallback } from 'react';
import {
  Music, Users, DollarSign, Calendar, AlertTriangle,
  Clock, ChevronRight, X, RefreshCw, UserCheck,
  UserX, Gift, Briefcase, MessageSquare
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import ChatFinanceiroIA from '../components/financeiro/ChatFinanceiroIA';

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtR = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtData = (d: string) =>
  new Date(d + (d.includes('T') ? '' : 'T12:00')).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

const diasAtraso = (d: string) => {
  const diff = Date.now() - new Date(d + (d.includes('T') ? '' : 'T12:00')).getTime();
  return Math.max(0, Math.floor(diff / 86400000));
};

const saudacao = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
};

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
          : 'bg-[#12141f] border-white/10 hover:border-white/20'
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
  return (
    <div className="bg-[#12141f] border border-white/10 rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-white/10 flex justify-between items-center">
        <p className="text-sm font-bold text-white">{titulo}</p>
        <span className="text-xs text-white/50 font-medium">{items.length} item{items.length !== 1 ? 's' : ''}</span>
      </div>
      {items.length === 0 ? (
        <div className="py-8 text-center">
          <p className="text-xs text-white/40">{emptyMsg}</p>
        </div>
      ) : (
        <div className={`${maxH} overflow-y-auto divide-y divide-white/5`}>
          {items.map(renderItem)}
        </div>
      )}
    </div>
  );
}

// ─── ModalRH ──────────────────────────────────────────────────────────────────
function ModalRH({ contas, onClose }: { contas: any[]; onClose: () => void }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f1020] border border-white/10 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center">
          <h3 className="font-bold text-white">Custo RH — Contas em Aberto</h3>
          <button onClick={onClose} className="p-1.5 hover:bg-white/10 rounded-xl">
            <X className="w-4 h-4 text-white/40" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-white/5">
          {contas.map((c, i) => {
            const vencido = new Date(c.data_vencimento) < new Date();
            return (
              <div key={i} className={`px-5 py-3 flex items-center gap-3 ${vencido ? 'bg-red-500/5' : ''}`}>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white truncate">{c.descricao}</p>
                  <p className="text-xs text-white/50 mt-0.5">
                    {(c.categorias_financeiras as any)?.nome} · {fmtData(c.data_vencimento)}
                    {vencido && <span className="text-red-400 ml-1">• {diasAtraso(c.data_vencimento)}d atraso</span>}
                  </p>
                </div>
                <p className={`text-sm font-bold shrink-0 ${vencido ? 'text-red-400' : 'text-white'}`}>
                  {fmtR(Number(c.saldo_restante))}
                </p>
              </div>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-white/10 flex justify-between">
          <p className="text-xs text-white/55">Total em aberto</p>
          <p className="text-sm font-black text-white">
            {fmtR(contas.reduce((a, b) => a + Number(b.saldo_restante), 0))}
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
const CAT_RH = [
  'c07bb17a-0ad5-4a86-adcf-090694ee9acb',
  '6f030239-f3df-4ecd-a5c6-2aaa3992669b',
  '782d79ab-0f64-42d7-8f09-aa31188f7677',
  '4be91d3d-b9df-40ac-aa19-5c5e121a715f',
  'b570835e-2e96-4db1-9ba1-8b61aab8c0cc',
  '3bbf5e7b-c2fa-48a8-b4da-598938269f99',
  '710f7a66-6ab2-447a-b52e-68c431c7ed79',
];

const Dashboard: React.FC = () => {
  const [loading, setLoading]             = useState(true);
  const [refreshing, setRefreshing]       = useState(false);
  const [showChatIA, setShowChatIA]       = useState(false);
  const [showModalRH, setShowModalRH]     = useState(false);
  const [showEstoqueDetalhe, setShowEstoqueDetalhe] = useState(false);

  const [musicos, setMusicos]             = useState<any[]>([]);
  const [extras, setExtras]               = useState<any[]>([]);
  const [contasAtrasadas, setContasAtrasadas] = useState<any[]>([]);
  const [contasSemana, setContasSemana]   = useState<any[]>([]);
  const [custosRH, setCustosRH]           = useState<any[]>([]);
  const [colaboradores, setColaboradores] = useState({ ativos: 0, ferias: 0, afastados: 0 });
  const [financeiro, setFinanceiro]       = useState({ receita: 0, despesa: 0 });
  const [itensAtencao, setItensAtencao]   = useState<any[]>([]);
  const [cmvMes, setCmvMes]               = useState(0);
  const [cmvSemana, setCmvSemana]         = useState(0);
  const [topCompras, setTopCompras]       = useState<any[]>([]);

  const refMusicos  = React.useRef<HTMLDivElement>(null);
  const refExtras   = React.useRef<HTMLDivElement>(null);
  const refAtrasado = React.useRef<HTMLDivElement>(null);
  const refSemana   = React.useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const hoje      = new Date().toISOString().split('T')[0];
      const semanaFim = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
      const inicioMes = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
      const fimMes    = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1).toISOString().split('T')[0];

      const [
        { data: musicosData },
        { data: extrasData },
        { data: atrasadasData },
        { data: semanaData },
        { data: rhData },
        { data: colab },
        { data: fluxo },
        { data: itensAtencaoData },
        { data: cmvData },
        { data: topComprasData },
      ] = await Promise.all([
        supabase.from('musicos')
          .select('id, nome, valor_total_final, valor_pago, saldo_restante, data_evento, status_pagamento')
          .not('status_pagamento', 'in', '("pago","cancelado")')
          .gt('saldo_restante', 0)
          .order('data_evento', { ascending: true }),

        supabase.from('extras_freelancers')
          .select('id, nome, funcao_temporaria, valor_diaria, data_trabalho, status_pagamento, setor')
          .not('status_pagamento', 'in', '("pago","cancelado")')
          .gt('valor_diaria', 0)
          .order('data_trabalho', { ascending: true }),

        supabase.from('contas_pagar')
          .select('id, descricao, saldo_restante, data_vencimento, categorias_financeiras(nome)')
          .not('status', 'in', '("pago","cancelado")')
          .gt('saldo_restante', 0)
          .lt('data_vencimento', hoje)
          .order('saldo_restante', { ascending: false }),

        supabase.from('contas_pagar')
          .select('id, descricao, saldo_restante, data_vencimento, categorias_financeiras(nome)')
          .not('status', 'in', '("pago","cancelado")')
          .gt('saldo_restante', 0)
          .gte('data_vencimento', hoje)
          .lte('data_vencimento', semanaFim)
          .order('data_vencimento', { ascending: true }),

        supabase.from('contas_pagar')
          .select('id, descricao, saldo_restante, data_vencimento, status, categorias_financeiras(nome)')
          .in('categoria_id', CAT_RH)
          .not('status', 'in', '("pago","cancelado")')
          .gt('saldo_restante', 0)
          .order('data_vencimento', { ascending: true }),

        supabase.from('colaboradores').select('status'),

        supabase.from('fluxo_caixa').select('tipo, valor')
          .gte('data', inicioMes).lt('data', fimMes),

        supabase.rpc('get_itens_atencao_dashboard'),

        supabase.from('entradas_compras')
          .select('valor_total, data_compra')
          .eq('status', 'recebido')
          .gte('data_compra', inicioMes),

        supabase.from('itens_entrada_compra')
          .select('custo_total, itens_estoque!inner(nome, categoria), entradas_compras!inner(data_compra, status)')
          .eq('entradas_compras.status', 'recebido')
          .gte('entradas_compras.data_compra', inicioMes),
      ]);

      setMusicos(musicosData ?? []);
      setExtras(extrasData ?? []);
      setContasAtrasadas(atrasadasData ?? []);
      setContasSemana(semanaData ?? []);
      setCustosRH(rhData ?? []);

      const cl = colab ?? [];
      setColaboradores({
        ativos:    cl.filter((c: any) => c.status === 'ativo').length,
        ferias:    cl.filter((c: any) => c.status === 'ferias').length,
        afastados: cl.filter((c: any) => c.status === 'afastado').length,
      });

      const fl = fluxo ?? [];
      setFinanceiro({
        receita: fl.filter((f: any) => f.tipo === 'entrada').reduce((a: number, b: any) => a + Number(b.valor), 0),
        despesa: fl.filter((f: any) => f.tipo === 'saida').reduce((a: number, b: any) => a + Number(b.valor), 0),
      });

      // CMV do mês e semana
      const comprasMes = cmvData ?? [];
      const hoje7d = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0];
      setCmvMes(comprasMes.reduce((a: number, b: any) => a + Number(b.valor_total), 0));
      setCmvSemana(comprasMes
        .filter((c: any) => c.data_compra >= hoje7d)
        .reduce((a: number, b: any) => a + Number(b.valor_total), 0));

      // Top compras — agrupar por item
      const topMap = new Map<string, { nome: string; categoria: string; valor: number }>();
      (topComprasData ?? []).forEach((row: any) => {
        const nome = row.itens_estoque?.nome || '?';
        const cat  = row.itens_estoque?.categoria || '';
        const val  = Number(row.custo_total || 0);
        if (topMap.has(nome)) topMap.get(nome)!.valor += val;
        else topMap.set(nome, { nome, categoria: cat, valor: val });
      });
      setTopCompras([...topMap.values()].sort((a, b) => b.valor - a.valor).slice(0, 5));

      setItensAtencao(itensAtencaoData ?? []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  const refresh = () => { setRefreshing(true); load(); };

  const totalMusicos  = musicos.reduce((a, b) => a + Number(b.saldo_restante), 0);
  const totalExtras   = extras.reduce((a, b) => a + Number(b.valor_diaria), 0);
  const totalAtrasado = contasAtrasadas.reduce((a, b) => a + Number(b.saldo_restante), 0);
  const totalSemana   = contasSemana.reduce((a, b) => a + Number(b.saldo_restante), 0);
  const totalRH       = custosRH.reduce((a, b) => a + Number(b.saldo_restante), 0);
  const resultado     = financeiro.receita - financeiro.despesa;
  const mesNome       = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  if (loading) return (
    <div className="flex items-center justify-center min-h-96">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#7D1F2C]" />
    </div>
  );

  return (
    <div className="space-y-5 pb-16">

      {/* ── HERO ──────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#7D1F2C] via-[#9B2535] to-[#3d0e16] p-6 shadow-2xl">
        <div className="absolute inset-0 opacity-[0.06]"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg,#D4AF37 0,#D4AF37 1px,transparent 0,transparent 50%),repeating-linear-gradient(-45deg,#D4AF37 0,#D4AF37 1px,transparent 0,transparent 50%)', backgroundSize: '28px 28px' }} />
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full bg-[#D4AF37] opacity-5 -translate-y-1/2 translate-x-1/3" />

        <div className="relative flex items-start justify-between flex-wrap gap-3">
          <div>
            <p className="text-[#D4AF37] text-[10px] font-black uppercase tracking-[0.3em] mb-1">Ditado Popular</p>
            <h1 className="text-2xl font-black text-white">{saudacao()}, gestor</h1>
            <p className="text-white/60 text-xs mt-0.5 capitalize">{mesNome}</p>
          </div>
          <button onClick={refresh} disabled={refreshing}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-white/60 bg-white/10 hover:bg-white/15 border border-white/15 transition-colors">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        </div>

        <div className="relative grid grid-cols-3 gap-3 mt-5">
          {[
            { label: 'Receita',   value: financeiro.receita, color: 'text-emerald-300' },
            { label: 'Despesa',   value: financeiro.despesa, color: 'text-red-300' },
            { label: 'Resultado', value: resultado,          color: resultado >= 0 ? 'text-[#D4AF37]' : 'text-red-300' },
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
          icon={Music} label="Musicos em Aberto"
          count={musicos.length} value={totalMusicos}
          color="bg-pink-600" alert={musicos.some(m => new Date(m.data_evento) < new Date())}
          onClick={() => refMusicos.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <AlertCard
          icon={Briefcase} label="Extras em Aberto"
          count={extras.length} value={totalExtras}
          color="bg-orange-600" alert={extras.some(e => new Date(e.data_trabalho) < new Date())}
          onClick={() => refExtras.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <AlertCard
          icon={Calendar} label="Vence esta semana"
          count={contasSemana.length} value={totalSemana}
          color="bg-blue-600"
          onClick={() => refSemana.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <AlertCard
          icon={AlertTriangle} label="Atrasado"
          count={contasAtrasadas.length} value={totalAtrasado}
          color="bg-red-700" alert={contasAtrasadas.length > 0}
          onClick={() => refAtrasado.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
        />
        <button
          onClick={() => setShowModalRH(true)}
          className="flex-shrink-0 w-48 rounded-2xl border border-white/10 bg-[#12141f] p-4 text-left hover:border-white/20 hover:scale-105 transition-all"
        >
          <div className="flex items-center gap-2 mb-2">
            <div className="p-1.5 rounded-lg bg-teal-700">
              <Users className="w-3.5 h-3.5 text-white" />
            </div>
            <p className="text-[10px] font-bold text-white/60 uppercase tracking-wide">Custo RH</p>
          </div>
          <p className="text-xl font-black text-white">{fmtR(totalRH)}</p>
          <p className="text-[10px] mt-1 text-teal-400 flex items-center gap-1">
            {custosRH.length} conta{custosRH.length !== 1 ? 's' : ''} · ver detalhe
            <ChevronRight className="w-3 h-3" />
          </p>
        </button>
      </div>

      {/* ── CONTAS ATRASADAS + SEMANA ─────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div ref={refAtrasado}>
          <ListaScroll
            titulo="Contas Atrasadas"
            items={contasAtrasadas}
            emptyMsg="Nenhuma conta atrasada"
            renderItem={(c, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-red-500/5 transition-colors">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{c.descricao}</p>
                  <p className="text-[10px] text-white/50 mt-0.5">
                    {(c.categorias_financeiras as any)?.nome}
                    <span className="text-red-400 ml-1">· {diasAtraso(c.data_vencimento)}d atraso</span>
                  </p>
                </div>
                <p className="text-sm font-bold text-red-400 shrink-0">{fmtR(Number(c.saldo_restante))}</p>
              </div>
            )}
          />
          {contasAtrasadas.length > 0 && (
            <div className="mt-1 px-4 py-2 bg-[#12141f] border border-white/5 rounded-xl flex justify-between">
              <p className="text-[10px] text-white/50">Total atrasado</p>
              <p className="text-xs font-black text-red-400">{fmtR(totalAtrasado)}</p>
            </div>
          )}
        </div>

        <div ref={refSemana}>
          <ListaScroll
            titulo="Vence Esta Semana"
            items={contasSemana}
            emptyMsg="Nada vence essa semana"
            renderItem={(c, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-blue-500/5 transition-colors">
                <div className="w-10 shrink-0 text-center">
                  <p className="text-[10px] font-black text-blue-400">{fmtData(c.data_vencimento)}</p>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white truncate">{c.descricao}</p>
                  <p className="text-[10px] text-white/50">{(c.categorias_financeiras as any)?.nome}</p>
                </div>
                <p className="text-sm font-bold text-white shrink-0">{fmtR(Number(c.saldo_restante))}</p>
              </div>
            )}
          />
          {contasSemana.length > 0 && (
            <div className="mt-1 px-4 py-2 bg-[#12141f] border border-white/5 rounded-xl flex justify-between">
              <p className="text-[10px] text-white/50">Total da semana</p>
              <p className="text-xs font-black text-blue-400">{fmtR(totalSemana)}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── MUSICOS + EXTRAS ──────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div ref={refMusicos}>
          <ListaScroll
            titulo="Musicos em Aberto"
            items={musicos}
            emptyMsg="Nenhum cache pendente"
            renderItem={(m, i) => {
              const vencido = new Date(m.data_evento) < new Date();
              return (
                <div key={i} className={`flex items-center gap-3 px-4 py-3 hover:bg-pink-500/5 transition-colors ${vencido ? 'bg-red-500/5' : ''}`}>
                  <div className="w-10 shrink-0 text-center">
                    <p className={`text-[10px] font-black ${vencido ? 'text-red-400' : 'text-pink-400'}`}>
                      {fmtData(m.data_evento)}
                    </p>
                    {vencido && <p className="text-[9px] text-red-400">{diasAtraso(m.data_evento)}d</p>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{m.nome}</p>
                    <p className="text-[10px] text-white/50">
                      Total: {fmtR(Number(m.valor_total_final))}
                      {Number(m.valor_pago) > 0 && ` · Pago: ${fmtR(Number(m.valor_pago))}`}
                    </p>
                  </div>
                  <p className={`text-sm font-bold shrink-0 ${vencido ? 'text-red-400' : 'text-pink-400'}`}>
                    {fmtR(Number(m.saldo_restante))}
                  </p>
                </div>
              );
            }}
          />
          {musicos.length > 0 && (
            <div className="mt-1 px-4 py-2 bg-[#12141f] border border-white/5 rounded-xl flex justify-between">
              <p className="text-[10px] text-white/50">Total em aberto</p>
              <p className="text-xs font-black text-pink-400">{fmtR(totalMusicos)}</p>
            </div>
          )}
        </div>

        <div ref={refExtras}>
          <ListaScroll
            titulo="Extras em Aberto"
            items={extras}
            emptyMsg="Nenhum extra pendente"
            renderItem={(e, i) => {
              const vencido = new Date(e.data_trabalho) < new Date();
              return (
                <div key={i} className={`flex items-center gap-3 px-4 py-3 hover:bg-orange-500/5 transition-colors ${vencido ? 'bg-red-500/5' : ''}`}>
                  <div className="w-10 shrink-0 text-center">
                    <p className={`text-[10px] font-black ${vencido ? 'text-red-400' : 'text-orange-400'}`}>
                      {fmtData(e.data_trabalho)}
                    </p>
                    {vencido && <p className="text-[9px] text-red-400">{diasAtraso(e.data_trabalho)}d</p>}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{e.nome}</p>
                    <p className="text-[10px] text-white/50">
                      {e.funcao_temporaria}{e.setor ? ` · ${e.setor}` : ''}
                    </p>
                  </div>
                  <p className={`text-sm font-bold shrink-0 ${vencido ? 'text-red-400' : 'text-orange-400'}`}>
                    {fmtR(Number(e.valor_diaria))}
                  </p>
                </div>
              );
            }}
          />
          {extras.length > 0 && (
            <div className="mt-1 px-4 py-2 bg-[#12141f] border border-white/5 rounded-xl flex justify-between">
              <p className="text-[10px] text-white/50">Total em aberto</p>
              <p className="text-xs font-black text-orange-400">{fmtR(totalExtras)}</p>
            </div>
          )}
        </div>
      </div>

      {/* ── ESTOQUE ───────────────────────────────────────────────────── */}
      <div className="space-y-3">

        {/* KPIs */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[#12141f] border border-white/10 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-white/55 uppercase tracking-widest mb-1">CMV do Mes</p>
            <p className="text-xl font-black text-white">{fmtR(cmvMes)}</p>
            <p className={`text-[10px] mt-1.5 font-semibold ${
              financeiro.receita > 0
                ? (cmvMes / financeiro.receita) * 100 > 35 ? 'text-yellow-400' : 'text-emerald-400'
                : 'text-white/30'
            }`}>
              {financeiro.receita > 0 ? `${((cmvMes / financeiro.receita) * 100).toFixed(1)}% da receita` : '—'}
            </p>
          </div>

          <div className="bg-[#12141f] border border-white/10 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-white/55 uppercase tracking-widest mb-1">CMV Semana</p>
            <p className="text-xl font-black text-white">{fmtR(cmvSemana)}</p>
            <p className="text-[10px] mt-1.5 text-white/50">ultimos 7 dias</p>
          </div>

          <button
            onClick={() => setShowEstoqueDetalhe(true)}
            className="bg-[#12141f] border border-white/10 rounded-2xl p-4 text-left hover:border-red-500/40 hover:bg-red-500/5 transition-all group"
          >
            <p className="text-[10px] font-bold text-white/55 uppercase tracking-widest mb-1">Reposicao Urgente</p>
            <p className={`text-xl font-black ${itensAtencao.length > 0 ? 'text-red-400' : 'text-white'}`}>
              {itensAtencao.length}
            </p>
            <p className="text-[10px] mt-1.5 text-white/30 group-hover:text-red-400/70 transition-colors">
              itens · ver detalhes →</p>
          </button>

          <div className="bg-[#12141f] border border-white/10 rounded-2xl p-4">
            <p className="text-[10px] font-bold text-white/55 uppercase tracking-widest mb-1">Maior Gasto</p>
            <p className="text-sm font-black text-white truncate">
              {topCompras[0]?.nome?.split(' ').slice(0, 2).join(' ') || '—'}
            </p>
            <p className="text-[10px] mt-1.5 text-emerald-400 font-semibold">
              {topCompras[0] ? fmtR(topCompras[0].valor) : '—'}
            </p>
          </div>
        </div>

        {/* Listas: itens atencao + top compras */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

          <div className="bg-[#12141f] border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 flex justify-between items-center">
              <p className="text-sm font-bold text-white">Reposicao Urgente</p>
              <span className="text-[10px] text-white/50">mov. ultimos 3 dias</span>
            </div>
            {itensAtencao.length === 0 ? (
              <div className="py-8 text-center">
                <p className="text-xs text-white/25">Estoque em dia</p>
              </div>
            ) : (
              <div className="max-h-64 overflow-y-auto divide-y divide-white/5">
                {itensAtencao.map((item: any, i: number) => (
                  <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-red-500/5 transition-colors">
                    <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0 ${
                      item.status_alerta === 'negativo'
                        ? 'bg-red-500/20 text-red-400'
                        : item.status_alerta === 'zerado'
                        ? 'bg-white/10 text-white/40'
                        : 'bg-yellow-500/20 text-yellow-400'
                    }`}>
                      {item.status_alerta === 'negativo' ? 'NEG' : item.status_alerta === 'zerado' ? 'ZERO' : 'CRIT'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white truncate">{item.nome}</p>
                      <p className="text-[10px] text-white/50">{item.estoque_nome}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className={`text-xs font-bold ${Number(item.saldo_real) < 0 ? 'text-red-400' : 'text-yellow-400'}`}>
                        {parseFloat(Number(item.saldo_real).toFixed(3)).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {item.unidade_medida}
                      </p>
                      {item.estoque_minimo > 0 && (
                        <p className="text-[9px] text-white/40">min: {item.estoque_minimo}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-[#12141f] border border-white/10 rounded-2xl overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10">
              <p className="text-sm font-bold text-white">Top Compras do Mes</p>
            </div>
            <div className="p-4 space-y-3">
              {topCompras.length === 0 ? (
                <p className="text-xs text-white/40 text-center py-4">Sem compras no mes</p>
              ) : topCompras.map((item, i) => {
                const maxVal = topCompras[0]?.valor || 1;
                const pct = (item.valor / maxVal) * 100;
                const cores = ['bg-blue-500/60', 'bg-teal-500/60', 'bg-emerald-500/60', 'bg-orange-500/60', 'bg-pink-500/60'];
                return (
                  <div key={i} className="space-y-1">
                    <div className="flex justify-between items-center">
                      <p className="text-xs font-medium text-white/80 truncate max-w-[60%]">{item.nome}</p>
                      <p className="text-xs font-bold text-white shrink-0">{fmtR(item.valor)}</p>
                    </div>
                    <div className="w-full bg-white/5 rounded-full h-1.5">
                      <div className={`h-1.5 rounded-full transition-all ${cores[i] || 'bg-white/30'}`} style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-[9px] text-white/40">{item.categoria}</p>
                  </div>
                );
              })}
              {topCompras.length > 0 && (
                <div className="pt-2 border-t border-white/10 flex justify-between">
                  <p className="text-[10px] text-white/50">Total comprado no mes</p>
                  <p className="text-xs font-black text-white">{fmtR(cmvMes)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── MODAL DETALHE ESTOQUE ─────────────────────────────────────── */}
      {showEstoqueDetalhe && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[#0f1020] border border-white/10 rounded-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
            <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-white">Itens para Reposicao</h3>
                <p className="text-xs text-white/50 mt-0.5">Movimentados nos ultimos 3 dias</p>
              </div>
              <button onClick={() => setShowEstoqueDetalhe(false)} className="p-1.5 hover:bg-white/10 rounded-xl">
                <X className="w-4 h-4 text-white/40" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto divide-y divide-white/5">
              {itensAtencao.map((item: any, i: number) => (
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
                      {parseFloat(Number(item.saldo_real).toFixed(3)).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {item.unidade_medida}
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
                { label: 'Negativos', count: itensAtencao.filter((i: any) => i.status_alerta === 'negativo').length, color: 'text-red-400' },
                { label: 'Zerados',   count: itensAtencao.filter((i: any) => i.status_alerta === 'zerado').length,   color: 'text-white/40' },
                { label: 'Criticos',  count: itensAtencao.filter((i: any) => i.status_alerta === 'critico').length,  color: 'text-yellow-400' },
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
      <div className="bg-[#12141f] border border-white/10 rounded-2xl p-5">
        <p className="text-sm font-bold text-white mb-4">Equipe</p>
        <div className="flex flex-wrap gap-3">
          {[
            { icon: UserCheck, label: 'Ativos',    value: colaboradores.ativos,    color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30' },
            { icon: Gift,      label: 'Ferias',    value: colaboradores.ferias,    color: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
            { icon: UserX,     label: 'Afastados', value: colaboradores.afastados, color: 'bg-red-500/15 text-red-300 border-red-500/30' },
          ].map(p => (
            <div key={p.label} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border ${p.color}`}>
              <p.icon className="w-4 h-4" />
              {p.value} {p.label}
            </div>
          ))}
        </div>
      </div>

      {/* ── MODAL RH ─────────────────────────────────────────────────── */}
      {showModalRH && <ModalRH contas={custosRH} onClose={() => setShowModalRH(false)} />}

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
