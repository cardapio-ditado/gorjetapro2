import { useState, useEffect, useCallback } from 'react';
import { RefreshCw, AlertTriangle, CheckCircle2, Landmark, ArrowDownLeft, ArrowUpRight, BookmarkPlus, Ban } from 'lucide-react';
import dayjs from 'dayjs';
import { supabase } from '../../../lib/supabase';
import LinhaConciliacao from './LinhaConciliacao';
import {
  fmt, sugerir, acaoInicial, validar, lancar, registrarIgnorada,
  type Forma, type Categoria, type Fornecedor, type Linha,
} from './lancar';

// Extrato automático da Conta Stone (Pluggy / Meu Pluggy, função pluggy-sync).
// - Entradas de cartão, Pix da maquininha e a Reserva Stone entram sozinhas
//   (regras em banco_regras); só aparecem no resumo.
// - Saídas para conciliar: o mesmo fluxo da importação por arquivo (criar conta,
//   baixar conta aberta, já lançada, ignorar). Ao aprovar, o CNPJ/CPF de quem
//   recebeu vira regra: da próxima vez o fornecedor já vem preenchido.
// - Entradas a conferir: Pix e transferências recebidas fora da maquininha.

interface Integracao {
  id: string; nome: string; banco_conta_id: string;
  saldo: number | null; saldo_em: string | null;
  ultimo_sync_em: string | null; ultimo_sync_ok: boolean | null; ultimo_erro: string | null;
  consentimento_expira_em: string | null; item_status: string | null;
  ultimo_resumo: { item_atualizado_em?: string | null } | null;
}

interface Movimento {
  id: string; externo_id: string; data: string; valor: number; sentido: 'credito' | 'debito';
  descricao: string | null; contraparte_nome: string | null; contraparte_doc_tipo: string | null;
  doc_digitos: string | null; classe: string; status: string; fornecedor_id: string | null; categoria_id: string | null;
}

type LinhaAuto = Linha & { extratoId: string; nome: string | null; docTipo: string | null; doc: string | null; lembrar: boolean };

const CAMPOS = 'id, externo_id, data, valor, sentido, descricao, contraparte_nome, contraparte_doc_tipo, doc_digitos, classe, status, fornecedor_id, categoria_id';
const DIAS_RESUMO = 7;

/** CPF aparece mascarado na tela; CNPJ inteiro. */
function documento(tipo: string | null, d: string | null) {
  if (!d) return '';
  if (d.length === 11) return `CPF •••.${d.slice(3, 6)}.${d.slice(6, 9)}-••`;
  if (d.length === 14) return `CNPJ ${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  return `${tipo ?? 'Doc'} ${d}`;
}

const COLUNAS: { chave: string; rotulo: string; entrada: boolean }[] = [
  { chave: 'receita_cartao', rotulo: 'Cartão', entrada: true },
  { chave: 'receita_pix', rotulo: 'Pix maquininha', entrada: true },
  { chave: 'receita_outros', rotulo: 'Outras entradas', entrada: true },
  { chave: 'fornecedor', rotulo: 'Fornecedores', entrada: false },
  { chave: 'pessoa', rotulo: 'Pessoas físicas', entrada: false },
  { chave: 'outros', rotulo: 'Outras saídas', entrada: false },
];

export default function ExtratoAutomatico() {
  const [integ, setInteg] = useState<Integracao | null>(null);
  const [semIntegracao, setSemIntegracao] = useState(false);
  const [formas, setFormas] = useState<Forma[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [resumo, setResumo] = useState<Movimento[]>([]);
  const [saidas, setSaidas] = useState<LinhaAuto[]>([]);
  const [entradas, setEntradas] = useState<Movimento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [buscando, setBuscando] = useState(false);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const [ig, f, c, forn] = await Promise.all([
        supabase.from('banco_integracoes').select('*').eq('ativo', true).order('criado_em').limit(1).maybeSingle(),
        supabase.from('formas_pagamento').select('id, nome').eq('status', 'ativo').order('nome'),
        supabase.from('categorias_financeiras').select('id, nome').eq('status', 'ativo').eq('tipo', 'despesa').order('nome'),
        supabase.from('fornecedores').select('id, nome, categoria_padrao_id').eq('status', 'ativo').order('nome'),
      ]);
      const integracao = ig.data as Integracao | null;
      setInteg(integracao);
      setSemIntegracao(!integracao);
      setFormas(f.data || []);
      setCategorias((c.data || []) as Categoria[]);
      setFornecedores(forn.data || []);
      if (!integracao) return;

      const desde = dayjs().subtract(DIAS_RESUMO - 1, 'day').format('YYYY-MM-DD');
      const [r, pd, pc] = await Promise.all([
        supabase.from('banco_extrato').select(CAMPOS).eq('integracao_id', integracao.id).gte('data', desde).limit(5000),
        supabase.from('banco_extrato').select(CAMPOS).eq('integracao_id', integracao.id).eq('status', 'pendente').eq('sentido', 'debito')
          .order('data', { ascending: false }).limit(200),
        supabase.from('banco_extrato').select(CAMPOS).eq('integracao_id', integracao.id).eq('status', 'pendente').eq('sentido', 'credito')
          .order('data', { ascending: false }).limit(200),
      ]);
      setResumo((r.data || []) as Movimento[]);
      setEntradas((pc.data || []) as Movimento[]);

      const lista = f.data || [];
      const pix = lista.find(x => /pix/i.test(x.nome))?.id || lista[0]?.id || '';
      const fornPorId = new Map((forn.data || []).map(x => [x.id, x]));
      const linhas: LinhaAuto[] = await Promise.all(((pd.data || []) as Movimento[]).map(async (m) => {
        const descricao = [m.contraparte_nome, m.descricao].filter(Boolean).join(' · ');
        const sug = await sugerir(m.contraparte_nome || m.descricao || '', Number(m.valor), m.data, null);
        // fornecedor que a regra (ou o CNPJ) já indicou vem primeiro; e a conta aberta dele
        const fornRegra = m.fornecedor_id ? fornPorId.get(m.fornecedor_id) : undefined;
        const contaDoForn = fornRegra ? sug.contas_abertas.find(c => c.fornecedor_id === fornRegra.id) : undefined;
        if (contaDoForn) sug.contas_abertas = [contaDoForn, ...sug.contas_abertas.filter(c => c.id !== contaDoForn.id)];
        const topForn = fornRegra ?? sug.fornecedores[0];
        return {
          fitid: m.externo_id,
          data: m.data,
          valor: Number(m.valor),
          descricao,
          acao: acaoInicial(sug),
          contaPagarId: sug.contas_abertas[0]?.id || '',
          fornecedorId: topForn?.id || '',
          categoriaId: m.categoria_id || topForn?.categoria_padrao_id || sug.contas_abertas[0]?.categoria_id || '',
          formaPagamentoId: pix,
          sug,
          status: 'pendente',
          jaImportada: false,
          salvando: false,
          erro: null,
          extratoId: m.id,
          nome: m.contraparte_nome,
          docTipo: m.contraparte_doc_tipo,
          doc: m.doc_digitos,
          lembrar: !!m.doc_digitos,
        };
      }));
      setSaidas(linhas);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const buscarAgora = async () => {
    setBuscando(true); setAviso(null);
    try {
      const { data, error } = await supabase.functions.invoke('pluggy-sync', { body: {} });
      if (error) throw error;
      const conta = data?.contas?.[0];
      if (!data?.ok) throw new Error(conta?.error || data?.error || 'Falha ao buscar.');
      setAviso({ tipo: 'ok', texto: `${conta?.novas ?? 0} movimentações novas. O Meu Pluggy atualiza a conta uma vez por dia.` });
      await carregar();
    } catch (e: any) {
      setAviso({ tipo: 'erro', texto: e.message || 'Falha ao buscar o extrato.' });
    } finally {
      setBuscando(false);
    }
  };

  const atualizarSaida = (idx: number, patch: Partial<LinhaAuto>) =>
    setSaidas(prev => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));

  /** "CNPJ/CPF X → fornecedor Y" (ou ignorar sempre). */
  const salvarRegra = async (l: LinhaAuto, acao: 'sugerir' | 'ignorar', fornecedorId: string | null, categoriaId: string | null) => {
    if (!l.doc) return;
    const { data: u } = await supabase.auth.getUser();
    const regra = {
      nome: `${l.nome || documento(l.docTipo, l.doc)} → ${acao === 'ignorar' ? 'ignorar' : fornecedores.find(f => f.id === fornecedorId)?.nome || 'fornecedor'}`,
      sentido: 'debito', campo: 'documento', padrao: l.doc,
      classe: l.doc.length === 14 ? 'fornecedor' : 'pessoa',
      acao, fornecedor_id: fornecedorId, categoria_id: categoriaId, criado_por: u?.user?.id || null,
    };
    const { data: existe } = await supabase.from('banco_regras').select('id')
      .eq('campo', 'documento').eq('padrao', l.doc).eq('sentido', 'debito').eq('ativo', true).maybeSingle();
    const { error } = existe
      ? await supabase.from('banco_regras').update(regra).eq('id', existe.id)
      : await supabase.from('banco_regras').insert(regra);
    if (error) throw error;
    await supabase.rpc('fn_banco_reclassificar');
  };

  const resolverExtrato = async (extratoId: string, patch: Record<string, unknown>) => {
    const { data: u } = await supabase.auth.getUser();
    const { error } = await supabase.from('banco_extrato')
      .update({ ...patch, resolvido_em: new Date().toISOString(), resolvido_por: u?.user?.id || null })
      .eq('id', extratoId);
    if (error) throw error;
  };

  const aprovar = async (idx: number) => {
    const l = saidas[idx];
    if (!integ || l.status !== 'pendente') return;
    const msg = validar(l, integ.banco_conta_id);
    if (msg) { atualizarSaida(idx, { erro: msg }); return; }
    atualizarSaida(idx, { salvando: true, erro: null });
    try {
      const contaPagarId = await lancar(l, integ.banco_conta_id, null);
      const fornecedorId = l.acao === 'nova' ? l.fornecedorId
        : l.acao === 'baixa' ? (l.sug.contas_abertas.find(c => c.id === l.contaPagarId)?.fornecedor_id || null) : null;
      await resolverExtrato(l.extratoId, {
        status: 'conciliada', conta_pagar_id: contaPagarId, fornecedor_id: fornecedorId, categoria_id: l.categoriaId || null,
      });
      if (l.lembrar && l.doc && fornecedorId) {
        await salvarRegra(l, 'sugerir', fornecedorId, l.categoriaId || null);
        // as outras saídas para o mesmo CNPJ/CPF já ficam com o fornecedor
        setSaidas(prev => prev.map(o => (o.doc === l.doc && o.status === 'pendente' && !o.fornecedorId
          ? { ...o, fornecedorId, categoriaId: o.categoriaId || l.categoriaId } : o)));
      }
      atualizarSaida(idx, { status: 'conciliada', salvando: false });
    } catch (e: any) {
      atualizarSaida(idx, { salvando: false, erro: e.message || 'Erro ao lançar.' });
    }
  };

  const ignorar = async (idx: number, sempre = false) => {
    const l = saidas[idx];
    if (!integ || l.status !== 'pendente') return;
    if (sempre && !window.confirm(`Ignorar sempre os pagamentos para ${l.nome || documento(l.docTipo, l.doc)}? Eles deixam de aparecer aqui.`)) return;
    atualizarSaida(idx, { salvando: true, erro: null });
    try {
      await registrarIgnorada(l, integ.banco_conta_id, null);
      await resolverExtrato(l.extratoId, { status: 'ignorada' });
      if (sempre && l.doc) {
        await salvarRegra(l, 'ignorar', null, null);
        setSaidas(prev => prev.map(o => (o.doc === l.doc && o.status === 'pendente' ? { ...o, status: 'ignorada' } : o)));
      }
      atualizarSaida(idx, { status: 'ignorada', salvando: false });
    } catch (e: any) {
      atualizarSaida(idx, { salvando: false, erro: e.message });
    }
  };

  const conferirEntrada = async (m: Movimento, sempre = false) => {
    try {
      await resolverExtrato(m.id, { status: 'conciliada' });
      if (sempre && m.doc_digitos) {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase.from('banco_regras').insert({
          nome: `${m.contraparte_nome || documento(m.contraparte_doc_tipo, m.doc_digitos)} → entrada automática`,
          sentido: 'credito', campo: 'documento', padrao: m.doc_digitos,
          classe: 'receita_outros', acao: 'automatico', criado_por: u?.user?.id || null,
        });
        if (error && !/duplicate/i.test(error.message)) throw error;
        await supabase.rpc('fn_banco_reclassificar');
        setEntradas(prev => prev.filter(e => e.doc_digitos !== m.doc_digitos));
      } else {
        setEntradas(prev => prev.filter(e => e.id !== m.id));
      }
    } catch (e: any) {
      setAviso({ tipo: 'erro', texto: e.message || 'Erro ao conferir a entrada.' });
    }
  };

  if (carregando && !integ) {
    return <div className="flex items-center gap-2 text-sm text-white/50 p-6"><RefreshCw size={14} className="animate-spin" /> Carregando o extrato...</div>;
  }
  if (semIntegracao) {
    return (
      <div className="bg-[#12141f] rounded-2xl border border-white/10 p-6 text-sm text-white/60">
        Nenhuma conta conectada. A conexão é feita pela Pluggy (Meu Pluggy) e cadastrada em banco_integracoes.
      </div>
    );
  }
  if (!integ) return null;

  // ─── resumo por dia ────────────────────────────────────────────────────────
  const dias = Array.from({ length: DIAS_RESUMO }, (_, i) => dayjs().subtract(i, 'day').format('YYYY-MM-DD'));
  const soma = (dia: string, classe: string) => resumo
    .filter(m => m.data === dia && m.classe === classe && m.status !== 'ignorada')
    .reduce((s, m) => s + Number(m.valor), 0);
  const consentDias = integ.consentimento_expira_em ? dayjs(integ.consentimento_expira_em).diff(dayjs(), 'day') : null;
  const pendentesSaida = saidas.filter(s => s.status === 'pendente').length;

  return (
    <div className="space-y-4">
      {/* ── Conexão ── */}
      <div className="bg-[#12141f] rounded-2xl border border-white/10 p-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-wine/20 flex items-center justify-center"><Landmark size={16} className="text-wine" /></div>
          <div>
            <p className="text-sm font-semibold text-white">{integ.nome} · saldo {integ.saldo != null ? fmt(Number(integ.saldo)) : '—'}</p>
            <p className="text-xs text-white/50">
              Última leitura {integ.ultimo_sync_em ? dayjs(integ.ultimo_sync_em).format('DD/MM HH:mm') : '—'}
              {integ.ultimo_resumo?.item_atualizado_em && <> · dados da Stone de {dayjs(integ.ultimo_resumo.item_atualizado_em).format('DD/MM HH:mm')}</>}
              {' '}· busca automática às 07h40 e 13h40
            </p>
          </div>
        </div>
        <button onClick={buscarAgora} disabled={buscando}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-wine hover:bg-[#6a1a25] text-white text-xs font-medium disabled:opacity-50">
          <RefreshCw size={13} className={buscando ? 'animate-spin' : ''} /> {buscando ? 'Buscando...' : 'Buscar agora'}
        </button>
      </div>

      {integ.ultimo_sync_ok === false && (
        <div className="rounded-xl p-3 text-sm border bg-red-500/10 border-red-500/30 text-red-400 flex items-start gap-2">
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" /> A última leitura falhou: {integ.ultimo_erro}
        </div>
      )}
      {consentDias != null && consentDias <= 30 && (
        <div className="rounded-xl p-3 text-sm border bg-yellow-500/10 border-yellow-500/30 text-yellow-300 flex items-start gap-2">
          <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
          A autorização do Meu Pluggy {consentDias < 0 ? 'venceu' : `vence em ${consentDias} dia(s)`} ({dayjs(integ.consentimento_expira_em).format('DD/MM/YYYY')}).
          Renove em dashboard.pluggy.ai → Applications → sua aplicação → Demo → Connect Account → MeuPluggy.
        </div>
      )}
      {aviso && (
        <div className={`rounded-xl p-3 text-sm border flex items-start gap-2 ${aviso.tipo === 'ok' ? 'bg-green-500/10 border-green-500/30 text-green-400' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
          {aviso.tipo === 'ok' ? <CheckCircle2 size={15} className="flex-shrink-0 mt-0.5" /> : <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />} {aviso.texto}
        </div>
      )}

      {/* ── Resumo ── */}
      <div className="bg-[#12141f] rounded-2xl border border-white/10 p-4 overflow-x-auto">
        <p className="text-xs font-semibold text-white/60 uppercase tracking-wide mb-3">Últimos {DIAS_RESUMO} dias</p>
        <table className="w-full text-xs min-w-[640px]">
          <thead>
            <tr className="text-white/40">
              <th className="text-left font-medium pb-2">Dia</th>
              {COLUNAS.map(c => (
                <th key={c.chave} className="text-right font-medium pb-2">
                  <span className="inline-flex items-center gap-1">
                    {c.entrada ? <ArrowDownLeft size={11} className="text-green-400" /> : <ArrowUpRight size={11} className="text-red-400" />}{c.rotulo}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {dias.map(d => (
              <tr key={d} className="border-t border-white/5">
                <td className="py-1.5 text-white/70">{dayjs(d).format('ddd DD/MM')}</td>
                {COLUNAS.map(c => {
                  const v = soma(d, c.chave);
                  return <td key={c.chave} className={`py-1.5 text-right tabular-nums ${v ? (c.entrada ? 'text-green-400' : 'text-white/80') : 'text-white/20'}`}>{v ? fmt(v) : '—'}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-caption text-white/40 mt-2">Cartão vem líquido (já sem a taxa). A Reserva Stone (guarda e resgate automáticos) é movimento interno e não entra aqui.</p>
      </div>

      {/* ── Entradas a conferir ── */}
      {entradas.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-white/60 uppercase tracking-wide">Entradas fora da maquininha ({entradas.length})</p>
          {entradas.map(m => (
            <div key={m.id} className="bg-[#12141f] rounded-xl border border-white/10 p-3 flex items-center justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-green-400">{fmt(Number(m.valor))}</span>
                  <span className="text-xs text-white/60">{dayjs(m.data).format('DD/MM/YY')}</span>
                </div>
                <p className="text-xs text-white/50 truncate max-w-[420px]">{m.contraparte_nome || m.descricao}</p>
                {m.doc_digitos && <p className="text-caption text-white/40">{documento(m.contraparte_doc_tipo, m.doc_digitos)}</p>}
              </div>
              <div className="flex items-center gap-1.5">
                <button onClick={() => conferirEntrada(m)} className="flex items-center gap-1 px-2.5 py-1 rounded-md bg-green-600 hover:bg-green-700 text-white text-xs font-medium">
                  <CheckCircle2 size={11} /> Conferido
                </button>
                {m.doc_digitos && (
                  <button onClick={() => conferirEntrada(m, true)} title="As próximas entradas deste pagador não precisam de conferência"
                    className="px-2.5 py-1 rounded-md border border-white/10 text-white/60 hover:text-white text-xs">Sempre automático</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Saídas para conciliar ── */}
      <div className="space-y-2">
        <p className="text-xs font-semibold text-white/60 uppercase tracking-wide">Saídas para conciliar ({pendentesSaida})</p>
        {!carregando && saidas.length === 0 && (
          <div className="bg-[#12141f] rounded-xl border border-white/10 p-4 text-sm text-white/50 flex items-center gap-2">
            <CheckCircle2 size={15} className="text-green-400" /> Nenhuma saída pendente.
          </div>
        )}
        {saidas.map((l, idx) => (
          <LinhaConciliacao key={l.extratoId} linha={l} fornecedores={fornecedores} categorias={categorias} formas={formas}
            onChange={patch => atualizarSaida(idx, patch)} onAprovar={() => aprovar(idx)} onIgnorar={() => ignorar(idx)}
            detalhe={(
              <>
                {l.doc && <p className="text-caption text-white/40">{documento(l.docTipo, l.doc)}</p>}
                {l.acao === 'ja' && l.sug.ja_conciliado[0] && (
                  <p className="text-caption text-green-400/80">
                    Parecido no fluxo: {dayjs(l.sug.ja_conciliado[0].data).format('DD/MM')} · {l.sug.ja_conciliado[0].descricao}
                  </p>
                )}
              </>
            )}
            rodape={l.doc ? (
              <div className="flex items-center justify-between gap-3 mt-2 flex-wrap">
                <label className="flex items-center gap-1.5 text-caption text-white/50 cursor-pointer">
                  <input type="checkbox" checked={l.lembrar} onChange={e => atualizarSaida(idx, { lembrar: e.target.checked })} className="accent-wine" />
                  <BookmarkPlus size={11} /> Lembrar o fornecedor deste {l.doc.length === 14 ? 'CNPJ' : 'CPF'}
                </label>
                <button onClick={() => ignorar(idx, true)} className="flex items-center gap-1 text-caption text-white/40 hover:text-red-400">
                  <Ban size={11} /> Ignorar sempre este destinatário
                </button>
              </div>
            ) : undefined}
          />
        ))}
      </div>
    </div>
  );
}
