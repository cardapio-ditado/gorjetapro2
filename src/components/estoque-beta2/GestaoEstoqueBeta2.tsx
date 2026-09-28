import React, { useMemo, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, ChevronRight, Link2, Plus, Save, Search, Trash2, Warehouse, X,
} from 'lucide-react';
import {
  type MapZig, useControleZigBeta2, fmt3, keyOf,
} from './FechamentoDadosBeta2';
import './OperacoesBeta2.css';
import './FechamentoBeta2.css';
import './GestaoEstoqueBeta2.css';

interface Props {
  dados: ReturnType<typeof useControleZigBeta2>;
  go: (screen:'fechamento'|'reposicao'|'fichas') => void;
}
type ControleSetor = 'contagem'|'venda';
type DraftItem = { nivel:string; controle:ControleSetor; novo?:boolean; removido?:boolean };
type LinkMode = 'direto'|'ficha';

const normalizar=(v:unknown)=>String(v||'').normalize('NFD')
  .replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();

const GestaoEstoqueBeta2:React.FC<Props>=({dados,go})=>{
  const[sectorId,setSectorId]=useState('');
  const[draftItems,setDraftItems]=useState<Record<string,DraftItem>>({});
  const[dirty,setDirty]=useState(false);
  const[search,setSearch]=useState('');
  const[notice,setNotice]=useState('');
  const[error,setError]=useState('');

  const[addOpen,setAddOpen]=useState(false);
  const[addSearch,setAddSearch]=useState('');
  const[selectedAdd,setSelectedAdd]=useState<string[]>([]);

  const[linkItemId,setLinkItemId]=useState('');
  const[mapDrafts,setMapDrafts]=useState<Record<string,MapZig>>({});
  const[saleSearch,setSaleSearch]=useState('');
  const[selectedSaleId,setSelectedSaleId]=useState('');
  const[linkMode,setLinkMode]=useState<LinkMode>('direto');
  const[selectedFichaId,setSelectedFichaId]=useState('');

  const sector=dados.setores.find(s=>s.id===sectorId);
  const itemById=useMemo(()=>new Map(dados.items.map(i=>[i.id,i])),[dados.items]);
  const stockById=useMemo(()=>new Map(dados.estoques.map(e=>[e.id,e])),[dados.estoques]);
  const fichaById=useMemo(()=>new Map(dados.fichas.map(f=>[f.id,f])),[dados.fichas]);

  const effectiveMaps=useMemo(
    ()=>dados.mapeamentos.map(m=>mapDrafts[m.id]||m),
    [dados.mapeamentos,mapDrafts],
  );

  const fichasDoItem=(itemId:string)=>dados.ingredientes
    .filter(i=>i.item_estoque_id===itemId&&i.baixa_estoque)
    .map(i=>i.ficha_id);

  const linksForItem=(itemId:string,origin=sectorId)=>{
    const fichas=new Set(fichasDoItem(itemId));
    return effectiveMaps.filter(m=>!m.ignorar_estoque&&m.estoque_id===origin&&(
      m.item_estoque_id===itemId || (!!m.ficha_tecnica_id&&fichas.has(m.ficha_tecnica_id))
    ));
  };

  const abrirSetor=(id:string)=>{
    if(dirty&&!window.confirm('Descartar as alterações ainda não salvas deste setor?'))return;
    const levels=dados.niveis.filter(n=>n.estoque_id===id);
    setDraftItems(Object.fromEntries(levels.map(n=>[
      n.item_id,
      {
        nivel:n.nivel_reposicao==null?'':String(n.nivel_reposicao),
        controle:n.controle==='venda'?'venda':'contagem',
      } satisfies DraftItem,
    ])));
    setMapDrafts({});
    setSectorId(id);setSearch('');setDirty(false);setNotice('');setError('');
    setLinkItemId('');setAddOpen(false);
  };

  const voltar=()=>{
    if(dirty&&!window.confirm('Descartar as alterações ainda não salvas?'))return;
    setSectorId('');setDraftItems({});setMapDrafts({});setDirty(false);setError('');setNotice('');
  };

  const activeDraftEntries=Object.entries(draftItems).filter(([,d])=>!d.removido);
  const visibleDraftEntries=activeDraftEntries.filter(([id])=>{
    if(!search.trim())return true;
    const item=itemById.get(id);
    return normalizar([item?.nome,item?.codigo,item?.categoria].join(' ')).includes(normalizar(search));
  });

  const availableItems=dados.items.filter(i=>i.status==='ativo'&&(!draftItems[i.id]||draftItems[i.id].removido) && (
    !addSearch.trim() || normalizar([i.nome,i.codigo,i.categoria].join(' ')).includes(normalizar(addSearch))
  )).sort((a,b)=>a.nome.localeCompare(b.nome,'pt-BR'));

  const addItems=()=>{
    if(!selectedAdd.length)return;
    setDraftItems(prev=>{
      const next={...prev};
      for(const id of selectedAdd)next[id]={nivel:'',controle:'contagem',novo:true};
      return next;
    });
    setSelectedAdd([]);setAddSearch('');setAddOpen(false);setDirty(true);
    setNotice('Produtos adicionados à lista. Defina o nível e a forma de baixa antes de salvar.');
  };

  const remover=(itemId:string)=>{
    const item=itemById.get(itemId);
    const saldo=dados.saldos[keyOf(sectorId,itemId)]||0;
    const links=linksForItem(itemId);
    if(Math.abs(saldo)>0.0001||links.length){
      setError(
        'Antes de remover '+(item?.nome||'o produto')+' do setor, '+
        (Math.abs(saldo)>0.0001?'transfira/zere o saldo atual ('+fmt3(saldo)+'). ':'')+
        (links.length?'Também retire ou altere os vínculos Zig cuja origem é '+sector?.nome+'.':'')
      );
      setLinkItemId(links.length?itemId:'');
      return;
    }
    setDraftItems(prev=>({...prev,[itemId]:{...prev[itemId],removido:true}}));
    setDirty(true);setError('');setNotice((item?.nome||'Produto')+' marcado para remoção da lista.');
  };

  const resumoVinculos=(itemId:string)=>{
    const links=linksForItem(itemId);
    const direct=links.filter(m=>m.item_estoque_id===itemId).length;
    const fichas=new Set(links.filter(m=>m.ficha_tecnica_id).map(m=>m.ficha_tecnica_id));
    if(!links.length)return 'Sem vínculo';
    const parts:string[]=[];
    if(direct)parts.push(direct+' direto'+(direct>1?'s':''));
    if(fichas.size)parts.push(fichas.size+' ficha'+(fichas.size>1?'s':''));
    return parts.join(' + ');
  };

  const abrirVinculos=(itemId:string)=>{
    setLinkItemId(itemId);setSaleSearch('');setSelectedSaleId('');setLinkMode('direto');
    setSelectedFichaId('');setError('');
  };

  const linkItem=itemById.get(linkItemId);
  const eligibleFichaIds=linkItemId?Array.from(new Set(fichasDoItem(linkItemId))):[];
  const currentLinks=linkItemId?linksForItem(linkItemId):[];

  const saleOptions=effectiveMaps.filter(m=>{
    if(!saleSearch.trim())return true;
    return normalizar([m.nome_externo,m.zig_category,
      itemById.get(m.item_estoque_id||'')?.nome,
      fichaById.get(m.ficha_tecnica_id||'')?.nome,
      stockById.get(m.estoque_id||'')?.nome].join(' ')).includes(normalizar(saleSearch));
  }).slice(0,80);

  const addLink=()=>{
    const sale=effectiveMaps.find(m=>m.id===selectedSaleId);
    if(!sale||!linkItemId||!sectorId)return;
    if(linkMode==='ficha'&&!selectedFichaId){
      setError('Escolha qual ficha técnica deve receber esta venda Zig.');return;
    }
    const draft:MapZig={
      ...sale,
      ignorar_estoque:false,
      estoque_id:sectorId,
      item_estoque_id:linkMode==='direto'?linkItemId:null,
      ficha_tecnica_id:linkMode==='ficha'?selectedFichaId:null,
    };
    setMapDrafts(prev=>({...prev,[draft.id]:draft}));
    setSelectedSaleId('');setSaleSearch('');setSelectedFichaId('');
    setDirty(true);setError('');
  };

  const unlink=(map:MapZig)=>{
    setMapDrafts(prev=>({...prev,[map.id]:{
      ...map,item_estoque_id:null,ficha_tecnica_id:null,estoque_id:null,ignorar_estoque:false,
    }}));
    setDirty(true);
  };

  const saveSector=()=>{
    setError('');setNotice('');
    if(!sector)return;

    const active=Object.entries(draftItems).filter(([,d])=>!d.removido);
    if(!active.length){
      setError('Inclua pelo menos um produto antes de salvar o setor.');return;
    }
    for(const [itemId,d] of active){
      const item=itemById.get(itemId);
      const raw=d.nivel.trim().replace(',','.');
      if(raw===''||!Number.isFinite(Number(raw))||Number(raw)<0){
        setError('Defina a quantidade mínima/ideal de '+(item?.nome||'todos os produtos')+'.');return;
      }
      if(d.controle==='venda'&&linksForItem(itemId).length===0){
        setError((item?.nome||'Um produto')+' está marcado como Zig, mas não possui vínculo de venda. Clique em “Configurar vínculo”.');
        return;
      }
    }
    for(const [itemId,d] of Object.entries(draftItems)){
      dados.setNivelPreview(sectorId,itemId,{
        enabled:!d.removido,
        nivel_reposicao:d.removido?null:Number(d.nivel.trim().replace(',','.')),
        controle:d.controle,
      });
    }
    for(const map of Object.values(mapDrafts))dados.setMapeamentoPreview(map);
    setDirty(false);
    setNotice('Configuração do '+sector.nome+' aplicada à prévia. Fechamento e reposição já passam a usar essa lógica.');
  };

  if(dados.loading)return <div className="b2-card">Carregando setores, produtos e mapeamentos Zig...</div>;
  if(dados.error)return <div className="b2-error">{dados.error}</div>;

  if(!sectorId)return <div className="b2-sector-home">
    <p className="b2-eyebrow">GESTÃO · ESTOQUE BETA 2</p>
    <h1>Gestão do Estoque</h1>
    <p className="b2-lead">Cada setor tem sua própria lista. É aqui que você define quais produtos existem no local, quanto deve ter e se a saída acontece por contagem diária ou pela Zig.</p>
    <div className="b2-hint"><strong>Prévia:</strong> a configuração abaixo ainda não grava a base oficial e não altera a Zig das 6h. Ela permite validar o módulo antes de ativarmos a persistência.</div>
    <div className="b2-sector-cards">
      {dados.setores.map(st=>{
        const levels=dados.niveis.filter(n=>n.estoque_id===st.id);
        const rows=dados.linhas.filter(r=>r.estoque_id===st.id&&levels.some(n=>n.item_id===r.item_id));
        const daily=levels.filter(n=>n.controle!=='venda').length;
        const zig=levels.filter(n=>n.controle==='venda').length;
        const pending=rows.filter(r=>r.nivel_reposicao==null||(r.controle==='venda'&&!r.mapeadoZig)).length;
        return <section className="b2-sector-card" key={st.id}>
          <div className="b2-sector-card-icon"><Warehouse size={24}/></div>
          <div className="b2-sector-card-copy"><h2>{st.nome}</h2>
            <p>{levels.length} produtos configurados</p>
            <div className="b2-sector-tags">
              <span className="b2-pill">{daily} contagem diária</span>
              <span className="b2-pill green">{zig} Zig</span>
              {pending>0&&<span className="b2-pill red">{pending} pendência{pending>1?'s':''}</span>}
            </div>
          </div>
          <button className="b2-btn" type="button" onClick={()=>abrirSetor(st.id)}>Configurar setor <ChevronRight size={16}/></button>
        </section>;
      })}
    </div>
  </div>;

  return <div className="b2-sector-config">
    <div className="b2-sector-config-top">
      <button type="button" className="b2-back-link" onClick={voltar}><ArrowLeft size={17}/> Setores</button>
      <div><p className="b2-eyebrow">CONFIGURAR SETOR</p><h1>{sector?.nome}</h1>
        <p className="b2-lead">Esta lista determina a reposição, a contagem noturna e quais itens a Zig pode baixar deste setor.</p></div>
      <button type="button" className="b2-btn" disabled={!dirty} onClick={saveSector}><Save size={16}/> Salvar alterações</button>
    </div>
    <div className="b2-sector-rule">
      <strong>Regra simples:</strong>
      <span><b>Contagem diária</b> → a Zig ignora o item neste setor e o gerente informa o físico no fechamento.</span>
      <span><b>Zig</b> → a baixa automática das 6h é permitida e usa os vínculos diretos e/ou fichas técnicas configurados.</span>
    </div>
    {error&&<div className="b2-error" role="alert">{error}</div>}
    {notice&&<div className="b2-success" role="status"><CheckCircle2 size={16}/> {notice}</div>}
    <div className="b2-sector-toolbar">
      <label className="b2-history-search"><Search size={16}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={'Buscar na lista do '+sector?.nome+'...'}/></label>
      <span>{activeDraftEntries.length} produtos</span>
      <button type="button" className="b2-btn" onClick={()=>{setAddOpen(true);setAddSearch('');setSelectedAdd([])}}><Plus size={16}/> Adicionar produtos</button>
    </div>
    <div className="b2-sector-table">
      <div className="b2-sector-table-head"><span>Produto</span><span>Quantidade mínima / ideal</span><span>Como dá baixa</span><span>Vínculo Zig</span><span>Ação</span></div>
      {visibleDraftEntries.map(([itemId,d])=>{
        const item=itemById.get(itemId);
        if(!item)return null;
        const links=linksForItem(itemId);
        return <div className="b2-sector-row" key={itemId}>
          <div className="b2-sector-product"><strong>{item.nome}</strong><small>{[item.codigo,item.unidade_medida,item.categoria].filter(Boolean).join(' · ')}</small></div>
          <label className="b2-field b2-sector-level"><span>Nível</span><input type="text" inputMode="decimal" value={d.nivel}
            placeholder="Ex.: 24" onChange={e=>{setDraftItems(p=>({...p,[itemId]:{...d,nivel:e.target.value}}));setDirty(true)}}/>
            <small>{item.unidade_medida||'un.'}</small></label>
          <div className="b2-sector-control">
            <button type="button" aria-pressed={d.controle==='contagem'} onClick={()=>{setDraftItems(p=>({...p,[itemId]:{...d,controle:'contagem'}}));setDirty(true)}}>Contagem diária</button>
            <button type="button" aria-pressed={d.controle==='venda'} onClick={()=>{setDraftItems(p=>({...p,[itemId]:{...d,controle:'venda'}}));setDirty(true)}}>Zig</button>
          </div>
          <div className="b2-sector-link">
            {d.controle==='contagem'?<><span className="b2-pill">Não baixa pela Zig</span>{links.length>0&&<small>{links.length} vínculo(s) preservado(s), mas bloqueados pelo setor</small>}</>:
            <><span className={'b2-pill '+(links.length?'green':'red')}>{resumoVinculos(itemId)}</span>
              <button type="button" className="b2-link-button" onClick={()=>abrirVinculos(itemId)}><Link2 size={14}/> Configurar vínculo</button></>}
          </div>
          <button type="button" className="b2-remove-text" onClick={()=>remover(itemId)}><Trash2 size={15}/> Remover</button>
        </div>;
      })}
      {!visibleDraftEntries.length&&<div className="b2-simple-empty">Nenhum produto corresponde à busca.</div>}
    </div>
    <div className="b2-sector-savebar">
      <span>{dirty?'Existem alterações não salvas nesta prévia.':'Nenhuma alteração pendente.'}</span>
      <div><button type="button" className="b2-btn alt" onClick={()=>go('fechamento')}>Testar fechamento</button>
      <button type="button" className="b2-btn" disabled={!dirty} onClick={saveSector}><Save size={16}/> Salvar alterações do {sector?.nome}</button></div>
    </div>

    {addOpen&&<div className="b2-simple-overlay">
      <div className="b2-simple-modal" role="dialog" aria-modal="true" aria-label="Adicionar produtos ao setor">
        <div className="b2-simple-modal-head"><div><p className="b2-eyebrow">ADICIONAR PRODUTOS</p><h2>Lista do {sector?.nome}</h2>
          <p>Selecione vários produtos do cadastro geral.</p></div>
          <button type="button" className="b2-simple-close" onClick={()=>setAddOpen(false)} aria-label="Fechar"><X size={20}/></button></div>
        <label className="b2-history-search"><Search size={16}/><input autoFocus value={addSearch} onChange={e=>setAddSearch(e.target.value)} placeholder="Buscar nome, código ou categoria..."/></label>
        <div className="b2-simple-modal-list">
          {availableItems.slice(0,150).map(item=>{
            const checked=selectedAdd.includes(item.id);
            const saldo=dados.saldos[keyOf(sectorId,item.id)]||0;
            return <label className={'b2-simple-option'+(checked?' checked':'')} key={item.id}>
              <input type="checkbox" checked={checked} onChange={e=>setSelectedAdd(p=>e.target.checked?[...p,item.id]:p.filter(id=>id!==item.id))}/>
              <span><strong>{item.nome}</strong><small>{[item.codigo,item.unidade_medida,item.categoria].filter(Boolean).join(' · ')}</small>
                {Math.abs(saldo)>0.0001&&<small className="b2-simple-existing">Saldo atual no setor: {fmt3(saldo)} {item.unidade_medida||''}</small>}</span>
            </label>;
          })}
          {!availableItems.length&&<div className="b2-hint">Todos os itens encontrados já fazem parte da lista.</div>}
        </div>
        <div className="b2-simple-modal-footer"><span>{selectedAdd.length} selecionado(s)</span>
          <button className="b2-btn alt" type="button" onClick={()=>setAddOpen(false)}>Cancelar</button>
          <button className="b2-btn" type="button" disabled={!selectedAdd.length} onClick={addItems}><Plus size={16}/> Adicionar à lista</button></div>
      </div>
    </div>}

    {linkItemId&&linkItem&&<div className="b2-simple-overlay">
      <div className="b2-zig-modal" role="dialog" aria-modal="true" aria-label="Configurar vínculo Zig">
        <div className="b2-simple-modal-head"><div><p className="b2-eyebrow">VÍNCULO ZIG · ORIGEM {sector?.nome?.toUpperCase()}</p><h2>{linkItem.nome}</h2>
          <p>Uma venda pode baixar o item diretamente ou através de uma ficha técnica que use este ingrediente.</p></div>
          <button type="button" className="b2-simple-close" onClick={()=>setLinkItemId('')} aria-label="Fechar"><X size={20}/></button></div>

        <section className="b2-zig-existing"><h3>Vínculos atuais neste setor</h3>
          {currentLinks.length?currentLinks.map(m=><div className="b2-zig-link-row" key={m.id}>
            <div><strong>{m.nome_externo}</strong><small>{m.item_estoque_id===linkItemId?'Baixa direta':('Ficha: '+(fichaById.get(m.ficha_tecnica_id||'')?.nome||'Ficha técnica'))}</small></div>
            <span className="b2-pill green">{sector?.nome}</span>
            <button type="button" className="b2-remove-text" onClick={()=>unlink(m)}><Trash2 size={14}/> Desvincular</button>
          </div>):<div className="b2-hint">Nenhuma venda Zig baixa este produto a partir do {sector?.nome}.</div>}
        </section>

        <section className="b2-zig-add"><h3>Adicionar ou redirecionar uma venda Zig</h3>
          <label className="b2-history-search"><Search size={16}/><input value={saleSearch} onChange={e=>{setSaleSearch(e.target.value);setSelectedSaleId('')}} placeholder="Buscar produto vendido na Zig..."/></label>
          {saleSearch.trim()&&<div className="b2-zig-sales">
            {saleOptions.map(m=><button type="button" key={m.id} aria-pressed={selectedSaleId===m.id} onClick={()=>setSelectedSaleId(m.id)}>
              <strong>{m.nome_externo}</strong><small>{m.ignorar_estoque?'Ignorado atualmente':
                (m.ficha_tecnica_id?'Ficha '+(fichaById.get(m.ficha_tecnica_id)?.nome||''):
                m.item_estoque_id?'Direto em '+(itemById.get(m.item_estoque_id)?.nome||'item'):'Sem vínculo')+
                (m.estoque_id?' · origem '+(stockById.get(m.estoque_id)?.nome||''):'')}</small></button>)}
          </div>}
          {selectedSaleId&&<div className="b2-zig-target">
            <div className="b2-sector-control">
              <button type="button" aria-pressed={linkMode==='direto'} onClick={()=>{setLinkMode('direto');setSelectedFichaId('')}}>Baixa direta no produto</button>
              <button type="button" aria-pressed={linkMode==='ficha'} onClick={()=>setLinkMode('ficha')}>Baixa por ficha técnica</button>
            </div>
            {linkMode==='ficha'&&<label className="b2-field"><span>Ficha que usa {linkItem.nome}</span><select value={selectedFichaId} onChange={e=>setSelectedFichaId(e.target.value)}>
              <option value="">Escolha a ficha...</option>
              {eligibleFichaIds.map(id=><option value={id} key={id}>{fichaById.get(id)?.nome||'Ficha'}</option>)}
            </select>
            {!eligibleFichaIds.length&&<small>Este item ainda não aparece em nenhuma ficha com baixa de estoque habilitada.</small>}</label>}
            <div className="b2-manage-origin"><CheckCircle2 size={18}/><span><strong>Origem da baixa: {sector?.nome}</strong>
              <small>Não é necessário escolher o estoque novamente: você está configurando o próprio setor.</small></span></div>
            <button type="button" className="b2-btn" onClick={addLink}>Adicionar vínculo</button>
          </div>}
        </section>
        {error&&<div className="b2-error">{error}</div>}
        <div className="b2-zig-modal-footer"><button type="button" className="b2-btn" onClick={()=>{setLinkItemId('');setDirty(true)}}>Concluir vínculos</button></div>
      </div>
    </div>}
  </div>;
};

export default GestaoEstoqueBeta2;
