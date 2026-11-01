import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, RefreshCw, AlertTriangle, ArrowRight } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import { supabase } from '../lib/supabase';
import { Button, IconButton, KPICard, PageHeader, SectionCard, TableSkeleton } from '../components/ui';

dayjs.locale('pt-br');

// Painel do dono (/financeiro). Todos os números vêm de fn_painel_dono, com a
// régua do Fechamento de Sócios: "operação" exclui transferências entre contas
// e o que é de sócio ou empréstimo; esses aparecem à parte. Nenhum número é
// somado aqui na tela.

interface Painel {
  periodo: { inicio: string; fim: string; inicio_anterior: string; fim_anterior: string; hoje: string };
  contas: { banco: string; tipo: string; saldo: number }[];
  saldo_hoje: number;
  mes: {
    saldo_inicial: number; entrou_op: number; saiu_op: number; resultado_op: number;
    socios_entrou: number; socios_saiu: number; saldo_final: number; sem_categoria_qtd: number; sem_categoria_valor: number;
  };
  anterior: { entrou_op: number; saiu_op: number; resultado_op: number };
  media_3m_resultado: number | null;
  venda: { venda: number; comandas: number; ticket: number | null; venda_anterior: number; taxa_servico: number };
  serie: { mes: string; entrou_op: number; saiu_op: number; resultado: number; venda: number; margem: number | null }[];
  top_grupos: { nome: string; total: number; anterior: number }[];
  top_fornecedores: { nome: string; total: number; anterior: number }[];
  pagar: { vencidas_qtd: number; vencidas: number; hoje: number; prox7: number; prox30: number };
  receber: { vencidas_qtd: number; vencidas: number; prox7: number; prox30: number };
  alertas: { duplicadas_possiveis: number; datas_estranhas: number; categorias_sem_dre: number; conciliacao_pendente: number };
}

const fmt = (v: number | null | undefined) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 }).format(Number(v || 0));
const fmtK = (v: number) => (Math.abs(v) >= 1000 ? `${(v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 0 })} mil` : String(Math.round(v)));
const variacao = (atual: number, antes: number) => {
  if (!antes) return null;
  const p = ((atual - antes) / Math.abs(antes)) * 100;
  return `${p >= 0 ? '+' : ''}${p.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%`;
};

/** Linha do quadro "o mês pelo caixa": rótulo, explicação de uma linha, valor do mês e do mesmo período anterior. */
const LinhaCaixa: React.FC<{ sinal?: string; rotulo: string; explica: string; valor: number; anterior?: number; forte?: boolean; tom?: 'certo' | 'perigo' }> =
  ({ sinal, rotulo, explica, valor, anterior, forte, tom }) => (
    <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 items-baseline py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
      <div className="min-w-0">
        <p className="t-body m-0" style={{ color: 'var(--text-primary)', fontWeight: forte ? 700 : 500 }}>{sinal && <span className="t-caption mr-1">{sinal}</span>}{rotulo}</p>
        <p className="t-caption m-0">{explica}</p>
      </div>
      <span className={`t-body tabular-nums text-right ${tom ? `texto-${tom}` : ''}`} style={{ fontWeight: forte ? 700 : 500, color: tom ? undefined : 'var(--text-primary)' }}>{fmt(valor)}</span>
      <span className="t-caption tabular-nums text-right w-24">{anterior !== undefined ? fmt(anterior) : ''}</span>
    </div>
  );

const DashboardFinanceiro: React.FC = () => {
  const navigate = useNavigate();
  const [ref, setRef] = useState(dayjs().format('YYYY-MM-DD'));
  const [p, setP] = useState<Painel | null>(null);
  const [stone, setStone] = useState<{ saldo: number | null; saldo_em: string | null } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [verTabela, setVerTabela] = useState(false);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    const [{ data, error }, { data: ig }] = await Promise.all([
      supabase.rpc('fn_painel_dono', { p_ref: ref }),
      supabase.from('banco_integracoes').select('saldo, saldo_em').eq('ativo', true).limit(1).maybeSingle(),
    ]);
    if (error) setErro(error.message); else setP(data as Painel);
    setStone(ig as any);
    setCarregando(false);
  }, [ref]);

  useEffect(() => { carregar(); }, [carregar]);

  const mesAtual = dayjs(ref).isSame(dayjs(), 'month');
  const tituloMes = dayjs(ref).format('MMMM [de] YYYY').replace(/^./, c => c.toUpperCase());
  const ir = (tab: string) => navigate(`/finance?tab=${tab}`);

  return (
    <div className="pb-16">
      <PageHeader
        caminho={['Financeiro', 'Painel']}
        title="Painel financeiro"
        subtitle={p ? `${tituloMes}${mesAtual ? ` · até ${dayjs(p.periodo.fim).format('DD/MM')}` : ''}` : tituloMes}
        actions={(
          <>
            <IconButton aria-label="Mês anterior" onClick={() => setRef(dayjs(ref).subtract(1, 'month').endOf('month').format('YYYY-MM-DD'))}><ChevronLeft size={16} /></IconButton>
            {!mesAtual && <Button variante="discreto" tamanho="sm" onClick={() => setRef(dayjs().format('YYYY-MM-DD'))}>Mês atual</Button>}
            <IconButton aria-label="Mês seguinte" disabled={mesAtual} onClick={() => setRef(dayjs(ref).add(1, 'month').endOf('month').format('YYYY-MM-DD'))}><ChevronRight size={16} /></IconButton>
            <IconButton aria-label="Atualizar" onClick={carregar}><RefreshCw size={16} /></IconButton>
            <Button variante="primario" onClick={() => ir('fechamento')}>Fechamento de sócios</Button>
          </>
        )}
      />

      {erro && <p className="aviso aviso-perigo mb-4" role="alert">Não consegui carregar o painel: {erro}</p>}
      {carregando && !p ? <TableSkeleton /> : p && (
        <div className="flex flex-col gap-4">
          {/* ── números principais ── */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <KPICard rotulo="Resultado da operação" valor={fmt(p.mes.resultado_op)} tom={p.mes.resultado_op >= 0 ? 'certo' : 'alerta'}
              detalhe={`mesmo período do mês anterior: ${fmt(p.anterior.resultado_op)}`} />
            <KPICard rotulo="Venda (ZIG, sem taxa de serviço)" valor={fmt(p.venda.venda)} tom="destaque"
              detalhe={`${variacao(p.venda.venda, p.venda.venda_anterior) ?? '—'} vs. mês anterior${p.venda.ticket ? ` · ticket ${fmt(p.venda.ticket)}` : ''}`}
              onClick={() => ir('faturamento')} />
            <KPICard rotulo="A pagar vencido" valor={fmt(p.pagar.vencidas)} tom={p.pagar.vencidas_qtd ? 'alerta' : 'certo'}
              detalhe={`${p.pagar.vencidas_qtd} contas · confira se já foram pagas`} onClick={() => ir('pagar')} />
            <KPICard rotulo="A pagar nos próximos 7 dias" valor={fmt(p.pagar.prox7)} tom="atencao"
              detalhe={`hoje ${fmt(p.pagar.hoje)} · 30 dias ${fmt(p.pagar.prox30)}`} onClick={() => ir('pagar')} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1.3fr_1fr] gap-4">
            {/* ── o mês pelo caixa ── */}
            <SectionCard title="O mês pelo caixa" descricao="A mesma conta do Fechamento de Sócios. À direita, o mesmo período do mês anterior.">
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-4 pb-1">
                <span /><span className="t-caption text-right">{dayjs(p.periodo.inicio).format('DD/MM')}–{dayjs(p.periodo.fim).format('DD/MM')}</span>
                <span className="t-caption text-right w-24">{dayjs(p.periodo.inicio_anterior).format('DD/MM')}–{dayjs(p.periodo.fim_anterior).format('DD/MM')}</span>
              </div>
              <LinhaCaixa rotulo="Começou com" explica="Soma das contas e do cofre no 1º dia." valor={p.mes.saldo_inicial} />
              <LinhaCaixa sinal="+" rotulo="Entrou da operação" explica="Vendas, eventos e outras receitas (sem transferências)." valor={p.mes.entrou_op} anterior={p.anterior.entrou_op} />
              <LinhaCaixa sinal="−" rotulo="Pagou da operação" explica="Fornecedores, equipe, contas fixas, impostos." valor={p.mes.saiu_op} anterior={p.anterior.saiu_op} />
              <LinhaCaixa sinal="=" rotulo="Resultado da operação" explica={p.media_3m_resultado != null ? `Média dos 3 meses anteriores: ${fmt(p.media_3m_resultado)}` : 'Quanto a operação gerou ou consumiu.'}
                valor={p.mes.resultado_op} anterior={p.anterior.resultado_op} forte tom={p.mes.resultado_op >= 0 ? 'certo' : 'perigo'} />
              {(p.mes.socios_entrou > 0 || p.mes.socios_saiu > 0) && (
                <>
                  <LinhaCaixa sinal="+" rotulo="Sócios e empréstimos (entrou)" explica="Aportes e empréstimos recebidos." valor={p.mes.socios_entrou} />
                  <LinhaCaixa sinal="−" rotulo="Sócios e empréstimos (saiu)" explica="Retiradas e pagamento de empréstimos." valor={p.mes.socios_saiu} />
                </>
              )}
              <LinhaCaixa rotulo="Terminou com" explica="Soma das contas e do cofre no último dia." valor={p.mes.saldo_final} forte />
              {p.mes.sem_categoria_qtd > 0 && (
                <p className="aviso aviso-atencao mt-3">
                  {p.mes.sem_categoria_qtd} lançamentos sem categoria ({fmt(p.mes.sem_categoria_valor)}) entram no caixa mas não sabem onde ficar.{' '}
                  <button className="underline" onClick={() => ir('categorizar')}>Categorizar</button>
                </p>
              )}
            </SectionCard>

            {/* ── onde o dinheiro está ── */}
            <SectionCard title="Onde o dinheiro está" descricao="Saldo calculado pelo sistema (saldo inicial do cadastro + lançamentos).">
              <ul className="flex flex-col">
                {p.contas.map(c => (
                  <li key={c.banco} className="flex items-baseline justify-between gap-3 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                    <span className="t-body" style={{ color: 'var(--text-primary)' }}>{c.banco}
                      {c.banco === 'Stone' && stone?.saldo != null && <span className="t-caption"> · no banco: {fmt(stone.saldo)}</span>}
                    </span>
                    <span className={`t-body tabular-nums ${c.saldo < 0 ? 'texto-perigo' : ''}`} style={{ color: c.saldo < 0 ? undefined : 'var(--text-primary)' }}>{fmt(c.saldo)}</span>
                  </li>
                ))}
                <li className="flex items-baseline justify-between gap-3 py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                  <span className="t-body" style={{ color: 'var(--text-primary)', fontWeight: 700 }}>Total</span>
                  <span className="t-body tabular-nums" style={{ color: 'var(--gold)', fontWeight: 700 }}>{fmt(p.saldo_hoje)}</span>
                </li>
              </ul>
              {p.contas.some(c => c.saldo < 0) && (
                <p className="t-caption mt-2">Conta com saldo negativo aqui quase sempre é saldo inicial não cadastrado ou lançamento faltando. Confira com o extrato do banco e ajuste em Cadastros › Contas bancárias.</p>
              )}
            </SectionCard>
          </div>

          {/* ── resultado mês a mês ── */}
          <SectionCard title="Resultado da operação, mês a mês" descricao="Entrou menos pagou da operação. Barra abaixo da linha = mês que consumiu caixa."
            action={<Button tamanho="sm" variante="discreto" onClick={() => setVerTabela(v => !v)}>{verTabela ? 'Ver gráfico' : 'Ver tabela'}</Button>}>
            {verTabela ? (
              <div className="overflow-x-auto">
                <table className="w-full t-caption min-w-[560px]">
                  <thead><tr><th className="text-left pb-2">Mês</th><th className="text-right">Entrou</th><th className="text-right">Pagou</th><th className="text-right">Resultado</th><th className="text-right">Margem</th><th className="text-right">Venda ZIG</th></tr></thead>
                  <tbody>
                    {p.serie.map(s => (
                      <tr key={s.mes} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                        <td className="py-1.5">{dayjs(`${s.mes}-01`).format('MMM/YY')}</td>
                        <td className="text-right tabular-nums">{fmt(s.entrou_op)}</td>
                        <td className="text-right tabular-nums">{fmt(s.saiu_op)}</td>
                        <td className={`text-right tabular-nums ${s.resultado < 0 ? 'texto-perigo' : 'texto-certo'}`}>{fmt(s.resultado)}</td>
                        <td className="text-right tabular-nums">{s.margem != null ? `${s.margem.toLocaleString('pt-BR')}%` : '—'}</td>
                        <td className="text-right tabular-nums">{s.venda ? fmt(s.venda) : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={p.serie} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                    <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
                    <XAxis dataKey="mes" tickFormatter={m => dayjs(`${m}-01`).format('MMM')} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tickFormatter={v => fmtK(Number(v))} tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.25)" />
                    <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }}
                      contentStyle={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 8, color: 'var(--text-primary)' }}
                      labelFormatter={m => dayjs(`${m}-01`).format('MMMM [de] YYYY')}
                      formatter={(v: any, _n: any, item: any) => [`${fmt(Number(v))}${item?.payload?.margem != null ? ` · margem ${item.payload.margem}%` : ''}`, 'Resultado']} />
                    <Bar dataKey="resultado" maxBarSize={24} radius={[4, 4, 0, 0]}>
                      {p.serie.map(s => <Cell key={s.mes} fill={s.resultado < 0 ? '#f87171' : '#D4AF37'} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </SectionCard>

          {/* ── para onde vai o dinheiro ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {([['Para onde vai o dinheiro', 'Maiores grupos de despesa da operação.', p.top_grupos, null],
              ['Maiores fornecedores', 'Pagos no mês, via contas a pagar.', p.top_fornecedores, 'ficha-fornecedor']] as const).map(([titulo, desc, lista, tab]) => (
              <SectionCard key={titulo} title={titulo} descricao={`${desc} À direita, a variação contra o mesmo período do mês anterior.`}
                action={tab ? <Button tamanho="sm" variante="discreto" icone={<ArrowRight size={14} />} onClick={() => ir(tab)}>Ver</Button> : undefined}>
                {lista.length === 0 ? <p className="t-caption">Nada no período.</p> : (
                  <ul className="flex flex-col">
                    {lista.map(g => {
                      const max = Math.max(...lista.map(x => x.total));
                      const v = variacao(g.total, g.anterior);
                      return (
                        <li key={g.nome} className="py-2" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                          <div className="flex items-baseline justify-between gap-3">
                            <span className="t-body truncate" style={{ color: 'var(--text-primary)' }}>{g.nome}</span>
                            <span className="t-body tabular-nums" style={{ color: 'var(--text-primary)' }}>{fmt(g.total)}
                              <span className="t-caption ml-2 inline-block w-12 text-right">{v ?? ''}</span></span>
                          </div>
                          <div className="mt-1 h-1 rounded" style={{ background: 'rgba(255,255,255,0.05)' }}>
                            <div className="h-1 rounded" style={{ width: `${(g.total / max) * 100}%`, background: 'var(--gold)', opacity: 0.7 }} />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </SectionCard>
            ))}
          </div>

          {/* ── próximos dias e alertas ── */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionCard title="Próximos dias" descricao="O que vence e o que deve entrar.">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="t-label m-0 mb-1">A pagar</p>
                  <p className="t-body m-0">Hoje: <strong>{fmt(p.pagar.hoje)}</strong></p>
                  <p className="t-body m-0">7 dias: <strong>{fmt(p.pagar.prox7)}</strong></p>
                  <p className="t-body m-0">30 dias: <strong>{fmt(p.pagar.prox30)}</strong></p>
                  <p className="t-body m-0 texto-perigo">Vencido: {fmt(p.pagar.vencidas)}</p>
                </div>
                <div>
                  <p className="t-label m-0 mb-1">A receber</p>
                  <p className="t-body m-0">7 dias: <strong>{fmt(p.receber.prox7)}</strong></p>
                  <p className="t-body m-0">30 dias: <strong>{fmt(p.receber.prox30)}</strong></p>
                  <p className="t-body m-0 texto-atencao">Vencido: {fmt(p.receber.vencidas)} ({p.receber.vencidas_qtd})</p>
                </div>
              </div>
            </SectionCard>

            <SectionCard title="Pontos de atenção nos dados" descricao="Coisas que deixam os números menos confiáveis.">
              <ul className="flex flex-col gap-2">
                {[
                  { n: p.alertas.conciliacao_pendente, txt: 'saídas da Conta Stone para conciliar', tab: 'conciliacao' },
                  { n: p.pagar.vencidas_qtd, txt: 'contas a pagar vencidas sem baixa (podem já ter sido pagas)', tab: 'pagar' },
                  { n: p.mes.sem_categoria_qtd, txt: 'lançamentos do mês sem categoria', tab: 'categorizar' },
                  { n: p.alertas.duplicadas_possiveis, txt: 'possíveis contas duplicadas (mesmo fornecedor, valor e vencimento)', tab: 'pagar' },
                  { n: p.receber.vencidas_qtd, txt: 'contas a receber vencidas', tab: 'receber' },
                  { n: p.alertas.datas_estranhas, txt: 'contas com data digitada errada (ex.: ano 0001)', tab: 'pagar' },
                  { n: p.alertas.categorias_sem_dre, txt: 'categorias sem grupo do DRE', tab: 'cadastros' },
                ].filter(a => a.n > 0).map(a => (
                  <li key={a.txt} className="flex items-center gap-2">
                    <AlertTriangle size={14} className="texto-atencao shrink-0" />
                    <span className="t-body flex-1"><strong>{a.n}</strong> {a.txt}</span>
                    <Button tamanho="sm" variante="discreto" onClick={() => ir(a.tab)}>Abrir</Button>
                  </li>
                ))}
              </ul>
            </SectionCard>
          </div>
        </div>
      )}
    </div>
  );
};

export default DashboardFinanceiro;
