import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, History, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import './OperacoesBeta2.css';
import PesquisaItemBeta2 from './PesquisaItemBeta2';
import HistoricoComprasBeta2 from './HistoricoComprasBeta2';

type Row = {id:string;nome:string;[key:string]:any};
type NoteItem = {key:string;itemId:string;documentQty:string;quantity:string;ordered:string;unitCost:string};
export interface NotePreview {
  id:string;invoice:string;supplierId:string;supplier:string;stock:string;date:string;observations:string;
  order:string;items:{item:string;documentQty:number;quantity:number;ordered:number|null;price:number}[];
  total:number;
}
interface Props{receipts:NotePreview[];onSave:(note:NotePreview)=>void}
const mkLine=():NoteItem=>({key:Math.random().toString(36).slice(2),itemId:'',documentQty:'',quantity:'',ordered:'',unitCost:''});
const numeric=(n:unknown)=>Number(String(n??0).replace(',','.'))||0;
const price=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const today=()=>new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,10);
async function loadList(table:string){
 const all:Row[]=[];
 for(let start=0;start<10000;start+=500){
  const {data,error}=await supabase.from(table).select('*').order('nome').range(start,start+499);
  if(error)throw error;
  all.push(...(data||[]) as Row[]);if(!data||data.length<500)break;
 }
 return all;
}
const RecebimentoBeta2:React.FC<Props>=({receipts,onSave})=>{
 const[mode,setMode]=useState<'direto'|'pedido'>('direto');
 const[screen,setScreen]=useState<'nova'|'pendentes'|'historico'>('nova');
 const[openPreviewId,setOpenPreviewId]=useState('');
 const[items,setItems]=useState<Row[]>([]);
 const[suppliers,setSuppliers]=useState<Row[]>([]);
 const[stocks,setStocks]=useState<Row[]>([]);
 const[orders,setOrders]=useState<Row[]>([]);
 const[lines,setLines]=useState<NoteItem[]>([mkLine()]);
 const[focusLine,setFocusLine]=useState('');
 const[invoice,setInvoice]=useState('');
 const[supplierId,setSupplierId]=useState('');
 const[stockId,setStockId]=useState('');
 const[orderId,setOrderId]=useState('');
 const[date,setDate]=useState(today());
 const[notes,setNotes]=useState('');
 const[loading,setLoading]=useState(true);
 const[orderLoading,setOrderLoading]=useState(false);
 const[error,setError]=useState('');
 const[success,setSuccess]=useState('');
 useEffect(()=>{
  let live=true;
  const load=async()=>{
   setLoading(true);
   try{
    const [productData,supplierData,stockData]=await Promise.all([
     loadList('itens_estoque'),loadList('fornecedores'),loadList('estoques')
    ]);
    if(!live)return;
    setItems(productData);setSuppliers(supplierData.filter(x=>x.status==='ativo'));
    const active=stockData.filter(x=>x.status===true);
    setStocks(active);
    setStockId(p=>p||active.find(x=>x.tipo==='central')?.id||active[0]?.id||'');
    // Pedidos do módulo original: registros de entrada ainda pendentes.
    const{data,error:e}=await supabase.from('entradas_compras')
       .select('id,numero_documento,fornecedor_id,estoque_destino_id,data_compra,status')
       .eq('status','pendente').order('data_compra',{ascending:false}).limit(100);
    if(!live)return;
    if(e){setOrders([]);setError('Os pedidos existentes não puderam ser consultados: '+e.message);}
    else setOrders((data||[]) as Row[]);
   }catch(ex){if(live)setError(ex instanceof Error?ex.message:'Falha ao carregar os cadastros originais.');}
   finally{if(live)setLoading(false);}
  };
  void load();return()=>{live=false;};
 },[]);
 const itemById=useMemo(()=>new Map(items.map(i=>[i.id,i])),[items]);
 const total=lines.reduce((sum,l)=>sum+numeric(l.quantity)*numeric(l.unitCost),0);
 const changeLine=(key:string,field:keyof NoteItem,value:string)=>
  setLines(prev=>prev.map(l=>l.key===key
   ?field==='documentQty'
      ?{...l,documentQty:value,quantity:(l.quantity===''||l.quantity===l.documentQty)?value:l.quantity}
      :{...l,[field]:value}
   :l));
 const reset=()=>{
  setLines([mkLine()]);setInvoice('');setOrderId('');setNotes('');
  setSupplierId('');setError('');setSuccess('');setMode('direto');setDate(today());
 };
 const pickMode=(next:'direto'|'pedido')=>{
  setMode(next);setOrderId('');setLines([mkLine()]);setError('');setSuccess('');
 };
 const linkOrder=async(id:string)=>{
  setOrderId(id);setError('');setSuccess('');setLines([mkLine()]);
  if(!id)return;
  setOrderLoading(true);
  try{
   const order=orders.find(o=>o.id===id);
   if(order){setSupplierId(String(order.fornecedor_id||''));setStockId(String(order.estoque_destino_id||''));}
   const{data,error:e}=await supabase.from('itens_entrada_compra')
     .select('item_id,quantidade,quantidade_pedida,quantidade_recebida,custo_unitario')
     .eq('entrada_compra_id',id);
   if(e)throw e;
   const mapped=(data||[]).map((row:any)=>({
    key:Math.random().toString(36).slice(2),itemId:String(row.item_id||''),
    ordered:String(row.quantidade_pedida??row.quantidade??''),
    documentQty:'',quantity:'',
    unitCost:String(row.custo_unitario??0)
   }));
   setLines(mapped.length?mapped:[mkLine()]);
  }catch(ex){setError(ex instanceof Error?ex.message:'Não foi possível abrir o pedido.');}
  finally{setOrderLoading(false);}
 };
 const save=(e:React.FormEvent)=>{
  e.preventDefault();setError('');setSuccess('');
  if(loading||orderLoading)return;
  if(!stockId||!supplierId||!invoice.trim()){setError('Informe fornecedor, estoque de destino e número da nota.');return;}
  if(mode==='pedido'&&!orderId){setError('Selecione um pedido existente ou use o recebimento sem pedido.');return;}
  if(receipts.some(r=>r.supplierId===supplierId&&r.invoice.trim().toLocaleLowerCase('pt-BR')===invoice.trim().toLocaleLowerCase('pt-BR'))){
   setError('Esta nota deste fornecedor já foi conferida nesta prévia. Abra a nota existente em vez de lançar novamente.');return;
  }
  if(!lines.length){setError('Inclua ao menos um produto na nota.');return;}
  for(let idx=0;idx<lines.length;idx++){
   const l=lines[idx],q=numeric(l.quantity),fromDoc=numeric(l.documentQty),p=numeric(l.unitCost);
   if(!l.itemId||!itemById.has(l.itemId)||l.documentQty===''||l.quantity===''||fromDoc<0||q<0||(mode==='direto'&&fromDoc===0)||p<0||!Number.isFinite(p)){
    setError('Corrija item, quantidade e custo na linha '+(idx+1)+'.');return;
   }
  }
  const supplier=suppliers.find(x=>x.id===supplierId);
  const stock=stocks.find(x=>x.id===stockId);
  const demoId=Math.random().toString(36).slice(2);
  onSave({
   id:demoId,
   invoice:invoice.trim(),supplierId,supplier:supplier?.nome||'Fornecedor selecionado',
   stock:stock?.nome||'Estoque selecionado',date,observations:notes.trim(),order:mode==='pedido'?orderId:'',
   items:lines.map(l=>({
    item:itemById.get(l.itemId)?.nome||'Item',documentQty:numeric(l.documentQty),quantity:numeric(l.quantity),
    ordered:mode==='pedido'?numeric(l.ordered):null,
    price:numeric(l.unitCost)
   })),total
  });
  setSuccess('Nota com '+lines.length+' linha(s) conferida SOMENTE nesta prévia. O saldo oficial não foi alterado.');
  setOpenPreviewId(demoId);setScreen('historico');
 };
 return <div>
  <p className="b2-eyebrow">Compras · entrada de mercadorias</p><h1>Recebimento de mercadoria</h1>
  <p className="b2-lead">Uma nota, vários produtos. Pedido prévio é opcional: a equipe pode registrar a chegada diretamente e conferir tudo de uma vez.</p>
  <div className="b2-hint">DEMONSTRAÇÃO: consulta itens, fornecedores, estoques e pedidos originais, mas não salva notas nem movimenta saldo no Supabase.</div>
  <div className="b2-op-tabs" role="tablist" aria-label="Recebimento e pedidos de compra">
   <button type="button" role="tab" className="b2-op-tab" aria-selected={screen==='nova'} aria-pressed={screen==='nova'} onClick={()=>setScreen('nova')}><Plus size={15}/>Nova nota</button>
   <button type="button" role="tab" className="b2-op-tab" aria-selected={screen==='pendentes'} aria-pressed={screen==='pendentes'} onClick={()=>{setScreen('pendentes');setOpenPreviewId('');}}><History size={15}/>Pedidos pendentes</button>
   <button type="button" role="tab" className="b2-op-tab" aria-selected={screen==='historico'} aria-pressed={screen==='historico'} onClick={()=>{setScreen('historico');setOpenPreviewId('');}}><History size={15}/>Histórico de pedidos e notas</button>
  </div>
  {success&&<div className="b2-op-summary" role="status"><CheckCircle2 size={21}/><strong>{success}</strong></div>}
  {screen==='nova'&&<>
  <div className="b2-op-tabs">
   <button type="button" className="b2-op-tab" aria-pressed={mode==='direto'} onClick={()=>pickMode('direto')}>Receber sem pedido prévio</button>
   <button type="button" className="b2-op-tab" aria-pressed={mode==='pedido'} onClick={()=>pickMode('pedido')}>Vincular a pedido existente</button>
  </div>
  {error&&<div className="b2-error" role="alert">{error}</div>}
  {loading?<div className="b2-card">Carregando cadastros reais...</div>:<form onSubmit={save}>
    {mode==='pedido'&&<div className="b2-op-box">
      <h3>Pedido enviado anteriormente</h3>
      <label className="b2-field"><span>Selecionar pedido pendente</span>
       <select value={orderId} onChange={e=>void linkOrder(e.target.value)}>
        <option value="">Selecione um pedido...</option>
        {orders.map(o=><option key={o.id} value={o.id}>{o.numero_documento||o.id.slice(0,8)} · {suppliers.find(s=>s.id===o.fornecedor_id)?.nome||'Fornecedor'} · {String(o.data_compra||'').slice(0,10)}</option>)}
       </select></label>
      <p className="b2-op-help">Ao escolher o pedido, os itens e as quantidades pedidas preenchem a mesma nota para conferência. {orderLoading?'Carregando linhas...':''}</p>
      {orders.length===0&&<p className="b2-op-warn">Nenhum pedido pendente encontrado neste cadastro. Se a mercadoria já chegou, use “Receber sem pedido prévio”.</p>}
    </div>}
    <section className="b2-card">
     <div className="b2-op-section-title"><h2>1 · Dados da nota</h2><span className="b2-pill">Uma nota → várias linhas</span></div>
     <div className="b2-op-fields">
      <label className="b2-field"><span>Fornecedor *</span><select value={supplierId} onChange={e=>setSupplierId(e.target.value)} required><option value="">Selecione...</option>{suppliers.map(f=><option value={f.id} key={f.id}>{f.nome}</option>)}</select></label>
      <label className="b2-field"><span>Estoque que recebe *</span><select value={stockId} onChange={e=>setStockId(e.target.value)} required><option value="">Selecione...</option>{stocks.map(x=><option value={x.id} key={x.id}>{x.nome}</option>)}</select></label>
      <label className="b2-field"><span>Número da nota *</span><input value={invoice} onChange={e=>setInvoice(e.target.value)} placeholder="Ex.: NF 123456" required/></label>
      <label className="b2-field"><span>Data da chegada</span><input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
      <label className="b2-field b2-op-wide"><span>Observações da conferência</span><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ex.: faltou uma caixa; entrega parcial; divergência de preço..."/></label>
     </div>
    </section>
    <section className="b2-section b2-card">
     <div className="b2-op-section-title"><h2>2 · Produtos desta nota</h2><span className="b2-pill">{lines.length} linha(s)</span></div>
     <p className="b2-op-help">Informe a quantidade da nota; a quantidade física começa igual, mas pode ser corrigida. Lance todos os itens da mesma nota aqui.</p>
     <div className="b2-op-lines">{lines.map((l,index)=>{
      const selected=itemById.get(l.itemId);
      const diff=mode==='pedido'?numeric(l.quantity)-numeric(l.ordered):0;
      return <div className="b2-op-line b2-op-line-compact" key={l.key}>
       <div className="b2-op-line-head"><strong>Produto {index+1}</strong><button className="b2-btn alt small" type="button" disabled={lines.length===1} onClick={()=>setLines(prev=>prev.filter(x=>x.key!==l.key))}><Trash2 size={13} style={{display:'inline',marginRight:4}}/>Remover</button></div>
       <div className="b2-op-line-fields" style={{marginTop:7}}>
        <PesquisaItemBeta2 items={items} selectedId={l.itemId} onSelect={id=>changeLine(l.key,'itemId',id)} label="Item *" focusOnMount={focusLine===l.key}/>
        <label className="b2-field"><span>Qtd. na nota * {selected?.unidade_medida||''}</span><input type="number" min="0" step="0.001" value={l.documentQty} onChange={e=>changeLine(l.key,'documentQty',e.target.value)}/></label>
        <label className="b2-field"><span>Qtd. física * {selected?.unidade_medida||''}</span><input type="number" min="0" step="0.001" value={l.quantity} onChange={e=>changeLine(l.key,'quantity',e.target.value)}/></label>
        <label className="b2-field"><span>Custo unitário R$</span><input type="number" min="0" step="0.01" value={l.unitCost} onChange={e=>changeLine(l.key,'unitCost',e.target.value)}/></label>
       </div>
       <div className="b2-op-line-summary">
        <span>Diferença nota × físico: <strong className={numeric(l.quantity)!==numeric(l.documentQty)?'b2-pill red':'b2-op-good'}>{(numeric(l.quantity)-numeric(l.documentQty)).toLocaleString('pt-BR',{maximumFractionDigits:3})}</strong></span>
        {mode==='pedido'&&<span>Diferença do pedido: <strong className={diff!==0?'b2-pill red':'b2-op-good'}>{diff>0?'+':''}{diff.toLocaleString('pt-BR',{maximumFractionDigits:3})}</strong></span>}
        <span>Subtotal: <strong className="b2-op-subtotal">{price(numeric(l.quantity)*numeric(l.unitCost))}</strong></span>
       </div>
      </div>;
     })}</div>
     <button className="b2-op-add-line" type="button" onClick={()=>{const next=mkLine();setFocusLine(next.key);setLines(prev=>[...prev,next]);}}><Plus size={17}/> Adicionar outro produto</button>
     <div className="b2-op-totals"><span>{lines.length} linha(s) na nota</span><strong>{price(total)}</strong></div>
     <div className="b2-op-actions"><button className="b2-btn" type="submit" disabled={orderLoading}>Concluir conferência nesta prévia</button><button className="b2-btn alt" type="button" onClick={reset}>Nova nota</button></div>
    </section>
   </form>}
  </>}
  {screen!=='nova'&&<HistoricoComprasBeta2 mode={screen} preview={receipts} openId={openPreviewId}/>}
 </div>;
};
export default RecebimentoBeta2;
