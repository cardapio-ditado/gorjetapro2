import React, { useState, useEffect, useCallback } from 'react';
import {
  ClipboardList, ArrowRight, X, ChevronLeft, ChevronRight,
  Plus, CheckCircle, Printer, RefreshCw, TrendingUp, Banknote, Wallet, Inbox,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import {
  Badge, Button, EmptyState, IconButton, Input, KPICard, Modal, PageHeader, SectionCard, Segmented, Select,
  type BadgeVariante,
} from '../components/ui';

// ─── Constantes ──────────────────────────────────────────────────────────────
const FORNECEDOR_AVULSO_ID = '7456e7b4-f4cb-4835-b85c-8f1625b04e84';
const GERENTES = ['Cristiano', 'Kadu', 'Beth'];

const TIPOS_RECEITA = [
  { id: 'pix',      label: 'PIX',      icon: <TrendingUp size={14} aria-hidden="true" /> },
  { id: 'dinheiro', label: 'Dinheiro', icon: <Banknote size={14} aria-hidden="true" /> },
  { id: 'outro',    label: 'Outro',    icon: <Wallet size={14} aria-hidden="true" /> },
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

/** Quanto falta (ou passou) do vencimento, como etiqueta do kit. */
const vencBadge = (dataVenc: string): { label: string; variant: BadgeVariante } => {
  const diff = Math.floor((new Date(dataVenc + 'T12:00').getTime() - Date.now()) / 86400000);
  if (diff < 0)   return { label: `${Math.abs(diff)}d atraso`, variant: 'danger' };
  if (diff === 0) return { label: 'hoje',                      variant: 'warning' };
  if (diff <= 7)  return { label: `${diff}d`,                  variant: 'warning' };
  return               { label: fmtData(dataVenc),             variant: 'neutral' };
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
  categorias_financeiras: { id: string; nome: string } | null;
  fornecedores: { nome: string } | null;
}
interface Categoria { id: string; nome: string; }

type Filtro = 'vencidas' | '7dias' | 'todas';

// ─── Componente Principal ────────────────────────────────────────────────────
const AgendaDiaria: React.FC = () => {
  const [dataAtual, setDataAtual]   = useState(new Date().toISOString().split('T')[0]);
  const [sessao, setSessao]         = useState<Sessao | null>(null);
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([]);
  const [receitas, setReceitas]     = useState<Receita[]>([]);
  const [contas, setContas]         = useState<ContaPagar[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading]       = useState(true);
  const [filtro, setFiltro]         = useState<Filtro>('todas');
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
    const cat = c.categorias_financeiras?.nome ?? 'Sem categoria';
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
        categoria_id: modalAuth.categorias_financeiras?.id ?? null,
        categoria_nome: modalAuth.categorias_financeiras?.nome ?? null,
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
      const cid = (conta as { id?: string } | null)?.id;
      await supabase.from('agenda_pagamentos').update({
        lancado_contas_pagar: true, lancado_em: new Date().toISOString(),
        lancado_por: 'financeiro', conta_pagar_criada_id: cid, conta_pagar_ref_id: cid,
      }).eq('id', modalLancar.id);
      setPagamentos(p => p.map(x => x.id === modalLancar.id
        ? { ...x, lancado_contas_pagar: true, conta_pagar_criada_id: cid ?? null, conta_pagar_ref_id: cid ?? null } : x));
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
  const badgeItem = (p: Pagamento) => {
    if (p.origem === 'contas_pagar') return <Badge variant="info">sistema</Badge>;
    if (p.lancado_contas_pagar) return <Badge variant="success">manual lançado</Badge>;
    return <Badge variant="warning">sem lançamento</Badge>;
  };

  const tipoInfo = (tipo: string) => TIPOS_RECEITA.find(t => t.id === tipo) ?? TIPOS_RECEITA[2];

  const labelData = new Date(dataAtual + 'T12:00').toLocaleDateString('pt-BR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
  });
  const labelDataCapitalizada = labelData.charAt(0).toUpperCase() + labelData.slice(1);

  const escolherGerente = (valor: string, onMudar: (g: string) => void) => (
    <Segmented
      rotulo="Autorizado por"
      valor={valor}
      onMudar={onMudar}
      opcoes={GERENTES.map(g => ({ valor: g, rotulo: g }))}
    />
  );

  if (loading) return (
    <div className="flex items-center justify-center min-h-96" aria-busy="true">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2" style={{ borderColor: 'var(--wine)' }} />
    </div>
  );

  return (
    <div className="pb-16">

      {/* ── Cabeçalho: caminho, dia, ações ────────────────────────────────── */}
      <PageHeader
        caminho={['Operação', 'Agenda do dia']}
        title="Agenda do dia"
        subtitle={labelDataCapitalizada}
        actions={
          <>
            <div className="flex items-center gap-1">
              <IconButton aria-label="Dia anterior" onClick={() => irParaDia(-1)}><ChevronLeft size={16} /></IconButton>
              {isHoje
                ? <Badge variant="gold">Hoje</Badge>
                : <Button variante="discreto" tamanho="sm" onClick={() => setDataAtual(hoje)}>Voltar para hoje</Button>}
              <IconButton aria-label="Dia seguinte" onClick={() => irParaDia(+1)} disabled={isHoje}><ChevronRight size={16} /></IconButton>
            </div>
            {sessao && (
              <Badge variant={sessao.status === 'finalizada' ? 'success' : 'neutral'}>
                {sessao.status === 'finalizada' ? 'Finalizada' : 'Em aberto'}
              </Badge>
            )}
            <IconButton aria-label="Atualizar" onClick={() => carregar(dataAtual)}><RefreshCw size={16} /></IconButton>
            {isHoje && sessao && sessao.status !== 'finalizada' && (
              <Button variante="primario" icone={<CheckCircle size={16} />} onClick={finalizarDia}>Finalizar dia</Button>
            )}
          </>
        }
      />

      {/* ── Números do dia ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-5">
        <KPICard rotulo="Receitas" valor={fmtR(totalEntrou)} tom="certo" detalhe={`${receitas.length} ${receitas.length === 1 ? 'entrada' : 'entradas'}`} />
        <KPICard rotulo="Pagamentos" valor={fmtR(totalPago)} detalhe={`${pagamentos.length} ${pagamentos.length === 1 ? 'item' : 'itens'}`} />
        <KPICard rotulo="Saldo disponível" valor={fmtR(saldoLivre)} tom={saldoLivre >= 0 ? 'destaque' : 'alerta'} detalhe="receitas menos pagamentos" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">

        {/* ── Contas em aberto ──────────────────────────────────────────────── */}
        <SectionCard title="Contas em aberto" descricao="O que o sistema tem para pagar. Abra a categoria e autorize." noPadding>
          <div className="px-5 py-3 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
            <Segmented<Filtro>
              rotulo="Vencimento"
              valor={filtro}
              onMudar={setFiltro}
              opcoes={[
                { valor: 'vencidas', rotulo: 'Vencidas' },
                { valor: '7dias', rotulo: 'Próximos 7 dias' },
                { valor: 'todas', rotulo: 'Todas' },
              ]}
            />
            <Input type="search" placeholder="Buscar conta ou fornecedor" aria-label="Buscar conta" value={busca} onChange={e => setBusca(e.target.value)} className="flex-1 min-w-[180px]" />
          </div>

          <div className="overflow-y-auto max-h-[560px]">
            {Object.entries(grupos).length === 0
              ? <EmptyState icon={Inbox} title="Nenhuma conta" description={busca || filtro !== 'todas' ? 'Nada bate com o filtro.' : 'Não há contas em aberto.'} variant={busca || filtro !== 'todas' ? 'filtered' : 'empty'} compact />
              : Object.entries(grupos).sort(([a], [b]) => a.localeCompare(b)).map(([cat, items]) => {
                  const aberto = accordion.has(cat);
                  const tot = items.reduce((a, b) => a + Number(b.saldo_restante), 0);
                  return (
                    <div key={cat}>
                      <button
                        type="button"
                        aria-expanded={aberto}
                        onClick={() => setAccordion(prev => { const n = new Set(prev); if (n.has(cat)) n.delete(cat); else n.add(cat); return n; })}
                        className="w-full flex items-center justify-between gap-3 px-5 h-11 hover:bg-white/[0.04] transition-colors focus-ring"
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <ChevronRight size={14} className={`flex-shrink-0 transition-transform ${aberto ? 'rotate-90' : ''}`} style={{ color: 'var(--text-secondary)' }} aria-hidden="true" />
                          <span className="t-label truncate" style={{ color: 'var(--text-primary)' }}>{cat}</span>
                          <span className="t-caption">{items.length}</span>
                        </span>
                        <span className="t-label num" style={{ color: 'var(--text-secondary)' }}>{fmtR(tot)}</span>
                      </button>

                      {aberto && items.map(c => {
                        const jaAuth = idsAuth.has(c.id);
                        const badge  = vencBadge(c.data_vencimento);
                        return (
                          <div key={c.id} className="flex items-center gap-3 px-5 py-3 hover:bg-white/[0.03] transition-colors" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                            <div className="w-16 flex-shrink-0 flex flex-col items-start gap-1">
                              <span className="t-caption" style={{ color: 'var(--text-primary)' }}>{fmtData(c.data_vencimento)}</span>
                              <Badge variant={badge.variant}>{badge.label}</Badge>
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="t-body truncate" style={{ color: 'var(--text-primary)', margin: 0, fontWeight: 500 }}>{c.descricao}</p>
                              {c.fornecedores?.nome && <p className="t-caption truncate" style={{ margin: 0 }}>{c.fornecedores.nome}</p>}
                              {jaAuth && <p className="t-caption" style={{ margin: 0, color: '#34d399' }}>Autorizado</p>}
                            </div>
                            <span className="t-body num flex-shrink-0" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{fmtR(Number(c.saldo_restante))}</span>
                            <Button
                              variante={jaAuth || somenteLeitura ? 'secundario' : 'primario'}
                              tamanho="sm"
                              aria-label={jaAuth ? 'Já autorizado' : `Autorizar ${c.descricao}`}
                              title={jaAuth ? 'Já autorizado' : 'Autorizar pagamento'}
                              onClick={() => { if (!somenteLeitura && !jaAuth) abrirAuth(c); }}
                              disabled={jaAuth || somenteLeitura}
                              className="w-8 px-0 flex-shrink-0"
                            >
                              <ArrowRight size={16} />
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })
            }
          </div>

          <div className="px-5 py-3 flex justify-between items-center" style={{ borderTop: '1px solid var(--border)' }}>
            <span className="t-caption">{contasFiltradas.length} {contasFiltradas.length === 1 ? 'conta' : 'contas'}</span>
            <span className="t-body num" style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
              {fmtR(contasFiltradas.reduce((a, b) => a + Number(b.saldo_restante), 0))}
            </span>
          </div>
        </SectionCard>

        {/* ── Receitas + autorizados ────────────────────────────────────────── */}
        <div className="flex flex-col gap-5">

          <SectionCard
            title="Receitas do dia"
            descricao="Entradas de caixa: PIX, dinheiro e outros."
            action={!somenteLeitura && <Button tamanho="sm" icone={<Plus size={14} />} onClick={() => setModalReceita(true)}>Adicionar</Button>}
            noPadding
          >
            <div className="px-5 py-3 flex flex-col gap-2 min-h-[80px]">
              {receitas.length === 0
                ? <EmptyState icon={Inbox} title="Nenhuma receita registrada" description={somenteLeitura ? undefined : 'Toque em Adicionar para registrar uma entrada.'} compact />
                : receitas.map(r => {
                    const t = tipoInfo(r.tipo);
                    return (
                      <div key={r.id} className="flex items-center gap-3 px-3 h-12 rounded-lg" style={{ background: 'rgba(16,185,129,0.06)', border: '1px solid rgba(16,185,129,0.2)' }}>
                        <span style={{ color: '#34d399' }}>{t.icon}</span>
                        <div className="flex-1 min-w-0">
                          <p className="t-body truncate" style={{ color: 'var(--text-primary)', margin: 0, fontWeight: 500 }}>{r.descricao}</p>
                          <p className="t-caption" style={{ margin: 0 }}>{t.label}</p>
                        </div>
                        <span className="t-body num flex-shrink-0" style={{ color: '#34d399', fontWeight: 600 }}>{fmtR(Number(r.valor))}</span>
                        {!somenteLeitura && (
                          <IconButton aria-label={`Remover ${r.descricao}`} tom="perigo" onClick={() => removerReceita(r.id)}><X size={14} /></IconButton>
                        )}
                      </div>
                    );
                  })
              }
            </div>
            {receitas.length > 0 && (
              <div className="px-5 py-3 flex justify-between items-center" style={{ borderTop: '1px solid var(--border)' }}>
                <span className="t-caption">{receitas.length} {receitas.length === 1 ? 'entrada' : 'entradas'}</span>
                <span className="t-body num" style={{ color: '#34d399', fontWeight: 700 }}>{fmtR(totalEntrou)}</span>
              </div>
            )}
          </SectionCard>

          <SectionCard
            title="Autorizado para hoje"
            descricao="Por gerente. Sistema vem das contas a pagar; manual é fora dele."
            action={
              <>
                {pagamentos.length > 0 && <Button tamanho="sm" icone={<Printer size={14} />} onClick={() => setShowRelatorio(true)}>Relatório</Button>}
                {!somenteLeitura && <Button tamanho="sm" icone={<Plus size={14} />} onClick={() => setModalManual(true)}>Manual</Button>}
              </>
            }
            noPadding
          >
            <div className="overflow-y-auto max-h-[340px] px-5 py-3">
              {pagamentos.length === 0
                ? <EmptyState icon={ClipboardList} title="Nenhum item autorizado" description="Abra uma categoria à esquerda e toque na seta para autorizar." compact />
                : <div className="flex flex-col gap-4">
                    {gerentesOrd.map(g => (
                      <div key={g}>
                        <div className="flex items-center justify-between mb-2">
                          <p className="t-caps" style={{ color: 'var(--text-secondary)', fontSize: 11, margin: 0 }}>{g}</p>
                          <p className="t-label num" style={{ color: 'var(--text-secondary)', margin: 0 }}>{fmtR(porGerente[g].reduce((a, b) => a + b.valor, 0))}</p>
                        </div>
                        <div className="flex flex-col gap-1.5">
                          {porGerente[g].map(item => (
                            <div key={item.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
                              <div className="flex-1 min-w-0">
                                <p className="t-body truncate" style={{ color: 'var(--text-primary)', margin: 0, fontWeight: 500 }}>{item.descricao}</p>
                                <div className="flex items-center gap-2 mt-0.5">
                                  {badgeItem(item)}
                                  <span className="t-caption truncate">{item.categoria_nome ?? '—'}</span>
                                </div>
                              </div>
                              <span className="t-body num flex-shrink-0" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{fmtR(item.valor)}</span>
                              {!somenteLeitura && (
                                <IconButton aria-label={`Remover ${item.descricao}`} tom="perigo" onClick={() => removerItem(item.id)}><X size={14} /></IconButton>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
              }
            </div>
            <div className="px-5 py-3 flex justify-between items-center" style={{ borderTop: '1px solid var(--border)' }}>
              <span className="t-caption">{pagamentos.length} {pagamentos.length === 1 ? 'item' : 'itens'}</span>
              <span className="t-body num" style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{fmtR(totalPago)}</span>
            </div>
          </SectionCard>
        </div>
      </div>

      {/* ── Modal: autorizar ─────────────────────────────────────────────────── */}
      <Modal
        aberto={!!modalAuth}
        onFechar={() => setModalAuth(null)}
        titulo="Autorizar pagamento"
        travado={salvando}
        rodape={
          <>
            <Button variante="discreto" onClick={() => setModalAuth(null)} disabled={salvando}>Cancelar</Button>
            <Button variante="primario" onClick={confirmarAuth} carregando={salvando} disabled={!aGerente || !aValor}>Autorizar</Button>
          </>
        }
      >
        {modalAuth && (
          <>
            <div className="p-3 rounded-lg" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <p className="t-body" style={{ color: 'var(--text-primary)', margin: 0, fontWeight: 600 }}>{modalAuth.descricao}</p>
              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                <span className="t-caption">{modalAuth.categorias_financeiras?.nome}</span>
                <Badge variant={vencBadge(modalAuth.data_vencimento).variant}>{fmtData(modalAuth.data_vencimento)} · {vencBadge(modalAuth.data_vencimento).label}</Badge>
              </div>
              {modalAuth.fornecedores?.nome && <p className="t-caption" style={{ margin: '4px 0 0' }}>{modalAuth.fornecedores.nome}</p>}
            </div>

            <div className="flex flex-col gap-1">
              <span className="t-label" style={{ color: 'var(--text-secondary)' }}>Autorizado por</span>
              {escolherGerente(aGerente, setAGerente)}
            </div>

            <Input
              rotulo="Valor"
              type="number"
              inputMode="decimal"
              value={aValor}
              onChange={e => setAValor(e.target.value)}
              dica={`Saldo disponível: ${fmtR(Number(modalAuth.saldo_restante))}`}
            />
            <Button variante="discreto" tamanho="sm" onClick={() => setAValor(Number(modalAuth.saldo_restante).toFixed(2))} className="self-start -mt-2">Usar o saldo todo</Button>

            <Input rotulo="Observação (opcional)" type="text" value={aObs} onChange={e => setAObs(e.target.value)} placeholder="Ex: pagar no Bradesco" />
          </>
        )}
      </Modal>

      {/* ── Modal: receita ───────────────────────────────────────────────────── */}
      <Modal
        aberto={modalReceita}
        onFechar={() => setModalReceita(false)}
        titulo="Adicionar receita"
        descricao="Entrada de caixa do dia."
        travado={salvando}
        rodape={
          <>
            <Button variante="discreto" onClick={() => setModalReceita(false)} disabled={salvando}>Cancelar</Button>
            <Button variante="primario" onClick={confirmarReceita} carregando={salvando} disabled={!rDesc || !rValor}>Adicionar</Button>
          </>
        }
      >
        <div className="flex flex-col gap-1">
          <span className="t-label" style={{ color: 'var(--text-secondary)' }}>Tipo</span>
          <Segmented rotulo="Tipo de receita" valor={rTipo} onMudar={setRTipo} opcoes={TIPOS_RECEITA.map(t => ({ valor: t.id, rotulo: t.label }))} />
        </div>
        <Input rotulo="Descrição" type="text" value={rDesc} onChange={e => setRDesc(e.target.value)} placeholder="Ex: PIX evento sábado" autoFocus />
        <Input rotulo="Valor" type="number" inputMode="decimal" value={rValor} onChange={e => setRValor(e.target.value)} placeholder="0,00" />
      </Modal>

      {/* ── Modal: manual ────────────────────────────────────────────────────── */}
      <Modal
        aberto={modalManual}
        onFechar={() => setModalManual(false)}
        titulo="Lançamento manual"
        descricao="Pagamento fora do sistema. Depois pode ser lançado no contas a pagar pelo relatório."
        travado={salvando}
        rodape={
          <>
            <Button variante="discreto" onClick={() => setModalManual(false)} disabled={salvando}>Cancelar</Button>
            <Button variante="primario" onClick={confirmarManual} carregando={salvando} disabled={!mDesc || !mValor}>Adicionar</Button>
          </>
        }
      >
        <Input rotulo="Descrição" type="text" value={mDesc} onChange={e => setMDesc(e.target.value)} placeholder="Ex: Açougue, Gás" autoFocus />
        <Input rotulo="Valor" type="number" inputMode="decimal" value={mValor} onChange={e => setMValor(e.target.value)} placeholder="0,00" />
        <Select rotulo="Categoria (opcional)" value={mCatId} onChange={e => setMCatId(e.target.value)}>
          <option value="">Sem categoria</option>
          {categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Select>
        <div className="flex flex-col gap-1">
          <span className="t-label" style={{ color: 'var(--text-secondary)' }}>Autorizado por</span>
          {escolherGerente(mGerente, setMGerente)}
        </div>
      </Modal>

      {/* ── Modal: lançar no contas a pagar ──────────────────────────────────── */}
      <Modal
        aberto={!!modalLancar}
        onFechar={() => setModalLancar(null)}
        titulo="Lançar no contas a pagar"
        travado={salvando}
        rodape={
          <>
            <Button variante="discreto" onClick={() => setModalLancar(null)} disabled={salvando}>Cancelar</Button>
            <Button variante="primario" onClick={confirmarLancar} carregando={salvando}>Criar conta</Button>
          </>
        }
      >
        {modalLancar && (
          <>
            <div className="p-3 rounded-lg flex justify-between gap-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <div className="min-w-0">
                <p className="t-body truncate" style={{ color: 'var(--text-primary)', margin: 0, fontWeight: 600 }}>{modalLancar.descricao}</p>
                <p className="t-caption" style={{ margin: '2px 0 0' }}>{modalLancar.categoria_nome ?? 'Sem categoria'}</p>
              </div>
              <span className="t-body num" style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{fmtR(modalLancar.valor)}</span>
            </div>
            <Input rotulo="Vencimento" type="date" value={lVenc} onChange={e => setLVenc(e.target.value)} />
            <Input rotulo="Observação (opcional)" type="text" value={lObs} onChange={e => setLObs(e.target.value)} />
          </>
        )}
      </Modal>

      {/* ── Relatório para impressão (folha branca, fora do tema) ───────────── */}
      {showRelatorio && (() => {
        const porCategoria = pagamentos.reduce((acc, p) => {
          const cat = p.categoria_nome ?? 'Sem categoria';
          if (!acc[cat]) acc[cat] = [];
          acc[cat].push(p);
          return acc;
        }, {} as Record<string, Pagamento[]>);
        const catsOrd = Object.keys(porCategoria).sort((a, b) => a.localeCompare(b));

        return (
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
            {/* Barra (não imprime) */}
            <div className="print:hidden fixed top-4 right-4 z-[60] flex gap-2">
              <Button variante="primario" icone={<Printer size={16} />} onClick={() => window.print()}>Imprimir</Button>
              <IconButton aria-label="Fechar relatório" onClick={() => setShowRelatorio(false)}><X size={18} /></IconButton>
            </div>

            {/* Folha do relatório — fundo branco, tudo preto */}
            <div
              id="relatorio-print"
              className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto shadow-2xl print:shadow-none print:rounded-none print:max-h-none print:overflow-visible"
              style={{ fontFamily: 'Arial, sans-serif', color: '#111' }}
            >
              <div className="px-8 pt-8 pb-5 border-b-2 border-gray-800">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-caption font-bold uppercase tracking-widest text-gray-500 mb-1">Ditado Popular</p>
                    <h1 className="text-2xl font-black text-gray-900 leading-none">Agenda de Pagamentos</h1>
                    <p className="text-base font-semibold text-gray-700 mt-1 capitalize">{labelData}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-caption text-gray-500">Emitido em</p>
                    <p className="text-sm font-bold text-gray-700">
                      {new Date().toLocaleDateString('pt-BR')} {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 mt-5">
                  <div className="border border-gray-200 rounded-lg px-4 py-2.5 text-center">
                    <p className="text-caption font-bold uppercase text-gray-500 tracking-wide">Receitas</p>
                    <p className="text-lg font-black text-gray-900 mt-0.5">{fmtR(totalEntrou)}</p>
                  </div>
                  <div className="border border-gray-200 rounded-lg px-4 py-2.5 text-center">
                    <p className="text-caption font-bold uppercase text-gray-500 tracking-wide">Pagamentos</p>
                    <p className="text-lg font-black text-gray-900 mt-0.5">{fmtR(totalPago)}</p>
                  </div>
                  <div className={`border-2 rounded-lg px-4 py-2.5 text-center ${saldoLivre >= 0 ? 'border-gray-800' : 'border-gray-400'}`}>
                    <p className="text-caption font-bold uppercase text-gray-500 tracking-wide">Saldo Disponível</p>
                    <p className="text-lg font-black text-gray-900 mt-0.5">{fmtR(saldoLivre)}</p>
                  </div>
                </div>
              </div>

              <div className="px-8 py-6 space-y-7">

                {receitas.length > 0 && (
                  <section>
                    <h2 className="text-caption font-black uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-2">
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

                <section>
                  <h2 className="text-caption font-black uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-2">
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

                {gerentesOrd.length > 0 && (
                  <section>
                    <h2 className="text-caption font-black uppercase tracking-widest text-gray-500 mb-2 flex items-center gap-2">
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

                <section className="border-2 border-gray-800 rounded-lg px-6 py-4">
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="text-xs font-black uppercase tracking-widest text-gray-500">Saldo Disponível</p>
                      <p className="text-xs text-gray-500 mt-0.5">Receitas ({fmtR(totalEntrou)}) − Pagamentos ({fmtR(totalPago)})</p>
                    </div>
                    <p className="text-3xl font-black text-gray-900">{fmtR(saldoLivre)}</p>
                  </div>
                </section>

                <section className="grid grid-cols-2 gap-10 pt-2">
                  <div>
                    <p className="text-caption font-bold text-gray-500 uppercase tracking-wide mb-6">Visto Financeiro</p>
                    <div className="border-b border-gray-400" />
                    <p className="text-caption text-gray-400 mt-1">Assinatura</p>
                  </div>
                  <div>
                    <p className="text-caption font-bold text-gray-500 uppercase tracking-wide mb-6">Data</p>
                    <div className="border-b border-gray-400" />
                    <p className="text-caption text-gray-400 mt-1">_____ / _____ / __________</p>
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
