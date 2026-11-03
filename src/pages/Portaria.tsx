import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import jsQR from 'jsqr';
import { Camera, CheckCircle2, XCircle, AlertTriangle, Keyboard, ScanLine } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { Button, Input } from '../components/ui';

/**
 * Portaria dos eventos: lê o QR code do ingresso com a câmera do celular e
 * registra a entrada (fn_ingresso_validar). O mesmo ingresso não entra duas
 * vezes. Também abre direto pelo link do QR (/ingresso/CODIGO), quando lido
 * pela câmera do próprio celular. Tela cheia, botões grandes.
 */

interface Resultado {
  status: 'ok' | 'ja_usado' | 'cancelado' | 'outra_data' | 'invalido';
  numero?: number; evento?: string; data_evento?: string;
  usado_em?: string; usado_por?: string; entradas?: number; emitidos?: number;
  codigo: string;
}

const VISUAL: Record<Resultado['status'], { titulo: string; cor: string; fundo: string; icone: typeof CheckCircle2 }> = {
  ok:         { titulo: 'Pode entrar',        cor: '#4ade80', fundo: 'rgba(22,163,74,0.18)',  icone: CheckCircle2 },
  ja_usado:   { titulo: 'Ingresso já usado',  cor: '#f87171', fundo: 'rgba(220,38,38,0.18)',  icone: XCircle },
  cancelado:  { titulo: 'Ingresso cancelado', cor: '#f87171', fundo: 'rgba(220,38,38,0.18)',  icone: XCircle },
  invalido:   { titulo: 'Ingresso inválido',  cor: '#f87171', fundo: 'rgba(220,38,38,0.18)',  icone: XCircle },
  outra_data: { titulo: 'Evento de outra data', cor: '#fbbf24', fundo: 'rgba(217,119,6,0.18)', icone: AlertTriangle },
};

const dataBr = (iso?: string) => (iso ? iso.split('-').reverse().join('/') : '');
const horaBr = (ts?: string) => (ts ? new Date(ts).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

function sinal(ok: boolean) {
  try { navigator.vibrate?.(ok ? 120 : [80, 60, 80, 60, 200]); } catch { /* sem vibração */ }
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.frequency.value = ok ? 880 : 220; o.connect(g); g.connect(ctx.destination);
    g.gain.value = 0.15; o.start(); o.stop(ctx.currentTime + (ok ? 0.15 : 0.45));
  } catch { /* sem som */ }
}

export default function Portaria() {
  const { codigo: codigoUrl } = useParams();
  const navigate = useNavigate();
  const video = useRef<HTMLVideoElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const lendo = useRef(false);
  const [camera, setCamera] = useState<'desligada' | 'ligando' | 'ligada' | 'erro'>('desligada');
  const [erroCamera, setErroCamera] = useState('');
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [conferindo, setConferindo] = useState(false);
  const [digitar, setDigitar] = useState(false);
  const [codigoDigitado, setCodigoDigitado] = useState('');
  const [erro, setErro] = useState('');

  const conferir = useCallback(async (texto: string, forcar = false) => {
    const codigo = texto.trim().replace(/^.*\//, '').toUpperCase();
    if (!codigo) return;
    lendo.current = false;
    setConferindo(true); setErro('');
    const { data, error } = await supabase.rpc('fn_ingresso_validar', { p_codigo: codigo, p_forcar: forcar });
    setConferindo(false);
    if (error) { setErro(error.message); return; }
    const r = { ...(data as any), codigo } as Resultado;
    setResultado(r);
    sinal(r.status === 'ok');
  }, []);

  // aberto pelo link do QR
  useEffect(() => { if (codigoUrl) conferir(codigoUrl); }, [codigoUrl, conferir]);

  const pararCamera = () => {
    const s = video.current?.srcObject as MediaStream | null;
    s?.getTracks().forEach(t => t.stop());
    if (video.current) video.current.srcObject = null;
    lendo.current = false;
  };
  useEffect(() => pararCamera, []);

  const ligarCamera = async () => {
    setCamera('ligando'); setErroCamera('');
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment', width: { ideal: 1280 } }, audio: false });
      const v = video.current!;
      v.srcObject = s; await v.play();
      setCamera('ligada');
      lendo.current = true;
      ler();
    } catch (e: any) {
      setCamera('erro');
      setErroCamera(e?.name === 'NotAllowedError'
        ? 'A câmera foi bloqueada. Libere o acesso à câmera para este site nas configurações do navegador.'
        : 'Não consegui abrir a câmera. Use a digitação do código.');
    }
  };

  const ler = () => {
    const passo = () => {
      if (!lendo.current) return;
      const v = video.current, c = canvas.current;
      if (v && c && v.readyState >= 2 && v.videoWidth) {
        const escala = Math.min(1, 720 / v.videoWidth);
        c.width = Math.round(v.videoWidth * escala); c.height = Math.round(v.videoHeight * escala);
        const ctx = c.getContext('2d', { willReadFrequently: true })!;
        ctx.drawImage(v, 0, 0, c.width, c.height);
        const img = ctx.getImageData(0, 0, c.width, c.height);
        const qr = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
        if (qr?.data) { conferir(qr.data); return; }
      }
      setTimeout(() => requestAnimationFrame(passo), 120);
    };
    requestAnimationFrame(passo);
  };

  const proximo = () => {
    setResultado(null); setErro('');
    if (codigoUrl) navigate('/portaria', { replace: true });
    if (camera === 'ligada') { lendo.current = true; ler(); }
  };

  // entrada liberada: volta a ler sozinho
  useEffect(() => {
    if (resultado?.status !== 'ok' || camera !== 'ligada') return;
    const t = setTimeout(proximo, 2200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultado, camera]);

  const v = resultado ? VISUAL[resultado.status] : null;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--bg-base, #0b0e14)', color: 'var(--text-primary, #fff)' }}>
      <header className="flex items-center gap-3 px-4 py-3" style={{ borderBottom: '1px solid var(--border, rgba(255,255,255,0.08))' }}>
        <ScanLine size={20} />
        <h1 className="t-subsec m-0 flex-1">Portaria · ingressos</h1>
        {resultado?.emitidos != null && (
          <span className="t-body tabular-nums"><strong>{resultado.entradas}</strong> / {resultado.emitidos} entraram</span>
        )}
      </header>

      <main className="flex-1 flex flex-col items-center gap-4 p-4 w-full max-w-md mx-auto">
        {/* câmera */}
        <div className="relative w-full aspect-square rounded-2xl overflow-hidden" style={{ background: '#000', display: resultado ? 'none' : 'block' }}>
          <video ref={video} playsInline muted className="w-full h-full object-cover" />
          <canvas ref={canvas} className="hidden" />
          {camera === 'ligada' && (
            <div className="absolute inset-[18%] rounded-xl pointer-events-none" style={{ border: '3px solid rgba(255,255,255,0.8)', boxShadow: '0 0 0 9999px rgba(0,0,0,0.35)' }} />
          )}
          {camera !== 'ligada' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center">
              <Camera size={40} style={{ color: 'rgba(255,255,255,0.6)' }} />
              {camera === 'erro' && <p className="t-body m-0" style={{ color: '#fbbf24' }}>{erroCamera}</p>}
              <Button variante="primario" tamanho="toque" carregando={camera === 'ligando'} onClick={ligarCamera}>Ligar câmera</Button>
            </div>
          )}
          {conferindo && <div className="absolute inset-0 flex items-center justify-center t-body" style={{ background: 'rgba(0,0,0,0.6)' }}>Conferindo…</div>}
        </div>

        {/* resultado */}
        {resultado && v && (
          <div className="w-full rounded-2xl p-6 flex flex-col items-center gap-3 text-center" style={{ background: v.fundo, border: `2px solid ${v.cor}` }} role="status">
            <v.icone size={72} style={{ color: v.cor }} />
            <p className="m-0" style={{ fontSize: 28, fontWeight: 800, color: v.cor }}>{v.titulo}</p>
            {resultado.numero != null && <p className="m-0" style={{ fontSize: 22, fontWeight: 700 }}>Ingresso nº {String(resultado.numero).padStart(3, '0')}</p>}
            {resultado.evento && <p className="t-body m-0">{resultado.evento} · {dataBr(resultado.data_evento)}</p>}
            {resultado.status === 'ja_usado' && (
              <p className="t-body m-0">Entrou às <strong>{horaBr(resultado.usado_em)}</strong>{resultado.usado_por ? ` (conferido por ${resultado.usado_por})` : ''}.</p>
            )}
            {resultado.status === 'invalido' && <p className="t-body m-0">Este código não é de nenhum ingresso impresso pelo sistema.</p>}
            {resultado.status === 'outra_data' && (
              <Button variante="secundario" tamanho="toque" onClick={() => conferir(resultado.codigo, true)}>Liberar mesmo assim</Button>
            )}
            <Button variante="primario" tamanho="toque" onClick={proximo}>Ler próximo</Button>
          </div>
        )}

        {erro && <p className="aviso aviso-perigo w-full m-0" role="alert">{erro}</p>}

        {/* digitar */}
        {!resultado && (
          digitar ? (
            <form className="w-full flex gap-2 items-end" onSubmit={e => { e.preventDefault(); conferir(codigoDigitado); setCodigoDigitado(''); }}>
              <Input className="flex-1" rotulo="Código embaixo do QR" autoFocus autoCapitalize="characters" value={codigoDigitado}
                onChange={e => setCodigoDigitado(e.target.value)} placeholder="ex.: 47525983B6A0" />
              <Button type="submit" variante="primario" carregando={conferindo}>Conferir</Button>
            </form>
          ) : (
            <Button variante="discreto" icone={<Keyboard size={16} />} onClick={() => setDigitar(true)}>Digitar o código</Button>
          )
        )}
      </main>
    </div>
  );
}
