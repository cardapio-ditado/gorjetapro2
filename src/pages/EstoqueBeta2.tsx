import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import RotinaEstoquistaBeta2 from '../components/estoque-beta2/RotinaEstoquistaBeta2';
import FechamentoBeta2 from '../components/estoque-beta2/FechamentoBeta2';
import { useControleZigBeta2, type FechamentoPreview, cuiabaDate, dataAnterior, diaAuditoria } from '../components/estoque-beta2/FechamentoDadosBeta2';
import { ArrowLeft, ArrowRight, Package, Users, ClipboardCheck, Truck, Store, Clock3, BarChart3, RotateCcw, Warehouse, BookOpen, Settings2, SprayCan, ShoppingCart, FileText, ArrowLeftRight, Handshake, ShieldCheck, Sliders, History, Sparkles } from 'lucide-react';
import { Badge, Button, SectionCard } from '../components/ui';
import ConfigurarSetores from './ConfigurarSetores';
import '../components/estoque-beta2/pele-beta2.css';
import Hoje, { type DestinoHoje } from '../components/beta2/Hoje';
import Kits from '../components/beta2/Kits';
import Itens from '../components/beta2/cadastros/Itens';
import Estoques from '../components/beta2/cadastros/Estoques';
import Fornecedores from '../components/beta2/cadastros/Fornecedores';
import Fichas from '../components/beta2/cadastros/Fichas';
import ConfigurarCentral from '../components/beta2/ConfigurarCentral';
import Recebimento from '../components/beta2/Recebimento';
import Reposicao from '../components/beta2/Reposicao';
import Movimentos from '../components/beta2/Movimentos';
import Movimentacoes from '../components/beta2/Movimentacoes';
import Compras from '../components/inventory/Compras';
import RelatoriosEstoque from '../components/inventory/RelatoriosEstoque';
import KardexProduto from '../components/inventory/KardexProduto';
import ContagemEstoque from '../components/inventory/contagem/ContagemEstoque';

/** Beta 2 no React, sem iframe. Cadastros oficiais são compartilhados; fluxos operacionais usam dados simulados. */
type View = 'menu' | 'inicio' | 'itens' | 'fichas' | 'fornecedores' | 'estoques' | 'inventario' | 'recebimento' | 'reposicao' | 'fechamento' | 'politica' | 'setores' | 'kits' | 'emergencias' | 'gestao' | 'compras' | 'relatorios' | 'kardex' | 'movimentacoes' | 'contagem_central' | 'central';
const VIEWS: View[] = ['menu','inicio','itens','fichas','fornecedores','estoques','inventario','recebimento','reposicao','fechamento','politica','setores','kits','emergencias','gestao','compras','relatorios','kardex','movimentacoes','contagem_central','central'];
type Product = { id:string; nome:string; codigo:string; categoria:string; tipo:string; unidade:string; embalagem:string; fator:number; fornecedorId:string; endereco:string; minimo:number; ponto:number; controle:string; classe:string; cmv:boolean; central:number };
const productsSeed:Product[]=[
{id:'stella',nome:'Stella Pure Gold 600 ml',codigo:'BEV-001',categoria:'Bebidas',tipo:'insumo',unidade:'unidade',embalagem:'Caixa com 12',fator:12,fornecedorId:'dist',endereco:'Central seco / Bebidas',minimo:60,ponto:72,controle:'vende',classe:'pedido',cmv:true,central:120},
{id:'original',nome:'Original 600 ml',codigo:'BEV-002',categoria:'Bebidas',tipo:'insumo',unidade:'unidade',embalagem:'Caixa com 12',fator:12,fornecedorId:'dist',endereco:'Central seco / Bebidas',minimo:90,ponto:108,controle:'vende',classe:'pedido',cmv:true,central:180},
{id:'gin',nome:'Gin — garrafa',codigo:'DEST-001',categoria:'Destilados',tipo:'insumo',unidade:'garrafa',embalagem:'Caixa com 6',fator:6,fornecedorId:'atac',endereco:'Central seco / Destilados',minimo:8,ponto:10,controle:'vende',classe:'pedido',cmv:true,central:18},
{id:'batata',nome:'Batata palito',codigo:'ALM-004',categoria:'Congelados',tipo:'insumo',unidade:'pacote',embalagem:'Caixa com 10',fator:10,fornecedorId:'alim',endereco:'Central congelado / Alimentos',minimo:14,ponto:18,controle:'vende',classe:'pedido',cmv:true,central:34},
{id:'bolinho',nome:'Bolinho pronto',codigo:'PRD-002',categoria:'Produção',tipo:'produto_final',unidade:'unidade',embalagem:'Caixa organizadora',fator:1,fornecedorId:'',endereco:'Central congelado / Preparações',minimo:150,ponto:180,controle:'conta',classe:'sob_demanda',cmv:true,central:320}
];
const clone=<T,>(v:T):T=>JSON.parse(JSON.stringify(v)) as T;
const num=(n:number)=>n.toLocaleString('pt-BR',{maximumFractionDigits:2});
const TITULOS:Record<View,string>={menu:'Estoque Beta 2',inicio:'Rotina do dia (demonstração)',itens:'Itens do estoque',fichas:'Fichas técnicas',fornecedores:'Fornecedores',estoques:'Estoques',inventario:'Inventário do Central (demonstração)',recebimento:'Receber compras',reposicao:'Repor os setores',fechamento:'Fechamento dos setores',politica:'Política de controle',setores:'Configurar setores',kits:'Kits de limpeza',emergencias:'Retiradas e pedidos',gestao:'Aprovar diferenças',compras:'Compras',relatorios:'Relatórios',kardex:'Kardex por produto',movimentacoes:'Movimentações',contagem_central:'Contagem do Central',central:'Configurar Central'};
/** grava = mexe em dado real · demo = só na tela · breve = ainda não existe */
type Estado='grava'|'demo'|'breve';
type MenuItem={v?:View;n:string;icon:React.ElementType;estado:Estado;dica?:string};
type MenuGrupo={id:string;title:string;hint:string;items:MenuItem[]};
const GRUPOS:MenuGrupo[]=[
 {id:'cadastros',title:'1 · Cadastros',hint:'Itens, estoques, fichas e fornecedores',items:[
  {v:'itens',n:'Itens do estoque',icon:Package,estado:'grava'},
  {v:'estoques',n:'Estoques',icon:Warehouse,estado:'grava'},
  {v:'fichas',n:'Fichas técnicas',icon:BookOpen,estado:'grava'},
  {v:'fornecedores',n:'Fornecedores',icon:Users,estado:'grava'}
 ]},
 {id:'configuracao',title:'2 · Configuração',hint:'O que fica onde, quanto deve ter, como sai',items:[
  {v:'setores',n:'Configurar setores e kits',icon:Settings2,estado:'grava',dica:'itens, nível e saída por setor'},
  {v:'central',n:'Configurar Central',icon:Sliders,estado:'grava',dica:'ponto de pedido: seu número ou calculado'}
 ]},
 {id:'movimentacoes',title:'3 · Movimentações',hint:'Entradas, reposição, retiradas, empréstimos',items:[
  {v:'recebimento',n:'Receber compras',icon:Truck,estado:'grava',dica:'nota com foto, confere e dá entrada'},
  {v:'reposicao',n:'Repor os setores',icon:Store,estado:'grava',dica:'o que falta até o nível, sai do Central num toque'},
  {v:'emergencias',n:'Retiradas e pedidos',icon:Clock3,estado:'grava',dica:'pedido do setor; retirada fora de hora com conferência'},
  {n:'Empréstimo com vizinhos',icon:Handshake,estado:'breve'},
  {v:'movimentacoes',n:'Movimentações (histórico)',icon:ArrowLeftRight,estado:'grava',dica:'tudo que entrou, saiu e andou'}
 ]},
 {id:'contagem',title:'4 · Contagem',hint:'Central por zonas, setores todo dia, auditoria',items:[
  {v:'contagem_central',n:'Contagem do Central',icon:ClipboardCheck,estado:'grava',dica:'por zonas, no ciclo'},
  {v:'fechamento',n:'Fechamento dos setores',icon:ClipboardCheck,estado:'demo'},
  {n:'Auditoria seg · qui · sáb',icon:ShieldCheck,estado:'breve'},
  {v:'gestao',n:'Aprovar diferenças',icon:ShieldCheck,estado:'demo',dica:'Cristiano ou Kadu'}
 ]},
 {id:'compras',title:'5 · Compras',hint:'Pelo ponto de pedido do Central',items:[
  {v:'compras',n:'Compras',icon:ShoppingCart,estado:'grava'}
 ]},
 {id:'relatorios',title:'6 · Relatórios',hint:'Inventário, kardex, contagens, CMV',items:[
  {v:'relatorios',n:'Relatórios',icon:BarChart3,estado:'grava'},
  {v:'kardex',n:'Kardex por produto',icon:History,estado:'grava'},
  {n:'Kardex por fornecedor · CMV',icon:FileText,estado:'breve'}
 ]},
 {id:'kits',title:'7 · Kits de limpeza',hint:'Garçons, cozinha, bar e serviços gerais',items:[
  {v:'kits',n:'Kits de limpeza',icon:SprayCan,estado:'grava',dica:'repor do Central num toque'}
 ]}
];
const REAIS:View[]=['itens','fichas','estoques','fornecedores','setores','kits','central','recebimento','reposicao','emergencias','compras','relatorios','kardex','movimentacoes','contagem_central','central'];
const EstoqueBeta2:React.FC=()=>{
// Abre direto em Configurar setores quando a URL traz ?setor=…
const[params,setParams]=useSearchParams();
const{usuario}=useAuth();
const telaParam=params.get('tela');
const view:View=params.has('setor')&&!telaParam?'setores':(VIEWS.includes(telaParam as View)?telaParam as View:'menu');
const setView=(v:View,extra?:Record<string,string>)=>{
  const q=new URLSearchParams();
  if(v!=='menu')q.set('tela',v);
  if(extra)Object.entries(extra).forEach(([k,val])=>q.set(k,val));
  setParams(q);
};
const[products,setProducts]=useState<Product[]>(()=>clone(productsSeed));
const[notice,setNotice]=useState('');
const[error,setError]=useState('');
const[received,setReceived]=useState(false);
const[requests,setRequests]=useState<Array<{kind:string;receiptConfirmedAt?:string}>>([]);
const[,setFocusNightReview]=useState(false);
const[fechamentos,setFechamentos]=useState<FechamentoPreview[]>([]);
const[restockViewed,setRestockViewed]=useState(false);
const dadosFechamento=useControleZigBeta2();
const[nightReviewed,setNightReviewed]=useState(false);
const[handoffDone,setHandoffDone]=useState(false);
const[count,setCount]=useState<Record<string,number>>({});
const[countSent,setCountSent]=useState(false);
const[countApproved,setCountApproved]=useState(false);

const differences=products.filter(p=>(count[p.id]??p.central)!==p.central);
const diaReposicao=dataAnterior(cuiabaDate());
const setoresComContagem=dadosFechamento.setores.filter(e=>
 dadosFechamento.linhas.some(l=>l.estoque_id===e.id&&l.controleEfetivo==='diario')
);
const fechamentosRecebidos=setoresComContagem.filter(e=>{
 const f=fechamentos.find(x=>x.estoqueId===e.id&&x.dataOperacional===diaReposicao);
 return Boolean(f)&&dadosFechamento.linhas.filter(l=>l.estoque_id===e.id&&l.controleEfetivo==='diario')
  .every(l=>f?.quantidades[l.item_id]!==undefined&&Number.isFinite(f.quantidades[l.item_id]));
}).length;
const logDaReposicao=dadosFechamento.logs.find(l=>l.dtinicio<=diaReposicao&&l.dtfim>=diaReposicao&&
 Boolean(l.finalizado_em)&&new Date(l.finalizado_em!).getTime()>=new Date(cuiabaDate()+'T06:00:00-04:00').getTime());
const zigPronta=logDaReposicao?.status==='sucesso'&&Number(logDaReposicao.total_nao_mapeados||0)===0;
const auditoriaPrevista=diaAuditoria(diaReposicao);
const auditoriaRecebida=!auditoriaPrevista||dadosFechamento.setores.every(e=>
 fechamentos.some(f=>f.estoqueId===e.id&&f.dataOperacional===diaReposicao&&f.auditoria));
const go=(v:View,extra?:Record<string,string>)=>{
  setView(v,extra);setNotice('');setError('');
  if(v==='reposicao')setRestockViewed(true);
  if(v==='emergencias')setFocusNightReview(false);
};
const reset=()=>{dadosFechamento.resetFrequencias();setProducts(clone(productsSeed));setFechamentos([]);setRestockViewed(false);setCount({});setCountSent(false);setCountApproved(false);setReceived(false);setRequests([]);setFocusNightReview(false);setNightReviewed(false);setHandoffDone(false);setView('menu');setError('');setNotice('Demonstração reiniciada.');};
const irDeHoje=(d:DestinoHoje)=>go(d);
const beta2MenuCSS = `
.b2-root .b2-side{display:flex;flex-direction:column;gap:0}
.b2-root .b2-menu{display:flex;flex-direction:column;gap:7px}
.b2-root .b2-nav-home{background:linear-gradient(120deg,#49273d,#352135);border:1px solid #765167!important;min-height:46px;color:#ffe9f5!important}
.b2-root .b2-nav-home[aria-current=page]{background:#713750;border-color:#d69a92!important;color:#fff!important}
.b2-root .b2-menu-section{border:1px solid #4e374c;border-radius:12px;overflow:hidden;background:#211827}
.b2-root .b2-section-trigger{display:flex;align-items:center;gap:9px;text-align:left;width:100%;border:0;padding:13px 10px;color:#f8e4f0!important}
.b2-root .b2-section-trigger:hover,.b2-root .b2-section-trigger[data-active=true]{background:#3f293c}
.b2-root .b2-section-trigger>svg:first-child{color:#edc487;flex-shrink:0}
.b2-root .b2-section-title{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.b2-root .b2-section-title strong{color:#fff3fa!important;font-size:12px;font-weight:850}
.b2-root .b2-section-title small{color:#d4bccd!important;font-size:10px}
.b2-root .b2-chevron{color:#e0c2d0;flex-shrink:0;transition:transform .2s ease}
.b2-root .b2-chevron.open{transform:rotate(180deg)}
.b2-root .b2-section-items{border-top:1px solid #51374e;background:#1b1520;padding:6px 5px 8px 10px;display:flex;flex-direction:column;gap:2px}
.b2-root .b2-section-items .b2-nav{margin:0;padding:10px 8px;border-radius:9px;font-size:12px;color:#e7d5e1!important;min-height:38px}
.b2-root .b2-section-items .b2-nav[aria-current=page]{background:#653049;color:#fff!important;border-color:#aa6377}
.b2-root .b2-menu-section button:focus-visible,.b2-root .b2-nav-home:focus-visible{outline:2px solid #f2c78f;outline-offset:-2px}
@media(max-width:1000px){
 .b2-root .b2-menu{display:flex;flex-direction:column;gap:7px;overflow:visible}
 .b2-root .b2-section-items{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
 .b2-root .b2-section-items .b2-nav{white-space:normal}
 .b2-root .b2-side>.b2-hint{margin-top:12px}
}
@media(max-width:480px){.b2-root .b2-section-items{grid-template-columns:1fr}}
`;
const beta2CadastroCSS = `/* Beta 2: identidade do protótipo também nos cadastros reais */
.b2-root .b2-catalog-top{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap}
.b2-root .b2-catalog-notice{display:flex;align-items:flex-start;gap:12px;padding:15px 17px;background:#213c33;border:1px solid #438367;border-radius:13px;margin:0 0 20px;color:#d4ffe9}
.b2-root .b2-catalog-notice svg{color:#9af4ca;flex-shrink:0}
.b2-root .b2-catalog-notice strong{color:#e0fff0!important}
.b2-root .b2-catalog-notice p{color:#c1ecd8!important;font-size:13px;line-height:1.5;margin:3px 0 0}
.b2-root .b2-catalog-columns{display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,1fr);align-items:start;gap:14px}
.b2-root .b2-catalog-list{overflow-y:auto;max-height:650px;scrollbar-color:#945e75 #291c2c;margin-top:10px}
.b2-root .b2-catalog-row{display:flex;gap:10px;align-items:center;text-align:left;width:100%;padding:13px 8px;color:#fff5fb!important;border-bottom:1px solid #553d51;border-left:3px solid transparent}
.b2-root .b2-catalog-row:hover,.b2-root .b2-catalog-row.selected{background:#4c2b42;border-left-color:#f0c18b}
.b2-root .b2-catalog-icon{color:#f5d09c;padding:9px;background:#553348;border-radius:10px;flex-shrink:0}
.b2-root .b2-catalog-name{min-width:0;flex:1}.b2-root .b2-catalog-name strong{display:block;color:#fff6fb!important;font-size:14px;overflow-wrap:anywhere}
.b2-root .b2-catalog-name small{display:block;color:#dfcbda!important;font-size:12px;margin-top:3px;overflow-wrap:anywhere}
.b2-root .b2-catalog-detail h2{overflow-wrap:anywhere}
.b2-root .b2-catalog-pages{display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;color:#decbd8;font-size:12px;margin-top:16px}
.b2-root .b2-catalog-pages>div{display:flex;gap:7px}
.b2-root .b2-search{display:flex;align-items:center;gap:8px;background:#241a2a;border:1px solid #92748e;border-radius:11px;color:#f0c18b;margin-top:14px;padding-left:10px}
.b2-root .b2-search input{background:transparent!important;border:none!important;min-height:42px}
.b2-root .b2-search input:focus{box-shadow:none!important}
.b2-root .b2-btn svg,.b2-root .b2-chip svg{display:inline;vertical-align:middle;margin-right:5px}
.b2-root .b2-catalog-save{display:inline-flex;align-items:center;min-height:43px;gap:6px;margin-top:19px}
.b2-root .b2-checks{display:flex;gap:10px;flex-wrap:wrap}
.b2-root .b2-check{display:flex;gap:9px;align-items:center;color:#fff!important;border:1px solid #886b82;border-radius:10px;padding:11px;font-size:13px}
.b2-root .b2-check input{width:17px;accent-color:#c5546a}
.b2-root .b2-wide{grid-column:1/-1}
.b2-root .b2-original-editor{background:#17131d;color:#f7eef5}
.b2-root .b2-original-editor [class*="text-white"]{color:#f7eef5!important}
.b2-root .b2-original-editor [class*="text-gray"],.b2-root .b2-original-editor [class*="text-slate"]{color:#e4d2dc!important}
@media(max-width:1120px){.b2-root .b2-catalog-columns{grid-template-columns:1fr}.b2-root .b2-catalog-list{max-height:450px}}
@media(max-width:610px){.b2-root .b2-catalog-icon{display:none}.b2-root .b2-catalog-row{gap:6px;padding:11px 4px}.b2-root .b2-catalog-row .b2-pill{font-size:9px;padding:4px}}`;
const beta2ContrastCSS = `
/* Contraste explícito: o Gorjeta Pro alterna tokens globais no tema claro.
   Beta 2 mantém sua própria paleta escura em ambos os temas. */
.b2-root{color-scheme:dark!important;color:#f7eef5!important}
.b2-root .b2-shell,.b2-root .b2-main,.b2-root .b2-card,.b2-root .b2-row{color:#f7eef5}
.b2-root h1,.b2-root h2,.b2-root h3,.b2-root h4,.b2-root h5,.b2-root h6,
.b2-root .b2-card strong,.b2-root .b2-row strong,.b2-root .b2-action strong,
.b2-root .b2-card td,.b2-root .b2-card td strong{color:#fff7fb!important}
.b2-root .b2-logo{color:#fff7fb!important}
.b2-root .b2-logo small,.b2-root .b2-eyebrow{color:#f5ca91!important}
.b2-root .b2-lead,.b2-root .b2-muted,.b2-root .b2-row small,
.b2-root .b2-action small{color:#d4c2d0!important}
.b2-root .b2-nav{color:#ead9e7!important}
.b2-root .b2-nav:hover,.b2-root .b2-nav[aria-current=page]{color:#fff!important}
.b2-root .b2-btn,.b2-root .b2-btn.alt,.b2-root .b2-btn.green,
.b2-root .b2-chip,.b2-root .b2-action{color:#fff7fb!important}
.b2-root .b2-action:hover{background:linear-gradient(130deg,#5c3049,#312335)}
.b2-root .b2-field,.b2-root .b2-field span{color:#f5e7f0!important}
.b2-root input:not([type=checkbox]),.b2-root select,.b2-root textarea{
  background-color:#241a2a!important;color:#fff!important;
  -webkit-text-fill-color:#fff!important;border:1px solid #92748e!important;
  color-scheme:dark!important
}
.b2-root input::placeholder,.b2-root textarea::placeholder{
  color:#d0bcca!important;-webkit-text-fill-color:#d0bcca!important;opacity:1
}
.b2-root select option,.b2-root select optgroup{
  background-color:#241a2a!important;color:#fff!important
}
.b2-root input[type=checkbox]{accent-color:#c5546a;color-scheme:dark!important}
.b2-root input[type=date]::-webkit-calendar-picker-indicator{filter:invert(1)}
.b2-root th{color:#e0cdda!important}
.b2-root td,.b2-root td strong{color:#fff5fa!important}
.b2-root .b2-stat{color:#ffe6bf!important}
.b2-root .b2-pill{color:#f6deee!important}
.b2-root .b2-pill.green{color:#aaf3d0!important}
.b2-root .b2-pill.red{color:#ffd0d5!important}
.b2-root .b2-hint{color:#ffe0ad!important}
.b2-root .b2-success{color:#c3ffe0!important}
.b2-root .b2-error{color:#ffe1e4!important}
.b2-root .b2-btn:focus-visible,.b2-root .b2-nav:focus-visible,
.b2-root input:focus-visible,.b2-root select:focus-visible{
  outline:2px solid #f5ca91!important;outline-offset:2px
}
`;
const beta2BaseCSS = '.b2-root{color:#f6edf0;background:radial-gradient(ellipse at 92% 0,#432638,#140f19 44%);min-height:calc(100dvh - 70px);font-family:Inter,system-ui,sans-serif}.b2-root *{box-sizing:border-box}.b2-root .b2-shell{display:grid;grid-template-columns:205px minmax(0,1fr);min-height:calc(100dvh - 70px)}.b2-root .b2-side{padding:20px 11px;background:#1a1320;border-right:1px solid #4d374b}.b2-root .b2-logo{padding:0 11px 18px;font-weight:900;letter-spacing:.04em}.b2-root .b2-logo small{display:block;color:#edc487;font-size:11px;letter-spacing:.12em}.b2-root .b2-nav{display:flex;align-items:center;gap:9px;border-radius:11px;width:100%;padding:10px;border:1px solid transparent;color:#d4bfce;text-align:left;font-size:12px;font-weight:750;margin-bottom:4px}.b2-root .b2-nav:hover,.b2-root .b2-nav[aria-current=page]{background:#49273a;color:white;border-color:#9b5368}.b2-root .b2-main{padding:24px clamp(16px,3vw,40px) 44px;min-width:0}.b2-root .b2-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:25px}.b2-root .b2-tag{border:1px solid #a86d75;background:#59293e;color:#f9dccc;border-radius:99px;font-size:11px;font-weight:900;letter-spacing:.08em;padding:7px 12px}.b2-root .b2-eyebrow{color:#edc487;font-size:11px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;margin-bottom:5px}.b2-root h1{font-weight:900;letter-spacing:-.04em;font-size:clamp(28px,3vw,43px);line-height:1.1;margin:0 0 9px}.b2-root h2{font-weight:850;font-size:21px;margin:0 0 13px}.b2-root .b2-lead,.b2-root .b2-muted{color:#bcaabb}.b2-root .b2-lead{max-width:790px;margin-bottom:25px}.b2-root .b2-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}.b2-root .b2-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.b2-root .b2-split{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.b2-root .b2-card{background:linear-gradient(145deg,#281c2c,#1d1823);border:1px solid #4d3849;border-radius:18px;padding:19px;min-width:0}.b2-root .b2-stat{font-size:30px;letter-spacing:-.05em;font-weight:900;color:#f5dfc6}.b2-root .b2-section{margin-top:28px}.b2-root .b2-action{display:flex;align-items:center;gap:14px;text-align:left;border:1px solid #674352;background:linear-gradient(130deg,#492539,#261d2a);padding:17px;border-radius:17px;min-height:98px}.b2-root .b2-action:hover{border-color:#edc487}.b2-root .b2-action strong{display:block;font-size:16px;font-weight:850}.b2-root .b2-action small{display:block;color:#d5becb;margin-top:2px}.b2-root .b2-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:14px 0;border-bottom:1px solid #493547}.b2-root .b2-row:last-child{border:0}.b2-root .b2-row strong{display:block}.b2-root .b2-row small{color:#baa8b8;display:block;font-size:12px;margin-top:3px}.b2-root .b2-btn{background:linear-gradient(130deg,#b54660,#842d46);border:1px solid transparent;color:white;padding:10px 14px;border-radius:11px;font-weight:850;font-size:13px}.b2-root .b2-btn:hover{filter:brightness(1.1)}.b2-root .b2-btn:disabled{opacity:.5;cursor:default}.b2-root .b2-btn.alt{background:#3c3041;border-color:#70546c}.b2-root .b2-btn.green{background:#207b5c}.b2-root .b2-btn.small{padding:7px 10px;font-size:12px}.b2-root .b2-pill{background:#513549;color:#f3dded;border:1px solid #695061;border-radius:99px;font-size:11px;font-weight:800;padding:5px 9px;display:inline-block}.b2-root .b2-pill.green{color:#a6efd0;background:#1c453a;border-color:#2d6b53}.b2-root .b2-pill.red{color:#ffb1bb;background:#542b3b;border-color:#9b4b5b}.b2-root .b2-hint{background:#382a2a;color:#efce9a;border:1px solid #755843;border-radius:11px;padding:11px 13px;font-size:12px;margin:14px 0}.b2-root .b2-success{background:#173c30;color:#b5efd0;border:1px solid #367957;border-radius:11px;padding:12px 14px;font-size:13px;margin:15px 0}.b2-root .b2-error{background:#522737;color:#ffd2d4;border:1px solid #a44b60;border-radius:11px;padding:12px 14px;font-size:13px;margin:15px 0}.b2-root .b2-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.b2-root .b2-field{display:grid;gap:7px;color:#e8d5e1;font-size:12px;font-weight:800}.b2-root input,.b2-root select{width:100%;border-radius:10px;padding:10px 11px;border:1px solid #6b516b;background:#17111d;color:white;min-width:0}.b2-root input[type=checkbox]{width:auto}.b2-root select option{background:#201824;color:white}.b2-root .b2-table-scroll{overflow-x:auto}.b2-root table{width:100%;border-collapse:collapse;min-width:540px}.b2-root th{color:#bba5b8;text-align:left;text-transform:uppercase;letter-spacing:.08em;font-size:11px;padding:12px 9px;border-bottom:1px solid #4d3849}.b2-root td{padding:12px 9px;border-bottom:1px solid #453444;font-size:13px}.b2-root td input{max-width:100px}.b2-root .b2-topline{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}.b2-root .b2-chips{display:flex;flex-wrap:wrap;gap:8px;margin:15px 0}.b2-root .b2-chip{border:1px solid #65465a;padding:8px 11px;border-radius:11px;font-size:12px;font-weight:800;background:#352537}.b2-root .b2-chip[aria-pressed=true]{background:#7d3049;color:white}@media(max-width:1000px){.b2-root .b2-shell{display:block}.b2-root .b2-side{padding:12px;border-right:0;border-bottom:1px solid #4d374b}.b2-root .b2-logo{padding-bottom:8px}.b2-root .b2-menu{display:flex;gap:4px;overflow-x:auto}.b2-root .b2-nav{width:auto;white-space:nowrap;padding:9px}.b2-root .b2-main{padding:17px}.b2-root .b2-split{grid-template-columns:1fr}}@media(max-width:600px){.b2-root .b2-grid,.b2-root .b2-actions,.b2-root .b2-form{grid-template-columns:1fr}.b2-root .b2-card{padding:15px}}';

const real=REAIS.includes(view);
const voltar=<Button variante="discreto" tamanho="sm" icone={<ArrowLeft size={14}/>} onClick={()=>go('menu')} className="mb-2 -ml-2">Estoque Beta 2</Button>;

// ── Telas novas, no padrão do kit, gravando de verdade ──
if(view==='setores')return <div>{voltar}<ConfigurarSetores/></div>;
if(view==='kits')return <div>{voltar}<Kits responsavel={usuario?.nome_completo??null} onConfigurar={id=>go('setores',{setor:id,passo:'1'})}/></div>;
if(view==='itens')return <div>{voltar}<Itens/></div>;
if(view==='estoques')return <div>{voltar}<Estoques/></div>;
if(view==='fornecedores')return <div>{voltar}<Fornecedores/></div>;
if(view==='fichas')return <div>{voltar}<Fichas/></div>;
if(view==='central')return <div>{voltar}<ConfigurarCentral/></div>;
if(view==='recebimento')return <Recebimento onVoltar={()=>go('menu')}/>;
if(view==='reposicao')return <Reposicao responsavel={usuario?.nome_completo??null} onVoltar={()=>go('menu')}/>;
if(view==='emergencias')return <Movimentos responsavel={usuario?.nome_completo??null} onVoltar={()=>go('menu')}/>;

// ── Telas reais do módulo atual, embutidas no Beta 2 ──
if(view==='movimentacoes')return <Movimentacoes onVoltar={()=>go('menu')}/>;
if(view==='compras'||view==='relatorios'||view==='kardex'||view==='contagem_central')return <div>
  <div className="flex items-center gap-3 flex-wrap mb-3">{voltar}<span className="t-subsec">{TITULOS[view]}</span><Badge variant="success">grava</Badge></div>
  {view==='compras'&&<Compras/>}
  {view==='relatorios'&&<RelatoriosEstoque/>}
  {view==='kardex'&&<KardexProduto/>}
  {view==='contagem_central'&&<ContagemEstoque/>}
</div>;

// ── Entrada: Hoje + os 7 grupos ──
if(view==='menu')return <div className="max-w-5xl">
  <Hoje onIr={irDeHoje}/>
  {notice&&<div className="aviso aviso-certo my-4">{notice}</div>}
  <div className="flex items-center justify-between gap-3 mt-8 mb-3">
    <h2 className="t-subsec" style={{margin:0}}>Tudo do estoque</h2>
    <div className="flex items-center gap-3">
      <span className="t-caption hidden md:inline">grava = mexe no saldo real · demonstração = só na tela · em breve = ainda não existe</span>
      <Button tamanho="sm" variante="discreto" icone={<RotateCcw size={14}/>} onClick={reset}>Reiniciar demonstração</Button>
    </div>
  </div>
  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
    {GRUPOS.map(g=><SectionCard key={g.id} title={g.title} descricao={g.hint} noPadding>
      <div className="flex flex-col">
        {g.items.map(item=>{
          const breve=item.estado==='breve';
          return <button key={item.n} type="button" disabled={breve} onClick={()=>item.v&&go(item.v)} className="flex items-center gap-3 px-5 min-h-12 py-2 text-left hover:bg-white/[0.04] focus-ring disabled:opacity-50 disabled:cursor-not-allowed" style={{borderBottom:'1px solid var(--border-subtle)'}}>
            <item.icon size={16} aria-hidden="true" style={{color:item.estado==='grava'?'var(--gold)':'var(--text-secondary)'}}/>
            <span className="flex-1 min-w-0">
              <span className="block t-body" style={{fontWeight:item.estado==='grava'?600:400}}>{item.n}</span>
              {item.dica&&<span className="block t-caption">{item.dica}</span>}
            </span>
            {item.estado==='grava'&&<Badge variant="success">grava</Badge>}
            {item.estado==='demo'&&<Badge variant="warning">demonstração</Badge>}
            {breve&&<Badge variant="neutral">em breve</Badge>}
            {!breve&&<ArrowRight size={14} aria-hidden="true" style={{color:'var(--text-secondary)'}}/>}
          </button>;
        })}
      </div>
    </SectionCard>)}
  </div>
  <button type="button" onClick={()=>go('inicio')} className="mt-4 flex items-center gap-2 t-caption focus-ring" style={{color:'var(--text-secondary)'}}><Sparkles size={12} aria-hidden="true"/> Ver a rotina do dia do protótipo (demonstração)</button>
</div>;

// ── Telas herdadas do protótipo: continuam com a pele própria, dentro do padrão ──
return <div>
<div className="flex items-center gap-3 flex-wrap mb-3">
  <Button variante="discreto" tamanho="sm" icone={<ArrowLeft size={14}/>} onClick={()=>go('menu')} className="-ml-2">Estoque Beta 2</Button>
  <span className="t-subsec">{TITULOS[view]}</span>
  <Badge variant={real?'success':'warning'}>{real?'grava no cadastro real':'demonstração, não mexe em saldo'}</Badge>
</div>
<div className="b2-root b2-embutido">
<style>{beta2BaseCSS}{beta2ContrastCSS}{beta2CadastroCSS}{beta2MenuCSS}{'.b2-root.b2-embutido{background:transparent;min-height:0;font-family:inherit;border-radius:10px}.b2-root.b2-embutido .b2-main{padding:0;min-width:0}'}</style>
<main className="b2-main">
{view==='inicio'&&<RotinaEstoquistaBeta2
 go={v=>{go(v);if(v==='emergencias'){setFocusNightReview(true);setNightReviewed(true);}}}
 nightReviewed={nightReviewed}
 nightCount={requests.filter(req=>req.kind==='noturna').length}
 nightAwaitingReceiptCount={requests.filter(req=>req.kind==='noturna'&&!req.receiptConfirmedAt).length}
 received={received}
 fechamentoTotal={setoresComContagem.length}
 fechamentoRecebidos={fechamentosRecebidos}
 zigReady={zigPronta}
 auditoriaPrevista={auditoriaPrevista}
 auditoriaRecebida={auditoriaRecebida}
 restockViewed={restockViewed}
 niveisCompletos={!dadosFechamento.linhas.some(l=>
  dadosFechamento.setores.some(e=>e.id===l.estoque_id)
  &&(l.nivel_reposicao===null||(l.controle==='venda'&&!l.mapeadoZig))
 )}
 kitDone={true} handoffDone={handoffDone}
 onHandoff={()=>{setHandoffDone(true);setNotice('Roteiro encerrado apenas na simulação.');}}
/>}

{view==='inventario'&&<><p className="b2-eyebrow">Posição e contagem</p><h1>Inventário</h1><p className="b2-lead">Contagem do Central com avaliação de divergências por Cristiano.</p><div className="b2-card"><div className="b2-topline"><h2>Contagem por endereço</h2><span className="b2-pill">{countApproved?'Aprovado':countSent?'Aguardando Cristiano':'Em andamento'}</span></div><div className="b2-table-scroll"><table><thead><tr><th>Item</th><th>Local</th><th>Teórico</th><th>Físico</th><th>Diferença</th></tr></thead><tbody>{products.map(p=>{const fisico=count[p.id]??p.central,diff=fisico-p.central;return <tr key={p.id}><td>{p.nome}</td><td>{p.endereco}</td><td>{num(p.central)}</td><td><input type="number" min="0" value={fisico} disabled={countSent} onChange={e=>setCount(c=>({...c,[p.id]:Number(e.target.value)}))}/></td><td><span className={'b2-pill '+(diff?'red':'green')}>{num(diff)}</span></td></tr>})}</tbody></table></div><div style={{marginTop:18}}>{countSent?<button className="b2-btn alt" onClick={()=>go('gestao')}>Ver fila do Cristiano →</button>:<button className="b2-btn" onClick={()=>{setCountSent(true);setNotice('Contagem enviada apenas nesta simulação.')}}>Enviar contagem →</button>}</div></div></>}
{view==='fechamento'&&<FechamentoBeta2
 mode="fechamento"
 dados={dadosFechamento}
 fechamentos={fechamentos}
 onSave={f=>{setFechamentos(prev=>[...prev.filter(x=>!(x.estoqueId===f.estoqueId&&x.dataOperacional===f.dataOperacional)),f]);setNotice('Fechamento guardado apenas nesta prévia.');}}
 go={v=>go(v)}
/>}

{view==='gestao'&&<><p className="b2-eyebrow">Gestor · Cristiano</p><h1>Aprovação de divergências</h1><p className="b2-lead">Contagem não deve ajustar saldos sem aprovação do gestor.</p><div className="b2-card"><h2>Fila de aprovação</h2>{!countSent?<p className="b2-hint">Envie uma contagem em Inventário para testar.</p>:countApproved?<p className="b2-success">Aprovação simulada concluída, sem ajuste real.</p>:differences.length?<>{differences.map(p=><div className="b2-row" key={p.id}><div><strong>{p.nome}</strong><small>Teórico {p.central} · físico {count[p.id]??p.central}</small></div><span className="b2-pill red">{num((count[p.id]??p.central)-p.central)}</span></div>)}<button className="b2-btn" style={{marginTop:16}} onClick={()=>{setCountApproved(true);setNotice('Aprovado somente na simulação.')}}>Aprovar na simulação</button></>:<p className="b2-success">Contagem sem diferenças.</p>}</div></>}
{error&&<p className="b2-error">{error}</p>}{notice&&<p className="b2-success">✓ {notice}</p>}
</main></div></div>;
};
export default EstoqueBeta2;
