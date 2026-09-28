import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Download, Search } from 'lucide-react';
import { emojiDaCategoria, fmt, moeda } from './api';
import { consultasApi, type ItemPosicao, type Posicao as PosicaoDados } from './apiConsultas';

interface Props {
  onVoltar: () => void;
  onAbrirItem: (itemId: string) => void;
}

type Filtro = 'negativos' | 'zerados' | 'abaixo';

const FILTROS: Array<{ chave: Filtro; rotulo: string; ativo: string }> = [
  { chave: 'negativos', rotulo: 'Negativos', ativo: 'bg-red-500/25 border-red-500/60 text-red-200' },
  { chave: 'zerados', rotulo: 'Zerados', ativo: 'bg-white/20 border-white/40 text-white' },
  { chave: 'abaixo', rotulo: 'Abaixo do nível', ativo: 'bg-amber-500/25 border-amber-500/60 text-amber-200' },
];

function corDoSaldo(item: ItemPosicao): string {
  if (item.negativo) return 'text-red-400';
  if (item.zerado) return 'text-white/40';
  if (item.abaixo_nivel) return 'text-amber-300';
  return 'text-white';
}

function celulaCsv(valor: string | number | null): string {
  const texto = valor == null ? '' : String(valor);
  return /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

function dataHoje(): string {
  const d = new Date();
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
}

/** Posição do estoque: quanto tem de cada coisa, onde, e quanto vale. */
const Posicao: React.FC<Props> = ({ onVoltar, onAbrirItem }) => {
  const [estoqueId, setEstoqueId] = useState<string | null>(null);
  const [dados, setDados] = useState<PosicaoDados | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<Set<Filtro>>(new Set());
  const [termo, setTermo] = useState('');

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    setErro(null);
    consultasApi
      .posicao(estoqueId)
      .then((r) => { if (vivo) setDados(r); })
      .catch((e: unknown) => { if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao carregar a posição'); })
      .finally(() => { if (vivo) setCarregando(false); });
    return () => { vivo = false; };
  }, [estoqueId]);

  const alternarFiltro = (f: Filtro) => {
    setFiltros((atual) => {
      const novo = new Set(atual);
      if (novo.has(f)) novo.delete(f);
      else novo.add(f);
      return novo;
    });
  };

  const itensFiltrados = useMemo(() => {
    if (!dados) return [];
    const busca = termo.trim().toLowerCase();
    return dados.itens.filter((i) => {
      if (busca && !i.nome.toLowerCase().includes(busca)) return false;
      if (filtros.size === 0) return true;
      // Com mais de um filtro ligado, mostra quem cai em qualquer um deles.
      return (
        (filtros.has('negativos') && i.negativo) ||
        (filtros.has('zerados') && i.zerado) ||
        (filtros.has('abaixo') && i.abaixo_nivel)
      );
    });
  }, [dados, termo, filtros]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, ItemPosicao[]>();
    for (const item of itensFiltrados) {
      const chave = item.categoria || 'Sem categoria';
      const lista = mapa.get(chave);
      if (lista) lista.push(item);
      else mapa.set(chave, [item]);
    }
    return Array.from(mapa.entries()).sort(([a], [b]) => a.localeCompare(b, 'pt-BR'));
  }, [itensFiltrados]);

  const exportar = () => {
    if (!dados) return;
    const linhas = [
      ['nome', 'categoria', 'saldo', 'unidade', 'custo médio', 'valor'].join(';'),
      ...itensFiltrados.map((i) =>
        [i.nome, i.categoria, i.saldo, i.rotulo_solto || i.unidade, i.custo_medio, i.valor].map(celulaCsv).join(';'),
      ),
    ];
    const blob = new Blob(['\uFEFF', linhas.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `posicao-estoque-${dataHoje()}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const totais = dados?.totais;
  const estoques = dados?.estoques || [];

  return (
    <div className="min-h-screen text-white" style={{ background: '#0d0f1a' }}>
      <div className="px-4 pt-4 pb-3 border-b border-white/10">
        <button onClick={onVoltar} className="flex items-center gap-1 text-white/70 py-2">
          <ArrowLeft className="w-5 h-5" /> Mapa
        </button>
        <div className="flex items-end justify-between gap-3">
          <h1 className="font-black text-3xl mt-1">Posição do estoque</h1>
          <button
            onClick={exportar}
            disabled={!dados || itensFiltrados.length === 0}
            className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/10 text-white/80 font-bold text-sm disabled:opacity-40"
          >
            <Download className="w-4 h-4" /> Exportar
          </button>
        </div>
        <p className="text-white/60">Quanto tem de cada coisa e quanto vale.</p>
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

      {erro && <div className="mx-4 mt-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 px-4 py-3">{erro}</div>}

      {totais && (
        <div className="px-4 pt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
          <div className="rounded-2xl bg-white/5 border border-[#D4AF37] p-3 col-span-2 md:col-span-1">
            <div className="text-xs text-white/50">valor parado</div>
            <div className="font-black text-2xl text-[#D4AF37]">{moeda(totais.valor)}</div>
          </div>
          <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
            <div className="text-xs text-white/50">itens</div>
            <div className="font-black text-2xl">{fmt(totais.itens)}</div>
          </div>
          <div className={`rounded-2xl p-3 border ${totais.negativos > 0 ? 'bg-red-500/15 border-red-500/40' : 'bg-white/5 border-white/10'}`}>
            <div className="text-xs text-white/50">negativos</div>
            <div className={`font-black text-2xl ${totais.negativos > 0 ? 'text-red-300' : ''}`}>{fmt(totais.negativos)}</div>
            {totais.negativos > 0 && <div className="text-xs text-red-200">{moeda(totais.valor_negativo)}</div>}
          </div>
          <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
            <div className="text-xs text-white/50">zerados</div>
            <div className="font-black text-2xl text-white/60">{fmt(totais.zerados)}</div>
          </div>
          <div className={`rounded-2xl p-3 border ${totais.abaixo_nivel > 0 ? 'bg-amber-500/10 border-amber-500/40' : 'bg-white/5 border-white/10'}`}>
            <div className="text-xs text-white/50">abaixo do nível</div>
            <div className={`font-black text-2xl ${totais.abaixo_nivel > 0 ? 'text-amber-300' : ''}`}>{fmt(totais.abaixo_nivel)}</div>
          </div>
        </div>
      )}

      <div className="px-4 pt-3 space-y-2">
        <div className="flex items-center gap-2 bg-white/10 rounded-2xl px-4">
          <Search className="w-5 h-5 text-white/40" />
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Buscar item"
            className="flex-1 bg-transparent py-3 text-white text-lg outline-none"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {FILTROS.map((f) => {
            const ligado = filtros.has(f.chave);
            return (
              <button
                key={f.chave}
                onClick={() => alternarFiltro(f.chave)}
                className={`flex-shrink-0 px-4 py-2 rounded-full border font-bold text-sm ${ligado ? f.ativo : 'bg-white/5 border-white/10 text-white/60'}`}
              >
                {f.rotulo}
              </button>
            );
          })}
        </div>
      </div>

      {carregando ? (
        <div className="p-10 text-center text-white/50">Carregando...</div>
      ) : grupos.length === 0 ? (
        <div className="p-10 text-center text-white/50">Nenhum item para mostrar.</div>
      ) : (
        <div className="p-4 space-y-5 max-w-3xl">
          {grupos.map(([categoria, itens]) => (
            <div key={categoria}>
              <div className="flex items-center gap-2 mb-2 text-white/60 text-sm font-bold uppercase tracking-wide">
                <span className="text-xl">{emojiDaCategoria(categoria)}</span>
                {categoria}
                <span className="text-white/30 font-normal normal-case">· {itens.length}</span>
              </div>
              <div className="space-y-2">
                {itens.map((i) => (
                  <button
                    key={i.item_id}
                    onClick={() => onAbrirItem(i.item_id)}
                    className={`w-full flex items-center gap-3 rounded-2xl bg-white/5 border p-3 text-left active:bg-white/10 ${i.negativo ? 'border-red-500/40' : i.abaixo_nivel ? 'border-amber-500/40' : 'border-white/10'}`}
                  >
                    <div className="w-14 h-14 rounded-lg bg-black/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                      {i.foto_url ? <img src={i.foto_url} alt="" className="w-full h-full object-cover" /> : <span className="text-3xl">{emojiDaCategoria(i.categoria)}</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-lg truncate">{i.nome}</div>
                      <div className="text-xs text-white/50 truncate">
                        {i.categoria || 'Sem categoria'}
                        {i.nivel != null && <span className="ml-2 text-white/40">· nível {fmt(i.nivel)}</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <div className={`font-black text-2xl leading-none ${corDoSaldo(i)}`}>
                        {fmt(i.saldo)} <span className="text-sm font-bold text-white/50">{i.rotulo_solto}</span>
                      </div>
                      <div className="text-xs text-white/50 mt-1">{moeda(i.valor)}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Posicao;
