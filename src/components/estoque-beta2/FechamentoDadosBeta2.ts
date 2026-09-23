import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';

export interface ItemControle {
 id:string;nome:string;codigo:string|null;unidade_medida:string|null;categoria:string|null;grupo_controle:string|null;status:string;
}
export interface NivelControle {item_id:string;estoque_id:string;nivel_reposicao:number|null;controle:string|null}
export interface EstoqueControle {id:string;nome:string;tipo:string|null;status:boolean}
interface MapZig {id:string;item_estoque_id:string|null;ficha_tecnica_id:string|null;estoque_id:string|null;ignorar_estoque:boolean}
interface Ingrediente {ficha_id:string;item_estoque_id:string|null;baixa_estoque:boolean}
export interface LogZig {id:string;dtinicio:string;dtfim:string;status:string;iniciado_em:string;finalizado_em:string|null;total_nao_mapeados:number|null;erro_mensagem:string|null}
export interface ColaboradorControle {id:string;nome_completo:string}
export interface EmbalagemControle {item_id:string;rotulo_solto:string|null;rotulo_fechado:string|null;fator_fechado:number|null;permite_fracao:boolean;dica:string|null}
export type FrequenciaManual='diario'|'periodico';
export type ControleEfetivo='zig'|'diario'|'periodico';
export interface ItemDoSetor extends NivelControle {
 item:ItemControle;controleEfetivo:ControleEfetivo;mapeadoZig:boolean;saldo:number;
}
export interface FechamentoPreview {
 id:string;estoqueId:string;estoqueNome:string;dataOperacional:string;
 responsavel:string;auditoria:boolean;criadoEm:string;
 quantidades:Record<string,number>;saldosNoFechamento:Record<string,number>;
}
export const keyOf=(estoqueId:string,itemId:string)=>estoqueId+':'+itemId;
export const fmt3=(n:number)=>Number(n||0).toLocaleString('pt-BR',{maximumFractionDigits:3});
export const cuiabaDate=(date=new Date()):string=>{
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'America/Cuiaba',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
 const part=(type:string)=>parts.find(x=>x.type===type)?.value||'';
 return part('year')+'-'+part('month')+'-'+part('day');
};
export const diaOperacional=()=>{
 const now=new Date();
 const hour=Number(new Intl.DateTimeFormat('en-US',{timeZone:'America/Cuiaba',hour:'2-digit',hourCycle:'h23'}).format(now));
 const d=cuiabaDate(now);
 if(hour>=6)return d;
 const prev=new Date(d+'T12:00:00Z');prev.setUTCDate(prev.getUTCDate()-1);
 return prev.toISOString().slice(0,10);
};
export const dataSeguinte=(date:string)=>{
 const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+1);
 return d.toISOString().slice(0,10);
};
export const dataAnterior=(date:string)=>{
 const d=new Date(date+'T12:00:00Z');d.setUTCDate(d.getUTCDate()-1);
 return d.toISOString().slice(0,10);
};
export const diaAuditoria=(date:string)=>[0,1,4].includes(new Date(date+'T12:00:00Z').getUTCDay());
export const dataBR=(date:string)=>date?date.split('-').reverse().join('/'):'—';
const n=(v:unknown)=>Number(v??0)||0;
async function paginar(table:string,fields:string,order:string){
 const all:Record<string,any>[]=[];
 for(let start=0;start<10000;start+=500){
  const {data,error}=await supabase.from(table).select(fields).order(order).range(start,start+499);
  if(error)throw error;
  all.push(...(data||[]) as Record<string,any>[]);
  if(!data||data.length<500)break;
 }
 return all;
}
export function useControleZigBeta2(){
 const[reload,setReload]=useState(0);
 const[loading,setLoading]=useState(true);
 const[error,setError]=useState('');
 const[items,setItems]=useState<ItemControle[]>([]);
 const[niveis,setNiveis]=useState<NivelControle[]>([]);
 const[estoques,setEstoques]=useState<EstoqueControle[]>([]);
 const[mapeamentos,setMapeamentos]=useState<MapZig[]>([]);
 const[ingredientes,setIngredientes]=useState<Ingrediente[]>([]);
 const[saldos,setSaldos]=useState<Record<string,number>>({});
 const[embalagens,setEmbalagens]=useState<Record<string,EmbalagemControle>>({});
 const[logs,setLogs]=useState<LogZig[]>([]);
 const[colaboradores,setColaboradores]=useState<ColaboradorControle[]>([]);
 const[overrides,setOverrides]=useState<Record<string,FrequenciaManual>>({});
 useEffect(()=>{
  let live=true;
  const load=async()=>{
   setLoading(true);setError('');
   try{
    const [it,nv,es,mp,fi,sa,bc,lg,co]=await Promise.all([
     paginar('itens_estoque','id,nome,codigo,unidade_medida,categoria,grupo_controle,status','nome'),
     paginar('itens_estoque_niveis','item_id,estoque_id,nivel_reposicao,controle','item_id'),
     paginar('estoques','id,nome,tipo,status','nome'),
     paginar('mapeamento_itens_vendas','id,item_estoque_id,ficha_tecnica_id,estoque_id,ignorar_estoque','id'),
     paginar('ficha_ingredientes','id,ficha_id,item_estoque_id,baixa_estoque','id'),
     paginar('saldos_estoque','id,estoque_id,item_id,quantidade_atual','id'),
     paginar('beta_item_config','item_id,rotulo_solto,rotulo_fechado,fator_fechado,permite_fracao,dica','item_id'),
     supabase.from('zig_vendas_sync_logs')
      .select('id,dtinicio,dtfim,status,iniciado_em,finalizado_em,total_nao_mapeados,erro_mensagem')
      .order('iniciado_em',{ascending:false}).limit(40),
     supabase.from('colaboradores').select('id,nome_completo').eq('status','ativo').order('nome_completo')
    ]);
    if(lg.error)throw lg.error;
    if(co.error)throw co.error;
    if(!live)return;
    setItems(it as unknown as ItemControle[]);
    setNiveis(nv.map(v=>({...v,nivel_reposicao:v.nivel_reposicao==null?null:n(v.nivel_reposicao)})) as NivelControle[]);
    setEstoques(es as unknown as EstoqueControle[]);
    setMapeamentos(mp as unknown as MapZig[]);
    setIngredientes(fi as unknown as Ingrediente[]);
    setSaldos(Object.fromEntries(sa.map(x=>[keyOf(String(x.estoque_id),String(x.item_id)),n(x.quantidade_atual)])));
    setEmbalagens(Object.fromEntries(bc.map(x=>[String(x.item_id),x as EmbalagemControle])));
    setLogs((lg.data||[]) as LogZig[]);
    setColaboradores((co.data||[]) as ColaboradorControle[]);
   }catch(ex){if(live)setError(ex instanceof Error?ex.message:'Não foi possível consultar o mapeamento Zig.');}
   finally{if(live)setLoading(false);}
  };
  void load();return()=>{live=false;};
 },[reload]);
 const zigPorEstoque=useMemo(()=>{
  const fichas=new Map<string,string[]>();
  for(const ing of ingredientes){
   if(!ing.baixa_estoque||!ing.item_estoque_id)continue;
   fichas.set(ing.ficha_id,[...(fichas.get(ing.ficha_id)||[]),ing.item_estoque_id]);
  }
  const cobertos=new Set<string>();
  for(const m of mapeamentos){
   if(m.ignorar_estoque||!m.estoque_id)continue;
   if(m.ficha_tecnica_id){for(const itemId of fichas.get(m.ficha_tecnica_id)||[])cobertos.add(keyOf(m.estoque_id,itemId));}
   else if(m.item_estoque_id)cobertos.add(keyOf(m.estoque_id,m.item_estoque_id));
  }
  return cobertos;
 },[mapeamentos,ingredientes]);
 const setores=useMemo(()=>{
  const configured=new Set(niveis.map(n=>n.estoque_id));
  return estoques.filter(e=>e.status&&configured.has(e.id)&&e.tipo!=='central').sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));
 },[estoques,niveis]);
 const linhas=useMemo(()=>{
  const byId=new Map(items.filter(i=>i.status==='ativo').map(i=>[i.id,i]));
  const out:ItemDoSetor[]=[];
  for(const level of niveis){
   const item=byId.get(level.item_id);if(!item)continue;
   const k=keyOf(level.estoque_id,item.id);
   const mapeado=zigPorEstoque.has(k);
   const controleEfetivo:ControleEfetivo=mapeado?'zig':overrides[k]||(item.grupo_controle==='gasta'?'periodico':'diario');
   out.push({...level,item,controleEfetivo,mapeadoZig:mapeado,saldo:saldos[k]||0});
  }
  return out.sort((a,b)=>a.item.nome.localeCompare(b.item.nome,'pt-BR'));
 },[items,niveis,saldos,overrides,zigPorEstoque]);
 return {
  loading,error,items,niveis,estoques,setores,linhas,saldos,embalagens,logs,colaboradores,overrides,
  mapeamentos,refresh:()=>setReload(v=>v+1),
  setFrequencia:(estoqueId:string,itemId:string,value:FrequenciaManual)=>{
   const k=keyOf(estoqueId,itemId);
   if(zigPorEstoque.has(k))return;
   setOverrides(prev=>({...prev,[k]:value}));
  }
 };
}
