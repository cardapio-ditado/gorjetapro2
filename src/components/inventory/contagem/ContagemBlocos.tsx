import React, { useCallback, useEffect, useState } from 'react';
import { ClipboardCheck, History, Loader2, Play, Eye, AlertTriangle, CheckCircle2, Clock, RefreshCw, Layers, Trash2 } from 'lucide-react';
import dayjs from 'dayjs';
import type { BlocoResumo, Contagem, Estoque, PainelBlocos } from './types';
import { nomeBloco } from './types';
import * as service from './contagemService';
import { useAuth } from '../../../contexts/AuthContext';

/**
 * Painel da contagem por blocos.
 *
 * Todo dia se conta, mas coisas diferentes: cada bloco (categoria) tem seu
 * ciclo — giro (carnes, hortifruti, bebidas) dia sim dia não; higiene, secos e
 * descartáveis toda semana; utensílios uma vez por mês. O painel mostra o
 * que vence hoje, o que está em andamento e quantos itens faltam.
 */

interface Props {
  onAbrirContagem: (contagemId: string) => void;
  onVerResultado: (contagemId: string) => void;
  onHistorico: () => void;
  onContagemCompleta: () => void;
}

const COR: Record<BlocoResumo['situacao'], { borda: string; chip: string; label: string }> = {
  em_andamento:   { borda: 'border-blue-500/40',  chip: 'bg-blue-500/15 text-blue-300',   label: 'Em andamento' },
  atrasado:       { borda: 'border-red-500/40',   chip: 'bg-red-500/15 text-red-300',     label: 'Atrasado' },
  vence_hoje:     { borda: 'border-amber-500/40', chip: 'bg-amber-500/15 text-amber-300', label: 'Vence hoje' },
  nunca:          { borda: 'border-white/15',     chip: 'bg-white/10 text-white/60',      label: 'Nunca contado' },
  em_dia:         { borda: 'border-white/10',     chip: 'bg-green-500/10 text-green-300', label: 'Em dia' },
  concluido_hoje: { borda: 'border-green-500/40', chip: 'bg-green-500/15 text-green-300', label: 'Concluído hoje' },
};

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
  const [mostrarEmDia, setMostrarEmDia] = useState(false);

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
      // Contagens antigas (sem bloco) ainda abertas: continuam acessíveis.
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
    if (b.situacao === 'concluido_hoje' && !window.confirm(`${nomeBloco(b.bloco)} já foi concluído hoje. Recontar?`)) return;
    setAbrindo(b.bloco); setErro('');
    try {
      const r = await service.abrirBloco(estoqueId, b.bloco, usuario?.nome_completo);
      onAbrirContagem(r.id);
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setAbrindo(null);
    }
  };

  const cancelarAntiga = async (c: Contagem) => {
    if (!confirm('Cancelar esta contagem? Não pode ser desfeito.')) return;
    try { await service.cancelarContagem(c.id); carregar(); }
    catch (e: unknown) { setErro(e instanceof Error ? e.message : String(e)); }
  };

  const blocos = painel?.blocos ?? [];
  const devidos = blocos.filter(b => b.situacao !== 'em_dia');
  const emDia = blocos.filter(b => b.situacao === 'em_dia');
  const r = painel?.resumo;

  return (
    <div className="space-y-5">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Contagem do dia</h2>
          <p className="text-sm text-white/60 mt-1">Um bloco de cada vez. Conte, conclua, e o ajuste entra na hora.</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <button onClick={carregar} disabled={loading} className="px-3 py-2.5 bg-white/5 border border-white/10 text-white/60 rounded-xl hover:bg-white/10 flex items-center gap-2 text-sm disabled:opacity-50">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button onClick={onHistorico} className="px-4 py-2.5 bg-white/5 border border-white/10 text-white/80 rounded-xl hover:bg-white/10 flex items-center gap-2 text-sm font-medium">
            <History className="w-4 h-4" /> Histórico
          </button>
          <button onClick={onContagemCompleta} className="px-4 py-2.5 bg-white/5 border border-white/10 text-white/50 rounded-xl hover:bg-white/10 flex items-center gap-2 text-sm" title="Abrir o estoque inteiro de uma vez (modo antigo)">
            <Layers className="w-4 h-4" /> Contagem completa
          </button>
        </div>
      </div>

      {/* Estoque */}
      <div className="flex items-center gap-2 flex-wrap">
        {estoques.map(e => (
          <button key={e.id} onClick={() => setEstoqueId(e.id)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${estoqueId === e.id ? 'bg-wine text-white border-wine' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'}`}>
            {e.nome}
          </button>
        ))}
      </div>

      {erro && (
        <div className="rounded-xl p-3 text-sm border bg-red-500/10 border-red-500/30 text-red-400 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4" /> {erro}
        </div>
      )}

      {/* Resumo do dia */}
      {r && painel && (
        <div className="bg-[#12141f] rounded-2xl border border-white/10 px-5 py-4 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-wine to-gold flex items-center justify-center"><ClipboardCheck className="w-5 h-5 text-white" /></div>
            <div>
              <p className="text-white font-bold">Hoje no {painel.estoque.nome}: {r.concluidos_hoje} de {r.devidos_hoje} {r.devidos_hoje === 1 ? 'bloco devido concluído' : 'blocos devidos concluídos'}</p>
              <p className="text-sm text-white/60">
                {r.faltam_itens > 0 ? <><span className="text-amber-300 font-semibold">faltam {r.faltam_itens} itens</span> para fechar o dia</> : <span className="text-green-300">dia fechado, nada pendente</span>}
                {r.em_andamento > 0 && <> · {r.em_andamento} em andamento</>}
              </p>
            </div>
          </div>
          <div className="text-xs text-white/40">{dayjs(painel.hoje).format('DD/MM/YYYY')} · {r.blocos} blocos no estoque</div>
        </div>
      )}

      {loading && !painel ? (
        <div className="flex items-center justify-center py-24"><Loader2 className="w-8 h-8 animate-spin text-white/30" /></div>
      ) : (
        <>
          {/* Blocos devidos */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {devidos.map(b => {
              const cor = COR[b.situacao];
              const pct = b.total_hoje > 0 ? Math.round((b.contados_hoje / b.total_hoje) * 100) : 0;
              return (
                <div key={b.bloco} className={`bg-[#12141f] rounded-2xl border p-4 flex flex-col gap-3 ${cor.borda} ${b.especial ? 'ring-1 ring-amber-500/30' : ''}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-semibold text-white leading-tight">{nomeBloco(b.bloco)}</p>
                      <p className="text-xs text-white/50 mt-0.5">
                        {b.itens} {b.itens === 1 ? 'item' : 'itens'}
                        {b.especial ? ' · reconferir o que ficou em zero' : ` · a cada ${b.ciclo_dias} ${b.ciclo_dias === 1 ? 'dia' : 'dias'}`}
                      </p>
                    </div>
                    <span className={`px-2 py-0.5 text-[11px] font-semibold rounded-full whitespace-nowrap ${cor.chip}`}>{cor.label}</span>
                  </div>
                  <p className="text-xs text-white/40 flex items-center gap-1.5">
                    <Clock className="w-3 h-3" />
                    {b.ultima_contagem ? `última ${dayjs(b.ultima_contagem).format('DD/MM')}` : 'nunca contado'}
                    {b.vence_em && b.situacao !== 'concluido_hoje' && <> · vence {dayjs(b.vence_em).format('DD/MM')}</>}
                  </p>
                  {b.situacao === 'em_andamento' && (
                    <div>
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden"><div className="h-full bg-blue-400 rounded-full" style={{ width: `${pct}%` }} /></div>
                      <p className="text-[11px] text-white/50 mt-1">{b.contados_hoje} de {b.total_hoje} contados · faltam {Math.max(b.total_hoje - b.contados_hoje, 0)}</p>
                    </div>
                  )}
                  <div className="flex gap-2 mt-auto">
                    {b.situacao === 'concluido_hoje' ? (
                      <>
                        <button onClick={() => b.contagem_hoje_id && onVerResultado(b.contagem_hoje_id)} className="flex-1 py-2 bg-white/5 border border-white/10 text-white/80 rounded-xl text-sm font-semibold hover:bg-white/10 flex items-center justify-center gap-2">
                          <Eye className="w-4 h-4" /> Ver resultado
                        </button>
                        <button onClick={() => abrir(b)} disabled={abrindo !== null} className="px-3 py-2 bg-white/5 border border-white/10 text-white/50 rounded-xl text-sm hover:bg-white/10 disabled:opacity-50" title="Recontar este bloco">
                          {abrindo === b.bloco ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                        </button>
                      </>
                    ) : (
                      <button onClick={() => abrir(b)} disabled={abrindo !== null}
                        className={`flex-1 py-2 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50 ${b.situacao === 'em_andamento' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 'bg-wine hover:bg-[#6a1a25] text-white'}`}>
                        {abrindo === b.bloco ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                        {b.situacao === 'em_andamento' ? 'Continuar' : 'Contar'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {devidos.length === 0 && painel && (
            <div className="bg-[#12141f] rounded-2xl border border-green-500/20 p-10 text-center">
              <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
              <p className="text-white font-semibold">Nenhum bloco vence hoje no {painel.estoque.nome}.</p>
              <p className="text-sm text-white/50 mt-1">Se quiser adiantar, escolha um bloco em dia abaixo.</p>
            </div>
          )}

          {/* Em dia */}
          {emDia.length > 0 && (
            <div>
              <button onClick={() => setMostrarEmDia(v => !v)} className="text-xs font-semibold uppercase tracking-wide text-white/50 px-1 py-1 hover:text-white/80">
                {mostrarEmDia ? '▾' : '▸'} Em dia ({emDia.length}) — contar antes da hora
              </button>
              {mostrarEmDia && (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 mt-2">
                  {emDia.map(b => (
                    <div key={b.bloco} className="bg-[#12141f] rounded-xl border border-white/10 px-3 py-2.5 flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm text-white/80 truncate">{nomeBloco(b.bloco)}</p>
                        <p className="text-[11px] text-white/40">{b.itens} itens · última {b.ultima_contagem ? dayjs(b.ultima_contagem).format('DD/MM') : '—'} · vence {b.vence_em ? dayjs(b.vence_em).format('DD/MM') : '—'}</p>
                      </div>
                      <button onClick={() => abrir(b)} disabled={abrindo !== null} className="px-2.5 py-1.5 rounded-lg border border-white/10 text-xs text-white/70 hover:bg-white/10 disabled:opacity-50">
                        {abrindo === b.bloco ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Contar'}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Contagens completas antigas ainda abertas */}
          {antigas.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-white/50 px-1">Contagens completas em aberto</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {antigas.map(c => (
                  <div key={c.id} className="bg-[#12141f] rounded-2xl border border-white/10 p-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-semibold text-white text-sm">{c.estoque_nome}</p>
                      <p className="text-xs text-white/50">{c.responsavel} · {dayjs(c.criado_em).format('DD/MM HH:mm')} · {c.status === 'finalizada' ? 'finalizada, sem processar' : 'em andamento'}</p>
                    </div>
                    <div className="flex gap-1.5">
                      <button onClick={() => (c.status === 'finalizada' ? onVerResultado(c.id) : onAbrirContagem(c.id))} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700">
                        {c.status === 'finalizada' ? 'Resultado' : 'Continuar'}
                      </button>
                      <button onClick={() => cancelarAntiga(c)} className="p-1.5 text-white/30 hover:text-red-400 rounded-lg" title="Cancelar"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ContagemBlocos;
