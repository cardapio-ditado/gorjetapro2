import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import {
  Check, ChevronLeft, ChevronRight, Download, GitMerge, History, MessageCircle, Pencil, Plus, RefreshCw, Search, Trash2,
  Undo2, UserPlus, Users, Wallet, X,
} from 'lucide-react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import { exportToExcel } from '../utils/reportGenerator';
import { urlWhatsApp } from '../components/inventory/comprasShared';
import {
  Badge, Button, Chip, EmptyState, IconButton, Input, KPICard, Modal, PageHeader, SectionCard, Segmented, Select,
  Textarea, Toolbar,
} from '../components/ui';
import {
  brl, carregarCadastros, dataCurta, emAberto, FORMAS, hora, LancarExtras, MOTIVOS, nomeDe, num, Resumo, SELECT_DIARIA, SELECT_DIARIA_PAG, SELECT_DIARIA_PAGO_EM, datasPagamento,
  SETORES, SITUACAO, situacao, temTelefone, type Diaria, type PessoaExtra, type Situacao, type TipoExtra,
} from '../components/extras/shared';

dayjs.locale('pt-br');

/**
 * Extras (diaristas): lançar, conferir presença e pagar.
 *
 * Cada diária gera a conta a pagar no Financeiro, na subcategoria do tipo
 * (trigger no banco). Os pagamentos daqui são controle à parte, como em
 * Músicos: não dão baixa no Financeiro.
 */

type Visao = 'diarias' | 'a_pagar' | 'pessoas' | 'valores';
type Filtro = 'todos' | 'a_pagar' | 'pago' | 'faltou';

interface Pagamento {
  id: string; tipo: 'pagamento' | 'saldo_inicial'; valor: number; data_pagamento: string; forma: string | null;
  observacao: string | null; criado_por_nome: string | null; estornado_em: string | null; estornado_por_nome: string | null;
  motivo_estorno: string | null;
}

const chave = (d: Diaria) => d.pessoa_id || d.nome.trim().toLowerCase();
const capital = (s: string) => s.replace(/^./, c => c.toUpperCase());

function textoExtrato(nome: string, abertas: Diaria[]): string {
  const linhas = abertas.map(d => `• ${dataCurta(d.data_trabalho)} ${d.funcao_temporaria}: ${brl(d.valor_diaria)}${d.valor_pago > 0 ? `, pago ${brl(d.valor_pago)}` : ''}, falta ${brl(d.saldo_restante)}`);
  return [`🧾 Ditado Popular · diárias de ${nome}`, '', ...linhas, '', `Total em aberto: ${brl(abertas.reduce((a, d) => a + d.saldo_restante, 0))}`].join('\n');
}

const Extras: React.FC = () => {
  const { usuario } = useAuth();
  // ?visao=a_pagar abre direto numa visão (o Portal do Gestor usa).
  const [visao, setVisao] = useState<Visao>(() => {
    const v = new URLSearchParams(window.location.search).get('visao') as Visao | null;
    return v && (['diarias', 'a_pagar', 'pessoas', 'valores'] as Visao[]).includes(v) ? v : 'diarias';
  });
  const [mes, setMes] = useState(dayjs().startOf('month'));
  const [inicio, setInicio] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [fim, setFim] = useState(dayjs().endOf('month').format('YYYY-MM-DD'));
  // Dia de pagamento: mostra as diárias pagas nesse dia, de qualquer data de trabalho.
  const [pagoEm, setPagoEm] = useState('');
  const [diarias, setDiarias] = useState<Diaria[]>([]);
  const [tipos, setTipos] = useState<TipoExtra[]>([]);
  const [pessoas, setPessoas] = useState<PessoaExtra[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [setorFiltro, setSetorFiltro] = useState('');
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [lancando, setLancando] = useState(false);
  const [editando, setEditando] = useState<Diaria | null>(null);
  const [pagando, setPagando] = useState<Diaria | null>(null);
  const [lote, setLote] = useState<{ titulo: string; diarias: Diaria[] } | null>(null);
  const [detalhe, setDetalhe] = useState<Diaria | null>(null);
  const [versao, setVersao] = useState(0);

  const irParaMes = (m: dayjs.Dayjs) => {
    setPagoEm('');
    setMes(m.startOf('month'));
    setInicio(m.startOf('month').format('YYYY-MM-DD'));
    setFim(m.endOf('month').format('YYYY-MM-DD'));
  };

  const carregar = async () => {
    setCarregando(true); setErro(null);
    try {
      const [{ data, error }, cad] = await Promise.all([
        pagoEm
          ? supabase.from('extras_freelancers').select(SELECT_DIARIA_PAGO_EM).eq('pagamentos.data_pagamento', pagoEm).is('pagamentos.estornado_em', null)
            .order('data_trabalho', { ascending: false }).order('nome')
          : supabase.from('extras_freelancers').select(SELECT_DIARIA_PAG).gte('data_trabalho', inicio).lte('data_trabalho', fim)
            .order('data_trabalho', { ascending: false }).order('nome'),
        carregarCadastros(),
      ]);
      if (error) throw error;
      setDiarias((data || []) as Diaria[]);
      setTipos(cad.tipos);
      setPessoas(cad.pessoas);
      setVersao(v => v + 1);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setCarregando(false);
    }
  };
  useEffect(() => { void carregar(); }, [inicio, fim, pagoEm]);
  useEffect(() => { setMarcados(new Set()); }, [inicio, fim, pagoEm]);

  // A diária aberta no histórico acompanha a lista; fora do período, busca sozinha.
  useEffect(() => {
    if (!detalhe) return;
    const achada = diarias.find(d => d.id === detalhe.id);
    if (achada) { setDetalhe(achada); return; }
    supabase.from('extras_freelancers').select(SELECT_DIARIA).eq('id', detalhe.id).maybeSingle()
      .then(({ data }) => setDetalhe(data ? (data as Diaria) : null));
  }, [diarias]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return diarias.filter(d => {
      if (t && !`${nomeDe(d)} ${d.funcao_temporaria} ${d.setor}`.toLowerCase().includes(t)) return false;
      if (setorFiltro && d.setor !== setorFiltro) return false;
      const s = situacao(d);
      if (filtro === 'a_pagar') return s === 'pendente' || s === 'parcial';
      if (filtro === 'pago') return s === 'pago';
      if (filtro === 'faltou') return s === 'faltou';
      return true;
    });
  }, [diarias, busca, filtro, setorFiltro]);

  const totais = useMemo(() => {
    const validas = diarias.filter(d => d.status_pagamento !== 'cancelado');
    const porSetor = new Map<string, number>();
    for (const d of validas) porSetor.set(d.setor, (porSetor.get(d.setor) || 0) + d.valor_diaria);
    const antigas = validas.filter(d => emAberto(d) && dayjs().diff(dayjs(d.data_trabalho), 'day') > 7);
    const pagoNoDia = pagoEm ? diarias.reduce((a, d) => a + (d.pagamentos || []).reduce((b, p) => b + Number(p.valor), 0), 0) : 0;
    return {
      pagoNoDia,
      diarias: validas.length,
      pessoas: new Set(validas.map(chave)).size,
      custo: validas.reduce((a, d) => a + d.valor_diaria, 0),
      pago: validas.reduce((a, d) => a + d.valor_pago, 0),
      aPagar: validas.filter(emAberto).reduce((a, d) => a + d.saldo_restante, 0),
      aPagarN: validas.filter(emAberto).length,
      faltas: diarias.filter(d => d.presenca === 'faltou').length,
      antigas: antigas.length,
      porSetor: [...porSetor.entries()].sort((a, b) => b[1] - a[1]),
    };
  }, [diarias, pagoEm]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = {};
    for (const d of diarias) { const s = situacao(d); c[s] = (c[s] || 0) + 1; }
    return c;
  }, [diarias]);

  const selecionadas = useMemo(() => diarias.filter(d => marcados.has(d.id) && emAberto(d)), [diarias, marcados]);
  const pessoasSelecionadas = new Set(selecionadas.map(chave)).size;
  const marcar = (id: string, ligado: boolean) => setMarcados(p => { const n = new Set(p); if (ligado) n.add(id); else n.delete(id); return n; });

  const excluir = async (d: Diaria) => {
    if (!window.confirm(`Excluir a diária de ${nomeDe(d)} em ${dataCurta(d.data_trabalho)}? A conta a pagar sai do Financeiro (se ainda não foi paga lá) e o histórico de pagamentos desta diária é apagado.`)) return;
    const { error } = await supabase.from('extras_freelancers').delete().eq('id', d.id);
    if (error) { setErro(error.message); return; }
    setAviso(`Diária de ${nomeDe(d)} excluída.`);
    await carregar();
  };

  const presenca = async (d: Diaria, p: Diaria['presenca']) => {
    const { error } = await supabase.from('extras_freelancers').update({ presenca: p }).eq('id', d.id);
    if (error) { setErro(error.message); return; }
    setAviso(p === 'faltou' ? `${nomeDe(d)}: marcado que faltou. A conta saiu do Financeiro.` : `${nomeDe(d)}: presença confirmada.`);
    await carregar();
  };

  const exportar = () => {
    if (!visiveis.length) { setErro('Não há diárias para exportar.'); return; }
    exportToExcel(visiveis.map(d => [
      dayjs(d.data_trabalho).format('DD/MM/YYYY'), nomeDe(d), d.funcao_temporaria, d.setor, d.motivo_contratacao || '', d.pedido_por || '',
      d.valor_diaria, d.valor_pago, Math.max(0, d.saldo_restante), datasPagamento(d).map(x => dayjs(x).format('DD/MM/YYYY')).join(', '),
      SITUACAO[situacao(d)].rotulo, d.lancado_por_nome || '',
    ]), pagoEm ? `extras-pagos-em-${dayjs(pagoEm).format('DD-MM-YYYY')}` : `extras-${dayjs(inicio).format('DD-MM-YYYY')}-a-${dayjs(fim).format('DD-MM-YYYY')}`,
    ['Data', 'Pessoa', 'Tipo', 'Setor', 'Motivo', 'Pediu', 'Diária', 'Pago', 'Falta', 'Pago em', 'Situação', 'Lançou']);
  };

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader caminho={['Operação', 'Extras']} title="Extras"
        subtitle="Diaristas: lançar, conferir presença e pagar. Cada diária gera a conta no Financeiro; os pagamentos daqui são controle à parte."
        actions={<div className="flex flex-wrap items-center gap-2">
          {visao === 'diarias' && <Button tamanho="sm" icone={<Download size={14} />} onClick={exportar}>Excel</Button>}
          <Button variante="primario" icone={<UserPlus size={16} />} onClick={() => setLancando(true)}>Lançar extras</Button>
        </div>} />

      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-certo mb-3">{aviso}</div>}

      <Toolbar className="mb-4">
        <Segmented<Visao> rotulo="Visão" valor={visao} onMudar={setVisao}
          opcoes={[{ valor: 'diarias', rotulo: 'Diárias' }, { valor: 'a_pagar', rotulo: 'A pagar' }, { valor: 'pessoas', rotulo: 'Pessoas' }, { valor: 'valores', rotulo: 'Tabela de valores' }]} />
        <Toolbar.Espaco />
        {(visao === 'diarias' || visao === 'a_pagar' || visao === 'pessoas') && (
          <div className="relative" style={{ minWidth: 220 }}>
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
            <input className="input-dark w-full" style={{ paddingLeft: 32 }} placeholder="Buscar pessoa" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
        )}
      </Toolbar>

      {visao === 'diarias' && <>
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <IconButton aria-label="Mês anterior" onClick={() => irParaMes(mes.subtract(1, 'month'))}><ChevronLeft size={16} /></IconButton>
          <span className="t-subsec" style={{ minWidth: 170, textAlign: 'center' }}>{capital(mes.format('MMMM [de] YYYY'))}</span>
          <IconButton aria-label="Próximo mês" onClick={() => irParaMes(mes.add(1, 'month'))}><ChevronRight size={16} /></IconButton>
          <Button tamanho="sm" variante="discreto" onClick={() => irParaMes(dayjs())}>Hoje</Button>
          <div className="flex flex-wrap items-center gap-2 ml-auto">
            <Input aria-label="De" type="date" value={inicio} onChange={e => { setPagoEm(''); setInicio(e.target.value); }} />
            <span className="t-caption">até</span>
            <Input aria-label="Até" type="date" value={fim} onChange={e => { setPagoEm(''); setFim(e.target.value); }} />
            <span className="t-caption ml-2">pago em</span>
            <Input aria-label="Pago em" type="date" value={pagoEm} onChange={e => setPagoEm(e.target.value)} />
            <IconButton aria-label="Atualizar" onClick={carregar} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton>
          </div>
        </div>

        {pagoEm && (
          <div className="aviso flex flex-wrap items-center gap-3 mb-3">
            <span className="t-body" style={{ margin: 0 }}>
              Pagamentos feitos em <strong>{capital(dayjs(pagoEm).format('dddd, DD/MM/YYYY'))}</strong>: {diarias.length} diária{diarias.length === 1 ? '' : 's'}, <strong>{brl(totais.pagoNoDia)}</strong> pagos nesse dia.
            </span>
            <Toolbar.Espaco />
            <Button tamanho="sm" variante="discreto" icone={<X size={14} />} onClick={() => setPagoEm('')}>Voltar ao período</Button>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-3">
          <KPICard rotulo="diárias" valor={totais.diarias} detalhe={`${totais.pessoas} pessoa${totais.pessoas === 1 ? '' : 's'}`} />
          <KPICard rotulo="custo com extras" valor={brl(totais.custo)} detalhe={totais.diarias ? `média ${brl(totais.custo / totais.diarias)}` : 'no período'} tom="destaque" />
          {pagoEm
            ? <KPICard rotulo="pago nesse dia" valor={brl(totais.pagoNoDia)} detalhe={capital(dayjs(pagoEm).format('ddd, DD/MM'))} tom="certo" />
            : <KPICard rotulo="pago" valor={brl(totais.pago)} detalhe={totais.custo ? `${Math.round((totais.pago / totais.custo) * 100)}% do custo` : '—'} tom="certo" />}
          <KPICard rotulo="a pagar" valor={brl(totais.aPagar)} detalhe={`${totais.aPagarN} diária${totais.aPagarN === 1 ? '' : 's'}${totais.antigas ? `, ${totais.antigas} há +7 dias` : ''}`}
            tom={totais.antigas ? 'alerta' : totais.aPagar > 0 ? 'atencao' : 'certo'} onClick={() => setFiltro('a_pagar')} />
          <KPICard rotulo="faltas" valor={totais.faltas} detalhe="marcadas no período" tom={totais.faltas ? 'atencao' : 'normal'} onClick={totais.faltas ? () => setFiltro('faltou') : undefined} />
        </div>

        {totais.porSetor.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-4">
            <Chip ligado={!setorFiltro} onMudar={() => setSetorFiltro('')}>Todos os setores</Chip>
            {totais.porSetor.map(([s, v]) => (
              <Chip key={s} ligado={setorFiltro === s} onMudar={l => setSetorFiltro(l ? s : '')} tom="ouro">{s} · {brl(v)}</Chip>
            ))}
          </div>
        )}

        <Toolbar className="mb-3">
          <div className="flex flex-wrap gap-2">
            <Chip ligado={filtro === 'todos'} onMudar={() => setFiltro('todos')}>Todas {diarias.length}</Chip>
            <Chip ligado={filtro === 'a_pagar'} onMudar={() => setFiltro('a_pagar')} tom="atencao">A pagar {(contagem.pendente || 0) + (contagem.parcial || 0)}</Chip>
            <Chip ligado={filtro === 'pago'} onMudar={() => setFiltro('pago')} tom="certo">Pagas {contagem.pago || 0}</Chip>
            {!!contagem.faltou && <Chip ligado={filtro === 'faltou'} onMudar={() => setFiltro('faltou')} tom="perigo">Faltou {contagem.faltou}</Chip>}
          </div>
        </Toolbar>

        {selecionadas.length > 0 && (
          <div className="aviso flex flex-wrap items-center gap-3 mb-3" style={{ position: 'sticky', top: 8, zIndex: 5 }}>
            <span className="t-body" style={{ margin: 0 }}>
              <strong>{selecionadas.length} diária{selecionadas.length === 1 ? '' : 's'}</strong> · falta {brl(selecionadas.reduce((a, d) => a + d.saldo_restante, 0))}
              {pessoasSelecionadas > 1 && <span className="texto-atencao"> · são {pessoasSelecionadas} pessoas: pague uma de cada vez</span>}
            </span>
            <Toolbar.Espaco />
            <Button tamanho="sm" variante="discreto" icone={<X size={14} />} onClick={() => setMarcados(new Set())}>Limpar</Button>
            <Button tamanho="sm" variante="primario" icone={<Wallet size={14} />} disabled={pessoasSelecionadas !== 1}
              onClick={() => setLote({ titulo: nomeDe(selecionadas[0]), diarias: selecionadas })}>Pagar selecionadas</Button>
          </div>
        )}

        <SectionCard noPadding>
          {carregando && !diarias.length ? <p className="t-body px-5 py-8" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>
            : visiveis.length === 0 ? (
              <EmptyState icon={Users} compact variant={diarias.length ? 'filtered' : 'empty'}
                title={diarias.length ? 'Nenhuma diária com esse filtro' : 'Nenhum extra no período'}
                description={diarias.length ? 'Troque o filtro, o setor ou a busca.' : 'Lance os extras do dia pelo botão acima.'}
                action={diarias.length ? { label: 'Ver todas', onClick: () => { setFiltro('todos'); setSetorFiltro(''); setBusca(''); } } : { label: 'Lançar extras', onClick: () => setLancando(true) }} />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      <th className="pl-4 py-2.5 w-8">
                        <input type="checkbox" aria-label="Marcar todas as diárias a pagar da lista"
                          checked={visiveis.some(emAberto) && visiveis.filter(emAberto).every(d => marcados.has(d.id))}
                          onChange={e => setMarcados(e.target.checked ? new Set(visiveis.filter(emAberto).map(d => d.id)) : new Set())} />
                      </th>
                      <th className="px-4 py-2.5 text-left">Data</th>
                      <th className="px-4 py-2.5 text-left">Pessoa</th>
                      <th className="px-4 py-2.5 text-left">Setor</th>
                      <th className="px-4 py-2.5 text-right">Diária</th>
                      <th className="px-4 py-2.5 text-right">Falta</th>
                      <th className="px-4 py-2.5 text-left">{pagoEm ? 'Pago no dia' : 'Pago em'}</th>
                      <th className="px-4 py-2.5 text-left">Situação</th>
                      <th className="px-4 py-2.5 text-right" aria-label="Ações" />
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map(d => {
                      const s = situacao(d);
                      const dias = dayjs().diff(dayjs(d.data_trabalho), 'day');
                      return (
                        <tr key={d.id} className="transition-colors hover:bg-white/[0.04] cursor-pointer" style={{ borderBottom: '1px solid var(--border-subtle)', opacity: s === 'faltou' || s === 'cancelado' ? 0.6 : 1 }}
                          onClick={() => setDetalhe(d)}>
                          <td className="pl-4 py-3 w-8" onClick={e => e.stopPropagation()}>
                            {emAberto(d) && <input type="checkbox" aria-label={`Marcar a diária de ${nomeDe(d)} em ${dataCurta(d.data_trabalho)}`} checked={marcados.has(d.id)} onChange={e => marcar(d.id, e.target.checked)} />}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <p className="t-body num" style={{ margin: 0, fontWeight: 600, textAlign: 'left' }}>{dataCurta(d.data_trabalho)}</p>
                            <p className="t-caption" style={{ margin: 0 }}>{capital(dayjs(d.data_trabalho).format('ddd'))}{d.horario_inicio && ` · ${hora(d.horario_inicio)}`}</p>
                          </td>
                          <td className="px-4 py-3">
                            <p className="t-body" style={{ margin: 0, fontWeight: 500 }}>{nomeDe(d)}</p>
                            <p className="t-caption" style={{ margin: 0 }}>{d.funcao_temporaria}{d.motivo_contratacao && ` · ${d.motivo_contratacao}`}{d.pedido_por && ` · pediu ${d.pedido_por}`}</p>
                          </td>
                          <td className="px-4 py-3 t-body">{d.setor}</td>
                          <td className="px-4 py-3 text-right num" style={{ fontWeight: 600 }}>{brl(d.valor_diaria)}</td>
                          <td className={`px-4 py-3 text-right num ${emAberto(d) && dias > 7 ? 'texto-atencao' : ''}`} style={{ fontWeight: 600 }}>
                            {emAberto(d) ? brl(d.saldo_restante) : <span className="t-caption">—</span>}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {pagoEm ? <span className="t-body num" style={{ fontWeight: 600 }}>{brl((d.pagamentos || []).reduce((a, p) => a + Number(p.valor), 0))}</span>
                              : datasPagamento(d).length ? (
                                <span className="t-body num" title={datasPagamento(d).map(x => dayjs(x).format('DD/MM/YYYY')).join(', ')}>
                                  {dataCurta(datasPagamento(d)[datasPagamento(d).length - 1])}{datasPagamento(d).length > 1 && <span className="t-caption"> +{datasPagamento(d).length - 1}</span>}
                                </span>
                              ) : <span className="t-caption">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap items-center gap-1">
                              <Badge variant={SITUACAO[s].variante}>{SITUACAO[s].rotulo}</Badge>
                              {d.presenca === 'confirmada' && <Badge variant="neutral">presente</Badge>}
                            </div>
                          </td>
                          <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                            <div className="flex items-center justify-end gap-1">
                              {emAberto(d) && <Button tamanho="sm" icone={<Wallet size={14} />} onClick={() => setPagando(d)}>Pagar</Button>}
                              <IconButton aria-label="Histórico de pagamentos" title="Histórico" onClick={() => setDetalhe(d)}><History size={14} /></IconButton>
                              <IconButton aria-label="Editar diária" title="Editar" onClick={() => setEditando(d)}><Pencil size={14} /></IconButton>
                              <IconButton aria-label="Excluir diária" title="Excluir" tom="perigo" onClick={() => excluir(d)}><Trash2 size={14} /></IconButton>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr style={{ borderTop: '1px solid var(--border)' }}>
                      <td colSpan={4} className="px-4 py-3 t-label">{visiveis.length} diária{visiveis.length === 1 ? '' : 's'}</td>
                      <td className="px-4 py-3 text-right num" style={{ fontWeight: 600 }}>{brl(visiveis.filter(d => d.status_pagamento !== 'cancelado').reduce((a, d) => a + d.valor_diaria, 0))}</td>
                      <td className="px-4 py-3 text-right num" style={{ fontWeight: 600 }}>{brl(visiveis.filter(emAberto).reduce((a, d) => a + d.saldo_restante, 0))}</td>
                      <td className="px-4 py-3 num" style={{ fontWeight: 600, textAlign: 'left' }}>{pagoEm ? brl(visiveis.reduce((a, d) => a + (d.pagamentos || []).reduce((b, p) => b + Number(p.valor), 0), 0)) : ''}</td>
                      <td colSpan={2} />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
        </SectionCard>
      </>}

      {visao === 'a_pagar' && <APagar versao={versao} busca={busca} onPagar={setPagando} onDetalhe={setDetalhe}
        onPagarTudo={(nome, lista) => setLote({ titulo: nome, diarias: lista })} />}
      {visao === 'pessoas' && <Pessoas pessoas={pessoas} tipos={tipos} busca={busca} versao={versao} onMudou={async m => { setAviso(m); await carregar(); }} />}
      {visao === 'valores' && <Valores tipos={tipos} onMudou={async m => { setAviso(m); await carregar(); }} />}

      {/* Ordem importa: o modal de baixo fica por cima (pagar sobre o histórico). */}
      {detalhe && <Detalhe diaria={detalhe} onFechar={() => setDetalhe(null)} onPagar={() => setPagando(detalhe)}
        onEditar={() => { setEditando(detalhe); setDetalhe(null); }} onPresenca={p => presenca(detalhe, p)}
        onMudou={async m => { setAviso(m); await carregar(); }} />}
      {editando && <EditarDiaria diaria={editando} tipos={tipos} onFechar={() => setEditando(null)}
        onSalvo={async m => { setEditando(null); setAviso(m); await carregar(); }} />}
      {pagando && <Pagar diaria={pagando} onFechar={() => setPagando(null)} onFeito={async m => { setPagando(null); setAviso(m); await carregar(); }} />}
      {lote && <PagarLote titulo={lote.titulo} diarias={lote.diarias} onFechar={() => setLote(null)}
        onFeito={async m => { setLote(null); setMarcados(new Set()); setAviso(m); await carregar(); }} />}
      {lancando && <LancarExtras quem={usuario?.nome_completo || null} onFechar={() => setLancando(false)}
        onFeito={async m => { setLancando(false); setAviso(m); await carregar(); }} />}
    </div>
  );
};

// ── A pagar, por pessoa (todo o histórico) ──────────────────────────────────
const APagar: React.FC<{ versao: number; busca: string; onPagar: (d: Diaria) => void; onDetalhe: (d: Diaria) => void; onPagarTudo: (nome: string, lista: Diaria[]) => void }> = ({ versao, busca, onPagar, onDetalhe, onPagarTudo }) => {
  const [lista, setLista] = useState<Diaria[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  useEffect(() => {
    supabase.from('extras_freelancers').select(SELECT_DIARIA).neq('status_pagamento', 'cancelado').gt('saldo_restante', 0).order('data_trabalho')
      .then(({ data, error }) => (error ? setErro(error.message) : setLista((data || []) as Diaria[])));
  }, [versao]);

  const grupos = useMemo(() => {
    const t = busca.trim().toLowerCase();
    const m = new Map<string, Diaria[]>();
    for (const d of lista || []) {
      if (t && !nomeDe(d).toLowerCase().includes(t)) continue;
      m.set(chave(d), [...(m.get(chave(d)) || []), d]);
    }
    return [...m.values()].map(itens => ({
      nome: nomeDe(itens[0]), telefone: itens.map(d => d.pessoa?.telefone || d.telefone).find(temTelefone) || null,
      pix: itens.find(d => d.pessoa?.pix)?.pessoa?.pix || null, itens, total: itens.reduce((a, d) => a + d.saldo_restante, 0),
    })).sort((a, b) => b.total - a.total);
  }, [lista, busca]);

  if (erro) return <div className="aviso aviso-perigo" role="alert">{erro}</div>;
  if (!lista) return <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>;
  if (!grupos.length) return <EmptyState icon={Wallet} title="Nada a pagar" description={busca ? 'Ninguém com esse nome tem diária em aberto.' : 'Todas as diárias estão pagas.'} />;

  const geral = grupos.reduce((a, g) => a + g.total, 0);
  const n = grupos.reduce((a, g) => a + g.itens.length, 0);
  const antiga = Math.max(...grupos.flatMap(g => g.itens.map(d => dayjs().diff(dayjs(d.data_trabalho), 'day'))));
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-3 gap-3">
        <KPICard rotulo="total a pagar" valor={brl(geral)} detalhe="todo o histórico" tom="atencao" />
        <KPICard rotulo="pessoas" valor={grupos.length} detalhe={`${n} diária${n === 1 ? '' : 's'} em aberto`} />
        <KPICard rotulo="mais antiga" valor={`${antiga} dia${antiga === 1 ? '' : 's'}`} detalhe="desde a diária" tom={antiga > 30 ? 'alerta' : antiga > 7 ? 'atencao' : 'normal'} />
      </div>
      {grupos.map(g => (
        <SectionCard key={chave(g.itens[0])} noPadding title={g.nome}
          descricao={`${g.itens.length} diária${g.itens.length === 1 ? '' : 's'} · desde ${dataCurta(g.itens[0].data_trabalho)}${g.telefone ? ` · ${g.telefone}` : ''}${g.pix ? ` · PIX ${g.pix}` : ''} · falta ${brl(g.total)}`}
          action={<div className="flex flex-wrap items-center gap-2">
            {temTelefone(g.telefone) && <Button tamanho="sm" variante="discreto" icone={<MessageCircle size={14} />} onClick={() => window.open(urlWhatsApp(textoExtrato(g.nome, g.itens), g.telefone), '_blank', 'noopener')}>Extrato</Button>}
            <Button tamanho="sm" variante="primario" icone={<Wallet size={14} />} onClick={() => onPagarTudo(g.nome, g.itens)}>{g.itens.length > 1 ? `Pagar ${brl(g.total)}` : 'Pagar'}</Button>
          </div>}>
          {g.itens.map(d => {
            const s = situacao(d);
            const dias = dayjs().diff(dayjs(d.data_trabalho), 'day');
            return (
              <div key={d.id} className="px-5 py-2 flex flex-wrap items-center gap-3 cursor-pointer hover:bg-white/[0.04]" style={{ borderBottom: '1px solid var(--border-subtle)' }} onClick={() => onDetalhe(d)}>
                <div className="flex-1 min-w-[160px]">
                  <p className="t-body" style={{ margin: 0 }}><span className="num" style={{ fontWeight: 600 }}>{dataCurta(d.data_trabalho)}</span> <span className="t-caption">{d.funcao_temporaria} · {d.setor}</span></p>
                  <p className={`t-caption ${dias > 30 ? 'texto-perigo' : dias > 7 ? 'texto-atencao' : ''}`} style={{ margin: 0 }}>
                    {dias > 0 ? `há ${dias} dia${dias === 1 ? '' : 's'}` : dias === 0 ? 'hoje' : `daqui a ${-dias} dia${dias === -1 ? '' : 's'}`} · diária {brl(d.valor_diaria)}{d.valor_pago > 0 && ` · pago ${brl(d.valor_pago)}`}
                  </p>
                </div>
                <Badge variant={SITUACAO[s].variante}>{SITUACAO[s].rotulo}</Badge>
                <span className="t-body num" style={{ minWidth: 96, textAlign: 'right', fontWeight: 700 }}>{brl(d.saldo_restante)}</span>
                <Button tamanho="sm" icone={<Wallet size={14} />} onClick={e => { e.stopPropagation(); onPagar(d); }}>Pagar</Button>
              </div>
            );
          })}
        </SectionCard>
      ))}
    </div>
  );
};

// ── Pessoas ─────────────────────────────────────────────────────────────────
const Pessoas: React.FC<{ pessoas: PessoaExtra[]; tipos: TipoExtra[]; busca: string; versao: number; onMudou: (m: string) => Promise<void> }> = ({ pessoas, tipos, busca, versao, onMudou }) => {
  const [uso, setUso] = useState<Map<string, { n: number; ultima: string; falta: number }>>(new Map());
  const [editando, setEditando] = useState<Partial<PessoaExtra> | null>(null);
  const [juntando, setJuntando] = useState<PessoaExtra | null>(null);
  const [inativos, setInativos] = useState(false);
  const tipoNome = useMemo(() => new Map(tipos.map(t => [t.id, t.nome])), [tipos]);

  useEffect(() => {
    (async () => {
      // Passa de mil linhas: busca em páginas.
      const linhas: { pessoa_id: string; data_trabalho: string; saldo_restante: number; status_pagamento: string }[] = [];
      for (let de = 0; ; de += 1000) {
        const { data, error } = await supabase.from('extras_freelancers').select('pessoa_id, data_trabalho, saldo_restante, status_pagamento')
          .not('pessoa_id', 'is', null).order('id').range(de, de + 999);
        if (error || !data) break;
        linhas.push(...(data as typeof linhas));
        if (data.length < 1000) break;
      }
      {
        const m = new Map<string, { n: number; ultima: string; falta: number }>();
        for (const r of linhas) {
          const k = r.pessoa_id as string;
          const a = m.get(k) || { n: 0, ultima: '', falta: 0 };
          a.n += 1;
          if (r.data_trabalho > a.ultima) a.ultima = r.data_trabalho;
          if (r.status_pagamento !== 'cancelado' && r.saldo_restante > 0) a.falta += Number(r.saldo_restante);
          m.set(k, a);
        }
        setUso(m);
      }
    })();
  }, [versao]);

  const t = busca.trim().toLowerCase();
  const lista = pessoas.filter(p => (inativos || p.ativo) && (!t || p.nome.toLowerCase().includes(t)))
    .sort((a, b) => (uso.get(b.id)?.ultima || '').localeCompare(uso.get(a.id)?.ultima || '') || a.nome.localeCompare(b.nome));

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <Chip ligado={inativos} onMudar={setInativos}>Mostrar inativos</Chip>
        <Toolbar.Espaco />
        <Button tamanho="sm" icone={<Plus size={14} />} onClick={() => setEditando({ ativo: true })}>Nova pessoa</Button>
      </div>
      <SectionCard noPadding title={`${lista.length} pessoa${lista.length === 1 ? '' : 's'}`} descricao="Quem trabalhou por último aparece primeiro. Nome escrito de dois jeitos? Use Juntar.">
        {lista.map(p => {
          const u = uso.get(p.id);
          return (
            <div key={p.id} className="px-5 py-2 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)', opacity: p.ativo ? 1 : 0.55 }}>
              <div className="flex-1 min-w-[200px]">
                <p className="t-body" style={{ margin: 0, fontWeight: 500 }}>{p.nome}{!p.ativo && <Badge variant="neutral" className="ml-2">inativo</Badge>}</p>
                <p className="t-caption" style={{ margin: 0 }}>
                  {[p.tipo_id && tipoNome.get(p.tipo_id), p.valor_diaria ? `diária própria ${brl(p.valor_diaria)}` : null, p.telefone, p.pix && `PIX ${p.pix}`].filter(Boolean).join(' · ') || 'sem telefone e PIX'}
                </p>
              </div>
              <div className="text-right" style={{ minWidth: 150 }}>
                <p className="t-caption" style={{ margin: 0 }}>{u ? `${u.n} diária${u.n === 1 ? '' : 's'} · última ${dayjs(u.ultima).format('DD/MM/YY')}` : 'sem diárias'}</p>
                {u && u.falta > 0 && <p className="t-caption texto-atencao" style={{ margin: 0 }}>falta {brl(u.falta)}</p>}
              </div>
              <IconButton aria-label={`Juntar ${p.nome} com outro cadastro`} title="Juntar com outro cadastro" onClick={() => setJuntando(p)}><GitMerge size={14} /></IconButton>
              <IconButton aria-label={`Editar ${p.nome}`} title="Editar" onClick={() => setEditando(p)}><Pencil size={14} /></IconButton>
            </div>
          );
        })}
      </SectionCard>
      {editando && <EditarPessoa inicial={editando} tipos={tipos} onFechar={() => setEditando(null)} onSalvo={async m => { setEditando(null); await onMudou(m); }} />}
      {juntando && <Juntar de={juntando} pessoas={pessoas.filter(p => p.ativo && p.id !== juntando.id)} onFechar={() => setJuntando(null)} onFeito={async m => { setJuntando(null); await onMudou(m); }} />}
    </>
  );
};

const EditarPessoa: React.FC<{ inicial: Partial<PessoaExtra>; tipos: TipoExtra[]; onFechar: () => void; onSalvo: (m: string) => Promise<void> }> = ({ inicial, tipos, onFechar, onSalvo }) => {
  const [nome, setNome] = useState(inicial.nome || '');
  const [telefone, setTelefone] = useState(inicial.telefone || '');
  const [pix, setPix] = useState(inicial.pix || '');
  const [tipoId, setTipoId] = useState(inicial.tipo_id || '');
  const [valor, setValor] = useState(inicial.valor_diaria ? String(inicial.valor_diaria).replace('.', ',') : '');
  const [obs, setObs] = useState(inicial.observacoes || '');
  const [ativo, setAtivo] = useState(inicial.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const salvar = async () => {
    if (!nome.trim()) { setErro('Dê o nome da pessoa.'); return; }
    setOcupado(true); setErro(null);
    const linha = { nome: nome.trim().replace(/\s+/g, ' '), telefone: telefone.trim() || null, pix: pix.trim() || null, tipo_id: tipoId || null,
      valor_diaria: num(valor) || null, observacoes: obs.trim() || null, ativo };
    const { error } = inicial.id ? await supabase.from('extras_pessoas').update(linha).eq('id', inicial.id) : await supabase.from('extras_pessoas').insert(linha);
    if (error) { setErro(error.message); setOcupado(false); return; }
    await onSalvo(inicial.id ? `${linha.nome} atualizado.` : `${linha.nome} cadastrado.`);
  };
  return (
    <Modal aberto onFechar={onFechar} travado={ocupado} titulo={inicial.id ? 'Editar pessoa' : 'Nova pessoa'} descricao="Quem faz extra na casa. Telefone e PIX ajudam na hora de pagar."
      rodape={<><Button onClick={onFechar} disabled={ocupado}>Cancelar</Button><Button variante="primario" icone={<Check size={16} />} onClick={salvar} carregando={ocupado}>Salvar</Button></>}>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input rotulo="Nome" value={nome} onChange={e => setNome(e.target.value)} autoFocus className="md:col-span-2" />
        <Input rotulo="WhatsApp" value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="65 9xxxx-xxxx" />
        <Input rotulo="PIX" value={pix} onChange={e => setPix(e.target.value)} placeholder="Chave PIX" />
        <Select rotulo="Tipo principal" value={tipoId} onChange={e => setTipoId(e.target.value)}>
          <option value="">Nenhum</option>{tipos.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </Select>
        <Input rotulo="Diária própria (R$)" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} placeholder="Vazio: usa a tabela" dica="Só se esta pessoa ganha diferente da tabela." />
        <Textarea rotulo="Observações" value={obs} onChange={e => setObs(e.target.value)} rows={2} className="md:col-span-2" />
        {inicial.id && <label className="flex items-center gap-2 t-body"><input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} /> Ativo</label>}
      </div>
    </Modal>
  );
};

const Juntar: React.FC<{ de: PessoaExtra; pessoas: PessoaExtra[]; onFechar: () => void; onFeito: (m: string) => Promise<void> }> = ({ de, pessoas, onFechar, onFeito }) => {
  const [para, setPara] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const alvo = pessoas.find(p => p.id === para);
  const confirmar = async () => {
    if (!alvo) { setErro('Escolha com quem juntar.'); return; }
    setOcupado(true); setErro(null);
    const { data, error } = await supabase.rpc('fn_extras_juntar_pessoas', { p_de: de.id, p_para: alvo.id });
    if (error) { setErro(error.message); setOcupado(false); return; }
    await onFeito(`${de.nome} juntado com ${alvo.nome}: ${(data as { diarias: number }).diarias} diária(s) passaram para ${alvo.nome}.`);
  };
  return (
    <Modal aberto onFechar={onFechar} travado={ocupado} titulo={`Juntar ${de.nome}`} descricao="As diárias deste cadastro passam para o escolhido. Telefone e PIX que faltarem lá vêm daqui. Este cadastro fica inativo."
      rodape={<><Button onClick={onFechar} disabled={ocupado}>Cancelar</Button><Button variante="primario" icone={<GitMerge size={16} />} onClick={confirmar} carregando={ocupado} disabled={!alvo}>Juntar</Button></>}>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <Select rotulo="Fica o cadastro de" value={para} onChange={e => setPara(e.target.value)} autoFocus>
        <option value="">Escolher…</option>
        {[...pessoas].sort((a, b) => a.nome.localeCompare(b.nome)).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
      </Select>
    </Modal>
  );
};

// ── Tabela de valores ───────────────────────────────────────────────────────
const Valores: React.FC<{ tipos: TipoExtra[]; onMudou: (m: string) => Promise<void> }> = ({ tipos, onMudou }) => {
  const [categorias, setCategorias] = useState<{ id: string; nome: string }[]>([]);
  const [editando, setEditando] = useState<Partial<TipoExtra> | null>(null);
  useEffect(() => {
    supabase.from('categorias_financeiras').select('id, nome').eq('categoria_pai_id', 'a2878c92-6baf-4a83-81c5-67f22c9eb480').eq('status', 'ativo').order('nome')
      .then(({ data }) => setCategorias((data || []) as { id: string; nome: string }[]));
  }, []);
  const catNome = new Map(categorias.map(c => [c.id, c.nome]));
  return (
    <>
      <SectionCard noPadding title="Tabela de valores" descricao="O valor da diária de cada tipo de extra e a subcategoria em que a conta entra no Financeiro."
        action={<Button tamanho="sm" icone={<Plus size={14} />} onClick={() => setEditando({ ativo: true, ordem: tipos.length + 1 })}>Novo tipo</Button>}>
        <table className="w-full">
          <thead><tr style={{ borderBottom: '1px solid var(--border)' }}>
            <th className="px-4 py-2.5 text-left">Tipo</th><th className="px-4 py-2.5 text-left">Setor</th><th className="px-4 py-2.5 text-right">Diária</th>
            <th className="px-4 py-2.5 text-left">Subcategoria no Financeiro</th><th className="px-4 py-2.5" aria-label="Ações" />
          </tr></thead>
          <tbody>
            {tipos.map(t => (
              <tr key={t.id} style={{ borderBottom: '1px solid var(--border-subtle)', opacity: t.ativo ? 1 : 0.55 }}>
                <td className="px-4 py-3 t-body" style={{ fontWeight: 500 }}>{t.nome}{!t.ativo && <Badge variant="neutral" className="ml-2">inativo</Badge>}</td>
                <td className="px-4 py-3 t-body">{t.setor}</td>
                <td className="px-4 py-3 text-right num" style={{ fontWeight: 600 }}>{brl(t.valor_diaria)}</td>
                <td className="px-4 py-3 t-body">{(t.categoria_financeira_id && catNome.get(t.categoria_financeira_id)) || <span className="texto-atencao">sem subcategoria</span>}</td>
                <td className="px-4 py-3 text-right"><IconButton aria-label={`Editar ${t.nome}`} onClick={() => setEditando(t)}><Pencil size={14} /></IconButton></td>
              </tr>
            ))}
          </tbody>
        </table>
      </SectionCard>
      {editando && <EditarTipo inicial={editando} categorias={categorias} onFechar={() => setEditando(null)} onSalvo={async m => { setEditando(null); await onMudou(m); }} />}
    </>
  );
};

const EditarTipo: React.FC<{ inicial: Partial<TipoExtra>; categorias: { id: string; nome: string }[]; onFechar: () => void; onSalvo: (m: string) => Promise<void> }> = ({ inicial, categorias, onFechar, onSalvo }) => {
  const [nome, setNome] = useState(inicial.nome || '');
  const [setor, setSetor] = useState(inicial.setor || '');
  const [valor, setValor] = useState(inicial.valor_diaria ? String(inicial.valor_diaria).replace('.', ',') : '');
  const [cat, setCat] = useState(inicial.categoria_financeira_id || '');
  const [ativo, setAtivo] = useState(inicial.ativo ?? true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const salvar = async () => {
    if (!nome.trim() || !setor || num(valor) <= 0) { setErro('Preencha nome, setor e o valor da diária.'); return; }
    if (!cat) { setErro('Escolha a subcategoria do Financeiro.'); return; }
    setOcupado(true); setErro(null);
    const linha = { nome: nome.trim(), setor, valor_diaria: num(valor), categoria_financeira_id: cat, ativo, ordem: inicial.ordem ?? 99 };
    const { error } = inicial.id ? await supabase.from('extras_tipos').update(linha).eq('id', inicial.id) : await supabase.from('extras_tipos').insert(linha);
    if (error) { setErro(error.message); setOcupado(false); return; }
    await onSalvo(`${linha.nome}: ${brl(linha.valor_diaria)}. Vale para os próximos lançamentos.`);
  };
  return (
    <Modal aberto onFechar={onFechar} travado={ocupado} titulo={inicial.id ? `Editar ${inicial.nome}` : 'Novo tipo de extra'}
      descricao="Mudar o valor vale para os próximos lançamentos. As diárias já lançadas ficam como estão."
      rodape={<><Button onClick={onFechar} disabled={ocupado}>Cancelar</Button><Button variante="primario" icone={<Check size={16} />} onClick={salvar} carregando={ocupado}>Salvar</Button></>}>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input rotulo="Tipo" value={nome} onChange={e => setNome(e.target.value)} autoFocus placeholder="Ex.: Barman" />
        <Select rotulo="Setor" value={setor} onChange={e => setSetor(e.target.value)}>
          <option value="">Escolher…</option>{SETORES.map(s => <option key={s} value={s}>{s}</option>)}
        </Select>
        <Input rotulo="Diária (R$)" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
        <Select rotulo="Subcategoria no Financeiro" value={cat} onChange={e => setCat(e.target.value)}>
          <option value="">Escolher…</option>{categorias.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Select>
        {inicial.id && <label className="flex items-center gap-2 t-body"><input type="checkbox" checked={ativo} onChange={e => setAtivo(e.target.checked)} /> Ativo</label>}
      </div>
    </Modal>
  );
};

// ── Editar uma diária ───────────────────────────────────────────────────────
const EditarDiaria: React.FC<{ diaria: Diaria; tipos: TipoExtra[]; onFechar: () => void; onSalvo: (m: string) => Promise<void> }> = ({ diaria, tipos, onFechar, onSalvo }) => {
  const [data, setData] = useState(diaria.data_trabalho);
  const [tipoId, setTipoId] = useState(diaria.tipo_id || '');
  const [setor, setSetor] = useState(diaria.setor);
  const [valor, setValor] = useState(String(diaria.valor_diaria).replace('.', ','));
  const [motivo, setMotivo] = useState(diaria.motivo_contratacao || '');
  const [pedido, setPedido] = useState(diaria.pedido_por || '');
  const [hIni, setHIni] = useState(hora(diaria.horario_inicio));
  const [hFim, setHFim] = useState(hora(diaria.horario_fim));
  const [obs, setObs] = useState(diaria.observacoes || '');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const tipo = tipos.find(t => t.id === tipoId);
  const salvar = async () => {
    if (!setor || num(valor) <= 0) { setErro('Setor e valor são obrigatórios.'); return; }
    setOcupado(true); setErro(null);
    const { error } = await supabase.from('extras_freelancers').update({
      data_trabalho: data, tipo_id: tipoId || null, funcao_temporaria: tipo?.nome || diaria.funcao_temporaria, setor, valor_diaria: num(valor),
      motivo_contratacao: motivo || null, pedido_por: pedido.trim() || null, horario_inicio: hIni || null, horario_fim: hFim || null, observacoes: obs.trim() || null,
    }).eq('id', diaria.id);
    if (error) { setErro(error.message); setOcupado(false); return; }
    await onSalvo(`Diária de ${nomeDe(diaria)} atualizada.`);
  };
  return (
    <Modal aberto onFechar={onFechar} largura="lg" travado={ocupado} titulo={`Editar diária de ${nomeDe(diaria)}`} descricao="A conta a pagar no Financeiro acompanha a mudança."
      rodape={<><Button onClick={onFechar} disabled={ocupado}>Cancelar</Button><Button variante="primario" icone={<Check size={16} />} onClick={salvar} carregando={ocupado}>Salvar</Button></>}>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <Input rotulo="Data" type="date" value={data} onChange={e => setData(e.target.value)} />
        <Select rotulo="Tipo" value={tipoId} onChange={e => { setTipoId(e.target.value); const t = tipos.find(x => x.id === e.target.value); if (t) setSetor(t.setor); }}>
          <option value="">{diaria.funcao_temporaria}</option>{tipos.filter(t => t.ativo || t.id === tipoId).map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </Select>
        <Select rotulo="Setor" value={setor} onChange={e => setSetor(e.target.value)}>{SETORES.map(s => <option key={s} value={s}>{s}</option>)}</Select>
        <Input rotulo="Diária (R$)" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} />
        <Select rotulo="Motivo" value={motivo} onChange={e => setMotivo(e.target.value)}>
          <option value="">—</option>{[...new Set([...MOTIVOS, ...(motivo ? [motivo] : [])])].map(m => <option key={m} value={m}>{m}</option>)}
        </Select>
        <Input rotulo="Quem pediu" value={pedido} onChange={e => setPedido(e.target.value)} />
        <Input rotulo="Início" type="time" value={hIni} onChange={e => setHIni(e.target.value)} />
        <Input rotulo="Fim" type="time" value={hFim} onChange={e => setHFim(e.target.value)} />
        <div />
        <Textarea rotulo="Observações" value={obs} onChange={e => setObs(e.target.value)} rows={2} className="md:col-span-3" />
      </div>
    </Modal>
  );
};

// ── Pagar uma diária ────────────────────────────────────────────────────────
const Pagar: React.FC<{ diaria: Diaria; onFechar: () => void; onFeito: (m: string) => Promise<void> }> = ({ diaria, onFechar, onFeito }) => {
  const falta = Math.max(0, diaria.saldo_restante);
  const [valor, setValor] = useState(falta ? falta.toFixed(2).replace('.', ',') : '');
  const [data, setData] = useState(dayjs().format('YYYY-MM-DD'));
  const [forma, setForma] = useState('PIX');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const v = num(valor);
  const confirmar = async () => {
    if (v <= 0) { setErro('Informe o valor pago.'); return; }
    setOcupado(true); setErro(null);
    const { data: r, error } = await supabase.rpc('fn_extra_pagar', { p_extra: diaria.id, p_valor: v, p_data: data, p_forma: forma, p_obs: obs || null });
    if (error) { setErro(error.message); setOcupado(false); return; }
    const res = r as { saldo: number };
    await onFeito(res.saldo > 0.004 ? `${nomeDe(diaria)}: ${brl(v)} lançado. Ainda falta ${brl(res.saldo)}.` : `${nomeDe(diaria)}: ${brl(v)} lançado. Diária quitada.`);
  };
  return (
    <Modal aberto onFechar={onFechar} travado={ocupado} titulo={`Pagar ${nomeDe(diaria)}`}
      descricao={`${diaria.funcao_temporaria} de ${dataCurta(diaria.data_trabalho)}${diaria.pessoa?.pix ? ` · PIX ${diaria.pessoa.pix}` : ''}. Não dá baixa no Financeiro.`}
      rodape={<><Button onClick={onFechar} disabled={ocupado}>Cancelar</Button><Button variante="primario" icone={<Check size={16} />} onClick={confirmar} carregando={ocupado}>Lançar pagamento</Button></>}>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Resumo rotulo="Diária" valor={brl(diaria.valor_diaria)} />
        <Resumo rotulo="Já pago" valor={brl(diaria.valor_pago)} />
        <Resumo rotulo="Falta" valor={brl(falta)} destaque />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input rotulo="Valor pago (R$)" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} autoFocus
          dica={v > 0 && v < falta - 0.004 ? `Parcial: vai faltar ${brl(falta - v)}` : 'Pode ser parcial.'} />
        <Input rotulo="Data" type="date" value={data} onChange={e => setData(e.target.value)} />
        <Select rotulo="Forma" value={forma} onChange={e => setForma(e.target.value)}>{FORMAS.map(f => <option key={f} value={f}>{f}</option>)}</Select>
        <Input rotulo="Observação" value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional" />
      </div>
    </Modal>
  );
};

// ── Pagar várias diárias de uma vez ─────────────────────────────────────────
const PagarLote: React.FC<{ titulo: string; diarias: Diaria[]; onFechar: () => void; onFeito: (m: string) => Promise<void> }> = ({ titulo, diarias, onFechar, onFeito }) => {
  const ordenadas = useMemo(() => [...diarias].filter(emAberto).sort((a, b) => a.data_trabalho.localeCompare(b.data_trabalho)), [diarias]);
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(ordenadas.map(d => d.id)));
  const escolhidas = ordenadas.filter(d => marcados.has(d.id));
  const falta = escolhidas.reduce((a, d) => a + d.saldo_restante, 0);
  const [valor, setValor] = useState(falta.toFixed(2).replace('.', ','));
  const [data, setData] = useState(dayjs().format('YYYY-MM-DD'));
  const [forma, setForma] = useState('PIX');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const v = num(valor);
  const alternar = (id: string) => {
    const n = new Set(marcados);
    if (n.has(id)) n.delete(id); else n.add(id);
    setMarcados(n);
    setValor(ordenadas.filter(d => n.has(d.id)).reduce((a, d) => a + d.saldo_restante, 0).toFixed(2).replace('.', ','));
  };
  const previa = useMemo(() => {
    let resta = v;
    return new Map(escolhidas.map(d => { const parte = Math.max(0, Math.min(resta, d.saldo_restante)); resta -= parte; return [d.id, parte] as const; }));
  }, [escolhidas, v]);
  const confirmar = async () => {
    if (!escolhidas.length) { setErro('Marque pelo menos uma diária.'); return; }
    if (v <= 0) { setErro('Informe o valor pago.'); return; }
    if (v > falta + 0.004) { setErro(`O valor passa do que falta (${brl(falta)}).`); return; }
    setOcupado(true); setErro(null);
    const { data: r, error } = await supabase.rpc('fn_extra_pagar_lote', { p_extras: escolhidas.map(d => d.id), p_valor: v, p_data: data, p_forma: forma, p_obs: obs || null });
    if (error) { setErro(error.message); setOcupado(false); return; }
    const res = r as { diarias: number; falta_depois: number };
    await onFeito(`${titulo}: ${brl(v)} lançado em ${res.diarias} diária${res.diarias === 1 ? '' : 's'}. ${res.falta_depois > 0.004 ? `Ainda falta ${brl(res.falta_depois)}.` : 'Tudo quitado.'}`);
  };
  return (
    <Modal aberto onFechar={onFechar} largura="lg" travado={ocupado} titulo={`Pagar ${titulo}`}
      descricao="Um pagamento só para várias diárias, da mais antiga para a mais nova. Não dá baixa no Financeiro."
      rodape={<><Button onClick={onFechar} disabled={ocupado}>Cancelar</Button><Button variante="primario" icone={<Check size={16} />} onClick={confirmar} carregando={ocupado} disabled={!escolhidas.length}>Lançar {v > 0 ? brl(v) : ''}</Button></>}>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <div className="flex flex-col mb-4" style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-control)' }}>
        {ordenadas.map(d => {
          const parte = previa.get(d.id) || 0;
          const ligado = marcados.has(d.id);
          return (
            <label key={d.id} className="px-3 py-2 flex items-center gap-3 cursor-pointer" style={{ borderBottom: '1px solid var(--border-subtle)', opacity: ligado ? 1 : 0.55 }}>
              <input type="checkbox" checked={ligado} onChange={() => alternar(d.id)} />
              <span className="flex-1 t-body">{dataCurta(d.data_trabalho)} <span className="t-caption">· {d.funcao_temporaria} · {brl(d.valor_diaria)}{d.valor_pago > 0 && ` · pago ${brl(d.valor_pago)}`}</span></span>
              <span className="t-caption num" style={{ minWidth: 90 }}>falta {brl(d.saldo_restante)}</span>
              <span className="t-body num" style={{ minWidth: 110, fontWeight: 700, color: !ligado ? undefined : parte >= d.saldo_restante - 0.004 ? 'var(--ok-text)' : parte > 0 ? 'var(--info-text)' : 'var(--text-secondary)' }}>
                {!ligado ? '—' : parte >= d.saldo_restante - 0.004 ? `quita ${brl(parte)}` : parte > 0 ? `parcial ${brl(parte)}` : 'fica para depois'}
              </span>
            </label>
          );
        })}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input rotulo="Valor pago (R$)" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} autoFocus
          dica={v > 0 && v < falta - 0.004 ? `Vai faltar ${brl(falta - v)}` : `Falta ${brl(falta)} nas diárias marcadas`} erro={v > falta + 0.004 ? `Passa do que falta (${brl(falta)})` : undefined} />
        <Input rotulo="Data" type="date" value={data} onChange={e => setData(e.target.value)} />
        <Select rotulo="Forma" value={forma} onChange={e => setForma(e.target.value)}>{FORMAS.map(f => <option key={f} value={f}>{f}</option>)}</Select>
        <Input rotulo="Observação" value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional" />
      </div>
    </Modal>
  );
};

// ── Detalhe: presença e histórico de pagamentos ─────────────────────────────
const Detalhe: React.FC<{ diaria: Diaria; onFechar: () => void; onPagar: () => void; onEditar: () => void; onPresenca: (p: Diaria['presenca']) => void; onMudou: (m: string) => Promise<void> }> = ({ diaria, onFechar, onPagar, onEditar, onPresenca, onMudou }) => {
  const [pagamentos, setPagamentos] = useState<Pagamento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [estornando, setEstornando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const s: Situacao = situacao(diaria);

  const carregar = async () => {
    const { data, error } = await supabase.from('extras_pagamentos').select('*').eq('extra_id', diaria.id).order('data_pagamento').order('criado_em');
    if (error) setErro(error.message); else setPagamentos((data || []) as Pagamento[]);
  };
  useEffect(() => { void carregar(); }, [diaria.id, diaria.valor_pago]);

  const estornar = async (p: Pagamento) => {
    if (!motivo.trim()) { setErro('Diga o motivo do estorno.'); return; }
    setOcupado(true); setErro(null);
    const { error } = await supabase.rpc('fn_extra_estornar', { p_pagamento: p.id, p_motivo: motivo.trim() });
    setOcupado(false);
    if (error) { setErro(error.message); return; }
    setEstornando(null); setMotivo('');
    await onMudou(`Pagamento de ${brl(p.valor)} estornado.`);
    await carregar();
  };

  return (
    <Modal aberto onFechar={onFechar} largura="lg" titulo={nomeDe(diaria)}
      descricao={[capital(dayjs(diaria.data_trabalho).format('dddd, DD/MM/YYYY')), diaria.horario_inicio && `${hora(diaria.horario_inicio)} às ${hora(diaria.horario_fim)}`, diaria.funcao_temporaria, diaria.setor, diaria.pessoa?.telefone, diaria.pessoa?.pix && `PIX ${diaria.pessoa.pix}`].filter(Boolean).join(' · ')}
      rodape={<>
        <Button icone={<Pencil size={14} />} onClick={onEditar}>Editar</Button>
        {emAberto(diaria) && <Button variante="primario" icone={<Wallet size={16} />} onClick={onPagar}>Registrar pagamento</Button>}
      </>}>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Resumo rotulo="Diária" valor={brl(diaria.valor_diaria)} />
        <Resumo rotulo="Pago" valor={brl(diaria.valor_pago)} />
        <Resumo rotulo="Falta" valor={brl(Math.max(0, diaria.status_pagamento === 'cancelado' ? 0 : diaria.saldo_restante))} destaque />
      </div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <span className="t-label" style={{ color: 'var(--text-secondary)' }}>Presença</span>
        <Segmented<Diaria['presenca']> rotulo="Presença" valor={diaria.presenca} onMudar={onPresenca}
          opcoes={[{ valor: 'prevista', rotulo: 'Prevista' }, { valor: 'confirmada', rotulo: 'Veio' }, { valor: 'faltou', rotulo: 'Faltou' }]} />
        <span className="t-caption">{diaria.lancado_por_nome && `Lançou: ${diaria.lancado_por_nome}`}{diaria.pedido_por && ` · Pediu: ${diaria.pedido_por}`}{diaria.motivo_contratacao && ` · ${diaria.motivo_contratacao}`}</span>
      </div>
      {diaria.presenca === 'faltou' && <div className="aviso aviso-atencao mb-3">Marcada como falta: não entra no a pagar e a conta saiu do Financeiro.</div>}
      <div className="flex items-center gap-2 mb-2">
        <span className="t-label" style={{ color: 'var(--text-secondary)' }}>Histórico de pagamentos</span>
        <Badge variant={SITUACAO[s].variante}>{SITUACAO[s].rotulo}</Badge>
      </div>
      {pagamentos === null ? <p className="t-caption">Carregando…</p> : pagamentos.length === 0 ? (
        <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Nenhum pagamento lançado ainda.</p>
      ) : (
        <div className="flex flex-col" style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--r-control)' }}>
          {pagamentos.map(p => (
            <div key={p.id} className="px-3 py-2" style={{ borderBottom: '1px solid var(--border-subtle)', opacity: p.estornado_em ? 0.6 : 1 }}>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex-1 min-w-[180px]">
                  <p className="t-body" style={{ margin: 0, fontWeight: 500, textDecoration: p.estornado_em ? 'line-through' : undefined }}>
                    {p.tipo === 'saldo_inicial' ? 'Saldo inicial' : p.forma || 'Pagamento'} · {dayjs(p.data_pagamento).format('DD/MM/YYYY')}
                  </p>
                  <p className="t-caption" style={{ margin: 0 }}>
                    {[p.observacao, p.criado_por_nome,
                      p.estornado_em && `estornado por ${p.estornado_por_nome || '—'} em ${dayjs(p.estornado_em).format('DD/MM')}: ${p.motivo_estorno}`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className="t-body num" style={{ fontWeight: 700 }}>{brl(p.valor)}</span>
                {!p.estornado_em && estornando !== p.id && <Button tamanho="sm" variante="discreto" icone={<Undo2 size={14} />} onClick={() => { setEstornando(p.id); setMotivo(''); }}>Estornar</Button>}
              </div>
              {estornando === p.id && (
                <div className="flex flex-wrap items-end gap-2 mt-2">
                  <Input rotulo="Motivo do estorno" value={motivo} onChange={e => setMotivo(e.target.value)} autoFocus className="flex-1 min-w-[200px]" placeholder="Ex.: lançado em dobro" />
                  <Button tamanho="sm" onClick={() => setEstornando(null)} disabled={ocupado}>Voltar</Button>
                  <Button tamanho="sm" variante="perigo" icone={<Undo2 size={14} />} onClick={() => estornar(p)} carregando={ocupado}>Confirmar estorno</Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      {diaria.observacoes && <p className="t-caption mt-3" style={{ margin: 0 }}><strong>Observações:</strong> {diaria.observacoes}</p>}
    </Modal>
  );
};

export default Extras;
