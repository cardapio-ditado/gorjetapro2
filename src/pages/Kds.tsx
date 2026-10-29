import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeft, BarChart3, Beer, ChefHat, Check, Martini, Maximize2, RotateCcw } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { Button, IconButton, Segmented } from '../components/ui';

/**
 * KDS: a fila da noite no tablet de cada setor (/kds cozinha, /kds/bar,
 * /kds/drinks). Os pedidos vêm da ZIG (função kds-cozinha); o cronômetro corre
 * desde a hora do pedido e o cartão fica amarelo e depois vermelho, nos tempos
 * do setor. Um toque em "Pronto" tira o pedido da fila; um toque num item
 * marca só aquele item.
 */

const FUSO = 'America/Cuiaba';
const LER_MS = 15_000;

type Setor = 'cozinha' | 'bar' | 'drinks';
const SETORES: Record<Setor, { nome: string; caminho: string; Icone: React.ElementType; amarelo: number; vermelho: number; item: string; vazio: string }> = {
  cozinha: { nome: 'Cozinha', caminho: '/kds', Icone: ChefHat, amarelo: 15, vermelho: 20, item: 'prato', vazio: 'Os pedidos da cozinha aparecem aqui assim que o garçom lança na ZIG.' },
  bar: { nome: 'Bar', caminho: '/kds/bar', Icone: Beer, amarelo: 5, vermelho: 8, item: 'item', vazio: 'Chopp, cervejas, long neck, refrigerantes e águas aparecem aqui assim que o garçom lança na ZIG.' },
  drinks: { nome: 'Drinks', caminho: '/kds/drinks', Icone: Martini, amarelo: 8, vermelho: 12, item: 'drink', vazio: 'Drinks, caipirinhas, doses, combos e garrafas aparecem aqui assim que o garçom lança na ZIG.' },
};
const setorDoCaminho = (caminho: string): Setor => (caminho.startsWith('/kds/bar') ? 'bar' : caminho.startsWith('/kds/drinks') ? 'drinks' : 'cozinha');

interface Prato {
  id: number; transacao: string; produto: string; qtd: number; adicionais: string[];
  garcom: string | null; categoria: string | null; obs: string | null; pedido_em: string; pronto_em: string | null; pronto_por: string | null;
}
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

const Kds: React.FC = () => {
  const navigate = useNavigate();
  const setor = setorDoCaminho(useLocation().pathname);
  const S = SETORES[setor];
  const [aba, setAba] = useState<'fila' | 'relatorio'>('fila');
  const [fila, setFila] = useState<Fila | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [agora, setAgora] = useState(Date.now());
  const [iniciado, setIniciado] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  const vistos = useRef<Set<string> | null>(null);
  const trava = useRef<WakeLockSentinel | null>(null);
  const caixa = useRef<HTMLDivElement>(null);

  const buscar = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('kds-cozinha', { body: { acao: 'fila', setor } });
      if (error || !data?.ok) throw new Error(data?.error || 'sem resposta');
      const f = data as Fila;
      // Pedido novo na fila: bipa (menos na primeira leitura).
      const abertos = new Set(f.pratos.filter((p) => !p.pronto_em).map((p) => p.transacao));
      if (vistos.current && [...abertos].some((t) => !vistos.current!.has(t))) bipe(audio.current);
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
    void caixa.current?.requestFullscreen?.().catch(() => undefined);
    setIniciado(true);
  };

  const marcar = async (ids: number[], acao: 'pronto' | 'desfazer') => {
    // Some da fila na hora; a próxima leitura confirma.
    setFila((f) => f && {
      ...f,
      pratos: f.pratos.map((p) => (ids.includes(p.id) ? { ...p, pronto_em: acao === 'pronto' ? new Date().toISOString() : null } : p)),
    });
    const { data, error } = await supabase.functions.invoke('kds-cozinha', { body: { acao, ids } });
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
    <div ref={caixa} className="min-h-screen flex flex-col" style={{ background: '#0b0e13', color: '#ece6da' }}>
      {/* topo */}
      <div className="flex flex-wrap items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <IconButton aria-label="Voltar ao sistema" onClick={() => navigate('/')}><ArrowLeft size={18} /></IconButton>
        <S.Icone size={22} style={{ color: '#f5c451' }} />
        <Segmented<Setor> rotulo="Setor" valor={setor} onMudar={(s) => navigate(SETORES[s].caminho)}
          opcoes={(Object.keys(SETORES) as Setor[]).map((s) => ({ valor: s, rotulo: SETORES[s].nome }))} />
        <span style={{ fontSize: 26, fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{hhmm(new Date(agora).toISOString())}</span>
        <Segmented<'fila' | 'relatorio'> rotulo="Tela" valor={aba} onMudar={setAba}
          opcoes={[{ valor: 'fila', rotulo: `Fila (${pedidos.length})` }, { valor: 'relatorio', rotulo: 'Tempos' }]} />
        <div className="flex-1" />
        {r && (
          <span style={{ fontSize: 15, opacity: 0.85 }}>
            {r.feitos} prontos · média {r.media_min ?? '—'} min · {r.vermelhos} passaram de {S.vermelho} min
          </span>
        )}
        <span style={{ fontSize: 13, opacity: 0.6 }}>
          {lidoHa === null ? 'lendo a ZIG…' : `ZIG lida há ${lidoHa}s`}
          {r?.atraso_zig ? ` · a ZIG mostra o pedido em até ~${r.atraso_zig.ate_seg}s` : ''}
        </span>
        <IconButton aria-label="Tela cheia" onClick={() => (document.fullscreenElement ? void document.exitFullscreen() : void caixa.current?.requestFullscreen?.())}>
          <Maximize2 size={18} />
        </IconButton>
      </div>

      {(erro || fila?.erro) && (
        <div className="px-4 py-2" style={{ background: 'rgba(229,72,77,0.18)', color: '#ffb3b5', fontSize: 15 }}>{erro || fila?.erro}</div>
      )}

      {aba === 'fila' ? (
        <div className="flex-1 p-4">
          {pedidos.length === 0 ? (
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
                        <button key={p.id} type="button" onClick={() => marcar([p.id], 'pronto')} className="w-full text-left py-1.5"
                          style={{ borderTop: '1px solid rgba(255,255,255,0.08)' }} title={`Toque para marcar só este ${S.item}`}>
                          <div style={{ fontSize: 19, fontWeight: 700, lineHeight: 1.25 }}>
                            <span style={{ color: c.texto }}>{qtd(p.qtd)}×</span> {p.produto}
                          </div>
                          {p.adicionais.map((a, i) => (
                            <div key={i} style={{ fontSize: 16, opacity: 0.9, paddingLeft: 22 }}>+ {a}</div>
                          ))}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={() => marcar(ped.pratos.map((p) => p.id), 'pronto')}
                      className="flex items-center justify-center gap-2" style={{ minHeight: 56, background: c.borda, color: '#0b0e13', fontSize: 20, fontWeight: 800 }}>
                      <Check size={22} /> Pronto
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {prontos.length > 0 && (
            <div className="mt-6">
              <p style={{ fontSize: 14, opacity: 0.6, marginBottom: 6 }}>Prontos nos últimos 15 minutos (toque para voltar à fila)</p>
              <div className="flex flex-wrap gap-2">
                {prontos.map((p) => (
                  <button key={p.id} type="button" onClick={() => marcar([p.id], 'desfazer')} className="flex items-center gap-2 px-3 py-2"
                    style={{ border: '1px solid rgba(255,255,255,0.15)', borderRadius: 10, fontSize: 15 }}>
                    <RotateCcw size={14} /> {qtd(p.qtd)}× {p.produto} · {Math.round((new Date(p.pronto_em!).getTime() - new Date(p.pedido_em).getTime()) / 60000)} min
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
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

interface Relat {
  noite: string; pratos: number; feitos: number; sem_pronto: number; media_min: number | null; mediana_min: number | null;
  amarelos: number; vermelhos: number; atraso_zig: { pratos: number; ate_seg: number; desde_seg: number } | null;
  por_produto: Array<{ produto: string; feitos: number; media_min: number | null; maior_min: number; acima_vermelho: number }>;
  por_hora: Array<{ hora: string; feitos: number; media_min: number | null }>;
  campos_zig: string[];
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
              ['Marcados prontos', dados.feitos],
              ['Tempo médio', dados.media_min === null ? '—' : `${dados.media_min} min`],
              ['Mediana', dados.mediana_min === null ? '—' : `${dados.mediana_min} min`],
              [`${S.amarelo}–${S.vermelho} min`, dados.amarelos],
              [`${S.vermelho}+ min`, dados.vermelhos],
              ['Sem "pronto"', dados.sem_pronto],
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

export default Kds;
