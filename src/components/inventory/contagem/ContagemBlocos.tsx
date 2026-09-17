import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, History, Loader2, Play, Eye, AlertTriangle, RefreshCw, Layers, Trash2, CheckCircle2 } from 'lucide-react';
import dayjs from 'dayjs';
import type { BlocoResumo, Contagem, Estoque, PainelBlocos } from './types';
import { nomeBloco } from './types';
import * as service from './contagemService';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';

/**
 * Contagem do dia, por blocos. Uma lista só, em ordem do que importa:
 * em andamento → para contar hoje → concluídos hoje → próximos.
 * Cada linha: bloco, itens, última contagem, ciclo (editável), botão.
 */

interface Props {
  onAbrirContagem: (contagemId: string) => void;
  onVerResultado: (contagemId: string) => void;
  onHistorico: () => void;
  onContagemCompleta: () => void;
}

const CHIP: Record<BlocoResumo['situacao'], { cls: string; label: string }> = {
  em_andamento:   { cls: 'bg-blue-500/15 text-blue-300',   label: 'em andamento' },
  atrasado:       { cls: 'bg-red-500/15 text-red-300',     label: 'atrasado' },
  vence_hoje:     { cls: 'bg-amber-500/15 text-amber-300', label: 'vence hoje' },
  nunca:          { cls: 'bg-white/10 text-white/60',      label: 'nunca contado' },
  em_dia:         { cls: 'bg-green-500/10 text-green-300', label: 'em dia' },
  concluido_hoje: { cls: 'bg-green-500/15 text-green-300', label: 'concluído hoje' },
};
const CICLOS = [1, 2, 3, 7, 15, 30];
const chave = 'contagem:estoque';

const ContagemBlocos: React.FC<Props> = ({ onAbrirContagem, onVerResultado, onHistorico, onContagemCompleta }) => {
  const { usuario } = useAuth();
  const [estoques, setEstoques] = useState<Estoque[]>([]);
  const [estoqueId, setEstoqueId] = useState<string>(() => { try { return localStorage.getItem(chave) || ''; } catch { return ''; } });
  const [painel, setPainel] = useState<PainelBlocos | null>(null);
  const [antigas, setAntigas] = useState<Contagem[]>([]);
  const [loading, setLoading] = useState(true);
  const [abrindo, setAbrindo] = useState<string | null>(null);
  const [erro, setErro] = useState('');

  useEffect(() => {
    service.loadEstoques().then(lista => {
      setEstoques(lista);
      setEstoqueId(prev => (prev && lista.some(e => e.id === prev) ? prev : (lista.find(e => /central/i.test(e.nome))?.id ?? lista[0]?.id ?? '')));
    }).catch(e => setErro(e instanceof Error ? e.message : String(e)));
  }, []);

  const carregar = useCallback(async () => {
    if (!estoqueId) return;
    setLoading(true); setErro('');
    try {
      const [p, a] = await Promise.all([service.loadBlocos(estoqueId), service.loadContagensAtivas()]);
      setPainel(p);
      setAntigas(a.filter(c => !c.bloco));
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [estoqueId]);

  useEffect(() => { carregar(); try { if (estoqueId) localStorage.setItem(chave, estoqueId); } catch { /* sem storage */ } }, [carregar, estoqueId]);

  const abrir = async (b: BlocoResumo) => {
    if (!estoqueId) return;
    if (b.situacao === 'em_andamento' && b.contagem_hoje_id) { onAbrirContagem(b.contagem_hoje_id); return; }
    if (b.situacao === 'concluido_hoje' && !window.confirm(`${nomeBloco(b.bloco)} já foi concluído hoje. Contar de novo?`)) return;
    setAbrindo(b.bloco); setErro('');
    try { const r = await service.abrirBloco(estoqueId, b.bloco, usuario?.nome_completo); onAbrirContagem(r.id); }
    catch (e: unknown) { setErro(e instanceof Error ? e.message : String(e)); }
    finally { setAbrindo(null); }
  };

  const mudarCiclo = async (b: BlocoResumo, dias: number) => {
    setErro('');
    setPainel(prev => prev ? { ...prev, blocos: prev.blocos.map(x => (x.bloco === b.bloco ? { ...x, ciclo_dias: dias } : x)) } : prev);
    const { error } = await supabase.rpc('fn_contagem_ciclo_definir', { p_categoria: b.bloco, p_ciclo_dias: dias });
    if (error) { setErro(error.message); return; }
    carregar();
  };

  const cancelarAntiga = async (c: Contagem) => {
    if (!confirm('Cancelar esta contagem? Não pode ser desfeito.')) return;
    try { await service.cancelarContagem(c.id); carregar(); }
    catch (e: unknown) { setErro(e instanceof Error ? e.message : String(e)); }
  };

  const blocos = painel?.blocos ?? [];
  const secoes: { titulo: string; lista: BlocoResumo[]; cor: string }[] = [
    { titulo: 'Em andamento', lista: blocos.filter(b => b.situacao === 'em_andamento'), cor: 'text-blue-300' },
    { titulo: 'Para contar hoje', lista: blocos.filter(b => b.situacao === 'atrasado' || b.situacao === 'vence_hoje' || b.situacao === 'nunca'), cor: 'text-amber-300' },
    { titulo: 'Concluídos hoje', lista: blocos.filter(b => b.situacao === 'concluido_hoje'), cor: 'text-green-300' },
    { titulo: 'Próximos dias', lista: [...blocos.filter(b => b.situacao === 'em_dia')].sort((a, b) => (a.vence_em ?? '').localeCompare(b.vence_em ?? '')), cor: 'text-white/50' },
  ];
  const r = painel?.resumo;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
        <div>
          <h2 className="text-2xl font-bold text-white">Contagem do dia</h2>
          <p className="text-sm text-white/60 mt-1">Um bloco de cada vez. Conte, conclua, e o ajuste entra na hora.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={carregar} disabled={loading} className="px-3 py-2 bg-white/5 border border-white/10 text-white/60 rounded-xl hover:bg-white/10 text-sm disabled:opacity-50" title="Atualizar"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <button onClick={onHistorico} className="px-3 py-2 bg-white/5 border border-white/10 text-white/80 rounded-xl hover:bg-white/10 flex items-center gap-2 text-sm font-medium"><History className="w-4 h-4" /> Histórico</button>
          <button onClick={onContagemCompleta} className="px-3 py-2 bg-white/5 border border-white/10 text-white/50 rounded-xl hover:bg-white/10 flex items-center gap-2 text-sm" title="Abrir o estoque inteiro de uma vez"><Layers className="w-4 h-4" /> Completa</button>
        </div>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        {estoques.map(e => (
          <button key={e.id} onClick={() => setEstoqueId(e.id)} className={`px-4 py-2 rounded-xl text-sm font-semibold border ${estoqueId === e.id ? 'bg-wine text-white border-wine' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'}`}>{e.nome}</button>
        ))}
      </div>

      {erro && <div className="rounded-xl p-3 text-sm border bg-red-500/10 border-red-500/30 text-red-400 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> {erro}</div>}

      {r && painel && (
        <div className="bg-[#12141f] rounded-2xl border border-white/10 px-5 py-3.5 flex items-center gap-3 flex-wrap">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-wine to-gold flex items-center justify-center"><ClipboardCheck className="w-5 h-5 text-white" /></div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold">{painel.estoque.nome} · {dayjs(painel.hoje).format('DD/MM')}: {r.concluidos_hoje} de {r.devidos_hoje} {r.devidos_hoje === 1 ? 'bloco concluído' : 'blocos concluídos'}</p>
            <p className="text-sm text-white/60">{r.faltam_itens > 0 ? <><span className="text-amber-300 font-semibold">faltam {r.faltam_itens} itens</span> para fechar o dia</> : <span className="text-green-300">dia fechado, nada pendente</span>}</p>
          </div>
        </div>
      )}

      {loading && !painel ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-white/30" /></div>
      ) : (
        <div className="bg-[#12141f] rounded-2xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="bg-[#0c1018] text-white/50 text-xs">
              <th className="px-4 py-2 text-left font-medium">Bloco</th>
              <th className="px-3 py-2 text-right font-medium w-20">Itens</th>
              <th className="px-3 py-2 text-left font-medium w-28">Última</th>
              <th className="px-3 py-2 text-left font-medium w-32">Ciclo</th>
              <th className="px-3 py-2 text-left font-medium w-36">Situação</th>
              <th className="px-3 py-2 text-right font-medium w-44"></th>
            </tr></thead>
            <tbody className="divide-y divide-white/5">
              {secoes.filter(s => s.lista.length > 0).flatMap(s => [
                <tr key={`sec:${s.titulo}`} className="bg-white/[0.05]"><td colSpan={6} className={`px-4 py-1.5 text-[11px] font-semibold uppercase tracking-wide ${s.cor}`}>{s.titulo} <span className="normal-case font-normal text-white/30">· {s.lista.length}</span></td></tr>,
                ...s.lista.map(b => {
                  const chip = CHIP[b.situacao];
                  const pct = b.total_hoje > 0 ? Math.round((b.contados_hoje / b.total_hoje) * 100) : 0;
                  return (
                    <tr key={b.bloco} className={`hover:bg-white/[0.02] ${b.especial ? 'bg-amber-500/[0.04]' : ''}`}>
                      <td className="px-4 py-2">
                        <p className="text-white/90 font-medium">{nomeBloco(b.bloco)}</p>
                        {b.especial && <p className="text-[11px] text-amber-300/80">itens que a última contagem deixou em zero</p>}
                        {b.situacao === 'em_andamento' && <p className="text-[11px] text-blue-300">{b.contados_hoje} de {b.total_hoje} contados · faltam {Math.max(b.total_hoje - b.contados_hoje, 0)} ({pct}%)</p>}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-white/70">{b.itens}</td>
                      <td className="px-3 py-2 text-white/60 text-xs">{b.ultima_contagem ? dayjs(b.ultima_contagem).format('DD/MM') : '—'}</td>
                      <td className="px-3 py-2">
                        {b.especial ? <span className="text-xs text-white/40">—</span> : (
                          <select value={CICLOS.includes(b.ciclo_dias) ? b.ciclo_dias : b.ciclo_dias} onChange={e => mudarCiclo(b, Number(e.target.value))}
                            className="text-xs border border-white/10 rounded-md px-2 py-1 bg-[#0c1018] text-white/80 focus:outline-none">
                            {(CICLOS.includes(b.ciclo_dias) ? CICLOS : [...CICLOS, b.ciclo_dias].sort((x, y) => x - y)).map(d => <option key={d} value={d}>{d === 1 ? 'todo dia' : d === 2 ? 'dia sim, dia não' : `a cada ${d} dias`}</option>)}
                          </select>
                        )}
                      </td>
                      <td className="px-3 py-2"><span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full whitespace-nowrap ${chip.cls}`}>{chip.label}</span>{b.vence_em && b.situacao === 'em_dia' && <span className="ml-1.5 text-[11px] text-white/40">vence {dayjs(b.vence_em).format('DD/MM')}</span>}</td>
                      <td className="px-3 py-2 text-right">
                        <div className="inline-flex gap-1.5">
                          {b.situacao === 'concluido_hoje' && (
                            <button onClick={() => b.contagem_hoje_id && onVerResultado(b.contagem_hoje_id)} className="px-3 py-1.5 bg-white/5 border border-white/10 text-white/80 rounded-lg text-xs font-semibold hover:bg-white/10 inline-flex items-center gap-1.5"><Eye className="w-3.5 h-3.5" /> Resultado</button>
                          )}
                          <button onClick={() => abrir(b)} disabled={abrindo !== null}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 disabled:opacity-50 ${b.situacao === 'em_andamento' ? 'bg-blue-600 hover:bg-blue-700 text-white' : b.situacao === 'concluido_hoje' || b.situacao === 'em_dia' ? 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10' : 'bg-wine hover:bg-[#6a1a25] text-white'}`}>
                            {abrindo === b.bloco ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : b.situacao === 'concluido_hoje' ? <RefreshCw className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                            {b.situacao === 'em_andamento' ? 'Continuar' : b.situacao === 'concluido_hoje' ? 'Recontar' : 'Contar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }),
              ])}
              {blocos.length === 0 && painel && (
                <tr><td colSpan={6} className="px-4 py-10 text-center text-white/40"><CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />Nenhum bloco neste estoque.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {antigas.length > 0 && (
        <div className="bg-[#12141f] rounded-2xl border border-white/10 overflow-hidden">
          <p className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wide text-white/50 bg-white/[0.05]">Contagens completas em aberto · {antigas.length}</p>
          <div className="divide-y divide-white/5">
            {antigas.map(c => (
              <div key={c.id} className="px-4 py-2.5 flex items-center justify-between gap-3">
                <div className="min-w-0"><p className="text-sm text-white/90">{c.estoque_nome}</p><p className="text-xs text-white/50">{c.responsavel} · {dayjs(c.criado_em).format('DD/MM HH:mm')} · {c.status === 'finalizada' ? 'finalizada, sem processar' : 'em andamento'}</p></div>
                <div className="flex gap-1.5">
                  <button onClick={() => (c.status === 'finalizada' ? onVerResultado(c.id) : onAbrirContagem(c.id))} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">{c.status === 'finalizada' ? 'Resultado' : 'Continuar'}</button>
                  <button onClick={() => cancelarAntiga(c)} className="p-1.5 text-white/30 hover:text-red-400 rounded-lg" title="Cancelar"><Trash2 className="w-4 h-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ContagemBlocos;
