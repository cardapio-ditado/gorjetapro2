import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownCircle,
  ArrowUpCircle,
  BarChart3,
  CheckCircle2,
  FileCheck2,
  Landmark,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Wallet,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import {
  Evento,
  FinCategoria,
  FinConta,
  FinExtrato,
  FinLancamento,
  FinLancamentoTipo,
  Fornecedor,
} from '../../types';
import { formatarData, formatarMoeda, hojeISO } from '../../utils/format';
import { parseOfx } from '../../utils/ofx';
import LancamentoModal from './LancamentoModal';
import BaixaModal from './BaixaModal';

type Aba = 'visao' | 'pagar' | 'receber' | 'conciliacao';

export default function Financeiro() {
  const [aba, setAba] = useState<Aba>('visao');
  const [contas, setContas] = useState<FinConta[]>([]);
  const [categorias, setCategorias] = useState<FinCategoria[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [lancamentos, setLancamentos] = useState<FinLancamento[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [filtro, setFiltro] = useState<'abertos' | 'todos'>('abertos');
  const [modal, setModal] = useState(false);
  const [edit, setEdit] = useState<FinLancamento | null>(null);
  const [tipoNovo, setTipoNovo] = useState<FinLancamentoTipo>('pagar');
  const [baixa, setBaixa] = useState<FinLancamento | null>(null);

  async function carregar() {
    const [co, ca, fo, ev, la] = await Promise.all([
      supabase.from('rr_fin_contas').select('*').eq('ativo', true).order('nome'),
      supabase.from('rr_fin_categorias').select('*').eq('ativo', true).order('nome'),
      supabase.from('rr_fornecedores').select('*').eq('ativo', true).order('nome'),
      supabase.from('rr_eventos').select('*').order('data_inicio', { ascending: false, nullsFirst: false }),
      supabase
        .from('rr_fin_lancamentos')
        .select('*, categoria:rr_fin_categorias(*), fornecedor:rr_fornecedores(*), conta:rr_fin_contas(*), evento:rr_eventos(*)')
        .order('data_vencimento'),
    ]);
    setContas((co.data as FinConta[]) ?? []);
    setCategorias((ca.data as FinCategoria[]) ?? []);
    setFornecedores((fo.data as Fornecedor[]) ?? []);
    setEventos((ev.data as Evento[]) ?? []);
    setLancamentos((la.data as unknown as FinLancamento[]) ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    carregar();
  }, []);

  const saldosContas = useMemo(
    () =>
      contas.map((c) => {
        const mov = lancamentos
          .filter((l) => l.status === 'pago' && l.conta_id === c.id)
          .reduce((acc, l) => acc + (l.tipo === 'receber' ? Number(l.valor) : -Number(l.valor)), 0);
        return { conta: c, saldo: Number(c.saldo_inicial) + mov };
      }),
    [contas, lancamentos],
  );

  const saldoTotal = useMemo(() => saldosContas.reduce((a, s) => a + s.saldo, 0), [saldosContas]);

  const totais = useMemo(() => {
    const soma = (tipo: FinLancamentoTipo) =>
      lancamentos.filter((l) => l.tipo === tipo && l.status === 'aberto').reduce((a, l) => a + Number(l.valor), 0);
    return { pagarAberto: soma('pagar'), receberAberto: soma('receber') };
  }, [lancamentos]);

  const fluxo = useMemo(() => {
    const agora = new Date();
    const meses: { chave: string; rotulo: string; entra: number; sai: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date(agora.getFullYear(), agora.getMonth() + i, 1);
      meses.push({
        chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        rotulo: d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' }),
        entra: 0,
        sai: 0,
      });
    }
    const chaveAtual = meses[0].chave;
    lancamentos
      .filter((l) => l.status === 'aberto')
      .forEach((l) => {
        const chave = l.data_vencimento.slice(0, 7);
        // vencidos de meses anteriores entram no mês corrente
        const alvo = chave < chaveAtual ? meses[0] : meses.find((m) => m.chave === chave);
        if (!alvo) return;
        if (l.tipo === 'receber') alvo.entra += Number(l.valor);
        else alvo.sai += Number(l.valor);
      });
    let acumulado = saldoTotal;
    return meses.map((m) => {
      acumulado += m.entra - m.sai;
      return { ...m, liquido: m.entra - m.sai, acumulado };
    });
  }, [lancamentos, saldoTotal]);

  function abrirNovo(tipo: FinLancamentoTipo) {
    setEdit(null);
    setTipoNovo(tipo);
    setModal(true);
  }

  async function excluir(l: FinLancamento) {
    if (!window.confirm('Excluir este lançamento?')) return;
    const { error } = await supabase.from('rr_fin_lancamentos').delete().eq('id', l.id);
    if (error) return alert(error.message);
    await carregar();
  }

  const hoje = hojeISO();

  function renderLista(tipo: FinLancamentoTipo) {
    const itens = lancamentos.filter((l) => l.tipo === tipo && (filtro === 'todos' || l.status === 'aberto'));
    return (
      <div>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            {(['abertos', 'todos'] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltro(f)}
                className={`rounded-lg px-3.5 py-2 text-sm font-medium transition ${
                  filtro === f
                    ? 'bg-gold-500/15 text-gold-300 border border-gold-500/40'
                    : 'text-zinc-400 border border-night-700 hover:text-white'
                }`}
              >
                {f === 'abertos' ? 'Em aberto' : 'Todos'}
              </button>
            ))}
          </div>
          <button onClick={() => abrirNovo(tipo)} className="btn-gold">
            <Plus className="h-4 w-4" /> {tipo === 'pagar' ? 'Nova conta a pagar' : 'Nova conta a receber'}
          </button>
        </div>

        {itens.length === 0 ? (
          <div className="card px-6 py-14 text-center text-sm text-zinc-500">
            Nenhum lançamento {filtro === 'abertos' ? 'em aberto' : ''} aqui.
          </div>
        ) : (
          <div className="card divide-y divide-night-800 overflow-hidden">
            {itens.map((l) => {
              const vencido = l.status === 'aberto' && l.data_vencimento < hoje;
              return (
                <div key={l.id} className="flex items-center gap-3 px-5 py-3.5">
                  {l.tipo === 'pagar' ? (
                    <ArrowDownCircle className="h-5 w-5 shrink-0 text-red-300" />
                  ) : (
                    <ArrowUpCircle className="h-5 w-5 shrink-0 text-sky-300" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-zinc-100">
                      {l.descricao}
                      {l.categoria && <span className="ml-2 text-xs font-normal text-zinc-500">{l.categoria.nome}</span>}
                    </div>
                    <div className="text-xs text-zinc-500">
                      {[
                        `Venc. ${formatarData(l.data_vencimento)}`,
                        l.fornecedor?.nome,
                        l.evento?.nome ? `Evento: ${l.evento.nome}` : null,
                        l.status === 'pago' && l.data_pagamento
                          ? `${l.tipo === 'receber' ? 'Recebido' : 'Pago'} em ${formatarData(l.data_pagamento)}${l.conta ? ` (${l.conta.nome})` : ''}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </div>
                  </div>
                  <span
                    className={`rounded-full border px-2.5 py-0.5 text-[0.65rem] font-medium ${
                      l.status === 'pago'
                        ? 'border-emerald-500/30 bg-emerald-500/15 text-emerald-300'
                        : vencido
                          ? 'border-red-500/30 bg-red-500/15 text-red-300'
                          : 'border-amber-500/30 bg-amber-500/15 text-amber-300'
                    }`}
                  >
                    {l.status === 'pago' ? (l.tipo === 'receber' ? 'Recebido' : 'Pago') : vencido ? 'Vencido' : 'Em aberto'}
                  </span>
                  <div
                    className={`w-28 shrink-0 text-right text-sm font-semibold ${
                      l.tipo === 'pagar' ? 'text-red-300' : 'text-sky-300'
                    }`}
                  >
                    {formatarMoeda(l.valor)}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    {l.status === 'aberto' && (
                      <button
                        onClick={() => setBaixa(l)}
                        className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-emerald-950/40 hover:text-emerald-300"
                        title={l.tipo === 'receber' ? 'Registrar recebimento' : 'Registrar pagamento'}
                      >
                        <CheckCircle2 className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setEdit(l);
                        setModal(true);
                      }}
                      className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-night-800 hover:text-gold-300"
                      title="Editar"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => excluir(l)}
                      className="rounded-lg p-1.5 text-zinc-500 transition hover:bg-red-950/40 hover:text-red-300"
                      title="Excluir"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  if (carregando) {
    return (
      <div className="flex justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-night-700 border-t-gold-500" />
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap gap-2">
        {(
          [
            ['visao', 'Visão geral', BarChart3],
            ['pagar', 'Contas a pagar', ArrowDownCircle],
            ['receber', 'Contas a receber', ArrowUpCircle],
            ['conciliacao', 'Conciliação bancária', FileCheck2],
          ] as [Aba, string, React.ElementType][]
        ).map(([chave, rotulo, Icone]) => (
          <button
            key={chave}
            onClick={() => setAba(chave)}
            className={`inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition ${
              aba === chave
                ? 'border border-gold-500/40 bg-gold-500/15 text-gold-300'
                : 'border border-night-700 text-zinc-400 hover:text-white'
            }`}
          >
            <Icone className="h-4 w-4" /> {rotulo}
          </button>
        ))}
      </div>

      {aba === 'visao' && (
        <div>
          {/* saldos por conta */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {saldosContas.map(({ conta, saldo }) => (
              <div key={conta.id} className="card px-4 py-3">
                <div className="flex items-center gap-2 text-[0.65rem] font-medium uppercase tracking-wider text-zinc-500">
                  {conta.tipo === 'caixa' ? <Wallet className="h-3.5 w-3.5" /> : <Landmark className="h-3.5 w-3.5" />}
                  {conta.nome}
                </div>
                <div className={`mt-1 font-display text-lg font-bold ${saldo >= 0 ? 'text-zinc-100' : 'text-red-400'}`}>
                  {formatarMoeda(saldo)}
                </div>
              </div>
            ))}
            <div className="card border-gold-600/40 px-4 py-3">
              <div className="text-[0.65rem] font-medium uppercase tracking-wider text-zinc-500">Saldo total</div>
              <div className={`mt-1 font-display text-lg font-bold ${saldoTotal >= 0 ? 'text-gold-300' : 'text-red-400'}`}>
                {formatarMoeda(saldoTotal)}
              </div>
            </div>
          </div>

          {contas.length === 0 && (
            <div className="mt-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300">
              Nenhuma conta cadastrada — cadastre em <strong>Cadastros → Contas &amp; Caixas</strong> para acompanhar
              saldos e conciliar o extrato.
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="card px-4 py-3">
              <div className="text-[0.65rem] font-medium uppercase tracking-wider text-zinc-500">A pagar (em aberto)</div>
              <div className="mt-1 font-display text-lg font-bold text-red-300">{formatarMoeda(totais.pagarAberto)}</div>
            </div>
            <div className="card px-4 py-3">
              <div className="text-[0.65rem] font-medium uppercase tracking-wider text-zinc-500">A receber (em aberto)</div>
              <div className="mt-1 font-display text-lg font-bold text-sky-300">{formatarMoeda(totais.receberAberto)}</div>
            </div>
          </div>

          {/* fluxo de caixa projetado */}
          <div className="card mt-4 overflow-x-auto">
            <div className="border-b border-night-700 px-5 py-3.5">
              <h3 className="text-sm font-semibold text-white">Fluxo de caixa projetado (lançamentos em aberto)</h3>
            </div>
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-night-700 text-left text-xs uppercase tracking-wider text-zinc-500">
                  <th className="px-5 py-3 font-medium">Mês</th>
                  <th className="px-5 py-3 text-right font-medium">Entradas</th>
                  <th className="px-5 py-3 text-right font-medium">Saídas</th>
                  <th className="px-5 py-3 text-right font-medium">Líquido</th>
                  <th className="px-5 py-3 text-right font-medium text-gold-500">Saldo projetado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-night-800">
                {fluxo.map((m) => (
                  <tr key={m.chave}>
                    <td className="px-5 py-2.5 capitalize text-zinc-300">{m.rotulo}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-sky-300">{formatarMoeda(m.entra)}</td>
                    <td className="px-5 py-2.5 text-right tabular-nums text-red-300">{formatarMoeda(m.sai)}</td>
                    <td className={`px-5 py-2.5 text-right tabular-nums ${m.liquido >= 0 ? 'text-zinc-200' : 'text-red-400'}`}>
                      {formatarMoeda(m.liquido)}
                    </td>
                    <td className={`px-5 py-2.5 text-right font-semibold tabular-nums ${m.acumulado >= 0 ? 'text-gold-300' : 'text-red-400'}`}>
                      {formatarMoeda(m.acumulado)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {aba === 'pagar' && renderLista('pagar')}
      {aba === 'receber' && renderLista('receber')}
      {aba === 'conciliacao' && (
        <ConciliacaoTab contas={contas} lancamentos={lancamentos} onMudou={carregar} />
      )}

      <LancamentoModal
        aberto={modal}
        onFechar={() => setModal(false)}
        onSalvo={carregar}
        edit={edit}
        tipoInicial={tipoNovo}
        categorias={categorias}
        fornecedores={fornecedores}
        eventos={eventos}
      />
      <BaixaModal lancamento={baixa} contas={contas} onFechar={() => setBaixa(null)} onSalvo={carregar} />
    </div>
  );
}

// ---- Conciliação bancária (importação de OFX + matching) ----

function ConciliacaoTab({
  contas,
  lancamentos,
  onMudou,
}: {
  contas: FinConta[];
  lancamentos: FinLancamento[];
  onMudou: () => void;
}) {
  const [contaSel, setContaSel] = useState('');
  const [extrato, setExtrato] = useState<FinExtrato[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (contas.length > 0 && !contaSel) setContaSel(contas[0].id);
  }, [contas, contaSel]);

  async function carregarExtrato(conta: string) {
    if (!conta) return;
    setCarregando(true);
    const { data } = await supabase
      .from('rr_fin_extrato')
      .select('*')
      .eq('conta_id', conta)
      .order('data', { ascending: false })
      .limit(300);
    setExtrato((data as FinExtrato[]) ?? []);
    setCarregando(false);
  }

  useEffect(() => {
    carregarExtrato(contaSel);
  }, [contaSel]);

  async function importar(arquivo: File | null) {
    if (!arquivo || !contaSel) return;
    setMsg(null);
    const texto = await arquivo.text();
    const transacoes = parseOfx(texto);
    if (transacoes.length === 0) {
      setMsg('Nenhum lançamento encontrado no arquivo — confira se é um OFX válido exportado do banco.');
      return;
    }
    const existentes = new Set(extrato.map((e) => e.fitid));
    const novos = transacoes
      .filter((t) => !existentes.has(t.fitid))
      .map((t) => ({ conta_id: contaSel, fitid: t.fitid, data: t.data, descricao: t.descricao || null, valor: t.valor }));
    if (novos.length > 0) {
      const { error } = await supabase.from('rr_fin_extrato').insert(novos);
      if (error) {
        setMsg(error.message);
        return;
      }
    }
    setMsg(`${novos.length} lançamento(s) importado(s)${transacoes.length - novos.length > 0 ? `; ${transacoes.length - novos.length} já existiam` : ''}.`);
    await carregarExtrato(contaSel);
  }

  function sugerir(e: FinExtrato): FinLancamento | null {
    const alvoTipo: FinLancamentoTipo = Number(e.valor) < 0 ? 'pagar' : 'receber';
    const alvoValor = Math.abs(Number(e.valor));
    const candidatos = lancamentos.filter(
      (l) => l.status === 'aberto' && l.tipo === alvoTipo && Math.abs(Number(l.valor) - alvoValor) < 0.005,
    );
    if (candidatos.length === 0) return null;
    const dataE = new Date(e.data).getTime();
    candidatos.sort(
      (a, b) =>
        Math.abs(new Date(a.data_vencimento).getTime() - dataE) - Math.abs(new Date(b.data_vencimento).getTime() - dataE),
    );
    const melhor = candidatos[0];
    const dias = Math.abs(new Date(melhor.data_vencimento).getTime() - dataE) / 86400000;
    return dias <= 7 ? melhor : null;
  }

  async function conciliar(e: FinExtrato, l: FinLancamento) {
    const { error } = await supabase
      .from('rr_fin_lancamentos')
      .update({ status: 'pago', data_pagamento: e.data, conta_id: e.conta_id })
      .eq('id', l.id);
    if (error) return alert(error.message);
    await supabase.from('rr_fin_extrato').update({ lancamento_id: l.id }).eq('id', e.id);
    await carregarExtrato(contaSel);
    onMudou();
  }

  async function criarDoExtrato(e: FinExtrato) {
    const { data, error } = await supabase
      .from('rr_fin_lancamentos')
      .insert({
        tipo: Number(e.valor) < 0 ? 'pagar' : 'receber',
        descricao: e.descricao || 'Lançamento do extrato',
        valor: Math.abs(Number(e.valor)),
        data_vencimento: e.data,
        data_pagamento: e.data,
        status: 'pago',
        conta_id: e.conta_id,
      })
      .select('id')
      .single();
    if (error || !data) return alert(error?.message ?? 'Erro ao criar lançamento');
    await supabase.from('rr_fin_extrato').update({ lancamento_id: data.id }).eq('id', e.id);
    await carregarExtrato(contaSel);
    onMudou();
  }

  const pendentes = extrato.filter((e) => !e.lancamento_id).length;

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <select className="input !w-auto" value={contaSel} onChange={(e) => setContaSel(e.target.value)}>
          {contas.length === 0 && <option value="">Cadastre uma conta primeiro</option>}
          {contas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </select>
        <label className={`btn-gold cursor-pointer ${!contaSel ? 'pointer-events-none opacity-50' : ''}`}>
          <Upload className="h-4 w-4" /> Importar extrato (OFX)
          <input
            type="file"
            accept=".ofx,.qfx,.xml,.txt"
            className="hidden"
            onChange={(e) => {
              importar(e.target.files?.[0] ?? null);
              e.target.value = '';
            }}
          />
        </label>
        {pendentes > 0 && (
          <span className="rounded-full border border-amber-500/30 bg-amber-500/15 px-3 py-1 text-xs font-medium text-amber-300">
            {pendentes} pendente(s) de conciliação
          </span>
        )}
      </div>

      {msg && (
        <div className="mb-4 rounded-lg border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-sm text-sky-300">{msg}</div>
      )}

      {carregando ? (
        <div className="flex justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-night-700 border-t-gold-500" />
        </div>
      ) : extrato.length === 0 ? (
        <div className="card px-6 py-14 text-center text-sm text-zinc-500">
          Nenhum extrato importado nesta conta. Exporte o OFX no site/app do seu banco e importe aqui.
        </div>
      ) : (
        <div className="card divide-y divide-night-800 overflow-hidden">
          {extrato.map((e) => {
            const sugestao = e.lancamento_id ? null : sugerir(e);
            return (
              <div key={e.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <div className="w-20 shrink-0 text-xs text-zinc-500">{formatarData(e.data)}</div>
                <div className="min-w-0 flex-1 text-sm text-zinc-200">{e.descricao || '—'}</div>
                <div
                  className={`w-28 shrink-0 text-right text-sm font-semibold tabular-nums ${
                    Number(e.valor) < 0 ? 'text-red-300' : 'text-emerald-300'
                  }`}
                >
                  {formatarMoeda(Number(e.valor))}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {e.lancamento_id ? (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-2.5 py-0.5 text-[0.65rem] font-medium text-emerald-300">
                      <CheckCircle2 className="h-3 w-3" /> Conciliado
                    </span>
                  ) : sugestao ? (
                    <button
                      onClick={() => conciliar(e, sugestao)}
                      className="rounded-lg border border-gold-500/40 bg-gold-500/10 px-3 py-1.5 text-xs font-medium text-gold-300 transition hover:bg-gold-500/20"
                      title={`Sugestão: ${sugestao.descricao}`}
                    >
                      Conciliar com “{sugestao.descricao.slice(0, 24)}{sugestao.descricao.length > 24 ? '…' : ''}”
                    </button>
                  ) : (
                    <button
                      onClick={() => criarDoExtrato(e)}
                      className="rounded-lg border border-night-700 px-3 py-1.5 text-xs font-medium text-zinc-400 transition hover:text-white"
                    >
                      Criar lançamento
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
