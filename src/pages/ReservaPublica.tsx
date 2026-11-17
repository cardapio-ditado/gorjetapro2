import { useState } from 'react';
import { AlertTriangle, CheckCircle2, CalendarDays, MessageCircle } from 'lucide-react';

/**
 * Pré-reserva pelo link do cliente (ditado.org/reserva).
 * O pedido entra nas reservas normais como "pré-reserva" e só vale depois que a
 * equipe confirma pelo WhatsApp (tela de Eventos). O cliente só envia: quem
 * valida e grava é a função fn_reserva_publica, no banco.
 */

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

// WhatsApp da equipe do Ditado, (65) 4141-3655 (Kadu, 17/11/2026).
const WHATS_EQUIPE = '556541413655';

function FalarEquipe({ texto }: { texto: string }) {
  return (
    <a href={`https://wa.me/${WHATS_EQUIPE}?text=${encodeURIComponent(texto)}`} target="_blank" rel="noopener noreferrer"
      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-semibold text-white text-base bg-emerald-600 hover:bg-emerald-500 transition-all">
      <MessageCircle size={18} /> Falar com a equipe no WhatsApp
    </a>
  );
}

const AMBIENTES = [
  { v: 'outros', t: 'Sem preferência' },
  { v: 'interna', t: 'Área interna' },
  { v: 'varanda', t: 'Varanda' },
  { v: 'deck', t: 'Deck' },
  { v: 'mezanino', t: 'Mezanino' },
];

const HORARIOS = Array.from({ length: 25 }, (_, i) => {
  const m = 11 * 60 + i * 30;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${m % 60 ? '30' : '00'}`;
});

// Data de hoje em Cuiabá (UTC-4), para o calendário não oferecer dia passado.
const hojeCuiaba = () => new Date(Date.now() - 4 * 3600 * 1000).toISOString().slice(0, 10);
const somaDias = (iso: string, n: number) => {
  const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const dataLonga = (iso: string) => {
  const t = new Date(iso + 'T12:00:00').toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
};

const inputCls = 'w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-[#7D1F2C]/60 text-base';
const labelCls = 'text-xs font-semibold text-white/60 uppercase tracking-wide block mb-1.5';

function AvisoPre({ forte = false }: { forte?: boolean }) {
  return (
    <div className={`rounded-2xl p-4 flex gap-3 items-start ${forte ? 'bg-amber-400/15 border border-amber-400/50' : 'bg-amber-400/10 border border-amber-400/30'}`} role="note">
      <AlertTriangle size={22} className="text-amber-300 flex-shrink-0 mt-0.5" />
      <div className="text-sm text-amber-50/90 leading-relaxed">
        <p className="font-bold text-amber-200 text-base">Isto é uma PRÉ-RESERVA</p>
        <p>Ela só vale depois que a equipe do Ditado confirmar pelo WhatsApp que você informar. Até a confirmação, a mesa não está garantida.</p>
      </div>
    </div>
  );
}

export default function ReservaPublica() {
  const hoje = hojeCuiaba();
  const [form, setForm] = useState({ nome: '', telefone: '', data: '', horario: '20:00', pessoas: 2, local: 'outros', obs: '' });
  const [entendi, setEntendi] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ data: string; horario: string; pessoas: number } | null>(null);
  const set = (k: keyof typeof form, v: string | number) => setForm(f => ({ ...f, [k]: v }));

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    setErro(null);
    if (form.nome.trim().length < 3) return setErro('Escreva seu nome.');
    if (form.telefone.replace(/\D/g, '').length < 10) return setErro('Confira o WhatsApp: DDD e número.');
    if (!form.data) return setErro('Escolha o dia.');
    if (!entendi) return setErro('Marque que você entendeu que é uma pré-reserva.');
    setEnviando(true);
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/fn_reserva_publica`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON, Authorization: `Bearer ${SUPABASE_ANON}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_nome: form.nome, p_telefone: form.telefone, p_data: form.data, p_horario: form.horario,
          p_pessoas: form.pessoas, p_local: form.local, p_obs: form.obs,
        }),
      });
      const corpo = await res.json().catch(() => null);
      if (!res.ok) throw new Error(corpo?.message || 'Não deu para enviar agora. Tente de novo.');
      setFeito({ data: form.data, horario: form.horario, pessoas: form.pessoas });
    } catch (err) {
      setErro(err instanceof Error ? err.message : 'Não deu para enviar agora. Tente de novo.');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="min-h-screen pb-16" style={{ background: '#080c14', color: '#e8edf8' }}>
      <div style={{ background: 'linear-gradient(135deg, #7D1F2C 0%, #5a1520 60%, #3d0f16 100%)' }}>
        <div className="max-w-lg mx-auto px-4 py-6 flex items-center gap-3">
          <div>
            <h1 className="text-xl font-bold text-white">Pré-reserva · Ditado Popular</h1>
            <p className="text-white/70 text-sm">Peça sua mesa. A equipe confirma pelo WhatsApp.</p>
          </div>
        </div>
      </div>

      <main className="max-w-lg mx-auto px-4 pt-5 space-y-4">
        {feito ? (
          <div className="space-y-4">
            <div className="rounded-2xl p-6 text-center" style={{ background: '#101520', border: '1px solid rgba(255,255,255,0.06)' }}>
              <CheckCircle2 size={44} className="mx-auto text-emerald-400 mb-3" />
              <h2 className="text-xl font-bold text-white mb-1">Pré-reserva recebida</h2>
              <p className="text-white/70">{dataLonga(feito.data)} às {feito.horario}</p>
              <p className="text-white/70">{feito.pessoas} {feito.pessoas === 1 ? 'pessoa' : 'pessoas'}</p>
            </div>
            <AvisoPre forte />
            <p className="text-sm text-white/60 text-center">Aguarde a mensagem da equipe no seu WhatsApp. Se não receber, fale com a gente:</p>
            <FalarEquipe texto={`Olá! Fiz uma pré-reserva pelo site para ${dataLonga(feito.data).toLowerCase()} às ${feito.horario}, ${feito.pessoas} ${feito.pessoas === 1 ? 'pessoa' : 'pessoas'}.`} />
          </div>
        ) : (
          <form onSubmit={enviar} className="space-y-4" noValidate>
            <AvisoPre />

            <div className="rounded-2xl p-5 space-y-4" style={{ background: '#101520', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <label htmlFor="r-nome" className={labelCls}>Seu nome *</label>
                <input id="r-nome" className={inputCls} value={form.nome} onChange={e => set('nome', e.target.value)} autoComplete="name" maxLength={80} placeholder="Nome e sobrenome" />
              </div>
              <div>
                <label htmlFor="r-tel" className={labelCls}>WhatsApp *</label>
                <input id="r-tel" className={inputCls} type="tel" inputMode="tel" value={form.telefone} onChange={e => set('telefone', e.target.value)} autoComplete="tel" placeholder="(65) 99999-0000" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="r-data" className={labelCls}>Dia *</label>
                  <input id="r-data" className={inputCls} type="date" min={hoje} max={somaDias(hoje, 90)} value={form.data} onChange={e => set('data', e.target.value)} />
                </div>
                <div>
                  <label htmlFor="r-hora" className={labelCls}>Horário *</label>
                  <select id="r-hora" className={inputCls} value={form.horario} onChange={e => set('horario', e.target.value)}>
                    {HORARIOS.map(h => <option key={h} value={h} className="bg-[#101520]">{h}</option>)}
                  </select>
                </div>
              </div>
              {form.data && <p className="text-sm text-white/60 -mt-2 flex items-center gap-1.5"><CalendarDays size={14} /> {dataLonga(form.data)}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="r-pessoas" className={labelCls}>Pessoas *</label>
                  <input id="r-pessoas" className={inputCls} type="number" inputMode="numeric" min={1} max={20} value={form.pessoas}
                    onChange={e => set('pessoas', Math.max(1, Math.min(99, parseInt(e.target.value) || 1)))} />
                </div>
                <div>
                  <label htmlFor="r-local" className={labelCls}>Ambiente</label>
                  <select id="r-local" className={inputCls} value={form.local} onChange={e => set('local', e.target.value)}>
                    {AMBIENTES.map(a => <option key={a.v} value={a.v} className="bg-[#101520]">{a.t}</option>)}
                  </select>
                </div>
              </div>
              {form.pessoas > 20 && <div className="space-y-2">
                <p className="text-sm text-amber-200">Acima de 20 pessoas é evento: fale direto com a equipe do Ditado.</p>
                <FalarEquipe texto={`Olá! Quero reservar para ${form.pessoas} pessoas${form.data ? ` em ${dataLonga(form.data).toLowerCase()}` : ''}.`} />
              </div>}
              <div>
                <label htmlFor="r-obs" className={labelCls}>Observação</label>
                <textarea id="r-obs" className={inputCls + ' resize-none'} rows={2} maxLength={300} value={form.obs} onChange={e => set('obs', e.target.value)} placeholder="Aniversário, cadeira de bebê, alguma preferência..." />
              </div>
            </div>

            <label className="flex gap-3 items-start rounded-2xl p-4 cursor-pointer" style={{ background: '#101520', border: '1px solid rgba(255,255,255,0.06)' }}>
              <input type="checkbox" checked={entendi} onChange={e => setEntendi(e.target.checked)} className="mt-1 w-5 h-5 accent-[#7D1F2C] flex-shrink-0" />
              <span className="text-sm text-white/80">Entendi que é uma <b>pré-reserva</b> e que ela só vale depois da confirmação da equipe pelo WhatsApp.</span>
            </label>

            {erro && <p className="text-sm text-red-300 bg-red-500/10 border border-red-400/30 rounded-xl px-4 py-3" role="alert">{erro}</p>}
            {erro && /equipe/i.test(erro) && <FalarEquipe texto="Olá! Quero fazer uma reserva no Ditado." />}

            <button type="submit" disabled={enviando || form.pessoas > 20}
              className="w-full py-4 rounded-xl font-bold text-white text-base disabled:opacity-40 transition-all"
              style={{ background: '#7D1F2C' }}>
              {enviando ? 'Enviando...' : 'Enviar pré-reserva'}
            </button>
            <p className="text-xs text-white/40 text-center">Pela página, dá para pedir até as 16h para o mesmo dia e até 90 dias antes.</p>
          </form>
        )}
      </main>
    </div>
  );
}
