import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, Check, Loader, Minus, Plus } from 'lucide-react';
import { betaApi, emojiDaCategoria, fmt, type Abertura, type ItemMontagem } from './api';

interface Props {
  abertura: Abertura;
  onAtualizar: (itens: ItemMontagem[]) => void;
  onTerminou: () => void;
  onVoltar: () => void;
}

/**
 * Um item por tela. A pessoa só responde "quanto tem?" e aperta o botão
 * grande. Nada de lista, nada de busca, nada de decisão.
 */
const Montar: React.FC<Props> = ({ abertura, onAtualizar, onTerminou, onVoltar }) => {
  const paraContar = useMemo(
    () => abertura.itens.filter((i) => i.precisa_contar),
    [abertura.itens],
  );

  const primeiroPendente = Math.max(0, paraContar.findIndex((i) => !i.contado_em));
  const [pos, setPos] = useState(primeiroPendente === -1 ? 0 : primeiroPendente);
  const item = paraContar[pos];

  const [fechados, setFechados] = useState<number>(item?.fechados ?? 0);
  const [soltos, setSoltos] = useState<number>(item?.soltos ?? 0);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const fotoRef = useRef<HTMLInputElement>(null);

  const contados = paraContar.filter((i) => i.contado_em).length;
  const temFechado = !!item?.rotulo_fechado && !!item?.fator_fechado;
  const passo = item?.permite_fracao ? 0.1 : 1;
  const total = temFechado ? fechados * (item.fator_fechado || 0) + soltos : soltos;

  const irPara = (novaPos: number) => {
    const alvo = paraContar[novaPos];
    if (!alvo) return;
    setPos(novaPos);
    setFechados(alvo.fechados ?? 0);
    setSoltos(alvo.soltos ?? 0);
    setErro(null);
  };

  const gravar = async (valorFechados: number, valorSoltos: number) => {
    if (!item) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await betaApi.contar(
        abertura.montagem.id,
        item.item_id,
        temFechado ? valorFechados : null,
        valorSoltos,
      );
      const novos = abertura.itens.map((i) =>
        i.item_id === item.item_id
          ? {
              ...i,
              fechados: temFechado ? valorFechados : null,
              soltos: valorSoltos,
              contado: r.contado,
              levar: r.levar,
              contado_em: new Date().toISOString(),
            }
          : i,
      );
      onAtualizar(novos);

      const proximo = paraContar.findIndex((i, idx) => idx > pos && !novos.find((n) => n.item_id === i.item_id)?.contado_em);
      const restante = novos.filter((i) => i.precisa_contar && !i.contado_em).length;

      if (restante === 0) {
        onTerminou();
      } else if (proximo >= 0) {
        irPara(proximo);
      } else {
        const primeiro = paraContar.findIndex((i) => !novos.find((n) => n.item_id === i.item_id)?.contado_em);
        irPara(primeiro >= 0 ? primeiro : pos);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui gravar. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  };

  const enviarFoto = async (arquivo: File | null) => {
    if (!arquivo || !item) return;
    setEnviandoFoto(true);
    try {
      const url = await betaApi.fotoItem(item.item_id, arquivo);
      onAtualizar(abertura.itens.map((i) => (i.item_id === item.item_id ? { ...i, foto_url: url } : i)));
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui enviar a foto.');
    } finally {
      setEnviandoFoto(false);
    }
  };

  if (!item) {
    return (
      <div className="min-h-screen flex items-center justify-center text-white/70 p-8 text-center text-xl">
        Este balcão não tem nada para contar hoje.
        <button onClick={onVoltar} className="block mx-auto mt-6 underline">Voltar</button>
      </div>
    );
  }

  const ajustar = (qual: 'fechados' | 'soltos', delta: number) => {
    if (qual === 'fechados') setFechados((v) => Math.max(0, Math.round((v + delta) * 100) / 100));
    else setSoltos((v) => Math.max(0, Math.round((v + delta) * 100) / 100));
  };

  const Contador = ({
    rotulo,
    valor,
    onMais,
    onMenos,
    onDigitar,
    incremento,
    destaque,
  }: {
    rotulo: string;
    valor: number;
    onMais: () => void;
    onMenos: () => void;
    onDigitar: (v: number) => void;
    incremento: number;
    destaque: boolean;
  }) => (
    <div className={`rounded-3xl p-4 ${destaque ? 'bg-white/10 border-2 border-[#D4AF37]' : 'bg-white/5 border border-white/10'}`}>
      <div className="text-center text-sm font-bold uppercase tracking-widest text-white/60 mb-2">{rotulo}</div>
      <div className="flex items-center justify-between gap-3">
        <button
          onClick={onMenos}
          className="w-20 h-20 rounded-2xl bg-white/10 active:bg-white/20 flex items-center justify-center text-white"
          aria-label="menos"
        >
          <Minus className="w-10 h-10" />
        </button>
        <input
          type="number"
          inputMode="decimal"
          step={incremento}
          min={0}
          value={valor}
          onChange={(e) => onDigitar(Math.max(0, Number(e.target.value) || 0))}
          onFocus={(e) => e.target.select()}
          className="flex-1 min-w-0 text-center bg-transparent text-white font-black text-6xl outline-none"
        />
        <button
          onClick={onMais}
          className="w-20 h-20 rounded-2xl bg-[#D4AF37] active:bg-[#C5A028] flex items-center justify-center text-black"
          aria-label="mais"
        >
          <Plus className="w-10 h-10" />
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#0d0f1a' }}>
      {/* Topo: progresso */}
      <div className="px-4 pt-4 pb-2">
        <div className="flex items-center justify-between text-white/70 text-sm mb-2">
          <button onClick={onVoltar} className="flex items-center gap-1 py-2 pr-3">
            <ArrowLeft className="w-5 h-5" /> {abertura.estoque.nome}
          </button>
          <span className="font-bold text-white">
            {contados} de {paraContar.length}
          </span>
        </div>
        <div className="h-3 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-[#D4AF37] to-[#7d1f2c] transition-all"
            style={{ width: `${paraContar.length ? (contados / paraContar.length) * 100 : 0}%` }}
          />
        </div>
      </div>

      {/* Item */}
      <div className="flex-1 px-4 py-3 flex flex-col gap-4 max-w-lg w-full mx-auto">
        <div className="rounded-3xl overflow-hidden bg-white/5 border border-white/10">
          <div className="relative h-52 bg-black/30 flex items-center justify-center">
            {item.foto_url ? (
              <img src={item.foto_url} alt={item.nome} className="w-full h-full object-cover" />
            ) : (
              <span className="text-8xl">{emojiDaCategoria(item.categoria)}</span>
            )}
            <button
              onClick={() => fotoRef.current?.click()}
              disabled={enviandoFoto}
              className="absolute bottom-3 right-3 px-3 py-2 rounded-xl bg-black/60 text-white text-xs flex items-center gap-1"
            >
              {enviandoFoto ? <Loader className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
              {item.foto_url ? 'trocar foto' : 'tirar foto'}
            </button>
            <input
              ref={fotoRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => enviarFoto(e.target.files?.[0] || null)}
            />
            {item.contado_em && (
              <span className="absolute top-3 left-3 px-2 py-1 rounded-lg bg-emerald-500/90 text-black text-xs font-bold flex items-center gap-1">
                <Check className="w-3 h-3" /> já contado
              </span>
            )}
          </div>
          <div className="p-4">
            <div className="text-white font-black text-2xl leading-tight">{item.nome}</div>
            <div className="text-white/50 text-sm mt-1">{item.categoria}</div>
            {item.dica && (
              <div className="mt-3 px-3 py-2 rounded-xl bg-[#D4AF37]/15 text-[#D4AF37] text-sm font-semibold">
                {item.dica}
              </div>
            )}
          </div>
        </div>

        <div className="text-center text-white text-2xl font-black">Quanto tem aqui?</div>

        {temFechado && (
          <Contador
            rotulo={`${item.rotulo_fechado} fechada(s) · 1 = ${fmt(item.fator_fechado)} ${item.rotulo_solto}`}
            valor={fechados}
            onMais={() => ajustar('fechados', 1)}
            onMenos={() => ajustar('fechados', -1)}
            onDigitar={setFechados}
            incremento={1}
            destaque
          />
        )}

        <Contador
          rotulo={temFechado ? `${item.rotulo_solto} solto(s)` : item.rotulo_solto}
          valor={soltos}
          onMais={() => ajustar('soltos', passo)}
          onMenos={() => ajustar('soltos', -passo)}
          onDigitar={setSoltos}
          incremento={passo}
          destaque={!temFechado}
        />

        {item.permite_fracao && (
          <div className="text-center text-white/50 text-sm -mt-2">
            Garrafa aberta conta em décimos: metade é 0,5
          </div>
        )}

        {temFechado && (
          <div className="text-center text-white/70 text-lg">
            = <span className="text-white font-black text-2xl">{fmt(total)}</span> {item.rotulo_solto}
          </div>
        )}

        {erro && (
          <div className="rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 px-4 py-3 text-center">
            {erro}
          </div>
        )}
      </div>

      {/* Botões */}
      <div className="px-4 pb-6 pt-2 max-w-lg w-full mx-auto flex flex-col gap-3">
        <button
          onClick={() => gravar(temFechado ? fechados : 0, soltos)}
          disabled={salvando}
          className="w-full h-20 rounded-3xl bg-emerald-500 active:bg-emerald-600 disabled:opacity-60 text-black font-black text-2xl flex items-center justify-center gap-3"
        >
          {salvando ? <Loader className="w-7 h-7 animate-spin" /> : <Check className="w-8 h-8" />}
          {contados + (item.contado_em ? 0 : 1) >= paraContar.length ? 'TERMINAR' : 'PRÓXIMO'}
        </button>
        <div className="flex gap-3">
          <button
            onClick={() => gravar(0, 0)}
            disabled={salvando}
            className="flex-1 h-14 rounded-2xl bg-white/10 text-white/80 font-bold"
          >
            Não tem nenhum
          </button>
          <button
            onClick={() => irPara(pos - 1)}
            disabled={pos === 0}
            className="px-5 h-14 rounded-2xl bg-white/5 text-white/60 disabled:opacity-30"
          >
            anterior
          </button>
        </div>
      </div>
    </div>
  );
};

export default Montar;
