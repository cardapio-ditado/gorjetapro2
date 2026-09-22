import React, { useEffect, useState } from 'react';
import { ArrowLeft, ArrowRight, Check, Loader, Plus, Search, Trash2 } from 'lucide-react';
import { betaApi, emojiDaCategoria, fmt, type ItemBusca } from './api';
import { consultasApi, type EstoqueRef } from './apiConsultas';
import Contador from './Contador';

interface Props {
  responsavel: string | null;
  onVoltar: () => void;
}

interface LinhaLista {
  item: ItemBusca;
  quantidade: number;
}

interface Feito {
  itens: number;
  origem: string;
  destino: string;
}

/**
 * Transferir entre estoques: escolhe de onde e para onde, monta a lista
 * de itens tocando em cada um, e manda tudo de uma vez.
 */
const Transferir: React.FC<Props> = ({ responsavel, onVoltar }) => {
  const [estoques, setEstoques] = useState<EstoqueRef[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [origem, setOrigem] = useState<EstoqueRef | null>(null);
  const [destino, setDestino] = useState<EstoqueRef | null>(null);
  const [confirmouRota, setConfirmouRota] = useState(false);
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<ItemBusca[]>([]);
  const [item, setItem] = useState<ItemBusca | null>(null);
  const [qtd, setQtd] = useState(1);
  const [lista, setLista] = useState<LinhaLista[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<Feito | null>(null);

  useEffect(() => {
    let vivo = true;
    consultasApi
      .estoques()
      .then((e) => { if (vivo) setEstoques(e); })
      .catch((e: unknown) => { if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao carregar estoques'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, []);

  const emBusca = confirmouRota && origem && destino && !item;
  const destinoId = destino?.id ?? null;

  useEffect(() => {
    if (!emBusca) return;
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        const r = await betaApi.buscarItem(termo, destinoId);
        if (vivo) setResultados(r);
      } catch {
        if (vivo) setResultados([]);
      }
    }, 200);
    return () => { vivo = false; clearTimeout(t); };
  }, [termo, destinoId, emBusca]);

  const origemCentral = origem?.tipo === 'central';
  const totalItens = lista.length;

  const escolherOrigem = (e: EstoqueRef) => {
    setOrigem(e);
    if (destino?.id === e.id) setDestino(null);
  };

  const escolherDestino = (e: EstoqueRef) => {
    setDestino(e);
    if (origem?.id === e.id) setOrigem(null);
  };

  const adicionar = () => {
    if (!item || qtd <= 0) return;
    setLista((atual) => {
      const existe = atual.find((l) => l.item.item_id === item.item_id);
      if (existe) {
        return atual.map((l) => (l.item.item_id === item.item_id ? { ...l, quantidade: l.quantidade + qtd } : l));
      }
      return [...atual, { item, quantidade: qtd }];
    });
    setItem(null);
    setQtd(1);
    setTermo('');
  };

  const remover = (itemId: string) => {
    setLista((atual) => atual.filter((l) => l.item.item_id !== itemId));
  };

  const transferir = async () => {
    if (!origem || !destino || lista.length === 0) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await consultasApi.transferir(
        origem.id,
        destino.id,
        lista.map((l) => ({ item_id: l.item.item_id, quantidade: l.quantidade })),
        responsavel,
      );
      setFeito({ itens: r.itens ?? lista.length, origem: origem.nome, destino: destino.nome });
      setLista([]);
      setItem(null);
      setQtd(1);
      setTermo('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao transferir');
    } finally {
      setOcupado(false);
    }
  };

  const Cabecalho = ({ titulo, sub }: { titulo: string; sub?: string }) => (
    <div className="px-4 pt-4 pb-3 border-b border-white/10">
      <button onClick={onVoltar} className="flex items-center gap-1 text-white/70 py-2">
        <ArrowLeft className="w-5 h-5" /> Voltar
      </button>
      <h1 className="font-black text-3xl mt-1 text-white">{titulo}</h1>
      {sub && <p className="text-white/60">{sub}</p>}
    </div>
  );

  const Foto = ({ i, tamanho }: { i: ItemBusca; tamanho: 'md' | 'sm' }) => (
    <div className={`${tamanho === 'md' ? 'w-14 h-14 rounded-xl' : 'w-12 h-12 rounded-lg'} bg-black/30 flex items-center justify-center overflow-hidden flex-shrink-0`}>
      {i.foto_url ? (
        <img src={i.foto_url} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className={tamanho === 'md' ? 'text-3xl' : 'text-2xl'}>{emojiDaCategoria(i.categoria)}</span>
      )}
    </div>
  );

  // ---- sucesso -----------------------------------------------------------
  if (feito) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-white text-center p-8" style={{ background: '#0d0f1a' }}>
        <div className="text-8xl mb-4">🚚</div>
        <h1 className="font-black text-4xl">Transferido!</h1>
        <p className="text-white/60 mt-2 text-lg">
          {feito.itens} {feito.itens === 1 ? 'item transferido' : 'itens transferidos'} de {feito.origem} para {feito.destino}.
        </p>
        <div className="mt-8 w-full max-w-sm flex flex-col gap-3">
          <button
            onClick={() => setFeito(null)}
            className="w-full h-20 rounded-3xl bg-[#D4AF37] text-black font-black text-2xl flex items-center justify-center gap-3"
          >
            <Plus className="w-8 h-8" /> Fazer outra
          </button>
          <button onClick={onVoltar} className="w-full h-16 rounded-2xl bg-white/10 text-white font-bold text-xl">
            Voltar
          </button>
        </div>
      </div>
    );
  }

  // ---- passo 1: de onde, para onde ---------------------------------------
  if (!confirmouRota || !origem || !destino) {
    return (
      <div className="min-h-screen flex flex-col text-white" style={{ background: '#0d0f1a' }}>
        <Cabecalho titulo="Transferir" sub="De onde sai e para onde vai?" />
        <div className="flex-1 p-4 space-y-5 max-w-lg w-full mx-auto">
          {carregando && (
            <div className="flex items-center justify-center py-10 text-white/50 gap-2">
              <Loader className="w-6 h-6 animate-spin" /> carregando estoques...
            </div>
          )}
          {erro && <div className="rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 px-4 py-3">{erro}</div>}

          {!carregando && (
            <>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="text-sm font-bold uppercase tracking-widest text-white/60 mb-3">De onde</div>
                <div className="flex flex-wrap gap-2">
                  {estoques.map((e) => {
                    const ativo = origem?.id === e.id;
                    const bloqueado = destino?.id === e.id;
                    return (
                      <button
                        key={e.id}
                        onClick={() => escolherOrigem(e)}
                        disabled={bloqueado}
                        className={`px-5 h-14 rounded-2xl font-bold text-lg border-2 disabled:opacity-30 ${
                          ativo ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'bg-white/5 text-white border-white/10 active:bg-white/10'
                        }`}
                      >
                        {e.nome}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-center text-white/30">
                <ArrowRight className="w-8 h-8 rotate-90" />
              </div>

              <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
                <div className="text-sm font-bold uppercase tracking-widest text-white/60 mb-3">Para onde</div>
                <div className="flex flex-wrap gap-2">
                  {estoques.map((e) => {
                    const ativo = destino?.id === e.id;
                    const bloqueado = origem?.id === e.id;
                    return (
                      <button
                        key={e.id}
                        onClick={() => escolherDestino(e)}
                        disabled={bloqueado}
                        className={`px-5 h-14 rounded-2xl font-bold text-lg border-2 disabled:opacity-30 ${
                          ativo ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'bg-white/5 text-white border-white/10 active:bg-white/10'
                        }`}
                      >
                        {e.nome}
                      </button>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>
        <div className="px-4 pb-6 pt-2 max-w-lg w-full mx-auto">
          <button
            onClick={() => setConfirmouRota(true)}
            disabled={!origem || !destino}
            className="w-full h-20 rounded-3xl bg-[#D4AF37] disabled:opacity-50 text-black font-black text-2xl flex items-center justify-center gap-3"
          >
            ESCOLHER ITENS <ArrowRight className="w-8 h-8" />
          </button>
        </div>
      </div>
    );
  }

  // ---- passo 2: itens ----------------------------------------------------
  return (
    <div className="min-h-screen flex flex-col text-white" style={{ background: '#0d0f1a' }}>
      <div className="px-4 pt-4 pb-3 border-b border-white/10">
        <button onClick={onVoltar} className="flex items-center gap-1 text-white/70 py-2">
          <ArrowLeft className="w-5 h-5" /> Voltar
        </button>
        <h1 className="font-black text-3xl mt-1">Transferir</h1>
        <p className="text-white/60 flex items-center gap-2 flex-wrap">
          <span className="font-bold text-white">{origem.nome}</span>
          <ArrowRight className="w-4 h-4" />
          <span className="font-bold text-white">{destino.nome}</span>
          <button onClick={() => { setConfirmouRota(false); setItem(null); }} className="text-sm underline text-white/60">
            trocar
          </button>
        </p>
      </div>

      <div className="flex-1 p-4 space-y-3 max-w-lg w-full mx-auto">
        {!item ? (
          <>
            <div className="flex items-center gap-2 bg-white/10 rounded-2xl px-4">
              <Search className="w-6 h-6 text-white/40" />
              <input
                autoFocus
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="O que vai levar?"
                className="flex-1 bg-transparent py-4 text-white text-xl outline-none"
              />
            </div>
            {resultados.map((r) => (
              <button
                key={r.item_id}
                onClick={() => { setItem(r); setQtd(1); }}
                className="w-full flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 p-3 text-left active:bg-white/10"
              >
                <Foto i={r} tamanho="md" />
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-lg truncate">{r.nome}</div>
                  <div className="text-xs text-white/50">
                    {origemCentral ? `Central tem ${fmt(r.saldo_central)} ${r.rotulo_solto}` : r.rotulo_solto}
                    {r.no_balcao && <span className="ml-2 text-[#D4AF37]">· é do {destino.nome}</span>}
                  </div>
                </div>
              </button>
            ))}
          </>
        ) : (
          <>
            <div className="rounded-3xl overflow-hidden bg-white/5 border-2 border-[#D4AF37]">
              <div className="h-40 bg-black/30 flex items-center justify-center">
                {item.foto_url ? (
                  <img src={item.foto_url} alt={item.nome} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-7xl">{emojiDaCategoria(item.categoria)}</span>
                )}
              </div>
              <div className="p-4">
                <div className="font-black text-2xl leading-tight">{item.nome}</div>
                {origemCentral && (
                  <div className="text-white/50 text-sm">Central tem {fmt(item.saldo_central)} {item.rotulo_solto}</div>
                )}
                <button onClick={() => setItem(null)} className="mt-2 text-sm underline text-white/70">trocar item</button>
              </div>
            </div>
            <Contador rotulo={`quanto vai levar, em ${item.rotulo_solto}`} valor={qtd} incremento={1} destaque onMudar={setQtd} />
            <button
              onClick={adicionar}
              disabled={qtd <= 0}
              className="w-full h-16 rounded-2xl bg-emerald-500 disabled:opacity-40 text-black font-black text-xl flex items-center justify-center gap-2"
            >
              <Plus className="w-6 h-6" /> Adicionar à lista
            </button>
          </>
        )}

        {lista.length > 0 && (
          <div className="pt-3 space-y-2">
            <div className="text-sm font-bold uppercase tracking-widest text-white/60">
              Na lista ({totalItens})
            </div>
            {lista.map((l) => (
              <div key={l.item.item_id} className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center gap-3">
                <Foto i={l.item} tamanho="sm" />
                <div className="flex-1 min-w-0">
                  <div className="font-bold truncate">{l.item.nome}</div>
                  <div className="text-xs text-white/50">{fmt(l.quantidade)} {l.item.rotulo_solto}</div>
                </div>
                <button
                  onClick={() => remover(l.item.item_id)}
                  className="w-12 h-12 rounded-xl bg-red-500/15 text-red-200 flex items-center justify-center active:bg-red-500/30"
                  aria-label={`remover ${l.item.nome}`}
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {erro && <div className="rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 px-4 py-3">{erro}</div>}
      </div>

      <div className="px-4 pb-6 pt-2 max-w-lg w-full mx-auto">
        <button
          onClick={transferir}
          disabled={ocupado || lista.length === 0}
          className="w-full h-20 rounded-3xl bg-[#D4AF37] disabled:opacity-50 text-black font-black text-2xl flex items-center justify-center gap-3"
        >
          {ocupado ? <Loader className="w-7 h-7 animate-spin" /> : <Check className="w-8 h-8" />}
          TRANSFERIR {totalItens} {totalItens === 1 ? 'ITEM' : 'ITENS'}
        </button>
      </div>
    </div>
  );
};

export default Transferir;
