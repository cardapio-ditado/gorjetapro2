import React, { useEffect, useState } from 'react';
import { ArrowLeft, FileText, Search } from 'lucide-react';
import { betaApi, emojiDaCategoria, fmt, moeda, type ItemBusca } from './api';
import { consultasApi, type EstoqueRef, type Extrato as ExtratoDados, type Movimento } from './apiConsultas';

interface Props {
  itemId: string | null;
  onVoltar: () => void;
  onAbrirItem?: (itemId: string) => void;
}

type Periodo = 7 | 30 | 90 | 'livre';

const PERIODOS: Array<{ chave: Periodo; rotulo: string }> = [
  { chave: 7, rotulo: '7 dias' },
  { chave: 30, rotulo: '30 dias' },
  { chave: 90, rotulo: '90 dias' },
];

function isoData(d: Date): string {
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function diasAtras(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoData(d);
}

function ddmm(data: string): string {
  const d = new Date(data.length <= 10 ? `${data}T12:00:00` : data);
  if (Number.isNaN(d.getTime())) return data;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

function corDaOrigem(rotulo: string): string {
  const r = rotulo.toLowerCase();
  if (r.includes('compra')) return 'bg-emerald-500/20 text-emerald-200 border-emerald-500/40';
  if (r.includes('venda') || r.includes('zig')) return 'bg-blue-500/20 text-blue-200 border-blue-500/40';
  if (r.includes('contagem')) return 'bg-amber-500/20 text-amber-200 border-amber-500/40';
  if (r.includes('montagem') || r.includes('pedido extra') || r.includes('transfer') || r.includes('requisi')) {
    return 'bg-purple-500/20 text-purple-200 border-purple-500/40';
  }
  if (r.includes('produção') || r.includes('producao')) return 'bg-white/10 text-white/60 border-white/20';
  return 'bg-white/10 text-white border-white/30';
}

function quantidadeComSinal(m: Movimento): { texto: string; cor: string } {
  if (m.sinal > 0) return { texto: `+${fmt(m.quantidade)}`, cor: 'text-emerald-300' };
  if (m.sinal < 0) return { texto: `−${fmt(m.quantidade)}`, cor: 'text-red-300' };
  return { texto: fmt(m.quantidade), cor: 'text-white/80' };
}

/** Extrato de um item: tudo que entrou e saiu, com o saldo depois de cada passo. */
const Extrato: React.FC<Props> = ({ itemId, onVoltar, onAbrirItem }) => {
  const [itemAtual, setItemAtual] = useState<string | null>(itemId);
  const [termo, setTermo] = useState('');
  const [resultados, setResultados] = useState<ItemBusca[]>([]);
  const [buscando, setBuscando] = useState(false);

  const [estoques, setEstoques] = useState<EstoqueRef[]>([]);
  const [estoqueId, setEstoqueId] = useState<string | null>(null);
  const [periodo, setPeriodo] = useState<Periodo>(30);
  const [inicioLivre, setInicioLivre] = useState(diasAtras(30));
  const [fimLivre, setFimLivre] = useState(isoData(new Date()));

  const [extrato, setExtrato] = useState<ExtratoDados | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setItemAtual(itemId);
  }, [itemId]);

  // busca de item quando não veio nenhum
  useEffect(() => {
    if (itemAtual) return;
    let vivo = true;
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const r = await betaApi.buscarItem(termo, null);
        if (vivo) setResultados(r);
      } catch {
        if (vivo) setResultados([]);
      } finally {
        if (vivo) setBuscando(false);
      }
    }, 200);
    return () => { vivo = false; clearTimeout(t); };
  }, [termo, itemAtual]);

  useEffect(() => {
    let vivo = true;
    consultasApi
      .estoques()
      .then((r) => { if (vivo) setEstoques(r); })
      .catch(() => { if (vivo) setEstoques([]); });
    return () => { vivo = false; };
  }, []);

  useEffect(() => {
    if (!itemAtual) return;
    let vivo = true;
    const inicio = periodo === 'livre' ? inicioLivre || null : diasAtras(periodo);
    const fim = periodo === 'livre' ? fimLivre || null : isoData(new Date());
    setCarregando(true);
    setErro(null);
    consultasApi
      .extrato(itemAtual, estoqueId, inicio, fim)
      .then((r) => { if (vivo) setExtrato(r); })
      .catch((e: unknown) => { if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao carregar o extrato'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [itemAtual, estoqueId, periodo, inicioLivre, fimLivre]);

  const escolherItem = (id: string) => {
    setExtrato(null);
    setItemAtual(id);
  };

  const voltar = () => {
    // Se o item foi escolhido aqui na busca, voltar leva para a busca de novo.
    if (itemAtual && !itemId) {
      setItemAtual(null);
      setExtrato(null);
      return;
    }
    onVoltar();
  };

  // ---------------------------------------------------------------------
  if (!itemAtual) {
    return (
      <div className="min-h-screen text-white" style={{ background: '#0d0f1a' }}>
        <div className="px-4 pt-4 pb-3 border-b border-white/10">
          <button onClick={onVoltar} className="flex items-center gap-1 text-white/70 py-2">
            <ArrowLeft className="w-5 h-5" /> Mapa
          </button>
          <h1 className="font-black text-3xl mt-1">Extrato do item</h1>
          <p className="text-white/60">Escolha o item para ver tudo que entrou e saiu.</p>
        </div>
        <div className="p-4 space-y-3 max-w-lg w-full mx-auto">
          <div className="flex items-center gap-2 bg-white/10 rounded-2xl px-4">
            <Search className="w-6 h-6 text-white/40" />
            <input
              autoFocus
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Qual item?"
              className="flex-1 bg-transparent py-4 text-white text-xl outline-none"
            />
          </div>
          {buscando && resultados.length === 0 && <div className="text-center text-white/40 py-4">Buscando...</div>}
          {resultados.map((r) => (
            <button key={r.item_id} onClick={() => escolherItem(r.item_id)} className="w-full flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 p-3 text-left active:bg-white/10">
              <div className="w-14 h-14 rounded-lg bg-black/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                {r.foto_url ? <img src={r.foto_url} alt="" className="w-full h-full object-cover" /> : <span className="text-3xl">{emojiDaCategoria(r.categoria)}</span>}
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-bold text-lg truncate">{r.nome}</div>
                <div className="text-xs text-white/50">{r.categoria || 'Sem categoria'} · {r.rotulo_solto}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------
  const item = extrato?.item;
  const resumo = extrato?.resumo;

  return (
    <div className="min-h-screen text-white" style={{ background: '#0d0f1a' }}>
      <div className="px-4 pt-4 pb-3 border-b border-white/10">
        <button onClick={voltar} className="flex items-center gap-1 text-white/70 py-2">
          <ArrowLeft className="w-5 h-5" /> {itemId ? 'Voltar' : 'Buscar outro'}
        </button>
        <div className="flex items-center gap-3 mt-1">
          <div className="w-16 h-16 rounded-lg bg-black/30 flex items-center justify-center overflow-hidden flex-shrink-0">
            {item?.foto_url ? <img src={item.foto_url} alt="" className="w-full h-full object-cover" /> : <span className="text-3xl">{emojiDaCategoria(item?.categoria)}</span>}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-black text-3xl leading-tight truncate">{item?.nome || 'Extrato'}</h1>
            <div className="text-white/60 text-sm">
              {item?.categoria || 'Sem categoria'}
              {item && <span className="ml-2">· custo médio {moeda(item.custo_medio)}</span>}
            </div>
          </div>
        </div>
        {onAbrirItem && (
          <button onClick={() => onAbrirItem(itemAtual)} className="mt-3 flex items-center gap-2 px-4 py-2 rounded-xl bg-[#D4AF37]/20 text-[#D4AF37] font-bold text-sm">
            <FileText className="w-4 h-4" /> Ficha do item
          </button>
        )}
      </div>

      <div className="px-4 pt-3 flex gap-2 overflow-x-auto pb-1">
        <button
          onClick={() => setEstoqueId(null)}
          className={`flex-shrink-0 px-4 py-2 rounded-full border font-bold ${estoqueId === null ? 'bg-[#D4AF37] border-[#D4AF37] text-black' : 'bg-white/5 border-white/10 text-white/70'}`}
        >
          Toda a casa
        </button>
        {estoques.map((e) => (
          <button
            key={e.id}
            onClick={() => setEstoqueId(e.id)}
            className={`flex-shrink-0 px-4 py-2 rounded-full border font-bold ${estoqueId === e.id ? 'bg-[#D4AF37] border-[#D4AF37] text-black' : 'bg-white/5 border-white/10 text-white/70'}`}
          >
            {e.nome}
          </button>
        ))}
      </div>

      <div className="px-4 pt-2 flex gap-2 overflow-x-auto pb-1">
        {PERIODOS.map((p) => (
          <button
            key={p.chave}
            onClick={() => setPeriodo(p.chave)}
            className={`flex-shrink-0 px-4 py-2 rounded-full border font-bold text-sm ${periodo === p.chave ? 'bg-white/20 border-white/40 text-white' : 'bg-white/5 border-white/10 text-white/60'}`}
          >
            {p.rotulo}
          </button>
        ))}
        <button
          onClick={() => setPeriodo('livre')}
          className={`flex-shrink-0 px-4 py-2 rounded-full border font-bold text-sm ${periodo === 'livre' ? 'bg-white/20 border-white/40 text-white' : 'bg-white/5 border-white/10 text-white/60'}`}
        >
          Período livre
        </button>
      </div>
      {periodo === 'livre' && (
        <div className="px-4 pt-2 flex items-center gap-2">
          <input
            type="date"
            value={inicioLivre}
            max={fimLivre}
            onChange={(e) => setInicioLivre(e.target.value)}
            className="flex-1 rounded-xl bg-white/10 border border-white/10 px-3 py-3 text-white outline-none"
          />
          <span className="text-white/50">até</span>
          <input
            type="date"
            value={fimLivre}
            min={inicioLivre}
            onChange={(e) => setFimLivre(e.target.value)}
            className="flex-1 rounded-xl bg-white/10 border border-white/10 px-3 py-3 text-white outline-none"
          />
        </div>
      )}

      {erro && <div className="mx-4 mt-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 px-4 py-3">{erro}</div>}

      {carregando && !extrato ? (
        <div className="p-10 text-center text-white/50">Carregando...</div>
      ) : extrato && resumo ? (
        <div className={`p-4 space-y-4 max-w-3xl ${carregando ? 'opacity-60' : ''}`}>
          <div>
            <div className="text-white/60 text-sm font-bold uppercase tracking-wide mb-2">
              Resumo do período · {ddmm(extrato.inicio)} a {ddmm(extrato.fim)}
              {extrato.estoque && <span className="normal-case font-normal"> · {extrato.estoque.nome}</span>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
                <div className="text-xs text-white/50">saldo inicial</div>
                <div className="font-black text-2xl">{fmt(extrato.saldo_inicial)} <span className="text-sm text-white/50">{extrato.item.rotulo_solto}</span></div>
              </div>
              <div className="rounded-2xl bg-white/5 border border-[#D4AF37] p-3">
                <div className="text-xs text-white/50">saldo final</div>
                <div className="font-black text-2xl text-[#D4AF37]">{fmt(extrato.saldo_final)} <span className="text-sm text-white/50">{extrato.item.rotulo_solto}</span></div>
              </div>
              <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-3">
                <div className="text-xs text-white/50">entrou por compra</div>
                <div className="font-black text-2xl text-emerald-300">+{fmt(resumo.compras)}</div>
              </div>
              <div className="rounded-2xl bg-blue-500/10 border border-blue-500/30 p-3">
                <div className="text-xs text-white/50">saiu por venda</div>
                <div className="font-black text-2xl text-blue-200">−{fmt(resumo.vendas)}</div>
              </div>
              <div className="rounded-2xl bg-amber-500/10 border border-amber-500/30 p-3">
                <div className="text-xs text-white/50">ajustes de contagem</div>
                <div className="font-black text-xl text-amber-200">
                  +{fmt(resumo.ajustes_mais)} <span className="text-white/40">/</span> −{fmt(resumo.ajustes_menos)}
                </div>
              </div>
              <div className="rounded-2xl bg-purple-500/10 border border-purple-500/30 p-3">
                <div className="text-xs text-white/50">transferências</div>
                <div className="font-black text-xl text-purple-200">
                  <span className="text-xs font-normal text-white/50">entrou </span>{fmt(resumo.transferencias_entrada)}
                  <span className="text-xs font-normal text-white/50"> · saiu </span>{fmt(resumo.transferencias_saida)}
                </div>
              </div>
              <div className="rounded-2xl bg-white/5 border border-white/10 p-3 col-span-2">
                <div className="text-xs text-white/50">produção</div>
                <div className="font-black text-xl text-white/80">
                  <span className="text-xs font-normal text-white/50">consumiu </span>{fmt(resumo.producao_consumo)}
                  <span className="text-xs font-normal text-white/50"> · entrou </span>{fmt(resumo.producao_entrada)}
                </div>
              </div>
            </div>
          </div>

          <div>
            <div className="text-white/60 text-sm font-bold uppercase tracking-wide mb-2">
              Movimentos <span className="text-white/30 font-normal normal-case">· {extrato.movimentos.length}</span>
            </div>
            {extrato.movimentos.length === 0 ? (
              <div className="rounded-2xl bg-white/5 border border-white/10 p-6 text-center text-white/50">Nada se mexeu nesse período.</div>
            ) : (
              <div className="space-y-2">
                {extrato.movimentos.map((m) => {
                  const q = quantidadeComSinal(m);
                  // O banco já manda o nome do estoque, não o id.
                  const de = m.estoque_origem;
                  const para = m.estoque_destino;
                  return (
                    <div key={m.id} className="rounded-2xl bg-white/5 border border-white/10 p-3">
                      <div className="flex items-center gap-3">
                        <div className="text-white/70 font-bold w-12 flex-shrink-0">{ddmm(m.data)}</div>
                        <div className="min-w-0 flex-1">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-bold border ${corDaOrigem(m.origem_rotulo)}`}>{m.origem_rotulo}</span>
                          {(de || para) && (
                            <div className="text-xs text-white/50 mt-1 truncate">
                              {de && <span>de {de}</span>}
                              {de && para && ' → '}
                              {para && <span>para {para}</span>}
                            </div>
                          )}
                          {m.motivo && <div className="text-xs text-white/50 mt-1 truncate">{m.motivo}</div>}
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className={`font-black text-xl leading-none ${q.cor}`}>{q.texto}</div>
                          <div className="text-xs text-white/50 mt-1">saldo após {fmt(m.saldo_apos)}</div>
                        </div>
                      </div>
                      {m.observacoes && <div className="text-xs text-white/40 mt-2 pl-[3.75rem]">{m.observacoes}</div>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default Extrato;
