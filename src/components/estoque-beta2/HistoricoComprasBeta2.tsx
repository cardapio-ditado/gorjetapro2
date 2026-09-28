import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Eye, History, RefreshCw, Search, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { NotePreview } from './RecebimentoBeta2';
import './OperacoesBeta2.css';

type Mode='pendentes'|'historico';
type Purchase={
 id:string;numero_documento:string|null;fornecedor_id:string|null;
 data_pedido:string|null;data_compra:string;data_entrega_prevista:string|null;data_entrega_real:string|null;
 estoque_destino_id:string;valor_total:number;status:string;observacoes:string|null;criado_em:string;
};
type Line={id:string;quantidade:number;quantidade_pedida:number|null;quantidade_recebida:number|null;custo_unitario:number;custo_total:number;divergencia:boolean|null;motivo_divergencia:string|null;itens_estoque:{nome:string;unidade_medida:string}|null};
interface Props{mode:Mode;preview:NotePreview[];openId?:string}
const fmt=(v:unknown)=>Number(v||0).toLocaleString('pt-BR',{maximumFractionDigits:3});
const money=(v:unknown)=>Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const day=(v:string|null|undefined)=>v?v.slice(0,10).split('-').reverse().join('/'):'—';
const label=(s:string)=>({pendente:'Pendente',recebido:'Recebido',cancelado:'Cancelado',demo:'Conferência simulada'} as Record<string,string>)[s]||s;
const HistoricoComprasBeta2:React.FC<Props>=({mode,preview,openId})=>{
 const[records,setRecords]=useState<Purchase[]>([]);
 const[vendors,setVendors]=useState<Record<string,string>>({});
 const[stocks,setStocks]=useState<Record<string,string>>({});
 const[busy,setBusy]=useState(false);
 const[error,setError]=useState('');
 const[term,setTerm]=useState('');
 const[selected,setSelected]=useState<{kind:'real'|'demo';id:string}|null>(null);
 const[detail,setDetail]=useState<Line[]>([]);
 const[detailBusy,setDetailBusy]=useState(false);
 const[detailError,setDetailError]=useState('');
 const[refresh,setRefresh]=useState(0);
 const load=useCallback(async()=>{
  setBusy(true);setError('');
  try{
   const [orders,forns,est]=await Promise.all([
    supabase.from('entradas_compras')
      .select('id,numero_documento,fornecedor_id,data_pedido,data_compra,data_entrega_prevista,data_entrega_real,estoque_destino_id,valor_total,status,observacoes,criado_em')
      .in('status',mode==='pendentes'?['pendente']:['recebido','cancelado'])
      .order('criado_em',{ascending:mode==='pendentes'}).limit(200),
    supabase.from('fornecedores').select('id,nome'),
    supabase.from('estoques').select('id,nome')
   ]);
   if(orders.error)throw orders.error;
   if(forns.error)throw forns.error;
   if(est.error)throw est.error;
   setRecords((orders.data||[]) as Purchase[]);
   setVendors(Object.fromEntries((forns.data||[]).map(x=>[x.id,x.nome])));
   setStocks(Object.fromEntries((est.data||[]).map(x=>[x.id,x.nome])));
  }catch(e){setRecords([]);setError(e instanceof Error?e.message:'Não foi possível carregar pedidos e notas do cadastro original.');}
  finally{setBusy(false);}
 },[mode]);
 useEffect(()=>{void load();},[load,refresh]);
 useEffect(()=>{setSelected(null);setDetail([]);setTerm('');setDetailError('');},[mode]);
 useEffect(()=>{if(openId&&preview.some(x=>x.id===openId))setSelected({kind:'demo',id:openId});},[openId,preview]);
 useEffect(()=>{
  if(selected?.kind!=='real'){setDetail([]);setDetailError('');return;}
  let live=true;setDetailBusy(true);setDetail([]);setDetailError('');
  void(async()=>{
   const{data,error:e}=await supabase.from('itens_entrada_compra')
     .select('id,quantidade,quantidade_pedida,quantidade_recebida,custo_unitario,custo_total,divergencia,motivo_divergencia,itens_estoque(nome,unidade_medida)')
     .eq('entrada_compra_id',selected.id);
   if(!live)return;
   if(e)setDetailError(e.message);else setDetail((data||[]) as unknown as Line[]);
   setDetailBusy(false);
  })();
  return()=>{live=false;};
 },[selected?.kind,selected?.id]);
 const match=(v:string)=>v.toLocaleLowerCase('pt-BR').includes(term.toLocaleLowerCase('pt-BR').trim());
 const filtered=useMemo(()=>records.filter(r=>match([
  r.numero_documento,vendors[r.fornecedor_id||''],stocks[r.estoque_destino_id],r.status,r.observacoes
 ].join(' '))),[records,vendors,stocks,term]);
 const demos=useMemo(()=>mode==='historico'?preview.filter(r=>match([
  r.invoice,r.supplier,r.stock,r.observations,...r.items.map(i=>i.item)
 ].join(' '))):[],[mode,preview,term]);
 const actual=selected?.kind==='real'?records.find(r=>r.id===selected.id):undefined;
 const sample=selected?.kind==='demo'?preview.find(r=>r.id===selected.id):undefined;
 return <div className="b2-history">
  <div className="b2-op-section-title"><div><p className="b2-eyebrow">Compras · consulta</p>
   <h2>{mode==='pendentes'?'Pedidos pendentes de recebimento':'Histórico de pedidos e notas'}</h2></div>
   <button className="b2-btn alt small" onClick={()=>setRefresh(v=>v+1)} disabled={busy}><RefreshCw size={14}/>Atualizar</button>
  </div>
  <p className="b2-lead">Abra um pedido para conferir fornecedor, nota, estoque, datas, todos os produtos e quantidades.</p>
  <div className="b2-hint">Pedidos e notas oficiais: <strong>somente leitura</strong>. Notas marcadas “TESTE” foram lançadas apenas nesta prévia.</div>
  <label className="b2-history-search"><Search size={17}/><input value={term} onChange={e=>setTerm(e.target.value)}
    placeholder="Buscar nota, fornecedor, estoque ou produto simulado..." aria-label="Pesquisar compras"/></label>
  {error&&<div className="b2-error" role="alert">{error}</div>}
  {busy&&<div className="b2-hint">Carregando o histórico original...</div>}
  <div className="b2-history-layout"><section className="b2-card b2-history-list">
   <div className="b2-topline"><h2>Pedidos e notas</h2><span className="b2-pill">{filtered.length+demos.length}</span></div>
   {!busy&&filtered.length===0&&demos.length===0&&<div className="b2-hint">Nenhum registro encontrado.</div>}
   {demos.map(r=><button key={'demo-'+r.id} type="button" className={'b2-history-row'+(selected?.kind==='demo'&&selected.id===r.id?' selected':'')}
    onClick={()=>setSelected({kind:'demo',id:r.id})}>
    <span className="b2-history-main"><strong>Nota {r.invoice} · {r.supplier}</strong><small>{r.stock} · {r.items.length} item(ns)</small><small>{day(r.date)} · {money(r.total)}</small></span>
    <span className="b2-history-tags"><span className="b2-pill">TESTE</span><span className="b2-pill green">Conferida</span></span><Eye size={16} className="b2-history-eye"/>
   </button>)}
   {filtered.map(r=><button key={r.id} type="button" className={'b2-history-row'+(selected?.kind==='real'&&selected.id===r.id?' selected':'')}
    onClick={()=>setSelected({kind:'real',id:r.id})}>
    <span className="b2-history-main"><strong>{r.numero_documento?'Nota / pedido '+r.numero_documento:'Pedido '+r.id.slice(0,8)}</strong>
      <small>{vendors[r.fornecedor_id||'']||'Fornecedor não identificado'} → {stocks[r.estoque_destino_id]||'Estoque não localizado'}</small>
      <small>{day(r.data_compra)} · {money(r.valor_total)}</small></span>
    <span className="b2-history-tags"><span className="b2-pill green">OFICIAL</span><span className={'b2-pill '+(r.status==='recebido'?'green':r.status==='cancelado'?'red':'')}>{label(r.status)}</span></span>
    <Eye size={16} className="b2-history-eye"/>
   </button>)}
   {records.length>=200&&<p className="b2-op-small">Exibindo até 200 registros oficiais mais recentes. Períodos anteriores continuam disponíveis no módulo original.</p>}
  </section>
  <section className="b2-card b2-history-details" aria-label="Detalhes da nota ou pedido">
   {actual?<><div className="b2-topline"><div><p className="b2-eyebrow">Cadastro oficial · consulta</p><h2>{actual.numero_documento||'Pedido '+actual.id.slice(0,8)}</h2></div>
      <button className="b2-btn alt small" onClick={()=>setSelected(null)}><X size={15}/>Fechar</button></div>
      <span className={'b2-pill '+(actual.status==='recebido'?'green':actual.status==='cancelado'?'red':'')}>{label(actual.status)}</span>
      <div className="b2-history-meta">{[
       ['Fornecedor',vendors[actual.fornecedor_id||'']],['Estoque de destino',stocks[actual.estoque_destino_id]],
       ['Data do pedido',day(actual.data_pedido)],['Data da compra',day(actual.data_compra)],
       ['Entrega prevista',day(actual.data_entrega_prevista)],['Entrega real',day(actual.data_entrega_real)],
       ['Valor total',money(actual.valor_total)]
      ].map(([key,val])=><div key={key}><small>{key}</small><strong>{val||'—'}</strong></div>)}</div>
      {actual.observacoes&&<div className="b2-hint"><strong>Observações</strong><p>{actual.observacoes}</p></div>}
      <h3 className="b2-history-items-title">Itens {detailBusy?'· carregando...':'('+detail.length+')'}</h3>
      {detailError&&<div className="b2-error">Erro ao abrir os itens: {detailError}</div>}
      {!detailBusy&&!detailError&&<div className="b2-table-scroll"><table className="b2-history-table">
       <thead><tr><th>Produto</th><th>Pedido</th><th>Recebido</th><th>Custo unit.</th></tr></thead>
       <tbody>{detail.map(l=><tr key={l.id}><td><strong>{l.itens_estoque?.nome||'Produto'}</strong>
        {l.motivo_divergencia&&<small>Diferença: {l.motivo_divergencia}</small>}</td>
        <td>{fmt(l.quantidade_pedida??l.quantidade)} {l.itens_estoque?.unidade_medida||''}</td>
        <td>{l.quantidade_recebida==null?'—':fmt(l.quantidade_recebida)+' '+(l.itens_estoque?.unidade_medida||'')}</td>
        <td>{money(l.custo_unitario)}</td></tr>)}</tbody>
      </table></div>}
      <p className="b2-op-small">Consulta ao cadastro oficial, sem confirmar recebimento ou alterar saldo.</p>
    </>:sample?<><div className="b2-topline"><div><p className="b2-eyebrow">Nota de teste · dados locais</p><h2>Nota {sample.invoice}</h2></div>
      <button className="b2-btn alt small" onClick={()=>setSelected(null)}><X size={15}/>Fechar</button></div>
      <span className="b2-pill">TESTE · não alterou estoque</span>
      <div className="b2-history-meta">{[
       ['Fornecedor',sample.supplier],['Estoque de destino',sample.stock],
       ['Data da chegada',day(sample.date)],['Valor total',money(sample.total)],
       ['Pedido vinculado',sample.order?'Sim':'Sem pedido prévio']
      ].map(([key,val])=><div key={key}><small>{key}</small><strong>{val}</strong></div>)}</div>
      {sample.observations&&<div className="b2-hint">Observações: {sample.observations}</div>}
      <h3 className="b2-history-items-title">Itens ({sample.items.length})</h3>
      <div className="b2-table-scroll"><table className="b2-history-table">
       <thead><tr><th>Produto</th><th>Na nota</th><th>Recebido</th><th>Custo unit.</th></tr></thead>
       <tbody>{sample.items.map((l,i)=><tr key={i}><td><strong>{l.item}</strong></td><td>{fmt(l.documentQty)}</td><td>{fmt(l.quantity)}</td><td>{money(l.price)}</td></tr>)}</tbody></table></div>
      <div className="b2-hint">Esta nota é demonstrativa e desaparece ao reiniciar os testes.</div>
    </>:<div className="b2-history-placeholder"><History size={32}/><h2>Abra um pedido</h2><p>Selecione um pedido ou nota à esquerda para consultar os detalhes.</p><ArrowRight size={18}/></div>}
  </section></div>
 </div>;
};
export default HistoricoComprasBeta2;
