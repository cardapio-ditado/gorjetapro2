import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, CalendarDays, Check, ClipboardCheck, History, Plus, RefreshCw, X } from 'lucide-react';
import { Badge, Button, EmptyState, IconButton, Input, KPICard, Modal, PageHeader, SectionCard, Select } from '../ui';
import { centralContagemApi, fmt, type AgendaItem, type CentralTela, type SituacaoZona, type Zona, type ZonaFolha } from './api';
import { brl, semAcento } from './cadastros/api';
import { BarraBusca } from './Contagem';

interface Props { responsavel: string | null; usuarioId: string | null; onVoltar: () => void; onHistorico: () => void }

const nomeZona = (b: string) => (b === '__zerados' ? 'Zerados na última contagem' : b);
const dataBR = (s: string | null) => (s ? new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : 'nunca');
const diaSemana = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '');
const addDias = (s: string, n: number) => { const d = new Date(`${s}T12:00:00`); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const SITUACAO: Record<SituacaoZona, { r: string; v: 'danger' | 'warning' | 'info' | 'success' | 'neutral' }> = {
  em_andamento: { r: 'em andamento', v: 'info' }, atrasado: { r: 'atrasada', v: 'danger' }, vence_hoje: { r: 'conta hoje', v: 'warning' }, nunca: { r: 'nunca contada', v: 'danger' },
  em_dia: { r: 'em dia', v: 'success' }, concluido_hoje: { r: 'feita hoje', v: 'success' }, sem_agenda: { r: 'sem agenda', v: 'neutral' },
};
const DEVIDA: SituacaoZona[] = ['em_andamento', 'atrasado', 'vence_hoje', 'nunca'];

/**
 * Contagem do Central por zonas (uma zona = uma categoria). Cada zona tem um
 * ciclo e pode estar na agenda da semana. Contar uma zona abre a folha; ao
 * concluir, o ajuste entra no saldo na hora (o Central não passa por aprovação).
 */
const ContagemCentral: React.FC<Props> = ({ responsavel, usuarioId, onVoltar, onHistorico }) => {
  const [tela, setTela] = useState<CentralTela | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [folha, setFolha] = useState<ZonaFolha | null>(null);
  const [agendando, setAgendando] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [cicloDraft, setCicloDraft] = useState<Record<string, string>>({});
  const [verTodas, setVerTodas] = useState(false);

  const carregar = async () => {
    setCarregando(true); setErro(null);
    try { setTela(await centralContagemApi.tela()); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
    finally { setCarregando(false); }
  };
  useEffect(() => { void carregar(); }, []);

  const rodar = async (chave: string, fn: () => Promise<string | void>) => {
    setOcupado(chave); setErro(null);
    try { const m = await fn(); if (m) setAviso(m); await carregar(); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); }
    finally { setOcupado(null); }
  };
  const abrir = (z: Zona) => rodar(z.bloco, async () => { if (!tela) return; setFolha(await centralContagemApi.abrir(tela.estoque.id, z.bloco, responsavel)); });
  const salvarCiclo = (z: Zona) => {
    const t = cicloDraft[z.bloco]; if (t === undefined) return;
    const n = Number(t); setCicloDraft(p => { const c = { ...p }; delete c[z.bloco]; return c; });
    if (!Number.isFinite(n) || n < 1 || n > 90 || n === z.ciclo_dias) return;
    void rodar(`ciclo:${z.bloco}`, async () => { await centralContagemApi.ciclo(z.bloco, n); return `${z.bloco}: ciclo de ${n} dia(s).`; });
  };

  const zonas = tela?.zonas ?? [];
  const devidas = zonas.filter(z => DEVIDA.includes(z.situacao));
  const outras = zonas.filter(z => !DEVIDA.includes(z.situacao));
  const agendaPorDia = useMemo(() => {
    const m = new Map<string, AgendaItem[]>();
    for (const a of tela?.agenda ?? []) { if (!m.has(a.dia)) m.set(a.dia, []); m.get(a.dia)!.push(a); }
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [tela]);

  if (folha) return <Folha inicial={folha} usuarioId={usuarioId} onVoltar={() => setFolha(null)} onFeito={async m => { setFolha(null); setAviso(m); await carregar(); }} />;

  const r = tela?.resumo;
  const linhaZona = (z: Zona) => {
    const s = SITUACAO[z.situacao] || SITUACAO.sem_agenda;
    const feita = z.situacao === 'concluido_hoje';
    return (
      <div key={z.bloco} className="px-5 py-2 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
        <div className="flex-1 min-w-[200px]">
          <p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{nomeZona(z.bloco)} <span className="t-caption">· {z.itens} {z.itens === 1 ? 'item' : 'itens'}</span></p>
          <p className="t-caption" style={{ margin: 0 }}>
            última {dataBR(z.ultima_contagem)}{z.vence_em && !feita ? ` · ${tela?.tem_agenda ? 'agendada' : 'vence'} ${dataBR(z.vence_em)}` : ''}
            {z.situacao === 'em_andamento' && ` · ${z.contados_hoje} de ${z.total_hoje} contados`}
          </p>
        </div>
        {!z.especial && (
          <label className="flex items-center gap-1.5 t-caption whitespace-nowrap">ciclo
            <input type="number" min={1} max={90} aria-label={`Ciclo em dias de ${z.bloco}`} value={cicloDraft[z.bloco] ?? String(z.ciclo_dias)}
              onChange={e => setCicloDraft(p => ({ ...p, [z.bloco]: e.target.value }))} onBlur={() => salvarCiclo(z)} onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
              className="input-dark text-right" style={{ width: 56, height: 32 }} /> d
          </label>
        )}
        <Badge variant={s.v}>{s.r}</Badge>
        {feita
          ? <span style={{ width: 96 }} />
          : <Button tamanho="sm" variante={DEVIDA.includes(z.situacao) ? 'primario' : 'secundario'} icone={<ClipboardCheck size={14} />} onClick={() => abrir(z)} carregando={ocupado === z.bloco} disabled={!!ocupado && ocupado !== z.bloco}>{z.situacao === 'em_andamento' ? 'Continuar' : 'Contar'}</Button>}
      </div>
    );
  };

  return (
    <div className="max-w-5xl">
      <button type="button" onClick={onVoltar} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={14} /> Estoque Beta 2</button>
      <PageHeader caminho={['Estoque', 'Contagem']} title="Contagem do Central" subtitle="Por zonas, no ciclo de cada uma. Conte a zona do dia; ao concluir, o saldo acerta na hora."
        actions={<div className="flex items-center gap-2">
          <Button tamanho="sm" icone={<History size={14} />} onClick={onHistorico}>Histórico</Button>
          <Button tamanho="sm" icone={<CalendarDays size={14} />} onClick={() => setAgendando(true)} disabled={!tela}>Agendar</Button>
          <IconButton aria-label="Atualizar" onClick={carregar} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton>
        </div>} />
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-certo mb-3">{aviso}</div>}
      {!tela && !erro && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>}

      {r && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <KPICard rotulo="zonas para contar hoje" valor={r.devidos_hoje - r.concluidos_hoje} detalhe={`${r.concluidos_hoje} já feitas de ${r.devidos_hoje}`} tom={r.devidos_hoje - r.concluidos_hoje > 0 ? 'atencao' : 'certo'} />
          <KPICard rotulo="itens faltando" valor={r.faltam_itens} detalhe="nas zonas do dia" tom={r.faltam_itens ? 'atencao' : 'certo'} />
          <KPICard rotulo="em andamento" valor={r.em_andamento} detalhe="zonas abertas" tom={r.em_andamento ? 'destaque' : 'normal'} />
          <KPICard rotulo="zonas" valor={r.blocos} detalhe={tela?.tem_agenda ? 'com agenda semanal' : 'só pelo ciclo'} />
        </div>
      )}

      {tela && (
        <div className="flex flex-col gap-4">
          <SectionCard title="Hoje" descricao={devidas.length ? 'Atrasadas primeiro. Em andamento continua de onde parou.' : 'Nenhuma zona vence hoje.'} noPadding>
            {devidas.length === 0 ? <div className="p-4"><EmptyState icon={Check} title="Tudo em dia" compact /></div> : devidas.map(linhaZona)}
          </SectionCard>

          <SectionCard title="Agenda" descricao="Próximos 14 dias. Zona agendada vence no dia marcado." noPadding
            action={<Button tamanho="sm" icone={<Plus size={14} />} onClick={() => setAgendando(true)}>Agendar zona</Button>}>
            {agendaPorDia.length === 0 ? <div className="p-4"><EmptyState icon={CalendarDays} title="Sem agenda" description="Sem agenda, cada zona vence pelo ciclo. Agende para fixar os dias." compact /></div>
              : agendaPorDia.map(([dia, itens]) => (
                <div key={dia} className="px-5 py-2 flex flex-wrap items-start gap-3" style={{ borderBottom: '1px solid var(--border-subtle)', opacity: dia < (tela.hoje || '') ? 0.6 : 1 }}>
                  <div style={{ minWidth: 72 }}><p className="t-body" style={{ margin: 0, fontWeight: dia === tela.hoje ? 700 : 500, textTransform: 'capitalize' }}>{diaSemana(dia)} {dataBR(dia)}</p>{dia === tela.hoje && <p className="t-caption" style={{ margin: 0 }}>hoje</p>}</div>
                  <div className="flex-1 flex flex-wrap gap-1.5">
                    {itens.map(a => (
                      <span key={a.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-md t-caption" style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
                        {nomeZona(a.bloco)}
                        {a.situacao === 'feita' && <Check size={12} aria-label="feita" style={{ color: 'var(--ok-text)' }} />}
                        {a.situacao === 'perdida' && <span className="texto-perigo">· perdida</span>}
                        {a.situacao === 'em_andamento' && <span className="texto-atencao">· aberta</span>}
                        {(a.situacao === 'agendada' || a.situacao === 'hoje' || a.situacao === 'perdida') && <button type="button" aria-label={`Tirar ${a.bloco} da agenda`} className="focus-ring" style={{ color: 'var(--text-secondary)', lineHeight: 0 }} onClick={() => rodar(`ag:${a.id}`, async () => { await centralContagemApi.desagendar(a.id); })}><X size={12} /></button>}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
          </SectionCard>

          <SectionCard title={`Todas as zonas · ${zonas.length}`} descricao="Ciclo em dias: digite e saia do campo. Zonas feitas hoje ficam verdes." noPadding
            action={outras.length > 0 ? <Button tamanho="sm" variante="discreto" onClick={() => setVerTodas(v => !v)}>{verTodas ? 'Recolher' : `Mostrar ${outras.length} em dia`}</Button> : undefined}>
            {devidas.map(linhaZona)}
            {verTodas && outras.map(linhaZona)}
          </SectionCard>

          {tela.ultimas.length > 0 && (
            <SectionCard title="Últimas contagens do Central" descricao="Diferenças já entraram no saldo." noPadding action={<Button tamanho="sm" variante="discreto" icone={<History size={14} />} onClick={onHistorico}>Ver tudo</Button>}>
              {tela.ultimas.map(u => (
                <div key={u.id} className="px-5 py-2 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <div className="flex-1 min-w-[200px]">
                    <p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{nomeZona(u.bloco)}</p>
                    <p className="t-caption" style={{ margin: 0 }}>{dataBR(u.data)}{u.responsavel && ` · ${u.responsavel}`} · {u.contados} contados · {u.diferencas} com diferença</p>
                  </div>
                  <Badge variant={u.diferencas === 0 ? 'success' : u.valor < 0 ? 'danger' : 'warning'}>{u.diferencas === 0 ? 'bateu' : brl(u.valor)}</Badge>
                </div>
              ))}
            </SectionCard>
          )}
        </div>
      )}

      {agendando && tela && <Agendar tela={tela} onFechar={() => setAgendando(false)} onFeito={async m => { setAgendando(false); setAviso(m); await carregar(); }} />}
    </div>
  );
};

export default ContagemCentral;

// ── Agendar zona / repetir semana ───────────────────────────────────────────
const Agendar: React.FC<{ tela: CentralTela; onFechar: () => void; onFeito: (m: string) => Promise<void> }> = ({ tela, onFechar, onFeito }) => {
  const [bloco, setBloco] = useState(tela.zonas.find(z => !z.especial)?.bloco || '');
  const [dia, setDia] = useState(tela.hoje);
  const [semanas, setSemanas] = useState('4');
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const inicioSemana = useMemo(() => { const d = new Date(`${tela.hoje}T12:00:00`); const dow = (d.getDay() + 6) % 7; return addDias(tela.hoje, -dow); }, [tela.hoje]);
  const agendar = async () => {
    if (!bloco || !dia) { setErro('Escolha a zona e o dia.'); return; }
    setOcupado('agendar'); setErro(null);
    try { await centralContagemApi.agendar(tela.estoque.id, bloco, dia); await onFeito(`${nomeZona(bloco)} agendada para ${dataBR(dia)}.`); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); setOcupado(null); }
  };
  const repetir = async () => {
    const n = Number(semanas);
    if (!Number.isFinite(n) || n < 1 || n > 52) { setErro('Semanas entre 1 e 52.'); return; }
    if (!window.confirm(`Copiar a agenda desta semana (de ${dataBR(inicioSemana)}) para as próximas ${n} semana(s)?`)) return;
    setOcupado('repetir'); setErro(null);
    try { const c = await centralContagemApi.repetirSemana(tela.estoque.id, inicioSemana, n); await onFeito(`${c} agendamento(s) criados.`); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); setOcupado(null); }
  };
  return (
    <Modal aberto onFechar={onFechar} titulo="Agendar contagem" descricao="Fixe o dia de cada zona. Com agenda, a zona vence no dia marcado, não pelo ciclo." largura="md" travado={!!ocupado}
      rodape={<Button onClick={onFechar} disabled={!!ocupado}>Fechar</Button>}>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-end mb-5">
        <Select rotulo="Zona" value={bloco} onChange={e => setBloco(e.target.value)}>{tela.zonas.filter(z => !z.especial).map(z => <option key={z.bloco} value={z.bloco}>{z.bloco}</option>)}</Select>
        <Input rotulo="Dia" type="date" value={dia} min={tela.hoje} onChange={e => setDia(e.target.value)} />
        <Button variante="primario" icone={<Plus size={16} />} onClick={agendar} carregando={ocupado === 'agendar'}>Agendar</Button>
      </div>
      <p className="t-label mb-2" style={{ color: 'var(--text-secondary)' }}>Repetir a semana</p>
      <div className="grid grid-cols-[auto_1fr] gap-2 items-end">
        <Input rotulo="Semanas" type="number" min={1} max={52} value={semanas} onChange={e => setSemanas(e.target.value)} className="w-28" />
        <Button icone={<CalendarDays size={16} />} onClick={repetir} carregando={ocupado === 'repetir'}>Copiar esta semana para as próximas</Button>
      </div>
    </Modal>
  );
};

// ── A folha de uma zona ─────────────────────────────────────────────────────
const Folha: React.FC<{ inicial: ZonaFolha; usuarioId: string | null; onVoltar: () => void; onFeito: (m: string) => Promise<void> }> = ({ inicial, usuarioId, onVoltar, onFeito }) => {
  const [folha] = useState(inicial);
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(inicial.itens.map(i => [i.linha_id, i.contada === null ? '' : String(i.contada)])));
  const [busca, setBusca] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [concluindo, setConcluindo] = useState(false);
  const pendentes = useRef<Map<string, string>>(new Map());
  const timer = useRef<number | null>(null);
  const num = (s: string) => { const n = Number((s || '').replace(',', '.')); return s.trim() === '' || !Number.isFinite(n) ? null : n; };
  const contados = folha.itens.filter(i => (valores[i.linha_id] ?? '').trim() !== '').length;
  const b = semAcento(busca.trim());
  const visiveis = b ? folha.itens.filter(i => semAcento(i.nome).includes(b)) : folha.itens;

  const agendar = (linhaId: string, v: string) => {
    pendentes.current.set(linhaId, v);
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void gravar(), 700);
  };
  const gravar = async () => {
    if (pendentes.current.size === 0) return;
    const lote = [...pendentes.current.entries()].map(([linha_id, v]) => ({ linha_id, contada: num(v) }));
    pendentes.current.clear(); setSalvando(true);
    try { await centralContagemApi.anotar(folha.id, lote); setErro(null); }
    catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao gravar'); }
    finally { setSalvando(false); }
  };
  const concluir = async () => {
    if (timer.current) window.clearTimeout(timer.current);
    await gravar();
    const faltam = folha.itens.length - contados;
    const diffs = folha.itens.filter(i => { const n = num(valores[i.linha_id] ?? ''); return n !== null && n !== i.sistema; }).length;
    if (!window.confirm(`Concluir ${folha.nome}? ${diffs} item(ns) com diferença acertam o saldo do Central agora.${faltam > 0 ? ` ${faltam} sem contagem ficam como estão.` : ''}`)) return;
    setConcluindo(true); setErro(null);
    try {
      const r = await centralContagemApi.concluir(folha.id, usuarioId);
      await onFeito(`${folha.nome}: ${contados} contados, ${r.ajustes} acerto(s) no saldo, ${r.iguais} bateram.`);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao concluir'); }
    finally { setConcluindo(false); }
  };

  return (
    <div className="max-w-3xl pb-28">
      <button type="button" onClick={onVoltar} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={14} /> Contagem do Central</button>
      <PageHeader caminho={['Estoque', 'Contagem', 'Central']} title={folha.nome} subtitle="Conte o que tem na prateleira. Ao concluir, a diferença acerta o saldo do Central na hora." />
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      <BarraBusca valor={busca} onMudar={setBusca} />
      <section className="card">
        {visiveis.length === 0 && <div className="p-4"><EmptyState icon={ClipboardCheck} title="Nada com esse nome" variant="filtered" compact /></div>}
        {visiveis.map(i => {
          const v = valores[i.linha_id] ?? '';
          const n = num(v);
          const diff = n === null ? null : n - i.sistema;
          return (
            <div key={i.linha_id} className="px-4 py-2 flex items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="flex-1 min-w-0">
                <p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{i.nome}</p>
                <p className="t-caption" style={{ margin: 0 }}>
                  sistema {fmt(i.sistema)} {i.um}
                  {diff !== null && diff !== 0 && <span className={diff < 0 ? 'texto-perigo' : 'texto-atencao'}> · {diff > 0 ? '+' : ''}{fmt(diff)}{i.valor_unitario ? ` (${brl(diff * i.valor_unitario)})` : ''}</span>}
                </p>
              </div>
              <button type="button" className="btn-ghost" style={{ height: 32 }} onClick={() => { setValores(p => ({ ...p, [i.linha_id]: '0' })); agendar(i.linha_id, '0'); }} aria-label={`Zerar ${i.nome}`}>0</button>
              <input type="number" inputMode="decimal" min={0} step="any" aria-label={`Contado de ${i.nome}`} value={v}
                onChange={e => { setValores(p => ({ ...p, [i.linha_id]: e.target.value })); agendar(i.linha_id, e.target.value); }}
                className="input-dark text-right font-semibold" style={{ width: 96, borderColor: v.trim() === '' ? undefined : 'var(--ok-border)' }} />
            </div>
          );
        })}
      </section>
      <div className="fixed bottom-0 left-0 right-0 z-30 px-4 py-3 lg:pl-[calc(232px+28px)]" style={{ background: 'var(--bg-dark)', borderTop: '1px solid var(--border)' }}>
        <div className="max-w-3xl flex items-center justify-between gap-3">
          <span className="t-body" style={{ color: 'var(--text-secondary)' }}>{contados} de {folha.itens.length} contados{salvando ? ' · gravando…' : ''}</span>
          <Button variante="primario" tamanho="toque" icone={<Check size={20} />} onClick={concluir} carregando={concluindo} disabled={contados === 0}>Concluir zona</Button>
        </div>
      </div>
    </div>
  );
};
