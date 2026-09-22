import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Camera, Loader, Save, Wand2 } from 'lucide-react';
import { betaApi, emojiDaCategoria, fmt, type Balcao, type Controle, type ItemConfig } from './api';

interface Props {
  balcoes: Balcao[];
  onVoltar: () => void;
}

interface Linha extends ItemConfig {
  nivelDraft: string;
  controleDraft: Controle;
  rotuloSoltoDraft: string;
  rotuloFechadoDraft: string;
  fatorDraft: string;
  fracaoDraft: boolean;
  dicaDraft: string;
  salvando: boolean;
  salvo: boolean;
}

/**
 * Tela do gestor: nível de cada item no balcão e como o item se conta.
 * É aqui que ovo vira "cartela de 30" e whisky vira "garrafa em décimos".
 */
const Configurar: React.FC<Props> = ({ balcoes, onVoltar }) => {
  const [estoqueId, setEstoqueId] = useState(balcoes[0]?.id || '');
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(false);
  const [busca, setBusca] = useState('');
  const [soDoBalcao, setSoDoBalcao] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = async (id: string) => {
    if (!id) return;
    setCarregando(true);
    setErro(null);
    try {
      const itens = await betaApi.niveisListar(id);
      setLinhas(
        itens.map((i) => ({
          ...i,
          nivelDraft: i.nivel != null ? String(i.nivel) : '',
          controleDraft: i.controle || (i.tem_ficha ? 'venda' : 'contagem'),
          rotuloSoltoDraft: i.rotulo_solto || 'unidade',
          rotuloFechadoDraft: i.rotulo_fechado || '',
          fatorDraft: i.fator_fechado != null ? String(i.fator_fechado) : '',
          fracaoDraft: i.permite_fracao,
          dicaDraft: i.dica || '',
          salvando: false,
          salvo: false,
        })),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar(estoqueId);
  }, [estoqueId]);

  const visiveis = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return linhas.filter((l) => {
      if (soDoBalcao && l.nivel == null) return false;
      if (termo && !l.nome.toLowerCase().includes(termo)) return false;
      return true;
    });
  }, [linhas, busca, soDoBalcao]);

  const mudar = (itemId: string, mudanca: Partial<Linha>) => {
    setLinhas((atual) => atual.map((l) => (l.item_id === itemId ? { ...l, ...mudanca, salvo: false } : l)));
  };

  const salvar = async (l: Linha) => {
    mudar(l.item_id, { salvando: true });
    try {
      const nivel = Number(l.nivelDraft.replace(',', '.')) || 0;
      await betaApi.nivelDefinir(estoqueId, l.item_id, nivel, l.controleDraft);
      await betaApi.configItem(l.item_id, {
        rotulo_solto: l.rotuloSoltoDraft.trim() || 'unidade',
        rotulo_fechado: l.rotuloFechadoDraft.trim() || null,
        fator_fechado: l.fatorDraft ? Number(l.fatorDraft.replace(',', '.')) || null : null,
        permite_fracao: l.fracaoDraft,
        dica: l.dicaDraft.trim() || null,
      });
      mudar(l.item_id, { salvando: false, salvo: true, nivel, controle: l.controleDraft });
    } catch (e) {
      mudar(l.item_id, { salvando: false });
      setErro(e instanceof Error ? e.message : 'Erro ao salvar');
    }
  };

  const foto = async (l: Linha, arquivo: File | null) => {
    if (!arquivo) return;
    mudar(l.item_id, { salvando: true });
    try {
      const url = await betaApi.fotoItem(l.item_id, arquivo);
      mudar(l.item_id, { salvando: false, foto_url: url, salvo: true });
    } catch (e) {
      mudar(l.item_id, { salvando: false });
      setErro(e instanceof Error ? e.message : 'Erro ao enviar foto');
    }
  };

  const sugerir = (l: Linha) => {
    // dois dias de consumo, arredondado para cima; mínimo 1
    const sugestao = Math.max(1, Math.ceil(l.consumo_dia * 2));
    mudar(l.item_id, { nivelDraft: String(sugestao) });
  };

  return (
    <div className="min-h-screen text-white" style={{ background: '#0d0f1a' }}>
      <div className="px-4 py-4 flex flex-wrap items-center gap-3 border-b border-white/10">
        <button onClick={onVoltar} className="flex items-center gap-1 text-white/70 py-2 pr-2">
          <ArrowLeft className="w-5 h-5" /> Voltar
        </button>
        <h1 className="font-black text-xl">Configurar balcões</h1>
        <div className="flex gap-2 ml-auto">
          {balcoes.map((b) => (
            <button
              key={b.id}
              onClick={() => setEstoqueId(b.id)}
              className={`px-4 py-2 rounded-xl font-bold ${
                estoqueId === b.id ? 'bg-[#D4AF37] text-black' : 'bg-white/10 text-white/70'
              }`}
            >
              {b.nome}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-3 flex flex-wrap items-center gap-3">
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar item..."
          className="px-4 py-2 rounded-xl bg-white/10 border border-white/10 text-white w-64"
        />
        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={soDoBalcao} onChange={(e) => setSoDoBalcao(e.target.checked)} />
          só itens que já estão neste balcão
        </label>
        <span className="text-white/40 text-sm ml-auto">{visiveis.length} itens</span>
      </div>

      {erro && (
        <div className="mx-4 mb-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 px-4 py-3">{erro}</div>
      )}

      {carregando ? (
        <div className="p-10 text-center text-white/50">Carregando...</div>
      ) : (
        <div className="px-4 pb-10 space-y-3">
          {visiveis.map((l) => (
            <div key={l.item_id} className="rounded-2xl bg-white/5 border border-white/10 p-3 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center">
              {/* Foto + nome */}
              <div className="lg:col-span-3 flex items-center gap-3">
                <label className="relative w-16 h-16 rounded-xl bg-black/30 flex items-center justify-center overflow-hidden cursor-pointer flex-shrink-0">
                  {l.foto_url ? (
                    <img src={l.foto_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl">{emojiDaCategoria(l.categoria)}</span>
                  )}
                  <span className="absolute bottom-0 right-0 p-1 bg-black/70 rounded-tl-lg">
                    <Camera className="w-3 h-3" />
                  </span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => foto(l, e.target.files?.[0] || null)} />
                </label>
                <div className="min-w-0">
                  <div className="font-bold leading-tight truncate">{l.nome}</div>
                  <div className="text-xs text-white/40">{l.categoria} · {l.unidade}</div>
                  {l.consumo_dia > 0 && (
                    <div className="text-xs text-white/50">vende {fmt(l.consumo_dia)}/dia</div>
                  )}
                </div>
              </div>

              {/* Nível + controle */}
              <div className="lg:col-span-3 flex items-center gap-2">
                <div>
                  <div className="text-[11px] uppercase text-white/40 mb-1">Nível</div>
                  <div className="flex items-center gap-1">
                    <input
                      value={l.nivelDraft}
                      onChange={(e) => mudar(l.item_id, { nivelDraft: e.target.value })}
                      inputMode="decimal"
                      className="w-20 px-2 py-2 rounded-lg bg-white/10 border border-white/10 text-center font-bold"
                    />
                    {l.consumo_dia > 0 && (
                      <button onClick={() => sugerir(l)} title="Sugerir pelo consumo" className="p-2 rounded-lg bg-white/10 text-[#D4AF37]">
                        <Wand2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] uppercase text-white/40 mb-1">Como baixa</div>
                  <div className="flex rounded-lg overflow-hidden border border-white/10">
                    <button
                      onClick={() => mudar(l.item_id, { controleDraft: 'venda' })}
                      className={`px-3 py-2 text-sm font-bold ${l.controleDraft === 'venda' ? 'bg-[#7d1f2c] text-white' : 'bg-white/5 text-white/50'}`}
                    >
                      Vende
                    </button>
                    <button
                      onClick={() => mudar(l.item_id, { controleDraft: 'contagem' })}
                      className={`px-3 py-2 text-sm font-bold ${l.controleDraft === 'contagem' ? 'bg-[#7d1f2c] text-white' : 'bg-white/5 text-white/50'}`}
                    >
                      Conta
                    </button>
                  </div>
                </div>
              </div>

              {/* Como contar */}
              <div className="lg:col-span-5 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <div>
                  <div className="text-[11px] uppercase text-white/40 mb-1">Solto</div>
                  <input
                    value={l.rotuloSoltoDraft}
                    onChange={(e) => mudar(l.item_id, { rotuloSoltoDraft: e.target.value })}
                    placeholder="ovo"
                    className="w-full px-2 py-2 rounded-lg bg-white/10 border border-white/10 text-sm"
                  />
                </div>
                <div>
                  <div className="text-[11px] uppercase text-white/40 mb-1">Fechado</div>
                  <input
                    value={l.rotuloFechadoDraft}
                    onChange={(e) => mudar(l.item_id, { rotuloFechadoDraft: e.target.value })}
                    placeholder="cartela"
                    className="w-full px-2 py-2 rounded-lg bg-white/10 border border-white/10 text-sm"
                  />
                </div>
                <div>
                  <div className="text-[11px] uppercase text-white/40 mb-1">1 fechado =</div>
                  <input
                    value={l.fatorDraft}
                    onChange={(e) => mudar(l.item_id, { fatorDraft: e.target.value })}
                    placeholder="30"
                    inputMode="decimal"
                    className="w-full px-2 py-2 rounded-lg bg-white/10 border border-white/10 text-sm text-center"
                  />
                </div>
                <label className="flex items-end gap-2 text-xs text-white/70 pb-2">
                  <input type="checkbox" checked={l.fracaoDraft} onChange={(e) => mudar(l.item_id, { fracaoDraft: e.target.checked })} />
                  aceita fração (garrafa aberta)
                </label>
                <input
                  value={l.dicaDraft}
                  onChange={(e) => mudar(l.item_id, { dicaDraft: e.target.value })}
                  placeholder="Dica na tela: ex. conte só as cartelas fechadas"
                  className="col-span-2 sm:col-span-4 px-2 py-2 rounded-lg bg-white/10 border border-white/10 text-sm"
                />
              </div>

              {/* Salvar */}
              <div className="lg:col-span-1 flex lg:justify-end">
                <button
                  onClick={() => salvar(l)}
                  disabled={l.salvando}
                  className={`px-4 py-3 rounded-xl font-bold flex items-center gap-2 ${
                    l.salvo ? 'bg-emerald-500/20 text-emerald-300' : 'bg-[#D4AF37] text-black'
                  }`}
                >
                  {l.salvando ? <Loader className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                  {l.salvo ? 'Salvo' : 'Salvar'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Configurar;
