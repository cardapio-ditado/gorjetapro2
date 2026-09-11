import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ClipboardList, ExternalLink, MessageCircle, X } from 'lucide-react';

// ─── Tipos compartilhados das telas de compras ───────────────────────────────
export type Situacao = 'zerado' | 'comprar' | 'atencao' | 'ok';
export type Criterio = 'manual' | 'consumo' | 'sem_consumo';

export interface Mensagem {
  tipo: 'ok' | 'erro';
  texto: string;
  link?: string;
  linkLabel?: string;
  /** Link externo (abre em nova aba) — usado para a lista do comprador */
  linkExterno?: { href: string; label: string };
  /** Link para compartilhar no WhatsApp (abre em nova aba) */
  whatsapp?: string;
}

// ─── Constantes ──────────────────────────────────────────────────────────────
export const DIAS = [
  { n: 1, sigla: 'Seg', letra: 'S' },
  { n: 2, sigla: 'Ter', letra: 'T' },
  { n: 3, sigla: 'Qua', letra: 'Q' },
  { n: 4, sigla: 'Qui', letra: 'Q' },
  { n: 5, sigla: 'Sex', letra: 'S' },
  { n: 6, sigla: 'Sáb', letra: 'S' },
  { n: 7, sigla: 'Dom', letra: 'D' },
];

const SITUACAO_LABEL: Record<Situacao, string> = {
  zerado: 'Zerado', comprar: 'Comprar', atencao: 'Atenção', ok: 'OK',
};
const SITUACAO_COLOR: Record<Situacao, string> = {
  zerado: 'bg-red-500/15 text-red-400 border-red-500/30',
  comprar: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  atencao: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/40',
  ok: 'bg-green-500/10 text-green-400 border-green-500/30',
};
const CRITERIO_LABEL: Record<Criterio, string> = {
  consumo: 'pelo consumo',
  manual: 'mínimo travado',
  sem_consumo: 'sem histórico (mínimo digitado)',
};
const CRITERIO_COLOR: Record<Criterio, string> = {
  consumo: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  manual: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
  sem_consumo: 'bg-white/5 text-white/50 border-white/10',
};

const UNIDADES_FRACIONAVEIS = ['kg', 'g', 'grama', 'gramas', 'l', 'litro', 'litros', 'ml', 'mililitro', 'mililitros'];
export function ehFracionado(um: string | null | undefined): boolean {
  return UNIDADES_FRACIONAVEIS.includes((um || '').trim().toLowerCase());
}

// ─── Formatação ──────────────────────────────────────────────────────────────
export function fmt(n: number, dec = 2) {
  return n.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}
export function fmtQtd(n: number) { return fmt(n, n % 1 === 0 ? 0 : 2); }
export function fmtMoeda(n: number) { return 'R$ ' + fmt(n); }

// ─── Sub-componentes ─────────────────────────────────────────────────────────
export function BadgeSituacao({ s }: { s: Situacao }) {
  return (
    <span className={`text-caption px-1.5 py-0.5 rounded-md border whitespace-nowrap ${SITUACAO_COLOR[s]}`}>
      {SITUACAO_LABEL[s]}
    </span>
  );
}

export function BadgeCriterio({ c }: { c: Criterio }) {
  return (
    <span className={`text-caption px-1.5 py-0.5 rounded-md border whitespace-nowrap ${CRITERIO_COLOR[c]}`}>
      {CRITERIO_LABEL[c]}
    </span>
  );
}

export function DiasCompra({ dias }: { dias: number[] | null }) {
  if (!dias || dias.length === 0) {
    return <span className="text-caption text-white/50">qualquer dia</span>;
  }
  return (
    <span className="flex items-center gap-0.5" title={dias.map(d => DIAS[d - 1]?.sigla).filter(Boolean).join(', ')}>
      {DIAS.map(d => (
        <span key={d.n}
          className={`w-4 h-4 rounded text-[10px] font-bold flex items-center justify-center ${dias.includes(d.n) ? 'bg-wine text-white' : 'bg-white/5 text-white/25'}`}>
          {d.letra}
        </span>
      ))}
    </span>
  );
}

export function MensagemBox({ msg, onFechar }: { msg: Mensagem; onFechar: () => void }) {
  const ok = msg.tipo === 'ok';
  return (
    <div className={`mx-4 my-3 rounded-xl border px-3 py-2.5 text-sm flex items-start gap-2 ${ok ? 'bg-green-500/10 border-green-500/30 text-green-300' : 'bg-red-500/10 border-red-500/30 text-red-400'}`}>
      {ok ? <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" /> : <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />}
      <div className="flex-1 min-w-0">
        <p>{msg.texto}</p>
        <div className="flex items-center gap-3 flex-wrap">
          {msg.link && (
            <Link to={msg.link} className="inline-flex items-center gap-1 mt-1 text-xs font-semibold underline underline-offset-2 hover:opacity-80">
              <ExternalLink size={12} /> {msg.linkLabel || 'Abrir'}
            </Link>
          )}
          {msg.linkExterno && (
            <a href={msg.linkExterno.href} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-1 text-xs font-semibold underline underline-offset-2 hover:opacity-80">
              <ClipboardList size={12} /> {msg.linkExterno.label}
            </a>
          )}
          {msg.whatsapp && (
            <a href={msg.whatsapp} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1 mt-1 text-xs font-semibold underline underline-offset-2 hover:opacity-80">
              <MessageCircle size={12} /> Enviar no WhatsApp
            </a>
          )}
        </div>
      </div>
      <button onClick={onFechar} className="text-white/30 hover:text-white/60 flex-shrink-0"><X size={14} /></button>
    </div>
  );
}
