import React from 'react';
import { ArrowRight, BookOpen, CheckCircle2, Package, Users, Warehouse } from 'lucide-react';
import './RotinaEstoquistaBeta2.css';

type Destination='inicio'|'itens'|'fichas'|'fornecedores'|'estoques'|'emergencias'|'recebimento'|'inventario'|'reposicao'|'fechamento'|'politica'|'kits'|'gestao';
interface Props{
 go:(screen:Destination)=>void;
 nightReviewed:boolean;nightCount:number;nightAwaitingReceiptCount:number;
 received:boolean;
 fechamentoTotal:number;fechamentoRecebidos:number;zigReady:boolean;
 auditoriaPrevista:boolean;auditoriaRecebida:boolean;
 restockViewed:boolean;kitDone:boolean;handoffDone:boolean;
 onHandoff:()=>void;
}
const RotinaEstoquistaBeta2:React.FC<Props>=({
 go,nightReviewed,nightCount,nightAwaitingReceiptCount,received,
 fechamentoTotal,fechamentoRecebidos,zigReady,auditoriaPrevista,auditoriaRecebida,
 restockViewed,kitDone,handoffDone,onHandoff
})=>{
 const closesReady=fechamentoRecebidos===fechamentoTotal;
 const restockReady=closesReady&&zigReady;
 const steps=[
  {number:'01',key:'noite',title:'Consultar retiradas fora do expediente',
   desc:'Ver o que saiu, quem retirou e se o setor de destino confirmou o recebimento. Não há segunda baixa.',
   screen:'emergencias' as Destination,button:'Ver movimentações',done:nightReviewed,partial:false},
  {number:'02',key:'processamento',title:'Verificar Zig e fechamento dos gerentes',
   desc:'A Zig baixa normalmente às 6h; cada gerente informa o físico dos itens sem baixa automática no fechamento.',
   screen:'fechamento' as Destination,button:'Ver fechamentos',done:restockReady,partial:zigReady||fechamentoRecebidos>0},
  {number:'03',key:'recebimento',title:'Conferir mercadorias que chegaram',
   desc:'Conferir notas e produtos recebidos sem repetir a conferência diária dos setores.',
   screen:'recebimento' as Destination,button:'Conferir recebimento',done:received,partial:false},
  {number:'04',key:'auditoria',title:auditoriaPrevista?'Contagem geral programada':'Contagem geral · fora da escala de hoje',
   desc:auditoriaPrevista?'Segunda, quinta e domingo: todos os itens, só para apurar divergências. A contagem é feita pelos responsáveis dos setores.':'A conferência de todos os itens acontece segunda, quinta e domingo; o estoquista não conta os dois setores diariamente.',
   screen:'fechamento' as Destination,button:'Ver conferência dos setores',
   done:!auditoriaPrevista||auditoriaRecebida,partial:false},
  {number:'05',key:'reposicao',title:'Separar a reposição pronta para o dia seguinte',
   desc:'Usar saldo pós-Zig e físico do fechamento dos itens sem Zig. Sem uma nova contagem geral de Bar e Cozinha.',
   screen:'reposicao' as Destination,button:'Abrir lista de reposição',done:restockViewed&&restockReady,partial:restockViewed},
  {number:'06',key:'kits',title:'Repor o kit compartilhado da limpeza',
   desc:'Conferir armário e deixar materiais preparados para os dois turnos.',
   screen:'kits' as Destination,button:'Ver kits de limpeza',done:kitDone,partial:false},
  {number:'07',key:'fechamento',title:'Entregar a operação organizada',
   desc:'Repassar pendências e confirmar o roteiro demonstrativo.',
   screen:'inicio' as Destination,button:'Encerrar',done:handoffDone,partial:false}
 ];
 const completed=steps.filter(s=>s.done).length;
 const canClose=steps.slice(0,-1).every(s=>s.done);
 const date=new Intl.DateTimeFormat('pt-BR',{weekday:'long',day:'2-digit',month:'long',timeZone:'America/Cuiaba'}).format(new Date());
 return <div className="b2-day">
  <section className="b2-day-hero">
   <p className="b2-eyebrow">Painel do estoquista · {date}</p>
   <h1>Minha rotina de hoje</h1>
   <p>As vendas são baixadas pela Zig; os itens sem Zig vêm da contagem do gerente. Você começa o dia pela lista de reposição, não por duas contagens gerais.</p>
   <div className="b2-day-caption"><span className="b2-pill">ROTEIRO INTERATIVO · PRÉVIA, SEM MOVIMENTAR SALDOS</span><span>{completed} de {steps.length} etapas</span></div>
   <div className="b2-day-progress" role="progressbar" aria-label="Progresso da rotina" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={completed}><span style={{width:(completed/steps.length*100)+'%'}}/></div>
  </section>
  <div className="b2-grid b2-day-metrics">
   <div className="b2-card"><p className="b2-eyebrow">Fechamento dos setores</p><div className="b2-stat">{fechamentoRecebidos}/{fechamentoTotal}</div><p>Contagens dos itens sem Zig</p></div>
   <div className="b2-card"><p className="b2-eyebrow">Vendas Zig · 6h</p><div className="b2-stat">{zigReady?'OK':'Pendente'}</div><p>{zigReady?'Processamento validado':'Verificar execução e mapeamento'}</p></div>
   <div className="b2-card"><p className="b2-eyebrow">Lista do estoquista</p><div className="b2-stat">{restockReady?'Pronta':'Aguardando'}</div><p>Prévia após Zig + fechamento</p></div>
  </div>
  <section className="b2-section" aria-label="Passo a passo da rotina">
   <div className="b2-topline"><div><p className="b2-eyebrow">Seu passo a passo</p><h2>O que fazer hoje</h2></div><span className="b2-pill">Não contar os setores todo dia</span></div>
   <div className="b2-day-steps">{steps.map(step=><div key={step.key} className={'b2-day-step'+(step.done?' done':step.partial?' partial':'')}>
    <div className="b2-day-number">{step.done?<CheckCircle2 size={22}/>:step.number}</div>
    <div className="b2-day-body"><div className="b2-day-step-head"><h3>{step.title}</h3>
     <span className={'b2-pill '+(step.done?'green':step.partial?'':'red')}>{step.done?(step.key==='noite'?'Consulta feita':step.key==='reposicao'?'Lista consultada':!auditoriaPrevista&&step.key==='auditoria'?'Não prevista':'Concluída'):step.partial?'Em andamento':'Pendente'}</span>
    </div><p>{step.desc}</p>
    {step.key==='noite'&&<small>{nightCount} retirada(s) na prévia · {nightAwaitingReceiptCount} sem confirmação de destino</small>}
    {step.key==='processamento'&&<small>{fechamentoRecebidos}/{fechamentoTotal} setores com fechamento · Zig {zigReady?'validada':'não validada'}</small>}
    <div className="b2-day-actions">{step.key==='fechamento'
     ?<button className="b2-btn" disabled={!canClose||handoffDone} onClick={onHandoff}>{handoffDone?'✓ Roteiro encerrado':'Confirmar roteiro da prévia'} <ArrowRight size={14}/></button>
     :<button className="b2-btn" onClick={()=>go(step.screen)}>{step.button} <ArrowRight size={14}/></button>}
    </div>
    {step.key==='fechamento'&&!canClose&&!handoffDone&&<small>Disponível após as etapas anteriores da demonstração.</small>}
    </div>
   </div>)}</div>
  </section>
  <section className="b2-section"><h2>Cadastros e consultas</h2><p className="b2-lead">Cadastros oficiais compartilhados; contagens e reposições da nova rotina ainda são simulações.</p>
   <div className="b2-day-links">{([
     ['itens','Cadastro de itens',Package],['fichas','Fichas técnicas',BookOpen],
     ['estoques','Cadastro de estoques',Warehouse],['fornecedores','Fornecedores',Users]
    ] as [Destination,string,React.ElementType][]).map(([target,name,Icon])=>
    <button className="b2-day-link" onClick={()=>go(target)} key={target}><Icon size={18}/>{name}<ArrowRight size={14}/></button>)}</div>
  </section>
 </div>;
};
export default RotinaEstoquistaBeta2;
