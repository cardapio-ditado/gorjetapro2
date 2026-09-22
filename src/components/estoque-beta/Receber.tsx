import React, { useMemo, useRef, useState } from 'react';
import { ArrowLeft, Camera, Check, Loader, Search, SkipForward, Sparkles, X } from 'lucide-react';
import { betaApi, emojiDaCategoria, fmt, moeda, type ItemBusca, type LinhaNota, type Preparo } from './api';
import Contador from './Contador';

interface Props {
  onVoltar: () => void;
}

type Etapa = 'foto' | 'lendo' | 'fornecedor' | 'linhas' | 'resumo' | 'pronto';

interface LinhaDecidida extends LinhaNota {
  item: ItemBusca | null;      // item escolhido (null = pulada)
  quantidade_final: number;    // na unidade do item
  custo_final: number;         // por unidade do item
  decidida: boolean;
}

/**
 * Receber mercadoria: foto da nota, a IA lê, a pessoa confirma linha por
 * linha ("é este item?", "quanto veio?") e no fim dá entrada de uma vez.
 */
const Receber: React.FC<Props> = ({ onVoltar }) => {
  const [etapa, setEtapa] = useState<Etapa>('foto');
  const [erro, setErro] = useState<string | null>(null);
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [nota, setNota] = useState<Awaited<ReturnType<typeof betaApi.lerNota>> | null>(null);
  const [preparo, setPreparo] = useState<Preparo | null>(null);
  const [fornecedorId, setFornecedorId] = useState<string | null>(null);
  const [fornecedorNome, setFornecedorNome] = useState('');
  const [linhas, setLinhas] = useState<LinhaDecidida[]>([]);
  const [pos, setPos] = useState(0);
  const [buscando, setBuscando] = useState(false);
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<ItemBusca[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [resultado, setResultado] = useState<{ itens: number; valor_total: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const linha = linhas[pos];
  const decididas = linhas.filter((l) => l.decidida).length;

  const lerArquivo = async (f: File | null) => {
    if (!f) return;
    setArquivo(f);
    setErro(null);
    setEtapa('lendo');
    try {
      const lida = await betaApi.lerNota(f);
      if (!lida.itens.length) throw new Error('Não achei itens na nota. Tente uma foto mais nítida.');
      setNota(lida);
      const p = await betaApi.receberPreparar(lida.itens, { nome: lida.emitente?.nome ?? null, cnpj: lida.emitente?.cnpj ?? null });
      setPreparo(p);
      setFornecedorId(p.fornecedor?.id ?? null);
      setFornecedorNome(p.fornecedor?.nome ?? lida.emitente?.nome ?? '');
      setLinhas(
        p.linhas.map((l) => ({
          ...l,
          item: l.sugestao,
          quantidade_final: l.quantidade ?? 0,
          custo_final: l.valor_unitario ?? (l.sugestao?.custo_medio ?? 0),
          decidida: false,
        })),
      );
      setPos(0);
      setEtapa('fornecedor');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao ler a nota');
      setEtapa('foto');
    }
  };

  const mudarLinha = (indice: number, mudanca: Partial<LinhaDecidida>) => {
    setLinhas((atual) => atual.map((l, i) => (i === indice ? { ...l, ...mudanca } : l)));
  };

  const proxima = () => {
    setBuscando(false);
    setTermo('');
    setResultados([]);
    const seguinte = linhas.findIndex((l, i) => i > pos && !l.decidida);
    if (seguinte >= 0) setPos(seguinte);
    else {
      const primeira = linhas.findIndex((l) => !l.decidida);
      if (primeira >= 0 && primeira !== pos) setPos(primeira);
      else setEtapa('resumo');
    }
  };

  const confirmarLinha = () => {
    if (!linha) return;
    mudarLinha(pos, { decidida: true });
    // usa o estado já atualizado na próxima renderização
    setTimeout(proxima, 0);
  };

  const pularLinha = () => {
    if (!linha) return;
    mudarLinha(pos, { decidida: true, item: null });
    setTimeout(proxima, 0);
  };

  const buscar = async (t: string) => {
    setTermo(t);
    if (t.trim().length < 2) {
      setResultados([]);
      return;
    }
    try {
      setResultados(await betaApi.buscarItem(t, null));
    } catch {
      setResultados([]);
    }
  };

  const escolher = (item: ItemBusca) => {
    mudarLinha(pos, { item, custo_final: linha?.valor_unitario ?? item.custo_medio });
    setBuscando(false);
    setTermo('');
    setResultados([]);
  };

  const total = useMemo(
    () => linhas.filter((l) => l.item && l.decidida).reduce((s, l) => s + l.quantidade_final * l.custo_final, 0),
    [linhas],
  );

  const concluir = async () => {
    setOcupado(true);
    setErro(null);
    try {
      const itens = linhas
        .filter((l) => l.item && l.decidida && l.quantidade_final > 0)
        .map((l) => ({ item_id: l.item!.item_id, quantidade: l.quantidade_final, custo_unitario: l.custo_final }));
      const r = await betaApi.receberConcluir({
        fornecedor_id: fornecedorId,
        fornecedor_nome: fornecedorId ? null : fornecedorNome.trim() || null,
        cnpj: nota?.emitente?.cnpj ?? null,
        numero_documento: nota?.documento?.numero ?? null,
        data_compra: nota?.documento?.data_emissao ?? null,
        arquivo_url: nota?.arquivo_url ?? null,
        itens,
      });
      setResultado({ itens: r.itens, valor_total: r.valor_total });
      setEtapa('pronto');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao dar entrada');
    } finally {
      setOcupado(false);
    }
  };

  const Cabecalho = ({ titulo, sub }: { titulo: string; sub?: string }) => (
    <div className="px-4 pt-4 pb-3 border-b border-white/10">
      <button onClick={onVoltar} className="flex items-center gap-1 text-white/70 py-2">
        <ArrowLeft className="w-5 h-5" /> Mapa
      </button>
      <h1 className="font-black text-3xl mt-1 text-white">{titulo}</h1>
      {sub && <p className="text-white/60">{sub}</p>}
    </div>
  );

  // ----------------------------------------------------------------------
  if (etapa === 'foto' || etapa === 'lendo') {
    return (
      <div className="min-h-screen flex flex-col text-white" style={{ background: '#0d0f1a' }}>
        <Cabecalho titulo="Receber mercadoria" sub="Tire uma foto da nota. A IA lê e você só confirma." />
        <div className="flex-1 flex flex-col items-center justify-center p-6 gap-6">
          {etapa === 'lendo' ? (
            <>
              <Loader className="w-16 h-16 animate-spin text-[#D4AF37]" />
              <div className="text-2xl font-black">Lendo a nota...</div>
              <div className="text-white/50">{arquivo?.name}</div>
            </>
          ) : (
            <>
              <button
                onClick={() => inputRef.current?.click()}
                className="w-full max-w-sm h-44 rounded-3xl bg-[#D4AF37] text-black font-black text-2xl flex flex-col items-center justify-center gap-3 active:scale-[0.98]"
              >
                <Camera className="w-14 h-14" />
                FOTOGRAFAR A NOTA
              </button>
              <button onClick={() => inputRef.current?.click()} className="text-white/60 underline">
                ou escolher um PDF ou foto da galeria
              </button>
              <input
                ref={inputRef}
                type="file"
                accept="image/*,application/pdf"
                capture="environment"
                className="hidden"
                onChange={(e) => lerArquivo(e.target.files?.[0] || null)}
              />
              {erro && <div className="rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 px-4 py-3 text-center">{erro}</div>}
            </>
          )}
        </div>
      </div>
    );
  }

  if (etapa === 'fornecedor' && preparo) {
    return (
      <div className="min-h-screen flex flex-col text-white" style={{ background: '#0d0f1a' }}>
        <Cabecalho titulo="De quem é a nota?" sub={nota?.emitente?.nome ? `A nota diz: ${nota.emitente.nome}` : undefined} />
        <div className="flex-1 p-4 space-y-3 max-w-lg w-full mx-auto">
          {preparo.fornecedor && (
            <button
              onClick={() => { setFornecedorId(preparo.fornecedor!.id); setFornecedorNome(preparo.fornecedor!.nome); setEtapa('linhas'); }}
              className="w-full rounded-2xl p-5 bg-emerald-500/15 border-2 border-emerald-500/60 text-left"
            >
              <div className="text-xs uppercase text-emerald-300 font-bold flex items-center gap-1"><Sparkles className="w-3 h-3" /> reconhecido</div>
              <div className="font-black text-2xl">{preparo.fornecedor.nome}</div>
              <div className="text-white/60 text-sm mt-1">Toque para confirmar</div>
            </button>
          )}
          {preparo.fornecedor_opcoes.filter((o) => o.id !== preparo.fornecedor?.id).map((o) => (
            <button
              key={o.id}
              onClick={() => { setFornecedorId(o.id); setFornecedorNome(o.nome); setEtapa('linhas'); }}
              className="w-full rounded-2xl p-4 bg-white/5 border border-white/10 text-left font-bold text-lg"
            >
              {o.nome}
            </button>
          ))}
          <div className="rounded-2xl p-4 bg-white/5 border border-white/10">
            <div className="text-xs uppercase text-white/40 font-bold mb-2">Fornecedor novo</div>
            <input
              value={fornecedorId ? '' : fornecedorNome}
              onChange={(e) => { setFornecedorId(null); setFornecedorNome(e.target.value); }}
              placeholder="Nome do fornecedor"
              className="w-full px-4 py-3 rounded-xl bg-white/10 border border-white/10 text-white text-lg"
            />
            <button
              onClick={() => setEtapa('linhas')}
              disabled={!fornecedorNome.trim()}
              className="mt-3 w-full h-14 rounded-xl bg-white/10 text-white font-bold disabled:opacity-40"
            >
              Cadastrar e continuar
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (etapa === 'linhas' && linha) {
    const item = linha.item;
    return (
      <div className="min-h-screen flex flex-col text-white" style={{ background: '#0d0f1a' }}>
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between text-white/70 text-sm mb-2">
            <button onClick={() => setEtapa('resumo')} className="py-2 pr-3">ver resumo</button>
            <span className="font-bold text-white">{decididas} de {linhas.length}</span>
          </div>
          <div className="h-3 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#D4AF37] to-[#7d1f2c] transition-all" style={{ width: `${(decididas / linhas.length) * 100}%` }} />
          </div>
        </div>

        <div className="flex-1 px-4 py-3 flex flex-col gap-4 max-w-lg w-full mx-auto">
          {/* O que a nota diz */}
          <div className="rounded-2xl bg-white/5 border border-white/10 p-4">
            <div className="text-xs uppercase text-white/40 font-bold">A nota diz</div>
            <div className="font-bold text-lg leading-tight mt-1">{linha.descricao}</div>
            <div className="text-white/60 text-sm mt-1">
              {fmt(linha.quantidade)} {linha.unidade || ''} · {moeda(linha.valor_unitario)} cada · {moeda(linha.valor_total)}
            </div>
          </div>

          {/* Item sugerido / escolhido */}
          {buscando ? (
            <div className="rounded-3xl bg-white/5 border border-white/10 p-4 space-y-3">
              <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3">
                <Search className="w-5 h-5 text-white/40" />
                <input
                  autoFocus
                  value={termo}
                  onChange={(e) => buscar(e.target.value)}
                  placeholder="Digite o nome do item"
                  className="flex-1 bg-transparent py-3 text-white text-lg outline-none"
                />
                <button onClick={() => setBuscando(false)}><X className="w-5 h-5 text-white/40" /></button>
              </div>
              {(resultados.length ? resultados : linha.opcoes).map((r) => (
                <button key={r.item_id} onClick={() => escolher(r)} className="w-full flex items-center gap-3 rounded-xl bg-white/5 p-3 text-left">
                  <div className="w-12 h-12 rounded-lg bg-black/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                    {r.foto_url ? <img src={r.foto_url} alt="" className="w-full h-full object-cover" /> : <span className="text-2xl">{emojiDaCategoria(r.categoria)}</span>}
                  </div>
                  <div className="min-w-0">
                    <div className="font-bold truncate">{r.nome}</div>
                    <div className="text-xs text-white/50">{r.categoria} · {r.rotulo_solto}</div>
                  </div>
                </button>
              ))}
            </div>
          ) : item ? (
            <div className="rounded-3xl overflow-hidden bg-white/5 border-2 border-[#D4AF37]">
              <div className="h-40 bg-black/30 flex items-center justify-center">
                {item.foto_url ? <img src={item.foto_url} alt={item.nome} className="w-full h-full object-cover" /> : <span className="text-7xl">{emojiDaCategoria(item.categoria)}</span>}
              </div>
              <div className="p-4">
                <div className="text-xs uppercase text-[#D4AF37] font-bold">É este item?</div>
                <div className="font-black text-2xl leading-tight">{item.nome}</div>
                <div className="text-white/50 text-sm">{item.categoria} · conta em {item.rotulo_solto}</div>
                <button onClick={() => setBuscando(true)} className="mt-3 text-sm underline text-white/70">Não, é outro item</button>
              </div>
            </div>
          ) : (
            <div className="rounded-3xl bg-white/5 border border-white/10 p-5 text-center">
              <div className="text-white/70">Não reconheci este item.</div>
              <button onClick={() => setBuscando(true)} className="mt-3 px-5 h-12 rounded-xl bg-[#D4AF37] text-black font-bold">Escolher o item</button>
            </div>
          )}

          {item && !buscando && (
            <>
              <Contador
                rotulo={`quanto veio, em ${item.rotulo_solto}`}
                valor={linha.quantidade_final}
                incremento={1}
                destaque
                onMudar={(v) => mudarLinha(pos, { quantidade_final: v })}
              />
              {item.rotulo_fechado && item.fator_fechado && (
                <div className="text-center text-white/50 text-sm -mt-2">
                  Se veio em {item.rotulo_fechado}, multiplique: 1 {item.rotulo_fechado} = {fmt(item.fator_fechado)} {item.rotulo_solto}
                </div>
              )}
              <div className="flex items-center justify-between rounded-2xl bg-white/5 border border-white/10 px-4 py-3">
                <span className="text-white/60">preço por {item.rotulo_solto}</span>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={linha.custo_final}
                  onChange={(e) => mudarLinha(pos, { custo_final: Math.max(0, Number(e.target.value) || 0) })}
                  onFocus={(e) => e.target.select()}
                  className="w-28 bg-transparent text-right font-bold text-xl outline-none"
                />
              </div>
            </>
          )}
        </div>

        <div className="px-4 pb-6 pt-2 max-w-lg w-full mx-auto flex flex-col gap-3">
          <button
            onClick={confirmarLinha}
            disabled={!item || buscando || linha.quantidade_final <= 0}
            className="w-full h-20 rounded-3xl bg-emerald-500 disabled:opacity-40 text-black font-black text-2xl flex items-center justify-center gap-3"
          >
            <Check className="w-8 h-8" /> CONFIRMAR
          </button>
          <button onClick={pularLinha} className="h-12 rounded-2xl bg-white/5 text-white/60 flex items-center justify-center gap-2">
            <SkipForward className="w-4 h-4" /> pular esta linha
          </button>
        </div>
      </div>
    );
  }

  if (etapa === 'resumo') {
    const validas = linhas.filter((l) => l.item && l.decidida && l.quantidade_final > 0);
    const puladas = linhas.filter((l) => l.decidida && !l.item).length;
    const pendentes = linhas.filter((l) => !l.decidida).length;
    return (
      <div className="min-h-screen flex flex-col text-white" style={{ background: '#0d0f1a' }}>
        <Cabecalho titulo="Confira e dê entrada" sub={fornecedorNome} />
        <div className="flex-1 p-4 space-y-2 max-w-lg w-full mx-auto">
          {validas.map((l) => (
            <div key={l.indice} className="rounded-xl bg-white/5 border border-white/10 p-3 flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-black/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                {l.item?.foto_url ? <img src={l.item.foto_url} alt="" className="w-full h-full object-cover" /> : <span className="text-xl">{emojiDaCategoria(l.item?.categoria)}</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-bold truncate">{l.item?.nome}</div>
                <div className="text-xs text-white/50">{fmt(l.quantidade_final)} {l.item?.rotulo_solto} · {moeda(l.custo_final)}</div>
              </div>
              <div className="font-bold">{moeda(l.quantidade_final * l.custo_final)}</div>
            </div>
          ))}
          {(puladas > 0 || pendentes > 0) && (
            <div className="text-sm text-amber-300 px-1">
              {puladas > 0 && `${puladas} linha(s) puladas. `}
              {pendentes > 0 && (
                <button onClick={() => { setPos(linhas.findIndex((l) => !l.decidida)); setEtapa('linhas'); }} className="underline">
                  {pendentes} ainda sem decisão, voltar
                </button>
              )}
            </div>
          )}
          <div className="flex items-center justify-between text-xl font-black pt-3 border-t border-white/10">
            <span>Total</span><span>{moeda(total)}</span>
          </div>
          {erro && <div className="rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 px-4 py-3">{erro}</div>}
        </div>
        <div className="px-4 pb-6 pt-2 max-w-lg w-full mx-auto">
          <button
            onClick={concluir}
            disabled={ocupado || validas.length === 0}
            className="w-full h-20 rounded-3xl bg-[#D4AF37] disabled:opacity-50 text-black font-black text-2xl flex items-center justify-center gap-3"
          >
            {ocupado ? <Loader className="w-7 h-7 animate-spin" /> : <Check className="w-8 h-8" />}
            DAR ENTRADA
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center text-white text-center p-8" style={{ background: '#0d0f1a' }}>
      <div className="text-8xl mb-4">📦</div>
      <h1 className="font-black text-4xl">Entrada feita!</h1>
      <p className="text-white/60 mt-2 text-lg">
        {resultado ? `${resultado.itens} itens, ${moeda(resultado.valor_total)}, já no Central.` : ''}
      </p>
      <button onClick={onVoltar} className="mt-8 px-10 h-16 rounded-2xl bg-white/10 text-white font-bold text-xl">Voltar ao mapa</button>
    </div>
  );
};

export default Receber;
