import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Check, ChefHat, Loader, Plus, Search } from 'lucide-react';
import { fmt, moeda } from './api';
import { consultasApi, type EstoqueRef, type FichaProducao } from './apiConsultas';
import Contador from './Contador';

interface Props {
  responsavel: string | null;
  onVoltar: () => void;
}

interface Resultado {
  ficha: string;
  vezes: number;
  insumos_baixados: number;
  custo_total_insumos: number;
}

/**
 * Produzir: escolhe a ficha, diz quantas vezes vai fazer, confere os
 * insumos e manda. A função baixa os insumos e dá entrada no produto.
 */
const Produzir: React.FC<Props> = ({ responsavel, onVoltar }) => {
  const [fichas, setFichas] = useState<FichaProducao[]>([]);
  const [estoques, setEstoques] = useState<EstoqueRef[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [termo, setTermo] = useState('');
  const [ficha, setFicha] = useState<FichaProducao | null>(null);
  const [vezes, setVezes] = useState(1);
  const [origemId, setOrigemId] = useState<string | null>(null);
  const [destinoId, setDestinoId] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([consultasApi.fichasProducao(), consultasApi.estoques()])
      .then(([f, e]) => {
        if (!vivo) return;
        setFichas(f);
        setEstoques(e);
        const central = e.find((x) => x.tipo === 'central') ?? e[0] ?? null;
        const producao = e.find((x) => x.tipo === 'producao') ?? central;
        setOrigemId(central?.id ?? null);
        setDestinoId(producao?.id ?? null);
      })
      .catch((e: unknown) => { if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao carregar fichas'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, []);

  const fichasFiltradas = useMemo(() => {
    const t = termo.trim().toLowerCase();
    if (!t) return fichas;
    return fichas.filter((f) => f.nome.toLowerCase().includes(t) || f.item_nome.toLowerCase().includes(t));
  }, [fichas, termo]);

  const nomeEstoque = (id: string | null) => estoques.find((e) => e.id === id)?.nome ?? '';

  const produzir = async () => {
    if (!ficha || !origemId || !destinoId || vezes <= 0) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await consultasApi.produzir(ficha.ficha_id, vezes, destinoId, origemId, responsavel);
      setResultado({
        ficha: ficha.nome,
        vezes,
        insumos_baixados: r.insumos_baixados ?? 0,
        custo_total_insumos: r.custo_total_insumos ?? 0,
      });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao produzir');
    } finally {
      setOcupado(false);
    }
  };

  const outra = () => {
    setResultado(null);
    setFicha(null);
    setVezes(1);
    setTermo('');
    setErro(null);
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

  const Chips = ({ rotulo, valor, onEscolher }: { rotulo: string; valor: string | null; onEscolher: (id: string) => void }) => (
    <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
      <div className="text-sm font-bold uppercase tracking-widest text-white/60 mb-3">{rotulo}</div>
      <div className="flex flex-wrap gap-2">
        {estoques.map((e) => {
          const ativo = valor === e.id;
          return (
            <button
              key={e.id}
              onClick={() => onEscolher(e.id)}
              className={`px-5 h-14 rounded-2xl font-bold text-lg border-2 ${
                ativo ? 'bg-[#D4AF37] text-black border-[#D4AF37]' : 'bg-white/5 text-white border-white/10 active:bg-white/10'
              }`}
            >
              {e.nome}
            </button>
          );
        })}
      </div>
    </div>
  );

  // ---- sucesso -----------------------------------------------------------
  if (resultado) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-white text-center p-8" style={{ background: '#0d0f1a' }}>
        <div className="text-8xl mb-4">👨‍🍳</div>
        <h1 className="font-black text-4xl">Produzido!</h1>
        <p className="text-white/60 mt-2 text-lg">
          {resultado.ficha} × {fmt(resultado.vezes)}
        </p>
        <p className="text-white/60 mt-1 text-lg">
          {resultado.insumos_baixados} insumos baixados, custo {moeda(resultado.custo_total_insumos)}
        </p>
        <div className="mt-8 w-full max-w-sm flex flex-col gap-3">
          <button
            onClick={outra}
            className="w-full h-20 rounded-3xl bg-[#D4AF37] text-black font-black text-2xl flex items-center justify-center gap-3"
          >
            <Plus className="w-8 h-8" /> Produzir outra
          </button>
          <button onClick={onVoltar} className="w-full h-16 rounded-2xl bg-white/10 text-white font-bold text-xl">
            Voltar
          </button>
        </div>
      </div>
    );
  }

  // ---- passo 1: escolher a ficha -----------------------------------------
  if (!ficha) {
    return (
      <div className="min-h-screen flex flex-col text-white" style={{ background: '#0d0f1a' }}>
        <Cabecalho titulo="Produzir" sub="O que vai fazer hoje?" />
        <div className="flex-1 p-4 space-y-3 max-w-lg w-full mx-auto">
          <div className="flex items-center gap-2 bg-white/10 rounded-2xl px-4">
            <Search className="w-6 h-6 text-white/40" />
            <input
              autoFocus
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Nome da ficha"
              className="flex-1 bg-transparent py-4 text-white text-xl outline-none"
            />
          </div>

          {carregando && (
            <div className="flex items-center justify-center py-10 text-white/50 gap-2">
              <Loader className="w-6 h-6 animate-spin" /> carregando fichas...
            </div>
          )}
          {erro && <div className="rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 px-4 py-3">{erro}</div>}

          {!carregando && fichasFiltradas.length === 0 && !erro && (
            <div className="rounded-2xl bg-white/5 border border-white/10 p-6 text-center text-white/60">
              {fichas.length === 0 ? 'Nenhuma ficha de produção cadastrada.' : 'Nenhuma ficha com esse nome.'}
            </div>
          )}

          {fichasFiltradas.map((f) => (
            <button
              key={f.ficha_id}
              onClick={() => { setFicha(f); setVezes(1); setErro(null); }}
              className="w-full flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 p-4 text-left active:bg-white/10"
            >
              <div className="w-14 h-14 rounded-xl bg-black/30 flex items-center justify-center flex-shrink-0">
                <ChefHat className="w-8 h-8 text-[#D4AF37]" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-black text-xl leading-tight truncate">{f.nome}</div>
                <div className="text-sm text-white/60 truncate">produz: {f.item_nome}</div>
                <div className="text-xs text-white/50">
                  {f.rendimento != null && `rende ${fmt(f.rendimento)} ${f.unidade_rendimento ?? ''} · `}
                  custo {moeda(f.custo_total)}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---- passo 2: quantas vezes, de onde, para onde ------------------------
  const ingredientes = ficha.ingredientes.map((ing, i) => {
    const necessario = ing.quantidade * vezes;
    const saldo = origemId ? (ing.saldos[origemId] ?? 0) : 0;
    return { ...ing, chave: ing.item_id ?? `sem-item-${i}`, necessario, saldo, falta: ing.baixa && saldo < necessario };
  });
  const faltando = ingredientes.filter((ing) => ing.falta).length;

  return (
    <div className="min-h-screen flex flex-col text-white" style={{ background: '#0d0f1a' }}>
      <div className="px-4 pt-4 pb-3 border-b border-white/10">
        <button onClick={() => { setFicha(null); setErro(null); }} className="flex items-center gap-1 text-white/70 py-2">
          <ArrowLeft className="w-5 h-5" /> Fichas
        </button>
        <h1 className="font-black text-3xl mt-1">{ficha.nome}</h1>
        <p className="text-white/60">
          produz: {ficha.item_nome}
          {ficha.rendimento != null && ` · rende ${fmt(ficha.rendimento)} ${ficha.unidade_rendimento ?? ''}`}
        </p>
      </div>

      <div className="flex-1 p-4 space-y-3 max-w-lg w-full mx-auto">
        <Contador rotulo="quantas vezes vai produzir" valor={vezes} incremento={1} destaque onMudar={setVezes} />

        <Chips rotulo="de onde saem os insumos" valor={origemId} onEscolher={setOrigemId} />
        <Chips rotulo="para onde vai o produto" valor={destinoId} onEscolher={setDestinoId} />

        <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-2">
          <div className="text-sm font-bold uppercase tracking-widest text-white/60">
            Insumos {origemId && `· saldo no ${nomeEstoque(origemId)}`}
          </div>
          {ingredientes.length === 0 && <div className="text-white/50">Esta ficha não tem ingredientes.</div>}
          {ingredientes.map((ing) => (
            <div
              key={ing.chave}
              className={`rounded-xl px-3 py-3 flex items-center gap-3 ${
                !ing.baixa
                  ? 'bg-white/5 text-white/40'
                  : ing.falta
                    ? 'bg-red-500/15 border border-red-500/40 text-red-200'
                    : 'bg-white/5'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{ing.nome ?? 'Ingrediente sem item'}</div>
                <div className="text-xs opacity-70">
                  {!ing.baixa ? (
                    'não baixa'
                  ) : ing.falta ? (
                    <span className="flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> vai ficar negativo
                    </span>
                  ) : (
                    `tem ${fmt(ing.saldo)} ${ing.unidade ?? ''}`
                  )}
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="font-black text-lg">{fmt(ing.necessario)} {ing.unidade ?? ''}</div>
                {ing.baixa && ing.falta && <div className="text-xs">tem {fmt(ing.saldo)}</div>}
              </div>
            </div>
          ))}
        </div>

        {faltando > 0 && (
          <div className="text-sm text-amber-300 px-1">
            {faltando} {faltando === 1 ? 'insumo vai ficar negativo' : 'insumos vão ficar negativos'}. Dá para produzir mesmo assim.
          </div>
        )}

        <div className="flex items-center justify-between text-lg font-black pt-2 border-t border-white/10">
          <span>Custo estimado</span>
          <span>{moeda(ficha.custo_total * vezes)}</span>
        </div>

        {erro && <div className="rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 px-4 py-3">{erro}</div>}
      </div>

      <div className="px-4 pb-6 pt-2 max-w-lg w-full mx-auto">
        <button
          onClick={produzir}
          disabled={ocupado || vezes <= 0 || !origemId || !destinoId}
          className="w-full h-20 rounded-3xl bg-[#D4AF37] disabled:opacity-50 text-black font-black text-2xl flex items-center justify-center gap-3"
        >
          {ocupado ? <Loader className="w-7 h-7 animate-spin" /> : <Check className="w-8 h-8" />}
          PRODUZIR
        </button>
      </div>
    </div>
  );
};

export default Produzir;
