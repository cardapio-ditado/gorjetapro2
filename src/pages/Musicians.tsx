import React, { useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import 'dayjs/locale/pt-br';
import {
  Ban, Check, ChevronLeft, ChevronRight, Download, FileText, History, Music, Pencil,
  Plus, RefreshCw, Search, Sparkles, Trash2, Undo2, Wallet,
} from 'lucide-react';
import { ReportGenerator, exportToExcel } from '../utils/reportGenerator';
import { supabase } from '../lib/supabase';
import { SearchableSelect } from '../components/common/SearchableSelect';
import {
  Badge, Button, Chip, EmptyState, IconButton, Input, KPICard, Modal, PageHeader, SectionCard, Segmented, Select,
  Textarea, Toolbar,
} from '../components/ui';
import type { BadgeVariante } from '../components/ui';
import ImportarAgendaMusicosIA from '../components/musicos/ImportarAgendaMusicosIA';

dayjs.locale('pt-br');

/**
 * Músicos: agenda de shows e controle de pagamento dos cachês.
 *
 * Lançar o show cria a conta a pagar no Financeiro (trigger no banco). Os
 * pagamentos lançados aqui são um controle à parte: ficam no histórico do
 * show (musicos_pagamentos) e não dão baixa no Financeiro. O saldo devedor
 * que vale é o desta tela.
 */

interface Show {
  id: string;
  nome: string | null;
  contato: string | null;
  valor: number | null;
  data_evento: string | null;
  horario_inicio: string | null;
  horario_fim: string | null;
  material_promocional: string | null;
  observacoes: string | null;
  valor_consumo: number;
  valor_adicional: number;
  valor_total_final: number;
  valor_pago: number;
  saldo_restante: number;
  status_pagamento: 'pendente' | 'pago' | 'cancelado';
  fornecedor_id: string | null;
  fornecedor_nome: string | null;
}

interface Pagamento {
  id: string;
  tipo: 'pagamento' | 'saldo_inicial';
  valor: number;
  data_pagamento: string;
  forma: string | null;
  observacao: string | null;
  criado_por_nome: string | null;
  criado_em: string;
  estornado_em: string | null;
  estornado_por_nome: string | null;
  motivo_estorno: string | null;
}

interface Fornecedor { id: string; nome: string; tipo: string }

type Situacao = 'pendente' | 'parcial' | 'pago' | 'pago_a_mais' | 'cancelado' | 'sem_valor';
type Filtro = 'todos' | 'a_pagar' | Situacao;
type Visao = 'lista' | 'calendario';

const SITUACAO: Record<Situacao, { rotulo: string; variante: BadgeVariante }> = {
  pendente: { rotulo: 'Pendente', variante: 'warning' },
  parcial: { rotulo: 'Parcial', variante: 'info' },
  pago: { rotulo: 'Pago', variante: 'success' },
  pago_a_mais: { rotulo: 'Pago a mais', variante: 'danger' },
  cancelado: { rotulo: 'Cancelado', variante: 'neutral' },
  sem_valor: { rotulo: 'Sem valor', variante: 'neutral' },
};

const FORMAS = ['PIX', 'Dinheiro', 'Transferência', 'Cartão', 'Outro'];

const brl = (v: number) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const num = (s: string) => Number((s || '').replace(/\./g, '').replace(',', '.')) || 0;
const hora = (h: string | null) => (h ? h.slice(0, 5) : '');
const dataCurta = (s: string | null) => (s ? dayjs(s).format('DD/MM') : '—');

function situacao(s: Show): Situacao {
  if (s.status_pagamento === 'cancelado') return 'cancelado';
  const total = Number(s.valor_total_final) || 0;
  const pago = Number(s.valor_pago) || 0;
  if (total <= 0) return 'sem_valor';
  if (pago <= 0) return 'pendente';
  if (pago < total - 0.004) return 'parcial';
  if (pago > total + 0.004) return 'pago_a_mais';
  return 'pago';
}

const saldoDe = (s: Show) => (s.status_pagamento === 'cancelado' ? 0 : (Number(s.valor_total_final) || 0) - (Number(s.valor_pago) || 0));

/** Nome parecido para sugerir o fornecedor do cadastro do músico. */
function parecido(a: string, b: string): number {
  const s1 = a.toLowerCase().trim();
  const s2 = b.toLowerCase().trim();
  if (s1 === s2) return 100;
  const longo = s1.length >= s2.length ? s1 : s2;
  const curto = s1.length >= s2.length ? s2 : s1;
  if (!longo.length) return 100;
  const custos: number[] = [];
  for (let i = 0; i <= longo.length; i++) {
    let ultimo = i;
    for (let j = 0; j <= curto.length; j++) {
      if (i === 0) custos[j] = j;
      else if (j > 0) {
        let novo = custos[j - 1];
        if (longo.charAt(i - 1) !== curto.charAt(j - 1)) novo = Math.min(novo, ultimo, custos[j]) + 1;
        custos[j - 1] = ultimo;
        ultimo = novo;
      }
    }
    if (i > 0) custos[curto.length] = ultimo;
  }
  return ((longo.length - custos[curto.length]) / longo.length) * 100;
}

const Musicians: React.FC = () => {
  const [mes, setMes] = useState(dayjs().startOf('month'));
  const [inicio, setInicio] = useState(dayjs().startOf('month').format('YYYY-MM-DD'));
  const [fim, setFim] = useState(dayjs().endOf('month').format('YYYY-MM-DD'));
  const [shows, setShows] = useState<Show[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');
  const [visao, setVisao] = useState<Visao>('lista');
  const [editando, setEditando] = useState<Partial<Show> | null>(null);
  const [pagando, setPagando] = useState<Show | null>(null);
  const [detalhe, setDetalhe] = useState<Show | null>(null);
  const [importando, setImportando] = useState(false);

  const irParaMes = (m: dayjs.Dayjs) => {
    setMes(m.startOf('month'));
    setInicio(m.startOf('month').format('YYYY-MM-DD'));
    setFim(m.endOf('month').format('YYYY-MM-DD'));
  };

  const carregar = async () => {
    setCarregando(true); setErro(null);
    try {
      let q = supabase.from('vw_musicos_financeiro').select('*');
      if (inicio) q = q.gte('data_evento', inicio);
      if (fim) q = q.lte('data_evento', `${fim} 23:59:59`);
      const { data, error } = await q.order('data_evento', { ascending: true }).order('horario_inicio', { ascending: true });
      if (error) throw error;
      setShows((data || []) as Show[]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar os shows');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => { void carregar(); }, [inicio, fim]);
  useEffect(() => {
    supabase.from('fornecedores').select('id, nome, tipo').eq('status', 'ativo').in('tipo', ['musico', 'geral']).order('nome')
      .then(({ data }) => setFornecedores(((data || []) as Fornecedor[]).sort((a, b) =>
        a.tipo === b.tipo ? a.nome.localeCompare(b.nome) : a.tipo === 'musico' ? -1 : 1)));
  }, []);

  // O show aberto no histórico acompanha a lista recarregada.
  useEffect(() => {
    if (detalhe) setDetalhe(shows.find(s => s.id === detalhe.id) || null);
  }, [shows]);

  const visiveis = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return shows.filter(s => {
      if (t && !`${s.nome || ''} ${s.contato || ''} ${s.fornecedor_nome || ''}`.toLowerCase().includes(t)) return false;
      const sit = situacao(s);
      if (filtro === 'todos') return true;
      if (filtro === 'a_pagar') return sit === 'pendente' || sit === 'parcial';
      return sit === filtro;
    });
  }, [shows, busca, filtro]);

  const totais = useMemo(() => {
    const ativos = shows.filter(s => s.status_pagamento !== 'cancelado');
    const aPagar = ativos.filter(s => saldoDe(s) > 0.004);
    return {
      shows: ativos.length,
      artistas: new Set(ativos.map(s => (s.nome || '').trim().toLowerCase())).size,
      cache: ativos.reduce((a, s) => a + (Number(s.valor_total_final) || 0), 0),
      pago: ativos.reduce((a, s) => a + (Number(s.valor_pago) || 0), 0),
      aPagar: aPagar.reduce((a, s) => a + saldoDe(s), 0),
      aPagarShows: aPagar.length,
      parciais: ativos.filter(s => situacao(s) === 'parcial').length,
      aMais: ativos.filter(s => situacao(s) === 'pago_a_mais'),
    };
  }, [shows]);

  const contagem = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of shows) c[situacao(s)] = (c[situacao(s)] || 0) + 1;
    return c;
  }, [shows]);

  const excluir = async (s: Show) => {
    if (!window.confirm(`Excluir o show de ${s.nome} em ${dataCurta(s.data_evento)}? A conta a pagar ligada a ele também sai do Financeiro, e o histórico de pagamentos deste show é apagado.`)) return;
    setErro(null);
    const { error } = await supabase.from('musicos').delete().eq('id', s.id);
    if (error) { setErro(error.message); return; }
    setAviso(`Show de ${s.nome} excluído.`);
    await carregar();
  };

  const periodo = `${dayjs(inicio).format('DD/MM/YYYY')} a ${dayjs(fim).format('DD/MM/YYYY')}`;
  const arquivo = `musicos-${dayjs(inicio).format('DD-MM-YYYY')}-a-${dayjs(fim).format('DD-MM-YYYY')}`;

  const exportarExcel = () => {
    if (!visiveis.length) { setErro('Não há shows para exportar.'); return; }
    exportToExcel(visiveis.map(s => [
      s.nome || '', s.contato || '', s.data_evento ? dayjs(s.data_evento).format('DD/MM/YYYY') : '',
      `${hora(s.horario_inicio)} - ${hora(s.horario_fim)}`, s.valor || 0, s.valor_consumo || 0, s.valor_adicional || 0,
      s.valor_total_final || 0, s.valor_pago || 0, saldoDe(s), SITUACAO[situacao(s)].rotulo, s.fornecedor_nome || '', s.observacoes || '',
    ]), arquivo, ['Nome', 'Contato', 'Data', 'Horário', 'Cachê', 'Consumo', 'Adicional', 'Total', 'Pago', 'Saldo', 'Situação', 'Fornecedor', 'Observações']);
  };

  const exportarPDF = () => {
    if (!visiveis.length) { setErro('Não há shows para exportar.'); return; }
    try {
      const r = new ReportGenerator({ title: 'Relatório de Músicos', subtitle: `Período: ${periodo}`, filename: arquivo, orientation: 'landscape' });
      let y = r.addHeader('RELATÓRIO DE MÚSICOS', `Período: ${periodo}`);
      y = r.addSection('Resumo do período', [], y);
      y = r.addTable(['Indicador', 'Valor'], [
        ['Shows', String(totais.shows)],
        ['Cachês', brl(totais.cache)],
        ['Pago', brl(totais.pago)],
        ['A pagar', `${brl(totais.aPagar)} (${totais.aPagarShows} shows)`],
      ], y);
      y = r.addSection('Shows', [], y);
      r.addTable(['Nome', 'Data', 'Horário', 'Total', 'Pago', 'Saldo', 'Situação'], visiveis.map(s => [
        s.nome || '', s.data_evento ? dayjs(s.data_evento).format('DD/MM/YYYY') : '', `${hora(s.horario_inicio)} - ${hora(s.horario_fim)}`,
        brl(s.valor_total_final), brl(s.valor_pago), brl(saldoDe(s)), SITUACAO[situacao(s)].rotulo,
      ]), y);
      r.save(`${arquivo}.pdf`);
    } catch {
      setErro('Erro ao gerar o PDF. Tente de novo.');
    }
  };

  return (
    <div className="max-w-7xl mx-auto">
      <PageHeader
        caminho={['Operação', 'Músicos']}
        title="Músicos"
        subtitle="Agenda de shows e controle do pagamento dos cachês. Os pagamentos daqui não dão baixa no Financeiro."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button tamanho="sm" variante="discreto" icone={<Sparkles size={14} />} onClick={() => setImportando(true)}>Importar agenda</Button>
            <Button tamanho="sm" icone={<Download size={14} />} onClick={exportarExcel}>Excel</Button>
            <Button tamanho="sm" icone={<FileText size={14} />} onClick={exportarPDF}>PDF</Button>
            <Button variante="primario" icone={<Plus size={16} />} onClick={() => setEditando({ data_evento: dayjs().format('YYYY-MM-DD') })}>Novo show</Button>
          </div>
        }
      />

      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-certo mb-3">{aviso}</div>}

      <div className="flex flex-wrap items-center gap-2 mb-4">
        <IconButton aria-label="Mês anterior" onClick={() => irParaMes(mes.subtract(1, 'month'))}><ChevronLeft size={16} /></IconButton>
        <span className="t-subsec capitalize" style={{ minWidth: 170, textAlign: 'center' }}>{mes.format('MMMM [de] YYYY')}</span>
        <IconButton aria-label="Próximo mês" onClick={() => irParaMes(mes.add(1, 'month'))}><ChevronRight size={16} /></IconButton>
        <Button tamanho="sm" variante="discreto" onClick={() => irParaMes(dayjs())}>Hoje</Button>
        <div className="flex items-center gap-2 ml-auto">
          <Input aria-label="De" type="date" value={inicio} onChange={e => setInicio(e.target.value)} />
          <span className="t-caption">até</span>
          <Input aria-label="Até" type="date" value={fim} onChange={e => setFim(e.target.value)} />
          <IconButton aria-label="Atualizar" onClick={carregar} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton>
        </div>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <KPICard rotulo="shows" valor={totais.shows} detalhe={`${totais.artistas} artista${totais.artistas === 1 ? '' : 's'}`} />
        <KPICard rotulo="cachês" valor={brl(totais.cache)} detalhe={totais.shows ? `média ${brl(totais.cache / totais.shows)}` : 'no período'} tom="destaque" />
        <KPICard rotulo="pago" valor={brl(totais.pago)} detalhe={totais.cache ? `${Math.round((totais.pago / totais.cache) * 100)}% dos cachês` : '—'} tom="certo" />
        <KPICard rotulo="a pagar" valor={brl(totais.aPagar)} detalhe={`${totais.aPagarShows} show${totais.aPagarShows === 1 ? '' : 's'}${totais.parciais ? `, ${totais.parciais} parcial` : ''}`}
          tom={totais.aPagar > 0 ? 'atencao' : 'certo'} onClick={() => setFiltro('a_pagar')} />
        <KPICard rotulo="pago a mais" valor={totais.aMais.length} detalhe={totais.aMais.length ? brl(totais.aMais.reduce((a, s) => a - saldoDe(s), 0)) : 'nenhum'}
          tom={totais.aMais.length ? 'alerta' : 'normal'} onClick={totais.aMais.length ? () => setFiltro('pago_a_mais') : undefined} />
      </div>

      <Toolbar className="mb-3">
        <Segmented<Visao> rotulo="Visão" valor={visao} onMudar={setVisao}
          opcoes={[{ valor: 'lista', rotulo: 'Lista' }, { valor: 'calendario', rotulo: 'Calendário' }]} />
        <div className="flex flex-wrap gap-2">
          <Chip ligado={filtro === 'todos'} onMudar={() => setFiltro('todos')}>Todos {shows.length}</Chip>
          <Chip ligado={filtro === 'a_pagar'} onMudar={() => setFiltro('a_pagar')} tom="atencao">A pagar {(contagem.pendente || 0) + (contagem.parcial || 0)}</Chip>
          <Chip ligado={filtro === 'parcial'} onMudar={() => setFiltro('parcial')} tom="atencao">Parcial {contagem.parcial || 0}</Chip>
          <Chip ligado={filtro === 'pago'} onMudar={() => setFiltro('pago')} tom="certo">Pago {contagem.pago || 0}</Chip>
          {!!contagem.pago_a_mais && <Chip ligado={filtro === 'pago_a_mais'} onMudar={() => setFiltro('pago_a_mais')} tom="perigo">Pago a mais {contagem.pago_a_mais}</Chip>}
          {!!contagem.cancelado && <Chip ligado={filtro === 'cancelado'} onMudar={() => setFiltro('cancelado')}>Cancelado {contagem.cancelado}</Chip>}
        </div>
        <Toolbar.Espaco />
        <div className="relative" style={{ minWidth: 220 }}>
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-secondary)' }} />
          <input className="input-dark w-full" style={{ paddingLeft: 32 }} placeholder="Buscar artista" value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
      </Toolbar>

      {visao === 'lista' ? (
        <SectionCard noPadding>
          {carregando && !shows.length ? (
            <p className="t-body px-5 py-8" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>
          ) : visiveis.length === 0 ? (
            <EmptyState icon={Music} compact variant={shows.length ? 'filtered' : 'empty'}
              title={shows.length ? 'Nenhum show com esse filtro' : 'Nenhum show no período'}
              description={shows.length ? 'Troque o filtro ou a busca.' : 'Lance um show ou importe a agenda.'}
              action={shows.length ? { label: 'Ver todos', onClick: () => { setFiltro('todos'); setBusca(''); } } : { label: 'Novo show', onClick: () => setEditando({ data_evento: dayjs().format('YYYY-MM-DD') }) }} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    <th className="px-4 py-2.5 text-left">Data</th>
                    <th className="px-4 py-2.5 text-left">Artista</th>
                    <th className="px-4 py-2.5 text-right">Total</th>
                    <th className="px-4 py-2.5 text-right">Pago</th>
                    <th className="px-4 py-2.5 text-right">Saldo</th>
                    <th className="px-4 py-2.5 text-left">Situação</th>
                    <th className="px-4 py-2.5 text-right" aria-label="Ações" />
                  </tr>
                </thead>
                <tbody>
                  {visiveis.map(s => {
                    const sit = situacao(s);
                    const saldo = saldoDe(s);
                    const passou = s.data_evento ? dayjs(s.data_evento).isBefore(dayjs(), 'day') : false;
                    return (
                      <tr key={s.id} className="transition-colors hover:bg-white/[0.04] cursor-pointer" style={{ borderBottom: '1px solid var(--border-subtle)', opacity: sit === 'cancelado' ? 0.55 : 1 }}
                        onClick={() => setDetalhe(s)}>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <p className="t-body num" style={{ margin: 0, fontWeight: 600 }}>{dataCurta(s.data_evento)}</p>
                          <p className="t-caption capitalize" style={{ margin: 0 }}>{s.data_evento ? dayjs(s.data_evento).format('ddd') : ''}{s.horario_inicio && ` · ${hora(s.horario_inicio)}`}</p>
                        </td>
                        <td className="px-4 py-3">
                          <p className="t-body" style={{ margin: 0, fontWeight: 500 }}>{s.nome || 'Sem nome'}</p>
                          <p className="t-caption" style={{ margin: 0 }}>
                            Cachê {brl(s.valor || 0)}
                            {s.valor_adicional > 0 && <span className="texto-certo"> + {brl(s.valor_adicional)}</span>}
                            {s.valor_consumo > 0 && <span className="texto-perigo"> − {brl(s.valor_consumo)} consumo</span>}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-right num" style={{ fontWeight: 600 }}>{brl(s.valor_total_final)}</td>
                        <td className="px-4 py-3 text-right num">{s.valor_pago > 0 ? brl(s.valor_pago) : <span className="t-caption">—</span>}</td>
                        <td className={`px-4 py-3 text-right num ${saldo > 0.004 ? (passou ? 'texto-atencao' : '') : saldo < -0.004 ? 'texto-perigo' : ''}`} style={{ fontWeight: 600 }}>
                          {sit === 'cancelado' ? <span className="t-caption">—</span> : Math.abs(saldo) < 0.005 ? <span className="t-caption">zerado</span> : brl(saldo)}
                        </td>
                        <td className="px-4 py-3"><Badge variant={SITUACAO[sit].variante}>{SITUACAO[sit].rotulo}</Badge></td>
                        <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                          <div className="flex items-center justify-end gap-1">
                            {(sit === 'pendente' || sit === 'parcial') && <Button tamanho="sm" icone={<Wallet size={14} />} onClick={() => setPagando(s)}>Pagar</Button>}
                            <IconButton aria-label="Histórico de pagamentos" title="Histórico de pagamentos" onClick={() => setDetalhe(s)}><History size={14} /></IconButton>
                            <IconButton aria-label="Editar show" title="Editar" onClick={() => setEditando(s)}><Pencil size={14} /></IconButton>
                            <IconButton aria-label="Excluir show" title="Excluir" tom="perigo" onClick={() => excluir(s)}><Trash2 size={14} /></IconButton>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr style={{ borderTop: '1px solid var(--border)' }}>
                    <td className="px-4 py-3 t-label" colSpan={2}>{visiveis.length} show{visiveis.length === 1 ? '' : 's'}</td>
                    <td className="px-4 py-3 text-right num" style={{ fontWeight: 600 }}>{brl(visiveis.filter(s => s.status_pagamento !== 'cancelado').reduce((a, s) => a + s.valor_total_final, 0))}</td>
                    <td className="px-4 py-3 text-right num" style={{ fontWeight: 600 }}>{brl(visiveis.filter(s => s.status_pagamento !== 'cancelado').reduce((a, s) => a + s.valor_pago, 0))}</td>
                    <td className="px-4 py-3 text-right num" style={{ fontWeight: 600 }}>{brl(visiveis.reduce((a, s) => a + saldoDe(s), 0))}</td>
                    <td colSpan={2} />
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </SectionCard>
      ) : (
        <Calendario mes={mes} shows={visiveis} onAbrir={setDetalhe} onNovo={d => setEditando({ data_evento: d })} />
      )}

      {editando && (
        <FormShow inicial={editando} fornecedores={fornecedores} onFechar={() => setEditando(null)}
          onSalvo={async m => { setEditando(null); setAviso(m); await carregar(); }} />
      )}
      {pagando && (
        <Pagar show={pagando} onFechar={() => setPagando(null)}
          onFeito={async m => { setPagando(null); setAviso(m); await carregar(); }} />
      )}
      {detalhe && (
        <Detalhe show={detalhe} onFechar={() => setDetalhe(null)} onPagar={() => setPagando(detalhe)} onEditar={() => { setEditando(detalhe); setDetalhe(null); }}
          onMudou={async m => { setAviso(m); await carregar(); }} />
      )}

      <ImportarAgendaMusicosIA isOpen={importando} onClose={() => setImportando(false)}
        onImportado={q => { void carregar(); if (q > 0) setAviso(`${q} show(s) lançados a partir da agenda.`); }} />
    </div>
  );
};

// ── Calendário ──────────────────────────────────────────────────────────────
const COR_SITUACAO: Record<Situacao, string> = {
  pendente: 'var(--warn-text)', parcial: 'var(--info-text, #93c5fd)', pago: 'var(--ok-text)',
  pago_a_mais: 'var(--danger-text)', cancelado: 'var(--text-secondary)', sem_valor: 'var(--text-secondary)',
};

const Calendario: React.FC<{ mes: dayjs.Dayjs; shows: Show[]; onAbrir: (s: Show) => void; onNovo: (data: string) => void }> = ({ mes, shows, onAbrir, onNovo }) => {
  const dias: dayjs.Dayjs[] = [];
  for (let d = mes.startOf('month').startOf('week'); !d.isAfter(mes.endOf('month').endOf('week'), 'day'); d = d.add(1, 'day')) dias.push(d);
  const porDia = new Map<string, Show[]>();
  for (const s of shows) {
    if (!s.data_evento) continue;
    const k = dayjs(s.data_evento).format('YYYY-MM-DD');
    porDia.set(k, [...(porDia.get(k) || []), s]);
  }
  return (
    <SectionCard noPadding>
      <div className="grid grid-cols-7" style={{ borderBottom: '1px solid var(--border)' }}>
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => <div key={d} className="t-label px-2 py-2 text-center" style={{ color: 'var(--text-secondary)' }}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {dias.map(d => {
          const k = d.format('YYYY-MM-DD');
          const doMes = d.isSame(mes, 'month');
          const lista = porDia.get(k) || [];
          const hoje = d.isSame(dayjs(), 'day');
          return (
            <div key={k} className="min-h-[104px] p-1.5 flex flex-col gap-1" style={{ borderRight: '1px solid var(--border-subtle)', borderBottom: '1px solid var(--border-subtle)', opacity: doMes ? 1 : 0.35, boxShadow: hoje ? 'inset 0 0 0 2px var(--gold)' : undefined }}>
              <div className="flex items-center justify-between">
                <span className="t-caption num" style={{ color: hoje ? 'var(--gold)' : undefined, fontWeight: hoje ? 700 : 500 }}>{d.format('D')}</span>
                {doMes && <button type="button" className="btn-icon" style={{ width: 20, height: 20 }} aria-label={`Novo show em ${d.format('DD/MM')}`} onClick={() => onNovo(k)}><Plus size={12} /></button>}
              </div>
              {lista.map(s => {
                const sit = situacao(s);
                return (
                  <button key={s.id} type="button" onClick={() => onAbrir(s)} className="text-left rounded px-1.5 py-1 focus-ring"
                    style={{ background: 'var(--bg-hover)', borderLeft: `3px solid ${COR_SITUACAO[sit]}` }}
                    title={`${s.nome} · ${hora(s.horario_inicio)} · ${brl(s.valor_total_final)} · ${SITUACAO[sit].rotulo}`}>
                    <p className="t-caption truncate" style={{ margin: 0, color: 'var(--text-primary)', fontWeight: 600 }}>{s.nome}</p>
                    <p className="t-caption num" style={{ margin: 0 }}>{hora(s.horario_inicio)} · {brl(s.valor_total_final)}</p>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="flex flex-wrap gap-4 px-4 py-3">
        {(['pendente', 'parcial', 'pago', 'pago_a_mais', 'cancelado'] as Situacao[]).map(s => (
          <span key={s} className="t-caption flex items-center gap-1.5"><span style={{ width: 10, height: 10, borderRadius: 2, background: COR_SITUACAO[s] }} />{SITUACAO[s].rotulo}</span>
        ))}
      </div>
    </SectionCard>
  );
};

// ── Registrar pagamento ─────────────────────────────────────────────────────
const Pagar: React.FC<{ show: Show; onFechar: () => void; onFeito: (m: string) => Promise<void> }> = ({ show, onFechar, onFeito }) => {
  const saldo = Math.max(0, saldoDe(show));
  const [valor, setValor] = useState(saldo ? saldo.toFixed(2).replace('.', ',') : '');
  const [data, setData] = useState(dayjs().format('YYYY-MM-DD'));
  const [forma, setForma] = useState('PIX');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const v = num(valor);
  const sobra = saldo - v;

  const confirmar = async () => {
    if (v <= 0) { setErro('Informe o valor pago.'); return; }
    setOcupado(true); setErro(null);
    const { data: r, error } = await supabase.rpc('fn_musico_pagar', { p_musico: show.id, p_valor: v, p_data: data, p_forma: forma, p_obs: obs || null });
    if (error) { setErro(error.message); setOcupado(false); return; }
    const res = r as { saldo: number };
    await onFeito(res.saldo > 0.004 ? `${show.nome}: ${brl(v)} lançado. Ainda falta ${brl(res.saldo)}.` : `${show.nome}: ${brl(v)} lançado. Show quitado.`);
  };

  return (
    <Modal aberto onFechar={onFechar} travado={ocupado} titulo={`Pagar ${show.nome || 'músico'}`}
      descricao={`Show de ${dataCurta(show.data_evento)}. Controle desta tela: não dá baixa no Financeiro.`}
      rodape={<><Button onClick={onFechar} disabled={ocupado}>Cancelar</Button><Button variante="primario" icone={<Check size={16} />} onClick={confirmar} carregando={ocupado}>Lançar pagamento</Button></>}>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <div className="grid grid-cols-3 gap-2 mb-4">
        <Resumo rotulo="Total" valor={brl(show.valor_total_final)} />
        <Resumo rotulo="Já pago" valor={brl(show.valor_pago)} />
        <Resumo rotulo="Falta" valor={brl(saldo)} destaque />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Input rotulo="Valor pago (R$)" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} autoFocus
          dica={v > 0 && sobra > 0.004 ? `Parcial: vai faltar ${brl(sobra)}` : v > 0 && sobra < -0.004 ? `Passa ${brl(-sobra)} do que falta` : 'Pode ser parcial.'} />
        <Input rotulo="Data" type="date" value={data} onChange={e => setData(e.target.value)} />
        <Select rotulo="Forma" value={forma} onChange={e => setForma(e.target.value)}>
          {FORMAS.map(f => <option key={f} value={f}>{f}</option>)}
        </Select>
        <Input rotulo="Observação" value={obs} onChange={e => setObs(e.target.value)} placeholder="Opcional" />
      </div>
      {v > 0 && sobra < -0.004 && <div className="aviso aviso-atencao mt-3">O valor passa do que falta. O show vai ficar como <strong>pago a mais</strong>.</div>}
    </Modal>
  );
};

const Resumo: React.FC<{ rotulo: string; valor: string; destaque?: boolean }> = ({ rotulo, valor, destaque }) => (
  <div className="rounded px-3 py-2" style={{ background: 'var(--bg-hover)', border: '1px solid var(--border-subtle)' }}>
    <p className="t-caption" style={{ margin: 0 }}>{rotulo}</p>
    <p className="t-body num" style={{ margin: 0, fontWeight: 700, color: destaque ? 'var(--gold)' : undefined }}>{valor}</p>
  </div>
);

// ── Detalhe e histórico ─────────────────────────────────────────────────────
const Detalhe: React.FC<{ show: Show; onFechar: () => void; onPagar: () => void; onEditar: () => void; onMudou: (m: string) => Promise<void> }> = ({ show, onFechar, onPagar, onEditar, onMudou }) => {
  const [pagamentos, setPagamentos] = useState<Pagamento[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [estornando, setEstornando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState('');
  const [ocupado, setOcupado] = useState(false);
  const sit = situacao(show);

  const carregar = async () => {
    const { data, error } = await supabase.from('musicos_pagamentos').select('*').eq('musico_id', show.id).order('data_pagamento').order('criado_em');
    if (error) setErro(error.message); else setPagamentos((data || []) as Pagamento[]);
  };
  useEffect(() => { void carregar(); }, [show.id, show.valor_pago]);

  const estornar = async (p: Pagamento) => {
    if (!motivo.trim()) { setErro('Diga o motivo do estorno.'); return; }
    setOcupado(true); setErro(null);
    const { error } = await supabase.rpc('fn_musico_estornar', { p_pagamento: p.id, p_motivo: motivo.trim() });
    setOcupado(false);
    if (error) { setErro(error.message); return; }
    setEstornando(null); setMotivo('');
    await onMudou(`Pagamento de ${brl(p.valor)} estornado.`);
    await carregar();
  };

  return (
    <Modal aberto onFechar={onFechar} largura="lg" titulo={show.nome || 'Show'}
      descricao={`${show.data_evento ? dayjs(show.data_evento).format('dddd, DD/MM/YYYY') : ''}${show.horario_inicio ? ` · ${hora(show.horario_inicio)} às ${hora(show.horario_fim)}` : ''}${show.contato ? ` · ${show.contato}` : ''}`}
      rodape={<>
        <Button icone={<Pencil size={14} />} onClick={onEditar}>Editar show</Button>
        {(sit === 'pendente' || sit === 'parcial') && <Button variante="primario" icone={<Wallet size={16} />} onClick={onPagar}>Registrar pagamento</Button>}
      </>}>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <Resumo rotulo="Cachê" valor={brl(show.valor || 0)} />
        <Resumo rotulo="Total do show" valor={brl(show.valor_total_final)} />
        <Resumo rotulo="Pago" valor={brl(show.valor_pago)} />
        <Resumo rotulo={saldoDe(show) < 0 ? 'Pago a mais' : 'Falta'} valor={brl(Math.abs(saldoDe(show)))} destaque />
      </div>
      <div className="flex items-center gap-2 mb-2">
        <span className="t-label" style={{ color: 'var(--text-secondary)' }}>Histórico de pagamentos</span>
        <Badge variant={SITUACAO[sit].variante}>{SITUACAO[sit].rotulo}</Badge>
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
                    {p.observacao || (p.tipo === 'saldo_inicial' ? 'Já estava pago antes do histórico' : '')}
                    {p.criado_por_nome && ` · ${p.criado_por_nome}`}
                    {p.estornado_em && ` · estornado por ${p.estornado_por_nome || '—'} em ${dayjs(p.estornado_em).format('DD/MM')}: ${p.motivo_estorno}`}
                  </p>
                </div>
                <span className="t-body num" style={{ fontWeight: 700 }}>{brl(p.valor)}</span>
                {!p.estornado_em && estornando !== p.id && (
                  <Button tamanho="sm" variante="discreto" icone={<Undo2 size={14} />} onClick={() => { setEstornando(p.id); setMotivo(''); }}>Estornar</Button>
                )}
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
      {(show.observacoes || show.material_promocional) && (
        <div className="mt-4 flex flex-col gap-1">
          {show.observacoes && <p className="t-caption" style={{ margin: 0 }}><strong>Observações:</strong> {show.observacoes}</p>}
          {show.material_promocional && <p className="t-caption" style={{ margin: 0 }}><strong>Material:</strong> {show.material_promocional}</p>}
        </div>
      )}
    </Modal>
  );
};

// ── Cadastro do show ────────────────────────────────────────────────────────
const FormShow: React.FC<{ inicial: Partial<Show>; fornecedores: Fornecedor[]; onFechar: () => void; onSalvo: (m: string) => Promise<void> }> = ({ inicial, fornecedores, onFechar, onSalvo }) => {
  const novo = !inicial.id;
  const [nome, setNome] = useState(inicial.nome || '');
  const [contato, setContato] = useState(inicial.contato || '');
  const [fornecedorId, setFornecedorId] = useState(inicial.fornecedor_id || '');
  const [sugerido, setSugerido] = useState('');
  const [data, setData] = useState(inicial.data_evento ? dayjs(inicial.data_evento).format('YYYY-MM-DD') : dayjs().format('YYYY-MM-DD'));
  const [hIni, setHIni] = useState(hora(inicial.horario_inicio || null) || '20:00');
  const [hFim, setHFim] = useState(hora(inicial.horario_fim || null) || '23:00');
  const [valor, setValor] = useState(inicial.valor ? String(inicial.valor).replace('.', ',') : '');
  const [consumo, setConsumo] = useState(inicial.valor_consumo ? String(inicial.valor_consumo).replace('.', ',') : '');
  const [adicional, setAdicional] = useState(inicial.valor_adicional ? String(inicial.valor_adicional).replace('.', ',') : '');
  const [material, setMaterial] = useState(inicial.material_promocional || '');
  const [obs, setObs] = useState(inicial.observacoes || '');
  const [cancelado, setCancelado] = useState(inicial.status_pagamento === 'cancelado');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const total = Math.max(0, num(valor) + num(adicional) - num(consumo));
  const pago = Number(inicial.valor_pago) || 0;

  useEffect(() => {
    if (!novo || !nome.trim() || !fornecedores.length) return;
    const melhor = fornecedores.map(f => ({ id: f.id, nota: parecido(nome, f.nome) })).sort((a, b) => b.nota - a.nota)[0];
    if (melhor && melhor.nota >= 60) {
      setSugerido(melhor.id);
      setFornecedorId(atual => atual || melhor.id);
    } else setSugerido('');
  }, [nome, fornecedores, novo]);

  const salvar = async () => {
    if (!nome.trim() || !data || num(valor) <= 0) { setErro('Preencha nome, data e o valor do cachê.'); return; }
    setOcupado(true); setErro(null);
    try {
      let fid = fornecedorId;
      if (!fid && novo) {
        const { data: existe } = await supabase.from('fornecedores').select('id').eq('nome', nome.trim()).eq('tipo', 'musico').maybeSingle();
        if (existe) fid = existe.id;
        else {
          const { data: criado, error } = await supabase.from('fornecedores').insert([{
            nome: nome.trim(), telefone: contato.trim() || null, status: 'ativo', tipo: 'musico', observacoes: 'Cadastrado automaticamente via módulo de Músicos',
          }]).select('id').single();
          if (error) throw error;
          fid = criado.id;
        }
      }
      const linha = {
        nome: nome.trim(), contato: contato.trim() || null, data_evento: data, horario_inicio: hIni || null, horario_fim: hFim || null,
        valor: num(valor), valor_consumo: num(consumo), valor_adicional: num(adicional), material_promocional: material.trim() || null,
        observacoes: obs.trim() || null, fornecedor_id: fid || null,
        // O banco recalcula total, saldo e situação; aqui só se marca o cancelamento.
        status_pagamento: cancelado ? 'cancelado' : 'pendente',
      };
      const { error } = novo
        ? await supabase.from('musicos').insert([linha])
        : await supabase.from('musicos').update(linha).eq('id', inicial.id!);
      if (error) throw error;
      await onSalvo(novo ? `Show de ${linha.nome} lançado.` : `Show de ${linha.nome} atualizado.`);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao salvar');
      setOcupado(false);
    }
  };

  return (
    <Modal aberto onFechar={onFechar} largura="lg" travado={ocupado} titulo={novo ? 'Novo show' : 'Editar show'}
      descricao="O show gera a conta a pagar no Financeiro. Os pagamentos se lançam depois, no botão Pagar."
      rodape={<><Button onClick={onFechar} disabled={ocupado}>Cancelar</Button><Button variante="primario" icone={<Check size={16} />} onClick={salvar} carregando={ocupado}>Salvar</Button></>}>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Input rotulo="Músico ou banda" value={nome} onChange={e => setNome(e.target.value)} autoFocus className="md:col-span-2" placeholder="Ex.: Wender e Falcão" />
        <Input rotulo="Contato" value={contato} onChange={e => setContato(e.target.value)} placeholder="Telefone" />
        <div>
          <SearchableSelect label="Fornecedor (para o Financeiro)" theme="dark"
            options={fornecedores.map(f => ({ value: f.id, label: f.nome, sublabel: f.tipo === 'musico' ? 'Músico' : undefined }))}
            value={fornecedorId} onChange={v => { setFornecedorId(v); setSugerido(''); }} placeholder="Buscar fornecedor…" emptyMessage="Nenhum fornecedor" />
          <p className="t-caption mt-1" style={{ margin: 0 }}>
            {sugerido && fornecedorId === sugerido ? <span className="texto-certo">Achado pelo nome. Confira.</span> : novo ? 'Sem fornecedor, o sistema cadastra um com o nome do músico.' : ''}
          </p>
        </div>
        <Input rotulo="Data" type="date" value={data} onChange={e => setData(e.target.value)} />
        <div className="grid grid-cols-2 gap-3">
          <Input rotulo="Início" type="time" value={hIni} onChange={e => setHIni(e.target.value)} />
          <Input rotulo="Fim" type="time" value={hFim} onChange={e => setHFim(e.target.value)} />
        </div>
        <Input rotulo="Cachê (R$)" inputMode="decimal" value={valor} onChange={e => setValor(e.target.value)} placeholder="0,00" />
        <div className="grid grid-cols-2 gap-3">
          <Input rotulo="Adicional (R$)" inputMode="decimal" value={adicional} onChange={e => setAdicional(e.target.value)} placeholder="0,00" dica="Hora extra, repertório" />
          <Input rotulo="Consumo (R$)" inputMode="decimal" value={consumo} onChange={e => setConsumo(e.target.value)} placeholder="0,00" dica="Desconta do cachê" />
        </div>
        <Input rotulo="Material promocional" value={material} onChange={e => setMaterial(e.target.value)} className="md:col-span-2" placeholder="Instagram, link, release" />
        <Textarea rotulo="Observações" value={obs} onChange={e => setObs(e.target.value)} rows={2} className="md:col-span-2" />
      </div>
      <div className="grid grid-cols-3 gap-2 mt-4">
        <Resumo rotulo="Total do show" valor={brl(total)} destaque />
        <Resumo rotulo="Já pago" valor={brl(pago)} />
        <Resumo rotulo={total - pago < 0 ? 'Pago a mais' : 'Vai faltar'} valor={brl(Math.abs(total - pago))} />
      </div>
      {!novo && (
        <label className="flex items-center gap-2 t-body mt-4">
          <input type="checkbox" checked={cancelado} onChange={e => setCancelado(e.target.checked)} />
          <Ban size={14} /> Show cancelado (sai do a pagar e cancela a conta no Financeiro)
        </label>
      )}
    </Modal>
  );
};

export default Musicians;
