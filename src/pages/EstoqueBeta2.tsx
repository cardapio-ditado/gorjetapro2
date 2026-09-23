import React, { useState } from 'react';
import CadastrosBeta2, { type Cadastro } from '../components/estoque-beta2/CadastrosBeta2';
import RotinaEstoquistaBeta2 from '../components/estoque-beta2/RotinaEstoquistaBeta2';
import { Home, Package, Users, ClipboardCheck, Truck, Store, FileBox, Clock3, BarChart3, RotateCcw, Warehouse, BookOpen } from 'lucide-react';

/** Beta 2 no React, sem iframe. Cadastros oficiais são compartilhados; fluxos operacionais usam dados simulados. */
type View = 'inicio' | 'itens' | 'fichas' | 'fornecedores' | 'estoques' | 'inventario' | 'recebimento' | 'abastecimento' | 'kits' | 'noite' | 'gestao';
type Product = { id:string; nome:string; codigo:string; categoria:string; tipo:string; unidade:string; embalagem:string; fator:number; fornecedorId:string; endereco:string; minimo:number; ponto:number; controle:string; classe:string; cmv:boolean; central:number };
type Supplier = { id:string; nome:string; cnpj:string; telefone:string; email:string; responsavel:string; modalidade:string; ciclo:string; dias:string; observacoes:string };
type Line = { id:string; produto:string; pedido:number; recebido:number; custo:number };
type Sector = { id:string; nome:string; encarregado:string; status:string; itens:{ nome:string; alvo:number; atual:number; unidade:string }[] };
const productsSeed:Product[]=[
{id:'stella',nome:'Stella Pure Gold 600 ml',codigo:'BEV-001',categoria:'Bebidas',tipo:'insumo',unidade:'unidade',embalagem:'Caixa com 12',fator:12,fornecedorId:'dist',endereco:'Central seco / Bebidas',minimo:60,ponto:72,controle:'vende',classe:'pedido',cmv:true,central:120},
{id:'original',nome:'Original 600 ml',codigo:'BEV-002',categoria:'Bebidas',tipo:'insumo',unidade:'unidade',embalagem:'Caixa com 12',fator:12,fornecedorId:'dist',endereco:'Central seco / Bebidas',minimo:90,ponto:108,controle:'vende',classe:'pedido',cmv:true,central:180},
{id:'gin',nome:'Gin — garrafa',codigo:'DEST-001',categoria:'Destilados',tipo:'insumo',unidade:'garrafa',embalagem:'Caixa com 6',fator:6,fornecedorId:'atac',endereco:'Central seco / Destilados',minimo:8,ponto:10,controle:'vende',classe:'pedido',cmv:true,central:18},
{id:'batata',nome:'Batata palito',codigo:'ALM-004',categoria:'Congelados',tipo:'insumo',unidade:'pacote',embalagem:'Caixa com 10',fator:10,fornecedorId:'alim',endereco:'Central congelado / Alimentos',minimo:14,ponto:18,controle:'vende',classe:'pedido',cmv:true,central:34},
{id:'bolinho',nome:'Bolinho pronto',codigo:'PRD-002',categoria:'Produção',tipo:'produto_final',unidade:'unidade',embalagem:'Caixa organizadora',fator:1,fornecedorId:'',endereco:'Central congelado / Preparações',minimo:150,ponto:180,controle:'conta',classe:'sob_demanda',cmv:true,central:320}
];
const suppliersSeed:Supplier[]=[
{id:'dist',nome:'Distribuidora de bebidas (exemplo)',cnpj:'',telefone:'',email:'',responsavel:'',modalidade:'entrega',ciclo:'1',dias:'Seg–Sex',observacoes:'Bebidas e chopp'},
{id:'atac',nome:'Atacado (exemplo)',cnpj:'',telefone:'',email:'',responsavel:'',modalidade:'rua',ciclo:'',dias:'',observacoes:'Destilados e limpeza'},
{id:'alim',nome:'Alimentos (exemplo)',cnpj:'',telefone:'',email:'',responsavel:'',modalidade:'entrega',ciclo:'',dias:'',observacoes:'Congelados'}
];
const sectionsSeed:Sector[]=[
{id:'drinks',nome:'Bar de drinks',encarregado:'Henrian',status:'pendente',itens:[{nome:'Gin',alvo:6,atual:2,unidade:'garrafas'},{nome:'Energético',alvo:36,atual:14,unidade:'latas'},{nome:'Polpa de maracujá',alvo:25,atual:7,unidade:'pacotes'}]},
{id:'cerveja',nome:'Bar de cervejas',encarregado:'Henrian',status:'pendente',itens:[{nome:'Stella Pure Gold',alvo:80,atual:28,unidade:'un.'},{nome:'Original',alvo:110,atual:45,unidade:'un.'},{nome:'Água sem gás',alvo:75,atual:26,unidade:'un.'}]},
{id:'cozinha',nome:'Cozinha',encarregado:'João Vitor',status:'pendente',itens:[{nome:'Batata palito',alvo:22,atual:7,unidade:'pacotes'},{nome:'Bolinho pronto',alvo:200,atual:65,unidade:'un.'},{nome:'Carne',alvo:24,atual:9,unidade:'kg'}]}
];
const linesSeed:Line[]=[
{id:'r1',produto:'Stella Pure Gold 600 ml',pedido:48,recebido:48,custo:7.71},
{id:'r2',produto:'Original 600 ml',pedido:60,recebido:58,custo:8.96},
{id:'r3',produto:'Gin — garrafa',pedido:6,recebido:6,custo:73.90}
];
const clone=<T,>(v:T):T=>JSON.parse(JSON.stringify(v)) as T;
const num=(n:number)=>n.toLocaleString('pt-BR',{maximumFractionDigits:2});
const money=(n:number)=>n.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const menu:{v:View;n:string;icon:React.ElementType}[]=[
{v:'inicio',n:'Rotina do dia',icon:Home},{v:'itens',n:'Cadastro de itens',icon:Package},{v:'fichas',n:'Fichas técnicas',icon:BookOpen},{v:'fornecedores',n:'Fornecedores',icon:Users},{v:'estoques',n:'Cadastro de estoques',icon:Warehouse},
{v:'inventario',n:'Inventário',icon:ClipboardCheck},{v:'recebimento',n:'Recebimento',icon:Truck},
{v:'abastecimento',n:'Abastecimento',icon:Store},{v:'kits',n:'Kits de limpeza',icon:FileBox},
{v:'noite',n:'Retiradas noturnas',icon:Clock3},{v:'gestao',n:'Gestão',icon:BarChart3}
];
const EstoqueBeta2:React.FC=()=>{
const[view,setView]=useState<View>('inicio');
const[products,setProducts]=useState<Product[]>(()=>clone(productsSeed));
const[suppliers,setSuppliers]=useState<Supplier[]>(()=>clone(suppliersSeed));
const[notice,setNotice]=useState('');
const[error,setError]=useState('');
const[lines,setLines]=useState<Line[]>(()=>clone(linesSeed));
const[received,setReceived]=useState(false);
const[sectors,setSectors]=useState<Sector[]>(()=>clone(sectionsSeed));
const[sectorId,setSectorId]=useState('drinks');
const[kitDone,setKitDone]=useState(false);
const[nightReviewed,setNightReviewed]=useState(false);
const[handoffDone,setHandoffDone]=useState(false);
const[count,setCount]=useState<Record<string,number>>({});
const[countSent,setCountSent]=useState(false);
const[countApproved,setCountApproved]=useState(false);
const[night,setNight]=useState<{produto:string;quantidade:number;motivo:string}[]>([]);
const[nightProduct,setNightProduct]=useState('Stella Pure Gold 600 ml');
const[nightQty,setNightQty]=useState(2);
const[nightReason,setNightReason]=useState('Reposição emergencial');

const sector=sectors.find(s=>s.id===sectorId)||sectors[0];
const differences=products.filter(p=>(count[p.id]??p.central)!==p.central);
const go=(v:View)=>{setView(v);setNotice('');setError('');};
const reset=()=>{setProducts(clone(productsSeed));setSuppliers(clone(suppliersSeed));setLines(clone(linesSeed));setSectors(clone(sectionsSeed));setCount({});setCountSent(false);setCountApproved(false);setReceived(false);setKitDone(false);setNightReviewed(false);setHandoffDone(false);setNight([]);setView('inicio');setError('');setNotice('Demonstração reiniciada.');};
const field=(label:string,value:string|number,onChange:(v:string)=>void,choices?:string[])=>
<label className="b2-field"><span>{label}</span>{choices?<select value={String(value)} onChange={e=>onChange(e.target.value)}>{choices.map(v=><option key={v}>{v}</option>)}</select>:<input value={value} onChange={e=>onChange(e.target.value)}/>}</label>;
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
return <div className="b2-root -m-5 lg:-m-7">
<style>{'.b2-root{color:#f6edf0;background:radial-gradient(ellipse at 92% 0,#432638,#140f19 44%);min-height:calc(100dvh - 70px);font-family:Inter,system-ui,sans-serif}.b2-root *{box-sizing:border-box}.b2-root .b2-shell{display:grid;grid-template-columns:205px minmax(0,1fr);min-height:calc(100dvh - 70px)}.b2-root .b2-side{padding:20px 11px;background:#1a1320;border-right:1px solid #4d374b}.b2-root .b2-logo{padding:0 11px 18px;font-weight:900;letter-spacing:.04em}.b2-root .b2-logo small{display:block;color:#edc487;font-size:11px;letter-spacing:.12em}.b2-root .b2-nav{display:flex;align-items:center;gap:9px;border-radius:11px;width:100%;padding:10px;border:1px solid transparent;color:#d4bfce;text-align:left;font-size:12px;font-weight:750;margin-bottom:4px}.b2-root .b2-nav:hover,.b2-root .b2-nav[aria-current=page]{background:#49273a;color:white;border-color:#9b5368}.b2-root .b2-main{padding:24px clamp(16px,3vw,40px) 44px;min-width:0}.b2-root .b2-head{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:25px}.b2-root .b2-tag{border:1px solid #a86d75;background:#59293e;color:#f9dccc;border-radius:99px;font-size:11px;font-weight:900;letter-spacing:.08em;padding:7px 12px}.b2-root .b2-eyebrow{color:#edc487;font-size:11px;font-weight:900;letter-spacing:.15em;text-transform:uppercase;margin-bottom:5px}.b2-root h1{font-weight:900;letter-spacing:-.04em;font-size:clamp(28px,3vw,43px);line-height:1.1;margin:0 0 9px}.b2-root h2{font-weight:850;font-size:21px;margin:0 0 13px}.b2-root .b2-lead,.b2-root .b2-muted{color:#bcaabb}.b2-root .b2-lead{max-width:790px;margin-bottom:25px}.b2-root .b2-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:13px}.b2-root .b2-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.b2-root .b2-split{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:13px}.b2-root .b2-card{background:linear-gradient(145deg,#281c2c,#1d1823);border:1px solid #4d3849;border-radius:18px;padding:19px;min-width:0}.b2-root .b2-stat{font-size:30px;letter-spacing:-.05em;font-weight:900;color:#f5dfc6}.b2-root .b2-section{margin-top:28px}.b2-root .b2-action{display:flex;align-items:center;gap:14px;text-align:left;border:1px solid #674352;background:linear-gradient(130deg,#492539,#261d2a);padding:17px;border-radius:17px;min-height:98px}.b2-root .b2-action:hover{border-color:#edc487}.b2-root .b2-action strong{display:block;font-size:16px;font-weight:850}.b2-root .b2-action small{display:block;color:#d5becb;margin-top:2px}.b2-root .b2-row{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:14px 0;border-bottom:1px solid #493547}.b2-root .b2-row:last-child{border:0}.b2-root .b2-row strong{display:block}.b2-root .b2-row small{color:#baa8b8;display:block;font-size:12px;margin-top:3px}.b2-root .b2-btn{background:linear-gradient(130deg,#b54660,#842d46);border:1px solid transparent;color:white;padding:10px 14px;border-radius:11px;font-weight:850;font-size:13px}.b2-root .b2-btn:hover{filter:brightness(1.1)}.b2-root .b2-btn:disabled{opacity:.5;cursor:default}.b2-root .b2-btn.alt{background:#3c3041;border-color:#70546c}.b2-root .b2-btn.green{background:#207b5c}.b2-root .b2-btn.small{padding:7px 10px;font-size:12px}.b2-root .b2-pill{background:#513549;color:#f3dded;border:1px solid #695061;border-radius:99px;font-size:11px;font-weight:800;padding:5px 9px;display:inline-block}.b2-root .b2-pill.green{color:#a6efd0;background:#1c453a;border-color:#2d6b53}.b2-root .b2-pill.red{color:#ffb1bb;background:#542b3b;border-color:#9b4b5b}.b2-root .b2-hint{background:#382a2a;color:#efce9a;border:1px solid #755843;border-radius:11px;padding:11px 13px;font-size:12px;margin:14px 0}.b2-root .b2-success{background:#173c30;color:#b5efd0;border:1px solid #367957;border-radius:11px;padding:12px 14px;font-size:13px;margin:15px 0}.b2-root .b2-error{background:#522737;color:#ffd2d4;border:1px solid #a44b60;border-radius:11px;padding:12px 14px;font-size:13px;margin:15px 0}.b2-root .b2-form{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.b2-root .b2-field{display:grid;gap:7px;color:#e8d5e1;font-size:12px;font-weight:800}.b2-root input,.b2-root select{width:100%;border-radius:10px;padding:10px 11px;border:1px solid #6b516b;background:#17111d;color:white;min-width:0}.b2-root input[type=checkbox]{width:auto}.b2-root select option{background:#201824;color:white}.b2-root .b2-table-scroll{overflow-x:auto}.b2-root table{width:100%;border-collapse:collapse;min-width:540px}.b2-root th{color:#bba5b8;text-align:left;text-transform:uppercase;letter-spacing:.08em;font-size:11px;padding:12px 9px;border-bottom:1px solid #4d3849}.b2-root td{padding:12px 9px;border-bottom:1px solid #453444;font-size:13px}.b2-root td input{max-width:100px}.b2-root .b2-topline{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px}.b2-root .b2-chips{display:flex;flex-wrap:wrap;gap:8px;margin:15px 0}.b2-root .b2-chip{border:1px solid #65465a;padding:8px 11px;border-radius:11px;font-size:12px;font-weight:800;background:#352537}.b2-root .b2-chip[aria-pressed=true]{background:#7d3049;color:white}@media(max-width:1000px){.b2-root .b2-shell{display:block}.b2-root .b2-side{padding:12px;border-right:0;border-bottom:1px solid #4d374b}.b2-root .b2-logo{padding-bottom:8px}.b2-root .b2-menu{display:flex;gap:4px;overflow-x:auto}.b2-root .b2-nav{width:auto;white-space:nowrap;padding:9px}.b2-root .b2-main{padding:17px}.b2-root .b2-split{grid-template-columns:1fr}}@media(max-width:600px){.b2-root .b2-grid,.b2-root .b2-actions,.b2-root .b2-form{grid-template-columns:1fr}.b2-root .b2-card{padding:15px}}'}
{beta2ContrastCSS}
{beta2CadastroCSS}
</style>
<div className="b2-shell"><aside className="b2-side"><div className="b2-logo">✦ DITADO POPULAR<small>GORJETA PRO · BETA 2</small></div><nav className="b2-menu">{menu.map(m=><button key={m.v} className="b2-nav" aria-current={view===m.v?'page':undefined} onClick={()=>go(m.v)}><m.icon size={17}/>{m.n}</button>)}</nav><div className="b2-hint">Cadastros: dados oficiais compartilhados. Inventário, recebimento, abastecimento e demais operações: simulação isolada.</div></aside>
<main className="b2-main"><div className="b2-head"><span className="b2-tag">● ESTOQUE BETA 2</span><span className="b2-muted" style={{fontSize:12}}>
{(['itens','fichas','fornecedores','estoques'] as View[]).includes(view)
  ? 'CADASTRO OFICIAL · GRAVA NO SISTEMA REAL'
  : 'OPERAÇÃO DEMONSTRATIVA · DADOS SIMULADOS'}
</span></div>
{view==='inicio'&&<RotinaEstoquistaBeta2
 go={v=>go(v)} nightReviewed={nightReviewed}
 onNightReviewed={()=>{setNightReviewed(true);setNotice('Retiradas noturnas revisadas apenas nesta simulação.');}}
 nightCount={night.length} received={received} countSent={countSent}
 countApproved={countApproved} differenceCount={differences.length}
 sectorsDone={sectors.filter(x=>x.status==='concluido').length}
 sectorsTotal={sectors.length}
 sectorsStarted={sectors.some(x=>x.status!=='pendente')}
 kitDone={kitDone} handoffDone={handoffDone}
 onHandoff={()=>{setHandoffDone(true);setNotice('Rotina concluída somente na simulação, sem alterar o estoque oficial.');}}
/>}

{(['itens','fichas','estoques','fornecedores'] as View[]).includes(view) && <CadastrosBeta2 view={view as Cadastro} onNavigate={v=>go(v)}/>}
{view==='inventario'&&<><p className="b2-eyebrow">Posição e contagem</p><h1>Inventário</h1><p className="b2-lead">Contagem do Central com avaliação de divergências por Cristiano.</p><div className="b2-card"><div className="b2-topline"><h2>Contagem por endereço</h2><span className="b2-pill">{countApproved?'Aprovado':countSent?'Aguardando Cristiano':'Em andamento'}</span></div><div className="b2-table-scroll"><table><thead><tr><th>Item</th><th>Local</th><th>Teórico</th><th>Físico</th><th>Diferença</th></tr></thead><tbody>{products.map(p=>{const fisico=count[p.id]??p.central,diff=fisico-p.central;return <tr key={p.id}><td>{p.nome}</td><td>{p.endereco}</td><td>{num(p.central)}</td><td><input type="number" min="0" value={fisico} disabled={countSent} onChange={e=>setCount(c=>({...c,[p.id]:Number(e.target.value)}))}/></td><td><span className={'b2-pill '+(diff?'red':'green')}>{num(diff)}</span></td></tr>})}</tbody></table></div><div style={{marginTop:18}}>{countSent?<button className="b2-btn alt" onClick={()=>go('gestao')}>Ver fila do Cristiano →</button>:<button className="b2-btn" onClick={()=>{setCountSent(true);setNotice('Contagem enviada apenas nesta simulação.')}}>Enviar contagem →</button>}</div></div></>}
{view==='recebimento'&&<><p className="b2-eyebrow">Compras e entradas</p><h1>Recebimento de mercadoria</h1><p className="b2-lead">Pedido versus recebido, nota, fornecedor, custo e divergências.</p><div className="b2-grid"><div className="b2-card"><div className="b2-eyebrow">Itens na nota</div><div className="b2-stat">{lines.length}</div></div><div className="b2-card"><div className="b2-eyebrow">Divergências</div><div className="b2-stat">{lines.filter(l=>l.pedido!==l.recebido).length}</div></div><div className="b2-card"><div className="b2-eyebrow">Valor recebido</div><div className="b2-stat" style={{fontSize:24}}>{money(lines.reduce((a,l)=>a+l.recebido*l.custo,0))}</div></div></div><section className="b2-section b2-card"><h2>1 · Nota e fornecedor</h2><div className="b2-form"><label className="b2-field">Fornecedor<select>{suppliers.map(s=><option key={s.id}>{s.nome}</option>)}</select></label><label className="b2-field">Número da nota<input defaultValue="NF-DEMO-001"/></label><label className="b2-field">Destino<select><option>Estoque Central</option><option>Bar</option><option>Cozinha</option></select></label><label className="b2-field">Data<input type="date" defaultValue="2026-09-22"/></label></div></section><section className="b2-section b2-card"><h2>2 · Conferir linha por linha</h2><div className="b2-table-scroll"><table><thead><tr><th>Produto</th><th>Pedido</th><th>Recebido</th><th>Preço</th><th>Validade</th><th>Status</th></tr></thead><tbody>{lines.map(l=><tr key={l.id}><td>{l.produto}</td><td>{l.pedido}</td><td><input type="number" min="0" disabled={received} value={l.recebido} onChange={e=>setLines(a=>a.map(x=>x.id===l.id?{...x,recebido:Number(e.target.value)}:x))}/></td><td>{money(l.custo)}</td><td><input type="date" disabled={received}/></td><td><span className={'b2-pill '+(l.pedido===l.recebido?'green':'red')}>{l.pedido===l.recebido?'Conforme':'Divergência'}</span></td></tr>)}</tbody></table></div><button className="b2-btn green" style={{marginTop:18}} disabled={received} onClick={()=>{setReceived(true);setNotice('Recebimento confirmado apenas na simulação.')}}>{received?'✓ Recebimento concluído':'Confirmar recebimento simulado'}</button></section></>}
{view==='abastecimento'&&<><p className="b2-eyebrow">Operação diária</p><h1>Abastecimento</h1><p className="b2-lead">Confira o setor, separe a diferença e confirme a entrega.</p><div className="b2-chips">{sectors.map(s=><button key={s.id} className="b2-chip" aria-pressed={s.id===sectorId} onClick={()=>setSectorId(s.id)}>{s.nome}</button>)}</div><div className="b2-card"><div className="b2-topline"><h2>{sector.nome}</h2><span className="b2-pill">{sector.status}</span></div><p className="b2-muted">{sector.encarregado}</p><div className="b2-table-scroll"><table><thead><tr><th>Item</th><th>Referência</th><th>Tem</th><th>Repor</th></tr></thead><tbody>{sector.itens.map((i,idx)=><tr key={i.nome}><td>{i.nome}<small style={{display:'block'}}>{i.unidade}</small></td><td>{i.alvo}</td><td><input type="number" min="0" disabled={sector.status==='concluido'} value={i.atual} onChange={e=>setSectors(s=>s.map(sec=>sec.id===sectorId?{...sec,itens:sec.itens.map((it,j)=>j===idx?{...it,atual:Number(e.target.value)}:it)}:sec))}/></td><td>{num(Math.max(0,i.alvo-i.atual))}</td></tr>)}</tbody></table></div>{sector.status!=='concluido'&&<button className="b2-btn" style={{marginTop:18}} onClick={()=>setSectors(s=>s.map(sec=>sec.id===sectorId?{...sec,status:sec.status==='pendente'?'separado':'concluido',itens:sec.status==='separado'?sec.itens.map(i=>({...i,atual:i.alvo})):sec.itens}:sec))}>{sector.status==='pendente'?'Marcar separado →':'Confirmar recebimento →'}</button>}</div></>}
{view==='kits'&&<><p className="b2-eyebrow">Consumo interno</p><h1>Kit compartilhado da limpeza</h1><p className="b2-lead">Armário único para equipe diurna e noturna; produtos químicos separados dos itens de contato alimentar.</p><div className="b2-card"><h2>Reposição ilustrativa</h2>{['Perflex · 10 unidades','Papel toalha · 8 pacotes','Detergente · 4 frascos','Saco de lixo · 20 unidades'].map(x=><div className="b2-row" key={x}><strong>{x}</strong><span className="b2-pill">Referência</span></div>)}<button className="b2-btn" style={{marginTop:18}} disabled={kitDone} onClick={()=>{setKitDone(true);setNotice('Kit reposto na simulação.')}}>{kitDone?'✓ Reposição concluída':'Confirmar kit reposto'}</button></div></>}
{view==='noite'&&<><p className="b2-eyebrow">Sem estoquista noturno</p><h1>Retirada excepcional</h1><p className="b2-lead">Registre responsável, motivo e quantidade para conciliação no dia seguinte.</p><div className="b2-split"><div className="b2-card"><h2>Nova retirada</h2><div style={{display:'grid',gap:12}}>{field('Produto',nightProduct,setNightProduct,['Stella Pure Gold 600 ml','Original 600 ml','Gelo ensacado','Bolinho pronto','Barril de chopp 50 L'])}{field('Quantidade',nightQty,v=>setNightQty(Number(v)))}{field('Motivo',nightReason,setNightReason,['Reposição emergencial','Troca de barril','Demanda inesperada','Produção'])}<button className="b2-btn" onClick={()=>{if(nightQty<=0){setError('Quantidade precisa ser positiva.');return}setNight(n=>[{produto:nightProduct,quantidade:nightQty,motivo:nightReason},...n]);setNotice('Ocorrência registrada na simulação.')}}>Registrar ocorrência</button></div></div><div className="b2-card"><h2>Ocorrências</h2>{night.length?night.map((n,i)=><div className="b2-row" key={i}><div><strong>{n.produto} · {n.quantidade}</strong><small>{n.motivo}</small></div><span className="b2-pill">A conciliar</span></div>):<p className="b2-muted">Nenhuma retirada na simulação.</p>}</div></div></>}
{view==='gestao'&&<><p className="b2-eyebrow">Gestor · Cristiano</p><h1>Aprovação de divergências</h1><p className="b2-lead">Contagem não deve ajustar saldos sem aprovação do gestor.</p><div className="b2-card"><h2>Fila de aprovação</h2>{!countSent?<p className="b2-hint">Envie uma contagem em Inventário para testar.</p>:countApproved?<p className="b2-success">Aprovação simulada concluída, sem ajuste real.</p>:differences.length?<>{differences.map(p=><div className="b2-row" key={p.id}><div><strong>{p.nome}</strong><small>Teórico {p.central} · físico {count[p.id]??p.central}</small></div><span className="b2-pill red">{num((count[p.id]??p.central)-p.central)}</span></div>)}<button className="b2-btn" style={{marginTop:16}} onClick={()=>{setCountApproved(true);setNotice('Aprovado somente na simulação.')}}>Aprovar na simulação</button></>:<p className="b2-success">Contagem sem diferenças.</p>}</div></>}
{error&&<p className="b2-error">{error}</p>}{notice&&<p className="b2-success">✓ {notice}</p>}
<div className="b2-section b2-muted" style={{borderTop:'1px solid #4d3849',paddingTop:15,fontSize:12,display:'flex',justifyContent:'space-between',gap:12,flexWrap:'wrap'}}><span>Estoque Beta 2 · Cadastros originais compartilhados · Operações em simulação, sem alterar saldos reais.</span><button className="b2-btn alt small" onClick={reset}><RotateCcw size={13} style={{display:'inline',marginRight:5}}/>Reiniciar testes operacionais</button></div>
</main></div></div>;
};
export default EstoqueBeta2;
