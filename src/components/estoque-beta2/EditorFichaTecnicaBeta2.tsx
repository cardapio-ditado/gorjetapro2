import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, Plus, Trash2, X } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import './EditorFichaTecnicaBeta2.css';

type Ficha = { id:string; nome:string; [key:string]:any };
type Item = { id:string; nome:string; codigo:string|null; unidade_medida:string; custo_medio:number; status:string };
type Kind = 'item'|'ficha';
interface Ingrediente {
  tipo:Kind;
  item_estoque_id:string;
  ficha_tecnica_ingrediente_id:string;
  quantidade:number;
  observacoes:string;
  baixa_estoque:boolean;
  ordem:number;
}
interface Form {
  nome:string;porcoes:number;ativo:boolean;tipo_consumo:'producao'|'venda_direta';
  modo_preparo:string;observacoes_preparo:string;rendimento:number;unidade_rendimento:string;
  ingredientes:Ingrediente[];
}
interface Props {
  ficha:Ficha|null;
  fichas:Ficha[];
  onClose:()=>void;
  onSaved:(id:string)=>Promise<void>;
}
const emptyForm=():Form=>({
  nome:'',porcoes:1,ativo:true,tipo_consumo:'producao',
  modo_preparo:'',observacoes_preparo:'',rendimento:1,unidade_rendimento:'porções',ingredientes:[]
});
const ingredient=():Ingrediente=>({
  tipo:'item',item_estoque_id:'',ficha_tecnica_ingrediente_id:'',
  quantidade:0,observacoes:'',baixa_estoque:true,ordem:1
});
const asNumber=(value:unknown)=>Number(value||0);
const brl=(value:number)=>value.toLocaleString('pt-BR',{style:'currency',currency:'BRL'});
const EditorFichaTecnicaBeta2:React.FC<Props>=({ficha,fichas,onClose,onSaved})=>{
  const[form,setForm]=useState<Form>(()=>emptyForm());
  const[items,setItems]=useState<Item[]>([]);
  const[busy,setBusy]=useState(false);
  const[loading,setLoading]=useState(true);
  const[error,setError]=useState('');
  const[ingredientSearch,setIngredientSearch]=useState<Record<number,string>>({});
  const originalIngredients=useRef<Record<string,unknown>[]>([]);
  const editorRef=useRef<HTMLDivElement>(null);
  const currentId=ficha?.id||'';

  useEffect(()=>{
    let alive=true;
    const load=async()=>{
      setLoading(true);setError('');
      setIngredientSearch({});
      setForm(ficha?{
        nome:String(ficha.nome||''),
        porcoes:asNumber(ficha.porcoes)||1,
        ativo:ficha.ativo!==false,
        tipo_consumo:ficha.tipo_consumo==='venda_direta'?'venda_direta':'producao',
        modo_preparo:String(ficha.modo_preparo||''),
        observacoes_preparo:String(ficha.observacoes_preparo||''),
        rendimento:asNumber(ficha.rendimento)||1,
        unidade_rendimento:String(ficha.unidade_rendimento||'porções'),
        ingredientes:[]
      }:emptyForm());
      try{
        const allItems:Item[]=[];
        // Supabase/PostgREST limita linhas por chamada; buscar todas as páginas.
        for(let offset=0;offset<10000;offset+=500){
          const{data,error:e}=await supabase.from('itens_estoque')
            .select('id,nome,codigo,unidade_medida,custo_medio,status')
            .order('nome').range(offset,offset+499);
          if(e)throw e;
          allItems.push(...(data||[]) as Item[]);
          if(!data||data.length<500)break;
        }
        let rows:Record<string,unknown>[]=[];
        if(currentId){
          const{data,error:e}=await supabase.from('ficha_ingredientes')
            .select('id,ficha_id,item_estoque_id,ficha_tecnica_ingrediente_id,quantidade,ordem,observacoes,baixa_estoque')
            .eq('ficha_id',currentId).order('ordem');
          if(e)throw e;
          rows=(data||[]) as Record<string,unknown>[];
        }
        if(!alive)return;
        originalIngredients.current=rows.map(x=>({...x}));
        setItems(allItems);
        setForm(p=>({...p,ingredientes:rows.map((r,index)=>({
          tipo:r.ficha_tecnica_ingrediente_id?'ficha' as Kind:'item' as Kind,
          item_estoque_id:String(r.item_estoque_id||''),
          ficha_tecnica_ingrediente_id:String(r.ficha_tecnica_ingrediente_id||''),
          quantidade:asNumber(r.quantidade),
          ordem:asNumber(r.ordem)||index+1,
          observacoes:String(r.observacoes||''),
          baixa_estoque:r.baixa_estoque!==false
        }))}));
        requestAnimationFrame(()=>editorRef.current?.scrollIntoView({behavior:'smooth',block:'start'}));
      }catch(e){if(alive)setError(e instanceof Error?e.message:'Erro ao carregar ingredientes da ficha.');}
      finally{if(alive)setLoading(false);}
    };
    void load();
    return()=>{alive=false;};
  },[currentId]);

  const itemById=useMemo(()=>new Map(items.map(i=>[i.id,i])),[items]);
  const fichaById=useMemo(()=>new Map(fichas.map(f=>[f.id,f])),[fichas]);
  const cost=(line:Ingrediente)=>{
    if(line.tipo==='item')return asNumber(itemById.get(line.item_estoque_id)?.custo_medio)*asNumber(line.quantidade);
    const nested=fichaById.get(line.ficha_tecnica_ingrediente_id);
    if(!nested)return 0;
    return (asNumber(nested.custo_total)/Math.max(1,asNumber(nested.porcoes)))*asNumber(line.quantidade);
  };
  const total=form.ingredientes.reduce((sum,line)=>sum+cost(line),0);
  const update=(key:keyof Form,value:Form[keyof Form])=>setForm(p=>({...p,[key]:value}));
  const updateIngredient=(index:number,key:keyof Ingrediente,value:string|number|boolean)=>{
    setForm(p=>({...p,ingredientes:p.ingredientes.map((line,i)=>{
      if(i!==index)return line;
      const updated={...line,[key]:value};
      if(key==='tipo'){updated.item_estoque_id='';updated.ficha_tecnica_ingrediente_id='';}
      return updated;
    })}));
  };
  const add=()=>setForm(p=>({...p,ingredientes:[...p.ingredientes,{...ingredient(),ordem:p.ingredientes.length+1}]}));
  const remove=(index:number)=>setForm(p=>({...p,ingredientes:p.ingredientes.filter((_,i)=>i!==index)}));
  const validate=()=>{
    if(!form.nome.trim())return 'Informe o nome da ficha técnica.';
    if(!Number.isInteger(form.porcoes)||form.porcoes<1)return 'O número de porções deve ser inteiro e maior que zero.';
    if(!(form.rendimento>0)||!Number.isFinite(form.rendimento))return 'O rendimento precisa ser maior que zero.';
    if(!form.unidade_rendimento.trim())return 'Informe a unidade de rendimento.';
    if(form.ingredientes.length===0)return 'Adicione pelo menos um ingrediente.';
    for(let i=0;i<form.ingredientes.length;i++){
      const line=form.ingredientes[i];
      const id=line.tipo==='item'?line.item_estoque_id:line.ficha_tecnica_ingrediente_id;
      if(!id)return 'Selecione um item ou uma sub-receita na linha '+(i+1)+'.';
      if(!Number.isFinite(line.quantidade)||line.quantidade<=0)return 'Quantidade inválida na linha '+(i+1)+'.';
      if(line.tipo==='ficha'&&!Number.isInteger(line.quantidade))return 'A quantidade de porções deve ser inteira na linha '+(i+1)+'.';
      if(line.tipo==='item'&&!itemById.has(id))return 'Item não localizado no cadastro na linha '+(i+1)+'.';
      if(line.tipo==='ficha'&&!fichaById.has(id))return 'Sub-receita não localizada na linha '+(i+1)+'.';
      if(id===currentId)return 'Uma ficha não pode usar a si mesma como ingrediente.';
    }
    return '';
  };
  const save=async(ev:React.FormEvent)=>{
    ev.preventDefault();
    if(loading||busy)return;
    const issue=validate();
    if(issue){setError(issue);return;}
    if(!window.confirm('Salvar esta ficha técnica no cadastro OFICIAL do Gorjeta Pro?'))return;
    setBusy(true);setError('');
    let savedId=currentId;
    let parentSaved=false;
    let ingredientsDeleted=false;
    const oldFicha=ficha?{
      nome:ficha.nome,porcoes:ficha.porcoes,custo_total:ficha.custo_total,ativo:ficha.ativo,
      tipo_consumo:ficha.tipo_consumo,modo_preparo:ficha.modo_preparo,observacoes_preparo:ficha.observacoes_preparo,
      rendimento:ficha.rendimento,unidade_rendimento:ficha.unidade_rendimento
    }:null;
    try{
      const base={
        nome:form.nome.trim(),porcoes:form.porcoes,custo_total:total,ativo:form.ativo,
        tipo_consumo:form.tipo_consumo,modo_preparo:form.modo_preparo||null,
        observacoes_preparo:form.observacoes_preparo||null,
        rendimento:form.rendimento,unidade_rendimento:form.unidade_rendimento
      };
      if(savedId){
        const{error:e}=await supabase.from('fichas_tecnicas').update(base).eq('id',savedId);
        if(e)throw e;
      }else{
        const{data,error:e}=await supabase.from('fichas_tecnicas').insert([base]).select('id').single();
        if(e)throw e;
        savedId=String(data.id);
      }
      parentSaved=true;
      if(currentId){
        const{error:e}=await supabase.from('ficha_ingredientes').delete().eq('ficha_id',savedId);
        if(e)throw e;
        ingredientsDeleted=true;
      }
      const ingredients=form.ingredientes.map((line,index)=>({
        ficha_id:savedId,
        item_estoque_id:line.tipo==='item'?line.item_estoque_id:null,
        ficha_tecnica_ingrediente_id:line.tipo==='ficha'?line.ficha_tecnica_ingrediente_id:null,
        quantidade:line.quantidade,ordem:index+1,
        observacoes:line.observacoes||null,baixa_estoque:line.baixa_estoque!==false
      }));
      const{error:ingError}=await supabase.from('ficha_ingredientes').insert(ingredients);
      if(ingError)throw ingError;
      await onSaved(savedId);
    }catch(e){
      let rollbackError='';
      if(parentSaved){
        if(!currentId&&savedId){
          const{error:rollback}=await supabase.from('fichas_tecnicas').delete().eq('id',savedId);
          if(rollback)rollbackError=' A ficha nova pode ter sido criada parcialmente; confira antes de tentar novamente.';
        }else if(currentId&&savedId){
          if(ingredientsDeleted){
            const original=originalIngredients.current.map(r=>({
              ficha_id:savedId,item_estoque_id:r.item_estoque_id||null,
              ficha_tecnica_ingrediente_id:r.ficha_tecnica_ingrediente_id||null,
              quantidade:r.quantidade,ordem:r.ordem||0,
              observacoes:r.observacoes||null,baixa_estoque:r.baixa_estoque!==false
            }));
            if(original.length){
              const{error:rollback}=await supabase.from('ficha_ingredientes').insert(original);
              if(rollback)rollbackError=' Os ingredientes podem não ter sido restaurados; confira a ficha no sistema.';
            }
          }
          if(oldFicha){
            const{error:rollback}=await supabase.from('fichas_tecnicas').update(oldFicha).eq('id',savedId);
            if(rollback)rollbackError=' A ficha pode ter sido salva parcialmente; confira o cadastro oficial.';
          }
        }
      }
      setError((e instanceof Error?e.message:'Erro ao salvar a ficha técnica.')+rollbackError);
    }finally{setBusy(false);}
  };
  const label=(title:string,key:keyof Form,type='text',wide=false)=><label className={'b2-field'+(wide?' b2-ficha-wide':'')}>
    <span>{title}</span><input type={type} value={String(form[key]??'')} min={type==='number'?'0':undefined} step={key==='porcoes'?'1':'any'}
      onChange={e=>update(key,(type==='number'?Number(e.target.value):e.target.value) as Form[keyof Form])}/></label>;
  return <div className="b2-ficha-editor" ref={editorRef}>
   <div className="b2-ficha-titlebar">
    <div><span className="b2-ficha-badge">FICHA TÉCNICA · CADASTRO REAL</span>
     <h2>{currentId?'Editar ficha técnica':'Nova ficha técnica'}</h2>
     <p>{currentId?'Atualize a receita existente sem trocar seu identificador no banco.':'Cadastre uma receita com ingredientes e custo calculado.'}</p>
    </div>
    <button className="b2-btn alt" type="button" onClick={onClose}><X size={16} style={{display:'inline',marginRight:6}}/>Fechar</button>
   </div>
   <div className="b2-hint">Mesmo cadastro e campos do Gorjeta Pro, mas formulário com o layout do Beta 2. Salvar altera a ficha oficial. Nenhum saldo é movimentado ao cadastrar a receita.</div>
   {loading?<div className="b2-card">Carregando ingredientes e itens cadastrados...</div>:<form onSubmit={save}>
    <section className="b2-ficha-section">
     <div className="b2-ficha-section-title"><div><h3>01 · Identificação e rendimento</h3><p>Nome, porções e características da ficha.</p></div></div>
     <div className="b2-ficha-grid">
      {label('Nome da ficha *','nome','text',true)}
      {label('Porções *','porcoes','number')}
      {label('Rendimento *','rendimento','number')}
      <label className="b2-field"><span>Unidade de rendimento *</span><input value={form.unidade_rendimento} onChange={e=>update('unidade_rendimento',e.target.value)} placeholder="Ex.: porções, kg, unidades"/></label>
      <label className="b2-ficha-check"><input type="checkbox" checked={form.ativo} onChange={e=>update('ativo',e.target.checked)}/><span>Ficha ativa</span></label>
     </div>
    </section>
    <section className="b2-ficha-section">
     <div className="b2-ficha-section-title"><div><h3>02 · Tipo de consumo</h3><p>A mesma distinção entre produção prévia e venda direta do cadastro original.</p></div></div>
     <div className="b2-ficha-radios">
      <label className={'b2-ficha-radio'+(form.tipo_consumo==='producao'?' active':'')}><input type="radio" name="tipo_consumo" checked={form.tipo_consumo==='producao'} onChange={()=>update('tipo_consumo','producao')}/>
       <span><strong>Produção prévia</strong><small>Requer ordem de produção. Os insumos baixam na produção e o produto final, na venda.</small></span></label>
      <label className={'b2-ficha-radio'+(form.tipo_consumo==='venda_direta'?' active':'')}><input type="radio" name="tipo_consumo" checked={form.tipo_consumo==='venda_direta'} onChange={()=>update('tipo_consumo','venda_direta')}/>
       <span><strong>Venda direta</strong><small>Sem ordem de produção; os insumos são baixados a cada venda.</small></span></label>
     </div>
    </section>
    <section className="b2-ficha-section">
     <div className="b2-ficha-section-title"><div><h3>03 · Ingredientes e sub-receitas</h3><p>Itens do estoque e outras fichas técnicas, com custo automático por quantidade.</p></div>
      <button className="b2-btn" type="button" onClick={add}><Plus size={15} style={{display:'inline',marginRight:5}}/>Adicionar ingrediente</button>
     </div>
     {form.ingredientes.length===0&&<div className="b2-hint">Nenhum ingrediente. Clique em “Adicionar ingrediente” para começar.</div>}
     {form.ingredientes.map((line,index)=>{
       const item=line.tipo==='item'?itemById.get(line.item_estoque_id):null;
       const recipe=line.tipo==='ficha'?fichaById.get(line.ficha_tecnica_ingrediente_id):null;
       const search=(ingredientSearch[index]||'').toLocaleLowerCase('pt-BR').trim();
       // A seleção existente precisa permanecer no select mesmo quando há milhares
       // de itens e o limite de sugestões seria atingido antes de chegar nela.
       const availableItems=items.filter(i=>(i.status==='ativo'||i.id===line.item_estoque_id)
         &&(i.id===line.item_estoque_id||(i.nome+' '+(i.codigo||'')).toLocaleLowerCase('pt-BR').includes(search)))
         .sort((a,b)=>Number(b.id===line.item_estoque_id)-Number(a.id===line.item_estoque_id)).slice(0,130);
       const availableFichas=fichas.filter(f=>f.id!==currentId&&f.id!==''
         &&(f.ativo!==false||f.id===line.ficha_tecnica_ingrediente_id)
         &&(f.id===line.ficha_tecnica_ingrediente_id||f.nome.toLocaleLowerCase('pt-BR').includes(search)))
         .sort((a,b)=>Number(b.id===line.ficha_tecnica_ingrediente_id)-Number(a.id===line.ficha_tecnica_ingrediente_id)).slice(0,130);
       return <div className="b2-ficha-ingredient" key={index}>
        <div className="b2-ficha-ingredient-head"><strong>Ingrediente {index+1}</strong><button className="b2-btn alt small" type="button" onClick={()=>remove(index)}><Trash2 size={14} style={{display:'inline',marginRight:5}}/>Remover</button></div>
        <div className="b2-ficha-ingredient-grid">
         <label className="b2-field"><span>Origem *</span><select value={line.tipo} onChange={e=>{updateIngredient(index,'tipo',e.target.value as Kind);setIngredientSearch(p=>({...p,[index]:''}));}}>
           <option value="item">Item de estoque</option><option value="ficha">Ficha técnica</option></select></label>
         <div className="b2-ficha-picker">
          <label className="b2-field"><span>{line.tipo==='item'?'Buscar item':'Buscar sub-receita'}</span><input type="search" value={ingredientSearch[index]||''}
           onChange={e=>setIngredientSearch(p=>({...p,[index]:e.target.value}))} placeholder="Digite nome ou código para filtrar"/></label>
          <label className="b2-field" style={{marginTop:8}}><span>{line.tipo==='item'?'Item *':'Ficha técnica *'}</span>
           <select value={line.tipo==='item'?line.item_estoque_id:line.ficha_tecnica_ingrediente_id}
            onChange={e=>updateIngredient(index,line.tipo==='item'?'item_estoque_id':'ficha_tecnica_ingrediente_id',e.target.value)}>
            <option value="">Selecione...</option>
            {line.tipo==='item'?availableItems.map(i=><option key={i.id} value={i.id}>{i.codigo?i.codigo+' — ':''}{i.nome} ({i.unidade_medida})</option>):
             availableFichas.map(f=><option key={f.id} value={f.id}>{f.nome} — {brl(asNumber(f.custo_total)/Math.max(1,asNumber(f.porcoes)))} / porção</option>)}
           </select>
          </label>
          {search.length>0&&<small>{line.tipo==='item'?availableItems.length:availableFichas.length} opção(ões) nesta busca. Refine para localizar melhor.</small>}
         </div>
         <label className="b2-field"><span>Quantidade *</span><input type="number" min={line.tipo==='ficha'?'1':'0.001'} step={line.tipo==='ficha'?'1':'0.001'} value={line.quantidade}
          onChange={e=>updateIngredient(index,'quantidade',Number(e.target.value)||0)}/><small>{line.tipo==='item'?(item?.unidade_medida||'unidade do item'):'porções'}</small></label>
        </div>
        <div className="b2-ficha-costrow"><label className="b2-ficha-check"><input type="checkbox" checked={line.baixa_estoque} onChange={e=>updateIngredient(index,'baixa_estoque',e.target.checked)}/>
          <span>{line.baixa_estoque?'📦 Dá baixa no estoque':'📋 Somente receita (sem baixa)'}</span></label>
          <div> Custo da linha: <strong>{brl(cost(line))}</strong></div>
        </div>
        {line.tipo==='ficha'&&recipe&&<small>Sub-receita: {recipe.nome} · {brl(asNumber(recipe.custo_total)/Math.max(1,asNumber(recipe.porcoes)))}/porção</small>}
        <label className="b2-field" style={{marginTop:10}}><span>Observações deste ingrediente</span><input value={line.observacoes} onChange={e=>updateIngredient(index,'observacoes',e.target.value)} placeholder="Ex.: picado, ralado, sem pele..."/></label>
       </div>;
     })}
     <div className="b2-ficha-help">Custo de cada item = custo médio × quantidade. Custo de sub-receita = (custo total ÷ porções) × quantidade. A opção “Dá baixa” não altera o cálculo do custo.</div>
    </section>
    <section className="b2-ficha-section">
     <div className="b2-ficha-section-title"><div><h3>04 · Modo de preparo</h3><p>Instruções e cuidados, como no formulário original.</p></div></div>
     <div className="b2-ficha-grid">
      <label className="b2-field b2-ficha-wide"><span>Passo a passo da receita</span><textarea rows={6} value={form.modo_preparo} onChange={e=>update('modo_preparo',e.target.value)} placeholder="Descreva o preparo da receita..."/></label>
      <label className="b2-field b2-ficha-wide"><span>Observações de preparo</span><textarea rows={3} value={form.observacoes_preparo} onChange={e=>update('observacoes_preparo',e.target.value)} placeholder="Dicas, cuidados especiais, tempo de preparo..."/></label>
     </div>
    </section>
    <section className="b2-ficha-section">
     <div className="b2-ficha-section-title"><h3>05 · Resumo de custos</h3></div>
     <div className="b2-ficha-totals"><div className="b2-ficha-total"><small>Custo total da ficha</small><strong>{brl(total)}</strong></div>
      <div className="b2-ficha-total"><small>Custo por porção ({form.porcoes} porções)</small><strong>{brl(form.porcoes>0?total/form.porcoes:0)}</strong></div>
     </div>
    </section>
    {error&&<div className="b2-error" role="alert">{error}</div>}
    <div className="b2-ficha-actions"><button type="button" className="b2-btn alt" onClick={onClose} disabled={busy}>Cancelar</button>
     <button type="submit" className="b2-btn" disabled={busy}><Check size={16}/>{busy?'Salvando...':'Salvar ficha técnica oficial'}</button></div>
   </form>}
   {loading&&error&&<div className="b2-error">{error}</div>}
  </div>;
};
export default EditorFichaTecnicaBeta2;
