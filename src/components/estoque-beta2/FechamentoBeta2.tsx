import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, RefreshCw, Search } from 'lucide-react';
import {
 type FechamentoPreview,type ItemDoSetor,type FrequenciaManual,
 useControleZigBeta2,fmt3,dataBR,diaOperacional,diaAuditoria,dataSeguinte,dataAnterior,cuiabaDate,keyOf
} from './FechamentoDadosBeta2';
import './OperacoesBeta2.css';
import './FechamentoBeta2.css';

type Mode='politica'|'fechamento'|'reposicao';
interface Props{
 mode:Mode;dados:ReturnType<typeof useControleZigBeta2>;
 fechamentos:FechamentoPreview[];
 onSave:(close:FechamentoPreview)=>void;
 go:(screen:'politica'|'fechamento'|'reposicao')=>void;
}
type QuantidadeDigitada={soltos:string;fechados:string};
const number=(v:string)=>Number(v.replace(',','.'));
const labels:{[k:string]:string}={zig:'Baixa Zig',diario:'Contagem diária',periodico:'Conferência periódica'};
const tone:{[k:string]:string}={zig:'green',diario:'',periodico:'red'};
const formatDate=(s:string)=>s?dataBR(s):'—';

const FechamentoBeta2:React.FC<Props>=({mode,dados,fechamentos,onSave,go})=>{
 const[stockId,setStockId]=useState('');
 const[date,setDate]=useState(mode==='reposicao'?dataAnterior(cuiabaDate()):diaOperacional());
 const[manager,setManager]=useState('');
 const[values,setValues]=useState<Record<string,QuantidadeDigitada>>({});
 const[extraAudit,setExtraAudit]=useState(false);
 const[filter,setFilter]=useState('');
 const[onlyProblems,setOnlyProblems]=useState(false);
 const[notice,setNotice]=useState('');
 const[error,setError]=useState('');
 useEffect(()=>{
  if(!stockId&&dados.setores.length)setStockId(mode==='reposicao'?'todos':dados.setores[0].id);
  if(stockId!=='todos'&&stockId&&!dados.setores.some(s=>s.id===stockId))setStockId(dados.setores[0]?.id||'');
 },[dados.setores,stockId,mode]);
 const estoque=dados.setores.find(s=>s.id===stockId);
 const rows=useMemo(()=>dados.linhas.filter(x=>mode==='reposicao'&&stockId==='todos'||x.estoque_id===stockId),[dados.linhas,stockId,mode]);
 const daily=useMemo(()=>rows.filter(x=>x.controleEfetivo==='diario'),[rows]);
 const automatic=useMemo(()=>rows.filter(x=>x.controleEfetivo==='zig'),[rows]);
 const periodic=useMemo(()=>rows.filter(x=>x.controleEfetivo==='periodico'),[rows]);
 const previous=fechamentos.find(f=>f.estoqueId===stockId&&f.dataOperacional===date);
 const audit=diaAuditoria(date)||extraAudit;
 const required=useMemo(()=>audit?rows:daily,[audit,rows]);
 const visible=useMemo(()=>required.filter(x=>
  !filter||[x.item.nome,x.item.codigo,x.item.categoria].join(' ').toLocaleLowerCase('pt-BR').includes(filter.toLocaleLowerCase('pt-BR'))
 ),[required,filter]);
 useEffect(()=>{
  const found=fechamentos.find(f=>f.estoqueId===stockId&&f.dataOperacional===date);
  setValues(Object.fromEntries(Object.entries(found?.quantidades||{}).map(([k,v])=>[k,{soltos:String(v),fechados:''}])));
  setManager(dados.colaboradores.find(e=>e.nome_completo===found?.responsavel)?.id||'');
  setExtraAudit(found?.auditoria||false);
  setNotice('');setError('');setFilter('');
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[stockId,date]);
 const total=(r:ItemDoSetor)=>{
  const v=values[r.item_id];if(!v)return null;
  const conf=dados.embalagens[r.item_id];
  const factor=Number(conf?.fator_fechado||0);
  if(v.soltos.trim()===''&&v.fechados.trim()==='')return null;
  const loose=v.soltos.trim()===''?0:number(v.soltos);
  const closed=v.fechados.trim()===''?0:number(v.fechados);
  if(!Number.isFinite(loose)||!Number.isFinite(closed)||loose<0||closed<0||
   (v.fechados.trim()!==''&&factor<=0))return NaN;
  return loose+closed*factor;
 };
 const countDone=required.filter(r=>total(r)!==null&&Number.isFinite(total(r))).length;
 const period=fechamentos.filter(f=>f.dataOperacional===date);
 const sync=useMemo(()=>{
  const min=new Date(dataSeguinte(date)+'T06:00:00-04:00').getTime();
  return dados.logs.find(x=>x.dtinicio<=date&&x.dtfim>=date&&Boolean(x.finalizado_em)&&
   new Date(x.finalizado_em!).getTime()>=min);
 },[dados.logs,date]);
 const synced=sync?.status==='sucesso'&&Number(sync.total_nao_mapeados||0)===0;
 const sent=()=>{
  setError('');setNotice('');
  if(!estoque){setError('Selecione um setor.');return;}
  const employee=dados.colaboradores.find(e=>e.id===manager);
  if(!employee){setError('Escolha o gerente responsável pelo fechamento.');return;}
  if(!required.length){setError('Não existem itens configurados para este fechamento.');return;}
  const quantities:Record<string,number>={},baseline:Record<string,number>={};
  for(const row of required){
   const qty=total(row);
   if(qty===null||!Number.isFinite(qty)){setError('Preencha uma quantidade válida para '+row.item.nome+'.');return;}
   quantities[row.item_id]=qty;
   baseline[row.item_id]=row.saldo;
  }
  const zero=required.filter(x=>quantities[x.item_id]===0&&x.saldo>0);
  if(zero.length&&!window.confirm('Você informou ZERO para '+zero.length+' item(ns) com saldo no sistema. Confirmar o físico contado?'))return;
  const snapshot:FechamentoPreview={
   id:previous?.id||Math.random().toString(36).slice(2),
   estoqueId:stockId,estoqueNome:estoque.nome,dataOperacional:date,
   responsavel:employee.nome_completo,auditoria:audit,
   criadoEm:new Date().toISOString(),quantidades:quantities,saldosNoFechamento:baseline
  };
  onSave(snapshot);
  setNotice((previous?'Fechamento atualizado':'Fechamento registrado')+' nesta prévia. '+(
   audit?'Contagem geral guardada para verificar diferenças após a Zig.':'Consumos sem Zig prontos para simulação de reposição.'
  ));
 };
 const input=(r:ItemDoSetor)=>{
  const v=values[r.item_id]||{soltos:'',fechados:''};
  const conf=dados.embalagens[r.item_id];
  const factor=Number(conf?.fator_fechado||0);
  const both=Boolean(conf?.rotulo_fechado&&factor>0);
  const result=total(r);
  return <div className="b2-close-row" key={r.item_id}>
   <div className="b2-close-name"><strong>{r.item.nome}</strong>
    <small>{r.item.categoria||'Sem categoria'} · {r.item.unidade_medida||'un.'}</small>
    {conf?.dica&&<small className="b2-close-tip">{conf.dica}</small>}
    {audit&&<span className={'b2-pill '+tone[r.controleEfetivo]}>{labels[r.controleEfetivo]}</span>}
   </div>
   <div className="b2-close-count">
    {both&&<label className="b2-field"><span>{conf?.rotulo_fechado||'Fechados'} · × {fmt3(factor)}</span>
     <input aria-label={'Embalagens fechadas de '+r.item.nome} inputMode="decimal" type="number" min="0" step="any"
      value={v.fechados} placeholder="0" onChange={e=>setValues(p=>({...p,[r.item_id]:{...v,fechados:e.target.value}}))}/>
    </label>}
    <label className="b2-field"><span>{conf?.rotulo_solto||r.item.unidade_medida||'Quantidade física'} *</span>
     <input aria-label={'Quantidade física de '+r.item.nome} inputMode="decimal" type="number" min="0" step={conf?.permite_fracao?'0.001':'any'}
      value={v.soltos} placeholder="Quanto restou?" onChange={e=>setValues(p=>({...p,[r.item_id]:{...v,soltos:e.target.value}}))}/>
    </label>
    {both&&<span className="b2-pill">{result!==null&&Number.isFinite(result)?fmt3(result)+' '+(r.item.unidade_medida||''): 'Total físico'}</span>}
   </div>
  </div>;
 };
 if(dados.loading)return <div className="b2-card">Consultando itens, estoques, níveis, fichas e mapeamentos Zig oficiais...</div>;
 if(dados.error)return <div className="b2-error">Não foi possível montar o fluxo sem os dados reais: {dados.error}
  <button type="button" className="b2-btn alt small" onClick={dados.refresh}>Tentar novamente</button></div>;
 return <div className="b2-close">
  <p className="b2-eyebrow">ESTOQUE BETA 2 · FECHAMENTO INTEGRADO À ZIG</p>
  <h1>{mode==='politica'?'Política de controle dos itens':mode==='fechamento'?'Fechamento do setor':'Reposição para o dia seguinte'}</h1>
  <p className="b2-lead">{mode==='politica'
   ?'O mapeamento Zig do estoque de origem define o que baixa pela venda. O gestor escolhe a frequência de contagem apenas do que não tem baixa Zig.'
   :mode==='fechamento'?'O gerente conta os itens sem Zig todos os dias. Segunda, quinta e domingo: todos os itens, somente para apurar divergências.'
   :'Após a baixa Zig das 6h, combinar o saldo automático com as quantidades físicas informadas pelo gerente. O estoquista recebe uma sugestão, sem contar os setores de novo.'}</p>
  <div className="b2-hint"><strong>PRÉVIA OPERACIONAL.</strong> Lê o cadastro e os saldos reais, mas o fechamento, a política revisada e a reposição desta tela ficam somente nesta sessão. Não processa Zig, não cria consumo, não ajusta saldo e não transfere estoque.</div>
  <div className="b2-close-selector">
   <label className="b2-field"><span>Setor cadastrado</span><select value={stockId} onChange={e=>setStockId(e.target.value)}>
    {mode==='reposicao'&&<option value="todos">Todos os setores · lista consolidada</option>}
    {dados.setores.map(e=><option key={e.id} value={e.id}>{e.nome}</option>)}
   </select></label>
   <label className="b2-field"><span>Dia da operação (Cuiabá)</span><input type="date" value={date} max={diaOperacional()} onChange={e=>{if(e.target.value)setDate(e.target.value);}}/></label>
   <button type="button" className="b2-btn alt" onClick={dados.refresh}><RefreshCw size={14}/> Atualizar Zig e saldos</button>
  </div>
  {estoque?.nome==='Bar'&&<p className="b2-op-small">O cadastro atual tem um único estoque “Bar”; Drinks e Cerveja/Chopp só poderão ser contados separadamente após vincular os itens aos respectivos blocos físicos. Não distribuí saldos por balcão artificialmente.</p>}
  <div className="b2-close-metrics">
   <div className="b2-card"><small>Baixa pela Zig</small><strong>{automatic.length}</strong><span>Itens cobertos no setor</span></div>
   <div className="b2-card"><small>Contar todo fechamento</small><strong>{daily.length}</strong><span>Sem Zig, consumo pelo físico</span></div>
   <div className="b2-card"><small>Somente contagem periódica</small><strong>{periodic.length}</strong><span>Consumo por retirada / auditoria</span></div>
   <div className="b2-card"><small>Contagem geral</small><strong>{diaAuditoria(date)?'SIM':'NÃO'}</strong><span>Segunda · quinta · domingo</span></div>
  </div>

  {mode==='politica'&&<>
   <div className="b2-op-section-title"><h2>Revisão por item e estoque</h2><span className="b2-pill">ORIGEM: MAPEAMENTO ZIG</span></div>
   <p className="b2-op-help">“Baixa Zig” só aparece se houver vínculo com item ou ficha técnica, ingredientes habilitados e estoque de origem correto. Item mapeado não pode receber baixa por contagem também.</p>
   <label className="b2-history-search"><Search size={16}/><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Buscar item ou código"/></label>
   <label className="b2-close-check"><input type="checkbox" checked={onlyProblems} onChange={e=>setOnlyProblems(e.target.checked)}/> Mostrar somente divergências entre cadastro antigo e Zig</label>
   <div className="b2-close-policy">
    {rows.filter(r=>(!filter||[r.item.nome,r.item.codigo].join(' ').toLocaleLowerCase('pt-BR').includes(filter.toLocaleLowerCase('pt-BR')))
      &&(!onlyProblems||(r.mapeadoZig&&r.controle==='contagem')||(!r.mapeadoZig&&r.controle==='venda'))).map(r=><div key={r.item_id} className="b2-close-policy-row">
     <div><strong>{r.item.nome}</strong><small>{r.item.categoria||'Sem categoria'} · cadastro anterior: {r.controle==='venda'?'Venda':'Contagem'}</small>
      {((r.mapeadoZig&&r.controle==='contagem')||(!r.mapeadoZig&&r.controle==='venda'))&&
       <span className="b2-pill red">Revisar conflito</span>}</div>
     <span className={'b2-pill '+tone[r.controleEfetivo]}>{labels[r.controleEfetivo]}</span>
     {r.mapeadoZig
      ?<small className="b2-close-locked">🔒 Zig vinculada. Contar apenas na auditoria; não gerar outra baixa.</small>
      :<label className="b2-field"><span>Frequência sem Zig · prévia</span>
        <select value={r.controleEfetivo} onChange={e=>dados.setFrequencia(stockId,r.item_id,e.target.value as FrequenciaManual)}>
         <option value="diario">Contar todo fechamento</option><option value="periodico">Somente conferência periódica</option>
        </select></label>}
    </div>)}
    {rows.length===0&&<div className="b2-hint">Este setor ainda não possui itens em “itens_estoque_niveis”.</div>}
   </div>
   <div className="b2-close-actions"><button className="b2-btn" onClick={()=>go('fechamento')}>Abrir fechamento noturno <ArrowRight size={14}/></button></div>
  </>}

  {mode==='fechamento'&&<>
   <div className="b2-close-status">
    <span className={'b2-pill '+(audit?'green':'')}>{audit?'CONTAGEM GERAL · auditoria':'FECHAMENTO DIÁRIO · somente sem Zig'}</span>
    <span className="b2-pill">{countDone}/{required.length} informados</span>
    {previous&&<span className="b2-pill green">Fechamento salvo nesta prévia</span>}
   </div>
   <div className="b2-card"><label className="b2-field"><span>Gerente responsável *</span><select value={manager} onChange={e=>setManager(e.target.value)}>
    <option value="">Selecione...</option>{dados.colaboradores.map(x=><option key={x.id} value={x.id}>{x.nome_completo}</option>)}
   </select></label>
   {!diaAuditoria(date)&&<label className="b2-close-check"><input type="checkbox" checked={extraAudit} onChange={e=>setExtraAudit(e.target.checked)}/>
     Incluir contagem geral extra neste dia (somente auditoria)</label>}
   <p className="b2-op-help">{audit?'Conte todos os itens apenas uma vez; os que a Zig baixa serão comparados depois do processamento das 6h.':'A lista contém apenas itens sem baixa Zig configurados para contagem diária. Não conte novamente os produtos que a Zig baixará.'}</p>
   </div>
   <label className="b2-history-search"><Search size={16}/><input value={filter} onChange={e=>setFilter(e.target.value)} placeholder="Localizar produto na lista de contagem"/></label>
   <div className="b2-close-list">{visible.map(input)}
    {required.length===0&&<div className="b2-hint">Não há itens elegíveis neste fechamento. Revise a política de controle.</div>}
    {required.length>0&&!visible.length&&<div className="b2-hint">Nenhum produto corresponde à pesquisa.</div>}
   </div>
   {error&&<div className="b2-error" role="alert">{error}</div>}
   {notice&&<div className="b2-success" role="status"><CheckCircle2 size={16}/> {notice}</div>}
   <div className="b2-close-footer"><span>{countDone} de {required.length} itens contados · {formatDate(date)}</span>
    <button type="button" className="b2-btn" disabled={!required.length||countDone!==required.length} onClick={sent}>Enviar fechamento (prévia)</button>
   </div>
   <div className="b2-close-actions"><button type="button" className="b2-btn alt" onClick={()=>go('reposicao')}>Consultar sugestão de reposição <ArrowRight size={14}/></button></div>
  </>}

  {mode==='reposicao'&&<>
   <section className="b2-card">
    <h2>Processamento Zig das 6h</h2>
    <div className="b2-close-status"><span className={'b2-pill '+(synced?'green':'red')}>{synced?'PROCESSADA · SEM PENDÊNCIAS':'AINDA NÃO VALIDADA'}</span>
     <span className="b2-pill">Operação {formatDate(date)} → reposição {formatDate(dataSeguinte(date))}</span></div>
    <p className="b2-op-help">{sync?
      'Execução para este dia: '+sync.status+' · produtos sem mapeamento: '+Number(sync.total_nao_mapeados||0)+' · finalizada em '+new Date(sync.finalizado_em!).toLocaleString('pt-BR')+'.'
      :'Não há execução concluída APÓS as 6h de Cuiabá do dia seguinte para esta data de venda. A Zig permanece no agendamento oficial; não rodei processamento por esta tela.'}</p>
    {!synced&&<div className="b2-error"><AlertTriangle size={16}/> Lista apenas provisória. Não liberar automaticamente a reposição enquanto a Zig não processar corretamente, inclusive produtos sem mapeamento.</div>}
   </section>
   <div className="b2-close-received">
    {dados.setores.map(st=>{
     const f=period.find(p=>p.estoqueId===st.id);
     const hasDaily=dados.linhas.some(l=>l.estoque_id===st.id&&l.controleEfetivo==='diario');
     return <span key={st.id} className={'b2-pill '+(!hasDaily||f?'green':'red')}>{st.nome}: {f?'fechamento recebido':hasDaily?'falta fechamento':'sem contagem diária'}</span>;
    })}
   </div>
   {dados.setores.filter(st=>(stockId==='todos'||stockId===st.id)
    &&dados.linhas.some(l=>l.estoque_id===st.id&&l.controleEfetivo==='diario')
    &&!period.some(f=>f.estoqueId===st.id)).map(st=>
    <div className="b2-error" key={st.id}>Falta o fechamento de {st.nome} para {formatDate(date)}. Esta lista NÃO está pronta.</div>)}
   {audit&&!previous?.auditoria&&<div className="b2-hint">Há contagem geral programada para este dia; a auditoria ainda não foi enviada nesta prévia.</div>}
   <div className="b2-op-section-title"><h2>Sugestão de separação · {estoque?.nome||'Todos os setores'}</h2>
    <span className="b2-pill">{rows.length} itens configurados</span></div>
   <div className="b2-table-scroll"><table className="b2-close-table"><thead><tr><th>Setor</th><th>Produto</th><th>Como baixa</th><th>Saldo para cálculo</th><th>Nível alvo</th><th>Separar</th><th>Central</th></tr></thead>
    <tbody>{rows.map(row=>{
     const closure=period.find(f=>f.estoqueId===row.estoque_id);
     const closed=closure?.quantidades[row.item_id];
     const physical=row.controleEfetivo==='diario'&&closed!==undefined;
     const stock=physical?closed:row.saldo;
     const target=row.nivel_reposicao;
     const qty=target===null?null:Math.max(0,target-stock);
     const central=dados.estoques.find(e=>e.tipo==='central');
     const inCentral=central?dados.saldos[keyOf(central.id,row.item_id)]||0:0;
     return <tr key={keyOf(row.estoque_id,row.item_id)}><td>{dados.setores.find(st=>st.id===row.estoque_id)?.nome||'Setor'}</td><td><strong>{row.item.nome}</strong><small>{row.item.unidade_medida||'un.'}</small></td>
      <td><span className={'b2-pill '+tone[row.controleEfetivo]}>{labels[row.controleEfetivo]}</span></td>
      <td>{!physical&&row.controleEfetivo==='diario'?'Pendente':fmt3(stock)}</td>
      <td>{target===null?'Configurar':fmt3(target)}</td>
      <td><strong>{row.controleEfetivo==='diario'&&!physical?'—':qty===null?'—':fmt3(qty)}</strong>
       {qty!==null&&qty>inCentral&&<small className="b2-close-warning">Central insuficiente</small>}</td>
      <td>{fmt3(inCentral)}</td>
     </tr>;
    })}</tbody>
   </table></div>
   {previous?.auditoria&&<div className="b2-card b2-section"><h2>Auditoria geral · divergências preliminares</h2>
    <p className="b2-op-help">Apenas itens com baixa Zig: físico informado no fechamento × saldo teórico após a Zig. Contagem não gera uma segunda baixa. Consumos dos itens sem Zig não são classificados como perdas.</p>
    {automatic.filter(r=>previous.quantidades[r.item_id]!==undefined&&Math.abs(previous.quantidades[r.item_id]-r.saldo)>0.0001)
     .map(r=><div className="b2-row" key={r.item_id}><strong>{r.item.nome}<small>Físico {fmt3(previous.quantidades[r.item_id])} · Zig/sistema {fmt3(r.saldo)}</small></strong>
      <span className="b2-pill red">{synced?fmt3(previous.quantidades[r.item_id]-r.saldo):'Aguardar Zig'}</span></div>)}
    {automatic.every(r=>previous.quantidades[r.item_id]===undefined||Math.abs(previous.quantidades[r.item_id]-r.saldo)<0.0001)&&
     <p className="b2-op-help">Nenhuma diferença encontrada na fotografia atual; confira o horário da baixa Zig antes de concluir a auditoria.</p>}
   </div>}
   <div className="b2-hint">As quantidades acima são cálculo em tela. Reposição real exigirá fechamento persistido, baixa por contagem idempotente e confirmação de separação/transferência; nenhuma dessas escritas foi ativada.</div>
   <div className="b2-close-actions"><button type="button" className="b2-btn" onClick={()=>go('fechamento')}>Abrir fechamento do gerente <ArrowRight size={14}/></button></div>
  </>}
 </div>;
};
export default FechamentoBeta2;
