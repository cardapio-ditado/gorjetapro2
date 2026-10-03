import React, { useState, useEffect, useCallback } from 'react';
import { AlertTriangle, Briefcase, Calendar, Inbox, MessageSquare, Music, Package, RefreshCw } from 'lucide-react';
import { Badge, Button, EmptyState, IconButton, KPICard, Modal, PageHeader, SectionCard, CardSkeleton } from '../components/ui';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import ChatFinanceiroIA from '../components/financeiro/ChatFinanceiroIA';

// ─── Helpers ──────────────────────────────────────────────────────────────────
// Blindados contra null/undefined (payload parcial durante recarga de sessão).
const fmtR = (v: number | null | undefined) =>
  (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0, maximumFractionDigits: 0 });

const fmtData = (d: string | null | undefined) => {
  if (!d) return '—';
  const dt = new Date(d + (d.includes('T') ? '' : 'T12:00'));
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

const diasAtraso = (d: string | null | undefined) => {
  if (!d) return 0;
  const dt = new Date(d + (d.includes('T') ? '' : 'T12:00'));
  if (isNaN(dt.getTime())) return 0;
  return Math.max(0, Math.floor((Date.now() - dt.getTime()) / 86400000));
};
const vencido = (d: string | null | undefined) => !!d && new Date(d + (d.includes('T') ? '' : 'T12:00')) < new Date();

const saudacao = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
};

// ─── Tipos do payload da RPC canônica fn_dashboard_dono ──────────────────────
interface PainelDono {
  data: string;
  caixa: {
    hoje: { entradas: number; saidas: number };
    mes: { entradas: number; saidas: number };
    serie_14d: { data: string; entradas: number; saidas: number }[];
  };
  vendas: {
    data: string; total: number; bebidas: number; alimentos: number; outros: number;
    transacoes: number; mes: number;
    anterior: { data: string; total: number } | null;
    serie_14d: { data: string; total: number }[];
  } | null;
  cmv: {
    success: boolean; cmv: number; cmv_percentual: number | null;
    compras: number; avisos?: string[];
    faturamento?: { valor: number };
  };
  contas: {
    vencidas: { qtd: number; valor: number };
    semana: { qtd: number; valor: number };
    lista_vencidas: { id: string; descricao: string; categoria: string | null; valor: number; vencimento: string }[];
    lista_semana: { id: string; descricao: string; categoria: string | null; valor: number; vencimento: string }[];
  };
  equipe: {
    colaboradores: { ativos: number; ferias: number; afastados: number };
    caches: { qtd: number; valor: number; lista: { nome: string; data: string; total: number; pago: number; saldo: number }[] };
    extras: { qtd: number; valor: number; lista: { nome: string; funcao: string | null; setor: string | null; data: string; valor: number }[] };
    rh_contas: { qtd: number; valor: number; lista: { descricao: string; categoria: string; valor: number; vencimento: string }[] };
  };
  estoque: { valor_total: number; negativos: number; abaixo_minimo: number };
  diario: { pendencias: number; criticas: number; lista: { titulo: string; setor: string; gravidade: string; dias: number }[] };
  eventos: { nome: string; data: string; pessoas: number | null; valor: number | null; pagamento: string | null }[];
}
interface ItemAtencao { nome: string; estoque_nome: string; categoria: string | null; ultima_mov: string | null; saldo_real: number; unidade_medida: string; estoque_minimo: number; status_alerta: 'negativo' | 'zerado' | 'critico' }

// ─── Peças da tela ────────────────────────────────────────────────────────────
type Sev = 'red' | 'amber' | 'ok';
const SEV: Record<Sev, string> = { red: 'var(--danger-text)', amber: 'var(--warn-text)', ok: 'var(--ok-text)' };

/** Uma linha do radar: ponto de cor, rótulo, valor. Clicável quando leva a uma lista. */
function RadarRow({ icon: Icon, label, valor, sub, sev, onClick }: { icon: React.ElementType; label: string; valor: string; sub?: string; sev: Sev; onClick?: () => void }) {
  return (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 px-5 py-2.5 text-left hover:bg-white/[0.04] focus-ring" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: SEV[sev], flexShrink: 0 }} />
      <Icon size={16} aria-hidden="true" style={{ color: 'var(--text-secondary)', flexShrink: 0 }} />
      <span className="flex-1 min-w-0 t-body truncate" style={{ fontWeight: 500 }}>{label}</span>
      <span className="text-right shrink-0">
        <span className="block t-body num" style={{ fontWeight: 600, color: sev === 'red' ? 'var(--danger-text)' : 'var(--text-primary)' }}>{valor}</span>
        {sub && <span className="block t-caption">{sub}</span>}
      </span>
    </button>
  );
}

/** Lista curta dentro de um cartão: cabeçalho com contagem, linhas, rodapé com o total. */
function Lista<T>({ titulo, items, vazio, total, render, refEl }: { titulo: string; items: T[]; vazio: string; total?: { rotulo: string; valor: string; tom?: 'alerta' | 'normal' }; render: (item: T, i: number) => React.ReactNode; refEl?: React.RefObject<HTMLDivElement> }) {
  const lista = items ?? [];
  return (
    <div ref={refEl}>
      <SectionCard title={titulo} action={<span className="t-caption">{lista.length} {lista.length === 1 ? 'item' : 'itens'}</span>} noPadding>
        {lista.length === 0 ? <div className="p-4"><EmptyState icon={Inbox} title={vazio} compact /></div> : (
          <>
            <div className="overflow-y-auto" style={{ maxHeight: 300 }}>{lista.map(render)}</div>
            {total && <div className="px-5 py-2.5 flex items-center justify-between" style={{ borderTop: '1px solid var(--border)' }}><span className="t-caption">{total.rotulo}</span><span className="t-body num" style={{ fontWeight: 700, color: total.tom === 'alerta' ? 'var(--danger-text)' : 'var(--text-primary)' }}>{total.valor}</span></div>}
          </>
        )}
      </SectionCard>
    </div>
  );
}

/** Linha padrão das listas: data à esquerda, texto e detalhe no meio, valor à direita. */
function Linha({ data, atraso, titulo, detalhe, valor, tomValor }: { data?: string; atraso?: number; titulo: string; detalhe?: React.ReactNode; valor: string; tomValor?: 'alerta' | 'normal' }) {
  return (
    <div className="flex items-center gap-3 px-5 py-2.5" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
      {data !== undefined && <div className="shrink-0 text-center" style={{ width: 44 }}><p className="t-caption" style={{ margin: 0, fontWeight: 600, color: atraso ? 'var(--danger-text)' : 'var(--text-secondary)' }}>{data}</p>{!!atraso && <p className="t-caption texto-perigo" style={{ margin: 0 }}>{atraso}d</p>}</div>}
      <div className="flex-1 min-w-0"><p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{titulo}</p>{detalhe && <p className="t-caption truncate" style={{ margin: 0 }}>{detalhe}</p>}</div>
      <p className="t-body num shrink-0" style={{ margin: 0, fontWeight: 600, color: tomValor === 'alerta' ? 'var(--danger-text)' : 'var(--text-primary)' }}>{valor}</p>
    </div>
  );
}

/** Barras simples dos últimos 14 dias, nas cores do kit. */
function Barras({ serie, max, destaqueUltima }: { serie: Array<{ chave: string; titulo: string; valores: number[] }>; max: number; destaqueUltima?: boolean }) {
  const cores = ['var(--ok-text)', 'var(--danger-text)'];
  return (
    <div className="flex items-end gap-1" style={{ height: 56 }} aria-hidden="true">
      {serie.map((d, i) => (
        <div key={d.chave} className="flex-1 h-full flex items-end justify-center gap-px" title={d.titulo}>
          {d.valores.map((v, j) => (
            <div key={j} className="flex-1" style={{ height: `${Math.max(3, (v / max) * 100)}%`, borderRadius: '3px 3px 0 0', background: d.valores.length > 1 ? cores[j] : (destaqueUltima && i === serie.length - 1 ? 'var(--gold)' : 'rgba(255,255,255,0.2)'), opacity: d.valores.length > 1 ? 0.7 : 1 }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// ─── Dashboard (Painel do Dono) ───────────────────────────────────────────────
// Todos os KPIs vêm da RPC canônica fn_dashboard_dono — não duplicar cálculos aqui.
const Dashboard: React.FC = () => {
  const { usuario } = useAuth();
  const primeiroNome = usuario?.nome_completo?.split(' ')[0] || '';
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showChatIA, setShowChatIA] = useState(false);
  const [showModalRH, setShowModalRH] = useState(false);
  const [showEstoqueDetalhe, setShowEstoqueDetalhe] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [painel, setPainel] = useState<PainelDono | null>(null);
  const [itensAtencao, setItensAtencao] = useState<ItemAtencao[]>([]);

  const refVencidas = React.useRef<HTMLDivElement>(null);
  const refSemana = React.useRef<HTMLDivElement>(null);
  const refMusicos = React.useRef<HTMLDivElement>(null);
  const refExtras = React.useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setErro(null);
    try {
      const [{ data: painelData, error }, { data: itensAtencaoData }] = await Promise.all([
        supabase.rpc('fn_dashboard_dono'),
        supabase.rpc('get_itens_atencao_dashboard'),
      ]);
      if (error) throw error;
      setPainel(painelData as PainelDono);
      setItensAtencao((itensAtencaoData ?? []) as ItemAtencao[]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar o painel');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  const refresh = () => { setRefreshing(true); load(); };

  const dataLonga = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });
  const cabecalho = (
    <PageHeader caminho={['Início']} title={`${saudacao()}, ${primeiroNome}`} subtitle={dataLonga.charAt(0).toUpperCase() + dataLonga.slice(1)}
      actions={<div className="flex items-center gap-2">
        <Button tamanho="sm" icone={<MessageSquare size={14} />} onClick={() => setShowChatIA(true)}>Perguntar à IA</Button>
        <IconButton aria-label="Atualizar" onClick={refresh} disabled={refreshing}><RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} /></IconButton>
      </div>} />
  );

  if (loading || !painel) return (
    <div className="max-w-6xl">
      {cabecalho}
      {erro && <div className="aviso aviso-perigo mb-4" role="alert">{erro}</div>}
      {!erro && <div className="grid grid-cols-2 lg:grid-cols-4 gap-3"><CardSkeleton count={4} /></div>}
    </div>
  );

  // Blindagem contra payload parcial
  const caixa = painel.caixa ?? { hoje: { entradas: 0, saidas: 0 }, mes: { entradas: 0, saidas: 0 }, serie_14d: [] };
  const vendas = painel.vendas ?? null;
  const cmv = painel.cmv ?? { success: false, cmv: 0, cmv_percentual: null, compras: 0, avisos: [] };
  const contas = painel.contas ?? { vencidas: { qtd: 0, valor: 0 }, semana: { qtd: 0, valor: 0 }, lista_vencidas: [], lista_semana: [] };
  const equipe = painel.equipe ?? { colaboradores: { ativos: 0, ferias: 0, afastados: 0 }, caches: { qtd: 0, valor: 0, lista: [] }, extras: { qtd: 0, valor: 0, lista: [] }, rh_contas: { qtd: 0, valor: 0, lista: [] } };
  const estoque = painel.estoque ?? { valor_total: 0, negativos: 0, abaixo_minimo: 0 };
  const eventos = painel.eventos ?? [];

  const resultadoMes = Number(caixa.mes.entradas) - Number(caixa.mes.saidas);
  const variacaoVendas = vendas?.anterior && Number(vendas.anterior.total) > 0 ? ((Number(vendas.total) - Number(vendas.anterior.total)) / Number(vendas.anterior.total)) * 100 : null;
  const serieVendas = vendas?.serie_14d ?? [];
  const maxVendas = Math.max(1, ...serieVendas.map(d => Number(d.total)));
  const serieCaixa = caixa.serie_14d ?? [];
  const maxCaixa = Math.max(1, ...serieCaixa.map(d => Math.max(Number(d.entradas), Number(d.saidas))));
  const estoqueAlertas = Number(estoque.negativos) + Number(estoque.abaixo_minimo);
  const pct = cmv.cmv_percentual === null ? null : Number(cmv.cmv_percentual);
  const scrollTo = (ref: React.RefObject<HTMLDivElement>) => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

  return (
    <div className="max-w-6xl pb-10">
      {cabecalho}
      {erro && <div className="aviso aviso-perigo mb-4" role="alert">{erro}</div>}

      {/* Os quatro números do dia */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KPICard rotulo={vendas ? `vendas da noite · ${fmtData(vendas.data)}` : 'vendas da noite'} valor={vendas ? fmtR(Number(vendas.total)) : 'sem Zig'} tom="destaque"
          detalhe={vendas ? (variacaoVendas !== null ? `${variacaoVendas >= 0 ? '+' : ''}${variacaoVendas.toFixed(0)}% vs ${fmtData(vendas.anterior!.data)} · ${fmtR(Number(vendas.mes))} no mês` : `${fmtR(Number(vendas.mes))} no mês`) : 'nenhuma venda sincronizada'} />
        <KPICard rotulo="resultado do mês" valor={fmtR(resultadoMes)} tom={resultadoMes >= 0 ? 'certo' : 'alerta'} detalhe={`entrou ${fmtR(Number(caixa.mes.entradas))} · saiu ${fmtR(Number(caixa.mes.saidas))}`} />
        <KPICard rotulo="CMV do mês" valor={pct === null ? fmtR(Number(cmv.cmv)) : `${pct.toFixed(1)}%`} tom={pct === null ? 'normal' : pct > 35 ? 'alerta' : pct > 30 ? 'atencao' : 'certo'}
          detalhe={pct === null ? '% indisponível: importar vendas Zig' : `${fmtR(Number(cmv.cmv))} · compras ${fmtR(Number(cmv.compras))}`} />
        <KPICard rotulo="contas atrasadas" valor={fmtR(Number(contas.vencidas.valor))} tom={contas.vencidas.qtd > 0 ? 'alerta' : 'certo'} detalhe={contas.vencidas.qtd > 0 ? plural(contas.vencidas.qtd, 'conta vencida', 'contas vencidas') : 'nenhuma'} onClick={() => scrollTo(refVencidas)} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
        <SectionCard title="Vendas · 14 noites" descricao={vendas ? `Bebidas ${fmtR(Number(vendas.bebidas))} · alimentos ${fmtR(Number(vendas.alimentos))} · ${vendas.transacoes} comandas` : 'Sem vendas Zig sincronizadas'} className="lg:col-span-2">
          {serieVendas.length > 0 ? <Barras serie={serieVendas.map(d => ({ chave: d.data, titulo: `${fmtData(d.data)} · ${fmtR(Number(d.total))}`, valores: [Number(d.total)] }))} max={maxVendas} destaqueUltima /> : <EmptyState icon={Inbox} title="Nada para mostrar" compact />}
        </SectionCard>
        <SectionCard title="Radar do dia" noPadding>
          <RadarRow icon={AlertTriangle} label="Contas atrasadas" valor={fmtR(Number(contas.vencidas.valor))} sub={plural(contas.vencidas.qtd, 'conta', 'contas')} sev={contas.vencidas.qtd > 0 ? 'red' : 'ok'} onClick={() => scrollTo(refVencidas)} />
          <RadarRow icon={Calendar} label="Vence em 7 dias" valor={fmtR(Number(contas.semana.valor))} sub={plural(contas.semana.qtd, 'conta', 'contas')} sev={contas.semana.qtd > 0 ? 'amber' : 'ok'} onClick={() => scrollTo(refSemana)} />
          <RadarRow icon={Package} label="Estoque em alerta" valor={String(estoqueAlertas)} sub={`${estoque.negativos} negativos · ${estoque.abaixo_minimo} abaixo do mínimo`} sev={Number(estoque.negativos) > 0 ? 'red' : estoqueAlertas > 0 ? 'amber' : 'ok'} onClick={() => setShowEstoqueDetalhe(true)} />
          <RadarRow icon={Music} label="Cachês em aberto" valor={fmtR(Number(equipe.caches.valor))} sub={plural(equipe.caches.qtd, 'músico', 'músicos')} sev={(equipe.caches.lista ?? []).some(m => vencido(m.data)) ? 'red' : equipe.caches.qtd > 0 ? 'amber' : 'ok'} onClick={() => scrollTo(refMusicos)} />
          <RadarRow icon={Briefcase} label="Extras em aberto" valor={fmtR(Number(equipe.extras.valor))} sub={plural(equipe.extras.qtd, 'extra', 'extras')} sev={(equipe.extras.lista ?? []).some(e => vencido(e.data)) ? 'red' : equipe.extras.qtd > 0 ? 'amber' : 'ok'} onClick={() => scrollTo(refExtras)} />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <SectionCard title="Caixa do mês" descricao="Últimos 14 dias, sem transferências">
          <div className="flex flex-col gap-1 mb-3">
            <div className="flex justify-between"><span className="t-caption">Entradas</span><span className="t-body num texto-certo" style={{ fontWeight: 600 }}>{fmtR(Number(caixa.mes.entradas))}</span></div>
            <div className="flex justify-between"><span className="t-caption">Saídas</span><span className="t-body num texto-perigo" style={{ fontWeight: 600 }}>{fmtR(Number(caixa.mes.saidas))}</span></div>
            <div className="flex justify-between pt-1" style={{ borderTop: '1px solid var(--border-subtle)' }}><span className="t-caption">Resultado</span><span className="t-body num" style={{ fontWeight: 700, color: resultadoMes >= 0 ? 'var(--gold)' : 'var(--danger-text)' }}>{fmtR(resultadoMes)}</span></div>
          </div>
          {serieCaixa.length > 0 && <Barras serie={serieCaixa.map(d => ({ chave: d.data, titulo: `${fmtData(d.data)} · +${fmtR(Number(d.entradas))} / -${fmtR(Number(d.saidas))}`, valores: [Number(d.entradas), Number(d.saidas)] }))} max={maxCaixa} />}
        </SectionCard>
        <SectionCard title="Estoque" descricao="Valor a custo médio e compras do mês">
          <div className="flex flex-col gap-1">
            <div className="flex justify-between"><span className="t-caption">Valor em estoque</span><span className="t-body num" style={{ fontWeight: 600 }}>{fmtR(Number(estoque.valor_total))}</span></div>
            <div className="flex justify-between"><span className="t-caption">Compras no mês</span><span className="t-body num" style={{ fontWeight: 600 }}>{fmtR(Number(cmv.compras))}</span></div>
            <div className="flex justify-between"><span className="t-caption">Negativos</span><span className={`t-body num ${estoque.negativos ? 'texto-perigo' : ''}`} style={{ fontWeight: 600 }}>{estoque.negativos}</span></div>
            <div className="flex justify-between"><span className="t-caption">Abaixo do mínimo</span><span className={`t-body num ${estoque.abaixo_minimo ? 'texto-atencao' : ''}`} style={{ fontWeight: 600 }}>{estoque.abaixo_minimo}</span></div>
          </div>
          {(cmv.avisos ?? []).length > 0 && <p className="t-caption mt-3" style={{ margin: 0 }}>{(cmv.avisos ?? []).join(' · ')}</p>}
        </SectionCard>
        <SectionCard title="Equipe" descricao={`${equipe.colaboradores.ativos} ativos · ${equipe.colaboradores.ferias} de férias · ${equipe.colaboradores.afastados} afastados`}>
          <div className="flex flex-wrap gap-1.5 mb-3">
            <Badge variant="success">{equipe.colaboradores.ativos} ativos</Badge>
            <Badge variant="info">{equipe.colaboradores.ferias} férias</Badge>
            <Badge variant={equipe.colaboradores.afastados ? 'danger' : 'neutral'}>{equipe.colaboradores.afastados} afastados</Badge>
          </div>
          <KPICard rotulo="custo RH em aberto" valor={fmtR(Number(equipe.rh_contas.valor))} detalhe={plural(equipe.rh_contas.qtd, 'conta', 'contas')} tom={equipe.rh_contas.qtd ? 'atencao' : 'normal'} onClick={() => setShowModalRH(true)} />
        </SectionCard>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
        <Lista refEl={refVencidas} titulo="Contas atrasadas" items={contas.lista_vencidas} vazio="Nenhuma conta atrasada" total={{ rotulo: 'Total atrasado', valor: fmtR(Number(contas.vencidas.valor)), tom: 'alerta' }}
          render={(c, i) => <Linha key={i} data={fmtData(c.vencimento)} atraso={diasAtraso(c.vencimento)} titulo={c.descricao} detalhe={c.categoria} valor={fmtR(Number(c.valor))} tomValor="alerta" />} />
        <Lista refEl={refSemana} titulo="Vence em 7 dias" items={contas.lista_semana} vazio="Nada vence nos próximos 7 dias" total={{ rotulo: 'Total da semana', valor: fmtR(Number(contas.semana.valor)) }}
          render={(c, i) => <Linha key={i} data={fmtData(c.vencimento)} titulo={c.descricao} detalhe={c.categoria} valor={fmtR(Number(c.valor))} />} />
        <Lista refEl={refMusicos} titulo="Cachês em aberto" items={equipe.caches.lista} vazio="Nenhum cachê pendente" total={{ rotulo: 'Total em aberto', valor: fmtR(Number(equipe.caches.valor)) }}
          render={(m, i) => <Linha key={i} data={fmtData(m.data)} atraso={vencido(m.data) ? diasAtraso(m.data) : 0} titulo={m.nome} detalhe={`total ${fmtR(Number(m.total))}${Number(m.pago) > 0 ? ` · pago ${fmtR(Number(m.pago))}` : ''}`} valor={fmtR(Number(m.saldo))} tomValor={vencido(m.data) ? 'alerta' : 'normal'} />} />
        <Lista refEl={refExtras} titulo="Extras em aberto" items={equipe.extras.lista} vazio="Nenhum extra pendente" total={{ rotulo: 'Total em aberto', valor: fmtR(Number(equipe.extras.valor)) }}
          render={(e, i) => <Linha key={i} data={fmtData(e.data)} atraso={vencido(e.data) ? diasAtraso(e.data) : 0} titulo={e.nome} detalhe={`${e.funcao ?? ''}${e.setor ? ` · ${e.setor}` : ''}`} valor={fmtR(Number(e.valor))} tomValor={vencido(e.data) ? 'alerta' : 'normal'} />} />
      </div>

      <Lista titulo="Eventos · próximos 14 dias" items={eventos} vazio="Nenhum evento fechado no período"
        render={(ev, i) => <Linha key={i} data={fmtData(ev.data)} titulo={ev.nome} detalhe={<>{ev.pessoas ? `${ev.pessoas} pessoas` : 'público não informado'}{ev.pagamento && ev.pagamento !== 'pago' && <span className="texto-atencao"> · pagamento {ev.pagamento}</span>}</>} valor={ev.valor ? fmtR(Number(ev.valor)) : '—'} />} />

      {/* Janelas */}
      <Modal aberto={showEstoqueDetalhe} onFechar={() => setShowEstoqueDetalhe(false)} titulo="Itens para reposição" descricao="Negativos, zerados e críticos movimentados nos últimos 3 dias" largura="md"
        rodape={<Button onClick={() => setShowEstoqueDetalhe(false)}>Fechar</Button>}>
        <div className="flex flex-wrap gap-1.5 mb-3">
          <Badge variant="danger">{itensAtencao.filter(i => i.status_alerta === 'negativo').length} negativos</Badge>
          <Badge variant="neutral">{itensAtencao.filter(i => i.status_alerta === 'zerado').length} zerados</Badge>
          <Badge variant="warning">{itensAtencao.filter(i => i.status_alerta === 'critico').length} críticos</Badge>
        </div>
        {itensAtencao.length === 0 ? <EmptyState icon={Package} title="Nada em alerta" compact /> : (
          <div className="overflow-y-auto" style={{ maxHeight: '55vh' }}>
            {itensAtencao.map((item, i) => (
              <div key={i} className="py-2 flex items-start gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                <div className="flex-1 min-w-0">
                  <p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{item.nome}</p>
                  <p className="t-caption truncate" style={{ margin: 0 }}>{item.estoque_nome}{item.categoria && ` · ${item.categoria}`}{item.ultima_mov && ` · mov. ${new Date(item.ultima_mov + 'T12:00').toLocaleDateString('pt-BR')}`}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className={`t-body num ${Number(item.saldo_real) < 0 ? 'texto-perigo' : Number(item.saldo_real) === 0 ? '' : 'texto-atencao'}`} style={{ margin: 0, fontWeight: 600 }}>{Number(item.saldo_real ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })} {item.unidade_medida}</p>
                  {item.estoque_minimo > 0 && <p className="t-caption" style={{ margin: 0 }}>mín. {item.estoque_minimo}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      <Modal aberto={showModalRH} onFechar={() => setShowModalRH(false)} titulo="Custo RH em aberto" descricao={`${plural(equipe.rh_contas.qtd, 'conta', 'contas')} · ${fmtR(Number(equipe.rh_contas.valor))}`} largura="md"
        rodape={<Button onClick={() => setShowModalRH(false)}>Fechar</Button>}>
        {(equipe.rh_contas.lista ?? []).length === 0 ? <EmptyState icon={Inbox} title="Nenhuma conta de RH em aberto" compact /> : (
          <div className="overflow-y-auto" style={{ maxHeight: '55vh' }}>
            {(equipe.rh_contas.lista ?? []).map((c, i) => <Linha key={i} data={fmtData(c.vencimento)} atraso={vencido(c.vencimento) ? diasAtraso(c.vencimento) : 0} titulo={c.descricao} detalhe={c.categoria} valor={fmtR(Number(c.valor))} tomValor={vencido(c.vencimento) ? 'alerta' : 'normal'} />)}
          </div>
        )}
      </Modal>

      {/* O chat tem moldura própria (cabeçalho e fechar); aqui só o véu. */}
      {showChatIA && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setShowChatIA(false)}>
          <div className="w-full max-w-3xl" onClick={e => e.stopPropagation()}><ChatFinanceiroIA onClose={() => setShowChatIA(false)} /></div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
