import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Loader, Plus, Save, Search, X } from 'lucide-react';
import { emojiDaCategoria, fmt } from './api';
import { consultasApi, type ItemLista, type ItemSalvar } from './apiConsultas';

interface Props {
  onVoltar: () => void;
  onAbrirItem: (itemId: string) => void;
}

type Status = 'ativo' | 'inativo' | 'todos';
type Grupo = NonNullable<ItemSalvar['grupo_controle']>;
type Classe = ItemSalvar['classe_compra'];

const UNIDADES = ['unidade', 'kg', 'g', 'litro', 'pacote', 'caixa'];
const OUTRA = '__outra__';
const SEM_CATEGORIA = 'Sem categoria';

const GRUPOS: Array<{ valor: Grupo; rotulo: string; frase: string }> = [
  { valor: 'vende', rotulo: 'Vende', frase: 'baixa sozinho pela ficha técnica' },
  { valor: 'conta', rotulo: 'Conta', frase: 'consumo é a diferença entre contagens' },
  { valor: 'gasta', rotulo: 'Gasta', frase: 'vira despesa ao sair do Central' },
];

const CLASSES: Array<{ valor: Classe; rotulo: string }> = [
  { valor: 'rua', rotulo: 'Rua' },
  { valor: 'pedido', rotulo: 'Pedido' },
  { valor: 'sob_demanda', rotulo: 'Sob demanda' },
  { valor: null, rotulo: 'Nenhuma' },
];

const ROTULO_GRUPO: Record<Grupo, string> = { vende: 'Vende', conta: 'Conta', gasta: 'Gasta' };

interface FormNovo {
  nome: string;
  categoria: string;
  categoriaLivre: string;
  unidade: string;
  tipo: ItemSalvar['tipo_item'];
  ponto: string;
  grupo: Grupo;
  classe: Classe;
}

const formVazio = (primeiraCategoria: string | undefined): FormNovo => ({
  nome: '',
  categoria: primeiraCategoria ?? OUTRA,
  categoriaLivre: '',
  unidade: 'unidade',
  tipo: 'insumo',
  ponto: '',
  grupo: 'conta',
  classe: 'pedido',
});

/** Lista de itens do estoque: busca, filtros e cadastro rápido. Tocar num item abre a ficha. */
const Itens: React.FC<Props> = ({ onVoltar, onAbrirItem }) => {
  const [termo, setTermo] = useState('');
  const [termoBusca, setTermoBusca] = useState('');
  const [status, setStatus] = useState<Status>('ativo');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [itens, setItens] = useState<ItemLista[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [mostrarForm, setMostrarForm] = useState(false);
  const [form, setForm] = useState<FormNovo>(() => formVazio(undefined));
  const [salvando, setSalvando] = useState(false);
  const [erroForm, setErroForm] = useState<string | null>(null);

  // busca com debounce de 250ms
  useEffect(() => {
    const t = setTimeout(() => setTermoBusca(termo.trim()), 250);
    return () => clearTimeout(t);
  }, [termo]);

  useEffect(() => {
    let vivo = true;
    consultasApi
      .categorias()
      .then((c) => { if (vivo) setCategorias(c.map((x) => x.categoria).filter(Boolean)); })
      .catch(() => { if (vivo) setCategorias([]); });
    return () => { vivo = false; };
  }, []);

  const carregar = useCallback(async () => {
    setCarregando(true);
    setErro(null);
    try {
      const lista = await consultasApi.itensListar(status, termoBusca || null, categoria);
      setItens(lista);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar itens');
    } finally {
      setCarregando(false);
    }
  }, [status, termoBusca, categoria]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const grupos = useMemo(() => {
    const mapa = new Map<string, ItemLista[]>();
    for (const i of itens) {
      const chave = i.categoria || SEM_CATEGORIA;
      const lista = mapa.get(chave);
      if (lista) lista.push(i);
      else mapa.set(chave, [i]);
    }
    return Array.from(mapa.entries()).sort(([a], [b]) => {
      if (a === SEM_CATEGORIA) return 1;
      if (b === SEM_CATEGORIA) return -1;
      return a.localeCompare(b);
    });
  }, [itens]);

  const abrirForm = () => {
    setForm(formVazio(categorias[0]));
    setErroForm(null);
    setMostrarForm(true);
  };

  const mudar = (mudanca: Partial<FormNovo>) => setForm((f) => ({ ...f, ...mudanca }));

  const categoriaFinal = form.categoria === OUTRA ? form.categoriaLivre.trim() : form.categoria;

  const salvarNovo = async () => {
    const nome = form.nome.trim();
    if (!nome) { setErroForm('Escreva o nome do item.'); return; }
    if (!categoriaFinal) { setErroForm('Escolha ou escreva a categoria.'); return; }
    setSalvando(true);
    setErroForm(null);
    try {
      const novoId = await consultasApi.itemSalvar({
        id: null,
        nome,
        categoria: categoriaFinal,
        unidade_medida: form.unidade,
        tipo_item: form.tipo,
        ponto_reposicao: Number(form.ponto.replace(',', '.')) || 0,
        estoque_minimo: 0,
        classe_compra: form.classe,
        grupo_controle: form.grupo,
        codigo: null,
        entra_no_cmv: true,
      });
      onAbrirItem(novoId);
    } catch (e) {
      setErroForm(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  const inputCls = 'w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white';
  const chipCls = (ativo: boolean) =>
    `px-4 py-2 rounded-xl font-bold ${ativo ? 'bg-[#D4AF37] text-black' : 'bg-white/10 text-white/70'}`;

  return (
    <div className="min-h-screen text-white" style={{ background: '#0d0f1a' }}>
      <div className="px-4 pt-4 pb-3 border-b border-white/10">
        <button onClick={onVoltar} className="flex items-center gap-1 text-white/70 py-2">
          <ArrowLeft className="w-5 h-5" /> Voltar
        </button>
        <h1 className="font-black text-3xl mt-1">Itens</h1>
        <p className="text-white/60">Tudo que o estoque conhece. Toque num item para ver a ficha.</p>
      </div>

      <div className="px-4 py-3 space-y-3 max-w-2xl mx-auto">
        <div className="flex items-center gap-2 bg-white/10 rounded-2xl px-4">
          <Search className="w-6 h-6 text-white/40" />
          <input
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            placeholder="Nome ou código..."
            className="flex-1 bg-transparent py-3 text-white text-lg outline-none"
          />
          {termo && (
            <button onClick={() => setTermo('')} className="p-1 text-white/50">
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setStatus('ativo')} className={chipCls(status === 'ativo')}>Ativos</button>
          <button onClick={() => setStatus('inativo')} className={chipCls(status === 'inativo')}>Inativos</button>
          <button onClick={() => setStatus('todos')} className={chipCls(status === 'todos')}>Todos</button>
          <select
            value={categoria ?? ''}
            onChange={(e) => setCategoria(e.target.value || null)}
            className="ml-auto px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white"
          >
            <option value="">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>

        {!mostrarForm ? (
          <button
            onClick={abrirForm}
            className="w-full h-16 rounded-2xl bg-[#D4AF37] text-black font-black text-xl flex items-center justify-center gap-2"
          >
            <Plus className="w-7 h-7" /> Novo item
          </button>
        ) : (
          <div className="rounded-2xl bg-white/5 border border-[#D4AF37] p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-black text-xl">Novo item</h2>
              <button onClick={() => setMostrarForm(false)} className="p-2 text-white/60">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <div className="text-[11px] uppercase text-white/40 mb-1">Nome *</div>
              <input value={form.nome} onChange={(e) => mudar({ nome: e.target.value })} placeholder="ex. Ovo branco" className={inputCls} autoFocus />
            </div>

            <div>
              <div className="text-[11px] uppercase text-white/40 mb-1">Categoria</div>
              <select value={form.categoria} onChange={(e) => mudar({ categoria: e.target.value })} className={inputCls}>
                {categorias.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
                <option value={OUTRA}>Outra...</option>
              </select>
              {form.categoria === OUTRA && (
                <input
                  value={form.categoriaLivre}
                  onChange={(e) => mudar({ categoriaLivre: e.target.value })}
                  placeholder="Nome da nova categoria"
                  className={`${inputCls} mt-2`}
                />
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <div className="text-[11px] uppercase text-white/40 mb-1">Unidade</div>
                <select value={form.unidade} onChange={(e) => mudar({ unidade: e.target.value })} className={inputCls}>
                  {UNIDADES.map((u) => (
                    <option key={u} value={u}>{u}</option>
                  ))}
                </select>
              </div>
              <div>
                <div className="text-[11px] uppercase text-white/40 mb-1">Tipo</div>
                <select value={form.tipo} onChange={(e) => mudar({ tipo: e.target.value as ItemSalvar['tipo_item'] })} className={inputCls}>
                  <option value="insumo">Insumo</option>
                  <option value="produto_final">Produto final</option>
                </select>
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase text-white/40 mb-1">Ponto de pedido</div>
              <input value={form.ponto} onChange={(e) => mudar({ ponto: e.target.value })} inputMode="decimal" placeholder="0" className={inputCls} />
            </div>

            <div>
              <div className="text-[11px] uppercase text-white/40 mb-1">Como baixa</div>
              <div className="space-y-2">
                {GRUPOS.map((g) => (
                  <button
                    key={g.valor}
                    onClick={() => mudar({ grupo: g.valor })}
                    className={`w-full text-left px-3 py-2 rounded-xl border ${
                      form.grupo === g.valor ? 'bg-[#7d1f2c] border-[#7d1f2c] text-white' : 'bg-white/5 border-white/10 text-white/70'
                    }`}
                  >
                    <span className="font-bold">{g.rotulo}</span>
                    <span className="text-sm opacity-80">: {g.frase}</span>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[11px] uppercase text-white/40 mb-1">Classe de compra</div>
              <div className="flex flex-wrap gap-2">
                {CLASSES.map((c) => (
                  <button key={c.rotulo} onClick={() => mudar({ classe: c.valor })} className={chipCls(form.classe === c.valor)}>
                    {c.rotulo}
                  </button>
                ))}
              </div>
            </div>

            {erroForm && (
              <div className="rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 px-4 py-3">{erroForm}</div>
            )}

            <button
              onClick={salvarNovo}
              disabled={salvando}
              className="w-full h-14 rounded-2xl bg-[#D4AF37] disabled:opacity-50 text-black font-black text-lg flex items-center justify-center gap-2"
            >
              {salvando ? <Loader className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              Salvar e abrir
            </button>
          </div>
        )}

        {erro && (
          <div className="rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 px-4 py-3">{erro}</div>
        )}

        <div className="text-white/40 text-sm">{carregando ? 'Carregando...' : `${itens.length} itens`}</div>

        {!carregando && itens.length === 0 && (
          <div className="p-10 text-center text-white/50">Nenhum item encontrado.</div>
        )}

        {grupos.map(([nomeCategoria, lista]) => (
          <div key={nomeCategoria} className="space-y-2">
            <div className="flex items-center gap-2 pt-2">
              <span className="text-2xl">{emojiDaCategoria(nomeCategoria === SEM_CATEGORIA ? null : nomeCategoria)}</span>
              <h2 className="font-black text-lg">{nomeCategoria}</h2>
              <span className="text-white/40 text-sm">{lista.length}</span>
            </div>
            {lista.map((i) => (
              <button
                key={i.item_id}
                onClick={() => onAbrirItem(i.item_id)}
                className="w-full flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 p-3 text-left active:bg-white/10"
              >
                <div className="w-14 h-14 rounded-xl bg-black/30 flex items-center justify-center overflow-hidden flex-shrink-0">
                  {i.foto_url ? (
                    <img src={i.foto_url} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl">{emojiDaCategoria(i.categoria)}</span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-lg leading-tight truncate">{i.nome}</div>
                  {i.codigo && <div className="text-xs text-white/40">{i.codigo}</div>}
                  <div className="flex flex-wrap items-center gap-2 mt-1">
                    {i.grupo_controle && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-[#7d1f2c] text-white font-bold">
                        {ROTULO_GRUPO[i.grupo_controle]}
                      </span>
                    )}
                    {i.status === 'inativo' && (
                      <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/10 text-white/50 font-bold">inativo</span>
                    )}
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className={`font-black text-xl ${i.saldo_total < 0 ? 'text-red-300' : ''}`}>{fmt(i.saldo_total)}</div>
                  <div className="text-xs text-white/50">{i.rotulo_solto}</div>
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default Itens;
