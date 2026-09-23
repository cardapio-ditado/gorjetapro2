import React, { useEffect, useId, useMemo, useState } from 'react';
import { Check, Search, X } from 'lucide-react';

export interface ItemPesquisaBeta2 {
 id:string;
 nome:string;
 codigo?:string|null;
 unidade_medida?:string|null;
 status?:string|null;
}

interface Props {
 items:ItemPesquisaBeta2[];
 selectedId:string;
 onSelect:(id:string)=>void;
 label?:string;
 placeholder?:string;
 focusOnMount?:boolean;
}

// Pesquisa tolerante a acentos, palavras fora de ordem e pequenos erros de digitação.
const clean=(v:string)=>v.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR').trim();
const words=(v:string)=>clean(v).split(/[^a-z0-9]+/).filter(Boolean);
function distance(a:string,b:string,max=2){
 if(Math.abs(a.length-b.length)>max)return max+1;
 let row=Array.from({length:b.length+1},(_,i)=>i);
 for(let i=1;i<=a.length;i++){
  const next=[i];
  for(let j=1;j<=b.length;j++)next[j]=Math.min(next[j-1]+1,row[j]+1,row[j-1]+Number(a[i-1]!==b[j-1]));
  row=next;
  if(Math.min(...row)>max)return max+1;
 }
 return row[b.length];
}
function relevance(item:ItemPesquisaBeta2,term:string):number{
 const name=clean(item.nome);
 const code=clean(item.codigo||'');
 if(!term)return 100;
 if(name===term||code===term)return 0;
 if(code.startsWith(term)||name.startsWith(term))return 1;
 const tokens=words(item.nome);
 const parts=words(term);
 if(parts.length>1&&parts.every(p=>tokens.some(t=>t.startsWith(p)||t.includes(p))))return 2;
 if(tokens.some(t=>t.startsWith(term)))return 3;
 if(name.includes(term)||code.includes(term))return 4;
 if(term.length<3)return Infinity;
 if(parts.length===1&&tokens.some(t=>distance(term,t.slice(0,term.length+1),2)<=2||distance(term,t,2)<=2))return 6;
 return Infinity;
}

/** Campo único: pesquisa + seleção real do item, sem exigir uma segunda linha de select. */
const PesquisaItemBeta2:React.FC<Props>=({
 items,selectedId,onSelect,label='Item *',placeholder='Digite nome ou código do produto...',focusOnMount=false
})=>{
 const controlId=useId();
 const[selectedText,setSelectedText]=useState('');
 const[query,setQuery]=useState('');
 const[open,setOpen]=useState(false);
 const[active,setActive]=useState(0);
 const selected=items.find(x=>x.id===selectedId);
 useEffect(()=>{
  setSelectedText(selected?.nome||'');
  if(selectedId)setQuery(selected?.nome||'');
 },[selectedId,selected?.nome]);
 const options=useMemo(()=>{
  const term=clean(query);
  return items.filter(it=>it.status==='ativo'||it.id===selectedId)
   .map(it=>({item:it,rank:relevance(it,term)}))
   .filter(x=>x.rank!==Infinity)
   .sort((a,b)=>a.rank-b.rank||a.item.nome.localeCompare(b.item.nome,'pt-BR'))
   .slice(0,9).map(x=>x.item);
 },[items,query,selectedId]);
 const pick=(item:ItemPesquisaBeta2)=>{
  setQuery(item.nome);setSelectedText(item.nome);setOpen(false);setActive(0);onSelect(item.id);
 };
 const reset=()=>{setQuery('');setSelectedText('');setActive(0);setOpen(true);onSelect('');};
 return <div className="b2-field b2-item-lookup">
  <label htmlFor={controlId}>{label}</label>
  <div className="b2-item-input-wrap">
   <Search size={15} aria-hidden="true"/>
   <input id={controlId} role="combobox" aria-autocomplete="list" aria-expanded={open}
    aria-controls={controlId+'-lista'}
    aria-activedescendant={open&&options[active]?controlId+'-opcao-'+active:undefined}
    autoComplete="off" autoFocus={focusOnMount} value={query}
    onFocus={()=>{setOpen(true);setActive(0)}}
    onBlur={()=>setOpen(false)}
    onChange={e=>{setQuery(e.target.value);setSelectedText('');setActive(0);if(selectedId)onSelect('');setOpen(true)}}
    onKeyDown={e=>{
     if(e.key==='Escape'){setOpen(false);return;}
     if(e.key==='ArrowDown'){e.preventDefault();setOpen(true);setActive(i=>Math.min(i+1,options.length-1));return;}
     if(e.key==='ArrowUp'){e.preventDefault();setOpen(true);setActive(i=>Math.max(0,i-1));return;}
     if(e.key==='Enter'&&open){e.preventDefault();if(options[active])pick(options[active]);}
    }}
    placeholder={placeholder}/>
   {selectedId
    ?<button className="b2-item-reset" type="button" aria-label={'Trocar '+selectedText} title="Trocar item" onMouseDown={e=>e.preventDefault()} onClick={reset}><X size={15}/></button>
    :null}
  </div>
  {selectedId&&selected&&<small className="b2-item-selected"><Check size={13}/>Selecionado · {selected.codigo?selected.codigo+' · ':''}{selected.unidade_medida||'un.'}</small>}
  {open&&<div id={controlId+'-lista'} role="listbox" className="b2-item-options">
   {options.length?options.map((it,index)=>
    <button type="button" role="option" aria-selected={index===active}
      id={controlId+'-opcao-'+index} key={it.id}
      className={'b2-item-option'+(active===index?' active':'')}
      onMouseEnter={()=>setActive(index)}
      onMouseDown={e=>e.preventDefault()}
      onClick={()=>pick(it)}>
      <span><strong>{it.nome}</strong><small>{[it.codigo,it.unidade_medida].filter(Boolean).join(' · ')}</small></span>
      {selectedId===it.id&&<Check size={16}/>}
    </button>)
    :<div className="b2-item-empty">{query.trim()?'Nenhum produto parecido encontrado.':'Comece digitando o nome ou código.'}</div>}
   <div className="b2-item-tip">Digite para filtrar · ↑↓ para navegar · Enter para selecionar</div>
  </div>}
 </div>;
};
export default PesquisaItemBeta2;
