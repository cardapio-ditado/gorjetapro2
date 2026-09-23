import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, History, Plus, Trash2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import './OperacoesBeta2.css';
import PesquisaItemBeta2 from './PesquisaItemBeta2';
import HistoricoPedidosBeta2 from './HistoricoPedidosBeta2';

type Row = {id:string;nome:string;[key:string]:any};
type EmergencyLine = {key:string;itemId:string;quantity:string};
export interface EmergencyPreview {
 id:string;requester:string;sector:string;from:string;to:string;reason:string;
 lines:{item:string;quantity:number;unit:string}[];status:'pendente'|'entregue';created:string;
 kind?:'emergencial'|'noturna';withdrawnBy?:string;occurredAt?:string;
 dispatchedAt?:string;receiptConfirmedAt?:string;receiptConfirmedBy?:string;
}
interface Props{
 requests:EmergencyPreview[];onSave:(req:EmergencyPreview)=>void;
 startOnNightReview?:boolean;
 onDispatch?:(id:string,employeeName:string)=>void;
 onConfirmReceipt?:(id:string,employeeName:string)=>void;
}
const line=():EmergencyLine=>({key:Math.random().toString(36).slice(2),itemId:'',quantity:''});
const q=(raw:string)=>Number(raw.replace(',','.'));
const fmt=(raw:number)=>raw.toLocaleString('pt-BR',{maximumFractionDigits:3});
const limit=10000;
async function read(table:string,cols:string){
 const data:Row[]=[];
 for(let start=0;start<limit;start+=500){
  const {data:page,error}=await supabase.from(table).select(cols).range(start,start+499);
  if(error)throw error;
  data.push(...((page||[]) as Row[]));
  if(!page||page.length<500)break;
 }
 return data;
}
const EmergenciasBeta2:React.FC<Props>=({requests,onSave,startOnNightReview=false,onDispatch,onConfirmReceipt})=>{
 const[kind,setKind]=useState<'emergencial'|'noturna'>('emergencial');
 const isNight=kind==='noturna';
 const[stockList,setStockList]=useState<Row[]>([]);
 const[employees,setEmployees]=useState<Row[]>([]);
 const[items,setItems]=useState<Row[]>([]);
 const[employee,setEmployee]=useState('');
 const[withdrawer,setWithdrawer]=useState('');
 const[occurredAt,setOccurredAt]=useState(()=>{const date=new Date();return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,16);});
 const[department,setDepartment]=useState('');
 const[from,setFrom]=useState('');
 const[to,setTo]=useState('');
 const[reason,setReason]=useState('Reposição emergencial');
 const[lines,setLines]=useState<EmergencyLine[]>([line()]);
 const[focusLine,setFocusLine]=useState('');
 const[balances,setBalances]=useState<Record<string,number>>({});
 const[loading,setLoading]=useState(true);
 const[balanceLoading,setBalanceLoading]=useState(false);
 const[error,setError]=useState('');
 const[notice,setNotice]=useState('');
 const[tab,setTab]=useState<'novo'|'pendentes'|'historico'|'monitoramento'>(startOnNightReview?'monitoramento':'novo');
 const[openPreviewId,setOpenPreviewId]=useState('');
 const[initialNightFilter,setInitialNightFilter]=useState(startOnNightReview);
 useEffect(()=>{
  let active=true;
  const load=async()=>{
   setLoading(true);
   try{
    const [stocks,staff,products]=await Promise.all([
     read('estoques','id,nome,tipo,status'),
     read('colaboradores','id,nome_completo,funcao_personalizada,status'),
     read('itens_estoque','id,nome,codigo,unidade_medida,status')
    ]);
    if(!active)return;
    const availableStocks=stocks.filter(s=>s.status===true);
    const availableEmployees=staff.filter(s=>s.status==='ativo').sort((a,b)=>String(a.nome_completo||'').localeCompare(String(b.nome_completo||''),'pt-BR'));
    setStockList(availableStocks);setEmployees(availableEmployees);
    setItems(products.sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')));
    setFrom(availableStocks.find(s=>s.tipo==='central')?.id||availableStocks[0]?.id||'');
   }catch(ex){if(active)setError(ex instanceof Error?ex.message:'Falha ao carregar estoques e colaboradores.');}
   finally{if(active)setLoading(false);}
  };
  void load();return()=>{active=false;};
 },[]);
 const itemById=useMemo(()=>new Map(items.map(i=>[i.id,i])),[items]);
 const productIds=lines.filter(x=>x.itemId).map(x=>x.itemId).sort().join(',');
 useEffect(()=>{
  let mounted=true;
  const ids=[...new Set(lines.map(x=>x.itemId).filter(Boolean))];
  setBalances({});
  if(isNight||!from||!ids.length){setBalanceLoading(false);return;}
  setBalanceLoading(true);
  void (async()=>{
   try{
    const{data,error:e}=await supabase.from('saldos_estoque')
      .select('item_id,quantidade_atual').eq('estoque_id',from).in('item_id',ids);
    if(e)throw e;
    if(mounted)setBalances(Object.fromEntries((data||[]).map(x=>[x.item_id,Number(x.quantidade_atual)||0])));
   }catch(ex){if(mounted)setError(ex instanceof Error?ex.message:'Não foi possível consultar o saldo na origem.');}
   finally{if(mounted)setBalanceLoading(false);}
  })();
  return()=>{mounted=false;};
 },[from,productIds,isNight]);
 const setLine=(key:string,field:keyof EmergencyLine,value:string)=>
  setLines(prev=>prev.map(x=>x.key===key?{...x,[field]:value}:x));
 const save=(status:'pendente'|'entregue')=>{
  setError('');setNotice('');
  const staff=employees.find(x=>x.id===employee);
  const source=stockList.find(x=>x.id===from),destination=stockList.find(x=>x.id===to);
  if(!staff||!department.trim()){setError('Escolha o funcionário solicitante e informe o setor.');return;}
  if((isNight||status==='entregue')&&!employees.some(e=>e.id===withdrawer)){
   setError('Selecione quem retirou ou entregou a mercadoria na origem.');return;
  }
  if(isNight&&(!occurredAt||!Number.isFinite(new Date(occurredAt).getTime()))){
   setError('Informe a data e hora da retirada já realizada.');return;
  }
  if(isNight&&new Date(occurredAt).getTime()>Date.now()+60_000){
   setError('A data/hora da retirada não pode ser futura, pois a mercadoria já saiu.');return;
  }
  if(!source||!destination||source.id===destination.id){setError('Selecione estoques de origem e destino diferentes.');return;}
  if(!reason.trim()){setError(isNight?'Descreva o motivo da retirada.':'Descreva o motivo da solicitação emergencial.');return;}
  if(!lines.length){setError('Adicione pelo menos um produto.');return;}
  const ids=lines.map(x=>x.itemId);
  if(new Set(ids).size!==ids.length){setError('O mesmo produto foi incluído duas vezes. Some a quantidade em uma única linha.');return;}
  for(let i=0;i<lines.length;i++){
   const current=lines[i],qty=q(current.quantity);
   if(!itemById.has(current.itemId)||!Number.isFinite(qty)||qty<=0){
    setError('Corrija item e quantidade da linha '+(i+1)+'.');return;
   }
   if(!isNight&&status==='entregue'&&qty>(balances[current.itemId]??0)){
    setError('O saldo na origem é insuficiente para entregar imediatamente o item da linha '+(i+1)+'. Registre uma solicitação pendente ou ajuste a quantidade.');return;
   }
  }
  const demoId=Math.random().toString(36).slice(2);
  onSave({
   id:demoId,kind,requester:String(staff.nome_completo),
   ...(isNight?{
    withdrawnBy:String(employees.find(e=>e.id===withdrawer)?.nome_completo||''),
    occurredAt:new Date(occurredAt).toISOString(),
    dispatchedAt:new Date(occurredAt).toISOString()
   }:status==='entregue'?{
    withdrawnBy:String(employees.find(e=>e.id===withdrawer)?.nome_completo||''),dispatchedAt:new Date().toISOString()
   }:{}),
   sector:department.trim(),from:source.nome,to:destination.nome,reason:reason.trim(),
   status:isNight?'entregue':status,created:new Date().toLocaleString('pt-BR'),
   lines:lines.map(x=>({item:itemById.get(x.itemId)?.nome||'Item',quantity:q(x.quantity),unit:String(itemById.get(x.itemId)?.unidade_medida||'un')}))
  });
  setNotice(isNight
   ?'Saída registrada na prévia no horário informado. Aguardando recebimento do destino; nenhum saldo oficial foi alterado.'
   :status==='pendente'
     ?'Pedido criado na prévia. A saída deve ser registrada quando a mercadoria for entregue; nenhum saldo oficial foi alterado.'
     :'Saída imediata registrada na prévia. Aguardando confirmação do destino; nenhum saldo oficial foi alterado.');
  setOpenPreviewId(demoId);
  setInitialNightFilter(false);
  setTab('pendentes');
  setLines([line()]);setReason('Reposição emergencial');
 };
 return <div>
  <p className="b2-eyebrow">Operação · movimentações fora do abastecimento programado</p>
  <h1>Solicitações e retiradas</h1>
  <p className="b2-lead">Um único lugar para solicitar ou registrar mercadorias retiradas: funcionário, origem, destino, motivo e vários produtos no mesmo lançamento.</p>
  <div className="b2-hint">Cadastros originais para consulta. Os lançamentos deste Beta 2 são simulados e não movimentam saldos reais.</div>
  <div className="b2-op-tabs" role="tablist" aria-label="Solicitações e retiradas">
   <button type="button" role="tab" className="b2-op-tab" aria-selected={tab==='novo'} aria-pressed={tab==='novo'} onClick={()=>setTab('novo')}>
    <Plus size={15}/>Novo lançamento</button>
   <button type="button" role="tab" className="b2-op-tab" aria-selected={tab==='pendentes'} aria-pressed={tab==='pendentes'} onClick={()=>{setTab('pendentes');setOpenPreviewId('');setInitialNightFilter(false);}}>
    <History size={15}/>Pendentes</button>
   <button type="button" role="tab" className="b2-op-tab" aria-selected={tab==='historico'} aria-pressed={tab==='historico'} onClick={()=>{setTab('historico');setOpenPreviewId('');setInitialNightFilter(false);}}>
    <History size={15}/>Histórico</button>
   {startOnNightReview&&<button type="button" role="tab" className="b2-op-tab" aria-selected={tab==='monitoramento'} aria-pressed={tab==='monitoramento'} onClick={()=>{setTab('monitoramento');setOpenPreviewId('');setInitialNightFilter(true);}}>
    <History size={15}/>Visão do estoquista</button>}
  </div>
  {notice&&<div className="b2-op-summary" role="status"><CheckCircle2 size={19}/><strong>{notice}</strong></div>}
  {tab==='novo'&&<>
   <section className="b2-card b2-op-kind-card">
    <h2>O que aconteceu?</h2>
    <p className="b2-op-help">É o mesmo lançamento. Se a mercadoria já saiu, informe quem retirou e a data/hora.</p>
    <div className="b2-op-kind-options" role="group" aria-label="Tipo da movimentação">
     <button type="button" className="b2-op-kind-choice" aria-pressed={!isNight} onClick={()=>{setKind('emergencial');setError('');}}>
      <strong>Solicitar mercadoria</strong><small>Preciso de itens para um setor; ainda pode aguardar entrega.</small>
     </button>
     <button type="button" className="b2-op-kind-choice" aria-pressed={isNight} onClick={()=>{setKind('noturna');setError('');}}>
      <strong>Registrar retirada já feita</strong><small>A mercadoria já saiu: registra a saída imediatamente e aguarda confirmação do destino.</small>
     </button>
    </div>
   </section>
   <div className="b2-op-steps"><span className="b2-op-step current">01 · Solicitante</span><span className="b2-op-step current">02 · Origem e destino</span><span className="b2-op-step current">03 · Vários itens</span><span className="b2-op-step current">04 · Confirmar</span></div>
  {loading?<div className="b2-card">Carregando funcionários, estoques e itens reais...</div>:<>
   {error&&<div className="b2-error" role="alert">{error}</div>}
   <section className="b2-card">
    <h2>1 · Funcionário e setor</h2>
    <div className="b2-op-fields">
     <label className="b2-field"><span>Nome do funcionário solicitante *</span><select value={employee} onChange={e=>setEmployee(e.target.value)}><option value="">Escolha o colaborador...</option>{employees.map(e=><option key={e.id} value={e.id}>{e.nome_completo}{e.funcao_personalizada?' · '+e.funcao_personalizada:''}</option>)}</select></label>
     <label className="b2-field"><span>Setor solicitante *</span><input value={department} onChange={e=>setDepartment(e.target.value)} placeholder="Ex.: Bar de drinks, cozinha, bar de cervejas"/></label>
     <label className="b2-field"><span>{isNight?'Funcionário que retirou *':'Quem entregou na origem (obrigatório para saída imediata)'}</span>
      <select value={withdrawer} onChange={e=>setWithdrawer(e.target.value)}><option value="">Escolha o responsável...</option>{employees.map(e=><option key={e.id} value={e.id}>{e.nome_completo}{e.funcao_personalizada?' · '+e.funcao_personalizada:''}</option>)}</select>
     </label>
     {isNight&&<label className="b2-field"><span>Data e hora da retirada *</span><input type="datetime-local" value={occurredAt} onChange={e=>setOccurredAt(e.target.value)}/></label>}
     <label className="b2-field b2-op-wide"><span>{isNight?'Motivo da retirada *':'Motivo da emergência *'}</span><input value={reason} onChange={e=>setReason(e.target.value)} placeholder={isNight?'Ex.: troca de barril às 23h':'Ex.: acabou o gelo na abertura'}/></label>
    </div>
   </section>
   <section className="b2-section b2-card">
    <h2>2 · De onde sai e para onde vai?</h2>
    <div className="b2-op-fields">
     <label className="b2-field"><span>Estoque de origem *</span><select value={from} onChange={e=>{setFrom(e.target.value);if(e.target.value===to)setTo('')}}><option value="">Selecione...</option>{stockList.map(s=><option value={s.id} key={s.id}>{s.nome}</option>)}</select></label>
     <label className="b2-field"><span>Estoque de destino *</span><select value={to} onChange={e=>setTo(e.target.value)}><option value="">Selecione...</option>{stockList.filter(s=>s.id!==from).map(s=><option value={s.id} key={s.id}>{s.nome}</option>)}</select></label>
    </div>
   </section>
   <section className="b2-section b2-card">
    <div className="b2-op-section-title"><h2>3 · {isNight?'Produtos retirados':'Produtos solicitados'}</h2><span className="b2-pill">{lines.length} linha(s)</span></div>
    <p className="b2-op-help">Adicione quantos itens forem necessários à mesma {isNight?'retirada':'solicitação'}. Os funcionários, a origem e o destino valem para todos eles.</p>
    <div className="b2-op-lines">{lines.map((l,index)=>{
     const selected=itemById.get(l.itemId);
     const bal=balances[l.itemId]??0;
     const insufficient=l.itemId&&!balanceLoading&&q(l.quantity)>bal;
     return <div className="b2-op-line b2-op-line-compact" key={l.key}>
      <div className="b2-op-line-head"><strong>Item {index+1}</strong><button className="b2-btn alt small" type="button" disabled={lines.length===1} onClick={()=>setLines(p=>p.filter(x=>x.key!==l.key))}><Trash2 size={13} style={{display:'inline',marginRight:5}}/>Remover</button></div>
      <div className="b2-op-line-fields transfer" style={{marginTop:7}}>
       <PesquisaItemBeta2 items={items} selectedId={l.itemId} onSelect={id=>setLine(l.key,'itemId',id)} label="Produto *" focusOnMount={focusLine===l.key}/>
       <label className="b2-field"><span>Quantidade *</span><input type="number" min="0.001" step="0.001" value={l.quantity} onChange={e=>setLine(l.key,'quantity',e.target.value)}/><small>{selected?.unidade_medida||'Unidade do item'}</small></label>
      </div>
      {selected&&!isNight&&<div className="b2-op-line-summary"><span>Saldo na origem: <strong className={insufficient?'b2-pill red':'b2-op-good'}>{balanceLoading?'Consultando...':fmt(bal)+' '+(selected.unidade_medida||'')}</strong>{insufficient?' · entrega imediata sem saldo suficiente':''}</span></div>}
     </div>;
    })}</div>
    <button className="b2-op-add-line" type="button" onClick={()=>{const next=line();setFocusLine(next.key);setLines(p=>[...p,next]);}}><Plus size={17}/> Adicionar outro item</button>
    <div className="b2-op-totals"><span>{isNight?'Uma única retirada registrada':'Um único pedido emergencial'}</span><strong>{lines.length} linha(s) de produtos</strong></div>
   </section>
   <section className="b2-section b2-card">
    <h2>4 · Conferência e confirmação</h2>
    <p className="b2-op-help">{isNight
     ?'A saída fica registrada uma única vez no horário informado. Quem recebeu no destino deve confirmar; o estoquista somente consulta.'
     :'O pedido pendente não dá baixa. Quando ocorrer a saída, ela será registrada uma vez; o destino confirma o recebimento separadamente.'}</p>
    <div className="b2-op-actions">
     <button className="b2-btn" type="button" onClick={()=>save('pendente')}>{isNight?'Registrar retirada já feita (prévia)':'Registrar pedido emergencial (prévia)'}</button>
     {!isNight&&<button className="b2-btn alt" type="button" disabled={balanceLoading} onClick={()=>save('entregue')}>Registrar saída imediata (prévia)</button>}
    </div>
   </section>
  </>}
  </>}
  {tab!=='novo'&&<HistoricoPedidosBeta2
 mode={tab} preview={requests} openId={openPreviewId}
 onDispatch={onDispatch} onConfirmReceipt={onConfirmReceipt}
 initialNightFilter={tab==='monitoramento'||initialNightFilter} readOnly={startOnNightReview}
/>}


 </div>;
};
export default EmergenciasBeta2;
