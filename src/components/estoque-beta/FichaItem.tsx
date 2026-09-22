import React, { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Camera, Check, FileText, Loader, Pencil, Power, Save, X } from 'lucide-react';
import { betaApi, emojiDaCategoria, fmt, moeda, type Controle } from './api';
import { consultasApi, type FichaItem as Ficha, type ItemSalvar } from './apiConsultas';

interface Props {
  itemId: string;
  onVoltar: () => void;
  onExtrato: (itemId: string) => void;
}

type Grupo = NonNullable<ItemSalvar['grupo_controle']>;
type Classe = ItemSalvar['classe_compra'];

const UNIDADES = ['unidade', 'kg', 'g', 'litro', 'pacote', 'caixa'];
const OUTRA = '__outra__';

const ROTULO_GRUPO: Record<Grupo, string> = { vende: 'Vende', conta: 'Conta', gasta: 'Gasta' };
const ROTULO_CLASSE: Record<NonNullable<Classe>, string> = { rua: 'Rua', pedido: 'Pedido', sob_demanda: 'Sob demanda' };
const CLASSES: Array<{ valor: Classe; rotulo: string }> = [
  { valor: 'rua', rotulo: 'Rua' },
  { valor: 'pedido', rotulo: 'Pedido' },
  { valor: 'sob_demanda', rotulo: 'Sob demanda' },
  { valor: null, rotulo: 'Nenhuma' },
];
const GRUPOS: Array<{ valor: Grupo; frase: string }> = [
  { valor: 'vende', frase: 'baixa sozinho pela ficha técnica' },
  { valor: 'conta', frase: 'consumo é a diferença entre contagens' },
  { valor: 'gasta', frase: 'vira despesa ao sair do Central' },
];

const inputCls = 'w-full px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white';
const chipCls = (ativo: boolean) =>
  `px-3 py-2 rounded-xl font-bold text-sm ${ativo ? 'bg-[#D4AF37] text-black' : 'bg-white/10 text-white/70'}`;

/** "2026-09-22..." -> "22/09" ou "22/09/2026". Sem Date para não escorregar de fuso. */
function dataBR(valor: string | null | undefined, comAno: boolean): string {
  if (!valor) return 'nunca';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor);
  if (!m) return valor;
  return comAno ? `${m[3]}/${m[2]}/${m[1]}` : `${m[3]}/${m[2]}`;
}

function numeroOuNull(texto: string): number | null {
  const t = texto.trim().replace(',', '.');
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

interface BotaoSalvarProps {
  acao: () => Promise<void>;
  rotulo?: string;
  className?: string;
  onErro: (mensagem: string) => void;
}

/** Botão que mostra "Salvo" por 2 segundos depois de uma ação bem-sucedida. */
const BotaoSalvar: React.FC<BotaoSalvarProps> = ({ acao, rotulo = 'Salvar', className = '', onErro }) => {
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  useEffect(() => {
    if (!salvo) return;
    const t = setTimeout(() => setSalvo(false), 2000);
    return () => clearTimeout(t);
  }, [salvo]);

  const clicar = async () => {
    setSalvando(true);
    try {
      await acao();
      setSalvo(true);
    } catch (e) {
      onErro(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <button
      onClick={clicar}
      disabled={salvando}
      className={`px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-60 ${
        salvo ? 'bg-emerald-500/20 text-emerald-300' : 'bg-[#D4AF37] text-black'
      } ${className}`}
    >
      {salvando ? <Loader className="w-4 h-4 animate-spin" /> : salvo ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
      {salvo ? 'Salvo' : rotulo}
    </button>
  );
};

const Etiqueta: React.FC<{ children: React.ReactNode; cor?: 'vinho' | 'ouro' | 'cinza' | 'verde' }> = ({ children, cor = 'cinza' }) => {
  const cores = {
    vinho: 'bg-[#7d1f2c] text-white',
    ouro: 'bg-[#D4AF37]/20 text-[#D4AF37]',
    cinza: 'bg-white/10 text-white/60',
    verde: 'bg-emerald-500/20 text-emerald-300',
  };
  return <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${cores[cor]}`}>{children}</span>;
};

const Cartao: React.FC<{ titulo: string; children: React.ReactNode }> = ({ titulo, children }) => (
  <div className="rounded-2xl bg-white/5 border border-white/10 p-4 space-y-3">
    <h2 className="font-black text-lg">{titulo}</h2>
    {children}
  </div>
);

interface NivelDraft {
  nivel: string;
  controle: Controle;
}

interface FormEdicao {
  nome: string;
  categoria: string;
  categoriaLivre: string;
  unidade: string;
  tipo: ItemSalvar['tipo_item'];
  codigo: string;
  ponto: string;
  minimo: string;
  classe: Classe;
  grupo: Grupo | null;
  cmv: boolean;
}

/** Ficha completa de um item: onde está, como se conta, níveis, compra, uso e cadastro. */
const FichaItem: React.FC<Props> = ({ itemId, onVoltar, onExtrato }) => {
  const [ficha, setFicha] = useState<Ficha | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // como se conta
  const [rotuloSolto, setRotuloSolto] = useState('');
  const [rotuloFechado, setRotuloFechado] = useState('');
  const [fator, setFator] = useState('');
  const [fracao, setFracao] = useState(false);
  const [dica, setDica] = useState('');

  const [niveis, setNiveis] = useState<Record<string, NivelDraft>>({});
  const [ponto, setPonto] = useState('');
  const [fotoEnviando, setFotoEnviando] = useState(false);

  // edição do cadastro
  const [editando, setEditando] = useState(false);
  const [categorias, setCategorias] = useState<string[]>([]);
  const [form, setForm] = useState<FormEdicao | null>(null);
  const [salvandoCadastro, setSalvandoCadastro] = useState(false);
  const [erroCadastro, setErroCadastro] = useState<string | null>(null);
  const [mudandoStatus, setMudandoStatus] = useState(false);

  const carregar = useCallback(async (silencioso = false) => {
    if (!silencioso) setCarregando(true);
    setErro(null);
    try {
      const f = await consultasApi.fichaItem(itemId);
      setFicha(f);
      setRotuloSolto(f.config.rotulo_solto || 'unidade');
      setRotuloFechado(f.config.rotulo_fechado || '');
      setFator(f.config.fator_fechado != null ? String(f.config.fator_fechado) : '');
      setFracao(f.config.permite_fracao);
      setDica(f.config.dica || '');
      setPonto(f.item.ponto_reposicao != null ? String(f.item.ponto_reposicao) : '');
      const drafts: Record<string, NivelDraft> = {};
      for (const n of f.niveis) {
        drafts[n.estoque_id] = {
          nivel: n.nivel != null ? String(n.nivel) : '',
          controle: n.controle || (f.item.tem_ficha ? 'venda' : 'contagem'),
        };
      }
      setNiveis(drafts);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao carregar');
    } finally {
      if (!silencioso) setCarregando(false);
    }
  }, [itemId]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const mostrarErro = (m: string) => setErro(m);

  const enviarFoto = async (arquivo: File | null) => {
    if (!arquivo || !ficha) return;
    setFotoEnviando(true);
    setErro(null);
    try {
      const url = await betaApi.fotoItem(itemId, arquivo);
      setFicha({ ...ficha, config: { ...ficha.config, foto_url: url } });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao enviar foto');
    } finally {
      setFotoEnviando(false);
    }
  };

  const salvarComoConta = async () => {
    await betaApi.configItem(itemId, {
      rotulo_solto: rotuloSolto.trim() || 'unidade',
      rotulo_fechado: rotuloFechado.trim() || null,
      fator_fechado: numeroOuNull(fator),
      permite_fracao: fracao,
      dica: dica.trim() || null,
    });
    await carregar(true);
  };

  const salvarNivel = async (estoqueId: string) => {
    const d = niveis[estoqueId];
    if (!d) return;
    await betaApi.nivelDefinir(estoqueId, itemId, numeroOuNull(d.nivel) ?? 0, d.controle);
    await carregar(true);
  };

  const mudarNivel = (estoqueId: string, mudanca: Partial<NivelDraft>) =>
    setNiveis((atual) => ({ ...atual, [estoqueId]: { ...atual[estoqueId], ...mudanca } }));

  const salvarPonto = async () => {
    await consultasApi.pontoDefinir(itemId, numeroOuNull(ponto) ?? 0);
    await carregar(true);
  };

  const abrirEdicao = async () => {
    if (!ficha) return;
    setErroCadastro(null);
    let lista: string[] = [];
    try {
      lista = (await consultasApi.categorias()).map((c) => c.categoria).filter(Boolean);
    } catch {
      lista = [];
    }
    setCategorias(lista);
    const i = ficha.item;
    const categoriaAtual = i.categoria || '';
    const conhecida = categoriaAtual && lista.includes(categoriaAtual);
    setForm({
      nome: i.nome,
      categoria: conhecida ? categoriaAtual : OUTRA,
      categoriaLivre: conhecida ? '' : categoriaAtual,
      unidade: i.unidade || 'unidade',
      tipo: i.tipo_item,
      codigo: i.codigo || '',
      ponto: i.ponto_reposicao != null ? String(i.ponto_reposicao) : '',
      minimo: i.estoque_minimo != null ? String(i.estoque_minimo) : '',
      classe: i.classe_compra,
      grupo: i.grupo_controle,
      cmv: i.entra_no_cmv ?? true,
    });
    setEditando(true);
  };

  const mudarForm = (mudanca: Partial<FormEdicao>) => setForm((f) => (f ? { ...f, ...mudanca } : f));

  const salvarCadastro = async () => {
    if (!form) return;
    const nome = form.nome.trim();
    const categoria = form.categoria === OUTRA ? form.categoriaLivre.trim() : form.categoria;
    if (!nome) { setErroCadastro('Escreva o nome do item.'); return; }
    if (!categoria) { setErroCadastro('Escolha ou escreva a categoria.'); return; }
    setSalvandoCadastro(true);
    setErroCadastro(null);
    try {
      await consultasApi.itemSalvar({
        id: itemId,
        nome,
        categoria,
        unidade_medida: form.unidade,
        tipo_item: form.tipo,
        ponto_reposicao: numeroOuNull(form.ponto) ?? 0,
        estoque_minimo: numeroOuNull(form.minimo) ?? 0,
        classe_compra: form.classe,
        grupo_controle: form.grupo,
        codigo: form.codigo.trim() || null,
        entra_no_cmv: form.cmv,
      });
      setEditando(false);
      await carregar(true);
    } catch (e) {
      setErroCadastro(e instanceof Error ? e.message : 'Erro ao salvar');
    } finally {
      setSalvandoCadastro(false);
    }
  };

  const mudarStatus = async () => {
    if (!ficha) return;
    const inativar = ficha.item.status === 'ativo';
    const pergunta = inativar
      ? `Inativar "${ficha.item.nome}"? Ele some das listas, mas o histórico fica.`
      : `Reativar "${ficha.item.nome}"?`;
    if (!window.confirm(pergunta)) return;
    setMudandoStatus(true);
    setErro(null);
    try {
      await consultasApi.itemStatus(itemId, inativar ? 'inativo' : 'ativo');
      if (inativar) onVoltar();
      else await carregar(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao mudar status');
    } finally {
      setMudandoStatus(false);
    }
  };

  const fatorNumero = numeroOuNull(fator);
  const soltoExemplo = rotuloSolto.trim() || 'unidade';
  const fechadoExemplo = rotuloFechado.trim() || 'fechado';
  const totalSaldo = ficha ? ficha.saldos.reduce((s, x) => s + x.saldo, 0) : 0;
  const totalValor = ficha ? ficha.saldos.reduce((s, x) => s + x.valor, 0) : 0;

  return (
    <div className="min-h-screen text-white" style={{ background: '#0d0f1a' }}>
      <div className="px-4 pt-4 pb-3 border-b border-white/10">
        <button onClick={onVoltar} className="flex items-center gap-1 text-white/70 py-2">
          <ArrowLeft className="w-5 h-5" /> Voltar
        </button>
        <h1 className="font-black text-3xl mt-1">Ficha do item</h1>
      </div>

      {erro && (
        <div className="mx-4 mt-3 rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 px-4 py-3 flex items-start justify-between gap-2">
          <span>{erro}</span>
          <button onClick={() => setErro(null)} className="p-1 text-red-200/70"><X className="w-4 h-4" /></button>
        </div>
      )}

      {carregando || !ficha ? (
        <div className="p-10 text-center text-white/50">{carregando ? 'Carregando...' : 'Item não encontrado.'}</div>
      ) : (
        <div className="p-4 space-y-4 max-w-2xl mx-auto">
          {/* Cabeçalho com foto grande */}
          <div className={`rounded-3xl overflow-hidden bg-white/5 border-2 ${ficha.item.status === 'ativo' ? 'border-[#D4AF37]' : 'border-white/10'}`}>
            <label className="relative h-48 bg-black/30 flex items-center justify-center cursor-pointer">
              {ficha.config.foto_url ? (
                <img src={ficha.config.foto_url} alt={ficha.item.nome} className="w-full h-full object-cover" />
              ) : (
                <span className="text-8xl">{emojiDaCategoria(ficha.item.categoria)}</span>
              )}
              <span className="absolute bottom-3 right-3 px-3 py-2 rounded-xl bg-black/70 text-sm font-bold flex items-center gap-2">
                {fotoEnviando ? <Loader className="w-4 h-4 animate-spin" /> : <Camera className="w-4 h-4" />}
                {ficha.config.foto_url ? 'Trocar foto' : 'Tirar foto'}
              </span>
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                disabled={fotoEnviando}
                onChange={(e) => { enviarFoto(e.target.files?.[0] || null); e.target.value = ''; }}
              />
            </label>
            <div className="p-4">
              <div className="font-black text-2xl leading-tight">{ficha.item.nome}</div>
              <div className="text-white/50 text-sm">
                {ficha.item.categoria || 'Sem categoria'}
                {ficha.item.codigo && <span> · cód. {ficha.item.codigo}</span>}
              </div>
              <div className="flex flex-wrap gap-2 mt-2">
                <Etiqueta cor={ficha.item.status === 'ativo' ? 'verde' : 'cinza'}>{ficha.item.status}</Etiqueta>
                <Etiqueta cor="ouro">{ficha.item.tipo_item === 'insumo' ? 'insumo' : 'produto final'}</Etiqueta>
                {ficha.item.grupo_controle && <Etiqueta cor="vinho">{ROTULO_GRUPO[ficha.item.grupo_controle]}</Etiqueta>}
                {ficha.item.tem_ficha && <Etiqueta>tem ficha técnica</Etiqueta>}
                {ficha.item.produzido_por_ficha && <Etiqueta>produzido por ficha</Etiqueta>}
              </div>
            </div>
          </div>

          <button
            onClick={() => onExtrato(itemId)}
            className="w-full h-14 rounded-2xl bg-white/10 border border-white/10 font-black text-lg flex items-center justify-center gap-2"
          >
            <FileText className="w-5 h-5" /> Ver extrato
          </button>

          {/* a) Onde está */}
          <Cartao titulo="Onde está">
            {ficha.saldos.length === 0 ? (
              <div className="text-white/50">Sem saldo em nenhum estoque.</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {ficha.saldos.map((s) => (
                  <div
                    key={s.estoque_id}
                    className={`px-3 py-2 rounded-xl border ${s.saldo < 0 ? 'bg-red-500/15 border-red-500/40' : 'bg-white/5 border-white/10'}`}
                  >
                    <div className="text-xs text-white/50">{s.nome}</div>
                    <div className={`font-black text-xl ${s.saldo < 0 ? 'text-red-300' : ''}`}>
                      {fmt(s.saldo)} <span className="text-sm font-normal text-white/50">{ficha.config.rotulo_solto}</span>
                    </div>
                    <div className="text-xs text-white/40">{moeda(s.valor)}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex items-baseline justify-between border-t border-white/10 pt-2">
              <span className="text-white/60">Total</span>
              <span className={`font-black text-2xl ${totalSaldo < 0 ? 'text-red-300' : ''}`}>
                {fmt(totalSaldo)} <span className="text-sm font-normal text-white/50">{ficha.config.rotulo_solto}</span>
                <span className="text-sm font-normal text-white/40 ml-2">{moeda(totalValor)}</span>
              </span>
            </div>
          </Cartao>

          {/* b) Como se conta */}
          <Cartao titulo="Como se conta">
            <div className="grid grid-cols-3 gap-2">
              <div>
                <div className="text-[11px] uppercase text-white/40 mb-1">Solto</div>
                <input value={rotuloSolto} onChange={(e) => setRotuloSolto(e.target.value)} placeholder="ovo" className={inputCls} />
              </div>
              <div>
                <div className="text-[11px] uppercase text-white/40 mb-1">Fechado</div>
                <input value={rotuloFechado} onChange={(e) => setRotuloFechado(e.target.value)} placeholder="cartela" className={inputCls} />
              </div>
              <div>
                <div className="text-[11px] uppercase text-white/40 mb-1">1 fechado =</div>
                <input value={fator} onChange={(e) => setFator(e.target.value)} placeholder="30" inputMode="decimal" className={`${inputCls} text-center`} />
              </div>
            </div>
            {fatorNumero != null && fatorNumero > 0 && (
              <div className="rounded-xl bg-[#D4AF37]/10 border border-[#D4AF37]/40 px-3 py-2 text-sm">
                Exemplo: 2 {fechadoExemplo} + 7 {soltoExemplo} = <b>{fmt(2 * fatorNumero + 7)} {soltoExemplo}</b>
              </div>
            )}
            <label className="flex items-center gap-2 text-sm text-white/70">
              <input type="checkbox" checked={fracao} onChange={(e) => setFracao(e.target.checked)} />
              aceita fração (garrafa aberta)
            </label>
            <input
              value={dica}
              onChange={(e) => setDica(e.target.value)}
              placeholder="Dica na tela: ex. conte só as cartelas fechadas"
              className={inputCls}
            />
            <BotaoSalvar acao={salvarComoConta} onErro={mostrarErro} className="w-full" />
          </Cartao>

          {/* c) Níveis nos balcões */}
          <Cartao titulo="Níveis nos balcões">
            {ficha.niveis.length === 0 ? (
              <div className="text-white/50">Nenhum balcão cadastrado.</div>
            ) : (
              ficha.niveis.map((n) => {
                const d = niveis[n.estoque_id] || { nivel: '', controle: 'contagem' as Controle };
                return (
                  <div key={n.estoque_id} className="rounded-xl bg-white/5 border border-white/10 p-3 space-y-2">
                    <div className="font-bold">{n.nome}</div>
                    <div className="flex flex-wrap items-end gap-2">
                      <div>
                        <div className="text-[11px] uppercase text-white/40 mb-1">Nível</div>
                        <input
                          value={d.nivel}
                          onChange={(e) => mudarNivel(n.estoque_id, { nivel: e.target.value })}
                          inputMode="decimal"
                          placeholder="0"
                          className="w-24 px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white text-center font-bold"
                        />
                      </div>
                      <div>
                        <div className="text-[11px] uppercase text-white/40 mb-1">Como baixa</div>
                        <div className="flex rounded-lg overflow-hidden border border-white/10">
                          <button
                            onClick={() => mudarNivel(n.estoque_id, { controle: 'venda' })}
                            className={`px-3 py-2 text-sm font-bold ${d.controle === 'venda' ? 'bg-[#7d1f2c] text-white' : 'bg-white/5 text-white/50'}`}
                          >
                            Vende
                          </button>
                          <button
                            onClick={() => mudarNivel(n.estoque_id, { controle: 'contagem' })}
                            className={`px-3 py-2 text-sm font-bold ${d.controle === 'contagem' ? 'bg-[#7d1f2c] text-white' : 'bg-white/5 text-white/50'}`}
                          >
                            Conta
                          </button>
                        </div>
                      </div>
                      <BotaoSalvar acao={() => salvarNivel(n.estoque_id)} onErro={mostrarErro} className="ml-auto" />
                    </div>
                  </div>
                );
              })
            )}
          </Cartao>

          {/* d) Compra */}
          <Cartao titulo="Compra">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <div className="text-[11px] uppercase text-white/40 mb-1">Ponto de pedido</div>
                <input
                  value={ponto}
                  onChange={(e) => setPonto(e.target.value)}
                  inputMode="decimal"
                  placeholder="0"
                  className="w-28 px-3 py-2 rounded-lg bg-white/10 border border-white/10 text-white text-center font-bold"
                />
              </div>
              <BotaoSalvar acao={salvarPonto} onErro={mostrarErro} />
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl bg-white/5 p-2">
                <div className="text-[11px] uppercase text-white/40">Classe</div>
                <div className="font-bold">{ficha.item.classe_compra ? ROTULO_CLASSE[ficha.item.classe_compra] : 'Nenhuma'}</div>
              </div>
              <div className="rounded-xl bg-white/5 p-2">
                <div className="text-[11px] uppercase text-white/40">Custo médio</div>
                <div className="font-bold">{moeda(ficha.item.custo_medio)}</div>
              </div>
              <div className="rounded-xl bg-white/5 p-2">
                <div className="text-[11px] uppercase text-white/40">Consumo/dia</div>
                <div className="font-bold">{fmt(ficha.consumo_dia)} {ficha.config.rotulo_solto}</div>
              </div>
            </div>
            <div>
              <div className="text-[11px] uppercase text-white/40 mb-1">Últimas compras</div>
              {ficha.compras.length === 0 ? (
                <div className="text-white/50 text-sm">Nenhuma compra registrada.</div>
              ) : (
                <div className="divide-y divide-white/10">
                  {ficha.compras.map((c, idx) => (
                    <div key={`${c.data}-${idx}`} className="py-2 flex items-center gap-3 text-sm">
                      <span className="text-white/50 w-12 flex-shrink-0">{dataBR(c.data, false)}</span>
                      <span className="flex-1 truncate">{c.fornecedor || 'Sem fornecedor'}</span>
                      <span className="font-bold">{fmt(c.quantidade)} {ficha.item.unidade || ''}</span>
                      <span className="text-white/60">{moeda(c.custo_unitario)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Cartao>

          {/* e) Usado em */}
          <Cartao titulo="Usado em">
            {ficha.fichas_que_usam.length === 0 ? (
              <div className="text-white/50">Nenhuma ficha técnica usa este item</div>
            ) : (
              <div className="divide-y divide-white/10">
                {ficha.fichas_que_usam.map((f) => (
                  <div key={f.ficha_id} className="py-2 flex items-center justify-between gap-3">
                    <span className="truncate">{f.nome}</span>
                    <span className="font-bold whitespace-nowrap">{fmt(f.quantidade)} {f.unidade || ''}</span>
                  </div>
                ))}
              </div>
            )}
          </Cartao>

          {/* f) Datas */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <div className="text-[11px] uppercase text-white/40">Última contagem</div>
              <div className="font-bold text-lg">{dataBR(ficha.ultima_contagem, true)}</div>
            </div>
            <div className="rounded-2xl bg-white/5 border border-white/10 p-3">
              <div className="text-[11px] uppercase text-white/40">Último movimento</div>
              <div className="font-bold text-lg">{dataBR(ficha.ultimo_movimento, true)}</div>
            </div>
          </div>

          {/* Editar cadastro */}
          {!editando || !form ? (
            <button
              onClick={abrirEdicao}
              className="w-full h-14 rounded-2xl bg-white/10 border border-white/10 font-black text-lg flex items-center justify-center gap-2"
            >
              <Pencil className="w-5 h-5" /> Editar cadastro
            </button>
          ) : (
            <div className="rounded-2xl bg-white/5 border border-[#D4AF37] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-black text-xl">Editar cadastro</h2>
                <button onClick={() => setEditando(false)} className="p-2 text-white/60"><X className="w-5 h-5" /></button>
              </div>

              <div>
                <div className="text-[11px] uppercase text-white/40 mb-1">Nome *</div>
                <input value={form.nome} onChange={(e) => mudarForm({ nome: e.target.value })} className={inputCls} />
              </div>

              <div>
                <div className="text-[11px] uppercase text-white/40 mb-1">Categoria</div>
                <select value={form.categoria} onChange={(e) => mudarForm({ categoria: e.target.value })} className={inputCls}>
                  {categorias.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                  <option value={OUTRA}>Outra...</option>
                </select>
                {form.categoria === OUTRA && (
                  <input
                    value={form.categoriaLivre}
                    onChange={(e) => mudarForm({ categoriaLivre: e.target.value })}
                    placeholder="Nome da categoria"
                    className={`${inputCls} mt-2`}
                  />
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] uppercase text-white/40 mb-1">Unidade</div>
                  <select value={form.unidade} onChange={(e) => mudarForm({ unidade: e.target.value })} className={inputCls}>
                    {(UNIDADES.includes(form.unidade) ? UNIDADES : [form.unidade, ...UNIDADES]).map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <div className="text-[11px] uppercase text-white/40 mb-1">Tipo</div>
                  <select value={form.tipo} onChange={(e) => mudarForm({ tipo: e.target.value as ItemSalvar['tipo_item'] })} className={inputCls}>
                    <option value="insumo">Insumo</option>
                    <option value="produto_final">Produto final</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <div className="text-[11px] uppercase text-white/40 mb-1">Código</div>
                  <input value={form.codigo} onChange={(e) => mudarForm({ codigo: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <div className="text-[11px] uppercase text-white/40 mb-1">Ponto de pedido</div>
                  <input value={form.ponto} onChange={(e) => mudarForm({ ponto: e.target.value })} inputMode="decimal" className={inputCls} />
                </div>
                <div>
                  <div className="text-[11px] uppercase text-white/40 mb-1">Estoque mínimo</div>
                  <input value={form.minimo} onChange={(e) => mudarForm({ minimo: e.target.value })} inputMode="decimal" className={inputCls} />
                </div>
              </div>

              <div>
                <div className="text-[11px] uppercase text-white/40 mb-1">Classe de compra</div>
                <div className="flex flex-wrap gap-2">
                  {CLASSES.map((c) => (
                    <button key={c.rotulo} onClick={() => mudarForm({ classe: c.valor })} className={chipCls(form.classe === c.valor)}>
                      {c.rotulo}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-[11px] uppercase text-white/40 mb-1">Como baixa</div>
                <div className="space-y-2">
                  {GRUPOS.map((g) => (
                    <button
                      key={g.valor}
                      onClick={() => mudarForm({ grupo: g.valor })}
                      className={`w-full text-left px-3 py-2 rounded-xl border ${
                        form.grupo === g.valor ? 'bg-[#7d1f2c] border-[#7d1f2c] text-white' : 'bg-white/5 border-white/10 text-white/70'
                      }`}
                    >
                      <span className="font-bold">{ROTULO_GRUPO[g.valor]}</span>
                      <span className="text-sm opacity-80">: {g.frase}</span>
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-white/70">
                <input type="checkbox" checked={form.cmv} onChange={(e) => mudarForm({ cmv: e.target.checked })} />
                entra no CMV
              </label>

              {erroCadastro && (
                <div className="rounded-xl bg-red-500/15 border border-red-500/40 text-red-200 px-4 py-3">{erroCadastro}</div>
              )}

              <button
                onClick={salvarCadastro}
                disabled={salvandoCadastro}
                className="w-full h-14 rounded-2xl bg-[#D4AF37] disabled:opacity-50 text-black font-black text-lg flex items-center justify-center gap-2"
              >
                {salvandoCadastro ? <Loader className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                Salvar cadastro
              </button>
            </div>
          )}

          <button
            onClick={mudarStatus}
            disabled={mudandoStatus}
            className={`w-full h-14 rounded-2xl font-black text-lg flex items-center justify-center gap-2 disabled:opacity-50 ${
              ficha.item.status === 'ativo'
                ? 'bg-red-500/15 border border-red-500/40 text-red-200'
                : 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-200'
            }`}
          >
            {mudandoStatus ? <Loader className="w-5 h-5 animate-spin" /> : <Power className="w-5 h-5" />}
            {ficha.item.status === 'ativo' ? 'Inativar item' : 'Reativar item'}
          </button>
        </div>
      )}
    </div>
  );
};

export default FichaItem;
