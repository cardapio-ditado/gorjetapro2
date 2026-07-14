import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import {
  Search, Check, AlertCircle, Loader2, Filter,
  ClipboardList, TrendingUp, TrendingDown, Minus, EyeOff,
} from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import { atualizarItem, loadItensContagem, itemEstaIgnorado } from './contagemService';
import type { ContagemItem } from './types';
import { GRUPOS } from './types';
import { formatCurrency } from '../../../utils/currency';

const COR_BADGE: Record<string, string> = {
  blue:   'bg-blue-500/15 text-blue-300 border-blue-500/30',
  red:    'bg-red-500/15 text-red-300 border-red-500/30',
  green:  'bg-green-500/15 text-green-300 border-green-500/30',
  yellow: 'bg-yellow-500/15 text-yellow-300 border-yellow-500/30',
  purple: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
  gray:   'bg-white/10 text-white/50 border-white/10',
};

export default function ContagemMobile() {
  const { token } = useParams<{ token: string }>();

  const [contagem, setContagem]     = useState<any>(null);
  const [itens, setItens]           = useState<ContagemItem[]>([]);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [filtroPendentes, setFiltroPendentes] = useState(false);
  const [savingItems, setSavingItems] = useState<Set<string>>(new Set());
  const [savedItems, setSavedItems]   = useState<Set<string>>(new Set());
  const [errorItems, setErrorItems]   = useState<Set<string>>(new Set());

  const debounceTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!token) { setError('Token inválido.'); setLoading(false); return; }
    load();
    return () => { debounceTimers.current.forEach(t => clearTimeout(t)); };
  }, [token]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from('contagens_estoque')
        .select('*, estoques(nome)')
        .eq('token_acesso', token)
        .maybeSingle();

      if (err) throw err;
      if (!data) { setError('Contagem não encontrada. Verifique o link.'); return; }
      if (data.token_expira_em && new Date(data.token_expira_em) < new Date()) {
        setError('Este link expirou. Solicite um novo ao responsável.'); return;
      }
      if (data.status !== 'em_andamento') {
        setError(`Esta contagem está "${data.status}". Apenas contagens em andamento podem ser preenchidas.`); return;
      }

      setContagem({ ...data, estoque_nome: data.estoques?.nome || '' });
      setItens(await loadItensContagem(data.id));
    } catch (e: any) {
      setError(e.message || 'Erro ao carregar contagem.');
    } finally {
      setLoading(false);
    }
  };

  const salvarCampo = useCallback((itemId: string, updates: Parameters<typeof atualizarItem>[1]) => {
    const key = Object.keys(updates)[0] + '-' + itemId;
    const ex = debounceTimers.current.get(key);
    if (ex) clearTimeout(ex);
    debounceTimers.current.set(key, setTimeout(async () => {
      debounceTimers.current.delete(key);
      setSavingItems(p => new Set(p).add(itemId));
      try {
        await atualizarItem(itemId, updates);
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

  const itensAtivos = useMemo(() => itens.filter(i => !itemEstaIgnorado(i)), [itens]);

  const stats = useMemo(() => ({
    total:    itensAtivos.length,
    contados: itensAtivos.filter(i => i.quantidade_contada !== null).length,
  }), [itensAtivos]);

  const itensFiltrados = useMemo(() => {
    let r = itensAtivos;
    if (filtroPendentes) r = r.filter(i => i.quantidade_contada === null);
    if (searchTerm) {
      const t = searchTerm.toLowerCase();
      r = r.filter(i => i.item_nome.toLowerCase().includes(t) || i.item_codigo.toLowerCase().includes(t));
    }
    return [...r].sort((a, b) => a.item_nome.localeCompare(b.item_nome));
  }, [itensAtivos, filtroPendentes, searchTerm]);

  const progressPct = stats.total > 0 ? (stats.contados / stats.total) * 100 : 0;

  if (loading) return (
    <div className="min-h-screen bg-[#0a0c14] flex flex-col items-center justify-center gap-4">
      <div className="w-12 h-12 rounded-2xl bg-[#7D1F2C]/20 flex items-center justify-center">
        <ClipboardList className="w-6 h-6 text-[#7D1F2C]" />
      </div>
      <Loader2 className="w-6 h-6 animate-spin text-white/40" />
      <p className="text-sm text-white/40">Carregando contagem...</p>
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-[#0a0c14] flex flex-col items-center justify-center gap-4 px-6">
      <div className="w-14 h-14 rounded-2xl bg-red-500/15 flex items-center justify-center">
        <AlertCircle className="w-7 h-7 text-red-400" />
      </div>
      <div className="text-center">
        <p className="font-bold text-white mb-1">Acesso negado</p>
        <p className="text-sm text-white/50">{error}</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0a0c14] flex flex-col">

      {/* HEADER */}
      <div className="bg-[#12141f] border-b border-white/5 px-4 pt-5 pb-3 sticky top-0 z-20">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 mb-0.5">
              <div className="w-6 h-6 rounded-lg bg-[#7D1F2C]/20 flex items-center justify-center shrink-0">
                <ClipboardList className="w-3.5 h-3.5 text-[#7D1F2C]" />
              </div>
              <span className="text-[11px] text-white/40 uppercase tracking-wider font-semibold">Contagem de Estoque</span>
            </div>
            <h1 className="text-lg font-bold text-white truncate">{contagem?.estoque_nome}</h1>
            <p className="text-xs text-white/40 mt-0.5">
              Responsável: <span className="text-white/60">{contagem?.responsavel}</span>
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-2xl font-bold text-white tabular-nums">{stats.contados}</p>
            <p className="text-[11px] text-white/40">de {stats.total}</p>
          </div>
        </div>

        {/* Barra de progresso */}
        <div className="mt-3 flex items-center gap-2">
          <div className="flex-1 bg-white/10 rounded-full h-2 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-[#7D1F2C] to-[#D4AF37] rounded-full transition-all duration-500"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-xs font-bold text-white/50 w-10 text-right">{Math.round(progressPct)}%</span>
        </div>
      </div>

      {/* BUSCA + FILTRO */}
      <div className="bg-[#12141f]/80 border-b border-white/5 px-3 py-2.5 flex gap-2 sticky top-[112px] z-10">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Buscar por nome ou código..."
            className="w-full pl-8 pr-3 py-2 text-sm border border-white/10 rounded-xl bg-white/5 text-white focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/30 focus:border-[#7D1F2C]"
          />
        </div>
        <button
          onClick={() => setFiltroPendentes(!filtroPendentes)}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border-2 transition-all ${
            filtroPendentes
              ? 'bg-amber-500 text-white border-amber-500'
              : 'bg-white/5 text-white/50 border-white/10 hover:bg-white/10'
          }`}
        >
          <Filter className="w-3.5 h-3.5" />
          Pendentes
        </button>
      </div>

      {/* LISTA */}
      <div className="flex-1 px-3 py-3 space-y-2 pb-8">
        {itensFiltrados.length === 0 && (
          <div className="py-16 text-center text-white/30 text-sm">
            {searchTerm
              ? 'Nenhum item encontrado'
              : filtroPendentes
              ? '✅ Todos os itens contados!'
              : 'Nenhum item disponível'}
          </div>
        )}

        {itensFiltrados.map(item => {
          const isContado = item.quantidade_contada !== null;
          const isSaving  = savingItems.has(item.id);
          const isSaved   = savedItems.has(item.id);
          const hasError  = errorItems.has(item.id);
          const dif       = item.diferenca;
          const grupo     = GRUPOS.find(g => g.key === (item.grupo_contagem || 'outros'));

          return (
            <div
              key={item.id}
              className={`bg-[#12141f] rounded-2xl border-2 shadow-sm transition-all ${
                hasError
                  ? 'border-red-500/50'
                  : isContado && dif === 0
                  ? 'border-green-500/40'
                  : isContado && dif !== 0
                  ? 'border-orange-500/40'
                  : item.quantidade_sistema === 0
                  ? 'border-blue-500/30'
                  : 'border-white/5'
              }`}
            >
              {/* Cabeçalho do card */}
              <div className={`flex items-start justify-between px-4 pt-3 pb-2 ${
                isContado && dif === 0
                  ? 'bg-green-500/10 rounded-t-2xl'
                  : isContado && dif !== 0
                  ? 'bg-orange-500/10 rounded-t-2xl'
                  : item.quantidade_sistema === 0
                  ? 'bg-blue-500/10 rounded-t-2xl'
                  : ''
              }`}>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-white text-sm leading-tight">{item.item_nome}</p>
                  <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                    {item.item_codigo && (
                      <span className="text-[11px] text-white/30">{item.item_codigo}</span>
                    )}
                    {grupo && (
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${COR_BADGE[grupo.cor]}`}>
                        {grupo.emoji} {grupo.label}
                      </span>
                    )}
                  </div>
                </div>
                <div className="ml-3 shrink-0">
                  {isSaving
                    ? <Loader2 className="w-5 h-5 animate-spin text-blue-400" />
                    : isSaved
                    ? <Check className="w-5 h-5 text-green-500" />
                    : hasError
                    ? <AlertCircle className="w-5 h-5 text-red-500" />
                    : isContado
                    ? <div className="w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    : <div className="w-5 h-5 rounded-full border-2 border-white/20" />
                  }
                </div>
              </div>

              {/* Campos */}
              <div className="px-4 pb-3 space-y-3">
                <div className="flex items-center gap-3">
                  {/* Sistema */}
                  <div className="flex-1 bg-white/5 rounded-xl px-3 py-2 text-center">
                    <p className="text-[10px] text-white/40 uppercase font-medium">Sistema</p>
                    <p className={`text-lg font-bold tabular-nums leading-tight ${
                      item.quantidade_sistema === 0 ? 'text-orange-400' : 'text-white/70'
                    }`}>
                      {item.quantidade_sistema}
                    </p>
                    <p className="text-[10px] text-white/30">{item.unidade_medida}</p>
                  </div>

                  {/* Input contado */}
                  <div className="flex-1">
                    <p className="text-[10px] text-white/40 uppercase font-medium text-center mb-1">Contado</p>
                    <input
                      type="number"
                      inputMode="decimal"
                      step="0.001"
                      value={item.quantidade_contada === null ? '' : item.quantidade_contada}
                      onChange={e => handleQtd(item.id, e.target.value)}
                      placeholder="—"
                      className={`w-full text-center text-2xl font-bold border-2 rounded-xl py-2 focus:outline-none focus:ring-2 transition-colors tabular-nums ${
                        hasError
                          ? 'border-red-500/50 bg-red-500/10 text-red-300 focus:ring-red-500/20'
                          : isContado && dif === 0
                          ? 'border-green-500/50 bg-green-500/10 text-green-300 focus:ring-green-500/20'
                          : isContado && dif !== 0
                          ? 'border-orange-500/50 bg-orange-500/10 text-orange-300 focus:ring-orange-500/20'
                          : 'border-white/10 bg-white/5 text-white focus:ring-[#7D1F2C]/20 focus:border-[#7D1F2C]'
                      }`}
                    />
                  </div>

                  {/* Diferença */}
                  {isContado && dif !== null && (
                    <div className="w-20 text-center">
                      <p className="text-[10px] text-white/40 uppercase font-medium mb-1">Dif.</p>
                      <div className={`rounded-xl px-2 py-2 ${
                        dif > 0 ? 'bg-green-500/15' : dif < 0 ? 'bg-red-500/15' : 'bg-white/10'
                      }`}>
                        <p className={`text-sm font-bold tabular-nums ${
                          dif > 0 ? 'text-green-300' : dif < 0 ? 'text-red-300' : 'text-white/40'
                        }`}>
                          {dif > 0 && <TrendingUp className="w-3 h-3 inline mr-0.5" />}
                          {dif < 0 && <TrendingDown className="w-3 h-3 inline mr-0.5" />}
                          {dif === 0 && <Minus className="w-3 h-3 inline mr-0.5" />}
                          {dif > 0 ? '+' : ''}{dif.toFixed(2)}
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
                <input
                  type="text"
                  value={item.observacao || ''}
                  onChange={e => handleObs(item.id, e.target.value)}
                  placeholder="Observação (opcional)..."
                  className="w-full text-xs border border-white/10 rounded-xl px-3 py-2 focus:ring-2 focus:ring-[#7D1F2C]/20 focus:border-[#7D1F2C] bg-white/5 text-white"
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* FOOTER */}
      <div className="sticky bottom-0 bg-[#12141f] border-t border-white/5 px-4 py-3">
        <div className="flex items-center justify-between text-xs text-white/30">
          <span className="flex items-center gap-1">
            <EyeOff className="w-3 h-3" />
            Os dados são salvos automaticamente
          </span>
          <span>{stats.contados} / {stats.total} itens contados</span>
        </div>
      </div>
    </div>
  );
}
