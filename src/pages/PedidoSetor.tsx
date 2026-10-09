import { useState, useEffect, useMemo, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  Minus, Plus, Search, X, Send, ClipboardCheck, CheckCircle, AlertTriangle, Loader2, Package, Moon, Truck,
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

// ─── Aba de abastecimento noturno ────────────────────────────────────────────
type Aba = 'contagem' | 'abastecimento';

interface ItemAbastecer {
  item_id: string; nome: string; categoria: string | null; um: string;
  nivel: number; saldo_local: number; saldo_central: number; fracionado: boolean;
}
interface UltimoAbastecimento { numero: string; quando: string; quem: string; itens: number; }
interface DadosAbastecimento {
  erro?: string;
  setor: { slug: string; estoque_id: string; nome: string };
  itens: ItemAbastecer[];
  outros_itens: OutroItem[];
  pessoas: Pessoa[];
  ultimos: UltimoAbastecimento[];
}
interface ResultadoAbastecimento { numero: string; itens: number; faltas: string | null; }

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

  // Aba de abastecimento noturno
  const [aba, setAba] = useState<Aba>('contagem');
  const [dadosAb, setDadosAb] = useState<DadosAbastecimento | null>(null);
  const [carregandoAb, setCarregandoAb] = useState(false);
  const [qtdAb, setQtdAb] = useState<Record<string, string>>({});
  const [buscaAb, setBuscaAb] = useState('');
  const [avulsosAb, setAvulsosAb] = useState<OutroItem[]>([]);
  const [resultadoAb, setResultadoAb] = useState<ResultadoAbastecimento | null>(null);

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
  // A folha mostra só o que precisa ser contado. O que baixa pela venda é
  // reposto sozinho todo dia pela rotina de reposição de balcão.
  const grupos = useMemo(() => {
    const mapa = new Map<string, ItemSetor[]>();
    for (const it of dados?.itens || []) {
      if (it.grupo !== 'sem_baixa') continue;
      const cat = it.categoria || 'Sem categoria';
      if (!mapa.has(cat)) mapa.set(cat, []);
      mapa.get(cat)!.push(it);
    }
    return Array.from(mapa.entries());
  }, [dados]);

  // Para pedir algo a mais vale qualquer item: os do balcão que baixam pela
  // venda (cerveja no meio da noite) e os que nem ficam no balcão.
  const buscaveis = useMemo<OutroItem[]>(() => [
    ...(dados?.itens || []).filter(it => it.grupo !== 'sem_baixa').map(it => ({
      item_id: it.item_id, nome: it.nome, categoria: it.categoria, um: it.um, saldo_central: it.saldo_central,
    })),
    ...(dados?.outros_itens || []),
  ], [dados]);

  const resultadosBusca = useMemo(() => {
    const tokens = normalizar(busca).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    const jaTem = new Set(extras.map(e => e.item.item_id));
    return buscaveis
      .filter(o => !jaTem.has(o.item_id))
      .filter(o => { const n = normalizar(o.nome); return tokens.every(t => n.includes(t)); })
      .slice(0, 20);
  }, [busca, buscaveis, extras]);

  const totalItensPedidos = useMemo(() => {
    const daFolha = (dados?.itens || [])
      .filter(it => it.grupo === 'sem_baixa' && qtd(linhas[it.item_id]?.pedir ?? '') > 0).length;
    const dosExtras = extras.filter(e => qtd(e.pedir) > 0).length;
    return daFolha + dosExtras;
  }, [dados, linhas, extras]);

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
        // Só o que está na folha: os itens que baixam pela venda nem aparecem
        // aqui, então não podem ir junto com contagem ou pedido escondido.
        ...dados.itens.filter(it => it.grupo === 'sem_baixa').map(it => {
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

  // ─── Abastecimento noturno ──────────────────────────────────────────────────
  const carregarAb = useCallback(async () => {
    setCarregandoAb(true);
    try {
      const { data, error } = await supabase.rpc('fn_abastecimento_dados', { p_setor: setorSlug });
      if (error) throw error;
      setDadosAb(data as DadosAbastecimento);
    } catch (e) {
      setErroEnvio(e instanceof Error ? e.message : 'Erro ao carregar os itens de abastecimento');
    } finally {
      setCarregandoAb(false);
    }
  }, [setorSlug]);

  useEffect(() => {
    if (aba === 'abastecimento' && !dadosAb && !carregandoAb) carregarAb();
  }, [aba, dadosAb, carregandoAb, carregarAb]);

  function digitarAb(itemId: string, txt: string) {
    setQtdAb(prev => ({ ...prev, [itemId]: txt }));
  }

  function somarAb(itemId: string, delta: number, fracionado: boolean) {
    setQtdAb(prev => ({ ...prev, [itemId]: String(arredondar(qtd(prev[itemId] ?? '') + delta, fracionado)) }));
  }

  const resultadosBuscaAb = useMemo(() => {
    const tokens = normalizar(buscaAb).split(/\s+/).filter(Boolean);
    if (tokens.length === 0) return [];
    const jaTem = new Set([...(dadosAb?.itens || []).map(i => i.item_id), ...avulsosAb.map(a => a.item_id)]);
    return (dadosAb?.outros_itens || [])
      .filter(o => !jaTem.has(o.item_id))
      .filter(o => { const n = normalizar(o.nome); return tokens.every(t => n.includes(t)); })
      .slice(0, 20);
  }, [buscaAb, dadosAb, avulsosAb]);

  const gruposAb = useMemo(() => {
    const mapa = new Map<string, ItemAbastecer[]>();
    for (const it of dadosAb?.itens || []) {
      const cat = it.categoria || 'Sem categoria';
      if (!mapa.has(cat)) mapa.set(cat, []);
      mapa.get(cat)!.push(it);
    }
    return Array.from(mapa.entries());
  }, [dadosAb]);

  const totalAb = useMemo(
    () => Object.values(qtdAb).filter(v => qtd(v) > 0).length,
    [qtdAb],
  );
  const podeEnviarAb = !!nomeFinal && totalAb > 0 && !enviando;

  async function enviarAbastecimento() {
    if (!podeEnviarAb) return;
    setEnviando(true);
    setErroEnvio(null);
    try {
      const pItens = Object.entries(qtdAb)
        .map(([item_id, v]) => ({ item_id, quantidade: qtd(v) }))
        .filter(i => i.quantidade > 0);
      const { data, error } = await supabase.rpc('fn_abastecimento_enviar', {
        p_setor: setorSlug,
        p_nome: nomeFinal,
        p_itens: pItens,
        p_observacoes: observacoes.trim() || null,
      });
      if (error) throw error;
      salvarNome(nomeFinal);
      setResultadoAb(data as ResultadoAbastecimento);
      window.scrollTo({ top: 0 });
    } catch (e) {
      setErroEnvio(e instanceof Error ? e.message : 'Erro ao registrar o abastecimento. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  }

  function novoAbastecimento() {
    setResultadoAb(null);
    setErroEnvio(null);
    setQtdAb({});
    setAvulsosAb([]);
    setBuscaAb('');
    setObservacoes('');
    setDadosAb(null);
    window.scrollTo({ top: 0 });
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

  // ─── Sucesso do abastecimento noturno ───────────────────────────────────────
  if (resultadoAb) {
    return (
      <div className="min-h-screen bg-[#0d0f1a] p-4 pb-10">
        <div className="max-w-md mx-auto space-y-4">
          <div className="bg-[#12141f] rounded-2xl p-6 text-center">
            <div className="mx-auto w-16 h-16 bg-green-500/15 rounded-full flex items-center justify-center mb-4">
              <CheckCircle className="h-9 w-9 text-green-400" />
            </div>
            <h2 className="text-2xl font-bold text-white/85 mb-1">Abastecimento registrado</h2>
            <p className="text-white/60">{resultadoAb.numero} · {resultadoAb.itens} {resultadoAb.itens === 1 ? 'item' : 'itens'}</p>
            <p className="text-sm text-white/50 mt-3">Já saiu do Estoque Central e entrou no {dados.setor.nome}. Nada mais a fazer.</p>
          </div>
          {resultadoAb.faltas && (
            <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-5 text-sm text-amber-200">
              <p className="font-semibold mb-2 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Saiu mais do que o Central tinha</p>
              <pre className="whitespace-pre-wrap font-sans text-amber-100/80">{resultadoAb.faltas}</pre>
              <p className="mt-2 text-amber-200/70">Avise o estoquista para conferir.</p>
            </div>
          )}
          <button
            type="button"
            onClick={novoAbastecimento}
            className="w-full bg-wine text-white py-4 rounded-xl font-semibold text-lg"
          >
            Registrar outro abastecimento
          </button>
        </div>
      </div>
    );
  }

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
          <h1 className="text-2xl font-bold text-white/90 mt-1">{dados.setor.nome}</h1>
          <p className="text-sm text-white/60 mt-2">
            {aba === 'contagem'
              ? 'Conte o que tem em mãos nos itens abaixo e envie. O que baixa pela venda é reposto sozinho todo dia.'
              : 'Pegou mercadoria no Central agora, no fechamento? Marque aqui a quantidade que levou. A transferência é registrada na hora.'}
          </p>
        </div>

        {/* Abas */}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => { setAba('contagem'); setErroEnvio(null); }}
            className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold border transition-colors ${
              aba === 'contagem' ? 'bg-wine border-wine text-white' : 'bg-[#12141f] border-white/10 text-white/60'
            }`}
          >
            <ClipboardCheck className="w-4 h-4" /> Contagem do dia
          </button>
          <button
            type="button"
            onClick={() => { setAba('abastecimento'); setErroEnvio(null); }}
            className={`flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold border transition-colors ${
              aba === 'abastecimento' ? 'bg-wine border-wine text-white' : 'bg-[#12141f] border-white/10 text-white/60'
            }`}
          >
            <Moon className="w-4 h-4" /> Abastecer agora
          </button>
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

        {aba === 'contagem' && (<>
        {/* Itens por categoria */}
        {grupos.length === 0 && (
          <div className="bg-[#12141f] rounded-2xl p-5 text-white/50 text-sm">
            Nenhum item para contar neste setor. Marque os itens como "Precisa contar" no Cadastro do balcão. Para pedir algo, use a busca abaixo.
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
                          <span className="px-2 py-0.5 rounded-full text-caption bg-amber-500/15 text-amber-300 font-semibold">Precisa contar</span>
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
          <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wide">Pedir algo a mais</h2>
          <p className="text-xs text-white/40 mb-3 mt-1">Para o que não pode esperar a reposição de amanhã, como cerveja no meio da noite.</p>
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

        </>)}

        {aba === 'abastecimento' && (<>
          {carregandoAb && !dadosAb && (
            <div className="bg-[#12141f] rounded-2xl p-8 flex justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-white/40" />
            </div>
          )}

          {dadosAb && (dadosAb.ultimos || []).length > 0 && (
            <div className="bg-[#12141f] rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wide mb-2">Últimos abastecimentos</h2>
              <ul className="space-y-1.5">
                {dadosAb.ultimos.map(u => (
                  <li key={u.numero} className="flex items-center justify-between text-sm">
                    <span className="text-white/70">{new Date(u.quando).toLocaleDateString('pt-BR')} · {u.quem}</span>
                    <span className="text-white/40">{u.itens} {u.itens === 1 ? 'item' : 'itens'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {gruposAb.map(([categoria, itens]) => (
            <div key={categoria} className="bg-[#12141f] rounded-2xl overflow-hidden">
              <h2 className="px-5 py-3 text-sm font-semibold text-white/60 uppercase tracking-wide border-b border-white/10">{categoria}</h2>
              <ul className="divide-y divide-white/5">
                {itens.map(it => {
                  const q = qtd(qtdAb[it.item_id] ?? '');
                  const faltaCentral = q > it.saldo_central;
                  return (
                    <li key={it.item_id} className={`p-4 ${q > 0 ? 'bg-wine/5' : ''}`}>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0">
                          <p className="text-white font-semibold leading-tight">{it.nome} <span className="text-white/40 font-normal text-sm">{it.um}</span></p>
                          <p className="text-caption text-white/40 mt-1">Central tem {fmt(it.saldo_central)} · nível do balcão {fmt(it.nivel)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" aria-label={`Menos ${it.nome}`} onClick={() => somarAb(it.item_id, -1, it.fracionado)}
                          className="p-3 bg-white/5 border border-white/15 rounded-xl">
                          <Minus className="w-5 h-5 text-white/70" />
                        </button>
                        <input
                          type="text" inputMode="decimal" value={qtdAb[it.item_id] ?? ''}
                          onChange={e => digitarAb(it.item_id, e.target.value)}
                          placeholder="0"
                          className={`${inputClasse} ${q > 0 ? 'border-wine/60' : ''}`}
                        />
                        <button type="button" aria-label={`Mais ${it.nome}`} onClick={() => somarAb(it.item_id, 1, it.fracionado)}
                          className="p-3 bg-white/5 border border-white/15 rounded-xl">
                          <Plus className="w-5 h-5 text-wine-light" />
                        </button>
                      </div>
                      {faltaCentral && (
                        <p className="text-caption text-amber-300 mt-2 flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" /> O Central só tem {fmt(it.saldo_central)} no sistema
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}

          {avulsosAb.length > 0 && (
            <div className="bg-[#12141f] rounded-2xl overflow-hidden">
              <h2 className="px-5 py-3 text-sm font-semibold text-white/60 uppercase tracking-wide border-b border-white/10">Outros itens</h2>
              <ul className="divide-y divide-white/5">
                {avulsosAb.map(o => {
                  const q = qtd(qtdAb[o.item_id] ?? '');
                  return (
                    <li key={o.item_id} className={`p-4 ${q > 0 ? 'bg-wine/5' : ''}`}>
                      <div className="flex items-start justify-between gap-2 mb-3">
                        <div className="min-w-0">
                          <p className="text-white font-semibold leading-tight">{o.nome} <span className="text-white/40 font-normal text-sm">{o.um}</span></p>
                          <p className="text-caption text-white/40 mt-1">Central tem {fmt(o.saldo_central)}</p>
                        </div>
                        <button type="button" aria-label={`Tirar ${o.nome}`}
                          onClick={() => { setAvulsosAb(prev => prev.filter(x => x.item_id !== o.item_id)); setQtdAb(prev => { const n = { ...prev }; delete n[o.item_id]; return n; }); }}
                          className="p-1.5 text-white/40">
                          <X className="w-5 h-5" />
                        </button>
                      </div>
                      <div className="flex items-center gap-2">
                        <button type="button" aria-label={`Menos ${o.nome}`} onClick={() => somarAb(o.item_id, -1, true)}
                          className="p-3 bg-white/5 border border-white/15 rounded-xl">
                          <Minus className="w-5 h-5 text-white/70" />
                        </button>
                        <input
                          type="text" inputMode="decimal" value={qtdAb[o.item_id] ?? ''}
                          onChange={e => digitarAb(o.item_id, e.target.value)}
                          placeholder="0"
                          className={`${inputClasse} ${q > 0 ? 'border-wine/60' : ''}`}
                        />
                        <button type="button" aria-label={`Mais ${o.nome}`} onClick={() => somarAb(o.item_id, 1, true)}
                          className="p-3 bg-white/5 border border-white/15 rounded-xl">
                          <Plus className="w-5 h-5 text-wine-light" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {dadosAb && (
            <div className="bg-[#12141f] rounded-2xl p-5">
              <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wide mb-3">Levar outro item</h2>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
                <input
                  type="text" value={buscaAb} onChange={e => setBuscaAb(e.target.value)}
                  placeholder="Buscar item..."
                  className="w-full pl-10 pr-10 py-3 bg-white/5 border border-white/20 text-white rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-wine placeholder-white/30"
                />
                {buscaAb && (
                  <button type="button" aria-label="Limpar busca" onClick={() => setBuscaAb('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-white/40">
                    <X className="w-5 h-5" />
                  </button>
                )}
              </div>
              {buscaAb.trim() && (
                resultadosBuscaAb.length === 0 ? (
                  <p className="text-sm text-white/40 mt-3">Nenhum item encontrado.</p>
                ) : (
                  <ul className="mt-2 divide-y divide-white/5 border border-white/10 rounded-xl overflow-hidden">
                    {resultadosBuscaAb.map(o => (
                      <li key={o.item_id}>
                        <button type="button"
                          onClick={() => { setAvulsosAb(prev => [...prev, o]); setQtdAb(prev => ({ ...prev, [o.item_id]: '1' })); setBuscaAb(''); }}
                          className="w-full text-left p-4 hover:bg-white/5">
                          <p className="text-white font-medium">{o.nome} <span className="text-white/40 font-normal text-sm">{o.um}</span></p>
                          <p className="text-caption text-white/40">{o.categoria || 'Sem categoria'} · Central: {fmt(o.saldo_central)}</p>
                        </button>
                      </li>
                    ))}
                  </ul>
                )
              )}
            </div>
          )}
        </>)}

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
            <p className="text-caption text-white/40 text-center mb-2">
              {aba === 'contagem' ? 'Escolha quem está pedindo para enviar' : 'Escolha quem está abastecendo para registrar'}
            </p>
          )}
          {aba === 'contagem' ? (
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
                  ? 'Enviar contagem'
                  : `${totalItensPedidos} ${totalItensPedidos === 1 ? 'item' : 'itens'} · Enviar contagem e pedido`}
            </button>
          ) : (
            <button
              type="button"
              onClick={enviarAbastecimento}
              disabled={!podeEnviarAb}
              className="w-full bg-wine text-white py-4 rounded-xl font-semibold text-lg flex items-center justify-center gap-2 disabled:bg-white/10 disabled:text-white/40"
            >
              {enviando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Truck className="w-5 h-5" />}
              {enviando ? 'Registrando...' : `${totalAb} ${totalAb === 1 ? 'item' : 'itens'} · Registrar abastecimento`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
