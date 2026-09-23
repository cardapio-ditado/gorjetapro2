import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, Eye, History, RefreshCw, Search, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import type { EmergencyPreview } from './EmergenciasBeta2';
import './OperacoesBeta2.css';

type Mode = 'pendentes'|'historico'|'monitoramento';
type Request = {
 id:string;numero_requisicao:string|null;data_requisicao:string;
 funcionario_nome:string;setor:string;estoque_origem_id:string;
 estoque_destino_id:string;status:string;observacoes:string|null;
 data_conclusao:string|null;data_aprovacao:string|null;
};
type Item = {
 id:string;item_id:string;quantidade_solicitada:number;
 quantidade_entregue:number|null;quantidade_aprovada:number|null;
 observacao:string|null;itens_estoque:{nome:string;unidade_medida:string}|null;
};
interface Props {
 mode:Mode;preview:EmergencyPreview[];openId?:string;initialNightFilter?:boolean;
 readOnly?:boolean;
 onDispatch?:(id:string,employeeName:string)=>void;
 onConfirmReceipt?:(id:string,employeeName:string)=>void;
}
const fmt=(n:number)=>Number(n||0).toLocaleString('pt-BR',{maximumFractionDigits:3});
const when=(v:string|null|undefined)=>v?new Date(v).toLocaleString('pt-BR'):'—';
const label=(status:string)=>({
 pendente:'A entregar',aprovado:'A entregar',concluido:'Concluído',
 rejeitado:'Rejeitado',entregue:'Entrega simulada'
} as Record<string,string>)[status]||status;
const HistoricoPedidosBeta2:React.FC<Props>=({
 mode,preview,openId,initialNightFilter=false,readOnly=false,onDispatch,onConfirmReceipt
})=>{
 const [records,setRecords]=useState<Request[]>([]);
 const [stocks,setStocks]=useState<Record<string,string>>({});
 const [employees,setEmployees]=useState<{id:string;nome_completo:string}[]>([]);
 const [receivingEmployee,setReceivingEmployee]=useState('');
 const [dispatchingEmployee,setDispatchingEmployee]=useState('');
 const [formError,setFormError]=useState('');
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const [term,setTerm]=useState('');
 const[typeFilter,setTypeFilter]=useState<'todos'|'emergencial'|'noturna'>(initialNightFilter?'noturna':'todos');
 const [selected,setSelected]=useState<{kind:'real'|'demo';id:string}|null>(null);
 const [detail,setDetail]=useState<Item[]>([]);
 const [detailBusy,setDetailBusy]=useState(false);
 const [detailError,setDetailError]=useState('');
 const [refreshKey,setRefreshKey]=useState(0);
 const reload=useCallback(async()=>{
  setBusy(true);setError('');
  try{
   const statuses=mode==='pendentes'?['pendente','aprovado']:mode==='historico'?['concluido','rejeitado']:['pendente','aprovado','concluido','rejeitado'];
   const [req,loc,people]=await Promise.all([
    supabase.from('requisicoes_internas')
      .select('id,numero_requisicao,data_requisicao,funcionario_nome,setor,estoque_origem_id,estoque_destino_id,status,observacoes,data_conclusao,data_aprovacao')
      .in('status',statuses).order('data_requisicao',{ascending:mode==='pendentes'}).limit(200),
    supabase.from('estoques').select('id,nome'),
    supabase.from('colaboradores').select('id,nome_completo,status').eq('status','ativo').order('nome_completo')
   ]);
   if(req.error)throw req.error;
   if(loc.error)throw loc.error;
   if(people.error&&!readOnly)throw people.error;
   setRecords((req.data||[]) as Request[]);
   setStocks(Object.fromEntries((loc.data||[]).map(s=>[s.id,s.nome])));
   setEmployees((people.data||[]).map(person=>({id:person.id,nome_completo:person.nome_completo})));
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível consultar pedidos existentes.');setRecords([]);}
  finally{setBusy(false);}
 },[mode,readOnly]);
 useEffect(()=>{void reload();},[reload,refreshKey]);
 useEffect(()=>{setTerm('');setSelected(null);setDetail([]);setDetailError('');setReceivingEmployee('');setDispatchingEmployee('');setFormError('');},[mode]);
 useEffect(()=>{
  if(!openId)return;
  if(preview.some(p=>p.id===openId))setSelected({kind:'demo',id:openId});
 },[openId,preview]);
 useEffect(()=>{
  if(!selected||selected.kind!=='real'){setDetail([]);setDetailError('');return;}
  let alive=true;
  setDetailBusy(true);setDetail([]);setDetailError('');
  void (async()=>{
   const {data,error:e}=await supabase.from('requisicoes_internas_itens')
     .select('id,item_id,quantidade_solicitada,quantidade_entregue,quantidade_aprovada,observacao,itens_estoque(nome,unidade_medida)')
     .eq('requisicao_id',selected.id);
   if(!alive)return;
   if(e)setDetailError(e.message);
   else setDetail((data||[]) as unknown as Item[]);
   setDetailBusy(false);
  })();
  return()=>{alive=false;};
 },[selected?.id,selected?.kind]);
 const match=(text:string)=>text.toLocaleLowerCase('pt-BR').includes(term.toLocaleLowerCase('pt-BR').trim());
 const realShown=useMemo(()=>typeFilter==='noturna'?[]:records.filter(r=>match([r.numero_requisicao,r.funcionario_nome,r.setor,stocks[r.estoque_origem_id],stocks[r.estoque_destino_id]].join(' '))),
 [records,stocks,term,typeFilter]);
 const demoShown=useMemo(()=>preview.filter(r=>(mode==='monitoramento'
   ||(mode==='pendentes'?!r.receiptConfirmedAt:r.status==='entregue'&&Boolean(r.receiptConfirmedAt)))
  &&(typeFilter==='todos'||(r.kind||'emergencial')===typeFilter)
  &&match([r.id,r.requester,r.withdrawnBy,r.sector,r.from,r.to,r.reason,...r.lines.map(x=>x.item)].join(' '))),
 [preview,mode,term,typeFilter]);
 const selectedReal=selected?.kind==='real'?records.find(r=>r.id===selected.id):undefined;
 const selectedDemo=selected?.kind==='demo'?preview.find(r=>r.id===selected.id):undefined;
 const realStatus=selectedReal?.status||'';
 const movementStatus=(req:EmergencyPreview)=>{
  if(req.status==='pendente')return 'Aguardando saída';
  return req.receiptConfirmedAt?'Recebimento confirmado':'Saída registrada · aguardando destino';
 };
 const dispatch=()=>{
  setFormError('');
  if(!selectedDemo||selectedDemo.status!=='pendente'||!onDispatch)return;
  const person=employees.find(e=>e.id===dispatchingEmployee);
  if(!person){setFormError('Informe quem está entregando ou retirando a mercadoria na origem.');return;}
  onDispatch(selectedDemo.id,person.nome_completo);
  setDispatchingEmployee('');
 };
 const confirmReceipt=()=>{
  setFormError('');
  if(!selectedDemo||selectedDemo.status!=='entregue'||selectedDemo.receiptConfirmedAt||!onConfirmReceipt)return;
  const person=employees.find(e=>e.id===receivingEmployee);
  if(!person){setFormError('Informe o funcionário que recebeu a mercadoria no destino.');return;}
  if(person.nome_completo===selectedDemo.withdrawnBy){
   setFormError('Quem retirou na origem não pode confirmar o próprio recebimento no destino. Selecione o responsável que recebeu no setor.');
   return;
  }
  onConfirmReceipt(selectedDemo.id,person.nome_completo);
  setReceivingEmployee('');
 };
 return <div className="b2-history">
  <div className="b2-op-section-title"><div>
   <p className="b2-eyebrow">Solicitações e retiradas · consulta unificada</p>
   <h2>{mode==='monitoramento'?'Movimentações fora do expediente':mode==='pendentes'?'Pendentes de saída ou recebimento':'Histórico de movimentações'}</h2>
  </div><button type="button" className="b2-btn alt small" onClick={()=>setRefreshKey(k=>k+1)} disabled={busy}>
   <RefreshCw size={14}/>Atualizar</button></div>
  <p className="b2-lead">{mode==='monitoramento'
    ?'Visão do estoquista: veja quem retirou, o que saiu e se o responsável pelo destino confirmou o recebimento. Nenhuma aprovação ou segunda baixa aqui.'
    :mode==='pendentes'
     ?'Pedidos aguardando saída e mercadorias que já saíram, mas ainda não tiveram o recebimento confirmado pelo destino.'
     :'Saídas com recebimento confirmado e solicitações anteriores em um único histórico.'}</p>
  <div className="b2-hint">{readOnly
    ?'VISUALIZAÇÃO DO ESTOQUISTA · somente consulta. Confirmar recebimento é responsabilidade de quem recebeu no setor, não do estoque central.'
    :'Registros OFICIAIS do módulo antigo: somente leitura. TESTES do Beta 2: saída e confirmação simuladas, sem gravar saldo nem movimentação oficial.'}</div>
  <div className="b2-chips" role="group" aria-label="Filtrar tipo de movimentação">
   {([
    ['todos','Todos'],
    ['emergencial','Pedidos emergenciais'],
    ['noturna','Retiradas já feitas']
   ] as const).map(([v,name])=><button type="button" className="b2-chip" aria-pressed={typeFilter===v} key={v}
    onClick={()=>{setTypeFilter(v);setSelected(null);}}>{name}</button>)}
  </div>
  <label className="b2-history-search"><Search size={17}/><input value={term} onChange={e=>setTerm(e.target.value)}
    placeholder="Buscar por número, funcionário, setor ou estoque..." aria-label="Pesquisar pedidos"/></label>
  {error&&<div className="b2-error" role="alert">{error}</div>}
  {busy&&<div className="b2-hint">Carregando pedidos originais...</div>}
  <div className="b2-history-layout">
   <section className="b2-card b2-history-list" aria-label="Lista de pedidos">
    <div className="b2-topline"><h2>Registros</h2><span className="b2-pill">{realShown.length+demoShown.length}{busy?' · atualizando':''}</span></div>
    {!busy&&realShown.length===0&&demoShown.length===0&&<div className="b2-hint">Nenhum pedido encontrado para este filtro.</div>}
    {demoShown.map(r=><button type="button" key={'demo-'+r.id}
      className={'b2-history-row'+(selected?.kind==='demo'&&selected.id===r.id?' selected':'')}
      onClick={()=>setSelected({kind:'demo',id:r.id})}>
      <span className="b2-history-main"><strong>{r.kind==='noturna'?'Retirada já feita':'Pedido emergencial'} · {r.requester} · {r.sector}</strong><small>{r.from} → {r.to}</small>
      <small>{r.occurredAt?when(r.occurredAt):r.created} · {r.lines.length} item(ns)</small></span>
      <span className="b2-history-tags"><span className="b2-pill">TESTE</span><span className={'b2-pill '+(r.receiptConfirmedAt?'green':r.status==='entregue'?'red':'')}>{movementStatus(r)}</span></span>
      <Eye size={16} className="b2-history-eye"/>
    </button>)}
    {realShown.map(r=><button type="button" key={r.id}
      className={'b2-history-row'+(selected?.kind==='real'&&selected.id===r.id?' selected':'')}
      onClick={()=>setSelected({kind:'real',id:r.id})}>
      <span className="b2-history-main">
       <strong>Pedido {r.numero_requisicao||r.id.slice(0,8)} · {r.funcionario_nome||'Sem identificação'}</strong>
       <small>{stocks[r.estoque_origem_id]||'Origem não localizada'} → {stocks[r.estoque_destino_id]||'Destino não localizado'}</small>
       <small>{when(r.data_requisicao)} · {r.setor||'Setor não informado'}</small>
      </span>
      <span className="b2-history-tags"><span className="b2-pill green">OFICIAL</span><span className={'b2-pill '+(r.status==='concluido'?'green':r.status==='rejeitado'?'red':'')}>{label(r.status)}</span></span>
      <Eye size={16} className="b2-history-eye"/>
    </button>)}
    {records.length>=200&&<p className="b2-op-small">Exibindo até 200 pedidos oficiais por consulta. Utilize a busca no módulo original para consultar períodos mais antigos.</p>}
   </section>
   <section className="b2-card b2-history-details" aria-label="Detalhes do pedido">
    {selectedReal?<><div className="b2-topline"><div><p className="b2-eyebrow">Pedido oficial · somente leitura</p>
       <h2>Pedido {selectedReal.numero_requisicao||selectedReal.id.slice(0,8)}</h2></div>
       <button className="b2-btn alt small" type="button" onClick={()=>setSelected(null)}><X size={15}/>Fechar</button>
     </div>
     <span className={'b2-pill '+(realStatus==='concluido'?'green':realStatus==='rejeitado'?'red':'')}>{label(realStatus)}</span>
     <div className="b2-history-meta">
      {[
       ['Solicitante',selectedReal.funcionario_nome],['Setor',selectedReal.setor],
       ['Data do pedido',when(selectedReal.data_requisicao)],
       ['Estoque de origem',stocks[selectedReal.estoque_origem_id]],
       ['Estoque de destino',stocks[selectedReal.estoque_destino_id]],
       ['Data da aprovação',when(selectedReal.data_aprovacao)],
       ['Data da conclusão',when(selectedReal.data_conclusao)]
      ].map(([k,v])=><div key={k}><small>{k}</small><strong>{v||'—'}</strong></div>)}
     </div>
     {selectedReal.observacoes&&<div className="b2-hint"><strong>Observações</strong><p>{selectedReal.observacoes}</p></div>}
     <h3 className="b2-history-items-title">Produtos solicitados</h3>
     {detailBusy?<div className="b2-hint">Carregando itens do pedido...</div>:detailError
      ?<div className="b2-error">Não foi possível abrir os itens: {detailError}</div>
      :detail.length===0?<div className="b2-hint">Nenhum item registrado neste pedido.</div>:
       <div className="b2-table-scroll"><table className="b2-history-table"><thead><tr><th>Produto</th><th>Solicitado</th><th>Entregue</th></tr></thead>
        <tbody>{detail.map(i=><tr key={i.id}><td><strong>{i.itens_estoque?.nome||'Item '+i.item_id.slice(0,8)}</strong><small>{i.observacao||''}</small></td>
         <td>{fmt(i.quantidade_solicitada)} {i.itens_estoque?.unidade_medida||''}</td>
         <td>{i.quantidade_entregue==null?'—':fmt(i.quantidade_entregue)+' '+(i.itens_estoque?.unidade_medida||'')}</td></tr>)}</tbody>
       </table></div>}
     <p className="b2-op-small">Dados do módulo original. O status “concluído” não comprova, por si só, confirmação independente pelo funcionário do destino. Esta tela não aprova, entrega nem altera quantidades.</p>
    </>:selectedDemo?<><div className="b2-topline"><div><p className="b2-eyebrow">Pedido de teste · não salvo no banco</p>
      <h2>{selectedDemo.kind==='noturna'?'Retirada já realizada':'Pedido emergencial'}</h2></div><button className="b2-btn alt small" type="button" onClick={()=>setSelected(null)}><X size={15}/>Fechar</button></div>
     <span className={'b2-pill '+(selectedDemo.receiptConfirmedAt?'green':'')}>TESTE · {movementStatus(selectedDemo)}</span>
     <div className="b2-history-meta">
      {[['Solicitante',selectedDemo.requester],
       ['Responsável pela saída',selectedDemo.withdrawnBy||'—'],
       ['Saída registrada em',when(selectedDemo.dispatchedAt||selectedDemo.occurredAt)],
       ['Recebimento no destino',selectedDemo.receiptConfirmedAt?'CONFIRMADO':'SEM CONFIRMAÇÃO'],
       ['Confirmado por',selectedDemo.receiptConfirmedBy||'—'],
       ['Confirmado em',when(selectedDemo.receiptConfirmedAt)],
       ['Setor',selectedDemo.sector],['Registro criado',selectedDemo.created],
       ['Estoque de origem',selectedDemo.from],['Estoque de destino',selectedDemo.to],
       ['Motivo',selectedDemo.reason]]
       .map(([k,v])=><div key={k}><small>{k}</small><strong>{v||'—'}</strong></div>)}
     </div>
     <h3 className="b2-history-items-title">{selectedDemo.kind==='noturna'?'Produtos retirados':'Produtos solicitados'}</h3>
     <div className="b2-table-scroll"><table className="b2-history-table"><thead><tr><th>Produto</th><th>{selectedDemo.kind==='noturna'?'Retirado':'Solicitado'}</th><th>Status</th></tr></thead>
      <tbody>{selectedDemo.lines.map((l,i)=><tr key={i}><td><strong>{l.item}</strong></td><td>{fmt(l.quantity)} {l.unit}</td>
       <td>{movementStatus(selectedDemo)}</td></tr>)}</tbody>
     </table></div>
     {selectedDemo.kind==='noturna'&&selectedDemo.status==='pendente'&&onReconcile&&
       <button type="button" className="b2-btn" onClick={()=>onReconcile(selectedDemo.id)}>✓ Marcar retirada como conferida</button>}
     <div className="b2-hint">{selectedDemo.kind==='noturna'?'Conferir esta retirada não gera uma segunda baixa. ':''}Este registro desaparece ao reiniciar os testes do Beta 2.</div>
    </>:<div className="b2-history-placeholder"><History size={32}/><h2>Abra um pedido</h2>
     <p>Selecione um pedido na lista para ver solicitante, origem, destino, data, status e todos os itens.</p>
     <ArrowRight size={18}/></div>}
   </section>
  </div>
 </div>;
};
export default HistoricoPedidosBeta2;
