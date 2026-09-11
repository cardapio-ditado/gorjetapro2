import { useState, useEffect } from 'react';
import { ClipboardList, ExternalLink, Copy, Check, MessageCircle } from 'lucide-react';
import { fmtMoeda } from './comprasShared';

export interface ListaDoDia {
  lista_id: string;
  numero: string;
  titulo: string;
  status: string;
  itens: number;
  comprados: number;
  valor: number;
  fornecedores: number;
}

export function urlListaPublica(listaId: string): string {
  return `${window.location.origin}/compras-publica/${listaId}`;
}

export function urlWhatsApp(titulo: string, url: string): string {
  return `https://wa.me/?text=${encodeURIComponent(`Lista de compras de hoje, ${titulo}: ${url}`)}`;
}

/** Converte o jsonb de `fn_lista_do_dia_resumo` (ou o campo `lista` de outras RPCs) em ListaDoDia. */
export function normalizarListaDoDia(data: unknown): ListaDoDia | null {
  if (!data || typeof data !== 'object') return null;
  const r = data as Record<string, unknown>;
  if (!r.lista_id) return null;
  return {
    lista_id: String(r.lista_id),
    numero: String(r.numero ?? ''),
    titulo: String(r.titulo ?? ''),
    status: String(r.status ?? ''),
    itens: Number(r.itens ?? 0),
    comprados: Number(r.comprados ?? 0),
    valor: Number(r.valor ?? 0),
    fornecedores: Number(r.fornecedores ?? 0),
  };
}

export function PainelListaDoDia({ lista }: { lista: ListaDoDia }) {
  const [copiado, setCopiado] = useState(false);
  const [mostrarUrl, setMostrarUrl] = useState(false);
  const url = urlListaPublica(lista.lista_id);

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2500);
    return () => clearTimeout(t);
  }, [copiado]);

  const copiarLink = async () => {
    try {
      if (!navigator.clipboard?.writeText) throw new Error('clipboard indisponível');
      await navigator.clipboard.writeText(url);
      setCopiado(true); setMostrarUrl(false);
    } catch {
      setMostrarUrl(true);
    }
  };

  return (
    <div className="bg-[#12141f] rounded-2xl border border-wine/50 ring-1 ring-wine/20 px-5 py-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-10 h-10 bg-wine/20 rounded-xl flex items-center justify-center flex-shrink-0">
            <ClipboardList size={20} className="text-wine" />
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold leading-tight">
              Lista do comprador de hoje <span className="text-white/50 font-medium">· {lista.numero}</span>
            </p>
            <p className="text-xs text-white/60 mt-0.5">
              {lista.itens} {lista.itens === 1 ? 'item' : 'itens'} ({lista.comprados} {lista.comprados === 1 ? 'comprado' : 'comprados'})
              {' · '}{fmtMoeda(lista.valor)}
              {' · '}{lista.fornecedores} {lista.fornecedores === 1 ? 'fornecedor' : 'fornecedores'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-wine hover:bg-[#6a1a25] text-white text-sm font-semibold px-3 py-2 rounded-xl transition-colors">
            <ExternalLink size={14} /> Abrir lista
          </a>
          <button onClick={copiarLink}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-sm font-medium text-white/70 hover:bg-white/5 transition-colors">
            {copiado ? <Check size={14} className="text-green-400" /> : <Copy size={14} />}
            {copiado ? 'Copiado' : 'Copiar link'}
          </button>
          <a href={urlWhatsApp(lista.titulo, url)} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-green-500/30 bg-green-500/10 text-sm font-medium text-green-300 hover:bg-green-500/20 transition-colors">
            <MessageCircle size={14} /> Enviar no WhatsApp
          </a>
        </div>
      </div>
      {mostrarUrl && (
        <div className="mt-3">
          <p className="text-caption text-white/50 mb-1">Não foi possível copiar automaticamente. Selecione e copie o link:</p>
          <input readOnly value={url} onFocus={e => e.target.select()}
            className="w-full text-xs border border-white/10 rounded-lg px-2 py-1.5 bg-[#0c1018] text-white/80 focus:outline-none focus:ring-2 focus:ring-wine/30" />
        </div>
      )}
    </div>
  );
}
