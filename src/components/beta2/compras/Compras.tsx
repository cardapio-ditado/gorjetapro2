import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarClock, Check, ClipboardCheck, Copy, Lock, MessageCircle, Package, Plus, RefreshCw, RotateCcw, Smartphone, Store, Truck, Undo2, X } from 'lucide-react';
import { Badge, Button, Chip, EmptyState, IconButton, Input, PageHeader, SectionCard, Segmented } from '../../ui';
import { fmtData, urlConferencia, urlWhatsApp } from '../../inventory/comprasShared';
import { agruparPorCategoria, SEM_CATEGORIA } from '../../inventory/agruparPorCategoria';
import { fmt } from '../api';
import { brl, semAcento } from '../cadastros/api';
import BuscaItem from '../BuscaItem';
import CardLista from './CardLista';
import Revisao from './Revisao';
import { comprasApi, type ComprasTela, type Destino, type ItemCatalogo, type ItemCompra, type LinhaGerar } from './api';

interface Props { onVoltar: () => void }
type Aba = 'rua' | 'pedidos' | 'demanda' | 'revisao';
/** quantidade 0 = não compra · origem '' = o da categoria (Pedidos) ou sem origem (Sob demanda) · 'rua' | 'f:<id>' */
interface Linha { quantidade: number; origem: string }
interface Opcao { id: string; nome: string; sub?: string }

const RUA = 'rua';
const OUTRO = '__outro';
const fId = (id: string) => `f:${id}`;
const idDe = (v: string) => (v.startsWith('f:') ? v.slice(2) : null);
const nomeCat = (c: string | null) => (c ?? '').trim() || SEM_CATEGORIA;
const arredondar = (q: number, fracionado: boolean) => (fracionado ? Number(q.toFixed(2)) : Math.round(q));
const ORDEM: Record<string, number> = { zerado: 0, comprar: 1, atencao: 2, extra: 3 };
const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;
const extraDoCatalogo = (c: ItemCatalogo, quantidade: number): ItemCompra => ({
  item_id: c.item_id, nome: c.nome, categoria: c.categoria, um: c.um, fracionado: c.fracionado, saldo: c.saldo, ponto: c.ponto,
  situacao: 'extra', sugerida: quantidade, preco: c.preco, em_lista: 0, em_lista_onde: null, adiado_ate: null, classe: c.classe, recentes: c.recentes,
});
const lerAba = (): Aba => { try { const s = localStorage.getItem('beta2:compras:aba'); return s === 'pedidos' || s === 'demanda' || s === 'revisao' ? s : 'rua'; } catch { return 'rua'; } };

/**
 * Compras: pelo ponto de pedido do Central. Rua vira lista para o comprador
 * (link público), Pedidos viram um pedido por fornecedor (WhatsApp), Sob
 * demanda só entra por "Incluir item". Revisão classifica os itens uma vez.
 */
const Compras: React.FC<Props> = ({ onVoltar }) => {
  const [tela, setTela] = useState<ComprasTela | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ texto: string; ids: string[] } | null>(null);
  const [aba, setAba] = useState<Aba>(lerAba);
  const [linhas, setLinhas] = useState<Record<string, Linha>>({});
  const [extras, setExtras] = useState<ItemCompra[]>([]);
  const [fornCategoria, setFornCategoria] = useState<Record<string, string>>({});
  const [outro, setOutro] = useState<string | null>(null);
  const [mostrarNoPonto, setMostrarNoPonto] = useState(false);
  const [soConferidos, setSoConferidos] = useState(false);
  const [busca, setBusca] = useState('');
  const [incluindo, setIncluindo] = useState(false);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [linkCopiado, setLinkCopiado] = useState(false);

  useEffect(() => { try { localStorage.setItem('beta2:compras:aba', aba); } catch { /* sem storage */ } }, [aba]);

  const carregar = useCallback(async () => {
    setCarregando(true); setErro(null);
    try {
      const t = await comprasApi.tela();
      setTela(t);
      setFornCategoria(prev => { const n = { ...prev }; for (const [cat, l] of Object.entries(t.categoriaFornecedores)) if (!n[cat] && l[0]) n[cat] = l[0].fornecedor_id; return n; });
      const l: Record<string, Linha> = {};
      for (const it of t.itens) l[it.item_id] = { quantidade: it.em_lista > 0 ? 0 : it.sugerida, origem: '' };
      // Conferência do celular: a quantidade anotada manda; item fora do ponto entra como extra.
      const ex: ItemCompra[] = [];
      for (const a of t.conferencia?.itens ?? []) {
        if (a.comprar === null) continue;
        if (l[a.item_id]) { l[a.item_id] = { ...l[a.item_id], quantidade: a.comprar }; continue; }
        const c = t.catalogo.find(x => x.item_id === a.item_id);
        if (c) { ex.push(extraDoCatalogo(c, a.comprar)); l[c.item_id] = { quantidade: a.comprar, origem: '' }; }
      }
      setExtras(ex); setLinhas(l); setSoConferidos((t.conferencia?.itens.length ?? 0) > 0);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
    finally { setCarregando(false); }
  }, []);
  useEffect(() => { void carregar(); }, [carregar]);

  // ── Índices ──
  const fornPorId = useMemo(() => new Map((tela?.fornecedores ?? []).map(f => [f.id, f])), [tela]);
  const opcoesFornecedor = useMemo<Opcao[]>(() => (tela?.fornecedores ?? []).map(f => ({ id: f.id, nome: f.nome, sub: f.modalidade === 'rua' ? 'loja de rua · vai na lista do comprador' : 'entrega · vira pedido' })), [tela]);
  const anotacao = useMemo(() => new Map((tela?.conferencia?.itens ?? []).map(a => [a.item_id, a])), [tela]);
  const temConferidos = anotacao.size > 0;
  const resolver = useCallback((origem: string): { destino: Destino; fornecedorId: string | null; lojaId: string | null; nome: string } | null => {
    if (origem === RUA) return { destino: 'rua', fornecedorId: null, lojaId: null, nome: 'Rua' };
    const f = idDe(origem) ? fornPorId.get(idDe(origem)!) : null;
    if (!f) return null;
    return f.modalidade === 'rua' ? { destino: 'rua', fornecedorId: null, lojaId: f.id, nome: f.nome } : { destino: 'fornecedor', fornecedorId: f.id, lojaId: null, nome: f.nome };
  }, [fornPorId]);

  // ── Itens por aba ──
  const b = semAcento(busca.trim());
  const doPonto = useMemo(() => (tela?.itens ?? []).filter(it => !it.adiado_ate), [tela]);
  const adiados = useMemo(() => (tela?.itens ?? []).filter(it => it.adiado_ate), [tela]);
  const todos = useMemo(() => [...doPonto, ...extras], [doPonto, extras]);
  const visivel = useCallback((it: ItemCompra) => (!b || semAcento(it.nome).includes(b) || semAcento(nomeCat(it.categoria)).includes(b)) && (it.situacao !== 'atencao' || mostrarNoPonto), [b, mostrarNoPonto]);
  const itensRua = useMemo(() => todos.filter(it => it.classe === 'rua' && visivel(it) && (!soConferidos || !temConferidos || anotacao.has(it.item_id))), [todos, visivel, soConferidos, temConferidos, anotacao]);
  const itensPedido = useMemo(() => todos.filter(it => it.classe === 'pedido' && visivel(it)), [todos, visivel]);
  const itensDemanda = useMemo(() => extras.filter(it => it.classe !== 'rua' && it.classe !== 'pedido' && visivel(it)), [extras, visivel]);
  const ordenar = (l: ItemCompra[]) => [...l].sort((x, y) => (ORDEM[x.situacao] ?? 9) - (ORDEM[y.situacao] ?? 9) || x.nome.localeCompare(y.nome, 'pt-BR'));
  const gruposRua = useMemo(() => agruparPorCategoria(itensRua).map(([c, l]) => [c, ordenar(l)] as const), [itensRua]);
  const gruposPedido = useMemo(() => agruparPorCategoria(itensPedido).map(([c, l]) => [c, ordenar(l)] as const), [itensPedido]);
  const semClasse = useMemo(() => doPonto.filter(it => it.classe === null && it.situacao !== 'atencao').length, [doPonto]);
  const noPonto = useMemo(() => doPonto.filter(it => it.situacao === 'atencao' && it.classe !== null).length, [doPonto]);
  const qtd = (id: string) => linhas[id]?.quantidade ?? 0;
  const totalDe = useCallback((l: ItemCompra[]) => l.reduce((acc, it) => { const q = linhas[it.item_id]?.quantidade ?? 0; return q > 0 ? { itens: acc.itens + 1, valor: acc.valor + q * it.preco } : acc; }, { itens: 0, valor: 0 }), [linhas]);
  const totRua = useMemo(() => totalDe(itensRua), [itensRua, totalDe]);
  const totPedido = useMemo(() => totalDe(itensPedido), [itensPedido, totalDe]);
  const totDemanda = useMemo(() => totalDe(itensDemanda), [itensDemanda, totalDe]);
  const origemPedido = useCallback((it: ItemCompra) => linhas[it.item_id]?.origem || (fornCategoria[nomeCat(it.categoria)] ? fId(fornCategoria[nomeCat(it.categoria)]) : ''), [linhas, fornCategoria]);
  const resumoPedidos = useMemo(() => {
    const m = new Map<string, { nome: string; itens: number; valor: number }>(); let semForn = 0;
    for (const it of itensPedido) {
      const q = qtd(it.item_id); if (q <= 0) continue;
      const r = resolver(origemPedido(it)); if (!r) { semForn += 1; continue; }
      const k = r.fornecedorId ?? r.lojaId ?? 'rua'; const e = m.get(k) ?? { nome: r.nome, itens: 0, valor: 0 };
      e.itens += 1; e.valor += q * it.preco; m.set(k, e);
    }
    return { fornecedores: [...m.values()].sort((x, y) => y.valor - x.valor), semForn };
  }, [itensPedido, linhas, resolver, origemPedido]); // eslint-disable-line react-hooks/exhaustive-deps
  const listas = tela?.listas ?? [];
  const listasRua = listas.filter(l => l.status !== 'concluida' && l.tipo === 'rua');
  const listasForn = listas.filter(l => l.status !== 'concluida' && l.tipo === 'fornecedor');
  const listasConcluidas = listas.filter(l => l.status === 'concluida');

  // ── Edição ──
  const setLinha = (id: string, patch: Partial<Linha>) => setLinhas(prev => ({ ...prev, [id]: { ...(prev[id] ?? { quantidade: 0, origem: '' }), ...patch } }));
  const opcoesCatalogo = useMemo<Opcao[]>(() => (tela?.catalogo ?? []).filter(c => !todos.some(x => x.item_id === c.item_id))
    .map(c => ({ id: c.item_id, nome: c.nome, sub: `${nomeCat(c.categoria)} · ${fmt(c.saldo)} ${c.um} no Central${c.classe ? ` · ${c.classe === 'rua' ? 'Rua' : c.classe === 'pedido' ? 'Pedido' : 'Sob demanda'}` : ''}` })), [tela, todos]);
  const incluir = (id: string) => {
    const c = tela?.catalogo.find(x => x.item_id === id); setIncluindo(false);
    if (!c || todos.some(x => x.item_id === id)) return;
    setExtras(prev => [...prev, extraDoCatalogo(c, 0)]); setLinha(c.item_id, { quantidade: 0, origem: '' });
    setAba(c.classe === 'rua' ? 'rua' : c.classe === 'pedido' ? 'pedidos' : 'demanda');
  };
  const tirar = (id: string) => { setExtras(prev => prev.filter(x => x.item_id !== id)); setLinhas(prev => { const n = { ...prev }; delete n[id]; return n; }); };
  const marcarAdiado = (id: string, ate: string | null) => setTela(prev => prev ? { ...prev, itens: prev.itens.map(it => (it.item_id === id ? { ...it, adiado_ate: ate } : it)) } : prev);
  const rodar = async (chave: string, fn: () => Promise<void>) => {
    setOcupado(chave); setErro(null);
    try { await fn(); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); } finally { setOcupado(null); }
  };
  const adiar = (it: ItemCompra) => rodar(it.item_id, async () => { const ate = await comprasApi.adiar(it.item_id); marcarAdiado(it.item_id, ate ?? tela?.hoje ?? ''); setLinha(it.item_id, { quantidade: 0 }); });
  const trazer = (it: ItemCompra) => rodar(it.item_id, async () => { await comprasApi.adiarDesfazer(it.item_id); marcarAdiado(it.item_id, null); setLinha(it.item_id, { quantidade: it.em_lista > 0 ? 0 : it.sugerida }); });

  // ── Gerar ──
  const gerar = (chave: string, envio: LinhaGerar[]) => rodar(chave, async () => {
    if (!envio.length) throw new Error('Nenhum item com quantidade.');
    setResultado(null);
    const r = await comprasApi.gerar(envio);
    const partes = r.listas.map(l => `${l.tipo === 'rua' ? 'Rua' : l.fornecedor_nome} (${plural(l.itens, 'item', 'itens')})`);
    setResultado({ texto: `${plural(r.linhas, 'linha', 'linhas')} em ${plural(r.listas.length, 'lista', 'listas')}: ${partes.join(' · ')}. Os cards estão logo abaixo, com o botão de WhatsApp.`, ids: r.listas.map(l => l.lista_id) });
    await carregar(); window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  const obsConferencia = (it: ItemCompra) => { const a = anotacao.get(it.item_id); return a && a.encontrado !== null ? `conferido: tinha ${fmt(a.encontrado)}` : null; };
  const gerarRua = () => gerar('rua', itensRua.filter(it => qtd(it.item_id) > 0).map(it => ({ item_id: it.item_id, quantidade: qtd(it.item_id), destino: 'rua' as Destino, fornecedor_id: null, loja_id: null, observacao: obsConferencia(it) })));
  const gerarPedidos = () => {
    const ativos = itensPedido.filter(it => qtd(it.item_id) > 0);
    const sem = ativos.filter(it => !resolver(origemPedido(it)));
    if (sem.length) { setErro(`Escolha o fornecedor de hoje para: ${[...new Set(sem.map(it => nomeCat(it.categoria)))].join(', ')}.`); return; }
    void gerar('pedidos', ativos.map(it => { const r = resolver(origemPedido(it))!; return { item_id: it.item_id, quantidade: qtd(it.item_id), destino: r.destino, fornecedor_id: r.fornecedorId, loja_id: r.lojaId }; }));
  };
  const gerarDemanda = () => {
    const ativos = itensDemanda.filter(it => qtd(it.item_id) > 0);
    const sem = ativos.filter(it => !resolver(linhas[it.item_id]?.origem || ''));
    if (sem.length) { setErro(`Escolha Rua ou um fornecedor para: ${sem.map(i => i.nome).join(', ')}.`); return; }
    void gerar('demanda', ativos.map(it => { const r = resolver(linhas[it.item_id].origem)!; return { item_id: it.item_id, quantidade: qtd(it.item_id), destino: r.destino, fornecedor_id: r.fornecedorId, loja_id: r.lojaId }; }));
  };

  // ── Conferência ──
  const conf = tela?.conferencia ?? null;
  const copiarLinkConferencia = async () => {
    if (!conf) return;
    try { await navigator.clipboard.writeText(urlConferencia(conf.id)); setLinkCopiado(true); setTimeout(() => setLinkCopiado(false), 2500); } catch { window.prompt('Copie o link:', urlConferencia(conf.id)); }
  };
  const conferenciaStatus = (status: 'aberta' | 'fechada') => {
    if (!conf || (status === 'fechada' && !window.confirm('Fechar a conferência de hoje? O celular para de aceitar anotações.'))) return;
    void rodar('conf', async () => { await comprasApi.conferenciaStatus(conf.id, status); await carregar(); });
  };

  // ── Peças ──
  const selectOrigem = (chave: string, valor: string, onMudar: (v: string) => void, opcoes: Opcao[], vazio: string, alerta: boolean, comRua = false) => (
    outro === chave
      ? <div className="flex items-center gap-1 w-full sm:w-72"><div className="flex-1"><BuscaItem valor="" opcoes={opcoesFornecedor} placeholder="Buscar fornecedor" autoFocus onEscolher={id => { onMudar(fId(id)); setOutro(null); }} /></div><IconButton aria-label="Fechar busca" onClick={() => setOutro(null)}><X size={14} /></IconButton></div>
      : <select value={valor} aria-label="Fornecedor" onChange={e => (e.target.value === OUTRO ? setOutro(chave) : onMudar(e.target.value))} className="input-dark w-full sm:w-72" style={{ borderColor: alerta ? 'var(--danger-border)' : undefined }}>
        <option value="">{vazio}</option>
        {comRua && <option value={RUA}>Rua (comprador)</option>}
        {opcoes.map(o => <option key={o.id} value={fId(o.id)}>{o.nome}{o.sub ? ` · ${o.sub}` : ''}</option>)}
        <option value={OUTRO}>Outro fornecedor…</option>
      </select>
  );
  const comAtual = (opcoes: Opcao[], origem: string) => { const id = idDe(origem); const f = id ? fornPorId.get(id) : null; return f && !opcoes.some(o => o.id === f.id) ? [...opcoes, { id: f.id, nome: f.nome }] : opcoes; };

  const linha = (it: ItemCompra, extra?: React.ReactNode) => {
    const q = qtd(it.item_id); const a = anotacao.get(it.item_id);
    return (
      <div key={it.item_id} className="px-4 py-2 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)', opacity: q > 0 ? 1 : 0.6 }}>
        <div className="flex-1 min-w-[200px]">
          <p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>
            {it.nome} <span className="t-caption">{it.um}</span>
            {it.situacao === 'zerado' && <Badge variant="danger" className="ml-2">zerado</Badge>}
            {it.situacao === 'atencao' && <Badge variant="warning" className="ml-2">no ponto</Badge>}
            {it.situacao === 'extra' && <Badge variant="neutral" className="ml-2">incluído</Badge>}
          </p>
          <p className="t-caption truncate" style={{ margin: 0 }}>
            <span className={it.saldo <= 0 ? 'texto-perigo' : undefined}>Central {fmt(it.saldo)}</span> · ponto {it.ponto > 0 ? fmt(it.ponto) : '—'}{it.preco > 0 && ` · ${brl(it.preco)}/${it.um}`}
            {it.em_lista > 0 && <span className="texto-atencao"> · já na lista: {it.em_lista_onde || fmt(it.em_lista)}</span>}
            {a && <span className="texto-certo" title={a.obs ? `Obs: ${a.obs}` : undefined}> · conferido{a.encontrado !== null ? `: tem ${fmt(a.encontrado)}` : ''}{a.comprar !== null ? `, pediu ${fmt(a.comprar)}` : ''}</span>}
          </p>
        </div>
        {extra}
        {it.situacao === 'extra'
          ? <IconButton aria-label={`Tirar ${it.nome} da tela`} onClick={() => tirar(it.item_id)}><X size={14} /></IconButton>
          : <Button tamanho="sm" variante="discreto" icone={<CalendarClock size={14} />} title="Tirar de hoje e trazer de volta amanhã" onClick={() => adiar(it)} carregando={ocupado === it.item_id}>Amanhã</Button>}
        <input type="number" inputMode="decimal" min={0} step={it.fracionado ? 0.01 : 1} aria-label={`Comprar de ${it.nome}`} value={q}
          onChange={e => { const v = parseFloat(e.target.value); setLinha(it.item_id, { quantidade: arredondar(Number.isFinite(v) ? Math.max(0, v) : 0, it.fracionado) }); }}
          onFocus={e => e.target.select()} className="input-dark text-right font-semibold" style={{ width: 96, borderColor: q > 0 ? 'var(--ok-border)' : undefined }} />
      </div>
    );
  };
  const grupo = (cat: string, itens: ItemCompra[], cabecalho?: React.ReactNode) => (
    <section key={cat} className="card">
      <div className="px-4 py-2.5 flex flex-wrap items-center justify-between gap-2" style={{ borderBottom: '1px solid var(--border)' }}>
        <h2 className="t-subsec" style={{ margin: 0 }}>{cat} <span className="t-caption">· {itens.filter(it => qtd(it.item_id) > 0).length} de {itens.length}</span></h2>
        {cabecalho}
      </div>
      {itens.map(it => linha(it, aba === 'pedidos' ? selectLinhaPedido(it) : undefined))}
    </section>
  );
  const selectLinhaPedido = (it: ItemCompra) => {
    const st = linhas[it.item_id] ?? { quantidade: 0, origem: '' };
    const daCat = fornCategoria[nomeCat(it.categoria)]; const nomeCatForn = daCat ? fornPorId.get(daCat)?.nome : null;
    const opcoes = comAtual(it.recentes.filter(f => f.modalidade === 'entrega').map(f => ({ id: f.fornecedor_id, nome: f.nome, sub: `${f.compras}x${f.ultimo_preco ? ` · ${brl(f.ultimo_preco)}` : ''}` })), st.origem);
    return selectOrigem(it.item_id, st.origem, v => setLinha(it.item_id, { origem: v }), opcoes, nomeCatForn ? `= ${nomeCatForn}` : '= o da categoria', st.quantidade > 0 && !resolver(origemPedido(it)));
  };
  const selectDemanda = (it: ItemCompra) => {
    const st = linhas[it.item_id] ?? { quantidade: 0, origem: '' };
    const opcoes = comAtual(it.recentes.map(f => ({ id: f.fornecedor_id, nome: `${f.modalidade === 'rua' ? 'rua' : 'entrega'}: ${f.nome}`, sub: `${f.compras}x` })), st.origem);
    return selectOrigem(it.item_id, st.origem, v => setLinha(it.item_id, { origem: v }), opcoes, 'Rua ou fornecedor…', st.quantidade > 0 && !resolver(st.origem), true);
  };
  const cabecalhoCategoria = (cat: string, itens: ItemCompra[]) => {
    const daCat = fornCategoria[cat] ?? '';
    const opcoes = comAtual((tela?.categoriaFornecedores[cat] ?? []).map(f => ({ id: f.fornecedor_id, nome: f.nome, sub: `${f.compras}x` })), daCat ? fId(daCat) : '');
    const falta = !daCat && itens.some(it => qtd(it.item_id) > 0 && !linhas[it.item_id]?.origem);
    return <div className="flex items-center gap-2 w-full sm:w-auto"><span className="t-caption whitespace-nowrap">fornecedor de hoje</span>{selectOrigem(`cat:${cat}`, daCat ? fId(daCat) : '', v => setFornCategoria(p => ({ ...p, [cat]: idDe(v) ?? '' })), opcoes, 'Escolher…', falta)}</div>;
  };

  const filtros = (
    <div className="flex flex-wrap items-center gap-2">
      <Chip ligado={mostrarNoPonto} onMudar={setMostrarNoPonto} tom="atencao">No ponto ({noPonto})</Chip>
      {aba === 'rua' && temConferidos && <Chip ligado={soConferidos} onMudar={setSoConferidos} tom="certo">Só conferidos ({anotacao.size})</Chip>}
      <Input type="search" placeholder="Buscar item ou categoria" aria-label="Buscar" value={busca} onChange={e => setBusca(e.target.value)} className="flex-1 min-w-[180px]" />
      {incluindo
        ? <div className="w-full sm:w-80"><BuscaItem valor="" opcoes={opcoesCatalogo} placeholder="Buscar item para incluir" autoFocus onEscolher={incluir} /></div>
        : <Button tamanho="sm" icone={<Plus size={14} />} onClick={() => setIncluindo(true)}>Incluir item</Button>}
    </div>
  );
  const avisoSemClasse = semClasse > 0 && (
    <button type="button" onClick={() => setAba('revisao')} className="aviso aviso-atencao text-left focus-ring">{plural(semClasse, 'item abaixo do ponto ainda sem classe', 'itens abaixo do ponto ainda sem classe')}. Não aparecem em nenhuma aba. Toque para classificar.</button>
  );
  const blocoAdiados = adiados.length > 0 && (
    <SectionCard title={`Adiados para amanhã · ${adiados.length}`} descricao={`Cortado de hoje: ${brl(adiados.reduce((s, it) => s + it.sugerida * it.preco, 0))}. Voltam sozinhos amanhã.`} noPadding>
      {[...adiados].sort((x, y) => nomeCat(x.categoria).localeCompare(nomeCat(y.categoria), 'pt-BR') || x.nome.localeCompare(y.nome, 'pt-BR')).map(it => (
        <div key={it.item_id} className="px-5 py-2 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
          <div className="flex-1 min-w-[200px]"><p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{it.nome}</p><p className="t-caption" style={{ margin: 0 }}>{nomeCat(it.categoria)} · Central {fmt(it.saldo)} {it.um} · sugerido {fmt(it.sugerida)} ({brl(it.sugerida * it.preco)})</p></div>
          <Button tamanho="sm" variante="discreto" icone={<Undo2 size={14} />} onClick={() => trazer(it)} carregando={ocupado === it.item_id}>Trazer de volta</Button>
        </div>
      ))}
    </SectionCard>
  );
  const blocoListas = (l: typeof listas, titulo: string) => l.length > 0 && (
    <div className="flex flex-col gap-2">
      <p className="t-label" style={{ margin: 0, color: 'var(--text-secondary)' }}>{titulo}</p>
      {l.map(x => <CardLista key={x.lista_id} lista={x} onMudou={carregar} destaque={resultado?.ids.includes(x.lista_id)} />)}
    </div>
  );
  const cardConferencia = (
    <SectionCard title="Conferência no celular" descricao={conf ? `${plural(conf.itens.length, 'item anotado', 'itens anotados')} hoje · a quantidade anotada já está preenchida` : 'Apoio enquanto os saldos não são confiáveis: alguém confere no celular e anota quanto tem e quanto comprar.'}
      action={conf && <Badge variant={conf.status === 'aberta' ? 'success' : 'neutral'}>{conf.status}</Badge>}>
      <div className="flex flex-wrap items-center gap-1.5">
        {conf ? <>
          <Button tamanho="sm" icone={<Smartphone size={14} />} onClick={() => window.open(urlConferencia(conf.id), '_blank', 'noopener')}>Abrir</Button>
          <Button tamanho="sm" icone={linkCopiado ? <Check size={14} /> : <Copy size={14} />} onClick={copiarLinkConferencia}>{linkCopiado ? 'Copiado' : 'Copiar link'}</Button>
          <Button tamanho="sm" icone={<MessageCircle size={14} />} onClick={() => window.open(urlWhatsApp(`📋 Conferência do estoque · ${fmtData(conf.data)}\nAbra o link, busque o item pelo nome e anote quanto tem e quanto comprar:\n${urlConferencia(conf.id)}`), '_blank', 'noopener')}>WhatsApp</Button>
          {conf.status === 'aberta'
            ? <Button tamanho="sm" variante="discreto" icone={<Lock size={14} />} onClick={() => conferenciaStatus('fechada')} carregando={ocupado === 'conf'}>Fechar</Button>
            : <Button tamanho="sm" variante="discreto" icone={<RotateCcw size={14} />} onClick={() => conferenciaStatus('aberta')} carregando={ocupado === 'conf'}>Reabrir</Button>}
        </> : <Button tamanho="sm" icone={<Smartphone size={14} />} onClick={() => rodar('conf', async () => { await comprasApi.conferenciaCriar(); await carregar(); })} carregando={ocupado === 'conf'}>Gerar link de conferência</Button>}
      </div>
    </SectionCard>
  );
  const rodape = (texto: React.ReactNode, botao: React.ReactNode) => (
    <div className="fixed bottom-0 left-0 right-0 z-30 px-4 py-3 lg:pl-[calc(232px+28px)]" style={{ background: 'var(--bg-dark)', borderTop: '1px solid var(--border)' }}>
      <div className="max-w-5xl flex flex-wrap items-center justify-between gap-3"><div className="t-body min-w-0" style={{ color: 'var(--text-secondary)' }}>{texto}</div>{botao}</div>
    </div>
  );

  const pendentesRevisao = (tela?.config.pendentes_classe ?? 0) + (tela?.config.pontos_sem_giro ?? 0);
  const rotulo = (nome: string, n: number, valor?: number) => `${nome} · ${n}${valor ? ` · ${brl(valor)}` : ''}`;

  return (
    <div className="max-w-5xl pb-28">
      <button type="button" onClick={onVoltar} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={14} /> Estoque Beta 2</button>
      <PageHeader caminho={['Estoque', 'Compras']} title="Compras" subtitle="Pelo ponto de pedido do Central. Rua vai para o comprador; Pedidos viram um pedido por fornecedor."
        actions={<IconButton aria-label="Atualizar" onClick={carregar} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton>} />
      <div className="mb-3 overflow-x-auto">
        <Segmented<Aba> rotulo="Aba" valor={aba} onMudar={setAba} opcoes={[
          { valor: 'rua', rotulo: rotulo('Rua', itensRua.length, totRua.valor) }, { valor: 'pedidos', rotulo: rotulo('Pedidos', itensPedido.length, totPedido.valor) },
          { valor: 'demanda', rotulo: rotulo('Sob demanda', itensDemanda.length) }, { valor: 'revisao', rotulo: rotulo('Revisão', pendentesRevisao) },
        ]} />
      </div>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {resultado && <div className="aviso aviso-certo mb-3 flex items-start gap-2"><span className="flex-1">{resultado.texto}</span><button type="button" aria-label="Fechar" onClick={() => setResultado(null)}><X size={14} /></button></div>}
      {!tela && carregando && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Conferindo o Central…</p>}

      {tela && aba === 'rua' && <div className="flex flex-col gap-3">
        {blocoListas(listasRua, 'Listas da Rua abertas')}
        {cardConferencia}
        {avisoSemClasse}
        {filtros}
        {itensRua.length === 0 ? <EmptyState icon={Package} title={`Nada da Rua abaixo do ponto${soConferidos && temConferidos ? ' entre os conferidos' : ''}`} description='Use "Incluir item" para comprar algo fora do ponto.' compact />
          : gruposRua.map(([cat, itens]) => grupo(cat, itens))}
        {blocoAdiados}
        {itensRua.length > 0 && rodape(<><strong style={{ color: 'var(--text-primary)' }}>{plural(totRua.itens, 'item', 'itens')} · {brl(totRua.valor)} estimado</strong> · Comprar = o que falta até o ponto. Zero = não compra.</>,
          <Button variante="primario" tamanho="toque" icone={<Store size={20} />} onClick={gerarRua} disabled={totRua.itens === 0} carregando={ocupado === 'rua'}>Gerar lista da Rua</Button>)}
      </div>}

      {tela && aba === 'pedidos' && <div className="flex flex-col gap-3">
        {blocoListas(listasForn, 'Pedidos abertos (somem quando a nota entra)')}
        {avisoSemClasse}
        {filtros}
        {itensPedido.length === 0 ? <EmptyState icon={Truck} title="Nenhum item de pedido abaixo do ponto" description='Use "Incluir item" para pedir algo fora do ponto.' compact />
          : <>
            <p className="t-caption" style={{ margin: 0 }}>O fornecedor da categoria vale para todas as linhas dela; troque numa linha só quando quiser. Cada fornecedor vira um pedido com botão de WhatsApp.</p>
            {gruposPedido.map(([cat, itens]) => grupo(cat, itens, cabecalhoCategoria(cat, itens)))}
          </>}
        {blocoAdiados}
        {itensPedido.length > 0 && rodape(<>
          <strong style={{ color: 'var(--text-primary)' }}>{plural(totPedido.itens, 'item', 'itens')} · {brl(totPedido.valor)} estimado</strong>
          {resumoPedidos.fornecedores.length > 0 && <> · {resumoPedidos.fornecedores.map(f => `${f.nome} (${f.itens} · ${brl(f.valor)})`).join(', ')}</>}
          {resumoPedidos.semForn > 0 && <span className="texto-perigo"> · {plural(resumoPedidos.semForn, 'item sem fornecedor', 'itens sem fornecedor')}</span>}
        </>, <Button variante="primario" tamanho="toque" icone={<Truck size={20} />} onClick={gerarPedidos} disabled={totPedido.itens === 0 || resumoPedidos.semForn > 0} carregando={ocupado === 'pedidos'}>Gerar pedidos{resumoPedidos.fornecedores.length > 0 ? ` (${resumoPedidos.fornecedores.length})` : ''}</Button>)}
      </div>}

      {tela && aba === 'demanda' && <div className="flex flex-col gap-3">
        <p className="t-caption" style={{ margin: 0 }}>Nada entra aqui sozinho. "Incluir item", escolha Rua ou o fornecedor e gere.</p>
        {filtros}
        {itensDemanda.length === 0 ? <EmptyState icon={Plus} title="Nenhum item incluído" description="Itens sob demanda só entram quando você inclui." compact />
          : <section className="card">{itensDemanda.map(it => linha(it, selectDemanda(it)))}</section>}
        {itensDemanda.length > 0 && rodape(<strong style={{ color: 'var(--text-primary)' }}>{plural(totDemanda.itens, 'item', 'itens')} · {brl(totDemanda.valor)} estimado</strong>,
          <Button variante="primario" tamanho="toque" icone={<ClipboardCheck size={20} />} onClick={gerarDemanda} disabled={totDemanda.itens === 0} carregando={ocupado === 'demanda'}>Gerar</Button>)}
      </div>}

      {tela && aba === 'revisao' && <Revisao onMudou={carregar} />}

      {tela && aba !== 'revisao' && listasConcluidas.length > 0 && (
        <details className="mt-4">
          <summary className="t-label cursor-pointer select-none" style={{ color: 'var(--text-secondary)' }}>Listas concluídas · últimos 7 dias ({listasConcluidas.length}) — ver e imprimir em PDF</summary>
          <div className="flex flex-col gap-2 mt-2">{listasConcluidas.map(l => <CardLista key={l.lista_id} lista={l} onMudou={carregar} />)}</div>
        </details>
      )}
    </div>
  );
};

export default Compras;
