import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import { Ban, Check, ChevronLeft, ChevronRight, HandCoins, ListChecks, Pencil, Plus, RefreshCw, Search, Undo2, Wallet } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Badge, Button, Chip, Combobox, EmptyState, IconButton, Input, KPICard, Modal, PageHeader, SectionCard, Segmented, Select, Textarea, Toolbar } from '../components/ui';
import type { BadgeVariante, OpcaoCombo } from '../components/ui';

dayjs.locale('pt-br');

/**
 * Fila de pagamentos (Kadu, 22/11/2026). Substitui a planilha diária "valores a pagar".
 *
 * A fila se monta sozinha com o que está em aberto no Contas a Pagar, no módulo de Extras e no
 * de Músicos, mais os avulsos que alguém colocar. Em cada credor ficam os sinais (cobrando,
 * prioridade, prometido para, anotação). "Pagar hoje" põe na pauta do dia, o diretor autoriza
 * e quem pagou marca "Paguei". Tudo com o nome de quem fez, pelo login.
 *
 * A fila NÃO dá baixa: o "Paguei" é a referência para a conciliação. Enquanto a baixa não
 * acontece no financeiro (ou no módulo), o valor aparece como "aguardando baixa".
 * Tudo passa pelas funções fn_fila_* (migração 20261122180000).
 */

type Tipo = 'conta' | 'rh' | 'extra' | 'musico' | 'avulso';
interface Item { o: 'conta' | 'extra' | 'musico' | 'avulso'; id: string; d: string; det: string | null; data: string; saldo: number; ag: number; res: number }
interface Sinal { cobrando: boolean; prioridade: boolean; prometido_para: string | null; anotacao: string | null; por: string | null; em: string | null }
interface Credor {
  credor: string; nome: string; tipo: Tipo; pix: string | null; saldo: number; aguardando: number; reservado: number;
  desde: string; casa: boolean | null; itens: Item[]; sinal: Sinal | null;
}
interface ItemOrdem { o: string; id: string; v: number; d: string; data: string }
interface Ordem {
  id: string; data: string; credor: string; nome: string; tipo: Tipo; valor: number; itens: ItemOrdem[]; obs: string | null;
  status: 'pedido' | 'autorizado' | 'recusado' | 'pago' | 'cancelado'; meu: boolean;
  pedido_por: string | null; pedido_em: string; decidido_por: string | null; decidido_em: string | null; motivo_recusa: string | null;
  pago_por: string | null; pago_em: string | null; pago_data: string | null; pago_conta: string | null; paguei_eu: boolean | null;
  cancelado_por: string | null; cancelado_em: string | null;
}
interface Fila {
  hoje: string; data: string; autoriza: boolean; eu: string; credores: Credor[]; ordens: Ordem[];
  dia: { disponivel: number | null; por: string | null; em: string | null } | null;
  contas: { id: string; nome: string; tipo: string }[];
}

const brl = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataCurta = (d: string) => dayjs(d).format('DD/MM');
const hora = (d: string | null) => (d ? dayjs(d).format('HH:mm') : '');
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
/** "1.234,56" ou "1234.56" → número. */
const lerValor = (t: string) => { const s = t.trim().replace(/[R$\s]/g, ''); return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); };
const paraCampo = (v: number) => v.toFixed(2).replace('.', ',');
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const livreDe = (c: Credor) => Math.max(0, Number(c.saldo) - Number(c.aguardando) - Number(c.reservado));
const livreItem = (i: Item) => Math.max(0, Number(i.saldo) - Number(i.ag) - Number(i.res));

const TIPO: Record<Tipo, { rotulo: string; variante: BadgeVariante; um: string; varios: string }> = {
  conta: { rotulo: 'Fornecedor', variante: 'neutral', um: 'conta', varios: 'contas' },
  rh: { rotulo: 'RH', variante: 'wine', um: 'conta', varios: 'contas' },
  extra: { rotulo: 'Extra', variante: 'info', um: 'diária', varios: 'diárias' },
  musico: { rotulo: 'Músico', variante: 'gold', um: 'show', varios: 'shows' },
  avulso: { rotulo: 'Avulso', variante: 'default', um: 'item', varios: 'itens' },
};
const FILTROS_TIPO: { valor: 'todos' | Tipo; rotulo: string }[] = [
  { valor: 'todos', rotulo: 'Todos' }, { valor: 'conta', rotulo: 'Fornecedores' }, { valor: 'rh', rotulo: 'RH' },
  { valor: 'extra', rotulo: 'Extras' }, { valor: 'musico', rotulo: 'Músicos' }, { valor: 'avulso', rotulo: 'Avulsos' },
];

/** Por que este credor está nesta posição: quanto menor o nível, mais em cima. */
function urgencia(c: Credor, hoje: string): { nivel: number; texto: string; tom: '' | 'texto-perigo' | 'texto-atencao' } {
  const dias = dayjs(hoje).diff(dayjs(c.desde), 'day');
  const s = c.sinal;
  if (s?.prometido_para && s.prometido_para <= hoje) {
    return { nivel: 0, texto: s.prometido_para === hoje ? 'prometido para hoje' : `prometido para ${dataCurta(s.prometido_para)}, passou`, tom: 'texto-perigo' };
  }
  if (s?.cobrando) return { nivel: 1, texto: 'está cobrando', tom: 'texto-perigo' };
  if (s?.prioridade) return { nivel: 2, texto: 'prioridade', tom: 'texto-atencao' };
  if (c.tipo === 'extra' || c.tipo === 'musico') {
    const prazo = c.tipo === 'extra' && !c.casa ? 2 : 7;
    if (dias > prazo) return { nivel: 3, texto: `prazo de ${prazo} dias estourado (${dias} dias)`, tom: 'texto-atencao' };
    return { nivel: 5, texto: dias <= 0 ? 'de hoje' : `há ${plural(dias, 'dia', 'dias')}`, tom: '' };
  }
  if (c.tipo === 'avulso') return { nivel: 4, texto: dias <= 0 ? 'colocado hoje' : `colocado há ${plural(dias, 'dia', 'dias')}`, tom: '' };
  if (dias > 0) return { nivel: 4, texto: `mais antiga venceu há ${plural(dias, 'dia', 'dias')}`, tom: dias > 30 ? 'texto-perigo' : 'texto-atencao' };
  return { nivel: 5, texto: dias === 0 ? 'vence hoje' : `vence em ${dataCurta(c.desde)}`, tom: '' };
}

const ERROS: [string, string][] = [
  ['sem acesso', 'Seu usuário não tem acesso à fila de pagamentos (precisa do módulo Financeiro).'],
  ['só o diretor autoriza', 'Só o diretor autoriza.'],
];
const traduzir = (m: string) => ERROS.find(([k]) => m.includes(k))?.[1] ?? (m.charAt(0).toUpperCase() + m.slice(1));

const FilaPagamentos: React.FC = () => {
  const [fila, setFila] = useState<Fila | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [visao, setVisao] = useState<'fila' | 'pauta'>('fila');
  const [data, setData] = useState<string | null>(null); // null = hoje
  const [busca, setBusca] = useState('');
  const [tipo, setTipo] = useState<'todos' | Tipo>('todos');
  const [so, setSo] = useState<'' | 'cobrando' | 'prioridade' | 'prometido' | 'aguardando'>('');
  const [pedindo, setPedindo] = useState<Credor | null>(null);
  const [detalhe, setDetalhe] = useState<string | null>(null);
  const [pagando, setPagando] = useState<Ordem | null>(null);
  const [recusando, setRecusando] = useState<Ordem | null>(null);
  const [avulso, setAvulso] = useState(false);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    const { data: j, error } = await supabase.rpc('fn_fila_ler', { p_data: data });
    setCarregando(false);
    if (error) { setErro(traduzir(error.message)); return; }
    setErro(null); setFila(j as Fila);
  }, [data]);

  useEffect(() => { carregar(); }, [carregar]);
  // Três pessoas mexem na mesma fila: recarrega quando a tela volta a ficar à vista.
  useEffect(() => {
    const aoVoltar = () => { if (document.visibilityState === 'visible') carregar(true); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [carregar]);

  /** Roda uma ação da fila, mostra o erro em português e recarrega. */
  const agir = useCallback(async (fn: string, args: Record<string, unknown>, feito?: string): Promise<boolean> => {
    setOcupado(true); setAviso(null);
    const { error } = await supabase.rpc(fn, args);
    setOcupado(false);
    if (error) { setErro(traduzir(error.message)); return false; }
    setErro(null); if (feito) setAviso(feito);
    await carregar(true);
    return true;
  }, [carregar]);

  const hoje = fila?.hoje ?? dayjs().format('YYYY-MM-DD');
  const ehHoje = !data || data === hoje;

  const mudarSinal = (c: Credor, mudanca: Partial<Sinal>, feito?: string) => {
    const s: Sinal = { cobrando: false, prioridade: false, prometido_para: null, anotacao: null, por: null, em: null, ...(c.sinal ?? {}), ...mudanca };
    // Mostra na hora; o banco confirma em seguida.
    setFila(f => f && ({ ...f, credores: f.credores.map(x => (x.credor === c.credor ? { ...x, sinal: { ...s, por: f.eu, em: new Date().toISOString() } } : x)) }));
    return agir('fn_fila_sinal', { p_credor: c.credor, p_cobrando: s.cobrando, p_prioridade: s.prioridade, p_prometido_para: s.prometido_para, p_anotacao: s.anotacao }, feito);
  };

  const lista = useMemo(() => {
    if (!fila) return [];
    const t = semAcento(busca.trim());
    return fila.credores
      .map(c => ({ c, u: urgencia(c, fila.hoje), livre: livreDe(c) }))
      .filter(({ c, livre }) => {
        if (tipo !== 'todos' && c.tipo !== tipo) return false;
        if (t && !semAcento(c.nome).includes(t) && !c.itens.some(i => semAcento(i.d).includes(t))) return false;
        if (so === 'cobrando') return !!c.sinal?.cobrando;
        if (so === 'prioridade') return !!c.sinal?.prioridade;
        if (so === 'prometido') return !!c.sinal?.prometido_para;
        if (so === 'aguardando') return c.aguardando > 0.004;
        return livre > 0.004 || c.reservado > 0.004;
      })
      // O que já está inteiro na pauta desce para o fim: o que falta decidir fica em cima.
      .sort((a, b) => Number(a.livre <= 0.004) - Number(b.livre <= 0.004) || a.u.nivel - b.u.nivel || a.c.desde.localeCompare(b.c.desde) || b.livre - a.livre);
  }, [fila, busca, tipo, so]);

  const totais = useMemo(() => {
    const cs = fila?.credores ?? [];
    const cobrando = cs.filter(c => c.sinal?.cobrando);
    return {
      falta: cs.reduce((a, c) => a + livreDe(c) + Number(c.reservado), 0), credores: cs.filter(c => livreDe(c) + Number(c.reservado) > 0.004).length,
      cobrando: cobrando.reduce((a, c) => a + livreDe(c), 0), cobrandoN: cobrando.length,
      aguardando: cs.reduce((a, c) => a + Number(c.aguardando), 0), aguardandoN: cs.filter(c => c.aguardando > 0.004).length,
    };
  }, [fila]);

  const ordens = fila?.ordens ?? [];
  const pauta = useMemo(() => {
    const de = (s: Ordem['status'][]) => ordens.filter(o => s.includes(o.status));
    const soma = (l: Ordem[]) => l.reduce((a, o) => a + Number(o.valor), 0);
    const pedidos = de(['pedido']), autorizados = de(['autorizado']), pagos = de(['pago']), fora = de(['recusado', 'cancelado']);
    return { pedidos, autorizados, pagos, fora, vPedidos: soma(pedidos), vAutorizados: soma(autorizados), vPagos: soma(pagos) };
  }, [ordens]);
  const naPauta = pauta.vPedidos + pauta.vAutorizados + pauta.vPagos;
  const disponivel = fila?.dia?.disponivel ?? null;
  const credorDetalhe = fila?.credores.find(c => c.credor === detalhe) ?? null;
  /** A baixa de uma ordem paga ainda não aconteceu se algum item dela continua "aguardando". */
  const semBaixa = (o: Ordem) => {
    const c = fila?.credores.find(x => x.credor === o.credor);
    return !!c && o.itens.some(i => i.o !== 'avulso' && c.itens.some(x => x.id === i.id && x.ag > 0.004));
  };

  return (
    <div>
      <PageHeader title="Fila de pagamentos" subtitle="O que a casa deve, quem pediu, quem autorizou e quem pagou. A baixa continua no financeiro."
        actions={<Button variante="primario" icone={<Plus size={16} />} onClick={() => setAvulso(true)}>Adicionar</Button>} />

      <Toolbar className="mb-4">
        <Segmented rotulo="Visão" valor={visao} onMudar={v => { setVisao(v); setAviso(null); }}
          opcoes={[{ valor: 'fila', rotulo: 'Fila' }, { valor: 'pauta', rotulo: `Pauta do dia${pauta.pedidos.length + pauta.autorizados.length ? ` (${pauta.pedidos.length + pauta.autorizados.length})` : ''}` }]} />
        <Toolbar.Espaco />
        <IconButton aria-label="Atualizar" onClick={() => carregar()} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton>
      </Toolbar>

      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {aviso && !erro && <div className="aviso aviso-certo mb-3" role="status">{aviso}</div>}
      {!fila && !erro && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>}

      {fila && visao === 'fila' && <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <KPICard rotulo="falta pagar" valor={brl(totais.falta)} detalhe={plural(totais.credores, 'credor', 'credores')} tom="atencao" />
          <KPICard rotulo="cobrando" valor={brl(totais.cobrando)} detalhe={plural(totais.cobrandoN, 'credor', 'credores')} tom={totais.cobrandoN ? 'alerta' : 'normal'} onClick={() => setSo(so === 'cobrando' ? '' : 'cobrando')} />
          <KPICard rotulo="na pauta de hoje" valor={brl(pauta.vPedidos + pauta.vAutorizados)} detalhe={pauta.pedidos.length ? `${pauta.pedidos.length} esperando autorização` : `${pauta.autorizados.length} para pagar`} onClick={() => setVisao('pauta')} />
          <KPICard rotulo="aguardando baixa" valor={brl(totais.aguardando)} detalhe={`pago pela fila, ${plural(totais.aguardandoN, 'credor', 'credores')}`} tom={totais.aguardandoN ? 'destaque' : 'normal'} onClick={() => setSo(so === 'aguardando' ? '' : 'aguardando')} />
        </div>

        <Toolbar className="mb-3">
          {FILTROS_TIPO.map(f => <Chip key={f.valor} ligado={tipo === f.valor} onMudar={() => setTipo(f.valor)}>{f.rotulo}</Chip>)}
          <span aria-hidden="true" style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <Chip tom="perigo" ligado={so === 'cobrando'} onMudar={l => setSo(l ? 'cobrando' : '')}>Cobrando</Chip>
          <Chip tom="atencao" ligado={so === 'prioridade'} onMudar={l => setSo(l ? 'prioridade' : '')}>Prioridade</Chip>
          <Chip tom="atencao" ligado={so === 'prometido'} onMudar={l => setSo(l ? 'prometido' : '')}>Prometido</Chip>
          <Chip tom="ouro" ligado={so === 'aguardando'} onMudar={l => setSo(l ? 'aguardando' : '')}>Aguardando baixa</Chip>
          <div className="relative w-full sm:w-64 sm:ml-auto">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
            <input className="input-dark w-full" style={{ paddingLeft: 32 }} placeholder="Buscar credor ou conta" aria-label="Buscar" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
        </Toolbar>

        {!lista.length
          ? <EmptyState icon={Wallet} title="Nada na fila" variant={busca || tipo !== 'todos' || so ? 'filtered' : 'empty'}
              description={busca || tipo !== 'todos' || so ? 'Nada bate com o filtro.' : 'Não há nada em aberto para pagar.'} />
          : <SectionCard noPadding>
              {lista.map(({ c, u, livre }) => (
                <div key={c.credor} className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <div className="flex items-start gap-3">
                    <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setDetalhe(c.credor)} aria-label={`Ver ${c.nome}`}>
                      <p className="t-body" style={{ margin: 0, fontWeight: 600 }}>
                        {c.nome} <Badge variant={TIPO[c.tipo].variante}>{TIPO[c.tipo].rotulo}</Badge>
                        {c.sinal?.prometido_para && <> <Badge variant={c.sinal.prometido_para <= fila.hoje ? 'danger' : 'warning'}>prometido {dataCurta(c.sinal.prometido_para)}</Badge></>}
                      </p>
                      <p className="t-caption" style={{ margin: 0 }}>
                        {plural(c.itens.length, TIPO[c.tipo].um, TIPO[c.tipo].varios)} · <span className={u.tom}>{u.texto}</span>
                        {c.reservado > 0.004 && <> · na pauta {brl(c.reservado)}</>}
                        {c.aguardando > 0.004 && <> · <span style={{ color: 'var(--gold-light)' }}>aguardando baixa {brl(c.aguardando)}</span></>}
                      </p>
                      {c.sinal?.anotacao && <p className="t-caption" style={{ margin: 0, fontStyle: 'italic' }}>“{c.sinal.anotacao}”{c.sinal.por ? ` · ${c.sinal.por}` : ''}</p>}
                    </button>
                    <span className="t-body num" style={{ fontWeight: 700, textAlign: 'right', whiteSpace: 'nowrap' }}>{brl(livre)}</span>
                    <IconButton aria-label={`Detalhes, data prometida e anotação de ${c.nome}`} title="Detalhes, data prometida e anotação" onClick={() => setDetalhe(c.credor)}><Pencil size={14} /></IconButton>
                  </div>
                  <div className="flex items-center gap-2 mt-2">
                    <Chip tom="perigo" ligado={!!c.sinal?.cobrando} onMudar={l => mudarSinal(c, { cobrando: l })}>Cobrando</Chip>
                    <Chip tom="atencao" ligado={!!c.sinal?.prioridade} onMudar={l => mudarSinal(c, { prioridade: l })}>Prioridade</Chip>
                    <span className="flex-grow" />
                    <Button tamanho="sm" icone={<HandCoins size={14} />} disabled={livre <= 0.004} onClick={() => setPedindo(c)}>Pagar hoje</Button>
                  </div>
                </div>
              ))}
            </SectionCard>}
      </>}

      {fila && visao === 'pauta' && <>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <IconButton aria-label="Dia anterior" onClick={() => setData(dayjs(data ?? hoje).subtract(1, 'day').format('YYYY-MM-DD'))}><ChevronLeft size={16} /></IconButton>
          <span className="t-subsec" style={{ minWidth: 190, textAlign: 'center' }}>{dayjs(fila.data).format('dddd, DD/MM').replace(/^./, x => x.toUpperCase())}</span>
          <IconButton aria-label="Dia seguinte" disabled={ehHoje} onClick={() => { const d = dayjs(data ?? hoje).add(1, 'day').format('YYYY-MM-DD'); setData(d >= hoje ? null : d); }}><ChevronRight size={16} /></IconButton>
          {!ehHoje && <Button tamanho="sm" variante="discreto" onClick={() => setData(null)}>Hoje</Button>}
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <Disponivel valor={disponivel} por={fila.dia?.por ?? null} editavel={ehHoje} ocupado={ocupado}
            onSalvar={v => agir('fn_fila_disponivel', { p_valor: v }, 'Disponível do dia atualizado.')} />
          <KPICard rotulo="na pauta" valor={brl(naPauta)} detalhe={plural(pauta.pedidos.length + pauta.autorizados.length + pauta.pagos.length, 'pagamento', 'pagamentos')} />
          <KPICard rotulo="pago" valor={brl(pauta.vPagos)} detalhe={plural(pauta.pagos.length, 'pagamento', 'pagamentos')} tom="certo" />
          <KPICard rotulo={disponivel != null && disponivel - naPauta < 0 ? 'passou do disponível' : 'ainda cabe'} valor={disponivel == null ? '—' : brl(Math.abs(disponivel - naPauta))}
            detalhe={disponivel == null ? 'informe o disponível' : 'disponível menos a pauta'} tom={disponivel == null ? 'normal' : disponivel - naPauta < 0 ? 'alerta' : 'certo'} />
        </div>

        {!ordens.length && <EmptyState icon={ListChecks} title="Pauta vazia" description={ehHoje ? 'Na Fila, toque em "Pagar hoje" no que for para pagar.' : 'Nenhum pagamento foi colocado na pauta nesse dia.'}
          action={ehHoje ? { label: 'Ir para a fila', onClick: () => setVisao('fila') } : undefined} />}

        {pauta.pedidos.length > 0 && (
          <SectionCard noPadding className="mb-4" title="Esperando autorização" descricao={`${plural(pauta.pedidos.length, 'pedido', 'pedidos')} · ${brl(pauta.vPedidos)}`}
            action={fila.autoriza && pauta.pedidos.length > 1
              ? <Button tamanho="sm" variante="primario" icone={<Check size={14} />} carregando={ocupado} onClick={() => agir('fn_fila_ordem_decidir', { p_ids: pauta.pedidos.map(o => o.id), p_acao: 'autorizar' }, 'Tudo autorizado.')}>Autorizar tudo</Button>
              : undefined}>
            {pauta.pedidos.map(o => (
              <LinhaOrdem key={o.id} o={o} hoje={hoje}>
                {fila.autoriza
                  ? <>
                      <Button tamanho="sm" variante="perigo" icone={<Ban size={14} />} disabled={ocupado} onClick={() => setRecusando(o)}>Recusar</Button>
                      <Button tamanho="sm" variante="primario" icone={<Check size={14} />} disabled={ocupado} onClick={() => agir('fn_fila_ordem_decidir', { p_ids: [o.id], p_acao: 'autorizar' })}>Autorizar</Button>
                    </>
                  : <>
                      <Badge variant="warning">esperando o diretor</Badge>
                      {o.meu && <Button tamanho="sm" variante="discreto" icone={<Undo2 size={14} />} disabled={ocupado} onClick={() => agir('fn_fila_ordem_voltar', { p_id: o.id }, 'Tirado da pauta.')}>Tirar</Button>}
                    </>}
              </LinhaOrdem>
            ))}
          </SectionCard>
        )}

        {pauta.autorizados.length > 0 && (
          <SectionCard noPadding className="mb-4" title="Autorizado, para pagar" descricao={`${plural(pauta.autorizados.length, 'pagamento', 'pagamentos')} · ${brl(pauta.vAutorizados)}`}>
            {pauta.autorizados.map(o => (
              <LinhaOrdem key={o.id} o={o} hoje={hoje}>
                {(fila.autoriza || o.meu) && <Button tamanho="sm" variante="discreto" icone={<Undo2 size={14} />} disabled={ocupado} onClick={() => agir('fn_fila_ordem_voltar', { p_id: o.id }, 'Tirado da pauta.')}>Tirar</Button>}
                <Button tamanho="sm" variante="primario" icone={<Check size={14} />} disabled={ocupado} onClick={() => setPagando(o)}>Paguei</Button>
              </LinhaOrdem>
            ))}
          </SectionCard>
        )}

        {pauta.pagos.length > 0 && (
          <SectionCard noPadding className="mb-4" title="Pago" descricao={`${plural(pauta.pagos.length, 'pagamento', 'pagamentos')} · ${brl(pauta.vPagos)}`}>
            {pauta.pagos.map(o => (
              <LinhaOrdem key={o.id} o={o} hoje={hoje}>
                {o.itens.every(i => i.o === 'avulso') ? <Badge variant="neutral">avulso, sem baixa</Badge>
                  : semBaixa(o) ? <Badge variant="gold">aguardando baixa</Badge> : <Badge variant="success">baixa feita</Badge>}
                {(fila.autoriza || o.paguei_eu) && <Button tamanho="sm" variante="discreto" icone={<Undo2 size={14} />} disabled={ocupado} onClick={() => { if (window.confirm(`Desfazer o "Paguei" de ${o.nome} (${brl(o.valor)})? Volta para "autorizado".`)) agir('fn_fila_ordem_voltar', { p_id: o.id }, 'Voltou para autorizado.'); }}>Desfazer</Button>}
              </LinhaOrdem>
            ))}
          </SectionCard>
        )}

        {pauta.fora.length > 0 && (
          <SectionCard noPadding title="Recusado ou tirado da pauta">
            {pauta.fora.map(o => <LinhaOrdem key={o.id} o={o} hoje={hoje}><Badge variant={o.status === 'recusado' ? 'danger' : 'neutral'}>{o.status === 'recusado' ? 'recusado' : 'tirado'}</Badge></LinhaOrdem>)}
          </SectionCard>
        )}
      </>}

      {pedindo && fila && <ModalPedir c={pedindo} autoriza={fila.autoriza} ocupado={ocupado} onFechar={() => setPedindo(null)}
        onPedir={async (valor, itens, obs) => {
          const ok = await agir('fn_fila_ordem_pedir', { p_credor: pedindo.credor, p_valor: valor, p_itens: itens, p_obs: obs },
            fila.autoriza ? `${pedindo.nome}: ${brl(valor)} na pauta, já autorizado.` : `${pedindo.nome}: ${brl(valor)} na pauta, esperando o diretor.`);
          if (ok) setPedindo(null);
        }} />}

      {credorDetalhe && fila && <ModalCredor c={credorDetalhe} hoje={fila.hoje} autoriza={fila.autoriza} ocupado={ocupado} onFechar={() => setDetalhe(null)}
        onSalvar={async (prometido, anotacao) => { if (await mudarSinal(credorDetalhe, { prometido_para: prometido, anotacao }, 'Anotação salva.')) setDetalhe(null); }}
        onTirarAvulso={id => { if (window.confirm('Tirar este avulso da fila?')) agir('fn_fila_avulso_cancelar', { p_id: id }, 'Avulso tirado da fila.'); }}
        onPagar={() => { setDetalhe(null); setPedindo(credorDetalhe); }} />}

      {pagando && fila && <ModalPaguei o={pagando} hoje={fila.hoje} contas={fila.contas} ocupado={ocupado} onFechar={() => setPagando(null)}
        onPagar={async (conta, dia) => { if (await agir('fn_fila_ordem_paguei', { p_id: pagando.id, p_conta_id: conta, p_data: dia }, `${pagando.nome}: ${brl(pagando.valor)} marcado como pago. A baixa fica para a conciliação.`)) setPagando(null); }} />}

      {recusando && <ModalRecusar o={recusando} ocupado={ocupado} onFechar={() => setRecusando(null)}
        onRecusar={async motivo => { if (await agir('fn_fila_ordem_decidir', { p_ids: [recusando.id], p_acao: 'recusar', p_motivo: motivo }, 'Pedido recusado.')) setRecusando(null); }} />}

      {avulso && fila && <ModalAvulso autoriza={fila.autoriza} ocupado={ocupado} onFechar={() => setAvulso(false)}
        onCriar={async (nome, fornecedorId, valor, motivo, jaPautar) => {
          setOcupado(true); setAviso(null);
          const { data: credor, error } = await supabase.rpc('fn_fila_avulso_criar', { p_favorecido: nome, p_valor: valor, p_motivo: motivo, p_fornecedor_id: fornecedorId });
          let falha = error?.message ?? null;
          if (!falha && jaPautar) {
            const r = await supabase.rpc('fn_fila_ordem_pedir', { p_credor: credor, p_valor: valor, p_itens: null, p_obs: null });
            falha = r.error?.message ?? null;
          }
          setOcupado(false);
          if (falha) { setErro(traduzir(falha)); await carregar(true); return; }
          setErro(null); setAviso(`${nome}: ${brl(valor)} colocado na fila${jaPautar ? ' e na pauta de hoje' : ''}.`); setAvulso(false);
          await carregar(true);
        }} />}
    </div>
  );
};

// ── Uma ordem da pauta: quem, o quê, quanto, e o rastro de quem fez cada passo ──
const LinhaOrdem: React.FC<{ o: Ordem; hoje: string; children?: React.ReactNode }> = ({ o, hoje, children }) => (
  <div className="px-4 py-3 flex flex-wrap items-center gap-x-3 gap-y-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
    <div className="flex-1 min-w-[200px]">
      <p className="t-body" style={{ margin: 0, fontWeight: 600 }}>
        {o.nome} <Badge variant={TIPO[o.tipo]?.variante ?? 'neutral'}>{TIPO[o.tipo]?.rotulo ?? o.tipo}</Badge>
        {o.data < hoje && (o.status === 'pedido' || o.status === 'autorizado') && <> <Badge variant="warning">ficou de {dataCurta(o.data)}</Badge></>}
      </p>
      <p className="t-caption" style={{ margin: 0 }}>{o.itens.map(i => i.d || 'sem descrição').join(' · ')}</p>
      {o.obs && <p className="t-caption" style={{ margin: 0, fontStyle: 'italic' }}>“{o.obs}”</p>}
      <p className="t-caption" style={{ margin: 0 }}>
        pedido por {o.pedido_por ?? '?'} às {hora(o.pedido_em)}
        {o.decidido_por && <> · {o.status === 'recusado' ? 'recusado' : 'autorizado'} por {o.decidido_por}{o.decidido_por !== o.pedido_por || o.status === 'recusado' ? ` às ${hora(o.decidido_em)}` : ''}</>}
        {o.motivo_recusa && <> ({o.motivo_recusa})</>}
        {o.status === 'pago' && <> · pago por {o.pago_por ?? '?'}{o.pago_conta ? `, ${o.pago_conta}` : ''}{o.pago_data ? `, ${dataCurta(o.pago_data)}` : ''}</>}
        {o.status === 'cancelado' && o.cancelado_por && <> · tirado por {o.cancelado_por}</>}
      </p>
    </div>
    <span className="t-body num" style={{ fontWeight: 700, minWidth: 104, textAlign: 'right' }}>{brl(o.valor)}</span>
    <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto justify-end">{children}</div>
  </div>
);

// ── Quanto tem para pagar hoje ──────────────────────────────────────────────
const Disponivel: React.FC<{ valor: number | null; por: string | null; editavel: boolean; ocupado: boolean; onSalvar: (v: number) => Promise<boolean> }> = ({ valor, por, editavel, ocupado, onSalvar }) => {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  if (!editando) {
    return <KPICard rotulo="disponível para pagar" valor={valor == null ? '—' : brl(valor)} tom="destaque"
      detalhe={valor == null ? (editavel ? 'toque para informar' : 'não informado') : `informado por ${por ?? '?'}`}
      onClick={editavel ? () => { setTexto(valor == null ? '' : paraCampo(valor)); setEditando(true); } : undefined} />;
  }
  const v = lerValor(texto);
  return (
    <div className="card p-3 flex flex-col gap-2">
      <Input rotulo="Disponível para pagar hoje" inputMode="decimal" autoFocus placeholder="0,00" value={texto} onChange={e => setTexto(e.target.value)} />
      <div className="flex gap-2 justify-end">
        <Button tamanho="sm" variante="discreto" onClick={() => setEditando(false)}>Cancelar</Button>
        <Button tamanho="sm" variante="primario" disabled={!(v >= 0) || texto.trim() === ''} carregando={ocupado} onClick={async () => { if (await onSalvar(v)) setEditando(false); }}>Salvar</Button>
      </div>
    </div>
  );
};

// ── "Pagar hoje": valor cheio ou parcial, nos itens escolhidos ──────────────
const ModalPedir: React.FC<{ c: Credor; autoriza: boolean; ocupado: boolean; onFechar: () => void; onPedir: (valor: number, itens: string[] | null, obs: string | null) => void }> = ({ c, autoriza, ocupado, onFechar, onPedir }) => {
  const livres = useMemo(() => c.itens.filter(i => livreItem(i) > 0.004), [c]);
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(livres.map(i => i.id)));
  const total = livres.filter(i => marcados.has(i.id)).reduce((a, i) => a + livreItem(i), 0);
  const [texto, setTexto] = useState(() => paraCampo(total));
  const [obs, setObs] = useState('');
  const valor = lerValor(texto);
  const invalido = !(valor > 0) || valor > total + 0.004;
  const marcar = (id: string) => {
    const n = new Set(marcados); if (n.has(id)) n.delete(id); else n.add(id);
    setMarcados(n); setTexto(paraCampo(livres.filter(i => n.has(i.id)).reduce((a, i) => a + livreItem(i), 0)));
  };
  return (
    <Modal aberto onFechar={onFechar} largura="md" travado={ocupado} titulo={`Pagar hoje · ${c.nome}`}
      descricao={autoriza ? 'Entra na pauta de hoje já autorizado.' : 'Entra na pauta de hoje e espera a autorização do diretor.'}
      rodape={<>
        <Button variante="discreto" onClick={onFechar} disabled={ocupado}>Cancelar</Button>
        <Button variante="primario" carregando={ocupado} disabled={invalido} onClick={() => onPedir(valor, marcados.size === livres.length ? null : [...marcados], obs.trim() || null)}>Colocar na pauta</Button>
      </>}>
      <div className="flex flex-col gap-3">
        {c.pix && <p className="t-caption" style={{ margin: 0 }}>PIX: <span style={{ color: 'var(--text-primary)' }}>{c.pix}</span></p>}
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, maxHeight: 240, overflowY: 'auto' }}>
          {livres.map(i => (
            <label key={i.id} className="flex items-center gap-3 px-3 py-2 cursor-pointer" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <input type="checkbox" checked={marcados.has(i.id)} onChange={() => marcar(i.id)} />
              <span className="flex-1 min-w-0">
                <span className="t-body" style={{ display: 'block' }}>{i.d || 'Sem descrição'}</span>
                <span className="t-caption">{i.o === 'conta' ? `vence ${dataCurta(i.data)}` : dataCurta(i.data)}{i.det ? ` · ${i.det}` : ''}</span>
              </span>
              <span className="t-body num" style={{ fontWeight: 600 }}>{brl(livreItem(i))}</span>
            </label>
          ))}
        </div>
        <Input rotulo="Valor para pagar hoje" inputMode="decimal" value={texto} onChange={e => setTexto(e.target.value)}
          erro={valor > total + 0.004 ? `Passa do que falta (${brl(total)}).` : undefined}
          dica={valor > 0 && valor < total - 0.004 ? `Parcial: fica faltando ${brl(total - valor)}. O valor cai primeiro nos mais antigos.` : `Total marcado: ${brl(total)}.`} />
        <Input rotulo="Observação (opcional)" value={obs} onChange={e => setObs(e.target.value)} placeholder="Ex.: ligou hoje cedo" />
      </div>
    </Modal>
  );
};

// ── Detalhes do credor: itens, prometido para e anotação ────────────────────
const ModalCredor: React.FC<{
  c: Credor; hoje: string; autoriza: boolean; ocupado: boolean; onFechar: () => void;
  onSalvar: (prometido: string | null, anotacao: string | null) => void; onTirarAvulso: (id: string) => void; onPagar: () => void;
}> = ({ c, hoje, ocupado, onFechar, onSalvar, onTirarAvulso, onPagar }) => {
  const [prometido, setPrometido] = useState(c.sinal?.prometido_para ?? '');
  const [anotacao, setAnotacao] = useState(c.sinal?.anotacao ?? '');
  return (
    <Modal aberto onFechar={onFechar} largura="md" travado={ocupado} titulo={c.nome}
      descricao={`${TIPO[c.tipo].rotulo} · falta ${brl(livreDe(c))}${c.pix ? ` · PIX ${c.pix}` : ''}`}
      rodape={<>
        <Button variante="discreto" onClick={onPagar} disabled={ocupado || livreDe(c) <= 0.004} icone={<HandCoins size={16} />}>Pagar hoje</Button>
        <Button variante="primario" carregando={ocupado} onClick={() => onSalvar(prometido || null, anotacao.trim() || null)}>Salvar</Button>
      </>}>
      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input rotulo="Prometido para" type="date" min={hoje} value={prometido} onChange={e => setPrometido(e.target.value)} dica="No dia, sobe para o topo da fila." />
          <div className="flex items-end">{prometido && <Button tamanho="sm" variante="discreto" onClick={() => setPrometido('')}>Tirar a data</Button>}</div>
        </div>
        <Textarea rotulo="Anotação" value={anotacao} onChange={e => setAnotacao(e.target.value)} placeholder="Ex.: ir pagando de 250 por semana" />
        {c.sinal?.por && <p className="t-caption" style={{ margin: 0 }}>Última marcação: {c.sinal.por}{c.sinal.em ? `, ${dayjs(c.sinal.em).format('DD/MM [às] HH:mm')}` : ''}</p>}
        <div style={{ border: '1px solid var(--border)', borderRadius: 8, maxHeight: 260, overflowY: 'auto' }}>
          {c.itens.map(i => (
            <div key={i.id} className="flex items-center gap-3 px-3 py-2" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <span className="flex-1 min-w-0">
                <span className="t-body" style={{ display: 'block' }}>{i.d || 'Sem descrição'}</span>
                <span className="t-caption">
                  {i.o === 'conta' ? `vence ${dataCurta(i.data)}` : dataCurta(i.data)}{i.det ? ` · ${i.det}` : ''}
                  {i.res > 0.004 && ` · na pauta ${brl(i.res)}`}{i.ag > 0.004 && ` · aguardando baixa ${brl(i.ag)}`}
                </span>
              </span>
              <span className="t-body num" style={{ fontWeight: 600 }}>{brl(i.saldo)}</span>
              {i.o === 'avulso' && <Button tamanho="sm" variante="discreto" disabled={ocupado} onClick={() => onTirarAvulso(i.id)}>Tirar</Button>}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
};

// ── "Paguei": de onde saiu e em que dia. Não dá baixa. ──────────────────────
const ModalPaguei: React.FC<{ o: Ordem; hoje: string; contas: Fila['contas']; ocupado: boolean; onFechar: () => void; onPagar: (conta: string, dia: string) => void }> = ({ o, hoje, contas, ocupado, onFechar, onPagar }) => {
  const [conta, setConta] = useState(() => contas.find(c => /stone/i.test(c.nome))?.id ?? '');
  const [dia, setDia] = useState(hoje);
  return (
    <Modal aberto onFechar={onFechar} travado={ocupado} titulo={`Paguei · ${o.nome}`} descricao={`${brl(o.valor)}. Fica registrado no seu nome. A baixa no financeiro é feita na conciliação.`}
      rodape={<>
        <Button variante="discreto" onClick={onFechar} disabled={ocupado}>Cancelar</Button>
        <Button variante="primario" carregando={ocupado} disabled={!conta} onClick={() => onPagar(conta, dia)}>Confirmar</Button>
      </>}>
      <div className="flex flex-col gap-3">
        <Select rotulo="De onde saiu" value={conta} onChange={e => setConta(e.target.value)}>
          <option value="">Escolha</option>
          {contas.map(c => <option key={c.id} value={c.id}>{c.tipo === 'cofre' ? `${c.nome} (dinheiro)` : c.nome}</option>)}
        </Select>
        <Input rotulo="Dia do pagamento" type="date" value={dia} max={hoje} min={dayjs(hoje).subtract(10, 'day').format('YYYY-MM-DD')} onChange={e => setDia(e.target.value || hoje)} />
      </div>
    </Modal>
  );
};

const ModalRecusar: React.FC<{ o: Ordem; ocupado: boolean; onFechar: () => void; onRecusar: (motivo: string | null) => void }> = ({ o, ocupado, onFechar, onRecusar }) => {
  const [motivo, setMotivo] = useState('');
  return (
    <Modal aberto onFechar={onFechar} travado={ocupado} titulo={`Recusar · ${o.nome}`} descricao={`${brl(o.valor)}, pedido por ${o.pedido_por ?? '?'}. Volta para a fila.`}
      rodape={<>
        <Button variante="discreto" onClick={onFechar} disabled={ocupado}>Cancelar</Button>
        <Button variante="perigo" carregando={ocupado} onClick={() => onRecusar(motivo.trim() || null)}>Recusar</Button>
      </>}>
      <Input rotulo="Motivo (opcional)" autoFocus value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: fica para sexta" />
    </Modal>
  );
};

// ── Adicionar o que não está no sistema ─────────────────────────────────────
const ModalAvulso: React.FC<{ autoriza: boolean; ocupado: boolean; onFechar: () => void; onCriar: (nome: string, fornecedorId: string | null, valor: number, motivo: string, jaPautar: boolean) => void }> = ({ autoriza, ocupado, onFechar, onCriar }) => {
  const [fornecedores, setFornecedores] = useState<OpcaoCombo[]>([]);
  const [fornecedorId, setFornecedorId] = useState('');
  const [livre, setLivre] = useState('');
  const [texto, setTexto] = useState('');
  const [motivo, setMotivo] = useState('');
  const [jaPautar, setJaPautar] = useState(true);
  useEffect(() => {
    supabase.from('fornecedores').select('id, nome').eq('status', 'ativo').in('tipo', ['geral', 'rh']).order('nome')
      .then(({ data }) => setFornecedores((data ?? []).map(f => ({ id: f.id as string, nome: String(f.nome).trim() }))));
  }, []);
  const valor = lerValor(texto);
  const nome = fornecedorId ? fornecedores.find(f => f.id === fornecedorId)?.nome ?? '' : livre;
  const pronto = !!nome && valor > 0 && motivo.trim().length > 1;
  return (
    <Modal aberto onFechar={onFechar} largura="md" travado={ocupado} titulo="Adicionar à fila" descricao="Para o que não está no Contas a Pagar. Fica registrado no seu nome."
      rodape={<>
        <Button variante="discreto" onClick={onFechar} disabled={ocupado}>Cancelar</Button>
        <Button variante="primario" carregando={ocupado} disabled={!pronto} onClick={() => onCriar(nome, fornecedorId || null, valor, motivo.trim(), jaPautar)}>Adicionar</Button>
      </>}>
      <div className="flex flex-col gap-3">
        {livre
          ? <div className="flex items-end gap-2">
              <Input className="flex-1" rotulo="Para quem" value={livre} onChange={e => setLivre(e.target.value)} dica="Fora do cadastro de fornecedores." />
              <Button tamanho="sm" variante="discreto" onClick={() => setLivre('')}>Buscar no cadastro</Button>
            </div>
          : <Combobox rotulo="Para quem" valor={fornecedorId} opcoes={fornecedores} onEscolher={setFornecedorId} placeholder="Digite o nome"
              onCriar={t => { setFornecedorId(''); setLivre(t); }} rotuloCriar="avulso para" dica="Escolha do cadastro, ou digite um nome novo." />}
        <Input rotulo="Valor" inputMode="decimal" placeholder="0,00" value={texto} onChange={e => setTexto(e.target.value)} />
        <Input rotulo="Motivo" value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: compras do mercado" />
        <label className="flex items-center gap-2 t-body cursor-pointer">
          <input type="checkbox" checked={jaPautar} onChange={e => setJaPautar(e.target.checked)} />
          Já colocar na pauta de hoje{autoriza ? ' (autorizado)' : ''}
        </label>
        <p className="t-caption" style={{ margin: 0 }}>Extra e músico não entram por aqui: lance a diária ou o show no módulo e aparece na fila sozinho.</p>
      </div>
    </Modal>
  );
};

export default FilaPagamentos;
