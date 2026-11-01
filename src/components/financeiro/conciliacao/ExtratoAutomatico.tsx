import { useState, useEffect, useCallback, useMemo } from 'react';
import { RefreshCw, CheckCircle2, Ban, ChevronDown, ChevronRight, Search, Inbox, ArrowDownLeft, ArrowUpRight } from 'lucide-react';
import dayjs from 'dayjs';
import { supabase } from '../../../lib/supabase';
import {
  Badge, Button, Chip, Combobox, EmptyState, IconButton, Input, KPICard, Modal, SectionCard, Segmented, Select, Toolbar, TableSkeleton,
} from '../../ui';
import NovoFornecedor from './NovoFornecedor';
import {
  fmt, acaoInicial, validar, lancar, registrarIgnorada, SUG_VAZIA,
  type Forma, type Categoria, type Fornecedor, type Linha, type Sugestao, type Acao,
} from './lancar';

// Extrato automático da Conta Stone (Pluggy / Meu Pluggy, função pluggy-sync).
// - Saídas para conciliar, agrupadas por quem recebeu (CPF/CNPJ): escolhe o
//   fornecedor uma vez para o grupo e aprova tudo, ou marca linhas e aprova em
//   lote. O fornecedor escolhido vira regra para o mesmo documento.
// - Cartão e Pix da maquininha são reconhecidos sozinhos e, com um clique por
//   dia, viram até 3 contas a receber (fn_banco_lancar_recebimentos).
// - Entradas fora da maquininha ficam para conferir. A Reserva Stone é
//   movimento interno e fica fora.

interface Integracao {
  id: string; nome: string; banco_conta_id: string;
  saldo: number | null; saldo_em: string | null;
  ultimo_sync_em: string | null; ultimo_sync_ok: boolean | null; ultimo_erro: string | null;
  consentimento_expira_em: string | null;
  ultimo_resumo: { item_atualizado_em?: string | null } | null;
}

interface Movimento {
  id: string; externo_id: string; data: string; valor: number; sentido: 'credito' | 'debito';
  descricao: string | null; contraparte_nome: string | null; contraparte_doc_tipo: string | null; operacao: string | null;
  doc_digitos: string | null; classe: string; status: string; fornecedor_id: string | null; categoria_id: string | null;
  regra_id: string | null; conta_receber_id: string | null;
}

type LinhaAuto = Linha & {
  extratoId: string; nome: string | null; docTipo: string | null; doc: string | null; classe: string;
  /** fornecedor veio de regra ou do CNPJ cadastrado (sugestão confiável) */
  reconhecido: boolean;
  selecionada: boolean;
};

interface Grupo { chave: string; nome: string; doc: string | null; docTipo: string | null; classe: string; linhas: LinhaAuto[]; total: number }

interface DiaReceber {
  data: string;
  grupos: { grupo: string; qtd: number; total: number }[];
  total: number;
  manuais: { descricao: string; valor: number; forma: string | null }[];
  inicioDoExtrato: boolean;
  lancando: boolean;
  erro: string | null;
}

const CAMPOS = 'id, externo_id, data, valor, sentido, descricao, contraparte_nome, contraparte_doc_tipo, operacao, doc_digitos, classe, status, fornecedor_id, categoria_id, regra_id, conta_receber_id';
const DIAS_RESUMO = 7;
const GRUPOS_RECEBER: Record<string, string> = {
  cartao_liquidacao: 'Cartão (liquidação)', cartao_antecipacao: 'Cartão (antecipação)', pix_maquininha: 'Pix maquininha',
};
const grupoDe = (m: Movimento) => (m.classe === 'receita_pix' ? 'pix_maquininha'
  : /^Antecipação/i.test(m.descricao || '') ? 'cartao_antecipacao' : 'cartao_liquidacao');
const COLUNAS_RESUMO: { chave: string; rotulo: string; entrada: boolean }[] = [
  { chave: 'receita_cartao', rotulo: 'Cartão', entrada: true },
  { chave: 'receita_pix', rotulo: 'Pix maquininha', entrada: true },
  { chave: 'receita_outros', rotulo: 'Outras entradas', entrada: true },
  { chave: 'fornecedor', rotulo: 'Fornecedores', entrada: false },
  { chave: 'pessoa', rotulo: 'Pessoas físicas', entrada: false },
  { chave: 'outros', rotulo: 'Outras saídas', entrada: false },
];
const ACOES: Record<Acao, string> = { nova: 'Criar conta e pagar', baixa: 'Pagar conta aberta', ja: 'Já está lançada', ignorar: 'Ignorar' };

/** CPF aparece mascarado na tela; CNPJ inteiro. */
function documento(tipo: string | null, d: string | null) {
  if (!d) return '';
  if (d.length === 11) return `CPF •••.${d.slice(3, 6)}.${d.slice(6, 9)}-••`;
  if (d.length === 14) return `CNPJ ${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return `${tipo ?? 'Doc'} ${d}`;
}

/** "Já está lançada" só vale se o lançamento parecido tiver o nome de quem recebeu (valor e data sozinhos enganam). */
const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
function mesmoNome(nome: string | null, descricao: string) {
  if (!nome) return false;
  const d = normal(descricao);
  return normal(nome).split(/[^a-z0-9]+/).filter(p => p.length >= 4).some(p => d.includes(p));
}

/** Pronta = tem tudo que precisa para aprovar. */
const pronta = (l: LinhaAuto) => l.status === 'pendente'
  && (l.acao === 'ja' || (l.acao === 'baixa' && !!l.contaPagarId) || (l.acao === 'nova' && !!l.fornecedorId));

/** Ao escolher o fornecedor: conta aberta dele com o mesmo valor vira "pagar conta aberta"; senão "criar conta e pagar". */
function aplicarFornecedor(l: LinhaAuto, f: Fornecedor | undefined, categoriaId?: string): LinhaAuto {
  if (!f) return { ...l, fornecedorId: '', erro: null };
  const conta = l.sug.contas_abertas.find(c => c.fornecedor_id === f.id);
  return {
    ...l,
    fornecedorId: f.id,
    categoriaId: categoriaId || l.categoriaId || f.categoria_padrao_id || '',
    acao: l.acao === 'ja' ? 'ja' : conta ? 'baixa' : 'nova',
    contaPagarId: conta?.id || l.contaPagarId,
    erro: null,
  };
}

export default function ExtratoAutomatico() {
  const [integ, setInteg] = useState<Integracao | null>(null);
  const [semIntegracao, setSemIntegracao] = useState(false);
  const [formas, setFormas] = useState<Forma[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [resumo, setResumo] = useState<Movimento[]>([]);
  const [saidas, setSaidas] = useState<LinhaAuto[]>([]);
  const [entradas, setEntradas] = useState<Movimento[]>([]);
  const [receber, setReceber] = useState<DiaReceber[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [aprovando, setAprovando] = useState<{ feitas: number; total: number } | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'certo' | 'perigo'; texto: string } | null>(null);
  // filtros
  const [tipo, setTipo] = useState<'todas' | 'fornecedor' | 'pessoa' | 'outros'>('todas');
  const [soSemFornecedor, setSoSemFornecedor] = useState(false);
  const [busca, setBusca] = useState('');
  const [abertos, setAbertos] = useState<Set<string>>(new Set());
  const [verResumo, setVerResumo] = useState(false);
  // janelas
  const [novoForn, setNovoForn] = useState<{ chave: string; nome: string; doc: string | null } | null>(null);
  const [ignorarSempre, setIgnorarSempre] = useState<Grupo | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [ig, f, c, forn] = await Promise.all([
        supabase.from('banco_integracoes').select('*').eq('ativo', true).order('criado_em').limit(1).maybeSingle(),
        supabase.from('formas_pagamento').select('id, nome').eq('status', 'ativo').order('nome'),
        supabase.from('categorias_financeiras').select('id, nome').eq('status', 'ativo').eq('tipo', 'despesa').order('nome'),
        supabase.from('fornecedores').select('id, nome, cnpj, categoria_padrao_id').eq('status', 'ativo').order('nome'),
      ]);
      const integracao = ig.data as Integracao | null;
      setInteg(integracao);
      setSemIntegracao(!integracao);
      setFormas(f.data || []);
      setCategorias((c.data || []) as Categoria[]);
      setFornecedores((forn.data || []) as any);
      if (!integracao) return;

      const desde = dayjs().subtract(DIAS_RESUMO - 1, 'day').format('YYYY-MM-DD');
      const hoje = dayjs().format('YYYY-MM-DD');
      const [r, pd, pc, rc, pri] = await Promise.all([
        supabase.from('banco_extrato').select(CAMPOS).eq('integracao_id', integracao.id).gte('data', desde).limit(5000),
        supabase.from('banco_extrato').select(CAMPOS).eq('integracao_id', integracao.id).eq('status', 'pendente').eq('sentido', 'debito')
          .order('data', { ascending: false }).limit(300),
        supabase.from('banco_extrato').select(CAMPOS).eq('integracao_id', integracao.id).eq('status', 'pendente').eq('sentido', 'credito')
          .order('data', { ascending: false }).limit(200),
        supabase.from('banco_extrato').select(CAMPOS).eq('integracao_id', integracao.id).is('conta_receber_id', null)
          .in('classe', ['receita_cartao', 'receita_pix']).neq('status', 'ignorada').lt('data', hoje).limit(5000),
        supabase.from('banco_extrato').select('data').eq('integracao_id', integracao.id).order('data').limit(1).maybeSingle(),
      ]);
      setResumo((r.data || []) as Movimento[]);
      setEntradas((pc.data || []) as Movimento[]);

      // recebimentos por dia e grupo, com o que foi lançado à mão no mesmo dia
      const porDia = new Map<string, Map<string, { qtd: number; total: number }>>();
      for (const m of (rc.data || []) as Movimento[]) {
        const g = porDia.get(m.data) ?? new Map();
        const atual = g.get(grupoDe(m)) ?? { qtd: 0, total: 0 };
        g.set(grupoDe(m), { qtd: atual.qtd + 1, total: atual.total + Number(m.valor) });
        porDia.set(m.data, g);
      }
      const diasReceber = [...porDia.keys()].sort().reverse();
      const { data: manuais } = diasReceber.length
        ? await supabase.from('contas_receber').select('descricao, valor_total, data_vencimento, numero_documento, formas_pagamento:forma_recebimento_id(nome)')
          .in('data_vencimento', diasReceber).neq('status', 'cancelado')
        : { data: [] as any[] };
      setReceber(diasReceber.map(d => {
        const grupos = [...(porDia.get(d) ?? new Map()).entries()]
          .map(([grupo, v]) => ({ grupo, qtd: v.qtd, total: Math.round(v.total * 100) / 100 }))
          .sort((a, b) => a.grupo.localeCompare(b.grupo));
        return {
          data: d, grupos, total: grupos.reduce((s, g) => s + g.total, 0),
          manuais: (manuais || [])
            .filter((m: any) => m.data_vencimento === d && !String(m.numero_documento || '').startsWith('stone-'))
            .map((m: any) => ({ descricao: String(m.descricao || '').trim(), valor: Number(m.valor_total), forma: m.formas_pagamento?.nome ?? null })),
          inicioDoExtrato: d === pri.data?.data, lancando: false, erro: null,
        };
      }));

      // saídas: sugestões de todas numa chamada só
      const movs = (pd.data || []) as Movimento[];
      const { data: sugs } = movs.length
        ? await supabase.rpc('fn_banco_sugestoes', { p_ids: movs.map(m => m.id) })
        : { data: [] as any[] };
      const sugPorId = new Map<string, Sugestao>(((sugs || []) as any[]).map(s => [s.id, (s.sugestao as Sugestao) || SUG_VAZIA]));
      const lista = f.data || [];
      const pix = lista.find(x => /pix/i.test(x.nome))?.id || lista[0]?.id || '';
      const boleto = lista.find(x => /boleto/i.test(x.nome))?.id;
      const fornPorId = new Map(((forn.data || []) as Fornecedor[]).map(x => [x.id, x]));
      setSaidas(movs.map(m => {
        const sug: Sugestao = { ...(sugPorId.get(m.id) ?? SUG_VAZIA) };
        sug.ja_conciliado = sug.ja_conciliado.filter(j => mesmoNome(m.contraparte_nome, j.descricao || ''));
        const fornRegra = m.fornecedor_id ? fornPorId.get(m.fornecedor_id) : undefined;
        const base: LinhaAuto = {
          fitid: m.externo_id, data: m.data, valor: Number(m.valor),
          descricao: [m.contraparte_nome, m.descricao].filter(Boolean).join(' · '),
          acao: acaoInicial(sug), contaPagarId: sug.contas_abertas[0]?.id || '',
          fornecedorId: '', categoriaId: m.categoria_id || '',
          formaPagamentoId: /boleto/i.test(m.operacao || '') && boleto ? boleto : pix,
          sug, status: 'pendente', jaImportada: false, salvando: false, erro: null,
          extratoId: m.id, nome: m.contraparte_nome, docTipo: m.contraparte_doc_tipo, doc: m.doc_digitos, classe: m.classe,
          reconhecido: !!fornRegra, selecionada: false,
        };
        // fornecedor só vem preenchido quando é certo (regra ou CNPJ cadastrado)
        return fornRegra ? aplicarFornecedor(base, fornRegra, m.categoria_id || undefined) : base;
      }));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const fornPorId = useMemo(() => new Map(fornecedores.map(f => [f.id, f])), [fornecedores]);
  const opcoesForn = useMemo(() => fornecedores.map(f => ({ id: f.id, nome: f.nome, sub: (f as any).cnpj || undefined })), [fornecedores]);
  const opcoesCat = useMemo(() => categorias.map(c => ({ id: c.id, nome: c.nome })), [categorias]);

  // ── grupos por destinatário, com filtros ─────────────────────────────────
  const pendentes = saidas.filter(l => l.status === 'pendente');
  const grupos: Grupo[] = useMemo(() => {
    const t = normal(busca.trim());
    const mapa = new Map<string, Grupo>();
    for (const l of saidas) {
      if (l.status !== 'pendente') continue;
      if (tipo !== 'todas' && l.classe !== tipo) continue;
      if (soSemFornecedor && l.fornecedorId) continue;
      if (t && !normal(`${l.nome ?? ''} ${l.descricao}`).includes(t) && !fmt(l.valor).includes(busca.trim())) continue;
      const chave = l.doc || `sem-doc:${l.nome || l.descricao}`;
      const g = mapa.get(chave) ?? { chave, nome: l.nome || l.descricao || 'Sem nome', doc: l.doc, docTipo: l.docTipo, classe: l.classe, linhas: [], total: 0 };
      g.linhas.push(l); g.total += l.valor;
      mapa.set(chave, g);
    }
    return [...mapa.values()].sort((a, b) => b.total - a.total);
  }, [saidas, tipo, soSemFornecedor, busca]);

  const selecionadas = pendentes.filter(l => l.selecionada);
  const totalPend = pendentes.reduce((s, l) => s + l.valor, 0);
  const prontas = pendentes.filter(pronta);
  const semForn = pendentes.filter(l => !l.fornecedorId && l.acao !== 'ja');

  const atualizar = (ids: string[], f: (l: LinhaAuto) => LinhaAuto) =>
    setSaidas(prev => prev.map(l => (ids.includes(l.extratoId) ? f(l) : l)));

  const escolherFornecedorGrupo = (g: Grupo, id: string) => {
    const f = fornPorId.get(id);
    atualizar(g.linhas.map(l => l.extratoId), l => aplicarFornecedor(l, f));
  };

  // ── ações ────────────────────────────────────────────────────────────────
  const buscarAgora = async () => {
    setBuscando(true); setAviso(null);
    try {
      const { data, error } = await supabase.functions.invoke('pluggy-sync', { body: {} });
      if (error) throw error;
      const conta = data?.contas?.[0];
      if (!data?.ok) throw new Error(conta?.error || data?.error || 'Falha ao buscar.');
      setAviso({ tipo: 'certo', texto: `${conta?.novas ?? 0} movimentações novas. A Stone atualiza o extrato uma vez por dia.` });
      await carregar();
    } catch (e: any) {
      setAviso({ tipo: 'perigo', texto: e.message || 'Falha ao buscar o extrato.' });
    } finally {
      setBuscando(false);
    }
  };

  const resolverExtrato = async (extratoId: string, patch: Record<string, unknown>) => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('banco_extrato')
      .update({ ...patch, resolvido_em: new Date().toISOString(), resolvido_por: u?.user?.id || null }).eq('id', extratoId);
    if (error) throw error;
  };

  /** "CNPJ/CPF X → fornecedor Y" (ou ignorar sempre). */
  const salvarRegra = async (doc: string, nome: string, acao: 'sugerir' | 'ignorar', fornecedorId: string | null, categoriaId: string | null) => {
    const { data: u } = await supabase.auth.getUser();
    const regra = {
      nome: `${nome} → ${acao === 'ignorar' ? 'ignorar' : fornPorId.get(fornecedorId || '')?.nome || 'fornecedor'}`,
      sentido: 'debito', campo: 'documento', padrao: doc, classe: doc.length === 14 ? 'fornecedor' : 'pessoa',
      acao, fornecedor_id: fornecedorId, categoria_id: categoriaId, criado_por: u?.user?.id || null,
    };
    const { data: existe } = await supabase.from('banco_regras').select('id')
      .eq('campo', 'documento').eq('padrao', doc).eq('sentido', 'debito').eq('ativo', true).maybeSingle();
    const { error } = existe
      ? await supabase.from('banco_regras').update(regra).eq('id', existe.id)
      : await supabase.from('banco_regras').insert(regra);
    if (error) throw error;
  };

  /** Aprova as linhas em sequência, com progresso; regras e reclassificação uma vez no fim. */
  const aprovar = async (linhas: LinhaAuto[]) => {
    if (!integ) return;
    const validas: LinhaAuto[] = [];
    for (const l of linhas) {
      const msg = validar(l, integ.banco_conta_id);
      if (msg) atualizar([l.extratoId], x => ({ ...x, erro: msg }));
      else validas.push(l);
    }
    if (!validas.length) return;
    setAprovando({ feitas: 0, total: validas.length }); setAviso(null);
    const regras = new Map<string, { nome: string; fornecedorId: string; categoriaId: string | null }>();
    let ok = 0;
    for (const l of validas) {
      atualizar([l.extratoId], x => ({ ...x, salvando: true, erro: null }));
      try {
        const contaPagarId = await lancar(l, integ.banco_conta_id, null);
        const fornecedorId = l.acao === 'nova' ? l.fornecedorId
          : l.acao === 'baixa' ? (l.sug.contas_abertas.find(c => c.id === l.contaPagarId)?.fornecedor_id || l.fornecedorId || null) : (l.fornecedorId || null);
        await resolverExtrato(l.extratoId, { status: 'conciliada', conta_pagar_id: contaPagarId, fornecedor_id: fornecedorId || null, categoria_id: l.categoriaId || null });
        if (l.doc && fornecedorId) regras.set(l.doc, { nome: l.nome || documento(l.docTipo, l.doc), fornecedorId, categoriaId: l.categoriaId || null });
        atualizar([l.extratoId], x => ({ ...x, status: 'conciliada', salvando: false, selecionada: false }));
        ok++;
      } catch (e: any) {
        atualizar([l.extratoId], x => ({ ...x, salvando: false, erro: e.message || 'Erro ao lançar.' }));
      }
      setAprovando(p => (p ? { ...p, feitas: p.feitas + 1 } : p));
    }
    try {
      for (const [doc, r] of regras) await salvarRegra(doc, r.nome, 'sugerir', r.fornecedorId, r.categoriaId);
      if (regras.size) await supabase.rpc('fn_banco_reclassificar');
    } catch { /* a regra é conveniência: o lançamento já foi feito */ }
    setAprovando(null);
    setAviso(ok === validas.length
      ? { tipo: 'certo', texto: `${ok} ${ok === 1 ? 'saída conciliada' : 'saídas conciliadas'}.` }
      : { tipo: 'perigo', texto: `${ok} de ${validas.length} conciliadas. As que falharam mostram o motivo na linha.` });
  };

  const ignorar = async (linhas: LinhaAuto[], sempre: Grupo | null = null) => {
    if (!integ) return;
    for (const l of linhas) {
      atualizar([l.extratoId], x => ({ ...x, salvando: true, erro: null }));
      try {
        await registrarIgnorada(l, integ.banco_conta_id, null);
        await resolverExtrato(l.extratoId, { status: 'ignorada' });
        atualizar([l.extratoId], x => ({ ...x, status: 'ignorada', salvando: false, selecionada: false }));
      } catch (e: any) {
        atualizar([l.extratoId], x => ({ ...x, salvando: false, erro: e.message }));
      }
    }
    if (sempre?.doc) {
      try {
        await salvarRegra(sempre.doc, sempre.nome, 'ignorar', null, null);
        await supabase.rpc('fn_banco_reclassificar');
      } catch (e: any) { setAviso({ tipo: 'perigo', texto: `Ignorei, mas não consegui guardar a regra: ${e.message}` }); }
    }
  };

  const lancarDia = async (data: string) => {
    if (!integ) return;
    setReceber(prev => prev.map(d => (d.data === data ? { ...d, lancando: true, erro: null } : d)));
    const { data: res, error } = await supabase.rpc('fn_banco_lancar_recebimentos', { p_integracao_id: integ.id, p_data: data });
    if (error) { setReceber(prev => prev.map(d => (d.data === data ? { ...d, lancando: false, erro: error.message } : d))); return; }
    const total = (res?.lancados || []).reduce((s: number, l: any) => s + Number(l.total), 0);
    setAviso({ tipo: 'certo', texto: `${dayjs(data).format('DD/MM')}: ${(res?.lancados || []).length} lançamento(s) em Contas a Receber, ${fmt(total)}.` });
    setReceber(prev => prev.filter(d => d.data !== data));
  };

  const conferirEntrada = async (m: Movimento, sempre = false) => {
    try {
      await resolverExtrato(m.id, { status: 'conciliada' });
      if (sempre && m.doc_digitos) {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase.from('banco_regras').insert({
          nome: `${m.contraparte_nome || documento(m.contraparte_doc_tipo, m.doc_digitos)} → entrada automática`,
          sentido: 'credito', campo: 'documento', padrao: m.doc_digitos, classe: 'receita_outros', acao: 'automatico', criado_por: u?.user?.id || null,
        });
        if (error && !/duplicate/i.test(error.message)) throw error;
        await supabase.rpc('fn_banco_reclassificar');
        setEntradas(prev => prev.filter(e => e.doc_digitos !== m.doc_digitos));
      } else {
        setEntradas(prev => prev.filter(e => e.id !== m.id));
      }
    } catch (e: any) {
      setAviso({ tipo: 'perigo', texto: e.message || 'Erro ao conferir a entrada.' });
    }
  };

  // ── render ───────────────────────────────────────────────────────────────
  if (carregando && !integ) return <TableSkeleton />;
  if (semIntegracao || !integ) {
    return <EmptyState icon={Inbox} title="Nenhuma conta conectada" description="A Conta Stone entra pela Pluggy (Meu Pluggy). Peça para configurar a conexão." />;
  }

  const consentDias = integ.consentimento_expira_em ? dayjs(integ.consentimento_expira_em).diff(dayjs(), 'day') : null;
  const dias = Array.from({ length: DIAS_RESUMO }, (_, i) => dayjs().subtract(i, 'day').format('YYYY-MM-DD'));
  const soma = (dia: string, classe: string) => resumo
    .filter(m => m.data === dia && m.classe === classe && m.status !== 'ignorada').reduce((s, m) => s + Number(m.valor), 0);
  const selTotal = selecionadas.reduce((s, l) => s + l.valor, 0);

  return (
    <div className="flex flex-col gap-4 pb-24">
      {/* ── conexão ── */}
      <Toolbar>
        <span className="t-body" style={{ color: 'var(--text-primary)' }}>
          <strong>{integ.nome}</strong> · saldo <strong style={{ color: 'var(--gold)' }}>{integ.saldo != null ? fmt(Number(integ.saldo)) : '—'}</strong>
        </span>
        <span className="t-caption">
          Lido {integ.ultimo_sync_em ? dayjs(integ.ultimo_sync_em).format('DD/MM HH:mm') : '—'}
          {integ.ultimo_resumo?.item_atualizado_em && <> · dados da Stone de {dayjs(integ.ultimo_resumo.item_atualizado_em).format('DD/MM HH:mm')}</>}
          {' '}· busca sozinho às 7h40 e 13h40
        </span>
        <Toolbar.Espaco />
        <Button tamanho="sm" icone={<RefreshCw size={14} />} carregando={buscando} onClick={buscarAgora}>Buscar agora</Button>
      </Toolbar>

      {integ.ultimo_sync_ok === false && <p className="aviso aviso-perigo" role="alert">A última leitura falhou: {integ.ultimo_erro}</p>}
      {consentDias != null && consentDias <= 30 && (
        <p className="aviso aviso-atencao">
          A autorização do Meu Pluggy {consentDias < 0 ? 'venceu' : `vence em ${consentDias} dia(s)`} ({dayjs(integ.consentimento_expira_em).format('DD/MM/YYYY')}).
          Renove em dashboard.pluggy.ai → Applications → sua aplicação → Demo → Connect Account → MeuPluggy.
        </p>
      )}
      {aviso && <p className={`aviso aviso-${aviso.tipo}`} role="status">{aviso.texto}</p>}

      {/* ── números ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard rotulo="Saídas para conciliar" valor={fmt(totalPend)} detalhe={`${pendentes.length} ${pendentes.length === 1 ? 'pagamento' : 'pagamentos'}`}
          tom={pendentes.length ? 'atencao' : 'certo'} onClick={() => { setTipo('todas'); setSoSemFornecedor(false); }} />
        <KPICard rotulo="Prontas para aprovar" valor={String(prontas.length)} detalhe="com fornecedor ou conta definida" tom={prontas.length ? 'certo' : 'normal'}
          onClick={() => setSaidas(prev => prev.map(l => ({ ...l, selecionada: pronta(l) })))} />
        <KPICard rotulo="Sem fornecedor" valor={String(semForn.length)} detalhe="escolha ou cadastre" tom={semForn.length ? 'alerta' : 'normal'}
          onClick={() => setSoSemFornecedor(true)} />
        <KPICard rotulo="Recebimentos para lançar" valor={String(receber.length)} detalhe={receber.length === 1 ? 'dia' : 'dias'} tom={receber.length ? 'destaque' : 'normal'}
          onClick={() => document.getElementById('recebimentos')?.scrollIntoView({ behavior: 'smooth' })} />
      </div>

      {/* ── saídas ── */}
      <SectionCard title="Saídas para conciliar" descricao="Agrupadas por quem recebeu. Escolha o fornecedor uma vez para o grupo e aprove.">
        <Toolbar className="mb-3">
          <Segmented rotulo="Tipo" valor={tipo} onMudar={setTipo}
            opcoes={[{ valor: 'todas', rotulo: 'Todas' }, { valor: 'fornecedor', rotulo: 'Empresas' }, { valor: 'pessoa', rotulo: 'Pessoas' }, { valor: 'outros', rotulo: 'Outras' }]} />
          <Chip ligado={soSemFornecedor} onMudar={setSoSemFornecedor} tom="perigo">Sem fornecedor</Chip>
          <Toolbar.Espaco />
          <div className="relative w-full sm:w-64">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
            <Input aria-label="Buscar por nome ou valor" type="search" placeholder="Buscar nome ou valor" value={busca} onChange={e => setBusca(e.target.value)} style={{ paddingLeft: 32 }} />
          </div>
        </Toolbar>

        {carregando ? <TableSkeleton /> : grupos.length === 0 ? (
          pendentes.length
            ? <EmptyState icon={Search} title="Nada com esse filtro" variant="filtered" compact action={{ label: 'Limpar filtros', onClick: () => { setTipo('todas'); setSoSemFornecedor(false); setBusca(''); } }} />
            : <EmptyState icon={CheckCircle2} title="Tudo conciliado" description="Nenhuma saída pendente na Conta Stone." compact />
        ) : (
          <div className="flex flex-col gap-2">
            {grupos.map(g => {
              const aberto = abertos.has(g.chave) || g.linhas.length === 1;
              const fornGrupo = g.linhas.every(l => l.fornecedorId === g.linhas[0].fornecedorId) ? g.linhas[0].fornecedorId : '';
              const catGrupo = g.linhas.every(l => l.categoriaId === g.linhas[0].categoriaId) ? g.linhas[0].categoriaId : '';
              const prontasG = g.linhas.filter(pronta);
              const sugId = g.linhas[0].sug.fornecedores[0]?.id;
              const todasSel = g.linhas.every(l => l.selecionada);
              return (
                <div key={g.chave} className="rounded-lg" style={{ border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))', background: 'var(--bg-card, #12161f)' }}>
                  {/* cabeçalho do grupo */}
                  <div className="flex flex-wrap items-center gap-3 p-3">
                    <input type="checkbox" aria-label={`Selecionar ${g.nome}`} checked={todasSel}
                      onChange={e => atualizar(g.linhas.map(l => l.extratoId), l => ({ ...l, selecionada: e.target.checked }))} />
                    <button type="button" className="flex items-center gap-2 text-left min-w-0 flex-1" onClick={() => setAbertos(prev => {
                      const n = new Set(prev); if (n.has(g.chave)) n.delete(g.chave); else n.add(g.chave); return n;
                    })}>
                      {g.linhas.length > 1 && (aberto ? <ChevronDown size={16} /> : <ChevronRight size={16} />)}
                      <span className="min-w-0">
                        <span className="block t-body truncate" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{g.nome}</span>
                        <span className="block t-caption">
                          {documento(g.docTipo, g.doc)}{g.doc ? ' · ' : ''}{g.linhas.length} {g.linhas.length === 1 ? 'pagamento' : 'pagamentos'}
                          {g.linhas[0].reconhecido && <> · <span style={{ color: 'var(--ok-text)' }}>reconhecido</span></>}
                        </span>
                      </span>
                    </button>
                    <span className="t-body tabular-nums" style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{fmt(g.total)}</span>
                  </div>
                  {/* fornecedor e categoria do grupo */}
                  <div className="grid grid-cols-1 md:grid-cols-[2fr_1.4fr_auto] gap-2 px-3 pb-3 items-end">
                    <Combobox rotulo="Fornecedor" valor={fornGrupo} opcoes={opcoesForn} sugestaoId={sugId}
                      onEscolher={id => escolherFornecedorGrupo(g, id)} rotuloCriar="fornecedor"
                      onCriar={texto => setNovoForn({ chave: g.chave, nome: texto || g.nome, doc: g.doc })} />
                    <Combobox rotulo="Categoria" valor={catGrupo} opcoes={opcoesCat}
                      onEscolher={id => atualizar(g.linhas.map(l => l.extratoId), l => ({ ...l, categoriaId: id }))} />
                    <div className="flex items-center gap-2">
                      <Button tamanho="md" icone={<CheckCircle2 size={14} />} disabled={!prontasG.length || !!aprovando} onClick={() => aprovar(prontasG)}>
                        Aprovar {prontasG.length > 1 ? prontasG.length : ''}
                      </Button>
                      <IconButton aria-label={`Ignorar pagamentos para ${g.nome}`} tom="perigo" title="Ignorar"
                        onClick={() => (g.doc ? setIgnorarSempre(g) : ignorar(g.linhas))}><Ban size={14} /></IconButton>
                    </div>
                  </div>
                  {!fornGrupo && !g.linhas.some(l => l.acao === 'ja') && (
                    <p className="t-caption px-3 pb-3">Não achou na lista? Digite o nome e escolha <strong>Criar fornecedor</strong>.</p>
                  )}
                  {/* linhas */}
                  {aberto && (
                    <ul className="flex flex-col" style={{ borderTop: '1px solid var(--border-subtle, rgba(255,255,255,0.06))' }}>
                      {g.linhas.map(l => (
                        <li key={l.extratoId} className="flex flex-wrap items-center gap-3 px-3 py-2" style={{ opacity: l.salvando ? 0.6 : 1 }}>
                          <input type="checkbox" aria-label={`Selecionar ${fmt(l.valor)} de ${dayjs(l.data).format('DD/MM')}`} checked={l.selecionada}
                            onChange={e => atualizar([l.extratoId], x => ({ ...x, selecionada: e.target.checked }))} />
                          <span className="t-caption w-12">{dayjs(l.data).format('DD/MM')}</span>
                          <span className="t-body tabular-nums w-28" style={{ color: 'var(--text-primary)' }}>{fmt(l.valor)}</span>
                          <Select aria-label="O que fazer" value={l.acao} className="w-48"
                            onChange={e => atualizar([l.extratoId], x => ({ ...x, acao: e.target.value as Acao, erro: null }))}>
                            <option value="nova">{ACOES.nova}</option>
                            <option value="baixa" disabled={!l.sug.contas_abertas.length}>{ACOES.baixa}</option>
                            <option value="ja">{ACOES.ja}</option>
                          </Select>
                          {l.acao === 'baixa' && (
                            <Select aria-label="Conta aberta" value={l.contaPagarId} className="flex-1 min-w-[200px]"
                              onChange={e => atualizar([l.extratoId], x => ({ ...x, contaPagarId: e.target.value }))}>
                              <option value="">Escolha a conta…</option>
                              {l.sug.contas_abertas.map(c => <option key={c.id} value={c.id}>{c.fornecedor_nome} · {c.descricao} · vence {dayjs(c.data_vencimento).format('DD/MM')}</option>)}
                            </Select>
                          )}
                          {l.acao === 'ja' && l.sug.ja_conciliado[0] && (
                            <span className="t-caption flex-1" style={{ color: 'var(--ok-text)' }}>
                              Igual ao lançado em {dayjs(l.sug.ja_conciliado[0].data).format('DD/MM')} · {l.sug.ja_conciliado[0].descricao}
                            </span>
                          )}
                          <span className="flex-1" />
                          <Select aria-label="Forma de pagamento" value={l.formaPagamentoId} className="w-36"
                            onChange={e => atualizar([l.extratoId], x => ({ ...x, formaPagamentoId: e.target.value }))}>
                            {formas.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
                          </Select>
                          {pronta(l) ? <Badge variant="success">pronta</Badge> : <Badge variant="warning">falta fornecedor</Badge>}
                          <IconButton aria-label="Ignorar este pagamento" tom="perigo" onClick={() => ignorar([l])}><Ban size={14} /></IconButton>
                          {l.erro && <p className="aviso aviso-perigo w-full" role="alert">{l.erro}</p>}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* ── recebimentos do dia ── */}
      <div id="recebimentos" />
      {receber.length > 0 && (
        <SectionCard title="Recebimentos para lançar em Contas a Receber" descricao="Cartão e Pix da maquininha, um lançamento por dia e por tipo.">
          <div className="flex flex-col gap-2">
            {receber.map(d => (
              <div key={d.data} className="flex flex-col gap-2 p-3 rounded-lg" style={{ border: '1px solid var(--border-subtle, rgba(255,255,255,0.08))' }}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="t-body" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{dayjs(d.data).format('ddd DD/MM')}</span>
                  <span className="t-body tabular-nums" style={{ color: 'var(--ok-text)', fontWeight: 700 }}>{fmt(d.total)}</span>
                  <span className="flex-1" />
                  <Button tamanho="sm" icone={<CheckCircle2 size={14} />} carregando={d.lancando} onClick={() => lancarDia(d.data)}>Lançar</Button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  {d.grupos.map(g => (
                    <div key={g.grupo} className="rounded-md px-3 py-2" style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <p className="t-caption m-0">{GRUPOS_RECEBER[g.grupo] ?? g.grupo} · {g.qtd} mov.</p>
                      <p className="t-body tabular-nums m-0" style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{fmt(g.total)}</p>
                    </div>
                  ))}
                </div>
                {d.inicioDoExtrato && <p className="t-caption texto-atencao m-0">Primeiro dia lido da Stone: pode estar incompleto.</p>}
                {d.manuais.length > 0 && (
                  <p className="t-caption m-0">Já lançado à mão neste dia: {d.manuais.map(m => `${m.descricao} ${fmt(m.valor)}${m.forma ? ` (${m.forma})` : ''}`).join(' · ')}</p>
                )}
                {d.erro && <p className="aviso aviso-perigo" role="alert">{d.erro}</p>}
              </div>
            ))}
          </div>
        </SectionCard>
      )}

      {/* ── entradas fora da maquininha ── */}
      {entradas.length > 0 && (
        <SectionCard title={`Entradas fora da maquininha (${entradas.length})`} descricao="Pix e transferências recebidas direto na conta.">
          <ul className="flex flex-col gap-2">
            {entradas.map(m => (
              <li key={m.id} className="flex flex-wrap items-center gap-3">
                <span className="t-caption w-12">{dayjs(m.data).format('DD/MM')}</span>
                <span className="t-body tabular-nums w-28" style={{ color: 'var(--ok-text)', fontWeight: 600 }}>{fmt(Number(m.valor))}</span>
                <span className="t-body flex-1 min-w-0 truncate">{m.contraparte_nome || m.descricao}
                  {m.doc_digitos && <span className="t-caption"> · {documento(m.contraparte_doc_tipo, m.doc_digitos)}</span>}</span>
                <Button tamanho="sm" onClick={() => conferirEntrada(m)}>Conferido</Button>
                {m.doc_digitos && <Button tamanho="sm" variante="discreto" title="As próximas entradas deste pagador não precisam de conferência" onClick={() => conferirEntrada(m, true)}>Sempre automático</Button>}
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {/* ── resumo de 7 dias ── */}
      <SectionCard title={`Últimos ${DIAS_RESUMO} dias`} action={<Button tamanho="sm" variante="discreto" onClick={() => setVerResumo(v => !v)}>{verResumo ? 'Esconder' : 'Mostrar'}</Button>}>
        {!verResumo && <p className="t-caption m-0">Entradas e saídas da conta por dia, separadas por tipo.</p>}
        {verResumo && (
          <div className="overflow-x-auto">
            <table className="w-full t-caption min-w-[640px]">
              <thead>
                <tr>
                  <th className="text-left font-medium pb-2">Dia</th>
                  {COLUNAS_RESUMO.map(c => (
                    <th key={c.chave} className="text-right font-medium pb-2">
                      <span className="inline-flex items-center gap-1">{c.entrada ? <ArrowDownLeft size={11} /> : <ArrowUpRight size={11} />}{c.rotulo}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {dias.map(d => (
                  <tr key={d} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <td className="py-1.5">{dayjs(d).format('ddd DD/MM')}</td>
                    {COLUNAS_RESUMO.map(c => {
                      const v = soma(d, c.chave);
                      return <td key={c.chave} className="py-1.5 text-right tabular-nums" style={{ color: v ? (c.entrada ? 'var(--ok-text)' : 'var(--text-primary)') : 'var(--text-secondary)' }}>{v ? fmt(v) : '—'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="t-caption mt-2">Cartão vem líquido (já sem a taxa). A Reserva Stone (guarda e resgate automáticos) é movimento interno e não entra aqui.</p>
          </div>
        )}
      </SectionCard>

      {/* ── barra de lote ── */}
      {(selecionadas.length > 0 || aprovando) && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', maxWidth: 'calc(100vw - 32px)' }}>
          {aprovando
            ? <span className="t-body">Aprovando {aprovando.feitas} de {aprovando.total}…</span>
            : (
              <>
                <span className="t-body" style={{ color: 'var(--text-primary)' }}>{selecionadas.length} selecionada{selecionadas.length > 1 ? 's' : ''} · <strong>{fmt(selTotal)}</strong></span>
                <Button tamanho="sm" variante="discreto" onClick={() => setSaidas(prev => prev.map(l => ({ ...l, selecionada: false })))}>Limpar</Button>
                <Button variante="primario" icone={<CheckCircle2 size={16} />} onClick={() => aprovar(selecionadas)}>Aprovar selecionadas</Button>
              </>
            )}
        </div>
      )}

      {/* ── janelas ── */}
      <NovoFornecedor aberto={!!novoForn} nomeInicial={novoForn?.nome ?? ''} documento={novoForn?.doc ?? null} categorias={categorias}
        onFechar={() => setNovoForn(null)}
        onCriado={f => {
          setFornecedores(prev => (prev.some(x => x.id === f.id) ? prev : [...prev, f].sort((a, b) => a.nome.localeCompare(b.nome))));
          const g = grupos.find(x => x.chave === novoForn?.chave);
          if (g) atualizar(g.linhas.map(l => l.extratoId), l => aplicarFornecedor(l, f));
          setNovoForn(null);
        }} />

      <Modal aberto={!!ignorarSempre} onFechar={() => setIgnorarSempre(null)} titulo="Ignorar pagamentos" largura="sm"
        descricao={ignorarSempre ? `${ignorarSempre.nome} · ${documento(ignorarSempre.docTipo, ignorarSempre.doc)}` : undefined}
        rodape={(
          <>
            <Button variante="discreto" onClick={() => setIgnorarSempre(null)}>Cancelar</Button>
            <Button onClick={() => { const g = ignorarSempre!; setIgnorarSempre(null); ignorar(g.linhas); }}>Só estes</Button>
            <Button variante="perigo" onClick={() => { const g = ignorarSempre!; setIgnorarSempre(null); ignorar(g.linhas, g); }}>Ignorar sempre</Button>
          </>
        )}>
        <p className="t-body">
          Ignorar quer dizer que estes pagamentos não viram lançamento no financeiro (ex.: transferência entre contas do próprio bar).
          Com <strong>Ignorar sempre</strong>, os próximos pagamentos para este destinatário também deixam de aparecer aqui.
        </p>
      </Modal>
    </div>
  );
}
