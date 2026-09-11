import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Minus, Plus, Search, X, Send, ClipboardCheck, CheckCircle, AlertTriangle, Loader2, Package,
} from 'lucide-react';
import { supabase } from '../lib/supabase';

// ─── Tipos do retorno de fn_pedido_setor_dados ───────────────────────────────
type Grupo = 'vendido' | 'ficha' | 'sem_baixa';

interface ItemSetor {
  item_id: string; nome: string; categoria: string | null; um: string;
  nivel: number; saldo_local: number; saldo_central: number;
  grupo: Grupo; fracionado: boolean;
}
interface OutroItem {
  item_id: string; nome: string; categoria: string | null; um: string; saldo_central: number;
}
interface Pessoa { id: string; nome: string; }
interface UltimoPedido {
  numero: string; quando: string; solicitante: string;
  status: 'pendente' | 'aprovado' | 'rejeitado' | 'concluido';
  itens: number; entregue_em: string | null;
}
interface DadosSetor {
  erro?: string;
  setor: { slug: string; estoque_id: string; nome: string };
  central_id: string | null;
  itens: ItemSetor[];
  outros_itens: OutroItem[];
  pessoas: Pessoa[];
  ultimos_pedidos: UltimoPedido[];
}

interface Resultado {
  numero: string | null; itens: number; contagens: number;
  faltas: string | null; so_contagem?: boolean;
}

// Estado por linha da folha. "pedir" fica como texto para o usuário poder
// digitar "1.5" sem o input controlado engolir o ponto; o número sai de parseNum.
interface Linha { tem: string; pedir: string; manual: boolean; }
interface Extra { item: OutroItem; pedir: string; }

function qtd(txt: string): number {
  const n = parseNum(txt);
  return n === null || n < 0 ? 0 : n;
}

const STORAGE_NOME = 'pedido-setor-nome';
const OUTRO = '__outro__';

const GRUPO_LABEL: Record<Grupo, string> = {
  vendido: 'baixa pela ZIG',
  ficha: 'baixa pela ficha',
  sem_baixa: 'Precisa contar',
};
const GRUPO_CLASSE: Record<Grupo, string> = {
  vendido: 'bg-white/5 text-white/40',
  ficha: 'bg-white/5 text-white/40',
  sem_baixa: 'bg-amber-500/15 text-amber-300 font-semibold',
};
const STATUS_PEDIDO: Record<UltimoPedido['status'], { label: string; classe: string }> = {
  pendente:  { label: 'pendente',  classe: 'bg-yellow-500/15 text-yellow-300' },
  aprovado:  { label: 'aprovado',  classe: 'bg-blue-500/15 text-blue-300' },
  rejeitado: { label: 'rejeitado', classe: 'bg-red-500/15 text-red-300' },
  concluido: { label: 'entregue',  classe: 'bg-green-500/15 text-green-300' },
};

function fmt(n: number | null | undefined): string {
  const num = Number(n ?? 0);
  if (isNaN(num)) return '0';
  return num.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 3 });
}

function parseNum(s: string): number | null {
  const t = s.trim().replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return isNaN(n) ? null : n;
}

function arredondar(n: number, fracionado: boolean): number {
  if (n <= 0) return 0;
  return fracionado ? Math.round(n * 100) / 100 : Math.ceil(n - 1e-9);
}

function pedirSugerido(item: ItemSetor, tem: number | null): number {
  if (tem === null) return 0;
  return arredondar(item.nivel - tem, item.fracionado);
}

function normalizar(s: string): string {
  return s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function lerNomeSalvo(): string {
  try { return localStorage.getItem(STORAGE_NOME) || ''; } catch { return ''; }
}
function salvarNome(nome: string) {
  try { localStorage.setItem(STORAGE_NOME, nome); } catch { /* sem storage */ }
}

const inputClasse = 'w-full bg-white/5 border border-white/20 text-white rounded-xl px-3 py-3 text-lg text-center tabular-nums focus:outline-none focus:ring-2 focus:ring-wine placeholder-white/25';

export default function PedidoSetor() {
  const { setor: setorSlug = '' } = useParams<{ setor: string }>();

  const [dados, setDados]       = useState<DadosSetor | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erroCarga, setErroCarga] = useState<string | null>(null);

  // Quem pede
  const [nomeEscolhido, setNomeEscolhido] = useState('');   // nome de pessoa ou OUTRO
  const [nomeOutro, setNomeOutro]         = useState('');

  // Folha
  const [linhas, setLinhas]   = useState<Record<string, Linha>>({});
  const [extras, setExtras]   = useState<Extra[]>([]);
  const [busca, setBusca]     = useState('');
  const [observacoes, setObservacoes] = useState('');

  const [enviando, setEnviando]   = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const montarLinhas = useCallback((itens: ItemSetor[]) => {
    const novas: Record<string, Linha> = {};
    for (const it of itens) {
      if (it.grupo === 'sem_baixa') {
        novas[it.item_id] = { tem: '', pedir: '0', manual: false };
      } else {
        novas[it.item_id] = { tem: String(it.saldo_local), pedir: String(pedirSugerido(it, it.saldo_local)), manual: false };
      }
    }
    setLinhas(novas);
  }, []);

  const carregar = useCallback(async (resetarFolha: boolean) => {
    setCarregando(true);
    setErroCarga(null);
    try {
      const { data, error } = await supabase.rpc('fn_pedido_setor_dados', { p_setor: setorSlug });
      if (error) throw error;
      const d = data as DadosSetor;
      setDados(d);
      if (!d?.erro && resetarFolha) {
        montarLinhas(d.itens || []);
        setExtras([]);
        setBusca('');
        setObservacoes('');
      }
    } catch (e) {
      setErroCarga(e instanceof Error ? e.message : 'Erro ao carregar os dados do setor');
    } finally {
      setCarregando(false);
    }
  }, [setorSlug, montarLinhas]);

  useEffect(() => { carregar(true); }, [carregar]);

  // Nome lembrado: se for alguém da lista vira chip, senão vai para "Outro nome"
  useEffect(() => {
    if (!dados || dados.erro) return;
    const salvo = lerNomeSalvo();
    if (!salvo) return;
    if ((dados.pessoas || []).some(p => p.nome === salvo)) setNomeEscolhido(salvo);
    else { setNomeEscolhido(OUTRO); setNomeOutro(salvo); }
  }, [dados]);

  const nomeFinal = nomeEscolhido === OUTRO ? nomeOutro.trim() : nomeEscolhido;

  // ─── Edição das linhas ──────────────────────────────────────────────────────
  function alterarTem(item: ItemSetor, valor: string) {
    setLinhas(prev => {
      const atual = prev[item.item_id];
      const tem = parseNum(valor);
      return {
        ...prev,
        [item.item_id]: {
          tem: valor,
          manual: atual.manual,
          pedir: atual.manual ? atual.pedir : String(pedirSugerido(item, tem)),
        },
      };
    });
  }

  // Digitação livre no campo "Pedir" (marca a linha como editada à mão)
  function digitarPedir(item: ItemSetor, txt: string) {
    setLinhas(prev => ({ ...prev, [item.item_id]: { ...prev[item.item_id], pedir: txt, manual: true } }));
  }

  // Botões − / +: arredonda para o passo do item
  function somarPedir(item: ItemSetor, delta: number) {
    setLinhas(prev => {
      const atual = prev[item.item_id];
      const v = arredondar(qtd(atual.pedir) + delta, item.fracionado);
      return { ...prev, [item.item_id]: { ...atual, pedir: String(v), manual: true } };
    });
  }

  function digitarPedirExtra(itemId: string, txt: string) {
    setExtras(prev => prev.map(e => e.item.item_id === itemId ? { ...e, pedir: txt } : e));
  }

  function somarPedirExtra(itemId: string, delta: number) {
    setExtras(prev => prev.map(e => e.item.item_id === itemId
      ? { ...e, pedir: String(arredondar(qtd(e.pedir) + delta, true)) }
      : e));
  }

  function adicionarExtra(item: OutroItem) {
    setExtras(prev => prev.some(e => e.item.item_id === item.item_id) ? prev : [...prev, { item, pedir: '1' }]);
    setBusca('');
  }

  function removerExtra(itemId: string) {
    setExtras(prev => prev.filter(e => e.item.item_id !== itemId));
  }

  // ─── Derivados ──────────────────────────────────────────────────────────────
  const grupos = useMemo(() => {
    const mapa = new Map<string, ItemSetor[]>();
    for (const it of dados?.itens || []) {
      const cat = it.categoria || 'Sem categoria';
      if (!mapa.has(cat)) mapa.set(cat, []);
      mapa.get(cat)!.push(it);
    }
    return Array.from(mapa.entries());
  }, [dados]);

  const resultadosBusca = useMemo(() => {
    const tokens = normalizar(busca).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    const jaTem = new Set(extras.map(e => e.item.item_id));
    return (dados?.outros_itens || [])
      .filter(o => !jaTem.has(o.item_id))
      .filter(o => { const n = normalizar(o.nome); return tokens.every(t => n.includes(t)); })
      .slice(0, 20);
  }, [busca, dados, extras]);

  const totalItensPedidos = useMemo(() => {
    const daFolha = Object.values(linhas).filter(l => qtd(l.pedir) > 0).length;
    const dosExtras = extras.filter(e => qtd(e.pedir) > 0).length;
    return daFolha + dosExtras;
  }, [linhas, extras]);

  const temContagemSemBaixa = useMemo(() =>
    (dados?.itens || []).some(it => it.grupo === 'sem_baixa' && parseNum(linhas[it.item_id]?.tem ?? '') !== null),
  [dados, linhas]);

  const soContagem = totalItensPedidos === 0 && temContagemSemBaixa;
  const podeEnviar = !!nomeFinal && (totalItensPedidos > 0 || temContagemSemBaixa) && !enviando;

  // ─── Envio ──────────────────────────────────────────────────────────────────
  async function enviar() {
    if (!dados || !podeEnviar) return;
    setEnviando(true);
    setErroEnvio(null);
    try {
      const pItens = [
        ...dados.itens.map(it => {
          const l = linhas[it.item_id];
          return { item_id: it.item_id, contado: parseNum(l?.tem ?? ''), pedir: qtd(l?.pedir ?? '') };
        }),
        ...extras.map(e => ({ item_id: e.item.item_id, contado: null, pedir: qtd(e.pedir) })),
      ];
      const { data, error } = await supabase.rpc('fn_pedido_setor_enviar', {
        p_setor: setorSlug,
        p_nome: nomeFinal,
        p_itens: pItens,
        p_observacoes: observacoes.trim() || null,
      });
      if (error) throw error;
      salvarNome(nomeFinal);
      setResultado(data as Resultado);
      window.scrollTo({ top: 0 });
      carregar(false);
    } catch (e) {
      setErroEnvio(e instanceof Error ? e.message : 'Erro ao enviar o pedido. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  function novoPedido() {
    setResultado(null);
    setErroEnvio(null);
    carregar(true);
    window.scrollTo({ top: 0 });
  }

  // ─── Telas de carga / erro ──────────────────────────────────────────────────
  if (carregando && !dados) {
    return (
      <div className="min-h-screen bg-[#0d0f1a] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-white/40" />
      </div>
    );
  }

  if (erroCarga || !dados || dados.erro) {
    return (
      <div className="min-h-screen bg-[#0d0f1a] flex items-center justify-center p-4">
        <div className="bg-[#12141f] rounded-2xl max-w-md w-full p-8 text-center">
          <Package className="w-12 h-12 text-white/30 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-white/85 mb-2">Setor não encontrado</h1>
          <p className="text-white/60 mb-6">{erroCarga || 'Use um dos links abaixo.'}</p>
          <div className="flex flex-col gap-3">
            <Link to="/pedido/bar" className="bg-wine text-white py-4 rounded-xl font-semibold text-lg">Pedido do Bar</Link>
            <Link to="/pedido/cozinha" className="bg-wine text-white py-4 rounded-xl font-semibold text-lg">Pedido da Cozinha</Link>
          </div>
        </div>
      </div>
    );
  }

  const hoje = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' });

  // ─── Tela de sucesso ────────────────────────────────────────────────────────
  if (resultado) {
    return (
      <div className="min-h-screen bg-[#0d0f1a] p-4 pb-10">
        <div className="max-w-md mx-auto space-y-4">
          <div className="bg-[#12141f] rounded-2xl p-6 text-center">
            <div className="mx-auto w-16 h-16 bg-green-500/15 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-9 w-9 text-green-400" />
            </div>
            {resultado.so_contagem ? (
              <>
                <h2 className="text-2xl font-bold text-white/85 mb-1">Contagem registrada</h2>
                <p className="text-white/60">Nenhum item pedido · {resultado.contagens} {resultado.contagens === 1 ? 'contagem registrada' : 'contagens registradas'}</p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold text-white/85 mb-1">Pedido enviado</h2>
                <p className="text-3xl font-bold text-white tabular-nums my-3">{resultado.numero}</p>
                <p className="text-white/60">
                  {resultado.itens} {resultado.itens === 1 ? 'item pedido' : 'itens pedidos'} · {resultado.contagens} {resultado.contagens === 1 ? 'contagem registrada' : 'contagens registradas'}
                </p>
                <p className="text-sm text-white/40 mt-2">O estoquista já recebeu no Telegram.</p>
              </>
            )}
            {resultado.faltas && (
              <div className="mt-4 text-left bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 text-sm text-amber-300">
                <p className="font-semibold flex items-center gap-2 mb-1"><AlertTriangle className="w-4 h-4" /> Central sem saldo suficiente</p>
                <pre className="whitespace-pre-wrap font-sans">{resultado.faltas.trim()}</pre>
              </div>
            )}
            <button onClick={novoPedido} className="mt-6 w-full bg-wine text-white py-4 rounded-xl font-semibold text-lg">
              Novo pedido
            </button>
          </div>

          <div className="bg-[#12141f] rounded-2xl p-5">
            <h3 className="text-sm font-semibold text-white/60 uppercase tracking-wide mb-3">Últimos pedidos do setor</h3>
            {carregando ? (
              <Loader2 className="w-5 h-5 animate-spin text-white/40" />
            ) : (dados.ultimos_pedidos || []).length === 0 ? (
              <p className="text-white/40 text-sm">Nenhum pedido ainda.</p>
            ) : (
              <ul className="divide-y divide-white/5">
                {dados.ultimos_pedidos.map(p => {
                  const st = STATUS_PEDIDO[p.status] || { label: p.status, classe: 'bg-white/10 text-white/50' };
                  return (
                    <li key={p.numero} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-white font-semibold">{p.numero} <span className="text-white/40 font-normal">· {p.itens} {p.itens === 1 ? 'item' : 'itens'}</span></p>
                        <p className="text-xs text-white/50 truncate">
                          {new Date(p.quando).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })} · {p.solicitante}
                          {p.entregue_em && p.status === 'concluido' && (
                            <> · entregue {new Date(p.entregue_em).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</>
                          )}
                        </p>
                      </div>
                      <span className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-semibold ${st.classe}`}>{st.label}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── Folha de contagem e pedido ─────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#0d0f1a] pb-32">
      <div className="max-w-md mx-auto p-4 space-y-4">

        {/* Cabeçalho */}
        <div className="bg-[#12141f] rounded-2xl p-5">
          <p className="text-xs text-white/40 uppercase tracking-wide capitalize">{hoje}</p>
          <h1 className="text-2xl font-bold text-white/90 mt-1">Pedido do {dados.setor.nome}</h1>
          <p className="text-sm text-white/60 mt-2">Conte o que tem em mãos, confira quanto pedir e envie. O estoquista recebe na hora.</p>
        </div>

        {/* Quem está pedindo */}
        <div className="bg-[#12141f] rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wide mb-3">Quem está pedindo</h2>
          <div className="flex flex-wrap gap-2">
            {(dados.pessoas || []).map(p => (
              <button
                key={p.id}
                type="button"
                onClick={() => setNomeEscolhido(p.nome)}
                className={`px-4 py-2.5 rounded-full text-sm font-semibold border transition-colors ${
                  nomeEscolhido === p.nome ? 'bg-wine border-wine text-white' : 'bg-white/5 border-white/15 text-white/80'
                }`}
              >
                {p.nome}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setNomeEscolhido(OUTRO)}
              className={`px-4 py-2.5 rounded-full text-sm font-semibold border transition-colors ${
                nomeEscolhido === OUTRO ? 'bg-wine border-wine text-white' : 'bg-white/5 border-white/15 text-white/80'
              }`}
            >
              Outro nome
            </button>
          </div>
          {nomeEscolhido === OUTRO && (
            <input
              type="text"
              value={nomeOutro}
              onChange={e => setNomeOutro(e.target.value)}
              placeholder="Digite seu nome"
              autoFocus
              className="mt-3 w-full bg-white/5 border border-white/20 text-white rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-wine placeholder-white/30"
            />
          )}
        </div>

        {/* Itens por categoria */}
        {grupos.length === 0 && (
          <div className="bg-[#12141f] rounded-2xl p-5 text-white/50 text-sm">
            Este setor ainda não tem níveis de balcão cadastrados. Use a busca abaixo para pedir itens.
          </div>
        )}
        {grupos.map(([categoria, itens]) => (
          <div key={categoria} className="bg-[#12141f] rounded-2xl overflow-hidden">
            <h2 className="px-5 py-3 text-sm font-semibold text-white/60 uppercase tracking-wide border-b border-white/10">{categoria}</h2>
            <ul className="divide-y divide-white/5">
              {itens.map(it => {
                const l = linhas[it.item_id] || { tem: '', pedir: '0', manual: false };
                const prefixado = it.grupo !== 'sem_baixa';
                const passo = it.fracionado ? 0.1 : 1;
                const pedirNum = qtd(l.pedir);
                const faltaCentral = pedirNum > it.saldo_central;
                return (
                  <li key={it.item_id} className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="min-w-0">
                        <p className="text-white font-semibold leading-tight">{it.nome} <span className="text-white/40 font-normal text-sm">{it.um}</span></p>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                          <span className={`px-2 py-0.5 rounded-full text-caption ${GRUPO_CLASSE[it.grupo]}`}>{GRUPO_LABEL[it.grupo]}</span>
                          <span className="text-caption text-white/40">nível: {fmt(it.nivel)}</span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-caption text-white/50 mb-1">Tem em mãos</label>
                        <input
                          type="text"
                          inputMode="decimal"
                          value={l.tem}
                          onChange={e => alterarTem(it, e.target.value)}
                          placeholder="—"
                          className={inputClasse}
                        />
                        {prefixado && (
                          <p className="text-caption text-white/35 mt-1 text-center">saldo do sistema: {fmt(it.saldo_local)}</p>
                        )}
                      </div>
                      <div>
                        <label className="block text-caption text-white/50 mb-1">Pedir</label>
                        <div className="flex items-stretch gap-1">
                          <button
                            type="button"
                            aria-label="Diminuir"
                            onClick={() => somarPedir(it, -passo)}
                            className="w-12 shrink-0 rounded-xl bg-white/10 text-white flex items-center justify-center active:bg-white/20"
                          >
                            <Minus className="w-5 h-5" />
                          </button>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={l.pedir}
                            onChange={e => digitarPedir(it, e.target.value)}
                            className={`${inputClasse} px-1 ${pedirNum > 0 ? 'border-wine/60' : ''}`}
                          />
                          <button
                            type="button"
                            aria-label="Aumentar"
                            onClick={() => somarPedir(it, passo)}
                            className="w-12 shrink-0 rounded-xl bg-wine text-white flex items-center justify-center active:bg-wine-light"
                          >
                            <Plus className="w-5 h-5" />
                          </button>
                        </div>
                        {faltaCentral && (
                          <p className="text-caption text-amber-300 mt-1 text-center flex items-center justify-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Central tem só {fmt(it.saldo_central)}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}

        {/* Outros itens adicionados */}
        {extras.length > 0 && (
          <div className="bg-[#12141f] rounded-2xl overflow-hidden">
            <h2 className="px-5 py-3 text-sm font-semibold text-white/60 uppercase tracking-wide border-b border-white/10">Outros itens</h2>
            <ul className="divide-y divide-white/5">
              {extras.map(e => {
                const pedirNum = qtd(e.pedir);
                const faltaCentral = pedirNum > e.item.saldo_central;
                return (
                  <li key={e.item.item_id} className="p-4">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <p className="text-white font-semibold leading-tight">{e.item.nome} <span className="text-white/40 font-normal text-sm">{e.item.um}</span></p>
                      <button type="button" aria-label="Remover" onClick={() => removerExtra(e.item.item_id)} className="p-1.5 text-white/40 hover:text-white">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <p className="text-caption text-white/35 self-center">Central: {fmt(e.item.saldo_central)}</p>
                      <div>
                        <label className="block text-caption text-white/50 mb-1">Pedir</label>
                        <div className="flex items-stretch gap-1">
                          <button type="button" aria-label="Diminuir" onClick={() => somarPedirExtra(e.item.item_id, -1)}
                            className="w-12 shrink-0 rounded-xl bg-white/10 text-white flex items-center justify-center active:bg-white/20">
                            <Minus className="w-5 h-5" />
                          </button>
                          <input
                            type="text" inputMode="decimal" value={e.pedir}
                            onChange={ev => digitarPedirExtra(e.item.item_id, ev.target.value)}
                            className={`${inputClasse} px-1 ${pedirNum > 0 ? 'border-wine/60' : ''}`}
                          />
                          <button type="button" aria-label="Aumentar" onClick={() => somarPedirExtra(e.item.item_id, 1)}
                            className="w-12 shrink-0 rounded-xl bg-wine text-white flex items-center justify-center active:bg-wine-light">
                            <Plus className="w-5 h-5" />
                          </button>
                        </div>
                        {faltaCentral && (
                          <p className="text-caption text-amber-300 mt-1 text-center flex items-center justify-center gap-1">
                            <AlertTriangle className="w-3 h-3" /> Central tem só {fmt(e.item.saldo_central)}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Adicionar outro item */}
        <div className="bg-[#12141f] rounded-2xl p-5">
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wide mb-3">Adicionar outro item</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
            <input
              type="text"
              value={busca}
              onChange={e => setBusca(e.target.value)}
              placeholder="Buscar item..."
              className="w-full pl-10 pr-10 py-3 bg-white/5 border border-white/20 text-white rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-wine placeholder-white/30"
            />
            {busca && (
              <button type="button" aria-label="Limpar busca" onClick={() => setBusca('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-white/40">
                <X className="w-5 h-5" />
              </button>
            )}
          </div>
          {busca.trim() && (
            resultadosBusca.length === 0 ? (
              <p className="text-sm text-white/40 mt-3">Nenhum item encontrado.</p>
            ) : (
              <ul className="mt-2 divide-y divide-white/5 border border-white/10 rounded-xl overflow-hidden">
                {resultadosBusca.map(o => (
                  <li key={o.item_id}>
                    <button
                      type="button"
                      onClick={() => adicionarExtra(o)}
                      className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-white/5 active:bg-white/10"
                    >
                      <span className="min-w-0">
                        <span className="block text-white truncate">{o.nome}</span>
                        <span className="block text-caption text-white/40">{o.categoria || 'Sem categoria'} · {o.um} · Central: {fmt(o.saldo_central)}</span>
                      </span>
                      <Plus className="w-5 h-5 shrink-0 text-wine-light" />
                    </button>
                  </li>
                ))}
              </ul>
            )
          )}
        </div>

        {/* Observação */}
        <div className="bg-[#12141f] rounded-2xl p-5">
          <label className="block text-sm font-semibold text-white/60 uppercase tracking-wide mb-2">Observação <span className="normal-case font-normal text-white/35">(opcional)</span></label>
          <textarea
            value={observacoes}
            onChange={e => setObservacoes(e.target.value)}
            rows={3}
            placeholder="Algo que o estoquista precise saber..."
            className="w-full bg-white/5 border border-white/20 text-white rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-wine placeholder-white/30 resize-none"
          />
        </div>

        {erroEnvio && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4 text-sm text-red-300 flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{erroEnvio}</span>
          </div>
        )}
      </div>

      {/* Barra fixa */}
      <div className="fixed bottom-0 inset-x-0 bg-[#0d0f1a]/95 backdrop-blur border-t border-white/10 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="max-w-md mx-auto">
          {!nomeFinal && (
            <p className="text-caption text-white/40 text-center mb-2">Escolha quem está pedindo para enviar</p>
          )}
          <button
            type="button"
            onClick={enviar}
            disabled={!podeEnviar}
            className="w-full bg-wine text-white py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-2 disabled:bg-white/10 disabled:text-white/40"
          >
            {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : soContagem ? <ClipboardCheck className="w-5 h-5" /> : <Send className="w-5 h-5" />}
            {enviando
              ? 'Enviando...'
              : soContagem
                ? 'Registrar contagem'
                : `${totalItensPedidos} ${totalItensPedidos === 1 ? 'item' : 'itens'} · Enviar pedido`}
          </button>
        </div>
      </div>
    </div>
  );
}
