import React, { useState } from 'react';
import { Check, CheckCircle2, Copy, ExternalLink, FileDown, MessageCircle, RotateCcw, Store, Truck, XCircle } from 'lucide-react';
import { Badge, Button } from '../../ui';
import { fmtData, textoListaRua, textoPedidoFornecedor, urlListaPublica, urlWhatsApp } from '../../inventory/comprasShared';
import { gerarPdfListaCompra } from '../../inventory/pdfListaCompra';
import { brl } from '../cadastros/api';
import { comprasApi, type ListaResumo } from './api';

interface Props {
  lista: ListaResumo;
  onMudou: () => void;
  destaque?: boolean;
}

/** Uma lista gerada: da Rua (link para o comprador) ou pedido a um fornecedor (texto no WhatsApp). */
const CardLista: React.FC<Props> = ({ lista, onMudou, destaque }) => {
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const url = urlListaPublica(lista.lista_id);
  const rua = lista.tipo === 'rua';
  const concluida = lista.status === 'concluida';
  const Icone = rua ? Store : Truck;

  const rodar = async (chave: string, fn: () => Promise<void>) => {
    setOcupado(chave); setErro(null);
    try { await fn(); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); } finally { setOcupado(null); }
  };
  const copiar = async () => {
    try { await navigator.clipboard.writeText(url); setCopiado(true); setTimeout(() => setCopiado(false), 2500); }
    catch { window.prompt('Copie o link:', url); }
  };
  const whatsapp = () => rodar('whats', async () => {
    if (rua) { window.open(urlWhatsApp(textoListaRua(lista.titulo, url)), '_blank', 'noopener'); return; }
    const itens = await comprasApi.listaItens(lista.lista_id);
    window.open(urlWhatsApp(textoPedidoFornecedor(lista.fornecedor_nome || 'fornecedor', fmtData(lista.data), itens), lista.fornecedor_tel), '_blank', 'noopener');
  });
  const mudar = (status: 'concluida' | 'cancelada' | 'aberta') => {
    const pergunta = status === 'cancelada' ? `Cancelar "${lista.titulo}"? Os itens voltam a aparecer em Compras.` : status === 'aberta' ? `Reabrir "${lista.titulo}"?` : `Concluir "${lista.titulo}"?`;
    if (!window.confirm(pergunta)) return;
    void rodar(status, async () => { await comprasApi.listaStatus(lista.lista_id, status); onMudou(); });
  };

  return (
    <div className="card px-4 py-3" style={destaque ? { borderColor: 'var(--gold)' } : undefined}>
      <div className="flex flex-wrap items-start gap-3">
        <Icone size={18} aria-hidden="true" style={{ color: concluida ? 'var(--ok-text)' : 'var(--gold)', marginTop: 2, flexShrink: 0 }} />
        <div className="flex-1 min-w-[200px]">
          <p className="t-body" style={{ margin: 0, fontWeight: 600 }}>
            {lista.titulo} <span className="t-caption">· {lista.numero}</span>
            {concluida && <Badge variant="success" className="ml-2">concluída</Badge>}
          </p>
          <p className="t-caption" style={{ margin: 0 }}>
            {lista.itens} {lista.itens === 1 ? 'item' : 'itens'} · {lista.comprados} {lista.comprados === 1 ? 'comprado' : 'comprados'}
            {rua && lista.nao_encontrados > 0 && <span className="texto-atencao"> · {lista.nao_encontrados} não achou</span>}
            {rua && lista.valor_pago > 0 ? ` · pago ${brl(lista.valor_pago)} (estimado ${brl(lista.valor)})` : ` · ${brl(lista.valor)} estimado`}
            {!rua && lista.fornecedor_tel && <> · <a href={`tel:${lista.fornecedor_tel.replace(/\s/g, '')}`} className="underline">{lista.fornecedor_tel}</a></>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button tamanho="sm" variante={concluida ? 'secundario' : 'primario'} icone={<ExternalLink size={14} />} onClick={() => window.open(url, '_blank', 'noopener')}>Abrir</Button>
          {!concluida && <Button tamanho="sm" icone={copiado ? <Check size={14} /> : <Copy size={14} />} onClick={copiar}>{copiado ? 'Copiado' : 'Copiar link'}</Button>}
          {!concluida && <Button tamanho="sm" icone={<MessageCircle size={14} />} onClick={whatsapp} carregando={ocupado === 'whats'}>{rua ? 'Mandar pro comprador' : 'Enviar pedido'}</Button>}
          <Button tamanho="sm" variante="discreto" icone={<FileDown size={14} />} onClick={() => rodar('pdf', () => gerarPdfListaCompra(lista.lista_id))} carregando={ocupado === 'pdf'}>PDF</Button>
          {concluida
            ? <Button tamanho="sm" variante="discreto" icone={<RotateCcw size={14} />} onClick={() => mudar('aberta')} carregando={ocupado === 'aberta'}>Reabrir</Button>
            : <>
              <Button tamanho="sm" variante="discreto" icone={<CheckCircle2 size={14} />} onClick={() => mudar('concluida')} carregando={ocupado === 'concluida'}>Concluir</Button>
              <Button tamanho="sm" variante="discreto" icone={<XCircle size={14} />} onClick={() => mudar('cancelada')} carregando={ocupado === 'cancelada'}>Cancelar</Button>
            </>}
        </div>
      </div>
      {erro && <p className="t-caption texto-perigo mt-2" style={{ margin: 0 }}>{erro}</p>}
    </div>
  );
};

export default CardLista;
