import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Loader2, X, Copy, Trash2, AlertTriangle, CalendarDays, GripVertical, Check, Play } from 'lucide-react';
import dayjs from 'dayjs';
import type { AgendaItem, BlocoResumo } from './types';
import { nomeBloco } from './types';
import * as service from './contagemService';

/**
 * Calendário semanal da contagem. Arraste um bloco da lista da esquerda para
 * o dia; arraste entre dias para mover; X para tirar. "Replicar" copia a
 * semana para as próximas. O painel "Contagem do dia" obedece a esta agenda.
 */

interface Props {
  estoqueId: string;
  estoqueNome: string;
  blocos: BlocoResumo[];
  onAbrirContagem: (contagemId: string) => void;
  onAgendaMudou: () => void;
}

const DIAS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
const COR: Record<AgendaItem['situacao'], string> = {
  feita: 'bg-green-500/15 border-green-500/40 text-green-200',
  em_andamento: 'bg-blue-500/15 border-blue-500/40 text-blue-200',
  perdida: 'bg-red-500/10 border-red-500/40 text-red-300',
  hoje: 'bg-amber-500/15 border-amber-500/40 text-amber-200',
  agendada: 'bg-white/5 border-white/15 text-white/80',
};

const inicioSemana = (d: dayjs.Dayjs) => d.subtract((d.day() + 6) % 7, 'day').startOf('day');

const ContagemCalendario: React.FC<Props> = ({ estoqueId, estoqueNome, blocos, onAbrirContagem, onAgendaMudou }) => {
  const [semana, setSemana] = useState(() => inicioSemana(dayjs()));
  const [itens, setItens] = useState<AgendaItem[]>([]);
  const [hoje, setHoje] = useState(dayjs().format('YYYY-MM-DD'));
  const [loading, setLoading] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState('');
  const [sobre, setSobre] = useState<string | null>(null);
  const [semanasReplicar, setSemanasReplicar] = useState(4);

  const inicio = semana.format('YYYY-MM-DD');
  const fim = semana.add(6, 'day').format('YYYY-MM-DD');
  const dias = useMemo(() => Array.from({ length: 7 }, (_, i) => semana.add(i, 'day')), [semana]);

  const carregar = useCallback(async () => {
    setLoading(true); setErro('');
    try { const r = await service.loadAgenda(estoqueId, inicio, fim); setItens(r.itens); if (r.hoje) setHoje(r.hoje); }
    catch (e: unknown) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setLoading(false); }
  }, [estoqueId, inicio, fim]);
  useEffect(() => { carregar(); }, [carregar]);

  const porDia = useMemo(() => {
    const m: Record<string, AgendaItem[]> = {};
    for (const it of itens) (m[it.dia] ??= []).push(it);
    return m;
  }, [itens]);

  const contagemDaSemana = useMemo(() => new Set(itens.map(i => i.bloco)), [itens]);
  const blocosOrdenados = useMemo(() => [...blocos].sort((a, b) => (a.especial ? -1 : b.especial ? 1 : 0) || b.itens - a.itens), [blocos]);

  // ── Drag & drop nativo ──
  const arrastarBloco = (e: React.DragEvent, bloco: string) => { e.dataTransfer.setData('text/plain', JSON.stringify({ tipo: 'bloco', bloco })); e.dataTransfer.effectAllowed = 'copy'; };
  const arrastarItem = (e: React.DragEvent, item: AgendaItem) => { e.dataTransfer.setData('text/plain', JSON.stringify({ tipo: 'item', id: item.id, bloco: item.bloco })); e.dataTransfer.effectAllowed = 'move'; };

  const soltar = async (e: React.DragEvent, dia: string) => {
    e.preventDefault(); setSobre(null);
    let dados: { tipo: string; bloco?: string; id?: string };
    try { dados = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
    setOcupado(true); setErro('');
    try {
      if (dados.tipo === 'bloco' && dados.bloco) await service.agendar(estoqueId, dados.bloco, dia);
      else if (dados.tipo === 'item' && dados.id) await service.moverAgenda(dados.id, dia);
      await carregar(); onAgendaMudou();
    } catch (err: unknown) { setErro(err instanceof Error ? err.message : String(err)); }
    finally { setOcupado(false); }
  };

  const remover = async (item: AgendaItem) => {
    setOcupado(true); setErro('');
    try { await service.removerAgenda(item.id); setItens(prev => prev.filter(i => i.id !== item.id)); onAgendaMudou(); }
    catch (err: unknown) { setErro(err instanceof Error ? err.message : String(err)); }
    finally { setOcupado(false); }
  };

  const replicar = async () => {
    if (itens.length === 0) { setErro('Esta semana está vazia. Monte a semana primeiro.'); return; }
    if (!window.confirm(`Copiar esta semana (${itens.length} agendamentos) para as próximas ${semanasReplicar} semanas?`)) return;
    setOcupado(true); setErro('');
    try { const n = await service.replicarAgenda(estoqueId, inicio, semanasReplicar); window.alert(`${n} agendamentos criados.`); onAgendaMudou(); }
    catch (err: unknown) { setErro(err instanceof Error ? err.message : String(err)); }
    finally { setOcupado(false); }
  };

  const limpar = async () => {
    if (!window.confirm(`Apagar toda a agenda do ${estoqueNome} a partir de ${semana.format('DD/MM')}? As contagens já feitas não mudam.`)) return;
    setOcupado(true); setErro('');
    try { await service.limparAgenda(estoqueId, inicio); await carregar(); onAgendaMudou(); }
    catch (err: unknown) { setErro(err instanceof Error ? err.message : String(err)); }
    finally { setOcupado(false); }
  };

  return (
    <div className="space-y-3">
      <div className="bg-[#12141f] rounded-2xl border border-white/10 px-4 py-3 flex items-center gap-2 flex-wrap">
        <button onClick={() => setSemana(s => s.subtract(7, 'day'))} className="p-2 rounded-lg border border-white/10 text-white/60 hover:bg-white/10"><ChevronLeft className="w-4 h-4" /></button>
        <button onClick={() => setSemana(inicioSemana(dayjs()))} className="px-3 py-1.5 rounded-lg border border-white/10 text-xs text-white/70 hover:bg-white/10">Esta semana</button>
        <button onClick={() => setSemana(s => s.add(7, 'day'))} className="p-2 rounded-lg border border-white/10 text-white/60 hover:bg-white/10"><ChevronRight className="w-4 h-4" /></button>
        <p className="text-sm font-semibold text-white ml-1 flex items-center gap-2"><CalendarDays className="w-4 h-4 text-white/50" /> {semana.format('DD/MM')} a {semana.add(6, 'day').format('DD/MM')} · {estoqueNome}</p>
        <div className="ml-auto flex items-center gap-2 flex-wrap">
          <label className="text-xs text-white/60 flex items-center gap-1.5">
            replicar para
            <select value={semanasReplicar} onChange={e => setSemanasReplicar(Number(e.target.value))} className="text-xs border border-white/10 rounded-md px-2 py-1 bg-[#0c1018] text-white/80">
              {[1, 2, 4, 8, 12, 26].map(n => <option key={n} value={n}>{n} {n === 1 ? 'semana' : 'semanas'}</option>)}
            </select>
          </label>
          <button onClick={replicar} disabled={ocupado || itens.length === 0} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-wine text-white text-xs font-semibold hover:bg-[#6a1a25] disabled:opacity-50">
            {ocupado ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Copy className="w-3.5 h-3.5" />} Replicar semana
          </button>
          <button onClick={limpar} disabled={ocupado} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-white/10 text-xs text-white/40 hover:text-red-300 hover:border-red-500/30 disabled:opacity-50" title="Apagar a agenda daqui em diante"><Trash2 className="w-3.5 h-3.5" /> Limpar daqui em diante</button>
        </div>
      </div>

      {erro && <div className="rounded-xl p-3 text-sm border bg-red-500/10 border-red-500/30 text-red-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {erro}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-3">
        {/* Blocos para arrastar */}
        <div className="bg-[#12141f] rounded-2xl border border-white/10 p-3">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-white/50 mb-2">Blocos · arraste para o dia</p>
          <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
            {blocosOrdenados.map(b => (
              <div key={b.bloco} draggable onDragStart={e => arrastarBloco(e, b.bloco)}
                className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border cursor-grab active:cursor-grabbing select-none ${b.especial ? 'border-amber-500/40 bg-amber-500/10' : contagemDaSemana.has(b.bloco) ? 'border-white/10 bg-white/[0.03] text-white/50' : 'border-white/15 bg-white/5 text-white/90'}`}
                title={contagemDaSemana.has(b.bloco) ? 'já está nesta semana' : 'arraste para um dia'}>
                <GripVertical className="w-3.5 h-3.5 text-white/30 shrink-0" />
                <span className="text-xs font-medium truncate flex-1">{nomeBloco(b.bloco)}</span>
                <span className="text-[10px] text-white/40">{b.itens}</span>
                {contagemDaSemana.has(b.bloco) && <Check className="w-3 h-3 text-green-400" />}
              </div>
            ))}
          </div>
        </div>

        {/* Semana */}
        <div className="grid grid-cols-7 gap-1.5 min-w-0">
          {dias.map(d => {
            const chave = d.format('YYYY-MM-DD');
            const ehHoje = chave === hoje;
            const lista = porDia[chave] ?? [];
            return (
              <div key={chave} onDragOver={e => { e.preventDefault(); setSobre(chave); }} onDragLeave={() => setSobre(s => (s === chave ? null : s))} onDrop={e => soltar(e, chave)}
                className={`rounded-2xl border min-h-[220px] flex flex-col ${sobre === chave ? 'border-wine bg-wine/10' : ehHoje ? 'border-amber-500/40 bg-[#12141f]' : 'border-white/10 bg-[#12141f]'}`}>
                <div className={`px-2 py-1.5 text-center border-b border-white/5 ${ehHoje ? 'text-amber-300' : 'text-white/60'}`}>
                  <p className="text-[10px] uppercase tracking-wide">{DIAS[(d.day() + 6) % 7]}</p>
                  <p className="text-sm font-bold">{d.format('DD/MM')}</p>
                </div>
                <div className="p-1.5 space-y-1.5 flex-1">
                  {loading && lista.length === 0 && <div className="text-center text-white/20 py-4"><Loader2 className="w-4 h-4 animate-spin mx-auto" /></div>}
                  {lista.map(it => (
                    <div key={it.id} draggable={it.situacao !== 'feita'} onDragStart={e => arrastarItem(e, it)}
                      className={`group rounded-lg border px-2 py-1.5 text-[11px] leading-tight ${COR[it.situacao]} ${it.situacao !== 'feita' ? 'cursor-grab active:cursor-grabbing' : ''}`}>
                      <div className="flex items-start gap-1">
                        <span className="flex-1 font-medium break-words">{nomeBloco(it.bloco)}</span>
                        {it.situacao !== 'feita' && <button onClick={() => remover(it)} className="opacity-0 group-hover:opacity-100 text-current/60 hover:text-red-300" title="Tirar do dia"><X className="w-3 h-3" /></button>}
                      </div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[10px] opacity-80">{it.situacao === 'feita' ? 'feita ✓' : it.situacao === 'em_andamento' ? 'em andamento' : it.situacao === 'perdida' ? 'não feita' : it.situacao === 'hoje' ? 'hoje' : ''}</span>
                        {it.contagem_id && it.situacao === 'em_andamento' && <button onClick={() => onAbrirContagem(it.contagem_id!)} className="text-[10px] inline-flex items-center gap-0.5 underline"><Play className="w-2.5 h-2.5" /> abrir</button>}
                      </div>
                    </div>
                  ))}
                  {!loading && lista.length === 0 && <p className="text-center text-[10px] text-white/20 py-6">solte aqui</p>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-caption text-white/40 px-1">Arraste da lista para o dia. Entre dias, arraste o bloco. Cinza na lista = já está nesta semana. Com agenda montada, "Contagem do dia" obedece ao calendário; sem agenda, vale o ciclo.</p>
    </div>
  );
};

export default ContagemCalendario;
