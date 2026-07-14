import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, ArrowRight, X, ChevronLeft, ChevronRight,
  Plus, AlertTriangle, CheckCircle, Printer,
  RefreshCw, TrendingUp, Banknote, Wallet,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─── Constantes ──────────────────────────────────────────────────────────────
const FORNECEDOR_AVULSO_ID = '7456e7b4-f4cb-4835-b85c-8f1625b04e84';
const GERENTES = ['Cristiano', 'Kadu', 'Beth'];


const TIPOS_RECEITA = [
  { id: 'pix',      label: 'PIX',      icon: <TrendingUp className="w-3.5 h-3.5" />, cor: 'text-emerald-400' },
  { id: 'dinheiro', label: 'Dinheiro', icon: <Banknote className="w-3.5 h-3.5" />,   cor: 'text-blue-400' },
  { id: 'outro',    label: 'Outro',    icon: <Wallet className="w-3.5 h-3.5" />,      cor: 'text-white/60' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtR = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 2, maximumFractionDigits: 2 });

const fmtData = (d: string) =>
  new Date(d + 'T12:00').toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });

const offsetDate = (base: string, days: number) => {
  const d = new Date(base + 'T12:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
};

const vencBadge = (dataVenc: string) => {
  const diff = Math.floor((new Date(dataVenc + 'T12:00').getTime() - Date.now()) / 86400000);
  if (diff < 0)  return { label: `${Math.abs(diff)}d atraso`, cls: 'bg-red-500/20 text-red-400' };
  if (diff === 0) return { label: 'hoje',                      cls: 'bg-orange-500/20 text-orange-400' };
  if (diff <= 7)  return { label: `${diff}d`,                  cls: 'bg-yellow-500/15 text-yellow-400' };
  return               { label: fmtData(dataVenc),             cls: 'bg-white/8 text-white/40' };
};

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface Sessao {
  id: string; data_sessao: string; titulo: string;
  status: string; saldo_disponivel?: number;
}
interface Pagamento {
  id: string; sessao_id: string | null; data_base: string; origem: string;
  conta_pagar_ref_id: string | null; descricao: string;
  categoria_id: string | null; categoria_nome: string | null;
  valor: number; solicitado_por: string; observacao: string | null;
  estava_vencida: boolean; data_vencimento_ref: string | null;
  fornecedor_nome: string | null; lancado_contas_pagar: boolean;
  lancado_em: string | null; lancado_por: string | null;
  conta_pagar_criada_id: string | null; criado_em: string;
}
interface Receita {
  id: string; sessao_id: string | null; data_base: string;
  descricao: string; valor: number; tipo: string; criado_em: string;
}
interface ContaPagar {
  id: string; descricao: string; saldo_restante: number;
  data_vencimento: string; valor_total: number; status: string;
  categorias_financeiras: { id: string; nome: string };
  fornecedores: { nome: string } | null;
}
interface Categoria { id: string; nome: string; }

// ─── Componente Principal ────────────────────────────────────────────────────
const AgendaDiaria: React.FC = () => {
  const [aba, setAba]               = useState<'pagamentos'>('pagamentos');
  const [dataAtual, setDataAtual]   = useState(new Date().toISOString().split('T')[0]);
  const [sessao, setSessao]         = useState<Sessao | null>(null);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [receitas, setReceitas]     = useState<Receita[]>([]);
  const [contas, setContas]         = useState<ContaPagar[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filtro, setFiltro]         = useState<'vencidas' | '7dias' | 'todas'>('todas');
  const [busca, setBusca]           = useState('');
  const [accordion, setAccordion]   = useState<Set<string>>(new Set());
  const [salvando, setSalvando]     = useState(false);

  // Modal autorizar
  const [modalAuth, setModalAuth]   = useState<ContaPagar | null>(null);
  const [aValor, setAValor]         = useState('');
  const [aGerente, setAGerente]     = useState(GERENTES[0]);
  const [aObs, setAObs]             = useState('');

  // Modal receita
  const [modalReceita, setModalReceita] = useState(false);
  const [rDesc, setRDesc]   = useState('');
  const [rValor, setRValor] = useState('');
  const [rTipo, setRTipo]   = useState('pix');

  // Modal manual
  const [modalManual, setModalManual] = useState(false);
  const [mDesc, setMDesc]     = useState('');
  const [mValor, setMValor]   = useState('');
  const [mCatId, setMCatId]   = useState('');
  const [mGerente, setMGerente] = useState(GERENTES[0]);

  // Modal lançar no sistema
  const [modalLancar, setModalLancar] = useState<Pagamento | null>(null);
  const [lVenc, setLVenc] = useState(new Date().toISOString().split('T')[0]);
  const [lObs, setLObs]   = useState('');


  const [showRelatorio, setShowRelatorio] = useState(false);

  const hoje = new Date().toISOString().split('T')[0];
  const isHoje = dataAtual === hoje;
  const somenteLeitura = sessao?.status === 'finalizada' && !isHoje;

  // ── Carregar ─────────────────────────────────────────────────────────────
  const carregar = useCallback(async (data: string) => {
    setLoading(true);
    try {
      let s: Sessao | null = null;
      const { data: existing } = await supabase
        .from('agenda_sessoes').select('*').eq('data_sessao', data).maybeSingle();

      if (existing) {
        s = existing as Sessao;
      } else if (data === hoje) {
        const titulo = new Date(data + 'T12:00').toLocaleDateString('pt-BR', {
          weekday: 'long', day: '2-digit', month: 'long',
        });
        const { data: nova } = await supabase.from('agenda_sessoes')
          .insert({ data_sessao: data, titulo, status: 'aberta', saldo_disponivel: 0 })
          .select().single();
        s = nova as Sessao;
      }

      setSessao(s);

      const [{ data: pags }, { data: recs }, { data: cats }, { data: cts }] = await Promise.all([
        supabase.from('agenda_pagamentos').select('*').eq('data_base', data).order('criado_em'),
        supabase.from('agenda_receitas').select('*').eq('data_base', data).order('criado_em'),
        supabase.from('categorias_financeiras').select('id, nome').order('nome'),
        supabase.from('contas_pagar')
          .select('id, descricao, saldo_restante, data_vencimento, valor_total, status, categorias_financeiras!inner(id, nome), fornecedores(nome)')
          .not('status', 'in', '("pago","cancelado")')
          .gt('saldo_restante', 0)
          .order('data_vencimento', { ascending: true }),
      ]);

      setPagamentos((pags ?? []) as Pagamento[]);
      setReceitas((recs ?? []) as Receita[]);
      setCategorias((cats ?? []) as Categoria[]);
      setContas((cts ?? []) as unknown as ContaPagar[]);
    } finally {
      setLoading(false);
    }
  }, [hoje]);

  useEffect(() => { carregar(dataAtual); }, [dataAtual, carregar]);

  const irParaDia = (d: number) => {
    const nova = offsetDate(dataAtual, d);
    if (nova > hoje) return;
    setDataAtual(nova);
  };

  // ── Computed ──────────────────────────────────────────────────────────────
  const idsAuth = new Set(pagamentos.map(p => p.conta_pagar_ref_id).filter(Boolean));

  const contasFiltradas = contas.filter(c => {
    const mb = !busca ||
      c.descricao.toLowerCase().includes(busca.toLowerCase()) ||
      (c.fornecedores?.nome ?? '').toLowerCase().includes(busca.toLowerCase());
    if (!mb) return false;
    if (filtro === 'vencidas') return new Date(c.data_vencimento + 'T12:00') < new Date();
    if (filtro === '7dias') {
      const v = new Date(c.data_vencimento + 'T12:00');
      return v >= new Date() && v <= new Date(Date.now() + 7 * 86400000);
    }
    return true;
  });

  const grupos = contasFiltradas.reduce((acc, c) => {
    const cat = (c.categorias_financeiras as any)?.nome ?? 'Sem categoria';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(c);
    return acc;
  }, {} as Record<string, ContaPagar[]>);

  const totalPago   = pagamentos.reduce((a, b) => a + Number(b.valor), 0);
  const totalEntrou = receitas.reduce((a, b) => a + Number(b.valor), 0);
  const saldoLivre  = totalEntrou - totalPago;

  const porGerente  = pagamentos.reduce((acc, p) => {
    if (!acc[p.solicitado_por]) acc[p.solicitado_por] = [];
    acc[p.solicitado_por].push(p);
    return acc;
  }, {} as Record<string, Pagamento[]>);
  const gerentesOrd = Object.keys(porGerente).sort();

  // ── Autorizar conta do sistema ────────────────────────────────────────────
  const abrirAuth = (c: ContaPagar) => {
    setAValor(Number(c.saldo_restante).toFixed(2));
    setAGerente(GERENTES[0]);
    setAObs('');
    setModalAuth(c);
  };

  const confirmarAuth = async () => {
    if (!modalAuth) return;
    setSalvando(true);
    try {
      const { data: novo, error } = await supabase.from('agenda_pagamentos').insert({
        data_base: dataAtual,
        sessao_id: sessao?.id ?? null,
        origem: 'contas_pagar',
        conta_pagar_ref_id: modalAuth.id,
        descricao: modalAuth.descricao,
        categoria_id: (modalAuth.categorias_financeiras as any)?.id ?? null,
        categoria_nome: (modalAuth.categorias_financeiras as any)?.nome ?? null,
        valor: parseFloat(aValor) || Number(modalAuth.saldo_restante),
        solicitado_por: aGerente,
        observacao: aObs || null,
        estava_vencida: new Date(modalAuth.data_vencimento + 'T12:00') < new Date(),
        data_vencimento_ref: modalAuth.data_vencimento,
        fornecedor_nome: modalAuth.fornecedores?.nome ?? null,
        lancado_contas_pagar: true,
      }).select().single();
      if (error) { console.error('Erro ao autorizar:', error); return; }
      if (novo) setPagamentos(p => [...p, novo as Pagamento]);
      setModalAuth(null);
    } finally { setSalvando(false); }
  };

  // ── Adicionar receita ─────────────────────────────────────────────────────
  const confirmarReceita = async () => {
    if (!rDesc || !rValor) return;
    setSalvando(true);
    try {
      const { data: nova, error } = await supabase.from('agenda_receitas').insert({
        data_base: dataAtual,
        sessao_id: sessao?.id ?? null,
        descricao: rDesc,
        valor: parseFloat(rValor) || 0,
        tipo: rTipo,
      }).select().single();
      if (error) { console.error('Erro ao adicionar receita:', error); return; }
      if (nova) setReceitas(r => [...r, nova as Receita]);
      setModalReceita(false);
      setRDesc(''); setRValor(''); setRTipo('pix');
    } finally { setSalvando(false); }
  };

  const removerReceita = async (id: string) => {
    await supabase.from('agenda_receitas').delete().eq('id', id);
    setReceitas(r => r.filter(x => x.id !== id));
  };

  // ── Lançamento manual rápido ──────────────────────────────────────────────
  const confirmarManual = async () => {
    if (!mDesc || !mValor) return;
    setSalvando(true);
    const catNome = categorias.find(c => c.id === mCatId)?.nome ?? null;
    try {
      const { data: novo, error } = await supabase.from('agenda_pagamentos').insert({
        data_base: dataAtual,
        sessao_id: sessao?.id ?? null,
        origem: 'manual',
        conta_pagar_ref_id: null,
        descricao: mDesc,
        categoria_id: mCatId || null,
        categoria_nome: catNome,
        valor: parseFloat(mValor) || 0,
        solicitado_por: mGerente,
        observacao: null,
        estava_vencida: false,
        data_vencimento_ref: dataAtual,
        fornecedor_nome: null,
        lancado_contas_pagar: false,
      }).select().single();
      if (error) { console.error('Erro ao lançar manual:', error); return; }
      if (novo) setPagamentos(p => [...p, novo as Pagamento]);
      setModalManual(false);
      setMDesc(''); setMValor(''); setMCatId(''); setMGerente(GERENTES[0]);
    } finally { setSalvando(false); }
  };

  // ── Remover pagamento ─────────────────────────────────────────────────────
  const removerItem = async (id: string) => {
    await supabase.from('agenda_pagamentos').delete().eq('id', id);
    setPagamentos(p => p.filter(x => x.id !== id));
  };

  // ── Lançar manual no sistema ──────────────────────────────────────────────
  const confirmarLancar = async () => {
    if (!modalLancar) return;
    setSalvando(true);
    try {
      const { data: conta } = await supabase.from('contas_pagar').insert({
        fornecedor_id: FORNECEDOR_AVULSO_ID,
        descricao: modalLancar.descricao,
        categoria_id: modalLancar.categoria_id,
        valor_total: modalLancar.valor, saldo_restante: modalLancar.valor, valor_pago: 0,
        data_vencimento: lVenc, status: 'em_aberto',
        observacoes: lObs || `Via Agenda Diária — ${modalLancar.solicitado_por}`,
        origem_modulo: 'agenda_diaria',
      }).select().single();
      const cid = (conta as any)?.id;
      await supabase.from('agenda_pagamentos').update({
        lancado_contas_pagar: true, lancado_em: new Date().toISOString(),
        lancado_por: 'financeiro', conta_pagar_criada_id: cid, conta_pagar_ref_id: cid,
      }).eq('id', modalLancar.id);
      setPagamentos(p => p.map(x => x.id === modalLancar.id
        ? { ...x, lancado_contas_pagar: true, conta_pagar_criada_id: cid, conta_pagar_ref_id: cid } : x));
      setModalLancar(null); setLVenc(hoje); setLObs('');
    } finally { setSalvando(false); }
  };


  const finalizarDia = async () => {
    if (!sessao) return;
    await supabase.from('agenda_sessoes').update({
      status: 'finalizada', finalizado_em: new Date().toISOString(),
    }).eq('id', sessao.id);
    setSessao(s => s ? { ...s, status: 'finalizada' } : s);
  };

  // ── Helpers render ────────────────────────────────────────────────────────
  const itensSistema    = pagamentos.filter(p => p.origem === 'contas_pagar');
  const itensManualOk   = pagamentos.filter(p => p.origem === 'manual' && p.lancado_contas_pagar);
  const itensManualPend = pagamentos.filter(p => p.origem === 'manual' && !p.lancado_contas_pagar);

  const badgeItem = (p: Pagamento) => {
    if (p.origem === 'contas_pagar')
      return <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0 bg-blue-500/20 text-blue-300">SIS</span>;
    if (p.lancado_contas_pagar)
      return <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0 bg-emerald-500/20 text-emerald-300">MAN✓</span>;
    return <span className="text-[9px] font-black px-1.5 py-0.5 rounded-md shrink-0 bg-yellow-500/20 text-yellow-400">MAN!</span>;
  };

  const tipoInfo = (tipo: string) => TIPOS_RECEITA.find(t => t.id === tipo) ?? TIPOS_RECEITA[2];

  const labelData = new Date(dataAtual + 'T12:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });

  if (loading) return (
    <div className="flex items-center justify-center min-h-96">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-[#7D1F2C]" />
    </div>
  );

  return (
    <div className="space-y-4 pb-16">

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#1a1f35] via-[#12172a] to-[#0d1020] border border-white/10 p-5">
        <div className="absolute inset-0 opacity-[0.025]"
          style={{ backgroundImage: 'repeating-linear-gradient(45deg,#fff 0,#fff 1px,transparent 0,transparent 50%)', backgroundSize: '20px 20px' }} />

        <div className="relative flex flex-wrap items-center justify-between gap-4">
          {/* Navegação data */}
          <div className="flex items-center gap-3">
            <button onClick={() => irParaDia(-1)}
              className="p-2 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 transition-all">
              <ChevronLeft className="w-4 h-4 text-white/60" />
            </button>
            <div className="text-center min-w-[200px]">
              <p className="text-base font-black text-white capitalize">{labelData}</p>
              {!isHoje
                ? <button onClick={() => setDataAtual(hoje)} className="text-[10px] text-[#D4AF37] font-bold hover:underline mt-0.5">voltar para hoje</button>
                : <p className="text-[10px] text-[#D4AF37]/70 font-semibold mt-0.5">Hoje</p>
              }
            </div>
            <button onClick={() => irParaDia(+1)} disabled={isHoje}
              className="p-2 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 transition-all disabled:opacity-30">
              <ChevronRight className="w-4 h-4 text-white/60" />
            </button>
          </div>

          {/* Botões ação */}
          <div className="flex items-center gap-2 flex-wrap">
            {sessao && (
              <span className={`text-[10px] font-bold px-2.5 py-1 rounded-lg border ${
                sessao.status === 'finalizada'
                  ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                  : 'bg-white/8 text-white/50 border-white/15'
              }`}>
                {sessao.status === 'finalizada' ? 'Finalizada' : 'Em aberto'}
              </span>
            )}
            <button onClick={() => carregar(dataAtual)}
              className="p-2 rounded-xl bg-white/8 hover:bg-white/15 border border-white/10 transition-all">
              <RefreshCw className="w-4 h-4 text-white/50" />
            </button>
            {isHoje && sessao && sessao.status !== 'finalizada' && (
              <button onClick={finalizarDia}
                className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-bold bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-600/30 transition-all">
                <CheckCircle className="w-3.5 h-3.5" /> Finalizar Dia
              </button>
            )}
          </div>
        </div>

        {/* KPIs do dia */}
        <div className="relative mt-4 pt-4 border-t border-white/8">
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3">
              <p className="text-[10px] text-emerald-400/70 uppercase font-bold tracking-wide">Receitas</p>
              <p className="text-lg font-black text-emerald-400 mt-0.5">{fmtR(totalEntrou)}</p>
              <p className="text-[10px] text-emerald-400/50 mt-0.5">{receitas.length} entr.</p>
            </div>
            <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3">
              <p className="text-[10px] text-red-400/70 uppercase font-bold tracking-wide">Pagamentos</p>
              <p className="text-lg font-black text-red-400 mt-0.5">{fmtR(totalPago)}</p>
              <p className="text-[10px] text-red-400/50 mt-0.5">{pagamentos.length} itens</p>
            </div>
            <div className={`border rounded-xl p-3 ${saldoLivre >= 0 ? 'bg-white/5 border-white/15' : 'bg-red-500/10 border-red-500/20'}`}>
              <p className="text-[10px] text-white/50 uppercase font-bold tracking-wide">Saldo Disponível</p>
              <p className={`text-lg font-black mt-0.5 ${saldoLivre >= 0 ? 'text-white' : 'text-red-400'}`}>{fmtR(saldoLivre)}</p>
              <p className="text-[10px] text-white/30 mt-0.5">receitas − pagamentos</p>
            </div>
          </div>
        </div>
      </div>


      {/* ── PAGAMENTOS ─────────────────────────────────────────────────── */}
      {(
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">

          {/* ESQUERDO — contas em aberto */}
          <div className="bg-[#12141f] border border-white/10 rounded-2xl overflow-hidden flex flex-col">
            <div className="px-4 py-3 border-b border-white/10">
              <p className="text-sm font-bold text-white mb-3">Contas em Aberto</p>
              <div className="flex gap-1.5 mb-2.5">
                {(['vencidas', '7dias', 'todas'] as const).map(f => (
                  <button key={f} onClick={() => setFiltro(f)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all ${
                      filtro === f ? 'bg-[#7D1F2C] text-white' : 'bg-white/8 text-white/40 hover:bg-white/12'
                    }`}>
                    {f === 'vencidas' ? 'Vencidas' : f === '7dias' ? 'Próx. 7d' : 'Todas'}
                  </button>
                ))}
              </div>
              <input type="text" placeholder="Buscar..." value={busca}
                onChange={e => setBusca(e.target.value)}
                className="w-full bg-white/5 border border-white/15 text-white placeholder-white/25 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-white/30" />
            </div>

            <div className="flex-1 overflow-y-auto max-h-[560px]">
              {Object.entries(grupos).length === 0
                ? <div className="py-12 text-center"><p className="text-xs text-white/30">Nenhuma conta</p></div>
                : Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => {
                    const aberto = accordion.has(cat);
                    const tot = items.reduce((a, b) => a + Number(b.saldo_restante), 0);
                    return (
                      <div key={cat}>
                        <button
                          onClick={() => setAccordion(prev => { const n = new Set(prev); n.has(cat) ? n.delete(cat) : n.add(cat); return n; })}
                          className="w-full flex items-center justify-between px-4 py-2.5 hover:bg-white/5 transition-colors">
                          <div className="flex items-center gap-2">
                            <ChevronRight className={`w-3.5 h-3.5 text-white/30 transition-transform ${aberto ? 'rotate-90' : ''}`} />
                            <span className="text-[11px] font-bold text-white/60 uppercase tracking-wide">{cat}</span>
                            <span className="text-[10px] text-white/30 bg-white/8 px-1.5 py-0.5 rounded-md">{items.length}</span>
                          </div>
                          <span className="text-xs font-bold text-white/50">{fmtR(tot)}</span>
                        </button>

                        {aberto && items.map(c => {
                          const jaAuth = idsAuth.has(c.id);
                          const badge  = vencBadge(c.data_vencimento);
                          return (
                            <div key={c.id}
                              className="flex items-center gap-3 px-4 py-3 border-t border-white/5 hover:bg-white/5 transition-colors">
                              {/* Data de vencimento */}
                              <div className="w-12 shrink-0 text-center">
                                <p className={`text-[10px] font-black ${badge.cls.includes('red') ? 'text-red-400' : badge.cls.includes('orange') ? 'text-orange-400' : badge.cls.includes('yellow') ? 'text-yellow-400' : 'text-white/40'}`}>
                                  {fmtData(c.data_vencimento)}
                                </p>
                                <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${badge.cls}`}>{badge.label}</span>
                              </div>

                              <div className="flex-1 min-w-0">
                                <p className="text-xs font-semibold text-white truncate">{c.descricao}</p>
                                {c.fornecedores?.nome && (
                                  <p className="text-[10px] text-white/40 truncate">{c.fornecedores.nome}</p>
                                )}
                                {jaAuth && <span className="text-[9px] text-emerald-400 font-bold">✓ autorizado</span>}
                              </div>

                              <p className="text-sm font-bold text-white shrink-0">{fmtR(Number(c.saldo_restante))}</p>

                              <button
                                onClick={() => { if (!somenteLeitura && !jaAuth) abrirAuth(c); }}
                                disabled={jaAuth || somenteLeitura}
                                title={jaAuth ? 'Já autorizado' : 'Autorizar pagamento'}
                                className={`p-2 rounded-xl transition-all shrink-0 ${
                                  jaAuth
                                    ? 'bg-emerald-500/10 text-emerald-500/40 cursor-not-allowed'
                                    : somenteLeitura
                                    ? 'bg-white/5 text-white/20 cursor-not-allowed'
                                    : 'bg-[#7D1F2C] text-white hover:bg-[#9B2535] active:scale-95 cursor-pointer shadow-lg'
                                }`}>
                                <ArrowRight className="w-4 h-4" />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    );
                  })
              }
            </div>

            <div className="px-4 py-3 border-t border-white/10 flex justify-between items-center">
              <span className="text-xs text-white/40">{contasFiltradas.length} contas</span>
              <span className="text-sm font-black text-white">
                {fmtR(contasFiltradas.reduce((a, b) => a + Number(b.saldo_restante), 0))}
              </span>
            </div>
          </div>

          {/* DIREITO — receitas + pagamentos autorizados */}
          <div className="flex flex-col gap-4">

            {/* Receitas do dia */}
            <div className="bg-[#12141f] border border-emerald-500/20 rounded-2xl overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-emerald-500/15 flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold text-emerald-400">Receitas do Dia</p>
                  <p className="text-[10px] text-emerald-400/50 mt-0.5">entradas de caixa (PIX, dinheiro, etc.)</p>
                </div>
                {!somenteLeitura && (
                  <button onClick={() => setModalReceita(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-white bg-emerald-700/60 hover:bg-emerald-600/70 border border-emerald-500/30 transition-all">
                    <Plus className="w-3.5 h-3.5" /> Adicionar
                  </button>
                )}
              </div>

              <div className="px-4 py-3 flex flex-col gap-1.5 min-h-[80px]">
                {receitas.length === 0
                  ? <div className="py-4 text-center">
                      <p className="text-xs text-white/30">Nenhuma receita registrada</p>
                      {!somenteLeitura && <p className="text-[10px] text-white/20 mt-0.5">Clique em Adicionar para registrar uma entrada</p>}
                    </div>
                  : receitas.map(r => {
                      const t = tipoInfo(r.tipo);
                      return (
                        <div key={r.id} className="flex items-center gap-2.5 px-3 py-2 bg-emerald-500/5 border border-emerald-500/15 rounded-xl group">
                          <span className={t.cor}>{t.icon}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-white truncate">{r.descricao}</p>
                            <span className={`text-[10px] font-bold ${t.cor}`}>{t.label}</span>
                          </div>
                          <p className="text-sm font-bold text-emerald-400 shrink-0">{fmtR(Number(r.valor))}</p>
                          {!somenteLeitura && (
                            <button onClick={() => removerReceita(r.id)}
                              className="opacity-0 group-hover:opacity-100 p-1 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })
                }
              </div>

              {receitas.length > 0 && (
                <div className="px-4 py-2.5 border-t border-emerald-500/15 flex justify-between items-center">
                  <span className="text-xs text-emerald-400/60">{receitas.length} entr.</span>
                  <span className="text-sm font-black text-emerald-400">{fmtR(totalEntrou)}</span>
                </div>
              )}
            </div>

            {/* Autorizado para Hoje */}
            <div className="bg-[#12141f] border border-white/10 rounded-2xl overflow-hidden flex flex-col">
              <div className="px-4 py-3 border-b border-white/10">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-white">Autorizado para Hoje</p>
                  <div className="flex gap-2">
                    {pagamentos.length > 0 && (
                      <button onClick={() => setShowRelatorio(true)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-white/60 bg-white/8 hover:bg-white/12 border border-white/10 transition-all">
                        <Printer className="w-3 h-3" /> Relatório
                      </button>
                    )}
                    {!somenteLeitura && (
                      <button onClick={() => setModalManual(true)}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-white bg-[#7D1F2C] hover:bg-[#9B2535] transition-all">
                        <Plus className="w-3 h-3" /> Manual
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto max-h-[340px] px-4 py-3">
                {pagamentos.length === 0
                  ? <div className="py-10 text-center">
                      <ClipboardList className="w-8 h-8 text-white/15 mx-auto mb-2" />
                      <p className="text-xs text-white/30">Nenhum item autorizado</p>
                      <p className="text-[10px] text-white/20 mt-1">Abra uma categoria e clique → para autorizar</p>
                    </div>
                  : <div className="space-y-4">
                      {gerentesOrd.map(g => (
                        <div key={g}>
                          <div className="flex items-center justify-between mb-2 px-1">
                            <p className="text-[11px] font-black text-white/50 uppercase tracking-wider">{g}</p>
                            <p className="text-[11px] font-bold text-white/40">
                              {fmtR(porGerente[g].reduce((a, b) => a + b.valor, 0))}
                            </p>
                          </div>
                          <div className="space-y-1.5">
                            {porGerente[g].map(item => (
                              <div key={item.id}
                                className="flex items-center gap-2.5 px-3 py-2.5 bg-white/5 rounded-xl group border border-white/8 hover:border-white/12 transition-all">
                                {badgeItem(item)}
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-medium text-white truncate">{item.descricao}</p>
                                  <p className="text-[10px] text-white/40">{item.categoria_nome ?? '—'}</p>
                                </div>
                                <p className="text-sm font-bold text-white shrink-0">{fmtR(item.valor)}</p>
                                {!somenteLeitura && (
                                  <button onClick={() => removerItem(item.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/10 transition-all">
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                }
              </div>

              <div className="px-4 py-3 border-t border-white/10 space-y-1.5">
                <div className="flex items-center gap-3 flex-wrap">
                  {[
                    { b: 'SIS',   cls: 'bg-blue-500/20 text-blue-300',      t: 'sistema' },
                    { b: 'MAN✓', cls: 'bg-emerald-500/20 text-emerald-300', t: 'manual lançado' },
                    { b: 'MAN!', cls: 'bg-yellow-500/20 text-yellow-400',   t: 'sem lançamento' },
                  ].map(l => (
                    <div key={l.b} className="flex items-center gap-1">
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md ${l.cls}`}>{l.b}</span>
                      <span className="text-[10px] text-white/30">{l.t}</span>
                    </div>
                  ))}
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-white/40">{pagamentos.length} itens</span>
                  <span className="text-sm font-black text-red-400">{fmtR(totalPago)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}


      {/* ── MODAL AUTORIZAR ─────────────────────────────────────────────────── */}
      {modalAuth && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setModalAuth(null)}>
          <div className="bg-[#0f1020] border border-white/15 rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center">
              <h3 className="font-bold text-white text-sm">Autorizar Pagamento</h3>
              <button onClick={() => setModalAuth(null)} className="p-1.5 hover:bg-white/10 rounded-xl transition-all">
                <X className="w-4 h-4 text-white/40" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="bg-white/5 rounded-xl p-3 border border-white/10">
                <p className="text-sm font-bold text-white leading-snug">{modalAuth.descricao}</p>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  <span className="text-[10px] text-white/50">{(modalAuth.categorias_financeiras as any)?.nome}</span>
                  <span className="text-[10px] text-white/25">·</span>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${vencBadge(modalAuth.data_vencimento).cls}`}>
                    {fmtData(modalAuth.data_vencimento)} · {vencBadge(modalAuth.data_vencimento).label}
                  </span>
                </div>
                {modalAuth.fornecedores?.nome && (
                  <p className="text-[10px] text-white/40 mt-1">{modalAuth.fornecedores.nome}</p>
                )}
              </div>

              <div>
                <label className="text-[11px] font-bold text-white/50 uppercase tracking-wide block mb-2">Autorizado por</label>
                <div className="grid grid-cols-3 gap-2">
                  {GERENTES.map(g => (
                    <button key={g} type="button" onClick={() => setAGerente(g)}
                      className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                        aGerente === g
                          ? 'bg-[#7D1F2C] text-white ring-2 ring-[#9B2535]/50'
                          : 'bg-white/8 text-white/50 hover:bg-white/12 hover:text-white/80'
                      }`}>
                      {g}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-white/50 uppercase tracking-wide block mb-1.5">Valor</label>
                <div className="flex items-center gap-2 bg-white/5 border border-white/20 rounded-xl px-3 py-2.5">
                  <span className="text-white/40 text-sm font-bold">R$</span>
                  <input type="number" value={aValor} onChange={e => setAValor(e.target.value)}
                    className="flex-1 bg-transparent text-white text-base font-black focus:outline-none [appearance:textfield]" />
                  <button type="button" onClick={() => setAValor(Number(modalAuth.saldo_restante).toFixed(2))}
                    className="text-[10px] text-white/30 hover:text-white/60 transition-all px-1">
                    máx
                  </button>
                </div>
                <p className="text-[10px] text-white/30 mt-1">Saldo disponível: {fmtR(Number(modalAuth.saldo_restante))}</p>
              </div>

              <div>
                <label className="text-[11px] font-bold text-white/50 uppercase tracking-wide block mb-1.5">Obs. (opcional)</label>
                <input type="text" value={aObs} onChange={e => setAObs(e.target.value)}
                  placeholder="Ex: pagar no Bradesco"
                  className="w-full bg-white/5 border border-white/15 text-white placeholder-white/20 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-white/35" />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-white/10 flex gap-3">
              <button onClick={() => setModalAuth(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-white/20 text-white/60 hover:bg-white/5 transition-all">
                Cancelar
              </button>
              <button onClick={confirmarAuth} disabled={salvando || !aGerente || !aValor}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-[#7D1F2C] text-white hover:bg-[#9B2535] transition-all disabled:opacity-40 active:scale-95">
                {salvando ? 'Salvando...' : 'Autorizar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL RECEITA ────────────────────────────────────────────────────── */}
      {modalReceita && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setModalReceita(false)}>
          <div className="bg-[#0f1020] border border-emerald-500/20 rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-emerald-500/15 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-white text-sm">Adicionar Receita</h3>
                <p className="text-[11px] text-emerald-400/70 mt-0.5">entrada de caixa do dia</p>
              </div>
              <button onClick={() => setModalReceita(false)} className="p-1.5 hover:bg-white/10 rounded-xl">
                <X className="w-4 h-4 text-white/40" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              {/* Tipo */}
              <div className="grid grid-cols-3 gap-2">
                {TIPOS_RECEITA.map(t => (
                  <button key={t.id} type="button" onClick={() => setRTipo(t.id)}
                    className={`flex flex-col items-center gap-1.5 py-3 rounded-xl text-xs font-bold transition-all ${
                      rTipo === t.id
                        ? 'bg-emerald-700/40 text-emerald-300 ring-2 ring-emerald-500/30 border border-emerald-500/30'
                        : 'bg-white/5 text-white/40 hover:bg-white/10 border border-white/10'
                    }`}>
                    <span className={rTipo === t.id ? 'text-emerald-400' : 'text-white/30'}>{t.icon}</span>
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Descrição */}
              <input type="text" value={rDesc} onChange={e => setRDesc(e.target.value)}
                placeholder="Descrição (ex: PIX evento sábado)"
                autoFocus
                className="w-full bg-white/5 border border-white/20 text-white placeholder-white/25 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-emerald-500/50" />

              {/* Valor */}
              <div className="flex items-center gap-2 bg-white/5 border border-white/20 rounded-xl px-3 py-2.5 focus-within:border-emerald-500/50 transition-colors">
                <span className="text-emerald-400/60 text-sm font-bold">R$</span>
                <input type="number" value={rValor} onChange={e => setRValor(e.target.value)}
                  placeholder="0,00"
                  className="flex-1 bg-transparent text-emerald-400 text-base font-black placeholder-white/25 focus:outline-none [appearance:textfield]" />
              </div>
            </div>

            <div className="px-5 py-4 border-t border-emerald-500/15 flex gap-3">
              <button onClick={() => setModalReceita(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-white/20 text-white/60 hover:bg-white/5 transition-all">
                Cancelar
              </button>
              <button onClick={confirmarReceita} disabled={salvando || !rDesc || !rValor}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-emerald-700 text-white hover:bg-emerald-600 transition-all disabled:opacity-40 active:scale-95">
                {salvando ? 'Salvando...' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL MANUAL RÁPIDO ──────────────────────────────────────────────── */}
      {modalManual && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setModalManual(false)}>
          <div className="bg-[#0f1020] border border-white/15 rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center">
              <div>
                <h3 className="font-bold text-white text-sm">Lançamento Manual</h3>
                <p className="text-[11px] text-yellow-400/70 mt-0.5 flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3" /> fora do sistema
                </p>
              </div>
              <button onClick={() => setModalManual(false)} className="p-1.5 hover:bg-white/10 rounded-xl">
                <X className="w-4 h-4 text-white/40" />
              </button>
            </div>

            <div className="px-5 py-4 space-y-3">
              <input type="text" value={mDesc} onChange={e => setMDesc(e.target.value)}
                placeholder="Descrição (ex: Açougue, Gás...)"
                autoFocus
                className="w-full bg-white/5 border border-white/20 text-white placeholder-white/25 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-white/40" />

              <div className="flex items-center gap-2 bg-white/5 border border-white/20 rounded-xl px-3 py-2.5">
                <span className="text-white/40 text-sm font-bold">R$</span>
                <input type="number" value={mValor} onChange={e => setMValor(e.target.value)}
                  placeholder="0,00"
                  className="flex-1 bg-transparent text-white text-base font-black placeholder-white/25 focus:outline-none [appearance:textfield]" />
              </div>

              <select value={mCatId} onChange={e => setMCatId(e.target.value)}
                className="w-full bg-[#12141f] border border-white/20 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-white/40">
                <option value="">Categoria (opcional)</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
              </select>

              <div className="grid grid-cols-3 gap-2">
                {GERENTES.map(g => (
                  <button key={g} type="button" onClick={() => setMGerente(g)}
                    className={`py-2.5 rounded-xl text-sm font-bold transition-all ${
                      mGerente === g
                        ? 'bg-[#7D1F2C] text-white'
                        : 'bg-white/8 text-white/50 hover:bg-white/12 hover:text-white/80'
                    }`}>
                    {g}
                  </button>
                ))}
              </div>
            </div>

            <div className="px-5 py-4 border-t border-white/10 flex gap-3">
              <button onClick={() => setModalManual(false)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-white/20 text-white/60 hover:bg-white/5 transition-all">
                Cancelar
              </button>
              <button onClick={confirmarManual} disabled={salvando || !mDesc || !mValor}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-[#7D1F2C] text-white hover:bg-[#9B2535] transition-all disabled:opacity-40">
                {salvando ? 'Salvando...' : 'Adicionar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL LANÇAR NO SISTEMA ──────────────────────────────────────────── */}
      {modalLancar && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setModalLancar(null)}>
          <div className="bg-[#0f1020] border border-white/15 rounded-2xl w-full max-w-sm shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-white/10 flex justify-between items-center">
              <h3 className="font-bold text-white text-sm">Lançar no Contas a Pagar</h3>
              <button onClick={() => setModalLancar(null)} className="p-1.5 hover:bg-white/10 rounded-xl">
                <X className="w-4 h-4 text-white/40" />
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <div className="bg-white/5 border border-white/10 rounded-xl p-3 flex justify-between">
                <div>
                  <p className="text-sm font-bold text-white">{modalLancar.descricao}</p>
                  <p className="text-[10px] text-white/40 mt-0.5">{modalLancar.categoria_nome}</p>
                </div>
                <p className="text-sm font-black text-white">{fmtR(modalLancar.valor)}</p>
              </div>
              <div>
                <label className="text-[11px] font-bold text-white/50 uppercase tracking-wide block mb-1.5">Vencimento</label>
                <input type="date" value={lVenc} onChange={e => setLVenc(e.target.value)}
                  className="w-full bg-white/5 border border-white/20 text-white rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-white/40" />
              </div>
              <input type="text" value={lObs} onChange={e => setLObs(e.target.value)}
                placeholder="Observação (opcional)"
                className="w-full bg-white/5 border border-white/15 text-white placeholder-white/20 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-white/35" />
            </div>
            <div className="px-5 py-4 border-t border-white/10 flex gap-3">
              <button onClick={() => setModalLancar(null)}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold border border-white/20 text-white/60 hover:bg-white/5 transition-all">
                Cancelar
              </button>
              <button onClick={confirmarLancar} disabled={salvando}
                className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-emerald-700 text-white hover:bg-emerald-600 transition-all disabled:opacity-40">
                {salvando ? 'Criando...' : 'Criar conta'}
              </button>
            </div>
          </div>
        </div>
      )}


      {/* ── MODAL RELATÓRIO ──────────────────────────────────────────────────── */}
      {showRelatorio && (() => {
        // Despesas agrupadas por categoria
        const porCategoria = pagamentos.reduce((acc, p) => {
          const cat = p.categoria_nome ?? 'Sem categoria';
          if (!acc[cat]) acc[cat] = [];
          acc[cat].push(p);
          return acc;
        }, {} as Record<string, Pagamento[]>);
        const catsOrd = Object.keys(porCategoria).sort((a, b) => a.localeCompare(b));

        return (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            {/* Toolbar (não imprime) */}
            <div className="print:hidden fixed top-4 right-4 z-[60] flex gap-2">
              <button onClick={() => window.print()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold bg-[#7D1F2C] text-white hover:bg-[#9B2535] shadow-xl transition-all">
                <Printer className="w-4 h-4" /> Imprimir
              </button>
              <button onClick={() => setShowRelatorio(false)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 text-white transition-all">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Folha do relatório — fundo branco, tudo preto */}
            <div
              id="relatorio-print"
              className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl print:shadow-none print:rounded-none print:max-h-none print:overflow-visible"
              style={{ fontFamily: 'Arial, sans-serif', color: '#111' }}
            >
              {/* Cabeçalho */}
              <div className="px-8 pt-8 pb-5 border-b-2 border-gray-800">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-widest text-gray-500 mb-1">Ditado Popular</p>
                    <h1 className="text-2xl font-black text-gray-900 leading-none">Agenda de Pagamentos</h1>
                    <p className="text-base font-semibold text-gray-700 mt-1 capitalize">{labelData}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-gray-500">Emitido em</p>
                    <p className="text-sm font-bold text-gray-700">
                      {new Date().toLocaleDateString('pt-BR')} {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>

                {/* KPIs no cabeçalho */}
                <div className="grid grid-cols-3 gap-3 mt-5">
                  <div className="border border-gray-200 rounded-lg px-4 py-2.5 text-center">
                    <p className="text-[10px] font-bold uppercase text-gray-500 tracking-wide">Receitas</p>
                    <p className="text-lg font-black text-gray-900 mt-0.5">{fmtR(totalEntrou)}</p>
                  </div>
                  <div className="border border-gray-200 rounded-lg px-4 py-2.5 text-center">
                    <p className="text-[10px] font-bold uppercase text-gray-500 tracking-wide">Pagamentos</p>
                    <p className="text-lg font-black text-gray-900 mt-0.5">{fmtR(totalPago)}</p>
                  </div>
                  <div className={`border-2 rounded-lg px-4 py-2.5 text-center ${saldoLivre >= 0 ? 'border-gray-800' : 'border-gray-400'}`}>
                    <p className="text-[10px] font-bold uppercase text-gray-500 tracking-wide">Saldo Disponível</p>
                    <p className="text-lg font-black text-gray-900 mt-0.5">{fmtR(saldoLivre)}</p>
                  </div>
                </div>
              </div>

              <div className="px-8 py-6 space-y-7">

                {/* ── RECEITAS ── */}
                {receitas.length > 0 && (
                  <section>
                    <h2 className="text-[11px] font-black uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-2">
                      <span className="flex-1 h-px bg-gray-200" />
                      Receitas do Dia
                      <span className="flex-1 h-px bg-gray-200" />
                    </h2>
                    <table className="w-full text-sm border-collapse" style={{ tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: '60%' }} />
                        <col style={{ width: '20%' }} />
                        <col style={{ width: '20%' }} />
                      </colgroup>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #d1d5db' }}>
                          <th className="text-left py-2 text-xs font-black uppercase text-gray-500 tracking-wide">Descrição</th>
                          <th className="text-left py-2 text-xs font-black uppercase text-gray-500 tracking-wide">Tipo</th>
                          <th className="text-right py-2 text-xs font-black uppercase text-gray-500 tracking-wide">Valor</th>
                        </tr>
                      </thead>
                      <tbody>
                        {receitas.map((r, i) => (
                          <tr key={r.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 1 ? '#f9fafb' : 'white' }}>
                            <td className="py-2 text-gray-900 font-medium" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.descricao}</td>
                            <td className="py-2 text-gray-600">{tipoInfo(r.tipo).label}</td>
                            <td className="py-2 font-bold text-gray-900 text-right tabular-nums">{fmtR(Number(r.valor))}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr style={{ borderTop: '2px solid #9ca3af' }}>
                          <td colSpan={2} className="py-2 text-sm font-black text-gray-700 uppercase">Total Receitas</td>
                          <td className="py-2 text-base font-black text-gray-900 text-right tabular-nums">{fmtR(totalEntrou)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </section>
                )}

                {/* ── DESPESAS POR CATEGORIA — uma única tabela com linhas de categoria ── */}
                <section>
                  <h2 className="text-[11px] font-black uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-2">
                    <span className="flex-1 h-px bg-gray-200" />
                    Despesas Autorizadas
                    <span className="flex-1 h-px bg-gray-200" />
                  </h2>

                  {pagamentos.length === 0
                    ? <p className="text-sm text-gray-400 italic">Nenhuma despesa autorizada.</p>
                    : (
                      <table className="w-full text-sm border-collapse" style={{ tableLayout: 'fixed' }}>
                        <colgroup>
                          <col style={{ width: '34%' }} />
                          <col style={{ width: '22%' }} />
                          <col style={{ width: '14%' }} />
                          <col style={{ width: '16%' }} />
                          <col style={{ width: '14%' }} />
                        </colgroup>
                        <thead>
                          <tr style={{ borderBottom: '2px solid #1f2937' }}>
                            <th className="text-left py-2 text-xs font-black uppercase text-gray-600 tracking-wide">Descrição</th>
                            <th className="text-left py-2 text-xs font-black uppercase text-gray-600 tracking-wide">Fornecedor</th>
                            <th className="text-left py-2 text-xs font-black uppercase text-gray-600 tracking-wide">Aut. por</th>
                            <th className="text-right py-2 text-xs font-black uppercase text-gray-600 tracking-wide">Valor</th>
                            <th className="text-center py-2 text-xs font-black uppercase text-gray-600 tracking-wide">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {catsOrd.map(cat => {
                            const itens = porCategoria[cat];
                            const subtotal = itens.reduce((a, b) => a + b.valor, 0);
                            return (
                              <React.Fragment key={cat}>
                                {/* Linha separadora de categoria */}
                                <tr style={{ background: '#1f2937' }}>
                                  <td colSpan={4} className="py-1.5 px-2 text-xs font-black uppercase tracking-wide" style={{ color: '#f9fafb' }}>{cat}</td>
                                  <td className="py-1.5 px-2 text-xs font-black text-right tabular-nums" style={{ color: '#f9fafb' }}>{fmtR(subtotal)}</td>
                                </tr>
                                {itens.map((p, i) => {
                                  const lancado = p.origem === 'contas_pagar' || p.lancado_contas_pagar;
                                  return (
                                    <tr key={p.id} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 0 ? 'white' : '#f9fafb' }}>
                                      <td className="py-2 pl-2 text-gray-900 font-medium text-xs" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.descricao}</td>
                                      <td className="py-2 text-gray-600 text-xs" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.fornecedor_nome ?? '—'}</td>
                                      <td className="py-2 text-gray-700 font-semibold text-xs">{p.solicitado_por}</td>
                                      <td className="py-2 font-bold text-gray-900 text-right tabular-nums text-xs">{fmtR(p.valor)}</td>
                                      <td className="py-2 text-center">
                                        {lancado
                                          ? <span style={{ fontSize: '10px', fontWeight: 900, color: '#374151', border: '1px solid #9ca3af', padding: '1px 5px', borderRadius: 3 }}>Lançado</span>
                                          : <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
                                              <span style={{ fontSize: '10px', fontWeight: 900, color: '#111827', border: '2px solid #111827', padding: '1px 5px', borderRadius: 3 }}>Falta Lançar</span>
                                              <button onClick={() => { setModalLancar(p); setShowRelatorio(false); }}
                                                className="print:hidden"
                                                style={{ fontSize: '9px', color: '#6b7280', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}>
                                                + lançar agora
                                              </button>
                                            </div>
                                        }
                                      </td>
                                    </tr>
                                  );
                                })}
                              </React.Fragment>
                            );
                          })}
                        </tbody>
                        <tfoot>
                          <tr style={{ borderTop: '2px solid #1f2937' }}>
                            <td colSpan={3} className="py-2.5 text-sm font-black uppercase text-gray-700">Total Despesas</td>
                            <td className="py-2.5 text-base font-black text-gray-900 text-right tabular-nums">{fmtR(totalPago)}</td>
                            <td />
                          </tr>
                        </tfoot>
                      </table>
                    )
                  }
                </section>

                {/* ── RESUMO POR GERENTE ── */}
                {gerentesOrd.length > 0 && (
                  <section>
                    <h2 className="text-[11px] font-black uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-2">
                      <span className="flex-1 h-px bg-gray-200" />
                      Resumo por Gerente
                      <span className="flex-1 h-px bg-gray-200" />
                    </h2>
                    <table className="w-full text-sm border-collapse" style={{ tableLayout: 'fixed' }}>
                      <colgroup>
                        <col style={{ width: '60%' }} />
                        <col style={{ width: '15%' }} />
                        <col style={{ width: '25%' }} />
                      </colgroup>
                      <thead>
                        <tr style={{ borderBottom: '2px solid #d1d5db' }}>
                          <th className="text-left py-2 text-xs font-black uppercase text-gray-500 tracking-wide">Gerente</th>
                          <th className="text-center py-2 text-xs font-black uppercase text-gray-500 tracking-wide">Itens</th>
                          <th className="text-right py-2 text-xs font-black uppercase text-gray-500 tracking-wide">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {gerentesOrd.map((g, i) => (
                          <tr key={g} style={{ borderBottom: '1px solid #f3f4f6', background: i % 2 === 1 ? '#f9fafb' : 'white' }}>
                            <td className="py-2 font-semibold text-gray-900">{g}</td>
                            <td className="py-2 text-center text-gray-600">{porGerente[g].length}</td>
                            <td className="py-2 font-bold text-gray-900 text-right tabular-nums">{fmtR(porGerente[g].reduce((a, b) => a + b.valor, 0))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </section>
                )}

                {/* ── SALDO FINAL ── */}
                <section className="border-2 border-gray-800 rounded-lg px-6 py-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-gray-500">Saldo Disponível</p>
                      <p className="text-xs text-gray-500 mt-0.5">Receitas ({fmtR(totalEntrou)}) − Pagamentos ({fmtR(totalPago)})</p>
                    </div>
                    <p className="text-3xl font-black text-gray-900">{fmtR(saldoLivre)}</p>
                  </div>
                </section>

                {/* ── ASSINATURA ── */}
                <section className="grid grid-cols-2 gap-10 pt-2">
                  <div>
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-6">Visto Financeiro</p>
                    <div className="border-b border-gray-400" />
                    <p className="text-[10px] text-gray-400 mt-1">Assinatura</p>
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-gray-500 uppercase tracking-wide mb-6">Data</p>
                    <div className="border-b border-gray-400" />
                    <p className="text-[10px] text-gray-400 mt-1">_____ / _____ / __________</p>
                  </div>
                </section>

              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};

export default AgendaDiaria;
