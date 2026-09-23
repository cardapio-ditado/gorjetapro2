import React, { useEffect, useMemo, useState } from 'react';
import { ArrowRight, CheckCircle2, ChevronDown, Link2, Plus, RefreshCw, Search, Trash2, Warehouse, X } from 'lucide-react';
import PesquisaItemBeta2 from './PesquisaItemBeta2';
import {
 type ItemDoSetor,type MapZig,
 useControleZigBeta2,keyOf,fmt3
} from './FechamentoDadosBeta2';
import './OperacoesBeta2.css';
import './FechamentoBeta2.css';
import './GestaoEstoqueBeta2.css';

interface Props{
 dados:ReturnType<typeof useControleZigBeta2>;
 go:(screen:'fechamento'|'reposicao'|'fichas')=>void;
}
type Tab='itens'|'zig';
type TipoVinculo='item'|'ficha'|'ignorar'|'pendente';
const normalize=(s:unknown)=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
const tipo=(m:MapZig):TipoVinculo=>m.ignorar_estoque?'ignorar':m.ficha_tecnica_id?'ficha':m.item_estoque_id?'item':'pendente';

const GestaoEstoqueBeta2:React.FC<Props>=({dados,go})=>{
 const[tab,setTab]=useState<Tab>('itens');
 const[sectorId,setSectorId]=useState('');
 const[itemId,setItemId]=useState('');
 const[buscaItem,setBuscaItem]=useState('');
 const[adicionarAberto,setAdicionarAberto]=useState(false);
 const[buscaAdicionar,setBuscaAdicionar]=useState('');
 const[selecionados,setSelecionados]=useState<string[]>([]);
 const[niveisDigitados,setNiveisDigitados]=useState<Record<string,string>>({});
 const[buscaZig,setBuscaZig]=useState('');
 const[zigFilter,setZigFilter]=useState<'todos'|'pendentes'|'alterados'>('todos');
 const[mapId,setMapId]=useState('');
 const[draft,setDraft]=useState<MapZig|null>(null);
 const[draftType,setDraftType]=useState<TipoVinculo>('pendente');
 const[notice,setNotice]=useState('');
 const[error,setError]=useState('');

 useEffect(()=>{
  if(!dados.setores.length)return;
  if(!sectorId||!dados.setores.some(s=>s.id===sectorId)){
   setSectorId(dados.setores.find(s=>normalize(s.nome)==='bar')?.id||dados.setores[0].id);
  }
 },[dados.setores,sectorId]);
 useEffect(()=>{
  if(!dados.mapeamentos.length||mapId)return;
  setMapId(dados.mapeamentos.find(m=>normalize(m.nome_externo)==='original 600ml')?.id||dados.mapeamentos[0].id);
 },[dados.mapeamentos,mapId]);


 const sector=dados.setores.find(s=>s.id===sectorId);
 const rows=useMemo(()=>dados.linhas.filter(r=>r.estoque_id===sectorId),[dados.linhas,sectorId]);
 const activeItems=useMemo(()=>dados.items.filter(i=>i.status==='ativo'),[dados.items]);
 const inLevels=useMemo(()=>new Set(dados.niveis.filter(n=>n.estoque_id===sectorId).map(n=>n.item_id)),[dados.niveis,sectorId]);
 const catalogo=useMemo(()=>rows.filter(r=>inLevels.has(r.item_id)),[rows,inLevels]);
 const pendentesDeInclusao=useMemo(()=>rows.filter(r=>r.semNivel&&!inLevels.has(r.item_id)),[rows,inLevels]);
 const visiveis=useMemo(()=>catalogo.filter(r=>!buscaItem.trim()||
  normalize([r.item.nome,r.item.codigo,r.item.categoria].join(' ')).includes(normalize(buscaItem))),
  [catalogo,buscaItem]);
 const disponiveis=useMemo(()=>activeItems.filter(i=>!inLevels.has(i.id)
  &&(!buscaAdicionar.trim()||normalize([i.nome,i.codigo,i.categoria].join(' ')).includes(normalize(buscaAdicionar))))
  .sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR')),
  [activeItems,inLevels,buscaAdicionar]);
 const mapForItem=(itemIdToFind:string,origin:string)=>{
  const fichaIds=new Set(dados.ingredientes.filter(x=>x.item_estoque_id===itemIdToFind&&x.baixa_estoque).map(x=>x.ficha_id));
  return dados.mapeamentos.filter(m=>!m.ignorar_estoque&&m.estoque_id===origin
    &&(m.ficha_tecnica_id?fichaIds.has(m.ficha_tecnica_id):m.item_estoque_id===itemIdToFind));
 };
 const applyNivel=(item:ItemDoSetor,raw:string)=>{
  const normalized=raw.trim().replace(',','.');
  if(normalized&&(!Number.isFinite(Number(normalized))||Number(normalized)<0)){
   setError('Informe um nível válido para '+item.item.nome+'.');return;
  }
  const k=keyOf(sectorId,item.item_id);
  dados.setNivelPreview(sectorId,item.item_id,{
   enabled:true,nivel_reposicao:normalized===''?null:Number(normalized),
   controle:item.controle==='venda'||item.mapeadoZig?'venda':'contagem'
  });
  setNiveisDigitados(prev=>{const next={...prev};delete next[k];return next;});
  setError('');setNotice('Nível do '+sector?.nome+' atualizado na prévia.');
 };
 const abrirInclusao=()=>{setAdicionarAberto(true);setBuscaAdicionar('');setSelecionados([]);setError('');};
 const incluirSelecionados=()=>{
  if(!selecionados.length)return;
  for(const id of selecionados){
   const row=rows.find(x=>x.item_id===id);
   dados.setNivelPreview(sectorId,id,{
    enabled:true,nivel_reposicao:null,controle:row?.mapeadoZig?'venda':'contagem'
   });
  }
  const total=selecionados.length;
  setSelecionados([]);setAdicionarAberto(false);setBuscaAdicionar('');
  setNotice(total+' item(ns) adicionado(s) à lista do '+sector?.nome+' nesta prévia. Defina seus níveis de reposição.');
  setError('');
 };
 const removerItem=(item:ItemDoSetor)=>{
  const saldo=dados.saldos[keyOf(sectorId,item.item_id)]||0;
  if(Math.abs(saldo)>0.0001||item.mapeadoZig){
   setError('Não é possível remover '+item.item.nome+' da lista do '+sector?.nome+
    (Math.abs(saldo)>0.0001?' porque ainda tem saldo ('+fmt3(saldo)+').':'')+
    (item.mapeadoZig?' Existem vendas Zig baixando deste estoque.':'')+
    ' Regularize saldo e vínculo Zig antes da remoção.');
   setItemId(item.item_id);
   return;
  }
  if(!window.confirm('Remover '+item.item.nome+' da lista do '+sector?.nome+'? O item continuará no cadastro geral.'))return;
  dados.setNivelPreview(sectorId,item.item_id,{
   enabled:false,nivel_reposicao:null,controle:item.controle==='venda'?'venda':'contagem'
  });
  setItemId(prev=>prev===item.item_id?'':prev);
  setError('');setNotice(item.item.nome+' removido da lista do '+sector?.nome+' apenas na prévia.');
 };
 const selectedMap=dados.mapeamentos.find(m=>m.id===mapId);
 useEffect(()=>{setDraft(selectedMap?{...selectedMap}:null);setDraftType(selectedMap?tipo(selectedMap):'pendente');setError('');},[selectedMap]);
 const itemById=useMemo(()=>new Map(dados.items.map(x=>[x.id,x])),[dados.items]);
 const fichaById=useMemo(()=>new Map(dados.fichas.map(x=>[x.id,x])),[dados.fichas]);
 const stockById=useMemo(()=>new Map(dados.estoques.map(x=>[x.id,x])),[dados.estoques]);
 const ficheIngredients=useMemo(()=>draft?.ficha_tecnica_id?
  dados.ingredientes.filter(i=>i.ficha_id===draft.ficha_tecnica_id&&i.baixa_estoque&&i.item_estoque_id):[],
  [draft?.ficha_tecnica_id,dados.ingredientes]);
 const linksToOriginal=dados.mapeamentos.filter(m=>!m.ignorar_estoque&&
  m.estoque_id===draft?.estoque_id&&m.item_estoque_id===draft?.item_estoque_id&&Boolean(m.item_estoque_id));
 const mappedCount=dados.mapeamentos.filter(m=>!m.ignorar_estoque&&(m.item_estoque_id||m.ficha_tecnica_id)&&m.estoque_id).length;
 const incomplete=dados.mapeamentos.filter(m=>!m.ignorar_estoque&&(!m.estoque_id||(!m.item_estoque_id&&!m.ficha_tecnica_id))).length;
 const zigList=useMemo(()=>dados.mapeamentos.filter(m=>{
  if(zigFilter==='pendentes'&&(m.ignorar_estoque||(m.estoque_id&&(m.item_estoque_id||m.ficha_tecnica_id))))return false;
  if(zigFilter==='alterados'&&!dados.rascunhosZig[m.id])return false;
  return !buscaZig.trim()||normalize([m.nome_externo,m.zig_category,
   stockById.get(m.estoque_id||'')?.nome,
   itemById.get(m.item_estoque_id||'')?.nome,
   fichaById.get(m.ficha_tecnica_id||'')?.nome].join(' ')).includes(normalize(buscaZig));
 }).sort((a,b)=>a.nome_externo.localeCompare(b.nome_externo,'pt-BR')),
 [dados.mapeamentos,dados.rascunhosZig,zigFilter,buscaZig,stockById,itemById,fichaById]);

 const chooseKind=(v:TipoVinculo)=>{
  if(!draft)return;
  setDraftType(v);
  setDraft({...draft,ignorar_estoque:v==='ignorar',
   item_estoque_id:v==='item'?draft.item_estoque_id:null,
   ficha_tecnica_id:v==='ficha'?draft.ficha_tecnica_id:null,
   estoque_id:v==='ignorar'?null:draft.estoque_id});
  setError('');
 };
 const chooseMap=(m:MapZig)=>{
  setMapId(m.id);
  setNotice('');setError('');
 };
 const saveMap=()=>{
  setNotice('');setError('');
  if(!draft)return;
  if(!draft.ignorar_estoque){
   if(!draft.estoque_id||!stockById.get(draft.estoque_id)?.status){
    setError('Escolha um estoque de origem ativo para esta venda Zig.');return;
   }
   if(Boolean(draft.item_estoque_id)===Boolean(draft.ficha_tecnica_id)){
    setError('Escolha exatamente um vínculo: item direto OU ficha técnica.');return;
   }
   if(draft.item_estoque_id&&!activeItems.some(i=>i.id===draft.item_estoque_id)){
    setError('Selecione um item de estoque ativo.');return;
   }
   if(draft.ficha_tecnica_id){
    if(!dados.fichas.some(f=>f.id===draft.ficha_tecnica_id&&f.ativo!==false)){
     setError('Selecione uma ficha técnica ativa.');return;
    }
    if(!ficheIngredients.length){setError('A ficha escolhida não tem ingredientes marcados para baixa no estoque. Revise a ficha antes de vincular a Zig.');return;}
   }
  }
  dados.setMapeamentoPreview(draft);
  setNotice('Vínculo aplicado SOMENTE no Beta 2. A Zig real das 6h continua usando o mapeamento oficial.');
 };
 const jumpMap=(id:string)=>{
  setTab('zig');setMapId(id);setBuscaZig('');setZigFilter('todos');setNotice('');setError('');
 };

 if(dados.loading)return <div className="b2-card">Carregando os estoques, produtos e vínculos Zig do sistema antigo...</div>;
 if(dados.error)return <div className="b2-error">{dados.error}
  <button className="b2-btn alt small" type="button" onClick={dados.refresh}>Tentar novamente</button></div>;

 return <div className="b2-manage">
  <p className="b2-eyebrow">GESTÃO · ESTOQUE BETA 2</p>
  <h1>Gestão do Estoque</h1>
  <p className="b2-lead">Defina o que pertence a cada estoque e como cada produto da Zig deve baixar. O mesmo item pode ter saldo no Central e no Bar; a origem da venda é definida separadamente.</p>
  <div className="b2-hint"><strong>Prévia conectada aos cadastros existentes:</strong> consulta os itens, níveis e vínculos reais. As mudanças feitas abaixo valem para as telas de fechamento e reposição nesta sessão, mas <strong>não são gravadas na base oficial</strong> e não mudam a Zig das 6h.</div>
  <div className="b2-manage-stats">
   <div className="b2-card"><small>Produtos Zig</small><strong>{dados.mapeamentos.length}</strong><span>Mapeamentos existentes</span></div>
   <div className="b2-card"><small>Vínculos completos</small><strong>{mappedCount}</strong><span>Direto ou por ficha + origem</span></div>
   <div className="b2-card"><small>Precisam de vínculo</small><strong>{incomplete}</strong><span>Falta item/ficha ou estoque</span></div>
   <div className="b2-card"><small>Rascunhos no Beta 2</small><strong>{Object.keys(dados.rascunhosZig).length+Object.keys(dados.niveisRascunho).length}</strong><span>Sem gravar no banco</span></div>
  </div>
  <div className="b2-op-tabs" role="tablist" aria-label="Gestão do Estoque">
   <button className="b2-op-tab" type="button" role="tab" aria-selected={tab==='itens'} aria-pressed={tab==='itens'} onClick={()=>{setTab('itens');setNotice('');setError('')}}><Warehouse size={15}/> Itens por estoque</button>
   <button className="b2-op-tab" type="button" role="tab" aria-selected={tab==='zig'} aria-pressed={tab==='zig'} onClick={()=>{setTab('zig');setNotice('');setError('')}}><Link2 size={15}/> Vínculos de venda Zig</button>
  </div>

  {tab==='itens'&&<>
   {notice&&<div className="b2-success" role="status"><CheckCircle2 size={16}/> {notice}</div>}
   {error&&<div className="b2-error" role="alert">{error}</div>}
   <div className="b2-manage-section">
    <div className="b2-op-section-title"><h2>1 · Onde o produto fica?</h2><span className="b2-pill">{sector?.nome||'Escolha o estoque'}</span></div>
    <p className="b2-op-help">A lista vem de <strong>itens_estoque_niveis</strong> e dos produtos com saldo no setor. Adicionar um item a um setor não movimenta mercadoria; isso é feito por transferência.</p>
    <div className="b2-manage-toolbar">
     <label className="b2-field"><span>Estoque / setor</span>
      <select value={sectorId} onChange={e=>{setSectorId(e.target.value);setNotice('');setError('')}}>
       {dados.setores.map(e=><option key={e.id} value={e.id}>{e.nome}</option>)}
      </select>
     </label>
     <label className="b2-history-search"><Search size={15}/><input value={buscaItem} onChange={e=>setBuscaItem(e.target.value)} placeholder="Buscar produto por nome, código ou categoria"/></label>
     <label className="b2-manage-toggle"><input type="checkbox" checked={apenasSetor} onChange={e=>setApenasSetor(e.target.checked)}/> Só itens deste setor</label>
    </div>
    <div className="b2-manage-layout">
     <section className="b2-card b2-manage-list">
      <div className="b2-manage-list-head"><strong>{list.length} itens</strong><small>Selecione para configurar</small></div>
      {list.slice(0,220).map(i=>{
       const curr=rowById.get(i.id);
       const configured=inLevels.has(i.id);
       return <button type="button" key={i.id} aria-pressed={itemId===i.id}
        className={'b2-manage-item'+(itemId===i.id?' active':'')} onClick={()=>{setItemId(i.id);setNotice('');setError('')}}>
        <span className="b2-manage-item-info"><strong>{i.nome}</strong><small>{[i.codigo,i.unidade_medida].filter(Boolean).join(' · ')}</small></span>
        <span className="b2-manage-tags">{curr?.mapeadoZig&&<span className="b2-pill green">Zig</span>}
         {!configured&&curr?.semNivel&&<span className="b2-pill red">Sem nível</span>}
         {!curr&&<span className="b2-pill">Adicionar</span>}</span>
       </button>;
      })}
      {list.length>220&&<p className="b2-op-small">Exibindo 220 resultados. Refine a pesquisa para localizar outros itens.</p>}
      {!list.length&&<div className="b2-hint">Nenhum item corresponde aos filtros. Desmarque “Só itens deste setor” para adicionar outro produto.</div>}
     </section>
     <section className="b2-card b2-manage-detail">
      {selected?<><div className="b2-op-section-title"><div><p className="b2-eyebrow">Cadastro oficial · {selected.codigo||'sem código'}</p><h2>{selected.nome}</h2>
       <small>{selected.categoria||'Sem categoria'} · {selected.unidade_medida||'unidade'}</small></div><Package size={24}/></div>
       <h3>Saldo por estoque</h3>
       <div className="b2-manage-stock-grid">{dados.estoques.filter(e=>e.status).map(e=>
        <div key={e.id} className={'b2-manage-stock'+(e.id===sectorId?' selected':'')}>
         <small>{e.nome}</small><strong>{fmt3(dados.saldos[keyOf(e.id,itemId)]||0)} {selected.unidade_medida||''}</strong>
         {e.tipo==='central'&&<em>Central</em>}
        </div>)}</div>
       <p className="b2-op-help">O mesmo item tem saldos independentes. Uma venda Zig só desconta do estoque indicado no vínculo daquela venda.</p>
       <div className="b2-manage-setting">
        <h3>Configuração no {sector?.nome}</h3>
        <label className="b2-manage-toggle">
         <input type="checkbox" checked={membership}
          disabled={membership&&(Math.abs(saldoLocal)>0.0001||possuiZig)}
          onChange={e=>editNivel({enabled:e.target.checked,nivel_reposicao:e.target.checked?currentLevel?.nivel_reposicao??null:null})}/>
         Produto pertence a este setor
        </label>
        {!membership&&(Math.abs(saldoLocal)>0.0001||possuiZig)&&
         <p className="b2-op-warn">Há saldo ou vínculo Zig neste estoque. Configure o nível aqui; para retirar o produto do setor, transfira o saldo e corrija primeiro a origem da venda.</p>}
        {membership&&<>
         <label className="b2-field"><span>Nível desejado para reposição ({selected.unidade_medida||'un.'})</span>
          <input type="number" min="0" step="any"
           value={currentLevel?.nivel_reposicao??''}
           placeholder="Defina a quantidade-alvo" onChange={e=>{
            const v=e.target.value;
            if(v!==''&&(!Number.isFinite(Number(v))||Number(v)<0))return;
            editNivel({enabled:true,nivel_reposicao:v===''?null:Number(v)});
           }}/>
         </label>
         {currentLevel?.nivel_reposicao===null&&<span className="b2-pill red">Precisa definir o nível</span>}
         <div className="b2-manage-rule"><span>Como sai deste estoque?</span>
          <strong className={'b2-pill '+(possuiZig?'green':'')}>{possuiZig?'Baixa automática por vendas Zig':currentRow?.controleEfetivo==='periodico'?'Consumo registrado na retirada · auditoria periódica':'Consumo apurado pela contagem diária'}</strong></div>
         {possuiZig?<p className="b2-op-help">Vínculos Zig encontrados para este item neste estoque. A contagem geral só apura divergência; não deve dar outra baixa.</p>
          :<label className="b2-field"><span>Itens sem baixa Zig · como apurar o consumo</span>
           <select value={currentRow?.controleEfetivo==='periodico'?'periodico':'diario'}
            onChange={e=>dados.setFrequencia(sectorId,itemId,e.target.value as FrequenciaManual)}>
            <option value="diario">Contagem no fechamento · consumo pela diferença</option>
            <option value="periodico">Consumo por retirada registrada · só auditoria periódica</option>
           </select></label>}
         {currentLevel?.controle&&<p className="b2-op-small">Configuração antiga deste setor: {currentLevel.controle==='venda'?'Vende':'Conta'}. A classificação efetiva é cruzada com os vínculos Zig acima.</p>}
        </>}
       </div>
       <div className="b2-manage-links"><h3>Vendas Zig que consomem este item no {sector?.nome}</h3>
        {externalMaps.length?externalMaps.slice(0,25).map(m=><button key={m.id} className="b2-manage-zig-link" type="button" onClick={()=>jumpMap(m.id)}>
         <span><strong>{m.nome_externo}</strong><small>{m.ficha_tecnica_id?'Por ficha: '+(fichaById.get(m.ficha_tecnica_id)?.nome||'Ficha'):'Baixa direta deste item'} · origem {sector?.nome}</small></span><ArrowRight size={16}/></button>)
         :<p className="b2-op-help">Nenhuma venda da Zig consome este item a partir deste estoque na configuração atual.</p>}
        {externalMaps.length>25&&<p className="b2-op-small">Exibindo 25 vínculos. Consulte todos na aba Vínculos de venda Zig.</p>}
       </div>
      </>:<p>Selecione um item da lista.</p>}
     </section>
    </div>
   </div>
  </>}

  {tab==='zig'&&<>
   <div className="b2-manage-section"><div className="b2-op-section-title"><h2>2 · O que cada venda da Zig desconta?</h2><span className="b2-pill">ORIGEM OBRIGATÓRIA</span></div>
    <p className="b2-op-help">Cada produto vendido na Zig aponta para <strong>um item direto OU uma ficha técnica</strong> e <strong>um estoque de origem</strong>. Um item pode estar no Central e no Bar, mas cada venda terá sua origem explícita.</p>
    <div className="b2-manage-toolbar">
     <label className="b2-history-search"><Search size={15}/><input value={buscaZig} onChange={e=>setBuscaZig(e.target.value)} placeholder="Buscar nome da Zig, ficha, item ou estoque"/></label>
     <label className="b2-field"><span>Filtrar vínculos</span><select value={zigFilter} onChange={e=>setZigFilter(e.target.value as typeof zigFilter)}>
      <option value="todos">Todos os produtos Zig</option><option value="pendentes">Sem vínculo completo</option><option value="alterados">Alterados nesta prévia</option>
     </select></label>
     <button className="b2-btn alt small" type="button" onClick={dados.refresh}><RefreshCw size={14}/> Reconsultar base</button>
    </div>
    <div className="b2-manage-layout">
     <section className="b2-card b2-manage-list">
      <div className="b2-manage-list-head"><strong>{zigList.length} produtos da Zig</strong><small>Selecione uma venda</small></div>
      {zigList.slice(0,220).map(m=><button type="button" key={m.id} className={'b2-manage-item'+(mapId===m.id?' active':'')}
       aria-pressed={mapId===m.id} onClick={()=>chooseMap(m)}>
       <span className="b2-manage-item-info"><strong>{m.nome_externo}</strong>
        <small>{m.ignorar_estoque?'Ignora estoque':m.ficha_tecnica_id?'Ficha técnica':m.item_estoque_id?'Item direto':'Sem vínculo'} · {stockById.get(m.estoque_id||'')?.nome||'Sem origem'}</small></span>
       <span className="b2-manage-tags">{dados.rascunhosZig[m.id]&&<span className="b2-pill">TESTE</span>}
        {!m.ignorar_estoque&&(!m.estoque_id||(!m.item_estoque_id&&!m.ficha_tecnica_id))&&<span className="b2-pill red">Pendente</span>}</span>
      </button>)}
      {zigList.length>220&&<p className="b2-op-small">Exibindo 220. Pesquise pelo nome para localizar os demais produtos.</p>}
      {!zigList.length&&<div className="b2-hint">Nenhum mapeamento corresponde aos filtros.</div>}
     </section>
     <section className="b2-card b2-manage-detail">
      {draft?<><p className="b2-eyebrow">Produto vendido na Zig</p><h2>{draft.nome_externo}</h2>
       {draft.zig_category&&<p className="b2-op-small">{draft.zig_category}</p>}
       <div className="b2-manage-setting"><h3>Como esta venda deve dar baixa?</h3>
        <div className="b2-manage-choice" role="group" aria-label="Tipo de vínculo da venda">
         {([['item','Item direto'],['ficha','Ficha técnica'],['ignorar','Não baixar estoque']] as [TipoVinculo,string][]).map(([v,label])=>
          <button type="button" key={v} aria-pressed={draftType===v}
           onClick={()=>chooseKind(v)}>{label}</button>)}
        </div>
        {draftType==='ignorar'?<div className="b2-hint">Use para taxa, gorjeta ou outro lançamento Zig que não representa consumo de mercadoria.</div>:<>
         {draftType==='pendente'&&<div className="b2-op-warn">Escolha item direto ou ficha técnica antes de indicar o alvo.</div>}
         {draftType==='item'&&<PesquisaItemBeta2
          items={activeItems} selectedId={draft.item_estoque_id||''}
          onSelect={id=>setDraft(p=>p?{...p,item_estoque_id:id||null,ficha_tecnica_id:null}:p)}
          label="Item de estoque que sai por venda *"
          placeholder="Busque o item que a Zig deve baixar..."/>}
         {draftType==='ficha'&&<PesquisaItemBeta2
          items={dados.fichas.filter(f=>f.ativo!==false).map(f=>({...f,status:'ativo'}))}
          selectedId={draft.ficha_tecnica_id||''}
          onSelect={id=>setDraft(p=>p?{...p,ficha_tecnica_id:id||null,item_estoque_id:null}:p)}
          label="Ficha técnica que a venda consome *"
          placeholder="Busque a ficha técnica..."/>}
         <label className="b2-field"><span>DE QUAL ESTOQUE ESTA VENDA DA ZIG DEVE BAIXAR? *</span>
          <select value={draft.estoque_id||''} onChange={e=>setDraft(p=>p?{...p,estoque_id:e.target.value||null}:p)}>
           <option value="">Escolha a origem da venda...</option>
           {dados.estoques.filter(e=>e.status).map(e=><option key={e.id} value={e.id}>{e.nome}</option>)}
          </select>
         </label>
         {draft.estoque_id&&<div className="b2-manage-origin"><CheckCircle2 size={19}/>
          <span><strong>Origem selecionada: {stockById.get(draft.estoque_id)?.nome}</strong>
           <small>A Zig descontará exclusivamente deste estoque quando este mapeamento estiver salvo na base oficial.</small></span></div>}
         {draftType==='item'&&draft.item_estoque_id&&<>
          <h3>Saldos deste mesmo item em cada estoque</h3>
          <div className="b2-manage-stock-grid">{dados.estoques.filter(e=>e.status).map(e=>
           <div key={e.id} className={'b2-manage-stock'+(e.id===draft.estoque_id?' selected':'')}>
            <small>{e.nome}</small><strong>{fmt3(dados.saldos[keyOf(e.id,draft.item_estoque_id||'')]||0)} {itemById.get(draft.item_estoque_id||'')?.unidade_medida||''}</strong>
            {e.id===draft.estoque_id&&<em>Origem da baixa</em>}
           </div>)}</div>
          {linksToOriginal.length>1&&<p className="b2-op-small">Mais de uma venda Zig pode apontar para este mesmo item e estoque. Cada venda mantém seu próprio registro de mapeamento.</p>}
         </>}
         {draftType==='ficha'&&draft.ficha_tecnica_id&&<div className="b2-manage-ingredients">
          <h3>Ingredientes que a ficha desconta da origem selecionada</h3>
          {ficheIngredients.length?ficheIngredients.map((fi,index)=><div key={index} className="b2-row">
           <strong>{itemById.get(fi.item_estoque_id||'')?.nome||'Ingrediente não encontrado'}</strong>
           <span className="b2-pill">{fmt3(Number(fi.quantidade||0))} por venda</span>
          </div>):<div className="b2-error">Esta ficha não possui ingredientes com baixa habilitada. Revise a ficha antes de vincular a Zig.</div>}
          <p className="b2-op-help">Regra atual: todos os ingredientes habilitados dessa ficha saem do estoque escolhido acima. Para origens diferentes por ingrediente, seria necessária outra regra no processamento Zig.</p>
          <button type="button" className="b2-btn alt small" onClick={()=>go('fichas')}>Consultar fichas técnicas <ArrowRight size={14}/></button>
         </div>}
        </>}
       </div>
       {error&&<div className="b2-error" role="alert">{error}</div>}
       {notice&&<div className="b2-success" role="status"><CheckCircle2 size={16}/> {notice}</div>}
       <div className="b2-manage-actions">
        <button type="button" className="b2-btn" onClick={saveMap}>Aplicar vínculo na prévia</button>
        {dados.rascunhosZig[draft.id]&&<button type="button" className="b2-btn alt" onClick={()=>{
         dados.limparPreviewMap(draft.id);setNotice('Vínculo oficial restaurado nesta prévia.');
        }}>Restaurar vínculo oficial</button>}
       </div>
       <div className="b2-hint">Nenhuma alteração foi enviada à Zig, à tabela mapeamento_itens_vendas ou aos saldos oficiais. Esta prévia permite aprovar o desenho da tela antes de ativar a gravação real.</div>
      </>:<p>Selecione um produto Zig da lista.</p>}
     </section>
    </div>
   </div>
  </>}
  {tab==='itens'&&<div className="b2-manage-actions">
   <button type="button" className="b2-btn alt" onClick={()=>go('fechamento')}>Testar fechamento com esta configuração <ArrowRight size={14}/></button>
   <button type="button" className="b2-btn alt" onClick={()=>go('reposicao')}>Ver reposição calculada <ArrowRight size={14}/></button>
  </div>}
 </div>;
};
export default GestaoEstoqueBeta2;
