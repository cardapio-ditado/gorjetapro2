import { useState, useEffect, useRef } from 'react';
import {
  Search, RefreshCw, CheckCircle, XCircle, Clock,
  Package, AlertTriangle, Info, Play, Warehouse, Link2, X, Check,
  EyeOff, Eye, Map, ChevronDown, Zap, List
} from 'lucide-react';
import { PageHeader, KPICard, SectionCard } from '../components/ui';

const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// ── tipos ─────────────────────────────────────────────────────────────────
interface Estoque     { id: string; nome: string; }
interface ItemEstoque { id: string; nome: string; unidade_medida: string; custo_medio: number; }
interface Ficha       { id: string; nome: string; custo_total: number; porcoes: number; }

interface ProdutoZig {
  productId: string; productName: string; productSku: string|null;
  productCategory: string|null; count: number; eventDate: string;
  mapeado: boolean; ignorar_estoque: boolean;
  eh_produto_composto?: boolean;
  expandido_de?: string|null;
  additions_expandidos?: string[]|null;
  mapeamento: { item_estoque_id:string|null; ficha_tecnica_id:string|null; estoque_id:string|null; tipo_mapeamento:string|null; ignorar_estoque:boolean; }|null;
}
interface ProdutoEditavel extends ProdutoZig {
  estoqueId: string; vinculoTipo: 'item'|'ficha'|'';
  itemEstoqueId: string; fichaId: string;
  ignorado: boolean; salvandoIgnore: boolean;
}
interface SyncLog {
  id: string; iniciado_em: string; finalizado_em: string|null; status: string;
  dtinicio: string; dtfim: string;
  total_produtos_zig: number; total_mapeados: number;
  total_movimentacoes: number; total_duplicados: number;
  total_ignorados: number; erro_mensagem: string|null;
  itens_processados: {nome:string;quantidade:number;data_venda:string;movimentacoes:number}[]|null;
  itens_ignorados:   {nome:string;motivo:string}[]|null;
  itens_pendentes:   {nome:string;quantidade:number;motivo:string}[]|null;
}
interface ProdutoCatalogo {
  productName: string; productCategory: string|null; totalVendido: number;
  mapeado: boolean; ignorar: boolean;
  mapeamento: { item_estoque_id:string|null; ficha_tecnica_id:string|null; estoque_id:string|null; ignorar_estoque:boolean; }|null;
  sugestaoItem:  { id:string; nome:string; score:number }|null;
  sugestaoFicha: { id:string; nome:string; score:number }|null;
}

type Etapa = 'busca'|'revisao'|'resultado';
type Aba   = 'lancamentos'|'mapeamento';

// ── helpers ────────────────────────────────────────────────────────────────
function norm(s: string): string {
  return (s||'').replace(/\t/g,' ').trim().toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g,'')
    .replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
}
function sim(a: string, b: string): number {
  const na=norm(a), nb=norm(b);
  if (!na||!nb) return 0; if (na===nb) return 1;
  if (na.includes(nb)||nb.includes(na)) return 0.9;
  const wa=na.split(' ').filter(w=>w.length>2);
  const wb=nb.split(' ').filter(w=>w.length>2);
  let h=0; for(const w of wa) if(wb.some(x=>x.includes(w)||w.includes(x))) h++;
  return wa.length ? h/Math.max(wa.length,wb.length) : 0;
}

// ════════════════════════════════════════════════════════════════════════════
// ABA MAPEAMENTO — usa catálogo completo da Zig
// ════════════════════════════════════════════════════════════════════════════
function AbaMapeamento() {
  // Carrega direto do banco — independente das vendas da Zig
  const [carregando, setCarregando] = useState(true);
  const [mapeamentos, setMapeamentos] = useState<any[]>([]);
  const [itens, setItens]     = useState<ItemEstoque[]>([]);
  const [fichas, setFichas]   = useState<Ficha[]>([]);
  const [estoques, setEstoques] = useState<Estoque[]>([]);
  const [search, setSearch]   = useState('');
  const [filtro, setFiltro]   = useState<'pendentes'|'todos'|'mapeados'>('pendentes');
  const [expandido, setExpandido] = useState<string|null>(null);
  const [salvando, setSalvando]   = useState<string|null>(null);
  const [msg, setMsg]             = useState<{ok:boolean;texto:string}|null>(null);
  const [pagina, setPagina]         = useState(0);
  const POR_PAGINA = 50;
  const [edits, setEdits]         = useState<Record<string,{
    tipo:'item'|'ficha'|''; item_id:string; ficha_id:string;
    estoque_id:string; ignorar:boolean; busca:string;
  }>>({});

  useEffect(() => { carregar(); }, []);

  const carregar = async () => {
    setCarregando(true);
    try {
      // Busca tudo do banco em paralelo — sem chamar a Zig
      const [resMap, resItens, resFichas, resEstoques] = await Promise.all([
        fetch(`${SUPABASE_URL}/rest/v1/mapeamento_itens_vendas?select=nome_externo,nome_normalizado,item_estoque_id,ficha_tecnica_id,estoque_id,ignorar_estoque&order=nome_externo`,
          { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }),
        fetch(`${SUPABASE_URL}/rest/v1/itens_estoque?select=id,nome,unidade_medida,custo_medio&status=eq.ativo&order=nome&limit=600`,
          { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }),
        fetch(`${SUPABASE_URL}/rest/v1/fichas_tecnicas?select=id,nome,custo_total,porcoes&ativo=eq.true&order=nome`,
          { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }),
        fetch(`${SUPABASE_URL}/rest/v1/estoques?select=id,nome&status=eq.true&order=nome`,
          { headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}` } }),
      ]);

      const [mapData, itensData, fichasData, estoquesData] = await Promise.all([
        resMap.json(), resItens.json(), resFichas.json(), resEstoques.json()
      ]);

      const mapList: any[] = Array.isArray(mapData) ? mapData : [];
      const itensList: ItemEstoque[] = Array.isArray(itensData) ? itensData : [];
      const fichasList: Ficha[]      = Array.isArray(fichasData) ? fichasData : [];
      const estoquesList: Estoque[]  = Array.isArray(estoquesData) ? estoquesData : [];

      setMapeamentos(mapList);
      setItens(itensList);
      setFichas(fichasList);
      setEstoques(estoquesList);

      // Inicializa edits com valores já salvos
      const e: typeof edits = {};
      for (const m of mapList) {
        e[m.nome_externo] = {
          tipo:       m.ficha_tecnica_id ? 'ficha' : m.item_estoque_id ? 'item' : '',
          item_id:    m.item_estoque_id  || '',
          ficha_id:   m.ficha_tecnica_id || '',
          estoque_id: m.estoque_id       || '',
          ignorar:    m.ignorar_estoque  || false,
          busca:      '',
        };
      }
      setEdits(e);
    } catch(err: any) {
      setMsg({ ok:false, texto: err.message });
    }
    setCarregando(false);
  };

  const setEdit = (nome: string, changes: Partial<typeof edits[string]>) =>
    setEdits(prev => ({ ...prev, [nome]: { ...prev[nome], ...changes } }));

  const vinculado = (m: any) => {
    const e = edits[m.nome_externo];
    return e?.ignorar || !!(e?.item_id || e?.ficha_id);
  };

  const stats = {
    total:    mapeamentos.length,
    mapeados: mapeamentos.filter(m => vinculado(m)).length,
    pendentes:mapeamentos.filter(m => !vinculado(m)).length,
  };
  const pct = stats.total > 0 ? Math.round(stats.mapeados/stats.total*100) : 0;

  // Reseta página ao mudar filtro/busca
  useEffect(() => { setPagina(0); }, [filtro, search]);

  const filtrados = mapeamentos.filter(m => {
    const e = edits[m.nome_externo];
    const ok = filtro==='todos' ? true
             : filtro==='pendentes' ? !vinculado(m)
             : vinculado(m);
    return ok && (!search || norm(m.nome_externo).includes(norm(search)));
  });

  const salvar = async (nome: string) => {
    const edit = edits[nome]; if (!edit) return;
    if (!edit.ignorar && (!edit.estoque_id || (edit.tipo==='item'?!edit.item_id:!edit.ficha_id))) {
      setMsg({ ok:false, texto:'Preencha estoque e item/ficha antes de salvar.' }); return;
    }
    setSalvando(nome);
    try {
      const body: any = {
        nome_externo:     nome,
        nome_normalizado: norm(nome),
        item_estoque_id:  (!edit.ignorar && edit.tipo==='item')  ? edit.item_id  || null : null,
        ficha_tecnica_id: (!edit.ignorar && edit.tipo==='ficha') ? edit.ficha_id || null : null,
        estoque_id:       !edit.ignorar ? (edit.estoque_id || null) : null,
        ignorar_estoque:  edit.ignorar,
        tipo_mapeamento:  'manual',
      };

      // PATCH se já existe, POST se não existe
      const check = await fetch(
        `${SUPABASE_URL}/rest/v1/mapeamento_itens_vendas?nome_externo=eq.${encodeURIComponent(nome)}&select=id`,
        { headers: { apikey:SUPABASE_ANON, Authorization:`Bearer ${SUPABASE_ANON}` } }
      );
      const existing = await check.json();

      if (Array.isArray(existing) && existing.length > 0) {
        await fetch(`${SUPABASE_URL}/rest/v1/mapeamento_itens_vendas?id=eq.${existing[0].id}`, {
          method:'PATCH',
          headers:{ apikey:SUPABASE_ANON, Authorization:`Bearer ${SUPABASE_ANON}`, 'Content-Type':'application/json', Prefer:'return=minimal' },
          body: JSON.stringify(body)
        });
      } else {
        await fetch(`${SUPABASE_URL}/rest/v1/mapeamento_itens_vendas`, {
          method:'POST',
          headers:{ apikey:SUPABASE_ANON, Authorization:`Bearer ${SUPABASE_ANON}`, 'Content-Type':'application/json', Prefer:'return=minimal' },
          body: JSON.stringify(body)
        });
      }

      // Atualiza estado local
      setMapeamentos(prev => prev.map(m =>
        m.nome_externo === nome
          ? { ...m, item_estoque_id: body.item_estoque_id, ficha_tecnica_id: body.ficha_tecnica_id, estoque_id: body.estoque_id, ignorar_estoque: body.ignorar_estoque }
          : m
      ));
      setExpandido(null);
      setMsg({ ok:true, texto:`"${nome}" salvo!` });
      setTimeout(() => setMsg(null), 2500);
    } catch(e:any) { setMsg({ ok:false, texto:e.message }); }
    setSalvando(null);
  };

  if (carregando) return (
    <div className="flex flex-col items-center justify-center py-20 gap-4">
      <div className="w-10 h-10 border-4 border-[#7D1F2C]/20 border-t-[#7D1F2C] rounded-full animate-spin"/>
      <p className="text-white/40 text-sm">Carregando central de mapeamento...</p>
    </div>
  );

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white flex items-center gap-2">
          <Map size={20} className="text-[#7D1F2C]"/> Central de Mapeamento
        </h1>
        <p className="text-sm text-white/40 mt-1">
          Vincule cada produto do cardápio com o item ou ficha técnica do estoque. Independente das vendas — mapeie quando quiser.
        </p>
      </div>

      {msg && (
        <div className={`rounded-xl p-3 text-sm flex items-center gap-2 border ${msg.ok?'bg-green-500/10 border-green-500/30 text-green-400':'bg-red-500/10 border-red-500/30 text-red-400'}`}>
          {msg.ok?<CheckCircle size={14}/>:<AlertTriangle size={14}/>} {msg.texto}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {label:'Total no cardápio', val:stats.total,    color:'text-white/80',  bg:'bg-white/5',  border:'border-white/10'},
          {label:'Vinculados',        val:stats.mapeados, color:'text-green-400', bg:'bg-green-500/10', border:'border-green-500/30'},
          {label:'Pendentes',         val:stats.pendentes,color:'text-amber-400', bg:'bg-amber-500/10', border:'border-amber-500/30'},
        ].map(s=>(
          <div key={s.label} className={`${s.bg} border ${s.border} rounded-2xl p-4 text-center`}>
            <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
            <p className="text-xs text-white/40 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      <div>
        <div className="w-full bg-white/10 rounded-full h-3 overflow-hidden">
          <div className={`h-3 rounded-full transition-all duration-500 ${pct>=80?'bg-green-500':pct>=50?'bg-amber-400':'bg-red-400'}`} style={{width:`${pct}%`}}/>
        </div>
        <p className="text-xs text-white/30 text-center mt-1">{pct}% do cardápio vinculado ao estoque</p>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"/>
          <input type="text" placeholder={`Buscar entre ${stats.total} produtos...`} value={search}
            onChange={e=>setSearch(e.target.value)}
            className="w-full bg-[#1a1d2e] text-white border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/30"/>
        </div>
        <button onClick={carregar} className="flex items-center gap-2 px-3 py-2 rounded-xl border border-white/10 text-sm text-white/40 hover:bg-white/5">
          <RefreshCw size={13}/> Atualizar
        </button>
        {(['pendentes','todos','mapeados'] as const).map(f=>(
          <button key={f} onClick={()=>setFiltro(f)}
            className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${filtro===f?'bg-[#7D1F2C] text-white border-[#7D1F2C]':'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'}`}>
            {f==='pendentes'?`⚠ Pendentes (${stats.pendentes})`:f==='mapeados'?`✓ Vinculados (${stats.mapeados})`:'Todos'}
          </button>
        ))}
      </div>

      {filtrados.length === 0 && (
        <div className="text-center py-16 text-white/30">
          <Map size={40} className="mx-auto mb-3 opacity-20"/>
          {filtro==='pendentes' ? '🎉 Todos os produtos estão vinculados!' : 'Nenhum produto encontrado'}
        </div>
      )}

      {/* Paginação */}
      {filtrados.length > POR_PAGINA && (
        <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl px-4 py-2">
          <span className="text-xs text-white/40">
            Mostrando {pagina*POR_PAGINA+1}–{Math.min((pagina+1)*POR_PAGINA, filtrados.length)} de {filtrados.length}
          </span>
          <div className="flex gap-2">
            <button onClick={()=>setPagina(p=>Math.max(0,p-1))} disabled={pagina===0}
              className="px-3 py-1 rounded-lg border border-white/10 text-xs text-white/60 disabled:opacity-40 hover:bg-[#12141f]">
              ← Anterior
            </button>
            <button onClick={()=>setPagina(p=>Math.min(Math.ceil(filtrados.length/POR_PAGINA)-1,p+1))}
              disabled={(pagina+1)*POR_PAGINA>=filtrados.length}
              className="px-3 py-1 rounded-lg border border-white/10 text-xs text-white/60 disabled:opacity-40 hover:bg-[#12141f]">
              Próximo →
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {filtrados.slice(pagina*POR_PAGINA, (pagina+1)*POR_PAGINA).map(m => {
          const edit  = edits[m.nome_externo] || {tipo:'',item_id:'',ficha_id:'',estoque_id:'',ignorar:false,busca:''};
          const isExp = expandido === m.nome_externo;
          const ok    = vinculado(m);
          const itemNome  = itens.find(i=>i.id===edit.item_id)?.nome   || itens.find(i=>i.id===m.item_estoque_id)?.nome   || '';
          const fichaNome = fichas.find(f=>f.id===edit.ficha_id)?.nome || fichas.find(f=>f.id===m.ficha_tecnica_id)?.nome || '';
          const estqNome  = estoques.find(e=>e.id===edit.estoque_id)?.nome || '';

          // Sugestão por similaridade para pendentes
          const melhorItem = !ok && !edit.ignorar
            ? [...itens].sort((a,b)=>sim(m.nome_externo,b.nome)-sim(m.nome_externo,a.nome))[0]
            : null;
          const melhorScore = melhorItem ? Math.round(sim(m.nome_externo, melhorItem.nome)*100) : 0;

          const itensFiltrados = edit.busca
            ? itens.filter(i=>norm(i.nome).includes(norm(edit.busca))).slice(0,15)
            : [...itens].sort((a,b)=>sim(m.nome_externo,b.nome)-sim(m.nome_externo,a.nome)).slice(0,10);
          const fichasFiltradas = edit.busca
            ? fichas.filter(f=>norm(f.nome).includes(norm(edit.busca))).slice(0,15)
            : [...fichas].sort((a,b)=>sim(m.nome_externo,b.nome)-sim(m.nome_externo,a.nome)).slice(0,10);

          return (
            <div key={m.nome_externo}
              className={`bg-[#12141f] rounded-2xl border shadow-sm overflow-hidden transition-all ${edit.ignorar?'border-white/10 opacity-70':ok?'border-green-500/30':'border-amber-500/40'}`}>

              {/* Linha principal */}
              <div className={`flex items-center justify-between px-4 py-3 ${edit.ignorar?'bg-white/5':ok?'bg-green-500/10':'bg-amber-500/10'}`}>
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  {edit.ignorar     ? <EyeOff size={14} className="text-white/30 flex-shrink-0"/>
                  : ok              ? <Check  size={14} className="text-green-400 flex-shrink-0"/>
                  :                   <AlertTriangle size={14} className="text-amber-500 flex-shrink-0"/>}
                  <div className="min-w-0">
                    <p className={`font-semibold text-sm truncate ${edit.ignorar?'line-through text-white/30':'text-white'}`}>
                      {m.nome_externo}
                    </p>
                    <div className="flex items-center gap-2 flex-wrap mt-0.5">
                      {ok && !edit.ignorar && (
                        <span className="text-xs text-green-400 font-medium">
                          → {itemNome||fichaNome||'?'}{estqNome?` · ${estqNome}`:''}
                        </span>
                      )}
                      {edit.ignorar && <span className="text-xs text-white/30">ignorado — não baixa estoque</span>}
                      {!ok && melhorScore >= 50 && (
                        <span className="text-xs text-blue-500 flex items-center gap-1">
                          <Zap size={10}/> Sugestão: {melhorItem?.nome} ({melhorScore}%)
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <button onClick={()=>setExpandido(isExp?null:m.nome_externo)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-white/10 bg-[#12141f] text-xs font-medium text-white/60 hover:border-[#7D1F2C] hover:text-[#7D1F2C] transition-all flex-shrink-0 ml-2">
                  {isExp?'Fechar':ok?'Editar':'Vincular'}
                  <ChevronDown size={11} className={`transition-transform ${isExp?'rotate-180':''}`}/>
                </button>
              </div>

              {/* Painel expandido */}
              {isExp && (
                <div className="px-4 py-4 border-t border-white/5 space-y-4">
                  <label className="flex items-center gap-2 cursor-pointer w-fit">
                    <input type="checkbox" checked={edit.ignorar}
                      onChange={e=>setEdit(m.nome_externo,{ignorar:e.target.checked})}
                      className="accent-red-500 w-4 h-4"/>
                    <span className="text-sm text-red-500 font-medium">Ignorar — não baixar estoque (Gorjeta, Entrada, Promoção...)</span>
                  </label>

                  {!edit.ignorar && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-2 flex items-center gap-1">
                          <Link2 size={11}/> Vincular a
                        </p>
                        <div className="flex gap-2 mb-3">
                          {(['item','ficha'] as const).map(t=>(
                            <button key={t} onClick={()=>setEdit(m.nome_externo,{tipo:t,item_id:'',ficha_id:'',busca:''})}
                              className={`flex-1 py-2 rounded-xl text-xs font-medium border transition-colors ${edit.tipo===t?'bg-[#7D1F2C] text-white border-[#7D1F2C]':'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'}`}>
                              {t==='item'?'📦 Item de estoque':'📋 Ficha técnica'}
                            </button>
                          ))}
                        </div>

                        {(edit.item_id||edit.ficha_id) && (
                          <div className="flex items-center gap-2 mb-2">
                            <div className="flex-1 bg-green-500/10 border border-green-500/30 rounded-xl px-3 py-2 text-sm text-green-400 font-medium">
                              ✓ {edit.tipo==='item'?itemNome:fichaNome}
                            </div>
                            <button onClick={()=>setEdit(m.nome_externo,{item_id:'',ficha_id:'',busca:''})}
                              className="p-2 text-white/30 hover:text-red-500"><X size={14}/></button>
                          </div>
                        )}

                        {edit.tipo && (
                          <>
                            <div className="relative mb-2">
                              <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"/>
                              <input type="text"
                                placeholder={`Buscar ${edit.tipo==='item'?'item de estoque':'ficha técnica'}...`}
                                value={edit.busca} autoFocus
                                onChange={e=>setEdit(m.nome_externo,{busca:e.target.value})}
                                className="w-full bg-[#1a1d2e] text-white border border-white/10 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/30"/>
                            </div>
                            <div className="border border-white/10 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                              {(edit.tipo==='item'?itensFiltrados:fichasFiltradas).map(x=>{
                                const s   = Math.round(sim(m.nome_externo, x.nome)*100);
                                const sel = edit.tipo==='item' ? edit.item_id===x.id : edit.ficha_id===x.id;
                                return (
                                  <button key={x.id}
                                    onClick={()=>setEdit(m.nome_externo, edit.tipo==='item'?{item_id:x.id,busca:''}:{ficha_id:x.id,busca:''})}
                                    className={`w-full text-left px-3 py-2.5 text-sm border-b border-white/5 last:border-0 flex items-center justify-between transition-colors ${sel?'bg-[#7D1F2C]/5 font-semibold text-[#7D1F2C]':'hover:bg-white/5 text-white/80'}`}>
                                    <div className="flex items-center gap-2 min-w-0">
                                      {sel && <Check size={12} className="text-[#7D1F2C] flex-shrink-0"/>}
                                      <span className="truncate">{x.nome}</span>
                                    </div>
                                    {s>=45 && (
                                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full flex-shrink-0 ml-2 ${s>=75?'bg-green-500/15 text-green-400':s>=50?'bg-amber-500/15 text-amber-400':'bg-white/10 text-white/40'}`}>
                                        {s}%
                                      </span>
                                    )}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                        {!edit.tipo && <p className="text-xs text-amber-400 italic">Escolha se é item de estoque ou ficha técnica</p>}
                      </div>

                      <div>
                        <p className="text-xs font-semibold text-white/40 uppercase tracking-wide mb-2 flex items-center gap-1">
                          <Warehouse size={11}/> Dar baixa em qual estoque?
                        </p>
                        <div className="space-y-2">
                          {estoques.map(e=>(
                            <label key={e.id}
                              className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${edit.estoque_id===e.id?'border-[#7D1F2C] bg-[#7D1F2C]/5':'border-white/10 hover:border-white/20 hover:bg-white/5'}`}>
                              <input type="radio" name={`est_${m.nome_externo}`}
                                checked={edit.estoque_id===e.id}
                                onChange={()=>setEdit(m.nome_externo,{estoque_id:e.id})}
                                className="accent-[#7D1F2C] w-4 h-4"/>
                              <span className={`text-sm font-medium ${edit.estoque_id===e.id?'text-[#7D1F2C]':'text-white/80'}`}>{e.nome}</span>
                            </label>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div className="flex gap-2 pt-2 border-t border-white/5">
                    <button onClick={()=>setExpandido(null)}
                      className="px-4 py-2 rounded-xl border border-white/10 text-sm text-white/40 hover:bg-white/5">
                      Cancelar
                    </button>
                    <button onClick={()=>salvar(m.nome_externo)}
                      disabled={salvando===m.nome_externo||(!edit.ignorar&&(!edit.tipo||(!edit.item_id&&!edit.ficha_id)||!edit.estoque_id))}
                      className="flex-1 py-2 rounded-xl bg-[#7D1F2C] disabled:opacity-40 text-white text-sm font-bold hover:bg-[#6a1a25] transition-colors">
                      {salvando===m.nome_externo ? 'Salvando...' : edit.ignorar ? '✓ Marcar como Ignorado' : '✓ Salvar Vínculo'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}



// ════════════════════════════════════════════════════════════════════════════
// TELA DE REVISÃO — filtro encapsulado como state interno do componente
// ════════════════════════════════════════════════════════════════════════════
function AbaRevisao({
  dtinicio, dtfim, produtos, estoques, itens, fichas,
  update, toggleIgnorar, handleProcessar, processando,
  onVoltar, onMapeamento,
}: {
  dtinicio:string; dtfim:string; produtos:ProdutoEditavel[];
  estoques:Estoque[]; itens:ItemEstoque[]; fichas:Ficha[];
  update:(id:string,c:Partial<ProdutoEditavel>)=>void;
  toggleIgnorar:(p:ProdutoEditavel)=>void;
  handleProcessar:()=>void; processando:boolean;
  onVoltar:()=>void; onMapeamento:()=>void;
}) {
  // Tudo calculado AQUI DENTRO — sem depender de props derivadas do pai
  const [filtro, setFiltro] = useState<'todos'|'prontos'|'pendentes'|'ignorados'|'expandidos'>('todos');
  const [buscaVinculo, setBuscaVinculo] = useState<Record<string,string>>({});

  const pronto = (p:ProdutoEditavel) => p.ignorado || !!(p.estoqueId && (p.itemEstoqueId || p.fichaId));
  const ativos    = produtos.filter(p => !p.ignorado && !p.eh_produto_composto);
  const ignorados = produtos.filter(p => p.ignorado  || p.eh_produto_composto);
  const todosProntos = produtos.every(pronto);
  const qtdPendentes = ativos.filter(p => !pronto(p)).length;

  const nomeItem  = (id:string) => itens.find(i=>i.id===id)?.nome  || '—';
  const nomeFicha = (id:string) => fichas.find(f=>f.id===id)?.nome || '—';
  const filtrarVinculo = (prodId:string, tipo:'item'|'ficha') => {
    const q=(buscaVinculo[prodId]||'').toLowerCase();
    if(tipo==='item') return q ? itens.filter(i=>i.nome.toLowerCase().includes(q)) : itens;
    return q ? fichas.filter(f=>f.nome.toLowerCase().includes(q)) : fichas;
  };

  // Listas filtradas — state local garante re-render correto
  const ativosVisiveis =
    filtro === 'ignorados'  ? [] :
    filtro === 'prontos'    ? ativos.filter(p => pronto(p)) :
    filtro === 'pendentes'  ? ativos.filter(p => !pronto(p)) :
    filtro === 'expandidos' ? ativos.filter(p => !!p.expandido_de) :
    ativos;
  const ignoradosVisiveis =
    filtro === 'todos' || filtro === 'ignorados' ? ignorados : [];

  const qtdExpandidos = ativos.filter(p => !!p.expandido_de).length;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      {/* Cabeçalho + badges */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button onClick={onVoltar} className="text-white/30 hover:text-white/80 text-sm">← Voltar</button>
          <div>
            <h1 className="text-xl font-bold text-white">Revisar vendas</h1>
            <p className="text-sm text-white/40">{dtinicio} → {dtfim} · {produtos.length} produtos</p>
          </div>
        </div>
        <div className="flex gap-2 text-xs flex-wrap">
          {(['todos','prontos','pendentes','ignorados','expandidos'] as const)
            .filter(f =>
              f === 'todos'      ? true :
              f === 'prontos'    ? true :
              f === 'pendentes'  ? qtdPendentes > 0 :
              f === 'ignorados'  ? ignorados.length > 0 :
              f === 'expandidos' ? qtdExpandidos > 0 : false
            )
            .map(f => {
              const label =
                f === 'todos'      ? `Todos (${produtos.length})` :
                f === 'prontos'    ? `✓ ${produtos.filter(pronto).length} prontos` :
                f === 'pendentes'  ? `⚠ ${qtdPendentes} pendentes` :
                f === 'ignorados'  ? `⊘ ${ignorados.length} ignorados` :
                `🧩 ${qtdExpandidos} expandidos`;
              return (
                <button key={f} onClick={() => setFiltro(f)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium border transition-colors ${filtro===f ? 'bg-[#7D1F2C] text-white border-[#7D1F2C]' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'}`}>
                  {label}
                </button>
              );
            })
          }
        </div>
      </div>

      {!todosProntos && filtro !== 'ignorados' && (
        <div className="bg-amber-500/10 border border-amber-500/40 rounded-xl p-3 text-sm text-amber-300 flex items-start gap-2">
          <AlertTriangle size={16} className="mt-0.5 flex-shrink-0"/>
          <span>
            <strong>{qtdPendentes} produto(s)</strong> sem mapeamento.{' '}
            <button onClick={onMapeamento} className="underline font-semibold hover:text-amber-300">
              Mapear na aba Mapeamento →
            </button>
          </span>
        </div>
      )}

      {filtro !== 'ignorados' && ativosVisiveis.length === 0 && (
        <div className="text-center py-10 text-white/30 text-sm italic">
          Nenhum produto nesta categoria
        </div>
      )}

      <div className="space-y-3">
        {ativosVisiveis.map(prod=>{
          const ok=pronto(prod);
          const q=buscaVinculo[prod.productId]||'';
          return (
<div key={prod.productId + '_' + prod.eventDate}              className={`bg-[#12141f] rounded-2xl border shadow-sm overflow-hidden ${
                prod.expandido_de ? 'border-purple-500/30 ml-4' : ok ? 'border-green-500/30' : 'border-amber-500/40'
              }`}>
              <div className={`flex items-center justify-between px-4 py-3 ${
                prod.expandido_de ? 'bg-purple-500/10' : ok ? 'bg-green-500/10' : 'bg-amber-500/10'
              }`}>
                <div className="flex items-center gap-3 min-w-0">
                  {prod.expandido_de
                    ? <span className="text-purple-500 flex-shrink-0 text-base">↳</span>
                    : ok
                      ? <Check size={15} className="text-green-400 flex-shrink-0"/>
                      : <AlertTriangle size={15} className="text-amber-500 flex-shrink-0"/>}
                  <div className="min-w-0">
                    <p className="font-semibold text-white text-sm">{prod.productName}</p>
                    <p className="text-xs text-white/30 flex items-center gap-2 flex-wrap">
                      {prod.expandido_de && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-purple-500/15 text-purple-400 rounded-md text-[10px] font-semibold">
                          🧩 de: {prod.expandido_de}
                        </span>
                      )}
                      {prod.productCategory&&<span className="italic">{prod.productCategory}</span>}
                      {prod.mapeado&&<span className="text-blue-500">mapeado</span>}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                  <div className="text-right">
                    <p className="text-lg font-bold text-white/90">{prod.count}</p>
                    <p className="text-xs text-white/30">unid.</p>
                  </div>
                  <button onClick={()=>toggleIgnorar(prod)} disabled={prod.salvandoIgnore}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all bg-[#12141f] border-white/10 text-white/40 hover:border-red-500/40 hover:text-red-500 hover:bg-red-500/10 disabled:opacity-50">
                    <EyeOff size={12}/> Ignorar
                  </button>
                </div>
              </div>
              <div className="px-4 py-4 space-y-4">
                <div>
                  <label className="text-xs font-semibold text-white/40 uppercase tracking-wide flex items-center gap-1 mb-1"><Warehouse size={11}/> Estoque de saída</label>
                  <select value={prod.estoqueId} onChange={e=>update(prod.productId,{estoqueId:e.target.value})}
                    className={`w-full rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/30 ${prod.estoqueId?'border border-white/10 bg-[#1a1d2e]':'border border-amber-500/40 bg-amber-500/10'}`}>
                    <option value="">— Selecione o estoque —</option>
                    {estoques.map(e=><option key={e.id} value={e.id}>{e.nome}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-white/40 uppercase tracking-wide flex items-center gap-1 mb-2"><Link2 size={11}/> Vínculo de baixa</label>
                  {!prod.itemEstoqueId&&!prod.fichaId&&(
                    <div className="flex gap-2 mb-3">
                      <button onClick={()=>update(prod.productId,{vinculoTipo:'item'})}
                        className={`flex-1 py-2 rounded-xl text-xs font-medium border ${prod.vinculoTipo==='item'?'bg-[#7D1F2C] text-white border-[#7D1F2C]':'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'}`}>
                        Item de estoque
                      </button>
                      <button onClick={()=>update(prod.productId,{vinculoTipo:'ficha'})}
                        className={`flex-1 py-2 rounded-xl text-xs font-medium border ${prod.vinculoTipo==='ficha'?'bg-[#7D1F2C] text-white border-[#7D1F2C]':'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'}`}>
                        Ficha técnica
                      </button>
                    </div>
                  )}
                  {prod.itemEstoqueId&&(
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/80 flex items-center gap-2">
                        <Package size={13} className="text-white/30"/>{nomeItem(prod.itemEstoqueId)}<span className="text-xs text-white/30 ml-1">— item</span>
                      </div>
                      <button onClick={()=>update(prod.productId,{itemEstoqueId:'',fichaId:'',vinculoTipo:''})} className="p-2 text-white/30 hover:text-red-500"><X size={15}/></button>
                    </div>
                  )}
                  {prod.fichaId&&(
                    <div className="flex items-center gap-2">
                      <div className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-sm text-white/80 flex items-center gap-2">
                        <RefreshCw size={13} className="text-white/30"/>{nomeFicha(prod.fichaId)}<span className="text-xs text-white/30 ml-1">— ficha técnica</span>
                      </div>
                      <button onClick={()=>update(prod.productId,{itemEstoqueId:'',fichaId:'',vinculoTipo:''})} className="p-2 text-white/30 hover:text-red-500"><X size={15}/></button>
                    </div>
                  )}
                  {!prod.itemEstoqueId&&!prod.fichaId&&prod.vinculoTipo==='item'&&(
                    <div>
                      <div className="relative mb-1">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"/>
                        <input type="text" placeholder="Buscar item de estoque..." value={q} autoFocus
                          onChange={e=>setBuscaVinculo(prev=>({...prev,[prod.productId]:e.target.value}))}
                          className="w-full border border-amber-500/40 bg-amber-500/10 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/30 focus:bg-[#12141f] focus:border-white/10"/>
                      </div>
                      {q&&(
                        <div className="border border-white/10 rounded-xl bg-[#12141f] shadow-lg max-h-44 overflow-y-auto">
                          {filtrarVinculo(prod.productId,'item').slice(0,20).map(item=>(
                            <button key={item.id}
                              onClick={()=>{update(prod.productId,{itemEstoqueId:item.id,fichaId:'',vinculoTipo:'item'});setBuscaVinculo(prev=>({...prev,[prod.productId]:''}));}}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 border-b border-white/5 last:border-0 flex items-center justify-between">
                              <span className="font-medium text-white/90">{item.nome}</span>
                              <span className="text-xs text-white/30 ml-2 flex-shrink-0">{item.unidade_medida}{item.custo_medio>0&&` · R$ ${Number(item.custo_medio).toFixed(2)}`}</span>
                            </button>
                          ))}
                          {filtrarVinculo(prod.productId,'item').length===0&&<p className="px-3 py-3 text-sm text-white/30 italic text-center">Nenhum item encontrado</p>}
                        </div>
                      )}
                    </div>
                  )}
                  {!prod.itemEstoqueId&&!prod.fichaId&&prod.vinculoTipo==='ficha'&&(
                    <div>
                      <div className="relative mb-1">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30"/>
                        <input type="text" placeholder="Buscar ficha técnica..." value={q} autoFocus
                          onChange={e=>setBuscaVinculo(prev=>({...prev,[prod.productId]:e.target.value}))}
                          className="w-full border border-amber-500/40 bg-amber-500/10 rounded-xl pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/30 focus:bg-[#12141f] focus:border-white/10"/>
                      </div>
                      {q&&(
                        <div className="border border-white/10 rounded-xl bg-[#12141f] shadow-lg max-h-44 overflow-y-auto">
                          {filtrarVinculo(prod.productId,'ficha').slice(0,20).map(f=>(
                            <button key={f.id}
                              onClick={()=>{update(prod.productId,{fichaId:f.id,itemEstoqueId:'',vinculoTipo:'ficha'});setBuscaVinculo(prev=>({...prev,[prod.productId]:''}));}}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-white/5 border-b border-white/5 last:border-0 flex items-center justify-between">
                              <span className="font-medium text-white/90">{f.nome}</span>
                              <span className="text-xs text-white/30 ml-2 flex-shrink-0">{f.porcoes>0&&`${f.porcoes} porç.`}{f.custo_total>0&&` · R$ ${Number(f.custo_total).toFixed(2)}`}</span>
                            </button>
                          ))}
                          {filtrarVinculo(prod.productId,'ficha').length===0&&<p className="px-3 py-3 text-sm text-white/30 italic text-center">Nenhuma ficha encontrada</p>}
                        </div>
                      )}
                    </div>
                  )}
                  {!prod.itemEstoqueId&&!prod.fichaId&&!prod.vinculoTipo&&<p className="text-xs text-amber-400 italic">Escolha o tipo de vínculo acima</p>}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {ignoradosVisiveis.length>0&&(
        <div className="mt-2">
          <p className="text-xs font-semibold text-white/30 uppercase tracking-wide mb-2 flex items-center gap-1"><EyeOff size={11}/> Ignorados / Compostos</p>
          <div className="space-y-2">
            {ignoradosVisiveis.map(prod=>(
              <div key={prod.productId} className={`rounded-2xl border px-4 py-3 flex items-center justify-between opacity-60 hover:opacity-80 ${prod.eh_produto_composto?'bg-purple-500/10 border-purple-500/30':'bg-white/5 border-white/10'}`}>
                <div className="flex items-center gap-3 min-w-0">
                  {prod.eh_produto_composto ? <span className="text-purple-400 text-sm">🧩</span> : <EyeOff size={14} className="text-white/30 flex-shrink-0"/>}
                  <div>
                    <p className={`text-sm font-medium ${prod.eh_produto_composto?'text-purple-400':'text-white/60 line-through'}`}>{prod.productName}</p>
                    <p className="text-xs text-white/30">
                      {prod.eh_produto_composto
                        ? `subitens expandidos: ${prod.additions_expandidos?.join(', ') || '—'}`
                        : `${prod.productCategory||'—'} · ${prod.count} unid.`}
                    </p>
                  </div>
                </div>
                {!prod.eh_produto_composto&&(
                  <button onClick={()=>toggleIgnorar(prod)} disabled={prod.salvandoIgnore}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-white/10 bg-[#12141f] text-xs font-medium text-white/40 hover:border-green-500/40 hover:text-green-400 hover:bg-green-500/10 transition-all disabled:opacity-50">
                    <Eye size={12}/> Reativar
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="sticky bottom-4 pt-2">
        <button onClick={handleProcessar} disabled={!todosProntos||processando}
          className={`w-full flex items-center justify-center gap-2 font-bold py-4 rounded-2xl transition-all shadow-lg text-white ${todosProntos?'bg-[#7D1F2C] hover:bg-[#6a1a25] shadow-[#7D1F2C]/30':'bg-white/20 cursor-not-allowed'}`}>
          <Play size={18} className={processando?'animate-pulse':''}/>
          {processando?'Processando baixas...':todosProntos
            ?`Processar ${ativos.filter(p=>p.estoqueId).length} produto(s)${ignorados.length>0?` · ${ignorados.length} ignorado(s)`:''}`
            :`Aguardando ${qtdPendentes} mapeamento(s)`}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// COMPONENTE PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════
export default function ZigVendasSync() {
  const [aba, setAba]             = useState<Aba>('lancamentos');
  const [etapa, setEtapa]         = useState<Etapa>('busca');
  const [dtinicio, setDtinicio]   = useState(()=>{ const d=new Date(); d.setDate(d.getDate()-1); return d.toISOString().split('T')[0]; });
  const [dtfim, setDtfim]         = useState(()=>{ const d=new Date(); d.setDate(d.getDate()-1); return d.toISOString().split('T')[0]; });
  const [buscando, setBuscando]   = useState(false);
  const [processando, setProcessando] = useState(false);
  const [erroBusca, setErroBusca] = useState('');
  const [produtos, setProdutos]   = useState<ProdutoEditavel[]>([]);
  const [estoques, setEstoques]   = useState<Estoque[]>([]);
  const [itens, setItens]         = useState<ItemEstoque[]>([]);
  const [fichas, setFichas]       = useState<Ficha[]>([]);
  const [resultado, setResultado] = useState<any>(null);
  const [logs, setLogs]           = useState<SyncLog[]>([]);
  const [logAberto, setLogAberto] = useState<string|null>(null);
  const [abaLog, setAbaLog]       = useState<'processados'|'pendentes'|'ignorados'>('processados');
  const [buscaVinculo, setBuscaVinculo] = useState<Record<string,string>>({});

  useEffect(() => { carregarLogs(); }, []);

  const carregarLogs = async () => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/zig_vendas_sync_logs?select=*&order=iniciado_em.desc&limit=10`,
      { headers: { apikey:SUPABASE_ANON, Authorization:`Bearer ${SUPABASE_ANON}` } });
    const data = await res.json();
    if (Array.isArray(data)) setLogs(data);
  };

  const atalhos = [
    { label:'Ontem',          fn:()=>{ const d=new Date(); d.setDate(d.getDate()-1); const s=d.toISOString().split('T')[0]; setDtinicio(s); setDtfim(s); }},
    { label:'Últimos 7 dias', fn:()=>{ const i=new Date(); i.setDate(i.getDate()-7); const f=new Date(); f.setDate(f.getDate()-1); setDtinicio(i.toISOString().split('T')[0]); setDtfim(f.toISOString().split('T')[0]); }},
    { label:'Mês atual',      fn:()=>{ const n=new Date(); setDtinicio(`${n.getFullYear()}-${String(n.getMonth()+1).padStart(2,'0')}-01`); setDtfim(n.toISOString().split('T')[0]); }},
  ];

  const handleBuscar = async () => {
    setBuscando(true); setErroBusca('');
    try {
      const res  = await fetch(`${SUPABASE_URL}/functions/v1/zig-buscar-vendas`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ dtinicio, dtfim }),
      });
      const json = await res.json();
      if (!json.ok) { setErroBusca(json.error||'Erro ao buscar'); return; }
      setEstoques(json.estoques||[]); setItens(json.itensEstoque||[]); setFichas(json.fichas||[]);
      const editaveis: ProdutoEditavel[] = (json.produtos||[]).map((p: ProdutoZig) => ({
        ...p,
        estoqueId:     p.mapeamento?.estoque_id       || '',
        itemEstoqueId: p.mapeamento?.item_estoque_id  || '',
        fichaId:       p.mapeamento?.ficha_tecnica_id || '',
        vinculoTipo:   p.mapeamento?.ficha_tecnica_id ? 'ficha' : p.mapeamento?.item_estoque_id ? 'item' : '',
        ignorado:      p.mapeamento?.ignorar_estoque ?? p.ignorar_estoque ?? false,
        salvandoIgnore:false,
      }));
      setProdutos(editaveis); setEtapa('revisao');
    } catch(e:any) { setErroBusca(e.message); }
    finally { setBuscando(false); }
  };

  const update = (id:string, changes:Partial<ProdutoEditavel>) =>
    setProdutos(prev=>prev.map(p=>p.productId===id?{...p,...changes}:p));

  const toggleIgnorar = async (prod: ProdutoEditavel) => {
    const novo = !prod.ignorado;
    update(prod.productId,{ignorado:novo,salvandoIgnore:true});
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/mapeamento_itens_vendas?nome_externo=eq.${encodeURIComponent(prod.productName)}`,
        { method:'PATCH', headers:{ apikey:SUPABASE_ANON, Authorization:`Bearer ${SUPABASE_ANON}`, 'Content-Type':'application/json', Prefer:'return=minimal' }, body:JSON.stringify({ignorar_estoque:novo}) }
      );
      if (res.status===404||(await res.text())==='') {
        await fetch(`${SUPABASE_URL}/rest/v1/mapeamento_itens_vendas`, {
          method:'POST', headers:{ apikey:SUPABASE_ANON, Authorization:`Bearer ${SUPABASE_ANON}`, 'Content-Type':'application/json', Prefer:'return=minimal' },
          body:JSON.stringify({nome_externo:prod.productName, nome_normalizado:norm(prod.productName), ignorar_estoque:novo, origem:'manual', confianca:1})
        });
      }
    } catch { update(prod.productId,{ignorado:!novo}); }
    finally { update(prod.productId,{salvandoIgnore:false}); }
  };

  const pronto = (p:ProdutoEditavel) => p.ignorado||!!(p.estoqueId&&(p.itemEstoqueId||p.fichaId));
  const ativos       = produtos.filter(p=>!p.ignorado && !p.eh_produto_composto);
  const ignorados    = produtos.filter(p=>p.ignorado || p.eh_produto_composto);
  const todosProntos = produtos.every(pronto);
  const qtdPendentes = ativos.filter(p=>!pronto(p)).length;

  const filtrarVinculo = (prodId:string, tipo:'item'|'ficha') => {
    const q=(buscaVinculo[prodId]||'').toLowerCase();
    if(tipo==='item') return q?itens.filter(i=>i.nome.toLowerCase().includes(q)):itens;
    return q?fichas.filter(f=>f.nome.toLowerCase().includes(q)):fichas;
  };
  const nomeItem  = (id:string) => itens.find(i=>i.id===id)?.nome ||'—';
  const nomeFicha = (id:string) => fichas.find(f=>f.id===id)?.nome||'—';

  const handleProcessar = async () => {
    if (!todosProntos) return;
    setProcessando(true);
    try {
      const payload = ativos.filter(p=>p.estoqueId&&(p.itemEstoqueId||p.fichaId)).map(p=>({
        productId:p.productId, productName:p.productName, productCategory:p.productCategory,
        count:p.count, eventDate:p.eventDate, estoqueId:p.estoqueId,
        itemEstoqueId:p.vinculoTipo==='item'?p.itemEstoqueId:null,
        fichaTecnicaId:p.vinculoTipo==='ficha'?p.fichaId:null,
        // Contexto de produto expandido (para log detalhado)
        expandido_de: p.expandido_de || null,
      }));
      const res = await fetch(`${SUPABASE_URL}/functions/v1/zig-processar-baixas`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({dtinicio,dtfim,produtos:payload}),
      });
      const json = await res.json();
      setResultado(json); setEtapa('resultado'); await carregarLogs();
    } catch(e:any) { setResultado({ok:false,error:e.message}); setEtapa('resultado'); }
    finally { setProcessando(false); }
  };

  return (
    <div>
      {/* Tabs */}
      <div className="flex border-b border-white/10 px-6 pt-2 bg-[#12141f]">
        {([
          {key:'lancamentos', label:'⚡ ZIG Lançamentos'},
          {key:'mapeamento',  label:`🗺 Mapeamento${qtdPendentes>0?` (${qtdPendentes} pendentes no período)`:''}` },
        ] as {key:Aba;label:string}[]).map(tab=>(
          <button key={tab.key} onClick={()=>setAba(tab.key)}
            className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors mr-1 ${aba===tab.key?'border-[#7D1F2C] text-[#7D1F2C]':'border-transparent text-white/40 hover:text-white/80'}`}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── ABA MAPEAMENTO ── */}
      {aba==='mapeamento' && (
        <AbaMapeamento />
      )}

      {/* ── ABA LANÇAMENTOS ── */}
      {aba==='lancamentos' && (
        <>
          {etapa==='busca' && (
            <div className="p-6 max-w-2xl mx-auto space-y-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#7D1F2C] flex items-center justify-center">
                  <Package size={20} className="text-white"/>
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">ZIG → Estoque</h1>
                  <p className="text-sm text-white/40">Baixa de estoque via vendas ZIG</p>
                </div>
              </div>

              <div className="bg-[#12141f] rounded-2xl border border-white/10 p-6 space-y-5">
                <h2 className="font-semibold text-white/90">Buscar vendas</h2>
                <div className="flex gap-2 flex-wrap">
                  {atalhos.map(a=>(
                    <button key={a.label} onClick={a.fn}
                      className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs font-medium text-white/60">
                      {a.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-white/40 mb-1 block">Data início</label>
                    <input type="date" value={dtinicio} onChange={e=>setDtinicio(e.target.value)}
                      className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/30"/>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-white/40 mb-1 block">Data fim</label>
                    <input type="date" value={dtfim} onChange={e=>setDtfim(e.target.value)}
                      className="w-full bg-white/5 border border-white/20 rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/30"/>
                  </div>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-3 text-xs text-blue-400 space-y-1">
                  <p className="font-semibold flex items-center gap-1"><Info size={13}/> Como funciona</p>
                  <p>1. Busca os produtos vendidos no período via ZIG</p>
                  <p>2. Produtos já mapeados vêm <strong>pré-preenchidos automaticamente</strong></p>
                  <p>3. Use a aba <strong>🗺 Mapeamento</strong> para vincular novos produtos antes de lançar</p>
                  <p>4. Confirme e processe as baixas de estoque</p>
                </div>
                {erroBusca && <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-sm text-red-400">{erroBusca}</div>}
                <button onClick={handleBuscar} disabled={buscando}
                  className="w-full flex items-center justify-center gap-2 bg-[#7D1F2C] hover:bg-[#6a1a25] disabled:opacity-50 text-white font-semibold py-3 rounded-xl">
                  <Search size={18} className={buscando?'animate-pulse':''}/>
                  {buscando?'Buscando vendas na ZIG...':'Buscar vendas'}
                </button>
              </div>

              {logs.length>0 && (
                <div className="bg-[#12141f] rounded-2xl border border-white/10 overflow-hidden">
                  <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                    <h2 className="font-semibold text-white/90 flex items-center gap-2">
                      <Clock size={15} className="text-[#7D1F2C]"/> Histórico de sincronizações
                    </h2>
                    <button onClick={carregarLogs} className="p-1.5 rounded-lg hover:bg-white/10 text-white/30">
                      <RefreshCw size={13}/>
                    </button>
                  </div>
                  <div className="divide-y divide-white/5">
                    {logs.map(log => {
                      const isOpen = logAberto === log.id;
                      const processados = log.itens_processados ?? [];
                      const pendentes   = log.itens_pendentes   ?? [];
                      const ignorados   = log.itens_ignorados   ?? [];
                      const semDetalhe  = log.itens_processados === null && log.itens_pendentes === null;
                      const statusColor = log.status==='sucesso'||log.status==='sucesso_parcial' ? 'text-green-500'
                                        : log.status==='erro' ? 'text-red-500' : 'text-yellow-500';
                      const StatusIcon  = log.status==='sucesso'||log.status==='sucesso_parcial' ? CheckCircle
                                        : log.status==='erro' ? XCircle : Clock;
                      return (
                        <div key={log.id}>
                          {/* Linha principal */}
                          <div className="px-5 py-3 flex items-center gap-3">
                            <StatusIcon size={14} className={`flex-shrink-0 ${statusColor}`}/>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-semibold text-white/80">
                                  {new Date(log.iniciado_em).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'})}
                                </span>
                                <span className="text-xs text-white/30">{log.dtinicio} → {log.dtfim}</span>
                              </div>
                              <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                <span className="text-xs font-bold text-green-400">{log.total_movimentacoes??0} baixas</span>
                                {(log.total_duplicados??0)>0 && <span className="text-xs text-blue-400">{log.total_duplicados} já proc.</span>}
                                {(pendentes.length)>0 && <span className="text-xs text-amber-500">{pendentes.length} pendentes</span>}
                                {(ignorados.length)>0 && <span className="text-xs text-white/30">{ignorados.length} ignorados</span>}
                                {log.erro_mensagem && <span className="text-xs text-red-400 truncate max-w-[180px]">⚠ {log.erro_mensagem.split('|')[0]}</span>}
                              </div>
                            </div>
                            {/* Botão olho */}
                            <button
                              onClick={() => { setLogAberto(isOpen ? null : log.id); setAbaLog('processados'); }}
                              title="Ver detalhes desta sincronização"
                              className={`p-2 rounded-xl border transition-all flex-shrink-0 ${isOpen
                                ? 'bg-[#7D1F2C] border-[#7D1F2C] text-white shadow-sm'
                                : 'border-white/10 text-white/30 hover:border-[#7D1F2C] hover:text-[#7D1F2C] hover:bg-[#7D1F2C]/5'}`}>
                              <Eye size={14}/>
                            </button>
                          </div>

                          {/* Painel expandido */}
                          {isOpen && (
                            <div className="mx-4 mb-3 bg-white/5 rounded-2xl border border-white/10 overflow-hidden">
                              {/* Header do painel */}
                              <div className="px-4 py-3 bg-[#12141f] border-b border-white/5">
                                <div className="grid grid-cols-4 gap-2 text-center">
                                  {[
                                    {label:'Produtos ZIG', val: log.total_produtos_zig??0,  color:'text-white/80'},
                                    {label:'Baixas geradas', val: log.total_movimentacoes??0, color:'text-green-400'},
                                    {label:'Pendentes',  val: pendentes.length,  color:'text-amber-400'},
                                    {label:'Ignorados',  val: ignorados.length,  color:'text-white/30'},
                                  ].map(s=>(
                                    <div key={s.label} className="bg-white/5 rounded-xl p-2">
                                      <p className={`text-lg font-bold ${s.color}`}>{s.val}</p>
                                      <p className="text-[10px] text-white/30 leading-tight">{s.label}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              {/* Abas internas */}
                              <div className="flex border-b border-white/5 bg-[#12141f]">
                                {([
                                  {key:'processados', label:`✅ Processados (${processados.length})`},
                                  {key:'pendentes',   label:`⚠ Pendentes (${pendentes.length})`},
                                  {key:'ignorados',   label:`🚫 Ignorados (${ignorados.length})`},
                                ] as {key:typeof abaLog;label:string}[]).map(t=>(
                                  <button key={t.key} onClick={()=>setAbaLog(t.key)}
                                    className={`px-3 py-2 text-xs font-medium border-b-2 transition-colors ${abaLog===t.key
                                      ?'border-[#7D1F2C] text-[#7D1F2C]'
                                      :'border-transparent text-white/30 hover:text-white/60'}`}>
                                    {t.label}
                                  </button>
                                ))}
                              </div>

                              {/* Conteúdo */}
                              <div className="max-h-64 overflow-y-auto">
                                {semDetalhe && log.total_duplicados > 0 && abaLog === 'processados' && (
                                  <div className="px-4 py-5 text-center">
                                    <p className="text-xs text-blue-400 font-medium">Todos os {log.total_duplicados} itens já haviam sido processados anteriormente</p>
                                    <p className="text-xs text-white/30 mt-1">Nenhuma baixa nova foi gerada neste sync</p>
                                  </div>
                                )}
                                {abaLog==='processados' && (
                                  processados.length === 0
                                    ? <p className="text-center text-xs text-white/30 py-6 italic">Nenhum item processado</p>
                                    : <table className="w-full text-xs">
                                        <thead className="bg-white/10 sticky top-0">
                                          <tr>
                                            <th className="text-left px-4 py-2 font-semibold text-white/60">Produto</th>
                                            <th className="text-center px-3 py-2 font-semibold text-white/60">Qtd vendida</th>
                                            <th className="text-center px-3 py-2 font-semibold text-white/60">Data venda</th>
                                            <th className="text-center px-3 py-2 font-semibold text-white/60">Movimentações</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                          {processados.map((item,i)=>(
                                            <tr key={i} className={i%2===0?'bg-[#12141f]':'bg-white/5/50'}>
                                              <td className="px-4 py-2 font-medium text-white/90">{item.nome}</td>
                                              <td className="px-3 py-2 text-center text-white/60">{Number(item.quantidade).toFixed(item.quantidade%1===0?0:3).replace(/\.?0+$/,'')}</td>
                                              <td className="px-3 py-2 text-center text-white/40">{item.data_venda}</td>
                                              <td className="px-3 py-2 text-center">
                                                <span className="inline-flex items-center justify-center w-6 h-6 bg-green-500/15 text-green-400 rounded-full font-bold">{item.movimentacoes}</span>
                                              </td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                )}
                                {abaLog==='pendentes' && (
                                  pendentes.length === 0
                                    ? <p className="text-center text-xs text-white/30 py-6 italic">Nenhum item pendente 🎉</p>
                                    : <table className="w-full text-xs">
                                        <thead className="bg-amber-500/10 sticky top-0">
                                          <tr>
                                            <th className="text-left px-4 py-2 font-semibold text-amber-400">Produto</th>
                                            <th className="text-center px-3 py-2 font-semibold text-amber-400">Qtd</th>
                                            <th className="text-left px-3 py-2 font-semibold text-amber-400">Motivo</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-amber-500/20">
                                          {pendentes.map((item,i)=>(
                                            <tr key={i} className="bg-[#12141f]">
                                              <td className="px-4 py-2 font-medium text-white/90">{item.nome}</td>
                                              <td className="px-3 py-2 text-center text-white/60">{item.quantidade}</td>
                                              <td className="px-3 py-2 text-amber-400 italic">{item.motivo}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                )}
                                {abaLog==='ignorados' && (
                                  ignorados.length === 0
                                    ? <p className="text-center text-xs text-white/30 py-6 italic">Nenhum item ignorado</p>
                                    : <table className="w-full text-xs">
                                        <thead className="bg-white/10 sticky top-0">
                                          <tr>
                                            <th className="text-left px-4 py-2 font-semibold text-white/60">Produto</th>
                                            <th className="text-left px-3 py-2 font-semibold text-white/60">Motivo</th>
                                          </tr>
                                        </thead>
                                        <tbody className="divide-y divide-white/5">
                                          {ignorados.map((item,i)=>(
                                            <tr key={i} className={i%2===0?'bg-[#12141f]':'bg-white/5/50'}>
                                              <td className="px-4 py-2 font-medium text-white/40 line-through">{item.nome}</td>
                                              <td className="px-3 py-2 text-white/30 italic">{item.motivo}</td>
                                            </tr>
                                          ))}
                                        </tbody>
                                      </table>
                                )}
                              </div>

                              {/* Erro se houver */}
                              {log.erro_mensagem && (
                                <div className="mx-3 mb-3 mt-2 bg-red-500/10 border border-red-500/30 rounded-xl p-3 text-xs text-red-400">
                                  <p className="font-semibold mb-1">⚠ Erros encontrados:</p>
                                  {log.erro_mensagem.split(' | ').map((e,i)=>(
                                    <p key={i} className="mt-0.5">• {e}</p>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {etapa==='revisao' && (
            <AbaRevisao
              dtinicio={dtinicio} dtfim={dtfim}
              produtos={produtos} estoques={estoques} itens={itens} fichas={fichas}
              update={update} toggleIgnorar={toggleIgnorar}
              handleProcessar={handleProcessar} processando={processando}
              onVoltar={()=>setEtapa('busca')} onMapeamento={()=>setAba('mapeamento')}
            />
          )}
                    {etapa==='resultado' && (
            <div className="p-6 max-w-2xl mx-auto space-y-6">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${resultado?.ok?'bg-green-500/15':'bg-red-500/15'}`}>
                  {resultado?.ok?<CheckCircle size={20} className="text-green-400"/>:<XCircle size={20} className="text-red-500"/>}
                </div>
                <div>
                  <h1 className="text-xl font-bold text-white">{resultado?.ok?'Baixas processadas!':'Erro ao processar'}</h1>
                  <p className="text-sm text-white/40">{dtinicio} → {dtfim}</p>
                </div>
              </div>
              {resultado?.ok&&resultado.resumo&&(
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {[
                    {label:'Baixas',     val:resultado.resumo.total_movimentacoes, color:'text-green-400'},
                    {label:'Já proc.',   val:resultado.resumo.total_duplicados,    color:'text-blue-500'},
                    {label:'Pendentes',  val:resultado.resumo.total_pendentes,     color:'text-amber-500'},
                    {label:'Ignorados',  val:resultado.resumo.total_ignorados,     color:'text-white/30'},
                    {label:'Erros',      val:resultado.resumo.total_erros,         color:'text-red-500'},
                  ].map(item=>(
                    <div key={item.label} className="bg-[#12141f] rounded-2xl border border-white/10 p-4 text-center">
                      <p className={`text-2xl font-bold ${item.color}`}>{item.val??0}</p>
                      <p className="text-xs text-white/40 mt-1">{item.label}</p>
                    </div>
                  ))}
                </div>
              )}
              {resultado?.resumo?.total_pendentes > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 text-sm text-amber-400">
                  <p className="font-semibold mb-1 flex items-center gap-1"><AlertTriangle size={14}/> {resultado.resumo.total_pendentes} produto(s) sem mapeamento completo</p>
                  <p className="text-xs text-amber-400">Acesse a aba <strong>🗺 Mapeamento</strong> para vincular esses produtos. Na próxima sincronização eles serão processados automaticamente.</p>
                </div>
              )}
              {!resultado?.ok&&<div className="bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-sm text-red-400">{resultado?.error}</div>}
              <div className="flex gap-3">
                <button onClick={()=>{setEtapa('busca');setResultado(null);setProdutos([]);}}
                  className="flex-1 py-3 rounded-xl border border-white/10 text-sm font-medium text-white/60 hover:bg-white/5">
                  Nova sincronização
                </button>
                <button onClick={()=>setEtapa('revisao')}
                  className="flex-1 py-3 rounded-xl bg-[#7D1F2C] text-white text-sm font-medium hover:bg-[#6a1a25]">
                  Ver revisão
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
