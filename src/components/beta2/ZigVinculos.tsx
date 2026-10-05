import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronRight, Link2, RefreshCw, Search } from 'lucide-react';
import { Badge, Button, EmptyState, IconButton, Input, KPICard, PageHeader, Segmented, Select } from '../ui';
import { fmt, zigApi, type ProdutoZig, type SituacaoZig, type ZigTela } from './api';
import { cadastrosApi, semAcento, type ItemBasico } from './cadastros/api';
import BuscaItem from './BuscaItem';

interface Props { onVoltar: () => void }
type Filtro = 'pendentes' | 'vinculados' | 'ignorados' | 'todos';
type Modo = 'item' | 'ficha' | 'ignorar';

const SITUACAO: Record<SituacaoZig, { r: string; v: 'danger' | 'warning' | 'success' | 'info' | 'neutral' }> = {
  sem_vinculo: { r: 'sem vínculo', v: 'danger' }, incompleto: { r: 'falta o estoque', v: 'warning' }, item: { r: 'item', v: 'success' }, ficha: { r: 'ficha', v: 'info' }, ignorar: { r: 'ignorado', v: 'neutral' },
};
const dataBR = (s: string | null) => (s ? new Date(`${s.slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');
const dataHoraBR = (s: string) => new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/**
 * Vínculos da Zig: cada produto vendido na Zig desconta de um item, de uma
 * ficha técnica (os ingredientes), ou é ignorado. Sempre com o estoque de
 * onde sai. A baixa automática (3h e 10h) lê daqui; o que vendeu sem vínculo
 * entra sozinho nesta lista.
 */
const ZigVinculos: React.FC<Props> = ({ onVoltar }) => {
  const [tela, setTela] = useState<ZigTela | null>(null);
  const [itens, setItens] = useState<ItemBasico[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [filtro, setFiltro] = useState<Filtro>('pendentes');
  const [busca, setBusca] = useState('');
  const [aberto, setAberto] = useState<string | null>(null);
  const [ultimoEstoque, setUltimoEstoque] = useState('');

  const carregar = async () => {
    setCarregando(true); setErro(null);
    try { setTela(await zigApi.tela()); } catch (e) { setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
    finally { setCarregando(false); }
  };
  useEffect(() => { void carregar(); cadastrosApi.itensBasicos().then(i => setItens(i.filter(x => x.status === 'ativo'))).catch(() => undefined); }, []);

  const b = semAcento(busca.trim());
  const visiveis = useMemo(() => (tela?.produtos || []).filter(p => {
    const ok = filtro === 'todos' ? true : filtro === 'pendentes' ? (p.situacao === 'sem_vinculo' || p.situacao === 'incompleto') : filtro === 'ignorados' ? p.situacao === 'ignorar' : (p.situacao === 'item' || p.situacao === 'ficha');
    return ok && (!b || semAcento(p.nome).includes(b) || semAcento(p.categoria).includes(b) || semAcento(p.item_nome || '').includes(b) || semAcento(p.ficha_nome || '').includes(b));
  }), [tela, filtro, b]);
  const grupos = useMemo(() => {
    const m = new Map<string, ProdutoZig[]>();
    for (const p of visiveis) { if (!m.has(p.categoria)) m.set(p.categoria, []); m.get(p.categoria)!.push(p); }
    return [...m.entries()].sort(([a], [c]) => a.localeCompare(c, 'pt-BR'));
  }, [visiveis]);
  const opcoesItem = useMemo(() => itens.map(i => ({ id: i.id, nome: i.nome.trim(), sub: `${i.categoria || 'Sem categoria'} · ${i.unidade_medida}` })), [itens]);
  const opcoesFicha = useMemo(() => (tela?.fichas || []).map(f => ({ id: f.id, nome: f.nome, sub: f.tipo ? `ficha · ${f.tipo}` : 'ficha' })), [tela]);

  const salvo = async (p: ProdutoZig, modo: Modo, estoqueId: string) => {
    if (estoqueId) setUltimoEstoque(estoqueId);
    setAberto(null); setAviso(modo === 'ignorar' ? `${p.nome}: ignorado. Não desconta nada.` : `${p.nome}: vínculo salvo. Entra na próxima baixa automática.`);
    await carregar();
  };

  const t = tela?.totais; const s = tela?.ultimo_sync;
  return (
    <div className="max-w-5xl">
      <button type="button" onClick={onVoltar} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={14} /> Estoque Beta 2</button>
      <PageHeader caminho={['Estoque', 'Configuração']} title="Vínculos da Zig" subtitle="Cada produto vendido na Zig desconta de um item ou de uma ficha técnica, saindo de um estoque. O que vendeu sem vínculo aparece aqui sozinho."
        actions={<IconButton aria-label="Atualizar" onClick={carregar} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton>} />
      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {aviso && <div className="aviso aviso-certo mb-3">{aviso}</div>}
      {!tela && !erro && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>}

      {t && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <KPICard rotulo="sem vínculo" valor={t.sem_vinculo + t.incompletos} detalhe={t.sem_vinculo_vendendo ? `${t.sem_vinculo_vendendo} venderam nos últimos 30 dias` : 'nada vendendo sem vínculo'} tom={t.sem_vinculo + t.incompletos ? 'alerta' : 'certo'} onClick={() => setFiltro('pendentes')} />
          <KPICard rotulo="vendas sem baixa · 30 dias" valor={fmt(t.vendas_paradas_30d)} detalhe="unidades que não desceram do estoque" tom={t.vendas_paradas_30d ? 'atencao' : 'certo'} />
          <KPICard rotulo="vinculados" valor={t.vinculados} detalhe="item ou ficha, com estoque" tom="certo" onClick={() => setFiltro('vinculados')} />
          <KPICard rotulo="ignorados" valor={t.ignorados} detalhe="não descontam nada" onClick={() => setFiltro('ignorados')} />
        </div>
      )}
      {s && (
        <p className="t-caption mb-3" style={{ margin: 0 }}>
          Última baixa automática {dataHoraBR(s.iniciado_em)} ({s.periodo}): {s.baixados} baixados, {s.pendentes} sem vínculo, {s.ignorados} ignorados.
          {s.status !== 'sucesso' && <span className="texto-perigo"> Terminou com {s.status}{s.erro ? `: ${s.erro}` : ''}.</span>}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <Segmented<Filtro> rotulo="Mostrar" valor={filtro} onMudar={setFiltro} opcoes={[{ valor: 'pendentes', rotulo: 'Sem vínculo' }, { valor: 'vinculados', rotulo: 'Vinculados' }, { valor: 'ignorados', rotulo: 'Ignorados' }, { valor: 'todos', rotulo: 'Todos' }]} />
        <Input type="search" placeholder="Buscar produto, item ou ficha" aria-label="Buscar" value={busca} onChange={e => setBusca(e.target.value)} className="flex-1 min-w-[200px]" />
      </div>

      {tela && visiveis.length === 0 && <EmptyState icon={filtro === 'pendentes' && !b ? Check : Search} title={filtro === 'pendentes' && !b ? 'Tudo vinculado' : 'Nada com esse nome'} description={filtro === 'pendentes' && !b ? 'Todo produto que a Zig vendeu desconta de algum lugar.' : undefined} variant={b ? 'filtered' : 'empty'} compact />}

      <div className="flex flex-col gap-3">
        {grupos.map(([cat, lista]) => (
          <section key={cat} className="card">
            <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="t-subsec" style={{ margin: 0 }}>{cat}</h2>
              <span className="t-caption">{lista.length}</span>
            </div>
            {lista.map(p => {
              const st = SITUACAO[p.situacao];
              const ab = aberto === p.id;
              return (
                <div key={p.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <button type="button" onClick={() => setAberto(ab ? null : p.id)} className="w-full px-4 py-2 flex flex-wrap items-center gap-3 text-left hover:bg-white/[0.04] focus-ring">
                    {ab ? <ChevronDown size={16} aria-hidden="true" style={{ color: 'var(--text-secondary)' }} /> : <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--text-secondary)' }} />}
                    <div className="flex-1 min-w-[200px]">
                      <p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{p.nome}</p>
                      <p className="t-caption truncate" style={{ margin: 0 }}>
                        {p.situacao === 'item' && <>desconta <strong>{p.item_nome}</strong> de {p.estoque_nome}</>}
                        {p.situacao === 'ficha' && <>desconta os ingredientes de <strong>{p.ficha_nome}</strong> de {p.estoque_nome}</>}
                        {p.situacao === 'incompleto' && <>{p.item_nome || p.ficha_nome || 'vínculo'} sem estoque de origem: não baixa</>}
                        {p.situacao === 'sem_vinculo' && 'ninguém disse de onde sai'}
                        {p.situacao === 'ignorar' && 'não mexe no estoque'}
                        {p.expandir && ' · composto, baixa pelos adicionais'}
                        {p.vendido_30d > 0 && ` · ${fmt(p.vendido_30d)} vendidos em 30 dias`}{p.ultima_venda && ` · última ${dataBR(p.ultima_venda)}`}
                      </p>
                    </div>
                    <Badge variant={st.v}>{st.r}</Badge>
                  </button>
                  {ab && tela && <Editor p={p} estoques={tela.estoques} opcoesItem={opcoesItem} opcoesFicha={opcoesFicha} estoquePadrao={ultimoEstoque} onFechar={() => setAberto(null)} onSalvo={salvo} />}
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
};

export default ZigVinculos;

// ── Editor de um produto ────────────────────────────────────────────────────
const Editor: React.FC<{ p: ProdutoZig; estoques: ZigTela['estoques']; opcoesItem: Array<{ id: string; nome: string; sub?: string }>; opcoesFicha: Array<{ id: string; nome: string; sub?: string }>; estoquePadrao: string; onFechar: () => void; onSalvo: (p: ProdutoZig, modo: Modo, estoqueId: string) => Promise<void> }> = ({ p, estoques, opcoesItem, opcoesFicha, estoquePadrao, onFechar, onSalvo }) => {
  const [modo, setModo] = useState<Modo>(p.situacao === 'ficha' ? 'ficha' : p.situacao === 'ignorar' ? 'ignorar' : 'item');
  const [itemId, setItemId] = useState(p.item_id || '');
  const [fichaId, setFichaId] = useState(p.ficha_id || '');
  const [estoqueId, setEstoqueId] = useState(p.estoque_id || estoquePadrao || estoques[0]?.id || '');
  const [expandir, setExpandir] = useState(p.expandir);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const nomeItem = opcoesItem.find(o => o.id === itemId)?.nome || '';
  const nomeFicha = opcoesFicha.find(o => o.id === fichaId)?.nome || '';
  const pronto = modo === 'ignorar' || (!!estoqueId && (modo === 'item' ? !!itemId : !!fichaId));

  const salvar = async () => {
    setOcupado(true); setErro(null);
    try {
      await zigApi.salvar({ nome: p.nome, modo, item_id: modo === 'item' ? itemId : null, ficha_id: modo === 'ficha' ? fichaId : null, estoque_id: modo === 'ignorar' ? null : estoqueId, expandir });
      await onSalvo(p, modo, modo === 'ignorar' ? '' : estoqueId);
    } catch (e) { setErro(e instanceof Error ? e.message : 'Erro'); setOcupado(false); }
  };

  return (
    <div className="px-4 pb-4 pt-2 flex flex-col gap-3" style={{ background: 'var(--bg-elevated)' }}>
      {erro && <div className="aviso aviso-perigo" role="alert">{erro}</div>}
      <Segmented<Modo> rotulo="Como desconta" valor={modo} onMudar={setModo} opcoes={[{ valor: 'item', rotulo: 'Um item' }, { valor: 'ficha', rotulo: 'Ficha técnica' }, { valor: 'ignorar', rotulo: 'Ignorar' }]} />
      {modo !== 'ignorar' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {modo === 'item'
            ? <BuscaItem rotulo="Item do estoque" valor={nomeItem} opcoes={opcoesItem} placeholder="Digite o nome do item" onEscolher={setItemId} autoFocus={!itemId} />
            : <BuscaItem rotulo="Ficha técnica" valor={nomeFicha} opcoes={opcoesFicha} placeholder="Digite o nome da ficha" onEscolher={setFichaId} autoFocus={!fichaId} />}
          <Select rotulo="Sai de qual estoque" value={estoqueId} onChange={e => setEstoqueId(e.target.value)} dica="O setor onde o produto é servido. O item precisa estar configurado lá com saída pela Zig.">
            <option value="">Escolher…</option>{estoques.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}
          </Select>
          <label className="flex items-center gap-2 t-caption md:col-span-2"><input type="checkbox" checked={expandir} onChange={e => setExpandir(e.target.checked)} /> Produto composto da Zig: a baixa é pelos adicionais, não por este nome</label>
        </div>
      )}
      {modo === 'ignorar' && <p className="t-caption" style={{ margin: 0 }}>Taxas, couvert, serviços e coisas que não saem do estoque. A venda continua contando no faturamento.</p>}
      <div className="flex justify-end gap-2">
        <Button onClick={onFechar} disabled={ocupado}>Cancelar</Button>
        <Button variante="primario" icone={<Link2 size={16} />} onClick={salvar} carregando={ocupado} disabled={!pronto}>{modo === 'ignorar' ? 'Ignorar produto' : 'Salvar vínculo'}</Button>
      </div>
    </div>
  );
};
