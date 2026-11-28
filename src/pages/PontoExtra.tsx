import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { AlertTriangle, Camera, CheckCircle2, LogOut, MapPin } from 'lucide-react';

/**
 * Ponto do extra (Kadu, 28/11/2026): página do link pessoal da noite (/ponto/<token>), enviado pelo gerente no WhatsApp.
 * O extra marca a chegada (selfie + GPS) e a saída (GPS). Tudo é conferido pela função do servidor "extra-ponto"
 * (distância do Ditado, precisão do GPS, prazo do link e celular). A página não lê tabela nenhuma.
 */
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

interface Estado {
  ok: boolean; erro?: string; nome?: string; funcao?: string; data?: string; valor?: number;
  entrada_em?: string | null; saida_em?: string | null; confirmada?: boolean; cancelada?: boolean; antes?: boolean; vencido?: boolean;
}

const brl = (v?: number) => (v ?? 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const horaDe = (s?: string | null) => (s ? new Date(s).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Cuiaba' }) : '');
const dataBr = (s?: string) => (s ? s.split('-').reverse().join('/') : '');

function dispositivo() {
  try {
    let id = localStorage.getItem('ditado_ponto_celular');
    if (!id) { id = crypto.randomUUID(); localStorage.setItem('ditado_ponto_celular', id); }
    return id;
  } catch { return 'sem-armazenamento'; }
}

async function chamar(corpo: Record<string, unknown>): Promise<Estado> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/extra-ponto`, {
    method: 'POST',
    headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(corpo),
  });
  return res.json().catch(() => ({ ok: false, erro: 'Sem resposta. Confira a internet e tente de novo.' }));
}

function localizar(): Promise<GeolocationPosition> {
  return new Promise((ok, falha) => {
    if (!navigator.geolocation) { falha(new Error('Este celular não informa a localização.')); return; }
    navigator.geolocation.getCurrentPosition(ok, e => falha(new Error(
      e.code === 1 ? 'Você não liberou a localização. Libere nas configurações do navegador e tente de novo.'
        : 'Não deu para pegar a localização. Ative o GPS e tente de novo.')),
      { enableHighAccuracy: true, timeout: 25000, maximumAge: 0 });
  });
}

/** Reduz a selfie para no máximo 720 px (JPEG), para enviar rápido no 4G. */
function reduzir(arquivo: File): Promise<string> {
  return new Promise((ok, falha) => {
    const img = new Image();
    const url = URL.createObjectURL(arquivo);
    img.onload = () => {
      const escala = Math.min(1, 720 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      ok(c.toDataURL('image/jpeg', 0.75));
    };
    img.onerror = () => { URL.revokeObjectURL(url); falha(new Error('Não deu para ler a foto. Tire outra.')); };
    img.src = url;
  });
}

export default function PontoExtra() {
  const { token = '' } = useParams();
  const [estado, setEstado] = useState<Estado | null>(null);
  const [selfie, setSelfie] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const foto = useRef<HTMLInputElement>(null);

  useEffect(() => { void chamar({ acao: 'abrir', token }).then(setEstado); }, [token]);

  const marcar = async (acao: 'entrada' | 'saida') => {
    setErro(null); setEnviando(true);
    try {
      if (acao === 'entrada' && !selfie) throw new Error('Tire a selfie primeiro.');
      const pos = await localizar();
      const r = await chamar({
        acao, token, lat: pos.coords.latitude, lng: pos.coords.longitude, precisao: pos.coords.accuracy,
        dispositivo: dispositivo(), selfie: acao === 'entrada' ? selfie : undefined,
      });
      if (!r.ok) setErro(r.erro || 'Não deu para marcar.');
      if (r.nome) setEstado(r);
    } catch (e) {
      setErro((e as Error).message);
    } finally { setEnviando(false); }
  };

  const escolherFoto = async (f?: File) => {
    if (!f) return;
    setErro(null);
    try { setSelfie(await reduzir(f)); } catch (e) { setErro((e as Error).message); }
  };

  const caixa = 'min-h-screen bg-stone-50 flex items-start justify-center px-4 py-8';
  if (!estado) return <div className={caixa}><p className="text-stone-500 mt-20">Abrindo…</p></div>;
  if (!estado.nome) {
    return (
      <div className={caixa}><div className="w-full max-w-sm bg-white rounded-2xl shadow p-6 text-center">
        <AlertTriangle className="mx-auto text-amber-600" size={40} />
        <p className="mt-3 font-semibold text-stone-800">{estado.erro || 'Link inválido.'}</p>
      </div></div>
    );
  }

  const fechado = estado.confirmada || estado.cancelada || estado.vencido || estado.antes;
  return (
    <div className={caixa}>
      <div className="w-full max-w-sm bg-white rounded-2xl shadow p-6">
        <p className="text-sm text-stone-500">Ditado Popular · ponto do extra</p>
        <h1 className="text-2xl font-bold text-stone-900 mt-1">Olá, {estado.nome}</h1>
        <p className="text-stone-700 mt-1">{estado.funcao} · {dataBr(estado.data)} · {brl(estado.valor)}</p>

        <div className="mt-5 space-y-2">
          <p className="flex items-center gap-2 text-stone-800"><CheckCircle2 size={18} className={estado.entrada_em ? 'text-emerald-600' : 'text-stone-300'} />
            Chegada {estado.entrada_em ? `às ${horaDe(estado.entrada_em)}` : 'não marcada'}</p>
          <p className="flex items-center gap-2 text-stone-800"><CheckCircle2 size={18} className={estado.saida_em ? 'text-emerald-600' : 'text-stone-300'} />
            Saída {estado.saida_em ? `às ${horaDe(estado.saida_em)}` : 'não marcada'}</p>
        </div>

        {erro && <div className="mt-4 rounded-xl bg-red-50 border border-red-200 text-red-800 p-3 text-sm flex gap-2"><AlertTriangle size={18} className="shrink-0" />{erro}</div>}

        {estado.confirmada && <p className="mt-5 rounded-xl bg-emerald-50 text-emerald-800 p-3">Sua diária foi confirmada pelo gerente. Obrigado!</p>}
        {estado.cancelada && <p className="mt-5 rounded-xl bg-stone-100 text-stone-700 p-3">Esta diária foi cancelada. Fale com o gerente.</p>}
        {estado.antes && <p className="mt-5 rounded-xl bg-stone-100 text-stone-700 p-3">O link abre às 6h do dia da diária.</p>}
        {estado.vencido && !estado.confirmada && <p className="mt-5 rounded-xl bg-amber-50 text-amber-800 p-3">Este link venceu. Fale com o gerente.</p>}

        {!fechado && !estado.entrada_em && (
          <div className="mt-6 space-y-3">
            <input ref={foto} type="file" accept="image/*" capture="user" className="hidden" onChange={e => escolherFoto(e.target.files?.[0])} />
            {selfie
              ? <img src={selfie} alt="Sua selfie" className="w-32 h-32 object-cover rounded-xl mx-auto" />
              : <p className="text-sm text-stone-600">1. Tire uma selfie no Ditado. 2. Toque em "Cheguei". O celular vai pedir a localização: aceite.</p>}
            <button type="button" onClick={() => foto.current?.click()}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold border border-stone-300 text-stone-800">
              <Camera size={18} /> {selfie ? 'Tirar outra selfie' : 'Tirar selfie'}
            </button>
            <button type="button" disabled={!selfie || enviando} onClick={() => marcar('entrada')}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white bg-emerald-600 disabled:opacity-50">
              <MapPin size={18} /> {enviando ? 'Marcando…' : 'Cheguei'}
            </button>
          </div>
        )}

        {!fechado && estado.entrada_em && !estado.saida_em && (
          <div className="mt-6">
            <p className="text-sm text-stone-600 mb-3">Na hora de ir embora, ainda no Ditado, toque em "Fui embora".</p>
            <button type="button" disabled={enviando} onClick={() => marcar('saida')}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white bg-stone-800 disabled:opacity-50">
              <LogOut size={18} /> {enviando ? 'Marcando…' : 'Fui embora'}
            </button>
          </div>
        )}

        {!fechado && estado.entrada_em && estado.saida_em && (
          <p className="mt-5 rounded-xl bg-emerald-50 text-emerald-800 p-3">Chegada e saída marcadas. Agora o gerente confere e confirma sua diária.</p>
        )}
        <p className="mt-6 text-xs text-stone-400">A selfie e a localização servem só para confirmar sua presença e o seu pagamento.</p>
      </div>
    </div>
  );
}
