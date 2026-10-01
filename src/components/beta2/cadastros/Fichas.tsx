import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, Plus, Trash2, X } from 'lucide-react';
import { Badge, Button, Input, PageHeader, Segmented, Select, Textarea } from '../../ui';
import ListaAgrupada, { type Grupo } from './ListaAgrupada';
import ExcluirModal from './ExcluirModal';
import { brl, cadastrosApi, semAcento, type FichaResumo, type IngredienteLinha, type ItemBasico } from './api';

type Filtro = 'ativas' | 'arquivadas' | 'todas';

/** Fichas técnicas: lista por tipo de consumo, edição em tela própria. */
const Fichas: React.FC = () => {
  const [lista, setLista] = useState<FichaResumo[] | null>(null);
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('ativas');
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [aberta, setAberta] = useState<string | 'nova' | null>(null);

  const carregar = async () => {
    setErro(null);
    try { setLista(await cadastrosApi.fichas()); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
  };
  useEffect(() => { void carregar(); }, []);

  const grupos = useMemo<Grupo[]>(() => {
    const t = semAcento(busca.trim());
    const vis = (lista || []).filter(f => (filtro === 'todas' || (filtro === 'ativas' ? f.ativo : !f.ativo)) && (!t || semAcento(f.nome).includes(t)));
    const porTipo = (tipo: string, titulo: string): Grupo => ({
      chave: tipo, titulo,
      linhas: vis.filter(f => f.tipo_consumo === tipo).map(f => ({
        id: f.id, titulo: f.nome.trim(), inativo: !f.ativo,
        sub: [`${f.ingredientes} ingrediente${f.ingredientes === 1 ? '' : 's'}`, brl(f.custo_total), f.porcoes > 1 ? `${f.porcoes} porções` : null].filter(Boolean).join(' · '),
        etiquetas: <>{f.vendas > 0 && <Badge variant="success">{f.vendas} venda{f.vendas > 1 ? 's' : ''} Zig</Badge>}{f.usada_em > 0 && <Badge variant="neutral">usada em {f.usada_em}</Badge>}{f.ingredientes === 0 && <Badge variant="warning">sem ingredientes</Badge>}{!f.ativo && <Badge variant="neutral">arquivada</Badge>}</>,
      })),
    });
    return [porTipo('venda_direta', 'Venda direta (a Zig baixa por esta ficha)'), porTipo('producao', 'Produção (vira item do estoque)')].filter(g => g.linhas.length > 0);
  }, [lista, busca, filtro]);

  if (aberta) {
    return <FichaEditor id={aberta === 'nova' ? null : aberta} fichas={lista || []} onVoltar={() => setAberta(null)}
      onSalvo={async (m) => { setAberta(null); setAviso(m); await carregar(); }} />;
  }

  return (
    <div className="max-w-5xl">
      <PageHeader caminho={['Estoque', 'Cadastros']} title="Fichas técnicas" subtitle={lista ? `${lista.filter(f => f.ativo).length} ativas · custo recalculado a cada ingrediente` : ' '}
        actions={<Button variante="primario" icone={<Plus size={16} />} onClick={() => setAberta('nova')}>Nova ficha</Button>} />
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <Input type="search" placeholder="Buscar ficha" aria-label="Buscar" value={busca} onChange={e => setBusca(e.target.value)} className="flex-1 min-w-[220px]" />
        <Segmented<Filtro> rotulo="Mostrar" valor={filtro} onMudar={setFiltro} opcoes={[{ valor: 'ativas', rotulo: 'Ativas' }, { valor: 'arquivadas', rotulo: 'Arquivadas' }, { valor: 'todas', rotulo: 'Todas' }]} />
      </div>
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-certo mb-3">{aviso}</div>}
      {!lista && !erro && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>}
      {lista && <ListaAgrupada grupos={grupos} onAbrir={setAberta} vazio="Nenhuma ficha cadastrada" filtrado={!!busca || filtro !== 'ativas'} />}
    </div>
  );
};

export default Fichas;

// ── Editor em tela própria ───────────────────────────────────────────────────

type Tipo = 'venda_direta' | 'producao';
interface Linha { chave: number; tipo: 'item' | 'ficha'; id: string; quantidade: string; baixa: boolean; obs: string }
interface EditorProps { id: string | null; fichas: FichaResumo[]; onVoltar: () => void; onSalvo: (mensagem: string) => Promise<void> }

const FichaEditor: React.FC<EditorProps> = ({ id, fichas, onVoltar, onSalvo }) => {
  const [itens, setItens] = useState<ItemBasico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [excluir, setExcluir] = useState(false);
  const [nome, setNome] = useState('');
  const [tipo, setTipo] = useState<Tipo>('venda_direta');
  const [porcoes, setPorcoes] = useState('1');
  const [rendimento, setRendimento] = useState('1');
  const [unidadeRend, setUnidadeRend] = useState('porções');
  const [ativo, setAtivo] = useState(true);
  const [modo, setModo] = useState('');
  const [obs, setObs] = useState('');
  const [mais, setMais] = useState(false);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [seq, setSeq] = useState(1);

  useEffect(() => {
    let vivo = true;
    (async () => {
      setCarregando(true); setErro(null);
      try {
        const [its, dados] = await Promise.all([cadastrosApi.itensBasicos(), id ? cadastrosApi.fichaCarregar(id) : Promise.resolve(null)]);
        if (!vivo) return;
        setItens(its.filter(i => i.status !== 'inativo'));
        if (dados) {
          const f = dados.ficha;
          setNome(f.nome); setTipo(f.tipo_consumo === 'venda_direta' ? 'venda_direta' : 'producao'); setPorcoes(String(f.porcoes || 1));
          setRendimento(String(f.rendimento || 1)); setUnidadeRend(f.unidade_rendimento || 'porções'); setAtivo(f.ativo !== false);
          setModo(f.modo_preparo || ''); setObs(f.observacoes_preparo || ''); setMais(!!(f.modo_preparo || f.observacoes_preparo));
          setLinhas(dados.ingredientes.map((r: IngredienteLinha, i) => ({ chave: i + 1, tipo: r.ficha_tecnica_ingrediente_id ? 'ficha' : 'item', id: r.ficha_tecnica_ingrediente_id || r.item_estoque_id || '', quantidade: String(r.quantidade), baixa: r.baixa_estoque !== false, obs: r.observacoes || '' })));
          setSeq(dados.ingredientes.length + 1);
        }
      } catch (e) { if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
      finally { if (vivo) setCarregando(false); }
    })();
    return () => { vivo = false; };
  }, [id]);

  const itemPorId = useMemo(() => new Map(itens.map(i => [i.id, i])), [itens]);
  const fichaPorId = useMemo(() => new Map(fichas.map(f => [f.id, f])), [fichas]);
  const custoLinha = (l: Linha) => {
    const q = Number(l.quantidade.replace(',', '.')) || 0;
    if (l.tipo === 'item') return (itemPorId.get(l.id)?.custo_medio || 0) * q;
    const f = fichaPorId.get(l.id); return f ? (f.custo_total / Math.max(1, f.porcoes)) * q : 0;
  };
  const total = linhas.reduce((s, l) => s + custoLinha(l), 0);
  const nPorcoes = Math.max(1, parseInt(porcoes, 10) || 1);

  const mudar = (chave: number, patch: Partial<Linha>) => setLinhas(p => p.map(l => (l.chave === chave ? { ...l, ...patch } : l)));
  const adicionar = () => { setLinhas(p => [...p, { chave: seq, tipo: 'item', id: '', quantidade: '', baixa: true, obs: '' }]); setSeq(s => s + 1); };

  const salvar = async () => {
    if (!nome.trim()) { setErro('Informe o nome da ficha.'); return; }
    if (linhas.length === 0) { setErro('Adicione pelo menos um ingrediente.'); return; }
    for (const [i, l] of linhas.entries()) {
      if (!l.id) { setErro(`Escolha o ingrediente da linha ${i + 1}.`); return; }
      if (!(Number(l.quantidade.replace(',', '.')) > 0)) { setErro(`Quantidade inválida na linha ${i + 1}.`); return; }
    }
    setSalvando(true); setErro(null);
    try {
      await cadastrosApi.fichaSalvar({
        id, nome: nome.trim(), porcoes: nPorcoes, ativo, tipo_consumo: tipo, rendimento: Number(rendimento.replace(',', '.')) || 1, unidade_rendimento: unidadeRend.trim() || 'porções',
        modo_preparo: modo.trim() || null, observacoes_preparo: obs.trim() || null,
        ingredientes: linhas.map(l => ({ item_estoque_id: l.tipo === 'item' ? l.id : null, ficha_tecnica_ingrediente_id: l.tipo === 'ficha' ? l.id : null, quantidade: Number(l.quantidade.replace(',', '.')), baixa_estoque: l.baixa, observacoes: l.obs.trim() || null })),
      });
      await onSalvo(`"${nome.trim()}" salva.`);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao salvar'); }
    finally { setSalvando(false); }
  };

  return (
    <div className="max-w-4xl pb-28">
      <button type="button" onClick={onVoltar} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={14} /> Fichas técnicas</button>
      <PageHeader caminho={['Estoque', 'Cadastros', 'Fichas técnicas']} title={id ? (nome || 'Editar ficha') : 'Nova ficha'} subtitle={id ? 'Mudar um ingrediente recalcula o custo na hora.' : 'Nome, o que entra, e pronto.'} />
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {carregando && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>}
      {!carregando && (
        <div className="flex flex-col gap-4">
          <section className="card p-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <Input rotulo="Nome" value={nome} onChange={e => setNome(e.target.value)} className="md:col-span-2" autoFocus={!id} />
            <div className="md:col-span-2">
              <Segmented<Tipo> rotulo="Tipo" valor={tipo} onMudar={setTipo} opcoes={[{ valor: 'venda_direta', rotulo: 'Venda direta' }, { valor: 'producao', rotulo: 'Produção' }]} />
              <p className="t-caption" style={{ margin: '4px 0 0' }}>{tipo === 'venda_direta' ? 'A venda na Zig baixa os ingredientes direto do setor.' : 'Produz um item que entra no estoque e sai depois.'}</p>
            </div>
            <Input rotulo="Porções" type="number" min={1} step={1} inputMode="numeric" value={porcoes} onChange={e => setPorcoes(e.target.value)} dica="Quantas porções esta receita rende" />
            <div className="grid grid-cols-2 gap-2">
              <Input rotulo="Rendimento" type="number" min={0} step="any" inputMode="decimal" value={rendimento} onChange={e => setRendimento(e.target.value)} />
              <Input rotulo="Unidade" value={unidadeRend} onChange={e => setUnidadeRend(e.target.value)} />
            </div>
          </section>

          <section className="card">
            <div className="px-4 py-3 flex items-center justify-between gap-3" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="t-subsec" style={{ margin: 0 }}>Ingredientes</h2>
              <Button tamanho="sm" icone={<Plus size={14} />} onClick={adicionar}>Adicionar</Button>
            </div>
            {linhas.length === 0 && <p className="t-body px-4 py-4" style={{ margin: 0, color: 'var(--text-secondary)' }}>Nenhum ingrediente ainda. Toque em Adicionar.</p>}
            {linhas.map((l, i) => {
              const nomeSel = l.tipo === 'item' ? itemPorId.get(l.id)?.nome : fichaPorId.get(l.id)?.nome;
              const unidade = l.tipo === 'item' ? (itemPorId.get(l.id)?.unidade_medida || '') : 'porção';
              return (
                <div key={l.chave} className="px-4 py-3 grid gap-2 items-end" style={{ gridTemplateColumns: 'minmax(0,1fr)', borderBottom: '1px solid var(--border-subtle)' }}>
                  <div className="grid grid-cols-1 md:grid-cols-[120px_minmax(0,1fr)_110px_auto_auto] gap-2 items-end">
                    <Select rotulo={i === 0 ? 'Tipo' : undefined} aria-label="Tipo" value={l.tipo} onChange={e => mudar(l.chave, { tipo: e.target.value as 'item' | 'ficha', id: '' })}>
                      <option value="item">Item</option><option value="ficha">Sub-receita</option>
                    </Select>
                    <Busca rotulo={i === 0 ? 'Ingrediente' : undefined} valor={nomeSel || ''} opcoes={l.tipo === 'item' ? itens.map(x => ({ id: x.id, nome: x.nome.trim(), sub: `${x.categoria} · ${x.unidade_medida} · ${brl(x.custo_medio)}` })) : fichas.filter(f => f.id !== id && f.ativo).map(f => ({ id: f.id, nome: f.nome.trim(), sub: `${brl(f.custo_total / Math.max(1, f.porcoes))} por porção` }))} onEscolher={idSel => mudar(l.chave, { id: idSel })} />
                    <Input rotulo={i === 0 ? `Quantidade` : undefined} aria-label="Quantidade" type="number" min={0} step="any" inputMode="decimal" value={l.quantidade} onChange={e => mudar(l.chave, { quantidade: e.target.value })} dica={unidade || undefined} />
                    <label className="flex items-center gap-2 t-caption pb-2 whitespace-nowrap"><input type="checkbox" checked={l.baixa} onChange={e => mudar(l.chave, { baixa: e.target.checked })} /> baixa estoque</label>
                    <div className="flex items-center gap-2 pb-1">
                      <span className="t-body num" style={{ minWidth: 70, textAlign: 'right' }}>{brl(custoLinha(l))}</span>
                      <button type="button" className="btn-icon btn-icon-danger" aria-label="Tirar ingrediente" onClick={() => setLinhas(p => p.filter(x => x.chave !== l.chave))}><X size={14} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
            <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap">
              <span className="t-caption">Custo por porção: {brl(total / nPorcoes)}</span>
              <span className="t-subsec" style={{ margin: 0 }}>Custo total {brl(total)}</span>
            </div>
          </section>

          <button type="button" onClick={() => setMais(m => !m)} className="text-left t-label focus-ring" style={{ color: 'var(--gold)' }}>{mais ? '− Menos' : '+ Modo de preparo e observações'}</button>
          {mais && (
            <section className="card p-4 grid grid-cols-1 gap-3">
              <Textarea rotulo="Modo de preparo" value={modo} onChange={e => setModo(e.target.value)} rows={5} />
              <Textarea rotulo="Observações" value={obs} onChange={e => setObs(e.target.value)} rows={3} />
            </section>
          )}
        </div>
      )}

      <div className="fixed bottom-0 left-0 right-0 z-30 px-4 py-3 lg:pl-[calc(232px+28px)]" style={{ background: 'var(--bg-dark)', borderTop: '1px solid var(--border)' }}>
        <div className="max-w-4xl flex items-center justify-between gap-3">
          <div>{id && <Button variante="discreto" icone={<Trash2 size={14} />} onClick={() => setExcluir(true)} style={{ color: 'var(--danger-text)' }}>Excluir…</Button>}</div>
          <div className="flex gap-2">
            <Button onClick={onVoltar} disabled={salvando}>Cancelar</Button>
            <Button variante="primario" icone={<Check size={16} />} onClick={salvar} carregando={salvando} disabled={carregando}>Salvar ficha</Button>
          </div>
        </div>
      </div>

      <ExcluirModal tipo="ficha" id={excluir && id ? id : null} nome={nome.trim()} arquivado={!ativo} onFechar={() => setExcluir(false)} onFeito={async m => { setExcluir(false); await onSalvo(m); }} />
    </div>
  );
};

// ── Busca com lista: digita, escolhe ────────────────────────────────────────
interface Opcao { id: string; nome: string; sub?: string }
const Busca: React.FC<{ rotulo?: string; valor: string; opcoes: Opcao[]; onEscolher: (id: string) => void }> = ({ rotulo, valor, opcoes, onEscolher }) => {
  const [texto, setTexto] = useState('');
  const [aberto, setAberto] = useState(false);
  const t = semAcento(texto.trim());
  const achados = useMemo(() => (t.length < 2 ? [] : opcoes.filter(o => semAcento(o.nome).includes(t)).slice(0, 10)), [t, opcoes]);
  return (
    <div className="relative">
      <Input rotulo={rotulo} aria-label="Ingrediente" placeholder={valor || 'Digite para buscar'} value={aberto ? texto : valor} onFocus={() => { setAberto(true); setTexto(''); }} onBlur={() => setTimeout(() => setAberto(false), 150)} onChange={e => setTexto(e.target.value)} />
      {aberto && achados.length > 0 && (
        <ul className="absolute left-0 right-0 z-40 mt-1 overflow-auto" style={{ maxHeight: 260, background: 'var(--bg-elevated)', border: '1px solid var(--border-strong)', borderRadius: 'var(--r-control)', boxShadow: 'var(--shadow-raised)', listStyle: 'none', margin: 0, padding: 4 }}>
          {achados.map(o => (
            <li key={o.id}>
              <button type="button" onMouseDown={e => e.preventDefault()} onClick={() => { onEscolher(o.id); setAberto(false); }} className="w-full text-left px-3 py-2 rounded-md hover:bg-white/[0.06] focus-ring">
                <span className="block t-body" style={{ color: 'var(--text-primary)' }}>{o.nome}</span>
                {o.sub && <span className="block t-caption">{o.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};
