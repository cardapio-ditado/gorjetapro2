import React, { useEffect, useRef, useState } from 'react';
import { Eraser, PenLine, Type } from 'lucide-react';

/**
 * Campo de assinatura (bar e cliente): escolher um modelo com o nome em letra
 * cursiva ou desenhar com o dedo/mouse. Devolve um PNG (data URL, fundo
 * transparente) ou null enquanto não há assinatura.
 */

const FONTES = ['Dancing Script', 'Great Vibes', 'Caveat', 'Allura'];
const CSS_FONTES = 'https://fonts.googleapis.com/css2?family=Allura&family=Caveat&family=Dancing+Script&family=Great+Vibes&display=swap';
const W = 600, H = 180, TINTA = '#1b1f4a';

let fontesProntas: Promise<void> | null = null;
function carregarFontes() {
  if (!fontesProntas) {
    if (!document.querySelector(`link[href="${CSS_FONTES}"]`)) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = CSS_FONTES;
      document.head.appendChild(l);
    }
    fontesProntas = Promise.all(FONTES.map(f => document.fonts.load(`64px "${f}"`))).then(() => undefined).catch(() => undefined);
  }
  return fontesProntas;
}

function nomeEmPng(nome: string, fonte: string) {
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d')!;
  let tam = 96;
  do { ctx.font = `${tam}px "${fonte}"`; tam -= 4; } while (tam > 24 && ctx.measureText(nome).width > W - 40);
  ctx.fillStyle = TINTA; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(nome, W / 2, H / 2);
  return c.toDataURL('image/png');
}

const CampoAssinatura: React.FC<{ nome: string; onChange: (png: string | null) => void; escuro?: boolean }> = ({ nome, onChange, escuro }) => {
  const [modo, setModo] = useState<'digitar' | 'desenhar'>('digitar');
  const [modelos, setModelos] = useState<string[]>([]);
  const [escolhido, setEscolhido] = useState<number | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const traco = useRef<{ desenhando: boolean; temTraco: boolean }>({ desenhando: false, temTraco: false });
  const nomeLimpo = nome.trim().replace(/\s+/g, ' ');

  useEffect(() => {
    if (modo !== 'digitar') return;
    let vivo = true;
    setEscolhido(null); onChange(null);
    if (!nomeLimpo) { setModelos([]); return; }
    void carregarFontes().then(() => { if (vivo) setModelos(FONTES.map(f => nomeEmPng(nomeLimpo, f))); });
    return () => { vivo = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nomeLimpo, modo]);

  const trocarModo = (m: typeof modo) => { setModo(m); setEscolhido(null); traco.current.temTraco = false; onChange(null); };

  const ponto = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H] as const;
  };
  const inicio = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = e.currentTarget.getContext('2d')!;
    e.currentTarget.setPointerCapture(e.pointerId);
    const [x, y] = ponto(e);
    ctx.strokeStyle = TINTA; ctx.lineWidth = 3.2; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.beginPath(); ctx.moveTo(x, y);
    traco.current.desenhando = true;
  };
  const mover = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!traco.current.desenhando) return;
    const ctx = e.currentTarget.getContext('2d')!;
    const [x, y] = ponto(e);
    ctx.lineTo(x, y); ctx.stroke();
    traco.current.temTraco = true;
  };
  const fim = () => {
    if (!traco.current.desenhando) return;
    traco.current.desenhando = false;
    if (traco.current.temTraco && canvas.current) onChange(canvas.current.toDataURL('image/png'));
  };
  const limpar = () => {
    canvas.current?.getContext('2d')?.clearRect(0, 0, W, H);
    traco.current.temTraco = false; onChange(null);
  };

  const aba = (ativo: boolean) => `flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium ${
    ativo ? (escuro ? 'bg-white/15 text-white' : 'bg-white text-[#1d1b18] shadow-sm') : (escuro ? 'text-white/60 hover:bg-white/5' : 'text-[#6b645a] hover:bg-white/60')}`;
  const dica = escuro ? 'text-white/50' : 'text-[#6b645a]';

  return (
    <div className="space-y-3">
      <div className={`flex gap-1 p-1 rounded-xl ${escuro ? 'bg-white/5' : 'bg-[#ebe5da]'}`}>
        <button type="button" className={aba(modo === 'digitar')} onClick={() => trocarModo('digitar')}><Type className="w-4 h-4" /> Escolher modelo</button>
        <button type="button" className={aba(modo === 'desenhar')} onClick={() => trocarModo('desenhar')}><PenLine className="w-4 h-4" /> Desenhar</button>
      </div>

      {modo === 'digitar' ? (
        !nomeLimpo ? <p className={`text-sm ${dica}`}>Escreva o nome para ver os modelos de assinatura.</p> : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {modelos.map((src, i) => (
              <button key={i} type="button" onClick={() => { setEscolhido(i); onChange(src); }} aria-pressed={escolhido === i}
                className={`rounded-xl bg-white border-2 p-1 transition-colors ${escolhido === i ? 'border-[#7a1f2b] ring-2 ring-[#7a1f2b]/20' : 'border-[#ddd5c8] hover:border-[#b9ad9b]'}`}>
                <img src={src} alt={`Modelo de assinatura ${i + 1}`} className="w-full h-auto" />
              </button>
            ))}
          </div>
        )
      ) : (
        <div className="space-y-2">
          <canvas ref={canvas} width={W} height={H} aria-label="Área para desenhar a assinatura"
            className="w-full h-auto rounded-xl bg-white border-2 border-dashed border-[#c9bfae] cursor-crosshair"
            style={{ touchAction: 'none' }}
            onPointerDown={inicio} onPointerMove={mover} onPointerUp={fim} onPointerCancel={fim} onPointerLeave={fim} />
          <div className="flex items-center justify-between">
            <p className={`text-xs ${dica}`}>Assine com o dedo ou o mouse dentro do quadro.</p>
            <button type="button" onClick={limpar} className={`inline-flex items-center gap-1 text-sm ${escuro ? 'text-white/70 hover:text-white' : 'text-[#7a1f2b] hover:underline'}`}><Eraser className="w-4 h-4" /> Limpar</button>
          </div>
        </div>
      )}
    </div>
  );
};

export default CampoAssinatura;
