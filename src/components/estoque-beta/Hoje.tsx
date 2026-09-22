import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Check, Loader, PackagePlus, Settings2, Warehouse } from 'lucide-react';
import { betaApi, emojiDaCategoria, fmt, type Abertura, type Balcao, type ItemMontagem, type Painel } from './api';
import Montar from './Montar';
import Configurar from './Configurar';
import Receber from './Receber';
import PedirMais from './PedirMais';
import ContarCentral from './ContarCentral';

type Tela = 'mapa' | 'montar' | 'levar' | 'pronto' | 'configurar' | 'receber' | 'pedir' | 'central';

const CENA: Record<string, string> = { Bar: '🍺', Cozinha: '🍳' };

interface Props {
  responsavel: string | null;
  gestor: boolean;
  /** Abre uma tela direto (ex.: vindo do painel do dia). */
  telaInicial?: 'central' | 'receber' | null;
}

/**
 * A rotina do dia: montar os balcões, receber mercadoria, pedir mais e
 * contar o Central. Cada gesto é uma tela de um item por vez.
 */
const Hoje: React.FC<Props> = ({ responsavel, gestor, telaInicial }) => {
  const [tela, setTela] = useState<Tela>(telaInicial || 'mapa');
  const [painel, setPainel] = useState<Painel | null>(null);
  const [abertura, setAbertura] = useState<Abertura | null>(null);
  const [balcaoPedir, setBalcaoPedir] = useState<Balcao | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{ ajustes: number; transferencias: number } | null>(null);
  const [entregas, setEntregas] = useState<Record<string, number>>({});

  const carregarPainel = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      setPainel(await betaApi.painel());
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregarPainel();
  }, [carregarPainel]);

  useEffect(() => {
    if (telaInicial) setTela(telaInicial);
  }, [telaInicial]);

  const prepararEntregas = (itens: ItemMontagem[]) => {
    const mapa: Record<string, number> = {};
    itens.forEach((i) => {
      if (i.levar > 0) mapa[i.item_id] = i.entregue ?? i.levar;
    });
    setEntregas(mapa);
  };

  const abrirBalcao = async (estoqueId: string) => {
    setOcupado(true);
    setErro(null);
    try {
      const a = await betaApi.abrir(estoqueId, responsavel);
      setAbertura(a);
      if (a.montagem.status === 'concluida') {
        setResultado(null);
        setTela('pronto');
      } else if (a.montagem.status === 'levando') {
        prepararEntregas(a.itens);
        setTela('levar');
      } else {
        setTela('montar');
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao abrir');
    } finally {
      setOcupado(false);
    }
  };

  const terminarContagem = async () => {
    if (!abertura) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await betaApi.fecharContagem(abertura.montagem.id);
      if (!r.success) {
        setErro(`Ainda faltam ${r.faltam} itens para contar.`);
        return;
      }
      const a = await betaApi.abrir(abertura.estoque.id, null);
      setAbertura(a);
      prepararEntregas(a.itens);
      setTela('levar');
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao fechar a contagem');
    } finally {
      setOcupado(false);
    }
  };

  const confirmarEntrega = async () => {
    if (!abertura) return;
    setOcupado(true);
    setErro(null);
    try {
      const lista = Object.entries(entregas).map(([item_id, entregue]) => ({ item_id, entregue }));
      const r = await betaApi.concluir(abertura.montagem.id, lista);
      setResultado({ ajustes: r.ajustes, transferencias: r.transferencias });
      setTela('pronto');
      carregarPainel();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao confirmar');
    } finally {
      setOcupado(false);
    }
  };

  const voltarAoMapa = () => {
    setAbertura(null);
    setBalcaoPedir(null);
    setTela('mapa');
    carregarPainel();
  };

  // ---------------------------------------------------------------------
  if (tela === 'configurar' && painel?.balcoes) return <Configurar balcoes={painel.balcoes} onVoltar={voltarAoMapa} />;
  if (tela === 'receber') return <Receber onVoltar={voltarAoMapa} />;
  if (tela === 'central') return <ContarCentral responsavel={responsavel} onVoltar={voltarAoMapa} />;
  if (tela === 'pedir' && balcaoPedir) return <PedirMais balcao={balcaoPedir} responsavel={responsavel} onVoltar={voltarAoMapa} />;

  if (tela === 'montar' && abertura) {
    return (
      <Montar
        abertura={abertura}
        onAtualizar={(itens) => setAbertura({ ...abertura, itens })}
        onTerminou={terminarContagem}
        onVoltar={voltarAoMapa}
      />
    );
  }

  if (tela === 'levar' && abertura) {
    const paraLevar = abertura.itens.filter((i) => i.levar > 0);
    return (
      <div className="min-h-screen flex flex-col text-white" style={{ background: '#0d0f1a' }}>
        <div className="px-4 pt-4 pb-3 border-b border-white/10">
          <button onClick={voltarAoMapa} className="flex items-center gap-1 text-white/70 py-2">
            <ArrowLeft className="w-5 h-5" /> {abertura.estoque.nome}
          </button>
          <h1 className="font-black text-3xl mt-1">Buscar no Central</h1>
          <p className="text-white/60">
            {paraLevar.length === 0 ? 'Nada para levar. O balcão já está no nível.' : `Leve estes ${paraLevar.length} itens e marque cada um.`}
          </p>
        </div>

        <div className="flex-1 px-4 py-3 space-y-3 max-w-lg w-full mx-auto">
          {paraLevar.map((i) => {
            const marcado = (entregas[i.item_id] ?? 0) > 0;
            return (
              <div key={i.item_id} className={`rounded-2xl p-3 flex items-center gap-3 border-2 ${marcado ? 'bg-emerald-500/10 border-emerald-500/60' : 'bg-white/5 border-white/10'}`}>
                <button
                  onClick={() => setEntregas((e) => ({ ...e, [i.item_id]: marcado ? 0 : i.levar }))}
                  className={`w-14 h-14 rounded-xl flex items-center justify-center flex-shrink-0 ${marcado ? 'bg-emerald-500 text-black' : 'bg-white/10 text-white/30'}`}
                  aria-label="levei"
                >
                  <Check className="w-8 h-8" />
                </button>
                <div className="w-12 h-12 rounded-lg bg-black/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {i.foto_url ? <img src={i.foto_url} alt="" className="w-full h-full object-cover" /> : <span className="text-2xl">{emojiDaCategoria(i.categoria)}</span>}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold leading-tight">{i.nome}</div>
                  <div className="text-sm text-white/60">
                    levar <span className="text-white font-black text-lg">{fmt(i.levar)}</span> {i.rotulo_solto}
                    {i.saldo_central < i.levar && <span className="ml-2 text-amber-300">· Central mostra {fmt(i.saldo_central)}</span>}
                  </div>
                </div>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={entregas[i.item_id] ?? 0}
                  onChange={(e) => setEntregas((m) => ({ ...m, [i.item_id]: Math.max(0, Number(e.target.value) || 0) }))}
                  onFocus={(e) => e.target.select()}
                  className="w-20 px-2 py-2 rounded-lg bg-white/10 border border-white/10 text-center font-bold"
                />
              </div>
            );
          })}
        </div>

        {erro && <div className="mx-4 mb-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 px-4 py-3">{erro}</div>}

        <div className="px-4 pb-6 pt-2 max-w-lg w-full mx-auto">
          <button
            onClick={confirmarEntrega}
            disabled={ocupado}
            className="w-full h-20 rounded-3xl bg-[#D4AF37] active:bg-[#C5A028] disabled:opacity-60 text-black font-black text-2xl flex items-center justify-center gap-3"
          >
            {ocupado ? <Loader className="w-7 h-7 animate-spin" /> : <Check className="w-8 h-8" />}
            {paraLevar.length === 0 ? 'FECHAR O DIA' : 'ENTREGUEI TUDO'}
          </button>
        </div>
      </div>
    );
  }

  if (tela === 'pronto' && abertura) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-white text-center p-8" style={{ background: '#0d0f1a' }}>
        <div className="text-8xl mb-4">{CENA[abertura.estoque.nome] || '✅'}</div>
        <h1 className="font-black text-4xl">{abertura.estoque.nome} montado!</h1>
        <p className="text-white/60 mt-2 text-lg">
          {resultado ? `${resultado.transferencias} itens levados e ${resultado.ajustes} saldos acertados.` : 'Este balcão já foi montado hoje.'}
        </p>
        <button onClick={voltarAoMapa} className="mt-8 px-10 h-16 rounded-2xl bg-white/10 text-white font-bold text-xl">Voltar ao mapa</button>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  // Mapa
  return (
    <div className="min-h-screen text-white" style={{ background: '#0d0f1a' }}>
      <div className="px-5 pt-6 pb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-xs font-bold tracking-widest uppercase text-[#D4AF37]">Estoque Beta</div>
          <h1 className="font-black text-3xl leading-tight mt-1">O que fazer hoje</h1>
          {painel && (
            <p className="text-white/60 mt-1">
              {new Date(`${painel.hoje}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
              {painel.dia_conferencia && (
                <span className="ml-2 px-2 py-0.5 rounded-lg bg-[#7d1f2c] text-white text-xs font-bold align-middle">dia de conferência: conta tudo</span>
              )}
            </p>
          )}
        </div>
        {gestor && (
          <button onClick={() => setTela('configurar')} className="px-4 py-3 rounded-xl bg-white/10 text-white/80 flex items-center gap-2 text-sm font-bold">
            <Settings2 className="w-4 h-4" /> Configurar
          </button>
        )}
      </div>

      {erro && <div className="mx-5 mb-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 px-4 py-3">{erro}</div>}

      {carregando ? (
        <div className="p-10 text-center text-white/50">Carregando...</div>
      ) : (
        <div className="px-5 pb-10 space-y-5 max-w-4xl">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {(painel?.balcoes || []).map((b) => {
              const m = b.montagem;
              const pct = m && m.total ? Math.round((m.contados / m.total) * 100) : 0;
              const concluida = m?.status === 'concluida';
              const emAndamento = m && !concluida;
              return (
                <div
                  key={b.id}
                  className={`rounded-3xl p-6 border-2 ${concluida ? 'bg-emerald-500/10 border-emerald-500/50' : emAndamento ? 'bg-[#D4AF37]/10 border-[#D4AF37]' : 'bg-white/5 border-white/10'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-7xl">{CENA[b.nome] || '🏪'}</span>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${concluida ? 'bg-emerald-500 text-black' : emAndamento ? 'bg-[#D4AF37] text-black' : 'bg-white/10 text-white/60'}`}>
                      {concluida ? 'montado' : emAndamento ? (m?.status === 'levando' ? 'levando' : `${pct}% contado`) : 'para montar'}
                    </span>
                  </div>
                  <div className="font-black text-3xl mt-4">{b.nome}</div>
                  <div className="text-white/60 mt-1">
                    {b.itens_contagem} itens para contar todo dia · {b.itens - b.itens_contagem} repostos pela venda
                  </div>
                  {emAndamento && (
                    <div className="h-2 rounded-full bg-white/10 mt-4 overflow-hidden">
                      <div className="h-full bg-[#D4AF37]" style={{ width: `${pct}%` }} />
                    </div>
                  )}
                  <button
                    onClick={() => abrirBalcao(b.id)}
                    disabled={ocupado}
                    className={`mt-5 w-full h-14 rounded-2xl flex items-center justify-center font-black text-xl ${concluida ? 'bg-white/10 text-white/70' : 'bg-[#D4AF37] text-black'}`}
                  >
                    {ocupado ? <Loader className="w-6 h-6 animate-spin" /> : concluida ? 'VER' : emAndamento ? 'CONTINUAR' : 'MONTAR'}
                  </button>
                  <button
                    onClick={() => { setBalcaoPedir(b); setTela('pedir'); }}
                    className="mt-2 w-full h-12 rounded-2xl bg-white/5 text-white/70 font-bold flex items-center justify-center gap-2"
                  >
                    <PackagePlus className="w-5 h-5" /> Pedir mais
                  </button>
                </div>
              );
            })}
            {painel && (painel.balcoes || []).length === 0 && (
              <div className="col-span-full text-white/50 p-6 rounded-2xl bg-white/5">Nenhum balcão tem nível cadastrado ainda. Peça ao gestor para configurar.</div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <button onClick={() => setTela('receber')} className="text-left rounded-3xl p-6 bg-white/5 border-2 border-white/10 active:scale-[0.98]">
              <span className="text-6xl">📦</span>
              <div className="font-black text-2xl mt-3">Receber mercadoria</div>
              <div className="text-white/60 mt-1">Chegou nota? Tire a foto e confirme.</div>
            </button>
            <button onClick={() => setTela('central')} className="text-left rounded-3xl p-6 bg-white/5 border-2 border-white/10 active:scale-[0.98]">
              <span className="text-6xl"><Warehouse className="w-14 h-14 text-white/80" /></span>
              <div className="font-black text-2xl mt-3">Contar o Central</div>
              <div className="text-white/60 mt-1">Por zona, na ordem do que está vencendo.</div>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Hoje;
