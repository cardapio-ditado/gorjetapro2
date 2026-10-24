import React, { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { History, Maximize2, Move, Pause, Play, RefreshCw, RotateCw, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { Badge, BlocoSeguro, Button, EmptyState, IconButton, PageHeader, Segmented } from '../components/ui';
import { brl } from '../components/livro/shared';
import { distribuir } from '../components/casa/distribuir';
import { pt } from '../components/casa/planta';
import { useCasa, usePracas } from '../components/casa/useCasa';
import type { ClienteCasa, GarcomCasa, StatusCliente } from '../components/casa/tipos';

const Cena = lazy(() => import('../components/casa/Cena'));

/**
 * A Casa ao Vivo: a noite como um jogo. Cada cliente da ZIG senta na praça do
 * garçom que mais o atendeu; clicando, aparece o que consumiu. De dia, com a
 * casa vazia, dá para reconstituir a noite de ontem numa linha do tempo.
 */

const FUSO = 'America/Cuiaba';
const hhmm = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO }) : '—';
const minutosDesde = (iso: string | null | undefined, agora: number) =>
  iso ? Math.max(0, Math.round((agora - new Date(iso).getTime()) / 60000)) : null;
const duracao = (min: number | null) =>
  min === null ? '—' : min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}`;
const horaCuiaba = (d: Date) => {
  const [h, mi] = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: FUSO, hour12: false }).split(':').map(Number);
  return h + mi / 60;
};

const STATUS: Record<StatusCliente, { nome: string; variante: 'success' | 'warning' | 'neutral' }> = {
  consumindo: { nome: 'Pedindo', variante: 'success' },
  parado: { nome: 'Parado 30+ min', variante: 'warning' },
  saiu: { nome: 'Já foi', variante: 'neutral' },
  sem_consumo: { nome: 'Só entrou', variante: 'neutral' },
};

/** Linha do tempo da reconstituição: das 17h às 4h da manhã, de 15 em 15 minutos. */
const INICIO_MIN = 17 * 60;
const PASSOS = 44;
const rotuloPasso = (i: number) => {
  const t = (INICIO_MIN + i * 15) % (24 * 60);
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
};

/** A noite de ontem (data de Cuiabá) num passo da linha do tempo, em ISO. */
function momentoDe(i: number) {
  const hoje = new Date(Date.now() - 4 * 3600 * 1000); // Cuiabá
  const ontem = new Date(Date.UTC(hoje.getUTCFullYear(), hoje.getUTCMonth(), hoje.getUTCDate() - 1));
  const minutos = INICIO_MIN + i * 15;
  // 17:00 de ontem em Cuiabá = 21:00 UTC.
  return new Date(ontem.getTime() + (minutos + 4 * 60) * 60000).toISOString();
}

type Modo = 'vivo' | 'ontem';

const CasaAoVivo: React.FC = () => {
  const { usuario } = useAuth();
  const [modo, setModo] = useState<Modo>('vivo');
  const [passo, setPasso] = useState(20); // 22:00
  const [tocando, setTocando] = useState(false);
  const momento = modo === 'ontem' ? momentoDe(passo) : null;
  const { casa, erro, carregando, buscar } = useCasa(momento);
  const { pracas, mover } = usePracas(usuario?.nome_completo ?? null);
  const [sel, setSel] = useState<{ tipo: 'cliente' | 'garcom'; id: string } | null>(null);
  const [moverPraca, setMoverPraca] = useState<string | null>(null);
  const [girar, setGirar] = useState(false);
  const [agora, setAgora] = useState(Date.now());
  const caixa = useRef<HTMLDivElement>(null);

  useEffect(() => { const t = setInterval(() => setAgora(Date.now()), 30_000); return () => clearInterval(t); }, []);

  // Linha do tempo tocando: avança 15 minutos a cada 3 segundos.
  useEffect(() => {
    if (!tocando) return;
    const t = setInterval(() => setPasso((p) => { if (p >= PASSOS) { setTocando(false); return p; } return p + 1; }), 3000);
    return () => clearInterval(t);
  }, [tocando]);

  const dist = useMemo(() => (casa ? distribuir(casa, pracas) : null), [casa, pracas]);
  const referencia = casa?.momento ? new Date(casa.momento).getTime() : agora;
  const hora = casa?.momento ? horaCuiaba(new Date(casa.momento)) : horaCuiaba(new Date(agora));

  const cliente = sel?.tipo === 'cliente' ? casa?.clientes.find((c) => c.id === sel.id) ?? null : null;
  const garcom = sel?.tipo === 'garcom' ? casa?.garcons.find((g) => g.nome === sel.id) ?? null : null;
  const vazia = !!casa && casa.resumo.na_casa === 0 && casa.resumo.sem_consumo === 0;
  // Reconstituição só faz sentido de dia (a noite de ontem já fechou).
  const podeOntem = horaCuiaba(new Date(agora)) >= 6 && horaCuiaba(new Date(agora)) < 20;

  const telaCheia = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void caixa.current?.requestFullscreen?.();
  };

  const tocarNoChao = async (x: number, z: number) => {
    if (!moverPraca) return;
    await mover(moverPraca, pt(x, z));
    setMoverPraca(null);
  };

  const r = casa?.resumo;

  return (
    <div className="max-w-[1500px] mx-auto">
      <PageHeader caminho={['Operação', 'A Casa ao Vivo']} title="A Casa ao Vivo"
        subtitle="Cada cliente sentado na praça do garçom que o atende. Toque num cliente para ver o que consumiu."
        actions={<div className="flex items-center gap-2">
          {podeOntem && <Segmented<Modo> rotulo="Modo" valor={modo} onMudar={(v) => { setModo(v); setSel(null); setTocando(false); }}
            opcoes={[{ valor: 'vivo', rotulo: 'Ao vivo' }, { valor: 'ontem', rotulo: 'Ontem' }]} />}
          <IconButton aria-label="Atualizar" onClick={() => buscar()} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton>
        </div>} />

      {/* números da noite */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        {r ? <>
          <Badge variant="success">{r.na_casa} na casa</Badge>
          <Badge variant="success">{r.consumindo} pedindo</Badge>
          <Badge variant="warning">{r.parados} parados 30+ min</Badge>
          <Badge variant="neutral">{r.sairam} já foram</Badge>
          <Badge variant="neutral">{r.sem_consumo} só entraram</Badge>
          <Badge variant="info">consumo {brl(r.consumo)}{r.couvert ? ` + couvert ${brl(r.couvert)}` : ''}</Badge>
          <span className="t-caption">{casa?.momento ? `Ontem às ${hhmm(casa.momento)} · reconstituição aproximada` : `Lido às ${hhmm(casa?.lido_em)} · atualiza a cada minuto`}</span>
        </> : <span className="t-caption">{carregando ? 'Lendo a ZIG…' : ''}</span>}
        {erro && <span className="t-caption" style={{ color: 'var(--warning)' }}>{erro}</span>}
      </div>

      {modo === 'ontem' && (
        <div className="flex flex-wrap items-center gap-3 mb-3 p-3" style={{ border: '1px solid var(--border-subtle)', borderRadius: 12 }}>
          <IconButton aria-label={tocando ? 'Pausar' : 'Tocar a noite'} onClick={() => { if (passo >= PASSOS) setPasso(0); setTocando((t) => !t); }}>
            {tocando ? <Pause size={16} /> : <Play size={16} />}
          </IconButton>
          <span className="t-body" style={{ fontWeight: 700, minWidth: 48 }}>{rotuloPasso(passo)}</span>
          <input type="range" min={0} max={PASSOS} value={passo} onChange={(e) => { setTocando(false); setPasso(Number(e.target.value)); }}
            aria-label="Hora da noite de ontem" style={{ flex: 1, minWidth: 180 }} />
          <span className="t-caption">17:00 → 04:00 · quem não pede há mais de 1 h conta como já tendo ido</span>
        </div>
      )}

      <div ref={caixa} className="relative" style={{ height: 'min(78vh, 900px)', minHeight: 460, borderRadius: 16, overflow: 'hidden', border: '1px solid var(--border-subtle)', background: '#0d1117' }}>
        {casa && dist ? (
          <BlocoSeguro nome="A maquete">
            <Suspense fallback={<p className="t-caption p-4">Montando a casa…</p>}>
              <Cena key={modo} clientes={casa.clientes} dist={dist} garcons={casa.garcons} selecionado={sel}
                onCliente={(id) => { setMoverPraca(null); setSel({ tipo: 'cliente', id }); }}
                onGarcom={(nome) => { if (moverPraca) return; setSel({ tipo: 'garcom', id: nome }); }}
                onChao={tocarNoChao} moverPraca={moverPraca} girar={girar} hora={hora} />
            </Suspense>
          </BlocoSeguro>
        ) : (
          <div className="h-full flex items-center justify-center"><p className="t-caption">{carregando ? 'Lendo a ZIG…' : 'Sem leitura da ZIG agora.'}</p></div>
        )}

        {/* botões da maquete */}
        <div className="absolute top-3 left-3 flex gap-2" style={{ zIndex: 40 }}>
          <IconButton aria-label="Tela cheia (TV)" onClick={telaCheia}><Maximize2 size={16} /></IconButton>
          <IconButton aria-label={girar ? 'Parar de girar' : 'Girar sozinho'} onClick={() => setGirar((g) => !g)}><RotateCw size={16} /></IconButton>
        </div>

        {/* legenda */}
        <div className="absolute bottom-3 left-3 t-caption" style={{ zIndex: 40, background: 'rgba(13,17,23,0.78)', color: '#e8e2d6', padding: '8px 12px', borderRadius: 10, lineHeight: 1.7 }}>
          <div><span style={{ color: '#34d17a' }}>◆</span> pedindo · <span style={{ color: '#f2b33d' }}>◆</span> parado 30+ min · 👑 quem mais gastou</div>
          <div>🎂 aniversário · 🥃 clube do whisky · 🎁 prêmio na fidelidade a entregar</div>
          <div>De preto: os garçons, com quantos clientes têm na praça</div>
        </div>

        {moverPraca && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 t-body" style={{ zIndex: 40, background: '#2b7bb9', color: '#fff', padding: '8px 14px', borderRadius: 10 }}>
            Toque no chão onde fica a praça de {moverPraca.split(' ')[0]}.{' '}
            <button type="button" className="underline" onClick={() => setMoverPraca(null)}>Cancelar</button>
          </div>
        )}

        {vazia && modo === 'vivo' && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none" style={{ zIndex: 40 }}>
            <div className="pointer-events-auto" style={{ background: 'rgba(13,17,23,0.85)', borderRadius: 14, padding: 18, maxWidth: 380, color: '#eee' }}>
              <EmptyState icon={History} title="A casa está vazia agora" description="Assim que a ZIG registrar os primeiros clientes, eles aparecem aqui." compact />
              {podeOntem && <div className="flex justify-center"><Button tamanho="sm" variante="primario" icone={<History size={14} />} onClick={() => { setModo('ontem'); setPasso(20); }}>Ver a noite de ontem</Button></div>}
            </div>
          </div>
        )}

        {/* painel do que foi tocado */}
        {(cliente || garcom) && (
          <div className="absolute top-3 right-3 bottom-3 overflow-auto" style={{ zIndex: 50, width: 'min(360px, calc(100% - 24px))', background: 'var(--surface, #161b22)', border: '1px solid var(--border-subtle)', borderRadius: 14, padding: 16 }}>
            <div className="flex justify-end -mt-1 -mr-1"><IconButton aria-label="Fechar" onClick={() => setSel(null)}><X size={16} /></IconButton></div>
            {cliente && <PainelCliente c={cliente} agora={referencia} onGarcom={(g) => setSel({ tipo: 'garcom', id: g })} />}
            {garcom && <PainelGarcom g={garcom} clientes={(casa?.clientes ?? []).filter((c) => c.garcom === garcom.nome && (c.status === 'consumindo' || c.status === 'parado'))}
              agora={referencia} onCliente={(id) => setSel({ tipo: 'cliente', id })}
              onMover={() => { setMoverPraca(garcom.nome); setSel(null); }} podeMover={modo === 'vivo'} />}
          </div>
        )}
      </div>

      {/* as praças da noite */}
      {casa && casa.garcons.length > 0 && (
        <div className="mt-4 grid gap-2" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))' }}>
          {casa.garcons.map((g) => {
            const parado = minutosDesde(g.ultimo, referencia);
            return (
              <button key={g.nome} type="button" onClick={() => setSel({ tipo: 'garcom', id: g.nome })} className="text-left p-3 focus-ring"
                style={{ border: '1px solid var(--border-subtle)', borderRadius: 12, background: sel?.id === g.nome ? 'rgba(255,255,255,0.05)' : 'transparent' }}>
                <div className="flex justify-between gap-2"><span className="t-body" style={{ fontWeight: 700 }}>{g.nome.split(' ')[0]}</span><span className="t-body" style={{ color: 'var(--gold-light)', fontWeight: 700 }}>{brl(g.consumo)}</span></div>
                <div className="t-caption">{g.clientes} na praça · {g.pedidos} pedidos · último lançamento {parado === null ? '—' : `há ${duracao(parado)}`}</div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

const Linha: React.FC<{ r: string; v: React.ReactNode }> = ({ r, v }) => (
  <div className="flex justify-between gap-3 py-1" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
    <span className="t-caption">{r}</span><span className="t-body" style={{ textAlign: 'right' }}>{v}</span>
  </div>
);

const PainelCliente: React.FC<{ c: ClienteCasa; agora: number; onGarcom: (g: string) => void }> = ({ c, agora, onGarcom }) => {
  const marcas = [c.aniversario && '🎂 Aniversário nesta semana', c.clube && '🥃 Clube do Whisky', c.premio && '🎁 Tem prêmio na fidelidade',
    c.visitas ? `⭐ ${c.visitas} visita${c.visitas === 1 ? '' : 's'}${c.nivel ? ` · ${c.nivel}` : ''}` : null].filter(Boolean) as string[];
  return (
    <div>
      <h3 className="t-subsec" style={{ margin: 0 }}>{c.nome}</h3>
      <div className="flex flex-wrap gap-2 my-2"><Badge variant={STATUS[c.status].variante}>{STATUS[c.status].nome}</Badge></div>
      {marcas.length > 0 && <div className="t-caption mb-2" style={{ lineHeight: 1.7 }}>{marcas.map((m) => <div key={m}>{m}</div>)}</div>}
      <Linha r="Consumo" v={<strong style={{ color: 'var(--gold-light)' }}>{brl(c.consumo)}</strong>} />
      {c.couvert > 0 && <Linha r="Couvert" v={brl(c.couvert)} />}
      <Linha r="Chegou" v={`${hhmm(c.chegou)} · ${duracao(minutosDesde(c.chegou, agora))} na casa`} />
      <Linha r="Último pedido" v={c.ultimo ? `${hhmm(c.ultimo)} · há ${duracao(minutosDesde(c.ultimo, agora))}` : '—'} />
      <Linha r="Garçom" v={c.garcons.length ? c.garcons.map((g, i) => (
        <button key={g} type="button" className="underline" onClick={() => onGarcom(g)}>{g.split(' ')[0]}{i < c.garcons.length - 1 ? ', ' : ''}</button>
      )) : 'comprou no balcão'} />
      <h4 className="t-body mt-3 mb-1" style={{ fontWeight: 700 }}>O que consumiu</h4>
      {c.itens.length === 0 ? <p className="t-caption">Nada no cartão dele ainda.</p> : c.itens.map((i, k) => (
        <div key={k} className="flex justify-between gap-2 t-caption py-0.5">
          <span>{hhmm(i.h)} · {i.q}× {i.p}{i.garcom ? ` · ${i.garcom.split(' ')[0]}` : ''}</span><span>{brl(i.v)}</span>
        </div>
      ))}
    </div>
  );
};

const PainelGarcom: React.FC<{ g: GarcomCasa; clientes: ClienteCasa[]; agora: number; podeMover: boolean; onCliente: (id: string) => void; onMover: () => void }> = ({ g, clientes, agora, podeMover, onCliente, onMover }) => {
  const parado = minutosDesde(g.ultimo, agora);
  return (
    <div>
      <h3 className="t-subsec" style={{ margin: 0 }}>{g.nome}</h3>
      <div className="flex flex-wrap gap-2 my-2">
        <Badge variant={parado !== null && parado > 20 ? 'warning' : 'success'}>último lançamento {parado === null ? '—' : `há ${duracao(parado)}`}</Badge>
      </div>
      <Linha r="Clientes na praça" v={g.clientes} />
      <Linha r="Vendeu na noite" v={<strong style={{ color: 'var(--gold-light)' }}>{brl(g.consumo)}</strong>} />
      <Linha r="Pedidos" v={g.pedidos} />
      {podeMover && <div className="mt-3"><Button tamanho="sm" icone={<Move size={14} />} onClick={onMover}>Mover a praça na maquete</Button></div>}
      <h4 className="t-body mt-3 mb-1" style={{ fontWeight: 700 }}>Clientes da praça</h4>
      {clientes.length === 0 ? <p className="t-caption">Nenhum cliente na praça agora.</p>
        : clientes.slice().sort((a, b) => b.consumo - a.consumo).map((c) => (
          <button key={c.id} type="button" onClick={() => onCliente(c.id)} className="w-full flex justify-between gap-2 t-caption py-1 text-left hover:underline">
            <span>{c.status === 'parado' ? '🟡' : '🟢'} {c.nome}</span><span>{brl(c.consumo)}</span>
          </button>
        ))}
    </div>
  );
};

export default CasaAoVivo;
