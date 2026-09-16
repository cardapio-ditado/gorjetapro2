import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, ClipboardList, ExternalLink, MessageCircle, X } from 'lucide-react';

// ─── Tipos compartilhados das telas de compras ───────────────────────────────
export type Situacao = 'zerado' | 'comprar' | 'atencao' | 'ok';

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

const SITUACAO_LABEL: Record<Situacao, string> = {
  zerado: 'Zerado', comprar: 'Comprar', atencao: 'No ponto', ok: 'OK',
};
const SITUACAO_COLOR: Record<Situacao, string> = {
  zerado: 'bg-red-500/15 text-red-400 border-red-500/30',
  comprar: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  atencao: 'bg-yellow-500/10 text-yellow-300 border-yellow-500/40',
  ok: 'bg-green-500/10 text-green-400 border-green-500/30',
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
export function fmtData(iso: string | null | undefined): string {
  if (!iso) return '';
  const s = String(iso).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : s;
}

// ─── Links da lista pública ──────────────────────────────────────────────────
export function urlListaPublica(listaId: string): string {
  return `${window.location.origin}/compras-publica/${listaId}`;
}

/** Só dígitos; número nacional ganha o 55 na frente para o wa.me funcionar. */
export function telefoneWhatsApp(tel: string | null | undefined): string | null {
  const d = (tel || '').replace(/\D/g, '');
  if (d.length < 10) return null;
  return d.startsWith('55') && d.length >= 12 ? d : `55${d}`;
}

export function urlWhatsApp(texto: string, telefone?: string | null): string {
  const fone = telefoneWhatsApp(telefone);
  return `https://wa.me/${fone ?? ''}?text=${encodeURIComponent(texto)}`;
}

/** Mensagem para o comprador da rua: abre o link e vai marcando. */
export function textoListaRua(titulo: string, url: string): string {
  return `🛒 ${titulo}\nAbra a lista e vá marcando o que comprar:\n${url}`;
}

/** Mensagem de pedido para o fornecedor, com os itens por extenso. */
export function textoPedidoFornecedor(
  fornecedor: string, data: string,
  itens: { nome: string; quantidade: number; um: string; observacao?: string | null }[],
): string {
  const linhas = itens.map(i => `• ${fmtQtd(i.quantidade)} ${i.um} ${i.nome.trim()}${i.observacao ? ` (${i.observacao})` : ''}`);
  return `📦 Pedido Ditado Popular · ${data}\nPara: ${fornecedor}\n\n${linhas.join('\n')}\n\nPode confirmar disponibilidade e previsão de entrega? Obrigado!`;
}

// ─── Sub-componentes ─────────────────────────────────────────────────────────
export function BadgeSituacao({ s }: { s: Situacao }) {
  return (
    <span className={`text-caption px-1.5 py-0.5 rounded-md border whitespace-nowrap ${SITUACAO_COLOR[s]}`}>
      {SITUACAO_LABEL[s]}
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
