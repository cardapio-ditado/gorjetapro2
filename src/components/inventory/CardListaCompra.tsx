import { useEffect, useState } from 'react';
import { Store, Truck, ExternalLink, Copy, Check, MessageCircle, CheckCircle2, XCircle, Phone, Loader2 } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { fmtMoeda, fmtData, urlListaPublica, urlWhatsApp, textoListaRua, textoPedidoFornecedor } from './comprasShared';

/** Resumo de uma lista, como vem de fn_compras_tela / fn_compras_gerar. */
export interface ListaResumo {
  lista_id: string;
  numero: string;
  titulo: string;
  tipo: 'rua' | 'fornecedor';
  status: string;
  fornecedor_id: string | null;
  fornecedor_nome: string | null;
  fornecedor_tel: string | null;
  data: string;
  itens: number;
  comprados: number;
  nao_encontrados: number;
  valor: number;
  valor_pago: number;
}

export function normalizarLista(raw: Record<string, unknown>): ListaResumo {
  return {
    lista_id: String(raw.lista_id),
    numero: String(raw.numero ?? ''),
    titulo: String(raw.titulo ?? ''),
    tipo: raw.tipo === 'fornecedor' ? 'fornecedor' : 'rua',
    status: String(raw.status ?? ''),
    fornecedor_id: (raw.fornecedor_id as string | null) ?? null,
    fornecedor_nome: (raw.fornecedor_nome as string | null) ?? null,
    fornecedor_tel: (raw.fornecedor_tel as string | null) ?? null,
    data: String(raw.data ?? ''),
    itens: Number(raw.itens ?? 0),
    comprados: Number(raw.comprados ?? 0),
    nao_encontrados: Number(raw.nao_encontrados ?? 0),
    valor: Number(raw.valor ?? 0),
    valor_pago: Number(raw.valor_pago ?? 0),
  };
}

interface Props {
  lista: ListaResumo;
  /** chamado depois de concluir/cancelar, para a tela recarregar */
  onMudou?: () => void;
  destaque?: boolean;
}

export function CardListaCompra({ lista, onMudou, destaque }: Props) {
  const [copiado, setCopiado] = useState(false);
  const [ocupado, setOcupado] = useState<'whats' | 'concluir' | 'cancelar' | null>(null);
  const [erro, setErro] = useState('');
  const url = urlListaPublica(lista.lista_id);
  const rua = lista.tipo === 'rua';

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2500);
    return () => clearTimeout(t);
  }, [copiado]);

  const copiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopiado(true);
    } catch {
      window.prompt('Copie o link:', url);
    }
  };

  // Rua: manda o link para o comprador. Fornecedor: manda o pedido escrito, item por item.
  const whatsapp = async () => {
    setErro('');
    if (rua) {
      window.open(urlWhatsApp(textoListaRua(lista.titulo, url)), '_blank', 'noopener');
      return;
    }
    setOcupado('whats');
    try {
      const { data, error } = await supabase.rpc('fn_lista_publica', { p_lista_id: lista.lista_id });
      if (error) throw error;
      const itens = ((data as { itens?: Record<string, unknown>[] })?.itens ?? []).map(i => ({
        nome: String(i.nome ?? ''), quantidade: Number(i.quantidade ?? 0), um: String(i.um ?? ''),
        observacao: (i.observacao as string | null) ?? null,
      }));
      const texto = textoPedidoFornecedor(lista.fornecedor_nome || 'fornecedor', fmtData(lista.data), itens);
      window.open(urlWhatsApp(texto, lista.fornecedor_tel), '_blank', 'noopener');
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  };

  const mudarStatus = async (status: 'concluida' | 'cancelada') => {
    const pergunta = status === 'cancelada'
      ? `Cancelar a lista "${lista.titulo}"? Os itens voltam a aparecer em Compras.`
      : `Concluir a lista "${lista.titulo}"?`;
    if (!window.confirm(pergunta)) return;
    setOcupado(status === 'cancelada' ? 'cancelar' : 'concluir'); setErro('');
    try {
      const { error } = await supabase.rpc('fn_lista_status', { p_lista_id: lista.lista_id, p_status: status });
      if (error) throw error;
      onMudou?.();
    } catch (e: unknown) {
      setErro(e instanceof Error ? e.message : String(e));
    } finally {
      setOcupado(null);
    }
  };

  const Icone = rua ? Store : Truck;
  const pct = lista.itens > 0 ? Math.round((lista.comprados / lista.itens) * 100) : 0;

  return (
    <div className={`rounded-2xl border px-4 py-3.5 bg-[#12141f] ${destaque ? 'border-wine/60 ring-1 ring-wine/30' : 'border-white/10'}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-3 min-w-0">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${rua ? 'bg-orange-500/15' : 'bg-blue-500/15'}`}>
            <Icone size={17} className={rua ? 'text-orange-400' : 'text-blue-400'} />
          </div>
          <div className="min-w-0">
            <p className="text-white font-bold leading-tight truncate">
              {lista.titulo} <span className="text-white/40 font-medium text-xs">· {lista.numero}</span>
            </p>
            <p className="text-xs text-white/60 mt-0.5">
              {lista.itens} {lista.itens === 1 ? 'item' : 'itens'} · {lista.comprados} {lista.comprados === 1 ? 'comprado' : 'comprados'}
              {rua && lista.nao_encontrados > 0 && <span className="text-orange-300"> · {lista.nao_encontrados} não achou</span>}
              {rua && lista.valor_pago > 0
                ? <> · <span className="text-white/90">pago {fmtMoeda(lista.valor_pago)}</span> (estimado {fmtMoeda(lista.valor)})</>
                : <> · {fmtMoeda(lista.valor)} estimado</>}
              {!rua && lista.fornecedor_tel && (
                <a href={`tel:${lista.fornecedor_tel.replace(/\s/g, '')}`} className="inline-flex items-center gap-1 ml-2 text-blue-300 hover:underline">
                  <Phone size={11} /> {lista.fornecedor_tel}
                </a>
              )}
            </p>
            <div className="mt-1.5 h-1.5 w-40 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full bg-green-400 rounded-full transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <a href={url} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1.5 bg-wine hover:bg-[#6a1a25] text-white text-xs font-semibold px-3 py-2 rounded-xl transition-colors">
            <ExternalLink size={13} /> Abrir
          </a>
          <button onClick={copiar} className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-white/10 text-xs font-medium text-white/70 hover:bg-white/5">
            {copiado ? <Check size={13} className="text-green-400" /> : <Copy size={13} />} {copiado ? 'Copiado' : 'Copiar link'}
          </button>
          <button onClick={whatsapp} disabled={ocupado === 'whats'}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-green-500/30 bg-green-500/10 text-xs font-medium text-green-300 hover:bg-green-500/20 disabled:opacity-50">
            {ocupado === 'whats' ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
            {rua ? 'Mandar pro comprador' : 'Enviar pedido'}
          </button>
          <button onClick={() => mudarStatus('concluida')} disabled={ocupado !== null} title="Marcar a lista como concluída"
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-white/10 text-xs text-white/60 hover:bg-white/5 disabled:opacity-50">
            <CheckCircle2 size={13} /> Concluir
          </button>
          <button onClick={() => mudarStatus('cancelada')} disabled={ocupado !== null} title="Cancelar a lista"
            className="flex items-center gap-1.5 px-2.5 py-2 rounded-xl border border-white/10 text-xs text-white/40 hover:text-red-300 hover:border-red-500/30 disabled:opacity-50">
            <XCircle size={13} /> Cancelar
          </button>
        </div>
      </div>
      {erro && <p className="text-xs text-red-400 mt-2">{erro}</p>}
    </div>
  );
}
