import React from 'react';
import { ArrowRight, BookOpen, CheckCircle2, Package, Users, Warehouse } from 'lucide-react';
import './RotinaEstoquistaBeta2.css';

type Destination = 'inicio' | 'itens' | 'fichas' | 'fornecedores' | 'estoques' | 'emergencias' | 'recebimento' | 'inventario' | 'abastecimento' | 'kits' | 'gestao';
interface Props {
  go:(screen:Destination)=>void;
  nightReviewed:boolean;
  nightCount:number;
  nightAwaitingReceiptCount:number;
  received:boolean;
  countSent:boolean;
  countApproved:boolean;
  differenceCount:number;
  sectorsDone:number;
  sectorsTotal:number;
  sectorsStarted:boolean;
  kitDone:boolean;
  handoffDone:boolean;
  onHandoff:()=>void;
}
/** Passo a passo demonstrativo, sem gravar status de tarefas no banco oficial. */
const RotinaEstoquistaBeta2:React.FC<Props>=({
 go,nightReviewed,nightCount,nightAwaitingReceiptCount,received,countSent,countApproved,
 differenceCount,sectorsDone,sectorsTotal,sectorsStarted,kitDone,handoffDone,onHandoff,
})=>{
 const inventoryDone=countSent&&(differenceCount===0||countApproved);
 const steps=[
  {number:'01',key:'noite',title:'Revisar movimentações fora do expediente',desc:'Consultar quem retirou, quais produtos saíram e se houve confirmação de recebimento no destino. Sem autorizar ou dar nova baixa.',screen:'emergencias' as Destination,button:'Ver saídas e recebimentos',done:nightReviewed,partial:false},
  {number:'02',key:'recebimento',title:'Conferir mercadorias recebidas',desc:'Comparar pedido, nota e mercadoria física. Conferir quantidades, preços e diferenças.',screen:'recebimento' as Destination,button:'Conferir recebimentos',done:received,partial:false},
  {number:'03',key:'inventario',title:'Conferir saldos e divergências',desc:'Contar os itens previstos e encaminhar ao gestor o que precisar de aprovação.',screen:'inventario' as Destination,button:'Abrir contagem',done:inventoryDone,partial:countSent&&!inventoryDone},
  {number:'04',key:'abastecimento',title:'Abastecer drinks, cervejas e cozinha',desc:'Ver quanto cada setor tem, separar a diferença e confirmar o recebimento.',screen:'abastecimento' as Destination,button:'Montar setores',done:sectorsTotal>0&&sectorsDone===sectorsTotal,partial:sectorsStarted},
  {number:'05',key:'kits',title:'Repor o kit compartilhado de limpeza',desc:'Conferir o armário e deixar o material preparado para os dois turnos.',screen:'kits' as Destination,button:'Conferir limpeza',done:kitDone,partial:false},
  {number:'06',key:'fechamento',title:'Entregar a operação organizada',desc:'Repassar pendências e confirmar a conclusão da rotina do estoque.',screen:'inicio' as Destination,button:'Confirmar fechamento',done:handoffDone,partial:false},
 ];
 const completed=steps.filter(s=>s.done).length;
 const canClose=steps.slice(0,5).every(s=>s.done);
 const date=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long'}).format(new Date());
 return <div className="b2-day">
   <section className="b2-day-hero">
    <p className="b2-eyebrow">Painel do estoquista · {date}</p>
    <h1>Minha rotina de hoje</h1>
    <p>Um passo por vez: revisar a noite, conferir mercadorias, organizar os setores e preparar a operação para o próximo turno.</p>
    <div className="b2-day-caption"><span className="b2-pill">ROTEIRO INTERATIVO · DADOS DE TESTE</span><span>{completed} de {steps.length} etapas concluídas</span></div>
    <div className="b2-day-progress" role="progressbar" aria-label="Progresso da rotina" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={completed}><span style={{width:(completed/steps.length*100)+'%'}}/></div>
   </section>
   <div className="b2-grid b2-day-metrics">
    <div className="b2-card"><p className="b2-eyebrow">Etapas concluídas</p><div className="b2-stat">{completed} / {steps.length}</div><p>Checklist da demonstração</p></div>
    <div className="b2-card"><p className="b2-eyebrow">Setores prontos</p><div className="b2-stat">{sectorsDone} / {sectorsTotal}</div><p>Drinks, cervejas e cozinha</p></div>
    <div className="b2-card"><p className="b2-eyebrow">Contagem</p><div className="b2-stat">{inventoryDone?'Conferida':countSent?'Em análise':'Pendente'}</div><p>{countSent&&!inventoryDone?differenceCount+' diferença(s) em análise':'Conferência prevista'}</p></div>
   </div>
   <section className="b2-section" aria-label="Passo a passo da rotina diária">
    <div className="b2-topline"><div><p className="b2-eyebrow">Seu passo a passo</p><h2>O que fazer hoje</h2></div><span className="b2-pill">Siga a ordem da operação</span></div>
    <div className="b2-day-steps">{steps.map(step=><div key={step.key} className={'b2-day-step'+(step.done?' done':step.partial?' partial':'')}>
     <div className="b2-day-number">{step.done?<CheckCircle2 size={22}/>:step.number}</div>
     <div className="b2-day-body"><div className="b2-day-step-head"><h3>{step.title}</h3><span className={'b2-pill '+(step.done?'green':step.partial?'':'red')}>{step.done?(step.key==='noite'?'Consulta feita':'Concluída'):step.partial?'Em andamento':'A fazer'}</span></div>
      <p>{step.desc}</p>
      {step.key==='noite'&&<small>{nightCount} retirada(s) registrada(s) · {nightAwaitingReceiptCount} sem confirmação do destino (prévia)</small>}
      {step.key==='abastecimento'&&<small>{sectorsDone} de {sectorsTotal} setores confirmados</small>}
      {step.key==='inventario'&&countSent&&!inventoryDone&&<small>Aguardando análise das diferenças pelo gestor.</small>}
      <div className="b2-day-actions">
       {step.key==='fechamento'
        ?<button className="b2-btn" disabled={!canClose||handoffDone} onClick={onHandoff}>{handoffDone?'✓ Rotina encerrada':'Confirmar conclusão da rotina'} <ArrowRight size={14}/></button>
        :<button className="b2-btn" onClick={()=>go(step.screen)}>{step.button} <ArrowRight size={14}/></button>}
       {step.key==='inventario'&&countSent&&!inventoryDone&&<button className="b2-btn alt" onClick={()=>go('gestao')}>Ver análise do gestor →</button>}
      </div>
      {step.key==='fechamento'&&!canClose&&!handoffDone&&<small>Disponível após as cinco etapas anteriores.</small>}
     </div>
    </div>)}</div>
   </section>
   <section className="b2-section"><h2>Cadastros e consultas</h2><p className="b2-lead">Os cadastros oficiais continuam aqui quando precisar deles. A rotina vem primeiro.</p>
    <div className="b2-day-links">
     {([
       ['itens','Cadastro de itens',Package],['fichas','Fichas técnicas',BookOpen],
       ['estoques','Cadastro de estoques',Warehouse],['fornecedores','Fornecedores',Users]
     ] as [Destination,string,React.ElementType][]).map(([target,name,Icon])=><button className="b2-day-link" onClick={()=>go(target)} key={target}><Icon size={18}/>{name}<ArrowRight size={14}/></button>)}
    </div>
   </section>
 </div>;
};
export default RotinaEstoquistaBeta2;
