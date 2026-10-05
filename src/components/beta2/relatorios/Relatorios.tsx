import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight, Download, RefreshCw, Search } from 'lucide-react';
import { Button, EmptyState, IconButton, Input, KPICard, PageHeader, SectionCard, Segmented, Select } from '../../ui';
import { fmt } from '../api';
import { brl, cadastrosApi, semAcento, type Estoque, type Fornecedor, type ItemBasico } from '../cadastros/api';
import BuscaItem from '../BuscaItem';
import { csvDoRelatorio, GRUPOS_REL, RELATORIOS, relatoriosApi, type Coluna, type Definicao, type Grupo, type Kpi, type Parametros, type Relatorio } from './api';

interface Props {
  /** Relatório aberto (tipo) ou null para o menu. */
  tipo: string | null;
  /** Item pré-escolhido (kardex por produto vindo de outra tela). */
  itemId?: string | null;
  onAbrir: (tipo: string | null) => void;
  onVoltar: () => void;
}
type Periodo = 'hoje' | '7' | '30' | 'mes' | 'outro';

const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const diasAtras = (n: number) => new Date(Date.now() - n * 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const inicioMes = () => hojeISO().slice(0, 8) + '01';
const dataBR = (s: string | null) => (s ? new Date(`${String(s).slice(0, 10)}T12:00:00`).toLocaleDateString('pt-BR') : '');
const dataHoraBR = (s: string | null) => (s ? new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '');
/** {brl:1234.5} dentro de um texto vira R$ 1.234,50. */
const detalhe = (s: string | null) => (s || '').replace(/\{brl:(-?[\d.]+)\}/g, (_, v) => brl(Number(v)));

function celula(c: Coluna, v: string | number | null): React.ReactNode {
  if (v === null || v === undefined || v === '') return <span style={{ color: 'var(--text-secondary)' }}>—</span>;
  switch (c.t) {
    case 'brl': return brl(Number(v));
    case 'num': return fmt(Number(v));
    case 'int': return Number(v).toLocaleString('pt-BR');
    case 'pct': return `${fmt(Number(v))}%`;
    case 'data': return dataBR(String(v));
    case 'datahora': return dataHoraBR(String(v));
    default: return String(v);
  }
}
const numerica = (c: Coluna) => c.t === 'brl' || c.t === 'num' || c.t === 'int' || c.t === 'pct';
const kpiValor = (k: Kpi) => k.valor === null || k.valor === undefined ? '—' : k.formato === 'brl' ? brl(Number(k.valor)) : k.formato === 'pct' ? `${fmt(Number(k.valor))}%` : k.formato === 'int' ? Number(k.valor).toLocaleString('pt-BR') : k.formato === 'num' ? fmt(Number(k.valor)) : String(k.valor);

/** Um grupo do relatório: cabeçalho com total e a tabela, que abre e fecha. */
const GrupoCard: React.FC<{ g: Grupo; colunas: Coluna[]; aberto: boolean; onAlternar: () => void; busca: string }> = ({ g, colunas, aberto, onAlternar, busca }) => {
  const cols = g.colunas || colunas;
  const b = semAcento(busca.trim());
  const linhas = useMemo(() => (b ? g.linhas.filter(l => cols.some(c => c.t === 'texto' && l[c.k] != null && semAcento(String(l[c.k])).includes(b))) : g.linhas), [g, cols, b]);
  if (b && linhas.length === 0) return null;
  return (
    <section className="card">
      <button type="button" onClick={onAlternar} className="w-full px-4 py-2.5 flex items-center gap-2 text-left focus-ring" style={{ borderBottom: aberto ? '1px solid var(--border)' : undefined }}>
        {aberto ? <ChevronDown size={16} aria-hidden="true" /> : <ChevronRight size={16} aria-hidden="true" />}
        <h2 className="t-subsec flex-1 min-w-0 truncate" style={{ margin: 0 }}>{g.titulo}</h2>
        <span className="t-caption whitespace-nowrap">{b ? `${linhas.length} de ${g.n}` : g.n} {g.n === 1 ? 'linha' : 'linhas'}{g.valor != null ? ` · ${brl(g.valor)}` : ''}</span>
      </button>
      {aberto && (
        <div className="overflow-x-auto">
          <table className="w-full" style={{ fontSize: 13 }}>
            <thead><tr>{cols.map(c => <th key={c.k} className={`px-3 py-1.5 t-label whitespace-nowrap ${numerica(c) ? 'text-right' : 'text-left'}`} style={{ color: 'var(--text-secondary)', fontWeight: 500 }}>{c.r}</th>)}</tr></thead>
            <tbody>
              {linhas.map((l, i) => (
                <tr key={i} style={{ borderTop: '1px solid var(--border-subtle)' }}>
                  {cols.map(c => {
                    const v = l[c.k]; const neg = numerica(c) && typeof v === 'number' && v < 0;
                    return <td key={c.k} className={`px-3 py-1.5 ${numerica(c) ? 'text-right num whitespace-nowrap' : ''}`} style={{ color: neg ? 'var(--danger-text)' : undefined, maxWidth: 360 }}>{celula(c, v)}</td>;
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

/** Relatórios: um menu de cartões e uma tela só para todos os relatórios. */
const Relatorios: React.FC<Props> = ({ tipo, itemId, onAbrir, onVoltar }) => {
  const def: Definicao | null = useMemo(() => RELATORIOS.find(r => r.tipo === tipo) || null, [tipo]);
  const [periodo, setPeriodo] = useState<Periodo>('30');
  const [de, setDe] = useState(diasAtras(30));
  const [ate, setAte] = useState(hojeISO());
  const [estoqueId, setEstoqueId] = useState('');
  const [fornecedorId, setFornecedorId] = useState('');
  const [item, setItem] = useState<string>(itemId || '');
  const [dias, setDias] = useState(60);
  const [estoques, setEstoques] = useState<Estoque[]>([]);
  const [fornecedores, setFornecedores] = useState<Fornecedor[]>([]);
  const [itens, setItens] = useState<ItemBasico[]>([]);
  const [rel, setRel] = useState<Relatorio | null>(null);
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [abertos, setAbertos] = useState<Set<number>>(new Set());
  const [busca, setBusca] = useState('');

  useEffect(() => {
    cadastrosApi.estoques().then(e => setEstoques(e.filter(x => x.status !== false))).catch(() => undefined);
    cadastrosApi.fornecedores().then(f => setFornecedores(f.filter(x => x.status !== 'inativo'))).catch(() => undefined);
    cadastrosApi.itensBasicos().then(i => setItens(i.filter(x => x.status === 'ativo'))).catch(() => undefined);
  }, []);
  useEffect(() => { if (itemId) setItem(itemId); }, [itemId]);
  useEffect(() => {
    if (periodo === 'hoje') { setDe(hojeISO()); setAte(hojeISO()); }
    else if (periodo === '7') { setDe(diasAtras(7)); setAte(hojeISO()); }
    else if (periodo === '30') { setDe(diasAtras(30)); setAte(hojeISO()); }
    else if (periodo === 'mes') { setDe(inicioMes()); setAte(hojeISO()); }
  }, [periodo]);

  const params: Parametros | null = useMemo(() => {
    if (!def) return null;
    const p: Parametros = {};
    if (def.filtros.includes('periodo')) { p.de = de; p.ate = ate; }
    if (def.filtros.includes('estoque')) p.estoque_id = estoqueId || null;
    if (def.filtros.includes('fornecedor')) p.fornecedor_id = fornecedorId || null;
    if (def.filtros.includes('item')) p.item_id = item || null;
    if (def.filtros.includes('dias')) p.dias = dias;
    return p;
  }, [def, de, ate, estoqueId, fornecedorId, item, dias]);

  useEffect(() => {
    if (!def || !params) { setRel(null); return; }
    if (def.filtros.includes('item') && !params.item_id && def.tipo !== 'legado_movimentacoes') { setRel(null); return; }
    let vivo = true;
    const t = setTimeout(async () => {
      setCarregando(true); setErro(null);
      try {
        const r = await relatoriosApi.gerar(def.tipo, params);
        if (!vivo) return;
        setRel(r);
        const total = r.grupos.reduce((s, g) => s + g.linhas.length, 0);
        setAbertos(total <= 300 ? new Set(r.grupos.map((_, i) => i)) : new Set(r.grupos.length === 1 ? [0] : []));
      } catch (e) { if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao gerar'); }
      finally { if (vivo) setCarregando(false); }
    }, 200);
    return () => { vivo = false; clearTimeout(t); };
  }, [def, params]);

  const exportar = () => {
    if (!rel) return;
    const blob = new Blob([csvDoRelatorio(rel)], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
    a.download = `${rel.titulo.replace(/[^\wÀ-ſ ]+/g, '').trim().replace(/\s+/g, '-').toLowerCase()}-${hojeISO()}.csv`;
    a.click(); URL.revokeObjectURL(a.href);
  };
  const todosAbertos = rel ? abertos.size === rel.grupos.length : false;
  const alternarTodos = () => setAbertos(todosAbertos ? new Set() : new Set((rel?.grupos || []).map((_, i) => i)));
  const opcoesItem = useMemo(() => itens.map(i => ({ id: i.id, nome: i.nome, sub: `${i.categoria || 'Sem categoria'} · ${i.unidade_medida}` })), [itens]);
  const nomeItem = itens.find(i => i.id === item)?.nome || '';

  // ── Menu ──
  if (!def) {
    return (
      <div className="max-w-5xl">
        <button type="button" onClick={onVoltar} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={14} /> Estoque Beta 2</button>
        <PageHeader caminho={['Estoque', 'Relatórios']} title="Relatórios" subtitle="Tudo só de leitura. Cada relatório tem período, filtros e exporta para o Excel." />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {GRUPOS_REL.map(g => (
            <SectionCard key={g.id} title={g.titulo} noPadding>
              <div className="flex flex-col">
                {RELATORIOS.filter(r => r.grupo === g.id).map(r => (
                  <button key={r.tipo} type="button" onClick={() => onAbrir(r.tipo)} className="flex items-center gap-3 px-5 min-h-12 py-2 text-left hover:bg-white/[0.04] focus-ring" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <r.icon size={16} aria-hidden="true" style={{ color: 'var(--gold)' }} />
                    <span className="flex-1 min-w-0">
                      <span className="block t-body" style={{ fontWeight: 600 }}>{r.nome}</span>
                      <span className="block t-caption">{r.descricao}</span>
                    </span>
                    <ChevronRight size={16} aria-hidden="true" style={{ color: 'var(--text-secondary)' }} />
                  </button>
                ))}
              </div>
            </SectionCard>
          ))}
        </div>
      </div>
    );
  }

  // ── Relatório ──
  const f = def.filtros;
  return (
    <div className="max-w-6xl">
      <button type="button" onClick={() => onAbrir(null)} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={14} /> Relatórios</button>
      <PageHeader caminho={['Estoque', 'Relatórios', def.nome]} title={rel?.titulo || def.nome} subtitle={rel?.subtitulo || def.descricao}
        actions={<div className="flex items-center gap-2">
          <Button tamanho="sm" icone={<Download size={14} />} onClick={exportar} disabled={!rel}>Exportar</Button>
          <IconButton aria-label="Atualizar" onClick={() => setBusca(b => b.endsWith(' ') ? b.trim() : b + ' ')} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton>
        </div>} />

      <div className="flex flex-wrap items-end gap-3 mb-3">
        {f.includes('item') && <div className="w-full sm:w-80"><BuscaItem rotulo="Item" valor={nomeItem} opcoes={opcoesItem} placeholder="Digite o nome do item" onEscolher={setItem} autoFocus={!item} /></div>}
        {f.includes('periodo') && <>
          <Segmented<Periodo> rotulo="Período" valor={periodo} onMudar={setPeriodo} opcoes={[{ valor: 'hoje', rotulo: 'Hoje' }, { valor: '7', rotulo: '7 dias' }, { valor: '30', rotulo: '30 dias' }, { valor: 'mes', rotulo: 'Este mês' }, { valor: 'outro', rotulo: 'Datas' }]} />
          {periodo === 'outro' && <><Input type="date" rotulo="De" value={de} onChange={e => setDe(e.target.value)} className="w-40" /><Input type="date" rotulo="Até" value={ate} onChange={e => setAte(e.target.value)} className="w-40" /></>}
        </>}
        {f.includes('estoque') && <Select rotulo="Estoque" value={estoqueId} onChange={e => setEstoqueId(e.target.value)} className="w-52"><option value="">Todos os estoques</option>{estoques.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</Select>}
        {f.includes('fornecedor') && <Select rotulo="Fornecedor" value={fornecedorId} onChange={e => setFornecedorId(e.target.value)} className="w-60"><option value="">Todos os fornecedores</option>{fornecedores.map(x => <option key={x.id} value={x.id}>{x.nome}</option>)}</Select>}
        {f.includes('dias') && <Input type="number" rotulo="Dias sem saída" min={7} value={dias} onChange={e => setDias(Math.max(7, Number(e.target.value) || 60))} className="w-36" />}
        <Input type="search" rotulo="Buscar" placeholder="Filtrar linhas" aria-label="Buscar nas linhas" value={busca} onChange={e => setBusca(e.target.value)} className="flex-1 min-w-[180px]" />
      </div>

      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {f.includes('item') && !item && def.tipo !== 'legado_movimentacoes' && <EmptyState icon={Search} title="Escolha um item" description="Digite duas letras do nome e toque no item." compact />}
      {carregando && !rel && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Gerando…</p>}

      {rel && (
        <>
          {rel.avisos.map((a, i) => <div key={i} className="aviso aviso-atencao mb-3">{a}</div>)}
          {rel.kpis.length > 0 && (
            <div className={`grid grid-cols-2 gap-3 mb-4 ${rel.kpis.length > 4 ? 'lg:grid-cols-3' : 'lg:grid-cols-4'}`}>
              {rel.kpis.map((k, i) => <KPICard key={i} rotulo={k.rotulo} valor={kpiValor(k)} detalhe={detalhe(k.detalhe)} tom={k.tom} />)}
            </div>
          )}
          {rel.grupos.length === 0
            ? <EmptyState icon={Search} title="Nada neste período" description="Mude o período ou o filtro." variant="filtered" compact />
            : <>
              <div className="flex items-center justify-between mb-2">
                <span className="t-caption">{rel.grupos.length} {rel.grupos.length === 1 ? 'grupo' : 'grupos'} · {rel.grupos.reduce((s, g) => s + g.linhas.length, 0).toLocaleString('pt-BR')} linhas{carregando ? ' · atualizando…' : ''}</span>
                {rel.grupos.length > 1 && <Button tamanho="sm" variante="discreto" onClick={alternarTodos}>{todosAbertos ? 'Recolher todos' : 'Abrir todos'}</Button>}
              </div>
              <div className="flex flex-col gap-3">
                {rel.grupos.map((g, i) => <GrupoCard key={i} g={g} colunas={rel.colunas} busca={busca} aberto={abertos.has(i) || busca.trim().length > 1} onAlternar={() => setAbertos(p => { const n = new Set(p); if (n.has(i)) n.delete(i); else n.add(i); return n; })} />)}
              </div>
            </>}
        </>
      )}
    </div>
  );
};

export default Relatorios;
