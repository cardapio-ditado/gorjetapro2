import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowLeft, ArrowLeftRight, ArrowUpRight, RefreshCw, Search, SlidersHorizontal } from 'lucide-react';
import { Badge, Button, EmptyState, IconButton, Input, KPICard, PageHeader, Segmented, Select } from '../ui';
import { fmt, movimentacoesApi, type MovFiltro, type MovLista, type MovLinhaHist } from './api';
import { brl, cadastrosApi, type Estoque } from './cadastros/api';

interface Props { onVoltar: () => void }
type Periodo = 'hoje' | '7' | '30' | 'outro';
const ORIGENS: Array<{ v: string; r: string }> = [
  { v: '', r: 'Todas as origens' }, { v: 'compra', r: 'Compra' }, { v: 'zig', r: 'Venda Zig' }, { v: 'contagem', r: 'Contagem' }, { v: 'requisicao', r: 'Pedido / reposição' },
  { v: 'setores', r: 'Mover entre setores' }, { v: 'kit', r: 'Kit de limpeza' }, { v: 'zeragem', r: 'Zeragem' }, { v: 'normalizacao', r: 'Normalização' }, { v: 'manual', r: 'Manual' },
];
const TIPO: Record<string, { r: string; v: 'success' | 'danger' | 'info' | 'warning' }> = { entrada: { r: 'entrada', v: 'success' }, saida: { r: 'saída', v: 'danger' }, transferencia: { r: 'transferência', v: 'info' }, ajuste: { r: 'ajuste', v: 'warning' } };
const hojeISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const diasAtras = (n: number) => new Date(Date.now() - n * 86400000 - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dataBR = (s: string) => new Date(`${s}T12:00:00`).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });

/** Movimentações: tudo que entrou, saiu e andou entre estoques, por dia, com filtros. Só leitura. */
const Movimentacoes: React.FC<Props> = ({ onVoltar }) => {
  const [periodo, setPeriodo] = useState<Periodo>('7');
  const [de, setDe] = useState(diasAtras(7));
  const [ate, setAte] = useState(hojeISO());
  const [tipo, setTipo] = useState('');
  const [origem, setOrigem] = useState('');
  const [estoqueId, setEstoqueId] = useState('');
  const [busca, setBusca] = useState('');
  const [estoques, setEstoques] = useState<Estoque[]>([]);
  const [dados, setDados] = useState<MovLista | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [maisFiltros, setMaisFiltros] = useState(false);

  useEffect(() => { cadastrosApi.estoques().then(e => setEstoques(e.filter(x => x.status !== false))).catch(() => undefined); }, []);
  useEffect(() => {
    if (periodo === 'hoje') { setDe(hojeISO()); setAte(hojeISO()); }
    else if (periodo === '7') { setDe(diasAtras(7)); setAte(hojeISO()); }
    else if (periodo === '30') { setDe(diasAtras(30)); setAte(hojeISO()); }
  }, [periodo]);

  const filtro: MovFiltro = useMemo(() => ({ de, ate, tipo: tipo || null, origem: origem || null, estoque_id: estoqueId || null, busca: busca.trim() || null, limite: 300 }), [de, ate, tipo, origem, estoqueId, busca]);
  useEffect(() => {
    let vivo = true;
    const t = setTimeout(async () => {
      setCarregando(true); setErro(null);
      try { const d = await movimentacoesApi.lista(filtro); if (vivo) setDados(d); }
      catch (e) { if (vivo) setErro(e instanceof Error ? e.message : 'Erro ao carregar'); }
      finally { if (vivo) setCarregando(false); }
    }, 250);
    return () => { vivo = false; clearTimeout(t); };
  }, [filtro]);

  const porDia = useMemo(() => {
    const m = new Map<string, MovLinhaHist[]>();
    for (const l of dados?.linhas || []) { if (!m.has(l.data)) m.set(l.data, []); m.get(l.data)!.push(l); }
    return [...m.entries()];
  }, [dados]);

  const t = dados?.totais;
  return (
    <div className="max-w-5xl">
      <button type="button" onClick={onVoltar} className="flex items-center gap-1 t-label mb-2 focus-ring" style={{ color: 'var(--text-secondary)' }}><ArrowLeft size={14} /> Estoque Beta 2</button>
      <PageHeader caminho={['Estoque', 'Movimentações']} title="Movimentações" subtitle="Tudo que entrou, saiu e andou entre estoques. Para lançar perda ou acerto, use Contagem."
        actions={<IconButton aria-label="Atualizar" onClick={() => setBusca(b => b + ' ')} disabled={carregando}><RefreshCw size={16} className={carregando ? 'animate-spin' : ''} /></IconButton>} />

      <div className="flex flex-wrap items-center gap-3 mb-3">
        <Segmented<Periodo> rotulo="Período" valor={periodo} onMudar={setPeriodo} opcoes={[{ valor: 'hoje', rotulo: 'Hoje' }, { valor: '7', rotulo: '7 dias' }, { valor: '30', rotulo: '30 dias' }, { valor: 'outro', rotulo: 'Datas' }]} />
        {periodo === 'outro' && <><Input type="date" aria-label="De" value={de} onChange={e => setDe(e.target.value)} className="w-40" /><Input type="date" aria-label="Até" value={ate} onChange={e => setAte(e.target.value)} className="w-40" /></>}
        <Input type="search" placeholder="Buscar item" aria-label="Buscar item" value={busca} onChange={e => setBusca(e.target.value)} className="flex-1 min-w-[200px]" />
        <Button variante="discreto" tamanho="sm" icone={<SlidersHorizontal size={14} />} onClick={() => setMaisFiltros(m => !m)}>{maisFiltros ? 'Menos filtros' : 'Mais filtros'}</Button>
      </div>
      {maisFiltros && (
        <div className="flex flex-wrap items-end gap-3 mb-3">
          <Segmented rotulo="Tipo" valor={tipo} onMudar={setTipo} opcoes={[{ valor: '', rotulo: 'Todos' }, { valor: 'entrada', rotulo: 'Entradas' }, { valor: 'saida', rotulo: 'Saídas' }, { valor: 'transferencia', rotulo: 'Transferências' }, { valor: 'ajuste', rotulo: 'Ajustes' }]} />
          <Select rotulo="Origem" value={origem} onChange={e => setOrigem(e.target.value)} className="w-52">{ORIGENS.map(o => <option key={o.v} value={o.v}>{o.r}</option>)}</Select>
          <Select rotulo="Estoque" value={estoqueId} onChange={e => setEstoqueId(e.target.value)} className="w-52"><option value="">Todos os estoques</option>{estoques.map(e => <option key={e.id} value={e.id}>{e.nome}</option>)}</Select>
        </div>
      )}

      {erro && <div className="aviso aviso-perigo mb-3" role="alert">{erro}</div>}
      {t && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
          <KPICard rotulo="entradas" valor={t.entradas} detalhe={brl(t.valor_entradas)} tom={t.entradas ? 'certo' : 'normal'} onClick={() => setTipo(tipo === 'entrada' ? '' : 'entrada')} />
          <KPICard rotulo="saídas" valor={t.saidas} detalhe={brl(t.valor_saidas)} tom={t.saidas ? 'alerta' : 'normal'} onClick={() => setTipo(tipo === 'saida' ? '' : 'saida')} />
          <KPICard rotulo="transferências" valor={t.transferencias} detalhe="entre estoques" onClick={() => setTipo(tipo === 'transferencia' ? '' : 'transferencia')} />
          <KPICard rotulo="ajustes" valor={t.ajustes} detalhe="zeragem e normalização" tom={t.ajustes ? 'atencao' : 'normal'} onClick={() => setTipo(tipo === 'ajuste' ? '' : 'ajuste')} />
        </div>
      )}
      {dados && dados.total > dados.linhas.length && <div className="aviso aviso-atencao mb-3">Mostrando {dados.linhas.length} de {dados.total}. Aperte o período ou o filtro para ver tudo.</div>}
      {carregando && !dados && <p className="t-body" style={{ color: 'var(--text-secondary)' }}>Carregando…</p>}
      {dados && dados.linhas.length === 0 && <EmptyState icon={Search} title="Nada neste período" variant="filtered" compact />}

      <div className="flex flex-col gap-3">
        {porDia.map(([dia, linhas]) => (
          <section key={dia} className="card">
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border)' }}>
              <h2 className="t-subsec" style={{ margin: 0, textTransform: 'capitalize' }}>{dataBR(dia)}</h2>
              <span className="t-caption">{linhas.length}</span>
            </div>
            {linhas.map(l => {
              const tp = TIPO[l.tipo] || { r: l.tipo, v: 'neutral' as const };
              const Icone = l.tipo === 'entrada' ? ArrowDownLeft : l.tipo === 'saida' ? ArrowUpRight : ArrowLeftRight;
              const cor = l.tipo === 'entrada' ? 'var(--ok-text)' : l.tipo === 'saida' ? 'var(--danger-text)' : 'var(--text-secondary)';
              return (
                <div key={l.id} className="px-4 py-2 flex flex-wrap items-center gap-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                  <Icone size={16} aria-hidden="true" style={{ color: cor, flexShrink: 0 }} />
                  <div className="flex-1 min-w-[200px]">
                    <p className="t-body truncate" style={{ margin: 0, fontWeight: 500 }}>{l.item}</p>
                    <p className="t-caption truncate" style={{ margin: 0 }}>
                      {l.tipo === 'transferencia' ? `${l.de_nome ?? '?'} → ${l.para_nome ?? '?'}` : (l.para_nome ?? l.de_nome ?? '')}
                      {l.quem && ` · ${l.quem}`}{l.motivo && ` · ${l.motivo}`}
                    </p>
                  </div>
                  <Badge variant={tp.v}>{ORIGENS.find(o => o.v === l.origem)?.r ?? l.origem}</Badge>
                  <div className="text-right" style={{ minWidth: 110 }}>
                    <p className="t-body num" style={{ margin: 0, fontWeight: 600, color: cor }}>{l.tipo === 'saida' ? '−' : l.tipo === 'entrada' ? '+' : ''}{fmt(l.quantidade)} {l.um ?? ''}</p>
                    {l.custo_total != null && Number(l.custo_total) !== 0 && <p className="t-caption" style={{ margin: 0 }}>{brl(l.custo_total)}</p>}
                  </div>
                </div>
              );
            })}
          </section>
        ))}
      </div>
    </div>
  );
};

export default Movimentacoes;
