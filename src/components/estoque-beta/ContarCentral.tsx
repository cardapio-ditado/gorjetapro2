import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Camera, Check, Loader } from 'lucide-react';
import { betaApi, emojiDaCategoria, fmt, type AberturaCentral, type ItemContagem, type Zona } from './api';
import Contador from './Contador';

interface Props {
  responsavel: string | null;
  onVoltar: () => void;
}

const SITUACAO: Record<Zona['situacao'], { rotulo: string; cor: string }> = {
  em_andamento: { rotulo: 'em andamento', cor: 'bg-[#D4AF37] text-black' },
  atrasada: { rotulo: 'atrasada', cor: 'bg-red-500 text-white' },
  vence_hoje: { rotulo: 'conta hoje', cor: 'bg-[#7d1f2c] text-white' },
  em_dia: { rotulo: 'em dia', cor: 'bg-white/10 text-white/60' },
  feita_hoje: { rotulo: 'feita hoje', cor: 'bg-emerald-500 text-black' },
};

/**
 * Contar o Central por zona. A zona é a categoria do item, que é o que hoje
 * corresponde à área física. Um item por tela; item não contado fica em
 * branco, nunca vira zero.
 */
const ContarCentral: React.FC<Props> = ({ responsavel, onVoltar }) => {
  const [zonas, setZonas] = useState<Zona[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [abertura, setAbertura] = useState<AberturaCentral | null>(null);
  const [pos, setPos] = useState(0);
  const [fechados, setFechados] = useState(0);
  const [soltos, setSoltos] = useState(0);
  const [ocupado, setOcupado] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [resultado, setResultado] = useState<{ ajustes: number; nao_contados: number; zona: string } | null>(null);
  const fotoRef = useRef<HTMLInputElement>(null);

  const carregarZonas = async () => {
    setCarregando(true);
    setErro(null);
    try {
      const r = await betaApi.centralZonas();
      setZonas(r.zonas || []);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregarZonas();
  }, []);

  const abrirZona = async (zona: string) => {
    setOcupado(true);
    setErro(null);
    try {
      const a = await betaApi.centralAbrir(zona, responsavel);
      setAbertura(a);
      const primeiro = a.itens.findIndex((i) => !i.contado_em);
      irPara(a.itens, primeiro >= 0 ? primeiro : 0);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao abrir a zona');
    } finally {
      setOcupado(false);
    }
  };

  const irPara = (itens: ItemContagem[], novaPos: number) => {
    const alvo = itens[novaPos];
    if (!alvo) return;
    setPos(novaPos);
    setFechados(alvo.fechados ?? 0);
    setSoltos(alvo.soltos ?? 0);
  };

  const item = abertura?.itens[pos];
  const temFechado = !!item?.rotulo_fechado && !!item?.fator_fechado;
  const passo = item?.permite_fracao ? 0.1 : 1;
  const contados = abertura?.itens.filter((i) => i.contado_em).length ?? 0;
  const total = abertura?.itens.length ?? 0;

  const gravar = async (vf: number, vs: number, pular = false) => {
    if (!abertura || !item) return;
    setOcupado(true);
    setErro(null);
    try {
      let itens = abertura.itens;
      if (!pular) {
        const r = await betaApi.centralContar(abertura.contagem.id, item.item_id, temFechado ? vf : null, vs);
        itens = itens.map((i) =>
          i.item_id === item.item_id
            ? { ...i, fechados: temFechado ? vf : null, soltos: vs, contado: r.contado, contado_em: new Date().toISOString() }
            : i,
        );
        setAbertura({ ...abertura, itens });
      }
      const proximo = itens.findIndex((i, idx) => idx > pos && !i.contado_em);
      if (proximo >= 0) irPara(itens, proximo);
      else if (pos + 1 < itens.length) irPara(itens, pos + 1);
      else {
        const primeiro = itens.findIndex((i) => !i.contado_em);
        if (primeiro >= 0 && primeiro !== pos) irPara(itens, primeiro);
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui gravar.');
    } finally {
      setOcupado(false);
    }
  };

  const concluir = async () => {
    if (!abertura) return;
    const faltam = total - contados;
    if (faltam > 0 && !window.confirm(`${faltam} item(ns) ficaram sem contar e vão continuar como estão. Fechar mesmo assim?`)) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await betaApi.centralConcluir(abertura.contagem.id);
      setResultado({ ajustes: r.ajustes, nao_contados: r.nao_contados, zona: abertura.contagem.zona });
      setAbertura(null);
      carregarZonas();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao fechar a contagem');
    } finally {
      setOcupado(false);
    }
  };

  const enviarFoto = async (arquivo: File | null) => {
    if (!arquivo || !abertura || !item) return;
    setEnviandoFoto(true);
    try {
      const url = await betaApi.fotoItem(item.item_id, arquivo);
      setAbertura({ ...abertura, itens: abertura.itens.map((i) => (i.item_id === item.item_id ? { ...i, foto_url: url } : i)) });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não consegui enviar a foto.');
    } finally {
      setEnviandoFoto(false);
    }
  };

  // ---------------------------------------------------------------------
  if (abertura && item) {
    const totalContado = temFechado ? fechados * (item.fator_fechado || 0) + soltos : soltos;
    return (
      <div className="min-h-screen flex flex-col text-white" style={{ background: '#0d0f1a' }}>
        <div className="px-4 pt-4 pb-2">
          <div className="flex items-center justify-between text-white/70 text-sm mb-2">
            <button onClick={() => setAbertura(null)} className="flex items-center gap-1 py-2 pr-3">
              <ArrowLeft className="w-5 h-5" /> {abertura.contagem.zona}
            </button>
            <span className="font-bold text-white">{contados} de {total}</span>
          </div>
          <div className="h-3 rounded-full bg-white/10 overflow-hidden">
            <div className="h-full bg-gradient-to-r from-[#D4AF37] to-[#7d1f2c] transition-all" style={{ width: `${total ? (contados / total) * 100 : 0}%` }} />
          </div>
        </div>

        <div className="flex-1 px-4 py-3 flex flex-col gap-4 max-w-lg w-full mx-auto">
          <div className="rounded-3xl overflow-hidden bg-white/5 border border-white/10">
            <div className="relative h-48 bg-black/30 flex items-center justify-center">
              {item.foto_url ? <img src={item.foto_url} alt={item.nome} className="w-full h-full object-cover" /> : <span className="text-8xl">{emojiDaCategoria(item.categoria)}</span>}
              <button onClick={() => fotoRef.current?.click()} disabled={enviandoFoto} className="absolute bottom-3 right-3 px-3 py-2 rounded-xl bg-black/60 text-white text-xs flex items-center gap-1">
                {enviandoFoto ? <Loader className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                {item.foto_url ? 'trocar foto' : 'tirar foto'}
              </button>
              <input ref={fotoRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => enviarFoto(e.target.files?.[0] || null)} />
              {item.contado_em && (
                <span className="absolute top-3 left-3 px-2 py-1 rounded-lg bg-emerald-500/90 text-black text-xs font-bold flex items-center gap-1"><Check className="w-3 h-3" /> já contado</span>
              )}
            </div>
            <div className="p-4">
              <div className="font-black text-2xl leading-tight">{item.nome}</div>
              <div className="text-white/50 text-sm mt-1">{item.categoria}</div>
              {item.dica && <div className="mt-3 px-3 py-2 rounded-xl bg-[#D4AF37]/15 text-[#D4AF37] text-sm font-semibold">{item.dica}</div>}
            </div>
          </div>

          <div className="text-center text-2xl font-black">Quanto tem aqui?</div>

          {temFechado && (
            <Contador
              rotulo={`${item.rotulo_fechado} fechada(s) · 1 = ${fmt(item.fator_fechado)} ${item.rotulo_solto}`}
              valor={fechados}
              incremento={1}
              destaque
              onMudar={setFechados}
            />
          )}
          <Contador
            rotulo={temFechado ? `${item.rotulo_solto} solto(s)` : item.rotulo_solto}
            valor={soltos}
            incremento={passo}
            destaque={!temFechado}
            onMudar={setSoltos}
          />
          {temFechado && (
            <div className="text-center text-white/70 text-lg">= <span className="text-white font-black text-2xl">{fmt(totalContado)}</span> {item.rotulo_solto}</div>
          )}
          {erro && <div className="rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 px-4 py-3 text-center">{erro}</div>}
        </div>

        <div className="px-4 pb-6 pt-2 max-w-lg w-full mx-auto flex flex-col gap-3">
          <button
            onClick={() => gravar(temFechado ? fechados : 0, soltos)}
            disabled={ocupado}
            className="w-full h-20 rounded-3xl bg-emerald-500 disabled:opacity-60 text-black font-black text-2xl flex items-center justify-center gap-3"
          >
            {ocupado ? <Loader className="w-7 h-7 animate-spin" /> : <Check className="w-8 h-8" />}
            PRÓXIMO
          </button>
          <div className="flex gap-3">
            <button onClick={() => gravar(0, 0)} disabled={ocupado} className="flex-1 h-14 rounded-2xl bg-white/10 text-white/80 font-bold">Não tem nenhum</button>
            <button onClick={() => gravar(0, 0, true)} disabled={ocupado} className="flex-1 h-14 rounded-2xl bg-white/5 text-white/60 font-bold">Pular</button>
          </div>
          <button onClick={concluir} disabled={ocupado} className="h-14 rounded-2xl bg-[#D4AF37]/20 text-[#D4AF37] font-bold">
            Fechar a zona {contados < total ? `(${total - contados} sem contar)` : ''}
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  return (
    <div className="min-h-screen text-white" style={{ background: '#0d0f1a' }}>
      <div className="px-4 pt-4 pb-3 border-b border-white/10">
        <button onClick={onVoltar} className="flex items-center gap-1 text-white/70 py-2">
          <ArrowLeft className="w-5 h-5" /> Mapa
        </button>
        <h1 className="font-black text-3xl mt-1">Contar o Central</h1>
        <p className="text-white/60">Escolha a zona. Vermelho está atrasado, vinho conta hoje.</p>
      </div>

      {resultado && (
        <div className="mx-4 mt-3 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 px-4 py-3">
          {resultado.zona} fechada: {resultado.ajustes} saldos acertados
          {resultado.nao_contados > 0 && `, ${resultado.nao_contados} itens ficaram como estavam`}.
        </div>
      )}
      {erro && <div className="mx-4 mt-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 px-4 py-3">{erro}</div>}

      {carregando ? (
        <div className="p-10 text-center text-white/50">Carregando...</div>
      ) : (
        <div className="p-4 grid grid-cols-2 md:grid-cols-3 gap-3 max-w-4xl">
          {zonas.map((z) => {
            const s = SITUACAO[z.situacao];
            const pct = z.contagem?.total ? Math.round((z.contagem.contados / z.contagem.total) * 100) : 0;
            return (
              <button
                key={z.zona}
                onClick={() => abrirZona(z.zona)}
                disabled={ocupado}
                className="text-left rounded-2xl p-4 bg-white/5 border border-white/10 active:bg-white/10"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-4xl">{emojiDaCategoria(z.zona)}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${s.cor}`}>{s.rotulo}</span>
                </div>
                <div className="font-black text-lg leading-tight mt-2">{z.zona}</div>
                <div className="text-xs text-white/50 mt-1">
                  {z.itens} itens · a cada {z.ciclo_dias} dias
                  {z.ultima && ` · última ${new Date(`${z.ultima}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`}
                </div>
                {z.contagem && z.contagem.status === 'contando' && (
                  <div className="h-1.5 rounded-full bg-white/10 mt-2 overflow-hidden">
                    <div className="h-full bg-[#D4AF37]" style={{ width: `${pct}%` }} />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default ContarCentral;
