// ContagemContador.tsx
import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import {
  Search, ArrowLeft, Calculator, Loader2, Check, Minus,
  AlertCircle, Filter, EyeOff, Eye, RotateCcw, PackagePlus,
  X, TrendingUp, TrendingDown,
} from 'lucide-react';
import type { ContagemItem, GrupoContagem } from './types';
import { GRUPOS } from './types';
import * as service from './contagemService';
import { itemEstaIgnorado } from './contagemService';
import { formatCurrency } from '../../../utils/currency';
import { formatarQuantidade } from '../../../utils/formatarQuantidade';

interface Props {
  contagemId: string;
  estoqueName: string;
  onVoltar: () => void;
  onFinalizar: () => void;
}

const COR_BADGE: Record<string, string> = {
  blue:   'bg-blue-500/15 text-blue-300 border-blue-500/30',
  red:    'bg-red-500/15 text-red-300 border-red-500/30',
  green:  'bg-green-500/15 text-green-300 border-green-500/30',
  yellow: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  purple: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  gray:   'bg-white/10 text-white/50 border-white/10',
};

const COR_ABA: Record<string, string> = {
  blue:   'border-blue-500 text-blue-300 bg-blue-500/10',
  red:    'border-red-500 text-red-300 bg-red-500/10',
  green:  'border-green-500 text-green-300 bg-green-500/10',
  yellow: 'border-yellow-500 text-yellow-300 bg-yellow-500/10',
  purple: 'border-purple-500 text-purple-300 bg-purple-500/10',
  gray:   'border-gray-500 text-white/80 bg-white/5',
};

export default function ContagemContador({ contagemId, estoqueName, onVoltar, onFinalizar }: Props) {
  const [itens, setItens]             = useState<ContagemItem[]>([]);
  const [loading, setLoading]         = useState(true);
  const [searchTerm, setSearchTerm]   = useState('');
  const [grupoAtivo, setGrupoAtivo]   = useState<GrupoContagem | 'todos' | 'ignorados'>('todos');
  const [savingItems, setSavingItems] = useState<Set<string>>(new Set());
  const [savedItems, setSavedItems]   = useState<Set<string>>(new Set());
  const [errorItems, setErrorItems]   = useState<Set<string>>(new Set());
  const [filtroPendentes, setFiltroPendentes] = useState(false);

  // Adicionar item ausente
  const [showAdicionar, setShowAdicionar]         = useState(false);
  const [buscaAusente, setBuscaAusente]           = useState('');
  const [itensDisponiveis, setItensDisponiveis]   = useState<any[]>([]);
  const [loadingDisponiveis, setLoadingDisponiveis] = useState(false);
  const [adicionando, setAdicionando]             = useState<string | null>(null);

  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const buscaTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    load();
    return () => { debounceTimers.current.forEach(t => clearTimeout(t)); };
  }, [contagemId]);

  // Debounce busca de itens ausentes
  useEffect(() => {
    if (buscaTimer.current) clearTimeout(buscaTimer.current);
    if (buscaAusente.length < 2) { setItensDisponiveis([]); return; }
    buscaTimer.current = setTimeout(async () => {
      setLoadingDisponiveis(true);
      // Precisamos do estoque_id — buscamos da contagem
      const { data: cData } = await import('../../../lib/supabase').then(m =>
        m.supabase.from('contagens_estoque').select('estoque_id').eq('id', contagemId).single()
      );
      const resultado = await service.buscarItensParaAdicionar(contagemId, cData?.estoque_id || '', buscaAusente);
      setItensDisponiveis(resultado);
      setLoadingDisponiveis(false);
    }, 400);
    return () => { if (buscaTimer.current) clearTimeout(buscaTimer.current); };
  }, [buscaAusente, contagemId]);

  const load = async () => {
    setLoading(true);
    try { setItens(await service.loadItensContagem(contagemId)); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const adicionarItem = async (item: any) => {
    setAdicionando(item.id);
    try {
      const novoItem = await service.adicionarItemNaContagem(contagemId, item);
      setItens(prev => [...prev, novoItem]);
      setItensDisponiveis(prev => prev.filter(i => i.id !== item.id));
      setBuscaAusente('');
      setShowAdicionar(false);
    } catch (e: any) {
      alert('Erro ao adicionar item: ' + e.message);
    } finally {
      setAdicionando(null);
    }
  };

  const salvarCampo = useCallback((itemId: string, updates: Parameters<typeof service.atualizarItem>[1]) => {
    const key = Object.keys(updates)[0] + '-' + itemId;
    const ex = debounceTimers.current.get(key);
    if (ex) clearTimeout(ex);
    debounceTimers.current.set(key, setTimeout(async () => {
      debounceTimers.current.delete(key);
      setSavingItems(p => new Set(p).add(itemId));
      try {
        await service.atualizarItem(itemId, updates);
        setSavedItems(p => new Set(p).add(itemId));
        setTimeout(() => setSavedItems(p => { const n = new Set(p); n.delete(itemId); return n; }), 2000);
      } catch {
        setErrorItems(p => new Set(p).add(itemId));
      } finally {
        setSavingItems(p => { const n = new Set(p); n.delete(itemId); return n; });
      }
    }, 600));
  }, []);

  const handleQtd = useCallback((itemId: string, value: string) => {
    const parsed = value === '' ? null : parseFloat(value);
    if (parsed !== null && isNaN(parsed)) return;
    setItens(prev => prev.map(item => {
      if (item.id !== itemId) return item;
      const diff = parsed !== null ? parsed - item.quantidade_sistema : null;
      return { ...item, quantidade_contada: parsed, diferenca: diff,
               valor_diferenca: diff !== null ? diff * item.valor_unitario : null };
    }));
    setErrorItems(p => { const n = new Set(p); n.delete(itemId); return n; });
    setSavedItems(p => { const n = new Set(p); n.delete(itemId); return n; });
    salvarCampo(itemId, { quantidade_contada: parsed });
  }, [salvarCampo]);

  const handleObs = useCallback((itemId: string, value: string) => {
    setItens(prev => prev.map(i => i.id === itemId ? { ...i, observacao: value } : i));
    salvarCampo(itemId, { observacao: value || '' });
  }, [salvarCampo]);

  const handleIgnorar = useCallback(async (item: ContagemItem) => {
    const novoOverride = itemEstaIgnorado(item) ? false : true;
    setItens(prev => prev.map(i => i.id === item.id ? { ...i, ignorar_override: novoOverride } : i));
    try { await service.atualizarItem(item.id, { ignorar_override: novoOverride }); }
    catch { setItens(prev => prev.map(i => i.id === item.id ? { ...i, ignorar_override: item.ignorar_override } : i)); }
  }, []);

  const handleResetarIgnorar = useCallback(async (item: ContagemItem) => {
    setItens(prev => prev.map(i => i.id === item.id ? { ...i, ignorar_override: null } : i));
    try { await service.atualizarItem(item.id, { ignorar_override: null }); }
    catch { setItens(prev => prev.map(i => i.id === item.id ? { ...i, ignorar_override: item.ignorar_override } : i)); }
  }, []);

  const itensAtivos    = useMemo(() => itens.filter(i => !itemEstaIgnorado(i)), [itens]);
  const itensIgnorados = useMemo(() => itens.filter(i => itemEstaIgnorado(i)), [itens]);

  const statsPorGrupo = useMemo(() => {
    const map: Record<string, { total: number; contados: number }> = {};
    for (const item of itensAtivos) {
      const g = item.grupo_contagem || 'outros';
      if (!map[g]) map[g] = { total: 0, contados: 0 };
      map[g].total++;
      if (item.quantidade_contada !== null) map[g].contados++;
    }
    return map;
  }, [itensAtivos]);

  const statsGeral = useMemo(() => ({
    total:     itensAtivos.length,
    contados:  itensAtivos.filter(i => i.quantidade_contada !== null).length,
    ignorados: itensIgnorados.length,
  }), [itensAtivos, itensIgnorados]);

  const itensFiltrados = useMemo(() => {
    let r: ContagemItem[];
    if (grupoAtivo === 'ignorados') r = itensIgnorados;
    else {
      r = itensAtivos;
      if (grupoAtivo !== 'todos') r = r.filter(i => (i.grupo_contagem || 'outros') === grupoAtivo);
      if (filtroPendentes) r = r.filter(i => i.quantidade_contada === null);
    }
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      r = r.filter(i => i.item_nome.toLowerCase().includes(t) || i.item_codigo.toLowerCase().includes(t));
    }
    return [...r].sort((a, b) => a.item_nome.localeCompare(b.item_nome));
  }, [itens, grupoAtivo, filtroPendentes, searchTerm, itensAtivos, itensIgnorados]);

  const progressPct = statsGeral.total > 0 ? (statsGeral.contados / statsGeral.total) * 100 : 0;

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-24 gap-3">
      <Loader2 className="w-8 h-8 animate-spin text-[#7D1F2C]" />
      <p className="text-sm text-white/40">Carregando itens...</p>
    </div>
  );

  return (
    <div className="flex flex-col h-full">

      {/* HEADER */}
      <div className="bg-[#12141f] border-b border-white/5 px-4 py-3 sticky top-0 z-20">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onVoltar} className="p-2 hover:bg-white/10 rounded-xl shrink-0">
              <ArrowLeft className="w-5 h-5 text-white/50" />
            </button>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-white truncate">{estoqueName}</h2>
              <p className="text-xs text-white/40">
                {statsGeral.contados}/{statsGeral.total} contados
                {statsGeral.ignorados > 0 && <span className="text-white/30 ml-1">· {statsGeral.ignorados} ignorados</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button onClick={() => { setShowAdicionar(v => !v); setBuscaAusente(''); setItensDisponiveis([]); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition-all ${
                showAdicionar ? 'bg-blue-600 text-white border-blue-600' : 'border-blue-400 text-blue-300 hover:bg-blue-500/10'
              }`}>
              <PackagePlus className="w-4 h-4" /> + Item
            </button>
            <button onClick={onFinalizar} disabled={statsGeral.contados === 0}
              className="px-4 py-2 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-40 flex items-center gap-2">
              <Calculator className="w-4 h-4" /> Finalizar
            </button>
          </div>
        </div>

        {/* Progresso */}
        <div className="mt-2.5 flex items-center gap-2">
          <div className="flex-1 bg-white/10 rounded-full h-2 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#7D1F2C] to-[#D4AF37] rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-xs font-semibold text-white/50 w-9 text-right">{Math.round(progressPct)}%</span>
        </div>
      </div>

      {/* ADICIONAR ITEM AUSENTE */}
      {showAdicionar && (
        <div className="bg-blue-500/10 border-b-2 border-blue-500/30 px-4 py-3 space-y-2.5">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-blue-300 flex items-center gap-1.5">
              <PackagePlus className="w-3.5 h-3.5" /> Adicionar item ausente da contagem
            </p>
            <button onClick={() => setShowAdicionar(false)} className="p-1 text-blue-400 hover:text-blue-300 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-[11px] text-blue-400 leading-relaxed">
            Use quando o item existe fisicamente mas não apareceu na lista. Entra com <strong>Sistema: 0</strong>.
          </p>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-blue-400" />
            <input type="text" value={buscaAusente} onChange={e => setBuscaAusente(e.target.value)}
              placeholder="Digite o nome ou código do item..." autoFocus
              className="w-full pl-9 pr-9 py-2.5 text-sm border border-blue-500/30 rounded-xl bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-blue-400" />
            {loadingDisponiveis && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-blue-400" />}
            {buscaAusente && !loadingDisponiveis && (
              <button onClick={() => setBuscaAusente('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-blue-300">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
          {buscaAusente.length >= 2 && !loadingDisponiveis && itensDisponiveis.length === 0 && (
            <p className="text-xs text-blue-500 italic px-1">Nenhum item encontrado fora da contagem.</p>
          )}
          {itensDisponiveis.length > 0 && (
            <div className="bg-[#12141f] border border-blue-500/30 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
              {itensDisponiveis.map(item => (
                <button key={item.id} onClick={() => adicionarItem(item)} disabled={adicionando === item.id}
                  className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-blue-500/10 border-b border-blue-500/10 last:border-0 transition-colors disabled:opacity-50 text-left">
                  <div className="min-w-0">
                    <p className="font-semibold text-white text-sm truncate">{item.nome}</p>
                    <p className="text-[11px] text-white/30 mt-0.5">{item.codigo} · {item.unidade_medida}</p>
                  </div>
                  <div className="ml-3 shrink-0">
                    {adicionando === item.id
                      ? <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                      : <span className="text-xs font-bold text-blue-300 bg-blue-900/30 px-2.5 py-1 rounded-lg">Adicionar</span>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ABAS DE GRUPO */}
      <div className="bg-[#12141f] border-b border-white/5 sticky top-[88px] z-10">
        <div className="flex overflow-x-auto scrollbar-hide px-2 py-2 gap-1.5">
          <button onClick={() => setGrupoAtivo('todos')}
            className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all ${
              grupoAtivo === 'todos' ? 'bg-[#7D1F2C] text-white border-[#7D1F2C]' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'
            }`}>
            Todos
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${grupoAtivo === 'todos' ? 'bg-white/20' : 'bg-white/10 text-white/40'}`}>
              {statsGeral.contados}/{statsGeral.total}
            </span>
          </button>

          {GRUPOS.map(g => {
            const s = statsPorGrupo[g.key] || { total: 0, contados: 0 };
            if (s.total === 0) return null;
            const ativo    = grupoAtivo === g.key;
            const completo = s.total > 0 && s.contados === s.total;
            return (
              <button key={g.key} onClick={() => setGrupoAtivo(g.key)}
                className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                  ativo      ? COR_ABA[g.cor]
                  : completo ? 'bg-green-500/10 text-green-300 border-green-500/30'
                  :            'bg-white/5 text-white/50 border-white/10 hover:border-white/20'
                }`}>
                {g.emoji} {g.label}
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                  ativo ? COR_BADGE[g.cor] : completo ? 'bg-green-500/15 text-green-300' : 'bg-white/10 text-white/40'
                }`}>
                  {s.contados}/{s.total}
                </span>
                {completo && <Check className="w-3 h-3 text-green-400" />}
              </button>
            );
          })}

          {statsGeral.ignorados > 0 && (
            <button onClick={() => setGrupoAtivo('ignorados')}
              className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition-all ${
                grupoAtivo === 'ignorados' ? 'bg-gray-600 text-white border-gray-600' : 'bg-white/5 text-white/30 border-white/10 hover:bg-white/10'
              }`}>
              <EyeOff className="w-3 h-3" /> Ignorados
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${grupoAtivo === 'ignorados' ? 'bg-white/20' : 'bg-white/10 text-white/30'}`}>
                {statsGeral.ignorados}
              </span>
            </button>
          )}
        </div>
      </div>

      {/* BUSCA + FILTRO */}
      <div className="bg-white/5 border-b border-white/5 px-3 py-2 flex gap-2 sticky top-[140px] z-[9]">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome ou código..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-white/10 rounded-xl bg-white/5 text-white focus:ring-2 focus:ring-[#7D1F2C]/30 focus:border-[#7D1F2C]" />
        </div>
        {grupoAtivo !== 'ignorados' && (
          <button onClick={() => setFiltroPendentes(!filtroPendentes)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${
              filtroPendentes ? 'bg-amber-500 text-white border-amber-500' : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'
            }`}>
            <Filter className="w-3.5 h-3.5" /> Pendentes
          </button>
        )}
      </div>

      {/* LISTA */}
      <div className="flex-1 overflow-auto px-3 py-3 space-y-2">
        {grupoAtivo === 'ignorados' && itensFiltrados.length > 0 && (
          <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-xs text-white/40 flex items-start gap-2">
            <EyeOff className="w-3.5 h-3.5 mt-0.5 shrink-0" />
            <span>Estes itens <strong>não serão contados</strong>. Clique em "Contar" para incluí-los.</span>
          </div>
        )}

        {itensFiltrados.length === 0 && (
          <div className="py-16 text-center text-white/30 text-sm">
            {searchTerm ? 'Nenhum item encontrado'
             : filtroPendentes ? '✅ Todos os itens contados neste grupo!'
             : grupoAtivo === 'ignorados' ? 'Nenhum item ignorado'
             : 'Nenhum item neste grupo'}
          </div>
        )}

        {itensFiltrados.map(item => {
          const ignorado  = itemEstaIgnorado(item);
          const temOvr    = item.ignorar_override !== null;
          const isContado = item.quantidade_contada !== null;
          const isSaving  = savingItems.has(item.id);
          const isSaved   = savedItems.has(item.id);
          const hasError  = errorItems.has(item.id);
          const dif       = item.diferenca;
          const grupo     = GRUPOS.find(g => g.key === (item.grupo_contagem || 'outros'));

          // Card ignorado
          if (ignorado) return (
            <div key={item.id} className="bg-white/5 border border-white/10 rounded-2xl px-4 py-3 flex items-center justify-between opacity-70">
              <div className="flex items-center gap-3 min-w-0">
                <EyeOff className="w-4 h-4 text-white/30 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white/50 line-through truncate">{item.item_nome}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {item.item_codigo && <span className="text-[11px] text-white/30">{item.item_codigo}</span>}
                    {grupo && <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${COR_BADGE[grupo.cor]}`}>{grupo.emoji} {grupo.label}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0 ml-3">
                <button onClick={() => handleIgnorar(item)}
                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-green-500/30 text-green-400 text-xs font-semibold hover:bg-green-500/10">
                  <Eye className="w-3 h-3" /> Contar
                </button>
                {temOvr && (
                  <button onClick={() => handleResetarIgnorar(item)} title="Voltar ao padrão"
                    className="p-1.5 rounded-lg border border-white/10 text-white/30 hover:text-white/50">
                    <RotateCcw className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>
          );

          // Card normal
          return (
            <div key={item.id} className={`bg-[#12141f] rounded-2xl border-2 shadow-sm transition-all ${
              hasError               ? 'border-red-500/50'
              : isContado && dif === 0 ? 'border-green-500/40'
              : isContado && dif !== 0 ? 'border-orange-500/40'
              : item.quantidade_sistema === 0 ? 'border-blue-500/30'
              : 'border-white/5'
            }`}>
              {/* Cabeçalho do card */}
              <div className={`flex items-start justify-between px-4 pt-3 pb-2 ${
                isContado && dif === 0 ? 'bg-green-500/10 rounded-t-2xl'
                : isContado && dif !== 0 ? 'bg-orange-500/10 rounded-t-2xl'
                : item.quantidade_sistema === 0 ? 'bg-blue-500/10 rounded-t-2xl' : ''
              }`}>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white text-sm leading-tight">{item.item_nome}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {item.item_codigo && <span className="text-[11px] text-white/30">{item.item_codigo}</span>}
                    {grupo && <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${COR_BADGE[grupo.cor]}`}>{grupo.emoji} {grupo.label}</span>}
                    {item.quantidade_sistema === 0 && !isContado && (
                      <span className="text-[10px] text-blue-300 bg-blue-500/15 px-1.5 py-0.5 rounded-full font-semibold">Adicionado manualmente</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2 ml-3 shrink-0">
                  {isSaving    ? <Loader2 className="w-4 h-4 animate-spin text-blue-400" />
                   : isSaved   ? <Check className="w-4 h-4 text-green-500" />
                   : hasError  ? <AlertCircle className="w-4 h-4 text-red-500" />
                   : isContado ? <div className="w-4 h-4 rounded-full bg-green-500 flex items-center justify-center"><Check className="w-2.5 h-2.5 text-white" /></div>
                   :             <div className="w-4 h-4 rounded-full border-2 border-white/20" />}
                  <button onClick={() => handleIgnorar(item)} title="Não contar este item"
                    className="p-1.5 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-500/10 transition-all">
                    <EyeOff className="w-3.5 h-3.5" />
                  </button>
                  {temOvr && (
                    <button onClick={() => handleResetarIgnorar(item)} title="Voltar ao padrão"
                      className="p-1.5 rounded-lg text-gray-300 hover:text-white/40">
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>

              {/* Campos */}
              <div className="px-4 pb-3 space-y-3">
                <div className="flex items-center gap-3">
                  {/* Sistema */}
                  <div className="flex-1 bg-white/5 rounded-xl px-3 py-2 text-center">
                    <p className="text-[10px] text-white/40 uppercase font-medium">Sistema</p>
                    <p className={`text-lg font-bold tabular-nums leading-tight ${item.quantidade_sistema === 0 ? 'text-orange-500' : 'text-white/80'}`}>
                      {formatarQuantidade(item.quantidade_sistema)}
                    </p>
                    <p className="text-[10px] text-white/30">{item.unidade_medida}</p>
                  </div>

                  {/* Input contado */}
                  <div className="flex-1">
                    <p className="text-[10px] text-white/40 uppercase font-medium text-center mb-1">Contado</p>
                    <input type="number" inputMode="decimal" step="0.001"
                      value={item.quantidade_contada === null ? '' : item.quantidade_contada}
                      onChange={e => handleQtd(item.id, e.target.value)}
                      placeholder="—"
                      className={`w-full text-center text-2xl font-bold border-2 rounded-xl py-2 focus:outline-none focus:ring-2 transition-colors tabular-nums ${
                        hasError               ? 'border-red-500/50 bg-red-500/10 text-red-300 focus:ring-red-500/20'
                        : isContado && dif === 0 ? 'border-green-500/50 bg-green-500/10 text-green-300 focus:ring-green-500/20'
                        : isContado && dif !== 0 ? 'border-orange-500/50 bg-orange-500/10 text-orange-300 focus:ring-orange-500/20'
                        : 'border-white/10 bg-white/5 text-white focus:ring-[#7D1F2C]/20 focus:border-[#7D1F2C]'
                      }`} />
                  </div>

                  {/* Diferença */}
                  {isContado && dif !== null && (
                    <div className="w-20 text-center">
                      <p className="text-[10px] text-white/40 uppercase font-medium mb-1">Dif.</p>
                      <div className={`rounded-xl px-2 py-2 ${dif > 0 ? 'bg-green-500/15' : dif < 0 ? 'bg-red-500/15' : 'bg-white/10'}`}>
                        <p className={`text-sm font-bold tabular-nums ${dif > 0 ? 'text-green-300' : dif < 0 ? 'text-red-300' : 'text-white/40'}`}>
                          {dif > 0 && <TrendingUp className="w-3 h-3 inline mr-0.5" />}
                          {dif < 0 && <TrendingDown className="w-3 h-3 inline mr-0.5" />}
                          {dif === 0 && <Minus className="w-3 h-3 inline mr-0.5" />}
                          {dif > 0 ? '+' : ''}{formatarQuantidade(dif)}
                        </p>
                        {item.valor_diferenca !== null && item.valor_diferenca !== 0 && (
                          <p className={`text-[10px] font-medium ${dif > 0 ? 'text-green-400' : 'text-red-400'}`}>
                            {item.valor_diferenca > 0 ? '+' : ''}{formatCurrency(item.valor_diferenca)}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Observação */}
                <input type="text" value={item.observacao || ''}
                  onChange={e => handleObs(item.id, e.target.value)}
                  placeholder="Observação (opcional)..."
                  className="w-full text-xs border border-white/10 rounded-xl px-3 py-2 focus:ring-2 focus:ring-[#7D1F2C]/20 focus:border-[#7D1F2C] bg-white/5 text-white" />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}