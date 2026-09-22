import React, { useEffect, useState } from 'react';
import { ArrowLeft, Check, Loader, Search } from 'lucide-react';
import { betaApi, emojiDaCategoria, fmt, type Balcao, type ItemBusca } from './api';
import Contador from './Contador';

interface Props {
  balcao: Balcao;
  responsavel: string | null;
  onVoltar: () => void;
}

/** Acabou algo no meio do turno: escolhe o item, a quantidade, e pronto. */
const PedirMais: React.FC<Props> = ({ balcao, responsavel, onVoltar }) => {
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<ItemBusca[]>([]);
  const [item, setItem] = useState<ItemBusca | null>(null);
  const [qtd, setQtd] = useState(1);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState<{ nome: string; qtd: number } | null>(null);

  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      try {
        const r = await betaApi.buscarItem(termo, balcao.id);
        if (vivo) setResultados(r);
      } catch {
        if (vivo) setResultados([]);
      }
    }, 200);
    return () => { vivo = false; clearTimeout(t); };
  }, [termo, balcao.id]);

  const levar = async () => {
    if (!item) return;
    setOcupado(true);
    setErro(null);
    try {
      await betaApi.pedirMais(balcao.id, item.item_id, qtd, responsavel);
      setFeito({ nome: item.nome, qtd });
      setItem(null);
      setQtd(1);
      setTermo('');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao registrar');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col text-white" style={{ background: '#0d0f1a' }}>
      <div className="px-4 pt-4 pb-3 border-b border-white/10">
        <button onClick={onVoltar} className="flex items-center gap-1 text-white/70 py-2">
          <ArrowLeft className="w-5 h-5" /> Mapa
        </button>
        <h1 className="font-black text-3xl mt-1">Pedir mais para o {balcao.nome}</h1>
        <p className="text-white/60">Acabou algo? Escolha o item e quanto vai levar do Central.</p>
      </div>

      {feito && (
        <div className="mx-4 mt-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 px-4 py-3 flex items-center gap-2">
          <Check className="w-5 h-5" /> {fmt(feito.qtd)} de {feito.nome} levados para o {balcao.nome}.
        </div>
      )}

      <div className="flex-1 p-4 space-y-3 max-w-lg w-full mx-auto">
        {!item ? (
          <>
            <div className="flex items-center gap-2 bg-white/10 rounded-2xl px-4">
              <Search className="w-6 h-6 text-white/40" />
              <input
                autoFocus
                value={termo}
                onChange={(e) => setTermo(e.target.value)}
                placeholder="O que acabou?"
                className="flex-1 bg-transparent py-4 text-white text-xl outline-none"
              />
            </div>
            {resultados.map((r) => (
              <button key={r.item_id} onClick={() => setItem(r)} className="w-full flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 p-3 text-left active:bg-white/10">
                <div className="w-14 h-14 rounded-xl bg-black/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {r.foto_url ? <img src={r.foto_url} alt="" className="w-full h-full object-cover" /> : <span className="text-3xl">{emojiDaCategoria(r.categoria)}</span>}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-lg truncate">{r.nome}</div>
                  <div className="text-xs text-white/50">
                    Central tem {fmt(r.saldo_central)} {r.rotulo_solto}
                    {r.no_balcao && <span className="ml-2 text-[#D4AF37]">· é deste balcão</span>}
                  </div>
                </div>
              </button>
            ))}
          </>
        ) : (
          <>
            <div className="rounded-3xl overflow-hidden bg-white/5 border-2 border-[#D4AF37]">
              <div className="h-40 bg-black/30 flex items-center justify-center">
                {item.foto_url ? <img src={item.foto_url} alt={item.nome} className="w-full h-full object-cover" /> : <span className="text-7xl">{emojiDaCategoria(item.categoria)}</span>}
              </div>
              <div className="p-4">
                <div className="font-black text-2xl leading-tight">{item.nome}</div>
                <div className="text-white/50 text-sm">Central tem {fmt(item.saldo_central)} {item.rotulo_solto}</div>
                <button onClick={() => setItem(null)} className="mt-2 text-sm underline text-white/70">trocar item</button>
              </div>
            </div>
            <Contador rotulo={`quanto vai levar, em ${item.rotulo_solto}`} valor={qtd} incremento={1} destaque onMudar={setQtd} />
            {erro && <div className="rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 px-4 py-3">{erro}</div>}
          </>
        )}
      </div>

      {item && (
        <div className="px-4 pb-6 pt-2 max-w-lg w-full mx-auto">
          <button
            onClick={levar}
            disabled={ocupado || qtd <= 0}
            className="w-full h-20 rounded-3xl bg-[#D4AF37] disabled:opacity-50 text-black font-black text-2xl flex items-center justify-center gap-3"
          >
            {ocupado ? <Loader className="w-7 h-7 animate-spin" /> : <Check className="w-8 h-8" />}
            LEVEI
          </button>
        </div>
      )}
    </div>
  );
};

export default PedirMais;
