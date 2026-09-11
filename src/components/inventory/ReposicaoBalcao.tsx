import { Fragment, useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  RefreshCw, Loader2, PackageCheck, Sparkles, AlertTriangle, Check,
  ExternalLink, SlidersHorizontal, Store, ClipboardList,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';
import NiveisBalcao from './NiveisBalcao';
import { agruparPorCategoria } from './agruparPorCategoria';

// ─── Tipos ───────────────────────────────────────────────────────────────────
interface ItemRequisicao {
  item_id: string;
  nome: string;
  um: string;
  categoria: string | null;
  solicitada: number;
  obs: string | null;
  saldo_central: number;
  saldo_local: number;
  nivel: number | null;
  fracionado: boolean;
}

interface Requisicao {
  id: string;
  numero: string;
  quando: string;
  solicitante: string;
  status: 'pendente' | 'aprovado';
  automatica: boolean;
  observacoes: string | null;
  itens: ItemRequisicao[];
}

interface ItemSemContagem {
  item_id: string;
  nome: string;
  um: string;
  contado_em: string | null;
}

interface Balcao {
  estoque_id: string;
  nome: string;
  slug: string;
  niveis: number;
  entregues_hoje: number;
  requisicoes: Requisicao[];
  sem_contagem: ItemSemContagem[];
}

interface Reposicao {
  gerado_em: string;
  central_id: string;
  outras_abertas: number;
  balcoes: Balcao[];
}

interface ResultadoGerar {
  balcoes?: { setor: string; itens: number }[];
  total_itens?: number;
}

interface ModalNiveis {
  estoqueId: string;
  estoqueNome: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmtQtd = (n: number) => Number(n).toLocaleString('pt-BR', { maximumFractionDigits: 3 });

function fmtHora(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function chaveLinha(reqId: string, itemId: string): string {
  return `${reqId}:${itemId}`;
}

function faltaNoCentral(it: ItemRequisicao): boolean {
  return it.saldo_central < it.solicitada;
}

function valorInicial(it: ItemRequisicao): number {
  return faltaNoCentral(it) ? Math.max(0, it.saldo_central) : it.solicitada;
}

function urlBalcao(slug: string): string {
  return `${window.location.origin}/pedido/${slug}`;
}

function mensagemErro(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

const BTN_SEC = 'flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-sm font-medium text-white/60 hover:bg-white/5 disabled:opacity-50 transition-colors';
const BTN_WINE = 'flex items-center gap-2 bg-wine hover:bg-[#6a1a25] disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors';

// ─── Componente principal ────────────────────────────────────────────────────
export default function ReposicaoBalcao() {
  const [dados, setDados] = useState<Reposicao | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState('');
  const [gerando, setGerando] = useState(false);
  const [msgGerar, setMsgGerar] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [entregas, setEntregas] = useState<Record<string, string>>({});
  const [salvandoReq, setSalvandoReq] = useState<string | null>(null);
  const [errosReq, setErrosReq] = useState<Record<string, string>>({});
  const [modalNiveis, setModalNiveis] = useState<ModalNiveis | null>(null);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro('');
    try {
      const { data, error } = await supabase.rpc('fn_reposicao_balcao_hoje');
      if (error) { setErro(error.message); return; }
      const r = (data || {}) as Partial<Reposicao>;
      const normalizado: Reposicao = {
        gerado_em: String(r.gerado_em ?? ''),
        central_id: String(r.central_id ?? ''),
        outras_abertas: Number(r.outras_abertas ?? 0),
        balcoes: (Array.isArray(r.balcoes) ? r.balcoes : []).map(b => ({
          estoque_id: String(b.estoque_id),
          nome: String(b.nome ?? ''),
          slug: String(b.slug ?? ''),
          niveis: Number(b.niveis ?? 0),
          entregues_hoje: Number(b.entregues_hoje ?? 0),
          requisicoes: (Array.isArray(b.requisicoes) ? b.requisicoes : []).map(q => ({
            id: String(q.id),
            numero: String(q.numero ?? ''),
            quando: String(q.quando ?? ''),
            solicitante: String(q.solicitante ?? ''),
            status: q.status === 'aprovado' ? 'aprovado' : 'pendente',
            automatica: Boolean(q.automatica),
            observacoes: q.observacoes ?? null,
            itens: (Array.isArray(q.itens) ? q.itens : []).map(it => ({
              item_id: String(it.item_id),
              nome: String(it.nome ?? ''),
              um: String(it.um ?? ''),
              categoria: it.categoria ?? null,
              solicitada: Number(it.solicitada ?? 0),
              obs: it.obs ?? null,
              saldo_central: Number(it.saldo_central ?? 0),
              saldo_local: Number(it.saldo_local ?? 0),
              nivel: it.nivel === null || it.nivel === undefined ? null : Number(it.nivel),
              fracionado: Boolean(it.fracionado),
            })),
          })),
          sem_contagem: (Array.isArray(b.sem_contagem) ? b.sem_contagem : []).map(s => ({
            item_id: String(s.item_id),
            nome: String(s.nome ?? ''),
            um: String(s.um ?? ''),
            contado_em: s.contado_em ?? null,
          })),
        })),
      };
      setDados(normalizado);
      // Reinicia os inputs de entrega com o padrão de cada linha
      const iniciais: Record<string, string> = {};
      for (const b of normalizado.balcoes) {
        for (const q of b.requisicoes) {
          for (const it of q.itens) {
            iniciais[chaveLinha(q.id, it.item_id)] = String(valorInicial(it));
          }
        }
      }
      setEntregas(iniciais);
      setErrosReq({});
    } catch (e: unknown) {
      setErro(mensagemErro(e));
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  // ── Ações ──
  const gerarAgora = async () => {
    setGerando(true); setMsgGerar(null);
    try {
      const { data, error } = await supabase.rpc('fn_reposicao_balcao_gerar_todos', { p_dry_run: false, p_avisar: false });
      if (error) { setMsgGerar({ tipo: 'erro', texto: error.message }); return; }
      const r = (data || {}) as ResultadoGerar;
      const partes = (r.balcoes || []).map(b => `${b.setor}: ${Number(b.itens)} ${Number(b.itens) === 1 ? 'item' : 'itens'}`);
      const texto = partes.length > 0
        ? partes.join(' · ')
        : `Nada a gerar (${Number(r.total_itens ?? 0)} itens).`;
      setMsgGerar({ tipo: 'ok', texto });
      await carregar();
    } catch (e: unknown) {
      setMsgGerar({ tipo: 'erro', texto: mensagemErro(e) });
    } finally {
      setGerando(false);
    }
  };

  const setErroReq = (reqId: string, texto: string | null) =>
    setErrosReq(prev => { const n = { ...prev }; if (texto) n[reqId] = texto; else delete n[reqId]; return n; });

  const entregar = async (req: Requisicao, quantidades: { item_id: string; entregue: number }[]) => {
    setSalvandoReq(req.id); setErroReq(req.id, null);
    try {
      const { error } = await supabase.rpc('fn_requisicao_entregar', {
        p_requisicao_id: req.id,
        p_itens: quantidades,
      });
      if (error) { setErroReq(req.id, error.message); return; }
      await carregar();
    } catch (e: unknown) {
      setErroReq(req.id, mensagemErro(e));
    } finally {
      setSalvandoReq(null);
    }
  };

  const entregarEditado = async (req: Requisicao) => {
    const quantidades = req.itens.map(it => {
      const raw = entregas[chaveLinha(req.id, it.item_id)];
      const v = Number(raw ?? valorInicial(it));
      return { item_id: it.item_id, entregue: Number.isFinite(v) ? Math.max(0, v) : 0 };
    });
    if (quantidades.some(q => q.entregue === 0)) {
      if (!window.confirm('Há itens com 0. Confirmar entrega parcial?')) return;
    }
    await entregar(req, quantidades);
  };

  const entregarTudo = async (req: Requisicao) => {
    setEntregas(prev => {
      const n = { ...prev };
      for (const it of req.itens) n[chaveLinha(req.id, it.item_id)] = String(it.solicitada);
      return n;
    });
    await entregar(req, req.itens.map(it => ({ item_id: it.item_id, entregue: Number(it.solicitada) })));
  };

  // ── Render ──
  const balcoes = dados?.balcoes ?? [];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="bg-[#12141f] rounded-2xl border border-white/10 px-5 py-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-wine rounded-xl flex items-center justify-center flex-shrink-0">
              <PackageCheck size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Reposição de balcão</h2>
              <p className="text-sm text-white/60">Gerada todo dia às 6h30 pelo nível de balcão. Ajuste o que sai e marque entregue.</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <button onClick={gerarAgora} disabled={gerando || carregando} className={BTN_WINE}>
              <RefreshCw size={14} className={gerando ? 'animate-spin' : ''} />
              {gerando ? 'Gerando...' : 'Gerar agora'}
            </button>
            <button onClick={carregar} disabled={carregando || gerando} className={BTN_SEC}>
              <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} /> Atualizar
            </button>
          </div>
        </div>
        {msgGerar && (
          <p className={`mt-3 text-sm flex items-center gap-1.5 ${msgGerar.tipo === 'ok' ? 'text-green-300' : 'text-red-400'}`}>
            {msgGerar.tipo === 'ok' ? <Check size={14} /> : <AlertTriangle size={14} />}
            {msgGerar.texto}
          </p>
        )}
      </div>

      {erro && (
        <div className="rounded-xl p-3 text-sm border bg-red-500/10 border-red-500/30 text-red-400 flex items-center justify-between gap-3 flex-wrap">
          <span>{erro}</span>
          <button onClick={carregar} disabled={carregando} className={BTN_SEC}>
            <RefreshCw size={14} className={carregando ? 'animate-spin' : ''} /> Tentar de novo
          </button>
        </div>
      )}

      {carregando && !dados && (
        <div className="text-center py-16 text-white/30">
          <Loader2 size={24} className="animate-spin mx-auto mb-3" />
          <p>Carregando reposição de balcão...</p>
        </div>
      )}

      {dados && balcoes.length === 0 && !erro && (
        <div className="bg-[#12141f] rounded-2xl border border-white/10 text-center py-14 text-white/40">
          <Store size={32} className="mx-auto mb-3 opacity-40" />
          <p className="text-white/70 font-medium">Nenhum balcão configurado</p>
        </div>
      )}

      {/* Cards por balcão */}
      {balcoes.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {balcoes.map(b => (
            <div key={b.estoque_id} className="bg-[#12141f] rounded-2xl border border-white/10 overflow-hidden flex flex-col">
              {/* Card header */}
              <div className="flex items-start justify-between gap-3 px-5 py-3 border-b border-white/5 flex-wrap">
                <div className="flex items-center gap-3 min-w-0">
                  <Store size={16} className="text-blue-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="font-semibold text-white/90">{b.nome}</p>
                    <p className="text-caption text-white/50">
                      {b.niveis} {b.niveis === 1 ? 'nível' : 'níveis'} · {b.entregues_hoje} {b.entregues_hoje === 1 ? 'entregue' : 'entregues'} hoje
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <button onClick={() => setModalNiveis({ estoqueId: b.estoque_id, estoqueNome: b.nome })}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-white/10 text-xs font-medium text-white/70 hover:bg-white/5 transition-colors">
                    <SlidersHorizontal size={12} /> Níveis
                  </button>
                  <a href={urlBalcao(b.slug)} target="_blank" rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-blue-400 hover:underline">
                    <ExternalLink size={12} /> Link do balcão
                  </a>
                </div>
              </div>

              <div className="flex-1 space-y-3 p-4">
                {b.requisicoes.length === 0 && (
                  <div className="flex items-center gap-2 text-sm text-white/40 py-4 justify-center">
                    <Check size={16} className="text-white/30" /> Nada a repor agora.
                  </div>
                )}

                {b.requisicoes.map(req => {
                  const salvando = salvandoReq === req.id;
                  const bloqueado = salvandoReq !== null;
                  const erroReq = errosReq[req.id];
                  return (
                    <div key={req.id} className="rounded-xl border border-white/10 overflow-hidden">
                      {/* Bloco header */}
                      <div className="px-4 py-2.5 bg-white/[0.02] border-b border-white/5">
                        <div className="flex items-center justify-between gap-2 flex-wrap">
                          <p className="text-sm font-semibold text-white/90 flex items-center gap-1.5">
                            {req.automatica
                              ? <><Sparkles size={14} className="text-amber-300" /> Reposição automática</>
                              : <>Pedido de {req.solicitante || '—'}</>}
                          </p>
                          <p className="text-caption text-white/50 whitespace-nowrap">
                            {req.numero}{req.quando && ` · ${fmtHora(req.quando)}`}
                          </p>
                        </div>
                        {req.observacoes && (
                          <p className="text-xs text-white/60 mt-1">{req.observacoes}</p>
                        )}
                      </div>

                      {/* Tabela de itens */}
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                          <thead>
                            <tr className="bg-[#0c1018] text-white/40">
                              <th className="px-3 py-2 text-left font-medium">Item</th>
                              <th className="px-3 py-2 text-right font-medium whitespace-nowrap">Balcão tem</th>
                              <th className="px-3 py-2 text-right font-medium">Central</th>
                              <th className="px-3 py-2 text-right font-medium">Pedido</th>
                              <th className="px-3 py-2 text-right font-medium">Entregar</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-white/5">
                            {agruparPorCategoria(req.itens).map(([categoria, itensCat]) => (
                              <Fragment key={categoria}>
                                <tr>
                                  <td colSpan={5} className="px-3 py-1.5 bg-white/[0.04] text-[11px] font-semibold uppercase tracking-wide text-white/50">
                                    {categoria} <span className="normal-case font-normal text-white/30">· {itensCat.length} {itensCat.length === 1 ? 'item' : 'itens'}</span>
                                  </td>
                                </tr>
                                {itensCat.map(it => {
                              const chave = chaveLinha(req.id, it.item_id);
                              const falta = faltaNoCentral(it);
                              const valor = entregas[chave] ?? String(valorInicial(it));
                              return (
                                <tr key={it.item_id} className="hover:bg-white/[0.02]">
                                  <td className="px-3 py-2 min-w-[140px]">
                                    <div className="flex items-center gap-1.5 flex-wrap">
                                      <span className="text-white/90 font-medium">{it.nome}</span>
                                      <span className="text-caption text-white/40">{it.um}</span>
                                    </div>
                                    {it.obs && <p className="text-caption text-white/50 mt-0.5">{it.obs}</p>}
                                  </td>
                                  <td className="px-3 py-2 text-right text-white/70 whitespace-nowrap tabular-nums">
                                    {fmtQtd(it.saldo_local)}
                                    {it.nivel !== null && <span className="text-white/40"> / {fmtQtd(it.nivel)}</span>}
                                  </td>
                                  <td className={`px-3 py-2 text-right whitespace-nowrap tabular-nums ${falta ? 'text-red-400' : 'text-white/70'}`}>
                                    {fmtQtd(it.saldo_central)}
                                  </td>
                                  <td className="px-3 py-2 text-right text-white font-semibold whitespace-nowrap tabular-nums">
                                    {fmtQtd(it.solicitada)}
                                  </td>
                                  <td className="px-3 py-2 text-right whitespace-nowrap">
                                    <div className="inline-flex items-center gap-1.5 justify-end">
                                      {falta && (
                                        <AlertTriangle size={14} className="text-amber-400 flex-shrink-0" aria-label="Central não tem o suficiente" />
                                      )}
                                      <input type="number" min={0} step={it.fracionado ? 0.001 : 1} value={valor}
                                        disabled={bloqueado}
                                        title={falta ? 'Central não tem o suficiente' : undefined}
                                        onChange={e => {
                                          const v = e.target.value;
                                          setEntregas(prev => ({ ...prev, [chave]: v }));
                                        }}
                                        className="w-20 text-right text-sm font-bold border border-white/10 rounded-lg px-2 py-1 bg-[#0c1018] text-white focus:outline-none focus:ring-2 focus:ring-wine/30 disabled:opacity-50" />
                                    </div>
                                  </td>
                                </tr>
                              );
                                })}
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>

                      {erroReq && (
                        <p className="px-4 py-2 text-xs text-red-400 flex items-center gap-1.5 border-t border-white/5">
                          <AlertTriangle size={13} className="flex-shrink-0" /> {erroReq}
                        </p>
                      )}

                      {/* Footer do bloco */}
                      <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-white/5 bg-white/[0.02] flex-wrap">
                        <button onClick={() => entregarTudo(req)} disabled={bloqueado} className={BTN_SEC}>
                          Entregar tudo como pedido
                        </button>
                        <button onClick={() => entregarEditado(req)} disabled={bloqueado} className={BTN_WINE}>
                          {salvando ? <Loader2 size={14} className="animate-spin" /> : <PackageCheck size={14} />}
                          {salvando ? 'Entregando...' : 'Entregar'}
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Itens sem contagem */}
                {b.sem_contagem.length > 0 && (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-200">
                    <div className="flex items-start gap-2">
                      <ClipboardList size={14} className="flex-shrink-0 mt-0.5 text-amber-300" />
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold">Precisa contagem (não baixam com a venda):</p>
                        <div className="flex items-center gap-1.5 flex-wrap mt-1.5">
                          {b.sem_contagem.map(s => (
                            <span key={s.item_id} className="px-2 py-0.5 rounded-md border border-amber-500/30 bg-amber-500/10 text-amber-100 whitespace-nowrap"
                              title={s.contado_em ? `Última contagem: ${new Date(s.contado_em).toLocaleString('pt-BR')}` : 'Nunca contado'}>
                              {s.nome}{s.um && <span className="text-amber-200/60"> {s.um}</span>}
                            </span>
                          ))}
                        </div>
                        <p className="text-caption text-amber-200/70 mt-1.5" title="Só entram na reposição depois que o balcão contar (últimos 2 dias).">
                          Só entram na reposição depois que o balcão contar (últimos 2 dias).
                        </p>
                        <a href={urlBalcao(b.slug)} target="_blank" rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 mt-1.5 font-semibold underline underline-offset-2 hover:opacity-80">
                          <ExternalLink size={12} /> Contar pelo link do balcão
                        </a>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {dados && dados.outras_abertas > 0 && (
        <p className="text-xs text-white/50 flex items-center gap-1.5 flex-wrap">
          {dados.outras_abertas} {dados.outras_abertas === 1 ? 'requisição aberta' : 'requisições abertas'} para outros estoques em{' '}
          <Link to="/advanced-inventory?area=operacao&tela=requisicoes" className="inline-flex items-center gap-1 text-blue-400 hover:underline font-medium">
            Requisições <ExternalLink size={11} />
          </Link>.
        </p>
      )}

      {modalNiveis && (
        <NiveisBalcao
          estoqueId={modalNiveis.estoqueId}
          estoqueNome={modalNiveis.estoqueNome}
          onClose={() => { setModalNiveis(null); carregar(); }}
        />
      )}
    </div>
  );
}
