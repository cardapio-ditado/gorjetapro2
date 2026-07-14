import { useState, useEffect, useCallback } from 'react';
import {
  Target, RefreshCw, Plus, Trash2, Check, Loader2,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

/**
 * OKRs ESTRATÉGICOS
 * Página dedicada aos Objetivos e Resultados-chave trimestrais.
 * Os KPIs executivos que existiam aqui migraram para o Painel do Dono (rota /),
 * que usa a RPC canônica fn_dashboard_dono — não recriar KPIs aqui.
 */

// ─── Types ────────────────────────────────────────────────────────────────────
interface OKR    { id:string; titulo:string; descricao:string; trimestre:string; responsavel:string; status:string; progresso:number; totalKrs:number }
interface NewOKR { titulo:string; descricao:string; trimestre:string; responsavel:string }

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

const trimestreAtual = () => {
  const d = new Date();
  return `Q${Math.floor(d.getMonth()/3)+1} ${d.getFullYear()}`;
};

// ═══════════════════════════════════════════════════════════════════════════════
export default function GestaoEstrategica() {
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [okrs,       setOkrs]       = useState<OKR[]>([]);

  const [showForm,   setShowForm]   = useState(false);
  const [confirmDel, setConfirmDel] = useState<string|null>(null);
  const [newOkr,     setNewOkr]     = useState<NewOKR>({titulo:'',descricao:'',trimestre:trimestreAtual(),responsavel:''});
  const [saving,     setSaving]     = useState(false);

  const load = useCallback(async () => {
    try {
      const {data:okrD} = await supabase
        .from('okr_objetivos')
        .select('id,titulo,descricao,trimestre,responsavel,status,okr_key_results(meta_valor,valor_atual)')
        .is('deletado_em',null)
        .order('criado_em',{ascending:false});

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
    if (!error){setNewOkr({titulo:'',descricao:'',trimestre:trimestreAtual(),responsavel:''});setShowForm(false);load();}
    setSaving(false);
  };

  const deleteOkr = async (id:string) => {
    await supabase.from('okr_objetivos').update({deletado_em:new Date().toISOString()}).eq('id',id);
    setConfirmDel(null); setOkrs(p=>p.filter(o=>o.id!==id));
  };

  const anoAtual   = new Date().getFullYear();
  const trimestres = [1,2,3,4].map(q=>`Q${q} ${anoAtual}`).concat([`Q1 ${anoAtual+1}`]);

  return (
    <div className="space-y-6 pb-12">

      {/* ══ HEADER HERO ═══════════════════════════════════════════════════ */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#7D1F2C] via-[#9B2535] to-[#3d0e16] p-6 shadow-2xl">
        <div className="absolute inset-0 opacity-[0.07]"
          style={{backgroundImage:`repeating-linear-gradient(45deg, #D4AF37 0px, #D4AF37 1px, transparent 0px, transparent 50%),repeating-linear-gradient(-45deg, #D4AF37 0px, #D4AF37 1px, transparent 0px, transparent 50%)`, backgroundSize:'30px 30px'}}/>
        <div className="absolute top-0 right-0 w-72 h-72 rounded-full bg-[#D4AF37] opacity-5 -translate-y-1/2 translate-x-1/3"/>

        <div className="relative flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="text-[#D4AF37] text-[10px] font-black uppercase tracking-[0.3em] mb-2">Ditado Popular</p>
            <h1 className="text-3xl font-black text-white tracking-tight">OKRs Estratégicos</h1>
            <p className="text-white/50 text-sm mt-1">Objetivos e resultados-chave por trimestre</p>
          </div>
          <button onClick={refresh} disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white/70 bg-white/10 hover:bg-white/15 border border-white/15 transition-all">
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing?'animate-spin':''}`}/>
            Atualizar
          </button>
        </div>

        {/* Resumo por status */}
        {!loading && okrs.length > 0 && (
          <div className="relative mt-5 flex flex-wrap gap-2">
            {Object.entries(OKR_ST).map(([key,st])=>{
              const n = okrs.filter(o=>(OKR_ST[o.status]?st===OKR_ST[o.status]:key==='on-track')).length;
              if (n===0) return null;
              return (
                <span key={key} className={`text-[10px] font-bold px-3 py-1 rounded-full border border-white/15 ${st.bg} ${st.txt}`}>
                  {n} {st.lbl}
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* ══ OKRs ═══════════════════════════════════════════════════════════ */}
      <section className="bg-[#12141f] rounded-3xl border border-white/10 p-6">
        <div className="flex items-start justify-between mb-5 flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-[#7D1F2C] to-[#c94454] shadow-sm">
              <Target className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-white tracking-tight leading-none">Objetivos</h2>
              <p className="text-xs text-white/30 mt-0.5">{okrs.length} objetivo{okrs.length!==1?'s':''} ativo{okrs.length!==1?'s':''}</p>
            </div>
          </div>
          <button onClick={()=>setShowForm(v=>!v)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold text-white bg-gradient-to-r from-[#7D1F2C] to-[#9B2535] shadow-sm hover:shadow-md transition-all h-fit">
            <Plus className="w-3.5 h-3.5"/>
            Novo Objetivo
          </button>
        </div>

        {/* Formulário */}
        {showForm&&(
          <div className="mb-5 border-2 border-dashed border-[#D4AF37]/40 rounded-2xl p-4 bg-white/5">
            <p className="text-xs font-bold text-white/60 mb-3 uppercase tracking-wide">Novo Objetivo</p>
            <div className="grid gap-3">
              <input value={newOkr.titulo} onChange={e=>setNewOkr(v=>({...v,titulo:e.target.value}))}
                placeholder="Título do objetivo *"
                className="w-full text-sm text-white border border-white/10 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/40 bg-[#0d0f1a]"/>
              <textarea value={newOkr.descricao} onChange={e=>setNewOkr(v=>({...v,descricao:e.target.value}))}
                placeholder="Descrição (opcional)" rows={2}
                className="w-full text-sm text-white border border-white/10 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/40 bg-[#0d0f1a] resize-none"/>
              <div className="grid grid-cols-2 gap-3">
                <select value={newOkr.trimestre} onChange={e=>setNewOkr(v=>({...v,trimestre:e.target.value}))}
                  className="text-sm text-white border border-white/10 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/40 bg-[#0d0f1a]">
                  {trimestres.map(t=><option key={t}>{t}</option>)}
                </select>
                <input value={newOkr.responsavel} onChange={e=>setNewOkr(v=>({...v,responsavel:e.target.value}))}
                  placeholder="Responsável"
                  className="text-sm text-white border border-white/10 rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/40 bg-[#0d0f1a]"/>
              </div>
              <div className="flex gap-2 justify-end">
                <button onClick={()=>setShowForm(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-white/60 bg-white/10 hover:bg-white/15 transition-colors">
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
          ? [1,2,3].map(i=><div key={i} className="h-20 bg-white/5 rounded-2xl animate-pulse mb-3"/>)
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
                <div key={okr.id} className="border border-white/10 rounded-2xl p-4 mb-3 hover:border-white/20 hover:shadow-sm transition-all group">
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
                        <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-white/10 text-white/60">{okr.trimestre}</span>
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
