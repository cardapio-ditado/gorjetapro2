import React, { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { ArrowRight, BookOpen, Check, CheckCircle2, Edit3, Package, Plus, RefreshCw, Search, Users, Warehouse, X } from 'lucide-react';

const OriginalFichasEditor = lazy(() => import('../inventory/FichasTecnicas'));
export type Cadastro = 'itens' | 'fichas' | 'estoques' | 'fornecedores';
type Row = { id:string; nome:string; [key:string]:any };
const metadata:Record<Cadastro,{title:string;singular:string;table:string;desc:string;icon:React.ElementType}>={
  itens:{title:'Cadastro de itens',singular:'item',table:'itens_estoque',desc:'Todos os produtos e insumos do Gorjeta Pro, com custo, grupo de contagem e fornecedor padrão.',icon:Package},
  fichas:{title:'Fichas técnicas',singular:'ficha',table:'fichas_tecnicas',desc:'Receitas e preparações originais, com custo e ingredientes compartilhados.',icon:BookOpen},
  estoques:{title:'Cadastro de estoques',singular:'estoque',table:'estoques',desc:'Os mesmos locais de saldo utilizados pelo Estoque Central, Bar, Cozinha e Produção.',icon:Warehouse},
  fornecedores:{title:'Fornecedores',singular:'fornecedor',table:'fornecedores',desc:'Cadastro único compartilhado com Financeiro e Compras.',icon:Users},
};
const days=[{id:1,txt:'Seg'},{id:2,txt:'Ter'},{id:3,txt:'Qua'},{id:4,txt:'Qui'},{id:5,txt:'Sex'},{id:6,txt:'Sáb'},{id:7,txt:'Dom'}];
const fmt=(n:unknown)=>Number(n||0).toLocaleString('pt-BR',{maximumFractionDigits:3});
const brl=(n:unknown)=>Number(n||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const ativo=(v:Cadastro,r:Row)=>v==='fichas'?r.ativo!==false:v==='estoques'?r.status!==false:r.status!=='inativo';
const newRow=(v:Cadastro):Row=>{
  if(v==='itens')return {id:'',nome:'',codigo:'',descricao:'',tipo_item:'insumo',categoria:'Geral',unidade_medida:'unidade',custo_medio:0,ponto_reposicao:0,estoque_nativo_id:'',tipo_compra:'ambos',fornecedor_padrao_id:'',grupo_contagem:'outros',tem_validade:false,entra_no_cmv:true,ignorar_contagem:false,status:'ativo',observacoes:''};
  if(v==='estoques')return {id:'',nome:'',descricao:'',localizacao:'',tipo:'geral',status:true};
  return {id:'',nome:'',cnpj:'',telefone:'',email:'',responsavel:'',endereco:'',observacoes:'',modalidade:'entrega',tipo:'geral',categoria_padrao_id:'',status:'ativo',ciclo_compra_dias:'',dias_compra:[]};
};
async function getAll(table:string):Promise<Row[]>{
 const result:Row[]=[];
 for(let start=0;start<10000;start+=500){
  const {data,error}=await supabase.from(table).select('*').order('nome',{ascending:true}).range(start,start+499);
  if(error)throw error;
  result.push(...(data||[]) as Row[]);
  if(!data||data.length<500)break;
 }
 return result;
}
interface Props{view:Cadastro;onNavigate:(v:Cadastro)=>void}
const CadastrosBeta2:React.FC<Props>=({view,onNavigate})=>{
 const config=metadata[view];const Icon=config.icon;
 const[rows,setRows]=useState<Row[]>([]);
 const[vendors,setVendors]=useState<Row[]>([]);
 const[stocks,setStocks]=useState<Row[]>([]);
 const[cats,setCats]=useState<Row[]>([]);
 const[search,setSearch]=useState('');
 const[filter,setFilter]=useState<'todos'|'ativos'|'inativos'>('todos');
 const[selected,setSelected]=useState('');
 const[draft,setDraft]=useState<Row|null>(null);
 const[weekdays,setWeekdays]=useState<number[]>([]);
 const[error,setError]=useState('');
 const[notice,setNotice]=useState('');
 const[loading,setLoading]=useState(true);
 const[busy,setBusy]=useState(false);
 const[page,setPage]=useState(0);
 const[editorOpen,setEditorOpen]=useState(false);
 const reload=useCallback(async()=>{
  setLoading(true);setError('');
  try{
   const list=await getAll(metadata[view].table);
   setRows(list);setSelected(p=>list.some(x=>x.id===p)?p:(list[0]?.id||''));
   if(view==='itens'){
    const[v,s]=await Promise.all([
      supabase.from('fornecedores').select('id,nome').eq('status','ativo').order('nome'),
      supabase.from('estoques').select('id,nome').eq('status',true).order('nome')
    ]);
    if(v.error)throw v.error;if(s.error)throw s.error;
    setVendors((v.data||[]) as Row[]);setStocks((s.data||[]) as Row[]);
   }
   if(view==='fornecedores'){
    const{data,error:e}=await supabase.from('vw_categoria_tree').select('id,nome,caminho_completo').eq('tipo','despesa').eq('status','ativo');
    if(e)throw e;setCats((data||[]) as Row[]);
   }
  }catch(e){setError(e instanceof Error?e.message:'Falha ao carregar o cadastro oficial.');}
  finally{setLoading(false);}
 },[view]);
 useEffect(()=>{setDraft(null);setSearch('');setFilter('todos');setPage(0);setEditorOpen(false);setNotice('');void reload();},[reload]);
 const filtered=useMemo(()=>rows.filter(r=>{
   const term=search.toLocaleLowerCase('pt-BR').trim();
   const text=[r.nome,r.codigo,r.categoria,r.cnpj,r.localizacao].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
   return (!term||text.includes(term))&&(filter==='todos'||(filter==='ativos'?ativo(view,r):!ativo(view,r)));
 }),[rows,view,search,filter]);
 const record=rows.find(r=>r.id===selected)||rows[0];
 const maxPage=Math.max(1,Math.ceil(filtered.length/35));
 const show=filtered.slice(page*35,page*35+35);
 const edit=(row?:Row)=>{
   const current=row?{...row}:newRow(view);
   if(view==='itens')current.ponto_reposicao=Number(current.ponto_reposicao??current.estoque_minimo??0);
   setDraft(current);setWeekdays(Array.isArray(current.dias_compra)?current.dias_compra.map(Number):[]);
   setNotice('');setError('');setEditorOpen(false);
 };
 const set=(key:string,v:unknown)=>setDraft(p=>p?{...p,[key]:v}:null);
 const field=(key:string,label:string,type='text',wide=false)=><label className={'b2-field'+(wide?' b2-wide':'')} key={key}>
   <span>{label}</span><input type={type} value={String(draft?.[key]??'')} min={type==='number'?'0':undefined} step={type==='number'?'any':undefined}
   onChange={e=>set(key,type==='number'?(e.target.value===''?'':Number(e.target.value)):e.target.value)}/></label>;
 const sel=(key:string,label:string,opts:{value:string;label:string}[])=><label className="b2-field" key={key}><span>{label}</span>
   <select value={String(draft?.[key]??'')} onChange={e=>set(key,e.target.value)}>{opts.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select></label>;
 const listOpts=(choices:string[])=>choices.map(s=>({value:s,label:s}));
 const check=(key:string,label:string)=><label className="b2-check" key={key}><input type="checkbox" checked={draft?.[key]===true} onChange={e=>set(key,e.target.checked)}/><span>{label}</span></label>;
 const save=async(ev:React.FormEvent)=>{
  ev.preventDefault();if(!draft||view==='fichas')return;
  const name=String(draft.nome||'').trim();
  if(!name){setError('Informe o nome.');return;}
  const duplicate=rows.some(x=>x.id!==draft.id&&x.nome.trim().toLocaleLowerCase('pt-BR')===name.toLocaleLowerCase('pt-BR'));
  if(duplicate){setError('Já existe um cadastro com esse nome.');return;}
  if(view==='itens'&&!draft.unidade_medida){setError('Escolha a unidade de medida.');return;}
  if(view==='itens'&&draft.codigo&&rows.some(x=>x.id!==draft.id&&x.codigo&&String(x.codigo).toLowerCase()===String(draft.codigo).toLowerCase())){setError('Código de item já cadastrado.');return;}
  if(view==='fornecedores'&&draft.cnpj&&rows.some(x=>x.id!==draft.id&&x.cnpj&&String(x.cnpj).replace(/\D/g,'')===String(draft.cnpj).replace(/\D/g,''))){setError('CNPJ já cadastrado.');return;}
  setBusy(true);setError('');
  try{
   let payload:Record<string,unknown>;
   if(view==='itens'){
    const keys=['nome','codigo','descricao','tipo_item','categoria','unidade_medida','custo_medio','tem_validade','observacoes','status','estoque_nativo_id','tipo_compra','fornecedor_padrao_id','grupo_contagem','ignorar_contagem','entra_no_cmv'];
    payload=Object.fromEntries(keys.map(k=>[k,draft[k]??null]));
    const ponto=Number(draft.ponto_reposicao??0);
    if(!Number.isFinite(ponto)||ponto<0)throw Error('Ponto de pedido deve ser zero ou positivo.');
    payload.estoque_minimo=ponto;payload.ponto_reposicao=ponto;payload.minimo_manual=true;
    payload.custo_medio=Number(draft.custo_medio)||0;
    payload.estoque_nativo_id=draft.estoque_nativo_id||null;
    payload.fornecedor_padrao_id=draft.fornecedor_padrao_id||null;
   }else if(view==='estoques'){
    payload={nome:name,descricao:draft.descricao||'',localizacao:draft.localizacao||'',tipo:draft.tipo||'geral',status:draft.status!==false&&draft.status!=='false'};
   }else{
    const cycle=draft.ciclo_compra_dias===''||draft.ciclo_compra_dias==null?null:Number(draft.ciclo_compra_dias);
    if(cycle!==null&&(!Number.isInteger(cycle)||cycle<1))throw Error('Ciclo deve ser um número inteiro positivo.');
    payload={nome:name,cnpj:draft.cnpj||null,telefone:draft.telefone||null,email:draft.email||null,responsavel:draft.responsavel||null,endereco:draft.endereco||null,observacoes:draft.observacoes||null,
      tipo:draft.tipo||'geral',modalidade:draft.modalidade||'entrega',categoria_padrao_id:draft.categoria_padrao_id||null,
      ciclo_compra_dias:cycle,dias_compra:weekdays.length?weekdays:null,status:draft.status||'ativo'};
   }
   let savedId=draft.id;
   if(draft.id){
     const {error:e}=await supabase.from(config.table)
       .update({...payload,atualizado_em:new Date().toISOString()}).eq('id',draft.id);
     if(e)throw e;
   }else{
     const {data:created,error:e}=await supabase.from(config.table).insert([payload]).select('id').single();
     if(e)throw e;
     savedId=created?.id||'';
   }
   setDraft(null);setSearch('');setFilter('todos');setPage(0);
   setNotice('Cadastro oficial salvo. A alteração aparece também no módulo original.');
   await reload();if(savedId)setSelected(savedId);
  }catch(e){setError(e instanceof Error?e.message:'Não foi possível salvar o cadastro.');}
  finally{setBusy(false);}
 };
 return <div className="b2-catalog">
   <div className="b2-catalog-top"><div><p className="b2-eyebrow">Cadastros · base compartilhada</p><h1>{config.title}</h1><p className="b2-lead">{config.desc}</p></div><span className="b2-pill green">● DADOS REAIS</span></div>
   <div className="b2-catalog-notice"><CheckCircle2 size={19}/><div><strong>O cadastro é o mesmo do Gorjeta Pro.</strong><p>Layout novo, registros originais. Qualquer inclusão ou edição aqui é real; inventário e transferências de teste continuam separados.</p></div></div>
   <div className="b2-grid" style={{marginBottom:15}}>
     <div className="b2-card"><div className="b2-eyebrow">Registros</div><div className="b2-stat">{loading?'—':rows.length}</div></div>
     <div className="b2-card"><div className="b2-eyebrow">Ativos</div><div className="b2-stat">{loading?'—':rows.filter(r=>ativo(view,r)).length}</div></div>
     <div className="b2-card"><div className="b2-eyebrow">Inativos</div><div className="b2-stat">{loading?'—':rows.filter(r=>!ativo(view,r)).length}</div></div>
   </div>
   {error&&<div className="b2-error">{error}</div>}{notice&&<div className="b2-success">✓ {notice}</div>}
   <div className="b2-catalog-columns">
     <div className="b2-card">
       <div className="b2-topline"><h2>{view==='fichas'?'Receitas cadastradas':'Catálogo de '+config.singular}</h2>
         {view==='fichas'?<button className="b2-btn" onClick={()=>setEditorOpen(true)}><Plus size={15}/>Nova ficha</button>:<button className="b2-btn" onClick={()=>edit()}><Plus size={15}/>Novo {config.singular}</button>}
       </div>
       <div className="b2-search"><Search size={18}/><input value={search} onChange={e=>{setSearch(e.target.value);setPage(0)}} placeholder={view==='itens'?'Nome, código ou categoria...':'Buscar '+config.singular+'...'} aria-label="Pesquisar cadastro"/></div>
       <div className="b2-chips">{(['todos','ativos','inativos'] as const).map(f=><button className="b2-chip" aria-pressed={filter===f} key={f} onClick={()=>{setFilter(f);setPage(0)}}>{f==='todos'?'Todos':f==='ativos'?'Ativos':'Inativos'}</button>)}
         <button className="b2-chip" onClick={()=>void reload()}><RefreshCw size={14}/> Atualizar</button>
       </div>
       {loading?<div className="b2-hint">Carregando dados oficiais...</div>:show.length===0?<div className="b2-hint">Nenhum registro encontrado.</div>:<div className="b2-catalog-list">
       {show.map(r=><button key={r.id} className={'b2-catalog-row'+(record?.id===r.id&&!draft?' selected':'')} onClick={()=>{setSelected(r.id);setDraft(null);setError('');setNotice('');setEditorOpen(false)}}>
         <span className="b2-catalog-icon"><Icon size={18}/></span><span className="b2-catalog-name"><strong>{r.nome}</strong><small>
         {view==='itens'?[r.codigo,r.categoria].filter(Boolean).join(' · '):view==='fornecedores'?(r.modalidade==='rua'?'Compra de rua':'Entrega')+(r.cnpj?' · '+r.cnpj:''):view==='estoques'?String(r.tipo):String(r.tipo_consumo==='venda_direta'?'Venda direta':'Produção')}
         </small></span><span className={'b2-pill '+(ativo(view,r)?'green':'red')}>{ativo(view,r)?'Ativo':'Inativo'}</span><ArrowRight size={15}/></button>)}
       </div>}
       <div className="b2-catalog-pages"><span>{filtered.length} registros · {page+1}/{maxPage}</span><div><button className="b2-btn alt small" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Anterior</button><button className="b2-btn alt small" disabled={page+1>=maxPage} onClick={()=>setPage(p=>p+1)}>Próxima</button></div></div>
     </div>
     <div className="b2-card b2-catalog-detail">
       {draft?<><div className="b2-topline"><div><p className="b2-eyebrow">Edição no cadastro real</p><h2>{draft.id?'Editar':'Novo'} {config.singular}</h2></div><button className="b2-btn alt small" onClick={()=>{setDraft(null);setError('')}}><X size={14}/> Cancelar</button></div>
       <div className="b2-hint">A ficha será salva no mesmo banco do módulo original.</div><form onSubmit={save}><div className="b2-form">
         {field('nome','Nome *','text',true)}
         {view==='itens'&&<>
           {field('codigo','Código / SKU')}
           {field('categoria','Categoria')}
           {sel('tipo_item','Tipo',[{value:'insumo',label:'Insumo'},{value:'produto_final',label:'Produto final'}])}
           {sel('unidade_medida','Unidade de medida',listOpts(['unidade','kg','g','litro','ml','pacote','caixa','garrafa','lata','fardo','dúzia']))}
           {field('custo_medio','Custo médio (R$)','number')}
           {field('ponto_reposicao','Ponto de pedido no Central','number')}
           {sel('estoque_nativo_id','Estoque nativo',[{value:'',label:'Sem estoque nativo'},...stocks.map(s=>({value:s.id,label:s.nome}))])}
           {sel('tipo_compra','Tipo de compra',[{value:'ambos',label:'Ambos'},{value:'fornecedor',label:'Fornecedor'},{value:'rua',label:'Rua / Feira'}])}
           {sel('fornecedor_padrao_id','Fornecedor padrão',[{value:'',label:'Nenhum'},...vendors.map(s=>({value:s.id,label:s.nome}))])}
           <button className="b2-btn alt small" type="button" onClick={()=>{if(window.confirm('Você ainda não salvou a ficha do item. Sair agora descarta o preenchimento. Abrir Fornecedores?'))onNavigate('fornecedores')}}>+ Cadastrar fornecedor →</button>
           {sel('grupo_contagem','Grupo de contagem',listOpts(['bebidas','alimentos','hortifruti','estoque_seco','estoque_central','outros']))}
           {field('descricao','Descrição','text',true)}
           {field('observacoes','Observações','text',true)}
           <div className="b2-wide b2-checks">{check('tem_validade','Tem validade')}{check('entra_no_cmv','Entra no CMV')}{check('ignorar_contagem','Ignorar contagem')}</div>
           {sel('status','Status',[{value:'ativo',label:'Ativo'},{value:'inativo',label:'Inativo'}])}
         </>}
         {view==='estoques'&&<>
           {sel('tipo','Tipo de estoque',[{value:'central',label:'Central'},{value:'producao',label:'Produção'},{value:'secundario',label:'Secundário'},{value:'geral',label:'Geral'}])}
           {field('localizacao','Localização física')}
           {field('descricao','Descrição / finalidade','text',true)}
           <label className="b2-field"><span>Status</span><select value={draft.status===false?'false':'true'} onChange={e=>set('status',e.target.value==='true')}><option value="true">Ativo</option><option value="false">Inativo</option></select></label>
         </>}
         {view==='fornecedores'&&<>
           {field('cnpj','CNPJ')}{field('telefone','Telefone / WhatsApp')}{field('email','E-mail','email')}{field('responsavel','Responsável')}
           {sel('tipo','Tipo',[{value:'geral',label:'Geral'},{value:'musico',label:'Músico / Artista'},{value:'rh',label:'RH / Colaborador'}])}
           {sel('modalidade','Como compramos',[{value:'entrega',label:'Enviamos pedido e entrega'},{value:'rua',label:'Comprador busca'}])}
           {sel('categoria_padrao_id','Categoria financeira',[{value:'',label:'Nenhuma'},...cats.map(c=>({value:c.id,label:String(c.caminho_completo||c.nome)}))])}
           {field('ciclo_compra_dias','Ciclo de compra (dias)','number')}
           <div className="b2-wide b2-field"><span>Dias de compra · nenhum = qualquer dia</span><div className="b2-chips">{days.map(d=><button type="button" key={d.id} className="b2-chip" aria-pressed={weekdays.includes(d.id)} onClick={()=>setWeekdays(p=>p.includes(d.id)?p.filter(n=>n!==d.id):[...p,d.id].sort())}>{d.txt}</button>)}</div></div>
           {field('endereco','Endereço','text',true)}{field('observacoes','Observações','text',true)}
           {sel('status','Status',[{value:'ativo',label:'Ativo'},{value:'inativo',label:'Inativo'}])}
         </>}
       </div><button type="submit" className="b2-btn b2-catalog-save" disabled={busy}><Check size={15}/>{busy?'Salvando...':'Salvar no cadastro oficial'}</button></form></>
       :record?<><p className="b2-eyebrow">Ficha do {config.singular}</p><h2>{record.nome}</h2><span className={'b2-pill '+(ativo(view,record)?'green':'red')}>{ativo(view,record)?'Ativo':'Inativo'}</span>
       {view==='itens'&&<>
         <div className="b2-row"><div><strong>Código / categoria</strong><small>{record.codigo||'Sem código'} · {record.categoria||'Geral'}</small></div></div>
         <div className="b2-row"><div><strong>Unidade / custo médio</strong><small>{record.unidade_medida} · {brl(record.custo_medio)}</small></div></div>
         <div className="b2-row"><div><strong>Ponto de pedido</strong><small>{fmt(record.ponto_reposicao??record.estoque_minimo)} {record.unidade_medida}</small></div></div>
         <div className="b2-row"><div><strong>Fornecedor padrão</strong><small>{vendors.find(s=>s.id===record.fornecedor_padrao_id)?.nome||'Não definido'}</small></div></div>
         <div className="b2-row"><div><strong>Estoque nativo</strong><small>{stocks.find(s=>s.id===record.estoque_nativo_id)?.nome||'Não definido'}</small></div></div>
         <div className="b2-row"><div><strong>Controle</strong><small>{record.ignorar_contagem?'Ignorar contagem':'Incluir na contagem'} · {record.entra_no_cmv===false?'Fora do CMV':'Entra no CMV'}</small></div></div>
       </>}
       {view==='estoques'&&<>
         <div className="b2-row"><div><strong>Tipo</strong><small>{record.tipo}</small></div></div>
         <div className="b2-row"><div><strong>Localização física</strong><small>{record.localizacao||'A definir'}</small></div></div>
         <div className="b2-row"><div><strong>Finalidade</strong><small>{record.descricao||'Sem descrição'}</small></div></div>
         <div className="b2-hint">Estoque é local de saldo. Freezers, câmaras e prateleiras podem ser endereços internos sem saldo duplicado.</div>
       </>}
       {view==='fornecedores'&&<>
         <div className="b2-row"><div><strong>CNPJ</strong><small>{record.cnpj||'Não informado'}</small></div></div>
         <div className="b2-row"><div><strong>Contato</strong><small>{record.responsavel||'—'} · {record.telefone||'—'}</small></div></div>
         <div className="b2-row"><div><strong>E-mail</strong><small>{record.email||'Não informado'}</small></div></div>
         <div className="b2-row"><div><strong>Modalidade</strong><small>{record.modalidade==='rua'?'Comprador retira':'Pedido com entrega'}</small></div></div>
         <div className="b2-row"><div><strong>Ciclo / dias</strong><small>{record.ciclo_compra_dias?record.ciclo_compra_dias+' dia(s)':'Compra diária'} · {Array.isArray(record.dias_compra)&&record.dias_compra.length?record.dias_compra.map((n:number)=>days.find(d=>d.id===Number(n))?.txt||n).join(' · '):'Qualquer dia'}</small></div></div>
       </>}
       {view==='fichas'&&<>
         <div className="b2-row"><div><strong>Consumo</strong><small>{record.tipo_consumo==='venda_direta'?'Venda direta':'Produção'}</small></div></div>
         <div className="b2-row"><div><strong>Porções / rendimento</strong><small>{fmt(record.porcoes||1)} · {fmt(record.rendimento||1)} {record.unidade_rendimento||'porções'}</small></div></div>
         <div className="b2-row"><div><strong>Custo total</strong><small>Calculado pela ficha oficial</small></div><span className="b2-stat" style={{fontSize:23}}>{brl(record.custo_total)}</span></div>
         {record.modo_preparo&&<div className="b2-row"><div><strong>Modo de preparo</strong><small style={{whiteSpace:'pre-wrap'}}>{record.modo_preparo}</small></div></div>}
         <div className="b2-hint">Para preservar as regras de sub-receitas, ingredientes e custo, a edição completa abre somente quando você solicita.</div>
       </>}
       <button className="b2-btn b2-catalog-save" onClick={()=>view==='fichas'?setEditorOpen(true):edit(record)}><Edit3 size={15}/>{view==='fichas'?'Gerenciar receitas':'Editar '+config.singular}</button></>
       :<div className="b2-hint">Selecione uma ficha à esquerda.</div>}
     </div>
   </div>
   {view==='fichas'&&editorOpen&&<div className="b2-section b2-card b2-original-editor">
     <div className="b2-topline"><h2>Editor completo de fichas técnicas</h2><button className="b2-btn alt" onClick={()=>{setEditorOpen(false);void reload()}}><X size={15}/> Fechar editor</button></div>
     <p className="b2-lead">Aberto apenas para editar ingredientes, sub-receitas e custos com as regras já existentes.</p>
     <Suspense fallback={<div className="b2-hint">Carregando editor técnico...</div>}><OriginalFichasEditor/></Suspense>
   </div>}
 </div>;
};
export default CadastrosBeta2;
