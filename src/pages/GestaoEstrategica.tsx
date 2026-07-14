import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, DollarSign, Users, Package, Music,
  CalendarDays, Target, RefreshCw, Plus, Trash2, Check,
  AlertTriangle, Eye, EyeOff, UserCheck, UserX, Gift, Loader2,
  ArrowUp, ArrowDown, Minus
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PageHeader, KPICard, SectionCard } from '../components/ui';

// ─── Formatters ───────────────────────────────────────────────────────────────
const R   = (v: number) => v.toLocaleString('pt-BR', { style:'currency', currency:'BRL', minimumFractionDigits:0, maximumFractionDigits:0 });
const Rs  = (v: number) => v.toLocaleString('pt-BR', { style:'currency', currency:'BRL' });
const fmt = (v: number) => {
  if (v >= 1_000_000) return `R$${(v/1_000_000).toFixed(2).replace('.',',')}M`;
  if (v >= 1_000)     return `R$${(v/1_000).toFixed(1).replace('.',',')}k`;
  return R(v);
};
const pct = (a: number, b: number) => b === 0 ? 0 : ((a - b) / b) * 100;

// ─── Types ────────────────────────────────────────────────────────────────────
interface FinData   { receita:number; despesa:number; saldo:number; receitaAnt:number; despesaAnt:number }
interface RhData    { ativos:number; emFerias:number; afastados:number; salariosPagos:number; extrasPagos:number; gorjetasPagas:number }
interface EstData   { valorTotal:number; zerados:number; criticos:number; comprasMes:number; comprasSemana:number }
interface MusicData { totalMes:number; pago:number; aberto:number; contratacoes:number; pendentes:MusicItem[] }
interface MusicItem { descricao:string; valor:number; saldo:number; vencimento:string }
interface EventData { qtd:number; totalReceita:number; lista:EvItem[] }
interface EvItem    { nome:string; data:string; valor:number; status:string }
interface OKR       { id:string; titulo:string; descricao:string; trimestre:string; responsavel:string; status:string; progresso:number; totalKrs:number }
interface NewOKR    { titulo:string; descricao:string; trimestre:string; responsavel:string }

// ─── Section Header ───────────────────────────────────────────────────────────
function SectionHeader({ icon:Icon, title, subtitle, grad }:{
  icon:React.ElementType; title:string; subtitle?:string; grad:string
}) {
  return (
    <div className="flex items-center gap-3 mb-5">
      <div className={`p-2.5 rounded-xl bg-gradient-to-br ${grad} shadow-sm`}>
        <Icon className="w-5 h-5 text-white" />
      </div>
      <div>
        <h2 className="text-base font-extrabold text-white tracking-tight leading-none">{title}</h2>
        {subtitle && <p className="text-xs text-white/30 mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

// ─── KPI Tile ─────────────────────────────────────────────────────────────────
function Tile({ label, value, sub, trend, alert, loading }:{
  label:string; value:string; sub?:string;
  trend?:number; alert?:'red'|'yellow'|'green'; loading?:boolean
}) {
  if (loading) return <div className="bg-[#12141f] rounded-2xl border border-white/10 p-4 h-[88px] animate-pulse" />;
  return (
    <div className={`bg-[#12141f] rounded-2xl border p-4 shadow-sm hover:shadow-md transition-all ${
      alert==='red'    ? 'border-red-500/30    bg-gradient-to-br from-[#12141f] to-red-50/50'    :
      alert==='yellow' ? 'border-amber-500/30  bg-gradient-to-br from-[#12141f] to-amber-50/50'  :
      alert==='green'  ? 'border-emerald-500/30 bg-gradient-to-br from-[#12141f] to-emerald-50/30' :
      'border-white/5'
    }`}>
      <p className="text-[10px] font-bold text-white/30 uppercase tracking-widest mb-1">{label}</p>
      <p className={`text-xl font-extrabold tracking-tight leading-none ${
        alert==='red' ? 'text-red-400' : alert==='green' ? 'text-emerald-400' : 'text-white'
      }`}>{value}</p>
      <div className="flex items-center justify-between mt-2">
        {trend !== undefined
          ? <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${trend>0?'text-emerald-400':trend<0?'text-red-500':'text-white/30'}`}>
              {trend>0?<ArrowUp className="w-2.5 h-2.5"/>:trend<0?<ArrowDown className="w-2.5 h-2.5"/>:<Minus className="w-2.5 h-2.5"/>}
              {Math.abs(trend).toFixed(1)}% vs ant.
            </span>
          : <span/>
        }
        {sub && <p className="text-[10px] text-white/30 font-medium">{sub}</p>}
      </div>
    </div>
  );
}

// ─── Progress Ring SVG ────────────────────────────────────────────────────────
function Ring({ p, color }:{ p:number; color:string }) {
  const r=18, c=2*Math.PI*r, dash=(Math.min(p,100)/100)*c;
  return (
    <svg width="44" height="44" className="-rotate-90">
      <circle cx="22" cy="22" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="5"/>
      <circle cx="22" cy="22" r={r} fill="none" stroke={color} strokeWidth="5"
        strokeDasharray={`${dash} ${c}`} strokeLinecap="round"
        style={{transition:'stroke-dasharray .6s ease'}}/>
    </svg>
  );
}

const OKR_ST: Record<string,{bg:string;txt:string;lbl:string;clr:string}> = {
  'on-track': {bg:'bg-emerald-500/15',txt:'text-emerald-400',lbl:'No Prazo',  clr:'#10b981'},
  'at-risk':  {bg:'bg-amber-500/15',  txt:'text-amber-400',  lbl:'Em Risco',  clr:'#f59e0b'},
  'off-track':{bg:'bg-red-500/15',    txt:'text-red-400',    lbl:'Atrasado',  clr:'#ef4444'},
  'completed':{bg:'bg-blue-500/15',   txt:'text-blue-400',   lbl:'Concluído', clr:'#3b82f6'},
};

// ═══════════════════════════════════════════════════════════════════════════════
export default function GestaoEstrategica() {
  const [loading,     setLoading]    = useState(true);
  const [refreshing,  setRefreshing] = useState(false);
  const [fin,  setFin]   = useState<FinData|null>(null);
  const [rh,   setRh]    = useState<RhData|null>(null);
  const [est,  setEst]   = useState<EstData|null>(null);
  const [mus,  setMus]   = useState<MusicData|null>(null);
  const [evs,  setEvs]   = useState<EventData|null>(null);
  const [okrs, setOkrs]  = useState<OKR[]>([]);

  const [cmvMode,     setCmvMode]    = useState<'mensal'|'semanal'>('mensal');
  const [soPendentes, setSoPendentes]= useState(false);
  const [showForm,    setShowForm]   = useState(false);
  const [confirmDel,  setConfirmDel] = useState<string|null>(null);
  const [newOkr,      setNewOkr]     = useState<NewOKR>({titulo:'',descricao:'',trimestre:'Q2 2026',responsavel:''});
  const [saving,      setSaving]     = useState(false);

  const load = useCallback(async () => {
    try {
      const hoje         = new Date();
      const inicioMes    = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().split('T')[0];
      const fimMes       = new Date(hoje.getFullYear(), hoje.getMonth()+1, 1).toISOString().split('T')[0];
      const inicioMesAnt = new Date(hoje.getFullYear(), hoje.getMonth()-1, 1).toISOString().split('T')[0];
      const fimMesAnt    = new Date(hoje.getFullYear(), hoje.getMonth(), 0).toISOString().split('T')[0];
      const inicio7d     = new Date(hoje.getTime() - 7*86400000).toISOString().split('T')[0];

      const CAT_SAL  = 'c07bb17a-0ad5-4a86-adcf-090694ee9acb';
      const CAT_EXT  = '6f030239-f3df-4ecd-a5c6-2aaa3992669b';
      const CAT_GOR  = '782d79ab-0f64-42d7-8f09-aa31188f7677';
      const CATS_MUS = ['8a0e65eb-e5c1-4ab9-a03c-6103c9071883','0fa4dda6-f9a0-4416-8e23-d38bc510c14d','04b9df59-25dc-4234-9d71-5bea479c3334'];

      const [
        {data:fcMes},{data:fcAnt},
        {data:colab},
        {data:salD},{data:extD},{data:gorD},
        {data:saldos},
        {data:cmvM},{data:cmvS},
        {data:musicD},
        {data:eventD},
        {data:okrD},
      ] = await Promise.all([
        supabase.from('fluxo_caixa').select('tipo,valor').gte('data',inicioMes).lt('data',fimMes),
        supabase.from('fluxo_caixa').select('tipo,valor').gte('data',inicioMesAnt).lte('data',fimMesAnt),
        supabase.from('colaboradores').select('status'),
        supabase.from('contas_pagar').select('valor_pago').eq('categoria_id',CAT_SAL).gte('data_vencimento',inicioMes).lt('data_vencimento',fimMes).gt('valor_pago',0),
        supabase.from('contas_pagar').select('valor_pago').eq('categoria_id',CAT_EXT).gte('data_vencimento',inicioMes).lt('data_vencimento',fimMes).gt('valor_pago',0),
        supabase.from('contas_pagar').select('valor_pago').eq('categoria_id',CAT_GOR).gte('data_vencimento',inicioMes).lt('data_vencimento',fimMes).gt('valor_pago',0),
        supabase.from('saldos_estoque').select('quantidade_atual, itens_estoque!inner(custo_medio,estoque_minimo,status)').eq('itens_estoque.status','ativo'),
        supabase.from('entradas_compras').select('valor_total').gte('data_compra',inicioMes).lt('data_compra',fimMes),
        supabase.from('entradas_compras').select('valor_total').gte('data_compra',inicio7d),
        supabase.from('contas_pagar').select('descricao,valor_total,valor_pago,saldo_restante,data_vencimento,status').in('categoria_id',CATS_MUS).gte('data_vencimento',inicioMes).lt('data_vencimento',fimMes).order('data_vencimento'),
        supabase.from('eventos_fechados').select('nome_evento,data_evento,valor_total,status_pagamento').gte('data_evento',inicioMes).lt('data_evento',fimMes).order('data_evento'),
        supabase.from('okr_objetivos').select('id,titulo,descricao,trimestre,responsavel,status,okr_key_results(meta_valor,valor_atual)').is('deletado_em',null).order('criado_em',{ascending:false}),
      ]);

      // Financeiro
      const rec  = (fcMes||[]).filter(r=>r.tipo==='entrada').reduce((a,b)=>a+ +b.valor,0);
      const desp = (fcMes||[]).filter(r=>r.tipo==='saida').reduce((a,b)=>a+ +b.valor,0);
      const recA = (fcAnt||[]).filter(r=>r.tipo==='entrada').reduce((a,b)=>a+ +b.valor,0);
      const desA = (fcAnt||[]).filter(r=>r.tipo==='saida').reduce((a,b)=>a+ +b.valor,0);
      setFin({receita:rec,despesa:desp,saldo:rec-desp,receitaAnt:recA,despesaAnt:desA});

      // RH
      const cl = colab||[];
      setRh({
        ativos:       cl.filter(x=>x.status==='ativo').length,
        emFerias:     cl.filter(x=>x.status==='ferias').length,
        afastados:    cl.filter(x=>x.status==='afastado').length,
        salariosPagos:(salD||[]).reduce((a,b)=>a+ +b.valor_pago,0),
        extrasPagos:  (extD||[]).reduce((a,b)=>a+ +b.valor_pago,0),
        gorjetasPagas:(gorD||[]).reduce((a,b)=>a+ +b.valor_pago,0),
      });

      // Estoque
      const ss = saldos||[];
      let valEst=0,zer=0,crit=0;
      ss.forEach((s:any)=>{
        const q=+s.quantidade_atual, cu=+(s.itens_estoque?.custo_medio||0), mn=+(s.itens_estoque?.estoque_minimo||0);
        valEst+=q*cu;
        if(q<=0) zer++; else if(mn>0&&q<=mn) crit++;
      });
      const comprasMes  = (cmvM||[]).reduce((a,b:any)=>a+ +b.valor_total,0);
      const comprasSem  = (cmvS||[]).reduce((a,b:any)=>a+ +b.valor_total,0);
      setEst({valorTotal:valEst,zerados:zer,criticos:crit,comprasMes,comprasSemana:comprasSem});

      // Músicos
      const mp = musicD||[];
      setMus({
        totalMes:     mp.reduce((a,b:any)=>a+ +b.valor_total,0),
        pago:         mp.filter((m:any)=>m.status==='pago').reduce((a,b:any)=>a+ +b.valor_total,0),
        aberto:       mp.filter((m:any)=>m.status==='em_aberto').reduce((a,b:any)=>a+ +b.valor_total,0),
        contratacoes: mp.length,
        pendentes:    mp.filter((m:any)=>m.status==='em_aberto'&&+m.saldo_restante>0)
                       .map((m:any)=>({descricao:m.descricao,valor:+m.valor_total,saldo:+m.saldo_restante,vencimento:m.data_vencimento})),
      });

      // Eventos
      const ep = eventD||[];
      setEvs({
        qtd:         ep.length,
        totalReceita:ep.reduce((a,b:any)=>a+ +b.valor_total,0),
        lista:       ep.map((e:any)=>({nome:e.nome_evento,data:e.data_evento,valor:+e.valor_total,status:e.status_pagamento})),
      });

      // OKRs
      setOkrs((okrD||[]).map((o:any)=>{
        const krs=o.okr_key_results||[];
        const prog=krs.length===0?0:krs.reduce((a:number,k:any)=>a+(k.meta_valor>0?Math.min((k.valor_atual/k.meta_valor)*100,100):0),0)/krs.length;
        return {id:o.id,titulo:o.titulo,descricao:o.descricao,trimestre:o.trimestre,responsavel:o.responsavel,status:o.status,progresso:prog,totalKrs:krs.length};
      }));

    } catch(e){console.error(e);}
    finally{setLoading(false);setRefreshing(false);}
  },[]);

  useEffect(()=>{load();},[load]);
  const refresh=()=>{setRefreshing(true);load();};

  const saveOkr = async () => {
    if (!newOkr.titulo.trim()) return;
    setSaving(true);
    const {error} = await supabase.from('okr_objetivos').insert({
      titulo:newOkr.titulo, descricao:newOkr.descricao,
      trimestre:newOkr.trimestre, responsavel:newOkr.responsavel, status:'on-track',
    });
    if (!error){setNewOkr({titulo:'',descricao:'',trimestre:'Q2 2026',responsavel:''});setShowForm(false);load();}
    setSaving(false);
  };

  const deleteOkr = async (id:string) => {
    await supabase.from('okr_objetivos').update({deletado_em:new Date().toISOString()}).eq('id',id);
    setConfirmDel(null); setOkrs(p=>p.filter(o=>o.id!==id));
  };

  // Indicadores derivados
  const margemPct  = fin&&fin.receita>0 ? (fin.saldo/fin.receita)*100 : 0;
  const rhPct      = fin&&fin.receita>0&&rh ? ((rh.salariosPagos+rh.extrasPagos+rh.gorjetasPagas)/fin.receita)*100 : 0;
  const cmvVal     = cmvMode==='mensal'?(est?.comprasMes||0):(est?.comprasSemana||0);
  const cmvBase    = cmvMode==='mensal'?(fin?.receita||0):(fin?.receita||0)/4;
  const cmvPct     = cmvBase>0 ? (cmvVal/cmvBase)*100 : 0;
  const mesNome    = new Date().toLocaleDateString('pt-BR',{month:'long',year:'numeric'});
  const pendList   = soPendentes ? mus?.pendentes : mus?.pendentes; // sempre mostra, toggle só filtra visualmente

  return (
    <div className="space-y-6 pb-12">

      {/* ══ HEADER HERO ═══════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#7D1F2C] via-[#9B2535] to-[#3d0e16] p-6 shadow-2xl">
        {/* Decoração de fundo */}
        <div className="absolute inset-0 opacity-[0.07]"
          style={{backgroundImage:`repeating-linear-gradient(45deg, #D4AF37 0px, #D4AF37 1px, transparent 0px, transparent 50%),repeating-linear-gradient(-45deg, #D4AF37 0px, #D4AF37 1px, transparent 0px, transparent 50%)`, backgroundSize:'30px 30px'}}/>
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-[#D4AF37] opacity-5 -translate-y-1/2 translate-x-1/3"/>

        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[#D4AF37] text-[10px] font-black uppercase tracking-[0.3em] mb-2">Ditado Popular</p>
            <h1 className="text-3xl font-black text-white tracking-tight">Gestão Estratégica</h1>
            <p className="text-white/50 text-sm mt-1 capitalize">{mesNome}</p>
          </div>
          <button onClick={refresh} disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white/70 bg-[#12141f]/10 hover:bg-[#12141f]/20 border border-white/15 transition-all">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing?'animate-spin':''}`}/>
            Atualizar
          </button>
        </div>

        {/* Trio de números */}
        <div className="relative grid grid-cols-3 gap-3 mt-6">
          {[
            {label:'Receita',   value:fin?.receita||0,  color:'text-emerald-300'},
            {label:'Despesa',   value:fin?.despesa||0,  color:'text-red-300'},
            {label:'Resultado', value:fin?.saldo||0,    color:(fin?.saldo||0)>=0?'text-[#D4AF37]':'text-red-300'},
          ].map(item=>(
            <div key={item.label} className="text-center bg-[#12141f]/5 rounded-2xl py-3 px-2 border border-white/10">
              <p className="text-white/40 text-[9px] font-bold uppercase tracking-widest">{item.label}</p>
              {loading
                ? <div className="h-7 bg-[#12141f]/10 rounded-lg animate-pulse mt-1 mx-2"/>
                : <p className={`text-xl font-black mt-1 ${item.color}`}>{fmt(item.value)}</p>
              }
            </div>
          ))}
        </div>

        {/* Pills de indicadores */}
        {!loading && (
          <div className="relative mt-4 flex flex-wrap gap-2">
            <span className={`text-[10px] font-bold px-3 py-1 rounded-full border ${margemPct>=0?'bg-emerald-500/20 border-emerald-400/30 text-emerald-300':'bg-red-500/20 border-red-400/30 text-red-300'}`}>
              Margem {margemPct.toFixed(1)}%
            </span>
            <span className={`text-[10px] font-bold px-3 py-1 rounded-full border ${rhPct<=45?'bg-sky-500/20 border-sky-400/30 text-sky-300':'bg-amber-500/20 border-amber-400/30 text-amber-300'}`}>
              Custo RH {rhPct.toFixed(1)}%
            </span>
            <span className={`text-[10px] font-bold px-3 py-1 rounded-full border ${cmvPct<=35?'bg-violet-500/20 border-violet-400/30 text-violet-300':'bg-red-500/20 border-red-400/30 text-red-300'}`}>
              CMV {cmvPct.toFixed(1)}%
            </span>
          </div>
        )}
      </div>

      {/* ══ 1. FINANCEIRO ══════════════════════════════════════════════════ */}
      <section className="bg-[#12141f] rounded-3xl border border-white/10 p-6">
        <SectionHeader icon={DollarSign} title="Financeiro" subtitle="Resultado do mês vs mês anterior" grad="from-emerald-500 to-teal-600"/>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Tile label="Receita"         value={fmt(fin?.receita||0)}  trend={fin?pct(fin.receita,fin.receitaAnt):undefined} alert="green" loading={loading}/>
          <Tile label="Despesas"        value={fmt(fin?.despesa||0)}  trend={fin?pct(fin.despesa,fin.despesaAnt):undefined} loading={loading}/>
          <Tile label="Resultado"       value={fmt(fin?.saldo||0)}    alert={(fin?.saldo||0)>=0?'green':'red'} sub={`Margem ${margemPct.toFixed(1)}%`} loading={loading}/>
          <Tile label="Custo RH/Receita" value={`${rhPct.toFixed(1)}%`} alert={rhPct>45?'yellow':'green'} loading={loading}/>
        </div>
      </section>

      {/* ══ 2. RECURSOS HUMANOS ═══════════════════════════════════════════ */}
      <section className="bg-[#12141f] rounded-3xl border border-white/10 p-6">
        <SectionHeader icon={Users} title="Recursos Humanos" subtitle="Headcount, custos pagos e situação da equipe" grad="from-orange-500 to-amber-500"/>

        {/* Status pills */}
        <div className="flex flex-wrap gap-2 mb-4">
          {loading
            ? [1,2,3].map(i=><div key={i} className="h-7 w-28 bg-[#12141f]/10 rounded-full animate-pulse"/>)
            : [
                {icon:UserCheck, label:'Ativos',   value:rh?.ativos||0,   bg:'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'},
                {icon:Gift,      label:'Férias',   value:rh?.emFerias||0, bg:'bg-blue-500/15 text-blue-300 border-blue-500/30'},
                {icon:UserX,     label:'Afastados',value:rh?.afastados||0,bg:'bg-red-500/15 text-red-300 border-red-500/30'},
              ].map(p=>(
                <div key={p.label} className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-bold border ${p.bg}`}>
                  <p.icon className="w-3.5 h-3.5"/>
                  {p.value} {p.label}
                </div>
              ))
          }
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Tile label="Salários Pagos" value={fmt(rh?.salariosPagos||0)} alert="green" loading={loading}/>
          <Tile label="Extras Pagos"   value={fmt(rh?.extrasPagos||0)}   loading={loading}/>
          <Tile label="Gorjetas Pagas" value={fmt(rh?.gorjetasPagas||0)} loading={loading}/>
        </div>

        {!loading && (rh?.emFerias||0)>0 && (
          <div className="mt-3 flex items-center gap-2 bg-blue-500/10 border border-blue-500/30 rounded-xl px-4 py-2.5">
            <Gift className="w-4 h-4 text-blue-500 shrink-0"/>
            <p className="text-xs font-medium text-blue-400">{rh?.emFerias} colaborador{(rh?.emFerias||0)>1?'es':''} em férias</p>
          </div>
        )}
        {!loading && (rh?.afastados||0)>0 && (
          <div className="mt-2 flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0"/>
            <p className="text-xs font-medium text-red-400">{rh?.afastados} colaborador{(rh?.afastados||0)>1?'es':''} afastado{(rh?.afastados||0)>1?'s':''}</p>
          </div>
        )}
      </section>

      {/* ══ 3. ESTOQUE ════════════════════════════════════════════════════ */}
      <section className="bg-[#12141f] rounded-3xl border border-white/10 p-6">
        <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
          <SectionHeader icon={Package} title="Estoque" subtitle="CMV, valor em estoque e criticidade" grad="from-violet-500 to-indigo-600"/>
          {/* Toggle CMV */}
          <div className="flex bg-[#12141f]/10 rounded-xl p-1 gap-1 h-fit">
            {(['mensal','semanal'] as const).map(m=>(
              <button key={m} onClick={()=>setCmvMode(m)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all capitalize ${cmvMode===m?'bg-[#12141f] shadow text-white':'text-white/40 hover:text-white/80'}`}>
                {m}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Tile label={`CMV ${cmvMode==='mensal'?'Mensal':'Semanal'}`}
            value={`${cmvPct.toFixed(1)}%`} sub={`Compras: ${fmt(cmvVal)}`}
            alert={cmvPct>35?'yellow':'green'} loading={loading}/>
          <Tile label="Valor em Estoque" value={fmt(est?.valorTotal||0)}  loading={loading}/>
          <Tile label="Itens Zerados"    value={`${est?.zerados||0}`}     alert={(est?.zerados||0)>10?'red':(est?.zerados||0)>0?'yellow':undefined} loading={loading}/>
          <Tile label="Itens Críticos"   value={`${est?.criticos||0}`}    alert={(est?.criticos||0)>5?'yellow':undefined} loading={loading}/>
        </div>

        {!loading&&(est?.zerados||0)>0&&(
          <div className="mt-3 flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-4 py-2.5">
            <AlertTriangle className="w-4 h-4 text-red-500 shrink-0"/>
            <p className="text-xs font-medium text-red-400">{est?.zerados} iten{(est?.zerados||0)>1?'s':''} com saldo zero — reposição urgente</p>
          </div>
        )}
      </section>

      {/* ══ 4. MÚSICOS ════════════════════════════════════════════════════ */}
      <section className="bg-[#12141f] rounded-3xl border border-white/10 p-6">
        <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
          <SectionHeader icon={Music} title="Músicos" subtitle="Cachês do mês — pagos e pendentes" grad="from-pink-500 to-rose-600"/>
          <button onClick={()=>setSoPendentes(v=>!v)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border transition-all h-fit ${
              soPendentes?'bg-amber-500/15 border-amber-500/40 text-amber-300':'bg-[#12141f]/10 border-white/10 text-white/60 hover:bg-white/15'
            }`}>
            {soPendentes?<Eye className="w-3.5 h-3.5"/>:<EyeOff className="w-3.5 h-3.5"/>}
            {soPendentes?'Ver todos':'Só pendentes'}
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Tile label="Total do Mês"  value={fmt(mus?.totalMes||0)}     loading={loading}/>
          <Tile label="Pago"          value={fmt(mus?.pago||0)}          alert="green" loading={loading}/>
          <Tile label="Em Aberto"     value={fmt(mus?.aberto||0)}        alert={(mus?.aberto||0)>0?'yellow':undefined} loading={loading}/>
          <Tile label="Contratações"  value={`${mus?.contratacoes||0}`} loading={loading}/>
        </div>

        {/* Lista pendentes — sempre visível se houver, toggle apenas filtra */}
        {!loading && (
          <div className="border border-amber-500/20 rounded-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-amber-500/10 to-yellow-500/10 px-4 py-2.5 border-b border-amber-500/20 flex items-center justify-between">
              <p className="text-xs font-bold text-amber-300 uppercase tracking-wide">
                Pendentes ({mus?.pendentes?.length||0})
              </p>
              {(mus?.pendentes?.length||0)>0&&(
                <p className="text-xs font-bold text-amber-400">{fmt((mus?.pendentes||[]).reduce((a,b)=>a+b.saldo,0))}</p>
              )}
            </div>
            {(mus?.pendentes?.length||0)===0
              ? <div className="py-6 text-center"><p className="text-xs text-white/30">Nenhum cachê pendente 🎉</p></div>
              : (soPendentes ? mus?.pendentes : mus?.pendentes)?.map((p,i)=>(
                  <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-amber-500/10/40 border-b border-amber-50 last:border-0 transition-colors">
                    <div className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0"/>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-white/90 truncate">{p.descricao}</p>
                      <p className="text-[10px] text-white/30">{new Date(p.vencimento+'T12:00:00').toLocaleDateString('pt-BR')}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-amber-400">{Rs(p.saldo)}</p>
                      {p.saldo<p.valor&&<p className="text-[10px] text-white/30">de {Rs(p.valor)}</p>}
                    </div>
                  </div>
                ))
            }
          </div>
        )}
      </section>

      {/* ══ 5. EVENTOS ════════════════════════════════════════════════════ */}
      <section className="bg-[#12141f] rounded-3xl border border-white/10 p-6">
        <SectionHeader icon={CalendarDays} title="Eventos" subtitle="Agenda e receita prevista do mês" grad="from-teal-500 to-cyan-600"/>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <Tile label="Eventos no Mês"   value={`${evs?.qtd||0}`}           loading={loading}/>
          <Tile label="Receita Prevista" value={fmt(evs?.totalReceita||0)}   alert="green" loading={loading}/>
        </div>

        {!loading&&(evs?.lista||[]).length>0&&(
          <div className="border border-teal-500/20 rounded-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-teal-500/10 to-cyan-50 px-4 py-2.5 border-b border-teal-500/20">
              <p className="text-xs font-bold text-teal-300 uppercase tracking-wide">Agenda do Mês</p>
            </div>
            {(evs?.lista||[]).map((ev,i)=>(
              <div key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-teal-500/10/30 border-b border-teal-50 last:border-0 transition-colors">
                <div className="bg-teal-500/15 text-teal-400 text-[10px] font-black rounded-xl px-2.5 py-1.5 text-center shrink-0 min-w-[48px]">
                  {new Date(ev.data+'T12:00:00').toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}).replace('.','')}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-white/90 truncate">{ev.nome}</p>
                  <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${ev.status==='pago'?'bg-emerald-500/15 text-emerald-400':'bg-amber-500/15 text-amber-400'}`}>
                    {ev.status==='pago'?'Pago':'Pendente'}
                  </span>
                </div>
                <p className={`text-sm font-bold shrink-0 ${ev.valor>0?'text-teal-400':'text-white/20'}`}>
                  {ev.valor>0?Rs(ev.valor):'—'}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ══ 6. OKRs ═══════════════════════════════════════════════════════ */}
      <section className="bg-[#12141f] rounded-3xl border border-white/10 p-6">
        <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
          <SectionHeader icon={Target} title="OKRs" subtitle="Objetivos e Resultados-chave" grad="from-[#7D1F2C] to-[#c94454]"/>
          <button onClick={()=>setShowForm(v=>!v)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7D1F2C] to-[#9B2535] shadow-sm hover:shadow-md transition-all h-fit">
            <Plus className="w-3.5 h-3.5"/>
            Novo Objetivo
          </button>
        </div>

        {/* Formulário */}
        {showForm&&(
          <div className="mb-5 border-2 border-dashed border-[#D4AF37]/40 rounded-2xl p-4 bg-gradient-to-br from-amber-50/50 to-white">
            <p className="text-xs font-bold text-white/60 mb-3 uppercase tracking-wide">Novo Objetivo</p>
            <div className="grid gap-3">
              <input value={newOkr.titulo} onChange={e=>setNewOkr(v=>({...v,titulo:e.target.value}))}
                placeholder="Título do objetivo *"
                className="w-full text-sm border border-white/10 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/20 bg-[#12141f]"/>
              <textarea value={newOkr.descricao} onChange={e=>setNewOkr(v=>({...v,descricao:e.target.value}))}
                placeholder="Descrição (opcional)" rows={2}
                className="w-full text-sm border border-white/10 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/20 bg-[#12141f] resize-none"/>
              <div className="grid grid-cols-2 gap-3">
                <select value={newOkr.trimestre} onChange={e=>setNewOkr(v=>({...v,trimestre:e.target.value}))}
                  className="text-sm border border-white/10 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/20 bg-[#12141f]">
                  {['Q1 2026','Q2 2026','Q3 2026','Q4 2026'].map(t=><option key={t}>{t}</option>)}
                </select>
                <input value={newOkr.responsavel} onChange={e=>setNewOkr(v=>({...v,responsavel:e.target.value}))}
                  placeholder="Responsável"
                  className="text-sm border border-white/10 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/20 bg-[#12141f]"/>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={()=>setShowForm(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white/60 bg-[#12141f]/10 hover:bg-white/15 transition-colors">
                  Cancelar
                </button>
                <button onClick={saveOkr} disabled={saving||!newOkr.titulo.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7D1F2C] to-[#9B2535] disabled:opacity-50 hover:shadow-md transition-all">
                  {saving?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<Check className="w-3.5 h-3.5"/>}
                  Salvar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Lista OKRs */}
        {loading
          ? [1,2,3].map(i=><div key={i} className="h-20 bg-[#12141f]/10 rounded-2xl animate-pulse mb-3"/>)
          : okrs.length===0
          ? (
            <div className="text-center py-10 text-white/30">
              <Target className="w-10 h-10 mx-auto mb-3 opacity-20"/>
              <p className="text-sm font-semibold">Nenhum OKR cadastrado</p>
              <p className="text-xs mt-1">Clique em "Novo Objetivo" para começar</p>
            </div>
          )
          : okrs.map(okr=>{
              const st=OKR_ST[okr.status]||OKR_ST['on-track'];
              return (
                <div key={okr.id} className="border border-white/10 rounded-2xl p-4 mb-3 hover:border-white/10 hover:shadow-sm transition-all group">
                  <div className="flex items-start gap-3">
                    {/* Ring */}
                    <div className="relative shrink-0 cursor-default">
                      <Ring p={okr.progresso} color={st.clr}/>
                      <span className="absolute inset-0 flex items-center justify-center text-[9px] font-black text-white/80 rotate-90">
                        {okr.progresso.toFixed(0)}%
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-bold text-white">{okr.titulo}</p>
                          {okr.descricao&&<p className="text-xs text-white/30 mt-0.5 line-clamp-1">{okr.descricao}</p>}
                        </div>
                        <button onClick={()=>setConfirmDel(confirmDel===okr.id?null:okr.id)}
                          className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg hover:bg-red-500/10 text-white/20 hover:text-red-500 transition-all shrink-0">
                          <Trash2 className="w-3.5 h-3.5"/>
                        </button>
                      </div>
                      <div className="flex items-center gap-2 mt-2 flex-wrap">
                        <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${st.bg} ${st.txt}`}>{st.lbl}</span>
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-[#12141f]/10 text-white/60">{okr.trimestre}</span>
                        {okr.responsavel&&<span className="text-[9px] text-white/30">{okr.responsavel}</span>}
                        <span className="text-[9px] text-white/30">{okr.totalKrs} KR{okr.totalKrs!==1?'s':''}</span>
                      </div>
                    </div>
                  </div>
                  {confirmDel===okr.id&&(
                    <div className="mt-3 flex items-center gap-2 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
                      <p className="text-xs text-red-400 font-medium flex-1">Excluir este objetivo?</p>
                      <button onClick={()=>deleteOkr(okr.id)} className="text-xs font-bold text-white bg-red-500 px-3 py-1 rounded-lg hover:bg-red-600">Sim</button>
                      <button onClick={()=>setConfirmDel(null)} className="text-xs font-bold text-white/60 bg-white/10 px-3 py-1 rounded-lg hover:bg-white/20">Não</button>
                    </div>
                  )}
                </div>
              );
            })
        }
      </section>

    </div>
  );
}
