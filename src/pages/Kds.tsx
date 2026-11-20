import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, BarChart3, Beer, ChefHat, Check, Flame, History, Martini, Maximize2, RotateCcw, Search } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Button, IconButton, Segmented } from '../components/ui';

/**
 * KDS: a fila da noite no tablet de cada setor (/kds cozinha, /kds/bar,
 * /kds/drinks). Os pedidos vêm da ZIG (função kds-cozinha); o cronômetro corre
 * desde a hora do pedido e o cartão fica amarelo e depois vermelho, nos tempos
 * do setor. Um toque em "Pronto" (cozinha) ou "Entregue" (bar e drinks) tira o
 * pedido da fila; um toque num item
 * marca só aquele item.
 *
 * Parrilla (/kds/parrilla): a carne dos assados, executivos e chapas, em colunas
 * pelo ponto. A carne sem ponto fica na primeira coluna, em vermelho, com o aviso
 * para cobrar o garçom; quando ele passar o ponto, um toque leva a carne para a
 * coluna certa. Os acompanhamentos do mesmo prato aparecem na tela da cozinha.
 */

const FUSO = 'America/Cuiaba';
const LER_MS = 15_000;

type Setor = 'cozinha' | 'parrilla' | 'bar' | 'drinks';
const SETORES: Record<Setor, { nome: string; caminho: string; Icone: React.ElementType; amarelo: number; vermelho: number; item: string; feito: string; feitos: string; vazio: string }> = {
  cozinha: { nome: 'Cozinha', caminho: '/kds', Icone: ChefHat, amarelo: 15, vermelho: 20, item: 'prato', feito: 'Pronto', feitos: 'prontos', vazio: 'Os pedidos da cozinha aparecem aqui assim que o garçom lança na ZIG.' },
  parrilla: { nome: 'Parrilla', caminho: '/kds/parrilla', Icone: Flame, amarelo: 15, vermelho: 20, item: 'carne', feito: 'Pronto', feitos: 'prontas', vazio: 'As carnes dos assados, executivos e chapas aparecem aqui, separadas pelo ponto, assim que o garçom lança na ZIG.' },
  bar: { nome: 'Bar', caminho: '/kds/bar', Icone: Beer, amarelo: 5, vermelho: 8, item: 'item', feito: 'Entregue', feitos: 'entregues', vazio: 'Chopp, cervejas, long neck, refrigerantes e águas aparecem aqui assim que o garçom lança na ZIG.' },
  drinks: { nome: 'Drinks', caminho: '/kds/drinks', Icone: Martini, amarelo: 8, vermelho: 12, item: 'drink', feito: 'Entregue', feitos: 'entregues', vazio: 'Drinks, caipirinhas, doses, combos e garrafas aparecem aqui assim que o garçom lança na ZIG.' },
};
const setorDoCaminho = (caminho: string): Setor =>
  caminho.startsWith('/kds/parrilla') ? 'parrilla' : caminho.startsWith('/kds/bar') ? 'bar' : caminho.startsWith('/kds/drinks') ? 'drinks' : 'cozinha';

type Ponto = 'mal' | 'ponto_mal' | 'ponto' | 'ponto_bem' | 'bem';
const PONTOS: Array<{ id: Ponto; nome: string; curto: string; cor: string }> = [
  { id: 'mal', nome: 'Mal passado', curto: 'Mal', cor: '#c0392b' },
  { id: 'ponto_mal', nome: 'Ao ponto p/ mal', curto: 'P/ mal', cor: '#d9534f' },
  { id: 'ponto', nome: 'Ao ponto', curto: 'Ponto', cor: '#d98a4f' },
  { id: 'ponto_bem', nome: 'Ao ponto p/ bem', curto: 'P/ bem', cor: '#a8754a' },
  { id: 'bem', nome: 'Bem passado', curto: 'Bem', cor: '#7a5a3f' },
];

interface Prato {
  id: number; transacao: string; produto: string; qtd: number; adicionais: string[];
  garcom: string | null; categoria: string | null; obs: string | null; pedido_em: string; pronto_em: string | null; pronto_por: string | null;
  parte?: 'carne' | 'acomp' | null; ponto?: Ponto | null; ponto_origem?: 'zig' | 'obs' | 'padrao' | null; precisa_ponto?: boolean;
  ponto_manual?: Ponto | null; ponto_por?: string | null;
  /** Cozinha: só aparece quando a carne da parrilla fica pronta (burguer: montar). */
  espera_parrilla?: boolean;
}
const pontoFinal = (p: Prato): Ponto | null => p.ponto_manual ?? p.ponto ?? null;
/** Frango sem a palavra "frango" no nome também não leva ponto (a função já marca os novos assim). */
const NAO_LEVA_PONTO = /COXA|\bASAS?\b/;
/** Pronto travado depois de escolher o ponto, e janela do segundo toque. */
const TRAVA_PONTO_MS = 15_000;
const CONFIRMAR_MS = 3_000;

/**
 * Dois toques para finalizar, igual em todos os KDS (Kadu, 20/11/2026): o primeiro toque
 * arma o botão ("Toque de novo para confirmar") e o segundo, em até 3 s, confirma.
 */
function useDoisToques() {
  const [armado, setArmado] = useState<string | null>(null);
  useEffect(() => { if (!armado) return; const t = setTimeout(() => setArmado(null), CONFIRMAR_MS); return () => clearTimeout(t); }, [armado]);
  const tocar = (chave: string, fazer: () => void) => { if (armado === chave) { setArmado(null); fazer(); } else setArmado(chave); };
  return { armado, tocar };
}
type DoisToques = ReturnType<typeof useDoisToques>;
const AMARELO_CONF = '#f5c451';

/** Tipo do prato da parrilla (executivo, assado ou chapa): pela categoria da ZIG ou, sem ela, pelo começo do nome. */
const TIPO_PRATO = {
  EXECUTIVO: { nome: 'EXECUTIVO', fundo: '#2563eb' },
  ASSADO: { nome: 'ASSADO', fundo: '#c2410c' },
  CHAPA: { nome: 'CHAPA', fundo: '#7c3aed' },
} as const;
function tipoPrato(p: Prato) {
  const t = `${p.categoria ?? ''} ${p.produto}`.toUpperCase();
  const cat = (p.categoria ?? '').toUpperCase();
  const k = (['EXECUTIVO', 'ASSADO', 'CHAPA'] as const).find((x) => cat.startsWith(x)) ?? (['EXECUTIVO', 'ASSADO', 'CHAPA'] as const).find((x) => t.includes(x));
  return k ? TIPO_PRATO[k] : null;
}
/** Nome da carne sem o tipo na frente ("ASSADO DE TIRA" vira "TIRA"). */
const nomeCarne = (produto: string) => produto.replace(/^(ASSADO|EXECUTIVO|CHAPA)\s+(DE\s+|DA\s+|DO\s+)?/i, '') || produto;
const EtiquetaTipo: React.FC<{ p: Prato; grande?: boolean }> = ({ p, grande }) => {
  const t = tipoPrato(p);
  if (!t) return null;
  return (
    <span style={{ display: 'inline-block', background: t.fundo, color: '#fff', borderRadius: 6, padding: grande ? '2px 8px' : '1px 6px',
      fontSize: grande ? 16 : 12, fontWeight: 900, letterSpacing: 0.5, marginBottom: grande ? 4 : 0, marginRight: grande ? 0 : 4 }}>{t.nome}</span>
  );
};
interface Fila {
  noite: string; agora: string; lido_em: string | null; erro: string | null; pratos: Prato[];
  resumo: { pratos: number; feitos: number; media_min: number | null; vermelhos: number; atraso_zig: { pratos: number; ate_seg: number; desde_seg: number } | null };
}
interface Pedido { transacao: string; pedido_em: string; garcom: string | null; obs: string | null; pratos: Prato[] }

const hhmm = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO }) : '—';
const relogio = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const primeiro = (nome: string | null) => (nome ? nome.split(' ')[0] : 'Balcão');
const qtd = (n: number) => (Number.isInteger(n) ? String(n) : n.toLocaleString('pt-BR'));

const COR = {
  verde: { borda: '#2f9e5b', fundo: 'rgba(47,158,91,0.12)', texto: '#5fd38d' },
  amarelo: { borda: '#e0a526', fundo: 'rgba(224,165,38,0.16)', texto: '#f5c451' },
  vermelho: { borda: '#e5484d', fundo: 'rgba(229,72,77,0.18)', texto: '#ff6b6f' },
};
const corDe = (min: number, s: Setor) => (min >= SETORES[s].vermelho ? COR.vermelho : min >= SETORES[s].amarelo ? COR.amarelo : COR.verde);

/**
 * Cozinha em colunas (Kadu, 20/11/2026): cada prato vai para a coluna do tipo dele,
 * pela categoria do cardápio na ZIG. O acompanhamento de assado, executivo, chapa,
 * costela de colher e burguer (a carne fica na parrilla) vai para Assados.
 */
type ColCozinha = 'entrada' | 'fritura' | 'assado' | 'pratos' | 'sobremesa';
const COLUNAS_COZINHA: Array<{ id: ColCozinha; nome: string; cor: string }> = [
  { id: 'entrada', nome: 'Entradas e frios', cor: '#2f7d6d' },
  { id: 'fritura', nome: 'Fritura', cor: '#b7791f' },
  { id: 'assado', nome: 'Assados e acompanhamentos', cor: '#b65b43' },
  { id: 'pratos', nome: 'Pratos e lanches', cor: '#5b5fc7' },
  { id: 'sobremesa', nome: 'Sobremesa', cor: '#9b4f78' },
];
const semAcento = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();
function colunaCozinha(p: Prato): ColCozinha {
  if (p.parte === 'acomp') return 'assado';
  const cat = semAcento(p.categoria ?? '');
  if (/SOBREMESA/.test(cat)) return 'sobremesa';
  if (/ENTRADA|FRIOS|SALADA/.test(cat)) return 'entrada';
  if (/BELISCAR|PORCAO|BOLINHO|PASTE|FOME DE PASSARINHO/.test(cat)) return 'fritura';
  if (/ASSADO|EXECUTIVO|CHAPA|OUTROS/.test(cat)) return 'assado';
  return 'pratos';
}
const CHAVE_MODO = 'kds-cozinha-modo';

/** Bipe curto para pedido novo (precisa de um toque antes: regra do navegador). */
function bipe(ctx: AudioContext | null) {
  if (!ctx) return;
  for (const [t, f] of [[0, 880], [0.18, 1175]] as const) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, ctx.currentTime + t);
    g.gain.exponentialRampToValueAtTime(0.4, ctx.currentTime + t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + t + 0.16);
    o.connect(g).connect(ctx.destination);
    o.start(ctx.currentTime + t);
    o.stop(ctx.currentTime + t + 0.18);
  }
}

/** Um prato da cozinha (texto do item e adicionais), igual nos dois modos. */
const LinhaPrato: React.FC<{ p: Prato; cor: string }> = ({ p, cor }) => (
  <>
    {p.parte === 'acomp' && p.espera_parrilla ? (
      <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.25 }}>
        <span style={{ color: cor }}>{qtd(p.qtd)}×</span> {p.produto} <span style={{ fontSize: 15, opacity: 0.75 }}>(hambúrguer pronto na parrilla)</span>
      </div>
    ) : p.parte === 'acomp' ? (
      <div style={{ fontSize: 15, fontWeight: 700, lineHeight: 1.25, opacity: 0.85 }}>
        <span style={{ color: cor }}>{qtd(p.qtd)}×</span> Acompanhamento · <EtiquetaTipo p={p} />{nomeCarne(p.produto)} <span style={{ opacity: 0.7 }}>(carne na parrilla)</span>
      </div>
    ) : (
      <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.25 }}>
        <span style={{ color: cor }}>{qtd(p.qtd)}×</span> {p.produto}
      </div>
    )}
    {p.adicionais.map((a, i) => (
      <div key={i} style={{ fontSize: 16, opacity: 0.9, paddingLeft: 22 }}>+ {a}</div>
    ))}
  </>
);

const Kds: React.FC = () => {
  const navigate = useNavigate();
  const setor = setorDoCaminho(useLocation().pathname);
  const S = SETORES[setor];
  const [aba, setAba] = useState<'fila' | 'relatorio' | 'historico'>('fila');
  const dois = useDoisToques();
  const [fila, setFila] = useState<Fila | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const [iniciado, setIniciado] = useState(false);
  const [modo, setModo] = useState<'colunas' | 'pedido'>(() => {
    try { return localStorage.getItem(CHAVE_MODO) === 'pedido' ? 'pedido' : 'colunas'; } catch { return 'colunas'; }
  });
  const mudarModo = (m: 'colunas' | 'pedido') => { setModo(m); try { localStorage.setItem(CHAVE_MODO, m); } catch { /* sem storage */ } };
  const audio = useRef<AudioContext | null>(null);
  const vistos = useRef<Set<string> | null>(null);
  const trava = useRef<WakeLockSentinel | null>(null);
  const caixa = useRef<HTMLDivElement>(null);
  /** Hora do último toque (ponto ou pronto). Leitura que saiu antes dele chega velha e é descartada. */
  const ultimoToque = useRef(0);

  const buscar = useCallback(async () => {
    const saiu = Date.now();
    try {
      const { data, error } = await supabase.functions.invoke('kds-cozinha', { body: { acao: 'fila', setor } });
      if (error || !data?.ok) throw new Error(data?.error || 'sem resposta');
      if (ultimoToque.current >= saiu) return;
      const f = data as Fila;
      // Pedido novo na fila: bipa (menos na primeira leitura).
      const abertos = new Set(f.pratos.filter((p) => !p.pronto_em).map((p) => p.transacao));
      if (vistos.current && [...abertos].some((t) => !vistos.current!.has(t))) {
        bipe(audio.current);
        // Parrilla: carne nova sem ponto bipa de novo, para chamar o garçom.
        const semPonto = f.pratos.some((p) => !p.pronto_em && p.precisa_ponto && !pontoFinal(p) && !vistos.current!.has(p.transacao));
        if (semPonto) setTimeout(() => bipe(audio.current), 450);
      }
      vistos.current = new Set([...(vistos.current ?? []), ...abertos]);
      setFila(f);
      setErro(null);
    } catch {
      setErro('Sem conexão com o sistema. Mostrando a última leitura.');
    }
  }, [setor]);

  // Trocou de setor: começa do zero (sem bipar pelo que já estava na fila).
  useEffect(() => { setFila(null); vistos.current = null; }, [setor]);

  useEffect(() => {
    buscar();
    const t = setInterval(() => { if (document.visibilityState === 'visible') buscar(); }, LER_MS);
    const s = setInterval(() => setAgora(Date.now()), 1000);
    return () => { clearInterval(t); clearInterval(s); };
  }, [buscar]);

  // Tela sempre acesa enquanto o KDS está aberto (o navegador solta ao trocar de aba).
  useEffect(() => {
    if (!iniciado) return;
    const pedir = async () => {
      try { trava.current = await navigator.wakeLock?.request('screen') ?? null; } catch { /* sem suporte */ }
    };
    void pedir();
    const voltou = () => { if (document.visibilityState === 'visible') void pedir(); };
    document.addEventListener('visibilitychange', voltou);
    return () => { document.removeEventListener('visibilitychange', voltou); void trava.current?.release(); };
  }, [iniciado]);

  const comecar = () => {
    try { audio.current = new AudioContext(); bipe(audio.current); } catch { /* sem som */ }
    void document.documentElement.requestFullscreen?.().catch(() => undefined);
    setIniciado(true);
  };

  const marcarPonto = async (id: number, ponto: Ponto | null) => {
    ultimoToque.current = Date.now();
    setFila((f) => f && { ...f, pratos: f.pratos.map((p) => (p.id === id ? { ...p, ponto_manual: ponto } : p)) });
    const { data, error } = await supabase.functions.invoke('kds-cozinha', { body: { acao: 'ponto', ids: [id], ponto } });
    ultimoToque.current = Date.now();
    if (error || !data?.ok) setErro('Não consegui gravar o ponto. Toque de novo.');
    void buscar();
  };

  const marcar = async (ids: number[], acao: 'pronto' | 'desfazer') => {
    // Some da fila na hora; a próxima leitura confirma.
    ultimoToque.current = Date.now();
    setFila((f) => f && {
      ...f,
      pratos: f.pratos.map((p) => (ids.includes(p.id) ? { ...p, pronto_em: acao === 'pronto' ? new Date().toISOString() : null } : p)),
    });
    const { data, error } = await supabase.functions.invoke('kds-cozinha', { body: { acao, ids } });
    ultimoToque.current = Date.now();
    if (error || !data?.ok) setErro('Não consegui gravar. Toque de novo.');
    void buscar();
  };

  const pedidos = useMemo(() => {
    const m = new Map<string, Pedido>();
    for (const p of fila?.pratos ?? []) {
      if (p.pronto_em) continue;
      const ped = m.get(p.transacao) ?? { transacao: p.transacao, pedido_em: p.pedido_em, garcom: p.garcom, obs: p.obs, pratos: [] };
      ped.pratos.push(p);
      if (p.pedido_em < ped.pedido_em) ped.pedido_em = p.pedido_em;
      m.set(p.transacao, ped);
    }
    return [...m.values()].sort((a, b) => a.pedido_em.localeCompare(b.pedido_em));
  }, [fila]);
  const prontos = useMemo(() => (fila?.pratos ?? []).filter((p) => p.pronto_em).sort((a, b) => String(b.pronto_em).localeCompare(String(a.pronto_em))), [fila]);

  const r = fila?.resumo;
  const lidoHa = fila?.lido_em ? Math.round((agora - new Date(fila.lido_em).getTime()) / 1000) : null;

  return (
    // Tela cheia é a PÁGINA inteira (document.documentElement), não esta caixa: com a caixa em
    // tela cheia o navegador a prende na altura do tablet e o dedo não desliza a fila (bug de
    // 20/11/2026, em todos os setores). Assim quem rola é a própria página, com o topo fixo.
    <div ref={caixa} className="flex flex-col" style={{ minHeight: '100dvh', background: '#0b0e13', color: '#ece6da' }}>
      {/* topo, sempre visível */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ position: 'sticky', top: 0, zIndex: 20, background: '#0b0e13', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <IconButton aria-label="Voltar ao sistema" onClick={() => navigate('/')}><ArrowLeft size={18} /></IconButton>
        <S.Icone size={22} style={{ color: '#f5c451' }} />
        <Segmented<Setor> rotulo="Setor" valor={setor} onMudar={(s) => navigate(SETORES[s].caminho)}
          opcoes={(Object.keys(SETORES) as Setor[]).map((s) => ({ valor: s, rotulo: SETORES[s].nome }))} />
        <span style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{hhmm(new Date(agora).toISOString())}</span>
        <Segmented<'fila' | 'relatorio' | 'historico'> rotulo="Tela" valor={aba} onMudar={setAba}
          opcoes={[{ valor: 'fila', rotulo: `Fila (${pedidos.length})` }, { valor: 'historico', rotulo: 'Histórico' }, { valor: 'relatorio', rotulo: 'Tempos' }]} />
        {setor === 'cozinha' && aba === 'fila' && (
          <Segmented<'colunas' | 'pedido'> rotulo="Arrumação" valor={modo} onMudar={mudarModo}
            opcoes={[{ valor: 'colunas', rotulo: 'Colunas' }, { valor: 'pedido', rotulo: 'Por pedido' }]} />
        )}
        <div className="flex-1" />
        {r && (
          <span style={{ fontSize: 15, opacity: 0.85 }}>
            {r.feitos} {S.feitos} · média {r.media_min ?? '—'} min · {r.vermelhos} passaram de {S.vermelho} min
          </span>
        )}
        <span style={{ fontSize: 13, opacity: 0.6 }}>
          {lidoHa === null ? 'lendo a ZIG…' : `ZIG lida há ${lidoHa}s`}
          {r?.atraso_zig ? ` · a ZIG mostra o pedido em até ~${r.atraso_zig.ate_seg}s` : ''}
        </span>
        <IconButton aria-label="Tela cheia" onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void document.documentElement.requestFullscreen?.())}>
          <Maximize2 size={18} />
        </IconButton>
      </div>

      {(erro || fila?.erro) && (
        <div className="px-4 py-2" style={{ background: 'rgba(229,72,77,0.18)', color: '#ffb3b5', fontSize: 15 }}>{erro || fila?.erro}</div>
      )}

      {aba === 'fila' ? (
        <div className="flex-1 p-4">
          {setor === 'parrilla' && pedidos.length > 0 ? (
            <ParrillaColunas pratos={(fila?.pratos ?? []).filter((p) => !p.pronto_em)} agora={agora}
              onPronto={(id) => marcar([id], 'pronto')} onPonto={marcarPonto} />
          ) : setor === 'cozinha' && modo === 'colunas' && pedidos.length > 0 ? (
            <CozinhaColunas pratos={(fila?.pratos ?? []).filter((p) => !p.pronto_em)} agora={agora} dois={dois}
              onPronto={(ids) => marcar(ids, 'pronto')} />
          ) : pedidos.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center gap-2" style={{ minHeight: '50vh', opacity: 0.7 }}>
              <S.Icone size={48} />
              <p style={{ fontSize: 20 }}>{fila ? 'Nada na fila.' : 'Lendo a ZIG…'}</p>
              <p style={{ fontSize: 14 }}>{S.vazio}</p>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))' }}>
              {pedidos.map((ped) => {
                const ms = agora - new Date(ped.pedido_em).getTime();
                const c = corDe(ms / 60000, setor);
                return (
                  <div key={ped.transacao} className="flex flex-col" style={{ border: `3px solid ${c.borda}`, background: c.fundo, borderRadius: 14, overflow: 'hidden' }}>
                    <div className="flex items-baseline justify-between px-3 pt-2">
                      <span style={{ fontSize: 34, fontWeight: 900, color: c.texto, fontVariantNumeric: 'tabular-nums' }}>{relogio(ms)}</span>
                      <span style={{ fontSize: 14, opacity: 0.8, textAlign: 'right' }}>{hhmm(ped.pedido_em)}<br />{primeiro(ped.garcom)}</span>
                    </div>
                    {ped.obs && <div className="px-3" style={{ fontSize: 20, fontWeight: 800 }}>{ped.obs}</div>}
                    <div className="flex-1 px-3 py-2">
                      {ped.pratos.map((p) => (
                        <button key={p.id} type="button" onClick={() => dois.tocar(`i${p.id}`, () => marcar([p.id], 'pronto'))} className="w-full text-left py-1.5"
                          style={{ borderTop: '1px solid rgba(255,255,255,0.08)', ...(dois.armado === `i${p.id}` ? { background: 'rgba(245,196,81,0.18)', boxShadow: `inset 4px 0 0 ${AMARELO_CONF}` } : {}) }}
                          title={`Dois toques para marcar só este ${S.item}`}>
                          <LinhaPrato p={p} cor={c.texto} />
                          {dois.armado === `i${p.id}` && <div style={{ fontSize: 14, fontWeight: 800, color: AMARELO_CONF }}>Toque de novo para marcar só este {S.item}</div>}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={() => dois.tocar(`p${ped.transacao}`, () => marcar(ped.pratos.map((p) => p.id), 'pronto'))}
                      className="flex items-center justify-center gap-2" style={{ minHeight: 56, background: dois.armado === `p${ped.transacao}` ? AMARELO_CONF : c.borda, color: '#0b0e13', fontSize: dois.armado === `p${ped.transacao}` ? 17 : 20, fontWeight: 800 }}>
                      <Check size={22} /> {dois.armado === `p${ped.transacao}` ? 'Toque de novo para confirmar' : S.feito}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {prontos.length > 0 && (
            <div className="mt-6">
              <p style={{ fontSize: 14, opacity: 0.6, marginBottom: 6 }}>{S.feitos.charAt(0).toUpperCase() + S.feitos.slice(1)} nos últimos 15 minutos (dois toques para voltar à fila)</p>
              <div className="flex flex-wrap gap-2">
                {prontos.map((p) => (
                  <button key={p.id} type="button" onClick={() => dois.tocar(`d${p.id}`, () => marcar([p.id], 'desfazer'))} className="flex items-center gap-2 px-3 py-2"
                    style={{ border: `1px solid ${dois.armado === `d${p.id}` ? AMARELO_CONF : 'rgba(255,255,255,0.15)'}`, borderRadius: 10, fontSize: 15, background: dois.armado === `d${p.id}` ? 'rgba(245,196,81,0.18)' : undefined }}>
                    <RotateCcw size={14} /> {dois.armado === `d${p.id}` ? <b style={{ color: AMARELO_CONF }}>Toque de novo para voltar à fila: </b> : null}{qtd(p.qtd)}× {setor === 'parrilla' ? <><EtiquetaTipo p={p} />{nomeCarne(p.produto)}</> : p.produto} · {Math.round((new Date(p.pronto_em!).getTime() - new Date(p.pedido_em).getTime()) / 60000)} min
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : aba === 'historico' ? (
        <Historico key={setor} setor={setor} noiteAtual={fila?.noite ?? null} />
      ) : (
        <Relatorio key={setor} setor={setor} noiteAtual={fila?.noite ?? null} />
      )}

      {!iniciado && (
        <button type="button" onClick={comecar} className="fixed inset-0 flex flex-col items-center justify-center gap-3"
          style={{ zIndex: 60, background: 'rgba(11,14,19,0.92)', color: '#ece6da' }}>
          <S.Icone size={56} style={{ color: '#f5c451' }} />
          <span style={{ fontSize: 28, fontWeight: 800 }}>KDS {S.nome}: toque para começar</span>
          <span style={{ fontSize: 16, opacity: 0.75 }}>Liga o som de pedido novo, deixa a tela acesa e abre em tela cheia.</span>
        </button>
      )}
    </div>
  );
};

/** Cozinha em colunas por tipo: um cartão por prato, do mais antigo para o mais novo. */
const CozinhaColunas: React.FC<{ pratos: Prato[]; agora: number; dois: DoisToques; onPronto: (ids: number[]) => void }> = ({ pratos, agora, dois, onPronto }) => {
  const ordem = [...pratos].sort((a, b) => a.pedido_em.localeCompare(b.pedido_em) || a.id - b.id);
  const col = new Map(ordem.map((p) => [p.id, colunaCozinha(p)] as const));
  // O que mais o mesmo pedido tem em outras colunas, para sair tudo junto.
  const outras = (p: Prato) => {
    const m = new Map<ColCozinha, number>();
    for (const q of ordem) if (q.transacao === p.transacao && col.get(q.id) !== col.get(p.id)) m.set(col.get(q.id)!, (m.get(col.get(q.id)!) ?? 0) + q.qtd);
    return [...m.entries()].map(([c, n]) => `+${qtd(n)} em ${COLUNAS_COZINHA.find((x) => x.id === c)!.nome}`);
  };
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${COLUNAS_COZINHA.length}, minmax(190px, 1fr))`, overflowX: 'auto', alignItems: 'start' }}>
      {COLUNAS_COZINHA.map((c0) => {
        const itens = ordem.filter((p) => col.get(p.id) === c0.id);
        return (
          <div key={c0.id} className="flex flex-col gap-2" style={{ minWidth: 0 }}>
            <div className="flex items-center gap-1.5 px-2 py-2" style={{ background: c0.cor, color: '#fff', borderRadius: 10, fontSize: 15, fontWeight: 800, lineHeight: 1.15 }}>
              <span className="flex-1">{c0.nome}</span>
              <span style={{ fontSize: 18 }}>{itens.reduce((s, p) => s + p.qtd, 0) || ''}</span>
            </div>
            {itens.map((p) => {
              const ms = agora - new Date(p.pedido_em).getTime();
              const c = corDe(ms / 60000, 'cozinha');
              const mais = outras(p);
              return (
                <div key={p.id} className="flex flex-col" style={{ border: `3px solid ${c.borda}`, background: c.fundo, borderRadius: 12, overflow: 'hidden' }}>
                  <div className="flex items-baseline justify-between px-2.5 pt-1.5">
                    <span style={{ fontSize: 26, fontWeight: 900, color: c.texto, fontVariantNumeric: 'tabular-nums' }}>{relogio(ms)}</span>
                    <span style={{ fontSize: 13, opacity: 0.85, textAlign: 'right' }}>{hhmm(p.pedido_em)}<br />{primeiro(p.garcom)}</span>
                  </div>
                  {p.obs && <div className="px-2.5" style={{ fontSize: 17, fontWeight: 800 }}>{p.obs}</div>}
                  <div className="px-2.5 py-1.5"><LinhaPrato p={p} cor={c.texto} /></div>
                  {mais.length > 0 && (
                    <div className="px-2.5 pb-1.5" style={{ fontSize: 13, fontWeight: 700, color: '#f5c451' }}>
                      Mesmo pedido: {mais.join(' · ')}
                    </div>
                  )}
                  <button type="button" onClick={() => dois.tocar(`c${p.id}`, () => onPronto([p.id]))}
                    className="flex items-center justify-center gap-2" style={{ minHeight: 48, background: dois.armado === `c${p.id}` ? AMARELO_CONF : c.borda, color: '#0b0e13', fontSize: dois.armado === `c${p.id}` ? 15 : 18, fontWeight: 800, lineHeight: 1.15 }}>
                    <Check size={20} /> {dois.armado === `c${p.id}` ? 'Toque de novo para confirmar' : 'Pronto'}
                  </button>
                </div>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

/** Parrilla: uma coluna por ponto; a carne sem ponto fica primeiro, em vermelho, para cobrar o garçom. */
const ParrillaColunas: React.FC<{
  pratos: Prato[]; agora: number; onPronto: (id: number) => void; onPonto: (id: number, ponto: Ponto | null) => void;
}> = ({ pratos, agora, onPronto, onPonto: marcarPonto }) => {
  // Depois de escolher o ponto, o Pronto fica travado uns segundos (o parrilleiro apertava os dois em seguida
  // e a carne saía da tela sem estar pronta). E o Pronto pede dois toques.
  const [pontoEm, setPontoEm] = useState<Record<number, number>>({});
  const [confirmar, setConfirmar] = useState<number | null>(null);
  useEffect(() => { if (confirmar === null) return; const t = setTimeout(() => setConfirmar(null), CONFIRMAR_MS); return () => clearTimeout(t); }, [confirmar]);
  const onPonto = (id: number, ponto: Ponto | null) => {
    if (ponto) setPontoEm((m) => ({ ...m, [id]: Date.now() }));
    setConfirmar(null);
    marcarPonto(id, ponto);
  };
  const tocarPronto = (id: number) => {
    if (confirmar === id) { setConfirmar(null); onPronto(id); } else setConfirmar(id);
  };
  const levaPonto = (p: Prato) => !!p.precisa_ponto && !NAO_LEVA_PONTO.test(p.produto.toUpperCase());
  const ordem = [...pratos].sort((a, b) => a.pedido_em.localeCompare(b.pedido_em));
  const semPonto = ordem.filter((p) => levaPonto(p) && !pontoFinal(p));
  const naoLeva = ordem.filter((p) => !levaPonto(p));
  const colunas: Array<{ id: string; nome: string; cor: string; itens: Prato[]; alerta?: boolean }> = [
    { id: 'sem', nome: 'Sem ponto: cobrar o garçom', cor: '#e5484d', itens: semPonto, alerta: true },
    ...PONTOS.map((pt) => ({ id: pt.id, nome: pt.nome, cor: pt.cor, itens: ordem.filter((p) => levaPonto(p) && pontoFinal(p) === pt.id) })),
    ...(naoLeva.length ? [{ id: 'nao', nome: 'Não leva ponto', cor: '#5b6472', itens: naoLeva }] : []),
  ];
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${colunas.length}, minmax(160px, 1fr))`, overflowX: 'auto', alignItems: 'start' }}>
      <style>{'@keyframes kdsPisca{0%,100%{box-shadow:0 0 0 0 rgba(229,72,77,.0)}50%{box-shadow:0 0 0 6px rgba(229,72,77,.55)}}'}</style>
      {colunas.map((col) => (
        <div key={col.id} className="flex flex-col gap-2" style={{ minWidth: 0 }}>
          <div className="flex items-center gap-1.5 px-2 py-2" style={{ background: col.cor, color: '#fff', borderRadius: 10, fontSize: 15, fontWeight: 800, lineHeight: 1.15 }}>
            {col.alerta && <AlertTriangle size={16} />}
            <span className="flex-1">{col.nome}</span>
            <span style={{ fontSize: 18 }}>{col.itens.reduce((s, p) => s + p.qtd, 0) || ''}</span>
          </div>
          {col.itens.map((p) => {
            const ms = agora - new Date(p.pedido_em).getTime();
            const c = corDe(ms / 60000, 'parrilla');
            const sem = col.alerta;
            return (
              <div key={p.id} className="flex flex-col" style={{
                border: `3px solid ${sem ? COR.vermelho.borda : c.borda}`, background: sem ? COR.vermelho.fundo : c.fundo, borderRadius: 12, overflow: 'hidden',
                animation: sem ? 'kdsPisca 1.2s ease-in-out infinite' : undefined,
              }}>
                <div className="flex items-baseline justify-between px-2.5 pt-1.5">
                  <span style={{ fontSize: 26, fontWeight: 900, color: c.texto, fontVariantNumeric: 'tabular-nums' }}>{relogio(ms)}</span>
                  <span style={{ fontSize: 13, opacity: 0.85, textAlign: 'right' }}>{hhmm(p.pedido_em)}<br />{primeiro(p.garcom)}</span>
                </div>
                {p.obs && <div className="px-2.5" style={{ fontSize: 17, fontWeight: 800 }}>{p.obs}</div>}
                <div className="px-2.5 py-1.5" style={{ fontSize: 18, fontWeight: 800, lineHeight: 1.2 }}>
                  <div><EtiquetaTipo p={p} grande /></div>
                  <span style={{ color: c.texto }}>{qtd(p.qtd)}×</span> {nomeCarne(p.produto)}
                  {p.adicionais.map((a, i) => <div key={i} style={{ fontSize: 14, fontWeight: 600, opacity: 0.9 }}>+ {a}</div>)}
                  {p.ponto_manual && <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>ponto marcado no tablet</div>}
                  {!p.ponto_manual && p.ponto_origem === 'obs' && <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>ponto lido da observação</div>}
                  {!p.ponto_manual && p.ponto_origem === 'padrao' && <div style={{ fontSize: 12, fontWeight: 600, opacity: 0.7 }}>ao ponto automático (sem opção na ZIG)</div>}
                </div>
                {sem ? (
                  <div className="px-2 pb-2">
                    <div style={{ fontSize: 14, fontWeight: 800, color: '#ffb3b5', marginBottom: 6 }}>
                      Cobrar o ponto: {p.garcom ? primeiro(p.garcom) : 'garçom'}{p.obs ? ` · ${p.obs}` : ''}
                    </div>
                    <div className="grid gap-1" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }}>
                      {PONTOS.map((pt) => (
                        <button key={pt.id} type="button" onClick={() => onPonto(p.id, pt.id)}
                          style={{ minHeight: 40, background: pt.cor, color: '#fff', borderRadius: 8, fontSize: 13, fontWeight: 800 }}>{pt.curto}</button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex">
                    {p.ponto_manual && (
                      <button type="button" onClick={() => onPonto(p.id, null)} title="Desfazer o ponto marcado"
                        style={{ minHeight: 48, padding: '0 12px', background: 'rgba(255,255,255,0.08)' }}><RotateCcw size={16} /></button>
                    )}
                    {(() => {
                      const falta = pontoEm[p.id] ? Math.ceil((pontoEm[p.id] + TRAVA_PONTO_MS - agora) / 1000) : 0;
                      if (falta > 0) {
                        const pt = PONTOS.find((x) => x.id === pontoFinal(p));
                        return (
                          <div className="flex flex-1 flex-col items-center justify-center" style={{ minHeight: 48, background: pt?.cor ?? '#5b6472', color: '#fff', lineHeight: 1.15 }}>
                            <span style={{ fontSize: 16, fontWeight: 900 }}>Ponto: {pt?.nome ?? '—'} ✓</span>
                            <span style={{ fontSize: 12, fontWeight: 700, opacity: 0.85 }}>Pronto libera em {falta}s</span>
                          </div>
                        );
                      }
                      const conf = confirmar === p.id;
                      return (
                        <button type="button" onClick={() => tocarPronto(p.id)} className="flex flex-1 items-center justify-center gap-2"
                          style={{ minHeight: 48, background: conf ? '#f5c451' : c.borda, color: '#0b0e13', fontSize: conf ? 15 : 18, fontWeight: 800, lineHeight: 1.15 }}>
                          <Check size={20} /> {conf ? 'Toque de novo para confirmar' : 'Pronto'}
                        </button>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
};

interface Relat {
  noite: string; pratos: number; feitos: number; sem_pronto: number; media_min: number | null; mediana_min: number | null;
  amarelos: number; vermelhos: number; atraso_zig: { pratos: number; ate_seg: number; desde_seg: number } | null;
  por_produto: Array<{ produto: string; feitos: number; media_min: number | null; maior_min: number; acima_vermelho: number }>;
  por_hora: Array<{ hora: string; feitos: number; media_min: number | null }>;
  campos_zig: string[];
  sem_ponto?: Array<{ garcom: string; carnes: number; sem_ponto: number; marcados_no_tablet: number }>;
}

/** Tempos de uma noite do setor: por item e por hora, e quanto a ZIG demora a mostrar o pedido. */
const Relatorio: React.FC<{ setor: Setor; noiteAtual: string | null }> = ({ setor, noiteAtual }) => {
  const S = SETORES[setor];
  const [noite, setNoite] = useState<string>(noiteAtual ?? new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10));
  const [dados, setDados] = useState<Relat | null>(null);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    supabase.functions.invoke('kds-cozinha', { body: { acao: 'relatorio', noite, setor } }).then(({ data }) => {
      if (vivo) { setDados(data?.ok ? (data as Relat) : null); setCarregando(false); }
    });
    return () => { vivo = false; };
  }, [noite, setor]);

  const celula: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: 16 };
  return (
    <div className="p-4" style={{ maxWidth: 1100 }}>
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <BarChart3 size={20} />
        <span style={{ fontSize: 18, fontWeight: 800 }}>Tempos da noite · {S.nome}</span>
        <input type="date" value={noite} onChange={(e) => setNoite(e.target.value)} aria-label="Noite"
          style={{ background: '#151a22', color: '#ece6da', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '6px 10px', fontSize: 16 }} />
        {carregando && <span style={{ opacity: 0.6 }}>carregando…</span>}
      </div>
      {!dados || dados.pratos === 0 ? (
        <p style={{ opacity: 0.7, fontSize: 16 }}>{carregando ? '' : 'Nada registrado neste setor nesta noite.'}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-3 mb-5">
            {[
              ['Pedidos', dados.pratos],
              [`Marcados ${S.feitos}`, dados.feitos],
              ['Tempo médio', dados.media_min === null ? '—' : `${dados.media_min} min`],
              ['Mediana', dados.mediana_min === null ? '—' : `${dados.mediana_min} min`],
              [`${S.amarelo}–${S.vermelho} min`, dados.amarelos],
              [`${S.vermelho}+ min`, dados.vermelhos],
              [`Sem "${S.feito.toLowerCase()}"`, dados.sem_pronto],
            ].map(([rotulo, valor]) => (
              <div key={String(rotulo)} className="px-4 py-3" style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 12, minWidth: 130 }}>
                <div style={{ fontSize: 13, opacity: 0.65 }}>{rotulo}</div>
                <div style={{ fontSize: 24, fontWeight: 800 }}>{valor}</div>
              </div>
            ))}
          </div>
          <p style={{ fontSize: 15, opacity: 0.8, marginBottom: 16 }}>
            {dados.atraso_zig
              ? `Atraso da ZIG: o pedido aparece entre ${dados.atraso_zig.desde_seg}s e ${dados.atraso_zig.ate_seg}s depois de lançado (mediana de ${dados.atraso_zig.pratos} itens).`
              : 'Atraso da ZIG: ainda sem leituras seguidas para medir.'}
          </p>
          <table className="w-full" style={{ borderCollapse: 'collapse', marginBottom: 20 }}>
            <thead><tr style={{ textAlign: 'left', opacity: 0.65 }}>
              <th style={celula}>Item</th><th style={celula}>Feitos</th><th style={celula}>Média</th><th style={celula}>Maior</th><th style={celula}>{S.vermelho}+ min</th>
            </tr></thead>
            <tbody>
              {dados.por_produto.map((p) => (
                <tr key={p.produto}>
                  <td style={celula}>{p.produto}</td><td style={celula}>{p.feitos}</td>
                  <td style={{ ...celula, color: corDe(p.media_min ?? 0, setor).texto, fontWeight: 700 }}>{p.media_min} min</td>
                  <td style={celula}>{p.maior_min} min</td><td style={celula}>{p.acima_vermelho}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {dados.sem_ponto && dados.sem_ponto.length > 0 && (
            <>
              <p style={{ fontSize: 17, fontWeight: 800, marginBottom: 6 }}>Carnes lançadas sem ponto, por garçom</p>
              <table className="w-full" style={{ borderCollapse: 'collapse', marginBottom: 20 }}>
                <thead><tr style={{ textAlign: 'left', opacity: 0.65 }}>
                  <th style={celula}>Garçom</th><th style={celula}>Carnes</th><th style={celula}>Sem ponto</th><th style={celula}>Ponto marcado no tablet</th>
                </tr></thead>
                <tbody>
                  {dados.sem_ponto.map((g) => (
                    <tr key={g.garcom}>
                      <td style={celula}>{g.garcom}</td><td style={celula}>{g.carnes}</td>
                      <td style={{ ...celula, color: g.sem_ponto ? COR.vermelho.texto : undefined, fontWeight: 700 }}>{g.sem_ponto}</td>
                      <td style={celula}>{g.marcados_no_tablet}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          <div className="flex flex-wrap gap-2">
            {dados.por_hora.map((h) => (
              <div key={h.hora} className="px-3 py-2" style={{ border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10 }}>
                <div style={{ fontSize: 13, opacity: 0.65 }}>{h.hora}h · {h.feitos} itens</div>
                <div style={{ fontSize: 18, fontWeight: 800, color: corDe(h.media_min ?? 0, setor).texto }}>{h.media_min} min</div>
              </div>
            ))}
          </div>
        </>
      )}
      <div className="mt-6"><Button tamanho="sm" onClick={() => setNoite(noiteAtual ?? noite)}>Voltar para a noite de hoje</Button></div>
    </div>
  );
};

interface ItemHist extends Prato { visto_em: string | null; cancelado: boolean | null }

/**
 * Histórico da noite (Kadu, 20/11/2026): cada item do setor, com a hora que entrou na ZIG,
 * a hora que apareceu no KDS, a hora do pronto, o tempo, o garçom que lançou e quem marcou.
 * Usa a mesma leitura dos Tempos (kds_pratos), sem mudar nada no banco.
 */
const Historico: React.FC<{ setor: Setor; noiteAtual: string | null }> = ({ setor, noiteAtual }) => {
  const S = SETORES[setor];
  const [noite, setNoite] = useState<string>(noiteAtual ?? new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10));
  const [lista, setLista] = useState<ItemHist[] | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [filtro, setFiltro] = useState<'feitos' | 'sem' | 'todos'>('feitos');
  const [busca, setBusca] = useState('');

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    supabase.functions.invoke('kds-cozinha', { body: { acao: 'relatorio', noite, setor } }).then(({ data }) => {
      if (vivo) { setLista(data?.ok ? ((data.lista ?? []) as ItemHist[]) : null); setCarregando(false); }
    });
    return () => { vivo = false; };
  }, [noite, setor]);

  const termo = semAcento(busca.trim());
  const linhas = (lista ?? [])
    .filter((p) => (filtro === 'todos' ? true : filtro === 'feitos' ? !!p.pronto_em : !p.pronto_em))
    .filter((p) => !termo || semAcento(`${p.produto} ${p.obs ?? ''} ${p.garcom ?? ''} ${p.pronto_por ?? ''} ${p.adicionais.join(' ')}`).includes(termo))
    .sort((a, b) => String(b.pronto_em ?? b.pedido_em).localeCompare(String(a.pronto_em ?? a.pedido_em)));
  const nFeitos = (lista ?? []).filter((p) => p.pronto_em).length;
  const nSem = (lista ?? []).length - nFeitos;

  const cel: React.CSSProperties = { padding: '8px 10px', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: 15, verticalAlign: 'top' };
  const hms = (iso: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: FUSO }) : '—');
  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <History size={20} />
        <span style={{ fontSize: 18, fontWeight: 800 }}>Histórico · {S.nome}</span>
        <input type="date" value={noite} onChange={(e) => setNoite(e.target.value)} aria-label="Noite"
          style={{ background: '#151a22', color: '#ece6da', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, padding: '6px 10px', fontSize: 16 }} />
        <Segmented<'feitos' | 'sem' | 'todos'> rotulo="Mostrar" valor={filtro} onMudar={setFiltro}
          opcoes={[{ valor: 'feitos', rotulo: `Encerrados (${nFeitos})` }, { valor: 'sem', rotulo: `Sem ${S.feito.toLowerCase()} (${nSem})` }, { valor: 'todos', rotulo: 'Todos' }]} />
        <label className="flex items-center gap-2 px-3" style={{ background: '#151a22', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8, height: 38 }}>
          <Search size={16} style={{ opacity: 0.7 }} />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Mesa, prato ou garçom" aria-label="Buscar"
            style={{ background: 'transparent', color: '#ece6da', outline: 'none', fontSize: 16, width: 200 }} />
        </label>
        {carregando && <span style={{ opacity: 0.6 }}>carregando…</span>}
      </div>
      {!lista || linhas.length === 0 ? (
        <p style={{ opacity: 0.7, fontSize: 16 }}>{carregando ? '' : 'Nada encontrado nesta noite.'}</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="w-full" style={{ borderCollapse: 'collapse', minWidth: 900 }}>
            <thead><tr style={{ textAlign: 'left', opacity: 0.65 }}>
              <th style={cel}>Saiu</th><th style={cel}>Item</th><th style={cel}>Mesa / obs.</th><th style={cel}>Garçom</th>
              <th style={cel}>Entrou (ZIG)</th><th style={cel}>No KDS</th><th style={cel}>Tempo</th><th style={cel}>Marcou</th>
            </tr></thead>
            <tbody>
              {linhas.map((p) => {
                const min = p.pronto_em ? (new Date(p.pronto_em).getTime() - new Date(p.pedido_em).getTime()) / 60000 : null;
                const pt = PONTOS.find((x) => x.id === pontoFinal(p));
                return (
                  <tr key={p.id} style={{ opacity: p.cancelado ? 0.5 : 1 }}>
                    <td style={{ ...cel, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{p.pronto_em ? hms(p.pronto_em) : <span style={{ opacity: 0.6 }}>—</span>}</td>
                    <td style={cel}>
                      <div style={{ fontWeight: 700 }}>
                        {qtd(p.qtd)}× {p.parte === 'acomp' ? 'Acompanhamento · ' : ''}{setor === 'parrilla' ? <><EtiquetaTipo p={p} />{nomeCarne(p.produto)}</> : p.produto}
                        {p.cancelado && <span style={{ marginLeft: 6, fontSize: 12, color: COR.vermelho.texto }}>cancelado</span>}
                      </div>
                      {p.adicionais.length > 0 && <div style={{ fontSize: 13, opacity: 0.8 }}>+ {p.adicionais.join(' · ')}</div>}
                      {pt && <div style={{ fontSize: 13, opacity: 0.8 }}>Ponto: {pt.nome}{p.ponto_manual ? ' (marcado no tablet)' : ''}</div>}
                    </td>
                    <td style={cel}>{p.obs ?? '—'}</td>
                    <td style={cel}>{p.garcom ?? 'Balcão'}</td>
                    <td style={{ ...cel, fontVariantNumeric: 'tabular-nums' }}>{hms(p.pedido_em)}</td>
                    <td style={{ ...cel, fontVariantNumeric: 'tabular-nums' }}>{hms(p.visto_em)}</td>
                    <td style={{ ...cel, fontWeight: 800, color: min === null ? undefined : corDe(min, setor).texto }}>{min === null ? '—' : `${Math.round(min)} min`}</td>
                    <td style={cel}>{p.pronto_por ?? '—'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <div className="mt-6"><Button tamanho="sm" onClick={() => setNoite(noiteAtual ?? noite)}>Voltar para a noite de hoje</Button></div>
    </div>
  );
};

export default Kds;
