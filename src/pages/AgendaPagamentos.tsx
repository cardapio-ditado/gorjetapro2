import React, { useCallback, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import { ArrowRight, Check, ChevronDown, ChevronLeft, ChevronRight, Plus, Printer, RefreshCw, Search, Settings2, Undo2, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Badge, Button, Combobox, EmptyState, IconButton, Input, KPICard, Modal, PageHeader, SectionCard, Select } from '../components/ui';
import type { BadgeVariante, OpcaoCombo } from '../components/ui';

dayjs.locale('pt-br');

/**
 * Agenda de pagamentos (Kadu, 22-23/11/2026): a folha do dia, no jeito da planilha.
 *
 * 1. Fechamento de caixa: venda bruta da ZIG, entradas digitadas (dinheiro, cartão, Pix/Inter,
 *    bônus, desconto) e pagamentos do caixa (o que saiu do dinheiro da noite).
 * 2. Valores a pagar, nos grupos da planilha: o Contas a Pagar em aberto, extras e músicos com
 *    saldo no módulo e o que alguém digitou no fim de um grupo. A seta manda para o dia.
 * 3. Pagamentos do dia: a lista que se forma, com quem colocou, a forma e a situação.
 *    Só o diretor autoriza. "Paguei" registra quem pagou.
 *
 * A agenda NÃO dá baixa: o pagamento fica ligado à conta, diária ou show e serve de apoio para
 * a conciliação ("aguardando baixa" até a baixa acontecer). Tudo pelas funções fn_agp_*.
 */

type Forma = 'pix' | 'dinheiro' | 'cartao';
type TipoEntrada = 'dinheiro' | 'cartao' | 'pix' | 'bonus' | 'desconto';
interface Grupo { id: string; nome: string }
interface Aberto {
  chave: string; grupo: string; origem: 'conta' | 'extra' | 'musico' | 'avulso'; nome: string; detalhe: string | null;
  data: string; n: number; saldo: number; reservado: number; aguardando: number;
  itens: { d: string; data: string; saldo: number }[] | null;
}
interface Entrada { id: string; tipo: TipoEntrada; descricao: string | null; valor: number; por: string | null; em: string; meu: boolean }
interface Item {
  id: string; data: string; grupo: string | null; chave: string | null; descricao: string; valor: number; forma: Forma; caixa: boolean;
  obs: string | null; status: 'pedido' | 'autorizado' | 'recusado' | 'pago'; ligado: boolean; refs: string[] | null; meu: boolean;
  pedido_por: string | null; pedido_em: string; decidido_por: string | null; decidido_em: string | null; motivo_recusa: string | null;
  pago_por: string | null; pago_em: string | null; paguei_eu: boolean | null; sem_baixa: boolean;
}
interface Folha {
  hoje: string; data: string; autoriza: boolean; eu: string; editavel: boolean; grupos: Grupo[];
  venda: { noite: number | null; final: boolean | null; dia: number | null };
  abertos: Aberto[]; entradas: Entrada[]; itens: Item[];
}

const brl = (v: number) => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dataCurta = (d: string) => dayjs(d).format('DD/MM');
const hora = (d: string | null) => (d ? dayjs(d).format('HH:mm') : '');
/** "1.234,56", "1234,56" ou "1234.56" → número. */
const lerValor = (t: string) => { const s = t.trim().replace(/[R$\s]/g, ''); return Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); };
const paraCampo = (v: number) => v.toFixed(2).replace('.', ',');
const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const livre = (a: Aberto) => Math.max(0, Number(a.saldo) - Number(a.reservado) - Number(a.aguardando));
const capital = (s: string) => s.replace(/^./, c => c.toUpperCase());

const TIPOS: { id: TipoEntrada; rotulo: string }[] = [
  { id: 'dinheiro', rotulo: 'Dinheiro' }, { id: 'cartao', rotulo: 'Cartão' }, { id: 'pix', rotulo: 'Pix/Inter' },
  { id: 'bonus', rotulo: 'Bônus' }, { id: 'desconto', rotulo: 'Desconto' },
];
const ROTULO_TIPO = Object.fromEntries(TIPOS.map(t => [t.id, t.rotulo])) as Record<TipoEntrada, string>;
/** Entra no dinheiro do dia; bônus e desconto são só informação. */
const ENTRA: TipoEntrada[] = ['dinheiro', 'cartao', 'pix'];
const FORMAS: { id: Forma; rotulo: string }[] = [{ id: 'pix', rotulo: 'Pix' }, { id: 'dinheiro', rotulo: 'Dinheiro' }, { id: 'cartao', rotulo: 'Cartão' }];
const ROTULO_FORMA = Object.fromEntries(FORMAS.map(f => [f.id, f.rotulo])) as Record<Forma, string>;
const SITUACAO: Record<Item['status'], { rotulo: string; variante: BadgeVariante }> = {
  pedido: { rotulo: 'aguardando o diretor', variante: 'warning' },
  autorizado: { rotulo: 'autorizado', variante: 'info' },
  recusado: { rotulo: 'recusado', variante: 'danger' },
  pago: { rotulo: 'pago', variante: 'success' },
};

const traduzir = (m: string) => (m.includes('sem acesso') ? 'Seu usuário não tem acesso à agenda de pagamentos (precisa do módulo Financeiro).' : capital(m));

/** Como a linha aparece: prazo da conta, ou há quantos dias o extra/músico espera. */
function quando(a: Aberto, hoje: string): { texto: string; tom: string } {
  const dias = dayjs(hoje).diff(dayjs(a.data), 'day');
  if (a.origem === 'conta') {
    if (dias > 0) return { texto: `venceu ${dataCurta(a.data)}`, tom: dias > 30 ? 'texto-perigo' : 'texto-atencao' };
    if (dias === 0) return { texto: 'vence hoje', tom: 'texto-atencao' };
    return { texto: `vence ${dataCurta(a.data)}`, tom: '' };
  }
  if (a.origem === 'avulso') return { texto: a.detalhe ?? '', tom: '' };
  const qtd = a.origem === 'extra' ? `${a.n} diária${a.n === 1 ? '' : 's'}` : `${a.n} show${a.n === 1 ? '' : 's'}`;
  return { texto: `${qtd} · desde ${dataCurta(a.data)} (${dias} dia${dias === 1 ? '' : 's'})`, tom: dias > 7 ? 'texto-atencao' : '' };
}

const AgendaPagamentos: React.FC = () => {
  const [folha, setFolha] = useState<Folha | null>(null);
  const [data, setData] = useState<string | null>(null); // null = hoje
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [busca, setBusca] = useState('');
  const [abertos, setAbertos] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('agp-grupos-abertos') || '[]')); } catch { return new Set(); }
  });
  const [recusando, setRecusando] = useState<Item | null>(null);
  const [mapa, setMapa] = useState(false);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    const { data: j, error } = await supabase.rpc('fn_agp_ler', { p_data: data });
    setCarregando(false);
    if (error) { setErro(traduzir(error.message)); return; }
    setErro(null); setFolha(j as Folha);
  }, [data]);

  useEffect(() => { carregar(); }, [carregar]);
  // Três pessoas mexem na mesma folha: recarrega quando a tela volta a ficar à vista.
  useEffect(() => {
    const aoVoltar = () => { if (document.visibilityState === 'visible') carregar(true); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, [carregar]);

  /** Roda uma ação, mostra o erro em português e recarrega. */
  const agir = useCallback(async (fn: string, args: Record<string, unknown>, feito?: string): Promise<boolean> => {
    setOcupado(true); setAviso(null);
    const { error } = await supabase.rpc(fn, args);
    setOcupado(false);
    if (error) { setErro(traduzir(error.message)); return false; }
    setErro(null); if (feito) setAviso(feito);
    await carregar(true);
    return true;
  }, [carregar]);

  const alternarGrupo = (id: string) => setAbertos(s => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id);
    try { localStorage.setItem('agp-grupos-abertos', JSON.stringify([...n])); } catch { /* sem armazenamento */ }
    return n;
  });

  const hoje = folha?.hoje ?? dayjs().format('YYYY-MM-DD');
  const dia = folha?.data ?? hoje;
  const ehHoje = dia === hoje;
  const editavel = !!folha?.editavel;
  const nomeGrupo = useMemo(() => Object.fromEntries((folha?.grupos ?? []).map(g => [g.id, g.nome])), [folha]);

  // ── Valores a pagar, por grupo ──
  const t = semAcento(busca.trim());
  const porGrupo = useMemo(() => {
    const m = new Map<string, Aberto[]>();
    for (const a of folha?.abertos ?? []) {
      if (livre(a) <= 0.004 && a.reservado <= 0.004 && a.aguardando <= 0.004) continue;
      if (t && !semAcento(a.nome).includes(t) && !semAcento(a.detalhe ?? '').includes(t)) continue;
      m.set(a.grupo, [...(m.get(a.grupo) ?? []), a]);
    }
    return m;
  }, [folha, t]);
  const totalAPagar = useMemo(() => (folha?.abertos ?? []).reduce((s, a) => s + livre(a), 0), [folha]);

  // ── Fechamento ──
  const entradas = folha?.entradas ?? [];
  const somaTipo = (tp: TipoEntrada) => entradas.filter(e => e.tipo === tp).reduce((s, e) => s + Number(e.valor), 0);
  const entrou = ENTRA.reduce((s, tp) => s + somaTipo(tp), 0);
  const itens = folha?.itens ?? [];
  const caixa = itens.filter(i => i.caixa);
  const doDia = itens.filter(i => !i.caixa);
  const totalCaixa = caixa.reduce((s, i) => s + Number(i.valor), 0);
  const valendo = doDia.filter(i => i.status !== 'recusado');
  const totalDia = valendo.reduce((s, i) => s + Number(i.valor), 0);
  const totalPago = doDia.filter(i => i.status === 'pago').reduce((s, i) => s + Number(i.valor), 0);
  const pedidos = doDia.filter(i => i.status === 'pedido');
  const saldoDia = entrou - totalCaixa - totalDia;

  const opcoesBusca: OpcaoCombo[] = useMemo(() => (folha?.abertos ?? [])
    .filter(a => livre(a) > 0.004)
    .map(a => ({ id: a.chave, nome: a.nome, sub: `${nomeGrupo[a.grupo] ?? a.grupo}${a.detalhe && a.origem === 'conta' ? ` · ${a.detalhe}` : ''} · falta ${brl(livre(a))}` })), [folha, nomeGrupo]);

  const mandarParaODia = (a: Aberto) => agir('fn_agp_item_add', { p_data: hoje, p_chave: a.chave, p_valor: Number(livre(a).toFixed(2)), p_forma: 'pix' },
    `${a.nome}: ${brl(livre(a))} nos pagamentos do dia.${folha?.autoriza ? '' : ' Aguardando o diretor.'}`);

  const imprimir = () => folha && imprimirFolha(folha);

  return (
    <div className="pb-16">
      <PageHeader caminho={['Financeiro', 'Agenda de pagamentos']} title="Agenda de pagamentos"
        subtitle={capital(dayjs(dia).format('dddd, DD [de] MMMM [de] YYYY'))}
        actions={<>
          <div className="flex items-center gap-1">
            <IconButton aria-label="Dia anterior" onClick={() => setData(dayjs(dia).subtract(1, 'day').format('YYYY-MM-DD'))}><ChevronLeft size={16} /></IconButton>
            {ehHoje ? <Badge variant="gold">Hoje</Badge> : <Button variante="discreto" tamanho="sm" onClick={() => setData(null)}>Voltar para hoje</Button>}
            <IconButton aria-label="Dia seguinte" disabled={ehHoje} onClick={() => { const d = dayjs(dia).add(1, 'day').format('YYYY-MM-DD'); setData(d >= hoje ? null : d); }}><ChevronRight size={16} /></IconButton>
          </div>
          {folha?.autoriza && <IconButton aria-label="Grupos das categorias" title="Grupos das categorias" onClick={() => setMapa(true)}><Settings2 size={16} /></IconButton>}
          <IconButton aria-label="Atualizar" onClick={() => carregar()} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton>
          <Button icone={<Printer size={16} />} onClick={imprimir} disabled={!folha}>Imprimir</Button>
        </>} />

      {erro && <div className="aviso aviso-perigo mb-3 flex items-start justify-between gap-3" role="alert"><span>{erro}</span><button className="text-xs underline" onClick={() => setErro(null)}>fechar</button></div>}
      {aviso && !erro && <div className="aviso aviso-certo mb-3" role="status">{aviso}</div>}
      {!folha && !erro && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>}

      {folha && <>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
          <KPICard rotulo="venda bruta (ZIG)" valor={folha.venda.noite != null ? brl(folha.venda.noite) : folha.venda.dia != null ? brl(folha.venda.dia) : '—'}
            detalhe={folha.venda.noite != null ? (folha.venda.final ? `noite de ${dataCurta(dia)}, fechada` : `noite de ${dataCurta(dia)}, parcial`) : 'sem venda na ZIG'} tom="destaque" />
          <KPICard rotulo="entrou" valor={brl(entrou)} detalhe="dinheiro, cartão e Pix digitados" tom="certo" />
          <KPICard rotulo="pagamentos" valor={brl(totalDia + totalCaixa)} detalhe={`do dia ${brl(totalDia)} · caixa ${brl(totalCaixa)}`} />
          <KPICard rotulo="saldo do dia" valor={brl(saldoDia)} detalhe="entrou menos pagamentos" tom={saldoDia < 0 ? 'alerta' : 'certo'} />
        </div>

        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5 items-start">
          {/* Coluna da direita no computador; no celular vem primeiro */}
          <div className="flex flex-col gap-5 xl:order-2">
            <SectionCard title="Fechamento de caixa" descricao="O que entrou no dia e o que saiu do dinheiro do caixa." noPadding>
              <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                {editavel && <NovaEntrada ocupado={ocupado} onSalvar={(tipo, valor, desc) => agir('fn_agp_entrada_add', { p_data: dia, p_tipo: tipo, p_valor: valor, p_descricao: desc })} />}
                {!entradas.length && <p className="t-caption" style={{ margin: editavel ? '8px 0 0' : 0 }}>Nenhuma entrada digitada.</p>}
              </div>
              {entradas.map(e => (
                <div key={e.id} className="px-5 py-2 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <Badge variant={ENTRA.includes(e.tipo) ? 'success' : 'neutral'}>{ROTULO_TIPO[e.tipo]}</Badge>
                  <span className="flex-1 min-w-0 t-caption">{e.descricao ? `${e.descricao} · ` : ''}{e.por} às {hora(e.em)}</span>
                  <span className="t-body num" style={{ fontWeight: 600 }}>{brl(e.valor)}</span>
                  {editavel && (e.meu || folha.autoriza) && <IconButton aria-label="Apagar entrada" tom="perigo" disabled={ocupado} onClick={() => { if (window.confirm(`Apagar ${ROTULO_TIPO[e.tipo]} de ${brl(e.valor)}?`)) agir('fn_agp_entrada_del', { p_id: e.id }); }}><X size={14} /></IconButton>}
                </div>
              ))}
              <div className="px-5 py-3 grid grid-cols-3 gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
                {ENTRA.map(tp => <Resumo key={tp} rotulo={ROTULO_TIPO[tp]} valor={somaTipo(tp)} />)}
                <Resumo rotulo="Total que entrou" valor={entrou} forte />
                <Resumo rotulo="Bônus" valor={somaTipo('bonus')} />
                <Resumo rotulo="Desconto" valor={somaTipo('desconto')} />
              </div>

              <div className="px-5 pt-4 pb-2">
                <p className="t-subsec" style={{ margin: 0, fontSize: 15 }}>Pagamentos do caixa</p>
                <p className="t-caption" style={{ margin: '2px 0 8px' }}>Saiu do dinheiro da noite. Escolha a pessoa ou a conta para ligar.</p>
                {editavel && <LinhaRapida caixa opcoes={opcoesBusca} grupos={folha.grupos} ocupado={ocupado}
                  onSalvar={(chave, valor, desc, grupo) => agir('fn_agp_item_add', { p_data: dia, p_chave: chave, p_valor: valor, p_descricao: desc, p_grupo: grupo, p_caixa: true })} />}
              </div>
              {caixa.map(i => (
                <div key={i.id} className="px-5 py-2 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <span className="flex-1 min-w-0">
                    <span className="t-body" style={{ display: 'block' }}>{i.descricao}</span>
                    <span className="t-caption">{i.refs?.length && !(i.refs.length === 1 && i.descricao.includes(i.refs[0])) ? `${i.refs.join(' · ')} · ` : ''}{i.pedido_por} às {hora(i.pedido_em)}{i.sem_baixa ? ' · aguardando baixa' : ''}</span>
                  </span>
                  <span className="t-body num" style={{ fontWeight: 600 }}>{brl(i.valor)}</span>
                  {editavel && (i.meu || folha.autoriza) && <IconButton aria-label="Apagar pagamento do caixa" tom="perigo" disabled={ocupado} onClick={() => { if (window.confirm(`Apagar "${i.descricao}" (${brl(i.valor)})?`)) agir('fn_agp_item_del', { p_id: i.id }); }}><X size={14} /></IconButton>}
                </div>
              ))}
              <div className="px-5 py-3 flex justify-between t-body"><span>Total do caixa</span><span className="num" style={{ fontWeight: 700 }}>{brl(totalCaixa)}</span></div>
            </SectionCard>

            <SectionCard title="Pagamentos do dia" noPadding
              descricao={folha.autoriza ? 'O que você coloca já entra autorizado.' : 'Só o diretor autoriza. Depois, quem pagar marca "Paguei".'}
              action={folha.autoriza && pedidos.length > 0
                ? <Button tamanho="sm" variante="primario" icone={<Check size={14} />} disabled={ocupado} onClick={() => agir('fn_agp_decidir', { p_ids: pedidos.map(p => p.id), p_acao: 'autorizar' }, 'Tudo autorizado.')}>Autorizar tudo ({pedidos.length})</Button>
                : undefined}>
              {ehHoje && <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
                <LinhaRapida opcoes={opcoesBusca} grupos={folha.grupos} ocupado={ocupado}
                  onSalvar={(chave, valor, desc, grupo, forma) => agir('fn_agp_item_add', { p_data: hoje, p_chave: chave, p_valor: valor, p_descricao: desc, p_grupo: grupo, p_forma: forma })} />
              </div>}
              {!doDia.length && <div className="p-5"><EmptyState compact icon={ArrowRight} title="Nenhum pagamento no dia"
                description={ehHoje ? 'Digite acima, ou toque na seta de um item em "Valores a pagar".' : undefined} /></div>}
              {folha.grupos.map(g => {
                const lista = doDia.filter(i => (i.grupo ?? 'outros') === g.id);
                if (!lista.length) return null;
                const sub = lista.filter(i => i.status !== 'recusado').reduce((s, i) => s + Number(i.valor), 0);
                return (
                  <div key={g.id}>
                    <div className="px-5 py-2 flex justify-between" style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border-subtle)' }}>
                      <span className="t-label" style={{ fontWeight: 600 }}>{g.nome}</span>
                      <span className="t-label num" style={{ fontWeight: 600 }}>{brl(sub)}</span>
                    </div>
                    {lista.map(i => <LinhaItem key={i.id} i={i} hoje={hoje} autoriza={folha.autoriza} ocupado={ocupado} agir={agir} onRecusar={() => setRecusando(i)} />)}
                  </div>
                );
              })}
              <div className="px-5 py-3 flex flex-col gap-1" style={{ borderTop: '1px solid var(--border)' }}>
                <div className="flex justify-between t-body"><span>Total do dia</span><span className="num" style={{ fontWeight: 700 }}>{brl(totalDia)}</span></div>
                <div className="flex justify-between t-caption"><span>já pago</span><span className="num">{brl(totalPago)}</span></div>
                <div className="flex justify-between t-body"><span>Saldo (entrou − pagamentos)</span>
                  <span className={`num ${saldoDia < 0 ? 'texto-perigo' : 'texto-certo'}`} style={{ fontWeight: 700 }}>{brl(saldoDia)}</span></div>
              </div>
            </SectionCard>
          </div>

          <SectionCard title="Valores a pagar" descricao={`O que está em aberto, nos grupos da planilha. Falta ${brl(totalAPagar)}.`} noPadding className="xl:order-1">
            <div className="px-5 py-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
                <input className="input-dark w-full" style={{ paddingLeft: 32 }} placeholder="Buscar fornecedor, pessoa ou conta" aria-label="Buscar nos valores a pagar" value={busca} onChange={e => setBusca(e.target.value)} />
              </div>
            </div>
            {folha.grupos.map(g => {
              const lista = porGrupo.get(g.id) ?? [];
              if (!lista.length && (t || g.id === 'outros')) return null;
              const aberto = !!t || abertos.has(g.id);
              const total = lista.reduce((s, a) => s + livre(a), 0);
              return (
                <div key={g.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <button type="button" className="w-full px-5 py-3 flex items-center gap-2 text-left hover:bg-white/[0.04]" aria-expanded={aberto} onClick={() => alternarGrupo(g.id)}>
                    <ChevronDown size={16} style={{ transform: aberto ? 'none' : 'rotate(-90deg)', transition: 'transform .15s', flexShrink: 0 }} aria-hidden="true" />
                    <span className="flex-1 t-body" style={{ fontWeight: 600 }}>{g.nome}</span>
                    <span className="t-caption">{lista.length}</span>
                    <span className="t-body num" style={{ fontWeight: 700, minWidth: 110, textAlign: 'right' }}>{brl(total)}</span>
                  </button>
                  {aberto && <>
                    {lista.map(a => {
                      const q = quando(a, hoje);
                      const l = livre(a);
                      return (
                        <div key={a.chave} className="pl-11 pr-5 py-2 flex items-center gap-3" style={{ borderTop: '1px solid var(--border-subtle)' }}>
                          <span className="flex-1 min-w-0">
                            <span className="t-body" style={{ display: 'block' }}>{a.nome}{a.origem === 'conta' && a.detalhe ? <span className="t-caption"> · {a.detalhe}</span> : null}</span>
                            <span className={`t-caption ${q.tom}`} title={a.itens?.map(x => `${x.d}: ${brl(x.saldo)}`).join('\n')}>{q.texto}</span>
                            {(a.reservado > 0.004 || a.aguardando > 0.004) && <span className="t-caption" style={{ display: 'block' }}>
                              {a.reservado > 0.004 && `no dia ${brl(a.reservado)}`}{a.reservado > 0.004 && a.aguardando > 0.004 && ' · '}{a.aguardando > 0.004 && `pago, aguardando baixa ${brl(a.aguardando)}`}
                            </span>}
                          </span>
                          <span className="t-body num" style={{ fontWeight: 600, whiteSpace: 'nowrap' }}>{brl(l)}</span>
                          {a.origem === 'avulso' && editavel && <IconButton aria-label={`Tirar ${a.nome} da lista`} tom="perigo" disabled={ocupado}
                            onClick={() => { if (window.confirm(`Tirar "${a.nome}" dos valores a pagar?`)) agir('fn_agp_avulso_del', { p_id: a.chave.slice(2) }); }}><X size={14} /></IconButton>}
                          {ehHoje && <IconButton aria-label={`Colocar ${a.nome} nos pagamentos do dia`} title="Colocar nos pagamentos do dia" disabled={ocupado || l <= 0.004} onClick={() => mandarParaODia(a)}><ArrowRight size={16} /></IconButton>}
                        </div>
                      );
                    })}
                    {!['extras', 'musicos'].includes(g.id) && editavel && <NovoAvulso ocupado={ocupado} onSalvar={(desc, valor) => agir('fn_agp_avulso_add', { p_grupo: g.id, p_descricao: desc, p_valor: valor }, `${desc}: colocado em ${g.nome}.`)} />}
                    {['extras', 'musicos'].includes(g.id) && <p className="pl-11 pr-5 py-2 t-caption" style={{ margin: 0, borderTop: '1px solid var(--border-subtle)' }}>Vem do módulo de {g.nome}: lance a diária ou o show lá.</p>}
                  </>}
                </div>
              );
            })}
          </SectionCard>
        </div>
      </>}

      {recusando && <ModalRecusar i={recusando} ocupado={ocupado} onFechar={() => setRecusando(null)}
        onRecusar={async motivo => { if (await agir('fn_agp_decidir', { p_ids: [recusando.id], p_acao: 'recusar', p_motivo: motivo }, 'Recusado.')) setRecusando(null); }} />}
      {mapa && folha && <ModalGrupos grupos={folha.grupos} onFechar={() => { setMapa(false); carregar(true); }} />}
    </div>
  );
};

const Resumo: React.FC<{ rotulo: string; valor: number; forte?: boolean }> = ({ rotulo, valor, forte }) => (
  <div>
    <p className="t-caption" style={{ margin: 0 }}>{rotulo}</p>
    <p className="t-body num" style={{ margin: 0, fontWeight: forte ? 700 : 500 }}>{brl(valor)}</p>
  </div>
);

// ── Uma linha dos pagamentos do dia ─────────────────────────────────────────
const LinhaItem: React.FC<{
  i: Item; hoje: string; autoriza: boolean; ocupado: boolean;
  agir: (fn: string, args: Record<string, unknown>, feito?: string) => Promise<boolean>; onRecusar: () => void;
}> = ({ i, hoje, autoriza, ocupado, agir, onRecusar }) => {
  const [editando, setEditando] = useState(false);
  const [texto, setTexto] = useState('');
  const mexe = (i.status === 'pedido' || i.status === 'autorizado') && (i.meu || autoriza);
  const salvarValor = async () => {
    const v = lerValor(texto);
    if (!(v > 0)) return;
    if (Math.abs(v - Number(i.valor)) < 0.005 || await agir('fn_agp_item_editar', { p_id: i.id, p_valor: v })) setEditando(false);
  };
  return (
    <div className="px-5 py-3 flex flex-wrap items-center gap-x-3 gap-y-2" style={{ borderBottom: '1px solid var(--border-subtle)', opacity: i.status === 'recusado' ? 0.6 : 1 }}>
      <div className="flex-1 min-w-[200px]">
        <p className="t-body" style={{ margin: 0, fontWeight: 600 }}>
          {i.descricao}
          {i.data < hoje && i.status !== 'pago' && <> <Badge variant="warning">de {dataCurta(i.data)}</Badge></>}
        </p>
        {!!i.refs?.length && !(i.refs.length === 1 && i.descricao.includes(i.refs[0])) && <p className="t-caption" style={{ margin: 0 }}>{i.refs.join(' · ')}</p>}
        {i.obs && <p className="t-caption" style={{ margin: 0, fontStyle: 'italic' }}>“{i.obs}”</p>}
        <p className="t-caption" style={{ margin: 0 }}>
          colocado por {i.pedido_por ?? '?'} às {hora(i.pedido_em)}
          {i.decidido_por && i.status !== 'pedido' && (i.decidido_por !== i.pedido_por || i.status === 'recusado') && <> · {i.status === 'recusado' ? 'recusado' : 'autorizado'} por {i.decidido_por} às {hora(i.decidido_em)}</>}
          {i.motivo_recusa && <> ({i.motivo_recusa})</>}
          {i.status === 'pago' && <> · pago por {i.pago_por ?? '?'} às {hora(i.pago_em)}</>}
        </p>
      </div>
      {mexe
        ? <select className="input-dark" style={{ width: 'auto', height: 32, paddingTop: 0, paddingBottom: 0 }} aria-label="Forma" value={i.forma} disabled={ocupado}
            onChange={e => agir('fn_agp_item_editar', { p_id: i.id, p_forma: e.target.value })}>
            {FORMAS.map(f => <option key={f.id} value={f.id}>{f.rotulo}</option>)}
          </select>
        : <span className="t-caption">{ROTULO_FORMA[i.forma]}</span>}
      {editando
        ? <span className="flex items-center gap-1">
            <input className="input-dark num" style={{ width: 110 }} inputMode="decimal" autoFocus aria-label="Valor" value={texto}
              onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') salvarValor(); if (e.key === 'Escape') setEditando(false); }} />
            <IconButton aria-label="Salvar valor" disabled={ocupado} onClick={salvarValor}><Check size={14} /></IconButton>
          </span>
        : <button type="button" className="t-body num" style={{ fontWeight: 700, minWidth: 100, textAlign: 'right', cursor: mexe ? 'pointer' : 'default', textDecoration: i.status === 'recusado' ? 'line-through' : undefined }}
            title={mexe ? 'Mudar o valor' : undefined} disabled={!mexe} onClick={() => { setTexto(paraCampo(Number(i.valor))); setEditando(true); }}>{brl(i.valor)}</button>}
      <div className="flex flex-wrap items-center gap-2 justify-end w-full sm:w-auto">
        {i.status === 'pago'
          ? (i.ligado ? (i.sem_baixa ? <Badge variant="gold">pago · aguardando baixa</Badge> : <Badge variant="success">pago · baixa feita</Badge>) : <Badge variant="success">pago</Badge>)
          : i.status === 'pedido' && autoriza ? null : <Badge variant={SITUACAO[i.status].variante}>{SITUACAO[i.status].rotulo}</Badge>}
        {i.status === 'pedido' && autoriza && <>
          <Button tamanho="sm" variante="perigo" disabled={ocupado} onClick={onRecusar}>Recusar</Button>
          <Button tamanho="sm" variante="primario" icone={<Check size={14} />} disabled={ocupado} onClick={() => agir('fn_agp_decidir', { p_ids: [i.id], p_acao: 'autorizar' })}>Autorizar</Button>
        </>}
        {i.status === 'autorizado' && <Button tamanho="sm" variante="primario" icone={<Check size={14} />} disabled={ocupado}
          onClick={() => agir('fn_agp_paguei', { p_id: i.id }, `${i.descricao}: marcado como pago. A baixa fica para a conciliação.`)}>Paguei</Button>}
        {i.status === 'pago' && (autoriza || i.paguei_eu) && <IconButton aria-label="Desfazer o pagamento" title="Desfazer o pagamento" disabled={ocupado}
          onClick={() => { if (window.confirm(`Desfazer o pagamento de "${i.descricao}"? Volta para autorizado.`)) agir('fn_agp_desfazer_pago', { p_id: i.id }); }}><Undo2 size={14} /></IconButton>}
        {mexe && <IconButton aria-label="Tirar dos pagamentos do dia" tom="perigo" disabled={ocupado}
          onClick={() => { if (window.confirm(`Tirar "${i.descricao}" dos pagamentos do dia?`)) agir('fn_agp_item_del', { p_id: i.id }); }}><X size={14} /></IconButton>}
      </div>
    </div>
  );
};

// ── Digitar um pagamento: busca o que está em aberto ou escreve livre ───────
const LinhaRapida: React.FC<{
  caixa?: boolean; opcoes: OpcaoCombo[]; grupos: Grupo[]; ocupado: boolean;
  onSalvar: (chave: string | null, valor: number, descricao: string | null, grupo: string | null, forma: Forma) => Promise<boolean>;
}> = ({ caixa, opcoes, grupos, ocupado, onSalvar }) => {
  const [versao, setVersao] = useState(0);
  const [chave, setChave] = useState('');
  const [livreTexto, setLivreTexto] = useState('');
  const [texto, setTexto] = useState('');
  const [grupo, setGrupo] = useState('');
  const [forma, setForma] = useState<Forma>('pix');
  const escolhido = opcoes.find(o => o.id === chave);
  const valor = lerValor(texto);
  const pronto = (!!chave || livreTexto.trim().length > 1) && valor > 0 && (!!chave || caixa || !!grupo);
  const limpar = () => { setChave(''); setLivreTexto(''); setTexto(''); setGrupo(''); setVersao(v => v + 1); };
  const salvar = async () => { if (pronto && await onSalvar(chave || null, valor, chave ? null : livreTexto.trim(), chave ? null : grupo || null, forma)) limpar(); };
  const escolher = (id: string) => {
    setChave(id); setLivreTexto('');
    const falta = /falta R\$\s*([\d.,]+)/.exec(opcoes.find(o => o.id === id)?.sub ?? '');
    if (falta && !texto) setTexto(falta[1]);
  };
  return (
    <div className="flex flex-wrap items-end gap-2" onKeyDown={e => { if (e.key === 'Enter' && (e.target as HTMLElement).tagName === 'INPUT' && (e.target as HTMLInputElement).inputMode === 'decimal') salvar(); }}>
      <div className="flex-1 min-w-[220px]">
        {livreTexto
          ? <div className="flex items-end gap-2">
              <Input className="flex-1" rotulo={caixa ? 'Pago a quem / o quê' : 'Pagamento'} value={livreTexto} onChange={e => setLivreTexto(e.target.value)} />
              <IconButton aria-label="Buscar no que está em aberto" onClick={limpar}><Search size={14} /></IconButton>
            </div>
          : <Combobox key={versao} rotulo={caixa ? 'Pago a quem / o quê' : 'Pagamento'} valor={chave} opcoes={opcoes} onEscolher={escolher}
              placeholder="Busque a conta, pessoa ou artista" onCriar={txt => { setChave(''); setLivreTexto(txt); }} rotuloCriar="digitado:" />}
        {escolhido && <p className="t-caption" style={{ margin: '2px 0 0' }}>{escolhido.sub}</p>}
      </div>
      {!chave && livreTexto && (
        <Select rotulo={caixa ? 'Grupo (opcional)' : 'Grupo'} value={grupo} onChange={e => setGrupo(e.target.value)} className="w-[170px]">
          <option value="">{caixa ? 'Sem grupo' : 'Escolha'}</option>
          {grupos.filter(g => !['extras', 'musicos'].includes(g.id)).map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
        </Select>
      )}
      <Input rotulo="Valor" inputMode="decimal" placeholder="0,00" value={texto} onChange={e => setTexto(e.target.value)} className="w-[120px]" />
      {!caixa && <Select rotulo="Forma" value={forma} onChange={e => setForma(e.target.value as Forma)} className="w-[110px]">
        {FORMAS.map(f => <option key={f.id} value={f.id}>{f.rotulo}</option>)}
      </Select>}
      <Button variante={caixa ? 'secundario' : 'primario'} icone={<Plus size={16} />} disabled={!pronto} carregando={ocupado} onClick={salvar}>{caixa ? 'Lançar' : 'Colocar'}</Button>
    </div>
  );
};

// ── Entrada do fechamento: tipo, valor, observação ─────────────────────────
const NovaEntrada: React.FC<{ ocupado: boolean; onSalvar: (tipo: TipoEntrada, valor: number, descricao: string | null) => Promise<boolean> }> = ({ ocupado, onSalvar }) => {
  const [tipo, setTipo] = useState<TipoEntrada>('cartao');
  const [texto, setTexto] = useState('');
  const [desc, setDesc] = useState('');
  const valor = lerValor(texto);
  const salvar = async () => { if (valor > 0 && await onSalvar(tipo, valor, desc.trim() || null)) { setTexto(''); setDesc(''); } };
  return (
    <div className="flex flex-col gap-2">
      <div role="group" aria-label="Tipo da entrada" className="flex flex-wrap gap-2">
        {TIPOS.map(tp => (
          <button key={tp.id} type="button" className={`chip ${tipo === tp.id ? 'chip-on' : ''}`} aria-pressed={tipo === tp.id} onClick={() => setTipo(tp.id)}>{tp.rotulo}</button>
        ))}
      </div>
      <div className="flex flex-wrap items-end gap-2" onKeyDown={e => { if (e.key === 'Enter') salvar(); }}>
        <Input rotulo={`Valor (${ROTULO_TIPO[tipo]})`} inputMode="decimal" placeholder="0,00" value={texto} onChange={e => setTexto(e.target.value)} className="w-[140px]" />
        <Input rotulo="Observação (opcional)" value={desc} onChange={e => setDesc(e.target.value)} className="flex-1 min-w-[160px]" />
        <Button icone={<Plus size={16} />} disabled={!(valor > 0)} carregando={ocupado} onClick={salvar}>Lançar</Button>
      </div>
    </div>
  );
};

// ── Linha em branco no fim de um grupo ──────────────────────────────────────
const NovoAvulso: React.FC<{ ocupado: boolean; onSalvar: (descricao: string, valor: number) => Promise<boolean> }> = ({ ocupado, onSalvar }) => {
  const [desc, setDesc] = useState('');
  const [texto, setTexto] = useState('');
  const valor = lerValor(texto);
  const pronto = desc.trim().length > 1 && valor > 0;
  const salvar = async () => { if (pronto && await onSalvar(desc.trim(), valor)) { setDesc(''); setTexto(''); } };
  return (
    <div className="pl-11 pr-5 py-2 flex items-center gap-2" style={{ borderTop: '1px solid var(--border-subtle)' }} onKeyDown={e => { if (e.key === 'Enter') salvar(); }}>
      <input className="input-dark flex-1 min-w-0" placeholder="Digitar item que não está no sistema" aria-label="Novo item" value={desc} onChange={e => setDesc(e.target.value)} />
      <input className="input-dark num" style={{ width: 110 }} inputMode="decimal" placeholder="0,00" aria-label="Valor do novo item" value={texto} onChange={e => setTexto(e.target.value)} />
      <IconButton aria-label="Adicionar item" disabled={!pronto || ocupado} onClick={salvar}><Plus size={16} /></IconButton>
    </div>
  );
};

const ModalRecusar: React.FC<{ i: Item; ocupado: boolean; onFechar: () => void; onRecusar: (motivo: string | null) => void }> = ({ i, ocupado, onFechar, onRecusar }) => {
  const [motivo, setMotivo] = useState('');
  return (
    <Modal aberto onFechar={onFechar} travado={ocupado} titulo={`Recusar · ${i.descricao}`} descricao={`${brl(i.valor)}, colocado por ${i.pedido_por ?? '?'}. Volta para os valores a pagar.`}
      rodape={<><Button variante="discreto" onClick={onFechar} disabled={ocupado}>Cancelar</Button><Button variante="perigo" carregando={ocupado} onClick={() => onRecusar(motivo.trim() || null)}>Recusar</Button></>}>
      <Input rotulo="Motivo (opcional)" autoFocus value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ex.: fica para sexta" />
    </Modal>
  );
};

// ── Em que grupo cai cada categoria (só o diretor muda) ─────────────────────
interface Categoria { id: string; nome: string; pai: string | null; grupo: string; proprio: boolean; abertas: number }
const ModalGrupos: React.FC<{ grupos: Grupo[]; onFechar: () => void }> = ({ grupos, onFechar }) => {
  const [lista, setLista] = useState<Categoria[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [so, setSo] = useState(true);
  useEffect(() => { supabase.rpc('fn_agp_mapa').then(({ data, error }) => (error ? setErro(traduzir(error.message)) : setLista((data ?? []) as Categoria[]))); }, []);
  const mudar = async (c: Categoria, grupo: string) => {
    const { error } = await supabase.rpc('fn_agp_mapa_definir', { p_categoria: c.id, p_grupo: grupo });
    if (error) { setErro(traduzir(error.message)); return; }
    setLista(l => l && l.map(x => (x.id === c.id ? { ...x, grupo, proprio: true } : x)));
  };
  const visiveis = (lista ?? []).filter(c => !so || c.abertas > 0);
  return (
    <Modal aberto onFechar={onFechar} largura="lg" titulo="Grupos das categorias" descricao="Em que grupo da agenda cai cada categoria do Contas a Pagar."
      rodape={<Button variante="primario" onClick={onFechar}>Pronto</Button>}>
      {erro && <div className="aviso aviso-perigo mb-3">{erro}</div>}
      <label className="flex items-center gap-2 t-body mb-3 cursor-pointer"><input type="checkbox" checked={so} onChange={e => setSo(e.target.checked)} /> Só as categorias com conta em aberto</label>
      {!lista ? <p className="t-body">Carregando…</p> : (
        <div style={{ maxHeight: 420, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
          {visiveis.map(c => (
            <div key={c.id} className="px-3 py-2 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <span className="flex-1 min-w-0">
                <span className="t-body" style={{ display: 'block' }}>{c.nome}</span>
                <span className="t-caption">{c.pai ? `${c.pai} · ` : ''}{c.abertas} em aberto{c.proprio ? '' : ' · segue o grupo do pai'}</span>
              </span>
              <select className="input-dark" style={{ width: 210 }} aria-label={`Grupo de ${c.nome}`} value={c.grupo} onChange={e => mudar(c, e.target.value)}>
                {grupos.map(g => <option key={g.id} value={g.id}>{g.nome}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
};

// ── Impressão no formato da planilha ────────────────────────────────────────
function imprimirFolha(f: Folha) {
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
  const soma = (l: { valor: number }[]) => l.reduce((s, x) => s + Number(x.valor), 0);
  const entra = (tp: TipoEntrada) => soma(f.entradas.filter(e => e.tipo === tp));
  const entrou = ENTRA.reduce((s, tp) => s + entra(tp), 0);
  const caixa = f.itens.filter(i => i.caixa);
  const dia = f.itens.filter(i => !i.caixa && i.status !== 'recusado');
  const linha = (a: string, b: string, c = '') => `<tr><td>${esc(a)}</td><td>${esc(c)}</td><td class="v">${esc(b)}</td></tr>`;
  const situacao = (i: Item) => (i.status === 'pago' ? `pg · ${ROTULO_FORMA[i.forma]}${i.pago_por ? ` · ${i.pago_por}` : ''}` : i.status === 'autorizado' ? 'autorizado' : 'aguardando autorização');
  const grupos = f.grupos.map(g => {
    const l = dia.filter(i => (i.grupo ?? 'outros') === g.id);
    if (!l.length) return '';
    return `<h3>${esc(g.nome)}</h3><table><tr><th>Descrição</th><th>Observações</th><th class="v">Valor</th></tr>${l.map(i => linha(i.descricao, brl(i.valor), situacao(i))).join('')}<tr class="t"><td></td><td>TOTAL</td><td class="v">${brl(soma(l))}</td></tr></table>`;
  }).join('');
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Pagamentos ${dataCurta(f.data)}</title><style>
    body{font:12px/1.4 Arial,sans-serif;color:#111;margin:24px} h1{font-size:16px;margin:0} h2{font-size:13px;margin:16px 0 4px;border-bottom:2px solid #111}
    h3{font-size:12px;margin:12px 0 2px;text-transform:uppercase} table{width:100%;border-collapse:collapse} td,th{border-bottom:1px solid #ccc;padding:3px 4px;text-align:left}
    .v{text-align:right;white-space:nowrap} .t td{font-weight:700;border-bottom:none} .cab{display:flex;justify-content:space-between;align-items:flex-end}
    .grande{font-size:14px;font-weight:700} @media print{body{margin:0}}</style></head><body>
    <div class="cab"><div><h1>DITADO POPULAR</h1><div>Rua Senador Vilas Boas, 89 · Cuiabá-MT</div></div><div class="grande">${dayjs(f.data).format('DD/MM/YYYY')}</div></div>
    <h2>FECHAMENTO DE CAIXA</h2><table>
      ${linha('Venda bruta (ZIG)', f.venda.noite != null ? brl(f.venda.noite) : f.venda.dia != null ? brl(f.venda.dia) : '—')}
      ${TIPOS.map(t => linha(t.rotulo, brl(entra(t.id)))).join('')}
      <tr class="t"><td>TOTAL QUE ENTROU</td><td></td><td class="v">${brl(entrou)}</td></tr></table>
    <h3>Pagamentos do caixa</h3><table>${caixa.map(i => linha(i.descricao, brl(i.valor), i.pedido_por ?? '')).join('') || linha('Nenhum', '')}
      <tr class="t"><td></td><td>TOTAL</td><td class="v">${brl(soma(caixa))}</td></tr></table>
    <h2>PAGAMENTOS AUTORIZADOS PELA DIRETORIA · DIRETOR: KADU</h2>${grupos || '<p>Nenhum pagamento no dia.</p>'}
    <h2>TOTAL GERAL DE PAGAMENTOS DO DIA</h2><table>
      ${linha('Pagamentos do dia', brl(soma(dia)))}${linha('Pagamentos do caixa', brl(soma(caixa)))}
      <tr class="t"><td>ENTROU MENOS PAGAMENTOS</td><td></td><td class="v">${brl(entrou - soma(dia) - soma(caixa))}</td></tr></table>
    <script>window.onload=()=>{window.print()}</script></body></html>`;
  const w = window.open('', '_blank');
  if (!w) { window.alert('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.'); return; }
  w.document.open(); w.document.write(html); w.document.close();
}

export default AgendaPagamentos;
